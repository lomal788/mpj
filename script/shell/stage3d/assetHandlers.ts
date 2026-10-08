/**
 * mpj 형식 처리기(로더 관리자 3층 — 프로젝트 의존 허용) — 공용 로더 assetLoader.ts 의 압축/원본 모드·KTX2·meshopt 를 코어 처리기로 꽂는다.
 * 설계: docs/engine/loader_manager.md §11.1·§11.4.
 *
 * - gltf: createGltfLoader(meshopt·압축 모드 KTX2) 의 parseAsync. 압축 모드에서 glb 안 텍스처(../tex/*.ktx2)는 KTX2 로더 자리에 대리 객체를 끼워
 *   관리자 texture 로 받는다(MaterialSetup 이 같은 텍스처를 읽어도 한 번만). 소스 모드는 GLTFLoader 기본(ImageBitmap) 그대로.
 * - texture: loadTexture(압축 모드면 KTX2, 아니면 PNG TextureLoader) — 값은 깨끗한 원본, 쓰는 쪽이 clone.
 * - json·bytes: 코어 처리기(받기는 env.io = 전역 fetch → 압축 모드 소리 이름 바꿈·해시 이름 shim 을 지난다).
 * - meshopt 풀기는 워커 2개로(같은 wasm 이라 결과 동일, 메인 스레드 멈춤만 줄임).
 */
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { bytesHandler, jsonHandler, type AssetHandler, type AssetManagerApi } from '../../lib/assetcore';
import { gltfHandler, managedTextureLoader, textureHandler } from '../../lib/assetcore-three';
import { assetMode, createGltfLoader, ktx2Loader, loadTexture } from './assetLoader';

export const KIND_GLTF = 'gltf';
export const KIND_TEXTURE = 'texture';
export const KIND_JSON = 'json';
export const KIND_BYTES = 'bytes';

export interface MpjHandlerOptions {
  manager(): AssetManagerApi;
  /** 압축본·소스 URL → 논리 키(web/assets/ 기준 소스 경로). 모르는 URL 이면 null */
  keyOf(url: string): string | null;
}

let workers = false;

export function createMpjHandlers(o: MpjHandlerOptions): AssetHandler<any, any>[] {
  if (!workers && typeof Worker !== 'undefined') {
    workers = true;
    MeshoptDecoder.useWorkers(2);
  }
  const gl = createGltfLoader();
  if (assetMode() === 'dist') {
    const proxy = managedTextureLoader((url) => {
      const k = o.keyOf(url);
      return k ? o.manager().get(k, KIND_TEXTURE) : null;
    }, ktx2Loader());
    gl.setKTX2Loader(proxy as unknown as KTX2Loader);
  }
  return [gltfHandler(gl, KIND_GLTF), textureHandler(loadTexture, KIND_TEXTURE), jsonHandler(KIND_JSON), bytesHandler(KIND_BYTES)];
}

/** 압축 모드에서 이 키의 텍스처가 glb 안 참조로도 관리자를 지나는가(=미리 받아도 두 번 받지 않음) */
export function gltfTexturesManaged(): boolean {
  return assetMode() === 'dist';
}
