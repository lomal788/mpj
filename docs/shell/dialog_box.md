# 공용 대화상자(bq::ComUiDialogBox)와 메시지 창 선택지

상태 표기: [실행] 원본 실행 확인, [판독] 원본 코드/명령 판독, [판독: 어셈블리] 명령 덤프 판독, [데이터] 원본 데이터·레이아웃 확인, [추정], [미확정], [설계] 웹 결정.
범위: 공용 확인 UI 두 종류의 원본 동작과 웹 공용 부품. 원본 실행 대조는 하지 않았다(판독 + 합성 시험).

## 1. 기능 개요와 사용자에게 보이는 동작

원본에는 "예/아니요"를 묻는 공용 UI 가 두 가지 있다. 이름이 비슷하지만 다른 객체·다른 레이아웃·다른 입력 방향이다.

| 종류 | 객체 | 레이아웃 | 선택지 | 쓰는 곳(확인된 것) |
|---|---|---|---|---|
| 대화상자 | `bq::ComUiDialogBox` (main) | bq `Parts.lyt` `sys_dialog_00`(+ 칸 부품 `sys_dialog_arrowchoices_00`) — 화면 가운데 창 [데이터] | 0~3개, **가로**(왼쪽/오른쪽) | 온라인 메뉴·매칭([online.md](online.md) 9.3), mgmet `DialogBox` 래퍼(인원 확인 `mgmet_ui_sbdlg_NEW`, [mgmet_flow.md](mgmet_flow.md) 6.4) |
| 메시지 창 선택지 | `bq::ComUiMessageWindow` (main) | 메시지 형식별 `WindowData.Layout01`(예: `sys_meswin_choices_00`, `sys_meswin_model_choices_00`) [데이터] | 2~4개, **세로**(위/아래) | **미니게임 항구 나가기 확인**(이 문서 6.3), 파티 규칙([partyrule.md](partyrule.md) 6) |

[판독] 미니게임 항구(mgmet)에서 B 로 나가기를 물을 때는 **대화상자가 아니라 메시지 창 선택지**다 — `mgmet::Scene::ConfirmReturnSceneFlow` mgmet @0x7100059fa0 는 `UiManager::GetUiMessageWindow` 로 얻은 `ComUiMessageWindow` 에 `SetChoiceCount(2)`·`SetChoiceMessageLabel` 을 부른다(`GetUiDialogBox` 호출 없음). 근거 C `analysis/decomp/mgmcommon_mgmet_callers.c` 1022행, 명령 `analysis/decomp/mgmet_stage2_dis1.c` 623행.

## 2. 분석 대상 원본·자료 위치

| 항목 | 위치 |
|---|---|
| 대화상자 C (생성·In·Out·IsEnd·세터·RequestChoice/Decide·틱·크기·초기화) | `analysis/decomp/online_main_dialog.c` (online 담당이 뽑은 것 재사용) |
| 대화상자 입력 C (이번에 추가) | `analysis/decomp/dialogbox_main_input.c` — main FUN_7100208b80(선택지 입력)·FUN_7100209234(선택지 없음 입력). `web/tools/analysis/mgmcommon_ghidra.sh MgmcommonDecompCreate.java` 로 뽑음, INDEX.tsv 갱신 |
| 메시지 창 선택지 C | `analysis/decomp/msgwin_main_all.c` — FUN_71003197d0(사람 선택지 입력)·SetDecideChoice @0x7100319e78 (partyrule 담당 판독, [message_window.md](message_window.md) 정정 줄·[partyrule.md](partyrule.md) 6) |
| 항구 나가기 확인 C | `analysis/decomp/mgmcommon_mgmet_callers.c` (`ConfirmReturnSceneFlow` 1022행, 호출부 `ModeSelectCameraIdle` 6286행), 명령 `mgmet_stage2_dis1.c` |
| 레이아웃 | `extracted/converted/ui/bq_Parts/sys_dialog_00*`, `sys_meswin_choices_00*`, `sys_meswin_model_choices_00*` [데이터] |
| 문구 | `mgmet_back_mw_guide`("…[Text0]… 나갈까요?" 류, Text0 = `im_mode03_name`), `mgmet_back_mw_guide_a0`=예, `_a1`=아니요 — `web/assets/mgmcommon/spec.json` texts·msgAttr(wt 4, ch 13) [데이터] |

