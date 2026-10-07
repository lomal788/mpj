# 메시지 창 (bq::ComUiMessageWindow) — 원본 분석

2026-10-07. 상태: **분석 완료(판독·데이터). 웹 구현 없음, 원본·웹 실행 대조 없음.**
형식은 `F:/dev/mps/web/docs/분석.txt` 11절 구성. 모드 화면이 이 창을 여는 흐름(MessageFlow/AutoMessageFlow)은 [mgm_common.md](mgm_common.md) 5.3절, 레이아웃 재생·그리기 규칙은 [charselect.md](charselect.md) 6.4·6.5·12절과 [modeselect.md](modeselect.md) 6.1·6.2절, 메시지 태그·폰트·입력 비트는 [../engine/05_ui_input.md](../engine/05_ui_input.md), 소리 재생·FSAR·프리셋은 [../engine/04_sound.md](../engine/04_sound.md) 를 그대로 쓴다. 이 문서는 **이 창 고유 동작만** 적는다.

확정 수준: **[판독]** 디컴파일 C, **[판독: 어셈블리]** C 가 반환·덮어쓰기를 잘못 보인 두 곳(넘김 판정 FUN_7100318030, 글자 속도 FUN_7100322e40)만 명령 확인, **[데이터]**, **[추정]**, **[미확정]**, **[실행: 변환]** 자체 도구 실행.
주소는 main NSO(0x7100000000 베이스). `FUN_` = 이름 없는 함수, **[웹 이름]** = 이 문서가 붙인 이름.

---

## 1. 기능 개요와 사용자에게 보이는 동작

화면 위/아래에 뜨는 대화 창. 메시지 라벨 하나 = 한 페이지. 창이 열리고(in 5f), 글자가 한 글자씩 나오며(글자마다 짧은 소리), 다 나오면 오른쪽 아래 화살표가 흔들리고, 사람이 A 를 누르면 다음 페이지(또는 닫힘 out 5f). 글자가 나오는 중 A 를 누르면 그 페이지가 즉시 다 나온다. 화자가 있으면 왼쪽 위에 이름표(Name 형식) 또는 얼굴 아이콘(Normal 형식)이 붙고, 첫 페이지에 화자 목소리(감정별)가 난다.

| 요소 | 보이는 것 | 근거 |
|---|---|---|
| 창 | `sys_meswin_00` 등 bq `Parts.lyt` 레이아웃. 메시지마다 속성(ATR1 WindowType)으로 고른다 | [판독 FUN_710031a480][데이터 messageWindowList.json] |
| 위치 | 9방향 배치(x_bd_00 경계 기준) + 메시지 속성 OffsetX/Y(또는 SetOffset 값) | [판독 FUN_71003188c0·ComUiBase::SetPlace·FUN_710031d7e4] |
| 글자 | 기본 0.05 s/글자(설정 '느림' 0.1, '빠름'·온라인 = 즉시), Wait_Scale 태그로 글자별 배율 | [판독: 어셈블리 FUN_7100322e40] |
| 넘김 | 페이지 다 나오고 0.2 s 뒤부터 A(마스크 +0xc8, 기본 0x1). 조작 소유자가 COM 이면 그 뒤 0.667 s 에 자동 | [판독: 어셈블리 FUN_7100318030, FUN_71003194c0] |
| 소리 | 글자마다 `SQ_SE_SYS_MES_PUT`(모드 장면 프리셋이 `SQ_VOI_SYS_MES_PUT` 로 바꿈), 넘김 `SQ_SE_SYS_MES_PROC`, 첫 페이지 화자 보이스(vo_message.ftrg) | [판독][데이터 bspp·fspj] |
| 모드 화면 | 미니게임 모드 메시지 = `WT_Name`(이름표, 대부분 `Bottom_Center`) 또는 `WT_Empty`(얼굴 아이콘) | [실행: 변환 `analysis/msgwin_atr_koKR.txt`] |

## 2. 분석 대상 원본·자료 위치

