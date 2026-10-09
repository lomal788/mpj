# 11. 움직이는 충돌 — 부착 포즈·강체 동기화·Ray/Capsule 질의

2026-10-09. 상태: **공통 캡슐·접촉·접지 규약 판독 완료 / 웹 API 설계 제안 / 게임별 포즈 시점·ActorParam 소비 미확정 / SDK 내부는 PhysX 4.1 공개 소스 기준(§8)**.

확정 수준 표기: **[실행]** 원본 실행 확인, **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**. 이 문서에 [실행]은 없다. 재구현 계산은 **재구현 계산**이라고 따로 적는다.

주소는 `main.nso`의 SwitchLoader 베이스 `0x7100000000` 기준이며, 게임 주소는 `mgXXXX.nro`를 함께 적는다. 원본 실행·물리 구현·포팅·에셋 변경은 하지 않았다. 아래 **웹 설계 제안**은 추가해야 할 계약이며 현재 제공되는 API가 아니다.

## 1. 범위와 기존 분석 재사용

[06_scene_data.md §1·§5](06_scene_data.md)은 PhysX/APX 자산과 로딩을 다룬다. 이 문서는 움직이는 형상의 **포즈 전달 시점, 질의 입출력, 접촉 보정, 웹 상태 계약**을 보완한다. 이미 확정한 게임별 계산·기본 프레임 분석은 아래 문서를 재사용한다.

| 항목 | 기존 근거와 이 문서의 적용 범위 |
|---|---|
| 프레임 단계·Entity 의존 정렬 | [mg0101 §3.6](../minigame/mg0101.md), [mg0122 §3.5](../minigame/mg0122.md). Scene/Fiber→Entity→Physics→Entity 후처리와 컴포넌트 배열 순서 재사용. 모든 게임에 Map→Actor→Player 순서를 가정하지 않음 |
| Box 크기 | [mg0101 §4.4](../minigame/mg0101.md). `ActorHitShape::SetSourceBox @0x710001cda0`→`FUN_710001c6cc`→`CollisionShape::CreateBox @0x7100602f58`. 인자를 반으로 나누지 않으며 `GetBoxHalfExtents @0x71006035e4`도 그대로 반환 |
| 부착 TRS | [mg0508 §4](../minigame/mg0508.md). 위치1·회전1·스케일0의 의미 재사용. 이번 보완은 부착 수신 메시지→Entity 변경→강체 갱신의 연결 |
| Actor 적분·접지·침투 보정 | [mg0912 §6.1~6.4](../minigame/mg0912.md). `DetectContactsMap`→`DefaultAdjustCharacterVsMap`→`DefaultFinalizeCharacterVsMap` 및 접지 CastShape/CastRay 조건 재사용 |
| 움직이는 정적 형상 사례 | [mg0106 §4·§6.2·§6.5·§9.3](../minigame/mg0106.md). 부착 B/C/D Box, Route 질의, 고유 carry. Boo·Wanwan·반경 제한·감전 탈출 계산은 게임 문서에만 둠 |
| Dynamic와 회전 판 사례 | [mg1002 §4.4·§6.2~6.3](../minigame/mg1002.md). Dynamic 공·중력 힘·DetectionType1·물리 후처리와 시각/충돌 루트 분리 |
| 시간·정지·현재 웹 이동 | [01_core.md §3~5](01_core.md), [plaza_3d.md §3.2·§3.5](../shell/plaza_3d.md). 기존 시간·pause와 Collider 한계 재사용 |

## 2. 원본의 소켓→Entity→강체 연결 [판독]

### 2.1 부착과 애니메이션 포즈

`ComAttachment` 생성 `FUN_710088790c`의 수신 플래그 기본값은 **7**이다. 수신 `FUN_710088848c`는 bit2/0/1에 따라 각각 **0x5F454E02 / 03 / 09**에서 `FUN_7100887fc8`을 호출한다. 다른 플래그 설정은 호출 횟수·시점을 바꿀 수 있다. `SetTarget(ISocket) @0x7100887d84`는 유효한 대상과 순환을 검사하고, 모드 **0·3**의 Entity 의존 관계에 소켓 소유자를 연결한다. EN12/13에서 이름 대상 재조회 경로도 있다.

평가 함수는 활성 소켓 소유자의 ISocket 가상 호출 **+0x30**으로 TRS를 얻는다. 위치 모드1은 소켓 TRS로 로컬 오프셋을 변환해 `Entity.SetTranslation`, 회전 모드1은 소켓 회전과 로컬 회전을 합성해 `Entity.SetRotation`, 스케일 모드1만 소켓 스케일×로컬 스케일을 `Entity.SetScale`에 쓴다. **스케일 모드0은 자식 스케일을 유지**한다. 위치 오프셋의 TRS 변환과 자식 형상 크기 복사는 별개다.

애니메이션 슬롯 진행과 본 포즈 평가 완료도 별개다. 기존 [mg0101 §6.1](../minigame/mg0101.md)의 **0B 슬롯 진행**을 소켓 완성 시점으로 해석하지 않는다. [mg0122 §3.5](../minigame/mg0122.md)의 Rigger `FUN_71006b0b60`는 UpdateTiming0일 때 EN09, Timing1일 때 AN03을 받으며 Timing0은 Animator+0x23C 조건으로 건너뛸 수 있다. `Animator @0x710081c6e0`→AN03, RTTS `@0x710070dea0`→`FUN_71006b0808`의 Timing 덮어쓰기까지 포함하여 **게임별 실제 설정**을 확인해야 한다.

### 2.2 변경 통지와 물리 포즈

| 단계 | 원본 연결과 효과 |
|---|---|
| Entity 포즈 작성 | `SetTranslation @0x7100893a90`, `SetRotation @0x7100893b10`은 위치/quat와 dirty 비트를 갱신. 활성 Entity의 최초 변경은 `FUN_71008a34bc`→`FUN_71008a19c0`의 큐에 등록 |
| 변경 통지 | 큐 작업 `FUN_71008a26d0`→`Entity.SyncTransform @0x7100892d50`. dirty를 소비하고 캐시 변환을 갱신한 뒤 **EN0A**를 수신 대상 컴포넌트에 전달. SetTranslation 자체가 강체 포즈를 즉시 바꾸는 경로는 아님 |
| 강체 변경 표시 | `ComCollision` 수신 `FUN_710060888c`가 EN0A에서 **컴포넌트+0x48=1**을 설정 |
| 물리 전 동기화 | `FUN_7100614ce0`는 등록된 컴포넌트 중 Entity tick mask가 맞는 것을 순회. `FUN_71006085dc`→가상 **+0x70**에 변경 표시를 전달한 뒤 표시를 지움. ComRigidBody 구현은 `FUN_71006097b4` |
| 물리→Entity | 물리 메시지 **0x5F503106**에서 수신 함수가 가상 **+0x78**, ComRigidBody `FUN_71006098c4`를 호출. 생성 `FUN_710060938c`의 위치/회전 적용 플래그(+0x61/+0x62)는 기본1 |
| Teleport | `Entity.Teleport @0x7100893030`은 **EN0B를 동기 전달**. 가상+0x68 `FUN_710060970c`가 현재 Entity 위치/회전을 즉시 강체에 설정. Dynamic만 선속도·각속도0; Static/Kinematic은 해당 reset 분기를 통과하지 않음 |

