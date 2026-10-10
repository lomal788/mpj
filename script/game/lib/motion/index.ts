export type V3 = [number, number, number];
export type Q4 = [number, number, number, number];
export type F32 = (value: number) => number;
export interface MotionSample {
  number: number;
  acceleration: V3;
  angularVelocity: V3 | null;
  posture: Q4 | null;
  gravityRemoved: boolean;
}
export interface MotionPacket {
  profile: string;
  revision: number;
  valid: boolean;
  reset: boolean;
  sample: MotionSample | null;
}
export interface VirtualMotionProfile {
  id: string;
  revision: number;
  mode: 'pulse' | 'hold';
  acceleration: V3;
  angularVelocity: V3;
  tiltRadians: number;
}

export function copySample(sample: MotionSample, f: F32 = Math.fround): MotionSample {
  if (!Number.isSafeInteger(sample.number) || sample.number < 0) throw new Error('Invalid motion sample number');
  const vector = <T extends V3 | Q4>(values: T): T => {
    if (values.length !== 3 && values.length !== 4) throw new Error('Invalid motion sample vector size');
    const out = values.map(value => f(value));
    if (out.some(value => !Number.isFinite(value))) throw new Error('Invalid motion sample vector');
    return out as T;
  };
  if (sample.acceleration.length !== 3 || sample.angularVelocity && sample.angularVelocity.length !== 3 || sample.posture && sample.posture.length !== 4) throw new Error('Invalid motion sample vector size');
  return { number: sample.number, acceleration: vector(sample.acceleration),
    angularVelocity: sample.angularVelocity && vector(sample.angularVelocity),
    posture: sample.posture && vector(sample.posture), gravityRemoved: sample.gravityRemoved };
}
export function snapshotMotion(packet: MotionPacket): MotionPacket {
  if (!packet.profile || !Number.isSafeInteger(packet.revision) || packet.revision < 0 || packet.valid && !packet.sample) throw new Error('Invalid motion packet');
  const sample = packet.sample ? copySample(packet.sample) : null;
  if (sample) {
    Object.freeze(sample.acceleration);
    if (sample.angularVelocity) Object.freeze(sample.angularVelocity);
    if (sample.posture) Object.freeze(sample.posture);
    Object.freeze(sample);
  }
  return Object.freeze({ ...packet, sample });
}

export type WaveState = 1 | 2 | 3;
export type WaveEvent = { state: WaveState; value: number };
export class MotionEmitter {
  private fired = false;
  private sum = 0;
  private alive_ = true;
  private generation = 0;
  constructor(readonly kind: 'value' | 'sum', readonly test: number,
    private readonly callback: (event: WaveEvent) => void, private readonly f: F32 = Math.fround) {
    if (!Number.isFinite(test)) throw new Error('Invalid motion emitter threshold');
  }
  get alive(): boolean { return this.alive_; }
  get total(): number { return this.sum; }
  notify(event: WaveEvent): void {
    if (!this.alive_) return;
    if (event.state === 1) { this.fired = false; this.sum = 0; }
    if (this.fired) return;
    if (this.kind === 'sum' && event.state !== 3) this.sum = this.f(this.sum + event.value);
    if (this.f(this.test) <= (this.kind === 'sum' ? this.sum : event.value)) {
      const generation = this.generation;
      this.callback(event);
      if (this.alive_ && generation === this.generation) this.fired = true;
    }
  }
  reset(): void { this.generation++; this.fired = false; this.sum = 0; }
  dispose(): void { this.alive_ = false; this.reset(); }
}

