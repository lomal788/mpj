/**
 * 화면 전환 공용 모듈 시험(노드, DOM 없음 — DOM 어댑터는 가짜 document 로) — docs/engine/15_transition.md §7.
 *   npx tsx tools/test_transition.ts
 * 1) 상태 전이·시간(속도·초)  2) 원본 키·길이 = wipe.bflan  3) 마지막 종류  4) 중간 역전환  5) 완료 대기
 * 6) 화면 전환 중 이어짐(앱 인스턴스·LogicTransition·주입 시계)  7) 틀 MgWipe·mg1801 판정 규칙  8) DOM 어댑터 style
 * 9) 코어 import 0  10) 사용처 시간값 전/후 표
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appTransition,
  CLOSED,
  CLOSING,
  hermite,
  LogicTransition,
  OPEN,
  OPENING,
  Transition,
  TransitionDriver,
  WIPE_BLACK,
  WIPE_CROSSFADE,
  WIPE_FRAMES,
  WIPE_KEYS,
  WIPE_NAMES,
  WIPE_WHITE,
} from '../script/lib/transition';
import { MgWipe } from '../script/shell/mgscene/ui';
import { TAKEOFF } from '../script/shell/plaza/balloon';
import { SEC as RESULT_SEC } from '../script/shell/mgresult/logic';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const ok = (c: boolean, msg: string, extra = ''): void => {
  if (c) pass++;
  else {
    fail++;
    console.log(`  실패: ${msg}${extra ? ` (${extra})` : ''}`);
  }
};
const eq = (a: unknown, b: unknown, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), msg, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);

/** 시작 뒤 몇 스텝 만에 playing 이 거짓이 되는가 */
const stepsUntilIdle = (t: Transition, max = 1000): number => {
  let n = 0;
  while (t.playing && n < max) {
    t.step();
    n++;
  }
  return n;
};

console.log('1) 상태 전이·시간');
{
  const t = new Transition();
  eq(t.phase, OPEN, '처음 = 열림');
  t.fadeOut(WIPE_WHITE, 1);
  eq([t.phase, t.playing, t.closed], [CLOSING, true, false], 'fadeOut → 닫히는 중');
  for (let i = 0; i < 19; i++) t.step();
  ok(t.playing && t.phase === CLOSING, '19 스텝 뒤 아직 닫히는 중');
  t.step();
  eq([t.phase, t.playing, t.closed, t.alpha()], [CLOSED, false, true, 1], '속도 1.0 = 20 스텝 뒤 닫힘(IsFinishedFadeOut)');
  t.fadeIn(undefined, 1);
  eq(stepsUntilIdle(t), 20, '속도 1.0 fadeIn = 20 스텝');
  eq(t.phase, OPEN, 'fadeIn 끝 = 열림');
  t.fadeOut(WIPE_WHITE, 0.5);
  eq(stepsUntilIdle(t), 40, '속도 0.5 = 40 스텝(광장 FadeOut(White, 0.5))');
  t.fadeInSec(WIPE_WHITE, 1.0);
  eq(stepsUntilIdle(t), 60, '초 1.0 = 60 스텝');
  t.fadeOutSec(WIPE_BLACK, 0.5);
  eq(stepsUntilIdle(t), 30, '초 0.5 = 30 스텝');
  t.fadeInSec(WIPE_BLACK, 0.7);
  eq(stepsUntilIdle(t), 42, '초 0.7 = 42 스텝(소수 누적 오차 없음)');
  t.fadeOut(WIPE_CROSSFADE, 1);
  eq(stepsUntilIdle(t), 1, 'CrossFade out = 1 프레임 애니');
  t.fadeOutSec(WIPE_WHITE, 0);
  eq(t.phase, CLOSED, '초 0 = 바로 닫힘');
  t.clear();
  eq(t.phase, OPEN, 'clear(SetVisibleForce false) = 바로 열림');
  t.cover(WIPE_WHITE);
  eq([t.phase, t.type], [CLOSED, WIPE_WHITE], 'cover(SetVisibleForce true, White) = 바로 닫힘');
}

