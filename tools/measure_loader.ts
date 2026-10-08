/**
 * 로더 관리자 실측(헤드리스 1회) — index.html?plaza=1 을 Chrome 망 제한(기본 4G 9 Mbps·RTT 170 ms, CDP Network.emulateNetworkConditions)으로
 * 이전 방식(?loader=seq)과 단계 로딩(staged)을 새 캐시로 한 번씩 열어 잰다. 설계: docs/engine/loader_manager.md §7·§12.
 *
 * 재는 것: 첫 프레임(흐름 'plaza' 가 된 뒤 첫 rAF)까지 시간·받은 양, 그 뒤 RUN_S 초 동안(앞으로 걷기 포함) 50 ms 넘는 프레임 수·최대 프레임,
 * 그 동안 "보이는데 준비 안 된 모델 수"의 최대(world.loaderDebug().visibleNotReady)와 준비 안 거친 보이는 메시 수, 콘솔 오류, 묶음 진행.
 *
 *   npx tsx tools/measure_loader.ts                 4G, 압축본(?assets=dist), seq → staged
 *   npx tsx tools/measure_loader.ts --mbps 1.6 --rtt 300 --only staged --src
 */
import { chromium, type Page } from 'playwright-core';
import { findChromium, startServer } from './browser';

const arg = (n: string, d: string): string => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const MBPS = Number(arg('--mbps', '9'));
const RTT = Number(arg('--rtt', '170'));
const RUN_S = Number(arg('--run', '25'));
const ONLY = arg('--only', '');
const MODES = (ONLY ? [ONLY] : ['seq', 'staged']) as ('seq' | 'staged')[];
const ASSETS = process.argv.includes('--src') ? 'src' : 'dist';
const VERBOSE = process.argv.includes('--verbose');

type Dbg = { loader?: Record<string, unknown> | null; unprepared?: { count: number; names: string[] }; warmup?: unknown; prep?: unknown };
type Win = { __mpj?: { flow?: string; error?: string | null; plaza?: () => Dbg | null }; __plaza?: { press(s: number, b: number, st?: { lx: number; ly: number }, f?: number): void }; __lm?: { first: number; frames: number[] } };

const server = await startServer(Number(arg('--port', '5211')));
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results: Record<string, unknown>[] = [];

