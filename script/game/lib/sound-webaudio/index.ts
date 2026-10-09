/**
 * 사운드 런타임 WebAudio 어댑터 — 코어(lib/sound) 명령을 WebAudio 노드로 옮긴다. import = 코어만(WebAudio 는 전역 형식). 설계: docs/engine/04_sound.md §13.1·§9.3.
 * 핸들 하나 = GainNode(코어 음량: 3D·SetVolume·덕킹 곱) → (팬이 있을 때만 StereoPannerNode) → 버스. 소리 재생 자체는 목소리 처리기(VoiceFactory)를 꽂아 쓴다
 * (처리기 = 프로젝트가 정하는 재생기: 통파일·시퀀서·스트리밍 BGM). 내장 처리기 bufferVoiceFactory = DecodeCache 의 AudioBuffer → AudioBufferSourceNode
 * (반복 구간·늦은 시작·stopAt·pause). DecodeCache = 받기·풀기를 주입받는 키별 디코드 캐시(같은 키는 한 번만 받고 한 번만 푼다).
 * 끝 판정: probe(h) = 목소리가 살아 있는가(코어가 한도 판정 때 바로 묻는다), poll(core) = 끝난 목소리를 정리하고 core.ended.
 */
import type { SoundBus, SoundCmd, SoundCore } from '../sound';

/** 재생 중인 소리 하나(처리기가 만든다) */
export interface Voice {
  alive(): boolean;
  /** fade 초 동안 줄이며 멈춘다(처리기마다 방식) */
  stop(fade: number): void;
  /** 오디오 시각 t 에 끊는다 */
  stopAt?(t: number): void;
  /** 시퀀스 지역 변수 */
  setLocal?(index: number, value: number): void;
  pause?(on: boolean, fade: number): void;
  setPan?(pan: number, at: number): void;
}

export interface VoiceFactory {
  /** 팬을 처리기가 스스로 한다(어댑터가 팬 노드를 만들지 않는다) */
  readonly ownsPan?: boolean;
  /** out = 이 핸들의 GainNode. null = 못 냄(코어 칸은 다음 probe 에서 비워진다) */
  start(c: SoundCmd, out: AudioNode, o: WebAudioSoundOut): Voice | null;
}

export interface SoundOutOptions {
  bus(name: SoundBus): AudioNode;
  /** 만든 AudioBufferSourceNode 를 호스트에 알린다(stopAll 용) */
  track?(src: AudioBufferSourceNode): void;
}

interface Live {
  voice: Voice;
  gain: GainNode;
  pan: StereoPannerNode | null;
}

export class WebAudioSoundOut {
  private readonly factories = new Map<string, VoiceFactory>();
  private readonly live = new Map<number, Live>();
  /** 처리기를 못 찾은 수 */
  missing = 0;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly o: SoundOutOptions,
  ) {}

  register(name: string, f: VoiceFactory): void {
    this.factories.set(name, f);
  }

  unregister(name: string): void {
    this.factories.delete(name);
  }

  /** 핸들 h 의 목소리가 살아 있는가(코어 probe) */
  readonly probe = (h: number): boolean => {
    const l = this.live.get(h);
    return !!l && l.voice.alive();
  };

  voice(h: number): Voice | null {
    return this.live.get(h)?.voice ?? null;
  }

  /** 핸들 h 의 GainNode(보기·시험) */
  handleNode(h: number): GainNode | null {
    return this.live.get(h)?.gain ?? null;
  }

  get size(): number {
    return this.live.size;
  }

  /** 코어에 쌓인 명령을 노드로 옮긴다 */
  apply(core: SoundCore): void {
    core.drain(this.onCmd);
  }

  /** 끝난 목소리를 정리하고 코어에 알린다 */
  poll(core: SoundCore): void {
    for (const [h, l] of this.live) {
      if (l.voice.alive()) continue;
      this.release(h, l);
      core.ended(h);
    }
  }

  private release(h: number, l: Live): void {
    this.live.delete(h);
    try {
      l.gain.disconnect();
      l.pan?.disconnect();
    } catch {
      /* 이미 끊김 */
    }
  }

  private readonly onCmd = (c: SoundCmd): void => {
    if (c.op === 'start') {
      this.start(c);
      return;
    }
    const l = this.live.get(c.h);
    if (!l) return;
    switch (c.op) {
      case 'stop':
        l.voice.stop(c.time);
        break;
      case 'stopAt':
        l.voice.stopAt?.(c.at);
        break;
      case 'gain': {
        const g = l.gain.gain;
        if (c.time > 0) {
          g.cancelScheduledValues(c.at);
          g.setValueAtTime(g.value, c.at);
          g.linearRampToValueAtTime(c.gain, c.at + c.time);
        } else g.setValueAtTime(c.gain, c.at);
        break;
      }
      case 'pan':
        if (l.pan) l.pan.pan.setValueAtTime(c.pan, c.at);
        else l.voice.setPan?.(c.pan, c.at);
        break;
      case 'pause':
        l.voice.pause?.(c.on, c.time);
        break;
      case 'local':
        l.voice.setLocal?.(c.index, c.value);
        break;
    }
  };

  private start(c: SoundCmd): void {
    const def = c.def;
    const f = def ? this.factories.get(c.voice) : undefined;
    if (!def || !f) {
      this.missing++;
      return;
    }
    const gain = this.ctx.createGain();
    gain.gain.value = c.gain;
    let pan: StereoPannerNode | null = null;
    if (!f.ownsPan && (c.pan !== 0 || c.pan3d || def.pan2d)) {
      pan = this.ctx.createStereoPanner();
      pan.pan.value = c.pan;
      gain.connect(pan);
      pan.connect(this.o.bus(def.bus));
    } else gain.connect(this.o.bus(def.bus));
    const voice = f.start(c, gain, this);
    if (!voice) {
      gain.disconnect();
      pan?.disconnect();
      return;
    }
    this.live.set(c.h, { voice, gain, pan });
  }
}