console.log('2) 원본 키·길이(wipe.bflan) — assets/mgscene/ui.json 의 Black·White 와 같은가, 곡선 = 직선');
{
  const ui = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/mgscene/ui.json'), 'utf8')) as {
    anims: { wipe: Record<string, { frameSize: number; entries: { name: string; tags: { tracks: { keys: number[][] }[] }[] }[] }> };
  };
  for (const ty of [WIPE_BLACK, WIPE_WHITE]) {
    const name = WIPE_NAMES[ty];
    for (const dir of ['out', 'in'] as const) {
      const a = ui.anims.wipe[`Wipe${name}_${dir}`];
      const e = a.entries.find((x) => x.name === `N_Wipe${name}_00`)!;
      eq(a.frameSize, WIPE_FRAMES[dir][ty], `${name}_${dir} 길이 ${a.frameSize}`);
      eq(e.tags[0].tracks[0].keys, WIPE_KEYS[dir][ty], `${name}_${dir} 알파 키`);
    }
  }
  let maxErr = 0;
  for (let f = 0; f <= 20; f += 0.25) maxErr = Math.max(maxErr, Math.abs(hermite(WIPE_KEYS.out[WIPE_WHITE], f) - (255 * f) / 20));
  ok(maxErr < 1e-9, 'hermite 기울기 12.75 = 직선 0→255', String(maxErr));
  const t = new Transition();
  t.fadeOut(WIPE_BLACK, 1);
  for (let i = 0; i < 10; i++) t.step();
  ok(Math.abs(t.alpha() - 0.5) < 1e-9, '10 프레임 = 알파 0.5');
}

console.log('3) 마지막 종류(GetLastUsedWipeType)');
{
  const t = new Transition();
  eq(t.lastType, WIPE_BLACK, '처음 Black(원본 부팅 FadeOut(Black)·SetFrame(끝))');
  t.fadeOut(WIPE_WHITE, 1);
  stepsUntilIdle(t);
  t.fadeIn();
  eq([t.type, t.lastType], [WIPE_WHITE, WIPE_WHITE], 'fadeIn() = 마지막 종류(White)로');
  stepsUntilIdle(t);
  t.cover(WIPE_BLACK);
  t.clear();
  eq(t.lastType, WIPE_BLACK, 'cover·clear 도 마지막 종류를 바꾼다(SetVisibleForce → +0x50)');
  const boot = new Transition({ closed: true, type: WIPE_BLACK });
  eq([boot.phase, boot.lastType], [CLOSED, WIPE_BLACK], '부팅 상태 = Black 닫힘(옵션)');
}

console.log('4) 중간 역전환(원본: PlayAnimation 이 처음부터)');
{
  const t = new Transition();
  t.fadeOut(WIPE_WHITE, 1);
  for (let i = 0; i < 10; i++) t.step();
  t.fadeIn();
  eq([t.phase, t.frame, t.alpha()], [OPENING, 0, 1], '닫히는 중 fadeIn → in 처음(알파 1)부터');
  eq(stepsUntilIdle(t), 20, '역전환도 20 스텝');
  t.cover(WIPE_WHITE);
  t.fadeOut(WIPE_WHITE, 1);
  eq([t.phase, t.alpha()], [CLOSING, 0], '닫힌 채 fadeOut → out 처음(알파 0)부터 다시(원본 그대로 — 부르는 쪽이 IsFinishedFadeOut 으로 거른다)');
}

console.log('5) 완료 대기');
{
  const t = new Transition();
  let a = -1;
  let b = -1;
  let n = 0;
  t.whenIdle(() => (a = n));
  eq(a, 0, '이미 끝났으면 바로');
  t.fadeOut(WIPE_WHITE, 1);
  t.whenIdle(() => (b = n));
  while (t.playing) {
    n++;
    t.step();
  }
  eq(b, 20, '끝난 스텝에서 콜백');
  let resolved = false;
  t.fadeIn();
  const p = t.wait().then(() => (resolved = true));
  stepsUntilIdle(t);
  await p;
  ok(resolved, 'wait() Promise');
  let c = 0;
  t.fadeOut(WIPE_WHITE, 1);
  t.whenIdle(() => c++);
  t.cover(WIPE_WHITE);
  eq(c, 1, '중간에 cover 로 끝내도 대기 풂');
}

