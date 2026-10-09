# mgmet — RuleConfigView 규칙 설정 화면

## 1. 기능 개요와 보이는 동작

[판독] `mgmet::RuleConfigView` 전체의 구성·입력·값·잠금·결과를 분석한다. 프리 플레이의 실제 호출/저장 경로를 연결하되 다른 액티비티 내부와 온라인 분기 내부는 제외한다. 허브 진입·첫 설명·인원·mgm01 복귀는 [mgmet_flow.md](mgmet_flow.md)에 정리했다.

[판독] 화면은 여섯 종류의 선택 열과 마지막 “플레이” 열이다. 열 번호는 VS=0, 라운드=1, 스타=2, CPU=3, 미니게임 설명=4, 체감 미니게임=5, 플레이=6. 상하로 값을 바꾸고 좌우로 표시된 열 사이를 이동한다. 값/열 모두 순환하지 않는다. A는 다음 열로 진행하며 플레이에서 A가 시작이다. B는 이전 열로, 첫 열의 B는 취소 결과다.

[판독] 오프라인 프리 플레이는 CPU가 있으면 `[CPU, 설명, 플레이]`, 없으면 `[설명, 플레이]`를 표시한다. 체감·VS·라운드·스타는 표시하지 않는다. 처음 선택은 CPU가 있으면 열3, 없으면 열4다. 설명 기본값 index0=있음, CPU 기본값 index0=쉬움이다. Work 캐시가 유효하면 표시 열의 값을 불러온다.

[판독] 시작과 취소 양쪽에서 CPU/설명 결과를 적용하고 Work/Sync 캐시에 쓴다. 설명 다시 보기는 규칙 창을 Out 후 In하며 기존 커서/값을 유지한다. `Active/Deactivate`와 `In/Out`은 서로 다른 생명주기 동작이다.

## 2. 분석 대상·자료 위치

[데이터] 분석일 2026-10-07, Super Mario Party Jamboree US v0. 원본 실행 대조는 없다. 모듈 접두어가 다른 주소는 같은 수라도 동일 함수가 아니다.

| 자료 [데이터] | 위치/판독 범위 |
|---|---|
| 원본 모듈·목록 | `C:/dev/mpj/extracted/romfs/nro/NX_Release/mgmet.nro`, `analysis/functions/mgmet.nro.tsv`, `main.nso.tsv`, `mgm01.nro.tsv` |
| 기존 C 재사용 [판독] | `analysis/decomp/mgmcommon_mgmet_callers.c`: `Impl::Setup` mgmet @0x710007d4d0, `CpuButton::SetBody` mgmet @0x710007f714, 프리 플레이 호출자 등 |
| 신규 C [판독] | `analysis/decomp/mgmet_stage2.c`: LoadWorkData·SetupMgm·In/Out·Active/Deactivate·Update/GetResult·모든 버튼과 배치; `mgmet_main_work.c`, `mgmet_main_alignment.c`, `mgmet_mgm01_consume.c`: writer/consumer |
| 예외 덤프 [판독: 어셈블리] | `analysis/decomp/mgmet_stage2_dis1.c`, `mgmet_stage2_dis2.c`; 지점/이유 §10 |
| 실제 레이아웃 | `extracted/bea/mgm~mgmet.nx.bea/mgm/mgmet/layout.lyt`, 공용 `mgm~mgm00.nx.bea/mgm/mgm00/layout.lyt` |
| koKR 문구 | `extracted/message/koKR/mgmet.json`, `im_common.json` |
| 변환 결과 [실행: 변환] | `analysis/mgmet_layout/*.json`, `mgmet_panes.txt`, `mgmet_anims.json`, `mgmet_data.txt`, `mgmet_validation.json` |

[판독] 공용 창 생성·텍스트 삽입·레이아웃 재생·SE·입력 owner는 기존 분석을 참조한다(문서 끝 목록). RuleConfigView는 공용 메뉴 격자의 커서 이동을 호출하지 않고 자기 열/값 이동을 구현한다. 공용 `SetupMenu/SetupItemMenu`의 이동 규칙을 여기에 대입하지 않는다.

## 3. 진입점과 호출 흐름

| 원본 심볼 — mgmet 주소 [판독] | 책임/호출 |
|---|---|
| `mgmet::RuleConfigView::RuleConfigView` mgmet @0x710007d468 | Impl 할당/필드 초기화 → `Impl::Setup` |
| `mgmet::RuleConfigView::Impl::Setup` mgmet @0x710007d4d0 | `MGRuleUI` 엔티티, `mgmet_base_rule_00.bflyt`, 일곱 버튼 생성; 공용 mgmet+mgm00 파일 묶음; 초기 엔티티 비활성 |
| `mgmet::RuleConfigView::ConfigInfo::LoadWorkData` mgmet @0x710007d3c0 | 오프라인 Work 캐시, 연결 시 Sync 캐시; valid 여부로 여섯 index 읽기/0 초기화 |
| `mgmet::RuleConfigView::SetupMgm` mgmet @0x710007d938 | 값으로 받은 48바이트 ConfigInfo를 Impl에 전달 |
| `mgmet::RuleConfigView::Impl::SetupMgm` mgmet @0x710007d974 | config 복사 → Activate → 모두 숨김 → Play 표시 → 필요한 열 Setup/Lock → 현재/첫 열 설정 → PlayMove immediate → Alignment 요청 |
| `mgmet::RuleConfigView::In` mgmet @0x710007df10 → `Impl::In` mgmet @0x710007df18 | visible=true; `in`, 다음 `normal`; +0xa0=1 |
| `mgmet::RuleConfigView::Update` mgmet @0x710007e0c0 → `Impl::Update` mgmet @0x710007e0d0 | 배경 위치 갱신 → owner trigger/repeat → 방향/결정/취소/설명 결과 |
| `mgmet::RuleConfigView::Out` mgmet @0x710007dfe4 | +0xa0이1일 때 `out`, +0xa0=0; 엔티티 비활성화와 다름 |
| `mgmet::RuleConfigView::Active` mgmet @0x710007e048 / `Deactivate` mgmet @0x710007e084 | 엔티티 Activate/Deactivate만 수행 |
| `mgmet::RuleConfigView::GetResult` mgmet @0x710007e410 | 표시 flag는 모두0, index는 일곱 버튼 중 여섯 규칙 버튼에서 조회하여 반환 |
| `mgmet::RuleConfigView::~RuleConfigView` — mgmet @0x710007d924 | wrapper Impl 포인터0 → `FUN_7100081798` — mgmet @0x7100081798로 소유 버튼/Impl 해제 |
| `mgmet::Scene::Mgm01SetRuleFlow` mgmet @0x710005e090 | 실제 프리 플레이 구성/반환값 처리/결과 적용/캐시 쓰기 |

[판독] 프리 플레이 호출 순서: config 지역값0 초기화(+0x04만 처음1) → LoadWorkData(모든 index를 캐시 또는0으로 대체) → displayExplain=1, displayCpu=`GetComPlayerCount()!=0` → SetupMgm/In → Update 반복. Update 결과2면 Rule/정보/안내를 내리고 `HowToPlayFlow`를 실행한 후 같은 Rule을 In한다. 결과1/3이면 Out/GetResult/commit 후 각각 활동 결과1/2를 반환한다. 결과0/4는 Wait 후 재시도다.

