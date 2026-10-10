# 컨트롤러 등록·입력 확인 화면 — 원본 시스템 애플릿과 웹 대체 설계

2026-10-10. 상태: **첨부 화면 분류·MPJ 호출 경계·HidModule 인원 인자·체감 안내 장면 판독 완료. 웹은 간이 플레이어 배정 구현, 키 설정·실시간 입력 확인 미구현.**

첨부 화면은 MPJ 안에서 표시되는 Nintendo Switch의 **컨트롤러 지원 애플릿**으로 판단한다. MPJ가 요구하는 조작 형태에 맞춰 컨트롤러를 등록하고, 사용할 입력원을 결정하는 화면이다. 키보드 키를 바꾸거나 모든 버튼·스틱의 값을 검사하는 게임 자체 테스트 화면과 구분한다.

확정 수준: **[화면]** 사용자 첨부 관찰, **[판독]** 디컴파일 C, **[판독: 기존]** 이미 분석한 문서 재사용, **[데이터]** 추출 데이터, **[코드]** 현재 웹 확인, **[설계]** 웹 제안, **[미확정]** 확인하지 못한 경계. 원본 실행·브라우저 실행·픽셀 대조는 하지 않았다. 주소는 main과 `gyroPadChange.nro`를 구분한다.

## 1. 첨부 화면과 기능의 구분

![사용자 제공 컨트롤러 등록 화면](../../../analysis/controller_support/controller_support_reference.png)

| 영역 | 화면에서 확인한 내용 | 의미와 확정 범위 |
|---|---|---|
| 위 | 단일 Joy-Con 두 종류, 두 짝·Pro 형태에는 사선, “1개로 조작합니다” | [화면] 단일 Joy-Con 조작을 요구하는 상태. 특정 게임 ID·MPJ 내부 style 번호까지 사진만으로 정하지 않음 |
| 가운데 위 | “사용하려는 컨트롤러의 L + R을 눌러 주십시오.” | [화면] 사용할 기기를 등록하는 안내. 가로 Joy-Con 측면 버튼 대응·동시 입력 판정은 시스템 내부 범위 |
| 가운데 | 컨트롤러 표시를 위한 빈 사각 영역 | [화면] 촬영 시 표시가 비어 있음. 슬롯 수·선택 상태·표시 애니메이션을 사진에서 만들어내지 않음 |
| 가운데 아래 | “준비되면 A를 눌러 주십시오.”, 흐리게 표시 | [화면] 등록 후 확인 안내. 이 이미지의 정확한 활성 조건은 시스템 실행 대조 전까지 미확정 |
| 아래 | −/+ 연결 문제 안내와 “길게” 표시 | [화면] 시스템의 연결 보조 안내. 길게 누르기 시간·정확한 조합·재연결 동작은 미확정 |
| 배경 | 흐려진 게임 화면 | [화면] 시스템 UI가 게임 위에 보임. 흐림 처리·캡처 수명·GPU 처리 주체는 이번 C로 확정하지 않음 |

첨부는 1140×773이며 잘린 캡처다. MPJ의 1920×1080 Lyt 좌표로 직접 환산하지 않는다. 시스템 애플릿의 레이아웃·폰트·이미지를 MPJ의 Parts.lyt에서 찾았다고 주장하지 않는다.

구분해야 할 기능은 세 가지다.

| 기능 | 하는 일 | 원본·현재 웹 |
|---|---|---|
| 입력원 등록·플레이어 배정 | 어떤 기기로 어느 플레이어를 조작할지 결정 | 원본 시스템 애플릿 호출. 웹 간이 배정 있음 |
| 키 설정 | 키보드 키·비표준 패드 버튼을 게임의 A/B/방향 등에 대응 | 웹 설계 문서 있음, 현재 고정 키 배치 |
| 실시간 입력 확인 | 눌린 버튼·스틱 방향·체감 입력이 제대로 들어오는지 표시 | 첨부의 등록 기능과 별개. 현재 웹 제품용 확인 화면 없음 |

