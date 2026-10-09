/**
 * UI 시험 항목 "분할 화면" — 분할 화면 공용 런타임(lib/splitscreen·splitscreen-three·splitscreen-dom)을 미니게임 장면(app/scene/minigame/mgstage) 위에서 본다.
 * 설계·조작: docs/engine/10_split_screen.md §9.7. 게임 로직 없음 — 장면·카메라 클립만.
 * URL: dev/ui?ui=splitscreen&mg=mg0508|mg0102|mg0122 (기본 mg0508: 2×1, mg0102·mg0122: 2×2)
 * 키: S = 전체(focus0) ↔ 균등 분할, 1~4 = 그 화면 focus, T = 전환 시간 0 / 0.5 / 1 초, G = 다음 게임.
 * 레이어 카메라: 0 = 장면 게임 카메라 클립(무대 anim 슬롯), 1 = 다른 원본 클립, 2·3 = 레이어 0 자세를 월드 Y 축으로 90°·270° 돌린 것(보기용, 원본 아님).
 * 한 rAF = 무대 update 1회 + 카메라 갱신 + 분할 고정 스텝(1/60, 최대 4) + 레이어별 그리기(renderSplit) + 분할선 DOM.
 */
import * as THREE from 'three';
import { STEP_MS } from '@game/core/clock';
import { ASSETS } from '../env';
import { P0 } from '@game/lib/assetcore';
import { SplitScreen, STEP_SEC } from '@game/lib/splitscreen';
import { DomDividingLines } from '@game/lib/splitscreen-dom';
import { createMgStage, mgStageKey, MgCamera, parseFsnb, type MgStage } from '@app/scene/minigame/mgstage';
import { distUrl } from '@app/common/render3d/assetLoader';
import { gltfTexturesManaged, KIND_JSON } from '@app/common/render3d/assetHandlers';
import { appAssets } from '../view/appAssets';

export interface SplitScreenPageRun {
  readonly split: SplitScreen;
  stop(): void;
  debug(): string;
}

export interface SplitScreenPageCfg {
  params: URLSearchParams;
  onDone(result: string): void;
}

const GAMES: readonly [string, number, number][] = [
  ['mg0508', 2, 1],
  ['mg0102', 2, 2],
  ['mg0122', 2, 2],
];
const TIMES = [0, 0.5, 1];
const MAX_STEPS = 4;
const AXIS_Y = new THREE.Vector3(0, 1, 0);

interface Loaded {
  id: string;
  cols: number;
  rows: number;
  owner: string;
  ms: MgStage;
  cams: THREE.PerspectiveCamera[];
  names: string[];
  clip: MgCamera | null;
}

