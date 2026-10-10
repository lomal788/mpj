import { VirtualMotionApprox, snapshotMotion, type MotionPacket, type MotionSample, type Q4, type V3, type VirtualMotionProfile } from '../motion';

function editable(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  return !!node?.closest?.('input,select,textarea,button,[contenteditable="true"]');
}

export class KeyboardMouseMotion {
  private readonly core: VirtualMotionApprox;
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, [number, number]>();
  private mouseTilt: [number, number] = [0, 0];
  private closed = false;
  private readonly keydown = (event: Event): void => {
    const e = event as KeyboardEvent;
    if (this.closed || editable(e.target)) return;
    if (!['Space', 'KeyF', 'KeyH', 'KeyT', 'KeyG'].includes(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Space' && !this.keys.has(e.code)) this.core.trigger();
    this.keys.add(e.code); this.update();
  };
  private readonly keyup = (event: Event): void => {
    const e = event as KeyboardEvent;
    this.keys.delete(e.code); this.update();
  };
  private readonly pointerdown = (event: Event): void => {
    const e = event as PointerEvent;
    if (this.closed || e.pointerType === 'touch' || e.button !== 0 || editable(e.target) || this.acceptPointer && !this.acceptPointer(e)) return;
    if (!this.pointers.has(e.pointerId)) this.core.trigger();
    this.pointers.set(e.pointerId, [e.clientX ?? 0, e.clientY ?? 0]); this.update();
  };
  private readonly pointermove = (event: Event): void => {
    const e = event as PointerEvent;
    const origin = this.pointers.get(e.pointerId);
    if (!origin) return;
    this.mouseTilt = [(origin[1] - e.clientY) / this.dragPixels, (e.clientX - origin[0]) / this.dragPixels]; this.update();
  };
  private readonly pointerup = (event: Event): void => {
    this.pointers.delete((event as PointerEvent).pointerId);
    if (this.pointers.size === 0) this.mouseTilt = [0, 0];
    this.update();
  };
  private readonly blur = (): void => { this.keys.clear(); this.pointers.clear(); this.mouseTilt = [0, 0]; this.core.reset(); };
  constructor(private readonly target: EventTarget, profile: VirtualMotionProfile,
    private readonly acceptPointer: ((event: PointerEvent) => boolean) | null = null, private readonly dragPixels = 100) {
    if (!(dragPixels > 0) || !Number.isFinite(dragPixels)) throw new Error('Invalid mouse motion drag size');
    this.core = new VirtualMotionApprox(profile);
    target.addEventListener('keydown', this.keydown); target.addEventListener('keyup', this.keyup);
    target.addEventListener('pointerdown', this.pointerdown); target.addEventListener('pointerup', this.pointerup);
    target.addEventListener('pointermove', this.pointermove);
    target.addEventListener('pointercancel', this.blur); target.addEventListener('blur', this.blur);
  }
  private update(): void {
    this.core.action(this.keys.has('Space') || this.pointers.size > 0);
    this.core.setTilt(this.pointers.size ? this.mouseTilt[0] : Number(this.keys.has('KeyT')) - Number(this.keys.has('KeyG')),
      this.pointers.size ? this.mouseTilt[1] : Number(this.keys.has('KeyH')) - Number(this.keys.has('KeyF')));
  }
  submit(): MotionPacket {
    if (this.closed) return snapshotMotion({ profile: this.core.profile.id, revision: this.core.profile.revision, valid: false, reset: true, sample: null });
    return this.core.submit();
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.blur();
    this.target.removeEventListener('keydown', this.keydown); this.target.removeEventListener('keyup', this.keyup);
    this.target.removeEventListener('pointerdown', this.pointerdown); this.target.removeEventListener('pointerup', this.pointerup);
    this.target.removeEventListener('pointermove', this.pointermove);
    this.target.removeEventListener('pointercancel', this.blur); this.target.removeEventListener('blur', this.blur);
  }
}

export class TouchMotion {
  private readonly core: VirtualMotionApprox;
  private pointer: number | null = null;
  private origin: [number, number] = [0, 0];
  private closed = false;
  private readonly down = (event: Event): void => {
    const e = event as PointerEvent;
    if (this.closed || e.pointerType !== 'touch' || this.pointer !== null || editable(e.target)) return;
    this.pointer = e.pointerId; this.origin = [e.clientX, e.clientY];
    this.core.action(true); e.preventDefault();
  };
  private readonly move = (event: Event): void => {
    const e = event as PointerEvent;
    if (e.pointerId !== this.pointer) return;
    this.core.setTilt((this.origin[1] - e.clientY) / this.dragPixels, (e.clientX - this.origin[0]) / this.dragPixels);
    e.preventDefault();
  };
  private readonly up = (event: Event): void => {
    if ((event as PointerEvent).pointerId !== this.pointer) return;
    this.pointer = null; this.core.action(false); this.core.setTilt(0, 0);
  };
  private readonly blur = (): void => { this.pointer = null; this.core.reset(); };
  private readonly cancel = (event: Event): void => {
    if ((event as PointerEvent).pointerId === this.pointer) this.blur();
  };
  private readonly previousTouchAction: string | null;
  constructor(private readonly surface: EventTarget, profile: VirtualMotionProfile, private readonly dragPixels = 100,
    private readonly focus: EventTarget = surface) {
    if (!(dragPixels > 0) || !Number.isFinite(dragPixels)) throw new Error('Invalid touch motion drag size');
    this.core = new VirtualMotionApprox(profile);
    const style = (surface as HTMLElement).style;
    this.previousTouchAction = style ? style.touchAction : null;
    if (style) style.touchAction = 'none';
    surface.addEventListener('pointerdown', this.down); surface.addEventListener('pointermove', this.move);
    focus.addEventListener('pointerup', this.up); focus.addEventListener('pointercancel', this.cancel); focus.addEventListener('blur', this.blur);
  }
  submit(): MotionPacket {
    return this.closed ? snapshotMotion({ profile: this.core.profile.id, revision: this.core.profile.revision, valid: false, reset: true, sample: null }) : this.core.submit();
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.blur();
    this.surface.removeEventListener('pointerdown', this.down); this.surface.removeEventListener('pointermove', this.move);
    this.focus.removeEventListener('pointerup', this.up); this.focus.removeEventListener('pointercancel', this.cancel); this.focus.removeEventListener('blur', this.blur);
    if (this.previousTouchAction !== null) (this.surface as HTMLElement).style.touchAction = this.previousTouchAction;
  }
}

export interface MotionPermission {
  supported(): boolean;
  request?(): Promise<'granted' | 'denied'>;
  requestOrientation?(): Promise<'granted' | 'denied'>;
}
export function browserMotionPermission(): MotionPermission {
  type PermissionConstructor = { requestPermission?(): Promise<'granted' | 'denied'> };
  const motion = (globalThis as unknown as { DeviceMotionEvent?: PermissionConstructor }).DeviceMotionEvent;
  const orientation = (globalThis as unknown as { DeviceOrientationEvent?: PermissionConstructor }).DeviceOrientationEvent;
  return { supported: () => !!motion && globalThis.isSecureContext === true,
    request: motion?.requestPermission ? () => motion.requestPermission!() : undefined,
    requestOrientation: orientation?.requestPermission ? () => orientation.requestPermission!() : undefined };
}
export function magnitudeOnlyAccelerationApprox(v: V3): V3 {
  const f = Math.fround;
  return [f(Math.sqrt(f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2])))), 0, 0];
}
export class DeviceMotionInput {
  private enabled = false;
  private closed = false;
  private generation = 0;
  private number = 0;
  private resetPending = true;
  private sample: MotionSample | null = null;
  private posture: Q4 | null = null;
  private readonly motion = (event: Event): void => {
    if (!this.enabled || this.closed) return;
    const e = event as DeviceMotionEvent;
    const a = this.options.gravity === 'removed' ? e.acceleration : e.accelerationIncludingGravity;
    const values = [a?.x, a?.y, a?.z];
    if (values.some(v => typeof v !== 'number' || !Number.isFinite(v))) { this.sample = null; this.resetPending = true; return; }
    const f = Math.fround;
    const acceleration = this.options.mapAcceleration(values.map(v => f(v! / 9.80665)) as V3);
    const r = e.rotationRate;
    const angular = [r?.beta, r?.gamma, r?.alpha];
    const angularVelocity = this.options.mapAngularVelocity && angular.every(v => typeof v === 'number' && Number.isFinite(v))
      ? this.options.mapAngularVelocity(angular.map(v => f(v! / 360)) as V3) : null;
    this.sample = { number: this.number++, acceleration, angularVelocity, posture: this.posture,
      gravityRemoved: this.options.gravity === 'removed' };
  };
  private readonly orientation = (event: Event): void => {
    if (!this.enabled || this.closed || !this.options.mapPosture) return;
    const e = event as DeviceOrientationEvent;
    if ([e.alpha, e.beta, e.gamma].some(v => typeof v !== 'number' || !Number.isFinite(v))) { this.posture = null; return; }
    this.posture = this.options.mapPosture(e.alpha!, e.beta!, e.gamma!);
  };
  private readonly blur = (): void => { this.sample = null; this.posture = null; this.resetPending = true; };
  constructor(private readonly target: EventTarget, private readonly permission: MotionPermission, private readonly options: {
    id: string; revision: number; gravity: 'removed' | 'included'; mapAcceleration(v: V3): V3;
    mapAngularVelocity?(v: V3): V3; mapPosture?(alpha: number, beta: number, gamma: number): Q4;
  }) { snapshotMotion({ profile: options.id, revision: options.revision, valid: false, reset: false, sample: null }); }
  async enable(): Promise<boolean> {
    if (this.closed || !this.permission.supported()) return false;
    if (this.enabled) return true;
    const generation = ++this.generation;
    const motionPermission = this.permission.request?.() ?? Promise.resolve('granted');
    const orientationPermission = this.options.mapPosture ? this.permission.requestOrientation?.() ?? Promise.resolve('granted') : Promise.resolve('granted');
    const allowed = await Promise.all([motionPermission, orientationPermission]);
    if (this.closed || generation !== this.generation || allowed.some(value => value !== 'granted')) return false;
    this.enabled = true;
    this.target.addEventListener('devicemotion', this.motion);
    if (this.options.mapPosture) this.target.addEventListener('deviceorientation', this.orientation);
    this.target.addEventListener('blur', this.blur);
    return true;
  }
  submit(): MotionPacket {
    const packet = snapshotMotion({ profile: this.options.id, revision: this.options.revision, valid: this.enabled && !!this.sample,
      reset: this.resetPending, sample: this.sample });
    this.resetPending = false;
    return packet;
  }
  disable(): void {
    this.generation++; this.enabled = false; this.blur();
    this.target.removeEventListener('devicemotion', this.motion); this.target.removeEventListener('deviceorientation', this.orientation);
    this.target.removeEventListener('blur', this.blur);
  }
  dispose(): void { if (!this.closed) { this.closed = true; this.disable(); } }
}
