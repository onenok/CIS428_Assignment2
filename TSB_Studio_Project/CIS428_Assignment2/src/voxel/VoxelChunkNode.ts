/**
 * A single editable chunk of voxels.
 *
 * The node owns the voxel data and a `MeshNode` child that renders it. Writes go
 * through two layers on purpose:
 *
 *   setVoxelRaw()  - data only, no rebuild. Used while a drag gesture is in
 *                    progress so a 20-block drag does not rebuild 20 times.
 *   markDirty()    - flags the chunk for a rebuild on the next tick.
 *
 * The rebuild itself is throttled by `setTickInterval(0.05)`, so even a burst of
 * `markDirty()` calls collapses into at most 20 rebuilds per second.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { BLOCK_AIR } from './blockIds.js';
import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  chunkIndex,
  chunkInBounds,
  worldYToLocalY,
} from './chunkMath.js';
import { floorDiv, positiveMod } from './coords.js';
import {
  buildChunkGeometry,
  disposeChunkResources,
  measureQuadExtents,
  measureUvRange,
  type QuadExtents,
  type UvRange,
} from './chunkGeometry.js';
import { buildChunkPhysicsOptions } from './chunkCollision.js';
import { EMPTY, createVolume, type NeighborSampler, type VoxelVolume } from './mesher.js';

/** Rebuild interval in seconds. 0.05 = at most 20 rebuilds per second. */
export const CHUNK_REBUILD_INTERVAL = 0.05;

/** Looks up the chunk at a chunk coordinate, or `null` when there is none. */
export type ChunkLookup = (chunkX: number, chunkZ: number) => VoxelChunkNode | null;

export interface VoxelChunkNodeOptions extends ENGINE.SceneNodeOptions {
  /** Chunk coordinate along X. */
  chunkX?: number;
  /** Chunk coordinate along Z. */
  chunkZ?: number;
  /** Edge length of one voxel in metres. */
  voxelSize?: number;
  /** Materials indexed by material slot. */
  materials?: THREE.Material[];
}

@ENGINE.GameClass()
export class VoxelChunkNode extends ENGINE.SceneNode {
  /** Chunk coordinate along X. */
  public chunkX: number = 0;

  /** Chunk coordinate along Z. */
  public chunkZ: number = 0;

  /** Edge length of one voxel in metres. */
  public voxelSize: number = 1;

  private volume: VoxelVolume = createVolume(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z);
  private meshNode: ENGINE.MeshNode | null = null;
  private materials: THREE.Material[] = [];
  private dirty = false;
  private placedBlockCount = 0;

  /**
   * Indices of voxels the player filled in, so breaking generated terrain does
   * not make the count negative.
   *
   * A plain delta counter cannot tell "removed a block the player placed" from
   * "removed a block world generation made", and the second case drove the
   * reported count below zero — which in turn made the submit prompt read a
   * player who had built plenty as having built nothing.
   */
  private readonly playerFilledVoxels = new Set<number>();
  private rebuildCount = 0;
    /** Faces emitted by the last mesh build, kept for the runtime dump. */
    private lastFaceCount = 0;

    /**
     * Reaches into neighbouring chunks when this chunk's border faces are tested.
     *
     * A chunk cannot see its neighbours by itself, and without them every chunk
     * emits its entire outer shell. Two neighbours then draw the shared plane twice,
     * which is the thin vertical wall that z-fights wherever solid ground crosses a
     * chunk border.
     */
    private neighborLookup: ChunkLookup | null = null;

  public override initialize(options?: VoxelChunkNodeOptions): void {
    super.initialize(options);

    this.chunkX = options?.chunkX ?? this.chunkX;
    this.chunkZ = options?.chunkZ ?? this.chunkZ;
    this.voxelSize = options?.voxelSize ?? this.voxelSize;
    this.materials = options?.materials ?? this.materials;

    this.position.set(this.chunkX * CHUNK_SIZE_X * this.voxelSize, 0, this.chunkZ * CHUNK_SIZE_Z * this.voxelSize);
    this.scale.setScalar(this.voxelSize);

    this.setTickInterval(CHUNK_REBUILD_INTERVAL);
  }

  /** The voxel volume, for read-only inspection and bulk generation. */
  public getVolume(): VoxelVolume {
    return this.volume;
  }

  /** True when a rebuild is pending. */
  public get isDirty(): boolean {
    return this.dirty;
  }

  /** How many rebuilds have run. Used by tests and the stats overlay. */
  public get rebuilds(): number {
    return this.rebuildCount;
  }

    /**
     * Quads in the current mesh.
     *
     * A chunk whose face count collapses after an edit is the signature of a
     * mesher or geometry problem rather than a texture one, which is why the
     * runtime dump reports it next to the texture settings.
     */
    public get faceCount(): number {
      return this.lastFaceCount;
    }

