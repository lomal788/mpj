/**
 * 에셋 압축 검증(헤드리스) — 같은 장면을 소스 모드(?assets=src)와 압축 모드(?assets=dist)로 찍어 픽셀 차이·로드 시간·전송 바이트·
 * GPU 텍스처 메모리를 비교한다. 설계: docs/engine/assets_pipeline.md §8. 결과: test/out/assets/*.png, test/out/assets/result.json
 *
 *   npx tsx tools/shot_assets.ts              plaza(c1 계단 앞)·charselect·mg1801 세 장면
 *   npx tsx tools/shot_assets.ts plaza        한 장면만
 *
 * 결정성: Playwright 가짜 시계(멈춤)로 rAF·performance.now 를 쥐고 fast=1(rAF 하나 = 스텝 하나)로 같은 프레임 수만큼 돌린다. 로드 중
 * 타이머를 기다리는 곳은 네트워크가 1 s 넘게 조용할 때만 16 ms 씩 민다. Math.random 은 고정 시드. 늦게 읽는 모델은 시계를 멈춘 채
 * 네트워크가 조용해질 때까지 기다려 두 모드에서 같은 프레임에 붙게 한다.
 * GPU 메모리: WebGL2 texStorage2D·3D, texImage2D, compressedTexImage2D, generateMipmap, deleteTexture 를 감싸 살아 있는 텍스처 바이트를 센다
 * (렌더 타깃 포함 — 두 모드에서 같으므로 차이는 텍스처 몫).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'assets');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** 페이지 시작 전에 넣는 계측: 고정 난수, GPU 텍스처 바이트 집계, 자원 바이트 */
const INIT = `(() => {
  let s = 0x9e3779b9;
  Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
  const C = { 0x83F0: .5, 0x83F1: .5, 0x83F2: 1, 0x83F3: 1, 0x8C4C: .5, 0x8C4D: .5, 0x8C4E: 1, 0x8C4F: 1, 0x8E8C: 1, 0x8E8D: 1, 0x8E8E: 1, 0x8E8F: 1,
    0x9270: .5, 0x9271: .5, 0x9272: 1, 0x9273: 1, 0x9274: .5, 0x9275: .5, 0x9276: .5, 0x9277: .5, 0x9278: 1, 0x9279: 1, 0x8D64: .5, 0x93B0: 1, 0x93D0: 1,
    0x8C00: .5, 0x8C01: .25, 0x8C02: .5, 0x8C03: .25 };
  const U = { 0x8058: 4, 0x8C43: 4, 0x8051: 4, 0x8C41: 4, 0x881A: 8, 0x881B: 8, 0x8814: 16, 0x8815: 16, 0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822F: 4, 0x822E: 4, 0x8230: 8,
    0x88F0: 4, 0x81A6: 4, 0x81A5: 2, 0x8CAC: 4, 0x8C3A: 4, 0x8C3D: 4, 0x8059: 4, 0x8D62: 2, 0x8056: 2, 0x8057: 2, 0x1908: 4, 0x1907: 4, 0x1909: 1, 0x190A: 2, 0x1906: 1 };
  const typeMul = (t) => (t === 0x140B || t === 0x8D61 ? 2 : t === 0x1406 ? 4 : 1);
  const bpp = (f, t) => (C[f] !== undefined ? C[f] : (U[f] ?? 4) * (f === 0x1908 || f === 0x1907 ? typeMul(t) : 1));
  const CUBE = 0x8513;
  const faceOf = (t) => (t >= 0x8515 && t <= 0x851A ? [CUBE, t - 0x8515] : [t, 0]);
  const rec = new Map(); const bound = new WeakMap(); const kinds = new Map();
  const put = (gl, target, key, bytes, kind) => { const b = bound.get(gl); const t = b && b[target]; if (!t) return; let m = rec.get(t); if (!m) rec.set(t, (m = new Map())); m.set(key, bytes); if (kind) kinds.set(t, kind); };
  for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    const w = (n, f) => { const o = P[n]; if (!o) return; P[n] = function (...a) { try { f(this, a); } catch (e) {} return o.apply(this, a); }; };
    w('bindTexture', (gl, [target, t]) => { let b = bound.get(gl); if (!b) bound.set(gl, (b = {})); b[target] = t; });
    w('deleteTexture', (gl, [t]) => { rec.delete(t); kinds.delete(t); });
    w('texStorage2D', (gl, [target, levels, f, wd, ht]) => { let n = 0; for (let l = 0; l < levels; l++) n += Math.max(1, wd >> l) * Math.max(1, ht >> l) * bpp(f); put(gl, target, 'S', n * (target === CUBE ? 6 : 1), C[f] !== undefined ? 'compressed' : 'raw'); });
    w('texStorage3D', (gl, [target, levels, f, wd, ht, d]) => { let n = 0; for (let l = 0; l < levels; l++) n += Math.max(1, wd >> l) * Math.max(1, ht >> l) * d * bpp(f); put(gl, target, 'S', n, C[f] !== undefined ? 'compressed' : 'raw'); });
    w('texImage2D', (gl, a) => { const [tg, level, f] = a; let wd, ht, type; if (a.length >= 8) { wd = a[3]; ht = a[4]; type = a[7]; } else { const src = a[5]; wd = src.width ?? src.videoWidth; ht = src.height ?? src.videoHeight; type = a[4]; } const [target, face] = faceOf(tg); put(gl, target, face + ':' + level, wd * ht * bpp(f, type), 'raw'); });
    w('compressedTexImage2D', (gl, a) => { const [tg, level, f, wd, ht] = a; const [target, face] = faceOf(tg); const data = a[6]; put(gl, target, face + ':' + level, data && data.byteLength !== undefined ? data.byteLength : wd * ht * bpp(f), 'compressed'); });
    w('generateMipmap', (gl, [target]) => { const b = bound.get(gl); const t = b && b[target]; const m = t && rec.get(t); if (!m) return; let base = 0; for (const [k, v] of m) if (k === 'S') return; else if (k.endsWith(':0')) base += v; m.set('mip', base / 3); });
  }
  window.__gpu = () => { let total = 0, comp = 0, n = 0, nc = 0; for (const [t, m] of rec) { let s = 0; for (const v of m.values()) s += v; total += s; n++; if (kinds.get(t) === 'compressed') { comp += s; nc++; } } return { total, compressed: comp, textures: n, compressedTextures: nc }; };
  window.__net = () => { let bytes = 0, n = 0; const by = {}; for (const e of performance.getEntriesByType('resource')) { const b = e.transferSize || e.encodedBodySize || 0; bytes += b; n++; const ext = (e.name.split('?')[0].match(/\\.([a-z0-9]+)$/i) || [, 'other'])[1].toLowerCase(); by[ext] = (by[ext] || 0) + b; } return { bytes, n, by }; };
})();`;

