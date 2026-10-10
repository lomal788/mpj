# 18. 장면 계약·요청 API·Work 소유권

[설계] 2026-10-10 분석 문서. 구현 기준은 [DESIGN §10.5][DESIGN]이며, 공용 SceneBase·Work 경계만 이 문서가 맡는다. 모드별 규칙은 [프리 플레이][FREE]·[규칙 설정][RULE], 네트워크 세션 수명은 [온라인][ONLINE]에 둔다.

[미확정] 원본 실행 확인은 없다. 기존 판독을 우선 재사용했고, 기존 C가 없는 주소는 부록 C에 요청만 남겼다. 코드·스크립트·C·INDEX·SHARED·JSON·에셋·원본·extracted는 변경하지 않았다. 관련 저장소/상위 경로에서 AGENTS.md와 .agents/skills는 발견되지 않았다.

## 1. 기능 개요

[판독] SceneBase는 요청을 저장하고, 흐름 파이버 종료/페이드 대기 뒤 OnMainEnd에서 엔진 전환으로 넘긴다. 요청 함수 자체가 즉시 장면을 바꾸지는 않는다. main RequestCallScene @0x71002caf30·OnMainEnd @0x71002ca9c8·FUN_71002ca9e0 @0x71002ca9e0; [새 판독 C][C1], UpdateMain @0x71002ca780의 기존 [코어 §5.2][CORE].

[설계] 웹은 scenes.call(ID)·scenes.return()·scenes.change(ID)와 공유 Work를 사용한다. 부모의 논리적 복귀 항목은 남기되, 원본의 동일 장면 인스턴스 보존 여부는 아직 확정하지 않는다. [DESIGN §10.5][DESIGN], main CallScene @0x71001a830c·ReturnScene @0x71001a843c의 C 부재: [함수 목록][FN]·[INDEX][IX], §11 U01.

[판독] 결과 100칸 ring은 MinigameModeWork 소유다. GameWork에는 미니게임 ID·GameRule·GameJudgeType을 설정하는 API가 있다. 웹 work.game에 결과를 노출하는 계약과 원본 저장 위치를 혼동하지 않는다. main SetMinigameResult @0x71001f0460, Mgm01SetupMinigamePlayInfo @0x71001f1c60; [프리 플레이 §6.6·§8.3][FREE].

## 2. 자료

### 2.1 기존 판독·미확정 일괄 목록

| 분류 | 기존 절·주소·데이터 | 재사용 / 남은 공백 |
|---|---|---|
| [설계] 기준 | [DESIGN §10.1~§10.7][DESIGN] | 요청 API, Work, import 방향, 진입점 분리 |
| [판독] 장면 공용 | [01_core §4.9~§5.3·§6.7][CORE]; main ctor @0x71002c9bd4, OnEntry @0x71002c9f68, UpdateMain @0x71002ca780 | 수명·상태·seed 재사용; 요청 전달과 history 상세만 보강 |
| [판독] 한 판 | [minigame_scene §4·§5·§6·§12.12][FRAME]; main BeginScene @0x71002df258, SetupScene @0x71002df440, SyncedSetupScene @0x71002e0270, CleanupScene @0x71002e0344 | 0~19단계·결과·Save·FrameGate 재사용 |
| [판독] 모드 공용 | [mgm_common §3.1·§4.3·§6.9·§9.6][MGM]; main ctor @0x710035f69c, BeginScene @0x710035fab8 | 공용 archive·BGM·기존 이름 스택; 원본 인스턴스 보존 미확정 |
| [판독] 호출/복귀 | [mgm01_freeplay §3.2·§6.6·§8.1~§8.4·§11][FREE]; main CallMinigameScene @0x71003601ac, mgm01 MgStartFlow @0x7100011a50 | PlayerWork 준비·ring·Continue 재사용; 실제 ring writer caller 미확정 |
| [판독: 어셈블리] 모드 번호 | [mgmet_flow §3·§4.2·§8·§10.1][HUB]; main CallMinigameModeScene @0x710036027c, mgmet call @0x7100049f14 | C에서 빠진 문자열/인자는 기존 어셈블리 판독을 인용 |
| [판독] 규칙 캐시 | [mgmet_ruleconfig §8.1·§8.2·§11][RULE]; main getter @0x71001f0ea4, init @0x71001f0eac | Work/Sync/ConfigInfo의 다른 배치; marker 전체 writer 미확정 |
| [판독] 메뉴/부팅 | [modeselect §3·§8][SELECT], [plaza_intro §3.1·§4·§11][INTRO]; menu01 @0x710003df70, boot @0x7100004520, op @0x7100022ca0 | UI 선택·장면 교체를 구별; 전체 장면 등록표 미확정 |
| [판독] 온라인 경계 | [online §3.2·§5.7·§11][ONLINE], [12_online_sync §9.2~§9.4][NETLIFE], [01_core §5.1·§6.7][CORE]; main sync @0x71001c94cc, menu00 destructor @0x710002c7a0 / Disconnect @0x710002d3ec | syncedSetup 이전 gate·Work 접점만 공용 책임; 지역 cleanup과 세션 종료를 구별 |
| [판독] 페이드·저장 | [15_transition §1·§3][TRANS], [16_save §1·§2·§9][SAVE]; main UpdateMain @0x71002ca780, SaveRequest @0x710023ff64 | 속도와 초 구별, save 완료와 scene cleanup 완료 구별 |
| [설계] 현재 연결 감사 | [common_system_audit §1.2][AUDIT] 및 아래 §9.1의 현재 파일 | 감사 표는 과거 시점; 최신 파일/§1.2 끝 갱신을 우선 |

### 2.2 C·데이터 가용성

