/**
 * Placement preview.
 *
 * A translucent copy of the block that would be placed, shown only in god view.
 * First person does not get a preview because the crosshair already marks the
 * target and a ghost block would obscure the view.
 *
 * The preview uses the real block material so the player sees the actual texture,
 * with `depthWrite = false` so overlapping previews do not fight each other and
 * `opacity = 0.5` so the world stays readable through it.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import type { VoxelCell } from './placement.js';

/** Opacity of the ghost block. */
export const PREVIEW_OPACITY = 0.5;

export interface PlacementPreviewOptions extends ENGINE.SceneNodeOptions {
  /** Edge length of one voxel in metres. */
  voxelSize?: number;
}

@ENGINE.GameClass()
export class PlacementPreview extends ENGINE.SceneNode {
  /** Edge length of one voxel in metres. */
  public voxelSize: number = 1;

  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshLambertMaterial | null = null;

  public override initialize(options?: PlacementPreviewOptions): void {
    super.initialize(options);
    this.voxelSize = options?.voxelSize ?? this.voxelSize;

    this.material = new THREE.MeshLambertMaterial({
      transparent: true,
      opacity: PREVIEW_OPACITY,
      depthWrite: false,
    });

    const geometry = new THREE.BoxGeometry(this.voxelSize, this.voxelSize, this.voxelSize);
    this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.name = 'PreviewMesh';
        this.add(this.mesh);

        this.visible = false;
  }

  /** Shows the preview at a cell, using the given texture. */
  public showAt(cell: VoxelCell, texture: THREE.Texture | null): void {
    const half = this.voxelSize / 2;
    this.position.set(cell.x * this.voxelSize + half, cell.y * this.voxelSize + half, cell.z * this.voxelSize + half);

    if (this.material) {
      this.material.map = texture;
      this.material.needsUpdate = true;
    }

        this.visible = true;
  }

  /** Hides the preview. */
  public hide(): void {
        this.visible = false;
  }

  /** True when the preview is currently drawn. */
  public get isShowing(): boolean {
        return this.visible;
  }

  public override dispose(): void {
    this.mesh?.geometry.dispose();
    this.material?.dispose();
    this.mesh = null;
    this.material = null;
    super.dispose();
  }
}