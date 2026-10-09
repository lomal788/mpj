# 미니게임 한 판의 바깥 틀 (bq::MinigameScene) — 원본 분석

2026-10-07. 상태: **분석 완료(판독·데이터). 2026-10-09 웹 구현 계약 §12(구현: app/minigame/frame/scene). 원본·웹 실행 대조 없음.**
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

---

## 12. 웹 구현 계약 (2026-10-09, [mg-scene])

이 절은 §1~§11 판독을 웹 코드로 옮기는 **설계·계약**이다. 구현은 이 절을 따르고, 구현 중 원본과 다른 점이 생기면 이 절을 먼저 고친다.
결과 3D 무대(minigame_result.md §6.6~6.9·§7)는 [mg-result3d] 담당이고, 여기서는 부르는 계약(§12.8)만 정한다.

### 12.1 추가 판독 (구현에 필요해서 이번에 읽은 것)

기존 C(`core_b5.c`·`ui1801_main.c`·`mgC_main_uitimer*.c`·`mgmcommon_main_vt.c`)를 먼저 읽고, 없던 20함수만 새로 뽑았다:
`analysis/decomp/mgscene_web1.c`(16: 321go 카운트 `FUN_7100211bc0`, 텔롭 out 끝 `FUN_7100211a04`, MGSound `FUN_71001e4a54`·`FUN_71001e559c`·`TryStartResultSound`·`TryStartWhistle`·`FUN_71001e4f28`·`FUN_71001e5778`·`FUN_71001e4308`, `ComUiGuideSkip::ComUiGuideSkip`, `MgWipeModule::FadeOut/FadeIn`, `MGUiMgr::TimingOut/EntryUi/EntryUiTimer`, 상태 칸 구성 `FUN_710030ddc0`), `mgscene_web2.c`(4: MG BGM 재생 `FUN_71001e4c9c`·`FUN_71001e4af0`, 결과 징글 라벨 `FUN_71001e51e0`, 핸들 재생 `FUN_71001e39a0`).

**정정: 페이드 "1.0초"는 속도다.** `WipeModule::FadeOut(type, f)` 는 `Wipe<종류>_out` 을 재생하고 `AnimationSlot::SetSpeed(f)` 한다 [판독 logic1801_main1.c @0x710029c940]. `wipe.bflyt` 의 `Wipe{Black,White,Loading,CrossFade}_{out,in}` 은 **20프레임** [데이터] → `FadeOut(1.0)` = **20프레임(1/3초)**. §5.1·§6·§7 의 "1.0초"는 모두 이 뜻으로 읽는다. 와이프 종류 = `GetLastUsedWipeType`(이어 쓰기); 이름 Black 0·White 1·CrossFade 2·Loading 3.

**이전(2026-10-09):** 와이프는 공용 화면 전환 [../engine/15_transition.md](../engine/15_transition.md) 로 옮겼다. `MgWipe` 는 코어 위 얇은 부품(판정 규칙 그대로), FadeOut 종류 = **White**(MinigameFlow `FadeOut(1.0, 1)` [판독 core_b5]), FadeIn = 마지막 종류. 그림은 레이아웃 층이 아니라 앱 DOM 오버레이.

