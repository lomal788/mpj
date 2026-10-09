/**
 * 광장 대기실 헤드리스 촬영 — 두 페이지(방장 H·손님 C)를 `npm run dev` 와 같은 서버(tools/serve.ts: esbuild serve 앞단 + HTTP API + socket.io /mpj-plaza, URL 에 online 없음 = 기본 실제 서버)에 붙여 만나게 한다(docs/shell/plaza_3d.md §5.2, online.md 9.5·9.6).
 * H: Y 친구 매치 → 방 만들기 → 4인 → 패스워드 안 함 → 대기실. C: Y → 방 찾기 → 목록 A → 참가 예 → 대기실.
 * 확인: 서로의 캐릭터가 광장에 3D 로 나타남·움직임, 하단 줄·입장 알림·대기 텔롭, −/+ 카드, 손님 나가기 → 방장 화면 정리·손님 혼자 광장, 다시 참가(잔상 없음), 방장 해산 → 양쪽 정리.
 * --start 를 주면 해산 대신 방장 기구 → 둘 다 모드 메뉴(이전 판). 결과 test/out/plaza_room/*.png
 * 입력은 window.__plaza.press(slot, 버튼 비트, 스틱, 프레임)(script/plaza_page.ts), 상태는 window.__mpj.plaza()·__mpj.flow. 장면마다 대기 시간 제한.
 *
 *   npx tsx tools/shot_plaza_room.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { WEB, findChromium } from './browser';
import { startDevServer } from './serve';

const OUT = path.join(WEB, 'test', 'out', 'plaza_room');
fs.mkdirSync(OUT, { recursive: true });
const A = 1 << 0;
const B = 1 << 1;
const Y = 1 << 3;
const PLUS = 1 << 10;

type Dbg = { frame: number; models: number; camera: { pos: number[] }; actors: { slot: number; kind: string; pos: number[]; motion: string; chara?: string }[]; parts: Record<string, unknown> };
type Win = {
  __mpj?: { flow?: string; error?: string | null; plaza?: () => Dbg | null };
  __plaza?: { press(slot: number, b: number, stick?: { lx: number; ly: number }, frames?: number): void };
};

const web = await startDevServer({ port: 0, host: '127.0.0.1' });
const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
});
const errors: string[] = [];
const misses: string[] = [];

const open = async (tag: string, chars: string, name: string): Promise<Page> => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.on('response', (r) => {
    if (r.status() >= 400) console.log(`   ${tag} ${r.status()} ${r.url()}`);
  });
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`);
  });
  p.on('pageerror', (e) => errors.push(`${tag}: ${String(e)}`));
  await p.goto(`${web.url}dev/index.html?plaza=1&skipsetup=1&mute=1&auto=1&com=0111&chars=${chars}&names=${name}`);
  return p;
};

const dbg = (p: Page): Promise<Dbg | null> => p.evaluate(() => (window as unknown as Win).__mpj?.plaza?.() ?? null);
const wait = async (p: Page, name: string, fn: string, timeout: number): Promise<boolean> => {
  try {
    await p.waitForFunction(`(() => { const m = window.__mpj; const d = m && m.plaza ? m.plaza() : null; const u = d && d.parts ? d.parts.ui : null; const o = u ? u.online : null; return !!(${fn}); })()`, null, { timeout, polling: 100 });
    return true;
  } catch {
    misses.push(name);
    const d = (await dbg(p)) as { parts?: { ui?: { main?: unknown; online?: unknown; log?: string[] } } } | null;
    console.log('대기 실패', name, JSON.stringify({ flow: await p.evaluate(() => (window as unknown as Win).__mpj?.flow), ui: d?.parts?.ui && { main: d.parts.ui.main, online: d.parts.ui.online, log: d.parts.ui.log?.slice(-8) } }));
    return false;
  }
};
const shot = async (p: Page, name: string): Promise<void> => {
  if (p.isClosed()) return;
  const d = await dbg(p);
  const f = (d?.parts?.follow ?? null) as { remotes?: { station: string; pc: string; pos: number[]; motion: string }[] } | null;
  console.log(name, JSON.stringify({ flow: await p.evaluate(() => (window as unknown as Win).__mpj?.flow), me: d?.actors?.find((a) => a.slot === 0)?.pos.map((v) => +v.toFixed(2)), remotes: f?.remotes?.map((r) => ({ st: r.station, pc: r.pc, pos: r.pos.map((v) => +v.toFixed(2)), motion: r.motion })) }));
  await p.bringToFront();
  await p
    .locator('.jw-stage')
    .screenshot({ path: path.join(OUT, `${name}.png`), timeout: 60000, animations: 'allow' })
    .catch((e: unknown) => misses.push(`촬영 ${name}: ${String(e).slice(0, 80)}`));
};
const tap = async (p: Page, bits: number, ms = 600, stick?: { lx: number; ly: number }): Promise<void> => {
  await p.evaluate(([b, s]) => (window as unknown as Win).__plaza?.press(0, b as number, (s as { lx: number; ly: number } | null) ?? undefined, 2), [bits, stick ?? null] as const);
  await p.waitForTimeout(ms);
};
const step = (p: Page): Promise<string> => p.evaluate("(() => { const d = window.__mpj.plaza(); return d && d.parts.ui.online ? d.parts.ui.online.step : ''; })()") as Promise<string>;
/** 흐름 단계가 from 에서 벗어날 때까지 A 를 누른다(애니 중 입력은 무시되므로 되풀이) */
const advance = async (p: Page, from: string, label: string): Promise<boolean> => {
  for (let k = 0; k < 30; k++) {
    await p.waitForTimeout(1500);
    if ((await step(p)) !== from) return true;
    await tap(p, A, 300);
  }
  misses.push(label);
  return false;
};

