import { VirtualMotionApprox, snapshotMotion, type MotionPacket, type VirtualMotionProfile } from '../motion';

export interface MotionGamepad {
  connected: boolean;
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
}
export class GamepadMotionApprox {
  private readonly core: VirtualMotionApprox;
  private connected = false;
  private closed = false;
  constructor(private readonly read: () => MotionGamepad | null, profile: VirtualMotionProfile,
    private readonly mapping: { button: number; tiltX: number; tiltZ: number }) {
    if (Object.values(mapping).some(v => !Number.isInteger(v) || v < 0)) throw new Error('Invalid motion gamepad mapping');
    this.core = new VirtualMotionApprox(profile);
  }
  submit(): MotionPacket {
    const pad = this.closed ? null : this.read();
    if (!pad?.connected) {
      if (this.connected) this.core.reset();
      this.connected = false;
      return snapshotMotion({ profile: this.core.profile.id, revision: this.core.profile.revision, valid: false, reset: true, sample: null });
    }
    if (!this.connected) this.core.reset();
    this.connected = true;
    this.core.action(pad.buttons[this.mapping.button]?.pressed ?? false);
    this.core.setTilt(-(pad.axes[this.mapping.tiltX] ?? 0), pad.axes[this.mapping.tiltZ] ?? 0);
    return this.core.submit();
  }
  dispose(): void { this.closed = true; this.core.reset(); }
}
