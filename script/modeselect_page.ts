/**
 * 페이지 ↔ 모드 선택 독립 모듈(shell/modeselect) 연결 — 어댑터(입력·소리·에셋 경로)와 60Hz 고정 스텝 루프. charselect_page.ts 와 같은 방식.
 *   bex 비트: A 0x1, B 0x2, 0x8(취소에 같이 쓰임, Y [추정]), 십자 아래 0x400·위 0x800, 스틱 위 0x20000·아래 0x80000 (docs/shell/modeselect.md 5절)
 */
import { ASSETS } from './env';
import { appFlow } from './view/appFlow';
import { NPAD, STICK_MAX, type PadInput } from './core/pad';
import { createModeSelect, type ModeSelectFlags, type ModeSelectHandle, type ModeSelectResult } from './shell/modeselect';
import type { PadSource } from './view/input';

const STICK_ON = 0.5 * STICK_MAX;

function toBex(p: PadInput | null): number {
  if (!p) return 0;
  let b = 0;
  if (p.buttons & NPAD.A) b |= 0x1;
  if (p.buttons & NPAD.B) b |= 0x2;
  if (p.buttons & NPAD.Y) b |= 0x8;
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

export interface ModeSelectRun {
  handle: ModeSelectHandle;
  stop(): void;
  /** 시험용: 다음 입력 읽기에 bits 를 한 번 더한다 */
  press(bits: number): void;
}

/** stage 안에 캔버스를 만들어 모드 선택을 돌린다. 끝나면 onDone(결과 | null = 취소) */
export async function runModeSelect(
  stage: HTMLElement,
  cfg: { pad: PadSource | null; muted: boolean; flags?: ModeSelectFlags; onNotice?(text: string): void; onDecided?(r: ModeSelectResult): void; onDone(r: ModeSelectResult | null): void },
): Promise<ModeSelectRun> {
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  stage.append(canvas);
  let prev = 0;
  let extra = 0;
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
  const playSe = (url: string, gain: number, x?: number): void => {
    if (!ctx) return;
    const c = ctx;
    let b = buffers.get(url);
    if (!b) {
      b = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((a) => c.decodeAudioData(a))
        .catch(() => null);
      buffers.set(url, b);
    }
    void b.then((buf) => {
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain;
      // Play2D 위치 → 좌우 팬: 원본 팬 곡선 [미확정] → 화면 x 선형 [근사] (charselect_page 와 같음)
      const pan = c.createStereoPanner();
      pan.pan.value = x === undefined ? 0 : Math.max(-1, Math.min(1, (x - 960) / 960));
      src.connect(g).connect(pan).connect(c.destination);
      src.start();
    });
  };
  let done = false;
  let result: ModeSelectResult | null = null;
  // 뒤 3D 장면 그림(docs/shell/modeselect.md 6.2): 원본 고정 그림이 없어 기본은 임시 대역(menu01_sky 자른 그림 [근사]). ?bg=<이미지 URL> 이면 그것, ?bg=none 이면 없음
  const bgParam = new URLSearchParams(location.search).get('bg');
  const bgUrl = bgParam === 'none' ? null : (bgParam ?? `${ASSETS}modeselect/backdrop_temp.png`);
  let backdrop: HTMLImageElement | undefined;
  if (bgUrl) {
    const img = new Image();
    img.src = bgUrl;
    try {
      await img.decode();
      backdrop = img;
    } catch {
      console.warn(`modeselect: 배경 이미지를 읽지 못했다 ${bgUrl}`);
    }
  }
  const handle = await createModeSelect({
    canvas,
    backdrop,
    assets: { url: (p) => `${ASSETS}modeselect/${p}` },
    flags: cfg.flags,
    input: {
      poll() {
        const hold = toBex(cfg.pad?.read() ?? null) | extra;
        extra = 0;
        const trig = hold & ~prev;
        prev = hold;
        return { hold, trig };
      },
    },
    sound: { play: (_l, url, gain, x) => playSe(url, gain, x) },
    onNotice: cfg.onNotice,
    onDecided(r) {
      result = r;
      cfg.onDecided?.(r);
    },
    onFinished(decided) {
      done = true;
      run.stop();
      cfg.onDone(decided ? result : null);
    },
  });
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let cursor = -1;
  const loop = (now: number): void => {
    acc += Math.min(250, now - last);
    last = now;
    let n = 0;
    while (acc >= 1000 / 60 && n < 4 && !done) {
      handle.step();
      acc -= 1000 / 60;
      n++;
    }
    if (handle.state.cursor !== cursor) {
      cursor = handle.state.cursor;
      const key = handle.spec.modes[cursor]?.key;
      if (key) appFlow().state('modeselect', 'cursor', key);
    }
    if (!done) {
      handle.render();
      raf = requestAnimationFrame(loop);
    }
  };
  raf = requestAnimationFrame(loop);
  const run: ModeSelectRun = {
    handle,
    press(bits) {
      extra |= bits;
    },
    stop() {
      cancelAnimationFrame(raf);
      done = true;
      handle.dispose();
      canvas.remove();
      const c = ctx;
      setTimeout(() => void c?.close(), 300);
    },
  };
  return run;
}
