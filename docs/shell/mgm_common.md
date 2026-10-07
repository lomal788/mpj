# 미니게임 모드 화면 공용 UI 틀 (bq::mgm 공용 창·레이아웃·메시지 흐름·입력) — 원본 분석

2026-10-07. 상태: **분석 완료(판독·데이터). 웹 구현 없음, 원본·웹 실행 대조 없음.** 2차(같은 날): 메시지 창 내부를 [message_window.md](message_window.md) 로 분석하고, 1차 미확정 4건(메시지 창 내부·MESSSAGE_WINDOW_OFFSET·소리 그룹/프리셋 이름·mgm00 커서 사용처)을 이 문서에 반영했다(4.3·6.9·7.1·7.4·8·9.4·11절). 이 문서는 1단계(공용 틀)만 다룬다. 각 모드 화면(mgm01~06·mgmet)의 개별 흐름은 다루지 않고, 공용 부품을 어떻게 부르는지 보여 주는 호출 예만 적는다.
3차(2026-10-07, 구현 1단계 + A): 공용 계약을 9.6 에 고정하고 `web/script/shell/mgmcommon/` 에 구현(메뉴 격자·창 생애·항목 제약·글자·입력·소리·안내·메시지 창·메시지 흐름·장면 전환·저장소 기본 구현). 검증은 10절 끝.
형식은 `F:/dev/mps/web/docs/분석.txt` 의 11절 구성. 레이아웃 재생·그리기 규칙(색 공간·부모 기준점·블렌드·부품 덮어쓰기·창 정점색·흐림)·폰트·메시지 태그·입력 모듈·소리 재생 방식은 다시 분석하지 않고
[charselect.md](charselect.md) 6.4·6.5·12절, [modeselect.md](modeselect.md) 6.1·6.2절, [../engine/05_ui_input.md](../engine/05_ui_input.md), [../engine/04_sound.md](../engine/04_sound.md) 를 그대로 따른다.

확정 수준: **[판독]** 디컴파일 C 판독, **[판독: 어셈블리]** C 가 인자를 빠뜨린 곳만 명령으로 확인, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**, **[실행: 변환]** 자체 도구 실행(덤프).
주소: main = main NSO(0x7100000000 베이스), mgm01·mgmet = 각 NRO(SwitchLoader 베이스 0x7100000000, 주소 공간이 main 과 겹치므로 항상 모듈 이름을 붙인다). 심볼(맹글링 이름)이 남아 있어 함수 이름은 원본 이름이다. `FUN_` 은 이름 없는 함수, **[웹 이름]** 은 이 문서가 붙인 이름.

---

## 1. 기능 개요와 사용자에게 보이는 동작

모든 미니게임 모드 화면(프리 플레이 mgm01, 서바이벌·대전 mgm02~06, 모드 입구 mgmet)은 같은 부품 세 가지로 UI 를 만든다.

| 부품 | 원본 | 하는 일 | 근거 |
|---|---|---|---|
| 공용 창 | `bq::mgm::ComUiMinigameModeWindowCommon` (main) | 레이아웃 1장(+여러 lyt 묶음)을 만들고 **in → normal → out** 창 애니를 돌린다. 안에 **행×열 메뉴 격자**(항목 = 창 안 페인 이름 또는 붙인 항목 레이아웃)와 커서, 항목별 애니 세트(커서/일반/진입/이탈/결정, 사용 불가판)를 가진다 | [판독 3·5·6절] |
| 공용 레이아웃 | `bq::mgm::ComUiMinigameModeLayoutCommon` (main + 각 NRO 인라인) | 레이아웃 1장만 만드는 얇은 부품. **항목 레이아웃**으로 쓰일 때 창의 페인에 묶인다(SetConstraint = 그 페인의 전역 행렬·전역 알파를 따라감). 글자 삽입 도우미 | [판독 6.7·6.8] |
| 메시지 흐름 | `bq::MinigameModeScene` (main) | 장면 하나에 메시지 창 엔티티 1개(`ComUiMessageWindow`). 사람이 넘기는 흐름(MessageFlow)과 **페이지마다 3.0 초** 자동으로 넘기는 흐름(AutoMessageFlow). BGM 41종 표·SE 도우미·페이드 정지 | [판독 5.3·7.3] |
| 입구 UI 관리자 | `mgmet::UiManager` (mgmet.nro) | 모드 입구 장면의 UI 묶음 소유자. 메시지 창·다이얼로그 엔티티, 왼쪽 아래 "플레이 방법"·오른쪽 아래 "뒤로"·오른쪽 위 "스킵" 안내(ComUiGuide00) In/Out | [판독 5.4] |
| 입력 도우미 | `bq::mgm::GetOperationPlayerId/GetOperationPlayer/GetInputTrigger/GetInputRepeat` (main) | 메뉴를 조작하는 사람 1명을 고르고 그 사람의 누름·반복 비트를 준다. **GetInputRepeat = 누름 비트 OR 반복 비트** | [판독 6.10] |

공용 틀에는 **항목 간격·배치 상수가 없다**. 항목 위치는 창 레이아웃 데이터의 페인 위치 그대로이고(항목 레이아웃은 그 페인에 묶임), 개수는 부르는 쪽이 행·열로 정한다 [판독 6.1·6.7].

## 2. 분석 대상 원본·자료 위치

| 항목 | 위치 |
|---|---|
| 공용 창·레이아웃 | main `ComUiMinigameModeLayoutCommon` @0x7100364940~0x71003649cc, `ComUiMinigameModeWindowCommon` @0x7100364a20~0x71003667ff(vtable 0x71019e9ba0, 88칸), LayoutCommon vtable 0x71019e9938(67칸), `SetConstraint` @0x7100365adc, `makeFileListUiMinigameMode` @0x7100364700 |
| NRO 인라인 | mgm01.nro `ComUiMinigameModeWindowCommon::HookMenuItemLayout` @0x7100015250, `RemoveMenuItemLayout` @0x7100015180, `…WindowCommon::SetPaneTextInsertMessage` @0x7100017a90, `…LayoutCommon::SetPaneTextInsertMessage` @0x7100015430 (Hook·Remove·LayoutCommon 판은 mgm01 에만, WindowCommon::SetPaneTextInsertMessage 는 mgm03~06·mgmet 에도 있음, mgm02 는 없음 [데이터: 함수 목록]) |
| 메시지·소리 | main `MinigameModeScene::InitializeMessage` @0x7100360970 ~ `StopSeFxTrigger` @0x71003637a0, `BeginScene` @0x710035fab8, 보조 FUN_7100360ea0·FUN_7100361170·FUN_71003612b0·FUN_71003613f0·FUN_7100361540 |
| 메시지 창 | main `bq::ComUiMessageWindow` Start @0x710031e660, Out @0x7100316f38, IsEnd/IsOut/IsNextInputWait/IsAllTalkEnd/RequestNextMessage/GetCurrentMessageNo @0x710031e730~0x7100320e08 — 내부 전체는 [message_window.md](message_window.md) |
| 입력·조작 플레이어 | main `bq::mgm::GetOperationPlayerId` @0x7100217640, `GetOperationPlayer` @0x7100217690, `GetInputTrigger` @0x71002177d0, `GetInputRepeat` @0x7100217840, `bq::WorkModule::GetOperationPlayerId` @0x71002a01b0 |
| 입구 UI | mgmet.nro `mgmet::UiManager` ctor @0x71000642a4, In/Out @0x7100065290/0x71000652fc, In/OutBackMsg·In/OutHowtoMsg @0x7100065270~0x7100065288, GetUiMessageWindow @0x71000039a0, GetUiDialogBox @0x710005ade0, `BottomLeftHowtoMessage`·`BottomRightBackMessage`·`TopRightOpSkipMessage`·`BottomRightNextMessage`·`DialogBox` @0x710006f300~0x710007089c |
| 디컴파일 | `analysis/decomp/mgmcommon_main1.c`(창·레이아웃·makeFileList·장면 생성), `mgmcommon_main2.c`(메시지·BGM·SE·입력), `mgmcommon_main_vt.c`·`_vt2.c`(vtable 덤프와 Ghidra 가 함수로 안 잡은 칸), `mgmcommon_main_msgwin.c`(조작 플레이어·메시지 창 인터페이스), `mgmcommon_main_engine_refs.c`(SetInsertMessLabel·ComGuiLayout::SetConstraint), `mgmcommon_main_guilayout_all.c`(제약 행렬 적용 FUN_710079fa50), `mgmcommon_main_dis*.c`(어셈블리 3곳), `mgmcommon_mgm01_inline.c`·`_callers.c`·`_input_callers.c`·`_dis*.c`, `mgmcommon_mgmet1.c`·`_mgmet2.c`·`_mgmet_callers.c`. 검색 `analysis/decomp/INDEX.tsv` |
| 데이터 덤프 | `analysis/mgmcommon_main_data.txt`(기본 애니 이름 표·BGM 표), `mgmcommon_mgm01_str*.txt`·`_data*.txt`(mgm01 레이아웃 이름·애니 표), `mgmcommon_panes.txt`·`mgmcommon_anims.txt`·`.json`(mgm00 layout.lyt), `mgmcommon_find_msgofs*.txt`(메시지 창 위치 상수 쓰는 명령 탐색) |
| Ghidra | `ghidra_work/mgmcommon/{jamboree_main, g3(mgmet), mgm01}` (modesel·ghidra_proj g3·logic1801 mgm01 사본), 실행 `web/tools/analysis/mgmcommon_ghidra.sh`·`mgmcommon_ghidra_nro.sh`(PROJ=g3/mgm01), 새 스크립트 `ghidra_scripts/MgmcommonDecompCreate.java`(함수 없는 주소에 함수 만들고 디컴파일, 저장 안 함)·`MgmcommonData.java`·`MgmcommonStr.java`·`MgmcommonFindPage.java` |
| 레이아웃 | `extracted/bea/mgm~mgm00.nx.bea/mgm/mgm00/layout.lyt`(SARC, bflyt 20·bflan 56). 덤프 `extracted/converted/ui/mgm00/`(ui_lyt.dump), 요약 도구 `web/tools/analysis/mgmcommon_lyt_dump.py` |
| 메시지 | `extracted/message/koKR/mgmet.json`(mgmet_ui_howtoplay " 플레이 방법"), `system.json`(sys_ctrl_back " 뒤로", sys_ctrl_skip "/ 스킵"), `mgm01.json`(mgm01_start_tlp_courseName "프리 플레이") |

## 3. 진입점과 전체 호출 흐름

### 3.1 장면 시작 [판독 BeginScene @0x710035fab8]

```
MinigameModeScene::MinigameModeScene(MinigameModeID)  // +0x140 = 모드 ID, 아카이브 묶음 5·6·1·2(ID 0 이면 3도) 해제, UiPause 열기 금지
BeginScene: 동기 시작 대기(NetTransferSceneBegin) → ArchiveModule::EntryArchive(4, "mgm/mgm00")   ← 모든 모드 장면이 공용 mgm00 을 싣는다
           → EntryArchive(ID==0 ? 4 : 3, "mgm/" + 장면 이름) → LoadAsync(3), LoadAsync(4)
           → FUN_71000bfcfc(장면 gfx 종류, "SM_BGM_MGMET_ENTRANCE_JMP" / "SM_BGM_MGMET_ENTRANCE_NOINTRO_JMP") [뜻 미확정: 미리 준비로 추정]
SetupScene: SetCreateUiPause(1)
```

### 3.2 공용 창 만들기 순서 (부르는 쪽 규칙) [판독 mgm01 InitializeMgList @0x7100007af0·InitializeCourseNameTelop @0x71000079ac, mgmet RuleConfigView 설정 @mgmet_callers.c 8440~]

