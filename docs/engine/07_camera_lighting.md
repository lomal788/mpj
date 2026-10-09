# 07. 카메라·조명·포스트이펙트 — 씬 카메라 애니, mg1801 카메라 값, 라이트·IBL, 포스트

2026-10-09. 상태: **기존 분석 재사용·원본 정적 판독 반영 / 현재 웹 구현 차이 확인 / 잔여 1개**.
문서 형식은 [분석.txt](../../../../web/분석.txt)를 따른다. 확정 범례: **[판독]** 원본 코드·ARM64·SASS, **[데이터]** 원본/기존 덤프 값, **[재구현 계산]** 판독식을 계산한 값, **[실행: 덤프]** 기존 변환 도구 결과, **[추정]·[근사]·[설계]** 미확정 해석·웹 선택, **[미확정]** 소비 근거 부족. 이번 반영은 원본 게임 실행·구현 없이 정적 자료만 읽었다.

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
| 분할 RT·플레이어/팀 레이어·투영 보정 | [10_split_screen.md §4·§6](10_split_screen.md) |
| 공통 결과 무대 transform·95개 카메라 키·시간·near/far override | [../shell/minigame_result.md §6.6~6.7·§7.2](../shell/minigame_result.md) |
| 게임별 카메라 제어·레이어 | [mg0101 §6.1](../minigame/mg0101.md), [mg0102 §7](../minigame/mg0102.md), [mg0106 §7](../minigame/mg0106.md), [mg0122 §6.1](../minigame/mg0122.md), [mg0508 §7](../minigame/mg0508.md) |
| 광장 추종 카메라·환경·기존 판독 SASS/조명 | [../shell/plaza_3d.md §3.3~3.5·§6.7~6.8·§6.13](../shell/plaza_3d.md), `analysis/mat/plaza_post.json` |

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

mg1801은 정적 카메라 클립을 쓴다. 엔딩 연출(채널 0 값 6)에서 결과 클립을 요청하고 포스트를 결과용으로 교체한다(§5). 카메라 값은 대표 클립 하나를 적용하며 전환 선택은 §3.2를 따른다.

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

카메라 결과끼리는 가중 평균하지 않는다. 다만 **대표 자식 선택에는 가중치가 쓰인다**. `FUN_710080af2c`의 vt+0x40 호출과 원본 vtable을 판독한 규칙:

| 노드 종류 | 선택 함수(main) | 카메라 적용 대상 |
|---|---|---|
| 2 | `0x710080b6d0` (vt `0x7101a0d940`) | +0x38~+0x40의 `{node*, weight:f32, …}`(0x10 B) 중 최대 weight. `fcmp` 뒤 `csel …,mi`이므로 **동률은 앞 자식**, 비어 있으면 null |
| 3 | `0x710080bd48` (vt `0x7101a0d9a8`) | 자식 수 > 0이면 `GetChild(0)`, 아니면 null |
| 4·5·6 | `0x710080bc60` | `node+0x38`의 단일 자식 |

종류 1의 순차 덮어쓰기와 위 대표 선택은 별개다. 슬롯의 Play·가중치 시간 진행은 [09 §6.5~6.6](09_character.md)을 참조하며, 카메라가 전이 요청 순간 항상 새 클립을 적용한다고 일반화하지 않는다. 선택된 클립은 `CameraAnimObj::Calculate @0x71007753d0` → §6.4 평가 → 적용기다 [판독].

### 3.3 조명·포스트 만들기 [판독 mg1801 @0x710000f9d0]

| this 오프셋(MapImpl) | 엔티티 이름 | ComMatter 경로 |
|---|---|---|
| +0xB8 | `env00` | `mg/mg1801/env/mg1801_env.fmdb` |
| +0xD0 | `dir_light00` | `mg/mg1801/env/mg1801_dir_light.fmdb` |
| +0x100 | `post00` | `mg/mg1801/env/mg1801_post.fmdb` |
| +0xE8 | `cam00` | (MatterType 1) |

- 재질→컴포넌트는 기존 광장 판독 `ghidra_work/plazaA/out_post_com.c`·`out_post_xref.c`를 재사용한다. 이름 검색 `FUN_7100088b60`으로 ResShaderParam을 찾고 **재질 CPU 파라미터 버퍼 + 해당 파라미터의 u16 offset(+0x12)**을 캐시한 뒤 setter로 복사한다. “main에 이름이 없다/블록 배치만 읽는다”는 옛 설명은 잘못이다.
- post: `FUN_7100091010` 이름 표 `0x71019cf6a0` → `FUN_7100091220` → ComPosteffect → `FUN_710007741c` UBO → `FUN_71000acf00` 패스 구성. 전체 필드 표·SASS는 [plaza_3d §6.13](../shell/plaza_3d.md)·`analysis/mat/plaza_post.json`을 참조한다.
- directional: `FUN_7100091b4c` 이름 검색 → `FUN_7100092010` setter. color→+0x50, array_length→+0xA0, lambda→+0xA4, constant_bias→+0xA8, normal_bias[4]→+0xAC, near/far/offset/fade→+0xBC/C0/C4/C8, overwrite→+0xDC, position→+0xE0, rotation→+0xF0. `FUN_7100076bb8~76c20`·`76c90/76cb4/76cf0` 원본 저장 주소와 대조했다 [판독].
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

