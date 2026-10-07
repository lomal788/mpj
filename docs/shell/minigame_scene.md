# 미니게임 한 판의 바깥 틀 (bq::MinigameScene) — 원본 분석

2026-10-07. 상태: **분석 완료(판독·데이터). 웹 구현 없음, 원본·웹 실행 대조 없음.**
형식은 `F:/dev/mps/web/docs/분석.txt` 11절 구성. 장면 구현체 상태기계·`SceneBase` 훅 순서·파이버·`MinigameFlow` 한 걸음 구조는
[../engine/01_core.md](../engine/01_core.md) §5.1~5.5 를 그대로 따르고 다시 쓰지 않는다. 이 문서는 01_core 가 **[미확정]** 으로 남긴
"MinigameFlow 단계 0~0x12 의 의미"(01_core §5.3·§11)와 그 단계가 쓰는 텔롭·타이머·스킵·엔딩·연습 반복을 채운다.
mgm01 이 미니게임을 **부르는 쪽**(넘기는 값·결과를 쌓는 곳)은 `mgm01_freeplay.md`(진행 중, [mgm01] 담당) 범위이고, 여기는 **받는 쪽**만 다룬다.

확정 수준: **[판독]** 디컴파일 C, **[판독: 어셈블리]**, **[데이터]** 원본 표, **[추정]**, **[미확정]**, **[실행: 변환]**.
주소는 모두 main NSO(0x7100000000 베이스). `FUN_` = 이름 없는 함수, **[웹 이름]** = 이 문서가 붙인 이름.

---

## 1. 기능 개요와 사용자에게 보이는 동작

미니게임 장면(`mg####`)은 모두 `bq::MinigameScene` 을 상속하고, 한 판의 바깥 순서를 이 기반 클래스가 정한다. 각 미니게임은 **훅(가상 함수)** 만 구현한다.

보이는 순서(일반 플레이, 순서·조건은 §5):

1. (캐릭터 미니게임이고 이번 세션에 아직 안 봤으면) **캐릭터 데모** — 건너뛰기 가능.
2. 초기화 → 첫 페이드인(소리 시작).
3. **오프닝**(미니게임 고유 연출). 원본 표가 허용하면 **오프닝 건너뛰기 UI**(`Scene_OpeningSkipUI`)가 붙는다.
4. **시작 텔롭**("Start" 또는 "321Go" 카운트다운) → 호루라기 → 일시정지 메뉴 허용.
5. **본편**(`OnGameMain`). 미니게임별 **종료 타이머**(180/300초)가 있으면 남은 30초부터 화면에 보이고, 0이 되면 강제로 끝난다.
6. **종료 텔롭**(기본 "Finish") → 정해진 초만큼 대기.
7. **결과**(`MGResult` 결과 연출 파이버)와 그 안의 **엔딩**(페이드·컷 전환·승리/무승부 연출).
8. 마지막 페이드아웃 → 기록 저장 → 나가기(호출한 모드 장면으로 복귀).

**조작 설명 화면 안 실행(flag 0)** 이면 같은 장면이 설명 화면 뒤에서 돌며, 결과 없이 끝나면 장면을 다시 세팅해 **처음부터 반복**한다(§5.3).

## 2. 분석 대상 원본·자료 위치

| 자료 | 위치 |
|---|---|
| 기존 디컴파일(재사용) | `analysis/decomp/core_b5.c` — `bq::MinigameScene` 51함수 전부, 단계 처리기 0x2~0x12, 텔롭·타이머·스킵 객체, 엔딩 5단계 |
| 기존 표 덤프(재사용) | `analysis/decomp/mgC_main_mgflow.c`·`core_b6.c`(처리기 표 `0x71019e3250`), `core_b7.c`(vtable `0x71019e2fb0` 0~0x238) |
| 이번 신규 디컴파일 | `analysis/decomp/mgscene_main1.c`(19함수: 단계 0·1 처리기 — Ghidra 가 함수로 안 잡은 주소, 생성자 람다, `MGResult::ResultFlowFunction`·결과 파이버 보조, `MGSetting` 필드 조회 5개, 플레이 횟수·통계 기록), `mgscene_main2.c`(람다 4), `mgscene_main3.c`(엔딩 하위 상태기계 `FUN_71002e34d0`, 결과 파이버 본체 `FUN_71002e7d90`), `mgscene_main4.c`(`MGSetting` 로더·필드 조회 14) |
| vtable 0x240~0x298 | `extracted/exefs/main.decomp.bin` 직접 읽기 [실행: 변환] (core_b7 덤프가 0x238 에서 끝남) |
| 미니게임 설정 표 | `extracted/bea/bq.nx.bea/common/data/mgListND.json`(84항목)·`mgListCA.json`(38항목)의 `mgSetting` 배열 [데이터] |
| Ghidra | `ghidra_work/mgmcommon/jamboree_main`, `web/tools/analysis/mgmcommon_ghidra.sh MgmcommonDecompCreate.java` (`-noanalysis -readOnly`, 저장 안 함) |
| 관련 기존 문서 | [../engine/01_core.md](../engine/01_core.md) §5, [../engine/02_rhythm.md](../engine/02_rhythm.md) §317(`IsInstActive` = flag 0), [../minigame/mg0508.md](../minigame/mg0508.md) §3.3(단계 5~10 앞부분), [mgmet_ruleconfig.md](mgmet_ruleconfig.md) §8.2(flag 4 쓰기) |

## 3. 진입점과 전체 호출 흐름

```
SceneBase::UpdateMain → 흐름 파이버 → vt+0x160 GameFlow @0x71002df24c → vt+0x1A0 MinigameFlow @0x71002e0500   (01_core §5.1·5.2)
MinigameFlow:
  FUN_71002e0548  초기화(§6.1)                       ← 단계 18(재시작)도 이 함수를 다시 부른다
  while (FUN_71002e0844 한 걸음) Fiber::Wait()       ← 한 프레임에 처리기 1개 (01_core §5.3)
  RequestReturnScene(); Sleep(-1)                    ← 단계 0x13 이 되면
```

