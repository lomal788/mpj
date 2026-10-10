import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { BakedCameraPlayerApprox, cameraSnapshot, sampleBakedApprox, type CameraSample, type CameraSnapshot } from '@game/lib/camera';
import { writeThree } from '@game/lib/camera-three';
import { applyBakedCameraApprox, parseBakedCamera, webCameraMathApprox } from '@app/common/render3d/camera';
import { applyCamera, CAMERAS, type CameraLabel } from '@app/minigame/mg1801/view/camera';
import { MgCamera } from '@app/minigame/frame/stage/camera';
import { FsnbCamera } from '@app/scene/world/plaza/balloon';
import { Stage3D } from '@app/common/render3d/stage';
import type { CameraDriver } from '@app/common/render3d/types';

let pass = 0, fail = 0;
function test(name: string, fn: () => void): void {
  try { fn(); pass++; } catch (e) { fail++; console.error(`FAIL ${name}`, e); }
}
const near = (a: number, b: number, epsilon = 1e-12): void => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const vector = (a: readonly number[], b: readonly number[], epsilon = 1e-12): void => {
  assert.equal(a.length, b.length);
  a.forEach((v, i) => near(v, b[i], epsilon));
};
const projection = { type: 'perspective' as const, fovy: Math.PI / 3, aspect: 16 / 9, near: 0.1, far: 1000 };
const sample: CameraSample = { pos: [1, 3, 5], rotOrAim: [0, 0, 0], mode: 'Aim', twist: 0, projection };
const snapshot = (s = sample): CameraSnapshot => cameraSnapshot(s, projection, webCameraMathApprox);
const clip = { frames: 2, loop: false, mode: 'Aim', pos: [[0, 1, 3], [1, 1, 3], [2, 1, 3]], rotOrAim: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], twist: [0, 0.2, 0.4], fovyRad: [0.4, 0.5, 0.6], near: [0.01, 0.01, 0.01], far: [1000, 1000, 1000] };