- **ResultModeCaptureEnable 기본값은 0**.`RmGameWork::RmGameWork @0x7100427d50`이 `FUN_7100428720(this+8)`을 호출하며, helper의 `param_1[0x1AE]=0`(main `0x7100428ac0`)이 this+0x6C0~6C3을 4 B로 지워 플래그까지 초기화한다. 바깥 생성자의 개별 byte store만 찾으면 놓치는 경로다 [판독].
- setter `@0x710042d4ac`는 this+0x6C3에 bool을 쓴다. 기존 호출 조사에서 활성화는 rc_stage01 `SyncedSetupGame` 계열(`rc_stage01_setbpm.c`, NRO 139개 중 참조 1개)이므로 단독 모드는 이 기본 0 경로, 리듬 쿠킹은 명시 활성화 경로다 [판독·데이터].
- 활성화 시 `result` → `capture` 요청 순서가 보장된다. 실제 적용은 §3.2의 대표 노드 선택을 따른다. 일반 `bq::MGResult`의 결과 무대 카메라와 이 Rm 캡처 카메라는 서로 다른 경로이며 [minigame_result §6.7](../shell/minigame_result.md)의 판독을 복제하지 않는다.

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
- 기본 pass에서는 애니 aspect를 보존하지 않고 기존 Camera aspect를 유지한다. **분할 화면의 최종 draw camera 보정은 이 pass와 별도**다. [10_split_screen §4·§6](10_split_screen.md)의 확정식을 재사용한다: type 0·mode 3에서 `A=(splitW/splitH)·RTaspect`, `A<A0`이면 fovy 유지, `A≥A0`이면 `fovy′=2·atan(tan(fovy/2)·A0/A)`로 가로각 유지. A0 기본은 f32 `0x3FE38E39`(16:9); near/far는 보존한다. frustum·orthographic 및 플레이어/팀 레이어 연결도 해당 문서 범위다.

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

- `Camera::Reset @0x71008458f8`: **eye=(0,0,10), aim=(0,0,0), up=(0,1,0)**, focus=10; 투영 = (**fovy=0.6605948805809021 rad**, aspect=f32 16/9, near=0.1, far=1000)..bss writer `main @0x7100848e30~848e9c`가 벡터 상수 `0x71015d2ea0/15d34a0`과 zero를 저장하고, `fovy=f32(f32(FloatPi/FloatDegree180)·floatBits(0x421765AF))`를 계산한다. SDK `FloatPi @+0x8B6B14=3.1415927410125732`, `FloatDegree180 @+0x8B6B28=180`; degree operand=37.849300384521484 [판독·데이터·재구현 계산]. LookAt 인자 순서는 `(aim,up,eye)`이고 `@0x7100845970~5990`에서 eye−aim, `@845c24~845c4c`에서 focus=길이를 확인했다.
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
- 초점 거리(Aim이면 |pos−aim|, cam00=26.019)는 Camera+0x2F8에 기록되지만 **내장 dof2의 초점 UBO는 ComPosteffect+0x4C에서 온다**. 이 두 값이 자동 연동되는 경로는 해당 UBO 생성기에 없다. mg1801 DOF 중심은 26.019가 아니라 17이며, 실제 흐림 범위는 §7.5다 [판독].

### 6.4 커브 평가·키 경계 (FRES AnimCurve) [판독: main ARM64]

`CameraAnimObj::SetRes @0x7100775330`은 ResCameraAnim+0x18의 BaseData 0x2C B를 결과 버퍼로 복사(`@77431c`)하고 곡선별 캐시를 초기화한다. `Calculate @0x71007753d0`은 frame이 +0x40 캐시와 같으면 반환하고, 달라지면 `@774350/7743e0`에서 곡선(0x30 B)마다 `@772764`를 평가해 **curve+0x14의 AnimDataOffset**에 f32를 쓴다. 애니 없는 필드는 BaseData를 유지한다.

| ResAnimCurve 오프셋 | 내용 |
|---|---|
| +0x00 / +0x08 | frame 배열 / key 계수 배열 |
| +0x10 / +0x12 / +0x14 | u16 flags / u16 keyCount / u32 AnimDataOffset |
| +0x18 / +0x1C / +0x20 / +0x24 / +0x28 | start / end / scale / offset / 상대 반복 delta |

flags: frameType=bits 0~1, keyType=2~3, curveType=4~6, preWrap=8~9, postWrap=12~13.float 평가 분기 표 `0x7101A09C20`, 키 탐색 표 `0x7101A09BF0` [판독].

- frameType 0=f32 (`@771ba0`), 1=**signed i16/32**(Decimal10x5, `@771c60`), 2=u8(`@771d50`).각 함수는 마지막 키 이하 여부를 검사하고, 내부 키는 `f_i≤frame<f_(i+1)`인 i를 찾는다. Int16 비교는 `floor(frame·32)`, Byte는 `trunc(frame)`; 최종 t는 원래 f32 frame으로 계산한다. 마지막 키 이상이면 i=마지막, 캐시 구간은 **[마지막 frame, 마지막 frame+1]**이며 계수 평가 자체를 생략하지 않는다.
- Cubic(`@771dfc`, i16 `@771ee0`, s8 `@771fdc`): `t=f32((frame−a)·f32(1/(b−a)))`, `h=FMA(k3,t,k2)`, `l=FMA(k1,t,k0)`, `v=FMA(f32(h·t),t,l)`.수학식은 `k0+k1t+k2t²+k3t³`이나 일반 Horner 재배열과 f32 반올림 순서가 다르다. keyType 0/1/2는 f32/signed i16/signed i8 계수를 읽는다.
- Linear(`@7720d8/7721ac/77228c`): `v=FMA(k1,t,k0)`.**BakedFloat도 계단식이 아니다**(`@77236c/7723a8/7723f0`): `i=trunc(frame)−trunc(start)`, `u=frame−trunc(frame)`, `v=FMA(K[i+1],u,f32((1−u)·K[i]))`로 이웃 정수 샘플을 보간한다.
- 공통 최종 결과는 `FMA(v,scale,offset′)`(`@772878~77287c`).**scale=0을 1로 바꾸는 분기는 없다**. Step/정수형은 별도 evaluator 영역이며 위 float 세 분기의 식으로 대체하지 않는다.

wrap은 이미 [03_graphics의 커브 판독](03_graphics.md)을 재사용하되, 카메라의 실제 진입점 `@0x7100772764~772840`에서 경계·상대 delta 연결을 확인했다. start≤frame≤end는 그대로다. 밖에서는 길이 L=end−start, 거리 d=(pre ? start−frame : frame−end), q=trunc(d/L), r=f32(d−L·q):

| wrap 코드 | pre(frame<start) | post(frame>end) | offset′ |
|---|---|---|---|
| 0 Clamp | start | end | offset |
| 1 Repeat | end−r | start+r | offset |
| 2 Mirror | q 짝수: start+r, 홀수: end−r | q 짝수: end−r, 홀수: start+r | offset |
| 3 RelativeRepeat | end−r | start+r | offset + (pre ? −1 : +1)·(q+1)·delta |

