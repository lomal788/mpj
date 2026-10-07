# 미니게임 결과 연출 (bq::MGResult) — 원본 분석

2026-10-07. 상태: **분석 완료(판독·데이터, 흐름·선택 규칙 수준). 웹 구현 없음, 원본·웹 실행 대조 없음.**
형식은 `F:/dev/mps/web/docs/분석.txt` 11절 구성. 이 문서는 [minigame_scene.md](minigame_scene.md) §5.1 의 단계 13·14(결과 시작·대기) **안쪽**이다.
장면 단계·엔딩 5단계·텔롭 종류·페이드 규칙은 그 문서를 따르고 다시 쓰지 않는다. 3D 결과 무대의 모델 배치·카메라 키·모션 블렌드 세부(함수 4개, 약 13 KB)는 흐름과 입력만 적고 내부 수치는 §11 로 남긴다.

확정 수준: **[판독]** 디컴파일 C, **[데이터]** 원본 표, **[추정]**, **[미확정]**, **[실행: 변환]**. 주소는 main NSO.

---

## 1. 기능 개요와 사용자에게 보이는 동작

미니게임 본편과 종료 텔롭이 끝나면 결과가 나온다. 결과는 **두 갈래** 중 하나다.

| 갈래 | 조건 | 보이는 것 |
|---|---|---|
| **A. 공용 결과 무대** | 미니게임이 `MGResult::SetPlayer` 로 결과 플레이어를 등록함(`MGResult+0x13C`=1) | 화면 페이드아웃 → 결과 전용 3D 무대에 캐릭터 배치(승자·패자·무승부 자리) → 페이드인 → 카메라 연출 중 정해진 시점에 **승리 텔롭**(또는 코인 표시) → 텔롭 퇴장 |
| **B. 미니게임 고유 엔딩** | 등록하지 않음(`+0x13C`=0) | 장면의 엔딩 5단계(EndingFade·ChangeCut·Before·Ending·After 훅)만 실행. 연출은 미니게임이 자기 훅에서 직접 한다 |

캐릭터 미니게임(`IsCharaMiniGame`)이고 판정 종류가 0 이 아니면 A 갈래 안에서 **승리 주사위** 연출(`mg_tl401_windice` 텔롭, `SM_BGM_SSMG_DICE`)이 추가된다.

어떤 무대·텔롭·카메라를 쓸지는 **데이터 표 `mgResultList.json`** 이 정한다: 이번 판의 (규칙, 모드, 팀전 여부, 승자 수, 패자 수, 무승부 수)로 패턴 번호를 찾고, 그 패턴의 연출 행을 쓴다.

## 2. 분석 대상 원본·자료 위치

| 자료 | 위치 |
|---|---|
| 신규 디컴파일 | `analysis/decomp/mgresult_main1.c`(36함수: 결과 흐름 `FUN_71002e7d90` 하위 전부, 표 로더, 패턴 선택, `SetPlayer`·Set 계열, 무대 구성 입구), `mgresult_main2.c`(11함수: 규칙·모드 이름, 승·패·무 집계, 무대 구성 하위, 텔롭 번호) |
| 기존 디컴파일 | `mgscene_main1.c`(`ResultFlowFunction`, 결과 파이버 시작·완료), `mgscene_main3.c`(`FUN_71002e7d90`), `core_b5.c`(단계 13·14) |
| 결과 연출 표 | `extracted/bea/mg~mgResult.nx.bea/mg/mgResult/data/mgResultList.json` — `pattern` 55행, `list` 55행 [데이터] |
| 결과 UI 레이아웃(참고) | `extracted/converted/ui/mgm00/mgm00_base_mgresult_00*.bflyt/.bflan`, `mgm00_mgresult_face_00/01` — 모드 쪽 결과 패널로 보이며 이 문서의 코드 경로에서 직접 참조를 확인하지 않음 [미확정] |
| 참조 위치 덤프 | `analysis/mgresult_refs_setresult.txt`, `mgresult_refs_setround.txt` (`MgmcommonSymRefs.java`, 디컴파일 없이) |

## 3. 진입점과 전체 호출 흐름

