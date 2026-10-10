# 19. 체감 입력 — 공용 motion 코어 준비

[데이터] 2026-10-10 정리본이다; 원본 실행 확인은 없으며 기존 판독과 현재 파일만 사용했다. [자료 목록](#2-자료)·[새 판독 목록](#부록-b-새-판독-목록)을 기준으로 읽었고 원본·extracted·코드·출처 문서는 변경하지 않았다.

## 1. 기능 개요

[판독] 체감 입력은 두 경로다: 리듬 게임은 `bex::InputModule::GetAcc`의 패드 벡터를 직접 비교하고, 일반 체감 게임은 `actor::ComActorSixAxisSensor`의 Converter·WaveDetector·emitter를 사용한다. main `@0x71001932a0/@0x710003e3c8/@0x710003f930`; [05 §6.1](05_ui_input.md), [mg0118 §6.2](../minigame/mg0118.md).

[판독] 공용 파형 이벤트는 같은 방향의 파형당 최대 1회이고 게임의 쿨다운과 별개다; 리듬 게임의 크기 비교·상승 에지·모션 잠금을 모두 이 파형 검출기로 바꾸면 규칙이 달라진다. main `@0x7100040cc0/@0x71000413d0`, mg1802 `@0x710000e710`, mg1804 `@0x710000ee70`; [mg0118 §6.2](../minigame/mg0118.md), [mg1802 §6.6](../minigame/mg1802.md), [mg1804 §6.2](../minigame/mg1804.md).

[데이터] 현재 FrameGate·MgPadState는 `accX/Y/Z`를 전달한다; 현재 입력원의 0 생성과 입력 병합 공백은 §8에서 구분한다. [gate.ts:8–28](../../script/app/minigame/frame/scene/gate.ts), [flow.ts:315–324](../../script/app/minigame/frame/scene/flow.ts), [input.ts:57–67,103–112,133–145](../../script/view/input.ts).

## 2. 자료

### 2.1 기존 판독·공백 일괄 목록

| 분류 | 먼저 재사용한 절·모듈·주소 | 남아 있던 공백 |
|---|---|---|
| [판독] HID·패드 | [05 §6.1–6.5](05_ui_input.md); main GetAcc `@0x71001932a0`, HID `@0x71007e6030/@0x71007e5d10/@0x71007e5584` | [미확정] 패드+0x1C0 writer의 샘플 선택·w; 과거 브라우저 지원 설명은 검증 필요 |
| [판독] 시계·난수 | [02 §5.1·14.1](02_rhythm.md); main `@0x7100425d90/@0x7100425df0`; [01 §6.6–6.7](01_core.md) main `@0x7100189200/@0x7100189438` | [설계] motion 안에 시계·난수·리듬 판정을 복제하지 않음 |
| [판독] 공용 센서 | [mg0118 §6.2](../minigame/mg0118.md), [17 §8.5](17_actor.md); main `@0x710003e4c4/@0x710003e3c8/@0x710003f020/@0x710003f930/@0x710003f820/@0x710003f878/@0x710003f8d0/@0x7100040cc0/@0x71000413d0/@0x71000415ac/@0x71000415e4` | [미확정] Player와의 tick 순서·물리적 자세 축; 생성·clear·resize 상세는 부록 B에서 새 판독 |
| [판독] 흔들기·기울기 | [mg0119 §6.1–6.2](../minigame/mg0119.md) `@0x710000b21c/@0x710000b760`, [mg1002 §6.1](../minigame/mg1002.md) `@0x710000a680` | [판독] mg0119의 value 공백은 공용 길이 합 판독으로 해소; §6.2 |
| [판독: 어셈블리] 조향·점프 | [mg0906 §6.2](../minigame/mg0906.md); mg0906 `@0x7100028fa0/@0x71000293bc/@0x710002968c` | [판독] 후속 C로 early-return 식 확보; [미확정] x/y/z 대응·간접 점프 경계 |
| [판독] 리듬 9종 | [게임별 표 §6.3](#63-리듬-게임별-입력-규칙)에서 각 NRO·주소·절 대응 | [미확정] 직접 GetAcc의 w와 프레임 내 샘플 선택은 공용 공백 |
| [판독] 공용 감사 | [common_system_audit §2 체감 입력 행](common_system_audit.md); main Converter `@0x710003f930` 등 | [데이터] “flow에서 acc 손실”은 현재 코드와 다름; §8 |

[데이터] 저장소·web 및 대상 문서 경로의 `AGENTS.md`, `.agents/skills`를 확인했으나 적용할 로컬 파일은 발견하지 못했다; 로컬 기억은 사용하지 않았다. 파일 확인 범위는 `C:/dev/mpj`, `C:/dev/mpj/web`, `C:/Users/lomal/Documents/Codex/2026-10-10/task-10`이다.

### 2.2 함수·C·데이터 일괄 목록

| 종류 | 모듈·주소 또는 실제 데이터 경로·필드 | 출처·사용 범위 |
|---|---|---|
| [데이터] 함수 인덱스 | main NSO·각 `mg####.nro.tsv`의 `address/name/signature`; INDEX의 `address/name/file` | [INDEX.tsv](../../../analysis/decomp/INDEX.tsv), [main.nso.tsv](../../../analysis/functions/main.nso.tsv); 동일 주소의 다른 NRO 행은 이름·C 파일로 구분 |
| [데이터] 기존 공용 C | main getter·setter·ClearBuffer, Value/Sum·factory 관련 `@0x710003f730–0x71000415e4` | [sixaxis.c](../../../analysis/decomp/mgA_main_sixaxis.c), [sixaxis2.c](../../../analysis/decomp/mgA_main_sixaxis2.c), [sixaxis3.c](../../../analysis/decomp/mgA_main_sixaxis3.c), [sixaxis4.c](../../../analysis/decomp/mgA_main_sixaxis4.c), [sixaxis5.c](../../../analysis/decomp/mgA_main_sixaxis5.c); 부록 B의 최초5·후속29함수만 새 판독; 기존 핵심 함수 본문은 재판독하지 않음 |
| [데이터] 핵심 C 대응 | Converter `@0x710003f930`, Wave `@0x7100040cc0`, emitter `@0x71000413d0` → sixaxis4; getter `@0x710003f820/@0x710003f878/@0x710003f8d0` → sixaxis; Value `@0x71000415ac` → sixaxis2, Sum `@0x71000415e4` → sixaxis5 | [INDEX.tsv](../../../analysis/decomp/INDEX.tsv), [main.nso.tsv](../../../analysis/functions/main.nso.tsv); [mg0118 §6.2](../minigame/mg0118.md) 판독 재사용 |
| [데이터] 사용 여부 | `extracted/bea/bq.nx.bea/common/data/mgListCA.json`·`mgListND.json`의 `Gyro` | [CA](../../../extracted/bea/bq.nx.bea/common/data/mgListCA.json), [ND](../../../extracted/bea/bq.nx.bea/common/data/mgListND.json); 필드 해석은 [05 §6.4](05_ui_input.md), main `@0x71001e1744/@0x71001e1778` |
| [데이터] 설명 손 그림 | `extracted/bea/mg~mgInst.nx.bea/mg/mgInst/data/mgInst.json`의 `controller[]`, `ControllerID_0..2`, `Gyro0_A` 계열 | [mgInst.json](../../../extracted/bea/mg~mgInst.nx.bea/mg/mgInst/data/mgInst.json), [05 §6.4](05_ui_input.md); 센서 좌표계 근거로 확대하지 않음 |
| [데이터] 현재 웹 계약 | `MgPadInput.accX/Y/Z`, `MgPadState.accX/Y/Z`, `PadInput.accX/Y/Z` | [gate.ts](../../script/app/minigame/frame/scene/gate.ts), [types.ts](../../script/app/minigame/frame/scene/types.ts), [pad.ts](../../script/game/core/pad.ts); 주소를 만들지 않음 |

[데이터] 대상 주소는 INDEX와 모듈별 함수 TSV로 교차 확인했다; `ghidra_work/mgA/out`·`mgD/out`에서는 이번 공백을 보충할 C를 찾지 못했다. 기존 [analysis/decomp](../../../analysis/decomp/INDEX.tsv)의 C만 사용했고 새 추출은 하지 않았다.

### 2.3 후속 공백의 caller/callee·C 일괄 목록

[데이터] 후속 판독 전에 아래 후보를 모듈·주소·C로 묶었다; 기존 핵심 함수는 문서 재사용, 후보의 본문만 새로 읽었다. [INDEX.tsv](../../../analysis/decomp/INDEX.tsv), [main.nso.tsv](../../../analysis/functions/main.nso.tsv), [mg0119.nro.tsv](../../../analysis/functions/mg0119.nro.tsv).

| 대상·모듈·주소 | 기존 C·확인 범위 |
|---|---|
| [데이터] main 소스 유효 검사·성분 getter @0x71007e0790/@0x71007e0880/@0x71007e09b0/@0x71007e0ae0/@0x71007e0c10/@0x71007e0d40/@0x71007e0e70 | [sixaxis4.c](../../../analysis/decomp/mgA_main_sixaxis4.c); provider+0x10의 count, provider+0x28의 state 조회 경로 |
| [데이터] main 방향·mask·SDK wrapper @0x7100037660/@0x71000373e0/@0x710144c890 | [sixaxis4.c](../../../analysis/decomp/mgA_main_sixaxis4.c); 행 변환·w·실제 SDK 호출 경계 |
| [데이터] main message wrapper·vtable+0x50 반환 @0x710003e500/@0x710003e824 | [sixaxis3.c](../../../analysis/decomp/mgA_main_sixaxis3.c); 기존 tick의 진입 경계 |
| [데이터] mg0119 생성 caller @0x710000abc4 | [mgD_mg0119_game.c:6909](../../../analysis/decomp/mgD_mg0119_game.c); sensor component 추가와 입력 ctor 순서 |
| [데이터] main 생성·해제 @0x710003eac0/@0x710003eb1c/@0x710003f570/@0x7100040410 | [sixaxis3.c](../../../analysis/decomp/mgA_main_sixaxis3.c), [sixaxis4.c](../../../analysis/decomp/mgA_main_sixaxis4.c); 초기 관리 영역·handle·buffer 해제 |
| [데이터] mg0906 새 callback @0x710002968c | 최신 [INDEX](../../../analysis/decomp/INDEX.tsv) → [motion_gap_mg0906.c:1](../../../analysis/decomp/motion_gap_mg0906.c); 기존 C만 추가 판독, 함수 TSV 독립 행은 미확보 |
| [미확정] main 인접16B 반환 후보 @0x71007e0fa0 | [main TSV](../../../analysis/functions/main.nso.tsv)는156 B·16B 반환; [INDEX](../../../analysis/decomp/INDEX.tsv)와 기존 C에 없음; posture getter라는 이름을 확정하지 않음 |
| [미확정] main 직접 패드 writer·provider 가상 함수 소유자·게임 등록 순서 | 주소 미식별; 제외 후보와 추가 요청은 [부록 B](#부록-b-새-판독-목록)·[부록 C](#부록-c-추출-요청-표) |

[데이터] 2026-10-10 02:38 UTC 재대조는 허용된 C486개(analysis/decomp/*.c 479개·ghidra_work/*/out/*.c 7개)의 파일 목록·수정 시각·모듈/함수 헤더와 최신 [INDEX.tsv](../../../analysis/decomp/INDEX.tsv)를 대상으로 했다; 담당 요청의 새 본체는 이미 §6.2.1에 반영한 mg0906 @0x710002968c의 [motion_gap_mg0906.c](../../../analysis/decomp/motion_gap_mg0906.c)뿐이었다. 이번 재대조의 추가 본체 판독0함수이며 누적34함수·미확정10 ID·요청3주소/미식별3건을 유지한다; 다른 갈래 본체는 다시 읽지 않았다.

## 3. 진입점·호출 흐름

| 경로 | 흐름·샘플 확정 | 근거 |
|---|---|---|
| [판독] HID 수집 | 스타일에 맞는 handles → StartSixAxisSensor → 매 프레임 최대 16개 state → 0x610 B 링; 새 샘플 수 집계 | main `@0x71007e6030/@0x71007e5d10`; [05 §6.2](05_ui_input.md) |
| [판독] 단일 Joy-Con 축 | JoyLeft bit3는 (x,y)→(−y,x), JoyRight bit4는 (x,y)→(y,−x); acc·angVel·angle 및 자세 행렬을 가로 쥐기 기준으로 변환 | main `@0x71007e5584`; [05 §6.2](05_ui_input.md) |
| [판독] 직접 패드 | GetAcc/GetAccLeft는 패드+0x1C0, GetAccRight는+0x1D0의 16 B를 반환; PlayerID를 못 찾으면 0 | main `@0x71001932a0/@0x7100193230/@0x71001931c0`; [05 §6.1](05_ui_input.md) |
| [판독] actor 센서 | 메시지 TickUpdate→`@0x710003e4c4`→`@0x710003e3c8`→`@0x710003f020`; FrameCount로 프레임당 1회, converter에는 최신 인덱스0 샘플 1개 | main; [mg0118 §6.2](../minigame/mg0118.md), [17 §8.5](17_actor.md) |
| [판독] 변환·이벤트 | Converter→링 저장→WaveDetector→Value/Sum emitter→게임 callback; getter는 최신 항목 | main `@0x710003f930/@0x7100040cc0/@0x71000413d0/@0x710003f820/@0x710003f878/@0x710003f8d0`; [mg0118 §6.2](../minigame/mg0118.md) |

[미확정] actor의 “최신 1개” 규칙을 직접 GetAcc의 샘플 선택에 전용할 수 없다; 패드 writer가 아직 식별되지 않았다. main GetAcc `@0x71001932a0`; [05 §6.2](05_ui_input.md).

[미확정] 물리적 손 방향과 posture의 quaternion 회전 방향은 완결되지 않았다; 가로 축 변환과 게임의 “세로 쥐기” 설명은 서로 다른 층이다. main `@0x71007e5584/@0x710003f8d0`; [05 §6.2·6.4](05_ui_input.md), [mg1002 §6.1](../minigame/mg1002.md).

[판독] message wrapper는 메시지+0x08이 0x5F454E00일 때 기존 센서 업데이트를 동기 호출한다; 별도 vtable+0x50 함수의 반환값은 0x80이다. main @0x710003e500/@0x710003e824; [sixaxis3.c:827,580](../../../analysis/decomp/mgA_main_sixaxis3.c). [미확정] 이를 tick 우선순위0x80 또는 game Update 선행의 근거로 해석할 수 없다.

[판독] mg0119 CreateInput은 먼저 Entity에 ComActorSixAxisSensor를 추가하고, 유효 handle이면 SixAxisSensorInput ctor를 부르며 실패하면 Abort한다. mg0119 @0x710000abc4; [mgD_mg0119_game.c:6909](../../../analysis/decomp/mgD_mg0119_game.c). [미확정] 이 함수만으로 Player component의 배열 위치·flag clear 전후는 확정되지 않는다.

[판독] 같은 Entity의 dispatch는 현재 component 배열 순서이며 callback 뒤 배열 경계를 다시 읽는다; 이 공용 규칙은 기존 판독을 재사용한다. main @0x7100899450; [17 §3.2·6.6](17_actor.md). [설계] FrameGate의 센서 확정·게임 tick 순서는 §9.3 계약을 따르고 네트워크 세션 수명은 [12_online_sync.md](12_online_sync.md)에 맡긴다.

## 4. 구조체·필드·상수

| 객체·필드 | 의미·값 | 모듈·주소·출처 |
|---|---|---|
| [판독] SixAxisSensorState+0x00/+0x08 | deltaTime / sample number | main 수집 `@0x71007e5d10`; [05 §6.2](05_ui_input.md) |
| [판독] state+0x10/+0x1C/+0x28/+0x34 | acceleration / angularVelocity / angle / direction 3×3 | main `@0x71007e5d10`; [05 §6.2](05_ui_input.md) |
| [판독] Converter+0x40 링 | 항목 0x40 B: 번호+0, acc+0x10, angVel+0x20, posture+0x30 | main `@0x710003f930`; [mg0118 §6.2](../minigame/mg0118.md) |
| [판독] Converter+0x68/+0x69/+0x6A | RemoveGravity / InverseAcceleration / RotateInPosture; 새 ctor 기본값 1/0/0 | main `@0x710003f4f8`; [sixaxis3.c:2](../../../analysis/decomp/mgA_main_sixaxis3.c) |
| [판독] Converter+0x58/+0x60 | ClearBuffer에서 각각 8 B / 4 B를 0으로 쓰는 링 관리 영역; 필드명은 확정하지 않음 | main `@0x710003f730`; [sixaxis.c:161](../../../analysis/decomp/mgA_main_sixaxis.c) |
| [판독] Detector+0x40/+0x44/+0x48 | 종류 0=acc·1=angVel / 축 x1 y2 z4 / movement threshold; 음수면 0.1 | main `@0x7100040cc0`; [mg0118 §6.2](../minigame/mg0118.md) |
| [판독] 파형 상태 | 0 대기, 1 시작 통지, 2 진행, 3 종료 통지 | main `@0x7100040cc0`; [mg0118 §6.2](../minigame/mg0118.md) |
| [판독] Value / Sum | `test <= value` / `test <= sum`; Sum은 state1에서 0, state1·2에서 value 가산 | main `@0x71000415ac/@0x71000415e4`; [mg0118 §6.2](../minigame/mg0118.md) |

[추정] 가속도 G·각속도 회전수/s는 기존 문서가 공개 정의에 기대어 설명한 단위이고 원본 상수로 확인한 결론은 아니다; 네 번째 acc 칸은 패딩이며 항상 0이라는 가정은 남아 있다. main `@0x71007e5d10/@0x71001932a0`; [05 §6.1–6.2](05_ui_input.md).

## 5. 상태·수명

[판독] Converter factory는 0x88 B를 할당하고 ctor를 호출한다; ctor는 옵션 1/0/0과 링·관리 포인터 영역을 초기화한다. main `@0x710003f49c/@0x710003f4f8`; [sixaxis2.c:49](../../../analysis/decomp/mgA_main_sixaxis2.c), [sixaxis3.c:2](../../../analysis/decomp/mgA_main_sixaxis3.c).

[판독] SetBufferSize는 음수에서 Abort, 0을 1로 바꾸고 항목 수를 맞춘다; 항목 stride는 0x40이다. main `@0x710003f7c4`; [sixaxis.c:184](../../../analysis/decomp/mgA_main_sixaxis.c).

[판독] ClearBuffer는 유효한 detector handle마다 reset `@0x7100040598`을 호출하고 Converter+0x58/+0x60을 0으로 쓴다; 이 함수가 샘플 저장 메모리 전체를 0으로 덮지는 않는다. main `@0x710003f730`; [sixaxis.c:161](../../../analysis/decomp/mgA_main_sixaxis.c).

[판독] detector reset은 +0xB4·+0xD0·+0xC0의 16 B를 0으로, +0x71을 1로 쓴다; 아직 이름이 확정되지 않은 필드는 오프셋으로 보존한다. main `@0x7100040598`; [sixaxis.c:732](../../../analysis/decomp/mgA_main_sixaxis.c).

[설계] 브라우저 장치 연결은 앱 수명, Converter·파형·emitter·calib는 플레이어/게임 수명으로 둔다; 판 시작·재시도·센서 교체 때 명시적 reset을 한 번 수행하고 pause/gate 대기 중에는 논리 상태를 갱신하지 않는다. [DESIGN §10.1·10.5](../../DESIGN.md), 원본 reset main `@0x710003f730`; [sixaxis.c](../../../analysis/decomp/mgA_main_sixaxis.c).

[미확정] resize 중 이전 sample 관리 값과 detector 상태의 정합성은 이번 함수만으로 완결되지 않았다; 웹은 실행 중 resize를 쓰지 않는 계약을 권장한다. main `@0x710003f7c4`; [sixaxis.c](../../../analysis/decomp/mgA_main_sixaxis.c).

[판독] Converter 해제는 유효 detector를 reset하고 관리 값·detector 저장소·샘플 링을 정리한다; detector 해제는 유효 emitter handle과 자기 저장소를 정리한다. main @0x710003f570/@0x7100040410; [sixaxis4.c:1318](../../../analysis/decomp/mgA_main_sixaxis4.c), [sixaxis3.c:104](../../../analysis/decomp/mgA_main_sixaxis3.c).

[판독] 확인된 SetBufferSize 사용은 mg0118 Swim/Hurdle/Pedal setup과 mg0119 입력 ctor의 200개 설정이다; 기존 판독을 재사용한다. mg0118 @0x7100018c34/@0x710001acc4/@0x7100022b5c, mg0119 @0x710000b21c; [mg0118 §6.2](../minigame/mg0118.md), [mg0119 §6.2](../minigame/mg0119.md). [설계] 웹 기본은 setup에서 고정 용량을 정하고 reset으로 판을 나누며, 실행 중 resize 정합성 M07은 이 기본 구현을 막지 않는다.

## 6. 계산식·의사코드

### 6.1 sampling·변환·getter

[판독] 순서는 중력 제거→옵션 자세 회전→가속도 부호 반전→링 저장이다; getter는 최신 acc/angVel/posture를 반환하며 링이 비면 0/0/단위 자세다. main `@0x710003f930/@0x710003f820/@0x710003f878/@0x710003f8d0`; [mg0118 §6.2](../minigame/mg0118.md), [17 §8.5](17_actor.md).

[설계] 아래 `R_native`는 기존 판독의 “자세로 돌림”을 나타내는 기호다; 임의로 `q*v*conj(q)` 방향을 정하지 않으며 원본 회전 helper와 입력원 축 계약을 일치시킨다. 원본 main `@0x710003f930`; [mg0118 §6.2](../minigame/mg0118.md).

```text
// [판독] main @0x710003f930, mg0118 §6.2의 연산 순서
a = sample.acc
w = sample.angVel
q = sample.posture
if RemoveGravity:    a = a - R_native(q, (0,-1,0))
if RotateInPosture:  a = R_native(q,a); w = R_native(q,w)
if InverseAcceleration: a = -a
ring.push(sample.number, a, w, q)
```

[설계] 웹 수치 연산은 f32 순서로 고정한다; 원본 SIMD 제곱합·축 회전·quaternion 곱의 반올림 순서를 임의 재배치하지 않는다. [DESIGN §3·10](../../DESIGN.md), 원본 main Converter `@0x710003f930`·mg1803 입력 `@0x710000f4c0`; [mg1803 §6.5](../minigame/mg1803.md).

[판독] raw source 유효 검사는 provider가 있고 provider의 가상+0x10 count가 양수인지 확인한다; 성분 getter도 같은 조건이 실패하면0, 성공하면 가상+0x28로 얻은 state의 아래 성분을 반환한다. main @0x71007e0790 및 아래 주소; [sixaxis4.c:1063–1224](../../../analysis/decomp/mgA_main_sixaxis4.c).

| main getter 주소 | state 오프셋·반환 | 해석 제한 |
|---|---|---|
| [판독] [@0x71007e0880](../../../analysis/decomp/mgA_main_sixaxis4.c) | +0x10, acc.x 한 성분 | 직접 GetAcc의16B 벡터나4번째 w와 다른 경로 |
| [판독] [@0x71007e09b0](../../../analysis/decomp/mgA_main_sixaxis4.c) | +0x1C, angVel.x 한 성분 | acc.y가 아님 |
| [판독] [@0x71007e0ae0](../../../analysis/decomp/mgA_main_sixaxis4.c) | +0x28, angle.x 한 성분 | acc.z가 아님 |
| [판독] [@0x71007e0c10/@0x71007e0d40/@0x71007e0e70](../../../analysis/decomp/mgA_main_sixaxis4.c) | +0x34/+0x40/+0x4C, direction 각 행의 첫 성분 | matrix 전체·quaternion 반환이 아님 |

[미확정] count>0은 현재 버퍼에 상태가 있다는 조건이며 이번 frame의 새 샘플 수라는 증거가 아니다; getter의0 반환을 sample0/중복 번호의 Wave/Sum 처리로 일반화하지 않는다. main @0x71007e0790/@0x71007e0880; [sixaxis4.c](../../../analysis/decomp/mgA_main_sixaxis4.c), 기존 sampling [mg0118 §6.2](../minigame/mg0118.md) main @0x710003f020.

[판독] direction 보정 helper는 +0x34/+0x40/+0x4C 각 행에 (x,y,z)→(x,z,-y)를 적용한다; mask helper는 bit1/2/4에 따라 x/y/z를 남기고 네 번째 성분을0으로 반환한다. main @0x7100037660/@0x71000373e0; [sixaxis4.c:185,902](../../../analysis/decomp/mgA_main_sixaxis4.c). [미확정] 이 mask의 w=0으로 직접 GetAcc의 w=0을 확정할 수 없으며, 행 변환만으로 Joy-Con 물리 축·브라우저 축의 대응도 완결되지 않는다.

[판독] GetQuaternion wrapper는 SDK nn::hid::SixAxisSensorState::GetQuaternion로 위임한다; wrapper 본문에는 축 변환이 없다. main @0x710144c890; [sixaxis4.c:1214](../../../analysis/decomp/mgA_main_sixaxis4.c). [미확정] external stub @0x7101eff000의 size1은 SDK 수식·회전 방향의 구현 근거가 아니다; [main TSV](../../../analysis/functions/main.nso.tsv).

### 6.2 WaveDetector·emitter

[판독] `v=mask(acc 또는 angVel)`, `mag=length(v)`다; y만 선택해도 value는 `abs(y)`이고 합에 dt를 곱하지 않는다. main `@0x7100040cc0/@0x71000415e4`; [mg0118 §6.2](../minigame/mg0118.md), [17 §8.5](17_actor.md).

```text
// [판독] main @0x7100040cc0 / @0x71000413d0 / @0x71000415e4
thr = threshold < 0 ? 0.1 : threshold
if state == 2:
  if mag < thr:
    notify(state=3, value=mag); reset(); return
  if dot(v,peak) < 0:
    notify(state=3, value=0); reset()     // 이어서 같은 샘플 시작 검사
  else:
    if length(peak) < mag: peak=v
    notify(state=2, value=mag); return
if state == 0 and mag >= thr:
  count++; peak=v
  notify(state=1, value=mag); state=2

notify:
  if state==1: fired=false; sum=0
  if fired: return
  Value: pass = testValue <= value
  Sum:   if state in {1,2}: sum += value
         pass = testSum <= sum
  if pass: callback(context); fired=true
```

[판독] 종료의 state3은 emitter에도 전달되지만 Sum은 state3 값을 더하지 않는다; 파형 반전은 종료와 새 시작을 같은 샘플에서 통지할 수 있다. main `@0x7100040cc0/@0x71000415e4`; [mg0118 §6.2](../minigame/mg0118.md).

[판독] mg0119의 “성분값/절댓값 미확정”은 위 공용 판독으로 해소된다; y마스크 value=`|y|`, 0.5 크기 5개의 연속 같은 방향 값은 sum2.5에 도달한다. main `@0x7100040cc0/@0x71000415e4`, mg0119 `@0x710000b21c`; [mg0119 §6.2](../minigame/mg0119.md), [17 §8.5](17_actor.md).

| 게임·입력 | 설정·게임 조건 | 근거 |
|---|---|---|
| [판독: 어셈블리] mg0118 수영 | Buffer200·RemoveGravity1·InverseAcc1; angVel y·movement1·Value1, 별도 conv1은 파형 없음 | mg0118 `@0x7100018c34/@0x710001bfd0`; [§6.2–6.3](../minigame/mg0118.md) |
| [판독: 어셈블리] mg0118 세발 | conv0·1 Buffer200·RemoveGravity1·InverseAcc1; 독자 PedalDetector, Wave emitter 없음 | mg0118 `@0x7100022b5c/@0x710001a36c`; [§6.2·6.5](../minigame/mg0118.md) |
| [판독: 어셈블리] mg0118 허들 | Buffer200·RemoveGravity1·RotateInPosture1·InverseAcc1; acc y·movement1·Sum1 | mg0118 `@0x710001acc4/@0x710001c36c`; [§6.2·6.7](../minigame/mg0118.md) |
| [판독: 어셈블리] mg0119 점프 | Buffer200·옵션1/1/1; acc y·movement0.25·Sum2.5; 콜백 flag+0x2C, Update에서 clear | mg0119 `@0x710000b21c/@0x710000b2ec–0x710000b314`; [§6.2](../minigame/mg0119.md) |
| [판독] mg1002·mg0119 기울기 | calib×posture→X(−π/2)·상대자세·X(+π/2)→X/Z Euler; mg1002 GyroRate0.5·±17° clamp | mg1002 `@0x710000a680/@0x710000ba44`, mg0119 `@0x710000b760`; [mg1002 §6.1](../minigame/mg1002.md), [mg0119 §6.1](../minigame/mg0119.md) |
| [판독: 어셈블리] mg0906 | Buffer200·옵션1/1/1; 조향 `y=(conj(q)·UnitX·q).y`, `y<−.5 ? 1 : −2*min(y,.5)`; 점프 acc xyz·movement.5·Sum0 | mg0906 `@0x7100028fa0/@0x71000293bc/@0x710002968c`; [§6.2](../minigame/mg0906.md); [판독] 비교식 보충은 §6.2.1; [미확정] 반환 성분·간접 호출 대상 |

[설계] 사람 센서 경로에 난수를 추가하지 않는다; CPU 전략과 게임의 동기/비동기 stream 소비는 해당 NRO에서 유지한다. 원본 mg0119 `@0x71000036f0`; [mg0119 §6.7](../minigame/mg0119.md), 리듬 소비는 다음 표.

#### 6.2.1 mg0906 callback의 C 보충

[데이터] 최신 INDEX에 mg0906 @0x710002968c의 기존 C가 추가되어 이 함수만 새로 판독했다; docs_gap_main.c의 다른 담당 함수는 헤더 목록만 확인했다. [INDEX.tsv](../../../analysis/decomp/INDEX.tsv), [motion_gap_mg0906.c:1](../../../analysis/decomp/motion_gap_mg0906.c), [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c).

[판독: 어셈블리] 문턱 T의 기존 해석은 player.jump.input_accel_length다; mg0906 @0x710002968c, [mg0906 §6.2](../minigame/mg0906.md). [데이터] 기본1.0은 [mgA_mg0906_params.json](../../../analysis/mgA_mg0906_params.json)의 player.jump.input_accel_length이며 [mg0906 §4.3](../minigame/mg0906.md) 값을 재사용한다.

[판독] C의 실제 early-return 식은 아래와 같다; a/b/c는 decompiler 반환 임시값을 그대로 이름 붙였으며 물리 축 이름이 아니다. mg0906 @0x710002968c, [motion_gap_mg0906.c](../../../analysis/decomp/motion_gap_mg0906.c).

~~~text
// [판독] mg0906 @0x710002968c; C의 비교 연산·엄격 경계 보존
T = fVar7
a = extraout_var
b = extraout_var_00
c = extraout_s0
reject = (T <= a || abs(b) < T)
      && (-T < a && (T <= a || abs(c) < T))
if reject: return
~~~

[판독] 유한 입력·T>0에서는 a≤−T이면 필터를 통과하고 a≥T이면 반환하며, −T<a<T에서는 abs(b)≥T 또는 abs(c)≥T일 때 통과한다; abs(a) 하나의 대칭 비교로 바꾸면 규칙이 달라진다. mg0906 @0x710002968c, [motion_gap_mg0906.c](../../../analysis/decomp/motion_gap_mg0906.c).

[판독] 통과 뒤 lVar6+0x40 객체가 있으면 그 vtable+0x30을 간접 호출한다. mg0906 @0x710002968c, [motion_gap_mg0906.c](../../../analysis/decomp/motion_gap_mg0906.c). [미확정] extraout_*의 x/y/z 대응·간접 호출의 실제 이름과 @0x7100029770 점프 뒤 C의 함수 소속은 복구되지 않았다; 후반 PlayerJump::SetupGame 표기를 callback의 확정 callee로 추가하지 않는다.

### 6.3 리듬 게임별 입력 규칙

[판독] 아래 직접 GetAcc 경로에는 Converter의 중력 제거를 임의로 추가하지 않는다. main `@0x71001932a0`; [05 §6.1](05_ui_input.md).

| 게임·모듈·주소 | 사람 문턱·프레임 조건 | 난수·CPU 관련 범위 | 기존 절 |
|---|---|---|---|
| [판독] mg1802 `@0x710000e710` | 4성분 m≥2.4 && prev<2.4; cooldown .25초; prev는 timer 종료 때만 갱신 | ResetCom `@0x710000f2d4`: 기본 JUST·소비0, mode4/5/6에서만 sync 소비 | [§6.6](../minigame/mg1802.md) |
| [판독: 어셈블리] mg1803 `@0x710000f4c0` | 4성분 m>2.5; cooldown≤0·canStab·꼬치 visible; cooldown=8분 길이 | CPU `@0x710000f5c4`: 매 swing sync offset reroll 결과0이어도 소비; debug mode 추가 sync, ctor async 계획 | [§6.5·6.8–6.9](../minigame/mg1803.md) |
| [판독: 어셈블리] mg1804 `@0x710000ee70` | 3성분 제곱합>thr²; thr=2.3+(4−2.3)·clamp(\|queue.front\|/8분,0,1); 실질 cooldown 없음 | PlayerManager `@0x710000ea90`: 프레임당 SyncRandMod(4,3,2) 3회; 양상추 등장 별도1회 | [§6.2·6.7](../minigame/mg1804.md) |
| [판독: 어셈블리] mg1805 `@0x710000e7e8` | 4성분 m>thr; JUST2.5·그 밖4.0; cooldown=.4/GetPlayRate | CPU `@0x710000e5e8`: 기본 진행 sync0; debug ComControl≠0 때 sync, ctor `@0x710000b7f0` async 계획 | [§6.5·6.10–6.11](../minigame/mg1805.md) |
| [판독: 어셈블리] mg1806 `@0x710000af68–0x710000afd8` | 4성분 m≥2.5 && prev<2.5; .125초; prev는 timer 종료 때만 갱신, ready=0이면 cooldown만 | PLAYER::Ready `@0x710000e2e0`: 기본 JUST·sync0; mode4 이상 선택 난수; comPlan과 실제 tracker.comCheck 구분 | [§6.1·6.5](../minigame/mg1806.md) |
| [판독: 어셈블리] mg1807 `@0x7100014a78` | 4성분 m≤1.5→0; 창 안 m<2.3→.1 아니면 .48; 창 밖 m≥4→.48; 모션 잠금이 1회 분리 | 게임 난수 호출0; 기본 CPU 창 type0/1·\|diff\|≤1 | [§6.1–6.2·8](../minigame/mg1807.md) |
| [판독: 어셈블리] mg1808 `@0x710001f8e0` | 4성분 m>3.0; cooldown≤0·자기 pancake 비행 아님; 본편 cooldown=8분+4f, 연습=8분 | SetComAttackTiming `@0x710001ec5c` gate 항상0; 기본 offset0; slip 경로 별도 sync×2 | [§6.3·6.7·8](../minigame/mg1808.md) |
| [판독: 어셈블리] mg1809 `@0x710000edbc` | 3성분 제곱합>3²; enabled·cooldown≤0·IDLE; 성공 뒤8분 cooldown과 PUSH/MISS 모션 잠금 | PlayerManager 실행에서 매 프레임 sync shuffle3회; CPU \|jt\|<2dt | [§4.5·6.2–6.4](../minigame/mg1809.md) |
| [판독: 어셈블리] mg1810 `@0x7100024ae0` | 4성분 m>thr; JUST/다음 창2.4·FAST/SLOW2.4+(4.8−2.4)·(\|d\|−jr)/(15−jr)·창 없음4.8; cooldown≤0·bumpStop 아님·allEnd 아님 | SetComAttackTiming `@0x7100023ffc` gate 항상0; sync 소비0, async 연출은 별도 | [§6.3·6.7–6.8](../minigame/mg1810.md) |

[판독] mg1810의 기본 cooldown은 .35/(BPM/120)+1/60이고 큰 순무 연타에서는 .175초로 바뀐다; mg1802/1806 상승 에지는 cooldown 중 prev를 계속 갱신하는 일반 detector와 다르다. mg1810 `@0x7100024ae0`, mg1802 `@0x710000e710`, mg1806 `@0x710000af68`; [mg1810 §6.3](../minigame/mg1810.md), [mg1802 §6.6](../minigame/mg1802.md), [mg1806 §6.1](../minigame/mg1806.md).

[설계] 3.0 G 고정 pulse는 >3.0 또는 4.0/4.8 문턱을 넘지 못한다; 키 대체값은 게임 profile의 문턱보다 큰 f32 벡터 또는 지속 profile로 정하고 원본 비교 연산은 그대로 둔다. 원본 mg1808 `@0x710001f8e0`, mg1810 `@0x7100024ae0`; [위 규칙 표](#63-리듬-게임별-입력-규칙).

## 7. 애니·효과·소리·카메라·에셋

[설계] motion 코어는 입력 값과 파형 callback만 낸다; 모션·소리·진동·카메라·에셋은 기존 게임 결과를 소비한다. [DESIGN §10.2–10.3](../../DESIGN.md), 원본 emitter main `@0x71000413d0`; [mg0118 §6.2](../minigame/mg0118.md).

| 연결 | 보존할 규칙 | 출처 |
|---|---|---|
| [판독] 리듬 입력→모션 | mg1802 swing은 입력 때, 소리는 모션 FX; mg1808 flip/throw는 hitCount로 선택 | mg1802 `@0x710000e710`, mg1808 OnMove `@0x710001f8e0`; [mg1802 §6.6·7.2](../minigame/mg1802.md), [mg1808 §6.3·6.5](../minigame/mg1808.md) |
| [판독] 수영·허들→actor | 파형 callback은 수영 추진·허들 점프에 연결; 세발은 별도 방향 log | mg0118 `@0x710001bfd0/@0x710001c36c/@0x710001a36c`; [§6.3·6.5·6.7](../minigame/mg0118.md) |
| [판독] 기울기→판·카메라 | mg1002 기울기 입력은 판 회전·공 중력 계약; motion이 카메라를 직접 바꾸지 않음 | mg1002 `@0x710000a680/@0x71000136bc`; [§6.1–6.2·7](../minigame/mg1002.md) |

[설계] 입력원별 진동 가능 여부는 별도 vibration 어댑터로 다루고, 진동 지원을 입력 정확도나 파형 판정의 전제로 삼지 않는다. [DESIGN §10.1](../../DESIGN.md), [05 §11](05_ui_input.md).

## 8. 상호작용

### 8.1 현재 웹 코드의 전달·공백

| 위치·필드 | 실제 상태 | 판정 |
|---|---|---|
| [데이터] [pad.ts:43](../../script/game/core/pad.ts) `emptyPad` | accX/Y/Z=0 | [설계] 무센서 기본값 |
| [데이터] [input.ts:57–67·103–112](../../script/view/input.ts) `KeyboardPad.read/GamepadPad.read` | emptyPad 후 버튼·스틱만 채움 | [데이터] 모션 값을 생성하지 않음; 실제 손실이 아니라 원천 부재 |
| [데이터] [input.ts:133–145·163](../../script/view/input.ts) `MergedPad.read` | 첫 유효 p는 spread; 이후 p는 버튼 OR·스틱만 병합; 첫 사람 source 순서 keyboard→gamepad | [데이터] 이후 source에 acc가 생겨도 병합되지 않는 구체적 지점 |
| [데이터] [host.ts:207](../../script/app/flow/host.ts) `localGate` | 각 PadSource.read 결과를 gate로 제공 | [데이터] 여기서 acc를 제거하지 않음 |
| [데이터] [gate.ts:8–28](../../script/app/minigame/frame/scene/gate.ts) `MgPadInput/localGate` | accX/Y/Z optional; read 반환 그대로 | [데이터] 제거 코드 없음; frame별 캐시도 없음 |
| [데이터] [flow.ts:308–337](../../script/app/minigame/frame/scene/flow.ts) `tick/step` | canStep false면 step 없음; accX/Y/Z를 입력에서 복사, 누락은0; update 후 frame++ | [데이터] MgPadState는 acc를 보존 |
| [데이터] [types.ts:130–139](../../script/app/minigame/frame/scene/types.ts), [mgGame.ts:57–71](../../script/app/minigame/kit/rhythm/mgGame.ts) | MgPadState 세 성분을 RmPadInput에 복사→readInput | [데이터] 리듬 연결에서도 acc 보존 |
| [데이터] [player.ts:103–108](../../script/app/minigame/mg1801/logic/player.ts) `humanSwing` | mag>params.acc 또는 NPAD.A down | [데이터] 현재 mg1801 버튼 대체는 별도 경로; 센서 pulse 구현 완료로 보지 않음 |

[데이터] 기존 감사 §2의 “flow에서 acc 손실” 문장은 현재 파일과 맞지 않는다; 가속도 전달을 검사하는 기존 시험도 있다. [common_system_audit §2](common_system_audit.md), [test_mgscene.ts:416–419](../../tools/test_mgscene.ts); 이번에는 실행하지 않았다.

[미확정] 현재 패드에는 angVel·posture·sample number·motion validity가 없다; acc만으로 mg0118 수영이나 mg1002 기울기를 원본처럼 연결할 수 없다. [pad.ts:29–43](../../script/game/core/pad.ts), 원본 main getter `@0x710003f878/@0x710003f8d0`; [mg0118 §6.2](../minigame/mg0118.md).

### 8.2 연결 계약

[설계] 입력원 병합은 버튼 OR와 별도로 motion 소유 source를 플레이어마다 하나 선택한다; 센서 벡터끼리 최대값·OR·가산을 하지 않는다. [input.ts:133–145](../../script/view/input.ts)의 공백, [DESIGN §10](../../DESIGN.md).

[설계] `app/minigame/frame`이 승인된 frame 입력을 `app/common/input`에서 받아 motion 코어에 공급하고, 게임은 해당 snapshot과 이벤트만 읽는다; 온라인 세션·재전송·합의는 [12_online_sync](12_online_sync.md)의 별도 책임이다. [gate.ts:19–24](../../script/app/minigame/frame/scene/gate.ts), [DESIGN §10.3](../../DESIGN.md).

## 9. 웹 설계

### 9.1 배치·API 경계

| 위치 | 책임 |
|---|---|
| [설계] `script/game/lib/motion/` | import0; 주입 f32 연산·정규화 sample·Converter·ring·WaveDetector·Value/Sum emitter; DOM·시계·난수 생성 없음 |
| [설계] `game/lib/motion-hid/`, `motion-dom/` | 자기 코어 상대 import; WebHID / DeviceMotion·터치 수집·단위·축·권한·장치 수명 |
| [설계] `app/common/input/` | PlayerID·style·입력 source·프로필·교정·연결 상태, 원시 패드와 actor sensor 구분 |
| [설계] `app/minigame/frame/` | FrameGate 입력 확정·snapshot→논리 tick·게임 context 공급 |
| [설계] `app/minigame/kit/rhythm/` | 공용 시계·프레임·난수 접점만; 게임 문턱을 공통값으로 합치지 않음 |
| [설계] `app/minigame/mg####/` | 게임별 setup·threshold·cooldown·CPU·callback·tilt/calib 정책 |
| [설계] <code>app/scene/&lt;menu&#124;world&#124;mode&#124;system&gt;/</code> | 화면 수명·PlayerWork·연결/조작 안내; 해당 단위 밖 게임을 직접 import하지 않음 |
| [설계] `script/dev/` | 가상 sample·재생·프레임 관찰 하네스; app→dev 호출0 |

[설계] 위 경계는 [DESIGN §10.1–10.4](../../DESIGN.md)의 원본 모듈 대응과 import 방향을 따른다; 고정1/60·주입 난수·FrameGate·f32를 유지하며 이 문서에서는 코드를 만들지 않았다.

### 9.2 입력원별 정확도·근사·지원 전제

| 입력원 | 목표 정확도·한계 | 어댑터 계약·지원 전제 |
|---|---|---|
| [설계] Joy-Con WebHID | 원본에 가장 가까운 acc/angVel 후보; raw 보고서만으로 원본 posture 동등성이 보장되지는 않음 | 장치 보고서·factory calibration·감도·LSB·센서 fusion 검증 후 G/회전수/s/좌표 변환; 단일 JoyLeft/Right 축을 1회만 적용 |
| [설계] 휴대폰 DeviceMotion | 크기 비교는 근사 가능; 기기 축·샘플 cadence·필터·posture는 Joy-Con과 다름 | 중력 포함 후보 값을 G로 정규화하는 배율1/9.80665를 권장; 이미 중력 제거된 값에 native RemoveGravity를 중복 적용하지 않음; posture는 별도 검증 |
| [설계] 터치 | 센서 측정 아님; 휘두름 pulse·기울기·수영/페달 지속 입력의 조작 근사 | 터치 시작/끝을 frame 이벤트로 확정; 게임별 pulse/지속/tilt profile; OS 이벤트 수를 Sum sample 수로 사용하지 않음 |
| [설계] 키·버튼 | 크기·축·자세를 물리적으로 재현하지 않는 조작 근사 | down에 pulse, 지속 게임은 hold profile; 반복 keydown은 추가 swing으로 만들지 않음; 상승 에지·모션 잠금은 게임 로직 유지 |
| [미확정] 브라우저 지원 | 현재 OS·브라우저·장치 지원 조합은 확인하지 않음 | WebHID 노출·Joy-Con 접근·휴대폰 권한/보안 문맥·센서 가용성은 실제 대상 환경 검증 필요; 특정 브라우저 지원을 단정하지 않음 |

[판독] 원본 GetAcc와 Converter는 서로 다른 의미의 값이다; 원시 acc를 받는 게임에 중력 제거 값을 주거나, Converter에 중력 제거 완료 값을 주는 혼합을 피한다. main `@0x71001932a0/@0x710003f930`; [05 §6.1](05_ui_input.md), [mg0118 §6.2](../minigame/mg0118.md).

[설계] 단위·좌표·중력 포함 여부·posture convention·교정 revision을 입력 profile에 명시한다; 기기의 위쪽과 원본 −UnitY를 같은 방향이라고 가정하지 않는다. 원본 main `@0x710003f930/@0x71007e5584`; [mg0118 §6.2](../minigame/mg0118.md), [05 §6.2](05_ui_input.md).

### 9.3 FrameGate·온라인 결정성 계약

[설계] 다음은 구현 전 계약이다; 현재 `localGate`는 즉시 read만 하며 frame 캐시나 motion wire 규약을 제공하지 않는다. [gate.ts:26–28](../../script/app/minigame/frame/scene/gate.ts), [DESIGN §3·10](../../DESIGN.md).

| 단계 | 계약 |
|---|---|
| [설계] 비동기 수집 | 브라우저 callback은 로컬 sample queue만 갱신; Converter·Sum·CPU·게임 상태를 직접 갱신하지 않음 |
| [설계] 제출 frame | 로컬 입력 담당자가 다음 제출 frame에 sample 하나를 선택·단위/축 정규화·f32 고정; profile revision과 validity를 함께 확정 |
| [설계] sensor snapshot | acc3·angVel3·posture4·필요한 sample 식별자를 전달하는 확장안; acc4의 w가 확정되면 보존 필드 추가 여부를 결정 |
| [설계] latch | `inputsFor(frame)`은 불변 사본이며 같은 frame의 반복 읽기·재전송·재생은 같은 비트열; 늦은 sample은 이미 제출한 frame을 덮지 않음 |
| [설계] 승인 경계 | `canStep=false` 동안 센서 수집은 가능하지만 Converter 링·파형·emitter·쿨다운·교정·난수 소비는0; 승인 뒤 논리 tick1회 |
| [설계] 계산 위치 | 정규화 원시 sample을 frame 입력에 넣고 각 peer가 같은 setup·profile·f32로 Converter/Wave를 계산; 센서 이벤트를 각 peer의 로컬 벽시계로 다시 만들지 않음 |
| [설계] 누락·재연결 | validity와 reset 사건을 frame에 포함; 오래된 sample 반복/zero 선택은 결정된 profile로 수행하고 자동으로 Sum에 새 sample을 추가하지 않음 |
| [설계] RNG | 실제 게임 호출 순서·sync/async stream을 주입; 입력 장치·permission·네트워크 도착 시각으로 RNG를 소비하지 않음 |
| [설계] 온라인 연결 | 입력 packet 확장·직렬화·frame 승인은 [12_online_sync](12_online_sync.md) 담당; 여기서는 필요한 필드·불변성만 제공 |

[설계] 최신 sample의 cutoff 선택은 웹 권장안이며 native 직접 GetAcc의 “최신”이 확인된 사실은 아니다; 새 센서가 없는 frame에 마지막 sample을 재사용할지와 source sample 중복 여부를 분리한다. main `@0x71001932a0/@0x710003f020`; [05 §6.2](05_ui_input.md), [mg0118 §6.2](../minigame/mg0118.md).

[미확정] native가 새 sample 0인 frame에서도 detector/Sum을 어떻게 갱신하는지와 샘플 번호 중복 처리 전체는 기존 요약만으로 확정할 수 없다; 위 누락 정책의 원본 동등성은 아직 주장하지 않는다. main `@0x710003f020/@0x7100040cc0`; [mg0118 §6.2](../minigame/mg0118.md).

## 10. 검증 기대값

[설계] 아래는 기존 판독에서 유도한 기대값과 앞으로 필요한 정적/단위 검증이며 이번 원본 실행·신규 계산 실행 결과가 아니다. 원본 main `@0x7100040cc0/@0x71000413d0`; [mg0118 §6.2](../minigame/mg0118.md).

| 대상 | 입력·기대값 | 근거 |
|---|---|---|
| [판독] Wave 시작 경계 | mag=thr는 시작; mag<thr는 종료; dot=0은 반전 아님 | main `@0x7100040cc0`; [mg0118 §6.2](../minigame/mg0118.md) |
| [판독] Sum·재발사 | y .5×5·thr .25·test2.5 →5번째 callback1회; 같은 방향 .5 지속은 추가0, −.5는 새 파형 | main `@0x7100040cc0/@0x71000415e4/@0x71000413d0`; [mg0118 §6.2](../minigame/mg0118.md) |
| [판독] Sum0 | 첫 시작 sample에서 test0 만족; state3 값은 합에 더하지 않음 | main `@0x71000415e4`, mg0906 `@0x7100028fa0`; [mg0906 §6.2](../minigame/mg0906.md) |
| [판독] Value | test=value이면 통과, 같은 파형 지속 발사0 | main `@0x71000415ac/@0x71000413d0`; [mg0118 §6.2](../minigame/mg0118.md) |
| [판독] getter 초기 | 샘플 없음→acc0·angVel0·posture 단위 | main `@0x710003f820/@0x710003f878/@0x710003f8d0`; [mg0118 §6.2](../minigame/mg0118.md) |
| [판독] resize | BufferSize0→1; 음수→Abort | main `@0x710003f7c4`; [sixaxis.c](../../../analysis/decomp/mgA_main_sixaxis.c) |
| [판독] tilt | 단위 posture→0; mg1002 X+20°→X+10°, X+40°→17° clamp | mg1002 `@0x710000a680`; [§6.1 기존 계산 표](../minigame/mg1002.md) |
| [판독: 어셈블리] 리듬 경계 | mg1802 2.4 상승은 통과, mg1806 2.5 상승은 통과; mg1808/1809 크기3.0 정확히는 실패 | mg1802 `@0x710000e710`, mg1806 `@0x710000af68`, mg1808 `@0x710001f8e0`, mg1809 `@0x710000edbc`; [§6.3 표](#63-리듬-게임별-입력-규칙) |
| [판독] raw getter 유효성 | provider 없음 또는 count≤0→성분0; count>0→acc.x/angVel.x/angle.x/direction 행 첫 성분; 새 샘플 수 판단과 구분 | main @0x71007e0790/@0x71007e0880/@0x71007e09b0/@0x71007e0ae0/@0x71007e0c10/@0x71007e0d40/@0x71007e0e70; [sixaxis4.c](../../../analysis/decomp/mgA_main_sixaxis4.c) |
| [판독] 행·mask 보정 | 행(1,2,3)→(1,3,−2); mask=2의 벡터(1,−2,3,w)→(0,−2,0,0) | main @0x7100037660/@0x71000373e0; [sixaxis4.c](../../../analysis/decomp/mgA_main_sixaxis4.c) |
| [판독] mg0906 비교식 경계 | T=1에서 a=−1→통과, a=1→반환; a=0·b=1·c=0→통과, a=0·b=.5·c=.5→반환; 물리 축 시험으로 확대하지 않음 | mg0906 @0x710002968c; [C](../../../analysis/decomp/motion_gap_mg0906.c), [§6.2.1](#621-mg0906-callback의-c-보충) |
| [데이터] 현재 전달 시험 | gate accX1.5·accZ−.5→ctx.pad 같은 값이라는 assert 존재; 이번 실행0 | [test_mgscene.ts:416–419](../../tools/test_mgscene.ts) |
| [설계] 결정성 | 동일 frame snapshot·setup·profile·RNG 상태→동일 f32 출력·wave count·발사 순서; gate 대기·그리기 횟수 변경 영향0 | [gate.ts](../../script/app/minigame/frame/scene/gate.ts), [DESIGN §3·10](../../DESIGN.md) |
| [설계] 병합 | keyboard0 + 선택 motion source≠0→선택 source의 벡터 보존; 두 센서의 최대값 병합 금지 | 현재 공백 [input.ts:133–145](../../script/view/input.ts) |

[미확정] 원본 quaternion helper의 수치 동등성·센서 정지 축·native 샘플 누락·4번째 acc 값은 위 기대값만으로 검증되지 않는다. main `@0x710003f930/@0x71001932a0`; [05 §6.1–6.2](05_ui_input.md), [mg1002 §6.1](../minigame/mg1002.md).

[데이터] 정적 링크 및 PowerShell의 기존 Markdig(CommonMark+PipeTables+GitHub 절 ID) HTML 검증에서 링크275개·참조식 정의0개·표23개/본문166행·표 열수 오류0개·상대 경로 오류0개·본문 절 링크 오류0개를 확인했다; 수식4행과 코드 예시2행의 내부 파이프를 처리해 링크가 표 밖으로 밀리지 않게 했다. 코드 span/fence·통합용 literal 예시·분류 태그·괄호 설명은 링크 오류로 세지 않았다. 검증 대상은 `web/docs/engine/19_motion_input.md`이며 UTF-8 BOM 없음·LF만 사용한다.

## 11. 미확정

| ID | 미확정·영향 | 근거·다음 작업 |
|---|---|---|
| [미확정] M01 | 직접 GetAcc writer와 최신/평균/최대 선택 | main reader @0x71001932a0; [05 §6.2](05_ui_input.md); 패드 연결·HID 설정 후보는 writer에서 제외했으나 실제 주소는 미식별 |
| [미확정] M02 | GetAcc 4번째 w가 항상0인지 | main reader @0x71001932a0; [05 §6.1](05_ui_input.md); mask helper @0x71000373e0의 w=0은 별개 경로이므로 writer 확보 필요 |
| [미확정] M03 | 부분 해소: direction 행 변환은 확정; 물리 축·회전 방향·중력 sign 대응은 잔여 | main @0x7100037660/@0x71000373e0/@0x710144c890; [§6.1](#61-sampling변환getter), SDK 실제 구현은 미확보 |
| [미확정] M04 | 부분 해소: message 동기 호출·sensor 추가 순서는 확정; Player 배열 순서·flag clear 전후는 잔여 | main @0x710003e500, mg0119 @0x710000abc4; [§3](#3-진입점호출-흐름), [17 §3.2·6.6](17_actor.md) |
| [미확정] M05 | 부분 해소: 무provider/빈buffer getter0은 확정; sample0·중복 번호의 detector/Sum 처리는 잔여 | main @0x71007e0790/@0x71007e0880; [§6.1](#61-sampling변환getter); provider 가상+0x10/+0x28의 구현 소유자 식별 필요 |
| [미확정] M06 | 부분 해소: early-return 비교식은 확정; 반환 성분 x/y/z 대응·간접 호출 이름·함수 경계는 잔여 | mg0906 @0x710002968c; [§6.2.1](#621-mg0906-callback의-c-보충), 새 [motion_gap_mg0906.c](../../../analysis/decomp/motion_gap_mg0906.c); TSV 행 없음은 C 부재와 구분 |
| [미확정] M07 | 부분 해소: 고정200 setup·해제는 확정; 실행 중 resize 정합성만 잔여 | main @0x710003f7c4/@0x710003f570/@0x7100040410; [§5](#5-상태수명); 고정 용량 기본 구현의 차단 항목에서 제외 |
| [미확정] M08 | WebHID 보고서·감도·calibration·fusion과 원본 posture 동등성 | 장치 원천별 검증 미실시; 기존 후보 [05 §6.5](05_ui_input.md), native 비교 main `@0x710003f930` |
| [미확정] M09 | 휴대폰 단위·축·권한·sensor 가용성과 브라우저/OS 지원 조합 | 현재 사실 미확인; [§9.2 설계](#92-입력원별-정확도근사지원-전제), native 축 main `@0x71007e5584` |
| [미확정] M10 | native trig 근사와 JS trig의 경계 오차 | mg1002 `@0x710000a680`; [§6.1](../minigame/mg1002.md); “f32 수준 차이”를 검증 사실로 채택하지 않음 |

[데이터] 후속 판독의 미확정 집계는 완전 해소0·부분 해소5(M03–M07)·그 밖 잔여5, 총10 ID다; M07은 고정 용량 기본 구현을 막지 않는다. [위 목록](#11-미확정), [§5](#5-상태수명).

[판독] mg0119 value 정의는 미확정 목록에서 제외했다; 기존 공용 판독으로 `length(mask(v))`임이 확인되어 있으며 출처 문장의 직접 수정은 부모 통합에 맡긴다. main `@0x7100040cc0/@0x71000415e4`; [17 §8.5](17_actor.md).

## 12. 사용자 확인

[설계] 승인된 기본은 원본 규칙·[DESIGN §10](../../DESIGN.md) 경계다; 아래 선택은 미승인 추천으로 기록하며 이번 문서 작성의 진행을 막지 않는다.

| 선택 | 미승인 추천·이유 | 근거 |
|---|---|---|
| [설계] 입력원 기본 | 키/터치 대체와 실센서 profile을 명시적으로 구분; 장치가 있으면 검증된 sensor profile 선택 | 원본 main `@0x71001932a0/@0x710003f930`; [05 §6](05_ui_input.md), [§9.2](#92-입력원별-정확도근사지원-전제) |
| [설계] 대체 난이도 | 게임 문턱·쿨다운 유지, 대체 pulse 세기·지속 길이는 profile에서 결정 | mg1808 `@0x710001f8e0`, mg1810 `@0x7100024ae0`; [§6.3](#63-리듬-게임별-입력-규칙) |
| [설계] 무센서·교체 | validity/reset 사건을 frame 입력에 담고 자동 입력원 교체는 논리 경계에서 실행 | native ClearBuffer main `@0x710003f730`; [§5](#5-상태수명), [§9.3](#93-framegate온라인-결정성-계약) |
| [설계] 모바일 자세 | acc 크기 전용 profile부터 적용하고 tilt/각속도 게임은 별도 교정 완료 뒤 제공 | 원본 main `@0x710003f878/@0x710003f8d0`; [mg1002 §6.1](../minigame/mg1002.md) |

## 13. 준비도

| 준비도 | 범위 | 근거·조건 |
|---|---|---|
| [설계] 바로 가능 | import0 motion 코어의 ring·getter·옵션 순서·Wave·Value/Sum; game별 문턱 profile과 현재 acc 전달 유지 | main `@0x710003f930/@0x710003f820/@0x7100040cc0/@0x71000413d0`; [mg0118 §6.2](../minigame/mg0118.md), [§8 코드](#81-현재-웹-코드의-전달공백); posture 회전 helper는 M03의 제한 명시 |
| [설계] 근사 필요 | 키/버튼·터치·휴대폰 크기 입력, 입력 병합·snapshot·motion packet 확장 | [§9](#9-웹-설계), [DESIGN §10](../../DESIGN.md); 원본 정밀도와 조작 근사를 구분 |
| [설계] 판독 필요 | 직접 패드 writer·w·물리 축·Player tick 순서·새 sample0/중복 번호·mg0906 callback·trig; 동적 resize는 선택 확장 | [§11 M01–M07·M10](#11-미확정), [부록 C](#부록-c-추출-요청-표) |
| [미확정] 환경 검증 필요 | Joy-Con WebHID·휴대폰 센서·permission·브라우저 호환성 | [§11 M08–M09](#11-미확정); 현재 지원 확정 없음 |

## 부록 A. 출처 대응

| 정리본 절 | 기존 절·모듈·주소 | 처리 |
|---|---|---|
| [판독] §1·3·4·6.1 | [05 §6.1–6.5](05_ui_input.md); main `@0x71001932a0/@0x71007e5d10/@0x71007e5584` | 기존 판독 재사용; 브라우저 지원 문장은 현재 사실로 채택하지 않음 |
| [판독] §3·6.1–6.2 | [mg0118 §6.2](../minigame/mg0118.md), [17 §8.5](17_actor.md); main `@0x710003f930/@0x7100040cc0/@0x71000413d0` | 재판독0, 공용 파형 정의 보존 |
| [판독] §6.2·10 | [mg0119 §6.2](../minigame/mg0119.md) `@0x710000b21c`; [mg1002 §6.1](../minigame/mg1002.md) `@0x710000a680` | value 공백 해소·tilt 식 재사용 |
| [판독: 어셈블리] §6.2·11 | [mg0906 §6.2](../minigame/mg0906.md) `@0x7100028fa0/@0x71000293bc/@0x710002968c` | 후속 C의 비교식은 §6.2.1에 보충; 축·경계는 확정하지 않음 |
| [판독] §6.3·7·10 | mg1802–1810 각 문서·NRO·주소는 [§6.3 표](#63-리듬-게임별-입력-규칙) | 기존 게임 함수 재판독0 |
| [판독] §2·9 | [02 §5.1·14.1](02_rhythm.md); main `@0x7100425d90/@0x7100425df0` | 시계·kit 책임 재사용 |
| [데이터] §8 | [common_system_audit §2](common_system_audit.md), [flow.ts:321](../../script/app/minigame/frame/scene/flow.ts), [mgGame.ts:65](../../script/app/minigame/kit/rhythm/mgGame.ts) | 감사의 acc 손실 가정과 현재 코드 차이 명시 |
| [설계] §9·12·13 | [DESIGN §10](../../DESIGN.md) | 공용 import0·adapter·app/dev 방향 준수 |

## 부록 B. 새 판독 목록

[데이터] 새 C 판독은 최초5함수+후속29함수=누적34함수(main32·mg0119 1·mg0906 1)다; 후속29는 아래18함수의 확인과 제외 후보11함수로 나뉜다; 핵심 Converter·getter·WaveDetector·emitter와 게임별 기존 판독 함수는 다시 읽지 않았다. 주소·이름·C 존재는 [INDEX.tsv](../../../analysis/decomp/INDEX.tsv)·[main.nso.tsv](../../../analysis/functions/main.nso.tsv)로 확인했다.

| 모듈·주소 | 기존 C | 새로 확인한 공백 |
|---|---|---|
| [판독] main `@0x710003f49c` | [sixaxis2.c:49](../../../analysis/decomp/mgA_main_sixaxis2.c) | factory 할당0x88·ctor 호출 |
| [판독] main `@0x710003f4f8` | [sixaxis3.c:2](../../../analysis/decomp/mgA_main_sixaxis3.c) | 초기 옵션 RemoveGravity1·Inverse0·Rotate0와 빈 링 |
| [판독] main `@0x710003f730` | [sixaxis.c:161](../../../analysis/decomp/mgA_main_sixaxis.c) | 유효 detector reset·링 관리 영역 clear |
| [판독] main `@0x710003f7c4` | [sixaxis.c:184](../../../analysis/decomp/mgA_main_sixaxis.c) | 음수 Abort·0→1·stride0x40 resize |
| [판독] main `@0x7100040598` | [sixaxis.c:732](../../../analysis/decomp/mgA_main_sixaxis.c) | detector reset의 오프셋별 초기화 |

### B.1 후속 확인18함수

| 모듈·주소(중복 제거) | 기존 C·확인한 공백 |
|---|---|
| [판독] main @0x71007e0790/@0x71007e0880/@0x71007e09b0/@0x71007e0ae0/@0x71007e0c10/@0x71007e0d40/@0x71007e0e70 (7) | [sixaxis4.c:1063–1224](../../../analysis/decomp/mgA_main_sixaxis4.c); provider/count 유효 검사·raw 성분 반환 |
| [판독] main @0x7100037660/@0x71000373e0/@0x710144c890 (3) | [sixaxis4.c:185,902,1214](../../../analysis/decomp/mgA_main_sixaxis4.c); direction 행 변환·mask w=0·SDK 위임 |
| [판독] main @0x710003e500/@0x710003e824 (2) | [sixaxis3.c:827,580](../../../analysis/decomp/mgA_main_sixaxis3.c); message wrapper·vtable+0x50 반환이며 Player tick 우선순위는 미확정 |
| [판독] main @0x710003f570/@0x7100040410 (2) | [sixaxis4.c:1318](../../../analysis/decomp/mgA_main_sixaxis4.c), [sixaxis3.c:104](../../../analysis/decomp/mgA_main_sixaxis3.c); Converter/detector 해제 |
| [판독] main @0x710003eac0/@0x710003eb1c (2) | [sixaxis3.c:41](../../../analysis/decomp/mgA_main_sixaxis3.c), [sixaxis4.c:1249](../../../analysis/decomp/mgA_main_sixaxis4.c); sensor 관련 factory 0xD0 할당·ctor 관리 영역 초기화, +0x1C0 writer는 아님 |
| [판독] mg0119 @0x710000abc4 (1) | [mgD_mg0119_game.c:6909](../../../analysis/decomp/mgD_mg0119_game.c); sensor AddComponent 뒤 입력 ctor |
| [판독] mg0906 @0x710002968c (1) | [motion_gap_mg0906.c:1](../../../analysis/decomp/motion_gap_mg0906.c); early-return 비교식·간접 호출, 축·후반 경계는 미확정 |

### B.2 제외 후보11함수

| 모듈·주소(중복 제거) | 제외 이유·출처 |
|---|---|
| [판독] main @0x710003e540/@0x710003e5a0/@0x710003e980/@0x710003e850/@0x710003e82c (5) | 해제·type descriptor 경로; tick 등록 순서를 정하지 않음. [sixaxis3.c:328–732](../../../analysis/decomp/mgA_main_sixaxis3.c) |
| [판독] main @0x7100110324/@0x71007f142c/@0x7100111470/@0x71001115dc (4) | controller handle 조회·stick 조회·pad 연결 후보; 직접 acc+0x1C0/+0x1D0 writer가 아님. [sixaxis4.c:1005](../../../analysis/decomp/mgA_main_sixaxis4.c), [ui_pad_update.c](../../../analysis/decomp/ui_pad_update.c); 네트워크 경로의 추가 판독은 하지 않음 |
| [판독] main @0x71007e63c8 (1) | HID 설정 객체+0x1C0은 bool 설정이며 패드 acc 벡터가 아님. [ui_hid_callers.c:35](../../../analysis/decomp/ui_hid_callers.c) |
| [판독] main @0x7100040b30 (1) | emitter handle 저장·확장 경로; 확장 후반의 inlined 파형 코드로 일반 frame/tick 순서를 새로 확정하지 않음. [sixaxis.c:1212](../../../analysis/decomp/mgA_main_sixaxis.c) |

[데이터] main @0x710003e5a0/@0x710003e824/@0x710003e82c/@0x710003e850은 main TSV의 독립 행이 없으나 INDEX의 main 전용 C 헤더·vtable 표기를 확인했다; 같은 숫자의 다른 NRO 함수를 근거로 쓰지 않았다. [INDEX.tsv](../../../analysis/decomp/INDEX.tsv), [sixaxis3.c](../../../analysis/decomp/mgA_main_sixaxis3.c).

## 부록 C. 추출 요청 표

[미확정] 실제 추출은0회다; 중복 제거한 주소는3개(일반/후보2·SDK external stub1), 주소 미식별3건이다. 후보를 실제 getter로 확정하지 않으며 SDK stub을 구현 주소로 세지 않는다. [INDEX.tsv](../../../analysis/decomp/INDEX.tsv), [main.nso.tsv](../../../analysis/functions/main.nso.tsv), [mg0906.nro.tsv](../../../analysis/functions/mg0906.nro.tsv).

| 주소 | 모듈 | 이유·C 존재 확인 |
|---|---|---|
| [미확정] @0x710002968c | mg0906.nro | 최신 [INDEX](../../../analysis/decomp/INDEX.tsv)의 [motion_gap_mg0906.c](../../../analysis/decomp/motion_gap_mg0906.c) 확보·판독 완료; 새 추출 대신 반환 ABI·extraout_* 축 대응·@0x7100029770 간접 점프 후 경계 재검토 요청; 함수 TSV 독립 행은 미확보 |
| [미확정] @0x71007e0fa0 | main NSO, 후보 | [main TSV](../../../analysis/functions/main.nso.tsv)의156 B·16B 반환 함수; 기존 scalar getter군과 인접하나 호출 소속·posture getter 여부는 미확정, caller xref 확인 뒤 raw state 반환 계약 확보 요청; [INDEX](../../../analysis/decomp/INDEX.tsv) 및 기존 C 없음 |
| [미확정] @0x7101eff000 | main 외부 import, 실제 SDK 소유 모듈 미식별 | GetQuaternion stub의 size1; [main TSV](../../../analysis/functions/main.nso.tsv), INDEX C 없음. 실제 구현·좌표 정의 요청이며 wrapper @0x710144c890 판독이나 stub 디컴파일로 해결 불가 |
| [미확정] 주소 미식별 | main 직접 패드 writer | reader @0x71001932a0의 acc+0x1C0/+0x1D0 sampling·w. [05 §6.1–6.2](05_ui_input.md), [부록 B.2 제외 후보](#b2-제외-후보11함수); reader·controller 연결·HID bool writer를 대상 주소로 대체하지 않음 |
| [미확정] 주소 미식별 | main raw sensor provider | main @0x71007e0790/@0x71007e0880이 호출하는 provider 가상+0x10(count)/+0x28(state)의 실제 소유자·함수 주소; [sixaxis4.c](../../../analysis/decomp/mgA_main_sixaxis4.c); sample0·중복 번호의 유효 범위 확인 |
| [미확정] 주소 미식별 | main component timing·게임 등록부의 잔여 | mg0119 caller @0x710000abc4는 확보했으나 Player 배열 순서·flag clear 전후는 미확보; [§3](#3-진입점호출-흐름), [17 §3.2·6.6](17_actor.md); 이미 판독된 sensor tick 재추출 대신 인스턴스 등록 순서 근거 식별 |

## 부록 D. 부모 통합용 추가 한 줄

[설계] 아래는 첫 통합용 행의 보존본이다; 출처 연결은 부모가 완료했으며 이번 후속의 추가 통합 행은0개다; 기존 본문 변경 없이 엔진 README 한 행과 각 출처 절 끝 정리본 링크 한 줄만 추가하고 기존 줄바꿈을 보존한다. [DESIGN §10](../../DESIGN.md).

| 파일·추가 위치 | 추가 한 줄 |
|---|---|
| [설계] `web/docs/engine/README.md` 엔진 문서 목록 | <code>&#124; &#91;19_motion_input.md&#93;&#40;19_motion_input.md&#41; &#124; &#91;설계&#93; Converter·파형·입력원·FrameGate 결정성 계약 &#124; 분석 정리본 &#124;</code> |
| [설계] `web/docs/engine/05_ui_input.md` §6 끝 | `[설계] → 정리본: [19_motion_input.md](19_motion_input.md) §3, 6, 8–9` |
| [설계] `web/docs/engine/02_rhythm.md` §10 끝 | `[설계] → 정리본: [19_motion_input.md](19_motion_input.md) §6.3, 9.3` |
| [설계] `web/docs/engine/common_system_audit.md` §2 끝 | `[설계] → 정리본: [19_motion_input.md](19_motion_input.md) §8（현재 FrameGate·MgPadState는 acc를 보존）` |
| [설계] `web/docs/engine/17_actor.md` §8.5 끝 | `[설계] → 정리본: [19_motion_input.md](19_motion_input.md) §5–6, 9` |
| [설계] `web/docs/minigame/mg0118.md` §6.2 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §3–6, 9` |
| [설계] `web/docs/minigame/mg0119.md` §6.2 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.2（value는 길이 합）, 9` |
| [설계] `web/docs/minigame/mg1002.md` §6.1 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.2, 9.2` |
| [설계] `web/docs/minigame/mg0906.md` §6.2 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.2, 11, 부록 C` |
| [설계] `web/docs/minigame/mg1802.md` §6.6 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.3, 9.3` |
| [설계] `web/docs/minigame/mg1803.md` §6.5 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.3, 9.3` |
| [설계] `web/docs/minigame/mg1804.md` §6.2 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.3, 9.3` |
| [설계] `web/docs/minigame/mg1805.md` §6.5 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.3, 9.3` |
| [설계] `web/docs/minigame/mg1806.md` §6.1 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.3, 9.3` |
| [설계] `web/docs/minigame/mg1807.md` §6.1 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.3, 9.3` |
| [설계] `web/docs/minigame/mg1808.md` §6.3 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.3, 9.3` |
| [설계] `web/docs/minigame/mg1809.md` §6.2 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.3, 9.3` |
| [설계] `web/docs/minigame/mg1810.md` §6.3 끝 | `[설계] → 정리본: [19_motion_input.md](../engine/19_motion_input.md) §6.3, 9.3` |

