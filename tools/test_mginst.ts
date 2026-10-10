import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeSpec, type MgmView } from '@app/common/ui/view';
import type { MgmSpec } from '@app/common/ui/types';
import type { Render2D } from '@app/common/ui/layout/render';
import { LayoutInst, type LayoutDocument } from '@game/lib/layout';
import { LayoutRenderer, type LayoutRenderProviders } from '@game/lib/layout-three';
import { BorrowedPreviewSlot, MG_INST_PREVIEW_KEY, MgInstScreen, MgInstState, mgInstContent,
  type MgInstAssets, type MgInstOptions, type MgInstPlayer } from '@app/scene/system/mginst';
import { READY_CAPACITY, READY_GROUPS } from '@app/scene/system/mginst/view';
import { resolveFontsFromDisk } from './fontSpecNode';
import { RichTextPane, parseMessage } from '@app/common/ui/text';
import { paneGlobal } from '@app/common/ui/itemLayout';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as T;
const assets = json<MgInstAssets>(join(WEB, 'assets/mginst/mginst.json'));
const spec = mergeSpec(json<MgmSpec>(join(WEB, 'assets/mgmcommon/spec.json')), assets);
await resolveFontsFromDisk(spec.fonts, join(WEB, 'assets/mgmcommon'));
let pass = 0;
let fail = 0;
function test(name: string, run: () => void): void {
  try { run(); pass++; }
  catch (error) { fail++; console.error(`실패: ${name}`, error); }
}
const players: MgInstPlayer[] = [
  { pid: 0, character: 'pc01', cpu: false, local: true, advantage: true },
  { pid: 1, character: 'pc02', cpu: true },
  { pid: 2, character: 'pc03', cpu: true },
  { pid: 3, character: 'pc04', cpu: true },
];
const none = new Map<number, number>();
const bits = (pid: number, trig: number): Map<number, number> => new Map([[pid, trig]]);
const readyState = (ps: MgInstPlayer[] = players): MgInstState => {
  const state = new MgInstState(ps);
  state.step(none, true);
  state.setInputAllowed(true);
  return state;
};
const node = (inst: LayoutInst, path: string) => {
  const found = inst.find(path);
  assert.ok(found, path);
  return found[0].nodes[found[1]];
};
const texture = (inst: LayoutInst, path: string, slot: number) => {
  const found = inst.find(path)!;
  return found[0].texOverride.get(found[0].nodes[found[1]].spec.m!)?.get(slot);
};

