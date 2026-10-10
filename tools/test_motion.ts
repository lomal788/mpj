import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  MotionConverter, MotionEmitter, MotionSensor, VirtualMotionApprox, WaveDetector, copySample,
  type MotionPacket, type MotionSample, type V3, type VirtualMotionProfile,
} from '@game/lib/motion';
import { DeviceMotionInput, KeyboardMouseMotion, TouchMotion, magnitudeOnlyAccelerationApprox } from '@game/lib/motion-dom';
import { GamepadMotionApprox, type MotionGamepad } from '@game/lib/motion-gamepad';
import { FrameMotionPad, gamepadMotionSource, mergePadInputs } from '@app/common/input';
import { emptyPad } from '@game/core/pad';
import { localGate, MgScene, type MgSceneContext } from '@app/minigame/frame/scene';
import { mg1801Game } from '@app/minigame/mg1801';
import { Mg1801Harness, nodeMgAssets } from './mg_node_host';

let passed = 0, failed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${String((error as Error).stack ?? error)}`); }
}
const f = Math.fround;
const sample = (number: number, y = 0): MotionSample => ({ number, acceleration: [0, y, 0], angularVelocity: [0, y, 0], posture: [0, 0, 0, 1], gravityRemoved: true });
const packet = (number: number, y = 0): MotionPacket => ({ profile: 'fixture', revision: 1, valid: true, reset: false, sample: sample(number, y) });
const profile: VirtualMotionProfile = { id: 'fixture-approx', revision: 1, mode: 'pulse', acceleration: [0, 3, 0], angularVelocity: [0, 2, 0], tiltRadians: f(Math.PI / 6) };
function event(target: EventTarget, type: string, fields: Record<string, unknown> = {}): void {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, fields); target.dispatchEvent(e);
}
class Target extends EventTarget {
  readonly handlers = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
    if (callback) { const set = this.handlers.get(type) ?? new Set(); set.add(callback); this.handlers.set(type, set); }
    super.addEventListener(type, callback, options);
  }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
    if (callback) this.handlers.get(type)?.delete(callback);
    super.removeEventListener(type, callback, options);
  }
  get subscriptions(): number { return [...this.handlers.values()].reduce((n, s) => n + s.size, 0); }
}

await test('Converter initial getters, capacity zero, negative rejection, ring order and copy ownership', () => {
  assert.throws(() => new MotionConverter(-1));
  assert.equal(new MotionConverter(0).capacity, 1);
  const c = new MotionConverter(2);
  assert.deepEqual(c.acceleration, [0, 0, 0]); assert.deepEqual(c.angularVelocity, [0, 0, 0]); assert.deepEqual(c.posture, [0, 0, 0, 1]);
  c.push(sample(0, 0.1)); c.push(sample(1, 2)); c.push(sample(2, 3));
  assert.equal(c.length, 2); assert.equal(c.latest()!.number, 2); assert.equal(c.latest(1)!.number, 1); assert.equal(c.latest(2), null);
  c.latest()!.acceleration[1] = 99; assert.equal(c.acceleration[1], 3);
  c.clear(); assert.equal(c.length, 0); assert.deepEqual(c.acceleration, [0, 0, 0]);
  c.dispose(); c.dispose(); assert.throws(() => c.push(sample(4)));
});
await test('f32 conversion order: gravity, posture, inversion; missing rotation is explicit', () => {
  const calls: V3[] = [];
  const c = new MotionConverter(1, { inverseAcceleration: true, rotateInPosture: true }, (_q, v) => { calls.push([...v]); return [v[0], v[1], v[2]]; });
  const s = sample(0, -0.7); s.gravityRemoved = false;
  c.push(s); assert.deepEqual(calls, [[0, -1, 0], [0, f(f(-0.7) + 1), 0], [0, f(-0.7), 0]]);
  assert.equal(c.acceleration[1], f(-f(f(-0.7) + 1)));
  assert.equal(c.angularVelocity![1], f(-0.7));
  assert.throws(() => new MotionConverter(1).push(s), /rotation port/);
  const removed = new MotionConverter(1); removed.push(sample(0, 0.5)); assert.equal(removed.acceleration[1], 0.5);
  const noPosture = sample(1); noPosture.posture = null;
  assert.throws(() => c.push(noPosture), /rotation port/);
});
await test('Wave exact threshold, negative default .1, zero dot and sign reversal', () => {
  const wave = new WaveDetector('acceleration', 3, 1);
  const counts: number[] = [];
  wave.add(new MotionEmitter('value', 1, e => counts.push(e.state)));
  wave.update({ ...sample(0), acceleration: [1, 0, 0] });
  wave.update({ ...sample(1), acceleration: [0, 1, 0] }); assert.deepEqual(counts, [1]);
  wave.update({ ...sample(2), acceleration: [-1, 0, 0] }); assert.deepEqual(counts, [1, 1]);
  wave.update(sample(3, 0.99)); wave.update(sample(4, 1)); assert.equal(counts.length, 3);
  assert.equal(new WaveDetector('acceleration', 2, -1).threshold, f(0.1));
});
await test('Sum .5 ×5 fires once, no dt factor, reversal starts a fresh waveform', () => {
  let count = 0;
  const wave = new WaveDetector('acceleration', 2, 0.25);
  const sum = new MotionEmitter('sum', 2.5, () => count++); wave.add(sum);
  for (let i = 0; i < 4; i++) wave.update(sample(i, 0.5)); assert.equal(count, 0);
  wave.update(sample(4, 0.5)); assert.equal(count, 1);
  for (let i = 5; i < 10; i++) wave.update(sample(i, 0.5)); assert.equal(count, 1);
  for (let i = 10; i < 15; i++) wave.update(sample(i, -0.5)); assert.equal(count, 2);
});
await test('Value equality, Sum0 first sample, state3 excluded from Sum', () => {
  let valueCount = 0, zeroCount = 0;
  const w = new WaveDetector('angularVelocity', 2, 0.25);
  const sum = new MotionEmitter('sum', 2.5, () => {});
  w.add(sum); w.add(new MotionEmitter('value', 0.5, () => valueCount++)); w.add(new MotionEmitter('sum', 0, () => zeroCount++));
  w.update(sample(0, 0.5)); w.update(sample(1, 0.1));
  assert.equal(sum.total, 0.5); assert.equal(valueCount, 1); assert.equal(zeroCount, 1);
});
await test('callback reset/removal/disposal invalidates in-progress dispatch', () => {
  const c = new MotionConverter(1), wave = new WaveDetector('acceleration', 2, 0.25);
  let first = 0, stale = 0;
  const late = new MotionEmitter('value', 0.5, () => stale++);
  wave.add(new MotionEmitter('value', 0.5, () => { first++; c.clear(); wave.remove(late); })); wave.add(late); c.add(wave);
  c.push(sample(0, 0.5)); assert.equal(first, 1); assert.equal(stale, 0); assert.equal(c.length, 0);
  c.dispose(); assert.equal(wave.alive, false); assert.equal(late.alive, true); late.dispose();
});
await test('motion frame/sample idempotence, profile reset and invalid packet', () => {
  const c = new MotionConverter(20), sensor = new MotionSensor(c);
  assert.equal(sensor.accept(0, packet(0, 0.5)), true);
  assert.equal(sensor.accept(0, packet(1, 0.5)), false); assert.equal(sensor.accept(1, packet(0, 0.5)), false);
  assert.equal(c.length, 1);
  sensor.accept(2, { ...packet(0), revision: 2 }); assert.equal(c.length, 1);
  sensor.accept(3, { ...packet(1), valid: false, sample: null }); assert.equal(c.length, 0);
  assert.throws(() => sensor.accept(2, packet(2)), /frame order/);
  assert.throws(() => copySample({ ...sample(0), acceleration: [NaN, 0, 0] }));
});
await test('virtual pulse/hold, no repeated hold pulse, profile copy and tilt', () => {
  const p = new VirtualMotionApprox(profile); p.action(true);
  assert.equal(p.submit().sample!.acceleration[1], 3); assert.equal(p.submit().sample!.acceleration[1], 0);
  p.action(true); assert.equal(p.submit().sample!.acceleration[1], 0);
  p.action(false); p.action(true); assert.equal(p.submit().sample!.acceleration[1], 3);
  const held = new VirtualMotionApprox({ ...profile, mode: 'hold' }); held.action(true); held.setTilt(1, 0);
  assert.equal(held.submit().sample!.acceleration[1], 3); assert.equal(held.submit().sample!.acceleration[1], 3);
  const q = held.submit().sample!.posture!; assert.ok(Math.abs(q[0] - Math.sin(Math.PI / 12)) < 1e-6);
  held.reset(); assert.equal(held.submit().reset, true); assert.equal(held.submit().sample!.acceleration[1], 0);
});
await test('keyboard/mouse event collection, auto-repeat, blur and subscription release', () => {
  const target = new Target(), source = new KeyboardMouseMotion(target, profile);
  event(target, 'keydown', { code: 'Space', repeat: false });
  assert.equal(source.submit().sample!.acceleration[1], 3);
  event(target, 'keydown', { code: 'Space', repeat: true }); assert.equal(source.submit().sample!.acceleration[1], 0);
  event(target, 'pointerdown', { pointerType: 'mouse', button: 0, pointerId: 9 });
  assert.equal(source.submit().sample!.acceleration[1], 3);
  event(target, 'pointerup', { pointerId: 9 });
  event(target, 'keyup', { code: 'Space' }); event(target, 'pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1 });
  assert.equal(source.submit().sample!.acceleration[1], 3);
  event(target, 'pointermove', { pointerId: 1, clientX: 100, clientY: 0 });
  assert.ok(source.submit().sample!.posture![2] > 0);
  event(target, 'pointerup', { pointerId: 1 }); event(target, 'pointerdown', { pointerType: 'touch', button: 0, pointerId: 2 });
  assert.equal(source.submit().sample!.acceleration[1], 0);
  event(target, 'pointerdown', { pointerType: 'mouse', button: 0, pointerId: 3 });
  event(target, 'pointercancel', { pointerId: 3 }); assert.equal(source.submit().sample!.acceleration[1], 0);
  event(target, 'blur'); assert.equal(source.submit().reset, true);
  source.dispose(); source.dispose(); assert.equal(target.subscriptions, 0); assert.equal(source.submit().valid, false);
});
await test('mobile touch hold/drag/release, cancel and listener/style ownership', () => {
  const target = Object.assign(new Target(), { style: { touchAction: 'pan-x' } }), focus = new Target();
  const source = new TouchMotion(target, { ...profile, mode: 'hold' }, 100, focus);
  assert.equal(target.style.touchAction, 'none');
  event(target, 'pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 50, clientY: 50 });
  event(target, 'pointermove', { pointerId: 7, clientX: 150, clientY: 50 });
  assert.equal(source.submit().sample!.acceleration[1], 3); assert.ok(source.submit().sample!.posture![2] > 0);
  event(focus, 'pointercancel', { pointerId: 7 }); assert.equal(source.submit().sample!.acceleration[1], 0);
  source.dispose(); assert.equal(target.subscriptions + focus.subscriptions, 0); assert.equal(target.style.touchAction, 'pan-x');
  const pulse = new TouchMotion(target, profile, 100, focus);
  event(target, 'pointerdown', { pointerType: 'touch', pointerId: 8, clientX: 0, clientY: 0 });
  event(focus, 'pointercancel', { pointerId: 8 }); assert.equal(pulse.submit().sample!.acceleration[1], 0); pulse.dispose();
});
await test('gamepad pulse/hold/tilt, disconnection/reconnection and missing motion hardware', () => {
  let pad: MotionGamepad | null = { connected: true, buttons: [{ pressed: true }], axes: [1, 0] };
  const source = new GamepadMotionApprox(() => pad, profile, { button: 0, tiltX: 1, tiltZ: 0 });
  assert.equal(source.submit().sample!.acceleration[1], 3); assert.equal(source.submit().sample!.acceleration[1], 0);
  pad = null; assert.equal(source.submit().valid, false);
  pad = { connected: true, buttons: [{ pressed: true }], axes: [0, 0] };
  assert.equal(source.submit().reset, true);
  source.dispose(); assert.equal(source.submit().valid, false);
  const factory = gamepadMotionSource(0, profile, undefined, () => null); assert.equal(factory.submit().valid, false); factory.dispose();
});
await test('DeviceMotion permission explicit, SI units and capabilities; no invented posture', async () => {
  const target = new Target(); let requests = 0;
  const source = new DeviceMotionInput(target, { supported: () => true, request: async () => { requests++; return 'granted'; } },
    { id: 'mobile-magnitude-approx', revision: 1, gravity: 'removed', mapAcceleration: magnitudeOnlyAccelerationApprox, mapAngularVelocity: v => v });
  assert.equal(requests, 0); assert.equal(target.subscriptions, 0); assert.equal(source.submit().valid, false);
  assert.equal(await source.enable(), true); assert.equal(requests, 1);
  event(target, 'devicemotion', { acceleration: { x: 9.80665, y: 0, z: 0 }, rotationRate: { alpha: 0, beta: 360, gamma: 0 } });
  const p = source.submit(); assert.deepEqual(p.sample!.acceleration, [1, 0, 0]); assert.deepEqual(p.sample!.angularVelocity, [1, 0, 0]);
  assert.equal(p.sample!.posture, null); assert.equal(p.sample!.gravityRemoved, true);
  assert.equal(source.submit().sample!.number, p.sample!.number);
  event(target, 'devicemotion', { acceleration: { x: null, y: 0, z: 0 } }); assert.equal(source.submit().valid, false);
  source.dispose(); assert.equal(target.subscriptions, 0);
});
await test('DeviceMotion denial, unsupported device and late permission after dispose', async () => {
  const options = { id: 'fixture-mobile', revision: 1, gravity: 'removed' as const, mapAcceleration: (v: V3) => v };
  const target = new Target(); let finish!: (value: 'granted') => void;
  const source = new DeviceMotionInput(target, { supported: () => true, request: () => new Promise(resolve => { finish = resolve; }) }, options);
  const pending = source.enable(); source.dispose(); finish('granted'); assert.equal(await pending, false); assert.equal(target.subscriptions, 0);
  assert.equal(await new DeviceMotionInput(target, { supported: () => false }, options).enable(), false);
  assert.equal(await new DeviceMotionInput(target, { supported: () => true, request: async () => 'denied' }, options).enable(), false);
});
await test('mobile orientation needs explicit mapper and permission, included gravity is marked', async () => {
  const target = new Target(); let orientationRequests = 0;
  const source = new DeviceMotionInput(target, { supported: () => true, requestOrientation: async () => { orientationRequests++; return 'granted'; } },
    { id: 'mobile-injected', revision: 1, gravity: 'included', mapAcceleration: v => v, mapPosture: () => [0, 0, 0, 1] });
  await source.enable(); assert.equal(orientationRequests, 1);
  event(target, 'deviceorientation', { alpha: 0, beta: 0, gamma: 0 });
  event(target, 'devicemotion', { accelerationIncludingGravity: { x: 0, y: -9.80665, z: 0 }, rotationRate: null });
  const p = source.submit(); assert.deepEqual(p.sample!.posture, [0, 0, 0, 1]); assert.equal(p.sample!.angularVelocity, null);
  const converter = new MotionConverter(1, {}, (_q, v) => v); converter.push(p.sample!); assert.deepEqual(converter.acceleration, [0, 0, 0]);
  event(target, 'blur'); assert.equal(source.submit().valid, false); source.dispose();
});
await test('whole-source motion merge, later legacy acceleration preserved, explicit zero owner', () => {
  const keyboard = emptyPad(), gamepad = { ...emptyPad(), buttons: 1, lx: 100, accX: 1, accY: 2, accZ: 3 };
  assert.deepEqual(mergePadInputs([keyboard, gamepad]), gamepad);
  const selected = mergePadInputs([keyboard, gamepad], 0)!; assert.equal(selected.accX, 0); assert.equal(selected.buttons, 1);
  const p = mergePadInputs([keyboard, { ...gamepad, motion: packet(0) }])!;
  assert.ok(Object.isFrozen(p.motion!.sample!.acceleration)); assert.equal(mergePadInputs([null, null]), null);
});
await test('frame latch deep immutable, repeated reads identical, late events wait until next frame', () => {
  const target = new Target(), source = new KeyboardMouseMotion(target, profile), pad = new FrameMotionPad(emptyPad, source);
  let reads = 0;
  const gate = localGate(frame => { reads++; return [pad.read(frame), null]; });
  const first = gate.inputsFor(0); event(target, 'keydown', { code: 'Space' });
  assert.equal(gate.inputsFor(0), first); assert.equal(reads, 1);
  assert.equal(first[0]!.accY, 0); assert.equal(gate.inputsFor(1)[0]!.accY, 3);
  assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first[0]));
  assert.throws(() => gate.inputsFor(0)); pad.dispose(); assert.equal(target.subscriptions, 0);
});
await test('closed FrameGate advances no source/Converter/Wave/Sum; packet reaches game context', () => {
  const source = new VirtualMotionApprox({ ...profile, mode: 'hold', acceleration: [0, 0.5, 0] }); source.action(true);
  const converter = new MotionConverter(20), sensor = new MotionSensor(converter), wave = new WaveDetector('acceleration', 2, 0.25);
  const sum = new MotionEmitter('sum', 2.5, () => {}); wave.add(sum); converter.add(wave);
  let context!: MgSceneContext, open = false, reads = 0;
  const latch = localGate(() => { reads++; return [{ ...emptyPad(), motion: source.submit() }]; });
  const { tables, ui } = nodeMgAssets();
  const scene = new MgScene({ mgId: 'mg1801', seed: 1, rand: { u32: () => 0 }, tables, ui,
    players: [0, 1, 2, 3].map(pid => ({ pid, chara: 'pc01', isCom: false, teamId: 0, order: pid })), resultHost: { gl: null, url: path => path } },
    { setup: ctx => { context = ctx; }, update: () => { sensor.accept(context.frame, context.pad(0).motion!); } },
    { canStep: () => open, inputsFor: frame => latch.inputsFor(frame) });
  for (let i = 0; i < 3; i++) assert.equal(scene.tick(), false);
  assert.equal(reads, 0); assert.equal(converter.length, 0);
  open = true; scene.tick(); assert.equal(converter.length, 1); assert.equal(sum.total, 0.5);
  open = false; scene.tick(); assert.equal(sum.total, 0.5); assert.equal(reads, 1);
  open = true; scene.tick(); assert.equal(sum.total, 1); assert.ok(Object.isFrozen(context.pad(0).motion!.sample));
});
await test('same frame trace -> same f32 packet/ring/emitter hash', () => {
  const replay = (): string => {
    const source = new VirtualMotionApprox(profile), c = new MotionConverter(20), sensor = new MotionSensor(c), wave = new WaveDetector('acceleration', 2, 0.25);
    const trace: unknown[] = []; wave.add(new MotionEmitter('sum', 2.5, e => trace.push(e))); c.add(wave);
    for (let frame = 0; frame < 180; frame++) {
      source.action(frame % 7 === 0); source.setTilt(frame % 3 - 1, frame % 5 / 2 - 1);
      const p = source.submit(); sensor.accept(frame, p); trace.push([p, c.latest()]);
    }
    const bits = new DataView(new ArrayBuffer(4));
    return createHash('sha256').update(JSON.stringify(trace, (_key, value: unknown) => {
      if (typeof value !== 'number') return value;
      bits.setFloat32(0, value, true);
      return `f32:${bits.getUint32(0, true).toString(16)}`;
    })).digest('hex');
  };
  assert.equal(replay(), replay());
});
await test('mg1801 actual full run: common virtual profile -> gate acceleration -> 26 JUST', () => {
  const h = new Mg1801Harness({ players: [0, 1, 2, 3].map((i) => ({ char: `pc0${i + 1}`, isCom: i > 0, comLevel: 0 })), seed: 1, practice: false });
  const source = new VirtualMotionApprox(mg1801Game.motionProfile!);
  const pad = new FrameMotionPad(emptyPad, { submit: () => source.submit(), dispose: () => source.reset() });
  let down = false;
  for (let frame = 0; frame < 6000 && !h.done; frame++) {
    const j = h.world.objectMan.judgeInput(0);
    down = j.type === 0 && j.diff < 2 && !down; source.action(down);
    h.step([pad.read(frame), null, null, null]);
  }
  assert.ok(h.done); assert.equal(h.result!.counts[0].just, 26); assert.equal(h.result!.counts[0].miss, 0); pad.dispose();
});
await test('core and adapter import boundaries, no device/clock/RNG in core', () => {
  const core = readFileSync('script/game/lib/motion/index.ts', 'utf8');
  assert.doesNotMatch(core, /\bimport\b|\bwindow\b|\bdocument\b|Date\.now|Math\.random|performance\.now|navigator|requestAnimationFrame/);
  for (const name of ['motion-dom', 'motion-gamepad']) {
    const source = readFileSync(`script/game/lib/${name}/index.ts`, 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.equal(match[1], '../motion');
  }
  const host = readFileSync('script/app/flow/host.ts', 'utf8'); assert.match(host, /motionNow\.read\(frame\)/); assert.match(host, /motionPad\?\.dispose\(\)/);
});

console.log(`motion input: ${passed}/${passed + failed}`);
if (failed) process.exitCode = 1;
