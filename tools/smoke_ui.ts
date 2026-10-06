/**
 * ui.html 스모크 — ?ui=charselect&auto=1 로 열어 화면이 뜨고 콘솔 오류가 없는지 본다. 결과: test/out/ui_smoke.png
 *
 *   npx tsx tools/smoke_ui.ts
 */
import path from 'node:path';
import { chromium } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const server = await startServer(5199);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${server.url}ui.html?ui=charselect&com=0001&mute=1&auto=1`);
  await page.waitForFunction('!!window.__charselect && window.__charselect.handle.state.frame > 120', null, { timeout: 120000 });
  await page.screenshot({ path: path.join(WEB, 'test', 'out', 'ui_smoke.png') });
  console.log('debug', await page.evaluate('document.querySelector(".jw-ui-debug").textContent'));
} finally {
  await browser.close();
  await server.close();
}
console.log('errors', errors);