예: [10,20]에서 Repeat f=20은 20, f=30은 10, f=0은 20; Mirror f=9/21은 11/19다. L=0에 반복을 적용하는 경우의 정상 동작은 위 식으로 보장하지 않는다. FSNB Loop에 따른 **클립 frame controller**와 개별 curve wrap은 다른 층이며 슬롯 시간은 09를 참조한다. 기존 `camera_probe/Program.cs::Eval`의 wrap 미적용·baked 상수 평가·scale fallback은 원본과 동등한 evaluator로 간주할 수 없다. 결과 무대 95개 곡선은 [minigame_result §6.7·§7.2](../shell/minigame_result.md)의 Cubic·Clamp 자료를 그대로 참조한다.

### 6.5 사인·코사인 표 [판독 + 데이터]

원본은 `std::sin/cos`가 아니라 sdk의 `nn::util` 표를 쓴다.

```ts
idx  = fcvtzs(rad * (2^31 / π))          // i64
e    = table[(idx >> 24) & 0xFF]         // {cos, sin, dcos, dsin}, 256개 = 2π
frac = (idx & 0xFFFFFF) * 2^-24
cos  = e.cos + frac * e.dcos;  sin = e.sin + frac * e.dsin
```

- 표: sdk NSO 압축 해제 이미지 오프셋 0x8B570C → `extracted/converted/camera/sincos_table.json` [데이터]. main의 Euler 경로 디스어셈블에서 `fcvtzs x`, `lsr #0x18`, `and #0xffffff`, `ucvtf` 확인 [판독].
- 정확한 삼각함수와의 차: cos 최대 5.8e-5, 카메라 축 최대 8.7e-5 [재구현 계산]. 웹의 `Math.sin/cos`는 이 차이를 가진 근사이며 비트 일치 경로로 확정하지 않는다(§9.1).

### 6.6 평행광 transform·렌더 연결 [판독·데이터]

`FUN_71000760d4`는 `ComDirectionalLight+0xDC`가 1이면 +0xF0/F4/F8의 **도 단위 XYZ**에 `FloatPi/180`을 곱한다(`@76154~76178`). 출력 기저는 **R=Rz·Ry·Rx**, translation=+0xE0; overwrite=0이면 뼈 소켓 +0x60/70/80/90 행렬을 사용한다(`@76300`).Overwrite 경로의 sin/cos는 SDK `SinCoefficients @+0x8B56C4`, `CosCoefficients @+0x8B56D8` 다항식이다(`@76188~76288`); 카메라의 §6.5 표 보간과는 다른 경로다.

추가 yaw 경로도 포함한다. `owner=*(light+0x30)`가 유효하고 `*(*(owner+0x1C0)+0x20) != 0`이면(`@76318~76320`) draw layer의 **GraphicsLayerExtension**(type descriptor `0x71019CD548`)에서 degree 값 `q=extension+0x378`을 얻는다(`FUN_710005dfa0`, `@763ac`). `θ=−q·FloatPi/180`으로 **R′=Ry(θ)·R**를 계산하고 translation은 보존한다(`@763d0`, `@7653c~76580`); 조건이 꺼지면 R′=R이다. 아래 숫자는 이 추가 yaw가 0인 기준 transform 값이며 모든 layer에서 무조건 같은 월드 방향이라고 확정하지 않는다.

열 벡터 표기, sx=sin(x), cx=cos(x) 등으로 추가 yaw 전 +Z 기저는 `L=(cz·sy·cx+sz·sx, sz·sy·cx−cz·sx, cy·cx)`.`FUN_71000751cc`의 `@753d8`에서 이 transform을 받고 **최종 R′의 +Z xyz를 light UBO+0x10/14/18**로 쓴다(`@759c8`, `@75b94~75ba0`).기존 `plaza_graph_1.json`·[plaza_3d §6.8·§6.13](../shell/plaza_3d.md)의 셰이더 판독상 L은 표면→광원이며 빛 진행 방향은 −L이다. 표시용 피라미드 메시의 모양만으로 축을 추정하던 설명을 대체한다.

| 기준 transform(q=0) | 빛 진행 방향 −L [재구현 계산, 소수 4자리] | three light.position−target = L |
|---|---|---|
| mg1801 overwrite (−60°,−30°,−10°), T=(0,2,0), enable=1 | (0.0958,−0.8963,−0.4330) | (−0.0958,0.8963,0.4330) |
| 뼈 (−70°,0°,−10°), T=(−1.0521,5.0927,0.3276), 참고 | (−0.1632,−0.9254,−0.3420) | (0.1632,0.9254,0.3420) |

업데이트는 `FUN_7100074c20`의 BoneSocket 캐시 → `FUN_7100074ddc`의 그림자 갱신 표시(+0xCD 조건) → renderer 수집 호출 `main @0x7100099a68` → `FUN_71000751cc`의 UBO/그림자 카메라 구성으로 연결된다. overwrite 위치·회전 setter는 값 변화와 enable=1일 때만 갱신 표시한다(`@76cb4/76cf0`); enable setter는 bool 변화 시 표시한다(`@76c90`).빛 위치는 평행광의 L을 바꾸지 않으며 그림자 transform에는 참여한다. diffuse·IBL의 π 관례는 기존 광장 분석을 참조하고 (§9.2), mg1801의 모든 재질 BRDF가 같다고 확장하지 않는다.

## 7. 애니메이션·이펙트·소리·카메라·에셋 연결

### 7.1 mg1801 카메라 값 [데이터 — `web/tools/analysis/camera_probe cam` 덤프 실행 확인]

전부 Aim 모드, Perspective, FrameCount 0(정적), 커브 0, twist 0, 루프 아님. 덤프: `extracted/converted/camera/mg1801_cameras.json`.