  /** Number of non-air voxels the player placed (i.e. excluding generation). */
  public getPlacedBlockCount(): number {
    return this.placedBlockCount;
  }

  /** Reads a block id by world voxel coordinate. Out-of-chunk reads return air. */
  public getVoxelAtWorld(worldX: number, worldY: number, worldZ: number): number {
      const local = this.worldToLocalVoxel(worldX, worldY, worldZ);
      if (!local) return BLOCK_AIR;
      return this.volume.voxels[chunkIndex(local.x, local.y, local.z)];
    }

    /**
     * Writes a block id by world voxel coordinate without rebuilding.
     *
     * Returns `false` when the coordinate is outside this chunk.
     */
    public setVoxelRaw(worldX: number, worldY: number, worldZ: number, blockId: number): boolean {
      const local = this.worldToLocalVoxel(worldX, worldY, worldZ);
      if (!local) return false;

      const index = chunkIndex(local.x, local.y, local.z);
      const previous = this.volume.voxels[index];
      if (previous === blockId) return true;

      this.volume.voxels[index] = blockId;
            if (blockId === EMPTY) {
              // Only a voxel the player filled in counts as a removal. Breaking the
              // generated terrain leaves the placed count alone instead of going
              // negative.
              if (this.playerFilledVoxels.delete(index)) this.placedBlockCount--;
            } else if (!this.playerFilledVoxels.has(index)) {
              // Newly filled by the player, either over air or over generated terrain.
              this.playerFilledVoxels.add(index);
              this.placedBlockCount++;
            }

                  // An edit on a border voxel changes what the neighbour's shared plane looks
                  // like, so the neighbour has to be re-meshed too.
                  if (local.x === 0 || local.x === CHUNK_SIZE_X - 1
                    || local.z === 0 || local.z === CHUNK_SIZE_Z - 1) {
                    this.markNeighborsDirty();
                  }
      return true;
    }

    /**
     * Converts a world voxel coordinate to a local chunk coordinate.
     *
     * Uses floor division so negative world coordinates land in the correct chunk
     * instead of being truncated towards zero.
     */
    private worldToLocalVoxel(
      worldX: number,
      worldY: number,
      worldZ: number,
    ): { x: number; y: number; z: number } | null {
      const localX = positiveMod(worldX, CHUNK_SIZE_X);
      const localZ = positiveMod(worldZ, CHUNK_SIZE_Z);
      const localY = worldYToLocalY(worldY);
      if (!chunkInBounds(localX, localY, localZ)) return null;
      if (floorDiv(worldX, CHUNK_SIZE_X) !== this.chunkX) return null;
      if (floorDiv(worldZ, CHUNK_SIZE_Z) !== this.chunkZ) return null;
      return { x: localX, y: localY, z: localZ };
    }

  /** Flags the chunk for a rebuild on the next tick. */
  public markDirty(): void {
    this.dirty = true;
  }

  /** Replaces the material array. Triggers a rebuild. */
  public setMaterials(materials: THREE.Material[]): void {
    this.materials = materials;
    this.markDirty();
  }

    /**
         * The materials the mesh is actually rendering with.
     *
         * Deliberately different from {@link getRenderMaterials}: that one returns the
         * array this node was *given*, while the engine's `MeshNode` keeps its own copy
         * and its own getter warns that "the getter returns what was assigned, not the
         * loaded material". Reporting the requested array would describe the intent, not
         * the render — and an intent-versus-render mismatch is exactly the kind of thing
         * that makes a whole chunk draw as one flat colour.
     */
        public getRenderedMaterials(): readonly THREE.Material[] {
          const rendered = (this.meshNode?.mesh?.material ?? null) as
            | THREE.Material
            | THREE.Material[]
            | null;
          if (!rendered) {
            return [];
          }
          return Array.isArray(rendered) ? rendered : [rendered];
        }

        /**
         * How many materials the mesh rendered with, or `null` before the first build.
         *
         * `null` rather than `0`: a chunk that has not built its mesh yet is not
         * "rendering with zero materials", and reporting it as a mismatch would make
         * the render report warn about every chunk on the first frame.
         */
        public get renderedMaterialCount(): number | null {
          if (!this.meshNode) {
            return null;
          }
          return this.getRenderedMaterials().length;
        }

        /** True when the mesh renders with as many materials as the chunk was given. */
        public get hasMatchingMaterials(): boolean {
          const rendered = this.renderedMaterialCount;
          return rendered === null || rendered === this.materials.length;
    }

        /** UV extent of the mesh as it will be drawn, for the render report. */
        public get uvRange(): UvRange | null {
          return measureUvRange(this.meshNode?.geometry ?? null);
        }

        /** Larger of the mesh's maximum U and V, or `null` before the first build. */
        public get maxUv(): number | null {
          const range = this.uvRange;
          return range === null ? null : Math.max(range.maxU, range.maxV);
        }

