/**
 * 미니게임 항구 화면 헤드리스 확인(1회) — ui.html?ui=mgmet(인사 → 액티비티 선택 → 이동 → 결정 → 첫 설명 → 규칙 → 출발)과 ui=mgmet-rule(COM 없음)을 열어
 * 스크린샷·콘솔 오류·결과 문자열을 본다. 입력은 window.__mgmet.press(bex 비트)(script/mgmet_page.ts). 결과: test/out/mgmet/*.png
 *
 *   npx tsx tools/shot_mgmet.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'mgmet');
fs.mkdirSync(OUT, { recursive: true });
const A = 0x1;
const LEFT = 0x100;
const UP = 0x800;

type W = { __mgmet?: { phase: string; press(b: number): void; hub: unknown } };

const server = await startServer(5199);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
const until = async (page: Page, fn: string, timeout = 60000): Promise<unknown> => {
  try {
    return await page.waitForFunction(`(() => { const r = window.__mgmet; if (!r) return false; const h = r.hub; return !!(${fn}); })()`, null, { timeout, polling: 50 });
  } catch (e) {
    console.log('대기 실패', fn, await page.evaluate(() => { const h = (window as unknown as { __mgmet: { hub: { phase: string; seq: number; o: { howto: { page: number } }; log: string[] } } }).__mgmet.hub; return JSON.stringify({ phase: h.phase, seq: h.seq, page: h.o.howto.page, cur: (h as any).rule.state.current, idx: (h as any).rule.state.index, inF: (h as any).rule.state.inFlag, log: h.log.slice(-4) }); }));
    throw e;
  }
};
const press = (page: Page, bits: number): Promise<void> => page.evaluate((b) => (window as unknown as W).__mgmet!.press(b), bits);
const info = (page: Page): Promise<unknown> =>
  page.evaluate(() => {
    const h = (window as unknown as { __mgmet: { hub: { phase: string; seq: number; selected: number; rule: { state: { current: number; index: number[] } } } } }).__mgmet.hub;
    return { phase: h.phase, seq: h.seq, id: h.selected, col: h.rule.state.current, idx: h.rule.state.index.slice(0, 6) };
  });
async function open(url: string): Promise<{ page: Page; shot: (n: string) => Promise<void> }> {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${server.url}${url}`);
  await page.waitForFunction(() => !!(window as unknown as W).__mgmet, null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector<HTMLInputElement>('.jw-ui-dbg')?.click());
  const canvas = page.locator('canvas.jw-gl').last();
  return {
    page,
    shot: async (name) => {
      console.log(name, JSON.stringify(await info(page)));
      await canvas.screenshot({ path: path.join(OUT, `${name}.png`) });
    },
  };
}
try {
  {
    const { page, shot } = await open('ui.html?ui=mgmet&mute=1&auto=1&com=0111&sp=0');
    for (let p = 0; p < 3; p++) {
      await until(page, 'h.seq === 4 && h.o.msg.isNextInputWait() && h.o.msg.st.arrow');
      if (p === 0) await shot('01_greeting');
      await press(page, A);
      await page.waitForTimeout(300);
    }
    await until(page, 'h.seq === 7 && h.guideId === h.selected');
    await page.waitForTimeout(300);
    await shot('02_select_free');
    await press(page, LEFT);
    await until(page, 'h.seq === 7 && h.guideId === h.selected && h.selected === 3');
    await page.waitForTimeout(300);
    await shot('03_select_survival');
    await press(page, 0x200);
    await until(page, 'h.seq === 7 && h.guideId === h.selected && h.selected === 2');
    await press(page, A);
    await until(page, "h.phase === '첫 설명' && h.o.howto.page === 0 && h.o.howto.msg && h.o.howto.msg.isNextInputWait()");
    await page.waitForTimeout(300);
    await shot('04_first_howto');
    for (let p = 0; p < 3; p++) {
      await until(page, "h.phase !== '첫 설명' || (h.o.howto.page === " + p + ' && h.o.howto.msg.st.arrow)');
      await press(page, A);
      await until(page, "h.phase !== '첫 설명' || h.o.howto.page !== " + p);
    }
    await until(page, "h.phase === '규칙 설정' && !h.rule.win.life.opening");
    await page.waitForTimeout(300);
    await shot('05_rule_cpu');
    await press(page, UP);
    await until(page, 'h.rule.state.index[3] === 1');
    await press(page, A);
    await until(page, 'h.rule.state.current === 4');
    await page.waitForTimeout(300);
    await shot('06_rule_explain');
    await press(page, A);
    await until(page, 'h.rule.state.current === 6');
    await press(page, A);
    await page.waitForFunction(() => (document.querySelector('.jw-ui-result')?.textContent ?? '') !== '', null, { timeout: 60000 });
    console.log('결과', await page.evaluate(() => document.querySelector('.jw-ui-result')?.textContent));
    await page.close();
  }
  {
    const { page, shot } = await open('ui.html?ui=mgmet-rule&mute=1&auto=1&com=0000&first=1');
    await until(page, "h.phase === '규칙 설정' && !h.rule.win.life.opening");
    await page.waitForTimeout(300);
    await shot('07_rule_nocpu');
    await press(page, 0x2);
    await page.waitForFunction(() => (document.querySelector('.jw-ui-result')?.textContent ?? '') !== '', null, { timeout: 60000 });
    console.log('결과', await page.evaluate(() => document.querySelector('.jw-ui-result')?.textContent));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(errors.length ? `콘솔 오류 ${errors.length}:\n${errors.join('\n')}` : '콘솔 오류 0');
