/**
 * BGM 스트리밍 재생기 — import 0(외부 라이브러리·three·프로젝트 파일·DOM 타입 없음). 설계: docs/engine/04_sound.md §12.
 *
 * - planBgm: 곡(표본 수·rate·반복 [Ls, Le))을 인트로·반복 본체 구간마다 약 4 s 조각으로 나눈다. 조각 파일 = 앞 패드 + 본문 + 뒤 패드,
 *   패드 내용은 타임라인 이웃(인트로 앞 무음, 반복 본체는 원형). 빌드(tools/assets_audio.ts)와 런타임(원본 모드 PCM 자르기)이 같은 함수를 쓴다.
 * - chunkSpans: 조각 파일 표본 → 소스 표본 범위 목록(−1 = 무음). parseWav·fillPcm: 원본 모드에서 wav PCM 을 조각 AudioBuffer 로.
 * - BgmStream: 오디오 시계로 조각을 표본 시각에 예약해 잇는다. 항목 k 시작 시각 = anchor + s_k / rate(앞 항목 끝과 같은 식·같은 값),
 *   경계에서 뒤 패드(= 다음 본문과 같은 소리)로 짧게 선형 교차(합 = 1) — 시작이 늦은 노드가 있어도 이음매가 튀지 않는다.
 *   앞당김 창(기본 6 s) 안의 항목만 받고·풀고·예약하고, 예약이 끝난 조각 버퍼는 놓는다(메모리 상한 = 창 + 조각 하나).
 *   늦은 조각은 타임라인을 고정한 채 늦은 만큼 건너뛴다. anchor 를 주면(리듬 BGM) 그 시각이 표본 0 이다.
 * - 오디오 객체는 아래 최소 구조 타입으로만 다룬다(실제 AudioContext 는 부르는 쪽이 캐스팅, 시험은 가짜 문맥).
 */

export const BGM_PLAN_V = 1;
/** 조각 본문 길이(초) */
export const BGM_CHUNK_SEC = 4;
/** 조각 앞·뒤 패드(표본) — 80 ms @48 kHz */
export const BGM_PAD = 3840;
/** 경계 교차 길이(초) */
export const BGM_XFADE_SEC = 0.01;
/** 앞당김 창(초): 시작 시각이 지금 + 이 값 안인 항목만 받고 푼다 */
export const BGM_AHEAD_SEC = 6;
/** 바로 시작·늦은 조각의 시작 여유(초) */
export const BGM_LEAD_SEC = 0.06;
export const BGM_PUMP_MS = 250;

export interface BgmChunk {
  /** 본문 [start, end) — 소스 표본 */
  start: number;
  end: number;
  /** 파일 안 본문 앞·뒤 패드 표본 수 */
  pre: number;
  post: number;
}

export interface BgmPlan {
  v: number;
  rate: number;
  ch: number;
  frames: number;
  /** 반복 [Ls, Le) 표본, 없으면 null */
  loop: [number, number] | null;
  /** 인트로 조각 수(반복 없으면 전부) — 그 뒤가 반복 본체 */
  intro: number;
  chunks: BgmChunk[];
}

function split(a: number, b: number, size: number): [number, number][] {
  const n = b - a;
  if (n <= 0) return [];
  const count = Number.isFinite(size) && size > 0 ? Math.max(1, Math.round(n / size)) : 1;
  const out: [number, number][] = [];
  for (let k = 0; k < count - 1; k++) out.push([a + k * size, a + (k + 1) * size]);
  out.push([a + (count - 1) * size, b]);
  return out;
}

export function validLoop(loop: readonly [number, number] | null | undefined, frames: number): [number, number] | null {
  if (!loop) return null;
  const s = Math.max(0, Math.round(loop[0]));
  const e = Math.min(frames, Math.round(loop[1]));
  return e > s ? [s, e] : null;
}

export function sameLoop(a: readonly [number, number] | null, b: readonly [number, number] | null): boolean {
  return a === null || b === null ? a === b : a[0] === b[0] && a[1] === b[1];
}

