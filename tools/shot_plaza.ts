/**
 * 광장(menu00) 3D 헤드리스 촬영 — index.html?plaza=1 (docs/shell/plaza_3d.md §6.4 장면 목록). 결과: test/out/plaza/*.png
 * 입력은 window.__plaza.press(slot, 버튼 비트, 스틱 {lx, ly}, 프레임 수)(script/plaza_page.ts), 상태는 window.__mpj.plaza()·__mpj.flow.
 * 위치를 옮기지 않고 레버·버튼만 넣는다(원본 이동·상호작용·온라인 흐름·기구 출발 → 모드 메뉴 전환을 그대로 탄다).
 * 걷기 경로는 무대 충돌(원본 CollisionMain)로 격자 A* 를 구해 경유점을 차례로 향한다(직선이면 생울타리·분수에 막힌다).
 * 장면마다 대기 시간 제한이 있고, 못 넘긴 장면은 '대기 실패'로 적고 다음 장면으로 간다(마지막에 실패 수를 알림).
 *
 *   npx tsx tools/shot_plaza.ts            전체 장면
 *   npx tsx tools/shot_plaza.ts --load     페이지가 뜨고 광장 무대가 올라오는지만(짧은 확인)
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium, startServer } from './browser';

const OUT = path.join(WEB, 'test', 'out', 'plaza');
fs.mkdirSync(OUT, { recursive: true });
const A = 1 << 0;
const Y = 1 << 3;
const B = 1 << 1;
const X = 1 << 2;
const LOAD_ONLY = process.argv.includes('--load');

type Dbg = { frame: number; models: number; stats: { loadMs: number; models: number; bytes: number }; camera: { pos: number[]; fov: number; driven: boolean }; actors: { slot: number; kind: string; pos: number[]; motion: string }[]; parts: Record<string, unknown> };
type Win = {
  __mpj?: { flow?: string; error?: string | null; plaza?: () => Dbg | null };
  __plaza?: { press(slot: number, b: number, stick?: { lx: number; ly: number }, frames?: number): void };
};

const server = await startServer(5197);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
const misses: string[] = [];
const page: Page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

const dbg = (): Promise<Dbg | null> => page.evaluate(() => (window as unknown as Win).__mpj?.plaza?.() ?? null);
const flow = (): Promise<string | undefined> => page.evaluate(() => (window as unknown as Win).__mpj?.flow);
const wait = async (name: string, fn: string, timeout: number): Promise<boolean> => {
  try {
    await page.waitForFunction(`(() => { const m = window.__mpj; const p = window.__plaza; const d = m && m.plaza ? m.plaza() : null; return !!(${fn}); })()`, null, { timeout, polling: 100 });
    return true;
  } catch {
    misses.push(name);
    const d = (await dbg()) as { parts?: { ui?: { main?: unknown; online?: { step?: string; room?: unknown; history?: string[] } | null; log?: string[] }; interact?: unknown } } | null;
    const u = d?.parts?.ui;
    console.log('대기 실패', name, JSON.stringify({ flow: await flow(), err: await page.evaluate(() => (window as unknown as Win).__mpj?.error ?? null), ui: u && { main: u.main, step: u.online?.step, room: u.online?.room, hist: u.online?.history?.slice(-8), log: u.log?.slice(-6) }, interact: d?.parts?.interact }));
    return false;
  }
};
const shot = async (name: string): Promise<void> => {
  const d = await dbg();
  console.log(name, JSON.stringify({ flow: await flow(), frame: d?.frame, models: d?.models, cam: d?.camera, actors: d?.actors?.slice(0, 4).map((a) => ({ slot: a.slot, kind: a.kind, pos: a.pos.map((v) => +v.toFixed(2)), motion: a.motion })) }));
  await page.locator('.jw-stage').screenshot({ path: path.join(OUT, `${name}.png`) });
};

/** 페이지 안에서 도는 경로 탐색(문자열 — 번들러 보조 함수 없이) */
const PLAN = `(g) => {
  const w = window.__plaza.run.world;
  const d = window.__mpj.plaza();
  const me = d.actors.find((a) => a.slot === 0);
  const sock = g.socket ? w.socket(g.socket) : null;
  const gx = sock ? sock.pos.x : g.x, gz = sock ? sock.pos.z : g.z;
  const col = w.collider;
  const S = 0.75, X0 = -32, Z0 = -14, NX = 86, NZ = 106;
  const ci = (x) => Math.round((x - X0) / S), ck = (z) => Math.round((z - Z0) / S);
  const start = ci(me.pos[0]) * NZ + ck(me.pos[2]);
  const hy = new Map([[start, me.pos[1]]]);
  const cost = new Map([[start, 0]]);
  const prev = new Map();
  const open = [[0, start]];
  let best = start, bestD = Infinity, n = 0;
  while (open.length && n++ < 40000) {
    open.sort((a, b) => a[0] - b[0]);
    const c = open.shift()[1];
    const i = Math.floor(c / NZ), k = c % NZ, x = X0 + i * S, z = Z0 + k * S;
    const dd = Math.hypot(gx - x, gz - z);
    if (dd < bestD) { bestD = dd; best = c; }
    if (dd < g.stop - 0.5) break;
    const y = hy.get(c);
    for (const [di, dk] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const ni = i + di, nk = k + dk;
      if (ni < 0 || nk < 0 || ni >= NX || nk >= NZ) continue;
      const nkey = ni * NZ + nk, mx = di * S, mz = dk * S;
      const mv = col.collide({ x, y, z }, { x: mx, y: 0, z: mz }, 0.9, 1.6);
      if (Math.hypot(mv.x - mx, mv.z - mz) > 0.05) continue;
      const gnd = col.groundHeight(x + mx, z + mz, y);
      if (!gnd || gnd.y < y - 1.5) continue;
      const nc = cost.get(c) + Math.hypot(mx, mz);
      if (nc >= (cost.has(nkey) ? cost.get(nkey) : Infinity)) continue;
      cost.set(nkey, nc); hy.set(nkey, gnd.y); prev.set(nkey, c);
      open.push([nc + Math.hypot(gx - x - mx, gz - z - mz), nkey]);
    }
  }
  const pts = [];
  for (let c = best; c !== undefined && c !== start; c = prev.get(c)) pts.unshift([X0 + Math.floor(c / NZ) * S, Z0 + (c % NZ) * S]);
  return { pts: pts.filter((_, q) => q % 3 === 2 || q === pts.length - 1), goal: [gx, gz], reach: +bestD.toFixed(2), expanded: n };
}`;

