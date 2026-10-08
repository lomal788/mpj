# 공용 로더 관리자 — 우선순위·공용 캐시·프레임 예산·미리 받기

2026-10-08. 상태: **1·2·3단계 구현(§11 구현 설계, §12 구현 결과·실측)**, **5단계(흐름 예측·캐릭터 선택 커서 우선) 구현(§13)**, 4단계는 **광장만 구현(§14)**, 7단계 설계만, 6단계는 [loader-6] 담당. 압축 형식·소스/배포 분리는 [assets_pipeline.md](assets_pipeline.md), 입력은 [input_web.md](input_web.md). 표기: [실측] 이 저장소에서 잰 값, [코드] 현재 코드 확인, [추정] 계산·경험치, [설계] 웹 결정, **사용자 확인 필요** = 기본값을 정해 두고 진행할 곳.

---

## 1. 목표 (사용자 요구)

1. **처음 실행할 때 한 번만 로드**하고(그것도 로드로 느끼지 않게), 그 뒤에는 로딩 화면·로딩 문구를 보여 주지 않는다.
2. 압축은 최대로(화질 기준 안에서 — assets_pipeline.md).
3. 광장 진입은 **처음 보이는 것부터** 받고 나머지는 뒤에서(lazy).
4. **한 번 읽은 것은 계속 들고 있고**, 다시 받거나 다시 만드는 일을 최소화한다.
5. 매 프레임 배열·객체를 새로 만들지 않고 재사용한다.

이 문서는 1·3·4 를 맡는 **공용 로더 관리자**(이하 "관리자")를 정한다. 5 는 관리자 자체의 규칙(§5.7)과 별도 정리 작업(§9 6단계)으로 나눈다.

---

## 2. 왜 해야 하나 — 이득·장점

### 2.1 지금 사용자가 겪는 것 [실측·코드]

| 증상 | 원인(현재 코드) |
|---|---|
| 광장 들어갈 때 "광장 읽는 중 n/total" 문구와 대기(헤드리스 준비 12~14 s, 압축 전 89 MB / 후 61 MB) | 광장의 모든 모델을 **첫 화면 전에 전부** 받는다(`plaza/world.ts load()`) — 첫 화면에 안 보이는 장식까지 |
| 같은 대기에서 받기가 느림 | 모델을 **한 개씩 차례로** 받는다(`for (const e of list) await this.ensure(e.key)`) — 동시 요청 없음. 네트워크 지연(RTT)이 모델 수만큼 쌓인다 |
| 캐릭터 선택 진입 52~97 MB | 잠기지 않은 **22명 전부**를 커서 거리순으로 미리 받는다(`screen.ts prefetch` → `preview3d.prefetch`). 순서는 좋지만 범위가 전부 |
| 처음 움직일 때·새 것이 나올 때 끊김(사용자 지적, 이전에 warmup 으로 완화) | 셰이더 컴파일·텍스처 GPU 업로드가 그리는 순간 일어남. 지금 `stage.warmup()` 은 장면 전체를 **한 번에** 컴파일·업로드(로딩 끝에 큰 덩어리) |
| 화면을 오갈 때마다 다시 읽음 | 화면(페이지)마다 **캔버스·WebGLRenderer 를 새로 만들고** 나갈 때 dispose(`*_page.ts` 10곳, `WebGLRenderer(` 생성 7곳). WebGL 문맥이 바뀌면 텍스처·버퍼·셰이더 프로그램을 **모두 다시 올리고 다시 컴파일**해야 한다 |
| 같은 캐릭터를 여러 번 읽음 | 캐시가 인스턴스마다 따로다: `Stage3D.gltfs`(무대별), `Preview3D.preps`(캐릭터 선택·광장 플레이어·광장 NPC 가 각자 `Preview3D`) → 캐릭터 선택에서 읽은 마리오를 광장이 다시 파싱·업로드 |
| 광장에 WebGL 문맥 2개 | 무대(`stage.ts`) + 2D UI 오버레이(`plaza/ui/view.ts` 투명 렌더러). 문맥끼리는 텍스처를 나눠 쓸 수 없고, 모바일은 문맥 수·메모리 한도가 낮다 |
| 소리 | 페이지마다 fetch → `decodeAudioData`(15곳). 디코드 결과(AudioBuffer)를 화면 사이에 나누지 않는다 |
| 두 번째 실행 | 서비스 워커·Cache Storage 없음, 파일 이름에 해시 없음(`no-cache` + ETag 재검증, assets_pipeline §7) → 다시 실행해도 파일마다 서버 왕복 |

### 2.2 관리자가 생기면

| 이득 | 내용 | 크기 |
|---|---|---|
| **로딩 화면 제거** | 다음 화면을 지금 화면에서 미리 받고(흐름이 거의 정해져 있음, §5.5), 원본 연출(페이드·기구 출발 컷·메시지)이 이미 주는 시간 안에 끝낸다 | 화면 전환 대기 0 이 목표 |
| **광장 첫 화면까지 시간 단축** | 첫 카메라에 보이는 것 + 충돌 + 내 캐릭터만 막고 나머지는 뒤에서 | 첫 화면 몫이 전체의 몇 %인지는 §6 도구로 잰다 [추정: 30~50%] |
| **동시 받기** | 차례 받기 → 동시 6~8개(HTTP/2 면 더) | 모델 수 × RTT 만큼 단축 [추정: 광장 모델 수십 개 × 수십 ms] |
| **다시 들어갈 때 즉시** | 한 렌더러·한 캐시를 앱 전체가 쓰면 이미 올린 텍스처·컴파일한 셰이더가 그대로 남는다 | 재진입 대기 ≈ 0 |
| **캐릭터 공용** | 캐릭터 선택에서 읽은 캐릭터를 광장·미니게임이 그대로 씀 | 캐릭터당 약 2.4 MB(52 MB / 22명)·파싱·업로드 1회 |
| **끊김 제거** | 업로드·컴파일을 프레임 예산 안에서 나눠 하고, 준비가 끝난 것만 장면에 넣음 | 사용자 지적 "이동할 때 렉" 계열 원천 차단 |
| **모바일 안정** | GPU 메모리 예산 + 오래 안 쓴 화면부터 내림(압축본은 메모리에 남아 다시 올리기만) | 탭 강제 종료 방지 |
| **두 번째 실행 거의 0** | 해시 이름 + Cache Storage → 서버 왕복 없음 | 재방문 네트워크 ≈ 0 |
| **개발 편의** | 한 곳에서 무엇을·언제·얼마나 읽었는지 통계 → 개발 페이지 패널, 헤드리스 시험의 수치 | — |
| **다른 게임·플랫폼 재사용** | 셸·게임 코드는 "이 키가 필요하다"만 말하고 방법은 관리자가 결정 → ddalkkakrider 등으로 이식 쉬움([loader_manager_ddalkkakrider.md](loader_manager_ddalkkakrider.md)) | — |

### 2.3 원본 동일성과의 관계

- 바뀌는 것은 **받는 순서·시점**뿐이다. 다 읽힌 뒤의 화면은 지금과 같다. 원본에 없는 LOD·대체 그림(흐릿한 미리보기 등)은 쓰지 않는다 [설계].
- 원본도 장면 전환을 페이드·컷 뒤에서 처리한다(구체적인 원본 로딩 방식은 판독하지 않았다 [미확정]). 웹은 그 연출 시간을 미리 받기 창으로 쓴다.
- 준비가 늦으면(느린 망) 로딩 화면 대신 **원본 연출의 마지막 상태(페이드 아웃 화면)를 조금 더 유지**한다 — 원본에 있는 화면이라 이질감이 가장 적다. **사용자 확인 필요**.

### 2.4 하지 않으면

화면을 늘릴 때마다(미니게임 추가, 항구 재개) 각자 로딩·캐시·워밍업을 다시 만들게 되고, 같은 문제(로딩 문구, 끊김, 다시 받기, 모바일 메모리)가 화면 수만큼 반복된다. 지금은 화면이 10개 남짓이라 바꾸는 비용이 가장 낮은 시점이다.

---

## 3. 현재 코드 상세 [코드]

| 위치 | 하는 일 | 관리자로 옮길 것 |
|---|---|---|
| `shell/stage3d/assetLoader.ts` | 압축/소스 모드, `createGltfLoader`(meshopt·KTX2), `loadTexture`/`loadTextureInto`, `loadUiImage`/`textureFromImage`, `audioUrlFor`·`installFetchShim`, 통계 `assetStats` | **관리자의 "형식 처리기"로 그대로 쓴다**(디코드 방법은 여기, 언제·얼마나는 관리자) |
| `stage3d/stage.ts loadModel` | `gltfs: Map<url, Promise<GLTF>>` 무대 안 캐시, 두 번째부터 `cloneSkinned` | 캐시를 관리자로(무대 밖 공용), 복제는 그대로 |
| `stage3d/stage.ts warmup` | 숨김 해제 + 전체 `compileAsync` + 전체 `initTexture` | 항목별 준비(§5.4)로 쪼갬. 첫 화면 몫만 막음 |
| `plaza/world.ts load/ensure` | 충돌 json → 필요한 모델 **차례로** `ensure`(부착 소켓·기본 애니), `loading: Map<key, Promise>` 로 중복 방지 | `ensure` 는 그대로, 호출을 우선순위 묶음으로(§6) |
| `charselect/preview3d.ts` | `preps: Map<pc, Prep>`, `prefetch(order)`(동시 수 제한 있음), glb·모션·눈 텍스처 `Promise.all` | 캐시를 관리자로(인스턴스 공용), `prefetch` 는 관리자 우선순위로 |
| `plaza/player.ts`·`npc.ts` | 각자 `Preview3D` 만들고 `prefetch([idx])` | 같은 공용 캐시 사용 |
| `*_page.ts`(10개) | 화면마다 캔버스·렌더러 생성·폐기, 소리 fetch·decode | **앱 하나의 렌더러**를 받아 씀(§5.6) |
| `main.ts` 흐름 | `modeselect-loading`·`plaza-loading` 단계, "광장 읽는 중 n/total" 문구 | 흐름 표(§5.5)로 미리 받기, 문구 제거 |
| `view/lyt.ts`(mg1801 HUD) | 화면 밖 캔버스에 **별도 렌더러** → drawImage | 공용 렌더러의 렌더 타깃으로(§5.6) |

이미 좋은 것: 중복 요청 방지(Promise 맵), 캐릭터 선택의 커서 거리순, `compileAsync`·`initTexture` 사용, 압축본 인덱스(`assets-dist/index.json`)와 빌드의 원본 해시(`build_assets.ts` sha1 — 증분용, 파일 이름에는 아직 안 붙음).

---

## 4. 요구 사항 정리

| 번호 | 요구 |
|---|---|
| R1 | 같은 리소스(URL 키)는 앱 전체에서 **한 번만** 받고·풀고·올린다 |
| R2 | 요청마다 **우선순위**, 나중에 올릴 수 있음(미리 받던 것을 지금 필요하면 맨 앞으로) |
| R3 | 동시 받기 수 제한(망·CPU), 큐는 우선순위순 |
| R4 | GPU 업로드·셰이더 컴파일·장면 추가는 **프레임 예산** 안에서 나눔 |
| R5 | "준비 끝" = 받기 + 풀기 + 업로드 + 컴파일 완료. 장면에는 준비 끝난 것만 보인다 |
| R6 | 화면 흐름 예측 미리 받기 |
| R7 | 들고 있기: 바이트(압축본)·풀린 객체는 계속, GPU 는 예산 + 오래 안 쓴 것부터 내림(내린 것은 다시 올리기만) |
| R8 | 앱 하나의 WebGL 문맥 |
| R9 | 영구 캐시(Cache Storage) + 해시 파일 이름, 개발(src) 모드는 캐시 우회 |
| R10 | 관리자 자체는 매 프레임 할당 0 |
| R11 | 통계(개발 페이지·시험) |
| R12 | 셸 경계 유지: 셸은 관리자 **인터페이스**만 받는다. 정정(구현): 관리자 코어는 stage3d 가 아니라 **import 0 인 `script/lib/assetcore/`**, three 어댑터는 `script/lib/assetcore-three/`(three·코어만) — 두 폴더는 어디서나 import 가능(mgm_common.md §9.1 예외, §11.1) |

---

## 5. 설계 [설계]

### 5.1 층

```
요청 get(key, {kind, pri})
  │
  ├ L0 네트워크   fetch(우선순위 큐, 동시 N) ← Cache Storage(해시 이름, 영구)
  ├ L1 바이트     ArrayBuffer(압축본 그대로: ktx2·glb·opus·json) — 메모리 예산(크게), 오래 안 쓴 것부터 버림(다시 받기는 디스크 캐시라 빠름)
  ├ L2 객체       파싱된 GLTF 원본(복제용 템플릿)·KTX2 트랜스코드 결과(CompressedTexture 데이터)·AudioBuffer·json 객체
  └ L3 GPU        업로드된 텍스처·버퍼, 컴파일된 프로그램 — GPU 예산, 오래 안 쓴 것부터 dispose(L2 남김 → 다시 올리기만)
```

- 각 항목: `{ key, kind, state(queued|fetching|decoding|uploading|ready), pri, bytes, gpuBytes, lastUse, refs }`.
- 키 = 소스 경로(모드·해시와 무관한 논리 이름). 실제 URL 은 모드(src/dist)·해시 표로 바꾼다.

### 5.2 우선순위

| 등급 | 뜻 | 예 |
|---|---|---|
| P0 막음 | 이게 없으면 첫 프레임을 못 그림 | 광장: 첫 카메라에 보이는 것, 충돌, 내 캐릭터, 하늘·IBL·LUT |
| P1 곧 | 현재 화면에서 몇 초 안에 필요 | 광장: 가까운 NPC, 걸어가면 보일 장식(거리순) |
| P2 다음 화면 | 흐름 예측 | 모드 선택 중 광장 P0, 캐릭터 선택 중 커서 캐릭터 |
| P3 유휴 | 남는 시간 | 광장 먼 장식·상점 UI·소리, 나머지 캐릭터 |

- 이미 큐에 있는 항목을 높은 등급으로 다시 요청하면 **올린다**(낮추지는 않음).
- 같은 등급 안에서는 요청 순서(광장은 거리순으로 넣는다).
- P0 가 있으면 P2·P3 받기를 새로 시작하지 않는다(진행 중인 것은 둔다).

### 5.3 동시 수·CPU 일

- 받기 동시 6(HTTP/1.1)·12(HTTP/2) [추정 — 시험으로 조정].
- KTX2 트랜스코드는 이미 워커 4개(assets_pipeline §6). glb 파싱은 메인 스레드라(GLTFLoader) 한 프레임에 하나, 큰 것은 다음 프레임으로.
- 소리 `decodeAudioData` 는 브라우저가 따로 처리 — 동시 2.

### 5.4 프레임 예산 스케줄러 (끊김 방지 핵심)

- 매 프레임 렌더 뒤 `budgetMs`(PC 4 ms, 모바일 2 ms [추정 — 시험으로]) 안에서 할 일을 꺼내 처리: 텍스처 `initTexture` 1장씩, 메시 버퍼 업로드, `compileAsync` 시작(KHR_parallel_shader_compile 있으면 비동기 완료를 기다림), 준비 끝난 모델을 장면에 넣기.
- 큰 텍스처 하나가 예산보다 크면 그 프레임에는 그것만.
- 로딩 화면 동안(첫 실행)은 예산을 크게(사실상 무제한).
- **장면에 넣는 규칙**: 모델의 모든 텍스처 업로드 + 모든 재질 프로그램 컴파일이 끝난 뒤에만 `visible = true`. 그 전에는 장면 밖 또는 숨김. → 그리는 순간의 컴파일 없음.
- 같은 셰이더 조합은 한 번만 컴파일된다(three 프로그램 캐시 — 렌더러가 하나여야 효과, §5.6).