export function planBgm(frames: number, rate: number, ch: number, loop: readonly [number, number] | null, o: { chunk?: number; pad?: number } = {}): BgmPlan {
  const size = o.chunk ?? Math.round(BGM_CHUNK_SEC * rate);
  const pad = o.pad ?? BGM_PAD;
  const lp = validLoop(loop, frames);
  const intro = lp ? split(0, lp[0], size) : split(0, frames, size);
  const body = lp ? split(lp[0], lp[1], size) : [];
  const chunks = [...intro, ...body].map(([start, end]) => ({ start, end, pre: pad, post: pad }));
  return { v: BGM_PLAN_V, rate, ch, frames, loop: lp, intro: intro.length, chunks };
}

/** 조각 i 의 가상 소스 키: '<원본에서 .wav 뺀 것>.bgm/NNN.wav' */
export function bgmChunkKey(key: string, i: number): string {
  return `${key.replace(/\.wav$/i, '')}.bgm/${String(i).padStart(3, '0')}.wav`;
}

/** 조각 i 파일의 표본들 → [소스 시작 표본(−1 = 무음), 길이] 목록 */
export function chunkSpans(plan: BgmPlan, i: number): [number, number][] {
  const c = plan.chunks[i];
  const lp = plan.loop;
  const body = !!lp && i >= plan.intro;
  const introEnd = lp ? lp[0] : plan.frames;
  const out: [number, number][] = [];
  const push = (src: number, n: number): void => {
    if (n <= 0) return;
    const last = out[out.length - 1];
    if (last && ((src < 0 && last[0] < 0) || (src >= 0 && last[0] >= 0 && last[0] + last[1] === src))) last[1] += n;
    else out.push([src, n]);
  };
  let t = c.start - c.pre;
  const t1 = c.end + c.post;
  while (t < t1) {
    if (!body && t < 0) {
      const n = Math.min(t1, 0) - t;
      push(-1, n);
      t += n;
    } else if (!body && t < introEnd) {
      const n = Math.min(t1, introEnd) - t;
      push(t, n);
      t += n;
    } else if (lp) {
      const len = lp[1] - lp[0];
      const q = lp[0] + ((((t - lp[0]) % len) + len) % len);
      const n = Math.min(t1 - t, lp[1] - q);
      push(q, n);
      t += n;
    } else {
      push(-1, t1 - t);
      t = t1;
    }
  }
  return out;
}

/** 타임라인 항목 n → 조각 번호와 타임라인 시작 표본(끝이면 null) */
export function planItem(plan: BgmPlan, n: number): { chunk: number; s: number } | null {
  if (n < plan.intro) return { chunk: n, s: plan.chunks[n].start };
  const b = plan.chunks.length - plan.intro;
  if (!plan.loop || b <= 0) return null;
  const m = Math.floor((n - plan.intro) / b);
  const j = plan.intro + ((n - plan.intro) % b);
  return { chunk: j, s: plan.chunks[j].start + m * (plan.loop[1] - plan.loop[0]) };
}

// ---------------------------------------------------------------- wav (원본 모드)

export interface WavPcm {
  rate: number;
  ch: number;
  bits: number;
  float: boolean;
  frames: number;
  /** data 덩어리 */
  data: DataView;
}

export function parseWav(buf: ArrayBuffer): WavPcm | null {
  if (buf.byteLength < 12) return null;
  const v = new DataView(buf);
  const tag = (o: number): string => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let off = 12;
  let fmt: { format: number; ch: number; rate: number; bits: number } | null = null;
  let data: DataView | null = null;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    const len = v.getUint32(off + 4, true);
    if (id === 'fmt ') {
      let format = v.getUint16(off + 8, true);
      if (format === 0xfffe && len >= 26) format = v.getUint16(off + 8 + 24, true);
      fmt = { format, ch: v.getUint16(off + 10, true), rate: v.getUint32(off + 12, true), bits: v.getUint16(off + 22, true) };
    } else if (id === 'data') data = new DataView(buf, off + 8, Math.min(len, buf.byteLength - off - 8));
    off += 8 + len + (len & 1);
  }
  if (!fmt || !data || (fmt.format !== 1 && fmt.format !== 3)) return null;
  const float = fmt.format === 3;
  if (float ? fmt.bits !== 32 : ![8, 16, 24, 32].includes(fmt.bits)) return null;
  const frames = Math.floor(data.byteLength / (fmt.ch * (fmt.bits / 8)));
  return { rate: fmt.rate, ch: fmt.ch, bits: fmt.bits, float, frames, data };
}

