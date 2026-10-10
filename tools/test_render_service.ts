import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createIblShare, MaterialSetup } from '@app/common/render3d/material';
import { RenderService } from '@app/common/render/service';
import { Renderer } from '../script/view/renderer';
import { PlazaGl } from '../script/view/plazaGl';
import type { PlazaWorld } from '@app/scene/world/plaza/types';
import type { StageGpu } from '@app/common/render3d';
import { FrameScheduler, P0 } from '@game/lib/assetcore';
import { ScenePreparer } from '@game/lib/assetcore-three';

class Canvas extends EventTarget {
  style = { visibility: 'hidden' };
  clientWidth = 960;
  parent: unknown = null;
  remove(): void { this.parent = null; }
}
class Probe {
  target: THREE.WebGLRenderTarget | null = null;
  viewport = new THREE.Vector4(1, 2, 300, 200);
  scissor = new THREE.Vector4(3, 4, 100, 90);
  size = new THREE.Vector2(800, 600);
  ratio = 2;
  scissorTest = true;
  color = new THREE.Color(0x123456);
  alpha = 0.3;
  autoClear = false; autoClearColor = false; autoClearDepth = false; autoClearStencil = false;
  shadowMap = { enabled: true, type: THREE.PCFSoftShadowMap as THREE.ShadowMapType, autoUpdate: false, needsUpdate: true };
  toneMapping: THREE.ToneMapping = THREE.ACESFilmicToneMapping;
  toneMappingExposure = 1.8;
  outputColorSpace = THREE.LinearSRGBColorSpace;
  disposed = 0;
  info = { programs: [], memory: {} };
  draws: (THREE.WebGLRenderTarget | null)[] = [];
  compileTargets: (THREE.WebGLRenderTarget | null)[] = [];
  readonly gl = this as unknown as THREE.WebGLRenderer;
  getRenderTarget() { return this.target; }
  setRenderTarget(t: THREE.WebGLRenderTarget | null) { this.target = t; }
  getViewport(v: THREE.Vector4) { return v.copy(this.viewport); }
  setViewport(v: THREE.Vector4) { this.viewport.copy(v); }
  getScissor(v: THREE.Vector4) { return v.copy(this.scissor); }
  setScissor(v: THREE.Vector4) { this.scissor.copy(v); }
  getScissorTest() { return this.scissorTest; }
  setScissorTest(v: boolean) { this.scissorTest = v; }
  getClearColor(c: THREE.Color) { return c.copy(this.color); }
  getClearAlpha() { return this.alpha; }
  setClearColor(c: THREE.ColorRepresentation, a = 1) { this.color.set(c); this.alpha = a; }
  getSize(v: THREE.Vector2) { return v.copy(this.size); }
  getPixelRatio() { return this.ratio; }
  setPixelRatio(v: number) { this.ratio = v; }
  setSize(w: number, h: number) { this.size.set(w, h); this.viewport.set(0, 0, w, h); }
  dispose() { this.disposed++; }
  render() { this.draws.push(this.target); }
  compile() {}
  compileAsync() { this.compileTargets.push(this.target); return Promise.resolve(); }
  initTexture() {}
  snapshot() {
    return [this.target, this.viewport.toArray(), this.scissor.toArray(), this.size.toArray(), this.ratio,
      this.scissorTest, this.color.getHex(), this.alpha, this.autoClear, this.autoClearColor, this.autoClearDepth,
      this.autoClearStencil, { ...this.shadowMap }, this.toneMapping, this.toneMappingExposure, this.outputColorSpace];
  }
}
function fixture() {
  const c = new Canvas(), g = new Probe(); let creates = 0;
  const service = new RenderService({ canvas: () => c as unknown as HTMLCanvasElement, renderer: () => { creates++; return g.gl; } });
  const host = { append(canvas: Canvas) { canvas.parent = this; } } as unknown as HTMLElement;
  return { c, g, service, host, creates: () => creates };
}
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let count = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  await fn(); count++; console.log(`PASS ${name}`);
}

