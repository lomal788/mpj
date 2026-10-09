# 플레이어 설정 흐름 (bq::ComUiSettingPlayer) — 인원·컨트롤러·유저 연동·캐릭터 선택 앞뒤

2026-10-07. 상태: **분석 완료(판독·데이터) → 구현 전 1~9·11절 완성 → 이 문서대로 웹 구현 완료**(구현 중 차이는 9.5 표에 먼저 적고 코드). 원본 실행 대조는 없다.
형식은 `F:/dev/mps/web/docs/분석.txt` 11절. 확정 수준 **[실행]**(원본 실행, 이 문서에는 없음)·**[판독]**·**[데이터]**·**[추정]**·**[미확정]**,
자체 변환 실행은 **[실행: 변환]**, 웹이 원본에 없는 것을 새로 정한 것은 **[설계]**. 주소는 main NSO(`main @0x…`, 베이스 0x7100000000), menu01 NRO 는 `menu01 @0x…`.

이미 분석·구현된 것은 링크만 한다: 캐릭터 선택 화면 [charselect.md](charselect.md)(이 흐름의 3단계), 그리기·레이아웃 규칙 charselect.md 6절·[modeselect.md](modeselect.md) 6절,
공용 창·안내·소리·입력 [mgm_common.md](mgm_common.md) 9절(모듈 `web/script/app/common/ui/`), 입력 비트 charselect.md 4절.

---

## 1. 기능 개요와 사용자에게 보이는 동작

→ 화면별 원본 BGM(라벨·시작·전환 페이드)·웹 연결: [04_sound.md §12.14](../engine/04_sound.md) (2026-10-08).

맵 메뉴에서 "같이 플레이할 사람"을 바꿀 때 뜨는 접속 UI. 한 컴포넌트가 단계 4개를 차례로 돈다 [판독].

| 단계 | 보이는 것 | 조작 |
|---|---|---|
| 0 인원 | 위 제목 띠 "이 Nintendo Switch에서 몇 명이 참가합니까?", 가운데 큰 숫자 "N명" + 좌우 화살표, 아래에 N개 유저 창(컨트롤러 아이콘·이름) | 좌우 = 인원 ±1(최소~최대), A = 결정, B = 뒤로(호출자가 허용할 때만) |
| 1 컨트롤러 | (N ≥ 2 이고 컨트롤러가 모자랄 때) **시스템 컨트롤러 지원 애플릿**이 뜬다. 게임 자체 UI 아님 | 애플릿 조작(본체 UI) |
| 2 유저 | 제목 "게스트 설정을 변경하겠습니까?", 아래 설명 "유저를 연동해서 플레이하면 …", 1P 창 "연동 완료", 2P~NP 창마다 버튼 2개 "연동하기"(연동됐으면 "연동 해제")·"이름 바꾸기"(연동됐으면 회색), 맨 아래 " OK!" 버튼 | 좌우 = 창(2P..NP), 위아래 = 버튼 줄(0·1·OK), A = 실행, B = 인원 단계로 |
| 3 캐릭터 | 유저 창이 카드 자리로 바뀌고(to_charasel) 캐릭터 선택 화면([charselect.md](charselect.md)) | B = 2단계로(1명이면 0단계로) |

빈 자리(인원 밖 칸)는 이 흐름에서 **자동으로 COM** 이 되고, COM 캐릭터는 사람이 쓰지 않은 가장 앞 번호 캐릭터로 채워진다 [판독 6.1·6.2].
**COM 난이도는 이 흐름에 없다**: 보드 모드는 파티 규칙 화면 멤버 설정([partyrule.md](partyrule.md), `menu01::ComUiBdSettingMember`), 미니게임 모드는 규칙 설정의 CPU 항목([mgmet_ruleconfig.md](mgmet_ruleconfig.md))이 정한다 [판독: 이 컴포넌트 범위 0x7100344a00~0x710034be24 와 람다 5개에 SetComLevel 호출 없음].

## 2. 분석 대상 원본·버전·자료 위치