- 처리기 표 `0x71019e3250`: 멤버 함수 포인터 19개(0~0x12) [판독 덤프]. 단계가 바뀐 프레임에는 새 처리기를 부르지 않고 `+0x218`(하위 카운터)=0, `OnSetGameSequence`(vt+0x1A8, 기반은 빈 함수)를 부른다 [판독 01_core §5.3].
- 매 걸음 앞뒤로 `OnGameSequenceBefore/After`(vt+0x1B0/0x1B8, 기반 빈 함수), 앞에서 `MGSound` 갱신 `FUN_71001e4308`.
- **종료 타이머 강제 종료**: 단계 7~9 이고 타이머 객체(`+0x280`)가 있을 때 `FUN_71002e2020` 이 참이면 `OnThreeMinTimerEnd`(vt+0x1C0) → 단계 10(§6.4) [판독].

## 4. 구조체·필드·상수 표

### 4.1 MinigameScene 필드 (생성자 `@0x71002dedc8`, 초기화 `FUN_71002e0548`) [판독]

| 오프셋 | 형 | 초깃값 | 쓰는 곳 → 읽는 곳 / 뜻 |
|---|---|---|---|
| +0x210 | s32 | 생성자 `GameWork::GetMinigameID` (없으면 −1) | 미니게임 ID → `MGList`·`MGSetting` 조회 전부 |
| +0x214 | s32 | −1 → 초기화 1 (캐릭터 데모면 0) | 흐름 단계 (§5 표) |
| +0x218 | u16 | 0 | 단계 안 하위 상태(0, 1, 2, 99). 단계가 바뀌면 0 |
| +0x21C | f32 | 0 | 종료 텔롭 뒤 대기 남은 초(단계 11) / 재시작 프레임 카운터(단계 18) |
| +0x234 | s32 TelopType | **0** | 시작 텔롭 종류. `SetStartTelop(type[,IUserStartFinish*])` @0x71002e3838/385c, 범위 −1..4 |
| +0x238 | s32 TelopType | **2** | 종료 텔롭 종류. `SetFinishTelop` @0x71002e3894/38b8 |
| +0x240 / +0x248 | 객체* / `IUserStartFinish*` | 0 | 시작 텔롭 객체(`FUN_71002e44ac`, 엔티티 "TelopUI") / 종류 3·4 일 때 사용자 구현 |
| +0x250 / +0x258 | 객체* / `IUserStartFinish*` | 0 | 종료 텔롭 객체 / 사용자 구현 |
| +0x260 | 객체* | 0 | 승리·무승부 텔롭 객체(`CreateWinTelop/CreateDrawTelop`) |
| +0x268 | u8 | 0 | 오프닝 건너뛰기 허용 = `MGSetting::IsOpeningSkip`(표 OpeningSkip) |
| +0x269 | u8 | **1** | 게임이 건너뛰기를 지금 허용하는지. `SetGameOpeningSkipEnable(b)` @0x71002e3cf4 (false 면 스킵 UI 닫음) |
| +0x26A | u8 | 0 | 단계 4에서 참이면 스킵 대기 하위상태를 끝냄. 기반 클래스에서 쓰는 곳 없음 [미확정: 파생 클래스 writer] |
| +0x26B | u8 | 0 | **오프닝을 건너뛰었음**. `IsOpeningSkip()` @0x71002e2e80 이 반환 |
| +0x270 | 객체* | 0 | 오프닝 건너뛰기 UI(`FUN_71002e3d70`, 엔티티 "Scene_OpeningSkipUI" + `ComUiGuideSkip`) |
| +0x278 | u8 | 0 | 엔딩 컷 전환 = 표 EndingChangeCut(`FUN_71001e2618`) |
| +0x280 | 객체* | 0 | 종료 타이머(엔티티 "Scene_SystemMnigameEndTimerUI"(철자 그대로) + `ComUiTimer`) — §6.4 |
| +0x288 | 객체* | 0 | 상태 얼굴 UI(엔티티 "Scene_StatusFaceUI" + `ComUiStatus`, 종류 = `MGList::GetGameRule` 0..3) |
| +0x290 | u8 | 0 | **flag 0 = 조작 설명 화면 안 실행**(`IsInstActive`, 02_rhythm §317) |
| +0x294 | s32 | 0 | 설명 화면 반복 횟수(단계 18 에서 +1) |
| +0x298 | `MGResult*` | — | 결과 객체(단계 13·14) |
| +0x2A0 | s32 | — | 엔딩 하위 단계(0~5, §6.6) |
| +0x2A8 | 객체* | 0 | 캐릭터 데모 객체 |
| +0x2F8 / +0x2F9 | u8 / u8 | 0 | 데모 건너뜀 / 데모 쪽이 와이프를 직접 처리 |
| +0x2FA | u8 | **1** | 데모 시작 때 페이드인 |
| +0x2FC | s32 | **1** (초기화가 데모면 0) | 캐릭터 데모 하위 상태 0~3 |
| +0x300 | `UiRetryMenu*` | 0 | 단계 16 (PlayMode 1·9) |

### 4.2 vtable `0x71019e2fb0` 훅 칸 [판독: 덤프 0~0x238 + main.decomp.bin 0x240~0x298]

모든 bool 훅의 **기반 구현은 1(진행)** 을 반환한다(`mov w0,#1; ret`, 0x2e5418~0x2e54e0) [판독].

