# 07. 카메라·조명·포스트이펙트 — 씬 카메라 애니, mg1801 카메라 값, 라이트·IBL, 포스트

2026-10-02. 상태: **분석 진행 / 덤프·재구현 계산 완료 / 웹 구현 없음**.
문서 형식과 확정 수준은 [../../../분석.txt](../../../분석.txt)(실제 위치 `c:/dev/web/분석.txt`)를 따른다.
- **[실행]**: 이 문서에서는 "덤프 실행 확인"(도구가 원본 파일을 읽어 값을 뽑음)이다. 원본 게임을 돌린 것은 없다.
- **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[재구현 계산]** 원본식을 다시 짜서 계산, **[추정]**, **[미확정]**.

주소는 SwitchLoader 기본 베이스 0x7100000000 기준이다. 모듈 이름과 함께 쓴다(`main @0x…`, `mg1801 @0x…`).

같은 내용을 여러 문서에 복사하지 않는다. 다음은 다른 문서가 근거다.

| 주제 | 근거 문서 |
|---|---|
| 프레임 타이밍, GetDeltaTime(리듬 장면 고정 1/60), 파이버 순서 | [01_core.md](01_core.md) |
| 엔딩·결과 단계(`OnGameEnding`·`OnGameExit`)의 장면 흐름, 별 판정 | [02_rhythm.md](02_rhythm.md) |
| FRES·BNTX 변환(IBL 큐브맵 png/hdr 포함), 뼈 회전 규약, 재질 근사 | [03_graphics.md](03_graphics.md), 변환기 `web/tools/analysis/graphics_bfres2gltf`, `web/tools/analysis/graphics_bntx.py` |
| 모션 슬롯(재생·속도·프레임 진행·전이), MotionArg | [09_character.md §4.3~§6.6](09_character.md) |
| 파티클(VFXB)·`env_effect_color` 를 쓰는 쪽 | [08_effects.md](08_effects.md) |
| mg1801 상태 알림(채널·값), 무대 모델 | [../minigame/mg1801.md §3.4·§7](../minigame/mg1801.md) |

---

## 1. 기능 개요와 사용자에게 보이는 동작

| 요소 | 원본 구성요소 | 데이터 | 보이는 것 |
|---|---|---|---|
| 카메라 | 엔티티 + `bq::ComMatter`(MatterType 1) → `nn::bezel::ComCamera` → `nn::bezel::Camera`, 기본 `GraphicsLayer`에 연결 | 없음(코드가 만든다) | 화면 시점 |
| 카메라 애니 | `actor::ComActorMotion`에 `.fsnb`(FRES 씬 애니) 클립을 이름으로 등록 → `Play(이름)` → 적용기 `AnimationPassCamera` | `env/<게임>_cam*.fsnb` | 고정 시점·카메라 이동 |
| 평행광 | `.fmdb` 모델(셰이딩 모델 `container/directional_light`)을 ComMatter로 올림 → `bex::gfx::ComDirectionalLight` | `env/<게임>_dir_light.fmdb` 재질 파라미터 | 방향광·그림자 |
| 환경 | `container/environment` 재질 → `bex::gfx::ComEnvironment` | `env/<게임>_env.fmdb` + `_irr`/`_rad` 큐브맵 | 확산·반사 IBL, 거리 안개 |
| 포스트 | `container/posteffect` 재질 → `bex::gfx::ComPosteffect` | `env/<게임>_post*.fmdb` | 톤맵·블룸·DOF·FXAA |
| 라이트·포스트 애니 | 위 모델의 재질 파라미터 애니(`.fmab`) | 보드 등 일부 | 조명 색·안개 변화 |
| 결과 캡처 | 리듬 모드 결과 화면용 축소 캡처(480×270) | `cam_capture*.fsnb` | 리듬 쿠킹 결과 썸네일 |

mg1801에서는 한 게임 내내 카메라가 고정이다. 엔딩 연출(채널 0 값 6)에서 결과 카메라로 **바로** 바뀌고, 포스트 설정도 결과용으로 바뀐다(§5).

## 2. 분석 대상 원본·버전·자료 위치

| 항목 | 위치 |
|---|---|
| 카메라 코어 코드 | main NSO `nn::bezel::Camera` @0x71008458f8~, `nn::bezel::ComCamera` @0x7100848ea0~, 적용기 `FUN_71006c0fe0`/`FUN_71006c1120`, 뷰 행렬 `FUN_71007758a4`(Aim)·`FUN_7100775b90`(EulerZXY) |
| 라이트·포스트 컴포넌트 | main `bex::gfx::ComDirectionalLight` @0x7100076b94~, `ComEnvironment` @0x71000746b8~, `ComPosteffect` @0x710007773c~, `ComGlobal` @0x7100094ff0~ |
| 결과 캡처 | main `RmMgSceneBase::OnGameExit` @0x7100445ae8, `FUN_710042d1a0`, `bex::gfx::util::SetGraphicsLayerExtensionScreenCaptureRenderTarget` @0x71000bc310 |
| mg1801 사용처 | mg1801 `MapImpl::Initialize` @0x710000f9d0, `MapImpl::ReceiveState` @0x7100010a90 |
| 디컴파일 | `analysis/decomp/camera_core.c`(Camera·ComCamera·흔들림), `camera_callers_anim.c`(적용기·종횡비 설정), `camera_apply.c`(LookAt·Euler·정사영), `camera_gfx_components.c`(bex::gfx 컴포넌트), `camera_dirlight*.c`, 기존 `mg1801.nro.c`, `main_ca_rm.c` |
| 에셋 | `extracted/bea/mg~mg1801.nx.bea/mg/mg1801/env/` — `mg1801_cam00/01/02.fsnb`, `mg1801_cam_capture00.fsnb`, `mg1801_env.fmdb`, `mg1801_dir_light.fmdb`, `mg1801_post.fmdb`, `mg1801_post_result00.fmdb`, `textures/mg1801_{bg00,cha}_{irr,rad}.bntx` |
| 셰이더 정의 | `libbex~libbexgfx~libexgfx_resident.nx.bea/libbex/libbexgfx/resident/shader/container/container.bfsha`(파라미터 이름만 있는 "컨테이너" 셰이더), 같은 폴더 `gfxshader/posteffect_*.bnsh`(실제 포스트 셰이더, 바이너리만) |
| 도구 | `web/tools/analysis/camera_probe`(.NET 7, BfresLibrary), `web/tools/analysis/camera_verify.mjs`(노드, three.js), `web/tools/analysis/ghidra_scripts/CameraRefs.java` |
| 덤프 | `extracted/converted/camera/` — `mg1801_cameras.json`(카메라 원자료·커브·three.js 값), `mg1801_env.json`(라이트·환경·포스트 재질 파라미터), `fsnb_scan.json`(fsnb 899개 요약), `sincos_table.json`(sdk 사인 표) |

## 3. 진입점과 전체 호출 흐름

### 3.1 카메라 만들기 [판독 mg1801 @0x710000f9d0, mg0101 `CameraMgr::CameraMgr` @0x71000035b0]

두 모듈이 같은 순서를 쓴다.

```
CreateSceneEntity("cam00")                                   // mg0101 은 "Camera"
AddComponent<bq::ComMatter>(entity, MatterType 1)            // main FUN_71002af940: case 1 → AddComponent<nn::bezel::ComCamera>
GraphicsLayer::SetCamera(GetDefaultGraphicsLayer(), ComCamera::GetCamera())
motion = ComMatter::GetMotion()
motion.AddAnimation(라벨, "mg/mg1801/env/mg1801_camNN", 1,0,0,0)   // 라벨 = StringViewHashPair(FNV-1a 64)
motion.Play("loop")
```