### 5.5 흐름 예측 표 (main.ts 흐름 기준)

| 지금 화면 | 미리 받을 것(P2) |
|---|---|
| 부팅(로고·타이틀 자리) | 모드 선택 전부, 공용 UI(mgmcommon), 광장 P0 |
| 모드 선택 | 광장 P0·P1(파티 쪽 커서면), 프리 플레이 목록(미니게임 쪽 커서면) |
| 플레이어 설정 | 캐릭터 선택 화면 + 1P 지난번 캐릭터 |
| 캐릭터 선택 | 커서 위 캐릭터 → 주변 칸 → (결정 뒤) 광장 플레이어 모델 |
| 광장 | 기구 쪽으로 가면 모드 메뉴, 친구 매치 앞이면 온라인 UI |
| 프리 플레이 목록 | 커서 미니게임의 설명 화면·모델 |
| 미니게임 설명 | 그 미니게임 P0 |

- 표는 데이터(json)로 두고 화면이 "지금 상태"(커서 위치 등)를 알려 주면 관리자가 P2 로 넣는다.
- 예측이 틀려도 손해는 망 사용뿐(P2 는 P0 를 막지 않음). 모바일 데이터 절약 설정(`navigator.connection.saveData`)이면 P2 는 바로 다음 화면만.

### 5.6 앱 하나의 렌더러 (R8)

- 지금은 화면마다 캔버스·렌더러를 새로 만든다. 들고 있기(R7)의 GPU 쪽은 **같은 WebGL 문맥**일 때만 의미가 있다.
- 바꿀 것: 앱이 캔버스·`WebGLRenderer` 하나를 만들어 화면에 넘긴다. 화면은 자기 `Scene`·카메라·렌더 타깃만 가진다. 2D 레이아웃(render2d)·광장 UI 오버레이·mg1801 HUD(`lyt.ts`)도 같은 렌더러로 그린다(오버레이는 같은 프레임에 3D 다음 패스로).
- 화면 나갈 때는 렌더러를 dispose 하지 않고 **자기 참조만 놓는다**(refs−1). 실제 해제는 관리자가 예산으로 결정.
- 문맥 잃음(`webglcontextlost`) 처리: L2 가 남아 있으므로 복구 때 다시 올리기만.
- 영향이 큰 변경이다(페이지 10개). 셸 모듈은 이미 `canvas` 를 받는 구조라 대부분 페이지 쪽 수정이다.

### 5.7 들고 있기와 예산 (R7)

| 층 | 예산(기본) | 넘으면 |
|---|---|---|
| L1 바이트 | PC 512 MB / 모바일 192 MB [추정] | 오래 안 쓴 것부터 버림(Cache Storage 에 있으니 다시 받기 = 디스크 읽기) |
| L2 객체 | 따로 안 둠(L3 와 짝) | — |
| L3 GPU | PC 2 GB / 모바일 `deviceMemory`≤4 면 600 MB [추정] | **지금 화면이 안 쓰는(refs 0)** 항목부터 dispose. 다음 화면 예측(P2)에 걸린 것은 마지막에 |

- "한 번 읽은 것은 계속 들고 있는다"는 PC 에서는 사실상 그대로(예산이 충분), 모바일에서는 GPU 만 예산 안에서. 원본 Switch 도 장면마다 메모리를 비운다 [추정].
- **사용자 확인 필요**: 모바일 GPU 예산 기본값, `?texlod=1` 자동 적용 조건(assets_pipeline §3.4).

### 5.8 영구 캐시·해시 (R9) — 6단계 구체 설계

요약: **내용 해시 이름 + immutable 헤더 + 서비스 워커(Cache Storage) + brotli 사전 압축 + 화면별 코드 분할**. 새 npm 의존성 없음(해시 = node `crypto`, 압축 = node `zlib`, 코드 분할 = 이미 쓰는 esbuild `splitting`, 서비스 워커 = 손으로 쓴 독립 JS 한 파일). 개발(src) 모드는 전부 끔.

#### 5.8.1 파일 이름 규칙 [설계]

| 대상 | 이름 | 만드는 곳 |
|---|---|---|
| 압축본 에셋 | 마지막 확장자 앞에 `.<내용 sha256 앞 8 hex>` — `plaza/world/tex/a.ktx2` → `plaza/world/tex/a.3f2c9a1b.ktx2`, `x.fmab.json` → `x.fmab.<h>.json` | `tools/build_assets.ts`(증분: 새로 만든 산출물만 해시를 다시 잼) |
| JS·CSS 진입점 | `bundle/main.<esbuild 해시 8자>.js`·`.css` | `tools/build.ts`(esbuild `entryNames: '[name].[hash]'`) |
| 코드 분할 청크 | `bundle/chunks/<이름>.<해시>.js` | esbuild `chunkNames` |
| 해시 없음(늘 재검증) | `index.html`·`ui.html`·`sw.js`·`assets-dist/index.json`·`vendor/basis/*`(three 트랜스코더 2개 — KTX2Loader 가 경로를 직접 만듦) | — |

- `assets-dist/` 에는 해시 없는 이름(작업본 — 증분 빌드의 비교·같은 내용 복사 원본)과 해시 이름(배포본)이 **둘 다** 있다. 해시 없는 파일은 다음 빌드가 덮어쓸 수 있어 하드 링크가 아니라 복사로 둔다(디스크 약 2배, 배포 `dist/` 에는 해시 이름만 실림). 옛 해시 파일은 `--prune`(사용자 실행) 때만 지운다.
- 해시는 **산출물 내용**으로 잰다(원본 sha1 이 아님): 인코더 설정만 바뀌어도 URL 이 바뀌어야 immutable 이 안전하다.
- glb 안의 이미지 uri(`../tex/a.ktx2`, 207/253 개가 외부 참조)는 고치지 않는다 — 런타임 URL 바꾸기(5.8.3)가 처리. 그래서 텍스처 하나가 바뀌어도 그 텍스처만 새 URL 이고 glb 는 그대로 캐시에 남는다.

#### 5.8.2 `assets-dist/index.json` v2 [설계 — loader-123 과 합의, SHARED.md]

```json
{ "v": 2,
  "ktx2": ["<소스 상대 경로 .png>", …], "lossy": ["<.wav>", …], "flac": ["<.wav>", …],
  "names": { "<압축본 상대 경로(해시 없음, 확장자 바꾼 뒤)>": "<해시 붙은 압축본 상대 경로>", … },
  "bundle": ["bundle/main.ABCD2345.js", "bundle/chunks/…", …] }
```

| 필드 | 뜻 | 누가 씀 |
|---|---|---|
| `ktx2`·`lossy`·`flac` | v1 과 같음(소스 이름 → 압축본 확장자 바꾸기) | `assetLoader.ts` `ktx2UrlFor`·`audioUrlFor` |
| `names` | 확장자를 바꾼 뒤의 압축본 이름 → 해시 이름. 표에 없으면 그대로 | `assetLoader.ts` `distUrl`(loader-123) |
| `bundle` | 배포 빌드(`build.ts`)가 `dist/assets-dist/index.json` 에만 넣는 해시 청크 목록 | 서비스 워커의 옛 캐시 정리 |
| `streams` | BGM 소스 경로(.wav) → 스트리밍 조각 배치(`planBgm` 결과). 조각 가상 경로 `<이름>.bgm/NNN.wav` 는 `lossy` 에도 들어가 위 이름 바꾸기를 그대로 탄다 | `assetLoader.ts` `distStream` → `view/bgm.ts`(04_sound.md §12) |

- 크기 [실측]: 2,496 항목 표 → index.json 309 KB(brotli 31 KB, gzip 43 KB). 재방문엔 304(바디 0).
- v1 만 아는 코드는 `names` 를 무시하므로 해시 없는 작업본 경로(개발 서버 `?assets=dist`)에서는 계속 돈다. 배포(`dist/`)에는 해시 이름만 있으므로 `names` 를 써야 한다.

#### 5.8.3 런타임 URL 바꾸기 [설계]

```
논리 URL(소스 이름, 예 ./assets-dist/plaza/a.png)
 → ktx2UrlFor / audioUrlFor (v1 규칙: .png→.ktx2, .wav→.ogg|.m4a|.flac)
 → distUrl (names: 해시 이름)          ← 동기·멱등(이미 해시 이름이거나 표에 없으면 그대로), src 모드 = 항등
 → 실제 요청
```

- **캐시 키는 해시 없는 논리 URL**(관리자 코어·형식 처리기), 네트워크 요청 직전에만 `distUrl`. 코어는 이 함수를 바깥에서 꽂는다(import 0).
- 요청 경로가 여러 갈래(페이지의 `fetch`, three FileLoader·ImageBitmapLoader 의 `fetch`, ImageLoader·`new Image()` 의 `img.src`, KTX2Loader)라 **두 곳의 얇은 shim** 이 모두 덮는다 — `script/cache/urlShim.ts`(import 0): 전역 `fetch`(문자열·URL·`Request`)와 `HTMLImageElement.prototype.src` 설정자. 페이지 코드(배경 `new Image()` 8곳 등)는 고치지 않는다.
- 설치 순서(`view/assetMode.ts`, dist 모드에서만): ① 내 shim(→ `distUrl`) ② 기존 `installFetchShim`(.wav → 압축본, 그 안의 `fetch` 가 ①을 지남) ③ **top-level await `distReady()`** — 표가 오기 전에는 어떤 페이지 코드도 돌지 않으므로 동기 `distUrl` 이 늘 표를 갖는다. index.json 자체 요청은 ①을 지나지만 표에 없어 그대로(그래서 `distUrl` 안에서 기다리면 안 됨).

#### 5.8.4 사전 압축 [실측 → 규칙]

| 확장자 | 표본 brotli 비율(q9) | 결정 |
|---|---|---|
| json | 9.0 % | `.br`·`.gz` |
| glb(meshopt) | 45.6 % | `.br`·`.gz` |
| hdr | 38.2 % | `.br`·`.gz` |
| otf·md | 56~61 % | `.br`·`.gz` |
| flac | 전체 88 %(47/65 개가 10 % 넘게 줆, 합 −0.44 MB) | 규칙대로(이득 있는 파일만) |
| ktx2 | 전체 1,285 개 219.8 MB → 219.5 MB(−0.12 MB) | **안 함**(Basis 자체 압축 — ETC1S·UASTC+zstd) |
| png·ogg·m4a | 98~99 % | **안 함** |
| js·css·html·wasm·index.json·sw.js | 배포 빌드 35개 2,244 KB → br 604 KB(27 %) | `.br`·`.gz` |

- 규칙: 위 "함" 확장자 중 **압축본이 원본의 95 % 이하이고 64 B 이상 줄 때만** 파일을 둔다(아니면 서버가 원본을 그대로). brotli 품질 11·창 24, gzip 9.
- 에셋은 `build_assets.ts` 가 해시 이름 옆에 만든다(증분 — 해시 이름이 같으면 이미 있는 `.br` 를 씀, 결정은 `build-state.json` 에 기록). 번들·html·index.json·sw.js·vendor 는 `build.ts` 가 매번 만든다(작음).
- 서버는 `Accept-Encoding` 에 `br` 가 있고 `.br` 가 있으면 그것, 아니면 `gzip` + `.gz`, 아니면 원본. 헤더 `Content-Encoding`, `Vary: Accept-Encoding`(변형 파일이 있을 때), `Content-Type` 은 **원본 확장자**로.

#### 5.8.5 캐시 헤더 [설계] (`server/static.ts` — 배포 미리보기·운영 서버 공용)

| 경로 | Cache-Control | ETag / 304 |
|---|---|---|
| 해시 이름(`.<8 hex>.<ext>`, `.<esbuild 8자>.js/css/map`) | `public, max-age=31536000, immutable` | 있음 |
| `index.html`·`ui.html`·`sw.js`·`assets-dist/index.json`·vendor·그 밖 | `no-cache` | 있음(`"<크기 16진>-<mtime 16진>"`, 변형은 `-br`·`-gz` 덧붙임), `If-None-Match` 맞으면 304 |
| 개발 서버(`npm run dev`, `server/main.ts` 기본) | 지금처럼(esbuild serve / `no-cache`) | — |

MIME: html·js(`text/javascript`)·css·json·map·png·jpg·webp·svg·ktx2(`image/ktx2`)·glb(`model/gltf-binary`)·bin·wasm(`application/wasm`)·ogg(`audio/ogg`)·m4a(`audio/mp4`)·flac(`audio/flac`)·wav·hdr·otf(`font/otf`)·ttf·md·txt.

#### 5.8.6 서비스 워커 [설계] (`script/cache/sw.js` → 배포 `dist/sw.js`, 독립 JS 한 파일)

| 요청 | 전략 |
|---|---|
| 해시 이름(정규식 — 5.8.5 와 같음), 같은 출처 GET | **cache-first**: Cache Storage → 없으면 네트워크(HTTP 캐시 immutable 이면 디스크) → 200·basic 이면 넣음 |
| 이동(html)·`assets-dist/index.json` | **network-first**: 네트워크(no-cache → 304 면 바디 0) → 성공이면 Cache Storage 갱신 → 실패면 캐시(오프라인) |
| 그 밖(vendor·API·socket.io·`?assets=src` 의 소스 에셋) | 손대지 않음(브라우저 기본) |

- 등록: 배포 빌드 + `assets=dist` 일 때만, 페이지 `load` 뒤(첫 실행 대역폭과 겹치지 않게). `skipWaiting` + `clients.claim` — 첫 실행 중 나중에 받는 것(지연 받기)부터 바로 Cache Storage 에 들어간다.
- `?assets=src`·개발 서버: 등록 안 함, 이미 있으면 `unregister`(`script/cache/swClient.ts`, import 0).
- 저장소가 막힌 환경(시크릿·사파리 개인 정보·용량 초과·`serviceWorker` 없음): 모든 `caches.*` 호출을 try/catch, 실패하면 그냥 네트워크 응답을 돌려준다 → 페이지는 HTTP 캐시만으로 정상 동작. 등록 실패도 무시(콘솔 경고 1줄).
- 설정은 파일 머리 상수 3개(`CACHE` 이름, `MANIFEST` 경로, 해시 정규식)와 `liveUrls(manifest)` 함수 하나 — ddalkkakrider 등 다른 게임은 이 넷만 바꿔 쓴다.

#### 5.8.7 업데이트 흐름 [설계]

1. 새 배포: 바뀐 에셋만 새 해시 이름, 안 바뀐 것은 같은 이름. `index.html`·`index.json` 이 새 이름들을 가리킨다.
2. 다음 방문: html·index.json 은 network-first(재검증) → 새 표. 표에 있는 이름 중 Cache Storage 에 있는 것은 0 바이트, 새 이름만 받는다.
3. 정리: SW 가 새 `index.json` 을 받을 때마다 `liveUrls`(names 값 + bundle) 밖의 **해시 이름** 항목을 Cache Storage 에서 지운다(html·index.json 항목은 그대로). 이미 열려 있는 옛 탭이 옛 청크를 더 요청하면 네트워크로 간다(서버에 옛 파일이 없으면 실패 — 배포 서버가 직전 배포 파일을 한동안 남겨 두면 안전, **사용자 확인 필요**).
4. `sw.js` 자체가 바뀌면 브라우저가 새 SW 를 설치·즉시 활성(`skipWaiting`). 캐시 이름(`CACHE`)을 바꾸면 옛 캐시 전체를 activate 에서 지운다(형식 바꿀 때만).

