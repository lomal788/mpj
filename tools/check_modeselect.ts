/**
 * 모드 선택 명세 검사 — (1) assets/modeselect/spec.json 을 원본 덤프(extracted/converted/ui/menu01·bq_Parts)·메시지(koKR)·
 * nro 표(web/tools/analysis/modesel_tables.py)와 대조, (2) 화면 좌표 계산(docs 6절·캡처 대조 값), (3) 모듈 import 그래프에
 * 엔진층(script/core·games·view)이 없는지 확인한다.
 *
 *   npx tsx tools/check_modeselect.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeMatrix } from '@app/scene/menu/charselect/render2d';
import { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { resolveFontsFromDisk, sheetFilesMissing } from './fontSpecNode';
import type { ModeSpec } from '@app/scene/menu/modeselect/types';
const legacySpec = (s: string): string => s.replace(/^(\.\.\/)+shell\/(mgmcommon|stage3d)/, '../$2').replace(/^@app\/common\/ui(?=\/|$)/, '../mgmcommon').replace(/^@app\/common\/render3d(?=\/|$)/, '../stage3d').replace(/^@app\/minigame\/frame\/scene(?=\/|$)/, '../mgscene').replace(/^@app\/minigame\/frame\/result(?=\/|$)/, '../mgresult').replace(/^@app\/minigame\/frame\/stage(?=\/|$)/, '../mgstage').replace(/^@app\/scene\/mode\/freeplay(?=\/|$)/, '../mgm01').replace(/^@app\/scene\/(?:menu|world|mode)\//, '../');

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(WEB, '..');
const DUMPS = [join(ROOT, 'extracted/converted/ui/menu01'), join(ROOT, 'extracted/converted/ui/bq_Parts')];
const spec = JSON.parse(readFileSync(join(WEB, 'assets/modeselect/spec.json'), 'utf8')) as ModeSpec;
await resolveFontsFromDisk(spec.fonts as Record<string, unknown>, join(WEB, 'assets/modeselect'));

let fails = 0;
let count = 0;
const ok = (c: boolean, m: string): void => {
  count++;
  if (!c) {
    fails++;
    console.log('  실패:', m);
  }
};
const near = (a: number, b: number, e = 1e-3): boolean => Math.abs(a - b) <= e;
const O: Record<string, number> = { left: -1, center: 0, right: 1, top: 1, bottom: -1 };
const dumpFile = (f: string): string | undefined => DUMPS.map((d) => join(d, f)).find(existsSync);

interface DumpPane {
  type: string;
  name: string;
  visible: boolean;
  alpha: number;
  translate: number[];
  scale: number[];
  size: number[];
  origin: string[];
  children: DumpPane[];
}

console.log('1. 레이아웃 노드 대조 (원본 덤프, 변환기가 만든 창 조각 #… 제외)');
let nodesChecked = 0;
for (const [name, lay] of Object.entries(spec.layouts)) {
  const f = dumpFile(`${name}.bflyt.json`);
  if (!f) {
    ok(false, `${name} 덤프 없음`);
    continue;
  }
  const d = JSON.parse(readFileSync(f, 'utf8')) as { root: DumpPane };
  const flat: DumpPane[] = [];
  const walk = (p: DumpPane): void => {
    flat.push(p);
    p.children.forEach(walk);
  };
  walk(d.root);
  const real = lay.nodes.filter((n) => !n.n.includes('#'));
  ok(flat.length === real.length, `${name} 노드 수 ${real.length} != ${flat.length}`);
  flat.forEach((p, i) => {
    const n = real[i];
    if (!n) return;
    nodesChecked++;
    ok(n.n === p.name, `${name}[${i}] 이름 ${n.n} != ${p.name}`);
    ok(near(n.t[0], p.translate[0]) && near(n.t[1], p.translate[1]), `${name}/${p.name} 위치`);
    ok(near(n.z[0], p.size[0]) && near(n.z[1], p.size[1]), `${name}/${p.name} 크기`);
    ok(near(n.s[0], p.scale[0]) && near(n.s[1], p.scale[1]), `${name}/${p.name} 배율`);
    ok(n.a === p.alpha && n.v === p.visible, `${name}/${p.name} 알파·보임`);
    ok(n.o[0] === O[p.origin[0]] && n.o[1] === O[p.origin[1]], `${name}/${p.name} 원점`);
  });
  // 창 조각: 크기 합 = 원래 창
  for (const sw of (spec.split ?? {})[name] ?? []) {
    const pi = lay.nodes.findIndex((n) => n.n === sw.n);
    const pieces = lay.nodes.filter((n) => n.p === pi && n.n.startsWith(`${sw.n}#`));
    const w = pieces.filter((n) => /#(LT|T|RT)$/.test(n.n)).reduce((a, n) => a + n.z[0], 0);
    const h = pieces.filter((n) => /#(LT|L|LB)$/.test(n.n)).reduce((a, n) => a + n.z[1], 0);
    ok(pieces.length === 9 && near(w, lay.nodes[pi].z[0]) && near(h, lay.nodes[pi].z[1]), `${name}/${sw.n} 창 조각 9장 크기 합 ${w}×${h}`);
  }
}
console.log(`   노드 ${nodesChecked}개`);

console.log('2. 애니 길이 대조');
for (const [name, lay] of Object.entries(spec.layouts)) {
  for (const [tag, a] of Object.entries(lay.anims)) {
    const f = dumpFile(`${name}_${tag}.bflan.json`) ?? dumpFile(`${name}.bflan.json`);
    if (!f) {
      ok(false, `${name} ${tag} 덤프 없음`);
      continue;
    }
    const d = JSON.parse(readFileSync(f, 'utf8')) as { frameSize: number; loop: boolean };
    ok(a.len === d.frameSize && a.loop === d.loop, `${name} ${tag} 길이 ${a.len}/${d.frameSize}`);
  }
}
const btnA = spec.layouts.mn01_btn_map_00.anims;
ok(btnA.on.len === 9 && btnA.press.len === 19 && btnA.miss.len === 20 && btnA.cursor.len === 30 && btnA.cursor.loop, '버튼 on 9·press 19·miss 20·cursor 30 반복 (docs 6절)');
ok(spec.layouts.mn01_base_map_00.anims.in.len === 15 && spec.layouts.mn01_base_map_00.anims.out.len === 5, 'base in 15·out 5');
ok(!spec.layouts.mn01_base_map_00.anims.normal_00, '"normal_00" 태그 없음 (docs 3절)');

console.log('3. 모드 표 ↔ nro 표·메시지');
{
  const out = execFileSync(join(ROOT, '.venv/Scripts/python'), [join(WEB, 'tools/analysis/modesel_tables.py')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const list = (key: string): string[] => JSON.parse(out.split('\n').find((l) => l.startsWith(key))!.split(':').slice(1).join(':').trim().replace(/'/g, '"'));
  const names = list('name lbl');
  const details = list('detail lbl');
  ok(spec.modes.length === 9, '모드 9칸');
  spec.modes.forEach((m, i) => {
    ok(m.button === i, `버튼 번호 ${i}`);
    ok(m.name === names[i], `버튼 ${i} 이름 라벨 ${m.name} = ${names[i]}`);
    ok(m.detail === details[i], `버튼 ${i} 설명 라벨 ${m.detail} = ${details[i]}`);
    ok(m.joycon === (i >= 1 && i <= 3), `버튼 ${i} 조이콘`);
  });
  const msg: Record<string, string> = {};
  for (const f of ['im_common.json', 'im_menu.json', 'menu01_mode.json', 'system.json']) Object.assign(msg, JSON.parse(readFileSync(join(ROOT, 'extracted/message/koKR', f), 'utf8')));
  for (const [k, v] of Object.entries(spec.texts)) ok(msg[k] === v, `문구 ${k}`);
  const expect = ['마리오 파티', '리듬 쿠킹', '키노피오 공장', '펄럭펄럭 어드벤처', '쿠파 버스터즈', '쿠파 애슬론', '미니게임 항구', '파티 지원 여행', '광장'];
  ok(spec.modes.map((m) => spec.texts[m.name]).join() === expect.join(), `모드 이름 순서 ${spec.modes.map((m) => spec.texts[m.name]).join(',')}`);
  ok(spec.texts.im_mn_mode00_detail.startsWith('주사위를 두드려 전진하는'), '마리오 파티 설명 = 캡처 문구');
  const win = ['x_win_00', 'x_win_03', 'x_win_04', 'x_win_02', 'x_win_05', 'x_win_06', 'x_win_01', 'x_win_07', 'x_win_08'];
  const icon = ['00', '03', '04', '02', '05', '06', '01', '07', '07'].map((s) => `x_icon_mode_${s}`);
  ok(spec.modes.map((m) => m.win).join() === win.join(), '사진 창 대응 (Cursor 판독)');
  ok(spec.modes.map((m) => m.icon).join() === icon.join(), '섬 아이콘 대응 (GetMapIconPane 판독)');
  ok(spec.modes.map((m) => m.next).join() === '2,5,7,6,4,8,3,-2,-3', '다음 시퀀스 (MapMenuImpl 판독)');
}

console.log('4. 사진 창 그림·테두리 덮어쓰기');
{
  const pm = spec.partMats.mn01_pict_map_00;
  for (let k = 0; k < 9; k++) {
    const e = pm.find((x) => x.part === `x_win_0${k}` && x.pane === 'pict_mode');
    ok(!!e && e.tex[0] === `mn01_pict_mode_0${k}^o` && e.tex[1] === 'mn01_base_thumbnail_00^s', `x_win_0${k} 그림 = mn01_pict_mode_0${k}`);
    const t = pm.find((x) => x.part === `x_win_0${k}` && x.pane === 'base#T')!;
    const b = pm.find((x) => x.part === `x_win_0${k}` && x.pane === 'base#B')!;
    const tail = k === 0 ? t : b;
    ok(tail.tex[0] === 'mn01_win_thumbnail_01^q' && tail.srt[0].t[0] < -4, `x_win_0${k} 꼬리 ${k === 0 ? '위' : '아래'} (SRT ${tail.srt[0].t[0].toFixed(1)})`);
  }
  for (const tn of Object.values(spec.textures)) ok(existsSync(join(WEB, 'assets/modeselect', tn)), `텍스처 파일 ${tn}`);
  for (let k = 0; k < 9; k++) ok(!!spec.textures[`mn01_pict_mode_0${k}^o`], `그림 텍스처 0${k}`);
}

console.log('5. 화면 좌표 (docs 6절, 캡처 계산)');
{
  const all = spec as unknown as Spec;
  const base = new LayoutInst('mn01_base_map_00', spec.layouts.mn01_base_map_00, all);
  const at = (p: string): [number, number] => {
    const m = nodeMatrix(base, p)!;
    return [960 + m[2], 540 - m[5]];
  };
  const eqp = (p: string, x: number, y: number): void => {
    const [ax, ay] = at(p);
    ok(near(ax, x, 0.01) && near(ay, y, 0.01), `${p} 화면 (${ax}, ${ay}) = (${x}, ${y})`);
  };
  eqp('x_btn_00', 470, 176);
  eqp('x_btn_08', 470, 904);
  eqp('x_parts_map', 1300, 492);
  eqp('x_text_mess', 1300, 904);
  eqp('x_parts_map/x_win_00', 1301, 584);
  ok(spec.align.top === 364 && spec.align.pitch === 91, `정렬 첫 칸 364·간격 91 (${spec.align.top}, ${spec.align.pitch})`);
  // 캡처: 배율 0.7187, 왼쪽 539·위 34 잘림 → 첫 버튼 y 101, 8번째 보이는 버튼 y 560, 지도 중심 y 329, 설명 y ≈ 623
  const cap = (y: number): number => (y - 34) * 0.7187;
  ok(Math.abs(cap(176) - 101) < 2, `첫 버튼 캡처 y ${cap(176).toFixed(1)} ≈ 101`);
  ok(Math.abs(cap(540 - (364 - 91 * 7)) - 560) < 2, `8번째 버튼 캡처 y ${cap(540 - (364 - 91 * 7)).toFixed(1)} ≈ 560`);
  ok(Math.abs(cap(492) - 329) < 2, `지도 중심 캡처 y ${cap(492).toFixed(1)} ≈ 329`);
}

console.log('5b. 메뉴 창(패널)·그림자·흐림 창 (docs 6.2)');
{
  const d = JSON.parse(readFileSync(join(DUMPS[0], 'mn01_base_map_00.bflyt.json'), 'utf8')) as { root: DumpPane & { userData?: Record<string, number[]>; content?: { vtxColors: string[] }; windowFlags?: number } };
  const find = (p: DumpPane, n: string): (DumpPane & { userData?: Record<string, number[]>; content?: { vtxColors: string[] }; windowFlags?: number }) | undefined => {
    if (p.name === n) return p;
    for (const c of p.children) {
      const r = find(c, n);
      if (r) return r;
    }
    return undefined;
  };
  const blur = find(d.root, 'blur')!;
  const z = (spec.zabuton ?? {}).mn01_base_map_00 ?? [];
  ok(z.length === 1 && z[0].pane === 'blur' && JSON.stringify(z[0].slots) === JSON.stringify(blur.userData?.BexZabutonBlurred), `BexZabutonBlurred 칸 ${JSON.stringify(z[0]?.slots)} = 덤프 ${JSON.stringify(blur.userData?.BexZabutonBlurred)}`);
  const L = spec.layouts.mn01_base_map_00;
  const win = L.nodes.find((n) => n.n === 'win')!;
  const sh = L.nodes.find((n) => n.n === 'win_shadow#LT')!;
  ok(win.a === 50 && win.ia, '반투명 흰 패널: win 알파 50, 조각에 전파');
  ok(sh.vc!.every((c) => c[0] === 0 && c[1] === 0 && c[2] === 0) && find(d.root, 'win_shadow')!.content!.vtxColors.every((c) => c === '#000000ff'), '그림자 정점색 검정(프레임 조각까지)');
  const pieces = L.nodes.filter((n) => n.n.startsWith('blur#') && !n.n.endsWith('#C'));
  ok(new Set(pieces.map((n) => n.m)).size === 8 && pieces.every((n) => L.mats[n.m!].name.includes('#')), '흐림 창 프레임 조각마다 재질 사본');
  const edge = 960 + 1916 / 2 - 22;
  ok(Math.abs(edge - (539 + 975 / 0.7187)) < 2, `패널 오른쪽 가장자리 화면 ${edge} ≈ 캡처 x 975 → ${(539 + 975 / 0.7187).toFixed(1)}`);
  ok(Math.abs(540 + 1076 / 2 - 22 - (34 + 735 / 0.7187)) < 3, `패널 아래 가장자리 ${540 + 1076 / 2 - 22} ≈ 캡처 y 735 → ${(34 + 735 / 0.7187).toFixed(1)}`);
}

console.log('6. 글리프·소리');
{
  const need: Record<string, string> = {
    bqfont_middle: spec.modes.map((m) => spec.texts[m.name]).join('') + spec.texts.mn01_mode_ctrl_close,
    bqfont_small: spec.modes.map((m) => spec.texts[m.detail]).join(''),
  };
  for (const [fam, s] of Object.entries(need)) {
    const g = spec.fonts[fam].glyphs;
    const miss = [...new Set([...s])].filter((c) => c !== '\r' && c !== '\n' && !g[c]);
    ok(miss.length === 0, `${fam} 글리프 빠짐 ${miss.join('')}`);
    ok(sheetFilesMissing(spec.fonts[fam]).length === 0, `${fam} 공용 글꼴 시트`);
  }
  ok(!!spec.fonts.bqfont_small.glyphs['']?.color, '스타 아이콘 U+E021 = 컬러 글리프');
  for (const l of ['SQ_SE_SYS_CURSOR', 'SQ_SE_SYS_DECI', 'SQ_SE_SYS_ERROR', 'SQ_SE_SYS_CANCEL']) {
    const s = spec.sounds[l];
    ok(!!s && existsSync(join(WEB, 'assets/modeselect', s.file)), `소리 ${l}`);
  }
  ok(near(spec.sounds.SQ_SE_SYS_ERROR.gain, 60 / 127, 1e-3) && near(spec.sounds.SQ_SE_SYS_CURSOR.gain, 110 / 127, 1e-3), 'SE 볼륨');
}

console.log('7. import 그래프 (독립성)');
{
  const dir = join(WEB, 'script/app/scene/menu/modeselect');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  const SHARED = new Set(['../charselect/scene2d', '../charselect/render2d', '../charselect/state', '../charselect/types']);
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const s = legacySpec(m[1] ?? m[2]);
      const allowed = (s.startsWith('./') && !s.includes('..')) || SHARED.has(s) || s === 'three';
      ok(allowed, `${f}: 금지 import '${s}'`);
    }
  }
  console.log(`   파일 ${files.length}개`);
}

console.log(`${count - fails}/${count} 통과`);
if (fails) process.exit(1);
