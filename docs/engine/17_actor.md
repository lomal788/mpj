# 17. Actor — 공용 이동·액션·패드·점프·접지 연결

[데이터] 통합일: 2026-10-10. 지정 출처 19개 문서의 현행본을 사용한다. 절별 대응은 부록 A에 있다.
[미확정] 원본 게임 실행 대조는 없다. 이 문서의 수치 검증은 기존 재구현 계산을 인용한다.
[설계] 웹 설계: 다음 구현 대상은 `script/game/lib/actor`와 `script/game/lib/actor-collision`이다. 이번 변경은 문서에 한정한다.

[판독]은 기존 디컴파일 판독 또는 이번에 허용된 빈 영역의 C 판독이다.
[판독: 어셈블리]는 기존 문서가 명령으로 확정한 사실이다. 이번에 어셈블리를 새로 읽지는 않았다.
[데이터]는 원본 데이터 또는 현재 웹 파일의 관찰이다. 웹 관찰에는 반드시 “웹 소스”를 붙인다.
[추정]은 원본 동작에 대한 해석이다. [미확정]은 구현자가 확정값으로 사용하면 안 되는 공백이다.
[설계]는 웹 구조·구현 판단·착수 순서·편집 원칙·작업 계획이다. 원본의 확정 수준과 구분한다.

## 1. 기능 개요와 사용자에게 보이는 동작

| 기능 | 사용자에게 보이는 동작·책임 | 근거 |
|---|---|---|
| 일반 이동 | [판독] 레버 깊이에 따라 Idle/Walk/Run을 고른다. 이동 방향과 몸의 선회를 따로 계산한다. | main `@0x710002fbfc/@0x710002fc78/@0x710002fda0`, `@0x71000149e8`; [plaza §3.5](../shell/plaza_3d.md), [mg0912 §6.3](../minigame/mg0912.md) |
| 공중 제어 | [판독] 수평 속도에 가속·감속을 적용한다. 공중 수평 속도와 낙하 속도에는 별도 상한이 있다. | main `@0x7100014a88`, `@0x710000f230`; [mg0912 §6.1·6.3](../minigame/mg0912.md) |
| 점프 | [판독] 액션이 초속과 JumpCalculator를 설정한다. 계산기는 수직 속도 구간에 따라 중력 계수를 바꾼다. | main `@0x71000219d0`, `@0x7100022110`; [mg0912 §6.2](../minigame/mg0912.md) |
| 접지·벽 | [판독] 이동 적분과 충돌 작업은 별도다. 접지는 Sweep/Ray이며 Map 침투 보정은 adjusted 벡터의 평균이다. | main `@0x7100006670`, `@0x710002aac0`; [11 §4.1·4.2](11_moving_collision.md) |
| 사람·CPU 입력 | [판독] 사람과 CPU overlay는 ComActorPad의 같은 getter로 소비된다. CPU 전략은 각 NRO에 있다. | main `@0x710001e54c/@0x710001e74c/@0x710001eac4`; [mg0122 §6.10](../minigame/mg0122.md), [mg0912 §6.12](../minigame/mg0912.md) |
| 게임 고유 이동 | [판독] 회전판 carry·리프트·넉백·허들 자동 전진은 게임 코드의 위치 작성이다. | mg0106 `@0x710001c8c0`, mg0912 `@0x7100029820`, mg0118 `@0x7100018844`; [mg0106 §6.1](../minigame/mg0106.md), [mg0912 §6.5·6.10](../minigame/mg0912.md), [mg0118 §6.7](../minigame/mg0118.md) |

## 2. 분석 대상 원본·버전·자료 위치

| 자료 | 범위·주의 |
|---|---|
| main NSO | [판독] 주소 베이스는 `0x7100000000`이다. 공용 actor 주소는 모두 main으로 표기한다. US v0 표기는 기존 온라인 문서의 기준이다. [01 §2](01_core.md), [12 §2](12_online_sync.md) |
| 게임 NRO | [판독] 같은 베이스를 쓰므로 주소만으로 모듈을 식별할 수 없다. 반드시 mgXXXX/menu00/mgmet를 함께 적는다. [mg0912 §2](../minigame/mg0912.md) |
| 기존 C | [데이터] [mgB_main_actor.c](../../../analysis/decomp/mgB_main_actor.c), [actortick](../../../analysis/decomp/mgB_main_actortick.c), [actorjump](../../../analysis/decomp/mgB_main_actorjump.c), [actorcoord](../../../analysis/decomp/mgB_main_actorcoord.c), [actorground](../../../analysis/decomp/mgB_main_actorground.c), [ground2](../../../analysis/decomp/mgB_main_actorground2.c), [ground3](../../../analysis/decomp/mgB_main_actorground3.c), [ground4](../../../analysis/decomp/mgB_main_actorground4.c), [ground5](../../../analysis/decomp/mgB_main_actorground5.c), [pad](../../../analysis/decomp/mgB_main_pad.c). |
| 센서 C | [데이터] [mgA_main_sixaxis.c](../../../analysis/decomp/mgA_main_sixaxis.c), [sixaxis2](../../../analysis/decomp/mgA_main_sixaxis2.c), [sixaxis3](../../../analysis/decomp/mgA_main_sixaxis3.c), [sixaxis4](../../../analysis/decomp/mgA_main_sixaxis4.c), [sixaxis5](../../../analysis/decomp/mgA_main_sixaxis5.c). 기존 [mg0118 §6.2](../minigame/mg0118.md) 판독만 재사용한다. |
| 주소 색인 | [데이터] [INDEX.tsv](../../../analysis/decomp/INDEX.tsv), [main.nso.tsv](../../../analysis/functions/main.nso.tsv). INDEX의 같은 주소에는 다른 모듈도 있으므로 이름·C 파일로 교차 확인한다. |
| ActorParam | [데이터] [actorparam.json](../../../extracted/bea/bq.nx.bea/common/data/actorparam.json)의 `ActorParam[33]`. 로더 main `@0x71002b9bc0`; [06 §2.6](06_scene_data.md), [plaza §3.5](../shell/plaza_3d.md). |
| 현재 웹 | [데이터] 웹 소스: [PlazaMover](../../script/app/scene/world/plaza/player.ts), [collision API](../../script/game/lib/collision/index.ts). 최신 계약은 [11 §9](11_moving_collision.md), [09 §14](09_character.md)이다. |

[설계] 편집 원칙: 통합 단계는 추가 C 판독을 지정된 5개 빈 영역에 한정했다. 통합본 검증 뒤의 후속 단계는 추가 지시에 따라 이 문서의 미확정 전체를 대상으로 했다. 기존 완료 판독을 재사용한다. 단계별 추가 목록은 부록 B·C에 있다.

## 3. 진입점과 전체 호출 흐름

### 3.1 부착과 초기 설정

| 단계 | 연결 | 근거 |
|---|---|---|
| Entity 생성 | [판독] 장면이 Entity를 만든 뒤 AddComponent를 호출한다. 컴포넌트 배열은 Entity+0x38..0x40이다. | main `@0x7100289310`; [01 §9.7](01_core.md) |
| ComMatter | [판독] 생성 `@0x71002af8b4`→`@0x71002af940`. MatterType2는 같은 Entity에 ComActor를 추가한다. | [01 §9.7](01_core.md) |
| ComActor 생성 | [판독] ctor `@0x710000d2c0`의 기본 필드를 사용한다. | [mg0912 §4.6](../minigame/mg0912.md) |
| 공용 설정 | [판독] MatterType2는 `@0x71002afff4→02b0094→02b03d0→02b2e00`에서 ActorParam을 복사한다. SetLeverMove(true), SetMoveConstraint(0), SetupLegacy(5,−150,4,−25,−10)를 설정한다. | [mg0101 §6.5](../minigame/mg0101.md), [09 §4.8](09_character.md) |
| Pad·게임 설정 | [판독] mg0912는 ComActorPad(PlayerID, style0), 기본 액션 후 ExAction 덮어쓰기, 게임 전용 속도·초속·형상을 설정한다. | mg0912 `@0x710005ab00/@0x71000594e0`; [mg0912 §6.5](../minigame/mg0912.md) |
| 선택적 CCT | [판독] mg0912의 charactorcollisionenabled 기본0일 때 CCT를 만들지 않는다. 켜면 capsule(.4,.25), TickFix→MoveTo 경로다. 일반 ComActor 전체를 CCT로 대체할 근거가 없다. | mg0912 `@0x710006e1c8`; [mg0912 §4.1·6.5](../minigame/mg0912.md), [11 §4.3](11_moving_collision.md) |

### 3.2 공용 프레임 단계

| 순서 | 확정된 관계 | 근거 |
|---|---|---|
| 앞선 프레임 말 9→10→0x0B→0x0C | [판독] 0x0B HID 샘플, 0x0C InputModule edge가 다음 게임 갱신보다 먼저다. 애니 슬롯 진행도 0x0B에 있으나 본 평가 완료와 다르다. | main `@0x71007dc1a4/@0x7100190c70/@0x710080cd70`; [mg0122 §6.10](../minigame/mg0122.md), [mg0101 §3.6](../minigame/mg0101.md) |
| 프레임 시작 | [판독] MainModule이 FrameCount를 올리고 이번 delta를 공개한다. | main `@0x710019581c`; [01 §6.3](01_core.md) |
| 0x0E | [판독] Scene→Fiber→Entity 간선이 있다. 동일 priority 파이버는 등록 순서다. | main `@0x7100984a58/@0x71009891a0/@0x710018f400`; [mg0122 §3.5](../minigame/mg0122.md), [01 §3.3·6.4](01_core.md) |
| Entity 내부 | [판독] 의존 그룹→그룹의 수신 목록→한 Entity의 컴포넌트 배열 순으로 전달한다. 활성화·해제로 목록이 바뀐다. | main `@0x710089f9f0/@0x710089fce0/@0x7100899450`; [mg0101 §3.6](../minigame/mg0101.md), [mg0106 §3.2](../minigame/mg0106.md) |
| 0x0F | [판독] Entity→Physics다. Physics fixed update는 프레임의 fixed substep 수만큼 실행된다. | main `@0x7100614624`; [mg0122 §3.5](../minigame/mg0122.md), [01 §3.4](01_core.md) |
| 0x10 | [판독] Physics→Entity다. | main 등록 `@0x71008a273c`; [mg0122 §3.5](../minigame/mg0122.md) |
| 포즈 경계 | [판독] Entity 작성→dirty queue→SyncTransform→EN0A→물리 전 동기화다. Query는 queue를 강제 flush하지 않는다. | main `@0x7100893a90/@0x71008a26d0/@0x7100892d50/@0x7100614ce0`; [11 §2.2](11_moving_collision.md) |

[판독] 의존 등록 `a58(t,A,B)`는 B→A다. Kahn의 무진입 후보 LIFO와 Fiber의 안정 정렬은 다른 규칙이다. main `@0x7100984a58/@0x71009891a0`; [mg0122 §3.5](../minigame/mg0122.md), [01 §3.3](01_core.md).
[미확정] ComActor pre/tick·ActorWorld 접지 job을 위 Entity/Physics 장벽에 모두 배치하는 C 연결은 부족하다. 모듈 간 확정 간선만으로 게임별 수신 배열을 추정하지 않는다. [mg0106 §3.2·11](../minigame/mg0106.md), [mg0912 §11.1](../minigame/mg0912.md).
[판독] Variable60 오프라인 dt는 최대 .05 s이며 온라인은 고정1/60이다. actor 자체 적분은 §6.1의 60Hz 반올림 서브스텝이다. main `@0x7100196670/@0x7100987af8/@0x710000f230`; [mg0912 §3.6](../minigame/mg0912.md), [01 §4.4](01_core.md).

### 3.3 actor 내부 한 번의 갱신

[판독] 아래 순서는 기존 [mg0912 §6.1](../minigame/mg0912.md)을 재사용한다. 추가 확인은 C의 입력 gate와 fall 누적 조건에 한정한다. 근거: [actortick C](../../../analysis/decomp/mgB_main_actortick.c), [ground3 C](../../../analysis/decomp/mgB_main_actorground3.c).

```text
pre @0x7100008b8c → @0x710000ea68
  lazy component 연결 / default action 필요 검사
  jumpStatus=0; onFrameAcceleration=0; onFrameDeceleration=0
  일시적 HitShape 비활성화

tick wrapper @0x7100008c0c
  actor+0x44 활성 && !FUN_710000e35c(actor) 이면 tick
tick @0x710000ecd0
  +0x634 bit0 gate / 유효 Pad → PadLeverData(+0x430), 아니면 zero
  condition step(dt) @0x7100009dc0
  actionTime += dt
  oldPosition = Entity.translation
  gravity 조회 @0x710000f0f8
  context.enter=0, context.arg=0 → 현재 action callback
  integrate @0x710000f230
  rotate @0x710000f690
  dot(g,vVert)>0 이면 양의 dot(g,position-old)만 fall 누적
  아니면 fall 누적=0
  root constraint/모션 연결
  after-user-control callback(+0x5f0) 있으면 호출
```

[판독] 제공된 pre wrapper `@0x7100008b8c`도 tick wrapper와 같은 활성+0x44/`!FUN_710000e35c` gate 뒤에 `@0x710000ea68`을 호출한다. [gap C1](../../../analysis/decomp/actor_gap_c1.c).
[미확정] `@0x710000e35c`의 gate 의미와 pre의 전역 호출 등록은 아직 C가 없다. [ground3 C](../../../analysis/decomp/mgB_main_actorground3.c) `@0x7100008c0c`, [main 함수 목록](../../../analysis/functions/main.nso.tsv).
[판독] 기존 요약은 fall 누적을 위치 delta만으로 설명했다. 현 C는 먼저 수직 속도와 중력의 내적을 검사한다. §11.1에 양쪽 설명을 보존한다. `@0x710000ecd0`; [mg0912 §6.1](../minigame/mg0912.md), [actortick C](../../../analysis/decomp/mgB_main_actortick.c).

### 3.4 충돌 작업과 해제

[판독] `ActorWorld.DefaultCollision @0x7100006ef8`의 내부 순서는 Attack→Map packed→Limit→ActorBody→Event→Map packed→Limit다. 접지 `@0x7100006670`은 별도 ActorJob(+0x160)이다. [11 §4.3](11_moving_collision.md).
[미확정] 이 내부 순서를 pre→tick→ground 전체 장벽으로 확대하지 않는다. custom CollisionFunction/ActorJob의 실제 선택도 게임별이다. [11 §4.3·7](11_moving_collision.md).
[판독] 약한 handle은 node의 generation 일치와 pointer를 검사한다. 해제는 generation을 무효화한다. main `@0x710001316c/@0x710003a3a0`; [01 §4.11·9.7](01_core.md), [actor C](../../../analysis/decomp/mgB_main_actor.c).
[판독] 해제 루틴 `@0x710000dd30`은 Entity의 Actor tag 제거→보관된 std::function/콜백 배열 파괴→slot map cleanup `@0x7100039fd0`→condition map cleanup `@0x7100009d00`→action registry node 파괴→자체 weak-node generation 무효화/RcArena 반환 순서다. [actortick C](../../../analysis/decomp/mgB_main_actortick.c), 원래 수명 경계 [01 §9.7](01_core.md).
[미확정] ActorWorld 등록 제거를 호출하는 전체 연결과 두 map cleanup 내부의 자식 수명, Pad overlay 초기화는 아직 미확보 상태다. 위 해제 본체를 world unregister/Pad dispose 순서까지 확대한 것으로 취급하지 않는다. 같은 C·주소, 설계 §9.1.

## 4. 구조체·필드·상수·열거형

### 4.1 ComActor와 게임 객체의 필드 구분

[판독] 다음 오프셋의 기준 객체는 main ComActor다. 타입은 reader/writer로 확인한 f32/i32/byte/벡터와 설명용 이름이다. 빈 초기값은 미확정이며 0으로 채우지 않는다. ctor `@0x710000d2c0`; [mg0912 §4.6](../minigame/mg0912.md).

| 오프셋 | 타입·역할 | ctor 기본값 | 근거 |
|---|---|---|---|
| +0x40 / +0x44 | [판독] u32 actorType / byte 활성 gate | [판독] ctor 0x1fff / 1 | `@0x710000e0dc/@0x7100008c0c`; [actor C](../../../analysis/decomp/mgB_main_actor.c), [ground3 C](../../../analysis/decomp/mgB_main_actorground3.c); ctor `@0x710000d2c0`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c) |
| +0x50/+0x58/+0x60 | [판독] default/current action hash·registry | [판독] 두 hash=0x423edd2ebdc8bc49. [미확정] 전체 초기 등록표 | `@0x710000eb1c/@0x7100012044/@0x7100018df0`; [mg0912 §4.6](../minigame/mg0912.md), [actor C](../../../analysis/decomp/mgB_main_actor.c); ctor `@0x710000d2c0`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c) |
| +0xa0 / +0xa8 | [판독] f32 actionTime / condition map | [판독] actionTime=0. [미확정] 조건 클래스별 기본값 | `@0x7100012044/@0x710001316c`; [actor C](../../../analysis/decomp/mgB_main_actor.c); ctor `@0x710000d2c0`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c) |
| +0x130/+0x140/+0x150 | [판독] Vector4 gdir / f32 gmag / f32 gravityScale | (0,−1,0) / 9.8 / 1 | `@0x710000d2c0`; [mg0912 §4.6](../minigame/mg0912.md) |
| +0x160 / +0x180 | [판독] Velocity lever / Velocity vertical. vertical.y=+0x184 | [미확정] 전체 ctor 배치 | `@0x7100011d54/@0x7100014cc0`; [mg0912 §4.6](../minigame/mg0912.md) |
| +0x1c0/+0x1d0 | [판독] Vector4 한 프레임 가속 / f32 감속 | pre에서0 | `@0x710000ea68`; [mg0912 §6.1](../minigame/mg0912.md) |
| +0x1d8 | [판독] hash→WeakHandle<VelocitySlot> map | [판독] 새 slot callback 없음→step ZERO4. §6.8 | `@0x7100014dc0/@0x710003a3a0`; [mg0912 §4.6](../minigame/mg0912.md), [actor C](../../../analysis/decomp/mgB_main_actor.c); ctor `@0x710000d2c0`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c) |
| +0x200 | [판독] i32 jumpStatus: 0/1/2 | [판독] ctor/pre에서0 | `@0x710000ea68/@0x7100014a88`; [mg0912 §4.6·6.3](../minigame/mg0912.md); ctor `@0x710000d2c0`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c) |
| +0x210/+0x230/+0x240 | [판독] target rotation / old position / f32 fall accumulation | [판독] ConstantIdentity / ConstantZero / 0 | `@0x710000ecd0/@0x710000f690`; [mg0912 §4.6](../minigame/mg0912.md); ctor `@0x710000d2c0`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c) |
| +0x246 | [판독] byte gravity enabled | 1 | `@0x710000d2c0`; [mg0912 §4.6](../minigame/mg0912.md) |
| +0x270 | [판독] move constraint | MatterType2 설정0 | `@0x7100011d64/@0x71002b2e00`; [mg0912 §6.1](../minigame/mg0912.md), [mg0101 §6.5](../minigame/mg0101.md) |
| +0x2a1/+0x2a2/+0x2a3 | [판독] byte GroundedCheck / GroundedTest / grounded | [판독] 1 / 1 / 1. +0x2a0=0x01010100의 byte 저장 | `@0x7100014dc8/@0x7100014dd8/@0x710001178c`; [mg0912 §4.6](../minigame/mg0912.md), [11 §4.2](11_moving_collision.md); ctor `@0x710000d2c0`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c) |
| +0x2cc/+0x2d0 | [판독] f32 walk / run speed | 2 / 6 | `@0x710000d2c0`; [mg0912 §4.6](../minigame/mg0912.md) |
| +0x2d4/+0x2d8/+0x2dc | [판독] ground turn / fast turn / threshold | 360 / 1100 / 85° | 같은 ctor; [mg0912 §4.6](../minigame/mg0912.md) |
| +0x2e0/+0x2e4/+0x2e8 | [판독] air turn / fast turn / threshold | 360 / 1100 / 85° | 같은 ctor; [mg0912 §4.6](../minigame/mg0912.md) |
| +0x2ec | [판독] f32 walk/run lever threshold | .8 | 같은 ctor; [mg0912 §4.6](../minigame/mg0912.md) |
| +0x2fc/+0x300/+0x304 | [판독] air accel / decel / max speed | 40 / 40 / 6 | 같은 ctor; [mg0912 §4.6](../minigame/mg0912.md) |
| +0x308/+0x328/+0x334 | [판독] fall max / jump initial speed / hold seconds | 49 / 13.5 / .12 | 같은 ctor; [mg0912 §4.6](../minigame/mg0912.md) |
| +0x348/+0x358/+0x35c | [판독] ActionContext / byte enter / i32 arg | enter/arg는 호출마다 설정 | `@0x710000eb1c/@0x710000ecd0`; [mg0912 §4.6·5.2](../minigame/mg0912.md), [actor C](../../../analysis/decomp/mgB_main_actor.c) |
| +0x430 | [판독] PadLeverData | tick에서 입력 결과 또는 zero | `@0x710000ecd0`; [mg0912 §4.6](../minigame/mg0912.md), [actortick C](../../../analysis/decomp/mgB_main_actortick.c) |
| +0x5f0/+0x620/+0x632/+0x634 | [판독] after-control callback / position finalizer / 최소 substep flag / input gate | [판독] +0x632=0, +0x634=0. [미확정] gate 전체 의미 | `@0x710000ecd0/@0x710000f230/@0x7100011d64`; [mg0912 §6.1](../minigame/mg0912.md), [11 §4.2](11_moving_collision.md); ctor `@0x710000d2c0`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c) |

| 게임 기준 객체 | actor 관련 필드 | 근거 |
|---|---|---|
| mg0912 Player(0x410 B) | [판독] +0xd0 Actor, +0xe8 Pad, +0x100 AI handle; +0x158 runSpeed, +0x15c motionSpeed, +0x3e5 직전 접지. Actor+0x328과 Player+0x328(FxTrigger)은 다른 객체다. | mg0912 `@0x710005ab00/@0x71000594e0`; [mg0912 §4.5·6.5](../minigame/mg0912.md) |
| mg0107 Player/ComAI | [판독] Player+0x50 Actor, +0x6c 직전 jumpStatus; ComAI+0x50 Pad, +0x70 jumpHold timer. | mg0107 `@0x710000c3e0/@0x7100004900`; [mg0107 §3.2·4.6](../minigame/mg0107.md) |
| mg0118 Player | [판독] +0x18 Actor, +0xb8 PlayerID, +0x434 jumping, +0x438 jumpInterval, +0x444 damage timer. | mg0118 `@0x7100014750/@0x7100014a40`; [mg0118 §4.2·6.1](../minigame/mg0118.md) |

### 4.2 ActorParam와 설정 우선순위

[판독] 적용 순서는 ctor→ComMatter 공용 ActorParam→게임의 명시적 setter다. menu00/mg0101은 공용 이동값을 다시 덮지 않는다. mg0912는 게임 속도·초속을 덮는다. main `@0x710000d2c0/@0x71002b2e00`, mg0912 `@0x71000594e0/@0x71000698d0`; [mg0912 §4.6·6.5·6.7](../minigame/mg0912.md), [mg0101 §6.5](../minigame/mg0101.md), [plaza §3.5](../shell/plaza_3d.md).

| 행 | 값 | 필드·소비 타입·공용 적용값 | 근거 |
|---|---|---|---|
| 0 | 6 | [판독] [데이터] Actor+0x2d0 f32 run=6 | main `@0x71002b9d70/@0x71002b2e00`; [mg0101 §6.5](../minigame/mg0101.md) |
| 1 | 2 | [판독] [데이터] +0x2cc f32 walk=2 | main `@0x71002b9d78/@0x71002b2e00`; [mg0101 §6.5](../minigame/mg0101.md) |
| 2 | 40 | [판독] [데이터] +0x2fc f32 airAccel=40. +0x300 감속을 이 행에 연결하는 근거는 미확정 | main `@0x71002b2e00`; [plaza §3.5](../shell/plaza_3d.md), [09 §4.8](09_character.md) |
| 3/4/5 | 360/1100/85 | [판독] [데이터] +0x2d4/+0x2d8/+0x2dc f32 ground turn/fast/threshold | 같은 소비자; [plaza §3.5](../shell/plaza_3d.md) |
| 6/7/8 | 180/720/85 | [판독] [데이터] +0x2e0/+0x2e4/+0x2e8 f32 air turn/fast/threshold | 같은 소비자; [09 §4.8](09_character.md) |
| 32 | .8 | [판독] [데이터] +0x2ec f32 lever threshold | 같은 소비자; [plaza §3.5](../shell/plaza_3d.md) |
| 9..31 | 아래 표 | [미확정] 행별 소비 필드·최종 적용값은 미확보. [판독] 로딩 타입과 일부 `/60` 변환은 아래 후속 확인으로 해소했다. 숫자의 유사성만으로 jump/gravity/shape에 연결하지 않는다 | loader `@0x71002b9bc0`; [06 §2.6](06_scene_data.md), [mg0118 §6.7·11](../minigame/mg0118.md) |

[데이터] 아래는 원본 배열의 행 전체다. JSON 수치이며 로딩된 네 성분의 타입은 모두 f32다. 기존 06의 “[int,0,0,0]” 요약에는 소수·다성분 행이 빠져 있다. 근거: [actorparam.json](../../../extracted/bea/bq.nx.bea/common/data/actorparam.json), main loader `@0x71002b9bc0`; [06 §2.6](06_scene_data.md).

| 행 | 원본 값 | 행 | 원본 값 |
|---|---|---|---|
| 9 | [데이터] [−9.8,0,0,0] | 10 | [데이터] [16,0,0,0] |
| 11 | [데이터] [25.5,0,0,0] | 12 | [데이터] [18,0,0,0] |
| 13 | [데이터] [.12,0,0,0] | 14 | [데이터] [−49,0,0,0] |
| 15 | [데이터] [−150,0,0,0] | 16 | [데이터] [−25,0,0,0] |
| 17 | [데이터] [5,0,0,0] | 18 | [데이터] [4,0,0,0] |
| 19 | [데이터] [−10,0,0,0] | 20 | [데이터] [2.4,0,0,0] |
| 21 | [데이터] [5.8,0,0,0] | 22 | [데이터] [30,0,0,0] |
| 23 | [데이터] [40,0,0,0] | 24 | [데이터] [1.5,0,0,0] |
| 25 | [데이터] [20,0,0,0] | 26 | [데이터] [.75,−.05,0,0] |
| 27 | [데이터] [0,.8,0,.7] | 28 | [데이터] [1,.5,.5,0] |
| 29 | [데이터] [.25,0,0,0] | 30 | [데이터] [18,0,0,0] |
| 31 | [데이터] [6,0,0,0] | — | [미확정] 위 행의 consumer 미확보 |

| 게임 덮어쓰기 | 최종 값 | 근거 |
|---|---|---|
| mg0912 일반 | [판독] [데이터] walk2/run7.8/jump23, ground turn360/360 | mg0912 `@0x71000594e0/@0x710006c0f0`; [mg0912 §4.1·4.2·4.6](../minigame/mg0912.md) |
| mg0912 과일 대시 | [판독] [데이터] walk7.5/run15, ground turn=SceneParam×.3, 1 s | mg0912 `@0x71000698d0`; [mg0912 §6.7](../minigame/mg0912.md) |
| mg0912 트램펄린 | [판독] +0x328=42→CallAction(Jump)→23 복원 | mg0912 `@0x710006dbb0`; [mg0912 §6.10.2](../minigame/mg0912.md). 진입 timing은 §5.2 |
| mg0106 전용 ActorParam.json | [데이터] ModelScale=.8/ColRadius=.8. 최종 capsule 적용은 [미확정] | mg0106 `@0x710001b9c0`, main `@0x71002b2e00`; [mg0106 §4.2·11](../minigame/mg0106.md), [11 §3.4](11_moving_collision.md) |

[판독] 후속 확인: 로더는 각 행의 네 성분을 `TryGetFromArray<float>`로 읽는다. 따라서 원문의 “[int,0,0,0]”는 저장 타입을 나타내지 않는다. main `@0x71002b9bc0`; [사용자 제공 actor_gap_c1.c](../../../analysis/decomp/actor_gap_c1.c), 기존 [06 §2.6](06_scene_data.md).
[판독] 파싱 성공 여부 분기 뒤에 행22·23·25·30·31의 첫 성분을 f32 `/60.0`으로 바꾼다. 네 성분 전체를 나누는 것이 아니다. 같은 로더·C.

| 행 | JSON 첫 성분 | 로딩 뒤 첫 성분 | 근거 |
|---|---|---|---|
| 22 | 30 | [추정] 재구현 계산: f32 .5 | main `@0x71002b9bc0`; [gap C1](../../../analysis/decomp/actor_gap_c1.c) |
| 23 | 40 | [추정] 재구현 계산: f32 .666666687 | 같은 주소·C |
| 25 | 20 | [추정] 재구현 계산: f32 .333333343 | 같은 주소·C |
| 30 | 18 | [추정] 재구현 계산: f32 .300000012 | 같은 주소·C |
| 31 | 6 | [추정] 재구현 계산: f32 .100000001 | 같은 주소·C |

[판독] 공용 소비 C가 추가로 확보한 필드 저장은 아래와 같다. 함수 반환을 f32 필드에 저장한다. getter의 C가 없어 JSON 행 번호는 연결하지 않는다. main `@0x71002b2e00`; [runtime_A_collision_reuse.c](../../../analysis/decomp/runtime_A_collision_reuse.c), 기존 공용 연결 [09 §4.8](09_character.md).