| 라벨 | 파일(카메라 이름) | 위치 pos | 주시점 aim | fovy(rad) | three.js fov(도) | near / far | 애니 aspect(미적용) | pos−aim 거리 | 내려다보는 각 |
|---|---|---|---|---|---|---|---|---|---|
| `loop` | `mg1801_cam00.fsnb` (`mgcn403_cam00`) | (0, 2, 23) | (0, 3, −3) | 0.34906584 | **20** | 0.1 / 10000 | 1.78 | 26.019 | −2.20°(살짝 올려봄) |
| (미사용) | `mg1801_cam01.fsnb` (`mgcn403_cam00`) | (0, 16, 18) | (0, 0, −3) | 0.34906584 | 20 | 0.1 / 10000 | 1.78 | 26.401 | 37.30° |
| `result` | `mg1801_cam02.fsnb` (`mg1801_cam2`) | (0, 5.5, 20) | (0, 0, −1.5) | 0.34906656 | 20.00004 | 0.1 / 10000 | 1.78 | 22.192 | 14.35° |
| `capture` | `mg1801_cam_capture00.fsnb` (`cam_capture00`) | (0, 14.531198, 23.946115) | (0, 0, 3.74) | 0.2617994 | **15** | 0.1 / 10000 | 1.777 | 24.889 | 35.72° |

현재 [view/camera.ts](../../script/games/mg1801/view/camera.ts)에 이 세 라벨 값이 들어 있고 [view/stage.ts](../../script/games/mg1801/view/stage.ts)가 상태에 맞춰 `applyCamera`를 호출한다. `view/index.ts`의 Camera는 near=0.1/far=10000, aspect=16/9다. 옛 회색 박스의 (0,6,17)·35°는 현재 상태가 아니다.

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
| 카메라 사용자 데이터 | 보드(bd*) 컷신 일부에만 `Near`·`Far`·`Offset`·`Shadow`·`Dof`·`FocalDistance` 등. 소비 경로·setter는 아래 [판독] |

- **라이트 애니는 fsnb에 없다.** 조명·포스트 변화는 container 모델의 재질 파라미터 애니(`.fmab`)로 한다. 예: `bd03_dir_light00_a.fmab`(120프레임) = `directional_light_color`, `directional_light_shadowmap_camera_far`; `bd04_post00_ev00.fmab`(430프레임) = `posteffect_utility_parameter0` [데이터]. mg1801에는 이런 fmab가 없다(mg1801 fmab는 `line01`·`water00`뿐) [데이터].
- 보드 카메라는 fsnb 외에 `bd0N_MapCamera.json`(노드별 Fovy·Center·RotateX/Y·Zoom·Shadow/Dof/Tonemap 프리셋 이름), `bd00_CameraFsnb.json`, 메뉴 `CameraParam.json` 등 JSON 파라미터가 따로 있다 [데이터].

**보드 userData 소비** [판독, `bd01.nro`]: `Camera::UpdateEnvironment @0x7100041158` → overload `@0x7100042310` → `CameraMgr::UpdateEnvironment @0x7100042460`은 ComActorMotion의 **주 애니메이션 슬롯 → 슬롯 +0x38 현재 노드**를 `AnimationNodeCamera`로 검사한다. `GetAnimObj`(PLT `03df6b0`)의 +0x60 ResCameraAnim에서 +0x20 userData 배열·+0x38 u16 count를 읽어 **0x40 B씩 파일 순서로** 처리한다(`0425a8~042668`). 이름은 FRES 문자열 +2, 값은 userData +8 포인터의 **첫 값**이며 타입 byte +0x14는 0=Int32, 1=Float, 2=String이다. 노드가 camera가 아니면 적용하지 않고, 없는 이름·없는 프리셋은 건너뛴다.

| 이름 / 타입 | 실제 전달 / 호출 주소 (`bd01 @0x7100…`) |
|---|---|
| `Near`·`Far`·`Offset` / Float | `ComDirectionalLight::SetShadowmapDynamicCameraNear/Far/Offset` → main light +0xBC/C0/C4 (§6.6); `0428bc/042ab4/042b0c` |
| `Quality` / Int32 | 첫 값 ≠ 0 → **SetDofEnable(bool)** (`042708`, PLT `03df6c0`); 블러 품질 등급으로 해석하지 않음 |
| `FocalDistance`·`FocalRegion`·`NearTransition`·`NearBokeh`·`FarTransition`·`FarBokeh` / Float | 각각 ComPosteffect setter (`042db0/042c7c/042d88/042c10/042d1c/042bb0`); §7.5 DOF UBO로 연결 |
| `Shadow` / String | singleton +0x120 → +0x30 `JsonShadowSetting::FindData`(PLT `03df280`); 선택 레코드 +0x10/14/18 float를 Near→Far→Offset 순서로 전달(`0427c4~042820`) |
| `Dof` / String | singleton +0x120 → +0x38 `JsonDofSetting::FindData`(PLT `03df290`); +0x10 Int32 enable, +0x14/18/1C/20/24/28 float를 distance→region→near transition→near bokeh→far transition→far bokeh 순서로 전달(`042950~042a64`) |

이름별 setter를 **그 순서대로 덮어쓰므로**, 뒤 개별 값이 앞 프리셋을 바꿀 수 있고 없는 필드는 이전 컴포넌트 값을 유지한다. userData 자체는 커브 보간 대상이 아니다. `bd01_ev01_cut01_cam00/01/02` 및 `cut02_cam00.fsnb`의 실제 Float userData는 Near=0.1, Offset=3, Far=**50/65/70/70** [데이터: 원본 0x40 B 레코드]. 이는 **그림자 카메라** 값이며 §6의 ResCameraAnim 투영 near/far를 바꾸지 않는다. 이 경로는 판독한 bd01 소비자 범위이며 공통 g3d 적용기에서 모든 보드에 자동 적용한다고 일반화하지 않는다.

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
| `env_utility_parameter0` | (5, 2, 25, 0.35) — 아래 CPU 전달·mg1801 모델 pack의 reader 부재 [판독] |
| `env_wind_velocity` | (0, 0, 0) |

