# 마리오 파티(보드) 파티 규칙 설정 화면 (menu01::SequenceStartBd 9·10·12·13 단계) — 원본 분석과 독립 모듈 명세

2026-10-07. 상태: **분석 완료(판독·데이터) → 이 문서를 근거로 구현(9절), 원본 실행 대조 없음**. 1~9·11절을 구현 전에 썼다. 구현 중 문서와 달라진 것은 해당 절에 정정 줄을 먼저 넣고 코드에 반영한다.
형식은 `F:/dev/mps/web/docs/분석.txt` 11절 구성. 이 문서는 **이 화면 고유 내용만** 적는다. 레이아웃 재생·그리기 규칙은 [charselect.md](charselect.md) 6.4·6.5·12절·[modeselect.md](modeselect.md) 6.1·6.2, 메시지 창·메시지 흐름·입력·소리는 [message_window.md](message_window.md)·[mgm_common.md](mgm_common.md), 정렬은 [ui2d_alignment.md](ui2d_alignment.md), 엔진 입력 비트·소리는 [../engine/05_ui_input.md](../engine/05_ui_input.md)·[../engine/04_sound.md](../engine/04_sound.md) 를 그대로 따른다.

확정 수준: **[판독]** 디컴파일 C, **[판독: 어셈블리]** C 가 switch 본문·bool 인자를 빠뜨린 곳만 명령 확인(10절 목록), **[데이터]** 데이터 확인, **[추정]**, **[미확정]**, **[참고 이미지]** 사용자 캡처 2장, **[실행: 변환]** 자체 도구 실행, **[설계]** 웹이 정한 것.
주소는 menu01.nro(SwitchLoader 베이스 0x7100000000, 심볼 있음), 메시지 창은 main NSO 주소(`main @…`).

---

## 1. 기능 개요와 사용자에게 보이는 동작

→ 화면별 원본 BGM(라벨·시작·전환 페이드)·웹 연결: [04_sound.md §12.14](../engine/04_sound.md) (2026-10-08).

광장 지도에서 "마리오 파티"를 고르고 규칙(파티 규칙)·보드를 고른 뒤 나오는 **출발 전 설정 단계들**. 원본은 `menu01::SequenceStartBd` 의 상태 스택(4.1)으로 다음 네 단계를 오간다.

| 단계 [웹 이름] | 원본 상태 | 화면 | 키노피오 메시지 |
|---|---|---|---|
| 멤버 확인 `checkMember` | 9 CheckMemberImpl | 멤버 확인 판(`mn01_win_membercheck_02`, **이 문서 범위 밖 — 11절**) + 보드 이름 띠 | "이 멤버로 시작할까요?" + 선택지 예 / 멤버 설정 / 뒤로 |
| 멤버 설정 `settingMember` | 10 SettingMemberImpl | 반투명 판 `mn01_base_set_member_03`: 멤버(얼굴 4·CPU 표시) / 난이도 / 속도 / 핸디캡 행 + "(B) 설정 완료" 안내 | 커서 행 설명: 대전 상대를 변경합니다 / 실력을 변경합니다 / 이동하는 속도를 변경합니다 / **핸디캡을 설정합니다.** |
| 규칙 확인 `checkRule` | 12 CheckStartImpl | 오른쪽 판 `mn01_base_check_01`: 턴 수 N + "약 M분" 말풍선, 보너스 스타, "미니게임 설정" 구분선, 미니게임 설명, 체감 미니게임(, 미니게임 정하는 법) + 보드 이름 띠 | "이 설정으로 파티를 시작해도 될까요? 괜찮다면 바로 목적지로 가도록 하죠!" + 선택지 **스타트! / 플레이 방법 설정 / 뒤로** |
| 플레이 방법 설정 `settingRule` | 13 SettingRuleImpl | 판 `mn01_base_rule_01`: 턴 수·보너스 스타·미니게임 설명·체감 미니게임·미니게임 정하는 법 5행 + 오른쪽 그림 + "(B) 설정 완료" | 커서 행·값 설명(mn01_bd_mw_detail_*) |

모든 단계에서 위쪽 가운데에 모드 제목 띠 "마리오 파티: 파티 규칙"(`ComUiModeTitleHeader`, `mn01_text_modename_01`)이 있다 [판독 각 Impl 첫 줄 Start][참고 이미지 두 장].

캡처 대조 [참고 이미지] (캡처 2340×1080 중 게임 화면은 가로 약 213~2131 px = 1638×921, 배율 0.853):
- 캡처 1 = 멤버 설정, 커서 = 핸디캡 행(분홍 `cursor`), 1~3P 사람(난이도·속도 "-" 회색 = `noset`), 4P CPU(얼굴 위 "CPU", 난이도 = 얼굴 아이콘 + "보통", 속도 "보통"), 핸디캡 "없음" 넓은 칸(모두 0 → `x_parts_04`), 메시지 "핸디캡을 설정합니다." 보드 이름 띠는 없음(멤버 설정 진입 때 Out, 3절).
- 캡처 2 = 규칙 확인, 4행(체감까지 → `normal_4`, 즉 GameFlag 0x20 미해금), 턴 수 10·약 90분(6.4 표), 보너스 스타 있음(BonusStarType 1), 설명 있음·체감 있음, 선택지 커서 = 스타트!(첫 칸), 왼쪽 아래 보드 이름 띠 "…숲"(보드 6 "거대꽃충이와 과자의 숲" — Setup 기본 BoardID 6, 4.3).
- 왼쪽 위 노란 키노피오는 **메시지 창 형식 WT_Model 의 3D 모델**(`x_model`)이다 [데이터 ATR: Character CH_NPC022_YELLOW, WindowType WT_Model]. 3D 는 범위 밖(9.3 [설계]).
- 아래 플레이어 스탬프 줄은 `ComUiPlayerStatusMgr`(범위 밖), 왼쪽 아래 사람 영상·오른쪽 채팅은 방송 화면 요소.

## 2. 분석 대상 원본·자료 위치

| 항목 | 위치 |
|---|---|
| 코드 | menu01.nro `menu01::SequenceStartBd` @0x71000409c0~@0x710004aa6c, `ComUiBdSettingMember` @0x7100073f44~@0x710007d4f8, `ComUiBdCheckRule` @0x7100063d00~@0x710006619c, `ComUiBdSettingRule` @0x710007df20~@0x7100085e0c, `ComUiBdMapNameTelop` @0x7100066274~@0x7100066994, `ComUiModeTitleHeader` @0x71000adab8~@0x71000ae264, `ComUiBdCheckMember` @0x7100060d60~(판 부분은 범위 밖) |
| 메시지 창(공용) | main `bq::ComUiMessageWindow` — 선택지 FUN_71003175d0(열기)·FUN_71003197d0(사람 입력)·FUN_7100319a80(COM)·SetDecideChoice @0x7100319e78·SetSelectChoice @0x710031a02c·FUN_710031e360(선택지 폭)·SetMessageLabel @0x710031f2d0·FUN_7100315328(매 프레임) — C 는 기존 `analysis/decomp/msgwin_main_all.c`(새로 디컴파일하지 않음) |
| 디컴파일(새로) | `analysis/decomp/partyrule_menu01_seq.c`(SequenceStartBd 13함수+보조), `partyrule_menu01_ui.c`(위 UI 4클래스 184함수), `partyrule_menu01_checkmember.c`(CheckMember·ModeTitleHeader 59함수), 예외 어셈블리 `partyrule_menu01_dis.c`(10절) |
| 도구 | Ghidra `web/tools/analysis/partyrule_ghidra_nro.sh`(프로젝트 `ghidra_work/partyrule/g4` = `ghidra_work/modesel` g4 사본) + 기존 `DecompileNamed.java`, 문자열 `partyrule_strings.py` → `analysis/partyrule_strings.txt`, 어셈블리 `partyrule_disasm.py`, 메시지 속성 `msgwin_atr.py koKR menu01_mode` → `analysis/partyrule_atr_menu01_koKR.txt` |
| 레이아웃 | `extracted/bea/menu~menu01.nx.bea/menu/menu01/layout.lyt`(mn01_*), `menu~menu_common…/layout.lyt`(mncom_*), bq `Parts.lyt`(sys_meswin_model_00·model_choices_00·arrowchoices_00·sys_face_01). 덤프 `extracted/converted/ui/menu01/`·`bq_Parts/` |
| 데이터 | `menu~menu01.nx.bea/menu/menu01/data/BoardItemParam.json`(보드 이름 라벨 7칸), `bq.nx.bea/common/data/messageWindowList.json`(WT_Model = Model, Layout00 `sys_meswin_model_00`, Layout01 `sys_meswin_model_choices_00`) |
| 메시지 | `extracted/message/koKR/menu01_mode.json`(mn01_bd_*), `im_common.json`(im_bdNN_name·im_comLevel00~03), `im_menu.json`(im_mn_com_speed_quick/normal), `system.json`(sys_ctrl_back) |

