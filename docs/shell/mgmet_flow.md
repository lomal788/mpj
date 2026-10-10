# mgmet — 오프라인 프리 플레이 허브 흐름

## 1. 기능 개요와 보이는 동작

[판독] 대상은 Super Mario Party Jamboree US v0의 `mgmet::Scene`이다. 항구 진입 → 액티비티 제목/안내 → 프리 플레이 첫 설명 → 규칙 → `mgm01` 호출 → 항구 복귀까지 기록한다. 다른 액티비티는 선택 목록과 분기 목적지만 표시하며 내부 흐름, 온라인, 3D 연출 구현은 제외한다.

[판독] 실제 프리 플레이 호출 사슬에는 인원 선택과 `ConfirmMgExperienceFlow`가 없다. 이미 구성된 플레이어 목록을 사용하고, CPU 존재 여부로 규칙 열을 바꾼다. `ChoicePlayerNumSettingFlow`는 사람 수 선택기가 아니라 서바이벌 진입의 인원 변경 확인이며, 이 함수 자체에는 CPU 추가/삭제가 없다(§6.4).

[판독] 첫 설명은 세 페이지이며 A로 진행한다. 첫 방문에서는 B를 무시한다. 규칙의 첫 열에서 B로 취소하면 항구로 돌아가지만 CPU 난이도와 미니게임 설명 설정은 적용/기억된다. 규칙 전체는 [mgmet_ruleconfig.md](mgmet_ruleconfig.md) 참조.

[판독] 이 문서의 상태는 원본 `+0x330` 값이다. 파이버 내부 `Wait()`는 해당 호출의 실행 위치를 보존한다. 상태 함수 전체를 매 프레임 처음부터 다시 실행하는 모델로 옮기면 메시지와 애니가 반복 시작된다.

## 2. 분석 대상·자료 위치

[데이터] 분석일 2026-10-07. 원본 자료와 기존 분석은 읽기만 했으며 원본 실행/영상 대조는 없다. 키 값은 기록하지 않았다.

| 자료 | 위치·사용 |
|---|---|
| 모듈/심볼 [데이터] | `C:/dev/mpj/extracted/romfs/nro/NX_Release/mgmet.nro`, `analysis/functions/mgmet.nro.tsv`; 소비자 `mgm01.nro`, `main.nso.tsv` |
| 재사용 C [판독] | `analysis/decomp/mgmcommon_mgmet1.c`, `mgmcommon_mgmet2.c`, `mgmcommon_mgmet_callers.c`; `rhythm_mgm1.c`, `logic1801_mgm*.c` |
| 신규 C [판독] | `mgmet_stage2.c`, `mgmet_stage2_more.c`, `mgmet_stage2_hooks.c`, `mgmet_stage2_counts.c`, `mgmet_stage2_destructors.c`, `mgmet_stage2_cleanup.c`, `mgmet_main_work.c`, `mgmet_main_more.c`, `mgmet_main_alignment.c`, `mgmet_mgm01_consume.c`(전체 집계 §10) |
| 예외 어셈블리 [판독: 어셈블리] | `analysis/decomp/mgmet_stage2_dis1.c`, `mgmet_stage2_dis2.c`, `mgmet_main_dis3.c`, `mgmet_main_dis4.c`; 이유/지점 §10 |
| 메시지 [데이터] | `extracted/message/koKR/{mgmet,mgm01,im_common,system,menu01_mode,qtbd00}.json` |
| 레이아웃 [데이터] | `extracted/bea/mgm~mgmet.nx.bea/mgm/mgmet/layout.lyt`, 공용 `mgm~mgm00.nx.bea/mgm/mgm00/layout.lyt` |
| 변환 결과 [실행: 변환] | `analysis/mgmet_layout/`, `mgmet_panes.txt`, `mgmet_anims.json`, `mgmet_data.txt`, `mgmet_evidence.txt`, `mgmet_main_scene_data.txt` |
| 조사 도구 [실행: 변환] | `web/tools/analysis/mgmet_research.py`, `mgmet_disasm.py`, `ghidra_scripts/mgmet_DecompileMissing.java`; Ghidra 사본 `ghidra_work/mgmcommon/g3`를 `-noanalysis -readOnly`로 사용 |

[판독] 주소의 모듈 접두어는 필수다. 아래의 `mgmet @…`, `mgm01 @…`, `main @…`은 서로 다른 주소 공간이다. 필드의 이름이 없으면 의미를 설명한 이름이며, 웹 제안 이름은 `[웹 이름]`으로 구별한다. 타입은 C의 접근 폭/연산에서 판독한 타입이다.

## 3. 진입점과 호출 흐름

| 단계 | 호출·주소 | 결과 |
|---|---|---|
| 진입 전 구성 [판독] | `mgmet::Scene::Scene` — mgmet @0x7100049640 | `SetupMinigameModeSyncBefore` → `MinigameModeWork::EntranceInit`, 규칙 캐시 초기화; 상태 -1 |
| 엔진 준비 [판독] | `mgmet::Scene::SetupGame` — mgmet @0x7100049dac | 파라미터·컨트롤러 지원 준비; 여기서 상태 0으로 바꾸지는 않음 |
| 동기화 후 [판독] | `mgmet::Scene::SyncedSetupGame` — mgmet @0x7100049df8 | `SetupMinigameModeSyncAfter`, 상태 0 |
| 메인 파이버 [판독] | `mgmet::Scene::MinigameModeFlow` — mgmet @0x7100049ed0 | `SeqUpdate` → 다음 모드/종료 판정 → `Wait` 반복 |
| 초기화 [판독] | `mgmet::Scene::InitializeFlow` — mgmet @0x710004c330 → `Initialize` — mgmet @0x710004a164 | 매니저/UI 생성; 시작 지점 분기 |
| 시작 지점 소비 [판독] | `mgmet::Scene::GetAndResetStartMode` — mgmet @0x710004a294 | 시작 지점 조회·보정 후 0으로 리셋 |
| 일반 진입 [판독] | `InitOp` — mgmet @0x710004c154 → `EnterEventFlow` — mgmet @0x710004c630 → `StartEventFlow` — mgmet @0x710004cd60 | 첫/재방문 인사 후 선택 ID 2, 상태 5 |
| 직접 선택 [판독] | `mgmet::Scene::InitSelectMode` — mgmet @0x710004a328 | 시작 지점 1~6을 ID로 변환, 상태 5 |
| mgm01 복귀 [판독] | `mgmet::Scene::InitFromMgm01` — mgmet @0x710004a648 | ID 2 위치/카메라 준비, 상태 10 |
| 선택 [판독] | `ModeSelectStart` — mgmet @0x710004d270 → `ModeSelectCameraMove` — mgmet @0x710004d640 → `ModeSelectCameraIdle` — mgmet @0x710004d6d0 | 상태 5 → 6 → 7; 실제 `SeqUpdate`의 6에는 대기가 인라인되어 있음 |
| 결정 [판독] | `mgmet::Scene::ModeStartFlow` — mgmet @0x710004dfd8 | 카메라 `ModeZoom`; ID 2가 `FreeplayMainFlow`로 진입 |
| 프리 플레이 [판독] | `FreeplayMainFlow` — mgmet @0x710005ddd0 | 카메라 대기 → `ActivityTitle::ActIn` → `FirstHowToPlayFlow(1,…)` → 정보/안내 In → `Mgm01SetRuleFlow` → 정보/안내 Out → `FreeplayAfterFlow` |
| 규칙 [판독] | `mgmet::Scene::Mgm01SetRuleFlow` — mgmet @0x710005e090 | 규칙 Update 1=시작, 3=취소; 2=설명 표시 후 규칙으로 복귀 |
| 시작 후 [판독] | `mgmet::Scene::FreeplayAfterFlow` — mgmet @0x710005df20 | 시작 결과 1이면 출발 대기/저장 요청 → `SetNextMGMode`; 그 외 항구 상태 5 |
| 장면 요청 [판독: 어셈블리][데이터] | mgmet @0x7100049f14 → `bq::MinigameModeScene::CallMinigameModeScene` — main @0x710036027c | C에서 빠진 인자는 `Scene+0x328`=1; main 이름 표의 1은 `mgm01`, `SceneBase::RequestCallScene("mgm01")` |
| 복귀 요청 [판독] | `mgm01::Scene::ExitFlow` — mgm01 @0x710000e2c0 | 시작 지점 7 저장 → `ReturnScene` → 파이버 `Sleep(-1)` |
| 항구 복귀 [판독] | `mgmet::Scene::FreeplayReturnFlow` — mgmet @0x710005e250 | 화면/NPC 요청·0.3초·플레이어/NPC 준비 대기 → 상태 5 → 6 → 7 |