/** 기구 앞까지 걷기 — shot_plaza.ts 와 같은 격자 A*·레버(카메라 기준) */
const PLAN = `(g) => {
  const w = window.__plaza.run.world;
  const d = window.__mpj.plaza();
  const me = d.actors.find((a) => a.slot === 0);
  const gx = g.x, gz = g.z;
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
  return { pts: pts.filter((_, q) => q % 3 === 2 || q === pts.length - 1), goal: [gx, gz] };
}`;
const STEER = `(a) => {
  const d = window.__mpj.plaza();
  const me = d && d.actors.find((x) => x.slot === 0);
  if (!me) return { s: 'none', wp: 0 };
  if (a.done && new Function('d', 'return !!(' + a.done + ')')(d)) return { s: 'arrived', wp: a.wp };
  let k = a.wp;
  while (k < a.pts.length && Math.hypot(a.pts[k][0] - me.pos[0], a.pts[k][1] - me.pos[2]) < 0.9) k++;
  const t = k < a.pts.length ? a.pts[k] : a.goal;
  const dx = t[0] - me.pos[0], dz = t[1] - me.pos[2], dist = Math.hypot(dx, dz);
  if (dist < 1e-3) return { s: 'walking', wp: k };
  const cam = d.camera.pos;
  const fx = me.pos[0] - cam[0], fz = me.pos[2] - cam[2], fl = Math.hypot(fx, fz) || 1;
  const ux = fx / fl, uz = fz / fl;
  window.__plaza.press(0, 0, { lx: (dx * -uz + dz * ux) / dist, ly: (dx * ux + dz * uz) / dist }, 20);
  return { s: 'walking', wp: k };
}`;
const walkTo = async (p: Page, label: string, goal: { x: number; z: number; stop: number; done: string }, maxMs: number): Promise<boolean> => {
  const plan = (await p.evaluate(`(${PLAN})(${JSON.stringify(goal)})`)) as { pts: [number, number][]; goal: [number, number] };
  const t0 = Date.now();
  let wp = 0;
  while (Date.now() - t0 < maxMs) {
    const r = (await p.evaluate(`(${STEER})(${JSON.stringify({ pts: plan.pts, goal: plan.goal, wp, done: goal.done })})`)) as { s: string; wp: number };
    wp = r.wp;
    if (r.s === 'arrived') {
      await p.evaluate(() => (window as unknown as Win).__plaza?.press(0, 0, { lx: 0, ly: 0 }, 2));
      return true;
    }
    if (r.s === 'none') break;
    await p.waitForTimeout(250);
  }
  misses.push(`${label} 까지 걷기`);
  return false;
};

