# 온라인 멀티 화면 (프렌드 매치 방 만들기·찾기·대기실, 전 세계 매칭) — 원본 분석과 독립 모듈 명세

2026-10-07. 상태: **분석 완료(판독·데이터) → 이 문서를 근거로 구현(9절), 원본 실행 대조 없음, 실제 네트워크 없음**. 1~9·11절을 구현 전에 썼다. 구현 중 달라진 것은 해당 절에 `정정:` 줄을 먼저 넣고 코드에 반영한다.
형식은 `F:/dev/mps/web/docs/분석.txt` 11절 구성. **이 화면 고유 내용만** 적는다. 레이아웃 재생·그리기 규칙은 [charselect.md](charselect.md) 6.4·6.5·12절·[modeselect.md](modeselect.md) 6.1·6.2, 메시지 창·입력·소리는 [message_window.md](message_window.md)·[mgm_common.md](mgm_common.md), 정렬은 [ui2d_alignment.md](ui2d_alignment.md), 엔진 입력 비트·소리는 [../engine/05_ui_input.md](../engine/05_ui_input.md)·[../engine/04_sound.md](../engine/04_sound.md) 를 따른다.

확정 수준: **[판독]** 디컴파일 C, **[판독: 어셈블리]** C 가 문자열 인자를 잃은 곳만 adrp+add 참조 순서로 확인(10절 목록), **[데이터]**, **[추정]**, **[미확정]**, **[실행: 변환]** 자체 도구 실행, **[설계]** 웹이 정한 것.
주소: menu00.nro·matching00.nro·menu01.nro (SwitchLoader 베이스 0x7100000000, 심볼 있음). NEX/NPLN 세션 API(`bex::NetworkModule::*`)는 **이름과 호출 시점만** 적는다(구현 대상 아님).

---

## 1. 기능 개요와 사용자에게 보이는 동작

Jamboree 의 온라인은 두 갈래다 [판독].

| 갈래 | 진입 | 화면 흐름 | 모듈 |
|---|---|---|---|
| **프렌드 매치**(방) | 광장(menu00)에서 친구 버튼(안내 `mn01_mainMenu_ctrl_friend_btn` "") | 접속 → **방 만들기 / 방 찾기** 선택 → (만들기) 4인용/8인용 방 선택 → 패스워드 설정 확인 → 방 생성 → **대기실(광장 그대로 + 위쪽 대기 텔롭)** / (찾기) 방 목록(4인용/8인용 탭, 갱신, 방 ID로 찾기) → 참가 확인 → (필요하면 캐릭터 다시 고르기·패스워드 입력) → 참가 → 대기실 | menu00.nro `SequenceMainMenu::OnlineMenuImpl` + `ComUiNet*` + `*SessionFiber` |
| **전 세계의 사람**(무작위 매칭) | 모드 메뉴(menu01)에서 "대전 상대는 어떻게 할까요?" 두 버튼 중 오른쪽 "전 세계의 사람" | matching00 장면: 접속 → "함께 플레이할 사람을 찾고 있습니다…"(제한 시간 표시, `+`/`-` 취소) → "매칭 성공! 잠시만 기다려 주십시오." → 참가자 목록 5 s → (보드) 규칙 표시 5 s → "이제 곧 게임이 시작됩니다!" → 장면 전환 | menu01 `ComUiSelectMatchMode`, matching00.nro `Scene`·`UiManager`·`ComUi*` |

대기실에 따로 "참가자 목록 창"은 없다. 참가자는 광장 3D 캐릭터로 보이고, UI 는 **위쪽 텔롭**("참가자를 기다리는 중입니다… N/4" ↔ "파티로 출발할 수 있습니다 N/4")·**알림**("○○ 님이 참가했습니다.")·**안내 글자**(방장: Y 방 정보 / X 초대하기 / B 해산하기, 참가자: B 방 나가기)뿐이다 [판독 4.6·5.5]. 방장의 "시작"은 광장에서 기구(모드 메뉴)로 가는 것이고, 그때 `PlaySession` 이 방을 닫고 모두를 모드 메뉴로 보낸다 [판독 5.6].

## 2. 분석 대상 원본·자료 위치

| 항목 | 위치 |
|---|---|
| 프렌드 매치 코드 | menu00.nro `SequenceMainMenu::OnlineMenuImpl` @0x710005c780 과 상태 람다 3개 @0x71000617c0·@0x7100061be0·@0x71000623e0(Ghidra 에 함수가 없던 두 개는 새로 만들어 디컴파일), `ComUiNetMenu` @0x7100076b80~, `ComUiNetMenuRoomType` @0x7100077d08~, `ComUiNetSessionList` @0x710007bdd4~, `ComUiNetSessionInfo` @0x710007aee4~·`UiNetSessionInfoFiber::Update` @0x710007a9d0, `ComUiNetLobbySessionStatus` @0x7100075a08~, `ComUiOnlineGuide` @0x710007f910~, `NetworkManager` @0x710002bf80~, 파이버 `ConnectNpln`@0x7100032520·`CreateSession`@0x71000340b0·`SearchSession`@0x7100034620·`SearchIdSession`@0x7100034e20·`JoinSession`@0x7100035a90·`PlaySession`@0x7100037a00·`LeaveSession`@0x71000382f0, 리스너 `NetErrorListener`@0x7100039600·`NetSessionListener`@0x7100039830 |
| 전 세계 매칭 코드 | matching00.nro `Scene::GameFlow` @0x71000107d8·`Matching_Bd` @0x7100010a00·`ConnectNpln`@0x7100012230·`MatchMake`@0x7100012320·`CheckFail`@0x71000125c0·`SetupSession`@0x7100012780·`ShowPlayerList`@0x7100012c10·`CancelMatching`@0x7100013164, `Scene::Params` @0x710000fd6c·@0x710000ff9c, `NetworkManager::RequestError` @0x7100004578, `MatchMakeFiber`@0x71000081d0, `ComUiStateTelop` @0x710001d21c~, `UiConfirmCancelDialogBox::UpdateAbortMatchingByUser` @0x710001e734 |
| 대전 상대 선택 | menu01.nro `ComUiSelectMatchMode` @0x710009f2c4~·`SequenceStartBd::SelectModeImpl` @0x7100041c10 (Ca·Kb 도 같은 꼴) |
| 디컴파일(새로) | `analysis/decomp/online_menu00.c`(356함수), `online_matching00.c`(332), `online_menu01.c`(40). 전 NRO C 원본 `ghidra_work/online/out/*.nro.c`(menu00 3458·matching00 800·menu01 3082 함수) |
| 도구 | `web/tools/analysis/online_ghidra.sh`(프로젝트 `ghidra_work/online/g3·g4` = ghidra_proj 사본) + 기존 `DecompileAll.java`·`MgmcommonDecompCreate.java`, 문자열 참조 `web/tools/analysis/online_strrefs.py`(capstone) → `analysis/online_{menu00,menu01,matching00}_strrefs.txt` |
| 레이아웃 | `menu~menu00.nx.bea/menu/menu00/layout.lyt`(mn00_friend_*·mn00_room_*·mn00_btn_room_01·mn00_base_lobby_00·mn00_tlp_lobby_00), `flow~matching00.nx.bea/flow/matching00/layout.lyt`(matching00_*), menu01 `mn01_base_opponent_00`, bq `Parts.lyt`(sys_dialog_00·sys_dialog_arrowchoices_00·sys_notice_00/01·sys_tlp_loading_00·sys_timer_00·sys_username_00/01·sys_face_00/01). 덤프 `extracted/converted/ui/{menu00,matching00,bq_Parts}/` [실행: 변환 ui_lyt.py] |
| 데이터 | `bq.nx.bea/common/data/noticeList.json`(알림 ID → 라벨) |
| 메시지 | koKR `menu01_main.json`(mn01_friend_*), `menu01_mode.json`(mn01_bd_ui_match_*·mn01_mode_ui_match_only), `matching00.json`(mtch00_*), `system.json`(sys_error_*·sys_notice_*·sys_network_*·sys_swkbd_*) |