**큐→SyncTransform→EN0A→물리 전 포즈 반영**은 확인했다. 큐 작업의 모든 호출 장벽과 게임별 Query 대비 선후관계는 아직 고정하지 않았다. Ray/Sweep 래퍼는 이 큐를 강제 flush하지 않는다. 따라서 게임 로직이 읽는 Entity 포즈와 당시 PhysX에 반영된 포즈를 동일 시점이라고 단정할 수 없다.

### 2.3 Static / Kinematic / Dynamic

`RigidBody` 생성 `FUN_710062ce50`에서 MotionType **0은 Static**, 비0은 Dynamic actor 생성 후 **1일 때 kinematic 플래그**를 켠다. **2는 Dynamic**이며 mg1002 호출과도 일치한다. `FUN_710062d5d4`의 +0x274/+0x275와 `FUN_71006097b4`의 분기를 연결하면 다음과 같다.

| MotionType | 일반 동기화 | 충돌/이동 의미 |
|---|---|---|
| 0 Static | 변경 표시가 있을 때만 Entity T/q→`Collision.SetTransform @0x710060034c`→`FUN_7100601580`→SDK actor 가상+0xA0에 포즈 전달 | **Static도 Entity 변경으로 옮길 수 있음**. 연속 회전 경로·자체 속도가 자동 생성된다는 근거는 없음 |
| 1 Kinematic | 변경 여부와 관계없이 Entity T/q→`FUN_710062e8bc`. 충돌 활성 시 SDK 가상+0x1F0의 kinematic target 경로, 비활성 시 +0xA0 포즈 설정 | 다음 물리 갱신의 목표 포즈. Static의 직접 포즈 교체와 구분 |
| 2 Dynamic | 일반 Entity 포즈 동기화 분기에서 T/q를 덮어쓰지 않음. 물리 결과를 Entity로 적용 | 힘·속도·시뮬레이션이 포즈를 결정. 위치 변경은 Teleport 등 명시 경로 필요 |

스케일 동기화는 ComRigidBody **+0x60 옵션**이다. 활성화 `FUN_71006094a0` 및 변경 시 `FUN_710062dd98`이 geometry scale 경로를 호출한다. 시각 모델의 스케일 변경만으로 모든 강체 크기가 바뀐다고 가정하지 않는다. 비균등/음수 스케일의 모든 형상 변환 규칙은 미확정이다.

활성 관리도 별도다. EN0C는 활성 Entity·컴포넌트 enabled 조건 아래 등록(`FUN_7100614a30`)·world 선택(`FUN_7100624480`)·Stage 가상+0x58로 이어진다. EN0D는 enabled 조건, EN0E는 충돌 비활성 경로다. 강체 Unstage 가상+0x60은 `FUN_7100609704`→`FUN_710062dd4c`; 소멸 `FUN_7100609404`→ComCollision 소멸 `FUN_71006082e0`은 모듈 목록 제거와 handle 세대 무효화를 수행한다.

### 2.4 공통 프레임 경계와 pause

기존 판독의 큰 단계는 **0E Scene→Fiber→Entity / 0F Entity→Physics / 10 Physics→Entity**이다. Entity 콜백 `FUN_71008a17f8`은 EN00(mode0)→EN04(mode1), `FUN_71008a1874`는 EN06(mode2), `FUN_71008a18bc`는 EN08(mode3)을 전달한다. 후속 작업 메시지 생성 `FUN_71008a0de8`은 모드0~3을 각각 **EN03/05/07/09**로 구성한다. 의존 정렬과 후속 작업을 제외하고 메시지 번호만 나열해 실행 순서를 복원하지 않는다.

물리 콜백 `FUN_7100614624`는 substep 조건에 따라 동기화 mask2 또는3을 사용한다. `FUN_7100614ce0`의 pause 게이트 `FUN_71009850cc`는 [01_core.md](01_core.md)의 CoreSystem+0x1678 pause level이 비음수이면 **동기화 순회와 world 갱신을 건너뛴다**. 정지 중 dirty를 매 프레임 소비한다고 해석하지 않는다. 게임 종료와 CoreSystem pause도 같은 상태가 아니다.

## 3. 원본 Ray / Shape Sweep의 계약 [판독]

### 3.1 호출과 좌표

`PhysicsModule.CastRay @0x71006183c0` / `CastShape @0x7100618490`→world 선택 `FUN_7100615f08`→`PhysicsWorldExtension.CastRay @0x7100624fe8` / `CastShape @0x71006252e0`→SDK 가상 **+0x2B8 / +0x2C0**. 해당 world가 유효하지 않으면 정상적인 빈 hit로 처리하는 경로가 아니다.

Origin/position·direction과 결과 position/normal은 선택한 **물리 world 좌표**다. 화면 모델 루트의 로컬 좌표를 그대로 넣지 않는다. 질의 래퍼가 방향을 정규화하는 처리는 보이지 않으므로, 호출자가 단위 방향과 거리의 관계를 보장해야 한다. 결과는 래퍼에 전달된 당시 world의 충돌 포즈를 읽는다.

| 인자 | RayArg | CastShapeArg |
|---|---|---|
| 시작점/포즈 | +0x00 origin, +0x10 direction | +0x00 CollisionShape, +0x90 position, +0xA0 quat, +0xB0 direction |
| 최대 거리 | +0x20 float | +0xC0 float |
| 대상 레이어 비트마스크 | +0x24 u32 | +0xC4 u32 |
| 제외 Entity weak handle | +0x28부터 | +0xC8부터 |
| 추가 플래그 | +0x41/+0x42 | +0xE1/+0xE2 |

CastShape는 지정한 **형상의 선형 이동 sweep**이다. 시작 quat는 있지만 종료 quat·각속도·회전 궤적 인자는 없다. 이를 회전 OBB 전체 궤적 sweep이나 연속 회전 CCD로 부르지 않는다. 물리 단계의 접촉·Dynamic DetectionType1과도 별도 기능이다.

형상은 자체 local translation(+0x10)·quat(+0x20)·geometry(+0x40)·종류(+0x80)를 가진다. `FUN_71006051f8`→`FUN_71006045f0`에서 질의 포즈/형상 로컬 포즈를 SDK 입력으로 변환하므로 **로컬 중심과 회전을 버리면 안 된다**. Capsule 변환에는 Z축 quarter-turn을 구성하는 sin/cos(π/4)가 있어 SDK 축 변환을 한다. 임의로 웹 캡슐의 축을 X로 고정하지 않는다.

