/**
 * Build controller.
 *
 * Owns the "what does the player's cursor point at" logic and the write path
 * into the chunk grid. Two camera modes need different ray sources:
 *
 *   first person - ray from the pawn camera through the screen centre
 *   god view     - ray from the top-down camera through the mouse position
 *
 * Both end up as a `PhysicsRaycastOptions`, so the rest of the pipeline is
 * shared.
 *
 * Writes are batched: a drag gesture calls `beginBatch()`, writes many cells
 * with `place()` / `break()`, then `endBatch()` rebuilds each touched
 * chunk exactly once.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { BLOCK_AIR, isBreakableBlock } from '../voxel/blockIds.js';
import { VoxelChunkNode } from '../voxel/VoxelChunkNode.js';
import { findChunkForVoxel } from '../world/WorldGenerator.js';
import {
  breakCellFromHit,
  checkPlacement,
  placementCellFromHit,
  shouldWritePlacement,
  type BuildBounds,
  type HitLike,
  type PlaceFailureReason,
  type PlaceMode,
  type VoxelCell,
} from './placement.js';

/** Result of a single placement attempt. */
export type PlaceResult =
  | { readonly ok: true; readonly cell: VoxelCell }
  | { readonly ok: false; readonly reason: PlaceFailureReason | 'skipped' | 'protected' };

/** Result of a single break attempt. */
export type BreakResult =
  | { readonly ok: true; readonly cell: VoxelCell; readonly previousBlockId: number }
  | { readonly ok: false; readonly reason: PlaceFailureReason | 'empty' | 'protected' };

export interface BuildControllerOptions {
  /** Chunk lookup, keyed by `chunkX,chunkZ`. */
  readonly chunks: ReadonlyMap<string, VoxelChunkNode>;
  /** Editable region. */
  readonly bounds: BuildBounds;
  /** Physics engine used for raycasts. */
  readonly physics: ENGINE.IPhysicsEngine;
  /** Maximum reach in metres. */
  readonly reach?: number;
}

/** Default reach in metres. Matches a comfortable first-person arm's length. */
export const DEFAULT_BUILD_REACH = 8;

export class BuildController {
  private readonly chunks: ReadonlyMap<string, VoxelChunkNode>;
  private readonly bounds: BuildBounds;
  private readonly physics: ENGINE.IPhysicsEngine;
  private readonly reach: number;

  private placeMode: PlaceMode = 'replace';
  private batchDepth = 0;
  private readonly dirtyChunks = new Set<VoxelChunkNode>();

  public constructor(options: BuildControllerOptions) {
    this.chunks = options.chunks;
    this.bounds = options.bounds;
    this.physics = options.physics;
    this.reach = options.reach ?? DEFAULT_BUILD_REACH;
  }

  /** Current place mode. */
  public getPlaceMode(): PlaceMode {
    return this.placeMode;
  }

  /** Changes how occupied cells are treated. */
  public setPlaceMode(mode: PlaceMode): void {
    this.placeMode = mode;
  }

  /** True while a drag gesture is in progress. */
  public get isBatching(): boolean {
    return this.batchDepth > 0;
  }