export class WaveDetector {
  private active = false;
  private peak: V3 = [0, 0, 0];
  private generation = 0;
  private alive_ = true;
  private readonly emitters = new Set<MotionEmitter>();
  readonly threshold: number;
  constructor(readonly source: 'acceleration' | 'angularVelocity', readonly mask: number,
    threshold: number, private readonly f: F32 = Math.fround) {
    if (!Number.isFinite(threshold) || !Number.isInteger(mask) || mask < 0 || mask > 7) throw new Error('Invalid wave setup');
    this.threshold = f(threshold < 0 ? 0.1 : threshold);
  }
  get alive(): boolean { return this.alive_; }
  add(emitter: MotionEmitter): void {
    if (!this.alive_) throw new Error('Wave detector disposed');
    this.emitters.add(emitter);
  }
  remove(emitter: MotionEmitter): void { this.emitters.delete(emitter); }
  private magnitude(v: V3): number {
    const f = this.f;
    return f(Math.sqrt(f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2]))));
  }
  private notify(state: WaveState, value: number): boolean {
    const generation = this.generation;
    for (const emitter of [...this.emitters]) {
      if (!this.alive_ || generation !== this.generation) return false;
      if (this.emitters.has(emitter)) emitter.notify({ state, value });
    }
    return this.alive_ && generation === this.generation;
  }
  update(sample: MotionSample): void {
    if (!this.alive_) return;
    const raw = sample[this.source];
    if (!raw) throw new Error(`Motion capability unavailable: ${this.source}`);
    const f = this.f;
    const v: V3 = [this.mask & 1 ? f(raw[0]) : 0, this.mask & 2 ? f(raw[1]) : 0, this.mask & 4 ? f(raw[2]) : 0];
    const mag = this.magnitude(v);
    if (this.active) {
      if (mag < this.threshold) {
        if (this.notify(3, mag)) { this.active = false; this.peak = [0, 0, 0]; }
        return;
      }
      const dot = f(f(f(v[0] * this.peak[0]) + f(v[1] * this.peak[1])) + f(v[2] * this.peak[2]));
      if (dot < 0) {
        if (!this.notify(3, 0)) return;
        this.active = false;
      } else {
        if (this.magnitude(this.peak) < mag) this.peak = v;
        this.notify(2, mag);
        return;
      }
    }
    if (mag >= this.threshold) {
      this.peak = v;
      if (this.notify(1, mag)) this.active = true;
    }
  }
  reset(): void {
    this.generation++;
    this.active = false; this.peak = [0, 0, 0];
    for (const emitter of this.emitters) emitter.reset();
  }
  dispose(): void {
    if (!this.alive_) return;
    this.alive_ = false; this.reset();
    for (const emitter of this.emitters) emitter.dispose();
    this.emitters.clear();
  }
}

export type RotateMotion = (posture: Q4, vector: V3) => V3;
export class MotionConverter {
  private readonly ring: (MotionSample | null)[];
  private next = 0;
  private count = 0;
  private alive = true;
  private generation = 0;
  private readonly detectors = new Set<WaveDetector>();
  readonly options: { removeGravity: boolean; inverseAcceleration: boolean; rotateInPosture: boolean };
  constructor(size: number, options: Partial<MotionConverter['options']> = {},
    private readonly rotate: RotateMotion | null = null, private readonly f: F32 = Math.fround) {
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid motion buffer size');
    this.ring = new Array(Math.max(1, size)).fill(null);
    this.options = { removeGravity: true, inverseAcceleration: false, rotateInPosture: false, ...options };
  }
  get capacity(): number { return this.ring.length; }
  get length(): number { return this.count; }
  get acceleration(): V3 { return this.latest()?.acceleration ?? [0, 0, 0]; }
  get angularVelocity(): V3 | null { return this.count ? this.latest()!.angularVelocity : [0, 0, 0]; }
  get posture(): Q4 | null { return this.count ? this.latest()!.posture : [0, 0, 0, 1]; }
  latest(offset = 0): MotionSample | null {
    if (!Number.isInteger(offset) || offset < 0 || offset >= this.count) return null;
    return copySample(this.ring[(this.next - 1 - offset + this.capacity) % this.capacity]!, this.f);
  }
  add(detector: WaveDetector): void {
    if (!this.alive) throw new Error('Motion converter disposed');
    this.detectors.add(detector);
  }
  remove(detector: WaveDetector): void { this.detectors.delete(detector); }
  push(raw: MotionSample): void {
    if (!this.alive) throw new Error('Motion converter disposed');
    const sample = copySample(raw, this.f);
    const f = this.f;
    const rotation = (v: V3): V3 => {
      if (!sample.posture || !this.rotate) throw new Error('Motion posture rotation port required');
      return this.rotate(sample.posture, v).map(f) as V3;
    };
    if (this.options.removeGravity && !sample.gravityRemoved) {
      const g = rotation([0, -1, 0]);
      sample.acceleration = sample.acceleration.map((v, i) => f(v - g[i])) as V3;
      sample.gravityRemoved = true;
    }
    if (this.options.rotateInPosture) {
      sample.acceleration = rotation(sample.acceleration);
      if (sample.angularVelocity) sample.angularVelocity = rotation(sample.angularVelocity);
    }
    if (this.options.inverseAcceleration) sample.acceleration = sample.acceleration.map(v => f(-v)) as V3;
    this.ring[this.next] = sample;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
    const generation = this.generation;
    for (const detector of [...this.detectors]) {
      if (!this.alive || generation !== this.generation) return;
      if (this.detectors.has(detector)) detector.update(copySample(sample, f));
    }
  }
  clear(): void {
    this.generation++; this.next = this.count = 0;
    for (const detector of this.detectors) detector.reset();
  }
  dispose(): void {
    if (!this.alive) return;
    this.alive = false; this.clear(); this.ring.fill(null);
    for (const detector of this.detectors) detector.dispose();
    this.detectors.clear();
  }
}