/** spans 의 소스 표본을 채널별 float 배열(길이 = spans 합)에 채운다 */
export function fillPcm(w: WavPcm, spans: readonly [number, number][], out: Float32Array[]): void {
  const bps = w.bits / 8;
  const stride = w.ch * bps;
  const d = w.data;
  let p = 0;
  for (const [src, n] of spans) {
    if (src < 0) {
      for (const o of out) o.fill(0, p, p + n);
      p += n;
      continue;
    }
    for (let c = 0; c < out.length; c++) {
      const o = out[c];
      const cc = Math.min(c, w.ch - 1);
      let at = src * stride + cc * bps;
      for (let k = 0; k < n; k++, at += stride) {
        let x: number;
        if (w.float) x = d.getFloat32(at, true);
        else if (w.bits === 16) x = d.getInt16(at, true) / 32768;
        else if (w.bits === 24) x = ((d.getUint8(at) | (d.getUint8(at + 1) << 8) | (d.getInt8(at + 2) << 16)) as number) / 8388608;
        else if (w.bits === 32) x = d.getInt32(at, true) / 2147483648;
        else x = (d.getUint8(at) - 128) / 128;
        o[p + k] = x;
      }
    }
    p += n;
  }
}

// ---------------------------------------------------------------- 재생

export interface BgmAudioBuffer {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
}
export interface BgmParam {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  cancelScheduledValues(t: number): unknown;
}
export interface BgmNode {
  connect(dest: unknown): unknown;
  disconnect(): void;
}
export interface BgmGainNode extends BgmNode {
  readonly gain: BgmParam;
}
export interface BgmSourceNode extends BgmNode {
  buffer: BgmAudioBuffer | null;
  onended: (() => void) | null;
  start(when: number, offset: number): void;
  stop(when: number): void;
}
export interface BgmContext {
  readonly currentTime: number;
  /** 'closed' 면 스트림을 끝낸다 */
  readonly state?: string;
  readonly sampleRate: number;
  createBufferSource(): BgmSourceNode;
  createGain(): BgmGainNode;
}

/** 조각 하나: buffer 안 offset(초)에서 본문이 시작한다 */
export interface BgmLoaded {
  buffer: BgmAudioBuffer;
  offset: number;
}

export interface BgmSource {
  open(): Promise<BgmPlan>;
  load(i: number): Promise<BgmLoaded>;
  /** 곧 쓸 조각 바이트를 미리 받는다(선택) */
  prefetch?(i: number): void;
}

export interface BgmTimer {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

export interface BgmStreamOptions {
  dest: unknown;
  gain?: number;
  /** 표본 0 의 오디오 시각(리듬 BGM). 없으면 첫 조각이 풀린 때 지금 + lead 를 프레임에 올림 */
  at?: number;
  ahead?: number;
  lead?: number;
  xfade?: number;
  onEnded?(): void;
  /** 펌프 타이머(기본 setTimeout). null = 부르는 쪽이 pump()(시험) */
  timer?: BgmTimer | null;
  /** 예약 기록을 남긴다(시험) */
  record?: boolean;
}

/** 예약 하나(시험·디버그) */
export interface BgmScheduled {
  item: number;
  chunk: number;
  s: number;
  when: number;
  offset: number;
  stopAt: number;
  /** 들어올 때 교차 [t0, t0 + fadeIn) */
  fadeIn: number;
  /** 나갈 때 교차 시작 시각(없으면 Infinity) */
  fadeOutAt: number;
  fadeOut: number;
  late: boolean;
  buffer: BgmAudioBuffer;
}

interface Live {
  item: number;
  chunk: number;
  node: BgmSourceNode;
  gain: BgmGainNode | null;
  stopAt: number;
  rec: BgmScheduled;
}

interface Slot {
  p: Promise<BgmLoaded>;
  v: BgmLoaded | null;
  failed: boolean;
}

const defaultTimer: BgmTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

const bufBytes = (b: BgmAudioBuffer): number => b.length * b.numberOfChannels * 4;

export class BgmStream {
  plan: BgmPlan | null = null;
  anchor: number | null;
  /** 끝남(곡 끝·정지·실패) */
  finished = false;
  readonly out: BgmGainNode;
  readonly stats = { scheduled: 0, skipped: 0, late: 0, decodedBytes: 0, maxDecodedBytes: 0 };
  readonly log: BgmScheduled[] = [];
  private next = 0;
  private readonly live: Live[] = [];
  private readonly slots = new Map<number, Slot>();
  private stopTime = Infinity;
  private timerId: unknown = null;
  private readonly timer: BgmTimer | null;
  private readonly ahead: number;
  private readonly lead: number;
  private readonly xfade: number;

