/**
 * 공용 이펙트 런타임 시험(노드, 헤드리스 없음) — docs/engine/08_effects.md §14.6.
 *   npx tsx tools/test_effect.ts            (자료: assets/mg1801/effect/effects.json — tools/analysis/mg1801_web_effects.py)
 * 0) 이름 해석·등록 순서  1) 핸들·세대·수명  2) 방출 수·간격·첫 방출(§6.1, §10.3)  3) 수명 표본(float L)  4) 운동식 단계값(CPU·GPU 해석식·wave CS·FSPN)
 * 5) 표본 분포·난수 소비(N/Q·회전·Box)  6) 키(패딩·보간·루프·type 3)  7) 정렬(sortType·음수 비교·이미터셋 key)  8) 정지·fade·selfDestroy
 * 9) PlayRate·부착(follow)  10) 결정성(Math.random 미사용·씨앗)  11) import 경계·할당 0  12) 원본 기대값(§10.3)  13) 골든(이전 전과 같음 + 원본 기준)
 * 기대값 근거: 08 §3.3·§5.3·§6.1~6.7·§10.3. 원본 실행 대조가 아니라 판독한 규칙의 재구현 시험이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PerformanceObserver } from 'node:perf_hooks';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';
import {
  EffectCore,
  EffectRegistry,
  EmitterRt,
  Lcg,
  ParticlePool,
  RULES_ORIGINAL,
  RULES_WEB,
  Xorshift128,
  effectDefaults,
  keyAtOrig,
  keyTabOrig,
  nqTables,
  packDepth,
  sinCpu,
  type EffectRules,
  type EffectsJson,
  type EmitterDef,
  type MatrixSource,
} from '@game/lib/effect';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let count = 0;
let fails = 0;
const ok = (c: boolean, msg: string, extra = ''): void => {
  count++;
  if (!c) {
    fails++;
    console.log(`  실패: ${msg}${extra ? ` (${extra})` : ''}`);
  }
};
const eq = <T>(a: T, b: T, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), msg, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const near = (a: number, b: number, eps: number, msg: string): void => ok(Math.abs(a - b) <= eps, msg, `${a} ≈ ${b}`);
const F = Math.fround;

const DATA = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/mg1801/effect/effects.json'), 'utf8')) as EffectsJson;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function mkCore(rules: Readonly<EffectRules> = RULES_ORIGINAL, data: EffectsJson = DATA, seed = 0x1234): EffectCore {
  const g = new Xorshift128(seed, 0x9e3779b9, 0x7f4a7c15, 0x94d049bb);
  const c = new EffectCore({ rules, seed: () => g.next() });
  c.registry.registerJson(data);
  c.warn = () => undefined;
  return c;
}
function play(c: EffectCore, name: string, x = 0, y = 0, z = 0, selfDestroy = true): number {
  const h = c.create(name);
  if (h < 0) return h;
  c.setPosition(h, x, y, z);
  c.setSelfDestroy(h, selfDestroy);
  c.start(h);
  return h;
}
const em = (c: EffectCore, h: number, name: string) => c.emitters(h).find((e) => e.name === name)!;
const liveOf = (c: EffectCore, h: number, name: string): number => em(c, h, name)?.live ?? 0;
/** 한 이미터 정의만 가진 자료(시험용) */
function single(def: EmitterDef, setName = 'test_set'): EffectsJson {
  return { aliases: {}, textures: {}, sets: { [setName]: { emitters: [def], path: `t\\${setName}.eset` } }, resources: [{ name: 't', sets: [setName] }] };
}
const baseDef = (set: string, i: number): EmitterDef => clone(DATA.sets[set].emitters[i]);
const ident = (d: EmitterDef): EmitterDef => {
  d.trs = { trans: [0, 0, 0], transRand: [0, 0, 0], rotate: [0, 0, 0], rotateRand: [0, 0, 0], scale: [1, 1, 1] };
  return d;
};

