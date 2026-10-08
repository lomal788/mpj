# 11. 움직이는 충돌 — 부착 포즈·강체 동기화·Ray/Capsule 질의

2026-10-08. 상태: **공통 경로 정적 판독 완료 / 웹 API 설계 제안 / 게임별 세부 실행 순서 미확정**.

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

크기는 Box의 **halfExtents**와 Capsule의 radius를 구분한다. `CreateCapsule @0x7100602e44`는 두 float를 +0x40/+0x44에 그대로 저장하고 SDK geometry 변환도 두 값을 그대로 복사한다. 두 번째 인자를 임의로 반으로 나누지 않는다. **캡슐 전체 높이/축 선분 끝점으로 환산하는 최종 규약은 미확정**이며 데이터 어댑터에서 추적해야 한다.

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

## 4. Actor 접촉·접지와 플랫폼 carry [판독]

[mg0912 §6.4](../minigame/mg0912.md)의 일반 Map 접촉은 **침투 벡터(+0x30)를 수집하고 평균을 위치에 적용**하는 경로다. 단일 Sweep의 distance/normal로 이 접촉 자료를 대체하지 않는다. 반복 투영·순차 push·모든 벡터 합산은 동일한 보정식이 아니다. 캐릭터끼리의 접촉 허용/레이어도 Map 접촉과 분리한다.

접지는 GroundedTest enabled와 actor 조건을 확인한 뒤 grounded를 지우고, 중력 방향 `g`에 대해 `d=max(dot(vVert·dt,g),0.01)`를 사용한다. 접지용 **layer1 HitShape**마다 시작점 `shape.pos−g·d`, 방향g, 거리**d+0.4**, MapCollisionLayerBit로 CastShape한다. **initialOverlap을 거부**하고, 점프 상태에서 거리>d+0.01이면 거부하며, normal 판정값<0.70710이면 거부한다. 거리>d+0.02이면 `g·(거리−d)`를 위치에 적용하고 접지 이벤트를 발생시킨다. Ray fallback의 붙이기 임계는d+0.01이다. normal 판정이 항상 world n.y인지 `dot(n,−g)`인지, groundedLimit 관련 세부 및 최종 위치 반영 연결의 남은 범위는 기존 문서의 미확정을 유지한다.

일반 ComActor와 별도 CCT 경로는 구분한다. mg0912의 선택적 CCT는 기본 비활성 캐릭터 충돌 설정과 `CreateCapsule(.4,.25)`·TickFix→MoveTo 경로가 있지만, 이것을 모든 플레이어의 기본 이동기로 확대하지 않는다.

**플랫폼 carry:** 판독한 강체 포즈 동기화·Map 침투 평균·접지 질의에는 접지 body의 이전/현재 변환 차이를 플레이어에게 자동 적용하는 경로가 확인되지 않았다. 이는 모든 게임·SDK에 carry가 없다는 결론은 아니다. mg0106의 carry는 `mg0106 Player::UpdatePlayer @0x710001c8c0`의 **게임 고유 코드**다. y≤0에서 회전량 `−ω·dt`로 플레이어 위치와 heading을 회전시키고, y>0에서는 적용하지 않는다. 이 항목과 B/C/D 충돌 동기화를 별도로 구현해야 중복 carry가 생기지 않는다.

## 5. mg0106 적용 사례 [판독·데이터]

`mg0106 CreateObj @0x7100009020`은 회전 바닥→`pos_locator`→grp05/06/07→B/C/D 소켓→model+rigid를 만든다. `CreateB @0x710000bda0`, C `@0x710000c500`, D `@0x710000cc70`의 Box halfExtents는 각각 **(0.8,10,0.8) / (1.6,10,0.8) / (2.8,10,0.8)**, shape local position0·quat identity다. Attachment는 **pos1/rot1/scale0**이고 소켓 Euler XYZ 회전을 포함한다. model root도 identity이므로 이 크기를 다시 줄이지 않는다.