| 항목 | 판독 결과 | 근거 |
|---|---|---|
| 열거 문자열 표 | `{이름 ptr, 값}` 16 B 쌍. **GameRule**: VS4 0, 2VS2 1, 1VS3 2, 1VS1 3, VS8 4, 1VS7 5, VS30 6, Chara 7, Item 8, Boss 9, Rhythm 10, Busters 11, Athlon 12, AthlonSP 13, Extra 14, None −1. **TimerPos(LytPlace)**: TL 0, TC 1, TR 2, CL 3, CC 4, CR 5, BL 6, BC 7, BR 8. **StatusFace**: Corner 0, Top 2, Bottom 3, Split00_Top 4, Split00_Bottom 5, Split01_Top 6, Split01_Top_Slim 7, Split01_Bottom 8, Split01_Corner 9, Left_Top 10, Right_Top 11, 2vs2_Top 12, 2vs2_Bottom 13, 2vs2_Left_Top 14, 2vs2_Split00_Top 15, 2vs2_Split00_Bottom 16, 2vs2_Split01_Left_Top 17, 2vs2_Split01_Right_Top 18, 2vs2_Split01_Left_Bottom 19, 2vs2_Split01_Right_Bottom 20, 1vs3_Top 21, 1vs3_Bottom 22, 1vs3_Left_Top 23, 1vs1_Top 24, 1vs1_Bottom 25. **In 시점**: Telop 0, AfterTelop 1, Ending 2. **Out 시점**: Telop 0, AfterTelop 1, FadeOut 2. **InstLoop**: Finish 0, Result 1. 문자열 None = −1 | `main.decomp.bin` 0x19d8390~0x19d8740 [실행: 변환] — §4.3·§11 의 "JSON 문자열 열거 ↔ 정수" 닫힘 |
| MGUiMgr 시점 | `FUN_71002d6cd0(n)`: 등록 UI 중 In 시점 == n 인 것에 MsgMgUiIn. `TimingOut(n)`: Out 시점 == n 인 것에 MsgMgUiOut(n==2 면 즉시 끔 플래그). 신호 자리: In 0 = 단계 7 하위 0(시작 텔롭 직전), In 1 = 단계 7→8, In 2 = 엔딩 3 첫 프레임 / Out 0 = 단계 11 하위 0, Out 1 = 단계 11 텔롭 끝, Out 2 = 엔딩 0 페이드 뒤·결과 무대 준비. `FUN_71002d74e0` = 등록 타이머 전부 Out(종료 타이머 만료 때) | ui1801_main.c 2034~2150, mgscene_web1.c — §11 "MGUiMgr 시점 신호" 닫힘(상태 얼굴·게임 타이머의 In/Out = MGSetting 시점 값) |
| 시작·종료 텔롭 `ComUiMGTelop` | 레이아웃·첫 애니: 0 `sys_tlp_start_00` "in", 1 `sys_tlp_321go_00` "count", 2 `sys_tlp_finish_00` "in", 3 `sys_tlp_round_00` "inout", 4 `sys_tlp_round_01` "inout", 5 `sys_tlp_win_center_00`, 6 `sys_tlp_win_top_00`(3명 이상 `_01`), 7 `sys_tlp_win_00`(3명 이상 `_01`), 8 `sys_tlp_draw_00`, 9 `sys_tlp_final_attack`(모두 "in"). 상태 `+0x3c`: 0 대기, 1 첫 애니, 2 normal, 3 out, 4 끝. 첫 애니 끝 → (oneshot·"inout" 이면 끝) / 종류 1 이면 카운트 / 아니면 "normal". normal 에서 oneshot 이면 dt 누적 ≥ oneshot 초 → 종류 0·2·8·9 는 "out", 그 밖은 바로 끝. out 끝 → 끝. `Out()` = oneshot 아니고 상태 2 일 때만 "out". `Finished` = 상태 0 또는 4. flag 0(설명 화면)이면 종류 0·1 은 Start 가 바로 상태 4 | ui1801_main.c `Start`·`FUN_7100211768`·`FUN_7100211acc`·`FUN_7100211a04`·`Finished` |
| 텔롭 글자 | 0 `x_tlp_start`=mg_tl101, 2 `x_tlp_finish`=mg_tl301, 1 `x_text_00`=mg_tl102_count(Number0 3→2→1)·마지막 `x_text_01`=mg_tl102_go, 5~7 한 명: `x_text_name_00`=mg_tl302_name_max2(Text0=PC 이름 라벨)·`x_text_win`=mg_tl302_wins, 여러 명: `x_text_name_0i`=max2(2명)/max4·`x_text_win`=mg_tl302_win(4명 레이아웃이면 `x_text_name_03` 숨김), 8 `x_text_draw`=mg_tl303 | 같음, 문자열 main 0x15c4e26 등 [실행: 변환] |
| 321go | 상태 1 에서 "count" 끝날 때마다 카운터(+0x5c) 0→1→2→3: 0·1 = 다시 "count"(Number0 2·1), 2 = "go", 3 = 끝(숨김). `IsEndCountdown` = 상태 1 이면 카운터 > 2 (= "go" 를 시작한 뒤 참) | mgscene_web1.c `FUN_7100211bc0`, ui1801 `IsEndCountdown` |
| 텔롭 소리 | 레이아웃 FX 트리거(`common/ftrg/se_common_layout.ftrg`, 모두 애니 프레임 0): start "in" → SQ_SE_TLP_START + WD_VOI_LOC_SYS_START, finish "in" → SQ_SE_TLP_FINISH + WD_VOI_LOC_SYS_FINISH, draw "in" → WD_VOI_LOC_SYS_DRAW, 321go "count"(번호 n=3,2,1) → SQ_SE_TLP_321GO_n + WD_VOI_LOC_SYS_n, "go" → SQ_SE_TLP_321GO_GO + WD_VOI_LOC_SYS_GO. 코드: 종류 2 Start 가 SQ_SE_MG_FINISH(무음), 승리 Start 가 WD_VOI_LOC_SYS_WINNER(S) + `TryStartResultSound(1, 5)`, 무승부 `TryStartResultSound(1, 8)` | ui_ftrg.py dump [데이터], ui1801 `Start` |
| 시작 텔롭 Start (`FUN_71002e2e90`) | 종류 0: SetOneshot(0.41667) Start + MGSound 위치 0. 종류 1: Start + MGSound 위치 1. 종류 2: SetOneshot(1.41667) Start. 단계 7 하위 1(텔롭 끝): 종류 1 이면 MGSound 위치 0, `TryStartWhistle(0)`, !P 면 일시정지 허용 | core_b5 + ui1801 `FUN_71002e16c0` |
| MGSound | 표 `audio/data/mgsound_setting.json` `MgSoundData`(104행, 레코드 0x2B0): `mg_bgm_play_position` scene_start 2·telop_start 0·telop_3 1, `mg_bgm_label`·`mg_bgm_play_offset`(프레임, /60 초 뒤 재생), `mg_bgm_intro_skip`(오프닝 건너뛰면 즉시 재생 + `RegionSequenceJump`), `inst_bgm_label`, `finish_jingle_label/offset`, `result_jingle_play_position`(start 0·telop 1)·`offset`(38 프레임), `whistle_entry_type`(0/1/−1 → `TryStartWhistle(t)` 가 같을 때만 SQ_SE_SYS_WHISTLE). 위치 호출: 단계 3 `(2)`, 시작 텔롭 `(0|1)`. 결과 징글 라벨(`FUN_71001e51e0`): GameRule ∈ {0,1,2,3,7,9} 이고 (시점 0 또는 종류 −1) → 참가자 중 순위 0 이나 승패 1 이 있으면 SM_JIN_MG_WIN, 없으면 SM_JIN_MG_DRAW; 시점 1 이면 종류 5 → WIN, 8 → DRAW; GameRule 14 는 종류 8/첫 참가자 승패 2 → DRAW. 한 장면에 한 번(+0x164) | mgscene_web1·2.c [판독][데이터] |
| 종료 타이머 `ComUiTimer` | `sys_timer_00`, 그리기 우선 0x8900, 처음 위치 TC(1). 남은 초 감소 = 틱마다 dt(상태 1), ≤0 → 0·상태 3. 표시 = trunc(남은 초) 정수, 자릿수별 `x_num_{n}_{i}` 하나만 보이고 재질 텍스처 SRT ty = 자릿수·0.1. 경고(+0x4c 켬, +0x48 = 5.0초): 정수가 바뀐 프레임에 남은 ≤ 5.0 이면 "countdown" + (보이는 중 상태 2) SQ_SE_SYS_MG_COUNT_TIMER, 0 이 되면 +0x4d. In(false) = "in" → 끝나면 "normal". Out(false) = 남은 > 5 ? "out" : "out_red" | mgC_main_uitimer*.c [판독], 애니 in 19·out 9·out_red 10·countdown 19 프레임 [데이터] |
| LytPlace 배치 `ComUiBase::SetPlace` | 페인 `x_bd_00`(위치 t, 크기 s)로: 가로 0 왼 → x = −(1920−w)/2 − t.x, 2 오른 → (1920−w)/2 − t.x, 1 가운데 → 0; 세로 3 위 → y = (1080−h)/2 − t.y, 4 아래 → −(1080−h)/2 − t.y, 1 가운데 → 0. 표 `0x15d76a4` = (0,3)(1,3)(2,3)(0,1)(1,1)(2,1)(0,4)(1,4)(2,4) | mgmcommon_main_vt.c @0x710020c8d4 [판독] |
| 상태 얼굴 `ComUiStatus(0x10, match, place)` | match = GameRule 0~3(그 밖 0). 레이아웃: match 0 → place 1~11 표 [pos4_10, pos4_01, pos4_02, pos4_08, pos4_09, pos4_06, pos4_11, pos4_07, pos4_05, pos4_03, pos4_04][place−1], 그 밖 pos4_00; match 1 → place 13~20 표 [pos22_01, 02, 07, 08, 03, 04, 05, 06][place−13], 그 밖 pos22_00; match 2 → 22 pos13_01, 23 pos13_02, 그 밖 pos13_00; match 3 → 25 pos11_01, 26 pos11_02, 그 밖 pos11_00. 칸 `x_parts_00~03` 을 모두 숨기고 참가자 순서대로 i번째 칸을 보이며 `UiControlStatus` 에 (PlayerID, 종류) 설정. In(false) "in" 상태 0 / Out(false) "out" 상태 2 | ui1801_main.c `FUN_710030d4b8`·`FUN_710030ddc0`·`In/Out`·`SetValue`(종류별 최댓값) [판독] |
| 건너뛰기 안내 `ComUiGuideSkip` | `sys_guide_pos_00`, 그리기 우선 0x8a00, 칸 9(`x_parts_09`) 의 `x_text_right` = mg_ui501. 입력 = 사람 참가자 bex 트리거 0x3000(+/−) | mgscene_web1.c, core_b5 `FUN_71002e27a0` |

### 12.2 위치와 경계

| 폴더 | 내용 | import 규칙 |
|---|---|---|
| `web/script/app/minigame/frame/scene/` | **순수 로직**(three·DOM 없음): 장면 흐름·텔롭·타이머·상태 얼굴·와이프·스킵 안내·MGUiMgr·MGSound·엔딩·표·결과 무대 계약 | import 0(같은 폴더만). mgm_common §9.1 셸 경계를 지킨다(core·view·games 금지). 난수·패드는 인터페이스로 받는다 |
| `web/script/view/mgsceneUi.ts` | 2D 그리기: 로직의 UI 상태 → `view/lyt.ts` LayoutInstance·LytRenderer(텔롭 OTF 글꼴·부품 지원, mg1801 과 같은 재생기) | view 쪽이라 `view/lyt.ts`·`app/scene/menu/charselect/fontSheet` 사용 가능 |
| `web/script/view/mgsceneSound.ts` | 소리 사건 → AudioOut(SE·보이스 wav) + `appBgm()`(공용 징글) + 게임 BGM 채널(`BgmChannel`) | |
| `web/script/mgscene_page.ts` | dev/ui.html 항목 "미니게임 공용 틀": 페이지 루프(FixedClock 1/60, rAF 당 최대 4스텝), 더미 게임 | |
| `web/script/dev/game/mgdummy/` | 시험용 더미 게임(틀만 확인하는 최소 3D) | |
| `web/assets/mgscene/` | `ui.json`(레이아웃·애니·텍스트·글꼴 참조·텔롭 OTF), `tables.json`(MGSetting·MGList·MgSound 필요한 열), `sound/`(틀 소리 명세) ← `web/tools/analysis/mgscene_web_assets.py` | 공용 sys_* 그림은 `assets/common/tex`, SQ_SE_SYS_* 는 `assets/common/sound`(common_shared.py), 글꼴은 `assets/font` |