```
e = SceneBase::CreateSceneEntity("이름")
w = e.AddComponent<ComUiMinigameModeWindowCommon>()
w.SetupStart(파일, "레이아웃.bflyt")                 // 또는 SetupStart(makeFileListUiMinigameMode(2, "mgm/mgmXX/layout.lyt", "mgm/mgm00/layout.lyt"), "레이아웃.bflyt")
    = CreateLayoutImpl → Init(vt+0x220: 숨김, 창 애니 = 기본 {in, normal, out}) → SetupMenu(vt+0x268: 0, 0, 0, 0)
[메뉴가 있으면]
w.SetupMenu(rows, cols, wrap, checkEnable)           // vt+0x268, 애니 목록을 비우고 기본 애니 세트를 0번으로 넣음
k = w.SetupAddAnimeMenu(MenuAnime)                   // 추가 애니 세트, 반환 = 그 번호(1, 2, …)
w.SetupItemMenu(row, col, "페인 이름", k)            // 항목마다
[항목 레이아웃이 있으면]  item = 다른 엔티티.AddComponent<ComUiMinigameModeLayoutCommon>(); item.Setup(파일, "항목.bflyt")
                         w.HookMenuItemLayout(row, col, item)   // item 을 창의 "페인 이름" 에 묶음 (언제든 다시 Hook/Remove)
w.SetupFinish()                                      // 보이는 항목마다 첫 애니(커서/일반, 사용 불가판) 즉시 재생
[필요하면] w.SetAnimeWindow(names[3])                 // 창 애니 이름 바꾸기 (예: mgm01 코스 텔롭 {in_left, normal_left, out_left})
w.In(false) … 매 프레임 입력에 따라 MoveCursorX/Y·Decide … w.Out(false) → IsVisible 이 0 이 될 때까지 기다림
```

- `SetupStart` 변형 3개 [판독 @0x7100364b98 / @0x7100364c1c / @0x7100364ca8]: (파일, 레이아웃) / (파일 목록 vector<string_view>, 레이아웃) / (파일, 레이아웃, int). 세 번째의 **int 는 쓰이지 않고** 빈 생성 옵션 구조(vtable 0x7101a867a0, 마지막 필드 0xffffffffff)를 넘긴다 [판독: 어셈블리 `mov x3,x2` 로 w3 덮어씀, `mgmcommon_main_dis3.c`].
- `makeFileListUiMinigameMode(n, …)` @0x7100364700 = 가변 인자 C 문자열 n개 → vector<string_view>(strlen) [판독]. 모드 화면은 항상 (자기 lyt, mgm00 lyt) 2개 묶음으로 부른다 → 창 레이아웃이 mgm00 의 부품(prt1)을 쓸 수 있다 [판독+데이터].
- `ComUiMinigameModeLayoutCommon::Setup(파일, 레이아웃)` @0x71003649cc = CreateLayoutImpl 만 [판독].

### 3.3 매 프레임

- 창: 메시지 핸들러 vt+0x210 = FUN_7100364f10 — 이벤트 **0x5f454e00**(틱, ComUiMap 과 같은 값)이고 `IsVisible` 이면 vt+0x218 → vt+0x238 = **Update**(FUN_7100365158). 반환 0x8000 [판독].
- 공용 레이아웃: vt+0x210 = FUN_71003668fc 는 0x8000 만 반환 — **자체 갱신 없음** [판독]. 애니 재생은 ComUiBase(엔진).
- 창은 입력을 직접 읽지 않는다. 부르는 쪽 흐름(파이버)이 `GetInputTrigger/GetInputRepeat` 를 읽어 vt+0x2a8/0x2b0/0x2b8 을 부른다 [판독 mgm01 MgListFlow @0x7100010560].
- 메시지 흐름은 장면 파이버 안에서 `bex::Fiber::Wait()`(1프레임)로 기다리는 동기 코드다 [판독 5.3].

## 4. 구조체·필드·상수 표

### 4.1 ComUiMinigameModeWindowCommon (this, ComUiBase 파생) [판독]

| 오프셋 | 형식 | 웹 이름 | 뜻 | writer | reader |
|---|---|---|---|---|---|
| +0x38 | u8 | `opening` | in 애니 재생 중 → 끝나면 normal | In·Init·Out | Update |
| +0x39 | u8 | `closing` | out 진행 중(Out 이후 다음 In 까지 1 유지) | Out·In·Init | In·Out·Update |
| +0x40 | char*[3] | `windowAnime` | 창 애니 {in, idle, out}. 기본 @0x7101aa5b50 = {"in", "normal", "out"} [데이터] | Init·SetAnimeWindow | In·Out·Update |
| +0x48..0x58 | vector<MenuAnime> | `animeSets` | 항목 애니 세트(0x60 B 씩). 0번 = 기본 세트 | SetupMenu·SetupAddAnimeMenu·ClearMenu | 항목 애니 함수 전부 |
| +0x60..0x70 | vector<vector<Item>> | `grid` | 바깥 = 행(0x18 B), 안 = 열(Item 0x28 B). **모든 행 길이 = cols** | SetupMenu·SetupItemMenu·Hook/Remove | 전부 |
| +0x78 | u8 | `wrap` | 끝에서 반대쪽으로 넘어감 | SetupMenu | MoveCursorX/Y |
| +0x79 | u8 | `checkEnable` | 선택 가능 = 보임 && enabled (0 이면 보이기만 봄) | SetupMenu | IsItemSelectable |
| +0x7c | s32 | `cursorCol` | 커서 열(안쪽 번호), −1 없음 | SetupMenu·SetCursor·ClearMenu | 전부 |
| +0x80 | s32 | `cursorRow` | 커서 행(바깥 번호), −1 없음 | 같음 | 전부 |

`Item`(0x28 B) [판독 SetupItemMenu @0x710036589c, Hook/Remove]: +0x00 char* `pane`(창 레이아웃 안 페인 경로), +0x08 s32 `anime`(animeSets 번호), +0x0c u8 `enabled`, +0x10..0x20 `WeakHandle<ComUiMinigameModeLayoutCommon>` `layout`(Hook 된 항목 레이아웃, 세대 +0x20). SetupItemMenu 는 enabled = 1, layout = 비움.

`MenuAnime`(char* 12개) [판독: 칸 쓰임은 6.3~6.6 의 고르기 규칙][웹 이름]:

| 칸 | 사용 가능 | 칸 | 사용 불가 | 쓰는 곳 |
|---|---|---|---|---|
| [0] | `cursor` 커서 있음(반복) | [6] | 같음(불가판) | 커서 들어옴의 뒤 애니, SetupFinish·SetItemEnable(선택된 항목) |
| [1] | `rest` 커서 없음 | [7] | | 커서 나감의 뒤 애니, SetupFinish·SetItemEnable(나머지) |
| [2] | `enter` 커서 들어옴(전환) | [8] | | SetCursor 의 새 항목 |
| [3] | `leave` 커서 나감(전환) | [9] | | SetCursor 의 옛 항목 |
| [4] | `decide` 결정 | [10] | | Decide |
| [5] | `afterDecide` 결정 뒤 | [11] | | Decide 의 다음 애니 |

기본 세트 @0x71019e9ea0 [데이터 `analysis/mgmcommon_main_data.txt`]: [0] cursor, [1] normal, [2] on, [3] off, [4] press, [5] normal, [6] cursor, [7] disable, [8] on, [9] off, [10] press, [11] normal_ng.
mgm01 `MgListMenuAnime` @mgm01 0x71000530a0 [데이터 `analysis/mgmcommon_mgm01_data.txt`]: [0] on, [1] 없음, [2] 없음, [3] off, [4] press, [5] normal, [6] on_ng, [7] 없음, [8] 없음, [9] off_ng, [10] press_ng, [11] normal_ng (빈 칸 = null → 6절 대체 규칙).

### 4.2 창 vtable (0x71019e9ba0) — ComUiBase 0x58~0x208 은 엔진 그대로, 공용 창이 더한 칸 [판독 `mgmcommon_main_vt.c`·`_vt2.c`]

| vt | 주소 | 웹 이름 | 요약 |
|---|---|---|---|
| +0x210 | FUN_7100364f10 | `onMessage` | 0x5f454e00 && 보임 → Update |
| +0x218 | FUN_7100364fd4 | | vt+0x238 로 넘김 |
| +0x220 | FUN_7100364fe0 | `init` | SetVisible(0), +0x38/0x39 = 0, 창 애니 = 기본 |
| +0x228 | FUN_7100365024 | `in(immediate)` | 6.1 |
| +0x230 | FUN_71003650c4 | `out(immediate)` | 6.1 |
| +0x238 | FUN_7100365158 | `update` | 6.1 |
| +0x240 | FUN_71003651e4 | `rowCount` | grid 크기 |
| +0x248 | FUN_7100365200 | `colCount` | **0번 행** 크기(행이 없으면 0) |
| +0x250 | FUN_7100365230 | `isItemVisible(r,c)` | layout 있으면 layout.IsVisible, 아니면 pane 있으면 IsPaneVisible(pane), 아니면 0 |
| +0x258 | FUN_71003652c8 | `isItemSelectable(r,c)` | 보임 && (checkEnable ? enabled : 1) |
| +0x260 | FUN_7100365358 | `isCursorItemAnimating` | 6.6 (원본 비대칭 그대로) |
| +0x268 | FUN_7100365410 | `setupMenu(rows,cols,wrap,check)` | 6.1 |
| +0x270 | FUN_7100365830 | `clearMenu` | 애니 세트·격자 비움, 커서 (−1,−1) |
| +0x278 | FUN_7100365bc4 | `setItemVisible(r,c,b)` | layout 있으면 layout.SetVisible, 아니면 SetPaneVisible(pane) |
| +0x280 | FUN_7100365c54 | `setItemEnable(r,c,b)` | 6.5 |
| +0x288 | FUN_7100365e10 | `onCursorIn(r,c,immediate)` | 6.3 |
| +0x290 | FUN_71003660e4 | `onCursorOut(r,c,immediate)` | 6.3 |
| +0x298 | FUN_71003663b4 | `onCursorEdge` | 빈 함수(넘김 없는 끝에서 불림, 파생 훅) |
| +0x2a0 | FUN_71003663b8 | `setCursor(r,c,immediate)` | 6.3 |
| +0x2a8 | FUN_7100366440 | `moveCursorX(dir)` | 6.4 |
| +0x2b0 | FUN_7100366540 | `moveCursorY(dir)` | 6.4 |
| +0x2b8 | FUN_7100366718 | `decide(r,c)` | 6.6 |

### 4.3 MinigameModeScene (메시지·소리 관련 필드) [판독]

