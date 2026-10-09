/**
 * 사운드 런타임 mpj 연결 — docs/engine/04_sound.md §13.1·§13.5.
 * soundSystem(audio): AudioOut 하나에 코어(lib/sound)·WebAudio 어댑터(lib/sound-webaudio) 하나. 같은 페이지의 틀 소리(view/mgsceneSound.ts)와
 * 게임 소리(games/rhythm/view/sound.ts)가 핸들·그룹·플레이어 한도·엔진 난수를 같이 쓴다. 규칙 = 처음 만들 때의 soundDefaults.rules(기본 원본).
 * 디코드 캐시: 받기 = 로더 관리자 bytes(전역 fetch shim 이 압축 모드 .wav → .ogg|.m4a|.flac·해시 이름), 풀기 = decodeAudioData(바이트 복사본),
 * 전역 하나(globalThis, 표본율마다) — 같은 파일을 소비자·판·AudioOut 마다 다시 받고 풀지 않는다.
 * 처리기: buffer(통파일·파형), bgmstream(§12 재생기 — view/bgm.ts 그대로). 시퀀서 처리기는 소비자가 꽂는다(리듬 = 전역 변수를 같이 쓰는 SeqEngine).
 */
import { P1 } from '@game/lib/assetcore';
import { vibDefaults } from '@game/lib/vibration';
import { DUCKING_PRESET, pan2d, SoundCatalog, SoundCore, SoundRandom, soundDefaults, type PlayOpts, type SoundMeta, type SoundRules } from '@game/lib/sound';
import { DecodeCache, WebAudioSoundOut, bufferVoiceFactory, type BufferPayload, type Voice, type VoiceFactory } from '@game/lib/sound-webaudio';
import type { MgmSoundAdapter } from '../shell/mgmcommon/types';
import { appAssets, assetKeyOf } from './appAssets';
import { appAudio, type AudioOut } from './audio';
import { appBgm, bgmSource, playBgmStream, setAppBgmDest, type AppBgmSource, type BgmLoop } from './bgm';
import type { PadSource } from './input';
import { stopAllVibration, vibrateShell } from './vibration';

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
  /** 앱 BGM(view/bgm.ts appBgm) 출력이 지나는 덕킹 GainNode(→ destination, 04 §13.11.2) */
  readonly bgmDuck: GainNode;
  /** 장면 아카이브 해제(원본 ReleaseSoundArchive, 04 §13.12.1) — 디코드 캐시·로더 관리자 바이트에서 내린다 */
  release(urls: readonly string[]): number;
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

const GM = globalThis as { __mpjSoundMeta?: Promise<SoundMeta | null> };

/** 원본 사운드 정보 표 assets/common/sound/meta.json(04 §13.11.3) — 페이지에 한 번 */
export function soundMeta(): Promise<SoundMeta | null> {
  GM.__mpjSoundMeta ??= Promise.resolve()
    .then(() => appAssets().get<SoundMeta>('common/sound/meta.json', 'json', P1))
    .catch((e: unknown) => {
      console.warn('사운드 정보 표를 읽지 못해 라벨 접두 근사로 둔다', e);
      return null;
    });
  return GM.__mpjSoundMeta;
}

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
  if (core.rules.meta) void soundMeta().then((m) => core.setMeta(m));
  const bgmDuck = ctx.createGain();
  bgmDuck.connect(ctx.destination);
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
    bgmDuck,
    release(urls) {
      let n = 0;
      for (const u of urls) {
        const k = keyOf(u);
        if (decode.drop(k)) n++;
        try {
          appAssets().drop(k);
        } catch {
          /* 관리자 밖 키 */
        }
      }
      return n;
    },
  };
  systems.set(audio, s);
  if (audio === appAudio()) setAppBgmDest(() => bgmDuck);
  return s;
}

/** 지금 페이지의 사운드 런타임들(보기 페이지·시험) */
export function soundSystemOf(audio: AudioOut | null): MpjSound | null {
  return audio ? (systems.get(audio) ?? null) : null;
}

// ---------------------------------------------------------------- 셸 화면(04 §13.11)

/** 화면 하나의 소리 출력 — 페이지 흐름 공용 appAudio()·코어·디코드 캐시, 라벨 표는 화면마다 */
export interface ShellSound {
  readonly sys: MpjSound | null;
  /** 시험·디버그: 메시지 보이스·진동 사건 */
  readonly log: string[];
  /** 원본 Play / Play2D(x = 화면 x 0..1920) */
  play(label: string, url: string, gain: number, x?: number): number;
  /** 슬롯 보이스(슬롯마다 하나, 새 요청이 앞 것을 멈춤) */
  voice(label: string, url: string, gain: number, slot: number): void;
  voiceStop(slot: number): void;
  preload(urls: readonly string[]): void;
  /** 멈춘 컨텍스트 깨우기(사용자 입력 때) */
  wake(): void;
  /** MgmSound 어댑터(BGM 고리는 hooks 로 합친다) */
  mgm(hooks?: Partial<MgmSoundAdapter>): MgmSoundAdapter;
  /** 화면을 떠날 때: ms 뒤 이 화면이 낸 소리를 멈춘다(이전 페이지가 ms 뒤 자기 AudioContext 를 닫던 자리) */
  close(ms: number): void;
  /** 화면 진동(라벨·VB_ 키·자리 이름). 원본 규칙이 아니면 web() — 이전 화면 동작 */
  vibrate(pad: PadSource | null | undefined, name: string, web?: () => void): void;
}