- `bq::ComMatter` 생성 switch(main `FUN_71002af940`, `core_b12.c`): 0·3 = 모델 필요, **1 = `ComCamera` 추가**, 2 = `actor::ComActor` [판독].
- 카메라 엔티티의 트랜스폼은 mg1801에서 아무도 쓰지 않는다(Initialize·ReceiveState에 SetTranslation/SetRotation 없음) → 단위 행렬 [판독].
- mg1801 라벨 ↔ 파일 [판독 + 데이터: 라벨 문자열 mg1801.nro 0x313af·0x30b85·0x3070e]

| 라벨 | 파일 | 재생 시점 |
|---|---|---|
| `loop` | `mg1801_cam00.fsnb` | Initialize 직후 |
| `result` | `mg1801_cam02.fsnb` | ReceiveState(0, 6) = `TrigRmGameEndingSetting` |
| `capture` | `mg1801_cam_capture00.fsnb` | ReceiveState(2, 2) = `TrigRmGameResultCaptureSetting` |

- **`mg1801_cam01.fsnb`는 쓰지 않는다.** mg1801.nro에 `mg1801_cam` 문자열은 cam00·cam02·cam_capture00 3개뿐이고 main에도 없다 [데이터]. cam00·cam01의 카메라 이름이 다른 게임 이름(`mgcn403_cam00`)인 것도 복사해 온 흔적으로 본다 [추정].

### 3.2 매 프레임 적용 [판독 main `FUN_71006c0fe0` → `FUN_71006c1120`]

```
애니메이션 처리 타이밍(09_character §3.2)
 └ AnimationPassCamera::Apply(this, entityHandle)                FUN_71006c0fe0 (vtable 0x7101a06600 +0x50)
     엔티티에서 ComCamera 찾기 → FUN_71006c1120(this, ctx, -, 슬롯 노드 트리)
       노드 종류 0(클립) : CameraAnimObj 평가(vt+0x18) → 결과 구조(4.1) → 투영·뷰 설정
       노드 종류 1(묶음) : 자식을 차례로 모두 적용(뒤에 적용한 것이 덮어쓴다)
       그 밖           : vt+0x40 이 돌려준 자식 하나로 내려간다
       pass 비트(node+8 의 비트 passIndex)가 꺼진 노드는 건너뛴다
```

- 카메라 적용 경로에는 **가중치를 쓰는 곳이 없다.** 그래서 모션 전이(09 §6.5의 크로스페이드)가 있어도 카메라 값은 섞이지 않고 한 클립의 값이 그대로 들어간다 [판독]. 전이 중에 어느 클립이 이기는지(종류 2 이상 노드의 vt+0x40)는 **[미확정]**이다.
- 클립 평가: `nn::g3d::CameraAnimObj`(main 문자열 `N2nn3g3d13CameraAnimObjE`)다. 커브 식은 FRES AnimCurve(§6.4) [데이터: RTTI 이름][추정: g3d 구현 그대로].

### 3.3 조명·포스트 만들기 [판독 mg1801 @0x710000f9d0]

| this 오프셋(MapImpl) | 엔티티 이름 | ComMatter 경로 |
|---|---|---|
| +0xB8 | `env00` | `mg/mg1801/env/mg1801_env.fmdb` |
| +0xD0 | `dir_light00` | `mg/mg1801/env/mg1801_dir_light.fmdb` |
| +0x100 | `post00` | `mg/mg1801/env/mg1801_post.fmdb` |
| +0xE8 | `cam00` | (MatterType 1) |

- 모델 재질의 셰이딩 모델 이름(`directional_light`/`environment`/`posteffect`, 셰이더 아카이브 `container`)으로 bex::gfx 컴포넌트가 붙는다 **[추정]**. 이 이름·파라미터 이름의 문자열이나 FNV-1a 해시는 main에 없다(검색 0건). 재질 유니폼 블록을 배치대로 읽는 방식으로 보이며 연결 함수는 **[미확정]**이다.
- `ComDirectionalLight` 생성자(main `FUN_7100076ee0`, 0x210 B)와 갱신(`FUN_7100074c20`)은 모델의 뼈 소켓 행렬을 읽어 캐시한다. `+0xDC`(transform overwrite)가 0일 때만 그 행렬로 갱신 표시를 한다. `SetOverwriteRotation`(+0xF0..0xF8)은 overwrite가 켜졌을 때만 갱신 표시를 한다 [판독].

### 3.4 엔딩·캡처 [판독 mg1801 ReceiveState, main OnGameExit @0x7100445ae8]

```
ReceiveState(channel 0, value 6)   // TrigRmGameEndingSetting
  steam00 이펙트 정지 → mg1801_steam01, 결과 모델 표시 …(mg1801.md §3.4)
  motion.Play("result")                             // 카메라 → cam02
  post00 엔티티 파괴 → 새 엔티티 "post_result00" + mg1801_post_result00.fmdb   (+0x100 자리 재사용)
  결과 수프 mg1801_soup%02d (GetStarAchieveJudge)
ReceiveState(channel 2, value 2)   // TrigRmGameResultCaptureSetting
  motion.Play("capture")                            // 카메라 → cam_capture00
```

`RmMgSceneBase::OnGameExit`(main @0x7100445ae8, this+0x370 = 단계):

| 단계 | 조건 | 하는 일 |
|---|---|---|
| 0 | `RmGameWork+0x6C3`(ResultModeCaptureEnable) 켜짐 | (+0x460 == 0이면) 상태 UI·텔롭 숨김, vt+0x300 `TrigRmGameEndingSetting` → vt+0x318 `TrigRmGameResultCaptureSetting` → 단계 1, 0 반환 |
| 1 | — | (+0x460 == 0이면) `FUN_7100447030`, 캡처 켜짐이고 +0x461 == 0이면 `FUN_710042d1a0(RmGameWork, RmGameWork+0x38)` → 단계 0으로 되돌리고 vt+0x320 `OnRmGameExit` |
| 0 | 캡처 꺼짐 | 바로 vt+0x320 |

`FUN_710042d1a0`(main @0x710042d1a0): 리듬 쿠킹(`RmGameWork+0x1C == 1`)이면 플레이어 4명 모델을 숨긴다. 그다음 렌더 타깃을 만들고(크기 = 게임 슬롯 `+0x148/+0x14C`, 생성자 기본값 0x10E000001E0 = **480×270**), `SetGraphicsLayerExtensionScreenCaptureRenderTarget(scene layer 0, …)`로 화면 캡처 대상에 건다. 슬롯 +0x128 = 1, +0x130 = 렌더 타깃 핸들 [판독].

- `SetResultModeCaptureEnable`를 부르는 곳은 rc_stage01(리듬 쿠킹) `SyncedSetupGame` 계열뿐이다(`rc_stage01_setbpm.c`). main 안에는 호출이 없고(export 참조뿐), NRO 139개 중 이 심볼을 가진 것은 rc_stage01.nro 하나다 [판독][데이터]. 미니게임 단독 모드의 기본값은 **[미확정]**(RmGameWork 생성자에서 +0x6C3을 따로 쓰지 않는다). 리듬 쿠킹이 아니면 `capture` 카메라는 쓰이지 않는다고 본다 **[추정]**.
- 캡처가 켜진 경우 같은 프레임에 `result` → `capture` 순서로 Play한다. 마지막 Play가 남으므로 그 프레임부터 캡처 카메라다 [판독 + 추정: 같은 프레임 두 Play 중 뒤가 이김].

## 4. 구조체·필드·상수·열거형

### 4.1 카메라 애니 결과 (CameraAnimObj 결과 버퍼) [판독 FUN_71006c1120, FRES 데이터 배치와 같음]

기준 객체: `CameraAnimObj+0x48`이 가리키는 결과 버퍼. `.fsnb`의 BaseData·커브 AnimDataOffset과 같은 배치다.