## 3. 진입점과 전체 호출 흐름

### 3.1 대화상자 (bq::ComUiDialogBox)

```text
부르는 쪽: SetMessageLabel/SetInsert*… → SetChoiceCount(1..3) → SetChoiceMessageLabel(i) → SetDeciSE/SetDeciVib(i)
          → (기본 커서 +0x4c) → SetCancelEnable → SetOwnerPlayer → In(imm) → while !IsEnd: Wait → GetChoiceResult
매 틱: ReceiveMessageImpl(메시지 0x5f454e00) @0x7100207bfc → FUN_7100207c38 @0x7100207c38
   상태 1: in 애니 끝 → "normal", 상태 2
   상태 2: FUN_7100207e40 입력 → 결정/취소면 Out(false)
   상태 3: out 애니 끝 → FUN_710020792c(초기화), 상태 0
   (모든 상태) FUN_7100208240 크기 계산 — 규칙은 online.md 9.3 정정 1~7
```

[판독] 입력 갈래 FUN_7100207e40: 형식(+0x3c)이 0 이 아니면 입력 없음(로딩 형식 등). owner(+0x70)가 −1 이면 플레이어 목록(+0x58..+0x60)의 유효한 각 플레이어를 차례로 처리하고 처음 결정한 쪽에서 끝, 목록이 비면 `WorkModule::GetOperationPlayerId`. 선택지 있음(+0x94)이면 FUN_7100208b80, 없으면 FUN_7100209234.

### 3.2 메시지 창 선택지

흐름·상태기계 전체는 [message_window.md](message_window.md) 5~6절과 정정 줄, 선택지 판독은 [partyrule.md](partyrule.md) 6 이 근거다. 여기서는 다시 쓰지 않는다. 요약: `SetChoiceCount(2..4)` → `SetMessageLabel` → `SetChoiceMessageLabel/DeciSE/DeciVib` → `SetCancelEnable` → 초기 커서 `+0x43c` 직접 대입 → `Start` → 글자 끝 → `in_choice` 애니 + 칸 열기 → 사람 입력 FUN_71003197d0 → `IsEnd` → `GetChoiceResult`.

## 4. 구조체·필드·상수 표

### 4.1 bq::ComUiDialogBox (기준 객체 = ComUiDialogBox 자신)

| 오프셋 | 의미 [판독] | 초기값(생성자 @0x71002076b0) / writer → reader |
|---|---|---|
| +0x38 | 상태 0 끝·1 in·2 대기·3 out | 0 / In·Out·틱 → `IsEnd`(<1)·`IsWorking`(>0)·RequestChoice/Decide(==2) |
| +0x3c | 형식(SetType). 0 = 일반, 2 = 로딩 아이콘(`x_loadingicon`) | 0 / SetType → In·입력(0 아니면 입력 없음) |
| +0x40 | 속성(SetAttribute). 1 → 그리기 우선 0xa100, 2 → 0xa200, 둘 다 `OverlayScene0` 에 붙임. 기본 0x9800(생성) | 0 / SetAttribute → In |
| +0x44 | 커서(−1 = 없음) | In 이 −1 후 선택지 있으면 +0x4c / 입력 |
| +0x48 | 결과(−1 = 취소·없음) | In 이 −1 / 결정 = 커서, B = −1 → `GetChoiceResult` |
| +0x4c | 기본 커서 | 0 / 부르는 쪽(래퍼) → In. 초기화 때 0 |
| +0x50..0x52 | 칸별 불가(disable) | 0 / → In("disable" 애니)·이동에서 건너뜀 |
| +0x70 | owner(−1 = 목록/조작자) | −1 / SetOwnerPlayer(목록 비움) → 입력 |
| +0x74 | 결정 버튼 비트(SetHidButton) | **1(A)** / → 입력 |
| +0x90 | 선택지 수(1..3, 밖이면 abort) | 0 / SetChoiceCount → In·입력·크기 |
| +0x94 | 선택지 있음 | 0 / SetChoiceCount 가 1 → 입력 갈래·화살표 아이콘 |
| +0x96 | 취소 가능(B) | 0 / SetCancelEnable → 입력 |
| +0x97/+0x98 | `x_text`/`x_text_bold` 보이기 | SetMessageLabel 계열 → In |
| +0x9c | 원래 버튼 폭(`x_choise_00/x_btn`, 520) | 생성 FUN_71002077ac → 크기 |
| +0xa0 | RequestChoice 예약 칸(−1 없음) | 초기화 −1 / RequestChoice → 입력(유효하지 않으면 abort) |
| +0xa4 | RequestDecide 예약(선택지 없음 갈래 또는 외부 결정) | 0 / RequestDecide → 입력 |
| +0xd0 / +0x100 / +0x130 | 선택 콜백(커서) / 결정 콜백 / Out 콜백(imm) | SetChoiceCallback·SetDecideCallback·SetOutCallback |
| +0x140 + i·0x30 / +0x158 + i·0x30 | 칸 i 결정 SE / 결정 진동 이름(빈 문자열 = 기본) | SetDeciSE/SetDeciVib → 결정 |

