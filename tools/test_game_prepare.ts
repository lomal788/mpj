import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mg1801AssetKeys } from '../script/app/minigame/mg1801/assets';
import { flowKeys } from '../script/view/flowCatalog';
import { createAssetManager, jsonHandler, bytesHandler } from '@game/lib/assetcore';

let count = 0;
async function test(name: string, run: () => unknown | Promise<unknown>): Promise<void> { await run(); count++; console.log(`PASS ${name}`); }
const root = resolve('assets');
const json = async <T>(key: string): Promise<T> => JSON.parse(readFileSync(resolve(root, key), 'utf8')) as T;
const keys = await mg1801AssetKeys(json, ['pc01', 'pc02', 'pc01', 'pc02'], k => k);
const map = new Map(keys);
await test('actual selected game resources include models, IBL, effects, character motion, UI and sound', () => {
  for (const [key, kind] of [
    ['mg1801/model/mg1801_water00.glb', 'gltf'], ['mg1801/model/mg1801_obj03_4.glb', 'gltf'],
    ['mg1801/tex/mg1801_bg00_rad_00.hdr', 'bytes'], ['mg1801/effect/primitives.glb', 'gltf'],
    ['chara/pc01/motion/rhy_knife_swing00.glb', 'gltf'], ['mgscene/tables.json', 'json'],
    ['mg1801/ui/ui.json', 'json'], ['mgscene/sound/SQ_SE_TLP_START.wav', 'bytes'],
  ]) assert.equal(map.get(key), kind, key);
  assert.ok([...map].some(([k, kind]) => k.startsWith('font/') && kind === 'uiimage'));
});
await test('all required paths exist, are normalized and retain one kind per key', () => {
  assert.equal(keys.length, map.size);
  for (const [key] of keys) { assert.ok(existsSync(resolve(root, key)), key); assert.doesNotMatch(key, /\.\.\/|^\//); }
});
await test('selected characters only plus the NPC; no unrelated player download', () => {
  assert.ok([...map.keys()].some(k => k.startsWith('chara/npc002/')));
  assert.ok(![...map.keys()].some(k => k.startsWith('chara/pc03/')));
  assert.ok([...map.keys()].some(k => k === 'chara/pc01/motion/co_win00a.glb'));
});
await test('BGM preparation uses the streaming first-chunk resolver', async () => {
  const mapped: string[] = [];
  const chunked = await mg1801AssetKeys(json, [], k => { mapped.push(k); return `first/${k}`; });
  assert.ok(mapped.length > 0); assert.ok(mapped.every(k => chunked.some(([key]) => key === `first/${k}`)));
});
await test('flow catalog expands the registered game to the same required keys', async () => {
  const actual = await flowKeys('game:mg1801', json, { gltfTextures: true, gameKeys: (_name, read) => mg1801AssetKeys(read, ['pc01', 'pc02'], k => k) });
  assert.deepEqual(actual, keys);
});
await test('CPU requests prepared under an owner are reused by the game owner', async () => {
  let fetches = 0;
  const manager = createAssetManager({ env: { now: () => 0, io: { fetch: async () => { fetches++; return { ok: true, status: 200, text: async () => '{"ready":true}', json: async () => ({ ready: true }), arrayBuffer: async () => new TextEncoder().encode('{"ready":true}').buffer }; } } }, resolve: k => k, handlers: [jsonHandler(), bytesHandler()] });
  const early = manager.get('manifest', 'json', 2, 'preparing');
  for (let i = 0; i < 20; i++) { manager.scheduler.frame(); await Promise.resolve(); }
  await early;
  manager.release('preparing');
  assert.deepEqual(await manager.get('manifest', 'json', 0, 'game'), { ready: true });
  assert.equal(fetches, 1); manager.release('game');
});
await test('boot requests Plaza early without waiting for character selection; lite retains data-saving policy', async () => {
  const { FLOW_TABLE } = await import('../script/view/flowTable');
  const { FlowPrefetch } = await import('../script/view/flow');
  const manager = createAssetManager({ env: { now: () => 0 }, resolve: key => key, handlers: [{ kind: 'json', fetch: async () => ({}) }] });
  const flow = new FlowPrefetch(manager, { mode: () => 'full', catalog: async bundle => [[`${bundle}.json`, 'json']] });
  flow.enter('boot');
  for (let i = 0; i < 30; i++) { manager.scheduler.frame(); await Promise.resolve(); }
  assert.ok(flow.requests.some(([bundle, pri]) => bundle === 'plaza:p0' && pri === 3));
  assert.deepEqual(FLOW_TABLE.boot.predict.map(p => p.bundle), ['plaza:p0', 'plaza:ui', 'plaza:npc']);
  const lite = new FlowPrefetch(manager, { mode: () => 'lite', catalog: async bundle => [[`${bundle}.json`, 'json']] });
  lite.enter('boot'); for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.ok(!lite.requests.some(([bundle]) => bundle.startsWith('plaza:')));
});
await test('Plaza first-frame assets include environment IBL, sky and LUT with cache-compatible kinds', async () => {
  const actual = await flowKeys('plaza:p0', json, { gltfTextures: true }); assert.ok(actual);
  const map = new Map(actual);
  const man = await json<{ env: { ibl: { common: string[]; chara: string[] }; sky: { texture: string }; post: { lut: string } }; textures: Record<string, { files: string[] }> }>('plaza/world/manifest.json');
  for (const name of [...man.env.ibl.common, ...man.env.ibl.chara, man.env.sky.texture, man.env.post.lut]) {
    for (const file of man.textures[name].files) assert.equal(map.get(`plaza/world/tex/${file}`), /\.hdr$/i.test(file) ? 'bytes' : 'texture');
  }
});
console.log(`game prepare assets: ${count}/${count}, ${keys.length} required keys`);
