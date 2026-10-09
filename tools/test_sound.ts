/**
 * 사운드 런타임 노드 시험(헤드리스 없음) — docs/engine/04_sound.md §13.
 *   npx tsx tools/test_sound.ts
 * 1) 라벨 해석(프리셋 치환·와일드카드)  2) 핸들 칸·세대·수명  3) 그룹 소속·정지·FadeTimePreset  4) 덕킹
 * 5) 3D 식(옮긴 calc3d 같음·원본 기대값·f32)  6) 동시 발음(플레이어 한도·우선순위·아카이브 한도)  7) 엔진 난수(LCG 판독식)·결정성
 * 8) WebAudio 어댑터(가짜 컨텍스트: 핸들 노드·팬·정지·지역 변수·끝 판정·디코드 캐시·buffer 처리기)  9) import 경계·정적 검사  10) 할당
 * 11) 골든(tools/sound_golden.ts: RULES_WEB = 이전 전 + 흐름 사건 한 줄, RULES_ORIGINAL = 원본 기준) — 자식 프로세스로 돈다(가짜 전역을 쓰므로)
 */
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { execFileSync } from 'node:child_process';
import { PerformanceObserver } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  DUCKING_PRESET,
  FADE_TIME_PRESET,
  GROUP_AMB,
  GROUP_BGM,
  GROUP_JIN,
  GROUP_SE,
  GROUP_SEQ,
  GROUP_STREAM,
  GROUP_VOI,
  INSTANCE_MAX,
  RULES_ORIGINAL,
  RULES_WEB,
  SOUND3D_MANAGER,
  SoundCatalog,
  SoundCore,
  SoundRandom,
  calc3d,
  fadeTimeSec,
  soundDefaults,
  soundGroupsOf,
  type Listener3d,
  type SoundCmd,
  type SoundDef,
  type SoundRules,
} from '../script/lib/sound';
import { DecodeCache, WebAudioSoundOut, bufferVoiceFactory, type Voice } from '../script/lib/sound-webaudio';
import * as audioMod from '../script/view/audio';
import { GOLDEN_SHA256, GOLDEN_SHA256_WEB } from './sound_golden';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let count = 0;
let fails = 0;
function ok(c: boolean, msg: string, extra?: unknown): void {
  count++;
  if (!c) fails++;
  console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}${extra !== undefined && !c ? `  — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
}
const eq = (a: unknown, b: unknown, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), msg, { got: a, want: b });
const near = (a: number, b: number, e = 1e-9): boolean => Math.abs(a - b) <= e;

const def = (o: Partial<SoundDef> = {}): SoundDef => ({ kind: 'seq', bus: 'se', player: null, playerMax: 0, priority: 64, sound3d: null, voice: 'v', payload: null, ...o });

/** 코어 + 목소리 살아 있음 표(어댑터 없이) */
function mkCore(rules: Readonly<SoundRules> = RULES_ORIGINAL): { core: SoundCore; live: Set<number>; t: { now: number }; cmds: SoundCmd[] } {
  const live = new Set<number>();
  const t = { now: 0 };
  const cmds: SoundCmd[] = [];
  const core = new SoundCore({ rules, now: () => t.now, probe: (h) => live.has(h) });
  const drain = (): void =>
    core.drain((c) => {
      cmds.push({ ...c });
      if (c.op === 'start') live.add(c.h);
      if (c.op === 'stop') live.delete(c.h);
    });
  const play = core.play.bind(core);
  core.play = (cat, label, o) => {
    const h = play(cat, label, o);
    drain();
    return h;
  };
  const stopGroup = core.stopGroup.bind(core);
  core.stopGroup = (g, f) => {
    const n = stopGroup(g, f);
    drain();
    return n;
  };
  const stop = core.stop.bind(core);
  core.stop = (h, f) => {
    stop(h, f);
    drain();
  };
  return { core, live, t, cmds };
}

/* ---------------------------------------------------------------- 1 */
console.log('1) 라벨 해석');
{
  const m = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/mg1801/manifest.json'), 'utf8')) as { sounds: Record<string, unknown>; substitute: Record<string, { to: string; preset: string }> };
  const cat = new SoundCatalog('mg1801');
  for (const l of Object.keys(m.sounds)) cat.define(l, def());
  for (const [s, v] of Object.entries(m.substitute)) cat.substitute(s, v.to, v.preset);
  eq(cat.resolve('SQ_SE_RC_JUST', RULES_WEB), 'SQ_SE_RC_JUST', '프리셋이 꺼져 있으면 그대로');
  cat.loadPreset('mg1801');
  eq([cat.resolve('SQ_SE_RC_JUST', RULES_WEB), cat.resolve('SQ_SE_RC_JUST', RULES_ORIGINAL)], ['SQ_SE_MG1801_JUST_SOUND', 'SQ_SE_MG1801_JUST_SOUND'], '프리셋 mg1801: SQ_SE_RC_JUST → SQ_SE_MG1801_JUST_SOUND(두 규칙)');
  cat.loadPreset('mg1801_result');
  eq(cat.resolve('SM_JIN_MG1801_MG_RESULT_GOOD', RULES_ORIGINAL), 'SM_JIN_MG1801_MG_RESULT_GOOD', '대상(SM_JIN_RC01_MG_SUCCESS)이 표에 없으면 원래 라벨 — 웹 명세는 치환된 파일을 원래 라벨에 둔다');
  const v = new SoundCatalog().define('SQ_VOI_PC01_MUTE', def()).define('SQ_SE_DUMMY', def());
  v.substitute('SQ_VOI_PC**_JUMP', 'SQ_VOI_PC**_MUTE', 'mg1800_cmn').substitute('SQ_SE_FS_PC**_WALK', 'SQ_SE_DUMMY', 'mg1801').loadPreset('mg1800_cmn').loadPreset('mg1801');
  eq(
    [v.resolve('SQ_VOI_PC01_JUMP', RULES_WEB), v.resolve('SQ_VOI_PC01_JUMP', RULES_ORIGINAL), v.resolve('SQ_VOI_PC02_JUMP', RULES_ORIGINAL), v.resolve('SQ_SE_FS_PC56_WALK', RULES_ORIGINAL)],
    ['SQ_VOI_PC01_JUMP', 'SQ_VOI_PC01_MUTE', 'SQ_VOI_PC02_JUMP', 'SQ_SE_DUMMY'],
    "'**' 와일드카드: 웹 = 그대로, 원본 = 같은 두 글자로 치환(대상 있는 것만)",
  );
  eq(v.resolve('SQ_VOI_PC001_JUMP', RULES_ORIGINAL), 'SQ_VOI_PC001_JUMP', '와일드카드는 정확히 두 글자');
}

/* ---------------------------------------------------------------- 2 */
console.log('2) 핸들 칸·세대·수명');
{
  const { core, live } = mkCore();
  const cat = new SoundCatalog().define('A', def()).define('B', def());
  const a = core.play(cat, 'A');
  ok(a > 0 && core.alive(a) && core.label(a) === 'A', '재생 → 핸들(0 아님)·살아 있음·라벨');
  eq(core.play(cat, 'ZZZ'), 0, '없는 라벨 = 0');
  live.delete(a);
  ok(!core.alive(a), '목소리가 끝나면(probe) 죽음');
  const b = core.play(cat, 'B');
  ok(b % 1024 === a % 1024 && b !== a, `같은 칸을 다시 쓰고 세대가 다르다(${a} → ${b})`);
  core.stop(a);
  ok(core.alive(b), '낡은 핸들 stop 은 새 소리에 영향 없음');
  ok(core.label(a) === null && !core.alive(a), '낡은 핸들 = 없음');
  core.ended(b);
  ok(!core.alive(b), 'ended(h) → 칸 비움');
  const hs: number[] = [];
  for (let i = 0; i < 5; i++) hs.push(core.play(cat, 'A', { flags: i }));
  const order: number[] = [];
  core.forEach((h) => order.push(h));
  eq(order, hs, 'forEach = 재생 순서');
  eq(core.find('A'), hs[0], 'find = 가장 먼저 낸 것');
  const other = new SoundCatalog().define('A', def());
  core.play(other, 'A');
  let n = 0;
  core.forEach(() => n++, other);
  eq(n, 1, 'forEach(cat) = 그 표의 핸들만');
}

/* ---------------------------------------------------------------- 3 */
console.log('3) 그룹·FadeTimePreset');
{
  const g = (label: string, kind: 'seq' | 'stream' | 'wave' = 'seq'): number[] => {
    const [lo, hi] = soundGroupsOf(label, kind);
    const out: number[] = [];
    for (let i = 0; i < 32; i++) if ((lo >>> i) & 1) out.push(i);
    for (let i = 0; i < 10; i++) if ((hi >>> i) & 1) out.push(0x20 + i);
    return out;
  };
  eq(g('SQ_SE_MG1801_JUST'), [1, 0x20, 0x21, GROUP_SE, GROUP_SEQ], 'SQ_SE → 0x01·0x20·0x21·0x24(_SE_)·0x27(시퀀스)');
  eq(g('SM_BGM_MENU', 'stream'), [0x20, 0x21, GROUP_BGM, GROUP_STREAM], 'SM_BGM → 0x22·0x26');
  eq(g('SM_JIN_MG_WIN', 'stream'), [0x20, 0x21, GROUP_JIN, GROUP_STREAM], 'SM_JIN → 0x23');
  eq(g('SQ_VOI_PC01_JUMP'), [2, 0x20, 0x21, GROUP_VOI, GROUP_SEQ], 'SQ_VOI → 0x02·0x25');
  eq(g('SM_AMB_MG1801_MG_RESULT', 'stream'), [0x20, 0x21, GROUP_STREAM, GROUP_AMB], 'SM_AMB → 0x29');
  const { core } = mkCore();
  const cat = new SoundCatalog();
  for (const l of ['SM_BGM_X', 'SQ_SE_X', 'SQ_VOI_X', 'SM_AMB_X', 'SM_JIN_X']) cat.define(l, def({ kind: l.startsWith('SM') ? 'stream' : 'seq' }));
  const hs = Object.fromEntries(['SM_BGM_X', 'SQ_SE_X', 'SQ_VOI_X', 'SM_AMB_X', 'SM_JIN_X'].map((l) => [l, core.play(cat, l)]));
  let n = 0;
  for (const grp of [0x22, 1, 0x25, 0x29]) n += core.stopGroup(grp, FADE_TIME_PRESET[6]);
  ok(n === 4 && core.alive(hs.SM_JIN_X) && !core.alive(hs.SM_BGM_X) && !core.alive(hs.SQ_SE_X), 'FadeAndEntryCancel 네 그룹(0x22·1·0x25·0x29) = 징글만 남음(mgm_common 6.9)');
  eq(FADE_TIME_PRESET, [0.1, 0, 0.7, 0.2, 1.4, 2.0, 0.5, 6.0, 0.5, 4.0, 10.0], 'FadeTimePreset 표(6.9)');
  eq([fadeTimeSec('FADE_TIME_02'), fadeTimeSec('FADE_TIME_06'), fadeTimeSec('FADE_TIME_11'), fadeTimeSec('', 0.7)], [0.7, 0.5, 0, 0.7], 'fadeTimeSec: 02 = 0.7, 06 = 0.5, 11 이후 0, 이름 꼴 아니면 기본');
}

/* ---------------------------------------------------------------- 4 */
console.log('4) 덕킹');
{
  const { core, t } = mkCore();
  const cat = new SoundCatalog().define('SM_BGM_X', def({ kind: 'stream', userGroups: 1 << 0x0d })).define('SQ_SE_X', def());
  const bgm = core.play(cat, 'SM_BGM_X');
  const se = core.play(cat, 'SQ_SE_X');
  const got: SoundCmd[] = [];
  core.duckGroup(0x0d, true);
  core.drain((c) => got.push({ ...c }));
  ok(got.length === 1 && got[0].h === bgm && near(got[0].gain, 0.6) && near(got[0].time, 0.3), '켬: 그룹 0x0d 소속만 0.6 배로 0.3 s(gain 명령)', got);
  t.now = 0.15;
  core.update();
  ok(near(core.duckValue(0x0d), 0.8), '중간 값 선형(0.15 s → 0.8)', core.duckValue(0x0d));
  t.now = 0.4;
  core.update();
  ok(near(core.duckValue(0x0d), 0.6), '끝 = 0.6');
  core.duckGroup(0x0d, false);
  got.length = 0;
  core.drain((c) => got.push({ ...c }));
  ok(got.length === 1 && near(got[0].gain, 1) && near(got[0].time, 0.3), '끔: 1 로 0.3 s');
  ok(core.alive(se), 'SE 는 그대로');
  eq(DUCKING_PRESET[0x13], { volume: 0, onSec: 0.3, offSec: 0.3 }, '0x13 = 무음 0.3 s / 해제 0.3 s(6.9)');
}

/* ---------------------------------------------------------------- 5 */
console.log('5) 3D 식');
{
  ok(audioMod.calc3d === calc3d && audioMod.SOUND3D_MANAGER === SOUND3D_MANAGER, 'view/audio 의 calc3d·SOUND3D_MANAGER = 코어(같은 이름으로 다시 내보냄)');
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const L = (o: Partial<Listener3d> = {}): Listener3d => ({ pos: { x: 0, y: 0, z: 0 }, view: I, interiorSize: 10, maxVolumeDistance: 20, unitDistance: 50, output: true, ...o });
  const s1 = { flags: 0x0b, decayRatio: 0.5, decayCurve: 1, dopplerFactor: 0 };
  const a = calc3d([L()], s1, { x: 0, y: 0, z: -70 });
  ok(near(a.volume, 0.5) && a.priority === -16, `감쇠 곡선 1: d = maxVol + unit → decayRatio(0.5), 우선순위 −trunc(0.5·32) = −16`, a);
  const a2 = calc3d([L()], { ...s1, decayCurve: 2 }, { x: 0, y: 0, z: -45 });
  ok(near(a2.volume, 0.75), '감쇠 곡선 2(선형): d − maxVol = unit/2 → 1 − 0.5·0.5', a2);
  const sp = { flags: 0x0c, decayRatio: 0.5, decayCurve: 1, dopplerFactor: 0 };
  const at = (deg: number): number => {
    const r = (deg * Math.PI) / 180;
    return calc3d([L()], sp, { x: Math.sin(r) * 20, y: 0, z: -Math.cos(r) * 20 }).pan;
  };
  ok(near(at(15), 0.45) && near(at(-15), -0.45) && near(at(90), 0.9) && near(at(0), 0), `팬: 앞 30° 안은 θ/30°·0.9, 옆 = 0.9(${at(15)}, ${at(90)})`);
  eq(calc3d([L(), L({ maxVolumeDistance: 50, unitDistance: 10 })], sp, { x: 5, y: 0, z: -5 }).pan, 0, '출력 리스너가 둘 이상이면 팬 0(UpdateAmbientParam)');
  const f = calc3d([L()], s1, { x: 1.3, y: 0.7, z: -63.1 }, true);
  const d = calc3d([L()], s1, { x: 1.3, y: 0.7, z: -63.1 });
  ok(f.volume === Math.fround(f.volume) && near(f.volume, d.volume, 1e-6), `f32: 결과가 float 값, f64 와 1e-6 안(${f.volume} / ${d.volume})`);
}

/* ---------------------------------------------------------------- 6 */
console.log('6) 동시 발음');
{
  const { core, cmds } = mkCore(RULES_WEB);
  const cat = new SoundCatalog().define('F', def({ player: 'PLY_F', playerMax: 5, priority: 64 })).define('LOW', def({ player: 'PLY_F', playerMax: 5, priority: 10 }));
  const hs = [0, 1, 2, 3, 4].map(() => core.play(cat, 'F'));
  const h6 = core.play(cat, 'F');
  ok(h6 > 0 && !core.alive(hs[0]) && core.alive(hs[1]), '한도 5: 6번째는 같은 우선순위의 가장 오래된 것을 멈춤');
  ok(cmds.some((c) => c.op === 'stop' && c.h === hs[0]), '밀려난 소리에 stop 명령');
  eq(core.play(cat, 'LOW'), 0, '새 소리 우선순위가 가장 낮은 것보다 낮으면 거절');
  const p3 = new SoundCatalog().define('S', def({ player: 'P', playerMax: 1, priority: 64, sound3d: { flags: 0x0b, decayRatio: 0.5, decayCurve: 1, dopplerFactor: 0 } }));
  const c2 = mkCore(RULES_WEB);
  c2.core.setListeners([{ pos: { x: 0, y: 0, z: 0 }, view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], interiorSize: 10, maxVolumeDistance: 20, unitDistance: 50, output: true }]);
  const near3 = c2.core.play(p3, 'S', { pos: { x: 0, y: 0, z: -5 } });
  eq(c2.core.play(p3, 'S', { pos: { x: 0, y: 0, z: -70 } }), 0, '3D 우선순위 감소(먼 소리 64−16)가 가까운 소리(64)보다 낮으면 거절');
  ok(c2.core.alive(near3), '가까운 소리 그대로');
  for (const [rules, want] of [
    [RULES_WEB, 65],
    [RULES_ORIGINAL, INSTANCE_MAX.seq],
  ] as const) {
    const c = mkCore(rules);
    const cc = new SoundCatalog().define('SQ_SE_X', def());
    for (let i = 0; i < 65; i++) c.core.play(cc, 'SQ_SE_X');
    eq(c.core.count - c.cmds.filter((x) => x.op === 'stop').length, want, `아카이브 전체 한도(${rules.id}): 시퀀스 65개 → 살아 있는 ${want}`);
  }
}

/* ---------------------------------------------------------------- 7 */
console.log('7) 엔진 난수·결정성');
{
  const r = new SoundRandom();
  let u = 0x12345678;
  const want: number[] = [];
  for (let i = 0; i < 5; i++) {
    u = Number((BigInt(u) * 0x19660dn + 0x3c6ef35fn) & 0xffffffffn);
    want.push(u >>> 16);
  }
  eq([0, 1, 2, 3, 4].map(() => r.next()), want, 'FUN_71005df19c: u·0x19660D + 0x3C6EF35F, 상위 16비트(초기 0x12345678)');
  const r2 = new SoundRandom();
  const vals = [r2.range(-127, 127), r2.range(100, 127)];
  const r3 = new SoundRandom();
  const x1 = r3.next() & 0xffff;
  const x2 = r3.next() & 0xffff;
  eq(vals, [-127 + Math.floor((x1 * 255) / 65536), 100 + Math.floor((x2 * 28) / 65536)], 'random 인자 = min + ((r·(max−min+1)) >> 16)(FUN_71005c9b10 case 4)');
  const r4 = new SoundRandom();
  const r5 = new SoundRandom();
  const y1 = r5.next() & 0xffff;
  const y2 = r5.next() & 0xffff;
  eq([r4.randvar(10), r4.randvar(-10)], [Math.floor((y1 * 11) / 65536), -Math.floor((y2 * 11) / 65536)], 'randvar = ±((r·(|n|+1)) >> 16)(case 0x86)');
  const ra = new SoundRandom();
  const rb = new SoundRandom();
  for (let i = 0; i < 12345; i++) ra.next();
  rb.advance(12345);
  ok(ra.state === rb.state, 'advance(n) = next() n 번');
  const rf = new SoundRandom(1.0);
  rf.frame(1.0 + 0.0501);
  eq(rf.frames, 10, 'frame(t): 5 ms 사운드 프레임마다 한 칸(FUN_71005dd1e0)');
  const run = (): string => {
    const { core, t, cmds } = mkCore();
    const cat = new SoundCatalog().define('SQ_SE_A', def({ player: 'P', playerMax: 3, sound3d: { flags: 0x0f, decayRatio: 0.5, decayCurve: 1, dopplerFactor: 0 } }));
    core.setListeners([{ pos: { x: 0, y: 0, z: 0 }, view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], interiorSize: 10, maxVolumeDistance: 20, unitDistance: 50, output: true }]);
    for (let i = 0; i < 40; i++) {
      t.now = i / 60;
      core.play(cat, 'SQ_SE_A', { pos: { x: i - 20, y: 0, z: -i * 3 } });
      if (i % 7 === 0) core.stopGroup(1, 0.1);
      core.update();
    }
    return JSON.stringify(cmds);
  };
  ok(run() === run(), '같은 시각·명령 두 번 → 명령열 같음');
  ok(soundDefaults.rules === RULES_ORIGINAL, '기본 규칙 = 원본(2026-10-09 사용자 결정)');
}

/* ---------------------------------------------------------------- 8 */
console.log('8) WebAudio 어댑터(가짜 컨텍스트)');
await (async () => {
  class P {
    value: number;
    log: string[] = [];
    constructor(v: number) {
      this.value = v;
    }
    setValueAtTime(v: number, t: number): void {
      this.log.push(`set ${v} ${t}`);
    }
    linearRampToValueAtTime(v: number, t: number): void {
      this.log.push(`lin ${v} ${t}`);
    }
    cancelScheduledValues(t: number): void {
      this.log.push(`cancel ${t}`);
    }
  }
  class N {
    outs: N[] = [];
    connect(d: N): N {
      this.outs.push(d);
      return d;
    }
    disconnect(): void {
      this.outs = [];
    }
  }
  class G extends N {
    gain = new P(1);
  }
  class Pan extends N {
    pan = new P(0);
  }
  class Src extends N {
    buffer: unknown = null;
    loop = false;
    loopStart = 0;
    loopEnd = 0;
    started: [number, number] | null = null;
    stopped: number | null = null;
    ls: (() => void)[] = [];
    start(w: number, o: number): void {
      this.started = [w, o];
    }
    stop(w = 0): void {
      this.stopped = w;
    }
    addEventListener(_k: string, f: () => void): void {
      this.ls.push(f);
    }
  }
  const srcs: Src[] = [];
  const ctx = {
    currentTime: 0,
    createGain: () => new G(),
    createStereoPanner: () => new Pan(),
    createBufferSource: () => {
      const s = new Src();
      srcs.push(s);
      return s;
    },
  };
  const bus = new N();
  const out = new WebAudioSoundOut(ctx as unknown as BaseAudioContext, { bus: () => bus as unknown as AudioNode });
  const core = new SoundCore({ rules: RULES_ORIGINAL, now: () => ctx.currentTime, probe: out.probe });
  const voices: { stop: number[]; local: [number, number][]; alive: boolean }[] = [];
  out.register('v', {
    start: () => {
      const v = { stop: [] as number[], local: [] as [number, number][], alive: true };
      voices.push(v);
      return { alive: () => v.alive, stop: (f) => void v.stop.push(f), setLocal: (i, x) => void v.local.push([i, x]) } as Voice;
    },
  });
  const sp = { flags: 0x0c, decayRatio: 0.5, decayCurve: 1, dopplerFactor: 0 };
  const cat = new SoundCatalog().define('A', def()).define('P3', def({ sound3d: sp }));
  const LST: Listener3d[] = [{ pos: { x: 0, y: 0, z: 0 }, view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], interiorSize: 10, maxVolumeDistance: 20, unitDistance: 50, output: true }];
  core.setListeners(LST);
  const h = core.play(cat, 'A');
  out.apply(core);
  const g = out.handleNode(h) as unknown as G;
  ok(!!g && g.outs[0] === bus && g.gain.value === 1, '핸들 하나 = GainNode → 버스(팬 없으면 팬 노드 없음)');
  const h3 = core.play(cat, 'P3', { pos: { x: 20, y: 0, z: -1 } });
  out.apply(core);
  const g3 = out.handleNode(h3) as unknown as G;
  ok(g3.outs[0] instanceof Pan && near((g3.outs[0] as Pan).pan.value, calc3d(LST, sp, { x: 20, y: 0, z: -1 }, true).pan), '3D 팬이 있으면 GainNode → StereoPannerNode → 버스');
  core.writeLocal(h, 0, 3);
  core.stop(h, 0.5);
  out.apply(core);
  eq([voices[0].local, voices[0].stop], [[[0, 3]], [0.5]], 'local·stop 명령 → 처리기');
  voices[0].alive = false;
  out.poll(core);
  ok(!core.alive(h) && out.handleNode(h) === null && g.outs.length === 0, 'poll: 끝난 목소리 → 노드 끊고 core.ended');
  core.setVolume(h3, 0.5, 0.2);
  out.apply(core);
  ok(g3.gain.log.some((l) => l.startsWith('lin 0.5')), 'SetVolume(0.5, 0.2 s) → 핸들 GainNode 선형 램프', g3.gain.log);

  let bytes = 0;
  let decodes = 0;
  const buf = { duration: 2 };
  const dc = new DecodeCache(
    async () => {
      bytes++;
      return new ArrayBuffer(4);
    },
    async () => {
      decodes++;
      return buf as unknown as AudioBuffer;
    },
  );
  const [b1, b2] = await Promise.all([dc.get('k'), dc.get('k')]);
  ok(b1 === b2 && bytes === 1 && decodes === 1 && dc.peek('k') === b1 && dc.stats.hits === 1, '디코드 캐시: 같은 키 두 번 → 받기 1·풀기 1');

  out.register('buffer', bufferVoiceFactory(dc, (u) => u));
  const bc = new SoundCatalog()
    .define('L', def({ kind: 'stream', voice: 'buffer', payload: { url: 'k', late: 'skip', loop: { startSec: 0.5, endSec: 1.5 } } }))
    .define('W', def({ kind: 'stream', voice: 'buffer', payload: { url: 'k', late: 'wait', gain: 0.25 } }));
  ctx.currentTime = 10;
  core.play(bc, 'L', { at: 7.2 });
  out.apply(core);
  const sl = srcs[srcs.length - 1];
  ok(!!sl.started && sl.started[0] === 0 && near(sl.started[1], 0.5 + ((2.8 - 0.5) % 1)), `늦은 시작(skip): 지난 2.8 s 를 반복 구간으로 접은 offset ${sl.started?.[1]}`);
  const hw = core.play(bc, 'W');
  out.apply(core);
  const before = srcs.length;
  core.stop(hw, 0.3);
  out.apply(core);
  await Promise.resolve();
  await Promise.resolve();
  const sw = srcs[srcs.length - 1];
  ok(srcs.length === before + 1 && sw.stopped !== null && near(sw.stopped, 10.3), 'wait: 풀리기 전에 받은 페이드 정지 → 시작한 뒤 0.3 s 페이드로 멈춤(원본: 같은 프레임 그룹 정지도 페이드)');
  const hp = core.play(bc, 'L');
  out.apply(core);
  core.pause(hp, true);
  out.apply(core);
  ctx.currentTime = 10.4;
  core.pause(hp, false);
  out.apply(core);
  const sp2 = srcs[srcs.length - 1];
  ok(srcs.length >= 2 && !!sp2.started, 'pause → 다시: buffer 처리기는 위치를 기억하고 새 소스로 잇는다');
})();

/* ---------------------------------------------------------------- 9 */
console.log('9) import 경계·정적 검사');
{
  const read = (p: string): string => fs.readFileSync(path.join(WEB, p), 'utf8');
  const imps = (s: string): string[] => [...s.matchAll(/(?:import|export)[^'"]*from\s+'([^']+)'/g)].map((m) => m[1]);
  const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const core = code(read('script/lib/sound/index.ts'));
  eq(imps(core), [], 'lib/sound import 0');
  eq([...new Set(imps(read('script/lib/sound-webaudio/index.ts')))], ['../sound'], 'lib/sound-webaudio = 코어만');
  const bad = ['Math.random', 'performance.now', 'Date.now', 'new Date', 'document.', 'window.', 'requestAnimationFrame', 'setTimeout', 'setInterval'].filter((w) => core.includes(w));
  eq(bad, [], '코어: Math.random·벽시계·DOM·타이머 없음');
  ok(imps(read('script/shell/mgscene/sound.ts')).includes('../../lib/sound'), '틀 로직 MgSound → 코어 표(fadeTimeSec)');
  const rh = read('script/games/rhythm/view/sound.ts');
  ok(!/\bthis\.handles\b|\badmit\(|calc3d\(/.test(rh) && rh.includes('soundSystem('), '리듬 RmSoundMap: 자체 핸들·한도·3D 없음 → 코어(soundSystem)');
  const mg = code(read('script/view/mgsceneSound.ts'));
  ok(!mg.includes('BgmChannel') && mg.includes('soundSystem('), 'MgSceneSound: BgmChannel 대신 코어 핸들');
}

/* ---------------------------------------------------------------- 10 */
console.log('10) 할당');
await (async () => {
  const live = new Set<number>();
  const clk = { now: 0.5 };
  const core = new SoundCore({ rules: RULES_ORIGINAL, now: () => clk.now, probe: (h) => live.has(h) });
  const cat = new SoundCatalog().define('SQ_SE_A', def({ sound3d: { flags: 0x0f, decayRatio: 0.5, decayCurve: 1, dopplerFactor: 0 } }));
  core.setListeners([{ pos: { x: 0, y: 0, z: 0 }, view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], interiorSize: 10, maxVolumeDistance: 20, unitDistance: 50, output: true }]);
  for (let i = 0; i < 24; i++) live.add(core.play(cat, 'SQ_SE_A', { pos: { x: i, y: 0, z: -i } }));
  const acc = { sink: 0 };
  const onCmd = (c: SoundCmd): void => {
    acc.sink += c.gain;
  };
  const step = (): void => {
    clk.now += 1 / 60;
    core.update();
    core.drain(onCmd);
  };
  for (let i = 0; i < 2000; i++) step();
  let gcs = 0;
  const obs = new PerformanceObserver((list) => {
    gcs += list.getEntries().length;
  });
  obs.observe({ entryTypes: ['gc'] });
  const newSpace = (): number => {
    for (const s of v8.getHeapSpaceStatistics()) if (s.space_name === 'new_space') return s.space_used_size;
    return 0;
  };
  const flush = async (): Promise<void> => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setImmediate(r));
  };
  const chunk = async (work: boolean): Promise<number | null> => {
    await flush();
    const g0 = gcs;
    const a = newSpace();
    if (work) for (let i = 0; i < 300; i++) step();
    const b = newSpace();
    await flush();
    return gcs === g0 ? b - a : null;
  };
  const per: number[] = [];
  const empty: number[] = [];
  for (let r = 0; r < 8; r++) {
    const e = await chunk(false);
    const w = await chunk(true);
    if (e !== null) empty.push(e);
    if (w !== null) per.push(w);
  }
  obs.disconnect();
  const med = (x: number[]): number => [...x].sort((p, q) => p - q)[x.length >> 1] ?? NaN;
  const m = (med(per) - med(empty)) / 300;
  ok(per.length >= 3 && m < 2, `update()+drain() 정상 상태(3D 핸들 24, 원본 규칙 track3d) 할당 0(스텝당 ${m.toFixed(2)} B)`, { per, empty, sink: acc.sink });
})();

/* ---------------------------------------------------------------- 11 */
console.log('11) 골든(tools/sound_golden.ts, 자식 프로세스)');
{
  const run = (env: Record<string, string>): Record<string, string> => {
    const out = execFileSync(process.execPath, [path.join(WEB, 'node_modules/tsx/dist/cli.mjs'), path.join(WEB, 'tools/sound_golden.ts'), '-'], { cwd: WEB, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 1 << 24 });
    const m: Record<string, string> = {};
    for (const l of out.split('\n')) {
      const x = /^(\S+) ([0-9a-f]{64}) /.exec(l);
      if (x) m[x[1]] = x[2];
    }
    return m;
  };
  for (const [env, want, label] of [
    [{ GOLDEN_RULES: 'web' }, GOLDEN_SHA256_WEB, 'RULES_WEB = 이전 전 코드 트리(+ 틀 단계 16 사건 초 한 줄)'],
    [{ GOLDEN_RULES: 'original' }, GOLDEN_SHA256, 'RULES_ORIGINAL = 원본 기준'],
  ] as const) {
    const got = run(env);
    for (const n of Object.keys(want)) ok(got[n] === want[n], `${label}: ${n}`, got[n]);
    ok(Object.keys(want).length === 5, `${label}: 시나리오 5개`);
  }
}

console.log(fails ? `실패 ${fails}/${count}` : `통과 ${count}/${count}`);
process.exit(fails ? 1 : 0);
