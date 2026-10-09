/**
 * 공용 캐릭터 런타임 시험(노드, 헤드리스 없음) — docs/engine/09_character.md §14.6.
 *   npx tsx tools/test_character.ts            (먼저 web/tools/analysis/chara_ftrg.py — assets/chara/<pc>/ftrg.json·ftrg_base.json·mpat.json)
 * 1) 같은 모션 판정  2) 시작 프레임(리스너)  3) 블렌드·가중치 곡선  4) mpat a/b·α/β  5) 전이 시간 clamp  6) 프레임 진행·FrameMax·속도
 * 7) 큐 교체 순서  8) 시선(뒤 40°/60°·데드존·턱·목)  9) 눈·깜빡임  10) FTRG 평가·실제 데이터  11) import 경계·할당 0  12) 소비자 골든(이전 전과 같음)
 * 기대값 근거: 09 §4.2·§4.3·§6.3~6.8, 05 §7.5·§7.7. 원본 실행 대조가 아니라 판독한 규칙의 재구현 시험이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PerformanceObserver } from 'node:perf_hooks';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';
import {
  BLEND_LISTENER_F32,
  CharacterCore,
  EyeLook,
  FLT_MAX,
  FtrgBank,
  FtrgCursor,
  HEAD_RULES_ORIGINAL,
  HEAD_RULES_WEB,
  HeadLook,
  MotionSlot,
  RULES_ORIGINAL,
  RULES_WEB,
  STATE_FINISHED,
  STATE_NONE,
  STATE_PLAYING,
  STEP_SEC,
  TRANSITION_CROSSFADE,
  eulerYZX,
  fnv1a64,
  headInput,
  motionArg,
  mpatBlendCompat,
  mpatFind,
  mpatRows,
  neckQuat,
  pickWeighted,
  quat,
  quatFromMat3,
  qslerp,
  type CharacterEvent,
  type FtrgSource,
  type MotionInfo,
  type MotionRules,
} from '@game/lib/character';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterView, wrap, type MotionDataTable } from '@game/lib/character-three';
import { GOLDEN_SHA256, GOLDEN_SHA256_WEB, install, parseGlb, runGolden, sha256 } from './character_golden';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
let count = 0;
const ok = (c: boolean, msg: string, extra = ''): void => {
  count++;
  if (!c) {
    fails++;
    console.log(`  실패: ${msg}${extra ? ` (${extra})` : ''}`);
  }
};
const eq = <T>(a: T, b: T, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), msg, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const near = (a: number, b: number, eps: number, msg: string): void => ok(Math.abs(a - b) <= eps, msg, `${a} ≈ ${b}`);
const f32 = Math.fround;
const json = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(WEB, 'assets', p), 'utf8')) as T;

const TABLE: Record<string, MotionInfo> = {
  co_idle00: { frames: 120, loop: true },
  co_walk00: { frames: 44, loop: true },
  rhy_knife_idle00: { frames: 30, loop: true },
  rhy_knife_swing00: { frames: 20, loop: false },
  co_win00a: { frames: 60, loop: false },
  co_win00b: { frames: 90, loop: true },
  shift_a: { frames: 10, loop: false, shift: true },
  shift_b: { frames: 10, loop: false, shiftRec: true },
};
const slot = (rules: Readonly<MotionRules> = RULES_WEB, rand = (n: number) => n - 1, mpat?: ReturnType<typeof mpatRows>[]): MotionSlot =>
  new MotionSlot(rules, { info: (n) => TABLE[n], rand, mpat });
const steps = (s: MotionSlot, n: number): void => {
  for (let i = 0; i < n; i++) s.step(STEP_SEC);
};

console.log('0) 이름 해시(FNV-1a 64, 09 §6.1)');
{
  eq(fnv1a64('rhy_knife_idle00'), '0xe7aa2e3319496287', 'rhy_knife_idle00 = mg1801 상수');
  eq(fnv1a64('rhy_knife_swing00'), '0xb47e176ed5263b75', 'rhy_knife_swing00 = mg1801 상수');
  eq(fnv1a64(''), '0xcbf29ce484222325', '빈 문자열 = basis');
}

console.log('1) 같은 모션 판정(FUN_7100022a80)');
{
  const s = slot();
  ok(s.play(motionArg('co_idle00')), '첫 재생 받음');
  steps(s, 10);
  const seq = s.startSeq;
  ok(!s.play(motionArg('co_idle00')) && s.startSeq === seq && s.bundleFrame === 129, 'forceRestart 0 + 같은 이름 → 버림(프레임 유지)');
  ok(s.play(motionArg('co_idle00', { forceRestart: true })) && s.startSeq === seq + 1, 'forceRestart 1 → 다시 시작');
  ok(!s.play(motionArg('')), '이름 길이 0 → 무시');
  eq([STATE_NONE, slot().state], [0, 0], '노드 없음 = None');
}

console.log('2) 시작 프레임(리스너 FUN_7100022f20, §6.4)');
{
  const s = slot();
  s.play(motionArg('co_idle00'));
  eq([s.frame, s.startBlend], [119, 0], '노드 없음 → loopPrev 1 → "_idle" 난수(n−1), 블렌드 0');
  s.play(motionArg('rhy_knife_swing00'));
  eq([s.frame, s.startBlend], [0, 0.1], 'idle(루프) → swing: idle 맵 false → 0, 기본 블렌드 0.1');
  s.play(motionArg('co_win00a', { startFrame: 7 }));
  eq(s.frame, 7, '비루프 → 다음: startFrame');
  s.play(motionArg('co_win00b', { randomStartFrame: true }));
  eq(s.frame, 89, 'randomStartFrame → 난수(FrameMax)');
  const o = slot(RULES_ORIGINAL);
  o.play(motionArg('co_idle00'));
  o.play(motionArg('co_walk00'));
  eq(o.startBlend, BLEND_LISTENER_F32, '원본 기본 블렌드 = f32(0.1) 0x3DCCCCCD');
  ok(o.startBlend !== 0.1 && Math.abs(o.startBlend - 0.1) < 1e-8, 'f32 0.1 ≠ double 0.1');
  const sh = slot();
  sh.play(motionArg('shift_a'));
  sh.play(motionArg('shift_b', { blendTime: 0.3 }));
  eq(sh.startBlend, 0, '이전 shift + 새 shift_rec → 블렌드 0');
  const sp = slot();
  sp.play(motionArg('co_idle00', { speed: 2 }));
  eq(sp.speed, 2, 'speedValid → 슬롯 속도');
  sp.play(motionArg('co_walk00', { speed: 3, speedValid: false }));
  eq(sp.speed, 2, 'speedValid 0 → 속도 유지');
}

console.log('3) 블렌드·가중치 곡선(§6.5: 초 단위, type 4 = elapsed/blend)');
{
  const s = slot(RULES_ORIGINAL);
  s.play(motionArg('co_idle00'));
  s.play(motionArg('co_walk00', { blendTime: 0.25, transitionType: TRANSITION_CROSSFADE }));
  eq([s.transitType, s.transitDuration, s.weight()], [4, 0.25, 0], '크로스페이드 시작 가중치 0');
  const ws: number[] = [];
  for (let i = 0; i < 16; i++) {
    s.step(STEP_SEC);
    ws.push(s.weight());
  }
  near(ws[0], f32(1 / 60) / 0.25, 1e-6, '1 스텝 = (1/60)/0.25');
  near(ws[5], (6 / 60) / 0.25, 1e-5, '6 스텝 = 0.4');
  eq(ws[14], 1, '15 스텝(0.25 s) = 1, 전이 끝');
  eq(s.transitType, 0, '끝나면 전이 없음');
  ok(s.prevName === 'co_idle00', '이전 노드 이름 보존');
  const n = slot(RULES_ORIGINAL);
  n.play(motionArg('co_idle00'));
  const pf = n.frame;
  n.play(motionArg('co_walk00', { blendTime: 0.5, transitionType: TRANSITION_CROSSFADE }));
  steps(n, 3);
  eq(n.prevFrame, (pf + 3) % 120, '크로스페이드 중 이전 노드도 진행(웹 이전 "이전 frame 고정" 아님)');
  const t1 = slot(RULES_ORIGINAL);
  t1.play(motionArg('co_idle00'));
  t1.play(motionArg('co_walk00'));
  steps(t1, 1);
  const pf1 = t1.prevFrame;
  steps(t1, 2);
  eq([t1.transitType, t1.prevFrame], [1, pf1], 'type 1 = 이전 포즈 고정(이전 노드 진행 없음)');
  const z = slot();
  z.play(motionArg('co_idle00'));
  z.play(motionArg('co_walk00', { blendTime: 0 }));
  eq([z.transitType, z.weight()], [0, 1], '블렌드 0 → 즉시 교체');
  const m2 = slot({ ...RULES_ORIGINAL, blendMode: 2 });
  m2.play(motionArg('co_idle00'));
  m2.play(motionArg('co_walk00'));
  eq(m2.startType, TRANSITION_CROSSFADE, 'bezel mode 2 → type 1 을 4 로');
}

console.log('4) mpat 우선순위 a/b·α/β(§6.5)');
{
  const mpat = json<Record<string, [string | null, string | null, number, number, number, number][]>>('chara/mpat.json');
  const mg = mpatRows(mpat.mg1801_pc);
  eq(mg.length, 3, 'mg1801_pc 3항목');
  eq(mpatFind([mg], 'rhy_knife_swing00', 'rhy_knife_idle00')?.a, 1, 'swing → idle a=1');
  eq(mpatFind([mg], 'rhy_knife_swing00', 'rhy_knife_swing00')?.a, 0, 'swing → swing a=0');
  eq(mpatFind([mg], 'co_idle00', 'rhy_knife_idle00'), null, '일치 없음 → null(리스너 값 유지)');
  const sys = mpatRows(mpat.sys_pc);
  eq(mpatFind([mg, sys], 'co_idle00', 'bd_idle_random00')?.a, 24, '표 순서: 장면 → sys');
  eq(mpatFind([sys], 'co_anything', 'bd_fall00')?.a, 90, '빈 from = 아무 모션 [추정]');
  const s = slot(RULES_ORIGINAL, (n) => n - 1, [mg]);
  s.play(motionArg('rhy_knife_idle00', { forceRestart: true }));
  steps(s, 7);
  s.play(motionArg('rhy_knife_swing00', { forceRestart: true, blendTime: 0.2 }));
  eq([s.startBlend, s.frame], [f32(1 / 60), 0], 'idle → swing: a=1 → blend f32(1/60) (리스너 0.2 보다 우선), α=β=0 → 시작 0');
  s.play(motionArg('rhy_knife_swing00', { forceRestart: true }));
  eq([s.startBlend, s.transitType], [0, 0], 'swing → swing a=0 → 즉시');
  const ab = slot(RULES_ORIGINAL, (n) => n - 1, [[{ from: 'co_idle00', to: 'co_walk00', a: 6, b: 4, alpha: 1, beta: 0.25 }]]);
  ab.play(motionArg('co_idle00'));
  ab.setFrame(60);
  ab.play(motionArg('co_walk00'));
  eq(ab.startType, 4, 'b ≠ −1 → type = b');
  eq(ab.frame, f32(44 * f32(1 * f32(60 / 120) + 0.25)), 'α·β: newFrame = FrameMaxNew·(α·old/FrameMaxOld + β) = 44·0.75');
  const web = slot(RULES_WEB, (n) => n - 1, [mg]);
  web.play(motionArg('rhy_knife_idle00'));
  web.play(motionArg('rhy_knife_swing00'));
  eq(web.startBlend, 0.1, 'RULES_WEB: mpat 무시(기존 결과 유지)');
  const tr = json<{ transit: { from: string | null; to: string; a: number }[] }>('plaza/player/spec.json').transit;
  eq([mpatBlendCompat(tr, 'co_walk00', 'co_idle00')! * 60, mpatBlendCompat(tr, 'co_idle00', 'co_run00')! * 60, mpatBlendCompat(tr, 'co_idle00', 'mn_bnclr_get00')], [12, 8, undefined], '광장 호환 조회(transitBlend 와 같음)');
}

console.log('5) 본·shape 전이 시간 clamp(§4.2: D = max(min, min(blend, max)))');
{
  const s = slot(RULES_ORIGINAL);
  s.play(motionArg('co_idle00'));
  s.play(motionArg('co_walk00', { blendTime: 0.1 }));
  steps(s, 3);
  eq(s.weight(0, 0), 1, 'bex_no_transit_bone {0,0} → D 0 → 즉시 1');
  near(s.weight(0, 0.07), f32(f32(f32(1 / 60) * 3) / 1) / 0.07, 1e-6, 'bex_limit_transit_bone 0.07 → elapsed/0.07');
  near(s.weight(), s.transitElapsed / 0.1, 1e-9, '제한 없음 → elapsed/0.1');
  steps(s, 2);
  eq(s.weight(0, 0.07), 1, '0.07 s(4.2 프레임) 지나면 1');
  ok(s.weight() < 1, '다른 뼈는 아직 전이 중');
  eq(slot().weight(0, FLT_MAX), 1, '전이 없음 → 1');
}

console.log('6) 프레임 진행·FrameMax·속도(§6.6·§6.7)');
{
  const want: Record<number, number> = { 90: 27, 100: 24, 120: 20, 150: 16, 180: 14, 240: 10 };
  const got: Record<number, number> = {};
  for (const bpm of Object.keys(want).map(Number)) {
    const s = slot(RULES_ORIGINAL);
    s.play(motionArg('rhy_knife_swing00', { forceRestart: true, speed: f32(bpm / 120) }));
    let n = 0;
    while (!s.isFinished() && n < 100) {
      s.step(STEP_SEC);
      n++;
    }
    got[bpm] = n;
  }
  eq(got, want, 'swing 20 프레임 끝까지 진행 횟수(f32 누적, BPM 100 = 24)');
  const l = slot();
  l.play(motionArg('rhy_knife_idle00'));
  l.setFrame(29);
  l.step(STEP_SEC);
  eq([l.frame, l.bundleFrame], [0, 30], '루프: 30 → 0 으로 감고 묶음 프레임은 감지 않음');
  const c = slot();
  c.play(motionArg('rhy_knife_swing00', { forceRestart: true, speed: 1.5 }));
  steps(c, 20);
  eq([c.frame, c.state], [20, STATE_FINISHED], '비루프: FrameMax 로 자르고 Finished');
  const r = slot();
  r.play(motionArg('rhy_knife_swing00', { speed: -1, startFrame: 5 }));
  r.setFrame(3);
  steps(r, 3);
  eq([r.frame, r.isFinished()], [0, true], '역재생: 0 에서 Finished');
  const m = slot();
  m.play(motionArg('co_idle00'));
  m.setFrame(0);
  m.modelSpeed = 0.5;
  m.conditionSpeed = 2;
  m.speed = 1.5;
  m.step(STEP_SEC);
  eq(m.frame, f32(f32(1 * f32(1.5 * 2)) * 0.5), 'clipDelta = dt·60·speed·conditionSpeed·modelSpeed');
  const d = slot();
  d.play(motionArg('co_idle00'));
  d.setFrame(0);
  d.step(1 / 30);
  eq(d.frame, 2, '가변 dt(1/30) = 2 프레임');
  const p = slot();
  p.play(motionArg('co_idle00'));
  p.paused = true;
  const pf = p.frame;
  steps(p, 5);
  eq(p.frame, pf, '일시정지 = 진행 없음');
  eq(slot().state, STATE_NONE, '상태 None');
  const st = slot();
  st.play(motionArg('co_idle00'));
  eq(st.state, STATE_PLAYING, '상태 Playing');
}

console.log('7) 큐 교체 순서(진행 뒤 큐 소비, §6.6)');
{
  const s = slot();
  s.play(motionArg('co_win00a', { forceRestart: true }));
  s.enqueue(motionArg('co_win00b'));
  eq(s.queuedName, 'co_win00b', '큐에 b');
  steps(s, 59);
  eq([s.name, s.frame], ['co_win00a', 59], 'a 59 프레임');
  const seq = s.startSeq;
  s.step(STEP_SEC);
  eq([s.name, s.frame, s.bundleFrame, s.startSeq, s.queuedName, s.startBlend], ['co_win00b', 0, 0, seq + 1, null, 0.1], 'a 끝난 스텝에 b 시작(시작 0, 블렌드 기본 0.1)');
  s.step(STEP_SEC);
  eq(s.frame, 1, '다음 스텝부터 b 진행');
  const q = slot();
  q.play(motionArg('co_win00a'));
  q.enqueue(motionArg('co_win00b'));
  q.play(motionArg('co_walk00'));
  eq(q.queuedName, null, '새 Play 는 큐를 비운다');
  const core = new CharacterCore({ info: (n) => TABLE[n], rand: (n) => n - 1 });
  core.play('co_win00a', { next: 'co_win00b', force: true });
  eq(core.main.queuedName, 'co_win00b', 'play(name, {next}) = EnqueuePlay');
}

console.log('8) 시선(ComHeading §6.8)');
{
  const inp = headInput();
  const set = (dx: number, dy: number, dz: number, cx = dx, cy = dy, cz = dz): void => {
    inp.has = true;
    inp.dx = dx;
    inp.dy = dy;
    inp.dz = dz;
    inp.cx = cx;
    inp.cy = cy;
    inp.cz = cz;
  };
  const wide = { minDeg: [-180, -180, -180] as [number, number, number], maxDeg: [180, 180, 180] as [number, number, number], weight: 1 };
  const h = new HeadLook(wide, HEAD_RULES_ORIGINAL);
  set(0, 0, 1);
  h.update(0, inp);
  eq(Array.from(h.qT), [0, 0, 0, 1], '앞쪽 대상(a = 180° > 60°) → qS = 단위');
  set(0, 0, -1);
  h.update(0, inp);
  eq(Array.from(h.qT).map((v) => +v.toFixed(12)), [0, 1, 0, 0], '바로 뒤(a = 0 < 40°) → qU = Y 축 180°(최단 회전 (1,0,0,0) 대신)');
  const hw = new HeadLook(wide, HEAD_RULES_WEB);
  hw.update(0, inp);
  eq(Array.from(hw.qT), [1, 0, 0, 0], '웹 이전(분기 없음): 바로 뒤 = (1,0,0,0)');
  /* 대상: 캐릭터 공간 c = 뒤에서 deg 만큼(수평), head 부모 공간 d = 같은 방위 + 위로 0.5(정규화) — qS(최단 회전)와 qU(위 축 유지 기저)가 달라진다 */
  const dirOf = (deg: number): [number, number, number] => {
    const r = deg * (Math.PI / 180);
    const l = Math.hypot(Math.sin(r), 0.5, Math.cos(r));
    return [Math.sin(r) / l, 0.5 / l, -Math.cos(r) / l];
  };
  const at = (deg: number): Float64Array => {
    const r = deg * (Math.PI / 180);
    const [dx, dy, dz] = dirOf(deg);
    set(dx, dy, dz, Math.sin(r), 0, -Math.cos(r));
    h.update(0, inp);
    return Float64Array.from(h.qT);
  };
  const shortest = (deg: number): number[] => {
    const [dx, dy, dz] = dirOf(deg);
    const s = Math.sqrt(2 * (1 + dz));
    return [-dy / s, dx / s, 0, s * 0.5];
  };
  const dot = (a: ArrayLike<number>, b: ArrayLike<number>): number => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  const basis = (deg: number): Float64Array => {
    const [dx, dy, dz] = dirOf(deg);
    const rl = Math.hypot(dz, dx);
    const rx = dz / rl,
      rz = -dx / rl;
    let ux = dy * rz,
      uy = dz * rx - dx * rz,
      uz = -dy * rx;
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul;
    uy /= ul;
    uz /= ul;
    return quatFromMat3([rx, ux, dx, 0, uy, dy, rz, uz, dz], quat(), true);
  };
  near(dot(at(61), shortest(61)), 1, 1e-12, 'a = 61° > 60° → qS');
  near(dot(at(60 + 1e-9), shortest(60)), 1, 1e-6, 'A(60°) 경계 = qS');
  near(dot(at(40 - 1e-9), basis(40)), 1, 1e-6, 'B(40°) 경계 = qU');
  near(dot(at(30), basis(30)), 1, 1e-12, 'a = 30° < 40° → qU');
  ok(dot(shortest(50), basis(50)) < 1 - 1e-4, 'qS ≠ qU(위로 기운 대상)');
  const q50 = at(50);
  const d1 = dot(q50, shortest(50));
  const d2 = dot(q50, basis(50));
  ok(d1 < 1 - 1e-6 && d2 < 1 - 1e-6 && d1 > dot(shortest(50), basis(50)) && d2 > dot(shortest(50), basis(50)), 'B < a < A → qS·qU 사이 보간(t = (a−A)/(B−A))', `${d1} ${d2}`);
  const dz = new HeadLook(wide, HEAD_RULES_ORIGINAL);
  dz.cur.set([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
  set(0.1, 0, -1);
  dz.update(0, inp);
  const mirrored = new HeadLook(wide, HEAD_RULES_ORIGINAL);
  mirrored.cur.set([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
  set(-0.1, 0, -1);
  mirrored.update(0, inp);
  eq(Array.from(dz.qT), Array.from(mirrored.qT), '뒤 데드존(π−|atan2| < 20°): 지난 qP 정면 x 부호(−)를 d.x 에 복사');
  const sgnKeep = (deg: number, frontX: number): number => {
    const t = new HeadLook(wide, HEAD_RULES_ORIGINAL);
    t.cur.set(frontX < 0 ? [0, -Math.SQRT1_2, 0, Math.SQRT1_2] : [0, Math.SQRT1_2, 0, Math.SQRT1_2]);
    const r = (deg * Math.PI) / 180;
    set(Math.sin(r), 0, -Math.cos(r));
    t.update(0, inp);
    return Math.sign(t.qT[1]) * Math.sign(t.qT[3] || 1);
  };
  ok(sgnKeep(10, -1) !== sgnKeep(10, 1), '데드존 안(10°): 정면 부호에 따라 결과가 갈림');
  ok(sgnKeep(25, -1) === sgnKeep(25, 1), '데드존 밖(25°): 정면 부호와 무관');
  const chin = new HeadLook({ minDeg: [-40, -60, -5], maxDeg: [20, 60, 5], weight: 1, chinCoef: 0.5 }, HEAD_RULES_ORIGINAL);
  set(0, -3, 1);
  inp.chinX = 0.6;
  chin.update(0, inp);
  const e3 = new Float64Array(3);
  const before = eulerYZX(qslerp(quat(), chin.qT, 1), e3)[0];
  const xq = eulerYZX((chin as unknown as { q: Float64Array }).q, new Float64Array(3))[0];
  near(xq, Math.min(before, (20 * Math.PI) / 180 + 0.5 * Math.max(0, 0.6 - before)), 1e-9, 'chin: effectiveMax.x = max.x + coef·max(0, θchin − θhead)');
  inp.chinX = NaN;
  const hq = quat();
  const nq = neckQuat([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, -1, 0, 1, 0, 0, 0, 0, 1], hq, quat());
  const s2 = Math.SQRT1_2;
  eq(Array.from(nq).map((v) => +v.toFixed(12)), [0, 0, +(0.5 * s2).toFixed(12), +(s2 + 0.5 * (1 - s2)).toFixed(12)], 'neck: q = qN + 0.5(qH − qN), 재정규화 없음');
  const fol = new HeadLook({ weight: 0.5 }, HEAD_RULES_WEB);
  set(1, 0, 1);
  for (let i = 0; i < 120; i++) fol.update(1, inp);
  ok(fol.apply && Math.abs(fol.cur[1]) > 0.1, '따라가기: 120 스텝 뒤 머리 회전 적용');
  inp.has = false;
  fol.update(1, inp);
  ok(!fol.eyesActive, '대상 없음 → 눈 끔');
}

console.log('9) 눈·깜빡임(§6.8 눈 UV, §4.2 묶음)');
{
  const p = { ox: 2, oy: 0, sx: 0.3, sy: 0.1, minx: 1.98, miny: -0.1, maxx: 2.35, maxy: 0.22, rot: 0 };
  const e = new EyeLook(p, 'blend');
  e.update(1, true, 0.1, 0, 2, 0);
  near(e.outX, 2 + (2 + 0.03 - 2) * 0.6 * 0.6, 1e-12, '원본: 첫 스텝 = 모션 값 + (따라간 uv − 모션 값)·섞임비 0.6');
  for (let i = 0; i < 60; i++) e.update(1, true, 0.1, 0, 2, 0);
  near(e.outX, 2.03, 1e-6, '수렴 = t_offset + yaw·t_scale');
  for (let i = 0; i < 60; i++) e.update(1, false, 0, 0, 2, 0);
  near(e.outX, 2, 1e-6, '눈 끔 → 모션 값 쪽(0.3 속도)');
  const big = new EyeLook(p, 'blend');
  big.update(1, true, 10, 10, 2, 0);
  for (let i = 0; i < 80; i++) big.update(1, true, 10, 10, 2, 0);
  ok(big.outX <= 2.35 + 1e-9 && big.outY >= -0.1 - 1e-9, 't_min/t_max 로 자름');
  const n = new EyeLook(p, 'npc');
  n.update(1, true, 0.1, 0, 0, 0);
  near(n.outX, 2 + 0.03 * 0.6, 1e-12, '광장 NPC(웹 이전): 출력 = 지난 출력 + (목표 − 지난 출력)·0.6');
  const s = slot();
  s.play(motionArg('co_idle00'));
  steps(s, 300);
  eq([s.frame, s.bundleFrame, wrap(s.bundleFrame, 380)], [(119 + 300) % 120, 419, 39], '깜빡임 프레임 = 묶음 노드 프레임을 fcl_blink00(380) 으로 감음');
}

console.log('10) FTRG 평가(05 §7.5)·실제 데이터');
{
  const c = new FtrgCursor();
  c.reset(0);
  c.collect(0, 1, 1);
  eq([c.count(0, 0, 0, 0, false, 30), c.count(1, 0, 0, 0, false, 30)], [0, 1], '첫 평가(진행 뒤): p<e≤f, e=0 은 제외');
  c.reset(0);
  c.collect(0, 0, 1);
  eq(c.count(0, 0, 0, 0, false, 30), 1, '첫 평가(진행 없음): 최초이고 e=f → 프레임 0 포함');
  c.commit();
  c.collect(0, 0, 1);
  eq(c.count(0, 0, 0, 0, false, 30), 0, '두 번째부터는 최초 equality 없음');
  c.reset(29);
  c.commit();
  c.collect(29, 1, 1);
  eq([c.C, c.count(0, 0, 0, 0, false, 30), c.count(15, 0, 0, 0, false, 30), c.count(30, 0, 0, 0, false, 30)], [1, 1, 0, 1], '루프 감김: C−P+[e≤f]−[e≤p]');
  eq([c.count(0, 0, 0, 1, false, 30), c.count(30, 0, 0, 1, false, 30)], [0, 1], '모드 1(K 한 루프): 루프 0 의 30 만, 루프 1 의 0 은 아님');
  eq(c.count(0, 0, 0, 2, false, 30), 0, '모드 2(K 까지): 루프 1 은 아님');
  c.reset(10);
  c.commit();
  c.collect(10, 8, -1);
  eq([c.count(9, 0, 0, 0, false, 30), c.count(10, 0, 0, 0, false, 30), c.count(8, 0, 0, 0, false, 30), c.count(9, 1, 0, 0, false, 30), c.count(9, 2, 0, 0, false, 30)], [1, 1, 0, 0, 1], '역방향: f<e≤p, 방향 1(정)은 제외');
  c.reset(5);
  c.collect(5, 6, 1);
  eq([c.count(40, 0, 0, 0, true, 60)], [1], '즉시 플래그: 최초 평가에서 통과 검사 없이');
  c.commit();
  eq([c.count(40, 0, 0, 0, true, 60)], [0], '즉시 플래그: 최초 뒤에는 없음');
  eq([pickWeighted([['a', 50], ['b', 50]], 0.25), pickWeighted([['a', 50], ['b', 50]], 0.5), pickWeighted([['a', 50], ['b', 50]], 0.75)], [0, 0, 1], '가중 선택: r ≤ wᵢ 인 첫 자원');

  const base = json<{ sources: Record<string, FtrgSource> }>('chara/ftrg_base.json').sources;
  const run = (pc: string, motion: string, n: number, extra: string[] = ['rc_'], ground: string | null = null): { step: number; e: CharacterEvent }[] => {
    const f = json<{ model: string; sources: Record<string, FtrgSource> }>(`chara/${pc}/ftrg.json`);
    const motions = json<Record<string, MotionInfo>>(`chara/${pc}/motions.json`);
    const core = new CharacterCore({ info: (k) => motions[k] ?? TABLE[k], rand: () => 0, ftrg: new FtrgBank({ ...base, ...f.sources }, f.model, extra) });
    core.ground = ground;
    const out: { step: number; e: CharacterEvent }[] = [];
    let st = 0;
    core.on((e) => out.push({ step: st, e: { ...e } }));
    core.play(motion, { force: true, start: 0 });
    for (st = 1; st <= n; st++) core.step();
    return out;
  };
  const sw = run('pc01', 'rhy_knife_swing00', 25);
  eq(sw.map((x) => [x.step, x.e.kind, x.e.key, x.e.label, x.e.frame, x.e.source]), [
    [2, 'se', 'RC_RHY_KNIFE_SWING00', 'SQ_SE_MG1801_SWING', 2, 'rc_pc_base'],
    [3, 'voice', 'VO_RHY_KNIFE_SWING00', 'SQ_VOI_PC01_JUMP', 3, 'vo_pc_base'],
  ], 'pc01 swing: 프레임 2 RC(rc_pc_base) → SQ_SE_MG1801_SWING, 프레임 3 VO(참조 vo_pc_base) → SQ_VOI_PC01_JUMP');
  eq(sw[0].e.hook, 'NDcha_pos', 'RC 훅 NDcha_pos');
  const sw2 = run('pc02', 'rhy_knife_swing00', 25);
  eq(sw2.map((x) => [x.e.label, x.e.source]), [['SQ_SE_MG1801_SWING', 'rc_pc02_luigi'], ['SQ_VOI_PC02_JUMP', 'vo_pc02_luigi']], 'pc02: 캐릭터 소스의 자기 행(캐릭터별 보이스 선택)');
  const sw62 = run('pc62', 'rhy_knife_swing00', 25);
  eq(sw62.map((x) => [x.step, x.e.kind, x.e.label]), [[2, 'voice', 'SQ_VOI_PC62_ACTION_HIGH'], [2, 'se', 'SQ_SE_MG1801_SWING']], 'pc62: 보이스 프레임 2·ACTION_HIGH(트랙 pc62_rhy_knife_swing00, 참조 없음). 같은 프레임은 부착 순서(vo_ → 장면 rc_)');
  eq(run('pc01', 'rhy_knife_swing00', 25, []).map((x) => x.e.key), ['VO_RHY_KNIFE_SWING00'], 'rc_ 는 자동 6 접두 밖(장면이 붙임)');
  const walk = run('pc02', 'co_walk00', 100, [], 'wood_light');
  const fs2 = walk.filter((x) => x.e.key === 'SE_FS_WALK');
  const wl = json<Record<string, MotionInfo>>('chara/pc02/motions.json').co_walk00.frames;
  eq(fs2.slice(0, 2).map((x) => [x.step, x.e.frame, x.e.label, x.e.ground, x.e.source]), [
    [17, 17, 'SQ_SE_FS_PC02_WALK', 'wood_light', 'se_pc02_luigi_base'],
    [39, 39, 'SQ_SE_FS_PC02_WALK', 'wood_light', 'se_pc02_luigi_base'],
  ], '발소리: se_pc02_luigi → 참조 se_pc02_luigi_base 의 SE_FS_WALK 17·39, 지면 전달');
  eq(fs2.length, 2 * Math.floor(100 / wl) + (100 % wl >= 39 ? 2 : 100 % wl >= 17 ? 1 : 0), `발소리 루프마다(모드 0) — co_walk00 ${wl} 프레임`);
  eq(walk.filter((x) => x.e.key === 'VO_CO_WALK00').map((x) => [x.step, x.e.kind]), [[4, 'voice']], '보이스 VO_CO_WALK00 모드 1(K 0) = 첫 루프만');
}

console.log('11) import 경계·할당 0');
{
  const read = (p: string): string => fs.readFileSync(path.join(WEB, p), 'utf8');
  const imps = (s: string): string[] => [...s.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  eq(imps(read('script/game/lib/character/index.ts')), [], '코어 import 0');
  ok(!/\b(THREE|document|window)\b/.test(read('script/game/lib/character/index.ts').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), '코어에 three·DOM 이름 없음');
  const ad = [...new Set(imps(read('script/game/lib/character-three/index.ts')))].sort();
  eq(ad, ['../character', 'three', 'three/examples/jsm/loaders/GLTFLoader.js'], 'three 어댑터 = three + 코어만');
  const base = json<{ sources: Record<string, FtrgSource> }>('chara/ftrg_base.json').sources;
  const f = json<{ model: string; sources: Record<string, FtrgSource> }>('chara/pc02/ftrg.json');
  const motions = json<Record<string, MotionInfo>>('chara/pc02/motions.json');
  const bank = new FtrgBank({ ...base, ...f.sources }, f.model, ['rc_']);
  const inp = headInput();
  inp.has = true;
  const chars = [0, 1, 2, 3].map((i) => {
    const c = new CharacterCore({
      info: (k) => motions[k],
      rand: (n) => (n > 1 ? 1 : 0),
      rules: i % 2 ? RULES_ORIGINAL : RULES_WEB,
      head: { weight: 0.5 },
      headRules: i % 2 ? HEAD_RULES_ORIGINAL : HEAD_RULES_WEB,
      eyes: [{ ox: 2, oy: 0, sx: 0.3, sy: 0.1, minx: 1.98, miny: -0.1, maxx: 2.35, maxy: 0.22, rot: 0 }],
      ftrg: bank,
      mpat: [mpatRows(json<Record<string, [string | null, string | null, number, number, number, number][]>>('chara/mpat.json').sys_pc)],
    });
    c.ground = 'stone';
    return c;
  });
  let events = 0;
  for (const c of chars) c.on(() => events++);
  const names = ['co_walk00', 'co_run00', 'co_idle00', 'rhy_knife_swing00'];
  const playOpt = { force: true, next: 'co_idle00' };
  let plays = 0;
  let playing = true;
  const tick = (k: number): void => {
    for (let j = 0; j < chars.length; j++) {
      const c = chars[j];
      if (playing && k % 240 === j * 7) {
        c.play(names[(k / 240 + j) % names.length | 0], playOpt);
        plays++;
      }
      c.step();
      const a = (k * 0.013 + j) % 6.28;
      inp.dx = inp.cx = Math.sin(a);
      inp.dz = inp.cz = Math.cos(a) - (j === 3 ? 1.2 : 0);
      inp.dy = inp.cy = 0.2;
      c.head!.update(1, inp);
      c.eyes[0].setMotion(2, 0);
      c.eyes[0].updateFrom(1, c.head!);
    }
  };
  for (let k = 0; k < 100000; k++) tick(k);
  let gcs = 0;
  const obs = new PerformanceObserver((list) => {
    gcs += list.getEntries().length;
  });
  obs.observe({ entryTypes: ['gc'] });
  const newSpace = (): number => {
    for (const sp of v8.getHeapSpaceStatistics()) if (sp.space_name === 'new_space') return sp.space_used_size;
    return 0;
  };
  const flush = async (): Promise<void> => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setImmediate(r));
  };
  /* 새 공간 사용량 차 = 구간 할당(그 사이 GC 가 없었던 구간만). 측정 자체의 할당은 빈 구간 중앙값으로 뺀다 */
  const chunk = async (k0: number, work: boolean): Promise<number | null> => {
    await flush();
    const g0 = gcs;
    const b = newSpace();
    if (work) for (let k = k0; k < k0 + 2000; k++) tick(k);
    const a = newSpace();
    await flush();
    return gcs === g0 ? a - b : null;
  };
  const empty: number[] = [];
  for (let i = 0; i < 9; i++) {
    const d = await chunk(0, false);
    if (d !== null) empty.push(d);
  }
  const zeroAt = empty.sort((x, y) => x - y)[empty.length >> 1] ?? 0;
  const e0 = events;
  /* A: 재생 요청 없이 스텝만(모션 진행·루프·FTRG 평가·발소리·시선·눈) */
  playing = false;
  for (const [j, c] of chars.entries()) c.play(names[j % 2], { force: true });
  for (let k = 0; k < 60000; k++) tick(k);
  let zero = 0;
  let measured = 0;
  const odd: number[] = [];
  for (let i = 0; i < 60; i++) {
    const d = await chunk(200000 + i * 2000, true);
    if (d === null) continue;
    measured++;
    if (d - zeroAt <= 0) zero++;
    else odd.push(d - zeroAt);
  }
  ok(events - e0 > 1000, `모션 이벤트가 실제로 났다 ${events - e0}`);
  ok(measured >= 40 && zero === measured, `매 스텝 할당 0: 캐릭터 4명 × 2000 틱 구간 ${zero}/${measured} 이 새 공간 증가 0(진행·루프·FTRG 평가·발소리·시선·눈)`, `빈 구간 기준 ${zeroAt} B, 0 아닌 구간 ${odd.join(',')} B`);
  /* B: 재생 요청(노드 교체·mpat·큐)이 섞인 구간 — 재생 한 번당 바이트(보고) */
  playing = true;
  plays = 0;
  let bytes = 0;
  let mb = 0;
  for (let i = 0; i < 60; i++) {
    const p0 = plays;
    const d = await chunk(400000 + i * 2000, true);
    if (d === null) continue;
    mb += plays - p0;
    bytes += Math.max(0, d - zeroAt);
  }
  obs.disconnect();
  ok(mb > 0 && bytes / mb < 128, `재생 요청 한 번당 ${(bytes / Math.max(1, mb)).toFixed(1)} B(최적화 밖 실수 상자 — 스텝 아님)`);
}

console.log('12) 소비자 골든(tools/character_golden.ts)');
/*
 * 2026-10-09 사용자 결정(기본 = 원본 규칙, 09 §14.7)으로 GOLDEN_SHA256 을 원본 규칙 기본값 실행으로 갱신했다(결과가 바뀌는 것이 정상, 바뀐 까닭은 09 §14.6).
 * GOLDEN_SHA256_WEB = 이전 전 코드 트리 기록 — characterDefaults 를 RULES_WEB·HEAD_RULES_WEB 로 돌린 실행이 여전히 같은지 본다.
 */
{
  const res = await runGolden();
  for (const [name, want] of Object.entries(GOLDEN_SHA256)) {
    const r = res.get(name);
    ok(!!r && sha256(r.text) === want, `원본 규칙(기본) ${name} 틱 ${r ? r.text.split('\n').length - 1 : 0} 기준과 같음`, r ? sha256(r.text) : '없음');
  }
  const web = await runGolden(undefined, false, true);
  for (const [name, want] of Object.entries(GOLDEN_SHA256_WEB)) {
    const r = web.get(name);
    ok(!!r && sha256(r.text) === want, `RULES_WEB ${name} = 이전 전 코드 기록`, r ? sha256(r.text) : '없음');
  }
}

console.log('13) three 어댑터 원본 전이(RULES_ORIGINAL: type 1 이전 포즈 고정 + 본·shape 시간 clamp, §4.2) — pc01 co_chr_slct00a → co_walk00');
{
  install();
  const [g, idle, walk, slct] = await Promise.all(['chara/pc01/pc01_mario.glb', 'chara/pc01/motion/co_idle00.glb', 'chara/pc01/motion/co_walk00.glb', 'chara/pc01/motion/co_chr_slct00a.glb'].map((u) => parseGlb(u)));
  const motions = json<MotionDataTable>('chara/pc01/motions.json');
  const table: MotionDataTable = {};
  for (const [k, v] of Object.entries(motions)) table[k] = { ...v, blinkName: undefined };
  const mk = (): { view: CharacterView; slot: MotionSlot } => {
    const root = cloneSkinned(g.scene);
    const view = new CharacterView(root, { gltf: g, animGltfs: [idle, walk, slct], motions: table });
    const slot = new MotionSlot(RULES_ORIGINAL, { info: (n) => table[n], rand: () => 0 });
    return { view, slot };
  };
  const a = mk();
  const ref = mk();
  const faceOf = (v: CharacterView): number[] => {
    let w: number[] = [];
    v.root.traverse((o) => {
      const m = o as unknown as { morphTargetInfluences?: number[] };
      if (m.morphTargetInfluences && o.name.startsWith('mario_face')) w = [...m.morphTargetInfluences];
    });
    return w;
  };
  a.slot.play(motionArg('co_chr_slct00a'));
  a.view.start(a.slot, a.slot.startBlend);
  for (let i = 0; i < 62 && !faceOf(a.view).some((v) => v > 0.1); i++) {
    a.slot.step(STEP_SEC);
    a.view.pose(a.slot, STEP_SEC);
  }
  ok(faceOf(a.view).some((v) => v > 0.1), `co_chr_slct00a 얼굴 shape 가 0 이 아닌 프레임 ${a.slot.frame}`);
  a.slot.play(motionArg('co_walk00', { blendTime: 0.1 }));
  a.view.start(a.slot, a.slot.startBlend);
  ref.slot.play(motionArg('co_walk00'));
  ref.view.start(ref.slot, 0);
  eq([a.slot.transitType, a.slot.frame, ref.slot.frame], [1, 0, 0], 'type 1·같은 시작 프레임(비루프 → startFrame 0)');
  const q = (v: CharacterView, n: string): number[] => v.root.getObjectByName(n)!.quaternion.toArray();
  const same = (x: number[], y: number[]): boolean => x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 1e-12);
  const lid: boolean[] = [];
  const pel: boolean[] = [];
  const fc: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    a.slot.step(STEP_SEC);
    ref.slot.step(STEP_SEC);
    a.view.pose(a.slot, STEP_SEC);
    ref.view.pose(ref.slot, STEP_SEC);
    lid.push(same(q(a.view, 'L_eyeline_upper'), q(ref.view, 'L_eyeline_upper')));
    pel.push(same(q(a.view, 'pelvis'), q(ref.view, 'pelvis')));
    fc.push(same(faceOf(a.view), faceOf(ref.view)));
  }
  eq(lid, [false, false, false, false, true, true, true], '눈꺼풀 뼈 bex_limit_transit_bone 0.07 s → 5 스텝째(0.083 s)부터 새 모션 그대로');
  eq(pel, [false, false, false, false, false, true, true], '골반(제한 없음) → 블렌드 0.1 s = 6 스텝째부터');
  eq(fc, [false, false, false, false, true, true, true], '얼굴 shape bex_limit_transit_shape 0.07 s → 5 스텝째부터');
}

console.log(fails ? `실패 ${fails}/${count}` : `통과 ${count}/${count}`);
process.exit(fails ? 1 : 0);