| 오프셋 | 형식 | 뜻 | writer | reader |
|---|---|---|---|---|
| +0xe8 | FiberLite* | UiPause 허용 파이버(StartUiPauseEnableFiber, 이미 있으면 안 만듦) | StartUiPauseEnableFiber | |
| +0xf0..0x100 | WeakHandle<Entity> | 엔티티 "MessageWindow"(ComUiMessageWindow 1개) | InitializeMessage | 메시지 함수 전부 |
| +0x108 | s32 | −1 = 만듦, 0 = 문구 준비됨 | InitializeMessage·PrepareMessage | [미확정: 읽는 곳 못 봄] |
| +0x140 | s32 | MinigameModeID | ctor | BeginScene(아카이브 묶음 번호) |
| 정적 0x7101c25840..50 | WeakHandle<SoundHandle> | **현재 모드 BGM 핸들(모든 MinigameModeScene 공유)** | PlayBgm·StopBgm | IsPlayBgm |
| 정적 0x7101c25830 | Vector3f | `MESSSAGE_WINDOW_OFFSET`(원본 철자 그대로) = **(0, 0, 0)**: 초기화 안 된 .bss(0 채움)이고 쓰는 곳이 없다 — main 은 읽는 곳 2곳(MessageFlow·AutoMessageFlow)과 동적 심볼(GOT 0x7101a87280, main 안에서 이 GOT 칸을 읽는 명령 없음)뿐, 이 심볼을 가져다 쓰는 NRO 4개(mgm03·mgm05·mgm06·mgmet; mgm01·02·04 는 안 가져옴)도 모두 읽기(OpenMessage 류 인자)만 한다 [판독: Ghidra 참조·명령 스캔, `analysis/decomp/msgwin_mgmet_msgofs.c`·`analysis/msgwin_*_msgofs_refs.txt`]. 0 이면 메시지 창이 **메시지 속성 OffsetX/Y** 를 쓴다(message_window.md 6.1) | — | MessageFlow·AutoMessageFlow·mgm03/05/06/mgmet |

### 4.4 mgmet::UiManager (싱글턴 m_InstancePtr) [판독 ctor @0x71000642a4]

| 오프셋 | 내용 |
|---|---|
| +0x08..0x18 | 엔티티 + `bq::ComUiMessageWindow` (GetUiMessageWindow 가 돌려줌) |
| +0x20..0x30 | 엔티티 + `bq::ComUiDialogBox` (GetUiDialogBox 가 돌려줌) |
| +0x38 DialogBox, +0x40 DailytrialPackSelect, +0x48 RuleConfigView, +0x50 SelectOpponent, +0x58 **BottomLeftHowtoMessage**, +0x60 **BottomRightBackMessage**, +0x68 **TopRightOpSkipMessage**, +0x70 BottomRightNextMessage, +0x78 ActivityTitle, +0x80 HowtoPlay, +0x88 ChallangeMGBattleHighScore, +0x90 TagmatchResult, +0x98 TagmatchResultForRM, +0xa0 TagmatchDialog, +0xa8 FreePlayInfo, +0xb0 Loading, +0xb8 LoadingBottomRight, +0xc0 ResultTelop, +0xc8 SkillExplain, +0xd0 SurvivalPlayerInfo, +0xd8 TagmatchPlayerInfo, +0xe0/+0xe8 빈 vector 2개 | 각 하위 UI(Impl 포인터). 굵은 것만 이 문서 범위 |

`Initialize` @0x7100065240 = SelectOpponent·ChallangeMGBattleHighScore·DailytrialPackSelect 의 Setup 만 [판독].

## 5. 상태 전이와 전체 수명

### 5.1 공용 창 생애 [판독 6.1]

```
(생성) → init: 숨김, opening=closing=0
in(false):  보임 && !closing 이면 아무것도 안 함(false). 아니면 opening/closing=0, windowAnime[0] ("in") 재생, opening=1, 보이기 → true
in(true):   같은 조건, windowAnime[1] ("normal") 즉시 재생, 보이기(opening 0)
update:     opening && IsEndAnimation → opening=0, windowAnime[1] 재생
            closing && IsEndAnimation → SetVisible(0)            (closing 은 1 로 남음)
out(false): 보임 && !closing 일 때만: opening=0, closing=1, windowAnime[2] ("out") 재생 → true
out(true):  같은 조건, closing=1, 즉시 SetVisible(0) → true
```
부르는 쪽은 `out(false)` 뒤 `IsVisible`(vt+0x70) 이 0 이 될 때까지 `Fiber::Wait` 로 기다린다 [판독 mgm01 MgListFlow·MgSettingFlow].

### 5.2 메뉴 커서

- SetupMenu·ClearMenu 뒤 커서 = (−1, −1). 처음 커서는 부르는 쪽이 `setCursor(r, c, immediate)` 로 놓는다. 커서가 (−1,−1) 이면 moveCursorX/Y 는 아무것도 안 한다 [판독].
- 이동 → setCursor → onCursorOut(옛) + onCursorIn(새). 결정 → decide(r, c) 애니만(결과 처리는 부르는 쪽). 결정 애니 끝 기다리기 = `isCursorItemAnimating` 이 0 이 될 때까지 [판독 mgm01].

### 5.3 메시지 흐름 상태기계 [판독 mgmcommon_main2.c]

메시지 창 상태(ComUiMessageWindow +0x28) [판독 IsEnd·IsWorking·GetCurrentMessageNo·Start·Out]: −1 쉼, 0 여는 중, 1 페이지 표시, 2 끝(다음 Start 에서 바로 1), 3 닫는 중, 4 이상 끝. `IsEnd` = −1·2·≥4. `GetCurrentMessageNo` = 상태 1 일 때만 현재 페이지 번호(+0x428), 그 밖 −1. `IsAllTalkEnd` = 상태 > 2 또는 (마지막 페이지이고 글자 다 나옴). `IsNextInputWait` = +0x508. `RequestNextMessage(b)` = 상태 1 일 때 넘김 요청(+0x506=1). `Start` = (이전 상태 2 면 1 아니면 0), 페이지 0 부터, 효과 그룹 0x13 덕킹(창 형식 +0x80 이 5·6 이면 안 함). `Out` = 상태 3, IsOut=1, 덕킹 0x0d·0x13 해제.

```
InitializeMessage(): 엔티티 "MessageWindow" + ComUiMessageWindow, DisablePadInput(1, 0), +0x108 = −1
PrepareMessage(label, choice0, choice1, charEntity):
    SetMessageLabel(label)            // 페이지 목록 다시 만듦, 페이지 0
    choice0 && choice1 → SetChoiceCount(2), 선택지 문구 0·1
    charEntity 유효 → SetCharacterEntity
    +0x108 = 0
OpenMessage(offset):     owner = talkSkip = 조작 플레이어(6.10), DisablePadInput(0, 0), SetOffset(offset), Start
OpenAutoMessage(offset): owner = talkSkip = PlayerID −1(아무도 아님), DisablePadInput(1, 0), SetOffset(offset), Start
MessageFlow(n):   OpenMessage(MESSSAGE_WINDOW_OFFSET)
                  n ≥ 0 → ContinueMessageFlow(n), 반환 0
                  n < 0 → WaitEnd() 반환 (창 스스로 진행, 장면은 끝만 기다림)
ContinueMessageFlow(n):
    IsOut 이면 즉시 반환
    Wait 1프레임
    반복:
        while IsNextInputWait: owner 다시 지정(조작 플레이어), Wait     // 사람이 넘길 때까지
        no = GetCurrentMessageNo; while 같은 번호: owner 다시 지정, Wait   // 페이지가 바뀔 때까지
        n ≥ 1 이고 바뀐 횟수 == n+1 → 새 페이지 번호 반환 (창은 열린 채)
        IsAllTalkEnd 면 끝
    WaitEnd() 반환
AutoMessageFlow(n): OpenAutoMessage(MESSSAGE_WINDOW_OFFSET), Wait, ContinueAutoMessageFlow(n)
ContinueAutoMessageFlow(n):
    반복:
        while !IsNextInputWait: Wait                   // 페이지 글자가 다 나올 때까지
        t = 0; do { Wait; t += GetDeltaTime() } while t < 3.0     // 3.0 초 유지 (첫 Wait 뒤의 dt 부터 더함)
        RequestNextMessage(0); no = 현재 번호; while 같은 번호: Wait
        n ≥ 1 이고 요청 횟수 == n → 반환
        IsAllTalkEnd 면 끝
    WaitEnd() 반환
WaitEnd() (FUN_7100361170): while !IsEnd: Wait; 반환 GetChoiceResult
DisableMessagePadInput(a, b): 그대로 DisablePadInput(a, b)  (+0x504 = a 패드 입력 막음, +0x516 = b [뜻 미확정])
FinalizeMessage(): 엔티티 파괴
```
- "바뀐 횟수 == n+1": 처음 바뀜은 창이 열리며 −1 → 0 이 되는 것이다(상태 0 에서는 −1) → `ContinueMessageFlow(n)` 은 **페이지 n 이 표시된 프레임**에 돌아온다 [판독 + GetCurrentMessageNo 상태 규칙에서 해석, 해석 부분은 추정].
- 사람 흐름에서 장면은 넘김을 요청하지 않는다. 넘김 입력은 메시지 창 안에서 **owner(= 조작 플레이어)의 A(0x1) 누름**, 페이지가 다 나온 뒤 0.2 s 부터 받는다. 글자 속도 0.05 s/글자(설정·온라인 분기), 넘김 화살표·글자 소리·넘김 소리는 [message_window.md](message_window.md) 5·6·7절 [판독].
- `ContinueMessageFlow(0)` 과 `MessageFlow(−1)` 의 차이: 0 은 매 프레임 조작 플레이어를 다시 넣으며 끝까지 따라가고, −1 은 처음 넣은 owner 그대로 끝만 기다린다 [판독].

### 5.4 mgmet 안내(ComUiGuide00) [판독 mgmcommon_mgmet2.c]

| 부품 | 위치(SetGuidePos) | 문구 | In | Out |
|---|---|---|---|---|
| BottomLeftHowtoMessage | 11 = 왼쪽 아래 (−900, −478) | `mgmet_ui_howtoplay` " 플레이 방법" | 이미 Idle 이면 무시, 아니면 In | Out |
| BottomRightBackMessage | 17 = 오른쪽 아래 (900, −478) | `sys_ctrl_back` " 뒤로" | 같음 | Out |
| TopRightOpSkipMessage | 12 = 오른쪽 위 (900, 490) | `sys_ctrl_skip` "/ 스킵" | 바로 In(Idle 검사 없음) | Out |
| BottomRightNextMessage | 17 | Mode 별 문구(std::string 으로 고름, 문자열 [미확정]) | Idle 검사 후 In | `Out(false)` = **SQ_SE_SYS_PROCEED** + 진동(조작 플레이어) 후 Out, `Out(true)` = 소리 없이 Out. `Enter()` = PROCEED + 진동만 |

좌표 = bq Parts `sys_guide_pos_01` 의 x_pos_NN [데이터], 정렬은 charselect.md 6.1(12..17 오른쪽 정렬; 6..11 왼쪽 정렬 [추정, 같은 규칙의 대칭]).
`UiManager::In(group)`/`Out(group)`: group 0 = Back + HowTo, group 1 = Back + HowTo + RuleConfigView, 그 밖 아무것도 안 함. `InBackMsg/OutBackMsg/InHowtoMsg/OutHowtoMsg(bool)` = 해당 하나만, bool 은 ComUiGuide00::In/Out 에 그대로 [판독; 값 뜻 미확정].
쓰임 예 [판독 mgmet Mgm01SettingUiFlow @0x710005de94, FirstHowToPlayFlow @0x710005a75c]: 설정 화면 동안 Back+HowTo 를 켜고, "플레이 방법" 창(HowtoPlay)을 띄울 때 끄고 닫으면 다시 켠다.

`mgmet::DialogBox::Setup(DIALOG_BOX_INFO&)` @0x710006f3f0 [판독]: 형식·속성, owner = 조작 플레이어(로컬만), HidButton 1, 본문 라벨(+삽입 라벨/문자열 2자리), 두 번째 라벨, 선택지 0~3개 라벨·기본 선택(ComUiDialogBox +0x4c), 취소 가능 → `In` = 엔티티 Activate + ComUiDialogBox::In, `IsEnd`·`GetChoiceResult` 그대로. 다이얼로그 그림·입력은 bq::ComUiDialogBox(엔진) [미확정].

