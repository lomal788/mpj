/**
 * 플레이어 설정 흐름 헤드리스 확인(1회) — dev/ui?ui=setplayer 로 열어 인원(2명)·컨트롤러 연결 대체·유저 단계·캐릭터 선택 이어짐을 찍고
 * 콘솔 오류를 모은다. 게임패드는 navigator.getGamepads 가짜 1개(Joy-Con L+R 이름)로 넣는다. 결과: test/out/setplayer/*.png
 *
 *   npx tsx tools/shot_setplayer.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'setplayer');
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(5199);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const S = 'window.__setplayer';
const F = `${S}.handle.flow`;
const press = (page: Page, id: string, bits: number): Promise<unknown> => page.evaluate(`${S}.press('${id}', ${bits})`);
const shot = (page: Page, name: string): Promise<Buffer> => page.locator('.jw-stage').screenshot({ path: path.join(OUT, name) });
const until = (page: Page, js: string): Promise<unknown> => page.waitForFunction(js, null, { timeout: 300000, polling: 100 });
const debug = (page: Page): Promise<unknown> => page.evaluate('document.querySelector(".jw-ui-debug").textContent');
const idle = `${S}.handle.base.part('x_parts_user').done`;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(
    "{ const pad = { index: 0, id: 'Joy-Con L+R (fake)', connected: true, buttons: Array.from({ length: 17 }, function () { return { pressed: false, value: 0 }; }), axes: [0, 0, 0, 0] };" +
      " Object.defineProperty(navigator, 'getGamepads', { value: function () { return [pad]; } }); }",
  );
  await page.goto(`${server.url}dev/ui?ui=setplayer&com=0111&mute=1&auto=1`);
  await page.waitForFunction('!!window.__setplayer', null, { timeout: 120000 });
  await until(page, `${F}.step === 0 && ${F}.uiState === 1 && ${S}.handle.title.visible`);
  await press(page, 'kb', 0x200);
  await until(page, `${F}.count === 2`);
  await sleep(1200);
  await shot(page, '01_number_2.png');
  console.log('debug 1', await debug(page));
  await press(page, 'kb', 0x1);
  await until(page, `${F}.step === 1 && !!${F}.applet`);
  await sleep(300);
  await shot(page, '02_controller_applet.png');
  await press(page, 'gp0', 0x1);
  await until(page, `${S}.handle.pool.assign[1] === 'gp0'`);
  await press(page, 'kb', 0x1);
  await until(page, `${F}.step === 2 && ${idle}`);
  await sleep(1200);
  await shot(page, '03_user.png');
  console.log('debug 3', await debug(page));
  await press(page, 'kb', 0x400);
  await until(page, `${F}.col === 1`);
  await press(page, 'kb', 0x400);
  await until(page, `${F}.col === 2`);
  await sleep(600);
  await shot(page, '04_user_ok.png');
  await press(page, 'kb', 0x1);
  await until(page, `${F}.step === 3 && !!${S}.charSelect()`);
  const C = `${S}.charSelect()`;
  await until(page, `${C}.handle.state.phase === 1 && ${C}.handle.loadStats.length >= 2`);
  await sleep(1500);
  await shot(page, '05_charselect.png');
  await page.evaluate(`${C}.press(0, 1)`);
  await sleep(300);
  await page.evaluate(`${C}.press(1, 1)`);
  await until(page, `${C} === null || ${C}.handle.state.phase === 2`);
  await sleep(500);
  if (await page.evaluate(`${C} !== null`)) await page.evaluate(`${C}.press(0, 1)`);
  await until(page, `${F}.step === 4`);
  await sleep(300);
  console.log('result', await page.evaluate('document.querySelector(".jw-ui-result").textContent'));
} finally {
  console.log(`console errors ${errors.length}`);
  for (const e of errors) console.log('  ', e);
  await browser.close();
  await server.close();
}