[판독] `Mgm01SettingUiFlow` — mgmet @0x710005de94도 이 설정 함수를 부르는 별도 UI 헬퍼다. 주 `FreeplayMainFlow` — mgmet @0x710005ddd0의 카메라 대기/출발은 flow 문서 §3·5 참조.

## 4. 구조체·필드·상수 표

### 4.1 소유 객체·Impl·ButtonBase

[판독] 타입은 접근 폭과 C 연산 기준이다. 아래 의미 별칭은 구조체 원본 필드 심볼이 아니라 설명용 이름이다. 생성자에서 값이 안 보이는 필드는 임의 기본값을 붙이지 않는다.

| 객체/오프셋 [판독] | 접근형·초기값 | 쓰는 함수 → 읽는 함수 |
|---|---|---|
| `RuleConfigView+0` | `Impl*`, 생성 때 할당 | 생성자 → 모든 래퍼 |
| `Impl+0..0x17` | 엔티티 핸들(ptr/관리ptr/세대), null/0 | Impl::Setup → SetupMgm/Active/Deactivate |
| `Impl+0x18..0x2f` | 공용 창 핸들, null/0 | Impl::Setup → 애니/페인/텍스트 API |
| `Impl+0x30` | `VsButton*`, null→생성 | Setup → 열0 가상 호출 |
| `Impl+0x38` | `RoundButton*`, null→생성 | Setup → 열1 |
| `Impl+0x40` | `StarButton*`, null→생성 | Setup → 열2 |
| `Impl+0x48` | `CpuButton*`, null→생성 | Setup → 열3 |
| `Impl+0x50` | `MGSetsumeiButton*`, null→생성 | Setup → 열4 |
| `Impl+0x58` | `MGExperienceButton*`, null→생성 | Setup → 열5 |
| `Impl+0x60` | `PlayButton*`, null→생성 | Setup → 열6 |
| `Impl+0x68..0x97` | ConfigInfo 48B, 여섯 s32쌍; 생성자 indexExperience=1, 나머지0 | SetupMgm가 전부 복사 → 표시/SetupBaseBg |
| `Impl+0x98` | s32 선택 RuleType, 생성자 명시 초기화 없음 | SetupMgm/Update → 현재 버튼 접근/좌우 |
| `Impl+0x9c` | s32 첫 열, 생성자 명시 초기화 없음 | SetupMgm → 좌/B 경계 |
| `Impl+0xa0` | u8, 0 | Impl::In=1/Out=0 → Out 중복 요청 억제 |
| `ButtonBase+0` | vtable* | Setup에서 각 파생 vtable 설정 → 이동/본문/잠금 등 |
| `ButtonBase+0x08..0x1f` | 엔티티 핸들 | Impl::Setup에서 공유 엔티티 연결 |
| `ButtonBase+0x20..0x37` | 창 핸들 | Impl::Setup에서 공유 창 연결 → pane API |
| `ButtonBase+0x38` | s32 선택 index, 0 | ButtonBase::Setup/MoveUp/MoveDown → GetSelectIndex/SetBody |
| `ButtonBase+0x3c` | u8 viewOnly, 0 | 모두숨김=0, Round/설명 PlayLock=1 → PlayMove의 다른 열 off 생략 |

### 4.2 ConfigInfo 48바이트

| 오프셋 [판독] | 접근형·뜻 | 허용 표시 값 [판독] | Load 기본/index 범위 [판독][데이터] |
|---|---|---|---|
| +0x00 / +0x04 | s32 displayExperience / indexExperience | 1 표시, 그 외 숨김 | 0 / 0..1 |
| +0x08 / +0x0c | s32 displayExplain / indexExplain | 0 숨김, 1 일반, 2 잠금 표시 | 0 / 0..1 |
| +0x10 / +0x14 | s32 displayCpu / indexCpu | 1 표시, 그 외 숨김 | 0 / 0..3 |
| +0x18 / +0x1c | s32 displayStar / indexStar | 1 표시, 그 외 숨김 | 0 / 0..2 |
| +0x20 / +0x24 | s32 displayRound / indexRound | 0 숨김, 1 일반, 2 잠금 표시 | 0 / 0..2 |
| +0x28 / +0x2c | s32 displayVs / indexVs | 1 표시, 그 외 숨김 | 0 / 0..2 |

[판독] `LoadWorkData`는 표시 flag를 설정하지 않는다. 캐시 미초기화면 index 여섯 개를 0으로 만들며 캐시 valid이면 그대로 복사한다. 값 범위를 clamp하는 코드는 없다. `GetResult`는 config 사본을 반환하는 함수가 아니다. flag를0으로 만들고 각 버튼의 현재 index를 조회한다. 숨겨진 버튼은 SetupMgm에서 index Setup을 하지 않아 이전 값/초기0을 유지할 수 있다.

### 4.3 값 표와 버튼 전 함수군

| 열/버튼 [판독] | MoveUp/MoveDown — mgmet 주소 [판독] | SetTitleText/SetBody/GetPosition — mgmet 주소 [판독] | index → 값 [데이터] |
|---|---|---|---|
| 0 `VsButton` | mgmet @0x710007e4bc / mgmet @0x710007e4e4 | mgmet @0x710007e50c / mgmet @0x710007e59c / mgmet @0x710007e674 | 0→[0,1,2,3], 1→[0,2,1,3], 2→[0,3,1,2] |
| 1 `RoundButton` | mgmet @0x710007ef00 / mgmet @0x710007ef28 | mgmet @0x710007ef4c / mgmet @0x710007efdc / mgmet @0x710007f16c | 0→5, 1→7, 2→10 |
| 2 `StarButton` | mgmet @0x710007f25c / mgmet @0x710007f284 | mgmet @0x710007f2a8 / mgmet @0x710007f338 / mgmet @0x710007f4d8 | 0→3, 1→5, 2→10 |
| 3 `CpuButton` | mgmet @0x710007f638 / mgmet @0x710007f660 | mgmet @0x710007f684 / mgmet @0x710007f714 / mgmet @0x710007f8a4 | 0→쉬움, 1→보통, 2→강함, 3→달인 |
| 4 `MGSetsumeiButton` | mgmet @0x710007f8f8 / mgmet @0x710007f920 | mgmet @0x710007f944 / mgmet @0x710007f9d4 / mgmet @0x710007fb34 | 0→있음, 1→없음 |
| 5 `MGExperienceButton` | mgmet @0x710007fc24 / mgmet @0x710007fc4c | mgmet @0x710007fc70 / mgmet @0x710007fd44 / mgmet @0x710007fedc | 0→있음, 1→없음 |
| 6 `PlayButton` | mgmet @0x710007ff2c / mgmet @0x710007ff30 | 기본 SetTitleText no-op / mgmet @0x710007ff34 / mgmet @0x710008000c | MoveUp/Down no-op, 선택 값 사용 안 함 |