| vt | 훅 | 부르는 단계 | vt | 훅 | 부르는 단계 |
|---|---|---|---|---|---|
| 0x1A8 | OnSetGameSequence | 단계 바뀔 때 | 0x238 | OnGameMain [이름: mg0508 덤프] | 9 |
| 0x1B0/0x1B8 | OnGameSequenceBefore/After | 매 걸음 | 0x240 | OnGameEnd | 10 |
| 0x1C0 | OnThreeMinTimerEnd | 타이머 만료 | 0x248 | OnGameFinish | 11 |
| 0x1C8 | OnGameInit | 1 | 0x250 | OnGameFinishAfter | 12 |
| 0x1D0 | OnCharaGameDemoStart | 0 | 0x258 | OnEndingInit(결과 핸들) | 13 |
| 0x1D8 | OnCharaGameDemo | 0 | 0x260 | OnGameEndingFade | 엔딩 0 |
| 0x1E0 | OnCharaGameDemoSkipStart | 0 | 0x268 | OnGameEndingChangeCut | 엔딩 1 |
| 0x1E8 | OnCharaGameDemoSkipEnd | 0 | 0x270 | OnGameEndingBefore | 엔딩 2 |
| 0x1F0 | OnCharaGameDemoEnd | 0 | 0x278 | OnGameEnding | 엔딩 3 |
| 0x1F8 | OnGameInstInit | 2 | 0x280 | OnGameEndingAfter | 엔딩 4 |
| 0x200 | OnGameFirstFade [추정] | 3 | 0x288 | OnGameEndingSkip | 15 |
| 0x208 | OnGameOpening [추정] | 4 | 0x290 | OnGameLastFade | 16 |
| 0x210 | OnGameOpeningSkip | 5 | 0x298 | OnGameExit | 17 |
| 0x218 | OnGameStartBefore | 6 | | | |
| 0x220 | OnGameStartTelopBefore | 7 | | | |
| 0x228 | OnGameStart | 7(매 프레임) | | | |
| 0x230 | OnGameStartAfter [이름: mg0508 덤프] | 8 | | | |

- 0x200·0x208·0x230·0x238 은 main 에 심볼 없는 기반 함수(코드 접기)다. 0x230·0x238 은 mg0508.md §3.3 이 파생 vtable 로 확인한 이름이다. 0x200·0x208 은 **처리기 동작**(단계 3 = 첫 페이드인·소리 시작, 단계 4 = 스킵 UI 를 붙이는 오프닝)과 mg0508 파생 함수 주소 순서(InstInit 0x12220 < FirstFade 0x12444 < Opening 0x128b8 < OpeningSkip 0x12a14)로 붙인 이름이다 [추정, 강함].

### 4.3 미니게임 설정 표 `MGSetting` (레코드 0x30 B, ID < 0x98) [판독 + 데이터]

로더 `FUN_71001e24d0` 이 `common/data/mgListND.json`·`mgListCA.json` 의 `"mgSetting"` 배열을 `JsonMGSettingData` 로 읽는다(`FUN_71001e2900`) [판독]. 필드 이름은 JSON 키 순서와 조회 함수 오프셋을 짝지었다 [데이터+판독].

| 오프셋 | JSON 키 | 조회 함수 | 값 [데이터, ND 84항목] |
|---|---|---|---|
| +0x00 | GameEndTimerPos | `FUN_71001e267c`, 존재 `FUN_71001e2648`(≠−1) | None 62, TC·TL 각 6, CC·BC 4, BL·TR 1 |
| +0x04 | GameEndTime(초) | `FUN_71001e26a8`(flag 1 이 아니면) | 180 ×72, 300 ×12 |
| +0x08 | EndlessGameEndTimerPos | `FUN_71001e2730`, 존재 `FUN_71001e26fc` | None 79, TL 3, BL 2 |
| +0x0C | EndlessEndTime(초) | `FUN_71001e26a8`(flag 1 이면) | 0 ×79, 600 ×5 (mg0106·0107·0111·0113·0123) |
| +0x10 | StatusFace | `FUN_71001e27c0`, 존재 `FUN_71001e278c` | None 58, 그 외 16종(`1vs3_Bottom`, `Corner`, `Top`…) |
| +0x14 / +0x18 | StatusInTiming / StatusOutTiming | `MGSetting::GetStatusInTiming/OutTiming` | Telop/None, FadeOut/None/Telop |
| +0x1C / +0x20 | TimerInTiming / TimerOutTiming | `FUN_71001e2844/2870` | None/Telop, None/AfterTelop |
| +0x24 | EndSeqWaitTime(초) | `FUN_71001e289c` | 0 ×67, 2 ×17 |
| +0x28 | 비트: bit0 OpeningSkip, bit1 EndingChangeCut, bit2 OrderShuffle | `MGSetting::IsOpeningSkip` @0x71001e25e8, `FUN_71001e2618`, `FUN_71001e275c` | OpeningSkip 1 ×62, EndingChangeCut 전부 0 |
| +0x2C | InstLoopTiming (Finish=0, Result=1) | `FUN_71001e28c8(id, v)` | Finish ×83, Result ×1(mg1601) |

- 문자열 열거값 ↔ 정수 대응(TC=?, Telop=? 등)은 JSON 리더의 열거 변환을 판독하지 않았다 [미확정]. 웹은 문자열 그대로 쓰면 된다.
- CA 표(38항목)에는 Endless 칸과 InstLoopTiming 이 없다 [데이터].

### 4.4 flag 번호 [판독]

| flag | 뜻 | 쓰는 곳 | 이 장면이 읽는 곳 |
|---|---|---|---|
| 0 | 조작 설명 화면 안 실행 | (설명 화면 쪽, 이번 범위 밖) | 초기화 → `+0x290`, 단계 1·2·3·6·7·10·12·16·17, Win/Draw 텔롭 생략, 생성자 람다 |
| 1 | 엔드리스 진행(Endless 칸 사용) — mgm01 설정의 normal/endless 선택(mgm01_freeplay.md §8.3) [판독] | mgm01 `MgStartFlow` `Set(1, mgm01 Scene+0x280)`(rhythm_mgm1.c:123), mgmet·mgm01 이 `Off(1)` | 타이머 종류·초, 상태 얼굴 생성 여부, 단계 11 `FUN_71001e7230` |
| 2 | 이번 세션에 캐릭터 데모를 봤음 | 데모 끝(단계 0 하위 3) `On(2)`, `CleanupScene` 이 flag 0 이 아니면 `Off(2)` | 초기화: 캐릭터 미니게임 && !flag2 → 단계 0 |
| 4 | 미니게임 설명 **있음** | mgmet 규칙 확정 `Set(4, explainIndex==0)` (mgmet_ruleconfig §8.2) | 생성자만(§6.1) |

