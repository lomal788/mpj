/**
 * 앱 하나의 흐름 예측기(globalThis.__mpjFlow) + charselect 끼움점 broker 설치(로더 관리자 3층 — mpj 전용). 설계: docs/engine/loader_manager.md §13.
 * - broker: Preview3D(캐릭터 선택·광장 플레이어·NPC)의 glb·motions·눈 텍스처와 2D 레이아웃 그림(assetHooks.loadUiImage → uiimage P0)을 앱 관리자로.
 *   효과음 바이트(assetHooks.loadBytes → bytes P1, 받은 버퍼의 복사본을 넘김)도 — 공용 assets/common/ 소리를 화면 사이에서 한 번 받는다(docs/engine/common_assets.md §7).
 *   키 종류가 겹치는 등 관리자가 거절하면 직접 읽기로 돌아간다.
 * - 모드: ?prefetch=full|lite|off, 없으면 navigator.connection(saveData·effectiveType slow-2g/2g/3g) → lite, 아니면 full.
 * - 묶음 키 목록(flowCatalog.ts)은 처음 쓸 때 동적 import(진입 청크를 키우지 않게).
 */
import { ASSET_MODE } from '../env';
import { GAMES } from '../games';
import { P0, P1 } from '@game/lib/assetcore';
import { assetHooks, type UiImageLike } from '@app/scene/menu/charselect/assetHooks';
import { KIND_BYTES, KIND_UI_IMAGE } from '@app/common/render3d/assetHandlers';
import { appAssets, assetKeyOf } from './appAssets';
import { bgmPrefetchKey } from './bgm';
import { FlowPrefetch, type FlowMode } from './flow';

const G = globalThis as { __mpjFlow?: FlowPrefetch };

export function prefetchMode(): FlowMode {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('prefetch') : null;
  if (q === 'full' || q === 'lite' || q === 'off') return q;
  const c = (typeof navigator !== 'undefined' ? (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection : undefined) ?? null;
  if (c?.saveData || (c?.effectiveType && /^(slow-2g|2g|3g)$/.test(c.effectiveType))) return 'lite';
  return 'full';
}

function installBroker(): void {
  if (assetHooks.broker) return;
  const m = appAssets();
  const tryGet = (url: string, kind: string, pri: number): Promise<unknown> | null => {
    const k = assetKeyOf(url);
    if (!k) return null;
    try {
      return m.get(k, kind, pri);
    } catch {
      return null;
    }
  };
  assetHooks.broker = {
    get: tryGet,
    want(url, kind, pri) {
      const k = assetKeyOf(url);
      try {
        if (k) m.want(k, kind, pri);
      } catch {
        /* 다른 종류로 이미 쓰는 키 — 직접 읽기 쪽이 받는다 */
      }
    },
    lower(url, pri) {
      const k = assetKeyOf(url);
      if (k) m.lower(k, pri);
    },
    drop(url) {
      const k = assetKeyOf(url);
      if (k) m.drop(k);
    },
    lite: () => prefetchMode() !== 'full',
  };
  const direct = assetHooks.loadUiImage;
  assetHooks.loadUiImage = (url) => (tryGet(url, KIND_UI_IMAGE, P0) as Promise<UiImageLike> | null) ?? direct(url);
  const directBytes = assetHooks.loadBytes;
  assetHooks.loadBytes = (url) => (tryGet(url, KIND_BYTES, P1) as Promise<ArrayBuffer> | null)?.then((a) => a.slice(0)) ?? directBytes(url);
}

export function appFlow(): FlowPrefetch {
  if (G.__mpjFlow) return G.__mpjFlow;
  installBroker();
  const f = new FlowPrefetch(appAssets(), {
    mode: prefetchMode,
    catalog: (bundle, json) =>
      import('./flowCatalog').then((c) =>
        c.flowKeys(bundle, json, {
          gltfTextures: ASSET_MODE === 'dist',
          gameDir: (name) => GAMES.find((g) => g.id === name)?.assetsDir ?? null,
          bgmKey: bgmPrefetchKey,
        }),
      ),
    loadCode: (bundle) => void GAMES.find((g) => g.id === bundle.slice(5))?.load?.()?.catch(() => undefined),
  });
  G.__mpjFlow = f;
  return f;
}
