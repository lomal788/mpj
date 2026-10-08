/**
 * 실행 환경 상수 — vite 의 import.meta.env 대신 쓴다.
 * __DEV__ 는 esbuild define 으로 들어온다(tools/esbuild_config.ts). 노드(tsx)에서 로직만 돌릴 때는 정의되지 않으므로 typeof 로 확인한다.
 */
declare const __DEV__: boolean | undefined;
/** 배포 빌드가 넣는 기본 에셋 모드(tools/build.ts --src-assets 면 'src') */
declare const __ASSET_MODE__: string | undefined;

/** 개발 서버 빌드인지 */
export const DEV: boolean = typeof __DEV__ !== 'undefined' && __DEV__;

/** 페이지 기준 경로. 개발·배포 모두 상대 경로라 './' 로 고정한다 */
export const BASE = './';

export type AssetMode = 'src' | 'dist';

/** 소스 에셋 루트(web/assets — 변환기 출력 그대로, 개발 페이지·에셋 확인용) */
export const ASSETS_SRC = `${BASE}assets/`;
/** 압축본 루트(web/assets-dist — tools/build_assets.ts, docs/engine/assets_pipeline.md) */
export const ASSETS_DIST = `${BASE}assets-dist/`;

/**
 * 에셋 모드: ?assets=src|dist 가 있으면 그것, 없으면 개발 서버 = src, 배포 빌드 = dist(build.ts --src-assets 면 src). 노드(시험)는 src.
 */
export const ASSET_MODE: AssetMode = (() => {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('assets') : null;
  if (q === 'src' || q === 'dist') return q;
  if (typeof location === 'undefined') return 'src';
  if (typeof __ASSET_MODE__ !== 'undefined' && (__ASSET_MODE__ === 'src' || __ASSET_MODE__ === 'dist')) return __ASSET_MODE__;
  return DEV ? 'src' : 'dist';
})();

/** 에셋 루트 — 모드에 따라 소스/압축본. 압축본에서 이름이 바뀐 파일(png→ktx2, wav→ogg 등)은 공용 로더가 바꿔 읽는다 */
export const ASSETS = ASSET_MODE === 'dist' ? ASSETS_DIST : ASSETS_SRC;
