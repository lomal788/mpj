/**
 * mg1801 이펙트 단독 확인 — 헤드리스 크로미움에서 빈 장면에 6개 이펙트를 띄우고 몇 프레임 스크린샷을 남긴다.
 *   cd web && npx tsx test/out/effects_preview.ts   → test/out/effects_*.png
 * 페이지는 esbuild stdin 으로 묶어 page.route 로 내준다(파일을 만들지 않는다). 에셋은 startServer 가 web/ 를 내준다.
 */
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { WEB, findChromium, startServer } from '../../tools/browser';

const OUT = path.join(WEB, 'test', 'out');

const PAGE = `
import * as THREE from 'three';
import { Assets } from '../../script/view/assets';
import { EffectSystem } from '../../script/games/mg1801/view/effects';
import { Mg1801Game } from '../../script/games/mg1801/logic/game';

const canvas = document.createElement('canvas');
canvas.width = 1280; canvas.height = 720;
canvas.style.cssText = 'width:1280px;height:720px;display:block';
document.body.style.margin = '0';
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(1280, 720, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2d36);
const camera = new THREE.PerspectiveCamera(20, 16 / 9, 0.1, 10000);
const grid = new THREE.GridHelper(20, 20, 0x556070, 0x3a4250);
grid.position.y = -0.5;
scene.add(grid);
const fx = new EffectSystem(scene, new Assets('mg1801/'));
const w = window as any;
w.__fx = {
  ready: false, error: '',
  cam(p: number[], t: number[]) { camera.position.set(p[0], p[1], p[2]); camera.lookAt(t[0], t[1], t[2]); },
  spawn(n: string, x: number, y: number, z: number) { return fx.spawn(n, { x, y, z }); },
  start(n: string, x: number, y: number, z: number) { return fx.start(n, { x, y, z }); },
  stop(h: number) { fx.stop(h); },
  step(frames: number) { for (let i = 0; i < frames; i++) fx.update(1 / 60); renderer.render(scene, camera); return fx.activeCount; },
  runTo(target: number) {
    const g = (w.__g ??= new Mg1801Game({ players: [0, 1, 2, 3].map(() => ({ char: 'pc01', isCom: true, comLevel: 0 })), seed: 7, practice: false }));
    while (g.state.frame < target) {
      g.step([null, null, null, null]);
      for (const e of g.events) if ((e as any).k === 'effect') fx.spawn((e as any).name, (e as any).pos);
      fx.update(1 / 60);
    }
    renderer.render(scene, camera);
    return fx.activeCount;
  },
  dump() {
    const out: string[] = [];
    const clock = (fx as any).clock;
    for (const [def, b] of (fx as any).batches) {
      if (!/ring00|twinkle00/.test(def.name ?? '')) continue;
      const live: string[] = [];
      for (let i = 0; i < b.cap; i++) if (b.death[i] > clock) live.push(i + ':' + b.arrays.aP0.slice(i * 4, i * 4 + 4).map((v: number) => v.toFixed(2)).join(','));
      out.push(def.name + ' cap ' + b.cap + ' used ' + b.used + ' head ' + b.head + ' inst ' + b.geo.instanceCount + ' lastDeath ' + b.lastDeath.toFixed(1) + ' clock ' + clock.toFixed(1) + ' live ' + live.length + ' ' + live.slice(0, 8).join(' | '));
    }
    return out.join(' ### ');
  },
  clear() { fx.update(10); for (let i = 0; i < 40; i++) fx.update(0.25); renderer.render(scene, camera); return fx.activeCount; },
};
fx.load().then(() => { w.__fx.ready = true; }, (e: unknown) => { w.__fx.error = String(e); });
`;

const server = await startServer(0);
const bundle = await build({
  stdin: { contents: PAGE, resolveDir: path.join(WEB,'test','out'), loader: 'ts', sourcefile: 'effects_preview_page.ts' },
  absWorkingDir: WEB,
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'warning',
});
const js = bundle.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf-8"><base href="/"></head><body><script type="module" src="/__fx/preview.js"></script></body></html>`;

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/__fx/preview.html', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/__fx/preview.js', (r) => r.fulfill({ contentType: 'text/javascript', body: js }));
  await page.goto(server.url + '__fx/preview.html');
  await page.waitForFunction(() => (window as any).__fx?.ready || (window as any).__fx?.error, null, { timeout: 30000 });
  const err = await page.evaluate(() => (window as any).__fx.error);
  if (err) throw new Error(err);

  const ev = <T>(fn: string): Promise<T> => page.evaluate(fn) as Promise<T>;
  await ev("__fx.cam([0,2,23],[0,3,-3])");
  for (const f of [604, 1146, 1506]) {
    const c = await ev<number>(`__fx.runTo(${f})`);
    await page.screenshot({ path: path.join(OUT, `fx_replay_${f}.png`) });
    console.log('frame', f, 'active', c);
    console.log(await ev<string>('__fx.dump()'));
  }
} finally {
  console.log('errors', errors);
  await browser.close();
  await server.close();
}