[판독] `FreeplayBeforeFlow` — mgmet @0x710005dd80는 카메라 완료 대기와 `ActivityTitle::ActIn`만 한다. 주 사슬의 `FreeplayMainFlow`에 같은 동작이 들어 있으며, `ModeStartFlow`에서 Before를 별도 호출하는 사슬은 관측되지 않는다. `Mgm01SettingUiFlow` — mgmet @0x710005de94는 설명·규칙 UI 부분의 별도 헬퍼이며 주 사슬의 출발/복귀를 수행하지 않는다.

## 4. 구조체·필드·상수 표

### 4.1 mgmet::Scene

| 오프셋 | 접근형·초기값 | 쓰는 함수 → 읽는 함수/뜻 |
|---|---|---|
| +0x300 [판독] | `UiManager*`, 생성자 null | `InitializeFlow` → 제목/설명/규칙/안내 접근 |
| +0x308 [판독] | `SoundManager*`, 생성자 null | 생성자 구성 → 허브 사운드 관리 |
| +0x328 [판독] | s32, -1 | `SetNextMGMode` → `MinigameModeFlow`, `GetNextMinigameModeScene`(mgmet @0x710004a15c) |
| +0x32c [판독] | u8, 0 | `ModeSelectCameraIdle`의 나가기 확정 → `MinigameModeFlow`의 `ReturnScene` |
| +0x330 [판독] | s32, -1 | `SyncedSetupGame`/각 흐름 → `SeqUpdate`; 상태 표 §5 |
| +0x334 [판독] | u8, 0 | `FreeplayAfterFlow` 취소 시 1 → `ModeSelectStart`가 위치 복원 후 0 |
| +0x335 [판독] | u8, 0 | `EnterEventFlow`가 sync opSkip 읽음 → 스킵 허용/인사 종류 |
| +0x336 [판독] | u8, 0 | `EnterEventSkipFlow`가 1 → `StartEventFlow`의 스킵 이후 복원 |
| +0x338 [판독] | s32, -1; `Initialize`는 2 | 초기화/좌우 선택 → 제목·분기·다음 모드 |
| +0x33c [판독] | u8, 0 | 선택 준비·나가기 거절 시 1 → NPC 준비 때 안내 표시 후 0 |
| +0x340 [판독] | s32, -1 | ID 증가 시 0/감소 시 1 → 제목 In 방향; -1은 일반 In |
| +0x344 [판독][데이터] | s32[6], `[4,3,1,5,2,6]` | 생성자 → 위치 복원에 사용하는 모드 번호 |
| +0x3b0 [판독] | u8, 0 | `ModeSelectStart`에서 0; 프리 플레이의 설명 업데이트 인자에 사용 |
| +0x3b1 [판독] | u8, 0 → sync 보스 개방 | `SetupMinigameModeSyncAfter` → ID 4→5 이동 허용, 시작 6/12 보정 |
| +0x3b2 [판독] | u8, 0 → sync 보스 해제 안내 | 동기화 후 → 상태 3/4 분기(보스 안내 내부는 제외) |
| +0x498 [판독] | f32, 0 | 선택 준비 때 0; 온라인 전용 안내 쿨다운은 이번 범위 밖 |

### 4.2 모드 번호는 표별로 구분

[판독][데이터] `SetNextMGMode`의 s32 표는 mgmet @0x71000e3658. `GetModeNumberFromID`(mgmet @0x7100050248)의 표는 mgmet @0x71000e3670. 둘 다 유효 ID 0~5에 대해 같은 값을 준다. `GetModeIDFromNumber`(mgmet @0x7100050258)의 다른 표는 mgmet @0x71000e368c이며 입력 0~5에 `[2,4,1,0,3,5]`을 준다. 같은 수를 넣는 역함수라고 가정하면 안 된다. 데이터상 `IDFromNumber(NumberFromID(id)-1)==id`가 성립한다.

| 선택 ID | 제목 키·koKR [데이터] | 다음 `MinigameModeID` [데이터] | `GetModeIDFromNumber` 입력 [데이터] | 직접 진입 시작 지점 [판독][데이터] |
|---|---|---|---|---|
| 0 | `im_mode13_name` 태그 매치 | 4 | 3 | 4 |
| 1 | `im_mode12_name` 데일리 트라이얼 | 3 | 2 | 3 |
| 2 | `im_mode10_name` 프리 플레이 | 1 | 0 | 1 |
| 3 | `im_mode14_name` 서바이벌 | 5 | 4 | 5 |
| 4 | `im_mode11_name` 챌린지 미니게임 배틀 | 2 | 1 | 2 |
| 5 | `im_mode09_name` 보스 러시 | 6 | 5 | 6 |

[판독][데이터] `GetModeIDFromMGMWorkStartPoint` — mgmet @0x710004c30c: 2~6을 `[4,1,0,3,5]`로 변환(표 mgmet @0x71000e36a4); 그 외는 2. `Initialize`는 시작 7을 mgm01 복귀, 8~12를 다른 모드 복귀로 구분한다. 시작 0/기타는 오프닝이다. `GetAndResetStartMode`는 flag 0x3d가 있으면 7~11에서 6을 빼고 12를 6으로 변환한 뒤 flag를 끈다. 보스 미개방이면 시작 6/12를 1로 바꾼다.

