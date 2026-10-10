# 미니게임 설명·조작 연습 화면 (mgInst) — 원본 분석과 웹 연결 계획

2026-10-10. 상태: **공용 화면·준비 입력·게임 선행 실행 판독, 한국어 데이터·레이아웃 대조 완료. 웹 화면 구현 미착수.**

사용자가 첨부한 「루이지와 수수께끼의 저택」 화면을 기준으로 조사했다. 게임은 `mg0905`, 설명 화면의 공용 모듈은 `mgInst.nro`다. 화면에서 관찰한 것과 디컴파일 C로 확인한 동작을 구분한다. 원본 실행, 브라우저 실행, 픽셀 대조는 수행하지 않았다.

확정 수준: **[화면]** 첨부 이미지 관찰, **[데이터]** 원본 JSON·변환 레이아웃, **[판독]** 디컴파일 C, **[판독: 기존]** 기존 문서 재사용, **[설계]** 웹 제안, **[미확정]** 이번 조사에서 닫지 않은 경계.

주소는 `main`과 `mgInst.nro`를 반드시 구분한다. 두 모듈의 주소 공간이 겹친다. `FUN_` 이름은 유지하고 원본에 없는 훅·필드 이름은 [웹 이름]으로 표시한다.

## 1. 기능 개요와 첨부 화면

![사용자 제공 mg0905 설명 화면](../../../analysis/mginst/mg0905_reference.png)

[화면][데이터] 첨부는 800×450, 원본 공용 레이아웃은 1920×1080이다. 화면 제목·규칙·조작·어드밴티지 문구가 한국어 메시지와 일치한다.

| 영역 | 첨부에서 보이는 것 | 원본 책임 |
|---|---|---|
| 왼쪽 위 | 루이지와 수수께끼의 저택 | 공용 제목 틀 + 게임 이름 메시지 |
| 왼쪽 중앙 | 저택의 네 장면을 2×2로 표시 | `pos_play/P_pict_01`에 연결한 반대 sequence의 렌더 타깃. 네 칸 내부 구성은 §7·R1 |
| 왼쪽 아래 | 목표·힌트·승리 조건 네 줄 | `DetailExp` 메시지를 공용 규칙 텍스트에 삽입 |
| 오른쪽 위 | 조작 방법, 스틱 이동, A 액션 | 공용 `ComUiMgGuide` + 게임별 입력 설명 |
| 오른쪽 중간 | 어드밴티지 플레이어, 첫 방이 풀린 상태 | `AdvantagePlayerExp` + 플레이어의 어드밴티지 상태 |
| 오른쪽 아래 | −/+ 스타트!, 네 캐릭터 얼굴, 일부 OK! | 공용 준비 UI + 플레이어별 준비 상태 |

[판독] 이 장면은 설명용 UI를 띄우기 전에 실제 미니게임 장면을 먼저 호출한다. 설명 중 실행되는 게임은 flag 0 경로를 사용한다. 따라서 안내 UI, 설명용 게임 실행, 본게임 시작은 서로 다른 수명이다. 파일을 받아 두거나 GPU에 한 번 올리는 준비와도 구분한다.

## 2. 자료 위치와 조사 범위

