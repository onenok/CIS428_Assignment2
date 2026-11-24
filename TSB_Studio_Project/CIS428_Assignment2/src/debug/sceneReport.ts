/**
 * Scene-wide render state, for telling "our geometry is wrong" apart from "something
 * else is drawn in front of it".
 *
 * A procedural sky, a scene environment map and a fog colour can each put a flat wash
 * of colour over a correct scene, and none of them show up as a chunk-sized object in
 * the drawable list. They also change at different times: a sky recaptures its
 * environment map shortly after play begins, which is why the screen can be correct
 * for a moment and then not.
 */

import * as THREE from 'three';

import type { SceneReport } from './renderReport.js';

function describeColor(color: THREE.Color | null | undefined): string {
  return color ? `#${color.getHexString()}` : '-';
}

function describeBackground(background: THREE.Scene['background']): string {
  if (!background) {
    return 'none';
  }
  if (background instanceof THREE.Color) {
    return describeColor(background);
  }
  if (background instanceof THREE.Texture) {
      return 'texture';
  }
  return 'other';
}

function describeEnvironment(environment: THREE.Scene['environment']): string {
  if (!environment) {
    return 'none';
  }
  // The version counter is the useful part: it changes when the sky recaptures, so two
  // dumps taken either side of the switch differ here even though nothing else moved.
  const version = (environment as THREE.Texture).version;
  return `texture(v${version})`;
}

function describeFog(scene: THREE.Scene): string {
  const fog = scene.fog;
  if (!fog) {
    return 'none';
  }
  const color = describeColor(fog.color);
  // `Fog` carries near/far; `FogExp2` has only a density, so the two are reported
  // separately rather than through a union field that only one of them has.
  if (fog instanceof THREE.FogExp2) {
    return `FogExp2 ${color} density=${fog.density}`;
  }
  return `Fog ${color} near=${fog.near} far=${fog.far}`;
}

/** Reads the clear colour off the engine renderer, tolerating a renderer that is not WebGL. */
function describeClearColor(renderer: unknown): string {
  const webGl = (renderer as { asWebGL?: () => unknown } | null)?.asWebGL?.();
  const getClearColor = (webGl as { getClearColor?: (target: THREE.Color) => THREE.Color } | null | undefined)?.getClearColor;
  if (typeof getClearColor !== 'function') {
    return 'unknown';
  }
  const target = new THREE.Color();
  getClearColor.call(webGl, target);
  return describeColor(target);
}

/** Collects the scene state that can put a flat wash of colour over correct geometry. */
export function collectSceneReport(
  scene: THREE.Scene | null | undefined,
  camera: THREE.Camera | null | undefined,
  renderer: unknown,
): SceneReport {
  if (!scene) {
    return { background: 'no scene' };
  }

  const perspective = camera instanceof THREE.PerspectiveCamera ? camera : null;
  return {
    background: describeBackground(scene.background),
    environment: describeEnvironment(scene.environment),
    fog: describeFog(scene),
    clearColor: describeClearColor(renderer),
    near: perspective?.near,
    far: perspective?.far,
    fov: perspective?.fov,
  };
}