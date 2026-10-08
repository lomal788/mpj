# 공용 로더 관리자 — ddalkkakrider 적용 가능성 검토

2026-10-08. 상태: **검토 문서(구현·수정 없음)**. 대상 = `E:/programming/python/ddalkkakrider_work/web`(이 세션에서는 읽기 전용 참고). 설계 본문은 [loader_manager.md](loader_manager.md)(mpj). 아래 경로는 ddalkkakrider `web/` 기준이다. 실측 수치의 출처는 그쪽 문서 `games/ddalkkakrider/docs/development/자산_전송_최적화_분석.md`(이하 "전송 분석")다.

---

## 1. 결론

**적용할 가치가 있다. 다만 mpj 와 같은 모양으로 통째로 가져갈 것이 아니라, 필요한 부분만 골라서 가져간다.**

| mpj 관리자 기능 | ddalkkakrider 에 | 이유 |
|---|---|---|
| URL 키 공용 캐시·중복 제거(JSON·텍스처·소리) | **가져감 — 효과 큼** | 같은 파일을 사람마다·판마다·화면마다 다시 받는 곳이 많다(§2.2) |
| 동시 받기(차례 대기 제거)·선요청 | **가져감 — 효과 큼** | 텍스처·이펙트가 차례 대기. 전송 분석 1순위 권고(−1.5~2.5 s)인데 아직 미적용 |
| 미리 받기(prefetch) + 준비 끝에만 보이기 | **가져감** | 원격 카트·이펙트·이름표·완주 배너·시상대가 워밍업 범위 밖 → 주행 중 셰이더 링크(최악 76 ms, 미해결) 후보 |
| 수명 관리(참조 수·예산·LRU) | **가져감** | 텍스처 캐시는 비우는 일이 없어 멀티에서 맵이 바뀔 때마다 쌓이고, 소리는 반대로 판마다 다 버리고 다시 받는다 |
| 프레임 예산 스케줄러(업로드·컴파일) | 대부분 **이미 있음** | `render-preparation.js prepareScene` 이 텍스처 8개씩·메시 32개씩 나눠 올리고 rAF 양보. 주행 중 스트리밍이 없으므로 "로딩 뒤 늦게 들어오는 것"에만 쓰면 됨 |
| 우선순위 등급(P0~P3) | **작게** | 트랙 하나를 통째로 받는 구조라 광장 같은 단계 로딩 이득이 적다. 로비 대기 중 "다음 판 맵 미리 받기"(P2) 정도 |
| KTX2 | **안 함(그쪽 결정 유지)** | 텍스처가 128~256 px PNG 라 이득이 작다고 그쪽 문서 §3.3·§8 에서 결정. mpj 와 상황이 다르다 |
| 서비스 워커·Cache Storage | **그쪽 결정은 "HTTP 캐시로 충분"** — 단 아래 전제가 빠져 있음 | 지금 서버가 `no-cache` + ETag 없음이라 HTTP 캐시가 사실상 동작하지 않는다(재방문에도 25 MB 다시 받음). 먼저 해시 이름 + immutable 을 하면 SW 없이도 대부분 해결 |
| 앱 하나의 렌더러 | **부분** | 문맥 3개(로비 미리보기·방 미리보기·게임). 방 미리보기 렌더러가 게임 중에도 살아 있다 → 게임 시작 때 놓기만 해도 이득 |

---

## 2. 근거 (코드·실측)

### 2.1 시간 [실측: 전송 분석 §11.1, 로컬 RTX 4060, abyss_R02 첫 로딩 6.38 s]

| 구간 | 시간 | 관리자로 줄일 수 있는 것 |
|---|---|---|
| 맵 JSON(서버가 요청 때 다시 직렬화 + gzip) | 1.46 s | 관리자 밖(서버 사전 압축 `.gz` — 그쪽 `map_json_gz_전환.md` 설계 있음) |
| 텍스처 차례 대기 | 1.18 s | **동시 받기** — `main.js:366` `buildAsset` 메시 루프 안 `await texture(url)` |
| 이펙트 | 1.98 s | **동시 받기 + 공용 캐시** — `effects.js:86` 모델 `for … await fetch`, `:110` 텍스처 루프 안 await |
| 셰이더·GPU 준비 | 1.1 s | 이미 `prepareScene` (유지) |
| 캐시 뒤에도 | 5.5 s | `no-cache` 재검증이 차례로 일어남 → 해시 이름 + immutable |

### 2.2 다시 받기·중복 [코드]