[판독] Up은 index가 max보다 작으면 +1 후 SetBody(withSound=true), Down은 index>0이면 -1 후 같은 호출이다. 경계는 무변경/무음이다. ButtonBase `PlayMove` — mgmet @0x710007e508와 `SetTitleText` — mgmet @0x710007e6f8은 기본 no-op. `GetSelectIndex` — mgmet @0x710007e66c는 +0x38 반환. `Setup` — mgmet @0x710007e6d0는 +0x38에 인자를 쓰고 가상 SetBody(index,false)를 호출한다.

[판독][데이터] VS 표는 mgmet @0x71000e3790의 3×4 s32. `VsButton::SetPlayerInfo` — mgmet @0x710007eb40는 표시 슬롯별 해당 플레이어 order를 찾아 얼굴에 PlayerID를 설정하고 type1이면 `mgmet_rule_ui_teamCpu`, 그 외 order별 `mgmet_rule_ui_teamP1..P4` 라벨을 쓴다. 이것은 화면 배치이며 VS 값이 실제 팀 구성을 저장하는 다른 모드의 흐름은 이번 범위 밖이다.

[판독: 어셈블리][데이터] Round의 Number0 원본 인자가 C에서 빠져 mgmet @0x710007efdc를 확인했으며 표 mgmet @0x71000e37c0=[5,7,10]이다. Star도 같은 이유로 mgmet @0x710007f338~0x710007f3f4를 확인, 표 mgmet @0x71000e37cc=[3,5,10]이다. 저장값은 이 숫자가 아니라 index다.

## 5. 상태 전이와 수명

[판독] RuleConfigView에는 독립적인 숫자 phase switch가 없다. 선택 열 +0x98, 첫 열 +0x9c, In 여부 +0xa0, 엔티티 활성·창 표시·애니가 수명을 구성한다. 다음 상태명은 설명용 `[웹 이름]`이다.

| 상태 [웹 이름] | 진입 조건 [판독] | 매 프레임/호출 동작 [판독] | 전이 조건 [판독] | 다음 상태 [웹 이름] |
|---|---|---|---|---|
| 생성/준비 | 생성자→Impl::Setup | 엔티티/창/버튼 생성, 엔티티 Deactivate | SetupMgm | 구성됨 |
| 구성됨 | SetupMgm(config) | config 복사, Activate, 표시 열/본문/커서/Alignment 요청 | In | 표시 중 |
| 표시 중 | In(+0xa0=1) | Update가 SetupBaseBg 및 입력 처리; in 애니 완료 잠금 없음 | 결과2 / 결과1 / 결과3 | 설명 중 / 시작 결과 / 취소 결과 |
| 설명 중 | 프리 플레이 Update2 | Rule/정보/안내 Out; HowToPlayFlow의 별도 파이버 | 설명 완료; Rule In | 표시 중(커서/값 유지) |
| 시작/취소 결과 | Update1/3 | Rule Out, GetResult, CPU/설명 commit | 호출자 결과 반환 | 허브 출발/선택 복귀 |
| Out 요청됨 | Out, +0xa0=0 | out 애니; 엔티티를 Deactivate하지 않음 | 별도 In / Deactivate | 표시 중 / 비활성 |
| 비활성 | Deactivate | 엔티티 업데이트 비활성; In flag를 지우는 코드는 없음 | Active | 기존 표시 상태를 가진 활성 엔티티 |

[판독] `In`은 항상 visible=true/in→normal을 요청한다. `Out`은 +0xa0 검사로 중복 out을 막는다. `Active`는 In 애니를 시작하지 않고 `Deactivate`는 Out 애니를 시작하지 않는다. 주 프리 플레이는 종료 때 Out 직후 결과를 읽고 이동하며 in/out/press 완료를 기다리지 않는다.

[판독] 소멸 helper `FUN_7100081798` — mgmet @0x7100081798는 Impl+0x60→+0x58→+0x50→+0x48→+0x40→+0x38→+0x30 순서로 각 포인터를0으로 만들고 null이 아니면 vt+0x50을 호출한 뒤 Impl을 해제한다. Play/Experience/Explain/CPU/Star/Round/VS 해제 순서다. 이 helper에는 Out 애니 또는 완료 Wait가 없다.

| 소멸자 [판독] | mgmet 주소 | C의 동작 |
|---|---|---|
| `RuleConfigView::Impl::VsButton::~VsButton` | mgmet @0x710007e6cc | `operator_delete(this)` |
| `RuleConfigView::Impl::RoundButton::~RoundButton` | mgmet @0x710007f258 | 동일 |
| `RuleConfigView::Impl::StarButton::~StarButton` | mgmet @0x710007f524 | 동일 |
| `RuleConfigView::Impl::CpuButton::~CpuButton` | mgmet @0x710007f8f4 | 동일 |
| `RuleConfigView::Impl::MGSetsumeiButton::~MGSetsumeiButton` | mgmet @0x710007fc20 | 동일 |
| `RuleConfigView::Impl::MGExperienceButton::~MGExperienceButton` | mgmet @0x710007ff28 | 동일 |
| `RuleConfigView::Impl::PlayButton::~PlayButton` | mgmet @0x7100080058 | 동일 |
| `RuleConfigView::Impl::ButtonBase::~ButtonBase` | mgmet @0x710007f8f0 | no-op |

### 5.1 SetupMgm의 실제 처리 순서와 잠금

[판독] `InvisibleAllColomnItem` — mgmet @0x710008005c는 x_rule_00..05/x_play_00을 숨기고 버튼 viewOnly를 모두0으로 만든다. index를0으로 리셋하지 않는다. 이어 Play를 표시하고 일반 상태로 본문을 준비한다.

| 처리 순서 [판독] | display 조건 | 버튼 Setup/잠금 | 첫 열 후보 갱신 |
|---|---|---|---|
| 초기값 | Experience 표시 전 | 후보0 | 0 |
| Experience(5) | ==1 | Title, Setup(index) | 5 |
| Explain(4) | ==2 / ==1 | Setup 후 PlayLock / 일반 Setup | 잠금은 유지 / 일반4 |
| CPU(3) | ==1 | 일반 Setup | 3 |
| Round(1) | ==2 / ==1 | Setup 후 PlayLock / 일반 Setup | 잠금은 유지 / 일반1 |
| Star(2) | ==1 | 일반 Setup | **2** |
| VS(0) | ==1 | 일반 Setup | 0 |
| 끝 | 모든 열 처리 후 | current=first=최종 후보, PlayMove(immediate=true), Activate/Alignment | 위 최종 후보 |

[판독] “가장 작은 표시 열 번호”를 계산하는 코드가 아니다. 예컨대 Round와 Star를 모두 일반 표시하고 VS가 없으면 마지막 Star 처리로 first=2가 된다. 모든 규칙 열을 숨기는 입력이면 후보0이 남는데 열0은 숨김이다. 실제 프리 플레이 구성은 Explain이 항상 일반 표시되어 이 두 상황이 생기지 않는다. 다른 임의 ConfigInfo 조합의 타당성은 §11에서 구별한다.

