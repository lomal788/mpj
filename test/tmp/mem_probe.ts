/** 메모리 측정: WebGL 생성/삭제 호출을 세고, GC 뒤 JS 힙을 잰다. 한 판 진행 중 + 재시작 반복. */
import { chromium } from 'playwright-core';
import { findChromium, startServer } from '../../tools/browser';
const RESTARTS = Number(process.argv[2] ?? 3);
const server = await startServer(0);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.addInitScript({ content: `(() => {
  var c = {}; window.__glc = c;
  function inc(k) { c[k] = (c[k] || 0) + 1; }
  [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype].forEach(function (P) {
    [['createTexture','deleteTexture'],['createBuffer','deleteBuffer'],['createProgram','deleteProgram'],['createFramebuffer','deleteFramebuffer'],['createRenderbuffer','deleteRenderbuffer'],['createVertexArray','deleteVertexArray']].forEach(function (pr) {
      var m = P[pr[0]], d = P[pr[1]]; if (!m) return;
      P[pr[0]] = function () { inc(pr[0]); return m.apply(this, arguments); };
      P[pr[1]] = function (x) { if (x) inc(pr[1]); return d.apply(this, arguments); };
    });
  });
  var gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t) { var x = gc.apply(this, arguments); if (x && /webgl/.test(t) && !this.__counted) { this.__counted = 1; inc('webglContext'); } return x; };
  var AC = window.AudioContext; if (AC) { var dec = AC.prototype.decodeAudioData; AC.prototype.decodeAudioData = function () { inc('decodeAudio'); return dec.apply(this, arguments); }; }
})();` });
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
const snap = async (label: string) => {
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(300);
  const r = await page.evaluate(`(() => { var c = window.__glc; function live(a, b) { return (c[a] || 0) - (c[b] || 0); }
    return { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), tex: live('createTexture','deleteTexture'), buf: live('createBuffer','deleteBuffer'), prog: live('createProgram','deleteProgram'), fb: live('createFramebuffer','deleteFramebuffer'), vao: live('createVertexArray','deleteVertexArray'), ctx: c.webglContext || 0, decode: c.decodeAudio || 0, frame: window.__mpj && window.__mpj.frame, stage: window.__mpj && window.__mpj.stage }; })()`) as any;
  const dom = await cdp.send('Memory.getDOMCounters').catch(() => null as any);
  console.log(label.padEnd(18), JSON.stringify({ ...r, nodes: dom?.nodes, listeners: dom?.jsEventListeners }));
};
await page.goto(server.url + '?game=mg1801&fast=30&seed=7');
await page.waitForFunction(() => (window as any).__mpj !== undefined);
await snap('idle');
for (let k = 0; k < RESTARTS; k++) {
  await page.click('text=시작');
  await page.waitForFunction(() => (window as any).__mpj.stage === 'running', null, { timeout: 300000 });
  await snap(`run${k} loaded`);
  for (const f of [800, 1600, 2400]) {
    await page.waitForFunction((n) => (window as any).__mpj.frame >= n || (window as any).__mpj.stage === 'done', f, { timeout: 600000 });
    await snap(`run${k} f${f}`);
  }
  await page.waitForFunction(() => (window as any).__mpj.stage === 'done', null, { timeout: 600000 });
  await snap(`run${k} done`);
}
await page.click('text=그만');
await snap('stopped');
await browser.close();
await server.close();