```
MinigameScene 단계 13 (minigame_scene §6.6)
   OnEndingInit(handle) 참이면
      if MGResult+0x13C == 0:  MGResult.ResultFlowFunction(엔딩 5단계 FUN_71002e34d0)   ← +0x100 에 저장
      FUN_71002ee130: MGResult+0xB8 에 FiberLite 생성 → 본체 FUN_71002e7d90
MinigameScene 단계 14: MGResult+0xB8 파이버 완료까지 대기 → 단계 16

결과 파이버 FUN_71002e7d90(MGResult):
   if +0x120 (흐름 함수 등록됨):  등록된 함수만 실행하고 끝   ← 갈래 B (엔딩 5단계)
   elif 캐릭터 미니게임 && 등록 플레이어 수(+0x90) != 1 && JudgeType != 0:   ← 갈래 A-주사위 (§6.4)
   else:                                                                        ← 갈래 A-일반 (§6.3)
```

- `ResultSetupFunction(fn)` @0x71002edb1c 는 함수를 `+0xD0`(포인터 `+0xF0`)에 저장하고, 무대 구성 첫머리(`FUN_71002e8470`)에서 부른다 [판독]. 미니게임이 결과 무대 직전에 자기 준비를 끼울 수 있는 자리다.
- `ResultFlowFunction(fn)` @0x71002edbc8 는 `+0x100`(포인터 `+0x120`)에 저장한다 [판독]. 장면은 `+0x13C`=0 일 때만 이것을 등록하므로 **두 갈래는 배타적**이다 → 공용 무대를 쓰는 미니게임에서는 장면의 엔딩 훅(vt+0x260~0x280)이 불리지 않는다 [판독].
- `+0x13C` 는 `MGResult::SetPlayer` @0x71002edc80 의 끝에서 1 이 된다 [판독, mgresult_main1.c 6138]. 다른 writer 는 이번 범위에서 찾지 않았다.

## 4. 구조체·필드·상수 표

### 4.1 MGResult 필드 [판독]

| 오프셋 | 형 | 뜻 / writer → reader |
|---|---|---|
| +0x68~+0x78 | 엔티티 핸들 | 승리 텔롭(`ComUiMGTelop`) 엔티티 → §6.3 텔롭 시작·퇴장 |
| +0x80/+0x88/+0x90 | 목록·개수 | `SetPlayer` 가 승패에 따라 넣는 플레이어 목록 1 과 개수(+0x90). 캐릭터 주사위 분기 조건(`!= 1`) |
| +0x98/+0xA0/+0xA8 | 목록·개수 | `SetPlayer` 목록 2 와 개수(+0xA8). 주사위 갈래 텔롭 순회 대상 |
| +0xB0 | 핸들 | 장면 `OnEndingInit` 에 넘기는 결과 핸들(`FUN_71002f4610`) |
| +0xB8 | `FiberLite*` | 결과 파이버(완료 판정 `FUN_71002ee210`) |
| +0xC0 | 표* | `mgResultList.json` 읽은 결과(pattern 0x48A B × n, list 0x34C B × n) |
| +0xD0 / +0xF0 | std::function / 포인터 | `ResultSetupFunction` |
| +0x100 / +0x120 | std::function / 포인터 | `ResultFlowFunction` |
| +0x130 | s32 | 선택된 패턴 번호(−1 = 맞는 패턴 없음 → 무대 연출 생략) |
| +0x13C | u8 | 결과 플레이어 등록됨(`SetPlayer`) |
| +0x13D | u8 | 승리 텔롭 이미 시작함 [추정: §6.3 조기 반환 조건] |
| +0x140 | s32 | 결과 텔롭·결과음 번호(`FUN_71002f1870`, −1 = 없음) [추정: 이름] |
| +0x1A0~+0x1B0 | 소리 핸들 | 주사위 BGM `SM_BGM_SSMG_DICE` |
| +0x188~+0x198 | 엔티티 | 주사위 텔롭(`ComUiGenericTelop`) |

Set 계열(결과 무대에 미니게임이 넘기는 값) [판독: 심볼·짧은 C]: `SetModel` @0x71002ee068, `SetMotion` @0x71002ee07c, `SetCameraType` @0x71002ee0cc, `SetCameraPattern` @0x71002ee0d4, `SetCameraNearZ/FarZ` @0x71002ee0f4/0fc, `SetPcPosOffset` @0x71002ee104, `SetThemeChara` @0x71002ee118. 필드 오프셋별 의미는 §11.

