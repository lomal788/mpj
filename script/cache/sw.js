/*
 * 서비스 워커 — 내용 해시 이름 파일은 cache-first(Cache Storage, 한 번 받으면 다시 안 받음), 페이지 이동(html)·매니페스트(index.json)는
 * network-first(늘 재검증, 끊기면 캐시). 그 밖의 요청(API·socket.io·vendor·소스 에셋)은 손대지 않는다.
 * 새 매니페스트를 받을 때마다 거기 없는 옛 해시 파일을 캐시에서 지운다. 저장소가 막혀도(시크릿 모드 등) 네트워크 응답을 그대로 돌려준다.
 * 메시지 { type: 'cache-urls', urls }: 워커가 페이지를 잡기 전에 받은 해시 파일을 HTTP 캐시에서(force-cache) 옮겨 담는다(swClient.ts 가 보냄).
 * 독립 파일(프로젝트 import 0, 빌드 없이 그대로 복사) — 다른 게임은 아래 상수 넷만 바꿔 쓴다. 설계: docs/engine/loader_manager.md §5.8.6·§5.8.7.
 */
const CACHE = 'mpj-cache-v1';
const CACHE_PREFIX = 'mpj-cache-';
const MANIFEST = 'assets-dist/index.json';
const HASHED = /\.[0-9a-f]{8}\.[a-z0-9]+$|\.[A-Z2-7]{8}\.(js|css)(\.map)?$/;
/** 매니페스트 → 지금 배포의 해시 URL(워커 범위 기준 상대). 배포 매니페스트가 아니면 null(정리 안 함) */
function liveUrls(m) {
  if (!m || !Array.isArray(m.bundle) || !m.names) return null;
  return [...Object.values(m.names).map((n) => `assets-dist/${n}`), ...m.bundle];
}

const scope = new URL(self.registration.scope);
const manifestHref = new URL(MANIFEST, scope).href;

async function openCache() {
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

function store(cache, key, res) {
  if (!cache || !res.ok || res.status !== 200 || res.type !== 'basic' || res.redirected) return Promise.resolve();
  return cache.put(key, res.clone()).catch(() => undefined);
}

async function cacheFirst(req) {
  const key = req.url.split('#')[0];
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(key, { ignoreVary: true });
      if (hit) return hit;
    } catch {
      /* 저장소 오류 — 네트워크로 */
    }
  }
  const res = await fetch(req);
  store(cache, key, res);
  return res;
}

async function networkFirst(req) {
  const key = req.url.split('#')[0];
  const cache = await openCache();
  try {
    const res = await fetch(req);
    store(cache, key, res);
    return res;
  } catch (err) {
    if (cache) {
      try {
        const hit = (await cache.match(key, { ignoreVary: true })) ?? (await cache.match(key, { ignoreVary: true, ignoreSearch: true }));
        if (hit) return hit;
      } catch {
        /* 저장소 오류 */
      }
    }
    throw err;
  }
}

async function prune(res) {
  try {
    const live = liveUrls(await res.json());
    if (!live) return;
    const keep = new Set(live.map((u) => new URL(u, scope).href));
    const cache = await openCache();
    if (!cache) return;
    for (const r of await cache.keys()) {
      const u = new URL(r.url);
      if (HASHED.test(u.pathname) && !keep.has(u.origin + u.pathname)) await cache.delete(r);
    }
  } catch {
    /* 정리 실패는 무시 — 다음 매니페스트 때 다시 */
  }
}

async function adopt(urls) {
  const cache = await openCache();
  if (!cache) return;
  for (const raw of urls) {
    try {
      const u = new URL(raw);
      if (u.origin !== scope.origin || !u.pathname.startsWith(scope.pathname) || !HASHED.test(u.pathname)) continue;
      const key = u.href.split('#')[0];
      if (await cache.match(key, { ignoreVary: true })) continue;
      await store(cache, key, await fetch(key, { cache: 'force-cache' }));
    } catch {
      /* 하나 실패는 건너뜀 */
    }
  }
}

self.addEventListener('message', (e) => {
  const d = e.data;
  if (d && d.type === 'cache-urls' && Array.isArray(d.urls)) e.waitUntil(adopt(d.urls));
});

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      try {
        for (const k of await caches.keys()) if (k.startsWith(CACHE_PREFIX) && k !== CACHE) await caches.delete(k);
      } catch {
        /* 저장소 없음 */
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const u = new URL(req.url);
  if (u.origin !== scope.origin || !u.pathname.startsWith(scope.pathname)) return;
  if (HASHED.test(u.pathname)) {
    e.respondWith(cacheFirst(req));
    return;
  }
  const isManifest = u.origin + u.pathname === manifestHref;
  if (req.mode !== 'navigate' && !isManifest) return;
  if (!isManifest) {
    e.respondWith(networkFirst(req));
    return;
  }
  let pruned = () => undefined;
  e.waitUntil(new Promise((r) => (pruned = r)));
  e.respondWith(
    networkFirst(req).then(
      (res) => {
        if (res.ok) prune(res.clone()).finally(pruned);
        else pruned();
        return res;
      },
      (err) => {
        pruned();
        throw err;
      },
    ),
  );
});