2D 렌더러 선택: 원본 텔롭 글자(`bqfont_telop`)가 **스케일러블 OTF** 라 charselect `render2d`(FFNT 시트 전용)로는 그릴 수 없다. 그래서 mg1801 이 이미 같은 레이아웃(`sys_tlp_start_00`·`sys_tlp_finish_00`)을 그리는 `view/lyt.ts` 를 쓴다(새 렌더러를 만들지 않음). 합성 순서는 광장과 같다: **게임 3D(후처리 포함) → 결과 무대 3D(갈래 A 일 때 게임 3D 대신) → 틀 2D**. 지금 2D 는 lyt.ts 방식(공유 화면 밖 문맥 → HUD 캔버스)이고, 광장식 한 문맥 패스로 옮기는 것은 렌더러가 하나로 모일 때 한다.

### 12.3 게임 쪽이 구현할 인터페이스 (`MgGame`)

원본 훅(§4.2)을 이름 그대로 둔다. **구현하지 않은 bool 훅은 참(진행)** 이다(원본 기반 구현 = 1). 틀은 매 프레임 `update()`(게임 자체 파이버 = 원본 제품 파이버) 다음에 흐름 처리기 하나를 부른다(01_core §5.3).

```ts
interface MgGame {
  setup(ctx: MgSceneContext): void;            // 원본 SetupGame/SyncedSetupGame 자리. 설명 화면 반복(단계 18)마다 다시 불린다
  update?(): void;                             // 원본 제품 파이버: 흐름 처리기보다 먼저, 모든 단계에서 매 프레임
  cleanup?(): void;                            // 원본 CleanupGame(단계 18)
  onSetGameSequence?(stage: number): void;  onGameSequenceBefore?(): void;  onGameSequenceAfter?(): void;
  onThreeMinTimerEnd?(): void;
  onCharaGameDemoStart?(): boolean; onCharaGameDemo?(): boolean; onCharaGameDemoSkipStart?(): boolean;
  onCharaGameDemoSkipEnd?(): boolean; onCharaGameDemoEnd?(): boolean;
  onGameInit?(): boolean;  onGameInstInit?(): boolean;  onGameFirstFade?(): boolean;
  onGameOpening?(): boolean;  onGameOpeningSkip?(): boolean;  onGameStartBefore?(): boolean;
  onGameStartTelopBefore?(): boolean;  onGameStart?(): boolean;  onGameStartAfter?(): boolean;
  onGameMain?(): boolean;  onGameEnd?(): boolean;  onGameFinish?(): boolean;  onGameFinishAfter?(): boolean;
  onEndingInit?(result: MgResultApi): boolean;  // 여기까지 순위·승패·코인을 써야 결과가 맞다
  onGameEndingFade?(): boolean;  onGameEndingChangeCut?(): boolean;  onGameEndingBefore?(): boolean;
  onGameEnding?(): boolean;  onGameEndingAfter?(): boolean;  onGameEndingSkip?(): boolean;
  onGameLastFade?(): boolean;  onGameExit?(): boolean;
}
```

`MgSceneContext`(틀이 게임에 주는 것): `mgId`, `players: MgPlayer[]`(pid·chara 'pcNN'·isCom·teamId·order + 기록 rank·winLose·coin), `rand`(동기 난수 `u32()`·`mod(n)`), `pad(pid)`(이번 프레임 now/down, bex 비트가 아니라 NPAD 비트), `frame`, `dt`(f32 1/60), `isInst`(P), `setStartTelop(type, user?)`·`setFinishTelop(type, user?)`(−1..4, 3·4 는 `user: {start(), finished()}`), `setGameOpeningSkipEnable(b)`·`isOpeningSkip()`·`endOpeningSkipWait()`(+0x26A), `setRank/setWinLose/setCoin(pid, v)`, `createWinTelop(pids, place?)`·`createDrawTelop(place?)`·`winTelopFinished()`·`winTelopOut()`, `status`(상태 얼굴: `setValue(pid,v)`·`setRank(pid,r)`), `sound.se(label)`·`sound.whistle(type)`, `fading()`.

`MgResultApi`(OnEndingInit 인자 = MGResult 핸들): `setPlayer(pid)`(갈래 A 확정), `setModel/setMotion/setCameraType/setCameraPattern/setCameraNearZ/setCameraFarZ/setPcPosOffset/setThemeChara`(minigame_result §4.1).

**프레임 게이트(온라인 자리).** 틀의 고정 스텝은 `FrameGate { canStep(frame): boolean; inputsFor(frame): MgPadInput[] }` 로 감싼다(`app/minigame/frame/scene/gate.ts`). 기본 `localGate` = 항상 진행·로컬 패드 그대로(지금 동작). `canStep` 이 거짓이면 그 프레임은 **게임 update·흐름 단계·종료 타이머·텔롭/와이프/상태 상태기계(단계 진행을 정하므로 로직)·동기 난수 소비가 모두 멈추고**, 페이지의 그리기(3D·2D)만 계속 돈다. 게임은 패드를 `ctx.pad(pid)`(게이트가 준 입력)로만 받고, 시드는 틀이 받아 `ctx.seed`·`ctx.rand`(동기 난수)로 넘긴다 — 게임이 `Math.random`·URL·로컬 패드를 직접 읽지 않는다. **온라인 구현은 [../engine/12_online_sync.md](../engine/12_online_sync.md) §6.2 를 따른다.**

**짧은 게임용 도우미** `simpleMgGame({ setup, step, isFinished, result, render? })`: `onGameMain` = step 후 isFinished, `onEndingInit` = `result()` 의 순위·승패·코인을 기록(+ `useResultStage` 면 setPlayer), `onGameEnding` = 승자 텔롭(CreateWinTelop/CreateDrawTelop)을 띄우고 끝날 때까지 기다린 뒤 Out. 결과 형식 `{ ranks: number[](0=1위), winLose: (−1|0|1|2)[], coins: number[] }` — 원본 PlayerWork 값 그대로.

### 12.4 틀이 처리하는 것

| 무엇 | 원본 | 웹 모듈 |
|---|---|---|
| 단계 0~0x13, 하위 상태, 바뀐 프레임 규칙, 강제 종료, 설명 화면 반복(4프레임) | §5·§6.1·§6.7 | `flow.ts` |
| 오프닝 건너뛰기(안내 표시·+/− 입력·SQ_SE_SYS_SKIP·소리 그룹 0.3 s 정지·페이드아웃 후 훅 참 대기) | §6.3, 12.1 | `flow.ts` + `ui.ts`(안내) |
| 시작/종료 텔롭 −1..4, 승리·무승부 텔롭 5~8 | §6.5, 12.1 | `telop.ts` |
| 종료 타이머(180/300/600, 30초부터 표시, 5초 경고음, 만료 → 단계 10) | §6.4, 12.1 | `timer.ts` |
| 상태 얼굴(MGSetting StatusFace, In/Out 시점) | 12.1 | `status.ts` + `ui.ts`(MGUiMgr) |
| 페이드(와이프 20프레임·속도 1.0) | 12.1 정정 | `ui.ts`(Wipe) |
| BGM·징글·SE 시점(MgSound 표) | 12.1 | `sound.ts`(사건만 낸다) |
| 엔딩 5단계(갈래 B), 결과 무대 호출(갈래 A) | §6.6, minigame_result §3 | `flow.ts` |
| 표(MGSetting·MGList·MgSound) | §4.3 | `tables.ts` |
| 미리 받기 목록 | loader_manager.md | `index.ts` `mgscenePrefetch(ui)` → `mgscene/ui.json`·tables·sound.json·그림·텔롭 글꼴 경로(assets/ 기준) |