[판독] `ButtonBase::PlayLock` — mgmet @0x710007e6c0는 기본 no-op, `IsViewOnly` — mgmet @0x710007e6c4는 +0x3c 반환. `RoundButton::PlayLock` — mgmet @0x710007f1b8과 `MGSetsumeiButton::PlayLock` — mgmet @0x710007fb80은 viewOnly=1, 해당 열 `lock`, `x_gray_01` 숨김을 설정한다.

[판독] `IsButtonVisible` — mgmet @0x7100081650는 해당 페인의 visibility만 본다. 잠금 여부는 열 탐색/Up/Down에서 검사하지 않는다. `PlayMove`가 비선택 잠금 열의 off 애니를 생략할 뿐이다. 잠금 열이 first보다 앞에 있으면 왼쪽 경계 때문에 접근되지 않지만, “어떤 조합에서도 잠금 값은 절대 변경 불가”라는 일반화는 성립하지 않는다.

### 5.2 3D 대기 지점 표

| 함수 @주소 [판독] | 기다리는 대상·조건 | 3D 없이 필요한 값 |
|---|---|---|
| `RuleConfigView::*` — mgmet @0x710007d3c0~0x7100081650 | **3D 대기 없음**. RuleConfigView 자체에 카메라/NPC 완료 Wait 없음 | 원본에 없는 대기를 추가하지 않음 |
| 진입 호출자 `FreeplayMainFlow` — mgmet @0x710005ddd0 | 규칙 전 `Camera::IsFinished`, 첫 설명 완료 | modeZoomDone; 카메라 길이 [미확정], 설명은 공용 메시지/입력 완료 |
| 시작 후 `FreeplayAfterFlow` — mgmet @0x710005df20 | 1.0초 → 맵 출발 위치 애니 완료 | timer/departureDone; 실제 애니 길이 [미확정] |
| 취소 후 같은 함수 | `FadeOutWait` — mgmet @0x710004e1b0 | 1.0초 fadeDone |
| 선택 복귀 `ModeSelectStart` — mgmet @0x710004d270 | 복원 flag 있을 때 `IsFinishedCoinBattleEvent` | 해당 맵 완료 signal |

[판독] 호출자들의 전체 대기 순서/복귀는 flow §5.2 참조. rule 창의 in 15f/out3f/선택10f를 카메라 길이로 쓰면 근거 없는 합성이 된다.

## 6. 계산식·조건·의사코드

### 6.1 입력·반복·반환값

[판독] `Impl::Update`는 매 호출 먼저 SetupBaseBg(config)를 실행한다. 오프라인 조작 ID는 `WorkModule::GetOperationPlayerId(INT_MIN,false,true)` 계열 호출에서 얻고 해당 owner의 `InputModule::GetTrigger/GetRepeat`를 읽는다. owner 선정 상세/비트 정의는 mgm_common §6.10, 05_ui_input §6 참조.

[판독] `mgmet::Input::GetInputVec` — mgmet @0x710007d060의 우선순위: `(trig|rep)` bit11→1(Up), bit10→2(Down), bit8→3(Left), bit9→4(Right); 그 다음 trigger만 bit17→1, bit19→2, bit16→3, bit18→4. 숫자1~4는 이 헬퍼의 결과이며 RuleType 번호와 다르다. 방향이 있으면 A/B/설명 비트 처리는 하지 않는다.

| 입력/반환 [판독] | 조건 | 결과/소리 |
|---|---|---|
| Up | 방향1; repeat도 가능 | 현재 버튼 MoveUp, 값+1(끝에서 멈춤), Update0 |
| Down | 방향2; repeat도 가능 | MoveDown, 값-1(끝에서 멈춤), Update0 |
| Left | 방향3 | current==first면 무변경0; 아니면 감소하며 숨긴 열을 건너뜀, PlayMove(imm0,confirm0,forward0) |
| Right | 방향4 | current==6이면 무변경0; 아니면 증가하며 숨긴 열 건너뜀, PlayMove(0,0,1) |
| A mask1 | 방향 없음, current!=6 | 다음 표시 열, PlayMove(0,1,1), Update0 |
| A mask1 | 방향 없음, current==6 | PlayEnter, **Update1**; press 완료 대기 없음 |
| B mask2 | 방향 없음, current!=first | 이전 표시 열, PlayMove(0,1,0), Update0 |
| B mask2 | 방향 없음, current==first | CANCEL, **Update3** |
| mask8 | 방향/A/B 없음 | **Update2**; 프리 플레이 caller는 설명 다시 보기 |
| mask4 | 방향/A/B/mask8 없음 | **Update4**; 프리 플레이 caller는 소비하지 않고 Wait |
| 그 외 | 위 조건 없음 | Update0 |

[판독] 열 탐색은 페인 visibility를 사용하며 연속된 숫자 범위0~6 안에서 건너뛴다. 끝에서 wrap하지 않는다. A/B 자체는 repeat를 사용하지 않는다. [추정] mask8/mask4의 물리 버튼 표시(Y/X)는 공용 비트 표와 연결할 수 있지만 여기서는 확정된 비트와 caller 기능을 명세한다.

[판독] 반환값1/2/3/4를 활동 결과와 혼동하면 안 된다. `Mgm01SetRuleFlow`가 Update1→활동 결과1(시작), Update3→활동 결과2(취소)로 바꾼다. Update2는 함수 종료 결과가 아니라 설명을 거쳐 계속 편집하는 사건이다.

### 6.2 이동·값 갱신 의사코드

[판독] 의미 변수명은 `[웹 이름]`; 아래는 명세이며 실제 웹 코드 변경은 없다.

```text
Update:
  SetupBaseBg(config)
  dir = GetInputVec(trigger, repeat)
  if dir == Up:   buttons[current].MoveUp(); return 0
  if dir == Down: buttons[current].MoveDown(); return 0
  if dir == Left:
    if current == first: return 0
    current = previousVisible(current); PlayMove(current,0,0,0); return 0
  if dir == Right:
    if current == 6: return 0
    current = nextVisible(current); PlayMove(current,0,0,1); return 0
  if trigger & 1:
    if current == 6: PlayEnter(); return 1
    current = nextVisible(current); PlayMove(current,0,1,1); return 0
  if trigger & 2:
    if current == first: CANCEL; return 3
    current = previousVisible(current); PlayMove(current,0,1,0); return 0
  if trigger & 8: return 2
  return trigger & 4

MoveUp:   if index < max: index++; SetBody(index,true)
MoveDown: if index > 0:   index--; SetBody(index,true)
GetResult: zero display flags; collect each rule button's GetSelectIndex()
```

[판독] `PlayMove` — mgmet @0x7100080260는 선택 페인 `on`을 요청한다. immediate이면 공용 창 vt+0x198/0x188을 호출한다. 다른 열은 visible && !viewOnly일 때 `off`; Play 선택이면 마지막에 PlayButton::SetBody(0,false)를 다시 호출하여 Play의 `normal`을 요청한다. 이 순서를 일반적인 “on만 유지”로 바꾸지 않는다.