### 4.2 결과 연출 표 `mgResultList.json` [데이터 + 판독]

로더 `FUN_71002e70f0` 이 `mg/mgResult/data/mgResultList.json` 을 읽는다 [판독]. 두 배열이다.

**`pattern`** (55행, 런타임 레코드 0x48A B): 이번 판을 패턴 번호로 바꾸는 표.

| 키 | 레코드 오프셋 [판독] | 값 [데이터] |
|---|---|---|
| Pattern | +0x000 s16 | 0~54 |
| Rule | +0x002 문자열 | Boss 15, Coin 10, VS4 5, Chara 5, CharaRank 5, PataPata 5, 1VS3 4, 2VS2 3, … |
| Mode | +0x082 문자열 | None 35, Quest 8, Normal 5, Battle 3, BossRush 2, Taxi 2 |
| Team | +0x482 u16 | 0/1 |
| Win / Lose / Draw | +0x484 / +0x486 / +0x488 s16 | 인원 수, **−1 = 아무거나** |
| Comment | — | 예: `VS4_1人勝ち`(1명 승리) |

**`list`** (55행, 런타임 레코드 0x34C B): 패턴 번호별 연출.

| 키 | 오프셋 [판독: rtti Property] | 값 [데이터] |
|---|---|---|
| Pattern | +0x000 | — |
| Telop_1 / Telop_2 | +0x002 / +0x042 | WinRightBottom 17, WinCenterBottom 9, Draw 7, None 22 / WinRightTop 8, None 47 |
| TelopIn | +0x084 | 90 ×51, 140 ×4 — 텔롭을 띄우는 시점(§6.3) |
| WinLoseType | +0x088 | Normal 45, Coin 10 |
| PosType | +0x0C8 | Pos4_Draw 15, Pos4_Boss 10, Pos2 8, Pos4_Win1~4, Pos4_Chara 4 |
| CamType | +0x108 | Common 50, PC 5 |
| KoopaOffsetZ | +0x148 | 0 / −0.25 |
| Pos_Normal_1/2, Pos_Overlook_1/2 | +0x14C / +0x18C / +0x1CC / +0x20C | 배치 노드 이름 `pos_pc_win1_1` … |
| Cam_Normal_1/2, Cam_Overlook_1/2 | +0x24C / +0x28C / +0x2CC / +0x30C | 카메라 이름 `result_cam_win1_pc` … |

## 5. 상태 전이와 전체 수명 [판독]

```
생성(장면 준비 중, §11) ─▶ (미니게임) SetPlayer/Set… 호출 ─▶ 장면 단계 13: OnEndingInit, 흐름 등록 여부 결정, 파이버 시작
   ─▶ 결과 파이버 실행(갈래 A 또는 B) ─▶ 파이버 완료 ─▶ 장면 단계 14 → 16
소멸 FUN_71002e76e0: 문자열 버퍼 해제, +0x100/+0xD0 함수 객체 파괴, 표(+0xC0) 해제(FUN_71002e7490), 파이버(+0xB8) 삭제
```

결과 파이버는 `Fiber::Wait/Sleep` 으로 진행하는 **순차 코드**다. 별도 상태 번호가 없다(엔딩 5단계만 `+0x2A0` 상태기계, minigame_scene §6.6).

## 6. 계산식·조건·상세 의사코드 [판독]

### 6.1 패턴 고르기 `FUN_71002ee230`

```
rule  = RuleName()      # FUN_71002f462c
mode  = ModeName()      # FUN_71002f4758
team  = (GameRule - 1) < 2          # GameRule 1·2 = 팀전
win   = 승자 수  (FUN_71002f0ba0)
lose  = 패자 수  (FUN_71002f4840)
draw  = 무승부 수(FUN_71002f4a30)
for rec in pattern (파일 순서):
    if rec.Rule == rule && rec.Mode == mode && rec.Team == team
       && (rec.Win == -1 || rec.Win == win) && (rec.Lose == -1 || rec.Lose == lose) && (rec.Draw == -1 || rec.Draw == draw):
        return rec.Pattern
return -1
```

