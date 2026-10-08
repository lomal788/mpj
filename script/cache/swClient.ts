/**
 * 서비스 워커 등록·해제 — 배포 모드면 페이지 load 뒤 등록(첫 실행 대역폭과 겹치지 않게), 아니면(개발 서버·?assets=src) 있던 등록을 해제한다.
 * 서비스 워커가 없거나 막힌 환경(http, 시크릿·개인 정보 모드, 저장소 차단)에서는 아무것도 하지 않는다 — 페이지는 HTTP 캐시만으로 동작.
 * 첫 실행은 워커가 페이지를 잡기 전에 받은 파일(번들·첫 에셋)이 Cache Storage 에 없으므로, 잡은 뒤(controllerchange)와 15 s 뒤에 받은 URL 목록을
 * 워커에 넘겨 HTTP 캐시에서 옮겨 담게 한다(다시 받지 않음 — 워커가 force-cache 로 읽음).
 * 워커 본체는 script/cache/sw.js(배포 빌드가 dist/sw.js 로 복사). 설계: docs/engine/loader_manager.md §5.8.6. import 0.
 */
export function syncServiceWorker(enable: boolean, url: string): void {
  let sw: ServiceWorkerContainer | undefined;
  try {
    sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  } catch {
    return;
  }
  if (!sw) return;
  const c = sw;
  if (!enable) {
    c.getRegistrations()
      .then((rs) => Promise.all(rs.map((r) => r.unregister())))
      .catch(() => undefined);
    return;
  }
  const handoff = (): void => {
    try {
      c.controller?.postMessage({ type: 'cache-urls', urls: performance.getEntriesByType('resource').map((e) => e.name) });
    } catch {
      /* 넘기기 실패 — HTTP 캐시가 대신 */
    }
  };
  const register = (): void => {
    if (!c.controller) {
      c.addEventListener('controllerchange', handoff, { once: true });
      setTimeout(handoff, 15000);
    }
    c.register(url).catch((e: unknown) => console.warn('서비스 워커를 등록하지 못했다 — HTTP 캐시만 쓴다', e));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
