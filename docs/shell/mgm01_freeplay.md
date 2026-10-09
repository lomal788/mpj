# mgm01 프리 플레이 — 목록·설정·한 판 호출·승패 표·복귀

## 1. 기능 개요와 보이는 동작

[판독] `mgm01::Scene`은 항구에서 들어온 뒤 미니게임 목록/장르를 고르고, 개별 설정에서 팀·CPU·일부 게임의 모드·리듬 난이도를 정해 한 판을 호출하는 화면이다. 돌아오면 이전 필터/선택을 읽어 다시 고를 수 있고, 승패 표에서 최근 결과를 본다. 목록의 취소는 항구 복귀 흐름으로 간다.

[데이터] 프리 플레이 JSON의 게임은112개, 필터는14개다. 잠긴 게임도 목록에 남을 수 있지만 결정/랜덤 후보는 구별한다. 112개는 페이지별 누적 수가 아니라 `MgAll` 목록 자체의 수다. 전체 MGList의152개 ID 공간과 동일한 집합이라는 뜻은 아니다.

[판독] `mgmrs::Scene`은 접속 이탈 오류 뒤 세션 재구성을 기다리는 화면이다. 정상 오프라인 한 판→mgm01 사이의 필수 장면이 아니다. 진입을 선택하는 main 오류 갈래와 복구 성공/실패는 §3.3·5.4에 분리한다.

[판독] 공용 창·메시지·메뉴/입력·소리는 [mgm_common.md](mgm_common.md) §3~8, [message_window.md](message_window.md) §5~9, [05_ui_input.md](../engine/05_ui_input.md) §6·7, [04_sound.md](../engine/04_sound.md) §6을 참조한다. 이미 확인한 mgmet 캐시 소비, flag4 writer, 시작 지점1/7, 기본 ExitFlow는 [mgmet_flow.md](mgmet_flow.md) §3·5.2·8 및 [mgmet_ruleconfig.md](mgmet_ruleconfig.md) §8.2를 참조한다. 이번 문서는 그 이후의 고유 처리다.

## 2. 분석 대상·자료 위치

[데이터] 원본 버전은 Super Mario Party Jamboree US v0다. 표의 상대 경로는 `C:/dev/mpj/` 기준이다. 원본·extracted는 읽기만 했으며 키 값을 옮기지 않았다.

| 자료 | 경로·역할 [데이터] |
|---|---|
| NRO/함수 목록 | `extracted/romfs/nro/NX_Release/{mgm01,mgmrs}.nro`, `analysis/functions/{mgm01,mgmrs}.nro.tsv`, `main.nso.tsv` |
| 기존 C 재사용 | `mgmcommon_mgm01_inline.c`, `mgmcommon_mgm01_callers.c`, `mgmcommon_mgm01_input_callers.c`, `mgmcommon_mgm01_dis*.c`, `mgmet_mgm01_consume.c`, `rhythm_mgm1.c`, `logic1801_mgm*.c` |
| 새 Scene C | `analysis/decomp/mgm01_stage3.c`, `mgmrs_stage3.c`, `mgm01_callbacks.c`, `mgm01_wait_callback.c`, `mgm01_helpers.c`, `mgm01_data_helpers.c` |
| main/메뉴/boot 연결 | `mgm01_main_contract.c`, `mgm01_main_more.c`, `mgm01_main_round.c`, `mgm01_result_writer.c`, `mgm01_menu_player.c`, `mgm01_boot_initial.c`, `mgm01_team_expand.c`, `mgm01_team_sort.c`, `mgm01_player_base.c`; 타입/Normalize는 `ui2dalign_main.c` |
| 새 어셈블리 예외 | `mgm01_dis_stage3.c`, `mgm01_main_dis1.c`, `mgm01_dis_boot.c`, `mgm01_dis_boot_reset.c`, `mgm01_dis_record.c` (§10.2) |
| 목록 본체 보강(2026-10-07) | main 썸네일 9함수 `analysis/decomp/mgm01_list_thumb_main.c`(GetThumbnail·GetTextureInfo 등, ghidra_work/setplayer 사본); mgm01 데이터 표·페인 문자열은 capstone 으로 읽음(§6.7·7.1) |
| 목록 JSON | `extracted/bea/mgm~mgm01.nx.bea/mgm/mgm01/data/mgm01_freeplay_mgList.json` |
| 기본 기록 JSON | `extracted/bea/bq.nx.bea/common/data/gamerecord.json` |
| 메시지 | `extracted/message/koKR/{mgm01,im_common,system}.json` |
| 레이아웃 | `extracted/bea/mgm~mgm01.nx.bea/mgm/mgm01/layout.lyt`, 공용 `mgm~mgm00.nx.bea` |
| 변환 결과 | `analysis/mgm01_layout/`, `mgm01_panes.txt`, `mgm01_anims.json`, `mgm01_evidence.json` |
| 판독·검증 도구 | `web/tools/analysis/mgm01_research.py`, `mgm01_verify_stage3.py`, `analysis/mgm01_validation.json` |

[판독] 모듈 접두어가 다른 동일 주소는 다른 함수다. 이름 없는 함수는 `FUN_…`, 원본의 `UpdateRhythmDfficultyPane` 등 철자도 그대로 쓴다. 의미 설명용 필드명은 정식 SDK 멤버명이라고 단정하지 않으며 웹 제안 이름은 `[웹 이름]`으로 표시한다.

## 3. 진입점과 호출 흐름

### 3.1 생성·준비·첫 진입

| 순서 | 함수·모듈 주소 [판독] | 처리·다음 |
|---|---|---|
| 생성 | `mgm01::Scene::Scene` — mgm01 @0x71000042fc | 크기0x26c8, MinigameModeScene(1); 필드 기본값 §4 |
| 사전 로드 | `PrepareLoadArchives` — mgm01 @0x7100004d78 | 공용/고유 아카이브 준비 |
| 준비 | `SetupGame` — mgm01 @0x7100004df0 | pause/전환 준비; 메시지/필드 연결은 다음 동기 준비 |
| 동기 준비 | `SyncedSetupGame` — mgm01 @0x7100004e50 | Message/Map/Chara/Telop/List/Result/Setting/HumanNum 초기화, PlayerType 복구·retry team 초기화·order reset, JSON deserialize·ID/필터 구성·잠금 계산 |
| 모드 흐름 | `MinigameModeFlow` — mgm01 @0x710000ad60 | 플레이어 attach → 첫 연출 또는 Continue → detach → 선택 흐름 → attach → Exit |
| 첫 연출 | `EnterFlow` — mgm01 @0x710000c4a0 → `StartFlow` — mgm01 @0x710000d4c0 | course 텔롭·첫 안내, 연출 완료 신호 §5.3 |
| 한 판 이후 | `ContinueFlow` — mgm01 @0x710000dad0 | ModeData의 game/filter를 Scene에 복구, resume=1, 선택 흐름 재개 |
| 화면 선택 | `DecideMinigameFlow` — mgm01 @0x710000df80 | 목록/승패 표/설정/호출 상태기계 §5.2 |

[판독] `GetRound()<1 && !flag0x3c`일 때 Enter→Start, 나머지는 Continue이며 Scene+0x281=1이다. `SyncedSetupGame`에서 Round<1이면 SetRound(0)·flag6 off를 수행한다. save MinigameMode 비트2가 없을 때는 §8의 SetupPlayData를 한 번 적용한다.

[판독: 어셈블리] `SyncedSetupGame`의 C는 `ParseFromAsset` 문자열/옵션 인자를 생략해 신뢰할 수 없었다. mgm01 @0x7100004e50의 덤프에서 x1=`mgm/mgm01/data/mgm01_freeplay_mgList.json`(mgm01 @0x7100044f67), 두 번째 x1=`common/data/gamerecord.json`(mgm01 @0x7100045293), w2=1을 확인했다. 런타임 archive 내부 경로이며 임의 웹 URL이 아니다.

### 3.2 한 판 호출과 돌아온 뒤

[판독] `MgStartFlow` — mgm01 @0x7100011a50는 설정을 Work/Sync/PlayerWork에 반영하고 `CallMinigameScene`을 요청한 뒤 `Fiber::Sleep(-1)`로 중단한다. 한 판 내부에서 결과를 만들고 Scene 스택을 복귀시키는 코드는 다음 `bq::MinigameScene` 분석 범위다. 여기서의 복귀 소비는 Round/ModeData/결과 ring을 읽는 경로까지다.

[판독] `bq::MinigameModeScene::CallMinigameScene` — main @0x71003601ac는 ID<152 검사, GameWork의 ID 쓰기, 다음 Scene 이름 선택을 한다. UseGyro면 `gyroPadChange`, 그 외 flag4와 `MGList::IsCallInst`가 모두 참이면 `mgInst`, 나머지는 `MGList::GetName(id)`다. 자이로 설정/설명 장면 내부는 범위 밖이다.

[판독: 어셈블리] 위 main C에는 Scene 이름 인자가 사라지고 마지막 호출이 tail call로 보였다. `mgm01_main_dis1.c`에서 x1 문자열과 분기 순서를 확인했다. 문자열은 main @0x710159ef04=`gyroPadChange`, main @0x710156fc95=`mgInst`다. flag4를 쓰는 mgmet 경로는 기존 문서 참조만 한다.

[판독] 목록 B로 선택 흐름을 끝내면 기존 ExitFlow가 항구 복귀를 요청한다. 원래 §5.2의 첫 WaitUntil만 이번에 닫았다: vtable mgm01 @0x710004fd80의 +0x30은 `FUN_710001eab8` — mgm01 @0x710001eab8, 조건은 `!WipeModule::IsPlayingFadeAnim()`이다. 그 이후 보상/연출/복귀 기본 처리와 시작 지점은 기존 mgmet 문서대로다.

### 3.3 mgmrs 진입을 고르는 오류 갈래

[판독] main `FUN_71001ec490` — main @0x71001ec490의 네트워크 이벤트 처리에서 메시지+8=0x5f4e4502, 이벤트 종류1(이탈)을 처리한다. 자기 ConstantID 이탈, 예약된 이탈, `FUN_71001eced0`의 배제 결과는 통과시키지 않는다. 남은 flag0x1c 갈래에서 flag0x4b가 있고 `IsLeftError()==false`, flag0x4a가 없을 때 아래 선택이 있다. 온라인 내부의 다른 갈래는 확장하지 않는다.

| 조건·결과 [판독] | 처리 |
|---|---|
| 이탈 PlayerID 유효, `FUN_71001f3d98(mode,pid)==false` | 오류4, `sys_error_B6`; 현재 자기 ConstantID로 찾은 로컬 플레이어 수 검사 |
| 그 수<2 | `Net::SetErrorReturnSceneName("mgmrs")` |
| 그 수≥2 | `Net::SetErrorReturnSceneName("mgmet")` |
| 같은 검사 함수가 true인 갈래 | `sys_error_B1`·menu00 복귀 갈래 |
| flag0x4a가 이미 있음 | `sys_error_B3` 갈래 |

[판독] 이것은 오류 복귀 목적지 문자열의 설정이지 그 자리에서 `RequestCallScene("mgmrs")`하는 코드가 아니다. [미확정] 실제 오류 dispatcher가 Scene history를 어떻게 복원하는지는 §11. 오프라인에는 이 접속 이탈 이벤트를 정상 한 판 복귀로 공급할 이유가 없다.

## 4. 구조체·필드·상수 표

### 4.1 mgm01::Scene

| 상대 오프셋 | 형·초기값 [판독] | writer → reader |
|---|---|---|
| +0x210/+0x214 | s32 filter enum/index, -1/-1 | SetupMgListFilter·Continue → 목록·설정·ModeData commit |
| +0x218 | vector<MgJsonData>, empty | deserialize → ID 목록/조건 |
| +0x230 | vector<MgData>, empty→152 slots | SetupMinigameIdList·lock → GetMgData |
| +0x248/+0x260 | 필터 원형/표시용 vector, empty | 목록/즐겨찾기 구성 → GetMgIdList/전환 |
| +0x278 | s32 selected MinigameID, -1 | 목록·설정 이동·Continue → 호출/표시 |
| +0x27c | s32 team 선택, 0 | MgSettingFlow 종료 → SetupPlayInfo |
| +0x280/+0x281 | byte endless/resume, 0/0 | 필터/설정·Continue → 기록/초기 커서/준비 |
| +0x284 | s32 CPU, 0 | 기존 cache 소비는 old §8.2; 설정 → Work/전체 PlayerWork |
| +0x288 | s32 rhythm difficulty, 0 | 설정 → RhythmWork mode |
| +0x290/+0x298 | motion/NEW Fiber*, 0/0 | 선택 흐름/목록 진입 → 삭제/중단 |
| +0x2a0/+0x2a1 | byte NEW 시작/중지, 0/0 | Start/StopObserve → observer |
| +0x2a4/+0x2a8 | s32 NEW 관찰 ID/목록 index, -1/0 | StartObserve → UpdateNewIcon |
| +0x2ac | s32 인원 변화용 cache, 1 | InitializeHumanNum·CheckHumanNumChanged → 팀 UI 재구성 |
| +0x2b0 | vector<MgRecord shared handle>, empty | DeserializeGameRecord → default record |
| +0x300 | null 종료 ARP scratch 목록 | GetArpList → 연출 요청·대기 |
| +0x630/+0x638 | 안내 Fiber*/skip byte, 준비 시 초기화 | PlayAnnounce·입력 → AnnounceUpdate |
| +0x658 | 112개 UI item handle, stride0x18 | InitializeMgList → 썸네일/NEW/Finalize |
| +0x10d8 | 잠금 안내 UI handle | InitializeMgList → AnnounceUpdate |
| +0x25f0 | s32 마지막 목록 type, -1 | ApplyChangeMgList·Cleanup → type 변경 검사 |
| +0x25f8/+0x2610/+0x2628 | 승패 표/scrollbar/header handles | InitializeMgResultList → history/Finalize |
| +0x2640 | s32 history scroll offset | flow 진입/반복 입력 → ApplyMgResultList |
| +0x2660 | TeamOrderData* | ApplySetting·인원 변화 → 팀 표시/값 범위 |
| +0x2668/+0x266c | s32 설정 cursor / byte favorite dirty | 설정 진입/입력 → cursor·목록 갱신 |
| +0x2670/+0x2674/+0x2678/+0x267c | s32 team/CPU/mode/rhythm 작업 값 | MgSettingFlow 진입·값 이동 → 종료 commit |
| +0x2680/+0x2684/+0x2688 | s32 mode/CPU/rhythm 물리 rule pane, 매 구성 -1 | ApplySetting → SearchValidCursorIndex/GetCursorPaneName |
| +0x26a8 | guide handle | InitializeMgList → 표시/취소 |
| +0x26c0/+0x26c4 | s32 다음/이전 선택 상태 | DecideMinigameFlow 루프 → 다음 분기 |