- 모델 재질 쪽에도 개별 반사맵이 있다(`mg1801_bg00_result00_rad`, `mg1801_water00_rad`) — 03_graphics 범위.
- 캐릭터 `pc*_<이름>_light.fmdb`는 조명 데이터가 아니라 경량 모델이다(graphics 정정, SHARED.md) [데이터].
**utility0 전달·소비 범위** [판독]: main `FUN_71000905a0 @009070c~0090760`은 이름 표 `019cf548`의 13번째 `env_utility_parameter0`(`019cf5a8`)를 찾고 material CPU buffer + ResShaderParam.u16 offset(+0x12)을 reader +0x210에 캐시한다. `0090a3c~0090a58`이 Float4를 `0074714`로 넘겨 **ComEnvironment+0xB0..BC**에 그대로 복사한다. 레이어 준비 `005f750 @005f874` → 환경 버퍼 작성 **`0073e8c @00742ac~00742c8`** → Layer buffer **+0x120/124/128/12C**에 x/y/z/w를 쓴다(정규화·단위 변환 없음). parameter1/2/3은 이어서 +0x130/140/150이다. [plaza_3d §6.8](../shell/plaza_3d.md)의 “Layer[0x120]=parameter1”은 기존 **[추정]**이며, 이 CPU 대응과 다르므로 mg1801 값에 그 바람 해석을 전용하지 않는다.

원본 `_mg/mg1801.bnbshpk`를 메모리에서만 정적 판독했다. forward_plus_color **205 프로그램**의 BFSHA UniformBlockLocations에서 Layer는 VS 전부 −1, FS는 152개 location=1(나머지 53개 −1), 즉 사용하는 FS의 SASS bank는 **c4**다. BNSH의 고유 VS **29개**·FS **79개**를 기존 envydis로 읽으면 `c4[0x120/124/128/12C]` reader와 `c4[레지스터+…]` 간접 reader가 **모두 없다**. fog +0x100..11C 등 다른 Layer 값의 reader는 있다. pack의 container 고유 VS/FS 각 1개도 해당 reader가 없고 geometry/tessellation/compute 단계는 없다. 따라서 **mg1801의 이 모델 shader pack에서는 utility0 네 값이 업로드만 되고 셰이딩에 쓰이지 않는다**. 다른 게임·공통 캐릭터/VFX pack의 의미까지 일반화하지 않는다.

**DefaultGlobalLighting 우선순위는 자료 부족**: 원본 `_SystemLighting.nx.bea/_BezelSystemResources/GlobalLightings/DefaultGlobalLighting.nbgllt`는 4,009 B msgpack(`type_id=bezel_global_lighting`, value._version=2)이다. MainLightColor=(1,1,1,1), Intensity=**2.828**, Direction 원자료=(−0.785,−1.285,−1.3), shadow enabled·PCF·Fit·1024²·4 cascade, split=(30,50,100,200), AmbientColor=(0.2,0.2,0.2,1)·scale=3 [데이터]. 파일명 Default만으로 실제 활성 기본값으로 보지 않는다. `boot.nbinit`에는 이 파일/형식의 로드 설정이 없고 main·sdk·subsdk0 정적 이미지에서 파일명·type_id·MainLightColor/Intensity/GlobalLighting 문자열 연결도 찾지 못했다. **이 검색 결과만으로 미사용을 확정할 수는 없다.** 한편 main `ComGlobal::GetCameraPosition @0094ff0`·target/up/clip/fovy setter/getter는 카메라 필드를 다루므로 이름 Global만으로 nbgllt 소비자에 연결하지 않는다. container의 실제 light→Layer UBO는 §6.6에서 확인했지만 nbgllt 로더·같은 layer binding·선택/덮어쓰기 연결이 없어 두 경로의 우선순위는 **[미확정]**.

### 7.5 포스트 `mg1801_post.fmdb` / `mg1801_post_result00.fmdb` [데이터]

셰이딩 모델 `container/posteffect`, 재질 `post`, 옵션 `fragment_shader_graph_last = 0`.

| 파라미터 | 게임 중 (`post`) | 결과 (`post_result00`) | 해석 |
|---|---|---|---|
| renderInfo `posteffect_renderinfo_tonemap_type` | 1 | 1 | 기존 SASS 유리식(아래 참조) |
| renderInfo `posteffect_renderinfo_color_gradation_type` | 0 | 0 | |
| `posteffect_tonemap_exposure` / `_exposure_offset` / `_output_scale` | 1 / 0 / 1 | 같음 | |
| `posteffect_bloom_enable` | 1 | 1 | |
| `posteffect_bloom_threshold` / `_intensity` / `_spread` | 1 / 1 / 1 | 같음 | smoothstep(1,2,휘도); spread는 다운 샘플 이득·first_down의 1/spread⁵ [판독] |
| `posteffect_bloom_clip` | **100** | **1000** | RGB 벡터 길이 제한, 채널별 min이 아님 [판독] |
| `posteffect_dof_enable` | 1 | 1 | |
| `posteffect_dof_focal_distance` | **17** | **20** | 초점 구간 중심 D₀ [판독] |
| `posteffect_dof_focal_region` | **25** | **30** | 중심 양쪽에 region/2 [판독] |
| `posteffect_dof_near_transition` / `_near_bokeh` | 0 / 0 | 0 / 0 | 앞쪽 흐림 없음 |
| `posteffect_dof_far_transition` | **7** | **15** | 구간 뒤에서 CoC가 0→1이 되는 거리 [판독] |
| `posteffect_dof_far_bokeh` | 1 | 1 | |
| `posteffect_dof_near_invisible` / `_depth_mask` | 0 / 0 | 같음 | |
| `posteffect_fxaa_enable` | 1 | 1 | |
| `posteffect_fxaa_edge_threshold` / `_min` / `_sub_pixel` | 0.166 / 0.0833 / 0.75 | 같음 | FXAA 3.11 Quality 기본값과 같음 |
| `posteffect_motion_blur_enable` | 0 | 0 | |
| `posteffect_color_grading_enable` / `_lut_enable` / `_lut_blending_enable` | 0 / 0 / 0 | 같음 | |
| `posteffect_color_grading_vignette_intensity` | 0 | 0 | |
| `posteffect_color_gradation_*` | circle/linear factor 0, color (1,1,1,2) | 같음 | 꺼진 것과 같음 [추정] |
| `posteffect_utility_parameter0` | **(0.4, 1, 1, 1)** | **(1, 1, 1, 1)** | 내장 패스 미사용, 두 프리셋의 shader_graph_last=0이므로 효과 없음 [기존 판독·데이터] |
| 그 밖 utility | (1,1,1,1) | 같음 | |