## 5. 상태 전이와 전체 수명

### 5.1 MinigameFlow 단계 표 (`+0x214`) [판독]

`P` = flag 0(설명 화면 안 실행, `+0x290`). "훅 참" = 그 훅이 1 을 반환.

| 단계 | 처리기 | 이름 [웹 이름] | 하는 일 | 다음 |
|---|---|---|---|---|
| 0 | `FUN_71002e09b0` [신규] | 캐릭터 데모 | §6.2 하위 상태 0~3 | 끝나면 1 |
| 1 | `FUN_71002e0fd0` [신규] | 초기화 | `OnGameInit` | 참: P ? 2 : 3 / 거짓: 1 |
| 2 | `FUN_71002e1010` | 설명 화면 초기화 | `OnGameInstInit`, 참이면 콜백 5. 반복 회차(`+0x294`≠0)면 소리 장면 시작 | 거짓 2 / 반복 회차 6 / 첫 회 3 |
| 3 | `FUN_71002e10bc` | 첫 페이드 | 매 프레임 `OnGameFirstFade`. 하위 0: 소리 프리셋(캐릭터 미니게임이면 `%s_main`, P 면 추가로 `%s_inst`), 소리 장면 시작, `MgWipeModule::FadeIn(1.0)` → 하위 1: 페이드 끝 → 99 | 페이드 중 3 / 끝 + 훅 참: P ? 6 : 4 |
| 4 | `FUN_71002e12ac` | 오프닝 | 매 프레임 `OnGameOpening`. 건너뛰기 처리(§6.3) | 훅 참(또는 스킵 끝): 건너뜀 ? 5 : 6 |
| 5 | `FUN_71002e14c0` | 오프닝 건너뛴 뒤 | `OnGameOpeningSkip` | 참 6 |
| 6 | `FUN_71002e14e8` | 시작 전 | 엔트리 취소 그룹 6 해제, 건너뛰었으면 소리 그룹(0x23·1·0x25) 정리, `OnGameStartBefore`. 건너뛰었거나 P 면 페이드인(1.0) 끝까지 6 | 7 |
| 7 | `FUN_71002e16c0` | 시작 | 매 프레임 `OnGameStart`. 하위 0: `OnGameStartTelopBefore` 참 → `MGUiMgr` 시점 0 → 시작 텔롭 시작(§6.5) → 하위 1: 텔롭 끝 → (종류 1 이면 소리) 호루라기 `TryStartWhistle`, !P 면 `UiPause::SetEnableOpen(1)` → 99 | 텔롭 끝 + 훅 참: 종료 타이머 시작(§6.4), `MGUiMgr` 시점 1 → 8 |
| 8 | `FUN_71002e17f0` | 시작 직후 | `OnGameStartAfter` | 참 9 |
| 9 | `FUN_71002e1818` | 본편 | `OnGameMain` | 참: 타이머 정지 → 10 |
| 10 | `FUN_71002e1864` | 본편 끝 | `OnGameEnd` | 참: !P → 11 / P: InstLoopTiming=Finish → 16, =Result → 12, 그 외 10 |
| 11 | `FUN_71002e1910` | 종료 텔롭 | §6.5 종료 쪽 + EndSeqWaitTime 대기, 플레이 횟수 기록 | 12 |
| 12 | `FUN_71002e1aa0` | 종료 직후 | `OnGameFinishAfter` | 참: P && InstLoopTiming=Result → 16 / 그 외 13 |
| 13 | `FUN_71002e1b14` | 결과 시작 | `OnEndingInit(결과 핸들)` 참 → 결과 흐름 등록·결과 파이버 시작(§6.6) | 14 |
| 14 | `FUN_71002e1c18` | 결과 대기 | `MGResult` 파이버 끝(`+0xB8` 완료) | 16 |
| 15 | `FUN_71002e1c40` | 엔딩 건너뜀 | `OnGameEndingSkip` | 참 16. **기반 처리기 안에 15 로 보내는 경로가 없다** [판독] |
| 16 | `FUN_71002e1c68` | 마지막 페이드 | §6.7 (저장·통계·재시도 메뉴) + `FadeOut(1.0)`, 소리 정지 | 페이드 끝 && 세이브 처리 끝 + `OnGameLastFade` 참 → 17 |
| 17 | `FUN_71002e1e48` | 나가기 | `OnGameExit` | 참: P ? 18 : **0x13(끝)** |
| 18 | `FUN_71002e1e8c` | 설명 화면 반복 재시작 | §5.3 | 4프레임 뒤 다시 1 |
| 0x13 | — | 끝 | `MinigameFlow` 가 `RequestReturnScene` | 호출한 장면으로 복귀 |

강제 종료: 단계 7~9 에서 종료 타이머 만료 → `OnThreeMinTimerEnd` → 하위 0, 단계 10 [판독].

### 5.2 일반 플레이(P=0) 경로

```
[0 데모] → 1 → 3 → 4 →(건너뜀) 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 16 → 17 → 끝
```
일반 플레이는 단계 2(설명 화면 초기화)를 지나지 않는다 [판독: 단계 1 이 P 일 때만 2].

### 5.3 설명 화면 안 실행(P=1) 경로와 반복

```
1 → 2 → 3 → 6 → 7 → 8 → 9 → 10 →(Finish) 16 → 17 → 18 → (4프레임) → 1 → 2 →(반복 회차) 6 → …
                                └(Result: mg1601) 12 → 16
```
- 오프닝(4·5)·종료 텔롭(11)·결과(13·14)를 지나지 않는다. 일시정지 메뉴 허용(단계 7)과 승리·무승부 텔롭도 생략한다 [판독].
- 단계 18 하위 0: `+0x294`++, 콜백 1, `MGInstSetting` 갱신(`FUN_71002924a8`), `CleanupGame`(vt+0x158), 장면 객체 정리(`FUN_71002e0434`·`FUN_71002c9ee4`·`ResetSceneRootEntity`), 이펙트 전부 정지 → 하위 1: 프레임마다 +1, **4 이상**이면 `SetupGame`(vt+0x148) → `SyncedSetupGame`(vt+0x150) → 초기화 `FUN_71002e0548` → 단계 1 [판독]. 4 는 실수 1.0 누적이라 **4프레임** 이다(dt 를 쓰지 않음).
- `CleanupScene` 은 P 가 아니면 flag 2 를 끈다 → 설명 화면 반복 중에는 데모 기록이 유지된다 [판독].

