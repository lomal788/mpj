# 15. 화면 전환(와이프·페이드) 공용 모듈

화면마다 따로 만들던 페이드·와이프를 원본 `bq::WipeModule` 하나로 모았다. 코어는 `script/game/lib/transition/`(import 0)이고, 그리기는 DOM 어댑터 `script/game/lib/transition-dom/`이 맡는다. mpj 앱 연결은 `script/view/appTransition.ts`, 시험은 `tools/test_transition.ts`다.

## 1. 원본 계약 [판독]

근거: `analysis/decomp/logic1801_main1.c`(FadeOut·FadeIn·IsPlayingFadeAnim·IsFinishedFadeOut), `analysis/decomp/transition_wipe.c`(새로 디컴파일: 생성자 `FUN_710029c710`, SetVisibleForce, Get/SetLastUsedWipeType, GetAnimFrame, GetDrawPriority, SetPauseLevel, MgWipeModule::IsPlayingFadeAnim/IsFinishedFadeOut), `core_b1.c` SceneBase::UpdateMain, 호출부 어셈블리(`plaza_menu00_c_dis.c`, `mgmet_stage2_dis1.c`, `mgm01_dis_boot.c`, `mgC_mg0508_dis.c`).

| 항목 | 원본 |
|---|---|
| 인스턴스 | `SingletonTemplate<bq::WipeModule>` 하나다. 앱 수명 동안 살아 있고 장면이 바뀌어도 상태가 유지된다. 엔티티 하나에 `ComGuiLayout("Parts.lyt", "wipe.bflyt")`를 붙여 **기본 오버레이 그래픽 층**(`GetDefaultOverlayGraphicsLayer`)에 둔다. DrawPriority는 0x9A00이다 |
| 부팅 상태 | 생성자가 `FadeOut(Black, 1.0)` 뒤에 `SetFrame(GetFrameMax)`를 부른다. 그래서 **Black으로 덮인 채** 시작한다. 마지막 종류(+0x50)의 첫값은 −1이고, 생성자 안에서 0으로 바뀐다 |
| `FadeOut(type, speed)` | `Wipe<종류>_out`을 처음부터 재생하고 `AnimationSlot::SetSpeed(speed)`를 건다. 다음 애니로 `Wipe<종류>_normal`을 예약하고(Enqueue) +0x50 = type으로 둔다. CrossFade는 장면 0 화면을 렌더 타깃에 담아 `P_WipeCrossFade_00`에 텍스처로 놓는다 |
| `FadeIn(type, speed)` | `Wipe<종류>_in`을 처음부터 속도 speed로 재생하고 +0x50 = type으로 둔다 |
| 인자 | s0 = **속도**, w1 = 종류다. 종류 문자열 표 @0x19df328의 순서는 Black 0 · White 1 · CrossFade 2 · Loading 3이다(main.decomp.bin에서 확인). **"1.0초"로 적혀 있던 값은 모두 속도**다. 애니가 20프레임이므로 속도 1.0 = 20프레임, 0.5 = 40프레임이다 |
| `IsPlayingFadeAnim` | 현재 애니 이름에 "normal"이 들어 있으면 거짓이다. 그 밖에는 슬롯 재생 상태가 3(끝)이 아니면 참이다 |
| `IsFinishedFadeOut` | 현재 애니 이름에 "normal"이 들어 있으면 참이다 |
| `SetVisibleForce(on, type)` | on이면 `Wipe<종류>_normal`을 바로 재생해 즉시 덮는다. off면 레이아웃을 숨긴다. 어느 쪽이든 +0x50 = type이 된다 |
| `GetLastUsedWipeType` | +0x50을 돌려준다. FadeOut·FadeIn·SetVisibleForce가 이 값을 바꾼다 |
| `MgWipeModule` | flag 0(설명 화면 P)이면 SystemCallBack으로 넘기고 직접 그리지 않는다. 그 밖에는 WipeModule을 그대로 부른다 |
| 장면 규칙 | `SceneBase::UpdateMain` 단계 2는 장면 시작 때 `FadeIn(GetLastUsedWipeType, 1.0)`을 부른다. 단계 4는 장면을 바꾸기 전에 `FadeOut(White, 1.0)`을 부르고 끝날 때까지 기다린다. 둘 다 +0xE3(페이드 사용)일 때만 하며, `SetFadeEnable(false)`로 끌 수 있다(기구 출발이 이렇게 끈다) |
| 일시정지 | `SetPauseLevel` = 엔티티 PauseLevel. 웹은 로직 소유자가 스텝을 멈추면 같은 효과가 난다 |

