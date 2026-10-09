/**
 * 페이지 ↔ 미니게임 장면 로더(app/scene/minigame/mgstage) 보기 — dev/ui?ui=mgstage&mg=mg0508. 공용 변환기(tools/analysis/mg_assets.py)가 만든 장면을
 * 맵 + 카메라 클립 재생 + 기본 애니로 보여 준다(게임 로직 없음). 설계: docs/engine/13_asset_converter.md §7.
 * URL: ?mg=<id>   변환된 게임(assets/mg/index.json, 기본 mg0508)
 *      ?cam=<이름> 처음 재생할 카메라(기본 = mg.camera.first, 끝나면 mg.camera.game 을 반복)
 * 키: C = 다음 카메라, Space = 카메라 멈춤/재생. 오른쪽 아래 단추로도 고른다.
 * 에셋은 앱 로더 관리자(view/appAssets.ts) — 압축/원본 모드 그대로. 나갈 때 release(지우지 않음).
 */
import { ASSETS } from '../env';
import { P0 } from '@game/lib/assetcore';
import { createMgStage, mgStageKey, type MgCameraHandle, type MgStage } from '@app/scene/minigame/mgstage';
import { gltfTexturesManaged } from '@app/common/render3d/assetHandlers';
import { appAssets } from '../view/appAssets';

export interface MgStagePageRun {
  readonly stage: MgStage;
  stop(): void;
  debug(): string;
}

export interface MgStagePageCfg {
  params: URLSearchParams;
  /** 보기 페이지는 끝이 없다(그만 단추로 닫음) — ui_main 계약상 받기만 한다 */
  onDone(result: string): void;
}

interface MgIndex {
  games: Record<string, { name: string; cameras: string[]; first: string | null }>;
}

export async function runMgStagePage(host: HTMLElement, cfg: MgStagePageCfg): Promise<MgStagePageRun> {
  const assets = appAssets();
  const index = await assets.get<MgIndex>('mg/index.json', 'json', P0);
  const id = cfg.params.get('mg') ?? 'mg0508';
  const info = index.games[id];
  if (!info) throw new Error(`변환된 장면이 없다: ${id} (있는 것: ${Object.keys(index.games).join(', ')})`);
  const owner = `mgstage:${id}`;
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;right:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;max-width:60%;z-index:2';
  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;left:8px;bottom:8px;padding:4px 8px;background:rgba(0,0,0,0.6);color:#fff;font:13px monospace;white-space:pre;pointer-events:none;z-index:2';
  host.append(canvas, bar, label);

  const ms = await createMgStage({
    canvas,
    id,
    assets: { url: (p) => `${ASSETS}mg/${id}/${p}` },
    loader: { manager: assets, key: (p) => mgStageKey(id, p), owner },
    gltfTextures: gltfTexturesManaged(),
  });
  ms.startBackground();

  const cams = ms.cameras();
  const first = cfg.params.get('cam') ?? ms.manifest.mg.camera.first ?? cams[0] ?? null;
  const game = ms.manifest.mg.camera.game;
  let cur: MgCameraHandle | null = null;
  let auto = !cfg.params.get('cam');
  let paused = false;
  const play = async (name: string, loop?: boolean): Promise<void> => {
    cur = await ms.playCamera(name, { loop });
    for (const b of bar.querySelectorAll('button')) (b as HTMLButtonElement).style.outline = b.textContent === name ? '2px solid #fc0' : '';
  };
  for (const c of cams) {
    const b = document.createElement('button');
    b.textContent = c;
    b.style.cssText = 'font:12px monospace;padding:2px 6px';
    b.addEventListener('click', () => {
      auto = false;
      void play(c);
    });
    bar.append(b);
  }
  if (first) await play(first);

  const fit = (): void => {
    const r = host.getBoundingClientRect();
    ms.stage.renderer.setPixelRatio(devicePixelRatio);
    ms.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyC' && cams.length) {
      auto = false;
      const i = cur ? cams.indexOf(cur.name) : -1;
      void play(cams[(i + 1) % cams.length]);
    } else if (e.code === 'Space') {
      paused = !paused;
      if (cur) cur.speed = paused ? 0 : 1;
      e.preventDefault();
    }
  };
  window.addEventListener('keydown', onKey);

  let raf = 0;
  let last = performance.now();
  let stopped = false;
  const loop = (now: number): void => {
    if (stopped) return;
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    if (auto && cur?.finished && game && cur.name !== game) void play(game, true);
    ms.update(dt);
    ms.render();
    label.textContent = `${id} ${info.name}\n${ms.manifest.mg.scene.slice(0, 80)}\n카메라 ${cur ? `${cur.name} ${Math.floor(cur.frame)}/${cur.frames}` : '-'}  (C 다음, Space 멈춤)`;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    stage: ms,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      ms.dispose();
      assets.release(owner);
      canvas.remove();
      bar.remove();
      label.remove();
    },
    debug() {
      const d = ms.debug();
      return Object.entries(d)
        .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : typeof v === 'number' ? Math.round(v) : v}`)
        .join('\n');
    },
  };
}