| 항목 | 위치 |
|---|---|
| 코드 | main `bq::ComUiMessageWindow` ctor @0x7100314254 ~ @0x71003214bc, 글자 표시 객체(이름 없음) @0x71003224c0~@0x71003237dc, vtable 0x71019e4ce8(메시지 핸들러 [11]+0x58 = FUN_71003152ec), 창 데이터 `UiMessageWindowDataModule` @0x71002cb6e0~@0x71002ceb00, 메시지 속성 `MessageModule::GetAttr*` @0x71001dd250~0x71001dd6e0·@0x71001df710~0x71001df8a4, 배치 `ComUiBase::SetPlace` @0x710020c8d4 |
| 디컴파일 | `analysis/decomp/msgwin_main_all.c`(범위 0x7100313f00~0x7100323850 151함수), `msgwin_main_vt.c`(vtable), `msgwin_main_datamodule.c`(창 데이터·속성), `msgwin_main_msgattr.c`(ATR 바이트 위치), `msgwin_main_setplace.c`, `msgwin_main_dis1.c`·`_dis2.c`(어셈블리 2곳), 소리: `msgwin_main_soundgroup*.c`·`_soundcfg.c`·`_fadeset_callers.c`·`_sndgroupset*.c`·`_userparam*.c`·`_sndplay*.c`, 위치 상수: `msgwin_mgmet_msgofs.c`·`msgwin_main_msgofs_got.c` |
| 데이터 | 창 목록 `extracted/bea/bq.nx.bea/common/data/messageWindowList.json`(덤프 `analysis/msgwin_windowlist.txt`), 레이아웃 bq Parts.lyt(덤프 `extracted/converted/ui/bq_Parts/sys_meswin_*`), 메시지 속성 정의 `message~mess.nx.bea/mess/bin/bq.msbp`, 메시지 `message~koKR.nx.bea/mess/bin/koKR/*.msbt`(ATR1 덤프 `analysis/msgwin_atr_koKR.txt`), 보이스 트리거 `bq.nx.bea/common/ftrg/vo_message.ftrg`, 소리 프리셋 `audio.nx.bea/audio/settingpreset/sound_settingpreset.bspp`(덤프 `analysis/msgwin_sound_presets.json`) |
| 도구 | `web/tools/analysis/msgwin_atr.py`(ATR1 → 이름, 새로 씀), `sound_preset.py`·`sound_fsar.py`(기존), Ghidra `mgmcommon_ghidra*.sh` + `ghidra_scripts/MgmcommonDecompCreate·Data·Str·FindPage·SymRefs·InsnSearch.java` |

## 3. 진입점과 전체 호출 흐름

```
(엔티티 생성) AddComponent<ComUiMessageWindow>                       ctor @0x7100314254: 레이아웃은 아직 없음
SetMessageLabel(label) / AddMessageLabel(label)                      페이지 목록 +0x140(0x30 B 씩) = 라벨 하나 = 페이지 하나
SetInsert*/SetChoice*/SetOwnerPlayer/SetTalkSkipPlayer/DisablePadInput/SetOffset
Start @0x710031e660:
   페이지 0개 → 즉시 끝 처리(FUN_7100318340)
   +0x434(선택 커서)·+0x448(안내 결과) = −1, +0x50b(선택형) = +0x50d, IsOut = 0
   FUN_710031a480(page 0)   ← 레이아웃 고르기·생성·배치·화자 표시(4.2·6.1)
   FUN_7100318244           ← 글자 객체 비움, 글자 페인·그림자·화살표 숨김
   상태(+0x28) = (이전 상태 == 2) ? 1 : 0,  하위 단계(+0x2c) = 0,  +0x513 = (이전 상태 != 2)  ("새로 열림")
   창 형식(+0x80)이 5(Announce)·6(Subtitle) 이 아니면 DuckingGroup(그룹 0x13, 더킹 0x13, 켬)
매 프레임 메시지 0x5f454e00 → FUN_7100315328:
   상태 0 → FUN_71003153e8 (열기)   상태 1 → FUN_7100315630 (페이지)   상태 3 → FUN_7100315e5c (닫기)
   FUN_7100315fe0 (위치 갱신)  FUN_71003161d0 (Talking 꼬리)  FUN_7100316720 (Model 3D)
   글자 객체 갱신 FUN_71003237dc (6.3)
Out @0x7100316f38: 상태가 −1 이 아니고 < 4 이면 상태 3·하위 0, IsOut = 1, 넘김 대기 0, 더킹 0x0d·0x13 해제
```

## 4. 구조체·필드·상수 표

### 4.1 ComUiMessageWindow (this) 주요 필드 [판독]

