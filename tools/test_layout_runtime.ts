import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { LayoutInst, LayoutPlayer, evalKeys, nodeMatrix, type LayoutSpec, type LayoutDocument, type NodeSpec, type FontSpec } from '@game/lib/layout';
import { LayoutRenderer, type LayoutRenderProviders } from '@game/lib/layout-three';
import { LayoutInstance, type Lyt, type Lan } from '@app/common/ui/layout/raw';

let pass = 0, fail = 0;
function test(name: string, fn: () => void): void { try { fn(); pass++; } catch (e) { fail++; console.error(`FAIL ${name}`, e); } }
const pane = (name: string, parent = -1): NodeSpec => ({ n: name, p: parent, k: 'pic', v: true, ia: true, o: [0, 0], po: [0, 0], t: [0, 0], r: 0, s: [1, 1], z: [20, 10], a: 255, m: 0 });
const spec = (): LayoutSpec => ({ size: [1920, 1080], nodes: [pane('root'), pane('child', 0)], mats: [{ name: 'mat', black: [0, 0, 0, 0], white: [255, 255, 255, 255], tex: [{ name: 'image', wu: 'repeat', wv: 'mirror' }], srt: [{ t: [0.2, 0.3], r: 0, s: [1, 1] }] }], anims: { move: { len: 2, loop: false, tracks: [{ node: 0, prop: 'tx', step: false, keys: [[0, 0, 1], [2, 2, 1]] }] }, next: { len: 2, loop: false, tracks: [{ node: 0, prop: 'ty', step: true, keys: [[0, 3], [2, 4]] }] } } });
const inst = (s = spec()): LayoutInst => new LayoutInst('fixture', s, { layouts: {} });
const rawPane = (name: string): Lyt['root'] => ({ type: 'pic1', name, visible: true, influencedAlpha: true, origin: ['center', 'center'], parentOrigin: ['center', 'center'], alpha: 255, translate: [0, 0, 0], rotate: [0, 0, 0], scale: [1, 1], size: [20, 10], children: [], material: 'm', vtxColors: Array(4).fill('#ffffffff') });
const raw: Lyt = { textures: [], fonts: [], materials: [{ name: 'm', black: '#00000000', white: '#ffffffff', texMaps: [{ tex: 'before', wrapU: 'clamp', wrapV: 'clamp', minFilter: 'linear', magFilter: 'linear' }], texSrt: [], tev: [] }], layout: { name: 'fixture', size: [1920, 1080] }, root: { ...rawPane('root'), children: [rawPane('child')] } };
const lan: Lan = { tag: { name: 'move', start: 0, end: 2 }, frameSize: 2, loop: false, textures: ['before', 'after'], entries: ['root', 'child'].map(name => ({ name, target: 'pane', tags: [{ tag: 'FLPA', tracks: [{ index: 0, target: 0, curve: 'hermite', keys: [[0, 0, 1], [2, 2, 1]] }] }] })) };
test('Hermite, step, duplicate key and endpoint semantics', () => {
  assert.equal(evalKeys([[0, 0, 1], [2, 2, 1]], 0.5, false), 0.5);
  assert.equal(evalKeys([[0, 1], [1, 2], [1, 3], [2, 4]], 1, true), 3);
  assert.equal(evalKeys([[0, 1], [1, 2], [1, 3], [2, 4]], 1, false), 2);
  assert.equal(evalKeys([], 1, false), 0);
  assert.equal(evalKeys([[0, 1], [2, 4]], 5, false), 4);
});
test('main last value retained; next starts at zero on completion tick', () => {
  const l = inst(); l.play('move'); l.update(5); assert.equal(l.nodes[0].t[0], 2); assert.equal(l.done, true);
  l.play('move', 'next'); l.update(2); assert.equal(l.current, 'next'); assert.equal(l.player?.frame, 0); assert.equal(l.nodes[0].t[1], 3);
});
test('loop, negative speed, speed zero and repeated apply', () => {
  const l = inst(); l.play('move'); l.player!.anim.loop = true; l.player!.speed = -1; l.update(1); assert.equal(l.player!.frame, 1);
  l.player!.speed = 0; l.update(50); l.applyPlayer(); l.applyPlayer(); assert.equal(l.player!.frame, 1);
  const zero = new LayoutPlayer('zero', { len: 0, loop: true, tracks: [] }); zero.advance(1); assert.equal(zero.frame, 1);
});
test('UV and material mutation do not leak across instances', () => {
  const s = spec(); s.nodes[0].uv = [0, 0, 1, 0, 0, 1, 1, 1]; const a = inst(s), b = inst(s);
  a.nodes[0].uv[0] = 0.4; a.mats[0].srt[0].t[0] = 5;
  assert.equal(b.nodes[0].uv[0], 0); assert.equal(s.nodes[0].uv[0], 0); assert.equal(b.mats[0].srt[0].t[0], 0.2);
});
test('explicit menu vs HUD fractional color policy', () => {
  const s = spec(); s.anims.color = { len: 1, loop: false, tracks: [{ node: 0, prop: 'a', step: true, keys: [[0, 1.5]] }] };
  const menu = inst(s); menu.play('color'); assert.equal(menu.nodes[0].a, 2);
  const hud = inst({ ...s, compatibility: 'hudLegacy' }); hud.play('color'); assert.equal(hud.nodes[0].a, 1.5);
});
test('explicit parent-center policy', () => {
  const s = spec(); s.nodes[0].o = [-1, 0]; assert.equal(nodeMatrix(inst(s), 'child')![2], 0);
  assert.equal(nodeMatrix(inst({ ...s, compatibility: 'hudLegacy' }), 'child')![2], 10);
});
test('HUD main and pane channels share core with only-subtree precedence', () => {
  const l = new LayoutInstance(raw, { move: lan }); l.play('move'); l.playPane('child', 'move', 0.5); l.update(1);
  assert.equal(l.panes.get('root')!.t[0], 1); assert.equal(l.panes.get('child')!.t[0], 0.5);
  l.setPaneFrame('child', 1.5); assert.equal(l.panes.get('child')!.t[0], 1.5);
  l.setFrame(0); assert.equal(l.panes.get('child')!.t[0], 0);
  l.main!.speed = 0; l.update(1); assert.equal(l.main!.frame, 0); assert.equal(l.panes.get('child')!.t[0], 2);
});
test('HUD parts update once and part frame command stays local', () => {
  const lyt = { ...raw, root: { ...rawPane('part'), type: 'prt1', layoutFile: 'sub' } };
  const l = new LayoutInstance(lyt, {}, () => ({ lyt: raw, anims: { move: lan } })); const a = l.playPane('part', 'move');
  l.update(0.5); assert.equal(a.frame, 0.5); l.setPaneFrame('part', 1.5); assert.equal(a.frame, 1.5);
  assert.equal(l.part('part')!.core, l.core.parts.get(0));
});
test('HUD material texture animation and direct override share state', () => {
  const textureLan: Lan = { ...lan, entries: [{ name: 'm', target: 'material', tags: [{ tag: 'FLTP', tracks: [{ index: 0, target: 0, curve: 'step', keys: [[0, 0], [1, 1]] }] }] }] };
  const l = new LayoutInstance(raw, { tex: textureLan }); l.play('tex'); l.update(1); assert.equal(l.mats.get('m')!.tex[0], 'after');
  l.mats.get('m')!.tex[0] = 'face'; assert.equal(l.core.texOverride.get(0)?.get(0), 'face');
});
test('HUD texts stay independent of frame advancement', () => {
  const l = new LayoutInstance(raw, { move: lan }); l.texts.set('root', 'A'); l.play('move'); l.syncTexts(); l.syncTexts();
  assert.equal(l.core.texts.get(0), 'A'); assert.equal(l.main!.frame, 0);
  l.texts.delete('root'); l.syncTexts(); assert.equal(l.core.texts.size, 0);
});
const glyphTexture = new THREE.Texture(); glyphTexture.userData.red = true;
const font: FontSpec = { width: 10, height: 10, ascent: 8, glyphs: { A: { x: 0, y: 0, w: 5, h: 8, left: 1, adv: 6, baseline: 7, color: true, sheet: 'sheet', rgba: true, u0: 0.1, v0: 0.2, u1: 0.3, v1: 0.4 } } };
const providers: LayoutRenderProviders = { loadUiImage: async () => ({ width: 32, height: 32 }), textureFromImage: () => new THREE.Texture(), resolveFonts: async () => undefined, sheetTexture: () => glyphTexture, rasterText: () => null };
const document = (s: LayoutSpec): LayoutDocument => ({ screen: [1920, 1080], textures: {}, fonts: { font }, layouts: { fixture: s } });
type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
for (const hud of [false, true]) test(`${hud ? 'HUD' : 'menu'} glyph metrics, alpha and color mode`, () => {
  const s = spec(); s.nodes = [{ ...pane('text'), k: 'txt', a: 128, txt: { font: 'font', fs: [10, 10], cs: 1, al: [-1, 1], text: 'AA' } }]; if (hud) s.compatibility = 'hudLegacy';
  const l = inst(s), r = new LayoutRenderer(document(s), providers, hud ? 'hudPremultiplied' : 'menuLinear'); r.draw(l);
  assert.equal(r.drawCount, 2); const mesh = r.scene.children[0] as Mesh;
  assert.deepEqual(Array.from(mesh.geometry.getAttribute('position').array), [-9, 4, 0, -4, 4, 0, -9, -4, 0, -4, -4, 0]);
  assert.equal(mesh.material.uniforms.mode.value, hud ? 1 : 2); assert.equal(mesh.material.uniforms.alpha.value, 128 / 255);
  assert.equal(mesh.material.uniforms.premultiplied.value, hud ? 1 : 0); r.dispose();
});
test('mask and second texture SRT survive HUD normalization and quad reuse', () => {
  const s = spec(); s.compatibility = 'hudLegacy'; s.nodes[0].mask = { tex: 'mask', wrapU: 'repeat', wrapV: 'clamp', srt: { t: [0.5, 0], r: 0, s: [1, 1] } };
  s.mats[0].tex.push({ name: 'second', wu: 'clamp', wv: 'clamp' }); s.mats[0].srt.push({ t: [0.25, 0], r: 0, s: [1, 1] });
  const l = inst(s), r = new LayoutRenderer(document(s), providers, 'hudPremultiplied'); r.draw(l);
  const mesh = r.scene.children[0] as Mesh; assert.equal(mesh.material.uniforms.maskOn.value, 1); assert.equal(mesh.material.uniforms.srtMask.value.elements[6], 0.5); assert.equal(mesh.material.uniforms.srt1.value.elements[6], 0.25);
  delete s.nodes[0].mask; r.begin(); r.draw(l); assert.equal(r.scene.children[0], mesh); assert.equal(mesh.material.uniforms.maskOn.value, 0); r.dispose();
});
test('borrowed glyph/dynamic textures survive renderer disposal', () => {
  const s = spec(), r = new LayoutRenderer(document(s), providers); const borrowed = new THREE.Texture(); let disposed = 0; borrowed.addEventListener('dispose', () => disposed++);
  r.dynamic.set('image', borrowed); r.draw(inst(s)); r.dispose(); assert.equal(disposed, 0);
});
test('draw is read-only for animation time; hidden pane suppresses subtree', () => {
  const l = inst(), r = new LayoutRenderer(document(l.spec), providers); l.play('move'); const before = JSON.stringify(l.nodes);
  r.draw(l); r.begin(); r.draw(l); assert.equal(l.player!.frame, 0); assert.equal(JSON.stringify(l.nodes), before);
  l.nodes[0].v = false; r.begin(); r.draw(l); assert.equal(r.drawCount, 0); r.dispose();
});
test('one import0 runtime and one renderer, no app or DOM in adapters', () => {
  const root = resolve(import.meta.dirname, '..'), read = (p: string): string => readFileSync(resolve(root, p), 'utf8');
  const core = read('script/game/lib/layout/index.ts'), adapter = read('script/game/lib/layout-three/index.ts');
  const imports = (s: string): string[] => [...s.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1]).sort();
  assert.deepEqual(imports(core), []); assert.deepEqual(imports(adapter), ['../layout', 'three']);
  assert.doesNotMatch(core + adapter, /Math\.random|Date\.now|performance\.now|document\.|window\./);
  assert.doesNotMatch(read('script/view/lyt.ts'), /class /); assert.doesNotMatch(read('script/app/scene/menu/charselect/scene2d.ts'), /class /);
});
console.log(`layout runtime: ${pass}/${pass + fail}`);
process.exitCode = fail ? 1 : 0;
