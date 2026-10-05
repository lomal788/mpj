/**
 * mg1801 장면 카메라 — 원본 MapImpl 의 cam00 엔티티(ComMatter → ComCamera) 모션 3개(07_camera_lighting.md 3.1·5.1·7.1).
 *
 * - 라벨 ↔ 파일: loop = mg1801_cam00(Initialize), result = mg1801_cam02(채널 0,6), capture = mg1801_cam_capture00(채널 2,2).
 *   cam01 은 쓰지 않는다. 네 fsnb 모두 FrameCount 0·커브 0이라 라벨마다 고정 시점 하나다 [데이터: extracted/converted/camera/mg1801_cameras.json].
 * - 전부 Aim 모드(위치 → 주시점, twist 0)·Perspective. three 로는 position + up(0,1,0) + lookAt + rotateZ(twist) 와 같다(6.2, 재구현 계산 확인).
 * - fovy = 전체 세로각(라디안): Camera::SetProjectionPerspectiveFovy @0x7100846b04 가 fovy·0.5 의 sin/cos 로 P11 = 1/tan(fovy/2),
 *   P00 = P11/aspect 를 쓴다(analysis/decomp/camera_core.c) [판독] → three fov(도) = fovy·180/π.
 * - 종횡비: 적용기 ApplyAspectEnabled 기본 0 이라 fsnb aspect(1.78·1.777)는 쓰지 않고 화면 비율(렌더러 16:9)을 유지한다.
 *   세로 화각 고정(가로가 비율에 따라 바뀜)도 위 투영식 그대로다 [판독]. ApplyNearAndFarEnabled 기본 1 → near/far 는 fsnb 값.
 * - 전환은 보간 없이 즉시(적용기에 가중치 없음) [판독].
 */
import * as THREE from 'three';

export type CameraLabel = 'loop' | 'result' | 'capture';

interface CamClip {
  pos: [number, number, number];
  aim: [number, number, number];
  /** 라디안, 전체 세로각 */
  fovy: number;
  near: number;
  far: number;
  twist: number;
}

/** fsnb base 값 그대로 [데이터] */
export const CAMERAS: Record<CameraLabel, CamClip> = {
  loop: { pos: [0, 2, 23], aim: [0, 3, -3], fovy: 0.34906584, near: 0.1, far: 10000, twist: 0 },
  result: { pos: [0, 5.5, 20], aim: [0, 0, -1.5], fovy: 0.34906656, near: 0.1, far: 10000, twist: 0 },
  capture: { pos: [0, 14.531198, 23.946115], aim: [0, 0, 3.74], fovy: 0.2617994, near: 0.1, far: 10000, twist: 0 },
};

/** 원본 AnimationPassCamera 적용(Aim 모드, 수직 시선 없음 — 세 클립 모두 d.x = 0 이지만 d.z ≠ 0) */
export function applyCamera(cam: THREE.PerspectiveCamera, label: CameraLabel): void {
  const c = CAMERAS[label];
  cam.fov = (c.fovy * 180) / Math.PI;
  cam.near = c.near;
  cam.far = c.far;
  cam.position.set(c.pos[0], c.pos[1], c.pos[2]);
  cam.up.set(0, 1, 0);
  cam.lookAt(c.aim[0], c.aim[1], c.aim[2]);
  if (c.twist) cam.rotateZ(c.twist);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}