[판독] 초기값을 표에 적지 않은 UI/작업 필드는 각 Initialize/Apply 호출이 세운다. 실제 SceneParams가 기본값을 덮는지는 확인되지 않았다. Params 기본 `NewIconUpdateWaitTime`은12, property 범위1..120이다(`Params::createInstance` — mgm01 @0x7100003a64, `getPropertyList` — mgm01 @0x71000039b0).

### 4.2 JSON·목록 런타임 자료

| 구조 | 필드 [판독] | 자료/소비 |
|---|---|---|
| MgJsonData 0x48 | +0 MgName pointer, +8..+0x38 장르13개 s32, +0x3c SetLock, +0x40 SoloPlayOnly, +0x44 OfflinePlayOnly | `getPropertyList` — mgm01 @0x7100003ddc |
| MgFilterJsonData 0x44 | +0 FilterName char[16], +0x10 SortIdx s32, +0x14 LabelName char[48] | `getPropertyList` — mgm01 @0x71000041e0 |
| MgData 0x20 | +0 available byte, +8 JSON pointer, +0x10 ID s32, +0x14 lock reason s32, +0x18 record kind s32 | 152 slots; 초기 ID/reason/kind=-1, available=0; `FUN_7100020bc0` — mgm01 @0x7100020bc0 |
| filter row 0x28 | +0 enum, 목록 vector 영역 | SetupMinigameIdList → GetMgIdList |
| MgRecord 0x34 | +0 MgName char[32], +0x20 Stage, +0x24 Mode, +0x28 Format, +0x2c SortOrder, +0x30 InitialRecord | `getPropertyList` — mgm01 @0x7100003b84 |

[판독][데이터] 범위 밖 ID의 `GetMgData` — mgm01 @0x710001540c는 static default mgm01 @0x71000470d8을 반환한다(available0, ID/reason/kind=-1). `MgRecord`의 Achievement 관련 JSON 값은 이 property 목록에 없으며 여기서는 복원하지 않는다. `GetMgDefaultRecordScore` — mgm01 @0x710001c1f0는 이름이 같은 마지막 항목의 InitialRecord를 돌려주며 Stage/Mode로 추가 필터하지 않는다.

### 4.3 mgmrs::Scene·복구 Fiber

| 소유/오프셋 | 형·초기값 [판독] | writer → reader |
|---|---|---|
| mgmrs Scene 크기0x110 | SceneBase 파생 | createInstance/RTTI |
| Scene+0xe8 | RecreateSessionFiber*, 0 | SyncedSetupGame → GameFlow/CleanupGame |
| Scene+0xf0/+0xf8/+0x100 | loading UI handle, 0 | SetupGame → GameFlow |
| Scene+0x108 | s32 timeout, 30 | ctor/property → Fiber constructor |
| Scene+0x10c | s32 조작자 CharacterID, -1 | SetupGame → CleanupGame 복원 |
| Fiber+0x30/+0x34 | bool/TeamID, false/0 전달 | main ctor → 복구 흐름 |
| Fiber+0x40 | s32 failure 값, -1 | ctor/복구 흐름 → mgmrs 성공 검사 |
| Fiber+0x50 | s32 timeout, 전달 값 | main ctor → 복구 흐름 |

[판독] `RecreateSessionFiber::RecreateSessionFiber` — main @0x71002d30c0는 flag0x4a on, NetTransfer callback 등록, pause level8을 설정한다. 네트워크 재구성 내부와 기존 `StartSync`/`SessionFailedProcess` 상세는 재분석하지 않는다(`mgC_main_uitimer2.c` 재사용).

## 5. 상태 전이와 수명

### 5.1 UI 생성·활성·정리

| 단계 | 동작 [판독] | 완료 조건/다음 |
|---|---|---|
| 초기화 | List112 items, 필터3형식, Result3 handles, Setting, Telop, HumanNum | 데이터와 잠금 구성 후 첫 흐름 |
| 목록 진입 | inclLocked=true 목록, resume면 이전ID 탐색, cursor·크기·NEW 갱신, guide In·RegularIn | 공용 UI active/진입 애니 완료 |
| 목록 종료 | NEW fiber 삭제, history용ID 기억 또는 cancel guide Out, 창 Out·items reset | 공용 창 종료 애니 완료 |
| 설정 진입 | 현재 필터의 unlocked 목록 구성, 비면 현재ID fallback, ApplySetting/7 preview | resume면 Play cursor4, 아니면 첫 valid cursor |
| 설정 종료 | team/CPU/mode/rhythm commit, favorite dirty면 active 목록 재구성 | listback2 / random4 / play5 |
| 정리 | `CleanupGame` — mgm01 @0x7100009fb0 | Fiber·112 item/공용 UI handles 해제, 마지막 type=-1; FinalizeChara/Map/Message 호출 |

[판독] `FinalizeMgSetting` — mgm01 @0x710000a250, `FinalizeMgResultList` — mgm01 @0x710000a2a0, `FinalizeMgList` — mgm01 @0x710000a3a0, `FinalizeCourseNameTelop` — mgm01 @0x710000a490은 소유 handles의 해제를 담당한다. 3D 초기화/정리의 모델 내용은 다루지 않는다.

### 5.2 DecideMinigameFlow 상태

| 상태 | 진입·반복 동작 [판독] | 전이 조건 → 다음 |
|---|---|---|
| 0 | 처음 필터 MgAll 구성 | 준비 →2 |
| 2 | `MgListFlow` — mgm01 @0x7100010560 | Y→3, A/X 성공→4, B→7; 그 외 목록 계속 |
| 3 | `MgResultListFlow` — mgm01 @0x71000109b0 | B로 닫기→2 |
| 4 | `MgSettingFlow` — mgm01 @0x71000110b0 | 랜덤4→4 재구성, 뒤로2→2, Play5→5 |
| 5 | `CheckConditionGyroMg` 분기만 | 허용→6, 설정 필요/불가→4 및 resume=1 |
| 6 | motion flow 정리 | →8 |
| 7 | motion/NEW 흐름 정리 | →9 |
| 8 | `MgStartFlow` | child Scene 요청 후 Sleep(-1); 이 flow에서 정상 반환하지 않음 |
| 9 | 선택 flow 종료 | 바깥 MinigameModeFlow의 Exit |

[판독] 처음 상태는 `resume * 2`다. 상태1의 고유 case는 없고 비정상 값은 종료 갈래로 간다. `DecideMinigameMotionFlow` — mgm01 @0x710000f6c0는 별도 배경 Fiber로 움직이며 목록/설정 입력의 독립적인 완료 barrier로 쓰이지 않는다.

### 5.3 3D 대기 지점과 대체 신호

[판독] 다음은 flow가 실제로 기다리는 조건만이다. ARP0..3은 각 플레이어, ARP4는 네 플레이어 묶음, ARP5는 별도 한 actor이며 나머지는 `GetArpList` — mgm01 @0x710000b360의 묶음 번호로 보존한다. 캐릭터/맵 이름을 추정하지 않는다.

| 함수·주소 [판독] | 기다리는 대상/조건 | 3D 없이 필요한 값 [추정][웹 이름] |
|---|---|---|
| `EnterFlow` — mgm01 @0x710000c4a0 | course 텔롭 표시 후2.0초, 해당 갈래의 닫힘 완료; ARP7 첫 IsMotion=false | `courseTimer`, `courseTelopClosed`, `arp7MotionDone` |
| `StartFlow` — mgm01 @0x710000d4c0 | ARP4의 모든 IsAction=false | `allPlayerActionsDone` |
| 같은 함수 | 안내 MessageFlow 완료, ARP7 첫 IsMotion=false | 기존 메시지 완료 + `arp7MotionDone` |
| 같은 함수 후반 | ARP8 첫 IsMotion=false | `arp8MotionDone` |
| `ContinueFlow` — mgm01 @0x710000dad0 | 이어질 motion 요청·idle 설정 후1회 Fiber::Wait | `nextTick`; 긴 actor 완료 기다림은 없음 |
| `MgStartFlow` — mgm01 @0x7100011a50 | ARP5 첫 IsAction=false, ARP0 첫 IsMotion=false | `guideActionDone`, `player0MotionDone` |
| 같은 함수 | GetDeltaTime 누적1.0초 → FadeOut1.0초 → fade animation 종료 | `startTimer`, `fadeDone`; 서로 다른 두 단계 |
| `ExitFlow` — mgm01 @0x710000e2c0 | 기존 연출/보상 대기 표는 old flow §5.2; 이번 첫 callback은 fade 종료 | `fadeDone` 추가; 기존 `motionDone/frameMax/rewardDone` 계약 참조 |

[판독] EnterFlow의 actor frame300/320 등은 SetMotionFrameCallback 등록 값이며 flow의 frame 도달 대기 조건이 아니다. 텔롭 첫 개방 achievement0x3d의 unlock은 닫힘 완료 후 이루어지는 갈래가 있다. `OpenCourseNameTelop` — mgm01 @0x710000f100, `CloseCourseNameTelop` — mgm01 @0x710000f260, `WaitCloseCourseNameTelop` — mgm01 @0x710000f380이 고유 호출이고, 공용 창의 In/Out 구현은 old 공용 문서를 참조한다.

[추정] 포팅에서는 각 신호를 즉시 완료 또는 별도 timer로 제공할 수 있지만 선택은 명세에 표시한다. actor frame300/320을 UI300/320프레임으로 치환하거나 frameMax의 원본 클립 길이를 임의로 확정하지 않는다.

### 5.4 mgmrs 전체 수명

| 상태 | 함수·모듈 주소 [판독] | 완료·다음 |
|---|---|---|
| 생성 | `Scene` — mgmrs @0x71000039fc | §4.3 기본값 |
| 준비 | `SetupGame` — mgmrs @0x7100003ab8 | fade 비활성, Entity `loading_ui`, Parts.lyt의 `sys_tlp_loading_00.bflyt`, order0x9aff; `sys_syncWait_dlg`·icon normal·in; 조작자 char 저장 |
| 동기 준비 | `SyncedSetupGame` — mgmrs @0x7100003e5c | RecreateSessionFiber(false, TeamID0, Scene timeout) 생성 |
| 대기 | `GameFlow` — mgmrs @0x7100003f80 | fiber 없으면 반환; StartSync 후 IsCompleted까지 매 tick Wait |
| 성공 | 같은 함수, fiber+0x40==-1 | UI out, MainModule SetPause/CancelPause(공유 DAT의 상위s32), RequestReturnScene; UI out 완료 기다림은 없음 |
| 실패 | 같은 함수, 그 외 | SessionFailedProcess 호출 후 계속 Wait |
| 정리 | `CleanupGame` — mgmrs @0x7100003ec8 | fiber 삭제; 조작자 현재 CharacterID와 BaseCharacterID를 저장한 char로 복원 |

[데이터] `sys_syncWait_dlg`의 고유 문자열은 mgmrs @0x71000136ba, in/out은 mgmrs @0x71000136d7 / mgmrs @0x71000136b6이다. [판독] pause argument는 가변 전역 `DAT_7100019ad0`의 상위32비트에서 읽으므로 파일의 초기0을 항상0인 상수로 대입하지 않는다.

[판독] mgmrs는 Scene17개와 Params7개의24개 함수를 모두 읽었다. 빈 override·RTTI·생성/삭제 함수까지의 정확한 열거는 §10.1의 inventory다. DummySymbolLink는 별도 linker 함수로 집계한다.

### 5.5 DecideMinigameFlow 전이·연출 (보강 2026-10-07)

[판독] 기존 C(`MgListFlow` — mgm01 @0x7100010560, `MgResultListFlow` — mgm01 @0x71000109b0, `MgSettingFlow` — mgm01 @0x71000110b0, `PrepareMgListFlow` — mgm01 @0x71000160b0, `DecideMinigameFlow` — mgm01 @0x710000df80)를 다시 읽어 전이마다 창·안내·소리를 모았다. "목록 창" = `mgm01_base_freeplay_00`(공용 창), "Back 안내" = `UIBackGuide`(ComUiGuide00 위치 0x11=17, `sys_ctrl_back`), "랜덤 안내" = `UIOmakaseGuide`(위치 0xb=11, 2칸 `mgm01_ctrl_buttonGuide00/01`) — 둘 다 `SyncedSetupGame`에서 만든다(`mgmet_mgm01_consume.c`).

