/**
 * 공용 글꼴 시트 저장소(앱에 하나) — 원본 시트 그림(관리자 uiimage 키 하나 = 'font/<FFNT>/<n>.png')과 THREE 텍스처를 URL 마다 하나만 둔다.
 * 커버리지 시트(회색조 PNG)는 R8(RedFormat)로 올리고 userData.red = true — 셰이더가 R 을 커버리지로 읽는다. 컬러 시트(extension)는 RGBA.
 * 렌더러 문맥마다 업로드는 한 번(three 가 텍스처별로 관리). 설계: docs/engine/font_assets.md §5.4·5.5.
 */
import * as THREE from 'three';
import { assetHooks, type UiImageLike } from './assetHooks';
import { resolveFonts, type FontJson } from './fontTable';

const pending = new Map<string, Promise<UiImageLike>>();
const ready = new Map<string, UiImageLike>();
const failed = new Set<string>();
const textures = new Map<string, THREE.Texture>();

export const fontJson: FontJson = <T>(url: string): Promise<T> =>
  (assetHooks.broker?.get(url, 'json', 0) as Promise<T> | null) ??
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`글꼴 표를 읽지 못했다 ${url} (${r.status})`);
    return r.json() as Promise<T>;
  });

export function loadSheet(url: string): Promise<UiImageLike> {
  let p = pending.get(url);
  if (!p) {
    p = assetHooks.loadUiImage(url);
    pending.set(url, p);
    p.then(
      (img) => void ready.set(url, img),
      () => {
        failed.add(url);
        console.warn(`글꼴 시트를 읽지 못했다 ${url}`);
      },
    );
  }
  return p;
}

export function sheetTexture(url: string, rgba: boolean): THREE.Texture | null {
  const t = textures.get(url);
  if (t) return t;
  const img = ready.get(url);
  if (!img) {
    if (!failed.has(url)) void loadSheet(url).catch(() => undefined);
    return null;
  }
  const k = img as UiImageLike & { ktx?: THREE.Texture };
  const tex = k.ktx ? k.ktx.clone() : new THREE.Texture(img as HTMLImageElement);
  if (!k.ktx && !rgba) tex.format = THREE.RedFormat;
  tex.userData.red = !k.ktx && !rgba;
  tex.userData.srgb = false;
  tex.flipY = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  textures.set(url, tex);
  return tex;
}

export async function resolveSpecFonts(fonts: Record<string, unknown>, url: (p: string) => string): Promise<void> {
  const sheets = await resolveFonts(fonts, url, fontJson);
  await Promise.all(sheets.map((s) => loadSheet(s).catch(() => undefined)));
}
