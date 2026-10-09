/**
 * 파티 규칙 화면 헤드리스 확인(1회) — dev/ui.html 로 열어 사용자 캡처 두 장과 같은 구도(멤버 설정 핸디캡 행·규칙 확인 선택지)와
 * 플레이 방법 설정을 찍고 콘솔 오류를 모은다. 결과: test/out/partyrule/*.png
 *
 *   npx tsx tools/shot_partyrule.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'partyrule');
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(5198);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function open(page: Page, q: string): Promise<void> {
  await page.goto(`${server.url}dev/ui?ui=partyrule&com=0001&${q}&mute=1&auto=1`);
  await page.waitForFunction('!!window.__partyrule', null, { timeout: 120000 });
  await sleep(3000);
}
const press = (page: Page, bits: number): Promise<unknown> => page.evaluate(`window.__partyrule.press(${bits})`);
const shot = (page: Page, name: string): Promise<Buffer> => page.locator('.jw-stage').screenshot({ path: path.join(OUT, name) });
const until = (page: Page, js: string): Promise<unknown> => page.waitForFunction(js, null, { timeout: 300000, polling: 200 });
const S = 'window.__partyrule.screen';
const idleRule = `[0,1,2,3,4].every((i) => ${S}.view.done('rule', 'x_parts_win/x_parts_set_0' + i + '/x_parts_cursor_00'))`;
const choiceReady = `${S}.msg.st.choice && ${S}.msg.st.nextInputWait && ${S}.msg.st.inputLock <= 0 && ${S}.msg.layoutInst.done`;
const debug = (page: Page): Promise<unknown> => page.evaluate('document.querySelector(".jw-ui-debug").textContent');
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page, 'step=member');
  await until(page, `${S}.member.life.idle && ${S}.member.row === 0`);
  for (let i = 0; i < 3; i++) {
    const want = i + 1;
    await press(page, 0x400);
    await until(page, `${S}.member.row === ${want}`);
  }
  await until(page, `${S}.msg.st.typer && ${S}.msg.st.typer.done && ${S}.view.done('member', 'x_parts_list/x_btn_handicap')`);
  await shot(page, '01_member_handicap.png');
  console.log('debug 1', await debug(page));
  await open(page, 'step=check');
  await until(page, choiceReady);
  await shot(page, '02_check_rule.png');
  console.log('debug 2', await debug(page));
  await press(page, 0x400);
  await until(page, `${S}.msg.st.choiceCursor === 1`);
  await press(page, 0x1);
  await until(page, `${S}.flow.step === 'settingRule' && ${S}.rule.life.idle && ${idleRule} && ${S}.msg.st.typer && ${S}.msg.st.typer.done`);
  await shot(page, '03_setting_rule.png');
  console.log('debug 3', await debug(page));
  console.log('result', await page.evaluate('document.querySelector(".jw-ui-result").textContent'));
} finally {
  await browser.close();
  await server.close();
}
console.log('errors', errors);