// ---------------------------------------------------------------- 디코드 캐시

export interface DecodeStats {
  requests: number;
  hits: number;
  fetches: number;
  decodes: number;
  failed: number;
}

/** 키별 디코드 캐시 — 같은 키는 한 번 받고 한 번 푼다. 실패는 undefined(경고는 받는 쪽 onError) */
export class DecodeCache {
  private readonly map = new Map<string, { p: Promise<AudioBuffer | undefined>; buf: AudioBuffer | undefined }>();
  readonly stats: DecodeStats = { requests: 0, hits: 0, fetches: 0, decodes: 0, failed: 0 };

  constructor(
    private readonly bytes: (key: string) => Promise<ArrayBuffer>,
    private readonly decode: (b: ArrayBuffer) => Promise<AudioBuffer>,
    private readonly onError?: (key: string, e: unknown) => void,
  ) {}

  get(key: string): Promise<AudioBuffer | undefined> {
    this.stats.requests++;
    const hit = this.map.get(key);
    if (hit) {
      this.stats.hits++;
      return hit.p;
    }
    const e: { p: Promise<AudioBuffer | undefined>; buf: AudioBuffer | undefined } = { p: null as unknown as Promise<AudioBuffer | undefined>, buf: undefined };
    this.stats.fetches++;
    e.p = this.bytes(key)
      .then((b) => {
        this.stats.decodes++;
        return this.decode(b);
      })
      .then(
        (b) => {
          e.buf = b;
          return b;
        },
        (err: unknown) => {
          this.stats.failed++;
          this.onError?.(key, err);
          return undefined;
        },
      );
    this.map.set(key, e);
    return e.p;
  }

  /** 풀린 버퍼(아직이면 undefined) */
  peek(key: string): AudioBuffer | undefined {
    return this.map.get(key)?.buf;
  }

  /** 내린다(원본 서브 아카이브 해제 — 다음 get 은 다시 받고 푼다). 풀린 버퍼가 있었으면 true */
  drop(key: string): boolean {
    const had = !!this.map.get(key)?.buf;
    this.map.delete(key);
    return had;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }
}

// ---------------------------------------------------------------- 내장 처리기: 통파일

/** buffer 처리기 자료 */
export interface BufferPayload {
  /** 디코드 캐시 키로 바꿀 주소 */
  url: string;
  /** 이 소리만의 배율(GainNode 하나 더, 없으면 노드 없음) */
  gain?: number;
  loop?: { startSec: number; endSec: number } | null;
  /** 반복 없을 때 이 초를 넘겨 늦게 오면 내지 않는다(skip 모드) */
  durationSec?: number;
  /** skip = 시작 시각이 지났으면 늦은 만큼 건너뛴다(리듬), wait = 풀리는 대로 처음부터(틀 SE) */
  late?: 'skip' | 'wait';
  /** 시작 오디오 시각(없으면 명령 시각) */
  at?: number;
}

/**
 * AudioBufferSourceNode 처리기. 버퍼가 이미 풀렸으면 바로, 아니면 풀린 뒤 시작한다.
 * 늦은 시작(skip): offset = 지금 − at(반복이면 반복 구간 안으로 접음), 반복 없고 길이를 넘었으면 내지 않음 — 리듬 sound.ts 이전 startFile 그대로.
 */