크기는 Box의 **halfExtents**와 Capsule의 **radius·halfHeight**를 구분한다. `CreateCapsule @0x7100602e44`는 radius를+0x40, halfHeight를+0x44에 저장한다. `GetCapsuleRadius @0x7100603554` / `GetCapsuleHalfHeight @0x710060359c`가 각각 그대로 반환한다. 생성 호출의 두 번째 인자를 다시 반으로 나누지 않는다. 끝점 입력형 ActorHitShape와의 변환은 아래 §3.3에 둔다.

### 3.2 필터·단일 결과

단일 질의 prefilter `FUN_710062c8b4`는 SDK shape의 **레이어 번호**와 Entity 식별자를 읽는다. 제외 Entity가 일치하면0, 그렇지 않으면 **mask & (1 << (layer & 31))**를 검사한다. 단일 Ray/Sweep은 반환2의 block hit 경로를 사용한다. **layer2와 mask4는 대응하지만 layer값을 mask로 그대로 쓰는 것은 다르다.** mg0106 Route mask는4, Actor map mask는**0x6(레이어1·2)**이며 `1<<6`이 아니다.

래퍼 hit flags 기본값은 **0x403**, Ray+0x41이 켜지면0x423, Sweep+0xE1이 켜지면0x603이며 +0x42/+0xE2는0x80을 더한다. 이 비트를 게임 의미·layer 필터·CCD 옵션이라고 임의 명명하지 않는다. 질의 filter data의 별도 플래그와도 구분한다.

Ray callback `FUN_7100625eb0`, Sweep callback `FUN_710062a834`는 block hit가 있으면 공통 변환 `FUN_710062c3bc`에 넘긴다.

| 결과 | 공통 CastResult 위치/의미 |
|---|---|
| position / normal | +0x00 / +0x10, world 좌표 |
| Collision / Entity | +0x20 / +0x38, 세대 정보를 포함한 weak handle |
| distance | **+0x50 float**. SDK hit 거리의 비트를 복사; face index로 해석하지 않음 |
| validity | +0x54. position 누락/NaN은4, normal 누락/NaN은2, 정상 경로0. 반환 성공만으로 모든 값의 유효성을 보장하지 않음 |
| Shape | +0x58 weak handle. Entity 아래 여러 형상을 구분 |
| initialOverlap | +0x70, **distance <= 0**에서 설정. 침투 깊이·보정 벡터를 의미하지 않음 |

질의 성공 bool과 유효 handle/position/normal을 함께 확인한다. 단일 block 결과와 All 질의의 결과 목록은 구분한다. `CastRayAll @0x7100618420` / `CastShapeAll @0x71006184f0`의 존재는 확인되지만 목록 정렬·동점 처리 계약은 이 분석 범위에서 미확정이다.

### 3.3 캡슐 반높이와 끝점 [판독]

근거: [runtime_A_collision_core.c](../../../analysis/decomp/runtime_A_collision_core.c)의 `GetCapsuleRadius/HalfHeight @0x7100603554/359c`, `ActorHitShape::SetSourceCapsule @0x710001cd20`, `FUN_710001c6cc`; 기존 SDK 변환은 [runtime_A_collision_reuse.c](../../../analysis/decomp/runtime_A_collision_reuse.c)의 `FUN_71006045f0`을 재사용한다.

`CreateCapsule(r,h)`의 h는 **구 중심을 잇는 축 선분의 반길이**다. 기본 엔진 축은Y이며, 원본 SDK 변환은 Z축 90° 회전을 추가한다. shape의 로컬 중심c·회전q 아래 축 끝점은 `c+R(q)·(0,−h,0)`, `c+R(q)·(0,+h,0)`이다. Entity/world 포즈를 한 번 더 합성하며 SDK 축 보정을 엔진 Y축 끝점에 중복 적용하지 않는다. 전체 외형 높이는 **재구현 계산** `2h+2r`이다.

별도 API `ActorHitShape::SetSourceCapsule(a,b,r)`는 **끝점 입력**이다. source 종류7의 `FUN_710001c6cc`는 source 선분 길이L의 절반을 CreateCapsule의 h로 전달하고, 중심을 `a+axis·L/2`, 회전을 UnitY→axis로 구성한다. 따라서 `h=|b−a|/2`, `c=(a+b)/2`이며 source 길이만 이 단계에서 반으로 나눈다. 길이0은 identity 회전·h0 경로다.

mg0106의 A/E 직접 생성 `(r,h)=(0.7,3.5)/(1.3,2.0)`은 축 선분 길이7/4, 외형 높이8.4/6.6이다(**재구현 계산**). Actor의 끝점 입력과 직접 CreateCapsule 인자를 같은 height 필드로 합치지 않는다.

### 3.4 캐릭터 크기와 스케일 [판독·데이터]

근거: [runtime_A_collision_reuse.c](../../../analysis/decomp/runtime_A_collision_reuse.c)의 `FUN_71002b2e00 / 71002bb0a0`, [runtime_A_collision_core.c](../../../analysis/decomp/runtime_A_collision_core.c)의 `FUN_710001cf80 / PCIndividualScale @0x71001d665c`, [runtime_A_collision_finish.c](../../../analysis/decomp/runtime_A_collision_finish.c)의 `bex::CollisionShape::Transform @0x710004d164`.

| 입력/경로 | 확인한 적용 범위 |
|---|---|
| MatterType2 기본 Adjust 형상 | `SetSourceCapsule(a=(0,.5,0),b=(0,1,0),r=.5)`; 중심Y .75·halfHeight .25·전체 높이1.5(**재구현 계산**). Actor 분류 mask **0x2022(번호1·5·13)**, hit name Adjust |
| 별도 Attack 형상 | 중심(0,.75,.8)·반지름.8의 sphere, mask0x10(번호4), 초기 test disabled. Adjust 캡슐의 반지름으로 사용하지 않음 |
| `PCIndividualScale` | CharacterData PC 행+0x76C 값을 XYZ로 복제. mg0106 `ComPlayer::ComPlayer @0x710001b9c0`는 해당 값, 캐릭터ID13은 XYZ=.8로 **대체**하여 `ComActor.SetScale @0x71000146a4`에 전달 |
| Actor/Entity scale | SetScale은 Actor 기본 scale과 modifier scale을 합성해 Entity.SetScale. **비본 ActorHitShape 갱신**은 CalculateRotation/GetTranslation으로 행렬을 만들며 Entity scale을 읽지 않음. transformed capsule도 길이/radius를 그대로 복사; SDK 캐시 geometry는 source 생성값을 유지. 시각 scale을 공통 캡슐 크기에 곱할 근거가 없음 |
| 본 부착 형상 | SkeletonPose.CalculateWorldTransform을 사용하는 별도 분기. 임의 비균등/음수 본 scale에서 capsule을 다시 정규화·등방화하는 규칙까지 확정한 것은 아님 |
| mg0106 ActorParam.json | ModelScale=.8·ColRadius=.8은 데이터 확인. NRO SetParams는 MapParam·ComParam을 읽고, 위 생성자 scale도 별도 경로다. **이 파일의 공용 소비/형상 재설정은 미확정**. 최종 radius=.8 또는 `.5×.8`로 확정하지 않음 |