  constructor(
    private readonly ctx: BgmContext,
    private readonly source: BgmSource,
    private readonly o: BgmStreamOptions,
  ) {
    this.anchor = o.at ?? null;
    this.ahead = o.ahead ?? BGM_AHEAD_SEC;
    this.lead = o.lead ?? BGM_LEAD_SEC;
    this.xfade = o.xfade ?? BGM_XFADE_SEC;
    this.timer = o.timer === undefined ? defaultTimer : o.timer;
    this.out = ctx.createGain();
    this.out.gain.value = o.gain ?? 1;
    this.out.connect(o.dest);
    source.open().then(
      (plan) => {
        if (this.finished) return;
        this.plan = plan;
        this.pump();
      },
      (e: unknown) => this.fail(e),
    );
  }

  alive(): boolean {
    return !this.finished;
  }

  /** 타임라인 표본 s 의 오디오 시각 */
  time(s: number): number {
    return (this.anchor ?? 0) + s / this.plan!.rate;
  }

  /** fade 초 동안 줄이며 멈춘다(0 = 바로) */
  stop(fade = 0): void {
    if (this.finished) return;
    const now = this.ctx.currentTime;
    if (fade > 0) {
      const g = this.out.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + fade);
      this.stopAt(now + fade);
      return;
    }
    this.stopAt(now);
    this.finish();
  }

  /** 오디오 시각 t 에 끊는다(그 뒤 예약 없음) */
  stopAt(t: number): void {
    if (this.finished || t >= this.stopTime) return;
    this.stopTime = t;
    for (const l of this.live) {
      if (l.stopAt <= t) continue;
      l.stopAt = t;
      l.rec.stopAt = t;
      try {
        l.node.stop(t);
      } catch {
        /* 이미 멈춤 */
      }
    }
    this.arm();
  }

  pump(): void {
    if (this.finished) return;
    if (this.ctx.state === 'closed') return this.finish();
    if (!this.plan) return;
    const now = this.ctx.currentTime;
    this.reap(now);
    if (this.anchor === null) {
      const first = planItem(this.plan, 0);
      if (!first) return this.finish();
      const s = this.want(first.chunk);
      if (!s.v) {
        if (s.failed) return this.fail(new Error('첫 조각을 읽지 못했다'));
        this.arm();
        return;
      }
      const sr = this.ctx.sampleRate;
      this.anchor = Math.ceil((now + this.lead) * sr) / sr;
    }
    for (;;) {
      const it = planItem(this.plan, this.next);
      if (!it) break;
      const t0 = this.time(it.s);
      if (t0 >= this.stopTime || t0 > now + this.ahead) break;
      const s = this.want(it.chunk);
      if (s.failed) {
        this.stats.skipped++;
        this.next++;
        continue;
      }
      if (!s.v) break;
      this.schedule(this.next, it.chunk, it.s, s.v, now);
      this.next++;
    }
    const nx = planItem(this.plan, this.next);
    if (nx && this.time(nx.s) < this.stopTime) this.source.prefetch?.(nx.chunk);
    this.release();
    if ((!nx || this.time(nx.s) >= this.stopTime) && this.live.length === 0) return this.finish();
    this.arm();
  }

  private want(i: number): Slot {
    let s = this.slots.get(i);
    if (!s) {
      const slot: Slot = { p: this.source.load(i), v: null, failed: false };
      s = slot;
      this.slots.set(i, slot);
      slot.p.then(
        (v) => {
          if (this.slots.get(i) !== slot) return;
          slot.v = v;
          this.account();
          this.pump();
        },
        (e: unknown) => {
          console.warn('BGM 조각을 읽지 못해 건너뛴다', i, e);
          slot.failed = true;
          this.pump();
        },
      );
    }
    return s;
  }