| 곳 | 무엇 |
|---|---|
| `main.js originalDriver`(439~) | `character.json`, 공통 `bazzi/animations.json`(1.8 MB), 캐릭터별 `animations.json` 을 그냥 `fetch` — 메모리 캐시 없음 |
| `effects.js:58–130 createDrivingEffects` | 캐시 Map·TextureLoader 를 **부를 때마다 새로** 만들고, 원격 라이더마다 불림(`main.js:2269`) → 같은 이펙트 JSON·텍스처를 사람 수만큼 받고 GPU 에도 사람 수만큼 올림 |
| `lobby/rider-preview.js` vs `main.js` | 방 미리보기가 받은 `kart.json`·`character.json`·`animations.json`·PNG 를 레이스 준비 때 다시 받음(캐시 둘이 따로) |
| `net/client.js:594` | 원격 카트를 prepare 마다 `clearRemotes()` 후 다시 만들며 JSON 다시 받음 |
| `main.js:1905–1916` | 맵·카트가 바뀌면 `audioContext.close()` 후 모든 소리 버퍼 버림 → 다음 판 다시 받고 다시 디코드 |
| `main.js:224–256 textureCache` | 반대로 **절대 안 비움** → 멀티 세션에서 맵이 바뀔 때마다 GPU·CPU 에 쌓임(누수 성격) |
| `main.js:2109`, `client.js:129` | 나가기·방 나가기 = 페이지 전체 새로 열기 → 메모리 캐시 전부 사라짐(HTTP 캐시도 `no-cache` 라 재검증) |

### 2.3 워밍업 밖에서 늦게 들어오는 것 [코드] — 주행 중 끊김 후보

- 원격 카트·캐릭터·이펙트·이름표 `SpriteMaterial`(`main.js:2254–2294`) — `prepareScene` 뒤(`client.js:642`)에 읽혀 워밍업을 안 거침.
- 완주 배너(`finish-banner.js:86`, `preload` 함수는 있으나 호출 없음 `:96`), 역주행 배너, 백미러 장면(`back-mirror-hud.js:133`), 시상대(`main.js:672~`, 완주 순간 JSON·텍스처 받기).
- 그쪽 문서(`캐릭터_스키닝_원본처리와_멀티_렉.md` §2·§5)의 미해결 "레이스 중 새로 링크된 셰이더 5개, 최악 76 ms"가 이 중 무엇인지는 [추정] — 관리자의 "준비 끝에만 보이기 + 미리 받기"로 넣으면 원인과 무관하게 함께 사라진다.

### 2.4 이미 잘 돼 있는 것 (그대로 둠)

- URL 키 Promise 텍스처 캐시, 샘플러별 `url#sampler` 복제로 이미지 공유.
- `prepareScene`(청크 업로드·`compileAsync`·rAF 양보·`gl.finish`), 정적 맵 배칭, 지면 테이블 미리 올리기, `customProgramCacheKey`.
- 멀티 진행률 게이지 + 전원 ready 장벽(`room.mjs` `arm()`, 60 s 시간 초과).
- 핫루프 안 fetch·로더·BufferGeometry·JSON 사용을 막는 시험(`tests/cpu-performance.test.mjs:83–92`).
- 스키드마크 풀·scratch 들.

---

## 3. 가져갈 때 ddalkkakrider 만의 제약

| 제약 | 내용 | 대응 |
|---|---|---|
| 번들 이중 평가 | 프로덕션은 로비·게임 번들이 따로라 모듈 싱글턴이 둘로 갈라진다(three 도 두 벌). 개발 모드는 하나 — 개발과 프로덕션 동작이 달라짐 | 공용 캐시는 기존 관례대로 `globalThis.__kart…` 에 둔다. **문맥과 무관한 데이터만**(JSON 객체·ArrayBuffer·Blob/ImageBitmap·AudioBuffer). `THREE.Texture`·GPU 자원은 담지 않는다 |
| 공유 JSON 변형 | `main.js` 가 받은 배열을 축 변환해 씀 | 캐시는 읽기 전용 원본, 쓰는 쪽이 복사(`rider-preview.js:79` 처럼 `structuredClone`) 또는 변환 결과를 별도 키로 캐시 |
| 프로덕션 AST 훅 | `bundle.mjs:84–110` 이 특정 패턴이 "정확히 1개"이길 요구, 문자열 난독화 | 구조 변경 뒤 프로덕션 빌드 + 헤드리스로 확인(그쪽 메모: 로비·방 흐름 변경은 `launch.mjs --prod` + playwright 로 검증) |
| 물리 비트 동일성 | 맵 데이터 f64 를 읽는 경로(전송 분석 §11.2) | 관리자는 **받는 방법만** 바꾸고 형식·숫자는 손대지 않는다 |
| clone 텍스처 dispose | `url#sampler` 복제가 같은 이미지 source 공유 | 참조 수를 source 단위로, 마지막 복제가 놓일 때만 해제 |
| 서버 맵 읽기 | 레이스마다 `world.mjs:27–28` `readFileSync` + `JSON.parse`, 캐시 없음 | 관리자 밖이지만 같은 원칙(맵 키 캐시) 적용 가능 |