| 전이 | 조건·입력 | 창·안내·소리 [판독] |
|---|---|---|
| 0→2 | 처음(resume0) | 필터 index0(MgAll) 목록 |
| 2 진입 | `PrepareMgListFlow(-1, null)` | 목록 구성 → 커서 복원(resume면 저장 ID의 위치, 아니면 0) → 목록 창 `in(imm = resume)`(복귀면 in 애니 없이 바로 normal) → Back 안내가 Idle 아니면 In → 창 active·열림 끝까지 대기 → resume0 |
| 2→4 | 결정(A) 성공 또는 랜덤(Y) 성공 | 커서 항목 press(목록 결정은 `SQ_SE_MGM01_DEC`+FX, 랜덤은 `SQ_SE_MGM01_DECI_S`+FX) → `isCursorItemAnimating` 대기(항목 레이아웃 갈래라 사실상 즉시, mgm_common 6.6) → 목록 창 out → 다 닫힐 때까지 → `ResetMgItem` |
| 2→3 | X(0x4) | `SQ_SE_MGM01_DECI_S`+FX, 선택 ID = 커서 칸 ID → 목록 창 out → ResetMgItem |
| 2→7 | B | `SQ_SE_MGM01_CANCEL` → Back 안내 Out → 목록 창 out → ResetMgItem |
| 3 | 승패 표 | 제목·표 창 in → 입력(§6.2) → B면 `SQ_SE_MGM01_CANCEL` → 두 창 out·닫힘 대기 → **resume1** →2 |
| 4 진입 | 설정 | resume면 커서 Play(4)·resume0·Back 안내 In, 아니면 첫 valid. **직전 상태가 4가 아니면** 랜덤 안내 In. 설정 창 in(0) |
| 4→2 | 첫 항목에서 B | 랜덤 안내 Out → 설정 창 out → resume1 (§6.2) |
| 4→4 | 랜덤(Y) | 안내 그대로 → 설정 창 out → 다시 4(직전=4 이므로 랜덤 안내 In 생략) |
| 4→5 | Play 결정 | 랜덤 안내·Back 안내 Out → 설정 창 out |
| 5→6 | `UseGyro`가 아니거나 `SetGyroFlow` 성공 | (5→4: 자이로 설정 실패면 resume1) |
| 6→8, 7→9 | 연출 정리 | ARP4/5 ClearLook·IdlePlane; 7은 모션·NEW Fiber 삭제 |
| 8 | `MgStartFlow` | §3.2·5.3(1.0초 → FadeOut 1.0초 → 한 판 호출, 돌아오지 않음) |

[판독] 목록이 비었을 때(빈 즐겨찾기) `MgListFlow`는 X·B만 받는다(Y·A·방향 없음, 필터 L/R은 받음). X/A 처리 뒤에도 같은 프레임에 필터 L/R 검사를 하고, trig>1 이면 잠금 안내 skip(+0x638)을 세운다. 목록 루프는 창이 active·열림/닫힘 중 아님일 때만 입력을 읽는다.

## 6. 계산식·조건·의사코드

### 6.1 목록·필터·순서·배치

| enum | FilterName·한국어 [데이터] | 포함 수 | SortIdx |
|---|---|---|---|
| 0 | MgAll·전부 |112|1|
| 1 | Mg4vs·4인 대전 |29|2|
| 2 | Mg1vs3·1 vs 3 |12|3|
| 3 | Mg2vs2·2 vs 2 |12|4|
| 4 | MgDuel·듀얼 |5|5|
| 5 | MgItem·아이템 |5|6|
| 6 | MgChallenge·챌린지 |10|7|
| 7 | MgBoss·보스 |5|8|
| 8 | MgGyro·체감 |15|9|
| 9 | MgEndless·엔드리스 |5|10|
| 10 | MgAthlon·쿠파 애슬론 |14|11|
| 11 | MgBusters·쿠파 버스터즈 |10|12|
| 12 | MgRhythm·리듬 쿠킹 |10|13|
| 13 | MgFavorite·즐겨찾기 |runtime|14|

[판독] 각 게임은 장르 column>0일 때 포함되고 column의 양수 값 오름차순이다(`SetupMinigameIdList` — mgm01 @0x7100008e70, sort `FUN_7100022380` — mgm01 @0x7100022380). 필터는 SortIdx 오름차순이다(`FUN_71000211c0` — mgm01 @0x71000211c0). 즐겨찾기는 available이고 Work favorite인 게임을 모은 뒤 MgAll column으로 정렬한다(`SetupMinigameIdList_Favorite` — mgm01 @0x710001bf40, `FUN_7100023590` — mgm01 @0x7100023590). 즐겨찾기 선택 순서가 저장 순서는 아니다.

[판독] `GetMgIdList` — mgm01 @0x7100011f10는 inclLocked=true면 모든 항목, false면 reason==-1만 반환한다. `GetFilterIndex` — mgm01 @0x7100012170는 enum의 표시 index를 찾고, `GetMgListFilterNextIndex` — mgm01 @0x7100012214는 ±1에 양수 modulo를 적용한다.

| N 목록 크기 | type [판독] | 형식 [데이터: mgm01 @0x710004f668, stride0x20] | cols×rows | thumbnail size index |
|---|---|---|---|---|
| 33..112 |0|x_filter_00|14×8|2|
| 16..32 |1|x_filter_01|8×4|1|
| 0..15 |2|x_filter_02|5×3|0|

[판독] `ApplyChangeMgList` — mgm01 @0x71000148f0는 이 형식을 고르고112 handles 중 사용하지 않는 것을 숨긴다. 목록은 이 grid 한 장이며 목록 paging/scroll offset은 없다. 결과 표의 스크롤과 혼동하지 않는다. `ApplyChangeMgList2` — mgm01 @0x7100015550는 1회 Wait 뒤 title 측정폭+40, board폭+32, tooltip 화면 경계-960..960 보정과 NEW 관찰을 적용한다. 빈 즐겨찾기 전용 문구는 enum13 && N==0이다.

### 6.2 입력 표와 우선순위

[판독] trig는 trigger, rep는 공용 반복 생성 결과다. 비트의 물리 버튼 정의·owner 선택은 old mgm_common §6.10을 사용한다. 아래 exact는 마스크가 **그 값과 같을 때**이며 여러 비트 동시입력과 단일 버튼을 구별한다. UI active와 진입/종료 상태 검사로 잠긴 프레임에는 다음 처리를 하지 않는다.

| 화면 | 입력 [판독] | 반복 사용 | 동작·우선순위 | 함수 주소 mgm01 |
|---|---|---|---|---|
| 목록 | exact trig8 X | 아니오 | unlocked 현재 필터 랜덤→설정4; 후보0이면 ERROR | mgm01 @0x7100010560 / mgm01 @0x71000164c0 |
| 목록 | exact trig1 A | 아니오 | enabled면 설정4; locked면 ERROR·진동·안내, 계속 목록 | mgm01 @0x7100016378 |
| 목록 | 방향 rep | 예 | up bit11/17, down10/19, left8/16, right9/18; grid 이동 | mgm01 @0x71000166ec |
| 목록 | exact trig4 Y | 아니오 | 승패 표3 | mgm01 @0x7100016950 |
| 목록 | exact trig2 B | 아니오 | 취소7 | mgm01 @0x7100016924 |
| 필터 | exact rep0x10/0x40, 0x20/0x80 | 예 | 이전/다음; 목록 결정·방향 처리 다음에 검사 | mgm01 @0x71000169a0 |
| 설정 | exact trig1 A | 아니오 | 다음 valid 항목; Play에서 press 완료 후5 | mgm01 @0x71000110b0 / mgm01 @0x710001ac70 |
| 설정 | exact trig2 B | 아니오 | 이전 valid 항목; 첫 항목이면2로 목록 복귀·resume1 | mgm01 @0x710001afc0 |
| 설정 | exact trig4 Y | 아니오 | 현재 게임 favorite toggle | mgm01 @0x710001b560 |
| 설정 | exact trig8 X | 아니오 | unlocked 게임 랜덤, 성공4로 설정 재구성 | mgm01 @0x710001b2b0 |
| 설정 | trig 0x100/0x10000, 0x200/0x40000 | 아니오 | 이전/다음 valid 설정 항목; 끝 clamp | mgm01 @0x71000110b0 |
| 설정 | exact rep0x10/0x40, 0x20/0x80 | 예 | 이전/다음 미니게임; 선택 배열 modulo | mgm01 @0x710001b7a0 |
| 설정 | trig 0x400/0x80000, 0x800/0x20000 | 아니오 | 현재 항목 값 -1 / +1 (down / up) | 기존 `MgSettingFlow_RuleSetting` mgm01 @0x710001bbf0 |
| 결과 | exact rep0x100/0x10000, 0x200/0x40000 | 예 | scroll offset -1 / +1, 범위[0,max(count−8,0)] | mgm01 @0x71000109b0 |
| 결과 | trig2 B | 아니오 | CANCEL, 닫기→목록2 | mgm01 @0x71000109b0 |

[판독] 목록은 X/A를 먼저 처리하고 그 외 방향→Y/B→필터를 검사한다. 잠금 안내가 떠 있을 때 trig>1은 Scene+0x638 skip도 세운다. 설정은 A→B→Y→X→방향/게임 이동/값 이동 순으로 분기한다. 결과 이동에는 SE 호출이 없고 닫기에 CANCEL이 있다. 동시입력은 각 원본 조건 그대로 적용한다.

정정(2026-10-07, 목록 본체 구현): 위 표의 버튼 **이름** X/Y 가 뒤바뀌었다. 비트는 그대로이고 bex 0x8 = **Y**, 0x4 = **X**다([online.md](online.md) 4.9 정정). 목록 안내 문구도 맞는다: `mgm01_ctrl_mgChoiceFp00` = U+E001(Y) 랜덤, `…Fp01` = U+E002(X) 승패 표, 설정 `mgm01_ctrl_buttonGuide00` = E001(Y) 랜덤·`…01` = E002(X) 즐겨찾기 [데이터: 문구 글리프]. 따라서 목록 trig 0x8 = Y 랜덤, trig 0x4 = X 승패 표, 설정 trig 0x4 = X 즐겨찾기, trig 0x8 = Y 랜덤 [판독].
정정(2026-10-07): 목록 SE — 결정 성공 `SQ_SE_MGM01_DEC`(§7 표의 "DECI" 아님), 잠금 결정 `SQ_SE_SYS_ERROR`+진동+`PlayAnnounce(reason)`(항목 press_ng 는 Decide 가 먼저 재생), 승패 표 `SQ_SE_MGM01_DECI_S`+FX, 취소 `SQ_SE_MGM01_CANCEL`, 랜덤 성공 `SQ_SE_MGM01_DECI_S`+FX(그 칸으로 MoveCursor 후 Decide=press), 랜덤 후보 0 `SQ_SE_SYS_ERROR`+진동, 커서 이동 `SQ_SE_MGM01_CUR`(PlaySe2D, 새 커서 항목 페인 위치)+FX, 필터 `SQ_SE_MGM01_DECI_LR`(PlaySe2D, `x_cursor_LR/x_text_L`·`_R`)+FX [판독: `MgListFlow_*` mgm01 @0x7100016378~0x71000169a0].

### 6.3 끝 행과 래핑·랜덤

[판독] 목록 grid는 단순 `mod(cursor + dy*cols + dx,N)`만 사용하지 않는다. `Q=(W−N%W)%W`는 마지막 행의 빈칸 수다. fresh는 `(trig & 0xf0f00)!=0`이다. fresh가 아니면 위/아래 끝과 해당 행의 왼쪽/오른쪽 끝을 넘는 이동을 먼저 차단한다.

```text
t = cursor + dy*W
if t < 0:  t = (t < -Q) ? t+Q : t-(N%W)
if t >= N: t = (t-N < Q) ? t+(N%W) : t-Q
next = positiveModulo(t+dx, N)
if changed: CUR_2D, FX, MoveCursor, StartObserveNewIcon
```

[판독] `MgListFlow_RandomSelect` / `MgSettingFlow_RandomSelect`는 현재 필터의 **unlocked** 후보에서 `SyncRandRange(0,N)`을 호출한다. 후보0이면 -1 반환이다. 목록은 ERROR, 설정은 DECI_S/FX를 먼저 실행하고 후보0 검사를 한다. 랜덤 후보가 full visible 목록에서 어느 index인지 다시 찾아 cursor/관찰을 옮긴다.

[판독: 어셈블리] 두 랜덤 함수 C에는 `SyncRandRange` 상한 인자가 누락됐다. mgm01 @0x71000165bc / mgm01 @0x710001b480의 x2가 `(end−begin)>>2`이고 하한0임을 확인했다. RNG 알고리즘 자체를 다시 판독하거나 웹 Math.random과 동일하다고 가정하지 않는다.

### 6.4 잠금·NEW 조건 표

[판독] lock condition의 순서는 SetLock → OfflinePlayOnly → SoloPlayOnly → MgBusters/접속 인원이다. 잠금 계산 때 Work `SetUnlock`도 갱신한다. 인원은 이 함수가 **직접 type==0**을 센 값이며 §8의 이름이 다른 GetHumanPlayerNum을 대신 넣지 않는다.

| 조건 | reason·표시 [판독] | 근거 데이터 [데이터] | 웹에서 필요한 값 [추정][웹 이름] |
|---|---|---|---|
| SetLock && !Mgm06IsOpen && PlayCount==0 |0, placeholder 이름/thumbnail, disabled; NEW 숨김 | boss5개: mg1703/1705/1702/1701/1704 | `bossOpen`, `playCount[id]` |
| OfflinePlayOnly && session connected |2, 원래 게임 표시+disabled, announce01 | 리듬10개 | `connected` |
| SoloPlayOnly && 실제 사람 수>1 |1, disabled, announce00 | JSON14개 | `actualHumanCount` |
| MgBusters>0 && connected && type0 사이 동일 ConstantID 존재 |3, disabled, announce02 | MgBusters10개+PlayerWork ConstantID | `sameAccountPlayers` |
| 위 조건 없음 |reason=-1, enabled | 초기 reason=-1; SetUnlock(true) | `unlocked[id]` |
| Work IsNew && reason!=0 | NEW 표시 가능 | Work new + 잠금 reason | `new[id]` |
| 관찰 타이머 > Params wait | NEW 소비 | GetDeltaRate 누적, 기본wait12 | `deltaRate`, `newWait` |
| NEW 소비 commit | Work SetNew(false), save MG+4 bit0 clear, pane hide | UpdateNewIcon consume=true | 원래 save flags byte |

