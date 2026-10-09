# 공통(엔진) 작업 현황과 남은 순서

기준: 2026-10-09. 근거는 [공용 시스템 감사](common_system_audit.md)(원본 공용 기능 ↔ 웹 실제 사용)와 그 뒤 끝난 작업이다. 게임 하나에 묶이지 않고 여러 미니게임·셸이 같이 쓰는 것만 다룬다. 게임별 포팅 상태는 [../minigame/README.md](../minigame/README.md).

## 1. 끝난 공통 작업

| 영역 | 웹 위치 | 문서 |
|---|---|---|
| 에셋 압축·해시 이름·Service Worker·brotli·코드 분할 | `tools/build_assets.ts`, `assets-dist/`, `script/cache/` | [assets_pipeline.md](assets_pipeline.md) |
| 로더 관리자(P0~P3·중복 받기 제거·프레임 예산·GPU 미리 준비)·화면 흐름 미리 받기 | `lib/assetcore`, `lib/assetcore-three`, `view/appAssets.ts`·`appFlow.ts`·`flowCatalog.ts` | [loader_manager.md](loader_manager.md) |
| 공용 에셋 폴더(캐릭터·NPC·모션, 글꼴, 시스템 효과음, `sys_` UI 그림) | `assets/{chara,font,common}` | [chara_assets.md](chara_assets.md), [font_assets.md](font_assets.md), [common_assets.md](common_assets.md) |
| 공용 에셋 변환기 + 미니게임 장면 로더 | `tools/analysis/asset_convert.py`·`mg_assets.py`, `app/scene/minigame/mgstage` | [13_asset_converter.md](13_asset_converter.md) |
| BGM 스트리밍·화면 BGM | `lib/bgmstream`, `view/bgm.ts`·`screenBgm.ts` | [04_sound.md](04_sound.md) §12 |
| 화면 전환(Black 부팅·White 퇴장) | `lib/transition`, `lib/transition-dom` | [15_transition.md](15_transition.md) |
| 분할 화면 | `lib/splitscreen`, `-three`, `-dom` | [10_split_screen.md](10_split_screen.md) |
| 미니게임 한 판 틀(0~18단계·텔롭·타이머·상태 UI·FrameGate 자리)·3D 결과 무대 | `app/scene/minigame/mgscene`, `app/scene/minigame/mgresult` | [../shell/minigame_scene.md](../shell/minigame_scene.md), [../shell/minigame_result.md](../shell/minigame_result.md) |
| 리듬 공용 틀(mg1801에서 분리, 결과 불변) | `games/rhythm` | [02_rhythm.md](02_rhythm.md) §14 |
| 캐릭터 런타임(모션·전이·시선·눈·FTRG, 원본 규칙 기본) | `lib/character`, `lib/character-three`, `view/character.ts` | [09_character.md](09_character.md) §14 |
| 온라인 방(socket.io)·광장 원격 보간 | `server/`, `online/socketio.ts`, `app/scene/world/plaza/follow.ts` | [../shell/online.md](../shell/online.md), [12_online_sync.md](12_online_sync.md) |
| PhysX 4.1 공개 소스 기준(충돌 런타임 분석) | 미구현 | [11_moving_collision.md](11_moving_collision.md) §8 |
| mg1801 → 공용 틀 `mgscene` 연결(A1)·결정성 규칙 게임 계약 | `script/mgrun.ts`, `games/rhythm/mgGame.ts`, `tools/mg_determinism.ts` | [../shell/minigame_scene.md](../shell/minigame_scene.md) §12.12 |
| 이펙트 공용 런타임(B1, 원본 규칙 기본) | `lib/effect`, `lib/effect-three`, `view/effect.ts` | [08_effects.md](08_effects.md) §14 |

진행 중: 셰이더 그래프 남은 36재질([14_shader_graphs.md](14_shader_graphs.md)). B6 사운드 ①② + 게임 경로는 2026-10-09 완료(셸 화면 이전·캐릭터 소리 변환은 나중).

## 2. 남은 공통 작업

크기: 소 = 1일 이내, 중 = 1~2일, 대 = 2일 넘음(에이전트 작업 실측 기준, 여유 배수 없음).

### 2.1 게임 포팅을 막는 것