interface Run {
  scene: string;
  mode: 'src' | 'dist';
  loadMs: number;
  frame: number;
  net: { bytes: number; n: number; by: Record<string, number> };
  gpu: { total: number; compressed: number; textures: number; compressedTextures: number };
  errors: string[];
  png: string;
  assets?: unknown;
  ktx2Target?: string;
}

type Win = {
  __mpj?: { flow?: string; stage?: string; frame?: number; error?: string | null; plaza?: () => { frame: number; models: number } | null; hold(f: number | null): void };
  __plaza?: { run: { ctx: { emit(n: string, v: unknown): void; actors: { slot: number; pos: { clone(): { set(x: number, y: number, z: number): unknown; y: number } } }[] } } };
  __charselect?: { handle: { state: { frame: number } } };
  __gpu(): Run['gpu'];
  __net(): Run['net'];
  __mpjAssets?: unknown;
};

/** 네트워크 자원 수가 quietMs 동안 그대로면 true */
async function netQuiet(page: Page, quietMs: number): Promise<void> {
  let last = -1;
  let since = Date.now();
  for (;;) {
    const n = await page.evaluate(() => performance.getEntriesByType('resource').length);
    if (n !== last) {
      last = n;
      since = Date.now();
    } else if (Date.now() - since >= quietMs) return;
    await page.waitForTimeout(150);
  }
}

/** cond 가 참이 될 때까지: 실제 시간으로 기다리고, 네트워크가 1 s 조용하면 가짜 시계를 16 ms 민다 */
async function until(page: Page, cond: string, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  let lastN = -1;
  let since = Date.now();
  for (;;) {
    if (await page.evaluate(cond)) return;
    if (Date.now() - t0 > timeoutMs) throw new Error(`대기 실패: ${cond}`);
    const n = await page.evaluate(() => performance.getEntriesByType('resource').length);
    if (n !== lastN) {
      lastN = n;
      since = Date.now();
    } else if (Date.now() - since > 1000) {
      await page.clock.runFor(16);
      since = Date.now();
    }
    await page.waitForTimeout(100);
  }
}

