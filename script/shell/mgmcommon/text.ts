/**
 * 글자 — 메시지 태그 풀기(삽입 Text0/Number0·색·Wait_Scale·조사), 글자 삽입 값 규칙(SetInsertMessLabel), 여러 줄·색·부분 표시 글자 페인.
 * 근거: docs/shell/mgm_common.md 6.8, message_window.md 6.3·9.4, engine/05_ui_input.md 5.2. 그리기는 charselect render2d 글자 규칙 그대로
 * (글자마다 txt 노드 하나, 진행폭 = adv × 배율 + 자간), 컬러 글리프는 흰 정점색(modeselect.md 6.1).
 */
import type { Render2D } from '../charselect/render2d';
import { rectOf } from '../charselect/render2d';
import { LayoutInst } from '../charselect/scene2d';
import type { FontSpec, LayoutSpec, NodeSpec, Rgba, Spec } from '../charselect/types';
import { IDENTITY, mul, paneGlobal, type Mat3 } from './itemLayout';

export interface RichUnit {
  ch: string;
  /** 색 태그 [0:3] 의 색(없으면 페인 색) */
  color: Rgba | null;
}

export interface RichText {
  /** 글자 단위(태그 뺌, 삽입 펼침, \r·\n 포함) */
  units: RichUnit[];
  /** 글자 수 위치 → Wait_Scale 배율 */
  waitScale: Map<number, number>;
}

/** 삽입 값: 키 'Text0'·'Number0'… → 라벨/문자열/숫자 */
export type Inserts = Record<string, string | number>;

const TAG = /\[(\d+):(\d+):([0-9a-f]*)\]/g;
const MAX_INSERT = 64;

/** SetInsertMessLabel 값 규칙: 메시지 라벨이면 그 문구, 아니면 문자열 그대로(UTF-16 64자) */
export function insertValue(value: string | number, texts: Record<string, string>): string {
  if (typeof value === 'number') return String(value);
  const t = texts[value];
  return t !== undefined ? t : value.slice(0, MAX_INSERT);
}

const hasBatchim = (ch: string | undefined): boolean | null => {
  if (!ch) return null;
  const c = ch.charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return null;
  return (c - 0xac00) % 28 !== 0;
};

/** localize.Particle 목록 none·ha·wo·ga·to·ni·ya·san(05_ui_input.md 5.2) → [받침 있음, 없음]. ni·san 은 형태 [미확정] → 빈 글자 */
const PARTICLE: ([string, string] | null)[] = [null, ['은', '는'], ['을', '를'], ['이', '가'], ['과', '와'], null, ['아', '야'], null];

