/**
 * 모드 선택 화면 헤드리스 확인(1회) — ui.html?ui=modeselect&auto=1&mute=1 로 열어 원본 캡처(마리오 파티에서 A 를 누른 press 프레임)와 같은 구도를 만들고
 * 스크린샷·콘솔 오류·결과 문자열을 본다. 입력은 window.__modeselect.press(bex 비트)(script/modeselect_page.ts). 결과: test/out/modeselect/*.png
 *
 *   npx tsx tools/shot_modeselect.ts
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'modeselect');
fs.mkdirSync(OUT, { recursive: true });
const CAPTURE = process.argv[2] ?? 'C:/Users/lomal/AppData/Local/Temp/claude/e--programming-python/d19e7ca4-5a7d-421c-9c66-c3d67dcdf06a/images/3.png';
const A = 0x1;
const UP = 0x800;
const DOWN = 0x400;

const server = await startServer(5199);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
type W = { __modeselect?: { press(b: number): void; handle: { state: { frame: number; phase: number; cursor: number; result: number }; lines: string[] } } };
const frame = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as W).__modeselect?.handle.state.frame ?? -1);
async function wait(page: Page, n: number): Promise<void> {
  const f0 = await frame(page);
  await page.waitForFunction((t) => ((window as unknown as W).__modeselect?.handle.state.frame ?? -1) >= t, f0 + n, { timeout: 120000 });
}
async function press(page: Page, bits: number, after = 3): Promise<void> {
  await page.evaluate((b) => (window as unknown as W).__modeselect!.press(b), bits);
  await wait(page, after);
}
const st = (page: Page): Promise<unknown> => page.evaluate(() => {
  const h = (window as unknown as W).__modeselect!.handle;
  return { phase: h.state.phase, cursor: h.state.cursor, result: h.state.result, lines: h.lines };
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${server.url}ui.html?ui=modeselect&mute=1&auto=1`);
  await page.waitForFunction(() => !!(window as unknown as W).__modeselect, null, { timeout: 60000 });
  await page.evaluate(() => {
    const d = document.querySelector<HTMLInputElement>('.jw-ui-dbg');
    if (d) d.click();
  });
  await wait(page, 40);
  const canvas = page.locator('canvas.jw-gl').last();
  console.log('시작', JSON.stringify(await st(page)));
  await canvas.screenshot({ path: path.join(OUT, '01_start.png') });
  await press(page, DOWN, 30);
  console.log('아래', JSON.stringify(await st(page)));
  await canvas.screenshot({ path: path.join(OUT, '02_rhythm.png') });
  await press(page, UP, 30);
  await press(page, A, 25);
  console.log('결정', JSON.stringify(await st(page)));
  await canvas.screenshot({ path: path.join(OUT, '03_press_capture_pose.png') });
  await page.waitForFunction(() => (document.querySelector('.jw-ui-result')?.textContent ?? '') !== '', null, { timeout: 60000 });
  console.log('결과', await page.evaluate(() => document.querySelector('.jw-ui-result')?.textContent));
  // backdrop 경로 시험(docs 6.2): 원본 장면 그림이 없어 광장 썸네일(mn01_pict_mode_08, 원본 에셋)을 **시험용 대역**으로 넣는다 — 실제 배경 아님
  await page.goto(`${server.url}ui.html?ui=modeselect&mute=1&auto=1&bg=assets/modeselect/tex/mn01_pict_mode_08_o.png`);
  await page.waitForFunction(() => !!(window as unknown as W).__modeselect, null, { timeout: 60000 });
  await wait(page, 40);
  await press(page, A, 25);
  await page.locator('canvas.jw-gl').last().screenshot({ path: path.join(OUT, '04_backdrop_test.png') });
} finally {
  await browser.close();
  await server.close();
}
// 캡처와 나란히: 캡처 = 화면 × 0.7187, 왼쪽 539·위 34 잘림(docs 1절) → 같은 영역을 잘라 같은 크기로
if (fs.existsSync(CAPTURE)) {
  const py = `
import sys
from PIL import Image
cap = Image.open(sys.argv[1]).convert('RGB')
web = Image.open(sys.argv[2]).convert('RGB').resize((1920, 1080), Image.LANCZOS)  # 캔버스 스크린샷은 CSS 크기라 1920×1080 으로 되돌린다
s = 0.7187
w, h = cap.size
crop = web.crop((539, 34, 539 + round(w / s), 34 + round(h / s))).resize((w, h), Image.LANCZOS)
out = Image.new('RGB', (w * 2 + 10, h), (40, 40, 40))
out.paste(cap, (0, 0)); out.paste(crop, (w + 10, 0))
out.save(sys.argv[3])
def px(im, x, y): return im.getpixel((x, y))
for name, (x, y) in {'선택 버튼': (100, 101), '둘째 버튼': (100, 168), '지도 바다': (300, 150), '사진 창 테두리': (460, 330), '패널 안 위': (600, 20), '패널 가장자리 안': (970, 300), '패널 밖 그림자': (978, 300)}.items():
    print(name, '캡처', px(cap, x, y), '웹', px(crop, x, y))
`;
  for (const [src, dst] of [
    ['03_press_capture_pose.png', 'compare_capture.png'],
    ['04_backdrop_test.png', 'compare_backdrop_test.png'],
  ]) {
    const r = execFileSync(path.join(WEB, '..', '.venv', 'Scripts', 'python'), ['-c', py, CAPTURE, path.join(OUT, src), path.join(OUT, dst)], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    console.log(`[${dst}]
${r.trim()}`);
  }
}
console.log(errors.length ? `콘솔 오류 ${errors.length}\n  ${errors.join('\n  ')}` : '콘솔 오류 0');
process.exitCode = errors.length ? 1 : 0;