| 항목 | 위치 |
|---|---|
| 원본 | Super Mario Party Jamboree US v0 (`c:/dev/original/`, 읽기 전용) |
| 코드 | main `bq::ComUiSettingPlayer` @0x7100344a00~0x710034be24 (생성자·Start·Out·IsFinished + 이름 없는 메서드), 단계 람다 본체 5개(Ghidra 함수 아님, 이번에 생성 디컴파일) |
| 디컴파일 | `analysis/decomp/charsel_setting_player.c`(범위 전체, 기존), `charsel_title_bg.c`(제목 띠·배경, 기존), 신규 `ghidra_work/setplayer/out_lambdas.c`(단계 0~3·연동·이름 람다), `out_hudfn.c`(이름표·컨트롤러 아이콘 SetPlayer), `out_hardicons.c`·`out_hardfn.c`(패드 종류별 아이콘·램프), `out_ctrl.c`·`out_minimal.c`(컨트롤러 애플릿 참조), `out_guestname.c`(게스트 이름 참조) |
| 호출자 | menu01 `SequenceModeSelect::MapMenuImpl`·`BinocularMenuImpl`, `SequenceStartPaMode::CheckPlayerCountImpl` — `analysis/decomp/charsel_menu01_callers.c`, `modesel_menu01_uimap.c` |
| 문자열 | `analysis/setplayer_strings.txt` ← `web/tools/analysis/setplayer_strings.py`(main.decomp.bin, VA − 0x7100000000) |
| Ghidra | `ghidra_work/setplayer`(jamboree_main 사본), `web/tools/analysis/setplayer_ghidra.sh`, 스크립트 `ghidra_scripts/MgmcommonDecompCreate.java`·`SetplayerHudVt.java`(신규: HUD 클래스 vtable 슬롯 디컴파일) |
| 레이아웃 | `extracted/bea/bq.nx.bea/Parts.lyt` — `sys_connect_base_00`(본체) + 부품 `sys_connect_parts_null_00`·`sys_connect_cursor_num`·`sys_connect_btn_00`·`sys_connect_btn_user_00`·`sys_win_user_{1,2,3,4}person_0{0,1}`·`sys_icon_hard_01`·`sys_username_01`, 제목 `sys_connect_tlp_00`, 배경 `sys_bg_set_00`. 덤프 `extracted/converted/ui/bq_Parts/*.tree.txt` |
| 문구 | `extracted/message/koKR/menu01_main.json`(mn01_connect_ui_*·mn01_ui_ok), `im_common.json`(im_guest00_name), `system.json`(sys_ctrl_back·sys_swkbd_username_header) |

## 3. 진입점과 전체 호출 흐름

### 3.1 생성 `ComUiSettingPlayer(entity)` @0x7100344a00 [판독]

```
CreateLayout Parts.lyt/sys_connect_base_00, 그리기 순위 0x8d00, 숨김
문구: x_parts_user/x_btn_ok/x_text_ok = mn01_ui_ok ("OK!"), x_parts_user/x_text_00 = mn01_connect_ui_user_sub
      N=2..4: x_user_N_1P/x_text_mess = mn01_connect_ui_user_connected ("연동 완료")
      k=2..N: x_user_N_kP/x_parts_btn_00/x_text_00 = mn01_connect_ui_user_account, x_parts_btn_01/x_text_00 = mn01_connect_ui_user_name
FUN_71003454f4(row −1, col −1)                      (버튼 표시 초기화, 6.4)
+0x40 = 지금 사람 수(PlayerWork 0..3 중 type 0 개수)
Entity "ComUiSettingPlayer_Bg"          → FUN_71003443c0: sys_bg_set_00, 순위 0x8cfe        (+0x78)
Entity "ComUiSettingPlayer_HeaderTelop" → FUN_7100344680: sys_connect_tlp_00, 순위 0x8e10    (+0xa8)
Entity "ComUiSettingPlayer_Guide"       → ComUiGuide00 순위 0x8d10, 1칸, 위치 17, sys_ctrl_back ("뒤로")  (+0xc0)
Entity "ComUiSettingPlayer_SelectPC"    → ComUiSelectPlayerCharacter(constrained = 1)         (+0xd8)
```

그리기 순위(클수록 앞): 배경 0x8cfe < 본체 0x8d00 < 안내 0x8d10 < 제목 0x8e10 [판독]. 캐릭터 선택 화면 순위는 charselect.md 3.1.

### 3.2 `Start(StartArg)` @0x710034a080 [판독]

StartArg 는 레지스터 2개(x1, x2)로 온다:

| 필드 | 쓰는 곳 | 뜻 |
|---|---|---|
| x1 하위 32 | +0xf0 | 처음 인원 |
| x1 상위 32 | +0xf4 | 최소 인원 |
| x2 하위 32 | +0xf8 | 최대 인원 |
| x2 비트 32~39 | +0xfc | 배경(ComUiSettingPlayer_Bg) 쓰기 |
| x2 비트 40~47 | +0xfd | 끝에 캐릭터 선택(단계 3)으로 가기 |
| x2 비트 48~55 | +0xfe | 인원 단계에서 B(뒤로) 허용 |

호출 [판독 menu01]: `MapMenuImpl`·`BinocularMenuImpl` → `Start(GetHumanPlayerCount() | 1<<32, 0x0000_0101_0000_0004)` = 처음 = 지금 사람 수, 최소 1, 최대 4, 배경 1, 캐릭터 선택 1, **B 불가 0**.
`SequenceStartPaMode::CheckPlayerCountImpl` → `Start(0x1_0000_0001, 0x0001_0001_0000_0002)` = 처음 1, 최소 1, 최대 2, 배경 1, 캐릭터 선택 **0**, B 허용 1.
호출자는 `*(this+0x38) > 3`(unsigned)이 될 때까지 기다린 뒤 FadeOut → 엔티티 파괴 [판독 menu01 @0x710003df70 줄 1405~1411].