“MPJ에는 저 화면이 없는가?”에 대한 답은 **원본 MPJ에서 뜨지만 Switch 시스템이 제공하는 화면**이다. 웹에서는 직접 대체해야 한다. 입력원 배정만으로 키 설정·입력 확인까지 끝난 것은 아니다.

## 2. 근거 자료와 조사 범위

| 자료 | 역할 |
|---|---|
| [setplayer.md](setplayer.md) §6.2·§9.4 | 기존 플레이어 설정의 애플릿 진입·복귀 판독과 웹 대체 규칙 |
| [05_ui_input.md](../engine/05_ui_input.md) §6 | 기존 InputModule·HidModule·패드 형식·boot 설정 판독 |
| [input_web.md](../engine/input_web.md) §7 | 기존 웹 키 등록 마법사·프로필 설계. 구현 완료 자료가 아님 |
| [minigame_scene.md](minigame_scene.md) §5.3·§8, [mgm01_freeplay.md](mgm01_freeplay.md) §3.2 | 기존 미니게임 진입과 체감 게임의 스타일 전환 조건 |
| [mginst.md](mginst.md) | 게임 설명·연습·± 준비 화면. 컨트롤러 등록 애플릿과 별개 |
| [ui_input.c](../../../analysis/decomp/ui_input.c), [ui_hid_core.c](../../../analysis/decomp/ui_hid_core.c) | 기존 InputModule 위임·스타일 전환 C |
| [controller_support_main.c](../../../analysis/decomp/controller_support_main.c) | 이번 추출: HidModule 위임·min/max getter·ShowControllerSupport 호출, 11함수 |
| [controller_support_assign.c](../../../analysis/decomp/controller_support_assign.c) | 이번 추출: 등록 요청·표시 상태·최소 배정 검사·인원 setter, 4함수 |
| [controller_support_flow.c](../../../analysis/decomp/controller_support_flow.c) | 이번 추출: 애플릿 인자 준비·결과 알림 경로·공용 Joy-Con 안내, 9함수 |
| [gyroPadChange.nro.c](../../../analysis/decomp/gyroPadChange.nro.c) | 이번 추출: 체감 입력 안내 장면 전체, 219함수. 실제 조사 중심은 SetupGame·SyncedSetupGame·GameFlow |
| extracted/romfs/boot.nbinit | 입력 모듈 초기 설정 |
| extracted/message/koKR/system.json | MPJ 자체 “세로 잡기 / 가로 잡기 / 스트랩” 안내 메시지 |
| [evidence.json](../../../analysis/controller_support/evidence.json) | C 헤더 수·색인 추가 수·이미지 해시·한국어 메시지 검색 결과 |

시스템 애플릿 자체의 실행 파일·C·레이아웃은 이번 자료에 없다. MPJ가 넘기는 인자와 결과 소비까지 조사한다. 외부 `nn::hid::ShowControllerSupport` import stub을 애플릿 구현으로 취급하지 않는다.

## 3. 원본 호출 구조

```text
MPJ 장면 / 플레이어 설정
  ├ SetControllerPlayers(min, max)
  ├ SetControllerStyle(style)
  └ CallControllerSupportApplet() 또는 HidModule::AssignGameController()
        ↓
nn::bezel::HidModule
  인원·전역 컨트롤러 스타일 설정 → 등록 요청 → 표시 상태 관리
        ↓
nn::hid::ShowControllerSupport(resultInfo, arg)
        ↓
Switch 시스템 애플릿: 사용 기기 등록 → 확인/종료
        ↓
HidModule 결과·배정 상태 → 호출한 MPJ 흐름이 다음 단계 결정
```

[판독] `bex::InputModule::CallControllerSupportApplet` main `71001911dc`는 `HidModule::AssignGameController`로 위임한다. 후자는 main `71007dbd10`에서 `FUN_71007df09c`를 호출한다. InputModule은 시스템 등록 화면을 직접 그리지 않는다.