[판독] `ButtonBase::SetCursorUpDown` — mgmet @0x710007e6fc는 `<column>/x_cursor_00`에 `normal`, `/right`에는 `index!=0`, `/left`에는 `index!=count-1`을 표시한다. 이름의 left/right를 증가/감소 의미로 재해석하지 않고 원본 조건을 유지한다. withSound=false면 SE/진동 없음, true면 현재 열 위치에서 `SQ_SE_SYS_CURSOR_S`와 진동 요청이다.

### 6.3 열 배치·배경 계산

[판독: 어셈블리] `Impl::AlignmentColumn` — mgmet @0x7100080770는 `FindPane("A_alignment_00")` 후 해당 Alignment의 `RequestAlignment`를 호출한다. C의 FindPane 인자가 빠져 확인했다. `ButtonBase::AlignmentColumn(char const*)` — mgmet @0x710007f530도 C에 문자열 인자가 없어 확인했고 전달된 x1을 그대로 FindPane에 쓴다.

[판독] main `nn::ui2d::Alignment::RequestAlignment` — main @0x7101413818는 `Alignment+0xdd |= 1`만 수행한다. 위치 재계산을 즉시 끝내는 함수가 아니다. [미확정] dirty를 소비하는 다음 UI 갱신의 Alignment 알고리즘은 아직 확보하지 않았다. 그래서 저장된 x 간격371을 최종 고정 gap이라고 쓰지 않는다.

[판독] `Impl::SetupBaseBg` — mgmet @0x71000810c8: 기준 폭 W0=`x_rule_05/x_bd_00` 폭. display의 nonzero를 Experience→Explain→CPU→Round→Star→VS 순으로 확인한다. 각 존재 열이 마지막 위치 P와 폭 차 보정 C를 덮어쓰고 열 수 N을 증가시킨다. CPU 폭은 `x_bd_01`, 다른 열은 `x_bd_00`을 쓴다. `C.x=(Wlast-W0)/2`, 나머지 성분0. Alignment 위치를 A라고 할 때:

```text
N < 5:  null_01.position = P + A - C
N >= 5: null_01.position = (-850, 0, 0)   # float32 비트 0xc4548000
```

[판독] 모든 display가0이면 P/C는 zero로 시작한다. config가 허용 표시 값 밖의 nonzero를 갖으면 SetupBaseBg는 이를 세지만 SetupMgm은 해당 열을 숨길 수 있다. 이 불일치까지 포함해 원본은 arbitrary config를 방어하지 않는다. [추정] 포팅의 타입 계약은 위 표의 표시 값과 index 범위만 받아야 한다.

## 7. 애니·소리·레이아웃·메시지 연결

### 7.1 저장된 레이아웃 배치

[데이터] `mgmet_base_rule_00.bflyt` root=1920×1080, `null_00`=(0,-299). `A_alignment_00` ali1의 저장 위치=(-22,0), size1504×218, 추가 바이트는 `02 00 00 00 00 00 96 c2 00 00 00 00`(u32 2/f32 -75/f32 0). [미확정] 이 u32=2의 정렬 열거형 의미는 Alignment 업데이트 판독 전까지 붙이지 않는다.

| 페인 [데이터] | 저장된 위치/크기 | 부품 |
|---|---|---|
| `x_rule_00` | (-1258,0), 470×346 | `mgmet_rule_option_00` |
| `x_rule_01` | (-875,0), 446×346 | `mgmet_rule_option_01` |
| `x_rule_02` | (-504,0), 446×346 | 같은 부품 |
| `x_rule_03` | (-133,0), 446×346 | 같은 부품 |
| `x_rule_04` | (238,0), 446×346 | 같은 부품 |
| `x_rule_05` | (569,0), 366×346 | `mgmet_rule_option_02` |
| `x_play_00` | (910,-87), 444×104 | `mgmet_btn_play_00`; Alignment의 자식이 아닌 sibling |
| `null_01/x_base_bd_00` | null_01=(547,0), bnd=(846,0), 2002×290 | blur/shadow/win 각2090×378; win alpha60; null_01은 SetupBaseBg가 갱신 |

[판독][데이터] `SetVisibleOption01` — mgmet @0x7100080888는 열1/2/3/4의 공통 option01에서 각각 `x_rule_round/x_rule_win/x_rule_cpu/x_rule_explain` 내용만 표시하고 나머지는 숨긴다. CPU는 `x_bd_01`, 다른 종류는 `x_bd_00`을 표시한다. subtype에 맞는 내용/폭 선택이며 열 전체 visibility와 별개다.

### 7.2 텍스트·아이콘

| 열 [판독][데이터] | 메시지·데이터 연결 |
|---|---|
| VS | `mgmet_rule_ui_team` “VS”; `x_text_face_00..03`, `x_face_00..03`; order별 P1..P4/CPU 라벨과 PlayerID 얼굴 |
| Round | `mgmet_rule_ui_round01` “라운드”; `mgmet_rule_ui_round00`의 Number0에 [5,7,10] |
| Star | `mgmet_rule_ui_wincount01` “필요한 스타 수”; `x_rule_02/x_text_win_00`의 `mgmet_rule_ui_round00` Number0에 [3,5,10] |
| CPU | `mgmet_rule_ui_cpulevel01` “CPU”; `x_rule_03/x_text_cpu_01` Text0는 상대 offset 표 mgmet @0x71000e37d8의 `im_comLevel00..03`; 라벨 `mgmet_rule_ui_cpulevel00` |
| Explain | `mgmet_rule_ui_explain02` “미니게임 설명”; 포인터 표 mgmet @0x71000fe678의 `mgmet_rule_ui_explain00/01`(있음/없음) |
| Experience | `mgmet_rule_ui_bodilyMg02` “체감 미니게임”; 표 mgmet @0x71000fe6f8의 `mgmet_rule_ui_bodilyMg00/01`(있음/없음); index1에서 controller00, index0에서 controller01 표시 |
| Play | `mgmet_rule_ui_play` “플레이”; `PlayButton::SetBody`는 `x_play_00`에 `normal`을 요청 |

[판독] CPU `x_rule_03/x_icon_cpu`와 Explain `x_rule_04/x_icon_explain`에 창 vt+0x128 호출로 `(0,index*0.25)`을 넘긴다. [추정] 공용 `SetPicturePaneTextureTransST` 계열의 텍스처 이동으로 해석할 수 있으나 이번 판독은 슬롯 번호/페인/인자까지이며 최종 가상 대상은 §11에 분리한다. 근거 없이 아이콘 pane 자체의 y 위치를 index*0.25로 바꾸지 않는다.

### 7.3 애니·SE