/** 프레임 읽기 식이 target 이 될 때까지 한 프레임씩(늦게 읽는 자원은 시계 멈춘 채 기다림) */
async function stepTo(page: Page, frameExpr: string, target: number): Promise<number> {
  for (let guard = 0; guard < 5000; guard++) {
    const f = (await page.evaluate(frameExpr)) as number;
    if (f >= target) return f;
    await page.clock.runFor(17);
    if (guard % 20 === 0) await netQuiet(page, 600);
  }
  throw new Error('stepTo 초과');
}

async function capture(browser: Browser, url: string, scene: string, mode: 'src' | 'dist'): Promise<Run> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(INIT);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  const t0 = Date.now();
  await page.goto(`${url}&assets=${mode}`);
  let loadMs = 0;
  let frame = 0;
  let shotTarget = page.locator('canvas').first();
  if (scene === 'plaza') {
    await until(page, `(() => { const m = window.__mpj; const d = m && m.plaza ? m.plaza() : null; return !!(window.__plaza && m.flow === 'plaza' && d && d.models > 0); })()`, 300000);
    await netQuiet(page, 1500);
    loadMs = Date.now() - t0;
    const fx = `(window.__mpj.plaza() || { frame: 0 }).frame`;
    await stepTo(page, fx, 2);
    await page.evaluate(() => {
      const ctx = (window as unknown as Win).__plaza!.run.ctx;
      const p = ctx.actors.find((a) => a.slot === 0)!.pos.clone();
      p.set(0, p.y + 0.5, 18.6);
      ctx.emit('player:place', { pos: p, yawDeg: 180 });
      ctx.emit('camera:reset', p);
    });
    frame = await stepTo(page, fx, 240);
    await netQuiet(page, 1500);
    frame = await stepTo(page, fx, 300);
    shotTarget = page.locator('.jw-stage');
  } else if (scene === 'charselect') {
    await until(page, `!!(window.__charselect && window.__charselect.handle)`, 300000);
    await netQuiet(page, 1500);
    loadMs = Date.now() - t0;
    const fx = `window.__charselect.handle.state.frame`;
    frame = await stepTo(page, fx, 30);
    await netQuiet(page, 1500);
    frame = await stepTo(page, fx, 90);
    shotTarget = page.locator('canvas.jw-gl').last();
  } else {
    await until(page, `!!(window.__mpj && (window.__mpj.stage === 'running' || window.__mpj.stage === 'done' || window.__mpj.stage === 'error'))`, 300000);
    await page.evaluate(() => (window as unknown as Win).__mpj!.hold(420));
    await netQuiet(page, 1500);
    loadMs = Date.now() - t0;
    frame = await stepTo(page, `window.__mpj.frame`, 420);
    shotTarget = page.locator('canvas').first();
  }
  await netQuiet(page, 1000);
  const png = path.join(OUT, `${scene}_${mode}.png`);
  await shotTarget.screenshot({ path: png });
  const gpu = await page.evaluate(() => (window as unknown as Win).__gpu());
  const net = await page.evaluate(() => (window as unknown as Win).__net());
  const assets = await page.evaluate(() => (window as unknown as Win).__mpjAssets);
  const ktx2Target = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const ex = c?.getSupportedExtensions() ?? [];
    return ['WEBGL_compressed_texture_astc', 'EXT_texture_compression_bptc', 'WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_etc1'].filter((e) => ex.includes(e)).join(',');
  });
  await page.close();
  return { scene, mode, loadMs, frame, net, gpu, errors, png, assets, ktx2Target };
}

const READY: Record<string, string> = {
  plaza: `(() => { const m = window.__mpj; const d = m && m.plaza ? m.plaza() : null; return !!(window.__plaza && m.flow === 'plaza' && d && d.models > 0); })()`,
  charselect: `!!(window.__charselect && window.__charselect.handle)`,
  mg1801: `!!(window.__mpj && (window.__mpj.stage === 'running' || window.__mpj.stage === 'done'))`,
};