| 오프셋 | 타입 | 필드(웹 권장 이름) | 단위 | 쓰는 곳(원본) |
|---|---|---|---|---|
| 0x00 | f32 | `near` | 월드 | ApplyNearAndFarEnabled일 때 투영 |
| 0x04 | f32 | `far` | 월드 | 같음 |
| 0x08 | f32 | `aspect` | 너비/높이 | ApplyAspectEnabled일 때만 |
| 0x0C | f32 | `fovy` | **라디안, 전체 세로각**(정사영이면 화면 높이) | 투영 |
| 0x10 | f32×3 | `pos` | 월드 | 뷰 |
| 0x1C | f32×3 | `aim`(Aim) / `rot`(EulerZXY, 라디안) | 월드 / 라디안 | 뷰 |
| 0x28 | f32 | `twist` | 라디안 | 뷰(Aim만) |

### 4.2 CameraAnim 플래그 (`ResCameraAnim+4`, u16) [판독 + 데이터]

| 비트 | 이름(BfresLibrary) | 원본에서의 쓰임 |
|---|---|---|
| 0x0001 | BakedCurve | — |
| 0x0004 | Looping | 슬롯 루프 여부 [추정: 09 §6.6] |
| 0x0100 | EulerZXY | 0이면 Aim(LookAt) 경로 `FUN_71007758a4`, 1이면 Euler 경로 `FUN_7100775b90` [판독] |
| 0x0400 | Perspective | 1이면 `SetProjectionPerspectiveFovy(fovy, aspect, near, far)`, 0이면 정사영 `FUN_71008470ac(top=fovy/2, bottom=−fovy/2, left=−aspect·fovy/2, right=aspect·fovy/2, near, far)` [판독] |

### 4.3 AnimationPassCamera (0x20 B) [판독 main 생성자 FUN_71006c0e5c]

| 오프셋 | 타입 | 원본 이름 | 기본값 | 의미 |
|---|---|---|---|---|
| 0x00 | ptr | vtable 0x7101a06600 | | |
| 0x10 | ptr | | 0 | |
| 0x18 | u8 | `ApplyAspectEnabled` [추정: 이름↔오프셋] | **0** | 1이면 애니 aspect 적용, 0이면 카메라의 현재 종횡비 유지 |
| 0x19 | u8 | `ApplyNearAndFarEnabled` [추정: 이름↔오프셋] | **1** | 1이면 애니 near/far 적용, 0이면 카메라 현재 값 |

- 이름은 main 문자열 `ApplyAspectEnabled`·`ApplyNearAndFarEnabled`(같은 계열 `AnimationPassCamera` 문자열 근처)에서 왔다. 생성자 `*(u16*)(this+0x18) = 0x100`과 적용식의 쓰임은 판독이다.
- 직렬화 생성 경로(`FUN_71006c0d44`, "Entity" 속성)가 있어 데이터로 덮어쓸 수 있다. mg1801은 코드 경로(`FUN_71006c0c6c`)로 만든다고 보며 기본값 그대로다 **[추정]**.
- 결론: **fsnb의 aspect(1.78, 1.777, 1.5 등)는 기본 설정에서 화면에 쓰이지 않는다.** 화면 종횡비는 렌더러가 장면을 만들 때 `Camera::SetAspectRatio(width/height)`(main `FUN_71000521d8`)로 정한다 [판독]. 주 화면은 1920×1080 → 16:9 [추정: 해상도는 docs/01 §5].

### 4.4 nn::bezel::Camera 필드 [판독 SetProjectionPerspectiveFovy @0x7100846b04, Reset @0x71008458f8]

| 오프셋 | 필드 | 비고 |
|---|---|---|
| 0xC0~0xFF | 투영 행렬(행 벡터 배치: +0xE8 = −far/(far−near), +0xEC = −1, +0xF8 = −near·far/(far−near)) | 열 벡터 표기로 `P00 = 1/(tan(fovy/2)·aspect)`, `P11 = 1/tan(fovy/2)`, `P22 = −far/(far−near)`, `P23 = −near·far/(far−near)`, `P32 = −1` → 깊이 0..1, 오른손, 시선 −Z |
| 0x1C0/0x1C4 | left/right | near 면 |
| 0x1C8/0x1CC | bottom/top | near 면, `top = near·tan(fovy/2)` |
| 0x1D0 | near | |
| 0x1D4 | far | |
| 0x1D8 | aspect | |
| 0x1DC | fovy | 라디안 |
| 0x1E0 | 투영 종류 | 0 = PerspectiveFovy(열거 문자열 `CameraProjectionType_PerspectiveFovy, _PerspectiveFrustum, _PerspectiveLighty, _Orthographic`) |
| 0x2F8 | 초점 거리 | ComCamera가 0 이상일 때만 씀(§6.3) |

- `Camera::Reset`: 투영 = (전역 기본 fovy, **16/9**, **0.1**, **1000**). 기본 fovy·LookAt 값은 .bss 전역이라 정적 값이 없다 **[미확정]**.
- tan은 sdk 사인·코사인 표로 계산한다(§6.5).

### 4.5 nn::bezel::ComCamera (0x90 B) [판독 @0x7100849204·@0x7100849250]

| 오프셋 | 필드 | writer | reader |
|---|---|---|---|
| 0x20 | 소유 엔티티 | 생성 | `_internalCalculateView` |
| 0x28 | Camera 핸들 | 생성 | `GetCamera`, 적용기 |
| 0x40~0x7F | 애니 뷰 행렬(MatrixRowMajor4x3f, 행 4개×float4) | `_internalSetAnimViewMatrix` | `_internalCalculateView` |
| 0x80 | 초점 거리(f32, −1 = 없음) | `_internalSetAnimFocusDistance` | `_internalCalculateView` → Camera+0x2F8 |

### 4.6 mg1801 MapImpl 카메라·조명 필드 [판독]

기준 객체: `mg1801::MapImpl`.

| 오프셋 | 내용 | writer | reader |
|---|---|---|---|
| +0xB8/+0xC0/+0xC8 | `env00` 엔티티 핸들 | Initialize | — |
| +0xD0/+0xD8/+0xE0 | `dir_light00` 엔티티 핸들 | Initialize | — |
| +0xE8/+0xF0/+0xF8 | `cam00` 엔티티 핸들(ComMatter + 모션) | Initialize | ReceiveState(2,2), (0,6) |
| +0x100/+0x108/+0x110 | `post00` → (0,6)에서 `post_result00`로 교체 | Initialize, ReceiveState(0,6) | — |

## 5. 상태 전이와 전체 수명

### 5.1 mg1801 카메라·포스트 [판독]

| 순서 | 계기 | 카메라 클립 | 포스트 모델 | 비고 |
|---|---|---|---|---|
| 1 | `MapImpl::Initialize`(장면 준비, Stage 제품 생성 때) | `loop` = cam00 | `mg1801_post.fmdb` | 연습·본편·채보 끝까지 그대로 |
| 2 | 채널(0,1) 연습 시작, (0,2) 본편, (0,5) 채보 끝 | 변화 없음 | 변화 없음 | NPC 모션만 바뀐다 |
| 3 | 채널(0,6) `TrigRmGameEndingSetting` | `result` = cam02 | `mg1801_post_result00.fmdb` | 같은 호출 안에서 결과 모델·플레이어 위치도 바뀐다 |
| 4 | 채널(2,2) `TrigRmGameResultCaptureSetting`(캡처 켜진 모드만) | `capture` = cam_capture00 | 그대로 | 다음 프레임 480×270 캡처 |
| 5 | 장면 종료 | 엔티티와 함께 해제 | 해제 | |

- 4개 fsnb 모두 FrameCount 0, 커브 0이라 **클립 안에서 시간이 흘러도 값이 변하지 않는다** [데이터]. 따라서 mg1801 카메라는 "상태별 고정 시점 3개"로 재현하면 된다.
- 바뀌는 순간 보간은 없다(§3.2) [판독]. 
- 카메라 전환과 플레이어 순간 이동이 같은 `Transmit(0,6)` 안에서 일어난다. 수신 순서는 제품 생성 순서(Stage → Object → Player)로 본다 **[추정]**. 어느 쪽이든 같은 프레임이므로 화면상 차이는 없다.

### 5.2 일반 카메라 클립 수명 (다른 게임용) [판독 + 09 참조]