/* ---------------------------------------------------------------- 0 */
console.log('0) 이름 해석·등록 순서(§3.3)');
{
  const r = new EffectRegistry();
  const a = { emitters: [], path: 'mg\\a\\effect\\dup.eset' };
  const b = { emitters: [], path: 'mg\\b\\effect\\dup.eset' };
  const c = { emitters: [], path: 'mg\\b\\effect\\only_b.eset' };
  r.register('mg/a', [['dup', a]]);
  r.register('mg/b', [
    ['dup', b],
    ['only_b', c],
  ]);
  eq(r.resolve('dup')?.resource, 'mg/a', '같은 이름 = 먼저 등록한 리소스(등록 순서 우선)');
  eq(r.resolve('mg/b/effect/dup.eset')?.resource, 'mg/b', '1단계: 소문자·/→\\ 경로 비교가 이름보다 먼저');
  eq(r.resolve('MG/B/EFFECT/ONLY_B.ESET')?.name, 'only_b', '경로 비교는 소문자로');
  eq(r.resolve('only_b.eset')?.name, 'only_b', '3단계: 마지막 . 뒤를 잘라 이름 strcmp');
  eq(r.resolve('ONLY_B'), null, '3단계 이름 비교는 대소문자 구분(strcmp)');
  eq(r.resolve('ONLY_B', 'web')?.name, 'only_b', 'web 해석: 소문자 basename');
  eq(r.resolve('x/y/only_b'), null, '원본: 경로가 붙은 확장자 없는 이름은 못 찾음');
  eq(r.resolve('x/y/only_b', 'web')?.name, 'only_b', 'web: basename 만');
  r.addAlias('alias#0', 'only_b');
  eq(r.resolve('alias#0')?.name, 'only_b', '별칭(CMN_EFFECT_ID 등)');
  const core = mkCore();
  eq(core.registry.resources, ['mg/mg1801', 'mg/mg1800', 'libca/mg_common'], 'mg1801 장면 리소스 등록 순서');
  eq(core.create('없는_이름'), -1, '없는 이름 = −1(원본 Abort, 웹 경고 후 무시)');
  const ev = core.events[(core.eventCount - 1) & 63];
  eq([ev.kind, ev.name], ['missing', '없는_이름'], '없는 이름 사건');
}

/* ---------------------------------------------------------------- 1 */
console.log('1) 핸들·세대·수명(§5)');
{
  const c = mkCore();
  const h = c.create('mg1800_success01');
  ok(h >= 0 && c.has(h), 'Create = 핸들');
  eq(c.alive(h), true, 'Start 전: 방출이 남아 alive');
  c.release(h);
  ok(!c.has(h), 'release 뒤 핸들 무효');
  const h2 = c.create('mg1800_success01');
  ok(h2 !== h && (h2 & 0xfff) === (h & 0xfff), '같은 칸 재사용 + 세대 증가 → 옛 핸들과 다름');
  ok(!c.has(h) && c.has(h2), '옛 핸들은 새 이펙트를 가리키지 않음');
  c.setPosition(h, 9, 9, 9);
  c.start(h2);
  c.step();
  c.sync();
  ok(c.pools.some((p) => p.count > 0), 'Start(false) 뒤 첫 step 에서 방출(§5.3 일반 경로)');
  const nostart = c.create('mg1800_success00');
  for (let k = 0; k < 5; k++) c.step();
  eq(liveOf(c, nostart, 'ring00'), 0, 'Start 없이 계산하지 않음');
}

/* ---------------------------------------------------------------- 2 */
console.log('2) 방출 수·간격·첫 방출(§6.1)');
{
  const c = mkCore();
  const h = play(c, 'mg1801_water_entry00', 0, -0.5, 0);
  const born: Record<string, number[]> = {};
  for (let t = 0; t < 30; t++) {
    const before: Record<string, number> = {};
    for (const e of c.emitters(h)) before[e.name] = e.live;
    c.step();
    for (const e of c.emitters(h)) if (e.live > before[e.name]) (born[e.name] ??= []).push(t);
    if (t === 0) {
      const n = Object.fromEntries(c.emitters(h).map((e) => [e.name, e.live]));
      eq(n, { shader00: 5, splash01: 15, splash02: 12, bubble00: 4800, wave00: 1, wave01: 1, white_wave00: 1 }, 'water_entry00 프레임 0: 5·15·12·4800(120×분할 40)·1·1·1(§10.3)');
    }
  }
  eq(born.wave00, [0, 8, 16], 'wave00 방출 프레임 0·8·16(duration 24, 간격 8)');
  eq(born.wave01, [0, 5, 10, 15, 20, 25], 'wave01 0·5·…·25');
  eq(born.white_wave00, [0, 2, 4, 6, 8], 'white_wave00 0·2·4·6·8');
  eq(born.shader00, [0], 'shader00 one-time 보정 interval=duration → 한 번');
  const rt = new EmitterRt(DATA.sets.mg1801_water_entry00.emitters[3]);
  eq([rt.interval, rt.maxParticles], [1, 9600], 'bubble00: interval 59→1, 최대 입자 floor(120·0)+120·2 = 240 × 분할 40');
  const s = new EmitterRt(DATA.sets.mg1801_steam00.emitters[0]);
  eq(s.maxParticles, 84, 'steam00 최대 입자 = floor(6·floor(120/10)) + 6·2');
  /* 첫 방출 최소 1(bit1): rate 0.25 */
  const d = ident(baseDef('mg1800_success01', 0));
  d.emit = { ...d.emit, oneTime: false, rate: 0.25, interval: 0, duration: 100 };
  d.particle.life = 1000;
  const c2 = mkCore(RULES_ORIGINAL, single(d));
  const h2 = play(c2, 'test_set');
  const lives: number[] = [];
  for (let t = 0; t < 9; t++) {
    c2.step();
    lives.push(liveOf(c2, h2, d.name));
  }
  eq(lives, [1, 1, 1, 1, 2, 2, 2, 2, 3], '첫 방출 rate ≤ 1 → 1(누적은 0 에서 다시 0.25씩 → 4 스텝마다)');
  const cw = mkCore(RULES_WEB, single(d));
  play(cw, 'test_set');
  cw.sync();
  eq(cw.pools[0].count, 0, 'web: 첫 방출 최소 1 없음(누적 0.25)');
  /* intervalRandom: LCG 1회, 정수 간격 증가 */
  const d3 = ident(baseDef('mg1800_success01', 0));
  d3.emit = { ...d3.emit, oneTime: false, rate: 1, interval: 3, intervalRandom: 4, duration: 100 };
  d3.particle.life = 1000;
  const c3 = mkCore(RULES_ORIGINAL, single(d3));
  const h3 = play(c3, 'test_set');
  const at: number[] = [];
  for (let t = 0; t < 60; t++) {
    const b = liveOf(c3, h3, d3.name);
    c3.step();
    if (liveOf(c3, h3, d3.name) > b) at.push(t);
  }
  const gaps = at.slice(1).map((v, i) => v - at[i]);
  ok(gaps.every((g) => g >= 4 && g <= 7) && new Set(gaps).size > 1, 'intervalRandom 4: 간격 4..7 정수(interval+1+high32(seed·4))', gaps.join(','));
}