/** 실제 시계로 로드 시간만 잰다(페이지 열기 → 장면 준비 + 네트워크 조용 0.5 s 전까지) */
async function measureLoad(browser: Browser, url: string, scene: string, mode: 'src' | 'dist'): Promise<{ readyMs: number; quietMs: number; net: Run['net']; gpu: Run['gpu'] }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(INIT);
  const t0 = Date.now();
  await page.goto(`${url}&assets=${mode}`);
  await page.waitForFunction(READY[scene], null, { timeout: 300000, polling: 50 });
  const readyMs = Date.now() - t0;
  await netQuiet(page, 500);
  const quietMs = Date.now() - t0 - 500;
  const net = await page.evaluate(() => (window as unknown as Win).__net());
  const gpu = await page.evaluate(() => (window as unknown as Win).__gpu());
  await page.close();
  return { readyMs, quietMs, net, gpu };
}

/** 두 PNG 의 픽셀 차이(브라우저 캔버스로 디코드) */
async function diff(browser: Browser, a: string, b: string, out: string): Promise<Record<string, number>> {
  const page = await browser.newPage();
  const r = await page.evaluate(
    async ([da, db]) => {
      const load = (s: string): Promise<HTMLImageElement> =>
        new Promise((ok) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.src = s;
        });
      const [ia, ib] = await Promise.all([load(da), load(db)]);
      const w = Math.min(ia.width, ib.width);
      const h = Math.min(ia.height, ib.height);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.drawImage(ia, 0, 0);
      const pa = g.getImageData(0, 0, w, h).data;
      g.clearRect(0, 0, w, h);
      g.drawImage(ib, 0, 0);
      const pb = g.getImageData(0, 0, w, h).data;
      const heat = g.createImageData(w, h);
      let se = 0;
      let sa = 0;
      let max = 0;
      let over8 = 0;
      let over24 = 0;
      for (let i = 0; i < w * h; i++) {
        let m = 0;
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(pa[i * 4 + k] - pb[i * 4 + k]);
          se += d * d;
          sa += d;
          m = Math.max(m, d);
        }
        max = Math.max(max, m);
        if (m > 8) over8++;
        if (m > 24) over24++;
        const v = Math.min(255, m * 8);
        heat.data[i * 4] = v;
        heat.data[i * 4 + 1] = v > 128 ? 255 : 0;
        heat.data[i * 4 + 2] = 0;
        heat.data[i * 4 + 3] = 255;
      }
      g.putImageData(heat, 0, 0);
      const mse = se / (w * h * 3);
      return { w, h, mae: sa / (w * h * 3), rmse: Math.sqrt(mse), psnr: mse ? 10 * Math.log10((255 * 255) / mse) : 99, max, over8: over8 / (w * h), over24: over24 / (w * h), heat: c.toDataURL('image/png') };
    },
    [`data:image/png;base64,${fs.readFileSync(a).toString('base64')}`, `data:image/png;base64,${fs.readFileSync(b).toString('base64')}`],
  );
  fs.writeFileSync(out, Buffer.from(r.heat.split(',')[1], 'base64'));
  await page.close();
  const { heat: _h, ...rest } = r;
  void _h;
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(4) : v])) as Record<string, number>;
}

const SCENES: Record<string, string> = {
  plaza: 'index.html?plaza=1&skipsetup=1&mute=1&auto=1&com=0011&fast=1',
  charselect: 'index.html?charselect=1&com=0001&mute=1&auto=1',
  mg1801: 'index.html?game=mg1801&seed=1&auto=1&mute=1&fast=1',
};