같은 프레임 안 순서 [추정: 컴포넌트 틱과 장면 파이버의 순서 미판독, mg0912 §147 과 같은 미확정]: ① 패드 읽기 → ② `game.update()` → ③ MGSound 지연 재생 갱신(`FUN_71001e4308`) → ④ `OnGameSequenceBefore` → 흐름 처리기 1개 → `OnGameSequenceAfter` → ⑤ UI 틱(와이프·텔롭·타이머·상태·안내의 애니 1프레임 진행과 끝 판정) → ⑥ 그리기.

### 12.5 단계 시간 (원본 값, 시험 기대값)

애니 진행 규칙(웹, [추정 §12.11]): 매 UI 틱에 컴포넌트 판정(끝 검사·다음 애니 시작)을 먼저 하고 그 뒤 모든 애니를 1 진행한다 → 길이 N 의 애니는 시작 틱부터 N 틱 진행한 뒤의 틱에서 끝으로 본다. 단계가 바뀐 프레임에는 새 처리기를 부르지 않으므로(01_core §5.3) **애니 하나를 기다리는 단계의 길이 = 1(다음 프레임에 처리기 시작) + N + 1(끝을 본 다음 프레임에 처리기가 판단)**.

| 무엇 | 원본 값 | 단계 길이(시험 `test_mgscene` 고정값) |
|---|---|---|
| 첫 페이드(단계 3) / 마지막 페이드(16) / 건너뛴 뒤 페이드인(6) | 와이프 in·out 20 프레임(속도 1.0) | 1 + 20 + 1 = 22 |
| START 텔롭(단계 7) | in 20 + normal oneshot 0.41667 초 = **25 틱**(f32 1/60 누적) + out 15 | 1 + 60 + 1 = 62 |
| FINISH 텔롭(단계 11) | in 20 + oneshot 1.41667 초 = **86 틱**(f32 누적이 85 틱에서 0x3FB55555 에 모자람) + out 15, EndSeqWaitTime 0 | 1 + 121 + 1 = 123 |
| 321go | count 60 × 3 → "go" 시작 틱에 IsEndCountdown | 판정 181 틱째 |
| 오프닝 건너뛰기 | + 누른 프레임에 SQ_SE_SYS_SKIP·페이드아웃 20 | 누른 프레임 → 단계 5 까지 21 |
| 설명 화면 재시작(18) | 하위 0 한 프레임 + 1.0 누적 4 | 18 → 1 까지 5 프레임 |
| 종료 타이머 | 남은 ≤ 30 초 In(in 19), 경고 ≤ 5.0 초 정수 바뀔 때 countdown 19 + SQ_SE_SYS_MG_COUNT_TIMER(4·3·2·1·0 = 5번, 60 프레임 간격), 만료 → OnThreeMinTimerEnd → 10, Out = out_red 10 | |
| MG BGM | scene_start + `mg_bgm_play_offset`/60 초(dt 빼기) | mg0101 614 → 단계 3 첫 프레임 + 614 프레임. 오프닝이 짧으면 종료 텔롭의 정지가 대기 중 BGM 을 해제해 울리지 않는다(원본 FUN_71001e4f28 그대로) |
| 결과 징글 | `result_jingle_play_offset` 38 프레임 | 갈래 A `resultSound` 뒤 38 프레임. 갈래 B·EndingChangeCut 0 이면 기반 클래스는 징글을 내지 않는다(엔딩 2 의 TryStartResultSound 는 컷 전환일 때만, 승리 텔롭의 시점 1 호출은 표 104행 모두 시점 0 이라 불발) |
| 상태 얼굴 | in 9 / out 5 | 갈래 B·EndingChangeCut 0 이면 엔딩 0(TimingOut 2)을 건너뛰므로 Out FadeOut 상태 얼굴은 엔딩 동안 남는다 |

### 12.6 사건(로직 → 화면·소리)

로직은 프레임마다 `events` 를 낸다: `{k:'stage', from, to}`, `{k:'se', label}`, `{k:'voice', label}`, `{k:'bgm', label, region?}`(지연은 로직이 센다), `{k:'bgmStop', fadeSec}`, `{k:'jingle', label}`, `{k:'groupStop', groups, sec}`, `{k:'vib', label}`, `{k:'save'}`, `{k:'pauseEnable', on}`, `{k:'exit'}`, `{k:'resultStage', input}`. UI 는 사건이 아니라 **상태**(`ui.layouts: 레이아웃 인스턴스별 {layout, visible, anim, frame, texts, paneVisible, paneTexSrt, pos, order}`)로 넘긴다 — 화면은 그 상태를 그대로 그린다(mg1801 state.fade 와 같은 방식).

### 12.7 원본과 다른 점 / 근사

- 온라인 스킵 전파(네트 전송)는 없다(오프라인 틀). 진동(`bv_vib_sys_skip`)은 사건만 낸다.
- `RegionSequenceJump`(오프닝을 건너뛰면 BGM 을 `REG_SEQ_MAIN` 리전 시퀀스로) — 리전 시퀀스 이름은 BFSTM 리전 표(REG_INTRO_00~02·REG_MAIN_00·01)에 없다(fspj 쪽 미판독). 웹은 사건에 리전 이름만 싣고 처음부터 재생한다 [근사]. MG BGM 반복 = REG_MAIN_01 구간 [추정].
- 소리 재생: MG BGM·결과 징글은 원본처럼 핸들이 따로다(`view/mgsceneSound.ts` 의 BgmChannel 두 개). 틀에 들어올 때 앱 BGM(`appBgm()`, 메뉴 곡)은 0.2 초로 멈춘다.
- 일시정지 메뉴(`UiPause`)·재시도 메뉴(`UiRetryMenu`)·세이브(플레이 횟수·통계)는 사건만 내고 화면은 없다(범위 밖).
- `UiControlStatus`(상태 칸 안쪽 그리기 — 얼굴·순위·점수 칸 표시 규칙)는 판독하지 않았다. 얼굴 = `face_128_pcNN^u`(UiControlStatusFace 규칙, mg1801 과 같음), 점수 = `x_text_score`, 순위 = `x_text_rank_00` [근사].
- 캐릭터 데모(단계 0)는 흐름만 있고 데모 연출은 게임 훅에 맡긴다.

### 12.8 결과 3D 무대 호출 계약 ([mg-result3d] 와 합의, SHARED.md `>> [mg-scene]`)

타입 = `app/minigame/frame/scene/resultContract.ts`(import 0). 무대 = `app/minigame/frame/result/`(그쪽 소유) `createResultStage(input, host): Promise<ResultStage>`, `resultStagePrefetch(input): string[]`.
- 입력 `ResultStageInput` = { mgId, gameRule, isCoin, isChara, judgeType, boardMode, playMode, players[{pid, chara, order, teamId, isCom, winLose, rank, coin}](SetPlayer 한 사람만), opts(Set 계열), rand() }.
- 호스트 `ResultStageHost` = { gl(THREE.WebGLRenderer, unknown 으로 넘김), fade(dir, speed)·fading(), winTelop{start(no, place), out(), finished()}, coinShow(pid, coin), se, bgm, resultSound(no), uiTimingOut(n), url }.
- 출력 `ResultStage` = { step()(1/60 = 파이버 Wait 1번), done, render()(3D만), dispose() }.
- 틀: 단계 13 에서 `OnEndingInit` 참 + 등록 1명 이상 → 무대 생성(비동기: 준비될 때까지 단계 13 에 머문다), 매 프레임 step → done 이면 14 → 16. 무대 팩토리가 없거나 만들기 실패면 갈래 B(엔딩 5단계)로 넘어가고 `console.warn`.
- 게임 3D 장면(2026-10-09): 공용 변환기로 만든 게임은 장면 로더 `app/minigame/frame/stage` 의 `MgStage` 가 "게임 3D" 를 그리고(`render()`), 갈래 A 에서 `await stage.resultWorld()`(= `{scene, origin: pos_result 소켓}`)를 `resultHost.world` 로 넘긴다 — [../engine/13_asset_converter.md](../engine/13_asset_converter.md) §7.3.

### 12.9 시험 (`tools/test_mgscene.ts`, 노드)