export class MotionSensor {
  private frame = -1;
  private source = '';
  private revision = -1;
  private sampleNumber = -1;
  constructor(readonly converter: MotionConverter) {}
  accept(frame: number, packet: MotionPacket): boolean {
    if (!Number.isSafeInteger(frame) || frame < this.frame) throw new Error('Motion frame order invalid');
    if (frame === this.frame) return false;
    const snapshot = snapshotMotion(packet);
    this.frame = frame;
    if (snapshot.reset || snapshot.profile !== this.source || snapshot.revision !== this.revision || !snapshot.valid) {
      this.converter.clear(); this.sampleNumber = -1;
    }
    this.source = snapshot.profile; this.revision = snapshot.revision;
    if (!snapshot.valid || !snapshot.sample || snapshot.sample.number === this.sampleNumber) return false;
    if (snapshot.sample.number < this.sampleNumber) throw new Error('Motion sample order invalid');
    this.sampleNumber = snapshot.sample.number;
    this.converter.push(snapshot.sample);
    return true;
  }
}

export function tiltQuaternionApprox(x: number, z: number): Q4 {
  const f = Math.fround;
  const sx = f(Math.sin(f(x / 2))), cx = f(Math.cos(f(x / 2)));
  const sz = f(Math.sin(f(z / 2))), cz = f(Math.cos(f(z / 2)));
  return [f(sx * cz), f(-sx * sz), f(cx * sz), f(cx * cz)];
}
export class VirtualMotionApprox {
  private pulse = false;
  private down = false;
  private tilt: [number, number] = [0, 0];
  private number = 0;
  private resetPending = true;
  readonly profile: VirtualMotionProfile;
  constructor(profile: VirtualMotionProfile) {
    if (!profile.id || !Number.isSafeInteger(profile.revision) || profile.revision < 0 || !['pulse', 'hold'].includes(profile.mode) || !Number.isFinite(profile.tiltRadians) || profile.tiltRadians < 0) throw new Error('Invalid virtual motion profile');
    const sample = copySample({ number: 0, acceleration: profile.acceleration, angularVelocity: profile.angularVelocity, posture: null, gravityRemoved: true });
    this.profile = Object.freeze({ ...profile, acceleration: Object.freeze(sample.acceleration) as V3, angularVelocity: Object.freeze(sample.angularVelocity!) as V3 });
  }
  action(down: boolean): void { if (down && !this.down) this.pulse = true; this.down = down; }
  trigger(): void { this.pulse = true; }
  setTilt(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('Invalid virtual tilt');
    this.tilt = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, z))];
  }
  reset(): void { this.down = this.pulse = false; this.tilt = [0, 0]; this.resetPending = true; }
  submit(): MotionPacket {
    const active = this.profile.mode === 'hold' ? this.down : this.pulse;
    this.pulse = false;
    const packet = snapshotMotion({ profile: this.profile.id, revision: this.profile.revision, valid: true, reset: this.resetPending,
      sample: { number: this.number++, acceleration: active ? [...this.profile.acceleration] : [0, 0, 0],
        angularVelocity: active ? [...this.profile.angularVelocity] : [0, 0, 0],
        posture: tiltQuaternionApprox(Math.fround(this.tilt[0] * this.profile.tiltRadians), Math.fround(this.tilt[1] * this.profile.tiltRadians)), gravityRemoved: true } });
    this.resetPending = false;
    return packet;
  }
}