---

## 4. 적용 순서 제안 (그쪽 작업으로 할 때)

| 순서 | 내용 | 기대 |
|---|---|---|
| 1 | 맵 텍스처 URL 먼저 모아 동시 요청, 이펙트 모델·텍스처 `Promise.all` | 전송 분석 기준 −1.5~2.5 s(첫 로딩 6.4 s 중) |
| 2 | 공용 JSON·소리 캐시(globalThis) — 캐릭터·카트·애니·이펙트·방 미리보기 공유, 소리 버퍼 판 사이 유지 | 판 사이·원격 라이더 중복 받기 제거, 멀티 prepare 단축 |
| 3 | 이펙트 텍스처를 라이더 사이 공유(같은 `Texture`) | GPU 업로드·메모리 사람 수 배 → 1배 |
| 4 | 원격 카트·이름표·배너·백미러·시상대를 `prepareScene` 범위로(미리 받기 + 준비 끝에만 보이기) | 주행 중 셰이더 링크 끊김 후보 제거 |
| 5 | 텍스처 캐시 참조 수·예산(맵 바뀔 때 안 쓰는 것 해제) | 멀티 장시간 메모리 증가 차단 |
| 6 | 서버: 해시 이름 + `immutable`, ETag, 맵 JSON `.gz` 사전 압축 | 재방문 25 MB → ≈ 0, 맵 JSON 1.46 s 단축 |
| 7 | 방 미리보기 렌더러를 게임 시작 때 놓기 | 문맥 3 → 게임 중 1 |

1·2·4 가 가장 싸고 효과가 크다. mpj 관리자를 먼저 만들면 1·2·4·5 의 코어(키 캐시·동시 받기·미리 받기·참조 수)는 **TS → JS 로 옮겨 쓸 수 있다**. 형식 처리기(KTX2·meshopt·glb)는 ddalkkakrider 에 필요 없으니 빼고, 자체 JSON 모델 조립(`buildAsset`)을 처리기로 꽂는다.

---

## 5. 공용화 가능성 (두 프로젝트에 같은 코어)

| 층 | 공용 가능 | 비고 |
|---|---|---|
| 키 캐시·Promise 공유·동시 받기 큐·우선순위·참조 수·통계 | 예 | 엔진·형식 무관. three 도 필요 없음 |
| 프레임 예산 스케줄러 | 예(three 의존) | ddalkkakrider 는 `prepareScene` 이 이미 그 역할 — 늦게 들어오는 것만 스케줄러로 |
| 형식 처리기 | 아니오 | mpj = glb·KTX2·Opus, ddalkkakrider = 자체 JSON·PNG·ogg |
| 흐름 예측 표 | 아니오(데이터만 다름) | mpj = 셸 화면 흐름, ddalkkakrider = 로비 → 방 → 판(다음 맵 미리 받기) |
| 해시 이름·서버 캐시 헤더 | 원칙 공용 | 서버 구현이 다름(mpj = express, ddalkkakrider = 자체 http 핸들러) |

코어를 형식·엔진과 무관한 작은 모듈로 만들면 그쪽 문서 `docs/파티_미니게임_모음_분석.md:251` 에 계획으로만 있는 `AssetLoader` 인터페이스(파티 미니게임 묶음)와도 그대로 맞는다.

---

## 6. 사용자 확인 필요

1. ddalkkakrider 쪽 문서 §8 의 "SW·IndexedDB 안 함, HTTP 캐시로 충분" 결정은 유지하되, 그 전제(해시 이름 + immutable)가 아직 미적용이라는 점을 먼저 해결할지.
2. 공용 코어를 별도 패키지로 둘지(두 저장소가 같은 파일을 씀), 각자 복사할지.
3. 이 문서를 ddalkkakrider 저장소 안 문서로도 옮길지(이번에는 읽기 전용 규칙 때문에 mpj 쪽에만 둠).