Start 본문:
1. 인자 저장, +0x100(취소됨) = 0.
2. **COM 캐릭터 채우기**: c = 0..21 중 "사람(type≠1) 누구도 CharacterID c 를 쓰지 않는" 번호를 오름차순 목록으로 만들고, PlayerWork 0..3 중 type ≠ 0(COM)인 것에 목록 앞에서부터 SetCharacterID [판독].
3. `SetControllerPlayers(1, 1)` → `HidModule::SetNumberOfGameControllerPlayers(1, 1)` [판독 main @0x7100191168].
4. `FUN_71003476a4(처음 인원)`(6.1), 커서 숫자 "cursor", 모든 유저 창 "normal_number"(FUN_7100349f24), 버튼 초기화, `In(false)`(FUN_7100349b70), 단계 +0x38 = 0.

### 3.3 매 프레임 — UI 상태(+0x3c)와 단계(+0x38) [판독]

`FUN_71003462ac`(갱신): +0x3c == 0 이고 본체 애니 끝 → "normal_00"(본체에 그런 태그가 없다 [데이터] → 효과 없음 [추정]), +0x3c = 1. +0x3c == 2(Out 중)이고 애니 끝·페이드 끝 → 숨김, −1. 그 뒤 `FUN_71003465d0`(6.5 표시 갱신)을 **매 프레임** 부른다.

`FUN_710034640c`(단계 실행): +0x3c == 1 이고 `x_parts_user` 애니가 끝났거나 반복 중이고, 단계 파이버(+0x50)·연동 파이버(+0x58)가 없거나 끝났고, 페이드 중이 아니면 단계 +0x38 에 맞는 파이버를 새로 만든다:

| +0x38 | 람다 vtable | 본체 | 단계 |
|---|---|---|---|
| 0 | 0x71019e78d0 | main @0x7100346d00 | 인원(6.1) |
| 1 | 0x71019e7918 | main @0x7100347ad0 | 컨트롤러(6.2) |
| 2 | 0x71019e7960 | main @0x7100347eb0 | 유저(6.3) |
| 3 | 0x71019e79a8 | main @0x71003494a0 | 캐릭터 선택(6.6) |
| 4 | — | — | 끝(호출자가 봄) |

람다 vtable 7번째 칸(operator())이 `ldr x0,[x0,#8]; b 본체` 두 줄짜리라 Ghidra 가 함수를 못 만들었다 → 어셈블리로 대상 주소만 읽음 [판독: 어셈블리 6곳, C 가 없어서]. 연동 람다 0x71019e79f0 → main @0x710034b100(pid), 이름 람다 0x71019e7a38 → main @0x710034b340(pid); 둘 다 pid = (row−2 < 3) ? row−1 : −1.

`Out(bool immediate)` @0x7100349ce0: 이미 −1·2 면 무시. 즉시가 아니면 "out" + FadeOut, +0x3c = 2. 즉시면 숨김·배경 숨김, −1. 끝으로 캐릭터 선택 Out. `IsFinished()` = +0x3c < 0.
`In(skip)` @0x7100349b70: +0x3c ≥ 2 일 때만, "in"(skip 이면 "normal"), 보이기, +0xfc 면 배경 In, 페이드 아웃 상태면 FadeIn.

## 4. 구조체·필드·상수

기준 객체 `bq::ComUiSettingPlayer`(this, ComUiBase 파생). writer/reader 는 판독 함수.

| 오프셋 | 형식 | 웹 권장 이름 | 의미 | writer | reader |
|---|---|---|---|---|---|
| +0x38 | s32 | `step` | 단계 0 인원·1 컨트롤러·2 유저·3 캐릭터·4 끝 | 각 람다 | 640c, 호출자 |
| +0x3c | s32 | `uiState` | −1 숨김·0 in·1 정상·2 out | In/Out/62ac | 640c, IsFinished |
| +0x40 | s32 | `count` | 인원 | 76a4 | 전부 |
| +0x44 | s32 | `row` | 유저 단계 커서 창 = 플레이어 번호 2..N(1P 는 고를 수 없음) | 7ad0(=2), 7eb0 | 54f4, 8d3c |
| +0x48 | s32 | `col` | 0 연동 버튼·1 이름 버튼·2 OK | 7ad0(=0), 7eb0 | 54f4 |
| +0x4c | u8 | `kbdWaiting` | 소프트웨어 키보드 대기(콜백이 0 으로) | b340 | b340 |
| +0x50 / +0x58 | Fiber* | — | 단계 파이버 / 연동·이름 파이버 | 640c / 7eb0 | 640c |
| +0xf0 / +0xf4 / +0xf8 | s32 | `initial/min/max` | 3.2 표 | Start | 76a4, 6d00 |
| +0xfc / +0xfd / +0xfe | u8 | `withBg/toCharSelect/cancelable` | 3.2 표 | Start | In, 7ad0·7eb0, 6d00 |
| +0x100 | u8 | `cancelled` | 인원 단계 B | 6d00 | (호출자 [미확정]) |