  /**
   * Raycasts from a camera through a normalised screen position.
   *
   * `ndc` is in clip space: (-1,-1) bottom-left, (1,1) top-right. The screen
   * centre is (0, 0), which is what first person uses.
   *
   * `ignoredRootNodes` excludes an entire subtree, which is what the player
   * pawn needs: its collision capsule is a child of the pawn, so ignoring the
   * capsule node alone would still leave the pawn's own body in the way.
   */
  public raycastFromCamera(
    camera: THREE.Camera,
    ndc: { x: number; y: number } = { x: 0, y: 0 },
    ignoredNodes: readonly ENGINE.SceneNode[] = [],
    ignoredRootNodes: readonly ENGINE.SceneNode[] = [],
  ): ENGINE.PhysicsQueryHit | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);

    return this.physics.raycast({
      origin: raycaster.ray.origin.clone(),
      direction: raycaster.ray.direction.clone(),
      maxDistance: this.reach,
      ignoredNodes: [...ignoredNodes],
      ignoredRootNodes: [...ignoredRootNodes],
    });
  }

  /**
   * Whether a raycast hit landed on a block rather than on some other collider.
   *
   * The physics raycast returns the nearest collider of any kind, so a pawn or
   * an NPC standing between the camera and a block wins the hit. Minecraft
   * behaves the same way: `GameRenderer.pick()` compares the block hit against
   * the entity hit and keeps the nearer one, and the block outline is only drawn
   * when the block won. So a non-block hit must suppress targeting rather than
   * be skipped over.
   *
   * A chunk's collider lives on its `ChunkMesh` child, so the hit node is the
   * mesh and the owning chunk is an ancestor.
   */
  public isBlockHit(hit: ENGINE.PhysicsQueryHit): boolean {
    return this.findOwningChunk(hit.hitNode) !== null;
  }

  /** The chunk that owns a hit node, or null when the hit is not a block. */
  public findOwningChunk(hitNode: ENGINE.SceneNode | null): VoxelChunkNode | null {
    let current: THREE.Object3D | null = hitNode;
    while (current) {
      if (current instanceof VoxelChunkNode) return current;
      current = current.parent;
    }
    return null;
  }

  /** The cell a placement would occupy for a given hit. */
  public placementCell(hit: HitLike): VoxelCell {
    return placementCellFromHit(hit);
  }

  /** The cell a break would remove for a given hit. */
  public breakCell(hit: HitLike): VoxelCell {
    return breakCellFromHit(hit);
  }

  /** Places one block. Marks the chunk dirty unless a batch is open. */
  public place(cell: VoxelCell, blockId: number): PlaceResult {
    const check = checkPlacement(this.bounds, cell);
    if (!check.ok) return { ok: false, reason: check.reason };

    const chunk = findChunkForVoxel(this.chunks, cell.x, cell.z);
    if (!chunk) return { ok: false, reason: 'outOfBounds' };

    const previousBlockId = chunk.getVoxelAtWorld(cell.x, cell.y, cell.z);
        if (!isBreakableBlock(previousBlockId)) return { ok: false, reason: 'protected' };

        const occupied = previousBlockId !== BLOCK_AIR;
    if (!shouldWritePlacement(this.placeMode, occupied)) {
      return { ok: false, reason: 'skipped' };
    }

    if (!chunk.setVoxelRaw(cell.x, cell.y, cell.z, blockId)) {
      return { ok: false, reason: 'outOfBounds' };
    }

    this.touch(chunk);
    return { ok: true, cell };
  }

  /** Breaks one block. Marks the chunk dirty unless a batch is open. */
  public break(cell: VoxelCell): BreakResult {
    const check = checkPlacement(this.bounds, cell);
    if (!check.ok) return { ok: false, reason: check.reason };

    const chunk = findChunkForVoxel(this.chunks, cell.x, cell.z);
    if (!chunk) return { ok: false, reason: 'outOfBounds' };

    const previousBlockId = chunk.getVoxelAtWorld(cell.x, cell.y, cell.z);
    if (previousBlockId === BLOCK_AIR) return { ok: false, reason: 'empty' };
        if (!isBreakableBlock(previousBlockId)) return { ok: false, reason: 'protected' };

    if (!chunk.setVoxelRaw(cell.x, cell.y, cell.z, BLOCK_AIR)) {
      return { ok: false, reason: 'outOfBounds' };
    }

    this.touch(chunk);
    return { ok: true, cell, previousBlockId };
  }

  /** Reads the block id at a cell. Returns air outside the grid. */
  public readBlock(cell: VoxelCell): number {
    const chunk = findChunkForVoxel(this.chunks, cell.x, cell.z);
    if (!chunk) return BLOCK_AIR;
    return chunk.getVoxelAtWorld(cell.x, cell.y, cell.z);
  }

  /**
   * Opens a batch.
   *
   * While a batch is open, writes only touch voxel data; the rebuild happens
   * once in `endBatch()`. This is what keeps a 20-block drag from rebuilding 20
   * times.
   */
  public beginBatch(): void {
    this.batchDepth++;
  }

  /** Closes a batch and rebuilds every chunk that changed. */
  public endBatch(): void {
    if (this.batchDepth === 0) return;
    this.batchDepth--;
    if (this.batchDepth > 0) return;

    for (const chunk of this.dirtyChunks) chunk.markDirty();
    this.dirtyChunks.clear();
  }

  /** Total placed blocks across every editable chunk. */
  public getPlacedBlockCount(): number {
    let total = 0;
    for (const chunk of this.chunks.values()) total += chunk.getPlacedBlockCount();
    return total;
  }

  /** Flags a chunk for rebuild, or defers it until the batch closes. */
  private touch(chunk: VoxelChunkNode): void {
    if (this.batchDepth > 0) {
      this.dirtyChunks.add(chunk);
      return;
    }
    chunk.markDirty();
  }

    /**
     * Flags the chunk owning `cell` for rebuild.
     *
     * Undo and redo write voxel data directly through `setVoxelRaw()`, which does
     * not rebuild anything on its own. Without this the data changes but the mesh
     * and collider keep showing the old blocks, so the edit looks like it did
     * nothing. Routing through `touch()` keeps the batch behaviour consistent with
     * `place()` and `break()`.
     */
    public markChunkDirty(cell: VoxelCell): void {
      const chunk = findChunkForVoxel(this.chunks, cell.x, cell.z);
      if (chunk) this.touch(chunk);
    }
  }