for (const twist of [0, -0.4, 1.2]) test(`Aim twist ${twist}`, () => {
  const s = { ...sample, twist }, actual = new THREE.PerspectiveCamera(), expected = new THREE.PerspectiveCamera();
  writeThree(snapshot(s), actual);
  expected.position.set(...s.pos); expected.lookAt(...s.rotOrAim); expected.rotateZ(twist); expected.updateMatrixWorld();
  vector(actual.matrixWorld.elements, expected.matrixWorld.elements);
  near(snapshot(s).focus, Math.sqrt(35));
});
for (const y of [-1, 1]) test(`vertical Aim ${y} ignores twist`, () => {
  const s = snapshot({ ...sample, pos: [0, y, 0], twist: 1 });
  assert.deepEqual(s.right, [1, 0, 0]); assert.deepEqual(s.back, [0, y, 0]); assert.deepEqual(s.up, [0, 0, -y]);
});
for (const yaw of [-7, 0, 7]) test(`Euler yaw ${yaw}`, () => {
  const s: CameraSample = { ...sample, mode: 'EulerZXY', rotOrAim: [0.3, yaw, -0.2] };
  const actual = new THREE.PerspectiveCamera(), expected = new THREE.PerspectiveCamera();
  writeThree(snapshot(s), actual);
  expected.position.set(...s.pos); expected.rotation.set(...s.rotOrAim, 'YXZ'); expected.updateMatrixWorld();
  vector(actual.matrixWorld.elements, expected.matrixWorld.elements); assert.equal(snapshot(s).focus, -1);
});
test('pass flags preserve/select aspect and near/far independently', () => {
  const current = { ...projection, aspect: 2, near: 3, far: 400 };
  for (const applyAspect of [false, true]) for (const applyNearFar of [false, true]) {
    const p = cameraSnapshot(sample, current, webCameraMathApprox, { applyAspect, applyNearFar }).projection;
    assert.equal(p.aspect, applyAspect ? projection.aspect : current.aspect);
    assert.equal(p.near, applyNearFar ? projection.near : current.near);
    assert.equal(p.far, applyNearFar ? projection.far : current.far);
  }
  assert.equal(cameraSnapshot(sample, current, webCameraMathApprox).projection.aspect, 2);
  assert.equal(cameraSnapshot(sample, current, webCameraMathApprox).projection.near, 0.1);
});
test('entity world composed once including roll; input snapshot unchanged', () => {
  const local = new THREE.PerspectiveCamera(); writeThree(snapshot(), local);
  const world = new THREE.Matrix4().compose(new THREE.Vector3(4, -2, 7), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.7, 0.6)), new THREE.Vector3(1, 1, 1));
  const expected = world.clone().multiply(local.matrixWorld);
  const before = JSON.stringify(sample);
  const s = cameraSnapshot(sample, projection, webCameraMathApprox, {}, world.elements);
  const actual = new THREE.PerspectiveCamera(); writeThree(s, actual);
  vector(actual.matrixWorld.elements, expected.elements);
  assert.equal(JSON.stringify(sample), before);
});
test('Three parent does not apply world transform twice', () => {
  const parent = new THREE.Group(); parent.position.set(10, 4, -2); parent.rotation.y = 0.8;
  const child = new THREE.PerspectiveCamera(), standalone = new THREE.PerspectiveCamera(); parent.add(child);
  writeThree(snapshot(), child); writeThree(snapshot(), standalone);
  vector(child.matrixWorld.elements, standalone.matrixWorld.elements);
});
test('orthographic fovy is height and adapter uses WebGL depth', () => {
  const s = snapshot({ ...sample, projection: { ...projection, type: 'orthographic', fovy: 10, near: 0 } });
  const camera = new THREE.OrthographicCamera(); writeThree(s, camera);
  near(camera.top, 5); near(camera.right, 5 * 16 / 9);
  near(new THREE.Vector3(0, 0, -camera.near).applyMatrix4(camera.projectionMatrix).z, -1);
  near(new THREE.Vector3(0, 0, -camera.far).applyMatrix4(camera.projectionMatrix).z, 1);
  assert.throws(() => writeThree(s, new THREE.PerspectiveCamera()), /mismatch/);
});
test('perspective WebGL near/far depth', () => {
  const c = new THREE.PerspectiveCamera(); writeThree(snapshot(), c);
  near(new THREE.Vector3(0, 0, -c.near).applyMatrix4(c.projectionMatrix).z, -1);
  near(new THREE.Vector3(0, 0, -c.far).applyMatrix4(c.projectionMatrix).z, 1);
});
test('unsupported/degenerate data fails explicitly', () => {
  assert.throws(() => snapshot({ ...sample, rotOrAim: sample.pos }), /coincident/);
  assert.throws(() => sampleBakedApprox({ ...clip, pos: [] }, 0), /empty/);
  assert.throws(() => sampleBakedApprox({ ...clip, mode: 'Unknown' }, 0), /unsupported/);
  assert.throws(() => snapshot({ ...sample, projection: { ...projection, type: 'type2' as 'perspective' } }), /unsupported/);
});
test('baked approximation explicitly floors/clamps frame', () => {
  assert.deepEqual(sampleBakedApprox(clip, -1).pos, clip.pos[0]);
  assert.deepEqual(sampleBakedApprox(clip, 1.9).pos, clip.pos[1]);
  assert.deepEqual(sampleBakedApprox(clip, 999).pos, clip.pos[2]);
});
test('near approximation is opt-in; core near remains original', () => {
  const camera = new THREE.PerspectiveCamera();
  applyBakedCameraApprox(camera, clip, 0); assert.equal(camera.near, 0.01);
  applyBakedCameraApprox(camera, clip, 0, { minNearApprox: 0.3 }); assert.equal(camera.near, 0.3);
});
for (const dir of ['plaza/world/anim', ...['mg0101', 'mg0102', 'mg0106', 'mg0122', 'mg0508'].map(g => `mg/${g}/cam`)]) {
  const path = resolve(import.meta.dirname, '../assets', dir);
  for (const file of readdirSync(path).filter(f => f.endsWith('.fsnb.json'))) test(`asset ${dir}/${file} start/fraction/middle/end`, () => {
    const c = parseBakedCamera(JSON.parse(readFileSync(resolve(path, file), 'utf8')));
    assert.ok(c);
    for (const frame of [0, 0.5, c.frames / 2, c.frames]) {
      const i = Math.max(0, Math.min(c.pos.length - 1, Math.floor(frame)));
      const actual = new THREE.PerspectiveCamera(40, 16 / 9), expected = new THREE.PerspectiveCamera(40, 16 / 9);
      applyBakedCameraApprox(actual, c, frame, { minNearApprox: 0.3 });
      const p = c.pos[i], r = c.rotOrAim[i]; expected.position.set(p[0], p[1], p[2]);
      if (c.mode === 'EulerZXY') expected.rotation.set(r[0], r[1], r[2], 'YXZ');
      else { expected.lookAt(r[0], r[1], r[2]); expected.rotateZ(c.twist[i] ?? 0); }
      expected.fov = THREE.MathUtils.radToDeg(c.fovyRad[i]); expected.near = Math.max(c.near[i], 0.3); expected.far = c.far[i];
      expected.updateMatrixWorld(); expected.updateProjectionMatrix();
      vector(actual.matrixWorld.elements, expected.matrixWorld.elements, 1e-10);
      vector(actual.projectionMatrix.elements, expected.projectionMatrix.elements, 1e-10);
    }
  });
}
test('baked clock speed, pause, stop, endpoint, negative loop, zero duration', () => {
  const p = new BakedCameraPlayerApprox(3, false, 0, 0.5);
  p.step(); assert.equal(p.frame, 0.5);
  p.speed = 0; p.step(); assert.equal(p.frame, 0.5);
  p.speed = 1; p.playing = false; p.step(); assert.equal(p.frame, 0.5);
  p.playing = true; p.step(20); assert.equal(p.frame, 3); assert.equal(p.finished, true);
  p.stop(); assert.equal(p.step(), false); assert.equal(p.frame, 3);
  const loop = new BakedCameraPlayerApprox(3, true, 0, -1); loop.step(); assert.equal(loop.frame, 2);
  const zero = new BakedCameraPlayerApprox(0, true); zero.step(); assert.equal(zero.frame, 0);
});
test('frame/speed setters store f32', () => {
  const p = new BakedCameraPlayerApprox(300); p.frame = 0.1; p.speed = 0.2;
  assert.equal(p.frame, Math.fround(0.1)); assert.equal(p.speed, Math.fround(0.2));
  p.step(); assert.equal(p.frame, Math.fround(Math.fround(0.1) + Math.fround(0.2)));
});
for (const label of Object.keys(CAMERAS) as CameraLabel[]) test(`mg1801 ${label} preserves pose and NDC`, () => {
  const actual = new THREE.PerspectiveCamera(40, 16 / 9), expected = new THREE.PerspectiveCamera(40, 16 / 9), c = CAMERAS[label];
  applyCamera(actual, label);
  expected.position.set(...c.pos); expected.lookAt(...c.aim); expected.fov = c.fovy * 180 / Math.PI; expected.near = c.near; expected.far = c.far; expected.updateProjectionMatrix(); expected.updateMatrixWorld();
  vector(actual.matrixWorld.elements, expected.matrixWorld.elements); vector(actual.projectionMatrix.elements, expected.projectionMatrix.elements);
  for (const point of [[-3, 7.5, 0], [-3, 1.5, 0], [-3, 0, -2]]) vector(new THREE.Vector3(...point).project(actual).toArray(), new THREE.Vector3(...point).project(expected).toArray());
});
test('plaza hold keeps ownership; apply never advances; MgCamera stop once', () => {
  const cam = new THREE.PerspectiveCamera(), p = new FsnbCamera(clip);
  p.playing = false; assert.equal(p.step(cam, 1), true); p.apply(cam); assert.equal(p.frame, 0);
  p.playing = true; p.step(cam, 1); p.apply(cam); p.apply(cam); assert.equal(p.frame, 1);
  let stopped = 0; const m = new MgCamera('fixture', clip, {}, () => stopped++);
  m.step(cam, 1); m.apply(cam); m.apply(cam); assert.equal(m.frame, 1);
  m.stop(); m.stop(); assert.equal(stopped, 1); assert.equal(m.step(cam, 1), false);
});
test('draw cadence/resize does not change pose history hash', () => {
  const run = (draws: number): string => {
    const c = new MgCamera('fixture', { ...clip, loop: true }, { speed: 0.5 });
    const camera = new THREE.PerspectiveCamera(), history: unknown[] = [];
    for (let tick = 0; tick < 120; tick++) {
      c.step(camera, 1);
      for (let j = 0; j < draws; j++) { camera.aspect = j % 2 ? 2 : 1; camera.updateProjectionMatrix(); c.apply(camera); }
      history.push([c.frame, sampleBakedApprox(clip, c.frame)]);
    }
    return createHash('sha256').update(JSON.stringify(history)).digest('hex');
  };
  assert.equal(run(0), run(1)); assert.equal(run(1), run(4));
});
test('Stage3D steps only selected slot and resumes follow when animation stops', () => {
  const calls: string[] = []; let active = true;
  const driver = (name: string): CameraDriver => ({ step: () => { calls.push(`${name}:step`); return name === 'follow' || active; }, apply: () => { calls.push(`${name}:apply`); } });
  const stage = { frame: 0, globals: { time: { value: 0 }, ms: { value: 0 }, worldFrame: { value: 0 } }, clipsLive: new Set(), updaters: new Set(), overridden: [], cameraDrivers: { anim: driver('anim'), follow: driver('follow') }, camera: new THREE.PerspectiveCamera(), fitShadow() {}, sky: null };
  Stage3D.prototype.update.call(stage as unknown as Stage3D, 1 / 60);
  assert.deepEqual(calls, ['anim:step', 'anim:apply']);
  active = false; calls.length = 0;
  Stage3D.prototype.update.call(stage as unknown as Stage3D, 1 / 60);
  assert.deepEqual(calls, ['anim:step', 'follow:step', 'follow:apply']);
});
test('import and deterministic API boundaries', () => {
  const root = resolve(import.meta.dirname, '..');
  const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');
  const imports = (s: string): string[] => [...s.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1]).sort();
  const core = read('script/game/lib/camera/index.ts'), adapter = read('script/game/lib/camera-three/index.ts');
  assert.deepEqual(imports(core), []); assert.deepEqual(imports(adapter), ['../camera', 'three']);
  assert.doesNotMatch(core + adapter + read('script/app/common/render3d/camera.ts'), /Math\.random|Date\.now|performance\.now/);
});

console.log(`camera: ${pass}/${pass + fail} passed`);
process.exitCode = fail ? 1 : 0;