단계 전이 순서·프레임 수(일반·건너뛰기·설명 화면 반복·타이머 만료·InstLoop Result), 텔롭·타이머·SE·BGM 사건 프레임, 결과 갈래 A(가짜 무대)·B, 더미 게임 처음부터 끝까지, 표 열거 변환, 경계(import 0) 검사.

### 12.10 mg1801 연결 계획

mg1801 로직(`app/minigame/mg1801/logic/game.ts`)은 이미 MinigameFlow 8~13 을 자기 안에 갖고, 1~7 은 PREROLL 대기로 대신한다. 틀 위로 올리는 순서:
1. (위험 없음) 표·열거·텔롭 모델을 mg1801 view 가 import 해서 자기 START/FINISH 상태기계를 대신 — 시험 `test_mg1801` 의 텔롭 프레임 비교로 확인.
2. mg1801 로직을 `MgGame` 훅으로 나눈다: 8 OnGameStartAfter, 9 OnGameMain, 10 OnGameEnd, 11 OnGameFinish, 12 OnGameEndingBefore, 13 OnGameEnding(리듬 기반 RmMgSceneBase 이름 그대로). PREROLL 을 틀의 1~7(첫 페이드 20·시작 텔롭)로 바꾸면 BGM·박자 시작 프레임이 바뀌므로 `test_mg1801` 의 기대 프레임을 원본 근거로 다시 정해야 한다.
3. 리듬 장면은 시작 텔롭·결과 점수판을 RmMgSceneBase 가 직접 띄우므로 결과는 갈래 B 그대로 간다.
→ 2 단계는 기존 시험의 기대값을 바꾸는 일이라 이번에는 하지 않는다.

2026-10-09 [rhythm] 갱신: 리듬 공용 틀을 mg1801 에서 분리했다 — `web/script/app/minigame/kit/rhythm/`(로직 import 0) + `app/minigame/kit/rhythm/view/`. 기반 `RmMgSceneBase` 의 흐름 슬롯(`onGameStartAfter`·`onGameMain`·`onGameEnd`·`onGameFinish`·`onGameEndingBefore`·`onGameEnding`, bool 반환)과 `update()`(파이버)·`updateAnimation()` 이 위 `MgGame` 이름·자리와 맞춰져 있어, 2 단계는 어댑터 하나 + 웹 MinigameFlow 대리(PREROLL·흐름 switch) 제거가 된다. 연결 계획·BGM·박자 시작 프레임이 바뀌는 이유는 [../engine/02_rhythm.md](../engine/02_rhythm.md) §14.6. 이번 분리는 동작 불변(골든 바이트 일치)이고 위 2 단계는 여전히 하지 않았다.

2026-10-09 [mg-connect] 갱신: 2·3 단계를 했다 — 어댑터 `app/minigame/kit/rhythm/mgGame.ts`, 실행 경로·결과 기록·설정 전달·결정성 규칙은 12.12.

### 12.11 사용자 확인 필요 (이 절)

| 항목 | 정한 것(원본 쪽) | 이유 |
|---|---|---|
| 와이프 종류 | Black(0) | `GetLastUsedWipeType` 이어 쓰기 — 프리 플레이 목록에서 들어올 때 마지막 종류 미판독 |
| 컴포넌트 틱과 흐름 파이버 순서 | 흐름 처리기 → UI 틱 | 미판독(12.4) |
| `UiControlStatus` 안쪽 | 얼굴·점수·순위 근사 | 미판독(12.7) |
| 2D 렌더러 | lyt.ts(HUD 겹) | 텔롭 OTF 글꼴 때문(12.2). 광장식 한 문맥은 다음 단계 |
| 스킵 안내 In/Out 애니 | `sys_guide_00` 의 in/out | `ComUiGuideBase::In` 미판독 |
| 게이트가 닫힌 동안의 2D 애니 | 틀의 텔롭·와이프·타이머·상태 얼굴 애니도 멈춘다 | 이 애니들의 끝이 단계 진행(텔롭 끝 → 호루라기·본편)을 정하므로 로직으로 둠. "로컬 연출로 계속 돌릴 2D 애니"가 따로 필요하면 표시 전용 층을 더해야 한다 |
| 설명 화면(P) 페이드·BGM | 와이프는 즉시 끝, 단계 3 첫 회에 `free_play_inst_bgm_label`(SM_BGM_MGINST) 재생 | 원본 P 는 MgWipeModule 이 SystemCallBack 으로 설명 화면에 넘기고 설명 BGM 도 그쪽 몫(범위 밖) |
| 승리 텔롭 여러 명 정렬 | PlayerID 오름차순 | `FUN_7100215d00` 정렬 키 미판독 |
| 상태 얼굴 In/Out 등록 | MGSetting StatusIn/Out 으로 MGUiMgr 에 등록 | ComUiStatus 생성자가 EntryUi 를 부르는 줄은 보지 못함(데이터 41행이 Telop/FadeOut 인 것과 맞음) |
| 더미 게임 기본값 | mg0101 표 행, 오프닝 660 프레임(MG BGM 614 프레임 지연이 들리도록), 본편 480 프레임 | 원본 게임이 아닌 시험용 |

### 12.12 웹 게임 연결 계약 (2026-10-09, [mg-connect])

이 절부터 모든 미니게임은 이 틀 위에서 돈다. 예전 `GameDef.createLogic → logic.step(pads, sound)` 경로(게임 안 MinigameFlow 대리)는 없앴다. 첫 소비자는 mg1801(리듬)이다. 12.10 의 2·3 단계를 이번에 했다.

#### 12.12.1 게임 등록 (`script/game.ts` `GameDef`)

| 칸 | 뜻 |
|---|---|
| `id`·`title`·`assetsDir`·`players`·`options` | 그대로(게임 manifest 폴더, 패널 설정) |
| `load()` | 몸체 코드 분할 받기(그대로) |
| `createLogic(setup, play)` | **`GameLogic` = `MgGame` 훅 + `state`·`events`·`done`·`result`·`sound`** 를 돌려준다. 실제 로직 객체는 틀이 부르는 `setup(ctx)`(원본 SetupGame/SyncedSetupGame 자리)에서 만든다. `play` = 프리 플레이 설정(12.12.5) |
| `createView(ctx, assets)` | 게임 3D·게임 2D·게임 소리(그대로). 매 tick 뒤 `onStep(state, events)`, rAF 마다 `render(state)`, tick 전 `observe(t)` = 사운드 관측 |
| `describeResult(r, setup)` | 페이지 결과 글(표시만). 기록 byte 는 여기서 만들지 않는다(12.12.4) |

호스트(`script/mgrun.ts` `createMgRun`, DOM 없음 — 노드 시험도 같은 함수를 쓴다)가 한 판을 조립한다.
1. 난수: `new BexRandModule(seed)` → `SetSyncRandSeed(async.Rand())` = 원본 장면 시작 상태 8 의 오프라인 시드([../engine/01_core.md](../engine/01_core.md) §6.7). 이 모듈을 `MgSceneSetup.rng`(게임용 async·sync 전부)와 `rand`(틀용 sync u32)로 같이 넘긴다 — 원본 RandModule 싱글턴 하나.
2. `game = def.createLogic(setup, play)`, `scene = new MgScene({ mgId, players, seed, rand, rng, tables, ui, wipe, endless, judgeType, playMode: 1, play }, game, gate)`.
3. 매 프레임: `game.sound = view.observe(t)` → `scene.tick()`(게이트가 열면 한 프레임) → `view.onStep(game.state, game.events)` + 틀 사건 → `MgSceneSound` → 그리기 `view.render(state)` 뒤 틀 2D `MgSceneUi.draw(scene.layers())`.
4. 끝 = `scene.stage === STAGE_END`(단계 0x13). 결과 = 12.12.4.

