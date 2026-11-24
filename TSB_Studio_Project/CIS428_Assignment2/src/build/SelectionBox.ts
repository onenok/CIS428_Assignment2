/**
 * Block selection outline.
 *
 * A wireframe cube drawn around the cell the cursor is over. Built from
 * `EdgesGeometry` rather than `BoxGeometry` so only the twelve edges are drawn,
 * and from `LineSegments` rather than `LineLoop` so the cube can be rebuilt
 * without reallocating.
 *
 * The outline turns red when the target is outside the editable region, which is
 * the only feedback the player gets that a placement would be rejected.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import type { VoxelCell } from './placement.js';

/** Colour when the target is buildable. */
export const SELECTION_COLOR_VALID = 0xffffff;

/** Colour when the target is outside the editable region. */
export const SELECTION_COLOR_INVALID = 0xff3b30;

/** Slightly larger than a voxel so the outline does not z-fight with the face. */
const OUTLINE_SCALE = 1.002;

export interface SelectionBoxOptions extends ENGINE.SceneNodeOptions {
  /** Edge length of one voxel in metres. */
  voxelSize?: number;
}

@ENGINE.GameClass()
export class SelectionBox extends ENGINE.SceneNode {
  /** Edge length of one voxel in metres. */
  public voxelSize: number = 1;

  private lines: THREE.LineSegments | null = null;
  private material: THREE.LineBasicMaterial | null = null;
  private valid = true;

  public override initialize(options?: SelectionBoxOptions): void {
    super.initialize(options);
    this.voxelSize = options?.voxelSize ?? this.voxelSize;

    this.material = new THREE.LineBasicMaterial({
      color: SELECTION_COLOR_VALID,
      depthTest: true,
      transparent: true,
      opacity: 0.9,
    });

    const box = new THREE.BoxGeometry(this.voxelSize, this.voxelSize, this.voxelSize);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();

    this.lines = new THREE.LineSegments(edges, this.material);
        this.lines.name = 'SelectionOutline';
        this.lines.scale.setScalar(OUTLINE_SCALE);
        this.add(this.lines);

        this.visible = false;
  }

  /** True when the outline is currently drawn in the valid colour. */
  public get isValid(): boolean {
    return this.valid;
  }

  /** Moves the outline to a voxel cell and shows it. */
  public showAt(cell: VoxelCell, valid = true): void {
    const half = this.voxelSize / 2;
    this.position.set(cell.x * this.voxelSize + half, cell.y * this.voxelSize + half, cell.z * this.voxelSize + half);
    this.setValid(valid);
      this.visible = true;
  }

  /** Hides the outline. */
  public hide(): void {
      this.visible = false;
  }

  /** Switches between the valid and invalid colours. */
  public setValid(valid: boolean): void {
    if (this.valid === valid) return;
    this.valid = valid;
    if (this.material) {
      this.material.color.setHex(valid ? SELECTION_COLOR_VALID : SELECTION_COLOR_INVALID);
    }
  }

  public override dispose(): void {
    this.lines?.geometry.dispose();
    this.material?.dispose();
    this.lines = null;
    this.material = null;
    super.dispose();
  }
}