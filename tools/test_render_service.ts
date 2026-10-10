import assert from 'node:assert/strict';
import { GamePreparation } from '@app/flow/preparation';
import { Mg1801View } from '@app/minigame/mg1801/view';
import type { GameDef, GameSetup, GameView } from '../script/game';
import type { Assets } from '../script/view/assets';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createIblShare, MaterialSetup } from '@app/common/render3d/material';
import { MenuSurface } from '@app/common/render/menu';
import { HudComposite } from '@app/common/render/hud';
import { RendererState } from '@app/common/render/state';
import { MgmView } from '@app/common/ui/view';
import { RenderService } from '@app/common/render/service';
import { Renderer } from '../script/view/renderer';
import { PlazaGl, worldStarter } from '../script/view/plazaGl';
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
  outputColorSpace: string = THREE.LinearSRGBColorSpace;
  disposed = 0;
  resizes = 0;
  clears: (THREE.WebGLRenderTarget | null)[] = [];
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
  setSize(w: number, h: number) { this.resizes++; this.size.set(w, h); this.viewport.set(0, 0, w, h); }
  dispose() { this.disposed++; }
  render() { this.draws.push(this.target); }
  clear() { this.clears.push(this.target); }
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
  const service = new RenderService({ tick: () => undefined, canvas: () => c as unknown as HTMLCanvasElement, renderer: () => { creates++; return g.gl; } });
  const host = { prepend(canvas: Canvas) { canvas.parent = this; } } as unknown as HTMLElement;
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
await test('game handoff cancels scoped prewarm and drains resources without owning display GL', async () => {
  const f = plazaFixture(); assert.equal(f.plaza.prewarm(new URLSearchParams()), true);
  const drained = f.plaza.yieldPreparation(); let gameReady = false;
  const game = f.service.acquire('game').then(lease => { gameReady = true; return lease; });
  await flush(); assert.equal(gameReady, true); assert.equal(f.stopped(), 0); f.ready.resolve(f.world); await flush(); assert.equal(f.stopped(), 0);
  f.settled.resolve(); await drained; const lease = await game;
  assert.equal(f.stopped(), 1); assert.equal(f.gpu().valid!(), false); assert.equal(f.plaza.prewarming, false);
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
  for (const file of ['state', 'service', 'menu', 'hud', 'prepare']) {
    const imports = [...read(`script/app/common/render/${file}.ts`).matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const spec of imports) assert.ok(['three', '@game/lib/assetcore-three', './state', './service', './prepare', '@game/lib/assetcore'].includes(spec), spec);
  }
  assert.match(read('script/app/flow/host.ts'), /new Renderer\(glCanvas, renderService\)/);
  assert.match(read('script/view/plazaGl.ts'), /service: appRenderService\(\)/);
  assert.match(read('script/view/assetMode.ts'), /setAssetSupportRenderer\(\(\) => appRenderService\(\).renderer\)/);
});

