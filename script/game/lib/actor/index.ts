export type V3 = [number, number, number];
export type V4 = [number, number, number, number];
export type Q4 = [number, number, number, number];
export type Ref = { index: number; generation: number };
export type PadPacket = { hold: number; trigger: number; release: number; stick: V4 };
export type ActorPhase = 'pre' | 'tick' | 'attack' | 'map' | 'limit'
  | 'actor-body' | 'actor-event' | 'post-collision' | 'ground' | 'publish';
export type StepStamp = {
  frameId: number; phase: ActorPhase; pass: number;
  sequence: number; poseEpoch: number;
};
export type ActorHit = {
  position: V3; normal: V3; distance: number; validity: number;
  initialOverlap: boolean; body: number; entity: Ref; shape: number;
  faceIndex: number; flags: number; tag: string | null;
};
export type ActorSurface = {
  body: number; entity: Ref; shape: number; faceIndex: number; tag: string | null;
  physicsMaterial: V3 | null;              // 정적 마찰·동적 마찰·반발
  groundKey: string | null;               // character의 발소리 키
};
export type ActorGround = {
  grounded: boolean; source: 'sweep' | 'ray' | 'limit' | 'none';
  normal: V3; hit: ActorHit | null; surface: ActorSurface | null;
};
export type ActorGeometry =
  | { kind: 'capsule'; radius: number; halfHeight: number }
  | { kind: 'sphere'; radius: number }
  | { kind: 'box'; halfExtents: V3 };
export type ActorShapeDesc = {
  owner: Ref; nameHash: bigint; classMask: number; enabled: boolean;
  geometry: ActorGeometry; center: V3; rotation: Q4;
  collisionBody: number; collisionShape: number;
};
export type ActorShape = ActorShapeDesc & { ref: Ref; actor: Ref };
export type ActorRegistration = {
  entity: Ref; position: V3; rotation: Q4; poseEpoch: number;
  modelMask: number | null; enabled: boolean;
  overrideCollision: boolean;
};
export type ActorMapContact = {
  actor: Ref; actorShape: Ref; body: number; entity: Ref; shape: number;
  direction: V3; depth: number; raw: V3; adjusted: V3;
};
export type ActorPairContact = {
  a: Ref; b: Ref; shapeA: Ref; shapeB: Ref; entityA: Ref; entityB: Ref;
  direction: V3; depth: number; raw: V3;
  respondA: boolean; respondB: boolean; adjustedA: V3; adjustedB: V3;
};
export interface ActorRegistryPort {
  entityAlive(entity: Ref): boolean;
  actorInfo(actor: Ref): Readonly<ActorRegistration> | null;
  shapeInfo(shape: Ref): Readonly<ActorShape> | null;
  snapshotActors(out: Ref[]): number;
  snapshotShapes(actor: Ref, out: Ref[]): number;
  registerActor(desc: ActorRegistration): Ref;
  registerShape(actor: Ref, desc: ActorShapeDesc): Ref;
  updateActor(actor: Ref, desc: ActorRegistration): boolean;
  updateShape(shape: Ref, desc: ActorShapeDesc): boolean;
  unregisterShape(shape: Ref): boolean;
  unregisterActor(actor: Ref): boolean;
  actorAlive(actor: Ref): boolean;
  shapeAlive(shape: Ref): boolean;
}
export type ActorPairFilter = (
  a: Readonly<ActorRegistration>, shapeA: Readonly<ActorShape>,
  b: Readonly<ActorRegistration>, shapeB: Readonly<ActorShape>
) => boolean;
export type ActorCollisionConfig = {
  registry: ActorRegistryPort;
  resolveGroundKey(hit: ActorHit, physicsMaterial: V3 | null): string | null;
  selectGround(accepted: readonly ActorHit[], count: number): number;
  fallbackGroundKey: string | null;
  pairFallback: ActorPairFilter | null;
};
export interface ActorCollisionPort {
  beginPhase(stamp: StepStamp): void;
  sweep(shape: ActorShape, start: V3, rotation: Q4, direction: V3,
        distance: number, mapMask: number, exclude: Ref, out: ActorHit): boolean;
  ray(origin: V3, direction: V3, distance: number,
      mapMask: number, exclude: Ref, out: ActorHit): boolean;
  resolveSurface(hit: ActorHit, out: ActorSurface): boolean;
  mapContacts(shape: ActorShape, mapMask: number, out: ActorMapContact[]): number;
  actorContacts(actor: Ref, out: ActorPairContact[]): number;
}
export type ActorMotionArg = {
  name: string; hash: bigint; forceRestart: boolean; randomStartFrame: boolean;
  speedValid: boolean; startFrame: number; speed: number;
  blendTime: number; transitionType: 1 | 4;
};
export type ActorMotionState = { present: boolean; hash: bigint | null; playback: 0 | 1 | 2 | 3 };
export type ActorMotionCommand =
  | { kind: 'play' | 'enqueue'; slot: 'main'; arg: ActorMotionArg }
  | { kind: 'condition-speed'; slot: 'main'; value: number };
export type ActorEvent = { actor: Ref; stamp: StepStamp } & (
  | { kind: 'ground-contact'; origin: 'original-call'; hit: ActorHit }
  | { kind: 'jump-stamp'; origin: 'original-call'; originalCode: 9 }
  | { kind: 'action-changed'; origin: 'design'; fromHash: bigint;
      toHash: bigint; enter: boolean; arg: number }
  | { kind: 'ground-state'; origin: 'design'; previous: boolean; ground: ActorGround }
  | { kind: 'actor-contact'; origin: 'design'; contact: ActorPairContact }
);
export interface ActorPorts {
  registry: ActorRegistryPort;
  collision: ActorCollisionPort;
  gravity(outDirection: V4): number;
  finalPosition(request: V4, out: V4): void;
  motionState(): ActorMotionState;
  motion(command: ActorMotionCommand): void;
  event(event: ActorEvent): void;
}