[판독] 초기화 FUN_710020792c(끝·즉시 Out·생성): 칸 셋 숨김+"normal", `x_alignment_choise`·`x_loadingicon` 숨김, 얼굴 숨김, 문구 비움, 형식 0, +0xa0 −1, +0x4c 0, 불가 0, 선택지 수 0, +0x93..+0x96 0, +0xa4 0, 콜백 3개 해제, 얼굴 목록 비움. 결과 +0x48 은 지우지 않는다(다음 In 이 −1).

### 4.2 입력 비트 (bex 원시 비트, [mgm_common.md](mgm_common.md) 6.10)

| 쓰임 | 비트 | 근거 |
|---|---|---|
| 대화상자 결정 | +0x74 (기본 0x1 = A) | FUN_7100208b80·FUN_7100209234 [판독] |
| 대화상자 취소 | 0x2(B) AND +0x96 | FUN_7100208b80 [판독] |
| 대화상자 왼쪽 / 오른쪽 | 0x10100 / 0x40200 (방향키·스틱) | FUN_7100208b80 [판독] |
| 메시지 선택지 위 / 아래 | 0x20800 / 0x80400 | FUN_71003197d0 [판독] |
| 메시지 선택지 결정 | +200(넘김 비트, 기본 A) | FUN_71003197d0 [판독] |

## 5. 상태 전이와 전체 수명

### 5.1 대화상자

| 상태 [판독] | 진입 | 매 틱 | 전이 |
|---|---|---|---|
| 0 끝 | 생성·초기화 | 크기 계산만 | In(false) → 1, In(true) → 2 |
| 1 in | In(false): "in" 재생 | in 애니 재생 상태 3(끝) 검사 | 끝 → "normal" 재생, 2 |
| 2 대기 | in 끝 또는 In(true)("normal") | FUN_7100207e40 입력 | 결정·취소 → Out(false) → 3 |
| 3 out | Out(false): "out" 재생, Out 콜백(false) | out 애니 끝 검사 | 끝 → 초기화, 0 |
| (즉시) | Out(true) (상태 1·2 에서만) | — | Out 콜백(true), 초기화, 0 |

[판독] In @0x71002093d0 순서: 애니("in" 또는 "normal") → 상태 → `x_arrowicon` "normal" → 커서·결과 −1 → 형식 2 면 로딩 아이콘 보이기 / 형식 0 이고 선택지 있으면 커서 = +0x4c, `x_alignment_choise` 보이기, 칸 i < 수 각각 "cursor"(i==커서)·"normal"·"disable"(불가) 예약 + 보이기, 소리 묶음 0xd 낮추기 → 얼굴 → `x_arrowicon` 숨김 → 칸 `null_cursor` 숨김(FUN_71002089c4(0)) → `x_text`·`x_text_bold` 보이기 → 속성 우선순위 → `x_alignment_y`·`x_alignment_face` 정렬 요청 → 소리 묶음 0xd·0x15 낮추기 → +0x54 = 0. Out 은 묶음을 되돌린다.

### 5.2 메시지 창 선택지

[message_window.md](message_window.md) 5절 상태표(−1·0 in·1 글자·2 창 남음·3 out)를 그대로 쓴다. 선택지 결정·취소 뒤에는 마지막 페이지 처리로 가며, `SetManualClose`(+0x510 [추정]) 가 켜져 있으면 상태 2(창 남음), 아니면 out. `IsEnd` = 상태 −1·2·≥4.