#### 5.8.8 코드 분할 경계 [설계]

| 묶음 | 내용 | 언제 받나 |
|---|---|---|
| `main` 진입 | 페이지 조립(main.ts)·설정 패널·three(공용)·게임 목록 메타(제목·설정 칸) | 처음 |
| 화면 청크 | `setplayer_page`·`plaza_page`·`modeselect_page`·`mgmet_page`·`mgm01_page`·`charselect_page` 각각(+그 셸) | 그 화면에 들어갈 때 `import()` |
| 게임 청크 | `games/<id>` 의 로직·뷰(mg1801 137 KB) | 그 게임을 시작할 때(`GameDef.load?()`) |
| 공용 청크 | 둘 이상이 쓰는 셸(mgmcommon·stage3d·three 일부) | esbuild 가 자동으로 뽑음 |

- `main.ts` 의 `run*` import 는 타입만 정적으로 두고 실행은 `import()`(최소 Edit). `ui_main.ts`(시험 페이지)는 그대로.
- 게임 목록: `GameDef` 에 선택 항목 `load?(): Promise<void>` 를 더해 메타(id·제목·설정)는 정적, 로직·뷰는 `load()` 뒤에 생긴다. `main.ts start()`·`tools/check_logic.ts` 가 `createLogic` 전에 `await def.load?.()` 한 줄.
- 개발 빌드는 분할·해시 없이 지금처럼 한 파일(`bundle/main.js`) — `import()` 는 esbuild 가 같은 파일 안에서 풀어 준다.

#### 5.8.9 개발(src) 모드

- `npm run dev`·`server/main.ts`(기본)·`?assets=src`: 해시 이름을 쓰지 않음(소스 `assets/` 그대로), 서비스 워커 등록 안 함 + 있으면 해제, 번들 분할·해시 없음. 고친 파일이 새로 고침에 바로 보인다.
- 개발 서버에서 `?assets=dist`: 해시 표를 쓰지만(작업본·해시본 둘 다 있으므로 어느 쪽이든 동작) SW 는 없음.

#### 5.8.10 ddalkkakrider 로 옮길 때 ([loader_manager_ddalkkakrider.md](loader_manager_ddalkkakrider.md) §1·§4-6)

- `server/static.ts`(node 내장만, 프로젝트 import 0) → 그쪽 `no-cache`·ETag 없음 문제를 그대로 해결(해시 이름 immutable + 나머지 ETag/304 + 사전 압축).
- `script/cache/sw.js`·`swClient.ts`·`urlShim.ts`(import 0) → 머리 상수와 `liveUrls` 만 바꿈.
- 해시 이름 붙이기는 그쪽 빌드에 `hashedName(rel, sha256 8)` + `names` 표 쓰기만 더하면 된다(`tools/build_assets.ts` 의 해당 부분).

#### 5.8.11 결과 [실측] (2026-10-08)

**구현 파일**: `tools/build_assets.ts`(해시 이름·`names`·증분 사전 압축), `tools/precompress.ts`(새, `hashedName`·`.br/.gz`), `tools/build.ts`·`tools/esbuild_config.ts`(분할·해시·html 고쳐 쓰기·배포 index 의 `bundle`), `server/static.ts`(새), `server/main.ts --dist`·`tools/serve.ts --dist`(배포 미리보기), `script/cache/{urlShim.ts,swClient.ts,sw.js}`(새, import 0), `script/view/assetMode.ts`(shim·SW·TLA), `script/main.ts`(화면 `import()`), `script/game.ts`(`load?()`), `script/games/mg1801/{index.ts,body.ts}`, `tools/check_logic.ts`(`await load`), 시험 `tools/test_build_cache.ts`(새).

| 항목 | 전 | 후 |
|---|---|---|
| 첫 실행에 내려받는 JS(광장 `?plaza=1` 진입까지) | `main.js` 한 덩어리 1,291.5 KB(서버가 압축 없이 보냄) | 18 파일 1,021.7 KB → **br 263.8 KB**(mg1801 몸체 189 KB·mgm01·mgmet·charselect·modeselect 화면 빠짐) |
| 시작(진입점 정적 닫힘) | 같음 | 8 파일 682.5 KB(br 158.1 KB) — 거의 three |
| main 쪽 전체 JS | 1,291.5 KB | 1,299.4 KB(br 341.5 KB) — 나뉘기만 함 |
| 에셋 사전 압축 | 없음(`--precompress` 선택, 꺼져 있었음) | 546 파일 114.2 MB → br 43.8 MB(−70.4 MB). 압축본 전체 386.1 → 전송 315.7 MB |
| 에셋 빌드 증분(바뀐 것 없음) | — | 4 s(해시·사전 압축 결정 재사용). 처음 해시·압축 한 번 115 s |
| 광장 첫 방문 전송(헤드리스, 광장 준비 + 8 s 지연 받기 포함) | — | 742 요청 97.3 MB(js 253 KB·index.json 30 KB·vendor 212 KB, br 응답 148개) |
| **두 번째 방문(새로 고침)** | 전부 재검증 | **5 요청 모두 304, 바디 0 B**(html·index.json·sw.js·basis js·wasm). 해시 이름 737~739개는 Cache Storage 에서 |
| 세 번째 방문 | — | 두 번째와 같음 |
| 콘솔 오류 | — | 0 |

- 헤드리스: `server/static.ts` 로 `dist/` 를 내주는 node 서버(서버 쪽에서 바이트를 셈) + Playwright 크로미움 임시 영구 프로필(SwiftShader). 광장까지 시간(32~35 s)은 같은 PC 에서 다른 에이전트의 헤드리스 측정이 함께 돌아 비교 불가(경합 없을 때 11.8~13.6 s). 로컬이라 시간은 전송이 아니라 트랜스코드·컴파일이 정한다 — 전송량만 본다.
- 측정 중 발견·수정: ① 첫 방문에 워커가 페이지를 잡기 전에 받은 번들·첫 에셋은 Cache Storage 에 없어 HTTP 캐시에만 의존 → 메모리 HTTP 캐시(비영구 문맥)에서는 밀려나 두 번째 방문에 다시 받음(13 요청 0.45 MB). `swClient.ts` 가 잡힌 뒤·15 s 뒤에 받은 URL 목록을 넘기고 워커가 force-cache 로 옮겨 담게 함 → 0 B. ② 긴 경로의 프로필(MAX_PATH 초과)에서는 Cache Storage `put` 이 "Entry already exists" 로 실패 — 이때도 페이지는 정상(오류 0, HTTP 캐시만), 저장소가 막힌 환경의 실제 예.
- 남은 재검증 요청: `vendor/basis/*` 2개(KTX2Loader 가 경로를 직접 만들어 해시 이름을 못 씀 — 304 라 바디 0).

### 5.9 관리자 자체의 할당 0 (R10)

- 큐는 등급별 고정 크기 배열 + 머리/꼬리 번호(링). 항목 객체는 키당 하나를 계속 재사용.
- 프레임 스케줄러는 클로저를 만들지 않고 항목의 `state` 로 분기.
- 통계는 숫자 필드 누적(문자열·객체 생성은 개발 패널을 열 때만).

### 5.10 공개 인터페이스(초안)

```ts
interface AssetManager {
  get<K extends Kind>(key: string, o: { kind: K; pri: Pri; owner?: Owner }): Promise<Res<K>>;   // 준비 끝(R5)에 풀림
  want(keys: readonly string[], pri: Pri, owner?: Owner): void;                                  // 미리 받기(기다리지 않음)
  bundle(name: string): readonly string[];                                                       // 'plaza:p0' 같은 묶음(§6)
  release(owner: Owner): void;                                                                    // 화면이 나갈 때(지우지 않음, refs 만)
  readonly renderer: THREE.WebGLRenderer;
  frame(nowMs: number): void;                                                                    // 앱 루프가 렌더 뒤 1번
  stats(): AssetStats;
}
```

셸·게임은 이 인터페이스만 받는다(R12). 형식별 처리(KTX2·meshopt·소리·json)는 `assetLoader.ts` 함수를 관리자가 부른다.

정정(구현, §11.2): `renderer` 는 인터페이스에서 뺐다(코어는 three 를 모른다 — 렌더러는 4단계에서 three 어댑터/앱 쪽이 갖는다). `get` 은 `get(key, kind, pri?, owner?)`, 묶음은 `defineBundle`/`wantBundle`/`whenBundle`, `frame()` 대신 주입한 `tick`(rAF)으로 스스로 돈다(바깥에서 `frame()` 을 불러도 됨).

---

## 6. 광장 적용 (첫 적용 대상)

| 단계 | 묶음 | 내용 |
|---|---|---|
| 막음(P0) | `plaza:p0` | 충돌 json, 시작 카메라에서 보이는 모델(§6.1), 하늘·IBL·LUT·포스트, 1P 캐릭터, 텔롭·하단 UI 기본 레이아웃 |
| 곧(P1) | `plaza:p1` | 시작 위치에서 거리순 나머지 모델, MC·가까운 NPC, 원격 멤버 캐릭터(방에 있으면) |
| 유휴(P3) | `plaza:p3` | 먼 장식, 상점·카드 UI, 광장 보기 카메라 클립, 덜 쓰는 소리 |

### 6.1 "처음 보이는 것" 정하기 — 빌드 도구

- 시작 카메라(1P 시작 소켓 + 추종 카메라 기본값)에서 **물체 번호 버퍼**로 한 번 그려(각 모델을 고유 색으로) 실제로 화면에 픽셀이 있는 모델 목록을 뽑는다 → `plaza_first.json`. 절두체만으로 고르면 가려진 것까지 들어간다.
- 1P 시작 자리가 여러 개(슬롯·캐릭터별 `pc_plaza_start_pos_pN_pcNN`)라 합집합.
- 장식 보임 규칙(plaza_3d.md §6.6, 해금 상태)은 빌드 때가 아니라 실행 때 필터.

### 6.2 지켜야 할 것

- 충돌은 P0(없으면 바닥을 뚫음). 부착 모델은 부모가 먼저(`ensure` 의 hookKey 규칙 그대로).
- 맵 애니(fmab)·기본 클립은 모델 준비와 같이(지금 `ensure` 그대로) — 늦게 나온 모델도 원본 시각(`stage.frame`)에 맞는 프레임부터 재생해야 다른 것과 어긋나지 않는다(지금 `startFrame` 이 고정값이면 [확인 필요]).
- 1P 가 P1 모델 쪽으로 빨리 가면 그 모델을 P0 로 올린다(거리 기반 재평가 0.5 s 마다, 할당 없이).

---

## 7. 측정 기준 (헤드리스 + 망 속도 제한)

| 항목 | 지금 [실측] | 목표 |
|---|---|---|
| 광장 첫 프레임까지 받는 양 | 61 MB(압축 후 전체) | P0 만 [추정 20~30 MB] |
| 광장 재진입 | 처음과 같음(다시 만들기) | 0 MB·준비 대기 0 |
| 캐릭터 선택 진입 | 52 MB(22명 전부) | 커서 1명 + 화면 UI [추정 5~10 MB] |
| 화면 전환 로딩 문구 | 있음(modeselect·plaza) | 없음(흐름 예측으로 다 받아 둠, 4G 기준) |
| 프레임 끊김(새 모델 등장) | 측정 없음 | 50 ms 넘는 프레임 0(이동 중) |
| 두 번째 실행 받는 양 | 전부 재검증 | index.json 하나 → **[실측 6단계] 304 5개, 바디 0 B**(§5.8.11) |

시험: Chrome `Network.emulateNetworkConditions`(4G 9 Mbps·RTT 170 ms, 3G 1.6 Mbps)로 헤드리스 1회, 프레임 시간 기록, "보이는데 준비 안 된 모델 수" 0 확인.

---

## 8. 위험과 대응

| 위험 | 대응 |
|---|---|
| 렌더러 하나로 합치는 변경 범위(페이지 10개·렌더러 7곳) | 화면 하나씩(광장 → 캐릭터 선택 → 2D 화면들) 옮기고, 옮기기 전 화면은 지금 방식 유지(관리자는 두 방식 공존 가능) |
| 늦게 나온 모델의 애니 시각 어긋남 | §6.2 — 원본 시각으로 시작 프레임 계산 |
| 예측 미리 받기로 모바일 데이터 낭비 | saveData·느린 망이면 바로 다음 화면만 |
| GPU 예산 추정이 틀림 | `stats()` 로 실측 후 조정, 문맥 잃음 복구 경로 |
| 서비스 워커 캐시가 옛 파일을 줌 | 해시 이름만 영구 캐시, index.json·HTML 은 늘 재검증 |
| 첫 실행 로드가 길게 느껴짐 | 원본 부팅 화면(로고·타이틀)과 첫 메뉴 진입 연출 동안 받음. 그래도 길면 원본 화면을 유지(로딩 표시 대신) — **사용자 확인 필요** |

---

## 9. 구현 순서와 규모 (실측 속도 기준)

| 단계 | 내용 | 예상 |
|---|---|---|
| 1 | 관리자 코어: 키·층·우선순위 큐·동시 받기·Promise 공유·통계, assetLoader 형식 처리기 연결 | 1~1.5 h |
| 2 | 프레임 예산 스케줄러 + "준비 끝에만 보이기" + stage3d `warmup` 쪼개기 | 1 h |
| 3 | 광장 P0/P1/P3 묶음 + 첫 화면 목록 도구(§6.1) + 차례 받기 → 동시 | 1~1.5 h |
| 4 | 앱 하나의 렌더러: 광장(무대 + UI 오버레이 합치기) → 캐릭터 선택 → 2D 화면들 | 2~3 h |
| 5 | 흐름 예측 표 + 캐릭터 선택 지연 받기 + Preview3D 캐시 공용화 — **구현됨(§13, 받기·CPU 풀기까지)** | 1 h |
| 6 | 해시 이름·서비스 워커·brotli 사전 압축·코드 분할 — **구현됨(§5.8, 결과 §5.8.11)** | 1~1.5 h |
| 7 | 매 프레임 할당 정리(측정 기반, 관리자 밖 코드) | 1 h |
| 검증 | 상태 시험(큐 순서·올리기·예산·해제) + 망 제한 헤드리스 1회 | 0.5 h |

1·2·3 이 묶여 먼저(광장 효과가 바로 보임), 4 는 가장 크고 독립, 6 은 언제든.

---

## 10. 사용자 확인 필요 (기본값은 정함)