export const F = Math.fround;
export const STEP_SEC = F(1 / 60);
export const FLT_MAX = 3.4028234663852886e38;
export const INVALID_REF: Readonly<Ref> = Object.freeze({ index: -1, generation: 0 });
export const sameRef = (a: Ref, b: Ref): boolean => a.index === b.index && a.generation === b.generation;
export const v4 = (v: readonly number[]): V4 => [F(v[0]), F(v[1]), F(v[2]), F(v[3])];
export const v3 = (v: readonly number[]): V3 => [F(v[0]), F(v[1]), F(v[2])];
export function dot4(a: V4, b: V4): number {
  return F(F(F(F(a[2] * b[2]) + F(a[0] * b[0])) + F(a[3] * b[3])) + F(a[1] * b[1]));
}
export const length4 = (v: V4): number => F(Math.sqrt(dot4(v, v)));
export function identityPosition(request: V4, out: V4): void {
  for (let i = 0; i < 4; i++) out[i] = request[i];
}
export function basicGravity(out: V4): number {
  out[0] = 0; out[1] = -1; out[2] = 0; out[3] = 0;
  return F(9.8);
}
export function emptyActorHit(): ActorHit {
  return { position: [0, 0, 0], normal: [0, 0, 0], distance: 0, validity: 4, initialOverlap: false,
    body: 0, entity: { ...INVALID_REF }, shape: 0, faceIndex: -1, flags: 0, tag: null };
}
export function copyActorHit(h: ActorHit): ActorHit {
  return { ...h, position: [...h.position], normal: [...h.normal], entity: { ...h.entity } };
}
export function emptyGround(): ActorGround {
  return { grounded: false, source: 'none', normal: [0, 0, 0], hit: null, surface: null };
}

export interface ActorParamValues {
  walkSpeed: number; runSpeed: number; airAccel: number; airDecel: number; airMax: number;
  groundTurn: number; groundFastTurn: number; groundFastThreshold: number;
  airTurn: number; airFastTurn: number; airFastThreshold: number;
  leverThreshold: number; fallMax: number; jumpSpeed: number; jumpHoldSeconds: number;
}
export class ActorParams implements ActorParamValues {
  walkSpeed = F(2); runSpeed = F(6); airAccel = F(40); airDecel = F(40); airMax = F(6);
  groundTurn = F(360); groundFastTurn = F(1100); groundFastThreshold = F(85);
  airTurn = F(360); airFastTurn = F(1100); airFastThreshold = F(85);
  leverThreshold = F(.8); fallMax = F(49); jumpSpeed = F(13.5); jumpHoldSeconds = F(.12);
  readonly rawRows: readonly (readonly number[])[];
  readonly loadedRows: readonly (readonly number[])[];
  constructor(rows: readonly (readonly number[])[] | null = null, game: Partial<ActorParamValues> = {}) {
    if (rows && (rows.length !== 33 || rows.some(r => r.length !== 4 || r.some(n => !Number.isFinite(n))))) {
      throw new Error('ActorParam requires 33 finite rows of four components');
    }
    this.rawRows = Object.freeze((rows ?? []).map(r => Object.freeze([...r])));
    this.loadedRows = Object.freeze((rows ?? []).map((r, i) => {
      const value = v4(r);
      if ([22, 23, 25, 30, 31].includes(i)) value[0] = F(value[0] / 60);
      return Object.freeze(value);
    }));
    const keys: (keyof ActorParamValues)[] = ['runSpeed', 'walkSpeed', 'airAccel', 'groundTurn',
      'groundFastTurn', 'groundFastThreshold', 'airTurn', 'airFastTurn', 'airFastThreshold'];
    if (rows) {
      keys.forEach((key, i) => { this[key] = this.loadedRows[i][0]; });
      this.leverThreshold = this.loadedRows[32][0];
    }
    this.applyGame(game);
  }
  applyGame(values: Partial<ActorParamValues>): void {
    for (const key of Object.keys(values) as (keyof ActorParamValues)[]) {
      const value = values[key];
      if (value === undefined || !Number.isFinite(value)) throw new Error(`Invalid ActorParam ${key}`);
      this[key] = F(value);
    }
  }
}