**기존 참조로 해소한 포스트**: [plaza_3d §6.13](../shell/plaza_3d.md)·`analysis/mat/plaza_post.json`의 `FUN_71000acf00` 패스 구성, `FUN_710007741c` UBO, amalgam 320변형·bloom SASS 판독을 재사용한다. mg1801은 DOF→bloom down/up→**amalgam 안에서 장면 FXAA→블룸 가산→노출→톤맵**→copy다(모션 블러·LUT·color grading 꺼짐). variant는 `1+2+(1<<2)=7`; 광장의 LUT 포함 variant 55를 그대로 적용하지 않는다. 노출은 `x=c·exposure+exposure_offset`, 마지막 output_scale은 곱셈이다. 종류 1 유리식의 계수·bloom 탭/가중치는 참조 자료에 있으며 ACES/Neutral로 확정하지 않는다. first_down 표본의 필터 정체 등 참조 자료의 미확정도 유지한다.

**새로 판독한 DOF**: `ghidra_work/plazaA/out_post_ubo.c::FUN_710007741c`는 ComPosteffect +0x4C/50/54/58/5C/60을 `c[0xe][0x00..0x14]`에 각각 `D₀, region/2, 1/near_transition, 1/far_transition, near_bokeh, far_bokeh`로 쓴다. pass UBO `c[0xf][0xC4/C8/CC]`는 far, near·far, far−near다. 기존 생성 SASS `analysis/mat/plaza/post_sass/posteffect_dof2_first_far.fs.txt @0x70~0x178`의 FFMA/RCP/절댓값/SAT로 다음을 확인했다:

```
D(z)   = |near·far / (z·(far−near)−far)|       // z: 원본 depth 0..1, D: 양의 시선축 거리
CoCfar = sat((D−D₀−region/2) / far_transition)
```

far resolve는 정규화된 blur 색을 `CoCfar·far_bokeh`로 장면에 섞는다(`posteffect_dof2_resolve_far.fs.txt`).near_bokeh=0인 mg1801은 far 전용 갈래이고, UBO에 1/0이 저장돼도 near blur를 추가하는 근거로 삼지 않는다. D₀는 Camera+0x2F8이 아니라 ComPosteffect 값이다.

| mg1801 프리셋 | 중심·region | 명목 초점 구간 | 뒤쪽 흐림 시작 / CoCfar=1 |
|---|---|---|---|
| post | 17·25 | **4.5~29.5** | **29.5 / 36.5** |
| post_result00 | 20·30 | **5~35** | **35 / 50** |

앞쪽 blur는 꺼져 있어 구간 앞도 선명하다. 초점은 유클리드 거리 대신 시선축 D로 비교한다. 예전의 17~42·49 설명을 위 식으로 정정한다. Bokeh의 UBO 화면 크기 계수는 `height/1080·bokeh`(+0x18/1C)이며 웹의 임의 6 px 반지름과 동일하다는 근거는 없다.

post utility는 기존 전수 SASS에서 `c[0xe][0x70..7C]` reader가 없고 graph_last만 가능한 소비처다. `mg1801_env.json`의 두 post 모두 **posteffect_shader_graph_last_enable=0**, option `fragment_shader_graph_last='0'`이므로 (0.4→1)은 이 내장 체인을 바꾸지 않는다. `boot.nbinit`의 기본 ClearColor=(0.25,0.25,0.25,1)은 포스트 노출값과 별개다.

### 7.6 카메라 흔들림 [판독: main ARM64, mg1801 미사용]

`ComponentCameraShaking::Start @0x71004e0e50`은 기존 동작을 정지하고 ComCamera의 Camera+0xB0 위치를 +0x60에 저장한다. duration=arg+0x00>0일 때 시작; +0x54=duration, +0x70/74=max(arg+0x04/08,1)=시작/끝 주파수, +0x78/7C=arg+0x0C/0x10=시작/끝 진폭. arg+0x14/15/16은 X/Y 난수·반복 bool(비트 2/3/1)이다.

매 프레임 event `0x5F454E00`의 `@0x71004e14dc` 콜백 → **갱신 `@0x71004e124c`** → 위치 적용 `@0x71004e12d0`:

```
elapsed(+0x50) += GetDeltaTime(); t = min(elapsed/duration,1)
freq(+0x58) = FMA(freqEnd−freqStart,t,freqStart)
amp (+0x5C) = FMA(ampEnd−ampStart,t,ampStart)
phase(+0xA0) = min(phase + dt/(1/freq),1)
v = vStart(+0x80) + (vTarget(+0x90)−vStart)*phase
position = savedBase + amp*(Camera[+0x40].xyz*v.x + Camera[+0x50].xyz*v.y + Camera[+0x60].xyz*v.z)
Camera::SetPosition @0x7100846ad8(position)
```

phase≥1이면 vStart=vTarget, X/Y가 켜진 성분마다 `SyncRandModF(2)−1`(`@0x7100189494`)을 뽑고 다음 target=(x,y,0)을 만든다. **0<len²≤1일 때만 정규화**, len²>1은 그대로, 0이면 SDK UnitY=(0,1,0)로 대체(`@4e1468~4e14b8`); phase=0으로 버려 초과분을 이월하지 않는다. Start의 첫 target 생성은 새 축 bool 저장보다 먼저이며, 정지 후 비트가 지워진 경로는 UnitY로 시작한다.

elapsed≥duration이면 반복 비트 1을 검사해 elapsed만 0으로 되돌리거나 **Stop `@0x71004e1184`**가 저장 위치를 복원하고 활성/축 비트를 지운다. 예전 §11의 `04e1184=갱신`은 정지 함수를 잘못 지목한 것이다. mg1801 참조는 없고, 실제 사용 게임·별도 `ComCameraShake`는 해당 미니게임 문서를 참조한다.

