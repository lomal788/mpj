/**
 * 공용 대화상자·메시지 선택지 헤드리스 확인(마지막 1회) — ui.html?ui=mgmet 항구에서 B → 나가기 확인(메시지 창 선택지) → B(아니요와 같음) → 다시 B → 위 → A(예),
 * ui.html?ui=online 의 패스워드 확인 대화상자(공용 dialogBox 로 옮긴 뒤)를 찍는다. 결과: test/out/dialogbox/*.png (온라인 이전 그림 = test/out/online/03_password_dialog.png)
 *
 *   npx tsx tools/shot_dialogbox.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'dialogbox');
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(5243);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
const watch = (page: Page): void => {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
};
const T = 90000;
try {
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    watch(page);
    await page.goto(`${server.url}ui.html?ui=mgmet&mute=1&auto=1&com=0111&sp=4&first=1&again=1`);
    await page.waitForFunction('!!window.__mgmet', null, { timeout: T });
    await page.evaluate(() => document.querySelector<HTMLInputElement>('.jw-ui-dbg')?.click());
    const H = 'window.__mgmet.hub';
    const until = (js: string): Promise<unknown> => page.waitForFunction(js, null, { timeout: T, polling: 50 });
    const press = (b: number): Promise<unknown> => page.evaluate(`window.__mgmet.press(${b})`);
    const canvas = page.locator('canvas.jw-gl').last();
    const shot = async (n: string): Promise<void> => {
      console.log(n, await page.evaluate(`JSON.stringify({ phase: ${H}.phase, seq: ${H}.seq, cur: ${H}.o.msg.st.choiceCursor, res: ${H}.o.msg.choiceResult(), lay: ${H}.o.msg.layoutInst && ${H}.o.msg.layoutInst.name })`));
      await canvas.screenshot({ path: path.join(OUT, `${n}.png`) });
    };
    await until(`${H}.seq === 7 && ${H}.guideId === ${H}.selected`);
    await press(0x2);
    await until(`${H}.phase === '나가기 확인' && ${H}.o.msg.isNextInputWait() && ${H}.o.msg.layoutInst.done`);
    await page.waitForTimeout(300);
    await shot('01_mgmet_exit_confirm');
    await press(0x2);
    await until(`${H}.phase === '액티비티 선택(상태 7)' && ${H}.guideId === ${H}.selected`);
    await page.waitForTimeout(300);
    await shot('02_mgmet_exit_no');
    await press(0x2);
    await until(`${H}.phase === '나가기 확인' && ${H}.o.msg.isNextInputWait() && ${H}.o.msg.layoutInst.done`);
    await press(0x800);
    await until(`${H}.o.msg.st.choiceCursor === 0`);
    await page.waitForTimeout(300);
    await shot('03_mgmet_exit_yes_cursor');
    await press(0x1);
    await page.waitForFunction(() => (document.querySelector('.jw-ui-result')?.textContent ?? '') !== '', null, { timeout: T });
    console.log('결과', await page.evaluate(() => document.querySelector('.jw-ui-result')?.textContent));
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    watch(page);
    const S = 'window.__online.screen';
    await page.goto(`${server.url}ui.html?ui=online&entry=friend&join=2&mute=1&auto=1`);
    await page.waitForFunction('!!window.__online', null, { timeout: T });
    const until = (js: string): Promise<unknown> => page.waitForFunction(js, null, { timeout: T, polling: 200 });
    const press = (b: number): Promise<unknown> => page.evaluate(`window.__online.press(${b})`);
    await until(`${S}.flow.netMenu.life.idle && ${S}.view.done('netMenu', 'x_parts_btn_00')`);
    await press(0x1);
    await until(`${S}.flow.step === 'roomType' && ${S}.flow.roomType.life.idle`);
    await page.waitForTimeout(800);
    await press(0x1);
    await until(`${S}.flow.dialog.life.idle && ${S}.view.done('dialog', 'x_choise_01')`);
    await page.locator('.jw-stage').screenshot({ path: path.join(OUT, '04_online_password_dialog.png') });
    console.log('online cursor', await page.evaluate(`${S}.flow.dialog.cursor`));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(errors.length ? `콘솔 오류 ${errors.length}:\n${errors.join('\n')}` : '콘솔 오류 0');