## 6. 계산식·조건·의사코드

### 6.1 대화상자 입력 (FUN_7100208b80, 선택지 있음) [판독]

```text
trig = GetTrigger(pid)
decideHit = trig & hidButton(+0x74)
if !reqDecide(+0xa4) && !decideHit:
    if (trig & B) && cancelEnable:  SE SQ_SE_SYS_CANCEL; result = -1; return 닫기     # 진동·press 없음
    to = cursor
    if reqChoice != -1:  (유효 아니면 abort) to = reqChoice; reqChoice = -1
    elif trig & 0x10100:  to = (cursor 보다 작은 칸 중 불가 아닌 가장 큰 칸) 또는 그대로     # 넘김(래핑) 없음
    elif trig & 0x40200:  to = (cursor 보다 큰 칸 중 불가 아닌 가장 작은 칸) 또는 그대로
    if to != cursor:
        cursor = to
        각 불가 아닌 칸 i: 재생 (i==cursor ? "on" : "off") → 예약 (i==cursor ? "cursor" : "normal")
        SE2D SQ_SE_SYS_CURSOR (새 커서 칸 화면 위치), 진동 bv_vib_sys_cursor(pid), 선택 콜백(cursor)
else:
    reqDecide = 0
    if decideHit:
        result = cursor; 칸 cursor "press"
        SE deciSE[cursor] 또는 SQ_SE_SYS_DECI; 진동 deciVib[cursor] 또는 bv_vib_sys_deci (pid)
    결정 콜백()
pid 가 로컬 사람이면 칸 null_cursor 보이기(FUN_71002089c4(1))
return reqDecide || decideHit
```

우선순위: 결정 > B 취소 > 예약 이동 > 왼쪽 > 오른쪽. "on"(2자)/"off"(3자)는 문자열 상수 길이로 본 이름 [판독: 길이 2·3, 칸 부품 애니 목록 on/off 와 일치 [데이터]].

### 6.2 대화상자 입력 (FUN_7100209234, 선택지 없음) [판독]

```text
if reqDecide: reqDecide = 0; 결정 콜백(); return 닫기
if IsTrigger(pid, hidButton): SE SQ_SE_SYS_MES_PROC; 결정 콜백(); return 닫기     # 결과 = −1 그대로, 진동 없음
pid 가 로컬 사람이면 x_arrowicon 보이기
```

화살표 아이콘(`x_arrowicon`)은 FUN_7100207e40 이 매 틱 "형식 0 AND 선택지 없음"일 때 보인다. 단 PlayMode 7 이고 FUN_71001968a4(5)·(6) 이 모두 거짓이면 숨기고 칸 커서도 숨긴다 [판독; PlayMode 7·FUN_71001968a4 의 뜻은 미확정].

### 6.3 미니게임 항구 나가기 확인 [판독 + 판독: 어셈블리]

`ModeSelectCameraIdle` mgmet @0x710004d6d0 상태 7 입력 루프에서 trigger B(mask 2)(왼쪽·오른쪽 갈래가 아닐 때):

```text
SoundModule::Play("SQ_SE_SYS_CANCEL")                 # 확인을 열기 전에 먼저
yes = ConfirmReturnSceneFlow()
if yes: +0x32c(exit) = 1; +0x330(seq) = -1; return      # MinigameModeFlow 가 nextMode 검사 뒤 ReturnScene
else:   +0x33c(pendingGuide) = 1; return                # 상태 7 그대로 → 다음 SeqUpdate 에서 제목·화살표·Back 다시 준비, NPC 준비되면 앞 안내 다시

ConfirmReturnSceneFlow @0x7100059fa0:
  UiManager::OutBackMsg(false); ActivityTitle::ActOut()
  msg = GetUiMessageWindow(); msg.Out(); while !msg.IsEnd(): Wait
  msg.DisablePadInput(false, false); msg.DisableNextKeyWait(false); msg.SetOffset(MESSSAGE_WINDOW_OFFSET)
  msg.SetOwnerPlayer(GetOperationPlayerId(0x80000000, false, false))
  msg.SetChoiceCount(2)
  msg.SetMessageLabel("mgmet_back_mw_guide"); msg.SetInsertMessLabel(Text0 = "im_mode03_name")
  칸0: "mgmet_back_mw_guide_a0"(예),   SE SQ_SE_SYS_DECI_L, 진동 bv_vib_sys_deci_l
  칸1: "mgmet_back_mw_guide_a1"(아니요), SE SQ_SE_SYS_CANCEL, 진동 bv_vib_sys_deci
  msg.SetCancelEnable(true); msg[+0x43c] = 1          # 기본 커서 = 아니요
  msg.Start(); while !msg.IsEnd(): Wait
  return GetChoiceResult() == 0                       # B 취소(−1)·아니요(1) = false
```