- Play(라벨) → 슬롯이 프레임을 0부터 진행(속도 1 = 60Hz 한 프레임에 클립 1프레임, 09 §6.6).
- 루프 플래그가 없으면 FrameCount에서 멈추고 `IsFinished`가 참이 된다(mg0101 `CameraMgr::IsAnim` = !IsFinished) [판독].
- mg0101 `CameraMgr`는 `Play(ANIM)`, `Play(ANIM, float)`, `GetAnimSpeed/SetAnimSpeed`, `GetFrame/GetFrameMax/SetFrame`을 감싼다 [판독 mg0101 @0x7100003d70~0x7100004094].

## 6. 계산식·조건·상세 의사코드

### 6.1 적용기 (FUN_71006c1120) [판독]

```ts
// res = CameraAnimObj 결과(4.1), flags = ResCameraAnim 플래그(4.2), cam = nn::bezel::Camera
const fovy = res.fovy;
const aspect = pass.applyAspect ? res.aspect : cam.aspect;            // +0x18
const [near, far] = pass.applyNearFar ? [res.near, res.far] : [cam.near, cam.far];  // +0x19
if (flags & 0x400) cam.setPerspectiveFovy(fovy, aspect, near, far);
else cam.setOrtho(fovy / 2, -fovy / 2, -aspect * fovy / 2, aspect * fovy / 2, near, far);
let view, focus;
if (!(flags & 0x100)) { view = lookAtTwist(res.pos, res.aim, res.twist); focus = length(res.pos - res.aim); }
else { view = eulerZXY(res.pos, res.rot); focus = -1; }
comCamera.animView = view; comCamera.focus = focus;
comCamera.calculateView();   // 6.3
```

### 6.2 뷰 행렬 [판독 FUN_71007758a4 / FUN_7100775b90, 재구현 계산으로 three.js 동치 확인]

원본 행렬은 행 벡터 규약(`v_view = v_world · M`)이고 **열 0/1/2 = 카메라 X/Y/Z 축**, 행 3 = `−dot(pos, 축)`이다.

Aim 모드:

```ts
d = pos - aim;
if (d.x === 0 && d.z === 0) {            // 수직: twist 무시
  if (d.y > 0) axes = { X:(1,0,0), Y:(0,0,-1), Z:(0,1,0) };   // 위에서 내려다봄
  else         axes = { X:(1,0,0), Y:(0,0, 1), Z:(0,-1,0) };
} else {
  Z = normalize(d);
  r = normalize(d.z, 0, -d.x);           // = normalize(up(0,1,0) × Z)
  u = Z × r;
  [c, s] = sinCos(twist);                 // sdk 표 (6.5)
  X = c·r + s·u;   Y = −s·r + c·u;
}
```

EulerZXY 모드: 카메라 회전 = `Ry(rot.y) · Rx(rot.x) · Rz(rot.z)`(Z 먼저, 그다음 X, 마지막 Y).

| 원본 | three.js 동치 |
|---|---|
| Aim | `cam.position.set(...pos); cam.up.set(0,1,0); cam.lookAt(...aim); cam.rotateZ(twist)` |
| EulerZXY | `cam.position.set(...pos); cam.rotation.set(rot.x, rot.y, rot.z, 'YXZ')` |
| 수직 Aim(d.x = d.z = 0) | three.js lookAt은 다른 up을 고른다. 위 표의 축으로 직접 `cam.quaternion.setFromRotationMatrix(makeBasis(X,Y,Z))` |

### 6.3 ComCamera::_internalCalculateView [판독 @0x7100849250]

```ts
camWorld = entity.worldMatrix × inverse(animView);   // FUN_710084b4a0 로 애니 뷰를 뒤집어 엔티티 행렬을 곱함
camera.setViewMatrix(viewFromTransform(camWorld));
if (focus >= 0) camera.focusDistance /* +0x2F8 */ = focus;
```

- mg1801은 엔티티가 단위 행렬이므로 애니 값이 곧 월드 값이다.
- 초점 거리(Aim이면 |pos − aim|)를 DOF가 쓰는지는 **[미확정]**(Camera+0x2F8을 읽는 곳 미판독). mg1801 cam00은 26.019다.

### 6.4 커브 평가 (FRES AnimCurve) [데이터: BfresLibrary 배치, 원본 g3d 평가 함수는 미판독]

```ts
// i = frame 이하인 마지막 키, t = (frame − f[i]) / (f[i+1] − f[i])
cubic : v = (k0 + k1·t + k2·t² + k3·t³)·scale + offset
linear: v = (k0 + k1·t)·scale + offset
step/baked: v = k0·scale + offset
frame ≤ f[0] → 첫 키, frame ≥ 마지막 키 → 마지막 키의 k0
```

- 구현은 `web/tools/analysis/camera_probe/Program.cs`의 `Eval`. 키의 pre/post wrap 모드는 덤프에 남기지만 평가에는 쓰지 않았다(전 fsnb에서 영향 여부 **[미확정]**).

### 6.5 사인·코사인 표 [판독 + 데이터]

원본은 `std::sin/cos`가 아니라 sdk의 `nn::util` 표를 쓴다.

```ts
idx  = fcvtzs(rad * (2^31 / π))          // i64
e    = table[(idx >> 24) & 0xFF]         // {cos, sin, dcos, dsin}, 256개 = 2π
frac = (idx & 0xFFFFFF) * 2^-24
cos  = e.cos + frac * e.dcos;  sin = e.sin + frac * e.dsin
```

- 표: sdk NSO 압축 해제 이미지 오프셋 0x8B570C → `extracted/converted/camera/sincos_table.json` [데이터]. main의 Euler 경로 디스어셈블에서 `fcvtzs x`, `lsr #0x18`, `and #0xffffff`, `ucvtf` 확인 [판독].
- 정확한 삼각함수와의 차: cos 최대 5.8e-5, 카메라 축 최대 8.7e-5 [재구현 계산]. 화면상 의미 없는 크기라 웹은 `Math.sin/cos`를 써도 된다(§9.5).

### 6.6 평행광 방향 [데이터 + 추정]

- `mg1801_dir_light.fmdb`의 표시용 메시는 밑면 z = +1, 꼭짓점 z = −1인 사각뿔(정점 16개)이다 → **빛은 로컬 −Z로 나간다** [데이터 + 추정].
- 뼈 `dir_light` 회전 R = (−1.2217306, 0, −0.17453295) rad = (−70°, 0°, −10°), 위치 T = (−1.0521, 5.0927, 0.3276) [데이터].
- 재질 `directional_light_transform_overwrite = 1`, `directional_light_overwrite_rotation = (−60, −30, −10)`, `overwrite_position = (0, 2, 0)` [데이터]. overwrite가 켜졌으므로 이 값을 쓴다고 보며, 단위는 값 크기로 보아 **도** [추정].
- FRES 회전 규약(R = Rz·Ry·Rx, 03_graphics)을 같게 적용한 빛 진행 방향 [재구현 계산]:

| 근거 | 빛 진행 방향(월드) | three.js `light.position − target` 방향 |
|---|---|---|
| overwrite (−60°, −30°, −10°) — 채택 | (0.0958, −0.8963, −0.4330) | (−0.0958, 0.8963, 0.4330) |
| 뼈 (−70°, 0°, −10°) — 참고 | (−0.1632, −0.9254, −0.3420) | (0.1632, 0.9254, 0.3420) |

- 둘 다 "위·카메라 쪽(+Z)에서 무대 안쪽 아래로" 비춘다. overwrite 회전의 축 순서가 뼈와 같은지는 **[미확정]**이다.

## 7. 애니메이션·이펙트·소리·카메라·에셋 연결

### 7.1 mg1801 카메라 값 [데이터 — `web/tools/analysis/camera_probe cam` 덤프 실행 확인]

전부 Aim 모드, Perspective, FrameCount 0(정적), 커브 0, twist 0, 루프 아님. 덤프: `extracted/converted/camera/mg1801_cameras.json`.