화면 확정 경로 [판독][데이터]: 한국어 문자열 "핸디캡을 설정합니다." = `mn01_bd_mw_member_handi`, "이 설정으로 파티를…" = `mn01_bd_mw_check`, "약 [1:0:00cd]분" = `mn01_bd_ui_check_aboutTime`, "스타트!/뒤로/플레이 방법 설정" = `mn01_bd_mw_check_a0/a1/a2` → 이 라벨 문자열을 쓰는 함수 = `SequenceStartBd::SettingMemberImpl`(`__assign_external(+0x110,"mn01_bd_mw_member_handi")`)·`ComUiBdSettingMember` 생성자, `SequenceStartBd::CheckStartImpl`(`"mn01_bd_mw_check"` 16바이트 인라인)·`ComUiBdCheckRule::StateMessageImpl`(`mn01_bd_mw_check_a0..a2`)·`ComUiBdCheckRule::SetupTurn`(0x710015b5e1 = `mn01_bd_ui_check_aboutTime`) → 각 클래스 생성자의 레이아웃 이름(`mn01_base_set_member_03.bflyt`·`mn01_base_check_01.bflyt`·`mn01_base_rule_01.bflyt`).

## 3. 진입점과 전체 호출 흐름 [판독]

```
SequenceStartBd 생성자 @0x71000409c0: 상태 벡터 +0x60..0x70 비움, +0x78=1, 엔티티 +0x80(ComUiSelectMatchMode)·+0x98(ComUiBdMapNameTelop) 생성
Setup @0x71000410c8: BoardWork::SetBoardID(6); 플레이어 0..3 마다 SetComLevel(Menu+0x20+i), SetBoardHandicap(…)            ← 기본 보드 6
UpdateImpl @0x7100041290 (매 프레임): 스택 맨 위 상태 번호 1..0x15 → 해당 *Impl 을 FiberLite 로 한 번 실행(파이버가 끝나야 다음)
      (스택이 비었거나 맨 위가 0·14·20·21·22 이면 제목 띠·플레이어 상태·보드 이름 띠 Out)
SelectMapImpl: 보드 결정 → Push(9) (챔피언십이고 COM 없으면 11)

9  CheckMemberImpl @0x7100043dc0
   제목 띠 Start, 플레이어 상태 Start, 보드 이름 띠 SetBoard(GetBoardID)·In
   UiBdCheckMember 엔티티 + ComUiBdCheckMember::Start(…)                       (판 = 범위 밖)
   메시지 "mn01_bd_mw_member_check" + 선택지 3: [0]=a0 예, [1]=a2 멤버 설정, [2]=a1 뒤로 (칸 2 결정 SE = SQ_SE_SYS_CANCEL)
   기다림(IsWorking) → CheckMember Out, 메시지 Out, 결과:
      1(멤버 설정) → 보드 이름 띠 Out, Push(10)
      0(예)        → 파티 규칙이면 Push(12) (챔피언십이면 띠 Out·Push(11 아이템 고르기))
      그 밖(2 뒤로, −1 = B 취소) → 보드 이름 띠 Out, Pop
10 SettingMemberImpl @0x7100044780
   제목 띠·플레이어 상태 Start, 엔티티 + ComUiBdSettingMember, 행 설명 라벨 4개 다시 대입,
   Start(chara=IsExistComPlayer | level=…<<8 | speed=…<<16 | handicap=(BoardMode==0)<<24)
   IsFinished 까지 기다림 → Pop (→ 9 다시 실행: 멤버 확인 메시지부터)
12 CheckStartImpl @0x7100045140
   제목 띠·플레이어 상태 Start, 보드 이름 띠 SetBoard·In, flag 4 ← Menu+9, flag 6 ← Menu+10
   ComUiBdCheckRule: 메시지 라벨(+0x48) = 챔피언십 "mn01_bd_mw_check_serious" / 파티 "mn01_bd_mw_check", +0x60(선택지 3개) = 1
   SetItemCount(GameFlag 0x20 && 파티 ? 5 : 4), SetupInst(2), SetupGyro(3), SetupChoice(4)
   반복 { Start(); 결과(+0x3c) ≠ −1 까지 기다림; 결과 ≠ 0 이면 빠짐; GyroControllerConfigFiber 실행·끝 대기; 그 결과(+0x18) ≠ 0 이면 빠짐 }
   Out(false), 결과:
      2(플레이 방법 설정) → 보드 이름 띠 Out, Push(13)
      1(뒤로·B)          → Pop (→ 9)
      0(스타트!)         → Push(14 StartAnim), Wipe FadeOut(1.0, 1) 끝까지 대기
   IsFinished 까지 기다림
13 SettingRuleImpl @0x71000459c0
   제목 띠·플레이어 상태 Start, 엔티티 + ComUiBdSettingRule::Start(BoardMode), IsFinished 까지 기다림 → Pop (→ 12)
```
- 9 → 10 → 9: 멤버 설정을 마치면 **멤버 확인 메시지로 돌아간다**(규칙 확인으로 바로 가지 않음).
- 12 → 13 → 12: 플레이 방법 설정을 마치면 규칙 확인 메시지·판을 처음부터 다시 연다(Start 가 SetupTurn·SetupBonus 를 다시 부름).
- 14(StartAnim) 이후·GyroControllerConfigFiber(조이콘 설정 확인, `mn01_bd_mw_gyro_*`)는 범위 밖(9.3).

## 4. 구조체·필드·상수 표

### 4.1 SequenceStartBd [판독]
| 오프셋 | 뜻 | writer → reader |
|---|---|---|
| +0x60/+0x68/+0x70 | 상태 벡터(s32, 맨 위 = 현재 단계). Push = 뒤에 추가, Pop = +0x68 −= 4 | 각 *Impl → UpdateImpl |
| +0x40..0x50 | 현재 단계 UI 엔티티 핸들(단계 끝에 해제) | *Impl |
| +0x98..0xa8 | 보드 이름 띠 엔티티(ComUiBdMapNameTelop) | 생성자 |
| +0x24 | MODE_ITEM(제목 띠 SetMode 인자, 마리오 파티 = 0) | 생성 쪽 |

상태 번호 [판독 Push 인자]: 9 CheckMember, 10 SettingMember, 11 SelectItem(챔피언십), 12 CheckStart, 13 SettingRule, 14 StartAnim.

