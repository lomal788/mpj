import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeSpec } from '@app/common/ui/view';
import type { MgmSpec } from '@app/common/ui/types';
import { LayoutInst } from '@game/lib/layout';
import { LayoutRenderer, type LayoutRenderProviders } from '@game/lib/layout-three';
import { ControllerStandbyScreen, CONTROLLER_STANDBY_LABEL,
  type ControllerStandbyAssets, type ControllerStandbyPlayer } from '@app/scene/system/controllerstandby';
import { resolveFontsFromDisk } from './fontSpecNode';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
const json = <T>(path: string): T => JSON.parse(read(path)) as T;
const assets = json<ControllerStandbyAssets>(join(WEB, 'assets/controllerstandby/controllerstandby.json'));
const spec = mergeSpec(json<MgmSpec>(join(WEB, 'assets/mgmcommon/spec.json')), assets);
await resolveFontsFromDisk(spec.fonts, join(WEB, 'assets/mgmcommon'));
let pass = 0;
let fail = 0;
function test(name: string, run: () => void): void {
  try { run(); pass++; }
  catch (error) { fail++; console.error(`실패: ${name}`, error); }
}
const players: ControllerStandbyPlayer[] = ['pc05', 'pc07', 'pc50', 'pc04'].map((character, pid) => ({ pid, character }));
const node = (layout: LayoutInst, path: string) => {
  const found = layout.find(path);
  assert.ok(found, path);
  return found[0].nodes[found[1]];
};
function rig(ps = players) {
  const counts = { begin: 0, draw: 0, end: 0, dispose: 0 };
  const screen = new ControllerStandbyScreen({ spec,
    layout: name => new LayoutInst(name, spec.layouts[name], spec),
    begin() { counts.begin++; }, draw() { counts.draw++; }, end() { counts.end++; },
    dispose() { counts.dispose++; },
  }, assets, ps);
  return { screen, counts };
}
const steps = (screen: ControllerStandbyScreen, n: number): void => { for (let i = 0; i < n; i++) screen.step(); };

