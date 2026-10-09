/**
 * BGM 스트리밍 시험(노드, 헤드리스 없음). 설계: docs/engine/04_sound.md §12.
 * 실제 코드: 재생기 script/game/lib/bgmstream(배치·조각 PCM·일정), 빌드 산출물 assets-dist(조각 .ogg/.m4a·index.json streams).
 * 가짜: AudioContext(예약 기록 + 표본 단위 렌더 — 시작 = when 이상 첫 프레임, 멈춤 = when 미만 프레임, 이득 자동화 set·linearRamp).
 * 원본 모드 소스 = view/bgm.ts 원본 경로와 같은 조합(parseWav·planBgm·chunkSpans·fillPcm), 압축 모드 소스 = 조각 파일을 ffmpeg 로 풀어(브라우저 디코더 대리).
 *
 *   npx tsx tools/test_bgm_stream.ts            (먼저 npx tsx tools/build_assets.ts)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BgmStream, bgmChunkKey, chunkSpans, fillPcm, parseWav, planBgm, planItem, type BgmContext, type BgmLoaded, type BgmPlan, type BgmScheduled, type BgmSource, type WavPcm } from '@game/lib/bgmstream';
import { ffmpegPath } from './assets_audio';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(WEB, 'assets');
const DIST = path.join(WEB, 'assets-dist');
let fails = 0;
let count = 0;
const ok = (cond: boolean, msg: string, detail = ''): void => {
  count++;
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}${detail ? `  — ${detail}` : ''}`);
};
const info = (msg: string): void => console.log(`     ${msg}`);
const db = (x: number): string => (x <= 0 ? '-inf' : (10 * Math.log10(x)).toFixed(1));

// ---------------------------------------------------------------- 가짜 오디오
class FBuf {
  readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
}
type Ev = ['set' | 'ramp', number, number];
class FParam {
  events: Ev[] = [];
  constructor(public value: number) {}
  setValueAtTime(v: number, t: number): void {
    this.events.push(['set', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.events.push(['ramp', v, t]);
  }
  cancelScheduledValues(t: number): void {
    this.events = this.events.filter((e) => e[2] < t);
  }
  at(t: number): number {
    let v = this.value;
    let pt = -Infinity;
    for (const e of this.events) {
      if (e[2] <= t) {
        v = e[1];
        pt = e[2];
        continue;
      }
      if (e[0] === 'ramp') return pt === -Infinity ? v : v + ((e[1] - v) * (t - pt)) / (e[2] - pt);
      break;
    }
    return v;
  }
}
const DEST = { dest: true };
class FGain {
  readonly gain: FParam;
  to: unknown = null;
  constructor(v = 1) {
    this.gain = new FParam(v);
  }
  connect(d: unknown): unknown {
    this.to = d;
    return d;
  }
  disconnect(): void {}
}
class FSrc {
  buffer: FBuf | null = null;
  onended: (() => void) | null = null;
  when = NaN;
  offset = 0;
  stopT = Infinity;
  to: unknown = null;
  connect(d: unknown): unknown {
    this.to = d;
    return d;
  }
  disconnect(): void {}
  start(when: number, offset: number): void {
    this.when = when;
    this.offset = offset;
  }
  stop(t: number): void {
    this.stopT = t;
  }
}
class FCtx {
  currentTime = 0;
  state = 'running';
  readonly srcs: FSrc[] = [];
  constructor(readonly sampleRate = 48000) {}
  createBufferSource(): FSrc {
    const s = new FSrc();
    this.srcs.push(s);
    return s;
  }
  createGain(): FGain {
    return new FGain();
  }
}
const asCtx = (c: FCtx): BgmContext => c as unknown as BgmContext;
const toFrame = (t: number, sr: number): number => Math.ceil(t * sr - 1e-6);

/** 표본 단위 렌더(프레임 0 = 시각 0). late: 첫 노드를 그만큼 늦게 시작(브라우저가 늦게 받은 경우 흉내) */
function render(ctx: FCtx, frames: number, ch = 2, late = 0): Float32Array[] {
  const out = Array.from({ length: ch }, () => new Float32Array(frames));
  const sr = ctx.sampleRate;
  ctx.srcs.forEach((s, k) => {
    const b = s.buffer;
    if (!b || !Number.isFinite(s.when)) return;
    const f0 = toFrame(s.when, sr) + (k === 0 ? late : 0);
    const f1 = Math.min(frames, toFrame(s.stopT, sr));
    const ratio = b.sampleRate / sr;
    const i0 = s.offset * b.sampleRate;
    const gains: FParam[] = [];
    let n: unknown = s.to;
    while (n && n !== DEST) {
      gains.push((n as FGain).gain);
      n = (n as FGain).to;
    }
    for (let f = Math.max(0, f0); f < f1; f++) {
      const x = i0 + (f - f0) * ratio;
      const xi = Math.floor(x);
      const fr = x - xi;
      if (xi < 0 || xi >= b.length) continue;
      let g = 1;
      for (const p of gains) g *= p.at(f / sr);
      for (let c = 0; c < ch; c++) {
        const d = b.data[Math.min(c, b.numberOfChannels - 1)];
        const v = fr < 1e-9 || xi + 1 >= b.length ? d[xi] : d[xi] * (1 - fr) + d[xi + 1] * fr;
        out[c][f] += v * g;
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------- 소스
function readWav(rel: string): { w: WavPcm; bytes: number } {
  const b = fs.readFileSync(path.join(SRC, rel));
  const w = parseWav(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  if (!w) throw new Error(`wav 아님 ${rel}`);
  return { w, bytes: b.byteLength };
}

/** 원본 wav 의 타임라인(인트로 → 반복 본체 되풀이), 프레임 [0, n) */
function expected(w: WavPcm, plan: BgmPlan, n: number): Float32Array[] {
  const out = Array.from({ length: 2 }, () => new Float32Array(n));
  const lp = plan.loop;
  const spans: [number, number][] = [];
  let t = 0;
  while (t < n) {
    if (!lp) {
      const k = Math.min(n, plan.frames) - t;
      if (k > 0) spans.push([t, k]);
      spans.push([-1, n - Math.max(t, Math.min(n, plan.frames))]);
      break;
    }
    if (t < lp[0]) {
      const k = Math.min(n, lp[0]) - t;
      spans.push([t, k]);
      t += k;
      continue;
    }
    const q = lp[0] + ((t - lp[0]) % (lp[1] - lp[0]));
    const k = Math.min(n - t, lp[1] - q);
    spans.push([q, k]);
    t += k;
  }
  fillPcm(
    w,
    spans.filter((s) => s[1] > 0),
    out,
  );
  return out;
}

/** 원본 모드 소스(view/bgm.ts 원본 경로와 같은 조합). delay = 조각마다 완료까지 펌프 횟수 */
function srcSource(w: WavPcm, loop: [number, number] | null): BgmSource & { plan: BgmPlan } {
  const plan = planBgm(w.frames, w.rate, w.ch, loop);
  return {
    plan,
    open: () => Promise.resolve(plan),
    load: (i) => {
      const spans = chunkSpans(plan, i);
      const len = spans.reduce((n, s) => n + s[1], 0);
      const b = new FBuf(Math.min(2, w.ch), len, w.rate);
      fillPcm(w, spans, b.data);
      return Promise.resolve({ buffer: b, offset: plan.chunks[i].pre / w.rate });
    },
  };
}

/** ffmpeg 로 풀기 → 48 kHz 2ch float */
function decode(file: string): FBuf {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'f32le', '-ar', '48000', '-ac', '2', 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg 풀기 실패 ${file}: ${r.stderr}`);
  const raw = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
  const n = raw.length / 2;
  const b = new FBuf(2, n, 48000);
  for (let i = 0; i < n; i++) {
    b.data[0][i] = raw[2 * i];
    b.data[1][i] = raw[2 * i + 1];
  }
  return b;
}

/** 압축 모드 소스: 조각 파일(.ogg | .m4a)을 풀어 쓴다 */
function distSource(rel: string, plan: BgmPlan, ext: '.ogg' | '.m4a'): BgmSource & { lens: number[] } {
  const cache = new Map<number, FBuf>();
  const lens: number[] = [];
  return {
    lens,
    open: () => Promise.resolve(plan),
    load: (i) => {
      let b = cache.get(i);
      if (!b) {
        b = decode(path.join(DIST, bgmChunkKey(rel, i).replace(/\.wav$/, ext)));
        cache.set(i, b);
        lens[i] = b.length;
      }
      return Promise.resolve({ buffer: b, offset: plan.chunks[i].pre / plan.rate });
    },
  };
}

/** 늦게 끝나는 소스(조각마다 pumps 번 펌프 뒤 완료) */
function slow(s: BgmSource, pumps: number): BgmSource & { tick(): void } {
  const waiting: { left: number; go(): void }[] = [];
  return {
    open: () => s.open(),
    load: (i) =>
      new Promise<BgmLoaded>((res, rej) => {
        waiting.push({ left: pumps, go: () => void s.load(i).then(res, rej) });
      }),
    tick() {
      for (const w of [...waiting]) if (--w.left <= 0) {
        waiting.splice(waiting.indexOf(w), 1);
        w.go();
      }
    },
  };
}

const flush = async (): Promise<void> => {
  for (let k = 0; k < 4; k++) await new Promise((r) => setImmediate(r));
};

async function run(ctx: FCtx, source: BgmSource & { tick?(): void }, untilSec: number, o: { at?: number; step?: number; onStep?(s: BgmStream): void } = {}): Promise<BgmStream> {
  const s = new BgmStream(asCtx(ctx), source, { dest: DEST, at: o.at, timer: null, record: true });
  const step = o.step ?? 0.05;
  await flush();
  while (ctx.currentTime < untilSec) {
    source.tick?.();
    await flush();
    s.pump();
    o.onStep?.(s);
    ctx.currentTime += step;
  }
  return s;
}

/** 예약 기록이 이어지는지: 다음 시작 = 앞 교차 시작(같은 double), 앞 멈춤 = 교차 끝 */
function contiguous(log: BgmScheduled[]): { ok: boolean; why: string } {
  for (let k = 0; k + 1 < log.length; k++) {
    const a = log[k];
    const b = log[k + 1];
    if (b.item !== a.item + 1) return { ok: false, why: `항목 ${a.item}→${b.item}` };
    if (b.when !== a.fadeOutAt) return { ok: false, why: `항목 ${b.item} 시작 ${b.when} ≠ 앞 끝 ${a.fadeOutAt}` };
    if (a.stopAt !== a.fadeOutAt + a.fadeOut) return { ok: false, why: `항목 ${a.item} 멈춤 ${a.stopAt}` };
    if (b.fadeIn !== a.fadeOut) return { ok: false, why: `항목 ${b.item} 교차 ${b.fadeIn}/${a.fadeOut}` };
  }
  return { ok: true, why: '' };
}

function maxErr(a: Float32Array[], b: Float32Array[], from = 0, to = a[0].length): number {
  let m = 0;
  for (let c = 0; c < a.length; c++) for (let i = Math.max(0, from); i < Math.min(to, a[c].length); i++) m = Math.max(m, Math.abs(a[c][i] - b[c][i]));
  return m;
}
function errPow(a: Float32Array[], b: Float32Array[], from: number, to: number): { e: number; s: number } {
  let e = 0;
  let s = 0;
  for (let c = 0; c < a.length; c++)
    for (let i = Math.max(0, from); i < Math.min(to, a[c].length); i++) {
      const d = a[c][i] - b[c][i];
      e += d * d;
      s += b[c][i] * b[c][i];
    }
  return { e, s };
}
/** 최대 2차 차분(클릭 지표) */
function maxD2(a: Float32Array[], from: number, to: number): number {
  let m = 0;
  for (const x of a) for (let i = Math.max(2, from); i < Math.min(to, x.length); i++) m = Math.max(m, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]));
  return m;
}
/** 타임라인의 이음매 프레임(조각 경계 = 반복 이음매 포함) */
function seams(plan: BgmPlan, frames: number): { f: number; loop: boolean }[] {
  const out: { f: number; loop: boolean }[] = [];
  for (let n = 1; ; n++) {
    const it = planItem(plan, n);
    if (!it || it.s >= frames) break;
    out.push({ f: it.s, loop: !!plan.loop && plan.intro < n && it.chunk === plan.intro });
  }
  return out;
}

interface DistIndex {
  lossy: string[];
  names: Record<string, string>;
  streams: Record<string, BgmPlan>;
}
const index = JSON.parse(fs.readFileSync(path.join(DIST, 'index.json'), 'utf8')) as DistIndex;

// ================================================================ 1. 배치
console.log('\n# 1. 조각 배치 (빌드 index ↔ planBgm, 반복 경계)');
{
  const streams = Object.entries(index.streams ?? {});
  ok(streams.length >= 2 && !!index.streams['common/sound/SM_BGM_MENU_MAP.wav'], `index.json streams ${streams.length}곡(캐릭터 선택 BGM 포함)`);
  let bad = '';
  for (const [rel, p] of streams) {
    const { w } = readWav(rel);
    const again = planBgm(w.frames, w.rate, w.ch, p.loop);
    if (JSON.stringify(again) !== JSON.stringify(p)) bad += ` ${rel}(재계산 다름)`;
    const intro = p.chunks.slice(0, p.intro);
    const body = p.chunks.slice(p.intro);
    const cover = (cs: typeof p.chunks, a: number, b: number): boolean => cs.length === 0 ? a === b : cs[0].start === a && cs[cs.length - 1].end === b && cs.every((c, k) => k === 0 || c.start === cs[k - 1].end);
    if (!cover(intro, 0, p.loop ? p.loop[0] : p.frames) || !cover(body, p.loop ? p.loop[0] : 0, p.loop ? p.loop[1] : 0)) bad += ` ${rel}(구간)`;
    for (let i = 0; i < p.chunks.length; i++) {
      const c = p.chunks[i];
      const n = chunkSpans(p, i).reduce((s, x) => s + x[1], 0);
      if (n !== c.pre + c.end - c.start + c.post) bad += ` ${rel}#${i}(길이)`;
      const k = bgmChunkKey(rel, i);
      if (!index.lossy.includes(k) || !index.names[k.replace(/\.wav$/, '.ogg')] || !index.names[k.replace(/\.wav$/, '.m4a')]) bad += ` ${rel}#${i}(색인)`;
    }
  }
  ok(!bad, '모든 곡: 빌드 배치 = 런타임 planBgm, 인트로 [0,Ls)·본체 [Ls,Le) 빈틈 없이, 파일 길이 = 패드+본문+패드, 조각이 lossy·해시 표에 있음', bad);
  const m = index.streams['common/sound/SM_BGM_MENU_MAP.wav'];
  ok(!!m && m.loop?.[0] === 114688 && m.loop?.[1] === 2561415 && m.chunks[m.intro].start === 114688, 'SM_BGM_MENU_MAP 반복 [114688, 2561415) = 명세 loopStart 2.389333 s·loopEnd 53.3628125 s × 48000, 본체 첫 조각이 Ls 에서 시작', JSON.stringify(m?.loop));
  const g = index.streams['mg1801/sound/bgm/SQ_BGM_RC_GENERIC_120.wav'];
  ok(!!g && g.loop?.[0] === 480000 && g.loop?.[1] === 864000, 'SQ_BGM_RC_GENERIC_120 반복 [10 s, 18 s) = [480000, 864000)', JSON.stringify(g?.loop));
  ok(!index.streams['mg1801/sound/stream/SM_JIN_RC01_MG_SUCCESS.wav'] && !Object.keys(index.streams).some((k) => k.includes('/wave/')), '징글·시퀀서 파형은 조각 없음(통파일 그대로)');
}

// ================================================================ 2. 원본 모드(무손실) 일정·이음매
console.log('\n# 2. 원본 모드(PCM 자르기) — 가짜 AudioContext 예약·표본 렌더 = 원본 타임라인');
const memRows: string[] = [];
async function lossless(rel: string, loop: [number, number] | null, sec: number, label: string): Promise<void> {
  const { w } = readWav(rel);
  const ctx = new FCtx(48000);
  const source = srcSource(w, loop);
  const s = await run(ctx, source, sec);
  const plan = source.plan;
  const anchorF = Math.round(s.anchor! * 48000);
  const c = contiguous(s.log);
  const intWhen = s.log.every((r) => Math.abs(r.when * 48000 - Math.round(r.when * 48000)) < 1e-6 && Math.abs(r.stopAt * 48000 - Math.round(r.stopAt * 48000)) < 1e-6);
  ok(c.ok && intWhen && s.stats.late === 0 && s.stats.skipped === 0, `${label}: 예약 ${s.log.length}개 틈·겹침 없음(다음 시작 = 앞 교차 시작, 같은 double), 모든 시각이 정수 프레임, 늦음·건너뜀 0`, c.why);
  const frames = Math.round(sec * 48000);
  const out = render(ctx, frames);
  const exp = expected(w, plan, frames - anchorF);
  const expAbs = exp.map((x) => {
    const y = new Float32Array(frames);
    y.set(x.subarray(0, frames - anchorF), anchorF);
    return y;
  });
  const e = maxErr(out, expAbs);
  const sm = seams(plan, frames - anchorF);
  let seamErr = 0;
  for (const x of sm) seamErr = Math.max(seamErr, maxErr(out, expAbs, anchorF + x.f - 1024, anchorF + x.f + 1024));
  const loops = sm.filter((x) => x.loop).length;
  ok(e < 1e-6, `${label}: 렌더 = 원본 타임라인(${sec} s, 이음매 ${sm.length}곳·반복 이음매 ${loops}곳) 최대 오차 ${e.toExponential(1)}(이음매 ±1024 표본 ${seamErr.toExponential(1)})`);
  const whole = plan.frames * 2 * 4;
  const maxCore = Math.max(...plan.chunks.map((c) => c.end - c.start)) / 48000;
  const bound = ((6 + 2 * maxCore + 0.25) * 48000 + 4 * 2 * 3840) * 2 * 4;
  memRows.push(`${label}: 풀린 PCM 최대 ${(s.stats.maxDecodedBytes / 1e6).toFixed(2)} MB (통파일 ${(whole / 1e6).toFixed(2)} MB, 상한 ${(bound / 1e6).toFixed(2)} MB)`);
  ok(s.stats.maxDecodedBytes <= bound, `${label}: 메모리 상한 — 풀린 PCM 최대 ${(s.stats.maxDecodedBytes / 1e6).toFixed(2)} MB ≤ (창 6 s + 조각 최대 ${maxCore.toFixed(2)} s × 2 + 펌프 0.25 s + 패드) ${(bound / 1e6).toFixed(2)} MB — 곡 길이와 무관(통파일 ${(whole / 1e6).toFixed(2)} MB)`);
  if (!loop) ok(s.finished && maxErr(out, expAbs.map((x) => x.map(() => 0)), anchorF + plan.frames, frames) === 0, `${label}: 반복 없는 곡은 끝에서 끝남(뒤 무음)`);
}
await lossless('common/sound/SM_BGM_MENU_MAP.wav', [114688, 2561415], 112, 'SM_BGM_MENU_MAP(인트로 + 2바퀴)');
await lossless('mg1801/sound/bgm/SQ_BGM_RC_GENERIC_120.wav', [480000, 864000], 40, 'SQ_BGM_RC_GENERIC_120(반복 8 s, 3바퀴)');
await lossless('mg1801/sound/bgm/SQ_BGM_RC_CALIBRATION_120.wav', [192000, 288000], 14, 'SQ_BGM_RC_CALIBRATION_120(본체 조각 1개 되풀이)');
await lossless('mg1801/sound/bgm/SQ_BGM_MG1801_A_120.wav', null, 44, 'SQ_BGM_MG1801_A_120(반복 없음)');
for (const r of memRows) info(r);

// ================================================================ 3. 늦은 노드·늦은 조각
console.log('\n# 3. 늦은 시작 노드·늦게 풀린 조각');
{
  const rel = 'common/sound/SM_BGM_MENU_MAP.wav';
  const { w } = readWav(rel);
  const ctx = new FCtx(48000);
  const source = srcSource(w, [114688, 2561415]);
  const s = await run(ctx, source, 12);
  const anchorF = Math.round(s.anchor! * 48000);
  const frames = 12 * 48000;
  const exp = expected(w, source.plan, frames - anchorF);
  const expAbs = exp.map((x) => {
    const y = new Float32Array(frames);
    y.set(x.subarray(0, frames - anchorF), anchorF);
    return y;
  });
  const late = 96;
  const out = render(ctx, frames, 2, late);
  const seam = anchorF + source.plan.chunks[1].start;
  const xf = Math.round(0.01 * 48000);
  const after = maxErr(out, expAbs, seam + xf, seam + 48000);
  const d2o = maxD2(out, seam - 256, seam + xf + 256);
  const d2e = maxD2(expAbs, seam - 256 - late, seam + xf + 256);
  ok(after < 1e-6 && d2o <= d2e * 1.5, `첫 노드가 ${late} 표본(2 ms) 늦게 시작해도: 첫 이음매 교차(10 ms) 뒤 원본과 같음(오차 ${after.toExponential(1)}), 이음매 2차 차분 ${d2o.toFixed(4)} ≤ 원본 근처 ${d2e.toFixed(4)} × 1.5(클릭 없음)`);
  const ctx2 = new FCtx(48000);
  const src2 = slow(srcSource(w, [114688, 2561415]), 1);
  const s2 = await run(ctx2, src2, 30);
  ok(s2.stats.late === 0 && contiguous(s2.log).ok, `풀기가 펌프 한 번(50 ms) 늦어도 창(6 s) 안에서 미리 풀려 늦음 0·이음매 그대로`, `late ${s2.stats.late}`);
  const ctx3 = new FCtx(48000);
  const src3 = slow(srcSource(w, [114688, 2561415]), 100);
  const s3 = await run(ctx3, src3, 40);
  const lateRec = s3.log.find((r) => r.late);
  const kept = s3.log.every((r) => (r.late ? Math.abs(r.offset - (r.when - (s3.anchor! + r.s / 48000)) - 3840 / 48000) < 1e-9 : r.when === s3.anchor! + r.s / 48000));
  ok(!!lateRec && kept, `조각마다 5 s 늦게 풀리면 타임라인을 고정한 채 늦은 만큼 건너뜀(offset = 패드 + 늦은 시간), 박자·반복 위치 그대로`, `late ${s3.stats.late} skipped ${s3.stats.skipped}`);
}

// ================================================================ 4. 리듬 BGM 시작 표본
console.log('\n# 4. 리듬 BGM(mg1801) — 시작 시각(anchor) 고정, 통파일 start(at, 0) 과 표본 시각 일치');
{
  const rel = 'mg1801/sound/bgm/SQ_BGM_MG1801_A_120.wav';
  const { w } = readWav(rel);
  const at = 3.123456789;
  const ctx = new FCtx(48000);
  ctx.currentTime = 3.1;
  const source = srcSource(w, null);
  const s = await run(ctx, source, 46, { at });
  let dev = 0;
  for (const r of s.log) dev = Math.max(dev, Math.abs(r.when - (at + r.s / 48000)));
  const phase = (t: number): number => t * 48000 - Math.floor(t * 48000);
  let ph = 0;
  for (const r of s.log) ph = Math.max(ph, Math.abs(phase(r.when) - phase(at)));
  ok(s.log[0].when === at && s.log[0].offset === 3840 / 48000 && dev === 0 && ph < 1e-6 && s.stats.late === 0, `분수 시각 at = ${at}: 첫 조각 start(at, 패드) — 조각 k 시작 = at + s_k/48000 그대로(편차 ${dev}), 표본 사이 위상 ${ph.toExponential(1)}(통파일과 같은 보간 위상), 늦음 0`);
  const atF = 3 * 48000 + 12345;
  const at2 = atF / 48000;
  const ctxA = new FCtx(48000);
  ctxA.currentTime = 3.1;
  const sA = await run(ctxA, srcSource(w, null), 46, { at: at2 });
  const frames = 46 * 48000;
  const outA = render(ctxA, frames);
  const ctxB = new FCtx(48000);
  const whole = new FBuf(2, w.frames, 48000);
  fillPcm(w, [[0, w.frames]], whole.data);
  const node = ctxB.createBufferSource();
  node.buffer = whole;
  node.connect(DEST);
  node.start(at2, 0);
  const outB = render(ctxB, frames);
  const e = maxErr(outA, outB);
  ok(e < 1e-6 && sA.finished, `프레임 시각 at: 스트림 렌더 = 지금 방식(통파일 start(at, 0)) 렌더, 46 s 전 구간 최대 오차 ${e.toExponential(1)}`);
  const ctx44 = new FCtx(44100);
  ctx44.currentTime = 3.1;
  const s44 = await run(ctx44, srcSource(w, null), 46, { at });
  ok(contiguous(s44.log).ok && s44.log.every((r) => r.when === at + r.s / 48000), `AudioContext 44.1 kHz: 시작 시각 식은 같고(at + s/48000) 경계는 상보(보간은 브라우저 — §12.11)`);
}

// ================================================================ 5. 압축 모드(코덱) 이음매
console.log('\n# 5. 압축 모드 — 조각 .ogg/.m4a 를 ffmpeg 로 풀어(브라우저 디코더 대리) 렌더, 이음매 오차 vs 통파일 같은 자리');
async function codec(rel: string, sec: number, label: string): Promise<void> {
  const plan = index.streams[rel];
  const { w } = readWav(rel);
  for (const ext of ['.ogg', '.m4a'] as const) {
    const ds = distSource(rel, plan, ext);
    const ctx = new FCtx(48000);
    const s = await run(ctx, ds, sec);
    const tail: number[] = [];
    const lenBad = plan.chunks
      .map((c, i) => {
        const d = ds.lens[i] === undefined ? 0 : ds.lens[i] - (c.pre + c.end - c.start + c.post);
        if (d > 0) tail.push(d);
        return d >= 0 && d <= 1024 ? null : `${i}:${d}`;
      })
      .filter(Boolean);
    const anchorF = Math.round(s.anchor! * 48000);
    const frames = Math.round(sec * 48000);
    const out = render(ctx, frames);
    const exp = expected(w, plan, frames - anchorF);
    const expAbs = exp.map((x) => {
      const y = new Float32Array(frames);
      y.set(x.subarray(0, frames - anchorF), anchorF);
      return y;
    });
    const wholeBuf = decode(path.join(DIST, rel.replace(/\.wav$/, ext)));
    const wholeT = expected({ ...w, float: true, bits: 32, data: f32View(wholeBuf) }, plan, frames - anchorF).map((x) => {
      const y = new Float32Array(frames);
      y.set(x.subarray(0, frames - anchorF), anchorF);
      return y;
    });
    let lagBad = 0;
    for (let i = 0; i < plan.chunks.length; i++) {
      const it = s.log.find((r) => r.chunk === i);
      if (!it) continue;
      const f0 = anchorF + it.s + 4800;
      const lag = bestLag(out, expAbs, f0, f0 + 9600, 32);
      if (lag !== 0) lagBad++;
    }
    const sm = seams(plan, frames - anchorF);
    const seamS = { e: 0, s: 0 };
    const seamW = { e: 0, s: 0 };
    const ctlS = { e: 0, s: 0 };
    const ctlW = { e: 0, s: 0 };
    let d2Ratio = 0;
    let d2Ctl = 0;
    const add = (acc: { e: number; s: number }, x: { e: number; s: number }): void => {
      acc.e += x.e;
      acc.s += x.s;
    };
    for (const x of sm) {
      const a = anchorF + x.f - 256;
      const b = anchorF + x.f + 480 + 256;
      add(seamS, errPow(out, expAbs, a, b));
      add(seamW, errPow(wholeT, expAbs, a, b));
      add(ctlS, errPow(out, expAbs, a + 48000, b + 48000));
      add(ctlW, errPow(wholeT, expAbs, a + 48000, b + 48000));
      d2Ratio = Math.max(d2Ratio, maxD2(out, a, b) / Math.max(1e-9, maxD2(wholeT, a, b)));
      d2Ctl = Math.max(d2Ctl, maxD2(out, a + 48000, b + 48000) / Math.max(1e-9, maxD2(wholeT, a + 48000, b + 48000)));
    }
    const exSeam = 10 * Math.log10(seamS.e / seamW.e);
    const exCtl = 10 * Math.log10(ctlS.e / ctlW.e);
    const core = errPow(out, expAbs, anchorF, frames);
    const wcore = errPow(wholeT, expAbs, anchorF, frames);
    ok(lenBad.length === 0, `${label}${ext}: 조각 디코드 길이 = 패드+본문+패드${tail.length ? ` (+ 끝 덧붙임 ${Math.min(...tail)}~${Math.max(...tail)} 표본 ${tail.length}개 — AAC 마지막 프레임, 재생 안 하는 뒤쪽)` : ''}`, lenBad.join(','));
    ok(lagBad === 0, `${label}${ext}: 조각 본문 정렬(교차 상관 ±32 표본) 어긋남 0`, `${lagBad}개`);
    ok(exSeam <= exCtl + 2 && d2Ratio <= 1.5, `${label}${ext}: 이음매 ${sm.length}곳(±256 표본 + 교차 10 ms) 오차 합이 통파일 같은 자리 대비 ${exSeam >= 0 ? '+' : ''}${exSeam.toFixed(2)} dB ≤ 이음매 아닌 대조 자리(+1 s) ${exCtl >= 0 ? '+' : ''}${exCtl.toFixed(2)} dB + 2 dB(손실 허용치: 조각 시작 인코더 워밍업), 2차 차분(클릭) 통파일 대비 최대 ${d2Ratio.toFixed(2)}배(대조 ${d2Ctl.toFixed(2)}배, ≤ 1.5)`, `이음매 SNR ${db(seamS.s / seamS.e)} / 통파일 ${db(seamW.s / seamW.e)} dB`);
    info(`${label}${ext}: 이음매 SNR ${db(seamS.s / seamS.e)} dB(통파일 같은 자리 ${db(seamW.s / seamW.e)}), 전체 SNR 스트림 ${db(core.s / core.e)} dB / 통파일 ${db(wcore.s / wcore.e)} dB (지각 코덱 위상 변화로 낮게 나오는 지표 — assets_pipeline.md §9.4)`);
  }
}
function f32View(b: FBuf): DataView {
  const inter = new Float32Array(b.length * 2);
  for (let i = 0; i < b.length; i++) {
    inter[2 * i] = b.data[0][i];
    inter[2 * i + 1] = b.data[1][i];
  }
  return new DataView(inter.buffer);
}
function bestLag(a: Float32Array[], b: Float32Array[], from: number, to: number, r: number): number {
  let best = 0;
  let bv = -Infinity;
  for (let lag = -r; lag <= r; lag++) {
    let s = 0;
    for (let c = 0; c < 2; c++) for (let i = from; i < to; i++) s += a[c][i] * (b[c][i + lag] ?? 0);
    if (s > bv) {
      bv = s;
      best = lag;
    }
  }
  return best;
}
await codec('common/sound/SM_BGM_MENU_MAP.wav', 60, 'SM_BGM_MENU_MAP');
await codec('mg1801/sound/bgm/SQ_BGM_RC_GENERIC_120.wav', 30, 'SQ_BGM_RC_GENERIC_120');
await codec('mg1801/sound/bgm/SQ_BGM_MG1801_A_120.wav', 42, 'SQ_BGM_MG1801_A_120');

// ================================================================ 6. 시작까지 받는 양
console.log('\n# 6. 시작까지 받는 양(첫 조각) vs 통파일');
{
  const size = (rel: string): number => {
    const h = index.names[rel];
    return fs.statSync(path.join(DIST, h ?? rel)).size;
  };
  let worst = 0;
  for (const [rel, p] of Object.entries(index.streams)) {
    const first = { ogg: size(bgmChunkKey(rel, 0).replace(/\.wav$/, '.ogg')), m4a: size(bgmChunkKey(rel, 0).replace(/\.wav$/, '.m4a')) };
    const whole = { ogg: size(rel.replace(/\.wav$/, '.ogg')), m4a: size(rel.replace(/\.wav$/, '.m4a')) };
    const sec = (p.chunks[0].end - p.chunks[0].start) / p.rate;
    worst = Math.max(worst, first.ogg, first.m4a);
    if (/MENU_MAP|MG1801_A_120|REMIX_120|GENERIC_120/.test(rel)) info(`${rel.split('/').pop()}: 첫 조각 ${sec.toFixed(2)} s — ogg ${(first.ogg / 1024).toFixed(0)} KB(통파일 ${(whole.ogg / 1024).toFixed(0)} KB), m4a ${(first.m4a / 1024).toFixed(0)} KB(통파일 ${(whole.m4a / 1024).toFixed(0)} KB)`);
  }
  ok(worst < 160 * 1024, `모든 BGM 첫 조각 ≤ 160 KB(가장 큰 것 ${(worst / 1024).toFixed(0)} KB)`);
}

console.log(`\n${count - fails}/${count} 통과${fails ? ` — 실패 ${fails}` : ''}`);
process.exit(fails ? 1 : 0);