/* ---------------------------------------------------------------- 3 */
console.log('3) 수명 표본(§6.2 074f880)');
{
  const c = mkCore();
  const h = play(c, 'mg1801_steam00', 0, 0, 0, false);
  for (let t = 0; t < 100; t++) c.step();
  const p = em(c, h, 'steam00').pool;
  const lives = new Set<number>();
  for (let s = 0; s < p.used; s++) if (p.owner[s] >= 0) lives.add(p.life[s]);
  const allowed = new Set(Array.from({ length: 30 }, (_, k) => F(120 * F(1 - k * F(0.01)))));
  ok([...lives].every((l) => allowed.has(l)), 'L = life·(1 − 0.01k), k = high32(seed·lifeRandom) ∈ 0..29');
  ok([...lives].some((l) => l !== Math.trunc(l)), 'L 은 float(정수로 자르지 않음)');
  /* 죽음 경계: age ≥ L 이면 소멸 */
  const d = ident(baseDef('mg1800_success01', 0));
  d.particle.life = 4;
  const c2 = mkCore(RULES_ORIGINAL, single(d));
  const h2 = play(c2, 'test_set');
  const seen: number[] = [];
  for (let t = 0; t < 7; t++) {
    c2.step();
    c2.sync();
    seen.push(c2.pools[0].count);
  }
  eq(seen, [1, 1, 1, 1, 0, 0, 0], '수명 4: 그리기 나이 0..3 의 4 프레임');
  ok(!c2.has(h2), 'one-time + selfDestroy → 끝나면 해제');
}