1. 느린 망에서 준비가 늦을 때: 로딩 표시 대신 원본 페이드 화면을 더 유지(§2.3).
2. 모바일 GPU 예산 600 MB·PC 2 GB, `?texlod` 자동 적용 조건(§5.7).
3. 예측 미리 받기 범위: 기본 = 표 전체, 데이터 절약이면 바로 다음 화면만(§5.5).
4. 렌더러 하나로 합치기(§5.6)를 광장부터 단계적으로 — 범위가 커서 가장 먼저 동의가 필요한 항목.
5. (3단계 구현) 1P 외 플레이어·NPC(약 18 MB)·광장 2D UI(약 25 MB, 카드·스탬프 포함)는 이번에 **지금처럼 첫 화면 전에 받음**. NPC 는 다른 부품(기구 MC 등)이 생성 때 모델을 쓰고, UI(Render2D)는 텍스처가 없으면 흰 사각형을 그려 "준비 끝에만 보이기"를 레이아웃 단위로 먼저 만들어야 한다 → 다음 단계로 미룸(기본값: 지금 방식 유지).
6. P1/P3 경계 40 m·올리기 거리 25 m·첫 화면 예산 무제한·이후 4 ms 는 [추정] 기본값.
7. 늦게 나온 모델이 "나타나는" 것 자체(원본은 장면 시작 때 다 있음): 시작 카메라에 안 보이는 것만 늦추므로 보통은 보이지 않지만, 느린 망에서 1P 가 빨리 움직이면 먼 장식이 뒤늦게 나타날 수 있다 — 원본 동일을 더 원하면 P1 까지 첫 화면 전에 받는 선택지(`plaza:p1` 을 막음으로).
8. (6단계) 배포 서버가 직전 배포의 해시 파일을 한동안 남길지(열려 있던 옛 탭이 옛 청크를 요청할 때 404 방지) — 기본: `dist/` 를 통째로 바꿈(남기지 않음), SW 캐시에 있으면 그것을 씀(§5.8.7).
9. (6단계) `assets-dist/` 는 작업본 + 해시본 복사로 디스크 약 2배(배포 `dist/` 는 해시본만). 옛 해시본은 `build_assets.ts --prune` 를 사용자가 돌릴 때만 지움.
10. (6단계) `npm run build` 는 첫 단계 `tsc` 가 기존 `tools/serve.ts` 오류 2개(쓰지 않는 `DEV_PORT`·`argValue`)로 멈춘다 — 6단계 확인은 `npx tsx tools/build.ts` 로 했다. 두 줄을 지우거나 쓰면 풀림(사용자 결정). → **해결(2026-10-08, 사용자 지시)**: `port = Number(argValue("--port") ?? 51811)`, import 에서 `DEV_PORT` 제거. `npm run build` 통과.
11. (6단계) `vendor/basis` 트랜스코더 2개는 해시 이름이 아니라 재방문마다 304 재검증(바디 0). 해시로 하려면 transcoderPath 를 배포 때 해시 폴더로 바꾸는 작은 변경 필요.
12. (§13) 미니게임 미리 받기는 코드 청크 + `manifest.json` 까지만 — 게임 에셋 목록(모델·소리 파일 표)이 없어 커서 미니게임의 에셋은 아직 미리 받지 못한다. `GameDef` 에 선택 항목(예: 미리 받을 키 목록)을 더하는 다음 단계 필요.
13. (§13) 4G 에서 광장 첫 화면 몫 77 MB(무대 P0 31·UI 26.5·NPC 16·플레이어 3.7)는 메뉴 체류 약 20 s 안에 숨길 수 없다(진입 때 10 %) — 그동안은 앞 화면이 끝난 검은 화면(원본 페이드)이 길어진다. 줄이는 순서 제안: 광장 UI 레이아웃 단위 지연 → NPC 를 P1 로.
14. (§13) "1P 지난번 캐릭터": 웹은 고른 캐릭터를 저장하지 않아 캐릭터 선택 처음 커서가 늘 표 0번(마리오, state.start `initial ?? i`)이다. 원본은 이전 캐릭터(FUN_710033e620)라 저장(localStorage)해 `initial` 로 넘기는 것이 원본에 더 가깝다 — 화면 동작이 바뀌므로 이번에는 안 함(예측은 지금 규칙 = 마리오).
15. (§13) 주변 칸 = 사람 커서에서 격자 간격 × 1.6 안(8 이웃), 체류 시간(인원 설정 8 s·캐릭터 선택 10 s) [추정 기본값]. `?charselect=1`(개발용, 게임으로 바로 감)에서도 광장 예측이 나간다(그 경로에서는 쓰지 않는 망 사용).
16. (§13) 2D 그림이 관리자 캐시를 쓰게 되어 한 번 실패한 그림은 그 세션 동안 실패로 남는다(전: 화면에 들어갈 때마다 다시 시도). glb 안 텍스처는 대리 로더가 P1 로 요청하므로 P2·P3 glb 를 푸는 중 새 화면 P0 와 잠깐 망을 나눠 쓴다.
17. (4단계 광장, [plaza-gl]) GPU 예산 비율·모바일 판정, 첫 미리 준비의 IBL PMREM 한 덩어리, 1P 캐릭터·NPC 미리 컴파일 범위, 모드 메뉴에서의 미리 조립 — §14.10.

---

## 11. 구현 설계 — 1·2·3단계 [설계, 구현 전에 먼저 적음]

### 11.1 3층 구조와 의존 방향 (사용자·조정자 지시)

"다른 게임에 복사해서 그대로 쓸 수 있게" — 의존은 **코어 ← three 어댑터 ← mpj 전용** 한 방향.

| 층 | 위치 | import 허용 | 내용 |
|---|---|---|---|
| 1 코어 | `script/lib/assetcore/` | **없음**(외부 라이브러리·three·프로젝트 파일·DOM 타입 모두 금지) | 논리 키 캐시(Promise 공유·중복 제거), P0~P3 링 큐(올리기), 동시 받기·풀기 수 제한, 단계 상태, 참조 수·owner release, 바이트·GPU 예산 숫자·LRU 후보, 묶음, 통계 숫자, 프레임 예산 스케줄러, json·bytes 처리기 |
| 2 three 어댑터 | `script/lib/assetcore-three/` | `three` 와 코어만 | 프레임 예산 GPU 준비(`initTexture`·`compileAsync`·1×1 렌더 업로드)와 "준비 끝에만 보이기", 일반 glTF 처리기(로더 인스턴스 주입), 일반 텍스처 처리기(읽기 함수 주입), glTF 안 텍스처를 관리자로 돌리는 로더 대리 객체 |
| 3 mpj 전용 | `script/shell/stage3d/assetHandlers.ts`, `script/view/appAssets.ts`, stage3d·plaza 연결, `tools/plaza_first.ts` | 프로젝트 의존 허용 | `assetLoader.ts` 의 압축/원본 모드·KTX2·meshopt·소리, 앱 관리자 인스턴스(키 → URL resolver), stage3d 연결, 광장 묶음·`plaza_first.json` |

- 코어가 바깥에서 받는 것(생성 때 주입): `now()`(시계), `tick(fn)`(rAF), `io.fetch(url)`(받기 — `ok·status·arrayBuffer()·json()·text()` 만 쓰는 작은 인터페이스), `resolve(key, kind)`(논리 키 → URL). 저장소(Cache Storage)는 6단계가 서비스 워커로 하므로 코어에 두지 않는다.
- 셸 경계(mgm_common.md §9.1)에 예외 추가: **import 0 인 코어 폴더와 three·코어만 쓰는 어댑터 폴더는 어디서나 import 가능**. 시험: 코어 폴더 import 0, 어댑터 폴더 import ⊂ {`three`, 코어} (`tools/test_assetcore.ts`·`test_plaza_world.ts` 8절).
- ddalkkakrider 로 옮길 때: 코어·어댑터 폴더를 그대로 복사(어댑터는 three r180 기준), 3층만 새로(자체 JSON 모델 처리기·PNG·ogg). 번들이 둘이면 관리자 인스턴스를 `globalThis` 에 두면 된다 — mpj 도 `globalThis.__mpjAssetManager` 에 둔다(문맥과 무관한 데이터만 담는 규칙은 loader_manager_ddalkkakrider.md §3).

### 11.2 코어 API

```ts
createAssetManager({ env: { now, tick?, io? }, resolve, handlers, maxFetch=6, maxDecode=2, budgetMs=4, gpuBudget, byteBudget })
mgr.get(key, kind, pri = P1, owner?)  → Promise<값>      // 준비 끝(ready)에 풀림. 같은 키는 같은 Promise
mgr.want(key, kind, pri, owner?)                        // 미리 받기(기다리지 않음, Promise 도 안 만듦)
mgr.raise(key, pri)                                     // 올리기만(낮추지 않음), 할당 0
mgr.peek(key) / mgr.state(key)                          // 동기 조회
mgr.release(owner)                                      // refs 만 내림(지우지 않음)
mgr.defineBundle(name, keys, kinds) / wantBundle(name, pri, owner?) / whenBundle(name) / bundleReady(name)
mgr.gpuCandidates(out, needBytes) / mgr.trim()          // LRU 후보 계산(refs 0·ready, 오래 안 쓴 순) / 예산 넘으면 처리기 dispose 호출
mgr.scheduler: FrameScheduler                           // add(task, pri)·raise(task, pri)·budgetMs·frame()
mgr.stats                                               // 숫자 필드만(요청·적중·받기·바이트·풀기·준비·실패·동시 최대·프레임 처리 수·예산 초과 프레임 등)
```

- 처리기 = `{ kind, fetch(url, key, io) → raw, decode?(raw, key) → 값, upload?(값, step, key) → DONE|MORE|WAIT, dispose?(값, key), bytes?(raw), gpuBytes?(값), keepRaw? }`. 처리기 하나를 바꿔도 코어는 무수정.
- 상태: idle → queued → fetching → decoding → uploading → ready (실패 failed, GPU 내림 evicted = 값은 남음, 다시 get 하면 upload 만 다시).
- 우선순위: P0 이 큐·진행 중에 하나라도 있으면 P2·P3 은 새로 시작하지 않는다(P1 은 시작 — 단 같은 큐에서 P0 이 늘 먼저 뽑힌다). 우선순위 없이 부른 get 의 기본은 **P1** — 모델 준비 중 안에서 부르는 텍스처 요청이 P0 막기에 걸려 서로 기다리는 일(교착)을 막는다.
- 할당 0: 큐는 등급별 링(가득 차면 2배로 늘림 — 늘 때만 할당), 항목 객체는 키당 하나, 완료 콜백은 항목 생성 때 한 번 bind, 스케줄러는 작업 객체의 `run()` 반환값으로 분기(클로저 없음). 올리기는 "게으른 삭제"(링에서 빼지 않고 새 등급 링에 넣고, 꺼낼 때 등급이 다르면 건너뜀).
- 프레임 예산: 매 tick 에서 `budgetMs` 안에서 작업 단위를 꺼내 `run()`. 단위 하나가 예산보다 커도 그 프레임에 하나는 한다. WAIT 는 같은 등급 끝으로 다시 넣고 그 프레임에 한 바퀴만 돈다.

### 11.3 2단계 — 준비 끝에만 보이기 (three 어댑터 `ScenePreparer`)

- `preparer.prepare(root, pri)` → 작업(job, `promise` 가 준비 끝에 풀림). 단계: ① 텍스처 `initTexture` 한 장 = 한 단위 ② `compileAsync(root, camera, 무대 장면)` 1회 시작(KHR_parallel_shader_compile 이면 비동기 완료) → 끝날 때까지 WAIT ③ 메시 32개 = 한 단위로 1×1 렌더 타깃에 그려 버퍼·VAO·뼈 텍스처를 올림(ddalkkakrider `prepareScene` 과 같은 방법).
- ③ 의 그리기는 **카메라 레이어**(31)로 그 묶음 메시만 그린다(무대의 빛도 레이어 31 을 켜 둠 — 빛 수가 다르면 셰이더 키가 달라져 다시 컴파일). 그리는 동안만 부모까지 보이게·컬링 끄기·그림자 맵 갱신 끄기, 같은 동기 구간에서 되돌리므로 화면에는 나오지 않는다.
- 렌더 타깃이 셰이더 키를 바꾼다(타깃이 있으면 선형 색공간·톤맵 없음). 무대가 후처리(RT 에 그림)를 쓰면 컴파일·업로드도 1×1 RT 에서, 아니면 캔버스 1×1 가위(scissor)로 [코드 확인: three r180 getParameters]. 정정: 지금의 `warmup()` 은 RT 없이 compileAsync 해서 후처리 무대에서는 캔버스용 변형을 컴파일했다(실제 그리기용은 뒤의 `render()` 가 동기 컴파일).
- 이미 준비한 메시·텍스처는 WeakSet 으로 건너뜀. `stage.warmup()` = 장면 전체를 한 작업으로(이미 준비한 것 제외) **첫 로딩 동안 큰 예산**(사실상 무제한)으로 돌리고, 끝에 지금처럼 숨은 것까지 보이게 한 번 그려(그림자 깊이 재질 변형) 되돌린다. 첫 화면 뒤 예산 = 4 ms.
- 광장 무대 모델: `visible:false` 로 올림 → 부착·기본 애니 → `prepare` 끝 → 장식 보임 규칙대로 보이기. `applyVisibility`·`setDeco` 도 준비 끝난 모델만 건드린다.

### 11.4 3단계 — 광장 단계 로딩

- 키 = `web/assets/` 기준 소스 경로(예 `plaza/world/model/menu00_central_plaza00.glb`, `plaza/world/tex/x.png`). mpj resolver = `ASSETS + key`(모드별 루트), 해시 이름은 6단계 shim 이 fetch 직전에 입힌다(SHARED 계약, `assetLoader.distUrl`).
- glTF 캐시 값은 **깨끗한 원본(템플릿)** — 무대는 처음 쓸 때 재질까지 복제한 "무대 템플릿"을 만들고(MaterialSetup 이 재질을 고쳐 쓰므로 무대 사이 공유 금지), 그 뒤는 지금처럼 `cloneSkinned`. 텍스처 캐시 값도 깨끗한 원본, 쓰는 쪽은 `clone()`(GPU 데이터는 three source 공유).
- 압축 모드에서 glTF 안 텍스처(`../tex/*.ktx2`)는 KTX2 로더 대리 객체가 관리자 `texture` 로 받는다(MaterialSetup 의 같은 텍스처와 한 번만 받음). 소스 모드는 GLTFLoader 기본 그대로(ImageBitmap 경로 — 결과가 PNG TextureLoader 와 미세하게 다를 수 있어 바꾸지 않음).
- 묶음: `plaza:p0` = 충돌 json + (plaza_first.json 의 처음 보이는 모델 ∩ 장식 보임) + 로케이터(소켓 주인 `AttachLocater*`)·부착 부모 + 그 모델들의 텍스처. 하늘·IBL·LUT·포스트는 무대 생성에서 막고 받음(지금 그대로). 1P 캐릭터·NPC·UI 는 부품 생성에서 막고 받음(지금 그대로 — §10 5 참고). `plaza:p1` = 나머지 중 상점이 아니고 시작 위치에서 (거리 − 반지름) ≤ 40 m, 거리순. `plaza:p3` = 상점(`Shop*`) + 40 m 밖(거리순) + 덜 쓰는 소리(바이트만 받아 둠). 광장 보기 클립(fsnb 1개)·카드 UI 는 부품 생성 때 그대로 읽는다(overview.ts·plaza/ui — 다른 갈래 파일, §10 5).
- 차례 받기 → P0 의 `ensure` 를 한꺼번에 시작(큐가 순서를 정함), `load()` 는 P0 의 ensure(준비 끝 포함)만 기다린다. 부착 모델은 `ensure` 안에서 부모를 먼저 기다리는 규칙 그대로(단 부모의 GPU 준비 끝이 아니라 "읽힘"까지만 기다림).
- 정정(구현 중): P1·P3 은 **첫 화면 뒤(`warmup` 끝)에** 시작한다(`world.startBackground()`). P0 뒤에도 부품 생성(1P·NPC·UI, 관리자 밖)이 첫 화면을 막고 있어 그 사이 P1/P3 이 망을 나눠 쓰면 첫 화면이 늦어진다.
- 늦게 나온 모델의 기본 클립·fmab 시작 프레임 = `a.frame + (stage.frame − 무대 시작 프레임) × speed` [설계: 처음부터 다 있었다면 그 프레임]. 정정: 지금은 `startFrame = a.frame` 고정(로드 중 `stage.frame` 이 0 이라 문제가 없었음).
- 다가가면 올리기: 0.5 s(30 프레임)마다 1P 위치와 아직 준비 안 된 모델의 경계 구(plaza_first.json `bounds`)를 비교해 (거리 − 반지름) < 25 m 면 그 모델의 glb·텍스처 키·준비 작업을 P0 로 올린다(미리 만든 배열만 돎, 할당 0).
- 문구 "광장 읽는 중 n/total" = P0 진행만(n/total 의 total = P0 모델 수 + 충돌 1). 문구 제거는 흐름 예측(5단계) 뒤 — 지금은 유지.
- 비교용 `?loader=seq`: 이전 방식 재현(모든 모델 P0·차례 받기·끝에 한꺼번에 보이기) — 실측 전/후 비교에만 쓴다.