### 4.2 ComUiBdSettingMember (this) [판독]
| 오프셋 | 형식 | 웹 이름 | 뜻 | writer | reader |
|---|---|---|---|---|---|
| +0x38 | u8 | `closing` | B 로 닫기 요청 | Start=0, UpdateCursor(B)=1 | UpdateCursor |
| +0x3c | s32 | `phase` | −1 숨김, 0 in, 1 대기, 2 out | In·Out·Update | IsFinished(= <0) |
| +0x40/+0x48 | FiberLite* | `fiber` | 행 편집 파이버(0..3) | UpdateCursor(A) | UpdateCursor(끝날 때까지 입력 안 받음) |
| +0x50..0x60 | 엔티티 | `guide` | ComUiGuide00(정렬 2, 레이아웃에 Constraint) | 생성자 | UpdateCursor·*Impl |
| +0x68..+0x6b | u8×4 | `rowOn[4]` | 행 사용(멤버·난이도·속도·핸디캡) | Start(인자 바이트 0..3) | 커서·크기 |
| +0x6c | s32 | `row` | 커서 행, 생성자 −1 | Cursor | 전부 |
| +0x70 | s32 | `rowCount` | 1 + 난이도·속도·핸디캡 사용 수 | SetupWindowSize | 창 크기 |
| +0x74 | s32 | `comCount` | PlayerType==1 인 플레이어 수 | Start | 칸 배치 |
| +0x78..+0x7b | u8×4 | `isCom[4]` | 플레이어 i 가 COM | Start | 전부 |
| +0x7c | s32 | `charaCursor` | 멤버 편집 중 고른 COM 칸 | ComCharacterImpl | |
| +0x98 | s32 | `levelMerge` | COM 난이도가 모두 같으면 그 값(0..3), 아니면·COM 1명이면 4(개별) | SetupComLevel·ComLevelImpl | ComLevelImpl |
| +0x9c..+0xa8 | s32×4 | `level[4]` | 플레이어별 ComLevel 사본 | SetupComLevel·ComLevelImpl | |
| +0xac | s32 | `levelCursor` | 개별 편집 중 고른 칸 | ComLevelImpl | |
| +0xb0 | u8 | `fast` | 속도 = 빠름 (flag 8) | SetupComSpeed·ComSpeedImpl | SetComSpeed |
| +0xb4..+0xc0 | s32×4 | `handicap[4]` | BoardHandicap 사본(0..5) | SetupHandicap·HandicapImpl | |
| +0xc4 | s32 | `handiCursor` | 핸디캡 편집 중 칸 | HandicapImpl | |
| +0xc8/+0xe0/+0xf8/+0x110 | string | `rowLabel[4]` | 행 설명 메시지 라벨(member_chara/level/speed/handi) | 생성자·SettingMemberImpl | Cursor |

행 부품 이름 표 @0x71001929b0 [데이터]: `x_parts_list/x_btn_cpu`·`x_btn_level`·`x_btn_speed`·`x_btn_handicap`. 창 크기 애니 표 @0x7100192998 [데이터]: rowCount 2 → `normal_02`, 3 → `normal_01`, 4 → `normal_00`, 그 밖 → `normal_03`.

저장 [판독 UpdateCursor 닫기]: 버튼 애니가 다 끝난 뒤 Menu+0x20..0x23 ← 플레이어 0..3 ComLevel, Menu+0x24 ← flag 8(속도), 호스트면 저장 데이터 MenuData +0x10..0x14 에도 같은 값 → Out(false). 핸디캡은 HandicapImpl 의 A 때 PlayerWork::SetBoardHandicap 로 바로 쓴다.

### 4.3 값 표 [판독][데이터]
| 값 | 번호 → 표시 |
|---|---|
| ComLevel | 0 쉬움(im_comLevel00), 1 보통, 2 강함, 3 달인; 표시 `mn01_bd_ui_member_level_personal`("[1:1:00cd]")에 삽입, 아이콘 `x_icon_level` 텍스처 `mn01_icon_rule_02^q`(80×320, 4칸 세로) 오프셋 0 / 0.25 / 0.5 / 0.75 [판독: SetComLevel vt+0x128(0, 값)], 4(개별) = `null_level` 숨김·`null_speed`(문구 "개별 설정" `mn01_bd_ui_member_level_each`) 보임 |
| 속도(flag 8) | 0 보통(im_mn_com_speed_normal), 1 빠름(im_mn_com_speed_quick) — `mn01_bd_ui_member_speed_personal/all` 삽입 [판독: 어셈블리 SetComSpeed tbz w19] |
| 핸디캡 | 0..5 정수(`mn01_bd_ui_member_handi` "[1:0:00cd]" SetIntVariable); 모두 0 이면 넓은 칸 `x_parts_04` "없음"(`mn01_bd_ui_member_handi_off`), 하나라도 > 0 이면 칸 00..03 [판독 SetupHandicap] |
| 턴 수(TURN) | 0→10, 1→15, 2→20, 3→25, 4→30, 5→12 (표 @0x7100163414 [데이터]) |
| 약 N분 | 10→90, 15→120, 20→150, 25→180, 30→210, 12→100 (표 @0x7100163310 턴·@0x7100163328 분, 분기 바이트 @0x71001632f8; **표에 없는 턴 수는 15/120 칸으로 표시** — 기본 x24=1) [판독: 어셈블리 SetupTurn] |
| 보너스(SettingRule 번호 → BonusStarType) | 0 → 1(있음 `choice_yes`), 1 → 2(기존 `choice_original`, GameFlag 0x22 일 때만 목록에 있음), 2 → 0(없음 `choice_no`) (표 @0x7100163408 [1,2,0], 역표 @0x7100163448 8바이트 간격 [2,0,1]) |
| 미니게임 설명(SettingRule 번호) | 0 있음 ↔ flag 4 = 1, 1 없음 |
| 체감 미니게임 | 0 있음 ↔ flag 6 = 1, 1 없음 |
| 미니게임 정하는 법 | 0 룰렛(`choice_random`), 1 투표(`choice_vote`) ↔ flag 7 |
| 보드 | 0..6 = BoardItemParam imNameLabel(im_bd01_name … im_bd07_name "거대꽃충이와 과자의 숲"), 띠 색 `x_base_0N` 중 하나만 보임 |

### 4.4 ComUiBdCheckRule [판독]
+0x38 phase(−1/0/1/2), +0x3c 결과(−1 대기, 0 스타트, 1 뒤로, 2 플레이 방법 설정), +0x40 메시지 파이버, +0x48 메시지 라벨, +0x60 선택지 3개 여부(CheckStartImpl 이 1). 행 이름 표 @0x7100191a68(title 글자)·@0x7100191a90(아이콘)·@0x7100191ab8(NEW)·@0x7100191ae0(값 글자 set_01..04). 판 높이 애니 @0x7100163340: 3 → `normal_3`, 4 → `normal_4`, 5 → `normal_5`.

### 4.5 ComUiBdSettingRule [판독]
+0x38 phase, +0x3c 결과(B 때 1), +0x40 BoardMode, +0x44 커서 행(−1 없음), +0x48..+0x4c 행 사용(목록 길이 > 1), +0x50 TURN 목록, +0x68 보너스 목록, +0x80 설명 목록, +0x98 체감 목록, +0xb0 정하는 법 목록, +0xc8 TURN, +0xcc 보너스, +0xd0 설명, +0xd4 체감, +0xd8 정하는 법.

| 목록 | 파티(BoardMode 0) | 챔피언십(1) |
|---|---|---|
| TURN | [0,1,2,3,4] (10·15·20·25·30) | [5] (12) |
| 보너스 | [0, (1 GameFlag 0x22), 2] | [0] |
| 설명 / 체감 | [0,1] / [0,1] | [0,1] / [0,1] |
| 정하는 법 | [0, (1 GameFlag 0x20)] | [1] |

창 애니: GameFlag 0x20 && 파티 → `normal_5`, 아니면 `normal_4`.

## 5. 상태 전이와 전체 수명

