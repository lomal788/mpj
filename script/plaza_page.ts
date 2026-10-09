/**
 * 페이지 ↔ 광장(menu00) 3D 모듈(shell/plaza) 연결 — 캔버스·2D 겹·입력(PadSource → PlazaPad)·소리(라벨 표)·60Hz 고정 스텝 루프.
 * 흐름(setplayer → 광장 → 모드 메뉴 → 프리 플레이)은 main.ts `?plaza=1` 이 잇는다(docs/shell/plaza_3d.md §6.9).
 * 에셋은 앱 로더 관리자(view/appAssets.ts)로 — 광장 무대 단계 로딩(P0 만 기다림), 소리 바이트는 P3 로 미리 받고 디코드는 이 페이지 문맥에서
 * (docs/engine/loader_manager.md §11.4). 나갈 때 release('plaza')(지우지 않음 — 다시 들어오면 캐시에서).
 * 캔버스·렌더러는 앱 수명 광장 렌더러(view/plazaGl.ts, §14) — 들어갈 때 붙이고(앞 화면에서 미리 만든 world 가 있으면 넘겨받음), 나갈 때 프로그램 고정 뒤
 * 부품·무대 dispose → 떼기. ?plazagl=0 이면 이전처럼 이 페이지가 캔버스를 만들고 무대가 렌더러를 만든다(UI 는 어느 쪽이든 무대 렌더러 하나).
 */
import { STICK_MAX, type PadInput } from '@game/core/pad';
import { ASSET_MODE, ASSETS } from './env';
import { P3 } from '@game/lib/assetcore';
import { appAssets, assetKeyOf } from './view/appAssets';
import { FixedClock, startPlaza, type PlazaExit, type PlazaPad, type PlazaPlayerSetup, type PlazaRun } from './shell/plaza';
import { parseDecoParam } from './shell/plaza/deco';
import { AREA } from './shell/plaza/interact';
import { appFlow } from './view/appFlow';
import { appBgm } from './view/bgm';
import { appSave } from './view/save';
import { shellSound } from './view/sound';
import type { PadSource } from './view/input';
import { plazaGl, plazaGlEnabled } from './view/plazaGl';

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
  const gl = plazaGlEnabled(cfg.params) ? plazaGl() : null;
  const entry = gl?.enter(stage, cfg.params, cfg.onProgress) ?? null;
  const canvas = entry?.canvas ?? document.createElement('canvas');
  canvas.className = 'jw-gl';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  stage.append(canvas, overlay);

  const snd = shellSound({ muted: cfg.muted, pan2d: false, scene: 'menu00' });
  const assets = appAssets();
  const OWNER = 'plaza';
  const sounds = await loadSounds();
  const play = (label: string): void => {
    const s = sounds[label];
    if (s) snd.play(label, s.url, s.gain);
  };

  const extra = cfg.com.map(() => ({ buttons: 0, stick: null as { lx: number; ly: number } | null, frames: 0 }));
  const cur: (PlazaPad | null)[] = cfg.com.map(() => null);
  const players: PlazaPlayerSetup[] = cfg.com.map((isCom, slot) => ({ slot, chara: cfg.chars[slot] ?? `pc0${slot + 1}`, isCom, local: true, name: cfg.names?.[slot] ?? `${slot + 1}P` }));
  const deco = cfg.params.has('deco') ? parseDecoParam(cfg.params.get('deco') ?? '') : undefined;
  let exited = false;
  const run = await startPlaza({
    canvas,
    gpu: entry?.gpu,
    world: entry?.world,
    overlay,
    worldAssets: { url: (p) => `${ASSETS}plaza/world/${p}` },
    loader: { manager: assets, key: (p) => `plaza/world/${p}`, owner: OWNER },
    gltfTextures: ASSET_MODE === 'dist',
    assetUrl: (p) => `${ASSETS}${p}`,
    players,
    pad: (slot) => cur[slot] ?? null,
    sound: {
      se: (label) => play(label),
      play: (label, url, gain) => void snd.play(label, url, gain),
      bgm: (label) => {
        if (label) void appBgm().play(label, cfg.muted);
        else appBgm().exit('plaza', 'balloon');
      },
    },
    save: appSave().plaza,
    params: cfg.params,
    deco,
    onProgress: cfg.onProgress,
    onExit: (e) => {
      if (exited) return;
      exited = true;
      appBgm().exit('plaza', e.k);
      cfg.onExit(e);
    },
  }).catch((e: unknown) => {
    gl?.leave(null, () => undefined);
    throw e;
  });
  gl?.entered();
  void appBgm().enter('plaza', cfg.muted);

  for (const s of Object.values(sounds)) {
    const key = assetKeyOf(s.url);
    if (key) assets.want(key, 'bytes', P3, OWNER);
  }
  let atBalloon = false;
  const offArea = run.ctx.on('interact:telop', (v) => {
    const b = (v as { area?: number }).area === AREA.BALLOON;
    if (b && !atBalloon) appFlow().state('plaza', 'area', 'balloon');
    atBalloon = b;
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
  const clock = new FixedClock();
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
      steps = clock.advance(now - last);
      last = now;
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
      offArea();
      if (gl) gl.leave(run.world.stage.scene, () => run.stop());
      else run.stop();
      assets.release(OWNER);
      snd.close(0);
      canvas.remove();
      overlay.remove();
    },
    debug: () => ({ ...run.debug(), gl: gl?.debug() ?? null }),
    press(slot, buttons, stick, frames = 1) {
      const x = extra[slot];
      if (!x) return;
      x.buttons = buttons;
      x.stick = stick ?? null;
      x.frames = frames;
    },
  };
}

