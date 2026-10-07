/**
 * 승패 표·잠금 안내·플레이 방법 단독 화면 헤드리스 확인(1회) — ui.html 로 열어 스크린샷·콘솔 오류. 결과: test/out/mgmscreens/*.png
 *
 *   npx tsx tools/shot_mgmscreens.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'mgmscreens');
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(5197);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function open(page: Page, q: string): Promise<void> {
  await page.goto(`${server.url}ui.html?${q}&mute=1&auto=1`);
  await page.waitForFunction('!!window.__mgmscreen', null, { timeout: 120000 });
  await sleep(2500);
}
const press = (page: Page, bits: number): Promise<unknown> => page.evaluate(`window.__mgmscreen.press(${bits})`);
const shot = (page: Page, name: string): Promise<Buffer> => page.locator('.jw-stage').screenshot({ path: path.join(OUT, name) });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page, 'ui=mgm01-history&rounds=12');
  await shot(page, '01_history.png');
  await press(page, 0x100);
  await sleep(800);
  await shot(page, '02_history_scrolled.png');
  await open(page, 'ui=mgm01-announce');
  await press(page, 0x1);
  await sleep(700);
  await shot(page, '03_announce.png');
  await open(page, 'ui=mgmet-howto&first=1');
  await sleep(2500);
  await shot(page, '04_howto_p0.png');
  await press(page, 0x1);
  await sleep(500);
  await press(page, 0x1);
  await sleep(3000);
  await shot(page, '05_howto_p1.png');
  console.log('debug', await page.evaluate('document.querySelector(".jw-ui-debug").textContent'));
} finally {
  await browser.close();
  await server.close();
}
console.log('errors', errors);