/** 메시지 문구(태그 포함) → 글자 단위. depth = 삽입 안의 태그를 풀 때 깊이 */
export function parseMessage(raw: string, texts: Record<string, string>, inserts: Inserts = {}, depth = 0, color: Rgba | null = null): RichText {
  const units: RichUnit[] = [];
  const waitScale = new Map<number, number>();
  let cur = color;
  let last = 0;
  const pushText = (s: string): void => {
    for (const ch of s) units.push({ ch, color: cur });
  };
  for (const m of raw.matchAll(TAG)) {
    pushText(raw.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const g = Number(m[1]);
    const t = Number(m[2]);
    const hex = m[3];
    const byte = (i: number): number => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (g === 0 && t === 3 && hex.length >= 8) cur = [byte(0), byte(1), byte(2), byte(3)];
    else if (g === 1) {
      const key = t === 1 ? `Text${byte(0)}` : `Number${byte(0)}`;
      const v = inserts[key];
      if (v === undefined) continue;
      const s = insertValue(v, texts);
      if (depth < 2 && typeof v === 'string') {
        const sub = parseMessage(s, texts, {}, depth + 1, cur);
        for (const u of sub.units) units.push(u);
      } else pushText(s);
    } else if (g === 3 && t === 0 && hex.length >= 8) {
      const b = new Uint8Array([byte(0), byte(1), byte(2), byte(3)]);
      waitScale.set(units.length, new DataView(b.buffer).getFloat32(0, true));
    } else if (g === 2 && t === 4) {
      const p = PARTICLE[byte(0)];
      const prev = units.length ? units[units.length - 1].ch : undefined;
      const b = hasBatchim(prev);
      if (p) pushText(b === false ? p[1] : p[0]);
    }
  }
  pushText(raw.slice(last));
  return { units, waitScale };
}

/** 태그를 푼 한 줄 문자열(\r 제거) */
export function plainText(raw: string, texts: Record<string, string>, inserts: Inserts = {}): string {
  return parseMessage(raw, texts, inserts)
    .units.map((u) => u.ch)
    .join('')
    .replace(/\r/g, '');
}

/** 글자 폭(render2d 진행폭 규칙). 글꼴이 명세에 없으면 글자 크기 × 개수 [근사] */
export function measure(font: FontSpec | undefined, fs: [number, number], cs: number, s: string): number {
  const chars = [...s];
  if (!font) return chars.length * fs[0];
  const sx = fs[0] / font.width;
  let w = 0;
  chars.forEach((ch, i) => {
    w += (font.glyphs[ch]?.adv ?? font.width) * sx + (i > 0 ? cs : 0);
  });
  return w;
}

const WHITE: Rgba = [255, 255, 255, 255];

/**
 * 여러 줄·색·부분 표시 글자 페인: 원래 글자 페인 자리(전역 행렬·알파)에 글자마다 txt 노드를 따로 그린다. 원래 페인의 글자는 비운다.
 * 줄 배치는 전체 문구로 먼저 정하고(textAlign, 줄 간격 = 글자 높이 + lineSpace), 아직 안 나온 글자는 숨긴다(message_window.md 9.4).
 */
export class RichTextPane {
  inst: LayoutInst | null = null;
  private count = 0;
  private charNodes: number[] = [];

  constructor(
    private readonly all: Spec,
    readonly host: LayoutInst,
    readonly path: string,
    private readonly lineSpace = 0,
    private readonly useColor = true,
  ) {
    host.setText(path, '');
  }

  private paneNode(): { inst: LayoutInst; node: number } | null {
    const f = this.host.find(this.path);
    return f ? { inst: f[0], node: f[1] } : null;
  }

  set(rt: RichText | null): void {
    this.charNodes = [];
    this.inst = null;
    if (!rt) return;
    const pn = this.paneNode();
    if (!pn) return;
    const pane = pn.inst.nodes[pn.node];
    const ts = pane.spec.txt;
    if (!ts) return;
    const font = this.all.fonts[ts.font];
    const sx = font ? ts.fs[0] / font.width : 1;
    const lh = ts.fs[1];
    const lines: { u: RichUnit; i: number }[][] = [[]];
    rt.units.forEach((u, i) => {
      if (u.ch === '\n') lines.push([]);
      else if (u.ch !== '\r') lines[lines.length - 1].push({ u, i });
    });
    const [l, b, r, t] = rectOf(pane.spec.o, pane.z[0], pane.z[1]);
    const H = lines.length * lh + (lines.length - 1) * this.lineSpace;
    const top = ts.al[1] === 1 ? t : ts.al[1] === -1 ? b + H : (b + t) / 2 + H / 2;
    const nodes: NodeSpec[] = [{ n: 'root', p: -1, k: 'null', v: true, ia: true, o: [0, 0], po: [0, 0], t: [0, 0], r: 0, s: [1, 1], z: [1, 1], a: 255 }];
    const adv = (ch: string): number => (font ? (font.glyphs[ch]?.adv ?? font.width) * sx : ts.fs[0]);
    const idxOf: number[] = new Array(rt.units.length).fill(-1);
    lines.forEach((line, li) => {
      const lw = line.reduce((a, x, k) => a + adv(x.u.ch) + (k > 0 ? ts.cs : 0), 0);
      let pen = ts.al[0] === -1 ? l : ts.al[0] === 1 ? r - lw : (l + r) / 2 - lw / 2;
      const cy = top - lh * (li + 0.5) - this.lineSpace * li;
      for (const { u, i } of line) {
        const w = adv(u.ch);
        const colorGlyph = !!font?.glyphs[u.ch]?.color;
        const vc: Rgba[] = colorGlyph && !ts.font.endsWith('_shadow') ? [WHITE, WHITE, WHITE, WHITE] : this.useColor && u.color ? [u.color, u.color, u.color, u.color] : pane.vc.map((c) => [...c] as Rgba);
        idxOf[i] = nodes.length;
        nodes.push({ n: `c${i}`, p: 0, k: 'txt', v: true, ia: false, o: [0, 0], po: [0, 0], t: [pen + w / 2, cy], r: 0, s: [1, 1], z: [w, lh], a: 255, vc, m: pane.spec.m, txt: { font: ts.font, fs: ts.fs, cs: 0, al: [0, 0], text: u.ch } });
        pen += w + ts.cs;
      }
    });
    const spec: LayoutSpec = { size: [1920, 1080], nodes, mats: pn.inst.spec.mats, anims: {} };
    const inst = new LayoutInst(`${this.path}#rich`, spec, this.all);
    inst.mats.splice(0, inst.mats.length, ...pn.inst.mats);
    this.inst = inst;
    this.charNodes = idxOf;
    this.reveal(rt.units.length);
  }

  /** 앞 k 글자만 보이기 */
  reveal(k: number): void {
    this.count = k;
    if (!this.inst) return;
    this.charNodes.forEach((ni, i) => {
      if (ni >= 0) this.inst!.nodes[ni].v = i < k;
    });
  }

  get revealed(): number {
    return this.count;
  }

  draw(r2d: Render2D, base: Mat3 = IDENTITY, baseAlpha = 255): void {
    if (!this.inst || !this.host.visible) return;
    const g = paneGlobal(this.host, this.path);
    if (!g || !g.visible) return;
    r2d.draw(this.inst, mul(base, g.m), (baseAlpha * g.alpha) / 255);
  }
}