### 5.1 공통 UI 수명 (세 판 모두 같은 틀) [판독]
`Start`: phase ≥ 2 이면 "in" 재생·phase 0·보이기. Update: phase 0 이고 애니 끝 → "normal"·phase 1; phase 2 이고 끝 → 숨김·phase −1. `Out(false)`: phase 2·"out", 메시지 창이 일하는 중이면 메시지 Out. IsFinished = phase < 0. (SettingRule 은 phase 0→1 때 첫 사용 행으로 Cursor 를 놓는다.)

### 5.2 멤버 설정 (ComUiBdSettingMember) [판독]
```
Start(flags): closing 0, rowOn ← flags, isCom·comCount ← PlayerType, SetupWindowSize·SetupMember·SetupComLevel·SetupComSpeed·SetupHandicap,
              Cursor(첫 사용 행, 즉시), phase 0 "in"
UpdateCursor (phase 1, 파이버 없음/끝남일 때만):
   closing → 네 행 버튼 애니가 모두 끝나면 저장(4.2)·Out(false)
   row == −1 → 첫 사용 행으로 Cursor(즉시)
   안내 = "mn01_bd_ctrl_detail_end"(1칸) In
   trig B → SQ_SE_SYS_CANCEL, closing = 1        (같은 프레임 아래 처리도 계속)
   trig A 이고 rowOn[row] → SQ_SE_SYS_DECI, 진동, 행 버튼 "press" 뒤 "normal_01", 행별 파이버 시작:
        0 ComCharacterImpl · 1 ComLevelImpl · 2 ComSpeedImpl · 3 HandicapImpl
   아니면 rep|trig 위(0x20800, 아래 홀드 0x400 중이면 0x800 만) → 위로 순환 이동(CursorUp 식),
          아래(0x80400, 위 홀드 0x800 중이면 0x400 만) → CursorDown; 바뀌면 SQ_SE_SYS_CURSOR(Play2D 행 위치), 진동
Cursor(row, 즉시): 바뀌면 메시지 창 SetMessageLabel(rowLabel[row]), owner −1, DisablePadInput(1,0), ForceAllDraw(1), ManualClose(1),
                   일하는 중이면 RequestNextMessage(1) 아니면 Start;  row −1 이면 창 Out
                   행 버튼 애니: 즉시면 커서 행 "cursor"·나머지 "normal_00", 아니면 커서 행 "on" 뒤 "cursor", 나머지 "off_01" 뒤 "normal_00"
CursorUp/Down: (row±1, ±2, ±3) mod 4 중 사용 행 첫 것 — **순환**
```
행 편집 파이버(모두: 시작 때 행 버튼 애니 끝까지 Wait, 안내 = "sys_ctrl_back", 다른 행 "disable"; 끝 때 행 버튼 애니 끝 Wait → Setup* 로 PlayerWork 에서 다시 읽음 → Cursor(행, 즉시) → Wait 1):
- **난이도 ComLevelImpl** @0x7100077d10: levelMerge ≠ 4(COM 2명 이상이 모두 같은 난이도)이면 1단계 = 합친 칸(x_parts_04/05 "cursor") 편집: trig 아래(0x80400) (v+4)%5, 위(0x20800) (v+1)%5(4 = 개별), 바뀌면 SQ_SE_SYS_CURSOR_S·진동·SetComLevelMerge·"move" 뒤 "cursor". A: SQ_SE_SYS_DECI·진동; 4 면 Wait 후 2단계로, 아니면 "press_01" 뒤 "cursor"·**플레이어 0..3 모두** SetComLevel(값)·끝. B: SQ_SE_SYS_CANCEL·값 복원·끝.
  2단계(개별): 칸 00..03 보이고 04·05 숨김, 커서 = 첫 COM 칸, rep|trig 좌우(0x10100/0x40200, 반대 홀드 규칙 같음)로 COM 칸 사이 순환 이동(SQ_SE_SYS_CURSOR), trig 위/아래로 그 칸 값 (v±1) mod 4(SQ_SE_SYS_CURSOR_S, "move" 뒤 "cursor"). A: DECI·"press_01"·**COM 플레이어만** SetComLevel. B: CANCEL.
- **속도 ComSpeedImpl** @0x710007aa60: 칸 03/04/05 "cursor"; trig 위/아래(0xa0c00) 마다 fast 뒤집기, 보이는 합친 칸에 SQ_SE_SYS_CURSOR_S, SetComSpeed, "move" 뒤 "cursor". A: DECI·"press_01"·flag::Set(8, fast). B: CANCEL(되돌림 = SetupComSpeed 가 flag 8 을 다시 읽음).
- **핸디캡 HandicapImpl** @0x710007b660: 칸 00..03 보이고 04 숨김, 칸 커서 0("cursor"); rep|trig 좌우로 칸 (c±1) mod 4(clamp 0..3 은 무의미) SQ_SE_SYS_CURSOR; trig 아래 (v+5)%6, 위 (v+1)%6 → SQ_SE_SYS_CURSOR_S·SetHandicapValue·"move" 뒤 "cursor". A: DECI·"press_01" 뒤 "cursor"·플레이어 0..3 SetBoardHandicap. B: CANCEL(사본 버림).
- **멤버(캐릭터) ComCharacterImpl** @0x7100075de0: 창 `normal_03`·정렬 끔, 안내 2칸, COM 얼굴 칸 사이 이동(사람 칸 "disable"), A = `ComUiSelectPlayerCharacter`(공용 캐릭터 고르기 판) 열기, X(0x8) = RandomComCharacter, B = 창 크기 복원·SetupMember·끝. **고르기 판은 범위 밖**(11절).

