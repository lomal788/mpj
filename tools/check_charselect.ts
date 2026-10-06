/**
 * 캐릭터 선택 모듈 검사 — (1) 명세(assets/charselect/spec.json)를 원본 덤프(extracted/converted/ui/bq_Parts/*.json, ui_lyt.py 파서 출력)·
 * 원본 데이터(selectCharacterList.json, characterlist.json, koKR 메시지)와 대조, (2) 화면 좌표 계산(docs 6.1 표), (3) 모듈 import 그래프에
 * 엔진층(script/core·games·view, game.ts, env.ts)이 없는지.
 *
 *   npx tsx tools/check_charselect.ts
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeMatrix } from '../script/shell/charselect/render2d';
import { LayoutInst } from '../script/shell/charselect/scene2d';
import type { Spec } from '../script/shell/charselect/types';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(WEB, '..');
const DUMP = join(ROOT, 'extracted/converted/ui/bq_Parts');
const spec = JSON.parse(readFileSync(join(WEB, 'assets/charselect/spec.json'), 'utf8')) as Spec;

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
const hex = (c: number[]): string => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
const O: Record<string, number> = { left: -1, center: 0, right: 1, top: 1, bottom: -1 };

interface DumpPane {
  type: string;
  name: string;
  visible: boolean;
  alpha: number;
  translate: number[];
  scale: number[];
  size: number[];
  origin: string[];
  vtxColors?: string[];
  children: DumpPane[];
}

console.log('1. 레이아웃 노드 대조 (원본 덤프)');
let nodesChecked = 0;
for (const [name, lay] of Object.entries(spec.layouts)) {
  const d = JSON.parse(readFileSync(join(DUMP, `${name}.bflyt.json`), 'utf8')) as { root: DumpPane };
  const flat: DumpPane[] = [];
  const walk = (p: DumpPane): void => {
    flat.push(p);
    p.children.forEach(walk);
  };
  walk(d.root);
  ok(flat.length === lay.nodes.length, `${name} 노드 수 ${lay.nodes.length} != ${flat.length}`);
  flat.forEach((p, i) => {
    const n = lay.nodes[i];
    if (!n) return;
    nodesChecked++;
    ok(n.n === p.name, `${name}[${i}] 이름 ${n.n} != ${p.name}`);
    ok(near(n.t[0], p.translate[0]) && near(n.t[1], p.translate[1]), `${name}/${p.name} 위치`);
    ok(near(n.z[0], p.size[0]) && near(n.z[1], p.size[1]), `${name}/${p.name} 크기`);
    ok(near(n.s[0], p.scale[0]) && near(n.s[1], p.scale[1]), `${name}/${p.name} 배율`);
    ok(n.a === p.alpha && n.v === p.visible, `${name}/${p.name} 알파·보임`);
    ok(n.o[0] === O[p.origin[0]] && n.o[1] === O[p.origin[1]], `${name}/${p.name} 원점`);
    if (p.type === 'pic1' && p.vtxColors) ok(n.vc!.map(hex).join() === p.vtxColors.join(), `${name}/${p.name} 정점색`);
  });
}
console.log(`   노드 ${nodesChecked}개`);

console.log('2. 애니 길이 대조');
for (const [name, lay] of Object.entries(spec.layouts)) {
  for (const [tag, a] of Object.entries(lay.anims)) {
    const f = [join(DUMP, `${name}_${tag}.bflan.json`), join(DUMP, `${name}.bflan.json`)].find(existsSync);
    if (!f) {
      ok(false, `${name} ${tag} 덤프 없음`);
      continue;
    }
    const d = JSON.parse(readFileSync(f, 'utf8')) as { frameSize: number; loop: boolean };
    ok(a.len === d.frameSize && a.loop === d.loop, `${name} ${tag} 길이 ${a.len}/${d.frameSize}`);
  }
}
const btnLen = spec.layouts.sys_btn_charasel_00.anims;
ok(btnLen.on.len === 9 && btnLen.press.len === 19 && btnLen.miss.len === 20, '버튼 on 9·press 19·miss 20 (docs 6.3)');
ok(spec.layouts.sys_base_charasel_01.anims.in.len === 5 && spec.layouts.sys_btn_ok_00.anims.press.len === 19, '격자 in 5·OK press 19');

console.log('3. 화면 좌표 (docs 6.1)');
const L = (n: string): LayoutInst => new LayoutInst(n, spec.layouts[n], spec);
const cards = L('sys_base_charasel_00');
const grid = L('sys_base_charasel_01');
const base = nodeMatrix(cards, 'x_null_win_charasel')!;
ok(near(base[2], 0) && near(base[5], -296), `격자 원점 (0, −296): (${base[2]}, ${base[5]})`);
const scr = (m: number[]): [number, number] => [960 + m[2], 540 - m[5]];
const gb: [number, number, number, number, number, number] = [1, 0, base[2], 0, 1, base[5]];
for (let b = 0; b < 22; b++) {
  const m = nodeMatrix(grid, `x_parts_btn_${String(b).padStart(2, '0')}`, gb)!;
  const [x, y] = scr(m);
  const col = b % 11;
  ok(near(x, 300 + 148 * col) && near(y, b < 11 ? 744 : 908), `버튼 ${b} 화면 (${x}, ${y})`);
}
{
  const [x, y] = scr(nodeMatrix(grid, 'x_parts_btn_random', gb)!);
  ok(near(x, 138) && near(y, 826), `랜덤 (${x}, ${y})`);
  const [tx, ty] = scr(nodeMatrix(L('sys_connect_tlp_00'), 'x_text_title_00')!);
  ok(near(tx, 960) && near(ty, 80), `제목 (${tx}, ${ty})`);
  const g = scr(nodeMatrix(L('sys_guide_pos_01'), 'x_pos_17')!);
  ok(near(g[0], 1860) && near(g[1], 1018), `안내 위치 (${g[0]}, ${g[1]})`);
  for (const [i, px] of [-620, 0, 620].entries()) {
    const m = nodeMatrix(cards, `x_parts_3win_${i + 1}P`)!;
    ok(near(960 + m[2], 960 + px), `3인 카드 ${i + 1} x`);
  }
  // 캡처 대조 [참고 이미지]: 화면 → 캡처 = (x − 530)·0.716. 버튼 2(피치) ≈ (47, 533)
  const m2 = scr(nodeMatrix(grid, 'x_parts_btn_02', gb)!);
  ok(Math.abs((m2[0] - 530) * 0.716 - 47) < 3 && Math.abs(m2[1] * 0.716 - 533) < 3, '캡처 피치 칸 위치');
}

console.log('4. 플레이어 색 (docs 6.2)');
{
  const cur = spec.layouts.sys_cursor_charasel_00.nodes;
  const want = ['#b80019ff', '#0c16b8ff', '#004f11ff', '#ff5b00ff', '#ff358dff', '#2dcdf0ff', '#39df0eff', '#6849ffff'];
  want.forEach((c, i) => {
    const n = cur.find((x) => x.n === `cursor_0${i}`);
    ok(!!n && hex(n.vc![0]) === c, `커서 ${i + 1}P 색 ${n && hex(n.vc![0])}`);
  });
  const btn = spec.layouts.sys_btn_charasel_00.nodes;
  const base1 = btn.find((x) => x.n === 'x_pict_base_1P')!;
  ok(hex(base1.vc![0]) === '#cb0030ff' && base1.a === 200, '1P 결정 배경');
}

console.log('5. 데이터·텍스트');
{
  const sel = JSON.parse(readFileSync(join(ROOT, 'extracted/bea/bq.nx.bea/common/data/selectCharacterList.json'), 'utf8').replace(/^﻿/, '')).CharacterList as {
    BtnNo: number;
    CameraPositionY: number;
    CameraPositionZ: number;
    CameraFovY: number;
  }[];
  ok(sel.length === 22 && spec.chars.length === 22, '22명');
  sel.forEach((s, i) => {
    const c = spec.chars[i];
    ok(c.btn === s.BtnNo && c.cam[1] === s.CameraPositionY && c.cam[2] === s.CameraPositionZ && c.fov === s.CameraFovY, `표 ${i} 버튼·카메라`);
  });
  ok(spec.chars[12].pc === 'pc14' && spec.chars[12].btn === 10 && spec.chars[12].lock === 1, '폴린 = 표 12, 버튼 10, 플래그 1');
  ok(spec.chars[21].pc === 'pc62' && spec.chars[21].lock === 0, '닌군 = 표 21, 플래그 0');
  ok(spec.chars[6].idle === 'co_chr_idle00' && spec.chars[11].idle === 'co_chr_idle00' && spec.chars[0].idle === 'co_idle00', '대기 모션(요시·캐서린)');
  const msg = JSON.parse(readFileSync(join(ROOT, 'extracted/message/koKR/menu01_main.json'), 'utf8')) as Record<string, string>;
  ok(spec.texts.mn01_connect_ui_chara_title === msg.mn01_connect_ui_chara_title && msg.mn01_connect_ui_chara_title === '캐릭터를 선택해 주십시오', '제목 문구');
  ok(spec.texts.im_pc12_name === '동키콩' && spec.texts.im_pc51_name === '굼바', '이름(동키콩·굼바)');
  for (const fam of Object.keys(spec.fonts)) {
    const f = spec.fonts[fam];
    ok(Object.keys(f.glyphs).length > 0, `${fam} 글리프`);
  }
  const need = spec.texts.mn01_connect_ui_chara_title + spec.texts.sys_ctrl_back + spec.chars.map((c) => spec.texts[c.label]).join('');
  for (const ch of new Set(need)) ok(!!spec.fonts.bqfont_middle.glyphs[ch], `bqfont_middle 글자 ${ch} U+${ch.codePointAt(0)!.toString(16)}`);
  for (const c of spec.chars) ok(!!c.glb && existsSync(join(WEB, 'assets/charselect', c.glb)) && !!spec.textures[`face_128_${c.pc}^u`], `${c.pc} glb·얼굴`);
  for (const [k, s] of Object.entries(spec.sounds)) ok(existsSync(join(WEB, 'assets/charselect', s.file)), `소리 ${k}`);
}

console.log('5b. 2차 데이터(docs 12): BGM·보이스·눈·컨트롤러 덮어쓰기');
{
  const b = spec.bgm!;
  ok(!!b && b.label === 'SM_BGM_MENU_MAP' && existsSync(join(WEB, 'assets/charselect', b.file)), 'BGM 파일');
  ok(!!b && near(b.loopStart, 114688 / 48000, 1e-6) && near(b.loopEnd, 2561415 / 48000, 1e-6) && near(b.gain, 33 / 127, 1e-3), 'BGM 루프·볼륨(BFSTM·fsar)');
  for (const c of spec.chars) {
    const v = spec.voices?.[c.pc];
    ok(!!v && v.files.length === (c.pc === 'pc62' ? 1 : 3) && v.files.every((f) => existsSync(join(WEB, 'assets/charselect', f))), `${c.pc} 보이스 변형`);
  }
  const eye = (pc: string) => spec.chars.find((c) => c.pc === pc)!.eye!;
  ok(eye('pc12').albedoMask === false && eye('pc01').albedoMask === true && eye('pc13').albedoMask === false, '눈동자 알베도 마스크(동키콩 끔·마리오 켬)');
  ok(!!eye('pc12').lid && !!eye('pc61').lid && !eye('pc01').lid, '눈꺼풀 셰이더 그래프(동키콩·가봉만)');
  ok(near(eye('pc12').lid!.x0[0], 0.38) && near(eye('pc12').lid!.xmin[0], -0.05) && near(eye('pc61').lid!.x0[0], 0.55), '눈꺼풀 파라미터 기본·최소');
  const card = spec.layouts.sys_win_charamodel_02.nodes.find((n) => n.n === 'x_parts_hard')!;
  const ov = (n: string) => card.ov?.find((o) => o.n === n);
  ok(!!ov('x_null_lamp')?.s && near(ov('x_null_lamp')!.s![0], 0.5), '카드 램프 배율 0.5');
  ok(!!ov('x_icon_hard_01')?.z && near(ov('x_icon_hard_01')!.z![0], 90) && near(ov('x_icon_hard_01')!.t![1], -7), '카드 아이콘 크기 90·ty −7');
  const lamp = spec.layouts.sys_icon_hard_01.mats.find((m) => m.name === 'x_pict_lamp_00')!;
  ok(near(lamp.srt[0].t[1], 0.5), '램프 기본 SRT t.y 0.5(켜짐)');
  const glb = readFileSync(join(WEB, 'assets/charselect/chara/pc12/pc12_dk.glb'));
  const js = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as { meshes: { primitives: { attributes: Record<string, number> }[] }[] };
  ok('_C1' in js.meshes[0].primitives[0].attributes && 'TEXCOORD_2' in js.meshes[0].primitives[0].attributes, '동키콩 glb 정점색 _C1·TEXCOORD_2');
}

console.log('5c. 22명 눈 회귀 검사 (docs 12.8)');
{
  type Glb = {
    nodes: { name: string; mesh?: number; extras?: { visible?: boolean; visBone?: string } }[];
    materials: { name: string; extras?: { fres?: { params?: Record<string, { value: number[] }>; samplers?: { texture: string }[] } } }[];
  };
  const ALBEDO_MASK = new Set(['pc01', 'pc02', 'pc03', 'pc04', 'pc05', 'pc06', 'pc11', 'pc14', 'pc50', 'pc51']);
  let meshesChecked = 0;
  for (const c of spec.chars) {
    const buf = readFileSync(join(WEB, 'assets/charselect', c.glb!));
    const js = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as Glb;
    const body = js.materials.find((m) => m.name === 'body_m');
    const fr = body?.extras?.fres;
    const hasEye = (fr?.samplers ?? []).some((x) => /_eye_(arr_)?alb$/.test(x.texture));
    ok(hasEye === !!c.eye?.tex, `${c.pc} 눈 텍스처 유무`);
    ok(!!c.eye?.albedoMask === ALBEDO_MASK.has(c.pc), `${c.pc} 눈동자 알베도 마스크 = 데이터(눈알 알파 0)`);
    if (c.eye?.sclera) {
      const c1 = fr?.params?.material_utility_color1?.value ?? [];
      ok(c.eye.sclera.every((v, i) => near(v, c1[i], 1e-5)), `${c.pc} 흰자색 = utility_color1`);
    }
    if (c.eye?.lid) {
      for (const [i, pn] of ['material_utility_parameter2', 'material_utility_parameter3'].entries()) {
        const v = fr?.params?.[pn]?.value ?? [];
        ok(near(c.eye.lid.x0[i], v[0]) && near(c.eye.lid.y0[i], v[1]), `${c.pc} 눈꺼풀 ${pn} 기본값`);
      }
      // 열림(c = 0)에서 눈꺼풀 가장자리 = 텍스처 가장자리 + y 가 눈알 위쪽(아래 끝보다 위)에 온다
      ok(c.eye.lid.edge + c.eye.lid.y0[0] < c.eye.lid.bottom, `${c.pc} 열린 눈꺼풀 가장자리 위치`);
    }
    // 대기 모션 0 프레임 눈 표정 메시 보임 = 깜빡임 vis → 모션 vis → 뼈 기본값
    const mot = JSON.parse(readFileSync(join(WEB, 'assets/charselect', c.motions!), 'utf8')) as Record<string, { blinkName?: string; vis?: Record<string, [number, number][]> }>;
    const idle = mot[c.idle];
    const blink = idle?.blinkName ? mot[idle.blinkName] : undefined;
    const hidden = new Set(js.nodes.filter((n) => n.extras?.visible === false).map((n) => n.name));
    const at = (st: [number, number][]): number => st.filter(([f]) => f <= 0).pop()?.[1] ?? st[0][1];
    for (const n of js.nodes) {
      const vb = n.extras?.visBone;
      if (n.mesh === undefined || !vb) continue;
      const v = blink?.vis?.[vb] ? at(blink.vis[vb]) : idle?.vis?.[vb] ? at(idle.vis[vb]) : hidden.has(vb) ? 0 : 1;
      const m = /fcl_[LR]_eye_(\w+?)__/.exec(n.name);
      if (m) {
        meshesChecked++;
        ok((v !== 0) === (m[1] === 'open'), `${c.pc} ${n.name} 대기 보임 ${v}`);
      } else if (/_(body|face)/.test(n.name)) ok(v !== 0, `${c.pc} ${n.name} 보임`);
    }
  }
  console.log(`   눈 표정 메시 ${meshesChecked}개`);
  // 12.2 회귀 방지: 눈동자 합성에 _C1 마스크를 곱하지 않는다(마리오 등은 _C1 이 흰자 일부만 표시)
  const pv = readFileSync(join(WEB, 'script/shell/charselect/preview3d.ts'), 'utf8');
  ok(!/sclera \* vEyeMask/.test(pv) && /e0\.a \* eyeInside\(e0uv\) \* sclera\)/.test(pv), '눈동자 마스크 = 알베도 규칙만(_C1 미사용)');
}

console.log('6. import 그래프 (독립성)');
{
  const dir = join(WEB, 'script/shell/charselect');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec2 = m[1] ?? m[2];
      const allowed = spec2.startsWith('./') ? !spec2.includes('..') : spec2 === 'three' || spec2.startsWith('three/examples/jsm/');
      ok(allowed, `${f}: 금지 import '${spec2}'`);
    }
  }
  console.log(`   파일 ${files.length}개`);
}

console.log(`${count - fails}/${count} 통과`);
if (fails) process.exit(1);
