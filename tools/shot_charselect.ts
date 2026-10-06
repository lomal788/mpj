/**
 * 캐릭터 선택 화면 헤드리스 확인(1회) — ?charselect=1&com=0001 로 열어 원본 캡처(사람 3 + COM 1)와 같은 구도를 만들고 스크린샷·콘솔 오류를 본다.
 * 입력은 window.__charselect.press(칸, bex 비트)로 넣는다(script/charselect_page.ts). 결과: test/out/charselect/*.png
 *
 *   npx tsx tools/shot_charselect.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'charselect');
fs.mkdirSync(OUT, { recursive: true });
const A = 0x1;
const B = 0x2;
const LEFT = 0x100;
const RIGHT = 0x200;
const DOWN = 0x400;

const server = await startServer(5198);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
type W = { __charselect?: { press(p: number, b: number): void; handle: { state: { frame: number; phase: number; players: { cursor: number; decided: boolean }[] } } }; __mpj: { charselect?: string[] | null; stage: string } };
const frame = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as W).__charselect?.handle.state.frame ?? -1);
async function wait(page: Page, n: number): Promise<void> {
  const f0 = await frame(page);
  await page.waitForFunction((t) => ((window as unknown as W).__charselect?.handle.state.frame ?? -1) >= t, f0 + n, { timeout: 120000 });
}
async function press(page: Page, p: number, bits: number): Promise<void> {
  await page.evaluate(([pp, bb]) => (window as unknown as W).__charselect!.press(pp, bb), [p, bits]);
  await wait(page, 3);
}
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${server.url}?charselect=1&com=0001&mute=1&auto=1`);
  await page.waitForFunction(() => !!(window as unknown as W).__charselect, null, { timeout: 60000 });
  await wait(page, 40);
  const canvas = page.locator('canvas.jw-gl').last();
  await canvas.screenshot({ path: path.join(OUT, '01_start.png') });
  // 캡처 구도: 1P → 와루이지(버튼 5), 2P → 동키콩(버튼 11), 3P → 굼바(버튼 14). 1P·3P 결정
  for (let i = 0; i < 3; i++) await press(page, 0, RIGHT);
  await press(page, 1, DOWN);
  await press(page, 1, LEFT);
  await press(page, 2, DOWN);
  await press(page, 2, RIGHT);
  await press(page, 0, A);
  await press(page, 2, A);
  await wait(page, 150);
  const st = await page.evaluate(() => (window as unknown as W).__charselect!.handle.state.players.map((p) => [p.cursor, p.decided]));
  console.log('커서·결정', JSON.stringify(st));
  await canvas.screenshot({ path: path.join(OUT, '02_capture_pose.png') });
  // 캐서린 확인(docs 12.1): 2P 를 동키콩(버튼 11) → 캐서린(버튼 12)
  await press(page, 1, RIGHT);
  await wait(page, 150);
  await canvas.screenshot({ path: path.join(OUT, '02b_catherine.png') });
  await press(page, 1, A);
  await wait(page, 40);
  await canvas.screenshot({ path: path.join(OUT, '03_all_decided_ok.png') });
  const phase = await page.evaluate(() => (window as unknown as W).__charselect!.handle.state.phase);
  const loadStats = await page.evaluate(() =>
    ((window as unknown as { __charselect: { handle: { loadStats: { pc: string; cached: boolean; loadMs: number; waitMs: number; buildMs: number; firstRenderMs: number }[] } } }).__charselect.handle.loadStats ?? []).map((x) => ({
      pc: x.pc,
      cached: x.cached,
      load: Math.round(x.loadMs),
      wait: Math.round(x.waitMs),
      build: Math.round(x.buildMs),
      first: Math.round(x.firstRenderMs),
    })),
  );
  console.log('전원 결정 뒤 상태', phase);
  await press(page, 0, A);
  await page.waitForFunction(() => (window as unknown as W).__mpj.charselect !== undefined, null, { timeout: 60000 });
  console.log('결과', JSON.stringify(await page.evaluate(() => (window as unknown as W).__mpj.charselect)));
  console.log('3D 로딩 구간(ms, docs 12.7)', JSON.stringify(loadStats, null, 0));
  void B;
} finally {
  await browser.close();
  await server.close();
}
console.log(errors.length ? `콘솔 오류 ${errors.length}\n  ${errors.join('\n  ')}` : '콘솔 오류 0');
process.exitCode = errors.length ? 1 : 0;