/* ---------------------------------------------------------------- 4 */
console.log('4) 운동식 단계값(§6.2·§6.3)');
{
  /* CPU: P₁ = P + Δt·m·V(감쇠·중력 전) → V·a^Δt → V += Δt·g */
  const c = mkCore();
  const h = play(c, 'mg1801_water_entry00', 0, -0.5, 0);
  c.step();
  const sp = em(c, h, 'splash01');
  const pool = sp.pool;
  const def = pool.def;
  const s = [...Array(pool.used).keys()].find((k) => pool.owner[k] === sp.id)!;
  const P0 = [pool.p[s * 3], pool.p[s * 3 + 1], pool.p[s * 3 + 2]];
  const V0 = [pool.v[s * 3], pool.v[s * 3 + 1], pool.v[s * 3 + 2]];
  const m = pool.m[s];
  c.step();
  const a = F(def.airRes);
  const g = def.gravity;
  const P1 = P0.map((p, j) => F(p + F(F(1 * m) * V0[j])));
  const V1 = V0.map((v, j) => F(F(v * a) + F(1 * g[j])));
  eq([pool.p[s * 3], pool.p[s * 3 + 1], pool.p[s * 3 + 2]], P1, 'CPU 위치 = P + Δt·m·V(이전 속도)');
  eq([pool.v[s * 3], pool.v[s * 3 + 1], pool.v[s * 3 + 2]], V1, 'CPU 속도 = a^Δt·V + Δt·g(중력에 m 없음)');
  /* web 닫힌 식: 같은 1프레임에 V 감쇠가 먼저(p + v·a + g) */
  const cw = mkCore(RULES_WEB);
  const hw = play(cw, 'mg1801_water_entry00', 0, -0.5, 0);
  cw.step();
  cw.sync();
  const pw = em(cw, hw, 'splash01').pool;
  const sw = pw.order[0];
  const aw = pw.def.airRes;
  near(pw.oPos[sw * 3 + 1], F(pw.p[sw * 3 + 1] + pw.v[sw * 3 + 1] * aw + pw.def.gravity[1]), 1e-6, 'web: 나이 1 = p₀ + v₀·a + g(감쇠 먼저, 원본과 다름)');
  /* GPU calcType 1: p = p₀ + m(v₀F(T) + gG(T)), T = 나이 + Δt */
  const d = ident(baseDef('mg1800_success01', 2));
  const ct = mkCore(RULES_ORIGINAL, single(d));
  const ht = play(ct, 'test_set');
  ct.step();
  ct.step();
  ct.step();
  ct.sync();
  const tp = ct.pools[0];
  const ts = tp.order[0];
  const aa = F(d.airRes);
  const T = F(2 + 1);
  const E = F(Math.pow(2, F(T * Math.log2(aa))));
  const Fv = F(F(1 - E) / F(1 - aa));
  near(tp.oPos[ts * 3], F(tp.p[ts * 3] + F(tp.m[ts] * F(tp.v[ts * 3] * Fv))), 1e-6, 'GPU twinkle: 그리기 나이 2 → T = 3, F = (1−a^T)/(1−a)');
  eq(em(ct, ht, d.name).t, 3, '이미터 시각 3(그리기 나이 = E[28] − dt − b)');
  /* wave CS: P′ = P + Δt·m·V, V′ = V + N, N = A⊙sin(κ(u−0.5) + u·t²) 축 교차 */
  const cwv = mkCore();
  const hv = play(cwv, 'mg1801_water_entry00', 0, -0.5, 0);
  cwv.step();
  const wv = em(cwv, hv, 'wave00');
  const wp = wv.pool;
  const ws = [...Array(wp.used).keys()].find((k) => wp.owner[k] === wv.id)!;
  const U = [wp.u[ws * 4], wp.u[ws * 4 + 1], wp.u[ws * 4 + 2]];
  const A = wp.def.orig!.frn1!.f32;
  const kk = 6.283184051513672;
  eq(
    [wp.v[ws * 3], wp.v[ws * 3 + 1], wp.v[ws * 3 + 2]],
    [F(F(F(0) + 0) + F(A[0] * Math.sin(F(F(kk * F(U[2] - 0.5)) + F(U[2] * 0))))), F(F(F(0) + 0) + F(A[1] * Math.sin(F(F(kk * F(U[0] - 0.5)) + F(U[1] * 0))))), F(F(F(0) + 0) + F(A[2] * Math.sin(F(F(kk * F(U[1] - 0.5)) + F(U[0] * 0)))))],
    'wave00 CS: K=1, 나이 0 의 주기 힘 N(Δt·m 없음, 축 교차 u_z/u_x/u_y)',
  );
  eq(wp.def.orig!.frn1!.u32[3], 1, 'FRN1 K = payload +C u32 1(f32 표기 0 아님)');
  /* FSPN: 축 1(xz) 회전 0, 반경 + Δt·m·0.05 */
  const bb = em(cwv, hv, 'bubble00');
  const bp = bb.pool;
  const bs = [...Array(bp.used).keys()].find((k) => bp.owner[k] === bb.id)!;
  const x0 = bp.p[bs * 3],
    z0 = bp.p[bs * 3 + 2];
  const vx = bp.v[bs * 3],
    vz = bp.v[bs * 3 + 2],
    bm = bp.m[bs];
  cwv.step();
  const xm = F(x0 + F(bm * vx)),
    zm = F(z0 + F(bm * vz));
  near(Math.hypot(bp.p[bs * 3], bp.p[bs * 3 + 2]) - Math.hypot(xm, zm), F(bm * 0.05), 1e-5, 'FSPN axis 1: xz 반경 + Δt·m·radial(0.05)');
  ok(DATA.sets.mg1801_water_entry00.emitters[3].orig!.fspn!.u32[1] === 1, 'FSPN axis = u32 1(xz)');
}