| 레이아웃/행동 [판독][데이터] | tag 시작~끝 / frameSize / loop [데이터] | 접수 잠금 [판독] |
|---|---|---|
| base_rule `in` | -15~0 / 15f / false | 완료를 기다리지 않고 Update 가능 |
| base_rule `normal` | 10~10 / 0f / false | 유지 상태 |
| base_rule `out` | 20~23 / 3f / false | caller는 직후 GetResult/commit |
| option00/01/02 `off` | 0~0 / 0f / false | 비선택 일반 열 |
| 같은 부품 `lock` | 10~10 / 0f / false | viewOnly 표현; 입력 lock과 다름 |
| 같은 부품 `on` | 20~30 / 10f / false | 끝 대기 없이 다음 Update |
| 같은 부품 `normal` | 40~40 / 0f / false | 값/커서 기본 상태 |
| play `off` | -10~-10 / 0f / false | 비선택 |
| play `on` | 0~10 / 10f / false | 선택; 이후 SetBody에서 normal 요청 |
| play `normal` | 20~50 / 30f / true | 반복 |
| play `press` | 60~89 / 29f / false | 요청 뒤 Update1 즉시 반환 |
| play `off_ng/on_ng/press_ng` | 100~100 / 0f; 110~110 / 0f; 120~130 / 10f; 모두 false | 이 경로에서 요청 없음 |

| 사건 [판독] | SE/진동 |
|---|---|
| 값 변경 성공 | `SQ_SE_SYS_CURSOR_S`, 해당 열 페인 전역 위치의 Play2D, 진동 요청 |
| 값/열 경계에서 정지 | SE/진동 없음 |
| 좌우 열 이동(PlayMove confirm=false) | `SQ_SE_SYS_CURSOR` Play2D, 선택 열 위치, 진동 요청 |
| A로 다음 열(confirm=true,forward=true) | `SQ_SE_SYS_DECI`, 진동 요청 |
| B로 이전 열(confirm=true,forward=false) | `SQ_SE_SYS_CANCEL`; 해당 분기에는 추가 진동 호출 없음 |
| 첫 열 B 취소 | `SQ_SE_SYS_CANCEL`, Update3 |
| 플레이 A | `SQ_SE_SYS_DECI_L`, 진동, `x_play_00` press, Update1 |
| SetupMgm immediate PlayMove | 애니 강제 갱신, SE/진동 없음 |

[판독] `In/Out`은 BGM을 바꾸지 않는다. 규칙/설명 동안 항구의 BGM 핸들을 유지하고 출발 시 caller가 StopBgm(2)한다. 소리 그룹·프리셋·Play2D 팬·레이아웃 재생/그리기 규칙은 기존 문서의 해당 절을 참조한다.

## 8. 다른 기능과의 상호작용·저장되는 값

### 8.1 Work/Sync 캐시의 실제 오프셋

[판독] 캐시 시작은 `MinigameModeWork+0x764`(`MgmetGetRuleSettingData` — main @0x71001f0ea4), Sync는 `MinigameModeWorkSync+0xc`(main @0x710022eb8c). 각 setter는 index를 쓰고 캐시 선두 valid byte를1로 만든다. 캐시와 ConfigInfo의 필드 순서가 다르다.

| 캐시 상대/형 [판독] | Work 절대/ setter — main 주소 [판독] | Sync 절대/ setter — main 주소 [판독] | ConfigInfo 대상 [판독] |
|---|---|---|---|
| +0 u8 valid | +0x764 | +0xc | Load가 검사; ConfigInfo에는 별도 valid 없음 |
| +4 s32 CPU | +0x768, `SetRuleSettingCpuLevel` main @0x71001f0ec0 | +0x10, main @0x710022eba8 | +0x14 |
| +8 s32 VS | +0x76c, `SetRuleSettingVs` main @0x71001f0ed0 | +0x14, main @0x710022ebb8 | +0x2c |
| +0xc s32 Star | +0x770, `SetRuleSettingStar` main @0x71001f0ee0 | +0x18, main @0x710022ebc8 | +0x1c |
| +0x10 s32 Round | +0x774, `SetRuleSettingRound` main @0x71001f0ef0 | +0x1c, main @0x710022ebd8 | +0x24 |
| +0x14 s32 Explain | +0x778, `SetRuleSettingExplain` main @0x71001f0f00 | +0x20, main @0x710022ebe8 | +0x0c |
| +0x18 s32 Experience | +0x77c, `SetRuleSettingExperience` main @0x71001f0f10 | +0x24, main @0x710022ebf8 | +0x04 |

[판독] `MgmetRuleSettingDataInit` — main @0x71001f0eac는 Work+0x761이1일 때만 +0x761과 valid+0x764를0으로 한다. Sync 버전 — main @0x710022eb94는 Sync+3이1일 때만 +3/valid+c를0으로 한다. index 슬롯 자체를 일괄0으로 덮지 않는다. Scene 재진입 때 항상 난이도가 초기화된다는 설명은 틀리다. [미확정] +0x761/+3을 세우는 모든 상위 writer와 전체 캐시 수명은 §11.

### 8.2 프리 플레이 commit와 mgm01 소비

| 저장되는 값 [판독] | 조건/실제 쓰기 | 읽는 지점/한계 |
|---|---|---|
| CPU index | 시작1·취소3 모두 `GetResult+0x14` → `SetPlayerWorkComLevel`; Sync CPU setter, offline Work CPU setter | `LoadWorkData`; mgm01 `SyncedSetupGame` — mgm01 @0x7100004e50는 cache+4 → Scene+0x284, valid 검사는 없음 |
| Explain index | 같은 두 종료 경로의 result+0x0c → Sync Explain, offline Work Explain | 규칙 재진입 Load; 영구 save의 setter 호출은 이 commit에 없음 |
| flag4 | `flag::Set(4, explainIndex==0)` | mgm01 `MgStartFlow` — mgm01 @0x7100011a50: flag4==0일 때 `MGTransSound::Play`; 설명 UI 소비 전체는 flow §11 |
| PlayerWork ComLevel | 결과 CPU를 모든 플레이어에 적용, CPU만 거르는 조건 없음 | mgm01 MgStartFlow도 Scene+0x284를 전체 목록에 적용하고 CPU 캐시를 다시 씀 |
| 기타 네 index | GetResult에는 포함되지만 프리 플레이 commit는 저장하지 않음 | 다른 활동 writer는 제외; “GetResult=모두 저장”이라고 해석하지 않음 |
| firstView 세이브 bit3/sync+4 | 설명 최초 완주 후 별도 `SaveFirstHowtoPlayViewMgm01` | 다음 첫 설명 생략; 규칙 Explain index와 다름, flow §8 |
| 시작 지점 | mgm01 준비1/ExitFlow7 → Work+0x4bc | 항구 재진입 경로, flow §8 |
| SaveRequest | 프리 플레이 출발, mgm01 복귀 등 caller에서 요청 | 요청 자체는 CPU/Explain 영구 저장을 입증하지 않음 |

[판독: 어셈블리] `Mgm01SetRuleFlow`의 C는 Explain/CPU setter 모두 같은 지역 Work 포인터 변수 인자를 표시하여 값 구분을 잃었다. mgmet @0x710005e1d0~0x710005e228에서 각각 결과의 +0x0c와 +0x14를 읽어 setter에 전달함을 확인했다. 취소도 이 공통 후처리를 통과한다.

