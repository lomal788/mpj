/**
 * 온라인 화면 헤드리스 확인(마지막 1회) — dev/ui?ui=online 으로 열어 방 만들기/찾기 메뉴·방 종류·방 목록·대기실(방장, 입장 뒤)·전 세계 매칭을 찍고
 * 콘솔 오류를 모은다. 결과: test/out/online/*.png
 *
 *   npx tsx tools/shot_online.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'online');
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(5231);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const S = 'window.__online.screen';
async function open(page: Page, q: string): Promise<void> {
  await page.goto(`${server.url}dev/ui?ui=online&${q}&mute=1&auto=1`);
  await page.waitForFunction('!!window.__online', null, { timeout: 120000 });
}
const press = (page: Page, bits: number): Promise<unknown> => page.evaluate(`window.__online.press(${bits})`);
const shot = (page: Page, name: string): Promise<Buffer> => page.locator('.jw-stage').screenshot({ path: path.join(OUT, name) });
const until = (page: Page, js: string): Promise<unknown> => page.waitForFunction(js, null, { timeout: 300000, polling: 200 });
const debug = (page: Page): Promise<unknown> => page.evaluate('document.querySelector(".jw-ui-debug").textContent');
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await open(page, 'entry=friend&join=2');
  await until(page, `${S}.flow.netMenu.life.idle && ${S}.view.done('netMenu', 'x_parts_btn_00')`);
  await shot(page, '01_net_menu.png');
  await press(page, 0x1);
  await until(page, `${S}.flow.step === 'roomType' && ${S}.flow.roomType.life.idle`);
  await sleep(800);
  await shot(page, '02_room_type.png');
  await press(page, 0x1);
  await until(page, `${S}.flow.dialog.life.idle && ${S}.view.done('dialog', 'x_choise_01')`);
  await shot(page, '03_password_dialog.png');
  await press(page, 0x1);
  await until(page, `${S}.flow.step === 'lobby:host' && (${S}.flow.room?.members.length ?? 0) >= 3`);
  await sleep(1500);
  await shot(page, '04_lobby_host.png');
  console.log('debug lobby', await debug(page));

  await open(page, 'entry=friend&join=0');
  const btnIdle = `${S}.flow.netMenu.life.idle && ${S}.view.done('netMenu', 'x_parts_btn_00') && ${S}.view.done('netMenu', 'x_parts_btn_01')`;
  await until(page, btnIdle);
  await press(page, 0x200);
  await until(page, `${S}.flow.netMenu.sel === 1`);
  await until(page, btnIdle);
  await press(page, 0x1);
  await until(page, `${S}.flow.step === 'sessionList' && ${S}.flow.rooms.length > 0 && ${S}.flow.list.life.idle && ${S}.flow.list.rowAnim.some((a) => a !== 6)`);
  await sleep(1500);
  await shot(page, '05_room_list.png');
  console.log('debug list', await debug(page));

  await open(page, 'entry=world&match=6');
  await until(page, `${S}.flow.opponent.life.idle`);
  await sleep(500);
  await shot(page, '06_opponent.png');
  await press(page, 0x200);
  await until(page, `${S}.flow.opponent.sel === 1`);
  await press(page, 0x1);
  await until(page, `${S}.flow.step === 'matchMake'`);
  await sleep(1500);
  await shot(page, '07_matching.png');
  await until(page, `${S}.flow.step === 'playerList'`);
  await sleep(1500);
  await shot(page, '08_match_members.png');
  console.log('result', await page.evaluate('document.querySelector(".jw-ui-result").textContent'));
} finally {
  await browser.close();
  await server.close();
}
console.log('errors', errors);
