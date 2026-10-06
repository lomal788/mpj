/**
 * 페이지 ↔ 캐릭터 선택 독립 모듈(shell/charselect) 연결 — 어댑터(입력·소리·에셋 경로)와 60Hz 고정 스텝 루프.
 * 모듈 자체는 엔진층을 모르고, 이 파일이 페이지의 입력(view/input PadSource)을 원본 bex 입력 비트로 바꿔 넘긴다.
 *   bex 비트 [판독: docs/shell/charselect.md 4절]: A 0x1, B 0x2, 십자 왼 0x100·오 0x200·아래 0x400·위 0x800, 스틱 왼 0x10000·위 0x20000·오 0x40000·아래 0x80000
 */
import { ASSETS } from './env';
import { NPAD, STICK_MAX, type PadInput } from './core/pad';
import { createCharSelect, type CharSelectHandle } from './shell/charselect';
import type { PadSource } from './view/input';

const STICK_ON = 0.5 * STICK_MAX;

function toBex(p: PadInput | null): number {
  if (!p) return 0;
  let b = 0;
  if (p.buttons & NPAD.A) b |= 0x1;
  if (p.buttons & NPAD.B) b |= 0x2;
  if (p.buttons & NPAD.LEFT) b |= 0x100;
  if (p.buttons & NPAD.RIGHT) b |= 0x200;
  if (p.buttons & NPAD.DOWN) b |= 0x400;
  if (p.buttons & NPAD.UP) b |= 0x800;
  if (p.lx < -STICK_ON) b |= 0x10000;
  if (p.ly > STICK_ON) b |= 0x20000;
  if (p.lx > STICK_ON) b |= 0x40000;
  if (p.ly < -STICK_ON) b |= 0x80000;
  return b;
}

export interface CharSelectRun {
  handle: CharSelectHandle;
  stop(): void;
  /** 시험용: 다음 입력 읽기에 bits 를 한 번 더한다(칸 player) */
  press(player: number, bits: number): void;
}

/** stage 안에 캔버스를 만들어 캐릭터 선택을 돌린다. 끝나면 onDone(pcNN 목록 | null = 취소) */
export async function runCharSelect(stage: HTMLElement, cfg: { com: boolean[]; pads: (PadSource | null)[]; muted: boolean; names?: string[]; onDone(chars: string[] | null): void }): Promise<CharSelectRun> {
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  stage.append(canvas);
  const prev = cfg.com.map(() => 0);
  const extra = cfg.com.map(() => 0);
  let ctx: AudioContext | null = null;
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  if (!cfg.muted) {
    try {
      ctx = new AudioContext();
      void ctx.resume();
    } catch {
      ctx = null;
    }
  }
  const buffer = (c: AudioContext, url: string): Promise<AudioBuffer | null> => {
    let b = buffers.get(url);
    if (!b) {
      b = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((a) => c.decodeAudioData(a))
        .catch(() => null);
      buffers.set(url, b);
    }
    return b;
  };
  // 보이스(카드 슬롯마다 하나, 취소·Out 때 정지)와 배경음악(루프 구간, 결정 때 페이드 정지)
  const voices = new Map<number, AudioBufferSourceNode>();
  let bgm: { label: string; src: AudioBufferSourceNode | null; gain: GainNode | null } | null = null;
  const playVoice = (url: string, gain: number, slot: number): void => {
    if (!ctx) return;
    const c = ctx;
    void buffer(c, url).then((buf) => {
      if (!buf) return;
      voices.get(slot)?.stop();
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(g).connect(c.destination);
      src.start();
      voices.set(slot, src);
    });
  };
  const playBgm = (label: string, url: string, gain: number, loopStart: number, loopEnd: number): void => {
    if (!ctx || bgm?.label === label) return;
    const c = ctx;
    const me: { label: string; src: AudioBufferSourceNode | null; gain: GainNode | null } = { label, src: null, gain: null };
    bgm = me;
    void buffer(c, url).then((buf) => {
      if (!buf || bgm !== me) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = loopStart;
      src.loopEnd = loopEnd;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(g).connect(c.destination);
      src.start();
      me.src = src;
      me.gain = g;
    });
  };
  const stopBgm = (fade: number): void => {
    if (!ctx || !bgm) return;
    const { src, gain } = bgm;
    bgm = null;
    if (src && gain) {
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + fade);
      src.stop(t + fade);
    }
  };
  const playSe = (url: string, gain: number, x?: number): void => {
    if (!ctx) return;
    const c = ctx;
    void buffer(c, url).then((buf) => {
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain;
      // Play2D 위치 → 좌우 팬: 원본 팬 곡선 [미확정] → 화면 x 선형 [근사]
      const pan = c.createStereoPanner();
      pan.pan.value = x === undefined ? 0 : Math.max(-1, Math.min(1, (x - 960) / 960));
      src.connect(g).connect(pan).connect(c.destination);
      src.start();
    });
  };
  let done = false;
  const handle = await createCharSelect({
    canvas,
    assets: { url: (p) => `${ASSETS}charselect/${p}` },
    players: cfg.com.map((com, i) => ({ type: com ? 'com' : 'human', name: cfg.names?.[i] })),
    input: {
      poll(i) {
        const hold = toBex(cfg.pads[i]?.read() ?? null) | extra[i];
        extra[i] = 0;
        const trig = hold & ~prev[i];
        prev[i] = hold;
        return { hold, trig };
      },
    },
    sound: {
      play: (_label, url, gain, x) => playSe(url, gain, x),
      voice: (_label, url, gain, slot) => playVoice(url, gain, slot),
      voiceStop: (slot) => {
        voices.get(slot)?.stop();
        voices.delete(slot);
      },
      bgm: playBgm,
      bgmStop: stopBgm,
    },
    onDecided(result) {
      chosen = result.map((c) => handle.spec.chars[c]?.pc ?? 'pc01');
    },
    onFinished(decided) {
      done = true;
      run.stop();
      cfg.onDone(decided ? chosen : null);
    },
  });
  let chosen: string[] = [];
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const loop = (now: number): void => {
    acc += Math.min(250, now - last);
    last = now;
    let n = 0;
    while (acc >= 1000 / 60 && n < 4 && !done) {
      handle.step();
      acc -= 1000 / 60;
      n++;
    }
    if (!done) {
      handle.render();
      raf = requestAnimationFrame(loop);
    }
  };
  raf = requestAnimationFrame(loop);
  const run: CharSelectRun = {
    handle,
    press(player, bits) {
      extra[player] |= bits;
    },
    stop() {
      cancelAnimationFrame(raf);
      done = true;
      handle.dispose();
      canvas.remove();
      // 결정 때 BGM 페이드(0.5 s)가 끝난 뒤 닫는다
      const c = ctx;
      setTimeout(() => void c?.close(), 600);
    },
  };
  return run;
}