[판독] CPU 열이 숨겨져 있을 때 GetResult CPU는 현재 숨긴 CpuButton의 index다. SetupMgm에서 숨긴 열에 캐시 index를 전달하지 않으므로 새 객체에서는0, 재사용 객체에서는 이전 버튼값이 남을 수 있다. 그 값을 commit하는 경로도 그대로 존재한다. “CPU가 없으면 CPU 캐시 쓰기를 건너뛴다”는 조건은 없다.

## 9. 웹 포팅 구조 — 제안, 코드 없음

[추정][웹 이름] `web/script/app/scene/world/mgmet/ruleConfig.ts`에 순수 상태/입력/결과를 둔다. 파일 경계와 허용 import는 mgm_common §9.1~9.4를 따른다. 같은 폴더·three·기존 charselect의 scene2d/render2d/RepeatGen/types 및 공용 mgmcommon 어댑터를 사용하고 core/games/view/game.ts/env.ts에 의존하지 않는다.

| 제안 부품 [추정][웹 이름] | 계약 |
|---|---|
| `RuleConfigState` | 6개 display/index, 실제 Button index 6개, current/first/viewOnly/In flag를 분리; 숨김과 index 리셋을 동의어로 처리하지 않음 |
| `setupMgm(config)` | 원본 처리 순서 Experience→Explain→CPU→Round→Star→VS를 보존; 유효 config 검사는 어댑터 경계에 표시 |
| `update({trig,rep})` | 방향/A/B/8/4 우선순위·0/1/2/3/4 결과; 반복 간격은 공용 어댑터의 근사값임을 명시 |
| `RuleConfigView2D` | option 부품/pane visibility, on/off/lock/press, 텍스트 삽입, icon texture 전환; 원본 layout 명세 기반 |
| `RuleAlignmentAdapter` | dirty 요청/실제 재배치/배경 위치 갱신을 분리. 확정 엔진 계산 전의 근사 배치는 별도 선택 옵션으로 기록 |
| `getResult()` | 모든 표시 flag0 + 실제 버튼 index; setup config나 “저장된 값” 객체로 대체하지 않음 |
| `commitFreePlay(result)` | Update1/3 양쪽 CPU/Explain/flag4/PlayerWork 적용. UI 종료 결과와 저장 효과를 별개 사건으로 내보냄 |

[추정] 공용 메뉴 격자의 wrap·disabled 이동을 RuleConfigState에 재사용하지 않는다. 원본에는 animationDone gate가 없으므로 on/press가 끝나야 Update를 허용하는 기능을 넣으면 동작이 달라진다. 초기 In/즉시 PlayMove도 같은 사건 순서를 보존한다.

[추정] 구현 전 비교 fixture: CPU0명/3명, 기본·캐시 valid, 숨김 열 값 유지, 설명 왕복 후 커서 유지, 첫 열 B commit, 플레이 A commit, 반복 방향+동시 A/B, locked Round/Explain의 위치, Round+Star 처리 순서, 값 경계 무음. 실제 렌더 비교는 원본 캡처를 확보한 후 별도 검증한다.

### 9.1 구현 계약 (2026-10-07, 웹 구현)

코드: `web/script/app/scene/world/mgmet/ruleConfig.ts`(순수 `RuleConfigState`·`loadWorkData`·`freePlayConfig`·`commitFreePlay`), `ruleConfigView.ts`(`RuleConfigView` = 공용 창 `MgmWindow`(mgmet_base_rule_00) + 열 부품 태그 재생 + Alignment + SetupBaseBg), 허브의 `Mgm01SetRuleFlow`(mgmet_flow.md 9.1 `hub.ts`). 정렬 계산은 공용 `mgmcommon/alignment.ts`(ui2d_alignment.md 9.1).

| 항목 | 웹 | 수준 |
|---|---|---|
| 상태·입력·반환값·PlayMove·SE·GetResult·commit | 5·6·7.3·8.2 그대로(사건 `drain()`) | [판독] 재구현 |
| 열 배치 | SetupMgm 끝 Alignment 요청 → 다음 UI 갱신(`tick`)에서 `alignPanes(A_alignment_00, kind 2·gap −75·수평)` | [판독] ui2d_alignment.md 6.4 |
| 배경 | Update 마다 SetupBaseBg: null_01.x = P + A − C(N < 5), 아니면 −850. P = 마지막으로 센 열의 Alignment 뒤 x | [판독] 6.3 |
| 플레이 글자 | 생성 때 `x_play_00/x_text_00` = `mgmet_rule_ui_play` | [추정: 7.2 라벨만 판독, 쓰는 함수 미기록] |
| 열 제목 페인 | 각 부품의 y +76 글자(`x_vs_00`·`x_text_round_01`·`x_text_win_01`·`x_text_cpu_00`·`x_text_explain_00`·`x_text_mg_01`) | [추정: 레이아웃 위치, 값 페인만 판독] |
| 아이콘 | CPU·설명 아이콘 재질 텍스처 SRT 이동 (0, index × 0.25) — 그림 4칸 세로(80×320·128×512), 페인 UV 1/4 | [추정] 7.2 vt+0x128 |
| 즉시 PlayMove | 태그를 재생하고 그 길이만큼 바로 진행 | [설계] vt+0x198/0x188 내부 미기록 |
| 플레이 선택 | `on` 요청 직후 SetBody 의 `normal` 요청이 덮는다(레이아웃 하나에 재생 하나) | [근사] 같은 레이아웃 동시 태그 재생 [미확정] |
| In/Out | `MgmWindow.in/out`(공용 창 생애) + +0xa0 검사는 상태에서 | [판독] Impl::In = in → normal |
| VS 얼굴 | 슬롯 글자(P1~P4/CPU)만, 얼굴 PlayerID 그림은 미구현 | [설계] 프리 플레이에서 안 씀 |
| 설명 다시 보기(Update2) | 규칙·정보·안내 Out → HowToPlayFlow(Setup(1, false)) → 규칙·정보·안내 In, 커서·값 유지 | [판독] + 정보·안내 다시 In 은 mgm_common.md 5.4 쓰임 예 |
| 진동 | 사건 `vib` → `MgmSound.vibrate(조작 플레이어, 'rule')` | 이름 [미확정] |
| 단독 시험 진입 `entry: 'rule'` | 제목 ActIn·정보·안내 In → Mgm01SetRuleFlow → Out, 결과 `{kind:'rule'}` | [설계] dev/ui.html 시험용 |

정정 줄(2026-10-08): "플레이 버튼·열이 오른쪽으로 치우쳐 잘린다"는 신고를 원본 규칙으로 다시 계산했다(ui2d_alignment.md 12.2). 웹과 원본이 다른 단계는 없었다. 열은 Alignment 오른쪽 끝 730에 붙고(설명 507·CPU 136), `x_play_00`은 Alignment 밖의 형제로 저장 위치 (910,−87) 그대로다. 버튼 판은 688..1120이어서 원본 데이터에서도 오른쪽 160 px(둥근 끝 전부)가 화면 밖이고, 아이콘(722..746)과 글자 칸(769..949)은 화면 안이다 [판독][데이터]. 원본 캡처 대조는 §11에 남긴다. 회귀 검사: `tools/test_mgmet.ts` 4절.

