import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  ActorCore, ActorParams, ActorPad, ActorContactRegistry, ActionRegistry, ConditionSet, FrameDisplacementSlots,
  JumpCalculator, F, STEP_SEC, FLT_MAX, INVALID_REF, basicGravity, identityPosition,
  zeroPacket, emptyActorHit, copyActorHit, horizontalIntegrate, substepCount, yawQuaternionApprox,
  quaternionYawApprox, rotateYawApprox, type ActorCoreSetup, type ActorCollisionPort, type ActorHit,
  type ActorEvent, type ActorShape, type ActorMapContact, type ActorPairContact, type ActorSurface,
  type ActorPorts, type ActorRegistration, type Ref, type V3, type Q4, type StepStamp,
} from '@game/lib/actor';
import { ActorCollisionAdapter, ActorCollisionBinding, actorCapsuleFromSegment, resolveActorMapContacts } from '@game/lib/actor-collision';
import { CollisionWorld, type Pose } from '@game/lib/collision';
import { PhysxCollisionBackend } from '@game/lib/collision-physx';
import { createPhysx } from '@game/lib/physx';
import { CharacterCore, fnv1a64, motionArg, RULES_ORIGINAL } from '@game/lib/character';
import { ActorCharacterBinding, NpadActorInput, cameraBasisApprox, packetEdgesApprox, coreCharacterTarget, actorParamsFromRows } from '@app/common/actor';
import { emptyPad, NPAD } from '@game/core/pad';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function test(name: string, body: () => void): void {
  try { body(); passed++; }
  catch (e) { failed++; console.error(`FAIL ${name}\n${e instanceof Error ? e.stack : e}`); }
}
function near(actual: number, expected: number, eps = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} != ${expected} (±${eps})`);
}
const q: Q4 = [0, 0, 0, 1];
const e = (index: number): Ref => ({ index, generation: 1 });
const registration = (entity = e(1), position: V3 = [0, 0, 0]): ActorRegistration => ({ entity, position, rotation: q,
  poseEpoch: 0, modelMask: 1, enabled: true, overrideCollision: false });
const pad = (): ActorPad => new ActorPad({ moveAnalog: true, moveDpad: true, subdivisionCount: 0,
  overlayMask: 0xffffffff, overlay: zeroPacket(), edgePolicy: null });
const hashes = { Idle: 1n, Walk: 2n, Run: 3n, Jump: 4n, Fall: 5n, Landing: 6n };
const stamp = (actor: ActorCore, phase: StepStamp['phase'], pass = 0): StepStamp => ({ frameId: actor.frameId, phase, pass, sequence: 0, poseEpoch: pass });
class Queries implements ActorCollisionPort {
  hit: ActorHit | null = null;
  rayHit: ActorHit | null = null;
  sweeps = 0; rays = 0; maps = 0;
  contacts: ActorMapContact[] = [];
  beginPhase(_stamp: StepStamp): void {}
  sweep(_shape: ActorShape, _start: V3, _rotation: Q4, _direction: V3, _distance: number, _mask: number, _exclude: Ref, out: ActorHit): boolean {
    this.sweeps++; if (!this.hit) return false; Object.assign(out, copyActorHit(this.hit)); return true;
  }
  ray(_origin: V3, _direction: V3, _distance: number, _mask: number, _exclude: Ref, out: ActorHit): boolean {
    this.rays++; if (!this.rayHit) return false; Object.assign(out, copyActorHit(this.rayHit)); return true;
  }
  resolveSurface(_hit: ActorHit, _out: ActorSurface): boolean { return false; }
  mapContacts(_shape: ActorShape, _mask: number, out: ActorMapContact[]): number { this.maps++; out.push(...this.contacts); return out.length; }
  actorContacts(_actor: Ref, out: ActorPairContact[]): number { out.length = 0; return 0; }
}
function fixture(options: Partial<ActorCoreSetup> = {}, registry = new ActorContactRegistry(r => r.generation === 1), collision: ActorCollisionPort = new Queries()) {
  const ref = options.ref ?? registry.registerActor(registration());
  const events: ActorEvent[] = [];
  const ports: ActorPorts = { registry, collision, gravity: basicGravity, finalPosition: identityPosition,
    motionState: () => ({ present: false, hash: null, playback: 0 }), motion: () => {}, event: ev => events.push(ev) };
  const core = new ActorCore({ ref, ports, params: new ActorParams(), pad: pad(), position: [0, 0, 0, 0], rotation: q,
    leverReference: [0, 0, 0, 0], verticalReference: [0, 0, 0, 0], rotationMode: 'yaw-approx', groundedLimitY: null,
    moveLever: p => cameraBasisApprox(p.getLever(), [1, 0, 0], [0, 0, 1]), selectGround: () => 0, jumpCalculator: null, ...options });
  return { core, registry, collision, events, ports };
}
function install(core: ActorCore): void {
  core.installBasicActions({ hashes, motions: {}, landingEnabled: true, groundInput: null, airInput: null, groundLever: null });
}
function next(core: ActorCore): void { core.preFrame(core.frameId + 1); core.tick(); core.postCollision(); }
function shape(registry: ActorContactRegistry, actor: Ref, classMask = 2): Ref {
  return registry.registerShape(actor, { owner: e(1), nameHash: 1n, classMask, enabled: true, geometry: { kind: 'sphere', radius: .5 },
    center: [0, .5, 0], rotation: q, collisionBody: 1, collisionShape: 1 });
}
const hit = (distance = .01, y = 1): ActorHit => ({ ...emptyActorHit(), validity: 0, entity: e(2), body: 2, shape: 2,
  normal: [0, y, 0], distance: F(distance) });

test('ctor defaults', () => {
  const p = new ActorParams();
  assert.deepEqual([p.walkSpeed, p.runSpeed, p.airAccel, p.airDecel, p.airMax, p.fallMax, p.jumpSpeed], [2, 6, 40, 40, 6, 49, 13.5]);
  assert.deepEqual([p.groundTurn, p.groundFastTurn, p.groundFastThreshold, p.airTurn, p.airFastTurn], [360, 1100, 85, 360, 1100]);
});
const rows = Array.from({ length: 33 }, (_, i) => [i + .1, i + .2, i + .3, i + .4]);
[6, 2, 40, 360, 1100, 85, 180, 720, 85].forEach((x, i) => { rows[i][0] = x; }); rows[32][0] = .8;
test('ctor → common known rows → game priority', () => {
  const p = actorParamsFromRows(rows, { runSpeed: 8, jumpSpeed: 23 });
  assert.deepEqual([p.runSpeed, p.walkSpeed, p.airAccel, p.airDecel, p.airTurn, p.airFastTurn, p.jumpSpeed], [8, 2, 40, 40, 180, 720, 23]);
  p.applyGame({ walkSpeed: 3 }); assert.equal(p.walkSpeed, 3);
});
test('raw 33 rows preserved without applying unknown jump data', () => {
  const p = new ActorParams(rows); assert.deepEqual(p.rawRows, rows); assert.equal(p.jumpSpeed, 13.5);
  assert.equal(p.rawRows[22][0], 22.1); assert.equal(p.loadedRows[22][0], F(F(22.1) / 60));
  assert.equal(p.loadedRows[22][1], F(22.2)); assert.equal(p.loadedRows[24][0], F(24.1));
  assert.ok(Object.isFrozen(p.rawRows[0])); assert.equal(p.rawRows.length, 33);
});
test('malformed Param is rejected', () => { assert.throws(() => new ActorParams([])); assert.throws(() => new ActorParams(null, { runSpeed: NaN })); });
test('substep rounding and explicit minimum', () => { assert.equal(substepCount(STEP_SEC), 1); assert.equal(substepCount(F(1 / 30)), 2); assert.equal(substepCount(.001), 0); assert.equal(substepCount(.001, true), 1); });
test('f32 step for walk/run', () => { near(horizontalIntegrate(FLT_MAX, 0, [2, 0, 0, 0], [0, 0, 0, 0], 1).delta[0], 1 / 30); near(horizontalIntegrate(FLT_MAX, 0, [6, 0, 0, 0], [0, 0, 0, 0], 1).delta[0], .1); });
test('air accel40 frame9 f32 remainder, frame10 clamps6', () => { const v = horizontalIntegrate(6, 0, [0, 0, 0, 0], [40, 0, 0, 0], 9); assert.equal(v.velocity[0], 5.999999523162842); near(v.delta[0], .5); assert.equal(horizontalIntegrate(6, 0, v.velocity, [40, 0, 0, 0], 1).velocity[0], 6); });
test('deceleration /60 reaches zero at nine substeps', () => { const v = horizontalIntegrate(6, 40, [6, 0, 0, 0], [0, 0, 0, 0], 9); near(v.velocity[0], 0, 1e-6); near(v.delta[0], .4); });
test('horizontal delta substeps and w reset on clamp', () => { const v = horizontalIntegrate(1, 0, [3, 0, 0, 4], [0, 0, 0, 0], 1); near(v.velocity[0], .6); assert.equal(v.velocity[3], 0); assert.equal(v.delta[3], 0); });
test('ground yaw uses fast/slow threshold paths', () => { const p = new ActorParams(); near(quaternionYawApprox(rotateYawApprox(q, yawQuaternionApprox(90), true, p)), 1100 / 60, 1e-4); near(quaternionYawApprox(rotateYawApprox(q, yawQuaternionApprox(30), true, p)), 6, 1e-4); });
test('common air turn differs from ctor', () => { near(quaternionYawApprox(rotateYawApprox(q, yawQuaternionApprox(90), false, new ActorParams(rows))), 12, 1e-4); });
test('turn does not overshoot small target', () => { near(quaternionYawApprox(rotateYawApprox(q, yawQuaternionApprox(2), true, new ActorParams())), 2, 1e-5); });

test('yaw arrival copies target quaternion and stays there', () => {
  const target = yawQuaternionApprox(45), p = new ActorParams();
  let current = yawQuaternionApprox(43);
  for (let i = 0; i < 60; i++) { current = rotateYawApprox(current, target, true, p); assert.deepEqual(current, target); }
});
test('cardinal basis has no sideways drift and half turn finishes in 18 frames', () => {
  for (const [angle, direction] of [[0, [0, 0, 1, 0]], [90, [1, 0, 0, 0]], [180, [0, 0, -1, 0]], [-90, [-1, 0, 0, 0]]] as const) {
    assert.deepEqual(cameraBasisApprox({ angle, depth: 1, type: 2 }, [1, 0, 0], [0, 0, 1]).direction, direction);
  }
  let current: Q4 = [0, 0, 0, 1]; const target = yawQuaternionApprox(180), p = new ActorParams(rows);
  for (let i = 0; i < 17; i++) current = rotateYawApprox(current, target, true, p);
  assert.notDeepEqual(current, target); current = rotateYawApprox(current, target, true, p); assert.deepEqual(current, target);
});

test('Pad radial threshold includes exactly .1', () => {
  const p = pad(); p.setInput({ ...zeroPacket(), stick: [.099, 0, 0, 0] }); assert.equal(p.getLever().depth, 0);
  p.setInput({ ...zeroPacket(), stick: [.1, 0, 0, 0] }); assert.equal(p.getLever().depth, F(.1));
  p.setInput({ ...zeroPacket(), stick: [.08, -.08, 0, 0] }); assert.ok(p.getLever().depth > .1);
});
test('Pad does not clamp vector to unit length', () => { const p = pad(); p.setOverlay({ stick: [1, 1, 0, 0] }); p.overlayEnabled = true; near(p.getLever().depth, Math.sqrt(2)); });
test('enabled overrides overlay and callback', () => { const p = pad(); p.enabled = false; p.overlayEnabled = true; p.setOverlay({ hold: 1, stick: [1, 0, 0, 0] }); p.stickOverride = () => { throw new Error('must not run'); }; assert.equal(p.getHold(), 0); assert.equal(p.getLever().depth, 0); assert.equal(p.getTrigger(), 0); });
test('normal style rotates axis and three bit groups', () => {
  const p = pad(); p.inputStyle = 3; p.style = 1;
  p.setInput({ ...zeroPacket(), hold: 1 | 0x100 | 0x10000, trigger: 1, stick: [1, 0, 0, 0] });
  assert.equal(p.getHold(), 2 | 0x800 | 0x20000); assert.equal(p.getTrigger(), 2); assert.deepEqual(p.getStick(), [0, -1, 0, 0]);
  p.monitorStyle = 5; assert.equal(p.getHold(), 4 | 0x400 | 0x80000); assert.deepEqual(p.getStick().map(n => n || 0), [0, 1, 0, 0]);
});
test('normal source mask before style, final mask after style', () => { const p = pad(); p.style = 1; p.inputStyle = 3; p.normalMask = 1; p.mask = 2; p.setInput({ ...zeroPacket(), hold: 15 }); assert.equal(p.getHold(), 2); p.mask = 1; assert.equal(p.getHold(), 0); });
test('overlay bypasses style and normal mask, retains own masks', () => { const p = pad(); p.style = 1; p.inputStyle = 3; p.normalMask = 0; p.mask = 1; p.overlayEnabled = true; p.setOverlay({ hold: 3, stick: [1, 0, 0, 0] }); assert.equal(p.getHold(), 1); assert.deepEqual(p.getStick(), [1, 0, 0, 0]); });
const dpadAngles = new Map([[0x100, -90], [0x200, 90], [0x400, 0], [0x500, -45], [0x600, 45], [0x800, 180], [0x900, -135], [0xa00, 135]]);
for (const [hold, angle] of dpadAngles) test(`Dpad table ${hold.toString(16)}`, () => { const p = pad(); p.setInput({ ...zeroPacket(), hold, stick: [1, 0, 0, 0] }); assert.deepEqual(p.getLever(), { angle, depth: 1, type: 1 }); });
test('opposed Dpad blocks analog fallback', () => { const p = pad(); p.setInput({ ...zeroPacket(), hold: 0x300, stick: [1, 0, 0, 0] }); assert.equal(p.getLever().type, 0); });
test('override after radial threshold, without second threshold', () => { const p = pad(); p.stickOverride = s => { assert.deepEqual(s, [0, 0, 0, 0]); return [.02, 0, 0, 0]; }; near(p.getLever().depth, .02); });
test('angular subdivision truncates toward zero', () => { const p = pad(); p.setup.subdivisionCount = 8; p.setInput({ ...zeroPacket(), stick: [.5, -1, 0, 0] }); assert.equal(p.getLever().angle, 0); });
test('CPU setters store without enabling or clearing', () => { const p = pad(); p.setOverlay({ hold: 4, trigger: 4, release: 2, stick: [1, 0, 0, 0] }); assert.equal(p.getHold(), 0); p.overlayEnabled = true; assert.equal(p.getHold(), 4); p.overlayEnabled = false; p.overlayEnabled = true; assert.equal(p.snapshot().overlay.trigger, 4); });
test('unknown edge paths require explicit policy', () => { const p = pad(); assert.throws(() => p.getRelease(), /R03/); p.overlayEnabled = true; assert.throws(() => p.getTrigger(), /R03/); p.setup.edgePolicy = packetEdgesApprox; p.setOverlay({ trigger: 8, release: 4 }); assert.equal(p.getTrigger(), 8); assert.equal(p.getTrigger(), 8); assert.equal(p.getRelease(), 4); });
test('NPAD known logical bits, edges, axis convention and no sensors', () => { const input = new NpadActorInput({ extraButtons: null }); const raw = { ...emptyPad(), buttons: NPAD.L | NPAD.LEFT | NPAD.A, ly: 32767, accX: 5 }; const a = input.read(raw); assert.equal(a.hold, 0x111); assert.equal(a.trigger, 0x111); assert.deepEqual(a.stick, [0, -1, 0, 0]); assert.equal(input.read(raw).trigger, 0); assert.equal(input.read(emptyPad()).release, 0x111); assert.deepEqual(Object.keys(a).sort(), ['hold', 'release', 'stick', 'trigger']); });
test('camera basis is injected and horizontal', () => { const v = cameraBasisApprox({ depth: .5, angle: 0, type: 2 }, [0, 3, -1], [1, 4, 0]); assert.deepEqual(v.direction, [1, 0, 0, 0]); assert.equal(v.depth, .5); near(quaternionYawApprox(v.rotation), 90, 1e-4); });

for (const [vy, acc] of [[42, -150], [5, -150], [4.5, -87.5], [4, -25], [-3, -37], [-10, -49], [-20, -49]]) {
  test(`Jump interval vy=${vy}`, () => near(JumpCalculator.accelerationY(vy), acc));
}
test('Jump reset factor5 and hold only Start frame', () => { const c = new JumpCalculator(); c.update(4, 0); assert.equal(c.factor, 5); c.start(1, 7); c.update(13.5, 1); assert.equal(c.isHold(), true); c.update(13.5, 2); assert.equal(c.isHold(), false); near(c.factor * F(-9.8), -150, 1e-5); c.reset(); assert.equal(c.factor, 5); });
test('Jump zero hold never skips acceleration', () => { const c = new JumpCalculator(); c.start(3, 0); c.update(13.5, 3); assert.equal(c.isHold(), false); });
for (const [speed, height, apexIndex, landingFrames] of [[23, 2.087, 14, 35], [42, 6.392, 22, 57], [13.5, .904, 11, 26]]) {
  test(`§10 Jump trajectory speed${speed} with Start-frame hold`, () => {
    const { core } = fixture({ jumpCalculator: new JumpCalculator() });
    core.groundedFlag = false;
    core.registerAction(core.actionHash, () => { core.moveAir(); return 4; });
    let max = 0, maxIndex = -1, landing = -1;
    for (let frame = 0; frame < 120; frame++) {
      core.preFrame(frame); if (frame === 0) core.startJump(speed); core.tick();
      if (core.position[1] > max) { max = core.position[1]; maxIndex = frame; }
      if (core.position[1] <= 0) { landing = frame + 1; break; }
    }
    near(max, height, .0005); assert.equal(maxIndex, apexIndex); assert.equal(landing, landingFrames);
  });
}
test('ground 180 yaw trajectory crosses85 threshold instead of assuming18f', () => {
  let rotation = q, frames = 0;
  while (frames < 60 && Math.abs(Math.abs(quaternionYawApprox(rotation)) - 180) > .001) {
    rotation = rotateYawApprox(rotation, yawQuaternionApprox(180), true, new ActorParams()); frames++;
  }
  assert.equal(frames, 18);
});

test('Condition replace=false does not call factory', () => { const c = new ConditionSet(); const ref = c.set(1n, false, () => ({ step: () => 0, destroy: () => {} })); assert.deepEqual(c.set(1n, false, () => { throw new Error('called'); }), ref); });
test('Condition replacement invalidates previous generation', () => { const c = new ConditionSet(); let destroyed = 0; const a = c.set(1n, false, () => ({ step: () => 0, destroy: () => { destroyed++; } }))!; const b = c.set(1n, true, () => ({ step: () => 0, destroy: () => {} }))!; assert.equal(a.index, b.index); assert.notEqual(a.generation, b.generation); assert.equal(c.delete(a), false); assert.equal(c.alive(b), true); assert.equal(destroyed, 1); });
test('Condition only return1 expires; snapshot defers new conditions', () => { const c = new ConditionSet(); let count = 0; c.set(1n, false, () => ({ step: () => { c.set(2n, false, () => ({ step: () => { count++; return 2; }, destroy: () => {} })); return 1; }, destroy: () => {} })); c.step(); assert.equal(count, 0); assert.equal(c.get(1n), null); c.step(); assert.equal(count, 1); assert.ok(c.get(2n)); });
test('Condition callback replacement returning1 keeps replacement', () => { const c = new ConditionSet(); let destroyed = 0; c.set(1n, false, () => ({ step: () => { c.set(1n, true, () => ({ step: () => 0, destroy: () => { destroyed++; } })); return 1; }, destroy: () => { destroyed++; } })); c.step(); assert.equal(destroyed, 1); assert.ok(c.get(1n)); c.dispose(); c.dispose(); assert.equal(destroyed, 2); });
test('Condition suspend callback then destroy, stale ref harmless', () => { const c = new ConditionSet(); const calls: string[] = []; const ref = c.set(1n, false, () => ({ step: () => 0, suspended: () => calls.push('suspend'), destroy: () => calls.push('destroy') }))!; assert.equal(c.suspend(ref), true); assert.equal(c.suspend(ref), false); assert.deepEqual(calls, ['suspend', 'destroy']); });
test('Condition dispose during callback invalidates snapshot', () => { const c = new ConditionSet(); c.set(1n, false, () => ({ step: () => { c.dispose(); return 1; }, destroy: () => {} })); c.set(2n, false, () => ({ step: () => { throw new Error('dead snapshot'); }, destroy: () => {} })); c.step(); assert.equal(c.get(1n), null); });
test('Slot displacement is not velocity and defaults to zero', () => { const s = new FrameDisplacementSlots(); const a = s.create(1n); assert.deepEqual(s.step(), [0, 0, 0, 0]); s.setStepFunction(a, dt => { assert.equal(dt, STEP_SEC); return [2, 0, 0, 0]; }); assert.deepEqual(s.step(), [2, 0, 0, 0]); });
test('Slot callback self-delete and replacement invalidation', () => { const s = new FrameDisplacementSlots(); const a = s.create(1n); s.setStepFunction(a, () => { const b = s.create(1n, true); s.setStepFunction(b, () => [1, 0, 0, 0]); return [9, 0, 0, 0]; }); assert.deepEqual(s.step(), [0, 0, 0, 0]); assert.equal(s.alive(a), false); assert.deepEqual(s.step(), [1, 0, 0, 0]); s.dispose(); assert.deepEqual(s.create(2n), INVALID_REF); });
test('Slot mutation of a later entry obeys snapshot generation', () => { const s = new FrameDisplacementSlots(); const a = s.create(1n), b = s.create(2n); s.setStepFunction(a, () => { s.delete(b); return [1, 0, 0, 0]; }); s.setStepFunction(b, () => { throw new Error('stale slot'); }); assert.deepEqual(s.step(), [1, 0, 0, 0]); });

test('Action registry executes synchronously and supports erase', () => { const r = new ActionRegistry(); let calls = 0; r.register(1n, () => ++calls); assert.equal(r.get(1n)!({ actor: fixture().core, enter: true, arg: 0 }), 1); assert.equal(r.erase(1n), true); assert.equal(r.get(1n), null); });
test('SetActionName same=3 force=6 and time reset', () => { const { core } = fixture(); core.actionTime = 2; assert.equal(core.setActionName(core.actionHash), 3); assert.equal(core.actionTime, 2); assert.equal(core.setActionName(core.actionHash, true), 6); assert.equal(core.actionTime, 0); });
test('pre/tick explicit frame ordering rejects duplicate tick', () => { const { core } = fixture(); assert.throws(() => core.tick()); next(core); assert.throws(() => core.tick()); assert.throws(() => core.preFrame(0)); assert.throws(() => core.collisionJobs(stamp(core, 'map'), { kind: 'ground', mapMask: 4 })); });
test('tick call order pad, condition, gravity, action, final pose, after', () => { const calls: string[] = []; const { core, ports } = fixture({ moveLever: () => { calls.push('pad'); return { depth: 0, direction: [0, 0, 0, 0], rotation: q }; } }); core.conditions.set(1n, false, () => ({ step: () => { calls.push('condition'); return 0; }, destroy: () => {} })); ports.gravity = out => { calls.push('gravity'); return basicGravity(out); }; ports.finalPosition = (p, out) => { calls.push('position'); identityPosition(p, out); }; core.registerAction(core.actionHash, () => { calls.push('action'); return 0; }); core.afterControl = () => { calls.push('after'); }; next(core); assert.deepEqual(calls, ['pad', 'condition', 'gravity', 'action', 'position', 'after']); });
test('first Walk/Run entry applies speed same tick; speed independent of depth', () => { const { core } = fixture(); install(core); core.gravityEnabled = false; core.setInput({ ...zeroPacket(), stick: [.2, 0, 0, 0] }); next(core); near(core.position[0], 2 / 60); assert.equal(core.actionHash, hashes.Walk); core.setInput({ ...zeroPacket(), stick: [.9, 0, 0, 0] }); next(core); near(core.position[0], 8 / 60); assert.equal(core.actionHash, hashes.Run); });
test('2/6 m per second with sixty fixed ticks', () => { for (const [depth, speed] of [[.2, 2], [.9, 6]]) { const { core } = fixture(); install(core); core.gravityEnabled = false; core.setInput({ ...zeroPacket(), stick: [depth, 0, 0, 0] }); for (let i = 0; i < 60; i++) next(core); near(core.position[0], speed, 1e-5); } });
test('auto rotation suppresses horizontal delta, auto position permits it once', () => { const { core } = fixture({ leverReference: [6, 0, 0, 0] }); core.gravityEnabled = false; core.autoRotateRunning = true; next(core); assert.equal(core.position[0], 0); core.autoPositionRunning = true; next(core); near(core.position[0], .1); });
test('air shallow lever multiplier .075 and interpolation exception', () => { const { core } = fixture(); install(core); core.groundedFlag = false; core.setInput({ ...zeroPacket(), stick: [.5, 0, 0, 0] }); next(core); near(core.vLever[0], .05); core.autoPositionRunning = true; next(core); near(core.vLever[0], .05 + 40 / 60); });
test('terminal correction only along gravity', () => { const { core } = fixture(); core.groundedFlag = false; core.vVert = [3, -100, 4, 0]; next(core); assert.deepEqual(core.vVert, [3, -49, 4, 0]); near(core.fallAccumulator, 49 / 60); });
test('fall accumulation uses collision-corrected position once before ground', () => {
  const { core } = fixture(); core.groundedFlag = false; core.vVert = [0, -6, 0, 0]; core.gravityScale = 0;
  assert.throws(() => core.postCollision()); core.preFrame(0); assert.throws(() => core.postCollision()); core.tick();
  assert.equal(core.fallAccumulator, 0); core.setPosition([0, -.04, 0, 0]); core.postCollision();
  assert.equal(core.fallAccumulator, F(.04)); assert.throws(() => core.postCollision());
});
test('fall accumulation preserves grounded and test-disabled state, rising resets', () => {
  const { core } = fixture(); core.gravityEnabled = false; core.fallAccumulator = 3; next(core); assert.equal(core.fallAccumulator, 3);
  core.groundedFlag = false; core.groundedTestEnabled = false; next(core); assert.equal(core.fallAccumulator, 3);
  core.groundedTestEnabled = true; core.vVert = [0, 1, 0, 0]; next(core); assert.equal(core.fallAccumulator, 0);
  core.groundedFlag = true; core.fallAccumulator = 3; core.preFrame(core.frameId + 1); core.tick(); core.jumpStatus = 1; core.postCollision(); assert.equal(core.fallAccumulator, 0);
});
test('ground reference reset and Jump start acceleration skip', () => { const { core } = fixture({ jumpCalculator: new JumpCalculator() }); next(core); near(core.vVert[1], -49 / 60); core.preFrame(1); core.startJump(13.5); core.tick(); assert.equal(core.vVert[1], 13.5); assert.equal(core.jumpStatus, 1); });
test('Slot participates in pose exactly once', () => { const { core } = fixture(); core.gravityEnabled = false; core.slots.setStepFunction(core.slots.create(1n), () => [2, 0, 0, 0]); next(core); assert.equal(core.position[0], 2); });
test('reentrant action changed event may dispose actor', () => { const { core, ports } = fixture(); ports.event = () => core.dispose(); assert.equal(core.setActionName(1n), 6); assert.equal(core.alive, false); assert.equal(core.callAction(1n), 0); });
test('grounded test bypass and jumpStatus1 exclusion', () => { const { core } = fixture(); core.jumpStatus = 1; assert.equal(core.grounded, false); core.groundedTestEnabled = false; assert.equal(core.grounded, true); });

for (const [normal, expected] of [[.7069, false], [F(.707), true], [.7071, true]] as const) test(`ground world normal.y ${normal}`, () => { const f = fixture(); const queries = f.collision as Queries; shape(f.registry, f.core.ref); queries.hit = hit(.01, normal); f.core.preFrame(0); f.core.collisionJobs(stamp(f.core, 'ground'), { kind: 'ground', mapMask: 4 }); assert.equal(f.core.grounded, expected); });
test('ground contacts collected while stopped on every ground job', () => { const f = fixture(); shape(f.registry, f.core.ref); (f.collision as Queries).hit = hit(); f.core.preFrame(0); for (let i = 0; i < 2; i++) f.core.collisionJobs(stamp(f.core, 'ground', i), { kind: 'ground', mapMask: 4 }); assert.equal(f.events.filter(e => e.kind === 'ground-contact').length, 2); });
test('sweep snap d+.02 boundary and jump d+.01 gate', () => { const f = fixture(); shape(f.registry, f.core.ref); const queries = f.collision as Queries; f.core.preFrame(0); queries.hit = hit(.03); f.core.collisionJobs(stamp(f.core, 'ground'), { kind: 'ground', mapMask: 4 }); assert.equal(f.core.position[1], 0); queries.hit = hit(.031); f.core.collisionJobs(stamp(f.core, 'ground', 1), { kind: 'ground', mapMask: 4 }); near(f.core.position[1], -.021); f.core.jumpStatus = 2; f.core.collisionJobs(stamp(f.core, 'ground', 2), { kind: 'ground', mapMask: 4 }); assert.equal(f.core.grounded, false); });
test('ray fallback starts opposite gravity by d', () => {
  const f = fixture(); const queries = f.collision as Queries;
  f.core.setPosition([2, 3, 4, 0]); f.core.preFrame(0); f.core.vVert = [0, -6, 0, 0];
  let origin: V3 | null = null;
  queries.ray = (p, _dir, distance) => { origin = [...p]; near(distance, F(F(6 * STEP_SEC) + F(.4))); return false; };
  f.core.collisionJobs(stamp(f.core, 'ground'), { kind: 'ground', mapMask: 4 });
  assert.deepEqual(origin, [2, F(3 + F(6 * STEP_SEC)), 4]);
});
test('invalidity and steep sweep fall back to ray without synthetic original event', () => { const f = fixture(); shape(f.registry, f.core.ref); const queries = f.collision as Queries; queries.hit = { ...hit(), validity: 4 }; queries.rayHit = hit(.1); f.core.preFrame(0); f.core.collisionJobs(stamp(f.core, 'ground'), { kind: 'ground', mapMask: 4 }); assert.equal(f.core.ground.source, 'ray'); near(f.core.position[1], -.09); assert.equal(f.events.filter(e => e.kind === 'ground-contact').length, 0); });
test('world Y limit and local override', () => { const f = fixture({ position: [0, -2, 0, 0], groundedLimitY: 0 }); f.core.preFrame(0); f.core.collisionJobs(stamp(f.core, 'ground'), { kind: 'ground', mapMask: 4, localLimit: () => false }); assert.equal(f.core.position[1], -2); assert.equal(f.core.grounded, false); f.core.collisionJobs(stamp(f.core, 'ground', 1), { kind: 'ground', mapMask: 4 }); assert.equal(f.core.position[1], 0); assert.equal(f.core.ground.source, 'limit'); });
test('ground event can delete actor during iteration', () => { const f = fixture(); shape(f.registry, f.core.ref); (f.collision as Queries).hit = hit(); f.ports.event = ev => { if (ev.kind === 'ground-contact') f.core.dispose(); }; f.core.preFrame(0); f.core.collisionJobs(stamp(f.core, 'ground'), { kind: 'ground', mapMask: 4 }); assert.equal(f.core.ground.source, 'none'); assert.equal(f.core.alive, false); });
test('disabled actor-body response is explicit', () => { const { core } = fixture(); core.preFrame(0); assert.throws(() => core.collisionJobs(stamp(core, 'actor-body'), { kind: 'actor-body', consume: null }), /R18\/R19/); });

function poseHash(): string {
  const f = fixture({ jumpCalculator: new JumpCalculator() }); install(f.core);
  let seed = 123456;
  const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  const samples: number[] = [];
  for (let i = 0; i < 360; i++) {
    f.core.preFrame(i); f.core.setInput({ ...zeroPacket(), stick: [F(rand() * 2 - 1), F(rand() * 2 - 1), 0, 0] });
    if (i % 70 === 0) { f.core.groundedFlag = false; f.core.callAction(hashes.Jump); }
    f.core.tick();
    if (f.core.position[1] < 0) { f.core.setPosition([f.core.position[0], 0, f.core.position[2], 0]); f.core.groundedFlag = true; }
    samples.push(...f.core.position, ...f.core.rotation, ...f.core.vVert, ...f.core.vLever);
  }
  return crypto.createHash('sha256').update(Buffer.from(new Float32Array(samples).buffer)).digest('hex');
}
test('same input → same pose hash, fresh instances', () => { const a = poseHash(); assert.equal(a, poseHash()); console.log(`pose SHA256 ${a}`); });

const px = await createPhysx(fs.readFileSync(path.join(WEB, 'script/game/lib/physx/physx.wasm')));
const backend = new PhysxCollisionBackend(px), world = new CollisionWorld(backend);
const live = new Set([1, 2, 3, 4, 100, 101]);
const registry = new ActorContactRegistry(r => r.generation === 1 && live.has(r.index));
const adapter = new ActorCollisionAdapter(world, { registry, resolveGroundKey: h => h.tag === 'floor' ? 'stone' : null,
  fallbackGroundKey: null, selectGround: () => 0, pairFallback: null });
const at = (x: number, y: number, z: number): Pose => [x, y, z, 0, 0, 0, 1];
const floor = world.createBody({ entity: e(100), motion: 0, pose: at(0, -.5, 0), shapes: [{ geometry: { kind: 'box', halfExtents: [8, .5, 8] }, layer: 2, material: [.5, .4, 0], tag: 'floor' }] });
const wall = world.createBody({ entity: e(101), motion: 0, pose: at(-.5, 0, 0), shapes: [{ geometry: { kind: 'box', halfExtents: [.5, 8, 8] }, layer: 2 }] });
const binding = new ActorCollisionBinding(adapter, registration(e(1), [2, .2, 0]));
const cap = actorCapsuleFromSegment([0, .25, 0], [0, .75, 0], .25);
const capRef = binding.addShape({ owner: e(1), nameHash: 1n, classMask: 2, enabled: true, ...cap }, { layer: 1 });
const capShape = registry.shapeInfo(capRef)!;
test('PhysX capsule endpoint conversion, local applied once', () => { const h = emptyActorHit(); assert.equal(adapter.sweep(capShape, [2, .21, 0], q, [0, -1, 0], .41, 4, e(1), h), true); near(h.distance, .21, 1e-5); near(h.normal[1], 1); assert.equal(h.body, floor); assert.equal(h.validity, 0); });
test('PhysX hit surface preserves identity/material and resolves key', () => { const h = emptyActorHit(); adapter.ray([2, 2, 0], [0, -1, 0], 3, 4, e(1), h); const s: ActorSurface = { body: 0, entity: e(0), shape: 0, faceIndex: -1, tag: null, physicsMaterial: null, groundKey: null }; assert.equal(adapter.resolveSurface(h, s), true); assert.equal(s.body, floor); assert.equal(s.groundKey, 'stone'); assert.equal(s.tag, 'floor'); near(s.physicsMaterial![1], .4); });
test('PhysX stopped capsule ground snap and original sweep event', () => { const f = fixture({ ref: binding.ref, position: [2, .2, 0, 0] }, registry, adapter); f.core.preFrame(0); f.core.collisionJobs(stamp(f.core, 'ground'), { kind: 'ground', mapMask: 4 }); near(f.core.position[1], 0, 1e-5); assert.equal(f.core.ground.source, 'sweep'); assert.equal(f.core.ground.surface?.groundKey, 'stone'); assert.equal(f.events.filter(e => e.kind === 'ground-contact').length, 1); });
const ball = new ActorCollisionBinding(adapter, registration(e(2), [.85, .85, 0]));
const ballRef = ball.addShape({ owner: e(2), nameHash: 2n, classMask: 2, enabled: true, geometry: { kind: 'sphere', radius: 1 }, center: [0, 0, 0], rotation: q }, { layer: 1 });
test('PhysX Map two perpendicular penetrations average adjusted vectors', () => { const contacts: ActorMapContact[] = []; assert.equal(adapter.mapContacts(registry.shapeInfo(ballRef)!, 4, contacts), 2); const raw = contacts.map(c => [...c.raw]); const delta = resolveActorMapContacts(contacts); near(delta[0], .075, 1e-5); near(delta[1], .075, 1e-5); contacts[0].adjusted.fill(0); assert.deepEqual(contacts.map(c => c.raw), raw); const modified = resolveActorMapContacts(contacts); near(Math.abs(modified[0]) + Math.abs(modified[1]), .075, 1e-5); });
test('Map job still runs with zero velocity and no STEP_UP', () => { const f = fixture({ ref: ball.ref, position: [.85, .85, 0, 0] }, registry, adapter); f.core.preFrame(0); f.core.collisionJobs(stamp(f.core, 'map'), { kind: 'map', mapMask: 4, classMask: 2 }); near(f.core.position[0], .925, 1e-5); near(f.core.position[1], .925, 1e-5); });
test('Map minimum penetration .01 is excluded', () => { const contact: ActorMapContact = { actor: e(1), actorShape: e(1), body: floor, entity: e(100), shape: 1, direction: [1, 0, 0], depth: F(.01), raw: [.01, 0, 0], adjusted: [9, 0, 0] }; assert.deepEqual(resolveActorMapContacts([contact]), [0, 0, 0]); });
test('PhysX AA penetration output default responses are disabled', () => { binding.syncPose([1.6, .85, 0], q, 1); const out: ActorPairContact[] = []; assert.equal(adapter.actorContacts(binding.ref, out), 1); assert.ok(out[0].depth > 0); assert.equal(out[0].respondA, false); assert.equal(out[0].respondB, false); assert.deepEqual(out[0].adjustedA, [0, 0, 0]); const reverse: ActorPairContact[] = []; adapter.actorContacts(ball.ref, reverse); assert.deepEqual(out, reverse); });
test('AA masks and shape enabled filter', () => { const a = registry.actorInfo(ball.ref)!; registry.updateActor(ball.ref, { ...a, modelMask: 2 }); const out: ActorPairContact[] = []; assert.equal(adapter.actorContacts(binding.ref, out), 0); registry.updateActor(ball.ref, { ...a, modelMask: 1 }); binding.setShapeEnabled(capRef, false); assert.equal(adapter.actorContacts(ball.ref, out), 0); binding.setShapeEnabled(capRef, true); });
test('syncPose/teleport reflected by queries, repeated phase invalidated', () => { binding.syncPose([5, 3, 0], q, 2, true); const out: ActorPairContact[] = []; assert.equal(adapter.actorContacts(ball.ref, out), 0); const h = emptyActorHit(); assert.equal(adapter.ray([5, 5, 0], [0, -1, 0], 3, 2, e(4), h), true); near(h.distance, 1, 1e-4); });
test('unstage/stage and actor enabled control owned query bodies', () => { const h = emptyActorHit(); binding.stage(false); assert.equal(adapter.ray([5, 5, 0], [0, -1, 0], 3, 2, e(4), h), false); binding.stage(true); binding.setEnabled(false); assert.equal(adapter.ray([5, 5, 0], [0, -1, 0], 3, 2, e(4), h), false); binding.setEnabled(true); assert.equal(adapter.ray([5, 5, 0], [0, -1, 0], 3, 2, e(4), h), true); });
test('unstaged source cannot sweep or collect Map contacts', () => { binding.stage(false); const h = emptyActorHit(); const contacts: ActorMapContact[] = []; assert.equal(adapter.sweep(capShape, [2, .2, 0], q, [0, -1, 0], .41, 4, e(1), h), false); assert.equal(adapter.mapContacts(capShape, 4, contacts), 0); binding.stage(true); });
test('Entity death invalidates actor and shape, generation cannot revive', () => { live.delete(2); assert.equal(registry.actorAlive(ball.ref), false); assert.equal(registry.shapeAlive(ballRef), false); const out: ActorPairContact[] = []; assert.equal(adapter.actorContacts(binding.ref, out), 0); ball.dispose(); live.add(2); assert.equal(registry.actorAlive(ball.ref), false); });
test('borrowed bodies survive binding dispose', () => { const b = new ActorCollisionBinding(adapter, registration(e(3))); const floorShape = world.bodyInfo(floor)!.shapes[0]; b.borrowShape({ owner: e(100), nameHash: 3n, classMask: 2, enabled: true, geometry: { kind: 'box', halfExtents: [8, .5, 8] }, center: [0, -.5, 0], rotation: q, collisionBody: floor, collisionShape: floorShape }); b.dispose(); assert.ok(world.bodyInfo(floor)); });
test('binding dispose invalidates registry, clears core before removing owned bodies', () => { const f = fixture({ ref: binding.ref }, registry, adapter); let called = 0; binding.onDispose(() => { called++; assert.equal(registry.actorAlive(binding.ref), false); assert.ok(world.bodyInfo(capShape.collisionBody)); f.core.dispose(); }); binding.dispose(); binding.dispose(); assert.equal(called, 1); assert.equal(world.bodyInfo(capShape.collisionBody), null); assert.equal(registry.shapeAlive(capRef), false); assert.equal(f.core.ground.source, 'none'); assert.ok(world.bodyInfo(wall)); });
test('registry slot reuse advances generation', () => { const old = binding.ref, b = new ActorCollisionBinding(adapter, registration(e(1))); assert.equal(b.ref.index, old.index); assert.notEqual(b.ref.generation, old.generation); assert.equal(registry.actorInfo(old), null); b.dispose(); });
test('removeShape invalidates generation and frees only owned body', () => {
  const b = new ActorCollisionBinding(adapter, registration(e(4)));
  const ref = b.addShape({ owner: e(4), nameHash: 4n, classMask: 2, enabled: true, ...cap }, { layer: 1 });
  const before = registry.shapeInfo(ref)!;
  assert.equal(b.removeShape(ref), true); assert.equal(registry.shapeAlive(ref), false);
  assert.equal(world.bodyInfo(before.collisionBody), null); assert.equal(b.removeShape(ref), false);
  const h = emptyActorHit(); assert.equal(adapter.sweep(before, [2, .2, 0], q, [0, -1, 0], 1, 4, e(4), h), false); b.dispose();
});
test('dispose callback errors still release every owned body', () => {
  const b = new ActorCollisionBinding(adapter, registration(e(4)));
  const ref = b.addShape({ owner: e(4), nameHash: 4n, classMask: 2, enabled: true, ...cap }, { layer: 1 });
  const body = registry.shapeInfo(ref)!.collisionBody; let tail = false;
  b.onDispose(() => { throw new Error('fixture cleanup'); }); b.onDispose(() => { tail = true; });
  assert.throws(() => b.dispose(), AggregateError); assert.equal(tail, true); assert.equal(world.bodyInfo(body), null);
});
test('surface resolver that deletes a hit body cannot publish stale surface', () => {
  const body = world.createBody({ entity: e(4), motion: 0, pose: at(6, 1, 0), shapes: [{ geometry: { kind: 'sphere', radius: .5 }, layer: 3 }] });
  const a = new ActorCollisionAdapter(world, { ...adapter.config, resolveGroundKey: () => { world.removeBody(body); return 'stale'; } });
  const h = emptyActorHit(); assert.equal(a.ray([6, 3, 0], [0, -1, 0], 3, 8, e(1), h), true);
  const surface: ActorSurface = { body: 0, entity: e(0), shape: 0, faceIndex: -1, tag: null, physicsMaterial: null, groundKey: null };
  assert.equal(a.resolveSurface(h, surface), false); assert.equal(surface.groundKey, null);
});
world.dispose(); backend.dispose();

function characterFixture() {
  const char = new CharacterCore({ info: name => name === 'missing' ? undefined : { frames: 20, loop: false }, rand: n => n - 1, rules: RULES_ORIGINAL });
  const names = new Map(['idle', 'walk', 'missing'].map(name => [BigInt(fnv1a64(name)), name]));
  const order: string[] = [];
  const target = coreCharacterTarget(char, () => { order.push('pose'); });
  const step = target.step;
  target.step = () => { order.push(`step:${char.ground}`); step(); };
  return { char, names, order, binding: new ActorCharacterBinding(target, names, 'scene-default') };
}
test('main MotionArg play preserves speedValid=false', () => { const c = characterFixture(); c.char.main.speed = 2; c.binding.motion({ kind: 'play', slot: 'main', arg: { ...motionArg('idle', { speedValid: false, speed: 9 }), hash: BigInt(fnv1a64('idle')), transitionType: 1 } }); assert.equal(c.char.main.speed, 2); assert.equal(c.binding.motionState().hash, BigInt(fnv1a64('idle'))); assert.equal(c.binding.motionState().playback, 1); });
test('condition-speed and enqueue keep all motion flags', () => { const c = characterFixture(); c.binding.motion({ kind: 'condition-speed', slot: 'main', value: .5 }); assert.equal(c.char.main.conditionSpeed, .5); const arg = { ...motionArg('walk', { speedValid: false, forceRestart: true, startFrame: 3, speed: 7, blendTime: .2, transitionType: 4 }), hash: BigInt(fnv1a64('walk')), transitionType: 4 as const }; c.binding.motion({ kind: 'enqueue', slot: 'main', arg }); assert.equal(c.char.main.queued.speedValid, false); assert.equal(c.char.main.queued.startFrame, 3); assert.equal(c.char.main.queued.transitionType, 4); assert.equal(c.char.main.queued.forceRestart, true); });
test('name/hash mismatch rejected instead of guessed', () => { const c = characterFixture(); assert.throws(() => c.binding.motion({ kind: 'play', slot: 'main', arg: { ...motionArg('idle'), hash: 123n, transitionType: 1 } }), /Unregistered/); assert.throws(() => new ActorCharacterBinding(coreCharacterTarget(c.char, () => {}), new Map([[1n, 'idle']]), null), /Invalid/); });
test('publish pose → ground → character step; duplicate frame blocked', () => { const c = characterFixture(), f = fixture(); next(f.core); f.core.ground.grounded = true; c.binding.publish(f.core); assert.deepEqual(c.order, ['pose', 'step:scene-default']); assert.throws(() => c.binding.publish(f.core), /new frame/); next(f.core); f.core.ground.grounded = false; c.binding.publish(f.core); assert.equal(c.char.ground, null); });
test('character binding dispose does not dispose borrowed core', () => { const c = characterFixture(); c.binding.dispose(); c.binding.motion({ kind: 'condition-speed', slot: 'main', value: 99 }); assert.equal(c.char.main.conditionSpeed, 1); assert.equal(c.char.play('idle'), true); });
test('actor Run action drives main motion, then publishes pose/ground/frame', () => {
  const c = characterFixture(), f = fixture(); f.ports.motion = c.binding.motion; f.ports.motionState = c.binding.motionState;
  f.core.installBasicActions({ hashes, motions: { Idle: { ...motionArg('idle'), hash: BigInt(fnv1a64('idle')), transitionType: 1 },
    Run: { ...motionArg('walk'), hash: BigInt(fnv1a64('walk')), transitionType: 1 } },
    landingEnabled: false, groundInput: null, airInput: null, groundLever: null });
  assert.equal(c.char.main.name, 'idle'); f.core.gravityEnabled = false;
  f.core.setInput({ ...zeroPacket(), stick: [1, 0, 0, 0] }); next(f.core); f.core.ground.grounded = true; c.binding.publish(f.core);
  assert.equal(c.char.main.name, 'walk'); near(f.core.position[0], .1); near(c.char.main.frame, 1); assert.equal(c.char.ground, 'scene-default');
});

function imports(file: string): string[] {
  const text = fs.readFileSync(path.join(WEB, file), 'utf8');
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const result: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) result.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) result.push(node.arguments[0]?.getText(tree) ?? 'dynamic');
    ts.forEachChild(node, visit);
  };
  visit(tree); return result;
}
test('actor import zero', () => assert.deepEqual(imports('script/game/lib/actor/index.ts'), []));
test('actor-collision imports only actor/collision', () => assert.deepEqual(imports('script/game/lib/actor-collision/index.ts').sort(), ['../actor', '../collision']));
test('app actor import allowlist and no dev', () => { for (const spec of imports('script/app/common/actor/index.ts')) assert.ok(['@game/lib/actor', '@game/lib/character', '@game/core/pad'].includes(spec), spec); });
test('actor paths have no wall clock or unseeded random', () => { for (const p of ['script/game/lib/actor/index.ts', 'script/game/lib/actor-collision/index.ts', 'script/app/common/actor/index.ts']) assert.doesNotMatch(fs.readFileSync(path.join(WEB, p), 'utf8'), /Math\.random|Date\.now|performance\.now/); });

console.log(`actor: ${passed}/${passed + failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