| getter 주소 | Actor 대상 필드 | 형·값의 확정 범위 |
|---|---|---|
| `@0x71002b9db8` | +0x328 | [판독] f32 jump initial. [미확정] 대응 행·공용 최종값 |
| `@0x71002b9dc0` | +0x32c | [판독] f32. [판독] 반사 Jump arg1에서 소비. `@0x710002fed0`; [actor C](../../../analysis/decomp/mgB_main_actor.c). [미확정] 대응 행 |
| `@0x71002b9dc8` | +0x330 | [판독] f32. [판독] 밀림 Jump arg2에서 소비. `@0x710002fed0`; [actor C](../../../analysis/decomp/mgB_main_actor.c). [미확정] 대응 행 |
| `@0x71002b9dd0` | +0x334 | [판독] f32 hold seconds. [미확정] 대응 행 |
| `@0x71002b9dd8` | +0x310 | [판독] f32. [미확정] 필드 역할·대응 행 |
| `@0x71002b9de0` | +0x314 | [판독] f32. [미확정] 필드 역할·대응 행 |
| `@0x71002b9de8` | +0x318 | [판독] f32. [미확정] 필드 역할·대응 행 |
| `@0x71002b9df0` | +0x31c | [판독] f32. [미확정] 필드 역할·대응 행 |
| `@0x71002b9df8` | +0x324 | [판독] f32. [미확정] 대응 행. `@0x71000150e0`은 Pressed Init에 이 값을 넘긴다. [actor C](../../../analysis/decomp/mgB_main_actor.c) |
| `@0x71002b9e00` | +0x320 | [판독] f32. [미확정] 필드 역할·대응 행 |

### 4.3 ComActorPad 필드·논리 비트

| 오프셋 | 의미·초기값 | 근거 |
|---|---|---|
| +0x28/+0x29 | [판독] byte enabled=1 / overlayEnabled=0 | main ctor `@0x710001e0b4`; [mg0122 §6.10](../minigame/mg0122.md) |
| +0x2c | [판독] PlayerID. 초기 인자에 따른 값 | main `@0x710001e54c/@0x710001eac4`; [pad C](../../../analysis/decomp/mgB_main_pad.c), [mg0122 §6.10](../minigame/mg0122.md) |
| +0x30 | [판독] actor style A=0 | main ctor `@0x710001e0b4`; [mg0122 §6.10](../minigame/mg0122.md) |
| +0x34/+0x38 | [판독] getter mask, 기본값 FFFFFFFF | main `@0x710001e54c/@0x710001e5cc`; [mg0122 §6.10](../minigame/mg0122.md) |
| +0x3c/+0x40 | [판독] u32 overlayMask / overlayHold. 초기값은 [미확정]; edge 저장은 +0x44/+0x48 | main `@0x710001e54c`; [pad C](../../../analysis/decomp/mgB_main_pad.c), [mg0122 §6.10](../minigame/mg0122.md) |
| +0x50 | [판독] f32 stick radial threshold=.1, bits 0x3DCCCCCD | main `@0x710001e0b4/@0x710001eac4`; [mg0122 §6.10](../minigame/mg0122.md) |
| +0x44/+0x48 | [판독] u32 overlayTrigger / overlayRelease. 초기값은 [미확정] | main `@0x710001e894/@0x710001e8b0`; [gap C1](../../../analysis/decomp/actor_gap_c1.c), 기존 [mg0122 §6.10](../minigame/mg0122.md) |
| +0x60 | [판독] overlayStick의 16 B Vector3f 저장 영역. 초기값은 [미확정] | main `@0x710001ec50/@0x710001eac4`; [gap C1](../../../analysis/decomp/actor_gap_c1.c), [pad C](../../../analysis/decomp/mgB_main_pad.c), [mg0122 §6.10](../minigame/mg0122.md) |
| +0x2a/+0x2b | [판독] byte 아날로그 이동 / Dpad 이동 허용. 초기값은 [미확정] | main `@0x710001ec6c/@0x710001e8b8`; [gap C1](../../../analysis/decomp/actor_gap_c1.c), [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c) |
| +0x4c | [판독] u32 레버 각 양자화 분할 수. 0이면 양자화 없음. 초기값은 [미확정] | main `@0x710001e8b8`; [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c) |
| +0x70 | [판독] action hash→ActionTest callback map | main `@0x710001edbc`; [gap C1](../../../analysis/decomp/actor_gap_c1.c) |
| +0xa0/+0xc0 | [판독] PadStickOverride std::function 저장 영역 / 대상 pointer. PadStickOverride 대상이다. ComActor의 lever camera와 별도다. | main `@0x710001f16c/@0x710001e8b8`; [gap C1](../../../analysis/decomp/actor_gap_c1.c), [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c) |

[판독] bex 논리 버튼은 A/B/X/Y=0x1/2/4/8, L/R/ZL/ZR=0x10/20/40/80이다. NPAD raw bit 번호를 그대로 사용하지 않는다. main `@0x71007e4e70/@0x71001929b0/@0x7100192a70/@0x7100192b30/@0x7100192bf0`; [mg0122 §6.10](../minigame/mg0122.md).
[판독] monitor style M은 2 FullKey/3 Handheld/4 JoyDual/5 JoyLeft/6 JoyRight다. HID 방향0/1과 InputModule style S와 actor style A는 별도다. main `@0x71007dde50/@0x71007da7dc/@0x71007e685c`; [mg0122 §6.10](../minigame/mg0122.md).

### 4.4 JumpCalculator

| 항목 | 값·뜻 | 근거 |
|---|---|---|
| SetupLegacy | [판독] (5,−150,4,−25,−10). 두 구간 경계 속도와 가속값, 마지막 하강 경계다 | main `@0x71000219d0/@0x7100022110`; [mg0912 §6.2.1](../minigame/mg0912.md) |
| reset/off factor | [판독] 5. 기본 gmag9.8이면 낭떠러지 낙하 가속49 | main `@0x7100021ae0`; [mg0912 §6.2.1](../minigame/mg0912.md) |
| Start frame | [판독] 기존 동일 FrameCount factor0 설명은 유효 중력0의 요약이다. 후속 C에서는 IsHold가 가속 적용을 생략한다. §6.1·11.1 | main `@0x7100021a9c/@0x7100021af8`; [mg0912 §6.2.1](../minigame/mg0912.md) |
| holdFrameMax | [판독] int(.12×60)=7. 입력 hold 시간과 별도 카운터다 | main `@0x710002fed0`, mg0912 `@0x710005dba4`; [mg0912 §5.2·6.2](../minigame/mg0912.md) |
| 최종 하강 구간 | [판독] 아래 방향 49 m/s². factor=가속도/−9.8 | main `@0x7100022110`; [mg0912 §6.2.1](../minigame/mg0912.md) |
| 프레임 내부 update 위치 | [판독] gravityOn의 수직 서브스텝마다 Reset/Update→IsHold 검사→가속→위치다. | main `@0x710000f230/@0x7100021af8`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c), 기존 공백 [mg0912 §6.2.2·11.1](../minigame/mg0912.md) |

### 4.5 형상·시각 스케일

[판독] MatterType2 Adjust는 source capsule a=(0,.5,0), b=(0,1,0), r=.5다. Actor mask=0x2022(번호1·5·13)다. 별도 Attack sphere r=.8을 Adjust 크기로 사용하지 않는다. main `@0x71002b2e00/@0x710001cf80`; [11 §3.4](11_moving_collision.md).
[판독] SetSourceCapsule(a,b,r)는 끝점 입력이다. h=|b−a|/2이며 CreateCapsule(r,h)의 h는 반높이다. main `@0x710001cd20/@0x710001c6cc/@0x7100603554/@0x710060359c`; [11 §3.3](11_moving_collision.md).
[판독] 비본 HitShape의 radius/길이는 Entity 시각 scale을 읽지 않는다. PCIndividualScale 적용만으로 capsule radius를 곱하지 않는다. main `@0x71000146a4/@0x71001d665c/@0x710004d164`; [11 §3.4](11_moving_collision.md).
[미확정] 본 부착·비균등/음수 scale의 일반 규칙과 mg0106 전용 ColRadius consumer는 별도다. [11 §3.4·7](11_moving_collision.md).


## 5. 상태 전이와 전체 수명

### 5.1 이동 액션과 전환 조건

[판독] `ComActor::ChangeAction @0x7100012084`는 context.enter/arg를0으로 만들고 `DefaultActorAction @0x710003134c`를 부른다. 아래 mask 규칙은 기존 [mg0912 §4.11](../minigame/mg0912.md)의 판독이다. wrapper와 규칙 함수 주소를 구분한다.

| 현재 액션 | 매 프레임 mask·이동 | 전환의 핵심 | 근거 |
|---|---|---|---|
| Idle | [판독] 0x38, 진입 때 lever velocity reset | 접지 상실→Fall, Jump trigger→Jump, lever→Walk/Run | main `@0x710002fbfc`; [plaza §3.5](../shell/plaza_3d.md), [mg0912 §4.11·5.2](../minigame/mg0912.md) |
| Walk | [판독] 0x68, MoveLeverDirection(walkSpeed) | lever0→Idle, 깊이≥.8→Run, Jump, 접지 상실 | main `@0x710002fc78/@0x71000149e8`; 같은 출처 |
| Run | [판독] 0x58, MoveLeverDirection(runSpeed) | lever0→Idle, 0<깊이<.8→Walk, Jump, 접지 상실 | main `@0x710002fda0/@0x71000149e8`; 같은 출처 |
| 공용 Jump | [판독] 0x89, MoveAir | 하강→Fall, touchdown 경로 | main `@0x710002fed0/@0x710003134c`; [actor C](../../../analysis/decomp/mgB_main_actor.c), 공용/게임 구분 [mg0912 §4.11·5.2](../minigame/mg0912.md) |
| Yoshi Jump | [판독] 0x81, MoveAir | 게임 고유 HoldJump/Fall 전환 | mg0912 `@0x710005dba4`; [mg0912 §4.11·5.2](../minigame/mg0912.md) |
| Landing | [판독] 0x3a, 진입 lever reset·land 모션 | motion finish 조건을 포함해 지상 액션 선택 | main `@0x7100030728`; [mg0912 §4.11·5.2](../minigame/mg0912.md), [actor C](../../../analysis/decomp/mgB_main_actor.c) |
| 공용 Fall | [판독] 0x09, MoveAir | touchdown 경로. Yoshi Fall과 다른 mask다 | main `@0x7100030528`; [actor C](../../../analysis/decomp/mgB_main_actor.c), 비교 [mg0912 §4.11](../minigame/mg0912.md) |
| Yoshi Fall/HoldJump | [판독] 각각0x89/0x09, MoveAir | 조건부 HoldJump 전환은 §5.3 | mg0912 `@0x71000618c4/@0x710005e060`; [mg0912 §5.2·6.2.3](../minigame/mg0912.md) |

[판독] mask bit0=지상/공중, bit1/2=모션 종료 요구, bit3=Jump 또는 공중 공격 입력, bit4/5=Walk/Run 선택, bit7=하강 Fall 선택이다. main `@0x710003134c`; [mg0912 §4.11](../minigame/mg0912.md).
[판독] touchdown은 dot(vVert,g)≥0과 IsGrounded를 검사한다. Landing/Idle 분기는 dot>−1과 actor+0x49 조건을 포함한다. main `@0x71000126d0/@0x710003134c`; [mg0912 §4.11](../minigame/mg0912.md).
[미확정] 반환 코드·mask의 모든 조합을 단일 enum으로 이름 붙일 근거는 없다. 같은 비트를 임의의 상태 enum으로 바꾸지 않는다. [mg0912 §4.11](../minigame/mg0912.md).

[판독] 후속 보완: 규칙 함수는 bit6을 직접 검사하지 않는다. `mask&0x30`이 있으면 ChangeActionGroundLever에 mask 전체를 전달한다. bit6의 의미는 그 helper/설정된 callback의 소비까지 확인해야 한다. main `@0x710003134c`, proxy `@0x7100012370`; [actor C](../../../analysis/decomp/mgB_main_actor.c), 기존 helper label 기록 [mg0912 §4.11](../minigame/mg0912.md).
[판독] 아래는 기존 요약에서 생략됐던 모션 조건·반환 검사 순서다. `finished`는 bit1이 켜진 경우에만 모션 종료를 읽는다. 유효 모션이 없으면 종료로 간주한다. 각 전환 API의 결과가 int로4보다 크면 즉시 반환한다. main `@0x710003134c`; 같은 C·출처.

```text
DefaultActorAction(context,mask):
  actor=context.actor
  if !(mask&1):                         // 지상 규칙
    result=4
    if !IsGrounded():
      result=CallAction(Fall,true)
      if int(result)>4: return result
    finished=(mask&2) ? (!validMotion || motion.IsFinished()) : false
    if (mask&4) && !finished: return result
    if mask&8:
      result=ChangeActionGroundInput()
      if int(result)>4: return result
    if mask&0x30:
      result=ChangeActionGroundLever(mask)
      if int(result)>4: return result
    if mask&2:
      if !finished: return result
    else:
      if !finished && GetLeverLevel()!=0: return result
    return CallAction(Idle,true)
  else:                                 // 공중 규칙
    D=dot4_f32(vVert,gdir)
    if D>=0 && IsGrounded():
      return ChangeActionTouchdown(D>-1 && actor[0x49] ? Landing : Idle)
    finished=(mask&2) ? (!validMotion || motion.IsFinished()) : false
    if (mask&4) && !finished: return 4
    if mask&8:
      result=ChangeActionAirInput()
      if int(result)>4: return result
    if ((mask&0x80)==0 || D<0) && !finished: return 4
    return CallAction(Fall,true)
```

[판독] 위 설명용 GroundInput/AirInput의 원본 호출은 `@0x7100012098/@0x7100012830`이다. result4는 이 규칙 함수의 계속/무전환 경로다. SetActionName의3/6과 합쳐 모든 API에 적용되는 enum으로 만들지 않는다. main `@0x710003134c/@0x7100012044`; [actor C](../../../analysis/decomp/mgB_main_actor.c), [mg0912 §4.11](../minigame/mg0912.md).

### 5.2 등록·호출·조건의 수명

| API | 확보한 동작 | 근거 |
|---|---|---|
| SetActionName(name,force) | [판독] force=0이고 현재 hash와 같으면3. 다르면 hash를 쓰고 actionTime=0, +0x48=1, 반환6 | main `@0x7100012044`; [actor C](../../../analysis/decomp/mgB_main_actor.c), 기존 필드 [mg0912 §4.6](../minigame/mg0912.md) |
| CallAction(name,bool) | [판독] +0x358=bool, +0x35c=0 후 registry dispatcher를 동기 호출한다. dispatcher는 저장한 callback의 virtual+0x30을 호출한다. | main `@0x710000eb1c/@0x7100018df0`; [actor C](../../../analysis/decomp/mgB_main_actor.c), 이전 의문 [mg0912 §11.1·6.10.2](../minigame/mg0912.md) |
| CallAction(name,context) | [판독] enter가0이면 현재 실행 callback 경로, 비영이면 이름 lookup 경로다. 동일한 bool overload라고 가정하지 않는다. | main `@0x71000133f8/@0x7100018f54`; [actor C](../../../analysis/decomp/mgB_main_actor.c) |
| 등록/삭제 | [판독] 게임은 기본 action을 EraseAction한 뒤 ExAction으로 대체할 수 있다. | main `@0x710000e30c`, mg0101 `@0x710001d008`; [mg0101 §6.5](../minigame/mg0101.md), [mg0912 §6.5](../minigame/mg0912.md) |
| SetActorType | [판독] bit12 HipDrop, bit10 Punch, bit11 Kick, bit3 damage 네 액션, bit6 Walk, bit7 Run이0이면 제거한다. bit9가1이면0x300을 켜고, bit8/9 모두0이면 Jump를 제거한다. | main `@0x710000e0dc`; [actor C](../../../analysis/decomp/mgB_main_actor.c), 기존 사용자 [mg0912 §6.5](../minigame/mg0912.md) |
| actorType 입력 gate | [판독] bit0/1/2가0이면 +0x634의 bit1/2/3을 각각 OR한다. bit4/5가0이면 +0x2c8/+0x2c9를0으로 둔다. | main `@0x710000e0dc`; [actor C](../../../analysis/decomp/mgB_main_actor.c). 각 gate의 전체 의미는 [미확정] |
| CanSetCondition | [판독] 유효 owner가 있어야 factory의 이름 조회에 위임한다. | main `@0x7100013084/@0x710000a368`; [actor C](../../../analysis/decomp/mgB_main_actor.c) |
| SetCondition(name,replace) | [판독] 기존 hash가 있고 replace=0이면 기존 handle을 반환한다. replace=1이면 기존 generation을 무효화하고 새 factory 결과로 바꾼다. 실패는 무효 handle이다. | main `@0x710001316c/@0x710000a380`; [actor C](../../../analysis/decomp/mgB_main_actor.c) |
| Has/Get/Delete/Suspend | [판독] hash map으로 조회한다. Suspend는 유효 조건에 Suspended를 호출한 뒤 무효화한다. | main `@0x7100013898/@0x7100014ed0/@0x7100014ec8/@0x7100014ed8/@0x710000a640`; [actor C](../../../analysis/decomp/mgB_main_actor.c) |
| condition update | [판독] actor tick의 액션보다 먼저 scheduler를 호출한다. 아래 후속 판독으로 snapshot/만료 규칙을 보완했다. [미확정] 조건별 기간·효과의 virtual callback은 아직 미확보 상태다. | main `@0x710000ecd0/@0x7100009dc0`; [mg0912 §6.1](../minigame/mg0912.md), [actortick C](../../../analysis/decomp/mgB_main_actortick.c) |

[판독] 위 동기 dispatcher는 “CallAction이 언제나 다음 pre까지 지연된다”는 일반 설명을 반박한다. `@0x710000eb1c/@0x7100018df0`; [actor C](../../../analysis/decomp/mgB_main_actor.c).
[미확정] 트램펄린의 정확한 overload/default bool와 해당 ExAction 진입까지 이 C 목록만으로 완결하지 못했다. 42를 보장하는 최종 NRO 호출 인자는 별도로 남긴다. mg0912 `@0x710006dbb0`; [mg0912 §6.10.2](../minigame/mg0912.md).
[미확정] NOP/Punch/Kick/HipDrop/damage의 전체 판정·전용 condition 종류·반사/밀림 점프의 상세 수치는 이 통합에서 완결되지 않았다. 부분 actorType 규칙을 전체 액션 구현으로 취급하지 않는다. main `@0x7100030798/@0x7100030ab0/@0x7100031670`; [actor C](../../../analysis/decomp/mgB_main_actor.c), [mg0101 §6.5](../minigame/mg0101.md).

[판독] 후속 scheduler `@0x7100009dc0`는 map의 유효 WeakHandle을 snapshot한다. 무효 map node는 그 수집 단계에서 지운다. snapshot을 순회할 때 generation을 다시 검사한다. [actorground C](../../../analysis/decomp/mgB_main_actorground.c), 호출 위치 [mg0912 §6.1](../minigame/mg0912.md).
[판독] 유효 조건의 virtual+0x38이1을 반환하면 generation을 `+0x100000000`으로 바꾸고 virtual+0x28로 파괴한다. 1 이외의 반환은 이 scheduler에서 파괴하지 않는다. 같은 주소·C.
[판독] `@0x7100007d20`은 ActorWorld+0x130 factory에 `@0x710000abc0`로 위임한다. Damage/Pressed constructor 등록은 ComMatter 소비 C에 있다. factory의 완전 구현·조건별 효과는 아직 미확정이다. [gap C1](../../../analysis/decomp/actor_gap_c1.c), main `@0x71002b2e00` [runtime reuse C](../../../analysis/decomp/runtime_A_collision_reuse.c), 공용 연결 [09 §4.8](09_character.md).

```text
// scheduler @0x7100009dc0; 반환1만 만료로 처리
snapshot = collectValidConditionsAndEraseInvalidNodes()
for weakCondition in snapshot:
  if generationAndPointerStillValid:
    result = condition.virtualStep(dt)   // C 타입은 undefined4; 호출자는 dt 전달
    if result == 1:
      invalidateGeneration()
      condition.virtualDestroy()
```

### 5.3 게임 고유 상태를 공용 액션과 분리

[판독] YoshiJump 진입은 type0, vertical=−gdir×초속, holdFrameMax7, jumpCount++, 중력on/scale1이다. main `@0x7100014cc0`, mg0912 `@0x710005dba4`; [mg0912 §5.2](../minigame/mg0912.md).
[판독] YoshiFall은 Yoshi_Jump 재생 중·현재 Y가 jumpStart.Y보다 큼·입력 enabled·A hold일 때 HoldJump를 호출한다. mg0912 `@0x71000618c4`; [mg0912 §6.2.3](../minigame/mg0912.md).
[판독] HoldJump 진입은 vy0/scale.25다. t≥.3이면 scale−.4, vy 상한2.2다. t>1 또는 A release면 Fall/Yoshi_Fall로 끝난다. mg0912 `@0x710005e060`; [mg0912 §4.2·6.2.3](../minigame/mg0912.md).
[판독] Player 상태1/5/7은 입력을 끈다. 피격·골·낙하/재등장은 Player의 별도 상태다. mg0912 `@0x7100068b20/@0x71000695c0`; [mg0912 §5.1](../minigame/mg0912.md).
[판독] mg0101은 Jump/Punch/Kick/HipDrop을 지운다. mg0107은 Setup에서 액션8개를 지우고 GroundedCheck를 끈다. 게임별 액션 집합을 ctor의 일반 집합과 분리한다. mg0101 `@0x710001d008`, mg0107 `@0x710000c3e0`; [mg0101 §6.5](../minigame/mg0101.md), [mg0107 §3.2](../minigame/mg0107.md).

## 6. 계산식·조건·상세 의사코드

### 6.1 f32와 적분 서브스텝

[판독] 원본은 f32 저장·연산을 사용한다. 아래 식은 기존 판독의 연산 의존 순서를 유지한다. 근거: main `@0x710000f230/@0x7100036dd0`; [mg0912 §6.1](../minigame/mg0912.md).
[설계] 웹 설계: `F`는 단정밀도 반올림이다. 재구현에서 중간값을 double로 유지하거나 식을 대수적으로 합치지 않는다.
[미확정] 기존 수식 요약은 모든 SIMD/FMA·정규화 중간 반올림을 명세하지 않았다. 해당 구간의 “원본 비트 일치”를 보장할 수 없다. C가 비정상인 §6.8과 회전 삼각함수도 같은 제한이다. [mg0912 §6.3·11.1](../minigame/mg0912.md), [11 §9.9](11_moving_collision.md).

[판독] 아래는 적분의 기존 판독 순서다. `H=f32(.016666668)`의 곱을 임의의 double `/60`으로 바꾸지 않는다. 추가 슬롯의 직접 위치 덧셈은 이번 C로 확인했다. main `@0x710000f230`; [mg0912 §6.1](../minigame/mg0912.md), [actortick C](../../../analysis/decomp/mgB_main_actortick.c).

```text
n = trunc(F(F(dt * 60) + .5))
if n == 0: n = actor[0x632] ? 1 : 0
horizontalMax = IsGrounded() ? FLT_MAX : airMax
[vLever, delta] = horizontalIntegrate(horizontalMax,decel,vLever,accel,n)
if !autoRotateRunning || autoPositionRunning:
  position += delta                     // helper 합을 current position에 한 번 더함

scale = gravityScale                    // 수직 루프 전에 한 번 읽음
if gravityEnabled && n>0:
  n번:
    if IsGrounded():                     // 루프 안에서 flags/jumpStatus 재검사
      jumpStatus=0
      if jumpCalc: jumpCalc.reset()
      vVert.resetToReferenceValue()
    if jumpCalc: jumpCalc.update()        // 현 vy로 factor 갱신; 가속보다 앞
    if scale!=0 && (!jumpCalc || !jumpCalc.isHold()):
      acc=F(scale*gmag)
      if jumpCalc: acc=F(acc*jumpCalc.factor)
      vNext.x=F(vVert.x+F(F(gdir.x*acc)*H))
      vNext.y=F(vVert.y+F(F(gdir.y*acc)*H))
      vNext.z=F(vVert.z+F(F(gdir.z*acc)*H))
      vNext.w=vVert.w
      D=dot4_f32(vNext,gdir)              // (z+x)+w+y의 reduction 순서
      if fallMax<D:
        correction=F(fallMax-D)
        vNext=F_components(vNext+gdir*correction)
      vVert=vNext
    position.xyz=F_components(position.xyz+vVert.xyz*H)
    // position.w에는 수직 증가가 없음

position += velocitySlots.step(dt)       // 전체 프레임에 한 번; 추가 H/dt 곱 없음
SetPosition(position)
if autoInterpolation running: TryFinish()
```