## 3. 진입점과 전체 호출 흐름 [판독]

### 3.1 프렌드 매치 — `SequenceMainMenu::OnlineMenuImpl` (광장 메뉴 파이버)
```
OnlineMenuImpl:
  소리 ST_DUCKING_START_FRIEND, 환경음·목소리 낮춤
  if !IsConnected: ConnectNplnFiber 끝까지 대기; 여전히 미접속이면 → 끝(덕킹 해제, 메인 상태 2)
  ComUiBg(BG_TYPE 4 = mn00_friend_bg_00) In; Sleep 0.5
  sub = 1                                   // this+0x58
  while IsConnected:
     (앞 상태 FiberLite·Connect 파이버가 끝났으면) sub 로 람다 시작:
       1 → NetMenu 람다 @0x71000617c0   2 → RoomType 람다 @0x7100061be0   3 → SessionList 람다 @0x71000623e0
       그 밖(0) → 루프 탈출
     Wait
  NetMenu/RoomType/SessionList Out; Sleep 0.5
  if IsConnected && !IsSessionConnected: Disconnect      // 방 없이 메뉴를 나가면 접속을 끊는다
  로컬 플레이어 복원(RestoreLocalPlayerData) → 광장 캐릭터·카메라 재배치; Sleep 0.5; Bg Out
  ST_DUCKING_FINISH_FRIEND; 메인 상태 = 2(광장)
```
람다(각각 `this+0x58` 다음 값을 쓴다):

| 람다 | 동작 | 다음 sub |
|---|---|---|
| 1 NetMenu | `ComUiNetMenu::Start` → `IsFinished` 대기 | 취소(+0x39) → 0, 선택 0(만들기) → 2, 1(찾기) → 3 |
| 2 RoomType | `ComUiNetMenuRoomType::Start` → 대기. 취소(+0x38) → 1. 아니면 Sleep 0.5, `CreateSessionFiber(type = 버튼==1 ? 8인 : 4인, 패스워드)` 끝까지 대기, Sleep 0.5 | 방 생김(IsSessionConnected) → `SendNetworkPlayerData(0)`, 재입장 데이터에 패스워드 저장 → **0**; 실패 → 1 |
| 3 SessionList | `ComUiNetSessionList::Start` → 대기 | 미참가로 끝남 → 1; 참가됨 → 화면 페이드 아웃(1.0) 대기 → 0 |

sub = 0 으로 나가면 광장으로 돌아가고, 방에 있으면 광장이 대기실이 된다(`ComUiMainMenuLayout::Start` 가 `ComUiNetLobbySessionStatus::Start` 를 부른다 @0x7100074b98).

### 3.2 전 세계 매칭 — matching00 `Scene::GameFlow` → `Matching_Bd`(보드, 메뉴 Work +0xc ∈ {0,1})
```
GameFlow: Play SM_BGM_MATCHING; Sleep 1.0; Net::CancelAllListener; SetErrorListener
          switch MenuWork+0xc: 0,1 Bd / 2 Mgm02 / 3 Mgm03 / 4 Mgm04(세션 있으면 _Companion) / 5 Mgm05_2 / 6 Mgm05_4 / 7 Ca / 8 Kb
Matching_Bd:
  세션이 남아 있으면 DissolveSession → 끊길 때까지 Wait → ClearSession
  do { if !ConnectNpln() return; if !MatchMake() return; if !CheckFail(1) return } while !IsSessionConnected
  if SetupSession(4):
     StateTelop.ChangeMessage(2)          // "이제 곧 게임이 시작됩니다!" normal_ready
     ShowPlayerList()                     // 목록 In, SE SQ_SE_MATCHING00_MBR_LST, Sleep 5, Out 대기, WaitSync(6)
     BdRule.Start; SE SQ_SE_MATCHING00_BD_RULE; Sleep 5; WaitSync(7)
     재입장 데이터(호스트 이어받기 허용 여부 = NetworkManager+0x51==0) 저장; WaitSync(0x10)
     RequestExchangeScene; SE SQ_SE_MENU01_TRANSITION_WHO_NOBAL_MATCHING
```

### 3.3 대전 상대 선택 — menu01 `SequenceStartBd::SelectModeImpl` [판독]
접속돼 있고 세션이 없으면 먼저 `Disconnect`. `ComUiSelectMatchMode`: 버튼 0 항상 켬, 버튼 1(전 세계) = `!IsSessionConnected && 사람 수 < 2`. 결과 0 → 상태 4(일반 진행), 1 → 상태 0x10(매칭), 그 밖(취소) → 스택 pop.

## 4. 구조체·필드·상수 표

### 4.1 공통 UI 수명 칸 (ComUiNet* 모두 같은 틀) [판독]
`+0x38/+0x3c/+0x40`(클래스마다 위치 다름) = 상태: −1 숨김(Finished), 0 in 재생 중, 1 대기(Idle, 입력 받음), 2 out 재생 중. Start/In: 상태 ≥ 2 일 때만 "in"(또는 즉시 "normal") 재생 후 0. Update: 0 이고 애니 끝 → "normal", 1; 2 이고 애니 끝 → 숨김, −1. Out(imm): −1·2 가 아니면 imm ? 바로 숨김 −1 : "out", 2. `IsFinished = 상태 < 0`.

### 4.2 ComUiNetMenu (mn00_friend_base_set_00, 부품 mn00_friend_btn_set_00 ×2) [판독]
| 칸 | 뜻 |
|---|---|
| +0x38 u8 | 결정(누름) — 다음 프레임 Out |
| +0x39 u8 | 취소(B) |
| +0x3c | 4.1 상태 |
| +0x40 | 선택 버튼 0 = 방 만들기(왼쪽, `x_pict_make` 보임·`x_pict_search` 숨김), 1 = 방 찾기. **Start 가 0 으로 되돌리지 않는다**(지난 선택 유지) |
| 글자 | `x_text_title`=mn01_friend_ui_start_title "프렌드 매치", btn_00 제목/설명 = hostTitle "방 만들기"/hostDetail "방을 만들고 친구를 부른다", btn_01 = clientTitle "방 찾기"/clientDetail "친구의 방에 참가한다" |
| 안내 | ComUiGuide00 위치 0x11, `sys_ctrl_back`(B 뒤로) [판독: 어셈블리] |

### 4.3 ComUiNetMenuRoomType (mn00_friend_base_num_00, 부품 mn00_friend_btn_num_00 ×2) [판독]
| 칸 | 뜻 |
|---|---|
| +0x38 | 취소 |
| +0x3c | 처리 단계 1 선택 / 2 캐릭터 확인 / 3 패스워드 확인 / 4 키보드 대기 / 0 완료(→ Out) |
| +0x40 | 4.1 상태 |
| +0x44 | 선택 0 = 4인용 방, 1 = 8인용 방(지난 선택 유지) |
| +0x50/+0x51 | 버튼 켬: btn_00 항상, btn_01 = 사람 수 == 1. 끔이면 `x_gray`(회색 + "1명일 때만 선택할 수 있습니다." mn01_friend_ui_number_only) 보임, `x_normal` 숨김 |
| +0x58 | 패스워드 문자열(빈 = 없음) |
| 글자 | btn_00 room00 "4인용 방"/detail00, btn_01 room01 "8인용 방"/detail01(title·mess 의 _00·_01 둘 다 같은 라벨) |

