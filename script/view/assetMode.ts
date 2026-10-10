/**
 * 에셋 모드 연결(페이지 시작 때 한 번) — env.ts 의 ASSET_MODE 를 공용 로더(app/common/render3d/assetLoader.ts)에 넣고, 압축 모드면 소리 fetch 를 바꾼다.
 * URL: ?assets=src|dist(소스/압축본 강제), ?texlod=N(밉 있는 KTX2 의 위 N 단계 버림 — 모바일 메모리용). 설계: docs/engine/assets_pipeline.md §6.
 * 압축 모드: 해시 이름 shim(fetch·img.src → distUrl) → 소리 fetch shim → 해시 표(index.json)를 받을 때까지 top-level await(그 뒤 페이지 코드가 돈다).
 * 배포 빌드 + 압축 모드면 서비스 워커 등록, 아니면 해제(docs/engine/loader_manager.md §5.8.3·§5.8.6).
 */
import { appRenderService } from '@app/common/render/service';
import { setAssetSupportRenderer } from '@app/common/render3d/assetLoader';
import { installUrlShim } from '../cache/urlShim';
import { syncServiceWorker } from '../cache/swClient';
import { ASSET_MODE, ASSETS_DIST, ASSETS_SRC, BASE, DEV } from '../env';
import { assetHooks } from '@app/common/render3d/assetHooks';
import { assetStats, configureAssetLoader, createGltfLoader, distReady, distUrl, installFetchShim, loadTexture, loadUiImage, textureFromImage, type UiImage } from '@app/common/render3d/assetLoader';

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
setAssetSupportRenderer(() => appRenderService().renderer);
configureAssetLoader({
  mode: ASSET_MODE,
  srcBase: ASSETS_SRC,
  distBase: ASSETS_DIST,
  transcoderPath: `${BASE}vendor/basis/`,
  texLod: Math.max(0, Math.floor(Number(q?.get('texlod') ?? 0) || 0)),
});
if (ASSET_MODE === 'dist') installUrlShim(distUrl);
installFetchShim();
// charselect(경계상 stage3d 를 import 못 함)는 끼움점으로 같은 로더를 쓴다
assetHooks.createGltfLoader = createGltfLoader;
assetHooks.loadTexture = loadTexture;
assetHooks.loadUiImage = loadUiImage;
assetHooks.textureFromImage = (img) => textureFromImage(img as UiImage | HTMLCanvasElement | ImageBitmap);
if (typeof window !== 'undefined') (window as unknown as { __mpjAssets: unknown }).__mpjAssets = { mode: ASSET_MODE, stats: assetStats };
if (typeof window !== 'undefined') syncServiceWorker(!DEV && ASSET_MODE === 'dist', `${BASE}sw.js`);
await distReady();