| # | 작업 | 필요한 게임 | 상태 | 크기 | 선행 |
|---|---|---|---|---|---|
| A1 | mg1801을 `mgscene`에 올리기 + 결과 byte·실패 결과·설정 전달 정리 | 모든 게임(등록 방식 기준) | **완료 2026-10-09** | 중 | — |
| A2 | 체감 입력: 가속도·자이로·흔들기 감지(WaveDetector)·Value/Sum emitter, 웹 대체(DeviceMotion·터치·키) | 리듬 9종 대부분, mg0118·mg0906 | 미구현(지금은 가속도 값을 버림) | 소~중 | — |
| A3 | actor 계층: 이동(ComActor)·점프 계산기·actor 입력(스틱 회전·문턱 0.1·마스크·override)·CPU 입력 덮기 | 이동형 게임 전부 | 광장 이동만 일부 | 중 | 접지는 A4 |
| A4 | 충돌 런타임: P0 씬 질의(raycast·sweep·overlap·MTD, BVH33 RTree), P1 캐릭터 컨트롤러, P2 강체 | mg0101·0107·0118·0122·0906·0912 등, P2는 mg0911·mg1002 | 분석 끝, 사용자 지시로 보류 | 대 | — |

### 2.2 게임마다 중복되고 있는 것

| # | 작업 | 지금 상태 | 크기 |
|---|---|---|---|
| B1 | 이펙트 공용 런타임(registry·수명·입자 운동·모션 FTRG fx 연결) | **완료 2026-10-09**(캐릭터 fx eset 자료 변환·다른 게임 `_Vfx` 변환은 남음) | 중 |
| B2 | 후처리 공용화(톤맵 원본 식·bloom·FXAA 순서·DOF) | 공용 `stage3d/post.ts`와 mg1801 `view/post.ts` 두 벌, 톤맵 식이 원본과 다름 | 소~중 |
| B3 | 카메라 공용 계약(애니 카메라 evaluator·흔들림·직교·FSNB) | 광장·`mgstage`·mg1801 각자 구현 | 소~중 |
| B4 | 게임 에셋을 로더 관리자로 받기(게임 `Assets` 자체 캐시 → broker·ScenePreparer) | mg1801이 공용 캐시·GPU 준비를 안 씀 | 소~중 |
| B5 | 레이아웃 재생기 하나로(셸 `render2d` vs 게임 HUD `view/lyt`) | 두 벌, 글꼴 시트만 공유 | 중 |
| B6 | 소리 공용 계약(3D 음원·SoundHandle 수명·그룹) + 캐릭터 효과음·보이스 변환 | **①② + 게임 경로 완료 2026-10-09**([04_sound.md](04_sound.md) §13, 원본 규칙 기본). 남음: 셸 화면 이전, 캐릭터 효과음·보이스·발소리 파일 변환, 리전 점프, 메시지 덕킹 연결 | 중 |
| B7 | 재질·물·기본 셰이더 경로 하나로(`stage3d/material.ts` vs mg1801 `view/material.ts`·`water.ts`) | 두 벌 | 중 |
| B8 | 렌더 레이어·패스·캡처 계약 | 단일 scene/camera, 캡처는 게임별 | 중 |

### 2.3 나중에 해도 되는 것

| # | 작업 | 상태 |
|---|---|---|
| C1 | 보조 물리(흔들림 본, 11명·44 조인트) | 슬롯 자리 있음, 수치 분석 끝. A4의 D6 조인트 이식과 같이 |
| C2 | 표정 face_param | 슬롯 자리 있음, 원본 소비 경로 미판독 |
| C3 | 온라인 미니게임 동기화 구현(프레임 입력 버퍼·seed 합의·시작 barrier·결과 합의) | FrameGate 자리만. 단 §3 결정성 규칙은 지금부터 지킨다 |
| C4 | 일반 시간 모델·스케줄러(가변 60·.05 clamp·파이버 우선순위·pause) | 리듬은 고정 60이라 불필요, 일반 게임 포팅 때 |
| C5 | LOD·임포스터·애니 평가 예산(FSO) | 성능 단계 |
| C6 | 셸 서비스: Save 수명·보상·업적·플레이 보고·언어 선택·영상 | 미니게임 NRO 112개의 직접 참조 0(셸·모드 책임) |

## 3. 지금 안 하면 나중에 비용이 커지는 것

