/**
 * 앱 BGM 어댑터 — 공용 재생기(lib/bgmstream)에 mpj 로더 관리자·에셋 모드를 잇는다. 설계: docs/engine/04_sound.md §12.
 * - 압축 모드 + index.json streams 에 있는 BGM: 조각 키(<원본>.bgm/NNN.wav, 소리 fetch shim 이 .ogg|.m4a·해시 이름으로) bytes → decodeAudioData.
 * - 원본 모드: wav 통째 bytes → 같은 배치(planBgm)로 PCM 을 잘라 AudioBuffer(디코드 없음, 무손실).
 *   압축 모드인데 조각이 없거나 반복 값이 index 와 다르면 통파일을 풀어 같은 일정으로(대체 경로).
 * - BgmChannel: 페이지 BGM 하나(같은 라벨이 돌고 있으면 그대로, 페이드 정지). bgmPrefetchKey: 미리 받기 목록에 넣을 첫 조각 키.
 * - appBgm(): 페이지 흐름 전체에 하나인 BGM 채널(공유 AudioContext) — 화면을 바꿔도 같은 라벨이면 끊기지 않음. 곡 = assets/common/sound/bgm.json,
 *   화면 규칙 = screenBgm.ts(docs/engine/04_sound.md §12.14).
 */
import { P1, P2 } from '@game/lib/assetcore';
import { BgmStream, bgmChunkKey, chunkSpans, fillPcm, parseWav, planBgm, sameLoop, validLoop, type BgmContext, type BgmLoaded, type BgmPlan, type BgmSource } from '@game/lib/bgmstream';
import { distStream } from '../shell/stage3d/assetLoader';
import { ASSETS } from '../env';
import { appAssets, assetKeyOf } from './appAssets';
import { appAudio } from './audio';
import { BGM_SPEC_PATH, SCREEN_BGM, type BgmScreen } from './screenBgm';

/** 반복: 초 구간 | 'all'(파일 전체) | null(한 번) */
export type BgmLoop = { startSec: number; endSec: number } | 'all' | null;

export interface AppBgmSource extends BgmSource {
  /** 조각 i 를 미리 풀어 둔다(원본 prefetch — 리듬 BGM 첫 조각). 소스가 살아 있는 동안 유지 */
  pin(i: number): Promise<void>;
}

const loopFrames = (loop: BgmLoop, rate: number, frames: number): [number, number] | null =>
  loop === 'all' ? [0, frames] : loop ? validLoop([Math.round(loop.startSec * rate), Math.round(loop.endSec * rate)], frames) : null;

/** 미리 받기 목록용: BGM wav 키 → 압축 모드면 첫 조각 키, 아니면 그대로 */
export function bgmPrefetchKey(key: string): string {
  return distStream<BgmPlan>(key) ? bgmChunkKey(key, 0) : key;
}

export function bgmSource(ctx: BaseAudioContext, url: string, loop: BgmLoop, owner?: string): AppBgmSource {
  const key = assetKeyOf(url);
  const bytes = (k: string | null, pri: number): Promise<ArrayBuffer> =>
    k
      ? Promise.resolve().then(() => appAssets().get<ArrayBuffer>(k, 'bytes', pri, owner))
      : fetch(url).then((r) => {
          if (!r.ok) throw new Error(`BGM 을 읽지 못했다: ${url} (${r.status})`);
          return r.arrayBuffer();
        });
  const pinned = new Map<number, Promise<BgmLoaded>>();
  const info = key ? distStream<BgmPlan>(key) : null;
  let load: (i: number) => Promise<BgmLoaded>;
  let open: () => Promise<BgmPlan>;
  let prefetch: ((i: number) => void) | undefined;
  if (key && info && sameLoop(info.loop, loopFrames(loop, info.rate, info.frames))) {
    open = () => Promise.resolve(info);
    load = (i) => bytes(bgmChunkKey(key, i), P1).then(async (a) => ({ buffer: await ctx.decodeAudioData(a.slice(0)), offset: info.chunks[i].pre / info.rate }));
    prefetch = (i) => {
      try {
        appAssets().want(bgmChunkKey(key, i), 'bytes', P2, owner);
      } catch {
        /* 다른 종류로 쓰는 키 */
      }
    };
  } else {
    if (key && info) console.warn(`BGM 반복 값이 압축본과 달라 통파일로 재생한다: ${key}`, info.loop, loop);
    let whole: Promise<{ plan: BgmPlan; load(i: number): BgmLoaded }> | null = null;
    const get = (): Promise<{ plan: BgmPlan; load(i: number): BgmLoaded }> =>
      (whole ??= bytes(key, P1).then(async (a) => {
        const w = parseWav(a);
        if (w) {
          const plan = planBgm(w.frames, w.rate, w.ch, loopFrames(loop, w.rate, w.frames));
          return {
            plan,
            load: (i: number): BgmLoaded => {
              const spans = chunkSpans(plan, i);
              const len = spans.reduce((n, s) => n + s[1], 0);
              const buf = ctx.createBuffer(Math.min(2, w.ch), len, w.rate);
              fillPcm(
                w,
                spans,
                Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)),
              );
              return { buffer: buf, offset: plan.chunks[i].pre / w.rate };
            },
          };
        }
        const buf = await ctx.decodeAudioData(a.slice(0));
        const plan = planBgm(buf.length, buf.sampleRate, buf.numberOfChannels, loopFrames(loop, buf.sampleRate, buf.length), { chunk: Infinity, pad: 0 });
        return { plan, load: (i: number): BgmLoaded => ({ buffer: buf, offset: plan.chunks[i].start / buf.sampleRate }) };
      }));
    open = () => get().then((g) => g.plan);
    load = (i) => get().then((g) => g.load(i));
  }
  return {
    open,
    load: (i) => pinned.get(i) ?? load(i),
    prefetch,
    pin(i) {
      let p = pinned.get(i);
      if (!p) {
        p = load(i);
        pinned.set(i, p);
        p.catch(() => pinned.delete(i));
      }
      return p.then(
        () => undefined,
        () => undefined,
      );
    },
  };
}

