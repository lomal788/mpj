/**
 * 프리 플레이 개별 설정·필터 화면 헤드리스 확인(마지막 1회) — ui.html?ui=mgm01-setting / mgm01-filter 를 열어 입력을 넣고 스크린샷·콘솔 오류·결과 문자열을 본다.
 * 입력은 window.__mgm01.press(bex 비트)(script/mgm01_page.ts). 결과: test/out/mgm01/*.png
 *
 *   npx tsx tools/shot_mgm01.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'mgm01');
fs.mkdirSync(OUT, { recursive: true });

interface Run {
  phase: string;
  press(b: number): void;
  debug(): string;
  screen: { win: { life: { opening: boolean; visible: boolean } }; state: { phase: string; cursor?: number; applied?: { enumNo: number } } | null };
}
type W = { __mgm01?: Run };

const server = await startServer(5199);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
const until = (page: Page, fn: string, timeout = 120000): Promise<unknown> => page.waitForFunction(`(() => { const r = window.__mgm01; return !!r && (${fn}); })()`, null, { timeout, polling: 50 });
const press = (page: Page, bits: number): Promise<void> => page.evaluate((b) => (window as unknown as W).__mgm01!.press(b), bits);
const result = (page: Page): Promise<string> => page.evaluate(() => document.querySelector('.jw-ui-result')?.textContent ?? '');
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  const canvas = page.locator('canvas.jw-gl').last();
  const shot = async (name: string): Promise<void> => {
    console.log(name, await page.evaluate(() => (window as unknown as W).__mgm01!.debug()));
    await canvas.screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  await page.goto(`${server.url}ui.html?ui=mgm01-setting&mute=1&auto=1&com=0111&mg=mg0106&cpu=1`);
  await until(page, "r.phase === '설정' && r.screen.win.life.visible && !r.screen.win.life.opening");
  await page.waitForTimeout(400);
  await shot('01_setting_mg0106');
  await press(page, 0x800);
  await page.waitForTimeout(150);
  await press(page, 0x1);
  await page.waitForTimeout(150);
  await press(page, 0x800);
  await page.waitForTimeout(150);
  await press(page, 0x4);
  await page.waitForTimeout(600);
  await shot('02_setting_endless_fav');
  await press(page, 0x20);
  await page.waitForTimeout(500);
  await shot('03_setting_next_game');
  await press(page, 0x1);
  await page.waitForTimeout(150);
  await press(page, 0x1);
  await page.waitForTimeout(150);
  await press(page, 0x1);
  await page.waitForFunction(() => (document.querySelector('.jw-ui-result')?.textContent ?? '') !== '', null, { timeout: 60000 });
  console.log('결과(설정)', await result(page));

  await page.goto(`${server.url}ui.html?ui=mgm01-setting&mute=1&auto=1&com=0000&mg=mg0501`);
  await until(page, "r.phase === '설정' && r.screen.win.life.visible && !r.screen.win.life.opening");
  await page.waitForTimeout(400);
  await shot('04_setting_4p');

  await page.goto(`${server.url}ui.html?ui=mgm01-filter&mute=1&auto=1&com=0111&fav=mg0101,mg0203`);
  await until(page, "r.phase === '필터' && r.screen.win.life.visible && !r.screen.win.life.opening");
  await page.waitForTimeout(300);
  await shot('05_filter_all');
  await press(page, 0x20);
  await until(page, "r.screen.state.applied.enumNo === 1 && r.screen.state.phase === 'idle'");
  await page.waitForTimeout(200);
  await shot('06_filter_4vs');
  await press(page, 0x10);
  await until(page, "r.screen.state.applied.enumNo === 0 && r.screen.state.phase === 'idle'");
  await press(page, 0x10);
  await until(page, "r.screen.state.applied.enumNo === 13 && r.screen.state.phase === 'idle'");
  await page.waitForTimeout(200);
  await shot('07_filter_favorite');
  await press(page, 0x2);
  await page.waitForFunction(() => (document.querySelector('.jw-ui-result')?.textContent ?? '') !== '', null, { timeout: 60000 });
  console.log('결과(필터)', await result(page));
} finally {
  await browser.close();
  await server.close();
}
console.log(errors.length ? `콘솔 오류 ${errors.length}:\n${errors.join('\n')}` : '콘솔 오류 0');