### 1.1 레이아웃 `wipe.bflyt` [데이터]

원본 `extracted/bea/bq.nx.bea/Parts.lyt`에 들어 있다. `assets/mgscene/ui.json`에는 Black·White만 변환되어 있다.

| 종류 | 그림 | out | normal | in |
|---|---|---|---|---|
| Black | `P_WipeBlack_00` 1920×1080, 정점색 #000 | 20f, 알파 0→255 | 255 | 20f, 255→0 |
| White | `P_WipeWhite_00`, #fff | 20f | 255 | 20f |
| CrossFade | `P_WipeCrossFade_00`, 담은 화면 | **1f** | 255 | 20f |
| Loading | `P_WipeLoading_00` #000 + `T_text_00`(빈 글자, 30f 깜박임) | 20f | 255 | 20f |

- 움직이는 것은 종류마다 부모 페인 `N_Wipe<종류>_00` 하나의 FLVC 알파(target 16)뿐이다. hermite 기울기 ±12.75 = 255/20이라 곡선은 **직선**이다.

### 1.2 사용처의 종류 [판독]

| 호출부 | 종류 | 속도 |
|---|---|---|
| menu00 기구 선택·이륙·건너뛰기·세션 | White(1) | 1.0 / 끝 0.5 / 세션 0.5 |
| menu00 일부·mgmcommon 하나 | CrossFade(2) | 1.0 |
| 캐릭터 선택·인원 설정 | White, 덮기는 `SetVisibleForce(true, White)` | 1.0 |
| 항구 mgmet | 마지막 종류 | 1.0 |
| 미니게임 틀 MinigameFlow·결과 무대 | out White, in 마지막 종류 | 1.0 |
| mg0508·mg0122 등 게임 | White | 1.0 |

- **정정**: 지금까지 웹은 미니게임 틀을 Black, 광장·항구·결과를 검은 막으로 그렸다. 원본은 거의 전부 **White**다.

### 1.3 화면 담기와 와이프

- 원본의 와이프는 오버레이 층에 있다. CrossFade가 담는 것은 장면 층(`GetScene(0)`)이다. 그래서 장면 담기(mg0122 사진 등)에는 와이프가 들어가지 않는다 [추정: 사진 담기 경로가 장면 층 렌더 타깃이라는 것까지만 확인].
- 웹도 같다. DOM 오버레이는 WebGL 캔버스 밖에 있으므로 `readPixels`·렌더 타깃 담기에 찍히지 않는다.

→ 정리본: [render_unify.md](render_unify.md) §7.2·§9
## 2. 이전 전 구현(조사 표)

