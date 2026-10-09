/**
 * 공용 로더 관리자 코어 시험(노드, DOM·WebGL 없음) — 큐 순서·올리기·중복 제거·동시 수·P0 막기·프레임 예산·참조 수/release·LRU 후보·묶음·
 * 매 프레임 할당 0(GC 관찰), 그리고 3층 import 규칙(코어 import 0, 어댑터 = three + 코어). 설계: docs/engine/loader_manager.md §11.
 *
 *   npx tsx tools/test_assetcore.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerformanceObserver } from 'node:perf_hooks';
import {
  createAssetManager,
  FrameScheduler,
  P0,
  P1,
  P2,
  P3,
  Ring,
  RUN_DONE,
  RUN_MORE,
  RUN_WAIT,
  ST_EVICTED,
  ST_QUEUED,
  ST_READY,
  type AssetHandler,
  type FetchLike,
  type SchedTask,
} from '../script/game/lib/assetcore';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
let count = 0;
const ok = (cond: boolean, msg: string): void => {
  count++;
  if (!cond) {
    fails++;
    console.log('  실패:', msg);
  }
};
const eq = (a: unknown, b: unknown, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} = ${JSON.stringify(b)}`);
const flush = async (n = 6): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

/** 손으로 끝내는 가짜 받기: 시작 순서 기록, done(key) 로 끝냄 */
function fakeIo() {
  const started: string[] = [];
  const waiting = new Map<string, () => void>();
  const io = {
    fetch(url: string): Promise<FetchLike> {
      started.push(url);
      return new Promise((res) => {
        waiting.set(url, () =>
          res({
            ok: true,
            status: 200,
            arrayBuffer: async () => new ArrayBuffer(url.length),
            json: async () => ({ url }),
            text: async () => url,
          }),
        );
      });
    },
  };
  const done = (url: string): void => {
    const f = waiting.get(url);
    waiting.delete(url);
    f?.();
  };
  return { io, started, done, waiting };
}

const bytesH: AssetHandler<ArrayBuffer, ArrayBuffer> = {
  kind: 'b',
  fetch: (url, _k, io) => io!.fetch(url).then((r) => r.arrayBuffer()),
  bytes: (b) => b.byteLength,
};

console.log('1. 링');
{
  const r = new Ring<number>(2);
  for (let i = 0; i < 5; i++) r.push(i, i * 10);
  eq([r.size, r.capacity, r.peek(), r.peekTag()], [5, 8, 0, 0], '늘어남·머리');
  const out: number[] = [];
  while (r.size) out.push(r.shift()!);
  eq(out, [0, 1, 2, 3, 4], '순서 유지');
}

console.log('2. 큐 순서·동시 수·P0 막기·올리기');
{
  const f = fakeIo();
  let t = 0;
  const m = createAssetManager({ env: { now: () => t, io: f.io }, resolve: (k) => k, handlers: [bytesH], maxFetch: 2 });
  m.want('p3a', 'b', P3);
  m.want('p1a', 'b', P1);
  eq(f.started, ['p3a', 'p1a'], '빈 자리가 있으면 바로 시작');
  m.want('p2a', 'b', P2);
  m.want('p0a', 'b', P0);
  m.want('p0b', 'b', P0);
  m.want('p1b', 'b', P1);
  m.want('p3b', 'b', P3);
  eq(f.started.length, 2, '동시 2 제한');
  eq(m.stats.p0Active, 2, 'P0 활성 2');
  m.raise('p3b', P1);
  eq(m.priority('p3b'), P1, '올리기');
  m.raise('p3b', P3);
  eq(m.priority('p3b'), P1, '낮추지 않음');
  f.done('p3a');
  await flush();
  f.done('p1a');
  await flush();
  eq(f.started.slice(2), ['p0a', 'p0b'], 'P0 먼저');
  f.done('p0a');
  await flush();
  eq(f.started.slice(4), ['p1b'], 'P0 진행 중에도 P1 은 시작');
  f.done('p1b');
  await flush();
  eq(f.started.slice(5), ['p3b'], '올린 p3b(P1) 가 P2 보다 먼저');
  f.done('p3b');
  await flush();
  eq(f.started.length, 6, 'P0(p0b) 진행 중이면 P2 새 시작 안 함');
  f.done('p0b');
  await flush();
  eq(f.started.slice(6), ['p2a'], 'P0 끝나면 P2 시작');
  f.done('p2a');
  await flush();
  eq([m.stats.p0Active, m.stats.inflight, m.stats.maxInflight, m.stats.ready], [0, 0, 2, 7], '통계');
}

