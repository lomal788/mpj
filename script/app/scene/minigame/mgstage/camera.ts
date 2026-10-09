/**
 * 미니게임 카메라 클립 재생기 — 공용 변환기가 구운 fsnb json(cam/<파일>.fsnb.json, graphics_bfres2gltf anim)을 stage3d 카메라 슬롯 'anim' 에.
 * 자세 규칙은 광장 FsnbCamera(app/scene/world/plaza/balloon.ts)와 같다(07_camera_lighting §6.2): EulerZXY → three 'YXZ', Aim → lookAt + twist, fovy = 전체 세로각.
 * 종횡비는 fsnb aspect 를 쓰지 않고 화면 비율(ApplyAspectEnabled 0 [판독 mg1801 camera.ts]). near 하한 0.3 [근사: 광장과 같음, 24비트 깊이].
 * 광장 FsnbCamera 는 balloon.ts(광장 부품 의존)에 있어 import 하지 않고 같은 식을 둔다.
 */
import * as THREE from 'three';
import type { CameraDriver } from '../../../../shell/stage3d';

export interface FsnbClip {
  name?: string;
  frames: number;
  loop: boolean;
  mode: string;
  pos: number[][];
  rotOrAim: number[][];
  twist: number[];
  fovyRad: number[];
  near: number[];
  far: number[];
}

export const CAMERA_MIN_NEAR = 0.3;

export function parseFsnb(json: unknown): FsnbClip | null {
  return (json as { sceneAnims?: { cameras?: FsnbClip[] }[] })?.sceneAnims?.[0]?.cameras?.[0] ?? null;
}

/** 카메라 자세 한 프레임(정수 프레임, 구운 값 그대로) */
export function applyFsnb(camera: THREE.PerspectiveCamera, c: FsnbClip, frame: number): void {
  const i = Math.max(0, Math.min(c.pos.length - 1, Math.floor(frame)));
  const p = c.pos[i];
  const r = c.rotOrAim[i];
  camera.position.set(p[0], p[1], p[2]);
  camera.up.set(0, 1, 0);
  if (c.mode.startsWith('Euler')) camera.rotation.set(r[0], r[1], r[2], 'YXZ');
  else {
    camera.lookAt(r[0], r[1], r[2]);
    camera.rotateZ(c.twist[i] ?? 0);
  }
  camera.fov = THREE.MathUtils.radToDeg(c.fovyRad[i]);
  camera.near = Math.max(c.near[i], CAMERA_MIN_NEAR);
  camera.far = c.far[i];
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export interface MgCameraHandle {
  readonly name: string;
  readonly frames: number;
  readonly loop: boolean;
  frame: number;
  speed: number;
  readonly finished: boolean;
  stop(): void;
}

/** 재생 중 카메라 클립 — 비루프면 마지막 프레임에서 멈춘다(원본 슬롯 status 3) */
export class MgCamera implements CameraDriver, MgCameraHandle {
  frame: number;
  speed: number;
  stopped = false;

  constructor(
    readonly name: string,
    readonly clip: FsnbClip,
    opts: { loop?: boolean; speed?: number; startFrame?: number } = {},
    private readonly onStop: (c: MgCamera) => void = () => undefined,
  ) {
    this.frame = opts.startFrame ?? 0;
    this.speed = opts.speed ?? 1;
    this.loopOverride = opts.loop;
  }

  private readonly loopOverride: boolean | undefined;

  get loop(): boolean {
    return this.loopOverride ?? this.clip.loop;
  }

  get frames(): number {
    return this.clip.frames;
  }

  get finished(): boolean {
    return !this.loop && this.frame >= this.clip.frames;
  }

  stop(): void {
    this.stopped = true;
    this.onStop(this);
  }

  apply(camera: THREE.PerspectiveCamera, df: number): boolean {
    if (this.stopped) return false;
    const n = this.clip.frames;
    this.frame += df * this.speed;
    if (this.loop && n > 0) this.frame = ((this.frame % n) + n) % n;
    else this.frame = Math.max(0, Math.min(this.frame, n));
    applyFsnb(camera, this.clip, this.frame);
    return true;
  }
}
