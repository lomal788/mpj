/**
 * 앱 하나의 로더 관리자 인스턴스(로더 관리자 3층 — mpj 전용). 설계: docs/engine/loader_manager.md §11.
 * 키 = web/assets/ 기준 소스 경로(모드·해시와 무관), resolver = 모드별 루트(ASSETS) + 키. 해시 이름은 받기 직전 전역 fetch shim(6단계)이 입힌다.
 * 번들이 나뉘어도 하나만 있게 globalThis.__mpjAssetManager 에 둔다(loader_manager_ddalkkakrider.md §3 관례).
 * 프레임 tick = rAF, 탭이 숨으면 setTimeout(숨은 탭에서 rAF 가 멈춰 로딩이 서지 않게).
 */
import './assetMode';
import { ASSETS } from '../env';
import { createAssetManager, type AssetManager } from '@game/lib/assetcore';
import { createMpjHandlers } from '../shell/stage3d/assetHandlers';
import { assetKeyFrom } from './assetKey';

const G = globalThis as { __mpjAssetManager?: AssetManager };

const pageBase = (): string => (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');
const root = (): string => new URL(ASSETS, pageBase()).href;

/** URL(소스·압축본, 해시 이름 포함) → 논리 키. 에셋 루트 밖이면 null. 압축본 .ktx2 는 소스 .png 키로 */
export function assetKeyOf(url: string): string | null {
  return assetKeyFrom(url, pageBase(), root());
}

export function appAssets(): AssetManager {
  if (G.__mpjAssetManager) return G.__mpjAssetManager;
  const m = createAssetManager({
    env: {
      now: () => performance.now(),
      tick: (fn) => void (typeof document !== 'undefined' && document.hidden ? setTimeout(fn, 16) : requestAnimationFrame(fn)),
      io: { fetch: (u) => fetch(u) },
    },
    resolve: (key) => new URL(key, root()).href,
    handlers: [],
    maxFetch: 6,
    maxDecode: 2,
  });
  for (const h of createMpjHandlers({ manager: () => m, keyOf: assetKeyOf })) m.addHandler(h);
  G.__mpjAssetManager = m;
  return m;
}