console.log('6) 화면 전환 중 이어짐(앱 인스턴스·주입 시계·LogicTransition)');
{
  const g = globalThis as Record<string, unknown>;
  delete g.__transition_test;
  const app = appTransition('__transition_test');
  ok(app === appTransition('__transition_test'), '앱에 하나(globalThis)');
  let ms = 0;
  let pending: ((ms: number) => void) | null = null;
  let draws = 0;
  const drv = new TransitionDriver(app, { now: () => ms, request: (cb) => void (pending = cb) }, () => draws++);
  drv.start();
  const frame = (dt: number): void => {
    ms += dt;
    const cb = pending;
    pending = null;
    cb?.(ms);
  };
  frame(0);
  app.fadeOut(WIPE_WHITE, 1);
  for (let i = 0; i < 10; i++) frame(1000 / 60);
  eq([app.phase, app.frame], [CLOSING, 10], '앱 시계 10 스텝(60Hz rAF)');
  frame(1000 / 30);
  eq(app.frame, 12, 'rAF 30Hz = 2 스텝');
  frame(500);
  eq(app.frame, 16, '밀린 시간 → 그리기당 최대 4 스텝(넘친 시간 버림)');
  for (let i = 0; i < 4; i++) frame(1000 / 60);
  ok(app.closed, '4 스텝 더 → 닫힘');
  app.fadeIn();
  frame(1000 / 60);
  frame(1000 / 60);
  const owner = new LogicTransition(app);
  ok(!owner.active && !app.following, '로직 소유자는 처음 쓸 때까지 앱을 잡지 않음');
  owner.fadeOut(WIPE_WHITE, 1);
  ok(owner.active && app.following, 'fadeOut → 앱 상태 받아 이어 감 + 앱이 비춤');
  eq(owner.lastType, WIPE_WHITE, '앱의 마지막 종류를 이어받음');
  for (let i = 0; i < 5; i++) frame(1000 / 60);
  eq([app.phase, app.frame], [CLOSING, 0], '앱 시계는 스스로 진행 안 함(로직이 멈추면 화면도 멈춤 — 진행 게이트)');
  for (let i = 0; i < 20; i++) owner.step();
  frame(1000 / 60);
  eq(app.phase, CLOSED, '로직 스텝 20 → 앱 화면 닫힘');
  owner.release();
  ok(!app.following && app.closed, 'release → 앱이 닫힘을 이어 가짐(다음 화면 = 페이지가 바뀌어도 덮인 채)');
  app.fadeIn();
  let n = 0;
  while (app.playing && n < 100) {
    frame(1000 / 60);
    n++;
  }
  eq([n, app.phase, app.type], [20, OPEN, WIPE_WHITE], '다음 화면 sceneIn = FadeIn(마지막 종류 White) 20 스텝');
  ok(draws > 40, '그리기마다 draw', String(draws));
  drv.stop();
  delete g.__transition_test;
}

console.log('7) 틀 MgWipe(컴포넌트 판정 규칙)·mg1801(애니 슬롯 직접 질의) 판정');
{
  const w = new MgWipe(false, new Transition());
  eq([w.state, w.core.phase], [2, CLOSED], '틀 시작 = 덮음(state 2)');
  w.fadeIn(1);
  let q = 0;
  while (w.playing() && q < 100) {
    w.tick();
    q++;
  }
  eq(q, 21, '틀 IsPlayingFadeAnim 은 끝 판정이 다음 틱(1 + 20) — test_mgscene 22 = 처리기 1 + 21');
  eq(w.core.type, WIPE_BLACK, '틀 FadeIn = 마지막 종류(처음 Black)');
  w.fadeOut(1);
  eq(w.core.type, WIPE_WHITE, '틀 FadeOut = White(MinigameFlow FadeOut(1.0, 1) [판독 core_b5 @0x71002e1c68])');
  q = 0;
  while (!w.covered() && q < 100) {
    w.tick();
    q++;
  }
  eq(q, 21, '틀 out 도 21 틱 뒤 덮음');
  const p = new MgWipe(true, new Transition());
  p.fadeIn(1);
  eq([p.playing(), p.core.phase], [false, OPEN], '설명 화면(P) = 바로 끝, 코어 안 건드림');
  const t = new Transition();
  t.fadeOut(WIPE_WHITE, 1);
  let k = 0;
  while (t.playing) {
    t.step();
    k++;
  }
  eq(k, 20, 'mg1801 fadePlaying = frame − start < 20 과 같다(스텝을 frame++ 직후에)');
}