[판독: 어셈블리] C 에서 빠진 값(선택지 수 2 = `mov w1,#0x2` @0x710005a068, 기본 커서 `str w19(1),[x0,#0x43c]` @0x710005a15c, cancelEnable `mov w1,#0x1` @0x710005a150, 라벨 문자열 주소 0x71000e2e85·0x71000de92a·0x71000e2b2f, SE 0x71000e0881·0x71000e2e74, 진동 0x71000e2167·0x71000dde59)은 `mgmet_stage2_dis1.c` 623행 명령으로 확인했다.

[데이터] 문구 속성 wt 4 → `messageWindowList.json` WindowData[4] = Name 형식, Layout00 `sys_meswin_00`, Layout01 **`sys_meswin_choices_00`**, ch 13(화자 이름표). `sys_meswin_choices_00` 의 `x_alignment_00` ali1 extra = `01000000000040c000010000` 로 `sys_meswin_model_choices_00` 과 같은 값 → 세로·가운데·gap −3([partyrule.md](partyrule.md) 6.2 의 해석 재사용).

[판독] 결과 흐름: 예 → `MinigameModeFlow` @0x7100049ed0 가 다음 루프에서 `ReturnScene()`(항구를 부른 장면으로 복귀; 모드 선택 화면에서 왔으면 그쪽). 아니요/B → 같은 상태 7 을 다시 실행해 제목·화살표(+0x340 방향 값에 따라 InTitle / InLeftArrow / InRightArrow)·Back 안내를 다시 넣고, 안내 NPC 상태 1 이면 `GuideNpcChangeAction(6)` + 앞 안내 메시지를 다시 띄운다(+0x33c).

### 6.4 대화상자 크기

[online.md](online.md) 9.3 정정 1~7 (FUN_7100208240) 그대로. 웹 공용 함수 `dialogBoxSize`·`layoutDialogBox`(9절).

## 7. 애니메이션·소리·진동·에셋 연결

| 사건 | 대화상자 [판독] | 메시지 선택지 [판독] |
|---|---|---|
| 열기 | 창 "in" → "normal"; 칸 "cursor"/"normal"/"disable" | 창 in → 글자 → `in_choice` + 칸 열기 |
| 커서 이동 | 칸 "on"/"off" → "cursor"/"normal", SQ_SE_SYS_CURSOR(2D), bv_vib_sys_cursor | SetSelectChoice(칸 on/off, SQ_SE_SYS_CURSOR) |
| 결정 | 칸 "press", deciSE 또는 SQ_SE_SYS_DECI, deciVib 또는 bv_vib_sys_deci | 칸 "press", deciSE 또는 SQ_SE_SYS_DECI, deciVib 또는 bv_vib_sys_deci(owner +0xb8) — SetDecideChoice @0x7100319e78 |
| 취소(B) | SQ_SE_SYS_CANCEL, 결과 −1 | SQ_SE_SYS_CANCEL, 결과 −1 |
| 선택지 없음 결정 | SQ_SE_SYS_MES_PROC | (해당 없음 — 일반 넘김 SE) |
| 닫기 | "out" | out(또는 ManualClose 면 창 남음) |
| 소리 묶음 | In: 0xd·0x15 낮춤, Out: 되돌림 | 0x0d(선택지)·0x13 |

항구 나가기 SE 순서: B 누름 즉시 `SQ_SE_SYS_CANCEL` → (메시지) → 예 `SQ_SE_SYS_DECI_L`(웹 에셋 `assets/mgmet/sound/SQ_SE_SYS_DECI_L.wav`) / 아니요 `SQ_SE_SYS_CANCEL` / B `SQ_SE_SYS_CANCEL`.

## 8. 다른 기능과의 상호작용