### 4.4 ComUiNetSessionList (mn00_room_search_00, 행 부품 mn00_btn_room_01 ×5) [판독]
| 칸 | 뜻 |
|---|---|
| +0x38 | 4.1 상태 |
| +0x3c..+0x4c | 행 0~4 의 버튼 애니 번호 1 on·2 cursor·3 press·4 normal·5 off·6 disable (표 @0x710019b590 [데이터]) — 사용자명 글자색은 같은 번호로 white/white/brown/brown/brown/white (@0x710019b5a8) |
| +0x50 | 커서 칸(목록 전체 기준), +0x54 = 화면 첫 칸(스크롤) |
| +0x58 | 탭 0 = 4인용, 1 = 8인용 (`bq::NplnSessionType`) |
| +0x60/+0x68 | 보조 파이버 / 검색·참가 파이버 |
| +0xb8 | 키보드(방 ID) 입력 중 |
| NetworkManager+0xa0 | **검색 방 ID 문자열**(빈 = 목록 모드, 있으면 ID 모드: 탭 숨김 `x_null_no_tab`, 안내 B = "목록으로 돌아가기") |
| 글자 | 탭 search_title00/01 "4인용 방 찾기"/"8인용 방 찾기", L/R 글자 changeL/R(L·R 글리프), 설명 `x_text_mess_00` = 목록 모드 detail00(4인)/detail01(8인), ID 모드 detail02 "방을 찾았습니다." |
| 안내 | 위치 0x11, 3칸: renew "Y 갱신", search_ID "X 방 ID로 찾기", 목록 모드 `sys_ctrl_back`/ID 모드 search_back [판독] |

### 4.5 ComUiNetSessionInfo (mn00_room_info_00) [판독: 어셈블리 라벨]
`x_text_title`=info_title "방 정보", `x_text_room_00`=info_IDTitle "방 ID", `x_text_room_01`=info_ID(Text0 = 방 짧은 ID), `x_text_lock_00`=info_passTitle "패스워드", `x_text_lock_01`=info_pass(Text0 = 패스워드), `x_text_lock_02`=info_passOpen "X 패스워드 표시", `x_text_no_00`=info_voice01 "없음". +0x3c = 패스워드 있음. 대기 중 **X 를 누르고 있는 동안** lock_01 보임·lock_02 숨김. B → SQ_SE_SYS_CANCEL_S, out. 안내 `sys_ctrl_back`(UiNetSessionInfoFiber 가 In/Out).

### 4.6 ComUiNetLobbySessionStatus (mn00_base_lobby_00 → 부품 x_parts_tlp = mn00_tlp_lobby_00) [판독]
| 칸 | 뜻 |
|---|---|
| +0x38 | 켬(Start 1, Finish 0) |
| +0x3c | 4.1 상태 |
| +0x40 | 텔롭 상태 0 대기 / 1 출발 가능 (−1 미정) |
| +0x44 | 8인 방(게임싱크 클라이언트 최대 인원 == 8) |
| +0x48 | 방장 |
| 글자 | x_text_00 = lobby_wait "참가자를 기다리는 중입니다…", x_text_01 = lobby_start "파티로 출발할 수 있습니다", x_text_num_00/01 = lobby_number00 "[N]/4" 또는 number01 "[N]/8" (Number0 = 데이터 받은 인원) |
| 안내 글자 | guide_00 항상 보임. 방장: 00 = lobby_info "Y 방 정보", 01 = lobby_invite "X 초대하기"(보임 = 인원 < 최대), 02 = lobby_dismiss "B 해산하기". 참가자: 00 = lobby_leave "B 방 나가기", 01·02 숨김 [판독: 어셈블리 문자열 순서] |

### 4.7 matching00 Scene::Params (기본값 = createInstance @0x710000ff9c) [판독]
| 이름 | 오프셋 | 기본 | 범위(rtti) |
|---|---|---|---|
| SESSION_CH | +0xc | 0 | 0..0x80 |
| MATCHING_TIME | +0x10 | **120** (s, 타이머 시작값) | 10..120 |
| FAIL_LIMIT | +0x14 | **2** | 1..5 |
| DEBUG_*·LAUNCH_MINIGAME | +0x8·+0x18~+0x28 | 디버그 | — |
장면 파라미터 파일이 덮어쓰는지는 [미확정](rtti 프로퍼티 → 데이터 로더 미추적).

### 4.8 상수·표
| 항목 | 값 | 근거 |
|---|---|---|
| 방 최대 인원 | 4 / 8 (`CreateNplnSession(…, 4 또는 8, {gameMode}, 패스워드)`), 매칭 설정 이름 `BqP4MatchmakingConfigs`/`BqP8MatchmakingConfigs` | CreateSessionFiber [판독] |
| 패스워드 | 숫자 4자리(키보드 최소=최대 4), 머리말 `sys_swkbd_password_host_header`/`_client_header` | RoomType::PasswordImpl·JoinSessionFiber [판독] |
| 방 ID | 6자리(키보드 최소=최대 6, 프리셋 3), 머리말 `sys_swkbd_roomID_header`; 표시값 = `GetNplnShortGameSessionID()` | SessionList::UpdateProcess·SessionInfo::Start [판독] |
| 검색 | `SearchNplnSession(…, {gameMode, searchWord:""}, …, 1, 20)` — 마지막 두 인자 [추정: 시작 1·최대 20건] | SearchSessionFiber [판독] |
| 목록 거르기 | 열린 방, 0 < 참가 수 < 최대, **내 계정이 이미 들어 있는 방 제외** | GetSessionIndexList @0x710002cd30 [판독] |
| 목록 행 | 화면 5행, 스크롤 비율 = n ≤ 5 이면 1, 아니면 5/n·위치 = 첫칸/(n−5), n > 5 일 때만 스크롤바 보임 | UpdateProcess [판독] |
| 참가 요청·지도 데이터 대기 | 각 20 s (`ConvertToTick(20000000000)`) | JoinSessionFiber [판독] |
| 매칭 인원 대기 | 0.5 s 마다, 30 s 넘으면 해산·재생성 요청 | matching00 SetupSession [판독] |
| 매칭 성공 뒤 | Sleep 3 → WaitSync(1) … 목록 5 s, 규칙 5 s | 3.2 [판독] |
| 매칭 오류 이유 → 문구 | 0 B3, 1 B6, 2 B3, 3 B9, 4 B3, 5 B6 (표 @0x710005d700) | matching00 RequestError [데이터] |
| 알림 ID → 라벨 | Notice_JoinSession → sys_notice_joinSession, JoinSessionMissed00 → "참가하지 못했습니다.", SerchSession00/01 → "방을 찾고 있습니다."/"방을 찾지 못했습니다.", PlayModeMissed01 → "1대당 1명까지만 플레이할 수 있습니다." | noticeList.json [데이터] |

### 4.9 버튼 글리프 (안내 문구 첫 글자) [판독: 코드 입력 비트와 라벨 대조]
`U+E001` = X(비트 0x8, 방 ID·패스워드 표시 hold), `U+E002` = Y(0x4, 갱신·방 정보), `U+E003` = B(0x2), `U+E008`/`U+E009` = 탭 왼쪽(L|ZL = 0x50)/오른쪽(R|ZR = 0xa0), `U+E00F/U+E00E` = 매칭 취소(0x3000) [추정: +/−]. bex 비트 0x10 L·0x20 R·0x40 ZL·0x80 ZR·0x1000 +·0x2000 − 는 [추정](탭이 0x50/0xa0 쌍인 것만 판독).
- 정정(2026-10-07, 남은 화면 차이 수정 때 글리프를 직접 그려 확인): 위 X/Y 이름이 뒤바뀌었다. 확장 글꼴 `bqfont_*_extension.ffnt` 의 E000~E003 은 **버튼 위치 다이아몬드**(4점 중 하나 채움)이고 채운 점 = E000 오른쪽·E001 왼쪽·E002 위·E003 아래 [데이터: 글리프 렌더 `analysis/online_glyph_e000.png`]. 닌텐도 배치(위 X·왼쪽 Y·오른쪽 A·아래 B)와 코드 비트를 대조하면 **E000 = A(0x1), E001 = Y(0x8), E002 = X(0x4), E003 = B(0x2)** — 즉 bex 0x4 = X, 0x8 = Y [판독: 갱신(라벨 E002)은 비트 0x4 `UpdateProcess`, 방 ID(라벨 E001)·패스워드 표시(E001)는 비트 0x8 `UpdateProcess`·`ComUiNetSessionInfo::UpdateProcess`; 글리프 위치 = 데이터]. 같은 글꼴에 글자 단추 E004 A·E005 B·E006 X·E007 Y 도 있으나 **게임 문구는 E000~E003 만 쓴다**(koKR 전체에서 E004~E007 은 글꼴 글자 목록 `sys_font_charset_*` 에만 등장 [데이터]), main 에 0xe004~0xe007 즉시값 명령 없음 [판독: 명령 검색 `ghidra_work/online/out/main_e00x.txt`], 컨트롤러별 확장 글꼴 변형 없음 [데이터]. → 다이아몬드가 원본 표시이고 치환 규칙은 찾지 못했다(실행 중 컨트롤러별 교체 여부는 원본 실행 대조 없이 [미확정]으로 남긴다). 웹 페이지 어댑터 toBex 를 NPAD.X → 0x4, NPAD.Y → 0x8 로 통일한다(mgmet_page·modeselect_page 와 같은 방향).