        /** True when anything scaled the UVs past a single tile per face. */
        public get hasStretchedUvs(): boolean {
          const range = this.uvRange;
          return range !== null && (range.maxU > 1 + 1e-4 || range.maxV > 1 + 1e-4);
        }

                /** Quad edge lengths of the mesh as it will be drawn, for the render report. */
                public get quadExtents(): QuadExtents | null {
                  return measureQuadExtents(this.meshNode?.geometry ?? null, this.voxelSize);
                }

                /** Longest edge of any quad in the mesh, or `null` before the first build. */
                public get maxQuadEdge(): number | null {
                  return this.quadExtents?.maxEdge ?? null;
                }

        /**
         * Material slots this chunk was built with.
         *
         * three.js binds geometry group *i* to material *i*, so this must be at least
         * as large as the group count or some faces draw with a fallback material.
         */
        public get materialSlotCount(): number {
          return this.materials.length;
        }

        /**
         * Geometry groups in the current mesh, one per material slot that has faces.
         *
         * Reported next to {@link materialSlotCount} because a chunk rendered with a
         * single fallback material is the "the whole chunk is one flat colour"
         * symptom, and the two numbers are what tell the two causes apart.
         */
        public get geometryGroupCount(): number {
          return this.meshNode?.geometry?.groups.length ?? 0;
        }

  /**
       * Tells this chunk how to reach its neighbours.
       *
       * Must be set before the first mesh build, otherwise the border faces are baked
       * in and only disappear after an edit happens to rebuild the chunk.
       */
      public setNeighborLookup(lookup: ChunkLookup | null): void {
        this.neighborLookup = lookup;
      }

      /**
       * Builds the sampler handed to the mesher.
       *
       * Called with the volume's own local coordinates, including out-of-range ones
       * such as `x = -1` or `x = CHUNK_SIZE_X`. Those are translated to world voxel
       * coordinates, then into the neighbouring chunk's local coordinates, so the
       * mesher never has to know a chunk grid exists.
       *
       * Only the four horizontal directions can cross a border: a chunk spans the
       * whole world height, so `y` is always inside this chunk.
       */
      private createNeighborSampler(): NeighborSampler | undefined {
        const lookup = this.neighborLookup;
        if (!lookup) return undefined;

        return (x, y, z): number => {
          if (y < 0 || y >= CHUNK_SIZE_Y) return EMPTY;

          const worldX = this.chunkX * CHUNK_SIZE_X + x;
          const worldZ = this.chunkZ * CHUNK_SIZE_Z + z;
          const neighbor = lookup(floorDiv(worldX, CHUNK_SIZE_X), floorDiv(worldZ, CHUNK_SIZE_Z));
          if (!neighbor) return EMPTY;

          return neighbor.getVolume().voxels[
            chunkIndex(positiveMod(worldX, CHUNK_SIZE_X), y, positiveMod(worldZ, CHUNK_SIZE_Z))
          ];
        };
      }

      /** Flags the chunks touching this one, so their shared border is re-meshed. */
      private markNeighborsDirty(): void {
        const lookup = this.neighborLookup;
        if (!lookup) return;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            const neighbor = lookup(this.chunkX + dx, this.chunkZ + dz);
            if (neighbor && neighbor !== this) neighbor.markDirty();
          }
        }
      }

    /** Rebuilds immediately, ignoring the throttle. */
  public rebuildMesh(): void {
    this.dirty = false;
    this.rebuildCount++;

      const result = buildChunkGeometry(this.volume, { x: 0, y: 0, z: 0 }, this.createNeighborSampler());
    this.lastFaceCount = result.faceCount;

    if (!this.meshNode) {
      this.meshNode = ENGINE.MeshNode.create({
        name: 'ChunkMesh',
        geometry: result.geometry,
        material: this.materials.length > 0 ? this.materials : new THREE.MeshLambertMaterial(),
      });
      this.add(this.meshNode);
        this.rebuildCollision();
        return;
      }

      const previousGeometry = this.meshNode.geometry;
      this.meshNode.geometry = result.geometry;
      previousGeometry.dispose();
      this.rebuildCollision();
    }

    /**
     * Replaces the chunk's collider with one matching the current voxels.
     *
     * The mesh alone is not walkable: without this the player falls through the
     * ground and the build raycast has nothing to hit. The collider is rebuilt
     * alongside the mesh so an edited block is immediately solid.
     */
    private rebuildCollision(): void {
      const mesh = this.meshNode;
      if (!mesh) return;
      mesh.overridePhysicsOptions(buildChunkPhysicsOptions(this.volume));
    }

  public override tickPostPhysics(_deltaTime: number): void {
    if (this.dirty) this.rebuildMesh();
  }

  public override dispose(): void {
    disposeChunkResources(this.meshNode?.geometry ?? null, this.materials);
    this.meshNode = null;
    this.materials = [];
    super.dispose();
  }
}
