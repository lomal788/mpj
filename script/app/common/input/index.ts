import { emptyPad, type PadInput } from '@game/core/pad';
import { snapshotMotion, type MotionPacket } from '@game/lib/motion';
import type { VirtualMotionProfile } from '@game/lib/motion';
import { GamepadMotionApprox } from '@game/lib/motion-gamepad';

export interface MotionSource {
  submit(): MotionPacket;
  dispose(): void;
}

export function gamepadMotionSource(index: number, profile: VirtualMotionProfile,
  mapping = { button: 0, tiltX: 1, tiltZ: 0 }, read = () => navigator.getGamepads?.()[index] ?? null): MotionSource {
  if (!Number.isInteger(index) || index < 0) throw new Error('Invalid gamepad index');
  return new GamepadMotionApprox(read, profile, mapping);
}

export function mergePadInputs(inputs: readonly (PadInput | null)[], motionOwner?: number): PadInput | null {
  const first = inputs.find(p => p !== null);
  if (!first) return null;
  const out = { ...first };
  for (const p of inputs) {
    if (!p) continue;
    out.buttons |= p.buttons;
    for (const key of ['lx', 'ly', 'rx', 'ry'] as const) if (Math.abs(p[key]) > Math.abs(out[key])) out[key] = p[key];
  }
  const owner = motionOwner === undefined ? inputs.find(p => !!p?.motion)
    ?? inputs.find(p => p && (p.accX !== 0 || p.accY !== 0 || p.accZ !== 0)) ?? first : inputs[motionOwner];
  delete out.motion;
  out.accX = owner?.accX ?? 0; out.accY = owner?.accY ?? 0; out.accZ = owner?.accZ ?? 0;
  if (owner?.motion) out.motion = snapshotMotion(owner.motion);
  return out;
}

export class FrameMotionPad {
  private frame = -1;
  private cached: PadInput | null = null;
  private disposed = false;
  constructor(private readonly readPad: () => PadInput | null, private readonly source: MotionSource) {}
  read(frame: number): PadInput | null {
    if (this.disposed) return null;
    if (!Number.isSafeInteger(frame) || frame < 0 || frame < this.frame) throw new Error('Input frame order invalid');
    if (frame === this.frame) return this.cached;
    const raw = this.readPad();
    const motion = snapshotMotion(this.source.submit());
    const sample = motion.valid ? motion.sample : null;
    const pad: PadInput = { ...(raw ?? emptyPad()), accX: sample?.acceleration[0] ?? 0,
      accY: sample?.acceleration[1] ?? 0, accZ: sample?.acceleration[2] ?? 0, motion };
    this.frame = frame; this.cached = Object.freeze(pad);
    return this.cached;
  }
  dispose(): void { if (!this.disposed) { this.disposed = true; this.source.dispose(); this.cached = null; } }
}
