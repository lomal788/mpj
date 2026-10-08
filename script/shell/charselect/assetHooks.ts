/**
 * 에셋 읽기 끼움점 — charselect 는 셸 경계상 자기 폴더·three 만 import 한다(check_charselect 6). 기본값은 소스 모드와 같은 평범한 로더이고,
 * 페이지(script/view/assetMode.ts)가 공용 로더(shell/stage3d/assetLoader.ts: KTX2·meshopt 압축본 전환)로 바꿔 끼운다.
 * 설계: docs/engine/assets_pipeline.md §6.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** 2D 레이아웃 그림: HTMLImageElement 또는 압축 텍스처(크기 + 원본) */
export interface UiImageLike {
  readonly width: number;
  readonly height: number;
}

export const assetHooks = {
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
};