## 5. 상태 전이와 전체 수명

### 5.1 방 만들기/찾기 선택 (ComUiNetMenu::UpdateSelect @0x71000771d0) [판독]
대기(1) + 두 버튼 애니 끝일 때만 입력. 안내(ComUiGuide00)가 끝나 있으면 In. 조작 = `GetOperationPlayerId(false,true)` 의 누름 비트:
- B → `SQ_SE_SYS_CANCEL`, 결정+취소 = 0x101 → 다음 프레임 Out.
- A → `SQ_SE_SYS_DECI` + 진동, 선택 버튼과 그 그림(`x_pict_make`/`x_pict_search`)에 "press", 결정 → Out.
- 왼쪽(0x10100 = 십자 왼쪽|스틱 왼쪽)이고 선택 ≠ 0 → btn_00 위치로 `SQ_SE_SYS_CURSOR`(2D) + 진동, Select(0). 오른쪽(0x40200)이고 ≠ 1 → Select(1). **넘김 없음.**
- Select(i, imm): 고른 쪽 "on"→"cursor"(imm 이면 cursor 만), 다른 쪽 "off"→"normal"; 그림도 같은 애니.

### 5.2 4인/8인 방 + 패스워드 (ComUiNetMenuRoomType) [판독]
UpdateProcess: 대기 + 두 버튼 애니 끝 + 단계 파이버 없음/끝 → 단계별 FiberLite(1 SelectImpl, 2 CharacterCheckImpl, 3 PasswordImpl), 4 = 키보드 응답 대기(메시지 0x5f534f00), 0·기타 → Out.
- **SelectImpl**: 안내 `sys_ctrl_back`. B → CANCEL, 취소 + 단계 0. 왼/오른쪽(켠 버튼만) → CURSOR + Select. A → DECI, 누름 애니. 4인 → 단계 3. 8인 → 사람 수 < 2 이면 단계 2, 아니면 대화상자 "8인용 방은 1대당 1명일 때만…"(number_check) 보이고 끝날 때까지 대기 후 단계 1 유지. 끝에 안내 Out.
- **CharacterCheckImpl**(8인만, 4인은 바로 3): 로컬 사람 중 쿠파(CharacterID 0xd)가 있으면 대화상자 "이 방에는 쿠파로 참가할 수 없습니다. 캐릭터를 다시 선택해 주십시오."(search_koopaChange) → 캐릭터 선택(쿠파 버튼 끔) → 결정이면 광장 캐릭터 재배치, 취소면 단계 1. 없으면 3.
- **PasswordImpl**: 대화상자 "패스워드를 설정하겠습니까?" 선택 3개 설정한다/설정하지 않는다/뒤로(뒤로 = SQ_SE_SYS_CANCEL, B 로 취소 가능, 기본 커서 1). 결과 1(설정 안 함) → 패스워드 비우고 **완료(0)**. 0 → 숫자 4자리 키보드(단계 4). 그 밖 → 단계 1. 키보드 취소 → 패스워드 비우고 단계 1, 입력 → 패스워드 저장 후 완료(0).

### 5.3 방 목록 (ComUiNetSessionList) [판독]
- **Start**: 검색 ID 비움, `SearchSessionFiber(type −1, 알림 켬)` 시작, SetSessionType(0), 행 모두 disable, in.
- **SearchSessionFiber**: 접속 상태 3 이 아니면 그냥 끝. 알림 켬이면 "방을 찾고 있습니다."; Sleep 0.5; 4인 방(type −1·0) 검색, 결과 있으면 Sleep 0.5 끝. 없고 사람 1명이고 type ∈ {1, −1} 이면 8인 방 검색. 끝까지 없으면(알림 켬) "방을 찾지 못했습니다.". Sleep 0.5.
- **UpdateProcess**(대기 상태만): 검색·참가 파이버가 도는 중이거나 키보드 중이면 안내 Out 하고 아무것도 안 함. 참가 성공(IsSessionConnected) → Out. 입력:
  - B: CANCEL. ID 모드면 목록 모드로(행 비우고 type 그대로 재검색), 아니면 Out(→ 3.1 sub 1).
  - Y: DECI_S, 행 비움. 목록 모드 → 재검색(현재 탭). ID 모드 → 같은 ID 로 `SearchIdSessionFiber`.
  - X: DECI_S, 방 ID 키보드(6자리) → 입력되면 그 ID 로 SearchIdSessionFiber, ID 모드.
  - L(0x50)/R(0xa0): 목록 모드에서 탭 4↔8 바꾸고 재검색, SQ_SE_SYS_DECI_LR, `null_l_all`/`null_r_all` 에 left_select/right_select. 8인 탭은 사람 1명일 때만 바로 검색, 아니면 보조 람다 [미확정: 본문 미판독, 알림 PlayModeMissed 류 추정].
  - 위/아래: 반복 입력. 위 = 0 이면 마지막으로(누름일 때만 넘김, 반복이면 멈춤), 아래 = 끝이면 0 으로(누름) / 멈춤(반복). 화면 첫 칸을 커서가 보이게 맞춘다(5행). CURSOR SE.
  - 각 보이는 행: 방 정보로 SetButton(사용자명 = 방장 이름, 얼굴 0~7: i < 참가 수면 `x_face_on`(캐릭터 얼굴), i < 최대면 `x_face_off`, `x_icon_pass` = 패스워드 있음). 8인 방이 사람 2명 이상인데 결과에 있으면 알림 + 4인 탭으로 재검색.
  - A(행 애니 중 아님): DECI, `JoinSessionFiber(방 ID)`.
- **SearchIdSessionFiber**: 4인 → (사람 1명이면) 8인 순으로 `BqGameSessionSearchConfigs` 에 searchWord = ID 로 검색, 찾으면 검색 ID 저장, 없으면 검색 ID 비우고 "방을 찾지 못했습니다.".

### 5.4 참가 (JoinSessionFiber::Update @0x7100035a90) [판독]
1. 검색 결과에서 ID 가 같은 방을 찾는다(없으면 끝). 8인 방이고 사람 ≥ 2 → 알림 PlayModeMissed01, 끝.
2. 대화상자 "○○ 님의 방에 참가하겠습니까?"(search_join, Text0 = 방장 이름) 예/아니요(기본 0). 아니요 → 끝. 진행 중 접속이 끊기면 대화상자 Out 후 끝.
3. 참가 수 0 → 알림 JoinSessionMissed00. 사람 수 + 참가 수 > 최대 → 알림 JoinSessionMissed00, 끝.
4. 로컬 사람의 캐릭터가 방 멤버와 겹치거나(8인 방에서) 쿠파면 대화상자 search_change "다른 사람과 같은 캐릭터를 사용할 수 없습니다…" / search_koopaChange → 캐릭터 선택(겹치는 캐릭터·8인이면 쿠파 끔). 취소 → 끝.
5. 방에 패스워드가 있으면 숫자 4자리 키보드(client 머리말). 빈 입력 → 끝.
6. `SetupNplnSession` → `SearchNplnSession` → `JoinSelectedNplnSession(ID, 패스워드)` → 결과 대기(0.5 s). 결과 4(성공)가 아니면 알림 JoinSessionMissed00 + 재검색.
7. 성공 & 방장 아님 & 입장 열림: 같은 계정이 이미 있으면 조용히 나감. `SendRequestJoin` → 응답 대기(NetworkManager+0xb8 ≠ 1, 20 s, 인원 < 2 이거나 내가 방장이 되면 실패) → `SendNetworkPlayerDataJoin` + `SendRequestMapData` → 지도 데이터(+0x80) 대기 20 s → `SendRemotePlayerInfoAll`, 페이드 인. 실패는 모두 `LeaveSessionSilently`(+ 알림).
방장 쪽 수락/거절 메시지(`SendToAcceptPlayer`/`SendToRejectPlayer`, 알림 Missed01~03 "인원 다시"·"인원 가득"·"패스워드 틀림")의 OnReceive 분기 세부는 [미확정](OnReceive @0x710002dc30 3172 B 미판독, 9.3).