## 6. 계산식·조건·상세 의사코드 [판독]

### 6.1 SetupMenu / SetupItemMenu / SetupAddAnimeMenu / SetupFinish

```
setupMenu(rows, cols, wrap, check):          // vt+0x268 @0x7100365410
  animeSets = []; animeSets.push(기본 세트 @0x71019e9ea0)       // 0번
  grid 를 rows 행으로, 각 행을 cols 칸으로 (새 칸: pane = null, enabled = 0; 남은 칸의 layout 은 그대로)
  wrap = wrap; checkEnable = check; cursor = (−1, −1)
setupAddAnimeMenu(m):  animeSets.push(m); return animeSets.length − 1      // @0x7100365660
setupItemMenu(r, c, pane, k): grid[r][c] = { pane, anime: k, enabled: 1, layout: 없음 }   // @0x710036589c
setupFinish():                               // @0x7100364d68
  for r in rows, c in cols:  if isItemVisible(r, c):
    a = animeSets[grid[r][c].anime]; sel = (r, c) == cursor
    name = enabled ? (sel ? a[0] : a[1]) : (sel ? a[6] : a[7])     // 대체(null) 규칙 없음
    layout 있으면 layout.PlayAnimation(name) 아니면 PlayPaneAnimation(pane, name)
```
- 행 길이는 모두 cols 이고 `colCount` 는 0번 행 길이. 열 수가 행마다 다른 메뉴는 짧은 행의 빈 칸을 pane = null 로 두어 "보이지 않음 = 선택 불가"로 만든다(mgm01: 3 행 × 112 열, 실제 112 / 32 / 15 칸) [판독 mgm01 InitializeMgList·InitializeMgFilter].
- SetupFinish 의 이름이 null 이면(mgm01 [1]) 엔진 PlayAnimation(null) 동작 [미확정].

### 6.2 항목 이름 규칙(부르는 쪽 데이터) [판독 mgm01]
페인 경로는 부르는 쪽 문자열이다(mgm01: `x_thum_0{행}_{표[열]:02}`, 행 = 크기 단계 0·1·2). 공용 틀은 이름 형식을 정하지 않는다.

### 6.3 커서 놓기·들어옴·나감

```
setCursor(r, c, imm):                        // vt+0x2a0 @0x71003663b8
  if (c, r) == (cursorCol, cursorRow): return false
  onCursorOut(cursorRow, cursorCol, imm)     // 옛 자리 — 인자는 어셈블리로 확인(C 는 인자 생략) [판독: 어셈블리]
  cursorCol = c; cursorRow = r
  onCursorIn(r, c, imm); return true
onCursorIn(r, c, imm):                       // vt+0x288
  r, c < 0 이거나 !isItemSelectable(r, c) 면 return
  a = 세트; e = enabled; T = e ? a[2] : a[8] (전환); L = e ? a[0] : a[6] (반복)
  if !imm && T: play(T); L 있으면 setNext(L)
  elif !L:      T 있으면 play(T)
  else:         play(L)
onCursorOut(r, c, imm):                      // vt+0x290, 같은 꼴: T = e ? a[3] : a[9], L = e ? a[1] : a[7]
  단 !imm && T 경우 setNext(L) 를 **L 이 null 이어도 부른다** (onCursorIn 은 null 검사함) [판독]
play/setNext = layout 있으면 layout.PlayAnimation/SetNextAnimation, 아니면 PlayPaneAnimation/SetNextPaneAnimation(pane, …)
```
- onCursorOut 도 `isItemSelectable` 이 거짓이면 아무것도 안 한다 → checkEnable 메뉴에서 사용 불가 항목을 떠날 때·숨긴 항목은 애니가 바뀌지 않는다 [판독].

### 6.4 커서 이동

```
moveCursorX(dir):                            // vt+0x2a8, 같은 행에서 열 이동
  dir == 0 이거나 (cursorCol < 0 && cursorRow < 0) → return 0
  n = colCount; c = cursorCol
  do:
    c += sign(dir)                           // (dir>>31)|1 = ±1, 크기는 무시
    if c < 0 || c ≥ n:
      if !wrap: onCursorEdge(); return 0
      c = (c + n) mod n
  while !isItemSelectable(cursorRow, c)
  return setCursor(cursorRow, c, false)
moveCursorY(dir):                            // vt+0x2b0, 행 이동
  같은 조건; m = rowCount; r = cursorRow; c = cursorCol
  do:
    r += sign(dir); 끝이면 wrap ? (r + m) mod m : (onCursorEdge(); return 0)
    if !isItemSelectable(r, c):
       c' = c−1 부터 0 까지 내려가며 처음 선택 가능한 열 (가장 가까운 왼쪽)
       없으면 c+1 부터 colCount−1 까지 올라가며 처음 선택 가능한 열 (가장 가까운 오른쪽)
       없으면 c 그대로 (→ 다음 행으로)
       c = c'
  while !isItemSelectable(r, c)
  return setCursor(r, c, false)
```
- 왼쪽이 오른쪽보다 멀어도 **왼쪽 우선** [판독 @0x7100366540].
- 선택 가능한 칸이 하나도 없는 행/메뉴에서 wrap 이면 원본은 끝없이 돈다(방어 없음) [판독]. 웹은 같은 조건을 만들지 않도록 부르는 쪽이 보장해야 한다(9.4).
- 이동은 항상 immediate = false(전환 애니 재생).

### 6.5 setItemEnable(r, c, e) — vt+0x280 @0x7100365c54

```
grid[r][c].enabled = e
r, c < 0 이거나 !isItemSelectable(r, c) → return            // [판독: 어셈블리, vt+0x258 를 (r, c) 로 부름]
sel = (c, r) == cursor
name = sel ? (e ? a[0] : a[6]) ?? (e ? a[2] : a[8])  :  (e ? a[1] : a[7]) ?? (e ? a[3] : a[9])
play(name) (즉시, setNext 없음)
```
→ **checkEnable 메뉴에서 사용 불가로 바꾸면 애니가 안 바뀐다**(선택 불가가 되므로). 사용 불가 표시를 보이려면 checkEnable = 0 메뉴를 써야 한다(mgm01 이 0) [판독].

### 6.6 결정·애니 끝 확인

```
decide(r, c):            // vt+0x2b8 @0x7100366718
  e ? play(a[4]) then setNext(a[5]) : play(a[10]) then setNext(a[11])     // null 검사 없음
isCursorItemAnimating(): // vt+0x260 @0x7100365358
  cursorCol < 0 && cursorRow < 0 → 0
  layout 있음 → layout.IsEndAnimation()            ← "끝났음" 을 그대로 돌려줌
  layout 없음 → !IsEndPaneAnimation(pane)          ← "재생 중" 을 돌려줌
```
두 갈래의 뜻이 반대다(항목 레이아웃 = 끝났으면 1, 페인 항목 = 재생 중이면 1) [판독: 어셈블리 `mgmcommon_main_dis.c` — 레이아웃 갈래는 vt+0x178(IsEndAnimation) 로 꼬리 호출]. 부르는 쪽은 "while (vt+0x260) Wait" 로 쓴다 → 항목 레이아웃 메뉴에서는 결정 애니가 시작된 프레임에 0 이 나와 기다림이 바로 끝난다. **원본 그대로 재현**한다.

### 6.7 항목 레이아웃 붙이기·떼기 / SetConstraint

```
hookMenuItemLayout(r, c, item):      // mgm01 @0x7100015250 (인라인)
  grid[r][c].layout = item
  win = 이 창 엔티티에서 ComUiBase 계열 컴포넌트(창 자신)의 WeakHandle
  item.SetConstraint(win, grid[r][c].pane)
removeMenuItemLayout(r, c):          // mgm01 @0x7100015180
  item.레이아웃.RemoveConstraint(); grid[r][c].layout = 없음
LayoutCommon.SetConstraint(other, paneName):    // main @0x7100365adc
  ComGuiLayout::SetConstraint(this 레이아웃, other 레이아웃, paneName)
```
`nn::bezel::ComGuiLayout::SetConstraint` @0x71007a4e30/@0x71007a4ebc [판독]: other 레이아웃에서 이름으로 페인을 찾아 (+0xd8 페인, +0xc0..0xd0 owner 레이아웃 핸들) 에 저장하고 엔티티 의존(AddDependency: owner 를 먼저 갱신)을 건다. 효과 [판독 FUN_710079fa50 @0x710079fa50 끝부분, FUN_71007a3b70]:
- **루트 행렬 = 제약 페인의 전역 행렬(Pane +0x70..+0x9c, 3×4) × 이 레이아웃 자신의 루트 SRT 행렬**.
- **루트 알파 = 이 레이아웃 알파 × 제약 페인 전역 알파(Pane +0x5a)/255**.
- 그리기: owner 레이아웃(그리고 owner 의 owner …)이 안 보이면(+0x136 == 0) 이 레이아웃을 그리지 않는다.
→ "메뉴 항목 레이아웃 배치 규칙" = **창 레이아웃의 항목 페인 자리·회전·배율·알파를 그대로 따른다**. 간격·개수 계산은 없다.

### 6.8 글자 삽입 SetPaneTextInsertMessage(pane, key, value) [판독 mgm01 인라인 @0x7100017a90·@0x7100015430 + 어셈블리 `mgmcommon_mgm01_dis.c`, main GuiLayoutText::SetInsertMessLabel @0x7100210180]

```
t = GetText(pane)                                  // 글자 페인
SetInsertMessLabel(t, key = {key, FNV-1a 64 해시(시작 0xcbf29ce484222325, 곱 0x100000001b3)}, value = string_view(value))
  value 가 메시지 라벨로 있으면: 그 라벨의 문구를 key 자리에 넣음, 문구에 U+E020/E021(컬러 글리프 쪽 사용자 영역)이 있으면 t+0x70 = 1
  없으면: value 문자열 자체를 UTF-16(최대 64자)으로 바꿔 넣음
  t+0xd8 = 1 (다시 그리기 [추정])
```
- key 는 페인 기본 문구 안 삽입 태그의 이름이다. 쓰인 값: **"Text0"**(문자열·라벨, [1:1] insert.Text 0번), **"Number0"**(숫자) [판독 mgm01 ApplySettingMgSetting·ApplyChangeMgList]. 예: `x_mgname` ← "Text0" = `im_<게임>_name`, `x_mes_0N/x_text_00` 문구 `mgm01_ui_mgNameBig` 의 "Text0" ← 게임 이름 라벨.
- 창용·레이아웃용 두 함수는 같은 코드(this 만 다름) [판독].
- 페인 문구 자체는 `GetText(pane).SetMessageLabel(label)` 로 바꾼다(창 생성 직후 버튼 문구 등) [판독 mgm01].

### 6.9 SE·BGM 도우미 (MinigameModeScene, 모두 정적) [판독]

```
PlaySe(label):                      SoundModule::Play(label)
PlaySe2D(label, window, pane):      SoundModule::Play2D(label, window.GetPaneGlobalPosition(pane))   // 페인 화면 위치로 팬
PlaySe2D(label, pos):               Play2D(label, pos)
PlaySeFxTrigger(name, entity):      entity 의 bex::ComFxTrigger::Play(name)    StopSeFxTrigger 는 Stop
StopSe(handle, preset):             handle.Stop_Preset(preset)
PlayBgm(kind):                      kind < 41 && kind ≠ 33 일 때만:
                                      기존 BGM 핸들이 붙어 있으면 Stop_Time(0.0) (즉시 끊음) 후 비움
                                      핸들 = SoundModule::Play(BGM 표[kind])
StopBgm(preset):                    핸들.Stop_Preset(preset), 핸들 비움
IsPlayBgm():                        핸들.IsAttached
FadeAndEntryCancel():               g = 현재 gfx 장면 종류
                                    StopGroup_Type(g, 0x22 / 1 / 0x25 / 0x29, 프리셋 6)  // 네 그룹 정지
                                    SetEntryCancelGroup(0x22 / 1 / 0x25 / 0x29, 1)       // 그 그룹 새 재생 막기
```
해제(SetEntryCancelGroup(…, 0)) 는 이 함수들에 없다 [판독: 이 범위].