### 11.5 "처음 보이는 것" 도구 (`tools/plaza_first.ts`, 노드)

- 헤드리스 없이 노드에서: 소스 glb(비압축)를 읽어 노드 계층·부착(hookKey/hookNode, 배율 상속 = world.ts 의 `node.add`)·스킨(쉬는 자세, 관절 × 역바인드)으로 월드 삼각형을 만들고, CPU 깊이 버퍼(480×270)에 물체 번호로 그린다.
- 시작 카메라 = 1P 시작 소켓 `pc_plaza_balloon_pos_p{1..4}_pc00`(player.ts 의 시작 규칙) 각각에서 `MenuCameraFollow`(camera.ts 그대로 import)를 1·10·30·60·120 프레임 돌린 자세의 합집합, 16:9, 화각 여유 10%.
- 가림: 불투명 재질만 깊이를 쓴다. 반투명·알파 마스크 재질과 장식 항목(보임 규칙이 있는 것 — 같은 자리 변형끼리 서로 가리지 않게)은 깊이를 쓰지 않고 검사만(보수적: 목록이 넓어지는 쪽).
- 출력 `assets/plaza/world/plaza_first.json` = `{ v, first: key[], hosts: key[], bounds: {key: [cx,cy,cz,r]}, tex: {모델: glb 가 참조하는 png[]}, cameras }`. 정정(실측 뒤): 미리 받는 텍스처는 manifest `models[].tex`(928장 — 원본 재질의 쓰지 않는 mtl·rgh 등 포함)가 아니라 glb 가 실제로 참조하는 것(633장)만 — manifest 목록으로 미리 받았더니 전체 받은 양이 7.5 MB 늘었다(§12) — 변환기 출력 옆 새 파일(기존 파일 무수정). 장식 보임 규칙은 실행 때 필터.

---

## 12. 구현 결과·실측 (1·2·3단계, 2026-10-08)

### 12.1 파일

| 층 | 파일 | 내용 |
|---|---|---|
| 1 코어 | `script/lib/assetcore/index.ts`(새, **import 0**) | `createAssetManager`·`AssetManager`(`AssetManagerApi`)·`FrameScheduler`·`Ring`·`jsonHandler`·`bytesHandler`·`textHandler`, 상수 P0~P3·ST_*·RUN_* |
| 2 three 어댑터 | `script/lib/assetcore-three/index.ts`(새, import = `three` + 코어) | `ScenePreparer`·`PrepJob`(§11.3), `gltfHandler(로더)`, `textureHandler(읽기 함수)`, `managedTextureLoader`(glb 안 텍스처 대리), `textureBytes` |
| 3 mpj | `script/shell/stage3d/assetHandlers.ts`(새) | assetLoader 의 createGltfLoader·loadTexture·ktx2Loader 를 처리기로(압축 모드 glb 안 KTX2 → 관리자), meshopt 워커 2 |
| 3 mpj | `script/view/appAssets.ts`(새) | 앱 인스턴스(`globalThis.__mpjAssetManager`), 키 = assets 기준 소스 경로, resolver = ASSETS + 키, `assetKeyOf(url)` |
| 3 mpj | `stage3d/stage.ts`·`material.ts`·`types.ts`·`index.ts`, `assetLoader.ts`(distUrl·distReady — [loader-6] 계약) | `StageLoader` 연결(manifest·fmab json, glb = 무대 템플릿 복제, MaterialSetup 텍스처 끼움점), `prepareModel`·`warmup` 쪼개기·`budget`·`unpreparedVisible` |
| 3 mpj | `plaza/world.ts`·`scene.ts`·`types.ts`, `plaza_page.ts` | 단계 로딩(`plazaPlan`·묶음·`startBackground`·다가가면 올리기·늦은 클립 시작 프레임), 페이지 = 앱 관리자·소리 바이트 P3·`release('plaza')` |
| 도구 | `tools/plaza_first.ts` → `assets/plaza/world/plaza_first.json`(새 파일만, 원본 변환 출력 무수정) | §11.5 CPU 깊이 버퍼. 처음 보이는 것 69/107 항목, 로케이터·부모 4, 카메라 20, glb 참조 텍스처 601장 |
| 시험 | `tools/test_assetcore.ts`(새), `test_plaza_world.ts` 8·9절, `check_mgmcommon.ts`·`test_setplayer.ts` 경계 | 코어 47, 광장 무대 429(+11) |
| 측정 | `tools/measure_loader.ts`(새) | §7 망 제한 헤드리스(이전 방식 `?loader=seq` ↔ 단계 로딩) |

경계: `docs/shell/mgm_common.md` §9.1 에 공용 라이브러리 예외 추가(코어·어댑터 폴더는 어디서나 import). 의존 0 확인 = `test_assetcore` 8절(코어 폴더 import 0 + `window·document·performance·requestAnimationFrame·Response·globalThis` 직접 사용 없음, 어댑터 import ⊂ {three, 코어}).

### 12.2 계획(기본 장식, 압축본 크기)

| 등급 | 모델 |
|---|---|
| P0 | 22(바닥·바다·구름·먼 섬·기구·무대·분수·친구 매치·퀘스트 카트·기본 장식·bd 잠금 표지·로케이터 3) |
| P1 | 8(퀘스트 발판·원·카펫·장식 풍선 2·비행 경로 3) |
| P3 | 6(상점 Shop* 6) + 소리 바이트 |

### 12.3 실측 [실측 — `tools/measure_loader.ts`, Chrome 헤드리스, 4G 9 Mbps·RTT 170 ms, 압축본, 새 캐시]

| 항목 | 이전 방식(`?loader=seq`) | 단계 로딩 | 비고 |
|---|---|---|---|
| 첫 프레임(페이지 시각) | 151.3 s | **120.3 s**(−31 s, −20%) | 번들 받기 ~15 s 포함 |
| 첫 프레임 전 받은 양 | 111.4 MB | **99.8 MB**(−11.6 MB) | 뒤에서 +12.0 MB → 합 111.9 MB(이전과 같음 — 중복 받기 없음) |
| 광장 무대 모델 단계(load) | 65.7 s(36 모델 전부) | **39.1 s**(P0 22) | 나머지 81 s 는 부품(1P·플레이어·NPC·UI, 관리자 밖) |
| warmup(첫 화면 막는 GPU 준비) | 2516 ms(텍스처 461·프로그램 105) | 630 ms(텍스처 289·프로그램 78, 나머지는 모델별로 이미/나중) | |
| 보이는데 준비 안 된 모델 수(최대) | 0 | **0** | 25 s 동안 250 ms 마다(1P 앞으로 걷기 포함) |
| 그려지는데 GPU 준비 안 거친 메시(최대) | 0 | **0** | |
| 다가가면 P0 로 올림 | — | 6 회 | |
| 콘솔 오류 | 0 | **0** | |
| 프레임 > 50 ms | 16/16 | 21/21 | **판단 불가**: 헤드리스 GPU 가 SwiftShader(중앙값 1.3~1.8 s/프레임). GPU 플래그(d3d11)는 렌더러가 죽어 못 씀. 관리자 스케줄러 자체: 86 프레임 중 예산 초과 31, 최대 1740 ms(SwiftShader 의 동기 컴파일·1×1 렌더) |

- 첫 시도의 단계 로딩은 manifest `models[].tex`(쓰지 않는 mtl·rgh 포함 928장)를 미리 받아 첫 화면 전 105.1 MB·전체 119.0 MB 였다 → glb 참조 텍스처만(§11.5 정정)으로 고친 뒤 위 수치.
- 측정 중 도구 쪽 문제 2건(tsx 의 `__name` 보조 함수가 페이지 안 스크립트에서 없음 → 문자열 스크립트로, 포트 겹침)으로 헤드리스를 여러 번 띄웠다. 앱 코드 문제는 아니었다.

### 12.4 남은 것 (다음 단계)

1. **첫 화면을 막는 나머지 81 s**(4G 기준)는 부품 생성: 1P·COM 플레이어(Preview3D)·NPC(약 18 MB)·광장 UI(Render2D 가 명세 텍스처 전부, 약 25 MB). 효과가 가장 큰 다음 일 = NPC 를 P1(가까운 것부터, 준비 끝에만 보이기)·UI 를 레이아웃 단위 준비(준비 안 된 레이아웃은 그리지 않음 — 지금은 흰 사각형)로. §10 5.
2. 프레임 끊김은 실제 GPU 브라우저에서 재야 한다(4 ms 예산·P1/P3 뒤 받기 중 glb 풀기는 메인 스레드 — meshopt 는 워커).
3. 4단계(렌더러 하나) 전이라 GPU 준비는 무대(렌더러)마다 다시 한다. 코어 캐시(L1·L2)는 이미 앱 공용이라 광장 재진입은 받기 없이 캐시에서 나와야 한다 [설계 — 재진입은 이번에 재지 않음].
4. **흐름 예측 미리 받기(§5.5)**: 플레이어 설정·캐릭터 선택 화면에 있는 동안 `plaza:p0` 를 P2 로 받아 두면 광장 진입 대기가 그 화면 체류 시간 뒤로 숨는다 — "로딩을 보이지 않음" 목표에 가장 직접적. 1 과 묶어 다음 갈래로 [조정자 제안].
5. **6단계 URL 가로채기 정리**: `script/cache/urlShim.ts` 가 전역 `fetch`·`HTMLImageElement.src` 를 가로채 해시 이름을 입힌다(페이지 `new Image()` 8곳 무수정 목적). 코어 resolver 가 생겼으므로 읽기를 관리자로 옮기며 가로채기 범위를 줄인다 — 숨은 전역 결합 축소(사용자 원칙: 얽매이지 않게) [조정자 제안].

---

## 13. 흐름 예측 미리 받기·캐릭터 선택 커서 우선 (5단계 일부) [설계 — 구현 전에 먼저 적음]

목표(사용자): "스위치에서 시작하면 인원 설정·캐릭터 선택 화면이 바로 뜨듯이" — 처음 실행 말고는 로딩이 보이지 않게. 사람이 메뉴를 고르는 동안 다음 화면을 미리 받는다.
범위: **받기 + CPU 풀기**까지(이 절). GPU 업로드·셰이더 컴파일·렌더러 하나로 합치기는 [plaza-gl] §14 — 이 절의 사건(§13.6)에 맞춰 시작한다.

### 13.1 처리기별로 앞 화면에서 미리 할 수 있는 일 [코드 확인]

| 처리기(kind) | 앞 화면에서 끝나는 것(CPU) | 그 화면 렌더러가 생긴 뒤 하는 것 |
|---|---|---|
| `json` | 받기 + `JSON.parse`(값 공유, 쓰는 쪽은 고치지 않음) | — |
| `bytes`(소리) | 받기(압축본 ogg/m4a/flac 바이트) | `decodeAudioData` — 화면마다 `AudioContext` 가 따로라 페이지가 함(지금 그대로) |
| `gltf` | 받기 + `parseAsync`(meshopt 풀기 = 워커 2, 장면 그래프·BufferGeometry·AnimationClip 생성, glb 안 텍스처 = 아래 `texture`) | 복제(`cloneSkinned`)·재질 조립·`compileAsync`·버퍼 업로드(무대 ScenePreparer / Preview3D 준비 단계) |
| `texture` | 받기 + KTX2 트랜스코드(워커 4, 결과 = CompressedTexture 밉 데이터) / 소스 모드 PNG 는 Image 디코드 | `initTexture`(GPU 업로드) |
| `uiimage`(새, 2D 레이아웃 그림) | 받기 + KTX2 트랜스코드 / PNG Image | Render2D 가 `textureFromImage` 로 텍스처를 만들어 첫 그리기에 업로드 |
| 코드 청크(`import()`) | 받기 + 모듈 평가 | — |

- KTX2 트랜스코더는 렌더러 없이 형식 지원을 잠깐 만든 문맥으로 정한다(`assetLoader.ts detectSupport`) → 앞 화면에서 트랜스코드해도 결과가 같다.
- 값은 앱 하나의 관리자 캐시(L1·L2)에 남으므로 화면(렌더러)이 바뀌어도 받기·풀기는 다시 하지 않는다. GPU 쪽만 렌더러마다 다시 한다(4단계 전).

### 13.2 흐름 예측 표 (`script/view/flowTable.ts`, 데이터)

화면 키: `boot`(페이지 열림) · `setplayer` · `charselect` · `plaza` · `modeselect` · `mgmet` · `mgm01` · `game`. 묶음은 13.3.

| 지금 화면 | 들어갈 때 P0 로 올리는 것(자기 묶음) | 미리 받을 것 | "지금 상태" 알림 → 더 받을 것 |
|---|---|---|---|
| boot | `setplayer`(인원 설정 2D — 가장 먼저) | — | — |
| setplayer | `setplayer` | `charselect`(2D) P2 · `char:first`(1P 커서 캐릭터 3D) P2 · `charselect:sound` P2 → (P2 준비 끝 뒤) `plaza:p0`·`plaza:ui`·`plaza:npc` P3 | — |
| charselect | `charselect` + 커서 캐릭터(Preview3D 가 P0) | 주변 칸 P2·나머지 P3(Preview3D, 13.4) · `plaza:p0`·`plaza:ui`·`plaza:npc` P3 | `decided` = 고른 캐릭터 → `plaza:player:<pc>` P2, `plaza:p0`·`ui`·`npc` P2 로 올림 |
| plaza | `plaza:p0`·`plaza:ui`·`plaza:npc`·`plaza:player:<사람 캐릭터>` | `modeselect` P3 | 1P 가 기구 구역(AREA.BALLOON)에 들어감 → `modeselect` P2 |
| modeselect | `modeselect` | — | 커서 = `mgm` → `mgmet` P2, 그 밖 → `plaza:p0` P2(이미 캐시) |
| mgmet | `mgmet` | `mgm01` P2 · `modeselect` P3 | — |
| mgm01 | `mgm01` | — | 커서 미니게임 → `game:<이름>` P2(코드 청크 + manifest) |
| game | — | `mgm01` P3 | — |

- 등급 규칙: **바로 다음 화면 P2, 두 화면 뒤·지금 화면의 유휴 P3**. 캐릭터 선택 화면만 예외: 결정 전에는 광장이 P3(주변 칸 P2 보다 뒤, 나머지 캐릭터보다 앞 — 같은 P3 링에서 먼저 들어감), 결정하면 P2.
  - 주변 칸이 P1 이 아닌 이유: 코어 규칙상 P1 은 P0 이 진행 중이어도 새로 시작한다(glb 안 텍스처가 P1 이라 막으면 서로 기다림 — §11.2). 주변 칸을 P1 로 두면 진입 때 커서 캐릭터와 망을 나눠 쓴다.
- 데이터 절약(`navigator.connection.saveData`)·느린 망(`effectiveType` = slow-2g·2g·3g)이면 **lite**: 표의 "바로 다음 화면" 표시(`next`)가 있는 예측만, 캐릭터 선택의 나머지 캐릭터(P3)는 받지 않는다. 시험·비교용 `?prefetch=full|lite|off`(off = 예측 없음, 자기 묶음만).
- 같은 묶음을 다시 요청하면 올리기만 한다(낮추지 않음). 이미 받은 것은 그대로 쓴다(관리자 캐시).
- 예측은 자기 묶음 키가 정해져 P0 로 요청된 뒤에, 등급 순(P2 묶음 준비 끝 → P3)으로 낸다(13.8 정정).

