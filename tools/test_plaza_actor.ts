import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { ActorCharacterBinding, coreCharacterTarget } from '@app/common/actor';
import { ActorCore, F, emptyActorHit, type Ref } from '@game/lib/actor';
import { CharacterCore, fnv1a64 } from '@game/lib/character';
import { PlazaMover, NO_LEVER, shapeOf, type PlazaCharaSpec } from '@app/scene/world/plaza/player';
import { RemoteMotion } from '@app/scene/world/plaza/follow';
import { actorRows, planeActorWorld, apxActorWorld, testActorWorld, disposeActorFixtures } from './plaza_actor_fixture';

let pass = 0, fail = 0;
function test(name: string, body: () => void): void {
  try { body(); pass++; }
  catch (error) { fail++; console.error(`FAIL ${name}\n${error instanceof Error ? error.stack : error}`); }
}
const near = (a: number, b: number, eps = 1e-5): void => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} ±${eps}`);
const shape = { radius: .9, height: 1.54 };
const mover = (world = planeActorWorld()): PlazaMover => new PlazaMover(shape, world);
const right = { depth: 1, dirX: 1, dirZ: 0, deg: 90 };
const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
const pad = (lx = 0, ly = 0, buttons = 0) => ({ lx, ly, buttons, rx: 0, ry: 0 });

test('PlazaMover uses ActorCore and all common33 rows', () => {
  const m = mover(); assert.ok(m.core instanceof ActorCore); assert.deepEqual(m.core.params.rawRows, actorRows);
  near(m.core.params.airTurn, 180); near(m.core.params.airFastTurn, 720);
});
test('Adjust source capsule and mask come from §4.5, visual dimensions stay separate', () => {
  const m = mover(), refs: Ref[] = []; m.physics.registry.snapshotShapes(m.binding.ref, refs);
  const s = m.physics.registry.shapeInfo(refs[0])!;
  assert.deepEqual(s.geometry, { kind: 'capsule', radius: .5, halfHeight: .25 });
  assert.deepEqual(s.center, [0, .75, 0]); assert.equal(s.classMask, 0x2022);
  assert.equal(shapeOf({ ...shape, pc: 'pc50', bubbleRadius: .9 } as unknown as PlazaCharaSpec).radius, 1);
});
test('local NPAD includes Dpad and radial threshold without diagonal clamp', () => {
  const m = mover(); m.place(new THREE.Vector3(), 0);
  m.tickPad(pad(.01), cam); assert.equal(m.action, 'Idle');
  m.tickPad(pad(.1), cam); assert.equal(m.action, 'Walk');
  const lever = m.tickPad(pad(1, 1), cam); assert.ok(lever.depth > 1.4); assert.equal(m.action, 'Run');
  const dpad = m.tickPad(pad(0, 0, 1 << 12), cam); near(dpad.dirX, -1); assert.equal(m.action, 'Run');
});
test('local input-disabled does not move but permits LookAt', () => {
  const m = mover(); m.place(new THREE.Vector3(), 0); m.inputEnabled = false; m.lookAt(new THREE.Vector3(0, 0, -10));
  for (let i = 0; i < 18; i++) m.tickPad(pad(1), cam);
  near(m.pos.x, 0); near(m.pos.z, 0); near(Math.abs(m.yaw), 180, 1e-4);
});
test('original ground sweep enables MTD and leaves both-sides unset', () => {
  const world = planeActorWorld(); assert.equal(world.adapter.options.sweepMtd, true);
  assert.equal(world.adapter.options.sweepBothSides, undefined);
});
test('stopped actor collects Map and repeated original ground contacts', () => {
  const world = planeActorWorld(), m = mover(world); m.place(new THREE.Vector3(0, -.2, 0), 0);
  m.tick(NO_LEVER); assert.ok(m.pos.y > -.01); const contacts = m.contactCalls;
  for (let i = 0; i < 10; i++) m.tick(NO_LEVER);
  assert.equal(m.contactCalls, contacts + 10); assert.equal(m.core.ground.source, 'sweep');
});
test('walk/run numeric trajectory is f32 and deterministic', () => {
  for (const [depth, expected] of [[.5, 2], [1, 6]]) {
    const m = mover(); for (let i = 0; i < 60; i++) m.tick({ ...right, depth });
    near(m.pos.x, expected, 1e-5); assert.equal(F(m.pos.x), m.pos.x); near(m.speed, expected);
  }
});
test('ground slope rejects world normal.y below .707', () => {
  const world = testActorWorld();
  const angle = Math.PI / 3;
  world.addMap('CollisionMain', [{ geometry: { kind: 'box', halfExtents: [5, .05, 5] }, layer: 2 }], [0, -.2, 0, 0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]);
  const m = mover(world); m.place(new THREE.Vector3(0, .5, 0), 0); m.tick(NO_LEVER);
  assert.equal(m.grounded, false);
});
test('Main/First stage toggles apply to ray and actor ground', () => {
  const world = testActorWorld();
  world.addMap('CollisionMain', [{ geometry: { kind: 'box', halfExtents: [5, .5, 5] }, layer: 2 }], [0, -.5, 0, 0, 0, 0, 1]);
  world.addMap('CollisionFirst', [{ geometry: { kind: 'box', halfExtents: [5, .5, 5] }, layer: 2 }], [0, 1.5, 0, 0, 0, 0, 1], false);
  const m = mover(world); m.tick(NO_LEVER); assert.equal(m.grounded, true);
  world.setEnabled('CollisionMain', false); m.tick(NO_LEVER); assert.equal(m.grounded, false);
  const p = new THREE.Vector3(0, 3, 0); world.setEnabled('CollisionFirst', true); near(m.projectGround(p).y, 2);
  world.setEnabled('CollisionFirst', false); assert.equal(world.ground([0, 3, 0], 5, { index: -1, generation: 0 }), null);
});
test('remote interpolation moves once per tick and rotation-only stops position', () => {
  const m = mover(), remote = new RemoteMotion(m); remote.spawn(new THREE.Vector3(), 90); remote.receive(new THREE.Vector3(3, 0, 0), 90);
  for (let i = 0; i < 5; i++) remote.tick(); near(m.pos.x, .5);
  remote.receive(new THREE.Vector3(1, 0, 0), 45); const x = m.pos.x;
  for (let i = 0; i < 30; i++) remote.tick(); assert.equal(m.pos.x, x); near(m.yaw, 45);
  assert.equal(m.core.slots.step()[0], 0);
});
test('arrival adjustment is imported into ActorCore before integration', () => {
  const m = mover(), remote = new RemoteMotion(m); remote.spawn(new THREE.Vector3(), 0); remote.receive(new THREE.Vector3(2.35, 0, 0), 90);
  for (let i = 0; i < 35; i++) remote.tick(); near(m.pos.x, 2.35); assert.equal(remote.interp.movePos, false); assert.equal(m.action, 'Idle');
});
test('primary motion and final pose publish only once per frame', () => {
  const m = mover(), core = new CharacterCore({ info: () => ({ frames: 60, loop: true }), rand: () => 0 });
  const target = coreCharacterTarget(core, (p, q) => { assert.deepEqual(p, m.core.position.slice(0, 3)); assert.deepEqual(q, m.core.rotation); });
  const names = new Map(['co_idle00', 'co_walk00', 'co_run00', 'forced'].map(n => [BigInt(fnv1a64(n)), n]));
  const binding = new ActorCharacterBinding(target, names, null); m.connectCharacter(binding, binding.motion);
  m.tick(right); m.publish(); assert.equal(core.main.name, 'co_run00'); near(core.main.frame, 1);
  assert.throws(() => m.publish(), /new frame/);
  m.motionEnabled = false; core.play('forced'); m.tick(NO_LEVER); m.publish(); assert.equal(core.main.name, 'forced'); near(core.main.frame, 1);
  m.motionEnabled = true; m.tick(NO_LEVER); m.publish(); assert.equal(core.main.name, 'co_idle00'); assert.equal(core.ground, null);
});
test('teleport and individual/world disposal synchronize physics and invalidate refs', () => {
  const world = planeActorWorld(), m = mover(world), ref = m.binding.ref;
  m.place(new THREE.Vector3(5, 0, 2), 90); const h = emptyActorHit();
  assert.ok(world.adapter.ray([5, 3, 2], [0, -1, 0], 3, 2, { index: -1, generation: 0 }, h));
  m.dispose(); m.dispose(); assert.equal(world.registry.actorAlive(ref), false);
  assert.equal(world.adapter.ray([5, 3, 2], [0, -1, 0], 3, 2, { index: -1, generation: 0 }, h), false);
  const m2 = mover(world); world.dispose(); assert.equal(m2.core.alive, false); m2.dispose();
});
function trace(): string {
  const world = apxActorWorld(true), m = mover(world), samples: number[] = []; m.place(new THREE.Vector3(0, -2.365, 22.316), 180);
  for (let i = 0; i < 300; i++) { m.tick(i < 100 ? right : i < 200 ? { depth: .5, dirX: 0, dirZ: 1, deg: 0 } : NO_LEVER); samples.push(...m.core.position, ...m.core.rotation, m.contactCalls); }
  const hash = crypto.createHash('sha256').update(Buffer.from(new Float32Array(samples).buffer)).digest('hex'); world.dispose(); return hash;
}
test('real plaza APX fresh worlds give identical pose/contact trace', () => { const a = trace(); assert.equal(a, trace()); console.log(`plaza actor SHA256 ${a}`); });
for (const x of [0, -1, 1]) test(`current APX stairs x=${x}: Map lift, steep Sweep rejection, Ray snap`, () => {
  const world = apxActorWorld(), m = mover(world), input = { depth: 1, dirX: 0, dirZ: -1, deg: 180 };
  m.place(new THREE.Vector3(x, -2.365, 22.316), 180);
  for (let i = 0; i < 360; i++) m.tick(input);
  let mapRise = 0, sweepNormalY = -1, rayNormalY = -1, rayDistance = 0, rayOriginY = 0;
  const map = world.adapter.mapContacts.bind(world.adapter), sweep = world.adapter.sweep.bind(world.adapter), ray = world.adapter.ray.bind(world.adapter);
  world.adapter.mapContacts = (...args) => { const n = map(...args); for (const c of args[2]) mapRise += c.adjusted[1]; return n; };
  world.adapter.sweep = (...args) => { const found = sweep(...args); if (found) sweepNormalY = args[7].normal[1]; return found; };
  world.adapter.ray = (...args) => {
    const found = ray(...args);
    if (found) { rayNormalY = args[5].normal[1]; rayDistance = args[5].distance; rayOriginY = args[0][1]; }
    return found;
  };
  m.tick(input);
  assert.ok(mapRise > .05 && mapRise < .07);
  assert.ok(sweepNormalY > .5 && sweepNormalY < F(.707));
  assert.ok(rayNormalY >= F(.707) && rayDistance > F(.02));
  assert.equal(m.core.ground.source, 'ray'); near(m.pos.y, rayOriginY - rayDistance, 1e-6);
  near(m.pos.z, 13.2789669, 2e-4); near(m.pos.y, -1.8301867, 2e-4);
  console.log(`stairs current x=${x}: MapY=${mapRise}, SweepNY=${sweepNormalY}, RayD=${rayDistance}, position=${m.pos.toArray()}`);
  world.dispose();
});
disposeActorFixtures();
console.log(`plaza actor: ${pass}/${pass + fail} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