### 5.5 대기실 (광장 + ComUiNetLobbySessionStatus) [판독]
매 프레임(켬일 때): 세션 없음 → Out. 있음 → (숨김이면 in) 8인 여부·방장 여부 갱신, **텔롭 = IsReadyNetworkPlayerData**(스테이션 ≥ 2 이고 멤버 ≥ 2 이고 모든 멤버 데이터 받음 [판독: 앞부분, 끝 조건 일부 추정]), 인원 = 데이터 받은 인원(GetNetworkPlayerDataCount = 상태 2 인 항목 수), 안내 갱신. SetTelop(s): 같으면 무시, 0→1 은 "move_00" 후 "normal_01", 1→0 은 "move_01" 후 "normal_00", 첫 설정(−1)은 바로 normal_0s.
안내 버튼 동작(누른 뒤 무엇을 하는지)은 `SequenceMainMenu::MainImpl`(8216 B) 안이며 문구만 확정: Y = 방 정보 창(5.5a), X = 친구 초대(시스템 애플릿, 인원 < 최대일 때만), B = 방장 해산 확인 "해산하고 방을 나가겠습니까?" 예/아니요 → `DissolveSession` / 참가자 "이 방에서 나가겠습니까?" 예/아니요 → `LeaveSession`. 버튼↔동작 연결 [판독: 글리프 4.9], 확인 대화상자 호출 위치 [미확정].
- 5.5a 방 정보 창: UiNetSessionInfoFiber → 안내 B 뒤로 In → SessionInfo Start(ID·패스워드 채움) → 숨김까지 대기 → 안내 Out.
- 세션 사건(NetSessionListener): 사건 2(방장 해산) → 오류 표시 "호스트가 방을 해산했습니다."(mn01_friend_mw_lobby_dismiss_client), 돌아갈 장면 menu00. 사건 1(스테이션 이탈): 나 자신이면 sys_error_B3 "통신이 끊어졌습니다.", 다른 사람이면 그 스테이션 데이터 지움(LeftStation), 예약 이탈이 아니고 +0x31(플레이 중) 이면 B3.
- 오류(NetErrorListener): 코드 1 → sys_error_B4 "접속 시간이 초과되었습니다.", 0x80 → B3, 0x5f4e4503 하위 4 → 재검색, 그 밖: 세션 있으면 B3, 없으면 일반 오류 + Disconnect.

### 5.6 방장 시작 (PlaySessionFiber::Update @0x7100037a00) [판독]
호출 = 광장에서 기구(`SequenceMainMenu::SelectedBalloonImpl`·`SequenceBalloon::CallSceneImpl`)로 갈 때. 방장: `SetSessionEntry(false)` 후 공개·입장 꺼질 때까지 대기(새 참가 막기). 접속/세션 없음 → B3(menu00). 스테이션 ≥ 2 인데 데이터 인원 < 2 이거나 멤버 < 데이터 인원 → B3. 정상: 플레이어 목록 정규화, 데이터 받은 원격 멤버는 그 캐릭터·사람(type 0), 나머지 칸은 COM(type 1), `PlaySession(2, gameMode)`, BGM 정지, `SQ_SE_MENU00_TRANSITION_WHO`, 0.5 s 페이드 아웃, WaitSync(1), Sleep 1, 메뉴 복귀 코드 1, menu01 호출. 스테이션 1(혼자)이면 아무것도 안 하고 끝(혼자 진행).

### 5.7 전 세계 매칭 상세 [판독]
- **ConnectNpln**(matching00·menu00 공통 꼴 @0x7100007cb0): 저장 플래그(+0x6c) 미설정이면 안내 대화상자 sys_network_check_dlg00(확인만) → dlg01 "접속한다/접속하지 않는다"(접속하지 않는다 → 끝). 로딩 텔롭(ComUiLoadingTelop = sys_tlp_loading_00, 문구 sys_network_load_tlp "인터넷에 접속하고 있습니다.") In → `ConnectNpln` 이 끝날 때까지 0.5 s 폴링 → Out. 처음 접속 성공이면 플래그 저장. 실패 → RequestError(0) = B3.
- **MatchMake**: 타이머 In·시작값 MATCHING_TIME, StateTelop Start("normal_search" = 찾는 중 문구), 안내 1칸 위치 0x11 `mtch00_ctrl_cancel`, flag 0x1d On, 미니게임 화면 Start, MatchMakeFiber 시작. 매 프레임 UpdateAbortMatchingByUser: 대화상자 없고 (세션 없음 또는 방장)일 때 **0x3000 누름** → 안내 Out, 취소 확인 "찾는 것을 그만두고 돌아가겠습니까?" 돌아간다(SQ_SE_SYS_DECI_L)/돌아가지 않는다 → 상대에게도 열림 알림. 결과 0 → 중단, 1 → 닫고 안내 In. 끝나면 타이머·화면·안내 Out, 중단이면 `AbortNplnMatchmake` + CancelMatching(돌아가기), 아니면 Sleep 1 계속.
- **CheckFail(1)**: 세션 있으면 통과. 실패 횟수 +1, FAIL_LIMIT(2) 이상이면 혼자 세션 만들기(CreateSoloSessionFiber, COM 으로 채움 [추정]) → 세션 생기면 통과. 아니면 텔롭 Out, 대화상자 sys_error_E "참가자를 찾지 못했습니다. 다시 한번 찾겠습니까?" 찾는다/그만둔다 → 찾는다면 다시 반복, 그만둔다면 CancelMatching.
- **SetupSession(4)**: 텔롭 ChangeMessage(1)("매칭 성공! …" to_ready), `SQ_SE_SYS_ONLIN_PLY_RNDMATCH`, 멤버 수 = 참가 수가 될 때까지 0.5 s 폴링(30 s 넘으면 해산·재생성 요청 후 실패), Sleep 3, WaitSync(1), 차단 계정 확인, 플레이어 데이터 교환(WaitSync 2~5), PlaySession.
- **StateTelop.ChangeMessage(t)**: 0 → `x_text_search` = mtch00_tlp_wait, "to_search"(이미 찾는 중이면 생략); 1 → `x_text_ready` = mtch00_tlp_loading, "to_ready"; 2 → `x_text_ready` = mtch00_tlp_start, "normal_ready"(이미 1 이면 생략) [판독: 어셈블리 라벨].
- **CancelMatching**: 세션이 없을 때만 Disconnect 후 대기, 리스너 원복, WaitSync(0x10), 플레이어 Work 복원, 돌아갈 장면(menu01 등) RequestReturnScene.

## 6. 계산식·조건·상세 의사코드

