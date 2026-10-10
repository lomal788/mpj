import * as THREE from 'three';
import type { CameraSnapshot } from '../camera';

export function writeThree(snapshot: CameraSnapshot, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera): void {
  const p = snapshot.projection;
  if ((p.type === 'perspective') !== (camera instanceof THREE.PerspectiveCamera)) throw new Error('camera-three: projection/camera type mismatch');
  camera.near = p.near;
  camera.far = p.far;
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = p.fovy * 180 / Math.PI;
    camera.aspect = p.aspect;
  } else {
    camera.top = p.fovy / 2;
    camera.bottom = -camera.top;
    camera.right = camera.top * p.aspect;
    camera.left = -camera.right;
  }
  const [x, y, z, t] = [snapshot.right, snapshot.up, snapshot.back, snapshot.position];
  const matrix = new THREE.Matrix4().set(x[0], y[0], z[0], t[0], x[1], y[1], z[1], t[1], x[2], y[2], z[2], t[2], 0, 0, 0, 1);
  if (camera.parent) {
    camera.parent.updateWorldMatrix(true, false);
    matrix.premultiply(camera.parent.matrixWorld.clone().invert());
  }
  matrix.decompose(camera.position, camera.quaternion, camera.scale);
  camera.up.set(0, 1, 0);
  camera.updateMatrix();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
