# 캐릭터 선택 화면 (bq::ComUiSelectPlayerCharacter) — 원본 분석과 독립 모듈 명세

2026-10-06. 상태: **분석 완료(판독·데이터) → 이 문서를 근거로 구현 완료(웹), 캡처 1장과 화면 대조**. 원본 실행 대조는 없다.
이 문서는 구현 전에 1~9·11절을 먼저 썼고, 구현 중 헤드리스 대조로 드러난 그리기 규칙 4가지(6.5절)와 10절 결과를 뒤에 더했다.
형식은 `F:/dev/mps/web/docs/분석.txt` 11절 구성을 따른다.

확정 수준: **[실행]** 원본 실행 확인(이 문서에는 없음), **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**,
**[참고 이미지]** 사용자 캡처(`2.png`, 화면 x 530~1920 구간을 0.716배로 자른 것)와 대조. 자체 도구·변환 실행은 **[실행: 변환]**처럼 따로 적는다.
주소는 SwitchLoader 기본 베이스 0x7100000000 기준 main NSO(`main @0x…`)다.

이 화면은 mp4·mpj·mps 공용 엔진으로 합칠 때 다시 쓰려고 **게임 엔진층(script/core·script/games·view/lyt.ts)에 기대지 않는 독립 모듈**로 만든다(9절).

---

## 1. 기능 개요와 사용자에게 보이는 동작

파티(접속) 흐름 `ComUiSettingPlayer`의 세 번째 단계에서 사람 플레이어가 각자 캐릭터를 고른다.