/** 손님 C: 친구 매치 → 방 찾기(오른쪽) → 목록 → 참가 예 */
const guestJoin = async (tag: string, listShot: string): Promise<void> => {
  const p = C!;
  await p.bringToFront();
  await tap(p, Y, 300);
  if (await wait(p, `${tag} C 친구 매치 메뉴`, 'o && o.netIdle', 120000)) {
    for (let k = 0; k < 10 && !(await p.evaluate('window.__mpj.plaza().parts.ui.online.netSel === 1')); k++) await tap(p, 0, 800, { lx: 1, ly: 0 });
    await advance(p, 'netMenu', `${tag} C 방 찾기`);
    if (await wait(p, `${tag} C 방 목록`, 'o && o.rooms && o.rooms.length > 0 && o.listIdle', 60000)) {
      await p.waitForTimeout(800);
      await shot(p, listShot);
      for (let k = 0; k < 20 && !(await p.evaluate("(() => { const o = window.__mpj.plaza().parts.ui.online; return o.dialogIdle || o.step !== 'sessionList'; })()")); k++) await tap(p, A, 1500);
      if (await wait(p, `${tag} C 참가 확인`, "o && o.dialogIdle", 30000)) {
        await p.waitForTimeout(500);
        for (let k = 0; k < 10 && (await step(p)) === 'join'; k++) await tap(p, A, 1500);
      }
    }
  }
};
/** 대기실 B → 확인 대화상자(기본 아니요) → 왼쪽 → A = 예. 대화상자가 그대로 대기실로 돌아오면(입력이 빠짐) 다시 */
const confirmYes = async (p: Page, tag: string): Promise<void> => {
  await p.bringToFront();
  for (let k = 0; k < 4; k++) {
    await tap(p, B, 300);
    if (!(await wait(p, `${tag} 확인 대화상자`, "o && o.dialogIdle && o.step.indexOf('lobby:') === 0", 20000))) return;
    await p.waitForTimeout(600);
    for (let n = 0; n < 3; n++) await tap(p, k % 2 ? 1 << 12 : 0, 500, k % 2 ? undefined : { lx: -1, ly: 0 });
    await tap(p, A, 1500);
    const s = await step(p);
    console.log(`   ${tag} 시도 ${k + 1}(${k % 2 ? '십자' : '스틱'}) → ${s || '흐름 끝'}`);
    if (s.indexOf('lobby:') !== 0) return;
    await p.waitForTimeout(1500);
  }
};
const SOLO = "!o && u.main && u.remote.length === 0 && u.status.players.length === 1 && d.parts.follow && d.parts.follow.remotes.length === 0";