RigidArg는 **layer2 / motion0 / detection0**, friction0.5·0.5, restitution0.9다. 따라서 이 장애물은 **부착으로 포즈가 갱신되는 Static**이며 Kinematic target·동적 힘 이동으로 분류하지 않는다. identity 부모 조건의 위치·회전 관계는 `p=Tfloor+Rfloor·socketPosition`, `q=qY(angle)·qSocket`이다. 모델 외관의 AABB를 매번 Box 크기로 쓰면 회전과 형상 크기가 함께 바뀌므로 원본과 다르다.

Boo는 `UpdateAnim @0x710000fd00~fd6c`에서 애니메이션 소켓 translation과 Rotate를 따른다. A/E Capsule radius는0.7/1.3, 두 번째 원본 인자는3.5/2.0이다. 앞 절의 축/길이 어댑터 규약과 분리하여 원값을 보존한다.

Route는 `Setup @0x7100011360`의 CastShape로 0=빈 곳/1=ObjA/2=ObjE/3=기타를 분류하고, `GetTarget @0x71000118d0`에서 mask4의 Ray 첫 hit ObjA 허용, E의 위쪽1 Sweep 등 **게임 고유 규칙**을 적용한다. 태그 분류·경로 거리·후보 순서·fallback 난수는 [mg0106 §6.5](../minigame/mg0106.md)를 그대로 사용한다. Shape 등록 완료 전 Setup을 실행하거나 태그를 geometry 종류만으로 대체하지 않는다.

## 6. 현재 웹 지원과 필요한 API

### 6.1 현재 소스 확인

| 소스 | 제공 기능과 한계 |
|---|---|
| [`script/shell/stage3d/types.ts:116`](../../script/shell/stage3d/types.ts) | Collider는 `groundHeight(x,z,fromY?)`와 수평 원기둥 이동 `collide(pos,move,radius,height)`뿐. 일반 3D capsule sweep·접촉 목록·레이어/제외 Entity API 없음 |
| [`meshCollider.ts:27`](../../script/shell/stage3d/meshCollider.ts) | constructor에서 vertices·normals·XZ grid를 캐시. 이후 obj의 matrixWorld 변경이 캐시의 위치/회전을 갱신하지 않음. mesh 병합의 초기 변환과 runtime 포즈 갱신은 별개 |
| [`stage.ts:376·580`](../../script/shell/stage3d/stage.ts) | `setCollider`는 참조 대입, `update(dt)`는 clip/updater/camera 갱신. 강체·query world의 포즈 commit을 제공하지 않음 |
| [`script/shell/plaza/player.ts:164`](../../script/shell/plaza/player.ts) | integrate는 수평 move가0이면 collide를 호출하지 않음. 정지한 플레이어를 움직이는 장애물이 누르는 경우를 이 경로만으로 처리할 수 없음 |

현재 THREE 기반 Collider를 순수 GameLogic의 권위 상태로 그대로 사용하지 않는다. `Stage3D.getSocket`과 rAF `Stage3D.update`는 렌더 포즈이므로, 같은 이름의 소켓을 읽더라도 논리 프레임과 시점이 맞지 않으면 충돌 근거가 될 수 없다. 게임/Stage3D 연결·공유 renderer·asset owner 해제 계약은 [mg0106 §9.2](../minigame/mg0106.md), [loader_manager.md §11](loader_manager.md)에 두며 여기서 중복하지 않는다.

### 6.2 웹 설계 제안 — 상태와 API

공통 충돌 world는 THREE scene과 독립된 **숫자 상태**를 소유한다. 최소 shape 상태는 `id+generation / entityId / tag / layer / motion / enabled / geometry / localPose / entityPose / previousPose / committedPose / dirty / scalePolicy`다. layer는 번호, query mask는 u32 비트마스크다. geometry는 Box halfExtents, Capsule radius+명시적인 로컬 축 선분 양끝으로 구분하며 원본 인자 변환은 데이터 어댑터 한 곳에서 수행한다.