**소리 그룹(`bex::sound::Group`) 번호의 뜻** [판독 FUN_71000c4730 @0x71000c4730(재생 시 그룹 플래그 채움)·FUN_71000c2750·FUN_71005c3840(사용자 파라미터 색인: 표 @0x71015d2af0 = {31, 30, 29, 28} → 색인 2 = **사용자 파라미터 비트 29**)·FUN_71000c3dcc(소속 판정), 데이터 fspj 사용자 파라미터 집계]. 열거형 이름 문자열은 main·NRO·오디오 데이터 어디에도 없다 → 이름 대신 소속 규칙으로 적는다.

| 그룹 | 소속 규칙 | 실제 소속(fspj 집계) | 쓰는 곳 |
|---|---|---|---|
| 0x00~0x1f | 사운드 사용자 파라미터(비트 29 칸)의 해당 비트 | 0x00 = SM_BGM 213·SM_JIN 5, **0x01 = SQ_SE 전부(2,089)**, 0x02 = SQ_VOI, 0x0d = SM_BGM 260(BGM), **0x13 = SM_BGM_MENU_RHYTHM + SQ_VOI_PC61_QUEST_WIN 9** … | 0x01: FadeAndEntryCancel, 0x0d·0x13: 메시지 창 더킹 |
| 0x20·0x21 | 언제나 1 | 모든 소리 | |
| **0x22** | 라벨에 `_BGM_` | BGM | FadeAndEntryCancel |
| 0x23 / 0x24 | `_JIN_` / `_SE_` | 징글 / SE | |
| **0x25** | `_VOI_` | 보이스 | FadeAndEntryCancel |
| 0x26 / 0x27 / 0x28 | 사운드 종류값 2 / 1 / 3·4 (FUN_71000fce40) [추정: 스트림·시퀀스·웨이브] | | |
| **0x29** | `_AMB_` | 환경음 | FadeAndEntryCancel |

→ `FadeAndEntryCancel` = **BGM·SE 전부·보이스·환경음을 0.5 s 로 멈추고 새 재생을 막는다(징글만 남김)** [판독 + 데이터].

**FadeTimePreset** [판독 FUN_71000f8530(기본값)·FUN_71000f3f70(설정 프리셋 레코드 0x30+N → 칸 N), 데이터 `analysis/msgwin_sound_presets.json` global 프리셋]: 런타임 표(+0x4E80) 기본값 {0.1, 0, 0.2, 0.5, 1.0, 1.2, 1.5, 0, …} 을 global 프리셋이 덮어쓴다 — **0 = 0.1 s, 1 = 0, 2 = 0.7, 3 = 0.2, 4 = 1.4, 5 = 2.0, 6 = 0.5, 7 = 6.0, 8 = 0.5, 9 = 4.0, 10 = 10.0 s**, 11 이후 0. `FADE_TIME_NN` 이름(mgsound_setting.json)의 NN = 칸 번호 [추정]. global 프리셋이 기동 때 적용된다는 것은 [추정] (sound1801 판독에서 global 의 'a' 레코드가 쓰임).

**Ducking**(레코드 0x10+N → 칸 N = {해제 시간, 켤 때 시간, 목표 음량}) [판독 FUN_71000f5474·FUN_71000fe150·FUN_71000d436c, 데이터 global]: 켤 때 = 목표 음량으로 '켤 때 시간' 동안, 끌 때 = 1.0 으로 '해제 시간' 동안. **0x0d = 0.6 배 / 0.3 s / 해제 0.3 s**, **0x13 = 0(무음) / 0.3 s / 해제 0.3 s**.

### 6.10 조작 플레이어와 입력 비트

```
mgm::GetOperationPlayerId(force):   WorkModule::GetOperationPlayerId(order = INT_MIN, localOnly = force || !Net::IsSessionConnected(), includeOther = false)
mgm::GetOperationPlayer(force):     위 ID 의 PlayerWork 핸들(없으면 abort)
mgm::GetInputTrigger():             InputModule::GetTrigger(GetOperationPlayerId(false))
mgm::GetInputRepeat():              GetTrigger(pid) | GetRepeat(pid)            ← 누름 비트가 항상 함께 들어감
WorkModule::GetOperationPlayerId(order, localOnly, includeOther):   @0x71002a01b0
  후보 = 모든 PlayerWork (localOnly 면 IsLocal 만)
  묶음: PlayerType == 0 → 0 (사람); 아니면 SessionState == 1 → 1, == 2 → 2, 그 밖 → 3 (includeOther 일 때만)
  묶음 0 → 1 → 2 → 3 순서로 처음 비지 않은 묶음에서:
    order ≠ INT_MIN: order 이상인 것 중 order 가 가장 작은 플레이어(없으면 다른 규칙 [판독 일부])
    order == INT_MIN: 기억된 조작 플레이어(WorkModule +0x3d18 ConstantID·+0x3d20)가 유효하고 그 묶음에 있으면 그 사람
                      아니면 그 묶음에서 PlayerID 가 가장 작은 사람
  모두 비면 abort
```
- 오프라인(세션 없음) = 로컬 사람 중 기억된 조작 플레이어, 없으면 PlayerID 최소 [판독]. +0x3d18 을 쓰는 함수는 [미확정].
- 메뉴 입력 비트(mgm01 MgListFlow 에서 확인, charselect.md 4절 표와 같다): A 0x1(결정), B 0x2(취소), 0x4·0x8(mgm01: 0x4 = 바로 시작, 0x8 = 랜덤 선택), 십자 위 0x800·아래 0x400·왼 0x100·오른 0x200, 스틱 위 0x20000·아래 0x80000·왼 0x10000·오른 0x40000, 0x10/0x40 = 왼쪽 어깨 쪽·0x20/0x80 = 오른쪽 어깨 쪽(필터 이동 방향) [판독: 쓰임][비트 이름은 추정]. mgm01 은 `trig == 1`·`trig == 4` 처럼 **마스크 전체 같음**으로 비교한다(동시 누름이면 결정 안 됨) — 화면별 규칙이므로 공용 틀은 비트만 넘긴다.
- 조작 플레이어는 메시지 창에도 쓰인다: OpenMessage·ContinueMessageFlow 의 owner/talkSkip(5.3), mgmet DialogBox owner(5.4), 진동 대상(BottomRightNextMessage).

## 7. 애니메이션·소리·에셋 연결

### 7.1 mgm00 layout.lyt (공용 묶음, 모든 모드 장면이 싣는다) [데이터 `analysis/mgmcommon_panes.txt`·`mgmcommon_anims.txt`, 실행: 변환]

20 레이아웃 / 56 애니. 모두 1920×1080. 단독(창으로 만드는 것)과 부품(prt1 로만 쓰임)을 나눈다. 길이 = 태그 끝 − 시작(60 fps).

| 레이아웃 | 쓰임 | 애니 (길이 f, 반복) | 참조 NRO [데이터: 문자열] |
|---|---|---|---|
| `mgm00_base_mgmstat_00` | 단독: 아래쪽 4인 상태 줄(x_stat_00..03 = mgmstat_00 부품, y −450, 간격 428) | in 10 · normal 0 · out 7 (null_00 정점색) | mgm02·03·05 |
| `mgm00_base_mgmstat_01` | 단독: 팀(2+2) 상태 줄 | in 10 · normal 0 · out 7 | mgm04·05 |
| `mgm00_base_mgresult_00` | 단독: 결과 표(얼굴 부품 10, 바탕 16장 알파 180, all 알파 236) | in 30 · in_right 30 · normal 0 · normal_right 0 · out 28 · out_right 28 | mgm02·03·04·05 |
| `mgm00_base_mgselect_00` | 단독: 미니게임 고르기(썸네일 3, 룰렛 4, 픽업 4+3, 텔롭 부품, 종류 글자) | in 10 · out_00 10 · out_01 10 · roulette_in 10 · roulette_normal 0 · roulette_out 30 · select_everyone 30 · select_normal 0 · select_out 10 | mgm04·05 |
| `mgm00_cursor_00` | **부품**: 좌우 화살표 커서 + 글자 — `mgm01_base_freeplay_00`·`mgm01_base_mginfo_00` 의 `x_cursor_LR` | left_select 8 · normal 0 · right_select 8 | mgm01(부품) [데이터 `analysis/msgwin_mgm00_cursor_refs.txt`] |
| `mgm00_cursor_around_00` | **부품**: 항목 둘레 커서(x_null_left/right 좌우 흔들림) — `mgm01_rule_option_00`·`mgm01_team_00`·`mgmet_act_title_00`·`mgmet_rule_option_00/01/02` 의 `x_cursor_00` | normal 30 반복 | mgm01·mgmet(부품, 코드 문자열 `x_cursor_00/x_null_left/right`) |
| `mgm00_tlp_course_00` | 단독: 코스 이름 텔롭(큰 글자 + 작은 글자 + 줄 창 x_line) | in 15 · normal 0 · out 15 | mgm02·03·04 |
| `mgm00_tlp_course_01` | 단독: 코스 이름 텔롭 좌/우판(left/right 글자 묶음) | in_left 15 · in_right 15 · normal_left 0 · normal_right 0 · out_left 15 · out_right 15 | mgm01·04·05·06 |
| `mgm00_tlp_result_00` | 단독: 결과 텔롭(bqfont_telop) | in 35 · normal 0 · out 5 | mgm06·mgmet |
| `mgm00_tlp_mgselect_00` | 부품(mgselect 의 x_tlp_00) | in 20 · normal 0 · out 10 | |
| `mgm00_lineup_thum_00` | 부품: 썸네일 액자(창 flame_00·flame_ef_00) | cursor 80 · cursor_normal 0 · gray 0 · normal 0 | |
| `mgm00_lineup_thum_01` | 부품: 픽업 썸네일 | normal 0 · select 8 · select_normal 0 | |
| `mgm00_mgmstat_00` | 부품: 1인 상태(얼굴 sys_face_00, 이름 sys_username_00, 서바이벌·데일리·챌린지 묶음, 말풍선 창) | normal 0 · top 90 반복 | |
| `mgm00_mgmstat_01` / `mgmstat_star_00` / `mgresult_face_00` / `mgresult_face_01` | 부품 | 없음 | |
| `mgm00_mgresult_star_00` | 부품: 별 | normal 0 · off 0 · star_get 50 | |
| `mgm00_mgselect_face_00` | 부품 | normal 0 · press 8 | |
| `mgm00_mgselect_roulette_00` | 부품 | normal 1 · select 1 | |