test('원본 한국어 메시지·줄바꿈·OK', () => {
  const source = json<Record<string, string>>(join(WEB, '../extracted/message/koKR/menu01_mode.json'));
  assert.equal(assets.texts[CONTROLLER_STANDBY_LABEL], source[CONTROLLER_STANDBY_LABEL]);
  assert.equal(assets.texts.mn01_ui_ok, 'OK!');
  const r = rig();
  const found = r.screen.layout.find('x_text')!;
  assert.equal(found[0].texts.get(found[1]), '다른 플레이어의 컨트롤러 설정을\n기다리는 중입니다.');
  r.screen.dispose();
});
test('원본 창·문구·얼굴 좌표와 글꼴', () => {
  const r = rig();
  steps(r.screen, 10);
  assert.deepEqual(node(r.screen.layout, 'window').z, [1589, 765]);
  assert.equal(node(r.screen.layout, 'pict_back_black').a, 160);
  assert.deepEqual(node(r.screen.layout, 'x_text').t, [0, 182]);
  assert.deepEqual(node(r.screen.layout, 'x_text').spec.txt!.fs, [71, 71]);
  assert.equal(node(r.screen.layout, 'x_text').spec.txt!.font, 'bqfont_middle');
  assert.deepEqual(node(r.screen.layout, 'A_pcface').t, [0, -92]);
  for (let pid = 0; pid < 4; pid++) {
    assert.deepEqual(node(r.screen.layout, `x_pcface_0${pid}`).t, [-450 + pid * 300, 0]);
    assert.deepEqual(node(r.screen.layout, `x_pcface_0${pid}/x_pcface256`).z, [256, 256]);
  }
  r.screen.dispose();
});
test('레이아웃 closure·모든 텍스처·애니·글리프 파일', () => {
  assert.deepEqual(Object.keys(assets.layouts).sort(), ['sys_standby_base', 'sys_standby_pcface']);
  for (const layout of Object.values(assets.layouts)) {
    for (const pane of layout.nodes) if (pane.part) assert.ok(spec.layouts[pane.part], pane.part);
    for (const mat of layout.mats) for (const tex of mat.tex) assert.ok(spec.textures[tex.name], tex.name);
  }
  for (const path of Object.values(assets.textures)) assert.ok(existsSync(resolve(WEB, 'assets/mgmcommon', path)), path);
  for (const [font, family] of Object.entries(assets.fonts!)) {
    for (const ch of Object.values(assets.texts).join('')) if (!/\s/.test(ch)) assert.ok(spec.fonts[font].glyphs[ch], `${font}/${ch}`);
    assert.ok(family);
  }
});
test('256px 얼굴 슬롯1·mask 슬롯0·별도 UV 보존', () => {
  const r = rig();
  for (const player of players) {
    const tile = r.screen.layout.part(`x_pcface_0${player.pid}`)!;
    const face = node(tile, 'x_pcface256');
    assert.equal(tile.texOverride.get(face.spec.m!)!.get(1), `face_256_${player.character}^u`);
    assert.equal(tile.texOverride.get(face.spec.m!)!.has(0), false);
    assert.deepEqual(face.uv, [0, 0, 2, 0, 0, 2, 2, 2]);
    assert.deepEqual(face.uv1, [0, 0, 1, 0, 0, 1, 1, 1]);
  }
  r.screen.dispose();
});
test('CPU·없는 슬롯 숨김 및 CPU OK 주입 무시', () => {
  const r = rig([{ ...players[0] }, { ...players[3], cpu: true }]);
  for (let pid = 0; pid < 4; pid++) assert.equal(node(r.screen.layout, `x_pcface_0${pid}`).v, pid === 0);
  for (const pid of [1, 2, 3, 99]) { r.screen.setReady(pid); assert.equal(r.screen.isReady(pid), false); }
  r.screen.dispose();
});
test('초기 ready는 바로 normal_ok·OK·초록 배경', () => {
  const r = rig(players.map(p => ({ ...p, ready: true })));
  for (let pid = 0; pid < 4; pid++) {
    const tile = r.screen.layout.part(`x_pcface_0${pid}`)!;
    assert.equal(tile.current, 'normal_ok');
    assert.equal(node(tile, 'x_text_ok').a, 255);
    assert.deepEqual(node(tile, 'pc_base').vc[0], [203, 255, 29, 255]);
  }
  steps(r.screen, 3600);
  assert.equal(r.screen.phase, 'waiting');
  r.screen.dispose();
});
test('원본 in 10프레임·ready ok 15프레임·out 5프레임', () => {
  const r = rig();
  assert.equal(r.screen.phase, 'entering');
  steps(r.screen, 9);
  assert.equal(r.screen.phase, 'entering');
  r.screen.step();
  assert.equal(r.screen.phase, 'waiting');
  const tile = r.screen.layout.part('x_pcface_00')!;
  assert.equal(node(tile, 'x_text_ok').a, 0);
  r.screen.setReady(0);
  steps(r.screen, 14);
  assert.equal(tile.current, 'ok');
  r.screen.step();
  assert.equal(tile.current, 'normal_ok');
  assert.equal(node(tile, 'x_text_ok').a, 255);
  r.screen.close();
  steps(r.screen, 4);
  assert.equal(r.screen.phase, 'closing');
  r.screen.step();
  assert.equal(r.screen.phase, 'closed');
  assert.equal(r.screen.layout.visible, false);
  r.screen.dispose();
});
test('반복 ready는 애니 재시작 없음·해제 시 normal 복귀', () => {
  const r = rig();
  r.screen.setReady(2);
  steps(r.screen, 7);
  r.screen.setReady(2);
  steps(r.screen, 8);
  const tile = r.screen.layout.part('x_pcface_02')!;
  assert.equal(tile.current, 'normal_ok');
  r.screen.setReady(2, false);
  assert.equal(tile.current, 'normal');
  assert.equal(node(tile, 'x_text_ok').a, 0);
  assert.equal(r.screen.isReady(2), false);
  r.screen.dispose();
});
test('닫기 반복·닫는 중 상태 주입·렌더 중단·해제 1회', () => {
  const r = rig();
  r.screen.render();
  assert.deepEqual(r.counts, { begin: 1, draw: 1, end: 1, dispose: 0 });
  r.screen.close();
  steps(r.screen, 3);
  r.screen.close();
  r.screen.setReady(0);
  assert.equal(r.screen.isReady(0), false);
  steps(r.screen, 2);
  r.screen.render();
  r.screen.draw();
  assert.equal(r.counts.draw, 1);
  r.screen.dispose();
  r.screen.dispose();
  r.screen.step();
  r.screen.render();
  assert.equal(r.counts.dispose, 1);
  assert.equal(r.screen.phase, 'disposed');
});
test('입력 플레이어 객체 변경이 화면으로 새지 않음', () => {
  const ps = players.map(p => ({ ...p }));
  const r = rig(ps);
  ps[0].pid = 3;
  ps[0].character = 'missing';
  assert.equal(r.screen.players[0].pid, 0);
  assert.equal(r.screen.players[0].character, 'pc05');
  r.screen.dispose();
});
test('중복·범위 밖 pid 및 없는 캐릭터 거부', () => {
  for (const pid of [-1, 4, 0.5]) assert.throws(() => rig([{ ...players[0], pid }]), /player ids/);
  assert.throws(() => rig([players[0], players[0]]), /player ids/);
  assert.throws(() => rig([{ ...players[0], character: 'missing' }]), /missing face/);
});
test('제품 화면 import 허용 목록·기능 미연결 경계', () => {
  const dir = join(WEB, 'script/app/scene/system/controllerstandby');
  const allowed = new Set(['@app/common/ui/view', '@app/common/ui/types', '@game/lib/layout']);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
    const src = read(join(dir, file));
    for (const match of src.matchAll(/(?:import|export)[^'";]*from\s+['"]([^'"]+)['"]/g))
      assert.ok(/^\.\/[^/]+$/.test(match[1]) || allowed.has(match[1]), match[1]);
    assert.ok(!/Math\.random|Date\.now|performance\.now|requestAnimationFrame|WebGLRenderer|location|Keyboard|Gamepad|Socket/.test(src));
  }
});

const providers: LayoutRenderProviders = {
  loadUiImage: async path => {
    const data = readFileSync(path);
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  },
  textureFromImage: () => new THREE.Texture(), resolveFonts: async () => undefined,
  sheetTexture: () => new THREE.Texture(), rasterText: () => null,
};
const renderer = new LayoutRenderer(spec, providers);
await renderer.load(path => resolve(WEB, 'assets/mgmcommon', path));
test('실제 renderer 메시지 검정·얼굴 이중 UV·유효한 정점', () => {
  const r = rig(players.map(p => ({ ...p, ready: true })));
  steps(r.screen, 10);
  renderer.begin();
  renderer.draw(r.screen.layout);
  const meshes = renderer.scene.children as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
  assert.ok(meshes.length > 50);
  assert.ok(meshes.some(m => m.visible && m.material.uniforms.mode.value === 1 &&
    m.material.uniforms.white.value.toArray().join(',') === '0,0,0,1'));
  const faces = meshes.filter(m => m.visible && m.material.uniforms.texCount.value === 2);
  assert.equal(faces.length, 4);
  for (const face of faces) {
    assert.deepEqual(Array.from(face.geometry.getAttribute('uv1').array), [0, 0, 1, 0, 0, 1, 1, 1]);
    assert.deepEqual(Array.from(face.geometry.getAttribute('uv').array), [0, 0, 2, 0, 0, 2, 2, 2]);
  }
  for (const mesh of meshes.filter(m => m.visible))
    assert.ok(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite));
  r.screen.dispose();
});
renderer.dispose();
console.log(`controllerstandby: ${pass}/${pass + fail} 통과`);
if (fail) process.exitCode = 1;