[판독] `FUN_71007eeba8` main은 작업 객체의 `+0x454` 결과 영역과 `+0x20` 인자 영역을 `ShowControllerSupport`에 넘기고, 반환 코드가 0인지 `+0x450`에 기록한다. 이는 시스템 호출 결과이며, 게임에서 필요한 플레이어 배정이 모두 충족됐다는 판정과 동일시하지 않는다.

[판독] 등록 요청 함수의 즉시 반환은 요청 접수 여부다. `FUN_71007df09c`는 접수 성공 시 관리 객체 `+0x10`에 상태 3을 기록하고, `IsControllerSupportAppletShowing` main `71007dbcc4` → `FUN_71007df324`는 그 상태가 3인지 검사한다. **요청 성공·표시 종료·게임용 배정 충족**은 각각 다른 질의다.

### 3.1 일반 플레이어 설정에서의 소비

[판독: 기존] [setplayer.md](setplayer.md) §6.2의 main `7100347ad0` 경로를 재사용한다.

```text
인원 count > 1
  → min=max=count 설정
  → 최소 배정이 부족하면 style=1, AssignGameController
  → 시스템 애플릿 표시 중에는 Fiber::Wait
  → 종료 후에도 최소 배정이 부족하면 인원 선택 단계 0으로 복귀
  → 충족하면 유저 연동·캐릭터 선택 단계 진행
```

인원 1명에서는 이 단계의 다인 등록 분기를 건너뛴다. **MPJ 전체가 1인 등록 화면을 띄우지 않는다는 뜻은 아니다.** boot 자동 호출·장면별 스타일 전환은 별도다. 첨부가 어느 호출자에서 나온 것인지는 이미지 하나로 확정하지 않는다.

## 4. 인원 인자·스타일의 책임

### 4.1 애플릿 인자 작성

[판독] `SetNumberOfGameControllerPlayers` main `71007dba28` → `FUN_71007e63b8`는 설정 객체 `+0x1B0=min`, `+0x1B4=max`에 저장한다. getter는 `FUN_71007e6c38/40`이다.

[판독] `FUN_71007df0cc`는 `ControllerSupportArg::SetDefault`를 거친 인자에 다음 값을 덮어쓴다.

| 인자 영역 기준 | 기록 값 | 확인 범위 |
|---|---|---|
| +0 | min의 하위 byte | 게임이 요구하는 최소 인원 |
| +1 | max의 하위 byte | 게임이 허용하는 최대 인원 |
| +5 | max==1일 때만 Hid flag 1의 하위 bit, 나머지는 0 | 단일 인원 조건부 플래그. 원본 필드 이름은 C에 없으므로 임의 이름을 붙이지 않음 |

이미 등록 요청 상태 3이면 새 요청을 받지 않는다. `max>=5 && style==2`도 이 함수에서는 요청을 거절한다. 이 예외를 웹의 1~4인 배정 규칙으로 확대하지 않는다. `IsMinimalGameControllerAssigned`는 별도 실제 연결·형태·flag를 검사하므로 웹의 단순 배열 채움과 완전히 같은 내부 계산은 아니다.

### 4.2 컨트롤러 형태와 체감 게임

[판독: 기존] 스타일은 `SetGameControllerStyle` main `71007dbac0` → `FUN_71007e685c`에서 전역 지원 마스크·Joy-Con hold 설정으로 반영된다. 애플릿 인자 작성 함수에서 새롭게 L/R 버튼 판정을 만드는 구조가 아니다.

[판독] 스타일 3·4 경로는 지원 마스크 `0x1A`를 쓰는 기본 분기와, Hid flag 3이 켜졌을 때의 `0x1E` 경로가 있다. hold raw 값은 각각 0·1이다. 이번 문서는 SDK enum 이름을 새로 만들지 않고 raw를 보존한다. 첨부의 제한된 기기 그림을 근거로 **사진이 반드시 style 3 또는 4의 특정 분기라고 확정하지 않는다.**