실행 경로: `index.html?game=<id>`(패널 시작)과 광장 → 프리 플레이 목록의 `playFromList` 가 같은 `start()` → `createMgRun` 을 쓴다. 시험 페이지 `dev/ui?ui=mgscene&game=mg1801` 도 등록 게임을 같은 호스트로 돌린다(사운드 관측 없음 = 로직 프레임 모델, 끝나면 기록 byte 를 글로 보인다). `game` 이 없으면 예전처럼 더미 게임이다.

끼움점: 게임 에셋은 `assetsDir`(게임 manifest), 틀 에셋은 `assets/mgscene/`(tables·ui·sound)를 호스트가 판마다 읽는다. 화면 전환은 `MgSceneSetup.wipe = logicWipe()`(앱 전환이 로직 전환을 비춘다, [../engine/15_transition.md](../engine/15_transition.md)) — 장면 시작 단계 3 FadeIn(마지막 종류), 나갈 때 단계 16 FadeOut(White, 1.0).

#### 12.12.2 리듬 어댑터 (`app/minigame/kit/rhythm/mgGame.ts` `RmMgGame`)

`RmMgGame` 하나가 `RmMgSceneBase`(리듬 10종 기반)의 흐름 슬롯을 `MgGame` 훅에 잇는다. 리듬 폴더는 import 0 을 지키려고 틀 문맥을 구조 형식(`RmHost`)으로만 받는다. 게임(mg1801)은 `new RmMgGame((ctx) => new Mg1801Game(…))` 로 쓴다.

| MinigameFlow 단계 | mg1801 vtable 훅 [판독] | 웹 |
|---|---|---|
| 1 OnGameInit | `RmMgSceneBase::OnGameInit` @0x7100443e74: 리듬 쿠킹 2번째 이후·메인 BGM 재생 중이 아니면 1 | 틀 기본 참(앞 게임 BGM 이 이어지는 경로는 웹에 없다) |
| 3 OnGameFirstFade | inline `return 1` mg1801 @0x710000f1a4 | 틀 기본 참, 틀 와이프 in 20 |
| 4 OnGameOpening / 5 Skip | inline 1 @0x710000f1ac / @0x710000f1b4, MGSetting mg1801 OpeningSkip 0 | 틀 기본 참 → 바로 6 |
| 6 OnGameStartBefore | inline 1 @0x710000f1bc | 기본 참 |
| 7 OnGameStartTelopBefore / OnGameStart | inline 1 @0x710000f1c4 / @0x710000f1cc. 시작·끝 텔롭 = −1(`RmMgSceneBase::SetupGame` @0x71004415a4 "시작/끝 텔롭 끔") | `setup` 에서 `setStartTelop(−1)`·`setFinishTelop(−1)` → 텔롭 없이 1 프레임 |
| 8 OnGameStartAfter | `RmMgSceneBase::OnGameStartAfter` @0x7100443fa8 | `scene.onGameStartAfter()` |
| 9 OnGameMain | @0x71004441e8 | `scene.onGameMain()` |
| 10 OnGameEnd | @0x71004453c4 | `scene.onGameEnd()`. 리믹스 연속(페이드 끝 → `RequestReturnScene`)이면 `ctx.requestReturnScene()` → 틀이 그 프레임 끝에 단계 0x13 |
| 11 OnGameFinish | vt+0x2F8 = 1 | `scene.onGameFinish()`. 끝 텔롭 −1 이라 틀 단계 11 이 2 프레임(옛 웹 `finishFrames` 대신 — 길이 같음) |
| 12 OnGameFinishAfter | inline 1 @0x710000f1d4 | 기본 참 |
| 13 OnEndingInit | inline 1 @0x710000f1dc(SetPlayer 없음) | 기본 참 → **갈래 B**, EndingChangeCut 0 → 엔딩 2단계부터 |
| 14 엔딩 2 OnGameEndingBefore | @0x7100445518 | `scene.onGameEndingBefore()` |
| 14 엔딩 3 OnGameEnding | @0x7100445620 — 끝에서 vt+0x308 OnRmGameEndingFree(결과 연출 끝) | `scene.onGameEnding()`; 결과 점수판 끝(`done`)이면 참 |
| 14 엔딩 4 OnGameEndingAfter | inline 1 @0x710000f1f4 | 기본 참 |
| 16 OnGameLastFade / 17 OnGameExit | `RmMgSceneBase` (stage=0 / vt+0x320 = 1) | 기본 참. 틀이 FadeOut(White, 1.0) 20 |

프레임 안 순서(01_core §5.3, 02_rhythm §14.4 와 같은 자리):
- 틀 ① 패드 → ② `game.update()` = **리듬 패드 읽기(ctx.pad → Pads) → 사건 비우기·사운드 관측·frame++·흐름 단계 갱신 → RmSoundMan 파이버 → 박자 시계 → 결과 연출 파이버 → 제품 파이버**
- → ④ 흐름 처리기 하나(위 표) → `onGameSequenceAfter` = `updateAnimation()`(게임 모션·결과 모션) → 바뀌면 `onSetGameSequence(다음)` = 리듬 `flow` 는 다음 프레임부터(옛 `flow = nextFlow` 규칙 그대로) → ⑤ UI 틱(틀 와이프 1 스텝).
- 결과 연출이 끝난 프레임(`done`)에는 옛 경로처럼 처리기·애니 갱신을 하지 않고, 그 뒤 프레임은 리듬 갱신을 멈추고 사건만 비운다(옛 경로는 페이지가 스텝을 멈췄다).

흰 페이드(원본 `bq::WipeModule` 직접 호출, 02_rhythm §14.6-3): 리듬의 `RmWipe` = `ctx.wipe`(틀 `MgWipe` 의 **같은 Transition 코어**). `fadeOut/fadeIn(type, speed)` = `MgWipe.direct` — 진행은 틀 UI 틱이 한 번만 한다. `playing` = 코어 `playing`(WipeModule::IsPlayingFadeAnim). 옛 경로는 프레임 **앞**에서, 새 경로는 프레임 **끝**에서 한 스텝 가므로 처리기가 읽는 값(어느 프레임에 끝났는지)은 같다. 화면은 앱 전환이 로직 전환을 비추므로 리듬 UI(`RmUi`)는 앱 전환이 이미 무엇을 비추고 있으면 따로 follow 하지 않는다.

난수: `ctx.rng`(호스트 BexRandModule). 옛 `Mg1801Game` 안의 `new BexRandModule(setup.seed); setSyncRandSeed(rand())` 를 호스트로 옮겼다 — 소비 순서·값 같음.
입력: `FrameGate → ctx.pad(pid)` 만. 체감 입력(가속도)을 잃지 않게 `MgPadInput`·`MgPadState` 에 `accX/accY/accZ` 를 더했다(감사 §2 체감 입력 "acc 손실" 해소, mg1801 `Player::humanSwing` 이 읽는다).

#### 12.12.3 시작 프레임이 바뀌는 까닭과 새 값 (원본 근거)

PREROLL 60 대기(옛 웹 근사)를 틀 단계 1~7 이 대신한다. 리듬 프레임(옛 `state.frame`, 1 부터) 기준 **OnGameStartAfter 가 61 → 27(−34)**. 틀 프레임(0 부터)으로:

| 틀 프레임 | 단계 | 근거 |
|---|---|---|
| 0 | 1 OnGameInit 참 → 3 | @0x7100443e74, 단계 1 처리기(§5.1) |
| 1~22 | 3 첫 페이드: 하위 0 FadeIn → 와이프 in 20 → 끝 본 다음 프레임 판단 | 와이프 20 프레임·속도 1.0 [판독 12.1], 1 + N + 1 규칙(12.5, [추정 12.11]) |
| 23 | 4 오프닝: 훅 참·OpeningSkip 0 → 6 | inline 1 @0x710000f1ac, MGSetting |
| 24 | 6 시작 전: 훅 참·건너뛰지 않음 → 7 | inline 1 @0x710000f1bc, FUN_71002e14e8 |
| 25 | 7 시작: 텔롭 −1 → 하위 99 → OnGameStart 참 → 8 | SetupGame 텔롭 끔, inline 1 @0x710000f1cc, FUN_71002e16c0 |
| 26 | 8 OnGameStartAfter(마스터 SQ_BGM_RC_MAIN_RHYTHM 시작) | @0x7100443fa8 |

