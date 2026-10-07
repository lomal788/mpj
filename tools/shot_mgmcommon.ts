/**
 * 공용 UI·메시지 창 데모 헤드리스 확인(1회) — ui.html?ui=mgmcommon&auto=1&mute=1 로 열어 메시지 흐름·자동 흐름·공용 창(텔롭)·공용 메뉴를 차례로
 * 지나며 스크린샷·콘솔 오류·결과 문자열을 본다. 입력은 window.__mgmcommon.press(bex 비트)(script/mgmcommon_page.ts). 결과: test/out/mgmcommon/*.png
 *
 *   npx tsx tools/shot_mgmcommon.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'mgmcommon');
fs.mkdirSync(OUT, { recursive: true });
const A = 0x1;
const RIGHT = 0x200;
const DOWN = 0x400;

interface Run {
  phase: string;
  press(b: number): void;
  msg: { st: { state: number; page: number; arrow: boolean }; isNextInputWait(): boolean; base: number[]; revealed: number };
  menu: { cursor: { row: number; col: number }; life: { opening: boolean; visible: boolean } };
}
type W = { __mgmcommon?: Run };

const server = await startServer(5198);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
const until = (page: Page, fn: string, timeout = 120000): Promise<unknown> => page.waitForFunction(`(() => { const r = window.__mgmcommon; return !!r && (${fn}); })()`, null, { timeout, polling: 50 });
const press = (page: Page, bits: number): Promise<void> => page.evaluate((b) => (window as unknown as W).__mgmcommon!.press(b), bits);
const st = (page: Page): Promise<unknown> =>
  page.evaluate(() => {
    const r = (window as unknown as W).__mgmcommon!;
    return { phase: r.phase, state: r.msg.st.state, page: r.msg.st.page, revealed: r.msg.revealed, base: [r.msg.base[2], r.msg.base[5]], cursor: r.menu.cursor };
  });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${server.url}ui.html?ui=mgmcommon&mute=1&auto=1&com=0111`);
  await page.waitForFunction(() => !!(window as unknown as W).__mgmcommon, null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector<HTMLInputElement>('.jw-ui-dbg')?.click());
  const canvas = page.locator('canvas.jw-gl').last();
  const shot = async (name: string): Promise<void> => {
    console.log(name, JSON.stringify(await st(page)));
    await canvas.screenshot({ path: path.join(OUT, `${name}.png`) });
  };
  await until(page, 'r.msg.st.page === 0 && r.msg.isNextInputWait() && r.msg.st.arrow');
  await shot('01_msg_page0');
  await press(page, A);
  await until(page, 'r.msg.st.page === 1 && r.msg.isNextInputWait() && r.msg.st.arrow');
  await shot('02_msg_page1');
  await press(page, A);
  await until(page, 'r.msg.st.page === 2 && r.msg.isNextInputWait() && r.msg.st.arrow');
  await press(page, A);
  await until(page, "r.phase.startsWith('자동') && r.msg.st.state === 1 && r.msg.isNextInputWait()");
  await shot('03_auto_page0');
  await until(page, "r.phase.startsWith('공용 창')");
  await page.waitForTimeout(400);
  await shot('04_telop');
  await until(page, "r.phase === '공용 메뉴' && r.menu.life.visible && !r.menu.life.opening");
  await page.waitForTimeout(300);
  await shot('05_menu');
  await press(page, RIGHT);
  await until(page, 'r.menu.cursor.col === 1');
  await press(page, DOWN);
  await until(page, 'r.menu.cursor.row === 1');
  await page.waitForTimeout(300);
  await shot('06_menu_moved');
  await press(page, A);
  await page.waitForFunction(() => (document.querySelector('.jw-ui-result')?.textContent ?? '') !== '', null, { timeout: 60000 });
  console.log('결과', await page.evaluate(() => document.querySelector('.jw-ui-result')?.textContent));
} finally {
  await browser.close();
  await server.close();
}
console.log(errors.length ? `콘솔 오류 ${errors.length}:\n${errors.join('\n')}` : '콘솔 오류 0');