[데이터: 기존] boot 설정은 `MinPlayer=MaxPlayer=1`, `Style=GameControllerStyle_FullKey`, 자동 컨트롤러 지원 애플릿 시작 true, 1인 휴대 모드 허용 true, `IsAllowJoyDualWhenJoySingleStyle=false`다. debug 키보드 에뮬레이션은 false다. 원본의 debug 키 대응표를 사용자용 키 등록 UI의 존재 근거로 삼지 않는다.

[판독: 기존] 미니게임 생성 경로 main `71002e5540`에서는 분석된 조건이 맞을 때 현재 스타일을 Work에 저장하고, `GyroType>1 ? 4 : 3`으로 전환한다. 생성 조건·복원 범위는 [minigame_scene.md](minigame_scene.md)에 따른다. 이 전환과 브라우저의 체감 입력 생성은 역할이 다르다.

## 5. gyroPadChange는 별도의 게임 안내 장면

[판독: 기존] `MinigameModeScene::CallMinigameScene` main `71003601ac`는 체감 게임이면 `gyroPadChange`, 아니면 설명 설정에 따라 `mgInst` 또는 실제 게임을 호출한다.

[판독] 이번에 추출한 `gyroPadChange.nro`의 핵심 흐름은 다음과 같다.

| 함수 | 주소(gyroPadChange.nro) | 확인한 역할 |
|---|---|---|
| SetupGame | 7100003b70 | 기존 렌더 레이어 clear 값 보관·설정, 장면 표시 준비 |
| SyncedSetupGame | 7100003c50 | GameWork 파라미터·현재 게임의 GyroType 등에 따라 공용 안내 타입 결정, ComUiControllerGuide 생성·In |
| GameFlow | 7100004100 | 페이드인 완료 대기 → 3초 대기 → 게임/설명 장면 호출 또는 호출자 복귀 |

[판독] `ComUiControllerGuide` main `710027ab2c`는 Parts.lyt 기반 **MPJ 자체 안내**다. 타입 0은 세로 안내, 타입 1은 세로+스트랩 안내, 타입 2는 가로 안내로 메시지를 설정한다. `In` main `710027af38`는 레이아웃 표시·normal 애니 등을 처리한다.

| 라벨 | 한국어 데이터 |
|---|---|
| sys_ui_joyconShift00 | 세로 잡기 |
| sys_ui_joyconShift01 | 가로 잡기 |
| sys_ui_joyconShift00_order | 스트랩을 장착해 주세요 |

**첨부의 L+R 등록 애플릿과 이 잡는 방법 안내는 같은 화면이 아니다.** 판독한 gyroPadChange GameFlow에 “L+R이 들어올 때까지 대기”를 추가하지 않는다. 자동 애플릿 호출·컨트롤러 스타일 전환과의 전체 시간 순서를 원본 실행 없이 확정하지 않는다.

GameFlow의 `RequestCallScene`/`RequestReturnScene`은 디컴파일 C에 일부 문자열 인자가 사라져 있다. 기존 호출 문서의 판독을 넘어 새 목적지 문자열을 추측하지 않는다.

## 6. 현재 웹 구현 상태

