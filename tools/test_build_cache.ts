/**
 * 영구 캐시 빌드 산출물 시험(노드, 브라우저 없음) — 해시 이름·index.json v2 표·사전 압축·코드 분할·서버 응답 헤더.
 * 설계: docs/engine/loader_manager.md §5.8. 먼저 `npx tsx tools/build_assets.ts`·`npm run build` 로 assets-dist/·dist/ 를 만든다.
 *
 *   npx tsx tools/test_build_cache.ts            (--quick: 해시 내용 대조를 표본 200개로)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { createStaticHandler, HASHED } from '../server/static';
import { hashedName } from './precompress';
import { options, WEB } from './esbuild_config';

const DIST = path.join(WEB, 'dist');
const ADIST = path.join(WEB, 'assets-dist');
const quick = process.argv.includes('--quick');
let pass = 0;
let fail = 0;
const ok = (cond: unknown, name: string, detail = ''): void => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  실패: ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;
const br = (b: Buffer): number => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength;

// 1. 이름 규칙
ok(hashedName('a/b/x.ktx2', '3f2c9a1b') === 'a/b/x.3f2c9a1b.ktx2', '이름: 확장자 앞');
ok(hashedName('a/x.fmab.json', '01234567') === 'a/x.fmab.01234567.json', '이름: 마지막 확장자 앞');
ok(hashedName('a.b/x', '01234567') === 'a.b/x.01234567', '이름: 확장자 없음');
ok(HASHED.test('/assets-dist/a/x.3f2c9a1b.ktx2') && HASHED.test('/bundle/chunks/chunk.2RYZQ662.js') && !HASHED.test('/index.html') && !HASHED.test('/vendor/basis/basis_transcoder.js') && !HASHED.test('/assets-dist/index.json'), '해시 이름 판정');

// 2. assets-dist/index.json v2
const index = JSON.parse(fs.readFileSync(path.join(ADIST, 'index.json'), 'utf8')) as { v: number; ktx2: string[]; lossy: string[]; flac: string[]; names: Record<string, string> };
const names = Object.entries(index.names ?? {});
ok(index.v === 2 && names.length > 0 && Array.isArray(index.ktx2), 'index v2 + names', `v=${index.v} names=${names.length}`);
const sample = quick ? names.filter((_, i) => i % Math.max(1, Math.floor(names.length / 200)) === 0) : names;
let badHash = 0;
let missing = 0;
for (const [k, n] of sample) {
  const f = path.join(ADIST, n);
  if (!fs.existsSync(f) || !fs.existsSync(path.join(ADIST, k))) {
    missing++;
    continue;
  }
  if (hashedName(k, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 8)) !== n) badHash++;
}
ok(missing === 0, '표의 작업본·해시본 파일이 있음', `없음 ${missing}`);
ok(badHash === 0, '해시 = 내용 sha256 앞 8', `틀림 ${badHash}/${sample.length}`);
ok(index.ktx2.every((p) => index.names[p.replace(/\.png$/i, '.ktx2')]), 'ktx2 목록이 모두 해시 표에 있음');

// 3. 사전 압축(에셋)
const byExt = (re: RegExp) => names.filter(([, n]) => re.test(n));
const glbs = byExt(/\.glb$/);
const glbBr = glbs.filter(([, n]) => fs.existsSync(path.join(ADIST, `${n}.br`)));
ok(glbBr.length === glbs.length, 'glb 는 모두 .br', `${glbBr.length}/${glbs.length}`);
ok(byExt(/\.(ktx2|png|ogg|m4a)$/).every(([, n]) => !fs.existsSync(path.join(ADIST, `${n}.br`)) && !fs.existsSync(path.join(ADIST, `${n}.gz`))), 'ktx2·png·ogg·m4a 는 .br·.gz 없음');
let preRaw = 0;
let preBr = 0;
let preCount = 0;
for (const [, n] of names) {
  const f = path.join(ADIST, n);
  if (!fs.existsSync(`${f}.br`)) continue;
  preCount++;
  preRaw += fs.statSync(f).size;
  preBr += fs.statSync(`${f}.br`).size;
}
for (const [, n] of glbBr.slice(0, 5)) {
  const f = path.join(ADIST, n);
  ok(zlib.brotliDecompressSync(fs.readFileSync(`${f}.br`)).equals(fs.readFileSync(f)), `.br 풀면 원본과 같음 ${path.basename(n)}`);
}
const allRaw = names.reduce((s, [, n]) => s + (fs.existsSync(path.join(ADIST, n)) ? fs.statSync(path.join(ADIST, n)).size : 0), 0);
console.log(`에셋: 해시 표 ${names.length}개, 사전 압축 ${preCount}개 ${(preRaw / 1e6).toFixed(1)} → br ${(preBr / 1e6).toFixed(1)} MB, 전체 원본 ${(allRaw / 1e6).toFixed(1)} → 전송(br 적용) ${((allRaw - preRaw + preBr) / 1e6).toFixed(1)} MB`);

// 4. dist/ — html·번들·에셋
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const mainJs = /\.\/(bundle\/main\.[A-Z2-7]{8}\.js)/.exec(html)?.[1];
const mainCss = /\.\/(bundle\/main\.[A-Z2-7]{8}\.css)/.exec(html)?.[1];
ok(mainJs && mainCss && fs.existsSync(path.join(DIST, mainJs)) && fs.existsSync(path.join(DIST, mainCss)), 'index.html → 해시 진입점(js·css)', `${mainJs} ${mainCss}`);
ok(!fs.existsSync(path.join(DIST, 'bundle', 'main.js')), '해시 없는 bundle/main.js 없음');
ok(fs.existsSync(path.join(DIST, 'sw.js')), 'dist/sw.js');
const dIndex = JSON.parse(fs.readFileSync(path.join(DIST, 'assets-dist', 'index.json'), 'utf8')) as { names: Record<string, string>; bundle: string[] };
ok(Array.isArray(dIndex.bundle) && dIndex.bundle.includes(mainJs!) && dIndex.bundle.every((b) => fs.existsSync(path.join(DIST, b))), '배포 index.json bundle 목록');
const distAssets: string[] = [];
const walk = (d: string): void => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else distAssets.push(path.relative(path.join(DIST, 'assets-dist'), p).split(path.sep).join('/'));
  }
};
walk(path.join(DIST, 'assets-dist'));
const liveSet = new Set(Object.values(dIndex.names));
const strays = distAssets.filter((f) => f !== 'index.json' && !/\.(br|gz)$/.test(f) && !liveSet.has(f));
ok(strays.length === 0, 'dist/assets-dist 에는 해시본만', strays.slice(0, 3).join(', '));
ok([...liveSet].every((n) => fs.existsSync(path.join(DIST, 'assets-dist', n))), 'dist/assets-dist 에 표의 해시본이 모두 있음');

// 5. 코드 분할 — 정적 import 닫힘 + 화면 import()
const importsOf = (rel: string): { stat: string[]; dyn: string[] } => {
  const src = fs.readFileSync(path.join(DIST, rel), 'utf8');
  const dir = path.posix.dirname(rel);
  const res = (p: string): string => path.posix.normalize(path.posix.join(dir, p));
  return {
    stat: [...src.matchAll(/(?:from|import)\s*"(\.\.?\/[^"]+\.js)"/g)].map((m) => res(m[1])),
    dyn: [...src.matchAll(/import\(\s*"(\.\.?\/[^"]+\.js)"\s*\)/g)].map((m) => res(m[1])),
  };
};
const closure = (roots: string[]): Set<string> => {
  const seen = new Set<string>();
  const go = (r: string): void => {
    if (seen.has(r)) return;
    seen.add(r);
    for (const s of importsOf(r).stat) go(s);
  };
  roots.forEach(go);
  return seen;
};
const size = (files: Iterable<string>): { raw: number; br: number } => {
  let raw = 0;
  let b = 0;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(DIST, f));
    raw += buf.byteLength;
    b += fs.existsSync(path.join(DIST, `${f}.br`)) ? fs.statSync(path.join(DIST, `${f}.br`)).size : br(buf);
  }
  return { raw, br: b };
};
const boot = closure([mainJs!]);
const dynOfMain = [...boot].flatMap((f) => importsOf(f).dyn);
const pick = (name: string): string | undefined => dynOfMain.find((d) => path.posix.basename(d).startsWith(`${name}.`));
const plazaPath = closure([mainJs!, ...[pick('setplayer_page'), pick('plaza_page')].filter((x): x is string => !!x)]);
const allJs = dIndex.bundle.filter((b) => b.endsWith('.js'));
const body = allJs.find((b) => /\/body\.[A-Z2-7]{8}\.js$/.test(b));
ok(pick('plaza_page') && pick('setplayer_page') && pick('mgm01_page'), '화면이 main 의 import() 청크', dynOfMain.map((d) => path.posix.basename(d)).join(' '));
ok(body && ![...plazaPath].includes(body), '광장 진입 JS 에 mg1801 몸체가 없음', body);
const sBoot = size(boot);
const sPlaza = size(plazaPath);
const sAll = size(allJs.filter((f) => !f.startsWith('bundle/ui.')));
console.log(`번들: 시작 ${boot.size}개 ${kb(sBoot.raw)}(br ${kb(sBoot.br)}), 광장 진입까지 ${plazaPath.size}개 ${kb(sPlaza.raw)}(br ${kb(sPlaza.br)}), main 쪽 전체 ${kb(sAll.raw)}(br ${kb(sAll.br)})`);
ok(options(true, 'x').splitting === undefined && options(true, 'x').entryNames === undefined, '개발 빌드는 분할·해시 없음');

// 6. 서버 응답 헤더(server/static.ts)
const handle = createStaticHandler({ root: DIST });
const server = http.createServer((req, res) => handle(req, res));
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
const get = (p: string, headers: Record<string, string> = {}, method = 'GET'): Promise<{ status: number; h: http.IncomingHttpHeaders; body: Buffer }> =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, h: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
const IMM = 'public, max-age=31536000, immutable';
const rows: string[] = [];
const row = (p: string, ae: string, r: { status: number; h: http.IncomingHttpHeaders; body: Buffer }): void => {
  rows.push(`${p.slice(0, 48).padEnd(48)} ${ae.padEnd(9)} ${r.status} ${String(r.h['content-type']).padEnd(30)} ${String(r.h['content-encoding'] ?? '-').padEnd(5)} ${String(r.h['cache-control']).padEnd(36)} ${r.body.byteLength}`);
};
{
  const raw = fs.readFileSync(path.join(DIST, mainJs!));
  const a = await get(`/${mainJs}`, { 'Accept-Encoding': 'gzip, deflate, br, zstd' });
  row(`/${mainJs}`, 'br', a);
  ok(a.status === 200 && a.h['content-encoding'] === 'br' && a.h['cache-control'] === IMM && a.h.vary === 'Accept-Encoding' && /^text\/javascript/.test(String(a.h['content-type'])) && zlib.brotliDecompressSync(a.body).equals(raw), '해시 js + br');
  const g = await get(`/${mainJs}`, { 'Accept-Encoding': 'gzip' });
  row(`/${mainJs}`, 'gzip', g);
  ok(g.h['content-encoding'] === 'gzip' && zlib.gunzipSync(g.body).equals(raw), '해시 js + gzip');
  const n = await get(`/${mainJs}`);
  row(`/${mainJs}`, '(없음)', n);
  ok(n.h['content-encoding'] === undefined && n.body.equals(raw) && Number(n.h['content-length']) === raw.byteLength, '해시 js 원본');
  const q0 = await get(`/${mainJs}`, { 'Accept-Encoding': 'br;q=0, gzip' });
  ok(q0.h['content-encoding'] === 'gzip', 'br;q=0 이면 gzip');
}
{
  const h = await get('/index.html', { 'Accept-Encoding': 'br' });
  row('/index.html', 'br', h);
  ok(h.status === 200 && h.h['cache-control'] === 'no-cache' && !!h.h.etag && /^text\/html/.test(String(h.h['content-type'])), 'index.html no-cache + ETag');
  const h304 = await get('/index.html', { 'Accept-Encoding': 'br', 'If-None-Match': String(h.h.etag) });
  ok(h304.status === 304 && h304.body.byteLength === 0, 'index.html If-None-Match → 304');
  const root = await get('/', { 'Accept-Encoding': 'br' });
  ok(root.status === 200 && root.h.etag === h.h.etag, '/ → index.html');
  const sw = await get('/sw.js');
  row('/sw.js', '(없음)', sw);
  ok(sw.h['cache-control'] === 'no-cache' && /^text\/javascript/.test(String(sw.h['content-type'])), 'sw.js no-cache');
  const ix = await get('/assets-dist/index.json', { 'Accept-Encoding': 'br' });
  row('/assets-dist/index.json', 'br', ix);
  ok(ix.h['cache-control'] === 'no-cache' && ix.h['content-type'] === 'application/json' && ix.h['content-encoding'] === 'br', 'index.json no-cache + br');
}
const first = (re: RegExp): string => `/assets-dist/${Object.values(dIndex.names).find((n) => re.test(n))}`;
for (const [re, type, enc] of [
  [/\.ktx2$/, 'image/ktx2', undefined],
  [/\.glb$/, 'model/gltf-binary', 'br'],
  [/\.ogg$/, 'audio/ogg', undefined],
  [/\.m4a$/, 'audio/mp4', undefined],
  [/\.flac$/, 'audio/flac', null],
  [/\.json$/, 'application/json', 'br'],
  [/\.hdr$/, 'image/vnd.radiance', 'br'],
  [/\.png$/, 'image/png', undefined],
] as [RegExp, string, string | undefined | null][]) {
  const p = first(re);
  const r = await get(p, { 'Accept-Encoding': 'gzip, deflate, br' });
  row(p, 'br', r);
  ok(r.status === 200 && r.h['content-type'] === type && r.h['cache-control'] === IMM && (enc === null || r.h['content-encoding'] === enc), `에셋 ${type}`, `${r.status} ${r.h['content-type']} ${r.h['content-encoding']}`);
}
{
  const w = await get('/vendor/basis/basis_transcoder.wasm', { 'Accept-Encoding': 'br' });
  row('/vendor/basis/basis_transcoder.wasm', 'br', w);
  ok(w.h['content-type'] === 'application/wasm' && w.h['cache-control'] === 'no-cache', 'wasm MIME + no-cache');
  ok((await get('/nope.js')).status === 404, '없는 파일 404');
  ok((await get('/../package.json')).status === 404 && (await get('/%2e%2e/package.json')).status === 404, '루트 밖 404');
  const hd = await get(`/${mainJs}`, { 'Accept-Encoding': 'br' }, 'HEAD');
  ok(hd.status === 200 && hd.body.byteLength === 0 && Number(hd.h['content-length']) > 0, 'HEAD');
  ok((await get(`/${mainJs}`, {}, 'POST')).status === 405, 'POST 405');
}
server.close();
console.log('\n경로                                              요청      상태 Content-Type                   인코딩 Cache-Control                        바이트');
for (const r of rows) console.log(r);
console.log(`\n통과 ${pass}, 실패 ${fail}`);
process.exit(fail ? 1 : 0);