## 8. 다른 기능과의 상호작용

| 상대 | 관계 |
|---|---|
| 리듬 흐름(02) | 카메라 전환은 `TrigRmGameEndingSetting`(0,6)과 `TrigRmGameResultCaptureSetting`(2,2)에만 묶인다. 박자·채보와는 무관하다 [판독]. |
| 모션 슬롯(09) | 카메라도 `ComActorMotion` 슬롯이다. 결과값의 혼합은 없지만 대표 자식 선택은 §3.2를 따르며, 전이 시간·가중치·속도·프레임·Play 큐 순서는 [09 §6.5~6.6](09_character.md) 참조 |
| 난수(01) | 카메라 흔들림만 동기 난수를 쓴다. mg1801은 카메라로 난수를 소비하지 않는다 [판독] |
| 결과 UI | Rm 캡처는 §3.4; 일반 결과 무대의 카메라·키·배치는 [minigame_result §6.6~6.7](../shell/minigame_result.md) 참조 |
| 플레이어 엔딩 | (0,6)에서 결과 위치로 순간 이동 — 같은 프레임에 카메라도 바뀐다 |
| 입력 차단·일시정지 | 카메라 쪽에 별도 처리 없음 [판독: MapImpl] |

## 9. 현재 웹 구현과 원본의 차이

### 9.1 카메라·좌표계

| 현재 구현 | 확인 내용 | 원본과의 차이 |
|---|---|---|
| [mg1801/view/camera.ts](../../script/games/mg1801/view/camera.ts)·[stage.ts](../../script/games/mg1801/view/stage.ts) | loop/result/capture 정적 값, Aim lookAt, 상태별 전환 | mg1801 정적 데이터는 §7.1과 대응. 일반 FSNB 커브·대표 노드·흔들림 evaluator는 이 정적 경로에 없음 |
| [stage3d/types.ts](../../script/app/common/render3d/types.ts)의 `CameraDriver` | 외부 카메라 driver 주입 계약(`apply(camera,df)`) | 공용 `clip.ts`는 스켈레탈용이며 일반 CameraAnim evaluator가 아님. 광장 추종·기구 애니는 해당 문서/driver 범위 |
| WebGL PerspectiveCamera | 같은 full vertical fovy, +Y 위, 시선 −Z | 깊이는 원본 0..1, WebGL −1..1. 원본 P22/P23를 WebGL에 그대로 복사하면 안 됨 |

§6.2의 Aim·twist·Euler 및 §6.3의 `entity.world·inverse(animView)`를 재사용한다. 무대 transform을 CameraAnim position에 두 번 곱하지 않는다. 슬롯 재생 시간은 09, draw camera의 split 보정·레이어는 10, 결과 무대 키와 정지/시작 시점은 minigame_result가 근거다. 단순 `frame%=FrameCount`나 두 끝점 선형 보간을 일반 원본 구현으로 제시하지 않는다.

### 9.2 조명·IBL

현재 mg1801 `stage.ts`는 L=(−0.0958,0.8963,0.4330), **linear color=(0.8,0.8,0.8)**, intensity=π, 단일 shadow map 2048을 사용한다. 색을 hex `0xCCCCCC`의 sRGB 변환값으로 대체하면 linear 0.8과 다르다. π 배율은 [plaza_3d §6.13](../shell/plaza_3d.md)의 원본 `albedo·lightColor·NdotL`, `irr·albedo`와 Three Lambert의 1/π 상쇄 근거를 재사용한다; 임의 세기를 눈으로 맞춰 확정하지 않는다.

캐릭터/배경 IBL 분리·BC6H HDR 변환과 고유 BRDF는 03, 재질 그래프 소비는 광장 판독을 참조한다. 현재 단일 그림자맵은 원본 캐스케이드 4·정적 EVSM과 같지 않고, PMREM/Three BRDF·큐브 평균 안개도 근사다. 원본 shadow near/far=1/30은 시선 범위 설정이며 카메라의 near/far=0.1/10000을 바꾸는 값이 아니다.

### 9.3 포스트

[mg1801/view/post.ts](../../script/games/mg1801/view/post.ts)는 **Render→DOF→UnrealBloom→Output(NeutralToneMapping)→FXAA**를 사용한다. 현재 코드가 “원본 곡선·순서 미확정”이라고 적었어도 §7.5의 기존/신규 판독이 우선한다. 코드 수정은 이 문서 작업 범위 밖이다.

| 항목 | 원본 확정 | 현재 mg1801 웹 |
|---|---|---|
| 톤맵/노출 | 종류 1 유리식; `c·exposure+offset`, output_scale 곱 | Neutral(원본 종류 4 대응); exposure에 `2^offset·scale`를 곱함. 현재 1/0/1이라 노출 연산 차이는 가려짐 |
| FXAA | HDR 장면에 적용한 뒤 bloom 합성·톤맵 | 마지막 LDR 단계 |
| DOF | 중심±region/2; far 시작 29.5→36.5 / 35→50 | focalEnd=distance+region, **42→49 / 50→65**; 임의 6 px·32샘플 disc |
| bloom | smoothstep, spread⁵ 보정·다운/업 탭, RGB 길이 clip | UnrealBloom 5밉·strength/radius 대응·채널별 min(clip) |
| post utility0 | graph_last=0인 두 프리셋에서는 내장 패스 효과 없음 | 반영하지 않음(이 프리셋 범위에서 타당) |

공용 [stage3d/post.ts](../../script/app/common/render3d/post.ts)는 기존 SASS 톤맵 0~4·bloom 합성식을 사용하며 FXAA 마지막 배치는 근사다([plaza_3d §6.13](../shell/plaza_3d.md)).광장 LUT·색 보정 경로를 mg1801에 옮기지 않는다. 원본 DOF와 동등한 공용 구현 여부도 광장(원본 DOF off) 화면 검증만으로 결론내릴 수 없다.

### 9.4 기존 덤프·변환 산출물