PlayerWork 필드(기준 객체 `bq::PlayerWork`, 이 흐름이 쓰는 것) [판독: 함수 이름]: PlayerType(0 사람·1 COM), CharacterID, BaseCharacterID, ManageIdx(−1 = 게스트 = 계정 연동 없음), Nickname(UTF-8, 빈 문자열 가능), AccountID/SaveID/CheckID(16 B), SessionState.

## 5. 상태 전이와 전체 수명

```
Start → In → [0 인원] ─A→ [1 컨트롤러] ─N=1, toCharSelect→ [3 캐릭터] ─결정→ [4 끝]
               │  B(cancelable) → cancelled=1, [4 끝]            │ N=1, !toCharSelect → [4 끝]
               │                                                 └ N≥2 → [2 유저] ─OK, toCharSelect→ [3]
               └←────── 애플릿 후에도 컨트롤러 부족 / 유저 B ─────┘          OK, !toCharSelect → [4]
[3 캐릭터] ─B→ N=1 ? [0] : [2]
[2 유저] 매 프레임 IsMinimalGameControllerAssigned 가 거짓이면 즉시 [0]
```

## 6. 계산식·조건·상세 의사코드 [판독]

### 6.1 인원 단계 main @0x7100346d00 / 인원 설정 FUN_71003476a4

```
setCount(n):                                   // FUN_71003476a4
  count = max(min(n, max), min)                // 순서: min(n,max) 뒤 max(…,min)
  PlayerWork(i).SetPlayerType(count < i+1 ? 1 : 0)   for i = 0..3
  x_parts_user/x_cursor_num/x_text_num = "mn01_connect_ui_player_number%02d" % count   ("N명")
  x_icon_cursor_left 보임 = min < count, x_icon_cursor_right 보임 = count < max

numberStep():
  SetControllerPlayers(1,1); x_cursor_num "cursor"; 그 애니가 끝나거나 반복 중일 때까지 Wait
  제목 띠 모드 0(mn01_connect_ui_number_title)
  loop:
    안내: cancelable ? (끝났으면 In) : (Idle 이면 Out)
    t = GetTrigger(GetOperationPlayerId())     // 조작 플레이어 하나만 읽는다
    if cancelable && t&B: CANCEL 소리, cancelled = 1, step = 4, break(→ 마무리)
    if t&A: break(→ 결정)
    n = count
    if t&LEFT && min < count: n = count−1, Play2D 위치 = cursor_left 페인
    if t&RIGHT && count < max: n = (n < max ? n+1 : max), 위치 = cursor_right
    if n != count: SQ_SE_SYS_CURSOR(Play2D) + bv_vib_sys_cursor, setCount(n),
                   x_parts_user "in_userwin"→"normal_number" 및 모든 유저 창 "normal_number"(FUN_710034794c),
                   x_cursor_num "on"→"cursor"
    Wait
  결정: SQ_SE_SYS_DECI + bv_vib_sys_deci, x_cursor_num "press"→"normal"
        PlayerType 다시 기록, COM 이 된 칸(pid≠0, type≠0)은 연동 해제(RemoveAccount, 이름 "", ManageIdx −1, Account/Save/CheckID 0)
        x_cursor_num "off"→"normal", 끝날 때까지 Wait, step = 1
  마무리: 안내가 안 끝났으면 Out, 제목 띠 Out
```

같은 프레임에 좌우가 함께 눌리면 LEFT 를 먼저 적용하고 RIGHT 는 `count<max` 일 때 `n<max ? n+1 : max` → 결과적으로 원래 수(n−1+1) [판독: 6d00 의 iVar20 계산].

### 6.2 컨트롤러 단계 main @0x7100347ad0

```
if count > 1:
  SetControllerPlayers(count, count)           // HidModule::SetNumberOfGameControllerPlayers(min=max=count)
  if !IsMinimalGameControllerAssigned():
     SetGameControllerStyle(1); AssignGameController()   // 시스템 컨트롤러 지원 애플릿(nn::hid::ShowControllerSupport, main @0x71007eeba8)
     while IsControllerSupportAppletShowing(): Wait
     if !IsMinimalGameControllerAssigned(): step = 0; return
if count == 1:
  if !toCharSelect: step = 4
  else: x_parts_user "to_charasel_01"→"normal_charasel_01", x_user_1_1P "to_charasel"→"normal_charasel", step = 3
else:
  버튼 초기화, row = 2, col = 0, 모든 유저 창 "to_user"→"normal_user"(FUN_7100347c80), x_parts_user 도, step = 2
```

컨트롤러 연결·할당 UI 는 **게임 자체 UI 가 아니라 시스템 애플릿**이다 [판독: ControllerSupportArg::SetDefault @0x71007df9ec, ShowControllerSupport 호출]. 애플릿 인자(조이콘 한 짝 허용 여부 등)는 bezel HidModule 안쪽이라 [미확정] — 스타일 1 의 뜻 포함. 웹은 대체 UI [설계](9.4).

### 6.3 유저 단계 main @0x7100347eb0