| 곳 | 방식 | 시간 단위 | 색·곡선 | 화면이 바뀌면 |
|---|---|---|---|---|
| `app/scene/world/mgmet/fade.ts`·`hub.ts` | Render2D 사각형(LayoutInst) | 초(dt 누적), 1.0 s = 60f | 검정, 직선, 지금 알파부터 | 허브와 함께 사라짐 |
| `app/scene/world/plaza/balloon.ts` `Fade` | DOM div(ctx.overlay, z 50) | 초, 1.0/0.5 s = 60/30f | 검정, 직선 | dispose 때 div 제거 → 다음 화면이 갑자기 보임 |
| `app/minigame/frame/scene/ui.ts` `MgWipe` | 원본 wipe 레이아웃 애니(lyt, HUD 캔버스) | 속도 1.0 = 20f | Black 고정(종류 무시), 원본 키 | 장면과 함께 사라짐, 처음엔 강제로 덮음 |
| `mgresult_page.ts` veil | DOM div | 초, 1.0 s = 60f | 검정, 직선 | 페이지와 함께 |
| `app/minigame/frame/result/stage.ts` | 호스트 `fade(dir, sec)` 호출 | 틀 안 = 속도, 단독 = 초 | 호스트 몫 | — |
| `app/scene/menu/modeselect/screen.ts` | 그림 없음, `DECIDE_HOLD` 60f 유지 [근사] | 프레임 | — | 끊김 |
| `app/minigame/mg1801` logic+view | 로직 frame−start, view가 lyt로 `WipeWhite_*` | 20f | White, 원본 키 | 게임과 함께 |
| `main.ts`·`ui_main.ts` 흐름 | 없음(바로 바꿈) | — | — | — |
| `charselect/preview3d.ts`·`types.ts`, `mgmcommon/types.ts`, `charselect_page.ts` | **해당 없음**: 모션 crossfade·BGM 페이드다 | — | — | — |

## 3. 코어 API(`script/game/lib/transition/index.ts`, import 0, 할당 0)

- 상수: `WIPE_BLACK/WHITE/CROSSFADE/LOADING`, 상태 `OPEN 0 · CLOSING 1 · CLOSED 2 · OPENING 3`, `WIPE_FRAMES`·`WIPE_KEYS`(원본 키), `hermite(keys, f)`.
- `class Transition`
  - `fadeOut(type, speed=1)`, `fadeIn(type=lastType, speed=1)`: 원본처럼 늘 처음부터 재생한다. 그래서 중간에 방향을 바꾸면 반대 애니의 처음으로 건너뛴다. 이미 닫혀 있는지는 부르는 쪽이 `closed`로 거른다(원본과 같음).
  - `fadeOutSec/fadeInSec(type, sec)`: 웹 편의 함수다. 속도 = 길이/(초×60).
  - `cover(type)`·`clear(type)` = SetVisibleForce(true/false).
  - `step()`: 1/60초 한 번 진행한다. 길이에 닿은 스텝에서 닫힘·열림으로 바뀐다(애니 슬롯을 직접 묻는 원본 규칙).
  - `playing`(IsPlayingFadeAnim), `closed`(IsFinishedFadeOut), `open`, `lastType`, `alpha()`(원본 키로 계산한 0~1), `serial`(전환을 시작할 때마다 +1).
  - `whenIdle(cb)`·`wait()`: 완료를 기다린다. `copyFrom`·`set`은 외부 상태를 그대로 놓는다.
  - `follow(src)`·`unfollow(src)`·`advance()`: 앱 인스턴스가 로직 소유자를 비추게 한다. 비추는 동안에는 스스로 진행하지 않는다.
- `class LogicTransition(target)`: 로직 시간으로 진행하는 소유자용이다. 처음 fade·cover·clear를 부를 때 target(앱 인스턴스)의 상태와 마지막 종류를 이어받는다. 그때부터 target이 이 인스턴스를 비춘다. 소유자가 `step()`을 부르고, 끝나면 `release()`로 마지막 상태를 target에 넘긴다.
- `appTransition(key='__transition')`: 앱에 하나만 두며 globalThis에 둔다(ddalkkakrider 번들 관례).
- `TransitionDriver(t, clock{now, request}, draw, maxSteps=4)`: 주입받은 시계로 1/60 고정 스텝을 돌리고, 그리기마다 draw를 부른다.

**진행 게이트 규칙.** 미니게임 틀처럼 단계 진행에 쓰는 와이프는 앱 시계로 돌리지 않는다. 틀이 자기 `LogicTransition`을 로직 틱(`uiTick`)에서 스텝한다. 게이트가 닫히면 로직이 멈추고, 앱 화면도 그 상태 그대로 멈춘다(minigame_scene.md §12 "게이트가 닫힌 동안의 2D 애니").