export type PadLever = { angle: number; depth: number; type: 0 | 1 | 2 };
export type MoveLever = { depth: number; direction: V4; rotation: Q4 };
export type PadEdgePolicy = (kind: 'trigger' | 'release', packet: Readonly<PadPacket>, pad: ActorPad) => number;
export interface ActorPadSetup {
  moveAnalog: boolean; moveDpad: boolean; subdivisionCount: number;
  overlayMask: number; overlay: PadPacket; edgePolicy: PadEdgePolicy | null;
}
const copyPacket = (p: PadPacket): PadPacket => ({ hold: p.hold >>> 0, trigger: p.trigger >>> 0, release: p.release >>> 0, stick: v4(p.stick) });
export function zeroPacket(): PadPacket { return { hold: 0, trigger: 0, release: 0, stick: [0, 0, 0, 0] }; }
export class ActorPad {
  enabled = true;
  overlayEnabled = false;
  style = 0;
  inputStyle = 0;
  monitorStyle = 2;
  mask = 0xffffffff;
  normalMask = 0xffffffff;
  threshold = F(.1);
  readonly setup: ActorPadSetup;
  private packet = zeroPacket();
  private overlay: PadPacket;
  stickOverride: ((stick: V4) => V4) | null = null;
  readonly actionTests = new Map<bigint, (pad: ActorPad) => boolean>();
  constructor(setup: ActorPadSetup) {
    if (!Number.isInteger(setup.subdivisionCount) || setup.subdivisionCount < 0) throw new Error('Invalid subdivisionCount');
    this.setup = { ...setup, overlay: copyPacket(setup.overlay) };
    this.overlay = copyPacket(setup.overlay);
  }
  setInput(packet: PadPacket): void { this.packet = copyPacket(packet); }
  setOverlay(packet: Partial<PadPacket>): void {
    if (packet.hold !== undefined) this.overlay.hold = packet.hold >>> 0;
    if (packet.trigger !== undefined) this.overlay.trigger = packet.trigger >>> 0;
    if (packet.release !== undefined) this.overlay.release = packet.release >>> 0;
    if (packet.stick) this.overlay.stick = v4(packet.stick);
  }
  snapshot(): { raw: PadPacket; overlay: PadPacket } {
    return { raw: copyPacket(this.packet), overlay: copyPacket(this.overlay) };
  }
  private rotation(): number {
    const s = this.inputStyle, a = this.style, m = this.monitorStyle;
    if ((s === 3 && a === 1 && m !== 5) || (s !== 3 && a === 2 && m === 5)) return 1;
    if ((s === 3 && a === 1 && m === 5) || (s !== 3 && a === 2 && m !== 5)) return -1;
    return 0;
  }
  remap(bits: number): number {
    const r = this.rotation();
    if (!r) return bits >>> 0;
    const source = [0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19];
    const target = r === 1 ? [1, 3, 0, 2, 11, 10, 8, 9, 17, 18, 19, 16] : [2, 0, 3, 1, 10, 11, 9, 8, 19, 16, 17, 18];
    let value = bits & ~0xf0f0f;
    source.forEach((bit, i) => { if (bits & (1 << bit)) value |= 1 << target[i]; });
    return value >>> 0;
  }
  normalButtons(bits: number): number { return (this.remap(bits & this.normalMask) & this.mask) >>> 0; }
  getHold(): number {
    if (!this.enabled) return 0;
    return this.overlayEnabled ? (this.overlay.hold & this.mask & this.setup.overlayMask) >>> 0 : this.normalButtons(this.packet.hold);
  }
  private edge(kind: 'trigger' | 'release'): number {
    if (!this.enabled) return 0;
    if (!this.overlayEnabled && kind === 'trigger') return this.normalButtons(this.packet.trigger);
    if (!this.setup.edgePolicy) throw new Error(`R03: ${kind} requires an explicit PadEdgePolicy`);
    return this.setup.edgePolicy(kind, copyPacket(this.overlayEnabled ? this.overlay : this.packet), this) >>> 0;
  }
  getTrigger(): number { return this.edge('trigger'); }
  getRelease(): number { return this.edge('release'); }
  getStick(): V4 {
    if (!this.enabled) return [0, 0, 0, 0];
    const s = v4((this.overlayEnabled ? this.overlay : this.packet).stick);
    if (!this.overlayEnabled) {
      const r = this.rotation(), x = s[0], y = s[1];
      if (r === 1) { s[0] = y; s[1] = F(-x); }
      if (r === -1) { s[0] = F(-y); s[1] = x; }
    }
    return length4(s) < this.threshold ? [0, 0, 0, 0] : s;
  }
  getLever(): PadLever {
    const zero: PadLever = { angle: 0, depth: 0, type: 0 };
    if (!this.enabled) return zero;
    const dpad = this.getHold() & 0xf00;
    if (this.setup.moveDpad && dpad !== 0) {
      const index = (dpad - 0x100) >> 8;
      const angles = [-90, 90, 0, 0, -45, 45, 0, 180, -135, 135];
      return index < 10 && ((0x3bb >> index) & 1) ? { angle: angles[index], depth: 1, type: 1 } : zero;
    }
    if (!this.setup.moveAnalog) return zero;
    let s = this.getStick();
    if (this.stickOverride) s = v4(this.stickOverride(s));
    const depth = length4(s);
    if (!(depth > 0)) return zero;
    let angle = wrapDegrees(F(F(Math.atan2(s[0], -s[1])) * F(57.29578)));
    if (this.setup.subdivisionCount) {
      const k = F(F(this.setup.subdivisionCount * .5) / 180);
      angle = F(Math.trunc(F(angle * k)) / k);
    }
    return { angle, depth, type: 2 };
  }
  testAction(hash: bigint): boolean { return this.enabled && (this.actionTests.get(hash)?.(this) ?? false); }
}

export function wrapDegrees(deg: number): number {
  const r = F(((deg + 180) % 360 + 360) % 360 - 180);
  return r === -180 ? 180 : r;
}
export function yawQuaternionApprox(deg: number): Q4 {
  const wrapped = wrapDegrees(deg);
  if (wrapped === 0) return [0, 0, 0, 1];
  if (wrapped === 180) return [0, 1, 0, 0];
  if (Math.abs(wrapped) === 90) return [0, F(Math.sign(wrapped) * Math.SQRT1_2), 0, F(Math.SQRT1_2)];
  const h = F(F(deg * F(Math.PI / 180)) * .5);
  return [0, F(Math.sin(h)), 0, F(Math.cos(h))];
}
export function quaternionYawApprox(q: Q4): number {
  return F(F(Math.atan2(F(2 * F(F(q[3] * q[1]) + F(q[0] * q[2]))), F(1 - F(2 * F(F(q[1] * q[1]) + F(q[0] * q[0])))))) * F(180 / Math.PI));
}
export function rotateYawApprox(current: Q4, target: Q4, grounded: boolean, params: ActorParamValues, dt = STEP_SEC): Q4 {
  const yaw = quaternionYawApprox(current), delta = wrapDegrees(F(quaternionYawApprox(target) - yaw));
  const fast = Math.abs(delta) >= (grounded ? params.groundFastThreshold : params.airFastThreshold);
  const speed = grounded ? (fast ? params.groundFastTurn : params.groundTurn) : (fast ? params.airFastTurn : params.airTurn);
  const step = F(speed * dt);
  if (Math.abs(delta) <= step) return v4(target);
  return yawQuaternionApprox(wrapDegrees(F(yaw + Math.max(-step, Math.min(step, delta)))));
}
export function substepCount(dt: number, minimum = false): number {
  if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid actor dt');
  return Math.trunc(F(F(F(dt) * 60) + .5)) || (minimum ? 1 : 0);
}
export function horizontalIntegrate(max: number, decel: number, velocity: V4, acceleration: V4, n: number): { velocity: V4; delta: V4 } {
  const v = v4(velocity), delta: V4 = [0, 0, 0, 0];
  if (n <= 0) return { velocity: v, delta };
  if (!(max >= 0)) throw new Error('Negative horizontal maximum');
  const a = acceleration.map(x => F(x * STEP_SEC)), d = F(decel / 60);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 3; j++) v[j] = F(v[j] + a[j]);
    if (d > 0) {
      const speed = length4(v);
      if (d < speed) {
        const next = F(speed - d), inv = F(1 / speed);
        for (let j = 0; j < 3; j++) v[j] = F(F(v[j] * next) * inv);
        v[3] = 0;
      } else v.fill(0);
    }
    const speed = length4(v);
    if (max < speed) {
      const ratio = F(max / speed);
      for (let j = 0; j < 3; j++) v[j] = F(v[j] * ratio);
      v[3] = 0;
    }
    for (let j = 0; j < 3; j++) delta[j] = F(delta[j] + F(v[j] * STEP_SEC));
  }
  return { velocity: v, delta };
}
export class JumpCalculator {
  factor = F(5);
  active = false;
  startFrame = -1;
  holdFrameMax = 0;
  counter = 0;
  private hold = false;
  private lastFrame = -1;
  start(frameId: number, holdFrameMax: number): void {
    this.active = true; this.startFrame = frameId; this.holdFrameMax = holdFrameMax;
    this.counter = 0; this.lastFrame = -1; this.hold = false;
  }
  reset(): void { this.active = false; this.factor = F(5); this.hold = false; this.counter = 0; this.lastFrame = -1; }
  static accelerationY(vy: number): number {
    vy = F(vy);
    if (vy >= 5) return F(-150);
    if (vy >= 4) return F(-150 + F(F(F(vy - 5) / F(4 - 5)) * F(-25 + 150)));
    if (vy >= -10) return F(-25 + F(F(F(vy - 4) / F(-10 - 4)) * F(-49 + 25)));
    return F(-49);
  }
  update(vy: number, frameId: number): void {
    if (!this.active) { this.factor = F(5); this.hold = false; return; }
    this.hold = frameId === this.startFrame && this.counter < this.holdFrameMax;
    this.factor = F(JumpCalculator.accelerationY(vy) / F(-9.8));
    if (this.lastFrame !== frameId) { this.counter++; this.lastFrame = frameId; }
  }
  isHold(): boolean { return this.hold; }
}

