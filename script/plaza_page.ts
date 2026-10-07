/**
 * 페이지 ↔ 광장(menu00) 3D 모듈(shell/plaza) 연결 — 캔버스·2D 겹·입력(PadSource → PlazaPad)·소리(라벨 표)·60Hz 고정 스텝 루프.
 * 흐름(setplayer → 광장 → 모드 메뉴 → 프리 플레이)은 main.ts `?plaza=1` 이 잇는다(docs/shell/plaza_3d.md §6.9).
 */
import { STICK_MAX, type PadInput } from './core/pad';
import { ASSETS } from './env';
import { startPlaza, type PlazaExit, type PlazaPad, type PlazaPlayerSetup, type PlazaRun } from './shell/plaza';
import { parseDecoParam } from './shell/plaza/deco';
import type { PadSource } from './view/input';

export interface PlazaPageRun {
  readonly run: PlazaRun;
  stop(): void;
  debug(): Record<string, unknown>;
  /** 시험용: 다음 입력 읽기에 버튼 비트를 더하고 스틱을 덮는다(frames 프레임 동안) */
  press(slot: number, buttons: number, stick?: { lx: number; ly: number }, frames?: number): void;
}

export interface PlazaPageCfg {
  com: boolean[];
  /** pcNN, 플레이어 순 */
  chars: string[];
  names?: string[];
  pads: (PadSource | null)[];
  muted: boolean;
  params: URLSearchParams;
  onExit(e: PlazaExit): void;
  onProgress?(n: number, total: number, what: string): void;
}

/** [명세, 소리 파일 기준 폴더] — plaza/ui 명세(D)는 mgmcommon 기준 상대 경로를 쓴다 */
const SOUND_SPECS: [string, string][] = [
  ['mgmcommon/spec.json', 'mgmcommon/'],
  ['modeselect/spec.json', 'modeselect/'],
  ['charselect/spec.json', 'charselect/'],
  ['plaza/ui/plaza_ui.json', 'mgmcommon/'],
];

async function loadSounds(): Promise<Record<string, { url: string; gain: number }>> {
  const out: Record<string, { url: string; gain: number }> = {};
  for (const [p, dir] of SOUND_SPECS) {
    try {
      const r = await fetch(`${ASSETS}${p}`);
      if (!r.ok) continue;
      const j = (await r.json()) as { sounds?: Record<string, { file: string; gain: number }> };
      const base = new URL(`${ASSETS}${dir}`, location.href);
      for (const [k, v] of Object.entries(j.sounds ?? {})) out[k] ??= { url: new URL(v.file, base).href, gain: v.gain };
    } catch {
      continue;
    }
  }
  return out;
}

function toPad(p: PadInput | null): PlazaPad | null {
  if (!p) return null;
  return { buttons: p.buttons, lx: p.lx / STICK_MAX, ly: p.ly / STICK_MAX, rx: p.rx / STICK_MAX, ry: p.ry / STICK_MAX };
}

export async function runPlaza(stage: HTMLElement, cfg: PlazaPageCfg): Promise<PlazaPageRun> {
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  stage.append(canvas, overlay);

  let actx: AudioContext | null = null;
  if (!cfg.muted) {
    try {
      actx = new AudioContext();
      void actx.resume();
    } catch {
      actx = null;
    }
  }
  const sounds = await loadSounds();
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
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
  let bgm: { label: string; src: AudioBufferSourceNode | null } | null = null;
  const play = (label: string, loop: boolean): void => {
    const s = sounds[label];
    if (!actx || !s) return;
    const c = actx;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    const me = loop ? { label, src: null as AudioBufferSourceNode | null } : null;
    if (me) bgm = me;
    void buffer(c, s.url).then((buf) => {
      if (!buf || (me && bgm !== me)) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      const g = c.createGain();
      g.gain.value = s.gain;
      src.connect(g).connect(c.destination);
      src.start();
      if (me) me.src = src;
    });
  };

  const extra = cfg.com.map(() => ({ buttons: 0, stick: null as { lx: number; ly: number } | null, frames: 0 }));
  const cur: (PlazaPad | null)[] = cfg.com.map(() => null);
  const players: PlazaPlayerSetup[] = cfg.com.map((isCom, slot) => ({ slot, chara: cfg.chars[slot] ?? `pc0${slot + 1}`, isCom, local: true, name: cfg.names?.[slot] ?? `${slot + 1}P` }));
  const deco = cfg.params.has('deco') ? parseDecoParam(cfg.params.get('deco') ?? '') : undefined;
  let exited = false;
  const run = await startPlaza({
    canvas,
    overlay,
    worldAssets: { url: (p) => `${ASSETS}plaza/world/${p}` },
    assetUrl: (p) => `${ASSETS}${p}`,
    players,
    pad: (slot) => cur[slot] ?? null,
    sound: {
      se: (label) => play(label, false),
      bgm: (label) => {
        bgm?.src?.stop();
        bgm = null;
        if (label) play(label, true);
      },
    },
    params: cfg.params,
    deco,
    onProgress: cfg.onProgress,
    onExit: (e) => {
      if (exited) return;
      exited = true;
      cfg.onExit(e);
    },
  });

  const fit = (): void => {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * devicePixelRatio));
    const h = Math.max(1, Math.round(r.height * devicePixelRatio));
    run.resize(w, h);
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(stage);

  const fast = Math.max(0, Number(cfg.params.get('fast') ?? 0) || 0);
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let stopped = false;
  const readPads = (): void => {
    cfg.com.forEach((_, i) => {
      const p = cfg.pads[i];
      const v = toPad(p?.read() ?? null) ?? { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
      const x = extra[i];
      const forced = !!x && x.frames > 0;
      if (x && x.frames > 0) {
        v.buttons |= x.buttons;
        if (x.stick) {
          v.lx = x.stick.lx;
          v.ly = x.stick.ly;
        }
        x.frames--;
      }
      cur[i] = cfg.pads[i] || forced ? v : null;
    });
  };
  const loop = (now: number): void => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    let steps: number;
    if (fast > 0) steps = fast;
    else {
      acc += Math.min(250, now - last);
      last = now;
      steps = 0;
      while (acc >= 1000 / 60 && steps < 4) {
        acc -= 1000 / 60;
        steps++;
      }
    }
    for (let i = 0; i < steps && !exited; i++) {
      readPads();
      run.step(1);
    }
    if (!exited) run.render();
  };
  raf = requestAnimationFrame(loop);

  return {
    run,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      bgm?.src?.stop();
      run.stop();
      void actx?.close();
      canvas.remove();
      overlay.remove();
    },
    debug: () => run.debug(),
    press(slot, buttons, stick, frames = 1) {
      const x = extra[slot];
      if (!x) return;
      x.buttons = buttons;
      x.stick = stick ?? null;
      x.frames = frames;
    },
  };
}