| 위치 | 확인한 구현 | 부족한 것 |
|---|---|---|
| [applet.ts](../../script/app/scene/menu/setplayer/applet.ts) | ControllerPool: pid→입력원 id, 최소 인원·끊긴 기기 제거. ControllerApplet: A 참가, 2P 이후 B 해제, 1P A 완료·B 취소 | 기기 capability·키 프로필·실시간 입력 표시 |
| [state.ts](../../script/app/scene/menu/setplayer/state.ts) | 인원>1, 배정 부족 시 대체 애플릿을 열고 종료 후 최소 배정 재검사 | 체감 게임별 등록 요구의 공용 처리 |
| [setplayer_page.ts](../../script/setplayer_page.ts) | kb + gpN 목록·프레임별 hold/trig. DOM “컨트롤러 연결”과 플레이어별 배정 표시 | 첨부 구성·L+R 등록·키 변경·스틱/버튼 검사 |
| [input.ts](../../script/view/input.ts) | KeyboardPad 고정 배치, GamepadPad 고정 표준 버튼/축 대응, PadSource | 사용자 키 프로필·비표준 패드 교정 |
| [flow/index.ts](../../script/app/flow/index.ts) | 광장 진입 앞에 setplayer 실행, 반환된 슬롯·이름·패드를 다음 흐름에 전달 | 게임 선택별 입력 확인 화면 연결 |
| [common/input](../../script/app/common/input/index.ts), [motion](../../script/game/lib/motion/index.ts) | PadInput 병합·프레임별 체감 입력 snapshot·공통 체감 계약 | 입력 상태를 보여 주는 사용자용 화면 |

[코드] 현재 기본 키는 WASD/방향키 이동, J=A, K=B, U=X, I=Y, Q=L, E=R, Enter=+, Backspace=−다. `input_web.md`의 Space 중심 프로필·키 등록 마법사는 **현재 코드가 아니라 설계**다.

[코드] 현재 setplayer의 Npad→bex 변환은 A/B·십자·스틱 방향을 다룬다. 그대로 Q+E를 눌러도 이 배정 흐름에서 L+R 등록 이벤트가 되지 않는다. MPJ 원본 애플릿과 웹 대체의 차이로 기록한다.

## 7. 웹에 필요한 공용 입력 확인 화면 [설계]

사용자 요구: **키 입력이 제대로 들어오는지 확인할 화면이 필요하다.** 등록·설정·확인을 공용 입력 화면의 관련 기능으로 제공하되, 결과와 수명은 구분한다. 아직 구현하지 않았다.

| 기능 | 보여 줄 것·받을 결과 | 호출 시점 |
|---|---|---|
| 플레이어 배정 | 1P~4P 입력원·연결 상태, 미배정 칸 | 최초 다인 설정·기기 변경·끊김 복구 |
| 키 설정 | 현재 실제 키 안내, 원하는 키로 변경, 중복 확인·기본값 복원 | 키보드/비표준 패드 설정에서 선택 |
| 입력 확인 | 실제 입력원의 버튼 on/off·스틱 위치·방향·연결 여부 | 설정 완료 전 선택적으로 확인, 설정 메뉴에서 다시 열기 |
| 체감 입력 확인 | 가상 휘두름·기울임 또는 실제 센서의 valid/reset·샘플 상태 | 체감 게임 설명/연습에서 해당 게임에 필요한 경우 |

### 7.1 읽는 계층과 입력 소유권

```text
키보드·Gamepad·터치/모션 어댑터
            ↓ 이번 프레임 1회 수집
입력원별 원시 snapshot → 키 프로필/대응 → PadInput·MotionPacket snapshot
            ├ 공용 배정·설정·입력 확인 UI
            └ 활성 장면/게임에 전달(확인 UI 활성 중에는 gameplay 소비 차단)
```

- 버튼 그림만 따로 추정하지 않고 **실제 게임에 넘어갈 PadInput**을 표시한다. 패드 교정이 필요하면 장치 원시 버튼/축과 변환 결과를 함께 표시한다.
- 입력원별 값을 먼저 확인한다. 현재 MergedPad처럼 키보드와 게임패드를 합친 값만 보면 어느 기기가 반응했는지·배정이 중복됐는지 판단하기 어렵다.
- 체감 UI는 기존 MotionPacket을 표시한다. UI를 그리기 위해 MotionSource.submit()을 한 번 더 호출하면 펄스·샘플 번호를 소비할 수 있으므로, 같은 frame의 snapshot을 공유한다.
- 화면 종료의 확인 입력이 다음 장면에서 A/점프로 재사용되지 않게 입력 경계를 둔다. 구체적으로는 확인에 사용한 버튼 해제 후 새 입력부터 소비하는 계약을 구현 시 정한다.
- 끊김·blur·취소·창 닫기 후에 held 버튼과 임시 등록 상태를 남기지 않는다. 뒤의 게임 장면에 잘못된 입력원을 넘기지 않는다.