```
제목 띠 모드 1(mn01_connect_ui_user_title), 버튼 표시(row,col)
loop:
  if !IsMinimalGameControllerAssigned(): step = 0; break
  안내 끝났으면 In
  t = GetTrigger(조작 플레이어)
  if t&B: SQ_SE_SYS_CANCEL, step = 0, break
  if t&A:
    col 2 (OK): SQ_SE_SYS_DECI_L + bv_vib_sys_deci_l, x_btn_ok "press"
                step = toCharSelect ? 3 : 4
                pid≠0 인 사람(type 0) 게스트(ManageIdx −1)는 CheckID = 새 UUID  (최대 count−1 명)
                연동된 사람끼리 MyCardData 를 서로의 CardInfoData 에 AddReceiveCardData
                break
    col 1: SQ_SE_SYS_DECI + bv_vib_sys_deci, 버튼 "press"(FUN_7100348d3c)
           pid = row−1; 게스트면 이름 파이버(6.7), 연동됐으면 아무것도 안 함
    col 0: 같은 소리·press; 연동됐으면 즉시 연동 해제(6.1 결정의 해제와 같음), 게스트면 연동 파이버(6.7)
    Wait 후 다음 프레임
  이동(col < 2 일 때만 좌우):
    if t&LEFT: row = max(row,3) − 1            (최소 2)
    if t&RIGHT: row = min(count, row+1)
    좌우 뒤 그 칸이 연동됐으면 col = 0
  if t&DOWN: col==0 ? (연동 ? 2 : 1) : col+1, 최대 2
  if t&UP:   col−1, 결과가 1 이면 (게스트 ? 1 : 0), 최소 0
  바뀌면 SQ_SE_SYS_CURSOR(Play2D 위치 = 새 버튼 페인 "x_user_N_kP/x_parts_btn_0c" 또는 "x_parts_user/x_btn_ok") + bv_vib_sys_cursor, 버튼 표시 갱신
마무리: 안내 Out, 제목 띠 Out, x_btn_ok 애니 끝까지 Wait, step==3 → to_charasel 애니(FUN_7100349260), step==0 → back_number 애니(FUN_7100349030)
```

즉 "이름 바꾸기"는 **게스트만**, 연동된 칸은 그 버튼이 "disable" 이고 커서가 건너뛴다. 1P 창에는 버튼이 없다(1P 는 본체 사용자, 항상 "연동 완료").

### 6.4 버튼 표시 FUN_71003454f4(row, col)

칸 k = 2..4(pid k−1): `x_user_N_kP/x_parts_btn_00` = (row,col)==(k,0) ? "cursor" : "normal"; `x_parts_btn_01` = 게스트 ? ((k,1) ? "cursor" : "normal") : "disable".
OK 버튼: col == 2 ? ("on"→"cursor") : ("off"→"normal"). 인자 skip 이면 "on"/"off" 를 건너뛴다. N 은 2..4 전부(보이는 창은 지금 인원 것 하나).

### 6.5 매 프레임 표시 FUN_71003465d0

- `x_parts_user/x_win_N` 보임 = (count == N), N = 1..4.
- N 인원 창 `x_user_N_kP` 마다: `x_parts_username` = UiControlStatusName.SetPlayer(pid = k−1), `x_parts_hard` = 컨트롤러 아이콘 SetPlayer(pid)(6.8).
- k ≥ 2 창의 `x_parts_btn_00/x_text_00` = 게스트 ? "mn01_connect_ui_user_account"("연동하기") : "mn01_connect_ui_user_release"("연동 해제").

### 6.6 캐릭터 선택 단계 main @0x71003494a0

제목 띠 모드 2, `ComUiSelectPlayerCharacter` 모드(+0x104) = 0, SetBgVisible(0), +0xff = 1, In(false). 매 프레임: IsFinished 또는 IsDecided → 모든 플레이어 BaseCharacterID = CharacterID, step = 4.
캐릭터 선택이 취소(+0xfc)되면 Out(false); 인원 1 → `back_number_01`/`back_user` 애니, step 0; 아니면 버튼 초기화·`back_user` 애니(FUN_7100349940), step 2. 마무리에서 제목 Out·x_parts_user 애니·페이드 끝까지 Wait.
캐릭터 선택 안쪽 규칙은 [charselect.md](charselect.md) 5절.

### 6.7 연동·이름 람다

- 연동 main @0x710034b100(pid): `bex::AccountSelector`(시스템 **유저 선택 애플릿**)를 열고 끝날 때까지 Wait. 고르면: 이미 연동이면 RemoveAccount, `EntryAccount(uid, pid)` 성공 → Nickname = 계정 닉네임(없으면 ""), 저장 처리 끝까지 Wait [판독].
- 이름 main @0x710034b340(pid): 게스트일 때만 `nn::swkbd` 설정(MakePreset 2 = 유저 이름 프리셋, 머리글 `sys_swkbd_username_header` "이름을 설정해 주십시오.", 설정 +0x… = 10 → 최대 글자 수 10 [추정: KeyboardConfig 필드 이름 미확인], 초기 문자열 = 지금 Nickname) → `SoftwareKeyboardModule::StartSoftwareKeyboardAsync`, +0x4c 가 0 이 될 때까지 Wait(결과 콜백 @0x710034b540 이 Nickname 을 쓴다 [추정: 콜백 미디컴파일]). PlayReport `AddGuestNameChange` 존재 [판독: 함수 이름].