console.log('8) DOM 어댑터(가짜 document) — opacity·visibility·background·will-change, 바뀐 값만');
{
  const g = globalThis as Record<string, unknown>;
  const writes: string[] = [];
  const mk = (): Record<string, unknown> => {
    const style = new Proxy({} as Record<string, string>, {
      set(o, k, v) {
        writes.push(`${String(k)}=${v}`);
        o[k as string] = v;
        return true;
      },
    });
    return { style, className: '', children: [] as unknown[], appendChild(c: unknown) { (this.children as unknown[]).push(c); }, remove() {} };
  };
  const hadDoc = 'document' in g;
  g.document = { createElement: () => mk() };
  const { DomWipe } = await import('../script/lib/transition-dom');
  const parent = mk() as unknown as HTMLElement;
  const d = new DomWipe({ parent });
  const s = d.el.style as unknown as Record<string, string>;
  eq([s.pointerEvents, s.position, s.zIndex, s.visibility], ['none', 'absolute', '1000', 'hidden'], '앱 최상위 덮개: 누름 통과·숨김');
  const t = new Transition();
  d.draw(t);
  writes.length = 0;
  d.draw(t);
  eq(writes, [], '열림에서 다시 그려도 style 안 씀');
  t.fadeOut(WIPE_WHITE, 1);
  d.draw(t);
  eq([s.background, s.willChange], ['#fff', 'opacity'], 'White = #fff, 전환 중 will-change');
  t.step();
  writes.length = 0;
  d.draw(t);
  eq(writes, ['visibility=visible', 'opacity=0.05'], '한 스텝 = 알파 1/20, 처음 보일 때만 visibility');
  for (let i = 0; i < 19; i++) t.step();
  d.draw(t);
  eq([s.opacity, s.willChange], ['1', ''], '닫힘 = 1, will-change 해제');
  t.fadeIn(WIPE_BLACK);
  d.draw(t);
  eq(s.background, '#000', 'Black = #000');
  stepsUntilIdle(t);
  d.draw(t);
  eq([s.opacity, s.visibility], ['0', 'hidden'], '열림 = 숨김');
  t.fadeOut(WIPE_CROSSFADE, 1);
  d.draw(t);
  eq(s.opacity, '0', 'CrossFade + capture 없음 = 그리지 않음(웹 한계, §4)');
  if (!hadDoc) delete g.document;
}

console.log('9) 코어 import 0 · 어댑터는 코어만');
{
  const core = fs.readFileSync(path.join(WEB, 'script/lib/transition/index.ts'), 'utf8');
  const imps = [...core.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(/g)];
  eq(imps.length, 0, '코어 lib/transition import 0');
  ok(!/\b(document|window|HTMLElement|requestAnimationFrame|performance)\b/.test(core.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), '코어에 DOM·전역 시계 이름 없음(시계는 주입)');
  const dom = fs.readFileSync(path.join(WEB, 'script/lib/transition-dom/index.ts'), 'utf8');
  const di = [...dom.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  eq(di, ['../transition'], 'DOM 어댑터 import = 코어만');
  ok(!/transition\s*:|transitionDuration|@keyframes|animation\s*:/.test(dom), 'DOM 어댑터는 CSS transition·animation 을 쓰지 않음');
}

console.log('10) 사용처 시간값 — 원본 인자(속도) 그대로, 프레임 = 20 ÷ 속도');
{
  const frames = (speed: number): number => {
    const t = new Transition();
    t.fadeOut(WIPE_WHITE, speed);
    return stepsUntilIdle(t);
  };
  const rows: [string, string, number, number, string][] = [
    ['광장 기구 선택 FadeOut', 'SelectedBalloonImpl @0x710005ee90', TAKEOFF.fadeOutSelectSec, 60, '1.0 s 로 읽었음'],
    ['광장 이륙 FadeIn(닫혀 있으면)', '람다 @0x71000478ac', TAKEOFF.fadeInSec, 60, '1.0 s'],
    ['광장 출발 끝 FadeOut', '람다 @0x7100047a74', TAKEOFF.fadeOutEndSec, 30, '0.5 s'],
    ['광장 건너뛰기 FadeOut', 'TakeOffImpl', TAKEOFF.fadeOutSkipSec, 60, '1.0 s'],
    ['광장 세션 FadeOut', 'PlaySessionFiber', TAKEOFF.sessionFadeSec, 30, '0.5 s'],
    ['항구 취소 FadeOutWait·복귀 FadeIn', 'mgmet @0x710004e1b0', 1.0, 60, '1.0 s(Fade.update dt)'],
    ['모드 선택 결정 뒤', 'FocusImpl FadeOut(1.0, 1)', 1.0, 60, 'DECIDE_HOLD 60f [근사]'],
    ['결과 무대 FadeOut/FadeIn(틀 안)', 'FUN_71002e8390', RESULT_SEC.fadeOut, 20, '틀 MgWipe 속도'],
    ['결과 무대 FadeOut(단독 페이지)', 'mgresult_page 검은 막', RESULT_SEC.fadeIn, 60, '초'],
    ['미니게임 틀 페이드 전부', 'MinigameFlow FadeOut(1.0, 1)', 1.0, 20, '틀 MgWipe 속도'],
    ['mg1801 흰 페이드', 'RmMgSceneBase OnGameEnd/Ending', 1.0, 20, 'WIPE_WHITE_FRAMES'],
  ];
  console.log('   | 사용처 | 원본 | 인자 | 전(프레임) | 후(프레임) | 전 방식 |');
  for (const [name, src, arg, before, how] of rows) {
    const after = frames(arg);
    console.log(`   | ${name} | ${src} | ${arg} | ${before} | ${after} | ${how} |`);
    eq(after, Math.round(20 / arg), `${name}: 20 ÷ ${arg}`);
  }
}

console.log(`${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);
