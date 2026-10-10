import type * as THREE from 'three';
import { cameraSnapshot, sampleBakedApprox, type BakedCameraClip, type CameraMatrix, type CameraNumericOps, type CameraPass, type CameraSample } from '@game/lib/camera';
import { writeThree } from '@game/lib/camera-three';

export const webCameraMathApprox: CameraNumericOps = {
  sinCos: radians => [Math.sin(radians), Math.cos(radians)],
  sqrt: Math.sqrt,
};

export interface CameraApplyOptions extends CameraPass {
  minNearApprox?: number;
  entityWorld?: CameraMatrix;
}

export function applyCameraSample(camera: THREE.PerspectiveCamera, sample: CameraSample, options: CameraApplyOptions = {}): void {
  const current = { type: 'perspective' as const, fovy: camera.fov * Math.PI / 180, aspect: camera.aspect, near: camera.near, far: camera.far };
  const snapshot = cameraSnapshot(sample, current, webCameraMathApprox, options, options.entityWorld);
  if (options.minNearApprox !== undefined) snapshot.projection.near = Math.max(snapshot.projection.near, options.minNearApprox);
  writeThree(snapshot, camera);
}

export function parseBakedCamera(json: unknown): BakedCameraClip | null {
  return (json as { sceneAnims?: { cameras?: BakedCameraClip[] }[] } | null)?.sceneAnims?.[0]?.cameras?.[0] ?? null;
}

export function applyBakedCameraApprox(camera: THREE.PerspectiveCamera, clip: BakedCameraClip, frame: number, options: CameraApplyOptions = {}): void {
  applyCameraSample(camera, sampleBakedApprox(clip, frame), options);
}