class RefTable<T> {
  private rows: { generation: number; value: T | null }[] = [];
  add(value: T): Ref {
    let index = this.rows.findIndex(r => r.value === null);
    if (index < 0) { index = this.rows.length; this.rows.push({ generation: 1, value: null }); }
    const row = this.rows[index]; row.value = value;
    return { index, generation: row.generation };
  }
  get(ref: Ref): T | null {
    const row = this.rows[ref.index];
    return row?.generation === ref.generation ? row.value : null;
  }
  remove(ref: Ref): T | null {
    const value = this.get(ref);
    if (value !== null) { this.rows[ref.index].value = null; this.rows[ref.index].generation++; }
    return value;
  }
  snapshot(): Ref[] {
    return this.rows.flatMap((r, index) => r.value === null ? [] : [{ index, generation: r.generation }]);
  }
}
export interface ActorCondition {
  step(dt: number): number;
  destroy(): void;
  suspended?(): void;
}
export class ConditionSet {
  private table = new RefTable<{ hash: bigint; condition: ActorCondition }>();
  private names = new Map<bigint, Ref>();
  private closed = false;
  get(hash: bigint): Ref | null {
    const ref = this.names.get(hash);
    return ref && this.table.get(ref) ? { ...ref } : null;
  }
  alive(ref: Ref): boolean { return this.table.get(ref) !== null; }
  set(hash: bigint, replace: boolean, factory: () => ActorCondition | null): Ref | null {
    if (this.closed) return null;
    const old = this.get(hash);
    if (old && !replace) return old;
    if (old) this.delete(old);
    if (this.closed) return null;
    const concurrent = this.get(hash);
    if (concurrent) return concurrent;
    const condition = factory();
    if (!condition) return null;
    if (this.closed || this.get(hash)) { condition.destroy(); return this.get(hash); }
    const ref = this.table.add({ hash, condition }); this.names.set(hash, ref);
    return { ...ref };
  }
  delete(ref: Ref): boolean {
    const row = this.table.remove(ref);
    if (!row) return false;
    if (sameRef(this.names.get(row.hash) ?? INVALID_REF, ref)) this.names.delete(row.hash);
    row.condition.destroy();
    return true;
  }
  suspend(ref: Ref): boolean {
    const row = this.table.get(ref);
    if (!row) return false;
    row.condition.suspended?.();
    if (this.alive(ref)) this.delete(ref);
    return true;
  }
  step(dt = STEP_SEC): void {
    const snapshot = [...this.names.values()].map(r => ({ ...r }));
    for (const ref of snapshot) {
      const row = this.table.get(ref);
      if (!row) continue;
      const result = row.condition.step(dt);
      if (this.alive(ref) && result === 1) this.delete(ref);
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const ref of this.table.snapshot()) this.delete(ref);
  }
}
export class FrameDisplacementSlots {
  private table = new RefTable<{ hash: bigint; callback: ((dt: number) => V4) | null }>();
  private names = new Map<bigint, Ref>();
  private closed = false;
  create(hash: bigint, replace = false): Ref {
    if (this.closed) return { ...INVALID_REF };
    const old = this.names.get(hash);
    if (old && this.table.get(old)) { if (!replace) return { ...old }; this.delete(old); }
    const ref = this.table.add({ hash, callback: null }); this.names.set(hash, ref);
    return { ...ref };
  }
  alive(ref: Ref): boolean { return this.table.get(ref) !== null; }
  setStepFunction(ref: Ref, callback: ((dt: number) => V4) | null): boolean {
    const row = this.table.get(ref); if (!row) return false;
    row.callback = callback; return true;
  }
  delete(ref: Ref): boolean {
    const row = this.table.remove(ref); if (!row) return false;
    if (sameRef(this.names.get(row.hash) ?? INVALID_REF, ref)) this.names.delete(row.hash);
    return true;
  }
  step(dt = STEP_SEC): V4 {
    const sum: V4 = [0, 0, 0, 0];
    const snapshot = [...this.names.values()].map(r => ({ ...r }));
    for (const ref of snapshot) {
      const row = this.table.get(ref); if (!row) continue;
      const delta = row.callback?.(dt) ?? [0, 0, 0, 0];
      if (!this.alive(ref)) continue;
      for (let i = 0; i < 4; i++) sum[i] = F(sum[i] + F(delta[i]));
    }
    return sum;
  }
  dispose(): void { this.closed = true; for (const ref of this.table.snapshot()) this.delete(ref); }
}
const copyRegistration = (d: ActorRegistration): ActorRegistration => ({ ...d, entity: { ...d.entity }, position: v3(d.position), rotation: v4(d.rotation) });
const copyShape = (d: ActorShape): ActorShape => ({ ...d, owner: { ...d.owner }, actor: { ...d.actor }, ref: { ...d.ref }, center: v3(d.center), rotation: v4(d.rotation),
  geometry: d.geometry.kind === 'box' ? { ...d.geometry, halfExtents: v3(d.geometry.halfExtents) } : { ...d.geometry } });