그 뒤 사건(마스터·게임 BGM 접수·줄 배분·종료 BGM·결과·끝)은 모두 같은 양(−34)만큼 당겨지고 서로의 간격은 그대로다. 확인: **바꾸기 전 코드에 `prerollFrames: 26` 만 준 실행**과 새 코드(틀 위 실행)의 로직 기록(프레임마다 state·events, 내부 박자·난수 소비 포함)이 `flow`·`fade` 두 칸을 빼고 바이트 단위로 같다(12.12.7). `flow` 는 이제 원본 MinigameFlow 단계 번호(1·3·4·6·7·8…·12 FinishAfter·13 EndingInit·14 결과 대기)이고, `fade` 는 틀 와이프 코어(처음 덮음·단계 3 FadeIn 포함, 프레임 끝 스텝)를 보인다.

시험 기대값: `test_mg1801` 의 프레임 기대값은 모두 상대값(OnGameStartAfter·BGM 시작 기준)이라 **바뀐 것이 없다**. 절대 프레임이 들어간 기록 해시만 바뀐다 — `character_golden` 의 mg1801 두 시나리오(12.12.7).

#### 12.12.4 결과 갈래와 기록 계약

- 갈래: 리듬은 시작 텔롭(START)·결과 점수판을 `RmMgSceneBase` 가 직접 띄우고 OnEndingInit 에서 SetPlayer 하지 않으므로 **갈래 B** 다(결과 3D 무대 없음).
- 기록(원본 `MinigameModeWork::SetMinigameResult` 계약 `{id, judge, results[4]}` raw byte, [mgm01_freeplay.md](mgm01_freeplay.md) §6.6). 한 판 끝 쪽 writer 는 [미확정]이므로 같은 칸을 쓰는 main `FUN_71001f271c`(analysis/decomp/mgm01_main_contract.c) 규칙을 따른다 [판독, 호출자 미확정] — `app/minigame/frame/scene/resultEntry.ts` `minigameResultEntry`:
  - `id` = MinigameID, `judge` = GameJudgeType.
  - GameRule 8 또는 10(`(rule | 2) == 10`): 네 byte 를 한 번에 — judge 0 이면 0xFF×4, 아니면 0x02×4.
  - 그 밖: judge 0 이면 PlayerList 순(PlayerID 순 [추정: 목록 종류 1])의 `GetMinigameRank` byte, judge ≠ 0 이면 `GetMinigameWinLose` byte(−1 = 0xFF). 이 값들은 게임이 OnEndingInit 까지 `ctx.setRank/setWinLose` 로 쓴 PlayerWork 값이다(초기 −1, `FUN_71001f1e20`).
- judge(프리 플레이) = `Mgm01SetupMinigamePlayInfo` @0x71001f1c60: `SetGameJudgeType(GameRule ≠ 7 && GameRule ≠ 0)` [판독, analysis/decomp/mgmet_main_work.c] → `freePlayJudgeType(rule)`. 같은 값을 `MgSceneSetup.judgeType`(결과 무대)에도 넘긴다.
- mg1801(GameRule 10 Rhythm, judge 1) → **`[2, 2, 2, 2]`**. 승패 표 점수는 `byte == (judge ≠ 0)` 일 때만 오르므로 리듬 게임은 승을 주지 않는다(원본 그대로). 옛 웹은 표시 순위 0 → 1 이라 네 명 모두 승 1 을 기록했다.
- 실패: 미등록 게임·몸체/에셋 로딩 실패·실행 중 오류·중단은 `play()` 가 **null** 을 돌려주고, 목록(`mgm01_page`)은 기록·Round·플레이 횟수를 건드리지 않고 돌아온다. 시험용 `fakeResult`(Math.random 승자)는 `cfg.play` 가 없는 dev/ui.html 단독 시험에서만 쓴다.
- 플레이 횟수(MG save head +1): 원본은 이 장면의 `save`(단계 11·16, `FUN_71002dbb80`)가 쓴다. 웹은 결과가 돌아온 때 목록 페이지가 +1(최대 999) 한다 [근사: 세이브 사건 처리 자리 미구현].

#### 12.12.5 설정 전달 (프리 플레이 → setup)

| 값 | 원본 | 웹 경로 | mg1801 |
|---|---|---|---|
| 팀 | `FUN_71001f1930`·`FUN_71001f1e20` → PlayerWork TeamID·IsGamePlay | `req.team.teamIdByPid/gamePlayByPid` → `MgPlayerSetup.teamId/gamePlay` | 소비 안 함(GameRule 10, 4명 전원) |
| CPU | ComLevel | `GameSetup.players[].comLevel`, `play.comLevel` | 소비 안 함(RmGameWork +0xE70 읽는 곳 없음, mg1801/index.ts 머리) |
| 리듬 모드 | `RhythmWork::SetMode`(0 노멀·1 하드) | `play.rhythm` | **소비**: `RmMgSceneBase::SyncedSetupGame` @0x7100443340 PlayMode 1 → `+0x20 = mode ? 2 : 0` → `Mg1801Options.mode` |
| 엔드리스 | flag 1 | `MgSceneSetup.endless` | 소비 안 함(mg1801 은 ID {4,5,9,11,21} 밖, 타이머 −1) |
| 설명 요청 | flag 4 + MGList IsCallInst → mgInst 장면 | `play.callInst` | 전달만. 설명 장면(mgInst)은 웹에 없다 — `isInst`(P)는 거짓으로 둔다 |
| 자이로 | MGList UseGyro → flag 6(`Mgm01SetupMinigamePlayInfo`) | `play.useGyro` | 전달만. 입력은 게이트 패드의 acc(있으면 Params.acc 비교), 없으면 A |
| 순서 | GetOrder | `order` = pid | 레인 = pid(그대로) |

직접 실행(`index.html?game=mg1801`)은 패널 설정(`mode`·`course`·`cpuMiss`)을 쓰고, 프리 플레이에서 온 `play.rhythm` 이 있으면 그것이 모드를 정한다.

#### 12.12.6 결정성 규칙 (2026-10-09 사용자 결정 — 게임 계약)

원본 온라인은 **입력만** 동기화하고 기기마다 같은 계산을 한다([../engine/12_online_sync.md](../engine/12_online_sync.md) §1·§3·§4). 그래서 웹 로직(`games/<id>/logic`, `app/minigame/kit/rhythm`(view 밖), `app/minigame/frame/scene`, `core`)은 다음을 지킨다.

1. 시간: 고정 1/60 스텝(`MG_DT`·`RM_DT`, f32)만. 벽시계·`performance.now`·`Date`·rAF dt 는 로직에서 쓰지 않는다(화면 보간은 예외).
2. 난수: `BexRandModule` 만(sync/async 용도는 원본대로). 로직에서 `Math.random` 금지.
3. 입력: `FrameGate` 를 거친 패드(`ctx.pad`)만. 로직이 DOM·Gamepad API 를 직접 읽지 않는다.
4. 원본 f32 값은 `Math.fround` 로 맞춘다.
5. seed 는 게임이 만들지 않는다. 호스트가 판 시작에 한 번 만들어(`script/mgrun.ts` `localSeed`: URL·패널 값 또는 한 번의 무작위) setup 으로 넘기고, 호스트가 `BexRandModule` 을 만든다. 온라인은 나중에 합의 seed(원본 main seed @0x7100162210, 12_online_sync §4.1)를 같은 자리로 넘긴다(구현 안 함). 원본 시드 규칙은 01_core §6.6~6.7.
6. 로직과 화면 분리: 화면 상태가 로직 결과에 영향을 주면 안 된다. **예외(원본 그대로)**: 리듬의 사운드 관측(`view.observe` → `game.sound`, 원본이 게임 프레임에서 시퀀서 전역 G14·G12·L0 을 읽는다, 02_rhythm §5.1)은 화면 쪽 값이 로직에 들어간다. 결정성 시험은 이것을 입력 기록에 넣는다. 온라인에서 이 값을 어떻게 맞출지는 [미확정](사용자 확인 필요).