/* ---------------------------------------------------------------- 5 */
console.log('5) 표본 분포·난수 소비(§6.2)');
{
  const { N, Q } = nqTables();
  let maxErr = 0;
  for (let i = 0; i < 512; i++) maxErr = Math.max(maxErr, Math.abs(Math.hypot(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2]) - 1));
  ok(maxErr < 1e-6, 'Q = 단위 벡터(정규화), w = 0');
  ok([...N].every((v) => v >= -1 && v < 1), 'N ∈ [−1, 1)');
  const g = new Xorshift128();
  const r0 = g.next();
  const b = new Float32Array(new Uint32Array([(0x3f800000 | (r0 >>> 9)) >>> 0]).buffer)[0];
  eq(N[0], F(F(F(b - 1) * 2) - 1), 'N[0] = (bitcast(3F800000 | rng>>9) − 1)·2 − 1, xorshift(178EAB2C,E318145E,45F0CDB4,720A056D)');
  const hq = crypto.createHash('sha1').update(Buffer.from(N.buffer)).update(Buffer.from(Q.buffer)).digest('hex').slice(0, 12);
  eq(hq, 'bb39e1f17256', 'N/Q 표 회귀(인덱스마다 N 4 → Q 3)');
  /* LCG */
  const L = new Lcg(0);
  eq([L.raw(), L.raw(), L.raw()], [0, 0x3039, (Math.imul(0x3039, 0x41c64e6d) + 0x3039) >>> 0], 'LCG seed·41C64E6D + 3039, 이전 seed 를 돌려줌');
  const L2 = new Lcg(0xffffffff);
  eq(L2.u(), 1, 'u = float(seed)·2⁻³² — 최상단은 1(f32 반올림)');
  /* 회전: 원본 (U−0.5)·initRand(가운데), web [0, initRand) 뒤 부호 */
  const co = mkCore();
  const ho = play(co, 'mg1801_steam00', 0, 0, 0, false);
  for (let t = 0; t < 40; t++) co.step();
  co.sync();
  const po = em(co, ho, 'steam00').pool;
  const rz: number[] = [];
  for (let k = 0; k < po.count; k++) rz.push(po.oRot[po.order[k] * 3 + 2] - 0);
  const lim = Math.PI / 2 + 0.0087 * 40;
  ok(rz.every((v) => Math.abs(v) <= lim + 1e-5), '원본 steam 회전 z ∈ σ(θ₀ + H·ω) + (U−0.5)·π → |θ| ≤ π/2 + 누적');
  const cw = mkCore(RULES_WEB);
  play(cw, 'mg1801_steam00', 0, 0, 0, false);
  for (let t = 0; t < 40; t++) cw.step();
  cw.sync();
  const pw = cw.pools.find((p) => p.def.name === 'steam00')!;
  const rw: number[] = [];
  for (let k = 0; k < pw.count; k++) rw.push(pw.oRot[pw.order[k] * 3 + 2]);
  ok(rw.some((v) => Math.abs(v) > lim + 0.05), 'web 회전 = init + u·π(뒤집기) → π/2 넘는 값 있음(분포 다름)');
}

/* ---------------------------------------------------------------- 6 */
console.log('6) 키(§6.3)');
{
  const t = keyTabOrig(2, [0, 0, 0], [
    [0, 0, 0, 0],
    [1, 2, 3, 0.5],
  ], false);
  eq([...t.v.slice(8, 12)], [1, 2, 3, F(0.5 + 2)], '1~7키 패딩: 마지막 xyz + (마지막 time + 슬롯 번호)');
  const o = new Float64Array(4);
  keyAtOrig(t, 0.25, o, 0);
  eq([o[0], o[1], o[2]], [0.5, 1, 1.5], '구간 선형 보간');
  keyAtOrig(t, 0.9, o, 0);
  eq([o[0], o[1], o[2]], [1, 2, 3], '마지막 키 뒤 = 마지막 값');
  keyAtOrig(t, -1, o, 0);
  eq([o[0], o[1], o[2]], [0, 0, 0], '첫 키 앞 = 첫 값');
  const fx = keyTabOrig(0, [0.2, 0.3, 0.4], [[9, 9, 9, 0]], false);
  keyAtOrig(fx, 0.7, o, 0);
  eq([o[0], o[1], o[2]], [F(0.2), F(0.3), F(0.4)], 'type 0 = 고정색(키 무시)');
  /* 루프 위상: P>0 → fmod(age + P·Uₓ·랜덤, P)/P */
  const d = ident(baseDef('mg1800_success01', 0));
  d.orig = { ...d.orig!, loopOn: [0, 1, 0, 0, 0], loopRandom: [0, 0, 0, 0, 0], loopPeriod: [100, 4, 100, 100, 100] };
  d.color.alpha0Type = 2;
  d.color.alpha0Keys = [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
  ];
  d.particle.life = 40;
  const c = mkCore(RULES_ORIGINAL, single(d));
  play(c, 'test_set');
  const al: number[] = [];
  for (let k = 0; k < 9; k++) {
    c.step();
    c.sync();
    al.push(c.pools[0].oC0[c.pools[0].order[0] * 4 + 3]);
  }
  eq(al, [0, 0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75, 0], 'alpha0 루프 주기 4 프레임');
}

