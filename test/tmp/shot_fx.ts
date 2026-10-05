import path from 'node:path';
import { chromium } from 'playwright-core';
import { WEB, findChromium, startServer } from '../../tools/browser';
const server = await startServer(0);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await page.goto(server.url + '?game=mg1801&auto=1&fast=1&mute=1&seed=7&com=1111');
await page.waitForFunction(() => (window as any).__mpj?.stage === 'running', null, { timeout: 120000 });
for (const f of [1146, 1506, 1626]) {
  await page.evaluate((n) => (window as any).__mpj.hold(n), f);
  await page.waitForFunction((n) => (window as any).__mpj.frame >= n, f, { timeout: 600000 });
  await page.waitForTimeout(1500);
  const box = await page.locator('canvas.jw-gl').boundingBox();
  await page.screenshot({ path: path.join(WEB, 'test', 'out', `fx_check_f${f}.png`), clip: box! });
}
console.log('errors', errs.slice(0, 10));
await browser.close();
await server.close();