test('원본 raw 표 전체 보존', () => {
  const source = json<MgInstAssets['raw']>(join(WEB, '../extracted/bea/mg~mgInst.nx.bea/mg/mgInst/data/mgInst.json'));
  assert.deepEqual(assets.raw, source);
  assert.deepEqual([source.mgInst.length, source.controller.length, source.mgInstRank.length], [120, 28, 10]);
});
test('mg0905 한국어 제목·규칙·조작·어드밴티지', () => {
  const c = mgInstContent(assets, 'mg0905');
  assert.equal(c.title, '루이지와 수수께끼의 저택');
  assert.equal(c.rule, '계속되는 수수께끼를 풀고\n저택 안쪽에 붙잡혀 있는 루이지를 구하세요!\n수수께끼가 너무 어려울 때는 방에 있는 TV를 체크.\n가장 빨리 마지막 방에 도착한 사람의 승리!');
  assert.deepEqual(c.operations, ['\uE015 이동', '\uE000 액션']);
  assert.equal(c.operationTitle, '조작 방법');
  assert.equal(c.advantage, '첫 방은 수수께끼가 풀린 상태로\n게임이 시작됩니다.');
  assert.equal(c.readyLabel, '\uE00F/\uE00E 스타트!');
  assert.equal(c.okLabel, 'OK!');
});
test('mg1801 체감 안내 데이터만 선택', () => {
  const c = mgInstContent(assets, 'mg1801');
  assert.equal(c.title, '싹둑싹둑 수프');
  assert.deepEqual(c.operations, ['야채 자르기']);
  assert.equal(c.controllerId, 16);
  assert.equal(c.instLayerId, 1);
  assert.equal(c.usesGyro, true);
  assert.equal(c.advantage, '');
});
test('A/B/C 빈 묶음은 임의 조작을 만들지 않음', () => {
  for (const group of ['B', 'C'] as const) {
    const c = mgInstContent(assets, 'mg0905', group);
    assert.deepEqual(c.operations, []);
    assert.equal(c.operationTitle, '');
    assert.equal(c.instLayerId, -1);
    assert.equal(c.usesGyro, false);
  }
  assert.throws(() => mgInstContent(assets, 'missing'), /missing game data/);
});
test('raw 120행 모든 묶음의 빈 행·없는 메시지는 표시하지 않음', () => {
  for (const [index, row] of assets.raw.mgInst.entries()) for (const group of ['A', 'B', 'C'] as const) {
    const c = mgInstContent(assets, row.Name, group, index);
    assert.equal(c.operations.length, [0, 1, 2, 3].filter(i => !!assets.texts[String(row[`Input${i}_${group}`])]).length, `${index}/${group}`);
    assert.ok(c.title, row.Name);
    assert.equal(c.raw, row);
  }
});
test('원본 조회는 행 0을 제외하고 행 1부터 검색', () => {
  assert.equal(mgInstContent(assets, 'mg0101').raw, assets.raw.mgInst[1]);
  assert.equal(mgInstContent(assets, 'mg0101', 'A', 0).operations.length, 4);
  assert.equal(mgInstContent(assets, 'mg0101', 'A', 1).operations.length, 1);
  assert.throws(() => mgInstContent(assets, 'mg0905', 'A', 0), /does not match/);
});
test('실제 변환 레이아웃 closure·텍스처 파일', () => {
  assert.equal(Object.keys(assets.layouts).length, 10);
  for (const [name, layout] of Object.entries(assets.layouts)) {
    for (const pane of layout.nodes) if (pane.part) assert.ok(spec.layouts[pane.part], `${name}/${pane.n}`);
    for (const mat of layout.mats) for (const tex of mat.tex) assert.ok(spec.textures[tex.name], `${name}/${tex.name}`);
    for (const anim of Object.values(layout.anims)) for (const track of anim.tracks)
      for (const tex of track.textures ?? []) assert.ok(spec.textures[tex], `${name}/${tex}`);
  }
  for (const url of Object.values(assets.textures)) assert.ok(existsSync(resolve(WEB, 'assets/mgmcommon', url)), url);
});
test('기본 설명 화면의 글리프·아이콘 존재', () => {
  const c = mgInstContent(assets, 'mg0905');
  const text = [c.title, c.rule, c.operationTitle, ...c.operations, c.advantageTitle, c.advantage, c.readyLabel, c.okLabel].join('');
  for (const ch of text) if (!/\s/.test(ch)) assert.ok(spec.fonts.bqfont_middle.glyphs[ch], ch);
  for (const family of Object.values(spec.fonts)) for (const glyph of Object.values(family.glyphs))
    assert.ok(existsSync(glyph.sheet), glyph.sheet);
});
test('준비 gate와 intro 전 trigger 소비', () => {
  const s = new MgInstState(players);
  s.setInputAllowed(true);
  s.step(bits(0, 0x3000), false);
  assert.equal(s.ready.size, 0);
  s.step(bits(0, 0x3000), true);
  assert.equal(s.phase, 'ready');
  assert.equal(s.ready.size, 0);
  s.setInputAllowed(false);
  s.step(bits(0, 0x3000), true);
  s.setReady(0);
  assert.equal(s.ready.size, 0);
});
for (const trigger of [0x1000, 0x2000, 0x3000]) test(`± 준비 ${trigger.toString(16)}·CPU 제외`, () => {
  const s = readyState();
  s.step(bits(0, trigger), true);
  assert.equal(s.phase, 'ending');
  assert.deepEqual([...s.ready], [0]);
  for (let i = 0; i < 29; i++) s.step(none, true);
  assert.equal(s.phase, 'ending');
  s.step(none, true);
  assert.equal(s.phase, 'complete');
  assert.deepEqual([...s.ready], [0, 1, 2, 3]);
});
test('A·B·시간 경과는 로컬 강제 시작이 아님', () => {
  const s = readyState();
  for (let i = 0; i < 3600; i++) s.step(bits(0, 3), true);
  assert.equal(s.phase, 'ready');
  assert.equal(s.ready.size, 0);
});
test('두 사람 준비 합의', () => {
  const s = readyState(players.map(p => ({ ...p, cpu: p.pid >= 2 })));
  s.step(bits(0, 0x2000), true);
  assert.equal(s.phase, 'ready');
  s.step(bits(1, 0x1000), true);
  assert.equal(s.phase, 'ending');
});
test('원격 사람은 로컬 패드로 대행할 수 없음', () => {
  const s = readyState(players.map(p => ({ ...p, cpu: p.pid >= 2, local: p.pid !== 1 })));
  s.step(new Map([[0, 0x2000], [1, 0x2000]]), true);
  assert.deepEqual([...s.ready], [0]);
  s.setReady(7);
  s.setReady(2);
  assert.deepEqual([...s.ready], [0]);
  s.setReady(1);
  s.step(none, true);
  assert.equal(s.phase, 'ending');
});
test('전원 CPU gate 후 완료', () => {
  const s = new MgInstState(players.map(p => ({ ...p, cpu: true })));
  s.step(none, true);
  s.step(none, true);
  assert.equal(s.phase, 'ready');
  s.setInputAllowed(true);
  s.step(none, true);
  assert.equal(s.phase, 'ending');
  for (let i = 0; i < 30; i++) s.step(none, true);
  assert.equal(s.phase, 'complete');
});
test('잘못된 플레이어 구성 거부·호출자 데이터 분리', () => {
  for (const ps of [[], [players[0], players[0]], [{ ...players[0], pid: 8 }], [{ ...players[0], pid: 0.5 }]])
    assert.throws(() => new MgInstState(ps));
  const ps = players.map(p => ({ ...p }));
  const s = new MgInstState(ps);
  ps[0].cpu = true;
  assert.equal(s.players[0].cpu, false);
  s.dispose();
  s.setInputAllowed(true);
  s.setReady(0);
  s.step(bits(0, 0x3000), true);
  assert.equal(s.phase, 'disposed');
  assert.equal(s.inputAllowed, false);
  assert.equal(s.ready.size, 0);
});
test('빌린 texture 교체·해제는 소유자 자원을 파괴하지 않음', () => {
  let destroyed = 0;
  const a = { dispose() { destroyed++; } };
  const b = { dispose() { destroyed++; } };
  const textures = new Map([['other', a]]);
  const slot = new BorrowedPreviewSlot(textures);
  slot.set(a);
  assert.equal(textures.get(MG_INST_PREVIEW_KEY), a);
  slot.set(b);
  assert.equal(textures.get(MG_INST_PREVIEW_KEY), b);
  slot.set(null);
  assert.equal(slot.connected, false);
  slot.set(a);
  slot.dispose();
  slot.dispose();
  slot.set(b);
  assert.equal(textures.has(MG_INST_PREVIEW_KEY), false);
  assert.equal(textures.get('other'), a);
  assert.equal(destroyed, 0);
});