- 조작 플레이어: 대화상자 owner −1 이면 목록 → 조작자, 메시지 선택지는 owner(+0xb8) 하나. 항구 나가기는 조작자([mgm_common.md](mgm_common.md) 5.3·5.4).
- 항구 나가기 확인 중에는 상태 7 루프가 멈춘다(파이버가 확인 함수 안에서 Wait). 앞 안내 메시지는 같은 메시지 창 객체라서 확인 전에 Out 으로 닫는다.
- 앞 안내가 `SetManualClose(true)` 를 켜 두고 확인 함수는 끄지 않는다 → 결정 뒤 창이 상태 2 로 남을 수 있다(웹 상태기계 그대로) [추정: +0x510 해제 시점 미확정, message_window.md 11절].

## 9. 웹 포팅 구조

### 9.1 공용 부품 `web/script/shell/mgmcommon/dialogBox.ts` (2026-10-08) [설계: 모듈 위치·이름]

| 원본 | 웹 | 비고 |
|---|---|---|
| +0x38 상태 | `DialogBoxState.st` (0/1/2/3) | `isEnd()`·`isWorking()` 같은 식 |
| +0x44/+0x48/+0x4c | `cursor`/`result`/`initial` | |
| +0x50.. | `disabled[i]` | |
| +0x74/+0x96 | `hidButton`(기본 0x1)/`cancelEnable` | |
| +0x90/+0x94 | `count`/`count > 0` | |
| +0xa0/+0xa4 | `requestChoice(i)`/`requestDecide()` | |
| +0x140/+0x158 | `deciSe[i]`/`deciVib[i]` | |
| FUN_7100208b80·FUN_7100209234 | `DialogBoxState.input(trig, human)` → `DialogEvent[]`, 반환 = 닫기 | 사건: `anim`(칸·태그·다음 태그)·`se`·`se2d`·`vib`·`nullCursor`·`arrowIcon` |
| In/틱/Out | `open(imm)`·`inDone()`·`out(imm)`·`outDone()` | 애니 끝 신호는 그리는 쪽이 준다 |
| FUN_7100208240 | `dialogBoxSize(n, choiceMaxW, textW, textH, btnH)`(순수 계산) + `layoutDialogBox(inst, n, measure)`(sys_dialog_00 인스턴스에 적용) | online.md 9.3 정정 1~7, 상수 `DIALOG_SIZE` |
| 나눈 창 크기 | `resizeSplitWindow(inst, path, w, h?)` | online view.ts 에서 옮김 [설계: 조각 재배치] |

온라인(`shell/online`)은 이 부품을 쓴다: `view.ts` 의 `layoutDialog`·`resizeWindow` → `layoutDialogBox`·`resizeSplitWindow` 호출, `widgets.ts DialogBox.update` 의 칸 이동·결정·취소 → `DialogBoxState.input`. 온라인 흐름이 쓰는 결과 값(B → `cancel` 칸 번호, 선택지 없음 → 0)은 온라인 어댑터의 기존 약속으로 남긴다 [설계].

정정(2026-10-08, 이 판독으로): 온라인 웹 대화상자의 **선택지 없는 대화상자 A 소리**를 `SQ_SE_SYS_DECI` → **`SQ_SE_SYS_MES_PROC`** 로 고친다(FUN_7100209234). 진동 사건(`bv_vib_sys_cursor`·`bv_vib_sys_deci`)은 온라인 사건 목록에 진동이 없어 버린다 [설계].

### 9.2 항구 나가기 확인 (`web/script/shell/mgmet/hub.ts`)

- `modeSelectCameraIdle` 의 B: `SQ_SE_SYS_CANCEL` → `confirmReturnSceneFlow()` → 예면 `seq=-1`·`exitRequested`, 아니면 `pendingGuide=true` 로 반환(상태 7 재진입).
- `confirmReturnSceneFlow()`: 6.3 의사코드 그대로 공용 `MessageWindow` 선택지 API(`setChoiceCount`·`setChoiceLabel`·`setChoiceDeciSe`·`setChoiceDeciVib`·`setCancelEnable`·`setInitialChoice`·`choiceResult`)를 쓴다. 새 UI 를 만들지 않는다.
- 공용 메시지 창 보강(작은 것만): ① `CHOICE_ALIGN` 에 `sys_meswin_choices_00`(ali1 = model_choices 와 같은 바이트 [데이터]) 추가, ② 선택지 결정 때 진동 사건(`deciVib` 또는 `bv_vib_sys_deci`, owner) — SetDecideChoice [판독].