| 제안 API | 계약 |
|---|---|
| `registerShape(desc)` / `setEnabled(id,bool)` | 로컬 중심·quat·크기·motion·layer·tag·owner를 등록. identity 또는 기본값의 유래를 보존. off인 형상은 query/contact 대상에서 제외 |
| `beginStep(frame)` / `setEntityPose(id,pose)` / `commitPoses()` | previous/현재 pose와 dirty를 구분. 소켓 평가 결과를 localPose와 합성하고 broad phase AABB도 갱신. commit마다 pose epoch를 부여하고 한 질의 묶음은 동일 epoch를 사용 |
| `raycast({origin,unitDir,distance,mask,excludeEntity})` | 단일 결과 또는null. world position/normal/distance/entity/shape/tag/initialOverlap/validity를 반환. layer와 mask를 혼용하지 않음 |
| `sweepCapsule({capsule,pose,unitDir,distance,mask,excludeEntity})` | 캡슐 선형 sweep. pose는 시작 quat; 회전 궤적 sweep은 별도 기능. 초기 중첩을 숨기지 않음 |
| `contacts({shape,pose,mask,excludeEntity})` / `resolveMapContacts(list)` | 이동0이어도 overlap을 검사. normal·침투 벡터·상대 shape와 pose epoch를 반환. 원본 Actor 경로는 평균 보정을 선택; 게임 고유 순차 보정과 분리 |
| `stepPhysics(dt)` / `applyPhysicsPoses()` | Static 직접 pose, Kinematic target, Dynamic 적분을 구분. 원본 호환이 필요한 기능과 단순 query-only backend 지원 범위를 명시 |
| `teleport(id,pose)` / `removeShape(id)` / `dispose()` | teleport는 이전=현재로 맞춰 허위 sweep을 방지하고 Dynamic velocity reset을 명시. 제거는 query index·contact cache·owner 목록과 handle generation을 함께 정리 |

중심 합성은 **entity world pose×shape local pose**로 정의하고, geometry 크기와 중심 오프셋에 scale을 중복 적용하지 않는다. 기본 scalePolicy는 명시적인 고정 크기이며, 원본 SyncScale이 켜진 형상만 별도 정책으로 반영한다. 비균등 scale capsule/회전 box를 지원하지 않는 backend는 변환을 조용히 근사하지 말고 등록 단계에서 제한을 드러낸다. penetration normal과 벡터는 일관되게 **Actor를 Map 바깥으로 이동시키는 world 방향**으로 정의한다.

### 6.3 웹 설계 제안 — 프레임과 수명주기

1. 로딩 중 shape와 게임 태그를 등록하고 초기 Entity/소켓 포즈를 commit한 뒤 Route.Setup 등 초기 query를 한다.
2. 논리 step 시작에 previous snapshot을 잡고, 기존 sequence가 읽는 종료/탈락 플래그의 지연 관계를 유지한다. mg0106은 Fiber 판정이 같은 프레임 Entity 갱신보다 앞선다.
3. 게임 Entity 의존 관계에 맞춰 Map/애니메이션/Actor/Player를 갱신하고 **논리 시간의 소켓 TRS**를 평가한다. 원본 세부 순서가 미확정인 곳은 adapter의 명시 phase로 유지한다.
4. 각 adapter가 지정한 query 경계에서 부착 및 dirty 포즈를 commit한다. 모든 query를 자동으로 최신 render pose에 맞추지 않는다. Route가 이전 물리 snapshot을 읽어야 하는지는 추가 근거가 필요하다.
5. Actor의 적분→접촉 자료 수집/평균 보정→접지 질의를 연결한다. 정지 Actor도 움직이는 Map과 접촉을 검사한다. mg0106 carry·Boo push 등 고유 계산은 게임 순서대로 별도 실행한다.
6. 지원하는 물리 backend를 step하고 Dynamic pose를 논리 Entity에 적용한 뒤 state/events를 확정한다. view는 이 확정 pose를 읽으며 보간은 렌더에만 적용한다.