| 라벨 | 파일(카메라 이름) | 위치 pos | 주시점 aim | fovy(rad) | three.js fov(도) | near / far | 애니 aspect(미적용) | pos−aim 거리 | 내려다보는 각 |
|---|---|---|---|---|---|---|---|---|---|
| `loop` | `mg1801_cam00.fsnb` (`mgcn403_cam00`) | (0, 2, 23) | (0, 3, −3) | 0.34906584 | **20** | 0.1 / 10000 | 1.78 | 26.019 | −2.20°(살짝 올려봄) |
| (미사용) | `mg1801_cam01.fsnb` (`mgcn403_cam00`) | (0, 16, 18) | (0, 0, −3) | 0.34906584 | 20 | 0.1 / 10000 | 1.78 | 26.401 | 37.30° |
| `result` | `mg1801_cam02.fsnb` (`mg1801_cam2`) | (0, 5.5, 20) | (0, 0, −1.5) | 0.34906656 | 20.00004 | 0.1 / 10000 | 1.78 | 22.192 | 14.35° |
| `capture` | `mg1801_cam_capture00.fsnb` (`cam_capture00`) | (0, 14.531198, 23.946115) | (0, 0, 3.74) | 0.2617994 | **15** | 0.1 / 10000 | 1.777 | 24.889 | 35.72° |

웹 회색 박스 교체값(지금 `web/script/games/mg1801/view/index.ts`의 임시값 (0,6,17)→(0,2.5,0), fov 35 대신):

```ts
// 원본: mg1801 MapImpl "loop" = mg1801_cam00.fsnb [데이터]
camera.fov = 20; camera.aspect = 16 / 9; camera.near = 0.1; camera.far = 10000;
camera.position.set(0, 2, 23); camera.up.set(0, 1, 0); camera.lookAt(0, 3, -3);
camera.updateProjectionMatrix();
// 엔딩(0,6) "result": position (0, 5.5, 20), lookAt (0, 0, -1.5), fov 20.00004
// 캡처(2,2) "capture": position (0, 14.531198, 23.946115), lookAt (0, 0, 3.74), fov 15 (리듬 쿠킹 등 캡처 모드만)
```

화면 위치 검산(16:9, three.js 투영, NDC y는 위가 +1) [재구현 계산 `web/tools/analysis/camera_verify.mjs`]:

| 점(mg1801.md 4.5·4.6 로직 좌표) | `loop` NDC | `result` NDC |
|---|---|---|
| 채소 등장 레인0 (−3, 7.5, 0) | (−0.413, **1.128**) — 화면 위 바깥에서 내려온다 | (−0.507, 2.071) |
| 채소 판정 높이 레인0 (−3, 1.5, 0) | (−0.417, −0.342) | (−0.470, 0.301) |
| 플레이어0 발 (−3, 0, −2) | (−0.384, −0.674) | (−0.422, 0.031) |
| 플레이어3 발 (3, 0, −2) | (0.384, −0.674) | (0.422, 0.031) |

- 엔딩에서는 플레이어가 결과 위치로 옮겨 가므로(`GetResultPlayerPosRots`) 위 `result` 열의 플레이어 값은 참고용이다.

### 7.2 fsnb 전체 통계 [데이터 — `web/tools/analysis/camera_probe scan`, 899개, 실패 0]

| 항목 | 값 |
|---|---|
| 파일 / 카메라 / 라이트 애니 / 포그 애니 | 899 / 899 / **0** / **0** (씬 애니 하나에 카메라 하나) |
| 회전 모드 | Aim 724, EulerZXY 175 |
| 투영 | 전부 Perspective |
| 루프 | 22 |
| 커브 있는 카메라 | 582 (FrameCount 1~13,500, 중앙값 120) |
| 커브가 붙은 필드 | posZ 519, posY 496, rotY 404, posX 371, rotX 351, rotZ 310, fovy 113, twist 5, near 3 |
| fovy 상위(도) | 25(159), 30(120), 45(62), 20(58), 26.99(53), 35(47) |
| near/far 상위 | 0.1/10000(239), 1/10000(167), 1/1000(114), 0.1/1000(99) |
| 아카이브 분류 | mg 562, bd 93, mgm 92, menu 59, extra 34, rc 23, ca 16, kb 15 |
| 카메라 사용자 데이터 | 보드(bd*) 컷신 일부에만 `Near`·`Far`·`Offset`·`Shadow`·`Dof`·`FocalDistance` 등. 쓰는 코드는 **[미확정]** |

- **라이트 애니는 fsnb에 없다.** 조명·포스트 변화는 container 모델의 재질 파라미터 애니(`.fmab`)로 한다. 예: `bd03_dir_light00_a.fmab`(120프레임) = `directional_light_color`, `directional_light_shadowmap_camera_far`; `bd04_post00_ev00.fmab`(430프레임) = `posteffect_utility_parameter0` [데이터]. mg1801에는 이런 fmab가 없다(mg1801 fmab는 `line01`·`water00`뿐) [데이터].
- 보드 카메라는 fsnb 외에 `bd0N_MapCamera.json`(노드별 Fovy·Center·RotateX/Y·Zoom·Shadow/Dof/Tonemap 프리셋 이름), `bd00_CameraFsnb.json`, 메뉴 `CameraParam.json` 등 JSON 파라미터가 따로 있다 [데이터]. 이 문서 범위 밖이다.

### 7.3 평행광 `mg1801_dir_light.fmdb` [데이터 — `camera_probe env` 덤프]

셰이딩 모델 `container/directional_light`, 재질 `light_mt`.

| 파라미터 | 값 | 해석 |
|---|---|---|
| `directional_light_color` | (0.8, 0.8, 0.8) | 빛 색·세기 [추정: 선형] |
| `directional_light_transform_overwrite` | 1 | 아래 overwrite 값 사용 |
| `directional_light_overwrite_rotation` | (−60, −30, −10) | 방향(도) §6.6 |
| `directional_light_overwrite_position` | (0, 2, 0) | 그림자 기준 위치 [추정] |
| `directional_light_shadowmap_array_length` | 4 | 그림자 캐스케이드 4개 [추정] |
| `directional_light_shadowmap_lambda` | 0.5 | 캐스케이드 분할 로그/선형 혼합 [추정] |
| `directional_light_shadowmap_camera_near` / `_far` | 1 / 30 | 그림자 범위(카메라 거리) |
| `directional_light_shadowmap_camera_offset` | 1000 | |
| `directional_light_shadowmap_fade_out` | 0.1 | |
| `directional_light_shadowmap_constant_bias` / `normal_bias` | 0.5 / (0.5,0.5,0.5,0.5) | |
| `directional_light_shadowmap_static_radius` / `_constant_bias` / `_variance_bias` | 30 / 0 / 0.0001 | 정적 그림자(EVSM 셰이더 `evsm_convert.bnsh` 있음) |
| renderInfo `directional_light_shadowmap_static_enable`, `_draw_static_on_dynamic` | 1, 1 | |

- 전용 setter: `SetShadowmapDynamicCameraNear/Far/Offset/FadeOut`, `SetTransformOverwrite`, `SetOverwriteRotation`, `SetLayerVisibilityBit`(main @0x7100076b94~) [판독]. mg1801은 이 setter를 부르지 않는다(mg1801.nro 심볼에 없음) [데이터].

### 7.4 환경 `mg1801_env.fmdb` [데이터]

셰이딩 모델 `container/environment`, 재질 `env`. 텍스처 순서 [bg00_irr, bg00_rad, cha_rad, cha_irr] ↔ 샘플러 [_a0, _a1, _a5, _a6].