## 6. 계산식·조건·상세 의사코드 [판독]

### 6.1 초기화 `FUN_71002e0548`

```
SetFadeEnable(false); sub=0; state=1; OnSetGameSequence()
if id == -1: goto 텔롭객체
if MGList::IsCharaMiniGame(id) && !flag2: state=0; demoSub(+0x2FC)=0
openingSkipAllowed(+0x268) = MGSetting.OpeningSkip(id)
endingChangeCut(+0x278)    = MGSetting.EndingChangeCut(id)
P(+0x290) = flag0
if P && retry(+0x294)==0: SystemCallBack.AddCallBack(6, → MGSound FUN_71001e4f28(0))   # 람다 @0x71002e099c
if !flag1:
    if GameEndTimerPos != None:   endTimer(+0x280) = new 타이머(GameEndTimerPos)       # FUN_71002e413c
    if StatusFace != None:        statusFace(+0x288) = new 상태얼굴(GetGameRule)       # FUN_71002e4c0c
else:
    if EndlessGameEndTimerPos != None: endTimer = new 타이머(EndlessGameEndTimerPos, SetMgUiInTiming(-1))
startTelop(+0x240)  = new 텔롭(type +0x234, user +0x248)                              # FUN_71002e44ac
finishTelop(+0x250) = new 텔롭(type +0x238, user +0x258)
```

생성자의 조건부 람다(vtable `0x71019e33b8` +0x30 = `FUN_71002e5540`): `id ≠ −1` 이고 **(flag 4 == 0(설명 없음) 또는 flag 0 또는 id == 0x41)** 이면 즉시 실행. 내용: `PlayMode ≠ 1` 이고 `MGList::UseGyro(id)` 면 현재 컨트롤러 스타일을 Work 에 저장(`FUN_71002a33b8`)하고 `GyroType > 1 ? 4 : 3` 으로 `SetControllerStyle` [판독]. → **이 장면에서 flag 4(설명 있음/없음)의 소비는 "자이로 미니게임의 컨트롤러 스타일 전환을 생성 시점에 할지"뿐이다.** 설명 화면을 보여 줄지 자체는 이 장면이 정하지 않는다(설명 화면은 flag 0 으로 이 장면을 띄우는 쪽, §8).

### 6.2 캐릭터 데모 (단계 0, 하위 `+0x2FC`)

| 하위 | 동작 | 다음 |
|---|---|---|
| 0 | 데모 객체(`+0x2A8`) 시작 `FUN_71002e21b0`, 건너뛰기 UI `FUN_71002e3d70(scene, 0)` | 1 |
| 1 | 데모 진행 검사. 건너뛰기 입력(스킵 UI 가 있고 `FUN_71002e27a0`)이면 `+0x2F8/2F9=1`, `SQ_SE_SYS_SKIP` 계열 정리(`FUN_71001e5778`), 진동 `bv_vib_sys_skip`, `OnCharaGameDemoSkipStart` → 3. 아니면 `OnCharaGameDemoStart` 참 → 소리 프리셋 `%s_demo`·소리 장면 시작, (+0x2FA 면) `WipeModule::FadeIn(1.0)` | 2 |
| 2 | `OnCharaGameDemo`. 참 → 3. 진행 중 건너뛰기 입력 → `FadeOut(1.0)`(또는 데모가 와이프를 직접) + `OnCharaGameDemoSkipStart`; 건너뛴 뒤 페이드아웃 끝 → `OnCharaGameDemoSkipEnd` → 3 | 3 |
| 3 | (건너뛰었으면 페이드 끝 대기 후 효과 정리 `FUN_7100117278(…,1,1)`) `OnCharaGameDemoEnd` 참 → 소리 장면 정리, 스킵 UI 삭제, `flag::On(2)` → **단계 1** | — |

### 6.3 오프닝 건너뛰기 (단계 4, 하위 `+0x218`)

```
hook = OnGameOpening()                       # 매 프레임
sub 0: if openingSkipAllowed(+0x268) && !hook: skipUI(+0x270) = new SkipUI(scene, gameSkipEnable +0x269); sub=1; return 4
       else sub=99 (hook 참이면 바로 아래 '끝')
sub 1: if !hook:
         if skipUI 숨김 && gameSkipEnable: skipUI 표시
         if +0x26A: sub=99
         if skipUI 표시 중 && (스킵 입력 || 네트 전송 수신 FUN_710021a300):
             skipUI 닫기; skipped(+0x26B)=1; SQ_SE_SYS_SKIP(FUN_71001e597c, 소리 그룹 0.3 s 감쇠);
             진동 bv_vib_sys_skip; 네트 전송 FUN_710021a190; MgWipe.FadeOut(1.0); sub=2
         return 4
sub 2: 페이드 중이면 4, 끝나면 sub=99
끝(hook 참 또는 sub 99 이후 hook 참): skipUI 닫기; skipped ? (효과 정리, return 5) : return 6
```
- 건너뛰기는 **페이드아웃 1초가 끝나도 훅이 참을 돌려줘야** 다음 단계로 간다(파생 클래스가 스킵을 받아 오프닝을 끝내야 함) [판독].
- 온라인은 한 사람의 건너뛰기가 네트 전송으로 전파된다(`FUN_710021a190` 보냄 / `FUN_710021a300` 받음) [판독, 전송 내용은 범위 밖].

### 6.4 종료 타이머 (`+0x280`, 하위 상태 `+8`)