### 5.3 규칙 확인 (ComUiBdCheckRule) [판독]
```
Start: 결과 −1, SetupTurn·SetupBonus, phase 0 "in"
UpdateProcess: phase 1 이고 결과 −1 이고 메시지 파이버 없음/끝 → StateMessageImpl 파이버
StateMessageImpl: 다이얼로그·메시지 창 IsEnd 까지 대기
   파티 && GameFlag 0x22 && !SaveFlag 0x1a → "mn01_bd_mw_check_bonus" 한 번(SaveFlag 0x1a 켬·저장 요청)
   파티 && GameFlag 0x20 && !SaveFlag 0x1b → "mn01_bd_mw_check_decide" 한 번(SaveFlag 0x1b)
   AddMessageLabel(+0x48), +0x60 ? 선택지 3 [0]=a0 스타트!, [2]=a1 뒤로, [1]=a2 플레이 방법 설정 : 2 [0]=a0, [1]=a1
   칸 0 결정 SE SQ_SE_SYS_DECI_L·진동 bv_vib_sys_deci_l, 뒤로 칸 결정 SE SQ_SE_SYS_CANCEL
   초기 커서(+0x43c) 0, ManualClose 1, CancelEnable 1, owner = 조작 플레이어, DisablePadInput(0,0), ForceAllDraw 0, Start
   IsWorking 동안 Wait → 메시지 Out, 선택 결과 r: r == 0 → 결과 0;  r == (3지면 1, 2지면 2) → 결과 2;  그 밖(−1 = B 포함) → 결과 1
```
### 5.4 플레이 방법 설정 (ComUiBdSettingRule) [판독]
```
Start(mode): 목록 만들기(4.5), 행 사용·DisableButton/OffCursorButton, 값 = TurnMax→TURN, BonusStarType→역표, !flag4, !flag6, flag7,
             Cursor(−1), 안내 "mn01_bd_ctrl_detail_end", phase 0 "in"
phase 0→1: Cursor(첫 사용 행)
UpdateProcess (phase 1, 다섯 행 버튼 애니가 모두 끝났을 때만):
   trig B → SQ_SE_SYS_CANCEL, 결과 1, Finish(저장·Out)       ← B = "설정 완료"(바꾼 값을 저장한다)
   아니면 커서 행의 UpdateSet*:
     rep|trig 위/아래(홀드 규칙 같음) → 사용 행 사이 순환 이동, SQ_SE_SYS_CURSOR(Play2D)·진동
     trig 왼쪽(0x10100) → 목록에서 앞 칸(순환), 오른쪽(0x40200) → 다음 칸(순환); 값이 바뀌면 SQ_SE_SYS_CURSOR_S·진동·Set*·PressButton(행 "press")
       턴: SetTurn 뒤 SetBonus(그림이 턴 4 에 따라 바뀜), 메시지 그대로
       보너스·설명·체감·정하는 법: 해당 설명 메시지로 SetMessageLabel·RequestNextMessage
Finish: SetTurnMax(표 @0x7100163414[TURN], TURN > 5 면 0), SetBonusStarType(표[보너스]), flag 4 = (설명 == 0), flag 6 = (체감 == 0),
        flag 7 = (정하는 법 == 1), Menu+9 = (설명 == 0), Menu+10 = (체감 == 0), Out(false)
Cursor(행): 메시지 = 행 0 "mn01_bd_mw_detail_turn", 행 1 보너스 값별(0 bonus00, 1 → TURN 4 이면 bonus02 아니면 bonus03, 2 bonus01),
            행 2 inst00/01, 행 3 gyro00/01, 행 4 decide00/01; 행 버튼 커서 행 "cursor"·나머지 "normal", 커서 행 그림(x_parts_pict_0N)만 보임
```
- 값 글자 [판독: 어셈블리 SetTurn @0x7100082200·@0x710008232c]: 행 커서 부품 `x_parts_set_0N/x_parts_cursor_00/x_text_yes_no` = 턴 행은 `mn01_bd_ui_detail_choice_turn`(Number0 = 턴 표 @0x7100163414[TURN]), 그 밖은 `detail_choice_yes/no/original/random/vote`; 턴 그림 `x_parts_pict_00/x_text_turn` = `mn01_bd_ui_detail_time_clock`(Number0 = 분 표 @0x710016342c [90,120,150,180,210,100][TURN], TURN > 5 면 0), 위·아래 글자 `x_text_top` "약"·`x_text_bottom` "분"(생성자).
- 보너스 그림: 보너스 0 → `mn01_pict_bonus_00`(TURN 4 이면 `_04`), 1 → `_03`(TURN 4 이면 `_02`), 2 → `_01` [판독 SetBonus]. 설명 그림 `mn01_pict_mginfo_00/01`, 체감 `mn01_pict_joycon_01/02`(0 → 01), 정하는 법 `mn01_pict_mg_00/01`. 값이 바뀌면 그림 "normal_on" 뒤 "normal".
- NEW 표시: 보너스 행 = 파티 && GameFlag 0x22 && !SaveFlag 0x3b (값 1 을 고르면 SaveFlag 0x3b 켬), 정하는 법 = GameFlag 0x20 && !SaveFlag 0x3c.

### 5.5 보드 이름 띠·제목 띠 [판독]
띠 In(false) = "in"→"normal", Out(false) = "out"→숨김(phase −1), phase 1·0 이면 In 무시(≥2 일 때만). SetBoard(id): `x_text_title` = `mn01_bd_ui_check_map`("[1:1:00cd]")에 BoardItemParam[id].imNameLabel 삽입, `x_base_0N` 은 N == id 만 보임. 제목 띠 Start(mode 0, BoardMode 0) = `x_text_mode` ← `mn01_bd_ui_mode_party`("마리오 파티: 파티 규칙"), 챔피언십 = `mn01_bd_ui_mode_serious`.

## 6. 계산식·조건·상세 의사코드

### 6.1 멤버 설정 칸 배치 [판독 SetupComLevel·SetupComSpeed·MergeComLevel·SetupHandicap]
COM 은 뒤쪽 플레이어에 몰려 있다는 전제의 배치(코드가 PlayerID 순서로만 판단 [판독]):
```
난이도 행: 칸 00 언제나 보임;  merge = (COM 2명 이상 && 모든 COM 난이도 같음) ? 그 값 : 4
   merge < 4: 01 보임 = comCount < 3, 02 = comCount < 2, 03 = comCount == 1, 04(2칸 너비) = comCount == 2, 05(3칸) = comCount == 3; SetComLevelMerge(merge)
   merge == 4: 00..03 보임, 04·05 숨김(칸마다 SetComLevel)
   사람 칸 = "noset"(가운데 "-"), COM 칸 = "normal"
속도 행(난이도 행 사용일 때): 00 보임, 01 = comCount < 3, 02 = comCount < 2, 03 = comCount == 1, 04 = comCount == 2, 05 = comCount == 3;
   00..02 "noset", 03..05 "normal", fast = flag 8, SetComSpeed → 03·04·05 의 x_text_speed 모두
핸디캡 행: 값 = PlayerWork BoardHandicap, 하나라도 > 0 이면 00..03 보임·04 숨김, 아니면 00..03 숨김·04("없음") 보임
멤버 행: x_pc_0i 얼굴 = 캐릭터 ID(sys_face_01 x_face_pc128 ← face_128_pcNN^u), x_cpu("CPU" 글자) 보임 = isCom[i]
창: x_parts_list 애니 = rowCount 표(4.2), x_alignment_list 보임 = rowCount > 1, x_btn_level/speed/handicap 보임 = rowOn, 정렬 요청
```
### 6.2 메시지 창 선택지 (공용 bq::ComUiMessageWindow, 기존 웹 미구현 부분) [판독 main]
```
SetChoiceCount(n): 2 ≤ n ≤ 4 아니면 abort, +0x430 = n, +0x50d = 1;  SetChoiceMessageLabel(i, label) → 칸 i 라벨, +0x50d = 1
SetChoiceDeciSE(i, se) / SetChoiceDeciVib(i, vib) / SetCancelEnable(b) +0x515 / 초기 커서 +0x43c (부르는 쪽이 직접 0 대입)
Start: +0x434(커서)·+0x438(결과) = −1, 선택형 +0x50b = +0x50d, +0x50d = 0
레이아웃 고르기(FUN_710031a480): 선택형이면 WindowData[wt].Layout01(WT_Model → sys_meswin_model_choices_00), 커서 = +0x43c, +0x43c = 0,
   x_parts_00..03 숨김, 칸 글자 x_parts_NN/x_text_dialog = 칸 라벨 문구, 폭(FUN_710031e360): w = min(원래 x_window 폭, 최대 글자 폭 + 130), w ≥ 232,
   x_window·x_window_blur 폭 = w
페이지 하위 1 끝(글자 완료): 선택형이면 FUN_71003175d0: 창 "in_choice", 칸 i < n 보이기, 칸 애니 = 사용 불가 "disable" / i == 커서 "cursor" / "normal",
   x_alignment_00 정렬 요청, 더킹(0x0d) 켬
하위 2: 칸마다 x_icon_cursor 보임 = !padDisabled || arrowWhenDisabled. 넘김 판정(FUN_7100318030) 선택형:
   owner == −1 → 거짓;  owner COM → FUN_7100319a80;  사람 → FUN_71003197d0:
     창 애니(in_choice)가 끝나지 않았으면 거짓, padDisabled 면 거짓
     trig & nextMask(A) → SetDecideChoice(커서): 결과 = 커서, 칸 "press", SE = 칸 결정 SE ?? SQ_SE_SYS_DECI, 진동 = 칸 진동 ?? bv_vib_sys_deci → 참
     trig B && CancelEnable → SQ_SE_SYS_CANCEL → 참 (결과 −1 그대로)
     trig 0x20800(위) → 커서보다 작은 번호 중 가장 가까운 사용 가능 칸, 아니면 trig 0x80400(아래) → 큰 번호 쪽 (끝에서 멈춤, 순환 없음)
        바뀌면 SetSelectChoice: 칸마다 "on"(커서)/"off" 뒤 "cursor"/"normal", 커서 칸 위치에 SQ_SE_SYS_CURSOR(Play2D), 진동 bv_vib_sys_cursor
   참이면 하위 3(선택형은 MES_PROC 소리 없음) → 다음 페이지 없음 → ManualClose 면 끝 처리·상태 2
GetChoiceResult = +0x438
```
### 6.3 메시지 창 공용 동작 보충 (이 화면이 처음 쓰는 경로) [판독 main]
- `SetMessageLabel` @0x710031f2d0 은 +0x506(넘김 요청) = 0, 페이지 번호 0, 페이지 비우기, **하위 단계(+0x2c) = 0** 후 AddMessageLabel. 상태 1(페이지) 중에 부르면 다음 프레임 하위 0 에서 새 페이지를 바로 시작한다(멤버·플레이 방법 설정의 행 설명 교체).
- 보충(2026-10-07, 구현 단계): 페이지 하위 0 의 FUN_7100316fb0(page) 은 **그때의 페이지 라벨**로 글자 객체를 만든다(레이아웃은 FUN_710031a480 때 것 그대로) [판독 message_window.md 5절]. 웹 mgmcommon 은 레이아웃을 고를 때 글자까지 풀어 두었으므로, 상태 1 중 SetMessageLabel 로 라벨이 바뀌면 옛 글자가 나온다(시험으로 확인) → 하위 0 에서 현재 페이지 라벨로 글자·속성을 다시 푼다(레이아웃은 유지).
- 보충(2026-10-07, 구현 단계): 끝 처리 FUN_7100318340 은 넘김 요청 +0x506 도 0 으로 지운다 [판독 @0x7100318340 `*(param_1 + 0x506) = 0`]. 웹은 지우지 않아, 행 설명의 RequestNextMessage 가 남은 채 다음 선택지 메시지를 열면 첫 판정에서 바로 넘어갔다(결과 −1 → 뒤로, 시험으로 확인) → 끝 처리에서 지운다.
- 매 프레임 FUN_7100315328: 상태 처리 뒤 **글자 객체(+0x130)가 있으면 상태와 관계없이** FUN_71003237dc 로 갱신. 끝 처리 FUN_7100318340 은 글자 객체를 지우지 않는다(지우는 것은 Start 의 FUN_7100318244). → 행 설명처럼 RequestNextMessage(1) 로 0.2 s 뒤 상태 2 가 돼도 글자는 끝까지 나온다.
- 보충(2026-10-07, 구현 단계 — 근거 FUN_710031a480 @0x710031a480 의 레이아웃 재생성 직후 `if (page != 0 || 상태 == 2) { "normal" 재생; 보이기 }` [판독]): 상태 2(창 남음)에서 Start 했는데 레이아웃이 바뀌면(행 설명 `sys_meswin_model_00` → 선택지 `sys_meswin_model_choices_00`) in 없이 "normal"·보이기로 바로 나온다. 웹 mgmcommon 은 page ≠ 0 쪽만 있었으므로 이 갈래를 더한다.
- 창 형식 Model(7): 레이아웃 `sys_meswin_model_00`(x_bd_00 1920×340, 위치 (0,−21)) → 기본 위치 Top_Center: SetPlace y = (1080−340)/2 + 21 = **391**(화면 위에서 149 px, 캡처 글자 줄 위치와 맞음 [참고 이미지]). `x_model` = 화자 3D 모델(FUN_7100316720·FUN_7100317d40 모션) — 범위 밖.