- **"창·버튼 패널"이라 부를 만한 일반 창 레이아웃은 mgm00 에 없다.** mgm00 은 상태 줄·결과 표·미니게임 고르기·텔롭·커서·썸네일 부품만 가진다. 메뉴 창·버튼판은 각 모드의 자기 lyt(`mgm01_base_freeplay_00`, `mgm01_base_mginfo_00`, `mgmet_base_rule_00`, `mgmet_base_playinfo_*` …)에 있고, (자기 lyt, mgm00 lyt) 묶음으로 만들어 mgm00 부품을 끼워 쓴다 [데이터 + 판독 3.2]. 그 레이아웃들은 각 화면 단계에서 다룬다.
- 기본 창 애니 이름 {in, normal, out} 은 mgm00 단독 레이아웃 대부분의 태그와 같다. 좌우판(tlp_course_01, mgresult_00 `_right`)은 `SetAnimeWindow` 로 이름 3개를 바꿔 쓴다(mgm01 = {in_left, normal_left, out_left} @mgm01 0x7100053078) [데이터+판독].
- 기본 항목 애니 이름(cursor/normal/on/off/press/disable/normal_ng)은 mgm00 에 그대로 있는 레이아웃이 없다(lineup_thum_00 = cursor/normal/gray) → 항목 애니 세트는 화면마다 자기 lyt 의 태그에 맞춰 SetupAddAnimeMenu 로 준다 [데이터].
- 창 패널 그리기(창 9조각·정점색 전체·그림자·흐림)는 modeselect.md 6.1·6.2, 색·부모 기준점·부품 덮어쓰기는 charselect.md 6.4·6.5 그대로.

### 7.2 글자·폰트
mgm00 글자 페인은 `x_text_NN` 과 `x_text_NN_shadow`(같은 자리, `_shadow` 폰트) 짝이다(tlp_course·mgselect·mgmstat) [데이터]. 짝을 함께 채우는지(GetText 가 둘을 묶는지)는 엔진 GuiLayoutText 범위 [미확정 — charselect 구현 방식 따름].

### 7.3 BGM 표 `MGM_BGM_KIND` → 라벨 (main @0x71015d8470, s32 오프셋 41개, 기준 = 표 주소) [데이터 `analysis/mgmcommon_main_data.txt`]

| kind | 라벨 | kind | 라벨 | kind | 라벨 |
|---|---|---|---|---|---|
| 0 | SM_JIN_MGMET_OPENING | 14 | SM_BGM_MGM03_LEVEL03_JMP | 28 | SM_BGM_MGM04_RM_RESULT_SUCCESS |
| 1 | SM_BGM_MGMET_ENTRANCE_JMP | 15 | SM_BGM_MGM04_PHASE1_JMP | 29 | SM_BGM_MGM04_RM_RESULT_FAIL |
| 2 | SM_BGM_MGMET_ENTRANCE_NOINTRO_JMP | 16 | SM_BGM_MGM00_MGSEL_ROLL | 30 | SM_BGM_MGM05_OPENING_JMP |
| 3 | SM_BGM_MGM00_RESULT | 17 | SM_JIN_MGM04_PHASE1_END | 31 | SM_BGM_MGM05_MAIN_JMP |
| 4 | SM_BGM_MGM01_FREEPLAY | 18 | SM_BGM_MGM04_PHASE1_NOINTRO_JMP | 32 | SM_BGM_MGM05_MGRES |
| 5 | SM_JIN_MGM01_FREEPLAY_ENDSTINGER | 19 | SM_BGM_MGM04_PHASE2_JMP | 33 | (무효: 0번과 같은 문자열, PlayBgm 마스크가 거름) |
| 6 | SM_BGM_MGM02_NORMAL_JMP | 20 | SM_BGM_MGM04_PHASE2_NOINTRO_JMP | 34 | SM_BGM_MGM05_RESULT_SUCCESS |
| 7 | SM_JIN_MGM02_NORMAL_END | 21 | SM_JIN_MGM04_PHASE2_END | 35 | SM_BGM_MGM05_RESULT_FAIL |
| 8 | SM_BGM_MGM02_NORMAL_NOINTRO_JMP | 22 | SM_BGM_MGM04_FINAL_JMP | 36 | SM_JIN_MGM06_OPENING |
| 9 | SM_BGM_MGM02_BBMG_JMP | 23 | SM_BGM_MGM04_FINAL_NOINTRO_JMP | 37 | SM_BGM_MGM06_MAIN |
| 10 | SM_BGM_MGM02_FINAL_JMP | 24 | SM_JIN_MGM04_FINAL_END | 38 | SM_JIN_MGM06_BFMG |
| 11 | SM_JIN_MGM02_FINAL_END | 25 | SM_BGM_MGM04_RM_OPENING_JMP | 39 | SM_BGM_MGM06_RESULT_SUCCESS |
| 12 | SM_BGM_MGM03_LEVEL01_JMP | 26 | SM_BGM_MGM04_RM_MAIN_JMP | 40 | SM_BGM_MGM06_RES |
| 13 | SM_BGM_MGM03_LEVEL02_JMP | 27 | SM_BGM_MGM04_RM_MGRES | | |

징글(SM_JIN_*)도 같은 BGM 핸들로 재생되어 이전 BGM 을 즉시 끊는다 [판독 PlayBgm]. 라벨별 파일·루프·볼륨은 각 화면 단계에서 사운드 데이터로 확인 [미확정].

### 7.4 SE
공용 틀이 직접 내는 SE: `SQ_SE_SYS_PROCEED`(mgmet BottomRightNextMessage Enter·Out(false)) 하나 [판독]. 메뉴 이동·결정 SE 는 부르는 쪽(예: mgm01 `SQ_SE_MGM01_DECI_S`·`SQ_SE_MGM01_CANCEL`, PlaySe)이고, 메시지 창 SE(글자마다 SQ_SE_SYS_MES_PUT → 모드 장면 프리셋이 SQ_VOI_SYS_MES_PUT 로 치환, 넘김 SQ_SE_SYS_MES_PROC, 선택지 CURSOR/DECI/CANCEL)는 [message_window.md](message_window.md) 7절. 공용 틀 진동 이름은 디컴파일에서 빠짐 [미확정] (메시지 창의 진동은 bv_vib_sys_deci·bv_vib_sys_cursor).

## 8. 다른 기능과의 상호작용

- 그리기 순위: 공용 창은 기본값, 부르는 쪽이 vt+0x78(SetDrawPriority) 로 정한다(mgm01 AnnounceUI = 200) [판독].
- 항목 레이아웃은 별도 엔티티이고 SetConstraint 로 창 엔티티에 의존(창이 먼저 갱신) → 창의 in/out 애니가 항목 페인을 움직이면 항목 레이아웃도 같은 프레임에 따라간다 [추정: AddDependency = 갱신 순서]. 창이 숨으면 항목도 안 그려진다 [판독 6.7].
- 메시지 창 덕킹: 열 때 그룹 0x13(SM_BGM_MENU_RHYTHM 등)을 0.3 s 에 무음, 선택지 때 그룹 0x0d(BGM)를 0.6 배, 닫을 때 둘 다 0.3 s 에 복귀 [판독 + 데이터, 6.9].
- 모드 장면은 공통으로 mgm00 아카이브를 묶음 4로 싣는다(3.1) → 웹은 mgm00 명세를 모든 모드 화면이 공유.
- 온라인 세션이면 조작 플레이어 후보가 로컬로 한정되지 않는다(6.10). 웹 오프라인은 로컬 사람 1명 → 그 사람.
- UiPause: 생성자에서 열기 금지, StartUiPauseEnableFiber 로 따로 허용 파이버(본문 람다 vtable 0x71019e9838 [미확정]).

## 9. 웹 포팅 구조 (공용 부품 명세 — 제안, 코드 없음)

### 9.1 원칙
- 위치 `web/script/shell/mgmcommon/`(엔진 독립 모듈). import 허용: 같은 폴더, `three`, `../charselect/scene2d`·`../charselect/render2d`·`../charselect/state`(RepeatGen)·`../charselect/types`(명세 형식) — modeselect 와 같은 규칙(공용으로 끌어올리지 않고 그대로 import). 금지: `script/core`·`script/games`·`script/view`·`script/game.ts`·`script/env.ts`.
- 명세 JSON: `web/assets/mgmcommon/spec.json` ← `web/tools/analysis/mgmcommon_web_assets.py`(제안). charsel_web_assets.py 의 레이아웃·폰트·텍스처 변환 함수와 modesel_web_assets.py 의 창 9조각 분할·부품 재질 덮어쓰기를 import 해 mgm00 20 레이아웃을 변환. 각 모드 화면은 자기 명세 + 이 공용 명세를 함께 읽는다(원본의 (자기 lyt, mgm00 lyt) 묶음과 같은 관계).
- 상태(순수 로직)와 그리기(LayoutInst/Render2D)를 나눈다. 순수 로직은 입력 {trig, rep} 과 "애니 끝" 신호만 받고 사건(애니 재생 요청·SE)을 낸다 → 단위 시험 가능.

### 9.2 파일과 책임

| 파일 | 원본 대응 | 책임 |
|---|---|---|
| `menuGrid.ts` | WindowCommon +0x48~0x80, vt+0x240~0x2b8 | 순수 상태: grid·animeSets·wrap·checkEnable·cursor. `setupMenu/addAnimeSet/setupItem/finish/setCursor/moveX/moveY/setItemEnable/setItemVisible/decide/isCursorItemAnimating`. 출력 = `{ target: {row,col} 또는 항목 레이아웃, anim, next?, immediate }` 사건 목록 |
| `window.ts` | WindowCommon +0x38~0x40, vt+0x220~0x238 | 창 생애 in/normal/out(5.1), `setWindowAnime([in, idle, out])`, LayoutInst 위에서 애니 재생·끝 감지, 메뉴 사건을 페인 애니/항목 레이아웃 애니로 실행 |
| `itemLayout.ts` | LayoutCommon + Hook/Remove + SetConstraint | 항목 LayoutInst 를 창의 페인에 묶기: 매 프레임 창 갱신 뒤 `root = paneGlobal × ownSRT`, `alpha = own × paneGlobalAlpha/255`, owner 숨으면 그리지 않음(6.7) |
| `text.ts` | SetPaneTextInsertMessage, GetText().SetMessageLabel | `setLabel(pane, label)`, `insert(pane, key("Text0"/"Number0"), value)` — value 가 메시지 라벨이면 문구, 아니면 문자열 그대로(64자). 컬러 글리프 규칙은 modeselect.md 6.1 |
| `messageFlow.ts` | MinigameModeScene 메시지 함수 | 메시지 창 어댑터(인터페이스 아래)를 받아 `open/openAuto/flow(n)/continue(n)/autoFlow(n)/continueAuto(n)/waitEnd()` 를 프레임 단위 제너레이터(파이버 대체)로. 자동 = 페이지 완료 후 dt 누적 ≥ 3.0 s 에 넘김(5.3) |
| `guides.ts` | mgmet BottomLeftHowto/BottomRightBack/TopRightOpSkip/BottomRightNext, UiManager In/Out(group) | ComUiGuide00 위치 11·17·12 와 라벨, Idle 검사 규칙, Next 의 PROCEED SE(charselect 안내 구현 재사용) |
| `input.ts` | mgm::GetOperationPlayerId/GetInputTrigger/GetInputRepeat | `operationPlayer(players)`(6.10 묶음·최소 PlayerID 규칙), `trig`, `rep = trig OR repeat`(RepeatGen 24/6f [근사], charselect 와 같음) |
| `sound.ts` | PlayBgm/StopBgm/IsPlayBgm/FadeAndEntryCancel/PlaySe2D | BGM 핸들 하나(새 kind 재생 시 즉시 끊기), 41종 표(33 무효), 2D SE 의 팬 = 페인 화면 위치, FadeAndEntryCancel = 지정 그룹 정지 + 새 재생 막기 플래그 |
| `types.ts` / `index.ts` | | 명세·어댑터 형식, 공개 진입점 |

메시지 창 자체(ComUiMessageWindow 의 레이아웃·글자 진행·넘김 입력)는 [message_window.md](message_window.md) 9절의 `messageWindow/` 부품이 구현하고, `messageFlow.ts` 는 아래 어댑터에만 의존한다.