**규칙 이름** `FUN_71002f462c`:
| 조건(위에서부터) | 이름 |
|---|---|
| `MGList::IsCoin(id)` | `Coin` |
| 캐릭터 미니게임 | JudgeType ≠ 0 ? `Chara` : `CharaRank` |
| GameRule == 9 | `Boss` |
| id 0x75~0x78 | `PataPata` |
| GameRule < 4 | 표 `0x71015d8254` = [`VS4`, `2VS2`, `1VS3`, `1VS1`][GameRule] |
| 그 외 | `None` |

**모드 이름** `FUN_71002f4758`: GameRule 9 → `BoardMode == 2` ? `Quest` : (`PlayMode == 6` ? `BossRush` : `Normal`); id 0x77 → `Battle`, 0x78 → `Taxi`; 그 외 `None`.

**승·패·무 집계** (결과 대상 플레이어 목록을 순회 [추정: 목록 출처]):
| 함수 | 코인 게임 아님 | 코인 게임 |
|---|---|---|
| 승자 `FUN_71002f0ba0` | `GetMinigameWinLose == 1` | `GetMinigameCoin > 0` |
| 패자 `FUN_71002f4840` | `GetMinigameWinLose == 0` | `GetMinigameCoin < 1` |
| 무승부 `FUN_71002f4a30` | `GetMinigameWinLose == 2` | — |

→ **승패 값 열거: 1 = 승리, 0 = 패배, 2 = 무승부**, 시작값 −1(mgm01 `FUN_71001f1e20` 가 −1 로 초기화) [판독]. 미니게임이 결과를 쓸 때 이 값을 써야 공용 결과 무대가 맞는 패턴을 찾는다.

### 6.2 무대 준비 `FUN_71002e8390` (갈래 A 공통)

```
WipeModule.FadeOut(1.0); 페이드 끝까지 Wait
Sleep(0.1)
무대 구성 FUN_71002e8470:
    ResultSetupFunction(+0xF0) 이 있으면 호출
    +0x130 = 패턴 고르기(§6.1); -1 이면 무대 없이 반환
    list[pattern].WinLoseType == "Normal" 이면 FUN_71002db328
    모션 FUN_71002ee410(co_idle00 / co_win00a·b / co_lose00a·b), 배치·모델·카메라 FUN_71002ef450 → efcd4 → eff60(+0x140 결정) → f0290
    MGUiMgr.TimingOut(2)
    (주사위 갈래 조건이면) 패배(WinLose == 0) 플레이어마다 개인 텔롭 FUN_71002ed480
    MGSound.TryStartResultSound(0, +0x140)
FUN_71002e8760
Sleep(0.5)
WipeModule.FadeIn(1.0); 페이드 중에는 (패턴 있으면) FUN_71002e8c20·FUN_71002e9270 갱신하며 Wait
```

### 6.3 갈래 A-일반 (`FUN_71002e7d90` 아래쪽)

```
무대 준비(§6.2)
if pattern != -1:
    FUN_71002ea020                     # 연출 시작
    FUN_71002ea5f0                     # 결과 카메라 컴포넌트(DAT_71019e3800) 재생 시작 → FUN_71002f4390
    while !FUN_71002ea700():           # 그 컴포넌트 끝(FUN_71002f4470)
        t = FUN_71002eaae0()           # 진행값
        텔롭 시점 FUN_71002ea810(t)    # 아래
        FUN_71002e8c20; FUN_71002eabf0; FUN_71002e9270    # 무대 갱신(캐릭터·카메라·이펙트)
        Wait
    if +0x140 != -1: 승리 텔롭(+0x68) Out → Finished 까지 Wait
```

**텔롭 시점** `FUN_71002ea810(t)`: `+0x13D` 가 서 있으면 반환. `t < list[pattern].TelopIn` 이면 반환. WinLoseType 이 `Normal` 이고 `+0x140 ≠ −1` 이면 승리 텔롭(`ComUiMGTelop`, +0x68) Start. `Coin` 이면 결과 플레이어별 `GetMinigameCoin` 으로 코인 표시 [판독]. TelopIn(90/140)의 단위는 카메라 컴포넌트 진행값이다 [추정: 프레임].

