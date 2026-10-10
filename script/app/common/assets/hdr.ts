import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { Assets } from './index';

export async function hdrTexture(assets: Assets, path: string): Promise<THREE.DataTexture> {
  const bytes = await assets.bytes(path);
  if (assets.disposed) throw new Error(`Assets disposed: ${assets.dir}`);
  const data = new HDRLoader().parse(bytes);
  const texture = new THREE.DataTexture(data.data, data.width, data.height, THREE.RGBAFormat, data.type);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false; texture.flipY = true; texture.needsUpdate = true;
  return texture;
}

export async function hdrCube(assets: Assets, paths: string[]): Promise<THREE.CubeTexture> {
  if (paths.length !== 6) throw new Error('HDR cube needs six faces');
  const data = await Promise.all(paths.map(path => assets.bytes(path)));
  if (assets.disposed) throw new Error(`Assets disposed: ${assets.dir}`);
  const parser = new HDRLoader();
  const faces = data.map(bytes => {
    const value = parser.parse(bytes);
    const face = new THREE.DataTexture(value.data, value.width, value.height, THREE.RGBAFormat, value.type);
    face.colorSpace = THREE.LinearSRGBColorSpace;
    face.minFilter = face.magFilter = THREE.LinearFilter; face.generateMipmaps = false;
    return face;
  });
  const cube = new THREE.CubeTexture(faces);
  cube.type = THREE.HalfFloatType; cube.colorSpace = THREE.LinearSRGBColorSpace;
  cube.minFilter = cube.magFilter = THREE.LinearFilter; cube.generateMipmaps = false; cube.needsUpdate = true;
  return cube;
}