### 6.8 이름 규칙(이름표) UiControlStatusName vt+0xc0 = main @0x71002a4a20

```
p = PlayerWork(pid)
if p.type == 0 (사람)  또는 SessionState ∈ {2,3,4}:
   name = p.Nickname != "" ? p.Nickname : Text("im_guest00_name")   // "게스트" — 번호 없음
else (COM):
   name = p.Nickname != "" ? p.Nickname : 캐릭터 이름(vt+0xc8(CharacterID))  [vt+0xc8 = 캐릭터 이름 [추정]]
SetName(name)   (vt+0xb8)
```
→ mpj 는 게스트가 몇 명이어도 모두 "게스트"(게스트 번호를 붙이지 않는다) [판독]. 같은 규칙이 `ComUiInformationBar::SetOwnerPlayer` @0x7100381a74 에도 있다.

### 6.9 컨트롤러 아이콘 vt+0xb8 = main @0x710029265c

사람이고 그 pid 의 패드가 유효할 때만: `GetPadType(pid)`(= 패드 객체 +0x184) → 아이콘 [판독 FUN_7100292f84 → 각 함수]:

| PadType | 아이콘 컨트롤 이름 | 색 |
|---|---|---|
| 2 | FullKey | 본체 색 1 |
| 3 | Handheld | 고정 색(DAT_7101a879c0) |
| 4 | Dual_Left + Dual_Right | 색 1·색 2(왼·오른 조이콘) |
| 5 | 세로 잡기 설정(FUN_71001911b0)이면 JoyConV_Left, 아니면 JoyConH | 색 1 |
| 6 | 세로면 JoyConV_Right, 아니면 JoyConH | 색 1 |

색 = `InputModule::GetControllerColor` 바이트 /255(색 2 는 +8). 램프(Lamp_00..03)는 2·4·5·6 만, 패드 번호 < 4 일 때 [판독 FUN_71002931c0; 켜는 개수 규칙은 charselect.md 12.5 의 추정 그대로].

## 7. 애니메이션·소리·에셋

| 대상 | 애니(길이 f) [데이터] |
|---|---|
| 본체 sys_connect_base_00 | in 5, normal 0, out 5 |
| x_parts_user(sys_connect_parts_null_00) | in_userwin 10, normal_number, to_user 10, normal_user, back_number_00/01 10, back_user 10, to_charasel_00/01 10, normal_charasel_00/01 |
| 유저 창 sys_win_user_* | to_user·back_number·back_user·to_charasel 10, normal_number·normal_user·normal_charasel 0 |
| 숫자 sys_connect_cursor_num | cursor 30(반복), on 9, press 19, off/normal 0 |
| 버튼 sys_connect_btn_user_00 / OK sys_connect_btn_00 | cursor 30(반복), on 10, press 15, normal/off/disable 0 |
| 제목 sys_connect_tlp_00 | in 10, normal, out 10 |

소리: SQ_SE_SYS_CURSOR(Play2D), SQ_SE_SYS_DECI, SQ_SE_SYS_DECI_L(OK), SQ_SE_SYS_CANCEL. 진동: bv_vib_sys_cursor·_deci·_deci_l(조작 플레이어). 렌더 규칙은 [mgm_common.md](mgm_common.md) 9.6 공용 소리와 같음.
배경 `sys_bg_set_00` "normal"·제목 띠는 캐릭터 선택과 같은 부품(charselect.md 6절). 안내는 ComUiGuide00 위치 17(mgmcommon `MgmGuide`).

## 8. 다른 기능과의 상호작용

- 맵 메뉴: `RestoreLocalPlayerData` → 이 흐름 → (끝) FadeOut → `KeepLocalPlayerData`. 덕킹 DuckingAmb(1)/(0) [판독 menu01].
- 캐릭터 선택: 이 흐름 안 단계 3. 사람/COM·카드 수는 PlayerWork type 으로 전달(charselect.md 3.2 6).
- COM 캐릭터 기본값은 Start 의 "사람이 안 쓴 앞 번호"(6.2 아님, 3.2-2). 캐릭터 선택의 COM 미리 정하기(모드 1·2)는 이 흐름에서 안 쓴다(모드 0).
- 이후 화면(보드 파티 규칙·미니게임 규칙)이 COM 난이도를 정한다(1절).

## 9. 웹 포팅 구조와 구현 순서

### 9.1 원칙
- 위치 `web/script/app/scene/menu/setplayer/`. import 허용 = 같은 폴더, `../mgmcommon`, `../charselect` 공개 모듈, `three`. 금지 = script/game/core·games·view, game.ts, env.ts (mgm_common.md 9.1 과 같음).
- 상태기계는 원본 파이버 구조 그대로 mgmcommon `Flow`(제너레이터)로 쓴다: 단계 함수 하나 = 원본 람다 하나, `Wait` = `yield`.
- 시스템 애플릿 3가지(컨트롤러 지원·유저 선택·소프트웨어 키보드)는 **어댑터**로 뺀다 [설계].

