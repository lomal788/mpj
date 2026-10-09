/**
 * 진입점 경계 시험(DESIGN.md §10.1 진입점) — 정적 검사만.
 * ① script/main.ts·script/app/** 는 script/dev/**(@dev) 를 import 하지 않고, 개발 전용 식별자(DEV_ALL)를 코드에 쓰지 않는다
 * ② app/flow·배포용 main 은 개발 식별자(DEV_FLOW: fast·synclog·시험 훅·시험값·skipsetup·패널 콜백·free camera·params·prefs …)와
 *    URL(location·history·URLSearchParams)·window 시험 훅이 없다
 * ③ app/flow·배포용 main 의 WebGL 렌더러 생성 = app/flow 의 new Renderer 한 곳(WebGLRenderer 직접 생성 0)
 * ④ 배포용 main 은 시작 화면 없이 바로 흐름을 시작한다
 * ⑤ 하네스(script/dev/main.ts·flow.ts)는 app/flow 공개 API 를 쓰고 흐름 함수·스텝 시계를 따로 두지 않는다, 페이지·엔트리 설정
 *
 *   npx tsx tools/test_entry.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { ENTRIES, PAGES, WEB } from './esbuild_config';

let pass = 0;
let fail = 0;
const ok = (c: unknown, name: string, info = ''): void => {
  if (c) pass++;
  else {
    fail++;
    console.log(`실패: ${name}${info ? ` — ${info}` : ''}`);
  }
};

/** app/** 전체·배포 main 에 없어야 할 개발 전용 식별자 */
export const DEV_ALL = ['__mpj', '__flow', '__plaza', '__charselect', 'synclog', 'syncLog', 'skipsetup', 'skipSetup', 'mgmetTest', 'mgmetTestValues', 'avlat', 'onStatus', 'onBusy'];
/** app/flow·배포 main 에 더 없어야 할 개발 식별자 */
export const DEV_FLOW = [
  ...DEV_ALL,
  'fast',
  'logSync',
  'MgmetTestValues',
  'test',
  'debug',
  'freeCam',
  'setFreeCamera',
  'held',
  'hold',
  'Hook',
  'prefs',
  'savePrefs',
  'params',
  'URLSearchParams',
  'location',
  'history',
  'pushState',
  'replaceState',
];

const SCRIPT = path.join(WEB, 'script');
const rel = (p: string): string => path.relative(WEB, p).split(path.sep).join('/');
const read = (p: string): string => fs.readFileSync(p, 'utf8');
const code = (p: string): string => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.ts$/.test(e.name) ? [path.join(d, e.name)] : []));
const words = (c: string, list: readonly string[]): string[] => list.filter((w) => new RegExp(`(^|[^A-Za-z0-9_$])${w.replace(/\$/g, '\\$')}(?![A-Za-z0-9_$])`).test(c));

const specs = (src: string): string[] => [...src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1]);
const DEV = path.join(SCRIPT, 'dev') + path.sep;
const toDev = (file: string, s: string): boolean => s.startsWith('@dev/') || (s.startsWith('.') && path.resolve(path.dirname(file), s).startsWith(DEV));

const MAIN = path.join(SCRIPT, 'main.ts');
const deploy = [MAIN, ...walk(path.join(SCRIPT, 'app'))];
let checked = 0;
for (const f of deploy) {
  const c = code(f);
  const bad = specs(c).filter((s) => toDev(f, s));
  ok(bad.length === 0, `${rel(f)}: dev import 없음`, bad.join(', '));
  const w = words(c, DEV_ALL);
  ok(w.length === 0, `${rel(f)}: 개발 식별자 없음`, w.join(', '));
  checked++;
}
ok(checked > 50, `① 검사한 파일 수 ${checked}`);

const flowFiles = [MAIN, ...walk(path.join(SCRIPT, 'app', 'flow'))];
ok(flowFiles.length >= 3, `app/flow 파일 ${flowFiles.length - 1}개`);
let renderers = 0;
for (const f of flowFiles) {
  const c = code(f);
  const w = words(c, DEV_FLOW);
  ok(w.length === 0, `${rel(f)}: 개발 식별자·URL 없음`, w.join(', '));
  ok(!/\bwindow\s+as\b|window\.__|globalThis\.__/.test(c), `${rel(f)}: 시험 훅(window.__*) 없음`);
  ok(!/WebGLRenderer\s*\(/.test(c), `${rel(f)}: WebGLRenderer 직접 생성 없음`);
  renderers += (c.match(/new\s+Renderer\s*\(/g) ?? []).length;
}
ok(renderers === 1, `③ 게임 렌더러 생성 = 1곳`, String(renderers));

const main = code(MAIN);
ok((main.match(/new\s+Renderer\s*\(/g) ?? []).length === 0, '배포 main 은 렌더러를 만들지 않음(app/flow 것을 씀)');
ok(!/jw-start|addEventListener\(\s*['"]click['"]/.test(main) && !/jw-start/.test(read(path.join(SCRIPT, 'style.css'))), '④ 배포 main 에 시작 화면 없음');
ok(/^flow\.start\(/m.test(main) && /^prepareFlow\(\);/m.test(main), '④ 배포 main 이 바로 흐름 시작(최상위 flow.start)');

const harness = code(path.join(SCRIPT, 'dev', 'main.ts'));
const devFlow = code(path.join(SCRIPT, 'dev', 'flow.ts'));
ok(/from '\.\/flow'/.test(harness) && /from '@app\/flow'/.test(devFlow), '하네스 → dev/flow → @app/flow');
for (const fn of ['flowPlaza', 'plazaFlow', 'flowModeSelect', 'flowMgmet', 'flowMgm01', 'playFromList', 'endFlow', 'stepOnce', 'heardTime', 'clockNow', 'loadMgHost'])
  ok(!new RegExp(`function ${fn}\\b|const ${fn}\\s*=`).test(harness + devFlow), `dev 에 ${fn} 정의 없음(app/flow 하나)`);
ok(!/MAX_BACKLOG_STEPS|createMgRun|new Renderer/.test(harness + devFlow), 'dev 에 스텝 시계·한 판 조립·렌더러 없음(호스트 API 만)');

ok(ENTRIES.main === 'script/main.ts' && ENTRIES.dev === 'script/dev/main.ts', 'ENTRIES main·dev');
ok(PAGES[0] === 'index.html' && PAGES.includes('dev/index.html') && PAGES.includes('dev/ui.html'), 'PAGES 맨 앞 index.html', PAGES.join(','));
const rootHtml = read(path.join(WEB, 'index.html'));
ok(/\.\/bundle\/main\.js/.test(rootHtml) && /\.\/bundle\/main\.css/.test(rootHtml) && !/<base\b/.test(rootHtml), 'index.html → bundle/main.js·css, base 없음');
const devHtml = read(path.join(WEB, 'dev', 'index.html'));
ok(/\.\/bundle\/dev\.js/.test(devHtml) && /<base href="\.\.\/"/.test(devHtml), 'dev/index.html → bundle/dev.js, base ../');

console.log(`${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);
