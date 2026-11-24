/**
 * Layer 2 — selection outline and placement preview.
 *
 * Covers U-U-08 (selection box), U-U-09 (placement preview) and U-U-10 (the
 * outline turns red outside the build region).
 */

import * as THREE from 'three';

import { assertClose, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { PlacementPreview, PREVIEW_OPACITY } from '../../src/build/PlacementPreview.js';
import {
  SELECTION_COLOR_INVALID,
  SELECTION_COLOR_VALID,
  SelectionBox,
} from '../../src/build/SelectionBox.js';
import { createHeadlessWorld } from '../world/headlessWorld.js';

describe('SelectionBox: geometry', () => {
  it('builds a line segments child', async () => {
    const handle = await createHeadlessWorld();
    try {
      const box = SelectionBox.create({ name: 'Selection' });
      const lines = box.getNodes(THREE.LineSegments);
      assertEqual(lines.length, 1);
    } finally {
      handle.dispose();
    }
  });

  it('draws twelve edges', async () => {
    const handle = await createHeadlessWorld();
    try {
      const box = SelectionBox.create({ name: 'Selection' });
      const lines = box.getNodes(THREE.LineSegments)[0];
      const position = lines.geometry.getAttribute('position');
      assertEqual(position.count, 24, 'twelve edges = 24 vertices');
    } finally {
      handle.dispose();
    }
  });

  it('starts hidden', async () => {
    const handle = await createHeadlessWorld();
    try {
      assertTrue(SelectionBox.create({ name: 'Selection' }).isHidden());
    } finally {
      handle.dispose();
    }
  });
});

describe('SelectionBox: positioning', () => {
  it('centres on the voxel cell', async () => {
    const handle = await createHeadlessWorld();
    try {
      const box = SelectionBox.create({ name: 'Selection' });
      box.showAt({ x: 2, y: 3, z: 4 });
      assertClose(box.position.x, 2.5, 1e-6);
      assertClose(box.position.y, 3.5, 1e-6);
      assertClose(box.position.z, 4.5, 1e-6);
    } finally {
      handle.dispose();
    }
  });

  it('shows itself when moved', async () => {
    const handle = await createHeadlessWorld();
    try {
      const box = SelectionBox.create({ name: 'Selection' });
      box.showAt({ x: 0, y: 0, z: 0 });
      assertTrue(!box.isHidden());
    } finally {
      handle.dispose();
    }
  });

  it('hides on demand', async () => {
    const handle = await createHeadlessWorld();
    try {
      const box = SelectionBox.create({ name: 'Selection' });
      box.showAt({ x: 0, y: 0, z: 0 });
      box.hide();
      assertTrue(box.isHidden());
    } finally {
      handle.dispose();
    }
  });

  it('handles negative cells', async () => {
    const handle = await createHeadlessWorld();
    try {
      const box = SelectionBox.create({ name: 'Selection' });
      box.showAt({ x: -1, y: -2, z: -3 });
      assertClose(box.position.x, -0.5, 1e-6);
      assertClose(box.position.y, -1.5, 1e-6);
    } finally {
      handle.dispose();
    }
  });
});

describe('SelectionBox: validity colour', () => {
  it('starts valid', async () => {
    const handle = await createHeadlessWorld();
    try {
      assertTrue(SelectionBox.create({ name: 'Selection' }).isValid);
    } finally {
      handle.dispose();
    }
  });

  it('switches to the invalid colour', async () => {
    const handle = await createHeadlessWorld();
    try {
      const box = SelectionBox.create({ name: 'Selection' });
      box.showAt({ x: 0, y: 0, z: 0 }, false);
      assertTrue(!box.isValid);
      const lines = box.getNodes(THREE.LineSegments)[0];
      const material = lines.material as THREE.LineBasicMaterial;
      assertEqual(material.color.getHex(), SELECTION_COLOR_INVALID);
    } finally {
      handle.dispose();
    }
  });

  it('switches back to the valid colour', async () => {
    const handle = await createHeadlessWorld();
    try {
      const box = SelectionBox.create({ name: 'Selection' });
      box.showAt({ x: 0, y: 0, z: 0 }, false);
      box.setValid(true);
      const lines = box.getNodes(THREE.LineSegments)[0];
      const material = lines.material as THREE.LineBasicMaterial;
      assertEqual(material.color.getHex(), SELECTION_COLOR_VALID);
    } finally {
      handle.dispose();
    }
  });
});

describe('PlacementPreview: appearance', () => {
  it('builds a mesh child', async () => {
    const handle = await createHeadlessWorld();
    try {
      const preview = PlacementPreview.create({ name: 'Preview' });
      assertEqual(preview.getNodes(THREE.Mesh).length, 1);
    } finally {
      handle.dispose();
    }
  });

  it('is half transparent', async () => {
    const handle = await createHeadlessWorld();
    try {
      const preview = PlacementPreview.create({ name: 'Preview' });
      const mesh = preview.getNodes(THREE.Mesh)[0];
      const material = mesh.material as THREE.MeshLambertMaterial;
      assertEqual(material.opacity, PREVIEW_OPACITY);
      assertEqual(PREVIEW_OPACITY, 0.5);
    } finally {
      handle.dispose();
    }
  });

  it('does not write depth', async () => {
    const handle = await createHeadlessWorld();
    try {
      const preview = PlacementPreview.create({ name: 'Preview' });
      const mesh = preview.getNodes(THREE.Mesh)[0];
      assertTrue(!(mesh.material as THREE.MeshLambertMaterial).depthWrite);
    } finally {
      handle.dispose();
    }
  });

  it('is transparent', async () => {
    const handle = await createHeadlessWorld();
    try {
      const preview = PlacementPreview.create({ name: 'Preview' });
      const mesh = preview.getNodes(THREE.Mesh)[0];
      assertTrue((mesh.material as THREE.MeshLambertMaterial).transparent);
    } finally {
      handle.dispose();
    }
  });

  it('starts hidden', async () => {
    const handle = await createHeadlessWorld();
    try {
      assertTrue(PlacementPreview.create({ name: 'Preview' }).isHidden());
    } finally {
      handle.dispose();
    }
  });
});

describe('PlacementPreview: positioning', () => {
  it('centres on the voxel cell', async () => {
    const handle = await createHeadlessWorld();
    try {
      const preview = PlacementPreview.create({ name: 'Preview' });
      preview.showAt({ x: 1, y: 2, z: 3 }, null);
      assertClose(preview.position.x, 1.5, 1e-6);
      assertClose(preview.position.y, 2.5, 1e-6);
      assertClose(preview.position.z, 3.5, 1e-6);
    } finally {
      handle.dispose();
    }
  });

  it('shows itself', async () => {
    const handle = await createHeadlessWorld();
    try {
      const preview = PlacementPreview.create({ name: 'Preview' });
      preview.showAt({ x: 0, y: 0, z: 0 }, null);
      assertTrue(preview.isShowing);
    } finally {
      handle.dispose();
    }
  });

  it('applies the block texture', async () => {
    const handle = await createHeadlessWorld();
    try {
      const preview = PlacementPreview.create({ name: 'Preview' });
      const texture = new THREE.Texture();
      preview.showAt({ x: 0, y: 0, z: 0 }, texture);
      const mesh = preview.getNodes(THREE.Mesh)[0];
      assertTrue((mesh.material as THREE.MeshLambertMaterial).map === texture);
    } finally {
      handle.dispose();
    }
  });

  it('hides on demand', async () => {
    const handle = await createHeadlessWorld();
    try {
      const preview = PlacementPreview.create({ name: 'Preview' });
      preview.showAt({ x: 0, y: 0, z: 0 }, null);
      preview.hide();
      assertTrue(!preview.isShowing);
    } finally {
      handle.dispose();
    }
  });
});