export class ActorContactRegistry implements ActorRegistryPort {
  private actors = new RefTable<ActorRegistration>();
  private shapes = new RefTable<ActorShape>();
  constructor(readonly entityAlive: (entity: Ref) => boolean) {}
  actorInfo(ref: Ref): Readonly<ActorRegistration> | null {
    const d = this.actors.get(ref); return d && this.entityAlive(d.entity) ? d : null;
  }
  shapeInfo(ref: Ref): Readonly<ActorShape> | null {
    const d = this.shapes.get(ref); return d && this.entityAlive(d.owner) && this.actorAlive(d.actor) ? d : null;
  }
  actorAlive(ref: Ref): boolean { return this.actorInfo(ref) !== null; }
  shapeAlive(ref: Ref): boolean { return this.shapeInfo(ref) !== null; }
  snapshotActors(out: Ref[]): number { out.length = 0; out.push(...this.actors.snapshot().filter(r => this.actorAlive(r))); return out.length; }
  snapshotShapes(actor: Ref, out: Ref[]): number {
    out.length = 0;
    for (const ref of this.shapes.snapshot()) {
      const d = this.shapeInfo(ref); if (d && sameRef(d.actor, actor)) out.push(ref);
    }
    return out.length;
  }
  registerActor(desc: ActorRegistration): Ref {
    return this.entityAlive(desc.entity) ? this.actors.add(copyRegistration(desc)) : { ...INVALID_REF };
  }
  registerShape(actor: Ref, desc: ActorShapeDesc): Ref {
    if (!this.actorAlive(actor) || !this.entityAlive(desc.owner)) return { ...INVALID_REF };
    const d = copyShape({ ...desc, actor, ref: { ...INVALID_REF } });
    const ref = this.shapes.add(d); d.ref = { ...ref }; return ref;
  }
  updateActor(actor: Ref, desc: ActorRegistration): boolean {
    const row = this.actorInfo(actor);
    if (!row || !sameRef(row.entity, desc.entity) || !this.entityAlive(desc.entity)) return false;
    Object.assign(row, copyRegistration(desc)); return true;
  }
  updateShape(ref: Ref, desc: ActorShapeDesc): boolean {
    const row = this.shapeInfo(ref); if (!row || !this.entityAlive(desc.owner)) return false;
    Object.assign(row, copyShape({ ...desc, actor: row.actor, ref })); return true;
  }
  unregisterShape(ref: Ref): boolean { return this.shapes.remove(ref) !== null; }
  unregisterActor(ref: Ref): boolean {
    if (!this.actors.remove(ref)) return false;
    for (const sh of this.shapes.snapshot()) if (sameRef(this.shapes.get(sh)!.actor, ref)) this.shapes.remove(sh);
    return true;
  }
}

export type ActionContext = { actor: ActorCore; enter: boolean; arg: number };
export type ActorAction = (context: ActionContext) => number;
export class ActionRegistry {
  private callbacks = new Map<bigint, ActorAction>();
  register(hash: bigint, action: ActorAction): void { this.callbacks.set(hash, action); }
  erase(hash: bigint): boolean { return this.callbacks.delete(hash); }
  get(hash: bigint): ActorAction | null { return this.callbacks.get(hash) ?? null; }
  dispose(): void { this.callbacks.clear(); }
}
export type BasicActionName = 'Idle' | 'Walk' | 'Run' | 'Jump' | 'Fall' | 'Landing';
export type BasicActionSetup = {
  hashes: Record<BasicActionName, bigint>;
  motions: Partial<Record<BasicActionName, ActorMotionArg>>;
  landingEnabled: boolean;
  groundInput: ((actor: ActorCore) => number) | null;
  airInput: ((actor: ActorCore) => number) | null;
  groundLever: ((actor: ActorCore) => number) | null;
};
export interface ActorCoreSetup {
  ref: Ref; ports: ActorPorts; pad: ActorPad; params: ActorParams;
  position: V4; rotation: Q4; leverReference: V4; verticalReference: V4;
  rotationMode: 'yaw-approx' | 'external';
  rotate?: (actor: ActorCore) => Q4;
  moveLever: (pad: ActorPad, actor: ActorCore) => MoveLever;
  selectGround: ActorCollisionConfig['selectGround'];
  groundedLimitY: number | null;
  jumpCalculator: JumpCalculator | null;
}
export type ActorJob =
  | { kind: 'map'; mapMask: number; classMask: number; adjust?: (contact: ActorMapContact) => void }
  | { kind: 'ground'; mapMask: number; localLimit?: (actor: ActorCore) => boolean }
  | { kind: 'limit'; localLimit?: (actor: ActorCore) => boolean }
  | { kind: 'actor-body'; consume: ((contacts: readonly ActorPairContact[], actor: ActorCore) => void) | null };