검증: `tools/test_mgmet.ts` 3·4절(상태 경계·잠금 열·Round+Star 첫 열 2·숨긴 열 index·commit/flag4·LoadWorkData, 실제 명세에서 CPU (158)·설명 (529)·배경 96/507).

## 10. 검증 방법·실행 결과

[실행: 변환] 기존 `Impl::Setup`/CPU본문/호출자 C를 재사용했고 누락 함수는 색인 조회와 헤더 대조 후에만 Ghidra 사본에서 디컴파일했다. 신규 C 총 **197함수/10파일**의 전체 내역은 flow §10에 한 번만 싣는다. 이 문서의 핵심 C는 `mgmet_stage2.c`(111함수 중 규칙 함수군), `mgmet_stage2_destructors.c`/`mgmet_stage2_cleanup.c`, main 캐시/Alignment, mgm01 소비자다.

| 예외 지점 [판독: 어셈블리] | 확인 이유/내용 | 덤프 |
|---|---|---|
| mgmet `Mgm01SetRuleFlow` mgmet @0x710005e090 | setters 인자가 포인터 변수로 합쳐짐 → Explain/CPU 각각 index 전달 | `mgmet_stage2_dis1.c` |
| mgmet `RoundButton::SetBody` mgmet @0x710007efdc | C Number0 값 누락 → [5,7,10] | 같은 파일 |
| mgmet `StarButton::SetBody` mgmet @0x710007f338 | 같은 누락 → [3,5,10] | `mgmet_stage2_dis2.c` |
| mgmet `Impl::AlignmentColumn` mgmet @0x7100080770 | FindPane 인자 누락 → A_alignment_00 | dis1 |
| mgmet `ButtonBase::AlignmentColumn` mgmet @0x710007f530 | char const* 인자 누락 → 전달된 x1 사용 | dis1 |

[실행: 변환] 데이터 확인: 원본 layout.lyt의 34레이아웃/107애니를 분석 폴더에만 변환; 열 페인/부품/정렬 추가 바이트, 애니 구간/frameSize/loop, CPU 상대 offset 문자열/라운드·스타·VS 숫자표, Explain/Experience 문자열 표를 확인했다. Play 버튼 애니 길이도 변환 JSON에서 §7.3에 기록했다.

[실행: 변환] `web/tools/analysis/mgmet_validate.py`는 문서 11절/주소·라벨 참조, 신규 함수 중복, 입력 우선순위/값 경계/VS permutation, ConfigInfo↔캐시 순서, 프리 플레이 시작·취소 commit의 정적 명세 fixture를 확인하여 `analysis/mgmet_validation.json`에 기록한다. 이는 분석 도구/명세의 확인이며 원본 실행 검증이 아니다. 원본 영상·실기 입력·실제 최종 Alignment 위치 검증은 아직 없다.

[실행: 변환] 작업 전 SHA-256의 기존904파일(웹 script/assets 및 기존 shell 문서)을 대조한다. 기존 문서 정정은 **0건**이며 자세한 검사 결과/문서 줄 수·바이트는 validation 결과에 기록한다. 원본/추출물은 읽기만 했고 웹 소스·에셋을 수정하지 않았다.

[실행: 변환] 최종 검사 **41/41 통과**. 기준 목록의 **기존 904파일 SHA-256 일치**, 신규 C 함수 중복 없음, 대상 UI 비-thunk 명명 함수 107개 확보를 확인했다. 결과: `analysis/mgmet_validation.json`.

## 11. 미확정 사항과 필요한 근거

| 우선순위·항목 [미확정] | 확인한 범위 | 다음 근거 |
|---|---|---|
| 1. Alignment의 최종 좌표 | pane/tag/추가 바이트·RequestAlignment dirty bit와 SetupBaseBg 식은 확인 | main `nn::ui2d::Alignment` vtable Update/Calculate 계열 무명 함수, +0xdd bit0 reader를 찾고 ali1 type2/-75 값과 숨김 자식 처리 판독. 원본 최종 배치 캡처 |
| 2. lock의 임의 config 조합 | viewOnly는 off 애니에만 검사; 열 탐색/값 이동은 visibility만 검사 | 범위 밖 각 모드의 SetupMgm caller가 사용하는 ConfigInfo 조합 목록 또는 입력 fixture. 현재 프리 플레이에서는 lock config 미사용 |
| 3. rule cache 전체 수명 | Work+0x761/Sync+3이 true일 때만 valid 초기화; index 슬롯은 남음 | 해당 byte의 모든 writer, `ResetMinigameModeWork`·sync 생성/리셋 호출 사슬; 앱 종료 후 persistence는 세이브 setter/reader 필요 |
| 4. vt+0x128 실제 가상 대상 | CPU/Explain의 pane 이름과 (0,index*.25) 인자 확인 | `ComUiMinigameModeWindowCommon`/`ComUiBase` vtable +0x128; main `bq::ComUiBase::SetPicturePaneTextureTransST` main @0x710020d454/main @0x710020d464와 연결 |
| 5. 진동 이름/반복 간격 | VibrationModule 호출 위치, trigger/repeat 소비·경계 무음 확인 | 원본 FX/vibration 라벨 전달 인자 및 공용 bex Repeat timer; 공용 문서의 미확정 유지 |
| 6. mgm01 설명 실제 진입 소비 | flag4 쓰기와 MGTransSound 조건, CPU cache reader는 확인 | main `bq::MinigameScene` 초기 설명 조건/flag4 readers; 첫 설명 세이브 bit3와 규칙 Explain의 혼동 없이 추적 |
| 7. 원본 화면 재현 | 데이터·상태 정적 검증만 완료 | CPU 있음/없음·lock·설명 왕복·취소 직후/재진입의 원본 영상과 최종 페인 행렬 대조 |

보충(2026-10-07): → [ui2d_alignment.md](ui2d_alignment.md) §3~6 (항목1의 dirty 소비·kind2/-75·숨김 처리·최종 좌표 계산; 원본 화면 대조는 §11에 유지).
### 참조만 한 기존 문서 절

[판독] 공용 구현/판독은 재작성하지 않고 아래 절을 사용한다.

- [mgm_common.md](mgm_common.md) §4·5, §6.1·6.7·6.8·6.9·6.10, §7·8·9: 공용 창 수명·부품·텍스트·사운드·입력/owner·독립 모듈 경계. 공용 격자 커서 §6.4는 차이를 구별하기 위한 참조만.
- [message_window.md](message_window.md) §5·6·7·9: 설명/확인에 사용되는 공용 메시지 상태·입력·레이아웃 어댑터.
- [charselect.md](charselect.md) §6.4·6.5·12, [modeselect.md](modeselect.md) §6.1·6.2: layout 갱신/그리기·부품 재질·폰트·창 렌더링.
- [05_ui_input.md](../engine/05_ui_input.md) §6·7, [04_sound.md](../engine/04_sound.md) §6: 비트·반복·FX·SE API.
- `E:/programming/python/ddalkkakrider_work/web/docs/파티_미니게임_모음_분석.md` §2, `F:/dev/mps/web/docs/분석.txt`: 모드 배경/문서 형식, 읽기만.