따라서 공통 기본 형상과 PC 시각 scale의 분리는 구현할 수 있다. **mg0106의 최종 캐릭터 형상**을 확정하려면 ActorParam 파일의 실제 로드·consumer 또는 후속 SetSourceCapsule 호출을 추가로 확보해야 한다. 다른 게임의 ColRadius를 대입하지 않는다.

## 4. Actor 접촉·접지와 플랫폼 carry [판독]

### 4.1 Map과 Actor 접촉의 공통점·차이

[mg0912 §6.4](../minigame/mg0912.md)의 Map 경로와 [runtime_A_collision_core.c](../../../analysis/decomp/runtime_A_collision_core.c)의 `DetectContactsAA @0x7100027f40 / AB @0x7100028720 / Map @0x7100028ee0`을 대조했다. 원본은 한 단계에서 접촉을 모아 callback 결과를 packed finalizer에 전달한다. **검출 즉시 순차 push하거나 모든 침투 벡터를 합산하는 식이 아니다.**

| 경로 | 필터·검출·보정 |
|---|---|
| Actor–Actor(AA) | 유효 owner/shape 쌍과 같은 Entity 접촉 허용 조건 검사. 추가로 양쪽 ComModel+0x28 mask의 AND, 모델이 없거나 override 조건일 때 ComActorCollision의 `FUN_710001b7d8/e0` fallback을 사용. 이 mask와 PhysX Map layer 번호를 합치지 않음. `HitShapeShape`는 transformed bex 형상을 사용 |
| AA adjust | `FUN_710002a054`는 일반 쌍에 양쪽 응답 가능하면 `(+m/2,−m/2)`, 한쪽이면 그쪽에 전체 m/−m을 배분. **양쪽 Actor가 capsule인 경우** XZ 분배와 Y 처리 분리: 중심Y×10000의 정수 비교·grounded/jump 상태에 따라 Y 응답과 PushJump/Fall/ReflectionJump를 선택. 항상 수평 반반 push로 대체할 수 없음 |
| AA finalize | `DefaultFinalizeCharacterRigidBody @0x710002a650`는 owner가 A/B인지에 따라 contact+0x40/+0x50을 선택해 평균 Δ를 계산. Actor가 있고 `dot(Δ,g)<0`이면 `Δ−g·dot(Δ,g)`로 중력 반대 성분 제거; 투영 뒤0인 경우 별도 quaternion·0.01 우회 분기. 단순 Map 평균과 동일하지 않음 |
| Actor–Map(AB/Physics) | `FUN_710002ae40`가 `ListShapes(...,13,2)` 및 추가 등록 쌍을 수집, DetectContactsAB와 DetectContactsMap을 함께 실행. Physics Map mask는 Actor 설정값, Actor 없음은4. Overlap 후보 버퍼16개→각 rigid의 world pose/shape→ComputePenetration. **depth>.01**인 것만 contact+0x30=`direction×depth`에 저장 |
| Map adjust/finalize | `DefaultAdjustCharacterVsMap @0x710002a624`가 raw m을+0x40에 복사. `DefaultFinalizeCharacterVsMap @0x710002aac0`는 **adjusted +0x40 벡터의 평균**을 위치에 적용. 여러 AB/Physics 접촉은 같은 packed 경로에 들어감 |

Map capsule의 Overlap 후보 형상은 source 종류7에서 transformed radius와 **길이×2를 halfHeight에 전달**하는 넓힌 형상이다. 실제 침투 판정은 원래 SDK geometry+0x190, world center/quat+0x160/+0x170을 사용한다. 후보 형상의 길이를 최종 충돌 크기로 가져오지 않는다. 이 특수 후보 범위와16개 제한까지 원본과 맞추려면 해당 경로를 별도로 보존한다.

AA·Map 모두 공통 contact/owner/packed 구조를 사용하지만 **필터·geometry·응답 callback·최종 projection은 다르다**. [mgB_main_actorcoord.c](../../../analysis/decomp/mgB_main_actorcoord.c)의 완료 판독을 재사용하며 전용 callback과 simple-adjust 모드도 원본 선택에 따라 보존한다. SDK 접촉 동점 순서를 새로 확정한 것은 아니다.

### 4.2 접지 법선·groundedLimit·최종 위치

근거: [runtime_A_collision_finish.c](../../../analysis/decomp/runtime_A_collision_finish.c)의 `FUN_7100006670`, [runtime_A_collision_filters.c](../../../analysis/decomp/runtime_A_collision_filters.c)의 layer 검사, [runtime_A_collision_limit.c](../../../analysis/decomp/runtime_A_collision_limit.c)의 `FUN_710002c96c`; 기본 접지 callback은 `ActorWorld.Reset @0x7100005770`가 등록한다.

GroundedCheck enabled 및 Actor+0x44 조건을 확인한 뒤 grounded를 지우고, 중력 방향g에 대해 `d=max(dot(vVert·dt,g),.01)`을 계산한다. Actor 분류 **번호1(mask0x2)**에 포함된 HitShape마다 SDK geometry로 `start=shapeCenter−g·d`, `dir=g`, `distance=d+.4`, MapCollisionLayerBit를 사용해 CastShape한다. **CastResult validity(+0x54)가0이 아니면 거부**하며, 점프 상태에서 hit.distance>d+.01이면 거부한다. 초기 중첩 flag(+0x70)를 직접 검사하는 분기는 이 콜백에 없다. 기존 문서의 초기 중첩 거부 해석을 여기서 정정한다. 법선 판정은 CastResult normal+0x10의 **world Y 성분 ≥ .707**이다. `dot(n,−g)`로 일반화한 구현은 원본과 다르다.

`CheckCollsionLayerBit(CollisionLayer) @0x710001c558`은 `mask>>(번호&31)&1`, unsigned-mask 오버로드 `@0x710001c568`은 `(mask&queryMask)!=0`이다. 접지 호출 `@0x7100006808`은 **번호 오버로드**에1을 전달한다. 두 오버로드를 혼동하면 기본 Adjust mask0x2022의 접지 형상을 누락한다.

Sweep hit.distance>d+.02이면 `SetPosition(current+g·(distance−d))`; 성공 때 grounded 설정과 ComActorGroundedEvent 전달이 이어진다. Sweep 후 IsGrounded가 false면 Actor 위치에서 Ray fallback: 같은 validity·점프·world normal.y 조건, 위치 붙이기 임계는d+.01이다. IsGrounded 자체는 GroundedTest가 꺼지면 true, 켜졌을 때 grounded flag와 jump status1을 함께 검사한다(`@0x710001178c`).

지역 CollisionLimit가 없으면 `FUN_710002c96c`가 **current world Y ≤ groundedLimit.y**를 검사하고 Y만 limit.y로 고정하여 SetPosition, 이어 강제 grounded를 설정한다. X/Z 또는 g 방향 평면을 사용하지 않는다. 지역 제한이 있으면 해당 enabled/접지 callback 경로를 사용하므로 기본 Y 제한과 합산하지 않는다. groundedLimit setter/getter는 `@0x7100014df8/4e0c`다.

