/**
 * 사운드 런타임 mpj 연결 — docs/engine/04_sound.md §13.1·§13.5.
 * soundSystem(audio): AudioOut 하나에 코어(lib/sound)·WebAudio 어댑터(lib/sound-webaudio) 하나. 같은 페이지의 틀 소리(view/mgsceneSound.ts)와
 * 게임 소리(games/rhythm/view/sound.ts)가 핸들·그룹·플레이어 한도·엔진 난수를 같이 쓴다. 규칙 = 처음 만들 때의 soundDefaults.rules(기본 원본).
 * 디코드 캐시: 받기 = 로더 관리자 bytes(전역 fetch shim 이 압축 모드 .wav → .ogg|.m4a|.flac·해시 이름), 풀기 = decodeAudioData(바이트 복사본),
 * 전역 하나(globalThis, 표본율마다) — 같은 파일을 소비자·판·AudioOut 마다 다시 받고 풀지 않는다.
 * 처리기: buffer(통파일·파형), bgmstream(§12 재생기 — view/bgm.ts 그대로). 시퀀서 처리기는 소비자가 꽂는다(리듬 = 전역 변수를 같이 쓰는 SeqEngine).
 */
import { P1 } from '../lib/assetcore';
import { SoundCatalog, SoundCore, SoundRandom, soundDefaults, type PlayOpts, type SoundRules } from '../lib/sound';
import { DecodeCache, WebAudioSoundOut, bufferVoiceFactory, type Voice, type VoiceFactory } from '../lib/sound-webaudio';
import { appAssets, assetKeyOf } from './appAssets';
import type { AudioOut } from './audio';
import { bgmSource, playBgmStream, type AppBgmSource, type BgmLoop } from './bgm';

/** bgmstream 처리기 자료 */
export interface StreamPayload {
  /** 소스(없으면 url·loop 로 새로 만든다 — BgmChannel 과 같음) */
  source?: AppBgmSource;
  url?: string;
  loop?: BgmLoop;
  gain?: number;
  owner?: string;
  /** 표본 0 의 오디오 시각(없으면 재생기가 첫 조각이 풀린 때로 정한다) */
  at?: number;
  /** 컨텍스트가 멈춰 있으면 깨운다(BgmChannel.play 와 같음) */
  resume?: boolean;
}

export interface MpjSound {
  readonly audio: AudioOut;
  readonly core: SoundCore;
  readonly out: WebAudioSoundOut;
  readonly decode: DecodeCache;
  readonly random: SoundRandom;
  readonly rules: Readonly<SoundRules>;
  /** 코어 play + 명령 적용(처리기가 바로 목소리를 만든다) */
  play(cat: SoundCatalog, label: string, o?: PlayOpts): number;
  stop(h: number, fade?: number): void;
  /** 쌓인 명령 적용 */
  flush(): void;
  /** 코어 갱신(덕킹·3D) + 명령 적용 + 끝난 목소리 정리 */
  update(): void;
  /** 디코드 캐시 키(로더 관리자 논리 키, 없으면 URL) */
  key(url: string): string;
  /** 통파일 받기·풀기(캐시) */
  load(url: string): Promise<AudioBuffer | undefined>;
  peek(url: string): AudioBuffer | undefined;
  /** 핸들 없이 스트림 재생기 하나를 연다(리듬 핸드셰이크 BGM 이 출발 시각에) */
  stream(p: StreamPayload, dest: AudioNode): Voice;
}

const G = globalThis as { __mpjSoundDecode?: Map<number, DecodeCache> };

function bytesOf(key: string): Promise<ArrayBuffer> {
  const viaUrl = (): Promise<ArrayBuffer> =>
    fetch(key).then((r) => {
      if (!r.ok) throw new Error(`소리를 읽지 못했다: ${key} (${r.status})`);
      return r.arrayBuffer();
    });
  if (/^[a-z]+:|^\.|^\//i.test(key)) return viaUrl();
  try {
    return appAssets().get<ArrayBuffer>(key, 'bytes', P1);
  } catch {
    return viaUrl();
  }
}

/** 표본율마다 전역 디코드 캐시 하나 */
export function decodeCache(ctx: BaseAudioContext): DecodeCache {
  const m = (G.__mpjSoundDecode ??= new Map());
  let c = m.get(ctx.sampleRate);
  if (!c) {
    let dec: BaseAudioContext = ctx;
    try {
      if (typeof OfflineAudioContext !== 'undefined') dec = new OfflineAudioContext(1, 1, ctx.sampleRate);
    } catch {
      dec = ctx;
    }
    c = new DecodeCache(
      bytesOf,
      (b) => dec.decodeAudioData(b.slice(0)),
      (key, e) => console.warn(`소리를 읽지 못해 건너뛴다: ${key}`, e),
    );
    m.set(ctx.sampleRate, c);
  }
  return c;
}

const keyOf = (url: string): string => assetKeyOf(url) ?? url;

function streamVoice(ctx: BaseAudioContext, p: StreamPayload, dest: AudioNode): Voice {
  const ac = ctx as AudioContext;
  if (p.resume && ac.state === 'suspended' && typeof ac.resume === 'function') void ac.resume().catch(() => undefined);
  const src = p.source ?? bgmSource(ctx, p.url ?? '', p.loop ?? null, p.owner);
  const st = playBgmStream(ctx, src, { dest, gain: p.gain, at: p.at });
  let stopped = false;
  return {
    alive: () => !stopped && st.alive(),
    stop: (fade) => {
      stopped = true;
      st.stop(fade);
    },
    stopAt: (t) => st.stopAt(t),
  };
}

const systems = new WeakMap<AudioOut, MpjSound>();

/** AudioOut 하나에 사운드 런타임 하나 */
export function soundSystem(audio: AudioOut): MpjSound {
  let s = systems.get(audio);
  if (s) return s;
  const ctx = audio.ctx;
  const out = new WebAudioSoundOut(ctx, { bus: (b) => audio.busNode(b), track: (src) => audio.track(src) });
  const core = new SoundCore({ rules: soundDefaults.rules, now: () => ctx.currentTime, probe: out.probe });
  const decode = decodeCache(ctx);
  out.register('buffer', bufferVoiceFactory(decode, keyOf));
  const bgm: VoiceFactory = { start: (c, dest) => streamVoice(ctx, c.payload as StreamPayload, dest) };
  out.register('bgmstream', bgm);
  s = {
    audio,
    core,
    out,
    decode,
    random: new SoundRandom(ctx.currentTime),
    rules: core.rules,
    play(cat, label, o) {
      const h = core.play(cat, label, o);
      out.apply(core);
      return h;
    },
    stop(h, fade = 0) {
      core.stop(h, fade);
      out.apply(core);
    },
    flush: () => out.apply(core),
    update() {
      core.update();
      out.apply(core);
      out.poll(core);
    },
    key: keyOf,
    load: (url) => decode.get(keyOf(url)),
    peek: (url) => decode.peek(keyOf(url)),
    stream: (p, dest) => streamVoice(ctx, p, dest),
  };
  systems.set(audio, s);
  return s;
}

/** 지금 페이지의 사운드 런타임들(보기 페이지·시험) */
export function soundSystemOf(audio: AudioOut | null): MpjSound | null {
  return audio ? (systems.get(audio) ?? null) : null;
}
