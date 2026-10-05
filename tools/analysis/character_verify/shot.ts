// Headless screenshot of tools/character_verify/view.html (static server over c:/dev/mpj, chromium via playwright-core).
// usage: node tools/character_verify/run.mjs tools/character_verify/shot.ts [pc01]  -> extracted/converted/character/<pc>/filmstrip.png
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(process.argv[1]), '../../../..');
const { chromium } = createRequire(path.join(ROOT, 'web/node_modules/x.js'))('playwright-core');
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const pc = process.argv[2] ?? 'pc01';

function findChromium(): string {
  const root = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)) : [];
  dirs.sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) for (const sub of ['chrome-win64', 'chrome-win']) {
    const p = path.join(root, d, sub, 'chrome.exe');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('chromium not found');
}

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', MIME[path.extname(f)] ?? 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const port = (server.address() as any).port;
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 520 } });
const errors: string[] = [];
page.on('console', (m: any) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e: any) => errors.push(String(e)));
page.on('response', (r: any) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
await page.goto(`http://127.0.0.1:${port}/web/tools/analysis/character_verify/view.html?pc=${pc}`);
await page.waitForFunction(() => (window as any).__done === true, null, { timeout: 120000 });
const file = path.join(ROOT, 'extracted/converted/character', pc, 'filmstrip.png');
await page.locator('canvas').screenshot({ path: file });
console.log('shot', file, await page.evaluate(() => (window as any).__labels));
console.log('console errors/warnings:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
server.close();