Map 평균의 `FUN_710001b320`, AA finalizer, 접지·Y 제한은 모두 **ComActor.SetPosition @0x7100011d64**으로 연결된다. SetPosition은 MoveConstraint가 있으면 요청 이동량을 제약하고 최종 위치 callback을 거쳐 Entity.Translate, 없으면 최종 callback→Entity.SetTranslation이다. 기본 callback **@0x7100014564는 입력 Vector를 그대로 반환**한다. 이전 `FUN_710001454c` C의 함수 경계가 잘못 합쳐져 해당 32byte만 ARM64로 확인했다. 게임별 custom finalizer를 생략하지 않는다.

### 4.3 기본 작업 순서와 carry

`ActorWorld.DefaultCollision @0x7100006ef8`의 기본 순서는 **Attack→Map packed 보정→Limit→ActorBody(AA)→Event→Map packed 보정→Limit**이다. Map 작업은 기본+0x1C0 callback `FUN_710002ae40`, ActorBody는+0x190 callback `FUN_710002abd0` 또는 simple-adjust `FUN_710002acb4`다. 접지 `FUN_7100006670`은 별도 ActorJob callback(+0x160)이다. Map·접지·Actor push를 하나의 solver 함수로 합치지 않으며, custom CollisionFunction/ActorJob을 사용하는 게임은 별도 선택을 따라야 한다. **이 공통 함수 내부 순서가 mg0106의 Entity·소켓·dirty commit 전체 시점을 확정하지는 않는다.**

일반 ComActor와 별도 CCT 경로는 구분한다. mg0912의 선택적 CCT는 기본 비활성 캐릭터 충돌 설정과 `CreateCapsule(.4,.25)`·TickFix→MoveTo 경로가 있지만, 이것을 모든 플레이어의 기본 이동기로 확대하지 않는다.

**플랫폼 carry:** 판독한 강체 포즈 동기화·Map 침투 평균·접지 질의에는 접지 body의 이전/현재 변환 차이를 플레이어에게 자동 적용하는 경로가 확인되지 않았다. 이는 모든 게임·SDK에 carry가 없다는 결론은 아니다. mg0106의 carry는 `mg0106 Player::UpdatePlayer @0x710001c8c0`의 **게임 고유 코드**다. y≤0에서 회전량 `−ω·dt`로 플레이어 위치와 heading을 회전시키고, y>0에서는 적용하지 않는다. 이 항목과 B/C/D 충돌 동기화를 별도로 구현해야 중복 carry가 생기지 않는다.

## 5. mg0106 적용 사례 [판독·데이터]

`mg0106 CreateObj @0x7100009020`은 회전 바닥→`pos_locator`→grp05/06/07→B/C/D 소켓→model+rigid를 만든다. `CreateB @0x710000bda0`, C `@0x710000c500`, D `@0x710000cc70`의 Box halfExtents는 각각 **(0.8,10,0.8) / (1.6,10,0.8) / (2.8,10,0.8)**, shape local position0·quat identity다. Attachment는 **pos1/rot1/scale0**이고 소켓 Euler XYZ 회전을 포함한다. model root도 identity이므로 이 크기를 다시 줄이지 않는다.

RigidArg는 **layer2 / motion0 / detection0**, friction0.5·0.5, restitution0.9다. 따라서 이 장애물은 **부착으로 포즈가 갱신되는 Static**이며 Kinematic target·동적 힘 이동으로 분류하지 않는다. identity 부모 조건의 위치·회전 관계는 `p=Tfloor+Rfloor·socketPosition`, `q=qY(angle)·qSocket`이다. 모델 외관의 AABB를 매번 Box 크기로 쓰면 회전과 형상 크기가 함께 바뀌므로 원본과 다르다.

Boo는 `UpdateAnim @0x710000fd00~fd6c`에서 애니메이션 소켓 translation과 Rotate를 따른다. A/E Capsule radius는0.7/1.3, halfHeight는3.5/2.0이다. §3.3의 끝점·반높이 규약으로 변환한다.

Route는 `Setup @0x7100011360`의 CastShape로 0=빈 곳/1=ObjA/2=ObjE/3=기타를 분류하고, `GetTarget @0x71000118d0`에서 mask4의 Ray 첫 hit ObjA 허용, E의 위쪽1 Sweep 등 **게임 고유 규칙**을 적용한다. 태그 분류·경로 거리·후보 순서·fallback 난수는 [mg0106 §6.5](../minigame/mg0106.md)를 그대로 사용한다. Shape 등록 완료 전 Setup을 실행하거나 태그를 geometry 종류만으로 대체하지 않는다.

## 6. 현재 웹 지원과 필요한 API

### 6.1 현재 소스 확인

| 소스 | 제공 기능과 한계 |
|---|---|
| [`script/app/common/render3d/types.ts:116`](../../script/app/common/render3d/types.ts) | Collider는 `groundHeight(x,z,fromY?)`와 수평 원기둥 이동 `collide(pos,move,radius,height)`뿐. 일반 3D capsule sweep·접촉 목록·레이어/제외 Entity API 없음 |
| [`meshCollider.ts:27`](../../script/app/common/render3d/meshCollider.ts) | constructor에서 vertices·normals·XZ grid를 캐시. 이후 obj의 matrixWorld 변경이 캐시의 위치/회전을 갱신하지 않음. mesh 병합의 초기 변환과 runtime 포즈 갱신은 별개 |
| [`stage.ts:376·580`](../../script/app/common/render3d/stage.ts) | `setCollider`는 참조 대입, `update(dt)`는 clip/updater/camera 갱신. 강체·query world의 포즈 commit을 제공하지 않음 |
| [`script/app/scene/world/plaza/player.ts:164`](../../script/app/scene/world/plaza/player.ts) | integrate는 수평 move가0이면 collide를 호출하지 않음. 정지한 플레이어를 움직이는 장애물이 누르는 경우를 이 경로만으로 처리할 수 없음 |

현재 THREE 기반 Collider를 순수 GameLogic의 권위 상태로 그대로 사용하지 않는다. `Stage3D.getSocket`과 rAF `Stage3D.update`는 렌더 포즈이므로, 같은 이름의 소켓을 읽더라도 논리 프레임과 시점이 맞지 않으면 충돌 근거가 될 수 없다. 게임/Stage3D 연결·공유 renderer·asset owner 해제 계약은 [mg0106 §9.2](../minigame/mg0106.md), [loader_manager.md §11](loader_manager.md)에 두며 여기서 중복하지 않는다.

### 6.2 웹 설계 제안 — 상태와 API

공통 충돌 world는 THREE scene과 독립된 **숫자 상태**를 소유한다. 최소 shape 상태는 `id+generation / entityId / tag / layer / motion / enabled / geometry / localPose / entityPose / previousPose / committedPose / dirty / scalePolicy`다. layer는 번호, query mask는 u32 비트마스크다. geometry는 Box halfExtents, Capsule radius+명시적인 로컬 축 선분 양끝으로 구분하며 원본 인자 변환은 데이터 어댑터 한 곳에서 수행한다.