```ts
interface MessageWindowAdapter {          // ComUiMessageWindow 인터페이스 (5.3 의 원본 함수 그대로)
  setMessageLabel(label: string): void; setChoices?(a: string, b: string): void;
  disablePadInput(pad: boolean, b: boolean): void; setOwner(pid: number): void; setTalkSkip(pid: number): void;
  setOffset(v: [number, number, number]): void; start(): void;
  isOut(): boolean; isEnd(): boolean; isNextInputWait(): boolean; isAllTalkEnd(): boolean;
  currentMessageNo(): number; requestNext(b: boolean): void; choiceResult(): number;
}
```

### 9.3 원본 이름 ↔ 웹 이름

| 원본 | 웹 |
|---|---|
| SetupStart(파일/목록, 레이아웃) | `createWindow({ files, layout })` |
| vt+0x268 SetupMenu(rows, cols, wrap, check) | `grid.setupMenu(rows, cols, { wrap, checkEnable })` |
| SetupAddAnimeMenu(MenuAnime) | `grid.addAnimeSet([cursor, rest, enter, leave, decide, afterDecide, …불가판 6])` |
| SetupItemMenu(r, c, pane, k) | `grid.setupItem(r, c, pane, k)` |
| HookMenuItemLayout / RemoveMenuItemLayout | `window.hookItem(r, c, itemLayout)` / `unhookItem(r, c)` |
| SetupFinish | `grid.finish()` |
| SetAnimeWindow(names) | `window.setWindowAnime(names)` |
| vt+0x228/0x230 In/Out(imm) | `window.in(imm)` / `window.out(imm)` |
| vt+0x2a0/0x2a8/0x2b0/0x2b8 | `setCursor / moveX / moveY / decide` |
| vt+0x260 | `isCursorItemAnimating()`(비대칭 유지) |

### 9.4 원본과 같게 / 웹에서 바꾸는 것

| 항목 | 원본 | 웹 |
|---|---|---|
| 이동 규칙(넘김·끝 멈춤·왼쪽 우선 탐색·선택 가능 조건·immediate=false) | 6.3·6.4 | 같게 |
| null 애니 대체 규칙(onCursorIn 은 검사, onCursorOut 의 setNext·SetupFinish·decide 는 무검사) | 6.1·6.3·6.6 | 같게, 단 null 재생 요청은 "아무것도 안 함"으로 처리 [근사: 엔진 동작 미확정] |
| checkEnable 메뉴에서 불가로 바꿀 때 애니 안 바뀜 | 6.5 | 같게 |
| isCursorItemAnimating 비대칭 | 6.6 | 같게 |
| 선택 가능 칸 없는 메뉴에서 무한 반복 | 6.4 | 같은 결과를 내되 무한 루프 대신 "한 바퀴 돌면 멈춤" 방어 + 개발 경고 [근사] |
| 항목 위치 | 창 페인 전역 행렬·알파를 따라감 | 같게(행렬 곱 순서 = 페인 전역 × 자기 SRT) |
| 메시지 흐름 대기 | 파이버 Fiber::Wait | 프레임 제너레이터(한 번 yield = 1프레임). 자동 3.0 s 는 원본처럼 Wait 뒤 dt 를 더해 비교(첫 프레임 dt 포함) |
| 메시지 창 위치 MESSSAGE_WINDOW_OFFSET | (0, 0, 0)(4.3) → 메시지 속성 OffsetX/Y 사용 | 같게 |
| 키 반복 간격 | bex [미확정] | RepeatGen 24/6f [근사, charselect 와 같음] |
| BGM | PlayBgm 즉시 끊고 새로 | 같게. StopBgm·FadeAndEntryCancel 페이드 = 6.9 FadeTimePreset 표(프리셋 6 = 0.5 s) |

### 9.5 구현 순서(제안)
1. `menuGrid.ts` + 시험(이동·넘김·탐색·불가·null 대체·비대칭) — 엔진 없이.
2. `mgmcommon_web_assets.py` 로 mgm00 명세, `window.ts`(in/normal/out) 를 mgm00 단독 레이아웃 하나(`mgm00_tlp_course_01` + SetAnimeWindow 좌판)로 확인.
3. `itemLayout.ts`(제약) — 창 in 애니 중 항목 따라가기.
4. `text.ts`, `input.ts`, `sound.ts`, `guides.ts`.
5. 메시지 창 분석(후속) 뒤 `messageFlow.ts` 어댑터 연결.

### 9.6 구현 계약 (2026-10-07 고정 — 미니게임 항구 프리 플레이 1단계)

프리 플레이 한 바퀴(항구 허브 B·규칙 설정 B·프리 플레이 목록 C·미니게임 틀 D)가 함께 쓰는 공용 계약이다. 코드 = `web/script/shell/mgmcommon/`(공개 진입점 `index.ts`). 원본 근거는 위 1~8절·[message_window.md](message_window.md), 원본에 없는 웹 쪽 결정은 **[설계]** 로 적는다. B/C/D 는 이 계약을 import 해서 쓰고, 계약을 바꿀 일이 생기면 이 절을 먼저 고친다.

**프레임 순서 [설계]** (원본 파이버·엔티티 갱신 순서는 [미확정]): 한 틱(1/60 s, dt = `Math.fround(1/60)`) = ① `MgmInput.update()`(조작 플레이어·누름·반복 비트) → ② `FiberRunner.step()`(장면 흐름 제너레이터, 시작 순서대로 한 번씩) → ③ UI 갱신(`MgmWindow.update()`·`MgmLayout.update()`·`MessageWindow.update(dt)` — 창 상태기계 다음 글자 진행, 3절) → ④ 그리기. 메시지 창이 장면 흐름보다 뒤에 갱신되므로 흐름이 이번 틱에 건 요청(Start·RequestNext)은 같은 틱 ③ 에서 처리된다.

| 계약 | 파일 | 요약 (원본 대응) |
|---|---|---|
| 흐름 | `fiber.ts` | `type Flow<T> = Generator<void, T, void>` — `yield` 한 번 = `Fiber::Wait()` 1프레임. `waitFrames(n)`·`waitUntil(pred)`·`waitTime(sec, dt)`(Wait 뒤 dt 를 f32 로 더해 비교, 5.3 의 3.0 s 와 같은 방식). `FiberRunner.start(flow) → FiberHandle{done, result}`, `step()`. 흐름 안에서 다른 흐름은 `yield*` 로 부른다(원본 함수 호출) |
| 입력 | `input.ts` | `PAD`(A 0x1·B 0x2·0x4·0x8·0x10~0x80·십자 0x100~0x800·스틱 0x10000~0x80000, 6.10). `operationPlayerId(players, {remembered, localOnly, includeOther})` = 6.10 묶음 규칙. `MgmInput`: `update()` 뒤 `operator`·`trig()`·`rep()`(= 누름 OR 반복, 반복 = charselect RepeatGen 24/6f [근사])·`hold()`·`trigOf(pid)`·`isCom(pid)`. 화면별 "마스크 전체 같음" 비교는 부르는 쪽 |
| 공용 창 | `menuGrid.ts`·`windowLife.ts`·`window.ts` | 순수 `MenuGrid`(4.1·6.1~6.6, 사건 `drain()`), 순수 `WindowLife`(5.1), 그리기 묶음 `MgmWindow`(9.3 이름표 그대로: `setAnimeWindow`·`in/out(imm)`·`isVisible`·`setupMenu(rows, cols, {wrap, checkEnable})`·`addAnimeSet`·`setupItem`·`hookItem/unhookItem`·`setupFinish`·`setCursor/moveX/moveY/decide`·`setItemEnable/Visible`·`isCursorItemAnimating`). 페인 항목의 애니 = 그 페인 부품(prt1) 인스턴스의 태그 재생, 부품이 아니면 무시 [설계: 원본 PlayPaneAnimation 의 부품 아닌 페인 동작 미확정] |
| 항목 레이아웃 | `itemLayout.ts` | `MgmLayout`(LayoutCommon) — `setConstraint(win, pane)` 이면 그릴 때 루트 = 페인 전역 행렬 × 자기 SRT, 알파 × 페인 전역 알파/255, 창 레이아웃이 숨으면 안 그림(6.7) |
| 글자 | `text.ts` | `parseMessage(raw, {texts, inserts, numbers})` → 글자 단위(색·컬러 글리프)·줄·Wait_Scale 위치. `insertValue(value, texts)` = 라벨이면 문구, 아니면 문자열 64자(6.8). `MgmWindow.setText(pane, label, inserts?)`·`insert(pane, 'Text0'|'Number0', value)` |
| 소리 | `sound.ts` | `MGM_BGM_KIND`(7.3, 41칸·33 = null), `FADE_TIME_PRESET`(6.9), `MgmSound`: `playSe`·`playSe2D(label, x)`·`playSe2DPane(label, win, pane)`·`playBgm(kind)`(같은 핸들 즉시 끊기)·`stopBgm(preset)`·`isPlayBgm`·`fadeAndEntryCancel()`(그룹 0x22·1·0x25·0x29 를 프리셋 6 = 0.5 s 로 정지 + 새 재생 막기, 소속 = 6.9 표의 라벨 규칙)·`releaseEntryCancel()` [설계: 원본 해제 위치는 이 범위 밖]. 모드 장면 프리셋 치환 `SQ_SE_SYS_MES_PUT → SQ_VOI_SYS_MES_PUT`(message_window.md 7절) |
| 안내 | `guides.ts` | `MgmGuide`(ComUiGuide00 1개 = sys_guide_03, 위치 번호 11 왼쪽·12/17 오른쪽, `in(checkIdle)`/`out()`), `createMgmetGuides()` = 5.4 의 HowTo(11)·Back(17)·Skip(12, Idle 검사 없음)·Next(17, `out(false)` = PROCEED + 진동) |
| 메시지 | `messageWindow/`·`messageFlow.ts` | `MessageWindowAdapter`(9.2 + `addMessageLabel`·`setInsert`·`update(dt)`), `MessageFlow`: `initialize()`·`prepare(label 또는 라벨 배열 [설계: 배열 = AddMessageLabel 로 여러 페이지], choice0?, choice1?)`·`open/openAuto(offset)`·`*flow(n)`·`*continueFlow(n)`·`*autoFlow(n)`·`*continueAuto(n)`·`*waitEnd()`·`disablePadInput(a, b)`·`finalize()` = 5.3 그대로. `MESSSAGE_WINDOW_OFFSET` = (0,0,0) |
| 장면 전환 | `contracts.ts` | `SceneRouter{ call(name, args?), ret(result?), current, depth }`, `MgmSceneInstance{ step(), render(), dispose() }`, 공장 `(name, ctx, args, returned?) → Promise<MgmSceneInstance>`, 기본 구현 `SceneStack`. **[설계]** call = 부모를 버리고(원본: 부모 파이버 `Sleep(-1)`) 자식을 만든다, ret = 자식을 버리고 부모를 **새로 만든다**(원본 mgmet 은 `InitFromMgm01`·시작 지점 7 로 재구성 — mgmet_flow.md 3절, 인스턴스 보존 여부 [미확정]). 부모가 복귀 뒤 알아야 하는 값은 `MgmWork`(시작 지점 등)로 넘긴다. 요청은 다음 `step()` 경계에서 처리 |
| 저장소 | `contracts.ts` | 영구 `MgmSave`: `modeFlags`(u32, `MODE_FLAG.OP_SKIP` 1·`MGM01_SETUP` 4·`FIRST_HOWTO_MGM01` 8 — mgmet_flow.md 8절), `minigame(id) → {head(u16, 0 이 아니면 플레이함으로 셈), flags(MG+4: `MG_FLAG.NEW` 1·`FAVORITE` 4)}`·`setMinigame`·`requestSave()`(요청만, 디스크 기록 시점 [미확정] — mgm01_freeplay.md 8.4). 세션 `MgmWork`: `entranceStartPoint`(Work +0x4bc), `rule: RuleCache{valid, cpu, vs, star, round, explain, experience}`(Work +0x764~, mgmet_ruleconfig.md 8.1), `flags`(flag::Set 번호 집합: 1·4·6·0x3c), `round`·`results`(100칸 고리, mgm01_freeplay.md 6.6), `mg`(ID → Work new/unlock/favorite). 기본 구현 `MemorySave`(JSON 직렬화 — 페이지가 localStorage 등에 둔다 [설계])·`createWork()`. 헬퍼 `playedCount(save, ids)`(mgmet @0x710005b0d0 규칙) |

