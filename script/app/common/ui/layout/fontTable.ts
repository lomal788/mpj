/**
 * 공용 비트맵 글꼴 표(web/assets/font/, tools/analysis/font_web_assets.py) — 형식·복합 글꼴 해석·글자 → 원본 시트 계산. three 없음(앱·flowCatalog·시험 공용).
 * 설계: docs/engine/font_assets.md §5. 글리프 위치 = 원본 TGLP 규칙(셀 (cx, cy) → (cx·(cellW+1)+1, cy·(cellH+1)+1), 05_ui_input.md §4.2).
 * 복합 글꼴: fcpx 구성 순서대로 CMAP 에 있는 첫 글꼴 [추정: 대체 순서], 패밀리 높이·폭·ascent = main(구성 둘째) FINF.
 * 명세 fonts 항목 FontRef = {dir: 명세 기준 assets/font/, chars: 미리 받을 글자}. resolveFonts 가 같은 객체에 FontSpec 필드를 채운다
 * (합친 명세·부품 사본이 같은 값을 봄), 반환 = chars 가 든 시트 URL. 표·패밀리는 URL 마다 한 번만 읽는다(json = 앱 관리자 json 또는 시험 파일).
 */
import type { FontSpec, GlyphSpec } from '@game/lib/layout';

export interface FontRef {
  dir: string;
  chars?: string;
}

export type FcpxTable = Record<string, { fonts: string[]; main: string }>;

export interface FontTable {
  font: string;
  height: number;
  width: number;
  ascent: number;
  lineFeed: number;
  alterCharIndex: number;
  defaultWidth: [number, number, number];
  cellW: number;
  cellH: number;
  baseline: number;
  cellsPerRow: number;
  cellsPerCol: number;
  sheetW: number;
  sheetH: number;
  sheets: string[];
  color: boolean;
  extension: boolean;
  cmap: Record<string, number>;
  widths: ([number, number, number] | null)[];
}

export const FCPX_FILE = 'fcpx.json';
export const tablePath = (font: string): string => `${font}/glyphs.json`;
export const sheetPath = (font: string, file: string): string => `${font}/${file}`;

export function normUrl(p: string): string {
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/]*)(.*)$/i.exec(p);
  const head = m ? m[1] : '';
  const rest = m ? m[2] : p;
  const out: string[] = [];
  const lead = rest.startsWith('/');
  for (const s of rest.split('/')) {
    if (s === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!head && !lead) out.push('..');
    } else if (s !== '.' && s !== '') out.push(s);
  }
  return head + (lead || head ? '/' : '') + out.join('/');
}

export function glyphCell(t: FontTable, gi: number): { sheet: number; x: number; y: number } {
  const per = t.cellsPerRow * t.cellsPerCol;
  const r = gi % per;
  return { sheet: Math.floor(gi / per), x: (r % t.cellsPerRow) * (t.cellW + 1) + 1, y: Math.floor(r / t.cellsPerRow) * (t.cellH + 1) + 1 };
}

export function findGlyph(tables: readonly FontTable[], ch: string): { t: FontTable; gi: number } | null {
  for (const t of tables) {
    const gi = t.cmap[ch];
    if (gi !== undefined) return { t, gi };
  }
  return null;
}

export function sheetsFor(tables: readonly FontTable[], chars: string): string[] {
  const out = new Set<string>();
  for (const ch of chars) {
    const f = findGlyph(tables, ch);
    if (f && (f.t.widths[f.gi] ?? f.t.defaultWidth)[1] > 0) out.add(sheetPath(f.t.font, f.t.sheets[glyphCell(f.t, f.gi).sheet]));
  }
  return [...out];
}

export function buildFamily(tables: readonly FontTable[], main: string, sheetUrl: (p: string) => string): FontSpec {
  const m = tables.find((t) => t.font === main) ?? tables[0];
  const glyphs: Record<string, GlyphSpec> = {};
  for (const t of tables) {
    const urls = t.sheets.map((s) => sheetUrl(sheetPath(t.font, s)));
    for (const [ch, gi] of Object.entries(t.cmap)) {
      if (glyphs[ch]) continue;
      const [left, w, adv] = t.widths[gi] ?? t.defaultWidth;
      const c = glyphCell(t, gi);
      glyphs[ch] = {
        x: c.x,
        y: c.y,
        w,
        h: t.cellH,
        left,
        adv,
        baseline: t.baseline,
        color: t.extension,
        sheet: urls[c.sheet],
        rgba: t.color,
        u0: c.x / t.sheetW,
        v0: c.y / t.sheetH,
        u1: (c.x + w) / t.sheetW,
        v1: (c.y + t.cellH) / t.sheetH,
      };
    }
  }
  return { height: m.height, width: m.width, ascent: m.ascent, lineFeed: m.lineFeed, glyphs };
}

export type FontJson = <T>(url: string) => Promise<T>;

const fcpxCache = new Map<string, Promise<FcpxTable>>();
const tableCache = new Map<string, Promise<FontTable>>();
const familyCache = new Map<string, Promise<FontSpec>>();

export function loadFamily(dirUrl: string, family: string, json: FontJson): Promise<FontSpec> {
  const key = `${dirUrl}|${family}`;
  let p = familyCache.get(key);
  if (p) return p;
  const fcpxUrl = dirUrl + FCPX_FILE;
  let fx = fcpxCache.get(fcpxUrl);
  if (!fx) {
    fx = json<FcpxTable>(fcpxUrl);
    fcpxCache.set(fcpxUrl, fx);
    fx.catch(() => fcpxCache.delete(fcpxUrl));
  }
  p = fx.then(async (fcpx) => {
    const fam = fcpx[family];
    if (!fam) throw new Error(`글꼴 없음 ${family}`);
    const tables = await Promise.all(fam.fonts.map((f) => loadTable(dirUrl, f, json)));
    return buildFamily(tables, fam.main, (s) => dirUrl + s);
  });
  familyCache.set(key, p);
  p.catch(() => familyCache.delete(key));
  return p;
}

export function loadTable(dirUrl: string, font: string, json: FontJson): Promise<FontTable> {
  const u = dirUrl + tablePath(font);
  let t = tableCache.get(u);
  if (!t) {
    t = json<FontTable>(u);
    tableCache.set(u, t);
    t.catch(() => tableCache.delete(u));
  }
  return t;
}

export async function familyTables(dirUrl: string, family: string, json: FontJson): Promise<FontTable[]> {
  const fcpx = await json<FcpxTable>(dirUrl + FCPX_FILE);
  const fam = fcpx[family];
  return fam ? Promise.all(fam.fonts.map((f) => loadTable(dirUrl, f, json))) : [];
}

export async function resolveFonts(fonts: Record<string, unknown>, url: (p: string) => string, json: FontJson): Promise<string[]> {
  const sheets = new Set<string>();
  await Promise.all(
    Object.entries(fonts).map(async ([family, f]) => {
      if (!f || typeof f !== 'object' || typeof (f as FontRef).dir !== 'string') return;
      const ref = f as FontRef;
      const dirUrl = `${normUrl(url(ref.dir))}/`;
      const spec = await loadFamily(dirUrl, family, json);
      Object.assign(f as object, spec);
      for (const ch of ref.chars ?? '') {
        const g = spec.glyphs[ch];
        if (g && g.w > 0) sheets.add(g.sheet);
      }
    }),
  );
  return [...sheets];
}