| 오프셋 | 형식 | 웹 이름 | 뜻 | writer | reader |
|---|---|---|---|---|---|
| +0x28 | s32 | `state` | −1 쉼, 0 열기, 1 페이지, 2 끝(창 남음), 3 닫기 | Start·Out·갱신 | IsEnd·IsWorking·GetCurrentMessageNo |
| +0x2c | s32 | `sub` | 상태 안 하위 단계 | 갱신 | 갱신 |
| +0x38..0x48 | WeakHandle<Entity> | `layoutEntity` | 현재 창 레이아웃 엔티티(ComUi) | FUN_710031a480 | FUN_7100316af0(레이아웃 얻기) |
| +0x80 | s32 | `windowType` | 0 Normal, 1 NormalSmall, 2 Name, 3 NoneChara, 4 Talking, 5 Announce, 6 Subtitle, 7 Model (FUN_71002ccc7c 문자열 → 번호) | FUN_710031a480 | 전부 |
| +0x88..0x98 / +0xb8 | vector / s32 | `owners` / `owner` | 넘김 입력을 받는 플레이어 목록 / 한 명(−1 = 목록 사용) | SetOwnerPlayer(s) | 넘김·스킵 |
| +0xbc | s32 | `talkSkipPlayer` | −1 이 아니면 페이지 시작 때 owner 를 이 값으로 바꿈 | SetTalkSkipPlayer | FUN_7100316fb0 |
| +0xc0 / +0xc4 | s32 | `pcId` / `npcId` | 화자(CharaType "PC" 면 PC 번호, 아니면 NPC 번호) | FUN_710031a480 | 이름표·높이 |
| +0xc8 | u32 | `nextMask` | 넘김·스킵 버튼 마스크. 생성자 기본 **0x1(A)** | ctor·FUN_710031e8bc | 넘김·스킵 |
| +0xcc | s32 | `place` | 배치 번호 0..8, 9 = Default(창 형식 기본 위치 사용), −1 없음 | FUN_710031cab8 | FUN_7100315fe0 |
| +0xe0 / +0xf0 / +0x100 | Vector3f | `absPos` / `pageOffset` / `userOffset` | 절대 위치(0 이 아니면 덮어씀) / 페이지 오프셋 / SetOffset 값 | | 6.1 |
| +0x130 | ptr | `text` | 글자 표시 객체(본문·그림자 두 개, 6.3) | FUN_7100316fb0 | 갱신 |
| +0x140..0x148 | vector(0x30) | `pages` | 페이지(라벨 문자열 + 삽입 목록) | Set/AddMessageLabel | 전부 |
| +0x428 | s32 | `page` | 현재 페이지 번호 | | GetCurrentMessageNo |
| +0x430 / +0x434 | u32 / s32 | `choiceCount` / `choiceCursor` | 선택지 수(≤4) / 커서 | SetChoiceCount·입력 | |
| +0x504 | u8 | `padDisabled` | 패드 입력 막음(넘김·스킵 안 됨) | DisablePadInput(a, ·) | |
| +0x505 | u8 | `noNextWait` | 넘김 대기 자체를 하지 않음 | DisableNextKeyWait | 페이지 단계 2 |
| +0x506 / +0x507 | u8 | `nextRequested` / `skipRequested` | RequestNextMessage(b) 요청 | RequestNextMessage | FUN_7100318030 |
| +0x508 | u8 | `nextInputWait` | 페이지 다 나와 넘김 대기 중 = IsNextInputWait | 페이지 단계 1→2 | 흐름 함수 |
| +0x50a | u8 | `isOut` | Out 됨 = IsOut | Out·끝 | |
| +0x50b | u8 | `choice` | 선택지 페이지 | Start | |
| +0x513 | u8 | `freshOpen` | 새로 열림(첫 페이지 보이스 판단) | Start·Out | FUN_710031fe30 |
| +0x516 | u8 | `arrowWhenDisabled` | 패드 막혀도 화살표 보이기 | DisablePadInput(·, b) | 화살표 |
| +0x518 / +0x51c | f32 | `inputLock` / `comTimer` | 페이지 시작 때 0.2 / 0.6667(0x3e4ccccd/0x3f2aaaab) | FUN_7100316fb0 | 6.2 |

### 4.2 창 형식 표 (messageWindowList.json WindowData) [데이터 `analysis/msgwin_windowlist.txt`]

메시지 속성 WindowType(ATR +0x0d, 목록 `WT_Empty, WT_Taking, WT_Icon, WT_IconSlim, WT_Name, WT_NoneChara, WT_Model, WT_Announce, WT_Subtitle`) 의 **번호 = WindowData 칸 번호** [판독 FUN_71002ccf80: 0x100 B 레코드, +0 Type, +0x40 DefaultPosition, +0x80 Layout00, +0xc0 Layout01].

| ATR | Type(+0x80) | 기본 위치 | Layout00(일반) | Layout01(선택지) | 화자 표시 |
|---|---|---|---|---|---|
| 0 WT_Empty | Normal(0) | Top_Center | sys_meswin_00 | sys_meswin_choices_00 | 얼굴 아이콘 |
| 1 WT_Taking | Talking(4) | Top_Center | sys_meswin_talk_00 | sys_meswin_talk_choices_00 | 말꼬리(3D 화자 방향) |
| 2 WT_Icon | Normal(0) | Top_Center | sys_meswin_00 | sys_meswin_choices_00 | 얼굴 아이콘 |
| 3 WT_IconSlim | NormalSmall(1) | Top_Center | sys_meswin_01 | sys_meswin_choices_01 | 얼굴 아이콘 |
| 4 **WT_Name** | Name(2) | Top_Center | sys_meswin_00 | sys_meswin_choices_00 | **이름표** |
| 5 WT_NoneChara | NoneChara(3) | Top_Center | sys_meswin_00 | sys_meswin_choices_00 | 없음 |
| 6 WT_Model | Model(7) | Top_Center | sys_meswin_model_00 | sys_meswin_model_choices_00 | 3D 모델 |
| 7 WT_Announce | Announce(5) | Top_Center | sys_meswin_announce_00 | sys_meswin_announce_choices_00 | (줄 수로 창 크기) |
| 8 WT_Subtitle | Subtitle(6) | Bottom_Center | sys_meswin_subtitle_00 | (없음) | |