`extracted/converted/camera/{mg1801_cameras,mg1801_env,fsnb_scan,sincos_table}.json`과 기존 `camera_probe`, `camera_verify.mjs` 결과는 §2·§10에서 재사용한다. 카메라 evaluator는 §6.4의 실제 원본식이 기준이다. 에셋 포맷·IBL 변환·manifest 계약은 03·[stage3d.md](../shell/stage3d.md)를 참조한다.

## 10. 검증 코드·실행 결과·기대값

| 검증 | 종류 | 결과 |
|---|---|---|
| `camera_probe scan` fsnb 899개 로드 | [실행: 덤프] | 실패 0, 카메라 899, 라이트 0, 포그 0 |
| `camera_probe cam` mg1801 4개 | [실행: 덤프] | §7.1 표 값 |
| `camera_probe env` mg1801 4개 | [실행: 덤프] | §7.3~7.5 값, dir_light 메시 꼭짓점 z = −1 |
| `node web/tools/analysis/camera_verify.mjs` — 원본 뷰 행렬식(§6.2, 정확한 삼각함수) vs three.js 동치식 | [재구현 계산] | mg1801 4개 + 무작위 Aim 200·Euler 200 = 404건, 축 최대 오차 8.9e-16, 이동 최대 2.8e-14, 종료 코드 0 |
| 같은 비교에 sdk 표 사인·코사인 사용 | [재구현 계산] | 축 최대 8.7e-5, 이동 최대 2.9e-3(위치 크기 30 기준) |
| mg1801 주요 점의 NDC(§7.1 표) | [재구현 계산] | 채소 등장 y 1.128(화면 밖 위), 판정 높이 −0.342, 플레이어 발 −0.674 |

- 기존 계산의 화면 좌표 기대값: `loop` 카메라에서 4개 레인의 채소가 화면 위 가장자리 바로 바깥에서 내려와 NDC y ≈ −0.34에서 판정되고, 플레이어 4명이 화면 아래쪽 1/6 부근(NDC y ≈ −0.67)에 x = ±0.38 안쪽으로 선다.
- 이번 정적 교차 검증: ARM64 함수·vtable·SDK 상수와 기존 SASS/UBO를 대조했다. [10_split_screen](10_split_screen.md)의 split 모드, [minigame_result](../shell/minigame_result.md)의 키 수치·투영, [plaza_3d](../shell/plaza_3d.md)의 포스트/조명 판독은 재실행·중복 분석하지 않았다.
- DOF 경계 검산: post의 D=29.5/33/36.5에서 CoCfar=0/0.5/1, result의 D=35/42.5/50에서도 0/0.5/1. Repeat/Mirror 경계는 §6.4 표, light 방향은 §6.6 식과 기존 값이 일치한다 [재구현 계산].

## 11. 최신 항목 coverage와 남은 근거

수정 전 §11은 **11행**이었다. 묶인 post/env utility를 분리하고 본문의 기본 Camera 값·g3d 평가식 미판독을 더해 **14개**로 관리한다(요청의 19개를 임의로 맞추지 않음). 기존 참조 해소 3, 신규 판독 10, 자료 부족 1이다.

| 실제 항목 | 구분 | 해소 근거 / 남은 범위 |
|---|---|---|
| container 재질→컴포넌트 필드 | 기존 참조 | §3.3, plazaA reader/setter·plaza_post 필드 표 |
| light overwrite 단위·순서·진행축 | 신규 판독 | §6.6, main `0760d4→0751cc`, 조건부 layer yaw까지 포함한 +Z UBO 전달·기존 셰이더 부호 |
| tonemap1·pass 순서·bloom spread/clip | 기존 참조 | §7.5, plaza_3d §6.13·plaza_post SASS; 표본 필터 정체는 원 자료의 미확정 유지 |
| DOF region·transition·Camera focus 연동 | 신규 판독 | §6.3·§7.5, ComPost UBO와 dof2 SASS; **내장 dof2 범위**에서 2F8 대신 post 거리 사용 |
| post utility0 (0.4→1) | 기존 참조 | §7.5, SASS reader 없음 + 두 자산 graph_last=0 |
| env utility0 (5,2,25,0.35) | 신규 판독 | §7.4, `00905a0→0090790→0074714→0073e8c`; mg1801 pack Layer 바인딩·고유 110 VS/FS의 reader 부재(이 pack 범위) |
| 단독 모드 capture 기본값 | 신규 판독 | §3.4, `RmGameWork+8` helper의 +0x6B8 4 B zero |
| 전이 대표 자식(vt+0x40) | 신규 판독 | §3.2, 종류2 최대 weight·동률 앞쪽 / 3 첫 자식 / 4~6 단일 자식; 가중치 진행은 09 범위 |
| DefaultGlobalLighting와 container 우선순위 | 자료 부족 | §7.4; msgpack 수치·boot/정적 이미지 확인, nbgllt 로더→같은 layer/UBO 선택 근거 없음 |
| 보드 CameraAnim userData 소비 | 신규 판독 | §7.2, bd01 `041158→042310→042460`; 슬롯 현재 Camera 노드, 타입별 이름·shadow/DOF setter·파일순서 덮어쓰기 |
| curve pre/post wrap | 신규 판독 | §6.4, `0772764` Clamp/Repeat/Mirror/RelativeRepeat·inclusive end |
| ComponentCameraShaking 갱신 | 신규 판독 | §7.6, `04e124c→04e12d0`; `04e1184`는 Stop |
| 기본 fovy·LookAt .bss 초기값 | 신규 판독 | §4.4, `.bss` initializer `0848e30`·SDK 상수 |
| g3d float 커브·키 형식·FMA·baked | 신규 판독 | §6.4, `07753d0→0774350/43e0→0772764`, 원본 dispatch·탐색 함수 |

남은 1개는 §7.4의 기본 전역 조명 우선순위다. **nbgllt 런타임 로더→같은 GraphicsLayer→render UBO 선택/덮어쓰기**를 연결하는 근거가 필요하다. 파일에 수치가 있다는 사실이나 ComGlobal이라는 이름으로 container보다 먼저/나중에 적용된다고 확정하지 않는다.