/* ---------------------------------------------------------------- 7 */
console.log('7) 정렬(§6.5·§6.7)');
{
  const rt = new EmitterRt(DATA.sets.mg1801_water_entry00.emitters[5]);
  const p = new ParticlePool(0, rt, 8);
  const keys = [3, -1, 5, -4, 3, -2];
  const sorted = (desc: boolean, neg: boolean): number[] => {
    keys.forEach((k, i) => {
      p.oKey[i] = k;
      p.order[i] = i;
    });
    p.sortRange(0, keys.length, desc, neg);
    return [...p.order.slice(0, keys.length)].map((i) => keys[i]);
  };
  eq(sorted(true, false), [5, 3, 3, -1, -2, -4], 'sortType 1: 내림차순(같으면 칸 번호 오름차순)');
  eq(sorted(false, false), [-4, -2, -1, 3, 3, 5], 'sortType 3: 오름차순');
  eq(sorted(true, true), [5, 3, 3, -4, -2, -1], 'sortType 2 depthWrite 0: 내림차순, 둘 다 음수면 방향 뒤집기');
  eq(rt.sortType, 2, 'wave01 sortType 2(CC1)');
  eq([packDepth(0), packDepth(-1), packDepth(-1e-30)], [0, (0x800000 | ((127 - 0x40) << 16)) >>> 0, 0x800000], 'key 하위 24비트 압축(e<0 → 부호만)');
  ok(packDepth(-100) > packDepth(-1), '더 먼(음수 큰) 깊이 = 큰 key → 내림차순에서 먼저(뒤→앞)');
  /* 두 water_entry: 먼 쪽 셋이 먼저 */
  const c = mkCore();
  c.view.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1]);
  const near0 = play(c, 'mg1801_water_entry00', 0, 0, 5);
  const far = play(c, 'mg1801_water_entry00', 0, 0, -5);
  c.step();
  c.sync();
  const wp = em(c, near0, 'wave01').pool;
  eq(c.emitters(far).find((e) => e.name === 'wave01')!.id === wp.owner[wp.order[0]], true, '이미터셋 key: 카메라에서 먼 셋의 입자를 먼저');
}

/* ---------------------------------------------------------------- 8 */
console.log('8) 정지·fade·selfDestroy(§5.3)');
{
  const c = mkCore();
  const h = play(c, 'mg1801_steam00', 0, 0, 0, false);
  for (let t = 0; t < 30; t++) c.step();
  ok(liveOf(c, h, 'steam00') > 0, '김 방출 중');
  c.stop(h, false);
  c.step();
  c.sync();
  eq(c.pools.reduce((s, p) => s + p.count, 0), 0, '원본 Stop(false) = 즉시 kill(잔여 입자 없음)');
  ok(c.has(h) && !c.alive(h), 'selfDestroy 아님 → Effect 는 남고 alive=false');
  const cw = mkCore(RULES_WEB);
  const hw = play(cw, 'mg1801_steam00', 0, 0, 0, false);
  for (let t = 0; t < 30; t++) cw.step();
  cw.stop(hw);
  cw.step();
  cw.sync();
  ok(cw.pools.reduce((s, p) => s + p.count, 0) > 0, 'web stop = 방출만 멈춤(입자 수명대로)');
  /* Stop(true) fade: CCB + alphaFadeTime 4 → F 0.75·0.5·0.25·0 → kill */
  const d = ident(baseDef('mg1800_success01', 0));
  d.emit = { ...d.emit, oneTime: false, interval: 0, duration: 100 };
  d.particle.life = 1000;
  d.orig = { ...d.orig!, info0: d.orig!.info0.map((v, i) => (i === 11 ? 1 : v)), alphaFadeTime: 4 };
  const cf = mkCore(RULES_ORIGINAL, single(d));
  const hf = play(cf, 'test_set', 0, 0, 0, true);
  for (let t = 0; t < 3; t++) cf.step();
  cf.stop(hf, true);
  const fades: number[] = [];
  for (let t = 0; t < 5; t++) {
    cf.step();
    cf.sync();
    fades.push(cf.pools[0].count ? cf.pools[0].oFade[cf.pools[0].order[0]] : -1);
  }
  eq(fades, [0.75, 0.5, 0.25, -1, -1], 'fade F = max(0, F − dt/D[CD8]), 0 이면 kill');
  ok(!cf.has(hf), 'fade 끝 + selfDestroy → 지연 정리');
  /* selfDestroy: one-time 이펙트는 입자가 모두 죽은 스텝 끝에 해제 */
  const cs = mkCore();
  const hs = play(cs, 'mg1800_success01', 0, 1.5, 0);
  let freedAt = -1;
  for (let t = 0; t < 40 && freedAt < 0; t++) {
    cs.step();
    if (!cs.has(hs)) freedAt = t;
  }
  eq(freedAt, 30, 'success01: twinkle02 수명 30 → 그리기 나이 0..29, 나이 30 이 된 스텝 끝에 해제');
}