```
// 방 목록 커서(위/아래) — ComUiNetSessionList::UpdateProcess [판독]
n = 결과 수; cur = max(cur,0); top = max(top,0)
if trig(UP):   next = cur < 1 ? n-1 : cur-1
elif rep(UP):  next = cur - (cur > 0)
elif trig(DOWN): next = cur+1 >= n ? 0 : cur+1
elif rep(DOWN):  next = cur+1 >= n ? cur : cur+1
if next != cur:
   while top > next: top--          // 위로 넘치면 맞춤
   while next >= top + 5 and top+1 < n: top++   // 아래로 넘치면 맞춤
   CURSOR SE; cur = next
행 i(0..4): k = top+i; k < n ? SetButton(i, 결과[k]) + (k==cur ? cursor 애니 : off/normal) : disable(6)
// 스틱/십자: UP = 0x20800(위|스틱 위) 단 십자 아래를 누르고 있으면 0x800 만, DOWN = 0x80400 단 십자 위 누름이면 0x400 만
```
```
// 참가 가능 [판독 JoinSessionFiber 3단계]
canJoin = 참가수 > 0 && (사람수 + 참가수 <= 최대) && !(최대 == 8 && 사람수 > 1)
charConflict = 로컬 사람 캐릭터 ∈ 멤버 캐릭터들 || (최대 == 8 && 로컬 캐릭터 == 0xd)
```
```
// 대기실 텔롭 [판독 ComUiNetLobbySessionStatus::Update]
ready = stations >= 2 && members >= 2 && 모든 멤버 데이터 받음
count = 데이터 받은 인원;  max = 8인 방 ? 8 : 4
guide = host ? [info, invite(if members < max), dismiss] : [leave]
```

## 7. 애니메이션·소리·에셋 연결

| 대상 | 레이아웃(애니) | 비고 |
|---|---|---|
| 배경 | mn00_friend_bg_00 (normal 반복) | ComUiBg BG_TYPE 4 [판독: ComUiBg ctor 문자열 순서 0 sys_bg_set_00·1 mn03·2 mn05·3 sys_bg_base_04·**4 mn00_friend_bg_00**·5 sys_bg_00] |
| 만들기/찾기 | mn00_friend_base_set_00 (in/normal/out) + btn_set_00 (on/off/cursor/normal/press) + 그림 pict_make_01·search_01 | 렌더 순위 0x400 |
| 4인/8인 | mn00_friend_base_num_00 + btn_num_00 (+x_gray, mncom_guide_btn_00) + pict_room4_01·room8_01 | menu_common 부품 |
| 방 목록 | mn00_room_search_00 (in/normal/out/left_select/right_select) + btn_room_01 (on/cursor/press/normal/off/disable) + room_tab_00 (on/off) + room_face_00(sys_face_00) + sys_username_01(textcolor_white/brown) + 스크롤바(ComUiScrollBar, x_bar) | |
| 방 정보 | mn00_room_info_00 | |
| 대기 텔롭 | mn00_base_lobby_00(in/normal/out) → x_parts_tlp(mn00_tlp_lobby_00: normal_00/01, move_00/01) | |
| 매칭 | matching00_bg_00, matching00_tlp_00(normal_search/to_search/to_ready/normal_ready), matching00_base_member_00 + win_member_00(sys_face_01·sys_username_00), sys_timer_00 | 규칙판 win_board_00 은 목록만(11절) |
| 공용 | sys_dialog_00 + arrowchoices_00, sys_notice_00/01, sys_tlp_loading_00(+sys_icon_loading_00), ComUiGuide00 | 대화상자·알림의 엔진 동작 [미확정] |
| 대전 상대 선택 | menu01 mn01_base_opponent_00 | 버튼 0 제목 = 세션 있으면 match_friend "친구", (사람 > 1) match_local "가까이 있는 사람", 아니면 match_com "CPU"(그림 x_pict_cpu); 버튼 1 = match_world "전 세계의 사람"(x_pict_world, 끔이면 match_only "1명일 때만…") [판독: 어셈블리 문자열, 분기 조건은 추정] |

소리: SQ_SE_SYS_DECI·CURSOR·CANCEL·DECI_S·DECI_LR·CANCEL_S·DECI_L, SQ_SE_SYS_ONLIN_PLY_RNDMATCH, SQ_SE_MATCHING00_MBR_LST·BD_RULE, SQ_SE_MENU00_TRANSITION_WHO; BGM SM_BGM_MATCHING(스트림), 덕킹 ST_DUCKING_START/FINISH_FRIEND [판독].

## 8. 다른 기능과의 상호작용
- 방에 있는 동안 메뉴 Work 의 로컬 플레이어가 원격 플레이어로 채워지고, 프리 플레이 항구 등은 "온라인 접속 중에는 플레이할 수 없습니다."(mgm01_ui_announce01) [데이터].
- 재입장: 방 만들기·참가 때 `ReentryData::SetPassWard`, 매칭 시작 때 보드 Work 저장(재입장 허용 = 호스트 이어받기 가능) — 재입장 흐름(sys_reentry_*)은 범위 밖 [판독: 호출만].
- 친구 초대 받기(FriendInvitedImpl) → JoinSessionFiber 경로 재사용 — 범위 밖(목록만).
- 오류는 `bq::Net::RequestError(kind, 라벨, …)` 로 공용 오류 창에 넘기고 `SetErrorReturnSceneName` 장면으로 돌아간다 — 오류 창 자체는 bq(main) [미확정].

## 9. 웹 포팅 구조와 구현 순서

### 9.1 위치·의존
`web/script/shell/online/`(엔진 독립). import 경계 = [mgm_common.md](mgm_common.md) 9.1(같은 폴더·`../mgmcommon/*`·charselect 공개 모듈·three). 페이지 어댑터 `web/script/online_page.ts`, ui.html `UIS` 항목 `online`. 에셋 `web/assets/online/online.json`(+tex/font/sound) ← `web/tools/analysis/online_web_assets.py`(partyrule_web_assets 방식, mgmcommon `Bundle` 재사용). 얼굴 = `assets/mgm01/faces.json`.

### 9.2 네트워크 어댑터 계약 [설계 — 나중에 WebSocket 방 서버로 구현할 인터페이스]
화면은 **어댑터만** 본다. 요청은 즉시 반환하고 결과는 사건으로 온다(원본 파이버의 "요청 → 결과 폴링"과 같은 모양). 사건은 화면 틱 시작에 `poll()` 로 한꺼번에 받는다.

```ts
type RoomSize = 4 | 8;
interface OnlineSelf { name: string; chara: number; humans: number }          // 이 기기 사람 수(로컬 멀티)
interface RoomMember { station: string; name: string; chara: number; host: boolean; ready: boolean; local: boolean }
interface RoomSummary { id: string; host: string; size: RoomSize; members: number[] /*캐릭터*/; locked: boolean }
interface RoomState { id: string; size: RoomSize; password: string; host: boolean; entryOpen: boolean; members: RoomMember[] }
type OnlineEvent =
  | { t: 'connected' } | { t: 'connectFailed' }
  | { t: 'searchDone'; rooms: RoomSummary[] }                 // SearchSession/SearchIdSession 결과(5.3 거르기 끝난 것)
  | { t: 'created'; room: RoomState } | { t: 'createFailed' }
  | { t: 'joined'; room: RoomState }
  | { t: 'joinFailed'; reason: 'missed' | 'full' | 'password' | 'members' }  // Notice_JoinSessionMissed00~03
  | { t: 'memberJoined'; member: RoomMember } | { t: 'memberReady'; station: string }
  | { t: 'memberLeft'; station: string }
  | { t: 'dissolved' }                                         // 세션 사건 2
  | { t: 'started'; room: RoomState }                          // PlaySession 끝(모두 모드 메뉴로)
  | { t: 'matchFound'; members: RoomMember[] } | { t: 'matchFailed' }
  | { t: 'error'; code: 'B3' | 'B4' | 'B6' | 'B9' };           // 4.8 오류 표
interface OnlineAdapter {
  connect(): void; isConnected(): boolean; disconnect(): void;
  createRoom(size: RoomSize, password: string): void;          // CreateSessionFiber
  searchRooms(size: RoomSize | -1): void;                      // SearchSessionFiber(-1 = 4인 뒤 8인)
  searchRoomById(id: string): void;                            // SearchIdSessionFiber
  joinRoom(id: string, password: string): void;                // JoinSessionFiber 6~7단계
  leaveRoom(): void; dissolveRoom(): void;                     // LeaveSession / DissolveSession
  startRoom(): void;                                           // 방장 PlaySession(입장 닫기 → started)
  matchmake(): void; cancelMatchmake(): void;                  // MatchMakeFiber / AbortNplnMatchmake
  room(): RoomState | null;
  poll(): OnlineEvent[];
  tick?(dt: number): void;                                     // 가짜 구현용 시간 진행
}
```
- 정정(2026-10-08, 광장 D 갈래 — plaza_3d.md §5.1 ②⑥): 광장 대기실용 사건 2개와 선택 요청 2개를 **더했다**(기존 사건·요청 무변경). `{ t: 'remoteInfo'; station; slot; chara; pos: [x,y,z]; quat: [x,y,z,w] }`(SendRemotePlayerInfo 수신, 0.2 s 간격) · `{ t: 'stamp'; station; slot; stamp; chara }`(UiStamp NetTransfer 0xf019 수신), `sendPlayerInfo?(slot, chara, pos, quat)` · `sendStamp?(slot, stamp, chara)`. FakeOnline 옵션 `remoteMove`(원격 멤버가 광장을 걷는 흉내)·`stampEvery`(초) — 기본 꺼짐 [설계].

