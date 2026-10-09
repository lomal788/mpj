/**
 * 미니게임 결정성 시험 도우미(노드) — docs/shell/minigame_scene.md §12.12.6 결정성 규칙.
 * determinismCheck: 같은 seed·같은 입력 기록(패드 + 사운드 관측)으로 한 판을 두 번 돌려 매 틱 로직 상태 해시(순환 참조·−0·NaN 안전)를 비교한다.
 * staticLogicCheck: 로직 파일에서 벽시계·Math.random·직접 입력·DOM 사용을 찾는다(주석은 빼고 본다). 새 게임은 이 둘을 시험에서 부른다.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SoundSnapshot } from '../script/game';
import type { MgPadInput } from '@app/minigame/frame/scene';
import type { NodeMgRun } from './mg_node_host';

export function stableText(root: unknown): string {
  const seen = new Map<object, number>();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'number') return Number.isFinite(v) && !Object.is(v, -0) ? v : `#${Object.is(v, -0) ? '-0' : String(v)}`;
    if (typeof v === 'function') return undefined;
    if (v === null || typeof v !== 'object') return v;
    const id = seen.get(v as object);
    if (id !== undefined) return `#ref${id}`;
    seen.set(v as object, seen.size);
    if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>, (x) => walk(x));
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Map) return [...v.entries()].map(([k, x]) => [walk(k), walk(x)]);
    if (v instanceof Set) return [...v].map(walk);
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) o[k] = walk((v as Record<string, unknown>)[k]);
    return o;
  };
  return JSON.stringify(walk(root));
}

export const stateHash = (v: unknown): string => crypto.createHash('sha1').update(stableText(v)).digest('hex');

export interface InputRecord {
  pads(frame: number): readonly (MgPadInput | null)[];
  sound?(frame: number, run: NodeMgRun): SoundSnapshot | null;
  after?(frame: number, run: NodeMgRun): void;
}

export interface DeterminismResult {
  ok: boolean;
  ticks: number;
  firstDiff: number;
  ended: boolean;
  lastHash: string;
}

export function determinismCheck(
  make: () => NodeMgRun,
  record: () => InputRecord,
  o: { maxTicks?: number; snapshot?: (run: NodeMgRun) => unknown } = {},
): DeterminismResult {
  const snap = o.snapshot ?? ((r: NodeMgRun) => [r.run.logic.state, r.run.logic.events, r.run.scene.stage, r.run.scene.sub, r.run.scene.frame, r.run.rng.calls, r.run.scene.players]);
  const once = (): { hashes: string[]; ended: boolean } => {
    const run = make();
    const rec = record();
    const hashes: string[] = [];
    const max = o.maxTicks ?? 20000;
    for (let f = 1; f <= max && !run.run.ended; f++) {
      run.step(rec.pads(f), rec.sound?.(f, run) ?? null);
      rec.after?.(f, run);
      hashes.push(stateHash(snap(run)));
    }
    return { hashes, ended: run.run.ended };
  };
  const a = once();
  const b = once();
  let firstDiff = -1;
  for (let i = 0; i < Math.max(a.hashes.length, b.hashes.length); i++) {
    if (a.hashes[i] !== b.hashes[i]) {
      firstDiff = i;
      break;
    }
  }
  return { ok: firstDiff < 0, ticks: a.hashes.length, firstDiff, ended: a.ended && b.ended, lastHash: a.hashes[a.hashes.length - 1] ?? '' };
}

const FORBIDDEN: [string, RegExp][] = [
  ['Math.random', /\bMath\.random\b/],
  ['performance.now', /\bperformance\.now\b/],
  ['Date.now', /\bDate\.now\b/],
  ['new Date', /\bnew\s+Date\b/],
  ['navigator.getGamepads', /\bnavigator\s*\.\s*getGamepads\b/],
  ['requestAnimationFrame', /\brequestAnimationFrame\b/],
  ['document.', /\bdocument\s*\./],
  ['window.', /\bwindow\s*\./],
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function filesOf(p: string): string[] {
  const st = fs.statSync(p);
  if (st.isFile()) return p.endsWith('.ts') ? [p] : [];
  return fs.readdirSync(p).flatMap((f) => (fs.statSync(path.join(p, f)).isFile() ? filesOf(path.join(p, f)) : []));
}

export function staticLogicCheck(paths: readonly string[]): { files: number; bad: string[] } {
  const bad: string[] = [];
  let files = 0;
  for (const p of paths) {
    for (const f of filesOf(p)) {
      files++;
      const lines = stripComments(fs.readFileSync(f, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        for (const [name, re] of FORBIDDEN) if (re.test(line)) bad.push(`${path.basename(path.dirname(f))}/${path.basename(f)}:${i + 1} ${name}`);
      });
    }
  }
  return { files, bad };
}