### 6.4 턴 수 → 약 N분 [판독: 어셈블리 SetupTurn @0x71000650b0..0x7100065224]
```
k = GetTurnMax() − 10;  idx = (k ≤ 20) ? 표@0x71001632f8[k] 로 고른 칸 : 기본 1
칸: 0(턴 10)→0, 2(턴 12)→5, 10(턴 20)→2, 15(턴 25)→3, 20(턴 30)→4, 그 밖→1
x_text_turn = 턴표[idx] = [10,15,20,25,30,12][idx];  x_text_time = 분표[idx] = [90,120,150,180,210,100][idx]  ("약 %d분")
```
C 는 switch 본문이 빠져 있어(case 마다 break 만) 어셈블리로 확인했다(10절).

## 7. 애니메이션·소리·에셋 연결

| 시점 | 소리 [판독] | 레이아웃 애니 [판독][데이터] |
|---|---|---|
| 멤버 설정 행 이동 | SQ_SE_SYS_CURSOR(Play2D 행 위치) + 진동 | 행 버튼 on→cursor / off_01→normal_00 |
| 행 결정 A | SQ_SE_SYS_DECI | press → normal_01, 편집 끝 press_01 → cursor |
| 칸 이동(편집 중) | SQ_SE_SYS_CURSOR | 칸 cursor / normal / noset |
| 값 바꿈 | SQ_SE_SYS_CURSOR_S | 칸 move → cursor |
| 취소·닫기 B | SQ_SE_SYS_CANCEL | |
| 규칙 확인 "스타트!" | SQ_SE_SYS_DECI_L + bv_vib_sys_deci_l | 선택 칸 press |
| 선택지 이동·결정 | SQ_SE_SYS_CURSOR / SQ_SE_SYS_DECI (칸 지정이 없을 때) | 칸 on/off → cursor/normal, press |
| 플레이 방법 행 이동 / 값 | SQ_SE_SYS_CURSOR / SQ_SE_SYS_CURSOR_S | 행 cursor/normal, 값 바뀜 press, 그림 normal_on→normal |

레이아웃 애니 목록 [실행: 변환 `web/tools/analysis/partyrule_web_assets.py`]: base_set_member_03·base_check_01·base_rule_01·text_modename_01/02 = in/normal/out; mn01_set_member_01 = normal_00..03(창 높이); mn01_btn_{cpu,level,speed,handicap} = cursor/disable/normal_00/normal_01/off_00/off_01/on/press(/press_01); mn01_cursor_set_01 = cursor/move/normal/noset/off/on/press; mn01_win_check_01 = normal_3/4/5; mn01_win_rule_01 = normal_4/5; mn01_cursor_rule_01 = cursor/disable/normal/press; mn01_pict_rule_0N = normal/normal_on; sys_meswin_model_choices_00 = in/in_choice/normal/out.
동적 텍스처(CreateTexture) [판독]: 규칙 행 아이콘 `mn01_icon_timer_00`·`star_00`·`balloon_00`·`feel_00`·`mg_00`, 플레이 방법 그림 `mn01_pict_bonus_00..04`·`mginfo_00/01`·`joycon_01/02`·`mg_00/01`, 얼굴 `face_128_pcNN^u`(기존 `assets/mgm01/faces.json`).

## 8. 다른 기능과의 상호작용

- 메시지 창: 행 설명은 owner −1·패드 막음(사람 입력으로 넘어가지 않음), 화면 쪽 RequestNextMessage 로만 넘어간다(6.3). 선택지 메시지는 조작 플레이어가 owner.
- 저장값: PlayerWork ComLevel·BoardHandicap, flag 4·6·7·8, BoardWork TurnMax·BonusStarType, Menu+9·+10·+0x20..0x24, 저장 데이터 MenuData(호스트), SaveFlag 0x1a·0x1b·0x3b·0x3c(NEW·첫 안내).
- 보드 시작(14)·조이콘 설정 확인(GyroControllerConfigFiber)·온라인 동기(IsHost 분기)는 범위 밖.
- 제목 띠·플레이어 상태는 각 단계가 Start 만 부르고(이미 보이면 무시) 단계 사이에 사라지지 않는다.

## 9. 웹 포팅 구조와 구현 순서