```
생성: 엔티티 "Scene_SystemMnigameEndTimerUI" + ComUiTimer, 위치 = (flag1 ? EndlessGameEndTimerPos : GameEndTimerPos)
시작(단계 7→8): sec = flag1 ? EndlessEndTime : GameEndTime; if sec >= 1: ComUiTimer.StartTimer(sec); state=1
매 걸음(단계 7~9, FUN_71002e2020):
   state 1: RemainSecond <= 30.0 → ComUiTimer.In(0); state=2
   state 2: IsEndTimer → ComUiTimer.Out(0); MGUiMgr 갱신; state=3; return 만료
   state 3: return 만료
정지(OnGameMain 참, FUN_71002e33a0): state 2(보이는 중)면 Out + SuspendTimer
```
- 훅 이름은 "ThreeMin"이지만 시간은 **표의 초(180/300/600)** 다. 타이머 객체는 **위치가 None 이 아닌 미니게임에만** 생기므로(ND 84 중 22), 나머지 62개는 이 강제 종료가 없다 [판독+데이터].
- 남은 30초부터 화면에 보인다. 남은 시간 감소는 `ComUiTimer` 내부(`TickUpdate`마다 `GetDeltaTime`, mg1002.md §3.3).

### 6.5 시작·종료 텔롭 (객체 `+0x240`/`+0x250`, 종류 `+0x18`)

| TelopType | 시작 함수 `FUN_71002e2e90` | 끝 판정 `FUN_71002e30a0` | 기본값 |
|---|---|---|---|
| −1 | 아무것도 안 함(바로 참) | 참 | — |
| 0 | `ComUiMGTelop::SetOneshot(0x3ED55555 ≈ 0.41667)` → Start, `MGSound` 텔롭 소리(종류 0) | `Finished` | **시작** 기본 |
| 1 | Start(카운트다운), 텔롭 소리(종류 1) | `IsEndCountdown` | — |
| 2 | `SetOneshot(0x3FB55555 ≈ 1.41667)` → Start, `FUN_71001e559c` | `Finished` | **종료** 기본 |
| 3, 4 | 사용자 `IUserStartFinish` vt+0x18(시작) | 사용자 vt+0x20 | 미니게임이 직접 연출 |

- 텔롭 객체 생성 `FUN_71002e4604`: 종류 0·1·2 → `ComUiMGTelop(종류 0/1/2)`, 3·4 → 컴포넌트 없음 [판독]. 표 끝의 문자열 `"Start"`·`"321Go"`(처리기 표 +0x130·+0x138)가 종류 0·1 의 텔롭 이름으로 보인다 [추정].
- 단계 11 종료 쪽:
  ```
  sub 0: MGUiMgr.TimingOut(0); if FUN_71001e7230(id, flag1): MGUiMgr FUN_71002d6fd0
         if 종료 텔롭 시작: MGSound 정리 3종; sub=1  else sub=99
         플레이 횟수 기록 FUN_71002db9f0(-1); UiPause.SetEnableOpen(false)
  sub 1: 텔롭 끝 → waitSec(+0x21C) = EndSeqWaitTime; MGUiMgr.TimingOut(1); sub=2; (waitSec < 1 이면 바로 12)
  sub 2: waitSec -= dt; <= 0 → 12
  ```
- 플레이 횟수 `FUN_71002db9f0`: 참가자 중 **PlayerType ≠ 1(CPU 가 아닌 사람)** 마다 그 플레이어 세이브의 `GetMinigameData(id)` 선두 u16 을 +1(최대 999) [판독]. mgmet 의 "플레이한 미니게임 n/112"가 이 u16 ≠ 0 을 센다(mgmet_flow §8).

### 6.6 결과와 엔딩 (단계 13·14)

```
단계 13: handle = MGResult(+0x298).GetHandle(+0xB0)
         if OnEndingInit(handle):
             if MGResult+0x13C == 0:
                 sub=0; endingStep(+0x2A0) = endingChangeCut(+0x278) ? 0 : 2
                 MGResult.ResultFlowFunction(멤버함수 FUN_71002e34d0)     # MGResult+0x100 에 저장
             MGResult 결과 파이버 시작(FUN_71002ee130 → FiberLite, 본체 FUN_71002e7d90)
             → 14
단계 14: 결과 파이버 완료면 16
```

엔딩 하위 상태기계 `FUN_71002e34d0`(결과 파이버가 부르는 함수, 매 프레임 1단계, 5 가 되면 반환):

| 엔딩 단계 | 처리기 | 하는 일 | 다음 |
|---|---|---|---|
| 0 | `FUN_71002e35cc` | `MgWipe.FadeOut(1.0)` 끝까지 → `OnGameEndingFade` 참 → `MGUiMgr.TimingOut(2)` | 1 |
| 1 | `FUN_71002e3684` | `OnGameEndingChangeCut` | 2 |
| 2 | `FUN_71002e36ac` | `OnGameEndingBefore`. 컷 전환이면 참일 때 `TryStartResultSound` + `FadeIn(1.0)` 끝까지 | 3 |
| 3 | `FUN_71002e3798` | 첫 프레임 `MGUiMgr` 시점 2, `OnGameEnding` | 4 |
| 4 | `FUN_71002e3810` | `OnGameEndingAfter` | 5(끝) |