/** 레버 한 번(카메라 기준, B leverFromStick 과 같은 축): 다음 경유점 쪽 */
const STEER = `(a) => {
  const d = window.__mpj.plaza();
  const me = d && d.actors.find((x) => x.slot === 0);
  if (!me) return { s: 'none', wp: 0 };
  if (a.done && new Function('d', 'return !!(' + a.done + ')')(d)) return { s: 'arrived', wp: a.wp };
  let k = a.wp;
  while (k < a.pts.length && Math.hypot(a.pts[k][0] - me.pos[0], a.pts[k][1] - me.pos[2]) < 0.9) k++;
  if (!a.done && Math.hypot(a.goal[0] - me.pos[0], a.goal[1] - me.pos[2]) < a.stop) return { s: 'arrived', wp: k };
  const t = k < a.pts.length ? a.pts[k] : a.goal;
  const dx = t[0] - me.pos[0], dz = t[1] - me.pos[2], dist = Math.hypot(dx, dz);
  if (dist < 1e-3) return { s: 'walking', wp: k };
  const cam = d.camera.pos;
  const fx = me.pos[0] - cam[0], fz = me.pos[2] - cam[2], fl = Math.hypot(fx, fz) || 1;
  const ux = fx / fl, uz = fz / fl;
  window.__plaza.press(0, 0, { lx: (dx * -uz + dz * ux) / dist, ly: (dx * ux + dz * uz) / dist }, 20);
  return { s: 'walking', wp: k };
}`;

type Goal = { socket?: string; x?: number; z?: number; stop: number; done?: string };
const walkTo = async (label: string, goal: Goal, maxMs: number): Promise<boolean> => {
  const plan = (await page.evaluate(`(${PLAN})(${JSON.stringify(goal)})`)) as { pts: [number, number][]; goal: [number, number]; reach: number; expanded: number };
  console.log(`   경로 ${label}: 경유점 ${plan.pts.length}, 목표까지 남는 거리 ${plan.reach}, 탐색 ${plan.expanded}`);
  const t0 = Date.now();
  let wp = 0;
  while (Date.now() - t0 < maxMs) {
    const arg = { pts: plan.pts, goal: plan.goal, stop: goal.stop, wp, done: goal.done ?? '' };
    const r = (await page.evaluate(`(${STEER})(${JSON.stringify(arg)})`)) as { s: string; wp: number };
    wp = r.wp;
    if (r.s === 'arrived') {
      await page.evaluate(() => (window as unknown as Win).__plaza?.press(0, 0, { lx: 0, ly: 0 }, 2));
      return true;
    }
    if (r.s === 'none') break;
    await page.waitForTimeout(250);
  }
  misses.push(`${label} 까지 걷기`);
  console.log('   걷기 실패 위치', JSON.stringify((await dbg())?.actors.find((a) => a.slot === 0)?.pos));
  return false;
};
/** 1번 버튼 한 번 */
const tap = async (bits: number, ms = 1200): Promise<void> => {
  await page.evaluate((b) => (window as unknown as Win).__plaza?.press(0, b, undefined, 2), bits);
  await page.waitForTimeout(ms);
};

