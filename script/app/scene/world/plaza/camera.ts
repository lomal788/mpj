/**
 * 광장 추종 카메라(B) — menu00::ComMenuCamera::FollowPlayerImpl @0x7100003de0 어셈블리 판독식 그대로. docs/shell/plaza_3d.md §3.5.
 * stage3d 카메라 슬롯 'follow' 에 붙는다(anim 슬롯 fsnb 컷이 잡으면 원본 PlayAnim 처럼 추종이 멈춘다).
 */
import * as THREE from 'three';
import { applyCameraSample } from '@app/common/render3d/camera';
import type { PlazaCameraParam, PlazaContext, PlazaPart, PlazaPartFactory } from './types';

/** GetPosNodeLocater 0·3·5 [판독+데이터 menu00_loc_attach00] — 소켓을 못 찾을 때만 쓴다 */
export const LOCATER = {
  camera00: new THREE.Vector3(0, 2, 33),
  charPlazaDefault: new THREE.Vector3(0, -2.365, 22.316),
  balloon: new THREE.Vector3(0, 0, 0),
} as const;

export const PROJ_NEAR = 1;
export const PROJ_FAR = 2000;

/** MapManager::GetArea 의 0(기구 앞) 판정 */
export function isBalloonFront(p: THREE.Vector3): boolean {
  return p.z < 18 && p.x < 9 && p.x > -9;
}

export interface MenuCameraPose {
  at: THREE.Vector3;
  eye: THREE.Vector3;
  fovy: number;
  /** 기구 섞기 비율(기구 앞이 아니면 −1) */
  t: number;
}

function normXZ(v: THREE.Vector3): THREE.Vector3 {
  v.y = 0;
  const l = Math.hypot(v.x, v.z);
  if (l === 0) return v.set(0, 0, 0);
  return v.set(v.x / l, 0, v.z / l);
}

const lerp = (a: number, b: number, t: number): number => a + t * (b - a);

export class MenuCameraFollow {
  readonly target = new THREE.Vector3();
  clampEntrance = false;

  constructor(
    readonly param: PlazaCameraParam,
    readonly camera00: THREE.Vector3 = LOCATER.camera00.clone(),
    readonly charPlazaDefault: THREE.Vector3 = LOCATER.charPlazaDefault.clone(),
    readonly balloon: THREE.Vector3 = LOCATER.balloon.clone(),
  ) {
    this.target.copy(charPlazaDefault);
  }

  /** 목표 따라가기. camBack = 지난 프레임 카메라 월드 z 열(+0xa0) */
  follow(player: THREE.Vector3, camBack: THREE.Vector3): void {
    const p = this.param;
    const range = p.MainMenuCameraTargetPlayRange;
    const s = p.MainMenuCameraFollowSpeed;
    const d = player.clone().sub(this.target);
    const dist = d.length();
    if (!(range < dist)) return;
    const k = (dist * dist) / (range * range);
    this.target.addScaledVector(d, k * s);
    const f = normXZ(new THREE.Vector3(-camBack.x, 0, -camBack.z));
    this.target.addScaledVector(f, d.dot(f) * k * s);
    if (this.clampEntrance) {
      this.target.x = 0;
      if (this.target.z > this.charPlazaDefault.z) this.target.z = this.charPlazaDefault.z;
      if (this.target.z < this.balloon.z) this.target.z = this.balloon.z;
    }
  }

  pose(): MenuCameraPose {
    const p = this.param;
    const T = this.target;
    if (!isBalloonFront(T)) {
      const at = new THREE.Vector3(T.x, T.y + p.MainMenuTargetOffsetY, T.z);
      const v = normXZ(this.camera00.clone().sub(at));
      v.y = Math.sin(THREE.MathUtils.degToRad(p.MainMenuCameraAngle));
      return { at, eye: at.clone().addScaledVector(v, p.MainMenuCameraLength), fovy: p.MainMenuCameraFovy, t: -1 };
    }
    const t = Math.max(0, Math.min(1, (T.z - 9) / -9 + 1));
    const z = t >= 1 ? 9 : T.z;
    const at = new THREE.Vector3((1 - t) * T.x, T.y + lerp(p.MainMenuTargetOffsetY, p.MainBalloonTargetOffsetY, t), z);
    const v = normXZ(this.camera00.clone().sub(at));
    v.y = Math.sin(THREE.MathUtils.degToRad(lerp(p.MainMenuCameraAngle, p.MainBalloonCameraAngle, t)));
    const len = lerp(p.MainMenuCameraLength, p.MainBalloonCameraLength, t);
    return { at, eye: at.clone().addScaledVector(v, len), fovy: lerp(p.MainMenuCameraFovy, p.MainBalloonCameraFovy, t), t };
  }

  /** 한 프레임: 따라가기 → 위치. camera 의 지난 자세로 앞 방향을 읽고 새 자세를 쓴다 */
  step(player: THREE.Vector3, camera: THREE.PerspectiveCamera): MenuCameraPose {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    this.follow(player, new THREE.Vector3(e[8], e[9], e[10]));
    const pose = this.pose();
    applyPose(camera, pose);
    return pose;
  }
}

export function applyPose(camera: THREE.PerspectiveCamera, pose: MenuCameraPose): void {
  applyCameraSample(camera, {
    pos: [pose.eye.x, pose.eye.y, pose.eye.z], rotOrAim: [pose.at.x, pose.at.y, pose.at.z], mode: 'Aim', twist: 0,
    projection: { type: 'perspective', fovy: pose.fovy * Math.PI / 180, aspect: camera.aspect, near: PROJ_NEAR, far: PROJ_FAR },
  });
}

export const createCamera: PlazaPartFactory = async (ctx: PlazaContext): Promise<PlazaPart> => {
  const world = ctx.world;
  const stage = world.stage;
  const sp = (name: string, def: THREE.Vector3): THREE.Vector3 => world.socket(name)?.pos.clone() ?? def.clone();
  const cam = new MenuCameraFollow(world.cameraParam, sp('camera00_pos', LOCATER.camera00), sp('char_plaza_default_pos', LOCATER.charPlazaDefault), sp('balloon_pos', LOCATER.balloon));
  let last: MenuCameraPose | null = null;
  let acc = 0;
  let enabled = true;
  const player = (): THREE.Vector3 | null => (ctx.actors.find((a) => a.kind === 'input') ?? null)?.pos ?? null;
  const driver = {
    step(camera: THREE.PerspectiveCamera, df: number): boolean {
      const p = player();
      if (!enabled || !p) return false;
      acc += df;
      if (!last) acc = Math.max(acc, 1);
      while (acc >= 1 - 1e-6) {
        acc -= 1;
        last = cam.step(p, camera);
      }
      return true;
    },
    apply(camera: THREE.PerspectiveCamera): void {
      if (last) applyPose(camera, last);
    },
  };
  stage.setCameraDriver(driver, 'follow');
  const offs = [
    ctx.on('camera:follow', (v) => {
      enabled = !!v;
    }),
    ctx.on('camera:reset', (v) => {
      cam.target.copy(v instanceof THREE.Vector3 ? v : cam.charPlazaDefault);
      last = null;
    }),
  ];
  return {
    name: 'camera',
    debug() {
      return {
        target: cam.target.toArray(),
        at: last?.at.toArray() ?? null,
        eye: last?.eye.toArray() ?? null,
        fovy: last?.fovy ?? null,
        blend: last?.t ?? null,
        balloonFront: isBalloonFront(cam.target),
        enabled,
      };
    },
    dispose() {
      for (const off of offs) off();
      stage.setCameraDriver(null, 'follow');
    },
  };
};
