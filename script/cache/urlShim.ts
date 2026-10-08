/**
 * 해시 이름 URL shim — 전역 fetch(문자열·URL·Request)와 HTMLImageElement.src 설정자를 resolve(url) 로 바꿔 보낸다.
 * 페이지·three 로더(FileLoader·ImageBitmapLoader 의 fetch, ImageLoader·new Image() 의 img.src)가 논리 이름(해시 없음)을 그대로 써도
 * 배포본의 해시 이름을 받게 하려는 것. resolve 는 동기·멱등(모르는 URL 은 그대로)이어야 한다. 설계: docs/engine/loader_manager.md §5.8.3.
 * import 0 — 다른 게임(ddalkkakrider 등)에도 그대로 쓴다.
 */
let installed = false;

export function installUrlShim(resolve: (url: string) => string): void {
  if (installed) return;
  installed = true;
  if (typeof globalThis.fetch === 'function') {
    const orig = globalThis.fetch.bind(globalThis);
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' || input instanceof URL) {
        const from = typeof input === 'string' ? input : input.href;
        const to = resolve(from);
        return orig(to === from ? input : to, init);
      }
      const to = resolve(input.url);
      return orig(to === input.url ? input : new Request(to, input), init);
    }) as typeof fetch;
  }
  if (typeof HTMLImageElement !== 'undefined') {
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    const set = d?.set;
    if (d && set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: d.enumerable,
        get: d.get,
        set(this: HTMLImageElement, v: string) {
          set.call(this, resolve(String(v)));
        },
      });
    }
  }
}