[판독] `CheckMinigameLockCondition` — mgm01 @0x7100009990, `IsNewIcon` — mgm01 @0x710001ca70, `IsMinigameLocked` — mgm01 @0x710001cae0가 조건 근거다. 잠금의 후자 getter는 Work IsUnlock의 반전이며 목록 enabled의 reason 검사와 저장 위치가 다르다. 잠긴 게임을 목록에서 지우는 대신 disabled로 남기는 inclLocked 계약을 유지한다.

[판독] `CreateNewIconObserver` — mgm01 @0x71000162a0가 Fiber를 만들고 `FUN_71000247f0` — mgm01 @0x71000247f0가 시작/중지 flags를 소비한 뒤 타이머를 누적한다. `StartObserveNewIcon` — mgm01 @0x7100015be4, `StopObserveNewIcon` — mgm01 @0x7100015160, `UpdateNewIcon` — mgm01 @0x7100015940가 ID/index를 사용한다. 비교는 `wait < accumulatedRate`다. threshold12에 정확히 도달한 순간에는 소비하지 않는다. GetDeltaRate 단위와 원본 실행속도 없이 “12초”로 바꾸지 않는다.

### 6.5 개별 설정·기록

| 논리 cursor | 표시 조건·값 [판독] | 소비 |
|---|---|---|
|0 team|TeamOrder 후보 수>1, index0..count−1|SetupPlayInfo 팀 구성|
|1 CPU|IsComLevelAdjustable, index0..3|PlayerWork ComLevel·Work/Sync CPU|
|2 mode|ID {4,5,9,11,21}에서 mode item 표시, 0..1|normal/endless flag·record selector|
|3 rhythm|JSON OfflinePlayOnly && GameRule10, 0..1|RhythmWork mode|
|4 Play|항상 valid|press 뒤 시작|

[판독] `ApplySettingMgSetting` — mgm01 @0x7100017180는 favorite·장르/이름/설명/thumbnail/횟수를 표시하고, 보이는 CPU/mode/rhythm을 물리 rule pane0부터 차례로 넣는다. hidden 슬롯은 -1이다. `SearchValidCursorIndexMgSetting` — mgm01 @0x710001a740는 요청 값 이상/이하의 가장 가까운 valid index를 고르며 끝에서 clamp한다. `GetCursorPaneNameMgSetting` — mgm01 @0x7100018630는 team=`x_rule/x_team_00`, Play=`x_rule/x_play_00`, 나머지=계산한 rule pane다.

[판독] `IsComLevelAdjustable` — mgm01 @0x71000180a0는 GameRule8/10/11/12/13에서 false, duel3에서 type0 사람≥2면 false, 그 외 type1 CPU가 존재하면 true다. 값 이동이 경계에서 변하지 않으면 SE를 울리지 않는다. CPU pane UV의 t는 `index*0.25`다(`UpdateCpuPane` — mgm01 @0x7100019f00). `UpdateTeamPane` — mgm01 @0x7100018ab0, `UpdateRulePane` — mgm01 @0x710001a240, `UpdateRhythmDfficultyPane` — mgm01 @0x710001a480가 각 표시를 갱신한다.

[판독] `ApplyListMgSetting` — mgm01 @0x7100018230는 현재 후보의 선택 index−3..+3을 modulo로 감아7개 thumbnail을 표시한다. N>1일 때만 미니게임 LR 안내를 표시한다. 이것은 목록112개 grid의 paging이 아니다.

[판독][실행: 변환] 기존 C `mgmet_main_more.c`의 `FUN_71001ee130` — main @0x71001ee130은 TeamOrderData15개를 초기화한다. 이를 다시 디컴파일하지 않고 `web/tools/analysis/mgm01_team_table.py`로 packed int와 vector 초기화문을 변환해 `analysis/mgm01_team_table.json`을 만들었다. 각 row의 +0은 table index, +4는 표시 format, +8부터 후보 vector다. 후보의 숫자는 플레이어 목록의 **위치**이며 PlayerID와 항상 같다고 대입하지 않는다.

| table index | format·표시 [판독] | 후보 수·위치 순서 [실행: 변환] |
|---|---|---|
|0|0, x_vs4|1: [0,1,2,3]|
|1|4, x_1vs3|4: [0,1,2,3], [1,0,2,3], [2,0,1,3], [3,0,1,2]|
|2|5, x_2vs2|3: [0,1,2,3], [0,2,1,3], [0,3,1,2]|
|3/4|6, x_1vs1|각1: [0,1]|
|5|6, x_1vs1|3: [0,1], [0,2], [1,2]|
|6|6, x_1vs1|6: [0,1], [0,2], [0,3], [1,2], [1,3], [2,3]|
|7/8/9/10|3, x_vs1|각1/2/3/4: [0]부터 [해당 마지막 위치]까지 각각 한 명 선택|
|11|3, x_vs1|1: [0]|
|12|2, x_vs2|1: [0,1]|
|13|1, x_vs3|1: [0,1,2]|
|14|0, x_vs4|1: [0,1,2,3]|

[판독] format과 pane 연결은 `UpdateTeamPane` — mgm01 @0x7100018ab0의 visibility 비교다. 실제 초기 네 자리의 사람/CPU 구성에 따라 duel/single 선택 수가 달라지므로 팀 설정에 고정6개를 넣지 않는다.

| record kind | ID [판독] | 표시·숫자 형식 |
|---|---|---|
|-1|그 외|highscore 숨김|
|0|24|Number0 정수, highscore01|
|1|10|record/100, record%100 → `%01d.%02d`, highscore02|
|2|3,12,15,16|분/초/소수 문자열 Text0/1/2, highscore03|
|3|4,5,9,11,21|endless일 때만 같은 시간 형식, highscore03|
|4|79..83,86..90|Text0 정수 문자열, highscore04|

[판독] kind는 `SetupMinigameData` — mgm01 @0x710001ca20, 표시는 `ApplySettingMgSetting_HighScore` — mgm01 @0x7100017ba8에서 결정한다. kind2/3은59999로 cap 후 MGRecorder의 Minute/Second/Decimal helper를 호출한다. 기본 기록 JSON20항목은 초기값 경로이며 현재 기록 getter와 별개다.

[판독: 어셈블리] 위 C는 GetRecord index와 kind0 SetIntVariable 값 인자를 누락했다. `mgm01_dis_record.c`에서 MGRecorder::GetRecordIdx(id,0,kind==3) 결과가 GetRecord의 w1로 전달되는 것을 mgm01 @0x7100017d2c에서 확인했다. GetRecord 결과는 w20에 보관하고 mgm01 @0x7100017e18에서 w2로 전달해 Number0에 삽입한다. 임의의 기본 기록값을 화면 숫자라고 가정하지 않는다.

### 6.6 승패 표·100판 ring

[판독] Work의 Round는 s32 +0이고 결과는 +0xc부터100개, stride0xc다. `SetMinigameResult` — main @0x71001f0460는 `slot=(Round−1)%100`에 ID(+0), judge(+4), 네 결과 byte(+8..+0xb)를 쓴다. **Round를 증가시키지 않는다.** `SetRound` / `GetRound` — main @0x71001f0440 / main @0x71001f0448가 별도 setter/getter다.

[판독] main `FUN_71001f271c` — main @0x71001f271c에는 Round 증가·GameWork/PlayerWork로 마지막 결과 쓰기가 함께 있다. 다만 이번 xref 자료에는 직접 호출자가 잡히지 않았으므로 이 함수를 한 판 종료의 실제 실행 caller라고 확정하지 않는다. 외부 종료 측에서 Round>=1을 만들고 결과를 쓴다는 boundary 요구와 실행 시점을 구별한다.

```text
count = min(Round,100)
earliest(index) = ring[Round>=100 ? (Round+index)%100 : index]
initialScroll = max(0,count-8)
for visible slot i=0..7:
    row = earliest(scroll+i)
    if row exists: show game and four result animations
    else: hide
scores[4] = 0
for latest up to100 valid ID rows:
    for player p: if row.byte[p] == (row.judge != 0): scores[p]++
```

[판독] getter 근거는 `Mgm01GetMinigameResultFromEarliest` — main @0x71001f2a24, `Mgm01GetMinigameResultViewCount` — main @0x71001f2a64, `Mgm01GetMinigameResultScore` — main @0x71001f2a80다. 결과 raw byte2/255는 bool로 바꾸지 않는다. `FUN_71001f271c`에는 일부 GameRule8/10의 비참여 값을 judge에 따라255/2로 채우는 경로도 있다.

[판독: 어셈블리] `ApplyMgResultList` — mgm01 @0x7100016cc0의 C는 Earliest index 인자가 빠지고 raw byte가 bool로 변환된 것처럼 보였다. 덤프 mgm01 @0x7100016e54에서 `scroll+i`, mgm01 @0x7100016ef0에서 raw byte와 `(judge!=0)`의 비교를 확인했다. 일치면 `win_normal`, 그 외 `normal`이다. scrollbar는 count>8일 때 표시하고 정규 위치는 `scroll/(count−8)`이다.

### 6.7 목록 본체 — 3형식·배치·항목 표시·커서 (보강 2026-10-07)

[판독] 목록은 공용 창 하나에 **3행 × 112열** 메뉴다: `InitializeMgList` vt+0x268(3, 0x70, wrap=1, check=0), 애니 세트 `MgListMenuAnime`(mgm_common 4.1), `InitializeMgFilter` — mgm01 @0x7100014330 가 `SetupItemMenu(행 = type, 열 = i, "x_thum_0{type}_{표[type][i]:02}")`. 커서 = (type, i), 창 +0x7c(cursorCol) = 목록 위치 i. 목록 위치 i 는 **행 우선 화면 순서**(행 = i / W, 열 = i % W)이고, 표는 그것을 레이아웃 페인 번호로 바꾼다(레이아웃 페인 번호가 열 우선·불규칙이라서). 항목 레이아웃 `MinigameListItem%03d`(112개, `mgm01_thum_00`)의 k번째를 현재 type 의 k번째 칸에 Hook 한다(목록 위치 = 항목 레이아웃 번호).

| type | N 범위 | 창 페인 [판독: 어셈블리 `null_all/%s`] | 칸 수 | 열 W × 행 [데이터 mgm01 @0x710004f668 +8/+0x10/+0x14] | 썸네일 크기 S (+0x18) | 칸 간격·기준 [데이터: 레이아웃] | 항목 그림 `win_S_0` / 커서 `win_S_1` |
|---|---|---|---|---|---|---|---|
|0|33..112|`x_filter_00`|112|14 × 8|2|130 × 89, x −845..845, y +135|162×108 ×0.75 / 200×114|
|1|16..32|`x_filter_01`|32|8 × 4|1|227 × 139, x −794..794, y +160|216×128 / 288×166|
|2|0..15|`x_filter_02`|15|5 × 3|0|354 × 212, x −708..708, y +120|342×200 / 400×228|

[데이터] 위치→페인 표: type0 = mgm01 @0x71000466d8(u32 112개: 0,8,16,24,31,38,45,52,59,66,73,80,87,94 / 101,1,9,17,… / … / 7,15,23,108,109,110,111), type1 = mgm01 @0x7100046898(u32 32개 = 열×4+행), type2 = 인라인 15개(0,3,6,9,12,1,4,7,10,13,2,5,8,11,14 = 열×3+행). 표 전체는 웹 `listView.ts` 상수로 그대로 옮겼다.

[판독] 목록 구성은 페이징·스크롤이 없다(112 = 14×8 한 장). 형식은 N 으로만 고른다(§6.1).

`ApplyChangeMgList` — mgm01 @0x71000148f0 항목 표시 [판독, 페인 이름은 판독: 어셈블리 `x_game_%d_0` @0x7100014c38 등]:

```text
NEW 관찰 중지(+0x2a0 = {0,1}, ID −1)
이전 type 의 칸에서 항목 레이아웃 Remove; type = N≥33?0 : N≥16?1 : 2; 새 type 의 칸 0..count−1 에 항목 k Hook
for i < N:  id = 목록[i]; d = MgData(id)
  tex  = d.reason==0 ? GetTextureInfo("mgboss^o") : GetThumbnail(id,0)      // §7.1
  name = d.reason==0 ? "mgm01_ui_mgNameNone"     : "im_<MGList 이름>_name"
  항목.x_game_S_0·x_game_S_1 재질 텍스처 칸1 = tex
  항목.x_mes_0S/x_text_00 = mgm01_ui_mgNameBig, Text0 = name
  항목.x_heart_0S 부품 = favorite ? "normal" : "off"
  항목.x_win_00/01/02 보임 = (type==2 / ==1 / ==0)
  창.setItemVisible(type,i,1)
  if d.reason != -1: (reason==0 이면 항목.x_gray_S_0·_1 숨김) 창.setItemEnable(type,i,0)
for N ≤ i < count: 창.setItemVisible(type,i,0)
for count ≤ k < 112: 항목 레이아웃 k 숨김
null_all/x_filter_0T 보임 = (T==type);  x_no_favorite 보임 = (enum13 && N==0);  창 x_text_00 = 필터 LabelName
```

