# 공용 로더 관리자 — 우선순위·공용 캐시·프레임 예산·미리 받기

2026-10-08. 상태: **1·2·3단계 구현(§11 구현 설계, §12 구현 결과·실측)**, 4·5·7단계 설계만, 6단계는 [loader-6] 담당. 압축 형식·소스/배포 분리는 [assets_pipeline.md](assets_pipeline.md), 입력은 [input_web.md](input_web.md). 표기: [실측] 이 저장소에서 잰 값, [코드] 현재 코드 확인, [추정] 계산·경험치, [설계] 웹 결정, **사용자 확인 필요** = 기본값을 정해 두고 진행할 곳.

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
| 5 | 흐름 예측 표 + 캐릭터 선택 지연 받기 + Preview3D 캐시 공용화 | 1 h |
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