  private schedule(item: number, chunk: number, s: number, v: BgmLoaded, now: number): void {
    const plan = this.plan!;
    const c = plan.chunks[chunk];
    const len = c.end - c.start;
    const t0 = this.time(s);
    const t1 = this.time(s + len);
    const nx = planItem(plan, item + 1);
    const nc = nx ? plan.chunks[nx.chunk] : null;
    const xf = nc && this.xfade > 0 ? Math.min(this.xfade, c.post / plan.rate, len / plan.rate / 2, (nc.end - nc.start) / plan.rate / 2) : 0;
    const fadeOutAt = xf > 0 && t1 < this.stopTime ? t1 : Infinity;
    const stopAt = Math.min(fadeOutAt < Infinity ? t1 + xf : t1, this.stopTime);
    let when = t0;
    let offset = v.offset;
    let late = false;
    if (t0 < now) {
      when = now + this.lead;
      if (when >= stopAt) {
        this.stats.skipped++;
        return;
      }
      offset += when - t0;
      late = true;
      this.stats.late++;
    }
    const prev = this.live[this.live.length - 1];
    const fadeIn = prev && prev.item === item - 1 && prev.rec.fadeOutAt === t0 && !late ? prev.rec.fadeOut : 0;
    const node = this.ctx.createBufferSource();
    node.buffer = v.buffer;
    let g: BgmGainNode | null = null;
    if (fadeIn > 0 || fadeOutAt < Infinity) {
      g = this.ctx.createGain();
      const p = g.gain;
      if (fadeIn > 0) {
        p.value = 0;
        p.setValueAtTime(0, t0);
        p.linearRampToValueAtTime(1, t0 + fadeIn);
      } else p.value = 1;
      if (fadeOutAt < Infinity) {
        p.setValueAtTime(1, fadeOutAt);
        p.linearRampToValueAtTime(0, fadeOutAt + xf);
      }
      node.connect(g);
      g.connect(this.out);
    } else node.connect(this.out);
    node.onended = () => this.pump();
    node.start(when, offset);
    node.stop(stopAt);
    const rec: BgmScheduled = { item, chunk, s, when, offset, stopAt, fadeIn, fadeOutAt, fadeOut: fadeOutAt < Infinity ? xf : 0, late, buffer: v.buffer };
    this.live.push({ item, chunk, node, gain: g, stopAt, rec });
    this.stats.scheduled++;
    if (this.o.record) this.log.push(rec);
  }

  private reap(now: number): void {
    for (let k = this.live.length - 1; k >= 0; k--) {
      const l = this.live[k];
      if (l.stopAt > now) continue;
      this.live.splice(k, 1);
      l.node.onended = null;
      try {
        l.node.disconnect();
        l.gain?.disconnect();
      } catch {
        /* 이미 끊김 */
      }
    }
  }

  /** 예약 중이거나 다음에 예약할 조각만 남긴다 */
  private release(): void {
    const keep = new Set<number>(this.live.map((l) => l.chunk));
    const nx = this.plan ? planItem(this.plan, this.next) : null;
    if (nx) keep.add(nx.chunk);
    for (const i of [...this.slots.keys()]) if (!keep.has(i)) this.slots.delete(i);
    this.account();
  }

  private account(): void {
    const seen = new Set<BgmAudioBuffer>();
    for (const s of this.slots.values()) if (s.v) seen.add(s.v.buffer);
    for (const l of this.live) seen.add(l.rec.buffer);
    let n = 0;
    for (const b of seen) n += bufBytes(b);
    this.stats.decodedBytes = n;
    if (n > this.stats.maxDecodedBytes) this.stats.maxDecodedBytes = n;
  }

  private arm(): void {
    if (!this.timer || this.finished) return;
    if (this.timerId !== null) this.timer.clear(this.timerId);
    this.timerId = this.timer.set(() => {
      this.timerId = null;
      this.pump();
    }, BGM_PUMP_MS);
  }

  private fail(e: unknown): void {
    if (this.finished) return;
    console.warn('BGM 을 재생하지 못했다', e);
    this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.timer && this.timerId !== null) this.timer.clear(this.timerId);
    this.timerId = null;
    const now = this.ctx.currentTime;
    for (const l of this.live) {
      l.node.onended = null;
      if (l.stopAt > now) {
        try {
          l.node.stop(now);
        } catch {
          /* 이미 멈춤 */
        }
      }
    }
    this.live.length = 0;
    this.slots.clear();
    this.stats.decodedBytes = 0;
    this.o.onEnded?.();
  }
}