| 슬롯(samplerAssign) | 텍스처 | 형식 [데이터: graphics 변환 메타] |
|---|---|---|
| `env_common_diffuse_texturecube` = _a0 | `mg1801_bg00_irr` | 큐브 32², BC6H UF16, 밉 1, 최대값 0.903 |
| `env_common_specular_texturecube` = _a1 | `mg1801_bg00_rad` | 큐브 128², BC6H, 밉 8(거칠기별 사전 필터), 최대값 108.7 |
| `env_char_diffuse_texturecube` = _a6 | `mg1801_cha_irr` | 캐릭터용 확산 |
| `env_char_specular_texturecube` = _a5 | `mg1801_cha_rad` | 캐릭터용 반사 |
| `env_mip_fog_texturecube0` = _a0 | `mg1801_bg00_irr` | 안개 색을 큐브맵에서 [추정] |
| `env_cloud_shadow_texture2d0` = _a6 | (cha_irr) | 구름 그림자 꺼짐이라 무의미 |

| 파라미터 | 값 |
|---|---|
| `env_mip_fog_enable` / `_start_distance` / `_end_distance` / `_intensity` | 1 / 80 / 150 / 0.5 |
| `env_height_fog_enable` (start −40, end −10, falloff 0.6) | 0 |
| `env_lightgrid_enable` (16×4×16, size 1, pos (0,2,0)) | 0 |
| `env_cloud_shadow_enable`, `env_decal_shadow_enable`, `env_water_droplet_texture_enable` | 0, 0, 0 |
| `env_decal_shadow_fog_enable`, `env_decal_shadow_mul_color` | 1, (0,0,0,0.7) |
| `env_effect_color0` | (0.8194, 0.8964, 0.8964, 1) — 이펙트 색 보정 [추정: 08_effects] |
| `env_utility_parameter0` | (5, 2, 25, 0.35) — 의미 **[미확정]** |
| `env_wind_velocity` | (0, 0, 0) |

- 모델 재질 쪽에도 개별 반사맵이 있다(`mg1801_bg00_result00_rad`, `mg1801_water00_rad`) — 03_graphics 범위.
- 캐릭터 `pc*_<이름>_light.fmdb`는 조명 데이터가 아니라 경량 모델이다(graphics 정정, SHARED.md) [데이터].
- 엔진 기본 조명 `_SystemLighting.nx.bea/.../DefaultGlobalLighting.nbgllt`(msgpack, `bezel_global_lighting`, MainLightColor·Intensity·Direction·Shadow…)는 bezel 기본값이다. bex::gfx 경로(위 container 모델)와의 우선순위는 **[미확정]**.

### 7.5 포스트 `mg1801_post.fmdb` / `mg1801_post_result00.fmdb` [데이터]

셰이딩 모델 `container/posteffect`, 재질 `post`, 옵션 `fragment_shader_graph_last = 0`.

| 파라미터 | 게임 중 (`post`) | 결과 (`post_result00`) | 해석 |
|---|---|---|---|
| renderInfo `posteffect_renderinfo_tonemap_type` | 1 | 1 | 톤맵 종류 1 — 곡선 **[미확정]** |
| renderInfo `posteffect_renderinfo_color_gradation_type` | 0 | 0 | |
| `posteffect_tonemap_exposure` / `_exposure_offset` / `_output_scale` | 1 / 0 / 1 | 같음 | |
| `posteffect_bloom_enable` | 1 | 1 | |
| `posteffect_bloom_threshold` / `_intensity` / `_spread` | 1 / 1 / 1 | 같음 | 밝기 1 넘는 HDR 부분만 [추정] |
| `posteffect_bloom_clip` | **100** | **1000** | 블룸 입력 상한 [추정] |
| `posteffect_dof_enable` | 1 | 1 | |
| `posteffect_dof_focal_distance` | **17** | **20** | 초점 영역 시작 거리 [추정] |
| `posteffect_dof_focal_region` | **25** | **30** | 초점 영역 길이 [추정] |
| `posteffect_dof_near_transition` / `_near_bokeh` | 0 / 0 | 0 / 0 | 앞쪽 흐림 없음 |
| `posteffect_dof_far_transition` | **7** | **15** | 뒤쪽 흐림 전이 길이 [추정] |
| `posteffect_dof_far_bokeh` | 1 | 1 | |
| `posteffect_dof_near_invisible` / `_depth_mask` | 0 / 0 | 같음 | |
| `posteffect_fxaa_enable` | 1 | 1 | |
| `posteffect_fxaa_edge_threshold` / `_min` / `_sub_pixel` | 0.166 / 0.0833 / 0.75 | 같음 | FXAA 3.11 Quality 기본값과 같음 |
| `posteffect_motion_blur_enable` | 0 | 0 | |
| `posteffect_color_grading_enable` / `_lut_enable` / `_lut_blending_enable` | 0 / 0 / 0 | 같음 | |
| `posteffect_color_grading_vignette_intensity` | 0 | 0 | |
| `posteffect_color_gradation_*` | circle/linear factor 0, color (1,1,1,2) | 같음 | 꺼진 것과 같음 [추정] |
| `posteffect_utility_parameter0` | **(0.4, 1, 1, 1)** | **(1, 1, 1, 1)** | 의미 **[미확정]** |
| 그 밖 utility | (1,1,1,1) | 같음 | |

- 실제 포스트 셰이더는 `gfxshader/posteffect_amalgam0.bnsh`(1.4 MB, 바이너리만), `posteffect_bloom_{first_down,down,up,up_tent}_sampling`, `posteffect_dof2_*`(near/far 분리, box/disc 흐림), `posteffect_motion_blur_*`다 [데이터: 파일 이름]. 처리 순서·톤맵 곡선은 셰이더를 읽을 수 없어 **[미확정]**이다.
- DOF 해석 검산(추정을 받아들일 때): `loop` 카메라에서 플레이어(z = −2)까지 약 25, 채소(z = 0)까지 약 23 → 초점 영역 17~42 안이다. 무대 뒤 벽 등 42 + 7 = 49 너머만 최대로 흐려진다 [재구현 계산 + 추정].
- `bex::gfx::ComPosteffect`에 DOF·톤맵·FXAA setter가 있다(main @0x710007773c~) [판독]. mg1801은 부르지 않는다 [데이터].
- `boot.nbinit` `bezel_render_pipeline_init`: ClearColor (0.25, 0.25, 0.25, 1), 그 밖 렌더 설정 없음 [데이터].

### 7.6 카메라 흔들림 [판독, mg1801 미사용]

- `wl::util::ComponentCameraShaking::Start(ShakeArg)`(main @0x71004e0e50): 같은 엔티티의 ComCamera를 찾아 Camera+0xB0..0xBF(16 B)를 저장하고, `arg[0] > 0`일 때 시작. +0x54 = arg[0], +0x70 = max(arg[1], 1), +0x74 = max(arg[2], 1), +0x78 = arg[3], +0x7C = arg[4]. 플래그 비트 2·3이면 `SyncRandModF − 1`로 x·y 방향을 정한다(동기 난수 소비).
- mg1801.nro에는 흔들림 참조가 없다 [데이터]. `ComponentCameraShaking`은 mg0102·mg0103·mg0116 등, `ComCameraShake`는 mg1704가 쓴다 [데이터: 문자열]. 갱신식은 **[미확정]**.

## 8. 다른 기능과의 상호작용

| 상대 | 관계 |
|---|---|
| 리듬 흐름(02) | 카메라 전환은 `TrigRmGameEndingSetting`(0,6)과 `TrigRmGameResultCaptureSetting`(2,2)에만 묶인다. 박자·채보와는 무관하다 [판독]. |
| 모션 슬롯(09) | 카메라도 `ComActorMotion` 슬롯이다. Play의 블렌드 값은 카메라 값에 영향이 없다(§3.2). 속도·프레임은 슬롯 규칙을 따른다 |
| 난수(01) | 카메라 흔들림만 동기 난수를 쓴다. mg1801은 카메라로 난수를 소비하지 않는다 [판독] |
| 결과 UI | 캡처 렌더 타깃(480×270)을 결과 화면이 쓴다 **[추정]**: 리듬 쿠킹 코스 결과 |
| 플레이어 엔딩 | (0,6)에서 결과 위치로 순간 이동 — 같은 프레임에 카메라도 바뀐다 |
| 입력 차단·일시정지 | 카메라 쪽에 별도 처리 없음 [판독: MapImpl] |