메시지 순서(서버 구현 메모): 참가 = `join(id,pw)` → 서버가 방장에게 요청 전달 → 방장 수락이면 참가자에게 방 상태 + 기존 멤버 데이터, 기존 멤버에게 `memberJoined` → 새 멤버 데이터 도착 시 모두에게 `memberReady`. 이탈·해산·시작은 방 전체 방송. 시간 제한 = 참가 응답 20 s·데이터 20 s(4.8).

### 9.3 웹이 정한 것 [설계]
| 항목 | 원본 | 웹 |
|---|---|---|
| 대화상자 | bq::ComUiDialogBox(main, 미분석) | sys_dialog_00 레이아웃 + 선택지 arrowchoices_00. 동작: in → 대기(선택지 좌우, A 결정, 취소 허용이면 B = 취소 칸) → out. 선택지 0개 = A 로 닫힘. 기본 커서는 부르는 쪽 값 |
| 알림 | bq::UiNoticeModule | sys_notice_00 의 첫 칸에 sys_notice_01 하나(in → 2 s → out). 동시 여러 개 쌓기 [미확정] |
| 키보드(swkbd) | 시스템 애플릿 | 화면 위 숫자 입력 패널(HTML 아님, 캔버스 글자). 패스워드 4자리·방 ID 6자리, B = 취소 |
| 대기실 배경 | 광장 3D | 페이지 배경 이미지(`assets/modeselect/backdrop_temp.png`) + 텔롭·알림·안내만. 멤버 목록은 디버그 패널 글자 |
| 방장 시작 | 광장 기구로 이동 | 대기실에서 A = 출발(`startRoom`) [설계: 원본 입력 아님] |
| 친구 초대 | 시스템 애플릿 | 효과음만, 알림 없음 |
| 캐릭터 다시 고르기 | ComUiSelectPlayerCharacter | 다음 빈 캐릭터로 자동 교체 + 대화상자 문구만 [설계 단순화] |
| 매칭 BGM | SM_BGM_MATCHING 스트림 | 없음 |
| 매칭 화면 | 미니게임 화면·카드뷰어·규칙판 | 배경·텔롭·타이머(sys_timer_00 숫자 그림)·멤버 판만 |
| 가짜 어댑터 | — | `FakeOnline`: 방 N개(시드 고정), 입장 간격 s, 오류 흉내(connect/join/dissolve/disconnect/match), 방장/참가자 시작 |

보충(구현 중, 2026-10-07 — 위 표에 없던 웹 결정. 판독 결론과 어긋나는 것은 없다):
- 대화상자 선택지 2개는 3칸 간격 258 을 유지하고 가운데 맞춤(±129) [설계: ComUiDialogBox 칸 폭 규칙 미확정].
  - 정정(2026-10-07, main `bq::ComUiDialogBox` 판독으로 대체): 대화상자 크기 규칙 [판독 FUN_7100208240 @0x7100208240(매 프레임, 열린 뒤 3프레임 동안), In @0x71002093d0, 생성 FUN_71002077ac @0x71002077ac — C `analysis/decomp/online_main_dialog.c`]:
    1. 생성 때 원래 버튼 폭 = `x_choise_00/x_btn` 폭(+0x9c, 520) 저장.
    2. 최대 글자 폭 m = 선택지 `x_text_dialog` 경계 폭의 최대. 버튼 폭 w = max(min(520, m + 240), 360), `x_btn`·`x_btn_shadow`·`x_btn_ef` 폭을 모두 w 로(높이 그대로), `x_alignment_choise` 정렬 다시 요청(ali1: 수평·가운데·gap 20 [데이터]) → 칸 위치 = 가운데 정렬, extent = w.
    3. 창 폭 = max(선택지 있으면 Σw + 200(gap 은 안 더함), clamp(max(본문 글자 폭, 굵은 글자 폭) + 200, 1234, 1794)); 선택지 0개면 Σ 대신 200.
    4. 창 높이 = clamp(얼굴 줄 높이(shadow_00, 얼굴 있을 때) + (선택지 있으면 `x_choise_00/x_btn` 높이 130, 형식 2 면 로딩 아이콘 높이) + 본문 글자 높이 + 굵은 글자 높이 + 200, 426, 954). `x_win_dialog` 크기에 쓴다.
    5. 선택지 칸 보이기 = 번호 < 개수, 나머지 숨김(FUN_7100209ae0), 처음 커서 = +0x4c(SetChoice 기본값), 커서 칸 "cursor"·나머지 "normal"·불가 "disable"(In).
    6. 세로 `x_alignment_y`(ali1: 세로·가운데·gap 34 [데이터]) 정렬 다시 요청 — 본문 글자 extent = 글자 경계 높이 [추정: 창 크기 계산과 같은 vt+0x168 경계를 정렬 측정도 쓴다고 봄], 선택지 줄 = 130.
    7. 문구가 길면 창이 커진다(예: 3칸 = 3w + 200 → 화면 폭까지). 웹은 1~6 그대로, 나눈 창 조각을 새 크기로 다시 놓는다 [설계: 조각 재배치].
  - 정정(2026-10-08): 위 1~7 크기 규칙과 칸 이동·결정·취소 입력(main FUN_7100208b80·FUN_7100209234 판독)을 공용 `web/script/shell/mgmcommon/dialogBox.ts`(`layoutDialogBox`·`resizeSplitWindow`·`DialogBoxState`)로 옮겼다 — 근거·표는 [dialog_box.md](dialog_box.md) 4~6·9.1. 이 모듈의 `view.ts`·`widgets.ts` 는 그 부품을 부른다. 판독으로 바뀐 것 하나: 선택지 없는 대화상자의 A 소리 = `SQ_SE_SYS_MES_PROC`(이전 웹 `SQ_SE_SYS_DECI`) [판독 FUN_7100209234]. 위 9.3 표의 '대화상자 … 미분석' 칸은 dialog_box.md 로 대체.
