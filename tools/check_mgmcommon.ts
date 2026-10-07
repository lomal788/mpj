/**
 * 미니게임 모드 공용 UI 명세 검사 — (1) assets/mgmcommon/{spec,mgmet,mgm01}.json 레이아웃 노드·애니 길이를 원본 덤프
 * (extracted/converted/ui/mgm00·bq_Parts, analysis/mgmet_layout·mgm01_layout)와 대조, (2) 문서 표 값(mgm_common.md 7.1·7.3, message_window.md 4.2·4.3·6.1,
 * mgmet_flow.md 7.1, mgm01_freeplay.md 7절), (3) 메시지 문구·속성(koKR json, analysis/msgwin_atr_koKR.txt), (4) 글꼴·텍스처·소리 파일,
 * (5) 모듈 import 그래프(mgm_common.md 9.1 경계)를 확인한다.
 *
 *   npx tsx tools/check_mgmcommon.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeMatrix } from '../script/shell/charselect/render2d';
import { LayoutInst } from '../script/shell/charselect/scene2d';
import type { Spec } from '../script/shell/charselect/types';
import { MGM_BGM_KIND, mergeSpec, setPlace, type MgmSpec, type MgmSpecPart } from '../script/shell/mgmcommon';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(WEB, '..');
const A = join(WEB, 'assets/mgmcommon');
const DUMPS = [join(ROOT, 'extracted/converted/ui/mgm00'), join(ROOT, 'extracted/converted/ui/bq_Parts'), join(ROOT, 'analysis/mgmet_layout'), join(ROOT, 'analysis/mgm01_layout')];
const spec = JSON.parse(readFileSync(join(A, 'spec.json'), 'utf8')) as MgmSpec;
const parts: Record<string, MgmSpecPart> = {
  mgmet: JSON.parse(readFileSync(join(A, 'mgmet.json'), 'utf8')) as MgmSpecPart,
  mgm01: JSON.parse(readFileSync(join(A, 'mgm01.json'), 'utf8')) as MgmSpecPart,
};
const merged = mergeSpec(mergeSpec(spec, parts.mgmet), parts.mgm01);

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
  layoutFile?: string;
  children: DumpPane[];
}

console.log('1. 레이아웃 노드 대조 (원본 덤프, 변환기가 만든 창 조각 #… 제외)');
let nodesChecked = 0;
let layoutsChecked = 0;
for (const [name, lay] of Object.entries(merged.layouts)) {
  const f = dumpFile(`${name}.bflyt.json`);
  if (!f) {
    ok(false, `${name} 덤프 없음`);
    continue;
  }
  layoutsChecked++;
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
    if (p.type === 'prt1') ok(n.part === p.layoutFile && !!merged.layouts[n.part!], `${name}/${p.name} 부품 ${p.layoutFile} 명세에 있음`);
  });
  for (const sw of merged.split[name] ?? []) {
    const pi = lay.nodes.findIndex((n) => n.n === sw.n);
    const pieces = lay.nodes.filter((n) => n.p === pi && n.n.startsWith(`${sw.n}#`));
    const w = pieces.filter((n) => /#(LT|T|RT)$/.test(n.n)).reduce((a, n) => a + n.z[0], 0);
    const h = pieces.filter((n) => /#(LT|L|LB)$/.test(n.n)).reduce((a, n) => a + n.z[1], 0);
    ok(pieces.length === 9 && near(w, sw.w) && near(h, sw.h), `${name}/${sw.n} 창 9조각 크기 합`);
  }
}
console.log(`   레이아웃 ${layoutsChecked}개, 노드 ${nodesChecked}개`);

console.log('2. 애니 길이·반복 (원본 bflan 덤프)');
let animsChecked = 0;
for (const [name, lay] of Object.entries(merged.layouts)) {
  for (const [tag, an] of Object.entries(lay.anims)) {
    const f = dumpFile(`${name}_${tag}.bflan.json`) ?? dumpFile(`${name}.bflan.json`);
    if (!f) {
      ok(false, `${name} ${tag} 애니 덤프 없음`);
      continue;
    }
    const d = JSON.parse(readFileSync(f, 'utf8')) as { frameSize: number; loop: boolean };
    ok(an.len === d.frameSize && an.loop === d.loop, `${name} ${tag} 길이 ${an.len}/${d.frameSize} 반복 ${an.loop}/${d.loop}`);
    animsChecked++;
  }
}
const animCount = (dir: string, pre: string[]): number => readdirSync(dir).filter((x) => x.endsWith('.bflan.json') && pre.some((p) => x.startsWith(p))).length;
ok(Object.entries(spec.layouts).filter(([n]) => n.startsWith('mgm00_')).reduce((a, [, l]) => a + Object.keys(l.anims).length, 0) === 56, 'mgm00 애니 56개(7.1)');
ok(Object.keys(spec.layouts).filter((n) => n.startsWith('mgm00_')).length === 20, 'mgm00 레이아웃 20개(7.1)');
ok(Object.keys(parts.mgmet.layouts).length === 34 && Object.keys(parts.mgm01.layouts).length === 16, 'mgmet 34·mgm01 16 레이아웃');
ok(animCount(join(ROOT, 'analysis/mgm01_layout'), ['mgm01_']) === Object.values(parts.mgm01.layouts).reduce((a, l) => a + Object.keys(l.anims).length, 0), 'mgm01 애니 수 = 덤프 수');
console.log(`   애니 ${animsChecked}개`);

console.log('3. 문서 표 값');
{
  const L = merged.layouts;
  const len = (n: string, t: string): number => L[n]?.anims[t]?.len ?? -1;
  const lp = (n: string, t: string): boolean => !!L[n]?.anims[t]?.loop;
  const expect: [string, string, number, boolean?][] = [
    ['mgm00_base_mgmstat_00', 'in', 10],
    ['mgm00_base_mgmstat_00', 'out', 7],
    ['mgm00_base_mgresult_00', 'in', 30],
    ['mgm00_base_mgresult_00', 'out_right', 28],
    ['mgm00_base_mgselect_00', 'roulette_out', 30],
    ['mgm00_cursor_00', 'left_select', 8],
    ['mgm00_cursor_around_00', 'normal', 30, true],
    ['mgm00_tlp_course_00', 'in', 15],
    ['mgm00_tlp_course_01', 'in_left', 15],
    ['mgm00_tlp_course_01', 'out_right', 15],
    ['mgm00_tlp_result_00', 'in', 35],
    ['mgm00_tlp_result_00', 'out', 5],
    ['mgm00_lineup_thum_00', 'cursor', 80],
    ['mgm00_mgmstat_00', 'top', 90, true],
    ['mgm00_mgresult_star_00', 'star_get', 50],
    ['sys_meswin_00', 'in', 5],
    ['sys_meswin_00', 'normal', 1],
    ['sys_meswin_00', 'out', 5],
    ['sys_meswin_arrowicon_00', 'normal', 120, true],
    ['sys_meswin_choices_00', 'in_choice', 30],
    ['sys_meswin_arrowchoices_00', 'on', 9],
    ['sys_meswin_arrowchoices_00', 'cursor', 119, true],
    ['sys_meswin_arrowchoices_00', 'press', 29],
    ['mgmet_act_title_00', 'in', 6],
    ['mgmet_act_title_00', 'normal', 30, true],
    ['mgmet_act_title_00', 'out', 6],
    ['mgmet_act_title_00', 'act', 6],
    ['mgmet_act_title_00', 'act_normal', 0],
    ['mgmet_act_title_00', 'act_out', 4],
    ['mgmet_act_title_00', 'press', 6],
    ['mgmet_act_title_00', 'left_select_01', 4],
    ['mgmet_act_title_00', 'right_select_00', 18],
    ['mgmet_act_img_00', 'in', 5],
    ['mgmet_act_img_00', 'out', 5],
    ['mgmet_base_playinfo_freeplay_00', 'in', 10],
    ['mgmet_base_playinfo_freeplay_00', 'out', 3],
    ['mgm01_base_freeplay_00', 'in', 10],
    ['mgm01_base_freeplay_00', 'out', 10],
    ['mgm01_base_freeplay_00', 'normal', 30, true],
    ['mgm01_base_freeplay_00', 'press', 6],
    ['mgm01_base_freeplay_00', 'left_select_00', 4],
    ['mgm01_base_freeplay_00', 'right_select_01', 5],
    ['mgm01_base_mginfo_00', 'in', 10],
    ['mgm01_base_mginfo_00', 'left_select', 8],
  ];
  for (const [n, t, l, loop] of expect) ok(len(n, t) === l && (loop === undefined || lp(n, t) === loop), `${n} ${t} = ${l}f${loop ? ' 반복' : ''} (명세 ${len(n, t)}${lp(n, t) ? ' 반복' : ''})`);
  const all = merged as unknown as Spec;
  const pos = new LayoutInst('sys_guide_pos_01', merged.layouts.sys_guide_pos_01, all);
  for (const [k, x, y] of [
    [11, -900, -478],
    [12, 900, 490],
    [17, 900, -478],
  ] as const) {
    const m = nodeMatrix(pos, `x_pos_${k}`);
    ok(!!m && near(m[2], x) && near(m[5], y), `안내 위치 x_pos_${k} = (${x}, ${y}) (${m?.[2]}, ${m?.[5]})`);
  }
  const mw = merged.layouts.sys_meswin_00.nodes.find((n) => n.n === 'x_bd_00')!;
  const pl = setPlace(7, { w: mw.z[0], h: mw.z[1], x: mw.t[0], y: mw.t[1] });
  ok(near(pl[0], 0) && near(pl[1], -270), `sys_meswin_00 x_bd_00 ${mw.z.join('×')} Bottom_Center → (0, −270)`);
  const txt = merged.layouts.sys_meswin_00.nodes.find((n) => n.n === 'x_text')!;
  ok(txt.z[0] === 900 && txt.z[1] === 160 && txt.txt?.font === 'bqfont_small', 'x_text 900×160 bqfont_small(4.3)');
  ok(spec.meswin.window.length === 9 && spec.meswin.window[4].type === 'Name' && spec.meswin.window[4].layout === 'sys_meswin_00' && spec.meswin.window[0].pos === 'Top_Center', 'WindowData 9칸, 4 = Name·sys_meswin_00(4.2)');
  ok(spec.meswin.window[8].type === 'Subtitle' && spec.meswin.window[8].pos === 'Bottom_Center', 'WindowData 8 = Subtitle·Bottom_Center');
  const c13 = spec.meswin.chara[13];
  ok(c13.voice === 'CH_NPC022_GREEN' && c13.icon === 'mw_face_64_npc22_g' && c13.name === 'im_npc022_name' && spec.texts.im_npc022_name === '키노피오', 'CharacterData 13 = 키노피오(초록)');
  ok(spec.meswin.attrLists.Character[13] === 'CH_NPC022_GREEN', 'ATR Character 목록 13 = CharacterData 13(같은 순서)');
  ok(MGM_BGM_KIND.length === 41 && MGM_BGM_KIND[33] === null && MGM_BGM_KIND[4] === 'SM_BGM_MGM01_FREEPLAY' && MGM_BGM_KIND[40] === 'SM_BGM_MGM06_RES', 'BGM 표 41칸(7.3)');
  ok(spec.meswin.emotion?.[0]?.normal === 'VO_MV_ETC', 'Emotion 0 VoiceKey_Normal = VO_MV_ETC');
}

console.log('4. 메시지 문구·속성 (koKR, ATR 덤프)');
{
  const kr = (f: string): Record<string, string> => JSON.parse(readFileSync(join(ROOT, `extracted/message/koKR/${f}.json`), 'utf8')) as Record<string, string>;
  const src: Record<string, string> = { ...kr('mgmet'), ...kr('mgm01'), ...kr('im_common'), ...kr('im_mg'), ...kr('system') };
  let n = 0;
  for (const [k, v] of Object.entries(spec.texts)) {
    ok(src[k] === v, `문구 ${k}`);
    n++;
  }
  for (const k of Object.keys(kr('mgmet'))) ok(k in spec.texts, `mgmet 라벨 ${k} 있음`);
  for (const k of Object.keys(kr('mgm01'))) ok(k in spec.texts, `mgm01 라벨 ${k} 있음`);
  for (const k of ['mgmet_entFirst_mw_guide00', 'mgmet_entFirst_mw_guide01', 'mgmet_entFirst_mw_guide02', 'mgmet_fp_mw_howToPlay00', 'mgmet_fp_mw_howToPlay01', 'mgmet_fp_mw_howToPlay02', 'sys_mw_name', 'im_mode03_name', 'sys_ctrl_back', 'mgmet_ui_howtoplay', 'sys_ctrl_skip'])
    ok(k in spec.texts, `데모·안내 라벨 ${k}`);
  const atr = readFileSync(join(ROOT, 'analysis/msgwin_atr_koKR.txt'), 'utf8');
  const L = spec.meswin.attrLists;
  let na = 0;
  for (const [k, a] of Object.entries(spec.msgAttr)) {
    const m = atr.match(new RegExp(`^  ${k}: .*WindowType=(\\S+) Character=(\\S+) Position=(\\S+).*WindowInfo=(\\S+)`, 'm'));
    if (!m) continue;
    ok(L.WindowType[a.wt] === m[1] && L.Character[a.ch] === m[2] && L.Position[a.pos] === m[3] && L.WindowInfo[a.wi] === m[4], `ATR ${k} ${L.WindowType[a.wt]}/${L.Character[a.ch]}/${L.Position[a.pos]}`);
    na++;
  }
  const g0 = spec.msgAttr.mgmet_entFirst_mw_guide00;
  ok(L.WindowType[g0.wt] === 'WT_Name' && L.Position[g0.pos] === 'Bottom_Center' && g0.ox === 0 && g0.oy === 0, 'mgmet 첫 인사 = WT_Name·Bottom_Center·오프셋 0');
  ok(L.Character[spec.msgAttr.mgmet_fp_mw_howToPlay00.ch] === 'CH_NPC022_BLUE', '첫 설명 화자 = CH_NPC022_BLUE');
  console.log(`   문구 ${n}개, ATR 대조 ${na}개`);
}

console.log('5. 글꼴·텍스처·소리');
{
  const TAG = /\[\d+:\d+:[0-9a-f]*\]/g;
  const need = new Set([...Object.values(spec.texts).join('').replace(TAG, '')].filter((c) => c !== '\r' && c !== '\n'));
  for (const fam of ['bqfont_small', 'bqfont_small_shadow', 'bqfont_middle', 'bqfont_middle_shadow']) {
    const f = spec.fonts[fam];
    ok(!!f && existsSync(join(A, f.image)), `${fam} 아틀라스`);
    const miss = [...need].filter((c) => !f.glyphs[c]);
    ok(miss.length <= 3, `${fam} 빠진 글자 ${miss.length} (${miss.join('')}) — 원본 글꼴에 없는 글자만`);
  }
  ok(!!spec.fonts.bqfont_large?.glyphs['프'] && !!spec.fonts.bqfont_large?.glyphs['항'], '큰 글꼴: 프리 플레이·미니게임 항구');
  ok(!!spec.fonts.bqfont_small.glyphs['']?.color, '안내 아이콘 U+E003 = 컬러 글리프');
  let tex = 0;
  for (const s of [spec as MgmSpecPart, parts.mgmet, parts.mgm01])
    for (const [k, p] of Object.entries(s.textures)) {
      ok(existsSync(join(A, p)), `텍스처 ${k}`);
      tex++;
    }
  for (const v of Object.values(spec.missingTextures ?? {})) ok(v.length === 0, `없는 텍스처 ${v.join(',')}`);
  const vol: Record<string, number> = { SQ_SE_SYS_MES_PROC: 72, SQ_SE_SYS_DECI_S: 72, SQ_SE_SYS_CURSOR: 110, SQ_SE_SYS_DECI: 110, SQ_SE_SYS_CANCEL: 110, SQ_SE_SYS_PROCEED: 56 };
  for (const [l, v] of Object.entries(vol)) {
    const s = spec.sounds[l];
    ok(!!s && existsSync(join(A, s.file)) && statSync(join(A, s.file)).size > 1000 && near(s.gain, v / 127, 1e-3), `소리 ${l} 볼륨 ${v}`);
  }
  ok(spec.soundNotes?.SQ_VOI_SYS_MES_PUT?.volume === 30 && !spec.sounds.SQ_VOI_SYS_MES_PUT, 'SQ_VOI_SYS_MES_PUT 볼륨 30, 무음이라 파일 없음');
  console.log(`   텍스처 ${tex}개`);
}

console.log('6. import 그래프 (mgm_common.md 9.1 경계)');
{
  const dir = join(WEB, 'script/shell/mgmcommon');
  const files: string[] = [];
  const scan = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) scan(p);
      else if (f.endsWith('.ts')) files.push(p);
    }
  };
  scan(dir);
  const SHARED = ['charselect/scene2d', 'charselect/render2d', 'charselect/state', 'charselect/types'];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const depth = f.slice(dir.length + 1).split(/[\\/]/).length - 1;
    for (const m of src.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const s = m[1] ?? m[2];
      const r = resolve(dirname(f), s);
      const inside = s.startsWith('.') && (r === dir || r.startsWith(dir + '\\') || r.startsWith(dir + '/'));
      const shared = SHARED.some((x) => s === `${'../'.repeat(depth + 1)}${x}`);
      ok(inside || shared || s === 'three', `${f.slice(dir.length + 1)}: 금지 import '${s}'`);
    }
  }
  console.log(`   파일 ${files.length}개`);
  const metDir = join(WEB, 'script/shell/mgmet');
  if (existsSync(metDir)) {
    const met = readdirSync(metDir).filter((f) => f.endsWith('.ts'));
    for (const f of met) {
      const src = readFileSync(join(metDir, f), 'utf8');
      for (const m of src.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const s = m[1] ?? m[2];
        const inside = s.startsWith('./') || s.startsWith('../mgmcommon/') || s === '../mgmcommon';
        const shared = SHARED.some((x) => s === `../${x}`);
        ok(inside || shared || s === 'three', `mgmet/${f}: 금지 import '${s}'`);
      }
    }
    console.log(`   mgmet 파일 ${met.length}개(같은 폴더·mgmcommon·charselect 공용·three 허용)`);
  }
  const m01Dir = join(WEB, 'script/shell/mgm01');
  if (existsSync(m01Dir)) {
    const m01 = readdirSync(m01Dir).filter((f) => f.endsWith('.ts'));
    for (const f of m01) {
      const src = readFileSync(join(m01Dir, f), 'utf8');
      for (const m of src.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const s = m[1] ?? m[2];
        const inside = (s.startsWith('./') && !s.slice(2).includes('/')) || s.startsWith('../mgmcommon/') || s === '../mgmcommon';
        const shared = SHARED.some((x) => s === `../${x}`);
        ok(inside || shared || s === 'three', `mgm01/${f}: 금지 import '${s}'`);
      }
    }
    console.log(`   mgm01 파일 ${m01.length}개(같은 폴더·mgmcommon·charselect 공용·three 허용)`);
  }
}

console.log(`${count - fails}/${count} 통과`);
if (fails) process.exit(1);