## 9. 웹 포팅 구조와 구현 순서

### 9.1 모듈과 책임 (권장 — 아직 web/script에 없음)

| 모듈(웹 권장 이름) | 위치 | 책임 |
|---|---|---|
| `view/sceneCamera.ts` `SceneCameraPlayer` | 화면 | 라벨 → 클립 표, `play(label)`, `step()`(60Hz), `apply(THREE.PerspectiveCamera)` |
| `view/cameraClip.ts` | 화면 | 클립 JSON 읽기, 프레임 → {pos, aim/rot, twist, fovy, near, far} |
| `view/lighting.ts` `StageLighting` | 화면 | dir_light·env JSON → `DirectionalLight` + 환경맵(PMREM) + 안개 |
| `view/post.ts` `PostChain` | 화면 | post JSON → EffectComposer 체인, `setPreset(post|post_result00)` |
| 게임 `view/` | 화면 | 상태 알림에 맞춰 `camera.play('result')`, `post.setPreset('result')` |

- 로직(state)은 카메라를 모른다. mg1801은 **state의 단계(엔딩 여부·캡처 여부)를 화면이 읽어** 클립을 고른다. 원본도 카메라가 게임 로직에 영향을 주지 않는다 [판독: MapImpl 외 카메라 접근 없음].
- 결정성 검사(`npm run check`)는 로직만 하므로 카메라는 대상이 아니다.

### 9.2 원본 이름 ↔ 웹 권장 이름

| 원본(확인된 이름) | 웹 권장 이름 |
|---|---|
| `bq::ComMatter`(MatterType 1) + `nn::bezel::ComCamera` | `SceneCameraPlayer` |
| `actor::ComActorMotion::AddAnimation(label, path)` | `player.add(label, clip)` |
| `actor::ComActorMotion::Play(label)` | `player.play(label)` |
| `AnimationPassCamera` +0x18 ApplyAspectEnabled / +0x19 ApplyNearAndFarEnabled | `applyAspect = false` / `applyNearFar = true` |
| CameraAnimResult near/far/aspect/fovy/pos/aim/twist | `CamFrame { near, far, aspect, fovy, pos, aim, twist }` |
| 라벨 `loop`/`result`/`capture` | 그대로 |
| `container/directional_light` 재질 | `DirLightParams` |
| `container/environment` 재질 | `EnvParams` |
| `container/posteffect` 재질 | `PostParams` |

### 9.3 SceneCameraPlayer 의사코드

```ts
interface CamClip {
  name: string; frameCount: number; loop: boolean;
  mode: 'Aim' | 'EulerZXY'; perspective: boolean;
  frames: CamFrame[];               // 0..frameCount, camera_probe 의 bakedPerFrame 또는 base 하나
}
class SceneCameraPlayer {
  private clips = new Map<string, CamClip>(); private cur?: CamClip; private frame = 0; speed = 1;
  applyAspect = false; applyNearFar = true;            // 원본 기본값 (4.3)
  add(label: string, c: CamClip) { this.clips.set(label, c); }
  play(label: string) { this.cur = this.clips.get(label); this.frame = 0; }   // 보간 없이 즉시 교체 (3.2)
  step() {                                              // 60Hz 한 번 (09 §6.6 규칙)
    if (!this.cur || this.cur.frameCount === 0) return;
    this.frame += this.speed;
    if (this.cur.loop) this.frame %= this.cur.frameCount; else this.frame = Math.min(this.frame, this.cur.frameCount);
  }
  apply(cam: THREE.PerspectiveCamera) {
    const c = this.cur; if (!c) return;
    const f = sample(c, this.frame);                    // 정수 프레임이면 frames[i], 아니면 커브 평가 (6.4)
    cam.fov = f.fovy * 180 / Math.PI;                   // 전체 세로각 (4.1)
    if (this.applyAspect) cam.aspect = f.aspect;        // 기본 꺼짐 → 캔버스 16:9 유지
    if (this.applyNearFar) { cam.near = f.near; cam.far = f.far; }
    cam.position.set(...f.pos);
    if (c.mode === 'Aim') { cam.up.set(0, 1, 0); lookAtVerticalSafe(cam, f.pos, f.aim); cam.rotateZ(f.twist); }
    else cam.rotation.set(f.aim[0], f.aim[1], f.aim[2], 'YXZ');   // aim 칸 = rot
    cam.updateProjectionMatrix();
  }
}
```

mg1801 초기화:

```ts
cam.add('loop',    clipOf('mg1801_cam00'));          // (0,2,23)→(0,3,-3), 20°
cam.add('result',  clipOf('mg1801_cam02'));          // (0,5.5,20)→(0,0,-1.5), 20°
cam.add('capture', clipOf('mg1801_cam_capture00'));  // (0,14.53,23.95)→(0,0,3.74), 15°
cam.play('loop');
// 상태: 엔딩 설정(0,6) 이 된 step → cam.play('result'); post.setPreset('post_result00')
// 캡처 모드에서 (2,2) → cam.play('capture')
```

### 9.4 조명 근사 (three.js r180)

| 원본 | 웹 근사 | 근거·주의 |
|---|---|---|
| 평행광 color (0.8,0.8,0.8), 방향 §6.6 overwrite | `DirectionalLight(0xcccccc, k)`, `light.position = target + (−0.0958, 0.8963, 0.4330)·L` | 세기 k는 원본 셰이딩 모델(forward_plus) 미판독이라 **눈으로 맞춤** |
| 그림자 캐스케이드 4, 범위 1~30 | `light.castShadow`, 단일 그림자맵 카메라 범위 near 1 ~ far 30, `shadow.bias`·`normalBias` 조정 | CSM 대신 단일 맵 |
| IBL 확산 `bg00_irr`, 반사 `bg00_rad`(밉 8) | `scene.environment = PMREM(bg00_rad 큐브 HDR)` 또는 irr로 `LightProbe` | HDR은 graphics 변환물 `*_NN.hdr`(BC6H) 사용 |
| 캐릭터 전용 IBL `cha_irr`/`cha_rad` | 캐릭터 재질에만 `envMap = PMREM(cha_rad)` | 원본은 캐릭터·배경 IBL을 나눈다 |
| mip fog 80~150, 세기 0.5, 색 = irr 큐브 | `scene.fog = Fog(평균색(bg00_irr), 80, 150)`에 세기 0.5 반영 | 카메라~무대 거리 23~30이라 mg1801 화면 영향은 작다 |
| ClearColor 0.25 회색 | `renderer.setClearColor(0x404040)` | 배경 모델이 화면을 덮으면 보이지 않음 |

### 9.5 포스트 근사 (EffectComposer)

```
RenderPass(HalfFloat 렌더 타깃, HDR 유지)
→ BokehPass(초점 ≈ focal_distance + focal_region/2, 뒤쪽만 흐림)      // DOF: 원본 near 흐림 0
→ UnrealBloomPass(threshold 1, strength 1, radius ≈ spread)        // 입력 clip 100(결과 1000)은 셰이더로 min()
→ OutputPass(toneMapping = ACESFilmic 등, exposure 1)              // 원본 종류 1 미확정 → 근사
→ ShaderPass(FXAAShader)                                            // 원본과 같은 FXAA 3.11 기본값
```

- 순서(DOF → 블룸 → 톤맵 → FXAA)는 일반적인 순서를 따른 **[추정]**이다.

### 9.6 근사 목록 (원본과 다른 점)