/* ---------------------------------------------------------------- 9 */
console.log('9) PlayRate·부착(§3.2·§5.3)');
{
  const d = ident(baseDef('mg1800_success01', 0));
  d.particle.life = 10;
  const c = mkCore(RULES_ORIGINAL, single(d));
  const h = play(c, 'test_set');
  c.setAnimationSpeed(h, 2);
  let n = 0;
  while (c.has(h) && n < 20) {
    c.step();
    n++;
  }
  eq(n, 6, 'PlayRate 2: 수명 10 → 그리기 나이 0·2·4·6·8 의 5 프레임, 6 번째 스텝에 해제');
  const cw = mkCore(RULES_WEB, single(d));
  const hw = play(cw, 'test_set');
  cw.setAnimationSpeed(hw, 2);
  let nw = 0;
  while (cw.has(hw) && nw < 20) {
    cw.step();
    nw++;
  }
  eq(nw, 10, 'web: PlayRate 안 씀');
  /* follow 0(현재 행렬) vs 1(생성 때 행렬) */
  const mk = (follow: number): number[] => {
    const e = ident(baseDef('mg1800_success01', 0));
    e.followType = follow;
    e.particle.life = 20;
    const cc = mkCore(RULES_ORIGINAL, single(e));
    let x = 0;
    const src: MatrixSource = { readMatrix: (out) => out.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]) };
    const hh = cc.create('test_set');
    cc.attach(hh, src);
    cc.start(hh);
    const xs: number[] = [];
    for (let t = 0; t < 4; t++) {
      x = t;
      cc.step();
      cc.sync();
      xs.push(cc.pools[0].oPos[cc.pools[0].order[0] * 3]);
    }
    return xs;
  };
  eq(mk(0), [0, 1, 2, 3], 'follow 0: 부착 대상 따라 이동');
  eq(mk(1), [0, 0, 0, 0], 'follow 1: 생성 때 위치에 남음');
}

/* ---------------------------------------------------------------- 10 */
console.log('10) 결정성');
{
  const run = (seed: number): string => {
    const c = mkCore(RULES_ORIGINAL, DATA, seed);
    play(c, 'mg1801_steam00', 0, 0, 0, false);
    for (let t = 0; t < 50; t++) {
      if (t % 10 === 3) play(c, 'mg1801_water_entry01', t * 0.1, -0.5, 0);
      c.step();
    }
    c.sync();
    const h = crypto.createHash('sha1');
    for (const p of c.pools) h.update(Buffer.from(p.oPos.buffer, 0, p.used * 12));
    return h.digest('hex');
  };
  const rnd = Math.random;
  let used = 0;
  Math.random = () => {
    used++;
    return rnd();
  };
  const a = run(7);
  const b = run(7);
  const d = run(8);
  Math.random = rnd;
  eq(used, 0, 'Math.random 미사용');
  eq(a, b, '같은 씨앗 → 같은 결과');
  ok(a !== d, '다른 씨앗(seed 선택 0 = 공유 xorshift) → 다른 결과');
  eq(sinCpu(Math.PI / 6) - 0.5 < 1e-6, true, 'SinCPU(π/6) ≈ 0.5(원본 계수)');
}

