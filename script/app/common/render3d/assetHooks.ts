/**
 * 공용 에셋 읽기 끼움점 — charselect·레이아웃·글꼴이 같은 공급자를 쓴다. 기본값은 소스 모드와 같은 평범한 로더이고,
 * 페이지(script/view/assetMode.ts)가 공용 로더(app/common/render3d/assetLoader.ts: KTX2·meshopt 압축본 전환)로 바꿔 끼운다.
 * 설계: docs/engine/assets_pipeline.md §6.
 * broker: 페이지가 앱 로더 관리자를 꽂는 자리(docs/engine/loader_manager.md §13). 없으면(시험·단독 페이지) Preview3D 가 직접 읽는다.
 * 등급 숫자는 관리자 등급과 같다(0 지금 막음 · 1 곧 · 2 다음 · 3 유휴).
 * loadBytes: 효과음 등 바이트(공용 assets/common/sound 를 여러 화면이 같은 주소로 읽음 — docs/engine/common_assets.md §7). 앱 흐름에서는 페이지가 관리자 bytes 키로 바꿔 끼운다.
 * 돌려주는 ArrayBuffer 는 부른 쪽 것(decodeAudioData 가 떼어 가도 됨).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** 2D 레이아웃 그림: HTMLImageElement 또는 압축 텍스처(크기 + 원본) */
export interface UiImageLike {
  readonly width: number;
  readonly height: number;
}

/** 로더 관리자 중개(URL 기준). get 이 null 이면 관리자 밖(다른 종류로 이미 쓰는 키 등) → 직접 읽기 */
export interface AssetBroker {
  get(url: string, kind: 'gltf' | 'json' | 'texture', pri: number): Promise<unknown> | null;
  want(url: string, kind: 'gltf' | 'json' | 'texture', pri: number): void;
  lower(url: string, pri: number): void;
  drop(url: string): void;
  /** 데이터 절약·느린 망: 지금 화면 나머지(유휴) 미리 받기를 하지 않는다 */
  lite(): boolean;
}

export const assetHooks = {
  broker: null as AssetBroker | null,
  createGltfLoader: (): GLTFLoader => new GLTFLoader(),
  loadTexture: (url: string): Promise<THREE.Texture> => new THREE.TextureLoader().loadAsync(url),
  loadUiImage: (url: string): Promise<UiImageLike> =>
    new Promise<UiImageLike>((ok, bad) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => bad(new Error(`그림을 읽지 못했다: ${url}`));
      img.src = url;
    }),
  textureFromImage: (img: UiImageLike | HTMLCanvasElement | ImageBitmap): THREE.Texture => new THREE.Texture(img as HTMLImageElement),
  loadBytes: (url: string): Promise<ArrayBuffer> => fetch(url).then((r) => r.arrayBuffer()),
};