[판독] `ApplyChangeMgList2` — mgm01 @0x7100015550: 1 프레임 Wait 뒤 i < N 마다 이름 말풍선 너비 = 글자 폭+40(`x_mes_0S/x_base_00` 창 크기), `x_bd_00` = 그것+32, 칸의 전역 X(창 ComUiBase vt+0xb8, [추정: 페인 전역 X]) 에서 bd/2 를 빼고 더해 화면 −960..960 을 넘는 만큼 `x_mes_0S/x_00` 를 반대로 옮긴다(넘지 않으면 원래 위치); 이어 `UpdateNewIcon(id,i,0)`(NEW 보임 → `x_new_%02d`(S) 보이고 `normal`, 아니면 숨김). 마지막에 커서 칸 ID 로 NEW 관찰을 시작(IsNew && reason≠0, 아니면 관찰 중지).

[판독] 커서·정리:
- `MoveCursor(i, imm)` — mgm01 @0x7100015f5c: 창.setCursor(type,i,imm), 새 커서 항목 레이아웃 우선순위 101, 옛 커서 100(커서 항목이 위에 그려짐).
- `ResetMgItem` — mgm01 @0x7100015ca0: 창.setCursor(type,−1,1), 옛 커서 100; 112개 항목 모두: 보임 → setItemEnable(type,i,1) → 우선순위 100 → `x_gray_S_0/_1` 보임 → 숨김. (회색 페인은 평소 보이고 알파는 `*_ng` 애니가 움직인다 — reason0 자리 그림만 숨겨 회색을 덮지 않는다.)
- `PrepareMgListFlow(index, anim)` — 필터 index(−1 이면 현재) 목록 구성 → resume 이면 저장 ID(+0x278)의 위치, 없거나 resume0 이면 0 → ApplyChangeMgList → N>0 이면 MoveCursor(위치, imm=1) → ApplyChangeMgList2 → `x_cursor_LR` 부품 "normal" → anim 이 null 이면 창 in(imm=resume) 과 Back 안내 In·열림 대기, 아니면 창 PlayAnimation(anim)·끝까지 대기.
- 필터 L/R(`MgListFlow_MoveFilter` — mgm01 @0x71000169a0): SE·FX → 창 `left/right_select_00` + `x_cursor_LR` `left/right_select` → 창 애니 끝까지 대기 → ResetMgItem → index ±1(양수 modulo, 방향 표 mgm01 @0x710004f6c8 {−1, +1}) → `PrepareMgListFlow(index, "left/right_select_01")`. **필터를 바꾸면 resume 이 0 이므로 커서는 0번**이다.
- 이동(`MgListFlow_MoveCursor`) 은 §6.3 그대로이고 W = 형식 표의 열 수(+0x10)다. 바뀌면 CUR·FX·MoveCursor(i,1)·새 칸 NEW 관찰.
- 목록에서 승패 표(3)로 나갈 때 커서 칸 ID 를 +0x278 에 둔다 → 승패 표가 resume1 → 돌아오면 그 칸에 커서. 설정(4)은 +0x278 = 결정한 ID 이고 설정 안에서 게임을 넘기면 +0x278 도 바뀐다 → 설정에서 B 로 오면 마지막에 본 게임 칸. 한 판 뒤에는 ContinueFlow 가 ModeData 의 filter·ID 를 되돌리고 resume1.

[판독] 개별 설정 화면의 썸네일·문구 페인(보강, 판독: 어셈블리 `ApplySettingMgSetting` mgm01 @0x7100017180, `ApplySettingMgSetting_HighScore` @0x7100017ba8, `ApplyListMgSetting` @0x7100018230):
- 큰 그림 = `x_thum_00` 재질 칸1 ← GetThumbnail(ID,0). 장르 `x_mggenre` = `mgm01_ui_InsertRuleType`(Text0 = GameRule 별 라벨 표 PTR_GameRule), `x_text_rule` = `mgm01_ui_mgRuleFp`(Text0 = `im_inst_<이름>_rule`).
- **정정**: 플레이 횟수 = `x_record_00`(`x_text_00` = `mgm01_ui_playCount00`, `x_text_01` = `mgm01_pt_playCount01` Number0), 하이 스코어 = `x_record_01`(`x_text_00` = `mgm01_pt_highscore00`, `x_text_01` = 기록). 9.1 표의 배정(00 = 하이 스코어, 01 = 횟수)은 반대였다.
- 미리보기 `x_preview/x_preview_0K` 재질 칸1 ← 후보 목록[(pos+오프셋) mod N] 의 썸네일, 오프셋 → K: −3→06, −2→05, −1→04, 0→00, +1→01, +2→02, +3→03, +4→07(알파0 슬라이드용).
- `ApplyListMgSetting` 끝에서 `UpdateNewIcon(선택 ID, pos, consume=1)` — **설정에 들어가거나 게임을 넘기면 그 게임의 NEW 를 바로 소비**(Work SetNew(false)·save MG+4 bit0 clear) [판독].
- 승패 표 열 썸네일 = `x_all/x_parts_%02d/x_thumbnail` 재질 칸1 ← GetThumbnail(행 ID,0) [판독 mgm01 @0x7100016ea4].

## 7. 애니·소리·레이아웃·메시지 연결

| 대상 | 고유 연결 [판독][데이터] |
|---|---|
| 목록 | InitializeMgList — mgm01 @0x7100007af0: 공용 창3형식/112 item, `MinigameListItem%03d`, `mgm01_thum_00` |
| 목록 본체 | `mgm01_base_freeplay_00`: in/out10, normal30(loop), press6; left/right_select_00=4, _01=5 frame |
| 설정 | InitializeMgSetting — mgm01 @0x7100008664; `mgm01_base_mginfo_00`: in/out10, normal30, left/right_select8 frame |
| 결과 | InitializeMgResultList — mgm01 @0x7100008068; `x_all/x_parts_%02d` 최대8개와 header/scrollbar |
| 잠금 안내 | `mgm01_mes_announce_00`, order200; in→normal→out, 개별 Fiber |
| 시작 텔롭 | InitializeCourseNameTelop — mgm01 @0x71000079ac; `mgm01_start_tlp_courseName` |
| 이름/룰 | `im_<MgName>_name`, `im_inst_<MgName>_rule`를 고유 삽입 key로 연결 |
| 목록 기본/잠금 이름 | `mgm01_ui_mgNameNone`, empty favorite용 문구; reason0 placeholder |
| 승패 표 | `mgm01_ui_mgTable00`=승패 표, `mgm01_ui_mgTable01`=미니게임을 플레이해서 승패를 겨루자!, `mgm01_ui_countWin` Number0 |
| 안내 | reason1→`mgm01_ui_announce00`=1인 플레이 전용입니다.; 2→announce01=온라인 접속 중에는 플레이할 수 없습니다.; 3→announce02=현재 접속 인원수로는 플레이할 수 없습니다. |
| 고유 설정 | `mgm01_ui_rule_EndlessSetting00/01`=노멀/엔드리스; `RhythmSetting00/01`=노멀/하드, CPU label/난이도 삽입 |

[판독][데이터] `PlayAnnounce` — mgm01 @0x7100013ca0의 table mgm01 @0x710004f648은 reason0=null,1=announce00,2=announce01,3=announce02다. reason0에는 안내 문구가 없다. `AnnounceUpdate` — mgm01 @0x7100013f20는 in 완료→normal, normal 완료 및0.75초 또는 입력 skip→out 완료 후 Fiber 정리다. 이 Fiber의 수명을 전체 목록 입력 잠금으로 바꾸지 않는다.

| 지점 | SE/BGM 고유 호출 [판독] |
|---|---|
| 목록 이동/결정/잠금 | CUR_2D / DECI / ERROR + FX·진동 |
| 필터 | DECI_LR + FX, select_00 완료→재구성→select_01 |
| 설정 값/랜덤 | 변경할 때의 CUR/DECI_S·FX; 범위 밖 값은 무음 |
| favorite | LIKE_ADD / LIKE_DIS |
| 승패 표 닫기 | CANCEL; scroll은 SE 호출 없음 |
| 화면 시작/복귀 | Start/Continue BGM4; MgStart StopBGM3·PlayBGM5; flag4와 MGTransSound는 old §8.2 |

→ 화면별 원본 BGM(라벨·시작·전환 페이드)·웹 연결: [04_sound.md §12.14](../engine/04_sound.md) (2026-10-08).

[판독] enum→실제 사운드 label, 텍스트 삽입 메커니즘, 공용 창 애니 완료 판정은 기존 mgm_common §6.8·6.9·7 참조다. 모든 애니 frameSize가 같은 UI tick/실제 초라는 원본 실행 주장은 하지 않는다.

정정(2026-10-07): 위 SE 표 "목록 이동/결정/잠금"의 결정은 `SQ_SE_MGM01_DEC` 이고 잠금은 `SQ_SE_SYS_ERROR` 다(§6.2 정정 줄). 승패 표 열기 `SQ_SE_MGM01_DECI_S`+FX 를 더한다.

### 7.1 미니게임 썸네일 원천 (보강 2026-10-07)

[판독] `bq::UiSharedTextureModule::GetThumbnail(id, n)` — main @0x7100297290(C `analysis/decomp/mgm01_list_thumb_main.c`): 이름 = `MGList::GetName(id)`; n≠0 이면 먼저 `"%s_%d^o"` 를 찾고, 없거나 n==0 이면 `"%s^o"`, 그것도 없으면 `"mg0101^o"`; 결과를 `GetTextureInfo(이름)`(main @0x7100296b10, 공용 UI 텍스처 레이아웃의 텍스처 표에서 찾기)로 돌려준다. mgm01 의 모든 호출은 n = 0 이다(목록·설정·미리보기·승패 표). 잠금(reason0) 자리 그림은 `GetTextureInfo("mgboss^o")` [판독: 어셈블리 mgm01 @0x7100014c04, mgm01 안의 유일한 `^o` 문자열 @0x7100044eaa].

[데이터][실행: 변환] 텍스처는 `extracted/bea/bq.nx.bea/Parts.lyt` 의 `timg/__Combined.bntx` 에 있다: 목록 112개 이름 그대로 `mgXXXX^o` 112장 + `mgboss^o` 1장, 모두 **640×360 BC1_SRGB** 한 크기(크기별 변형 `_N^o` 없음). 형식별 크기 차이는 텍스처가 아니라 항목 레이아웃의 그림 페인 크기다(§6.7 표: 342×200·216×128·162×108×0.75, 커서 확대판 400×228·288×166·200×114; 설정 큰 그림 640×360, 미리보기 134×82×0.84, 승패 표 `x_thumbnail`). 재질 칸0 은 모양(마스크) 텍스처 `mgm01_win_thum_0N^s`·`mgm01_base_mgthum_0N^s`·`mgm01_base_mgpreview_00^s`, 칸1 이 그림 자리(`mgm01_white_00^s` 등)이고 코드는 칸1 을 바꾼다. 변환 `web/tools/analysis/mgm01_thumb_assets.py` → `web/assets/mgm01/thumb/<이름>_o.png`(113장, 원본 그대로 디코드, 가공 없음) + 명세 조각 `web/assets/mgm01/thumbs.json`(텍스처 키 = 원본 이름 `mgXXXX^o`, sRGB 목록).

## 8. 다른 기능과의 상호작용·저장되는 값

### 8.1 초기 네 슬롯과 타입·캐릭터

| 순서 | writer·모듈 주소 [판독] | 결과/소비 |
|---|---|---|
| boot | `boot::Scene::GameFlow` — boot @0x7100004520 → `PlayerWorkHolder::Initialize` — main @0x710021e5a0 | 네0x100-byte PlayerWork 생성; current/base type0, CharacterID0, BaseCharacterID-1; ID 충돌 시0..3 재배정 |
| boot 자리 초기화 | `boot::Scene::ResetPlayerWork` — boot @0x7100004430 | 목록의 order/color/PadID를 index로 설정; CPU 생성 함수가 아님 |
| 사람 수 설정 | 기존 `FUN_71003476a4` — main @0x71003476a4 (`ComUiSettingPlayer`) | H를 min/max로 clamp; ID0..3에 `SetPlayerType(pid>=H ? 1:0)`; 기존 네 칸의 타입 변경 |
| 타입 writer | `PlayerWork::SetPlayerType` — main @0x710021d734 | +0x4c current와 +0xe0 base를 같이 씀, SetPlayerCom(type==1) |
| 임시 타입 | `SetPlayerTypeTmp` — main @0x710021d77c | current +0x4c만 변경; base 보존 |
| 캐릭터 결정 | 기존 charselect 문서 §3.2·5.4 | 사람 결정과 남은 잠금 해제 캐릭터의 CPU 배정 |
| 메뉴 재초기화 | `menu01::SequenceManager::Initialize` — menu01 @0x710003d0a0 | base type 복구; non-CPU의 유효 base char 복구; 사람 캐릭터를 제외한 pool에서 CPU 현재 char 배정 |
| 항구 진입 직전 | `SequenceStartMgMode::CallSceneImpl` — menu01 @0x7100059b70 | Sync7 대기 후 전체 PlayerWork ComLevel1; 항구 Scene 호출(기존 modeselect §5 참조) |
| mgm01 준비 | 이미 검증된 ResetPlayerType 경로 old flow §6.4 | >4일 때 Normalize4, base type 복구; 빈칸 자동CPU 생성 함수가 아님 |

[판독: 어셈블리] boot GameFlow의 C는 Initialize의 개수 인자를 생략했다. boot @0x71000048f4의 `w1=4`, mgm01 @0x71000048f8의 Initialize 호출, 뒤 ResetPlayerWork 호출을 확인했다(`mgm01_dis_boot.c`). boot가 곧바로1인+3CPU를 생성하는 것은 아니며 사람 수 설정이 타입을 확정한다.

[판독: 어셈블리] ResetPlayerWork의 C도 SetOrder 인자를 누락했다. `mgm01_dis_boot_reset.c`에서 index가 x19로0부터 증가하고 boot @0x71000044c8의 w1=w19가 mgm01 @0x71000044cc의 SetOrder에 전달됨을 확인했다. color/PadID와 같은 목록 index다.