/* ---------------------------------------------------------------- 11 */
console.log('11) import 경계·할당 0');
await (async (): Promise<void> => {
  const read = (p: string): string => fs.readFileSync(path.join(WEB, p), 'utf8');
  const imps = (s: string): string[] => [...s.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  eq(imps(read('script/game/lib/effect/index.ts')), [], '코어 import 0');
  ok(!/\b(THREE|document|window|Math\.random|performance\.now|Date\.now)\b/.test(read('script/game/lib/effect/index.ts').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), '코어에 three·DOM·Math.random·벽시계 없음');
  eq([...new Set(imps(read('script/game/lib/effect-three/index.ts')))].sort(), ['../effect', 'three'], 'three 어댑터 = three + 코어만');
  const c = mkCore();
  const hs = [play(c, 'mg1801_steam00', 0, 0, 0, false), play(c, 'mg1801_steam01', 0, 0, 2, false)];
  for (let k = 0; k < 20000; k++) {
    if (k % 50 === 0 && k < 600) {
      play(c, 'mg1801_water_entry00', 0.5, -0.5, 0);
      play(c, 'mg1800_success01', 1, 1.5, 0);
    }
    c.step();
    c.sync();
  }
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
  const chunk = async (work: boolean, n: number): Promise<number | null> => {
    await flush();
    const g0 = gcs;
    const b = newSpace();
    if (work)
      for (let k = 0; k < n; k++) {
        c.step();
        c.sync();
      }
    const a = newSpace();
    await flush();
    return gcs === g0 ? a - b : null;
  };
  const med = (x: number[]): number => [...x].sort((p, q) => p - q)[x.length >> 1] ?? NaN;
  const measure = async (n: number, rounds: number): Promise<{ per: number; ok: number }> => {
    const empty: number[] = [];
    const full: number[] = [];
    for (let r = 0; r < rounds; r++) {
      const e = await chunk(false, n);
      const w = await chunk(true, n);
      if (e !== null) empty.push(e);
      if (w !== null) full.push(w);
    }
    return { per: (med(full) - med(empty)) / n, ok: full.length };
  };
  const emitting = await measure(300, 10);
  /* 방출을 멈추고(Stop(true), 김은 fade 플래그 없음 → 방출만 끝) 살아 있는 입자 갱신·출력만 */
  for (const h of hs) c.stop(h, true);
  const updating = await measure(20, 4);
  obs.disconnect();
  console.log(`   할당: 방출 없음 ${updating.per.toFixed(2)} B/스텝, 방출 포함 ${emitting.per.toFixed(1)} B/스텝`);
  ok(updating.ok >= 2 && updating.per < 2, `원본 step()+sync() 입자 갱신·출력(방출 없음) 할당 0(스텝당 ${updating.per.toFixed(2)} B)`);
  ok(emitting.ok >= 3 && emitting.per < 400, `방출 포함 정상 상태(김 2): 스텝당 ${emitting.per.toFixed(1)} B — 방출 함수 최적화 밖 실수 상자(남은 할당)`);
})();

/* ---------------------------------------------------------------- 12 */
console.log('12) 원본 기대값(§10.3)');
{
  const c = mkCore();
  const h = c.create('mg1800_success01');
  eq(c.emitters(h).map((e) => e.name), ['ring00', 'ring01', 'twinkle00', 'twinkle01', 'twinkle02'], 'create("mg1800_success01") → 이미터 5');
  const h2 = c.create('mg1801_steam00.eset');
  eq(c.emitters(h2)[0]?.name, 'steam00', '"mg1801_steam00.eset" → 확장자 제거로 mg1801_steam00');
  eq(c.emitters(c.create('ca::rm::util::ShowCommonEffect#0'))[0].name, 'ring00', 'CMN_EFFECT_ID 0 = mg1800_success01(JUST)');
  eq(c.emitters(c.create('ca::rm::util::ShowCommonEffect#1')).length, 7, 'CMN_EFFECT_ID 1 = mg1800_success00(FAST·SLOW, 이미터 7)');
  const cs = mkCore();
  const hs = play(cs, 'mg1801_steam00', 0, 0, 0, false);
  let lo = 1e9,
    hi = 0;
  for (let t = 0; t < 600; t++) {
    cs.step();
    if (t >= 240) {
      const n = liveOf(cs, hs, 'steam00');
      lo = Math.min(lo, n);
      hi = Math.max(hi, n);
    }
  }
  ok(lo >= 51 && hi <= 72, `steam00 정상 상태 입자 수 ${lo}~${hi} ⊂ 51~72(§10.3)`);
}

/* ---------------------------------------------------------------- 13 */
console.log('13) 골든(tools/effect_golden.ts)');
{
  const g = await import('./effect_golden');
  for (const [rules, want, label] of [
    [RULES_WEB, g.GOLDEN_SHA256_WEB, 'RULES_WEB = 이전 전 코드 트리'],
    [RULES_ORIGINAL, g.GOLDEN_SHA256, 'RULES_ORIGINAL = 원본 기준'],
  ] as const) {
    const keep = effectDefaults.rules;
    effectDefaults.rules = rules;
    for (const name of Object.keys(g.SCENARIOS)) {
      const r = await g.runScenario(name);
      const h = crypto.createHash('sha256').update(r.text).digest('hex');
      ok(!!want[name] && want[name] === h, `${label}: ${name}`, h);
    }
    effectDefaults.rules = keep;
  }
}

console.log(fails ? `실패 ${fails}/${count}` : `통과 ${count}/${count}`);
process.exit(fails ? 1 : 0);