### 7.2 원본과 웹의 차이를 드러내기

원본의 단일 Joy-Con 제한은 물리 기기·모션 센서 요구다. 웹 키보드는 그 형태가 아니어도 대응된 게임 입력과 가상 체감 입력으로 사용할 수 있다. 기기 이름만으로 Pro/일반 패드를 차단하는 원본 그림을 웹에 그대로 적용하지 않는다.

키보드에는 L+R 대신 실제 등록 키를 안내하고, 이미 배정된 입력원은 등록 과정을 반복하지 않게 한다. 일반 패드는 필요한 버튼·축 대응을 검사하고, 모바일은 기존 체감 어댑터/가상 패드 계약에 따라 연결한다. 이번 분석만으로 모바일 가상 버튼 UI까지 구현됐다고 보지 않는다.

등록에 사용할 키·완료/취소 방식·키보드 다인 프로필은 [input_web.md](../engine/input_web.md) 기존 설계와 함께 구현 시 확정한다. 이번 문서 작성 때문에 승인을 요청하지 않는다.

### 7.3 구조와 착수 순서

1. 기존 PadInput·MotionPacket 위에 입력원 ID별 snapshot·연결 상태 계약을 정한다. 읽기 횟수와 게임의 입력 소유권부터 고정한다.
2. 현재 ControllerPool/ControllerApplet의 배정 기능을 재사용하고, 공용 입력 화면에서 받을 결과를 정한다. 게임마다 새 배정 규칙을 복사하지 않는다.
3. **고정 키 배치 그대로 버튼·스틱 입력 확인부터** 제공한다. 키 변경 기능이 완성될 때까지 확인 화면을 미룰 필요는 없다.
4. 키 프로필·등록 마법사·비표준 패드 대응을 추가한다. 실제 키 안내를 설명 화면과 공유한다.
5. 체감 게임은 필요한 동작만 검사한다. 센서와 가상 모션의 상태를 구분해 표시한다.
6. setplayer·설정 메뉴·필요한 게임 설명 화면에 연결한다. 매 게임 시작마다 이미 확인한 모든 입력을 강제로 재등록시키지는 않는다.

파일 후보는 `script/app/common/input`의 입력원 연결, `script/view/input.ts`의 실제 입력 어댑터, 새 `script/app/scene/menu/inputcheck/`의 화면·상태·결과 계약이다. **후보이며 해당 폴더를 이번 작업에서 만들지 않았다.** 범용 motion 코어에 MPJ 화면·문구·플레이어 배정 규칙을 넣지 않는다. UI는 기존 공용 layout·렌더 서비스를 사용한다.

## 8. 검증과 구현 후 회귀 기준

### 8.1 이번 분석에서 확인한 것

- [실행: Node] 신규 출력 C **24(main)+219(gyroPadChange)=243헤더**, `no function at`·`decompile failed` **0**, INDEX 신규 파일 행 **243개** 추가. 주소는 모듈·파일과 함께 구분한다.
- [실행: Node] 한국어 메시지 JSON을 파싱해 첨부의 4개 핵심 문구를 검색: **일치 0개**. 이것만으로 시스템 UI를 증명하지 않으며 ShowControllerSupport 호출 근거와 함께 판단했다.
- [실행: Node] 자체 Joy-Con 안내 라벨 **3개** 존재·내용 확인. 첨부 등록 화면 문구와 별개다.
- [실행: Node] 참고 PNG **1140×773**, 사용자 첨부와 SHA-256 동일. 해시는 evidence.json에 기록했다.
- [실행: Node] 문서의 로컬 링크 **25개** 존재, 신규 파일의 INDEX 행 **243개**가 각각 한 번씩 등록된 것 확인.
- [범위] 게임 런타임 수정·원본 실행·브라우저 시험 없음. typecheck·게임 회귀 시험은 문서/C 추출 작업의 검증으로 실행하지 않았다.