[판독] `PlayerWorkHolder::Normalize(int)` — main @0x710021ea90는 크기 조정·ID/Order 정규화·GamePlay 설정·invalid CharacterID를0으로 보정한다. 새 칸 생성 기본값만으로 CPU를 만들지 않는다. `Normalize(GameRule)` — main @0x710021e9f4는 일반4, rule11은8, rule13은20 등으로 분기하며 team/duel/single 인원 제약은 별도 helper를 호출한다. 미니게임 설정의 팀 구성 때 이 경로가 필요하다.

[판독] Initialize/Normalize의 `*(u64*)(player+0xdc)=0xffffffff`는 BaseCharacterID(+0xdc)=-1, BasePlayerType(+0xe0)=0으로 나눠 읽는다. 64비트 전체가 -1인 저장이 아니다. CharacterID(+0x48)/current type(+0x4c)는 `u64=0`으로 초기화된다. `SetBaseCharacterID` / `GetBaseCharacterID` — main @0x710021d71c / main @0x710021d72c의 C로 base char 오프셋을 확인했다. 별도 SetBasePlayerType 심볼은 없으며 타입의 base writer는 SetPlayerType다.

[판독] 별도 main `FUN_71001f07a0` — main @0x71001f07a0에는 인원<4이면 Normalize4→새 자리 type1·남은 유효 캐릭터를 랜덤 배정하는 보충 코드가 있다. 이번 xref에서는 실제 caller를 확인하지 못했으므로 이를 boot/charselect의 필수 순서에 끼워 넣지 않는다.

[판독] `SequenceStartMgMode::CheckStartImpl` — menu01 @0x7100058e50은 CPU 존재 시 시작/멤버 설정/취소 선택, `SettingMemberImpl` — mgm01 @0x7100059500은 `ComUiSettingComCharacter` 완료 후 확인으로 돌아간다. 이 흐름은 기존 PlayerWork 슬롯의 CPU 캐릭터 설정이다. 온라인·친구 매치 초기화 갈래는 조건만 참조한다.

### 8.2 두 인원 getter의 차이

| 함수 | 실제 필드·비교 [판독] | 소비 |
|---|---|---|
| `GetPlayerType` — main @0x710021d7c8 | current +0x4c | 두 카운터의 동일 getter |
| `GetBasePlayerType` — main @0x710021d7d0 | base +0xe0 | 타입 복구·팀 후보 helper |
| `MinigameModeWork::GetHumanPlayerNum` — main @0x71001f1820 | current type!=0 수; 기존 판독 참조 | InitializeHumanNum — mgm01 @0x710000888c에 cache, CheckHumanNumChanged — main @0x710001ac24가 변화 검사 |
| `mgmet::PlayerManager::GetHumanPlayerCount` — mgmet @0x71000475b4 | 첫 네 current type==0 수; 기존 판독 참조 | 허브 실제 사람 수 |
| main `FUN_71001f1b60` — main @0x71001f1b60 | 첫 네 자리 current!=0 **및** base!=0 수를 인자로부터 뺌 | TeamOrderData table index |

[판독] import가 다른 타입 getter로 연결됐다거나 base/current 차이 때문에 반대가 된 것은 아니다. 일반 type0/1 구성에서 main의 이름 `GetHumanPlayerNum`은 실제로 CPU 수, 허브 함수는 사람 수를 돌려준다. mgm01은 그 main 값의 변화 여부로 팀 후보 표·커서 범위를 다시 계산한다. SoloPlayOnly 잠금은 별도로 type0을 세므로 이 값을 사람 수로 바꾸지 않는다. [미확정] 원본 함수 이름이 이렇게 붙은 이유는 코드 의미 판독과 별개다.

### 8.3 미니게임 호출·복귀 계약

| 방향·값 | 출처/writer [판독] | 저장 위치/다음 reader |
|---|---|---|
| 호출: MinigameID | Scene+0x278 | SetupPlayInfo→ModeData+8, CallMinigameScene→GameWork ID |
| 호출: filter enum/index/favorite 기원 | Scene+0x210/+0x214, enum13 여부 | MinigameModeWork+0x780/+0x784/+0x78c; ContinueFlow |
| 호출: team selection | Scene+0x27c, GameRule별 TeamOrderData | SetupPlayInfo·`FUN_71001f1e20` — main @0x71001f1e20→PlayerWork TeamID/IsGamePlay·Work 마지막 팀 선택 |
| 호출: CPU | Scene+0x284 | Sync CPU, offline Work CPU, 모든 PlayerWork ComLevel; 기존 캐시 getter 계약 참조 |
| 호출: normal/endless | Scene+0x280 | flag1, MGRecorder 기록 선택·한 판 소비 |
| 호출: rhythm | GameRule10이면 Scene+0x288, 아니면0 | RhythmWork::SetMode |
| 호출: 설명 조건 | 기존 flag4 값 + MGList IsCallInst, UseGyro | main Scene 이름 분기 §3.2; 내부 설명 시작은 다음 단계 |
| 호출: 랜덤 연속 후보 | unlocked MgAll 및 현재 필터, flag6/실제 사람 수 조건 | Mgm01SetFilterAllMgIdList/Mgm01SetOmakaseMgIdList, 현재ID 제거 |
| 호출: session/전환 | SaveRequest·ChangePadStyle(id)·pause 비활성·fadeDone | child Scene 요청, 부모 Fiber Sleep(-1) |
| 복귀: Round | 외부 한 판 종료 writer, SetRound 또는同等경로 | Work+0 s32; 첫/Continue 선택·history count |
| 복귀: ID/judge/results[4] | 외부 한 판 종료 측의 SetMinigameResult 계약 | Work+0xc+0xc*slot; raw byte 유지, history·score getters |
| 복귀: 선택 복원 | 호출 전 ModeData 저장 | ContinueFlow→Scene selected/filter, resume1 |
| 항구 복귀 | 목록 cancel→ExitFlow | old mgmet §3·8의 ReturnScene/시작 지점 계약 |

[판독] `FUN_71001f1e20`은 먼저 타입 복구/Normalize(GameRule), TeamID와 IsGamePlay를 설정한 뒤 rank/WinLose=-1, coin0, advantage=false로 시작 데이터를 초기화한다. >4인 구성에는 추가 CPU의 gameplay/team과 캐릭터 pool 설정이 있다. rank를 프리 플레이 score로 곧장 누적하는 계약이 아니라 결과 ring에 기록한 byte를 비교한다.

[판독] `Mgm01GetTeamOrderDataFromGameRule` — main @0x71001f1ac0는 table main @0x7101c145c8의0x20-stride 항목을 고른다. 기본 index0, rule1→2, rule2→1; duel의 base6, rule8/12의10, rule11/13의 offline10/online14에서 §8.2의 helper로 index를 조정한다. 후보 원형과 수는 §6.5다.

[판독] `FUN_71001f1930` — main @0x71001f1930은 네 TeamID를 -1로 채운 뒤 선택 후보의 각 위치에 팀을 배정한다. format4/6은 첫 위치 team0·나머지 team1, format5는 앞 두 위치 team0·뒤 두 위치 team1, 다른 format은 포함 위치 team0이다. 빠진 위치는 -1이며 SetGamePlay(false)가 된다. 예: 1vs3 후보1은 [1,0,1,1], 2vs2 후보1은 [0,1,0,1]이다.

[판독] GameRule3/8/11/12/13의 시작 구성은 첫 네 handle 목록을 `FUN_71001f4ef0` — main @0x71001f4ef0로 정렬한 뒤 위 TeamID 배열을 순서대로 쓴다. C의 비교 key는 `(current==0 또는 base==0 ? 20 : 0)−PlayerID`의 내림차순으로 사람/임시CPU를 앞쪽에, 같은 그룹은 PlayerID 오름차순으로 놓는다. 따라서 원래 ID가 뒤쪽인 사람도 후보 위치0이 될 수 있다. 호출 계약에는 최종 PlayerID→TeamID/IsGamePlay를 저장해 이 변환을 보존한다.

[판독] `MgStartFlow_SetupOmakaseMgList` — mgm01 @0x710001c2a0는 flag6 off일 때 UseGyro 항목을 제거한다(`FUN_7100020b10` — mgm01 @0x7100020b10). 실제 사람>1이고 filter enum0이면 TeamOrderData+4==3 항목도 제거한다(`FUN_7100020b74` — mgm01 @0x7100020b74). `MgIdList_Erase` — mgm01 @0x710001c8b0가 erase predicate를 적용한다. 체감 설정 흐름의 내부는 분석하지 않는다.

[웹 2026-10-09, mg-connect] 호출 값 → 한 판 setup: `script/mgrun.ts` `freePlaySetup`(팀·참가·CPU·리듬·엔드리스·설명·자이로). 복귀 기록 = `shell/mgscene/resultEntry.ts`(`FUN_71001f271c` byte 규칙, judge = `Mgm01SetupMinigamePlayInfo` @0x71001f1c60). 실패 = null → 기록 없음. 가짜 결과는 `cfg.play` 가 없는 단독 시험에서만 쓴다(`shell/mgm01/playResult.ts`). 계약: [minigame_scene.md](minigame_scene.md) §12.12.4~12.12.5.

### 8.4 Work·Sync·세이브에 저장되는 값

| 값 | writer [판독] | 저장 위치 | reader/저장 요청 |
|---|---|---|---|
| 초기 NEW/unlock | SetupPlayData — mgm01 @0x7100009850 | available IDs Work new/unlock=1, owner save MG+4 bit0 on | IsNew/lock, SaveRequest |
| 초기 준비 완료 | SetupPlayData | save MinigameMode bit2 OR4 | 다음 SyncedSetupGame의 once 검사 |
| 잠금 갱신 | CheckMinigameLockCondition | Work unlock, Scene MgData reason | Decide·GetMgIdList·IsMinigameLocked |
| NEW 소비 | UpdateNewIcon | Work new0, owner save MG+4 bit0 clear | NEW pane; 이 함수 자체 SaveRequest 없음 |
| favorite | MgSettingFlow_Favorite | Work favorite toggle, owner save MG+4 bit2(4) 변경 | favorite 목록·heart; 이 함수 자체 SaveRequest 없음 |
| 선택 복원 | MgStartFlow | ModeData enum/index/ID/favorite 기원 | ContinueFlow |
| CPU | MgStartFlow | Sync/Work CPU + PlayerWork | 다음 준비/게임·허브 표시; SaveRequest에서 반영 |
| endless/rhythm | MgStartFlow | flag1/RhythmWork mode | 한 판·기록 selector |
| 팀·순서·초기 결과 | SetupPlayInfo/FUN_71001f1e20 | PlayerWork TeamID·IsGamePlay·rank/coin 등, Work team choice | 한 판의 입력 |
| Round/결과100개 | SetRound/SetMinigameResult 또는동등writer | §6.6 ring | history view/score |
| mgmrs 조작자 char 복원 | CleanupGame | PlayerWork CharacterID·BaseCharacterID | 돌아간 화면의 플레이어 |

[판독] favorite/NEW setter 호출과 디스크 저장 요청은 같지 않다. 시작의 SaveRequest나 다른 적절한 요청까지 메모리 save 데이터에 남는다. [미확정] 취소 직후 실제 flush 시점과 앱 종료 persistence는 SaveRequest/SaveData 생명주기 및 원본 실행 자료가 더 필요하다.

보충(2026-10-09, [../engine/16_save.md](../engine/16_save.md)): 웹 목록·허브는 앱 공용 저장 `appSave().mgm` 하나를 쓴다(옛 키 `mpj.mgm01.save` 는 처음 한 번 옮김). NEW 끔·즐겨찾기는 메모리에만 쓰고 다음 SaveRequest(한 판 호출·허브 요청·단계 16) 때 기록한다. 목록 나가기·페이지 정리 때 하던 즉시 기록은 원본 근거가 없어 뺐다(16_save §10 사용자 확인 필요).

## 9. 웹 포팅 구조 — 제안, 코드 없음

[추정][웹 이름] [mgm_common.md](mgm_common.md) §9의 독립 shell 원칙에 따라 `web/script/shell/mgm01/`을 제안한다. 허용 의존은 같은 shell 공용 부품, `three`, charselect의 scene2d/render2d/state/RepeatGen/types다. `core`, `games`, `view`, `game.ts`, `env.ts`는 import하지 않는다. 이번 작업에서는 파일을 구현하지 않았다.

| 제안 파일 [추정][웹 이름] | 책임·주입 계약 |
|---|---|
| `types.ts` | game/filter JSON, raw result byte, team 후보, session contract |
| `state.ts` | §5 상태, trig/rep·UI/3D 완료 신호 입력 → 명시적 event 출력 |
| `catalog.ts` |152 ID/112 목록의 매핑, filter 순서·locked/unlocked·favorite views |
| `listView.ts` | 세 grid 형식, 고유 끝 행 cursor, NEW observer |
| `settingView.ts` | valid 항목·값 범위·7 preview·팀 표시 |
| `historyView.ts` | ring 순서,8 rows, raw result equality·score |
| `sessionAdapter.ts` | 시작 입력 snapshot·호출/복귀 이벤트, 게임 구현과 연결하는 외부 어댑터 |
| `mgmrs/state.ts` | 오류 목적지/복구 대기·성공·실패 event, 실제 network 구현은 주입 |

[추정] 같은 state에 실제 render/사운드/network를 넣지 않고 `requestChild`, `returnHub`, `saveRequested`, `sound`, `fx` 등의 event를 반환한다. RNG는 sync 후보 index를 주입한다. 실제 사람 수와 원본 main의 type!=0 카운터는 별개 값으로 다룬다. “원본 함수 이름 Human”이라는 이유로 같은 값에 합치지 않는다.