| 항목 | 원본 | 웹 | 동등성 유지 방법 |
|---|---|---|---|
| 삼각함수 | sdk 표(§6.5) | `Math.sin/cos` | 축 오차 ≤ 8.7e-5. 비트 일치가 필요하면 `sincos_table.json`으로 같은 식 |
| 깊이 범위 | 0..1(`m22 = −f/(f−n)`) | WebGL −1..1 | 화면 결과 같음. near 0.1/far 10000 비율 1e5라 z 싸움이 나면 far를 줄이는 것은 근사로 기록 |
| 종횡비 | 렌더 크기(16:9) | 캔버스 16:9 고정(web/DESIGN §8) | 같음 |
| 카메라 전환 | 즉시 | 즉시 | 같음 |
| 톤맵 | 종류 1(곡선 미확정) | ACES 등 | 눈으로 맞춤 |
| DOF | dof2(near/far 분리 보케) | BokehPass | 근사 |
| 블룸 | 다운/업 샘플 텐트 | UnrealBloomPass | 근사 |
| 그림자 | 캐스케이드 4 + 정적 EVSM | 단일 그림자맵 | 근사 |
| IBL | 셰이더 고유 BRDF(`AmbientBrdfPbrRg16f`) | three PMREM + 표준 BRDF | 근사 |
| `utility_parameter0` (0.4→1) | 의미 미확정 | 반영 안 함 | 미확정 해소 뒤 반영 |

### 9.7 에셋 변환

| 대상 | 명령 | 결과 |
|---|---|---|
| 카메라 | `web/tools/analysis/camera_probe/bin/Release/net7.0/camera_probe.exe cam <out.json> <x.fsnb>...` | base·커브·`bakedPerFrame`·`threeAtFrame0` |
| 조명·포스트 | `camera_probe.exe env <out.json> <x.fmdb>...` | 셰이더 할당·재질 파라미터·renderInfo·뼈·작은 메시 정점 |
| fsnb 전수 | `camera_probe.exe scan extracted/bea <out.json>` | 요약 |
| IBL 큐브맵 | graphics 담당 `web/tools/analysis/graphics_bntx.py`(이미 `extracted/converted/graphics/mg1801/tex/`) | 면별 png/hdr 6장 |
| 빌드 | `cd web/tools/analysis/camera_probe && dotnet build -c Release` | |

웹 manifest에 넣을 형식(권장): `assets/mg1801/camera.json = { clips: { loop: CamClip, result: CamClip, capture: CamClip }, light: DirLightParams, env: EnvParams, post: { post: PostParams, post_result00: PostParams } }`. 손으로 고치지 않고 위 덤프에서 만든다.

### 9.8 구현 순서 (권장)

1. 회색 박스 카메라를 §7.1 `loop` 값으로 교체(가장 효과 큼, 데이터 확정).
2. `SceneCameraPlayer` + 엔딩에서 `result` 전환.
3. 평행광 방향·색, 배경 IBL(PMREM), 캐릭터 IBL.
4. 포스트 체인(FXAA → 블룸 → 톤맵 → DOF 순으로 추가하며 눈 비교).
5. 캡처 모드는 리듬 쿠킹 포팅 때.

## 10. 검증 코드·실행 결과·기대값

| 검증 | 종류 | 결과 |
|---|---|---|
| `camera_probe scan` fsnb 899개 로드 | [실행: 덤프] | 실패 0, 카메라 899, 라이트 0, 포그 0 |
| `camera_probe cam` mg1801 4개 | [실행: 덤프] | §7.1 표 값 |
| `camera_probe env` mg1801 4개 | [실행: 덤프] | §7.3~7.5 값, dir_light 메시 꼭짓점 z = −1 |
| `node web/tools/analysis/camera_verify.mjs` — 원본 뷰 행렬식(§6.2, 정확한 삼각함수) vs three.js 동치식 | [재구현 계산] | mg1801 4개 + 무작위 Aim 200·Euler 200 = 404건, 축 최대 오차 8.9e-16, 이동 최대 2.8e-14, 종료 코드 0 |
| 같은 비교에 sdk 표 사인·코사인 사용 | [재구현 계산] | 축 최대 8.7e-5, 이동 최대 2.9e-3(위치 크기 30 기준) |
| mg1801 주요 점의 NDC(§7.1 표) | [재구현 계산] | 채소 등장 y 1.128(화면 밖 위), 판정 높이 −0.342, 플레이어 발 −0.674 |

- 원본 실행 화면과의 대조는 하지 않았다. 웹 구현 뒤 기대값: `loop` 카메라에서 4개 레인의 채소가 화면 위 가장자리 바로 바깥에서 내려와 NDC y ≈ −0.34에서 판정되고, 플레이어 4명이 화면 아래쪽 1/6 부근(NDC y ≈ −0.67)에 x = ±0.38 안쪽으로 선다.
- 스텁·미검증: 슬롯 프레임 진행(09 근거), 전이 중 승자, 조명 세기, 포스트 곡선은 실행 검증이 없다.

## 11. 미확정 사항과 추가 분석에 필요한 근거

| 항목 | 영향 | 필요한 근거 |
|---|---|---|
| container 재질 파라미터 → bex::gfx 컴포넌트 필드 연결 함수 | 조명·포스트 값이 실제로 어떻게 쓰이는지 | ComModel 생성 시 셰이딩 모델 판별 코드, ComModelBuffer::UpdateGpuResources(@0x71000702c0) 판독 |
| overwrite 회전 단위(도)·축 순서, 빛 진행축(−Z) | 빛 방향 | `FUN_7100074ddc` 이후 렌더러가 +0xF0을 읽는 곳 판독 |
| 톤맵 종류 1의 곡선, 포스트 처리 순서, bloom spread·clip 의미 | 화면 색 | `posteffect_amalgam0.bnsh` 디스어셈블(Maxwell SASS) 또는 원본 화면 캡처 대조 |
| DOF 파라미터 의미(focal_distance=시작, region=길이 가정)와 Camera+0x2F8 초점 거리 사용 | 흐림 범위 | Camera+0x2F8 reader, dof2 셰이더 |
| `posteffect_utility_parameter0` (0.4 → 1), `env_utility_parameter0` (5,2,25,0.35) | 미상 효과 | 셰이더 그래프(`fragment_shader_graph_last`) 판독 |
| 미니게임 단독 모드에서 ResultModeCaptureEnable 값 | capture 카메라 사용 여부 | RmGameWork+0x6C3 초기화·모드 진입부 판독 |
| 카메라 슬롯 전이 중 어느 클립이 적용되는가(노드 종류 ≥2의 vt+0x40) | 전환 순간 1~수 프레임 | bezel AnimationNode 블렌드 노드 vtable 판독 |
| 원본 기본 GlobalLighting(nbgllt)과 container 조명의 우선순위 | 조명 | bezel_global_lighting 로더 판독 |
| 카메라 사용자 데이터(Near/Far/Offset/Shadow/Dof…) 소비 코드 | 보드 컷신 | bd01.nro 판독 |
| 키 pre/post wrap 처리 | 루프 카메라 끝 프레임 | g3d CameraAnimObj::Calculate 판독 |
| 흔들림 갱신식 | 다른 미니게임 | `wl::util::ComponentCameraShaking` 갱신 함수(FUN_71004e1184 등) 판독 |

## 부록 A. 도구

| 도구 | 사용 |
|---|---|
| `web/tools/analysis/camera_probe` | `dotnet build -c Release` 뒤 `camera_probe.exe scan|cam|env …`(§9.7). 커브 식은 §6.4 |
| `web/tools/analysis/camera_verify.mjs` | `node web/tools/analysis/camera_verify.mjs`(작업 폴더 `c:/dev/mpj`, three는 `web/node_modules`) |
| `web/tools/analysis/ghidra_scripts/CameraRefs.java` | 인자 `d:<주소>`(함수 디컴파일), `r:<주소>`(참조 + 참조 함수 디컴파일), `x:<주소>:<n>`(디스어셈블), `f:<주소>`(메모리에서 함수 만들고 디컴파일), `m:<주소>:<n>`(qword 덤프 + 심볼). 예: `analyzeHeadless.bat c:/dev/mpj/ghidra_work/camera jamboree_main -process main.nso -noanalysis -readOnly -scriptPath c:/dev/mpj/tools/ghidra_scripts -postScript CameraRefs.java C:/out.c d:71006c1120 x:7100775b90:40` (출력 경로는 `C:/…` 형식) |