| 요소 | 보이는 것 | 근거 |
|---|---|---|
| 배경 | 파랑→청록 세로 그라데이션 + 반투명 풍선 무늬가 대각선으로 천천히 흐름(360프레임 반복) | `sys_bg_set_00` [데이터] |
| 제목 띠 | 위쪽 검은 띠(900×100 + 양쪽 338 폭 투명 그라데이션)에 흰 글자 "캐릭터를 선택해 주십시오" | `sys_connect_tlp_00`, 라벨 `mn01_connect_ui_chara_title` [판독 main FUN_7100344890] |
| 카드 | 사람 플레이어 수(1~4)만큼 흰 창. 3D 캐릭터 상반신, 아래 흰 그라데이션 마스크, 캐릭터 이름(갈색 #070203), 계정 이름, 컨트롤러 아이콘·LED | `sys_base_charasel_00` + `sys_win_charamodel_0N` [판독 FUN_710033eeb0] |
| 아이콘 격자 | 11열×2줄 = 22명 + 왼쪽 "랜덤" 버튼. 잠긴 캐릭터(폴린·닌군)는 검은 실루엣 | `sys_base_charasel_01` [데이터][판독 생성자] |
| 커서 | 플레이어 색 테두리 + 플레이어 번호(1P…)·CPU 글자 + 컨트롤러 아이콘. 테두리 빛이 120프레임 주기로 숨쉼 | `sys_cursor_charasel_00` [판독 FUN_710033f5e0] |
| 결정 | 아이콘이 눌리고(press) 플레이어 색 배경으로 고정(pressed), 카드 캐릭터가 선택 모션 a→b, 캐릭터 보이스 | [판독 FUN_710033a1e0] |
| 전원 결정 | 아무도 안 고른 아이콘이 어두워지고(disable), 가운데에 빨강→분홍 띠의 " OK!" 버튼이 나온다. 조작 플레이어가 A → 다음 단계 | [판독 FUN_710033a1e0, FUN_710033b540] |
| 뒤로 | 오른쪽 아래 "(B 아이콘) 뒤로" 안내. 조작 플레이어가 결정 전 B → 화면 종료(이전 단계) | [판독] |

캡처 대조 [참고 이미지]: 3장 카드(3인 배치 −620/0/+620), 격자 버튼 2번(피치) 화면 (596, 744) → 캡처 (47, 533), 10번 칸(폴린) 실루엣, 21번(닌군) 실루엣, "뒤로" 오른쪽 끝 x≈1864·y≈1019 — 모두 아래 좌표와 맞는다.

## 2. 분석 대상 원본·버전·자료 위치

| 항목 | 위치 |
|---|---|
| 원본 | Super Mario Party Jamboree US v0 (`c:/dev/original/`, 읽기 전용) |
| 코드 | main NSO `bq::ComUiSelectPlayerCharacter` @0x7100339360~0x7100343998, 3D 카드 뷰 클래스(이름 없음) @0x7100340180~, `bq::ComUiSettingPlayer` @0x7100344a00~, `bq::ComUiGuide00` @0x71002776a4~ |
| 디컴파일 | `analysis/decomp/charsel_select_pc.c`(선택 화면 전체), `charsel_setting_player.c`(부모 흐름), `charsel_title_bg.c`(제목·배경 부품), `charsel_guide00.c`(안내). 색인 `analysis/decomp/INDEX.tsv` |
| Ghidra | `ghidra_work/charsel`(jamboree_main 사본), 실행 스크립트 `web/tools/analysis/charsel_ghidra.sh` + `CoreTool.java`/`SceneXrefDecomp.java` |
| 레이아웃 | `extracted/bea/bq.nx.bea/Parts.lyt`(SARC) — 아래 3절 표의 bflyt·bflan. 덤프 `extracted/converted/ui/bq_Parts/*.json`, 요약 `analysis/charsel_panes.txt`·`analysis/charsel_anims.txt` |
| 데이터 | `bq.nx.bea/common/data/selectCharacterList.json`(버튼 번호·카메라), `characterlist.json`(모델·배율), 메시지 `extracted/message/koKR/{menu01_main,system,im_common}.json` |
| 3D 환경 | `bq.nx.bea/common/env/cmm_env00.fmdb`·`cmm_dir_light00.fmdb`·`cmm_post00_chr_slct.fmdb`, 텍스처 `common/env/textures/neutral00_ibl_{irr,rad}.bntx`. 덤프 `analysis/charsel_env_dump.json`([실행: camera_probe env]) |
| 캐릭터 | `chara~pcNN.nx.bea`(모델), `chara~pcMot_co.nx.bea`(`pcNN_co_idle00`, `co_chr_idle00`(pc07·pc13만), `co_chr_slct00a/b`) |
| 폰트 | `font~font_kr.nx.bea/Parts.lyt/Font_kr/bqfont_{middle,large,small}{,_shadow,_extension,_usen}.ffnt` |
| 소리 | `_ResidentAudio.nx.bea/_Resident/AddonAudioProject.fspj` (SQ_SE_SYS_*, SQ_VOI_PCnn_MENU00_SELECT) |
| 공용 규칙 문서 | 레이아웃 포맷 [../engine/05_ui_input.md §3](../engine/05_ui_input.md), 카메라·조명 [../engine/07_camera_lighting.md](../engine/07_camera_lighting.md), 캐릭터 [../engine/09_character.md](../engine/09_character.md), 소리 [../engine/04_sound.md](../engine/04_sound.md) |

## 3. 진입점과 전체 호출 흐름

### 3.1 생성 [판독]

```
bq::ComUiSettingPlayer::ComUiSettingPlayer            main @0x7100344a00   (menu01 접속 흐름)
  Entity "ComUiSettingPlayer_HeaderTelop" + FUN_7100344680   → Parts.lyt/sys_connect_tlp_00 (그리기 순위 0x8e10)
  Entity "ComUiSettingPlayer_Guide" + ComUiGuide00 (0x8d10, SetGuidePos 17, "sys_ctrl_back")
  Entity "ComUiSettingPlayer_SelectPC" + ComUiSelectPlayerCharacter(bool = 1, 슬롯 수)
bq::ComUiSelectPlayerCharacter::ComUiSelectPlayerCharacter(entity, bool constrained, int slots)   @0x7100339360
  CreateLayout Parts.lyt/sys_base_charasel_01 (격자), 순위 0x8e00, 숨김
  표 = selectCharacterList.json "CharacterList" (FUN_71003390f0, 레코드 20 B {BtnNo, CamX, CamY, CamZ, FovY})
  i = 0..21: 버튼 이름 "x_parts_btn_%02d" % 표[i].BtnNo (FUN_7100339b30, i = 22 → "x_parts_btn_random")
     잠금: i == 12(폴린) → GameFlag 1, i == 21(닌군) → GameFlag 0. 플래그 없으면 잠김
     얼굴 = (잠김 ? "%s/x_face_secret" : "%s/x_parts_pc128") 의 StatusFace(vt+0xc0, i)
     "%s/x_null_open" 보임 = !잠김, "%s/x_null_secret" 보임 = 잠김
  "x_parts_btn_random/x_text_random" = mn01_connect_ui_chara_random ("랜덤")
  "x_null_win" 보임 = !constrained                                    (접속 흐름은 constrained = 1 → 창 배경 없음)
  slots(+0xf8) = clamp(slots, 4, 8) — 단 5~7은 그대로 [판독: if >7 → 8; if <5 → 4]
  Entity "UiSelectPlayerCharacterModelView" + 카드 뷰(FUN_7100341090, 순위 0x8dff)
     constrained 이면 격자 레이아웃을 카드 뷰의 "x_null_win_charasel" 페인에 묶는다(SetConstraint) → 격자 원점 (0, −296)
  Entity "UiSelectPlayerCharacterOK" + Parts.lyt/sys_btn_ok_00 (순위 0x8e01, 숨김), x_text_ok = mn01_connect_ui_chara_ok (" OK!")
  +0x10c = WorkModule::GetOperationPlayerId (조작 플레이어)
카드 뷰 FUN_7100341090:
  CreateLayout Parts.lyt/sys_base_charasel_00, 순위 0x8dff, 1~4win 모두 숨김
  Entity "UiSelectPlayerCharacterBG" + Parts.lyt/sys_bg_set_00 (순위 0x8dfe) "normal" 재생
  Entity "SelectPC_Env" (common/env/cmm_env00.fmdb), "SelectPC_Light" (cmm_dir_light00.fmdb), "SelectPC_Post" (cmm_post00_chr_slct.fmdb)
  Entity "SelectPC_Camera" ×4 → 그래픽 레이어 1·2·3·4 (+0x268), 모델 레이어 비트 2·4·8·16 (+0x278)
```

그리기 순위(값이 클수록 앞) [판독 vt+0x78 인자, 앞뒤 해석은 캡처와 일치 = 제목이 카드 위]: 배경 0x8dfe < 카드 0x8dff < 격자 0x8e00 < OK·선택 화면 안내 0x8e01 < 제목 0x8e10.

### 3.2 In(bool skipIn) @0x710033d680 [판독]

1. 상태(+0x108) < 2 면 무시. 레이아웃 "in"(skipIn이면 "normal") 재생, 상태 = skipIn ? 1 : 0, 보이기.
2. 안내 Entity "UiSelectPlayerCharacterGuide" + ComUiGuide00(0x8e01): 모드(+0x104) 2이고 constrained 아니면 오른쪽 정렬 + `x_guide_pos_00` 에 묶기, 아니면 `SetGuidePos(17)`. 문구 `sys_ctrl_back` (" 뒤로", 첫 글자 U+E003 = 버튼 아이콘 글리프). `In`.
3. 사용 불가 목록(+0x178, `SetEnableCharacterBtn(id, false)`로 채움) 버튼은 "disable", 커서 표시 없음.
4. 플레이어 기록(4절)을 0..slots−1 초기화: 플레이어 0 커서 = `FUN_710033e620(PlayerWork(0).GetCharacterID())`(이미 다른 플레이어 커서가 있거나 사용 불가면 0..21 중 첫 빈 칸). 플레이 모드 0x12 + 미리 고른 저장 값이 있으면 저장 데이터 +0x70 값. 플레이어 1..: 같은 규칙.
5. 23개 버튼 모두 "normal"(사용 불가면 "disable").
6. 모드 0: 플레이어마다 `type(+0x3c)` = (PlayerType ≠ 0) → 0 사람·1 COM. 사람에게 카드 슬롯 번호(+0x44) = 사람 순번. 사람 커서가 사용 불가 칸이면 첫 빈 칸(없으면 22 랜덤).
7. 카드 뷰: `FUN_710033eeb0(view, 사람 수)` → N창 배치, 사람마다 `FUN_710033f160`(이름표·컨트롤러), 이름표 보이기, 카드 "in".
8. 사람마다 `+0x48 = 1`(격자 위에 커서 있음), `FUN_710033c3f0`(커서 놓기 → 카드 모델 갱신). COM 중 `+0x48`이 켜진 것(모드 1·2에서 미리 정한 COM)은 커서 표시 + "pressed" + 결정 상태.
9. 모드 0이고 사람이 1명이면 조작 플레이어(+0x10c) = 그 사람.

### 3.3 매 프레임 갱신 — 파이버 람다 `FUN_7100339e6c`/`FUN_7100339f2c`(이벤트 0x5f454e00) → 상태별 [판독]

| 상태 +0x108 | 함수 | 하는 일 |
|---|---|---|
| 0 | FUN_710033a130 | 레이아웃 애니(in) 끝(재생 상태 3)이면 "normal", 상태 1 |
| 1 | FUN_710033a1e0 | 선택(5절) |
| 2 | FUN_710033b540 | OK 확인 대기(5.4) |
| 3 | FUN_710033be60 | OK 버튼 press 애니 끝 → +0xfd(IsDecided)=1, Out(0) |
| 4 | FUN_710033bfd0 | Out 애니 끝 → 기록 초기화, 숨김, 상태 5 |
| 5 이상 | — | `IsFinished()` = 상태 > 4 |

Out(bool immediate) @0x710033e9f0: 즉시가 아니면 레이아웃 "out" + 상태 4, 즉시면 초기화 + 상태 −1. OK 버튼 숨김, 카드 뷰 정리(FUN_710033fab0), 안내 Out, 보이스 정지(Stop_Preset 1), 덕킹 해제.

## 4. 구조체·필드·상수 표

기준 객체: `bq::ComUiSelectPlayerCharacter`(this). writer/reader 는 판독한 함수.

| 오프셋 | 형식 | 웹 권장 이름 | 의미 | writer | reader |
|---|---|---|---|---|---|
| +0x38 + 0x14·i | s32 | `players[i].pid` | 플레이어 ID(= 입력 패드 번호) | In | 갱신 전부 |
| +0x3c + 0x14·i | s32 | `players[i].type` | −1 없음, 0 사람, 1 COM | In | 갱신 |
| +0x40 + 0x14·i | s32 | `players[i].cursor` | 커서 = 캐릭터 표 번호 0..21, 22 = 랜덤 | FUN_710033c3f0 | 전부 |
| +0x44 + 0x14·i | s32 | `players[i].slot` | 카드 슬롯(사람 순번), 보이스 핸들 칸 | In | 카드·보이스 |
| +0x48 + 0x14·i | u8 | `players[i].onGrid` | 격자 위에 이 플레이어 표시가 있음(사람 = 1) | In | 점유 판정 |
| +0x49 + 0x14·i | u8 | `players[i].decided` | 결정 | 갱신 | 갱신 |
| +0xd8 + 4·i | s32 | `result[i]` | 확정 캐릭터(표 번호) | 상태 2 | 외부 |
| +0xf8 | s32 | `slots` | 플레이어 칸 수 | 생성자 | 루프 상한 |
| +0xfc / +0xfd / +0xfe / +0xff | u8 | `cancelled` / `decided` / `writePlayerWork` / `noAutoOut` | B 종료 1회 / IsDecided / PlayerWork 에 SetCharacterID / Out 자동 호출 막기 | 갱신 | 부모 |
| +0x100 | u8 | `constrained` | 생성자 bool | 생성자 | 표시 |
| +0x104 | s32 | `mode` | 0 일반, 1 한 명 지정(+0x114 캐릭터), 2 단독 사람(+0x110) [판독, 모드 1·2 화면은 범위 밖] | 외부 | 전부 |
| +0x108 | s32 | `state` | 3.3 표 | | |
| +0x10c | s32 | `operatorPid` | 조작 플레이어(B 종료·OK 결정 권한, 모드≠0 이면 모든 입력 원천) | 생성자·In | 갱신 |
| +0x178..0x188 | vector<int> | `disabled` | 사용 불가 캐릭터(SetEnableCharacterBtn) | 외부 | 이동·결정 |
| +0x190 | ptr | `table` | selectCharacterList | 생성자 | 전부 |

**점유(occupied) 판정** `occ(c) = ∃ j: players[j].cursor == c && (players[j].type == 0 || players[j].onGrid)` — 자기 자신도 포함한다 [판독: 같은 식이 FUN_710033a1e0·c650·d270·b540·In 에 반복].

**캐릭터 표** [데이터 selectCharacterList.json + characterlist.json + im_common koKR]:

| 표 번호 | BtnNo | 모델 | 이름(koKR) | 배율(IndividualScale) | 카메라 위치 | FovY |
|---|---|---|---|---|---|---|
| 0 | 0 | pc01 | 마리오 | 1 | (0, 1.1, 3.5) | 30 |
| 1 | 1 | pc02 | 루이지 | 1 | (0, 1.2, 3.5) | 30 |
| 2 | 2 | pc03 | 피치 | 0.9 | (0, 1.2, 3) | 30 |
| 3 | 3 | pc04 | 데이지 | 0.9 | (0, 1.2, 3) | 30 |
| 4 | 4 | pc05 | 와리오 | 1 | (0, 1.2, 4) | 30 |
| 5 | 5 | pc06 | 와루이지 | 0.85 | (0, 1.25, 3.5) | 30 |
| 6 | 6 | pc07 | 요시 | 1 | (0, 1.15, 4.25) | 30 |
| 7 | 7 | pc08 | 키노피코 | 1 | (0, 0.9, 4) | 30 |
| 8 | 8 | pc09 | 키노피오 | 1 | (0, 0.9, 4) | 30 |
| 9 | 9 | pc11 | 로젤리나 | 0.8 | (0, 1.25, 3) | 30 |
| 10 | 11 | pc12 | 동키콩 | 0.85 | (0, 1.05, 4) | 30 |
| 11 | 12 | pc13 | 캐서린 | 1 | (0, 1.15, 4.25) | 30 |
| 12 | **10** | pc14 | 폴린 (잠금: GameFlag 1) | 0.9 | (0, 1.25, 3) | 30 |
| 13 | 13 | pc50 | 쿠파 | 0.7 | (0, 1.05, 3.5) | 30 |
| 14 | 14 | pc51 | 굼바 | 1 | (0, 0.9, 4.25) | 30 |
| 15 | 15 | pc52 | 헤이호 | 0.9 | (0, 0.85, 4) | 30 |
| 16 | 16 | pc53 | 엉금엉금 | 1 | (0, 1.05, 4.25) | 30 |
| 17 | 17 | pc54 | 쪼르뚜 | 1 | (0, 0.9, 4.25) | 30 |
| 18 | 18 | pc56 | 쿠파주니어 | 1 | (0, 1.05, 4.25) | 30 |
| 19 | 19 | pc58 | 부끄부끄 | 1 | (0, 1.2, 4.25) | 30 |
| 20 | 20 | pc61 | 가봉 | 1 | (0, 0.9, 4) | 30 |
| 21 | 21 | pc62 | 닌군 (잠금: GameFlag 0) | 1 | (0, 0.95, 4.25) | 30 |

- 표 번호 ↔ 모델 번호는 `CharacterData::PCNumber`(characterlist 순서와 같음) [판독+데이터]. 배율은 `CharacterData::PCIndividualScale` [판독: 함수 이름][추정: 필드 IndividualScale].
- 버튼 위치는 BtnNo 로 정한다(10번 칸 = 폴린, 11 = 동키콩, 12 = 캐서린) [판독 FUN_7100339b30][참고 이미지: 10번 칸 실루엣].
- characterlist 의 `chara_select_target_bone/rotate_degree/distance` 는 이 화면 코드가 읽지 않는다(로더 FUN_71001d7340 만 참조) [판독: 이 화면 범위에서 미사용, 다른 소비자 미확정].

**입력 비트**(`bex::InputModule::GetTrigger/GetRepeat`) [판독: 사용 위치에서 뜻을 정함, 비트 이름 자체는 추정]:

| 마스크 | 웹 이름 | 쓰임 |
|---|---|---|
| 0x1 | `A` | 결정 |
| 0x2 | `B` | 취소·뒤로 |
| 0x20800 | `UP` (십자 0x800 + 스틱 0x20000) | 위 |
| 0x80400 | `DOWN` (0x400 + 0x80000) | 아래 |
| 0x10100 | `LEFT` (0x100 + 0x10000) | 왼쪽 |
| 0x40200 | `RIGHT` (0x200 + 0x40000) | 오른쪽 |

## 5. 상태 전이와 전체 수명 — 선택(상태 1) FUN_710033a1e0 [판독]

플레이어 i = 0..slots−1 순서로 한 프레임에 처리한다. 사람(type 0)만 입력을 읽는다. 패드 = `players[i].pid`(모드 ≠ 0 이면 +0x10c).
`trig` = 누름, `rep` = 키 반복(GetRepeat; 반복 간격은 bex 입력 모듈 값 [미확정]). 아래 `b(c)` = 표[c].BtnNo, `c(b)` = BtnNo → 표 번호(FUN_710033c0f0, 22 ↔ 22).

### 5.1 이동 (결정 안 한 사람만, 그리고 "결정 안 한 사람이 1명 이상" 일 때)

```
cur = b(cursor)      // 22 = 랜덤
target = cur
// 세로: trig 만
if cur != 22:
  if (trig & UP) && cur > 10  → t = (cur + 11) % 22   (= cur − 11)
  if (trig & DOWN) && cur < 11 → t = cur + 11
  둘 중 해당하면: occ(c(t)) 또는 disabled(c(t)) 면 그대로, 아니면 target = t
// 가로 trig (세로 처리 결과에서 이어감)
if trig & (LEFT|RIGHT):
  d = (trig & RIGHT) ? +1 : −1          // 둘 다면 RIGHT 우선
  entry = RIGHT ? 0 : 10;  if trig & DOWN: entry = RIGHT ? 11 : 21   // 랜덤에서 들어갈 칸
  loop:
    if 바깥 끝에서 바깥쪽으로 가려 함 (cur∈{10,21} & RIGHT 또는 cur∈{0,11} & LEFT) 이고 !occ(22): target = 22; break
    n = (cur == 22) ? entry : (cur + d + 22) % 22          // 줄 끝을 넘으면 다음 줄로 이어진다
    if occ(c(n)) : cur = n; continue                         // 점유 칸은 건너뛴다
    if disabled(c(n)): cur = n; continue                     // 사용 불가 칸도 건너뛴다
    target = n; break
// 가로 rep (trig 에 가로가 없을 때만)
elif rep & RIGHT:  (cur ∉ {10, 21, 22}) 같은 줄 오른쪽으로 occ·disabled 가 아닌 첫 칸, 없으면 그대로(줄 끝에서 멈춤)
elif rep & LEFT:   cur ≠ 22: 같은 줄 왼쪽으로 첫 빈 칸, 없으면 !occ(22) 이면 22, 아니면 그대로
if c(target) != cursor:
  decided = 0; FUN_710033c3f0(pid, c(target))       // 5.3
  Play2D SQ_SE_SYS_CURSOR (새 버튼 페인 전역 위치), 진동 bv_vib_sys_cursor
```

- 원본 그대로 둘 것: 오른쪽 끝 → 랜덤(왼쪽 끝 버튼)으로 감, 랜덤이 점유면 다음 줄 첫 칸(10 → 11, 21 → 0). 랜덤에서 오른쪽은 0(아래 함께 누르면 11), 왼쪽은 10(21).
- 반복 입력은 줄 끝에서 멈추고 줄을 넘지 않는다. 왼쪽 반복은 랜덤까지 간다.
- 같은 프레임 우선순위: 세로 → 가로 trig → (가로 trig 없을 때) 가로 rep.

### 5.2 결정·취소

```
if !decided:
  if trig & A:
    if (cursor == 12 && !flag1) || (cursor == 21 && !flag0):   // 잠김
       버튼 "miss", SQ_SE_SYS_ERROR, bv_vib_sys_error
    elif disabled(cursor): 같은 처리(miss·ERROR)
    else:
       if cursor == 22: cursor = 랜덤 선택(FUN_710033c650) 으로 옮김(5.3) — 선택 모션은 FUN_710033c8b0
       decided = 1; 버튼 "press" → (다음) "pressed"
       카드: 모션 co_chr_slct00a → 끝나면 co_chr_slct00b (EnqueuePlay)
       보이스 SQ_VOI_PC%02d_MENU00_SELECT (PCNumber) Play2D(카드 x_pict_3d 위치), 핸들을 slot 칸에 보관
       SQ_SE_SYS_DECI, bv_vib_sys_deci
  if trig & B 이고 (mode < 2 이고 pid == operatorPid) 또는 mode == 2:
       if !cancelled: cancelled = 1; SQ_SE_SYS_CANCEL; if !noAutoOut: Out(false)
else if trig & B:
  decided = 0; 버튼 "on"→"cursor"(FUN_710033d110)
  카드 모션 = (cursor ∈ {6 요시, 11 캐서린}) ? co_chr_idle00 : co_idle00
  보이스 정지(Stop_Preset 1), SQ_SE_SYS_CANCEL
```

랜덤 선택 FUN_710033c650: c = 0..21 중 `!occ(c) && !disabled(c) && 잠금 해제`인 것을 순서대로 모아 `pool[SyncRandMod(n)]` [판독: SyncRandMod 인자 = pool 길이로 보임, RandModule 알고리즘 미확정 → 웹은 주입 RNG].

### 5.3 커서 놓기 FUN_710033c3f0 [판독]

```
old = players[p].cursor; players[p].cursor = c
old 버튼: "off" → (다음) "normal" (사용 불가면 "disable");   old 버튼 커서 표시 없음
new 버튼: "on" → (다음) "cursor" (사용 불가면 "disable");    new 버튼 "%s/x_parts_cursor" "normal"
new 버튼 커서 표시(FUN_710033f5e0): x_cursor_{k}P 보임 = (k−1 == p), x_pict_base_{k}P 보임 = (k−1 == p),
   사람 → x_player 보임, x_text_num_00 = mn01_connect_ui_chara_number(정수 p+1), COM → x_com 보임, x_text_COM = "CPU",
   컨트롤러 아이콘 x_parts_hard ← p
카드(FUN_7100340180, 슬롯 = players[p].slot): 5.5
```

### 5.4 전원 결정 → OK (상태 1 끝 → 2 → 3)

- 사람 중 결정 안 한 사람이 없고, 모든 플레이어 커서 버튼의 페인 애니가 끝났으면(재생 상태 3, 즉 press 19프레임이 끝난 뒤) [판독]:
  - 모드 ≠ 2: OK 버튼 보이기 → "in" → (다음) "normal"(60프레임 반복). constrained 면 격자 레이아웃 숨김 아님(vt+0x68(0) 은 this 의 보이기 끔 — **격자를 숨긴다** [판독: this->vt+0x68(0)]).
  - 점유되지 않은 칸 0..22 전부 "disable"(커서 표시 없음). 상태 2.
- 상태 2(FUN_710033b540):
  - 사람 누가든 B: 그 사람 결정 취소(5.2 와 같음). 결정 안 한 사람이 생기고 모드 ≠ 2 면: OK "back", constrained 면 격자 다시 보이기, 점유 안 된 칸 "off"→"normal"(FUN_710033d560), SQ_SE_SYS_CANCEL, 상태 1.
  - 조작 플레이어 A(모드 2는 자동): OK "press", SQ_SE_SYS_DECI_L, bv_vib_sys_deci_l. 결과 기록: 사람·onGrid 플레이어 `result[i] = cursor`(writePlayerWork 면 PlayerWork::SetCharacterID). 모드 0 이면 COM(type 1, !onGrid) 은 `result = −1` 로 비운 뒤 차례로 FUN_710033d270(남은 칸 중 무작위, 이미 result 에 있는 캐릭터 제외)으로 채운다. 플레이 모드 0x12 미리 고르기면 result[0] 를 저장 데이터 +0x70 에 저장. 상태 3.
- 상태 3: OK press 애니(19프레임) 끝 → `decided`(+0xfd) = 1, Out(false) → 상태 4 → "out"(5프레임) 끝 → 상태 5(IsFinished).

### 5.5 카드 갱신 FUN_7100340180 [판독]

```
슬롯 s 의 기존 모델 엔티티 삭제
win = (N == 1) ? "x_parts_1win" : "x_parts_%dwin_%dP" % (N, s+1)
c 가 잠김 또는 22(랜덤): win/x_text_chara 숨김, 모델 없음 → 끝 (카메라도 그대로)
아니면 x_text_chara 보임, 문구 = mn01_connect_ui_chara_name ("[1:1:00cd]" = Text0 삽입) ← PCNameLabel(c) (im_pcNN_name)
모델 아카이브 chara/pcNN 이 적재돼 있으면:
  Entity "SelectPc_Model" + ComMatter(c); 모션 등록 co_idle00, co_chr_idle00, co_chr_slct00a, co_chr_slct00b
  재생 = (c ∈ {6, 11}) ? co_chr_idle00 : co_idle00;  모델 레이어 비트 = +0x278[s];  데칼 그림자 끔
  위치 0, 회전 = yaw 0 쿼터니언(단위), 배율 = PCIndividualScale(c)
카메라[s]: SetViewLookAt(A = (CamX, CamY, 0), up = (0,1,0), B = (CamX, CamY, CamZ)),
          SetProjectionPerspectiveFovy(FovY·π/180, aspect = x_pict_3d 폭/높이, near·far = ComCamera 기본값)
```

- LookAt 인자 순서: 눈 = B(CamZ 쪽), 대상 = A 로 둔다 [추정: SetViewLookAt 은 (param_3 − param_1) 을 축으로 쓴다(main @0x7100845960), 눈을 A 에 두면 카메라가 캐릭터 몸 안에 있어 캡처 구도와 맞지 않는다][참고 이미지: 동키콩 머리가 카드 위쪽 가운데].
- near/far: ComCamera 기본값 판독 안 됨 → Camera::Reset 기본값 0.1 / 1000 을 쓴다 [추정].
- 랜덤 칸에 커서가 있으면 카드는 이전 모델을 지운 채 비어 있다(이름 숨김) [판독].

### 5.6 카드 배치 FUN_710033eeb0 (N = 사람 수) [판독]

- `x_null_Nwin` 하나만 보임. aspect = 해당 x_pict_3d 크기 비(1win 1832/660, 2win 906/660, 3win 596/660, 4win 440/680).
- 렌더 타깃 크기 = x_pict_3d 크기 × (성능 모드 0 ? 0.6667 : 1.0) (휴대 0.6667 / 거치 1.0) [판독 GetPerformanceMode]. 웹은 1.0(거치)로 둔다.
- 슬롯 s 의 이름표: `win/x_parts_username` 의 StatusName(pid) = 계정 닉네임, `win/x_parts_hard` = 컨트롤러 종류·LED(pid) [판독 FUN_710033f160, FUN_7100340f64].

## 6. 계산식·조건·배치 수치

좌표는 레이아웃 원점 = 화면 가운데, y 위 + (05 §3.3). 화면 픽셀 = (960 + X, 540 − Y).

### 6.1 화면 배치 [데이터]

| 요소 | 레이아웃 좌표(중심) | 화면 픽셀 | 크기 |
|---|---|---|---|
| 제목 띠 `pict_base_00` | (0, 460) | (960, 80) | 900×100, 왼쪽 `pict_base_lite` 338(오른쪽 원점, 정점색 왼→오 #00000000→#070203ff), 오른쪽 대칭 |
| 제목 글자 `x_text_title_00` | (0, 460) | (960, 80) | bqfont_middle 80, 흰색, 가운데 |
| 카드 창 `win_00` (N창 부품 안 (0, 230)) | 3win: (−620/0/620, 230) | (340/960/1580, 310) | 3win 640×724, 4win 484×724, 2win 950×724, 1win 1876×724, 9칸 창(모서리 32, 텍스처 sys_charasel_bg_00, 내용 #d5d5d5) |
| 3D 칸 `x_pict_3d` | 창 가운데 | | 3win 596×660, 4win 440×680 |
| 마스크 `mask_00` | (−w/2, −20) 왼쪽 원점 | 카드 아래쪽 | 높이 180, 텍스처 sys_charasel_mask_00(10×180 세로 그라데이션) |
| 캐릭터 이름 `x_text_chara` | (0, −14) | 3win 가운데 카드 (960, 554) | bqfont_middle 70, #070203 |
| 계정 이름 `x_parts_username` | (0, −72) | (960, 612) | 시스템 폰트 24×36 |
| 컨트롤러 `x_parts_hard` | (−176, −65) | | 181×252 부품 |
| 격자 원점(constrained) | (0, −296) | (960, 836) | |
| 버튼 k(BtnNo) | 원점 + (−660 + 148·(k mod 11), k<11 ? 92 : −72) | x = 300 + 148·col, y = 744 / 908 | 부품 281.6 (내용: 둥근 사각 128×1.1 = 140.8, 얼굴 256) |
| 랜덤 버튼 | 원점 + (−822, 10) | (138, 826) | 282 |
| OK 버튼 `null_00` | (0, −296) | (960, 836) | 띠 왼쪽 900+300(투명), 오른쪽 900+300, 높이 180, 글자 bqfont_large 152 |
| 안내 `x_pos_17` | (900, −478) | (1860, 1018) | 오른쪽 정렬(SetGuidePos 12..17 → 정렬 2), 글자 bqfont_middle 52 + 그림자 폰트 |

### 6.2 플레이어 색 [데이터 sys_cursor_charasel_00·sys_btn_charasel_00 정점색]

| 플레이어 | 커서 테두리 `cursor_0N` | 결정 배경 `x_pict_base_NP`(알파) |
|---|---|---|
| 1P | #b80019 | #cb0030 (200) |
| 2P | #0c16b8 | #0c16b8 (200) |
| 3P | #004f11 | #004f11 (180) |
| 4P | #ff5b00 | #ff5b00 (120) |
| 5P~8P | #ff358d / #2dcdf0 / #39df0e / #6849ff | 같은 색 (120, 기본 숨김) |

커서 빛 `cursor_ef_0N` 알파 70 → 255(60f) → 70(120f) 에르미트 반복 [데이터].

### 6.3 애니 [데이터 analysis/charsel_anims.txt]

| 레이아웃·태그 | 길이(프레임) | 내용 |
|---|---|---|
| sys_base_charasel_00/01 in / out | 5 / 5 | Null_all 알파 0→255 / 255→0 (기울기 51) |
| sys_connect_tlp_00 in / out | 10 / 10 | null_00 알파 0↔255 |
| sys_bg_set_00 normal | 360 반복 | pict_00 텍스처 이동 (0,0)→(0.5,0.5) |
| sys_btn_charasel_00 normal / off | 0 | 기본 표시(커서·press 배경 알파 0, 그림자 255) |
| on | 9 | Null_all ty 0→3→0→1→0 튐, 원판 정점색 분홍(255,19,73), 커서 255 |
| cursor | 0 | (빈 트랙, on 의 끝 값 유지) |
| press | 19 | ty 0→−8→0 눌림, 원판 노랑(203,255,29), press 배경 255 |
| pressed | 0 | press 끝 상태 고정 |
| disable | 0 | 얼굴 알파 102 |
| miss | 20 | tx 0→−10→10→−3→0 흔들기 |
| sys_btn_ok_00 in / normal / press / back | 9 / 60 반복 / 19 / 4 | 띠 sx 0→1 / 유지 / ty 튐 / 알파 255→0 |
| sys_guide_01·03 in/out | 5 | 알파 |
| sys_win_charamodel_0N (태그 없음) | 100(110) 반복 | null_name 알파 255 유지 |

에르미트 = 표준 3차 에르미트(기울기 × 구간 길이), 같은 프레임 키 두 개 = 불연속 [데이터 05 §3.7]. 애니는 1프레임/틱(60 fps) [추정: 기본 속도 1].

### 6.4 부품 덮어쓰기 [데이터]

- 카드 이름표 `x_parts_username`: 부품 덮어쓰기로 `x_text_00`(StatusName Name_00) 숨김, `x_text_01`(Name_01) 보임 + 글자색 #000000 → 계정 이름은 x_text_01 에 검은 글자로 나온다 [데이터][참고 이미지: "JINBAE" 회색 글자].

- `x_face_secret`(잠김 얼굴) = sys_face_02 의 `x_face_pc256` 정점색을 #000000 으로 덮어쓴 것 + 부품 알파 150 → 검은 실루엣 [데이터]. `base` 페인은 basicUsage 1 로 감춘다 [추정: bit0 = 보이기 덮어쓰기, bit1 = 값].
- 버튼 부품의 `cursor_line` 은 basicUsage 3 → 보임 [추정].
- 얼굴 재질: 버튼 레이아웃이 부품 재질을 덮어쓴 `x_face_pc256` = 1번 칸 sys_btn_charasel_04(둥근 사각, mirror, UV 0..2) × 2번 칸 얼굴(texCoordGen source 4 = 투영, 텍스처 SRT 배율 **1.9**) [데이터]. 얼굴 텍스처는 `face_128_pcNN^u`(GetPCFace 크기 표 "128", 부품 이름 x_parts_pc128) [판독: mg1801 UI 보고의 main @0x7100296dc4][데이터]. 투영 규칙은 미판독이라 웹은 얼굴을 256/1.9 ≈ 134.7 px 정사각으로 가운데에 붙인다 [추정: 캡처 칸 크기와 일치].
- (구현 전 판단 정정) 처음에는 Face_256 컨트롤 이름만 보고 face_256 텍스처를 256 px 로 그렸는데, 헤드리스 대조에서 얼굴이 칸보다 두 배 커서 위 데이터(재질 SRT 1.9·GetPCFace "128")로 고쳤다.

### 6.5 그리기 규칙(구현 중 캡처 대조로 확정한 것)

| 규칙 | 근거 | 수준 |
|---|---|---|
| 정점색·재질색은 **선형 값**, sRGB 형식 텍스처(BC7_SRGB·BC3_SRGB: 얼굴·아이콘)는 선형으로 풀고, 선형으로 섞은 뒤 sRGB 로 내보낸다 | 배경 #3490db → 캡처 (129,197,233) = sRGB 부호화 (125,198,238), 아래 #70cfbd → (173,231,222) vs 계산 (177,232,224), 제목 띠 #070203 → (45,21,27) vs (46,21,28), 카드 #d5d5d5 → 234 | [데이터+참고 이미지 계산] |
| 부모 원점이 가운데면 기준점 = **부모의 위치점**(부모 로컬 0,0), 부모 사각형 가운데가 아님 | 제목 띠 `pict_base_right_00`(왼쪽 원점)의 자식 `right_01` 이 같은 자리에 겹쳐야 그라데이션 값이 맞는다: 화면 x 1550 → 캡처 108 / 두 겹 선형 계산 104, 1650 → 171 / 172 (한 겹이면 158·… 로 틀림). OK 띠 `pict_left_01`(−900)도 이 규칙에서 이어진다 | [참고 이미지 계산] (부모 원점 왼/오/위/아래는 이 화면에 없어 사각형 가장자리로 둠 [추정]) |
| 재질 블렌드(mat1 flags bit10): `x_pict_base_NP` = 더하기(원본 알파, 하나) | 결정 칸이 얼굴 위에 덧칠이 아니라 밝게 더해진다(캡처 와루이지 칸) | [데이터][참고 이미지] |
| `x_pict_3d` 2번 칸 마스크(sys_charasel_mask_00)와 시스템 데이터 형식 6 | 마스크를 곱하면 캐릭터 위쪽이 사라져 캡처와 다르다 → 웹은 렌더 타깃만 쓰고 아래쪽 흰 띠는 mask_00/01 페인이 그린다 | [근사], 결합 규칙 [미확정] |

정정(2026-10-08, ui2d_alignment.md 12.1): 부모 기준점 규칙을 원본 C `FUN_71013fe25c` main @0x71013fe25c(Pane 전역 행렬)로 확인했다. 기준점은 부모 위치점(부모 로컬 0,0)에 부모 원점(po)을 더한 점이며, po의 왼/오른은 ∓부모 폭/2, 위/아래는 ±부모 높이/2이다. 부모 자신의 원점은 보지 않는다 [판독]. 위 표의 "가운데" 경우는 그대로 맞다. "부모 원점 왼/오/위/아래 → 부모 사각형 가장자리 [추정]"은 부모 원점이 가운데일 때만 같다. 부모 원점이 가운데가 아니면서 po ≠ 0인 노드는 현재 에셋 전체에서 0건이어서 렌더러(`render2d.ts anchor`)는 바꾸지 않았다. 그런 노드가 생기면 `check_mgmcommon` 3절이 실패한다.

## 7. 애니메이션·소리·카메라·에셋 연결

### 7.1 소리 [판독 이름 / 데이터 볼륨]

| 사건 | 라벨 | 볼륨(fsar, /127) | 재생 |
|---|---|---|---|
| 커서 이동 | SQ_SE_SYS_CURSOR | 110 | Play2D(새 버튼 위치) |
| 결정 | SQ_SE_SYS_DECI | 110 | Play |
| 잠김·불가 결정 | SQ_SE_SYS_ERROR | 60 | Play |
| 취소·뒤로 | SQ_SE_SYS_CANCEL | 110 | Play |
| OK 결정 | SQ_SE_SYS_DECI_L | 52 | Play |
| 캐릭터 보이스 | SQ_VOI_PC%02d_MENU00_SELECT | 27(pc12) | Play2D(카드 위치), B 취소·Out 에 정지 |

- SE 는 시퀀스 사운드(bank:1). 웹은 `sound_seq.py render` 로 만든 근사 wav 를 쓴다 [실행: 변환, 원본 출력과 대조 안 함].
- 보이스 시퀀스는 `userproc 1 <RAND_VOICE_PLAY_CN4>` 로 변형을 고른다. 렌더러가 userproc 를 재현하지 못한다(30 ms 렌더) → **[미확정]**, 웹은 보이스 사건을 어댑터로 내보내기만 하고 기본 구현은 소리를 내지 않는다.
- Play2D 위치 → 팬: 원본 2D 팬 곡선 [미확정]. 웹은 위치를 어댑터에 넘긴다.
- 진동 이름 bv_vib_sys_cursor / _error / _deci / _deci_l 도 어댑터 사건으로 낸다(재생은 어댑터 몫).

### 7.2 3D 카드 [판독+데이터]

- 환경: 평행광 색 0.6038(선형 회색), 회전 덮어쓰기 (−30°, 0, 0) → 로컬 −Z 를 X축으로 −30° 돌린 방향(앞 위에서 비춤) [데이터 + 방향 규약 07 §6.6 추정], 그림자 1 캐스케이드(웹 생략). IBL `neutral00_ibl_irr/rad`(큐브, BC6H). 포스트: 톤맵 형식 1, 노출 1, FXAA, 블룸·DOF 꺼짐.
- 카드 3D 칸 재질 = 렌더 타깃(1번 칸, sys_white_00 자리) × sys_charasel_mask_00(2번 칸) [추정: 두 텍스처 곱, 05 §3.5 근사] → 아래로 갈수록 흰 마스크와 섞임. mask_00/01 페인이 그 위에 흰 띠를 더 덮는다.
- 모션: co_idle00(반복), co_chr_idle00(요시·캐서린), 결정 시 co_chr_slct00a(1회) → co_chr_slct00b(반복) [판독 FUN_710033cc30: Play 후 EnqueuePlay]. 반복 여부는 클립 데이터 [데이터: 변환 시 확인].
- 몸 알베도 UV 규칙·눈 합성은 09_character.md 의 관측 규칙(1:2 알베도 v′ = 0.5 + 0.5v 등)을 쓴다 [실행: 렌더 관측, 원본 셰이더 미확정].

### 7.3 텍스트 [데이터 koKR]

| 라벨 | 문구 | 페인 |
|---|---|---|
| mn01_connect_ui_chara_title | 캐릭터를 선택해 주십시오 | 제목 |
| mn01_connect_ui_chara_name | [1:1:00cd] → 캐릭터 이름 삽입 | x_text_chara |
| im_pcNN_name | 마리오 … 닌군 | (삽입) |
| mn01_connect_ui_chara_random | 랜덤 | x_text_random |
| mn01_connect_ui_chara_number | [1:0:00cd] → 정수(p+1) | x_text_num_00 |
| mn01_connect_ui_chara_CPU | CPU | x_text_COM |
| mn01_connect_ui_chara_ok | U+E000 " OK!" | x_text_ok |
| sys_ctrl_back | U+E003 " 뒤로" | 안내 |

- 글리프: bqfont_middle/large/small(한글 본문)에 필요한 글자 전부, U+E000·U+E003 은 `*_extension.ffnt` 에 있다 [실행: 글리프 표 확인]. 복합 폰트 순서 = [usen, 본, extension] [추정 05 §4.1].
- 계정 이름 폰트 `nintendo_udsg-r_std_003` 은 롬에 없다(시스템 공유 폰트) → 웹은 브라우저 산세리프로 대체 [근사].

## 8. 다른 기능과의 상호작용

- 부모 `ComUiSettingPlayer`(0 인원 수 → 1 사용자 → 2 캐릭터 선택): 단계 전환 때 사용자 창이 `to_charasel` 애니로 카드 자리로 바뀐다(FUN_7100349030 부근) [판독 일부]. 이 독립 모듈은 캐릭터 선택 단계만 다루고 전환 애니는 범위 밖 [미확정: 사용자 창 → 카드 연출].
- IsDecided/IsFinished 를 부모가 보고 다음 장면으로 간다. 결과는 `result[]`(+0xd8) 와 PlayerWork::SetCharacterID [판독].
- 덕킹: constrained 면 In 에서 DuckingGroup(0x16, 5, 1), Out 에서 해제 [판독] — 웹은 어댑터 사건.
- 잠금 플래그(GameFlag 0·1)는 해금 이벤트(menu01::EventUnlockChara_Hakkun/_Pauline)가 쓴다 [판독: 함수 이름] — 웹은 설정으로 받는다.

## 9. 웹 포팅 구조와 구현 순서 (독립 모듈 명세)

### 9.1 원칙

- 위치 `web/script/shell/charselect/`. import 허용: 같은 폴더, `three`, `three/examples/jsm/loaders/GLTFLoader.js`. **금지**: `script/core`, `script/games`, `script/view`, `script/game.ts`, `script/env.ts`. 검사 도구가 import 그래프를 확인한다.
- 원본 레이아웃 재생기(view/lyt.ts)를 쓰지 않는다. 변환기가 원본 bflyt/bflan 을 **자체 명세 JSON**(노드 트리·재질·애니 곡선, 자체 필드 이름)으로 바꾸고, 모듈 안의 작은 2D 렌더러가 그 명세를 그린다.
- 입력·소리·에셋 경로·난수·잠금 플래그는 어댑터로 받는다.

### 9.2 파일

| 파일 | 책임 |
|---|---|
| `types.ts` | 명세 JSON 형식, 어댑터 인터페이스, 공개 타입 |
| `state.ts` | **순수 상태기계**(DOM·three 없음, 노드 시험): 5절 규칙. 입력 = 플레이어별 {trig, rep} 비트 + 애니 완료 신호, 출력 = 사건 목록(커서 이동·결정·애니 재생·소리·진동·카드 갱신) |
| `scene2d.ts` | 명세 노드 트리 인스턴스·애니 플레이어(에르미트·계단), 부품 인스턴스 |
| `render2d.ts` | three 직교 카메라로 사각형(4점 UV·정점색·black/white 보간·텍스처 2장 곱·9칸 창)·글리프 그리기 |
| `preview3d.ts` | 카드 슬롯별 렌더 타깃: glb 적재, 모션(co_idle00 등), 카메라(5.5), 평행광·환경광 |
| `screen.ts` | 컨트롤러: 상태기계 사건 → 레이아웃 애니·텍스트·카드·소리. `createCharSelect()` |
| `index.ts` | 공개 진입점 |

페이지 연결(모듈 밖): `script/charselect_page.ts`(페이지 입력 → bex 비트 어댑터, WebAudio SE, 60Hz 루프), `script/main.ts` `?charselect=1`(시작 버튼 → 캐릭터 선택 → 고른 pcNN 을 `GameSetup.players[i].char` 로 넘겨 게임 시작, 취소면 시작 안 함), `ui.html` + `script/ui_main.ts`(UI 시험 페이지: 셸 화면 목록 `UIS` 에서 골라 게임 없이 단독 실행, 1~4P COM·소리·디버그·결과 표시, `?ui=charselect&com=0001&mute=1&auto=1`, 스모크 `tools/smoke_ui.ts`). 시험 `tools/test_charselect.ts`·`tools/check_charselect.ts`·`tools/shot_charselect.ts`.

에셋 `web/assets/charselect/`: `spec.json`(레이아웃·재질·애니·폰트 메트릭·텍스트·캐릭터 표·소리 표), `tex/*.png`, `font/*.png`, `chara/<pcNN>/*.glb`, `sound/*.wav`. 변환 `web/tools/analysis/charsel_web_assets.py`(원본 → 명세, 픽셀·값 그대로).

### 9.3 공개 인터페이스(초안)

```ts
interface CharSelectInputAdapter { poll(pid: number): { trig: number; rep: number } }   // 비트 = 4절 표(A 1, B 2, UP 0x20800 …)
interface CharSelectSoundAdapter { play(label: string, opt?: { x?: number; y?: number; handleSlot?: number }): void; stop(slot: number): void; vibrate?(pid: number, name: string): void }
interface CharSelectAssetAdapter { url(path: string): string }                         // 'spec.json' 등 → 실제 URL
interface CharSelectOptions {
  canvas: HTMLCanvasElement; input: …; sound: …; assets: …;
  players: { pid: number; type: 'human' | 'com'; name?: string; controller?: string; initialChara?: number }[];
  unlocked?: { pauline: boolean; ninji: boolean };   // GameFlag 1 / 0
  rng?: (n: number) => number;                        // SyncRandMod 대체
  onDecided?(result: number[]): void; onCancel?(): void;
}
createCharSelect(opts): Promise<{ step(): void; render(): void; dispose(): void; state: Readonly<…> }>
```

### 9.4 구현 순서

1. 변환기 → spec.json·텍스처·폰트·SE·캐릭터 glb. 2. state.ts + tools/test_charselect.ts. 3. scene2d/render2d + tools/check_charselect.ts(명세 ↔ 원본 덤프 대조, import 검사). 4. preview3d. 5. screen.ts, main.ts `?charselect=1` 연결. 6. 헤드리스 1회.

### 9.5 원본과 같게 유지할 것 / 바꾼 것

| 항목 | 원본 | 웹 |
|---|---|---|
| 이동·결정 규칙, 처리 순서(플레이어 번호 순), 같은 프레임 우선순위 | 5절 | 같게 |
| 애니 길이·곡선, 배치·색 | 6절 | 데이터 그대로 |
| 난수 | bex SyncRandMod [미확정] | 주입 RNG(기본 Math.random, 시험은 고정) |
| 키 반복 간격 | bex 입력 모듈 [미확정] | 어댑터가 rep 비트 생성(기본 첫 반복 24f, 이후 6f [근사]) |
| 렌더 타깃 배율 | 휴대 0.6667 / 거치 1.0 | 1.0 |
| 그림자·포스트(톤맵·FXAA) | 있음 | 생략 [근사] |
| 계정 이름 폰트 | 시스템 폰트 | 브라우저 산세리프 [근사] |
| 컨트롤러 아이콘 본체 색·LED 램프 배치 | 하드웨어 색(캡처 = 하늘색), 램프는 아이콘 위(paneInfo 덮어쓰기) | 아이콘 텍스처 그대로(흰 본체), 램프는 레이아웃 기본 자리 [미확정] |
| 보이스 | 랜덤 변형 시퀀스 | 사건만 (소리 없음) [미확정] |

## 10. 검증 코드·실행 결과·기대값

| 검사 | 명령 | 결과(2026-10-06) | 수준 |
|---|---|---|---|
| 상태기계 | `npx tsx tools/test_charselect.ts` | **55/55 통과** — 초기 커서, 줄 넘김(10→랜덤, 랜덤 점유면 10→11·21→0), 랜덤 진입(→0 / →10 / 오른쪽+아래 →11), 점유·사용 불가 건너뛰기, 세로 이동·막힘, 반복 입력 줄 끝 멈춤·왼쪽 랜덤, 잠김 miss·ERROR, 해금 결정(보이스·모션 a→b), 랜덤 결정 풀, 결정 취소, 조작 플레이어 B 종료, press 19f 대기 → OK → B 복귀 → A 결과(COM 남은 칸), 반복 24/6f | 재구현 계산(판독 규칙) |
| 명세 대조 | `npx tsx tools/check_charselect.ts` | **1990/1990 통과** — 18개 레이아웃 279 노드의 이름·위치·크기·배율·알파·원점·정점색이 원본 덤프와 일치, 애니 길이·반복, 버튼 22개+랜덤·제목·안내·카드 화면 좌표(6.1 표), 플레이어 색 8, 캐릭터 표 22(BtnNo·카메라), 텍스트, 글리프, glb·얼굴·소리 파일, import 그래프(7파일 금지 import 0) | 데이터 |
| 타입 | `npx tsc --noEmit` | 새 오류 0 (기존 tools/serve.ts 미사용 변수 2개만) | |
| 기존 | `npx tsx tools/test_mg1801.ts` | 통과(전 항목) | |
| 헤드리스 | `npx tsx tools/shot_charselect.ts` (?charselect=1&com=0001) | 콘솔 오류 0. 1P 와루이지·2P 동키콩·3P 굼바(1P·3P 결정) → 캡처와 같은 구도. 전원 결정 → 상태 2(OK), A → 결과 ["pc06","pc12","pc51", COM 무작위]. 스크린샷 `test/out/charselect/01_start.png`, `02_capture_pose.png`, `03_all_decided_ok.png`, 나란히 비교 `compare_capture.png` | 웹 실행 |

헤드리스는 4번 돌렸다: 1회차에서 색 공간·얼굴 크기·이름표가, 2회차에서 결정 칸 블렌드가, 3회차에서 제목 띠 부모 원점 규칙이 캡처와 달라 6.4·6.5 를 고친 뒤 다시 확인했다(4회차 제목 그라데이션 x 1450/1550/1650 = 53/111/175, 캡처 49/108/171).
남은 차이: 컨트롤러 아이콘 본체 색·램프 자리(11절), 계정 이름(시험은 "2P" 등), 캐릭터 눈 시선.
4회차 뒤 한 가지를 더 고쳤다(헤드리스 재확인 안 함): 안내 아이콘의 그림자 글꼴(extension_shadow) 컬러 글리프를 재질 색(검정)으로 칠한다 — 캡처의 "흰 윤곽 + 어두운 바탕" 모양 [추정].
`assets/charselect/tex/face_256_pc*.png` 22개는 첫 변환의 남은 파일이다(지금 명세는 face_128 을 쓴다, 삭제 금지 규칙으로 두었다).

## 11. 미확정 사항과 추가 분석에 필요한 근거

| 항목 | 상태 | 필요한 근거 |
|---|---|---|
| bex 입력 비트 이름(십자/스틱 구분), 키 반복 간격 | 뜻은 판독, 이름·간격 [미확정] | bex::InputModule 반복 설정 판독 |
| SyncRandMod 알고리즘 | [미확정] | 01_core 난수 판독 |
| SetViewLookAt 인자 순서 | [추정: 캡처 구도] | Camera::SetViewLookAt 뷰 행렬 저장 판독 |
| ComCamera near/far | [추정 0.1/1000] | SelectPC_Camera 생성 경로 판독 |
| 부품 덮어쓰기 basicUsage 비트 뜻, paneInfo 덮어쓰기(x_null_lamp) | [추정]/[미확정] | ui2d 부품 적용 함수 판독 |
| 얼굴 텍스처 크기 선택(Face_256 → face_256) | [추정] | UiControlStatusFace vt+0xc0 판독 |
| 정렬 페인(ali1) 배치 규칙(안내 오른쪽 정렬) | [추정, 캡처 일치] | ali1 바이트 해석 |
| LED 램프 패턴·컨트롤러 아이콘 선택 | [미확정] | UiControlJoycon 판독 |
| 보이스 변형 선택(userproc RAND_VOICE_PLAY_CN4) | [추정: T14 = 0..T15−1 무작위], T14 초깃값 뜻 [미확정] | atk userproc 콜백 판독(함수 위치 미발견) |
| 동키콩·가봉 눈꺼풀 식, 캐서린 흰자 = color1, _C1 의 뜻 | [추정] (12.8) | 셰이더 그래프(fragment_shader_graph_color 해시) 디코드 |
| BGM 정지 페이드 프리셋 | [미확정] 0.5 s 근사 | StopBgm 의 Stop_Preset 인자 판독 |
| 3D 로딩 렉 대책 | 측정만(12.9) | compileAsync·미리 읽기 적용 후 재측정 |
| 2D 팬 곡선(Play2D 위치) | [미확정] | bex::sound Play2D 판독 |
| 사용자 창 → 카드 전환(to_charasel) | 범위 밖 [미확정] | ComUiSettingPlayer 단계 2 진입 판독 |
| 모드 1·2(한 명 지정·단독) 화면 | 판독 일부, 웹 미구현 | 호출자(보드·퀘스트) 판독 |
| 컨트롤러 아이콘 본체 색(하드웨어 색)·LED 램프 자리(x_null_lamp paneInfo 덮어쓰기)·램프 텍스처 칸 | [미확정] | UiControlJoycon(vt+0xb8) 판독, prt1 paneInfo 형식 |
| `x_pict_3d` 시스템 데이터 형식 6·2번 칸 마스크 결합, 렌더 타깃 지우기 색 | [미확정] (웹은 마스크 생략, 투명 지움) | ui2d 시스템 데이터 6 판독 |
| 얼굴 투영 텍스좌표(texCoordGen source 4, projTexGen flags 4) | [추정 134.7 px] | ui2d 투영 텍스좌표 판독 |
| 부모 원점 왼/오/위/아래 규칙 | [추정] (이 화면엔 가운데만) | 다른 레이아웃 캡처 대조 |
| 원본 화면 실행 대조 | 캡처 1장뿐 | 원본 실행 캡처(여러 장, 애니 프레임) |

## 12. 후속 분석 (2026-10-06 2차: 3D 캐릭터·BGM·보이스·컨트롤러 아이콘·로딩 렉)

이 절은 구현 전에 썼다. 근거 자료: `analysis/decomp/charsel_menu01_sound.c`·`charsel_menu01_callers.c`(menu01.nro), 변환 중간물 `extracted/converted/charsel/<pcNN>/`(정점 속성 전부 남은 glb), 측정 스크립트 결과는 본문에 수치로 적었다.

### 12.1 캐서린(pc13)·요시(pc07) 등 — 표정 메시가 한꺼번에 그려짐 [데이터][원인 확정]

- 캐서린 모델은 몸 1 + 얼굴 2 + **눈 표정 메시 10개**(`fcl_{L,R}_eye_{open,half,close,sad,tight}__body_m`)다. 각 메시 노드의 `extras.visBone` 이 같은 이름의 뼈를 가리키고, 뼈 노드 `extras.visible` 이 기본 보임을 정한다(open 만 보임, 나머지 8개 숨김) [데이터 glb].
- 모션의 fvbb(뼈 보이기 애니)가 이 뼈들을 켜고 끈다: `co_chr_slct00a` 7~23f 에 half → close → half → open, `fcl_blink00`(묶음 깜빡임, 300f 반복)도 같은 뼈를 바꾼다 [데이터 motions.json `vis`].
- 웹 1차 구현(preview3d)은 이 보이기 규칙을 전혀 적용하지 않아 **눈 표정 10개가 겹쳐 그려졌다** → 캐서린 눈이 이상하게 보인 원인. 같은 구조: pc02·pc03·pc04·pc07·pc11·pc14·pc53·pc62(숨김 뼈 또는 vis 표가 있음) [데이터: 숨김 뼈 수 pc02 1·pc04 6·pc07 8·pc13 8·pc14 13].
- 고칠 방법: 메시 보임 = 그 visBone 뼈의 보임. 뼈 보임 = 지금 모션의 vis 표(계단, 프레임) → 없으면 묶음 깜빡임(fcl_blink00) vis 표 → 없으면 뼈 기본값 [판독 근거: mg1801 Player 와 같은 AnimationNodeBundle 규칙(09_character.md, SHARED chara1801 blink 줄)].
- 캐서린 대기 모션은 `co_chr_idle00`(표 11, 190f 반복)이고 클립·전이 자체는 정상이다 [데이터]. 재질·배율(1.0) 차이는 원인이 아니다.

### 12.2 동키콩(pc12) — 눈동자가 안 보이고 눈꺼풀이 없음 [데이터][원인 확정, 눈꺼풀 식은 추정]

- 눈동자 합성 마스크: 1차 구현은 "몸 알베도 알파 0 칸 = 흰자"(mg1801 관측 규칙)를 썼다. 동키콩 알베도는 알파 채널이 있지만 **눈알 정점 위치의 알파가 255** 라(91개 중 0개가 128 미만) 마스크가 0 → 눈동자가 지워졌다 [데이터]. 같은 이유로 pc54·pc56·pc58 도 영향(이들은 눈 텍스처 없음).
- 원본 데이터의 눈알 표시는 정점색 **_C1** 이다: 눈 0(오프셋 parameter1, uv1 x≈2~3.5 또는 4~6)은 `_C1.r = 1`, 눈 1(parameter0)은 `_C1.b = 1`. pc01·pc07·pc12·pc13 몸 메시에서 확인(마리오 r 92·b 92, 요시 136·136, 캐서린 141·141, 동키콩 91·91) [데이터]. 셰이더 그래프 식은 바이너리라 [추정]이지만, 눈알 범위와 정확히 겹친다.
- 고칠 방법(웹): 눈동자 i 의 마스크 = 정점색 _C1 의 해당 채널(r/b). 알베도 알파 규칙은 "눈알 정점의 알베도 알파가 128 미만인 것이 하나라도 있는 캐릭터"(pc01~06·pc11·pc14·pc50·pc51)에만 곱한다 → 마리오 등 기존 결과는 그대로, 동키콩은 눈동자가 나온다. 변환기는 _C1 을 남긴다.
- 동키콩·가봉(pc61)은 **눈꺼풀을 셰이더 그래프로 그린다**: 재질 샘플러 `*_eyelid_arr_alb`(위 피부·아래 투명, 가장자리 v = 0.50 동키콩 / 0.66 가봉), `*_eyelid_bend`(128×8 가로 곡률 표), 파라미터 `material_utility_parameter2/3`(눈 0/1, 기본 (0.38, −0.33, 0, 0) 동키콩 / (0.55, −0.30, 0, 0) 가봉, 깜빡임 fmab 에서 x 0.38 → −0.05, z 0 → 3 → 8.4) [데이터].
  - 눈알에는 눈 국소 좌표 **TEXCOORD_2** 가 있다(눈 1: x 0~1, 눈 0: x 1~2, y 위 0.145 → 아래 0.884, 몸은 x < 0) [데이터: 위치 y 와 상관 −0.998].
  - [추정] 눈꺼풀 = eyelid 텍스처를 (frac(t2.x), t2.y − s) 에서 샘플해 그 알파만큼 덮는다. s = 닫힘 정도 c × (눈알 아래 끝 t2.y − 텍스처 가장자리), c = clamp((x기본 − x)/(x기본 − x최소), 0, 1), x최소 = fcl_blink00 의 최솟값. 열림(c = 0)은 텍스처 그대로(동키콩: 홍채 위 57% 덮음 — 캡처의 반쯤 감은 눈과 맞음), 완전 닫힘(c = 1)은 눈알 전체. y·z·w·bend 의 뜻은 [미확정].
- 시선: 카드 뷰는 ComHeading 을 켜지 않는다(FUN_7100340180 에 시선 호출 없음) [판독] → 눈 방향은 모션 재질 표(parameter0/1 오프셋)만 따른다. 1차 구현도 그 값을 쓰고 있었고, 동키콩 "시선 이상"은 위 마스크 문제(눈동자 미표시)였다.

### 12.3 배경음악 [판독][데이터]

→ 화면별 원본 BGM(라벨·시작·전환 페이드)·웹 연결: [04_sound.md §12.14](../engine/04_sound.md) (2026-10-08).

- 캐릭터 선택은 menu01 장면 안의 `ComUiSettingPlayer` 단계다. BGM 은 장면 시작(`menu01::SequenceManager::Initialize` 끝)에서 `SoundManager::PlayBgm` → `SoundModule::Play("SM_BGM_MENU_MAP")` 로 이미 돌고 있고, 접속 UI 동안 그대로 이어진다. UI 를 띄울 때 `DuckingAmb(1)`(환경음 덕킹), 닫을 때 `DuckingAmb(0)` [판독 menu01 SequenceModeSelect::MapMenuImpl·BinocularMenuImpl·SequenceStartPaMode::CheckPlayerCountImpl].
- 정지: 다음 장면으로 갈 때 `SoundManager::StopBgm` → `SoundHandle::Stop_Preset(FadeTimePreset)`(프리셋 값은 레지스터 인자라 [미확정]) [판독 SequenceStart*::CallSceneImpl 등 13곳].
- 데이터: `SM_BGM_MENU_MAP` = 스트림(fileId 298, `romfs/stream/SM_BGM_MENU_MAP.dspadpcm.bfstm`), 볼륨 33/127, DSP-ADPCM 스테레오 48 kHz, 전체 2,561,415 샘플(53.36 s), **루프 114,688 → 2,561,415 샘플(2.389 s → 53.363 s)** [데이터 sound_bfstm info].
- 웹: 독립 모듈은 화면 시작 때 `sound.bgm('SM_BGM_MENU_MAP', url, gain, loopStart, loopEnd)` 사건을 내고(원본에서는 이미 재생 중인 BGM 이므로 어댑터가 이미 돌고 있으면 무시), 결정 끝(다음 장면)에 `sound.bgmStop(fade)`. 취소(뒤로)는 같은 메뉴로 돌아가므로 BGM 을 끊지 않는다. 페이드 시간 [미확정] → 0.5 s [근사].

### 12.4 캐릭터 보이스 [데이터, 변형 선택은 추정]

- `SQ_VOI_PCnn_MENU00_SELECT`(볼륨 27): `SET_SELECT: setvar T14 <n>; SELECT: prg 10; (T14 == −1 이면 끝); T15 ≤ −1 이면 T15 = 3; userproc 1 <RAND_VOICE_PLAY_CN4>; transpose T14; note 60` [데이터 FSEQ].
- prg 10 의 영역은 키 60·61·62 → 서로 다른 웨이브 3개(마리오 bank 18 웨이브 52/53/54 = 0.81/1.51/0.97 s, 동키콩 bank 28 = 0.57/1.17/1.14 s, 캐서린 bank 29 16 kHz) [데이터].
- [추정] userproc 1 이 T14 를 0..T15−1 의 무작위 값으로 바꾸고, note 60 + T14 가 변형 하나를 고른다. T14 초깃값(0/160/176)은 반복 방지 기록으로 보이며 [미확정]. userproc 콜백 함수는 main 에서 못 찾았다(atk 정적 링크, 이름 없음; `audio/userproc/conv/%02d.msgpack` 로더 FUN_71000fa440 만 찾음).
- 닌군(pc62)은 userproc 없이 `prg 1 note 60; wait 20; prg 10 note 60` 로 고정 두 소리 [데이터].
- 웹: 변환기가 캐릭터별 변형 웨이브(영역 볼륨·원래 키 반영)를 wav 로 뽑고, 모듈은 보이스 사건에 변형 번호(주입 RNG)를 붙여 어댑터가 재생·정지(취소·Out 때 Stop)한다.

### 12.5 컨트롤러 아이콘·안내 아이콘 [데이터, 색은 참고 이미지]

- 카드의 `x_parts_hard`(sys_icon_hard_01) 부품 덮어쓰기에 **pane 기본 정보(52 B)** 가 있다: basicUsage 비트 8 = 위치(+0x08 tx, +0x0C ty), 16 = 크기(+0x28 w, +0x2C h), 32 = 배율(+0x20 sx, +0x24 sy) [데이터: 값 해석 일관 — x_null_lamp 배율 0.5, x_icon_hard_01 크기 90×90·ty −7, x_icon_00 ty 13] [비트 이름은 추정]. 1차 구현은 이를 무시해 아이콘이 두 배(180)로, 램프가 크게 떨어져 그려졌다.
- 램프(LED) 재질 텍스처 SRT 기본 t.y = 0.5 → 텍스처 아래쪽(초록 = 켜짐). 위쪽(어두운 칸) = 꺼짐 [데이터 sys_icon_lamp_05]. 캡처의 2P 카드 = ●●○○ [참고 이미지] → 플레이어 p 는 램프 0..p 켜짐(스위치 표준 패턴) [추정: UiControlJoycon 미판독].
- 본체 색: 아이콘 텍스처는 흰 본체 + 검은 버튼이다. 캡처 본체 (6,182,223) = 하드웨어 색(네온 블루) [참고 이미지]. [추정] 재질 white = 컨트롤러 본체 색. 웹은 어댑터 `players[].controllerColor`(기본 = 캡처 색)를 받는다.
- "뒤로" 안내 아이콘(U+E003): 본 글꼴은 컬러 글리프(흰 원 4개, 아래만 채움), 그림자 글꼴 글리프를 재질 색(검정)으로 아래에 깔아 외곽선처럼 보인다 — 1차 마지막 수정 그대로 [추정, 이번 헤드리스로 확인].

### 12.6 3D 칸 마스크 결합 [미확정 유지]

`x_pict_3d` 재질 = 0번 칸(렌더 타깃 자리 sys_white_00) · 1번 칸 sys_charasel_mask_00(위 알파 1 → 아래 254), TEV 1단계(color 1, alpha 1), 사용자 데이터 ui2dsys 형식 6. "곱하기"면 캐릭터 위쪽이 사라지고, "흰색으로 섞기"면 가슴 아래가 흐려진다 — 캡처는 이름 근처에서만 흰색이므로 어느 쪽도 그대로 맞지 않는다. TEV 모드 판독 전까지 1차 근사(마스크 생략, mask_00/01 페인이 흰 띠)를 유지한다.

### 12.7 3D 로딩 렉 [측정 계획, 원본 판독 일부]

- 원본: 카드 갱신(FUN_7100340180)은 `FUN_71001d4aa4(아카이브 관리자, "chara/pcNN")` 가 참일 때만 모델을 만든다 → 아카이브가 아직 없으면 **기다리지 않고 비워 둔다**(커서는 계속 움직임) [판독]. 아카이브를 누가 미리 올리는지는 menu01 에서 문자열을 찾지 못했다 [미확정].
- 웹 1차: 커서가 칸에 올 때 glb fetch·파싱·텍스처 디코드·셰이더 컴파일을 그 자리에서 한다. 이번에는 구간별 시간을 재는 계측(`preview3d.stats`: fetch+파싱, 모델 조립, 첫 그리기 ms)만 넣고 마지막 헤드리스 1회로 잰다. 대책(미리 읽기·compileAsync·ImageBitmap)은 수치를 본 뒤 다음 작업.

### 12.8 눈 회귀(마리오·루이지·피치·굼바 눈동자 사라짐)·동키콩 눈꺼풀·캐서린 흰자 — 원인과 수정 [데이터][회귀 원인 확정]

- **회귀 원인**: 12.2 구현에서 눈동자 마스크에 정점색 `_C1`(r/b)을 곱했다(`diffuseColor = mix(…, e0.a·eyeInside·sclera·vEyeMask.r)`). 그런데 `_C1` 표시는 동키콩에서만 눈알 전체와 일치하고, 마리오는 흰자 정점(알베도 알파 0) 570개 중 `_C1` 표시가 92개뿐이다 → 마리오·루이지·피치·데이지·굼바 등은 눈동자가 거의 다 지워졌다 [데이터: 눈알 정점 대조]. `_C1` 이 "눈알 전체" 라는 12.2 의 [추정]은 틀렸다(동키콩·캐서린만 맞음).
  - 수정: 눈동자 마스크는 1차 규칙으로 되돌린다 = `albedoMask` 면 (1 − 알베도 알파), 아니면 1. 동키콩은 `albedoMask = false`(눈알 알파 255)라 그대로 눈동자가 나온다. `_C1` 은 눈꺼풀·흰자 칠하기(아래)에서 몸 메시(`*_body__*`)에만 쓴다.
- **동키콩 눈꺼풀**: 12.2 의 식은 열림 상태에서 텍스처 가장자리(t2.y 0.508)를 그대로 써서 홍채 위 57% 를 덮었다 → 캡처(홍채가 다 보이고 위쪽 흰자만 눈꺼풀)와 다르다. 파라미터 y 를 쓰면 맞는다: 열림 y = −0.33 → 텍스처를 0.33 내려 가장자리가 t2.y 0.178(홍채 위 끝 0.294 보다 위)에 온다 [참고 이미지 일치, 식은 추정].
  - 수정 식 [추정]: 눈꺼풀 샘플 v = t2.y − (y + c·(아래 끝 − (가장자리 + y))), c = clamp((x기본 − x)/(x기본 − x최소), 0, 1). c = 0 이면 가장자리 = 텍스처 가장자리 + y(열림), c = 1 이면 눈알 아래 끝까지 덮음(닫힘). x·y 는 깜빡임 묶음 → 모션 → 재질 기본값 순으로 읽는다. 가봉: 가장자리 0.648 − 0.30 = 0.348 < 홍채 위 끝 0.5.
- **캐서린 흰자 핑크**: 캐서린 눈알(몸 메시 `_C1` 표시 141 정점)의 알베도는 분홍(평균 207, 69, 148)이고 알파 255 다 → 흰자는 셰이더 그래프가 칠한다고 본다. 재질 `material_utility_color1` = (1, 1, 1) [데이터]. (mps 의 흰자 = utilityColor0 와 달리 mpj 의 color0 은 (0.015, 0.025, 0.05) 어두운 남색이라 흰자가 아니다 [데이터].)
  - 수정 [추정]: 눈 텍스처가 있고 `albedoMask = false` 이며 눈알 정점 알베도가 채도 높은 색(채널 최대 − 최소 > 80)인 캐릭터만 몸 메시 `_C1`(r 또는 b) 영역을 `utility_color1` 로 칠한 뒤 눈동자를 얹는다. 22명 중 해당은 캐서린(차 138)뿐이다(요시 26, 동키콩 10, 가봉 7, 엉금엉금 34 — 이들은 알베도 흰자를 그대로 쓴다) [데이터].
- 회귀 검사(check_charselect 5c): 22명 전원 — 눈 텍스처가 있는 캐릭터의 눈동자 마스크 규칙(albedoMask 값이 데이터와 같음), 흰자색 = 재질 color1, 눈꺼풀 x·y 기본값 = 재질 parameter2/3, 대기 모션 0 프레임에서 눈 표정 메시 중 open 만 보임(visBone·뼈 기본값·vis 표 계산).

### 12.9 2차 구현·검증 결과 (2026-10-06)

순서: 12.1~12.7 을 구현 전에 쓰고 → 구현 → 사용자 화면 확인으로 드러난 눈 회귀는 12.8 에 원인·수정 방법을 먼저 쓰고 → 고쳤다. 헤드리스는 이 절 끝의 1회(눈 회귀 수정 전의 1회를 포함해 이번 작업에서 2회)다.

| 항목 | 웹 반영 | 수준 |
|---|---|---|
| 표정 메시 보임(캐서린·요시 등) | preview3d: visBone·뼈 기본값·모션/깜빡임 vis 표 | [데이터] 구현, 22명 대기 0f 검사(눈 표정 메시 80개) 통과 |
| 동키콩 눈동자·눈꺼풀 | albedoMask(데이터) + 눈꺼풀 식(12.8) | 눈동자 [데이터], 눈꺼풀 식 [추정] — 캡처와 같은 모양(홍채 다 보임, 위 눈꺼풀) |
| 마리오 등 눈 회귀 | 눈동자 마스크를 1차 규칙으로 되돌림 | 클로즈업에서 마리오·피치·굼바 눈동자 확인 |
| 캐서린 흰자 | utility_color1 로 몸 메시 눈알(_C1) 칠하기 | [추정] — 클로즈업에서 흰자가 흰색. 캡처 프레임에서 눈이 반쯤 감긴 모양이라 열린 눈 모양 대조는 남음 |
| 배경음악 | spec.bgm(SM_BGM_MENU_MAP wav 10.2 MB, 루프 2.389~53.363 s), 어댑터 bgm/bgmStop, 결정 끝에 0.5 s 페이드 | [판독]+[데이터], 페이드 시간 [근사] |
| 캐릭터 보이스 | 22명 변형 wav(닌군 1개, 나머지 3개), 어댑터 voice(url, gain, slot)·voiceStop | 변형 선택 [추정] |
| 컨트롤러 아이콘 | 부품 pane 기본 정보 덮어쓰기(아이콘 90·램프 배율 0.5), 램프 SRT(켜짐 0.5/꺼짐 0, 플레이어 p 는 0..p), 본체 색 = 재질 white(players[].controllerColor, 기본 #06b6df) | [데이터]+[추정] |
| 3D 칸 마스크 | 그대로(마스크 생략) | [미확정] 12.6 |
| 로딩 렉 | 측정만(preview3d.stats, handle.loadStats) | 아래 수치 |

**로딩 측정(헤드리스 크로미움 swiftshader, 로컬 서버, 대책 전)** — 처음 고른 캐릭터마다: glb·텍스처·motions 읽기 259~3,102 ms(비동기, 이 동안 카드는 비어 있고 커서는 움직인다 = 원본의 "아카이브가 없으면 비워 둠"과 같은 보이는 결과), 모델 조립 1~6 ms, **첫 그리기 1,461~2,735 ms**(마리오 1,705·와루이지 1,461·동키콩 1,467·캐서린 2,735; 같은 셰이더 프로그램을 이미 쓴 다음 캐릭터는 8~114 ms). → 메인 스레드를 막는 것은 **셰이더 컴파일(첫 그리기)** 이 대부분이다(소프트웨어 GL 이라 실제 GPU 보다 크다). 캐서린은 재질 조합(눈 셰이더 키)이 새로 나와 다시 컴파일됐다.
다음 할 일(원본의 보이는 동작을 바꾸지 않는 대책): 화면 진입 때 재질 조합별로 `renderer.compileAsync` 로 미리 컴파일, 유휴 시간 점진 미리 읽기, 텍스처 `createImageBitmap` 디코드. 대책 뒤 같은 헤드리스로 다시 잰다.

공개 인터페이스 변경(1차 대비): `CharSelectSoundAdapter.voice(label, url, gain, slot)`(인자 추가), `bgm(label, url, gain, loopStart, loopEnd)`·`bgmStop(fade)` 추가, `CharSelectPlayer.controllerColor` 추가, `CharSelectHandle.loadStats` 추가. `script/charselect_page.ts` 가 이 어댑터를 구현했다.

### 12.10 3차: 끊김·로딩 경합·모션·랜덤 (2026-10-07, 사용자 지적 "매끄럽지 못하고 랜덤도 이상") — 전체 점검 결과를 먼저 기록

이 절은 코드 수정 전에 썼다. 점검 범위: state.ts(5절 규칙), screen.ts(사건 → 카드·소리), preview3d.ts(로딩·모션), charselect_page.ts(소리 어댑터), 변환 데이터(glb 클립·motions.json·mpat).

**원본에서 3D·음성이 바뀌는 시점(다시 확인, 5.3·5.5)** [판독]: 커서가 칸을 옮길 때마다 FUN_710033c3f0 → FUN_7100340180 이 카드 모델을 지우고 새로 만든다(아카이브가 적재돼 있을 때만, 아니면 비워 둠). 랜덤 칸이면 지운 채 비운다. 보이스는 **결정(A) 때만** `SQ_VOI_PC%02d_MENU00_SELECT` 를 카드 슬롯 핸들에 재생하고, 결정 취소(B)·Out 에서 그 핸들을 Stop_Preset 한다. 커서 이동만으로는 보이스가 나지 않는다. 원본 장면은 캐릭터 아카이브를 미리 올려 두므로(카드가 즉시 바뀜) 웹도 진입 직후 미리 읽어야 같은 보이는 결과가 된다 [추정: 적재 주체 미판독, 12.7].

| # | 증상 | 원인(웹) | 수정 | 근거 |
|---|---|---|---|---|
| A | 캐릭터를 바꿀 때 끊김 | 커서가 온 순간에야 glb 를 읽고, 첫 그리기에서 셰이더 컴파일·텍스처 올리기가 메인 스레드를 1.4~2.7 s 막았다(12.9 측정) | 진입 직후 **유휴 미리 읽기**(커서에 가까운 캐릭터부터, 동시 2개) → 캐릭터마다 숨은 무대에서 한 번 조립 → `renderer.compileAsync` 로 셰이더 선컴파일(같은 재질 구성은 three 프로그램 캐시로 공유) → 텍스처를 프레임마다 나눠 `initTexture`. 한 프레임에 한 작업만(예산 6 ms). glb 이미지는 GLTFLoader 의 ImageBitmapLoader(createImageBitmap 비동기 디코드)를 그대로 쓴다 | 웹 성능 대책, 보이는 결과는 원본(즉시 바뀜)에 가까워짐 |
| B | 로딩 전에 바꾸면 모델이 안 나오거나 모션이 틀림 | (1) 로드가 끝나면 무조건 `play(idle)` 를 불러, 로딩 중에 들어온 결정 모션(co_chr_slct00a→b)을 대기로 덮었다. 랜덤 결정은 고른 캐릭터가 미리 읽히지 않아 거의 항상 이 경우였다(= "랜덤 이상"의 주원인). (2) 조립 직후 믹서를 한 번도 돌리지 않고 그려 **바인드 자세(T 포즈) 한 프레임**이 보였다 | 슬롯마다 요청 번호로 최신 요청만 붙이고, 늦게 끝난 로드는 캐시에만 둔다. 붙일 때는 로딩 중에 요청된 모션(현재·다음)을 그대로 재생. 재생 직후 `mixer.update(0)` 로 첫 프레임 자세를 만든 뒤 그린다. 이미 읽힌 캐릭터는 같은 프레임에 바로 붙인다 | [판독 5.2·5.5] 규칙 유지 |
| C | 음성이 안 나옴 | (1) 보이스 버퍼를 결정 순간에 처음 받아 디코드 → 늦거나, 그 사이 취소(B)가 와도 끊지 못해 늦게 울림. (2) AudioContext 가 사용자 입력 전에 만들어져 suspended 로 남으면 SE·보이스·BGM 이 전부 무음 | 화면 진입 때 SE·보이스(22명 변형)·BGM 버퍼를 미리 받아 디코드(어댑터 `preload(urls)` — 선택 메서드 추가). 슬롯마다 요청 번호를 두어 정지 뒤 늦게 끝난 디코드는 재생하지 않음. 재생할 때마다 suspended 면 `resume()` | [판독 5.2] 결정·취소·Out 시점 |
| D | 모션 이상: 표정(깜빡임) 어긋남 | 깜빡임 묶음(fcl_blink00)을 본 모션과 따로 센 프레임으로 돌렸고, 묶음이 없는 모션(co_chr_slct00a)으로 바뀌면 깜빡임 믹서가 마지막 값(반쯤 감긴 눈꺼풀 뼈)을 남겼다 | 원본 AnimationNodeBundle 규칙대로 깜빡임 프레임 = 본 모션 노드 프레임(같이 시작, 각자 길이로 반복) [판독: SHARED chara1801 — 값 설정은 자식 전부]. 묶음이 없는 모션에서는 깜빡임 동작을 멈춰 뼈를 기본값으로 되돌린다 | [판독] |
| E | 모션 시작 프레임 | 웹은 대기 모션을 항상 0 프레임부터 | 원본: `AddAnimation(…, registerIdle 1, …)` 이 이름에 "_idle" 이 든 모션을 idleRandom 표에 true 로 넣고(main `ComActorMotion::AddAnimation` @0x710002d7d0, `analysis/decomp/character_motion.c`), 시작 리스너는 이전 노드가 없거나 루프면 idleRandom 인 모션을 **난수 시작 프레임(0..FrameMax)** 으로 둔다(09 §6.4). 카드 뷰는 SetFrame(0) 을 부르지 않는다(FUN_7100340180) → 새 모델의 대기 모션(co_idle00·co_chr_idle00)과 결정 취소 뒤 대기는 난수 시작, co_chr_slct00a 는 0. 웹은 주입 난수로 같게 | [판독] |
| F | 모션 전환이 툭 바뀜 | stopAllAction 으로 즉시 교체 | 전이표: 메뉴 장면 mpat(`menu01_*.mpat`)은 없고 `sys_pc.mpat` 에 co_idle00·co_chr_idle00·co_chr_slct00a/b 사이 항목이 없다 [데이터] → MotionArg 기본 blendTime(−FLT_MAX → 리스너 0.1) 적용, 노드가 없으면 0. 크로스페이드는 type 4 또는 type 1 + 슬롯 모드 2 일 때만이라 실제 크로스페이드 여부는 [미확정](09 §6.5). 웹은 이전 노드가 있을 때 0.1 s(6f) 크로스페이드 [추정]. EnqueuePlay(a → b)도 같은 시작 리스너를 지나므로(노드 있음 → 0.1) 같게 둔다 | [판독]+[추정] |
| G | 루프·클립 길이 | 이상 없음: 22명 전 클립의 마지막 키 시각 = frames/60(예 pc01 co_idle00 120f = 2.0 s), 루프 플래그는 FSKA 값 그대로 [데이터: 변환 glb 대조] | 변경 없음 | [데이터] |
| H | 랜덤 칸 규칙 | state.ts 의 랜덤 결정(풀 = 0..21 중 점유·사용 불가·잠김 제외, `rand(n)`), 커서 → 고른 칸으로 이동(FUN_710033c3f0, 커서 SE 없음), press→pressed, 선택 모션·보이스는 5.2 와 일치 [판독 대조]. 차이는 B·C(로딩 경합)뿐 | 상태기계 변경 없음, 시험에 랜덤 결정 뒤 사건 순서(card → motion → voice) 검사 추가 | [판독] |

**인터페이스 변경(하위 호환, 선택 항목만 추가)**: `CharSelectSoundAdapter.preload?(urls)`(소리 미리 받기), `CharSelectHandle.prepStats`(미리 준비 구간 측정), `Preview3D` 생성자 셋째 인자 `rand`(시작 프레임 난수, 기본 Math.random — 원본 오프라인은 SyncRand 가 아닌 비동기 RandModule 이라 상태기계의 주입 난수와 섞지 않는다). `runCharSelect`·`createCharSelect` 의 기존 인자는 그대로.

**측정 방법**: 헤드리스(swiftshader, CPU 래스터라 실제 GPU 보다 컴파일·업로드가 훨씬 느림)에서 `prepStats`(미리 준비 단계별 동기 ms)·`loadStats`(커서 이동 → 붙이기·첫 그리기 ms)와 PerformanceObserver longtask(50 ms 넘는 메인 스레드 작업)를 모은다. 대책 전 수치는 12.9 의 같은 환경 측정(첫 그리기 1,461~2,735 ms)이다.

**결과(2026-10-07, 헤드리스 swiftshader — CPU 래스터라 셰이더 링크·래스터가 실제 GPU 보다 수십 배 느림)**

| 구간 | 대책 전(12.9) | 대책 후 |
|---|---|---|
| 커서 이동 → 카드 표시(이미 준비된 캐릭터) | 첫 그리기 1,461~2,735 ms 를 그 프레임에서 막음 | 대기 0, 조립 1~4 ms, 첫 그리기 1~22 ms(pc13 3 ms) |
| 준비 전 캐릭터로 이동·랜덤 결정 | 같음 + 로드 완료 때 결정 모션이 대기로 덮임 | 카드는 준비될 때까지 비움(원본 규칙), 붙일 때 조립 1~4 ms·첫 그리기 1~50 ms(1건 941 ms — swiftshader 가 앞 프레임의 준비 그리기를 늦게 처리한 것으로 봄 [추정]), 결정 모션 시간축 유지 |
| 미리 준비(배경, 캐릭터마다 단계당 한 프레임) | — | 조립 0~3 ms, compileAsync 동기 0~6 ms(링크는 지연), 텍스처 1장 0~14 ms(1건 1,058 ms), 한 번 그리기: 새 셰이더 프로그램이 필요한 10명 1.0~3.3 s, 나머지 0~6 ms |
| longtask(50 ms 넘는 작업) | — | 한 화면 진입 뒤 준비 끝(약 130~143 s)까지 15~16건, 최대 2.5~3.3 s, 합 21~29 s = 거의 전부 새 셰이더 프로그램 링크 |

- swiftshader 에는 KHR_parallel_shader_compile 이 없어 링크 비용이 "한 번 그리기" 단계로 옮겨 갔다. 실제 GPU(ANGLE·D3D11/Metal 등은 이 확장을 제공)에서는 compileAsync 가 드라이버 스레드에서 링크를 기다리므로 이 단계가 짧다 — 실제 GPU 수치는 이번에 재지 못했다 [미확정].
- 경합 시나리오(진입 8프레임 뒤 1P 랜덤 결정 → 굼바, 2P 오른쪽 4번): 세 카드 모두 지금 커서 캐릭터로 붙고 굼바는 결정 모션 시간축으로 붙었다(04_race_random.png). 콘솔 오류 0.
- 보이스·SE·BGM 은 헤드리스에서 mute=1 이라 재생 확인은 못 했다(어댑터 코드만 바뀜).

- 정정(2026-10-07, 사용자 지적 "동키콩 → 랜덤/잠긴 칸이면 캐릭터가 멈춰 버림"): 카드 렌더 타깃이 `samples: 4`(MSAA)라 three 가 멀티샘플 → 텍스처 resolve 를 `render()` 안에서만 한다. 모델이 없을 때 `clear()` 만 하고 `render()` 를 건너뛰어 텍스처에 이전 캐릭터 마지막 프레임이 남았다. 원본 규칙(5.5: 랜덤·잠김 = 모델 지우고 비움)대로 비우려면 빈 장면도 매 프레임 `render()` 한다(`preview3d.ts` render). [실행: 코드 분석, three r180 동작]

- 정정(2026-10-08, 로더 관리자 §13): 앱 페이지에서는 3D 미리 준비의 **받기·풀기**를 `assetHooks.broker`(앱 로더 관리자)가 맡는다 — 진입 때 사람 커서 캐릭터만(등급 0), 그다음 커서 이웃 칸(2), 나머지(3, 데이터 절약이면 안 받음). 커서가 움직이면 새 커서 캐릭터를 올리고 빠진 캐릭터를 내린다. 브로커가 없으면(시험·단독 페이지) 이 절의 방식(동시 2개, 커서 거리순) 그대로. GPU 단계·슬롯 요청 번호·랜덤·잠김 칸·결정 모션·보이스 요청 번호는 무변경, 소리 바이트도 관리자 경유(디코드는 페이지). docs/engine/loader_manager.md §13.4.

### 12.11 몸 재질 셰이더 그래프 판독 — 캐서린 "배까지 전부 분홍"·22명 _C1/_C2 규칙 (2026-10-07, 코드 수정 전에 기록)

**판독 방법(새로 연 경로)** [판독]: 캐릭터 셰이더 팩 `extracted/bea/chara~pcNN.nx.bea/_chara/pcNN.bnbshpk` → `bnbshpk_split.py`(FSHA: fluid·forward_plus·container) → `bfsha_dump model/match`(재질 옵션 = glb `extras.fres.shader.options`, 입력 `analysis/mat/charsel_mats_in.json`) → 몸 재질 프로그램 고르기(`analysis/mat/prog/match.json`) → envydis gm107 디스어셈블 + 이름 주석 `sass_dis.py` → `analysis/mat/sass/pcNN__forward_plus__pK.{vs,fs}.txt`(24 프로그램). 도구는 F:/dev/mps 판(hsmg402 판독 때 만든 것)을 `web/tools/analysis/`·`tools/envydis_build/` 로 복사해 썼다. mpj 판은 텍스처가 **바인드리스**(`tex b`, 핸들 = Material UBO 앞 0x10 + 0x10 × 샘플러 위치)라 `sass_dis.py` 에 `Material.@샘플러` 주석을 더했다(pc13: 0x210 = `sg_utility_texture2darray0` 이 `array t2d` 로 읽히는 것으로 위치 규칙 확인).
- 정점 입력 위치 = bfsha 속성 위치: `_u0`(uv0·uv1) 8, `_u2` 9, `_c0` 10, `_c1` 11, `_c2` 12. VS 출력 v10 = 몸 알베도 좌표 — FS 가 몸 알베도 슬롯(`_a0` 과 같은 텍스처의 `sg_utility_*`) 핸들로 `tex` 하는 좌표가 22명 모두 `ipa v10.xy` 다.
- 규칙 표 생성: `web/tools/analysis/charsel_body_graph.py`(VS 를 다항식으로 풀어 v10 = S·(uv0 + Σ k·정점색·파라미터) + O, FS utility_color 사용처는 손 판독 표) → `analysis/mat/charsel_body_graph.json`.

**캐서린(pc13, 프로그램 p0) 몸 기본색** [판독 VS 802~808, FS 33~40·244~330]:
1. 알베도 좌표 = **(u, 0.8·v + 0.2)** (`fmul32i 0x3f4ccccd`, `fadd32i 0x3e4ccccd`). 알베도 1024×1280 의 위 256 px(v < 0.2)는 눈꺼풀 그림 8칸이고 몸은 아래 80 % 다. 웹은 가로세로 비 규칙(1:2 → v2, 2:1 → u2, 그 밖 그대로)이라 캐서린을 **v 그대로** 읽어 몸 전체가 위로 밀린 자리(분홍)를 칠했다 = 사용자 지적 "배도 흰색인데 전부 분홍"의 원인이다. 몸 메시 눈알 정점(_C1 r/b)의 알베도 평균이 옛 좌표 (203, 59, 144) 분홍 → 새 좌표 (175, 190, 194) 흰색이고, 거의 흰 정점 수도 199 → 297 로 는다 [데이터].
2. 기본색 = 알베도 → 눈 그림자 `eyeshadow_alb`(v13, 칸 안일 때 α 로 섞기) → 눈동자 `eye_alb`(v11 = uv1 − c1.r·P1 − c1.b·P0, 칸 안일 때) — 웹 눈 합성과 같다.
3. **utility_color 는 캐서린 FS 에 한 번도 나오지 않는다**. 12.8 의 "흰자 = utility_color1 로 칠하기" [추정]은 틀렸다 — 흰자는 올바른 좌표의 알베도가 준다. 웹의 흰자 칠하기(sclera)를 없앤다.
4. **_C1 각 성분**: r·b = 눈 0·1 표시(눈 좌표 오프셋 가중, 모델 어둡게 `Model[0x2a4]` 에서 눈알 제외), **g = 노멀 배열 층 번호**(`f2i u16` → `sg_utility_texture2darray0` = `body_arr_nml` 층 — 색이 아니다. 조정자가 본 "G = 1 이 1993 정점"은 노멀 2층을 쓰는 영역), a = 반사(큐브맵) 세기 곱. 정점색 _C0 은 `Model[0x2ac]`(실행 중 모델 값, 색 변형 번호로 봄 [추정]) 와 함께 조명 뒤쪽에서만 쓰인다 — 기본 0 [미확정].
5. 그 밖의 모델 값 `Model[0x2a4]`(어둡게)·`Model[0x280]`(젖음 섞기, `wet_mask`)는 실행 중 값이라 캐릭터 선택에서는 0 으로 둔다 [추정].

**22명 전수(`charsel_body_graph.json`)** [판독]:

| 규칙 | 해당 | 웹(수정 전) | 수정 |
|---|---|---|---|
| 알베도 좌표 기본 변환 S·O | v·0.5 + 0.5: pc01~06·08·09·11·14·51·54·58, u·0.5: pc50, 그대로: pc07·12·52·53·56·61·62, **v·0.8 + 0.2: pc13** | 가로세로 비 규칙 — pc13 만 다름 | 셰이더 판독 값(S, O)을 그대로 쓴다 |
| 알베도 좌표 오프셋 = _C1 r/b(눈 영역) × 파라미터 | P2: pc01·02·06·51, P4: pc03·04·11·14 (u += c1.b·P.x + c1.r·P.z, v += c1.r·P.w + c1.b·P.y), P0/P1: pc08·09(u += c1.b·P0.x + c1.r·P1.x, v 같은 꼴), pc54(u 부호 −), pc58(c1.b·P0) | **없음** | 정점 셰이더에서 더한다. 깜빡임 fcl_blink00 과 결정 co_chr_slct00a 가 이 값을 0 → 0.5/0.25 로 움직여(예 마리오 P2) 눈 영역 알베도를 눈꺼풀 그림 칸으로 옮긴다 = 원본 깜빡임·표정 [데이터: motions.json] |
| 알베도 좌표 오프셋 = _C2 | pc56: v += c2.r·P2.x + c2.b·P0.x(깜빡임 0 → 0.2), pc08·09: v += 0.01·(c2.b·P2.y + c2.r·P3.y)(움직이지 않음) | 없음(변환기가 _C2 를 버림) | 변환기가 _C2 를 남기고 정점 셰이더에서 더한다 |
| 기본색 섞기(utility_color) | pc08·09: base = mix(base, alb·(sat(P2.x)·c2.b + sat(P3.x)·c2.r) + C1, max(c2.r, c2.b)) — 깜빡임·결정에서 P2.x/P3.x 가 1 → 0 이면 눈 영역이 C1(0.025, 0.02, 0.015, 짙은 갈색)이 된다. pc58: base = mix(base, alb·P2.y + C1, c2.b) — 결정·깜빡임에서 P2.y 1 → 0.44/0 | 없음 | 조각 셰이더에서 같은 식 |
| 기본색 섞기 — 효과 없음 | pc56: x = mix(C1, C2, 모델 색 변형) + max(alb·c1.r·P3.x, alb·c1.b·P1.x), 기본 P1.x = P3.x = 1·C1 ≈ 0.002 이고 모션이 P1/P3 를 안 움직임 | — | 적용 안 함(차이 없음) [데이터] |
| utility_color 를 쓰는 다른 캐릭터 | 없음(24 프로그램 grep) | 캐서린 흰자 칠하기(12.8) | 제거 |

- 파라미터 값 = 재질 기본값, 모션 재질 표(지금 모션, 깜빡임 묶음이 있으면 깜빡임 표가 먼저 — 눈 오프셋과 같은 규칙)를 프레임마다 읽는다.
- 노멀·거칠기 맵도 같은 v10 으로 읽는 것으로 본다(FS 의 노멀 배열 좌표 = v10.x, 층 = c1.g) — 웹은 같은 오프셋을 노멀·거칠기·금속 맵 좌표에도 더한다 [판독 일부].
- 남은 [미확정]: c1.g 노멀 층 2개를 웹이 0 층만 쓰는 것(색 아님), `Model[0x2ac]`·`Model[0x2a4]`·`Model[0x280]` 실행 중 값, pc08·09 의 c1.g 보조 표본(`P4.x` 로 섞음, 모션에서 P4.x = 1 이라 영향 없음).

**12.11 구현·검증 결과 (2026-10-07)**
- 변환기 `charsel_chara.py`: `_C2` 를 남기고, `charsel_body_graph.json` 규칙을 spec `chars[].body`(uv S·O·항, pc08·09·58 tint 색 = utility_color1)로 넣는다. 눈 정보의 알베도 좌표도 이 S·O 로 계산하고, 흰자 칠하기(`eye.sclera`)는 없앴다. 변환 결과 spec 차이 = 22명 `body` 추가 + pc13 `eye.sclera` 삭제뿐(다른 값 그대로).
- `preview3d.ts`: 알베도·노멀·거칠기·금속 맵 좌표 = 판독 S·O(텍스처 repeat/offset) + 정점 셰이더 `bodyD`(_C1/_C2 × `bodyP[8]`), 조각 셰이더 tint, 파라미터는 프레임마다 깜빡임 표 → 모션 표 → 기본값. 흰자 칠하기 셰이더 코드 삭제.
- 검사: `check_charselect` 5d(22명: 규칙 = 판독 표, pc13 만 S·O 가 가로세로 비 규칙과 다름, tint 유무·색, _C1/_C2 남김, 오프셋 파라미터 기본 0, 셰이더 흰자 칠하기 없음) — 2403/2403. `test_charselect` 67/67, tsc 신규 오류 0, `check_logic` 통과.
- 헤드리스(1회): 캐서린 확대(`05_body_pc13_catherine.png`)·결정 화면(`03_all_decided_ok.png`)에서 배·흰자가 흰색, 콧구멍·반지 위치 정상. 부끄부끄(tint 셰이더, 경합 페이지 랜덤 결정)가 결정 모션에서 표정이 바뀌어(P0 오프셋) 그려짐(`04_race_random.png`) = tint 셰이더 컴파일 확인. 요시 이후 확대 촬영은 촬영 스크립트 버그(목표 칸이 점유되면 그 캐릭터를 끝없이 기다림)로 시간 초과 — 스크립트는 고쳤고 재촬영은 하지 않았다.
- 12.8 의 "캐서린 흰자 = utility_color1" [추정]은 이 판독으로 철회한다.