try {
  await page.goto(`${server.url}index.html?plaza=1&skipsetup=1&mute=1&auto=1&com=0011&join=4`);
  if (await wait('① 광장 로드', "m && m.flow === 'plaza' && d && d.models > 0", 180000)) {
    await page.waitForTimeout(1500);
    await shot('01_loaded');
  }
  if (!LOAD_ONLY) {
    await page.evaluate(() => (window as unknown as Win).__plaza?.press(0, 0, { lx: 0, ly: 0.5 }, 90));
    await page.waitForTimeout(600);
    await shot('02a_walk');
    await page.evaluate(() => (window as unknown as Win).__plaza?.press(0, 0, { lx: 0, ly: 1 }, 120));
    await page.waitForTimeout(1000);
    await shot('02b_run');
    await page.waitForTimeout(1500);
    await shot('03_follow');
    // 비교 ① 원본 캡처 6.png(기구 계단 앞 근경)와 같은 자리: 1번을 계단 앞(0, 18.6)으로
    if (await walkTo('계단 앞', { x: 0, z: 18.6, stop: 0.6 }, 90000)) {
      await page.waitForTimeout(1500);
      await shot('c1_stairs');
    }
    // 비교 ② 광장 보기(OverView): X → 카메라 표 16 deco_all_cam 프레임 0, B 로 돌아옴
    await tap(X, 300);
    if (await wait('광장 보기', 'd && d.parts && d.parts.overview && d.parts.overview.active && d.camera.driven', 15000)) {
      await page.waitForTimeout(2000);
      await shot('c2_overview');
      await tap(B, 300);
      await wait('광장 보기 끝', 'd && d.parts && d.parts.overview && !d.parts.overview.active', 15000);
      await page.waitForTimeout(800);
    }
    if (await walkTo('스탬프 상점', { socket: 'attach_shop_stamp', stop: 6.5, done: 'd.parts && d.parts.interact && d.parts.interact.show && d.parts.interact.result === 8' }, 120000)) {
      await page.waitForTimeout(800);
      await shot('04_shop_popguide');
    }
    // ⑤ 원본 흐름: Y(친구 매치 메뉴) → 방 만들기 A → 방 종류 A → 패스워드 확인 A → 대기실(방장) → 가짜 멤버 입장 알림(test_plaza_ui 와 같은 순서)
    const step = (s: string): string => `d && d.parts && d.parts.ui && d.parts.ui.online && d.parts.ui.online.step.indexOf('${s}') === 0`;
    await tap(Y, 300);
    if (await wait('⑤ 친구 매치 메뉴(방 만들기/찾기)', step('netMenu'), 60000)) {
      for (const [from, label] of [['netMenu', '방 종류'], ['roomType', '패스워드 확인'], ['roomType:password', '방 만들기']] as const) {
        let moved = false;
        for (let k = 0; k < 15 && !moved; k++) {
          await page.waitForTimeout(1500);
          const cur = (await page.evaluate("(() => { const d = window.__mpj.plaza(); return d && d.parts.ui.online ? d.parts.ui.online.step : ''; })()")) as string;
          if (cur !== from) moved = true;
          else await tap(A, 300);
        }
        if (!moved) {
          misses.push(`⑤ ${label}`);
          break;
        }
      }
    }
    if (await wait('⑤ 가짜 온라인 입장', 'd && d.parts && d.parts.ui && d.parts.ui.online && d.parts.ui.online.room && d.parts.ui.online.room.members.length >= 2 && d.parts.ui.main', 90000)) {
      await page.waitForTimeout(1200);
      await shot('05_online_join');
    }
    // 비교 ③ 원본 캡처 8.png(대기실 4/4)
    if (await wait('대기실 4/4', 'd && d.parts && d.parts.ui && d.parts.ui.online && d.parts.ui.online.room && d.parts.ui.online.room.members.length >= 4', 240000)) {
      await page.waitForTimeout(2500);
      await shot('c3_lobby');
    }
    if (await walkTo('기구 앞', { x: 0, z: 15, stop: 1.5, done: 'd.parts && d.parts.interact && d.parts.interact.show && d.parts.interact.result === 6' }, 120000)) {
      await page.waitForTimeout(500);
      await shot('06a_balloon_near');
      await tap(A, 300);
      if (await wait('⑥ 출발 컷', "(d && d.parts && d.parts.balloon && d.parts.balloon.cam && d.camera && d.camera.driven) || (m && m.flow !== 'plaza')", 30000) && (await flow()) === 'plaza') {
        await page.waitForTimeout(2500);
        await shot('06b_takeoff_cut');
      }
      if (await wait('⑥ 모드 메뉴', "m && m.flow === 'modeselect'", 180000)) {
        await page.waitForTimeout(1500);
        await page.locator('.jw-stage').screenshot({ path: path.join(OUT, '06c_modeselect.png') });
      }
    }
  }
} finally {
  console.log(`콘솔 오류 ${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  console.log(`대기 실패 ${misses.length}: ${misses.join(', ')}`);
  await browser.close();
  await server.close();
}