| 제안 API | 계약 |
|---|---|
| `registerShape(desc)` / `setEnabled(id,bool)` | 로컬 중심·quat·크기·motion·layer·tag·owner를 등록. identity 또는 기본값의 유래를 보존. off인 형상은 query/contact 대상에서 제외 |
| `beginStep(frame)` / `setEntityPose(id,pose)` / `commitPoses()` | previous/현재 pose와 dirty를 구분. 소켓 평가 결과를 localPose와 합성하고 broad phase AABB도 갱신. commit마다 pose epoch를 부여하고 한 질의 묶음은 동일 epoch를 사용 |
| `raycast({origin,unitDir,distance,mask,excludeEntity})` | 단일 결과 또는null. world position/normal/distance/entity/shape/tag/initialOverlap/validity를 반환. layer와 mask를 혼용하지 않음 |
| `sweepCapsule({capsule,pose,unitDir,distance,mask,excludeEntity})` | 캡슐 선형 sweep. pose는 시작 quat; 회전 궤적 sweep은 별도 기능. 초기 중첩을 숨기지 않음 |
| `contacts({shape,pose,mask,excludeEntity})` / `resolveMapContacts(list)` / `resolveActorContacts(list)` | 이동0이어도 overlap을 검사. normal·침투 벡터·상대 shape와 pose epoch를 반환. Map은 adjusted 벡터 평균, AA는 양쪽 분배·owner별 평균·중력 projection을 분리. 게임 고유 순차 보정도 별도 |
| `stepPhysics(dt)` / `applyPhysicsPoses()` | Static 직접 pose, Kinematic target, Dynamic 적분을 구분. 원본 호환이 필요한 기능과 단순 query-only backend 지원 범위를 명시 |
| `teleport(id,pose)` / `removeShape(id)` / `dispose()` | teleport는 이전=현재로 맞춰 허위 sweep을 방지하고 Dynamic velocity reset을 명시. 제거는 query index·contact cache·owner 목록과 handle generation을 함께 정리 |

중심 합성은 **entity world pose×shape local pose**로 정의하고, geometry 크기와 중심 오프셋에 scale을 중복 적용하지 않는다. 기본 scalePolicy는 명시적인 고정 크기이며, 원본 SyncScale이 켜진 형상만 별도 정책으로 반영한다. 비균등 scale capsule/회전 box를 지원하지 않는 backend는 변환을 조용히 근사하지 말고 등록 단계에서 제한을 드러낸다. penetration normal과 벡터는 일관되게 **Actor를 Map 바깥으로 이동시키는 world 방향**으로 정의한다.

### 6.3 웹 설계 제안 — 프레임과 수명주기

1. 로딩 중 shape와 게임 태그를 등록하고 초기 Entity/소켓 포즈를 commit한 뒤 Route.Setup 등 초기 query를 한다.
2. 논리 step 시작에 previous snapshot을 잡고, 기존 sequence가 읽는 종료/탈락 플래그의 지연 관계를 유지한다. mg0106은 Fiber 판정이 같은 프레임 Entity 갱신보다 앞선다.
3. 게임 Entity 의존 관계에 맞춰 Map/애니메이션/Actor/Player를 갱신하고 **논리 시간의 소켓 TRS**를 평가한다. 원본 세부 순서가 미확정인 곳은 adapter의 명시 phase로 유지한다.
4. 각 adapter가 지정한 query 경계에서 부착 및 dirty 포즈를 commit한다. 모든 query를 자동으로 최신 render pose에 맞추지 않는다. Route가 이전 물리 snapshot을 읽어야 하는지는 추가 근거가 필요하다.
5. Actor의 적분·Map/AA 자료 수집·각 finalizer·접지 callback을 adapter의 원본 단계에 연결한다. 정지 Actor도 움직이는 Map과 접촉을 검사한다. mg0106 carry·Boo push 등 고유 계산은 게임 순서대로 별도 실행한다.
6. 지원하는 물리 backend를 step하고 Dynamic pose를 논리 Entity에 적용한 뒤 state/events를 확정한다. view는 이 확정 pose를 읽으며 보간은 렌더에만 적용한다.

pause는 논리 시간·포즈 commit·물리 step을 정지시키고 pending dirty와 형상 수명을 보존한다. 재개 때 stale contact는 새 snapshot으로 검증한다. 종료 phase는 게임에서 허용한 후처리까지 갱신하며 pause와 합치지 않는다. warp/소켓 대상 교체는 discontinuity 여부를 지정하여 previous=current 또는 연속 이동을 선택한다. dispose는 형상·접촉·질의 핸들을 제거하고 view/asset owner 해제는 해당 lib 수명주기에 연결한다.

## 7. 검증 사례와 남은 미확정

아래는 **향후 구현 검증 사례**이며 이번 작업에서 원본/웹 시뮬레이션을 실행한 결과가 아니다.

| 검증 사례 | 확인할 조건 |
|---|---|
| 부착 Box 이동·회전 | 중심이 원점 밖인 Box를 회전: world 중심·quat·AABB가 같이 변하고 halfExtents는 유지. model scale0 부착과 SyncScale 옵션을 분리 |
| 이동0인 Actor | 회전/이동 장애물이 정지 Actor와 겹쳐도 contact가 발생. 접지는 validity와 거리/법선 조건을 검사하며 초기 overlap flag와 침투 보정은 별도 처리 |
| 필터/ID | layer2는 mask4에 hit, mask0x6은1·2에 hit. 제외 Entity 아래 모든 shape 제거, 폐기 세대 handle·비활성 shape는 hit 불가 |
| 질의 출력 | 양의 distance·0·음수와 initialOverlap, NaN/누락 normal validity를 구분. 여러 shape의 Entity/tag 분류 유지 |
| 접촉 보정 | 두 침투 벡터는 원본 평균 경로에서 평균 적용. Ray distance나 sequential push 결과로 바꾸지 않음 |
| carry | mg0106의 y≤0/y>0 경계와 heading 회전 확인. 부착 Static 및 접지 보정이 동일 carry를 추가하지 않음 |
| 시간·순서 | 동일 frame/pose epoch의 query 결과 재현, render/rAF 빈도에 독립. commit 전후 결과의 차이를 기록하여 미확정 adapter 순서 검증 |
| lifecycle | Dynamic teleport velocity0·previous=current, pause 중 dirty 보존, resume 재평가, disable/dispose 후 query/contact 없음 |