### 9.1 위치·의존
`web/script/shell/partyrule/`(엔진 독립). import 허용: 같은 폴더, `../mgmcommon`, `three`, `../charselect/{scene2d,render2d,state,types}` (mgm_common.md 9.1 과 같음). 페이지 어댑터 `web/script/partyrule_page.ts`, UI 등록 `web/script/ui_main.ts` UIS 끝 `partyrule`. 에셋 `web/assets/partyrule/partyrule.json`(+tex/pr·font·sound) ← `web/tools/analysis/partyrule_web_assets.py`(mgmcommon_web_assets.Bundle 재사용), 얼굴은 `../mgm01/faces.json` 을 함께 합친다.

### 9.2 파일과 책임
| 파일 | 원본 | 책임 |
|---|---|---|
| `types.ts` | 4절 | 설정값 `PartyRuleConfig`(플레이어 4: 캐릭터·COM·ComLevel·BoardHandicap, flag 4·6·7·8, TurnMax, BonusStarType, BoardID, BoardMode, GameFlag 0x20·0x22), 사건 형식 |
| `tables.ts` | 4.3·6.4 | 턴·분·보너스·라벨 표 |
| `memberState.ts` | 5.2·6.1 | 멤버 설정 순수 상태기계(입력 비트·dt → 사건: 커서·편집·저장) |
| `ruleState.ts` | 5.4 | 플레이 방법 설정 순수 상태기계 |
| `flow.ts` | 3·5.3 | 단계 스택(9·10·12·13) + 메시지·선택지 진행 + 결과(스타트/뒤로) |
| `memberView.ts`·`checkView.ts`·`ruleView.ts`·`telop.ts` | 6·7 | 사건 → 레이아웃(애니·보임·글자·텍스처), 그리기 |
| `screen.ts`·`index.ts` | | 묶음·공개 API |

정정(2026-10-07, 구현 단계 — 이유: 판(원본 ComUi 클래스)마다 순수 로직과 그리기 사건을 한 파일에 두는 편이 원본 함수 대응이 쉬워서): 실제 파일은 `types.ts`·`tables.ts`·`panel.ts`(판 공통 In/Out/Start 수명 5.1)·`member.ts`(ComUiBdSettingMember)·`check.ts`(ComUiBdCheckRule)·`rule.ts`(ComUiBdSettingRule)·`flow.ts`(SequenceStartBd 9·10·12·13 + 제목 띠·보드 이름 띠)·`view.ts`(사건 → 레이아웃·그리기)·`screen.ts`·`index.ts`. 판 클래스는 입력·애니 끝 조회(`PIO`) → 그리기 사건(`PEvent`)·메시지 창 호출·설정값 변경만 하고 레이아웃에 손대지 않는다(순수, 시험은 노드에서 실제 명세 레이아웃으로 애니 끝을 잰다). 행 편집 함수(*Impl)는 원본처럼 파이버(제너레이터)다.

공용(mgmcommon)에 더하는 것 [설계, 기존 동작 무변경]: `MgmSpecPart.fonts?` + mergeSpec 덮어쓰기(화면별 글꼴), 메시지 창 선택지(6.2)·Model 형식 `x_model` 숨김·SetMessageLabel 하위 단계 0(6.3)·글자 객체 상태 무관 갱신(6.3)·상태 2 에서 Start 할 때 레이아웃이 바뀌면 normal·보이기(6.3 보충). message_window.md 에 정정 줄.

### 9.3 웹이 정한 것 [설계]
| 항목 | 웹 | 이유 |
|---|---|---|
| 3D(키노피오 모델·광장 배경) | `x_model` 숨김, 배경 = `assets/modeselect/backdrop_temp.png` | 사용자 범위 |
| 멤버 확인(9) 판 | 판 없이 메시지 + 선택지만, 보드 이름 띠 In/Out | ComUiBdCheckMember 판 = 범위 밖(11절) |
| 캐릭터 고르기(ComUiSelectPlayerCharacter) | 멤버 행 편집에서 COM 칸 이동·B 만, A/X 는 결과 칸에 사건만 기록 | 공용 고르기 판 범위 밖 |
| 스타트! 이후 | 결과 칸에 설정값 표시, 화면 정지(조이콘 확인·출발 연출 없음) | 범위 밖 |
| 진동·보이스 | 사건만 | mgmcommon 과 같음 |
| 시험값 | URL `?humans=3`(사람 수, 나머지 COM)·`?step=member|check|rule`(시작 단계)·`?turn=`·`?bonus=`·`?handi=`·`?flag20=`·`?flag22=`·`?board=` | 페이지 시험 |
| 정정(구현): 시험값 | 사람/CPU 는 ui.html 의 1~4P COM 칸(모두 COM 이면 1P 사람), 나머지는 패널 "파티 규칙 시험값" 또는 URL `step`·`turn`·`bonus`·`handi=0,0,0,0`·`level`·`fast`·`inst`·`gyro`·`vote`·`flag20`·`flag22`·`board`·`champ`. 결과 칸 = 단계가 바뀔 때마다 설정값 요약, 스타트! 때 최종값 | `?humans` 대신 기존 COM 칸을 씀 |
| 안내(ComUiGuide00) 위치 | 판 레이아웃의 `x_guide_pos_00`(멤버 `x_parts_list/…`, 플레이 방법 `x_parts_win/…`) 위치에 공용 MgmGuide(오른쪽 정렬) | SetConstraint(레이아웃)·SetGuideAlignment(2) [판독], Constraint 계산식 [미확정] |
| CPU 글자 그림자 | `x_text_CPU` 와 `x_text_CPU_shadow` 에 같은 문구 | 생성자는 `x_text_CPU` 만 SetMessageLabel [판독], 그림자 짝 자동 처리 [추정: 메시지 창의 "%s_shadow" 와 같은 방식] |
| 행 편집 파이버 진행 시점 | 판 Update 의 UpdateCursor 앞에서 한 걸음 | FiberLite 를 누가 언제 돌리는지 [미확정] |
| 애니 "끝" 판정(IsEndAnimButton 의 vt+0x1d0 \|\| vt+0x1c8) | 재생 없음·끝 프레임·반복 애니면 끝 | 두 가상 함수 이름 [미확정, 반복 cursor 애니에서 기다림이 풀려야 원본과 맞음 → 반복 = 끝으로 둠] |
| 나눈 창 조각 위치(원점이 가운데가 아닌 창) | 변환기(modesel split_windows)는 9조각을 창 노드 '가운데'에 붙여 만들고 렌더러는 가운데 부모 원점(po 0)을 부모 원점 점으로 놓는다 → 원점 rc·ct·lc 창은 반 폭/높이 어긋남(계산: 규칙 확인 판 518 px 오른쪽, 멤버 판 win 335 px 위). `partyrule_web_assets.py split_origin_fix` 가 조각에 (−o·w/2, −o·h/2) 를 더하고(정점색 고른 창만), 선택지 칸 창은 메시지 창 폭 조절 때 원점 기준으로 놓는다. 보정 뒤 규칙 확인 판 x 884..1920(캡처 ≈905..), 선택지 왼쪽 1476(캡처 1476) [계산·참고 이미지] | 공용 변환·렌더 규칙은 고치지 않음(다른 화면 영향) |
| 그리기 순서 | 띠·판·안내 → 메시지 창 → 제목 띠 | 제목 띠 그리기 순위 0x9300(@0x71000adb38 `mov w1,#0x9300`) > 메시지 창 0x9200 [판독: 어셈블리] — 캡처에서도 제목이 메시지 띠 위에 보임 |
| 말풍선 창(win_time)·점선(pict_line) 모양 | 공용 렌더 그대로(말풍선 꼬리·점 반복이 원본과 다를 수 있음) | 창 프레임·텍스처 반복 규칙은 charselect/modeselect 규칙 범위 [미확정] |
| 선택지 칸 창 폭 | FUN_710031e360 식(min(원래 폭, 최대 글자 폭+130), ≥232)을 나눈 창 9조각에 적용(왼쪽 고정) | 웹 글자 폭은 캡처보다 약 17% 넓다(아래 11절) → 칸이 캡처보다 넓을 수 있다 |
| 반복 입력 | mgmcommon MgmInput(RepeatGen 24/6f [근사]) | 원본 반복 간격 [미확정] |
| GameFlag/SaveFlag | 시험값(기본: 0x20·0x22 꺼짐, SaveFlag 모두 꺼짐 → 첫 안내 없음) | 저장 데이터 없음 |
| 기본값 | TurnMax 10, BonusStarType 1, flag4·6 = 1, flag7·8 = 0, ComLevel 1, 핸디캡 0, BoardID 6 | 캡처 두 장의 표시와 Setup 기본 보드 [참고 이미지] |