판단 기준: 게임을 하나 포팅할 때마다 그 기능을 게임 안에 새로 만들게 되면, 나중에 공용으로 바꿀 때 **포팅한 게임 수만큼 옮기기 + 골든 재확인**이 붙는다. 반대로 게임이 직접 닿지 않는 기능(셸 서비스·렌더러 내부)은 미뤄도 비용이 거의 같다.

| 순위 | 작업 | 미루면 생기는 비용 | 지금 할 최소 범위 |
|---|---|---|---|
| 1 | A1 게임 호스트(`mgscene`) | 예전 GameDef 경로로 만든 게임마다 흐름·결과·설정 연결을 다시 해야 함 | 진행 중 |
| 2 | 결정성 규칙(온라인 대비) | 게임 로직이 `Math.random`·벽시계 dt·DOM 입력·f64 누적을 쓰면, 온라인을 붙일 때 게임마다 로직을 뜯어야 함. 원본은 입력만 동기화하고 각 기기가 같은 계산을 하므로([12_online_sync.md](12_online_sync.md)) 결정성이 깨지면 온라인 자체가 안 됨 | 규칙만 지금 고정: 로직은 고정 스텝·`BexRandModule`(sync/async 구분)·`FrameGate` 경유 입력·f32(`Math.fround`)만 쓴다. 구현(C3)은 나중 |
| 3 | B1 이펙트 런타임 | 거의 모든 게임에 이펙트가 있어 게임마다 `effects.ts` 복사본이 생김 | 공용 런타임(registry·입자·FTRG fx 연결) |
| 4 | A3 actor 입력·이동 계층 | 이동형 게임마다 이동·점프·입력 처리를 따로 만들면, 나중에 공용으로 바꿀 때 조작감이 게임마다 달라지고 골든을 전부 다시 만들어야 함 | actor 입력·이동 계층(접지는 A4 연결 자리만) |
| 5 | A4 충돌 API(백엔드는 나중이어도) | 게임마다 임시 충돌(광장식 순차 push·구-메시 직접 구현)로 만들면, PhysX 이식 뒤 결과가 바뀌어 게임마다 다시 맞춰야 함 | §6 질의 API·수명 규칙을 먼저 고정하고 게임은 그 API만 부른다. 백엔드(P0)는 그 뒤 교체 |
| 6 | B4 게임 에셋 broker | 게임마다 자체 캐시를 쓰면 같은 파일을 두 번 받고 GPU 준비가 안 됨. 나중에 게임마다 로딩 코드 수정 | 게임 에셋 로딩을 broker 경유로 |
| 7 | B2·B3·B7 후처리·카메라·재질 | 게임마다 복사본이 늘수록 원본 식 수정(톤맵 등)을 N곳에 해야 함 | 공용판 하나로 합치고 게임은 파라미터만 |
| 8 | B5 레이아웃 재생기 | 게임 HUD가 늘수록 두 재생기 차이 맞추기 비용 증가 | 하나로 합치기 |

미뤄도 비용이 거의 같은 것: C1 보조 물리·C2 표정(슬롯 자리가 이미 있어 꽂기만 함), C5 LOD 등(렌더러 내부), C6 셸 서비스(미니게임이 직접 닿지 않음), 셰이더 그래프 남은 재질(변환 데이터만 다시 생성), B6 소리 파일 변환(데이터 추가).

## 4. 권장 순서

1. A1 `mgscene` 연결(진행 중) + §3 2번 결정성 규칙을 [../shell/minigame_scene.md](../shell/minigame_scene.md) 게임 계약에 명시(2026-10-09 사용자 결정, A1과 함께 진행 중).
2. A2 체감 입력 → 리듬 9종 포팅 가능. A1과 병렬 가능.
3. B1 이펙트 런타임 — 두 번째 게임 전에.
4. A3 actor 계층 + A4 충돌 API(백엔드 P0 이어서) → 이동형 대표작 포팅 가능.
5. B4·B2·B3·B7·B5 — 일반 게임 두세 개를 포팅하기 전에.
6. 나머지(C)는 필요해질 때.

## 5. 사용자 확인 필요

- (해소) 2026-10-09 사용자 결정: §3 결정성 규칙을 게임 계약으로 고정한다. 규칙 본문·결정성 시험은 [../shell/minigame_scene.md](../shell/minigame_scene.md) 게임 계약(A1 작업에서 함께 작성). 이후 모든 미니게임 포팅에 적용한다.
- A4 충돌 런타임 보류 중 A3 actor 계층만 먼저 할지, A4 API까지 같이 고정할지.