**판정 규칙 두 가지.**
- 틀 `MgWipe`는 코어 위의 얇은 부품이다. 상태 0~3을 자기 틱의 첫머리에 판정한다(§12 컴포넌트 규칙). 그래서 끝을 보는 시점이 코어보다 1틱 늦다(in·out 21틱). test_mgscene의 22 = 1 + 20 + 1과 같다.
- mg1801은 코어를 직접 쓴다(20틱 = 기존 `frame − start < 20`).
- 두 규칙이 1프레임 다른 것은 이전부터 있던 차이다. 어느 쪽이 원본과 같은지는 판독하지 못했다(사용자 확인 필요 §8).

## 4. 그리기 어댑터 — DOM 우선

| 종류 | DOM으로 원본과 같게 | 방법 |
|---|---|---|
| Black·White | 같다 | div 하나의 `background`(#000/#fff)와 `opacity` = alpha(). 원본도 단색 1920×1080 사각형의 페인 알파다 |
| Loading | 칠은 같다, 글자는 미판독 | #000 칠. `T_text_00`은 실행 때 넣는 문자열이라 그리지 않는다 [추정: 빈 글자] |
| CrossFade | 조건부 | 전환을 시작할 때 `capture()`(WebGL 캔버스 등)를 `<canvas>`에 담아 opacity로 그린다. capture가 없으면 그리지 않는다. HTML UI는 담지 못한다(웹 한계). 지금 웹 사용처는 없다 |

- render2d·lyt 어댑터는 만들지 않았다. 네 종류 모두 단색 또는 그림의 알파여서 DOM으로 원본과 같게 그려지기 때문이다.
- 시간은 CSS transition·animation에 맡기지 않는다. 코어가 정한 값을 그리기마다 style에 쓰기만 하고, 바뀐 값만 쓴다.
- 오버레이는 앱 화면 상자(`.jw-stage`) 맨 위에 div 하나만 둔다(z-index 1000). `pointer-events: none`이고 `opacity`·`visibility`만 바꾸므로 레이아웃 재계산이 없다. `will-change: opacity`는 전환 중에만 건다.
- 화면(페이지)마다 렌더러가 달라도 이 div는 그대로 남는다. 그래서 전환 중에 페이지가 바뀌어도 끊기지 않는다.

## 5. mpj 연결(`script/view/appTransition.ts`)

- `installTransition(stage)`: `main.ts`·`ui_main.ts`가 부팅 때 부른다. rAF·performance.now 시계를 쓴다.
- `sceneIn()`: SceneBase 단계 2를 웹으로 옮긴 것이다. 다음 때 부르며, **닫혀 있을 때만** `FadeIn(마지막 종류, 1.0)`을 한다.
  - 흐름의 새 페이지가 준비됐을 때(`flowStep`)
  - 게임이 시작될 때
  - 목록으로 돌아올 때
  - 흐름이 끝날 때
- `sceneOut()`: 단계 4(`FadeOut(White, 1.0)` 끝까지). 이미 닫혀 있거나 로직 소유자가 잡고 있으면 바로 끝난다(두 번 덮지 않음). 흐름에 거는 순서는 §6.1.
- `logicWipe()` = `new LogicTransition(appTransition())`.
- 부팅 상태(2026-10-09 사용자 결정 = 원본대로): `installTransition` 이 `bootTransition()` = `cover(Black)` 로 **Black 으로 덮인 채** 시작한다. 첫 화면이 준비되면 `sceneIn` 이 `FadeIn(마지막 종류 = Black, 1.0)`. 첫 화면 준비가 늦어도 로딩 표시는 하지 않는다(덮인 화면 유지 = loader_manager.md §2.3 과 같은 방침). 화면 상자 안 안내 글자(`.jw-msg`)는 덮개 아래에 있어 덮인 동안 보이지 않는다 — 오류·흐름 끝은 `sceneIn` 으로 연다.
- `dev/ui.html` 개별 화면도 **같은 규칙**: 부팅 Black 덮음 → 화면 준비 뒤 `sceneIn`. 화면 바꾸기(시작 버튼) = `sceneOut` → 이전 화면 정리 → 새 화면 준비 → `sceneIn`. 화면이 스스로 끝나면 다음 시작까지 덮인 채(원본도 다음 장면까지 덮개 유지). '그만' 버튼 = `sceneOut` → 정리 → `sceneIn`(빈 무대와 안내 글자를 보이려는 시험 페이지 편의 [웹]). 판단: dev/ui.html 은 시험 페이지지만 화면마다 원본 장면 하나를 그대로 띄우는 곳이라, 장면 들고 남을 앱 흐름과 같게 두어야 화면별 전환을 거기서 확인할 수 있다.

## 6. 이전 표(전 → 후)

| 곳 | 후 | 종류 | 시간(프레임) 전 → 후 |
|---|---|---|---|
| mgmet hub | `Transition`(주입, 페이지 = logicWipe), `fade.ts` 삭제(scratchpad) | 마지막 종류 | 60 → **20**(속도 1.0) |
| 광장 기구 | `LogicTransition(appTransition())`, 기존 Fade 클래스 삭제 | White | 선택 60→20, 이륙 in 60→20(닫혀 있을 때만), 끝 30→**40**, 건너뛰기 60→20, 세션 30→40 |
| 미니게임 틀 MgWipe | 코어 위 부품. 레이아웃 층은 지우고 앱 DOM이 그린다 | out White, in 마지막 | 20 → 20(판정 규칙 그대로) |
| 결과 무대 단독 페이지 | logicWipe, veil 삭제 | out White, in 마지막 | 60 → 20 |
| 모드 선택 결정 뒤 | `opts.wipe.fadeOut(White, 1.0)` 끝 → 끝냄, `DECIDE_HOLD` 삭제 | White | 60 → 20 |
| mg1801 | 로직 = 자기 `Transition`(frame++ 직후 스텝), view = 앱 인스턴스가 비춤, lyt wipe 그리기 삭제 | White | 20 → 20 |
| 흐름(main.ts) | 새 화면 준비 때 sceneIn | 마지막 | 없음 → 20(닫혀 있을 때만) |

- 셸 경계: 이 코어도 assetcore처럼 import 0인 공용 lib다. 그래서 `app/minigame/frame/scene`·`mgmet`가 import한다(mgm_common.md §9.1 lib 예외). `test_mgscene` 9절과 `check_mgmcommon`의 허용 목록에 한 줄씩 넣었다. `app/scene/menu/modeselect`는 구조 타입 `wipe` 옵션만 받는다(import 없음).

### 6.1 장면 들고 남 순서(2026-10-09, 원본 SceneBase::UpdateMain 단계 4 → 2)

순서: 장면 끝 → **`await sceneOut()`**(White 20f, 이미 덮였으면 바로) → 이전 화면 정리(캔버스·렌더러 지움, 광장 렌더러는 앱 수명이라 화면 밖으로 떼기만 — loader_manager.md §14) → 다음 화면 준비(덮인 채, 로딩 표시 없음) → **`sceneIn()`**(마지막 종류로 20f). 정리는 sceneOut 이 끝나기 전에 부르지 않는다.

| 전환 | 나가는 쪽 | 덮는 것 | 들어오는 쪽 sceneIn |
|---|---|---|---|
| 부팅 → 인원 설정·게임 | — | 부팅 Black 덮음 | `flowStep`·`start()` 준비 뒤 (Black) |
| 인원 설정 → 캐릭터 선택(같은 장면 안 UI) | setplayer `onCharSelect` | `sceneOut` White(원본 `charsel_setting_player.c` FadeOut(1.0, 1)) | 캐릭터 선택 준비 뒤 |
| 캐릭터 선택 → 인원 설정 | charselect `onFinished` | `sceneOut` 뒤 정리 | 인원 설정 화면 다시 보일 때 |
| 인원 설정 → 광장 | main `onDone` | `sceneOut` | `flowStep('plaza')` |
| 광장 → 모드 메뉴 | 광장 기구(자체 FadeOut White 0.5, `SetFadeEnable(false)` 판독 @0x7100047a6c) | 이미 덮임 → sceneOut 바로 | `flowStep('modeselect')` |
| 모드 메뉴 결정 → 항구/광장 | 모드 선택(자체 White 1.0) | 이미 덮임 | 다음 화면 |
| 모드 메뉴 취소 → 광장 | modeselect `onFinished` | `sceneOut` | 광장 |
| 항구 → 프리 플레이 목록 / 모드 메뉴 | mgmet 끝(결과 + 20f) | `sceneOut` | 다음 화면 |
| 목록 → 게임 | `playFromList` 시작 | `sceneOut` 뒤 목록 숨김 | `start()` 실행 |
| 게임 → 목록 | `playFromList` 끝 | `sceneOut`(mg1801 자체 와이프로 덮였으면 바로) 뒤 `dispose()` | 목록 다시 보일 때 |
| 목록 → 항구 | main `onDone` | `sceneOut` | 항구 |
| `?charselect=1` 캐릭터 선택 → 게임 | charselect `onFinished` | `sceneOut` | `start()` |
| dev/ui.html 화면 바꾸기 | `start()` | `sceneOut` → `stop()` | 새 화면 준비 뒤 |

- 자체 와이프 장면(광장 기구·모드 선택 결정·미니게임 틀·결과 무대·mg1801)은 끝에 이미 덮였거나 로직 소유자가 잡고 있어 sceneOut 이 새로 덮지 않는다(이중 덮기 0, test_transition 11절).
- 전환당 프레임: 열린 장면 끝 → 20(out) + 준비 시간 + 20(in). 자체 와이프 장면 → 자체 길이 + 0 + 20.

- 다음 단계:
  - 캐릭터 선택 쪽 `SetVisibleForce(true, White)`(즉시 덮기) 갈래는 원본 화면 흐름을 더 판독해야 한다.
  - 광장 가이드 설정의 1.0 페이드를 옮긴다(가이드 서비스 미구현).
  - CrossFade의 capture를 연결한다.

## 7. 시험(`tools/test_transition.ts`)

다음을 확인한다.

- 상태 전이·시간(속도 1.0 = 20, 0.5 = 40, 초 1.0 = 60, CrossFade out 1)
- 원본 키·길이 = ui.json
- 마지막 종류
- 중간 역전환
- 완료 대기
- 앱 인스턴스·주입 시계·LogicTransition으로 화면이 바뀌어도 이어지는지
- 틀·mg1801 판정 규칙
- DOM style(가짜 document)
- 코어 import 0
- 사용처 시간값 전/후 표

## 8. 사용자 확인 필요

1. **색이 바뀐다**: 미니게임·광장·항구·결과·모드 선택의 와이프가 검정에서 **흰색**으로 바뀐다. 원본 호출 인자 w1 = 1과 종류 표 @0x19df328 = White를 근거로 판독했다.
2. **길이가 바뀐다**: 광장·항구·결과 단독·모드 선택이 "초"로 읽었던 1.0/0.5를 **속도**로 바꿨다. 1.0 s(60f)는 20f가 되고, 0.5 s(30f)는 40f가 된다. `test_plaza_actors`의 기대값 30을 40으로 고쳤다(근거: @0x7100047a74 `fmov s0,#0.5; mov w1,#1; bl FadeOut`).
3. **판정 시점이 1프레임 다르다**: 틀 MgWipe는 21틱 뒤에 끝을 보고, mg1801·코어는 20틱 뒤에 본다. 엔진에서 애니 슬롯을 갱신하는 순서를 판독하지 못해서 둘 다 그대로 두었다.
4. ~~부팅 상태~~ → 원본대로 Black 덮음으로 정함(2026-10-09, §5).
5. **Loading 글자**: `T_text_00` 문자열을 판독하지 못했다. CrossFade의 화면 담기는 아직 연결하지 않았다.
6. ~~장면을 나갈 때의 페이드~~ → 원본대로 흐름에 걸었다(2026-10-09, §6.1). 남은 확인: 인원 설정 ↔ 캐릭터 선택은 웹이 같은 장면 안 UI 로 띄우므로 원본처럼 White 페이드를 넣었다 — 원본 화면과 다르면 알려 주세요.