### 6.4 갈래 A-주사위 (캐릭터 미니게임, JudgeType ≠ 0, 목록1 개수 ≠ 1)

```
무대 준비(§6.2); pattern == -1 이면 끝
FUN_71002ea5f0; FUN_71002e8c20
주사위 BGM SM_BGM_SSMG_DICE(이미 재생 중이 아니면), SE SQ_SE_TLP_MG_RES_WIN_DIC
엔티티 생성 + ComUiGenericTelop, 메시지 "mg_tl401_windice" → Start → Sleep(1.0) → Out → Finished 까지 Wait → Sleep(1.0)
FUN_71002eb650                                       # 주사위 연출(co_dice_idle00, co_jump_dice01)
승리 텔롭(+0x68) Start → 5.0초 동안 FUN_71002e8c20·FUN_71002eabf0 갱신(dt 누적) → Out → Finished 까지 갱신·Wait
```

### 6.5 결과 기록과의 관계

- `MGResult` 는 **순위·승패·코인을 쓰지 않는다.** 읽기만 한다. 쓰는 것은 미니게임(minigame_scene §6.6)이다. 예외로 주사위 갈래 `FUN_71002eb650` 안에 `SetMinigameWinLose` 호출이 1곳 있다(mgresult_main1.c 4797) [판독: 호출 존재, 조건 미판독].
- 모드의 결과 ring 쓰기 `MinigameModeWork::SetMinigameResult` @0x71001f0460 은 main 안에 호출자가 없는 외부 공개 함수이고, 이를 가져다 쓰는 NRO 는 **mg0704, mg1602, mg1604, mgm03, mgm06** 이다(함수 목록 tsv 검색). **mgm01 은 가져다 쓰지 않는다** [데이터]. `SetRound` @0x71001f0440 의 main 호출자는 `FUN_71002c4b50` 하나다 [판독: 참조 덤프]. → 프리 플레이 결과 ring writer 는 이 문서 범위(MGResult)가 아니다(§11, mgm01_freeplay.md §11-1).

## 7. 애니메이션·소리·에셋 연결

| 사건 | 연결 [판독][데이터] |
|---|---|
| 무대 진입/퇴장 | `WipeModule.FadeOut/FadeIn(1.0)`, 사이 0.1 + 0.5 초 대기 |
| 결과음 | `MGSound::TryStartResultSound(0, +0x140)` |
| 캐릭터 모션 | `co_idle00`, `co_win00a/b`, `co_lose00a/b`, `co_applause00`, `co_walk00`, 주사위 `co_dice_idle00`·`co_jump_dice01`, 머리 조준 `head_aimcont` |
| 승·패 모션 가중 | `CharacterData::GetResultWinMotionW / ResultDrawLoseMotionW`(SetPlayer 에서 읽음) |
| 배치 노드 | 표의 `Pos_*` + 코드 상수 `pos_pc_win`, `pos_pc_lose_l/center/r`, `pos_pc_win_l/center/r`, `pos_pc_l/center/r`, `pos_pc_fellow`, `pos_pc%02d_fix` |
| 카메라 | 표의 `Cam_*`(Normal/Overlook × 1/2), CamType Common/PC |
| 텔롭 | 승리 `ComUiMGTelop`(+0x68), 주사위 `ComUiGenericTelop` `mg_tl401_windice`, 코인 개인 텔롭(`ComUiMGTelop` + PlayerID, `FUN_71002ed480`), 위치 고정 안내 `ComUiGuideFixPlace` |
| 주사위 | BGM `SM_BGM_SSMG_DICE`, SE `SQ_SE_TLP_MG_RES_WIN_DIC` |
| 무대 에셋 | 아카이브 `mg~mgResult.nx.bea` [데이터] |

## 8. 다른 기능과의 상호작용

- **미니게임 → MGResult**: `SetPlayer(PlayerID, 엔티티)`·`Set…`(카메라·모델·모션·위치 보정·테마 캐릭터)·`ResultSetupFunction`. `SetPlayer` 를 부르는 순간 공용 무대 갈래가 확정된다.
- **PlayerWork**: 승패(1/0/2)·코인을 읽어 패턴을 고르고 텔롭을 정한다 → **미니게임이 OnEndingInit 전까지 이 값을 써 두어야 한다.**
- **MinigameScene**: 엔딩 5단계 등록 여부(§3), 결과 파이버 완료가 단계 14 → 16 의 조건.
- **모드(mgm01 등)**: 결과 ring·Round 는 MGResult 가 쓰지 않는다(§6.5).

