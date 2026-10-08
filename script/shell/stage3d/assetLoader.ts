/**
 * 공용 에셋 로더 — 소스 모드(web/assets: PNG·비압축 glb·wav)와 압축 모드(web/assets-dist: KTX2·meshopt glb·Opus/AAC/FLAC)를
 * 한 곳에서 전환한다. 설계: docs/engine/assets_pipeline.md §6.
 *
 * - 위치: 셸 경계(mgm_common.md §9.1, stage3d 는 자기 폴더만 import)상 stage3d 안에 둔다. 다른 셸(charselect·plaza)과
 *   페이지·게임 뷰가 이 파일을 import 한다. 모드·경로는 페이지(script/view/assetMode.ts)가 configureAssetLoader 로 넣는다(기본 = 소스).
 * - 압축 모드에서 이름이 바뀌는 파일은 assets-dist/index.json(tools/build_assets.ts)에 있다: png → ktx2, wav → ogg|m4a(손실) 또는 flac(무손실).
 *   소비자는 소스 이름(.png·.wav)을 그대로 쓰고, 이 로더가 바꿔 읽는다.
 * - KTX2 색공간: KTX2Loader 는 DFD 의 sRGB 표시로 colorSpace 를 정하지만, PNG 경로(TextureLoader·ImageBitmapLoader)는 NoColorSpace 로
 *   시작해 소비자가 sRGB 를 정한다. 화면을 소스 모드와 같게 하려고 KTX2 텍스처도 NoColorSpace 로 되돌린다(GLTFLoader 가 색 슬롯에
 *   SRGB 를 다시 넣는 것은 PNG 와 같다). flipY 는 모든 소비자가 false 라 같다(압축 텍스처는 뒤집지 못함).
 * - 모바일 메모리 선택지 texLod(?texlod=N): 밉이 있는 KTX2 의 위 N 단계를 버리고 올린다(GPU 메모리 1/4ⁿ, 내려받기는 같음).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type AssetMode = 'src' | 'dist';

export interface AssetLoaderConfig {
  mode: AssetMode;
  /** 소스 에셋 루트(페이지 기준, 예 './assets/') */
  srcBase: string;
  /** 압축본 루트(예 './assets-dist/') */
  distBase: string;
  /** basis_transcoder.js·wasm 폴더(예 './vendor/basis/') */
  transcoderPath: string;
  /** 밉 있는 KTX2 에서 버릴 위 단계 수(0 = 원본 해상도) */
  texLod: number;
}

interface DistIndex {
  ktx2: Set<string>;
  lossy: Set<string>;
  flac: Set<string>;
  names: Map<string, string>;
  streams: Map<string, unknown>;
}

type IndexJson = { ktx2?: string[]; lossy?: string[]; flac?: string[]; names?: Record<string, string>; streams?: Record<string, unknown> };

let cfg: AssetLoaderConfig = { mode: 'src', srcBase: './assets/', distBase: './assets-dist/', transcoderPath: './vendor/basis/', texLod: 0 };
let indexP: Promise<DistIndex> | null = null;
let ktx2: KTX2Loader | null = null;
let rawFetch: typeof fetch | null = null;
let opusP: Promise<boolean> | null = null;
let distNames: Map<string, string> | null = null;
let distStreams: Map<string, unknown> | null = null;

/** 읽은 압축 텍스처 통계(검증·디버그용) */
export const assetStats = { ktx2: 0, ktx2Bytes: 0, png: 0, gltf: 0 };

export function configureAssetLoader(c: Partial<AssetLoaderConfig>): void {
  cfg = { ...cfg, ...c };
  indexP = null;
}

export function assetMode(): AssetMode {
  return cfg.mode;
}