**미니게임 모드 메시지에서 실제로 쓰는 것** [실행: 변환 `web/tools/analysis/msgwin_atr.py` → `analysis/msgwin_atr_koKR.txt`]: mgm01~06·mgmet·mg_common 의 레코드는 `WT_Empty`(Character CH_None, Position Default)와 `WT_Name`(대부분 Bottom_Center, 일부 Top_Center) 두 가지뿐이다. WindowInfo 는 모두 WI_None.

| 파일 | WT_Name 화자(위치, 개수) |
|---|---|
| mgm01 | CH_NPC022_GREEN·BLUE(Bottom_Center 각 1) |
| mgm02 | CH_NPC003 노코노코(Top_Center 23, Bottom_Center 3), CH_NPC022_GREEN(7) |
| mgm03 | CH_NPC017 쥬게무(30), CH_NPC022_GREEN(7) |
| mgm04 | CH_NPC097 붕붕(Bottom 31·Top 14), CH_NPC022_GREEN(9) |
| mgm05 | CH_NPC116 뿡뿡(27), CH_NPC022_GREEN(1) |
| mgm06 | CH_NPC022_GREEN(13), CH_NPC103 가짜 쿠파(9) |
| mgmet | CH_NPC022_GREEN(10)·NPC097(6)·NPC116(4)·NPC022_BLUE(3)·NPC003(3) |

화자 표 CharacterData(52칸; ATR Character 목록은 50칸, 같은 순서로 읽힘 — 앞 6칸·위 화자 이름 일치 확인 [데이터], 뒤 2칸 차이는 [미확정]): `CH_NPC022_GREEN` = キノピオ(緑), VoiceID CH_NPC022_GREEN, IconTexture mw_face_64_npc22_g. 나머지 모드 화자는 IconTexture `face_dummy`.

### 4.3 sys_meswin_00 레이아웃 [데이터 bq_Parts 덤프]

| 페인 | 위치·크기 | 쓰임 |
|---|---|---|
| `x_bd_00`(bnd1) | (0, −45) 1920×450 | **배치 경계**(SetPlace 기준) |
| `null_00/blur`·`win_base`(wnd1) | 1000×240 | 창 패널(흐림 + 바탕, modeselect.md 6.2 규칙) |
| `x_icon`(→ base_face·x_face 74×74) | (−475, 110) + (55, 0) | 얼굴 아이콘 |
| `x_name`(→ x_base_name 120×46 왼쪽 기준, x_text_name bqfont_small) | (−475, 110) | 이름표. 폭 = 이름 글자 폭 + 60 [판독 FUN_710031db1c] |
| `x_text`·`x_text_shadow` | 900×160, bqfont_small(_shadow) | 본문(두 개를 같은 내용으로 따로 진행) |
| `x_cursor`(prt1 = sys_meswin_arrowicon_00) | (0, −120) 48×36 | 넘김 화살표("normal" 120f 반복) |
| `x_alignment_guide`/`x_guide_00·01` | (0, −87) | 안내 버튼(SetGuide*) |

애니 [데이터]: sys_meswin_00 `in` −5..0(5f, Null_all 정점색), `normal` 15..16(1f), `out` 25..30(5f). 선택지판 sys_meswin_choices_00 은 같은 본문 + `null_01/x_alignment_00/x_parts_00..03`(sys_meswin_arrowchoices_00: on 9f, cursor 119f 반복, off 1f, press 29f, disable·normal 0f), `in_choice` 30f.

## 5. 상태 전이와 전체 수명 [판독]

```
상태 0 (열기) FUN_71003153e8
  하위 0: 레이아웃 보이기(+0x136=1), "in" 재생, x_cursor 숨김 → 하위 1
  하위 1: (Model 형식이면 3D 불투명도 = in 진행률) in 끝(PlaybackState 3) → 페이지 점프 요청(+0x42c) 처리 → 상태 1·하위 0
상태 1 (페이지) FUN_7100315630
  하위 0: "normal" 재생, FUN_7100316fb0(page): 글자 객체 새로 만듦·삽입 적용·속도 설정(6.3)·보이스(6.5)·오프셋(6.1)
          inputLock = 0.2, comTimer = 0.6667  → 하위 1
  하위 1: 글자 객체 "빨리 감기" 플래그 = !+0x514 && (선택형 || +0x509)
          skipRequested(+0x507) 이면 바로, 아니면 페이지 완료(6.3 isDone)까지 대기
          → 로컬 사람 소유자 있음 플래그(+0x511) 계산, 선택형이면 "in_choice"·선택지 칸 애니, 안내 정렬
          → nextInputWait(+0x508) = 1  → 하위 2                               ← IsNextInputWait 이 1 이 되는 프레임
  하위 2: noNextWait 면 아무것도 안 함(밖에서 RequestNextMessage/Out)
          inputLock ≤ 0 이고 소유자가 전부 COM 이 아니면: x_cursor(화살표) 보이기 = !padDisabled || arrowWhenDisabled
          (Model 형식 대기 모션 타이머 +0x538/+0x534)
          FUN_7100318030(넘김 판정, 6.2) 참 → 콜백 +0x760, nextInputWait = 0, 하위 3,
                 선택형이 아니고 화살표가 보이면 SQ_SE_SYS_MES_PROC
          플레이 모드 7 이고 로컬 사람 소유자가 없으면 화살표·선택지 커서 숨김
  하위 3: 다음 페이지가 있으면(FUN_7100318144: 점프 +0x42c 우선, 아니면 page+1) FUN_710031a480(새 페이지)·하위 0
          (창 형식이 바뀌면 레이아웃 다시 만듦) 
          없으면: 메시지 WindowInfo 가 StayOpen 이거나 +0x510 이면 → 끝 처리(FUN_7100318340)·상태 2(창 남음)
                  아니면 → 상태 3(닫기), IsOut = 1, 더킹 0x0d·0x13 해제
상태 3 (닫기) FUN_7100315e5c
  하위 0: 글자·화살표 숨김, "out" 재생 → 하위 1
  하위 1: out 끝 → 레이아웃 숨김(+0x136=0) → 하위 2
  하위 2: 끝 처리(페이지·선택지·삽입 비움, 오프셋 0), 상태 −1, 콜백 +0x790
```
- `IsEnd` = 상태 −1·2·≥4, `IsAllTalkEnd` = 상태 > 2 또는 (마지막 페이지이고 글자 완료). 페이지 번호는 상태 1 에서만 유효(그 밖 −1). 이 정의로 mgm_common.md 5.3 의 흐름 함수가 동작한다.
- 열기 5f + 페이지 + 닫기 5f. `normal` 재생은 페이지마다 다시 한다.

