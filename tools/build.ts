/**
 * 배포 빌드 — dist/ 에 HTML·bundle·에셋을 모은다. 상대 경로만 쓰므로 dist/ 를 어느 경로에 올려도 된다.
 *
 *   npm run build                (tsc --noEmit 뒤 이 스크립트) — 압축본 assets-dist/ + vendor/basis/ 를 싣고, 페이지 기본 = 압축 모드
 *   npx tsx tools/build.ts --src-assets   소스 assets/ 도 싣고 페이지 기본 = 소스 모드(개발 페이지 배포용, ?assets=dist 로 비교 가능)
 *
 * 압축본은 tools/build_assets.ts 가 만든다(docs/engine/assets_pipeline.md). 없거나 소스보다 오래됐으면 알린다.
 *
 * 영구 캐시(docs/engine/loader_manager.md §5.8): 번들은 코드 분할 + 해시 이름(html 의 ./bundle/<엔트리>.js·css 를 고쳐 씀), 압축본은 해시 이름 파일만 싣고
 * dist/assets-dist/index.json 에 bundle(해시 청크 목록 — 서비스 워커 정리용)을 더한다. 서비스 워커 script/cache/sw.js → dist/sw.js.
 * 텍스트성 파일(번들·html·index.json·sw.js·vendor)은 .br·.gz 사전 압축(tools/precompress.ts, 에셋 것은 build_assets 가 이미 만듦).
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { ENTRIES, PAGES, WEB, options } from './esbuild_config';
import { PRECOMPRESS, precompressAll } from './precompress';

const DIST = path.join(WEB, 'dist');
const SRC_ASSETS = path.join(WEB, 'assets');
const DIST_ASSETS = path.join(WEB, 'assets-dist');
const withSrc = process.argv.includes('--src-assets');
const haveDist = fs.existsSync(path.join(DIST_ASSETS, 'index.json'));
const mode = withSrc || !haveDist ? 'src' : 'dist';

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const opts = options(false, path.join(DIST, 'bundle'));
opts.define = { ...opts.define, __ASSET_MODE__: JSON.stringify(mode) };
const built = await build(opts);
const posix = (p: string): string => p.split(path.sep).join('/');
const outRel = (o: string): string => posix(path.relative(DIST, path.resolve(WEB, o)));
const swap = new Map<string, string>();
const bundle: string[] = [];
for (const [o, meta] of Object.entries(built.metafile?.outputs ?? {})) {
  const rel = outRel(o);
  if (/\.(js|css)$/.test(rel)) bundle.push(rel);
  const entry = Object.entries(ENTRIES).find(([, src]) => meta.entryPoint === src);
  if (!entry) continue;
  swap.set(`./bundle/${entry[0]}.js`, `./${rel}`);
  if (meta.cssBundle) swap.set(`./bundle/${entry[0]}.css`, `./${outRel(meta.cssBundle)}`);
}
for (const page of PAGES) {
  let html = fs.readFileSync(path.join(WEB, page), 'utf8');
  for (const [from, to] of swap) html = html.split(from).join(to);
  fs.mkdirSync(path.dirname(path.join(DIST, page)), { recursive: true });
  fs.writeFileSync(path.join(DIST, page), html);
}
fs.copyFileSync(path.join(WEB, 'script', 'cache', 'sw.js'), path.join(DIST, 'sw.js'));

const linkOrCopy = (from: string, to: string): void => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.linkSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
  }
};

if (haveDist) {
  const index = JSON.parse(fs.readFileSync(path.join(DIST_ASSETS, 'index.json'), 'utf8')) as { v: number; names?: Record<string, string> };
  if (!index.names) console.warn('주의: assets-dist/index.json 에 해시 표(names)가 없다 — npx tsx tools/build_assets.ts 를 다시 돌릴 것');
  for (const n of Object.values(index.names ?? {}))
    for (const f of [n, `${n}.br`, `${n}.gz`]) if (fs.existsSync(path.join(DIST_ASSETS, f))) linkOrCopy(path.join(DIST_ASSETS, f), path.join(DIST, 'assets-dist', f));
  fs.mkdirSync(path.join(DIST, 'assets-dist'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'assets-dist', 'index.json'), JSON.stringify({ ...index, bundle: bundle.sort() }));
  fs.cpSync(path.join(WEB, 'vendor'), path.join(DIST, 'vendor'), { recursive: true });
  const state = JSON.parse(fs.readFileSync(path.join(DIST_ASSETS, 'build-state.json'), 'utf8')) as { entries: Record<string, unknown> };
  const stamp = fs.statSync(path.join(DIST_ASSETS, 'build-state.json')).mtimeMs;
  let missing = 0;
  let newer = 0;
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const rel = path.relative(SRC_ASSETS, p).split(path.sep).join('/');
        if (!state.entries[rel]) missing++;
        else if (fs.statSync(p).mtimeMs > stamp) newer++;
      }
    }
  };
  if (fs.existsSync(SRC_ASSETS)) walk(SRC_ASSETS);
  if (missing || newer) console.warn(`주의: assets-dist 가 소스보다 오래됨(없음 ${missing}, 더 새 소스 ${newer}) — npx tsx tools/build_assets.ts`);
} else console.warn('주의: assets-dist 가 없어 소스 에셋으로 싣는다(npx tsx tools/build_assets.ts 로 압축본을 만들 수 있음)');
if (mode === 'src' && fs.existsSync(SRC_ASSETS)) fs.cpSync(SRC_ASSETS, path.join(DIST, 'assets'), { recursive: true });

const texts = [...PAGES, 'sw.js', 'assets-dist/index.json', ...bundle, ...(fs.existsSync(path.join(DIST, 'vendor')) ? fs.readdirSync(path.join(DIST, 'vendor'), { recursive: true }).map((f) => `vendor/${posix(String(f))}`) : [])]
  .filter((f) => PRECOMPRESS.test(f) && fs.existsSync(path.join(DIST, f)) && fs.statSync(path.join(DIST, f)).isFile());
let raw = 0;
let br = 0;
await precompressAll(
  texts.map((f) => path.join(DIST, f)),
  4,
  (_f, r) => {
    raw += r.raw;
    br += r.br || r.raw;
  },
);
const kb = (n: number): string => `${(n / 1024).toFixed(0)} KB`;
const entryJs = [...swap.entries()].filter(([k]) => k.endsWith('.js')).map(([k, v]) => `${k.slice(9)} → ${v.slice(2)} ${kb(fs.statSync(path.join(DIST, v)).size)}`);
console.log(`번들 ${bundle.length}개(${entryJs.join(', ')}), 사전 압축 ${texts.length}개 ${kb(raw)} → br ${kb(br)}`);
console.log(`배포 빌드 완료: ${DIST} (에셋 기본 모드 ${mode})`);