| 항목 | 이번 판독에서 해소된 내용 | 남은 미확정 |
|---|---|---|
| Capsule | radius/halfHeight·Y축·SDK quarter-turn·끝점 환산·일반 Actor scale 분리·기본 캐릭터 capsule | mg0106 ActorParam의 실제 consumer/후속 형상 덮어쓰기; 임의 본의 비균등/음수 scale |
| Actor/Map 응답 | AA 분류 필터·양쪽 분배·owner별 평균/중력 projection; AB/Physics Map 합류·depth>.01·adjusted 평균 | SDK narrow phase의 동점·후보 순서, 모든 게임의 custom adjust 선택 |
| 접지/최종 위치 | world normal.y≥.707; validity/initialOverlap 구분·Sweep/Ray 임계·기본 world Y limit·SetPosition 및 기본 passthrough | 게임별 custom ActorJob/finalizer가 덮어쓰는 설정 |
| 게임별 포즈 시점 | 공통 DefaultCollision 내부 작업 순서·Entity dirty→강체 연결 | mg0106 활성 의존 그래프/부품 순서·Rigger Timing·dirty 큐 장벽과 Route/Actor 질의 선후 |
| CCD/All 옵션 | Static pose 교체·선형 Sweep·단일 block 출력/필터 | 회전 중간 궤적·DetectionType1 내부 solver·추가 flag 이름·All 정렬/동점. **기본 단일 질의/캐릭터 경로의 착수 차단 아님** |

### 사용자 확인 필요

공통 query/캐릭터 런타임은 위 확정 규약으로 설계·구현을 시작할 수 있다. **mg0106 원본 동작 일치 완료를 목표로 하면** ActorParam consumer와 게임별 포즈 시점은 먼저 추가 판독해야 한다. 공통 capsule radius=.5를 임시 게임 값으로 채택할지는 구현 범위 결정이며, 여기서는 최종 게임 값으로 승인하거나 대입하지 않았다. Dynamic/회전 중간 궤적 CCD·All 질의를 첫 구현 범위에 넣을지도 별도 선택이 필요하다. 이번 문서 보완 자체에는 사용자 응답이 필요하지 않다.

### 런타임 구현 준비도

| 필요 항목 | 판독 상태 | 구현 차단 여부 |
|---|---|---|
| 형상 크기·local/world 중심·캡슐 축/끝점 | Box 및 Capsule 공통 규약 확정 | 아니오 |
| register/enable/remove·세대·단일 Ray/Sweep 필터/출력 | 공통 계약 판독, 웹 API는 §6 제안 | 아니오; 웹 구현은 아직 없음 |
| Actor–Map 보정 | 후보/침투·adjusted 평균·SetPosition 확정 | 아니오; SDK와 후보 순서까지 완전 일치는 추가 검증 |
| Actor–Actor 보정 | 분배·capsule Y 분기·jump 전이·owner 평균/projection 근거 확보 | 아니오; 단순 반반 수평 push로 축약하면 불일치 |
| 기본 접지·groundedLimit·finalizer | 법선 좌표/임계·Y 제한·위치 연결 확정 | 아니오 |
| mg0106 최종 캐릭터 capsule | 공통 기본값/PC scale 분리 확정, ActorParam consumer 미확정 | **해당 게임 크기 확정은 차단**; 공통 런타임 착수 가능 |
| mg0106 움직이는 장애물 query 시점 | 부착 Static·dirty 경로 확정, 게임별 commit 경계 미확정 | **원본 프레임 일치 완료는 차단** |
| 일반 비균등/음수 본 scale | 일부 경로만 판독 | 해당 입력 지원 시 차단; 고정 크기·비본 경로는 착수 가능 |
| CCD·Dynamic solver·All 정렬 | 내부 의미/정렬 일부 미확정 | 해당 기능의 원본 일치에만 차단; mg0106 기본 단일 query에는 비차단 |

이번 검증 범위는 **기존 완료 문서 재사용, 원본 함수·ARM64/디컴파일의 누락 연결 정적 판독, 현재 웹 소스 대조, 문서 링크/형식 확인**이다. 공통 Entity·Collision·Physics 주소는 위 절에 기록했으며 추가 판독은 원본을 변경하지 않은 임시 Ghidra 프로젝트의 `-noanalysis -readOnly`로 수행했다. 게임 구현·원본 실행·스테이징은 하지 않았다.

## 8. PhysX 4.1 공개 소스 기준 (2026-10-09)

앞 절에서 "SDK 내부(narrow phase·접촉 순서·CCD)는 판독 범위 밖"으로 둔 항목은 **디컴파일이 아니라 공개 소스로 확정할 수 있다.** 원본은 PhysX 4.1.2를 정적 링크했고, 같은 버전의 소스가 BSD-3으로 공개돼 있다. 충돌 런타임은 이 절을 기준으로 **원본 알고리즘을 옮기는 방식**으로 구현한다(표준 알고리즘으로 새로 설계하지 않는다).

### 8.1 근거 [데이터]

| 근거 | 내용 |
|---|---|
| 원본 버전 | `.apx` = PhysX **4.1.2** `PxSerialization` 이진 직렬화([06_scene_data.md §5](06_scene_data.md)) |
| 원본에 들어 있는 모듈 | `main` 안의 단언 경로 문자열 `PhysX4/physx/source/<모듈>`: physx 25 · geomutils 23(하위 convex·hf·mesh·sweep) · physxextensions 17 · physxcooking 17 · foundation 14 · lowleveldynamics 12 · lowlevel 11 · common 10 · **scenequery 9** · simulationcontroller 8 · lowlevelaabb 7 · **physxcharacterkinematic 2** · task 1 |
| 캐릭터 컨트롤러 포함 | `physx::Cct::{Controller, CapsuleController, BoxController, CharacterControllerManager, ObstacleContext}` 클래스 이름이 있다. 어느 게임이 쓰는지는 [mg0912 §6](../minigame/mg0912.md)의 선택적 CCT 경로 참조 |
| 충돌 메시 midphase | `.apx` 객체 통계에서 삼각형 메시는 전부 **TRIANGLE_MESH_BVH33(3,098개)**, BVH34·높이맵 0, CONVEX_MESH 38([06 §5](06_scene_data.md)). BVH33 = **RTree midphase**(`GuMidphaseRTree`·`GuRTree`). BV4 경로는 이식 대상이 아니다 |
| 공개 소스 | NVIDIAGameWorks/PhysX `4.1` 브랜치, 라이선스 **BSD-3-Clause**. 로컬 `C:/dev/mpj/tools/oss/PhysX-4.1`(HEAD `a2c0428`, sparse checkout, 현재 663파일) |

로컬 sparse checkout 에는 지금 `include`·`geomutils/src`의 일부(convex·gjk·hf·mesh 등)·lowlevel·lowleveldynamics·physx·physxextensions·simulationcontroller 만 있다. **이식 전에 아래를 checkout 에 추가해야 한다**: `source/scenequery`, `source/physxcharacterkinematic`, `source/geomutils/src/{contact,pcm,sweep,intersection,distance,ccd}` 등 하위 전부, `source/common`, `source/foundation`, `source/lowlevelaabb`.

### 8.2 원본 호출 → 공개 소스 대응

앞 절의 Bezel 래퍼(디컴파일로 판독 완료)는 SDK 가상 함수로 넘어간다. 그 뒤는 공개 소스에서 읽는다. 대응은 **[추정: 이름·호출 형태]** 이며, 이식 착수 때 원본 함수의 단언 문자열·vtable 순서로 한 번 대조해 [판독]으로 올린다.