const baseUri = (): string => (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');

function fetchRaw(url: string): Promise<Response> {
  return (rawFetch ?? fetch)(url);
}

function distIndex(): Promise<DistIndex> {
  indexP ??= fetchRaw(new URL(`${cfg.distBase}index.json`, baseUri()).href)
    .then((r) => (r.ok ? (r.json() as Promise<IndexJson>) : ({} as IndexJson)))
    .catch((e: unknown) => {
      console.warn('assets-dist/index.json 을 읽지 못했다 — 이름 바뀜 없이 읽는다', e);
      return {} as IndexJson;
    })
    .then((j) => {
      const names = new Map(Object.entries(j.names ?? {}));
      const streams = new Map(Object.entries(j.streams ?? {}));
      distNames = names;
      distStreams = streams;
      return { ktx2: new Set(j.ktx2 ?? []), lossy: new Set(j.lossy ?? []), flac: new Set(j.flac ?? []), names, streams };
    });
  return indexP;
}

/** 압축 모드에서 이 BGM(소스 키)의 스트리밍 조각 배치(index.json streams — lib/bgmstream BgmPlan, docs/engine/04_sound.md §12). 소스 모드·표를 읽기 전·없음이면 null */
export function distStream<T = unknown>(key: string): T | null {
  return cfg.mode === 'dist' ? ((distStreams?.get(key) as T | undefined) ?? null) : null;
}

/** 압축 모드 해시 표(index.json names)를 읽을 때까지 기다린다. 소스 모드는 바로 끝난다 */
export function distReady(): Promise<void> {
  return cfg.mode === 'dist' ? distIndex().then(() => undefined) : Promise.resolve();
}

/**
 * 압축본 URL → 해시 붙은 실제 URL(index.json names: 해시 없는 압축본 상대 경로 → 해시 붙은 상대 경로). 동기·멱등: 소스 모드·표를 읽기 전·
 * 표에 없음·이미 해시 이름이면 그대로. ?query·#hash 는 보존한다. 계약: analysis/notes/SHARED.md [loader-123]↔[loader-6].
 */
export function distUrl(url: string): string {
  if (cfg.mode !== 'dist' || !distNames || distNames.size === 0) return url;
  const cut = url.search(/[?#]/);
  const head = cut < 0 ? url : url.slice(0, cut);
  const rel = distRel(head);
  const to = rel === null ? undefined : distNames.get(rel);
  if (!to) return url;
  return new URL(cfg.distBase + to.split('/').map(encodeURIComponent).join('/'), baseUri()).href + (cut < 0 ? '' : url.slice(cut));
}

/** URL → 압축본 루트 기준 상대 경로(압축본 밖이면 null) */
function distRel(url: string): string | null {
  const base = new URL(cfg.distBase, baseUri()).href;
  const u = new URL(url, baseUri());
  const href = u.origin + u.pathname;
  return href.startsWith(base) ? decodeURIComponent(href.slice(base.length)) : null;
}

const swapExt = (url: string, from: RegExp, to: string): string => {
  const u = new URL(url, baseUri());
  u.pathname = u.pathname.replace(from, to);
  return u.href;
};

/** 압축 모드에서 이 PNG 의 KTX2 URL(없으면 null) */
export async function ktx2UrlFor(url: string): Promise<string | null> {
  if (cfg.mode !== 'dist' || !/\.png$/i.test(new URL(url, baseUri()).pathname)) return null;
  const rel = distRel(url);
  if (!rel) return null;
  return (await distIndex()).ktx2.has(rel) ? swapExt(url, /\.png$/i, '.ktx2') : null;
}

function neutral(t: THREE.Texture): THREE.Texture {
  t.colorSpace = THREE.NoColorSpace;
  const c = t as THREE.CompressedTexture;
  const skip = Math.min(cfg.texLod, (c.mipmaps?.length ?? 0) - 1);
  if (c.isCompressedTexture && skip > 0) {
    c.mipmaps = c.mipmaps.slice(skip);
    c.image = { width: c.mipmaps[0].width, height: c.mipmaps[0].height } as unknown as typeof c.image;
    c.needsUpdate = true;
  }
  if (c.isCompressedTexture) {
    assetStats.ktx2++;
    for (const m of c.mipmaps ?? []) assetStats.ktx2Bytes += (m.data as ArrayBufferView).byteLength;
  }
  return t;
}

/** 형식 지원을 잠깐 만든 WebGL 문맥에서 본다(렌더러 없이 어디서나 쓰게) — 같은 브라우저·GPU 라 렌더러 문맥과 같다 */
function detectSupport(l: KTX2Loader): void {
  const c = document.createElement('canvas');
  const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGL2RenderingContext | null;
  const names = new Set(gl?.getSupportedExtensions() ?? []);
  const fake = {
    extensions: {
      has: (n: string) => names.has(n),
      get: (n: string) => gl?.getExtension(n),
    },
  };
  l.detectSupport(fake as unknown as THREE.WebGLRenderer);
  (gl?.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext();
}

export function ktx2Loader(): KTX2Loader {
  if (ktx2) return ktx2;
  const l = new KTX2Loader();
  l.setTranscoderPath(new URL(cfg.transcoderPath, baseUri()).href);
  detectSupport(l);
  const inner = l as unknown as { _createTexture(b: ArrayBuffer, c?: object): Promise<THREE.Texture> };
  const create = inner._createTexture.bind(l);
  inner._createTexture = async (b, c) => neutral(await create(b, c));
  ktx2 = l;
  return l;
}

/** glTF 로더 — meshopt 는 늘, KTX2 는 압축 모드에서만 붙인다 */
export function createGltfLoader(manager?: THREE.LoadingManager): GLTFLoader {
  const l = new GLTFLoader(manager);
  l.setMeshoptDecoder(MeshoptDecoder);
  if (cfg.mode === 'dist') l.setKTX2Loader(ktx2Loader());
  assetStats.gltf++;
  return l;
}

/** 2D 텍스처(3D 재질용). 압축 모드면 KTX2(있을 때), 아니면 PNG(TextureLoader 와 같은 결과) */
export async function loadTexture(url: string): Promise<THREE.Texture> {
  const k = await ktx2UrlFor(url);
  if (k) return ktx2Loader().loadAsync(k);
  assetStats.png++;
  return new THREE.TextureLoader().loadAsync(url);
}

/**
 * 미리 만들어 재질에 건 텍스처 객체에 나중에 그림을 채운다(plaza npcMaterial 의 배열 층). 압축본이면 KTX2 데이터를 옮겨 압축 텍스처로 바꾼다
 * (colorSpace·flipY·감김은 부른 쪽이 정한 값 그대로).
 */
export async function loadTextureInto(url: string, tx: THREE.Texture): Promise<void> {
  const k = await ktx2UrlFor(url);
  if (!k) {
    tx.image = await new THREE.ImageLoader().loadAsync(url);
    tx.needsUpdate = true;
    return;
  }
  const c = (await ktx2Loader().loadAsync(k)) as THREE.CompressedTexture;
  (tx as unknown as { isCompressedTexture: boolean }).isCompressedTexture = true;
  tx.image = c.image;
  tx.mipmaps = c.mipmaps;
  tx.format = c.format;
  tx.type = c.type;
  tx.generateMipmaps = false;
  tx.minFilter = c.minFilter;
  tx.premultiplyAlpha = c.premultiplyAlpha;
  tx.needsUpdate = true;
}

/** 2D 레이아웃(render2d·lyt)용 그림: 압축본이면 크기 + 텍스처 원본 */
export interface KtxImage {
  readonly width: number;
  readonly height: number;
  readonly ktx: THREE.Texture;
}
export type UiImage = HTMLImageElement | KtxImage;

export function isKtxImage(x: unknown): x is KtxImage {
  return !!x && typeof x === 'object' && 'ktx' in x;
}

export async function loadUiImage(url: string): Promise<UiImage> {
  const k = await ktx2UrlFor(url);
  if (k) {
    const t = await ktx2Loader().loadAsync(k);
    const img = t.image as { width: number; height: number };
    return { width: img.width, height: img.height, ktx: t };
  }
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => bad(new Error(`그림을 읽지 못했다: ${url}`));
    img.src = url;
  });
}

/** 그림 → 새 텍스처(KTX2 면 같은 GPU 데이터를 나눠 쓰는 복제). 감김·필터는 부른 쪽이 정한다 */
export function textureFromImage(img: UiImage | HTMLCanvasElement | ImageBitmap): THREE.Texture {
  return isKtxImage(img) ? img.ktx.clone() : new THREE.Texture(img);
}

/** Opus(ogg) 를 decodeAudioData 로 풀 수 있는지 — 20 ms 무음 파일로 실제 디코드해 본다 */
const OPUS_PROBE =
  'T2dnUwACAAAAAAAAAAAAAAAAAAAAAAIotXIBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAAAAAAAABAAAASZW+VAEuT3B1c1RhZ3MGAAAAZmZtcGVnAQAAABQAAABlbmNvZGVyPUxhdmMgbGlib3B1c09nZ1MABPgEAAAAAAAAAAAAAAIAAADbWnPVAgcGCAvmOyOrYAgIrLMOxg==';
export function opusSupported(): Promise<boolean> {
  opusP ??= (async () => {
    try {
      const Ctx = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext ?? (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      if (!Ctx) return false;
      const bin = Uint8Array.from(atob(OPUS_PROBE), (c) => c.charCodeAt(0));
      const ctx = new Ctx(1, 1, 48000);
      const buf = await Promise.race([ctx.decodeAudioData(bin.buffer), new Promise<null>((r) => setTimeout(() => r(null), 2000))]);
      return !!buf && buf.length > 0;
    } catch {
      return false;
    }
  })();
  return opusP;
}

/** 압축 모드에서 이 wav 의 실제 URL(.flac / .ogg / .m4a). 아니면 그대로 */
export async function audioUrlFor(url: string): Promise<string> {
  if (cfg.mode !== 'dist' || !/\.wav$/i.test(new URL(url, baseUri()).pathname)) return url;
  const rel = distRel(url);
  if (!rel) return url;
  const idx = await distIndex();
  if (idx.flac.has(rel)) return swapExt(url, /\.wav$/i, '.flac');
  if (idx.lossy.has(rel)) return swapExt(url, /\.wav$/i, (await opusSupported()) ? '.ogg' : '.m4a');
  return url;
}

/**
 * 압축 모드에서 전역 fetch 가 .wav 요청을 압축본(.ogg|.m4a|.flac)으로 바꿔 읽게 한다. 소리를 fetch → decodeAudioData 로 읽는 곳이
 * 페이지마다 따로 있어(charselect_page·plaza_page·view/audio 등) 한 곳에서 바꾸려는 것 [설계]. 압축본 루트 밖·다른 확장자는 그대로 통과.
 */
export function installFetchShim(): void {
  if (cfg.mode !== 'dist' || rawFetch || typeof globalThis.fetch !== 'function') return;
  const orig = globalThis.fetch.bind(globalThis);
  rawFetch = orig;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (/\.wav(\?|#|$)/i.test(url)) return orig(await audioUrlFor(url), init);
    return orig(input, init);
  }) as typeof fetch;
}