## 6. 계산식·조건·상세 의사코드

### 6.1 레이아웃 고르기·배치 [판독 FUN_710031a480·FUN_710031cab8·FUN_7100315fe0·FUN_71003188c0·SetPlace·FUN_710031d7e4]

```
wt = ATR WindowType(page label) (라벨 속성 없으면 0)
windowType = WindowData[wt].Type → 번호;  화자 = CharacterData[ATR Character]: CharaType "PC" → pcId = PC 번호, 아니면 npcId
layoutName = 선택형 ? WindowData[wt].Layout01 : Layout00
창 형식·선택형이 바뀌었으면 엔티티(이름 = layoutName) 새로 만들고 ComUi("Parts.lyt", layoutName), 그리기 순위 0x9200, 숨김으로 시작
place = PositionData 이름 → 번호(Top_Left 0 … Bottom_Right 8, Default 9) (ATR Position)
매 프레임 FUN_7100315fe0: place ≠ 9 → 그 번호;  place == 9 이고 Talking 이 아니면 → WindowData[wt].DefaultPosition
FUN_71003188c0(p): ComUi.SetTranslation(0); ComUi.SetPlace(p); 엔티티 위치 += pageOffset; absPos 가 0 이 아니면 엔티티 위치 = absPos
SetPlace(p) (ComUiBase, x_bd_00 크기 W×H·위치 bx,by; 표 @0x71015d76a4 = {(0,3),(1,3),(2,3),(0,1),(1,1),(2,1),(0,4),(1,4),(2,4)}):
   가로 0(왼) x = −(1920−W)/2 − bx,  2(오른) x = (1920−W)/2 − bx,  그 밖 x = 0
   세로 3(위) y = (1080−H)/2 − by,  4(아래) y = −(1080−H)/2 − by,  그 밖 y = 0
pageOffset (페이지마다) = (ATR OffsetX, ATR OffsetY, 0); 단 userOffset(SetOffset)의 x 나 y 가 0 이 아니면 userOffset 으로 덮어씀
```
- sys_meswin_00(W 1920, H 450, by −45): **Bottom_Center → (0, −270)**, Top_Center → (0, +360) [계산].
- 모드 장면은 `MESSSAGE_WINDOW_OFFSET` = (0, 0, 0)(mgm_common.md 4.3) 을 SetOffset 하므로 **메시지 속성 OffsetX/Y 가 쓰인다**.

### 6.2 넘김 판정 FUN_7100318030 [판독: 어셈블리 `msgwin_main_dis1.c`]

```
inputLock −= dt;  inputLock > 0 → 거짓
nextRequested(+0x506) → +0x506·+0x507 = 0, 참              ← RequestNextMessage (AutoMessageFlow 3.0 s)
선택형이 아니면 → FUN_71003194c0:
    owner == −1 (목록):  각 소유자: COM(PlayerType 1) → comTimer −= dt(한 번), ≤ 0 이면 넘김
                                   사람 → InputModule::IsTrigger(pid, nextMask) 면 넘김
                         안내 버튼(+0x50e): GetTrigger & 안내 마스크 → 안내 결과(+0x448), SQ_SE_SYS_DECI_S
    owner 한 명:        comTimer −= dt; COM 이고 comTimer ≤ 0 → 넘김
                         사람(또는 COM 이고 타이머 남음) → IsTrigger(owner, nextMask) → 넘김, (안내 버튼이면 SQ_SE_SYS_DECI_S + 진동 bv_vib_sys_deci)
선택형:  owner == −1 → 거짓;  owner COM → FUN_7100319a80(0.6667 s 뒤 자동 결정·커서 이동);  사람 → FUN_71003197d0(6.4)
```
- **넘김 버튼 = A(0x1)**(마스크 +0xc8 기본값, `FUN_710031e8bc` 로만 바뀜 — 모드 장면은 안 부름 [판독: 쓰는 곳 2곳]).
- **누가 조작하는지** = owner. MinigameModeScene 은 OpenMessage 에서 owner = talkSkip = `bq::mgm::GetOperationPlayerId(false)`(mgm_common.md 6.10)를 넣고, OpenAutoMessage 에서는 −1·패드 막음 → 사람 입력으로는 넘어가지 않고 장면의 RequestNextMessage 만 받는다.
- 사람 소유자: 페이지 완료 후 **0.2 s 이전의 A 는 버려진다**(그 사이 IsTrigger 를 보지 않음). COM 소유자: 0.2 s + 0.6667 s ≈ 0.867 s 뒤 자동.