### 13.3 묶음 (`script/view/flowCatalog.ts`, 키 = `web/assets/` 기준 소스 경로)

| 묶음 | 키 만드는 법(명세 json 은 관리자 `json` 으로 그 등급에 읽음) |
|---|---|
| `setplayer` | `mgmcommon/spec.json` + `../setplayer/setplayer.json` 합친 textures·fonts 그림(`uiimage`) + `charselect/spec.json`(이름 표) |
| `charselect` | `charselect/spec.json` textures·fonts(`uiimage`) |
| `charselect:sound` | SE·BGM·보이스(`bytes`) — 화면 안에서는 페이지가 같은 키를 P1 로 받아 디코드 |
| `char:first` / `char:<pc>` | charselect 캐릭터 glb(`gltf`)·motions(`json`)·눈·눈꺼풀(`texture`) — Preview3D 가 요청하는 키와 같음. first = 1P 처음 커서(state.start 규칙: `initial ?? 0`, 잠김 아님 → 표 0 번) |
| `plaza:p0` | `plaza/world/manifest.json` + 충돌·`plaza_first.json` + `plazaPlan` 의 P0 모델 glb(+ 압축 모드면 glb 참조 텍스처) — `world.ts plazaP0Paths`(World 와 같은 규칙, 기본 장식) |
| `plaza:ui` | `mgmcommon/spec.json` + online·faces·plaza_ui·plaza_card 부품 합친 그림(`uiimage`) — 광장 UI(PlazaUiView)와 같은 키 |
| `plaza:npc` | `plaza/world/chara/spec.json` 중 `NPC_MODEL` 모델의 glb·모션 glb(`anims`)·motions·눈(NPC Preview3D 와 같은 키, 파일은 공용 `chara/`) |
| `plaza:player:<pc>` | `plaza/player/spec.json` 그 캐릭터 glb·모션 glb·motions·눈(공용 `chara/` — 캐릭터 선택과 같은 키) |
| `modeselect`·`mgmet`·`mgm01` | 각 화면 명세(+부품) 그림(`uiimage`) |
| `game:<이름>` | `GameDef.load()`(코드 청크) + `<assetsDir>manifest.json`. 게임 에셋 목록은 아직 없음(§10 12) |

- 2D 화면 그림은 `assetHooks.loadUiImage` 를 관리자 `uiimage`(P0)로 돌려(브로커 설치 때) **모든 Render2D 화면이 같은 캐시**를 쓴다 → 미리 받은 그림은 화면 진입 때 바로 나온다, 다시 들어가도 0. 화면이 직접 `fetch` 하는 명세 json 은 그대로(HTTP 캐시 적중 — 관리자 json 값은 공유라 화면이 고칠 수 있는 객체를 넘기지 않음).
- 키 종류가 겹치면(같은 키를 다른 kind 로) 코어가 던지므로 브로커는 그때 관리자 밖(직접 읽기)으로 돌아간다.

### 13.4 캐릭터 선택 커서 우선 (`screen.ts prefetch` → `preview3d.ts`)

- `assetHooks.broker`(앱이 꽂음, 없으면 지금 방식 = 동시 2개 차례 읽기): Preview3D 의 glb·motions·눈 텍스처를 URL → 키로 관리자에 맡긴다. 값은 공유(glb = 복제해서 씀, 눈 텍스처 = `clone()` 뒤 flipY·sRGB).
- `prefetch(order, now, near)`: 사람 커서 캐릭터(랜덤·잠김 칸 제외) = 등급 0, 커서에서 격자 간격 × 1.6 안(대각 포함 8 이웃) = 2, 그 밖 = 3(lite 면 요청 안 함). 잠긴 칸은 지금처럼 목록에서 뺀다.
- 커서가 움직이면: 새 커서 캐릭터를 0 으로 **올리고**, 0 에서 빠진 캐릭터는 2 또는 3 으로 **내린다**(코어 `lower` — 아직 시작 전인 요청만 낮은 등급 큐 뒤로; 이미 받는 중이면 그대로 끝냄). → 커서를 빠르게 여러 칸 옮겨도 마지막 커서 캐릭터가 앞 커서들 뒤에서 기다리지 않는다.
- 화면을 나갈 때(dispose) 등급 2·3 으로 아직 시작 전인 요청은 큐에서 뺀다(코어 `drop`) — 광장 뒤 받기(P3)가 캐릭터 선택 나머지 36 MB 뒤에서 기다리지 않게.
- GPU 단계(숨은 무대 조립·compileAsync·initTexture·한 번 그리기, 한 프레임에 하나)·슬롯 요청 번호·랜덤·잠김 칸 비움·결정 모션 시간축·보이스 요청 번호(charselect.md §12.10)는 그대로. 받기 전에 커서가 간 칸은 지금처럼 준비되면 바로 붙는다(pump 가 보이는 슬롯 캐릭터를 등급 0 으로).
- 같은 키 공유: 광장 플레이어(`plaza/player/…`)·NPC(`plaza/world/chara/…`) Preview3D 도 같은 브로커를 지나므로 흐름 예측(`plaza:player:<pc>`·`plaza:npc`)과 한 번만 받는다. ~~캐릭터 선택 모델과 광장 플레이어 모델은 다른 파일이라 키를 나눠 쓰지 않는다.~~ → 2026-10-08 캐릭터 공용 폴더([chara_assets.md](chara_assets.md)): 세 화면(캐릭터 선택·광장·mg1801)이 같은 모델·모션·텍스처를 같은 키 `chara/…` 로 읽는다. 캐릭터 선택에서 받은 마리오는 광장 플레이어 묶음의 97 % 를 이미 채운다(mg1801 은 관리자 밖 — 같은 주소라 HTTP·서비스 워커 캐시).
- 같은 키 공유(2D·소리): 여러 화면이 같은 바이트로 갖던 시스템 효과음·UI 그림은 공용 `common/…` 한 벌이고, 그림은 broker uiimage, 효과음은 `assetHooks.loadBytes` → broker `bytes`(P1)로 화면 사이에서 한 번 받는다([common_assets.md](common_assets.md) §7).

### 13.5 시작 순서·로딩 문구

- 페이지가 열리면(`?plaza=1`) `boot` → 인원 설정 2D 를 P0 으로 가장 먼저. 3D 화면용(캐릭터·광장) 받기는 P2/P3 라 P0(첫 화면 그림)이 하나라도 남아 있으면 시작하지 않는다.
- `main.ts` 의 "광장 읽는 중 n/total" 문구를 없앤다. 준비가 끝나 있으면 바로 진입하고, 덜 됐으면 앞 화면이 끝난 검은(페이드 아웃) 화면을 유지한다(§2.3·§10 1). 진행 수는 시험 훅(`hook.flow`)으로만.

### 13.6 사건 계약 ([plaza-gl] §14 와 — SHARED.md)

`appFlow()`(`script/view/appFlow.ts`, `globalThis.__mpjFlow` 하나)의 `on(fn): () => void`.

| 사건 | 언제 |
|---|---|
| `{ type: 'enter', screen }` | 화면 진입 — 자기 묶음을 P0 로 요청한 직후 |
| `{ type: 'predict', screen, bundle, pri }` | 다음 화면 묶음 키가 정해져 요청됨(P2/P3, 등급이 바뀔 때마다). 키 = `flow.keys(bundle)` → `[키, kind][]` |
| `{ type: 'ready', bundle }` | 묶음 키 전부 관리자 ready(받기 + CPU 풀기 끝) |
| `{ type: 'hint', key, value }` | 받기와 무관한 알림 — `chara1P` = 캐릭터 선택에서 결정한 1P(첫 사람) 캐릭터 pcNN([plaza-gl] 요청, 그 재질 미리 컴파일용) |

광장 GPU 미리 준비 시작 = `ready` 의 `bundle === 'plaza:p0'`(값은 `appAssets().peek(key)`). 구독 함수는 동기로 불리고 던지면 무시한다.

### 13.7 시험 (`tools/test_prefetch.ts`, 노드 — 헤드리스 없음)

- 가짜 시계 + 가짜 망(RTT + 대역폭을 동시 요청이 똑같이 나눠 씀), 응답 크기 = 압축본(`assets-dist`) 실제 파일 크기, json 은 실제 명세 내용. 처리기는 같은 kind 의 가짜(glb 풀기 = 실제 glb 의 이미지 참조를 `texture` 로 P1 요청 — mpj 대리 로더와 같은 동작). 흐름(`flow.ts`·`flowTable.ts`·`flowCatalog.ts`)·코어·Preview3D 요청 규칙은 실제 코드.
- 시나리오: 열림 → 인원 설정(체류 가정) → 캐릭터 선택(커서 이동·결정) → 광장. 확인: 요청 순서·등급 올리기/내리기, 화면 진입 때 그 화면 묶음의 받은 바이트 비율, lite 범위, 캐릭터 선택 진입 때 받는 양(커서만), 같은 키 중복 받기 0.

### 13.8 구현 결과 [실측 — 노드 시험 `tools/test_prefetch.ts`, 2026-10-08]

**파일**: 새 `script/view/flowTable.ts`(표)·`flow.ts`(FlowPrefetch)·`flowCatalog.ts`(묶음 키, 동적 import)·`appFlow.ts`(앱 인스턴스·브로커·모드), `tools/test_prefetch.ts`. 수정: `lib/assetcore/index.ts`(`lower`·`drop` 두 메서드 — import 0 유지), `stage3d/assetHandlers.ts`(`uiimage` 처리기), `charselect/assetHooks.ts`(`broker` 끼움점)·`preview3d.ts`(관리자 경유·등급·내리기·dispose 때 빼기)·`screen.ts`(`charaTiers`), `plaza/world.ts`(`plazaP0Paths` 추가만, World 무변경), 페이지 `main.ts`(enter 줄·문구 제거)·`charselect_page.ts`(enter·결정 알림·소리 바이트 관리자 경유)·`setplayer_page.ts`(취소 때 enter)·`modeselect_page.ts`·`mgm01_page.ts`(커서 알림)·`plaza_page.ts`(기구 구역 알림).

정정(구현 중, 13.2·13.3 반영):
- 예측은 **자기 묶음 키가 정해진 뒤**에 낸다 — 자기 묶음 명세 json(P0)이 끝나는 순간 P0 가 비어 P2 명세 json 이 먼저 시작했다(시험 100 Mbps lite 에서 −436 ms).
- 표의 예측은 **등급 순**(P2 묶음 준비 끝 → P3) — 코어는 P2 가 받는 중이어도 P3 를 시작해, 4G 에서 캐릭터 선택 진입 때 미리 받은 비율이 84 % 에 그쳤다 → 100 %.
- 주변 칸은 **사람 커서 기준**(COM 커서 기준까지 넣으면 9칸) — 순서(거리)는 지금처럼 모든 커서 기준.
- 캐릭터 선택 소리(SE·BGM·보이스 1.65 MB)는 2D 묶음에서 떼어 `charselect:sound`(설정 화면에서 P2), 화면 안에서는 페이지가 P1 로(관리자 바이트 → `decodeAudioData`, 광장과 같은 키 공유).
- 묶음 키 중복 제거(광장 P0 의 모델끼리 같은 텍스처).

**묶음 크기**(압축본, glb 안 텍스처 포함): setplayer 3.48 MB · charselect 2D 0.68 · charselect:sound 1.65 · 캐릭터 한 명 0.47~4.53(마리오 3.43, 잠기지 않은 20명 40.93) · plaza:p0 31.11 · plaza:ui 26.52 · plaza:npc 15.95 · plaza:player(마리오) 3.67 · modeselect 1.63 · mgmet 12.17 · mgm01 20.83(그림만).

**캐릭터 선택 진입 때 받는 양**: 전 = 잠기지 않은 20명 전부 요청(40.93 MB, 동시 2개 차례) + 2D·소리 → 후 = 2D 0.68 + 커서 캐릭터 1명(마리오 3.43) — 예측 없음(off)에서 진입~커서 준비 동안 실제 받은 양 3.96 MB, 그 밖 키 0. 예측 있음(full·lite)이면 설정 화면에서 이미 받아 **진입 때 0 MB**.

**흐름 시나리오**(사람 체류 가정: 인원 설정 8 s, 캐릭터 선택 = 3·4·4.3 s 에 오른쪽 이동, 10 s 에 결정, 결정 → 광장 1.5 s):

| 망 | 모드 | 인원 설정 첫 화면 | 캐릭터 선택 진입: 미리 받음 / 2D·커서 3D 대기 | 커서 이동 뒤 그 캐릭터 대기(3회) | 광장 진입: 미리 받음 / 대기(받기만) |
|---|---|---|---|---|---|
| 4G 9 Mbps·RTT 170 ms | full | 5.18 s | 100 % / 0·0 s | 미완·4.40·3.71 s | 10 % / 64.7 s |
| | lite | 5.18 s | 100 % / 0·0 s | 5.98·5.63·5.66 s | 5 % / 69.3 s |
| | off(예측 없음) | 5.18 s | 0 % / 1.92·5.32 s | 6.98·미완·4.95 s | 1 % / 71.8 s |
| 100 Mbps·RTT 20 ms | full | 0.53 s | 100 % / 0·0 s | 0·0·0 s | **100 % / 0 s** |
| | lite | 0.53 s | 100 % / 0·0 s | 0·0.03·0.22 s | 100 % / 0 s |
| | off | 0.53 s | 0 % / 0.22·0.53 s | 0·0·0 s | 1 % / 6.38 s |

- 확인(104/104): 인원 설정 2D(P0)가 끝나기 전 P2·P3 받기 시작 0, 진입~커서 준비 동안 화면 2D·커서 캐릭터 밖 받기 0, 커서에서 빠진 캐릭터 내림, 광장 P0 묶음 P3(설정) → P2(결정) → P0(진입), lite = 설정 화면에서 광장 예측 없음·먼 칸 캐릭터 요청 0, off = P0 만, **같은 키 중복 받기 0**(6 시나리오 전부), 광장 P0 모델 22(§12.2 와 같음), 묶음 파일 전부 존재.
- "미완" = 다음 이동·결정 전에 끝나지 않았고 그 뒤 내려지거나 빠짐(정상).

**기대 효과 계산**: 광장 진입 전 메뉴 체류 ≈ 8 + 10 + 1.5 = 19.5 s.
- 100 Mbps(12.5 MB/s): 체류 동안 약 244 MB 를 받을 수 있다. 캐릭터 선택(2D·소리·커서·주변 ≈ 15 MB) + 광장 4묶음 77.3 MB = 약 92 MB → **광장 진입 대기 6.4 s → 0 s**(받기 기준). 캐릭터 선택은 진입·커서 이동 모두 0.
- 4G(1.125 MB/s): 체류 동안 약 22 MB. 캐릭터 선택 몫(약 6 MB)은 설정 화면 8 s 안에 끝나 **진입 대기 5.3 s → 0**, 하지만 광장 77.3 MB 는 숨길 수 없다(진입 때 10 %, 대기 71.8 → 64.7 s, −7 s). 4G 에서 광장 대기를 없애려면 광장 첫 화면 몫 자체를 줄여야 한다 — 가장 큰 것이 광장 UI 26.5 MB(합친 명세의 그림 전부: 온라인·카드·얼굴 포함, 레이아웃 단위 지연 §10 5)와 P0 무대 31 MB.
- GPU 준비(업로드·컴파일)는 이 수치에 없다 — [plaza-gl] §14 가 `ready('plaza:p0')` 사건으로 앞 화면에서 한다.