- EndingChangeCut 이 0 이면(ND·CA 전부 0 [데이터]) 엔딩은 **단계 2 부터** 시작하고 페이드·컷 전환이 없다 [판독+데이터].
- **순위·승패·코인 기록은 기반 클래스가 하지 않는다.** 각 미니게임이 `OnEndingInit` 등에서 `PlayerWork::SetMinigameRank/WinLose/Coin` 을 쓴다(예: mg0508 `OnEndingInit` = 팀 승패·순위 기록, mg0508.md §3.3) [판독].
- 승리·무승부 텔롭은 미니게임이 부른다: `CreateWinTelop(PlayerList, LytPlace)` @0x71002e39f8 → `ComUiMGTelop` 종류 **5**(플레이어 목록 있음) 또는 **8**(빈 목록), `CreateDrawTelop(LytPlace)` @0x71002e3c48 → 빈 목록 = 종류 8. 둘 다 **P(설명 화면) 면 아무것도 안 한다**. 객체는 `+0x260` 하나를 덮어쓴다. LytPlace 는 텔롭 vt+0x88 로 넘긴다 [판독].
- `MGResult` 결과 연출 → [minigame_result.md](minigame_result.md). 요점: 미니게임이 `MGResult::SetPlayer` 를 부르면 `+0x13C`=1 이 되어 위 엔딩 5단계는 **등록되지 않고**(vt+0x260~0x280 훅이 불리지 않음) 공용 3D 결과 무대가 돈다. 부르지 않으면 결과 파이버는 엔딩 5단계만 실행한다 [판독].

### 6.7 마지막 페이드 (단계 16) [판독]

```
hook = OnGameLastFade()
sub 0: if !P:
           통계 기록 FUN_71002dbb80(-1): GameRule==0 → 각 참가자 순위(GetMinigameRank), 그 외 승패(GetMinigameWinLose)
           SaveDataMgr.SaveRequest(); MGSound FUN_71001e4f28(0)
           if PlayMode == 1 || PlayMode == 9: UiRetryMenu(+0x300) 파이버 완료까지 Wait
       else: 엔트리 취소 그룹 6 켬
       MgWipe.FadeOut(1.0); 소리 StopGroup_Type(0x20, 6); sub=1
sub 1: 페이드 끝 && 세이브 처리 중 아님 → sub=99 → (hook 참이면) 17
```

## 7. 애니메이션·소리·에셋 연결

| 사건 | 소리·연출 [판독] |
|---|---|
| 데모 시작 | 소리 프리셋 `%s_demo`, 소리 장면 시작, `WipeModule::FadeIn(1.0)` |
| 첫 페이드 | 캐릭터 미니게임이면 `%s_main`(+P 면 `%s_inst`) 프리셋, `MgWipeModule::FadeIn(1.0)`, MGSound 초기 재생(P 아니면 `FUN_71001e4a54(2,0)`) |
| 건너뛰기 | `SQ_SE_SYS_SKIP`, 소리 그룹 0x22/0x23/1/0x25 를 0.3 s 감쇠(`FUN_71001e597c`), 진동 `bv_vib_sys_skip`, `MgWipe.FadeOut(1.0)` |
| 시작 텔롭 | 텔롭 종류별 소리(`FUN_71001e4a54(type,0)`), 끝나면 `TryStartWhistle` |
| 종료 텔롭 | `FUN_71001e559c` 등 MGSound 정리 3종 |
| 엔딩(컷 전환) | `TryStartResultSound`, `FadeIn(1.0)` |
| 마지막 페이드 | `MgWipe.FadeOut(1.0)`, `StopGroup_Type(0x20,6)` |

- 페이드는 모두 **1.0초**(`0x3F800000`) [판독]. 와이프 종류는 `WipeModule::GetLastUsedWipeType` 를 이어 쓴다.
- UI 엔티티 이름: `Scene_OpeningSkipUI`, `Scene_SystemMnigameEndTimerUI`, `Scene_StatusFaceUI`, `TelopUI` [판독]. 레이아웃·그리기는 [charselect.md](charselect.md) §6.4·6.5·12 규칙.
- `MGUiMgr` 시점 신호: `FUN_71002d6cd0(0)`=시작 텔롭 전, `(1)`=본편 시작, `(2)`=엔딩. `TimingOut(0/1/2)`=종료 텔롭 시작/대기 시작/엔딩 페이드 뒤 [판독]. 상태 얼굴·타이머의 In/Out 은 표의 `StatusInTiming/OutTiming`·`TimerInTiming/OutTiming` 과 이 신호로 정해진다 [추정: `MGUiMgr` 내부 미판독].

## 8. 다른 기능과의 상호작용

- **어느 장면이 뜨는가**: `MinigameModeScene::CallMinigameScene` 이 `UseGyro` 면 `gyroPadChange`, flag 4 && `MGList::IsCallInst` 면 `mgInst`(설명 화면), 그 외 미니게임 장면(`MGList::GetName`)을 부른다(mgm01_freeplay.md §3.2) [판독: mgm01 담당]. 따라서 "설명 있음"은 이 장면 앞에 `mgInst` 를 끼우는 것으로 처리된다.
- **부르는 쪽(mgm01 등) → 이 장면**: `GameWork::GetMinigameID`(필수), 참가자 목록(`PlayerWorkHolder::GetMGEntryPlayerList`), flag 0·1·4, `PlayMode`, `GameJudgeType`(결과 연출). 무엇을 어떻게 넘기는지는 `mgm01_freeplay.md` 의 호출 계약 표 [mgm01 담당].
- **이 장면 → 부르는 쪽**: 끝나면 `RequestReturnScene`. 결과는 미니게임이 `PlayerWork` 에 쓴 순위·승패·코인, 이 장면이 쓴 세이브 플레이 횟수(u16)·통계(`FUN_71002dbb80`).
- **설명 화면**: 설명 화면이 flag 0 을 켜고 이 장면을 띄우면, 이 장면은 결과·오프닝 없이 반복한다. 설명 화면 자체(`MGInstSetting`, `mgInst` 모듈)는 이번 범위 밖 [추정: 이름].
- **일시정지**: 시작 텔롭이 끝날 때 허용, 종료 텔롭 시작 때 금지(P 면 허용하지 않음) [판독].

## 9. 웹 포팅 구조 (제안, 코드 없음)

### 9.1 위치와 원칙
- 위치 `web/script/shell/minigame/`(엔진 독립 모듈). 원칙은 [mgm_common.md](mgm_common.md) 9.1 과 같다: 순수 상태(단계·하위 상태·타이머)는 입력 `{trig, dt, 훅 결과, 애니·페이드 끝 신호}` 만 받고 사건(페이드·텔롭·소리·저장 요청)을 낸다.
- 각 웹 미니게임은 §4.2 의 훅을 구현하는 객체다. 구현하지 않은 훅은 **1(진행)** 이 기본값이어야 원본 순서와 같다.

