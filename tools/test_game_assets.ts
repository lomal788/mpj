import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { Assets, type AssetRuntime } from '@app/common/assets';
import { hdrTexture, hdrCube } from '@app/common/assets/hdr';
import { createAssetManager, jsonHandler, bytesHandler, P0, P2, P3, type AssetHandler } from '@game/lib/assetcore';
import { gltfHandler, textureHandler } from '@game/lib/assetcore-three';
import { disposeScene } from '../script/view/dispose';
import { CharacterActor, CharacterTemplate, type CharaInfo } from '@app/minigame/mg1801/view/character';

const web = resolve(import.meta.dirname, '..');
let passed = 0, failed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`, error); }
}
function fixture() {
  const counts = new Map<string, number>();
  const value = { nested: { value: 1 } }, buffer = new Uint8Array([1, 2, 3]).buffer;
  const texture = new THREE.Texture({ width: 4, height: 4 } as HTMLImageElement); texture.needsUpdate = true;
  const geometry = new THREE.BoxGeometry();
  const scene = new THREE.Group(); scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture })));
  const gltf = { scene, scenes: [scene], animations: [new THREE.AnimationClip('idle', 1, [])] } as unknown as GLTF;
  const count = (key: string): void => { counts.set(key, (counts.get(key) ?? 0) + 1); };
  let clock = 0;
  const manager = createAssetManager({
    env: { now: () => ++clock, tick: fn => void setImmediate(fn) }, resolve: key => key,
    handlers: [
      { kind: 'gltf', fetch: async (_url, key) => { count(key); return gltf; }, gpuBytes: gltfHandler({ parseAsync: async () => gltf }).gpuBytes, dispose: gltfHandler({ parseAsync: async () => gltf }).dispose },
      { kind: 'json', fetch: async (_url, key) => { count(key); return value; } },
      { kind: 'bytes', fetch: async (_url, key) => { count(key); return buffer; } },
      textureHandler(async url => { count(url); return texture; }),
      { kind: 'uiimage', fetch: async (_url, key) => { count(key); return { width: 4, height: 4 }; } },
    ] as AssetHandler<any, any>[],
  });
  const runtime: AssetRuntime = { manager, root: 'https://test/assets/' };
  return { runtime, manager, counts, value, buffer, gltf, texture, geometry, assets: () => new Assets('mg1801/', runtime) };
}

await test('canonical keys join shell/game/shared assets; outside root rejected', () => {
  const f = fixture(), a = f.assets();
  assert.equal(a.key('chara/../../chara/pc01/body.glb'), 'chara/pc01/body.glb');
  assert.equal(a.url('chara/../../chara/pc01/body.glb'), 'https://test/assets/chara/pc01/body.glb');
  assert.throws(() => a.key('../../outside'), /outside root/); a.dispose();
});

await test('prefetched data reused, per-scope JSON copy and owner release', async () => {
  const f = fixture(); await f.manager.get('mg1801/manifest.json', 'json', P2, 'prefetch');
  const a = f.assets(), b = f.assets();
  const [x, y] = await Promise.all([a.json<typeof f.value>('manifest.json'), b.json<typeof f.value>('manifest.json')]);
  x.nested.value = 9;
  assert.equal(y.nested.value, 1); assert.equal(f.value.nested.value, 1);
  assert.equal(f.counts.get('mg1801/manifest.json'), 1); assert.equal(f.manager.refs('mg1801/manifest.json'), 3);
  assert.equal(await a.json('manifest.json'), x);
  a.dispose(); b.dispose(); f.manager.release('prefetch'); assert.equal(f.manager.refs('mg1801/manifest.json'), 0);
});

await test('bytes remain usable after a consumer detaches its buffer', async () => {
  const f = fixture(), a = f.assets(), b = f.assets();
  const one = await a.bytes('audio.wav'); structuredClone(one, { transfer: [one] });
  assert.equal(one.byteLength, 0);
  assert.deepEqual(new Uint8Array(await a.bytes('audio.wav')), new Uint8Array([1, 2, 3]));
  assert.equal((await b.bytes('audio.wav')).byteLength, 3); assert.equal(f.buffer.byteLength, 3);
  assert.equal(f.counts.get('mg1801/audio.wav'), 1); a.dispose(); b.dispose();
});

await test('models/materials/textures/animations isolated; shared geometry preserved on exit', async () => {
  const f = fixture(), a = f.assets(), b = f.assets();
  const [x, y] = await Promise.all([a.gltf('body.glb'), b.gltf('body.glb')]);
  const xm = x.scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  const ym = y.scene.children[0] as typeof xm;
  xm.position.x = 8; xm.material.color.set(0xff0000); xm.material.map!.offset.x = 0.5; x.animations[0].duration = 5;
  assert.equal(ym.position.x, 0); assert.equal(ym.material.color.getHex(), 0xffffff); assert.equal(ym.material.map!.offset.x, 0);
  assert.equal(y.animations[0].duration, 1); assert.equal(f.gltf.animations[0].duration, 1);
  assert.equal(xm.geometry, ym.geometry); assert.equal(xm.geometry, f.geometry);
  assert.equal(xm.material.map!.source, f.texture.source); assert.notEqual(xm.material.map, f.texture);
  let geoDisposed = 0, textureDisposed = 0, ownDisposed = 0;
  f.geometry.addEventListener('dispose', () => geoDisposed++); f.texture.addEventListener('dispose', () => textureDisposed++);
  xm.material.addEventListener('dispose', () => ownDisposed++);
  const scene = new THREE.Scene(); scene.add(x.scene); const seen = new Set<object>(); a.preserve(seen); disposeScene(scene, seen); a.dispose(seen);
  assert.equal(geoDisposed, 0); assert.equal(textureDisposed, 0); assert.equal(ownDisposed, 1);
  f.manager.gpuBudget = 0; assert.equal(f.manager.trim(), 0);
  b.dispose(); assert.equal(f.manager.trim(), 1); assert.equal(geoDisposed, 1);
  const c = f.assets(), fresh = await c.gltf('body.glb');
  assert.equal(f.counts.get('mg1801/body.glb'), 1); assert.equal(fresh.scene.children[0].position.x, 0); c.dispose();
});

await test('standalone textures cloned, UI images shared, child owners released once', async () => {
  const f = fixture(), a = f.assets(), child = a.sub('common/');
  const [x, y, image] = await Promise.all([a.texture('../common/a.png'), child.texture('a.png'), a.image('ui/a.png')]);
  x.flipY = false; assert.equal(y.flipY, true); assert.equal(f.texture.flipY, true);
  assert.equal(await a.image('ui/a.png'), image); assert.equal(f.manager.refs('common/a.png'), 2);
  a.dispose(); a.dispose(); assert.equal(f.manager.refs('common/a.png'), 0);
  assert.throws(() => child.texture('a.png'), /disposed/); assert.throws(() => a.sub('x/'), /disposed/);
});

await test('dispose during fetch rejects late consumers without allocation or owner resurrection', async () => {
  const f = fixture(); let finish!: (value: GLTF) => void;
  f.manager.addHandler({ kind: 'gltf', fetch: () => new Promise<GLTF>(resolve => { finish = resolve; }) });
  const a = f.assets(), b = f.assets(), one = a.gltf('slow.glb'), two = b.gltf('slow.glb');
  const rejected = assert.rejects(one, /disposed/); a.dispose(); finish(f.gltf); await rejected;
  assert.equal((await two).scene.children.length, 1); assert.equal(a.roots().length, 0);
  assert.equal(f.manager.refs('mg1801/slow.glb'), 1); b.dispose(); assert.equal(f.manager.refs('mg1801/slow.glb'), 0);
});

await test('failed asset rejects all waiters and leaves no owners after release', async () => {
  const f = fixture(); f.manager.addHandler({ kind: 'json', fetch: async () => { throw new Error('fixture 404'); } });
  const a = f.assets(), b = f.assets();
  await Promise.all([assert.rejects(a.json('missing.json'), /fixture 404/), assert.rejects(b.json('missing.json'), /fixture 404/)]);
  a.dispose(); b.dispose(); assert.equal(f.manager.refs('mg1801/missing.json'), 0); assert.equal(f.manager.stats.failed, 1);
});

await test('a new scope retries an unowned fetch failure without resetting active owners', async () => {
  const f = fixture(); let attempts = 0;
  f.manager.addHandler({ kind: 'json', fetch: async () => { if (++attempts === 1) throw new Error('offline'); return { ok: true }; } });
  const a = f.assets(); await assert.rejects(a.json('retry.json'), /offline/);
  assert.equal(f.manager.resetFailed('mg1801/retry.json'), false);
  a.dispose(); const b = f.assets(); assert.deepEqual(await b.json('retry.json'), { ok: true });
  assert.equal(attempts, 2); assert.equal(f.manager.resetFailed('mg1801/retry.json'), false); b.dispose();
});

await test('P0 blocks queued P2/P3 and an explicit foreground request raises a copied asset', async () => {
  const f = fixture(); let finish!: (value: unknown) => void; const order: string[] = [];
  f.manager.addHandler({ kind: 'json', fetch: async (_url, key) => { order.push(key); return key.endsWith('gate') ? new Promise(resolve => { finish = resolve; }) : {}; } });
  const a = f.assets(), gate = a.json('gate'), late = a.json('late', P2), tail = a.json('tail', P3);
  assert.deepEqual(order, ['mg1801/gate']); assert.equal(f.manager.priority('mg1801/late'), P2);
  assert.equal(a.json('late', P0), late); await late; assert.equal(f.manager.priority('mg1801/late'), P0);
  assert.deepEqual(order, ['mg1801/gate', 'mg1801/late']); finish({}); await gate; await tail; a.dispose();
});

class FakeGl {
  shadowMap = { autoUpdate: true, needsUpdate: true };
  target: THREE.WebGLRenderTarget | null = null;
  scissor = new THREE.Vector4(1, 2, 3, 4);
  scissorTest = false;
  uploads = 0; compiles = 0; draws = 0; hiddenDrawn = false;
  initTexture(): void { this.uploads++; }
  getRenderTarget(): THREE.WebGLRenderTarget | null { return this.target; }
  setRenderTarget(value: THREE.WebGLRenderTarget | null): void { this.target = value; }
  getScissorTest(): boolean { return this.scissorTest; }
  setScissorTest(value: boolean): void { this.scissorTest = value; }
  getScissor(out: THREE.Vector4): THREE.Vector4 { return out.copy(this.scissor); }
  setScissor(x: number | THREE.Vector4, y?: number, z?: number, w?: number): void { if (typeof x === 'number') this.scissor.set(x, y!, z!, w!); else this.scissor.copy(x); }
  async compileAsync(): Promise<void> { this.compiles++; }
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.draws++; scene.traverseVisible(o => { if (o.name === 'hidden' && o.layers.test(camera.layers)) this.hiddenDrawn = true; });
  }
}

await test('GPU preparation uses scheduler, prepares hidden templates and restores scene/renderer state', async () => {
  const f = fixture(), a = f.assets(), model = await a.gltf('body.glb'); model.scene.children[0].name = 'hidden';
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), gl = new FakeGl();
  const target = new THREE.WebGLRenderTarget(2, 2); gl.target = target;
  model.scene.children[0].visible = false;
  let ready = false; const pending = a.prepare(scene, camera, gl as unknown as THREE.WebGLRenderer, true).then(() => { ready = true; });
  assert.equal(ready, false); await pending;
  assert.ok(gl.uploads > 0 && gl.compiles > 0 && gl.draws > 0); assert.equal(gl.hiddenDrawn, true);
  assert.equal(scene.children.length, 0); assert.equal(model.scene.parent, null); assert.equal(model.scene.children[0].visible, false);
  assert.equal(camera.layers.mask, 1); assert.equal(gl.target, target); assert.equal(gl.shadowMap.autoUpdate, true);
  assert.deepEqual(gl.scissor.toArray(), [1, 2, 3, 4]); a.dispose(); target.dispose();
});

await test('GPU preparation cancellation settles, restores temporary parents and stops scheduling', async () => {
  const f = fixture(), a = f.assets(); await a.gltf('body.glb');
  const scene = new THREE.Scene(), gl = new FakeGl();
  const promise = a.prepare(scene, new THREE.Camera(), gl as unknown as THREE.WebGLRenderer, false);
  const rejected = assert.rejects(promise, /disposed/); a.dispose(); await rejected;
  assert.equal(scene.children.length, 0); assert.equal(gl.draws, 0); assert.equal(f.manager.refs('mg1801/body.glb'), 0);
});

await test('expired render generation rejects GPU preparation instead of reporting ready', async () => {
  const f = fixture(), a = f.assets(); await a.gltf('body.glb');
  const scene = new THREE.Scene(), gl = new FakeGl();
  await assert.rejects(a.prepare(scene, new THREE.Camera(), gl as unknown as THREE.WebGLRenderer, false, { offscreen: true, valid: () => false }), /expired/);
  assert.equal(scene.children.length, 0); assert.equal(gl.draws, 0); a.dispose();
});

const actualReads = new Map<string, number>();
const parser = new GLTFLoader();
parser.register(() => ({ name: 'stub_textures', loadTexture: async () => new THREE.Texture() }) as never);
const real = createAssetManager({
  env: { now: () => 0, io: { fetch: async url => {
    actualReads.set(url, (actualReads.get(url) ?? 0) + 1);
    const bytes = readFileSync(resolve(web, 'assets', url));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      json: async () => JSON.parse(bytes.toString('utf8')), text: async () => bytes.toString('utf8') };
  } } }, resolve: key => key, handlers: [gltfHandler(parser), jsonHandler(), bytesHandler()],
});
const realRuntime = { manager: real, root: 'https://test/assets/' };

await test('real mg1801 model templates retain topology, animation and skinned bone isolation across reentry', async () => {
  const a = new Assets('mg1801/', realRuntime), b = new Assets('mg1801/', realRuntime);
  const files = ['model/mg1801_knife00.glb', 'model/mg1801_obj00.glb', 'model/mg1801_result00.glb', 'chara/../../chara/pc01/pc01_mario.glb'];
  for (const file of files) {
    const x = await a.gltf(file), y = await b.gltf(file), original = real.peek<GLTF>(a.key(file))!;
    const names = (root: THREE.Object3D): string[] => { const names: string[] = []; root.traverse(o => names.push(o.name)); return names; };
    assert.deepEqual(names(x.scene), names(original.scene)); assert.deepEqual(names(y.scene), names(original.scene));
    x.scene.traverse(o => {
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) { assert.notEqual(mesh.skeleton, (original.scene.getObjectByName(mesh.name) as THREE.SkinnedMesh).skeleton); mesh.skeleton.bones[0].position.x += 5; }
    });
    assert.equal(actualReads.get(a.key(file)), 1);
    assert.deepEqual(y.animations.map(c => [c.name, c.duration]), original.animations.map(c => [c.name, c.duration]));
  }
  a.dispose(); b.dispose(); assert.ok(real.snapshot().every(entry => entry.refs === 0));
});

await test('real animation Points copies preserve morph weights and pass three WebGLMorphtargets.update', async () => {
  const { WebGLMorphtargets } = await import(new URL('../node_modules/three/src/renderers/webgl/WebGLMorphtargets.js', import.meta.url).href);
  const targets = WebGLMorphtargets({}, { maxTextureSize: 4096 }, {});
  const a = new Assets('mg1801/', realRuntime); let checked = 0;
  for (const pc of ['pc01', 'pc02', 'pc03', 'pc04']) for (const clip of ['rhy_knife_idle00', 'rhy_knife_swing00', 'fcl_blink00', 'co_win00a']) {
    const file = `../chara/${pc}/motion/${clip}.glb`, copy = await a.gltf(file), original = real.peek<GLTF>(a.key(file))!;
    const sources: THREE.Object3D[] = []; original.scene.traverse(o => sources.push(o)); let index = 0;
    copy.scene.traverse(o => {
      const src = sources[index++] as THREE.Points, dst = o as THREE.Points;
      if (!dst.isPoints || !Object.keys(dst.geometry.morphAttributes).length) return;
      assert.ok(dst.morphTargetInfluences, `${pc}/${clip}/${dst.name}`);
      assert.deepEqual(dst.morphTargetInfluences, src.morphTargetInfluences); assert.notEqual(dst.morphTargetInfluences, src.morphTargetInfluences);
      assert.deepEqual(dst.morphTargetDictionary, src.morphTargetDictionary); assert.notEqual(dst.morphTargetDictionary, src.morphTargetDictionary);
      targets.update(dst, dst.geometry, { getUniforms: () => ({ setValue() {} }) });
      dst.morphTargetInfluences![0] = 0.5; assert.equal(src.morphTargetInfluences![0], 0); checked++;
    });
  }
  assert.equal(checked, 32); a.dispose();
});
await test('real HDR bytes match existing parser; cube face order and settings match HDRCubeTextureLoader', async () => {
  const a = new Assets('mg1801/', realRuntime);
  const files = readdirSync(resolve(web, 'assets/mg1801/tex')).filter(file => file.startsWith('mg1801_bg00_rad') && file.endsWith('.hdr')).sort();
  assert.equal(files.length, 6);
  const paths = files.map(file => `tex/${file}`), texture = await hdrTexture(a, paths[0]), cube = await hdrCube(a, paths);
  const expected = new HDRLoader().parse(await a.bytes(paths[0]));
  assert.deepEqual(texture.image.data, expected.data); assert.equal(texture.flipY, true);
  assert.equal(cube.type, THREE.HalfFloatType); assert.equal(cube.colorSpace, THREE.LinearSRGBColorSpace); assert.equal(cube.generateMipmaps, false);
  for (let i = 0; i < 6; i++) { const e = new HDRLoader().parse(await a.bytes(paths[i])); assert.deepEqual(cube.images[i].image.data, e.data); assert.equal(cube.images[i].flipY, false); }
  assert.equal(actualReads.get(a.key(paths[0])), 1); texture.dispose(); cube.dispose(); a.dispose();
});

await test('character eye UV setup cannot mutate cached geometry', async () => {
  real.addHandler(textureHandler(async () => new THREE.Texture()));
  const a = new Assets('mg1801/', realRuntime);
  const index = await a.json<Record<string, CharaInfo>>('chara/index.json');
  const template = await CharacterTemplate.load(a, 'pc01', index.pc01);
  const source = real.peek<GLTF>('chara/pc01/pc01_mario.glb')!;
  const attributes = new Map<THREE.BufferGeometry, string[]>();
  source.scene.traverse(o => { const geometry = (o as THREE.Mesh).geometry; if (geometry) attributes.set(geometry, Object.keys(geometry.attributes)); });
  const actor = new CharacterActor(template);
  let eyeCopies = 0;
  actor.root.traverse(o => { const geometry = (o as THREE.Mesh).geometry; if (geometry?.getAttribute('eyeUv')) { eyeCopies++; assert.equal(attributes.has(geometry), false); } });
  assert.ok(eyeCopies > 0);
  for (const [geometry, keys] of attributes) assert.deepEqual(Object.keys(geometry.attributes), keys);
  const scene = new THREE.Scene(); scene.add(actor.root); const seen = new Set<object>(); a.preserve(seen); actor.dispose(); disposeScene(scene, seen); a.dispose(seen);
});

await test('managed character clones match direct-loader bone poses for 120 frames', async () => {
  const a = new Assets('mg1801/', realRuntime), index = await a.json<Record<string, CharaInfo>>('chara/index.json');
  const direct = {
    gltf: (path: string) => real.get<GLTF>(a.key(path), 'gltf'),
    json: <T>(path: string) => real.get<T>(a.key(path), 'json'),
    texture: (path: string) => a.texture(path),
  } as unknown as Assets;
  const managed = new CharacterActor(await CharacterTemplate.load(a, 'pc01', index.pc01));
  const original = new CharacterActor(await CharacterTemplate.load(direct, 'pc01', index.pc01));
  const snapshot = (root: THREE.Object3D): number[][] => {
    root.updateMatrixWorld(true); const matrices: number[][] = [];
    root.traverse(o => { if ((o as THREE.Bone).isBone) matrices.push(o.matrixWorld.toArray()); }); return matrices;
  };
  for (let frame = 0; frame < 120; frame++) {
    const motion = frame % 60 < 30 ? 'rhy_knife_idle00' : 'rhy_knife_swing00';
    for (const actor of [managed, original]) actor.pose(motion, frame % 30, { now: frame });
    assert.deepEqual(snapshot(managed.root), snapshot(original.root));
  }
  const scene = new THREE.Scene(); scene.add(managed.root, original.root); const seen = new Set<object>(); a.preserve(seen);
  managed.dispose(); original.dispose(); disposeScene(scene, seen); a.dispose(seen);
});

await test('consumer integration awaits GPU preparation and keeps cache ownership boundary', () => {
  const read = (path: string): string => readFileSync(resolve(web, path), 'utf8');
  const view = read('script/app/minigame/mg1801/view/index.ts');
  assert.ok(view.indexOf('await this.assets.prepare(') < view.indexOf("onProgress(1, 1, '완료')"));
  assert.ok(view.indexOf('this.assets.preserve(seen)') < view.indexOf('disposeScene(this.scene, seen)'));
  assert.doesNotMatch(read('script/view/assets.ts'), /new Map|createGltfLoader|fetch\(/);
  assert.doesNotMatch(read('script/app/minigame/mg1801/view/material.ts'), /loadTexture|loadAsync/);
  assert.match(read('script/app/minigame/kit/rhythm/view/ui.ts'), /this\.assets\.image/);
  assert.match(read('script/view/effect.ts'), /assets\.texture/);
});

console.log(`game assets: ${passed}/${passed + failed}`);
process.exitCode = failed ? 1 : 0;