[데이터] 모듈·주소·C 연결은 [INDEX.tsv][IX]와 [main.nso.tsv][FN]로 확인했다. 아래 함수군의 C는 analysis/decomp에 있으며, 허용된 ghidra_work/*/out/*.c도 확인했다. out C는 online 갈래 7파일만 있었고 공용 요청/history·Work accessor의 정의를 보충하지 못했다.

| 분류 | 주소 / 실제 자료 | 사용 |
|---|---|---|
| [데이터] SceneBase C | main @0x71002c9bd4~0x71002cb064; [core_b1.c][C1] | 기존 수명 재판독 없이 재사용, 요청 전달 공백만 새 판독 |
| [데이터] 공용 vtable | main @0x71019e15c8; [core_b6.c ptrs:71019e15c8:72][VT] | §3.2 슬롯 순서. 끝을 넘겨 다음 표를 SceneBase 훅으로 넣지 않음 |
| [데이터] manager 부분 C | main @0x71001a47fc·0x71001a52b0; [core_b7.c][C7], main @0x71001a54dc·0x71001a6360·0x71001a6874; [core_b12.c][C12] | update·create·제거 경로만 확인; history 수정은 부록 C |
| [데이터] 모드 C | main @0x710035f69c·0x710035fab8·0x710035fcdc; [mgmcommon_main1.c][MC1]·[bgm_main_mgmscene.c][BGM] | ctor/Begin은 기존 §3.1 재사용, SyncedSetupScene만 새 판독 |
| [데이터] Work reset C | main @0x71001efdc0; [mgmet_main_work.c][WORKC] | reset이 초기화하는 영역과 건드리지 않는 규칙/ring을 구별 |
| [데이터] 7행 이름표 | main @0x71015d840c, s32 상대 offset 7개; [mgmet_main_scene_data.txt][NAMES] | mgmet·mgm01~06. 전체 scene registry라는 뜻은 아님 |
| [데이터] NRO 존재 | extracted/romfs/nro/NX_Release/{mgmet,mgm01,mgm02,mgm03,mgm04,mgm05,mgm06}.nro; 각 [함수 목록][MODFN] | 파일 존재 확인만. 원본 실행/추출 없음 |

## 3. 진입점·호출 흐름

### 3.1 수명 호출 순서와 호출자

| 순서 [판독] | 호출자 → SceneBase 훅 / 하위 훅 | 조건·근거 |
|---|---|---|
| 1 | main Entry @0x71001ca150 → 구현체 @0x71001c8068 → OnEntry @0x71002c9f68 | SceneRoot·vt+0x190 LoadPlayerMotionArchive, 종류0이면 SetSyncCond; [CORE §5.1][CORE] |
| 2 | Start @0x71001ca160 → 구현체 @0x71001c8108 → OnStart @0x71002ca280 | 로더 시작; [CORE §5.1][CORE] |
| 3 | 구현체 Update @0x71001c8190 상태1~3 | 시작 전송/네트워크 대기, 온라인 pause; [CORE §5.1][CORE] |
| 4 | 같은 Update 상태4 → OnBegin @0x71002ca2f8 → vt+0x168 BeginScene | 미니게임 @0x71002df258 / 모드 @0x710035fab8가 참을 반환할 때까지; [CORE §5.1][CORE]·[MGM §3.1][MGM] |
| 5 | 상태5 → 로더 완료, 상태6 → OnLoaded @0x71002ca37c → vt+0x198 IsLoadingArchive @0x71002cb064 | OnLoaded 참이면 OnLoadComplete @0x71002ca400; [CORE §5.1][CORE] |
| 6 | 상태7 → OnSetup @0x71002ca4b0 → vt+0x170 SetupScene → vt+0x148 SetupGame | 미니게임 SetupScene @0x71002df440; 두 하위 훅 순서 보존; [CORE §5.1][CORE] |
| 7 | 상태8 → FUN_71001c94cc → OnStartUpdate @0x71002ca65c | local seed=async.Rand, online=합의 seed. actor sync seed 복사 뒤 vt+0x178 SyncedSetupScene → vt+0x150 SyncedSetupGame; [CORE §5.1·§6.7][CORE] |
| 8 | 다음 프레임 상태9 → UpdateMain @0x71002ca780 → FiberLite → vt+0x160 GameFlow | 미니게임 GameFlow @0x71002df24c → vt+0x1a0 MinigameFlow @0x71002e0500; [CORE §5.1~§5.3][CORE] |
| 9 | UpdateMain 거짓 → OnMainEnd @0x71002ca9c8 → FUN_71002ca9e0 | 요청을 Call/Return/Exchange 엔진 함수로 전달; [C1][C1] |
| 10 | SceneModule 정리 @0x71001a6650 → Shutdown @0x71001ca1a0 → OnCleanup @0x71002caaf0 | 흐름 파이버 삭제 → vt+0x158 CleanupGame → vt+0x180 CleanupScene; [CORE §5.1][CORE] |
| 11 | ShutdownProcess @0x71001ca1b0 → OnCleanupProcessing @0x71002cb1f8, IsShutdownComplete @0x71001ca1c0 → IsCleanupComplete @0x71001c7cc4 | 로더 한가함과 cleanup 완료를 확인한 뒤 다음 장면; [CORE §5.1][CORE] |

[판독] Update @0x71001c8190의 매 호출 전후는 Background @0x71002cad48 / Foreground @0x71002cad4c다. 4→5·6→7·7→8·8→9·9→10은 서로 다른 프레임이며, 1~3은 조건 충족 시 이어진다. onLoadComplete는 setup보다 먼저다. [CORE §5.1][CORE].

[판독] 모드 SyncedSetupScene @0x710035fcdc의 기존 C는 UiPause::SetEnableOpen(0)을 호출한다. 이것을 “네트워크 동기 작업을 시작하는 훅”으로 해석하지 않는다. 동기 대기는 앞선 구현체 상태8의 @0x71001c94cc이며, 모드별 SyncedSetupGame은 뒤 슬롯이다. [BGM @0x710035fcdc][BGM]·[CORE §5.1·§6.7][CORE].

### 3.2 SceneBase 가상 함수 전체 슬롯

[데이터] 아래는 main vtable @0x71019e15c8의 +0x000~+0x198 전부다. 슬롯 배치와 실행 순서는 다른 표다. +0x1a0/+0x1a8의 0 뒤 +0x1b0=@0x71019e1778부터 FiberLite 람다 표가 시작하므로 72개 덤프 전부를 SceneBase 함수로 세지 않는다. [기존 vtable 덤프][VT], 람다 경계는 [CORE §5.2][CORE].

| 슬롯 [데이터] | main 대상 / 이름 | 호출 의미·근거 |
|---|---|---|
| +0x000 / +0x008 | @0x71002c9d50 ~SceneBase / @0x71002c9f08 DAT | 소멸 슬롯·두 번째 표식; 세부 호출 미확정, [VT][VT] |
| +0x010 | @0x71002cb11c FUN | FUN 슬롯, 실행 의미 미확정; [VT][VT] |
| +0x018 / +0x020 / +0x028 / +0x030 | @0x71001ca150 Entry / @0x71001ca160 Start / @0x71001ca170 Update / @0x71001ca180 Anytime | 공개 구현체 전달; [VT][VT]·[CORE §4.9][CORE] |
| +0x038 / +0x040 / +0x048 / +0x050 | @0x71001ca190 IsFinished / @0x71001ca1a0 Shutdown / @0x71001ca1b0 ShutdownProcess / @0x71001ca1c0 IsShutdownComplete | 종료/정리; [VT][VT]·[CORE §5.1][CORE] |
| +0x058 | @0x7101c7d000 __cxa_pure_virtual | 장면별 이름 슬롯, base pure; [VT][VT], 이름 소비 @0x71001a6360 [C12][C12] |
| +0x060 / +0x068 / +0x070 | @0x71001c9fd0 GetStatus / @0x71001a2ef0 GetTickElapsed / @0x71001a2ef8 GetHandle | 조회; [VT][VT] |
| +0x078 / +0x080 | @0x71002c9f0c SetPauseLevel / @0x71002caebc GetResetDelay | pause·제거 지연; [VT][VT]·[CORE §4.10·§5.5][CORE] |
| +0x088 / +0x090 / +0x098 | @0x71001a2cc8 GetSceneParams / @0x71001a2d24 LockParams / @0x71001a2d30 UnlockParams | params 경계; [VT][VT]·[CORE §5.1][CORE] |
| +0x0a0 / +0x0a8 / +0x0b0 | @0x71002c9f68 OnEntry / @0x71002ca280 OnStart / @0x71002ca400 OnLoadComplete | §3.1; [VT][VT]·[CORE §5.1][CORE] |
| +0x0b8 / +0x0c0 / +0x0c8 | @0x71002ca780 UpdateMain / @0x71002ca9c8 OnMainEnd / @0x71002caaf0 OnCleanup | §3.1; [VT][VT]·[CORE §5.1][CORE] |
| +0x0d0 / +0x0d8 | @0x71002cb1f8 OnCleanupProcessing / @0x71001c7cc4 IsCleanupComplete | §3.1; [VT][VT]·[CORE §5.1][CORE] |
| +0x0e0 / +0x0e8 / +0x0f0 | @0x71002cad48 Background / @0x71002cad4c Foreground / @0x71002cad50 UpdateAnytime | 앞/뒤 매 프레임, anytime 별도; [VT][VT]·[CORE §5.1][CORE] |
| +0x0f8 / +0x100 | @0x71001c9ffc AddLoadArchive / @0x71001ca140 IsLoadCompleted | archive 연결/조회; [VT][VT] |
| +0x108 / +0x110 / +0x118 / +0x120 | @0x71002ca2f8 OnBegin / @0x71002ca37c OnLoaded / @0x71002ca4b0 OnSetup / @0x71002ca65c OnStartUpdate | §3.1; [VT][VT]·[CORE §5.1][CORE] |
| +0x128 / +0x130 / +0x138 / +0x140 | @0x71002ca774 OnSyncStart / @0x71002ca778 OnSyncFail / @0x71002cb1fc OnSyncEnd / @0x71002cad58 SetSyncCond | sync 알림·조건. 순서 세부는 온라인 갈래; [VT][VT]·[CORE §5.1][CORE] |
| +0x148 / +0x150 / +0x158 | base @0x7101c7d000 pure | SetupGame / SyncedSetupGame / CleanupGame의 파생 구현 슬롯; [VT][VT]·[CORE §5.1][CORE] |
| +0x160 | @0x71002c9f64, 덤프 이름 ? | GameFlow 슬롯. base body는 판독하지 않음; [VT][VT]·[CORE §5.2][CORE] |
| +0x168 / +0x170 / +0x178 / +0x180 | base @0x7101c7d000 pure | BeginScene / SetupScene / SyncedSetupScene / CleanupScene의 파생 슬롯; [VT][VT]·[CORE §5.1][CORE] |
| +0x188 / +0x190 / +0x198 | @0x71002cad54 UpdateModuleTiming / @0x71002cafc8 LoadPlayerMotionArchive / @0x71002cb064 IsLoadingArchive | module timing·archive; [VT][VT]·[CORE §5.1][CORE] |

[설계] onReturn()은 웹 복귀 알림이다. 위 원본 vtable에는 같은 이름의 SceneBase 훅이 없으므로 원본 가상 함수를 추가로 발견한 것처럼 쓰지 않는다. [DESIGN §10.5][DESIGN]·main vtable @0x71019e15c8 [VT][VT].

### 3.3 7행 이름표 전체와 호출자

| ID [데이터] | 이름 / NRO | 확인된 호출자·사용처 |
|---|---|---|
| 0 | mgmet / mgmet.nro | 모드 ctor/BeginScene main @0x710035f69c·0x710035fab8의 ID0 archive 분기. menu01 항구 호출 @0x7100059b70은 기존 판독; 이 caller가 숫자0 표 lookup을 직접 쓰는지는 미확정. [MGM §3.1][MGM]·[FREE §8.1][FREE]·[NAMES][NAMES] |
| 1 | mgm01 / mgm01.nro | mgmet 선택ID2 → mode1, MinigameModeFlow @0x7100049f14 → main @0x710036027c; [HUB §3·§4.2][HUB]·[NAMES][NAMES] |
| 2 | mgm02 / mgm02.nro | mgmet 선택ID4 → mode2, 같은 caller @0x7100049f14; [HUB §4.2][HUB]·[NAMES][NAMES] |
| 3 | mgm03 / mgm03.nro | mgmet 선택ID1 → mode3, 같은 caller @0x7100049f14; [HUB §4.2][HUB]·[NAMES][NAMES] |
| 4 | mgm04 / mgm04.nro | mgmet 선택ID0 → mode4, 같은 caller @0x7100049f14; [HUB §4.2][HUB]·[NAMES][NAMES] |
| 5 | mgm05 / mgm05.nro | mgmet 선택ID3 → mode5, 같은 caller @0x7100049f14; [HUB §4.2][HUB]·[NAMES][NAMES] |
| 6 | mgm06 / mgm06.nro | mgmet 선택ID5 → mode6, 같은 caller @0x7100049f14; [HUB §4.2][HUB]·[NAMES][NAMES] |

[판독: 어셈블리] CallMinigameModeScene main @0x710036027c의 문자열 해석은 기존 [HUB §10.1][HUB]을 재사용한다. 선택ID→mode 표 [4,3,1,5,2,6]은 mgmet @0x71000e3658이다. 숫자 ID는 각 표의 문맥을 함께 써야 한다.

| 표 밖 경로 | 원본 모듈·주소·호출자 | 근거 |
|---|---|---|
| [판독: 어셈블리] 미니게임 호출 | mgm01 MgStartFlow @0x7100011a50 → main CallMinigameScene @0x71003601ac: ID<152 → GameWork ID → UseGyro이면 gyroPadChange, 아니면 flag4&&IsCallInst이면 mgInst, 그 밖 MGList::GetName(id) | [FREE §3.2][FREE]; 7행 모드 표와 별도 |
| [판독] 부팅 교체 | boot GameFlow @0x7100004520·호출 @0x71000048e4 → op, op GameFlow @0x7100022ca0·문자열 @0x7100022ef4 → menu00 | [INTRO §3.1][INTRO] |
| [판독] 온라인 교체 | matching00 Matching_Bd, MenuWork+0xc 선택 → RequestExchangeScene | [ONLINE §3.2][ONLINE]; 이 경로의 정확한 하위 request 주소는 기존 절에 없어 만들지 않음 |
| [미확정] 전체 등록표 | boot/menu00/menu01/op/ed/matching00/gyroPadChange/mgInst/mgm 계열/게임 NRO 전체의 ID·factory 등록 | main @0x71015d840c로 전체 등록표를 대체할 수 없음; [FN][FN]·[NAMES][NAMES], U12 |

## 4. 구조체·필드·상수

### 4.1 SceneBase와 manager를 분리

| 객체 / 필드 | writer → reader·뜻 | 근거 |
|---|---|---|
| [판독] SceneBase+0x38 / +0x3c | UpdateMain / OnLoaded의 별도 단계 | main @0x71002ca780·0x71002ca37c; [CORE §4.10][CORE] |
| [판독] SceneBase+0x40/+0x48/+0x50 | 흐름 FiberLite weak handle ptr/node/gen | main @0x71002ca780 → OnCleanup @0x71002caaf0; [CORE §4.10·§4.11][CORE] |
| [판독] SceneBase+0xc0 / +0xc8 | Request*Scene가 kind s32(−1 없음, 0 Exchange, 1 Call, 2 Return, 3 Reboot) / std::string 저장 → OnMainEnd 전달 | main @0x71002caf10·0x71002caf30·0x71002caf54·0x71002caf7c → @0x71002ca9e0; [C1][C1]·[CORE §4.10][CORE] |
| [판독] SceneBase+0xe3 | fade 사용 → UpdateMain 단계2/4/5 | main UpdateMain @0x71002ca780; [TRANS §1][TRANS] |
| [판독] 구현체+0x40 / +0x44 / +0x50 / +0x54 | 장면 수명 상태 / 동기 중 / sync pause4 / scene pause5 | main ctor @0x71001c7a00·Update @0x71001c8190; [CORE §4.9][CORE] |
| [판독] sequence 내부+0x20/+0x28 | active 레코드 범위, stride0x10. @0x71001a6360이 factory 결과를 기록하고 Entry 슬롯+0x18 호출 | main @0x71001a6360 [C12][C12] |
| [판독] sequence 내부+0x38/+0x40 | 뒤처리 포인터 범위. @0x71001a52b0이 @0x71001a026c로 전달하고 end를 begin으로 돌림 | main @0x71001a52b0 [C7][C7]; helper 본체 C 없음 |
| [판독] sequence 내부+0xa0/+0xa8 | stride0x50의 다음 생성 요청 목록. 맨 앞을 복사/제거하고 factory→Entry 처리 | main @0x71001a6360 [C12][C12] |
| [미확정] sequence 내부+0xc0 | 제거 대기 카운터. SceneBase+0xc0 요청 kind와 다른 객체의 필드 | main @0x71001a6874 [C12][C12]; 각 flag/history 필드 이름은 U02 |

### 4.2 PlayerWork

| 원본 필드 | 읽기·쓰기 소유자 | 웹 대응 / 근거 |
|---|---|---|
| [판독] +0x48 CharacterID / +0xdc BaseCharacterID | charselect·메뉴 결정/복구, 게임 시작의 player normalize. main SetCharacterID @0x710021d714·Get @0x710021d724, Base setter/getter @0x710021d71c·0x710021d72c | work.player.currentCharacter/baseCharacter; [FREE §8.1][FREE]·[캐릭터 §3][CHARA] |
| [판독] +0x4c current type / +0xe0 base type | SetPlayerType @0x710021d734는 둘 다, SetPlayerTypeTmp @0x710021d77c는 current만. 메뉴/항구 복귀는 base로 복구 | work.player.currentType/baseType, type0 사람/type1 CPU; [FREE §8.1·§8.2][FREE] |
| [판독: 어셈블리] +0x74 Order | 목록 정렬/normalization·한 판 참가 순서. GetOrder main @0x710021d810 | PlayerID와 별도. [mg1802 §6 기존 목록/어셈블리 판독][RC2]·[FREE §8.1][FREE] |
| [미확정] PlayerID / TeamID / ComLevel / PadID / IsGamePlay의 물리 offset | PlayerWorkHolder·인원/캐릭터 설정·mode 시작이 쓰고 frame이 읽음. setter/getter 주소는 부록 C | 이름·호출 경계는 [FREE §8.1·§8.3][FREE], main Normalize @0x710021ea90·팀 초기화 @0x71001f1e20. C 없는 accessor에서 offset 추정 금지 |
| [판독] rank/WinLose/coin/advantage, offset 미확정 | main @0x71001f1e20가 −1/−1/0/false 초기화. 각 게임이 OnEndingInit 등에서 쓰며, frame/결과·ring 변환이 읽음 | 웹 게임 출력→frame 권한으로 work.player 기록. 원본 게임 직접 writer와 웹 경계를 구별; [FRAME §6.6·§12.12.4][FRAME]·[FREE §8.3][FREE] |

### 4.3 GameWork·MinigameModeWork·Sync·MinigameWork

| 객체 / offset | 필드·쓰기 → 읽기 | 근거 |
|---|---|---|
| [판독] GameWork offset 미확정 | MinigameID: mode CallMinigameScene이 SetMinigameID → MinigameScene ctor/GetMinigameID | main @0x71003601ac·0x71001e8b90·0x71001e8b98; [FREE §3.2][FREE]·[FRAME §4.1][FRAME] |
| [판독] GameWork offset 미확정 | GameRule/GameJudgeType/GameStage: 준비 → 한 판. freeplay judge=(rule!=0 && rule!=7) | main @0x71001f1c60; [FRAME §12.12.4][FRAME]. accessor C는 부록 C |
| [판독] MinigameModeWork+0 | Round s32. SetRound는 별도 writer, SetMinigameResult는 증가시키지 않음 | main @0x71001f0440·0x71001f0448·0x71001f0460; [FREE §6.6][FREE] |
| [판독] MinigameModeWork+0xc+i*0xc | 100칸 ring: +0 ID s32, +4 judge s32, +8~+0xb raw result byte4 | main SetMinigameResult @0x71001f0460, readers @0x71001f2a24·0x71001f2a64·0x71001f2a80; [FREE §6.6][FREE] |
| [판독] MinigameModeWork+0x4bc | entranceStartPoint s32: mgm01 준비1·ExitFlow7 → mgmet GetAndResetStartMode/InitFromMgm01 | main setter/getter @0x71001f0518·0x71001f0520, mgm01 @0x710000e2c0, mgmet @0x710004a648; [HUB §3·§8][HUB] |
| [판독] MinigameModeWork+0x761 / +0x764 | reset marker / cache valid u8. init은 marker==1일 때 둘을0; 숫자 슬롯은 보존 | main MgmetRuleSettingDataInit @0x71001f0eac; [RULE §8.1][RULE] |
| [판독] MinigameModeWork+0x768/+0x76c/+0x770/+0x774/+0x778/+0x77c | s32 CPU/VS/Star/규칙 Round/Explain/Experience index. setter들은 valid=1 | main @0x71001f0ec0·0x71001f0ed0·0x71001f0ee0·0x71001f0ef0·0x71001f0f00·0x71001f0f10; [RULE §8.1][RULE] |
| [판독] MinigameModeWork+0x780/+0x784/+0x78c | filter enum/index/favorite 기원. mode 호출 전 저장 → Continue 복원. 선택 ID는 ModeData+8, 여기서는 절대 offset 새 단정 없음 | mgm01 MgStartFlow @0x7100011a50·ContinueFlow @0x710000dad0; [FREE §8.3][FREE] |
| [미확정] MinigameModeWork MaxRound offset | SetMaxRound/GetMaxRound main @0x71001f0450·0x71001f0458은 이름·주소만 확인 | [FN][FN]·[IX][IX], C 없음. 세션 Round·cache Round index와 별도 |
| [판독] MinigameModeWorkSync+3/+0xc/+0x10~+0x24 | marker/valid/CPU·VS·Star·Round·Explain·Experience. Work와 다른 객체 | main init @0x710022eb94, getter @0x710022eb8c·setter @0x710022eba8~0x710022ebf8; [RULE §8.1][RULE] |
| [판독] ConfigInfo+0x14/+0x2c/+0x1c/+0x24/+0xc/+4 | CPU/VS/Star/Round/Explain/Experience. Work cache 순서와 다름 | mgmet ConfigInfo Load/commit: [RULE §4.2·§8.1·§8.2][RULE]; CPU/Explain 전달 @0x710005e1d0~0x710005e228는 [판독: 어셈블리] 재사용 |
| [판독] MinigameWork new/unlock/favorite | mgm01 SetupPlayData/UpdateNewIcon/Favorite가 세션 미니게임 정보 및 SaveData를 별도로 변경 | mgm01 @0x7100009850; [FREE §8.4][FREE]. MinigameModeWork ring/cache와 물리 객체를 합치지 않음 |

[판독] 규칙 취소도 CPU/Explain commit을 통과한다. CPU를 모든 PlayerWork에 적용하며, 오프라인은 Work cache도 쓰고 Sync는 항상 쓴다. mgmet Mgm01SetRuleFlow @0x710005e090·SetPlayerWorkComLevel @0x71000500d0, mgm01 SyncedSetupGame @0x7100004e50의 CPU reader는 valid 검사 없이 cache+4를 읽는다. [RULE §8.2][RULE]·[HUB §8][HUB].

## 5. 상태·수명

[판독] RequestReturnScene() @0x71002caf54는 kind2와 빈 문자열, 문자열 버전 @0x71002caf7c는 kind2와 문자열을 저장한다. kind0/1은 assign 대상이 +0xc8인 것까지 C에서 확인된다. C가 문자열 인자를 생략했으므로 해당 C만으로 포인터/인자 규약을 새로 확정하지 않는다. [C1][C1].

[판독] manager update @0x71001a52b0은 생성 시도 @0x71001a6360 → Start(+0x20) → Update(+0x28) → IsFinished(+0x38) → 기존 Shutdown 처리 @0x71001a6650 → 레코드 제거 @0x71001a6874 순을 가진다. @0x71001a6360은 요청 레코드에서 factory @0x71001a00d4를 부르고 새 포인터에 Entry(+0x18)를 호출한다. [C7][C7]·[C12][C12], Shutdown 세부는 [CORE §5.1][CORE].

[판독] @0x71001a6874는 조건 충족 뒤 active 0x10-stride 범위 선두를 memmove로 제거한다. @0x71001a52b0의 뒤처리 포인터들은 @0x71001a026c로 넘어간다. 이는 생성/정리 파이프라인의 증거이며, history가 장면 포인터를 보존하는지 이름/params만 남기는지의 증거는 아니다. [C7][C7]·[C12][C12]; 하위 C 부재는 U01/U02.

| 동작 | 확정 범위 | 웹 판정 |
|---|---|---|
| [판독] Call | OnMainEnd @0x71002ca9e0가 GetSequence→CallScene(name,seq,−1) 전달. 호출 측 Fiber Sleep(−1), cleanup 경로는 존재 | [설계] 논리 history push. 부모 instance 정책은 U01 해소 후 고정. [C1][C1]·[FREE §3.2][FREE]·[DESIGN §10.5][DESIGN] |
| [판독] Return | 빈 이름은 ReturnScene(seq), 이름 있으면 FUN_71001a8490(seq,name) | [설계] 논리 pop/named unwind. 원본 빈 스택·없는 대상 처리 U01. [C1][C1]·[FN][FN] |
| [판독] Exchange | OnMainEnd @0x71002ca9e0가 FUN_71001a8394(name,seq,1,−1) 전달 | [설계] scenes.change는 현재 논리 항목 교체. 하위 history 영향은 U01. [C1][C1]·[DESIGN §10.5][DESIGN] |
| [판독] 프레임 경계 | 요청→UpdateMain 단계4→fade 완료 단계5→거짓→OnMainEnd. 같은 Update 호출 안 즉시 교체 아님 | [설계] pending을 update 말미 봉인하고 다음 manager step에서 처리. 이 정확한 웹 경계는 원본 등가성 시험 대상. [CORE §5.2][CORE]·[TRANS §1][TRANS] |
| [판독] fade | E3 enabled이면 시작 in(마지막 종류,속도1), 출구 out(White,속도1). 속도1은 기본20f | [설계] 장면 교체 동안 공용 transition 유지; 이미 frame이 닫은 wipe를 다시 시작하지 않는 owner 계약. [TRANS §1·§3][TRANS] |
| [판독] Save 완료 | 단계16은 fade 완료와 IsProcessing=false를 기다리는 별도 조건 | [설계] scene cleanup 완료로 Save 완료를 대신하지 않음. main @0x71002e1c68, [FRAME §6.7][FRAME]·[SAVE §2][SAVE] |

[판독] ResetMinigameModeWork @0x71001efdc0는 PlayerType 복구, +0x4bc=0, 일부 목록 end/flag/계정 복구 상태를 정리한다. 이 C에는 Round/ring/cache valid/+0x761을 일괄 초기화하는 쓰기가 없다. “reset=Work 전부 zero”로 구현할 근거가 없다. 상위 caller 수명은 아직 U06/U07. [WORKC][WORKC].

## 6. 계산식·의사코드

[판독] 원본 request 전달의 축약. main @0x71002caf10·0x71002caf30·0x71002caf54·0x71002caf7c·0x71002ca9e0; [C1][C1]. requestKind와 sequence 객체의 제거 카운터는 다른 필드다.

~~~text
RequestExchangeScene(name): SceneBase.requestKind = 0; requestName.assign(name)
RequestCallScene(name):     SceneBase.requestKind = 1; requestName.assign(name)
RequestReturnScene():      SceneBase.requestKind = 2; requestName.clear()
RequestReturnScene(name):  SceneBase.requestKind = 2; requestName.assign(name)
OnMainEnd:
  0: FUN_71001a8394(name, GetSequence(), 1, -1)
  1: bex::Scene::CallScene(name, GetSequence(), -1)
  2: name.empty ? ReturnScene(GetSequence()) : FUN_71001a8490(GetSequence(), name)
~~~

[판독] ring 계산은 기존 [FREE §6.6][FREE]의 main SetMinigameResult @0x71001f0460·earliest @0x71001f2a24·count @0x71001f2a64·score @0x71001f2a80을 재사용한다. Round>=1은 caller 전제다.

~~~text
slot = (Round - 1) % 100
ring[slot] = { id, judge, rawBytes[4] }  // 이 함수는 Round를 증가시키지 않음
viewCount = min(Round, 100)
earliest(i) = ring[Round >= 100 ? (Round + i) % 100 : i]
score[p] = sum(lastUpTo100Rows where validID && byte[p] == (judge != 0))
~~~

[판독] 결과 변환 helper FUN_71001f271c @0x71001f271c는 GameRule8/10이면 judge0→[255,255,255,255], judge!=0→[2,2,2,2], 나머지는 rank 또는 WinLose raw byte를 사용한다. 실제 한 판 종료 caller는 미확정이므로 helper의 규칙과 실행 위치를 구별한다. [FREE §6.6·§11][FREE]·[FRAME §12.12.4][FRAME].

[설계] 웹 manager는 입력/seed·로더 완료·sync 완료를 주입된 입력으로 처리한다. Promise 완료 콜백은 ready bit만 기록하고 Work commit/장면 실행은 gate가 열린 고정 tick에서만 한다. [DESIGN §10.5][DESIGN]·main sync @0x71001c94cc [CORE §6.7][CORE]·[FRAME §12.12.6][FRAME].

~~~text
manager.step(gatedInput, ready):
  if FrameGate.closed: return
  consumeReadyAtTickBoundary()
  advanceLifecycleOrActiveUpdate()
  sealPendingRequest()
  // 다음 tick: 허용 대상 검사 → exit/fade → cleanup/process/complete
  // 완료 후 논리 history 변경 → entry/begin/load/complete/setup/sync/syncedSetup
  // 복귀일 때 Work를 먼저 읽을 수 있게 한 뒤 웹 onReturn 호출
~~~

## 7. 애니·효과·소리·카메라·에셋

| 경계 | 소유권·근거 |
|---|---|
| [판독] archive | 모드 BeginScene main @0x710035fab8는 mgm/mgm00 및 장면 이름 archive, ID0의 다른 bundle 경로를 준비한다. ctor @0x710035f69c는 지정 bundle 해제/UI pause 제한. [MGM §3.1][MGM] |
| [판독] wipe | 앱 수명의 WipeModule과 overlay는 장면 폐기 때 함께 사라지지 않는다. main UpdateMain @0x71002ca780 및 Wipe ctor @0x710029c710; [TRANS §1][TRANS] |
| [데이터] wipe 길이 | extracted/bea/bq.nx.bea/Parts.lyt/wipe.bflyt: WipeBlack/White/Loading out20f·in20f, CrossFade out1f·in20f. 주소 없는 애니 데이터는 이 실제 경로/애니 필드로 근거를 둔다. [TRANS §1.1][TRANS] |
| [판독] 사운드 | 모드 BGM handle은 main @0x7101c25840~0x7101c25850의 공유 정적 값. 모드 CleanupScene @0x710035fcf8의 BGM 정리는 기존 [04_sound §12.14][SOUND]·[MGM §4.3][MGM] 재사용 |
| [판독] 소리·진동 cleanup | SceneBase OnCleanup main @0x71002caaf0의 scene sound/vibration 정지는 [04_sound §13.12][SOUND] 기존 판독. 게임 종료 음향·BGM 유지 조건은 각 scene/frame/kit 소유 |
| [설계] camera/effect | 장면 resource scope가 cleanup에서 자신의 camera·effect·UI·listener를 반환한다. 상위 Work와 공용 wipe/audio는 scope와 분리. 부팅/op 카메라·effect 인계는 [INTRO §11][INTRO]; 원본 SceneBase root는 main @0x71002c9f68·0x71002caaf0 [CORE §4.10][CORE] |
| [설계] 판정 시간 | 와이프는 로직 소유자의 고정 tick으로 진행하고 gate closed에서는 멈춘다. 기존 MgWipe의 완료 관찰 +1 tick과 core20tick 차이는 승인 없이 바꾸지 않는다. [TRANS §3·§8][TRANS]·[FRAME §12][FRAME] |

## 8. 상호작용

| 객체 / 권한 | 쓰는 주체 → 읽는 주체 | 경계 |
|---|---|---|
| [판독] PlayerWork 참가/타입/캐릭터 | 인원·캐릭터 메뉴, menu01 복구, mode 준비 → scene/frame/kit | main Normalize @0x710021ea90·SetPlayerType @0x710021d734, menu01 Initialize @0x710003d0a0; [FREE §8.1][FREE] |
| [판독] PlayerWork 팀/참가/초기 결과 | mode SetupPlayInfo→main FUN_71001f1e20 → frame 입력/결과 | PlayerID와 목록 위치/Order를 구별; [FREE §8.3][FREE] |
| [판독] GameWork 한 판 요청 | mode→main CallMinigameScene @0x71003601ac → frame ctor @0x71002dedc8 | ID·설명·gyro는 같은 request 준비 경계; [FREE §3.2][FREE]·[FRAME §4.1][FRAME] |
| [판독] MinigameModeWork 규칙 | mgmet commit·mgm01 MgStartFlow @0x7100011a50 → 규칙 Load·목록 SyncedSetup @0x7100004e50 | valid와 숫자 슬롯의 서로 다른 수명; [RULE §8][RULE] |
| [판독] MinigameModeWork 복귀·ring | mode ExitFlow @0x710000e2c0 / 종료 결과 helper @0x71001f271c → hub @0x710004a648 / history·score | helper caller 미확정은 U08. [HUB §3·§8][HUB]·[FREE §6.6][FREE] |
| [판독] SaveData | PlayerID→ManageIdx/Uuid 검증 → 유효 사용자 칸 | main GetSaveData(PlayerID) @0x7100240274·FindPreselected @0x7100240424; [SAVE §1.1][SAVE]. Work는 영구 저장 객체가 아님 |
| [판독] Save count / 세션 count | SaveData.MinigameData 실제 필드: +0x118+id*6의 head u16, 판 완료 +1 상한999. mgmet @0x710005b0d0는 head!=0인 available ID 수를 셈 | head·Round·playedMinigameCount·규칙 Round index는 다른 값. [SAVE §1.2·§1.3][SAVE]·[HUB §8][HUB] |
| [설계] Save와 Work API | app/common/save 어댑터는 SaveData mutator/request/isProcessing 제공, app/common/work는 세션 상태 제공 | 자동 Work 전체 직렬화·장면 dispose 시 자동 save를 넣지 않음. main SaveRequest @0x710023ff64, [SAVE §2·§9][SAVE]·[DESIGN §10.5][DESIGN] |

[판독] 지역 NetworkManager 소멸자 menu00 @0x710002c7a0·matching00 @0x7100003a64에는 Disconnect/LeaveSession/ClearSession 호출이 없고, 세션 잔존 시 공용 SetAllListener로 넘긴다. [12_online_sync §9.2][NETLIFE]. [판독] 명시적 Disconnect menu00 @0x710002d3ec·matching00 @0x7100003db4는 NetworkModule::Disconnect와 WorkModule::ClearSession을 호출한다. [같은 문서 §9.2·§9.3][NETLIFE]. [미확정] main ClearSession @0x710029f6b0 내부의 Work 필드 초기화·보존은 C가 없어 U06/부록 C에 남긴다. [main TSV][FN]·[INDEX][IX].

→ 정리본: [12_online_sync.md](12_online_sync.md) §9.15.5
## 9. 웹 설계

### 9.1 현재 파일과 차이

[설계] 현재 [script/main.ts][MAIN]는 createGameHost/createGameFlow 구성과 최초 입력 audio resume·flow.start를 맡는다. [app/flow/index.ts][FLOW]는 FlowScreens의 page loader·FlowPlayers·playFromList·sceneIn/Out를 가진다. 최초 감사 [AUDIT §1.2][AUDIT]의 줄번호보다 현재 파일을 우선한다.

[설계] 현재 [app/common/ui/contracts.ts][CONTRACT]의 SceneRouter는 call(name,args?)·ret(result?), factory는 args/returned를 받고 SceneStack은 active instance.dispose→이름 push/pop→factory 재생성이다. MgmWork도 이 UI 계약에 섞여 있다. 따라서 §10.5의 무인자 요청/Work 계약·전체 lifecycle·change·write 권한과 아직 다르다. 이는 현재 웹 사실이며 원본 인스턴스 정책의 근거가 아니다.

### 9.2 모듈·장면 계약

| 위치 [설계] | 책임 / 의존 | 근거 |
|---|---|---|
| game/lib/scene | import 0. 수명 단계·pending request·논리 history·resource cleanup gate의 범용 core. ID/Work/DOM/network를 모름 | [DESIGN §10.1·§10.2·§10.5][DESIGN], main manager @0x71001a52b0의 단계 근거 [C7][C7] |
| `game/lib/scene-<adapter>` | 주입된 load/sync/resource bridge. core의 타입만 참조, async 완료를 ready 이벤트로 변환 | [DESIGN §10.1][DESIGN]·[CORE §5.1][CORE] |
| app/flow/{registry,scenes,host,index} | 등록표 한 곳, typed 요청·허용 대상, lifecycle host, 기존 공용 clock/FrameGate 연결 | [DESIGN §10.5·§10.6][DESIGN]; [현재 FLOW][FLOW] |
| app/common/work/{player,game,mode,modeSync,minigame,index} | 원본 객체별 저장소/offset 주석·capability·readonly view. app 수명의 한 인스턴스 | [DESIGN §10.5][DESIGN], main Work 경계 [FREE §8][FREE]·[RULE §8.1][RULE] |
| app/common/{assets,audio,input,save,transition} | 공용 core+환경 어댑터의 mpj 연결 | [DESIGN §10.1·§10.7][DESIGN]·[TRANS §3][TRANS]·[SAVE §3][SAVE] |
| app/scene/menu·world·mode·system | 메뉴/광장·항구/모드/부팅·matching·gyro의 개별 장면. 다른 scene 직접 import 없이 ID 요청 | [DESIGN §10.2·§10.3][DESIGN]; main 모드 표 @0x71015d840c [NAMES][NAMES] |
| app/minigame/{frame,kit,mg####} | frame이 Work→닫힌 setup→게임 출력→Work commit. kit/게임은 원본 계산만 수행 | [DESIGN §10.5][DESIGN]·[FRAME §12.12.4~§12.12.6][FRAME] |
| dev | registry 교체/가짜 net/trace/시험 입력. app은 dev를 import하지 않음 | [DESIGN §10.1·§10.7][DESIGN] |

[설계] 장면 계약은 onEntry, begin(반복 가능), onLoaded(완료 gate), onLoadComplete, setup, syncedSetup, update, cleanup, onCleanupProcessing, isCleanupComplete, onReturn로 한다. Begin/load와 setup을 하나의 즉시 호출로 합치지 않고, 원본 상위 OnSetup→SetupScene→SetupGame 및 OnStartUpdate→SyncedSetupScene→SyncedSetupGame 순서를 어댑터가 보존한다. main @0x71002ca2f8·0x71002ca4b0·0x71002ca65c·0x71002caaf0; [CORE §5.1][CORE]·[DESIGN §10.5][DESIGN].

[설계] scenes.call/return/change는 ID만 받고 결과/다음 장면 인자를 운반하지 않는다. requestName과 전환 kind는 범용 core에, MinigameID·gyro/설명·규칙 준비는 Work와 frame dispatcher에 둔다. 미등록 게임도 fakeResult를 만들지 않고 실패 상태를 남겨 복귀하며 ring/Round/count를 쓰지 않는다. [DESIGN §10.5][DESIGN]·main CallMinigameScene @0x71003601ac [FREE §3.2][FREE]·[FRAME §12.12.4][FRAME].

[설계] 장면 수명과 공유 렌더 lease 연결: [render_unify.md §5·8·9](render_unify.md).
### 9.3 쓰기 권한

| capability [설계] | 허용 writer / readonly reader | 원본 대응 |
|---|---|---|
| playerRoster | setplayer/charselect·메뉴 복구만 참가자·base/current·pad 쓰기; 다른 scene 읽기 | main SetPlayerType @0x710021d734·Normalize @0x710021ea90; [FREE §8.1][FREE] |
| prepareMinigame | mode만 GameWork ID/rule/judge 및 PlayerWork 팀·참가·초기 결과 쓰기; frame 읽기 | main @0x71003601ac·0x71001f1c60·0x71001f1e20; [FREE §8.3][FREE] |
| ruleCache | hub/해당 mode만 CPU/Explain 등 명시 필드 쓰기; rule UI·mode 읽기 | main cache setter @0x71001f0ec0~0x71001f0f10, mgmet commit @0x710005e090; [RULE §8][RULE] |
| entrance | mode Exit만 entranceStartPoint 쓰기, hub만 소비/reset | main @0x71001f0518·0x71001f00d0; [HUB §8][HUB] |
| commitMinigame | frame만 게임 출력에서 PlayerWork 결과와 mode ring/Round 쓰기. 실제 원본 종료 caller 확정은 U08 | main @0x71001f0460·0x71001f271c, [FRAME §12.12.4][FRAME] |
| minigameFlags / save | 목록의 NEW/favorite/unlock 세션 변경, SaveData 변경과 request를 분리 | mgm01 SetupPlayData @0x7100009850, [FREE §8.4][FREE]·[SAVE §2][SAVE] |
| modeSync | 온라인 어댑터와 지정된 sync 준비 경로만 쓰기; 로컬 규칙 commit의 기존 Sync 쓰기도 유지 | main @0x710022eba8~0x710022ebf8, [RULE §8.1·§8.2][RULE]; 세션 수명은 [ONLINE][ONLINE] |

[설계] 일반 scene cleanup은 화면 구독·지역 자원만 해제한다. 공유 세션 종료는 명시적 종료 요청과 완료 처리가 맡으며, Work 초기화는 지정된 mutator 범위로 한정한다. menu00 @0x710002c7a0·0x710002d3ec의 기존 판독과 [12_online_sync §9.2·§9.9][NETLIFE]·[DESIGN §10.5][DESIGN].

[설계] 결과 backing은 work.mode.results 하나다. DESIGN의 work.game 결과 노출은 readonly facade로 같은 backing을 가리키는 방안을 추천한다(미승인). 두 ring 또는 두 Round를 만들어 동기화하지 않는다. 원본 main SetMinigameResult @0x71001f0460은 MinigameModeWork 객체를 받는다. [FREE §6.6][FREE]·[DESIGN §10.5][DESIGN].

[설계] 모든 lifecycle/update/Work commit은 고정 f32(1/60), 주입 BexRandModule, FrameGate 입력으로 묶는다. view/render·로더 Promise·벽시계에서 Work를 변경하지 않는다. online SyncedSetup은 합의 seed/준비 gate 완료 후 한 번 호출한다. [FRAME §12.12.6][FRAME]·main @0x71001c94cc [CORE §6.7][CORE]. [미확정] 리듬 사운드 관측 입력 동기화는 U10. [판독] 원본 main @0x71001c94cc의 seed 조회 실패도 phase가 다음으로 가므로, 위 웹 gate 문구를 원본의 항상 무한 대기 보장으로 읽지 않는다. [12_online_sync §9.4·§9.11 U8][NETLIFE].

### 9.4 main.ts·app/flow 이전 순서

| 순서 [설계] | 완료 조건 / 이번 변경 범위 | 근거 |
|---|---|---|
| 1 | app/common/work로 객체·권한을 분리하고 composition root가 한 번 생성. 기존 MgmWork adapter를 같은 backing에 연결 | [CONTRACT][CONTRACT]·[DESIGN §10.5][DESIGN] |
| 2 | app/flow registry에 ID·loader·call/change 허용 목록·Work read/write 권한을 선언. 기존 FlowScreens를 loader adapter로 수용 | [FLOW][FLOW]·[DESIGN §10.6][DESIGN] |
| 3 | core 수명/요청을 도입하고 sync·load·fade·cleanup ready gate를 연결. 부모 인스턴스 정책은 U01이 열려 있는 동안 원본 확정이라고 표기하지 않음 | main @0x71001a52b0 [C7][C7]·[CORE §5.1][CORE] |
| 4 | scene page의 문자열 결과/접두 검사·args/returned→Work+요청으로 교체. hub→mode→frame→return 왕복을 먼저 검증 | [AUDIT §1.2][AUDIT]·[HUB §3·§8][HUB]·[FREE §8.3][FREE] |
| 5 | app/flow host의 기존 한 판 실행·FrameGate·seed·save hooks를 frame adapter에 유지. history 쓰기/commit 권한을 한 곳으로 모음 | [FLOW][FLOW]·[FRAME §12.12.4~§12.12.6][FRAME] |
| 6 | view/appFlow·appTransition·input·save·assets 연결을 app/common으로 이동, pages를 `app/scene/<분류>/<장면>/page`로 옮김 | [DESIGN §10.7][DESIGN] |
| 7 | script/main.ts/app/main.ts는 생성·어댑터 주입·시작만 남김. URL·trace·fake는 dev, app→dev import0 검사 | [MAIN][MAIN]·[DESIGN §10.1·§10.7][DESIGN] |

[설계] 위는 후속 구현 순서이며 이번에는 MD만 썼다. 기존 진입점 분리를 다시 하기 위한 계획이 아니라, 이미 분리된 flow 내부를 §10.5 계약으로 옮기는 순서다. [MAIN][MAIN]·[FLOW][FLOW].

## 10. 검증 기대값

| 항목 [설계] | 후속 Node 검증 기대값 | 원본 근거 |
|---|---|---|
| 수명 순서 | Entry→Start→Begin→Loaded→LoadComplete→SetupScene→SetupGame→seed gate→SyncedSetupScene→SyncedSetupGame→첫 Update를 순서대로 기록 | main @0x71001c8190·0x71002ca4b0·0x71002ca65c; [CORE §5.1][CORE] |
| 프레임 분리 | OnStartUpdate와 첫 Update가 다른 tick, gate closed에서는 update/Work/와이프 frame 불변 | main @0x71001c8190; [CORE §5.1][CORE]·[FRAME §12.12.6][FRAME] |
| 요청 봉인 | update 중 call/change/return가 즉시 dispose하지 않음. cleanup 완료 전 다음 Entry0회, 이후1회 | main @0x71002ca780·0x71002ca9e0; [CORE §5.2][CORE]·[C1][C1] |
| 이름표 | modeID0..6=[mgmet,mgm01,mgm02,mgm03,mgm04,mgm05,mgm06], hubID0..5=[4,3,1,5,2,6] | main @0x71015d840c [NAMES][NAMES]·mgmet @0x71000e3658 [HUB §4.2][HUB] |
| 복귀 지점 | freeplay Exit가7 쓰기→hub InitFromMgm01 경로→소비 후0. 같은 scene instance라고 가정한 시험은 U01 해소 전 금지 | main @0x71001f0518, mgm01 @0x710000e2c0, mgmet @0x710004a648; [HUB §3·§8][HUB] |
| cache | marker0이면 valid/index 유지, marker1이면 marker/valid만0. 취소도 CPU/Explain commit, CPU 모든 player 적용 | main @0x71001f0eac, mgmet @0x710005e090·0x71000500d0; [RULE §8][RULE] |
| ring | Round1→slot0, Round100→slot99, Round101→slot0. count100, earliest0→slot1. SetMinigameResult 전후 Round 동일 | main @0x71001f0460·0x71001f2a24·0x71001f2a64; [FREE §6.6][FREE] |
| raw 결과 | judge1에서 byte1만 승, byte2/255는0승. rule10 결과[2,2,2,2]를 bool로 정규화하지 않음 | main @0x71001f2a80·0x71001f271c; [FRAME §12.12.4][FRAME] |
| 실패 경계 | 미등록/로드 실패/중단은 ring/Round/Save head 불변, 가짜 승자 없음 | [FRAME §12.12.4][FRAME]; 원본 실패 dispatcher 동등성은 U01 |
| 쓰기 권한 | scene마다 허용 필드만 writable, game/kit에는 Work import0; mode ring backing1개 | [DESIGN §10.5][DESIGN], 원본 객체 main @0x71001f0460 [FREE §6.6][FREE] |
| Save | 사람의 유효 SaveData head만 +1 cap999, 손님 skip. request와 처리 완료를 각각 gate | main @0x71002db9f0·0x710023ff64·0x7100240168; [SAVE §1.3·§2][SAVE] |
| 결정성 | 동일 seed·gated input·ready 입력 기록에서 lifecycle/Work hash 일치, app→dev import0·로직 벽시계/Math.random0 | [FRAME §12.12.6][FRAME]·[DESIGN §10.1][DESIGN] |

[데이터] 이번 검증 범위는 문서 링크의 CommonMark 파싱·대상 파일 존재, 참조식 정의, §1~§13 구성, LF/UTF-8, 주소 목록 대조, 변경 범위다. 실행·헤드리스·화면 촬영·새 검증 스크립트·git stage/commit은 하지 않았다. [이 문서 부록 B·C](18_scene_work.md).

## 11. 미확정

| ID [미확정] | 남은 항목 / 필요한 근거 | 영향 |
|---|---|---|
| U01 | Call/Return/Exchange/named return의 history push/pop·깊이0·없는 대상·부모 instance 보존. main @0x71001a830c·0x71001a843c·0x71001a8394·0x71001a8490 C 없음; [FN][FN]·부록 C | 원본 스택 등가성, parent factory/onReturn 위치 |
| U02 | sequence 요청0x50 레코드 전체 필드·history params·factory 생성/실제 폐기. @0x71001a4c90·0x71001a4e00·0x71001a00d4·0x71001a026c C 없음; [C7][C7]·[C12][C12]·[FN][FN] | 이름/params와 instance 저장 방식 |
| U03 | 같은 frame의 다중 request 우선순위와 std::string의 누락 인자. @0x71002caf10·0x71002caf30·0x71002caf7c는 직접 저장만 확인; [C1][C1] | last-write 적용은 원본 확정이 아닌 웹 정책 후보 |
| U04 | PlayerID·TeamID·ComLevel·PadID·GamePlay·결과 물리 offset. main accessor 주소 부록 C, [FN][FN]·[IX][IX] | offset 1:1 주석과 전체 구조체 크기 |
| U05 | GameWork ID/rule/judge/stage 물리 offset. @0x71001e8b60~0x71001e8b98 C 없음; [FN][FN]·[IX][IX] | 임의 offset 배정 금지 |
| U06 | WorkModule 내부 각 Work 포인터 위치·생성/교체/전체 수명과 ClearSession의 reset 범위. getter @0x710029e4f4·0x710029e980·0x710029e98c 및 ClearSession @0x710029f6b0 C 없음; [FN][FN]·[IX][IX]·[NETLIFE §9.2·§9.3][NETLIFE] | app 수명 backing과 원본 lifetime·명시적 종료 reset 비교 |
| U07 | Work+0x761/Sync+3을 세우는 모든 writer. reset @0x71001efdc0에는 cache zero 없음, [WORKC][WORKC]; cache init @0x71001f0eac [RULE §11][RULE] | 장면 재진입 초기화·세션 끝 보존 정책 |
| U08 | freeplay 한 판 종료 ring writer의 실제 caller. FUN_71001f271c @0x71001f271c와 SetMinigameResult @0x71001f0460 규칙은 기존 판독, caller 미확정; [FREE §11][FREE] | 결과 commit 시점/중복 방지의 원본 등가성 |
| U09 | MaxRound offset·모드별 Round 증가/reset 소유자. @0x71001f0450·0x71001f0458 C 없음; [FN][FN] | 세션 Round와 규칙 index 분리 |
| U10 | online 시작 gate의 웹 범위·리듬 sound.observe 합의 입력. 원본 @0x71001c94cc와 게임 예외 [FRAME §12.12.6][FRAME]·[CORE §6.7][CORE] | 온라인 갈래에서 session lifetime/observed input 합의 |
| U11 | OnStartUpdate의 별도0x40 B 파이버: main ctor @0x71002d16fc의 실제 tick/종료 역할. [CORE §11][CORE] | 흐름 파이버 앞의 작업·pause 순서 |
| U12 | 7행 모드표 밖 전체 scene factory 등록 및 ID0 직접 caller. main @0x71015d840c [NAMES][NAMES]·menu01 @0x7100059b70 [FREE §8.1][FREE] | 전체 registry를 원본 ID라고 주장할 수 없음 |

[설계] 결과표·UI 부품에서 재사용하는 Work 공백: [ui_parts_catalog.md](ui_parts_catalog.md).
## 12. 사용자 확인

[설계] 원본 규칙을 기본으로 한다. 아래는 구현 전 미승인 추천이며 이번 분석을 진행하기 위한 승인 요청은 아니다. [DESIGN §10.5][DESIGN].

| 선택 [설계] | 미승인 추천 / 근거 |
|---|---|
| 부모 instance 정책 | 원본 하위 C 확보 전에는 논리 history를 유지하고 factory 정책을 교체 가능하게 둔다. “원본이 부모를 보존한다/재생성한다” 둘 다 확정 문구 금지. main @0x71001a830c·0x71001a843c C 없음, U01 |
| 결과 facade | work.mode.results가 원본 backing, work.game 결과 조회는 readonly alias. [FREE §6.6][FREE]·[DESIGN §10.5][DESIGN] |
| 충돌 요청 | 같은 tick의 복수 request는 개발 검증에서 명시 오류로 드러내고, 원본 우선순위가 확인되면 동일 규칙 적용. main @0x71002caf10~0x71002caf7c [C1][C1] |
| onReturn 시점 | 복귀 장면의 Work 읽기/준비 완료 뒤 한 번 알림. 원본 SceneBase virtual이 아니라 웹 계약임을 유지. [VT][VT]·[DESIGN §10.5][DESIGN] |
| 아직 없는 장면 | mgm02~06·mgInst·gyro 등의 실행 지원을 임의 대체하지 않고 등록 상태를 명시. 표 ID와 asset/NRO가 존재하는 사실과 웹 지원 여부를 분리. [NAMES][NAMES]·[AUDIT §1.2][AUDIT] |

## 13. 준비도

| 판정 [설계] | 바로 적용할 범위 / 선행 조건 |
|---|---|
| 바로 가능 | lifecycle 순서·typed 요청/registry·Work 물리 객체 분리·known cache/ring/entrance·Save 경계·write capability·main 구성 분리. main @0x71001c8190·0x71002ca9e0·0x71001f0460, [CORE][CORE]·[C1][C1]·[FREE][FREE]·[DESIGN][DESIGN] |
| 근사 필요 | 웹 로더/Promise ready·오디오 잠금·renderer scope·onReturn의 웹 알림·game 결과 facade. 승인 여부와 등가성은 §12/U10, [MAIN][MAIN]·[FRAME §12.12.6][FRAME]·[DESIGN][DESIGN] |
| 판독 필요 | 원본 stack/instance·전체 registry·GameWork/PlayerWork 미확정 offset·Work 생성 수명·cache marker writer·실제 ring commit caller·별도 pause 파이버. U01~U12·부록 C |
| 문서 범위 | §1~§13 + 부록 A/B/C. 새 판독 함수13개, 미확정12항목, 중복 제거 C 요청38주소·미식별3갈래. [부록 B](18_scene_work.md#부록-b-새-판독-목록)·[부록 C](18_scene_work.md#부록-c-ghidra-요청-표) |

## 부록 A. 출처 대응·부모 통합 한 줄

[설계] 출처 문서·README는 수정하지 않았다. 부모가 기존 줄바꿈을 보존해 아래 한 줄만 해당 절 끝/표에 추가한다. DESIGN의 기존 원문도 변경하지 않는다.

| 파일·정확한 절 [설계] | 추가할 한 줄 |
|---|---|
| web/docs/engine/README.md, 문서 표 끝 | &#124; [18_scene_work.md](18_scene_work.md) &#124; SceneBase 수명·Call/Return/Exchange·7행 모드표·Work 소유권·장면 계약/요청 API &#124; 판독 통합·stack/offset 일부 미확정 &#124; |
| web/docs/engine/01_core.md §5.2 끝 | [판독] 요청 전달·장면 스택의 미확정·Work 소유권 정리 → [18_scene_work.md](18_scene_work.md) §3~§5·§11. |
| web/docs/engine/12_online_sync.md §9.9 끝 | [설계] 공용 SceneBase·Work 소유권 및 요청/cleanup 경계 → [18_scene_work.md](18_scene_work.md) §3·§5·§8·§9. |
| web/docs/engine/common_system_audit.md §1.2 끝 | [설계] 장면 계약·요청 API·Work 소유권의 후속 구현 근거 → [18_scene_work.md](18_scene_work.md) §9·§10·§13. |
| web/docs/shell/mgm_common.md §9.6 끝 | [설계] 기존 SceneStack과 원본 인스턴스 수명 구별·Work 권한 정리 → [장면·Work](../engine/18_scene_work.md) §5·§9·§11. |
| web/docs/shell/mgm01_freeplay.md §8.3 끝 | [판독] 공용 request 전달·ring 원본 객체 소유권·웹 frame 권한 → [장면·Work](../engine/18_scene_work.md) §3~§5·§8·§9. |
| web/docs/shell/mgmet_flow.md §8 끝 | [판독] 공용 장면 요청·복귀 인스턴스 미확정 정리 → [장면·Work](../engine/18_scene_work.md) §3.3·§5·§11. |
| web/docs/shell/mgmet_ruleconfig.md §8.1 끝 | [판독] 객체별 cache·Work reset의 범위 정리 → [장면·Work](../engine/18_scene_work.md) §4.3·§5·§11. |
| web/docs/shell/minigame_scene.md §12.12.6 끝 | [설계] 공용 장면 수명·요청/Work commit과 FrameGate 경계 → [장면·Work](../engine/18_scene_work.md) §3.1·§9·§10. |

## 부록 B. 새 판독 목록

[데이터] 기존 §2.1의 함수는 재사용했다. 아래 13개는 문서에 없던 요청 전달·manager 부분·모드 동기 훅·reset 공백을 기존 C로 보강한 목록이다. C 생성/추출은 0개다. [INDEX][IX]·[FN][FN].

| 번호 | 모듈·주소 / 함수 [판독] | 상대 C / 새로 확인한 범위 |
|---|---|---|
| 1 | main @0x71002caf10 RequestExchangeScene | [C1][C1], +0xc0=0/+0xc8 assign |
| 2 | main @0x71002caf30 RequestCallScene | [C1][C1], +0xc0=1/+0xc8 assign |
| 3 | main @0x71002caf54 RequestReturnScene() | [C1][C1], +0xc0=2/문자열 clear |
| 4 | main @0x71002caf7c RequestReturnScene(name) | [C1][C1], +0xc0=2/+0xc8 assign |
| 5 | main @0x71002ca9c8 OnMainEnd | [C1][C1], 요청 dispatcher 호출 |
| 6 | main @0x71002ca9e0 FUN | [C1][C1], Call/Return/named return/Exchange 전달 주소 |
| 7 | main @0x71001a47fc FUN | [C7][C7], sequence 내부+0x10 조회 helper |
| 8 | main @0x71001a52b0 FUN | [C7][C7], manager update 순서와 뒤처리 helper |
| 9 | main @0x71001a54dc FUN | [C12][C12], active front의 anytime(+0x30) 호출/pause 조건 |
| 10 | main @0x71001a6360 FUN | [C12][C12], 생성 요청 record→factory→Entry, active 포인터 기록 |
| 11 | main @0x71001a6874 FUN | [C12][C12], 제거 대기와 active 레코드 memmove |
| 12 | main @0x71001efdc0 ResetMinigameModeWork | [WORKC][WORKC], entrance/일부 상태 reset, ring/cache 전체 clear 없음 |
| 13 | main @0x710035fcdc SyncedSetupScene | [BGM][BGM], UiPause::SetEnableOpen(0) |

## 부록 C. Ghidra 요청 표

[미확정] 아래 38주소는 [main.nso.tsv][FN]에 있고 [INDEX][IX]에는 C 행이 없다. analysis/decomp 및 허용 ghidra_work/*/out/*.c에서도 정의를 확인하지 못했다. 지금 판독/추출/어셈블리 생성은 하지 않는다. 쌍으로 쓴 주소도 중복 제거 집계에서는 각각 센다.

| 모듈 | 주소 [미확정] | 함수 / 요청 이유 |
|---|---|---|
| main | @0x71001a830c | bex::Scene::CallScene — history push·부모 보존 |
| main | @0x71001a843c | bex::Scene::ReturnScene — pop·빈 스택·재구성 |
| main | @0x71001a8394 | FUN — Exchange의 history 영향 |
| main | @0x71001a8490 | FUN — named return 대상 탐색/unwind |
| main | @0x71001a4c90 | FUN — 이름/sequence 기반 history 레코드 작성 |
| main | @0x71001a4e00 | FUN — scene params 기반 history 레코드 작성 |
| main | @0x71001a00d4 | FUN — scene factory·새 instance 생성 |
| main | @0x71001a026c | FUN — 후처리 pointer의 실제 폐기/보존 |
| main | @0x71001e8b60 / @0x71001e8b68 | GameWork Set/GetGameRule — 실제 offset |
| main | @0x71001e8b70 / @0x71001e8b78 | GameWork Set/GetGameJudgeType — 실제 offset |
| main | @0x71001e8b80 / @0x71001e8b88 | GameWork Set/GetGameStage — 실제 offset |
| main | @0x71001e8b90 / @0x71001e8b98 | GameWork Set/GetMinigameID — 실제 offset |
| main | @0x710029e4f4 | WorkModule::GetGame — 객체 위치·소유권 |
| main | @0x710029e980 | WorkModule::GetMinigameMode — 객체 위치·별도 할당 |
| main | @0x710029e98c | WorkModule::GetMinigameModeSync — 객체 위치·수명 |
| main | @0x710029f6b0 | WorkModule::ClearSession — 명시적 통신 종료의 Work reset 범위 |
| main | @0x710021d6e8 / @0x710021d6f4 | PlayerWork Set/GetPlayerID — C offset 근거 |
| main | @0x710021d700 / @0x710021d70c | PlayerWork Set/GetTeamID — 실제 offset |
| main | @0x710021d7d8 / @0x710021d7e0 | PlayerWork Set/GetComLevel — 실제 offset |
| main | @0x710021d828 / @0x710021d868 | PlayerWork Set/GetPadID — pad 형·offset |
| main | @0x710021d818 / @0x710021d820 | PlayerWork SetGamePlay/IsGamePlay — bool offset |
| main | @0x710021da7c / @0x710021da84 | PlayerWork Set/GetMinigameWinLose — 실제 offset |
| main | @0x710021da8c / @0x710021da94 | PlayerWork Set/GetMinigameRank — 실제 offset |
| main | @0x710021da9c / @0x710021daa4 | PlayerWork Set/GetMinigameCoin — 실제 offset |
| main | @0x71001f0450 / @0x71001f0458 | MinigameModeWork Set/GetMaxRound — offset·상위 writer |

[미확정] 주소 미식별은 별도 3갈래다. 주소를 만들어 요청 주소 수에 포함하지 않는다.

| 모듈 / 미식별 갈래 [미확정] | 이유·현재 근거 |
|---|---|
| main / cache marker 전체 writer | MinigameModeWork+0x761·Sync+3을 세우는 모든 함수. 현재 init @0x71001f0eac·0x710022eb94만 기존 [RULE §11][RULE] |
| main 및 각 NRO / 전체 scene registry 등록 | 7행 mode 표 밖 이름→factory 등록 주소. 현재 factory 소비 @0x71001a6360 [C12][C12]·mode 표 @0x71015d840c [NAMES][NAMES] |
| main / 별도0x40 B 파이버의 vt+0x20 target | ctor caller @0x71002d16fc는 기존 [CORE §11][CORE], 실행 target 미식별 |

[DESIGN]: ../../DESIGN.md
[CORE]: 01_core.md
[AUDIT]: common_system_audit.md
[TRANS]: 15_transition.md
[SAVE]: 16_save.md
[MGM]: ../shell/mgm_common.md
[FREE]: ../shell/mgm01_freeplay.md
[HUB]: ../shell/mgmet_flow.md
[RULE]: ../shell/mgmet_ruleconfig.md
[FRAME]: ../shell/minigame_scene.md
[SELECT]: ../shell/modeselect.md
[INTRO]: ../shell/plaza_intro.md
[ONLINE]: ../shell/online.md
[NETLIFE]: 12_online_sync.md
[SOUND]: 04_sound.md
[CHARA]: 09_character.md
[RC2]: ../minigame/mg1802.md
[IX]: ../../../analysis/decomp/INDEX.tsv
[FN]: ../../../analysis/functions/main.nso.tsv
[MODFN]: ../../../analysis/functions/
[C1]: ../../../analysis/decomp/core_b1.c
[VT]: ../../../analysis/decomp/core_b6.c
[C7]: ../../../analysis/decomp/core_b7.c
[C12]: ../../../analysis/decomp/core_b12.c
[MC1]: ../../../analysis/decomp/mgmcommon_main1.c
[BGM]: ../../../analysis/decomp/bgm_main_mgmscene.c
[WORKC]: ../../../analysis/decomp/mgmet_main_work.c
[NAMES]: ../../../analysis/mgmet_main_scene_data.txt
[MAIN]: ../../script/main.ts
[FLOW]: ../../script/app/flow/index.ts
[CONTRACT]: ../../script/app/common/ui/contracts.ts


## 후속 보강: §11·§13·부록 B/C

[데이터] 초판 본문과 부모 통합분 55,104 B는 그대로 보존했다. 아래 §11.1~§11.3·§13.1·B.1은 C471 시점의 첫 후속 기록이며, 새 docs_gap C 반영 후의 현재 판독·집계·요청은 §11.4 이후와 §13.2·B.2·C.1을 우선한다. 초판의 “C 없음”·13함수/38주소 집계도 당시 snapshot이다. 원본 실행/추출·코드·INDEX 수정은 없다.

### 11.1 후속 후보·caller/callee·데이터 일괄 목록

[데이터] 2026-10-10 후속은 현재 INDEX·모듈 TSV와 허용 C471파일의 함수 헤더/호출 위치를 먼저 대조했다. 최초13함수와 다른 갈래의 완료 판독 본문은 다시 읽지 않았다. 아래 가용 C5함수만 새로 읽었고, C 없는 API는 부록 C로 보냈다. [INDEX][IX]·[main TSV][FN]·[모듈 TSV 폴더][MODFN].

| 후보/경로 | 가용성과 처리 [데이터] |
|---|---|
| main Call/Return/Exchange @0x71001a830c·0x71001a843c·0x71001a8394·0x71001a8490 → history @0x71001a4c90·0x71001a4e00 → factory/폐기 @0x71001a00d4·0x71001a026c | TSV 있음, INDEX와 C 헤더 본체 없음. 최초 §3·§5·부록 B의 manager 판독 재사용; 하위8주소는 요청 유지 |
| main SceneModule::GetSequence @0x710019f324 / SceneSequence::IsCurrentSceneShutdownComplete @0x71001a4b44 / EnumerateHistoryName @0x71001a51b8 | TSV 있음·C 없음. matching00 ComUiMinigameScreen Update @0x71000187cc·IsFinished @0x7100018d20가 shutdown 조회를 부르는 호출 위치만 확보; [matching C][MATCHC]. 이름/조회가 parent instance 보존 증거는 아님 |
| main OnEntry @0x71002c9f68 → FUN_710029e700 → 기존 SceneCategory @0x710029e4fc | setter C 있음 [SCLOAD][SCLOAD]; caller 위치만 대조. 분류는 [06_scene_data §1.5][SCENE_DATA] 재사용, setter만 새 판독 |
| main WorkModule GetPlayers @0x710029e4e8 / GetGame @0x710029e4f4 / GetMinigameMode @0x710029e980 / GetMinigameModeSync @0x710029e98c | TSV 있음·C 없음. 반환 객체 이름과 물리 포인터 offset/할당 수명은 분리; 기존 PlayerWorkHolder::Initialize @0x710021e5a0는 [FREE §8.1][FREE] 재사용 |
| menu00 Scene ctor @0x71000456f8 / menu01 Scene ctor @0x71000395d4 → ResetGameModeWork → ResetMinigameModeWork → ResetMinigameModeWorkSync | 실제 [menu00 out C][MENU00C]·[menu01 out C][MENU01C] 및 각 TSV 있음, INDEX 미수록. 공용 Work 호출 부분만 새 판독; 원본 인자 일부 생략은 유지 |
| main ResetMinigameModeWorkSync @0x710022eaf4 / RmGameWork::InitRmGameModeWork @0x7100428d14 | INDEX·TSV·C 모두 있음. [WORKC][WORKC]·[RMWORK][RMWORK]; 두 함수만 새 판독. 기존 ResetMinigameModeWork @0x71001efdc0·rc_stage01 cleanup은 재사용 |
| main Exists/Reserve/ResetGameModeWork @0x710029e99c·0x710029e9ac·0x710029ea08 / GetGameModeWorkSize @0x710029ea1c / GetPlayMode @0x710029e6f8 | TSV 있음·C 없음. 0x728 예약 caller는 위 @0x7100428d14, reset caller는 위 두 menu ctor; 부록 C의 최소 후속 API |
| main FiberWatchNetError ctor @0x71002d16fc / Update 후보 @0x71002d1b20 | 이름·정상 경로는 [MG0122 §3.5][MG0122] 재사용. ctor C는 기존 판독, Update 후보는 현 TSV/INDEX/C 본체 없음. 후보 주소를 새 함수 시작으로 확정하지 않음 |
| 온라인 Work 접점 | menu01 Disconnect @0x710002fcac, matching00 Leave @0x7100004ab0·Fiber @0x710000c500의 ClearSession 접점은 [NETLIFE §9.13.1·§9.13.2][NETLIFE] 재사용. main ClearSession @0x710029f6b0 본문은 없고 후속 담당은 [NETLIFE §9.14.4 R16][NETLIFE] |

### 11.2 새로 좁힌 Work·요청·파이버 경계

[판독] main FUN_710029e700 @0x710029e700은 OnEntry @0x71002c9f68에서 전달받는 WorkModule 객체의 +0x12b8에 s32 모드 값을 쓴다. 호출 위치는 [C1][C1], 같은 instance pointer를 WorkModule::GetGame에 넘기는 기존 main CallMinigameScene @0x71003601ac의 [BGM][BGM]·[FREE §3.2][FREE]로 객체를 대조했다. category 판정 @0x710029e4fc는 [SCENE_DATA §1.5][SCENE_DATA] 재사용이며 아래 writer만 새 [SCLOAD][SCLOAD]다.

| SceneCategory / 이름 조건 [판독] | WorkModule+0x12b8 기록 또는 보존 |
|---|---|
| 1, name[4]='1'~'6' | 각각1~6; '4' 또는 's'는4, 't'는0 |
| 2 / 3 | 각각7 / 8 |
| 4, name[3]='t' / 그 밖 | 각각9 / 10 |
| 5 / 6 | 각각11 / 12 |
| 7, name[3]='t' / '1'~'4' | 각각13 / 14~17 |
| 8 | 18 |
| 0 / 9 | 이전 값 보존 |
| −1이면서 gyroPadChange | 이전 값 보존 |
| 나머지 분기 | −1 |

[미확정] 위 값은 7행 scene 이름표의 ID나 factory 등록 순서가 아니다. main GetPlayMode @0x710029e6f8의 C도 없으므로 getter가 +0x12b8을 읽는다고 새로 확정하지 않는다. [FN][FN]·부록 C. [설계] app/common/work는 이 값을 명시적 scene-entry mutator로 관리하고, 미니게임·gyro 진입에서 무조건0으로 초기화하지 않는다. 원본 writer @0x710029e700 [SCLOAD][SCLOAD]·[DESIGN §10.5][DESIGN].

[판독] menu00 @0x71000456f8·menu01 @0x71000395d4 생성자의 공용 순서는 ResetGameModeWork→GetMinigameMode/ResetMinigameModeWork→GetMinigameModeSync/ResetMinigameModeWorkSync다. 두 함수의 Work 접점만 새 [MENU00C][MENU00C]·[MENU01C][MENU01C]로 읽었다. [미확정] C가 this 인자를 일부 생략하므로 객체 전달 ABI·ResetGameModeWork의 해제/zero 범위까지 이 caller에서 복원하지 않는다. main @0x710029ea08 [FN][FN]·부록 C.

[판독] Sync reset main @0x710022eaf4는 this+1에 u16=0 한 번을 쓴다. 즉 +1/+2만0이고 +3 marker·+0xc valid·index 슬롯에는 쓰지 않는다. [WORKC][WORKC]. 기존 mode reset @0x71001efdc0도 ring/cache 전체 zero가 아니라는 §5 판독과 함께 사용한다. [설계] menu 진입 reset을 work 전체 대입이나 result ring 삭제로 구현하지 않는다. [DESIGN §10.5][DESIGN]·위 두 원본 주소.

[판독] main RmGameWork::InitRmGameModeWork @0x7100428d14는 ExistsGameModeWork가 false일 때만 ReserveGameModeWork(0x728)을 요청하고 반환 buffer로 this+8에서 0x728 B를 memcpy한다. [RMWORK][RMWORK]. 기존 rc_stage01 cleanup @0x710002c5f4의 PushRmGameModeWork·중간 중단 시 ResetGameModeWork와 scene 간 복사는 [RC_STAGE §3·§5][RC_STAGE] 재사용한다. [미확정] reserve/reset 본체 @0x710029e9ac·0x710029ea08은 없어 allocator·buffer pointer offset·전체 앱 수명은 미확정이다. [FN][FN]·부록 C.

[설계] WorkModule의 generic GameModeWork buffer, RmGameWork 장면 객체, MinigameModeWork의 결과 ring/cache를 별도 소유 단위로 모델링한다. 공유 상태가 buffer로 전달되는 증거를 “호출 장면 instance가 살아 있다”는 근거로 쓰지 않는다. main @0x7100428d14 [RMWORK][RMWORK]·기존 [RC_STAGE §3][RC_STAGE]·[DESIGN §10.5][DESIGN].

[판독] 최초 요청 C의 직접 저장 규칙상 같은 SceneBase에 순차로 Request*Scene를 호출하면 뒤의 kind/name 쓰기가 남는다. RequestReturnScene()은 이름도 비운다. main @0x71002caf10·0x71002caf30·0x71002caf54·0x71002caf7c의 기존 §4.1·§6 [C1][C1]을 재사용하며 새 함수 수에 넣지 않는다. [미확정] 여러 caller의 실제 실행 순서·동시 호출 여부·생략된 string 인자 규약은 U03 잔여다.

[판독] main ctor @0x71002d16fc의 공용 0x40 B 파이버는 FiberWatchNetError다. 기존 [MG0122 §3.5][MG0122]에는 Update 후보 @0x71002d1b20의 Sleep(0.25)→Net::IsLeftError와 오류 pause/UI 처리가 있다. [미확정] 후보는 현 main TSV와 C 본체에 없어 virtual 결합·전체 오류/종료 규칙은 독립 검증하지 못했다. [FN][FN]·[INDEX][IX]·부록 C. 벽시계 polling이나 매 tick 검사로 대체할 원본 근거는 없다.

[판독] 온라인 후속의 matching00 @0x7100004ab0·0x710000c500은 silent 객체 IsCompleted 대기 뒤 Work ClearSession/오류로 이어진다. menu01 @0x710002f840 지역 관리자 소멸은 ClearSession을 호출하지 않는다. [NETLIFE §9.13.1·§9.13.2][NETLIFE]. [미확정] 완료를 SDK 성공 또는 모든 Work zero로 일반화하지 않는다. main @0x710029f6b0 내부는 온라인 담당의 C 공백이며 이 갈래는 재판독하지 않았다.

### 11.3 후속 해결·차단 판정

[데이터] 최초 U01~U12 기준으로 완전 해결0·부분 해결6(U03/U04/U06/U07/U11/U12)·진전 없음6이다. 부분 해결도 잔여를 포함하므로 열린 상위 항목은12개다. 새 판독5·누계18함수이며 온라인 누계41함수는 재사용 근거로만 세고 이 갈래 함수 수에 더하지 않는다. [부록 B](18_scene_work.md#부록-b-새-판독-목록)·[NETLIFE §9.14][NETLIFE].

| ID·후속 상태 [미확정] | 확보/잔여 근거 | 구현 차단 여부 [설계] |
|---|---|---|
| U01 진전 없음 | main Call/Return/Exchange/named return @0x71001a830c·0x71001a843c·0x71001a8394·0x71001a8490 C 없음, [FN][FN] | 원본 instance/history 동일성 차단; 웹 논리 stack은 교체 가능한 정책으로 구현 가능 |
| U02 진전 없음 | main history/factory/폐기 @0x71001a4c90·0x71001a4e00·0x71001a00d4·0x71001a026c C 없음, [FN][FN] | 원본 params·생성/폐기 수명 차단 |
| U03 부분 해결 | 동일 객체 순차 저장은 main @0x71002caf10~0x71002caf7c의 기존 [C1][C1]; caller 순서·string 인자는 잔여 | 순차 last-write 구현 가능; 원본 경쟁 caller 순서 동일성 차단 |
| U04 부분 해결 | 0x100 B 초기 크기는 main @0x710021e5a0 [FREE §8.1][FREE]; accessor offset C 없음 | 명시 필드 모델 가능; 물리 offset 1:1 대조 차단 |
| U05 진전 없음 | GameWork accessor main @0x71001e8b60~0x71001e8b98 C 없음, [FN][FN] | 이름 있는 논리 API 가능; 물리 offset 대조 차단 |
| U06 부분 해결 | mode writer main @0x710029e700 [SCLOAD][SCLOAD], buffer producer @0x7100428d14 [RMWORK][RMWORK], 두 menu ctor는 §11.2 | +0x12b8·예약/copy·reset 호출 연결 가능; getter 포인터·allocator/reset·앱 전체 수명 차단 |
| U07 부분 해결 | main Sync reset @0x710022eaf4의 +1/+2만0 [WORKC][WORKC]; +0x761/+3 true writer 미확보 | 단일 reset 범위 구현 가능; 재진입 cache 전체 수명 차단 |
| U08 진전 없음 | main helper @0x71001f271c·writer @0x71001f0460는 기존 [FREE §6.6·§11][FREE]; 현 C 직접 caller 새 확보 없음 | 한 판 commit 시점/중복 방지 원본 동일성 차단 |
| U09 진전 없음 | main MaxRound @0x71001f0450·0x71001f0458 C 없음, [FN][FN] | Round 증가/reset·MaxRound 원본 배치 대조 차단 |
| U10 진전 없음 | main sync @0x71001c94cc 기존 [CORE §6.7][CORE]와 [NETLIFE §9.14][NETLIFE]의 상위 gate 잔여 | 웹 FrameGate 연결 가능; 전체 원본 gate·관측 입력 합의 차단 |
| U11 부분 해결 | FiberWatchNetError ctor main @0x71002d16fc, Update 후보 @0x71002d1b20는 [MG0122 §3.5][MG0122]; 후보 C/FN 없음 | 감시 역할 연결 가능; virtual 결합·오류 pause/UI 전체 차단 |
| U12 부분 해결 | 이름 분류→mode 값 main @0x710029e700 [SCLOAD][SCLOAD]; 7행 표 @0x71015d840c [NAMES][NAMES] | 명시 registry 설계 가능; 원본 전체 factory 등록·ID0 직접 lookup 차단 |

[판독] 온라인 최신 menu01 SetupGame @0x7100039b90의 Normalize/SetPlayerID/PadID·ControllerAssign과 ExitImpl @0x7100055d70의 base 복구·RestoreLocalPlayerData, matching00 PlaySessionFiber @0x7100009280의 WorkModule::PlaySession은 [NETLIFE §9.14.2][NETLIFE] 재사용이다. [미확정] getter SSA/인자 일부는 그 문서대로 미확정이며 menu 진입 CPU 분류를 게임 중간 복구로 확대하지 않는다. ClearSession main @0x710029f6b0는 같은 공용 요청을 온라인 §9.14.4 R16에서 관리한다.

### 13.1 후속 준비도 집계

| 판정·묶음 수 [설계] | 이번 문서의 묶음 정의 |
|---|---|
| 바로 가능5 | (1) 수명/순차 요청 저장, (2) Work 객체·권한·Player 초기 크기, (3) known cache/ring/entrance·Sync bounded reset, (4) mode writer·menu reset 호출·buffer bridge, (5) Save 경계·composition 이동. main @0x71002ca9e0·0x710022eaf4·0x710029e700·0x7100428d14, §3~§5·§9·§11.2 및 [DESIGN §10.5][DESIGN] |
| 근사 필요4 | (1) load/ready 어댑터, (2) 브라우저 audio/renderer, (3) 웹 onReturn 알림, (4) work.game readonly 결과 facade. §9·§12 및 [DESIGN §10.5][DESIGN]; 사용자 선택은 미승인 추천 유지 |
| 판독 필요8 | (1) stack/history/instance, (2) 전체 factory registry, (3) Player/Game 물리 offset, (4) Work getter/allocator/reset/앱 수명, (5) cache marker writer, (6) ring/MaxRound commit, (7) 전체 online gate/관측 입력, (8) 감시 virtual/오류 전체. §11.3 U01~U12·부록 C |

[미확정] 위는 명시한 기능 묶음의 개수이며 원본 구현 완성률이나 실행 성공률이 아니다. 47주소만으로 모든 잔여가 해결된다고 보장하지 않는다. [FN][FN]·[INDEX][IX]·§11.3.

### B.1 후속 새 판독5함수

[데이터] 최초13함수와 구별해 아래5함수만 후속 새 판독으로 센다. 누계18함수, 새 C/추출0이다. main 3함수는 INDEX·TSV·C 헤더 확인, NRO ctor 2함수는 INDEX 미수록이지만 해당 모듈 TSV·실제 out C 헤더로 확인했다. [IX][IX]·[FN][FN]·[menu00 TSV][MENU00FN]·[menu01 TSV][MENU01FN].

| 번호 | 모듈·주소 / 함수 [판독] | 새로 읽은 범위·상대 C |
|---|---|---|
| F01 | main @0x710029e700 FUN_710029e700 | WorkModule+0x12b8의 이름 분류별 write/preserve, [SCLOAD][SCLOAD] |
| F02 | main @0x710022eaf4 ResetMinigameModeWorkSync | this+1 u16 zero만 확인, [WORKC][WORKC] |
| F03 | menu00.nro @0x71000456f8 Scene::Scene | 공용 Work reset 호출 부분만, [MENU00C][MENU00C] |
| F04 | menu01.nro @0x71000395d4 Scene::Scene | 공용 Work reset 호출 부분만, [MENU01C][MENU01C] |
| F05 | main @0x7100428d14 RmGameWork::InitRmGameModeWork | Exists→Reserve(0x728)→memcpy(this+8), [RMWORK][RMWORK]; 게임별 payload 규칙은 확장하지 않음 |

[SCLOAD]: ../../../analysis/decomp/scene_loader.c
[SCENE_DATA]: 06_scene_data.md
[MG0122]: ../minigame/mg0122.md
[MENU00C]: ../../../ghidra_work/online/out/menu00.nro.c
[MENU01C]: ../../../ghidra_work/online/out/menu01.nro.c
[RMWORK]: ../../../analysis/decomp/main_ca_rm.c
[RC_STAGE]: ../minigame/rc_stage01.md
[MATCHC]: ../../../analysis/decomp/online_matching00.c
[MENU00FN]: ../../../analysis/functions/menu00.nro.tsv
[MENU01FN]: ../../../analysis/functions/menu01.nro.tsv

### 11.4 docs_gap C 반영: 가용성·새 판독37함수

[데이터] 부모 통합 검토 뒤 실제 [docs_gap_main.c][GAP]와 INDEX를 재확인했다. 초판 요청38주소 모두 C가 생겼다. 이 갈래는 ClearSession @0x710029f6b0를 제외한 main 37함수만 새로 읽었고, 그 함수의 기존 caller/C 본문은 반복하지 않았다. ClearSession은 온라인 담당의 결과를 재사용한다. [INDEX][IX]·[main TSV][FN]·[NETLIFE][NETLIFE]. 새 C 생성·추출은 이 갈래에서0이다.

| 새 판독 묶음 [데이터] | main 주소·개수 / 새로 좁힌 부분 |
|---|---|
| 장면 요청/history/factory/release | @0x71001a830c·0x71001a843c·0x71001a8394·0x71001a8490·0x71001a4c90·0x71001a4e00·0x71001a00d4·0x71001a026c, 8함수 |
| GameWork accessor | @0x71001e8b60·0x71001e8b68·0x71001e8b70·0x71001e8b78·0x71001e8b80·0x71001e8b88·0x71001e8b90·0x71001e8b98, 8함수 |
| WorkModule getter | @0x710029e4f4·0x710029e980·0x710029e98c, 3함수 |
| PlayerWork accessor | @0x710021d6e8·0x710021d6f4·0x710021d700·0x710021d70c·0x710021d7d8·0x710021d7e0·0x710021d828·0x710021d868·0x710021d818·0x710021d820·0x710021da7c·0x710021da84·0x710021da8c·0x710021da94·0x710021da9c·0x710021daa4, 16함수 |
| MaxRound accessor | @0x71001f0450·0x71001f0458, 2함수 |

[데이터] 새 callee 후보는 아래 C.1에 먼저 목록화했다. 현 C485파일의 함수 헤더·INDEX·main TSV에서 그24주소의 본체는 없다. wrapper C 확보를 하위 helper 전체 확보로 세지 않는다. [GAP][GAP]·[INDEX][IX]·[FN][FN]·[현재 요청](18_scene_work.md#c1-현재-ghidra-요청24주소).

### 11.5 장면 스택과 embedded Work의 최신 근거

| 경로 [판독] | 새 main C에서 확정한 호출·반환 | 남은 경계 [미확정] |
|---|---|---|
| CallScene @0x71001a830c | 이름 검증 @0x710019fd28 성공→GetSequence→FUN_71001a4bcc(seq,2)→FUN_71001a4808(seq,name,pause). 실패는 AbortImpl. [GAP][GAP] | Call의 active/history 이동은 @0x71001a4808 C 필요 |
| ReturnScene @0x71001a843c | GetSequence→FUN_71001a4bcc(seq,2)→FUN_71001a4968(seq,1)의 bool 반환. [GAP][GAP] | 빈 스택·parent resume/recreate는 @0x71001a4968 C 필요 |
| Exchange @0x71001a8394 | 이름 검증 성공→flag 인자 bit0이면 @0x71001a4c10→@0x71001a4bcc(seq,2)→@0x71001a4f30→@0x71001a4808. 실패는 AbortImpl. SceneBase 전달 인자는1이라는 최초 §6 판독 재사용. [GAP][GAP]·[C1][C1] | helper 이름만으로 전체 history clear/pop을 확정하지 않음 |
| named return @0x71001a8490 | @0x71001a51d0(seq,callback,1)로 이름 목록을 얻고 길이·memcmp 일치 검색. 목표 없음/목록 없음은 false. 일치 위치의 앞선 항목 수 n>1이면 @0x71001a4f30을 n−1회, 이어 @0x71001a4bcc(seq,2)·@0x71001a4968(seq,n!=0)의 bool 반환. [GAP][GAP] | 목록 열거 방향·현재 scene 포함 여부·최종 instance는 @0x71001a51d0/@0x71001a4968 C 필요 |
| history 기록 @0x71001a4c90·0x71001a4e00 | sequence+0x50 begin/+0x58 end/+0x60 capacity, 레코드 stride0x50. +0x68의 u32 상한에 걸리면 선두 기록을 제거하고 뒤 기록을 옮긴 뒤 새 기록을 넣는다. 이름 기반 builder @0x71001a5c04 / params 기반 builder @0x71001a6128 / copy @0x71001a5eb0. [GAP][GAP] | 상한 기본값·각 필드·SceneParams가 instance를 참조하는지 미확정 |
| factory @0x71001a00d4 | registry descriptor 조회 @0x71001a2900→전후 listener virtual+0x30 알림(kind1/2)→factory helper @0x71001a29e0 반환 pointer. descriptor 없으면 null. [GAP][GAP] | 전체 등록표·실제 new/pool/reuse 정책은 두 helper C 필요 |
| release @0x71001a026c | scene virtual+0x58 이름으로 descriptor 조회, listener kind3→scene virtual+8 호출. descriptor+0xd0 양수면1일 때 @0x71001a8ee0, descriptor virtual+0x38, count−1·listener kind4. 조회 실패/종료 count 분기에서 Abort 경계도 있다. [GAP][GAP] | virtual+8 실제 구현·descriptor 가상 함수·하위 unload C 없이 모든 Call의 부모가 폐기된다고 일반화하지 않음 |

[판독] 위 history 기록·factory/release는 부모 보존 문제를 실제 하위 함수로 좁힌다. [미확정] Call→어떤 active 항목을 release할지·history 안에 instance가 들어가는지·복귀 factory가 새 object를 만드는지는 아직 연결되지 않았다. main @0x71001a4808·0x71001a4968·0x71001a5c04·0x71001a6128·0x71001a29e0 C 없음, [FN][FN]·C.1. [설계] 웹 parent 정책은 교체 가능하게 두고 동등성 확정 문구를 넣지 않는다. 원본 이름 검증 실패는 Abort이므로 미등록 대상은 요청 전 registry에서 걸러내며, 브라우저 오류 표시 방식은 미승인 추천이다. main @0x71001a830c·0x71001a8394 [GAP][GAP]·[DESIGN §10.5][DESIGN].

| 원본 객체·필드 [판독] | offset·API | 근거·쓰기/읽기 경계 |
|---|---|---|
| WorkModule→GameWork | GetGame은 this+0xfc, pointer load/새 할당 없음 | main @0x710029e4f4 [GAP][GAP]; module 수명에 종속된 embedded view |
| WorkModule→MinigameModeWork | GetMinigameMode는 this+0x12e8, pointer load/새 할당 없음 | main @0x710029e980 [GAP][GAP]; ring/cache/entrance의 상대 offset은 이 view 기준 |
| WorkModule→MinigameModeWorkSync | GetMinigameModeSync는 this+0x5dc, pointer load/새 할당 없음 | main @0x710029e98c [GAP][GAP]; Work cache와 별도 embedded 영역 |
| GameWork GameRule | +0x0, 4 B; Set/GetGameRule | main @0x71001e8b60·0x71001e8b68 [GAP][GAP]; mode 준비→frame |
| GameWork GameJudgeType | +0x4, 4 B; Set/GetGameJudgeType | main @0x71001e8b70·0x71001e8b78 [GAP][GAP]; mode 준비→frame/결과 |
| GameWork GameStage | +0x8, 4 B; Set/GetGameStage | main @0x71001e8b80·0x71001e8b88 [GAP][GAP]; stage 준비→frame |
| GameWork MinigameID | +0xc, 4 B; Set/GetMinigameID | main @0x71001e8b90·0x71001e8b98 [GAP][GAP]; CallMinigameScene→ctor |
| PlayerWork PlayerID | +0x40, 4 B; setter 입력·getter 출력 pointer의 값 복사 | main @0x710021d6e8·0x710021d6f4 [GAP][GAP]; roster/online mapping→input/frame |
| PlayerWork TeamID | +0x44, 4 B | main @0x710021d700·0x710021d70c [GAP][GAP]; mode 준비→frame |
| PlayerWork ComLevel | +0x50, 4 B | main @0x710021d7d8·0x710021d7e0 [GAP][GAP]; rule commit→CPU |
| PlayerWork GamePlay | +0x78, 1 B bool API | main @0x710021d818·0x710021d820 [GAP][GAP]; mode/frame 참가 준비→한 판 |
| PlayerWork WinLose / Rank / Coin | 각각+0x7c / +0x80 / +0x84, 4 B | main @0x710021da7c·0x710021da84 / 0x710021da8c·0x710021da94 / 0x710021da9c·0x710021daa4 [GAP][GAP]; 게임 결과 writer→frame/ring |
| PlayerWork PadID API | member offset을 읽거나 쓰지 않음. this+0x40 PlayerID로 InputModule mapping setter @0x7100191390 / InputModule::GetPadId에 위임 | main @0x710021d828·0x710021d868 [GAP][GAP]; roster/online entry→input mapping. PadID 저장소를 PlayerWork에 중복 생성하지 않음 |
| MinigameModeWork MaxRound | +0x4, 4 B Set/Get. Round+0·규칙 cache Round index와 별도 | main @0x71001f0450·0x71001f0458 [GAP][GAP]; 실제 증가/reset caller는 U09 잔여 |

[판독] 위 GetGame/GetMinigameMode/GetMinigameModeSync C는 child 주소가 WorkModule 내부인 것을 확정한다. [미확정] WorkModule 자체 생성/파괴·교체 시점은 별도이며 generic ReserveGameModeWork buffer도 그 세 embedded view와 같다는 근거가 없다. main @0x710029e4f4·0x710029e980·0x710029e98c [GAP][GAP], @0x7100428d14 [RMWORK][RMWORK]·C.1.

[설계] app/common/work는 한 WorkModule 소유자 아래 player/game/mode/modeSync의 명시 view를 제공한다. 결과 ring backing은 mode 하나, GameWork 결과 facade는 readonly alias라는 §12 추천을 유지한다. PadID API는 app/common/input의 PlayerID→PadID mapping adapter로 연결하고 온라인 entry writer와 mode Exit 복구 권한을 분리한다. main @0x710021d828·0x710021d868 [GAP][GAP], menu01 @0x7100039b90·0x7100055d70의 [NETLIFE §9.14.2][NETLIFE]·[DESIGN §10.5][DESIGN]. SaveData 자동 직렬화/scene dispose 전체 Work reset 근거는 여전히 없다.

### 11.6 최신 해결·잔여·검증 기대값

[데이터] 최신 집계는 최초13 + 첫 후속5 + docs_gap37 = 누계55함수(이번 추가42)다. 최초 U12항목 중 완전 해결1(U05)·부분 해결9(U01/U02/U03/U04/U06/U07/U09/U11/U12)·진전 없음2(U08/U10), 열린 상위 항목11개다. 실제 필드나 wrapper가 해결된 것과 전체 수명이 해결된 것을 구별한다. [§11.4·§11.5](18_scene_work.md#114-docs_gap-c-반영-가용성새-판독37함수)·[GAP][GAP].

| U·최신 상태 [미확정] | 해결한 부분 / 남은 부분 | 차단 판정 [설계] |
|---|---|---|
| U01 부분 해결 | main Call/Return/Exchange/named return @0x71001a830c·0x71001a843c·0x71001a8394·0x71001a8490 wrapper·named 목표 없음 false 확인 [GAP][GAP]; lower queue/pop·빈 스택·instance 정책은 잔여 | wrapper/요청 오류 경계 가능, 원본 parent 보존 등가성 차단 |
| U02 부분 해결 | history main @0x71001a4c90·0x71001a4e00의0x50 record·상한, factory/release @0x71001a00d4·0x71001a026c 경로 확인 [GAP][GAP]; record 필드/실제 factory·가상 종료 결합은 잔여 | 기록 container 대응 가능, instance와 params 전체 수명 차단 |
| U03 부분 해결 | main 요청 @0x71002caf10~0x71002caf7c 기존 순차 last-write [C1][C1]; 실제 복수 caller 순서·string 생략 인자는 잔여 | 단일 순차 저장 가능, 전체 tick 순서 대조 차단 |
| U04 부분 해결 | main 16accessor @0x710021d6e8~0x710021daa4에서 PlayerID/TeamID/ComLevel/GamePlay/WinLose/Rank/Coin·PadID 위임 해결 [GAP][GAP]; MinigameAdvantage accessor @0x710021da6c·0x710021da74 C 없음 [FN][FN] | 확보 필드·Input mapping 경계 가능, Advantage 물리 offset만 추가 차단 |
| U05 해결 | main GameWork 8accessor @0x71001e8b60~0x71001e8b98의 rule0/judge4/stage8/id+c 확인 [GAP][GAP] | 요청한4필드 물리 배치 차단 해소; enum 전체 의미를 새로 확정한 것은 아님 |
| U06 부분 해결 | main getters @0x710029e4f4·0x710029e980·0x710029e98c embedded view 해결 [GAP][GAP]; mode writer/menu reset/buffer producer는 §11.2. module 자체 생성/파괴·allocator/reset body는 잔여 | 소유자 한 곳·view 연결 가능, 전체 앱 수명 등가성 차단 |
| U07 부분 해결 | main Sync reset @0x710022eaf4는 +1/+2만0 [WORKC][WORKC]; cache marker true writer·수명은 잔여 | bounded reset 가능, 전체 cache 초기화 정책 차단 |
| U08 진전 없음 | main @0x71001f271c·0x71001f0460 기존 결과 규칙 [FREE §6.6·§11][FREE]; freeplay 한 판 종료 caller는 미확보 | 원본 commit 시점·중복 방지 등가성 차단 |
| U09 부분 해결 | main MaxRound @0x71001f0450·0x71001f0458의+4 확인 [GAP][GAP]; 모드별 Round 증가/reset owner는 잔여 | MaxRound field 대응 가능, 실제 commit/reset 사슬 차단 |
| U10 진전 없음 | main sync @0x71001c94cc와 sound.observe는 기존 [CORE §6.7][CORE]·[NETLIFE §9.14][NETLIFE]; 전체 gate/합의 입력은 잔여 | 웹 FrameGate 연결 가능, 전체 원본 정지/관측 입력 등가성 차단 |
| U11 부분 해결 | main FiberWatchNetError ctor @0x71002d16fc, Update 후보 @0x71002d1b20는 [MG0122 §3.5][MG0122]; 후보의 C·virtual 결합 없음 | 감시 역할 가능, 전체 pause/UI·종료 원본 대응 차단 |
| U12 부분 해결 | main mode writer @0x710029e700 [SCLOAD][SCLOAD]·factory lookup @0x71001a00d4 [GAP][GAP]·7행 이름표 @0x71015d840c [NAMES][NAMES] 확보; 등록표·ID0 직접 caller는 잔여 | 명시 registry 가능, 원본 전체 ID/factory 대응 차단 |

[데이터] 02:36 UTC 새 C 요청 뒤 docs_gap 이름에 한정하지 않고 허용 C 전체 목록·수정 시각·함수 헤더를 다시 대조했다. 현 C486파일의 최신 추가에는 mg1704/mgm02~06·bd01·motion C가 있으나 이 갈래 잔여24주소와 Fiber 후보 @0x71002d1b20의 본체는 없다. 모드 규칙·입력 자체는 [MGM_MODES][MGM_MODES]·[MOTION][MOTION]의 담당 판독을 재사용하며 원본 실행/추출은 하지 않았다. [INDEX][IX]·[FN][FN]·[현재 요청](18_scene_work.md#c1-현재-ghidra-요청24주소).

| 후속 기대값 [설계] | 새 판독에서 나온 대조 기준 |
|---|---|
| embedded view | 동일 WorkModule에서 Game=base+0xfc, Mode=base+0x12e8, Sync=base+0x5dc. getter 호출마다 새 child 할당 없음. main @0x710029e4f4·0x710029e980·0x710029e98c [GAP][GAP] |
| Game field | rule/judge/stage/id 각각0/4/8/c에서 raw 4 B 왕복. ring은 Mode 쪽. main @0x71001e8b60~0x71001e8b98 [GAP][GAP]·기존 @0x71001f0460 [FREE §6.6][FREE] |
| PadID | PlayerID +0x40 기반 Input adapter set/get, PlayerWork 안에 PadID offset을 임의 배정하지 않음. main @0x710021d828·0x710021d868 [GAP][GAP] |
| MaxRound | Mode+4를 쓰며 Round+0·cache Round index를 변경하지 않음. main @0x71001f0450·0x71001f0458 [GAP][GAP] |
| named return | 열거된 이름에 목표 없으면 false; 발견 시 위 §11.5의 helper 호출 수 대조. parent instance 일치 시험은 lower C 확보 뒤. main @0x71001a8490 [GAP][GAP] |
| Call/Exchange 오류 | validation 실패는 Abort 경계; 미등록 장면/미완성 게임을 UI/registry 진입에서 차단하고 Work/ring에 가짜 완료를 기록하지 않음. main @0x71001a830c·0x71001a8394 [GAP][GAP]·[DESIGN §10.5][DESIGN] |

### 13.2 현재 준비도

| 판정·묶음 수 [설계] | 현재 범위 |
|---|---|
| 바로 가능6 | (1) lifecycle/순차 요청 wrapper, (2) embedded Work view·권한, (3) Game/확보 Player field·PadID input adapter, (4) ring/cache/entrance·MaxRound·Sync bounded reset, (5) mode writer·menu reset 호출·generic buffer bridge, (6) Save 경계·main/flow composition 이동. main @0x71001a830c·0x710029e4f4·0x710021d828·0x71001f0450 [GAP][GAP], §11.2 및 [DESIGN §10.5][DESIGN] |
| 근사 필요4 | load/ready 어댑터, browser audio/renderer, 웹 onReturn 알림, Game readonly 결과 facade. 초판 §9·§12 및 [DESIGN §10.5][DESIGN]; 미승인 추천 유지 |
| 판독 필요8 | stack/history/instance, 전체 registry/factory, Player Advantage/실제 input mapping 구현, Work 자체/allocator/reset 수명, cache true writer, 한 판 commit/Round owner, online 전체 gate/관측 합의, 감시 virtual/오류 전체. §11.6의 열린11 U항목·C.1. input·network 자체는 [MOTION][MOTION]·[NETLIFE][NETLIFE] 담당 |

[미확정] 개수는 위 기능 묶음의 정의이며 완성률/실행 성공률이 아니다. 원본 실행 확인은 없다. C.1의24주소 외 주소 미식별3묶음은 별도다. 함수 이름·인접 주소로 cache writer·factory 등록·감시 virtual 시작점을 만들어 넣지 않는다. [FN][FN]·[INDEX][IX].

### B.2 최신 새 판독 대응

[데이터] docs_gap37함수의 모듈·정확한 주소·개수는 §11.4의5묶음 전부이며 각각 [GAP][GAP] 함수 헤더·[INDEX][IX]·[FN][FN]에 있다. 최초13·첫 후속5와 겹치지 않는다. 이번 추가42·누계55, 이 갈래 C 생성/추출0이다. ClearSession @0x710029f6b0와 온라인의 판독 수는 합산하지 않는다. [NETLIFE][NETLIFE].

[미확정] 기존 온라인 §9.13.2의 Reboot 접점 인용 주소 @0x71002caf7c는 main RequestReturnScene(name)다. main TSV의 RequestRebootScene 주소는 @0x71002cafa0이다. 이는 주소 대응 메모이며 두 함수를 새로 판독한 것은 아니다. [FN][FN]·초판 부록 B·[NETLIFE §9.13.2][NETLIFE]. 출처 원문은 변경하지 않았다.

### C.1 현재 Ghidra 요청24주소

[데이터] 초판38요청은 docs_gap에서 C가 확보되어 현재 요청에서 제외했다. 첫 후속9주소는 계속 C가 없고, 새 판독 wrapper의 lower helper13주소·Advantage2주소를 더해 현재 고유24주소다. 모두 main.nso의 address/name/size가 [FN][FN]에 있고 [INDEX][IX]와 최신 허용 C486파일의 본체 헤더가 없다. 아래는 요청표이며 새 추출/어셈블리 대체 판독/승인 요청을 하지 않는다. ClearSession @0x710029f6b0는 C가 있으므로 이24주소에 넣지 않고 온라인 결과를 재사용한다. [GAP][GAP]·[NETLIFE][NETLIFE].

| 모듈·정확한 주소 [미확정] | 함수·필요 이유 | 구현 차단·우선 [설계] |
|---|---|---|
| main @0x71001a4808 | FUN — Call/Exchange에서 실행되는 queue/active/history 처리 | 우선1, 부모 instance 보존·Call 등가성 차단 |
| main @0x71001a4968 | FUN — Return의 bool·빈 스택·복귀 항목 처리 | 우선1, pop/resume/recreate 등가성 차단 |
| main @0x71001a4bcc | FUN — 모든 전환 wrapper의 (seq,2) 상태 변경 | 우선1, 원본 프레임/종료 상태 전이 차단 |
| main @0x71001a4c10 | FUN — Exchange flag1 경로의 전처리 | 우선1, history 영향 차단 |
| main @0x71001a4f30 | FUN — Exchange 및 named return 반복 처리 | 우선1, history 제거/범위 등가성 차단 |
| main @0x71001a51d0 | FUN — named return의 callback 이름 열거 | 우선2, 열거 방향·현재 항목 포함 여부 차단 |
| main @0x71001a5c04 | FUN — 이름 기반0x50 record builder | 우선2, params/instance 참조 여부·필드 배치 차단 |
| main @0x71001a6128 | FUN — SceneParams 기반0x50 record builder | 우선2, 복귀 레코드 소유/보존 방식 차단 |
| main @0x71001a5eb0 | FUN — history record copy | 우선2, 문자열/handle copy 수명 차단 |
| main @0x71001a2900 | FUN — 이름으로 factory descriptor 조회 | 우선2, 전체 registry 구조·없는 대상 처리 차단 |
| main @0x71001a29e0 | FUN — descriptor/params로 실제 scene pointer 생성 | 우선1, new/pool/reuse 정책 차단 |
| main @0x71001a8ee0 | FUN — release count1의 이름/path helper | 우선2, descriptor/NRO unload 경계 차단 |
| main @0x710019fd28 | FUN — Call/Exchange의 이름 유효성 helper | 우선2, 유효 이름 범위 차단; wrapper의 실패 Abort은 이미 확보 |
| main @0x710019f324 | bex::SceneModule::GetSequence — sequence 번호→객체 조회 | 보조, sequence 소유권 대조 |
| main @0x71001a4b44 | bex::SceneSequence::IsCurrentSceneShutdownComplete — matching 종료 조회 | 보조, 실제 cleanup 완료 조건 차단 |
| main @0x71001a51b8 | bex::SceneSequence::EnumerateHistoryName — 공개 history 열거 | 보조, 내부 @0x71001a51d0와의 연결 대조 |
| main @0x710029e4e8 | bq::WorkModule::GetPlayers — PlayerWorkHolder view 위치 | 물리 parent/holder 배치 차단; Player 개별 필드는 확보 |
| main @0x710029e6f8 | bq::WorkModule::GetPlayMode — +0x12b8 writer의 reader 대조 | getter offset 연결 차단 |
| main @0x710029e99c | bq::WorkModule::ExistsGameModeWork — generic buffer 존재 조건 | cold-boot/존재 조건 등가성 차단 |
| main @0x710029e9ac | bq::WorkModule::ReserveGameModeWork — 0x728 요청의 실제 할당 | allocator·generic buffer offset/수명 차단 |
| main @0x710029ea08 | bq::WorkModule::ResetGameModeWork — menu/중단의 실제 reset | 공유 buffer 해제/보존·전체 reset 등가성 차단 |
| main @0x710029ea1c | bq::WorkModule::GetGameModeWorkSize — coldBoot 크기 조건 | size/존재 관계 대조 차단 |
| main @0x710021da6c | bq::PlayerWork::SetMinigameAdvantage — 남은 결과 bool writer | Player Advantage 물리 offset 대조 차단 |
| main @0x710021da74 | bq::PlayerWork::IsMinigameAdvantage — 결과 bool reader | 위 setter와의 일치 대조 차단 |

[미확정] 주소 미식별3묶음은 숫자24에 더하지 않는다. (1) cache +0x761/+3 true writer는 reset @0x710022eaf4·기존 init @0x71001f0eac·0x710022eb94만으로 못 찾았다. [WORKC][WORKC]·[RULE §11][RULE]. (2) factory 등록 caller·descriptor 가상 생성/정리 target은 @0x71001a00d4·0x71001a026c의 소비 경로까지만 알며 등록표 전체는 미식별이다. [GAP][GAP]. (3) FiberWatchNetError virtual target은 기존 문서의 @0x71002d1b20 후보가 있으나 TSV 함수 시작/본체/결합을 확보하지 못했다. [MG0122 §3.5][MG0122]·[FN][FN].

[설계] 후속 최소 순서는 Call/Return/state→record/factory→allocator/reset→남은 accessor다. 하위 C 없이 wrapper37개를 읽은 것을 부모 보존·전체 registry·Work 앱 수명 완료로 처리하지 않는다. [GAP][GAP]·§11.6. 출처/README의 새 통합 한 줄은 추가하지 않았으며 초판 부록 A의 통합 링크와 부모가 넣은 줄을 그대로 보존한다.

[GAP]: ../../../analysis/decomp/docs_gap_main.c
[MGM_MODES]: ../shell/mgm_modes.md
[MOTION]: 19_motion_input.md

### 11.7 온라인 결과 재사용: ClearSession·Save 경계

[판독] main ClearSession @0x710029f6b0의 새 본문은 온라인 [NETLIFE §9.15.5][NETLIFE]에서 판독됐으며 이 갈래는 C를 다시 읽지 않았다. 초판 §8·U06·부록 C의 C 부재 표시는 당시 기록이고 현재 직접 reset 근거는 아래와 같다. 같은 함수와 온라인 누계57을 이 갈래55함수에 더하지 않는다.

| 객체·필드 [판독] | 직접 영향·원본 owner |
|---|---|
| WorkModule+0x12d0 PlayerWorkHolder | NormalizeLocal 먼저 호출. GetPlayers getter의 물리 반환 배치까지 확정한 것은 아님. main @0x710029f6b0, [NETLIFE §9.15.5][NETLIFE] |
| WorkModule session 직접 필드 | +0x3d04 s32=0, +0x3d38←+0x3d30, +0x3d28 byte=0. 두 포인터의 실제 범위 타입·flag 이름은 미확정. 같은 main 주소·[NETLIFE §9.15.5][NETLIFE] |
| WorkModule local/host | +0x3d08/+0x3d10, +0x3d18/+0x3d20 각각 ConstantID::Invalid. 실제 station/식별 값은 기록하지 않는다. 같은 main 주소·[NETLIFE §9.15.5][NETLIFE] |
| GetPlayerList(...,4)의 type | SessionState∈{2,3,4} && IsLocal일 때만 SetPlayerType(0). 모든 player의 type0 초기화가 아님. 같은 main 주소·[NETLIFE §9.15.5][NETLIFE]; type current/base 쓰기 규칙은 기존 main @0x710021d734 [FREE §8.1][FREE] |
| 같은 목록의 state/slot | 목록 모두 SetSessionState(0)·SetConstantID(Invalid,0xff). 이전 scene/actor의 ID를 새 세션 ID로 재사용하는 동작이 아님. 같은 main 주소·[NETLIFE §9.15.5][NETLIFE] |
| 후행 소유자 | ResetControllerAssign→FUN_71001e9c88→FUN_71001eaf78→AccountMgr::ReEntryPlayer. 두 helper는 온라인 현재 요청 N7/N8이며 이 갈래24주소에 중복하지 않음. 같은 main 주소·[NETLIFE §9.15.5·§9.15.7][NETLIFE] |

[미확정] 직접 본문에 GameWork/RNG/result ring을 지우는 이름 있는 호출이 없다는 온라인 판독을 “모든 게임·SaveData 상태 보존”으로 확대하지 않는다. NormalizeLocal·두 helper·ReEntryPlayer 간접 영향은 잔여다. main @0x710029f6b0의 [NETLIFE §9.15.5][NETLIFE]. U06은 embedded view·직접 network reset이 부분 해결됐고 WorkModule 전체 수명·allocator·간접 reset이 열려 있으므로 §11.6의 부분 해결 판정은 유지한다.

[설계] clearNetworkSession 쓰기 권한은 명시적 net 종료/reentry 어댑터에 둔다. scene cleanup·mode Exit가 자동으로 이를 호출하지 않는다. Player roster의 조건부 복구, input controller assign reset, 계정 reentry, SaveData mutator/request를 별도 접점으로 모델링하며 Work 전체 JSON 저장/전체 zero를 추가하지 않는다. main @0x710029f6b0 [NETLIFE §9.15.5][NETLIFE], 지역 scene 종료 menu01 @0x7100055d70 [NETLIFE §9.14.2][NETLIFE], SaveRequest main @0x710023ff64 [SAVE §2][SAVE]·[DESIGN §10.5][DESIGN].


[데이터] 최종 정적 검증: CommonMark 링크515개·참조 정의44개, 대상 경로/절/미정의 참조 오류0, UTF-8(no BOM)·LF·후행 공백0, 새 판독55주소 중복0, docs_gap37함수 C 헤더 확인, 잔여24주소의 main TSV 존재·INDEX 본체 부재 확인. git diff --check 통과이며 원본 실행/헤드리스/화면 촬영은 없다.

[데이터] 이번 작업 시작 시 문서와 부모 통합분의 처음55,104 B를 SHA-256 대조로 그대로 보존했다. 쓰기 직전 전체를 읽고 후속 내용만 추가했으며 자기 MD 외 파일·C·INDEX·SHARED·JSON·코드·에셋을 쓰지 않았다. git add/stage/commit/rm은 하지 않았고 현재 index 변경은 부모 통합분을 유지했다.

### §8.1 온라인 상호작용 보강: ClearSession 재사용

[판독] main WorkModule::ClearSession @0x710029f6b0의 온라인 정리는 기존 [12 §9.15.5](12_online_sync.md#9155-clearsession의-네트워크-reset-계약)를 재사용한다. PlayerWorkHolder(+0x12d0)의 NormalizeLocal 후 로컬/host ConstantID를 Invalid로 바꾸고, GetPlayerList(...,4)의 모든 항목은 SessionState0·slot0xff로 정리한다. PlayerType0은 state2~4이면서 IsLocal인 항목에만 적용한다. 이어 ResetControllerAssign과 후행 helper·AccountMgr::ReEntryPlayer가 호출된다.

[미확정] 후행 main @0x71001e9c88/@0x71001eaf78의 본체 요청은 온라인 [12 §9.15.7 N7/N8](12_online_sync.md#9157-현재-ghidra-요청-표-빈-하위-함수만)에 맡긴다. NormalizeLocal·helper·ReEntryPlayer의 간접 영향이 열려 있어 GameWork/RNG/결과 ring/SaveData가 모두 보존된다고 판정하지 않는다. main @0x710029f6b0의 기존 판독만 인용하며 이번 새 판독55함수와 이 갈래 요청24주소에 중복 합산하지 않는다.

[설계] 웹의 clearNetworkSession 쓰기 권한은 net 이탈/reentry 어댑터에 둔다. 일반 Call/Return/Exchange·장면 cleanup/mode Exit가 이를 자동 호출하도록 확장하지 않는다. SaveData는 별도 Save 어댑터와 mutator/request 경계를 유지한다. main @0x710029f6b0·menu01 @0x7100055d70 [12 §9.15.5·9.14.2][NETLIFE], main SaveRequest @0x710023ff64 [16 §2][SAVE], 장면·Work 분리 [DESIGN §10.5][DESIGN].

[데이터] §8.1 추가 후 검증은 CommonMark 링크520개·참조 정의44개, 링크 대상/절/미정의 참조 오류0, UTF-8(no BOM)·LF·후행 공백0이다. 새 판독55·열린 U11·이 갈래 요청24·미식별3묶음은 그대로이며 원래55,104 B와 현재 부모 index의 접두부 보존을 다시 확인했다. git diff --check 통과, 원본 실행 확인은 없다.

## 후속 보강: mgm_modes C.4 공용 Work9함수

[데이터] 이번 범위는 [MGM_MODES 부록 C.4][MGM_MODES]의 main 공용 Work9함수만이다. 기존 §11.6·B.2의55함수와 주소가 겹치지 않아 이번 새 판독9·현재 누계64다. 이전 집계는 해당 시점의 스냅샷으로 보존한다. [FN][FN]·[INDEX][IX]·[GAP][GAP].

### 2.3 Work9의 기존 판독·가용성·관련 근거 일괄

[판독] 기존 §4.3의 공용100칸 ring은 MinigameModeWork+0xc+i*0xc, §11.5의 GetMinigameMode는 WorkModule+0x12e8을 반환한다. 두 완료 판독을 재사용하며 다시 C를 읽지 않았다. main @0x71001f0460 [FREE §6.6][FREE], main @0x710029e980 [§11.5](18_scene_work.md#115-장면-스택과-embedded-work의-최신-근거)·[GAP][GAP].

[데이터] 아래9주소는 기존18 새 판독 목록에 없고, 모드 문서는 C.4에서 공유 판독을 기다렸다. main TSV의 심볼/주소·INDEX의 docs_gap_main.c 대응·해당 C 함수 헤더9개를 일괄 확인했다. 이번 가용성 대조9·기존 판독 재사용 대상0·새 본체 판독9·새 추출0이다. 기존 caller 근거는 모드 §4·§6.4의 mgmet 결과/보상 reader와 mgm02 CoinMgr/Scene이며 그 C는 다시 읽지 않았다. [MGM_MODES][MGM_MODES]·[FN][FN]·[INDEX][IX].

| 모듈·주소 [데이터] | 식별자 그대로 | C 가용성·판독 대응 |
|---|---|---|
| main @0x71001f3120 | bq::MinigameModeWork::Mgm02AddMgResult | [GAP][GAP] L1026, 새 판독 N01 → §4.4·§6.1 |
| main @0x71001f3370 | bq::MinigameModeWork::Mgm02GetTotalCoinCount | [GAP][GAP] L1122, 새 판독 N02 → §4.4 |
| main @0x71001f3470 | bq::MinigameModeWork::Mgm02GetTotalLeviedCoinCount | [GAP][GAP] L1138, 새 판독 N03 → §4.4·§6.1 |
| main @0x71001f35d0 | bq::MinigameModeWork::Mgm02IsPlayedMgId | [GAP][GAP] L1150, 새 판독 N04 → §4.4·§6.1 |
| main @0x71001f396c | bq::MinigameModeWork::Mgm04GetTargetVictoryCount | [GAP][GAP] L1171, 새 판독 N05 → §4.4 |
| main @0x71001f3974 | bq::MinigameModeWork::Mgm04GetTeamVitoryCount | [GAP][GAP] L1182, 새 판독 N06 → §4.4 |
| main @0x71001f39e0 | bq::MinigameModeWork::Mgm04AddMGResult | [GAP][GAP] L1200, 새 판독 N07 → §4.4·§6.1 |
| main @0x71001f3be0 | bq::MinigameModeWork::Mgm04AddMGIDHistory | [GAP][GAP] L1288, 새 판독 N08 → §4.4·§6.1 |
| main @0x71001f3d50 | bq::MinigameModeWork::Mgm04IsPlayMGID | [GAP][GAP] L1371, 새 판독 N09 → §4.4·§6.1 |

[판독] 새 본체의 하위 호출은 확장 시 HeapModule::Alloc/Free와 실패 helper뿐이다. Mgm02AddMgResult·Mgm04AddMGResult·Mgm04AddMGIDHistory가 payload 복사/추가와 container pointer 갱신을 맡고, 나머지6함수는 getter/조회다. 하위 helper를 새 판독하거나 추가 추출하지 않았다. main @0x71001f3120/@0x71001f39e0/@0x71001f3be0 [GAP][GAP].

### 4.4 MinigameModeWork의 mgm02·mgm04 전용 필드와9계약

[판독] 아래 offset은 모두 MinigameModeWork view의 this 기준이다. WorkModule 절대 offset·GameWork·PlayerWork·generic GameModeWork buffer의 offset으로 바꾸지 않는다. embedded view는 기존 main @0x710029e980의 §11.5 판독을 재사용한다. [GAP][GAP]·[§11.5](18_scene_work.md#115-장면-스택과-embedded-work의-최신-근거).

| API·offset [판독] | 핵심 계약·읽기/쓰기 소유자 | 근거·남는 공백 |
|---|---|---|
| Mgm02AddMgResult: +0x830 begin/+0x838 end/+0x840 capacity | 입력 MGM02_MG_RESULT const&의0x24 B 전체를 끝에 복사한다. 공간 부족이면 새 영역에 기존 순서를 유지해 복사하고 pointer3개를 갱신한 뒤 이전 영역을 Free한다. 결과 payload/container writer는 이 메서드 | main @0x71001f3120 [GAP][GAP]. record 내부 필드 의미·초기화/최종 파괴 caller는 미확정 |
| Mgm02GetTotalCoinCount: +0x85c+4*Order | 인자가 unsigned 비교로0~3이면 raw4 B 반환, 그 밖은 비복귀 실패 경로다. getter가 누적값을 계산하거나 쓰지는 않는다 | main @0x71001f3370 [GAP][GAP].4칸 누적 writer와 인자 전달은 이번9밖 |
| Mgm02GetTotalLeviedCoinCount: +0x86c/+0x870/+0x874/+0x878 | 4개의 s32를 더해 int 반환한다. 결과 배열이나 totalCoin4칸을 순회/변경하지 않는다 | main @0x71001f3470 [GAP][GAP]. 각 징수칸 writer·범위는 이번9밖 |
| Mgm02IsPlayedMgId: +0x880 begin/+0x888 end | int ID4 B 배열의 반열린 범위를 선형 검색한다. 일치 true, 빈 배열/미일치 false. 쓰기·추가·capacity 접근은 없다 | main @0x71001f35d0 [GAP][GAP]. 이력 writer/reset과 capacity offset은 미확정 |
| Mgm04GetTargetVictoryCount: +0x8d0 | raw4 B 목표 승수 getter. 이 함수에는 검증·기본값·쓰기가 없다 | main @0x71001f396c [GAP][GAP]. setter·선택값 연결은 이번9밖 |
| Mgm04GetTeamVitoryCount: +0x8d4/+0x8d8 | TeamID0→+0x8d4,1→+0x8d8,그 밖→0. raw4 B 반환이며 result 배열을 집계하지 않는다 | main @0x71001f3974 [GAP][GAP]. Vitory 철자 보존. 승수 writer/reset은 미확정 |
| Mgm04AddMGResult: +0x8e8 begin/+0x8f0 end/+0x8f8 capacity | 두 bool 인자의 low bit가 모두0이면 무변경. 하나라도1이면8 B record 추가: low32=ID,bit32=param_2&1,bit40=param_3&1,나머지0. ID 유효범위 검사는 없다. 이 메서드는 결과 배열만 갱신 | main @0x71001f39e0 [GAP][GAP]. +0x8d4/+0x8d8 승수·ID이력은 증가하지 않음; 두 bool의 원본 팀 caller 연결은 별도 |
| Mgm04AddMGIDHistory: +0x908 begin/+0x910 end/+0x918 capacity | int ID4 B 배열에서 같은 ID가 이미 있으면 무변경, 없으면 끝에1개 추가한다. 확장 시 기존 순서와 새 ID를 보존하고 이전 영역을 Free한다 | main @0x71001f3be0 [GAP][GAP]. 유일한 이력의 writer 계약은 확보, clear/최종 해제 수명은 미확정 |
| Mgm04IsPlayMGID: +0x908 begin/+0x910 end | 같은 이력 배열을 선형 검색하며 일치 true, 빈 배열/미일치 false. 쓰기 없음 | main @0x71001f3d50 [GAP][GAP]. 이력과 결과 record 배열을 서로 대신 조회하지 않음 |

[판독] mgm02 전용36 B 결과와 mgm04 전용8 B 결과는 동적 pointer container다. 공용100칸 ring(+0xc, stride0xc)과 레코드 크기·필드·주소가 다르며 이번9함수는 그 ring의 index/Round를 직접 갱신하지 않는다. main @0x71001f3120/@0x71001f39e0 [GAP][GAP], 공용 ring은 기존 main @0x71001f0460 [FREE §6.6][FREE] 재사용.

[판독] 기존 모드 reader는 mgm02 record+0을 thumbnail ID로, +0x14/+0x18/+0x1c/+0x20의0 비교를 연속 보상 계산으로 사용한다. mgm04 reader는 record+0 ID<152를 거르고 +4/+5의bit0을 팀별 표시 승수로 누적한다. 이번 writer는 mgm02 전체36 B 복사와 mgm04 bit32/40 저장까지 확인했으며 이 reader C는 다시 읽지 않았다. mgmet @0x7100066610/@0x7100055370/@0x7100078e70 [MGM_MODES §4·§6.4][MGM_MODES], main @0x71001f3120/@0x71001f39e0 [GAP][GAP].

### 5.1 Work9 상태·container 수명·SaveData 경계

[판독] Mgm02AddMgResult와 Mgm04AddMGResult는 같은 record를 다시 넘겨도 추가하며 중복 검사·회차 증가·자동 코인/승수 반영을 하지 않는다. Mgm04AddMGIDHistory만 동일 ID의 재추가를 막는다. 결과 commit 중복 방지를 이력 메서드에 대신 맡길 근거는 없다. main @0x71001f3120/@0x71001f39e0/@0x71001f3be0 [GAP][GAP].

[판독] 확장 경로는 HeapModule::Alloc(heap1,원소수×stride,alignment4)→새 record 저장→기존 record 역방향 복사→begin/end/capacity 교체→old begin이 null이 아니면 Free 순이다. 역방향 복사는 기존 순서를 보존한다. embedded MinigameModeWork는 이 pointer들을 담고 payload는 별도 할당된다. main @0x71001f3120/@0x71001f39e0/@0x71001f3be0 [GAP][GAP]; view의 parent는 기존 main @0x710029e980 [§11.5](18_scene_work.md#115-장면-스택과-embedded-work의-최신-근거).

[미확정] 이9함수에는 최초 pointer 설치·모드 시작 clear·전체 종료 destructor·최종 payload Free caller가 없다. 기존 ResetMinigameModeWork의 제한된 reset 계약은 §5를 재사용하지만 새 container 모두가 언제 비워지는지는 확대 해석하지 않는다. main @0x71001efdc0 [WORKC][WORKC], 이번9의 allocation 경로는 main @0x71001f3120/@0x71001f39e0/@0x71001f3be0 [GAP][GAP].

[판독] 이번9의 직접 접근과 이름 있는 호출에는 SaveData mutator·SaveRequest·PlayerWork/GameWork write가 없다. 따라서 이번9의 결과/이력/누적 getter 계약과 SaveData 쓰기 권한은 별도다. main @0x71001f3120/@0x71001f3370/@0x71001f3470/@0x71001f35d0/@0x71001f396c/@0x71001f3974/@0x71001f39e0/@0x71001f3be0/@0x71001f3d50 [GAP][GAP]. [미확정] 상위 모드 commit/보상/저장 caller의 간접 효과가 없다는 뜻은 아니다. mgmet @0x7100055370·mgm02 @0x7100018cc0의 기존 보상/하이스코어 근거는 [MGM_MODES §6.4][MGM_MODES], Save 완료 경계는 [SAVE §2][SAVE]를 재사용한다.

### 6.1 Work9 계산식·의사코드

| 의사코드·계산 [판독] | 원본 계약·근거 |
|---|---|
| Mgm02AddMgResult: append(copyBytes(input,0x24)) | 남은 capacity면36 B 복사 후 end+=0x24. 꽉 찬 정상 vector의 n=(end−begin)/0x24, 새 capacity 원소수=max(n+1,2*n). main @0x71001f3120 [GAP][GAP] |
| Mgm02GetTotalCoinCount(i): i<4 ? read4(this+0x85c+4*i) : fail | 비교는 unsigned이므로 음수 int의 unsigned 표현도 실패 분기다. 반환은4 B이며 이 getter만으로 signed 범위/포화 정책을 만들지 않는다. main @0x71001f3370 [GAP][GAP] |
| Mgm02GetTotalLeviedCoinCount: s32[0x86c]+s32[0x870]+s32[0x874]+s32[0x878] | 네 정수칸 합. float/f32·새 코인 지급 계산을 하지 않는다. main @0x71001f3470 [GAP][GAP] |
| Mgm02IsPlayedMgId(id): any(history880,id) | end888까지4 B씩 증가하며 int equality. 빈 범위 false. main @0x71001f35d0 [GAP][GAP] |
| Mgm04AddMGResult(id,a,b): if ((a&1)\|(b&1)) append8(u64(id)\|((a&1)<<32)\|((b&1)<<40)) | a=b=0이면 append/allocate 없음. 둘 다1도 허용하며 ID는 uint32 입력 그대로다. 꽉 찬 정상 vector의 새 capacity=max(n+1,2*n). main @0x71001f39e0 [GAP][GAP] |
| Mgm04AddMGIDHistory(id): if (!any(history908,id)) append4(id) | 순서 유지·중복 ID 무변경. capacity 부족이면 n=(end−begin)/4, c=(capacity−begin)/4, 새 capacity=max(n+1,2*c). main @0x71001f3be0 [GAP][GAP] |
| Mgm04IsPlayMGID(id): any(history908,id) | end910까지4 B씩 증가하며 int equality. result8 배열을 찾지 않는다. main @0x71001f3d50 [GAP][GAP] |

[판독] 위 capacity 식은 C의 pointer 차이·정수 상수 곱을 정상 vector의 원소수로 정리한 것이다. mgm02의 (end−begin)>>2는9*n이고, 이어 모듈러 상수 곱이 n+1/2*n을 만든다. 초대형 길이의 실패 helper와 allocation 실패의 상위 처리는 별도로 남긴다. main @0x71001f3120 [GAP][GAP]; mgm04 result/history의 원소수 식은 main @0x71001f39e0/@0x71001f3be0 [GAP][GAP].

[설계] 원본 uint32 ID·bool low bit·int equality 계약을 웹에 옮기며 임의 clamp나 난수 소비를 추가하지 않는다. main @0x71001f3370/@0x71001f39e0 [GAP][GAP].

### 9.5 Work9 웹 모듈·쓰기 권한

[설계] import0의 game/lib 코어에는36 B opaque record 복사·8 B raw flag record·순서 유지 ID membership/추가·getter 계약을 둔다. app/common/work는 기존 WorkModule owner의 mode view에 연결하는 어댑터이며, app/scene/mode의 mgm02/mgm04 흐름이 위3 writer를 명시 호출한다. 앱은 dev를 부르지 않고 기존 고정1/60·주입 난수·FrameGate·f32 계약을 유지한다. [DESIGN §10.5][DESIGN], 원본 main @0x71001f3120/@0x71001f39e0/@0x71001f3be0 [GAP][GAP].

[설계] totalCoin/leviedCoin/targetVictory/teamVictory는 getter와 별도 writer 권한으로 둔다. AddMgResult/AddMGResult가 누적합이나 승수를 자동 증가시키는 구현은 원본 직접 경로와 맞지 않는다. 이력 writer와 result writer, 공용 ring commit writer, SaveData writer도 분리한다. main @0x71001f3370/@0x71001f3470/@0x71001f396c/@0x71001f3974/@0x71001f3120/@0x71001f39e0/@0x71001f3be0 [GAP][GAP], 기존 ring main @0x71001f0460 [FREE §6.6][FREE]·[DESIGN §10.5][DESIGN].

[설계] 브라우저 메모리의 네이티브 pointer/capacity 대신 원소 배열을 쓰는 것은 어댑터 구현 선택이며 미승인 추천이다. 원본 관찰 계약인 append 순서·payload 크기·무변경 분기·중복 허용/금지·reader 범위를 보존해야 한다. allocator의 개별 용량 증가 자체를 웹 게임 규칙으로 노출하지 않는다. main @0x71001f3120/@0x71001f39e0/@0x71001f3be0 [GAP][GAP]·[DESIGN §10.5][DESIGN].

### 10.1 Work9 정적 검증 기대값

[설계] 아래는 기존 C에서 도출한 입력/출력 대조 기준이며 원본 실행 결과가 아니다. 네이티브 allocation·실패 helper·SDK/저장 완료는 실행 확인하지 않았다. main9주소·심볼은 §2.3의 [GAP][GAP]·[FN][FN] 대응을 사용한다.

| 입력·사전 상태 [설계] | 기대값·근거 |
|---|---|
| mgm02 결과2개에36 B 입력1개 추가 | 기존2개 bytes/순서 유지, 새 입력36 B가 마지막, 원소수3. 동일 입력 재호출도4개. 코인·이력·Round·공용 ring 직접 변경 없음. main @0x71001f3120 [GAP][GAP] |
| totalCoin4칸=[10,20,30,40] | Order2→30; unsigned4/0xffffffff→실패 분기. 기록 배열에서 합을 재계산하지 않음. main @0x71001f3370 [GAP][GAP] |
| levied4칸=[1,2,3,4] | 합10; [1,−2,3,−4]면−2이며 이 함수에0 clamp 없음. main @0x71001f3470 [GAP][GAP] |
| mgm02 이력=[4,9] | ID9 true,8 false,빈 이력 false. result36에 ID8이 있어도 이력880에 없으면 false. main @0x71001f35d0 [GAP][GAP] |
| target=7, team count=[3,5] | target getter7; TeamID0→3,1→5,2/−1→0. result 배열을 추가해도 이 getter 필드가 직접 바뀌지 않음. main @0x71001f396c/@0x71001f3974/@0x71001f39e0 [GAP][GAP] |
| mgm04 ID10,a=false,b=false | result8의 원소수·begin/end/capacity 무변경. main @0x71001f39e0 [GAP][GAP] |
| mgm04 ID10,a=true,b=true | packed u64=0x1010000000a를1개 추가, low32 ID10·bit32/40 모두1. teamCount/ID이력 직접 변경 없음. 동일 호출은 또 추가. main @0x71001f39e0 [GAP][GAP] |
| mgm04 이력=[4,9]에9→7 순서 추가 |9 추가는무변경,7 추가 후[4,9,7]; lookup7 true·8 false. result8 추가와 이력 추가를 별도 호출해야 함. main @0x71001f3be0/@0x71001f3d50 [GAP][GAP] |
| 꽉 찬 정상 result vector의 n=0/1/2 | 새 capacity 원소수1/2/4; stride는 mgm02 36 B·mgm04 8 B. ID이력은4 B. allocator 실패/극한 크기는 실행 기대값으로 확정하지 않음. main @0x71001f3120/@0x71001f39e0/@0x71001f3be0 [GAP][GAP] |

### 11.8 Work9의 남는 공백5항목

[데이터]9함수의 직접 계약/offset은 판독 완료다. 기존 U12항목의 해결1·부분9·진전없음2·열린11과 기존 미식별3묶음은 유지한다. 아래W01~W05는 이번 좁은 범위의 공백 묶음이며 U 집계나 숫자 주소 요청에 중복 합산하지 않는다. main9주소 [GAP][GAP]·기존 §11.6/C.1·[MGM_MODES C.1·C.4][MGM_MODES].

| 공백 [미확정] | 확보한 근거·남은 범위 |
|---|---|
| W01 mgm02 record의 전체 의미 |36 B 복사와 기존 reader의 ID/4개 tail slot 사용은 확보. +4~+0x10 필드 의미·record 조립 caller·각 slot의 전체 enum은 미확정. main @0x71001f3120 [GAP][GAP]·mgmet @0x7100066610/@0x7100055370 [MGM_MODES §4·§6.4][MGM_MODES] |
| W02 mgm02 누적/징수 writer |+0x85c..+0x868 totalCoin4칸, +0x86c..+0x878 levied4칸 getter만 확보. setter 전달·commit 순서·값 범위/overflow 정책은 이9함수 밖. main @0x71001f3370/@0x71001f3470 [GAP][GAP]·모드 계산 [MGM_MODES §6.4][MGM_MODES] |
| W03 mgm02 ID이력 수명 |begin880/end888 조회는 확보. 이력 writer·capacity 위치·시작/reset의 clear 시점은 이번 C에 없음. main @0x71001f35d0 [GAP][GAP]·후보/재추첨 caller [MGM_MODES §6.4][MGM_MODES] |
| W04 mgm04 목표/승수와 결과 입력 연결 |target8d0/team8d4·8d8 및 result8 writer/중복금지 history writer는 확보. target/team setter·reset과 두 bool을 만드는 팀 caller·승수 갱신 commit 순서는 별도. main @0x71001f396c/@0x71001f3974/@0x71001f39e0/@0x71001f3be0 [GAP][GAP]·결과 UI [MGM_MODES §3·§6][MGM_MODES] |
| W05 container 전체 수명·상위 Save 효과 |확장 중 old payload Free는확보. 최초 설치/종료 destructor/reset 및 mode 복귀·net 종료에서 어떤 배열을 보존하는지는 미확정. 상위 Save/보상도 직접9계약과 구분. main @0x71001f3120/@0x71001f39e0/@0x71001f3be0 [GAP][GAP], 기존 reset main @0x71001efdc0 [WORKC][WORKC]·[SAVE §2][SAVE] |

### 13.3 Work9 준비도

| 준비도 [설계] | 이번9범위의 구현 가능/차단 경계 |
|---|---|
| 바로 가능 |9함수의 직접 offset·getter/범위 실패·payload 복사·flag packing·append 순서·history dedup/lookup 계약. main9주소는 §2.3 [GAP][GAP] |
| 근사 필요 |네이티브 pointer/capacity를 브라우저 배열로 표현하는 메모리 어댑터는 미승인 추천. 게임 관찰값을 바꾸는 근사는 이번9계약에 추가하지 않음. main @0x71001f3120/@0x71001f39e0/@0x71001f3be0 [GAP][GAP]·[DESIGN §10.5][DESIGN] |
| 판독 필요 |W01~W05의 조립/누적 writer·commit·reset/최종 해제·상위 저장. 기존 §13.2의6/4/8묶음은 전체 장면/Work 준비도 스냅샷이며9개 API를 완료했다고 전체 모드/수명을 완료로 바꾸지 않음. main9주소 [GAP][GAP]·[MGM_MODES C.1][MGM_MODES] |

### B.3 이번 Work9 새 판독 대응·부모 공유

[데이터] 새 판독 주소는 §2.3 N01~N09의9개 전부이며 기존55와 중복0,누계64(최초13+첫 후속5+docs_gap37+이번9)다. Work9 중 기존 판독 재사용 함수0,새 C 생성/추출0이다. 기존 공용 ring·embedded getter·mode reader·Reset·Save 판독은 주소와 기존 절로만 재사용했다. [GAP][GAP]·[FN][FN]·[INDEX][IX]·[MGM_MODES][MGM_MODES].

[설계] 부모는 모드 작성자에게 §4.4의9행 계약/offset/owner와 §11.8의W01~W05를 공유한다. 이 갈래만9본체를 새 판독했고 모드·온라인 갈래는 이 문서의 절을 재사용한다. 기존 부록 A 및 부모 통합 줄은 보존하며, 다른 문서는 쓰지 않았다.

### C.2 이번 Work9 추출 요청·통합 한 줄

[데이터] C.4의9주소는 TSV·INDEX·C 본체가 모두 있으므로 새 Ghidra 요청0이다. 기존 C.1 고유24주소·미식별3묶음은 유지하며, W01~W05의 scope 밖 함수를 임의 주소로 요청/추출하지 않는다. [FN][FN]·[INDEX][IX]·[GAP][GAP].

[설계] 부모 통합 대상은 web/docs/shell/mgm_modes.md 부록 C.4 끝의 정리본 링크 한 줄이다: `[판독] 공용 Work9함수의 계약·필드·공백은 [18_scene_work §4.4·11.8](../engine/18_scene_work.md#44-minigamemodework의-mgm02mgm04-전용-필드와9계약)에 정리했다.` 출처 원문/README/기존 통합 줄은 이 갈래에서 변경하지 않았다.

[데이터] Work9 최종 정적 검증: CommonMark 링크618개·고유 목적지55개·참조 정의44개, 실제 경로/절/미정의 참조 오류0이다. 괄호 설명·배열 표기를 링크로 오인하지 않았고 docs_gap의 literal underscore를 보존한 heading slug로 확인했다. GFM 표의 escaped OR pipe도2/3열 구조를 유지한다. UTF-8(no BOM)·LF·후행 공백0, git diff --check 통과다.

[데이터] 새9주소의 main TSV·INDEX·C 헤더9/9, 기존55와 중복0·누계64를 확인했다. 정상 vector의 mgm02 capacity 상수 곱과 mgm04 packed flag 예시는 정수식으로 정적 대조했으며 원본 실행/헤드리스/화면 촬영은 없다. 이번 미확정W5묶음·기존 열린U11·고유 요청24·주소 미식별3묶음은 서로 중복 합산하지 않는다.

[데이터] 이번 시작의95,981 B는 부모 통합 링크를 포함한 기준이며 SHA-256 2adad46f3e26435d510a20e71f469170f8e541c2b74be47df4a9de2839207881과 대조해 전부 보존했다. 이전55,104 B 검증은 이전 시점 기록이다. 각 쓰기 직전 전체를 읽고 후속 내용만 추가했으며 현재 부모 index의 접두부도 보존했다. 자기 MD 외 파일·C·INDEX·SHARED·JSON·코드·스크립트 파일·에셋은 쓰지 않았고 git add/stage/commit/rm은 하지 않았다. 문자열 literal은 출력 시 마스킹했으며 키/로그/설정 파일은 읽지 않았다.