### 6.3 글자 표시 객체 (+0x130) [판독 FUN_7100323064·FUN_71003224c0·FUN_7100322e40·FUN_7100322bd0·FUN_7100322d40·FUN_71003237dc·FUN_7100323660]

```
생성: 본문(x_text) 진행기 + 그림자(x_text_shadow, FUN_710031f990 = "%s_shadow") 진행기. 폰트 이름에 "_shadow" 가 있으면 루비 폰트도 bqfont_ruby_shadow
페이지 시작 FUN_7100322e40 (두 진행기 모두; 글자 소리 +0x72 는 본문만 1):
   문구를 UTF-16 버퍼(최대 0x200 글자)로, typing(+0x70) = 1, count(+0x74) = 0, after(+0x88) = 0
   if Net::IsSessionConnected():                    interval = 0, count = 0x201 (전부 즉시)
   else s = (+0x90 덮어쓰기 ? +0x94 : SaveData SystemData+0x74):
        s == 2 → interval 0.1;   s == 1 → interval 0, count = 0x201 (즉시);   그 밖 → interval 0.05
   scale = 1.0 (count 위치에 Wait_Scale 태그[그룹 3 종류 0]가 있으면 그 f32);  timer(+0x84) = interval × scale
매 프레임 FUN_7100322bd0:
   typing == 0 이면 after += dt (상한 +0x8c, 기본 0)
   while count < 0x200:
       timer −= dt;  if timer ≥ 0: break
       count += 1;  scale = 그 글자 위치의 Wait_Scale(없으면 직전 값);  timer = interval × scale
       본문이면 SQ_SE_SYS_MES_PUT 재생
   (typing 중이면) FUN_7100322d40: 앞 count 글자 + "여기부터 숨김" 태그(그룹 0 종류 0x20) 로 표시 문구를 다시 만듦,
                                  끝까지 다 들어가면 typing = 0
isDone = after ≥ +0x8c && typing == 0      (= FUN_71003235f0, 페이지 단계 1 이 기다리는 조건)
스킵 FUN_7100323660 (typing 중, +0x60 켬, 패드 막힘 아님):
   스킵 플레이어(owner 또는 목록의 사람)가 IsTrigger(+0x5c = nextMask) → count = 0x201 (남은 글자 즉시)
```
- **timer 는 더하지 않고 다시 대입한다** → 남은 소수 시간이 버려진다. 60 fps 에서 0.05 s 는 대략 3프레임마다 1글자(f32 경계에서 3 또는 4), 0.1 s 는 6프레임마다 [판독 + 계산, 원본 실행 확인 없음].
- 같은 프레임에 글자가 여러 개 나오려면 interval × scale < dt 여야 한다(Wait_Scale 이 작을 때).
- 설정 값 0/1/2 의 메뉴 이름(보통/빠름/느림)은 [추정].
- 줄 나눔·색·루비·아이콘 글리프·삽입 태그 처리는 GuiLayoutText(엔진, 05_ui_input.md 5절). 이 창이 직접 해석하는 태그는 **Wait_Scale(글자 속도 배율)** 과 내부용 숨김 태그뿐이다 [판독].
- 페이지 나눔: 라벨 하나 = 페이지 하나(AddMessageLabel 이 라벨을 덧붙임). 문구 안 페이지 나눔 태그로 자르는 코드는 이 창에 없다 [판독 AddMessageLabel @0x710031ea90].

### 6.4 선택지 (사람) FUN_71003197d0 [판독]
선택지 레이아웃의 `in` 끝을 기다린 뒤: `trig & nextMask` → SetDecideChoice(커서)(칸 "press", 칸별 SE 또는 SQ_SE_SYS_DECI, 진동 bv_vib_sys_deci); `trig & 0x2`(B) 이고 취소 가능(+0x515) → SQ_SE_SYS_CANCEL; 위 0x20800/아래 0x80400 → 사용 불가(+0x1e8) 칸을 건너뛰며 이동(끝에서 멈춤), 바뀌면 SetSelectChoice(칸 on/off → cursor/normal, 칸별 SE 또는 SQ_SE_SYS_CURSOR Play2D(칸 위치), 진동 bv_vib_sys_cursor). 선택지를 열 때 BGM 더킹(그룹 0x0d, 더킹 0x0d 켬). 결과 = GetChoiceResult. (모드 장면 PrepareMessage 는 2지선다만 넣는다 — mgm_common.md 5.3.)

