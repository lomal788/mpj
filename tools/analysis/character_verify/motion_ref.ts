// Reference model of the original actor::ActorAnimationSlot playback rules (logic only, no three.js).
// Source: web/docs/engine/09_character.md §6. Every rule cites the original function (main.nso addresses).
// This file is a verification aid for tools/character_verify/check.ts, not web runtime code.

export const NEG_FLT_MAX = -3.4028234663852886e38;

export interface ClipInfo { frames: number; loop: boolean }

/** actor::MotionArg (0x50 B). Offsets relative to MotionArg. */
export interface MotionArg {
  name: string;               // +0x00 string, +0x18 StringViewHashPair (hash = FNV-1a 64)
  forceRestart: boolean;      // +0x38  0 -> ignore when the same hash is already current (FUN_7100022a80)
  randomStartFrame: boolean;  // +0x39  random start frame (listener FUN_7100022f20)
  speedValid: boolean;        // +0x3a  slot.speed = speed (listener)
  startFrame: number;         // +0x3c
  speed: number;              // +0x40
  blendTime: number;          // +0x44  NEG_FLT_MAX = default (listener -> 0.1 when a clip was playing)
  transitionType: number;     // +0x48  nn::bezel::AnimationTransitionType, default 1
}

/** ActorAnimationSlot::Play(StringViewHashPair) defaults @0x71000237f8 */
export function argFromName(name: string): MotionArg {
  return { name, forceRestart: false, randomStartFrame: false, speedValid: false, startFrame: 0, speed: 1, blendTime: NEG_FLT_MAX, transitionType: 1 };
}

export class SlotRef {
  cur: { name: string; info: ClipInfo } | null = null;
  frame = 0;
  speed = 1;            // ActorAnimationSlot+0x140 (SetSpeed)
  conditionSpeed = 1;   // ActorAnimationSlot+0x144 (SetConditionSpeed)
  lastBlend = 0;
  constructor(
    public clips: Map<string, ClipInfo>,
    /** ComActorMotion+0x98: AddAnimation(..., registerIdle=true) stores name.includes('_idle') */
    public idleRandom: Map<string, boolean>,
    public rand: (n: number) => number,
  ) {}

  play(arg: MotionArg) {
    const info = this.clips.get(arg.name);
    if (!info) return;                                                     // ComActorMotion::Play: empty name -> return
    if (!arg.forceRestart && this.cur && this.cur.name === arg.name) return; // FUN_7100022a80 same-hash early return
    // listener FUN_7100022f20 runs while the previous node is still current [추정: 09_character.md §6.4]
    const prevLoop = this.cur ? this.cur.info.loop : true;               // no node -> local_a4 = 1
    this.lastBlend = this.cur ? (arg.blendTime === NEG_FLT_MAX ? 0.1 : arg.blendTime) : 0;
    if (arg.speedValid) this.speed = arg.speed;
    let start: number;
    if (arg.randomStartFrame) start = this.rand(Math.trunc(info.frames));
    else if (prevLoop) start = this.idleRandom.get(arg.name) ? this.rand(Math.trunc(info.frames)) : 0;
    else start = arg.startFrame;
    this.cur = { name: arg.name, info };
    this.frame = start;
  }

  setFrame(f: number) { this.frame = f; }
  setSpeed(s: number) { this.speed = s; }

  /** one 60 Hz frame. Frame step = speed * conditionSpeed per frame [추정: fixed 60 fps rhythm scene] */
  step() {
    if (!this.cur) return;
    const s = this.speed * this.conditionSpeed;
    const max = this.cur.info.frames;
    this.frame = Math.fround(this.frame + s);           // f32 accumulation [추정: engine keeps frame as f32]
    if (this.cur.info.loop) {
      if (max > 0) this.frame = ((this.frame % max) + max) % max;
    } else {
      this.frame = Math.min(Math.max(this.frame, 0), max);
    }
  }

  /** nn::bezel::AnimationSlot::GetPlaybackState()==3 @0x71008135f4 */
  isFinished(): boolean {
    if (!this.cur || this.cur.info.loop) return false;
    const s = this.speed * this.conditionSpeed;
    return s >= 0 ? this.frame >= this.cur.info.frames : this.frame <= 0;
  }
}