export interface ShellSoundOptions {
  muted: boolean;
  /** Play2D 팬 노드를 늘 둔다(이전 mgmet·mgmcommon·modeselect·charselect SE 와 같음) */
  pan2d: boolean;
  /** 진동 대상 패드(플레이어 번호) */
  pads?: (pid: number) => PadSource | null | undefined;
  /** 원본 장면 이름(04 §13.12.1 — menu00·menu01·matching00·mgmet·mgm01·mg). 다른 장면이 시작되면 앞 장면 소리·진동을 멈춘다 */
  scene?: string;
}

/** Play2D 화면 x → 좌우 팬: 원본 팬 곡선 [미확정] → 화면 x 선형 [근사](이전 페이지 playSe 식) */
const pan2dOf = (x: number | undefined, rules: Readonly<SoundRules>): number => pan2d(x, rules);

/** 장면 시작 — 코어 장면 규칙(원본: 앞 장면 소리 0x20 즉시 정지) + 그 사건이면 진동도 정지(VibrationModule 장면 정지) */
export function enterSoundScene(sys: MpjSound | null, name: string): void {
  if (!sys || !sys.core.enterScene(name)) return;
  sys.flush();
  stopAllVibration();
}

export function shellSound(o: ShellSoundOptions): ShellSound {
  const audio = o.muted ? null : appAudio();
  const sys = audio ? soundSystem(audio) : null;
  const se = new SoundCatalog('shell-se');
  const vo = new SoundCatalog('shell-voice');
  const slots = new Map<number, number>();
  const log: string[] = [];
  let lastSe: string | null = null;
  if (o.scene) enterSoundScene(sys, o.scene);
  const wake = (): void => {
    const c = audio?.ctx;
    if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
  };
  const define = (cat: SoundCatalog, label: string, url: string, gain: number, pan2d: boolean): void => {
    const d = cat.defs.get(label);
    const p = d?.payload as BufferPayload | undefined;
    if (d && p && p.url === url && p.gain === gain) return;
    const payload: BufferPayload = { url, gain, late: 'wait' };
    cat.define(label, { kind: 'stream', bus: cat === vo ? 'voice' : 'se', player: null, playerMax: 0, priority: 64, sound3d: null, voice: 'buffer', payload, pan2d, orig: label.startsWith('SQ_') ? 'seq' : 'stream' });
  };
  const self: ShellSound = {
    sys,
    log,
    play(label, url, gain, x) {
      if (!sys) return 0;
      wake();
      define(se, label, url, gain, o.pan2d);
      lastSe = label;
      return sys.play(se, label, { pan: o.pan2d ? pan2dOf(x, sys.rules) : 0 });
    },
    voice(label, url, gain, slot) {
      if (!sys) return;
      wake();
      self.voiceStop(slot);
      define(vo, label, url, gain, false);
      slots.set(slot, sys.play(vo, label));
    },
    voiceStop(slot) {
      const h = slots.get(slot);
      if (h && sys) sys.stop(h, 0);
      slots.delete(slot);
    },
    preload(urls) {
      if (sys) for (const u of urls) void sys.load(u);
    },
    close(ms) {
      if (!sys || sys.rules.sceneExit) return;
      const stop = (): void => {
        for (const cat of [se, vo]) sys.core.forEach((h) => sys.core.stop(h, 0), cat);
        sys.flush();
      };
      if (ms > 0) setTimeout(stop, ms);
      else stop();
    },
    wake,
    mgm(hooks = {}) {
      const a: MgmSoundAdapter = { ...hooks, play: (l, u, gain, x) => void self.play(l, u, gain, x) };
      if (!sys) return a;
      if (sys.rules.groups === 'original')
        a.stopGroups = (groups, fade) => {
          for (const g of groups) sys.core.stopGroup(g, fade);
          sys.flush();
        };
      if (sys.rules.shellHooks) {
        a.duck = (group, on) => duck(sys, group, on);
        a.voice = (key, voiceId) => void log.push(`voice ${key} ${voiceId}`);
      }
      if (vibDefaults.rules.shell) a.vibrate = (pid, name) => self.vibrate(o.pads?.(pid), name);
      return a;
    },
    vibrate(pad, name, web) {
      log.push(`vib ${name}`);
      if (vibDefaults.rules.shell) vibrateShell(pad, name, lastSe);
      else web?.();
    },
  };
  return self;
}

/** 메시지 덕킹(DuckingGroup) — 코어 핸들 + 앱 BGM 덕킹 노드(지금 곡 라벨의 그룹이 들면 같은 목표·시간) */
function duck(sys: MpjSound, group: number, on: boolean): void {
  sys.core.duckGroup(group, on);
  sys.flush();
  const p = DUCKING_PRESET[group];
  const label = appBgm().label;
  if (!p || !label) return;
  const [lo, hi] = sys.core.groupsFor(label, 'stream');
  const now = sys.audio.ctx.currentTime;
  const g = sys.bgmDuck.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(sys.core.duckTargetFor(lo, hi), now + (on ? p.onSec : p.offSec));
}
