/**
 * 앱 BGM 어댑터 — 공용 재생기(lib/bgmstream)에 mpj 로더 관리자·에셋 모드를 잇는다. 설계: docs/engine/04_sound.md §12.
 * - 압축 모드 + index.json streams 에 있는 BGM: 조각 키(<원본>.bgm/NNN.wav, 소리 fetch shim 이 .ogg|.m4a·해시 이름으로) bytes → decodeAudioData.
 * - 원본 모드: wav 통째 bytes → 같은 배치(planBgm)로 PCM 을 잘라 AudioBuffer(디코드 없음, 무손실).
 *   압축 모드인데 조각이 없거나 반복 값이 index 와 다르면 통파일을 풀어 같은 일정으로(대체 경로).
 * - BgmChannel: 페이지 BGM 하나(같은 라벨이 돌고 있으면 그대로, 페이드 정지). bgmPrefetchKey: 미리 받기 목록에 넣을 첫 조각 키.
 */
import { P1, P2 } from '../lib/assetcore';
import { BgmStream, bgmChunkKey, chunkSpans, fillPcm, parseWav, planBgm, sameLoop, validLoop, type BgmContext, type BgmLoaded, type BgmPlan, type BgmSource } from '../lib/bgmstream';
import { distStream } from '../shell/stage3d/assetLoader';
import { appAssets, assetKeyOf } from './appAssets';

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
export class BgmChannel {
  private cur: { label: string; s: BgmStream } | null = null;

  constructor(
    private readonly ctx: () => AudioContext | null,
    private readonly owner?: string,
  ) {}

  get label(): string | null {
    return this.cur?.label ?? null;
  }

  /** 같은 라벨이 돌고 있으면 그대로 둔다. url 이 없으면(명세에 파일 없음) 앞 곡만 멈춘다 */
  play(label: string, url: string | null, o: { gain: number; loop: BgmLoop }): void {
    if (this.cur?.label === label && this.cur.s.alive()) return;
    this.stop(0);
    const c = this.ctx();
    if (!c || !url) return;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    this.cur = { label, s: playBgmStream(c, bgmSource(c, url, o.loop, this.owner), { gain: o.gain }) };
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