export function bufferVoiceFactory(cache: DecodeCache, keyOf: (url: string) => string): VoiceFactory {
  return {
    start(c, out, o) {
      const p = c.payload as BufferPayload;
      const ctx = o.ctx;
      const key = keyOf(p.url);
      const at = p.at ?? c.at;
      const loop = p.loop ?? null;
      const skip = p.late === 'skip';
      let src: AudioBufferSourceNode | null = null;
      let stopped = false;
      let stopTime = Infinity;
      let ended = false;
      let failed = false;
      let pausedAt = -1;
      let buf: AudioBuffer | null = null;
      let startedAt = 0;
      let startOffset = 0;
      /** 시작 전에 받은 페이드 정지의 끝 시각(원본은 같은 프레임에 낸 소리도 그룹 정지 페이드를 받는다 [추정]) */
      let fadeEnd = -1;
      const fadeOut = (s: AudioBufferSourceNode, from: number, to: number): void => {
        const g = (out as GainNode).gain;
        if (g) {
          g.cancelScheduledValues(from);
          g.setValueAtTime(g.value, from);
          g.linearRampToValueAtTime(0, to);
        }
        s.stop(to);
      };
      const play = (b: AudioBuffer, when: number, offset: number): void => {
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.loop = !!loop;
        if (loop) {
          s.loopStart = loop.startSec;
          s.loopEnd = loop.endSec;
        }
        let dst: AudioNode = out;
        if (p.gain !== undefined) {
          const g = ctx.createGain();
          g.gain.value = p.gain;
          g.connect(out);
          dst = g;
        }
        s.connect(dst);
        o.o.track?.(s);
        s.start(when, offset);
        if (stopTime < Infinity) s.stop(stopTime);
        s.addEventListener('ended', () => {
          if (src === s && pausedAt < 0) ended = true;
        });
        src = s;
        startedAt = when > 0 ? when : ctx.currentTime;
        startOffset = offset;
      };
      const begin = (b: AudioBuffer | undefined): void => {
        if (!b) {
          if (!skip) failed = true;
          return;
        }
        buf = b;
        if (stopped) return;
        const cur = ctx.currentTime;
        if (fadeEnd >= 0) {
          stopped = true;
          if (cur >= fadeEnd) return;
          play(b, 0, 0);
          fadeOut(src!, cur, fadeEnd);
          return;
        }
        if (!skip) {
          play(b, 0, 0);
          return;
        }
        if (cur >= stopTime) return;
        let offset = Math.max(0, cur - at);
        if (loop && offset >= loop.endSec) offset = loop.startSec + ((offset - loop.startSec) % (loop.endSec - loop.startSec));
        if (!loop && offset >= Math.min(p.durationSec ?? Infinity, b.duration)) return;
        play(b, at > cur ? at : 0, offset);
      };
      const ready = skip ? cache.peek(key) : undefined;
      if (ready) begin(ready);
      else void cache.get(key).then(begin);
      return {
        alive: () => !stopped && !ended && !failed && (src !== null || ctx.currentTime < stopTime) && (fadeEnd < 0 || ctx.currentTime < fadeEnd),
        stop: (fade) => {
          const s = src as AudioBufferSourceNode | null;
          if (!s && fade > 0 && !stopped) {
            fadeEnd = fadeEnd >= 0 ? Math.min(fadeEnd, ctx.currentTime + fade) : ctx.currentTime + fade;
            return;
          }
          stopped = true;
          if (!s) return;
          try {
            if (fade > 0) {
              const now = ctx.currentTime;
              fadeOut(s, now, now + fade);
            } else s.stop();
          } catch {
            /* 이미 멈춤 */
          }
        },
        stopAt: (t) => {
          stopTime = t;
          try {
            (src as AudioBufferSourceNode | null)?.stop(t);
          } catch {
            /* 이미 멈춤 */
          }
        },
        pause: (on) => {
          const s = src as AudioBufferSourceNode | null;
          if (on) {
            if (!s || pausedAt >= 0) return;
            pausedAt = startOffset + (ctx.currentTime - startedAt);
            try {
              s.stop();
            } catch {
              /* 이미 멈춤 */
            }
          } else if (pausedAt >= 0 && buf && !stopped) {
            let off = pausedAt;
            pausedAt = -1;
            if (loop && off >= loop.endSec) off = loop.startSec + ((off - loop.startSec) % (loop.endSec - loop.startSec));
            if (!loop && off >= (buf as AudioBuffer).duration) {
              ended = true;
              return;
            }
            play(buf, 0, off);
          }
        },
      };
    },
  };
}