[추정] 다음 MinigameScene 단계로 넘길 최소 입력은 ID/Scene route, GameRule·TeamID/IsGamePlay·PlayerID/char/base type/order, ComLevel, flag1/4/6/0x3c 관련 값, rhythm mode, 두 랜덤 후보 목록, ModeData, Round와 raw 결과 ring, fade/pause/SaveRequest 계약이다. 반환은 Round/result commit·child 종료와 부모 복귀 신호로 정의하고 엔진 Scene 인스턴스 보존 방식은 외부 어댑터에서 결정한다.

### 9.1 구현 계약 — 개별 설정·필터(장르) (2026-10-07)

코드 `web/script/shell/mgm01/`(공개 진입점 `index.ts`), 데이터 `web/assets/mgm01/catalog.json` ← `web/tools/analysis/mgm01_web_assets.py`, 페이지 `web/script/mgm01_page.ts`(ui.html `mgm01-setting`·`mgm01-filter`), 시험 `web/tools/test_mgm01.ts`. 공용 부품은 [mgm_common.md](mgm_common.md) 9.6 그대로 쓴다(MgmWindow·MenuGrid·MgmInput·MgmSound·FiberRunner·MgmWork/MgmSave). 위 표의 제안 이름과의 대응: `catalog.ts`(그대로), `settingView.ts`(순수)+`settingScreen.ts`(창), `listFilter.ts`(listView 의 필터 부분, 순수)+`filterScreen.ts`(머리 줄만), `types.ts`(호출 계약 `Mgm01PlayRequest`). `state.ts`(DecideMinigameFlow)·`listView.ts` 본체·`sessionAdapter.ts` 는 아직 없다.

| 항목 | 웹 결정 | 근거 수준 |
|---|---|---|
| MGList ID | `mgListND` 의 Extra 아닌 79개 → 0..78, `mgListCA` 38개 → 79..116, ND Extra(pp01~04·mf01) → 117..121(나머지 ~151 은 목록 밖) | [추정] 문서 수치 4건 일치: 모드 ID {4,5,9,11,21}=ND Endless 전부, 리듬 0x6B~0x74([02_rhythm.md](../engine/02_rhythm.md)), PataPata 0x75~0x78([minigame_result.md](minigame_result.md)), 기록 kind ID ↔ gamerecord Mode/Format 20행 |
| GameRule 문자열 → 번호 | VS4 0·2VS2 1·1VS3 2·1VS1 3·Boss 9·Rhythm 10 | [판독](minigame_result.md 규칙 이름 표, 6.5) |
| 〃 나머지 | Chara 8·Busters 11·AthlonSP 12·Athlon 13, Item·Extra·None = 없음(기본 갈래: 팀 표 0, CPU 는 CPU 있으면 조정) | [추정] 8/12 = 한 명 고르기 표 10, 11 = 8인·13 = 20인 Normalize(8.1) 와 모드 성격에서 짐작. 원본 열거 표 확인 필요(§11) |
| 장르 문구 `x_mggenre` | rule → `mgm01_ui_mgRuleTypeFpNN`(VS4 00, 2VS2 01, 1VS3 02, 1VS1 03, Chara 04, Boss 06, Rhythm 07, Busters 08, AthlonSP 09, Athlon 10, Item 11), 없으면 숨김 | [추정] 문구 내용으로 대응. 애슬론 09/10(코인/서바이벌) 배정은 근거 없음 |
| 필터 | 표시 순서 = SortIdx, 입력 exact rep 0x10/0x40 이전·0x20/0x80 다음, `left/right_select_00` 끝 → 재구성(`applied` 사건) → `_01` 끝 → 창 `normal` 재생 | 6.1·6.2·7 [판독], 끝난 뒤 normal 과 select 중 입력 무시는 [설계] |
| 필터 단독 화면 | 머리 줄(문구·L/R·x_guide)만, `thum_all` 숨김, 빈 즐겨찾기면 `x_no_favorite`(`mgm01_mw_favoriteNone`), B = 닫고 마지막 필터 반환 | [설계] — 원본 목록에서 B 는 취소(상태 7) |
| 설정 항목 | 논리 커서 0..4 → 창 메뉴 1행×4열(`x_rule/x_team_00`, `x_rule/x_rule_option_00/01`, `x_rule/x_play_00`), 보이는 CPU/모드/리듬을 rule pane 0 부터 | 6.5 [판독] |
| 항목 애니 세트 | rule·team = [normal, off, on, off, null, null, lock×4, null, null], Play = [normal, off, on, off, press, null, on_ng, off_ng, on_ng, off_ng, press_ng, null] | [설계] 레이아웃 태그 이름으로 고름(원본 세트 미확정). Play 결정 뒤 next = null 이라 press 끝 = 애니 끝(6.6 isCursorItemAnimating 로 기다림) |
| 설정 입력 | 6.2 표 그대로(A·B·Y·X exact, 항목 이동 trig 0x100/0x10000·0x200/0x40000 비트, 게임 이동 exact rep 0x10/0x40·0x20/0x80, 값 trig 0x400/0x80000 −1·0x800/0x20000 +1, 끝에서 무음 clamp). 한 프레임 한 갈래(else-if) | [판독] / 한 갈래는 [설계] |
| 설정 SE | 값·항목 이동·게임 이동 `SQ_SE_MGM01_CUR`, 랜덤 `_DECI_S`, 즐겨찾기 `_LIKE_ADD/_LIKE_DIS`, Play 결정 `_DEC`, 첫 항목 B `_CANCEL` | 값·랜덤·즐겨찾기 = 7 의 이름과 라벨 일치 [데이터], 나머지 [설계] |
| 랜덤 | 후보 = 현재 필터 unlocked, 0 이면 DECI_S 만, 성공 → 창 out → 새 ID 로 다시 진입(4→4) | 6.3·5.2 [판독], 창 out/in 반복은 [설계] |
| 진입 | 후보 비면 현재 ID 하나, resume 이면 Play 커서 아니면 첫 valid, 게임이 바뀌면 값은 새 범위로 clamp | 5.1 [판독] / clamp [설계] |
| 문구 배정 | `x_mgname` = `mgm01_ui_mgNameFp`(Text0 = im 이름), CPU = `mgm01_ui_rule_CpuSetting00/01`(Text0 = `im_comLevel0N`, 아이콘 재질 t = index×0.25 를 v 방향), 모드·리듬 = `…Setting02` 제목 + `…Setting00/01` 값, 팀 얼굴 글자 = 사람 `mgm01_ui_player0N`·CPU `mgm01_ui_cpu`, 기록 `x_record_00` = 하이 스코어(kind −1·kind3 노멀은 숨김), `x_record_01` = 플레이 횟수(save 선두 u16) | [설계](6.5 기록 형식·7 라벨은 [판독]) |
| 기록 값 | 웹에는 MGRecorder 가 없어 페이지가 gamerecord `InitialRecord` 를 준다(kind2/3 = 1/100 s 로 분·초·소수) | [설계] / 단위 [추정] |
| heart | 켬 `on`→`normal`, 끔 `out`→`off`, 처음 normal/off | [설계] |
| 게임 넘김 창 애니 | `left_select`/`right_select`(8f) → `normal` | [설계] |
| 호출 계약 `Mgm01PlayRequest` | {id, name, rule, ruleNo, filter{enumNo, index, fromFavorite}, team{table, choice, format, teamIdByPid[4], gamePlayByPid[4]}, cpu, endless(모드 게임만), rhythm(rule10 만, 아니면 0), useGyro(Gyro ≠ −1), callInst, favoriteDirty} | 8.3 [판독]을 PlayerID 기준으로 풀어 둠. Work/Sync 쓰기·자이로 확인(상태 5)은 부르는 흐름(D) 몫 |
| 즐겨찾기 저장 | `MgmWork.mg.favorite` + save MG+4 bit2, requestSave 없음 | 8.4 [판독]; 페이지는 끝날 때 localStorage 에 둔다 [설계] |
| 그리지 않은 것 | 7장 미리보기·썸네일 그림(런타임 텍스처, 에셋 없음), `x_text_rule`(`im_inst_*_rule` 문구가 공용 글꼴 범위 밖), 플레이어별 얼굴(기본 그림), mginfo `press` 창 애니 | [미구현] |

정정 줄(2026-10-08): 개별 설정의 플레이 버튼 "오른쪽 잘림"을 원본 규칙으로 다시 계산했다(ui2d_alignment.md 12.3). `x_rule`은 (0,0), `null_all`은 (0,−182), `x_play_00`은 (808,−56)이고 부품 덮어쓰기는 없다. ApplySettingMgSetting은 위치를 쓰지 않으므로 버튼 판은 586..1018이다. 원본 데이터에서도 오른쪽 58 px(둥근 끝 52 px 전부)가 화면 밖이고, 아이콘(619..643)과 글자 칸(667..847)은 화면 안이다. 웹과 다른 단계는 없다 [판독][데이터]. 회귀 검사: `tools/test_mgm01.ts` 6절.

### 9.2 구현 계약 — 목록 본체·DecideMinigameFlow 상태기계·썸네일 (2026-10-07)

코드 `web/script/shell/mgm01/{listView,listScreen,scene}.ts`(index export), 썸네일 `web/assets/mgm01/thumbs.json`·`thumb/`(§7.1), 페이지 `web/script/mgm01_page.ts` `runMgm01List`(ui.html `mgm01-list`), 시험 `web/tools/test_mgm01.ts` 8~10절. 위 9.1 의 "그리지 않은 것" 중 미리보기·썸네일은 이번에 넣었다(설정 화면 작은 수정).

| 항목 | 웹 결정 | 근거 수준 |
|---|---|---|
| 순수 상태 `ListState` | 목록 구성(§6.7 Prepare)·커서 이동(§6.3, W = 형식 열 수)·결정/잠금/랜덤/승패 표/취소·필터(9.1 `ListFilterState` 그대로 끼움)·NEW 관찰(announce.ts `NewObserver`)을 입력 비트 → 사건 목록으로. 입력 순서·exact 비교·빈 목록 갈래·trig>1 skip 은 §5.5·6.2 그대로 | [판독] |
| 그리기 `ListScreen` | 공용 창 `mgm01_base_freeplay_00` 에 3×112 메뉴, 항목 `mgm01_thum_00` 112개 Hook/Remove, 항목 표시 §6.7 의사코드 그대로, 썸네일 = 재질 칸1 `setTexture` | [판독] / 칸1 은 [데이터: 재질] |
| 형식 바뀔 때 | 이전 type 칸에서 Remove → ResetMgItem → 새 type 칸에 Hook(§6.7 순서) | [판독] |
| 이름 말풍선 | 글자 폭(`measure`)+40 = `x_base_00`, +32 = `x_bd_00`, 칸 전역 X ± bd/2 가 ±960 을 넘는 만큼 `x_00` 이동. 나눈 창 조각 늘이기는 online `resizeWindow` 와 같은 규칙을 목록 화면 안에 둠(import 경계) | [판독] / 조각 재배치 [설계] |
| 항목 우선순위 101/100 | 공용 창 `draw` 가 커서 항목을 마지막에 그리는 것으로 대신 | [설계] |
| NEW 관찰 | 틱마다 rate 1(60 Hz 의 GetDeltaRate = 1 로 봄), wait 12 < 누적이면 소비(Work·save bit0, 항목 `x_new_0S` 숨김) | rate 단위 [추정] |
| FX(`PlayFxTriggerOperationPlayer`) | 웹에 대응 없음 → 사건만 남기고 아무것도 안 함, 진동은 `MgmSound.vibrate(조작, 'error')` | [설계] |
| 상태기계 `Mgm01Scene` | §5.2·5.5 의 0·2·3·4·5·6·7·8·9 를 한 Fiber 로. 3 = `HistoryScreen`(work 결과 고리 `historyFromWork`), 4 = `SettingScreen`(4→4 랜덤은 그 안에서 반복), 2 = `ListScreen`. 잠금 안내 `AnnounceScreen` 은 목록 화면이 갖고 상태와 상관없이 매 틱 갱신(원본 별도 Fiber) | [판독] / 묶는 방식 [설계] |
| 상태 5 자이로 | `SetGyroFlow`(체감 설정 장면) 없음 → 항상 허용(→6) | [설계] |
| 상태 8 MgStartFlow | 1.0 s 기다림 → 바깥 `call(Mgm01PlayRequest)`; ModeData 저장 = `work.freeplaySelect {filter, index, id, fromFavorite}`, flag1(엔드리스) 켬/끔. 3D 대기·FadeOut 1.0 s·Work/Sync/PlayerWork 쓰기는 부르는 쪽(D) 몫 | 시간 [판독 5.3] / 생략 [설계] |
| 한 판 복귀 | 장면이 새로 만들어질 때 `returned`(MgResultEntry) 가 있으면 `round += 1`·`pushResult`(원본 ring writer 미확정 §11-1) → ContinueFlow: `freeplaySelect` 로 필터·ID 복원, resume1 → 상태 2(목록 창 in 애니 없이) | 기록 위치 [설계] / 복원 [판독] |
| Back 안내 | `MgmGuide(17, 'sys_ctrl_back')` 를 장면이 갖고 목록 진입 때 In, 7·5 에서 Out | [판독 5.5] |
| 랜덤 안내(UIOmakaseGuide 2칸) | 공용 `MgmGuide` 가 1칸 판이라 그리지 않음 | [미구현] |
| 설정 화면 수정(작게) | 큰 그림 `x_thum_00`·미리보기 8칸(§6.7 오프셋 표) 썸네일, 게임 넘김 때 `x_preview`·`x_cursor_LR` 부품 left/right_select 와 그 끝에 미리보기 다시 넣기, 게임 넘김 SE `SQ_SE_MGM01_DECI_LR`(PlaySe2D 위치는 생략), 기록 페인 정정(00 = 횟수·01 = 하이 스코어), 보일 때 NEW 소비 훅 `onShow(id)` | [판독: 어셈블리 §6.7] / 입력 막지 않음은 [설계] |
| 승패 표 수정(작게) | 열 `x_parts_NN/x_thumbnail` 칸1 = 썸네일(생성자 선택 인자 `thumb(id)`) | [판독 §6.7] |
| ui.html 한 판 | 가짜 자식 장면: 즉시 결과(승패 무작위, judge 1, 사람 아닌 칸 포함 4바이트 0/1) + save 선두 u16 +1(최대 999) 후 ret | [설계] — 실제 연결은 D 파트(mg1801) |
| 시험값 시작 필터 | `startEnum`(ui.html `filter=`) 이 있으면 상태 0 의 MgAll 대신 그 필터 | [설계: 시험용] |

