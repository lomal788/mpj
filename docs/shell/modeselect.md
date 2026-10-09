# 모드 선택(맵 메뉴) 화면 (menu01::ComUiMap) — 원본 분석과 독립 모듈 명세

2026-10-06. 상태: **분석 완료(판독·데이터) → 이 문서를 근거로 구현 완료(웹), 캡처 1장과 화면 대조(10절)**. 원본 실행 대조는 없다(캡처 1장 `3.png`). 1~9·11절을 구현 전에 썼고, 구현 중 드러난 것은 문서(6.1·8·9.4)를 먼저 고친 뒤 코드에 반영했다.
형식은 `F:/dev/mps/web/docs/분석.txt` 11절 구성. 이 문서는 **이 화면 고유 내용만** 적는다. 레이아웃 재생·그리기 규칙(색 공간·부모 기준점·블렌드·부품 덮어쓰기)·폰트·입력 비트·소리 재생 방식은
[charselect.md](charselect.md) 6.4·6.5·7·12절과 [../engine/05_ui_input.md](../engine/05_ui_input.md)·[../engine/04_sound.md](../engine/04_sound.md)를 그대로 따르고 다시 분석하지 않았다.

확정 수준: **[판독]** 디컴파일 C 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**, **[참고 이미지]** 사용자 캡처(`3.png`, 화면을 약 0.7187배로 줄이고 왼쪽 539 px·위쪽 34 px 을 잘라낸 것 — 아래 1절 계산), **[실행: 변환]** 자체 도구 실행.
주소는 menu01.nro(SwitchLoader 베이스 0x7100000000, 심볼 있음)다.

---

## 1. 기능 개요와 사용자에게 보이는 동작

광장(menu01)에서 맵을 열면 나오는 모드 목록 화면. 왼쪽에 모드 버튼이 세로로 늘어서고, 오른쪽 흰 액자 안에 섬 지도(모드별 섬 아이콘)와 고른 모드의 섬 위에 말풍선 모양 사진 창, 아래에 설명 두 줄이 나온다.