[데이터] mgm02~06의 진행·결과·사용 범위 정리본은 [mgm_modes.md §1·3](mgm_modes.md#1-기능-개요)을 참조한다.
### 4.3 ActivityTitle·HowtoPlay

| 소유체/오프셋 | 접근형·초기값 | 쓰는/읽는 함수 |
|---|---|---|
| `ActivityTitle+0` [판독] | `Impl*` | 생성자 mgmet @0x7100065658 → 모든 래퍼; 소멸자 mgmet @0x71000658c0 |
| `ActivityTitle::Impl+0..0x17` [판독] | 엔티티 핸들, 초기 null/0 | `Impl::Impl` mgmet @0x71000656b4가 `UI_ActivitiTitle` 생성(철자 그대로) |
| `ActivityTitle::Impl+0x18..0x2f` [판독] | 공용 창 핸들, 초기 null/0 | 같은 생성자 → `mgmet_act_title_00.bflyt`, 모든 재생/텍스트 함수 |
| `HowtoPlay+0` [판독] | `Impl*` | 생성자 mgmet @0x7100071960; Impl은 Fiber 기반 |
| `HowtoPlay::Impl+0x10..0x27` [판독] | 엔티티 핸들, 초기 null/0 | `Impl::Setup` mgmet @0x71000719f8 → `UI_HowToPlay`; `Destroy` mgmet @0x7100071b90 해제 |
| `HowtoPlay::Impl+0x28..0x3f` [판독] | 창 핸들, 초기 null/0 | `Setup` → Update/애니 조작 |
| `HowtoPlay::Impl+0x40..0x57` [판독] | 페이지 그림 핸들, 초기 null/0 | `UpdateManual`가 페이지마다 교체; `Destroy` 해제 |
| `HowtoPlay::Impl+0x58` [판독] | s32, Setup 인자; 프리 플레이 1 | `Setup` → `UpdateManual` 페이지 종류 |
| `HowtoPlay::Impl+0x5c` [판독] | u8, Setup 인자; 첫 설명 1/다시 보기 0 | `Setup` → B 허용 여부 |

[판독] 페이지 번호(u32, 0부터), 페이지 수(프리 플레이 3), 마지막 넘김 방향에 따른 반환값은 `Impl::UpdateManual`의 지역 변수다. 객체 필드라고 옮기지 않는다.

[판독] `ActivityTitle::~ActivityTitle` — mgmet @0x71000658c0는 wrapper의 Impl 포인터를0으로 만든 뒤 메모리를 해제한다. `HowtoPlay::~HowtoPlay` — mgmet @0x71000719d0는 포인터0 후 Impl 가상 소멸, `HowtoPlay::Impl::~Impl` — mgmet @0x7100072818은 Fiber 소멸과 메모리 해제다. 설명의 엔티티/그림 핸들 정리는 별도 `HowtoPlay::Destroy`에서 수행한다. 래퍼 소멸에 Out 애니 완료 대기는 없다.

## 5. 상태 전이와 수명

### 5.1 원본 상태기계

| 상태 [판독] | 진입 조건 | 대기 중/매 프레임 동작 | 전이 조건 | 다음 상태 |
|---|---|---|---|---|
| -1 | 생성 직후, 출발/종료 결정 | `SeqUpdate` 기본 분기 no-op | 엔진 준비 / 다음 모드·종료 검사 | 0 / 장면 호출·반환 |
| 0 | `SyncedSetupGame` | `InitializeFlow`, 시작 지점 소비 | 0/기타 / 1~6 / 7 | 1 / 5 / 10 |
| 1 | `InitOp` | 오프닝 frame·fade·카메라/사람 대기; 허용 시 스킵 입력 | 자연 완료 / 스킵 | 4(또는 3) / 2 또는 직접 SkipFlow |
| 2 | 후반 오프닝 스킵 | `EnterEventSkipFlow`, fade out 완료 대기 | 복원 완료 | 4(또는 3) |
| 3 | 보스 해제 안내 있음 | `StartEventFlow` 내 보스 안내 분기, 내부 제외 | 해당 함수 복귀 | 5 |
| 4 | 일반 인사 | 메시지 완료 대기 → 카메라 줌 대기 | 카메라 완료; ID=2 | 5 |
| 5 | 직접 진입/선택 복귀 | Work 초기화, 카메라 선택 요청, 필요 시 위치 복원 | 요청 완료; 복원 분기는 맵 조건 대기 | 6 |
| 6 | 카메라 전환 | `ComMgmetCamera::IsIdle`까지 Wait | idle=true | 7 |
| 7 | 카메라 안정 | 제목·화살표·안내 준비; 입력 루프 | 좌우 이동 / A / B→나가기 예 | 6 / 8 / -1+종료 |
| 8 | 액티비티 결정 | `ModeStartFlow`; 프리 플레이 설명/규칙/출발 대기 | 규칙 시작 / 취소 | -1+nextMode=1 / 5 |
| 9 | case 없음 | 기본 분기 no-op | 여기로 쓰는 경로 이번 범위에서 없음 | 유지 |
| 10 | 시작 지점 7 | `FreeplayReturnFlow` | 사람 모두 idle AND 안내 NPC 상태 1 | 5 |
| 11~15 | 시작 8~12 | 다른 모드 ReturnFlow 호출, 내부 제외 | 해당 함수에 위임 | 범위 밖 |

[판독] `ModeSelectCameraIdle`의 B 확인에서 “아니요”면 `+0x33c=1`을 쓰고 함수가 반환한다. 상태 7이어서 다음 호출 때 제목/화살표/Back 준비부터 다시 시작한다. `MinigameModeFlow`는 nextMode 검사를 종료 flag보다 먼저 한다.

### 5.2 3D 대기 지점 표

[판독] 아래는 범위 안 호출 사슬의 모든 명시적인 3D 완료 대기다. fade와 고정 시간도 흐름을 재현하는 데 필요하여 함께 구별했다. 엔진/메시지 대기는 3D 대기로 바꾸지 않는다.

| 함수 @주소 [판독] | 기다리는 대상·조건 | 3D 없이 필요한 값/신호 |
|---|---|---|
| `EnterEventFlow` — mgmet @0x710004c630 | `actor::ComActorMotion::GetFrame() > 390.0` | actor frame 신호. [미확정] 클립·시작 frame·속도 없으므로 391 UI프레임이라고 단정 불가 |
| 같은 함수 | `FadeOut(1.0)` → `IsFinishedFadeOut` → 추가 dt 누적 ≥1.0초 | fade 완료와 1.0초 타이머는 별개 [판독] |
| 같은 함수 후반 | `Camera::IsFinished && PlayerManager::IsAllPlayerIdle` | cameraDone, allPlayersIdle 둘 다 필요; 실제 소요 프레임 [미확정] |
| `EnterEventSkipFlow` — mgmet @0x710004cc40 | 1.0초 fade out 완료 | fadeDone [판독] |
| `StartEventFlow` — mgmet @0x710004cd60 | 메시지 후 `Camera::StartOpZoom` → `IsFinished` | zoomDone; 줌 길이 [미확정] |
| `ModeSelectStart` — mgmet @0x710004d270 | `+0x334` 복원일 때 `MapManager::IsFinishedCoinBattleEvent` | coinBattleEventDone. 이름과 무관하게 프리 플레이 취소에도 이 조건을 호출 [판독] |
| `ModeSelectCameraMove` — mgmet @0x710004d640; `SeqUpdate` 상태 6 | `ComMgmetCamera::IsIdle` | selectionCameraIdle; 플레이어 idle을 추가로 기다리지 않음 [판독] |
| `ModeSelectCameraIdle` — mgmet @0x710004d6d0 | 안내 NPC `ComNpc+0x58==1` AND pendingGuide | npcReady이면 안내 함수에 들어감. false여도 아래 선택 입력 루프를 실행 [판독] |
| `FreeplayBeforeFlow` — mgmet @0x710005dd80 / `FreeplayMainFlow` — mgmet @0x710005ddd0 | `Camera::IsFinished` | modeZoomDone; 같은 대기 동작을 중복 일정으로 넣지 않음 [판독] |
| `FreeplayAfterFlow` — mgmet @0x710005df20 | 출발 요청 후 1.0초 → `MapManager::Mgm01_IsFinishedEventPosAnim` | 1.0초 timer와 departureDone; 카메라 `mgm01_departure` 자체 완료 검사는 없음 [판독] |
| 같은 함수 취소 / `FadeOutWait` — mgmet @0x710004e1b0 | 1.0초 fade out 완료 | fadeDone [판독] |
| `FreeplayReturnFlow` — mgmet @0x710005e250 | screen/NPC 애니 요청, 0.3초 후 이동; allPlayersIdle AND NPC 상태 1 | 0.3초 timer, allPlayersIdle, npcReady. screen 애니 완료를 직접 검사하지 않음 [판독] |
| `mgm01::Scene::ExitFlow` — mgm01 @0x710000e2c0 | 복귀 전 GetArpList(7) 첫 요소의 `ComMinigameModeActionRequestPerformer::IsMotion`이 false가 될 때까지 | motionDone; 종료 연출 내용은 제외 [판독] |
| 같은 함수 후반 | 화면 모션 최대 frame로 `max((frameMax-20)/60,0)`초 대기 | frameMax 또는 계산된 지연; 클립별 frameMax [미확정] |

[판독] `WaitTimeFlow` — mgmet @0x710004e210: 양수인 경우 `Wait` 후 dt를 누적하여 목표 시간 이상이면 종료한다. 0 이하이면 대기하지 않는다. [추정] 60Hz 고정 dt로 대체할 때 1.0초/0.3초는 대략 60/18틱이지만 부동소수 누적·실제 dt가 다르므로 원본 고정 프레임 수로 취급하지 않는다.

[판독] mgm01 `ExitFlow`에는 연출 전 시스템 대기도 있다: 첫 `Fiber::WaitUntil`은 callback vtable(mgm01 @0x710004fd80)에 위임하고, `UiPause::SetEnableOpen(false)` 뒤 1회 Wait, 보상 정보가 시작됐으면 `RewardModule::EndInformation`까지 Wait한다. [미확정] 첫 callback predicate는 별도 판독 필요(§11); 이를 위 motionDone 조건과 합치지 않는다.

## 6. 계산식·조건·의사코드

### 6.1 액티비티 선택 입력·화살표

[판독] 아래 입력은 공용 비트 정의의 재분석이 아니라 이 화면의 소비 우선순위다. 공용 입력/조작자 → [mgm_common.md](mgm_common.md) §6.10, [05_ui_input.md](../engine/05_ui_input.md) §6.

| 화면 [판독] | 접수 시점/반복 | 입력·우선순위 | 결과 |
|---|---|---|---|
| 오프닝 앞부분 | actor 대기 루프; trigger만 | bit12 또는 bit13, `+0x335!=0` | `SQ_SE_SYS_SKIP`, SkipFlow 직접 호출 |
| 오프닝 후반 | 카메라·사람 완료 검사 후; trigger만 | 같은 스킵 비트 | 상태 2; 자연 완료가 같은 틱이면 완료가 우선 |
| 액티비티 선택 상태 7 | 입력 루프, trigger만; `GetInputVec(trigger,0)` | 왼쪽(dir3 또는 mask0x50) → 오른쪽(dir4 또는 mask0xa0) → B(mask2) → A(mask1) | 왼쪽은 ID+1, 오른쪽은 ID-1; 끝에서는 정지, 순환 없음 |
| 상태 6/출발/복귀 3D 대기 | 선택 입력 읽지 않음 | A/B/방향 미접수 | 완료 신호까지 기다림 |
| 첫 설명 | 각 페이지 Start 후 최소 1회 Wait; trigger만 | A 우선; B 무시 | 다음 페이지; 3페이지 끝에서 종료 |
| 설명 다시 보기 | 같은 방식 | A 다음 / B 이전; 페이지0의 B | 0에서 u32 underflow로 범위 밖 → 종료; 중간 페이지 B는 이전 페이지 |
| 규칙 | `RuleConfigView::Impl::Update` 호출마다 | 방향(trigger+repeat) → A → B → mask8 → mask4 | 별도 문서 §6의 정확한 이동/반환값 |
| 나가기/확인 | 공용 메시지/대화가 owner 입력 처리 | 예/아니요, 기본 선택 1 | 아래 §6.4; 내부 선택 이동은 공용 문서 참조(나가기 = 메시지 창 선택지 위/아래, [dialog_box.md](dialog_box.md) 6.3) |

[판독] ID 0은 오른쪽 화살표 숨김, ID 5는 왼쪽 숨김. ID 4의 왼쪽은 보스 개방 시에만 표시하고 허용한다. 나머지는 양쪽 표시다. ID 5가 미개방 상태에서 직접 들어왔더라도 오른쪽 이동 조건은 ID>0이다. 반복 입력을 선택 화면에 추가하면 원본과 달라진다.

[판독] 선택 방향의 경계 검사에 걸려 이동하지 못한 틱에도 해당 `if` 분기가 끝난다. 같은 틱의 B/A로 떨어지지 않는다. NPC 준비 신호는 안내 표시 조건이며 입력을 전역으로 잠그는 조건은 아니다. 안내 함수 내부 `IsAllTalkEnd` 대기 중에는 선택 루프가 진행되지 않는다.

[판독] 좌우 이동 순서: 화살표 SE → `VB_MGMET_SELECT_CUR` → 카메라 `MoveDirection`/`CharacterMove` → ID 변경 → 안내 닫기 → 방향 필드 → 반대쪽 Out 애니 → Back Out → 주변 표시 요청 → 상태 6. A는 `SQ_SE_SYS_DECI`/`VB_MGMET_SELECT_DECI` → 제목 `press` → Back/안내 Out → 상태 8. 명시적인 제목 애니 완료 잠금은 없다.

### 6.2 첫 설명과 저장

[판독] `FirstHowToPlayFlow` — mgmet @0x710005a75c는 프리 플레이 번호 1에서 sync `GetFirstHowtoPlayViewMgm01`을 읽는다. 이미 1이면 반환 0. 아니면 `Setup(1,true)` → `Update` → `Destroy` → `SaveFirstHowtoPlayViewMgm01(owner)` → 반환 1이다. `FirstHowToPlayFlowImpl` — mgmet @0x710005aa70은 Setup/Update/Destroy 공통 부분이다.

[판독] 일반 `HowToPlayFlow` — mgmet @0x710005a47c는 `Setup(1,false)`로 다시 보여 준다. Update 결과의 bit0이 1이고 아직 첫 설명 flag가 없을 때 저장한다. 첫 설명 본 경로는 B로 끝낼 수 없어 Update 반환에 따른 저장 분기가 없다.

[판독][데이터] 프리 플레이 페이지 번호 p=0..2: 그림 `mgmet_pict_free_%02d.tga`, 메시지 `mgmet_fp_mw_howToPlay%02d`. 페이지마다 그림 교체와 `x_chal_00/x_free_00/x_free_01` 숨김 후 p=1이면 `x_free_00`, p=2이면 `x_free_01`만 표시한다. A는 메시지 Out 완료 후 p+1, B는 허용되는 경우 Out 완료 후 p-1이다. 창 in 완료를 별도 기다리지 않는다.

[판독: 어셈블리] mgmet @0x7100072658~0x710007267c: C의 bool 인자가 메시지 객체 주소로 잘못 보이므로 확인했다. `DisablePadInput(false,false)`, `SetFlagForceAllDraw(true)`, `DisableNextKeyWait(false)`이다. 앞 안내의 설정과 다르다. 페이지를 넘기는 파이버는 매번 A/B를 직접 읽으며, 공용 창의 키 처리/close 상태는 [message_window.md](message_window.md) §5~6에 위임한다.

→ 광장 첫 진입 정리: [plaza_intro.md](plaza_intro.md) §1·§4 (항구 첫 소개와 op/MenuData 경계)

### 6.3 흐름 의사코드

[판독] 아래 의미 변수는 모두 `[웹 이름]`; 원본의 실행 위치와 분기를 축약한 명세이며 실행 코드가 아니다.

```text
hubFiber:
  loop:
    SeqUpdate()                         # 내부 Wait는 재개 위치를 유지
    if nextMode != -1: CallMinigameModeScene(nextMode); Sleep(-1); stop
    if exitRequested: ReturnScene(); Sleep(-1); stop
    Wait()

freePlay:
  wait cameraFinished
  title.ActIn()
  FirstHowToPlayFlow(1, false, false, false, false)
  freeInfo.In(); backGuide.In(); howtoGuide.In()
  result = Mgm01SetRuleFlow()
  freeInfo.Out(); backGuide.Out(); howtoGuide.Out()
  title.ActOut()
  if result == 1:
    request departure camera/map/NPC
    WaitTimeFlow(1.0); wait mapDepartureFinished
    StopBgm(2); AddAwakeCount(7); SaveRequest()
    SetNextMGMode()                      # ID2 -> nextMode1
    seq = -1
  else:
    FadeOutWait(); request entrance placement
    selectedId = 2; restorePlacement = true; seq = 5
```

### 6.4 인원·확인 함수

| 함수 @주소 [판독] | 조건·선택지·기본값 | 결과/실제 프리 플레이 호출 |
|---|---|---|
| `mgmet::Scene::ChoicePlayerNumSettingFlow` — mgmet @0x710005e560 | `GetHumanPlayerCount()==1`이면 바로 true. 그 외 `mgmet_ui_sbdlg_NEW`에 Text0=`im_mode14_name`; 추가 확인 `sys_dlg_common_changeMember`; 선택 `sys_dlg_common_setupController_btn00/01`, 기본 1, 취소 허용 | 선택0만 true. 사람/CPU 목록 쓰기 없음. 프리 플레이 호출 없음; 서바이벌 호출 지점 확인, 내부 제외 |
| `mgmet::Scene::ConfirmReturnSceneFlow` — mgmet @0x7100059fa0 | 기존 안내 Out/IsEnd → `mgmet_back_mw_guide`, Text0=`im_mode03_name`; `mgmet_back_mw_guide_a0/a1`, 기본1, 2선택, cancelEnable=true | 0이면 true(나가기), 나머지 false. 예는 DECI_L/진동 deci_l, 아니요는 CANCEL/진동 deci |
| `mgmet::Scene::ConfirmMgExperienceFlow` — mgmet @0x710005abd0 | 컨트롤러 style4; `qtbd00_mw_gyro_setting`/`sys_dlg_common_setupController`, 변경한다/하지 않는다 | configured이면 0. 실패하면 다음 대화; 프리 플레이 호출 없음 |
| 같은 함수의 실패 후 확인 [판독: 어셈블리] | `mn01_bd_mw_gyro_start`, 선택 a0=시작한다/a1=시작하지 않는다, 기본1 | choice0→1, 그 외→2. C에서 IsEnd 반환 변수와 choice 결과가 섞여 mgmet @0x710005ad74~0x710005ad90 비교를 확인 |

[판독: 어셈블리] `ConfirmReturnSceneFlow`의 C는 선택 개수·삽입 값·bool 인자가 빠져 있다. 덤프 `mgmet_stage2_dis1.c`에서 개수2/기본1/cancelEnable1과 Text0 삽입을 확인했다. `ConfirmMgExperienceFlow`의 컨트롤러 선택 라벨도 C가 0/1만 보여서 실제 문자열 인자를 확인했다.

[판독] `mgmet::PlayerManager::GetHumanPlayerCount` — mgmet @0x71000475b4는 기존 목록의 첫 네 항목에서 `PlayerWork::GetPlayerType()==0`을 세고, `GetComPlayerCount` — mgmet @0x71000476d8는 `==1`을 센다. 네 유효 핸들을 전제로 읽는다. `MinigameModeWork::Mgm01ResetPlayerType(true)` — main @0x71001f0000은 인원>4이면 `PlayerWorkHolder::Normalize(4)`하고 각 타입을 BasePlayerType으로 복구한다. 인원<4를 CPU로 채우는 코드가 이 함수에는 없다.

[미확정] 네 슬롯의 최초 CPU 생성은 상위 인원/캐릭터 구성 경로에서 추적해야 한다. 그리고 main `GetHumanPlayerNum`의 실제 판독은 `type!=0` 카운트로 위 허브의 사람 카운트와 다르다. 이름만 보고 같은 계산이라고 문서화하지 않는다(§11).

## 7. 애니·소리·레이아웃·메시지 연결

### 7.1 제목 API 전체

[판독][데이터] 제목은 `mgmet_act_title_00.bflyt`; 공용 파일 묶음 `(mgm/mgmet/layout.lyt, mgm/mgm00/layout.lyt)`. `Impl::SetTitleText` — mgmet @0x71000658e0은 제목 표 mgmet @0x71000fe058을 Text0로 삽입하고 `mgmet_ui_activity_name`을 `x_text_act_shadow`와 `x_text_act_00`에 설정한다. C에서 빠진 페인 이름/삽입값은 어셈블리로 확인했다.

| API — mgmet 주소 [판독] | 재생/행동 [판독][데이터] | tag 구간·길이·loop [데이터] |
|---|---|---|
| `ActivityTitle::InTitle` mgmet @0x7100065a70 → `Impl::InTitle` mgmet @0x7100065a78 | visible=true, `in` → `normal` | in 0~6, 6f; normal 20~50, 30f/반복 |
| `ActivityTitle::OutTitle` mgmet @0x7100065b38 | `out` | 60~66, 6f |
| `ActivityTitle::ActIn` mgmet @0x7100065b84 | **`act`** → `act_normal` | 120~126, 6f; 150~150, 0f |
| `ActivityTitle::ActOut` mgmet @0x7100065c10 | `act_out` | 180~184, 4f |
| `ActivityTitle::PlayIdle` mgmet @0x7100065c5c | `normal` | 30f/반복 |
| `ActivityTitle::Enter` mgmet @0x7100065ca8 | `press` | 60~66, 6f |
| `ActivityTitle::IsEndAnimtion` mgmet @0x7100065cf4 | 창 vt+0x178 완료 조회; 철자 그대로 | 주 선택 루프에서 이 완료를 입력 잠금에 사용하지 않음 |
| `ActivityTitle::InLeftArrow` mgmet @0x7100065d38 | `left_select_01` → `normal` | 280~284, 4f |
| `ActivityTitle::InRightArrow` mgmet @0x7100065dc4 | `right_select_01` → `normal` | 240~244, 4f |
| `ActivityTitle::OutLeftArrow` mgmet @0x7100065e50 | `left_select_00` | 260~278, 18f |
| `ActivityTitle::OutRightArrow` mgmet @0x7100065e9c | `right_select_00` | 220~238, 18f |
| `ActivityTitle::SetVisibleArrow` mgmet @0x7100065ee8 / `SetVisibleLeft` mgmet @0x7100065f80 / `SetVisibleRight` mgmet @0x7100065fd0 | `x_cursor_00/x_null_left`, `x_cursor_00/x_null_right` 개별 표시 | 제목 부품=`mgm00_cursor_around_00`; 공용 부품 동작은 기존 문서 참조 |
| `ActivityTitle::PlayLeftArrowSE` mgmet @0x7100066020 / `PlayRightArrowSE` mgmet @0x71000660ac | 해당 화살표 페인 위치의 `SQ_SE_SYS_CURSOR` | 2D SE 규칙 → mgm_common §6.9 |

[데이터] 제목 root는 1920×1080. `null_01`의 저장 위치 (0,472), 제목 텍스트 1060×85. `x_cursor_00`은 1827.6×86.4 부품. 애니가 위치/알파를 바꾸므로 저장 SRT만으로 최종 화면을 고정하지 않는다. 렌더링 규칙 → charselect §6.4·6.5·12, modeselect §6.1·6.2.

### 7.2 안내·첫 설명·정보

| 기능 [판독][데이터] | 키/레이아웃 | 연결 |
|---|---|---|
| 첫 인사 | `mgmet_entFirst_mw_guide00` → `01` → `02` | 00의 Text0=`im_mode03_name` 미니게임 항구; 환영 → 섬 안내 → 액티비티 질문 |
| 재방문 인사 | `mgmet_entAgain_mw_guide00` | 같은 Text0; 환영/액티비티 질문 |
| 프리 플레이 앞 안내 | `mgm01_ent_mw_guide00` (`mgm01.json`) | “해상 스테이지에서는 좋아하는 미니게임을 / 자유롭게 즐길 수 있습니다!” |
| 전체 안내 표 | mgmet @0x71000e3700 상대 offset[6] | ID순 `mgm04_ent_mw_guide00`, `mgm03_ent_mw_guide00`, `mgm01_ent_mw_guide00`, `mgm05_ent_mw_guide00`, `mgm02_ent_mw_guide00`, `mgm06_ent_mw_guide00`; 다른 문구 내부 제외 |
| 첫 설명 p0 | `mgmet_fp_mw_howToPlay00`, `mgmet_pict_free_00.tga` | “좋아하는 미니게임을 / 자유롭게 플레이하실 수 있어요!” |
| 첫 설명 p1 | `mgmet_fp_mw_howToPlay01`, `mgmet_pict_free_01.tga` | 장르 탐색 안내; `x_free_00/x_text_free_00`=`mgmet_ui_act01` “2 vs 2 미니게임” |
| 첫 설명 p2 | `mgmet_fp_mw_howToPlay02`, `mgmet_pict_free_02.tga` | 즐겨찾기 안내; `x_free_01/x_text_free_01`=`mgmet_ui_act02` “즐겨찾기” |
| 설명 그림 창 | `mgmet_act_img_00.bflyt`, `x_img_00` texture slot1 | in 0~5(5f), normal 15~15(0f), out 25~30(5f); root1920×1080, null_all=(0,82), 이미지864×486 |
| 프리 플레이 정보 | `mgmet_base_playinfo_freeplay_00.bflyt` | 조작자 nickname(비었으면 `im_guest00_name`), 플레이한 미니게임 count, `mgmet_rule_ui_fp00/01/02`(분모 `/112`) |
| 정보 애니 | `FreePlayInfo::In/Out` — mgmet @0x710006fe84/mgmet @0x710006fed0 | in -10~0(10f), normal10~10, out20~23(3f); 완료 대기 없음 |

[판독: 어셈블리] `ShowGuideMessageFrontOfMode` — mgmet @0x7100059e40는 위 표로 메시지를 고르고 `SetManualClose(true)`, `DisablePadInput(false,false)`, `SetFlagForceAllDraw(true)`, `DisableNextKeyWait(true)` → Start → `IsAllTalkEnd` 대기다. C의 문자열/bool 인자 누락 때문에 확인했다. `HideGuideMessageFrontOfMode` — mgmet @0x7100059f60는 Out 요청만 한다. 다음 확인 대화는 별도로 IsEnd를 기다린다.

[판독] `HowtoPlay::In` — mgmet @0x7100071c44는 visible/in, `HowtoPlay::Out` — mgmet @0x7100071ccc도 C상 같은 `in` 상수로 재생한다. 주 경로 `UpdateManual`의 종료는 명시적인 `out`을 사용한다. 래퍼 이름만 보고 Out을 주 종료 호출로 바꾸지 않는다. `IsEndAnimation` — mgmet @0x7100071d54는 공용 창 완료 조회이며 주 설명 흐름에 별도의 완료 대기를 추가하지 않는다.

[판독] BGM 호출 지점: `InitOp`=0, `StartEventFlow`=1, 앞 안내 완료 후 아직 BGM 없을 때=2, 오프닝 스킵/프리 플레이 출발 `StopBgm(2)`. 이름 표·프리셋·메시지 보이스 처리는 → mgm_common §6.9·7, message_window §7. A 페이지 SE=`SQ_SE_SYS_MES_PROC`, 일반 설명 B=`SQ_SE_SYS_CANCEL`.

→ 화면별 원본 BGM(라벨·시작·전환 페이드)·웹 연결: [04_sound.md §12.14](../engine/04_sound.md) (2026-10-08).

[데이터][설계] 항구 제목·안내·규칙 부품 정리본: [../engine/ui_parts_catalog.md](../engine/ui_parts_catalog.md).
## 8. 다른 기능과의 상호작용·저장되는 값

| 값/영역 [판독] | 쓰는 지점·조건 | 읽는 지점/효과 |
|---|---|---|
| Work `+0x4bc` s32 시작 지점 | `SetEntranceStartPoint` — main @0x71001f0518; mgm01 준비=1, `ExitFlow`=7 | `GetAndResetStartMode` → 직접 선택/복귀; `ResetEntranceStartPoint` — main @0x71001f00d0가 0 |
| 세이브 MinigameModeData 선두 u32 bit0 / sync+0 | `MgmetSetupOpSkipFlag` — main @0x710022eafc: 세이브의 기존 값을 sync에 넣고, 기존0이면 save OR1+SaveRequest | 현 방문은 기존값 사용. 첫 방문 도중 bit0이 저장돼도 오프닝 스킵은 허용되지 않음 |
| 세이브 같은 u32 bit3 / sync+4 | `SaveFirstHowtoPlayViewMgm01` — main @0x710022ee20: save OR8+SaveRequest; save 없더라도 sync+4=1 | `SetupFirstHowtoPlayView` — main @0x710022ed40, `GetFirstHowtoPlayViewMgm01` — main @0x710022ee18 → 첫 설명 생략 |
| Work 규칙 CPU index `+0x768`, 설명 index `+0x778` | `Mgm01SetRuleFlow`가 시작·취소 모두 쓰며 valid+0x764=1 | `ConfigInfo::LoadWorkData` 재진입; mgm01 준비가 cache+4 CPU를 Scene+0x284에 읽음 |
| Sync 규칙 CPU `+0x10`, 설명 `+0x20`, valid+0xc | 같은 흐름에서 항상 쓰기; offline이면 Work도 씀 | 온라인 소비 갈래는 범위 밖; 오프라인 프리 플레이는 Work 캐시 사용 |
| PlayerWork ComLevel | `SetPlayerWorkComLevel` — mgmet @0x71000500d0, 목록 전체에 결과 CPU index 적용 | mgm01 `MgStartFlow` — mgm01 @0x7100011a50도 Scene+0x284를 모든 PlayerWork에 적용 |
| flag4 bool=`explainIndex==0` | `Mgm01SetRuleFlow`; CPU 유무·시작/취소와 무관 | mgm01 `MgStartFlow`에서 flag4==0이면 `MGTransSound::Play`; 설명 UI 실제 생략 소비는 추가 근거 필요 |
| 플레이한 미니게임 count | `SetMgm01PlayedMinigameData` — mgmet @0x710005b0d0 → `Mgm01SetPlayedMinigameCount` | `FreePlayInfo::Impl::Setup` — mgmet @0x710006fa9c에서 표시 |
| Work round/random-match 정리 [판독: 어셈블리] | `InitMGMWork` — mgmet @0x710004e134: `SetRound(0)`, `SetRandomMatchingFlag(false)`, Off(0x3c/6/1); C는 Work 포인터가 값처럼 섞여 인자 확인 | 항구 선택 재진입 때 수행; 규칙의 Round index와 다른 값 |
| 활동 진입 통계·저장 요청 | `FreeplayAfterFlow` 시작 결과에서 `AddAwakeCount(7)`, `SaveRequest` | 요청일 뿐 완료 대기 없음; 모든 규칙 값의 영구 저장 증거로 쓰지 않음 |

[판독: 어셈블리] 플레이 count의 C에서 누적 변수가 사라져 확인했다(mgmet @0x710005b0d0~0x710005b184). ID 0..151 중 `MGList::IsAvailable`이고 `SaveData::GetMinigameData` 선두 u16이 0이 아니면 count++한다. 세이브 없으면 0. [데이터] UI 분모는 `/112`라는 문구다. [미확정] 112와 available 집합/캐릭터 미니게임의 관계는 이 판독만으로 확정하지 않는다.

[판독] `SetupMinigameModeSyncBefore` — mgmet @0x710005b024는 owner 기준 opSkip/firstHowto/boss 정보와 플레이 count를 준비한다. `SetupMinigameModeSyncAfter` — mgmet @0x710005b324는 보스 flag를 Scene에 옮긴다. 오프라인에서도 Sync 객체를 거치며, 이번 문서는 네트워크 메시지 처리 내부를 확장하지 않는다.

[판독] mgm01 `SyncedSetupGame` — mgm01 @0x7100004e50은 오프라인 cache+4를 CPU로 읽고 valid byte 검사를 하지 않는다. Work 규칙 캐시는 세이브 비트와 별개인 세션 작업 데이터다. 캐시 수명·모든 getter/setter·취소 commit은 ruleconfig §8 참조. [미확정] `ReturnScene`의 엔진 스택/허브 재구성 수명은 `InitFromMgm01` 진입 계약까지만 확인했고 동일 Scene 인스턴스 유지라고 단정하지 않는다.

→ 광장 첫 진입 정리: [plaza_intro.md](plaza_intro.md) §1·§4 (MinigameModeData와 MenuData 분리)

[판독] 공용 장면 요청·복귀 인스턴스 미확정 정리 → [장면·Work](../engine/18_scene_work.md) §3.3·§5·§11.
## 9. 웹 포팅 구조 — 제안, 코드 없음

[추정][웹 이름] `web/script/app/scene/world/mgmet/`에 허브 순수 상태와 뷰 어댑터를 둔다. import 경계/레이아웃·텍스트·메시지·SE·안내 재사용은 mgm_common §9.1~9.4를 따른다. 기존 엔진층을 끌어오거나 공용 기능을 이 모듈에 다시 구현하지 않는다.

3D 무대(섬·바다·NPC·카메라) 규모 조사와 웹 반영 계획(2026-10-08) → [mgmet_3d.md](mgmet_3d.md).

| 제안 부품 [추정][웹 이름] | 원본 대응/책임 |
|---|---|
| `hubState.ts` | 상태 -1/0~10, 선택 ID·시작 지점 보정, nextMode/exit, trigger 우선순위; 3D 완료 신호는 입력으로 받음 |
| `hubFlow.ts` | 원본 파이버를 재개 가능한 프레임 제너레이터로; 인사/첫 설명/규칙/출발/복귀를 순차 호출 |
| `activityTitle.ts` | 제목 키 표, 화살표 표시, 애니 요청; 공용 LayoutInst·Render2D 사용 |
| `howtoPlay.ts` | 3페이지·강제/다시보기 구분·u32 페이지 경계·메시지 Out 완료 대기·firstView 저장 요청 |
| `ruleConfig.ts` | [mgmet_ruleconfig.md](mgmet_ruleconfig.md) §9 계약 |
| `workAdapter.ts` | Work 캐시, Sync mirror, firstView/opSkip 영구 flag, 플레이어 목록, 시작 지점을 명시적인 데이터로 분리 |
| `sceneAdapter.ts` | `requestScene("mgm01")`, `returnScene()`, fade, `cameraIdle/npcReady/departureDone` 외부 신호 |

[추정][웹 이름] 3D를 생략하는 뷰는 각 완료 신호를 명시적으로 공급한다. 미확정 클립 길이를 0으로 일괄 처리하거나 UI 애니 길이를 카메라 길이로 대입하지 않는다. 즉시 완료 또는 근사 시간 선택은 포팅 명세에 `[추정]`으로 표시하고 상태 6의 입력 금지·대기 순서는 유지한다.

[추정] 검증용 입력/출력 계약은 `{dt,trig,rep,completionSignals}` → `{layoutAnimation,message,SE,saveRequest,sceneRequest}` 사건이다. save commit은 취소에서도 수행하고, 첫 설명 저장은 owner 프로필 단위로 둔다. UI 구현 전에 CPU 유무·첫/재방문·직접 진입·복귀·나가기 취소의 추적 fixture를 고정하는 것이 좋다.

### 9.1 구현 계약 (2026-10-07, 웹 구현 — 액티비티 선택·첫 설명)

코드 = `web/script/app/scene/world/mgmet/`(`index.ts`). 공용 부품은 `../mgmcommon`(mgm_common.md 9.6)을 그대로 쓰고, import 경계는 같은 폴더·mgmcommon·charselect 공용(scene2d/render2d/state/types)·three(`tools/check_mgmcommon.ts` 6절이 함께 검사). 플레이 방법 화면(`howto.ts`, 조정자 작성)은 `types.ts` 의 `MgmetHowto` 인터페이스로 허브에 주입한다.

| 파일 | 원본 대응 | 내용 |
|---|---|---|
| `tables.ts` | 4.2·7.2 표, ruleconfig 4.3·7.2 | 액티비티 6칸(제목·다음 모드·시작 지점·앞 안내), `idFromStartPoint`·`adjustStartPoint`(GetAndResetStartMode 보정), `inputVec`(GetInputVec), 설명 종류 표, 규칙 열·값·문구, 정렬 값 |
| `hub.ts` `MgmetHub` | Scene +0x328~+0x340, MinigameModeFlow·SeqUpdate 상태 0~10 | 파이버 = `FiberRunner` 제너레이터(한 틱 = 입력 → 흐름 → UI). 결과 `{kind:'mgm01'|'exit'|'activity'|'rule'}`, `router.call('mgm01')`/`ret()` |
| `activityTitle.ts` | ActivityTitle API 전체(7.1) | `MgmWindow`(mgmet_act_title_00) 레이아웃에 태그 → 다음 태그 직접 재생 |
| `freePlayInfo.ts` | FreePlayInfo | 이름(빈 값 = im_guest00_name)·플레이 수·/112, In/Out = 공용 창 생애 |
| `fade.ts` | FadeOut/IsFinishedFadeOut | 검은 막 알파(순수) + Render2D 사각형 |
| `types.ts` | 5.2 | `MgmetHowto`, `MgmetSignals`(3D 완료 신호), `IMMEDIATE_SIGNALS` |
| `extra.ts` | — | `assets/mgmet/extra.json`(← `tools/analysis/mgmet_web_assets.py`: 설명 그림 22장·mgm02~06 앞 안내 문구·속성·SE 2종)을 공용 명세에 더함 |

웹에서 정한 것 **[설계]**·해석 **[추정]**:

| 항목 | 웹 | 근거 한계 |
|---|---|---|
| 3D 대기(5.2 표 전부) | `MgmetSignals` 로 받고 기본은 모두 즉시 참(다음 틱 진행). 1.0 s 출발 대기·0.3 s 복귀 대기·1.0 s 페이드는 원본 시간 그대로(Wait 뒤 f32 dt 누적) [설계] | 클립 길이 [미확정] — UI 애니 길이를 카메라 길이로 쓰지 않음 |
| 오프닝(상태 1·2) | 3D 연출·스킵 입력 생략, `openingDone` 신호 하나 뒤 상태 4 [설계]. BGM 0 은 InitOp 에서 재생 | actor frame·fade 순서는 3D 범위 |
| 보스 해제 안내(상태 3) | 없음(상태 4 로) [설계] | 내부 범위 밖 |
| 3D 항구 | 고정 배경 그림 `assets/modeselect/backdrop_temp.png`(흐림 창 뒤 그림) [설계] | — |
| 인사 메시지 흐름 | `MessageFlow.flow(0)`(조작 플레이어를 매 프레임 owner 로) [추정] | StartEventFlow 의 n 값 미기록 |
| 앞 안내 표시 조건 +0x33c | 상태 7 준비(제목·화살표·Back)마다 1 → NPC 준비면 안내 → 0 [추정: 5.1 "제목·화살표·안내 준비"] | 이동 뒤에도 새 ID 안내가 나와야 하므로 |
| 상태 7 제목 In | +0x340 = −1 → InTitle, 0(ID 증가 = 왼쪽) → InLeftArrow, 1 → InRightArrow. 이동 때 "반대쪽 Out" = 왼쪽 누름 → OutRightArrow, 오른쪽 → OutLeftArrow [추정] | 방향 ↔ 태그 대응 미기록. +0x340 은 상태 5 에서 −1 로 [추정] |
| 나가기 확인(B) | ~~공용 DialogBox(예/아니요) 미구현 → 앞 안내 Out·끝 대기 뒤 '예'(SQ_SE_SYS_DECI_L) 로 처리 → ReturnScene [설계]~~ 정정(2026-10-08): 원본은 DialogBox 가 아니라 **메시지 창 선택지** — B 즉시 SQ_SE_SYS_CANCEL → Back Out·제목 ActOut·메시지 Out 끝 대기 → `mgmet_back_mw_guide`(Text0=`im_mode03_name`) 2지(a0 예 DECI_L/bv_vib_sys_deci_l, a1 아니요 CANCEL/bv_vib_sys_deci), 기본 1, B 취소 가능 → 결과 0 만 나가기(ReturnScene), 그 밖은 +0x33c=1 로 상태 7 재진입 [판독 ConfirmReturnSceneFlow @0x7100059fa0·ModeSelectCameraIdle @0x710004d6d0; 판독: 어셈블리 mgmet_stage2_dis1.c]. 웹은 공용 MessageWindow 선택지로 구현 → [dialog_box.md](dialog_box.md) 6.3·9.2 | — |
| 다른 액티비티 결정 | `ModeStartFlow` 에서 modeZoomDone 뒤 결과 `{kind:'activity', id, nextMode}` 로 끝(진입 미구현) [설계] | 각 모드 흐름 범위 밖 |
| 취소 뒤 복귀 | FadeOutWait 1.0 s → 상태 5 복원 분기에서 `fadeIn(1.0)` [설계] | 원본 페이드 인 위치 미기록 |
| 설명 종류 kind | 프리 플레이 1 [판독]. 나머지 = 다음 MinigameModeID 번호와 라벨 접두(cmgb 2·dt 3·tm 4·sb 5·bm 6)·그림 수 대응 [추정] | HowtoPlay +0x58 표 미기록 |
| HowtoPlay 반환 | bit0 = 1: 마지막 페이지 A 로 끝, 0: 다시 보기 페이지 0 B [추정] | UpdateManual 지역 반환값 |
| 진동 | 이름만 사건으로(`VB_MGMET_SELECT_CUR/DECI`) | FX 자원 [미확정] |
| 플레이 수 | `playedCount(save, 0..151)` [근사: available 집합 = mgm01_freeplay.md 6.1] | — |

검증(2026-10-07): `npx tsx tools/test_mgmet.ts` 198/198 — 표 대응·GetInputVec·시작 지점 보정, Alignment 고정 경로(6.4 좌표), 규칙 상태(입력·경계·결과·commit), 실제 명세 규칙 화면(열 x·배경 x·글자·아이콘), 허브 흐름(첫 방문 인사·BGM 0→1·좌우 이동·앞 안내·첫 설명 저장 flag 8·규칙 취소 commit·두 번째 진입 첫 설명 생략·출발 StopBgm(2)·mgm01 호출, 시작 지점 4·2·7, 보스 미개방 막힘, 나가기). 원본 실행 대조는 없다.

## 10. 검증 방법·실행 결과

[실행: 변환] 새 디컴파일은 `decomp_index.py <함수>` 조회와 기존 C 헤더 대조 후 누락된 비-thunk 함수만 대상으로 했다. Ghidra 사본에 `-noanalysis -readOnly`를 사용했으며 기존 C를 다시 디컴파일하지 않았다. 범위 밖 함수가 공통 초기화/캐시 표의 일괄 조사에 포함돼도 문서에서는 해당 내부 흐름을 분석하지 않았다.

| 신규 C 파일 [실행: 변환] | 함수 수 | 용도 |
|---|---|---|
| `analysis/decomp/mgmet_stage2.c` | 111 | 허브 누락 함수·ActivityTitle·HowtoPlay·RuleConfigView |
| `mgmet_stage2_more.c` | 17 | 보충 진입/Work/대기/정보/Input |
| `mgmet_stage2_hooks.c` | 3 | SetupGame/SyncedSetupGame/CleanupGame |
| `mgmet_stage2_counts.c` | 2 | 사람/CPU 카운트 |
| `mgmet_stage2_destructors.c` | 12 | 제목·설명·규칙 wrapper/Impl/버튼 소멸자 |
| `mgmet_stage2_cleanup.c` | 1 | RuleConfigView 소멸자가 부르는 무명 해제 helper |
| `mgmet_main_work.c` | 44 | 캐시·세이브 비트·장면 요청·인원 계약 |
| `mgmet_main_more.c` | 2 | 초기화/EntranceInit의 무명 helper 추적; 내부 전체를 문서로 확장하지 않음 |
| `mgmet_main_alignment.c` | 1 | Alignment request가 즉시 위치 계산이 아닌 dirty flag 설정임을 확인 |
| `mgmet_mgm01_consume.c` | 4 | 다음 장면의 캐시 소비·복귀 요청 |
| **합계** | **197** | 어셈블리/문자열 덤프는 함수 수에서 제외 |

### 10.1 어셈블리 예외 판독 지점 전체

| 모듈·함수 @주소 [판독: 어셈블리] | C를 못 믿거나 더 확인한 이유 → 확인 내용 | 덤프 |
|---|---|---|
| mgmet `ModeSelectCameraIdle` mgmet @0x710004d6d0 | 미복구 점프표로 함수 body 일부가 빠짐 → 입력/상태/프리 플레이 NPC 요청 분기 | dis1; dis2의 mgmet @0x710004d814~0x710004d824, mgmet @0x710004d84c~0x710004d89c |
| mgmet `ShowGuideMessageFrontOfMode` mgmet @0x7100059e40 | 메시지 키/flag 인자 누락 → 표/실제 bool | dis1 |
| mgmet `ConfirmReturnSceneFlow` mgmet @0x7100059fa0 | 선택 개수/라벨·삽입·bool 누락 → 2선택/기본1/취소 허용 | dis1 |
| mgmet `ConfirmMgExperienceFlow` mgmet @0x710005abd0 | 컨트롤러 라벨 인자 누락, IsEnd와 choice 반환 혼합 → choice0=1/그 외2 | dis1 |
| mgmet `Mgm01SetRuleFlow` mgmet @0x710005e090 | Explain/Cpu setters가 같은 포인터 변수처럼 보임 → result+0xc/0x14 각각 저장 | dis1 |
| mgmet `ActivityTitle::Impl::SetTitleText` mgmet @0x71000658e0 | 텍스트 페인·삽입 라벨 인자 누락 → x_text_act_00/제목 표 | dis1 |
| mgmet `RuleConfigView::Impl::RoundButton::SetBody` mgmet @0x710007efdc | Number0 값 인자 없음 → [5,7,10] 표 값 | dis1 |
| mgmet `RuleConfigView::Impl::AlignmentColumn` mgmet @0x7100080770 | FindPane 인자 없음 → A_alignment_00 | dis1 |
| mgmet `RuleConfigView::Impl::ButtonBase::AlignmentColumn` mgmet @0x710007f530 | 전달된 페인 인자가 없음 → x1을 FindPane에 전달하는 공통 request | dis1 |
| mgmet `StartEventFlow` mgmet @0x710004cd60 | 인사 메시지·Text0 값 인자 없음 → 첫/재방문 키·im_mode03_name | dis1 |
| mgmet `MinigameModeFlow` mgmet @0x7100049ed0 | CallMinigameModeScene 인자가 C에 없음 → +0x328을 w1로 전달 | dis2 |
| mgmet `RuleConfigView::Impl::StarButton::SetBody` mgmet @0x710007f338 | Number0 인자 없음 → 표 [3,5,10] | dis2 |
| mgmet `InitMGMWork` mgmet @0x710004e134 | Work 포인터가 round/bool 값처럼 섞임 → round0/randomMatchfalse/보스 초기 flag 인자 | dis2 |
| mgmet `HowtoPlay::Impl::UpdateManual` mgmet @0x7100072658~0x710007267c | bool 인자가 창 주소로 보임 → false,false / true / false | dis2 |
| mgmet `SetMgm01PlayedMinigameData` mgmet @0x710005b0d0 | count 누적과 setter 인자 제거 → available && u16!=0 집계 | dis2 |
| main `MinigameModeWork::GetHumanPlayerNum` main @0x71001f1820 | 사람이라는 이름과 허브 type 비교가 충돌하여 C 재확인 → C 그대로 type!=0; 의미는 미확정 | main_dis3 |
| main `MinigameModeScene::CallMinigameModeScene` main @0x710036027c | RequestCallScene의 문자열 인자 없음 → 상대 offset 이름 표 main @0x71015d840c | main_dis4 |

[실행: 변환] layout.lyt에서 **34 레이아웃·107 애니**를 `analysis/mgmet_layout/`로 변환했다. 문서의 tag 구간/frameSize/loop, 제목/규칙 값 표·메시지 라벨은 변환 데이터와 C에서 대조했다. 정적 입력·캐시 계약의 검증 결과는 `analysis/mgmet_validation.json`에 기록한다. 이 검증은 원본 실행이나 화면 일치 검증이 아니다. 최종 누락 검색에서 ActivityTitle/HowtoPlay/RuleConfigView의 비-thunk 명명 함수 **107개가 모두 C로 확보**되어 있다. 소멸자 이름의 `~`를 목록 구분자와 구별하도록 도구를 보정하고 누락 함수만 추가 추출했다.

[실행: 변환] 변경 범위 검사는 작업 시작 SHA-256 목록 `analysis/mgmet_baseline.json`의 기존 904파일(웹 script/assets·기존 shell 문서)을 다시 비교한다. 상세 결과/문서 분량/중복 여부는 `mgmet_validation.json` 참조. **기존 문서 정정 줄 추가는 0건**이다. 공용 문서의 기존 주장과 충돌하는 확정 근거는 발견하지 않았다.

[실행: 변환] 최종 검사 **41/41 통과**. 기준 목록의 **기존 904파일 SHA-256 일치**, 신규 C 함수 중복 없음, 대상 UI 비-thunk 명명 함수 107개 확보를 확인했다. 결과: `analysis/mgmet_validation.json`.

## 11. 미확정 사항과 필요한 근거

| 우선순위·항목 [미확정] | 현재 판독 범위 | 다음에 필요한 구체적 근거 |
|---|---|---|
| 1. 네 슬롯 초기 CPU 채우기 | 허브 카운터는 네 유효 항목을 요구; EntranceInit는 >4 정규화/타입 복구만 함 | `bq::PlayerWorkHolder::Normalize`, 상위 인원 구성·charselect→항구 호출자의 PlayerWork 생성/SetBasePlayerType 경로 |
| 2. main 인원 카운트 의미 | main GetHumanPlayerNum은 type!=0, mgmet GetHumanPlayerCount는 type==0; 어셈블리로도 그대로 확인 | main `bq::PlayerWork::GetPlayerType` main @0x710021d7c8, NRO import 해석/호출 전 타입 writer, `mgm01::Scene::InitializeHumanNum` mgm01 @0x710000888c의 소비처. 이름만으로 해석 금지 |
| 3. 3D 대체 시간 | actor frame>390, camera/map/NPC 완료 predicate와 1.0/0.3초는 확인 | `Camera::EnterOp/StartOp/StartOpZoom/StartModeSelect/ModeZoom/PlayAnim`의 클립 이름·속도·frame 범위, `MapManager::Mgm01_PlayEventPosAnim`; 현재 범위에서는 내부 분석 제외 |
| 4. 설명 flag4 실제 화면 소비 | 쓰기와 mgm01 MGTransSound 조건 확인 | `bq::MinigameScene`의 초기 설명 진입 분기, flag4 reader; 실제 설명 생략 여부 원본 실행 대조 |
| 5. 허브 복귀 인스턴스 수명 | ExitFlow가 start7을 쓰고 ReturnScene; 허브 Initialize가 InitFromMgm01 선택 | main `bq::SceneBase::RequestCallScene/RequestReturnScene`와 SceneManager의 호출 스택/재구성 처리 |
| 6. 플레이 count 분모112 | available한 ID0..151 중 기록 u16!=0 집계, 표시 문자열 /112 | `MGList::IsAvailable`의 모드별 집합, 해당 세이브 u16 writer/게임 목록 데이터 |
| 7. 실제 입력 반복/진동·동시 메시지 키 효과 | 허브 반복 미사용, 규칙 반복 사용; Howto는 메시지 pad허용과 직접 A 처리가 공존 | 공용 bex 반복 간격은 기존 문서의 미확정 유지; Howto 원본 입력 추적/영상; FX 트리거 VB_MGMET_* 자원 |
| 8. mgm01 복귀 첫 WaitUntil | ExitFlow의 첫 WaitUntil callback vtable은 mgm01 @0x710004fd80 | 해당 vtable의 호출 slot 함수와 predicate 판독; 보상정보 완료 대기와 분리 |

보충(2026-10-07): → [mgm01_freeplay.md](mgm01_freeplay.md) §8.1·8.2·3.2 (항목1·2·8의 슬롯 생성/타입·카운터 소비/fade predicate 보충), §6.1 (항목6의 프리 플레이112개 집합만 보충).
### 참조만 한 기존 문서 절

[판독] 공용 기능은 아래 기존 분석을 참조했으며 재분석/중복 명세를 만들지 않았다.

- [mgm_common.md](mgm_common.md) §3·4·5, §6.1~6.10, §7·8·9: 공용 창/안내·파이버 메시지·텍스트 삽입·사운드/입력·독립 모듈 경계.
- [message_window.md](message_window.md) §4~9: 내부 상태·owner 입력·글자/넘김·메시지 layout/소리·포팅 어댑터.
- [charselect.md](charselect.md) §6.4·6.5·12: layout 갱신/그리기·부품·텍스처/폰트 규칙.
- [modeselect.md](modeselect.md) §5·6.1·6.2·8·9: 버튼6 미니게임 항구 진입, layout/창 렌더링 규칙.
- [05_ui_input.md](../engine/05_ui_input.md) §6·7, [04_sound.md](../engine/04_sound.md) §6: 입력 비트·FX/진동·사운드 API.
- `E:/programming/python/ddalkkakrider_work/web/docs/파티_미니게임_모음_분석.md` §2: 모드 표/공통 흐름의 배경 자료(읽기만).
- `F:/dev/mps/web/docs/분석.txt`: 11절 문서 형식(읽기만).

### 9.x 구현 기록 — 플레이 방법 단독 화면 (2026-10-07)

[설계] `script/app/scene/world/mgmet/howto.ts` `MgmetHowtoView`(types.ts `MgmetHowto` 구현): 설명 그림 창 `mgmet_act_img_00`(x_img_00 칸 1 = `<pict>_NN^o`, 페이지별 정보 페인) + 독립 메시지 창. UpdateManual 지역 변수 세부가 문서에 없어 페이지들을 한 메시지 묶음으로 열고 현재 페이지 번호로 그림을 바꾼다. 다시 보기에서 페이지 0 넘김 대기 중 B = CANCEL·반환 0, 마지막 페이지 A = 반환 1, 이전 페이지 돌아가기 없음. 확인 `dev/ui?ui=mgmet-howto&first=1|0&howto=1~6`. 남은 문제: 2페이지 정보 글자(`x_free_00` "2 vs 2 미니게임")가 헤드리스 화면에 보이지 않는다(글꼴·표시 플래그는 정상, 원인 미확인).

정정(2026-10-07, online.md 4.9): 위 [미확정] "버튼 아이콘 E000→E004 류 치환" — 치환을 찾지 못했다: 게임 문구는 E000~E003(버튼 위치 다이아몬드)만 쓰고 E004~E007(글자 단추)은 글꼴 글자 목록에만 있으며 main 에 0xe004~0xe007 즉시값 명령이 없다 [데이터][판독: 명령 검색]. 다이아몬드 그대로가 원본 표시로 본다(실행 대조 없음).