function rig(overrides: Partial<MgInstOptions> = {}) {
  let disposed = 0;
  let completed = 0;
  let polled = 0;
  let begins = 0;
  let ends = 0;
  let draws = 0;
  let trigger = 0;
  const all = spec as LayoutDocument;
  const r2d = { dynamic: new Map<string, THREE.Texture>(), draw(inst: LayoutInst) {
    draws++;
    for (const pane of inst.nodes) assert.ok([...pane.t, ...pane.z, ...pane.s, pane.a].every(Number.isFinite), `${inst.name}/${pane.spec.n}`);
  } } as unknown as Render2D;
  const host = { spec, all, r2d,
    layout: (name: string) => new LayoutInst(name, all.layouts[name], all),
    begin() { begins++; }, draw: (inst: LayoutInst) => r2d.draw(inst), end() { ends++; },
    dispose() { disposed++; },
  } as unknown as MgmView;
  const screen = new MgInstScreen(host, assets, {
    canvas: {} as HTMLCanvasElement, assets: { url: p => p }, game: 'mg0905', players,
    pads: { poll() { polled++; return { hold: trigger, trig: trigger }; } },
    onReady() { completed++; }, ...overrides,
  });
  return { screen, r2d, counts: () => ({ disposed, completed, polled, begins, ends, draws }),
    trigger(bits: number) { trigger = bits; },
    enter() { for (let i = 0; i < 300 && screen.phase === 'entering'; i++) screen.step(); assert.equal(screen.phase, 'ready'); },
  };
}
for (const layout of READY_GROUPS) test(`실제 ${layout} 구성·얼굴 mask·문자·준비`, () => {
  const ps = Array.from({ length: READY_CAPACITY[layout] }, (_, pid) => ({ pid, cpu: pid !== 0, character: `pc0${pid + 1}` }));
  const r = rig({ layout, players: ps });
  assert.equal(r.screen.view.tiles.length, ps.length);
  for (const group of READY_GROUPS) assert.equal(node(r.screen.view.base, `x_${group}`).v, layout === group);
  assert.equal(node(r.screen.view.base, 'pos_play/P_pict_01').v, false);
  assert.equal(texture(r.screen.view.tiles[0], 'x_face_pc128', 1), 'face_128_pc01^u');
  assert.equal(texture(r.screen.view.tiles[0], 'x_face_pc128', 0), undefined);
  assert.ok(r.screen.view.rule.inst!.texts.size > 0);
  assert.equal(node(r.screen.view.operation, 'x_text_null_02').v, false);
  r.enter();
  r.screen.render();
  assert.equal(r.counts().begins, 1);
  assert.equal(r.counts().ends, 1);
  assert.ok(r.counts().draws >= 6);
  r.screen.dispose();
});
test('인원과 ready 배치의 계약 검사', () => {
  assert.throws(() => rig({ layout: '1vs1' }), /too many players/);
  const r = rig({ players: players.slice(0, 1) });
  assert.equal(node(r.screen.view.base, 'vs4_01p').v, false);
  r.screen.dispose();
});
test('화면 외부 gate·완료 1회·CPU 최종 표시·해제 1회', () => {
  const r = rig();
  r.trigger(0x3000);
  r.enter();
  for (let i = 0; i < 60; i++) r.screen.step();
  assert.equal(r.screen.state.ready.size, 0);
  assert.equal(r.counts().polled, 0);
  r.screen.setInputAllowed(true);
  r.screen.step();
  assert.equal(r.screen.phase, 'ending');
  for (let i = 0; i < 90; i++) r.screen.step();
  assert.equal(r.counts().completed, 1);
  assert.equal(r.screen.view.tiles[1].current, 'ok');
  r.screen.dispose();
  r.screen.dispose();
  r.screen.step();
  r.screen.render();
  assert.equal(r.counts().disposed, 1);
  assert.equal(r.counts().completed, 1);
});
test('단독 화면의 intro 근사 gate는 명시 옵션', () => {
  const r = rig({ inputGate: 'layoutIntroApprox' });
  r.enter();
  assert.equal(r.screen.state.inputAllowed, true);
  assert.equal(r.screen.state.ready.size, 0);
  r.trigger(0x2000);
  r.screen.step();
  assert.equal(r.screen.phase, 'ending');
  r.screen.dispose();
});
test('화면의 preview slot1·빌림·늦은 연결 무시', () => {
  const r = rig();
  let destroyed = 0;
  const tex = { dispose() { destroyed++; } } as unknown as THREE.Texture;
  r.screen.setPreviewTexture(tex);
  assert.equal(node(r.screen.view.base, 'pos_play/P_pict_01').v, true);
  assert.equal(texture(r.screen.view.base, 'pos_play/P_pict_01', 1), MG_INST_PREVIEW_KEY);
  assert.equal(texture(r.screen.view.base, 'pos_play/P_pict_01', 0), undefined);
  r.screen.setPreviewTexture(null);
  assert.equal(node(r.screen.view.base, 'pos_play/P_pict_01').v, false);
  r.screen.setPreviewTexture(tex);
  r.screen.dispose();
  r.screen.setPreviewTexture(tex);
  assert.equal(r.r2d.dynamic.size, 0);
  assert.equal(destroyed, 0);
});
test('동일 입력 → 상태와 Lyt snapshot 해시 일치', () => {
  const run = (): string => {
    const r = rig({ inputGate: 'layoutIntroApprox' });
    const hash = createHash('sha256');
    for (let i = 0; i < 180; i++) {
      r.trigger(i === 100 ? 0x2000 : 0);
      r.screen.step();
      hash.update(JSON.stringify([r.screen.phase, [...r.screen.state.ready], r.screen.state.elapsed,
        r.screen.view.base.nodes.map(n => [n.t, n.r, n.s, n.a, n.v]), r.screen.view.tiles.map(t => [t.current, t.nodes.map(n => [n.t, n.s, n.a, n.v])])]));
    }
    assert.equal(r.counts().completed, 1);
    r.screen.dispose();
    return hash.digest('hex');
  };
  assert.equal(run(), run());
});
test('안내 제목·문구·구분선은 어두운 색', () => {
  const r = rig();
  for (const layout of [r.screen.view.operation, r.screen.view.advantage])
    for (const pane of layout.nodes.filter(n => n.spec.k === 'txt' || n.spec.n === 'line'))
      assert.deepEqual(pane.vc, Array.from({ length: 4 }, () => [7, 2, 3, 255]));
  const textNodes = r.screen.view.operationLines[0].inst!.nodes.filter(n => n.spec.k === 'txt');
  assert.ok(textNodes.length > 0);
  for (const pane of textNodes) assert.deepEqual(pane.vc[0], [7, 2, 3, 255]);
  r.screen.dispose();
});
test('단색 조작 아이콘 tint는 opt-in, 공용 컬러 아이콘 기본 유지', () => {
  const r = rig();
  const layout = r.screen.view.operation;
  const original = new RichTextPane(spec, layout, 'x_text_opr_03');
  original.set(parseMessage('\uE015', {}));
  assert.deepEqual(original.inst!.nodes[1].vc[0], [255, 255, 255, 255]);
  const tinted = new RichTextPane(spec, layout, 'x_text_opr_04', 0, true, 'paneTint');
  tinted.set(parseMessage('\uE015', {}));
  assert.deepEqual(tinted.inst!.nodes[1].vc[0], [7, 2, 3, 255]);
  r.screen.dispose();
});
test('원본 안내 부품·폰트·제목 중앙·조작 순서·어드밴티지 아이콘', () => {
  const r = rig();
  const view = r.screen.view;
  assert.equal(view.guide.name, 'sys_mg_operation_01');
  assert.equal(view.operation.name, 'sys_mg_operation_00');
  assert.equal(view.operationHeader.name, 'sys_mg_operation_02');
  assert.equal(node(view.base, 'x_parts_opr').v, false);
  assert.equal(node(view.operationHeader, 'x_hold_00').v, false);
  assert.equal(node(view.operationHeader, 'x_hold_01').v, false);
  assert.equal(node(view.operationHeader, 'x_text_00').t[0], 0);
  assert.deepEqual(node(view.operationHeader, 'x_text_00').spec.txt!.fs, [65, 65]);
  assert.equal(node(view.operation, 'x_text_opr_00').spec.txt!.font, 'bqfont_small');
  assert.deepEqual(node(view.operation, 'x_text_opr_00').spec.txt!.fs, [49.400002, 49.400002]);
  assert.equal(node(view.advantage, 'x_text_01').spec.txt!.fs[0], 40);
  assert.equal(node(view.advantage, 'x_icon_null').v, true);
  assert.equal(node(view.advantage, 'icon').v, true);
  assert.equal(node(view.advantage, 'x_icon_shadow').v, false);
  assert.equal(node(view.advantage, 'x_title_null_01').v, true);
  assert.equal(node(view.operation, 'x_title_null_00').v, false);
  const positions = ['x_parts_opr/x_text_00', 'x_parts_opr/line',
    'x_operation_top_00/x_text_opr_00', 'x_operation_top_00/x_text_opr_01',
    'x_operation_top_01/x_text_01', 'x_operation_top_01/x_line', 'x_operation_top_01/x_text_opr_06']
    .map(path => paneGlobal(view.guide, path)!.m[5]);
  for (let i = 1; i < positions.length; i++) assert.ok(positions[i - 1] > positions[i], `${i}: ${positions}`);
  assert.equal(positions[2] - positions[3], 56);
  assert.equal(positions[2] + paneGlobal(view.base, 'x_opr')!.m[5], 335);
  const mat = view.advantage.spec.mats[node(view.advantage, 'icon').spec.m!];
  assert.equal(mat.tex[0].name, 'sys_pause_post_icon_00^q');
  assert.deepEqual(node(view.advantage, 'x_line').uv, [0, 0, 53, 0, 0, 1, 53, 1]);
  r.screen.dispose();
});
test('체감 안내 controller의 세로 hold 표시, 어드밴티지 없으면 숨김', () => {
  const r = rig({ game: 'mg1801' });
  assert.equal(node(r.screen.view.operationHeader, 'x_hold_00').v, false);
  assert.equal(node(r.screen.view.operationHeader, 'x_hold_01').v, true);
  assert.equal(r.screen.view.advantage.visible, false);
  r.screen.dispose();
});
test('어드밴티지 아이콘·OK visibility·준비 애니메이션 유지', () => {
  const r = rig({ players: players.map(p => ({ ...p, cpu: p.pid >= 2 })) });
  r.enter();
  assert.equal(node(r.screen.view.tiles[0], 'x_promoter_icon').a, 255);
  assert.equal(node(r.screen.view.tiles[1], 'x_promoter_icon').v, false);
  assert.equal(node(r.screen.view.tiles[0], 'null_ok').v, false);
  r.screen.setInputAllowed(true);
  r.trigger(0x2000);
  r.screen.step();
  for (let i = 0; i < 20; i++) { r.trigger(0); r.screen.step(); }
  const tile = r.screen.view.tiles[0];
  assert.equal(tile.current, 'normal_01');
  assert.equal(node(tile, 'null_ok').v, true);
  assert.equal(node(tile, 'base_00').v, true);
  assert.equal(node(tile, 'base_03').v, false);
  assert.equal(node(tile, 'x_ok_02').a, 255);
  assert.equal(node(tile, 'x_promoter_icon').a, 255);
  r.screen.dispose();
});
test('원본 얼굴 UV 2개를 실제 renderer attribute로 전달', () => {
  const layout = assets.layouts.sys_mginst_ok;
  const face = layout.nodes.find(n => n.n === 'x_face_pc128')!;
  assert.deepEqual(face.uv, [0, 0, 2, 0, 0, 2, 2, 2]);
  assert.deepEqual(face.uv1, [0, 0, 1, 0, 0, 1, 1, 1]);
  const isolated = { ...layout, nodes: [{ ...face, p: -1 }], anims: {} };
  const providers: LayoutRenderProviders = {
    loadUiImage: async () => ({ width: 128, height: 128 }), textureFromImage: () => new THREE.Texture(),
    resolveFonts: async () => undefined, sheetTexture: () => null, rasterText: () => null,
  };
  const renderer = new LayoutRenderer(spec, providers);
  const inst = new LayoutInst('face', isolated, spec);
  renderer.draw(inst);
  const mesh = renderer.scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  assert.deepEqual(Array.from(mesh.geometry.getAttribute('uv').array), face.uv);
  assert.deepEqual(Array.from(mesh.geometry.getAttribute('uv1').array), face.uv1);
  assert.match(mesh.material.fragmentShader, /srt1 \* vec3\(vUv1,/);
  delete inst.nodes[0].uv1;
  renderer.begin(); renderer.draw(inst);
  assert.deepEqual(Array.from(mesh.geometry.getAttribute('uv1').array), face.uv);
  const target = new THREE.Texture();
  target.userData.flipV = true;
  let disposed = 0;
  target.addEventListener('dispose', () => disposed++);
  renderer.dynamic.set('borrowed', target);
  inst.setTexture('x_face_pc128', 1, 'borrowed');
  renderer.begin(); renderer.draw(inst);
  assert.deepEqual(mesh.material.uniforms.srt0.value.elements.map((x: number) => x || 0), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual(mesh.material.uniforms.srt1.value.elements.map((x: number) => x || 0), [1, 0, 0, 0, -1, 0, 0, 1, 1]);
  renderer.dispose();
  assert.equal(disposed, 0);
  target.dispose();
});
test('system/mginst import 허용 목록·게임 실행 및 환경 시계 경계', () => {
  const dir = join(WEB, 'script/app/scene/system/mginst');
  const allowed = new Set(['three', '@app/common/ui/text', '@app/common/ui/itemLayout', '@app/common/ui/types',
    '@app/common/ui/layout/render', '@app/common/ui/view', '@game/lib/layout']);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
    const src = readFileSync(join(dir, file), 'utf8');
    for (const match of src.matchAll(/(?:import|export)[^'";]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const path = match[1] ?? match[2];
      assert.ok(/^\.\/[^/]+$/.test(path) || allowed.has(path), `${file}: ${path}`);
    }
    assert.ok(!/Math\.random|Date\.now|performance\.now|new\s+.*WebGLRenderer/.test(src), file);
  }
});

console.log(`mginst: ${pass}/${pass + fail} 통과`);
if (fail) process.exitCode = 1;
