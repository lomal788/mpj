/**
 * 클립 재생 — glb 에 구운 스켈레탈 클립(fskb)을 원본 프레임 시간축으로 돌린다(time = frame / 60, 03_graphics.md 4절).
 * 비루프 클립은 마지막 프레임에서 멈춘다. 프레임 수는 변환 메타(manifest clips.frames) 또는 클립 길이 × 60.
 */
import * as THREE from 'three';
import type { ClipHandle, ClipOptions } from './types';

export class Clip implements ClipHandle {
  readonly name: string;
  readonly frames: number;
  readonly loop: boolean;
  frame: number;
  speed: number;
  playing = true;
  private readonly action: THREE.AnimationAction;

  constructor(
    private readonly mixer: THREE.AnimationMixer,
    clip: THREE.AnimationClip,
    frames: number | undefined,
    opts: ClipOptions,
  ) {
    this.name = clip.name;
    this.frames = frames ?? Math.round(clip.duration * 60);
    this.loop = opts.loop ?? true;
    this.frame = opts.startFrame ?? 0;
    this.speed = opts.speed ?? 1;
    this.action = mixer.clipAction(clip);
    this.action.setLoop(THREE.LoopRepeat, Infinity);
    this.action.play();
    this.apply();
  }

  isFinished(): boolean {
    return !this.loop && this.frame >= this.frames;
  }

  stop(): void {
    this.playing = false;
    this.action.stop();
  }

  step(df: number): void {
    if (!this.playing) return;
    this.frame += df * this.speed;
    if (this.loop && this.frames > 0) this.frame = ((this.frame % this.frames) + this.frames) % this.frames;
    this.apply();
  }

  private apply(): void {
    const f = this.loop ? this.frame : Math.min(this.frame, this.frames);
    const dur = this.action.getClip().duration;
    this.action.time = Math.min(f / 60, Math.max(0, dur - 1e-6));
    this.mixer.update(0);
  }
}
