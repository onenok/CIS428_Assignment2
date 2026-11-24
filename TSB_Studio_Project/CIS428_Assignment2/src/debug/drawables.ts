/**
 * Enumerates what the renderer is actually told to draw.
 *
 * "The ground collapsed into one chunk" is normally a texture question, but it can
 * also be a geometry question: a single quad stretched across the world carries one
 * tile of texture and reads exactly like flat ground. Sorting the two apart needs
 * the world size of every submitted object, which is what this collects.
 *
 * Detection cannot rely on `constructor.name`, and cannot rely only on three.js's
 * `isMesh` either. The engine has two shapes for the same node:
 *
 *   - `FeatureFlags.COLLAPSE_MESH_COMPONENT` off: the node parents a real
 *     `THREE.Mesh`, so the graph contains a `Mesh` child.
 *   - flag on (engine 19's default): the node *is* the drawable — its `THREE.Mesh`
 *     is transient and never parented — and `node.mesh` is the only way to reach it.
 *
 * A name check picks up the first shape only, which is how a report ended up saying
 * `drawables (0)` while 25 chunks were on screen. Reaching through `node.mesh` first,
 * then falling back to the node itself, covers both.
 */

import * as THREE from 'three';

import type { DrawablePathReport, DrawableReport } from './renderReport.js';

/**
 * How deep the walk goes.
 *
 * The scene is two levels deep (world -> chunk -> mesh), so this only guards
 * against a malformed or cyclic graph rather than a legitimate hierarchy.
 */
const MAX_DEPTH = 8;

/** The slice of an engine node this reads; keeps the engine out of the import graph. */
interface MeshBacked {
  readonly mesh?: unknown;
  readonly isMesh?: boolean;
  readonly isLine?: boolean;
  readonly isPoints?: boolean;
}

function drawableKind(target: unknown): string {
  if (!target) return '';
  const tagged = target as MeshBacked;
  if (tagged.isMesh) return 'Mesh';
  if (tagged.isLine) return 'Line';
  if (tagged.isPoints) return 'Points';
  return '';
}

/** What carries the vertices for a node, and which object was measured. */
interface Holder {
  readonly kind: string;
  readonly geometry: THREE.BufferGeometry | null;
  /**
   * The object that owns the geometry.
   *
   * When the vertices came from `node.mesh`, the walk must not descend into that same
   * mesh as a child: with the collapse flag off it *is* a child, and reporting it
   * again doubles every row and loses the chunk name in the process.
   */
  readonly target: THREE.Object3D;
}

/** The drawable behind this node, or `null` when it has nothing to draw. */
function geometryHolder(node: THREE.Object3D): Holder | null {
  const mesh = (node as THREE.Object3D & MeshBacked).mesh as THREE.Object3D | undefined;
  const meshKind = drawableKind(mesh);
  if (mesh && meshKind) {
    return {
      kind: meshKind,
      geometry: ((mesh as THREE.Mesh).geometry as THREE.BufferGeometry) ?? null,
      target: mesh,
    };
  }
  const selfKind = drawableKind(node);
  if (selfKind) {
    return {
      kind: selfKind,
      geometry: ((node as THREE.Mesh).geometry as THREE.BufferGeometry) ?? null,
      target: node,
    };
  }
  return null;
}

/** Compact one-line material summary; the fields that decide what covers the screen. */
function describeDrawMaterial(target: THREE.Object3D): string {
  const material = (target as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  if (!material) {
    return '-';
  }
  if (Array.isArray(material)) {
    const unique = [...new Set(material.map((entry) => entry.type || entry.constructor.name))];
    return `${material.length}x[${unique.join(',')}]`;
  }
  return describeOneMaterial(material);
}

function describeOneMaterial(material: THREE.Material): string {
  const bits: string[] = [material.type || material.constructor.name];

  const opaque = material as THREE.Material & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
    lightMap?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
  };
  if (opaque.color) {
    bits.push(`#${opaque.color.getHexString()}`);
  }

  bits.push(material.side === THREE.FrontSide ? 'front' : material.side === THREE.BackSide ? 'back' : 'double');
  // Depth state is the discriminator that matters: an overlay that writes depth hides
  // everything drawn after it, however small its own texture is.
  bits.push(material.depthWrite ? 'depthWrite' : 'noDepthWrite');
  bits.push(material.depthTest ? 'depthTest' : 'noDepthTest');
  if (material.transparent) {
    bits.push('transparent');
  }
  if (material.opacity !== 1) {
    bits.push(`opacity=${material.opacity}`);
  }

  bits.push(`map=${describeMap(opaque.map)}`);
  if (opaque.lightMap) {
    bits.push(`lightMap=${describeMap(opaque.lightMap)}`);
  }
  return bits.join(' ');
}

function describeMap(texture: THREE.Texture | null | undefined): string {
  if (!texture) {
    return 'none';
  }
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? '?';
  const height = image?.height ?? '?';
  return `${width}x${height}`;
}

/**
 * Walks the given roots and describes every renderable object beneath them.
 *
 * `owner` is the name of the nearest named ancestor, because engine chunks all name
 * their mesh `ChunkMesh` — the mesh name alone cannot say which chunk it belongs to.
 *
 * Size comes from the geometry's own bounding box pushed through the node's world
 * matrix rather than from `Box3.setFromObject`: in the collapsed shape the mesh is
 * outside the graph, so measuring the owner would miss the geometry entirely.
 */
export function collectDrawableReports(
  roots: readonly THREE.Object3D[],
  pathOf?: (object: THREE.Object3D) => DrawablePathReport | null,
): DrawableReport[] {
  const rows: DrawableReport[] = [];
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();

  const visit = (node: THREE.Object3D, owner: string, depth: number): void => {
    if (depth > MAX_DEPTH) {
      return;
    }

    const holder = geometryHolder(node);
    if (holder) {
      const geometry = holder.geometry;
      const positions = geometry?.getAttribute('position');
      if (geometry && positions) {
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox();
        }
      }

      if (geometry?.boundingBox) {
        holder.target.updateWorldMatrix(true, false);
        box.copy(geometry.boundingBox).applyMatrix4(holder.target.matrixWorld);
        box.getSize(size);
        box.getCenter(centre);
      } else {
        box.setFromObject(holder.target);
        if (box.isEmpty()) {
          size.set(0, 0, 0);
          centre.set(0, 0, 0);
        } else {
          box.getSize(size);
          box.getCenter(centre);
        }
      }

      rows.push({
        name: node.name,
        kind: holder.kind,
        owner: owner || undefined,
        sizeX: size.x,
        sizeY: size.y,
        sizeZ: size.z,
        centreX: centre.x,
        centreY: centre.y,
        centreZ: centre.z,
        visible: node.visible,
              vertices: geometry?.getAttribute('position')?.count ?? 0,
              indices: geometry?.index?.count ?? 0,
              material: describeDrawMaterial(holder.target),
                            // Read from the object the pipeline was given, which is the mesh in the
                            // collapsed shape and the holder itself otherwise.
                            path: pathOf ? pathOf(holder.target) : null,
      });
    }

    for (const child of node.children) {
      if (holder && child !== node && child === holder.target) {
        continue;
      }
      visit(child, node.name || owner, depth + 1);
    }
  };

  for (const root of roots) {
    visit(root, '', 0);
  }
  return rows;
}