export class ActorCore {
  readonly actions = new ActionRegistry();
  readonly conditions = new ConditionSet();
  readonly slots = new FrameDisplacementSlots();
  readonly ref: Ref;
  readonly ports: ActorPorts;
  readonly params: ActorParams;
  readonly pad: ActorPad;
  position: V4; oldPosition: V4; rotation: Q4; targetRotation: Q4;
  vLever: V4; vVert: V4;
  gdir: V4 = [0, -1, 0, 0];
  gmag = F(9.8); gravityScale = F(1); gravityEnabled = true;
  groundedFlag = true; groundedTestEnabled = true; groundedCheckEnabled = true;
  jumpStatus: 0 | 1 | 2 = 0;
  active = true; suspended = false; inputBlocked = false;
  autoRotateRunning = false; autoPositionRunning = false;
  fallAccumulator = 0;
  frameId = -1; readonly dt = STEP_SEC; substeps = 0;
  actionHash = 0x423edd2ebdc8bc49n;
  defaultActionHash = 0x423edd2ebdc8bc49n;
  actionTime = 0;
  acceleration: V4 = [0, 0, 0, 0]; deceleration = 0;
  lever: MoveLever = { depth: 0, direction: [0, 0, 0, 0], rotation: [0, 0, 0, 1] };
  ground = emptyGround();
  afterControl: ((actor: ActorCore) => void) | null = null;
  private disposed = false;
  private tickFrame = -1;
  private postCollisionFrame = -1;
  private stamp: StepStamp = { frameId: -1, phase: 'pre', pass: 0, sequence: 0, poseEpoch: 0 };
  private executing: ActorAction | null = null;
  private basic: BasicActionSetup | null = null;
  constructor(readonly setup: ActorCoreSetup) {
    this.ref = { ...setup.ref }; this.ports = setup.ports; this.params = setup.params; this.pad = setup.pad;
    if (!this.ports.registry.actorAlive(this.ref)) throw new Error('ActorCore requires a live registry actor');
    if (setup.rotationMode === 'external' && !setup.rotate) throw new Error('External rotation requires a callback');
    this.position = v4(setup.position); this.oldPosition = v4(setup.position);
    this.rotation = v4(setup.rotation); this.targetRotation = v4(setup.rotation);
    this.vLever = v4(setup.leverReference); this.vVert = v4(setup.verticalReference);
    this.publishPose();
  }
  get alive(): boolean { return !this.disposed && this.ports.registry.actorAlive(this.ref); }
  get grounded(): boolean { return !this.groundedTestEnabled || (this.groundedFlag && this.jumpStatus !== 1); }
  setInput(packet: PadPacket): void { this.pad.setInput(packet); }
  setOverlay(packet: Partial<PadPacket>): void { this.pad.setOverlay(packet); }
  registerAction(hash: bigint, action: ActorAction): void { if (this.alive) this.actions.register(hash, action); }
  eraseAction(hash: bigint): boolean { return this.actions.erase(hash); }
  setActionName(hash: bigint, force = false): number {
    if (!this.alive) return 0;
    if (!force && this.actionHash === hash) return 3;
    const previous = this.actionHash; this.actionHash = hash; this.actionTime = 0;
    this.emit({ kind: 'action-changed', origin: 'design', fromHash: previous, toHash: hash, enter: true, arg: 0 });
    return 6;
  }
  callAction(hash: bigint, enter = true, arg = 0): number {
    if (!this.alive) return 0;
    const callback = this.actions.get(hash); if (!callback) return 0;
    const previous = this.executing; this.executing = callback;
    try { return callback({ actor: this, enter, arg }); } finally { this.executing = previous; }
  }
  callActionContext(hash: bigint, context: Omit<ActionContext, 'actor'>): number {
    if (!this.alive) return 0;
    if (!context.enter && this.executing) return this.executing({ actor: this, ...context });
    return this.callAction(hash, context.enter, context.arg);
  }
  installBasicActions(setup: BasicActionSetup): void {
    this.basic = setup; this.defaultActionHash = setup.hashes.Idle;
    const masks: Record<BasicActionName, number> = { Idle: 0x38, Walk: 0x68, Run: 0x58, Jump: 0x89, Fall: 0x09, Landing: 0x3a };
    for (const name of Object.keys(masks) as BasicActionName[]) {
      this.registerAction(setup.hashes[name], context => {
        if (name === 'Jump' && context.enter && context.arg !== 0) throw new Error('R18: reflection/push Jump is unsupported');
        if (context.enter) {
          const result = this.setActionName(setup.hashes[name]);
          if (!this.alive || this.actionHash !== setup.hashes[name] || result === 3) return result;
          if (name === 'Idle' || name === 'Landing') this.vLever = v4(this.setup.leverReference);
          if (name === 'Jump') this.startJump(this.params.jumpSpeed);
          const motion = setup.motions[name];
          if (motion) this.ports.motion({ kind: 'play', slot: 'main', arg: { ...motion } });
          if (!this.alive || this.actionHash !== setup.hashes[name]) return result;
          if (name === 'Walk' || name === 'Run') this.moveGround(name === 'Walk' ? this.params.walkSpeed : this.params.runSpeed);
          if (name === 'Jump' || name === 'Fall') this.moveAir();
          return result;
        }
        const result = this.defaultAction(masks[name]);
        if (result > 4 || !this.alive) return result;
        if (name === 'Walk' || name === 'Run') this.moveGround(name === 'Walk' ? this.params.walkSpeed : this.params.runSpeed);
        if (name === 'Jump' || name === 'Fall') this.moveAir();
        return result;
      });
    }
    this.callAction(setup.hashes.Idle);
  }
  defaultAction(mask: number): number {
    const s = this.basic; if (!s) return 4;
    if (!(mask & 1)) {
      let result = 4;
      if (!this.grounded) { result = this.callAction(s.hashes.Fall); if (result > 4 || !this.alive) return result; }
      const motion = mask & 2 ? this.ports.motionState() : null;
      const finished = motion !== null && (!motion.present || motion.playback === 3);
      if (!this.alive) return 0;
      if ((mask & 4) && !finished) return result;
      if ((mask & 8) && s.groundInput) { result = s.groundInput(this); if (result > 4 || !this.alive) return result; }
      if ((mask & 0x40) && s.groundLever) { result = s.groundLever(this); if (result > 4 || !this.alive) return result; }
      if (mask & 0x30) {
        const name = this.lever.depth >= this.params.leverThreshold ? 'Run' : this.lever.depth > 0 ? 'Walk' : 'Idle';
        if (name !== 'Idle') { result = this.callAction(s.hashes[name]); if (result > 4 || !this.alive) return result; }
      }
      if (mask & 2) { if (!finished) return result; }
      else if (!finished && this.lever.depth !== 0) return result;
      return this.callAction(s.hashes.Idle);
    }
    const d = dot4(this.vVert, this.gdir);
    if (d >= 0 && this.grounded) return this.callAction(s.hashes[d > -1 && s.landingEnabled ? 'Landing' : 'Idle']);
    const motion = mask & 2 ? this.ports.motionState() : null;
    const finished = motion !== null && (!motion.present || motion.playback === 3);
    if (!this.alive) return 0;
    if ((mask & 4) && !finished) return 4;
    if ((mask & 8) && s.airInput) { const result = s.airInput(this); if (result > 4 || !this.alive) return result; }
    if (((mask & 0x80) === 0 || d < 0) && !finished) return 4;
    return this.callAction(s.hashes.Fall);
  }
  startJump(speed: number): void {
    this.gravityEnabled = true; this.gravityScale = 1; this.jumpStatus = 1;
    for (let i = 0; i < 3; i++) this.vVert[i] = F(-this.gdir[i] * F(speed));
    this.vVert[3] = 0;
    this.setup.jumpCalculator?.start(this.frameId, Math.trunc(F(this.params.jumpHoldSeconds * 60)));
  }
  moveGround(speed: number): void {
    if (!(this.lever.depth > 0)) { this.vLever.fill(0); return; }
    this.targetRotation = v4(this.lever.rotation);
    this.vLever = this.lever.direction.map(x => F(x * speed)) as V4;
  }
  moveAir(): void {
    this.jumpStatus = dot4(this.vVert, this.gdir) > 0 ? 2 : 1;
    if (this.lever.depth > 0) {
      this.targetRotation = v4(this.lever.rotation);
      const multiplier = !this.autoRotateRunning && !this.autoPositionRunning && this.lever.depth < this.params.leverThreshold ? F(.075) : 1;
      this.acceleration = this.lever.direction.map(x => F(F(x * this.params.airAccel) * multiplier)) as V4;
    } else this.deceleration = this.params.airDecel;
  }
  private publishPose(): void {
    const d = this.ports.registry.actorInfo(this.ref);
    if (d) this.ports.registry.updateActor(this.ref, { ...d, position: v3(this.position), rotation: v4(this.rotation) });
  }
  setPosition(request: V4): void {
    if (!this.alive) return;
    const out = v4(request); this.ports.finalPosition(v4(request), out);
    if (!this.alive) return;
    this.position = v4(out); this.publishPose();
  }
  teleport(position: V4, rotation: Q4): void {
    if (!this.alive) return;
    this.rotation = v4(rotation); this.targetRotation = v4(rotation); this.setPosition(position);
    this.oldPosition = v4(this.position); this.ground = emptyGround(); this.fallAccumulator = 0;
  }
  preFrame(frameId: number): void {
    if (!Number.isSafeInteger(frameId) || frameId < 0 || frameId <= this.frameId) throw new Error('Actor frameId must increase');
    this.frameId = frameId; this.stamp = { frameId, phase: 'pre', pass: 0, sequence: 0, poseEpoch: this.ports.registry.actorInfo(this.ref)?.poseEpoch ?? 0 };
    if (!this.alive || !this.active || this.suspended) return;
    if (!this.actions.get(this.actionHash)) this.callAction(this.defaultActionHash);
    if (!this.alive) return;
    this.jumpStatus = 0; this.acceleration.fill(0); this.deceleration = 0;
  }
  tick(): void {
    if (this.frameId < 0 || this.tickFrame === this.frameId) throw new Error('Call preFrame once before each actor tick');
    this.tickFrame = this.frameId; this.stamp.phase = 'tick';
    if (!this.alive || !this.active || this.suspended) return;
    this.lever = this.inputBlocked ? { depth: 0, direction: [0, 0, 0, 0], rotation: v4(this.rotation) } : this.setup.moveLever(this.pad, this);
    if (!this.alive) return;
    this.conditions.step(this.dt);
    if (!this.alive) return;
    this.actionTime = F(this.actionTime + this.dt); this.oldPosition = v4(this.position);
    this.gmag = F(this.ports.gravity(this.gdir)); this.gdir = v4(this.gdir);
    if (!this.alive) return;
    this.callAction(this.actionHash, false);
    if (!this.alive) return;
    this.integrate();
    if (!this.alive) return;
    const rotated = this.setup.rotationMode === 'yaw-approx' ? rotateYawApprox(this.rotation, this.targetRotation, this.grounded, this.params, this.dt) : this.setup.rotate!(this);
    if (!this.alive) return;
    this.rotation = v4(rotated); this.publishPose();
    this.afterControl?.(this);
  }
  postCollision(): void {
    if (this.frameId < 0 || this.tickFrame !== this.frameId || this.postCollisionFrame === this.frameId) throw new Error('Call postCollision once after actor tick and before ground');
    this.postCollisionFrame = this.frameId; this.stamp.phase = 'post-collision';
    if (!this.alive || !this.groundedTestEnabled || (this.groundedFlag && this.jumpStatus !== 1)) return;
    if (dot4(this.gdir, this.vVert) <= 0) { this.fallAccumulator = 0; return; }
    const delta = this.position.map((x, i) => F(x - this.oldPosition[i])) as V4;
    const distance = dot4(this.gdir, delta);
    if (distance > 0) this.fallAccumulator = F(this.fallAccumulator + distance);
  }
  private integrate(): void {
    this.substeps = substepCount(this.dt);
    const h = horizontalIntegrate(this.grounded ? FLT_MAX : this.params.airMax, this.deceleration, this.vLever, this.acceleration, this.substeps);
    this.vLever = h.velocity;
    const position = v4(this.position);
    if (!this.autoRotateRunning || this.autoPositionRunning) for (let i = 0; i < 4; i++) position[i] = F(position[i] + h.delta[i]);
    const scale = this.gravityScale, calc = this.setup.jumpCalculator;
    if (this.gravityEnabled) for (let n = 0; n < this.substeps; n++) {
      if (this.grounded) { this.jumpStatus = 0; calc?.reset(); this.vVert = v4(this.setup.verticalReference); }
      calc?.update(this.vVert[1], this.frameId);
      if (scale !== 0 && (!calc || !calc.isHold())) {
        let acc = F(scale * this.gmag); if (calc) acc = F(acc * calc.factor);
        for (let i = 0; i < 3; i++) this.vVert[i] = F(this.vVert[i] + F(F(this.gdir[i] * acc) * STEP_SEC));
        const d = dot4(this.vVert, this.gdir);
        if (this.params.fallMax < d) {
          const correction = F(this.params.fallMax - d);
          for (let i = 0; i < 4; i++) this.vVert[i] = F(this.vVert[i] + F(this.gdir[i] * correction));
        }
      }
      for (let i = 0; i < 3; i++) position[i] = F(position[i] + F(this.vVert[i] * STEP_SEC));
    }
    const extra = this.slots.step(this.dt);
    if (!this.alive) return;
    for (let i = 0; i < 4; i++) position[i] = F(position[i] + extra[i]);
    this.setPosition(position);
  }
  private emit(event: ActorEvent extends infer E ? E extends ActorEvent ? Omit<E, 'actor' | 'stamp'> : never : never): void {
    if (!this.alive) return;
    this.ports.event({ ...event, actor: { ...this.ref }, stamp: { ...this.stamp, sequence: this.stamp.sequence++ } } as ActorEvent);
  }
  jumpStamp(): void { this.emit({ kind: 'jump-stamp', origin: 'original-call', originalCode: 9 }); }
  collisionJobs(stamp: StepStamp, job: ActorJob): void {
    if (stamp.frameId !== this.frameId || stamp.phase !== job.kind) throw new Error('Actor job stamp does not match frame/phase');
    if (!this.alive || !this.active) return;
    this.stamp = { ...stamp, sequence: Math.max(this.stamp.sequence, stamp.sequence) };
    this.ports.collision.beginPhase({ ...this.stamp });
    if (!this.alive) return;
    if (job.kind === 'ground') { this.groundJob(job.mapMask, job.localLimit); return; }
    if (job.kind === 'limit') { this.limitJob(job.localLimit); return; }
    if (job.kind === 'actor-body') {
      if (!job.consume) throw new Error('R18/R19: actor-body response requires an explicit policy');
      const pairs: ActorPairContact[] = []; this.ports.collision.actorContacts(this.ref, pairs);
      if (this.alive) job.consume(pairs, this);
      return;
    }
    const refs: Ref[] = []; this.ports.registry.snapshotShapes(this.ref, refs);
    const contacts: ActorMapContact[] = [];
    for (const ref of refs) {
      const shape = this.ports.registry.shapeInfo(ref);
      if (!shape?.enabled || !(shape.classMask & job.classMask)) continue;
      const found: ActorMapContact[] = []; this.ports.collision.mapContacts(shape, job.mapMask, found);
      for (const c of found) {
        if (!this.alive) return;
        if (!this.ports.registry.shapeAlive(c.actorShape) || !this.ports.registry.entityAlive(c.entity)) continue;
        job.adjust?.(c);
        if (!this.alive) return;
        if (this.ports.registry.shapeAlive(c.actorShape) && this.ports.registry.entityAlive(c.entity) && c.depth > F(.01)) contacts.push(c);
      }
    }
    const sum: V4 = [0, 0, 0, 0]; let count = 0;
    for (const c of contacts) {
      if (!this.ports.registry.shapeAlive(c.actorShape) || !this.ports.registry.entityAlive(c.entity)) continue;
      for (let i = 0; i < 3; i++) sum[i] = F(sum[i] + c.adjusted[i]);
      count++;
    }
    if (count) {
      const inv = F(1 / count), p = v4(this.position);
      for (let i = 0; i < 3; i++) p[i] = F(p[i] + F(sum[i] * inv));
      this.setPosition(p);
    }
  }
  private limitJob(local?: (actor: ActorCore) => boolean): boolean {
    if (local) {
      const grounded = local(this);
      if (!this.alive) return false;
      if (grounded) this.groundedFlag = true;
      return grounded;
    }
    const limit = this.setup.groundedLimitY;
    if (limit !== null && this.position[1] <= F(limit)) {
      const p = v4(this.position); p[1] = F(limit); this.setPosition(p);
      if (!this.alive) return false;
      this.groundedFlag = true; return true;
    }
    return false;
  }
  private groundJob(mask: number, localLimit?: (actor: ActorCore) => boolean): void {
    if (!this.groundedCheckEnabled) return;
    const previous = this.grounded; this.groundedFlag = false;
    const d = Math.max(dot4(this.vVert.map(x => F(x * this.dt)) as V4, this.gdir), F(.01));
    const distance = F(d + F(.4)), refs: Ref[] = [], accepted: ActorHit[] = [], sources: ('sweep' | 'ray')[] = [];
    this.ports.registry.snapshotShapes(this.ref, refs);
    const accept = (hit: ActorHit, source: 'sweep' | 'ray'): boolean => {
      if (hit.validity !== 0 || (this.jumpStatus !== 0 && hit.distance > F(d + F(.01))) || hit.normal[1] < F(.707)) return false;
      if (!this.ports.registry.entityAlive(hit.entity)) return false;
      if (hit.distance > F(d + F(source === 'sweep' ? .02 : .01))) {
        const p = v4(this.position), delta = F(hit.distance - d);
        for (let i = 0; i < 3; i++) p[i] = F(p[i] + F(this.gdir[i] * delta));
        this.setPosition(p);
      }
      if (!this.alive) return false;
      this.groundedFlag = true;
      accepted.push(copyActorHit(hit)); sources.push(source);
      if (source === 'sweep') this.emit({ kind: 'ground-contact', origin: 'original-call', hit: copyActorHit(hit) });
      return true;
    };
    for (const ref of refs) {
      if (!this.alive) return;
      const shape = this.ports.registry.shapeInfo(ref);
      if (!shape?.enabled || !(shape.classMask & 2)) continue;
      const start = v3(this.position);
      for (let i = 0; i < 3; i++) start[i] = F(start[i] - F(this.gdir[i] * d));
      const hit = emptyActorHit();
      if (this.ports.collision.sweep(shape, start, this.rotation, v3(this.gdir), distance, mask, shape.owner, hit) && this.ports.registry.shapeAlive(ref)) accept(hit, 'sweep');
    }
    if (!this.alive) return;
    if (!this.grounded) {
      const hit = emptyActorHit(), entity = this.ports.registry.actorInfo(this.ref)!.entity;
      const origin = v3(this.position);
      for (let i = 0; i < 3; i++) origin[i] = F(origin[i] - F(this.gdir[i] * d));
      if (this.ports.collision.ray(origin, v3(this.gdir), distance, mask, entity, hit)) accept(hit, 'ray');
    }
    if (!this.alive) return;
    const limited = this.limitJob(localLimit);
    if (!this.alive) return;
    const next = emptyGround(); next.grounded = this.grounded;
    if (limited) next.source = 'limit';
    else if (accepted.length) {
      const index = this.setup.selectGround(accepted, accepted.length);
      if (!this.alive) return;
      if (!Number.isInteger(index) || index < -1 || index >= accepted.length) throw new Error('Invalid selectGround index');
      if (index >= 0 && this.ports.registry.entityAlive(accepted[index].entity)) {
        const hit = accepted[index], surface: ActorSurface = { body: hit.body, entity: { ...hit.entity }, shape: hit.shape,
          faceIndex: hit.faceIndex, tag: hit.tag, physicsMaterial: null, groundKey: null };
        next.source = sources[index]; next.hit = copyActorHit(hit); next.normal = [...hit.normal];
        if (this.ports.collision.resolveSurface(hit, surface)) next.surface = surface;
      }
    }
    if (!this.alive) return;
    this.ground = next; this.emit({ kind: 'ground-state', origin: 'design', previous, ground: next });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.active = false;
    this.slots.dispose(); this.conditions.dispose(); this.actions.dispose();
    this.ground = emptyGround(); this.afterControl = null; this.executing = null;
  }
}