let H: Page | null = null;
let C: Page | null = null;
try {
  H = await open('H', 'pc01', 'Aya');
  C = await open('C', 'pc02', 'Bo');
  const loaded = "m && m.flow === 'plaza' && d && d.models > 0 && u && u.main";
  const okH = await wait(H, '① H 광장 로드', loaded, 240000);
  const okC = await wait(C, '① C 광장 로드', loaded, 240000);
  if (okH && okC) {
    await H.waitForTimeout(1500);
    // ② 방장: 친구 매치 → 방 만들기 → 4인 → 패스워드 설정 안 함
    await tap(H, Y, 300);
    if (await wait(H, '② H 친구 매치 메뉴', "o && o.step.indexOf('netMenu') === 0", 60000)) {
      (await advance(H, 'netMenu', '② H 방 종류')) && (await advance(H, 'roomType', '② H 패스워드 확인')) && (await advance(H, 'roomType:password', '② H 방 만들기'));
    }
    if (await wait(H, '② H 대기실', "o && o.step === 'lobby:host' && u.main && o.room", 60000)) {
      await H.waitForTimeout(1500);
      await shot(H, '01_H_lobby_alone');
    }
    // ③ 손님: 친구 매치 → 방 찾기(오른쪽) → 목록 → 참가 예
    await guestJoin('③', '02_C_room_list');
    if (await wait(C, '③ C 대기실', "o && o.step === 'lobby:client' && u.main", 90000)) {
      await wait(H, '③ H 입장 알림', "o && o.notices.some((n) => n.indexOf('Bo') >= 0)", 30000);
      await shot(H, '03_H_join_notice');
    }
    // ④ 서로의 캐릭터(3D 원격)
    const met = 'd.parts.follow && d.parts.follow.remotes && d.parts.follow.remotes.length === 1';
    if ((await wait(H, '④ H 에 손님 캐릭터', met, 60000)) && (await wait(C, '④ C 에 방장 캐릭터', met, 60000))) {
      await H.waitForTimeout(2500);
      await shot(H, '04_H_met');
      await shot(C, '04_C_met');
      const before = ((await dbg(H))?.parts?.follow as { remotes: { pos: number[] }[] }).remotes[0].pos;
      await C.evaluate(() => (window as unknown as Win).__plaza?.press(0, 0, { lx: -0.8, ly: 0.6 }, 100));
      await C.waitForTimeout(900);
      await shot(H, '05_H_remote_walking');
      await C.waitForTimeout(1500);
      const after = ((await dbg(H))?.parts?.follow as { remotes: { pos: number[] }[] }).remotes[0].pos;
      const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
      console.log(`   H 가 본 손님 이동 ${moved.toFixed(2)} m`);
      if (moved < 1) misses.push('⑤ 원격 이동');
      await shot(C, '05_C_after_walk');
    }
    // ⑥ −/+ 카드(손님)
    if (await wait(C, '⑥ C 카드 안내', 'u.card && u.card.guide', 20000)) {
      await tap(C, PLUS, 300);
      if (await wait(C, '⑥ C 카드', 'u.card && u.card.st === 1 && u.card.n === 2', 20000)) {
        await C.waitForTimeout(500);
        await shot(C, '06_C_card');
        await tap(C, 0, 500, { lx: 1, ly: 0 });
        await shot(C, '06_C_card_next');
        await tap(C, B, 300);
        await wait(C, '⑥ C 카드 닫힘', "u.card && u.card.st === -1 && o.step === 'lobby:client'", 20000);
      }
    }
    // ⑦ 손님 나가기 → 방장 화면 정리·손님 혼자 광장
    if (!process.argv.includes('--start')) {
      await confirmYes(C, '⑦ C 나가기');
      if (await wait(C, '⑦ C 혼자 광장', SOLO, 30000)) await shot(C, '07_C_left_solo');
      if (await wait(H, '⑦ H 손님 정리', "o && o.step === 'lobby:host' && u.remote.length === 0 && u.status.players.length === 1 && d.parts.follow.remotes.length === 0 && o.room && o.room.members.length === 1", 30000)) await shot(H, '07_H_after_leave');
      // ⑧ 같은 방 다시 참가 — 잔상 없이 원격 1
      await C.waitForTimeout(1500);
      await guestJoin('⑧', '08_C_room_list_again');
      if (await wait(C, '⑧ C 대기실', "o && o.step === 'lobby:client' && u.main", 90000)) {
        const one = "d.parts.follow.remotes.length === 1 && u.remote.length === 1 && u.status.players.length === 2";
        if ((await wait(H, '⑧ H 다시 만남', one, 60000)) && (await wait(C, '⑧ C 다시 만남', one, 60000))) {
          await H.waitForTimeout(2000);
          await shot(H, '08_H_rejoined');
          await shot(C, '08_C_rejoined');
        }
      }
      // ⑨ 방장 해산 → 손님 해산 알림 → 둘 다 혼자 광장
      await confirmYes(H, '⑨ H 해산');
      if (await wait(C, '⑨ C 해산 알림', "o && o.step === 'error:mn01_friend_mw_lobby_dismiss_client' && o.dialogIdle && u.remote.length === 0 && d.parts.follow.remotes.length === 0", 30000)) {
        await C.waitForTimeout(500);
        await shot(C, '09_C_dissolved_dialog');
        await tap(C, A, 300);
        if (await wait(C, '⑨ C 혼자 광장', SOLO, 30000)) await shot(C, '09_C_solo');
      }
      if (await wait(H, '⑨ H 혼자 광장', SOLO, 30000)) await shot(H, '09_H_solo');
    }
    // ⑦' (--start) 방장 기구 → PlaySession → 둘 다 모드 메뉴
    else if (await walkTo(H, '기구 앞', { x: 0, z: 15, stop: 1.5, done: 'd.parts && d.parts.interact && d.parts.interact.show && d.parts.interact.result === 6' }, 120000)) {
      await shot(H, '07_H_balloon_near');
      await tap(H, A, 200);
      await wait(C, '⑦ C 페이드', "d && d.parts && d.parts.balloon && d.parts.balloon.phase.indexOf('session') === 0", 20000);
      await shot(C, '07_C_fade');
      const ms = "m && m.flow === 'modeselect'";
      const a = await wait(H, '⑦ H 모드 메뉴', ms, 60000);
      const b = await wait(C, '⑦ C 모드 메뉴', ms, 60000);
      if (a && b) {
        await H.waitForTimeout(1500);
        await H.locator('.jw-stage').screenshot({ path: path.join(OUT, '08_H_modeselect.png'), timeout: 15000 }).catch(() => misses.push('촬영 08_H'));
        await C.locator('.jw-stage').screenshot({ path: path.join(OUT, '08_C_modeselect.png'), timeout: 15000 }).catch(() => misses.push('촬영 08_C'));
      }
    }
  }
} finally {
  console.log(`콘솔 오류 ${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  console.log(`대기 실패 ${misses.length}: ${misses.join(', ')}`);
  console.log(`서버 ${JSON.stringify(web.sockets.status('mpj-plaza'))}`);
  await browser.close();
  await web.close();
}