[실행: 시험] 검증(2026-10-07): `npx tsx tools/test_mgm01.ts` 271/271(8절 순수 상태: 위치→페인 표가 레이아웃 좌표상 행 우선 순서인지, 끝 행 Q 보정·반복 막힘, 결정/잠금/랜덤/승패 표/취소/필터/빈 즐겨찾기/NEW 13틱 소비; 9절 실제 명세: 3형식 창 페인·x_win_0S·썸네일 칸1 키·mgboss 자리·말풍선 문구·112 이름 글자가 `bqfont_small` 에 전부·썸네일 113장 파일/sRGB; 10절 상태기계: 0→2→4→2(커서 복원·in 애니 없음)→3→2→4→5→6→8→호출, 복귀 Round·결과 기록·ContinueFlow 같은 칸, 승패 표 열 썸네일, B→7→9). 6절 기대값 2줄은 위 6.7 정정(기록 페인)으로 고쳤다. 기존 시험 전체·check_mgmcommon(mgm01 import 경계 포함) 통과, tsc 기존 serve.ts 2개만, 빌드 통과. 헤드리스 `npx tsx tools/shot_mgm01.ts list` 콘솔 오류 0(`test/out/mgm01/11~18_*.png`: 112칸·접속 중 리듬 잠금 안내·보스 잠금 자리·4인 대전 32칸 형식·보스 15칸 형식·설정 진입(큰 그림·미리보기)·설정 B 복귀·승패 표·가짜 한 판 뒤 복귀). reason0(보스 자리) 결정은 안내 문구가 없어(§7 표 reason0 = null) 안내 창이 뜨지 않는 것이 원본 그대로다.

## 10. 검증 방법·실행 결과

### 10.1 신규 C와 재사용 범위

| 신규 C 파일 | 함수 수 [데이터] | 범위 |
|---|---|---|
| mgm01_stage3.c |103|Scene/JSON/MgRecord 수명·계산·조건·RTTI|
| mgmrs_stage3.c |25|요청된24개+DummySymbolLink1개|
| ui2dalign_main.c |16|PlayerWork/Normalize6 + Alignment10|
| ui2dalign_more.c / vertical.c / order.c |7 / 1 / 3|Alignment 측정·목록 연결, 별도 문서|
| mgm01_main_contract.c |8|팀 getter/시작 구성/ring writer·reader/CallMinigameScene/Fiber ctor|
| mgm01_callbacks.c / wait_callback.c |3 / 1|motion·fade·NEW callback|
| mgm01_menu_player.c / boot_initial.c |3 / 1|진입 직전 확인/멤버/호출, boot 자리 초기화|
| mgm01_main_more.c / main_round.c |6 / 3|오류 목적지·슬롯/인원 구성, Round·팀 counter|
| mgm01_helpers.c / data_helpers.c |5 / 2|predicate/정렬/목록 초기값|
| mgm01_result_writer.c |1|SetMinigameResult|
| mgm01_team_expand.c / team_sort.c |1 / 1|TeamOrder 후보의 TeamID 배정·플레이어 정렬|
| mgm01_player_base.c |2|BaseCharacterID writer/reader|
| 합계 |192개,19파일|module/address unique; 기존 C와 중복 집계 없음|

[데이터] mgmrs inventory의 정확한24개는 `Scene::{getStaticTypeinfo,getPropertyList,createInstance,deleteInstance,Scene,~Scene(두 주소),BeginScene,SetupGame,SyncedSetupGame,CleanupGame,GameFlow,getInstanceTypeinfo,GetSymbol,SetupScene,SyncedSetupScene,CleanupScene}` 17개와 `Scene::Params::{getStaticTypeinfo,getPropertyList,createInstance,deleteInstance,~Params,getInstanceTypeinfo,GetSymbol}` 7개다. BeginScene와 세 Scene override는 빈 처리이고 나머지 생성/RTTI 함수도 확보했다. 별도 DummySymbolLink — mgmrs @0x71000036a8는 분석 단계 집계에만 포함한다.

[판독] 기존에 있던 InitializeMgList/Filter/Setting/Result, MgListFlow/MgSettingFlow/MgResultListFlow/MgStartFlow, 공용 인라인, Scene ctor/SyncedSetup/Exit와 main의 기존 helpers는 기존 C를 읽었다. UI/3D·자이로·온라인의 범위 밖 내부를 새로 전개하지 않았다.

### 10.2 어셈블리 예외 전체

| 함수·확인 지점 | C를 못 믿은 이유 [판독: 어셈블리] | 복구·덤프 |
|---|---|---|
| SyncedSetupGame — mgm01 @0x7100004e50 | ParseFromAsset 문자열/옵션 인자 누락 | 두 archive 경로·w2=1; mgm01_dis_stage3.c |
| MgListFlow_RandomSelect — mgm01 @0x71000164c0, 호출 mgm01 @0x71000165bc | SyncRandRange 상한 누락 | unlocked N; mgm01_dis_stage3.c |
| MgSettingFlow_RandomSelect — mgm01 @0x710001b2b0, 호출 mgm01 @0x710001b480 | SyncRandRange 상한 누락 | unlocked N; mgm01_dis_stage3.c |
| ApplyMgResultList — mgm01 @0x7100016cc0 | Earliest 인자 누락, raw byte가 bool처럼 출력 | scroll+i / raw equality; mgm01_dis_stage3.c |
| CallMinigameScene — main @0x71003601ac | Scene 문자열 인자·tail call 불명 | gyroPadChange/mgInst/게임명; mgm01_main_dis1.c |
| boot GameFlow — boot @0x7100004520, 호출 mgm01 @0x71000048f8 | Initialize count 인자 누락 |4칸; mgm01_dis_boot.c|
| boot ResetPlayerWork — boot @0x7100004430, 호출 mgm01 @0x71000044cc | SetOrder 값 인자 누락 |목록 index; mgm01_dis_boot_reset.c|
| ApplySettingMgSetting_HighScore — mgm01 @0x7100017ba8 | GetRecord index·SetIntVariable 값 인자 누락 |MGRecorder index·현재 record; mgm01_dis_record.c|

[실행: 변환] `C:/dev/mpj/.venv/Scripts/python.exe web/tools/analysis/mgm01_verify_stage3.py`로112개 이름의 유일성·14필터·각 장르의 순서1..N, 신규 C의 module/address 유일성·baseline 기존 함수와 중복 없음, 100판 ring의0/1/8/9/99/100/101/237 경계, raw byte2/255 제외, strict NEW threshold를 확인했다. Alignment의 변환 fixture와11절 구성도 같은 도구가 검사한다.

[실행: 변환] baseline906개 파일의 hash 비교로 웹 소스/에셋 무변경을 검사한다. 기존 문서에 삽입한 보충/정정 줄만 제거하면 원래 hash가 복원되는지도 검사한다. JSON/레이아웃 파서와 계산식 실행의 결과이며 원본 게임 실행·미니게임 왕복·입력 캡처 검증은 아니다.

## 11. 미확정 사항과 필요한 근거

| 우선순위·항목 [미확정] | 확인한 범위 | 다음에 필요한 구체적 근거 |
|---|---|---|
|1. 한 판 종료 commit와 실제 복귀 순서|SetRound/SetMinigameResult·ring readers, 부모 Continue 조건|bq::MinigameScene 종료/결과 caller에서 Round writer·raw byte 의미·flag0x3c/return 요청 순서; FUN_71001f271c 실제 caller 또는동등inline|
|2. Scene 스택/인스턴스·mgmrs 오류 dispatcher|child 요청 뒤Sleep, Continue 소비·Net 목적지 writer|SceneBase RequestCall/Return·SceneManager history, Net SetErrorReturnSceneName reader; 원본 정상/오류 왕복|
|3. Params·원본 입력/3D 완료시간|NEW 기본12 rate단위·반복 소비·대기 predicate|SceneParams 실제 asset override, GetDeltaRate 및 공용 repeat timer; actor 클립 frameMax/재생속도·원본 캡처|
|4. 저장 flush와 한 판 기록 갱신|favorite/NEW save bit writer, 시작SaveRequest; 현재 record 표시|취소/종료시SaveRequest·save flush reader, MGRecorder 한 판 갱신|
|5. main Human 이름/희소 슬롯 보충 caller|동일current getter가 반대 비교임을 확인; boot4칸+인원setter 연결|이름의 설계 의도는 원본 개발 자료; FUN_71001f07a0 caller와<4 예외 진입 fixture|
|6. 112와 전체available/세이브 분모|프리 플레이MgAll=112, MGList ID공간152|MGList의 모드별available 집합·save playcount u16 writer; old mgmet 분모 문제의 나머지|
|~~7. 3D 바다 `mgm01_sea00.fmab` 커브 wrap~~ → **해결(2026-10-08)**|원본 Repeat 커브 4개(모래 60~660f·바다 30~630f, 클립 6000f)|변환기 `Curves.cs` 가 원본 wrap 으로 접음. mgm01 3D 는 아직 변환 산출물이 없어 다시 만들 사본은 없다(다음 변환 때 반영). 시험 test_mgm01 11절 — 변환기를 그 자리에서 돌려 확인(mgm00 바나나 결과 모션 2개 포함). 근거 plaza_3d.md §8|

[판독] old mgmet §11 중 최초 네 슬롯·타입 getter/변화 소비·Exit 첫 WaitUntil은 §8.1·8.2·3.2로 보충한다. 분모112는 목록 JSON 집합까지만 좁혔다. flag4의 실제 한 판 설명 소비와 Scene 인스턴스 수명은 다음 단계에 남긴다.

보충(2026-10-07, [minigame_scene.md](minigame_scene.md)·[minigame_result.md](minigame_result.md)):
- 6번(세이브 플레이 횟수 u16 writer): `bq::MinigameScene` 단계 11 의 `FUN_71002db9f0` — main @0x71002db9f0 이 참가자 중 PlayerType≠1 마다 `SaveData::GetMinigameData(id)` 선두 u16 을 +1(최대 999) [판독, minigame_scene §6.5].
- 1번(한 판 종료 commit): MinigameScene·MGResult 는 결과 ring 을 쓰지 않는다. `MinigameModeWork::SetMinigameResult` 는 main 내부 호출이 없고 가져다 쓰는 NRO 는 mg0704·mg1602·mg1604·mgm03·mgm06 뿐(mgm01 없음). `SetRound` 의 main 호출자는 `FUN_71002c4b50` 하나 [판독, minigame_result §6.5]. 프리 플레이 ring writer 는 여전히 미확정.
- 승패 값 열거: 1=승, 0=패, 2=무, 시작 −1 [판독, minigame_result §6.1].
- 설명 장면 이후: 미니게임 장면은 flag 4 를 생성자 자이로 조건에만 쓰고, 설명 화면 안 실행은 flag 0 경로다 [판독, minigame_scene §4.4·§5.3].

보충(2026-10-07, 9.1 구현에서 남은 것):
- 7. GameRule 열거(문자열 → 번호) 중 Chara·Item·Athlon·AthlonSP·Busters·Extra·None — 9.1 은 [추정]. 필요한 근거: MGList 로더의 GameRule 문자열 표(main) 또는 IsComLevelAdjustable·Mgm01GetTeamOrderDataFromGameRule 호출 실측.
- 8. MGList ID 배정(ND/CA 이어 붙이는 순서와 117~151) — 9.1 은 문서 수치 일치로 [추정]. 필요한 근거: MGList 생성 순서 판독.
- 9. 설정 화면 항목 애니 세트·SE·문구 페인 배정 — 9.1 [설계]. 필요한 근거: InitializeMgSetting @0x7100008664 의 SetupAddAnimeMenu 인자, MgSettingFlow SE 라벨.

### 9.x 구현 기록 — 승패 표·잠금 안내 단독 화면 (2026-10-07)

[설계] `script/shell/mgm01/historyScreen.ts`(HistoryState → `mgm01_history_title_00`·`mgm01_history_00` 공용 창, 열 `x_parts_NN/x_history_PP` 에 win_normal/normal, 얼굴 `x_face_0P/x_face_pc128` 칸 1 = `face_128_pcNN^u`, 승리 수 `num/x_text_0P` = `mgm01_ui_countWin` Number0, 기록 0 이면 `x_no_history` 표시)·`announceScreen.ts`(AnnounceState → `mgm01_mes_announce_00`). 얼굴 텍스처는 charselect 변환물을 가리키는 조각 `assets/mgm01/faces.json`(`web/tools/analysis/mgm01_faces_part.py`). 미니게임 썸네일(`x_thumbnail`)은 아직 변환하지 않아 원래 텍스처, 스크롤바 `x_scr_mgm` 은 노드가 비어 위치만 계산. 시험 `tools/test_mgmscreens.ts`, 확인 `ui.html?ui=mgm01-history&rounds=N` · `ui=mgm01-announce`.