### 9.2 파일

| 파일 | 책임 |
|---|---|
| `types.ts` | StartArg·컨트롤러·플레이어 칸·결과 계약·어댑터 형식 |
| `state.ts` | 순수 상태기계(6.1~6.4·6.6 바깥): `SetPlayerFlow` — 입력은 조작 컨트롤러 trig 비트와 애니 완료 질의, 출력은 사건(애니·소리·진동·문구·애플릿 요청) |
| `applet.ts` | 컨트롤러 지원 애플릿 대체 상태(9.4) — 순수 |
| `names.ts` | 6.8 이름 규칙·6.9 아이콘 고르기 |
| `screen.ts` | 사건 → 레이아웃(MgmView)·안내(MgmGuide)·소리. `createSetPlayer()` |
| `index.ts` | 공개 진입점 |

헤드리스 `web/tools/shot_setplayer.ts`(마지막 1회용). 페이지 `web/script/setplayer_page.ts`: 키보드·게임패드 → 컨트롤러 목록, 애플릿 대체 DOM, 유저 선택·이름 입력 DOM, 결과 → `runCharSelect`(charselect_page.ts 그대로) 연결. `ui_main.ts` UIS 끝 'setplayer'. 에셋 `web/assets/setplayer/setplayer.json`(MgmSpecPart 형식 + texts·sounds) ← `web/tools/analysis/setplayer_web_assets.py`(partyrule 변환기와 같은 방식). 시험 `web/tools/test_setplayer.ts`.

### 9.3 공개 계약

```ts
interface SetPlayerStartArg { initial: number; min: number; max: number; withBg: boolean; toCharSelect: boolean; cancelable: boolean }   // 3.2
interface Controller { id: string; kind: 'keyboard' | 'gamepad'; padType: 2|3|4|5|6; color?: [string, string?] }  // 6.9 PadType
interface SetPlayerSlot { pid: number; type: 'human' | 'com'; controller: string | null; padType: number | null;
                          nickname: string; linked: boolean; displayName: string; character: number }
interface SetPlayerResult { count: number; slots: SetPlayerSlot[]; cancelled: boolean; toCharSelect: boolean }
// → 캐릭터 선택: runCharSelect({ com: slots.map(s => s.type==='com'), names: slots.map(s => s.displayName), pads: 칸별 컨트롤러 입력원 })
interface SetPlayerSystemAdapter {
  controllerApplet(count: number): AppletSession;             // 9.4
  selectAccount(pid: number): Promise<{ uid: string; nickname: string } | null>;   // 6.7 유저 선택 애플릿 대체
  editName(pid: number, current: string, maxLen: number): Promise<string | null>; // 6.7 소프트웨어 키보드 대체(maxLen 10)
}
```

### 9.4 컨트롤러 지원 애플릿 대체 [설계]
원본은 시스템 UI 라 화면·규칙을 재현할 근거가 없다. 웹 규칙:
- 컨트롤러 = 키보드 1개(`kb`) + 연결된 Gamepad API 패드(`gp0`…). 1P(조작 플레이어)는 시작 시 키보드(또는 첫 패드).
- 인원 단계(SetControllerPlayers(1,1)): 1P 컨트롤러만 읽는다(GetOperationPlayerId). 유저 단계도 조작 플레이어(1P)만 읽는다 — 원본과 같음.
- 컨트롤러 단계: 할당된 컨트롤러 수 < count 면 대체 애플릿을 연다. 칸 1..count 를 보여 주고, **할당 안 된 컨트롤러가 A** 를 누르면 다음 빈 칸에 들어간다. 할당된 컨트롤러가 B 를 누르면 그 칸에서 빠진다(1P 는 못 빠짐). 모두 차면 1P 가 A 로 확인 → 닫힘. 1P 가 B(빈 칸 있을 때) → 취소로 닫힘 → `IsMinimalGameControllerAssigned` 거짓 → 인원 단계로(원본 6.2 와 같은 결과).
- 유저 단계 중 할당된 패드가 끊기면(Gamepad disconnected) 인원 단계로(6.3 첫 줄).
- PadType: 키보드 = 2(FullKey) [설계], 게임패드 id 에 "Joy-Con (L)" → 5, "(R)" → 6, "Joy-Con L+R"/"Joy-Con (L/R)" → 4, 그 외 2.

### 9.5 원본과 같게 / 바꾼 것