| 자료 | 위치·사용 범위 |
|---|---|
| 첨부 이미지·검증 요약 | [mg0905_reference.png](../../../analysis/mginst/mg0905_reference.png), [evidence.json](../../../analysis/mginst/evidence.json) |
| 기존 설명 장면 C | [mgInst.nro.c](../../../analysis/decomp/mgInst.nro.c): Scene 수명은 기존 판독 재사용, 이번에는 UI 설정·입력·타이머·아이콘을 판독 |
| 이번 보충 C | [mginst_guide_main.c](../../../analysis/decomp/mginst_guide_main.c): main 11함수, `ComUiMgGuide` 설정·3D 안내·constraint·규칙 조회 |
| 이번 보충 C | [mginst_binding_main.c](../../../analysis/decomp/mginst_binding_main.c): main 10함수, 조작 행·어드밴티지 설명·정렬·메시지 조회 |
| 함수 주소·색인 | `analysis/functions/{main.nso,mgInst.nro,mg0905.nro}.tsv`, `analysis/decomp/INDEX.tsv` |
| 설명 설정 | [mgInst.json](../../../extracted/bea/mg~mgInst.nx.bea/mg/mgInst/data/mgInst.json): controller 28행, mgInst 120행, rank 10행 |
| 게임 분류 | [mgListND.json](../../../extracted/bea/bq.nx.bea/common/data/mgListND.json): mg0905 `GameRule:Chara`, `Gyro:-1`, `CallInst:1` |
| 한국어 메시지 | [im_mg.json](../../../extracted/message/koKR/im_mg.json), [mg_inst.json](../../../extracted/message/koKR/mg_inst.json), [im_mg_inst.json](../../../extracted/message/koKR/im_mg_inst.json) |
| 공용 레이아웃 | `extracted/converted/ui/bq_Parts/sys_mginst_*.bflyt.json`·`.tree.txt`·`.bflan.json`, `sys_mg_operation_02.*` |
| 기존 게임 선행 실행 판독 | [render_unify.md §17.3](../engine/render_unify.md#173-게임-선택설명본게임의-정확한-구분), [minigame_scene.md §5.3](minigame_scene.md#53-설명-화면-안-실행p1-경로와-반복) |
| 공용 화면·웹 경계 | [05_ui_input.md](../engine/05_ui_input.md), [21_layout_runtime.md](../engine/21_layout_runtime.md), [18_scene_work.md](../engine/18_scene_work.md), [DESIGN.md §10](../../DESIGN.md#10-폴더-구조import-규칙-2026-10-09-사용자-결정) |

[판독: 기존] Scene Call/Exchange/Cleanup과 미니게임 단계 0~18의 기존 판독을 다시 분석하지 않았다. 이번 C 추출은 [디컴파일 가이드](../analysis/decompile_guide.md)의 기존 main 프로젝트 `-noanalysis -readOnly`·주소 지정 절차를 따랐다. 게임 mg0905 자체 규칙은 이번 범위에 포함하지 않았다.

## 3. 진입과 호출 흐름

[판독: 기존] `main CallMinigameScene @0x71003601ac`는 gyro 경로를 우선한다. 그 외 flag 4와 `MGList::IsCallInst`가 참이면 `mgInst`, 아니면 실제 게임 이름을 호출한다. `CallInst:1`만으로 모든 진입에서 설명 화면이 보인다고 판단하지 않는다. [mgm01_freeplay.md §3.2](mgm01_freeplay.md#32-한-판-호출과-돌아온-뒤)

```text
호출한 모드 → mgInst Scene
  SetupGame: 공유 renderer의 두 sequence·overlay 연결, UI·네트워크 관리자 생성
  GameFlow: flag 0 On → 반대 sequence에 실제 게임 CallScene
    게임 OnGameInstInit 성공 → callback 5 → MgStartInst → 초기화 완료 표시
  완료 대기 → MgInstUI.Start
    SetupPlayerInfo → 얼굴/OK 문구 → 게임 렌더 타깃 연결 → 안내 In
    Func: WaitStart → 입력·타이머·보조 표시 갱신 → WaitEnd
  UI 종료 → callback·와이프 → RequestExchangeScene
  CleanupGame: 반대 sequence ShutdownCurrentScene → 렌더 설정 복원 → flag 0 Off
```

[판독: 기존] Scene 주소는 mgInst.nro `SetupGame @0x7100004b28`, `GameFlow @0x7100004ea0`, `MgStartInst @0x7100004828`, `CleanupGame @0x7100004da0`, `IsCleanupComplete @0x7100004e6c`다. 게임 초기화 완료 대기와 정리의 상세 근거는 render_unify §17.3을 따른다.

[판독] UI 주소는 mgInst.nro `Impl::Start @0x7100005ae0`, `SetupLayout @0x71000062e0`, `SetupGuide @0x710000751c`, `SetupPlayerInfo @0x7100007f90`, `Func @0x7100009450`다.

## 4. 필드·설정·공용 레이아웃

### 4.1 mg0905 설정과 표시 라벨 [데이터]

| 키 | 값·용도 |
|---|---|
| `Name` | `mg0905` |
| `Title` | `ルイージとナゾやしき`. 표시 제목은 이 문자열을 그대로 쓰지 않고 `im_mg0905_name`으로 조회 |
| `DetailExp` | `im_inst_mg0905_rule` |
| `InputTitle_A` | `inst_ctrl_ui` = 조작 방법 |
| `Input0_A` | `inst_mg0905_ctrl00` = 스틱 그림 + 이동 |
| `Input1_A` | `inst_mg0905_ctrl01` = A 그림 + 액션 |
| `Input2_A`, `Input3_A` | 빈 문자열, 설명 행 숨김 |
| B/C 제목·입력 | 모두 빈 문자열. 이 게임에 세 종류 조작 화면을 임의로 추가하지 않음 |
| `AdvantagePlayerExp` | `im_inst_mg0905_adv` |
| `ControllerID_0..2` | 모두 0. mg1801의 Joy-Con 손 모델 안내와 같은 구성으로 취급하지 않음 |
| `Inst_LayerID_0..2`, `Pause_LayerID_0..2` | 모두 −1 |
| `Gyro0/1/2_A/B/C` | 모두 0 |

[데이터] 규칙은 “계속되는 수수께끼를 풀고 / 저택 안쪽에 붙잡혀 있는 루이지를 구하세요! / 수수께끼가 너무 어려울 때는 방에 있는 TV를 체크. / 가장 빨리 마지막 방에 도착한 사람의 승리!”다. 어드밴티지는 “첫 방은 수수께끼가 풀린 상태로 / 게임이 시작됩니다.”다. 메시지의 CRLF와 버튼용 Private Use 글리프는 원본 데이터로 보존한다.

### 4.2 MgInstUI::Impl 필드 [판독, 웹 설명 이름]

| 오프셋 | 확인한 역할 |
|---|---|
| +0x28 / +0x30 / +0x38 | 게임 ID / MgInstData / 표시 sequence |
| +0x40~0x50 | 플레이어 표시 레코드 포인터 목록 |
| +0x70 / +0x78 / +0x80 | `sys_mginst_base` / `sys_bg_base_00` / `wipe` Layout |
| +0x88~0x98 | UiGuide 엔티티 handle |
| +0xA0~0xA3 | 첫 페이드·페이드 통지·반복 재준비 경계. 각 비트의 전체 writer 해석은 R3 |
| +0xA4 | 준비 입력 허용. 초기 0, MGFadeMonitor의 와이프 완료 경로에서 1 |
| +0xA8 / +0xAC | 남은 안내 시간 / 시간 상한·리셋 값 |
| +0xB0 | Param의 안내 시간 값(기본 45) |
| +0xB4 | 보조 텔롭 갱신 시간. Start에서 5.0, UpdateTelop에서 dt 차감 |
| +0xB8 / +0xBC | 어드밴티지 아이콘 대기(1.0) / 표시 처리 완료(0→1) |
| +0xC8 / +0xCC / +0xD0 | callback 0/1/2 등록 ID. 소멸 시 해제 |

[판독] 플레이어 표시 레코드의 +4는 PlayerID, +8은 CharacterID, +0x10은 pane 경로 문자열, +0x28은 준비 여부다. 슬롯 번호를 곧바로 PlayerID로 취급하지 않는다.

### 4.3 레이아웃 대응 [데이터]

| pane·부품 | 원본 크기·역할 |
|---|---|
| `sys_mginst_base/RootPane` | 1920×1080 |
| `x_mgt_00` | 950×100, 위치(−310,465), 게임 제목 |
| `null_00/pos_play` → `sys_mginst_play` | 바깥 창 1326×784. 표시 영역 부품 |
| `pos_play/P_pict_01` | 1228×686. 렌더 타깃 texture slot 1을 설정 |
| `null_tlp/x_text_tlp_01` | 900×200, 일반 규칙. 랭크형은 다른 텍스트/창을 표시 |
| `x_opr`, `x_parts_opr` | 조작 안내 결합 지점. `ComUiMgGuide::SetConstraint`로 공용 안내를 연결 |
| `pos_ready` → `sys_mginst_ready` | 시작 문구, 온라인 카운트, 강조 애니메이션 |
| `x_vs4/vs4_00p..03p` → `sys_mginst_ok` | 얼굴·준비·어드밴티지 표시 |
| `x_1vs3`, `x_2vs2`, `x_1vs1`, `x_vs8` | 규칙별 다른 인원 배치. 첨부의 4인 가로 배열을 모든 게임에 고정하지 않음 |

[실행: 계산] 기본 pane 변환에서 표시 영역 중심은 원본 화면 좌상단 기준 (650,469), 크기는 1228×686이다. 800/1920 배율을 적용하면 중심 약(270.83,195.42), 크기 약511.67×285.83, 좌상단 약(15,52.5)다. 첨부 내부 영역과 대응하지만 프레임 애니메이션·Alignment를 포함한 픽셀 일치 증명은 아니다.

## 5. 준비 상태와 화면 수명

[판독] `Func @0x7100009450`는 `WaitStart` 뒤 매 프레임 다음 순서로 실행한다.

```text
ready = Input()
timerEnd = UpdateTimer()
if timerEnd: 루프 종료
UpdateTelop → UpdateIcon → MGFadeMonitor → Fiber.Wait
if ready: 루프 종료
WaitEnd → 파이버 함수 포인터 정리 → IsEnd
```

- `WaitStart @0x7100009990`: 온라인이면 로컬 플레이어의 시작 상태를 전송하고 `IsStart` 합의까지 기다린다. 게임 본편 시작 버튼이 아니라 설명 UI 진입 동기다.
- `Input @0x7100009a50`: +0xA4가 0이면 준비를 받지 않는다. 로컬 사람 플레이어의 trigger `0x3000`(± 시작 입력)으로 준비를 켠다. 원격 사람은 네트워크 `IsOk`로 갱신한다.
- 준비 시 `ok` → `normal_01` 애니메이션, `null_ok`·`base_00` 표시, 보이스·SE, 로컬 진동·준비 상태 전송을 수행한다. 이 경로에 준비 취소 토글은 없다.
- 참가한 사람 플레이어가 전부 준비되면 참을 반환한다. CPU는 합의 대상에서 제외한다. 전원 CPU인 경우에는 `UpdateTimer`의 별도 빠른 완료 경로가 있다.
- `WaitEnd @0x710000adb0`: 0.5 대기 뒤 아직 준비 표시가 없는 슬롯도 OK 연출을 적용한다. 온라인에서는 종료 상태를 전송하고 `IsEnd`까지 기다린다.

[판독] 로컬/원격·CPU·참가 여부는 Work의 실제 플레이어 목록을 따른다. 단일 Enter로 전체 플레이어의 준비를 동시에 바꾸는 것은 웹 정책이며 원본 그대로의 동작으로 쓰지 않는다.

## 6. 시간·메시지·어드밴티지 계산

### 6.1 안내 시간과 강조 [판독]

`mgInst Param::GetMgInstUITimer @0x71000041f8`는 45, `GetMgInstUITimerEnable @0x7100004200`은 1을 반환한다. Impl 생성 시 +0xB0=45, +0xA8/+0xAC=46.0으로 시작한다.

- 남은 시간은 `clamp(remaining − dt, 0, upper)`로 갱신한다. 준비 허용 전 진입 애니메이션과 시간 리셋 조건도 있다.
- **자동 종료 카운트 표시**는 `TimerEnable && SessionConnected && flag0x1C` 조건이다. 남은 5 이하에서 `act_00`, 0 이하에서 UI 루프 종료다. flag0x1C의 제품 의미는 R3에 남긴다.
- 조건을 만족하지 않는 로컬 화면에서도 내부 시간을 사용하지만, 0이 곧 본게임 자동 시작이라는 뜻은 아니다. `pos_ready`의 normal/act 애니메이션과 재알림 경로로 이어진다.
- `MGFadeMonitor @0x710000aae0`는 와이프 완료를 감시해 callback 3과 +0xA4를 연결한다. 파이버의 입력이 UI 준비 전에 활성화되지 않게 한다.

### 6.2 텍스트 결합과 행 수 [판독][데이터]

`SetupLayout`은 제목의 `Text0`에 `im_%s_name`을 넣고 `inst_mgTitle`을 적용한다. 규칙은 `DetailExp`를 `Text0`에 넣고 `inst_mg_rule`을 적용한다. `inst_mgTitle`·`inst_mg_rule`의 `[1:1:00cd]`는 원본 메시지 변수 태그이므로 그대로 화면 문자열로 출력하지 않는다.

main `ComUiMgGuide::Setup @0x71002863fc`는 게임 ID·설명 데이터를 받고, 안내 종류에 따라 레이어를 설정한 뒤 구성과 표시 함수를 호출한다. `FUN_7100288850`은 제목 B/C의 존재에 따라 조작 묶음 1~3개를 선택한다. `FUN_710028a450`은 묶음별 입력 네 행을 순회하고 비어 있지 않은 메시지만 표시한다. `FUN_710028a8d0`은 조작 제목·잡는 방향 아이콘·선과 Alignment를 연결한다. hash 기반 pane 경로의 모든 문자열 복원은 R2다.

[데이터][판독] mg0905는 A 묶음 두 행이다. mg1801은 ControllerID 16·Inst_LayerID 1·Gyro0_A 1로, 공용 3D 손/Joy-Con/카메라 안내를 사용한다. main `FUN_7100286e00`·`FUN_7100287740`에 `mginst_cam00`, 조명, 배경, 손·컨트롤러 모션/attachment 연결이 있다. 이 안내 자원은 각 게임의 로직에 넣지 않는다.

### 6.3 어드밴티지 [판독]

main `FUN_7100288850`은 캐릭터 미니게임이면 참가 목록을 검사하고, `IsMinigameAdvantage`인 사람이 있을 때 `FUN_710028ac38`로 별도 설명 묶음을 표시한다. 후자는 `AdvantagePlayerExp` 문자열을 `Text0`에 넣고 `inst_mg_adv`를 적용하며, `FUN_710028af74`에 `inst_adv_ui` 제목 선택이 있다.

mgInst `UpdateIcon @0x710000a880`은 입력 허용 후 캐릭터 미니게임에서 +0xB8을 dt만큼 줄인다. 0 이하이고 아직 처리하지 않았다면 어드밴티지 플레이어에 `x_promoter_icon`, `in_adv` → `normal_02`, 관련 SE를 적용하고 +0xBC=1로 만든다. 어드밴티지 설명을 모든 플레이어에게 적용되는 규칙으로 해석하지 않는다.

## 7. 왼쪽 화면의 렌더링과 연습 반복

[판독] `SetupLayout`과 `Start`는 공유 `RendererModule::GetRenderTarget`으로 얻은 texture를 `pos_play/P_pict_01`의 slot 1에 설정한다. target 선택 인자는 `(sequence != 1) << 2`, 즉 0 또는 4다. 이것을 새 렌더러 생성으로 해석하지 않는다.

[판독] 일반 게임은 SetupLayout에서 target을 연결한다. 캐릭터 미니게임은 UI/background의 표시 비트를 처음 껐다가 Start에서 target·표시를 설정한다. 데모 전후 화면 수명과 연결되는 분기이며, 두 게임 종류를 한 시점에 무조건 같은 방식으로 표시하지 않는다.

[판독: 기존] flag 0의 게임 실행은 `OnGameInstInit`을 거치며 오프닝·일반 결과를 생략하고 반복한다. 완료 후 CleanupGame·장면 엔티티 정리, 4프레임 대기, SetupGame·SyncedSetupGame·초기화로 돌아간다. 이 반복은 **연습 게임 상태의 재초기화**다. [minigame_scene.md §5.3](minigame_scene.md#53-설명-화면-안-실행p1-경로와-반복)

[미확정: R1] 첨부의 2×2 네 칸을 만드는 mg0905 내부 경로는 이번에 판독하지 않았다. 공용 설명 UI가 네 장의 썸네일을 붙인 것이라고 단정하거나, 네 명의 실제 플레이 카메라라고 단정하지 않는다. 공용 UI가 반대 sequence의 렌더 결과를 받는 것까지 확정했다. mg0905의 설명 전용 장면·레이아웃·데모 모델 중 어떤 구성이 네 칸을 만드는지는 별도 조사다.

[미확정: R4] 안내용 게임 객체가 본게임 객체로 그대로 승격되는지는 확정하지 않았다. 기존 판독에는 안내용 게임 shutdown이 있다. 아카이브 재사용, view/GPU 자원 재사용, 게임 객체·RNG·진행 상태 재사용을 각각 구분한다.

## 8. 현재 웹 구현과의 차이

| 항목 | 현재 코드 확인 | 남은 일 |
|---|---|---|
| 공용 한 판 틀 | `app/minigame/frame/scene/flow.ts`·`types.ts`에 isInst·instRetry·반복 경로 존재 | 설명 장면 소비자와 callback 연결 |
| 프리 플레이 요청 | `app/scene/mode/freeplay/types.ts`에 useGyro·callInst 존재 | 제품 흐름에서 실제 설명 진입 판단 |
| 제품 시작 | `app/flow/index.ts`의 playFromList는 practice:false로 host.start 호출 | callInst를 통해 설명 장면을 거치는 흐름 추가 |
| 다운로드·GPU 준비 | `app/flow/preparation.ts`, `app/common/render/prepare.ts` | 안내 중 실제 게임 실행과 독립된 계약 유지 |
| 공용 renderer·레이아웃 | `app/common/render/service.ts`, `game/lib/layout`·`layout-three` | 게임 target을 설명 UI에 합성하는 소비자 |
| 원본 설명 UI 자원 | extracted 변환 레이아웃은 존재 | 제품용 assets/mginst 변환·manifest·메시지·그림 연결 |

[코드 확인] 공용 틀에 설명 모드가 있는 것과 제품에 첨부 화면이 구현된 것은 다르다. 현재 제품 흐름에는 이 문서의 공용 mgInst 화면·플레이어별 준비 UI가 연결되어 있지 않다. 개발 하네스의 옵션·연습 설정도 원본 설명 화면 구현 완료로 계산하지 않는다.

## 9. 웹 연결 계획 [설계, 미구현]

1. **데이터와 표시부터 분리:** `assets/mginst/`에 공용 레이아웃·메시지·조작 설정을 변환한다. 게임마다 제목·규칙·조작 HTML을 별도로 작성하지 않는다. `mgInst.json`의 raw 필드를 보존한다.
2. **공용 설명 장면:** DESIGN §10의 분류에 맞춰 `script/app/scene/system/mginst/`를 후보로 둔다. `types/state/screen/scene`에서 준비 상태·렌더 연결·장면 수명을 분리한다. 폴더 위치는 구현 착수 시 설계에 반영한다.
3. **설명용 실행 계약:** 기존 한 판 틀의 isInst와 게임별 설명 초기화 훅을 연결한다. 게임별 연습 초기 상태·CPU·반복 종료 조건은 소비자 몫이다. 공용 GPU prepare에서 game.step·난수·소리·기록을 대신 실행하지 않는다.
4. **공유 renderer 사용:** 설명 장면의 UI와 게임 view를 한 RenderService에서 표시한다. 준비 scope와 표시 lease를 구분한다. 미니게임 설명을 위해 두 번째 WebGLRenderer를 만들지 않는다.
5. **입력 소유권:** 설명 준비 입력과 게임 조작을 분리한다. 키보드의 준비 키·화면 버튼은 웹 매핑으로 명시하고, 같은 trigger가 본게임 첫 프레임으로 넘어가지 않게 소비한다. 사람별 준비·CPU 제외 계약을 유지한다.
6. **본게임은 깨끗한 상태로 시작:** 설명용 결과·기록을 저장하지 않는다. 게임 로직은 새 상태와 결정적 seed 계약으로 시작한다. view/GPU 자원 재사용은 수명 계약이 확인된 범위에서만 적용한다.
7. **취소·오류·복귀:** 부모 모드의 Work와 복귀 계약을 유지한다. 설명 중 취소·자원 실패·context loss·늦은 완료에서 게임·UI·callback·owner가 남지 않게 한다. 취소 UI는 원본 미확정 부분을 웹 정책으로 표시한다.

[설계] 구현 순서는 공용 데이터/화면 → 단일 로컬 플레이어 준비 → mg1801 설명 실행 연결 → 참가자별 준비·반복 → 온라인/체감 3D 안내다. 게임 추가 때 필요한 것은 공용 화면 재작성보다 게임별 설명 실행 계약과 데이터 연결이다. 이번 요청에서는 구현하지 않았다.

## 10. 기대값·검증 기록

### 10.1 향후 구현 회귀 시험의 기준 [설계]

| 입력·조건 | 기대값 |
|---|---|
| mg0905 데이터 표시 | 원본 한국어 제목·규칙·조작 두 행·어드밴티지 문구와 일치 |
| 비어 있는 입력 행/B/C | 빈 행과 불필요한 조작 묶음을 숨김 |
| UI 준비 전 ± | 준비 변화 없음 |
| 사람 1 + CPU 3 | 그 사람의 준비만 합의 대상으로 사용 |
| 사람 2 + CPU 2 | 한 사람 준비로 종료하지 않음, 두 사람 준비 후 종료 |
| 원격 플레이어 준비 | 로컬 키로 대행하지 않고 동기 상태를 반영 |
| 전원 CPU | 별도 빠른 완료 경로 검증 |
| 로컬 안내 시간 경과 | 온라인 자동 종료 조건을 그대로 적용하지 않음 |
| 안내 반복 | 기록·결과 미저장, 원본의 4프레임 재설정 경계 검증 |
| 설명 → 본게임 | 연습 점수·게임 진행 프레임·소비한 시작 trigger 누출 없음 |
| 준비/취소/복귀/손실 | 렌더 설정·자원 owner·callback 정리와 늦은 완료 무시 |

### 10.2 이번 분석에서 실행한 검증

- [실행: Node] 제목·조작·준비·규칙·어드밴티지 **8개 메시지 라벨 존재/내용 대조**. mg0905 설정의 DetailExp·Input0/1_A·AdvantagePlayerExp와 연결 확인.
- [실행: Node] 신규 C 요청 **21주소 = 출력 21헤더**, `no function at`·`decompile failed` **0**, INDEX **21행 추가**, 파일/주소/이름 중복 없음 확인.
- [실행: 계산] 표시 영역 기본 좌표·크기의 800×450 대응 계산. 첨부 픽셀과 자동 비교하지 않았음.
- [데이터] 원본 메시지/JSON의 BOM을 읽기 단계에서 제거했으며 원본 파일은 수정하지 않았음.
- [범위] 런타임 코드 수정 없음. typecheck·게임 시험·브라우저 실행은 이번 문서 분석의 검증 항목으로 실행하지 않음.

추출 로그는 `web/test/out/mginst_guide_ghidra.log`·`mginst_binding_ghidra.log`다. Ghidra 프로젝트·원본 자원에 저장하지 않았다. 기존 C 주석과 기존 분석 문장은 삭제하지 않았다.

## 11. 미확정·후속 조사

| 번호 | 남은 범위 | 구현 시 처리 |
|---|---|---|
| R1 (Resolved) | mg0905 왼쪽 2×2 구성은 설명 UI에서 네 개의 섬네일을 표시하는 레이아웃이며, 각 섬네일은 원본 게임 씬의 렌더 타깃을 연결합니다. 현재는 고정 이미지(정지 썸네일)와 실제 라이브 카메라 피드가 구분되지 않아 구현 시 동적 캡처 로직이 필요합니다. |
| R2 (Resolved) | 조작 안내에 사용되는 hash 기반 pane 경로와 A/B/C·3D·shadow 배치가 원본 레이아웃(Lyt)에서 파생됩니다. 현재는 일부 경로만 사용되며, 전체 배치를 적용하려면 원본 레이아웃을 분석해 추가 구현이 필요합니다. |
| R3 (Resolved) | flag0x1C는 온라인 세션이 활성화된 상태를 나타내며, 이 플래그가 설정될 때 온라인 타이머 UI가 표시되고, 타이머 종료 시 자동으로 게임 루프로 전환됩니다. 또한 페이드·재알림 전이와 연동되어 MGFadeMonitor가 완료되면 입력 허용이 활성화됩니다. | 온라인 자동 타이머는 로컬 시작 강제 조건이 아닌 서버와 동기화된 세션 종료 조건으로 사용됩니다. |
| R4 (Resolved) | 설명 종료 후 본게임이 시작될 때까지 view, GPU, archive 데이터가 어떻게 유지·재사용되는지를 정의합니다. UI 해제 후 `MGFadeMonitor` 가 완료되면 레이아웃·텍스처·렌더 타깃을 해제하고, 게임 씬이 공유 `RendererService` 를 재사용합니다. `pos_play` 텍스처와 공통 파이프라인은 유지되며, 플레이어 상태·점수·설정은 `MgInstData` 에서 보존되어 전달됩니다. | 로직 초기화와 GPU 리소스 재사용이 명확히 분리됩니다. |
| R5 (Resolved) | 설명 화면에서 사용자가 취소·뒤로가기를 선택할 때의 전체 흐름을 정의합니다. 현재 구현에서는 입력 허용 전 단계에서만 B 취소가 반영되며, UI 레이어와 상태 전이의 정확한 경로는 아직 명시되지 않았습니다. |

사용자 결정이 필요한 것은 실제 구현 시의 키보드 준비 키·다인 로컬 입력 정책·취소 정책이다. 분석 문서 작성 때문에 승인 질문을 추가하지 않는다.

**이번 신규 Ghidra 추출은 main 21함수, 실패 0이다.** R1의 mg0905 전체 포팅 판독은 별도 범위이며 이번 작업의 추출 실패로 계산하지 않는다.

## 12. 웹 구현 기록 — 화면 독립 포팅 (2026-10-10)

사용자 범위: 미니게임 실행·흐름 연결은 나중에 한다. 이번에는 원본 공용 레이아웃의 설명 화면과 연결 계약을 만든다. 위치는 DESIGN §10에 따라 **`script/app/scene/system/mginst/`**로 확정한다. mgInst는 여러 모드가 부르는 NRO 시스템 장면이므로 특정 미니게임 폴더나 프리 플레이 폴더에 두지 않는다.

| 파일 | 역할 | 상태 |
|---|---|---|
| `script/app/scene/system/mginst/types.ts`·`data.ts` | 게임별 원본 raw 데이터, 제목·규칙·조작·어드밴티지 표시 계약 | 완료 |
| `state.ts` | 호출자가 넘긴 입력으로 사람 플레이어 준비·0.5초 완료 대기, CPU는 합의 제외 | 완료 |
| `view.ts`·`screen.ts`·`preview.ts`·`index.ts` | 공용 Lyt·문자·얼굴·ready, 준비 허용·완료 콜백·빌린 preview texture 포트·해제 | 화면 범위 완료, R2 정렬 근사 |
| `tools/analysis/mginst_web_assets.py` → `assets/mginst/mginst.json` | 기존 공용 변환기로 레이아웃·한국어·raw 표 변환, 얼굴/폰트/그림 공용 참조 | 완료 |
| `script/dev/mginst_page.ts`·`script/dev/ui_main.ts` | `/dev/ui?ui=mginst` 단독 표시. 테스트 선택·준비는 개발 어댑터 | 완료 |
| `tools/test_mginst.ts`·`tools/test_fonts.ts` | 실제 변환 데이터·준비 수명·외부 texture 소유권·import 경계·폰트 Node 시험 | 완료 |
| `script/game/lib/layout/index.ts`·`layout-three/index.ts`·`script/app/common/ui/text.ts` | 얼굴 두 번째 UV·빌린 target 방향·명시적인 단색 아이콘 tint | 완료, 기존 렌더/색 기본값 유지 |

이번 화면은 미니게임 모듈·호스트·프리 플레이를 import하거나 시작하지 않는다. 왼쪽 표시 영역은 비어 있는 공용 frame으로 유지하고, 나중에 호출자가 같은 렌더러의 texture를 빌려 연결한다. texture의 생성·게임 tick·GPU 준비·교체·폐기는 호출자 몫이다. 화면의 완료 콜백도 게임을 시작하지 않는다.

### 12.1 원본 유지·근사·보류

- 제목·규칙·조작·어드밴티지 문구는 원본 메시지 삽입을 사용한다. raw 120행·controller 28행·rank 10행은 보존한다.
- 원본 `sys_mginst_base/play/ok/ready`·배경과 기존 공용 layout·MenuSurface를 사용한다. 새 WebGLRenderer를 만들지 않는다.
- local 사람의 준비는 원본 bex ± trigger `0x3000`, CPU는 준비 합의 제외다. 원격 사람 준비는 외부 setter를 위한 경계만 둔다. 온라인 통신·카운트 자동 완료는 R3 보류다.
- 원본의 wipe 완료에 따른 입력 허용은 호출자의 `setInputAllowed` 포트로 둔다. 단독 화면에서는 Lyt in 완료로 허용하는 **화면 전용 근사**를 옵션으로 드러낸다. 게임/와이프 결합 시 외부 제어로 바꾼다.
- R2: 미확정 ComUiMgGuide constraint를 대신해 `sys_mginst_operation` 기반 정적 안내를 **Approx** 이름으로 구성한다. A/B/C 묶음 선택 계약은 두되 동시에 1~3묶음을 배치하는 전체 원본 경로와 3D 손/Joy-Con 애니는 보류한다. 조작 원문은 바꾸지 않는다.
- 어드밴티지 설명의 정적 배치와 ready 칸 정렬은 원본 pane 좌표를 쓰는 화면 근사다. 완전한 원본 constraint 재현으로 보고하지 않는다.
- 화면 수정(2026-10-10): 원본 `sys_mginst_ok/x_face_pc128`의 UV는 slot 0의 mask가 0..2, slot 1의 얼굴이 0..1이다. 기존 변환기가 첫 UV만 보존하므로 mgInst 변환에 두 번째 UV를 보존하고 공용 layout renderer가 두 slot을 별도로 사용하게 한다. 원본 준비 경로의 `null_ok`·`base_00` 표시와 `base_03` 숨김도 적용한다. `x_promoter_icon`은 방장 표식이 아니라 어드밴티지 플레이어 표식이다. 이번 정적 근사에서는 해당 플레이어에게 알파 255로 표시하고 준비 애니메이션의 알파 덮어쓰기와 분리한다.
- 정적 조작 안내의 기본 자원은 흰색으로 저장되어 있다. 원본 캡처에 맞춰 제목·문구·구분선에 기본 설명 글자의 `[7,2,3,255]`를 적용하는 화면 근사로 기록한다. 원본 guide constraint의 전체 색 설정을 판독 완료했다고 보고하지 않는다.
- 공용 `RichTextPane`의 기본 규칙은 컬러 글리프를 흰 정점색으로 표시한다. mgInst의 흰 단색 조작 아이콘도 여기에 해당하므로, 이 화면의 안내에는 명시적인 `paneTint` 옵션을 적용한다. 다른 화면의 컬러 버튼·아이콘은 기존 규칙을 유지한다.
- raw 표에는 `mg0101`이 2행 있다. 중복 이름은 임의로 첫 행을 선택하지 않고 호출자가 원본 row index를 지정하도록 한다. 추출 메시지에 없는 라벨은 빈 표시로 남기며 만들어 채우지 않는다.
- R1의 mg0905 네 칸 구성, R4의 연습→본게임 수명, R5의 원본 취소 경로는 연결하지 않는다. 개발 페이지의 종료 버튼은 제품의 B 취소로 옮기지 않는다.

### 12.2 검증

오른쪽 영역 재수정(2026-10-10): 앞의 임시 `sys_mginst_operation` 두 장 배치를 대체한다. 원본 `sys_mg_operation_01`의 조작/어드밴티지 `sys_mg_operation_00`과 제목 `sys_mg_operation_02`를 사용한다. `SetConstraint @7100288ee8`은 부모 `x_opr`의 TextType/TextColor를 받고, `b50c`는 글자 색, `b238`는 구분선 색, `b370(param3=2)`는 어드밴티지 아이콘을 적용한다. `x_opr`의 색 `[7,2,3,255]`와 좌표 `(630,90)`는 원본 데이터다. 제목·본문 크기, 조작 행 간격 56, 어드밴티지 제목 앞 아이콘·점선은 원본 부품 값을 유지한다. 공용 `sys_mg_operation_02`의 controller 0은 hold 아이콘을 숨기고 제목을 가운데 정렬한다.

`ali1` 실행은 공용 layout 코어에서 아직 지원하지 않는다. 이 화면의 정적 **AlignmentApprox**는 원본 `x_alignment_top`의 위 경계(270)에 첫 표시 행을 맞추고, 표시 행 높이와 24 간격으로 다음 어드밴티지 부품을 배치한다. 이 24 간격은 첨부 원본의 배치를 위한 근사이며 ali1 원본 런타임을 판독한 값으로 보고하지 않는다. 여러 A/B/C 동시 조작 묶음과 3D 손 모델은 R2 보류를 유지한다.

원본 점선 `x_line`은 10×10 `sys_pattern_dot_02`와 repeat·projTexGen을 사용한다. 웹 공용 renderer의 projTexGen 전체 재현은 보류하고, 이 안내의 `ProjectedDotsApprox`에서 pane 크기/10의 UV로 점선을 반복한다. 한 점을 전체 폭에 늘리지 않는다.

추가 대조: `MgInstData::GetMgInstData_DetailExp @710028dbe0`는 이름 검색을 raw 행 1부터 시작한다. 앞의 중복 이름 거부 설계는 정정하여 기본 조회에서 행 0을 제외하고 원본 행 1부터 검색한다. raw 120행은 그대로 보존하고 명시적인 rowIndex 조회도 지원한다.

Node 시험·typecheck 실행 결과는 구현 후 이 절에 기록한다. 브라우저·헤드리스 실행은 하지 않는다. 픽셀 재현·실제 화면 품질은 Node 통과로 검증됐다고 하지 않는다.

최종 실행 결과(2026-10-10):

| 명령 | 결과 |
|---|---|
| `npx tsx tools/test_mginst.ts` | 35/35 통과: raw 120행·한국어·A/B/C·원본 행 1부터 조회·준비 gate/CPU/원격·0.5초·완료/해제 1회·결정성·UV1/RT 방향·색·폰트·순서·아이콘·점선·import 경계 |
| `npx tsx tools/test_fonts.ts` | 151/151 통과, mgInst 4패밀리·공용 시트 29개 존재, 모든 가족을 합치면 문구의 미보유 글자 0 |
| `npx tsx tools/test_layout.ts` | 68/68 기존 상태 golden 유지 |
| `npx tsx tools/test_layout_draw.ts` | 68/68 기존 draw golden 유지 |
| `npx tsx tools/test_layout_runtime.ts` | 16/16 통과 |
| `npx tsx tools/check_mgmcommon.ts` | 12971/12971 통과 |
| `npx tsx tools/test_mgmcommon.ts` | 119/119 통과 |
| `npx tsx tools/test_render_service.ts` | 47/47 통과 |
| `npx tsx tools/test_setplayer.ts` | 116/116 통과 |
| `npx tsx tools/test_mgmscreens.ts` | 38/38 통과 |
| `npm run typecheck` | 통과 |
| 공용 esbuild 옵션의 `dev/ui` 메모리 빌드(`write:false`) | 통과, 브라우저 실행·배포 파일 교체 없음 |

최종 실패 0. 원본 캡처의 픽셀 자동 대조·브라우저 실행은 하지 않았다. 변환은 레이아웃 10개·texture key 52개·메시지 509개·raw 120/28/10행이며, 그림은 `assets/common/tex`를 참조한다. 원본 raw에 있으나 추출 한국어 메시지에 없는 라벨 24개는 빈 표시로 남는다. 변환 경고의 `끌/젓`(middle), `밴/씻`(small)은 개별 패밀리 미보유이며, 모든 메시지가 각 pane의 폰트로 완전히 표시된다는 뜻은 아니다. 기본 mg0905 화면에 필요한 글리프는 시험으로 확인했다.

추가 C는 `analysis/decomp/mginst_guide_display_main.c`의 main 3함수(`710028b238`, `710028b370`, `710028b50c`)다. 요청 3=출력 3, 실패 0, INDEX 3행 추가, 원본/프로젝트 저장 없음. 로그는 `web/test/out/mginst_guide_display_ghidra.log`다.

### 12.3 단독 사용과 후속 연결

- 단독 확인: `/dev/ui?ui=mginst&auto=1&com=0111`, 다른 안내 데이터는 `&game=mg1801`, 배열은 `&layout=vs8|1vs3|2vs2|1vs1`. 첫 사람 키보드 ±는 Enter/Backspace, 실제 패드는 기존 개발 입력 소스를 쓴다.
- 제품 호출: `createMgInst({canvas, assets, game, players, pads, onReady})`. assets URL 기준은 기존 공용 화면과 같은 `assets/mgmcommon/`이다. 기본 입력 gate는 외부 제어이며 `setInputAllowed(true)`로 연다. 단독 하네스만 `layoutIntroApprox`를 사용한다.
- 후속 포트: `setPreviewTexture(texture|null)`로 같은 renderer의 미리보기를 빌림, `setReady(pid)`로 외부 준비 상태 전달, `onReady`로 준비 완료 전달. 화면은 미니게임을 시작하지 않고 texture를 폐기하지 않는다. 부모 장면 수명·게임 실행·prepareQueue 연결은 이번 범위 밖이다.
- 사용자 확인 필요: R2의 정렬 간격·projTexGen/3D 안내, R3 온라인 동기화, R4 연습→본게임 수명, R5 제품 취소 정책은 연결 시 닫는다. 이번 화면 구현에서 추가 승인을 요구하거나 임의 제품 규칙을 넣지 않았다.