pause는 논리 시간·포즈 commit·물리 step을 정지시키고 pending dirty와 형상 수명을 보존한다. 재개 때 stale contact는 새 snapshot으로 검증한다. 종료 phase는 게임에서 허용한 후처리까지 갱신하며 pause와 합치지 않는다. warp/소켓 대상 교체는 discontinuity 여부를 지정하여 previous=current 또는 연속 이동을 선택한다. dispose는 형상·접촉·질의 핸들을 제거하고 view/asset owner 해제는 해당 lib 수명주기에 연결한다.

## 7. 검증 사례와 남은 미확정

아래는 **향후 구현 검증 사례**이며 이번 작업에서 원본/웹 시뮬레이션을 실행한 결과가 아니다.

| 검증 사례 | 확인할 조건 |
|---|---|
| 부착 Box 이동·회전 | 중심이 원점 밖인 Box를 회전: world 중심·quat·AABB가 같이 변하고 halfExtents는 유지. model scale0 부착과 SyncScale 옵션을 분리 |
| 이동0인 Actor | 회전/이동 장애물이 정지 Actor와 겹쳐도 contact가 발생. sweep 시작 overlap은 접지에서 거부하고 침투 보정은 별도 처리 |
| 필터/ID | layer2는 mask4에 hit, mask0x6은1·2에 hit. 제외 Entity 아래 모든 shape 제거, 폐기 세대 handle·비활성 shape는 hit 불가 |
| 질의 출력 | 양의 distance·0·음수와 initialOverlap, NaN/누락 normal validity를 구분. 여러 shape의 Entity/tag 분류 유지 |
| 접촉 보정 | 두 침투 벡터는 원본 평균 경로에서 평균 적용. Ray distance나 sequential push 결과로 바꾸지 않음 |
| carry | mg0106의 y≤0/y>0 경계와 heading 회전 확인. 부착 Static 및 접지 보정이 동일 carry를 추가하지 않음 |
| 시간·순서 | 동일 frame/pose epoch의 query 결과 재현, render/rAF 빈도에 독립. commit 전후 결과의 차이를 기록하여 미확정 adapter 순서 검증 |
| lifecycle | Dynamic teleport velocity0·previous=current, pause 중 dirty 보존, resume 재평가, disable/dispose 후 query/contact 없음 |

| 남은 미확정 | 확정한 범위 / 추가로 필요한 근거 |
|---|---|
| 게임별 같은 프레임 세부 순서 | 공통 message·의존 정렬·부착 수신·dirty→강체 경로는 확인. **mg0106 활성 의존 그래프/부품 순서, Rigger Timing 실제 설정, dirty 큐 완료 장벽과 Route/Actor 질의 선후**가 필요. 일반 Map→Actor→Player 목록만으로 대체하지 않음 |
| 회전 충돌의 내부 접촉/CCD | Static pose 교체와 선형 Shape sweep 확인. **PhysX narrow phase·동점 접촉 순서·고속 회전 중간 궤적 충돌**은 미확정. mg1002 DetectionType1을 mg0106 Static에 확대하지 않음 |
| Capsule 길이·scale | 원본 두 float 무변환 저장/SDK 전달 및 축 변환 확인. **전체 높이·끝점 환산과 비균등/음수 scale 규약**, mg0106 ActorParam/PCIndividualScale의 최종 캐릭터 충돌 크기 소비 경로가 필요 |
| Query 옵션·All 정렬 | 레이어·제외 Entity·단일 block 결과·거리/validity 확인. **+0x41/42·E1/E2의 이름/세부 의미, All 결과 정렬·동점**은 미확정 |
| 접지 세부 | 기존 mg0912의 threshold·initialOverlap 거부·평균 보정 재사용. **normal 판정 좌표·groundedLimit·최종 SetPosition의 세부 연결**은 기존 미확정 유지 |

이번 검증 범위는 **기존 완료 문서 재사용, 원본 함수·ARM64/디컴파일의 누락 연결 정적 판독, 현재 웹 소스 대조, 문서 링크/형식 확인**이다. 공통 Entity·Collision·Physics 주소는 위 절에 기록했으며 추가 판독은 원본을 변경하지 않은 임시 Ghidra 프로젝트의 `-noanalysis -readOnly`로 수행했다. 게임 구현·원본 실행·스테이징은 하지 않았다.