검사: `tools/mg_determinism.ts` — `determinismCheck`(같은 seed·입력 기록으로 두 번 돌려 매 틱 로직 상태 해시 비교)와 `staticLogicCheck`(`Math.random`·`performance.now`·`Date.now`·`new Date`·`navigator.getGamepads`·`requestAnimationFrame`·`document.`·`window.` 검색). 새 게임은 이 도우미 하나를 시험에서 부른다.

#### 12.12.7 시험·검증 기록

**옛 코드 ↔ 새 코드 로직 기록.** 바꾸기 전 코드 사본(scratchpad)에 `prerollFrames: 26` 만 준 실행과 새 코드(틀 위, `tools/mg_node_host.ts`)를 같은 입력으로 돌려, 프레임마다 `[state, events, Mg1801Game 객체 전체]`(박자 시계·MT 상태·RmGameWork·채소 풀·플레이어·결과 기록 포함, `flow`·`nextFlow`·와이프·`fade`·옛 `preroll`·`finishFrames` 칸 제외)의 해시와 마지막 결과를 비교했다. 기록기는 시험 기대값과 무관한 scratchpad 스크립트다.

| 경우 | 기록 줄(프레임 + 결과) | 전/후 |
|---|---|---|
| 노멀 시드 1 / 하드 시드 7 / CpuMiss 시드 3 | 3,222 ×3 | 같음 |
| 리듬 쿠킹 노멀 1번째 / 마지막 | 3,012 / 3,222 | 같음 |
| 롱 4번째(BPM 180) / 6번째 | 2,112 / 2,252 | 같음 |
| 리믹스(A 슬롯, RequestReturnScene) | 846 | 같음 |
| 사람 4명 A·가속도 섞기(하드) / 사람 1P 37 프레임마다 A·예외 캐릭터 | 3,222 / 3,222 | 같음 |
| 컨트롤 안내 와이프 400 | 3,372 | 같음 |
| 사운드 관측 지연 0 / 롱 BPM 180 지연 3 | 3,222 / 2,115 | 같음 |

13 경우 36,263 줄이 모두 같다. 틀 위 실행은 리듬 끝(`done`) 뒤 단계 14 → 16(FadeOut White 20 + 1) → 17 → 0x13 까지 24 틱을 더 돈다(리믹스는 RequestReturnScene 으로 0 틱). 그 동안 리듬 사건은 0 이다.

**바뀐 기대값(원본 근거: 12.12.3).**

| 시험 | 이전 값 | 새 값 | 근거 |
|---|---|---|---|
| `test_mg1801` 프레임 기대값 | — | 바뀐 것 없음(모두 상대값). 출력의 절대 프레임만 −34(OnGameStartAfter 61 → 27, 전원 CPU 길이 3,255 → 3,221) | 12.12.3 표 |
| `character_golden` `GOLDEN_SHA256.mg1801_normal` | d1c02490…fb70 | ec256e91…68a9 | 옛 코드 + PREROLL 26 실행 해시와 같음(원본 규칙·RULES_WEB 둘 다) |
| `GOLDEN_SHA256.mg1801_long180` | e595f09c…1216 | 1e7dc177…647e | 같음 |
| `GOLDEN_SHA256_WEB.mg1801_normal` | d1c02490…fb70 | ec256e91…68a9 | 같음 |
| `GOLDEN_SHA256_WEB.mg1801_long180` | c260ce24…a72e | eb7564fb…9ab4 | 같음 |
| `check_logic` mg1801 프레임 수 | 3,255 | 3,245 | 리듬 끝 3,221 + 틀 끝 24 |

`character_golden` 은 틱마다 캐릭터 포즈를 기록하므로 시작 프레임이 당겨지면 해시가 바뀐다. 옛 코드에서 PREROLL 만 60 → 26 으로 바꿔 돌린 해시가 새 해시와 같아(위 표 "같음"), 캐릭터 런타임(`lib/character`)과 mg1801 포즈 경로는 바뀌지 않았음을 확인했다.

**시험(노드).** `test_mg1801` 97/0(옛 84 + 틀 단계 대응·단계 11 두 프레임·갈래 B·나갈 때 White·기록 byte·리믹스 RequestReturnScene·프리 플레이 리듬 설정·설정 전달·acc 입력·결정성·정적 검사 13), `test_mgscene` 79/79(옛 69 + acc 전달·직접 와이프 20·RequestReturnScene·judge·byte 3·더미 결정성·정적 검사), `test_mg_freeplay` 13/13, `check_logic` mg1801 3,245 프레임 같음.

#### 12.12.8 사용자 확인 필요 (이 절)

| 항목 | 정한 것(원본 쪽) | 이유 |
|---|---|---|
| 한 판 끝 기록 writer | `FUN_71001f271c` 규칙 | 같은 칸을 쓰는 유일한 판독 함수지만 호출자 미확정(mgm01_freeplay §11-1) |
| PlayerList 순서(rank/WinLose byte 칸) | PlayerID 순 | `GetPlayerList(…,1)` 목록 종류 1 의 순서 미판독. mg1801 은 GameRule 10 이라 영향 없음 |
| 플레이 횟수 +1 자리 | 결과가 돌아오면 목록 페이지가 | 원본 save 사건(FUN_71002dbb80) 처리 미구현 |
| 사운드 관측의 결정성 | 입력 기록에 넣어 재현 | 원본도 시퀀서 값을 읽는다. 온라인 합의 방법 미정 |
| 설명 요청(callInst) | 전달만, P 거짓 | mgInst 설명 장면 미구현 |
| 리듬 쿠킹 2번째 이후 OnGameInit 대기 | 없음(바로 1) | 웹엔 앞 게임 메인 BGM 이 이어지는 코스 실행이 없다 |
| 틀 단계 16 의 소리 그룹 0x20 정지 | 틀 BGM·징글만 멈추고 게임 소리(리듬 종료 BGM·앰비언트)는 화면을 버릴 때 멈춘다 | 웹 소리 그룹 대응 미구현 |
| 낡은 코드 주석 | 고치지 않았다(주석 임의 추가·삭제 금지 규칙). 옛 PREROLL·`stepFrame`·흐름 번호 12/13 을 설명하는 줄이 남아 있다: `app/minigame/kit/rhythm/scene.ts` 머리 17·22~23행과 `beginFrame` 위 문서 주석·`onGameFinish` 문서 주석 끝 줄, `app/minigame/mg1801/logic/game.ts` 머리 5~10·17행, `app/minigame/kit/rhythm/types.ts` `RmSceneState.flow`, `app/minigame/kit/rhythm/data.ts` `PREROLL_FRAMES`·`gameWork.ts` `prerollFrames`(이제 읽는 곳 없음), `script/game.ts`·`script/main.ts` 머리의 `logic.step` 설명 | 고칠지 사용자 결정 |

보충(2026-10-09, [../engine/16_save.md](../engine/16_save.md) §7): "플레이 횟수 +1 자리" 해소 — 이 장면의 `save` 사건을 `script/mgrun.ts` `MgRunInit.save` 가 받는다. 단계 11 → `playCount(참가자)`(FUN_71002db9f0 규칙: 사람·참가·세이브 있는 칸만 +1, 웹은 1P = 칸 0 만 세이브), 단계 16 → SaveRequest(공용 저장 요청 수명). 목록은 `settlePlayResult(…, countedByScene)` 로 다시 세지 않는다. 단계 16 sub 1 의 IsProcessing 대기는 틀에 넣지 않았다(웹 기록이 페이드 안에 끝나고 로직이 저장을 읽지 않게, 16_save §9). 저장 고리 있음/없음 로직 같음: `tools/test_save.ts` 7절.