### 6.5 화자 표시·보이스 [판독 FUN_710031cab8·FUN_710031d984·FUN_710031db1c·FUN_710031de00·FUN_710031fe30]

| 창 형식 | 표시 |
|---|---|
| Normal·NormalSmall | x_name 숨김, x_icon 보이기, x_face 텍스처 = UiSharedTexture `"<IconTexture>^u"`(없으면 `face_dummy^u`) |
| **Name** | x_icon 숨김, x_name 보이기, x_text_name = `sys_mw_name` 에 "Text0" ← CharacterData 의 PC/NPC 이름 라벨, x_base_name 폭 = 글자 폭 + 60·높이 = 글자 높이 |
| NoneChara | 둘 다 숨김 |
| Announce | 줄 수(CRLF 수 + 1)로 x_00/x_01/x_02 판 하나 고름·화살표 위치 |

보이스(페이지 시작마다): 엔티티 "MW_FxTrigger" + `common/ftrg/vo_message.ftrg`. 키 = ATR VoiceKey 문자열, 비었고 **새로 열린 창(+0x513)** 이면 Emotion(ATR +0x10) 의 VoiceKey_Normal(선택형이면 VoiceKey_Choices), Enum `vo_characterId` = CharacterData VoiceID. 키가 있으면 `ComFxTrigger::Play(키)` → 트리거가 `SQ_VOI_<NPC>_MV_<감정>[_01..03]` 를 낸다 [데이터: vo_message.ftrg 문자열]. 모드 메시지는 Emotion 기본 → `VO_MV_ETC` [추정: ATR Emotion 값 미집계]. 변형 고르기는 [미확정].

## 7. 애니메이션·소리·에셋 연결

| 시점 | 소리 | 비고 |
|---|---|---|
| 글자 하나 | `SQ_SE_SYS_MES_PUT` | 메인 프로젝트에 이 라벨이 없다 [데이터 fspj]. 모드 장면 프리셋(mgm01~06·mgmet)과 대부분 장면 프리셋의 U 레코드가 **`SQ_VOI_SYS_MES_PUT`**(볼륨 30, PLY_VOI_MES_PUT)로 바꾼다 [데이터 `analysis/msgwin_sound_presets.json`] |
| 넘김(화살표 보일 때) | `SQ_SE_SYS_MES_PROC` | 볼륨 72, PLY_SE_SYS |
| 선택지 이동·결정·취소 | `SQ_SE_SYS_CURSOR`(110)·`SQ_SE_SYS_DECI`(110)·`SQ_SE_SYS_CANCEL`(110) | 칸별 SE 지정이 있으면 그것 |
| 안내 버튼 | `SQ_SE_SYS_DECI_S`(72) | |
| 보이스 | vo_message.ftrg | 6.5 |
| 창 열림 | DuckingGroup(0x13, 0x13, 켬) | 그룹·더킹 뜻은 mgm_common.md 6.9 (0x13 = 소리 0 으로 0.3 s) |
| 선택지 열림 | DuckingGroup(0x0d, 0x0d, 켬) | BGM 을 0.6 배로 0.3 s |
| 닫힘(Out·끝) | 0x0d·0x13 해제 | 1.0 으로 0.3 s |

진동 `bv_vib_sys_deci`·`bv_vib_sys_cursor` 는 owner 대상.

## 8. 다른 기능과의 상호작용

- MinigameModeScene 흐름(mgm_common.md 5.3): `IsNextInputWait` = 위 하위 단계 2 플래그, AutoMessageFlow 의 3.0 s 기준점 = **그 플래그가 1 이 된 뒤 첫 Wait 다음 프레임부터 dt 누적**, RequestNextMessage 는 inputLock(0.2 s)이 끝난 뒤에만 받아들여진다(3.0 > 0.2 라 영향 없음).
- 온라인 세션이면 글자가 언제나 즉시 다 나온다(6.3).
- 플레이 모드 7(관전 [추정])이고 로컬 사람 소유자가 없으면 화살표를 숨긴다.
- mgmet::UiManager 는 이 창을 자기 엔티티(+0x8)로 따로 갖는다(mgm_common.md 4.4) — 장면의 "MessageWindow" 엔티티와 별개 인스턴스.

## 9. 웹 포팅 구조 (제안, 코드 없음)

### 9.1 위치와 의존
`web/script/shell/mgmcommon/messageWindow/`(mgm_common.md 9절 `messageFlow.ts` 가 쓰는 어댑터의 실제 구현). import 허용: 같은 폴더, `three`, `../../charselect/scene2d`·`render2d`·`types`. 명세: `web/assets/mgmcommon/meswin.json` ← 제안 도구 `mgmcommon_meswin_assets.py` (charsel_web_assets 변환으로 bq Parts.lyt 의 sys_meswin_00·choices_00·arrowicon_00·arrowchoices_00 + messageWindowList.json 의 WindowData/CharacterData/PositionData/Emotion + 사용 메시지의 ATR(msgwin_atr.py 로직)).