async function runOne(mode: 'seq' | 'staged'): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page: Page = await ctx.newPage();
  const errors: string[] = [];
  const T0 = Date.now();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (VERBOSE && (m.type() === 'error' || m.type() === 'warning')) console.log(`  [${((Date.now() - T0) / 1000).toFixed(1)}s ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  page.on('crash', () => console.log(`  [${((Date.now() - T0) / 1000).toFixed(1)}s] 페이지 충돌 — 받은 ${(bytes / 1048576).toFixed(1)} MB, 요청 ${reqs}`));
  page.on('pageerror', (e) => {
    errors.push(String(e));
    if (VERBOSE) console.log(`  [${((Date.now() - T0) / 1000).toFixed(1)}s pageerror] ${String(e.stack ?? e).slice(0, 600)}`);
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  let lastB = -1;
  const prog = setInterval(() => {
    if (!VERBOSE || bytes === lastB) return;
    lastB = bytes;
    void page
      .evaluate(() => ({ flow: (window as unknown as Win).__mpj?.flow, msg: document.querySelector('.jw-msg, #msg')?.textContent ?? '', mgr: ((m) => (m ? { stats: m.stats, scheduler: { stats: m.scheduler.stats, pending: m.scheduler.pending } } : null))((globalThis as unknown as { __mpjAssetManager?: { stats: unknown; scheduler: { stats: unknown; pending: number } } }).__mpjAssetManager) }))
      .then((x) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(0)}s] 받은 ${(bytes / 1048576).toFixed(1)} MB 요청 ${reqs} 흐름 ${x.flow} ${x.msg.replace(/\s+/g, ' ').slice(0, 60)} 관리자 ${JSON.stringify(x.mgr ? { s: x.mgr.stats, sch: x.mgr.scheduler.stats, pend: x.mgr.scheduler.pending } : null)}`))
      .catch(() => undefined);
  }, 5000);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: RTT, downloadThroughput: (MBPS * 1e6) / 8, uploadThroughput: (MBPS * 1e6) / 8 });
  let bytes = 0;
  let reqs = 0;
  let firstBytes = -1;
  let firstReqs = -1;
  cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => {
    bytes += e.encodedDataLength;
    reqs++;
  });
  await page.addInitScript(
    `(() => { const w = window; const lm = { first: -1, frames: [] }; w.__lm = lm; let last = -1;
      function loop(t) { if (w.__mpj && w.__mpj.flow === 'plaza') { if (lm.first < 0) lm.first = t; else lm.frames.push(t - last); last = t; } requestAnimationFrame(loop); }
      requestAnimationFrame(loop); })();`,
  );
  const t0 = Date.now();
  await page.goto(`${server.url}index.html?plaza=1&skipsetup=1&mute=1&auto=1&assets=${ASSETS}&loader=${mode}`);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  await page.waitForFunction('(window.__lm && window.__lm.first >= 0) || !!(window.__mpj && window.__mpj.error)', null, { timeout: 600000, polling: 50 });
  const firstMs = await page.evaluate(() => (window as unknown as Win).__lm!.first);
  firstBytes = bytes;
  firstReqs = reqs;
  const tFirst = (Date.now() - t0) / 1000;
  let maxVnr = 0;
  let maxUnprep = 0;
  let unprepNames: string[] = [];
  const end = Date.now() + RUN_S * 1000;
  let walk = 0;
  while (Date.now() < end) {
    if (walk++ % 8 === 0) await page.evaluate(() => (window as unknown as Win).__plaza?.press(0, 0, { lx: 0.3, ly: 1 }, 60));
    const d = await page.evaluate(() => {
      const x = (window as unknown as Win).__mpj?.plaza?.();
      return x ? { vnr: Number((x.loader as { visibleNotReady?: number } | null)?.visibleNotReady ?? 0), un: x.unprepared ?? { count: 0, names: [] } } : null;
    });
    if (d) {
      maxVnr = Math.max(maxVnr, d.vnr);
      if (d.un.count > maxUnprep) {
        maxUnprep = d.un.count;
        unprepNames = d.un.names;
      }
    }
    await page.waitForTimeout(250);
  }
  const lm = await page.evaluate(() => (window as unknown as Win).__lm!);
  const dbg = await page.evaluate(() => (window as unknown as Win).__mpj?.plaza?.() ?? null);
  const sched = await page.evaluate(() => (globalThis as unknown as { __mpjAssetManager?: { scheduler: { stats: unknown } } }).__mpjAssetManager?.scheduler.stats ?? null);
  const frames = lm.frames;
  const r = {
    mode,
    assets: ASSETS,
    net: `${MBPS} Mbps / RTT ${RTT} ms`,
    renderer,
    firstFrameS: +tFirst.toFixed(2),
    firstFramePageMs: Math.round(firstMs),
    firstMB: +(firstBytes / 1048576).toFixed(2),
    firstReqs,
    afterRunMB: +(bytes / 1048576).toFixed(2),
    afterRunReqs: reqs,
    frames: frames.length,
    over50: frames.filter((f) => f > 50).length,
    over100: frames.filter((f) => f > 100).length,
    maxFrameMs: Math.round(Math.max(0, ...frames)),
    medianFrameMs: +(frames.slice().sort((a, b) => a - b)[Math.floor(frames.length / 2)] ?? 0).toFixed(1),
    maxVisibleNotReady: maxVnr,
    maxUnpreparedVisibleMeshes: maxUnprep,
    unpreparedNames: unprepNames,
    loader: dbg?.loader ?? null,
    warmup: dbg?.warmup ?? null,
    prep: dbg?.prep ?? null,
    sched,
    consoleErrors: errors.length,
    errors: errors.slice(0, 5),
  };
  clearInterval(prog);
  results.push(r);
  console.log(JSON.stringify(r, null, 1));
  await ctx.close();
}

try {
  for (const m of MODES) await runOne(m);
} finally {
  await browser.close();
  await server.close();
}
console.log('요약', JSON.stringify(results.map((r) => ({ mode: r.mode, firstFrameS: r.firstFrameS, firstMB: r.firstMB, over50: r.over50, maxFrameMs: r.maxFrameMs, maxVisibleNotReady: r.maxVisibleNotReady, consoleErrors: r.consoleErrors }))));
