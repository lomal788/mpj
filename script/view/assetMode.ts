/**
 * 에셋 모드 연결(페이지 시작 때 한 번) — env.ts 의 ASSET_MODE 를 공용 로더(shell/stage3d/assetLoader.ts)에 넣고, 압축 모드면 소리 fetch 를 바꾼다.
 * URL: ?assets=src|dist(소스/압축본 강제), ?texlod=N(밉 있는 KTX2 의 위 N 단계 버림 — 모바일 메모리용). 설계: docs/engine/assets_pipeline.md §6.
 */
import { ASSET_MODE, ASSETS_DIST, ASSETS_SRC, BASE } from '../env';
import { assetHooks } from '../shell/charselect/assetHooks';
import { assetStats, configureAssetLoader, createGltfLoader, installFetchShim, loadTexture, loadUiImage, textureFromImage, type UiImage } from '../shell/stage3d/assetLoader';

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
configureAssetLoader({
  mode: ASSET_MODE,
  srcBase: ASSETS_SRC,
  distBase: ASSETS_DIST,
  transcoderPath: `${BASE}vendor/basis/`,
  texLod: Math.max(0, Math.floor(Number(q?.get('texlod') ?? 0) || 0)),
});
installFetchShim();
// charselect(경계상 stage3d 를 import 못 함)는 끼움점으로 같은 로더를 쓴다
assetHooks.createGltfLoader = createGltfLoader;
assetHooks.loadTexture = loadTexture;
assetHooks.loadUiImage = loadUiImage;
assetHooks.textureFromImage = (img) => textureFromImage(img as UiImage | HTMLCanvasElement | ImageBitmap);
if (typeof window !== 'undefined') (window as unknown as { __mpjAssets: unknown }).__mpjAssets = { mode: ASSET_MODE, stats: assetStats };