추출은 [decompile_guide.md](../analysis/decompile_guide.md)에 따라 수행했다. main은 기존 분석 프로젝트를 readOnly/noanalysis로 사용했다. gyroPadChange는 별도 `ghidra_work/controller_support/controller_support` 프로젝트에 읽기 전용 원본을 새로 import하여 자동 분석·전체 추출했고, 분석 결과만 그 프로젝트에 저장했다. 원본/extracted 자원은 수정하지 않았다.

로그: `web/test/out/controller_support_main_ghidra.log`, `controller_support_assign_ghidra.log`, `controller_support_flow_ghidra.log`, `controller_support_gyro_ghidra.log`. 최초 gyro import는 출력 프로젝트 폴더가 없어 실패했으며 폴더 생성 후 재시도 성공했다. 최종 함수 추출 실패는 0이다.

### 8.2 향후 입력 확인 구현의 Node 회귀 기준 [설계]

| 기준 | 기대 결과 |
|---|---|
| 기기 등록·배정 | 하나의 입력원은 한 슬롯만 조작, 인원 부족 시 완료 불가 |
| 키 설정 | 같은 프로필/플레이어 간 중복 규칙 검증, 취소 시 기존 프로필 유지 |
| 실제 입력 대조 | UI의 버튼·축 상태가 같은 frame 게임 PadInput과 일치 |
| 동시 입력 | 방향+액션을 함께 표시. 키보드 하드웨어 고스팅 자체는 실제 기기 확인 항목 |
| 모션 읽기 | UI와 게임에서 같은 snapshot 사용, UI 표시가 샘플·펄스 소비를 늘리지 않음 |
| 완료 입력 격리 | 화면을 닫은 확인 입력이 다음 장면 액션으로 새 trigger가 되지 않음 |
| 끊김·복귀·취소 | 배정 부족 재검사, held 상태 초기화, 다른 슬롯의 입력 보존 |
| 현재 배정 규칙 | 기존 test_setplayer의 참가·해제·완료·취소 기대값 유지 또는 변경 근거 기록 |

위 표는 **아직 만든 시험이 아니다.** 키보드 고스팅·실기 연결·실제 센서 상태는 Node 가짜 입력만으로 검증 완료라고 하지 않는다.

## 9. 미확정·후속 조사

| 번호 | 미확정 범위 | 처리 |
|---|---|---|
| R1 | 첨부가 boot·기기 부족·스타일 변경 중 어느 호출에서 나온 것인지 | 화면 앞뒤 또는 원본 실행이 있어야 특정. 공용 시스템 등록 화면이라는 분류와 구분 |
| R2 | 시스템 내부 L/R(SL/SR 포함) 입력 판정·확인 활성 조건·길게 누르기 시간 | MPJ main/NRO의 외부 import stub에서 복원할 수 없음. 임의 시간·비트 추가 금지 |
| R3 | 애플릿의 폰트·창·배경 흐림·내부 애니·슬롯 배치 | MPJ Lyt로 확정하지 않음. 웹은 대체 화면 설계로 표시 |
| R4 | 자동 애플릿·스타일 전환·gyroPadChange 안내의 원본 실행상 정확한 시간 순서 | 이번 C의 개별 함수 흐름까지만 확정. gyroPadChange의 3초를 등록 타임아웃으로 해석하지 않음 |
| R5 | 웹 키 프로필·등록 키·다인 입력·체감 검사 범위 | 실제 구현 시 기존 input_web 설계와 사용자 사용 방식에 맞춰 확정 |

이번 대상 중 C가 없어 미완료인 **MPJ 함수 추출 요청 주소는 0개**다. R2·R3은 Switch 시스템 애플릿 내부 자료의 경계이며, 게임 main의 추가 주소를 만들어 Ghidra 요청으로 남기지 않는다.
