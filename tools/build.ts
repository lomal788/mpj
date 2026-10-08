/**
 * 배포 빌드 — dist/ 에 HTML·bundle·에셋을 모은다. 상대 경로만 쓰므로 dist/ 를 어느 경로에 올려도 된다.
 *
 *   npm run build                (tsc --noEmit 뒤 이 스크립트) — 압축본 assets-dist/ + vendor/basis/ 를 싣고, 페이지 기본 = 압축 모드
 *   npx tsx tools/build.ts --src-assets   소스 assets/ 도 싣고 페이지 기본 = 소스 모드(개발 페이지 배포용, ?assets=dist 로 비교 가능)
 *
 * 압축본은 tools/build_assets.ts 가 만든다(docs/engine/assets_pipeline.md). 없거나 소스보다 오래됐으면 알린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { PAGES, WEB, options } from './esbuild_config';

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
await build(opts);
for (const page of PAGES) fs.copyFileSync(path.join(WEB, page), path.join(DIST, page));

if (haveDist) {
  fs.cpSync(DIST_ASSETS, path.join(DIST, 'assets-dist'), { recursive: true, filter: (s) => !['build-state.json', 'report.json'].includes(path.basename(s)) });
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
console.log(`배포 빌드 완료: ${DIST} (에셋 기본 모드 ${mode})`);