/** AudioContext 로 스트림 하나를 연다(dest 기본 = destination) */
export function playBgmStream(ctx: BaseAudioContext, source: BgmSource, o: { dest?: AudioNode; gain?: number; at?: number; onEnded?(): void } = {}): BgmStream {
  return new BgmStream(ctx as unknown as BgmContext, source, { dest: o.dest ?? ctx.destination, gain: o.gain, at: o.at, onEnded: o.onEnded });
}

/** 페이지 BGM 하나 — 원본 SoundManager::PlayBgm/StopBgm 자리(핸들 하나) */
export type BgmSourceFactory = (ctx: AudioContext, url: string, loop: BgmLoop, owner?: string) => BgmSource;

export class BgmChannel {
  private cur: { label: string; s: BgmStream } | null = null;

  constructor(
    private readonly ctx: () => AudioContext | null,
    private readonly owner?: string,
    private readonly source: BgmSourceFactory = bgmSource,
    /** 출력 노드(없으면 destination) — 앱 BGM 은 사운드 연결의 덕킹 노드(docs/engine/04_sound.md §13.11.2) */
    private readonly dest: () => AudioNode | null = () => null,
  ) {}

  get label(): string | null {
    return this.cur?.label ?? null;
  }

  /** 지금 곡이 돌고 있음(한 번 곡이 끝나면 거짓) */
  alive(): boolean {
    return !!this.cur && this.cur.s.alive();
  }

  /** 지금 스트림(시험·디버그) */
  get stream(): BgmStream | null {
    return this.cur?.s ?? null;
  }

  /** 같은 라벨이 돌고 있으면 그대로 둔다. url 이 없으면(명세에 파일 없음) 앞 곡만 멈춘다 */
  play(label: string, url: string | null, o: { gain: number; loop: BgmLoop }): void {
    if (this.cur?.label === label && this.cur.s.alive()) return;
    this.stop(0);
    const c = this.ctx();
    if (!c || !url) return;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    this.cur = { label, s: playBgmStream(c, this.source(c, url, o.loop, this.owner), { gain: o.gain, dest: this.dest() ?? undefined }) };
  }

  stop(fade = 0): void {
    this.cur?.s.stop(fade);
    this.cur = null;
  }
}

/** MgmSound 어댑터의 bgm·bgmStop 고리 — 명세 sounds[label] 의 gain·loopStart/loopEnd(초, 없으면 한 번) */
export function mgmBgmHooks(
  ch: BgmChannel,
  sounds: Readonly<Record<string, { gain: number; loopStart?: number; loopEnd?: number }>>,
): { bgm(label: string, url: string | null): void; bgmStop(fade: number): void } {
  return {
    bgm(label, url) {
      const s = sounds[label];
      const loop = s && typeof s.loopStart === 'number' && typeof s.loopEnd === 'number' ? { startSec: s.loopStart, endSec: s.loopEnd } : null;
      ch.play(label, url, { gain: s?.gain ?? 1, loop });
    },
    bgmStop: (fade) => ch.stop(fade),
  };
}

// ---------------------------------------------------------------- 앱 BGM 채널(화면 사이 이어 재생)

export interface BgmSpecEntry {
  file: string;
  gain: number;
  loopStart?: number;
  loopEnd?: number;
}
export type BgmSpecMap = Record<string, BgmSpecEntry & { url: string }>;

