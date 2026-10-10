/**
 * 미니게임 카메라 클립 재생기 — 공용 변환기가 구운 fsnb json(cam/<파일>.fsnb.json, graphics_bfres2gltf anim)을 stage3d 카메라 슬롯 'anim' 에.
 * 자세 규칙은 광장 FsnbCamera(app/scene/world/plaza/balloon.ts)와 같다(07_camera_lighting §6.2): EulerZXY → three 'YXZ', Aim → lookAt + twist, fovy = 전체 세로각.
 * 종횡비는 fsnb aspect 를 쓰지 않고 화면 비율(ApplyAspectEnabled 0 [판독 mg1801 camera.ts]). near 하한 0.3 [근사: 광장과 같음, 24비트 깊이].
 * 자세·재생 계산은 공용 camera와 render3d/camera에 위임한다. 구운 샘플·near 하한은 명시적 기존 웹 근사다.
 */
import * as THREE from 'three';
import type { CameraDriver } from '@app/common/render3d';
import { BakedCameraPlayerApprox, type BakedCameraClip } from '@game/lib/camera';
import { applyBakedCameraApprox, parseBakedCamera } from '@app/common/render3d/camera';

export interface FsnbClip extends BakedCameraClip { loop: boolean; }

export const CAMERA_MIN_NEAR = 0.3;

export function parseFsnb(json: unknown): FsnbClip | null {
  const clip = parseBakedCamera(json);
  return clip ? { ...clip, loop: clip.loop ?? false } : null;
}

/** 카메라 자세 한 프레임(정수 프레임, 구운 값 그대로) */
export function applyFsnb(camera: THREE.PerspectiveCamera, c: FsnbClip, frame: number): void {
  applyBakedCameraApprox(camera, c, frame, { minNearApprox: CAMERA_MIN_NEAR });
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
  private readonly player: BakedCameraPlayerApprox;

  constructor(
    readonly name: string,
    readonly clip: FsnbClip,
    opts: { loop?: boolean; speed?: number; startFrame?: number } = {},
    private readonly onStop: (c: MgCamera) => void = () => undefined,
  ) {
    this.player = new BakedCameraPlayerApprox(clip.frames, opts.loop ?? clip.loop, opts.startFrame ?? 0, opts.speed ?? 1);
  }

  get frame(): number { return this.player.frame; }
  set frame(value: number) { this.player.frame = value; }
  get speed(): number { return this.player.speed; }
  set speed(value: number) { this.player.speed = value; }
  get stopped(): boolean { return this.player.stopped; }
  get loop(): boolean { return this.player.loop; }
  get frames(): number { return this.player.frames; }
  get finished(): boolean { return this.player.finished; }

  stop(): void {
    if (this.stopped) return;
    this.player.stop();
    this.onStop(this);
  }

  step(_camera: THREE.PerspectiveCamera, df: number): boolean { return this.player.step(df); }

  apply(camera: THREE.PerspectiveCamera): void {
    if (!this.stopped) applyFsnb(camera, this.clip, this.frame);
  }
}