### 9.2 파일
| 파일 | 원본 | 책임 |
|---|---|---|
| `state.ts` | 상태 +0x28/+0x2c 기계(5절), 넘김 판정(6.2), 선택지(6.4) | 순수: 입력 {trig 비트별 IsTrigger}·dt·애니 끝 신호 → 사건(애니·SE·진동·보이스) |
| `typer.ts` | 글자 표시 객체(6.3) | 페이지 문구 + Wait_Scale 위치 표 + 속도 설정 → 매 프레임 보이는 글자 수, 글자 소리 사건, isDone, skip |
| `layout.ts` | 6.1·6.5·4.3 | 창 형식별 레이아웃 고르기, SetPlace 계산, 화자 이름표/얼굴, 화살표·선택지 칸 |
| `index.ts` | 공개 API = mgm_common.md 9.2 의 `MessageWindowAdapter` 그대로 + `setNextMask`·`setSpeed` | |

### 9.3 같게 / 바꾸는 것
| 항목 | 원본 | 웹 |
|---|---|---|
| 글자 간격·대입식 타이머·0x200 한도·즉시 조건 | 6.3 | 같게(f32 로 계산: `Math.fround`) |
| 0.2 s 입력 잠금·COM 0.6667 s·A 마스크 | 6.2 | 같게 |
| 열기 5f·닫기 5f·normal 1f | 4.3 데이터 | 데이터 그대로 |
| 배치·오프셋 | 6.1 | 같게(sys_meswin_00 Bottom_Center = (0, −270)) |
| 줄 나눔·태그 그리기 | GuiLayoutText(엔진) | charselect render2d 글자 규칙 재사용 [근사, 05_ui_input.md] |
| 보이스 | vo_message.ftrg 트리거 | 사건만 내보냄(재생은 어댑터) — 변형 고르기 [미확정] |
| 메시지 속도 설정 | 저장 데이터 SystemData+0x74 | 옵션 `speed`(0·1·2, 기본 0 = 0.05 s) |

## 10. 검증 코드·실행 결과·기대값

한 것: 디컴파일·어셈블리 판독(2절 목록), 데이터 덤프 실행 — `python web/tools/analysis/msgwin_atr.py koKR mgm mg_common system`(ATR1 1,137레코드: WT_Empty 932·WT_Name 205), `python web/tools/analysis/sound_preset.py json analysis/msgwin_sound_presets.json global mgm01 … mgmet`, `sound_fsar.py dump`(fspj 라벨·볼륨·사용자 파라미터, scratchpad), `ui_lyt.py dump`(mgm01~06·mgmet layout.lyt, scratchpad — 커서 부품 참조 검색용). 원본 실행·웹 실행·합성 시험 없음.

구현 단계 기대값(합성):
- 문구 10글자, Wait_Scale 없음, 설정 0, dt = 1/60(f32): 글자 나오는 프레임 간격 3 또는 4, 10번째 글자 뒤 typing = 0.
- 설정 1 또는 온라인: 페이지 시작 프레임에 전부 표시, 글자 소리 없음(count 0x201 로 루프 안 돎).
- 사람 소유자: 완료 프레임 F, F+11 까지의 A 무시(0.2 s = 12프레임째 dt 누적 ≥ 0.2 [f32 확인 필요]), 그 뒤 A → 하위 3.
- AutoMessageFlow: 완료 F → F + 약 180~181프레임(f32 누적, 장면 파이버와 창 갱신 순서에 따라 ±1)에 RequestNextMessage → 다음 창 갱신에서 하위 3.

## 11. 미확정 사항과 추가 분석에 필요한 근거

| 항목 | 상태 | 필요한 근거 |
|---|---|---|
| 메시지 속도 설정 0/1/2 의 메뉴 이름 | [추정 보통/빠름/느림] | 설정 화면 메시지 라벨 |
| vo_message.ftrg 의 변형(_01~_03) 고르기·볼륨 | [미확정] | FTRG 트리거 판독(05_ui_input.md 7절 도구로) |
| 모드 메시지별 ATR Emotion·VoiceKey 값 | [미확정: 집계 안 함] | msgwin_atr.py 에 type 8(문자열)·Emotion 출력 추가 |
| +0x509·+0x510·+0x514 의 설정 함수 | [미확정] | 해당 setter 판독(모드 장면은 안 씀 [추정]) |
| Talking 꼬리·Model 3D·Announce 판 세부 | 범위 밖(모드 화면 미사용) | FUN_71003161d0·FUN_710031af40·FUN_710031ded0 |
| GuiLayoutText 의 태그 그리기(색·루비·아이콘) | 엔진 범위 | 05_ui_input.md |
| 플레이 모드 7 의 뜻 | [추정 관전/온라인] | WorkModule::GetPlayMode 값 표 |
| 원본 실행 대조(글자 프레임 간격) | 없음 | 원본 캡처 |