[판독] 후속 연결 확인: `@0x7100021af8`은 `@0x710000f230`의 수직 서브스텝 안에서 호출된다. Start 동일 프레임의 유효 중력0은 C상 IsHold가 가속 적용을 건너뛰는 경로다. 반환 factor 자체를 반드시0으로 쓰는 것으로 일반화하지 않는다. [actortick C](../../../analysis/decomp/mgB_main_actortick.c), 기존 가정 [mg0912 §6.2.1·6.2.2](../minigame/mg0912.md).
[판독] 계산기가 없으면 factor를 곱하지 않는다. factor5 낙하는 부착된 계산기가 off/reset일 때의 동작이다. terminal clamp는 `v+=g*(limit-dot(v,g))`이며 전체 벡터를 재정규화하는 방식이 아니다. main `@0x710000f230`; 같은 C.
[판독] 수평 helper는 delta를0에서 누적하고 v/delta를 따로 반환한다. 원문 축약의 “pos+=v/60”를 world position에 매 서브스텝 바로 더하면 f32 반올림 위치가 달라질 수 있다. main `@0x7100036dd0/@0x710000f230`; [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [actortick C](../../../analysis/decomp/mgB_main_actortick.c), 원래 축약 [mg0912 §6.1](../minigame/mg0912.md).

```text
horizontalIntegrate(max,decel,v,accel,n):
  delta=ZERO4
  if n<=0: return [v,delta]
  if max<0: abort
  accelStep.xyz=F_components(accel.xyz*H) // 루프 전에 한 번
  decelStep=F(decel/60.0)                // H 곱으로 대수 치환하지 않음
  n번:
    v.xyz=F_components(v.xyz+accelStep.xyz)
    if decelStep>0:
      speed=length4_f32(v)
      if decelStep<speed:
        nextSpeed=F(speed-decelStep)
        inverse=F(1.0/speed)
        v.xyz=F_components(F_components(v.xyz*nextSpeed)*inverse)
        v.w=0
      else: v=ZERO4
    speed=length4_f32(v)
    if max<speed:
      ratio=F(max/speed)
      v.xyz=F_components(v.xyz*ratio); v.w=0
    delta.xyz=F_components(delta.xyz+F_components(v.xyz*H))
  return [v,delta]
```

[판독] 위 연산 의존·분기·곱/나눗셈 구분은 helper C를 근거로 보완했다. 길이 제곱합은 z²+x²+w²+y²다. `@0x7100036dd0`; [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c).
[미확정] C가 표현한 float storage 재해석과 실제 FMA/SIMD의 instruction별 반올림 동등성은 원본 명령/trace 없이 완료로 선언하지 않는다. 검증 수치는 §10의 조건과 함께 사용한다.

### 6.2 레버·지상 속도·공중 제어

[판독] MoveLeverDirection은 레버가 있으면 target rotation을 레버 각으로 두고 `vLever=unitDirection×speed×conditionMultiplier`를 쓴다. 레버 깊이는 속도에 곱하지 않는다. 없으면 velocity0이다. main `@0x71000149e8`; [mg0912 §6.3](../minigame/mg0912.md).
[판독] Walk/Run 선택은 깊이0/.8의 경계다. 지상 속도 상한은 FLT_MAX이며 공중은6이다. main `@0x710003134c/@0x710000f230`; [mg0912 §4.11·6.1](../minigame/mg0912.md).
[판독] MoveAir는 `dot(vVert,gdir)>0 ? jumpStatus2 : 1`을 쓴다. 레버가 있으면 target rotation과 acceleration을 설정한다. 없으면 decel40이다. main `@0x7100014a88`; [mg0912 §6.3](../minigame/mg0912.md).

```text
MoveAir:
  status = dot(vVert,gdir)>0 ? 2 : 1
  if lever:
    targetRotation = lever.rotation
    multiplier = (!autoInterpolation && depth < .8) ? .075 : 1
    acceleration = lever.direction * airAcceleration * multiplier
  else:
    deceleration = airDeceleration
```

[판독] 공중 진입 뒤 수평6 제한은 첫 서브스텝에 적용한다. mg0912 지상7.8/대시15가 공중에서도 유지된다고 구현하지 않는다. main `@0x710000f230`; [mg0912 §6.1](../minigame/mg0912.md).
[미확정] conditionMultiplier의 조건 종류별 결합·캡은 §5.2의 미확정이다. 기본1 이외의 동작을 발명하지 않는다. [mg0912 §6.3](../minigame/mg0912.md).

### 6.3 몸 선회

[판독] 현재/목표 각차가85° 이상이면 fast turn을 쓴다. 접지 여부에 따라 ground/air 필드가 다르다. main `@0x710000f690`; [mg0912 §6.3](../minigame/mg0912.md), [plaza §3.5](../shell/plaza_3d.md).
[추정] 값은 °/s이며 보간은 `Util.InterpolateRot(speed,dt)`이다. 원본 quaternion 최단경로·삼각함수 비트까지의 계약은 별도다. 같은 주소·출처.
[판독] 공용 ActorParam 적용 후 값은 ground360/1100, air180/720이다. mg0912 ground360/360과 생성자 air360/1100을 혼합하지 않는다. main `@0x71002b2e00`; [plaza §3.5](../shell/plaza_3d.md), [mg0912 §4.6](../minigame/mg0912.md).

### 6.4 JumpCalculator의 구간식

[판독] 다음 식은 기존 판독 그대로이며 vy는 Actor+0x184다. 기본 gravity (0,−1,0)을 전제한 설명이다. main `@0x7100022110`; [mg0912 §6.2.1](../minigame/mg0912.md).

```text
if vy >= 5:
    accelerationY = -150
else if vy >= 4:
    accelerationY = -150 + (vy - 5) / (4 - 5) * (-25 + 150)
else if vy >= -10:
    accelerationY = -25 + (vy - 4) / (-10 - 4) * (-49 + 25)
else:
    accelerationY = -49
factor = accelerationY / -9.8
actualGravity = gravityScale * gravityMagnitude * factor
```

[판독] 분기 순서와 각 뺄셈→나눗셈→곱셈→덧셈의 의존을 유지한다. 위 식을 전체 선형식으로 합치지 않는다. `@0x7100022110`; [mg0912 §6.2.1](../minigame/mg0912.md).
[미확정] 계수 계산의 원본 FMA 사용·비기본 중력에서 vy 대신 g축 속도를 쓰는 일반화는 확보된 요약에 없다. 기본 vy 식을 임의로 dot(v,−g)로 바꾸지 않는다. [mg0912 §6.2.1](../minigame/mg0912.md).
[판독] 부착된 계산기의 off/reset factor5는 점프 없는 낙하에도 사용한다. 기존 Start “factor0”는 유효 중력0의 요약이다. 후속 IsHold의 가속 생략 위치는 §6.1에 있다. main `@0x7100021ae0/@0x7100021af8`; [mg0912 §6.2.1](../minigame/mg0912.md).

### 6.5 Pad 회전·mask·override 우선순위

[판독] 스타일 회전표는 기존 [mg0122 §6.10](../minigame/mg0122.md)을 그대로 재사용한다. S=InputModule style, A=ActorPad+0x30, M=monitor style다. main `@0x710001e5cc/@0x710001eac4`.

| 조건 | face bit0,1,2,3의 출력 | dpad8,9,10,11 | stick16,17,18,19 | 축 |
|---|---|---|---|---|
| (S=3,A=1,M≠5) 또는 (S≠3,A=2,M=5) | [판독] 1,3,0,2 | 11,10,8,9 | 17,18,19,16 | (y,−x) |
| (S=3,A=1,M=5) 또는 (S≠3,A=2,M≠5) | [판독] 2,0,3,1 | 10,11,9,8 | 19,16,17,18 | (−y,x) |
| 그 밖 | [판독] 그대로 | 그대로 | 그대로 | (x,y) |

[판독] 보완한 우선순위는 아래와 같다. Hold/Stick getter는 상태를 지우지 않는다. 근거: main `@0x710001e54c/@0x710001eac4`, [pad C](../../../analysis/decomp/mgB_main_pad.c). 기존 설명은 [mg0122 §6.10](../minigame/mg0122.md).

```text
GetHold:
  if !enabled(+0x28): return 0
  if overlayEnabled(+0x29):
      return mask(+0x34) & overlayHold(+0x40) & overlayMask(+0x3c)
  return styleRemapAndNormalMasks(InputModule.GetHold(playerId))

GetStick:
  if !enabled: return ZERO
  if overlayEnabled:
      s = Vector4(+0x60)                 // 일반 style 회전 우회
  else:
      s = InputModule.GetStickLeft(playerId)
      s = styleRotate(s)                 // 위 표
  pX=F(s.x*s.x); pY=F(s.y*s.y); pZ=F(s.z*s.z); pW=F(s.w*s.w)
  length = F(sqrt(F(F(F(pZ+pX)+pW)+pY)))    // C의 ext/reduction 순서
  return length < threshold ? ZERO : s
```

[판독] override에도 원형 .1 문턱을 적용한다. 길이=.1은 통과한다. 반환값을 재정규화하거나 1로 clamp하지 않는다. main `@0x710001eac4`; [pad C](../../../analysis/decomp/mgB_main_pad.c), [mg0122 §6.10](../minigame/mg0122.md).
[미확정] sqrt·비정상 NaN에서 전체 getter의 비트 일치와 Trigger/Release override의 정확한 mask 순서는 확보된 C가 부족하다. Trigger 일반 경로의 같은 style remap은 기존 판독으로 확정이다. main `@0x710001e74c`; [mg0122 §6.10](../minigame/mg0122.md).
[판독] HID 아날로그 int/32767과 방향 bit 문턱.5는 actor의 radial.1보다 앞선 별도 단계다. main `@0x71007e4e70/@0x71007deb2c`; [mg0122 §6.10](../minigame/mg0122.md).
[판독] 후속 확인: GetPadActorDeg의 +0xc0 pointer는 SetPadStickOverride가 +0xa0에 보관한 std::function의 대상이다. virtual+0x30은 그 callback 호출이다. ComActor.GetMoveLever의 방향/회전 callback과 별도다. main `@0x710001e8b8/@0x710001f16c`; [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [gap C1](../../../analysis/decomp/actor_gap_c1.c), 기존 [plaza §3.5](../shell/plaza_3d.md).
[판독] SetLeverCamera `@0x7100015d28`는 ComActor+0x4b0/+0x4b8/+0x4c0에 camera weak handle을 저장한다. GetMoveLever `@0x7100013500`은 유효 camera의 +0x80..+0xb8을 Actor+0x4d0..+0x508 matrix cache에 복사한다. 그 뒤 Actor+0x470 방향 callback과 +0x4a0 회전 callback을 사용한다. [actor C](../../../analysis/decomp/mgB_main_actor.c), 기존 [plaza §3.5](../shell/plaza_3d.md).
[미확정] 공용 SetLeverMove(mode1)의 function vtable→실제 callback 연결과 LeverToVectorXZ의 손실된 SIMD cast 전체는 아직 완결되지 않았다. PadStickOverride callback을 camera 변환으로 대체하면 안 된다. main `@0x7100015534/@0x7100015d84`; 같은 C.

```text
GetPadActorDeg:
  if !enabled: return ZERO_LEVER
  if moveDpadEnabled && (GetHold() & 0xf00)!=0:
    index=((GetHold() & 0xf00)-0x100)>>8
    if index<10 && ((0x3bb>>index)&1):
      return lever(RoundDeg(dpadAngle[index]), depth=1, type=1)
    return ZERO_LEVER                     // 무효 Dpad 조합은 stick fallback 없음
  if moveAnalogEnabled:
    s=GetStick()                         // style·overlay·radial .1 완료
    if PadStickOverride: s=callback(s)    // callback 뒤 radial 문턱 재적용 없음
    depth=length4_f32(s)                  // 제곱합 z²+x²+w²+y²
    if depth>0:
      angle=RoundDeg(F(atan2f(s.x,-s.y)*57.29578))
      if subdivisionCount!=0:
        k=F(F(float(subdivisionCount)*.5)/180)
        angle=F(float(trunc(F(angle*k)))/k)
      return lever(angle,depth,type=2)
  return ZERO_LEVER
```

[판독] 위의 Dpad 우선순위·양자화·callback 위치는 main `@0x710001e8b8` C의 순서다. [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), 관련 입력 경계 [mg0122 §6.10](../minigame/mg0122.md).
[데이터] 허용된 Dpad 값은 mask100→−90°,200→90°,400→0°,500→−45°,600→45°,800→180°,900→−135°,a00→135°다. `@0x71015d3dbc` float 표와 C의0x3bb 선택을 함께 확인했다. [main.decomp.bin](../../../extracted/exefs/main.decomp.bin), selector main `@0x710001e8b8` [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c).
[미확정] PadLeverData 생성 helper `@0x710001dc68`의 필드별 저장·unit direction 계산, RoundDeg/atan2f 원본 수학의 비트 동등성은 추가 C가 필요하다.

### 6.6 CPU Hold·Trigger·Stick·Release의 수명

[판독] mg0912 UpdateValid는 입력 enabled와 PlayerType1을 검사한다. 켤 때 overlay를 켜고 target을−1로 둔다. 끌 때 off/reset한다. CPU 전략은 격 프레임, UpdatePadInput은 매 프레임이다. mg0912 `@0x710001b758`; [mg0912 §6.12.2](../minigame/mg0912.md).
[판독: 어셈블리] mg0912 입력 작성은 stick 평활 dt×4, 길이>1 정규화, Hold=A 요구, Trigger=hold&~prev, Release=prev&~hold다. mg0912 `@0x710001d090`; [mg0912 §6.12.5](../minigame/mg0912.md).

```text
// 기존 mg0912 CPU writer의 논리 순서
desiredStick = cameraInverseRotate(moveDirection)
stick = approach(stick, desiredStick, dt*4)
if length(stick)>1: normalize(stick)
hold = jumpRequested ? A : 0
trigger = hold & ~previousHold
release = previousHold & ~hold
writeOverlayStick(stick.x, -stick.z)
writeOverlayHold(hold); writeOverlayTrigger(trigger); writeOverlayRelease(release)
previousHold = hold
```

| 수명 항목 | 확정 범위 | 근거·남는 공백 |
|---|---|---|
| getter 소비 | [판독] GetHold/GetStick은 읽기만 한다. 여러 번 읽어도 clear하지 않는다. | main `@0x710001e54c/@0x710001eac4`; [pad C](../../../analysis/decomp/mgB_main_pad.c) |
| writer edge | [판독] mg0912는 매 프레임 previousHold로 edge를 다시 계산한다. | mg0912 `@0x710001d090`; [mg0912 §6.12.5](../minigame/mg0912.md) |
| 다른 CPU | [판독] mg0101 StepAI는 CalcDirection×3→길이1 제한→SetOverlayStick이다. mg0107은 jumpHold .2 s 전략을 사용한다. | mg0101 `@0x710000b840`, mg0107 `@0x71000050e4`; [mg0101 §6.9](../minigame/mg0101.md), [mg0107 §6.7](../minigame/mg0107.md) |
| setter 수명 | [판독] Enabled는+0x29, Hold는+0x40, Trigger는+0x44, Release는+0x48, Stick는+0x60에 저장만 한다. off도 packet을 지우지 않는다. | main `@0x710001e854/@0x710001e878/@0x710001e894/@0x710001e8b0/@0x710001ec50`; [gap C1](../../../analysis/decomp/actor_gap_c1.c), 기존 [mg0122 §6.10](../minigame/mg0122.md) |
| 전체 저장 수명 | [미확정] setter/getter 범위 밖의 reset writer나 Pad 수명 메시지는 아직 없다. 별도 코드가 없다면 마지막 값이 다음 쓰기까지 유지된다. 자동1프레임 clear 확정으로 확대하지 않는다. | 위 setter C, main GetTrigger `@0x710001e74c`/GetRelease `@0x710001e7d0` C 미확보; [main 함수 목록](../../../analysis/functions/main.nso.tsv) |
| 소비 프레임 | [미확정] 같은 Entity에서 AI writer와 Actor reader의 실제 컴포넌트 배열에 따라 현재/다음 프레임이 갈린다. | [mg0106 §3.2·11](../minigame/mg0106.md), main `@0x7100899450` |
| 웹 설계 | [설계] setter는 packet의 해당 필드만 갱신한다. enabled 전환으로 packet을 지우지 않는다. 게임의 매 프레임 edge writer와 런타임 clear 가설을 분리한다. | setter 근거는 위 [gap C1](../../../analysis/decomp/actor_gap_c1.c), 설계 §9.1 |

[판독] SetPlayerID/Enable/Style/PadMask는 각각+0x2c/+0x28/+0x30/+0x34에 저장만 한다. SetMoveKey는+0x2a/+0x2b에 저장한다. 다른 overlay 값을 초기화하는 코드는 없다. main `@0x710001e520/@0x710001e52c/@0x710001e53c/@0x710001e544/@0x710001ec6c`; [gap C1](../../../analysis/decomp/actor_gap_c1.c), 기존 [mg0122 §6.10](../minigame/mg0122.md).
[판독] SetActionTest는 std::function을 복사하여 action hash map(+0x70)에 등록한다. SetPadStickOverride는 callback을 +0xa0에 복사한다. callback 인자의 Pad const 참조와 Vector3f 입력/출력을 보존한다. main `@0x710001edbc/@0x710001f16c`; [gap C1](../../../analysis/decomp/actor_gap_c1.c).
[판독] Entity 수신 C는 상태+0x2c==3인 Entity에서 해당 message bit가 켜진 컴포넌트만 현재 배열 순서로 호출한다. callback 뒤 배열 시작/끝을 다시 읽는다. 따라서 활성 수신 목록·실제 배열이 없는 상황에서 CPU 소비 프레임을 확정할 수 없다. main `@0x7100899450`; [gap C1](../../../analysis/decomp/actor_gap_c1.c), 기존 [mg0106 §3.2·11](../minigame/mg0106.md).

### 6.7 접지 callback 상세 순서

[판독] 다음은 최신 [11 §4.2](11_moving_collision.md)의 완료 판독을 옮긴 것이다. 원본 callback `@0x7100006670`, IsGrounded `@0x710001178c`, Limit `@0x710002c96c`다.

```text
IsGrounded = !groundedTestEnabled || (groundedFlag && jumpStatus != 1)

if groundedCheckEnabled && actorActive(+0x44):
  groundedFlag = false
  d = max(dot(vVert*dt,gdir), .01)
  for each HitShape whose actor classification includes number1(mask=0x2):
    sweep from shapeWorldCenter - gdir*d
          direction=gdir, distance=d+.4, mask=mapCollisionLayerBit
    if no hit || validity!=0: continue
    if jumpStatus!=0 && hit.distance>d+.01: continue
    if hit.normal.worldY < .707: continue
    if hit.distance>d+.02:
        SetPosition(current + gdir*(hit.distance-d))
    groundedFlag=true
    emit ComActorGroundedEvent
  if !IsGrounded:
    Ray fallback at Actor.position with same validity/jump/normal checks
    snap threshold=d+.01
  if worldCollisionLimit reports grounded: groundedFlag=true
```

[판독] initialOverlap(+0x70) 자체를 검사하는 분기는 없다. validity와 거리 조건을 별도로 지킨다. main `@0x7100006670`; [11 §4.2](11_moving_collision.md).
[판독] 법선은 world Y≥.707이다. 중력 축 내적으로 일반화하지 않는다. main 같은 callback; [11 §4.2](11_moving_collision.md).
[판독] 지역 CollisionLimit가 없으면 worldY≤groundedLimit.y일 때 Y만 limit로 맞추고 강제 grounded다. 지역 제한 callback과 기본 Y 제한을 합산하지 않는다. main `@0x710002c96c`; [11 §4.2](11_moving_collision.md).
[판독] SetPosition은 MoveConstraint 적용→최종 callback→Entity.Translate/SetTranslation이다. 기본 callback `@0x7100014564`는 새 제공 C에서도 `return *param_2`다. 16 B 입력을 16 B로 그대로 반환한다. 위치 갱신 전체가 no-op이라는 뜻은 아니다. main SetPosition `@0x7100011d64`; [11 §4.2](11_moving_collision.md), [gap C2](../../../analysis/decomp/actor_gap_c2.c). 기존 어셈블리와 결론이 같다.

### 6.8 추가 속도와 가변 중력

[판독] CreateVelocitySlot은 Actor+0x1d8의 이름 해시 map을 사용한다. 같은 이름·replace=false면 기존 handle을 반환한다. replace=true면 generation 무효화 후 새 슬롯을 만든다. main `@0x7100014dc0/@0x710003a3a0`; [actor C](../../../analysis/decomp/mgB_main_actor.c), 기존 필드 [mg0912 §4.6](../minigame/mg0912.md).
[판독] Velocity.SetValue는 현재 Vector4를 복사한다. ResetValue는 +0x10의 기준값을 현재값에 복사한다. “무조건0” reset이 아니다. main `@0x7100039e6c/@0x7100039e60`; [actor C](../../../analysis/decomp/mgB_main_actor.c).
[판독] 슬롯 step은 map의 유효 handle을 먼저 snapshot한다. 무효 항목은 지운다. 각 슬롯+0x60 callback에 dt를 넘기고 반환 Vector4를 차례로 f32 합산한다. callback이 없으면 zero다. main `@0x710003a090`; [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c).
[판독] 합은 적분 서브스텝 뒤 위치에 한 번 직접 더한다. 이 소비 단계에서는 dt를 다시 곱하지 않는다. 이름이 Velocity여도 callback 반환은 “이번 프레임 위치 증분” 계약이다. main `@0x710000f230/@0x710003a090`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c), [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c).

```text
snapshot = valid slot handles in original map traversal order
sum = ZERO4
for slot in snapshot:
  if still valid:
    delta = slot.stepCallback ? slot.stepCallback(dt) : ZERO4
    sum.x=F(sum.x+delta.x); sum.y=F(sum.y+delta.y)
    sum.z=F(sum.z+delta.z); sum.w=F(sum.w+delta.w)
position = position + sum                // 각 성분 f32, 추가 dt 곱 없음
```

[판독] 후속 ctor `@0x7100039e80`는 슬롯+0x60의 std::function 대상 pointer를0으로 둔다. 따라서 callback을 별도로 설치하지 않은 슬롯은 `@0x710003a090`의 zero 반환 경로다. 자동 velocity×dt나 감쇠를 기본 step에 추가하지 않는다. [gap C1](../../../analysis/decomp/actor_gap_c1.c), [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c).
[판독] SetStepFunction `@0x7100039ed0`은 입력 std::function을 복사하고 슬롯+0x40 저장 영역으로 교체한다. +0x60은 그 대상 pointer다. 매 프레임 자기 해제/clear는 이 setter에 없다. [gap C1](../../../analysis/decomp/actor_gap_c1.c).
[미확정] Velocity.ResetValue/SetValue는 별도 Velocity 객체 API다. 이것을 VelocitySlot 전체 객체의 offset0에 쓰는 API로 혼합하지 않는다. slot 소유 node ctor `@0x710003a850`과 payload 접근자의 C는 미확보 상태다. [main 함수 목록](../../../analysis/functions/main.nso.tsv), 두 기존 함수 [actor C](../../../analysis/decomp/mgB_main_actor.c).
[판독] gravityScale setter는 Actor+0x150에 값을 쓴다. 음수도 게임이 사용한다. main `@0x7100013780`, mg0912 HoldJump `@0x710005e060`; [mg0912 §6.2.3](../minigame/mg0912.md).
[판독] gravity 조회는 유효 owner world가 있으면 그 world의 enabled gravity 항목을 순회한다. 항목이 없으면 기본 gravity 반환 경로다. main `@0x710000f0f8/@0x7100007be0`; [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [mg0912 §6.1](../minigame/mg0912.md).
[판독] 각 항목의 vector 누적은 `oldDirection×oldMagnitude + itemDirection×itemMagnitude` 순서다. 성분 제곱 합은 z²+x²+w²+y²의 C 순서를 사용한다. main `@0x7100007be0`; [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c).
[판독] 새 getter `@0x710002d214`는 항목+0x80의 provider가 있으면 virtual+0x30을 호출하고, 없으면 noreturn `@0x71000053a0`으로 간다. [gap C1](../../../analysis/decomp/actor_gap_c1.c).
[미확정] getter C는 void이며 provider의 Vector4/크기 반환 ABI가 없다. 기존 `@0x7100007be0` C는 길이==0일 때 reciprocal을 계산하고 비영일 때 zero를 쓰는 모순도 포함한다. 새 getter만으로 이 손실이 해소되지 않았다. “normalize(sum)”를 확정식으로 고치지 않는다. [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [gap C1](../../../analysis/decomp/actor_gap_c1.c).
[설계] 웹 설계: 임시 기본 중력만 제공하거나 명시적 미확정 gravity port를 주입한다. 가변 중력 volume을 정상화한 근사로 쓰는 선택은 원본 규칙 구현과 구분한다.


## 7. 애니메이션·이펙트·소리·카메라·에셋 연결

| 연결 | actor가 전달할 계약 | 상세 출처 |
|---|---|---|
| ComActorMotion | [판독] 액션은 모션 요청·완료 질의를 사용한다. MotionArg(0x50 B)와 ActorAnimationSlot(0x170 B)은 actor 이동 상태와 별도다. | main `@0x71000237f8/@0x71000238dc/@0x7100022420`; [09 §4.3·4.4·6.3](09_character.md) |
| 모션 완료 | [판독] Loop 자산값만으로 완료를 정하지 않는다. 완료 getter는 상태3을 검사한다. | main `@0x710002e39c/@0x7100024094/@0x71008135f4`; [mg0122 §7.1](../minigame/mg0122.md), [09 §4.5](09_character.md) |
| FTRG·발소리 | [판독] 슬롯 문맥·키 통과·발소리 ground 선택은 공용 입력/캐릭터 계약을 따른다. actor 코어에 복제하지 않는다. | main `@0x71005f3ccc/@0x7100813730`; [05 §7.5·7.7·7.8](05_ui_input.md), [09 §14](09_character.md), [mg0122 §7.3](../minigame/mg0122.md) |
| 현재 character API | [데이터] 웹 소스: `createCharacter`의 play/lookAt/setPosition/setRotation/setGround/step과 `CharacterCore`가 구현돼 있다. 원본 규칙이 기본이다. | [09 §14.1·14.2·14.7](09_character.md) |
| actor→character | [설계] 웹 설계: actor 결과 pose와 action의 motion request를 연결부가 character에 전달한다. 승인된 hit의 shape/body metadata를 장면 해석기로 ground 키로 바꾼 뒤 setGround에 전달한다. 물리 재질 계수를 직접 전달하지 않는다. 타입·조회·선택 계약은 §9.1이다. | 연결 근거 main `@0x710000ecd0`; [mg0912 §6.1](../minigame/mg0912.md), 웹 API [09 §14.2](09_character.md) |
| 결과 무대 | [판독] A 모션 Play 뒤 B를 main slot에 EnqueuePlay한다. 파이버의 시선 target·위치 작성 순서를 보존한다. | main `@0x71002ed480/@0x71002ee410/@0x71002e8c20`; [minigame_result §6.8](../shell/minigame_result.md) |
| 광장 | [판독] Sub의 co_look02/co_nod00와 LookAt 회전은 별도다. lookAt 진행의 이동 레버는0이고 목표 rotation만 제공된다. | menu00 `@0x710003f5d0`, main `@0x7100020698/@0x7100013500`; [plaza §3.5](../shell/plaza_3d.md) |
| 게임 FX/보이스 | [판독] Yoshi 대시/착지/피격과 mg0122 소품 FTRG는 게임의 요청·자산이다. 일반 action에 게임 key를 하드코딩하지 않는다. | mg0912 `@0x7100062180/@0x71000698d0`, mg0122 `@0x7100004a80`; [mg0912 §7.1~7.3](../minigame/mg0912.md), [mg0122 §7.3](../minigame/mg0122.md) |

[미확정] character의 face/보조 물리/FTRG 조건 그래프 미구현은 actor 판독 완료로 해소되지 않는다. actor condition과 FTRG 행 조건은 서로 다른 구조다. [09 §14.8](09_character.md), [05 §7.9](05_ui_input.md).

## 8. 다른 기능과의 상호작용

### 8.1 충돌 질의·침투 보정·AA

| 경로 | 모아야 할 입력·처리 | 근거 |
|---|---|---|
| Actor 분류 | [판독] ActorHitShape의 mask와 PhysX layer 번호를 분리한다. 번호 검사와 mask 검사 overload도 분리한다. | main `@0x710001c558/@0x710001c568`; [11 §4.1·4.2](11_moving_collision.md) |
| Map 후보 | [판독] overlap 최대16→각 world geometry penetration→depth>.01만 채택한다. contact+0x30=direction×depth다. | main `@0x7100028ee0`; [11 §4.1](11_moving_collision.md) |
| Map 보정 | [판독] adjust는 raw m을+0x40에 복사한다. finalizer는 adjusted 벡터의 평균을 SetPosition에 적용한다. | main `@0x710002a624/@0x710002aac0/@0x710001b320`; [11 §4.1·4.2](11_moving_collision.md) |
| 특수 후보 capsule | [판독] source 종류7의 넓힌 overlap capsule과 실제 SDK 침투 geometry를 구분한다. 후보 형상의 길이를 최종 capsule 크기로 쓰지 않는다. | main `@0x7100028ee0`; [11 §4.1](11_moving_collision.md) |
| Actor–Actor 필터 | [판독] 유효 owner/shape, 같은 Entity 허용 조건, 양쪽 Model+0x28 mask AND를 검사한다. Model이 없거나 override면 ActorCollision fallback이다. | main `@0x7100027f40/@0x7100028720/@0x710001b7d8/@0x710001b7e0`; [11 §4.1](11_moving_collision.md) |
| AA 응답 | [판독] 일반 쌍은 양쪽 응답이면 +m/2,−m/2, 한쪽이면 전체를 배분한다. capsule 쌍은 중심Y×10000 정수 비교와 grounded/jump 상태로 Y와 XZ 응답을 나눈다. | main `@0x710002a054`; [11 §4.1](11_moving_collision.md) |
| AA 마무리 | [판독] owner A/B에 맞는+0x40/+0x50 평균을 사용한다. dot(Δ,g)<0이면 Δ−g·dot(Δ,g)다. 투영 뒤0이면 quaternion/.01 우회 분기가 있다. | main `@0x710002a650`; [11 §4.1](11_moving_collision.md) |
| AA의 구현 한계 | [판독] 후속 표에 Y 조건·점프 context를 보완했다. [미확정] 수치 캐스트·단측 부호·출력 초기 Y는 C 타입 손실이 남는다. 수평 반반 push를 동등 구현으로 선언할 수 없다. | 같은 함수; 기존 [actorcoord C](../../../analysis/decomp/mgB_main_actorcoord.c), [11 §4.1](11_moving_collision.md) |
| 현재 collision 지원 | [데이터] 웹 소스: `CollisionWorld.mapContacts`와 `resolveMapContacts`는 P0 Map 질의/평균을 제공한다. Actor action/접지/AA 응답은 아직 소비자 책임이다. | [11 §9.5·9.8](11_moving_collision.md), [collision/index.ts](../../script/game/lib/collision/index.ts) |
| CastResult | [판독] position/normal/world, distance f32, validity0/4/2, initialOverlap=(distance≤0), owner generation을 보존한다. | main `@0x710062c3bc`; [11 §3.2·9.6](11_moving_collision.md) |

[판독] Map 평균은 모든 raw 벡터 단순 합산도, 검출 즉시 순차 push도 아니다. main `@0x710002aac0`; [11 §4.1](11_moving_collision.md).
[데이터] 웹 소스: collision의 원본 기본 규칙은 touch128/Map 후보16/depth.01/libc++ All sort다. `RULES_WEB`는 All 안정 정렬 차이가 있다. [11 §9.5](11_moving_collision.md), [collision/index.ts](../../script/game/lib/collision/index.ts).

[판독] 후속 AA capsule 분기는 아래처럼 좁혀졌다. A/B는 contact의 첫째/둘째 shape다. qY는 `trunc(f32(worldCenterY*10000))`다. 같은 qY이면 초기 XZ 분배 이후 Y/점프 보완이 없다. main `@0x710002a054`; [actorcoord C](../../../analysis/decomp/mgB_main_actorcoord.c), 기존 [11 §4.1](11_moving_collision.md).

| capsule 관계 | 추가 조건 | 호출·보정의 확보 범위 |
|---|---|---|
| A가 높음 | [판독] A와 B 모두 grounded | A output이 있으면 raw m.y를 A.y에 씀. 추가 점프 호출 없음 |
| A가 높음 | [판독] A grounded, B 공중 | A.y 보완 뒤 PushJump(A), Fall(B) |
| A가 높음 | [판독] A 공중, B grounded, A.vy≤0 | A.y 보완 뒤 ReflectionJump(A), Pressed(B,0) |
| A가 높음 | [판독] 둘 다 공중 | Y 분배 helper 호출. A.vy≤0이면 ReflectionJump(A). B.vy≥0이면 Fall(B), JumpStamp(B) |
| B가 높음 | [판독] 둘 다 grounded | B output이 있으면 raw m.y를 B.y에 쓰는 C다. 추가 점프 호출 없음 |
| B가 높음 | [판독] A 공중, B grounded | B.y 보완 뒤 PushJump(B), Fall(A) |
| B가 높음 | [판독] A grounded, B 공중, B.vy≤0 | B.y 보완 뒤 ReflectionJump(B), Pressed(A,0) |
| B가 높음 | [판독] 둘 다 공중 | Y helper 호출. B.vy≤0이면 ReflectionJump(B). A.vy≥0이면 Fall(A), JumpStamp(A) |

[판독] 위 표 전체의 주소는 main `@0x710002a054`이며 원문 요약은 [11 §4.1](11_moving_collision.md)이다. 표의 Pressed는 설명용 이름이며 원본은 `@0x71000150e0(actor,0)` 호출이다. [actor C](../../../analysis/decomp/mgB_main_actor.c).
[판독] Y helper `@0x710002a4c0`는 양쪽 output이 있으면 A.y=m.y*.5, B.y=m.y*−.5로 쓰고 XZ를 유지한다. 한쪽만 있으면 그 output.y에 m.y를 쓰는 C다. `param_2`는 확보된 C에서 사용하지 않는다. [runtime_A_collision_core.c](../../../analysis/decomp/runtime_A_collision_core.c), 기존 [11 §4.1](11_moving_collision.md).
[판독] `ComActor.Fall @0x7100014f54`는 scale1과 vertical.ResetValue다. Fall 액션으로 이름을 전환하는 API가 아니다. ReflectionJump `@0x7100014f64`는 Jump context enter1/arg1, PushJump `@0x7100014f9c`는 enter1/arg2다. JumpStamp `@0x7100014fd8`는 event9를 발행한다. [actor C](../../../analysis/decomp/mgB_main_actor.c), [actortick C](../../../analysis/decomp/mgB_main_actortick.c).
[판독] 기본 Jump는 arg0→+0x328, arg1→+0x32c, arg2→+0x330 초속을 쓴다. 반사/밀림의 수평 속도는 목표 rotation과 walkSpeed를 사용한다. main `@0x710002fed0`; [actor C](../../../analysis/decomp/mgB_main_actor.c), 기본 Jump 연결 [mg0912 §5.2](../minigame/mg0912.md).
[미확정] capsule 출력의 초기 Y 보존, B-only XZ의 `(float)*(undefined8*)` 수치 캐스트, 단측 Y 부호는 그대로 TS 식으로 복사할 수 없는 C 타입 손실 후보가 있다. `@0x710002a054/@0x710002a4c0`의 정상 타입·명령 확인이 필요하다. 완전 AA 동등성은 아직 판독 필요다.
[판독] finalizer의 투영 결과가0일 때는 gravity 주위 π/2에 해당하는 quaternion 경로로 비영 .01 보정을 만드는 긴 분기다. 단순 임의 x방향 .01을 추가하지 않는다. main `@0x710002a650`; [actorcoord C](../../../analysis/decomp/mgB_main_actorcoord.c), 기존 [11 §4.1](11_moving_collision.md).
[미확정] 이 quaternion 분기는 원본 sin/cos 계수와 SIMD 테이블 shuffle·역제곱근 근사를 필요로 한다. 식의 방향·ulp까지 보장하는 완성 helper는 기존 C 요약만으로 제공하지 못한다.

### 8.2 carry·AutoInterpolation·광장·항구

[판독] 공용 포즈 동기화·Map 평균·접지에서 접지 body의 이전/현재 변환 delta를 자동 carry하는 경로는 확인되지 않았다. “모든 엔진 carry 없음”으로 확대하지 않는다. main `@0x7100614ce0/@0x710002aac0/@0x7100006670`; [11 §4.3](11_moving_collision.md).
[판독] mg0106 y≤0에서는 δ=−ω·dt, x'=x cosδ−z sinδ, z'=z cosδ+x sinδ, y'=0으로 위치와 heading을 회전한다. y>0이면 적용하지 않는다. mg0106 `@0x710001c8c0`; [mg0106 §6.1](../minigame/mg0106.md).
[판독] mg0912 MoveRoad는 애니 본 위치로 충돌 Entity를 이동시키고 Δposition을 게임의 CheckHitPlayerLift에 넘긴다. 탑승 조건이면 pos+=Δ다. mg0912 `@0x7100029820`; [mg0912 §6.10.3](../minigame/mg0912.md).
[판독] AutoInterpolation 기본 speed6, 목표 방향은 중력 축 성분을 제거한 방향이다. 남은 거리≤speed×dt면 목표에 맞추고 끝낸다. main `@0x710001fed4/@0x71000208e8/@0x71000202c0`; [plaza §6.10](../shell/plaza_3d.md), [12 §3.4](12_online_sync.md).
[판독] 광장 로컬 2~4P는 바로 앞 슬롯을 따라간다. 5점 버퍼, 새 점 거리>.6, 시작 거리>2.6, 정지 거리<2, 가시성 ray1.3/시작Y+1/mask4가 기존 규칙이다. menu00 `@0x710003fec0/@0x7100041060`; [plaza §3.3·6.10](../shell/plaza_3d.md).
[판독: 어셈블리] 광장 SetGroundedAdjustFunc 인자는 빈 함수다. groundedLimit=(0,−2.5,0), actorType0xc7이다. menu00 `@0x7100042da8`; [plaza §3.5](../shell/plaza_3d.md).
[판독: 어셈블리] 항구 mgmet는 직접 입력을 끈다. 선택 좌우 입력만 ModeSelectCameraIdle에 들어간다. mgmet `@0x7100042650/@0x7100042810/@0x710004d9a8`; [mgmet §10.5](../shell/mgmet_3d.md).
[판독] 항구 MoveModePos의 전용 speed는 bool에 따라6/3.9에 배율을 곱한다. 공용 walk2와 다른 소켓 이동 설정이다. mgmet `@0x7100042cf0`; [mgmet §7·9.1](../shell/mgmet_3d.md).
[판독] 후속 주소 대조: 생성자 시작은 mgmet `@0x71000424d0`, 함수 길이는400 B다. `@0x7100042650`는 그 안의 `mov w1,wzr` 인자 작성 위치다. 따라서 두 기록은 같은 생성자의 시작/호출 인자 지점을 가리킨다. [mgmet 함수 목록](../../../analysis/functions/mgmet.nro.tsv), [mgmet_3d_map_player.c](../../../analysis/decomp/mgmet_3d_map_player.c), 기존 명령 기록 [mgmet_3d_dis.c](../../../analysis/decomp/mgmet_3d_dis.c), 원문 [mgmet §10.5](../shell/mgmet_3d.md).

### 8.3 입력·온라인·CPU 경계

[판독] 광장은 이동 계산 뒤 position/quaternion을 보낸다. 미니게임은 frame별 controller 입력 채널이다. 광장 .2 s를 미니게임 input 주기로 가져오지 않는다. menu00 `@0x710003fbd0/@0x710003fd64`; [12 §3.4](12_online_sync.md).
[판독] 광장 timer≤0과 속도 제곱합>.1이면 전송 뒤 timer=.2다. timer>0이면 감소만 한다. 정지 마지막 위치·제자리 회전 별도 전송은 해당 함수에 없다. menu00 `@0x710003fbd0`; [12 §3.4](12_online_sync.md).
[판독] 수신은 거리>5 teleport, ≤1 회전 전용, 그 사이 위치/회전 AutoInterpolation이다. 원격 CPU 이동 권한을 이 경로에서 만들지 않는다. menu00 `@0x71000421e0`; [12 §3.4](12_online_sync.md).
[판독] 광장 Player 생성은 PlayerType1 CPU를 제외한다. 따라가는 로컬 사람은 CPU 전략과 다르다. menu00 `@0x7100059700`; [plaza §6.10](../shell/plaza_3d.md), [12 §3.4](12_online_sync.md).
[판독] mg0101 NaviGrid/ComAI, mg0107 회피 전략, mg0912 potential/route는 각 NRO 소유다. 공용 actor에는 overlay packet 처리만 둔다. mg0101 `@0x7100004b50`, mg0107 `@0x7100004900`, mg0912 `@0x710001b758`; [mg0101 §6.9](../minigame/mg0101.md), [mg0107 §4.6·6.7](../minigame/mg0107.md), [mg0912 §4.7·6.12](../minigame/mg0912.md).

### 8.4 게임별 연결을 공용 코어에 넣지 않는 경계

| 게임·출처 절 | 보존할 actor 연결 | 주소 |
|---|---|---|
| [mg0912 §3.1·4.5·6.5](../minigame/mg0912.md) | [판독] PlayerManager/Player가 actor·Pad·AI를 소유한다. 탑승자는 별도 actor이고 액션/충돌을 지운다. | mg0912 `@0x710005ab00/@0x710006e9d0/@0x7100062180` |
| [mg0912 §6.6·6.7](../minigame/mg0912.md) | [판독] 바위/과일 판정은 게임 기하 계산이다. 넉백·push는 직접 위치 보정이며 외부 슬롯을 사용하지 않는다. 대시는 Run/Walk 속도 변경이다. | mg0912 `@0x71000646c0/@0x710006d280/@0x71000698d0` |
| [mg0912 §6.8·6.9·5.5](../minigame/mg0912.md) | [판독] FallArea/Goal/SavePoint ray와 Player 낙하·리스폰/골 상태는 게임 판정이다. TimeUp 함수는 Idle 호출만 하며 NRO 호출처가 없다. | mg0912 `@0x710006437c/@0x710006ccc4/@0x710006ca50` |
| [mg0912 §6.10](../minigame/mg0912.md) | [판독] Trampoline의42 초속, MoveRoad carry, 바위 몸체/게임 판정 capsule은 공용 접지와 구분한다. | mg0912 `@0x710006dbb0/@0x7100029820/@0x710004e1f0` |
| [mg0101 §3.1·3.5·4.4·5.1·6.5](../minigame/mg0101.md) | [판독] MainProc 파이버가 컴포넌트 tick보다 앞이다. Wall source box·WorldCollisionLimit clamp와 $Fall 감시가 게임 경로다. | mg0101 `@0x7100023860/@0x710001104c/@0x710000be20`, main `@0x710002c690/@0x710002d0c4` |
| [mg0107 §3.1·3.2·6.4·6.5·6.6](../minigame/mg0107.md) | [판독] 샌드위치는 보간 낙하→static 발판이다. 같은 칸·attack 접촉·발밑 더미와 .6 이내인 조건으로 깔림을 정한다. x±8/z±4 clamp도 게임이다. | mg0107 `@0x710000c3e0/@0x71000122d0/@0x7100017730/@0x710000bcf0` |
| [mg0106 §3.1·3.2·6.1·11](../minigame/mg0106.md) | [판독] UpdateParam→UpdatePlayer→UpdateCom이다. 회전 carry·Boo push·탈락은 게임이며 실제 actor 상대 배열은 미확정이다. | mg0106 `@0x710001c4a8/@0x710001c8c0` |
| [mg0118 §4.2·6.7·6.8](../minigame/mg0118.md) | [판독] 허들은 ExActionJumpHurdle과 독립 자동x전진6×dt를 사용한다. jumpInterval .75 s와 damage1 s는 Player timer다. HurdleHit callback으로 게임 경직을 준다. | mg0118 `@0x7100018844/@0x710001ae9c/@0x710000d060` |
| [mg0122 §3.4·6.1·6.10](../minigame/mg0122.md) | [판독] Pad는 카메라 회전·줌·셔터를 조작한다. CPU는 zoom/rot/shutter 값도 직접 만든다. 일반 이동 actor를 반드시 구동하는 게임이 아니다. | mg0122 `@0x7100056204/@0x7100056a0c/@0x710001b1c8` |
| [mg0911 §4.4·6.1](../minigame/mg0911.md) | [판독] Pad hold mask 0x58/0xa1이 flipper 제어다. CPU도 overlay를 쓴다. raw right-stick plunger 축은 미확정이다. | mg0911 `@0x7100063d7c`, main `@0x710001e54c` |
| [mg0508 §5.1·6.7·7·11](../minigame/mg0508.md) | [판독] 캐릭터 PadControl은 꺼지고, 점 Entity가 프레임당 입력×.02×PlayerWalkSpeed로 이동한다. 몸의 추종 식·시점은 미확정이다. | mg0508 `@0x7100009bb8/@0x710000da00` |

[미확정] mg0107의 “PhysX 캐릭터 컨트롤러” 표현은 공용 CCT 사용 확정과 다르다. 별도 CreateController 연결이 없으므로 일반 ActorHitShape/접지에 CCT를 임의로 추가하지 않는다. [mg0107 §6.6·9.5](../minigame/mg0107.md), [11 §4.3](11_moving_collision.md).

[판독] 후속 mg0508 확인: 몸 Entity는 ComMatter2와 ComAttachment를 만든다. target은 모델의 `pos_pc00` 계열 bone socket 조회 결과다. 점 Entity의 translation을 몸에 직접 복사하는 일반 actor 식으로 바꾸지 않는다. mg0508 `@0x710000bc50`; [mgC_mg0508_game.c](../../../analysis/decomp/mgC_mg0508_game.c), 기존 [mg0508 §5.1·9.6·11](../minigame/mg0508.md).
[판독] 공용 attachment 수신 `@0x710088848c`→갱신 `@0x7100887fc8`과 `SetTarget(ISocket) @0x7100887d84`의 소켓 소유자 의존 연결은 기존 완료 판독을 재사용한다. 위치/회전 모드1은 소켓 TRS와 로컬 오프셋을 적용한다. 스케일 모드0은 자식 스케일을 유지한다. [11 §2.1](11_moving_collision.md), [main 함수 목록](../../../analysis/functions/main.nso.tsv).
[미확정] mg0508 점 Entity→target의 상세 소비·인자와 실제 게임의 갱신 시점은 남는다. 공용 수신/평가 함수 시작 미식별과 구분한다. §11.3·R28/R29; mg0508 `@0x710000bc50`, [mg0508 §5.1·9.6·11](../minigame/mg0508.md), [mgC_mg0508_game.c](../../../analysis/decomp/mgC_mg0508_game.c).
[판독] 후속 mg0118 확인: HurdleHit 설정은 Params+0x138을 중심Y에 사용한다. callback은 HurdleHit hash를 검사하고 HurdleState.SetFallen과 map callback을 호출한다. mg0118 `@0x7100014a40/@0x710000d060`; [mg0118_game_only.c](../../../analysis/decomp/mg0118_game_only.c), 기존 [mg0118 §6.7·11](../minigame/mg0118.md).
[미확정] (.3,.1,.5) 벡터의 SetSourceBox half-size 해석과 quaternion·mask 전체 인자는 손상된 C 호출만으로 확정하지 않는다. 같은 함수·C; §11.3.

### 8.5 센서와 동명이인의 actor

[판독] ComActorSixAxisSensor는 이동 ComActor와 다른 컴포넌트다. main `@0x710003e4c4/@0x710003e3c8/@0x710003f020`; [mg0118 §6.2](../minigame/mg0118.md).
[판독] FrameCount를 비교하여 프레임당 한 번 갱신한다. 새 샘플 개수와 관계없이 converter에는 최신 샘플 하나를 전달한다. 같은 함수·출처.
[판독] converter 순서는 자세로 회전한 중력 제거→옵션 자세 회전→옵션 acceleration 부호 반전→링 저장이다. GetAcceleration/GetAngularVelocity/GetPosture는 최신 값이며 없으면0/단위 자세다. main `@0x710003f930/@0x710003f820/@0x710003f878/@0x710003f8d0`; [mg0118 §6.2](../minigame/mg0118.md).
[판독] WaveDetector의 value는 축 마스크를 적용한 벡터 길이 mag다. y만 선택하면 |y|다. 임계 미만 또는 peak와 dot<0이면 파형을 끝낸다. Value/Sum emitter는 파형당 최대 한 번이다. main `@0x7100040cc0/@0x71000413d0/@0x71000415ac/@0x71000415e4`; [mg0118 §6.2](../minigame/mg0118.md).
[판독] mg0118 허들은 Buffer200/RemoveGravity1/RotateInPosture1/InverseAcc1, accel Y 파형·임계1·Sum1이다. mg0119 흔들기는 같은 pipeline에 임계.25/Sum2.5를 쓴다. mg0118 `@0x710001acc4`, mg0119 `@0x710000b21c`; [mg0118 §6.2](../minigame/mg0118.md), [mg0119 §6.2](../minigame/mg0119.md).
[판독] mg1002 자세 변환은 calib×posture→X −π/2·상대자세·X +π/2→X/Z Euler→GyroRate.5→±17° clamp다. 공의 중력은 inverse(map rotation)×−UnitY이며 PhysX 맵 자체는 기울지 않는다. mg1002 `@0x710000a680/@0x71000136bc`; [mg1002 §6.1·6.2](../minigame/mg1002.md), 동일식 [mg0119 §6.1](../minigame/mg0119.md).
[판독] mg0119의 “성분값/절댓값 미확정”은 같은 공용 Wave/Sum 판독으로 해소된다. y mask2의 value=|y|, state1에서 sum=0, state1/2에서 sum+=value다. main `@0x7100040cc0/@0x71000415e4`; [mg0118 §6.2](../minigame/mg0118.md), 원래 공백 [mg0119 §6.2](../minigame/mg0119.md).
[판독] mg0119 공의 흔들기 jump는 rigidBody impulse다. Character JumpCalculator와 다르다. mg0119 `@0x710001bfe0/@0x710001c100`; [mg0119 §6.2](../minigame/mg0119.md).
[판독] mg1002/mg0119의 soundActor는 `bex::sound::ComActor`이며 이동 actor와 다른 namespace다. mg1002 `@0x7100003600/@0x7100003ad0`, mg0119 `@0x7100007e44/@0x7100008280`; [mg1002 §4.4·4.6](../minigame/mg1002.md), [mg0119 §4.5](../minigame/mg0119.md).
[판독] mg0911의 spinner/panel/lamp sensor는 기하 센서다. SixAxisSensor를 이 경로에 연결하지 않는다. mg0911 `@0x7100007b10`; [mg0911 §3.2·4.3·6.4·8·9.2](../minigame/mg0911.md).

### 8.6 공용 데이터·엔티티 배치

[판독] 원본 자산 경로는 아카이브와 별도인 전역 가상 경로다. ActorParam·캐릭터·모션 데이터 로딩은 연결부의 책임이다. main `@0x71002b9bc0`; [06 §1.3·2.6](06_scene_data.md).
[판독] LoadNbmap은 경로 마지막 이름→ClassicMap.CreateMap→Entity tree를 만든다. actor 코어에 BEA/nbmap parser를 넣지 않는다. main `@0x71000375d0/@0x71000374a0`; [06 §3.1](06_scene_data.md).
[미확정] nbmap 부모 pose·일부 collision 속성의 소비는 최신 collision의 남은 차이와 연결된다. ActorParam 배열 전체가 로딩됐다는 사실만으로 행 의미를 확정하지 않는다. [06 §9](06_scene_data.md), [11 §9.9](11_moving_collision.md).

## 9. 웹 포팅 구조 (설계)

### 9.1 계층과 코어 포트

[설계] 웹 설계: 다음 계약은 신규 설계다. 원본 함수 이름과 동일 구현이 완료됐다는 뜻이 아니다. 원본 책임 경계는 main `@0x710000ecd0/@0x7100011d64/@0x7100006670`; [mg0912 §6.1](../minigame/mg0912.md), [11 §4](11_moving_collision.md), 현재 표현 연결은 [09 §14](09_character.md).

| 위치 | import·책임 |
|---|---|
| `script/game/lib/actor` | [설계] 웹 설계: import0. 숫자 pose/velocity·ActorParams·ActorPad·JumpCalculator·action registry·조건/외부 변위 port·접지 policy를 보관한다. three/DOM/PhysX/게임 전략을 참조하지 않는다. |
| `script/game/lib/actor-collision` | [설계] 웹 설계: import는 ../actor와 ../collision만이다. actor의 query/contact 포트를 CollisionWorld로 구현한다. |
| 연결부·게임 | [설계] 웹 설계: ActorParam/게임 setter·Pad raw 변환·frame/sequence·CPU writer·carry·motion/event 소비·asset/weak-handle 수명을 조립한다. |
| character | [데이터] 웹 소스: 기존 import0 코어/three 어댑터/연결부를 사용한다. 이동 결과 pose를 외부에서 받는 계약이다. [09 §14](09_character.md) |
| collision backend | [데이터] 웹 소스: CollisionWorld→collision-physx→PhysX WASM 구현을 사용한다. actor가 physx를 직접 호출할 필요가 없다. [11 §9.1](11_moving_collision.md) |

[설계] 웹 설계: 아래는 연결부가 구현할 숫자·문자열 계약이다. 원본 메모리 레이아웃이나 이미 존재하는 웹 API 이름을 선언한 것이 아니다. 코어가 이 타입을 정의하고 어댑터가 구현한다. `Ref`의 index/generation은 각 registry 안에서만 의미가 있다. Entity·Actor·ActorShape handle을 서로 바꿔 쓰지 않는다. 원본 약한 handle 근거는 main `@0x710001316c/@0x710003a3a0`; [01 §4.11·9.7](01_core.md), §3.4·5.2.

```ts
type V3 = [number, number, number];
type V4 = [number, number, number, number];
type Q4 = [number, number, number, number];
type Ref = { index: number; generation: number };
type PadPacket = { hold: number; trigger: number; release: number; stick: V4 };
type ActorPhase = 'pre' | 'tick' | 'attack' | 'map' | 'limit'
  | 'actor-body' | 'actor-event' | 'ground' | 'publish';
type StepStamp = {
  frameId: number; phase: ActorPhase; pass: number;
  sequence: number; poseEpoch: number;
};
type ActorHit = {
  position: V3; normal: V3; distance: number; validity: number;
  initialOverlap: boolean; body: number; entity: Ref; shape: number;
  faceIndex: number; flags: number; tag: string | null;
};
type ActorSurface = {
  body: number; entity: Ref; shape: number; faceIndex: number; tag: string | null;
  physicsMaterial: V3 | null;              // 정적 마찰·동적 마찰·반발
  groundKey: string | null;               // character의 발소리 키
};
type ActorGround = {
  grounded: boolean; source: 'sweep' | 'ray' | 'limit' | 'none';
  normal: V3; hit: ActorHit | null; surface: ActorSurface | null;
};
type ActorGeometry =
  | { kind: 'capsule'; radius: number; halfHeight: number }
  | { kind: 'sphere'; radius: number }
  | { kind: 'box'; halfExtents: V3 };
type ActorShapeDesc = {
  owner: Ref; nameHash: bigint; classMask: number; enabled: boolean;
  geometry: ActorGeometry; center: V3; rotation: Q4;
  collisionBody: number; collisionShape: number;
};
type ActorShape = ActorShapeDesc & { ref: Ref; actor: Ref };
type ActorRegistration = {
  entity: Ref; position: V3; rotation: Q4; poseEpoch: number;
  modelMask: number | null; enabled: boolean;
  overrideCollision: boolean;
};
type ActorMapContact = {
  actor: Ref; actorShape: Ref; body: number; entity: Ref; shape: number;
  direction: V3; depth: number; raw: V3; adjusted: V3;
};
type ActorPairContact = {
  a: Ref; b: Ref; shapeA: Ref; shapeB: Ref; entityA: Ref; entityB: Ref;
  direction: V3; depth: number; raw: V3;
  respondA: boolean; respondB: boolean; adjustedA: V3; adjustedB: V3;
};
interface ActorRegistryPort {
  entityAlive(entity: Ref): boolean;
  actorInfo(actor: Ref): Readonly<ActorRegistration> | null;
  shapeInfo(shape: Ref): Readonly<ActorShape> | null;
  snapshotActors(out: Ref[]): number;
  snapshotShapes(actor: Ref, out: Ref[]): number;
  registerActor(desc: ActorRegistration): Ref;
  registerShape(actor: Ref, desc: ActorShapeDesc): Ref;
  updateActor(actor: Ref, desc: ActorRegistration): boolean;
  updateShape(shape: Ref, desc: ActorShapeDesc): boolean;
  unregisterShape(shape: Ref): boolean;
  unregisterActor(actor: Ref): boolean;
  actorAlive(actor: Ref): boolean;
  shapeAlive(shape: Ref): boolean;
}
type ActorPairFilter = (
  a: Readonly<ActorRegistration>, shapeA: Readonly<ActorShape>,
  b: Readonly<ActorRegistration>, shapeB: Readonly<ActorShape>
) => boolean;
type ActorCollisionConfig = {
  registry: ActorRegistryPort;
  resolveGroundKey(hit: ActorHit, physicsMaterial: V3 | null): string | null;
  selectGround(accepted: readonly ActorHit[], count: number): number;
  fallbackGroundKey: string | null;
  pairFallback: ActorPairFilter | null;
};
interface ActorCollisionPort {
  beginPhase(stamp: StepStamp): void;
  sweep(shape: ActorShape, start: V3, rotation: Q4, direction: V3,
        distance: number, mapMask: number, exclude: Ref, out: ActorHit): boolean;
  ray(origin: V3, direction: V3, distance: number,
      mapMask: number, exclude: Ref, out: ActorHit): boolean;
  resolveSurface(hit: ActorHit, out: ActorSurface): boolean;
  mapContacts(shape: ActorShape, mapMask: number, out: ActorMapContact[]): number;
  actorContacts(actor: Ref, out: ActorPairContact[]): number;
}
type ActorMotionArg = {
  name: string; hash: bigint; forceRestart: boolean; randomStartFrame: boolean;
  speedValid: boolean; startFrame: number; speed: number;
  blendTime: number; transitionType: 1 | 4;
};
type ActorMotionState = { present: boolean; hash: bigint | null; playback: 0 | 1 | 2 | 3 };
type ActorMotionCommand =
  | { kind: 'play' | 'enqueue'; slot: 'main'; arg: ActorMotionArg }
  | { kind: 'condition-speed'; slot: 'main'; value: number };
type ActorEvent = { actor: Ref; stamp: StepStamp } & (
  | { kind: 'ground-contact'; origin: 'original-call'; hit: ActorHit }
  | { kind: 'jump-stamp'; origin: 'original-call'; originalCode: 9 }
  | { kind: 'action-changed'; origin: 'design'; fromHash: bigint;
      toHash: bigint; enter: boolean; arg: number }
  | { kind: 'ground-state'; origin: 'design'; previous: boolean; ground: ActorGround }
  | { kind: 'actor-contact'; origin: 'design'; contact: ActorPairContact }
);
interface ActorPorts {
  registry: ActorRegistryPort;
  collision: ActorCollisionPort;
  gravity(outDirection: V4): number;
  finalPosition(request: V4, out: V4): void;
  motionState(): ActorMotionState;
  motion(command: ActorMotionCommand): void;
  event(event: ActorEvent): void;
}
```

[설계] 웹 설계: 포트의 bool false는 무효 handle/조회 실패다. query가 false이면 out을 접지 자료로 사용하지 않는다. 배열 out은 호출자가 소유하고 반환 count까지만 읽는다. 포트에 넘긴 벡터·contact·event는 호출 동안 빌리는 값이다. 뒤에 보관할 소비자는 복사한다. raw/adjusted는 서로 다른 저장 영역으로 둔다. 이 대여·복사 규칙은 원본 ABI가 아닌 웹 설계다.
[미확정] 위 `ActorGeometry`는 현재 기본 capsule·Attack sphere·게임 box 연결 범위다. 다른 원본 shape 종류, Vector3f의 16 B padding/w, model-less/custom collision fallback 전체가 지원됐다는 뜻은 아니다. §4.5·8.1·11.3; [11 §3.4·4.1](11_moving_collision.md).

**접지 결과와 재질 해석**

| 단계 | 계약·확정 수준 | 근거 |
|---|---|---|
| hit 보존 | [판독] 원본 CastResult의 body(+0x20)·entity(+0x38)·shape(+0x58)를 보존한다. shape는 hit face의 PxMaterial 소유 CollisionShape다. [데이터] 웹 소스: 현재 CastResult도 body/shape/faceIndex/flags/tag를 제공한다 | main `@0x710062c3bc`; [11 §9.5·9.6](11_moving_collision.md), [collision/index.ts](../../script/game/lib/collision/index.ts) |
| 유효 surface | [설계] 웹 설계: resolveSurface는 `world.bodyOf(hit.shape)==hit.body`, `shapeDesc(shape)!=null`, `bodyInfo(body)!=null`와 Entity generation 일치를 검사한다. 실패하면 surface=null이다. raw SDK shape id로 조회하지 않는다 | [데이터] 웹 소스: bodyOf/shapeDesc/bodyInfo는 [collision/index.ts](../../script/game/lib/collision/index.ts)의 기존 API다. 수명 규칙은 [11 §9.5](11_moving_collision.md) |
| 물리 재질 | [데이터] 웹 소스: shapeDesc.material은 [정적 마찰,동적 마찰,반발]이다. character ground 키가 아니다. [설계] 웹 설계: 생략된 descriptor 값은 metadata 조회에서 null로 표시한다. 실제 SDK 기본 재질 적용은 collision의 기존 책임이다 | [collision/index.ts](../../script/game/lib/collision/index.ts)의 CollisionShapeDesc. body/shape 연결은 main `@0x710062c3bc`; [11 §9.5·9.6](11_moving_collision.md) |
| ground 키 해석 | [설계] 웹 설계: 장면은 `(body,shape,faceIndex,tag)`→groundKey 해석기를 actor-collision 생성 시 주입한다. 장면의 asset/tag/shape 표를 소유한다. adapter는 숫자 조회와 해석기 호출만 한다. actor 코어는 string/null을 보관한다 | 기존 장면 주도 `ch.setGround('wood_light')`: [09 §14.2](09_character.md). 발소리 키 상세는 [05 §7.7](05_ui_input.md) |
| 접지 선택 | [판독] Sweep 승인→필요한 SetPosition→grounded 설정→접지 이벤트다. Ray fallback·world Y limit은 별도 경로다. [설계] 웹 설계: sweep/ray가 승인한 hit에만 resolveSurface한다. limit 접지는 hit/surface=null이다 | main `@0x7100006670/@0x710002c96c`; [11 §4.2](11_moving_collision.md), §6.7 |
| character 전달 | [설계] 웹 설계: 해당 논리 갱신의 선택된 groundKey를 character step 전에 `ch.setGround(key)`로 전달한다. 조회 실패/limit/공중이면 장면이 명시한 fallback 키만 사용한다. fallback도 없으면 setGround를 호출하지 않는다 | [데이터] 웹 소스: setGround·step과 FTRG 평가는 [09 §14.2](09_character.md)에 있다. 이 연결 순서는 웹 설계다 |

[판독] 원본 발소리 키는 엔티티 위치의 Sound Space 조회→재질 ID→`co_ground` 이름 갱신 경로로 확보됐다. main `@0x710010db68`; [05 §7.7](05_ui_input.md), [완료 C](../../../analysis/decomp/character_ftrg_c_footstep.c). 이 소비자는 Actor 접지 법선/IsGrounded와 별개다. 해당 재질 ID를 일반 충돌 재질 번호와 같다고 단정하지 않는다. [05 §7.7](05_ui_input.md).
[미확정] 현재 collision에는 ground 키를 반환하는 API가 없다. PxMaterial 계수나 tag를 그대로 발소리 키로 쓸 근거도 없다. 웹 collision hit→ground 키 해석은 §9.1의 설계/API 연결 확인이다. 여러 승인 hit의 원본 접지 선택과 Ray/limit 경로의 원본 event payload는 별도 미확정이다. 장면은 선택 정책과 fallback을 명시한다. main `@0x7100006670`; §11.3·R20/R21, [11 §4.2·9.5·9.6](11_moving_collision.md), [09 §14.2](09_character.md).

**registry·접촉의 소유권과 수명**

| 항목 | 계약·확정 수준 | 근거 |
|---|---|---|
| 원본 경계 | [판독] AA는 ActorHitShape registry와 Model mask/owner 검사 경로다. Physics query layer mask와 별도다. [미확정] 전체 world 등록·해제 연결은 아직 부족하다 | main `@0x7100027f40/@0x7100028720/@0x710001b7d8/@0x710001b7e0`; [11 §4.1·4.3](11_moving_collision.md), §3.4·11.3 |
| 소유자 | [설계] 웹 설계: 장면은 CollisionWorld·actor registry·ground 해석표를 소유한다. ActorCore는 pose/입력 snapshot/action/condition/slot과 ground snapshot을 소유한다. Entity generation의 실제 소유자는 장면이며 entityAlive를 제공한다. actor-collision binding은 registry actor/shape Ref와 물리 body/shape 대응을 소유한다 | 책임 구분 근거 [01 §9.7](01_core.md), [11 §9.5](11_moving_collision.md), [09 §14.1](09_character.md). 실제 웹 수명은 이 설계다 |
| 등록 | [설계] 웹 설계: Entity Ref 유효성·초기 pose·HitShape 설정 후 registerActor→registerShape다. registry는 descriptor와 벡터를 복사한다. actor의 world position/rotation과 poseEpoch, shape의 local center/rotation을 따로 보관한다. 반환 Ref는 해당 actor-collision binding이 보관한다. 몸체를 직접 만든 binding은 owned body 목록도 보관한다 | 형상·캐릭터 설정 경계 [11 §3.4·9.5](11_moving_collision.md), [01 §9.7](01_core.md). 원본 job phase 대응은 §11.3 미확정이다 |
| 업데이트·비활성 | [설계] 웹 설계: 명시한 pose epoch에서 updateActor/updateShape를 호출한다. enabled=false인 actor/shape는 새 접촉 후보에서 제외한다. disable은 등록 해제와 다르다. enable 뒤에는 새 접촉을 구한다 | 웹 수명 연결 [11 §9.5](11_moving_collision.md), 원본 포즈 경계 §3.2. registry에서의 처리 방식은 설계다 |
| Map contact | [설계] 웹 설계: 현재 MapContact의 shape/body/entity/direction/depth/vector를 ActorMapContact에 복사한다. raw=vector, adjusted=raw 복사 후 custom adjust에 넘긴다. finalizer에는 depth>.01인 adjusted 평균을 준다 | main `@0x7100028ee0/@0x710002a624/@0x710002aac0`; [11 §4.1·9.5](11_moving_collision.md), [collision/index.ts](../../script/game/lib/collision/index.ts) |
| Actor pair | [설계] 웹 설계: actorContacts는 snapshotActors/snapshotShapes의 Ref를 actorInfo/shapeInfo로 재검증하고 적격 쌍을 조회한다. 각 contact에 A/B actor·shape·Entity Ref, raw m과 응답 여부를 보존한다. adjustedA/B는 §8.1의 별도 actor policy가 쓴다. 같은 쌍을 양쪽 finalizer가 소비해도 narrow phase는 같은 결과를 쓴다 | main `@0x710002a054/@0x710002a650`; [11 §4.1](11_moving_collision.md), §8.1. 쌍 cache·중복 처리 방식은 설계다 |
| 재진입·무효화 | [설계] 웹 설계: callback 뒤 actor/shape/Entity generation을 재검사한다. unregisterShape는 해당 shape Ref를 무효화한다. unregisterActor는 자식 shape Ref도 무효화하고 접촉 cache/대기 통지를 지운다. snapshot에 남은 폐기 Ref는 소비하지 않는다 | 원본 weak-handle 확인 방식 main `@0x710001316c/@0x710003a3a0`; [01 §4.11](01_core.md), §5.2·6.8. registry 전체에 적용하는 것은 설계다 |
| 해제 | [설계] 웹 설계: binding을 disabled로 표시→registry actor/shape 제거→접촉/ground snapshot 제거→owned body만 removeBody→자기 event/motion 구독 해제다. 빌린 body/CollisionWorld·공용 character 자산은 장면 소유자가 해제한다 | removeBody의 세대 무효화 [11 §9.5](11_moving_collision.md). 원본 actor 본체 파괴는 main `@0x710000dd30`, §3.4; [01 §9.7](01_core.md) |

[미확정] registry의 웹 해제 순서는 원본 ActorWorld unregister 순서를 확정한 것이 아니다. ActorBody/Event pass의 custom collision filter·응답 선택과 이벤트 원본 payload도 추가 근거가 필요하다. modelMask가 없거나 override가 켜졌다고 무조건 접촉을 허용하지 않는다. 필요한 fallback은 장면이 명시적으로 주입하며 원본 대응을 기록한다. main `@0x7100027f40/@0x7100028720`; [11 §4.1·4.3](11_moving_collision.md), §8.1·11.3.

**motion·event의 전달 시점**

| 채널 | 타입·시점·제한 | 근거 |
|---|---|---|
| motion 요청 | [설계] 웹 설계: ActorMotionArg는 name/hash와 force/random/speed/start/blend/type를 보존한다. play/enqueue는 액션 콜백의 호출 시점에 motion 포트로 전달한다. condition-speed는 슬롯 기본 속도와 분리한다 | [판독] 필드·speed×conditionSpeed는 main `@0x71000237f8/@0x71000238dc/@0x7100022420`; [09 §4.3·4.4](09_character.md). 액션의 동기 호출은 main `@0x710000eb1c/@0x7100018df0`, §5.2 |
| motion 조회 | [설계] 웹 설계: motionPlaying은 현재 주 슬롯 hash/state를 확인한다. motionFinished는 종료 상태3을 읽는다. 조회를 animation loop 자산값으로 대신하지 않는다 | main `@0x710002e39c/@0x7100024094/@0x71008135f4`; [09 §4.5](09_character.md), [mg0122 §7.1](../minigame/mg0122.md), §7 |
| adapter 변환 | [설계] 웹 설계: name/hash는 장면의 모션 등록표로 해석한다. 주 슬롯 play/queue·pose/ground는 기존 character 연결부로 전달한다. 공개 ch.play의 force/start/speed/blend/type/next와 원본 MotionArg의 유효 플래그를 구분한다 | [데이터] 웹 API: [09 §14.1·14.2](09_character.md). 모션 상세·기본값은 [09 §4.3](09_character.md) |
| ground-contact | [판독] 접지 callback의 Sweep 성공 지점에서 grounded 설정 다음 ComActorGroundedEvent를 전달한다. [설계] 웹 설계: 같은 지점에서 해당 hit 복사와 StepStamp를 통지한다. 최초 접지 edge로 합치지 않는다 | main `@0x7100006670`; [11 §4.2](11_moving_collision.md), §6.7. 위 hit/StepStamp는 웹 관찰 필드다 |
| jump-stamp | [판독] JumpStamp API는 event9를 발행한다. [설계] 웹 설계: API 호출 지점의 stamp로 originalCode9를 전달한다. ActorBody에서 발생한 호출을 Event pass 뒤로 미루지 않는다 | main `@0x7100014fd8`; §8.1·[11 §4.1·4.3](11_moving_collision.md) |
| 설계 통지 | [설계] 웹 설계: action-changed는 성공한 hash 변경 뒤에 낸다. ground-state는 해당 ground job 완료 뒤에 낸다. actor-contact는 명시한 contact 소비 pass에서 낸다. origin=design으로 원본 event와 구분한다 | 원본 동기 변경 경계 main `@0x7100012044/@0x710000eb1c`, §5.2. 접지·충돌 작업 경계 [11 §4.2·4.3](11_moving_collision.md) |
| 소비 순서 | [설계] 웹 설계: 논리 event 포트는 호출 순서의 sequence를 보존한다. 콜백 재진입 뒤 handle을 재검사한다. 표현 연결부는 필요한 정보를 복사하고, 선택된 pose/ground를 적용한 뒤 character를 step한다. 발소리/FTRG 사건은 character 채널에서 나온다 | 기존 갱신 경계 main `@0x710000ecd0`, §3.3; [09 §14.1·14.2](09_character.md), [05 §7.5·7.7](05_ui_input.md) |

[설계] 웹 설계: actor-collision은 CollisionWorld와 ActorCollisionConfig를 주입받는다. beginPhase는 다음 query/contact가 읽을 stamp를 설정한다. actorInfo/shapeInfo의 반환값은 빌린 조회이며 외부에서 수정하지 않는다. world pose는 actor record와 shape local pose를 합성한다. 같은 Entity 허용·model-less/override의 custom 필터는 pairFallback이 담당한다. pairFallback=null인 미확정 경로는 완전 지원 범위에 포함하지 않는다. 기존 원본 필터 근거는 main `@0x7100027f40/@0x7100028720`; [11 §4.1](11_moving_collision.md), query pose 계약은 [11 §9.5](11_moving_collision.md).
[설계] 웹 설계: selectGround는 승인 hit 배열의 index를 반환한다. −1은 선택 없음이며 반환 범위를 검사한다. 각 원본 ground-contact 통지는 그대로 유지하고 최종 ground snapshot 선택만 이 정책으로 한다. resolveGroundKey가 null을 반환하면 명시한 fallbackGroundKey만 사용한다. 이 두 정책은 기본값을 발명한 원본 규칙이 아니다. 장면별 근거가 없는 경우 §13의 원본 일치 준비도에 포함하지 않는다. 기존 접지/character 연결 근거는 main `@0x7100006670`; [11 §4.2](11_moving_collision.md), [09 §14.2](09_character.md).

[설계] 웹 설계: StepStamp.phase/pass는 호출자가 지정한다. DefaultCollision의 두 Map/Limit pass는 pass 번호로 구별한다. poseEpoch는 query가 읽은 물리 pose와 현재 actor pose를 비교하는 기록이다. sequence는 그 actor의 한 frame 안에서 통지 순서를 보존한다. 이름만으로 Entity/Physics의 전역 phase를 결정하지 않는다. 원본 내부 작업은 main `@0x7100006ef8`; [11 §4.3](11_moving_collision.md), 전역 공백 §3.2·11.3.
[미확정] 위 original-call은 이미 확인한 “발행 지점”만 대응한다. ActorEvent의 hit/stamp는 원본 event struct 필드가 아니다. 전역 event dispatcher의 실제 수신 순서·ActorWorld.Event의 전체 payload와 Ray/limit event는 아직 부족하다. 공개 ch.play로 speedValid=false/슬롯 conditionSpeed·다른 슬롯 전체가 손실 없이 표현되는지 역시 기존 API 문서만으로 확정하지 않는다. 지원되지 않는 플래그를 버리거나 public API에 없는 메서드를 구현됐다고 적지 않는다. [11 §4.2·4.3](11_moving_collision.md), [09 §4.3·4.4·14.2](09_character.md), §11.3.

[설계] 웹 설계: public API는 `create/setup`, `setInput`, `setOverlay`, `register/eraseAction`, `callAction`, `preFrame`, `tick`, `collisionJobs`, `teleport`, `dispose`로 나눈다. pre/tick/jobs의 배치는 호출자가 명시한다.
[설계] 웹 설계: condition/velocity slot은 이름 hash와 generation으로 소유한다. snapshot을 유지하되 map 순서가 원본과 다르면 호환 차이로 기록한다. 최소 상태는 frameId/dt/substeps/pose/oldPose/targetRotation/vLever/vVert/gdir/gmag/scale/jumpStatus/ground flags/fallAccumulator/actionHash/actionTime/context/Pad packet/slot generations다.
[미확정] 원본 해제의 남은 연결과 전체 phase는 §11.3에 있다. 위 registry/표현 수명은 구현 가능한 웹 계약으로 구분한다.

### 9.2 actor-collision의 현재 API 대응

[데이터] 웹 소스: 아래 실제 함수명·인자는 [collision/index.ts](../../script/game/lib/collision/index.ts)에서 확인했다. API 상태의 근거는 [11 §9.5](11_moving_collision.md)다.

| actor port | 현재 collision API | 어댑터 계약 |
|---|---|---|
| Sweep | `world.castShape(arg,out)` | [설계] 웹 설계: arg={shape:{geometry,local},position,rotation,direction,distance,mask,exclude}다. local center를 start에 다시 더하지 않도록 source/local/world 단계를 나눈다. mtd/bothSides는 원본 query arg에서 확인한 설정만 사용한다. |
| Ray | `world.castRay(arg,out)` | [설계] 웹 설계: origin/direction/distance/mask/exclude를 전달한다. direction은 unit이며 래퍼가 정규화한다고 가정하지 않는다. |
| Map 접촉 | `world.mapContacts(geometry,pose,mask,exclude,out,candidate?)` | [설계] 웹 설계: source7 특수 후보를 candidate로 따로 전달한다. 조정 callback이 바꾼 adjusted vector를 유지한다. |
| Map 평균 | `resolveMapContacts(contacts,out)` | [설계] 웹 설계: depth>.01과 adjusted 평균 규칙을 사용한다. 그 결과를 Actor.SetPosition/finalPosition으로 보낸다. |
| Actor–Actor | `world.penetration(geometry,pose,shape,out)` + actor registry | [설계] 웹 설계: registry가 Actor classMask/modelMask/owner/event를 별도 보관하고 적격 쌍만 검사한다. 분배·jump 반응·projection은 §8.1의 actor policy다. [미확정] Y 분기는 §8.1에 있다. 단측 타입/부호의 완전 응답은 판독 보류다. |
| source capsule | `capsuleFromSegment(a,b,r)` | [설계] 웹 설계: geometry+local pose를 한 번 생성한다. SDK quarter-turn은 collision이 한다. |
| 형상 수명 | `createBody/addShape/stage/unstage/setShapeEnabled/syncPose/teleport/removeBody` | [설계] 웹 설계: query body와 actor handle을 연결한다. Actor classMask를 Physics layer로 복사하지 않는다. |
| 결과 | `CastResult` | [설계] 웹 설계: position/normal/body/entity/shape/distance/validity/initialOverlap/faceIndex/flags/tag를 ActorHit에 옮긴다. body/shape는 SDK id가 아닌 CollisionWorld handle이다. surface 해석은 §9.1이다. |

[판독] 캡슐은 engineY축과 SDKX축을 구분한다. .apx capsuleX에는 quarter-turn을 더하지 않는다. main `@0x71006045f0`; [11 §3.3·9.5·9.6](11_moving_collision.md).
[데이터] 웹 소스: P1 CCT/P2 Dynamic은 WASM ABI 노출만 있으며 웹 actor 연결이 완성된 것은 아니다. [11 §9.8](11_moving_collision.md).
[설계] 웹 설계: 정지 actor도 Map/AA contact 수집을 수행한다. movement==0이면 collision을 건너뛰는 현재 PlazaMover 조건은 이전하지 않는다. 현재 코드 근거는 §9.4다.

### 9.3 원본 이름 ↔ 웹 이름

[설계] 웹 설계: 이름은 권장명이다. 연결할 원본 책임은 각 행에 붙였다.

| 원본 | 웹 권장 이름 | 근거 |
|---|---|---|
| ComActor | [설계] ActorCore/ActorState | main `@0x710000ecd0`; [mg0912 §6.1](../minigame/mg0912.md) |
| ComActorPad / PadLeverData | [설계] ActorPad / MoveLever | main `@0x710001e54c/@0x710001eac4/@0x710001e8b8`; [mg0122 §6.10](../minigame/mg0122.md) |
| ComActorJumpCalculator | [설계] JumpCalculator | main `@0x71000219d0`; [mg0912 §6.2](../minigame/mg0912.md) |
| ActionContext / action registry | [설계] ActionContext / ActionRegistry | main `@0x710000eb1c/@0x7100018df0`; [mg0912 §4.6·5.2](../minigame/mg0912.md) |
| ActorCondition map | [설계] ConditionSet | main `@0x710001316c`; [actor C](../../../analysis/decomp/mgB_main_actor.c) |
| VelocitySlot | [설계] FrameDisplacementSlots | main `@0x710003a090`; [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c) |
| ActorWorld/CollisionCoordinator | [설계] ActorCollisionJobs/ActorContactRegistry | main `@0x7100006ef8/@0x7100028ee0`; [11 §4](11_moving_collision.md) |
| ComActorAutoInterpolation | [설계] AutoMove/AutoTurn | main `@0x71000208e8/@0x7100020698`; [plaza §3.5·6.10](../shell/plaza_3d.md) |
| ActorParam singleton | [설계] ActorParams/fromActorParamRows | main `@0x71002b9bc0/@0x71002b2e00`; [09 §4.8](09_character.md) |
| ComActorMotion | [설계] 기존 CharacterCore/MotionSlot adapter | main `@0x71000237f8`; [09 §4.3·14](09_character.md) |


### 9.4 PlazaMover 차이와 이전 절차

[데이터] 웹 소스: 비교 대상은 현재 [player.ts](../../script/app/scene/world/plaza/player.ts)의 `ACTOR/leverFromStick/PlazaMover`다. 이전 감사표의 “collision 공용 미구현”은 현재 상태를 나타내지 않는다. [common audit §2](common_system_audit.md), 최신 [11 §9](11_moving_collision.md).

| 항목 | 현재 PlazaMover | 원본·이전 요구 |
|---|---|---|
| 속도 | [데이터] 웹 소스: walk2/run6 | [판독] 공용 설정과 일치. mg0912 setter는 별도. main `@0x71002b2e00`; [plaza §3.5](../shell/plaza_3d.md) |
| 선회 | [데이터] 웹 소스: ground360/1100, air180/720, 85° | [판독] 공용 값과 일치. quaternion/수학 함수 비트 동등성은 미확정. main `@0x710000f690`; [plaza §3.5](../shell/plaza_3d.md) |
| 순서 | [데이터] 웹 소스: action→rotate→integrate→groundCheck | [판독] actor tick은 action→integrate→rotate이며 ground job은 별도. main `@0x710000ecd0`; [mg0912 §6.1](../minigame/mg0912.md) |
| 입력 문턱 | [데이터] 웹 소스: leverFromStick은 >0이며 길이를1로 clamp | [판독] ActorPad는 radial.1, 통과값을 재정규화/clamp하지 않는다. main `@0x710001eac4`; [mg0122 §6.10](../minigame/mg0122.md) |
| 상태·점프 | [데이터] 웹 소스: Idle/Walk/Run/Fall만. off factor5 낙하 | [판독] 등록 가능한 일반 액션·JumpCalculator Start/hold 구간·게임 ExAction이 더 있다. main `@0x71000219d0`; [mg0912 §4.11·6.2](../minigame/mg0912.md) |
| 적분 | [데이터] 웹 소스: 매 tick1/60. 수평·수직이 일반 JS number | [판독] dt로 n을 반올림하고 f32 적분한다. main `@0x710000f230`; [mg0912 §6.1](../minigame/mg0912.md) |
| 충돌 | [데이터] 웹 소스: 수평 move≠0에서만 collide. groundHeight를 쓰고 STEP_UP=.5 | [판독] 정지 접촉·Map 평균·capsule sweep·validity·mask/exclude를 보존한다. STEP_UP=.5는 근사다. main `@0x710002aac0/@0x7100006670`; [11 §4·6.1](11_moving_collision.md) |
| 접지 | [데이터] 웹 소스: Collider 없으면 grounded=true. 지면 높이로 snap | [판독] 형상 mask 번호1, world normal.y≥.707, ray fallback, Y limit를 사용한다. main `@0x7100006670/@0x710002c96c`; [11 §4.2](11_moving_collision.md) |
| 외부 제어 | [데이터] 웹 소스: 직접 lookAt과 단순 inputEnabled | [판독] AutoInterpolation·조건·외부 슬롯·Pad style/overlay가 별도다. main `@0x7100020698/@0x710001316c/@0x710003a090`; [plaza §3.5](../shell/plaza_3d.md), §5.2·6.8 |
| 표현 | [데이터] 웹 소스: THREE.Vector3 상태와 Preview3D에 묶임 | [설계] 웹 설계: ActorCore 숫자 상태→기존 character adapter/모델. [09 §14](09_character.md) |

[설계] 웹 설계: 이전은 다음 순서다. 이 문서 작업에서 실제 코드는 이전하지 않는다.

1. [설계] 웹 설계: ActorParams의 ctor/common/game 세 단계를 만들고 광장 common값을 넣는다.
2. [설계] 웹 설계: raw NPAD→bex 변환과 ActorPad의 style/mask/threshold를 연결한다.
3. [설계] 웹 설계: 기존 PlazaMover pose/velocity/action의 초기값을 ActorState로 옮긴다.
4. [설계] 웹 설계: tick의 integrate→rotate를 분리하고 pre/tick/ground Map jobs 순서를 호출자가 조립한다.
5. [설계] 웹 설계: CollisionWorld에 광장 Main/First 몸체와 actor query 형상을 등록한다.
6. [설계] 웹 설계: 물리 pose 동기화 장벽을 명시하고 정지 contact·접지 callback을 연결한다.
7. [설계] 웹 설계: follow/원격 AutoInterpolation과 게임 carry의 중복 적용을 방지한다.
8. [설계] 웹 설계: 최종 pose·motion/event를 기존 character에 전달한다.
9. [설계] 웹 설계: §10 숫자와 query trace를 확인한다. 미확정 필드/순서는 trace에서 따로 기록한다.

## 10. 검증 코드·기대값

[미확정] 아래는 원본 실행 결과가 아니다. 기존 문서의 재구현 계산·웹 시험 기록을 모았다. 원본 함수 전체 동등성이 검증됐다는 뜻도 아니다.

| 입력·가정 | 기대값 | 종류·근거 |
|---|---|---|
| 평지 dt1/60, jump23. factor를 갱신 전vy로 계산, velocity→position | 정점2.087 m/14f, 착지35f | [추정] 기존 재구현 계산: main `@0x7100022110`; [mg0912 §6.2.2·10](../minigame/mg0912.md). 기존 계산 예의 Start 프레임/hold 포함 여부는 미확정. 서브스텝 갱신 위치는 후속 C로 확인 |
| 같은 가정, jump42 | 정점6.392 m/22f, 착지57f | [추정] 기존 재구현 계산: 같은 출처. Start/hold 프레임 가정과 트램펄린42 실제 소비를 구분 |
| 같은 가정, ctor jump13.5 | 정점.904 m/11f, 착지26f | [추정] 기존 재구현 계산: 같은 출처 |
| 땅 이동·대시 | 7.8/15 m/s, 대시1 s. 공중 max6 | [판독] [데이터] mg0912 `@0x71000698d0/@0x710006c0f0`, main `@0x710000f230`; [mg0912 §10](../minigame/mg0912.md) |
| 넉백 dir=(1,0,0), k.7, dt1/60 vs .05 | 13f/6.68 m vs 5f/8.38 m | [추정] 기존 재구현 계산: mg0912 `@0x7100062180/@0x710006d280`; [mg0912 §6.6](../minigame/mg0912.md). 게임 위치 보정식의 이차항에는 dt가 없음 |
| push .3 | 9f/1.04 m | [추정] 기존 재구현 계산: 같은 출처 |
| 광장 lookAt 180° | 18f라는 기존 선회 예 | [추정] 원문 계산 예: main `@0x7100020698/@0x710000f690`; [plaza §3.5](../shell/plaza_3d.md). 원문의 18f가 85° 경계를 포함해 어떻게 계산됐는지는 미확정 |
| 센서 ω.y=2sin(2π·1.5t) | swim wave4,24,44…f, 반주기마다1회 | [추정] 기존 재구현 계산: main `@0x7100040cc0/@0x71000413d0`; [mg0118 §10.3](../minigame/mg0118.md) |
| 허들 기본 배치 | x=−.35,5.65,11.65,17.65,23.65. 6m/s면1s 간격 | [추정] 기존 재구현 계산: mg0118 `@0x7100008110`; [mg0118 §6.8·10.3](../minigame/mg0118.md) |
| tilt 단위/X+20°/X+40° | X목표0/10°/17° clamp. 단위 중력(0,−1,0) | [추정] 기존 재구현 계산: mg1002 `@0x710000a680`; [mg1002 §6.1·10](../minigame/mg1002.md), 코드 동일성 [mg0119 §10](../minigame/mg0119.md) |
| .5 G의 같은 부호 흔들기5f | Sum2.5 도달 예 | [추정] 원문 근사 예: mg0119 `@0x710000b21c`; [mg0119 §6.2](../minigame/mg0119.md). Wave/Sum 공용 mag 판독과 게임 샘플 timing 분리 |
| capsule source a=(0,.5,0),b=(0,1,0),r=.5 | 중심Y.75/h.25/외형높이1.5 | [추정] 기존 재구현 계산: main `@0x710001c6cc`; [11 §3.4](11_moving_collision.md) |
| collision fake/wasm backend | Map2접촉 평균·initial overlap MTD −.2 등. 전체78/78 기록 | [데이터] 웹 시험 기록 인용: [11 §9.7](11_moving_collision.md). actor runtime가 시험된 것은 아님 |

[설계] 웹 검증 설계: 수치 fixture 코드는 문서 안에서만 정의한다. Pad 길이 .1 미만/같음/초과, depth .8 미만/같음, enabled0/override1, Hold 반복 읽기, 상반된 중력·worldY 법선, movement0 contact를 경계 벡터로 추가한다. 근거 main `@0x710001e54c/@0x710001eac4/@0x7100006670`; [mg0122 §6.10](../minigame/mg0122.md), [11 §4.2](11_moving_collision.md).
[설계] 웹 검증 설계: trace는 frame/phase/poseEpoch/action/enter/Pad raw/overlay/effective/velocity/factor/접촉 순서/normal/validity/snap/finalPose를 기록한다. 원본이 없는 현재에는 fixture의 가정도 함께 남긴다.
[미확정] 기존 광장180°→18f는 fast/normal 경계85°를 통과하는 전체 실측 기대값으로 쓰지 않는다. 원문에는 계산 코드·전환 trace가 없다. [plaza §3.5](../shell/plaza_3d.md).

## 11. 미확정 사항과 추가 분석에 필요한 근거

### 11.1 출처 충돌·정정·설정 차이 보존

[설계] 판단 규칙: 동일 대상의 근거 강도는 판독>데이터>추정이다. 동일 강도면 최근 날짜와 실제 소비 함수 연결을 우선한다. 다른 객체·설정 단계는 충돌로 합치지 않는다.

| 항목 | 기존 근거·날짜 | 다른/후속 근거·날짜 | 처리 |
|---|---|---|---|
| air turn | [판독] ctor360/1100, mg0912 2026-10-02 §4.6 | [판독] [데이터] ComMatter180/720, plaza2026-10-08 §3.5,09 2026-10-09 §4.8 | 설정 단계 차이. 둘 다 §4.1·4.2. main `@0x710000d2c0/@0x71002b2e00`. [mg0912 §4.6](../minigame/mg0912.md), [plaza §3.5](../shell/plaza_3d.md), [09 §4.8](09_character.md) |
| ground turn·run | [판독] ctor360/1100·run6,mg0912 2026-10-02 | [판독] mg0912 setter ground360/360·run7.8/15,같은 날짜 | 게임 setter 차이. 공용값을 덮지 않음. mg0912 `@0x71000594e0/@0x71000698d0`; [mg0912 §4.6](../minigame/mg0912.md), [plaza §3.5](../shell/plaza_3d.md) |
| 접지 법선 | [미확정] n.y vs dot(n,−g), mg0912 2026-10-02 §6.4/11.1 | [판독] world normal.y≥.707,11 2026-10-09 §4.2 | 최신 callback 판독 우선. 원문 .70710 표기도 남김. main `@0x7100006670`; [mg0912](../minigame/mg0912.md), [11](11_moving_collision.md) |
| 초기 중첩 | [판독] 기존 요약: !initialOverlap, mg0912 2026-10-02 §6.4 | [판독] 직접 flag 분기 없음/validity 검사,11 2026-10-09 §4.2 | 최신 원본 callback 정정 사용. main 같은 주소. 출처는 같은 callback을 다룬다. main `@0x7100006670`; [mg0912 §6.4](../minigame/mg0912.md), [11 §4.2](11_moving_collision.md) |
| groundedLimit | [미확정] 쓰임,mg0912 2026-10-02 §11.1 | [판독] worldY 제한,11 2026-10-09 §4.2 | 최신 `@0x710002c96c` 근거 우선. mg0912 −15→−100과 광장−2.5는 게임 설정 차이. [mg0912 §11.1·6.5](../minigame/mg0912.md), [11 §4.2](11_moving_collision.md), [plaza §3.5](../shell/plaza_3d.md) |
| finalizer | [미확정] `@0x710001454c`,mg0912 2026-10-02 §11.1 | [판독: 어셈블리] 기본 `@0x7100014564` identity,11 2026-10-09 §4.2. [판독] 제공 C2 2026-10-10도 16 B 복사를 확인 | 명령·C가 일치한다. 기본 콜백 identity로 해소했다. SetPosition 전체를 no-op으로 해석하지 않는다. [mg0912 §11.1](../minigame/mg0912.md), [11 §4.2](11_moving_collision.md), [gap C2](../../../analysis/decomp/actor_gap_c2.c) |
| module 순서 | [미확정] Scene/Actor/Physics 상대,01·mg0912 2026-10-02 | [판독] Scene→Fiber→Entity/물리 간선,mg0122·mg0101 2026-10-09 | 확정 모듈 간선만 해소. actor jobs/게임 배열은 유지. main `@0x7100984a58/@0x7100899450`; [01](01_core.md), [mg0122 §3.5](../minigame/mg0122.md), [mg0101 §3.6](../minigame/mg0101.md) |
| CallAction 즉시성 | [미확정] 지연이면42→23,mg0912 2026-10-02 §6.10.2 | [판독] bool overload가 callback을 동기 호출,이번 C 2026-10-10 | API의 일반 지연설 해소. NRO 실제 bool/overload는 유지. main `@0x710000eb1c/@0x7100018df0`; [actor C](../../../analysis/decomp/mgB_main_actor.c). [mg0912 §6.10.2](../minigame/mg0912.md) |
| fall 누적 | [판독] 기존 요약: 위치delta의 양수로만 설명,mg0912 2026-10-02 §6.1 | [판독] 먼저 dot(g,vVert)>0 검사,이번 C 2026-10-10 | §3.3에 양쪽을 명시. main `@0x710000ecd0`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c). [mg0912 §6.1](../minigame/mg0912.md) |
| ActorParam 행 타입 | [데이터] 기존 요약: [int,0,0,0],06 2026-10-02 §2.6 | [데이터] 소수·다성분26~28행,2026-10-10 JSON 확인. [판독] 같은 날 로더 f32 확인 | 실제 배열을 §4.2에 보존. 필드 의미는 별도 판독 필요. main loader `@0x71002b9bc0`. [06 §2.6](06_scene_data.md), [actorparam.json](../../../extracted/bea/bq.nx.bea/common/data/actorparam.json) |
| 공용 물리 상태 | [데이터] 웹 감사: 공용 query 미구현,common audit 2026-10-09 01:58 | [데이터] 웹 소스: P0 구현,11 §9 현행 | 최신 API를 §9.2 기준으로 사용. 옛 감사 결론을 현재 상태로 복사하지 않음. [common audit §2](common_system_audit.md), [11 §9](11_moving_collision.md), [collision/index.ts](../../script/game/lib/collision/index.ts) |
| 항구 직접 입력·속도 | [추정] 항구 자유 이동이라는 이전 논의; 날짜 미표기 | [판독: 어셈블리] 입력off,mgmet2026-10-08 §10.5. 전용walk3.9 | 광장과 구분. [데이터] 함수 시작/길이와 기존 명령 위치로 같은 생성자 내부임을 §8.2에서 해소했다. 후속 확인 2026-10-10. 공용walk2와 소켓walk3.9를 합치지 않음. mgmet `@0x71000424d0/@0x7100042650/@0x7100042810`; [mgmet §9.1·10.5](../shell/mgmet_3d.md), [plaza §3.5](../shell/plaza_3d.md) |
| mg0107 CCT | [판독] [미확정] PhysX 캐릭터 컨트롤러,2026-10-02 §6.6 | [판독] 일반 Actor/CCT 구분,11 2026-10-09 §4.3 | CCT 사용은 아직 해당 게임 미확정. main `@0x71002b2e00`; [mg0107](../minigame/mg0107.md), [11](11_moving_collision.md) |
| mg0119 Sum 값 | [미확정] 성분/절댓값,mg0119 2026-10-02 §6.2 | [판독] Wave mag=길이,mg0118 2026-10-02 §6.2 | 같은 공용 판독으로 y mask2의 value=abs(y), sum 누적을 해소했다. 수신 순서는 미확정이다. 후속 정리 2026-10-10. main `@0x7100040cc0/@0x71000415e4`; [mg0119 §6.2](../minigame/mg0119.md), [mg0118 §6.2](../minigame/mg0118.md) |
| All sort/축 | [미확정] older11 §3.2·7, common audit §2; 개별 판독일 미표기 | [판독] touch128/정렬·SDK축,11 2026-10-09 §9.6 | 최신 완료 계약 사용. main `@0x7100625110/@0x7100625480/@0x71006045f0`; [11](11_moving_collision.md). [common audit §2](common_system_audit.md) |
| 광장 180° 선회 예 | [추정] 18f, plaza 2026-10-08 §3.5 | [판독] 같은 2026-10-08 원문은 85° 경계의 ground360/1100 전환도 명시 | 계산 trace가 없어 18f를 전체 golden으로 확정하지 않는다. 양쪽을 §6.3·10에 보존한다. main `@0x710000f690/@0x7100020698`; [plaza §3.5](../shell/plaza_3d.md) |

[판독] Start 유효 중력0의 요약과 factor 저장값을 분리한다. mg0912 2026-10-02 §6.2.1은 “factor0”로 설명했다. 후속 C 2026-10-10은 IsHold로 가속을 생략한다. 원문을 제거하지 않고 계산기 반환값에 대한 일반화를 좁혔다. main `@0x7100021af8/@0x710000f230`; [mg0912 §6.2.1](../minigame/mg0912.md), [actortick C](../../../analysis/decomp/mgB_main_actortick.c).
[판독] 공용 Jump mask0x89와 Yoshi Jump mask0x81은 서로 다른 액션이다. 공용 C 보완일은 2026-10-10이며 기존 mg0912 판독일은 2026-10-02다. 어느 한 값을 공용 기본값으로 덮지 않는다. main `@0x710002fed0`, mg0912 `@0x710005dba4`; [actor C](../../../analysis/decomp/mgB_main_actor.c), [mg0912 §4.11·5.2](../minigame/mg0912.md).

### 11.2 후속 확인으로 해소한 공백

[데이터] 후속 확인일은 2026-10-10이다. 제공 C1의 21개 함수와 C2의 1개 함수를 읽었다. 완료된 Ray/Shape All과 Entity 수신 판독은 재사용했다. 추가 주소·파일 대응은 부록 C에 있다.

| 이전 공백 | 현재 확보한 범위 | 본문·근거 |
|---|---|---|
| Pad setter·CPU 저장 | [판독] enabled·Hold·Trigger·Release·Stick 저장 오프셋을 확인했다. setter 자체에는 자동 clear가 없다. 다른 writer의 프레임 초기화는 별도다 | §4.3·6.6, main `@0x710001e854/@0x710001e878/@0x710001e894/@0x710001e8b0/@0x710001ec50`; [gap C1](../../../analysis/decomp/actor_gap_c1.c), [mg0122 §6.10](../minigame/mg0122.md) |
| condition 갱신 수명 | [판독] 유효 snapshot→가상 step(dt)→반환1이면 generation 무효화·destroy다. 클래스별 효과는 별도다 | §5.2, main `@0x7100009dc0`; [actorground C](../../../analysis/decomp/mgB_main_actorground.c), [mg0912 §4.6](../minigame/mg0912.md) |
| 외부 변위 slot 기본 | [판독] ctor callback 없음→기본 step ZERO4다. SetStepFunction은 콜백을 복사한다. 반환 변위는 직접 합산한다 | §6.8, main `@0x7100039e80/@0x7100039ed0/@0x710003a090`; [gap C1](../../../analysis/decomp/actor_gap_c1.c), [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [mg0912 §4.6](../minigame/mg0912.md) |
| JumpCalc 호출 위치 | [판독] 수직 서브스텝에서 Update→IsHold→가속→위치다. 같은 Start 프레임의 가속 생략을 확인했다 | §6.1·6.4, main `@0x710000f230/@0x7100021af8`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c), [mg0912 §6.2.2](../minigame/mg0912.md) |
| ActorParam 타입·단위 | [판독] 4×f32 로딩과 행22/23/25/30/31 첫 성분 /60을 확인했다. 나머지 행→소비 필드는 미확정이다 | §4.2, main `@0x71002b9bc0/@0x71002b2e00`; [gap C1](../../../analysis/decomp/actor_gap_c1.c), [runtime reuse C](../../../analysis/decomp/runtime_A_collision_reuse.c), [06 §2.6](06_scene_data.md) |
| PadLever 우선순위 | [판독] Dpad 우선·아날로그 override 후 길이/각·양자화와 유효 Dpad 각 표를 확보했다. Actor lever camera는 별도다 | §6.5, main `@0x710001e8b8/@0x7100013500/@0x7100015d28/@0x7100015d84`; [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [actor C](../../../analysis/decomp/mgB_main_actor.c), [mg0122 §6.10](../minigame/mg0122.md) |
| AA capsule 세로 분기 | [판독] 높이·접지·vy 조건과 Jump arg1/2, Fall/Pressed/JumpStamp 호출을 보완했다. 손상된 벡터 타입은 미확정이다 | §8.1, main `@0x710002a054/@0x710002a4c0/@0x7100014f54/@0x7100014f64/@0x7100014f9c/@0x7100014fd8/@0x71000150e0`; [actorcoord C](../../../analysis/decomp/mgB_main_actorcoord.c), [actor C](../../../analysis/decomp/mgB_main_actor.c), [11 §4.1](11_moving_collision.md) |
| 기본 final-position callback | [판독] 제공 C2의 16 B 복사가 기존 identity 명령 판독과 일치한다 | §6.7·11.1, main `@0x7100014564`; [gap C2](../../../analysis/decomp/actor_gap_c2.c), [11 §4.2](11_moving_collision.md) |
| actor 해제 본체 | [판독] tag→callbacks→slot/condition map→action registry→자체 weak-node 해제를 확보했다 | §3.4, main `@0x710000dd30`; [actortick C](../../../analysis/decomp/mgB_main_actortick.c), [01 §9.7](01_core.md) |
| 항구 생성자 주소·센서 Sum | [판독] [데이터] mgmet 두 주소는 같은 생성자 내부다. mg0119 y mask의 Sum 입력은 abs(y)다 | §8.2·8.5·11.1, mgmet `@0x71000424d0/@0x7100042650`, main `@0x7100040cc0/@0x71000415e4`; [mgmet §10.5](../shell/mgmet_3d.md), [mg0118 §6.2](../minigame/mg0118.md), [mg0119 §6.2](../minigame/mg0119.md) |

### 11.3 남은 미확정의 분류와 필요한 자료

[미확정] 아래는 후속 확인 후에도 남은 공백 전체다. “추가 디컴파일 필요”는 현 파일에 해당 main 함수 본체가 없거나 반환·벡터 타입이 손상됐다는 뜻이다. 같은 숫자의 NRO 함수가 INDEX에 있어도 main 근거로 사용하지 않는다. [INDEX](../../../analysis/decomp/INDEX.tsv), [main 함수 목록](../../../analysis/functions/main.nso.tsv).

| 항목 | 분류 | 부족한 근거·필요 판독 | 영향·현재 경계 |
|---|---|---|---|
| 전체 condition 효과·기간·공격 액션 | [미확정] 추가 디컴파일 필요 | factory `@0x7100007d20`은 world+0x130의 `@0x710000abc0`로 위임한다. abc0과 Damage/Pressed/HipDropPressed 클래스 ctor·가상 step38/Init48 본체가 필요하다. [gap C1](../../../analysis/decomp/actor_gap_c1.c), [actor C](../../../analysis/decomp/mgB_main_actor.c) | scheduler·handle 수명은 확보했다. 클래스의 이동 제한·기간·해제 효과는 미확정이다. §5.2·8.1; [mg0912 §4.6·11.1](../minigame/mg0912.md) |
| 입력 suspend gate | [미확정] 추가 디컴파일 필요 | main `@0x710000e35c` 12 B 본체가 없다. +0x634 입력 비트와 관계를 대조해야 한다. [main 목록](../../../analysis/functions/main.nso.tsv), [ground3 C](../../../analysis/decomp/mgB_main_actorground3.c) | wrapper 조건은 §3.3에 있다. 의미를 무조건 inputEnabled로 이름 붙이지 않는다. [mg0912 §6.1](../minigame/mg0912.md) |
| Actor job 전역 phase | [미확정] 추가 디컴파일 필요 | main `@0x7100004df0`(104 B)·`@0x7100004e58`(80 B)·`@0x7100004ea8`(60 B)의 정상 함수경계와 `SetActorJob @0x710000650c`(176 B), Entity message/job caller가 필요하다. main 목록에 `@0x7100004ef0` 함수 시작은 없다. [main 목록](../../../analysis/functions/main.nso.tsv), [actorground C](../../../analysis/decomp/mgB_main_actorground.c) | pre wrapper는 확보했다. 모듈 간선과 DefaultCollision 내부 순서만으로 pre/tick/ground의 전체 위치를 정하지 않는다. §3.2~3.4; [11 §4.3·7](11_moving_collision.md) |
| Trigger/Release·CPU 자동 clear | [미확정] 추가 디컴파일 필요 | main `GetTrigger @0x710001e74c`·`GetRelease @0x710001e7d0` 각132 B, Pad ctor/ReceiveMessage/reset와 +0x29/40/44/48/60 writer 교차참조가 필요하다. [main 목록](../../../analysis/functions/main.nso.tsv), [gap C1](../../../analysis/decomp/actor_gap_c1.c) | setter만으로 프레임 수명을 증명할 수 없다. Hold/Stick getter 무소비와 게임 writer의 매 프레임0 작성은 별개다. §6.6; [mg0122 §6.10](../minigame/mg0122.md) |
| PadLever 결과·camera 수학 | [미확정] 추가 디컴파일 필요 | `@0x710001dc68`(188 B)의 PadLeverData 출력 배치와 std::function vtable `0x71019cb548/0x71019cb590` virtual30 본체가 필요하다. `LeverToVectorXZ @0x7100015d84`의 float/NEON 타입 복구도 필요하다. [main 목록](../../../analysis/functions/main.nso.tsv), [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [actor C](../../../analysis/decomp/mgB_main_actor.c) | Dpad/analog 우선순위·각·양자화는 §6.5에 있다. PadStickOverride와 Actor lever camera를 분리한다. [plaza §3.5](../shell/plaza_3d.md), [mg0122 §6.10](../minigame/mg0122.md) |
| 가변 중력 반환·정상화 | [미확정] 추가 디컴파일 필요 | `@0x7100007be0`의 길이 분기와 `@0x710002d214`→provider virtual30 반환 ABI의 정상 타입이 필요하다. getter C에는 반환 벡터가 소실됐다. [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [gap C1](../../../analysis/decomp/actor_gap_c1.c) | 단순 반대 조건이나 임의 normalize로 고치지 않는다. 기본 gdir/gmag/scale은 §6.8; [mg0912 §6.1](../minigame/mg0912.md) |
| ActorParam 행9..31 대응 | [미확정] 추가 디컴파일 필요 | getter `@0x71002b9db8/@0x71002b9dc0/@0x71002b9dc8/@0x71002b9dd0/@0x71002b9dd8/@0x71002b9de0/@0x71002b9de8/@0x71002b9df0/@0x71002b9df8/@0x71002b9e00/@0x71002b9e08` 각8 B의 반환 오프셋·나머지 소비 호출이 필요하다. [main 목록](../../../analysis/functions/main.nso.tsv), [runtime reuse C](../../../analysis/decomp/runtime_A_collision_reuse.c) | +328/32c/330/334/324 필드는 확보했다. 행10=16·ctor13.5·행12=18을 공용 jump 최종값 하나로 선택하지 않는다. §4.2; [06 §2.6](06_scene_data.md), [mg0118 §11](../minigame/mg0118.md) |
| AA 타입·단측 부호·0 fallback | [미확정] 추가 디컴파일 필요 | `@0x710002a054/@0x710002a4c0/@0x710002a650`의 벡터 정상 타입·output 초기화 caller·SIMD table 참조가 필요하다. storage bitcast와 수치 cast를 구분해야 한다. [actorcoord C](../../../analysis/decomp/mgB_main_actorcoord.c), [runtime core C](../../../analysis/decomp/runtime_A_collision_core.c) | §8.1 분기는 확보했다. B-only Y 부호나 0 fallback 방향을 임의 선택하지 않는다. [11 §4.1](11_moving_collision.md) |
| Trampoline overload/context | [미확정] 추가 디컴파일 필요 | mg0912 `@0x710006dbb0`의 CallAction 인자·context ABI를 복원해야 한다. 공용 bool overload의 동기 호출만 확인됐다. [mg0912 §6.10.2·11.1](../minigame/mg0912.md), [actor C](../../../analysis/decomp/mgB_main_actor.c) | Update 위치는 해소했다. 42→23 복원과 일반 Jump arg0/1/2를 손상된 게임 프로토타입에 임의 대입하지 않는다. §5.2·6.1 |
| mg0106 형상·mg0107 CCT | [미확정] 추가 디컴파일 필요 | mg0106 `@0x710001b9c0`의 ColRadius→HitShape consumer, mg0107 `@0x710000c3e0`의 component 설치→controller 생성 연결이 필요하다. [mg0106 §4.2·11](../minigame/mg0106.md), [mg0107 §6.6·9.5](../minigame/mg0107.md) | .8 데이터와 “엔진 위임” 표현을 capsule radius/CCT 생성 확정으로 바꾸지 않는다. §4.5·8.4 |
| mg0508 몸/점 추종 | [미확정] 게임 소비·실제 갱신 시점 확인 필요 | [판독] ctor `@0x710000bc50`의 ComAttachment·bone socket target과 공용 main 수신 `@0x710088848c`→갱신 `@0x7100887fc8`, `SetTarget(ISocket) @0x7100887d84`는 기존 완료 판독을 재사용한다. [미확정] 나머지 SetTarget overload와 mg0508 점 Entity→target 소비·인자·실제 갱신 시점은 남는다. [mgC_mg0508_game.c](../../../analysis/decomp/mgC_mg0508_game.c), [11 §2.1](11_moving_collision.md), [main 목록](../../../analysis/functions/main.nso.tsv) | 몸 translation을 점에 즉시 복사하는 식은 미확정이다. §8.4·R28/R29; [mg0508 §5.1·9.6·11](../minigame/mg0508.md) |
| mg0118 HurdleHit 형상 | [미확정] 추가 디컴파일 필요 | mg0118 `@0x7100014a40`의 SetSourceBox ABI·quaternion·mask 인자가 손상됐다. callback `@0x710000d060`, Params+0x138 중심Y·(.3,.1,.5) 후보 벡터는 확보했다. [mg0118_game_only.c](../../../analysis/decomp/mg0118_game_only.c) | half-size 해석·전체 mask/자세는 확정하지 않는다. §8.4; [mg0118 §6.7·11](../minigame/mg0118.md) |
| world/자식 해제 수명 | [미확정] 추가 디컴파일 필요 | ActorWorld 등록 제거 caller와 `@0x7100039fd0/@0x7100009d00` 자식 cleanup, Pad destructor/reset C가 필요하다. [actortick C](../../../analysis/decomp/mgB_main_actortick.c), [INDEX](../../../analysis/decomp/INDEX.tsv) | 본체 해제는 §3.4에 있다. world handle·콜백 소유자·Pad packet 수명을 동일하다고 추정하지 않는다. [01 §9.7](01_core.md) |
| 미확정 필드 초기값·Velocity/slot payload | [미확정] 추가 디컴파일 필요 | Velocity ctor `@0x7100039e3c`, slot node ctor `@0x710003a850`와 payload 접근자 C가 없다. Pad ctor `@0x710001e0b4`의 overlayMask/edge/stick·MoveKey·양자화 기본값도 필요하다. [main 목록](../../../analysis/functions/main.nso.tsv), [actor C](../../../analysis/decomp/mgB_main_actor.c), [mg0122 §6.10](../minigame/mg0122.md) | ctor가 Velocity에 ConstantZero를 넘기는 호출은 보인다. 전체 Velocity/slot 배치와 Vector3f 16 B의 w 성분 계약을 추정하지 않는다. §4.1·4.3·6.8 |
| 액션 초기 등록표·bit6 callback 소비 | [미확정] 추가 디컴파일 필요 | ctor/기본 action 설치→registry와 `ChangeActionGroundLever @0x7100012370` proxy→등록 callback의 정상 C가 필요하다. 기존 label `LAB_7100012454`를 함수 시작으로 취급하지 않는다. [main 목록](../../../analysis/functions/main.nso.tsv), [mg0912 §4.11](../minigame/mg0912.md) | 규칙 함수 `@0x710003134c`의 모션/반환 순서는 §5.1에서 보완했다. 전체 액션 enum·bit6 의미는 아직 확정하지 않는다 |
| 형상 scale·nbmap 부모 pose/속성 | [미확정] 추가 디컴파일 필요; 데이터 소비 확인 | 본 부착·비균등/음수 scale, 부모 pose와 남은 collision 속성의 loader→Entity/HitShape 소비를 연결해야 한다. main `@0x710001c6cc/@0x71000146a4/@0x71001d665c`; [11 §3.4·7·9.9](11_moving_collision.md), [06 §9](06_scene_data.md) | 확정된 비본 capsule과 PCIndividualScale 규칙은 §4.5다. 미확정 scale을 전 형상에 곱하지 않는다. §8.6 |
| mg0911 right-stick plunger 축 | [미확정] 추가 디컴파일 필요 | mg0911 Player 입력 소비 `@0x7100063d7c`과 raw right-stick reader→필드의 연결이 부족하다. [mg0911 §4.4·6.1](../minigame/mg0911.md) | flipper의 Hold mask와 별도다. §8.4; 공용 ActorPad LeftStick의 변환을 raw right-stick에 임의 적용하지 않는다 |
| 웹 hit→ground 키·복수 접촉 선택·event payload | [미확정] 설계/API 연결·추가 판독·실행 근거 필요 | [판독] 원본 Sound Space→재질 ID→co_ground는 main `@0x710010db68`의 기존 완료 판독이다. Actor 접지 소비와 구분한다. [미확정] 웹 collision hit→키 해석의 원본 동등성, 여러 승인 hit의 접지 선택, Ray/limit event payload와 수신 순서는 남는다. main `@0x710062c3bc/@0x7100006670`; [05 §7.7](05_ui_input.md), [완료 C](../../../analysis/decomp/character_ftrg_c_footstep.c), [11 §4.2·9.5·9.6](11_moving_collision.md), [09 §14.2](09_character.md) | §9.1의 장면 해석기·선택/fallback·typed event는 웹 설계다. 완료된 발소리 키 경로를 미식별 함수로 재요청하지 않는다. R20/R21 |
| 전체 MotionArg→공개 character API | [미확정] 기존 구현/API 연결 확인 필요 | speedValid=false·conditionSpeed·다른 슬롯을 공개 ch.play의 옵션으로 손실 없이 표현할 근거가 부족하다. [09 §4.3·4.4·14.2](09_character.md) | §9.1의 typed 명령은 해당 필드를 보존한다. 기존 공개 주 슬롯 play/queue·pose/ground 연결만 바로 구현 가능 범위다 |
| character/FTRG 주변 미구현 | [미확정] 다른 엔진 문서의 판독·구현 필요 | face/보조 물리/FTRG 조건 그래프의 남은 근거는 [09 §14.8](09_character.md), [05 §7.9](05_ui_input.md)에 있다 | actor 연결 포트는 §7이다. 범용 FTRG 상세는 이 문서에서 중복 판독하지 않는다 |
| 게임 수신 배열·Rigger/pose/sensor | [미확정] 실행 근거 필요; 배열 C 추적 병행 | 실제 Entity group·컴포넌트 배열, Rigger UpdateTiming, query pose epoch, 센서/Player 수신 trace가 필요하다. [mg0106 §3.2·11](../minigame/mg0106.md), [mg0118 §11](../minigame/mg0118.md), [11 §7](11_moving_collision.md) | 공용 전달 코드만으로 게임 인스턴스 순서를 확정하지 않는다. §3.2·8.5 |
| 18f 선회·jump/hold 골든 | [미확정] 실행 근거 필요 | 초기 quaternion·85° 경계, FrameCount/Start/substep/hold와 원본 pose trace가 필요하다. main `@0x710000f690/@0x7100020698/@0x7100021af8`; [plaza §3.5](../shell/plaza_3d.md), [mg0912 §6.2.2·10](../minigame/mg0912.md) | §10의 재구현 예를 원본 실행 기대값으로 승격하지 않는다 |
| 수학·PhysX 전체 비트 동등 | [미확정] 실행 근거 필요; 타입 복구 병행 | SIMD/FMA·frsqrte·삼각함수·PhysX pruning/동점 정렬 trace가 필요하다. [11 §9.9](11_moving_collision.md), [mg1002 §6.1](../minigame/mg1002.md) | f32 의존 순서는 §6.1~6.4에 있다. C·웹 number 계산으로 전체 backend 동등성을 선언하지 않는다 |

[설계] 후속 판독 판정: 기존 C·데이터로 채울 수 있던 항목은 §11.2와 부록 C에 반영했다. 추가 C/실행이 필요한 항목은 위 표에 남겼다. 코드·새 디컴파일 산출물·원본 실행 금지 지시 아래에서 미확정 전체 해소로 보고하지 않는다.

### 11.4 Ghidra 추출 요청표와 기존 근거 재사용

[설계] 이 표는 후속 C 추출 요청이다. 이번 다듬기에서는 함수 본체를 새로 판독하거나 C를 생성하지 않았다. §11.3의 기존 미확정 문장은 보존했다. 우선순위 1은 기본 코어의 연결·초기화·수명 확인이다. 2는 원본 정확도다. 3은 게임별·주변 기능이다. 기본 기능 착수 순서는 §13과 구분한다.
[데이터] 함수 시작·모듈은 현행 함수 목록과 기존 C 표제·INDEX를 대조했다. 아래에 적힌 주소는 자료 주소나 내부 label이 아닌 함수 시작이다. 기존 C의 손상 타입은 정상 타입을 적용한 재추출 요청으로 표시했다. 같은 숫자의 다른 NRO는 대체 근거로 사용하지 않는다. [main 함수 목록](../../../analysis/functions/main.nso.tsv), [INDEX](../../../analysis/decomp/INDEX.tsv).
[미확정] “미식별” 행은 caller·vtable·writer 교차참조로 실제 함수 시작을 찾은 뒤 추출해야 한다. 추측 주소는 요청하지 않는다. 기존 호출자 주소와 vtable 자료 주소는 식별 단서이며 추출 주소 수에 포함하지 않는다.

| ID | 우선순위 | 모듈·C 함수 시작 | 대상 | 요청 이유·작업 | 막힌 구현 | 근거 |
|---|---|---|---|---|---|---|
| R01 | [설계] 1 | [데이터] `main` `@0x710000e35c` | [미확정] FUN_710000e35c | [미확정] 본체 미확보. 12 B 함수의 반환 조건과 +0x634 입력 비트를 연결한다. | [미확정] 입력 suspend gate의 이름·조건 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [mg0912 §6.1](../minigame/mg0912.md) |
| R02 | [설계] 1 | [데이터] `main` `@0x7100004df0`, `@0x7100004e58`, `@0x7100004ea8`, `@0x710000650c`, `@0x71000074d4` | [미확정] FUN 3개 / ActorWorld::SetActorJob / CollisionJobEvent | [미확정] 4df0은 기존 C 표제가 있으나 §3.2의 함수 경계가 손상됐다. 나머지 4개는 main C 미확보다. caller·메시지 등록도 추적한다. | [미확정] Entity/Physics의 pre→tick→ground 전역 배치·event 수신 순서 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [01 §9.7](01_core.md); [11 §4.3·7](11_moving_collision.md) |
| R03 | [설계] 1 | [데이터] `main` `@0x710001e74c`, `@0x710001e7d0`, `@0x710001e0b4` | [미확정] ComActorPad::GetTrigger / GetRelease / FUN_710001e0b4 | [미확정] main getter 2개와 Pad ctor C가 없다. edge 소비 여부와 초기 packet·MoveKey·양자화 값을 확보한다. | [미확정] Trigger/Release getter·Pad 초기 상태 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [mg0122 §6.10](../minigame/mg0122.md) |
| R04 | [설계] 1 | [데이터] `main` **미식별** | [미확정] Pad ReceiveMessage / reset / destructor·overlay writer | [미확정] 함수 시작 미식별. +0x29/40/44/48/60의 write cross-reference와 Pad vtable·수신 등록에서 주소를 식별한 뒤 C를 요청한다. | [미확정] 자동 clear 여부·CPU packet 전체 수명 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [gap C1](../../../analysis/decomp/actor_gap_c1.c); [mg0122 §6.10](../minigame/mg0122.md) |
| R05 | [설계] 1 | [데이터] `main` `@0x710001dc68` | [미확정] FUN_710001dc68 | [미확정] 본체 미확보. PadLeverData의 필드 저장·unit direction 반환 배치를 확보한다. | [미확정] 레버 결과의 정확한 구조·Pad→actor 연결 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [mg0122 §6.10](../minigame/mg0122.md) |
| R06 | [설계] 1 | [데이터] `main` `@0x7100039fd0`, `@0x7100009d00` | [미확정] FUN_7100039fd0 / FUN_7100009d00 | [미확정] 자식 cleanup main C가 없다. 같은 주소의 mg1002 C는 다른 모듈이다. | [미확정] condition/slot 자식 map의 해제 수명 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [INDEX](../../../analysis/decomp/INDEX.tsv); [01 §9.7](01_core.md) |
| R07 | [설계] 1 | [데이터] `main` `@0x7100039e3c`, `@0x710003a850` | [미확정] Velocity ctor 후보 / slot node ctor 후보 | [미확정] main C 미확보. §4.1·6.8의 호출자 문맥에서 ctor·payload 타입을 복원한다. 39e3c의 menu00 C는 main 근거가 아니다. | [미확정] Velocity/slot 전체 배치·초기값·Vector3f의 w 계약 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [INDEX](../../../analysis/decomp/INDEX.tsv); [mg0912 §4.6](../minigame/mg0912.md) |
| R08 | [설계] 1 | [데이터] `main` **미식별** | [미확정] ChangeActionGroundLever의 등록 callback | [미확정] callback 함수 시작 미식별. 기존 dba8/12370/123a8 wrapper의 등록 대상과 vtable을 식별한다. LAB_7100012454를 함수 시작으로 요청하지 않는다. | [미확정] bit6의 실제 조건·전환 소비 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [actor C](../../../analysis/decomp/mgB_main_actor.c); [mg0912 §4.11](../minigame/mg0912.md) |
| R09 | [설계] 1 | [데이터] `main` **미식별** | [미확정] ActorWorld unregister·등록 제거 caller | [미확정] 함수 시작 미식별. actor destructor의 world handle 사용·등록 제거 참조에서 요청 대상을 식별한다. | [미확정] 원본 world handle·콜백 소유자의 해제 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [actortick C](../../../analysis/decomp/mgB_main_actortick.c); [01 §9.7](01_core.md) |
| R10 | [설계] 2 | [데이터] `main` **미식별** | [미확정] 전체 action registry 초기 등록 소비 | [미확정] 미확정 callback·설치 함수의 시작은 미식별이다. 기존 ctor·기본 액션 규칙의 완료 판독을 재추출하지 않고 미확정 registry writer만 식별한다. | [미확정] 전체 액션 enum·초기 등록표 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [actor C](../../../analysis/decomp/mgB_main_actor.c); [mg0912 §4.6·4.11](../minigame/mg0912.md) |
| R11 | [설계] 2 | [데이터] `main` `@0x710000abc0`, `@0x710000b004`, `@0x710000b8a4` | [미확정] condition factory / ActorConditionDamage::SetStartVelocity / ActorConditionPressed::Init | [미확정] C 미확보. factory의 concrete 클래스 선택과 명명된 2개 함수의 인자·효과를 확보한다. | [미확정] 조건별 효과·피격 시작 속도·Pressed 초기화 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [mg0912 §4.6·11.1](../minigame/mg0912.md) |
| R12 | [설계] 2 | [데이터] `main` **미식별** | [미확정] Damage / Pressed / HipDropPressed ctor·virtual38/48 | [미확정] 해당 ctor·step·Init의 concrete vtable target은 미식별이다. R11 결과의 vtable과 반환 객체에서 함수 시작을 식별한 뒤 요청한다. | [미확정] 효과 기간·입력/이동 제한·해제 조건·공격 액션 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [mg0912 §4.6·11.1](../minigame/mg0912.md) |
| R13 | [설계] 2 | [데이터] `main` `@0x7100007be0`, `@0x710002d214` | [미확정] 가변 중력 집계 / provider getter | [미확정] 기존 C의 타입 복구 후 재추출 요청이다. 길이/0 분기와 provider vector 반환 ABI가 손상됐다. 완료된 기본 gdir/gmag/scale은 재판독하지 않는다. | [미확정] volume 정상화·반환 중력 벡터 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c); [gap C1](../../../analysis/decomp/actor_gap_c1.c); [mg0912 §6.1](../minigame/mg0912.md) |
| R14 | [설계] 2 | [데이터] `main` **미식별** | [미확정] gravity provider virtual30 | [미확정] 실제 함수 시작 미식별. R13 getter의 provider+0x80·vtable target을 식별해 정상 반환형 C를 요청한다. | [미확정] 가변 중력 provider의 벡터 구성 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [gap C1](../../../analysis/decomp/actor_gap_c1.c); [mg0912 §6.1](../minigame/mg0912.md) |
| R15 | [설계] 2 | [데이터] `main` `@0x7100015d84` | [미확정] ComActor::LeverToVectorXZ | [미확정] 기존 C의 float/NEON 타입 복구 후 재추출 요청이다. 기존 Pad 각·override 우선순위 판독은 재사용한다. | [미확정] 카메라 basis를 이용한 정확한 이동 벡터 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [actor C](../../../analysis/decomp/mgB_main_actor.c); [plaza §3.5](../shell/plaza_3d.md) |
| R16 | [설계] 2 | [데이터] `main` **미식별** | [미확정] Actor lever camera callback virtual30 | [미확정] 함수 시작 미식별. 0x71019cb548/0x71019cb590은 vtable 자료 주소다. 그 virtual30 target을 식별한 뒤 C를 요청한다. GetPadActorDeg의 virtual30은 PadStickOverride이므로 대상에서 제외한다. | [미확정] 원본 camera right/front callback·basis 반환 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [actor C](../../../analysis/decomp/mgB_main_actor.c); [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c); [plaza §3.5](../shell/plaza_3d.md) |
| R17 | [설계] 2 | [데이터] `main` `@0x71002b9db8`, `@0x71002b9dc0`, `@0x71002b9dc8`, `@0x71002b9dd0`, `@0x71002b9dd8`, `@0x71002b9de0`, `@0x71002b9de8`, `@0x71002b9df0`, `@0x71002b9df8`, `@0x71002b9e00`, `@0x71002b9e08` | [미확정] ActorParam getter 11개 | [미확정] 각 8 B getter C 미확보. 반환 오프셋과 미확정 소비 caller를 연결한다. loader의 f32·/60 및 10개 확정 행 소비는 재사용한다. | [미확정] 33행 중 남은 행→필드 대응·최종 jump 설정 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [06 §2.6](06_scene_data.md); [mg0118 §11](../minigame/mg0118.md) |
| R18 | [설계] 2 | [데이터] `main` `@0x710002a054`, `@0x710002a4c0`, `@0x710002a650` | [미확정] AA 처리 / 단측 helper / DefaultFinalizeCharacterRigidBody | [미확정] 기존 C의 vector·storage bitcast·SIMD 타입 복구 후 재추출 요청이다. 완료된 분기·Jump/Fall/Pressed 호출은 재사용한다. | [미확정] AA 반사/밀림의 단측 부호·0 fallback·최종 projection | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [actorcoord C](../../../analysis/decomp/mgB_main_actorcoord.c); [runtime core C](../../../analysis/decomp/runtime_A_collision_core.c); [11 §4.1](11_moving_collision.md) |
| R19 | [설계] 2 | [데이터] `main` **미식별** | [미확정] AA output 초기화 caller·table 소비 | [미확정] 별도 함수 시작 미식별. R18 output writer·caller와 SIMD table 참조를 따라 정상 타입의 추가 C 대상을 식별한다. | [미확정] 0 fallback·output w의 초기값·단측 cast 의미 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [11 §4.1](11_moving_collision.md) |
| R20 | [설계] 2 | [데이터] `main` **추가 요청: 미식별** | [미확정] 복수 승인 hit의 원본 접지 선택 소비 | [판독] 발소리 키 소비 main `@0x710010db68`은 Sound Space→재질 ID→co_ground 완료 경로다. [미확정] 여러 승인 hit의 접지 선택 소비 함수 시작은 미식별이다. 기존 접지 callback의 후속 소비를 식별한다. 010db68/62c3bc/6670은 중복 추출하지 않는다. | [미확정] 복수 hit의 원본 접지 선택. [설계] 웹 hit→ground 키는 별도 해석기/API 연결 확인이며 미식별 원본 발소리 함수로 취급하지 않는다 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [05 §7.7](05_ui_input.md); [완료 C](../../../analysis/decomp/character_ftrg_c_footstep.c); [11 §4.2·9.5·9.6](11_moving_collision.md); [09 §14.2](09_character.md) |
| R21 | [설계] 2 | [데이터] `main` **미식별** | [미확정] Ray/limit·Grounded event payload writer/receiver | [미확정] payload writer·수신 함수 시작 미식별. R02 CollisionJobEvent와 접지 이벤트 참조에서 대상 주소를 식별한다. 2b8c0의 4 B Create 표제만으로 payload를 추정하지 않는다. | [미확정] Ray/limit 통지와 Sweep event의 payload·수신 순서 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [11 §4.2·9.5](11_moving_collision.md) |
| R22 | [설계] 2 | [데이터] `main` **미식별** | [미확정] 형상 scale·nbmap 부모 pose/속성의 미확정 소비 | [미확정] loader→Entity/HitShape에서 미확정 본 부착·부모 pose 소비 함수 시작을 식별한다. 완료된 c6cc/146a4/1d665c의 비본 capsule·PCIndividualScale은 제외한다. | [미확정] 비균등/음수 scale·부모 pose·남은 collision 속성 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [11 §3.4·7·9.9](11_moving_collision.md); [06 §9](06_scene_data.md) |
| R23 | [설계] 2 | [데이터] `main` **미식별** | [미확정] model-less/custom AA·CCT/Dynamic 생성/등록 | [미확정] 구체적인 callback·생성·등록 소비 함수 시작 미식별. 기존 class/model 필터와 actor-collision 포트 설계는 재사용하고 연결 대상을 식별한다. | [미확정] 기본 query adapter 밖의 원본 충돌 경로 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [11 §4.1·9.9](11_moving_collision.md); [mg0107 §6.6](../minigame/mg0107.md) |
| R24 | [설계] 2 | [데이터] `main` **미식별** | [미확정] Velocity/slot payload 접근자·callback별 소비 | [미확정] 별도 접근자 함수 시작 미식별. R07의 payload 타입과 미확정 접근 참조에서 대상 C를 식별한다. 기본 step·callback 복사·직접 합산은 제외한다. | [미확정] 전체 payload 필드·callback별 물리 규칙 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [mg0912 §4.6](../minigame/mg0912.md) |
| R25 | [설계] 3 | [데이터] `mg0912` `@0x710006dbb0` | [미확정] Player::SetTrampolineJump | [미확정] 기존 C의 CallAction 인자·context ABI 복구 후 재추출 요청이다. JumpCalculator Update의 공용 substep 연결은 해소됐다. | [미확정] trampoline overload·42→23 복원 인자 | [mg0912 함수 목록](../../../analysis/functions/mg0912.nro.tsv); [mg0912 §6.10.2·11.1](../minigame/mg0912.md) |
| R26 | [설계] 3 | [데이터] `mg0106` `@0x710001b9c0` | [미확정] ComPlayer::ComPlayer | [미확정] ColRadius→HitShape consumer의 타입·호출 인자 복구가 필요하다. 회전판 carry 완료 판독은 제외한다. | [미확정] radius .8의 실제 형상 적용 | [mg0106 함수 목록](../../../analysis/functions/mg0106.nro.tsv); [mg0106 §4.2·11](../minigame/mg0106.md) |
| R27 | [설계] 3 | [데이터] `mg0107` `@0x710000c3e0` | [미확정] Player::Setup | [미확정] component 설치→controller 생성 인자·소비 연결의 C가 필요하다. main의 동일 숫자 주소와 혼용하지 않는다. | [미확정] 게임 CCT 생성 여부·설정 | [mg0107 함수 목록](../../../analysis/functions/mg0107.nro.tsv); [mg0107 §6.6·9.5](../minigame/mg0107.md) |
| R28 | [설계] 3 | [데이터] `main` `@0x71008877c4`, `@0x7100887f58` | [미확정] ComAttachment::SetTarget 나머지 overload 2개 | [미확정] 두 본체 C 미확보. [판독] SetTarget(ISocket) `@0x7100887d84`의 유효 대상·순환 검사와 소켓 소유자 의존 연결은 [11 §2.1](11_moving_collision.md)의 완료 판독으로 재사용하며 추출에서 제외한다. mg0508 ctor의 bone socket target도 기존 C를 재사용한다. | [미확정] 나머지 target overload·게임별 상세 인자와 몸/점 연결 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [11 §2.1](11_moving_collision.md); [mg0508 §5.1·9.6·11](../minigame/mg0508.md) |
| R29 | [설계] 3 | [데이터] `mg0508` **추가 요청: 미식별** | [미확정] 점 Entity→target 소비·실제 게임 갱신 시점 | [판독] main attachment 갱신 `@0x7100887fc8`과 수신 `@0x710088848c`는 [11 §2.1](11_moving_collision.md)의 완료 판독이다. [미확정] mg0508 점 Entity→target 소비 함수 시작은 미식별이다. 기존 ctor의 점 Entity 참조에서 대상을 식별한다. 실제 활성 배열·pose 평가 시점은 게임 설정/실행 근거가 필요하다. | [미확정] mg0508 몸/점의 게임별 연결·갱신 시점. 공용 attachment 주소·TRS 적용은 미확정에서 제외한다 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [11 §2.1](11_moving_collision.md); [mgC_mg0508_game.c](../../../analysis/decomp/mgC_mg0508_game.c); [mg0508 §11](../minigame/mg0508.md) |
| R30 | [설계] 3 | [데이터] `mg0118` `@0x7100014a40` | [미확정] Player::Setup | [미확정] 기존 SetSourceBox의 ABI·quaternion·mask 타입 복구 후 재추출 요청이다. d060 callback·후보 중심/크기는 기존 판독을 재사용한다. | [미확정] HurdleHit half-size·자세·전체 mask | [mg0118 함수 목록](../../../analysis/functions/mg0118.nro.tsv); [mg0118_game_only.c](../../../analysis/decomp/mg0118_game_only.c); [mg0118 §6.7·11](../minigame/mg0118.md) |
| R31 | [설계] 3 | [데이터] `mg0911` `@0x7100063d7c` | [미확정] Player::GameMainUpdate | [미확정] 기존 C의 raw right-stick reader→소비 필드 연결·축 타입을 복구한 C가 필요하다. | [미확정] plunger 축·범위·raw reader 연결 | [mg0911 함수 목록](../../../analysis/functions/mg0911.nro.tsv); [mg0911 §4.4·6.1](../minigame/mg0911.md) |
| R32 | [설계] 3 | [데이터] `main / 각 게임` **미식별** | [미확정] Entity group·component 배열·Rigger 등록 consumer | [미확정] 게임 인스턴스의 등록 caller 시작 미식별. 주소 식별 후 배열 C 추적을 요청한다. 실제 활성 배열·pose epoch·센서 수신 순서는 실행 trace도 필요하다. | [미확정] 게임별 실제 writer/reader·Rigger/Physics 경계 | [main 함수 목록](../../../analysis/functions/main.nso.tsv); [mg0106 §3.2·11](../minigame/mg0106.md); [mg0118 §11](../minigame/mg0118.md); [11 §7](11_moving_collision.md) |
| R33 | [설계] 2 | [데이터] `웹 API` 추출 대상 아님 | [미확정] 전체 MotionArg→character 공개 API | [미확정] Ghidra 추출 대상 아님. speedValid·conditionSpeed의 원본 필드/식과 SetConditionSpeed C는 이미 있다. 공개 옵션·다른 슬롯의 표현 범위를 연결부에서 확인한다. | [미확정] speedValid=false·conditionSpeed·다른 슬롯의 웹 표현 | [09 §4.3·4.4·14.2](09_character.md); [character_motion.c](../../../analysis/decomp/character_motion.c) |
| R34 | [설계] 3 | [데이터] `별도 엔진 문서` 추출 대상 아님 | [미확정] face·보조 물리·FTRG 조건 그래프 | [미확정] 이 문서의 Ghidra 추출 요청으로 중복 등록하지 않는다. 담당 문서의 남은 함수·구현 범위를 사용한다. | [미확정] character/FTRG의 actor 주변 완전 지원 | [09 §14.8](09_character.md); [05 §7.9](05_ui_input.md) |
| R35 | [설계] 2 | [데이터] `원본 실행` 추출 대상 아님 | [미확정] 18f 선회·Jump/hold 골든 | [미확정] Ghidra 추출만으로 해소되지 않는다. FrameCount/Start/substep/hold·초기 quaternion·85° 경계의 실행 trace가 필요하다. 이번 작업에서는 실행하지 않는다. | [미확정] §10 재구현 계산의 원본 golden 승격 | [plaza §3.5](../shell/plaza_3d.md); [mg0912 §6.2.2·10](../minigame/mg0912.md) |
| R36 | [설계] 2 | [데이터] `원본 실행·수학 backend` 추출 대상 아님 | [미확정] SIMD/FMA·PhysX 전체 비트 동등 | [미확정] Ghidra C만으로 해소되지 않는다. R13/R15/R18 타입 복구와 별도로 frsqrte·삼각함수·pruning·동점 순서의 실행 근거가 필요하다. | [미확정] 원본 수학·query/backend 전체 동등 | [11 §9.9](11_moving_collision.md); [mg1002 §6.1](../minigame/mg1002.md) |

[데이터] 요청 함수 시작은 `(모듈,주소)` 중복 제거 후 총 41개다. 우선순위 1은 14개, 2는 20개, 3은 7개다. 주소 미식별은 15개 요청 행이다. 추출 대상 밖의 확인은 4개 행이다. 완료 재사용으로 인용한 010db68/887fc8/88848c/887d84는 요청 주소에 포함하지 않는다. R28의 887d84 중복 요청 1개를 제외했다. 근거는 위 각 모듈 함수 목록과 [05 §7.7](05_ui_input.md), [11 §2.1](11_moving_collision.md)이다.

[설계] 아래 완료 근거는 추출 요청에서 제외한다. “해소”는 오른쪽 범위에 한정한다. 남은 원본 효과·API 표현·실행 정확도는 별도 요청 ID에 남긴다.

| 기존 공백 | 현재 상태·재사용 범위 | 남는 요청 | 기존 근거 |
|---|---|---|---|
| JumpCalculator의 substep factor 연결 | [판독] 해소. 수직 substep에서 Update→IsHold→가속→위치다. Start 프레임 가속 생략을 재사용한다 | [미확정] trampoline ABI R25·실행 골든 R35 | main `@0x710000f230/@0x7100021af8`; §6.1·6.4·11.2, [actortick C](../../../analysis/decomp/mgB_main_actortick.c), [mg0912 §6.2.2](../minigame/mg0912.md) |
| CPU setter와 Hold/Stick getter | [판독] 저장 오프셋·off 유지·getter 무소비는 해소됐다. 자동 clear 전체 수명과 구별한다 | [미확정] R03·R04·R32 | main `@0x710001e854/@0x710001e878/@0x710001e894/@0x710001e8b0/@0x710001ec50/@0x710001e54c/@0x710001eac4`; §6.6·11.2, [gap C1](../../../analysis/decomp/actor_gap_c1.c), [pad C](../../../analysis/decomp/mgB_main_pad.c), [mg0122 §6.10](../minigame/mg0122.md) |
| Pad 각·override 우선순위 | [판독] Dpad/analog·PadStickOverride 순서는 해소됐다. camera virtual30과 분리한다 | [미확정] 결과 배치 R05·camera R15/R16 | main `@0x710001e8b8`; §6.5·11.2, [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [mg0122 §6.10](../minigame/mg0122.md) |
| condition/외부 변위 기본 수명 | [판독] scheduler·generation·slot 기본 ZERO4·callback 복사·직접 변위 합산은 해소됐다 | [미확정] concrete 효과 R11/R12·전체 payload R07/R24 | main `@0x7100009dc0/@0x7100039e80/@0x7100039ed0/@0x710003a090`; §5.2·6.8·11.2, [actorground C](../../../analysis/decomp/mgB_main_actorground.c), [gap C1](../../../analysis/decomp/actor_gap_c1.c), [mg0912 §4.6](../minigame/mg0912.md) |
| ActorParam 로딩·확정 행 | [판독] f32·해당 /60 변환·10개 확정 행 소비는 해소됐다 | [미확정] 나머지 대응 R17 | main `@0x71002b9bc0/@0x71002b2e00`; §4.2·11.2, [gap C1](../../../analysis/decomp/actor_gap_c1.c), [06 §2.6](06_scene_data.md) |
| Map callback·final position identity | [판독] 기존 접지 승인 순서와 16 B identity 복사는 해소됐다. Ray/Shape All·Entity 공용 수신도 기존 판독을 재사용한다 | [미확정] 복수 hit 접지 선택 R20·event R21·전역 배열 R32. [설계] 웹 hit→키 해석은 별도 API 연결 확인 | main `@0x7100006670/@0x7100014564/@0x7100625110/@0x7100625480/@0x7100899450`; §6.7·11.2·부록 C, [gap C2](../../../analysis/decomp/actor_gap_c2.c), [11 §4.2](11_moving_collision.md), [01 §9.7](01_core.md) |
| Sound Space 발소리 키 소비 | [판독] 엔티티 위치의 Sound Space→재질 ID→co_ground 이름 갱신은 기존 완료 판독을 재사용한다. Actor 접지/IsGrounded와 별도다 | [미확정] 복수 hit 접지 선택 R20·event R21. [설계] 웹 hit→키 해석의 연결 확인은 별도다 | main `@0x710010db68`; [05 §7.7](05_ui_input.md), [완료 C](../../../analysis/decomp/character_ftrg_c_footstep.c) |
| attachment 공용 수신·갱신·소켓 target | [판독] 수신→TRS 평가와 SetTarget(ISocket)의 소켓 소유자 의존 연결은 기존 완료 판독을 재사용한다 | [미확정] 나머지 overload R28·mg0508 점 소비/실제 시점 R29 | main `@0x710088848c/@0x7100887fc8/@0x7100887d84`; [11 §2.1](11_moving_collision.md), [main 함수 목록](../../../analysis/functions/main.nso.tsv), [mg0508 §5.1·11](../minigame/mg0508.md) |
| MotionArg/conditionSpeed 원본 | [판독] speedValid 필드와 speed×conditionSpeed는 기존 §09 판독으로 확보됐다. SetConditionSpeed 2개 C 표제도 있다 | [미확정] 공개 웹 API 표현 R33. 이 두 함수는 추출 제외 | main `@0x7100023c7c/@0x710002e104`, 원본 식 `@0x7100022420`; [character_motion.c](../../../analysis/decomp/character_motion.c), [09 §4.3·4.4·14.2](09_character.md) |
| AA 분기·게임 기존 caller | [판독] AA 분기·Jump/Fall/Pressed 호출, mg0508 ctor attachment, mg0118 d060 callback, mg0106 carry는 기존 판독을 재사용한다 | [미확정] 타입·추가 소비 R18/R19/R26/R28~R30 | main `@0x710002a054/@0x710002a4c0`, mg0508 `@0x710000bc50`, mg0118 `@0x710000d060`, mg0106 `@0x710001c8c0`; §8.1·8.2·8.4, [11 §4.1](11_moving_collision.md), [mg0508 §5.1](../minigame/mg0508.md), [mg0118 §6.7](../minigame/mg0118.md), [mg0106 §6.1](../minigame/mg0106.md) |

## 12. 사용자 확인 필요

[설계] 아래 4개는 후속 구현 범위를 결정할 항목이다. 추천안은 문서의 설계 제안이다. 사용자 승인이나 최종 선택으로 간주하지 않는다. 원본 미확정 동작은 §11.3·11.4와 함께 남긴다.

| 결정 | 원본 상태·근거 | 선택지 | 구현 영향 | 추천안 |
|---|---|---|---|---|
| 1. 가변 중력·조건 효과·AA capsule 반사/밀림 | [판독] 기본 중력·scheduler·AA 분기는 있다. [미확정] provider 정상화·concrete 효과·단측 부호/0 fallback이 남는다. main `@0x7100007be0/@0x710002d214/@0x7100009dc0/@0x710002a054/@0x710002a4c0/@0x710002a650`; [mg0912 §6.1·4.6](../minigame/mg0912.md), [11 §4.1](11_moving_collision.md), R11~R14/R18/R19 | [설계] A: 첫 구현부터 완전 지원. B: 원본 기본 경로부터 구현하고 남은 경로는 미확정으로 보존 | [설계] A는 해당 C·타입 복구를 먼저 완료해야 한다. B는 §13의 기본 기능을 시작할 수 있다. 미확정 응답을 자동 기본값으로 대체하지 않는다 | [설계] B. 포트·비활성 경계를 명시하고 후속 정확도 작업으로 추가한다 |
| 2. 첫 PlazaMover 이전 범위 | [판독] 광장 이동·Pad·Map 접지와 기존 motion 연결 근거가 있다. [미확정] camera callback·전역 phase·원본 query bit 동등은 남는다. main `@0x71000149e8/@0x710001e54c/@0x710001eac4/@0x7100006670/@0x710000ecd0`; [plaza §3.5](../shell/plaza_3d.md), [11 §4.2·9](11_moving_collision.md), [09 §14](09_character.md), 현재 웹 비교 §9.4 | [설계] A: 지상 이동/Pad/Map 접지/주 슬롯 motion 연결부터 이전. B: 전체 actor·게임 전용 carry/조건/AA까지 한 번에 이전 | [설계] A는 §9.4의 기존 pose·입력·접지·표현 경계를 나눠 검증한다. B는 미확정과 게임별 소비까지 착수 조건이 넓어진다 | [설계] A. caller의 pre/tick/jobs와 pose 동기화 장벽을 명시한다 |
| 3. 카메라 수평 right/front의 선행 근사 | [판독] GetPadActorDeg의 virtual30은 PadStickOverride이다. Actor camera callback은 별도다. [미확정] callback vtable 자료 0x71019cb548/0x71019cb590의 virtual30 함수와 벡터 타입은 남는다. main `@0x710001e8b8/@0x7100013500/@0x7100015d28/@0x7100015d84`; [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [actor C](../../../analysis/decomp/mgB_main_actor.c), [plaza §3.5](../shell/plaza_3d.md), R15/R16 | [설계] A: 연결부가 수평 right/front를 주입하는 근사를 먼저 사용. B: 원본 camera callback C 확보까지 해당 이전을 보류 | [설계] A는 명시한 근사로 광장 지상 이동을 시작한다. 원본 카메라/비트 동등을 주장하지 않는다. B는 원본 basis 연결을 먼저 확정한다 | [설계] A. 근사를 장면 연결부에 두고 코어 입력 계약과 분리한다. R15/R16 후 교체한다 |
| 4. ActorParam 33행 적용 범위 | [판독] 33행 원본과 10개 확정 행의 소비·f32·해당 /60 규칙이 있다. [미확정] 나머지 행의 대응·최종 설정은 남는다. main `@0x71002b9bc0/@0x71002b2e00`; [06 §2.6](06_scene_data.md), [09 §4.8](09_character.md), §4.2, R17 | [설계] A: 확정 10행만 적용하고 나머지는 raw로 보존. B: 전체 대응 판독 후 33행을 적용 | [설계] A는 ctor→common→game 설정 단계와 알려진 소비만 구현한다. 미확정 행의 이름·단위를 발명하지 않는다. B는 getter·caller 대응 완료가 선행한다 | [설계] A. 원본 raw 행과 적용된 파라미터를 구분한다 |

## 13. 런타임 구현 준비도

[설계] 아래는 문서 근거의 구현 준비도다. “바로 구현 가능”은 명시된 범위의 기능 구현 판정이다. 원본 실행·비트 동등성 판정과 구분한다. 부족한 주소·자료는 §11.3에 있다.

| 항목 | 판정 | 확보한 규칙·남은 제한 | 착수 순서 |
|---|---|---|---|
| ActorParams 단계·확정 행 | **바로 구현 가능** | [설계] §4.1·4.2. f32 타입·/60 변환·10개 확정 행 소비를 사용한다. 나머지 행의 최종 대응은 **판독 필요** | [설계] 1.1 |
| Pad Hold/Stick·style·문턱 | **바로 구현 가능** | [설계] §4.3·6.5. enabled→overlay/style→원형 .1 문턱 순서가 있다 | [설계] 2.1 |
| Dpad/analog·override·각 양자화 | **바로 구현 가능** | [설계] §6.5. Dpad 각·우선순위·atan2·절삭은 있다. PadLeverData 출력 배치/camera callback은 **판독 필요** | [설계] 2.2 |
| CPU setter·overlay 저장 | **바로 구현 가능** | [설계] §6.6. setter 저장·off 유지·Hold/Stick 무소비를 사용한다. Trigger/Release getter·프레임 자동 clear는 **판독 필요** | [설계] 2.3 |
| 이동·공중 가감속·낙하 상한 | **바로 구현 가능** | [설계] §6.1·6.2. 서브스텝·delta 누적·곱/나눗셈·terminal projection이 있다. FMA/정규화 비트는 **근사 필요** | [설계] 3.2 |
| 몸 선회·camera lever | **근사 필요** | [설계] §6.3·6.5. 선회율/85° 경계는 있다. quaternion·basis callback의 원본 연결은 **판독 필요** | [설계] 보류: R15/R16/R35 |
| JumpCalculator·Start/off·호출 위치 | **바로 구현 가능** | [설계] §4.4·6.1·6.4. Update/IsHold 위치를 반영한다. trampoline overload는 **판독 필요**. 실제 궤적은 실행 대조가 필요하다 | [설계] 4 |
| action registry·대표 상태 | **바로 구현 가능** | [설계] §5.1·5.2. 공용 Jump/Yoshi Jump mask를 분리한다. 전체 공격/피격 효과는 **판독 필요** | [설계] 1.2 |
| condition map·scheduler·수명 | **바로 구현 가능** | [설계] §5.2. snapshot/반환1/destroy/generation 규칙이 있다. 클래스별 효과·기간은 **판독 필요** | [설계] 5.1 |
| 외부 변위 slot·기본/명시 callback | **바로 구현 가능** | [설계] §6.8. 기본0·callback 복사·dt 인자·직접 변위 합산이 있다. callback별 물리 규칙은 소비자 책임이다 | [설계] 5.2 |
| 기본 gravity/scale | **바로 구현 가능** | [설계] §4.1·6.8. volume/provider 반환·정상화는 **판독 필요** | [설계] 3.1 |
| Map 평균·접지·Y limit·identity | **바로 구현 가능** | [설계] §6.7·8.1·9.1. 단일 승인 hit/body/shape와 worldY 규칙은 구현 가능하다. 여러 승인 hit의 원본 접지 선택·Ray/limit event payload는 **판독 필요**. 웹 hit→ground 키 해석은 별도 설계/API 연결 확인이다. R20/R21 | [설계] 6.2 |
| AA capsule 분기·반사/밀림 | **판독 필요** | [설계] §8.1. 분기·context는 있다. 단측 벡터 타입/부호·0 fallback까지 확정돼야 완전 구현할 수 있다 | [설계] 보류: R18/R19 |
| collision adapter·형상 수명 | **바로 구현 가능** | [설계] §9.1·9.2. P0 query·typed MapContact·웹 registry/owned body 해제 계약에 한정한다. 원본 world unregister·model-less/custom AA fallback·CCT/Dynamic 연결은 **판독 필요** | [설계] 6.1 |
| 내부 tick·공용 모듈 간선 | **바로 구현 가능** | [설계] §3.2·3.3. actor jobs 전역 phase와 게임 실제 배열은 **판독 필요** | [설계] 1.3 |
| 게임별 carry | **바로 구현 가능** | [설계] §8.2. mg0106/mg0912 규칙을 소비자 adapter에 둔다. 자동 carry 부재를 전체 엔진으로 일반화하지 않는다 | [설계] 6.4 |
| 주 슬롯 motion·명시 ground 키 연결 | **바로 구현 가능** | [설계] §7·9.1. 기존 character의 주 슬롯 play/queue·pose·setGround/step에 한정한다. 장면 해석표는 주입한다. [판독] 원본 Sound Space→재질 ID→co_ground는 main `@0x710010db68`의 [05 §7.7](05_ui_input.md) 완료 판독을 재사용한다. [미확정] 웹 hit→키 해석과 speedValid=false/conditionSpeed의 공개 API 연결은 **연결 확인 필요**. 다른 슬롯·FTRG graph는 기존 담당 문서의 **판독/구현 필요**다. R20/R33/R34 | [설계] 7 |
| actor 본체 해제·웹 binding 정리 | **바로 구현 가능** | [설계] §3.4·9.1. 본체 내부 파괴와 설계된 registry/cache/owned body/구독 정리에 한정한다. 원본 world unregister/자식 map/Pad 전체 수명은 **판독 필요** | [설계] 6.3 |
| 원본 실행·전체 비트 동등 | **판독 필요** | [설계] §10·11.3. pose/수학/query/backend 실행 근거가 부족하다 | [설계] 보류: R35/R36 |

[설계] 구현 결론: 기본 이동·패드 저장/변환·JumpCalculator·조건/슬롯 수명·Map/접지 adapter와 character 연결은 설계할 수 있다. 일반 actor 전체를 완료하려면 §11.3의 추가 C와 원본 실행 근거가 필요하다.

[설계] 착수 순서는 1 수치·Param 및 registry/호출 단계 준비 → 2 Pad → 3 기본 중력·이동/공중/낙하 → 4 JumpCalculator → 5 condition/slot 기본 수명 → 6 충돌·접지 adapter/해제/carry → 7 character 연결이다. 같은 번호의 소수 부분은 해당 단계 안의 의존 순서다. 기본 경로의 준비도 판정은 기존 표를 유지한다. 보류와 각 행의 남은 제한은 R01~R36으로 추적한다.
[설계] 1.3의 호출 단계 준비는 pre/tick/jobs를 caller가 명시하는 골격에 한정한다. 원본 전역 phase는 R02/R32가 남는다. 2.3은 setter 저장에 한정한다. 자동 edge clear는 R03/R04가 남는다. 6.2의 단일 승인 hit와 7의 공개 주 슬롯 연결은 기본 범위다. 복수 hit 원본 접지 선택·event는 R20/R21이 남는다. 웹 hit→키 해석·전체 MotionArg 공개 API는 별도 연결 확인이다. 원본 발소리 키 경로 완료와 구분한다. 기존 근거는 §3.2·6.6·9.1·11.3·13 표, main `@0x710010db68` [05 §7.7](05_ui_input.md)에 있다.
[판독] 공용 attachment 수신·TRS 평가와 소켓 target 의존 연결은 main `@0x710088848c/@0x7100887fc8/@0x7100887d84`의 [11 §2.1](11_moving_collision.md) 완료 판독을 재사용할 수 있다. [미확정] mg0508 점 Entity→target 소비·실제 게임 갱신 시점은 R29의 **판독/실행 근거 필요**다. actor 코어의 기본 이동 준비도와 게임별 부착의 정확도 범위를 분리한다. [mg0508 §5.1·11](../minigame/mg0508.md).

## 부록 A. 지정 출처의 절별 대응

[데이터] 19개 문서의 127개 절을 대응시켰다. 부모 절은 그 아래의 관련 하위 절을 포함한다. 표는 편집 대응이며 원본 확정 수준은 본문에 별도로 붙였다.

| 원래 문서·절 | 원문 절 제목 | 17_actor 반영 위치 |
|---|---|---|
| [데이터] [mg0912 §3.1](../minigame/mg0912.md) | 클래스 구성 [판독: 함수 이름·생성 순서] | §3.1, 8.4 |
| [데이터] [mg0912 §3.6](../minigame/mg0912.md) | 엔진 타이밍과 dt [판독: 01_core, SHARED] | §3.2, 6.1 |
| [데이터] [mg0912 §4.1](../minigame/mg0912.md) | Scene::Params → SceneParam [판독 `getPropertyList @0x710007110c`, `createInstance @0x7100071504`, 판독자 C] | §4.2 |
| [데이터] [mg0912 §4.2](../minigame/mg0912.md) | GameParam (mg0912_config.csv) [판독 `GameParam::Initialize @0x7100053a90`, 데이터] | §4.2, 8.4 |
| [데이터] [mg0912 §4.5](../minigame/mg0912.md) | Player 필드 (0x410 B) [판독, 판독자 D] | §4.1, 8.4 |
| [데이터] [mg0912 §4.6](../minigame/mg0912.md) | ComActor 필드 (main 액터) [판독, 기본값 ctor main @0x710000d2c0, 판독자 D] | §4.1, 4.2 |
| [데이터] [mg0912 §4.7](../minigame/mg0912.md) | ComAI 필드 [판독, 판독자 D] | §8.3 |
| [데이터] [mg0912 §4.11](../minigame/mg0912.md) | 액션 이름·ChangeAction 마스크 [판독, 판독자 D] | §5.1, 5.2 |
| [데이터] [mg0912 §5.1](../minigame/mg0912.md) | Player 상태 (+0x118, `SetState @0x7100068b20`) [판독] | §8.4 |
| [데이터] [mg0912 §5.2](../minigame/mg0912.md) | 액션 상태기계 (ExAction, 요시) [판독, 판독자 D] | §5.3 |
| [데이터] [mg0912 §5.5](../minigame/mg0912.md) | 게임 끝·순위 수명 | §8.4 |
| [데이터] [mg0912 §6.1](../minigame/mg0912.md) | 액터 한 프레임 (main 액터 라이브러리) [판독, 판독자 D] | §3.3, 6.1 |
| [데이터] [mg0912 §6.2](../minigame/mg0912.md) | 점프 | §4.4, 6.4, 10 |
| [데이터] [mg0912 §6.3](../minigame/mg0912.md) | 이동·회전 [판독: main MoveAir @0x7100014a88, MoveLeverDirection @0x71000149e8, 회전 FUN_710000f690] | §6.2, 6.3 |
| [데이터] [mg0912 §6.4](../minigame/mg0912.md) | 접지 판정과 지면 붙이기 [판독: main lambda @0x7100006670, ActorWorld 충돌 잡, 판독자 D] | §6.7, 8.1, 11.1 |
| [데이터] [mg0912 §6.5](../minigame/mg0912.md) | 플레이어 생성과 매 프레임 | §3.1, 8.4 |
| [데이터] [mg0912 §6.6](../minigame/mg0912.md) | 충돌 판정·피해 [판독 `CheckCollision @0x71000646c0`, `CrashedDamage @0x710006d280`] | §8.4 |
| [데이터] [mg0912 §6.7](../minigame/mg0912.md) | 먹기와 대시 [판독 `EatNut @0x71000698d0`, `SetDefaultSpeed @0x710006c0f0`, Update 안 먹기] | §8.4 |
| [데이터] [mg0912 §6.8](../minigame/mg0912.md) | 낙하·물·리스폰 [판독 `ForwardMovePlayer @0x710006437c`, `CheckLandingWater @0x7100064584`] | §8.4 |
| [데이터] [mg0912 §6.9](../minigame/mg0912.md) | 골까지 거리·순위·골 | §8.4 |
| [데이터] [mg0912 §6.10](../minigame/mg0912.md) | 맵 오브젝트 [판독, 판독자 C] | §8.4 |
| [데이터] [mg0912 §6.12](../minigame/mg0912.md) | CPU (ComAI) [판독, 판독자 D] | §6.6, 8.3 |
| [데이터] [mg0912 §7.1](../minigame/mg0912.md) | 모델·모션 | §7 |
| [데이터] [mg0912 §7.2](../minigame/mg0912.md) | 이펙트 | §7 |
| [데이터] [mg0912 §7.3](../minigame/mg0912.md) | SE (코드에 이름이 직접 나오는 것) [판독: 디컴파일 문자열] | §7 |
| [데이터] [mg0912 §8.3](../minigame/mg0912.md) | 입력 | §6.5, 8.3 |
| [데이터] [mg0912 §8.5](../minigame/mg0912.md) | 동기화 | §8.3 |
| [데이터] [mg0912 §9.1](../minigame/mg0912.md) | 모듈 (웹 권장 이름) | §9.1 |
| [데이터] [mg0912 §9.3](../minigame/mg0912.md) | 한 step 순서 (권장) | §3.2, 9.4 |
| [데이터] [mg0912 §9.4](../minigame/mg0912.md) | 원본 이름 ↔ 웹 권장 이름 | §9.3 |
| [데이터] [mg0912 §9.5](../minigame/mg0912.md) | 에셋 변환 | §9.4 |
| [데이터] [mg0912 §10](../minigame/mg0912.md) | 검증 코드·실행 결과·기대값 | §10 |
| [데이터] [mg0912 §11.1](../minigame/mg0912.md) | 남은 미확정 | §11.1 |
| [데이터] [mg0912 §11.2](../minigame/mg0912.md) | 두 노트 사이 대조 결과·정정 모음 | §11.1 |
| [데이터] [plaza_3d §3.1](../shell/plaza_3d.md) | 이동 규칙 — `actor::ComActor`·ActorParam [판독: mg0912.md §4.6·§6, §3.5] | §4.2, 6.2 |
| [데이터] [plaza_3d §3.3](../shell/plaza_3d.md) | 따라가기(로컬 2~4P) — `ComFollowPlayer::ReceiveMessageImpl` @0x710003fec0 [판독] | §8.2 |
| [데이터] [plaza_3d §3.5](../shell/plaza_3d.md) | B 갈래 판독 결과 — 1번 플레이어 이동·추종 카메라 (2026-10-08, plaza-B) | §4.2, 7, 8.2, 9.4 |
| [데이터] [plaza_3d §6.10](../shell/plaza_3d.md) | C 갈래 판독 결과 — NPC·따라가기·상호작용·기구 출발 (plaza-C, 2026-10-08) | §8.2 |
| [데이터] [plaza_3d §7](../shell/plaza_3d.md) | 미확정 | §11.3 |
| [데이터] [mg0122 §3.4](../minigame/mg0122.md) | 플레이어 한 라운드 [판독 `Player::Notify @0x7100055c8c`] | §8.4 |
| [데이터] [mg0122 §3.5](../minigame/mg0122.md) | 프레임 실행 순서 [판독] | §3.2 |
| [데이터] [mg0122 §6.1](../minigame/mg0122.md) | 카메라 조작 [판독 `Player::PhoneControl`, `PlayerControl @0x7100056a0c`, `Camera::CameraMove2 @0x710001b1c8`] | §6.5, 8.4 |
| [데이터] [mg0122 §6.10](../minigame/mg0122.md) | 입력 어댑터 [판독] | §4.3, 6.5 |
| [데이터] [mg0122 §7.1](../minigame/mg0122.md) | 모션 길이·완료 [데이터 + 판독] | §7 |
| [데이터] [mg0122 §7.3](../minigame/mg0122.md) | 게임 전용 FTRG 연결 [판독·데이터] | §7 |
| [데이터] [mg0101 §3.1](../minigame/mg0101.md) | 클래스 구성 [판독] | §3.1, 8.4 |
| [데이터] [mg0101 §3.5](../minigame/mg0101.md) | 본편 (`Scene::MainProc @0x7100023860`) — 한 프레임 [판독] | §3.2, 8.4 |
| [데이터] [mg0101 §3.6](../minigame/mg0101.md) | 컴포넌트 틱 [판독] | §3.2 |
| [데이터] [mg0101 §4.4](../minigame/mg0101.md) | MapMgr [판독 ctor @0x710000e830 외] | §8.1, 8.4 |
| [데이터] [mg0101 §5.1](../minigame/mg0101.md) | 플레이어 [판독 `ComPlayer::ReceiveMessageImpl @0x710000be20`] | §5.1, 8.4 |
| [데이터] [mg0101 §6.5](../minigame/mg0101.md) | 플레이어 이동·충돌 — 엔진(PhysX)에 맡긴 부분 [판독] | §3.1, 4.2, 8.4 |
| [데이터] [mg0101 §6.9](../minigame/mg0101.md) | CPU (`ComPlayer::StepAI`, `ComAI`, `ComNaviGrid`) [판독] | §6.6, 8.3 |
| [데이터] [mg0101 §9.5](../minigame/mg0101.md) | 웹 환경 때문에 바꿀 부분 | §9.4, 11.3 |
| [데이터] [mg0107 §3.1](../minigame/mg0107.md) | 클래스 구성 [판독] | §8.4 |
| [데이터] [mg0107 §3.2](../minigame/mg0107.md) | 준비 [판독] | §3.1, 8.4 |
| [데이터] [mg0107 §4.6](../minigame/mg0107.md) | Player·ComPlayer·ComAI [판독] | §4.1, 8.3 |
| [데이터] [mg0107 §6.4](../minigame/mg0107.md) | 낙하 [판독 `StartFall`, `SandwitchManager::Update @0x71000122d0`, `Interpolation::Update`] | §8.4 |
| [데이터] [mg0107 §6.5](../minigame/mg0107.md) | 깔림 판정 [판독 공격 콜백 `FUN_7100017730`, `ComPlayer::DamageCheck @0x710000bcf0`, `GetUnderSandwitchPositionY @0x71000149f0`] | §8.4 |
| [데이터] [mg0107 §6.6](../minigame/mg0107.md) | 이동·점프 (엔진 위임) | §6.4, 8.4, 11.3 |
| [데이터] [mg0107 §6.7](../minigame/mg0107.md) | COM [판독 `ComAI::*` @0x7100004704~0x7100006c3c, 디스어셈블] | §6.6, 8.3 |
| [데이터] [mg0107 §9.5](../minigame/mg0107.md) | 웹 환경 때문에 바꾸는 부분 | §9.4, 11.3 |
| [데이터] [mg0106 §3.1](../minigame/mg0106.md) | 구성 [판독] | §8.4 |
| [데이터] [mg0106 §3.2](../minigame/mg0106.md) | 한 프레임의 고유 순서 [판독] | §3.2, 8.4 |
| [데이터] [mg0106 §4.2](../minigame/mg0106.md) | 게임 상수 [판독·데이터] | §4.2, 11.3 |
| [데이터] [mg0106 §6.1](../minigame/mg0106.md) | 회전판 [판독 `UpdateRotate @0x710000f230`, `UpdatePlayer @0x710001c8c0`] | §8.2, 10 |
| [데이터] [mg0106 §11](../minigame/mg0106.md) | 미확정 사항과 추가 분석에 필요한 근거 | §11.3 |
| [데이터] [mg0118 §4.2](../minigame/mg0118.md) | Player 필드 (기준 객체 `mg0118::Player`) [판독 `Player::Player @0x7100014750` 외] | §4.1, 8.4 |
| [데이터] [mg0118 §6.2](../minigame/mg0118.md) | 6축 센서 공용 (main actor) [판독 `mgA_main_sixaxis*.c`] | §8.5, 10 |
| [데이터] [mg0118 §6.7](../minigame/mg0118.md) | 허들 [판독 `OnHurdling @0x7100018844`(디스어셈블), `JumpHurdle @0x710001ae9c`, `CheckHittingHurdleAndMove @0x710001affc`] | §6.4, 8.4 |
| [데이터] [mg0118 §6.8](../minigame/mg0118.md) | 허들 배치·충돌 [판독 `ReorderHurdles @0x7100008110`(디스어셈블), `CreateHurdleCollision @0x710000a9bc`, 람다 `@0x710000d060`, `HurdleState::SetFallen/Proc`] | §8.4 |
| [데이터] [mg0118 §10.3](../minigame/mg0118.md) | 입력 검출기·순위 (재구현 계산) | §10 |
| [데이터] [mg0118 §11](../minigame/mg0118.md) | 미확정 사항과 추가 분석에 필요한 근거 | §11.3 |
| [데이터] [mg0119 §3.1](../minigame/mg0119.md) | 클래스 구성 [판독] | §8.5 |
| [데이터] [mg0119 §4.5](../minigame/mg0119.md) | ComBallCollision (mg0119) [판독 ctor `@0x7100007e44`, 메시지 `@0x7100008280`] | §8.5 |
| [데이터] [mg0119 §6.1](../minigame/mg0119.md) | 입력 → 판 회전 [판독] | §8.5 |
| [데이터] [mg0119 §6.2](../minigame/mg0119.md) | 흔들기(점프) [판독 `SixAxisSensorInput` ctor `@0x710000b21c`] | §8.5, 10 |
| [데이터] [mg0119 §9.1](../minigame/mg0119.md) | 모듈 | §9.1 |
| [데이터] [mg0119 §10](../minigame/mg0119.md) | 검증 코드·실행 결과·기대값 | §10 |
| [데이터] [mg1002 §3.1](../minigame/mg1002.md) | 클래스 구성 [판독] | §8.5 |
| [데이터] [mg1002 §3.2](../minigame/mg1002.md) | 준비 (장면 수명) [판독] | §8.5 |
| [데이터] [mg1002 §3.4](../minigame/mg1002.md) | 단계 함수 [판독] | §7 |
| [데이터] [mg1002 §4.1](../minigame/mg1002.md) | Scene::Params [판독 `Params::getPropertyList @0x7100017fa8`, 기본값 `Params::createInstance @0x7100018170`, 재구현 `web/tools/analysis/mgD_params.py`] | §8.5 |
| [데이터] [mg1002 §4.4](../minigame/mg1002.md) | ComBallCollision [판독 생성자 `@0x7100003600`, 메시지 `@0x7100003ad0`] | §8.5 |
| [데이터] [mg1002 §4.6](../minigame/mg1002.md) | Map / MapModel / MapCollision [판독] | §8.5 |
| [데이터] [mg1002 §6.1](../minigame/mg1002.md) | Joy-Con 자세 → 판 회전 `SixAxisSensorInput::GetQuaternion @0x710000a680` [판독, 재구현 계산] | §8.5, 10 |
| [데이터] [mg1002 §6.2](../minigame/mg1002.md) | 판 회전과 중력 `Map::SetRotation @0x71000136bc` [판독, 재구현 계산] | §8.5 |
| [데이터] [mg1002 §9.1](../minigame/mg1002.md) | 모듈 | §9.1 |
| [데이터] [mg1002 §11](../minigame/mg1002.md) | 미확정 사항과 추가 분석에 필요한 근거 | §11.3 |
| [데이터] [mg0911 §3.2](../minigame/mg0911.md) | 매 프레임 [판독, 부분] | §8.4 |
| [데이터] [mg0911 §4.3](../minigame/mg0911.md) | BallBase 필드 [판독] | §8.5 |
| [데이터] [mg0911 §4.4](../minigame/mg0911.md) | Player [판독] | §6.6, 8.3 |
| [데이터] [mg0911 §6.1](../minigame/mg0911.md) | 입력 [판독 `Player::GameMainUpdate @0x7100063d7c`] | §6.5, 8.4 |
| [데이터] [mg0911 §6.4](../minigame/mg0911.md) | 점수 [판독: `Player::AddScore @0x7100063530`, 충돌·센서 처리 함수들] | §8.5 |
| [데이터] [mg0911 §8](../minigame/mg0911.md) | 다른 기능과의 상호작용 | §8.5 |
| [데이터] [mg0911 §9.2](../minigame/mg0911.md) | 웹 물리 (PhysX 대체) | §8.5 |
| [데이터] [mg0508 §5.1](../minigame/mg0508.md) | 라운드 한 번 [판독] | §8.4 |
| [데이터] [mg0508 §6.7](../minigame/mg0508.md) | 이동·입력 [판독 `Player::update @0x710000da00`, 디스어셈블] | §8.4 |
| [데이터] [mg0508 §7](../minigame/mg0508.md) | 애니메이션·이펙트·소리·카메라·에셋 연결 | §7, 8.4 |
| [데이터] [mg0508 §9.6](../minigame/mg0508.md) | 웹 환경 때문에 바꾸는 부분 | §9.4, 11.3 |
| [데이터] [mg0508 §11](../minigame/mg0508.md) | 미확정 사항과 추가 분석에 필요한 근거 | §11.3 |
| [데이터] [11_moving_collision §3.4](11_moving_collision.md) | 캐릭터 크기와 스케일 [판독·데이터] | §4.5 |
| [데이터] [11_moving_collision §4.1](11_moving_collision.md) | Map과 Actor 접촉의 공통점·차이 | §8.1 |
| [데이터] [11_moving_collision §4.2](11_moving_collision.md) | 접지 법선·groundedLimit·최종 위치 | §6.7, 8.1 |
| [데이터] [11_moving_collision §4.3](11_moving_collision.md) | 기본 작업 순서와 carry | §3.4, 8.2 |
| [데이터] [11_moving_collision §7](11_moving_collision.md) | 검증 사례와 남은 미확정 | §11.3, 13 |
| [데이터] [11_moving_collision §9](11_moving_collision.md) | 웹 런타임 계약 (2026-10-09, P0 질의) | §8.1, 9.2, 10, 11.1 |
| [데이터] [09_character §4.3](09_character.md) | actor::MotionArg (0x50 B) [판독] | §7 |
| [데이터] [09_character §4.4](09_character.md) | actor::ActorAnimationSlot (0x170 B) [판독] | §7 |
| [데이터] [09_character §4.8](09_character.md) | 이동·충돌·배치의 기존 판독 재사용 | §4.2, 8.4 |
| [데이터] [09_character §14](09_character.md) | 웹 런타임 계약 (2026-10-09, [character-runtime]) | §7, 9.1 |
| [데이터] [01_core §3.3](01_core.md) | 타이밍 안의 순서 [판독] | §3.2 |
| [데이터] [01_core §3.4](01_core.md) | 한 프레임 안의 게임 코드 순서 (미니게임) [판독] | §3.2 |
| [데이터] [01_core §5.4](01_core.md) | 파이버 수명 [판독] | §3.2 |
| [데이터] [01_core §6.3](01_core.md) | MainModule 프레임 시작 `FUN_710019581c` (vt+0x60) [판독] | §3.2 |
| [데이터] [01_core §6.4](01_core.md) | 파이버 한 프레임 (시퀀스마다 `FUN_710018f400`) [판독] | §3.2 |
| [데이터] [01_core §9.5](01_core.md) | 한 step 순서 (core/frame.ts 권장) | §9.4 |
| [데이터] [01_core §9.7](01_core.md) | 엔티티·컴포넌트 모델 옮기기 | §3.1, 9.1 |
| [데이터] [06_scene_data §1.3](06_scene_data.md) | 경로 문자열 → 파일 해석 [판독 + 데이터] | §2, 8.6 |
| [데이터] [06_scene_data §2.6](06_scene_data.md) | 그 밖의 캐릭터 관련 공용 데이터 [데이터] | §4.2, 8.6 |
| [데이터] [06_scene_data §3.1](06_scene_data.md) | 로딩 [판독] | §8.6 |
| [데이터] [06_scene_data §9](06_scene_data.md) | 미확정 사항 | §11.1, 11.3 |
| [데이터] [12_online_sync §3.4](12_online_sync.md) | 광장 이동 전송과 게임 입력의 경계 [판독] | §8.3 |
| [데이터] [common_system_audit §2](common_system_audit.md) | 시간·난수·입력·이동·물리 | §9.4, 11.1, 13 |
| [데이터] [mgmet_3d §7](../shell/mgmet_3d.md) | 구현 막힘 요소 (2026-10-08 추가 조사) | §8.2, 11.1 |
| [데이터] [mgmet_3d §9.1](../shell/mgmet_3d.md) | 짧은 판독 5건 | §8.2 |
| [데이터] [mgmet_3d §10.5](../shell/mgmet_3d.md) | 정정 근거 — 항구의 플레이어 직접 조작 [판독: 어셈블리] | §8.2, 11.1 |
| [데이터] [minigame_result §6.8](../shell/minigame_result.md) | 모션 선택·시선 블렌드·갱신 순서 | §7, 3.2 |

## 부록 B. 통합 단계의 추가 C 판독 목록

[판독] 아래는 기존 문서의 완료 판독을 옮긴 목록과 구분한 신규 보완이다. 5개 기존 C 파일을 사용했다. 새 C·도구 파일·어셈블리 산출물은 만들지 않았다.

| 허용 빈 영역 | 새로 확인한 주소·범위 | 기존 디컴파일 파일 | 본문 |
|---|---|---|---|
| 일반 액션·조건 | [판독] main `@0x710000eb1c/@0x7100012044/@0x7100012084/@0x71000133f8/@0x7100018df0/@0x7100018f54`, `@0x710000e0dc`, `@0x7100013084/@0x710001316c/@0x7100013898/@0x7100014ec8/@0x7100014ed0/@0x7100014ed8/@0x710000a368/@0x710000a380/@0x710000a640/@0x710000a8b0`. callback 동기 호출·actorType 제거·조건 handle 교체를 보완했다. 공용 Fall/Landing `@0x7100030528/@0x7100030728`은 일반 액션 공백에 한정했다. | [mgB_main_actor.c](../../../analysis/decomp/mgB_main_actor.c) | §5.1·5.2 |
| 추가 속도 슬롯 | [판독] main `@0x7100014dc0/@0x710003a3a0/@0x7100039e60/@0x7100039e6c`: map 교체·generation·Reset/SetValue. `@0x710003a090`: callback dt·snapshot·f32 합. | [actor C](../../../analysis/decomp/mgB_main_actor.c), [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c) | §6.8 |
| 추가 변위 소비·가변 중력 | [판독] main `@0x710000f230`의 extra slot 소비 부분, `@0x710000f0f8/@0x7100007be0`의 world 조회/항목 합. [미확정] 정상화·반환값 손실은 확정하지 않았다. | [actortick C](../../../analysis/decomp/mgB_main_actortick.c), [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c) | §3.3·6.1·6.8 |
| actor 갱신 순서 | [판독] main `@0x710000ecd0` 입력 gate·fall 선행 내적·현재 action→적분→선회. `@0x7100008c0c` 활성/suspend gate를 보완했다. 이미 있던 적분·회전 전체는 재판독하지 않았다. | [actortick C](../../../analysis/decomp/mgB_main_actortick.c), [ground3 C](../../../analysis/decomp/mgB_main_actorground3.c) | §3.3 |
| Pad 우선순위·CPU 소비 수명 | [판독] main `@0x710001e54c/@0x710001eac4`의 disabled→override→일반 style 우선순위·overlay 공통 문턱·getter 무변경을 보완했다. style 표는 기존 mg0122를 재사용했다. [미확정] 통합 단계 당시 setter/자동 clear C가 미확보였다. 후속 setter 보완은 부록 C·§6.6이다. | [mgB_main_pad.c](../../../analysis/decomp/mgB_main_pad.c) | §4.3·6.5·6.6 |

[데이터] 부록 A의 원문과 본문의 직접 근거 링크가 분석 주소↔파일 추적을 제공한다. 완료 판독의 이전 디컴파일/어셈블리 출처는 각 원문에 보존되어 있다.
## 부록 C. 후속 미확정 보완의 주소·파일 목록

[데이터] 제공된 C1은 21개 함수다. C2는 1개 함수다. 아래 C1 표의 Ray/Shape All·Entity 수신 3개는 기존 판독 재사용이다. 나머지 18개와 C2의 1개는 공백을 보완했다. 이 작업에서 C·도구 파일이나 INDEX를 새로 작성하지 않았다.

| 주소·함수 | 파일 | 처리·반영 위치 |
|---|---|---|
| main `@0x7100007d20` factory | [gap C1](../../../analysis/decomp/actor_gap_c1.c) | [판독] abc0 위임을 확인. §5.2·11.3 |
| main `@0x7100008b8c` pre wrapper | 같은 C1 | [판독] 활성/suspend gate→ea68. §3.3 |
| main `@0x710001e854/@0x710001e878/@0x710001e894/@0x710001e8b0/@0x710001ec50` | 같은 C1 | [판독] SetOverlayEnabled/Hold/Trigger/Release/Stick 저장. §4.3·6.6 |
| main `@0x710002d214` | 같은 C1 | [판독] provider 검사·virtual30 호출. 반환 ABI 미확정 유지. §6.8·11.3 |
| main `@0x7100039e80/@0x7100039ed0` | 같은 C1 | [판독] VelocitySlot ctor callback 없음·SetStepFunction 복사. §6.8 |
| main `@0x71002b9bc0` | 같은 C1 | [판독] ActorParam float 로딩·특정 행 /60. §4.2 |
| main `@0x7100625110/@0x7100625480` | 같은 C1 | [판독] 기존 Ray/Shape All 완료 판독 재사용. §8.1·9.2; [11 §9.6](11_moving_collision.md) |
| main `@0x7100899450` | 같은 C1 | [판독] 기존 Entity 배열·message mask 판독 재사용. §3.2; [01 §9.7](01_core.md), [mg0101 §3.6](../minigame/mg0101.md) |
| main `@0x710001e520/@0x710001e52c/@0x710001e53c/@0x710001e544` | 같은 C1 | [판독] SetPlayerID/Enable/Style/PadMask. §4.3·6.6 |
| main `@0x710001ec6c/@0x710001edbc/@0x710001f16c` | 같은 C1 | [판독] SetMoveKey/ActionTest/PadStickOverride. §4.3·6.5 |
| main `@0x7100014564` | [gap C2](../../../analysis/decomp/actor_gap_c2.c) | [판독] identity 16 B 복사. §6.7·11.1 |

[판독] 아래는 제공 두 파일 외에 기존 C·데이터에서 공백을 채운 연결이다. 기존 문서의 완료 판독은 해당 출처로 인용하고 같은 함수 전체를 다시 판독한 결과로 세지 않는다.

| 추가 확인 범위·주소 | 기존 파일·자료 | 본문 |
|---|---|---|
| ctor 빈 초기값 `@0x710000d2c0`, 해제 본체 `@0x710000dd30` | [actortick C](../../../analysis/decomp/mgB_main_actortick.c) | [판독] §3.4·4.1 |
| 기본 action의 누락 모션/반환 순서 `@0x710003134c` | [actor C](../../../analysis/decomp/mgB_main_actor.c) | [판독] §5.1. bit6은 ground callback 소비가 미확정 |
| condition scheduler `@0x7100009dc0` | [actorground C](../../../analysis/decomp/mgB_main_actorground.c) | [판독] §5.2 |
| JumpCalc 호출 위치·가속·terminal·수평 delta 소비 `@0x710000f230` | [actortick C](../../../analysis/decomp/mgB_main_actortick.c) | [판독] §6.1 |
| 수평 helper의 생략됐던 f32 순서 `@0x7100036dd0` | [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c) | [판독] §6.1 |
| PadLever 각/override·camera 연결 `@0x710001e8b8/@0x7100013500/@0x7100015d28/@0x7100015d84/@0x7100015534` | [actorjump C](../../../analysis/decomp/mgB_main_actorjump.c), [actor C](../../../analysis/decomp/mgB_main_actor.c) | [판독] §6.5 |
| 유효 Dpad 각 상수 `0x71015d3dbc` | [main.decomp.bin](../../../extracted/exefs/main.decomp.bin) | [데이터] 읽기 전용 상수 표. §6.5 |
| Jump arg별 필드·공용 mask, Fall/반사/밀림/Pressed·event `@0x710002fed0/@0x7100014f54/@0x7100014f64/@0x7100014f9c/@0x7100014fd8/@0x71000150e0` | [actor C](../../../analysis/decomp/mgB_main_actor.c), [actortick C](../../../analysis/decomp/mgB_main_actortick.c) | [판독] §5.1·8.1 |
| AA의 비어 있던 Y/ground/vy 분기 `@0x710002a054/@0x710002a650` | [actorcoord C](../../../analysis/decomp/mgB_main_actorcoord.c) | [판독] §8.1. 손상 수학은 미확정 유지 |
| AA Y helper `@0x710002a4c0` | [runtime core C](../../../analysis/decomp/runtime_A_collision_core.c) | [판독] §8.1 |
| ActorParam 미확보 소비 필드 `@0x71002b2e00` | [runtime reuse C](../../../analysis/decomp/runtime_A_collision_reuse.c) | [판독] §4.2. getter→행은 미확정 유지 |
| mg0508 attachment target `@0x710000bc50` | [mgC_mg0508_game.c](../../../analysis/decomp/mgC_mg0508_game.c) | [판독] §8.4·11.3 |
| mg0118 HurdleHit 일부 인자·callback `@0x7100014a40/@0x710000d060` | [mg0118_game_only.c](../../../analysis/decomp/mg0118_game_only.c) | [판독] §8.4·11.3 |
| mgmet 생성자 두 기록 `@0x71000424d0/@0x7100042650` | [mgmet 함수 목록](../../../analysis/functions/mgmet.nro.tsv), [mgmet map player C](../../../analysis/decomp/mgmet_3d_map_player.c), [기존 명령 기록](../../../analysis/decomp/mgmet_3d_dis.c) | [판독] [데이터] §8.2·11.1. 새 어셈블리 판독 없이 기존 기록 재사용 |
| mg0119 Sum abs(y) `@0x7100040cc0/@0x71000415e4` | [mg0118 §6.2](../minigame/mg0118.md), [mg0119 §6.2](../minigame/mg0119.md) | [판독] 기존 공용 센서 판독 재사용. §8.5·11.1 |

[미확정] 추가 디컴파일·원본 실행 근거가 필요한 목록은 §11.3에 있다. 제공 C의 타입 손실을 정상 코드처럼 복원하거나 미확정 항목을 0으로 채우지 않았다.