console.log('3. 중복 제거·Promise 공유·실패');
{
  const f = fakeIo();
  const m = createAssetManager({ env: { now: () => 0, io: f.io }, resolve: (k) => `u/${k}`, handlers: [bytesH, { kind: 'j', fetch: (url, _k, io) => io!.fetch(url).then((r) => r.json()) }] });
  const a = m.get('x', 'b', P1);
  const b = m.get('x', 'b', P0);
  ok(a === b, '같은 키 = 같은 Promise');
  eq(f.started, ['u/x'], '받기 1번(resolver 적용)');
  f.done('u/x');
  const v = await a;
  eq((v as ArrayBuffer).byteLength, 3, '값');
  const c = m.get('x', 'b');
  ok(c === a, '준비 뒤에도 같은 Promise');
  eq(m.stats.hits, 1, '적중 1');
  let threw = false;
  try {
    m.get('x', 'j');
  } catch {
    threw = true;
  }
  ok(threw, '같은 키 다른 종류는 오류');
  const bad = createAssetManager({ env: { now: () => 0, io: { fetch: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => null, text: async () => '' }) } }, resolve: (k) => k, handlers: [{ kind: 'j', fetch: async (url, _k, io) => { const r = await io!.fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.json(); } }] });
  let err = '';
  await bad.get('nope', 'j', P0).catch((e: Error) => (err = e.message));
  eq([err, bad.stats.failed, bad.stats.p0Active], ['404', 1, 0], '실패는 거부·P0 활성 해제');
}

console.log('4. 풀기·올리기 단계와 프레임 예산');
{
  const f = fakeIo();
  let t = 0;
  const log: string[] = [];
  const up: AssetHandler<string, ArrayBuffer> = {
    kind: 'u',
    fetch: (url, _k, io) => io!.fetch(url).then((r) => r.arrayBuffer()),
    decode: (_raw, key) => `v:${key}`,
    upload: (v, step) => {
      log.push(`${v}#${step}`);
      t += 3;
      return step < 2 ? RUN_MORE : RUN_DONE;
    },
    gpuBytes: () => 100,
    dispose: (v) => log.push(`dispose ${v}`),
  };
  const m = createAssetManager({ env: { now: () => t, io: f.io }, resolve: (k) => k, handlers: [up], budgetMs: 4 });
  const p = m.get('a', 'u', P1);
  m.want('b', 'u', P3);
  f.done('a');
  f.done('b');
  await flush();
  eq([m.state('a'), m.scheduler.pending], [4, 2], '올리기 대기(uploading)');
  m.frame();
  eq(log, ['v:a#0', 'v:a#1'], '예산 4 ms 안 2 단위(같은 작업 이어서)');
  m.raise('b', P0);
  m.frame();
  eq(log.slice(2), ['v:b#0', 'v:b#1'], '올린 b 가 먼저');
  m.frame();
  m.frame();
  m.frame();
  await flush();
  eq([m.state('a'), m.state('b'), await p], [ST_READY, ST_READY, 'v:a'], '준비 끝');
  eq(m.scheduler.stats.overBudget, 3, '예산 넘은 프레임(단위 3 ms × 2 = 6 > 4)');
  m.want('c', 'u', P3);
  m.release('nobody');
  const out: string[] = [];
  m.get('a', 'u', P3, 'scr');
  f.done('c');
  await flush();
  while (m.scheduler.pending) m.frame();
  m.gpuBudget = 150;
  eq(m.gpuCandidates(out, 200), 200, 'LRU 후보 바이트');
  eq(out, ['b', 'c'], 'refs 0 만·오래 안 쓴 순(a 는 owner scr 가 잡음)');
  const n = m.trim();
  eq([n, m.state('b'), m.state('c'), m.stats.gpuBytes], [2, ST_EVICTED, ST_EVICTED, 100], 'trim → dispose·evicted');
  ok(log.includes('dispose v:b'), '처리기 dispose 콜백');
  m.release('scr');
  eq(m.refs('a'), 0, 'release 는 refs 만');
  eq(m.state('a'), ST_READY, 'release 는 지우지 않음');
  const back = m.get('b', 'u', P0);
  eq(m.state('b'), 4, 'evicted 를 다시 get → 올리기만');
  while (m.scheduler.pending) m.frame();
  eq(await back, 'v:b', '다시 준비');
  eq(f.started.filter((x) => x === 'b').length, 1, '다시 받지 않음');
}