| 원본(이 문서) | PhysX 4.1 API | 공개 소스 위치(대표) |
|---|---|---|
| `CastRay` → SDK 가상 **+0x2B8** (§3.1) | `PxScene::raycast` | `physx/src/NpSceneQueries.*`, `scenequery/src/Sq*`, `geomutils/src/GuRaycastTests.cpp`, 메시 `mesh/GuMidphaseRTree.cpp`·`GuRTreeQueries.cpp` |
| `CastShape` → SDK 가상 **+0x2C0** (§3.1) | `PxScene::sweep`(선형 스윕) | `GuSweepTests.cpp`·`GuSweepSharedTests.cpp`·`sweep/*`, 메시 `mesh/GuSweepsMesh.cpp`·`GuSweepMesh.h` |
| 초기 겹침·`initialOverlap`·distance≤0 (§3.2) | sweep 의 `eINITIAL_OVERLAP`·MTD | `GuSweepMTD.cpp`·`GuMTD.cpp` |
| hit flags 0x403/0x423/0x603·+0x80 (§3.2 "의미 미확정") | `PxHitFlag` 비트 | **[데이터: 소스 정의]** `include/PxQueryReport.h`: ePOSITION 0x1·eNORMAL 0x2·eUV 0x8·eASSUME_NO_INITIAL_OVERLAP 0x10·eMESH_MULTIPLE 0x20·eMESH_ANY 0x40·eMESH_BOTH_SIDES 0x80·ePRECISE_SWEEP 0x100·eMTD 0x200·eFACE_INDEX 0x400. 따라서 **0x403 = eDEFAULT(POSITION·NORMAL·FACE_INDEX)**, 0x423 = 기본 + **MESH_MULTIPLE**(Ray+0x41), 0x603 = 기본 + **MTD**(Sweep+0xE1), +0x80 = **MESH_BOTH_SIDES**(+0x42/+0xE2) |
| 레이어·제외 Entity prefilter (§3.2) | `PxQueryFilterCallback::preFilter`, `PxQueryFilterData` | `include/PxQueryFiltering.h`. 원본 prefilter 함수 `FUN_710062c8b4` 는 게임 콜백(이미 판독) |
| `CastRayAll`·`CastShapeAll` 정렬·동점 (§7 미확정) | `PxHitBuffer` touch 목록 | `scenequery`·`NpSceneQueries` 의 touch 수집 순서 |
| Actor–Map 침투 벡터(§4.1) | `PxGeometryQuery::computePenetration`·overlap | `GuMTD.cpp`·`GuOverlapTests.cpp`·`mesh/GuOverlapTestsMesh.cpp` |
| 캡슐 Z축 quarter-turn(§3.3) | `PxCapsuleGeometry` 축 = **X**([데이터: 소스 주석 "extending along the x axis"]) | `include/geometry/PxCapsuleGeometry.h`, `GuCapsule.*` — 엔진 Y축 캡슐을 SDK X축 캡슐로 바꾸는 것이 원본의 sin/cos(π/4) Z축 회전의 이유 |
| 선택적 CCT(mg0912) | `PxCapsuleController::move` | `physxcharacterkinematic/src/Cct*` |
| Dynamic 강체·접촉 해결(mg1002·mg0911, §2.3) | `PxScene::simulate` 솔버 | `lowleveldynamics`(PGS/TGS)·`simulationcontroller`·`geomutils/src/contact`·`pcm` |

### 8.3 이식 범위와 순서

| 단계 | 범위 | 쓰는 곳 |
|---|---|---|
| P0 | 형상(Box·Capsule·Sphere·TriangleMesh BVH33·Convex)과 **씬 질의**: raycast·선형 sweep·overlap·MTD/penetration, RTree midphase, `PxHitFlag`·필터 규약 | 공용 충돌 런타임 전부(§6 API의 백엔드) |
| P1 | 캐릭터 컨트롤러(Cct) | mg0912 등 CCT 를 켜는 게임만 |
| P2 | 강체 시뮬레이션(브로드페이즈·접촉 생성·솔버) | Dynamic 을 쓰는 게임(mg1002·mg0911 등)만, 게임 포팅 때 |

- **필요한 함수만** 옮긴다. PhysX 전체·쿠킹(메시 빌드)은 옮기지 않는다. 메시는 `.apx`에 이미 구워진 BVH33 데이터를 그대로 읽는다(재구축 금지 — 질의 순서가 midphase 트리 구조에 따라 달라질 수 있음).
- 옮긴 코드는 §6.2 의 숫자 상태 world 뒤에 **질의 백엔드**로 꽂는다(API·수명 규칙은 §6 그대로). 위치는 `script/game/lib/` 아래 import 0 모듈로 두고 three 에 묶지 않는다(엔진 무관 코어 원칙).

### 8.4 동일성 기준과 한계

- **알고리즘은 원본과 같다**(같은 버전 소스). 동점 처리·후보 순서·초기 겹침 처리·MTD 방향이 원본 규칙대로 나온다.
- **비트 일치는 보장하지 않는다.** 원본은 ARM64 NEON 의 `Ps::aos` SIMD 경로로 컴파일됐고(FMA·연산 순서), 웹은 JavaScript 스칼라다. f32 결과는 `Math.fround`로 단계마다 맞추고, SIMD 경로의 연산 순서를 스칼라로 그대로 펼쳐 차이를 줄인다. 남는 차이는 [근사]로 표시한다.
- **골든 검증 제안 [설계]**: 같은 공개 소스를 데스크톱에서 네이티브로 빌드한 작은 시험 프로그램으로, 같은 형상·같은 질의 입력에 대한 결과(hit 위치·법선·거리·touch 순서·MTD)를 기록해 웹 이식본과 대조한다. 원본(ARM)과 데스크톱(x86 SSE)의 차이는 위와 같은 수준으로 작다고 본다 [추정]. 빌드 도구(CMake·MSVC 등) 준비 여부는 착수 때 확인한다.

### 8.5 라이선스

BSD-3-Clause 는 소스 형태 재배포 시 **저작권 고지·조건·면책 문구 유지**를 요구한다. 이식한 파일마다 머리에 PhysX 원본 저작권 고지를 넣고, 저장소에 원문 `LICENSE.md` 사본을 둔다. 이 고지는 이 프로젝트의 "임의 주석 금지" 규칙의 예외다(법적 요구).

### 8.6 이 절로 바뀌는 판단

- §7 남은 미확정 중 "SDK narrow phase·동점 접촉 순서·고속 회전 CCD", "Query 옵션(+0x41/42·E1/E2) 비트 의미·All 정렬" 은 **공개 소스로 확정할 수 있는 항목**이 됐다. 이식 착수 때 §8.2 대응을 [판독]으로 올리면서 해소한다.
- 런타임 구현 준비도의 "SDK와 후보 순서까지 완전 일치는 추가 검증" 은 **원본 알고리즘 이식 + 네이티브 골든 대조**로 검증 경로가 생겼다.
- 게임 고유 판단(포즈 commit 시점, ActorParam 소비)은 공개 소스와 무관하며 기존대로 게임별 디컴파일로 판독한다.