- 정정(2026-10-07): 방 목록 행의 방장 이름은 `x_parts_username` 의 **`x_text_01`** 에 써야 한다 — `mn00_btn_room_01` 의 부품 덮어쓰기가 `x_text_00` 숨김·`x_text_01` 보임(갈색 7,2,3)으로 바꾼다 [데이터 ov]. 원본 `UiControlStatusName` 세터(vt+0xb8)가 두 글자에 다 쓰는지는 [미확정] → 웹은 두 페인 모두에 쓴다(charselect 와 같음). 매칭 참가자 판(`sys_username_00`)도 같은 방식.
- 정정(2026-10-07): 알림 그리기 [판독 FUN_7100252860 @0x7100252860·FUN_710025366c @0x710025366c·FUN_71002537b0 @0x71002537b0 — C `analysis/decomp/online_main_notice.c`]: `Notice_JoinSession` = `x_text_00` 보임(Text0 = SetJoinPlayerName 문자열 또는 SetJoinPlayer 의 닉네임), `x_text_01` 숨김, **`x_pict` 숨김**. `Notice_GotReward` = `x_text_01`(Text0 = 업적 이름 라벨), `x_pict` 보임(레이아웃 기본 그림, 텍스처 바꾸기 없음). 그 밖의 알림 = `x_text_01`, `x_pict` 숨김. 그다음 `A_alignment_00` 정렬(ali1 전부 0 = 수평·왼쪽·gap 0 [데이터]; 자원 위치 x_pict −343·글자 −311 = 왼쪽 끝 −375 + 64 와 일치) 다시 요청, "in" 재생, `SQ_SE_SYS_NOTICE`(window_00 위치 2D). → 이 화면의 알림(참가·찾는 중·못 찾음·참가 못함·1대당 1명)은 모두 아이콘 없음.
- 기본 커서: 해산·나가기 확인 = 1(아니요, B = 1), 매칭 취소 확인 = 1(돌아가지 않는다), sys_error_E = 0(찾는다), 참가 확인 = 0(판독: +0x4c = 0), 패스워드 확인 = 1(판독) [그 밖은 설계].
- 스크롤바(ComUiScrollBar)는 그리지 않는다(사건만 남김) [설계].
- 안내 여러 칸: 오른쪽 정렬·칸 폭 = 글자 폭·간격 40(x_alignment_right ali1 gap 40 [데이터]) [근사].
- 타이머 숫자: sys_num_time_00(80×800) 을 세로 10칸 0..9(위부터)로 보고 노드 uv 로 자른다 [추정].
- 해산·나가기 뒤에는 광장 대신 다시 방 만들기/찾기 메뉴로 돌아간다 [설계: 원본은 광장 메인].
- 매칭 성공 뒤 규칙판(ComUiBdRule) 5 s 는 건너뛴다(참가자 목록 5 s 까지만) [설계].
- 사람 2명 이상에서 8인 탭으로 가려 하면 알림 PlayModeMissed01 [추정, 11절 4].
- 정정(헤드리스 확인 뒤): 변환물의 나눈 창 조각(`창#C`·`#LT`…)이 창 자식 목록 끝에 붙어 sys_dialog_00 의 글자·선택지를 덮었다 → 그리기 전에 조각을 같은 부모의 다른 자식보다 앞에 둔다(ui2d 는 창 다음 자식) [설계 보정, view.ts frameFirst]. 줄바꿈·색 태그 문구는 mgm_common.md 9.6 처럼 RichTextPane 으로 그린다.
- 큰 글꼴(bqfont_large): 제목 "프렌드 매치" 글자가 공용 큰 글꼴에 없어 online.json 에 공용 글자 + 이 문구로 다시 만든 큰 글꼴을 넣는다(mergeSpec fonts 덮어쓰기) [설계].

### 9.4 파일과 구현 순서
`types.ts`(9.2 계약·상수) → `fake.ts`(FakeOnline) → `flow.ts`(3.1·5.1~5.7 상태기계, 순수: 사건 `OEvent` 를 낸다) → `view.ts`(레이아웃 적용) → `widgets.ts`(대화상자·알림·키보드·텔롭) → `screen.ts`(틱 순서: 입력 → 어댑터 poll → 흐름 → 레이아웃 갱신 → 그리기) → `index.ts`. 시험 `web/tools/test_online.ts`(흐름 + 쓰는 라벨 존재).

## 10. 검증 코드·실행 결과·기대값
- 판독 근거 [판독: 어셈블리] 목록(C 가 문자열 인자를 잃은 곳만, `online_strrefs.py` adrp+add 순서): ComUiNetLobbySessionStatus::SetGuide @0x7100076440(안내 라벨 4개), ctor @0x7100075a08, ComUiNetSessionInfo ctor @0x710007aee4, ComUiOnlineGuide ctor @0x710007f910, UiNetSessionInfoFiber::Update @0x710007a9d0, ComUiNetMenu::UpdateSelect @0x71000771d0(sys_ctrl_back), matching00 ComUiStateTelop::ChangeMessage @0x710001d8e0, menu01 ComUiSelectMatchMode ctor·Start @0x710009f2c4·@0x71000a050c. 덤프 `analysis/online_*_strrefs.txt`.
- 표 읽기 [실행: nro.py]: 오류 라벨 표 @0x710005d700(matching00), 버튼 애니 표 @0x710019b590·@0x710019b5a8(menu00).
- 상태 시험 `npx tsx tools/test_online.ts` **154/154 통과**(2026-10-07 남은 차이 수정 뒤, ⑫ 대화상자 크기·사용자명·알림 17개 추가) [실행: 재구현 시험, 원본 대조 아님] — 가짜 어댑터로 ① 첫 접속 안내 2개 → 방 만들기(4인·패스워드 없음, 기본 커서 1) → 대기실 방장(입장 알림·텔롭 0→1·인원 = 데이터 받은 수·방 정보 창) → 시작, ② 8인 + 쿠파 확인 + 패스워드 2900 → 해산(기본 아니요), ③ 사람 2명 8인 끔, ④ 방 찾기(4인·거르기·위 누름 넘김) → 참가 → 참가자 안내·나가기 → 메뉴(지난 선택 유지), ⑤ 방 ID 6자리 → ID 모드·자물쇠 방 패스워드 틀림 알림 → B 목록 → R/L 탭, ⑥ 방장 해산 오류 문구, ⑦ 접속 실패 B3, ⑧ 전 세계 매칭 성공(텔롭 wait→loading→start·타이머 120·참가자 4), ⑨ 매칭 취소·실패 재시도·FAIL_LIMIT 2 혼자 세션·사람 2명 전 세계 끔, ⑩ 목록 커서 누름/반복 규칙, ⑪ 사건 페인 경로·코드 라벨 99개·SE 11개 명세 존재.
- 헤드리스 `npx tsx tools/shot_online.ts` 마지막 1회: 콘솔 오류 0, `test/out/online/01~08.png`. 1회차에서 본 남은 차이 4가지는 9.3 정정·4.9 정정으로 처리했고 2회차(수정 뒤 마지막 1회, 콘솔 오류 0)에서 확인: 대화상자 = 창 폭 max(3w+200, 1234)로 넓어져 3칸이 겹치지 않음, 방 목록 = 방장 이름 보임(x_text_01), 알림 = 아이콘 숨김·글자 왼쪽 정렬, 안내 글리프 = 원본 다이아몬드 그대로(대체 그림 아님).

## 11. 미확정 사항과 추가 분석에 필요한 근거
1. ComUiDialogBox·UiNoticeModule·ComUiLoadingTelop·ComUiTimer·ComUiScrollBar 의 엔진 동작(main) — 웹은 9.3 단순 구현.
2. 대기실 안내 버튼 → 동작 연결과 해산/나가기 확인 대화상자 호출 위치(SequenceMainMenu::MainImpl 8216 B 미판독).
3. NetworkManager::OnReceive 의 참가 요청 수락/거절 조건(알림 Missed01~03 언제 나오는지), IsReadyNetworkPlayerData 뒷부분.
4. 8인 탭 전환 시 사람 2명 이상일 때의 보조 람다 @0x71001cf738 본문.
5. Scene::Params 를 덮어쓰는 데이터가 있는지(MATCHING_TIME 120·FAIL_LIMIT 2 는 기본값).
6. CreateSoloSessionFiber 뒤 COM 채우기(RandomComCharacterGenerator·RandomComNameGenerator) 규칙.
7. bex 버튼 비트 0x10~0x80·0x1000/0x2000 의 버튼 이름(탭·취소 쌍만 판독).
8. 전 세계 매칭의 미니게임 모드 갈래(Mgm02~05·Ca·Kb)·컴패니언 매칭·랭크 표시 — 목록만.
9. 원본 실행 대조 없음.