console.log('5. 스케줄러 WAIT·등급·tick');
{
  let t = 0;
  let ticks: (() => void) | null = null;
  const s = new FrameScheduler({ now: () => t, tick: (fn) => (ticks = fn) }, 100);
  const order: string[] = [];
  const mk = (name: string, steps: number[]): SchedTask => {
    let i = 0;
    return {
      schedPri: -1,
      schedGen: 0,
      schedMark: -1,
      run() {
        order.push(name);
        return steps[i++] ?? RUN_DONE;
      },
    };
  };
  const w = mk('w', [RUN_WAIT, RUN_WAIT, RUN_DONE]);
  const a = mk('a', [RUN_MORE, RUN_DONE]);
  s.add(w, P1);
  s.add(a, P3);
  ok(ticks !== null, '할 일이 생기면 tick 요청');
  s.frame();
  eq(order, ['w', 'a', 'a'], 'WAIT 는 이번 프레임 다시 안 봄');
  s.frame();
  eq(order.slice(3), ['w'], '다음 프레임 다시');
  s.frame();
  eq([order.length, s.pending], [5, 0], '끝');
  const c = mk('c', [RUN_MORE, RUN_MORE, RUN_DONE]);
  s.add(c, P3);
  s.remove(c);
  s.frame();
  eq([order.length, s.pending], [5, 0], 'remove 는 돌리지 않음');
}

console.log('6. 묶음');
{
  const f = fakeIo();
  const m = createAssetManager({ env: { now: () => 0, io: f.io }, resolve: (k) => k, handlers: [bytesH], maxFetch: 8 });
  m.defineBundle('plaza:p0', ['a', 'b', 'c'], 'b');
  m.wantBundle('plaza:p0', P0, 'plaza');
  eq([m.bundleSize('plaza:p0'), m.bundleReady('plaza:p0'), m.stats.p0Active], [3, 0, 3], '묶음 요청');
  const all = m.whenBundle('plaza:p0');
  for (const k of ['a', 'b', 'c']) f.done(k);
  await all;
  eq([m.bundleReady('plaza:p0'), m.refs('b')], [3, 1], '묶음 준비·owner');
}

console.log('7. 매 프레임 할당 0 (GC 관찰)');
{
  let t = 0;
  const s = new FrameScheduler({ now: () => t++ }, 1e9);
  class T implements SchedTask {
    schedPri = -1;
    schedGen = 0;
    schedMark = -1;
    n = 0;
    run(): number {
      this.n++;
      return (this.n & 3) === 0 ? RUN_WAIT : RUN_MORE;
    }
  }
  const tasks = Array.from({ length: 64 }, () => new T());
  tasks.forEach((x, i) => s.add(x, i & 3));
  const f = fakeIo();
  const m = createAssetManager({ env: { now: () => t, io: f.io }, resolve: (k) => k, handlers: [bytesH], maxFetch: 1 });
  const keys = Array.from({ length: 64 }, (_, i) => `k${i}`);
  for (const k of keys) m.want(k, 'b', P3);
  for (let i = 0; i < 2000; i++) s.frame();
  let gcs = 0;
  const obs = new PerformanceObserver((l) => (gcs += l.getEntries().length));
  obs.observe({ entryTypes: ['gc'] });
  await flush(2);
  gcs = 0;
  for (let i = 0; i < 200000; i++) {
    s.frame();
    m.raise(keys[i & 63], (i & 1) as 0 | 1);
    m.frame();
  }
  await flush(4);
  obs.disconnect();
  ok(gcs <= 1, `20만 프레임(스케줄러 + 올리기) 동안 GC ${gcs}회(≤ 1) — 시계는 정수(브라우저 performance.now() 가 돌려주는 실수 상자는 코어 밖)`);
  eq(s.pending, 64, '작업은 그대로 남음(계속 MORE/WAIT)');
  ok(m.state('k5') === ST_QUEUED || m.state('k5') === 2, '받기 대기 유지');
}

console.log('8. 3층 import 규칙(loader_manager.md §11.1)');
{
  const imports = (dir: string): { file: string; spec: string }[] => {
    const out: { file: string; spec: string }[] = [];
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) {
        out.push(...imports(p));
        continue;
      }
      if (!f.endsWith('.ts')) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n;]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) out.push({ file: p.slice(WEB.length + 1), spec: m[1] ?? m[2] ?? m[3] });
    }
    return out;
  };
  const core = join(WEB, 'script/game/lib/assetcore');
  const coreImports = imports(core);
  eq(coreImports, [], '코어 폴더 import 0');
  const coreSrc = readdirSync(core).map((f) => readFileSync(join(core, f), 'utf8')).join('\n');
  ok(!/\b(window|document|performance|requestAnimationFrame|HTMLElement|Response|globalThis)\b/.test(coreSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')), '코어가 DOM·전역을 직접 쓰지 않음(주입만)');
  const adapter = join(WEB, 'script/game/lib/assetcore-three');
  const bad = imports(adapter).filter((x) => x.spec !== 'three' && resolve(join(WEB, dirname(x.file)), x.spec) !== core && !resolve(join(WEB, dirname(x.file)), x.spec).startsWith(core + '/') && !resolve(join(WEB, dirname(x.file)), x.spec).startsWith(core + '\\'));
  eq(bad, [], '어댑터 폴더 import ⊂ {three, 코어}');
}

console.log(fails ? `실패 ${fails} / ${count}` : `통과 ${count}/${count}`);
process.exit(fails ? 1 : 0);
