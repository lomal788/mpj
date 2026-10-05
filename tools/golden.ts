/**
 * 골든 기록 형식 — 원본(또는 기준 구현)에서 뽑은 프레임별 상태를 jsonl.gz 로 남기고 웹 로직과 비트 단위로 대조한다.
 *
 * 형식 'jamboree.golden' v1:
 *   1행  {"format":"jamboree.golden","version":1,"meta":{…}}
 *   2행~ 프레임마다 한 행. {"f":프레임,"s":상태 패치,"e":사건[]}
 *        상태는 직전 행에 거는 JSON Merge Patch(RFC 7396)다. 첫 프레임은 전체 상태.
 * 숫자: f32 로 정확히 표현되는 값은 가장 짧은 10진, 아니면 "#d:<hex64>"(double 비트), -0 과 NaN 은 "#n:<hex64>".
 *       그래서 읽으면 비트까지 복원된다.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

export interface GoldenMeta {
  game: string;
  seed: number;
  /** 어디서 뽑았는지(예: '원본 실행', '재구현') */
  source: string;
  [k: string]: unknown;
}

export interface GoldenFrame {
  f: number;
  s: unknown;
  e: unknown[];
}

const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);
const hexOf = (v: number): string => {
  f64[0] = v;
  return u64[0].toString(16).padStart(16, '0');
};
const fromHex = (h: string): number => {
  u64[0] = BigInt(`0x${h}`);
  return f64[0];
};

/** 숫자 → 비트 보존 표기 */
export function encNum(v: number): number | string {
  if (Number.isNaN(v) || Object.is(v, -0)) return `#n:${hexOf(v)}`;
  if (!Number.isFinite(v)) return `#d:${hexOf(v)}`;
  if (Math.fround(v) === v || Number.isInteger(v)) return v;
  return `#d:${hexOf(v)}`;
}

export function decNum(v: unknown): unknown {
  if (typeof v === 'string' && (v.startsWith('#d:') || v.startsWith('#n:'))) return fromHex(v.slice(3));
  return v;
}

const enc = (x: unknown): unknown => {
  if (typeof x === 'number') return encNum(x);
  if (Array.isArray(x)) return x.map(enc);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)]));
  return x;
};

const dec = (x: unknown): unknown => {
  if (typeof x === 'string') return decNum(x);
  if (Array.isArray(x)) return x.map(dec);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, dec(v)]));
  return x;
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** a → b 로 가는 Merge Patch(같으면 undefined) */
export function diffPatch(a: unknown, b: unknown): unknown {
  if (isObj(a) && isObj(b)) {
    const out: Record<string, unknown> = {};
    let any = false;
    for (const k of Object.keys(a)) {
      if (!(k in b)) {
        out[k] = null;
        any = true;
      }
    }
    for (const [k, v] of Object.entries(b)) {
      const p = diffPatch(a[k], v);
      if (p !== undefined) {
        out[k] = p;
        any = true;
      }
    }
    return any ? out : undefined;
  }
  return JSON.stringify(a) === JSON.stringify(b) ? undefined : b;
}

export function applyPatch(a: unknown, p: unknown): unknown {
  if (!isObj(p)) return p;
  const out: Record<string, unknown> = isObj(a) ? { ...a } : {};
  for (const [k, v] of Object.entries(p)) {
    if (v === null) delete out[k];
    else out[k] = applyPatch(out[k], v);
  }
  return out;
}

export class GoldenWriter {
  private readonly lines: string[] = [];
  private prev: unknown = undefined;

  constructor(meta: GoldenMeta) {
    this.lines.push(JSON.stringify({ format: 'jamboree.golden', version: 1, meta }));
  }

  push(frame: number, state: unknown, events: readonly unknown[]): void {
    const s = enc(state);
    const patch = this.prev === undefined ? s : (diffPatch(this.prev, s) ?? {});
    this.prev = s;
    this.lines.push(JSON.stringify({ f: frame, s: patch, e: enc(events) }));
  }

  save(path: string): void {
    fs.writeFileSync(path, zlib.gzipSync(this.lines.join('\n') + '\n'));
  }
}

export function readGolden(path: string): { meta: GoldenMeta; frames: GoldenFrame[] } {
  const text = zlib.gunzipSync(fs.readFileSync(path)).toString('utf8');
  const [head, ...rows] = text.split('\n').filter((l) => l !== '');
  const h = JSON.parse(head) as { format: string; version: number; meta: GoldenMeta };
  if (h.format !== 'jamboree.golden' || h.version !== 1) throw new Error(`골든 형식이 아니다: ${path}`);
  let state: unknown = undefined;
  const frames: GoldenFrame[] = [];
  for (const r of rows) {
    const row = JSON.parse(r) as GoldenFrame;
    state = applyPatch(state, row.s);
    frames.push({ f: row.f, s: dec(state), e: dec(row.e) as unknown[] });
  }
  return { meta: h.meta, frames };
}
