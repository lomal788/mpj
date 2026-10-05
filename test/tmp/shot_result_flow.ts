import path from 'node:path';
import { chromium } from 'playwright-core';
import { WEB, findChromium, startServer } from '../../tools/browser';
const server = await startServer(0);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(server.url + '?game=mg1801&auto=1&fast=60&mute=1&seed=7&com=0111');
await page.waitForFunction(() => (window as any).__mpj?.stage === 'running', null, { timeout: 120000 });
for (const f of [3060, 3200]) {
  await page.evaluate((n) => (window as any).__mpj.hold(n), f);
  await page.waitForFunction((n) => (window as any).__mpj.frame >= n, f, { timeout: 600000 });
  await page.waitForTimeout(800);
  const box = await page.locator('canvas.jw-gl').boundingBox();
  await page.screenshot({ path: path.join(WEB, 'test', 'out', `flow_result_f${f}.png`), clip: box! });
}
console.log('errors', errs);
await browser.close();
await server.close();