---

## 14. 4단계 — 광장 렌더러 하나 (광장만) [설계 — 구현 전에 먼저 적음, [plaza-gl]]

사용자 지시: "그러면 광장 부분만 해 봐." 렌더링 **코드**(stage3d·render2d·mgmcommon)는 이미 공용이지만, 실행 중 **렌더러 인스턴스(WebGL 문맥)** 는 화면마다 새로 만들고 나갈 때 버린다. 그래서 앞 화면에 있는 동안 광장의 셰이더 컴파일·GPU 업로드를 미리 할 수 없다. 이번에는 광장만 바꾸고, 다른 화면(인원 설정·캐릭터 선택·모드 메뉴·미니게임)은 지금처럼 자기 렌더러를 쓴다(§8 "화면 하나씩").

### 14.1 구조 전/후

| 항목 | 전 | 후 |
|---|---|---|
| 광장 문맥 | 2개 — 무대(`stage3d/stage.ts`) + UI 투명 렌더러(`plaza/ui/view.ts`, 1920×1080·MSAA) | **1개** — 무대 렌더러에 UI 를 3D 다음 패스로 그림 |
| 광장 렌더러 수명 | 광장 화면(들어갈 때 만들고 나갈 때 dispose) | **앱 수명**(`view/plazaGl.ts` 가 처음 필요할 때 1번 만듦, 나갈 때 캔버스만 뗌) |
| 광장 재진입(기구 → 모드 메뉴 → 광장 복귀 등) | 새 문맥 → 텍스처·버퍼를 다시 올리고 프로그램을 다시 컴파일 | 같은 문맥 → 같은 키 프로그램 컴파일 0, 관리자 캐시 텍스처·모델 버퍼 업로드 0(§14.3) |
| 앞 화면(인원 설정·캐릭터 선택·모드 메뉴)에서 | 받기·풀기만([flow-prefetch] §13) | + 광장 렌더러(화면 밖 캔버스)에서 광장 P0 GPU 준비(§14.5) |
| 다른 화면 | 자기 렌더러 | **그대로**(무수정). 광장 렌더러와 동시에 문맥 2~3개(§14.6) |

### 14.2 앱 수명 광장 렌더러 `PlazaGl` (`script/view/plazaGl.ts`, mpj 3층)

- 앱에 하나(`globalThis.__mpjPlazaGl`). 캔버스(`jw-gl`)와 `WebGLRenderer({ antialias: true })`(무대가 만들던 것과 같은 옵션)를 **처음 필요할 때 한 번** 만든다(미리 준비 또는 광장 진입).
- 광장 진입: `attach(stage)` 로 캔버스를 화면 상자에 붙인다. 크기는 페이지 ResizeObserver 가 맞춘다.
- 광장 나감: `leave()` 순서 = 프로그램 고정(§14.3) → 부품·무대 dispose → 캔버스 떼기. 렌더러는 dispose 하지 않는다.
- 내림(`drop()`): `renderer.dispose()` + `forceContextLoss()`. GPU 예산을 넘을 때(§14.6)와 문맥을 잃었을 때만 한다. 그다음 진입은 새 렌더러(지금과 같은 비용).
- 의존: 정적 import 는 three·`appAssets`·`appFlow`(흐름 사건 구독)뿐이다. 광장 무대 코드(`shell/plaza`)는 미리 준비가 시작될 때 동적 import 한다(코드 분할 유지, §5.8.8). 시험용으로 캔버스·렌더러·world 만들기를 주입할 수 있다.

### 14.3 재진입 때 남기는 것 — 무대 `gpu` 모드 (`Stage3D` 옵션 `gpu: { renderer, uploads, keep }`)

무대가 렌더러를 받으면(앱 수명), 렌더러를 만들지도 버리지도 않고 **관리자 캐시 몫 GPU 데이터**도 버리지 않는다.

| 대상 | 전(나갈 때) | 후(나갈 때) | 근거 [코드: three r180] |
|---|---|---|---|
| 셰이더 프로그램 | 재질 dispose → `usedTimes` 0 → 삭제 | `PlazaGl.leave()` 가 부품·무대 dispose **전에** `renderer.info.programs` 전부를 한 번씩 고정한다(`usedTimes + 1`, 이미 고정한 것은 건너뜀). 재질을 버려도 프로그램은 남고, 다음 무대의 같은 키 재질은 `acquireProgram` 이 찾아 쓴다(컴파일 0). 캐릭터·NPC·UI·후처리·PMREM 프로그램도 같이 남는다. 그림자 깊이 재질은 렌더러의 `shadowMap` 안에 있어 원래 남는다 | `WebGLPrograms.acquireProgram`(cacheKey)·`releaseProgram`, `WebGLInfo.programs`(타입 공개) |
| 관리자 캐시 텍스처의 복제 | `MaterialSetup.dispose` 가 복제를 dispose → source 의 GL 텍스처 `usedTimes` 0 → 삭제 | 관리자에서 온 복제(`fetchTexture`)는 dispose 하지 않는다 → GL 텍스처가 source 에 남음 | `WebGLTextures._sources`(source → cacheKey → GL 텍스처) |
| 같은 source 다시 올리기 | — | `Texture.clone()`(`copy` 끝의 `needsUpdate = true`)과 `MaterialSetup.texture()` 의 `needsUpdate` 는 **source.version 을 올려서**, 다음 사용 때 같은 그림을 다시 올린다(지금도 무대 안에서 늦게 만든 복제는 다시 올림). 그래서 `ScenePreparer` 에 옵션 `uploads` 를 둔다(렌더러 하나에 하나, WeakMap source → {올린 version, data}). `initTexture` 전에 source 가 같고 **data 객체도 같은데** version 만 올라 있으면, 기록한 version 으로 되돌린다 → 업로드 0. GL 텍스처가 이미 지워졌다면 three 가 새 텍스처를 만들며 강제 업로드(`forceUpload`)하므로 되돌려도 안전하다 | `uploadTexture`: `source.version !== sourceProperties.__version` 또는 `forceUpload` 일 때만 올림 |
| 모델 기하(관리자 glTF 템플릿과 같이 씀) | 무대가 모든 메시 geometry 를 dispose(캐시 템플릿 버퍼까지 내림) | 관리자 템플릿의 geometry 는 dispose 하지 않는다(버퍼·VAO 남음). 무대 전용 기하(하늘 상자 등)만 dispose | `WebGLGeometries`·`WebGLBindingStates`(geometry.id × program.id) |
| 뼈 텍스처 | 렌더러와 같이 사라짐 | 무대 장면의 `SkinnedMesh.skeleton.dispose()`(복제마다 skeleton 이 새로 생김) | — |
| 후처리 체인(`PostChain` — RT·재질 6개)·하늘(상자·재질)·IBL(PMREM 생성기·큐브 캐시)·광장 UI 그리기(`PlazaUiView` — 명세·그림·UI RT·재질) | dispose(다음 진입에 HDR 읽기·PMREM 렌더·재질 다시 만듦) | **렌더러 수명 `keep`** 에 두고 다시 씀(env 값·부품 목록이 같으면 같은 것). dispose 하지 않음 | 아래 "정정" |
| 준비 1×1 RT, HDR 로 직접 읽은 텍스처 | dispose | 그대로 dispose | — |
| 부품(1P·COM 플레이어·NPC)의 자기 자원 | 부품 dispose | 그대로(부품 코드 무수정, 프로그램만 고정으로 남음) | — |

- **정정(구현 중, 시험으로 찾음)**: 프로그램 고정만으로는 `ShaderMaterial`(후처리·하늘·UI·PMREM)이 다시 컴파일된다. three 는 같은 셰이더 코드를 쓰는 마지막 재질이 dispose 되면 셰이더 단계 번호(`WebGLShaderCache`)를 지우고, 다음 재질은 새 번호를 받아 **프로그램 키가 달라진다**(`getProgramCacheKey` 의 `customVertexShaderID`). 가짜 렌더러에 이 규칙을 넣자 재진입 새 컴파일이 7 이었다(후처리 5·UI 2). → 그 물건들을 재질째 렌더러 수명 `keep`(`Map`, 렌더러마다 새로·`drop` 때 dispose)에 두어 0 으로 만들었다. 덤으로 재진입 때 IBL HDR 읽기·PMREM 렌더·후처리 RT 할당·UI 그림 디코드·업로드도 없어진다. 표준 재질(`onBeforeCompile` 패치 포함)은 `shaderID` 키라 고정만으로 된다.

- 원본 동일성: 그리는 내용과 순서는 같다. 바뀌는 것은 GPU 데이터를 언제 올리고 언제 지우는지뿐이다.
- 문맥을 잃으면(`webglcontextlost`) three 가 복구 때 상태를 새로 만들고, 쓰는 순간 다시 올린다. `uploads` 기록은 렌더러마다 새로 만든다(내림·문맥 잃음 뒤 비움).

### 14.4 광장 안 문맥 2 → 1 (UI 합성)

| 단계 | 렌더 타깃 | 내용 |
|---|---|---|
| 1 무대 | 후처리 RT → … → 화면 | 지금 그대로: 장면(HalfFloat 선형) → 블룸 → 노출·톤맵·비네트·감마·LUT → FXAA → **화면**(`post.ts`). 후처리는 3D 에만 |
| 2 UI 레이아웃 | UI 선형 RT(1920×1080 HalfFloat, MSAA 4) | 지금 그대로(Render2D 장면을 투명으로 지우고 그림) |
| 3 UI 내보내기 | **UI 8비트 RT**(1920×1080 RGBA8, 새) | 지금 투명 캔버스에 쓰던 셰이더 그대로: `c = rgb / a` → sRGB → `(s·a, a)`(프리멀티) |
| 4 합성 | 화면(무대 렌더러 기본 버퍼) | 3 의 RT 를 전체 화면 사각형으로 그림. 섞기 `ONE, ONE_MINUS_SRC_ALPHA`(프리멀티 over), 지우지 않음 |

- 근거: 지금은 브라우저가 프리멀티 알파 캔버스(UI, `premultipliedAlpha: true`)를 불투명 캔버스(무대) 위에 `결과 = ui + (1 − a)·무대` 로 합성한다. 8비트 sRGB 값끼리 섞고, 1920×1080 캔버스를 화면 크기로 늘린다. 4 는 같은 식을 같은 8비트 값(3 의 RGBA8)에 쌍선형 표본으로 적용한다 → 결과는 반올림 ±1 안에서 같다 [추정 — 사용자 눈 확인 목록에 넣음].
- 3 을 화면에 바로 그리지 않는 이유: UI 선형 RT 를 화면 크기로 표본하면 가장자리 거르기 순서가 달라진다. 지금은 "sRGB 로 바꾼 뒤 늘림"이고, 바로 그리면 "늘린 뒤 sRGB"가 된다. RGBA8 RT 하나(8.3 MB)가 늘지만, UI 문맥의 기본 버퍼(1920×1080 RGBA + MSAA 4 + 깊이, 약 50 MB [추정])가 없어져 메모리는 준다.
- 공유 렌더러 상태는 바꾼 뒤 되돌린다: `autoClear`(UI 동안 false), 지우기 색·알파, 렌더 타깃. 무대의 지우기 색(env.clear)과 톤맵(NoToneMapping)은 건드리지 않는다.
- 위에 덮이는 DOM: 기구 페이드(`balloon.ts Fade`, z-index 50)는 지금도 UI 캔버스 위에 있다 → 오버레이에 그대로 있어 순서가 같다.
- render2d 는 이미 `render(gl)` 로 렌더러를 받는다. `PlazaUiView.create(renderer, url, parts)` 로 바꿔 무대 렌더러를 주입한다(새 렌더러·캔버스를 만들지 않음).
- 앱 수명 렌더러면 UI 부품(`ui/part.ts`)이 `PlazaUiView` 를 `stage.keep('plaza-ui')` 에 두고 재진입 때 그대로 쓴다(§14.3 정정). 명세 덧붙이기(online·plaza_ui·card extra)는 없는 키만 넣어 여러 번 불러도 같다 [코드 확인].

### 14.5 앞 화면에서 미리 준비 (`PlazaGl.prewarm`)

- **언제**: [flow-prefetch] 사건 `{ type: 'ready', bundle: 'plaza:p0' }`(받기 + CPU 풀기 끝, §13.6). 인원 설정·캐릭터 선택·모드 메뉴 어디서든, 광장 화면 밖일 때. 광장 무대 코드는 이때 동적 import 한다.
- **무엇을**: 광장 world 를 광장 렌더러(화면 밖 캔버스 — DOM 에 붙지 않음)에 **실제로 만든다**.
  1. 무대(manifest·IBL·하늘·후처리)
  2. P0 모델(템플릿 복제·재질·부착·기본 애니)
  3. GPU 준비(`ScenePreparer`: 텍스처 `initTexture` 한 장씩 → `compileAsync` → 1×1 버퍼 업로드)
  4. 후처리 프로그램 미리 컴파일(`PostChain.precompile`, RT 단계와 화면 단계를 각자의 셰이더 키로)
  
  진입하면 이 world 를 그대로 넘겨받는다(같은 재질 객체라 키가 어긋날 일이 없다).
- **앞 화면이 끊기지 않게**:
  - 등급 바닥 P2: 미리 준비 중의 관리자 `get/want` 는 P2 보다 높게 부르지 않는다(`PriorityFloor`, 무대·world 공용) → 캐릭터 선택 커서(P0)를 막지 않는다.
  - CPU 조립 속도 조절: 모델 조립(복제·재질·부착)을 **프레임마다 하나**씩 한다(`pace`). P0 22 모델이 한꺼번에 풀려 한 프레임을 길게 잡지 않게 하려는 것이다.
  - GPU 단위는 앱 공용 스케줄러(`appAssets().scheduler`)에서 예산 **2 ms**(§5.4 모바일 값)로 돈다. 단위 하나는 예산을 넘어도 한다(큰 텍스처 한 장, `compileAsync` 시작 한 번 — KHR_parallel_shader_compile 이 있으면 컴파일은 비동기).
  - 무대 IBL HDR 큐브(관리자 밖 `HDRCubeTextureLoader`)는 지금처럼 직접 받는다(작음).
- **진입 때**: `take()` 가 바닥을 P0 로 내리면서 남은 키와 준비 작업을 계획 등급(P0)으로 올린다. 속도 조절을 풀고, 예산을 50 ms(첫 화면 로딩)로 둔다. 진행 문구는 남은 P0 만 센다. 미리 준비가 덜 끝났으면 거기서부터 이어서 한다.
- **진입 때 남는 일**:
  1. 부품 만들기 — 1P·COM 플레이어(Preview3D)·NPC·UI 레이아웃(그림 업로드는 첫 그리기 때)
  2. 그 부품들의 프로그램 컴파일(첫 진입만, 재진입은 고정으로 0)
  3. `warmup` 의 숨김 포함 전체 그리기 1회(그림자 깊이 재질 변형 — 렌더러 안에 남으므로 첫 진입만)
  4. 미리 준비 중 끝나지 않은 나머지
- **1P 캐릭터 프로그램(선택)**: 결정 뒤 사건 `ready` 의 `plaza:player:<pc>`(§13.2)가 오면, world 미리 준비 뒤에 그 캐릭터를 `PlazaCharaLoader` 로 광장 장면에 숨겨 올리고 GPU 준비(컴파일)를 한다. 진입한 부품이 같은 키 프로그램을 쓰기 시작한 뒤 버린다. 값은 [flow-prefetch] 브로커 캐시에 있어 다시 받지 않는다. NPC 는 부품(`createNpcs`)이 ctx 에 묶여 있어 이번에는 미리 컴파일하지 않는다(첫 진입 때 컴파일, 재진입은 0).
- 미리 만든 world 를 쓰지 않고 흐름이 끝나면(설정 취소) 들고 있다가 다음 진입 때 쓴다.
- 미리 준비하지 않는 경우: `?loader=seq`(비교용), `?nowarm=1`, `?plazagl=0`(이 단계 끄기 — 이전 방식 비교용).