### 9.2 파일 [웹 이름]
| 파일 | 내용 |
|---|---|
| `flow.ts` | 단계 0~0x13 처리기 표(§5.1), 한 걸음 규칙(01_core §5.3: 바뀐 프레임에 새 처리기 안 부름, 하위 상태 리셋), 강제 종료 |
| `ending.ts` | 엔딩 5단계(§6.6), 결과 단계와의 연결 |
| `endTimer.ts` | §6.4 (180/300/600, 30초부터 표시) |
| `telop.ts` | TelopType −1..4, 사용자 텔롭 인터페이스 |
| `openingSkip.ts` | §6.3 하위 상태 |
| `mgSetting.ts` | `mgListND/CA.json` 의 `mgSetting` 을 그대로 읽는 표(§4.3) |
| `hooks.ts` | 훅 인터페이스(기본 1) |

### 9.3 원본과 같게 / 바꾸는 것
- 같게: 단계 순서, 페이드 1.0초, 재시작 4프레임, EndSeqWaitTime, 타이머 30초 표시, 설명 화면 반복 경로, 건너뛰기 뒤에도 훅이 참이어야 진행.
- 웹 공용 세션 계약(파티 문서 `파티_미니게임_모음_분석.md` §3·§4)의 phase 는 이 문서 §5.1 단계로 바꿔 적어야 한다: `opening` = 0·4·5, `inst` = flag 0 경로, `start` = 6·7·8, `main` = 9, `finish` = 10·11·12, `ending` = 13·14·엔딩 5단계, `exit` = 16·17.
- 바꾸는 것: 온라인 스킵 전파(네트 전송)는 웹 lockstep 입력으로 대체 [설계].

## 10. 검증 코드·실행 결과·기대값

| 검증 | 방법 | 결과 | 수준 |
|---|---|---|---|
| 기존 C 재사용 | `decomp_index.py`·INDEX.tsv 조회 | `bq::MinigameScene` 51함수·처리기 2~0x12·텔롭/타이머/스킵/엔딩 함수는 `core_b5.c` 에 있어 다시 뽑지 않음 | [판독 원천] |
| 신규 디컴파일 | `mgmcommon_ghidra.sh MgmcommonDecompCreate.java`(readOnly) | 40함수/4파일: main1 19(단계 0·1 처리기 함수 생성, 생성자 람다, 결과 흐름 보조 4, `MGSetting` 조회 6, 횟수·통계 2, 소리·효과 보조 3), main2 4(람다), main3 3(엔딩 하위 상태기계·연습 콜백·결과 파이버 본체), main4 14(`MGSetting` 로더·조회) | [판독] |
| vtable 0x240~0x298 | `main.decomp.bin` 오프셋 = VA − 0x7100000000 으로 직접 읽음 | 12칸이 이름 있는 기반 함수 0x2e5488~0x2e54e0 과 1:1 | [실행: 변환] |
| 이름 없는 기반 4칸 | 같은 방법으로 명령 2개 읽음 | 모두 `mov w0,#1; ret` | [판독: 어셈블리] — C 가 없는 칸이라 확인 |
| 람다 대상 | std::function vtable +0x30, 멤버 함수 포인터 GOT(`0x1a872d8/f0/f8~318`) 읽기 | 엔딩 5단계 = `0x71002e35cc…3810`, 결과 흐름 = `FUN_71002e34d0`, 연습 콜백 = `FUN_71002e099c` | [실행: 변환][판독] |
| 설정 표 | `mgListND/CA.json` 읽기 | 필드 15종·값 분포 §4.3 | [데이터] |

어셈블리를 본 곳은 이름 없는 기반 훅 4칸뿐이다(디컴파일 C 가 없는 칸). 나머지는 모두 C 로 판독했다.

## 11. 미확정 사항과 추가 분석에 필요한 근거

| 항목 | 상태 | 필요한 근거 |
|---|---|---|
| `MGResult` 결과 연출 | **닫힘(2026-10-07)** → [minigame_result.md](minigame_result.md). 3D 무대 내부 수치는 그 문서 §11 | — |
| vt 0x200·0x208 이름 | [추정, 강함] | 파생 NRO vtable 을 재배치 정보로 정확히 읽기 |
| 설명 화면(flag 0 을 켜는 쪽)·`MGInstSetting` | 범위 밖 | `mgInst` 모듈, `MGInstSetting` |
| flag 1 의 정확한 뜻 | **닫힘**: normal/endless 선택(mgm01_freeplay.md §8.3) | — |
| `MGUiMgr` 시점 신호와 상태 얼굴·타이머 In/Out 연결 | [추정] | `FUN_71002d6cd0`, `MGUiMgr::TimingOut`, `FUN_71002d6fd0`, `FUN_71002d74e0` |
| JSON 문자열 열거 ↔ 정수(TimerPos·StatusFace·Timing) | [미확정] | `JsonMGSettingData` 속성 변환 함수(`PTR_FUN_7101a87128` 계열) |
| 텔롭 `SetOneshot` 인자(0.41667/1.41667)의 단위 | [미확정] | `ComUiMGTelop::SetOneshot` |
| `+0x26A` writer | [미확정] | 파생 클래스 쓰기 검색 |
| 단계 15(`OnGameEndingSkip`)로 가는 경로 | 기반 처리기에는 없음 | `MGResult` 파이버 또는 파생 클래스가 `+0x214` 를 쓰는지 |
| SystemCallBack 번호 1·5·6 의 수신자 | [미확정] | `SystemCallBackModule` 등록자 |
| PlayMode 1·9 와 `UiRetryMenu` | [미확정] | `WorkModule::GetPlayMode` 값 표 |
| 원본 실행 대조 | 없음 | 원본 캡처(데모 건너뛰기·오프닝 건너뛰기·타이머 30초 표시·설명 화면 반복) |