| 요소 | 보이는 것 | 근거 |
|---|---|---|
| 모드 버튼 | `mn01_btn_map_00` 부품 9개(`x_btn_00..08`), 세로 간격 91, 숨긴 버튼은 빈칸 없이 위로 채움 | [판독 Setup·Alignment::RequestAlignment][데이터 ali1 여백 −81] |
| 조이콘 아이콘 | 버튼 1·2·3(리듬 쿠킹·키노피오 공장·펄럭펄럭 어드벤처)의 `x_icon_00` 만 보임 | [판독 SetupButton: `uVar7 - 1 < 3`][참고 이미지: 2~4번째 칸] |
| 지도 | `mn01_pict_map_00`(960×710 액자 그림 `mn01_pict_map_00^q`) + 섬 아이콘 부품 `x_icon_mode_00..07`(`mn01_icon_map_00`) | [데이터] |
| 사진 창 | 고른 버튼의 `x_win_NN`(`mn01_win_map_00`) 하나만 보임. 내용은 **정지 그림** `mn01_pict_mode_NN^o`(384×216) — 동영상 아님 | [판독 OnMapThumbnail = SetPaneVisible 만][데이터 부품 재질 덮어쓰기] |
| 설명 | `x_text_mess`(bqfont_small 45.6, #070203, 가운데) = `im_mn_modeNN_detail` 두 줄 | [판독 Cursor][데이터 im_menu] |
| 안내 | 오른쪽 아래 "(B) 닫기"(`mn01_mode_ctrl_close`, ComUiGuide00 위치 17) | [판독 UpdateProcess] |

캡처 대조 [참고 이미지]: 버튼 중심 간격 65.4 px → 배율 65.4/91 = 0.7187. 첫 버튼(y 364) 캡처 y 101, 마지막 보이는 버튼 캡처 y 560 = 8개(파티 지원 여행 숨김), 지도 액자 중심(레이아웃 y 48) 캡처 y 329, 설명(레이아웃 y −364) 캡처 y ≈ 623 → 화면 위쪽 34 px 잘림으로 셋 다 맞는다.
선택 버튼 색 캡처 (230,254,96) = press 정점색 (203,255,29) 의 sRGB 부호화 (231,255,95) → **캡처는 마리오 파티에서 A 를 누른 직후(press)** 프레임이다(cursor 색은 분홍 (255,19,73)) [참고 이미지 계산, 색 규칙은 charselect.md 6.5].

## 2. 분석 대상 원본·자료 위치

| 항목 | 위치 |
|---|---|
| 코드 | menu01.nro `menu01::ComUiMap` @0x71000a4f58~0x71000a7a38, `SequenceModeSelect::MapMenuImpl` @0x710003df70, `CheckModePlayable` @0x71000b8210, `CheckSaveFlag` @0x71000b81a0, `MODE_PLAYABLE::GetMessageLabel` @0x71000a6708, `SequenceBase::FocusImpl` @0x710003b5a0 |
| 디컴파일 | `analysis/decomp/modesel_menu01_uimap.c`(ComUiMap·SequenceModeSelect·ComUiPackModeSelectView), `modesel_menu01_playable.c`, `modesel_menu01_callers.c`(In/Out/GetUiMap 호출자) |
| Ghidra | `ghidra_work/modesel/g4`(charsel g4 사본), `web/tools/analysis/modesel_ghidra_nro.sh` |
| 표·문자열 | `web/tools/analysis/modesel_tables.py`(nro 데이터 영역의 버튼 이름·라벨 표 읽기) |
| 레이아웃 | `extracted/bea/menu~menu01.nx.bea/menu/menu01/layout.lyt` — `mn01_base_map_00`·`mn01_btn_map_00`·`mn01_pict_map_00`·`mn01_icon_map_00`·`mn01_win_map_00`. 덤프 `extracted/converted/ui/menu01/`, 텍스처 png `extracted/converted/ui/menu01_tex/`. 안내 = `bq.nx.bea/Parts.lyt` sys_guide_03 (charselect 와 같음) |
| 메시지 | `extracted/message/koKR/im_common.json`(im_modeNN_name), `im_menu.json`(im_mn_modeNN_detail), `menu01_mode.json`(mn01_map_ui_mode_detail, mn01_mode_ctrl_close) |

## 3. 진입점과 호출 흐름 [판독]

```
SequenceModeSelect::MapMenuImpl                         (맵 메뉴 파이버)
  ComUiMap::In(false)        → 상태(+0x3c) ≥ 2 면 레이아웃 "in"(15f), 상태 0, 보이기
  (오프라인) 보상 안내·인원 되돌리기 대화(이 화면 밖)
  ComUiMap::Start()          → +0x38 = 0(결정), +0x39 = 1(진행 중), +0x58 결과 = −1, Setup(), 커서 놓기(아래)
  while +0x39: Fiber::Wait   (ComUiMap 이 매 프레임 UpdateProcess)
  switch 결과(+0x58): 0..6 → 다음 시퀀스 번호 기록 후 상태 4 / 7 → BGM 정지·페이드아웃 1.0·0.5 s 뒤 메뉴 복귀 코드 2(장면 복귀) / 8 → 광장 파이버 / 9(취소) → 파이버, 상태 3
다음 시퀀스 FocusImpl: ComUiMap 이 Idle(상태 1)이면 Wipe FadeOut(1.0, 유형 1) 끝까지 기다린 뒤 ComUiMap::Out(true)(즉시 숨김)
```

생성자 @0x71000a4f58: `menu/menu01/layout.lyt` 의 `mn01_base_map_00` 생성(menu_common 도 함께 묶음), 그리기 순위 0x700, 숨김, Setup(), Cursor(−1).

매 프레임 Update @0x71000a5d48(이벤트 0x5f454e00 ReceiveMessage 도 같음):
1. 알림 타이머(+0x5c, 초) > 0 이면 `GetDeltaTime` 만큼 뺀다.
2. 상태 2(out 중)이고 레이아웃 애니 끝 → 숨김, 상태 −1. 상태 0(in 중)이고 끝 → "normal_00" 재생(이 레이아웃에 그 태그는 없다 [데이터] → 마지막 값 유지 [추정]), 상태 1.
3. UpdateProcess(4절).

Out(immediate) @0x71000a688c: 상태 −1·2 면 무시. 즉시면 상태 −1·숨김, 아니면 상태 2·"out"(5f). IsFinished = 상태 < 0. IsIdle = 상태 1.

## 4. 상태·데이터 표

기준 객체 `menu01::ComUiMap`(this). [판독]

| 오프셋 | 형식 | 웹 이름 | 뜻 | writer | reader |
|---|---|---|---|---|---|
| +0x38 | u8 | `closing` | 결정·취소가 일어남(다음 프레임에 +0x39 를 끔) | UpdateProcess·Start | UpdateProcess |
| +0x39 | u8 | `running` | 입력 처리 중(MapMenuImpl 이 기다림) | Start·UpdateProcess | MapMenuImpl |
| +0x3c | s32 | `phase` | −1 숨김, 0 in, 1 대기(Idle), 2 out | In·Out·Update | 전부 |
| +0x40+i | u8 | `enabled[i]` | `GetModePlayable(i) == 0` | Setup | Cursor·OnButton·UpdateProcess |
| +0x49+i | u8 | `shown[i]` | `GetModePlayable(i) != 4` | Setup | UpdateProcess·Start |
| +0x54 | s32 | `cursor` | 버튼 번호 0..8, −1 없음 | Cursor | 전부 |
| +0x58 | s32 | `result` | 결정 버튼(≤8), 9 = 취소, −1 | UpdateProcess·Start | MapMenuImpl |
| +0x5c | f32 | `noticeTimer` | 불가 알림 재표시 막기(3.0 s) | UpdateProcess | Update |

### 4.1 모드 목록(버튼 순서) [판독 표 @0x7100163618·@0x710016363c·GetModePlayable·GetMapIconPane·Cursor][데이터 메시지]

| 버튼 | 이름(koKR) | 이름 라벨 | 설명 라벨 | 가능 여부 원천 | 조이콘 | 섬 아이콘 | 사진 창 | 다음(MapMenuImpl) | 웹 키 [웹 이름] |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 마리오 파티 | im_mode00_name | im_mn_mode00_detail | CheckModePlayable(0) | | x_icon_mode_00 | x_win_00 | 시퀀스 2 | `bd` |
| 1 | 리듬 쿠킹 | im_mode02_name | im_mn_mode02_detail | CheckModePlayable(2) | ○ | x_icon_mode_03 | x_win_03 | 5 | `rc` |
| 2 | 키노피오 공장 | im_mode07_name | im_mn_mode07_detail | CheckModePlayable(5) | ○ | x_icon_mode_04 | x_win_04 | 7 | `mf` |
| 3 | 펄럭펄럭 어드벤처 | im_mode06_name | im_mn_mode06_detail | CheckModePlayable(4) | ○ | x_icon_mode_02 | x_win_02 | 6 | `pata` |
| 4 | 쿠파 버스터즈 | im_mode01_name | im_mn_mode01_detail | CheckModePlayable(1) | | x_icon_mode_05 | x_win_05 | 4 | `kb` |
| 5 | 쿠파 애슬론 | im_mode08_name | im_mn_mode08_detail | CheckModePlayable(6) | | x_icon_mode_06 | x_win_06 | 8 | `ca` |
| 6 | 미니게임 항구 | im_mode03_name | im_mn_mode03_detail | CheckModePlayable(3) | | x_icon_mode_01 | x_win_01 | 3 | `mgm` |
| 7 | 파티 지원 여행 | im_mode19_name | im_mn_mode19_detail | 저장 플래그 0x28 없음 → 4(숨김), 온라인 → 1 | | x_icon_mode_07 | x_win_07 | 장면 복귀(코드 2) | `quest` |
| 8 | 광장 | im_mode05_name | im_mn_mode05_detail | 항상 0 | | x_icon_mode_07 | x_win_08 | 광장 파이버 | `plaza` |

- 사진 창 그림: `x_win_NN` 은 부품 재질 덮어쓰기로 `mn01_pict_mode_NN^o` 를 쓴다(NN = 창 번호) [데이터]. 동영상 파일은 이 화면이 쓰지 않는다(romfs 의 mp4 는 `movie/extra/ppet`·`movie/flow/op` 뿐이고 이 레이아웃과 연결 없음) [데이터].
- `CheckModePlayable` 반환: 0 가능, 1 = 친구 매치(온라인) 불가, 2 = 1대 1인, 3 = 8인 방 불가, 4 = 숨김. 1..3 은 **온라인 세션일 때만** 나온다 [판독] → 오프라인 웹은 0..6 이 항상 가능. 불가면 `MODE_PLAYABLE::GetMessageLabel` → `Notice_PlayModeMissed00/01/04`(noticeList.json → `sys_notice_playModeMissed00/01/04`) 알림 [판독][데이터].
- 섬 아이콘 부품 `x_icon_mode_NN` 은 부품 덮어쓰기(basicUsage 3/1)로 `null_mode_NN` 하나만 보인다 [데이터]. 마리오 파티 섬(`x_icon_mode_00`) 안의 보드 아이콘: `x_icon_bd02_on/off` = 저장 플래그 0x20, `bd03` = 0x21, `bd06_on/off/cloud` = 0x22 가 켜져 있을 때만 보임 [판독 Setup]. 캡처는 셋 다 꺼진 상태 [참고 이미지: 주황·보라 지역에 아이콘 없음].
- NEW 표시 `x_btn_NN/x_icon_new`(부품 sys_icon_new): 버튼 0 = IsVisibleNewIconBd(GameFlag 0x10~0x12·0x21 과 저장 비트), 버튼 6 = Mgm06IsReleaseInfo, 나머지 숨김 [판독]. sys_icon_new 레이아웃은 menu01·menu_common·bq Parts 어디에도 없다 → **[미확정]**(웹은 기본 숨김, 그림 없음).

## 5. 상태기계 — UpdateProcess @0x71000a5f70 [판독]

```
if phase != 1 or !running: return
if closing: running = 0; 안내 Out; return                    // 결정·취소 다음 프레임
안내가 끝나 있으면: SetGuideCount(1), SetGuidePos(17), "mn01_mode_ctrl_close", In
pid = 조작 플레이어; trig = GetTrigger(pid)
if trig & 0xA (B 0x2 | 0x8):  SE SQ_SE_SYS_CANCEL; closing = 1; result = 9; return
list = [i for i in 0..8 if shown[i]]
if list 비었음: Cursor(−1); return
if cursor == −1: target = list[0]
else:
  k = list.index(cursor) (없으면 0); n = len(list)
  rep = GetRepeat(pid); hold = GetHold(pid)
  UP = (hold & 0x400) ? 0x800 : 0x20800        // 십자 아래를 누르고 있으면 스틱 위는 무시
  DOWN = (hold & 0x800) ? 0x400 : 0x80400      // 십자 위를 누르고 있으면 스틱 아래는 무시
  if trig & UP:        k = (n + k − 1) % n      // 누름은 끝에서 반대쪽으로 넘어감
  elif rep & UP:       k = max(k − 1, 0)        // 반복은 끝에서 멈춤
  elif trig & DOWN:    k = (k + 1) % n
  elif rep & DOWN and k + 1 < n: k += 1
  target = list[k]
  if target == cursor:
    if trig & A(0x1):
      if !enabled[cursor]: 버튼 "miss"→다음 "disable_cursor", SE SQ_SE_SYS_ERROR, 진동,
                           noticeTimer ≤ 0 이고 알림 라벨 있으면 알림 등록, noticeTimer = 3.0
      else: 버튼 "press", SE SQ_SE_SYS_DECI, 진동, closing = 1, result = cursor
    return
  SE SQ_SE_SYS_CURSOR Play2D(새 버튼 페인 전역 위치), 진동
Cursor(target, false)
```

- 같은 프레임: 취소 > 이동 > 결정. A 는 이동이 없는 프레임에만 처리된다(이동과 결정이 같은 프레임에 겹치면 이동만).
- 0x8 비트의 버튼 이름 [미확정](A 0x1·B 0x2 다음 순서로 Y [추정]). 진동 이름 인자는 디컴파일에서 빠졌다 [미확정] → 웹은 `cursor`·`deci`·`error` 사건 이름만 낸다.
- 키 반복 간격은 bex 입력 모듈 [미확정](charselect 와 같은 RepeatGen 24f/6f [근사]).

### 5.1 커서 놓기 Cursor(b, immediate) @0x71000a55c0 [판독]

```
cursor = b
for i in 0..8:
  if i == b: OnButton(i, immediate)            // immediate: "cursor"/"disable_cursor"
                                               // 아니면 "on"/"disable_on" 재생 → 다음 "cursor"/"disable_cursor"
  else: 버튼 i "normal"/"disable_normal" (enabled[i] 로 고름)
for i in 0..8: OffMapIcon(i) ("off" 재생), x_win(i) 숨김
OnMapIcon(b) ("on" 재생, 60f 반복), x_win(b) 보임
b == −1: x_text_mess 숨김; 아니면 보임 + mn01_map_ui_mode_detail("[1:1:00cd]") 에 설명 라벨 삽입
```

### 5.2 Setup @0x71000a5080 / Start @0x71000a68e4 [판독]

- Setup: 버튼 i 마다 shown·enabled 계산, SetupButton(i)(이름 = mn01 텍스트 페인에 `im_modeNN_name` 삽입, 조이콘 아이콘, NEW), `x_btn_i` 보이기 = shown[i], 정렬 다시 계산(RequestAlignment), 보드 아이콘 저장 플래그.
- Start: closing 0, running 1, result −1, Setup, 커서가 −1 이거나 숨김이면 0..8 중 처음으로 shown·enabled 인 버튼(없으면 커서 그대로·Cursor 안 부름), `Cursor(c, false)`. phase > 1 이면 "in", phase 0, 보이기.
- 정렬(A_alignment_00, 크기 30×900, ali1 여백 −81): 보이는 버튼만 위에서부터 높이 172 + 여백 −81 = **91 간격**, 첫 버튼 중심 = 450 − 86 = 364 [데이터 + 참고 이미지: 숨김 1개일 때 첫 버튼 364·마지막 −273 이 캡처와 맞음]. 정렬 규칙 자체(위 정렬)는 [추정].

## 6. 배치·애니 수치 [데이터]

좌표 규칙은 charselect.md 6절(레이아웃 원점 = 화면 가운데, y 위 +).

| 요소 | 레이아웃 좌표 | 화면 | 크기 |
|---|---|---|---|
| 버튼 k(보이는 순번) | (−490, 364 − 91k) | x 470 | 부품 743×172, 창 frame 64, 글자 `x_text_00`(−232, 0) 왼쪽 원점 bqfont_middle 54 |
| 커서 `null_cursor` | 버튼 안 (−116, 0) → cursor 애니로 x −116 ↔ −104(30f 반복) | | `cursor_00` (−162, 0) 62×62, mn01_cursor_04(V mirror), black #070203 → white #cbff1d |
| 조이콘 `x_icon_00` | 버튼 안 (274, 0) | | 64×64 mn01_icon_feel_00 |
| 지도 `x_parts_map` | (340, 48) | (1300, 492) | 액자 bg 960×710 |
| 사진 창 `x_win_NN` | 지도 안: 00 (1,−92), 01 (246,142), 02 (−243,−25), 03 (−201,120), 04 (−243,136), 05 (−85,−22), 06 (106,−2), 07·08 (10,156) | | 부품 394×262, 그림 384×216 (0, 7) |
| 설명 `x_text_mess` | (340, −364) | (1300, 904) | 960×100, bqfont_small 45.6, #070203, 가운데, 2줄 |
| 안내 | charselect 와 같음(SetGuidePos 17 → x_pos_17 (900, −478), 오른쪽 정렬) | | |
| 배경 `null_win` | 전체 1916×1076: win_shadow, blur(화면 캡처 흐림), win(알파 50) | | |

버튼 색(정점색 content, 선형): normal = 흰 (255,255,255), on/cursor = 분홍 (255,19,73)→(255,85,48) 가로 그라데이션, press = 연두 (203,255,29) + base_ef 알파 255, disable_* = (7,2,3) 알파 204·글자 알파 163.

| 애니 | 길이 | 내용 |
|---|---|---|
| base_map_00 in / normal / out | 15 / 0 / 5 | null_00 tx 50→0(15f)·알파 0→255(10f) / 고정 / tx 0→40·알파 255→0 |
| btn_map_00 normal·off·disable_normal | 0 | 커서 숨김 |
| on·disable_on | 9 | null_00 ty 튐(에르미트, 값 0 기울기만) + 색 |
| cursor·disable_cursor | 30 반복 | 커서 x −116→−104→−116 |
| press | 19 | ty 0→−8(2f)→0(10f), 연두 |
| miss | 20 | tx 0→−10→10→−3→0 |
| icon_map_00 on / off | 60 반복 / 0 | 섬 아이콘 on 그림 보이고 배율 숨쉼 / off 그림 |
| win_map_00 in·out | 5 | ComUiMap 은 쓰지 않음(보이기만 바꿈) [판독] |

사진 창 그림 재질 `pict_mode`: 0번 칸 = 모드 그림(texCoordGen source 4 투영, 부품 덮어쓴 재질의 SRT 1.0), 1번 칸 = `mn01_base_thumbnail_00^s`(192×108, mirror, UV 0..2 → 둥근 모서리 마스크), TEV color 1·alpha 1 [데이터]. 투영 규칙 = 그림이 페인 사각형(384×216)에 1:1 [추정, charselect.md 6.4 얼굴 투영과 같은 해석], 두 칸 곱 [근사, render2d 규칙].

### 6.1 구현 중 헤드리스 1회차에서 드러난 그리기 규칙 (코드보다 먼저 여기 적음)

| 규칙 | 근거 | 웹 처리 |
|---|---|---|
| 창 windowFlags bit1 = 정점색을 내용뿐 아니라 **프레임(모서리·변)에도** 곱한다(nn::ui2d UseVtxColorAll) | [참고 이미지: 캡처의 선택 버튼 = 둥근 모서리까지 연두] [추정: 비트 이름]. 1회차 웹은 charselect render2d 규칙(프레임 = 흰 정점색)이라 연두가 내용 사각형에만 나왔다 | charselect render2d 는 고치지 않는다. 변환기가 bit1 창(버튼 `base`·`base_ef`, 배경 `win`·`blur`·`win_shadow`)도 그림 9장으로 나누고, 화면 코드가 매 프레임 창 노드의 정점색(애니 FLVC 대상)을 조각 꼭짓점에 쌍선형으로 나눠 준다. 프레임 재질 1개 창의 조각 UV 는 render2d 창과 같은 규칙(모서리 = LT 뒤집기, 변 = 경계 텍셀 한 줄) [근사]. 창 알파는 조각에 전해지도록 나눈 부모의 자식 알파 전파를 켠다 |
| 컬러 글리프(extension 폰트, ⭐ U+E021)는 글자색(#070203)을 곱하지 않는다 | [참고 이미지: 캡처의 노란 별]. 1회차 웹은 render2d 모드 2(텍스처 × 정점색)라 검은 별 | 설명 줄을 "일반 글자 / 컬러 글리프" 구간으로 나눠 컬러 구간만 흰 정점색 글자 노드로 그린다(구간 위치 = render2d 와 같은 진행폭 합) |
| 뒤 배경 | 1회차 웹 = 흰색(자리표시), 캡처 = 하늘색 흐림 | 2차 분석 6.2 로 확정: 3D 장면 캡처 + zabuton 흐림. 장면 그림은 [미확정], `backdrop` 옵션 자리만 |

### 6.2 메뉴 창(패널)·창 그림자·전체 배경 — 2차 분석 (사용자 지적 "반투명·그림자·배경 이미지가 없다", 구현 전에 씀)

**메뉴 창은 따로 있는 레이아웃이 아니라 `mn01_base_map_00` 의 `null_win` 세 창이다** [데이터]. ComUiMap 은 이 레이아웃 하나만 만든다(생성자 @0x71000a4f58) [판독]. 그리는 순서(뒤 → 앞):

| 창 | 크기 | 재질·정점색 | 하는 일 |
|---|---|---|---|
| `win_shadow` | 1916×1076, frame 32, windowFlags 19 | 프레임 `mn01_win_shadow_00^s`(흰 RGB, 알파 0→111 경사가 바깥 22 px 에만), 정점색 **검정** (bit1 = 프레임에도 정점색) | 패널 바깥 22 px 의 **검은 그림자**(떠 있는 느낌) |
| `blur` | 같음, windowFlags 3 | 내용 `blurC`: 칸 0·1 = `mn01_white_00^r`(자리표시), texCoordGen source 3(투영, projTexGen flags 1 = 화면 공간 [추정]), TEV 0. 프레임 `blurLT`: 칸 0 `mn01_win_00^s`(알파: 바깥 22 px 0, 안쪽 255 = 둥근 패널 모양) × 칸 1 자리표시. **사용자 데이터 `BexZabutonBlurred` = [1]** | 패널 안을 **흐린 3D 장면**으로 채움(아래) |
| `win` | 같음, **알파 50**, 흰 정점색 | 프레임 `mn01_win_00^s`, 내용 흰색 | 흐린 장면 위를 흰색 50/255 로 밝힘 = **반투명 흰 패널** |

- 패널 가장자리 = 창 가장자리에서 22 px 안(`mn01_win_00` 알파 경계) → 화면 x 1918 − 22 = 1896. 캡처 x 975 → 화면 539 + 975/0.7187 = **1896**, 아래 가장자리 캡처 y 735 → 화면 **1057**(1078 − 22 = 1056) [데이터 + 참고 이미지 계산 일치]. 캡처의 패널 경계선은 따로 그린 선이 아니라 이 알파 경계와 바깥 검은 그림자다(캡처 x 975→978 에서 (83,205,232)→(15,183,217) 로 어두워짐).
- `BexZabutonBlurred` 처리 [판독 main `FUN_7100057408`(문자열 "BexZabutonBlurred" 유일 참조) → `FUN_7100058730`, `analysis/decomp/modesel_main_zabuton_pane.c`]: 페인 사용자 데이터의 정수 목록(여기 [1])이 가리키는 **재질 텍스처 칸을, 페인의 모든 재질에서 렌더러의 흐림 버퍼(렌더러 객체 +0x38)로 바꾸고**, 페인의 화면 사각형을 흐림 영역 목록(+0x158, 최대 8개, 합집합 +0x1d8/+0x1e0)에 더한다. 버퍼 이름 `BexRendererModule_ZabutonBlurredBuffer`, 셰이더 `libbex/libbexgfx/resident/shader/gfxshader/zabuton_blurred_down_first / down / up.bnsh`(축소 → 축소 반복 → 확대 흐림) [데이터: main 문자열]. 즉 **(b) 렌더 타깃 캡처 + 블러**다. 흐림 단계 수·반경은 셰이더·호출부 미판독 [미확정].
- 흐림의 원본 장면 = 그 순간의 **menu01 3D 맵 월드 화면**(광장·하늘·바다·섬). MapMenuImpl 은 `ComMenuCamera::Stop` 만 하고 카메라를 옮기지 않는다 [판독] → 플레이어가 맵을 연 자리의 시점 그대로라 **고정 그림이 아니다**. 패널 바깥(오른쪽·아래 22 px 여백)에 보이는 선명한 하늘·바다도 같은 3D 장면이다(흐림 없음).
- 원본 에셋으로 만들 수 있는 가장 가까운 방법: menu01 장면(`menu~menu01.nx.bea/menu/menu01/model` 117개 모델·`MapStructure.json` 배치·`env`)을 3D 로 그리고 ComMenuCamera 위치에서 찍은 뒤 zabuton 흐림을 거는 것 = **3D 맵 월드 포팅**(이 화면 범위 밖) → 배경 그림 자체는 **[미확정]**. 이 모듈은 장면을 받을 자리만 만든다: 옵션 `backdrop`(이미지·캔버스) → 화면 전체 뒤에 그대로 + `blur` 창의 칸 1(바뀌는 칸, 원본 규칙대로) 에 흐린 사본(화면 공간). 흐림 반경 [근사: 값 미판독, 화면 높이의 2%]. 주지 않으면 원본에서 버퍼가 들어올 칸을 데이터의 자리표시(흰색)로 그린다(지금과 같음).
- 버튼 [참고 이미지 측정]: 버튼판 픽셀은 (255,255,255)/(254,255,255) = **불투명 흰색**이다(반투명 아님). 버튼 사이·둘레가 밝게 번져 보이는 것은 `mn01_win_15px_00` 프레임 알파 경계(흰 RGB) + 그 뒤의 반투명 패널·흐린 장면 때문이고, 버튼 아래에 따로 그림자 페인·그림자 효과 블록은 없다 [데이터: 레이아웃 섹션 전부 확인 — lyt1·usd1·txl1·fnl1·mat1·pan1·wnd1·txt1·ali1·prt1·grp1 뿐, 드롭 섀도·절차적 도형 블록 없음. 사용자 데이터는 ui2dsys(정렬 정보·애니 태그 목록)와 BexZabutonBlurred 뿐].
- **지금 웹이 흰 바탕인 원인**: 세 창(그림자·흐림·반투명 흰 패널)은 변환·그리기가 되고 있다(1차 비교 그림의 화면 테두리 검은 그림자가 그것). 빠진 것은 `blur` 칸 1에 들어갈 **흐린 3D 장면**과 패널 바깥의 **3D 장면** 둘뿐이고, 웹은 칸 1 을 자리표시 흰색으로 그려 패널 전체가 흰색이 된다. 변환기가 버린 페인·블록은 없다(`BexZabutonBlurred` 사용자 데이터만 쓰지 않았음 → 이번에 명세로 옮김).
- 사진 액자(지도 그림 `mn01_pict_map_00^q`)의 기울고 휜 흰 테두리는 **텍스처 알파 자체의 모양**이다(왼쪽 위 들림·오른쪽 아래 말림). 텍스처 알파 경계를 캡처 좌표로 옮기면 위 74 / 캡처 75~76, 아래 583.6 / 582, 왼쪽 위 들림(캡처 x 210~230 에서 위쪽이 흰색 아님)·오른쪽 아래 말림(y 575 에서 865 / 867) 이 캡처와 같다 [데이터 + 참고 이미지 계산] → 고치지 않는다. 흰 배경에서 경계 음영만 보여 기울어 보인다.

## 7. 소리·진동·BGM

→ 화면별 원본 BGM(라벨·시작·전환 페이드)·웹 연결: [04_sound.md §12.14](../engine/04_sound.md) (2026-10-08).

| 사건 | 라벨 | 볼륨(/127) | 근거 |
|---|---|---|---|
| 커서 이동 | SQ_SE_SYS_CURSOR | 110 | [판독] Play2D(새 버튼 전역 위치) |
| 결정 | SQ_SE_SYS_DECI | 110 | [판독] Play |
| 불가 결정 | SQ_SE_SYS_ERROR | 60 | [판독] Play |
| 취소 | SQ_SE_SYS_CANCEL | 110 | [판독] Play |

볼륨·변환 근사(sound_seq.py render)는 charselect.md 7.1 과 같다. BGM 은 menu01 장면의 `SM_BGM_MENU_MAP` 이 이미 돌고 있다(charselect.md 12.3) — 이 화면은 BGM 을 바꾸지 않는다. 결정이 파티 지원 여행(7)일 때만 MapMenuImpl 이 StopBgm [판독].

## 8. 다른 기능과의 상호작용

- 뒤 배경: 6.2 (메뉴 창 세 겹·`BexZabutonBlurred` 판독). 3D 맵 월드 장면은 이 모듈 범위 밖 → 장면 그림 **[미확정]**, 웹은 `backdrop` 이 없으면 자리표시 흰색.
- 결정 뒤: 다음 시퀀스 FocusImpl 이 Wipe FadeOut(1.0, 유형 1) 후 즉시 숨김. 와이프 모양은 이 화면 밖 [미확정] → 웹은 결정 사건 직후 60프레임(1.0 [근사]) 마지막 화면을 유지한 뒤 끝낸다.
- 취소(결과 9)·광장(8): MapMenuImpl 이 람다 파이버(vtable 0x710018f240·0x710018f1f8)를 띄운다. 람다 본문은 이번에 판독하지 않았다 [미확정] → 웹은 취소면 `Out(false)`("out" 5f) 뒤 끝, 광장은 다른 결정과 같이 처리 [추정].
- 온라인(프렌드 매치) 분기·알림 UI(UiNoticeModule)·플레이어 상태 UI·보상 안내·인원 대화는 범위 밖. 웹은 알림을 `notice(label)` 사건으로만 낸다.
- `ComUiPackModeSelectView`(@0x71000a9b2c)는 걸어 다니며 모드 건물에 다가갈 때의 다른 UI 로 이 화면이 아니다 [판독: GetUiMap 을 부르기만 함].

## 9. 웹 포팅 구조 (독립 모듈 명세)

### 9.1 원칙
- 위치 `web/script/shell/modeselect/`. import 허용: 같은 폴더, `three`, **`../charselect/scene2d`·`../charselect/render2d`·`../charselect/state`(RepeatGen)·`../charselect/types`(명세 형식)** (공용으로 끌어올리지 않고 그대로 import). 금지: `script/game/core`·`script/games`·`script/view`·`script/game.ts`·`script/env.ts`. 3D 없음(셰이더 미리 컴파일 대상 없음 — 2D 셰이더 1개는 화면 시작 때 첫 그리기 전에 `compile` 한다).
- 명세 JSON 형식은 charselect `Spec` 의 레이아웃·폰트·텍스처 부분을 그대로 쓰고, 이 화면 표(`modes`)·텍스처 덮어쓰기(`partTex`)를 더한다.

### 9.2 파일
| 파일 | 책임 |
|---|---|
| `types.ts` | 명세(`ModeSpec`)·어댑터·옵션 형식 |
| `state.ts` | 순수 상태기계(5절): 입력 {trig, rep, hold} + 레이아웃 애니 끝 신호 → 사건(커서·버튼 애니·섬 아이콘·창·설명·SE·진동·알림·결정·취소) |
| `screen.ts` | 컨트롤러: 사건 → LayoutInst(charselect scene2d)·Render2D, 정렬, 여러 줄 설명(줄마다 글자 페인 복사본) |
| `index.ts` | 공개 진입점 |

페이지: `script/modeselect_page.ts`(입력 비트·SE·루프, charselect_page.ts 방식), `script/ui_main.ts` UIS 항목 `modeselect`. 에셋 `web/assets/modeselect/`(spec.json, tex, font, sound) ← `web/tools/analysis/modesel_web_assets.py`(charsel_web_assets.py 의 변환 함수를 import).

### 9.3 공개 인터페이스
```ts
createModeSelect(opts: {
  canvas; assets: { url(p) }; input: { poll(): { hold: number; trig: number } };   // 조작 플레이어 1명
  sound?: { play?(label, url, gain, x?); vibrate?(name) };
  flags?: { quest?: boolean; bd02?: boolean; bd03?: boolean; bd06?: boolean; newBd?: boolean; newMgm?: boolean };  // 저장 플래그 0x28·0x20·0x21·0x22, NEW
  playable?: (button: number) => number;    // CheckModePlayable 대체(기본: 0, 버튼 7 은 flags.quest ? 0 : 4)
  initialCursor?: number;
  backdrop?: CanvasImageSource;            // 6.2: 3D 장면 그림(없으면 자리표시). 페이지는 ?bg=<url>, ?bg=none, 기본 = 임시 대역 assets/modeselect/backdrop_temp.png
  onNotice?(label: string); onDecided?(r: { button, key, name }); onCancel?(); onFinished?(decided: boolean);
}): Promise<{ step(); render(); dispose(); state; spec; layouts }>
```

### 9.4 원본과 같게 / 바꾼 것
| 항목 | 원본 | 웹 |
|---|---|---|
| 이동·결정·취소 규칙, 같은 프레임 우선순위, 알림 3 s | 5절 | 같게 |
| 배치·애니·색 | 6절 데이터 | 데이터 그대로(그리기는 charselect render2d) |
| 여러 줄 글자 | ui2d 텍스트 페인 줄바꿈 | 줄마다 같은 글자 페인을 복사해 줄 높이(폰트 높이×배율, 줄 간격 0)만큼 내려 그린다, 줄마다 가운데 정렬 [참고 이미지: 두 줄 모두 가운데] |
| 사진 창 테두리(프레임 재질 8개, 꼬리 = `mn01_win_thumbnail_01` + 부품마다 다른 SRT t: 00 위 −4.6, 01 아래 −4.2, 02 −7.4, 03 −4.6, 04 −6.7, 05~08 −4.6) | ui2d 창 | (구현 중 추가) charselect render2d 창은 LT 재질 하나만 뒤집어 쓰므로, 변환기가 이 창을 그림 9장(`base#LT`…`base#C`)으로 나눈다. 변 UV = 텍셀 단위(변 길이 330/32), 모서리 1:1 [추정: 꼬리 SRT −4.6 → 위 변 가운데 = 캡처의 위쪽 꼬리] |
| 뒤 배경(3D 흐림 캡처) | 렌더러 흐림 버퍼를 `blur` 칸 1 에(BexZabutonBlurred [1]), 패널 밖은 3D 장면 | 옵션 `backdrop`: 화면 뒤 전체 + 흐린 사본을 `blur` 창 조각의 칸 1 에(화면 공간 UV, 조각마다 재질 사본으로 칸 0 은 원래 UV 유지). 흐림 = 캔버스 blur 반경 화면 높이 2% [근사]. 없으면 자리표시 흰색 [미확정: 장면] |
| 결정 뒤 와이프 | FadeOut 1.0 유형 1 | 공용 전환 White 속도 1.0(20f) 끝 → 끝 (2026-10-09, [../engine/15_transition.md](../engine/15_transition.md)) |
| 키 반복 | bex [미확정] | RepeatGen 24/6f [근사] |

## 10. 검증 계획 / 결과

계획: `tools/test_modeselect.ts`(상태기계: 처음 커서, 위·아래 누름 넘김, 반복 끝 멈춤, 숨김 버튼 건너뛰기, 십자/스틱 겹침 규칙, 결정·불가(miss·ERROR·알림 3 s)·취소 우선순위, 이동 프레임엔 A 무시), `tools/check_modeselect.ts`(명세 ↔ 원본 덤프: 노드·애니 길이, 모드 표 9행 라벨·창·아이콘, 표 문자열 = modesel_tables.py 결과, 텍스트 문구, 텍스처·폰트 글리프·소리 파일, import 그래프), 헤드리스 1회(캡처와 같은 press 프레임).

결과(2026-10-06):

| 검사 | 명령 | 결과 | 수준 |
|---|---|---|---|
| 상태기계 | `npx tsx tools/test_modeselect.ts` | **71/71 통과** — 시작(In·첫 가능 버튼·이전 커서 유지/숨김이면 다시 고름), in 중 입력 무시, 위/아래 누름 넘김(0↑ → 8, 7 숨김), 반복 끝 멈춤, 숨김 건너뛰기, 십자/스틱 겹침, 위·아래 동시 = 위, 결정(press·DECI·다음 프레임 decided·안내 Out), 이동+A 같은 프레임 = 이동만, 불가(miss→disable_cursor·ERROR·알림·3 s 재표시 막기), 취소 B·0x8(이동·결정보다 먼저), Out(false)/(true), 키 반복 24/6f, 파티 지원 여행 해금 9칸 | 재구현 계산(판독 규칙) |
| 명세 대조 | `npx tsx tools/check_modeselect.ts` | **1062/1062 통과** — 8개 레이아웃 142 노드(이름·위치·크기·배율·알파·원점), 창 조각 9장 크기 합 6창, 애니 길이·반복, 모드 9칸 라벨 = nro 표(modesel_tables.py 실행)·문구 = koKR, 창·섬 아이콘·다음 시퀀스 대응, 사진 창 그림 9장·꼬리 위치, 화면 좌표(첫 버튼 (470,176)·지도 (1300,492)·설명 (1300,904)·x_win_00 (1301,584))와 캡처 환산 y(101·560·329), 글리프·⭐ 컬러 글리프·소리·볼륨, import 그래프(4파일, 허용 = 같은 폴더·three·charselect scene2d/render2d/state/types) | 데이터 |
| 타입 | `npx tsc --noEmit` | 새 오류 0 (기존 tools/serve.ts 미사용 변수 2개만) | |
| 기존 | `test_charselect` 55/55, `check_charselect` 2207/2207, `test_mg1801` 실패 0 | 안 깨짐 | |
| 빌드 | `npx tsx tools/build.ts` | dist 생성(assets/modeselect 포함) | |
| 헤드리스 | `npx tsx tools/shot_modeselect.ts` (dev/ui?ui=modeselect&auto=1&mute=1) | 2회(아래). 마지막 회: 콘솔 오류 0, 결과 문자열 "bd (마리오 파티, 버튼 0, 다음 2)", 스크린샷 `test/out/modeselect/01_start.png`·`02_rhythm.png`·`03_press_capture_pose.png`, 나란히 비교 `compare_capture.png` | 웹 실행 |

헤드리스 1회차에서 6.1 의 두 규칙(정점색 전체·컬러 글리프)과 비교 그림 합성 배율 버그(캔버스 스크린샷이 CSS 크기)가 드러나 문서(6.1)를 먼저 고친 뒤 코드를 고치고 2회차로 확인했다.
2회차 캡처 대조(같은 영역, 캡처 좌표): 선택 버튼 캡처 (230,254,96) / 웹 (224,255,95), 지도 바다 (40,146,242) / (42,147,247), 사진 창 테두리 (75,170,217) / (65,166,217) — 버튼 배치·조이콘 3개·지도·꼬리 달린 사진 창·두 줄 설명·노란 별 위치가 맞는다.
남은 차이: 뒤 배경(캡처 하늘색 흐림 / 웹 흰 자리표시, 8절 [미확정]) — 그래서 흰 버튼판이 웹에서는 배경과 구별되지 않는다. 버튼 글자 끝이 캡처보다 몇 px 길다(4번째 칸 "처" 끝이 잘린 영역 안으로 약 5 px 들어옴) — 폰트 진행폭 차이 [미확정].

2차(메뉴 창·배경, 6.2) 결과 — 순서: 디컴파일 C(`modesel_main_zabuton_pane.c`) → 6.2 문서 → 변환기(`spec.zabuton`, 흐림 창 프레임 조각 재질 사본)·화면(`backdrop`)·페이지(`?bg=`) → 검사 → 헤드리스 마지막 1회.
- `check_modeselect` **1068/1068**(추가 6: BexZabutonBlurred 칸 [1] = 덤프, win 알파 50·전파, 그림자 정점색 검정, 흐림 조각 재질 사본 8, 패널 가장자리 화면 1896 ≈ 캡처 x 975 → 1895.6, 아래 1056 ≈ 캡처 y 735 → 1056.7), `test_modeselect` 71/71, tsc 새 오류 0, charsel 55/55·2207/2207, mg1801 실패 0, 빌드 통과.
- 헤드리스(1회, 콘솔 오류 0): 기본(`compare_capture.png`) = 장면 없음 → 패널 안 흰색(자리표시), 패널 밖 검정. `?bg=` 경로 시험(`04_backdrop_test.png`, `compare_backdrop_test.png`) = **시험용 대역**으로 원본 광장 썸네일 `mn01_pict_mode_08`(실제 배경 아님)을 넣은 것: 반투명 흰 패널(안쪽 흐린 장면 + 흰 50/255), 패널 둥근 가장자리가 캡처와 같은 x 975, 패널 밖 검은 그림자 경사 + 선명한 장면, 불투명 흰 버튼판·둘레 번짐이 캡처와 같은 구조로 나온다(색 값은 대역 그림이라 비교 대상 아님).

## 11. 미확정 사항

| 항목 | 상태 | 필요한 근거 |
|---|---|---|
| 입력 비트 0x8 의 버튼 | [미확정] (Y [추정]) | bex InputModule 비트 표 |
| 진동 이름 | [미확정] | VibrationModule::Play 인자 문자열(디컴파일 누락) |
| 정렬(ali1) 규칙 | [추정 위 정렬, 캡처 일치] | nn::ui2d::Alignment 판독 |
| 뒤 배경 장면 그림 | [미확정] 범위 밖(6.2: 구조는 판독) | menu01 3D 맵 월드 포팅 + ComMenuCamera 위치 |
| zabuton 흐림 단계 수·반경 | [미확정] | zabuton_blurred_down_first/down/up.bnsh 와 렌더러 호출부 판독 |
| 결정 뒤 와이프 유형 1 | [미확정] | WipeModule |
| sys_icon_new(NEW) 레이아웃 위치 | [미확정] | 다른 lyt 묶음 |
| "normal_00" 태그 없음 → 동작 | [추정 마지막 값 유지] | ComUiBase::PlayAnimation 판독 |
| 투영 텍스좌표(사진 창) | [추정 1:1] | ui2d projTexGen |
| 원본 화면 실행 대조 | 캡처 1장 | 실행 캡처 여러 장 |

임시 배경(사용자 지시 2026-10-06 "3번 일단 임시로 넣어줘 비슷한걸로"): 원본 배경은 런타임 3D 맵 월드 캡처라 고정 그림이 없으므로, 페이지 기본 `backdrop` 을 원본 menu01 하늘 텍스처 `menu01_sky`(1000×250, BC7 sRGB) 의 x 300~744 영역을 16:9 로 늘린 그림 `assets/modeselect/backdrop_temp.png` 로 둔다 [근사: 원본에 없는 고정 대역, 바다·섬 없음]. 만들기 `web/tools/analysis/modesel_backdrop_temp.py`. 3D 맵 월드 포팅 후 실제 캡처로 바꾼다.