await test('Plaza → game → Plaza creates exactly one renderer and retains uploads', async () => {
  const f = fixture(), uploads = f.service.uploads;
  for (const name of ['plaza', 'game', 'plaza']) {
    const lease = await f.service.acquire(name);
    assert.equal(lease.renderer, f.g.gl); assert.equal(lease.uploads, uploads);
    lease.attach(f.host); assert.equal(f.c.parent, f.host); assert.equal(f.c.style.visibility, '');
    lease.release(); assert.equal(f.c.parent, null);
  }
  assert.equal(f.creates(), 1); assert.equal(f.g.disposed, 0);
  f.service.dispose(); f.service.dispose(); assert.equal(f.g.disposed, 1);
});
await test('FIFO exclusivity and stale lease cannot resize/release next owner', async () => {
  const f = fixture(), a = await f.service.acquire('plaza');
  let resolved = false; const bPromise = f.service.acquire('game').then(b => { resolved = true; return b; });
  const cPromise = f.service.acquire('plaza');
  await flush(); assert.equal(resolved, false); assert.equal(f.service.tryAcquire('intruder'), null);
  a.release(); const b = await bPromise;
  assert.throws(() => a.resize(1, 1), /expired/); a.release(); assert.equal(f.service.current, b);
  b.release(); const c = await cPromise; c.release(); f.service.dispose();
});
await test('all shared GL state and previous render-target state restored', async () => {
  const f = fixture(), target = new THREE.WebGLRenderTarget(20, 10);
  f.g.target = target; target.viewport.set(1, 2, 3, 4); target.scissor.set(5, 6, 7, 8); target.scissorTest = true;
  const before = f.g.snapshot(), lease = await f.service.acquire('game');
  lease.resize(1920, 1080, 1); f.g.viewport.set(0, 0, 5, 6); f.g.scissor.set(7, 8, 9, 10);
  target.viewport.set(0, 0, 0, 0); target.scissor.set(0, 0, 0, 0); target.scissorTest = false;
  f.g.shadowMap.type = THREE.BasicShadowMap; f.g.toneMappingExposure = 4;
  lease.release(); assert.deepEqual(f.g.snapshot(), before);
  assert.deepEqual(target.viewport.toArray(), [1, 2, 3, 4]); assert.deepEqual(target.scissor.toArray(), [5, 6, 7, 8]); assert.equal(target.scissorTest, true);
  target.dispose(); f.service.dispose();
});
await test('scene cache trim cannot destroy shared renderer or other scene cache', () => {
  const f = fixture(); let disposed = 0;
  f.service.keep('plaza').set('post', { dispose() { disposed++; } }); f.service.keep('game').set('other', 1);
  f.service.trim('plaza'); assert.equal(disposed, 1); assert.equal(f.service.keep('game').size, 1); assert.equal(f.g.disposed, 0);
  f.service.dispose();
});
await test('context loss rejects queued lease and invalidates generation/upload record', async () => {
  const f = fixture(), a = await f.service.acquire('plaza'), uploads = f.service.uploads;
  let lost = 0; a.onLost(() => lost++);
  const rejected = assert.rejects(f.service.acquire('game'), /context lost/);
  const event = new Event('webglcontextlost', { cancelable: true }); f.c.dispatchEvent(event); await rejected;
  assert.equal(event.defaultPrevented, true); assert.equal(lost, 1); assert.equal(a.valid, false);
  assert.notEqual(f.service.uploads, uploads); assert.equal(f.service.generation, 2);
  await assert.rejects(f.service.acquire('game'), /unavailable/);
  a.release(); f.c.dispatchEvent(new Event('webglcontextrestored'));
  const b = await f.service.acquire('game'); assert.equal(b.renderer, f.g.gl); assert.equal(b.generation, 2); b.release(); f.service.dispose();
});
await test('service shutdown requires borrower cleanup and rejects queued acquisition', async () => {
  const f = fixture(), a = await f.service.acquire('game');
  assert.throws(() => f.service.dispose(), /Release/); a.release(); f.service.dispose();
  await assert.rejects(f.service.acquire('game'), /unavailable/);
});
await test('game wrapper borrows, keeps aspect/DPR, stops drawing after release', async () => {
  const f = fixture(); Object.defineProperty(globalThis, 'window', { value: { devicePixelRatio: 3 }, configurable: true });
  const renderer = new Renderer(f.service.canvas, f.service);
  renderer.render(new THREE.Scene(), new THREE.Camera()); assert.equal(f.g.draws.length, 0);
  const lease = await renderer.activate(f.host); assert.equal(renderer.gl, f.g.gl);
  assert.deepEqual(f.g.size.toArray(), [960, 540]); assert.equal(f.g.ratio, 2);
  renderer.render(new THREE.Scene(), new THREE.Camera()); assert.equal(f.g.draws.length, 1);
  renderer.release(lease); renderer.render(new THREE.Scene(), new THREE.Camera()); assert.equal(f.g.draws.length, 1);
  renderer.dispose(); assert.equal(f.g.disposed, 0); f.service.dispose(); Reflect.deleteProperty(globalThis, 'window');
});
function plazaFixture() {
  const f = fixture(), ready = deferred<PlazaWorld>(), settled = deferred(); let stopped = 0, gpu: StageGpu | undefined;
  const world = { stage: { dispose() { stopped++; } }, settle: () => settled.promise } as unknown as PlazaWorld;
  const plaza = new PlazaGl({ service: f.service, createCanvas: () => { throw new Error('extra canvas'); }, createRenderer: () => { throw new Error('extra renderer'); },
    startWorld(o) { gpu = o.gpu; return { world: ready.promise, promote() {} }; }, gpuBudget: () => 1e9 });
  return { ...f, plaza, ready, settled, world, gpu: () => gpu!, stopped: () => stopped };
}
await test('game handoff drains prewarm/world background work before releasing GL', async () => {
  const f = plazaFixture(); assert.equal(f.plaza.prewarm(new URLSearchParams()), true);
  const drained = f.plaza.yieldPreparation(); let gameReady = false;
  const game = f.service.acquire('game').then(lease => { gameReady = true; return lease; });
  await flush(); assert.equal(gameReady, false); f.ready.resolve(f.world); await flush(); assert.equal(gameReady, false);
  f.settled.resolve(); await drained; const lease = await game;
  assert.equal(f.stopped(), 1); assert.equal(f.gpu().valid!(), false); assert.equal(f.plaza.prewarm(new URLSearchParams()), false);
  lease.release(); await f.plaza.reserve(); assert.equal(f.gpu().valid!(), false);
  f.plaza.leave(null, () => undefined); f.service.dispose();
});
await test('Plaza leave holds GL until background loading settles', async () => {
  const f = plazaFixture(); await f.plaza.reserve(); f.plaza.enter(f.host, new URLSearchParams()); f.ready.resolve(f.world);
  let cleanup = 0; f.plaza.leave(null, () => cleanup++, f.settled.promise);
  const game = f.service.acquire('game'); await flush(); assert.equal(cleanup, 0); assert.equal(f.service.current?.owner, 'plaza');
  f.settled.resolve(); const lease = await game; assert.equal(cleanup, 1); assert.equal(f.g.disposed, 0);
  lease.release(); f.service.dispose();
});
await test('context loss during Plaza prewarm drains and allows later reacquisition', async () => {
  const f = plazaFixture(); f.plaza.prewarm(new URLSearchParams());
  f.c.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(f.gpu().valid!(), false); f.ready.resolve(f.world); f.settled.resolve(); await f.plaza.yieldPreparation();
  assert.equal(f.service.current, null); f.c.dispatchEvent(new Event('webglcontextrestored'));
  await f.plaza.reserve(); f.plaza.leave(null, () => undefined); f.service.dispose();
});
await test('shared GPU preparation draws only scratch RT and restores hidden/layer/target state', async () => {
  const f = fixture(), lease = await f.service.acquire('game'), scheduler = new FrameScheduler({ now: () => 0 }, 100);
  const scene = new THREE.Scene(), camera = new THREE.Camera(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.visible = false; scene.add(mesh);
  const prep = new ScenePreparer({ renderer: lease.renderer, scene, camera: () => camera, scheduler, linear: () => false, offscreen: true, valid: () => lease.valid });
  const job = prep.prepare(mesh, P0);
  for (let i = 0; i < 20 && !job.done; i++) { scheduler.frame(); await flush(); }
  await job.promise; assert.equal(prep.stats.errors, 0); assert.ok(f.g.draws.length > 0); assert.ok(f.g.draws.every(Boolean));
  assert.deepEqual(f.g.compileTargets, [null]); assert.equal(mesh.visible, false); assert.equal(camera.layers.mask, 1); assert.equal(f.g.target, null);
  prep.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); lease.release(); f.service.dispose();
});
await test('invalid generation cannot draw or mark preparation ready', async () => {
  const f = fixture(), lease = await f.service.acquire('game'), scheduler = new FrameScheduler({ now: () => 0 }, 100);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), scene = new THREE.Scene(); scene.add(mesh);
  const prep = new ScenePreparer({ renderer: lease.renderer, scene, camera: () => new THREE.Camera(), scheduler, linear: () => true, offscreen: true, valid: () => lease.valid });
  const job = prep.prepare(mesh, P0); lease.release(); scheduler.frame(); await job.promise;
  assert.equal(f.g.draws.length, 0); assert.equal(prep.isPrepared(mesh), false); assert.equal(prep.pending, 0);
  prep.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); f.service.dispose();
});
await test('shared IBL survives scene exit and disposes PMREM/RT/cube on cache trim', async () => {
  const f = fixture(), share = createIblShare(f.g.gl); let targets = 0, cubes = 0, pmrem = 0;
  share.pmrem.dispose = () => { pmrem++; };
  share.pmrem.fromCubemap = () => { const t = new THREE.WebGLRenderTarget(); t.addEventListener('dispose', () => targets++); return t; };
  f.service.keep('plaza').set('ibl', share);
  const index = { rad: { cube: true, srgb: false, files: ['px', 'nx', 'py', 'ny', 'pz', 'nz'] } };
  const m = new MaterialSetup({ url: x => x }, f.g.gl, index, share, { hdrCube: async () => {
    const cube = new THREE.CubeTexture(); cube.addEventListener('dispose', () => cubes++); return cube;
  } });
  await m.loadIbl(['rad', 'rad'], null); m.dispose(true);
  assert.deepEqual([targets, cubes, pmrem], [0, 1, 0]);
  f.service.trim('plaza'); assert.deepEqual([targets, cubes, pmrem], [1, 2, 1]);
  f.service.trim('plaza'); assert.deepEqual([targets, cubes, pmrem], [1, 2, 1]); f.service.dispose();
});
await test('restoration waits for old lease cleanup before discarding late cache writes', async () => {
  const f = fixture(), lease = await f.service.acquire('plaza'); let disposed = 0;
  f.c.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  f.c.dispatchEvent(new Event('webglcontextrestored'));
  f.service.keep('plaza').set('late', { dispose() { disposed++; } });
  const next = f.service.acquire('game'); await flush(); assert.equal(f.service.current, lease);
  lease.release(); const game = await next; assert.equal(disposed, 1); assert.equal(f.service.keep('plaza').size, 0);
  game.release(); f.service.dispose();
});
await test('render service import boundary and product shared-renderer injection', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  for (const file of ['state', 'service']) {
    const imports = [...read(`script/app/common/render/${file}.ts`).matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const spec of imports) assert.ok(['three', '@game/lib/assetcore-three', './state'].includes(spec), spec);
  }
  assert.match(read('script/app/flow/host.ts'), /new Renderer\(glCanvas, renderService\)/);
  assert.match(read('script/view/plazaGl.ts'), /service: appRenderService\(\)/);
  assert.match(read('script/view/assetMode.ts'), /setAssetSupportRenderer\(\(\) => appRenderService\(\).renderer\)/);
});
console.log(`통과 ${count}/${count}`);
