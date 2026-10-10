/**
 * 공용 글꼴(web/assets/font/, docs/engine/font_assets.md) 시험 — 노드만.
 * (1) 모든 화면 명세 fonts = 공용 참조 {dir, chars}, 해석 성공, chars 글자 전부 있음, 가리키는 표·시트 파일 있음(404 0).
 * (2) 화면 문구(texts, 태그 뺌)의 글자: 그 화면 글꼴 어디에도 없는 글자 수(= 원본 글꼴에 없는 글자, 공용 글꼴이 원본 전부라 새로 빠지는 글자 0).
 * (3) 옛 명세(인자 경로, 화면별 아틀라스 시절)가 있으면 글리프 메트릭(w·h·left·adv·baseline·color)과 패밀리 height·width·ascent 가 같은지.
 *   npx tsx tools/test_fonts.ts [옛 명세 폴더(assets 와 같은 상대 경로)]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FontSpec } from '@app/scene/menu/charselect/types';
import { resolveFontsFromDisk, sheetFilesMissing } from './fontSpecNode';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = join(WEB, 'assets');
const OLD = process.argv[2] ?? null;
const SPECS: [string, string][] = [
  ['charselect/spec.json', 'charselect'],
  ['modeselect/spec.json', 'modeselect'],
  ['mgmcommon/spec.json', 'mgmcommon'],
  ['online/online.json', 'mgmcommon'],
  ['partyrule/partyrule.json', 'mgmcommon'],
  ['setplayer/setplayer.json', 'mgmcommon'],
  ['mginst/mginst.json', 'mgmcommon'],
  ['controllerstandby/controllerstandby.json', 'mgmcommon'],
  ['plaza/ui/plaza_ui.json', 'mgmcommon'],
  ['plaza/ui/plaza_card.json', 'mgmcommon'],
  ['mg1801/ui/ui.json', 'mg1801/ui'],
];
const TAG = /\[\d+:\d+(?::[0-9a-f]*)?\]/g;

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (c) pass++;
  else {
    fail++;
    console.log(`  실패: ${m}`);
  }
};

console.log('1. 명세 → 공용 글꼴');
const resolved: Record<string, Record<string, FontSpec & { dir?: string; chars?: string }>> = {};
for (const [rel, base] of SPECS) {
  const j = JSON.parse(readFileSync(join(A, rel), 'utf8')) as { fonts: Record<string, { dir?: string; chars?: string }>; texts?: Record<string, string> };
  const raw = JSON.parse(JSON.stringify(j.fonts)) as Record<string, { dir?: string; chars?: string; image?: string; glyphs?: unknown }>;
  for (const [fam, f] of Object.entries(raw)) ok(typeof f.dir === 'string' && typeof f.chars === 'string' && f.image === undefined && f.glyphs === undefined, `${rel} ${fam} = {dir, chars}`);
  const sheets = await resolveFontsFromDisk(j.fonts, join(A, base));
  const fonts = j.fonts as unknown as Record<string, FontSpec & { dir?: string; chars?: string }>;
  resolved[rel] = fonts;
  let chars = 0;
  for (const [fam, f] of Object.entries(fonts)) {
    const miss = [...(f.chars ?? '')].filter((c) => !f.glyphs[c]);
    ok(miss.length === 0, `${rel} ${fam} chars 빠짐 ${miss.join('')}`);
    chars += [...(f.chars ?? '')].length;
    const missFiles = sheetFilesMissing(f);
    ok(missFiles.length === 0, `${rel} ${fam} 시트 파일 없음 ${missFiles.join(',')}`);
  }
  ok(sheets.every((s) => existsSync(s)), `${rel} 미리 받을 시트 파일`);
  let lack = 0;
  const fams = Object.values(fonts);
  for (const ch of new Set([...Object.values(j.texts ?? {}).join('').replace(TAG, '')])) if (ch !== '\n' && ch !== '\r' && !fams.some((f) => f.glyphs[ch])) lack++;
  console.log(`   ${rel}: 글꼴 ${fams.length}, chars ${chars}, 미리 받을 시트 ${sheets.length}, 문구 글자 중 원본 글꼴에 없는 것 ${lack}`);
}

if (OLD) {
  console.log(`2. 옛 명세 메트릭 대조 (${OLD})`);
  let n = 0;
  for (const [rel] of SPECS) {
    const p = join(OLD, rel);
    if (!existsSync(p)) continue;
    const old = (JSON.parse(readFileSync(p, 'utf8')) as { fonts: Record<string, { height: number; width: number; ascent: number; glyphs: Record<string, { w: number; h: number; left: number; adv: number; baseline: number; color?: boolean }> }> }).fonts;
    for (const [fam, of] of Object.entries(old)) {
      const nf = resolved[rel][fam];
      ok(!!nf && nf.height === of.height && nf.width === of.width && nf.ascent === of.ascent, `${rel} ${fam} 패밀리 메트릭`);
      if (!nf) continue;
      for (const [ch, g] of Object.entries(of.glyphs)) {
        const h = nf.glyphs[ch];
        const same = !!h && h.w === g.w && h.h === g.h && h.left === g.left && h.adv === g.adv && h.baseline === g.baseline && (g.color === undefined || h.color === g.color);
        ok(same, `${rel} ${fam} ${ch} U+${ch.codePointAt(0)!.toString(16)} 메트릭 ${JSON.stringify(g)} → ${JSON.stringify(h && { w: h.w, h: h.h, left: h.left, adv: h.adv, baseline: h.baseline, color: h.color })}`);
        n++;
      }
    }
  }
  console.log(`   글리프 ${n}개 대조`);
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);