- 셸 모듈은 `script/core·games·view·game.ts·env.ts` 를 import 하지 않는다(9.1). 에셋 URL·패드·소리 출력·저장 매체는 페이지 어댑터가 넣는다(charselect_page.ts·modeselect_page.ts 방식).
- 명세 [설계]: `web/assets/mgmcommon/spec.json` = mgm00 20 레이아웃 + bq Parts 메시지 창·안내 레이아웃 + 공용 글꼴(mgm00·mgmet·mgm01·im 문구 전체 글리프) + 문구·메시지 속성·소리. `mgmet.json`·`mgm01.json` = 각 모드 lyt 레이아웃·텍스처만(글꼴은 공용 것). `loadMgmSpec(url, ['mgmet.json'])` 가 합친다 = 원본의 (자기 lyt, mgm00 lyt) 묶음(3.2). 같은 이름은 모드 쪽이 이긴다.
- 글꼴 범위 [설계]: 작은·중간 글꼴(bqfont_small·middle 과 _shadow) = texts 전체 글자, 큰 글꼴(bqfont_large·_shadow) = 레이아웃 기본 문구 + `_tlp_`·`im_modeNN_name`·`mgmet_ui_act*` 문구만(아틀라스 3072×6048 → 3072×1134). 새 문구가 큰 글꼴 페인에 들어가야 하면 변환기 `LARGE_LABELS` 를 넓힌다. bqfont_telop·nintendo_udsg-r_std_003 은 FcpxSet 에 글꼴 파일이 없어 render2d 시스템 글꼴 대체 [근사].
- 그리기 [설계]: 나눈 창 정점색·흐림 창 처리는 modeselect 화면 코드와 같은 규칙을 `view.ts` 에 둔다(9.1 경계상 modeselect import 불가). 여러 줄·색 태그 글자는 `RichTextPane`(글자마다 txt 노드)으로 원래 글자 페인 자리에 그리고, 그 레이아웃 노드보다 뒤에 그린다 [근사: 원본은 페인 순서대로]. `Render2D.draw(inst, base, alpha = 255)` 에 알파 인자를 더했다(기본값 = 기존 동작, 제약 항목의 페인 전역 알파용). 붙인 항목 레이아웃은 창 다음에, 커서 항목을 마지막에 그린다(같은 그리기 순위 엔티티 사이 순서 [미확정]).
- 창 windowFlags bit4 = **내용 안 그림** [추정: nn::ui2d 창 플래그 이름; 데이터 정황 = mgm00·mgmet·mgm01·Parts 묶음의 bit4 창 61개가 전부 `flame`·`frame`·`shadow`·`cursor` 이고 내용 재질에 텍스처가 없어, 내용을 그리면 커서 테두리가 꽉 찬 노란 사각형이 된다(헤드리스 1회차에서 발견)]. 변환기가 나눈 창의 가운데 조각을 숨긴다. bit2·3(창 종류 7·11) 뜻은 [미확정] — 이 묶음에서는 mgm00_mgmstat_00 `win_balloon`(7), mgmet 결과·태그 결과 창(7·11)만 해당.

## 10. 검증 코드·실행 결과·기대값

실제로 한 것:

| 검증 | 방법 | 결과 | 수준 |
|---|---|---|---|
| 대상 함수 디컴파일 | Ghidra headless(`mgmcommon_ghidra.sh`·`_nro.sh`) | main 64+30+21+16+α, mgmet 12+33+65(호출자), mgm01 5+11+3(호출자) 함수를 C 로 저장, INDEX.tsv 갱신(31,841줄) | [판독 원천] |
| vtable 칸 이름 | ptr 덤프 + Ghidra 가 함수로 안 잡은 16칸 생성 디컴파일 | 4.2 표 | [판독] |
| C 가 인자를 빠뜨린 곳 | 어셈블리 3곳: SetCursor(옛 커서로 onCursorOut), isCursorItemAnimating(레이아웃 갈래 vt+0x178 꼬리 호출), SetItemEnable(vt+0x258 를 (r, c) 로), SetupStart#3(int 미사용), SetPaneTextInsertMessage(key·value 두 string_view), SetAnimeWindow 인자 | 6.3·6.5·6.6·3.2·6.8 | [판독: 어셈블리] |
| 이름 표·문자열 | `MgmcommonData.java`·`MgmcommonStr.java` | 기본 애니 세트·창 애니·BGM 41종·mgm01 애니 세트·mgm01 레이아웃 이름 | [데이터] |
| 메시지 창 위치 상수 | 0x7101c25830 참조 검색 + adrp 페이지 스캔(1차), 2차: 심볼 참조(main GOT 0x7101a87280, mgm03·05·06·mgmet 가져오기) | 쓰는 곳 없음, .bss → (0, 0, 0) | [판독] |
| mgm00 레이아웃 | `python web/tools/analysis/ui_lyt.py dump …` → `python web/tools/analysis/mgmcommon_lyt_dump.py` | 20 레이아웃·56 애니, 파서 검사 경고 0(`_summary.json` checks {}) | [실행: 변환][데이터] |
| NRO 별 mgm00 참조 | NRO 바이너리 문자열 `mgm00_*` 검색 | 7.1 표 마지막 열 | [데이터] |

하지 않은 것: 원본 실행 대조 없음, 웹 구현·헤드리스 없음, 합성 시험 없음(구현 단계에서 9.5-1 의 시험이 첫 실행 검증이 된다).

구현 단계 기대값(합성 시험 입력 → 기대):
- setupMenu(1, 5, wrap=1, check=1), 칸 2 불가, 커서 (0,1): moveX(+1) → (0,3) (2 건너뜀), moveX(+1)×2 → (0,0) (넘김).
- 같은 메뉴 wrap=0, 커서 (0,4): moveX(+1) → 그대로, onCursorEdge 1회, 반환 0.
- 3×3, (1,1) 숨김, 커서 (0,1): moveY(+1) → (1,0) (왼쪽 우선), (1,0)도 숨김이면 → (1,2).
- 기본 세트 + setCursor 이동 → 옛 칸 "off"→next "normal", 새 칸 "on"→next "cursor". mgm01 세트 → 새 칸 "on"(전환 없음), 옛 칸 "off"→next null.
- autoFlow: 페이지 2개, 각 페이지 완료 프레임 F 다음 Wait 부터 dt(1/60, f32) 를 더해 3.0 이상이 된 프레임(180 또는 f32 누적 오차로 181번째)에 넘김 요청 — 구현은 원본처럼 f32 누적으로 비교.
  - 구현 확인(2026-10-07, `web/tools/test_mgmcommon.ts` 5절·`test_msgwin.ts` 5절): f32(1/60) 누적이 3.0 이상이 되는 것은 **181번째 Wait**. 기대값 표의 나머지(격자 이동 4건·애니 세트·SetupFinish·비대칭)는 `test_mgmcommon.ts` 1·2절에서 그대로 통과.

구현 단계 검증(2026-10-07, 웹 실행 — 원본 실행 대조는 여전히 없음):

| 검증 | 명령 | 결과 |
|---|---|---|
| 순수 상태(격자 이동·애니 세트·창 생애·조작 플레이어·반복·흐름·소리·글자·장면 스택·저장소) + 실제 명세 공용 창·항목 제약 | `npx tsx tools/test_mgmcommon.ts` | 99/99 |
| 메시지 창·메시지 흐름 | `npx tsx tools/test_msgwin.ts` | 52/52 |
| 명세 ↔ 원본 덤프(레이아웃 85·노드 1,531·애니 249), 문서 표 값, 문구 381·ATR 183, 글꼴·텍스처 134·소리, import 경계 | `npx tsx tools/check_mgmcommon.ts` | 10,935/10,935 |
| 헤드리스 1회차 → 창 bit4 발견(9.6) → 2회차 | `npx tsx tools/shot_mgmcommon.ts` → `web/test/out/mgmcommon/*.png` | 콘솔 오류 0, 메시지 창 (0,−270)·이름표·삽입어 색·화살표, 텔롭 좌판, 메뉴 3×5·커서 테두리·툴팁 |

## 11. 미확정 사항과 추가 분석에 필요한 근거

| 항목 | 상태 | 필요한 근거 |
|---|---|---|
| ComUiMessageWindow 내부 | **닫힘(2차)** → [message_window.md](message_window.md). 그 문서 11절에 남은 것(보이스 변형·속도 설정 이름 등) | — |
| MESSSAGE_WINDOW_OFFSET 값 | **닫힘(2차)**: (0,0,0) [판독, 4.3] | — |
| ComUiDialogBox·ComUiGuide00 그림/입력 | [미확정] (ComUiGuide00 은 charselect 구현 재사용 가능) | bq 엔진 판독 |
| 엔진 PlayAnimation/SetNextAnimation(null) 동작 | [미확정] | ComUiBase::PlayAnimation @0x710020d7a0 판독 |
| 사운드 그룹·프리셋 | **닫힘(2차, 6.9)**: 소속 규칙·값 [판독+데이터]. 열거형 이름 문자열은 바이너리·데이터에 없음 → 이름 자체는 [미확정], FADE_TIME_NN = 칸 NN [추정], 0x26~0x28 종류값 뜻 [추정] | FUN_71000fce40 판독 |
| BeginScene 의 FUN_71000bfcfc(ENTRANCE BGM 두 개) 뜻 | [추정 미리 준비] | FUN_71000bfcfc 판독 |
| WorkModule +0x3d18(기억된 조작 플레이어) writer, order ≠ INT_MIN 갈래 세부 | [미확정] | WorkModule 쓰기 함수 탐색 |
| 입력 비트 0x4·0x8·0x10~0x80 의 버튼 이름 | [추정 X·Y·L·R·ZL·ZR] | bex InputModule 비트 표 |
| 진동 이름 | [미확정] | VibrationModule::Play 인자(디컴파일 누락) |
| `mgm00_cursor_00`·`mgm00_cursor_around_00` 사용처 | **닫힘(2차, 7.1)**: 코드 이름 참조는 없고(main·전 NRO 문자열 검색) mgm01·mgmet 레이아웃의 부품(prt1)으로만 쓰인다 [데이터]. mgm02~06 레이아웃에는 없음 | — |
| `x_text_NN_shadow` 짝 채우기 | [미확정] | GuiLayoutText/ComUiBase::GetText 판독 |
| BottomRightNextMessage Mode 별 라벨 | [미확정] | mgmet @0x71000706b4 std::string 원천 어셈블리 |
| ContinueMessageFlow(n) 반환 시점 해석(페이지 n 표시 프레임) | [추정] (판독 규칙에서 해석) | 원본 실행 또는 메시지 창 상태 갱신 판독 |