export async function runSplitScreenPage(host: HTMLElement, cfg: SplitScreenPageCfg): Promise<SplitScreenPageRun> {
  const assets = appAssets();
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  host.append(canvas);
  const lines = new DomDividingLines({ parent: host, texture: new URL(distUrl(`${ASSETS}common/tex/sys_dividing_line_s.png`), document.baseURI).href });
  const labels: HTMLDivElement[] = [];
  for (let i = 0; i < 4; i++) {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;padding:2px 6px;background:rgba(0,0,0,0.55);color:#fff;font:12px monospace;pointer-events:none;display:none';
    host.append(d);
    labels.push(d);
  }
  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;right:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;max-width:70%;z-index:2';
  host.append(bar);
  const button = (text: string, fn: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'font:12px monospace;padding:2px 6px';
    b.addEventListener('click', fn);
    bar.append(b);
    return b;
  };

  const split = new SplitScreen();
  let timeIdx = 2;
  let cur: Loaded | null = null;
  let loading: Promise<void> | null = null;
  let stopped = false;
  const flip = new THREE.Quaternion();

  const unload = (): void => {
    if (!cur) return;
    cur.ms.dispose();
    assets.release(cur.owner);
    cur = null;
  };

  const fit = (): void => {
    if (!cur) return;
    const r = host.getBoundingClientRect();
    cur.ms.stage.renderer.setPixelRatio(devicePixelRatio);
    cur.ms.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
  };

  const load = async (id: string): Promise<void> => {
    unload();
    const g = GAMES.find((x) => x[0] === id) ?? GAMES[0];
    const owner = `splitscreen:${g[0]}`;
    const ms = await createMgStage({
      canvas,
      id: g[0],
      assets: { url: (p) => `${ASSETS}mg/${g[0]}/${p}` },
      loader: { manager: assets, key: (p) => mgStageKey(g[0], p), owner },
      gltfTextures: gltfTexturesManaged(),
    });
    if (stopped) {
      ms.dispose();
      assets.release(owner);
      return;
    }
    ms.startBackground();
    const camNames = ms.cameras();
    const game = ms.manifest.mg.camera.game ?? camNames[0] ?? null;
    const other = camNames.find((c) => c !== game) ?? null;
    if (game) await ms.playCamera(game, { loop: true });
    let clip: MgCamera | null = null;
    if (other) {
      const info = ms.manifest.asset.cameras?.[other];
      const json = info ? await assets.get<unknown>(mgStageKey(g[0], info.file), KIND_JSON, P0, owner).catch(() => null) : null;
      const c = json ? parseFsnb(json) : null;
      if (c) clip = new MgCamera(other, c, { loop: true });
    }
    const cams: THREE.PerspectiveCamera[] = [ms.stage.camera];
    for (let i = 1; i < 4; i++) cams.push(new THREE.PerspectiveCamera());
    const names = [game ?? '-', clip ? clip.name : `${game ?? '-'} Y180°`, `${game ?? '-'} Y90°`, `${game ?? '-'} Y270°`];
    cur = { id: g[0], cols: g[1], rows: g[2], owner, ms, cams, names, clip };
    split.reset();
    split.to(g[1], g[2], 0, 0);
    fit();
  };

  const go = (id: string): void => {
    if (loading) return;
    loading = load(id).finally(() => {
      loading = null;
    });
  };

  const sec = (): number => TIMES[timeIdx];
  const setFocus = (focus: number): void => {
    if (!cur) return;
    split.to(cur.cols, cur.rows, focus, sec());
  };
  const toggle = (): void => {
    if (!cur) return;
    setFocus(split.list.isSplitting() ? 0 : -1);
  };
  const timeBtn = button('', () => {
    timeIdx = (timeIdx + 1) % TIMES.length;
    timeBtn.textContent = `시간 ${sec()} s (T)`;
  });
  timeBtn.textContent = `시간 ${sec()} s (T)`;
  button('전체(focus0)', () => setFocus(0));
  button('균등 분할', () => setFocus(-1));
  button('분할 전환 (S)', toggle);
  const nextGame = (): void => {
    const i = GAMES.findIndex((x) => x[0] === cur?.id);
    go(GAMES[(i + 1) % GAMES.length][0]);
  };
  button('다음 게임 (G)', nextGame);

  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyS') toggle();
    else if (e.code === 'KeyT') timeBtn.click();
    else if (e.code === 'KeyG') nextGame();
    else if (/^Digit[1-4]$/.test(e.code) && cur) {
      const f = Number(e.code.slice(5)) - 1;
      if (f < cur.cols * cur.rows) setFocus(f);
    }
  };
  window.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(fit);
  ro.observe(host);

  const first = cfg.params.get('mg') ?? 'mg0508';
  await load(GAMES.some((x) => x[0] === first) ? first : 'mg0508');

  const updateCams = (c: Loaded, df: number): void => {
    const c0 = c.cams[0];
    c0.updateMatrixWorld(true);
    for (let i = 1; i < 4; i++) {
      const d = c.cams[i];
      d.aspect = c0.aspect;
      if (i === 1 && c.clip) {
        c.clip.apply(d, df);
        continue;
      }
      const a = i === 1 ? Math.PI : i === 2 ? Math.PI / 2 : (Math.PI * 3) / 2;
      flip.setFromAxisAngle(AXIS_Y, a);
      d.position.copy(c0.position).applyQuaternion(flip);
      d.quaternion.copy(c0.quaternion).premultiply(flip);
      d.up.copy(c0.up);
      d.fov = c0.fov;
      d.near = c0.near;
      d.far = c0.far;
      d.updateProjectionMatrix();
      d.updateMatrixWorld(true);
    }
  };

  const drawLabels = (c: Loaded): void => {
    for (let i = 0; i < 4; i++) {
      const el = labels[i];
      const on = i < split.list.count && split.list.param(i).visible;
      el.style.display = on ? '' : 'none';
      if (!on) continue;
      const p = split.list.param(i);
      el.style.left = `calc(${(p.x * 100).toFixed(3)}% + 6px)`;
      el.style.top = `calc(${(p.y * 100).toFixed(3)}% + 6px)`;
      el.textContent = `화면 ${i} ${c.names[i]}`;
    }
  };

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const loop = (now: number): void => {
    if (stopped) return;
    const ms = now - last;
    last = now;
    const c = cur;
    if (c && !loading) {
      const dt = Math.max(0, Math.min(0.1, ms / 1000));
      c.ms.update(dt);
      updateCams(c, dt * 60);
      acc += ms;
      let n = 0;
      while (acc >= STEP_MS && n < MAX_STEPS) {
        acc -= STEP_MS;
        split.step(STEP_SEC);
        n++;
      }
      if (n === MAX_STEPS) acc = Math.min(acc, STEP_MS);
      c.ms.renderSplit(split.list, c.cams);
      lines.draw(split.lines);
      drawLabels(c);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    split,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      unload();
      lines.dispose();
      canvas.remove();
      bar.remove();
      for (const l of labels) l.remove();
    },
    debug() {
      const l = split.list;
      const rows = [`${cur?.id ?? '-'} ${cur ? `${cur.cols}×${cur.rows}` : ''}  분할 ${l.isSplitting() ? '예' : '아니오'}  끝 ${l.isFinished() ? '예' : '아니오'}  시간 ${sec()} s`];
      for (let i = 0; i < l.count; i++) {
        const p = l.param(i);
        rows.push(`화면 ${p.id} (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.w.toFixed(3)}, ${p.h.toFixed(3)})`);
      }
      const r = cur?.ms.splitRenderer.stats;
      rows.push(`선 상태 ${split.lines.state} 알파 ${split.lines.alpha.toFixed(0)} 수직 ${split.lines.vCount} 수평 ${split.lines.hCount}`);
      if (r) rows.push(`그린 레이어 ${r.layers}  프레임 ${r.frames}`);
      return rows.join('\n');
    },
  };
}