await test('menu parent → child → game → parent shares one renderer and restores menu dimensions', async () => {
  const f = fixture(), parent = new MenuSurface(f.host, 1920, 1080, f.service);
  await parent.resume(); assert.equal(parent.active, true); assert.equal(f.g.autoClear, false);
  parent.suspend();
  const child = new MenuSurface(f.host, 1920, 1080, f.service);
  await child.resume(); assert.equal(parent.active, false); child.dispose();
  await parent.resume(); parent.suspend();
  const game = await f.service.acquire('game'); game.resize(960, 540, 2); game.release();
  await parent.resume(); assert.deepEqual(f.g.size.toArray(), [1920, 1080]); assert.equal(f.g.ratio, 1);
  assert.equal(f.g.outputColorSpace, THREE.SRGBColorSpace); assert.equal(f.creates(), 1);
  parent.dispose(); parent.dispose(); assert.equal(f.g.disposed, 0); f.service.dispose();
});
await test('queued menu disposed before grant cannot steal canvas or retain lease', async () => {
  const f = fixture(), game = await f.service.acquire('game'), menu = new MenuSurface(f.host, 1920, 1080, f.service);
  const pending = menu.resume(); menu.dispose();
  const next = f.service.acquire('next'); game.release(); await pending;
  const lease = await next; lease.attach(f.host); menu.dispose();
  assert.equal(f.service.current, lease); assert.equal(f.c.parent, f.host); assert.equal(menu.active, false);
  lease.release(); f.service.dispose();
});
await test('suspend cancels old queued resume while a later resume waits normally', async () => {
  const f = fixture(), game = await f.service.acquire('game'), menu = new MenuSurface(f.host, 1920, 1080, f.service);
  const old = menu.resume(); menu.suspend(); const fresh = menu.resume();
  assert.equal(menu.resume(), fresh); game.release(); await old; await fresh;
  assert.equal(menu.active, true); assert.equal(f.c.parent, f.host); menu.dispose(); f.service.dispose();
});
await test('menu context loss releases old generation and resumes only after restore', async () => {
  const f = fixture(), menu = new MenuSurface(f.host, 1920, 1080, f.service);
  await menu.resume(); const first = f.service.current;
  f.c.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(menu.active, false); assert.equal(f.service.current, null);
  f.c.dispatchEvent(new Event('webglcontextrestored')); await flush();
  assert.equal(menu.active, true); assert.notEqual(f.service.current, first);
  assert.equal(f.service.current!.generation, 2); menu.dispose(); f.service.dispose();
});
await test('suspended/disposed menu does not revive on another owner context restore', async () => {
  const f = fixture(), menu = new MenuSurface(f.host, 1920, 1080, f.service);
  await menu.resume(); menu.suspend();
  const game = await f.service.acquire('game');
  f.c.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); game.release();
  f.c.dispatchEvent(new Event('webglcontextrestored')); await flush();
  assert.equal(f.service.current, null); menu.dispose(); await menu.resume(); assert.equal(f.service.current, null); f.service.dispose();
});
await test('suspended MgmView cannot clear or draw the child/game output', async () => {
  const f = fixture(), menu = new MenuSurface(f.host, 1920, 1080, f.service);
  let begun = 0, drawn = 0, freed = 0;
  const backend = { begin() { begun++; }, render() { drawn++; }, dispose() { freed++; } };
  const view = Reflect.construct(MgmView, [{}, menu, backend, () => '']) as MgmView;
  await menu.resume(); view.begin(); view.end(); assert.equal(begun, 1); assert.equal(drawn, 1);
  menu.suspend(); const child = await f.service.acquire('child'); const clears = f.g.clears.length;
  view.begin(); view.end(); view.draw({ visible: true } as never);
  assert.equal(f.g.clears.length, clears); assert.equal(begun, 1); assert.equal(drawn, 1);
  view.dispose(); assert.equal(f.service.current, child); assert.equal(freed, 1); child.release(); f.service.dispose();
});
await test('state scope leaves framebuffer intact when dimensions and DPR are unchanged', () => {
  const f = fixture(), state = new RendererState(f.g.gl), before = f.g.snapshot();
  f.g.viewport.set(0, 0, 20, 10); f.g.outputColorSpace = THREE.SRGBColorSpace;
  state.restore(); assert.equal(f.g.resizes, 0); assert.deepEqual(f.g.snapshot(), before); f.service.dispose();
});
function hudContext(events: string[]): CanvasRenderingContext2D {
  return { canvas: { width: 1920, height: 1080 }, save() { events.push('save'); }, restore() { events.push('restore'); },
    setTransform(...v: number[]) { assert.deepEqual(v, [1, 0, 0, 1, 0, 0]); },
    clearRect(...v: number[]) { assert.deepEqual(v, [0, 0, 1920, 1080]); events.push('clear-hud'); },
  } as unknown as CanvasRenderingContext2D;
}
await test('HUD draws transparent MSAA UI RT then pending 2D then Lyt without clearing game framebuffer', () => {
  const f = fixture(), hud = new HudComposite(), events: string[] = [], ctx = hudContext(events), before = f.g.snapshot();
  let uiTarget: THREE.WebGLRenderTarget | null = null;
  f.g.gl.render = (scene) => {
    const m = (scene.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    assert.equal(f.g.target, null); assert.equal(f.g.autoClear, false);
    assert.deepEqual(f.g.viewport.toArray(), [0, 0, 800, 600]); assert.equal(f.g.scissorTest, false);
    assert.equal(m.blendSrc, THREE.OneFactor); assert.equal(m.blendDst, THREE.OneMinusSrcAlphaFactor);
    assert.equal(m.depthTest, false); assert.equal(m.toneMapped, false);
    if (m.uniforms.source.value.isCanvasTexture) {
      assert.equal(m.uniforms.source.value.premultiplyAlpha, true);
      assert.equal(m.uniforms.source.value.image, ctx.canvas); events.push('pending-2d');
    } else { assert.equal(m.uniforms.source.value, uiTarget!.texture); events.push('lyt-over'); }
  };
  hud.render(f.g.gl, ctx, () => {
    uiTarget = f.g.target; assert.ok(uiTarget); assert.equal(uiTarget.samples, 4);
    assert.equal(uiTarget.width, 1920); assert.equal(uiTarget.height, 1080);
    assert.equal(uiTarget.texture.type, THREE.UnsignedByteType); assert.equal(f.g.alpha, 0);
    assert.equal(f.g.outputColorSpace, THREE.LinearSRGBColorSpace); events.push('ui-rt');
  });
  assert.deepEqual(events, ['ui-rt', 'pending-2d', 'save', 'clear-hud', 'restore', 'lyt-over']);
  assert.deepEqual(f.g.clears, [uiTarget]); assert.equal(f.g.resizes, 0); assert.deepEqual(f.g.snapshot(), before);
  hud.dispose(); f.service.dispose();
});
await test('HUD restores GL state on backend failure and does not consume the pending 2D canvas', () => {
  const f = fixture(), hud = new HudComposite(), events: string[] = [], before = f.g.snapshot();
  assert.throws(() => hud.render(f.g.gl, hudContext(events), () => { throw new Error('draw failed'); }), /draw failed/);
  assert.deepEqual(f.g.snapshot(), before); assert.deepEqual(events, []); assert.equal(f.g.resizes, 0);
  hud.dispose(); f.service.dispose();
});
await test('HUD owns only its RT/material/geometry/canvas texture and disposal is idempotent', () => {
  const f = fixture(), hud = new HudComposite(), events: string[] = []; let disposed = 0;
  const resources = new Set<THREE.EventDispatcher>();
  f.g.gl.render = scene => {
    const mesh = scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    resources.add(mesh.geometry); resources.add(mesh.material); resources.add(mesh.material.uniforms.source.value);
  };
  hud.render(f.g.gl, hudContext(events), () => { resources.add(f.g.target!); });
  for (const resource of resources) (resource as THREE.Texture).addEventListener('dispose', () => disposed++);
  hud.dispose(); const once = disposed; hud.dispose(); assert.equal(disposed, once); assert.ok(once >= 4);
  assert.equal(f.g.disposed, 0); hud.render(f.g.gl, hudContext(events), () => assert.fail('closed')); f.service.dispose();
});
await test('all menu and Lyt entry points borrow GL and product flow resumes before opening wipe', () => {
  const read = (path: string) => readFileSync(new URL(`../script/${path}`, import.meta.url), 'utf8');
  for (const file of ['app/common/ui/view.ts', 'app/scene/menu/charselect/screen.ts', 'app/scene/menu/modeselect/screen.ts', 'app/common/ui/layout/render.ts']) {
    assert.doesNotMatch(read(file), /new THREE.WebGLRenderer|gl\.dispose\(/, file);
  }
  for (const file of ['charselect_page', 'modeselect_page', 'setplayer_page', 'mgmet_page', 'mgm01_page']) {
    assert.match(read(file + '.ts'), /await menuCanvas\(\)/); assert.doesNotMatch(read(file + '.ts'), /canvas\.remove\(\)/);
  }
  assert.match(read('mgm01_page.ts'), /await env.view.surface.resume\(\);\s+if \(!stopped\) sceneIn\(\)/);
  assert.match(read('setplayer_page.ts'), /handle.view.surface.suspend\(\)/);
  assert.doesNotMatch(read('setplayer_page.ts'), /canvas.style.visibility/);
  assert.doesNotMatch(read('app/common/render/hud.ts'), /readPixels|readRenderTargetPixels|drawImage/);
});
await test('menu setup failure returns the lease so another scene can enter', async () => {
  const f = fixture(), menu = new MenuSurface({ prepend() { throw new Error('mount failed'); } } as unknown as HTMLElement, 1920, 1080, f.service);
  await assert.rejects(menu.resume(), /mount failed/); assert.equal(f.service.current, null);
  menu.dispose(); const game = await f.service.acquire('game'); game.release(); f.service.dispose();
});
await test('menu cleanup waits for preview compilation and stops drawing while the next owner waits', async () => {
  const f = fixture(), menu = new MenuSurface(f.host, 1920, 1080, f.service), compiling = deferred();
  await menu.resume(); let cleaned = false;
  const closing = menu.disposeAfter(compiling.promise, () => { cleaned = true; });
  assert.equal(menu.active, false); assert.equal(cleaned, false);
  let entered = false;
  const next = f.service.acquire('game').then(lease => { entered = true; return lease; });
  await flush(); assert.equal(entered, false); menu.dispose();
  compiling.resolve(); await closing; const game = await next; assert.equal(cleaned, true);
  assert.equal(f.service.current, game); game.release(); f.service.dispose();
});
await test('closing menu cannot revive on context restore while preview cleanup is pending', async () => {
  const f = fixture(), menu = new MenuSurface(f.host, 1920, 1080, f.service), compiling = deferred();
  await menu.resume(); const closing = menu.disposeAfter(compiling.promise, () => undefined);
  f.c.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  f.c.dispatchEvent(new Event('webglcontextrestored')); await flush();
  assert.equal(f.service.current, null); const game = await f.service.acquire('game'); game.attach(f.host);
  compiling.resolve(); await closing; assert.equal(f.service.current, game); assert.equal(f.c.parent, f.host);
  game.release(); f.service.dispose();
});
await test('menu displays before GPU units and retains lease, canvas and every renderer state', async () => {
  const f = fixture(), menu = new MenuSurface(f.host, 1920, 1080, f.service); await menu.resume();
  const scope = f.service.prepareQueue.create(), calls: string[] = [], saved = f.g.snapshot();
  const work = scope.run(() => { calls.push('prepare'); assert.ok(f.g.target); f.g.toneMappingExposure = 9; f.g.shadowMap.enabled = true; });
  menu.frame(() => { calls.push('draw'); assert.equal(f.g.target, null); });
  await work; assert.deepEqual(calls, ['draw', 'prepare']); assert.deepEqual(f.g.snapshot(), saved);
  assert.equal(f.service.current?.owner, 'menu'); assert.equal(f.c.parent, f.host); assert.equal(f.creates(), 1);
  scope.cancel(); menu.dispose(); f.service.dispose();
});
await test('cancel queued GPU unit never runs and rejects completion', async () => {
  const f = fixture(), scope = f.service.prepareQueue.create(); let ran = false;
  const job = scope.run(() => { ran = true; }); const rejected = assert.rejects(job, /cancelled/);
  scope.cancel(); f.service.prepareQueue.drain(); await rejected; assert.equal(ran, false); assert.equal(f.service.prepareQueue.scheduler.pending, 0); f.service.dispose();
});
await test('GPU unit exception restores state and invalidates its scope', async () => {
  const f = fixture(), scope = f.service.prepareQueue.create(), saved = f.g.snapshot();
  const job = scope.run(() => { f.g.alpha = 0; throw new Error('gpu failed'); }); const rejected = assert.rejects(job, /gpu failed/);
  f.service.prepareQueue.drain(); await rejected; assert.deepEqual(f.g.snapshot(), saved); assert.equal(scope.valid(), false); f.service.dispose();
});
await test('context loss rejects GPU preparation and recovery uses new uploads and generation', async () => {
  const f = fixture(), scope = f.service.prepareQueue.create(); void f.service.renderer;
  const job = scope.run(() => undefined), rejected = assert.rejects(job, /context lost/);
  f.c.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); await rejected;
  f.c.dispatchEvent(new Event('webglcontextrestored')); const next = f.service.prepareQueue.create();
  assert.notEqual(next.generation, scope.generation); assert.notEqual(next.uploads, scope.uploads); next.cancel(); f.service.dispose();
});
await test('prepare budget stops between expensive units and drawing can consume the frame', async () => {
  const c = new Canvas(), gl = new Probe(); let now = 0, units = 0;
  const service = new RenderService({ canvas: () => c as unknown as HTMLCanvasElement, renderer: () => gl.gl, now: () => now, tick: () => undefined, budgetMs: 4 });
  const scope = service.prepareQueue.create();
  const jobs = [1, 2, 3].map(() => scope.run(() => { units++; now += 5; }));
  service.activeFrame(() => { now += 17; }); assert.equal(units, 0);
  service.prepareQueue.drain(); assert.equal(units, 1); service.prepareQueue.drain(); service.prepareQueue.drain(); await Promise.all(jobs);
  assert.equal(service.prepareQueue.scheduler.stats.overBudget, 3); scope.cancel(); service.dispose();
});
function selectionFixture() {
  const f = fixture(); let built = 0, disposed = 0, activated = 0, cancelled = 0;
  const setup: GameSetup = { players: [{ char: 'pc01', isCom: false, comLevel: 0 }], seed: 0, practice: false };
  const def = { id: 'probe', preparationKey: (s: GameSetup) => s.players[0].char } as GameDef;
  const prep = new GamePreparation(f.service.prepareQueue, (_d, s) => {
    built++;
    const view = { prepare: async (_p, gpu) => { await gpu.run(() => undefined); }, activate: async () => { activated++; }, dispose: () => { disposed++; } } as GameView;
    const assets = { cancel: () => { cancelled++; }, dispose: () => undefined, setPriority: () => undefined } as unknown as Assets;
    return { view, assets, context: { renderer: {} as Renderer, hud: {} as CanvasRenderingContext2D, audio: null, setup: s, pads: [] } };
  });
  return { ...f, prep, setup, def, counts: () => ({ built, disposed, activated, cancelled }) };
}
await test('selected view prepares once without activation then transfers with actual setup', async () => {
  const f = selectionFixture(), one = f.prep.select(f.def, f.setup), two = f.prep.select(f.def, { ...f.setup, seed: 123 });
  assert.equal(one, two); await flush(); f.service.prepareQueue.drain(); await one; assert.equal(f.prep.state, 'ready');
  assert.deepEqual(f.counts(), { built: 1, disposed: 0, activated: 0, cancelled: 0 });
  const result = await f.prep.take(f.def, { ...f.setup, seed: 321 }); assert.ok(result); assert.equal(result.context.setup.seed, 321);
  assert.equal(f.counts().activated, 0); await result.view.activate!(); assert.equal(f.counts().activated, 1); assert.equal(f.prep.state, 'idle');
  result.view.dispose(); f.service.dispose();
});
await test('selection change cancels old GPU work, disposes it and prepares the next selection', async () => {
  const f = selectionFixture(), old = f.prep.select(f.def, f.setup); await flush(); const rejected = assert.rejects(old, /cancelled/);
  const next = f.prep.select(f.def, { ...f.setup, players: [{ char: 'pc02', isCom: false, comLevel: 0 }] });
  await flush(); f.service.prepareQueue.drain(); await next; await rejected; await flush();
  assert.equal(f.counts().built, 2); assert.equal(f.counts().disposed, 1); assert.equal(f.counts().activated, 0);
  f.prep.cancel(); await flush(); assert.equal(f.counts().disposed, 2); f.service.dispose();
});
await test('cancel during code download prevents view construction after late completion', async () => {
  const f = selectionFixture(), downloading = deferred(); f.def.load = () => downloading.promise;
  const ready = f.prep.select(f.def, f.setup); const rejected = assert.rejects(ready, /cancelled/); f.prep.cancel(); downloading.resolve(); await rejected;
  assert.equal(f.counts().built, 0); assert.equal(f.prep.state, 'idle'); f.service.dispose();
});
await test('failed preparation can retry with fresh scope and cannot become ready', async () => {
  const f = selectionFixture(); let tries = 0; f.def.load = async () => { if (++tries === 1) throw new Error('network'); };
  await assert.rejects(f.prep.select(f.def, f.setup), /network/); assert.notEqual(f.prep.state, 'ready');
  const retry = f.prep.select(f.def, f.setup); await flush(); f.service.prepareQueue.drain(); await retry; assert.equal(f.prep.state, 'ready');
  f.prep.cancel(); await flush(); f.service.dispose();
});
await test('cancel during async compile waits for completion before destroying the view', async () => {
  const f = selectionFixture(), compilation = deferred();
  const prep = new GamePreparation(f.service.prepareQueue, () => ({
    view: { prepare: async (_p, gpu) => { await gpu.run(() => compilation.promise); }, activate: async () => undefined, dispose: () => { destroyed++; } } as GameView,
    assets: { cancel: () => undefined, dispose: () => undefined } as unknown as Assets,
    context: { renderer: {} as Renderer, hud: {} as CanvasRenderingContext2D, audio: null, setup: f.setup, pads: [] },
  }));
  let destroyed = 0; const ready = prep.select(f.def, f.setup); await flush(); f.service.prepareQueue.drain(); await flush();
  prep.cancel(); await flush(); assert.equal(destroyed, 0); const rejected = assert.rejects(ready);
  compilation.resolve(); await rejected; await flush(); assert.equal(destroyed, 1); f.service.dispose();
});
await test('Plaza prewarm starts while the character menu owns GL and adopts the same world', async () => {
  const f = plazaFixture(), menu = new MenuSurface(f.host, 1920, 1080, f.service);
  await menu.resume(); const before = f.g.snapshot(), parent = f.c.parent;
  assert.equal(f.plaza.prewarm(new URLSearchParams()), true);
  assert.equal(f.service.current?.owner, 'menu'); assert.ok(f.gpu().preparation?.valid());
  let prepared = false;
  const gpu = f.gpu();
  const task = gpu.preparation!.run(() => { assert.ok(f.g.target); f.g.toneMapping = THREE.NoToneMapping; f.g.render(); prepared = true; });
  await f.plaza.yieldForMenu(); menu.frame(() => undefined); await task;
  assert.equal(prepared, true); assert.deepEqual(f.g.snapshot(), before); assert.equal(f.c.parent, parent);
  f.ready.resolve(f.world); f.settled.resolve(); menu.dispose(); await f.plaza.reserve();
  const entry = f.plaza.enter(f.host, new URLSearchParams()); assert.equal(entry.prewarmed, true);
  assert.equal(await entry.world, f.world); assert.equal(f.plaza.stats.adopted, 1); assert.equal(f.plaza.stats.fresh, 0);
  f.plaza.leave(null, () => f.world.stage.dispose()); assert.equal(gpu.valid!(), false); f.service.dispose();
});
await test('Plaza cancellation during a menu removes queued GPU work and waits for async compilation', async () => {
  const f = plazaFixture(), menu = new MenuSurface(f.host, 1920, 1080, f.service); await menu.resume();
  f.plaza.prewarm(new URLSearchParams()); let executed = 0;
  const queued = f.gpu().preparation!.run(() => executed++), rejected = assert.rejects(queued);
  f.ready.resolve(f.world); const drained = f.plaza.yieldPreparation(); menu.frame(() => undefined);
  await rejected; await flush(); assert.equal(executed, 0); assert.equal(f.stopped(), 0);
  f.settled.resolve(); await drained; assert.equal(f.stopped(), 1); assert.equal(f.service.current?.owner, 'menu');
  menu.dispose(); f.service.dispose();
});
await test('Plaza world creation failure restores the shared CPU scheduler budget', async () => {
  const scheduler = { budgetMs: 4 };
  const starter = worldStarter({ tick: fn => fn(), assetsRoot: '', gltfTextures: false, modules: async () => ({
    manager: { scheduler } as never, LOAD_BUDGET_MS: 50, PriorityFloor: class { lower() {} } as never, parseDecoParam: () => ({ display: [], unlockBd: 0 }),
    createPlazaWorld: async () => { scheduler.budgetMs = 2; throw new Error('world fixture failure'); },
  }) });
  const f = fixture(), gpu = { renderer: f.g.gl, uploads: new WeakMap(), keep: new Map() };
  await assert.rejects(starter({ gpu, params: new URLSearchParams(), prewarm: true }).world, /world fixture failure/);
  assert.equal(scheduler.budgetMs, 4); f.service.dispose();
});
await test('scene abort cancels a pending preparation handoff without activation', async () => {
  const f = selectionFixture(), abort = new AbortController();
  const take = f.prep.take(f.def, f.setup, abort.signal); const rejected = assert.rejects(take, /cancelled/);
  await flush(); abort.abort(new Error('scene cancelled')); await rejected; await flush();
  assert.deepEqual(f.counts(), { built: 1, disposed: 1, activated: 0, cancelled: 1 });
  assert.equal(f.prep.state, 'idle'); f.service.dispose();
});
await test('aborting an old handoff cannot cancel a newer selection', async () => {
  const f = selectionFixture(), abort = new AbortController();
  const old = f.prep.take(f.def, f.setup, abort.signal); const rejected = assert.rejects(old, /cancelled/);
  await flush(); const next = f.prep.select(f.def, { ...f.setup, players: [{ char: 'pc02', isCom: false, comLevel: 0 }] });
  abort.abort(); await flush(); f.service.prepareQueue.drain(); await next; await rejected;
  assert.equal(f.prep.state, 'ready'); assert.deepEqual(f.counts(), { built: 2, disposed: 1, activated: 0, cancelled: 1 });
  f.prep.cancel(); await flush(); f.service.dispose();
});
await test('already aborted activation does not consume a valid prepared selection', async () => {
  const f = selectionFixture(), ready = f.prep.select(f.def, f.setup); await flush(); f.service.prepareQueue.drain(); await ready;
  const abort = new AbortController(); abort.abort(new Error('scene cancelled'));
  await assert.rejects(f.prep.take(f.def, f.setup, abort.signal), /scene cancelled/);
  assert.equal(f.prep.state, 'ready'); assert.equal(f.counts().disposed, 0);
  const prepared = await f.prep.take(f.def, f.setup); assert.ok(prepared); prepared.view.dispose(); f.service.dispose();
});
await test('cancelled mg1801 activation cannot change renderer state after late sound load', async () => {
  const manifest = deferred<{ bpms: number[]; sounds: Record<string, never>; substitute: Record<string, never>; listener3d: { default: { interiorSize: number; maxVolumeDistance: number; unitDistance: number }; preset: never[] } }>();
  let activated = 0, effects = 0;
  const view = {
    assets: { disposed: false, json: () => manifest.promise }, ctx: { audio: null, renderer: {} },
    stage: { activate: () => { activated++; } }, fxLoaded: true,
    fx: { start: () => { effects++; } }, gpu: {},
  };
  const pending = Mg1801View.prototype.activate.call(view as unknown as Mg1801View);
  const rejected = assert.rejects(pending, /Game resources cancelled/);
  await flush(); view.assets.disposed = true;
  manifest.resolve({ bpms: [], sounds: {}, substitute: {}, listener3d: { default: { interiorSize: 10, maxVolumeDistance: 20, unitDistance: 50 }, preset: [] } });
  await rejected; assert.deepEqual([activated, effects], [0, 0]);
});
await test('already cancelled mg1801 activation does not start sound loading', async () => {
  let loads = 0;
  const view = { assets: { disposed: true, json: async () => { loads++; return {}; } }, ctx: { audio: null } };
  await assert.rejects(Mg1801View.prototype.activate.call(view as unknown as Mg1801View), /Game resources cancelled/);
  assert.equal(loads, 0);
});
console.log(`통과 ${count}/${count}`);