/** 소리: 원본 wav 와 압축본을 같은 브라우저 디코더(OfflineAudioContext 48 kHz)로 풀어 길이·시작 어긋남·SNR 을 잰다 */
const AUDIO_SAMPLES = [
  'mg1801/sound/bgm/SQ_BGM_MG1801_A_120.wav',
  'mg1801/sound/stream/SM_JIN_RC01_MG_SUCCESS.wav',
  'mg1801/sound/wave/main_war1_065.wav',
  'mg1801/sound/wave/main_war12_003.wav',
  'mgmcommon/sound/SQ_SE_SYS_DECI.wav',
  'charselect/sound/voice/pc01_0.wav',
];
async function audioCheck(browser: Browser, base: string): Promise<unknown[]> {
  const page = await browser.newPage();
  await page.goto(`${base}index.html?assets=src`);
  const out = await page.evaluate(
    async ([files, base]) => {
      const dec = async (url: string): Promise<Float32Array | string> => {
        try {
          const r = await fetch(url);
          if (!r.ok) return `HTTP ${r.status}`;
          const ctx = new OfflineAudioContext(1, 1, 48000);
          const b = await ctx.decodeAudioData(await r.arrayBuffer());
          return b.getChannelData(0).slice();
        } catch (e) {
          return String(e);
        }
      };
      const res: unknown[] = [];
      for (const rel of files) {
        const ref = await dec(`${base}assets/${rel}`);
        const exts = rel.includes('/wave/') ? ['.flac'] : ['.ogg', '.m4a'];
        for (const ext of exts) {
          const t = await dec(`${base}assets-dist/${rel.replace(/\.wav$/, ext)}`);
          if (typeof ref === 'string' || typeof t === 'string') {
            res.push({ rel, ext, error: typeof ref === 'string' ? ref : t });
            continue;
          }
          let start = 0;
          while (start < ref.length && Math.abs(ref[start]) < 1e-3) start++;
          const N = Math.min(8192, ref.length - start);
          let best = 0;
          let bestLag = 0;
          for (let lag = -2048; lag <= 2048; lag++) {
            let s = 0;
            for (let i = 0; i < N; i += 2) {
              const j = start + i + lag;
              if (j >= 0 && j < t.length) s += ref[start + i] * t[j];
            }
            if (s > best) {
              best = s;
              bestLag = lag;
            }
          }
          let e = 0;
          let p = 0;
          const n = Math.min(ref.length, t.length);
          for (let i = 0; i < n; i++) {
            const d = ref[i] - t[i];
            e += d * d;
            p += ref[i] * ref[i];
          }
          res.push({ rel, ext, refLen: ref.length, outLen: t.length, lenDiff: t.length - ref.length, lag: bestLag, snrDb: +(10 * Math.log10(p / Math.max(e, 1e-20))).toFixed(1) });
        }
      }
      return res;
    },
    [AUDIO_SAMPLES, base] as const,
  );
  await page.close();
  return out;
}

const server = await startServer(5196);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result: Record<string, unknown> = {};
try {
  for (const [scene, q] of Object.entries(SCENES)) {
    if (only.length && !only.includes(scene)) continue;
    const runs: Run[] = [];
    const loads: Record<string, unknown> = {};
    for (const mode of ['src', 'dist'] as const) {
      const l = await measureLoad(browser, `${server.url}${q}`, scene, mode);
      loads[mode] = l;
      console.log(`${scene} ${mode} 로드(실제 시계): 준비 ${l.readyMs} ms, 네트워크 끝 ${l.quietMs} ms, 전송 ${(l.net.bytes / 1e6).toFixed(1)} MB, GPU 텍스처 ${(l.gpu.total / 1e6).toFixed(1)} MB`);
    }
    for (const mode of ['src', 'dist'] as const) {
      const r = await capture(browser, `${server.url}${q}`, scene, mode);
      console.log(`${scene} ${mode}: 로드 ${r.loadMs} ms, 프레임 ${r.frame}, 전송 ${(r.net.bytes / 1e6).toFixed(1)} MB(${r.net.n}개), GPU 텍스처 ${(r.gpu.total / 1e6).toFixed(1)} MB(압축 ${(r.gpu.compressed / 1e6).toFixed(1)} MB·${r.gpu.compressedTextures}/${r.gpu.textures}), 오류 ${r.errors.length}`);
      for (const e of r.errors.slice(0, 5)) console.log(`   ${e.slice(0, 300)}`);
      runs.push(r);
    }
    const d = await diff(browser, runs[0].png, runs[1].png, path.join(OUT, `${scene}_diff.png`));
    console.log(`${scene} 차이: PSNR ${d.psnr} dB, 평균 ${d.mae}, 최대 ${d.max}, >8 ${(d.over8 * 100).toFixed(2)}%, >24 ${(d.over24 * 100).toFixed(2)}%`);
    result[scene] = { loads, runs: runs.map(({ png, ...r }) => ({ ...r, png: path.relative(WEB, png) })), diff: d };
  }
  if (!only.length || only.includes('audio')) {
    const a = await audioCheck(browser, server.url);
    for (const x of a) console.log('소리', JSON.stringify(x));
    result.audio = a;
  }
} finally {
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 1));
  await browser.close();
  await server.close();
}