## 9. 웹 포팅 구조 (제안, 코드 없음)

| 파일 [웹 이름] | 내용 |
|---|---|
| `shell/minigame/result.ts` | 갈래 A/B 결정, 결과 파이버 순서(§3·6.2~6.4), 텔롭 시점 |
| `shell/minigame/resultPattern.ts` | `mgResultList.json` 그대로 읽기, 규칙·모드 이름, 승·패·무 집계, 패턴 고르기(§6.1) — 순수 함수라 단위 시험 대상 |
| `view/resultStage.ts` | 3D 무대(배치 노드·카메라·모션). 1차 구현은 [추정] 근사 허용, 표의 노드 이름·카메라 이름은 원본 그대로 |

- 웹 공용 세션 계약의 `MinigameResult` 승패 값은 원본 열거(1 승 / 0 패 / 2 무 / −1 미정)를 그대로 쓴다.
- 1차로 공용 무대 없이 갈래 B(미니게임 고유 엔딩)만 지원해도 흐름은 성립한다. 그 경우도 패턴 선택과 승리 텔롭 시점은 데이터 그대로 둔다 [설계].

## 10. 검증 코드·실행 결과·기대값

| 검증 | 방법 | 결과 | 수준 |
|---|---|---|---|
| 신규 디컴파일 | `mgmcommon_ghidra.sh MgmcommonDecompCreate.java`(readOnly) | 47함수/2파일 | [판독] |
| 결과 기록 writer 검색 | `MgmcommonSymRefs.java`(디컴파일 없이) + NRO 함수 목록 검색 | SetMinigameResult: main 내부 호출 없음, NRO 5개; SetRound: `FUN_71002c4b50` | [판독][데이터] |
| 결과 표 | JSON 읽기 + rtti Property 오프셋 대조 | §4.2 | [데이터][판독] |
| 규칙 이름 표 | `main.decomp.bin` 상대 오프셋 표 `0x15d8254` 읽기 | VS4·2VS2·1VS3·1VS1 | [실행: 변환] |

어셈블리는 보지 않았다(필요한 C 가 누락 없이 읽혔음).

## 11. 미확정 사항과 추가 분석에 필요한 근거

| 항목 | 상태 | 필요한 근거 |
|---|---|---|
| 3D 무대 세부(배치 계산·카메라 키·모션 선택·KoopaOffsetZ 적용) | 함수 입구만 | `FUN_71002e9270`(3.5 KB), `FUN_71002eb650`(5.5 KB), `FUN_71002eabf0`(2.6 KB), `FUN_71002e8c20`, `FUN_71002ef450`·`efcd4`·`f0290` |
| `+0x140` 의 정확한 의미(`FUN_71002f1870`) | [추정: 텔롭·결과음 번호] | `FUN_71002f1870` 판독 |
| `TelopIn` 단위 | [추정: 결과 카메라 프레임] | `FUN_71002eaae0`·`FUN_71002f4390/4470`(컴포넌트 `DAT_71019e3800`) |
| 집계 대상 플레이어 목록의 출처 | [추정] | `FUN_71002f0ba0` 계열의 목록 생성 |
| `SetPlayer` 목록1·2 구분 기준 | 승패로 나눔은 판독, 조건 세부 미정리 | `SetPlayer` 본문 |
| MGResult 생성 시점·소유 | 장면 `+0x298` 이 가리킴 | 장면 Setup 쪽 생성 위치 |
| 주사위 갈래의 `SetMinigameWinLose` 조건 | 호출 1곳 존재 | `FUN_71002eb650` |
| 모드 결과 ring writer(프리 플레이) | MGResult 아님 | mgm01 쪽 — mgm01_freeplay.md §11-1, `FUN_71002c4b50` |
| `mgm00_base_mgresult_00` 레이아웃 사용처 | 미확인 | mgm 모드 NRO 문자열·참조 |
| 원본 실행 대조 | 없음 | 패턴별 원본 캡처 |
