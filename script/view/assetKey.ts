/**
 * URL → 로더 관리자 논리 키(web/assets 기준 소스 경로). 상대 URL 은 페이지 기준으로 푼다(에셋 루트 기준으로 풀면 assets/assets/… 가 된다).
 * 해시 이름(.xxxxxxxx.확장자)은 떼고, 압축본 .ktx2 는 소스 .png 키로. 루트 밖이면 null. 설계: docs/engine/loader_manager.md §11·§13.
 */
export function assetKeyFrom(url: string, pageBase: string, root: string): string | null {
  const u = new URL(url, pageBase);
  const href = u.origin + u.pathname;
  if (!href.startsWith(root)) return null;
  return decodeURIComponent(href.slice(root.length))
    .replace(/\.[0-9a-f]{8}(\.[^./]+)$/, '$1')
    .replace(/\.ktx2$/i, '.png');
}