| 항목 | 원본 | 웹 |
|---|---|---|
| 단계 전이·이동 규칙·같은 프레임 우선순위·소리 | 6절 | 같게 |
| 애니·배치 | 7절 데이터 | 변환 데이터 그대로 |
| 컨트롤러 애플릿·유저 선택·키보드 | 시스템 애플릿 | 어댑터 DOM [설계] |
| 계정 연동 결과(카드 교환·CheckID UUID·저장) | 6.3 | 결과 칸의 `linked` 만 [설계]; UUID·카드는 생략 |
| 1P 닉네임 | 본체 계정 | 페이지 설정(빈 문자열이면 "게스트") [설계] |
| 캐릭터 선택 단계 | 같은 장면 안 하위 컴포넌트 | 페이지가 `runCharSelect` 를 새 캔버스로 이어 부른다. to_charasel 애니 끝난 뒤 전환 [설계] |
| 설명 문구 `x_parts_user/x_text_00`(2줄, `\r\n`) | 레이아웃 글자 페인 | charselect render2d 는 한 줄만 그려서 mgmcommon `RichTextPane` 으로 그 페인 자리에 줄 나눠 그림 [설계, 구현 중 추가] |
| 연동·이름 람다 첫 실행 | FiberLite 생성 직후 [미확정] | 다음 프레임(FiberRunner 가 같은 프레임 새 흐름을 다음 step 에 돈다) [설계] |
| Play2D 위치(커서 소리 팬) | 버튼 페인 화면 위치 | 사건에 페인 경로만 싣고 팬은 가운데 [근사] |
| COM 이름표 캐릭터 이름 | vt+0xc8 [추정] | 페이지가 `assets/charselect/spec.json` chars[c].label(im_pcNN_name)로 준다 [설계] |
| 캐릭터 선택 카드의 컨트롤러 아이콘 | 칸별 패드 | `runCharSelect` 에 컨트롤러 종류 인자가 없어(charselect_page.ts 무수정) 그 화면 기본 JoyConH 그대로 [미반영] |

### 9.6 구현 순서
1. 변환기 → setplayer.json. 2. state.ts·applet.ts·names.ts + test_setplayer.ts. 3. screen.ts. 4. setplayer_page.ts + ui_main. 5. tsc·빌드·기존 시험 1회·헤드리스 1회.

## 10. 검증 코드·실행 결과·기대값

| 검사 | 명령 | 결과(2026-10-07) | 수준 |
|---|---|---|---|
| 상태 시험 | `npx tsx tools/test_setplayer.ts` | **116/116 통과** — Start 의 COM 캐릭터 채우기·인원 클램프, 인원 단계 경계·같은 프레임 좌우·조작 플레이어만 읽기·B 불가/허용, 1명 끝/캐릭터 선택, 애플릿 대체(참가·빠지기·확인·취소 → 단계 0), 유저 단계 이동표(게스트/연동 혼합 12가지), 연동·해제·이름(10자), OK·B·컨트롤러 끊김·캐릭터 선택 왕복, 이름 규칙(게스트 번호 없음·COM 캐릭터 이름·SessionState 3), 아이콘 표, **실제 명세**에서 흐름이 내는 애니 경로 25개·태그 전부 존재, 문구·보임 페인 76개, 라벨 16개, 소리 4개, 큰 글꼴 "1234명", 2인 2P 창 x = +232, import 경계 | [실행: 재구현 계산] |
| 타입 | `npx tsc --noEmit` | 기존 tools/serve.ts 미사용 변수 2개만 | — |
| 빌드 | `npx tsx tools/build.ts` | 통과 | — |
| 헤드리스 | `npx tsx tools/shot_setplayer.ts` | 인원 2명 → 컨트롤러 연결 대체(가짜 게임패드 1개) → 유저 단계 → OK → 캐릭터 선택 → 결정 → 결과 "2명 1P 사람(kb, 연동) 게스트 …" 까지, **콘솔 오류 0**. `test/out/setplayer/01~05*.png` | [실행: 웹] |

헤드리스는 3번 돌렸다: 1회차는 시험 스크립트 쪽 오류(tsx `__name` 도우미가 초기화 스크립트에 섞여 가짜 게임패드가 안 들어감, 화면 코드 무관), 2회차에서 설명 문구 두 줄이 한 줄로 그려지는 것을 보고 9.5 표대로 `RichTextPane` 으로 바꾼 뒤 3회차가 최종.
원본 실행 대조는 없다. 화면 배치는 레이아웃 데이터 그대로라 [데이터] 수준, 흐름 규칙은 [판독] 의 재구현이다.

## 11. 미확정 사항과 추가 근거

| 항목 | 상태 | 필요한 근거 |
|---|---|---|
| 컨트롤러 애플릿 인자(스타일 1 의 뜻, 한 짝 허용, 최소/최대 외 값) | [미확정] | bezel HidModule::AssignGameController(@0x71007f74d8 주변) 판독 |
| 소프트웨어 키보드 최대 길이 10·결과 콜백 @0x710034b540 | [추정]/[미확정] | KeyboardConfig 구조·콜백 디컴파일 |
| COM 이름표 vt+0xc8 = 캐릭터 이름 | [추정] | UiControlStatusName vtable +0xc8 판독 |
| 램프 켜는 개수 | [추정](charselect.md 12.5) | Lamp_NN 사용자 데이터 판독 |
| +0x100 cancelled 를 읽는 호출자(PaMode) | [미확정] | menu01 SequenceStartPaMode 판독 |
| 본체 "normal_00" 태그 재생 효과 | [추정: 없음] | bflan 태그 그룹 확인 |