### 9.4 구현 순서
에셋 변환 → mgmcommon 추가(선택지·글꼴) 후 공용 시험 → 순수 상태기계(member·rule·flow) + 시험 → 뷰 → 페이지·UIS → 전체 시험·tsc·빌드 → 헤드리스 1회.

## 10. 검증 코드·실행 결과·기대값

한 것(분석 단계): 디컴파일 판독(2절 파일), 어셈블리 예외 4곳 `analysis/decomp/partyrule_menu01_dis.c` — SetupTurn 분기·표(C 의 switch 본문 없음), SetHandicapValue 인자(문구 라벨 0x7100162e93 `mn01_bd_ui_member_handi`), SetComLevel/SetComSpeed 삽입 라벨(C 에서 빠짐), CheckMemberImpl·StateMessageImpl·Cursor 의 메시지 창 bool 인자(ManualClose 1·CancelEnable 1·DisablePadInput(0,0)/(1,0)·ForceAllDraw 0/1·RequestNextMessage 1), Finish SetTurnMax 인자, 제목·띠 레이아웃 이름. 데이터 실행: `partyrule_strings.py`(60 문자열), `msgwin_atr.py koKR menu01_mode`(WT_Empty 306·WT_Model 103·WT_Taking 34), `partyrule_web_assets.py`(레이아웃 26·텍스처 38·문구 264·속성 47). 원본 실행 없음.

구현 단계 기대값(합성, `web/tools/test_partyrule.ts`):
- 턴 10/12/15/20/25/30/7 → 표시 (10,90)(12,100)(15,120)(20,150)(25,180)(30,210)(15,120).
- 사람 3·COM 1: 난이도 칸 00..03 보임·04/05 숨김, merge 4; COM 3(난이도 같음): 00·05 보임, merge = 값.
- 멤버 설정 아래 키 네 번 → 행 0→1→2→3→0(순환), 핸디캡 행 A → 편집, 위 → 1P 값 1, B → 값 0 유지(취소), A → 저장.
- 규칙 확인: 선택지 위 키(커서 0) → 이동 없음(순환 없음), 아래 두 번 → 2(뒤로), A → 결과 1(뒤로) → 멤버 확인으로.
- 플레이 방법: 턴 오른쪽 → 15, B → TurnMax 15·규칙 확인에서 약 120분.

결과(2026-10-07, 구현 단계):
- `npx tsx tools/test_partyrule.ts` 106/106(표·라벨, 멤버 확인 선택지·끝에서 멈춤, 멤버 설정 칸 배치·행 순환, 핸디캡 취소/저장, 난이도·속도, 닫기 저장 Menu+0x20..0x24, 규칙 확인 글자(10·약 90분·있음), 플레이 방법 턴 순환·press 애니 중 입력 무시·B 저장 → 약 120분, 스타트! DECI_L, B 취소 = 뒤로, COM 3 합친 칸). 공용 수정 뒤 test_mgmcommon 99/99·test_msgwin 52/52·check_mgmcommon 12914/12914(partyrule 레이아웃·텍스처·글꼴·소리·import 경계 포함, 덤프 없는 mncom_* 1개 건너뜀), test_mgmet 198/198·test_mgm01 181/181·test_mgmscreens 38/38·charsel 55/55·2207/2207·modesel 71/71·1068/1068·mg1801 통과, tsc 기존 serve.ts 2개만, 빌드 통과.
- 헤드리스 `tools/shot_partyrule.ts` → `test/out/partyrule/01_member_handicap.png`·`02_check_rule.png`·`03_setting_rule.png`, 콘솔 오류 0. 캡처와 같음: 행·얼굴·CPU 표시·"-" 칸·보통·없음·설정 완료 위치, 메시지 띠·문구, 제목 띠가 메시지 위, 선택지 오른쪽 위 3칸(커서 분홍 스타트!), 오른쪽 규칙 판 행 위치, 보드 이름 띠. 다름: 판이 불투명 흰색(캡처는 반투명 흐림), "약 90분" 말풍선 꼬리·크기, 점선, 글자 폭 약 17% 넓음(11절) — 공용 렌더 규칙 범위.

## 11. 미확정 사항과 추가 분석에 필요한 근거

| 항목 | 상태 | 필요한 근거 |
|---|---|---|
| 멤버 확인 판(ComUiBdCheckMember, `mn01_win_membercheck_02`) | 범위 밖 — 함수 목록·문구 라벨만 확인 | Setup*·Set* 판독(멤버 설정과 같은 칸 규칙 [추정]) |
| 캐릭터 고르기 판(bq::ComUiSelectPlayerCharacter)·RandomComCharacter | 범위 밖 | main 공용 클래스 분석 |
| 원본 반복 입력 간격(GetRepeat) | [미확정] | bex InputModule 반복 설정 |
| x_icon_level 의 vt+0x128(0, f) 의미 | [추정] 텍스처 V 오프셋(텍스처 4칸 세로·노드 UV 0..0.25 와 맞음) | ComUiBase vtable +0x128 판독 |
| FlagForceAllDraw 효과 | [미확정](message_window.md 와 같음) | |
| SetComLevel·SetBoardHandicap 의 Setup 기본 핸디캡 인자 | Setup @0x71000410c8 의 SetBoardHandicap 인자 C 에서 빠짐 [미확정, 0 으로 둠] | 어셈블리 |
| GyroControllerConfigFiber·StartAnim(14)·온라인 동기 | 범위 밖 | |
| 메시지 창 COM 선택(FUN_7100319a80) 의 목표 칸 +0x440 writer | [미확정] — 이 화면은 owner 가 사람이라 쓰지 않음 | main 판독 |
| 웹 글자 폭(공용 `measure`·글자 그리기) | 캡처보다 약 17% 넓다 [참고 이미지 계산: "이 설정으로 파티를 시작해도 될까요?" 캡처 567 px ↔ 웹 측정 675 px(51.68 px 글꼴), "플레이 방법 설정" 209 ↔ 253 px] — 판 행·얼굴 위치는 캡처와 1 px 안쪽으로 맞으므로 배율 착오가 아니라 글자 진행폭(adv × 글꼴 크기 / 셀 폭) 규칙 차이 [미확정]. 공용(mgmcommon·charselect) 규칙이라 이 화면에서는 고치지 않음 | GuiLayoutText 글자 폭 판독(05_ui_input.md 5절) 또는 원본 실행 캡처 대조 |
| 선택지 `x_parts_NN/%s`(+0x6d8 문자열) 페인 이동 | FUN_710031e360 이 폭 차이만큼 옮기는 페인 이름 [미확정] — 웹은 옮기지 않음 | +0x6d8 writer 판독 |
| 판 바탕 투명도(흐림 창 blur + win 재질) | 웹은 불투명 흰색으로 보임 — 캡처는 반투명 [참고 이미지]. modeselect.md 6.2 흐림 규칙·창 재질 알파 범위 [미확정] | 원본 실행 대조 |