export interface AppBgmDeps {
  ctx(): AudioContext | null;
  /** 출력 노드(없으면 destination) */
  dest?(): AudioNode | null;
  spec(): Promise<BgmSpecMap>;
  source?: BgmSourceFactory;
}

/** bgm.json → 라벨별 명세(url = common/sound 기준) */
export function loadBgmSpec(fetchJson: (path: string) => Promise<unknown> = (p) => fetch(`${ASSETS}${p}`).then((r) => r.json())): Promise<BgmSpecMap> {
  const base = BGM_SPEC_PATH.replace(/[^/]+$/, '');
  return fetchJson(BGM_SPEC_PATH).then((j) => {
    const out: BgmSpecMap = {};
    for (const [k, v] of Object.entries((j as { bgm?: Record<string, BgmSpecEntry> }).bgm ?? {})) out[k] = { ...v, url: `${ASSETS}${base}${v.file}` };
    return out;
  });
}

export class AppBgm {
  readonly ch: BgmChannel;
  /** 시험·디버그: 요청 기록(t = AudioContext 시각) */
  readonly log: { t: number; k: 'play' | 'stop'; label: string | null; fade?: number }[] = [];
  private want: string | null = null;

  constructor(private readonly deps: AppBgmDeps) {
    this.ch = new BgmChannel(() => deps.ctx(), 'bgm', deps.source, () => deps.dest?.() ?? null);
  }

  /** 틀기로 한 라벨(받는 중 포함) */
  get label(): string | null {
    return this.want;
  }

  private now(): number {
    return this.deps.ctx()?.currentTime ?? 0;
  }

  /** 원본 PlayBgm: 같은 라벨이 돌고 있거나 받는 중이면 그대로, 아니면 앞 곡을 즉시 끊고 새로 */
  play(label: string, muted = false): Promise<void> {
    if (muted) return Promise.resolve();
    if (this.want === label && (this.ch.label !== label || this.ch.alive())) return Promise.resolve();
    this.want = label;
    this.log.push({ t: this.now(), k: 'play', label });
    return this.deps.spec().then(
      (spec) => {
        if (this.want !== label) return;
        const s = spec[label];
        if (!s) {
          console.warn(`BGM 명세에 없는 라벨: ${label}`);
          return;
        }
        const loop = typeof s.loopStart === 'number' && typeof s.loopEnd === 'number' ? { startSec: s.loopStart, endSec: s.loopEnd } : null;
        this.ch.play(label, s.url, { gain: s.gain, loop });
      },
      (e: unknown) => console.warn('BGM 명세를 읽지 못했다', e),
    );
  }

  /** 원본 StopBgm(preset) — fade 초 */
  stop(fade: number): void {
    if (this.want === null && !this.ch.label) return;
    this.log.push({ t: this.now(), k: 'stop', label: this.want, fade });
    this.want = null;
    this.ch.stop(fade);
  }

  /** 화면 시작(SCREEN_BGM.enter) */
  enter(screen: BgmScreen, muted = false): Promise<void> {
    const l = SCREEN_BGM[screen].enter;
    return l ? this.play(l, muted) : Promise.resolve();
  }

  /** 화면 나가기(SCREEN_BGM.exit[kind]: 초 = 페이드 정지, null·없음 = 이어 재생) */
  exit(screen: BgmScreen, kind: string): void {
    const f = (SCREEN_BGM[screen].exit as Record<string, number | null>)[kind];
    if (typeof f === 'number') this.stop(f);
  }

  /** MgmSound 어댑터 고리(PlayBgm·StopBgm → 이 채널) */
  hooks(muted: boolean): { bgm(label: string, url: string | null): void; bgmStop(fade: number): void } {
    return {
      bgm: (label) => void this.play(label, muted),
      bgmStop: (fade) => this.stop(fade),
    };
  }
}

/** 페이지 흐름 전체에 하나(번들이 나뉘어도 globalThis 로 공유) */
export function appBgm(): AppBgm {
  const G = globalThis as { __mpjBgm?: AppBgm; __mpjBgmDest?: () => AudioNode | null };
  if (G.__mpjBgm) return G.__mpjBgm;
  let spec: Promise<BgmSpecMap> | null = null;
  G.__mpjBgm = new AppBgm({
    ctx: () => appAudio()?.ctx ?? null,
    dest: () => G.__mpjBgmDest?.() ?? null,
    spec: () => (spec ??= loadBgmSpec()),
  });
  return G.__mpjBgm;
}

/** 앱 BGM 출력 노드 고리 — 사운드 연결(view/sound.ts)이 공용 AudioOut 의 덕킹 노드를 넣는다 */
export function setAppBgmDest(f: () => AudioNode | null): void {
  (globalThis as { __mpjBgmDest?: () => AudioNode | null }).__mpjBgmDest = f;
}