### 9.3 dev/ui.html

`dev/ui?ui=mgmet` 항구 화면에서 액티비티 선택(상태 7) 중 B → 메시지 창 "…나갈까요?" + 예/아니요(세로, 기본 아니요). 위/아래로 이동, A 결정, B = 아니요와 같음. 예 → 허브 끝(결과 exit), 아니요 → 제목·안내 다시.

## 10. 검증 코드·실행 결과·기대값

- `npx tsx tools/test_mgmcommon.ts` 대화상자 절: 크기 계산(버튼 폭 clamp, 창 폭·높이 clamp), 상태 열기 → in 끝 → 이동(래핑 없음·불가 칸 건너뜀) → 결정 SE·진동·결과, B 취소 −1, 선택지 없음 MES_PROC 결과 −1.
- `npx tsx tools/test_mgmet.ts` 나가기 절: B → CANCEL SE·메시지 `mgmet_back_mw_guide`·선택지 2·기본 1 → B → 상태 7 유지·끝 아님 → B → 위 → A → DECI_L·결과 exit·ReturnScene.
- `npx tsx tools/test_online.ts` 그대로 통과(크기·기본 커서·흐름).
- 결과 수치는 10.1 에 기록.

### 10.1 실행 결과

2026-10-08 [합성 시험·헤드리스, 원본 실행 대조 없음]:
- `test_mgmcommon` 119/119(대화상자 절 20: 크기 clamp 4·열기·in 중 입력 없음·불가 칸 건너뜀·끝 정지·결정 우선·SE/진동·B −1·선택지 없음 MES_PROC), `test_mgmet` 214/214(나가기 절 14), `test_online` 154/154(공용 부품으로 바꾼 뒤 그대로), `test_msgwin` 52/52, `check_mgmcommon` 12954/12954.
- 기존 시험 전체 1회: test_partyrule 106·test_mgm01 274·test_mgmscreens 38·test_setplayer 116·test_charselect 67·check_charselect 2403·test_modeselect 71·check_modeselect 1068·test_mg1801·check_logic(mg1801 3255 프레임 같음) 통과. tsc 새 오류 0(기존 serve.ts 2개), `tools/build.ts` 통과.
- 헤드리스 `tools/shot_dialogbox.ts` 1회, 콘솔 오류 0: `test/out/dialogbox/01_mgmet_exit_confirm.png`(레이아웃 sys_meswin_choices_00, 커서 1 = 아니요, 이름표 키노피오, 문구 "미니게임 항구에서 나가실 건가요?"), 02(B → 상태 7·앞 안내 다시), 03(위 → 예), A → 결과 "항구 나가기(ReturnScene)"; `04_online_password_dialog.png` 는 이전 `test/out/online/03_password_dialog.png` 와 같은 모양(창·칸 폭·커서 1).
- 남은 차이(이번에 안 바꿈): 온라인 웹은 선택지가 있어도 `x_arrowicon`(아래 화살표)이 보인다 — 원본은 선택지 없음일 때만 보임(6.2). 온라인 어댑터가 `arrowIcon`·`nullCursor` 사건을 버리는 [설계] 때문.

## 11. 미확정 사항과 추가 분석에 필요한 근거

1. 대화상자 PlayMode 7 갈래와 FUN_71001968a4(5/6) 의 뜻(화살표·칸 커서 숨김 조건) — FUN_71001968a4 판독 필요.
2. 메시지 창 `SetManualClose` 플래그가 끝 처리에서 풀리는지(+0x510 setter·FUN_7100318340) — 항구 확인 뒤 창이 남는지에 영향. message_window.md 11절과 같은 항목.
3. mgmet `DialogBox` 래퍼(인원 확인 `ChoicePlayerNumSettingFlow`)의 웹 구현은 이번 범위 밖(프리 플레이 경로에서 호출 없음, mgmet_flow.md 6.4).
4. 대화상자 "on"/"off" 애니 이름은 문자열 길이·부품 애니 목록 대조 [판독+데이터], 문자열 원문(DAT_71015c4e14·DAT_710156bb87) 직접 확인은 안 함.