### 14.6 문맥 수·GPU 메모리 (§5.7 예산)

| 화면 | 문맥 [코드] |
|---|---|
| 인원 설정 | 설정(MgmView) + 광장(화면 밖, 미리 준비가 시작됐으면) = 2 |
| 캐릭터 선택 | 설정(숨김, 살아 있음) + 캐릭터 선택 + 광장 = 3 |
| 광장 | **1**(전 2) |
| 모드 메뉴 | 모드 메뉴 + 광장(들고 있음) = 2 |
| mgmet·프리 플레이 목록 | 그 화면 + 광장 = 2 |
| 미니게임 | 게임(`view/renderer.ts`) + HUD(`lyt.ts` 화면 밖) + 광장 = 3 |

- 상한 [추정 — 브라우저 구현값]: 크롬 데스크톱·안드로이드는 페이지당 활성 문맥 16개(넘으면 가장 오래된 것을 잃음), 사파리(iOS)도 수 개~16 수준, 파이어폭스는 더 크다. 최대 3개라 상한과는 거리가 멀다. 모바일에서 문제가 되는 것은 개수보다 **메모리**다.
- GPU 메모리 [추정 — `assets-dist/report.json` 의 파일별 GPU 추정, 밉 포함]:
  - 광장 P0 미리 준비 = 모델 22·텍스처 119장 ≈ PC 73 MB / 모바일 60 MB + 버퍼(glb 10 MB 안팎) + 렌더 타깃(화면 밖이라 작음).
  - 광장을 다 돈 뒤 들고 있는 양 = 무대 텍스처(전부 489장, PC 173 MB / 모바일 145 MB) + 기하. 부품 몫은 나갈 때 지운다.
  - 실측 광장 전체(살아 있는 합, RT 포함)는 413.5 MB(assets_pipeline §9.3).
- **예산 규칙**(나갈 때 `leave()` 가 판단):
  - 들고 있을 양 = 광장 장면 + `keep` 의 하늘·UI 그리기 장면의 텍스처(source 하나에 한 번, `textureBytes`) + 기하 바이트. 렌더 타깃(후처리 HDR·블룸 밉·UI 1920×1080 두 장 — 1080p 에서 약 50~80 MB [추정])은 셈에 넣지 않았다(과소 추정 쪽).
  - 예산 = §5.7 GPU(PC 2 GB / 모바일 `deviceMemory ≤ 4` 600 MB) × **0.6**. 나머지 0.4 는 다음 화면 몫이다(가장 큰 미니게임 mg1801 ≈ 100~200 MB).
  - 넘으면 `drop()`(문맥째 버림 → 다음 진입은 지금과 같은 비용).
  - 미리 준비는 P0 만 한다(P1·P3 은 진입 뒤 지금처럼).
- **사용자 확인 필요**: 0.6 비율, 모바일 판정(`deviceMemory ≤ 4`), 모바일에서 광장을 다 돈 뒤(≈ 300 MB 이상) 들고 있을지(지금 기본 = 예산 안이면 들고 있음).

### 14.7 시험 (`tools/test_plaza_gl.ts`, 노드 — 헤드리스 없음)

**가짜 렌더러**는 three 의 프로그램 캐시(cacheKey → 프로그램, `usedTimes`, `info.programs`)와 텍스처 업로드 규칙(source × cacheKey → GL 텍스처, `source.version` 비교, 강제 업로드)을 흉내 낸다. 그 위에서 실제 코드(`ScenePreparer`·`FrameScheduler`·`Stage3D` dispose·`PostChain.render`·`PlazaUiView.end`·`PlazaGl`)를 돌린다.

| 확인 | 기대 |
|---|---|
| 광장 3회 진입(붙이기·나가기) | 새 렌더러 1(재진입 0), 캔버스 같음, 살아 있는 문맥 1, UI 용 렌더러 0 |
| 미리 준비(예산 2 ms, 가짜 시계) | 프레임당 쓴 시간 ≤ 예산 + 단위 하나. 미리 준비된 프로그램·텍스처 수 = 장면의 고유 키·source 수. 진입 때 남은 일 = 새 부품 몫만 |
| 재진입(새 무대 + 새 복제 텍스처 + 새 재질) | 새 컴파일 0, 텍스처 업로드 0(되돌린 version 수 = 복제 수), 관리자 텍스처·기하 dispose 0, 무대 전용(하늘·RT)은 dispose 함 |
| 등급 바닥 | 미리 준비 중 요청 등급 ≥ P2, 진입 뒤 P0 로 올림 |
| 그리기 순서 | 후처리의 마지막 화면 쓰기(FXAA) → UI 선형 RT → UI 8비트 RT → 화면 합성(프리멀티 섞기, 지우기 없음). 렌더러 상태(autoClear·지우기 색·타깃) 되돌림 |
| 예산 | 들고 있을 양이 예산 × 0.6 을 넘으면 내림(다음 진입 때 새 렌더러 1개 더) |

### 14.8 사용자가 직접 볼 것(헤드리스 대신)

1. 광장 첫 화면: 하단 파티 줄·텔롭·안내 글자 가장자리·반투명 판이 전과 같은가(UI 합성 경로가 바뀜).
2. 기구 페이드: 검은 막이 UI 까지 덮는가(전과 같아야 함).
3. 블룸·LUT 색이 UI 에 번지지 않는가(UI 는 후처리 뒤).
4. 기구 → 모드 메뉴 → 광장 복귀: 복귀 대기가 첫 진입보다 짧은가, 화면이 같은가.
5. 인원 설정·캐릭터 선택에서 커서·모델 회전이 끊기지 않는가(뒤에서 광장 준비 중).
6. 창 크기 바꾸기·전체 화면: UI 위치·크기가 3D 와 맞는가.

### 14.9 구현 결과 (2026-10-08) [시험: `tools/test_plaza_gl.ts` 60/60 — 가짜 렌더러, 수치는 시험 장면 기준]

**파일**

| 층 | 파일 | 바꾼 것 |
|---|---|---|
| 2 three 어댑터 | `lib/assetcore-three/index.ts` | `ScenePreparer` 옵션 `uploads`(source → 올린 version·data) — 같은 data 면 version 되돌림, `stats.reused` |
| 3 mpj | `view/plazaGl.ts`(새) | `PlazaGl`(앱 수명 캔버스·렌더러·`uploads`·`keep`, enter/leave/pin/drop, 예산), `worldStarter(env)`(미리 준비·진입 공용 world 만들기 규칙), `FramePacer`, `sceneGpuBytes`, `installPlazaGl()`(흐름 사건 구독) |
| 3 mpj | `shell/stage3d/stage.ts` | `StageGpu`(렌더러·uploads·keep) 주입, `PriorityFloor`(등급 바닥·내릴 때 올리기), gpu 모드 dispose(관리자 템플릿 기하·관리자 텍스처 복제·keep 물건 남김, 뼈 텍스처 버림), 후처리·하늘 keep |
| 3 mpj | `shell/stage3d/material.ts` | `IblShare`(PMREM 생성기·IBL 큐브 캐시 공유), `dispose(keepManaged)` |
| 3 mpj | `shell/stage3d/post.ts` | `precompile()`(RT 단계·화면 단계 셰이더 키로 compileAsync) |
| 3 mpj | `shell/plaza/world.ts` | 옵션 `gpu`·`floor`·`budgetMs`·`pace`, 관리자 요청·준비 작업에 바닥 적용 |
| 3 mpj | `shell/plaza/scene.ts` | 옵션 `gpu`·`world`(미리 만든 것 넘겨받기) |
| 3 mpj | `shell/plaza/ui/view.ts`·`ui/part.ts` | UI 문맥 없앰 — 무대 렌더러에 3D 다음 패스(선형 RT → 8비트 RT → 화면 프리멀티 합성), `keep('plaza-ui')` |
| 3 mpj | `shell/plaza/player.ts` | `PlazaCharaLoader.load` 선택 인자 `tick`(1P 캐릭터 미리 컴파일을 프레임마다) |
| 페이지 | `plaza_page.ts` | 캔버스 = `plazaGl().enter`, 나갈 때 `gl.leave(장면, () => run.stop())`, `?plazagl=0` 이면 이전 방식 |
| 페이지 | `main.ts` | 1줄: `?plaza=1` 이면 `installPlazaGl()`(동적 import) |
| 시험 | `tools/test_plaza_gl.ts`(새) | §14.7 |

**시험 수치**(가짜 렌더러, 시험 장면 = P0 모델 2·재질 4·라이트맵 2, 후처리 켬, 1P 캐릭터·UI 부품 흉내)

| 단계 | 새 컴파일 | 텍스처 업로드 | 기하 업로드 | 비고 |
|---|---|---|---|---|
| 미리 준비(화면 밖) | 8(무대 2·후처리 5·1P 캐릭터 1) | 7 | 5 | 9 프레임, 스케줄러 프레임당 최대 3.0 ms(예산 2 + 단위 하나), 관리자 요청 9건 전부 ≥ P2, P0 모델 조립은 프레임마다 하나 |
| 첫 진입(미리 준비 넘겨받음) | **2**(UI 내보내기·합성) | **1**(1P 캐릭터 자기 텍스처) | 4(캐릭터·UI·후처리 사각형) | world 기다림 1 프레임 |
| 재진입(미리 준비 없음, 같은 렌더러) | **0** | **1**(캐릭터 자기 텍스처) | **1** | 복제 version 되돌림 2(라이트맵), 템플릿 기하 다시 올림 0, 새 렌더러 0 |
| 비교: 이전 방식 재진입(새 문맥) | 10 | 7 | 8 | |

- 나가기: 프로그램 10개 고정·삭제 0, 관리자 템플릿 기하 dispose 0, GL 텍스처 삭제 = 캐릭터 1장, 렌더러 dispose 0·문맥 1, 캔버스만 뗌.
- 그리기 순서: FXAA(화면) → UI 레이아웃(UI 선형 RT) → UI 내보내기(8비트 RT) → 합성(화면, `ONE, ONE_MINUS_SRC_ALPHA`), UI 패스 동안 화면 지우기 0·autoClear 끔, 끝에 autoClear·타깃·무대 지우기 색 되돌림.
- 예산: 들고 있을 양 > 예산 × 0.6 → dispose + forceContextLoss, 다음 진입 새 렌더러 1. 문맥을 잃었으면 다음 진입 때 버리고 새로. 광장 안에서는 미리 준비 안 함.
- 정적: 광장 셸에서 `new THREE.WebGLRenderer(` 0, 무대는 `gpu` 가 있으면 만들지 않음, 코어 import 0·어댑터 import ⊂ {three, 코어}, `plazaGl.ts` 정적 import = three·lib·env.

**실제 광장 데이터로 본 미리 준비 양**(`plazaP0Paths` + `assets-dist/report.json`, [추정]): P0 모델 22·glb 참조 텍스처 119장 ≈ GPU PC 73.1 MB / 모바일 59.9 MB(+ MaterialSetup 이 이름으로 읽는 텍스처·버퍼). 무대 텍스처 전부는 489장 172.6 MB(PC). 프로그램 수는 실제 브라우저에서만 셀 수 있다 — §12.3 의 첫 진입 warmup(텍스처 289·프로그램 78, SwiftShader)이 미리 준비 + 부품 몫으로 나뉜다.

**진입 때 남는 일**(실제, [추정]):

| | 첫 진입(미리 준비 끝남) | 재진입 |
|---|---|---|
| 무대 P0 모델 받기·조립·GPU 준비 | 0 | 무대 조립(CPU: 템플릿 복제·재질) — 받기·업로드·컴파일 0 |
| IBL·후처리·하늘·UI 그리기 | 0(UI 는 진입 때 만들고 UI 그림 업로드는 첫 그리기 때) | 0(keep) |
| 부품: 1P·COM 플레이어·NPC(Preview3D 읽기·준비) | 있음(받기는 [flow-prefetch] 가 미리) | 있음(프로그램 0, 텍스처는 Preview3D 가 매번 새로 만들면 업로드) |
| 그림자 깊이 재질 변형 | 첫 진입 1회 | 0 |
| 전체 그리기 1회(warmup) | 있음 | 있음(가벼움) |

### 14.10 사용자 확인 필요 (이 단계)

1. GPU 예산 비율 0.6·모바일 판정(`deviceMemory ≤ 4` → 600 MB)·모바일에서 광장 전체(≈ 300 MB 이상)를 들고 있을지 — 지금 기본은 예산 안이면 들고 있음(§14.6). 들고 있을 양 추정에 렌더 타깃(50~80 MB)은 빠져 있다.
2. 첫 미리 준비 때 IBL PMREM 생성(셰이더 3개 동기 컴파일 + 블러 패스)은 한 덩어리라 인원 설정·캐릭터 선택 화면에서 한 번 수십 ms 끊길 수 있다 [추정] — 피하려면 IBL 을 진입 때로 미뤄야 하는데, 그러면 무대 재질 키(환경 맵 유무)가 달라져 미리 컴파일이 쓸모없어진다. 지금은 미리 준비에 둠.
3. 1P 캐릭터 미리 컴파일은 [flow-prefetch] 의 `hint('chara1P')` 또는 `ready('plaza:player:<pc>')` 가 올 때만(결정 뒤 — 진입 직전이라 시간이 짧다). NPC 는 미리 컴파일하지 않음(부품이 ctx 에 묶임) — 첫 진입 때 컴파일, 재진입 0.
4. 미리 준비는 `ready('plaza:p0')` 가 앱에서 처음 한 번 올 때만 한다(같은 묶음을 다시 요청하면 사건이 없음). 모드 메뉴 → 광장 복귀는 미리 준비 없이 같은 렌더러로(컴파일·업로드 0) — 모드 메뉴에서도 world 를 미리 조립할지는 선택.
5. UI 합성 결과가 전과 같은지(반올림 ±1 [추정])는 브라우저에서 눈으로 — §14.8 목록.

**검증 전체**: `test_plaza_gl` 60/60 + 기존 시험 24개 전부 통과(test_plaza_world 437·test_plaza_ui 129·test_prefetch 104·test_room_server 232·check_mgmcommon 12954 등), `tsc` 오류 0, `npm run build` 통과. 헤드리스는 띄우지 않았다(§14.8 목록을 사용자가 직접 본다).

### 13.9 회귀 수정 — 2D 그림 404(assets/assets) (2026-10-08, 조정자)
- 증상(사용자): 인원 설정·캐릭터 선택 2D 가 텍스처 없이 단색 사각형, 광장 로딩 안 됨.
- 원인: `view/appAssets.ts assetKeyOf` 가 상대 URL(`assets/mgmcommon/…`)을 **에셋 루트 기준**으로 풀어 키가 `assets/mgmcommon/…` 가 되고, resolver(루트 + 키)가 `assets/assets/…` 를 요청 → 404. 노드 시험은 가짜 fetch 라 URL 해석 경로를 타지 않아 못 잡음.
- 수정: 상대 URL 은 페이지 기준(`document.baseURI`)으로 푼다. 순수 함수 `view/assetKey.ts assetKeyFrom` 로 빼고 `test_prefetch` 7절(4건)에 회귀 시험. 실제 페이지 콘솔 확인 1회: 인원 설정·광장 404 0, 오류 0.
