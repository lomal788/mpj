# 12. 미니게임 진행 중 온라인 동기화

2026-10-08 작성, 2026-10-09 이동·SDK 후속 보완. 확정 범례: **[판독]** 원본 코드·명령·호출 주소 확인, **[데이터]** 원본 바이너리 배치 확인, **[웹]** 현재 TypeScript 확인, **[설계]** 웹 구현 제안, **[미확정]** 추가 근거 필요. 원본 실행·실제 네트워크 접속은 하지 않았다. 주소는 별도 모듈 표기가 없으면 US v0 **main NSO**, 베이스 `0x7100000000`이다.

## 1. 범위와 결론

[방·대기실](../shell/online.md)의 완료 결론을 전제로 **게임 시작 준비 이후의 동기 입력·진행·종료**를 보완한다. 사용자 보고인 광장 원격 위치 불일치는 §3.4·6.2에서 이동 데이터 경로만 추가로 다룬다. 기존 [코어](01_core.md) §3·5·6.6~6.7의 프레임 순서·난수 알고리즘, [입력](05_ui_input.md)·[웹 입력](input_web.md)의 버튼·자이로 의미, [미니게임 씬](../shell/minigame_scene.md)의 단계표는 그대로 참조한다.

- **[판독] 입력을 프레임 버퍼로 교환한다.** SDK는 버튼·스틱·터치·SixAxis 채널 `0~5`와 플레이어 사용자 데이터 채널 `8~15`를 별도로 처리한다. `0x78 B` 사용자 레코드를 컨트롤러 입력 패킷으로 해석하면 안 된다.
- **[판독] SDK 진행은 입력 가용 범위로 제한된다.** 현재 프레임 `F`에 지연 `D`를 더한 프레임에 로컬 입력을 넣고, 진행 가능 범위가 부족하면 `0x4c2c`로 멈춘다. 확인한 계약은 아래 필드·조건으로 표현한다. 전체 구조를 lockstep/rollback/상태복제 중 하나로 단정할 근거는 아직 부족하다.
- **[판독] seed 배포자·씬 데이터 배포자·입력 소유자는 서로 다른 역할이다.** 세션 호스트를 모든 점수·판정의 단일 권한자로 보는 분기는 대표 게임의 판정/결과 호출부에서 확인되지 않았다.
- **[웹] 광장 수신 목표와 표시 좌표는 별개다.** `RemoteActor`는 마지막 수신 pos/quat·수명만 보관하고 패킷마다 목표를 전달한다. 표시 actor의 `RemoteMotion`이 표시 위치 기준 5/1 m 분기와 `AutoInterpolation` 하나를 소유한다. 수정 전 이중 보간은 §6.2의 과거 원인 후보로 구분했다. 정지 최종 좌표 미전송·1 m 회전 전용 분기·로컬 충돌/접지 차이는 현재도 남으며, 구현·시험은 §6.2.1을 따른다.
- **[웹] 현재 미니게임은 로컬 실행이다.** 서버와 `wire.ts`에는 게임 중 입력·seed·배리어·결과 합의 메시지가 없다. 기존 광장 동기화 완료가 게임 동기화 완료를 뜻하지 않는다.

근거 자료는 `C:\dev\mpj\extracted\exefs\main.decomp.bin`, `analysis/functions/main.nso.tsv`, 기존 `analysis/decomp/core_b*.c`와 대표 NRO 디컴파일이다. 누락된 함수는 복제한 임시 Ghidra 프로젝트의 `-noanalysis -readOnly` 판독과 ARM64 직접 분기·vtable 대조로 확인했다. 원본 프로젝트·웹 구현은 수정하지 않았다.

## 2. 계층·소유권·초기 배리어

### 2.1 공통 호출 계약 [판독]

```text
bq::MinigameScene::BeginScene @0x71002df258
  → NetTransferSceneBegin::StartSync @0x7100218cd0 → IsSynced @0x71002197bc
NetworkGameScene 동기 준비 @0x71001c94cc
  → seed 조회 @0x710013c894 → 내부 @0x7100161d4c
  → StartSync @0x710013c9f8 → @0x71001bceac → Fiber @0x71001bda20
  → SDK @0x710050d510 → @0x710050e9dc → Pia @0x7101024760
  → OnSyncStart / pause 해제 → OnStartUpdate → 게임별 SyncedSetupGame
진행
  → SDK @0x710050f0d4 → 입력 수신 @0x710050f260 → 송신 @0x710050f750
  → bex 사용자 레코드 갱신 @0x7100152650 → InputModule 동기 컨트롤러 조회
  → 게임별 입력·충돌·판정 → OnGameMain → OnEndingInit
```

이 화살표는 계층별 연결이며 SDK 훅과 씬 스텝의 전역 실행 순서를 새로 정의하지 않는다. 전역 순서는 코어 문서를 따른다.

| 역할/식별자 | 원본 계약·근거 |
|---|---|
| station 식별 | `u64 + u16` 쌍. `PlayerInfo` stride `0x50`: `+0x00 station`, `+0x08 secondary`, `+0x11 slot:u8`. 내부 벡터 `+0x238..0x240` |
| 게임 PlayerID 매핑 | stride `0x20`: `+0x00 PlayerID:u32`, `+0x08 station:u64`, `+0x10 secondary:u16`, `+0x18 slot:u8`; 벡터 `+0x268..0x270` |
| 입력 소유자 | `SetupOnlineControllerAssign @0x710013c440 → 0x71001bcfd0`가 모니터와 세션 플레이어를 연결. `0x71001115dc`는 station 쌍이 내 station과 같을 때만 로컬 HID를 SDK에 할당한다. `IsLocal @0x7100191790`와 모니터 `+0x50`은 로컬 여부 |
| 게임에서 읽는 컨트롤러 | 모니터 갱신 `0x7100111470`: 동기화 중 station/slot → `0x710050d3c0 → 0x710050debc → 0x710050e858 → listener vt+0x78 (0x7100509d30)`의 동기 프록시. 로컬 원시 HID는 별도 핸들에 유지 |
| 세션 호스트 | `IsHost @0x710013c3c0`, `GetHostStationId @0x710013c830`. 참가자 입력 소유권과 같지 않다 |
| seed 동기 호스트 | 내부 `+0x11f0:u64/+0x11f8:u16`; 지정이 Invalid면 세션 호스트 사용(`0x7100162210`). 지정 station이 내 station이면 seed 생성·전송 |
| 씬 데이터 동기 호스트 | `NetTransferSceneBegin::StartSync`는 `WorkModule::IsSyncHost` 또는 명시한 동기 소스 station을 사용. 일반 세션 호스트 분기로 치환하지 않는다 |

### 2.2 시작 허용 조건 [판독]

| 배리어 | 실제 교환·대기 조건 |
|---|---|
| 씬 데이터 | 참가 station ≥2일 때 데이터 동기 호스트가 NetTransfer tag `0~4`로 Work blob(`0x710029eac8`), PlayerWork 직렬화(`0x7100220e20`), `0x71002193d0/0x71002304f0/0x71001d04d8`의 blob을 보낸다. 뒤 세 blob의 필드 전체는 미확정 |
| 참가자 준비 | `0x7100219590`의 별도 helper 전송(tag `0/1`, 씬 데이터 transfer와 다른 객체), `IsSynced`의 `this+0x7d/+0x7e`, helper `+0x3a/+0x3b`, 세션에 대응하는 PlayerID별 `+0x3c+id` 확인이 모두 필요. 단순한 호스트의 로드 완료만으로 시작하지 않는다 |
| seed | `0x7100162210`가 reset `0` 후 async `Rand()`에서 얻은 `u32`를 FIFO와 NetTransfer에 넣는다. 전송 수신 확인·재동기 대기 상태가 해소되어야 정상 seed 조회가 성공한다(§4) |
| SDK start | 로컬 slot mask와 사용자 레코드를 미리 공급하고 `0x710050d510` 호출. Fiber가 SDK sync state `2`를 기다린다. 세션 상태 `6` 이탈·SDK 오류·시작 제한시간 초과는 실패 `0xf`, 오류 처리 중 분기는 `0x11`; 성공 상태 `4` (`0x71001bda20`) |
| 씬 release | `0x71001c94cc`가 start/stop Fiber 완료와 동기 상태를 확인해 `OnSyncStart` 또는 `OnSyncFail`; sync pause 기본 단계 `4` 해제 후 기존 씬 pause 기본 `5` 복원. 이후 actor seed 설정·SyncedSetup 순서는 코어 §6.7 참조 |

주의할 분기는 `0x71001c94cc`의 seed 조회 실패다. 성공할 때만 `SetSyncRandSeed`를 호출하지만 해당 phase는 실패해도 다음으로 이동한다. 따라서 이 함수 하나를 근거로 “모든 시작은 새 seed 수신까지 무한 대기”라고 구현할 수 없다. seed 준비를 보장하는 상위 호출 조건은 추가 확인 대상이다.

## 3. 게임 중 실제 데이터와 타이밍

### 3.1 SDK 컨트롤러 채널 [판독·데이터]

sync listener vtable `0x71019f9190`: `+0x38=0x7100508db0`(송신 불가 시 수집), `+0x40=0x7100508ed0`(송신), `+0x48=0x7100509760`(수신), `+0x78=0x7100509d30`(station/slot 프록시 조회). 송신은 `0x7101022d30`, 수신은 `0x71010233e0`으로 같은 채널 번호를 넘긴다.

| 채널 | 직렬화하는 내용 | 판독한 배치 |
|---|---|---|
| `0` | 각 컨트롤러의 버튼 hold와 타입 바이트 | slot stride `5 B`: `+0 hold:u32`, `+4 GameController+0x10`의 하위 바이트. down/up의 개별 전송은 이 함수에서 확인되지 않음 |
| `1` | L/R 스틱 X/Y | slot stride `8 B`: 네 `i16`, 오프셋 `0/2/4/6`. `q=clamp(trunc(x*32767),-32768,32767)` |
| `2` | 터치 헤더 | 선두 `u64`, 뒤 `count:i32`; count는 설정 touch count로 제한 |
| `3` | 터치 항목 | stride `0x18`: 선두 `u64`, `+8 id:i32`, `+0xc/+0xe/+0x10/+0x12/+0x14`의 `u16` 값. 값별 HID 의미는 미확정 |
| `4` | 각 컨트롤러 SixAxis 항목 수 | slot당 `u8`; 수신 시 설정 sensor count로 제한 |
| `5` | SixAxis 샘플 | `(slot*configuredSensorCount + sensor)`마다 stride `0x50`; 앞 `0x24`는 세 float3 호출 결과, 뒤 행렬/샘플 값과 `+0x48` flags bit0. Ghidra가 SIMD 반환 float3 일부를 잘못 표현하므로 각 물리량·행렬 필드명은 기존 입력 문서와 추가 명령 대조 필요 |

채널별 실제 복사 길이는 시작 시 등록한 `u16 size[channel]`를 사용한다. 표의 stride와 채널 번호를 IP/UDP 패킷 전체 길이·헤더로 해석하지 않는다. `0x7100509760`은 수신값을 `0x710050b6cc`에 넘겨 동기 GameController에 적용하며, 읽기 실패 `0x2c09`는 별도 취급한다. 동기 프록시의 down/up 생성식은 이번 경로에서 확정하지 않았다.

송신 flags low4의 역할은 `bit0 버튼`, `bit1 스틱`, `bit2 터치`, `bit3 SixAxis`다. 해당 비트가 켜지면 이 송신 함수에서 그 종류의 새 HID 수집을 생략하고, 수신 쪽에는 대응 종류의 이전 데이터 보존 분기가 있다(`0x7100508ed0/0x7100509760`, 채널 mask 변환 `0x7100508d0c`). flags의 게임별 선택은 추가 확인 대상이다.

**송신 불가 중의 짧은 입력 보존:** `0x710050f750`가 listener `+0x38`을 호출하면 `0x7100508db0`은 활성화(`listener+0x7c`)·버튼 수집 허용 때 로컬 hold를 slot별 `8 B` accumulator에 OR한다. 다음 허용 송신 `0x7100508ed0`이 현재 hold와 합쳐 내보낸 뒤 accumulator를 비운다. 따라서 그 기간의 버튼을 단순히 마지막 HID 샘플로 덮어쓰지 않는다. 동일한 누적 보존을 스틱·SixAxis에도 적용한다고 일반화할 근거는 없다.

### 3.2 bex 사용자 데이터 채널 `8+slot` [판독]

내부 `+0x1180..0x1188` 송신 벡터와 `+0x1198..0x11a0` 수신 벡터는 **세션 PlayerInfo마다 `0x78 B`**다. SDK의 `8~15` 채널은 최대 8개 로컬 slot에 해당한다(`0x710050f750`).

| 레코드 offset | 타입/크기 | 의미·쓰기/읽기 |
|---|---|---|
| `+0x00` | `u8` | 사용자 payload 길이, 수신 허용 `≤0x3c` |
| `+0x01` | `u8` | 초기 `0xff`; 의미 미확정 |
| `+0x02` | `u8` | 송신 버퍼 dirty. 데이터 쓰기·로컬 프레임 갱신에서 `1`, SDK 공급 직전 `0` |
| `+0x03` | `1 B` | 의미 미확정 |
| `+0x04` | `u32` | SDK 현재 프레임값. 이 레코드 자체의 프레임과 SDK가 저장하는 미래 입력 프레임 `F+D`를 구분 |
| `+0x08..0x37` | `0x30 B` | 이번 경로에서 필드 의미·생산자 미확정; 버튼·스틱으로 명명하지 않음 |
| `+0x38..0x73` | `0x3c B` | 게임/상위 코드가 제공하는 opaque 사용자 payload |
| `+0x74..0x77` | `4 B` | 전체 복사에 포함; 의미 미확정 |

`SetUserData @0x710013ca20 → 0x71001bd460(slot,p,size)`는 **내 station 쌍+slot**에만 쓰고 길이·payload·dirty를 갱신한다. setter 안에는 `size≤60` 검사 없이 memcpy가 있으므로 호출자는 이를 지켜야 한다. 수신 `0x7100152650`은 길이 `>60`을 abort한다. `0x71001bd280` 초기화는 첫 `u64=0xff00`, payload 60 B zero이며 중간 영역 전체 zero를 보장하지 않는다.

진행 갱신 `0x7100152650`의 송수신 활성 조건은 SDK 사용 가능·오류 처리 아님, start Fiber `+0x1290=0`, stop Fiber `+0x1298=0`, sync state `+0x2a0=2`다. 로컬 소유 레코드에 SDK frame을 넣고 dirty를 켠다. SDK ready(`0x710050d41c`)이며 dirty일 때 `0x710050d434 → 0x710050e89c`로 slot 버퍼에 공급한다. 수신 성공 station은 `0x710050d464 → 0x710050e8ec`에서 버퍼를 얻어 **0x78 B 전체**를 복사한다.

받은 레코드의 최댓값을 `M=max(frame_i)`로 잡고, 참가자별 bitmap `+0x11b0`은 `valid_i=(frame_i≥M)`로 갱신한다. `GetUserData @0x710013ca28 → 0x71001bd590`은 station/slot 매핑과 이 bit가 맞을 때만 `(payload+0x38,length)`를 반환하고, 아니면 `(null,0)`이다. `PlayerID`별 유효성 `0x710013ca5c → 0x71001bd660`도 같은 bitmap을 읽는다. 입력 유효성 경로 `0x7100110858`은 network adapter가 있고 동기화 중일 때 이 gate를 확인한다. 이 bitmap 자체가 전체 게임 스텝 정지 조건이라는 근거는 없다.

### 3.3 프레임 버퍼·지연·진행 허용 [판독]

| 객체/필드 | 확인한 의미 |
|---|---|
| Pia `+0x3714:u32` | 현재 진행 프레임 `F`, local station mode `2`에서 export `0x7101024e50`; bex 관측 `+0x1208`로 복사 |
| Pia `+0x3718:u32` | 다음 진행 판단에 쓰는 가용 프레임 상한 `H` |
| Pia `+0x370c:u8` | 입력 지연 `D`; local 송신을 `F+D` 위치에 삽입(`0x7101022d30`) |
| Pia `+0x370d:u8` / `+0x3710:u16` / `+0x371c:u32` | 최대 지연 `Lmax` / ring capacity `R=2×Lmax+1` / 현재 ring index `I`. 판독한 Bezel 초기화는 `Lmax=32,R=65`칸/station |
| Pia `+0x3638`, `+0x3648` | station×ring별 채널 수신 bitmask와 payload 저장 영역. 채널 데이터는 등록된 offset/size로 복사 |
| Bezel sync `+0x2a`, `+0x2b` | 이번 갱신 진행 불가 flag / 송신 ready. `+0x44`는 연속 진행 불가 갱신 횟수, bex `+0x120c`로 관측 |

```text
송신 저장 프레임 = F + D
ring slot = wrap(I + (저장 프레임 - F), R)
진행 시: F ← F+1, I ← wrap(I+1,R)
local mode=2 && H-F < 1 → Result 0x4c2c, 이번 SDK 진행 불가
```

근거는 `0x7101022d30/0x710102303c/0x7101023a20`이다. **실제 R 초기화:** `0x710050e0e4`(`@0x710050e140~e144`)가 Pia config `+0x20=0x20`을 기록하고 `0x71010288f4→0x7101028b58→0x710102268c`(`@0x71010226ac~26c0`)가 `1≤Lmax≤32`, `R=2×Lmax+1`로 mask/payload를 할당한다. 따라서 이 경로는 **Lmax32, R65**다.

**시작 제안·협상:** `NetworkGameScene` 생성 `0x71001c7a00`은 `+0x118:u16=0x0a03`, `+0x11a:u8=1`, `+0x11c:f32=30 s(0x41f00000)`을 둔다. StartSync packed low byte3, delay 제안 byte10을 Fiber `0x71001bda20→0x710050e9dc→0x7101024760`에 넘긴다. 제안은 `1..Lmax`만 허용하며 station `+0x18`에 저장한다. 시작은 `F=H=−2−Lmax=−34`(u32 표현 `0xffffffde`), `I=0,D=0`, 하한 `+0x370e=0`이다. `0x71010243d0`은 현재 참가 station의 대응 제안 중 0이 남으면 기다리고, 모두 준비되면 `D=max(station별 제안,+0x370e)`로 정해 초기 `1..D` ring mask를 채운다. **10은 기본 제안이며 실제 협상 D 고정값이 아니다.** 게임별 인자 override는 미확정이다.

**진행 중 지연 변경:** 채널 **16은 delay 제안 1 B**다. `0x710050ede4`가 최대32로 제한한 제안을 `+0x8d`, pending을 `+0x8c`에 두고 ready 송신 `0x710050f750→0x7101023984→0x7101022d30(channel16)`로 공급한다. `0x7101024670`은 station의 현재 frame 제안 최댓값을 `0x71010279c0`에 전달한다. 증가하면 D를 바로 늘리고 새 gap의 mask/payload를 초기화한다. 감소는 `+0x372e=newD,+0x3730=currentF`에 예약해 `0x710102303c/0x7101023a20`의 gate 후 적용한다. 채널16을 점수/결과 checksum으로 해석하지 않는다.

**실제 입력 메시지 본문:** 생성 `0x7101027420`, 판독 `0x71010269f0/0x7101026a90`, 적용 `0x7101026630/0x7101026e7c`.

```text
Pia header (5 B): type:u8=3, baseFrame:u32 BE (=H)
뒤따르는 block: channel:u8, deltaFrame:u8, payloadLen:u16 BE, payload[payloadLen]
targetFrame = baseFrame + deltaFrame
channel=0xff, payloadLen=1: 초기 음수 frame의 delay 특수 block
일반 수신: 0≤targetFrame−F<R, station mask와 등록 채널 길이 검사
          → ring payload 복사, 해당 channel 수신 bit OR
```

생성 버퍼 상한 `0x2000`, 수신 staging `0x5dc`이며 전송 길이는 `0x7100fb166c`의 한도로 더 제한한다. 따라서 이 버퍼 크기를 한 패킷 크기로 정하지 않는다. `0x71010271c0→0x7100fb09fc→0x7100fb4300`은 별도 **9 B transport wrapper**를 붙여 virtual `+0x88/+0x90`으로 송신한다. wrapper는 `+0 type:u8,+1 sequence:u16 BE,+3 인자8:u16 BE,+5 bodyLen:u16 BE,+7 인자7:u16 BE`이며 두 인자의 의미는 미확정이다. wrapper type과 Pia 본문 type은 서로 다른 번호 공간이고, 외부 UDP/IP envelope·전체 ACK/일반 누락 retry 정책은 아직 미확정이다.

`0x710050f0d4`는 `0x4c2c`일 때 ready를 끄고 stall count를 늘린다. `0x710050f750`는 ready일 때만 listener 송신과 사용자 채널 입력을 Pia에 공급한다. **SDK가 F를 진행하지 않는 조건은 확인됐지만**, 그 신호가 CoreSystem의 어떤 훅에서 씬/파이버 전체 실행을 막는지는 미확정이다. 웹에서 `Δt=0`이나 입력 null만 넣는 동작으로 임의 대체하지 않는다. Fixed60 `f32(1/60)=0x3c888889`의 기존 결론은 코어 §1·6.1 참조.

`SetupSyncBaseParam @0x710013c9e8 → 0x71001bce14`의 packed 값은 low32 `TimeoutFrame`, bit40..47 `ControllerCount`, bit48..55 `SixAxisSensorCount`, bit56..63 `TouchCount`다. get 함수 `0x71001bce7c`는 bit32..39에 `8`을 반환한다(이 byte의 의미 미확정). 내부 기본값은 constructor `0x7100150a80`의 `+0x116c=240`, `+0x1170=1`, `+0x1174=0`, `+0x1178=0`; 이것은 **미니게임별 최종 설정값과 다를 수 있다**. listener 설정 `0x7100508c10`은 컨트롤러·센서 각각 최대 `8`, touch 최대 `16`으로 제한한다. SDK `TimeoutFrame`과 start Fiber의 `float timeoutSeconds(+0x24)`는 서로 다른 제한이다.

### 3.4 광장 이동 전송과 게임 입력의 경계 [판독]

완료된 [광장](../shell/plaza_3d.md) §2·3.1~3.3·6.10과 방 문서 §5.5의 최초 전체 송신 시점을 재사용한다. 광장은 **이동 계산 뒤 위치·회전**을 보내고, §3.1 미니게임 SDK는 **frame별 컨트롤러 입력**을 보낸다. 광장 0.2 s를 미니게임 입력 주기로 적용하지 않는다.

| 호출/소유자 | 확인한 이동 계약 |
|---|---|
| `menu00.nro @0x710003fbd0 ComPlayerUtil::ReceiveMessageImpl` | slot `<4`; timer≤0이고 actor 속도 4성분 제곱합 `>0.1`이면 송신 후 timer=0.2 s. timer>0이면 `GetDeltaTime()`만 뺀다. 만료한 같은 호출에서 곧바로 보내지 않으며, 정지 후 마지막 위치·제자리 회전의 별도 송신은 이 함수에 없음 |
| `menu00.nro @0x710003fd64 SendRemotePlayerInfo` | 세션 연결·station≥2·해당 로컬 actor 존재일 때 NetTransfer **tag0, payload 0x50 B**. 명령 `@0x710003fdf8 mov w3,#0x50`, `@0x710003fe04 Send`로 크기 확정. 레코드 `+0x00 station:u64,+0x08 secondary:u16,+0x10 slot:u8,+0x18 chara:u32,+0x20 position:16 B SIMD,+0x30 quaternion:16 B,+0x40 firstSetup:u8(일반 전송0)`; 나머지 영역 의미·초기화 미확정. frame/velocity/input 필드는 이 writer에서 확인되지 않음 |
| `menu00.nro @0x71000421e0 OnReceive` | 세션 연결·NetworkManager 상태2·tag0에서 `(station,slot)`로 actor 조회/최초 생성. **실제 Player::GetPosition**과 수신 위치 거리 `d>5`면 SetPosition/Rotation, `d≤1`이면 회전 전용 Start, `1<d≤5`이면 위치·회전 Start. 원본 `ComActorAutoInterpolation` 하나를 구동하며 별도 0.2 s 선형 좌표 보간은 이 호출부에 없음 |
| 원본 보간 | `main @0x7100020608` 위치 전용 Start는 `+0x60:u16=0x0001`; `@0x7100020628` 회전 전용 Start는 `0x0100`으로 위치 진행 flag를 끈다. `Calculate @0x71000208e8`, `TryFinish @0x71000202c0`, 기본 속도6(`@0x710001fed4`)를 참조. 따라서 회전 전용 분기의 위치 중단 자체를 웹 고유 결함으로 보지 않음 |
| 이동·CPU·충돌 권한 | 내 station 사람 actor가 실제 입력/앞 로컬 사람 추종·충돌 후 위치를 발행한다. 원격은 각 수신기에서 보간 actor를 움직인다. CPU(PlayerType1)는 광장 생성에서 제외(`menu00 @0x7100059700`). 이 좌표 경로에 호스트가 이동을 대신 계산·충돌을 승인하는 조건은 없음; 전체 충돌 세부는 광장 문서 참조 |

→ 정리본: [17_actor.md](17_actor.md) §8.3

## 4. 난수 동기·호스트 변경·오류

### 4.1 seed 계약 [판독]

내부 NetTransfer는 group `2`(`0x7100150a80`)다. `0x7100162128`의 **tag `1`, payload `u32`, 정확히 `4 B`**가 seed 전송이고, Invalid 대상에는 `Send`, 지정 station에는 `SendTo`를 쓴다. 수신 `0x71001536a0`은 tag1 길이가 4일 때만 처리한다.

| 값/상태 | 처리 |
|---|---|
| seed `0` | reset 제어값: 현재 seed `+0x11c8=0`, FIFO end를 begin으로, wait flag `+0x11ea=1` |
| seed `≠0` | `u32` FIFO `+0x11d0..0x11d8` 끝에 추가 |
| `+0x11e8:u16` | seed 송신 sequence. `0x71001525a0`가 `IsReceivedSend`를 확인하면 sequence와 wait flag를 해제 |
| seed 조회 | `0x7100161d4c`: wait flag가 켜졌으면 false; 기존 nonzero seed를 반환하거나 FIFO 앞 값을 pop. 비어 있으면 false/0 |
| seed 호스트 변경 | `0x7100161eb4/0x71001624ac`가 지정 station을 갱신. 새 로컬 seed 호스트이고 seed/FIFO가 비면 reset 후 새 난수 생성·배포. 대기 FIFO가 생기면 resync wait 해제 |

이 seed 재동기는 **게임 상태 snapshot 복구와 다르다**. 판독한 seed 메시지에는 MT19937 전체 상태, 소비 index, 게임 객체 상태가 없다. 동일 seed 이후의 소비 순서는 기존 코어/RNG 분석을 따른다. 매 프레임 RNG 상태를 송신한다거나 seed 호스트 변경만으로 진행 중 객체를 복원한다고 구현하지 않는다. 수신 tag1 분기 내부에는 송신 station이 지정 seed 호스트인지 확인하는 비교가 없으며 상위 NetTransfer 접근 제약은 추가 근거가 필요하다.

### 4.2 지연·누락·연결 종료 [판독]

| 상황 | 확인한 처리 | 남은 경계 |
|---|---|---|
| 다음 입력이 준비되지 않음 | `0x4c2c`, SDK frame 진행 불가, ready off, 버튼 accumulator 보존 | 게임 전체 정지 연결 훅 |
| station 현재 프레임 수신 실패 | `0x710050f260`은 해당 station의 활성 사용자 채널 버퍼를 zero 처리. 컨트롤러 callback `0x7100509760`에는 이전 캐시 재적용 분기가 있음 | 이것을 예측 입력/CPU 전환으로 명명할 근거 없음 |
| 채널 읽기 실패 | `0x2c09`를 별도 취급; 다른 Pia 오류는 `0x710051277c`의 오류 경로 | 일반 누락의 ACK·retry 주기·중복 제거·허용 손실 정책 |
| 제한된 transport 재송신 | `0x7100faf560`: transport `+0x13e==2`일 때 `0x7100fb4fa0`. peer `+0x93==3`, queue stride `0x59c`의 marker `+0x59b==0` 항목을 `0x7100fb4180→0x7100fb4300`으로 wrapper type3 재송신 후 marker1 | 상태값의 의미 미확정. 정상 frame 누락 재전송·사용자 재접속으로 확대하지 않음 |
| 참가 station 목록 불일치 | `0x7101026330→0x71010268e0`이 station/frame/ring을 지우고 기존 로컬 채널 mask·delay 제안으로 `0x7101024760` 재시작 | SDK 입력 재시작만 확인. 게임 객체·점수·RNG 전체 상태·같은 게임 frame의 복원은 이 함수에서 확인되지 않음 |
| 사용자 레코드가 뒤처짐 | §3.2 bitmap 해제, payload/입력 유효성 gate | ring 입력 누락 처리와 동일 조건으로 합치지 않음 |
| 시작 중 세션 해제·timeout | §2.2 start Fiber 실패, `OnSyncFail` 경로 | 최종 UI와 모드별 복귀 목적지 |
| 진행 중 세션 해제 | `0x7100152650`은 SDK session state≠6이면 sync state와 참가자/매핑 벡터를 정리. 기존 `FiberWatchNetError` 역할은 씬 분석의 완료 결론 참조 | 자동 재접속 후 같은 게임 재개·CPU 대체는 확인되지 않음 |
| sync stop | `StopSync @0x71001bd398`, Fiber `0x71001be030`이 SDK stop(`0x710050ebf8 → 0x7101024b74`) 후 sync state0을 기다리고 Fixed60 강제를 해제 | 게임 snapshot rewind/replay 경로는 이 stop 계약에 없음 |

## 5. 판정·점수·종료와 대표 게임

공통 본편 처리기 `0x71002e1818`은 씬 `vt+0x238=OnGameMain`을 호출하고 참이면 단계 `9→10`, 타이머를 종료한다. 결과 단계 `0x71002e1b14`는 `vt+0x258=OnEndingInit`의 완료를 기다려 `MGResult` 흐름을 시작한다. 두 호출부에 호스트만 게임 판정/결과를 계산하게 하는 분기는 없다 [판독]. 종료 연출의 상세 수명은 [결과 문서](../shell/minigame_result.md)를 참조한다.

| 게임 | 공통 동기 계약과 연결되는 실제 호출부 | 게임별 차이·권한의 확인 범위 |
|---|---|---|
| [mg0101](../minigame/mg0101.md) | `mg0101.nro @0x710002435c OnEndingInit → @0x71000201b0 PlayerMgr::SetResultToGameWork` | 로컬 RankMgr 결과를 PlayerID별 `PlayerWork::SetMinigameRank/WinLose`에 쓴 뒤 MGResult 플레이어를 설정. 이 함수는 station host 조건 없이 전 플레이어 결과를 작성. 순위/이동 계산은 기존 게임 문서 참조 |
| [mg0911](../minigame/mg0911.md) | `mg0911.nro @0x7100068500 SyncedSetupGameImpl → @0x71000335b0 GameMgr::SetUpGame`; `@0x7100063530 Player::AddScore`; `@0x7100068800 OnEndingInitImpl → CreateResultBuilder → Setup_DefaultEndingResult` | 동기 준비 뒤 PhysX/게임 객체를 만들고 입력·충돌 결과로 점수 누적. 점수는 `clamp(score+scoreMul*pts,0,99999)`, 잠금 시 무시. 이 점수 함수의 서버/host 권한 분기는 확인되지 않음. 입력 일치만으로 물리 계산의 플랫폼 간 동등성을 보장할 수 없음 |
| [mg1801](../minigame/mg1801.md) | `main @0x7100443340 RmMgSceneBase::SyncedSetupGame → mg1801.nro @0x710000e914 RmSyncedSetupGame`; `@0x710000c9c0 Player::MyUpdate → @0x71000044d0 ObjectManImpl::JudgeInput`; 공통 `main @0x71004441e8 OnGameMain` | 제품/채보 준비와 입력 판정은 각 런타임에서 진행. 리듬 판정에는 소리의 박자/곡 변수도 들어가므로 패드·seed만 같은 웹 클라이언트가 같은 결과를 낸다고 전제할 수 없음. 기존 리듬 식·RNG 소비 순서는 참조만 함 |

CPU도 게임별 로직 계약이다 [판독]. `mg0101.nro @0x710000b840 StepAI`는 PlayerType1일 때 `ComAI::CalcDirection @0x7100004580`을 overlay stick으로 넣고 `ComAI::Update @0x7100004b50`이 경로를 갱신한다. `mg1801.nro @0x710000c9c0 MyUpdate`는 isCom이면 `PadDriver::UpdateCpu @0x710000d2b8`, 사람이면 동기 입력 프록시를 읽는다. 해당 호출부에는 host/IsLocal로 CPU 실행자를 제한하는 분기가 없다. CPU 위치·판정 송신/호스트 대행으로 치환할 근거는 없으며, CPU 계획 난수의 예외는 [mg1801 §6.7](../minigame/mg1801.md)의 완료 결론을 따른다. 게임 충돌·득점은 위 런타임 호출부에서 계산되지만, 최종 네트워크 권한을 이 사실만으로 정하지 않는다.

위 호출부는 “선택한 게임의 로컬 판정 및 공통 동기 입력” 근거다. 최종 점수·종료 프레임의 전원 확인, 결과 checksum, 호스트 결과 덮어쓰기, 불일치 시 조정 메시지는 이 경로에서 확정되지 않았다. opaque user payload를 점수 패킷으로 간주하거나 모든 NRO가 같은 판정 권한을 가진다고 일반화하지 않는다. §3.3의 channel16은 지연값이며 transport sequence/marker도 게임 결과 확인 신호가 아니다.

## 6. 현재 웹과 구현 계약

### 6.1 확인한 현재 상태 [웹]

| 파일 | 실제 동작·게임 동기화와의 차이 |
|---|---|
| [server/games.ts](../../server/games.ts), [wire.ts](../../script/app/common/net/protocol/wire.ts) | 서버 등록은 `mpj-plaza` 하나. `MSG`에는 방 제어·광장 INFO/STAMP만 있으며 게임 frame input/seed/start barrier/result 메시지는 없음. 기존 방 프로토콜의 크기·권한은 online.md §9.5 참조 |
| [socketio.ts](../../script/app/common/net/socketio.ts) | `reconnection:true` 옵션은 있으나 disconnect handler가 `closeSocket()`으로 socket을 명시 종료. 게임 재접속/프레임 재전송 계약은 없음. 광장 이탈 시 연결 종료는 online.md §9.5~9.6의 완료 결론 |
| [game.ts](../../script/game.ts) | `GameSetup={players,seed,practice,options}`: station/slot/소유권/세션 epoch 없음. `GameLogic.step(pads,sound)`의 두 입력원이 결과에 영향을 줄 수 있음 |
| [main.ts](../../script/main.ts) | `readSetup`은 URL seed 또는 로컬 Math.random. step은 로컬 `pads.read()`와 `view.observe(t)`를 곧바로 전달하고 `hook.frame++`. `logic.done/result`는 로컬 결과 표시 |
| [clock.ts](../../script/core/clock.ts) | `MAX_STEPS=120`, `MAX_BACKLOG_STEPS=300`. backlog>300이면 `base+=(due-120)/60`으로 시각을 건너뜀. 탭 숨김/오디오 중단도 로컬 시계에 영향. 이 로컬 복구 정책을 온라인 공통 프레임에 그대로 적용할 수 없음 |

### 6.2 광장 위치 불일치의 현재 경로·진단 [웹]

```text
plaza_page.ts: readPads → run.step(1)
  → parts 순서 player → camera → follow → … → ui → overview
  → 로컬 PlazaMover 입력/추종·충돌 → actor.pos/yaw → ui/part.ts
  → vel=(pos-lastPos)/(f32(1/60)), quat(yaw), 사람 순번 slot
  → RemoteSender → PlazaUi.sendLocal → SocketIoOnline.sendPlayerInfo
  → encInfo → socket.emit('m') → Rooms INFO → others/relay
  → REMOTE_INFO → 현재 멤버 station/slot 조회 → remoteInfo queue
  → PlazaUi.tick → RemoteTable.receive(수신 목표 저장) → 패킷마다 net:remote
  → FollowSystem.remote → 표시 RemoteMotion.receive(표시 위치 기준 분기)
  → 다음 follow 틱 AutoInterpolation.calculate → PlazaMover.tick(이동·충돌/접지) → sync(root.position) → render
```

| 단계/파일 | 실제 값·조건 |
|---|---|
| 발신 [ui/part.ts](../../script/app/scene/world/plaza/ui/part.ts), [ui/net.ts](../../script/app/scene/world/plaza/ui/net.ts) | `input/follow` actor의 로컬 비COM 사람 순번을 wire slot으로 압축. slot<4, 방 멤버≥2. timer≤0·`Σvel²>0.1`일 때만 보내고 timer=0.2; `joined/memberReady`의 `sendAll`은 force. 계속 움직여도 정확한 12틱 고정 송신이 아니며, 정지/회전 dirty·정기 heartbeat 없음 |
| 실제 payload [wire.ts](../../script/app/common/net/protocol/wire.ts) | `INFO=0x10`: `[type:u8,slot:u8,x/y/z:i16 LE,yaw:u16 LE]`, 10 B. 서버 삽입 후 `REMOTE_INFO=0x90`: `[type:u8,station:u16 LE,slot:u8,x/y/z:i16 LE,yaw:u16 LE]`, 12 B. `qpos=clamp(round(pos×256),−32768,32767)`, 복원 `q/256`; 표현 범위 `[-128,127.99609375] m`. `qyaw=round(frac(yaw/2π)×65536)`를 u16으로 저장. frame/timestamp/sequence/velocity/버튼/충돌 상태 없음 |
| 중계 [rooms.ts](../../server/games/mpj-plaza/rooms.ts), [index.ts](../../server/games/mpj-plaza/index.ts) | INFO 길이10·slot<발신자의 프로필 사람 수만 검사. station은 연결에서 주입하며 호스트 조건 없이 다른 station으로 동일 좌표 relay. `others` 기본 volatile=false, 현재 INFO도 그 경로: 일반 Socket.IO emit. 서버의 250 ms tick은 연결 정리이며 이동 송신 주기가 아님. 마지막 위치 저장/늦은 참가자 snapshot·서버 이동/충돌 계산은 없음 |
| 수신 [socketio.ts](../../script/app/common/net/socketio.ts), [ui.ts](../../script/app/scene/world/plaza/ui/ui.ts) | 멤버 매핑 없는 station/slot은 폐기. UI도 live remote station만 수용. 첫 INFO가 있어야 RemoteTable actor 생성. 누적 event queue를 틱에서 비우며 좌표의 원래 frame/나이를 판정할 정보 없음. 참가/준비의 강제 송신이 최초 표시를 담당함 |
| 수신 목표 저장 `RemoteActor`·`RemoteTable` | 마지막 수신 pos/quat·(station,slot)·수신 수(rx)·수명만 보관한다. 보간·5/1 m 분기·mode·speed는 없다. `PlazaUi`가 받은 패킷마다 `remote` 사건을 내고 `ui/part.ts`가 `net:remote`로 전달한다. frame history/외삽·입력 예측·rollback buffer는 없음 |
| 단일 표시 보간 [follow.ts](../../script/app/scene/world/plaza/follow.ts), [player.ts](../../script/app/scene/world/plaza/player.ts) | `RemoteMotion.receive`는 **표시 mover 위치**와 수신 위치의 3D 거리로 d>5이면 place, d≤1이면 startRotate, 그 사이이면 start(pos,yaw)를 한 번 적용한다. `AutoInterpolation` 하나가 수평 이동 레버를 주고 `PlazaMover`가 로컬 충돌·접지·선회를 처리한다. 위치 진행 중 Run6 대응은 [근사]이며 수신 목표가 표시 좌표와 즉시 일치하는 계약은 아니다. 최초 spawn·teleport만 수신 y를 바닥에 재투영하고, 이동 중 접지·낙하 보정은 mover가 맡는다 |

**현재 남은 조건·재현 후보와 수정 전 원인 후보:**

| 구분 | 위치 불일치/실시간성에 미치는 구체 조건 | 확인할 재현·관측 |
|---|---|---|
| 확인: 정지 최종 위치 미전송 | timer가 남은 동안 움직인 뒤 멈추면 마지막 이동분은 다음 송신 시각의 vel=0에 막힘. 이후 움직임/force까지 원격 목표가 오래된 좌표에 머묾. 원본 송신 조건도 같지만 정지 좌표 일치 보장은 없음 | 마지막 INFO 직후 0.2 s 이내 짧게 이동→완전 정지. `P_local`과 마지막 `P_wire` 차이가 남고 stopped 상태에서 INFO가 추가되지 않는지 비교. 단순 신뢰 전송으로 해결되지 않음 |
| 과거 원인 후보: 수정 전 중복 보간·다른 거리 기준 | 수정 전에는 RemoteActor 내부 pos의 0.2 s 선형·slerp 뒤 렌더 mover를 다시 추종시켰다. 당시 내부 좌표 기준과 표시 위치 기준이 달라 rotate 전환 때 남은 목표를 잃을 수 있었다. **현재는 §6.2.1의 단일 RemoteMotion 경로로 교체됨**. 현재 startRotate가 위치 진행을 끄는 것은 원본 분기와 같은 동작 | 당시 `P_wire,P_ui,P_mover,P_root` 비교는 과거 원인 후보의 진단 기록이다. 현재 증상에 이중 보간을 원인으로 적용하지 않고 아래 수신 목표·표시 위치 관측을 쓴다 |
| 확인: 1 m 회전 전용 구간 | d≤1의 위치 진행 중단은 원본 규칙이며 현재 웹도 **표시 위치 기준**으로 적용한다. 웹 송신은 이동 중 13틱(0.2167 s) 간격이고, 걷기2 m/s라면 약0.433 m/패킷이다(재구현 계산). 원격은 1 m가 쌓일 때까지 서 있다가 Run6으로 따라잡을 수 있다. 0.2 s 선형 보간은 수정 전 근사이며 현재 경로에는 없음 | 평지 걷기/달리기에서 수신 d와 표시 actor의 mode/target을 비교. rotate가 이어지는 현상을 수신 지연·누락만으로 판단하지 않는다. Run 액션 선택의 원본 화면 대응은 §6.2.1의 [근사]로 유지 |
| 후보: 최초 표시/로더/장면 보임 | 멤버 매핑 전 INFO 폐기, 최초 INFO 부재, 기구 전환 setVisible(false)는 별개 조건이다. 현재 `FollowSystem.loading`은 로딩 중 **최신 수신 하나를 보관**하고 완료 시 그 좌표로 spawn한다. 로딩 중 이탈하면 보관도 지운다(§6.2.1). 수정 전 새 이벤트 폐기·다음 매 틱 발행으로 회복하던 경로와 구분한다 | 둘 다 정지한 상태의 순차 참가·여러 로컬 사람·느린 모델 로드·기구 출발을 각각 비교. (station,slot) 프로필/INFO/RemoteTable/표시 actor 존재·최신 보관 목표·root.visible을 구분한다 |
| 후보: 좌표 범위·충돌면·슬롯 | 범위 밖은 i16 포화; 첫 표시·teleport에서 수신 y는 로컬 바닥에 재투영되고 이동 중 y는 mover 접지가 정한다. `createPlayer`는 local slot0을 먼저 선택해 isCom을 검사하지 않으나 송신 순번은 비COM만 포함. 정상 설정이 이런 조합을 허용하는지는 별도 확인 필요 | `abs(x/y/z)≥128`, 계단/복층, CPU가 slot0인 설정을 따로 확인. 송신 전/복원 좌표, collider hit y, 실제 actor slot과 프로필 순번을 비교. 카메라·캐릭터 문서의 병행 변경은 해당 작업에서 검증 |
| 후보: 부하·호출자 | 광장 FixedClock은 최대4틱 이후 밀린 시간을 버린다. `scene.step(df>1)` 직접 사용은 part별 여러 틱 실행으로 마지막 pos만 송신 샘플링할 수 있지만 **현재 plaza_page는 항상 step(1)을 반복**하므로 이 배치 문제를 현재 기본 실행 원인으로 단정할 수 없음 | 정상/30 fps/탭 복귀에서 실제 wall time, 실행 틱수와 INFO 간격을 비교. 직접 df>1 호출은 별도 API 재현으로 분리 |

현재 관측은 `window.__plaza.debug()`의 `actors`, `parts.player`, `parts.follow.remotes`(mode/rx/target/rot), `parts.ui.remote/log`다. 프로토콜 단계는 디버거에서 `encInfo/decInfo/RemoteActor.receive/RemoteMotion.receive/FollowSystem.remote/sync`를 관측한다. 최소 비교 record는 `(local wallTime,실행 tick,station,wireSlot,actorSlot,tx/rx,mode,P_local,P_wire,P_target,P_mover,P_root,target,root.visible)`와 `Etx=|P_local−P_wire|,Erx=|P_wire−P_target|,Efollow=|P_target−P_mover|,Erender=|P_mover−P_root|`다. **P_target은 마지막 수신 목표이며 보간 좌표가 아니다.** Efollow에는 단일 보간·1 m 분기·로컬 충돌/접지의 영향이 섞이므로 이중 보간 증거로 보지 않는다. 다른 기기의 wallTime은 공통 frame이 아니므로 RTT 없이 단방향 지연으로 계산하지 않는다. 패킷별 송수신 좌표/시각·root.visible 전체는 추가 관측이 필요하다.

광장 후속 검토 계약 [설계]: 수신 목표를 표시 actor의 단일 보간기에 공급하고 5/1 m 분기를 **표시 위치 기준**으로 한 번만 적용하는 구조는 구현됐다(§6.2.1). 정지 최종 좌표 dirty/회전 dirty 송신은 현재 구현에 없으며, 추가하면 원본 송신 조건과 달라진다. 로컬 충돌/접지 보정·Run 액션 대응의 허용 오차는 마지막 수신 목표와 표시 위치를 구분해 검토한다. timestamp/sequence·최신 좌표 backfill의 필요성은 웹 계약으로 정하되, 광장 위치 메시지를 미니게임 input/frame 버퍼로 재사용하지 않는다.

#### 6.2.1 원격 위치 단일 보간의 변경 내역·현재 구현 [웹·설계] (2026-10-09, plaza-interp)

근거는 §3.4 표(OnReceive·원본 보간 줄)와 [plaza_3d.md](../shell/plaza_3d.md) §5.1 ⑥·§6.10 ②다. 판독을 새로 하지 않았고, 확인한 것은 OnReceive 분기 끝뿐이다(`plaza_menu00_world.c` `LAB_7100042568`): `d>5`는 `SetPosition`·`SetRotation` 뒤 곧바로 return하며 이 분기에 `Stop` 호출은 없다. `d`는 `Player::GetPosition` 4성분과 수신 레코드 `+0x20` 4성분의 차의 길이다(w 차는 0이라 3D 거리와 같다).

| 항목 | 수정 전(과거 경로) | 수정 후(현재 구현) |
|---|---|---|
| 수신 표 `ui/net.ts RemoteActor`·`RemoteTable` | 내부 좌표 기준 5/1 m 분기, 0.2 s 선형·slerp, 패킷이 없어도 매 틱 `net:remote` 발행 | **수신 목표·(station,slot)·수명만** 맡는다: 마지막 수신 pos/quat과 수신 수(`rx`)를 저장한다. 보간·mode·speed를 없앤다. `PlazaUi`는 **수신 패킷 하나마다** `remote` 사건 하나를 낸다(원본 OnReceive 1회 = 사건 1회). 비멤버 폐기·`remoteLeft`(online.md §9.6)는 그대로 |
| 보간기 소유 | 없음(웹 2단계 근사) | `follow.ts`의 원격 표시 actor(`Remote`)가 `RemoteMotion` 하나를 가진다. `RemoteMotion` = 표시 `PlazaMover` + 원본식 `AutoInterpolation` 하나 + OnReceive 분기 |
| 거리 분기 | UI 내부 pos 기준 | `RemoteMotion.receive`가 **표시 mover 위치**와 수신 위치의 3D 거리로 한 번만: `d>5` → `place`(위치·회전 즉시), `d≤1` → `startRotate`, 그 사이 → `start(pos,yaw)` |
| `AutoInterpolation` | `autoInterp` 함수(따라가기용)만 있음 | 필드: 목표 pos(+0x40)·목표 회전(+0x50)·위치 진행 flag(+0x60)·회전 flag(+0x61)·속도 6(+0x64). `start` = 두 flag 켬, `startRotate` = 회전 flag만 켜고 **위치 진행 flag 끔**(원본 `0x0100`), `stop` = 둘 다 끔. `calculate`(Calculate+TryFinish) = 위치 진행 중이면 수평 단위 방향 레버, 남은 수평 거리 ≤ 6·dt면 x/z를 목표로 맞추고 위치 flag 끔. 위치 진행이 아닐 때 회전 flag가 있으면 mover 목표 yaw = 수신 yaw로 넘기고 회전 flag 끔(선회는 §3.5 ComActor 360/1100°/s 규칙) |
| 회전 전용 뒤 | 렌더 mover 목표가 `null`이 되어 남은 위치를 잃음 | 원본과 같이 위치 진행이 멈춘다(위치 flag off). 남는 차이는 정의상 ≤1 m다. 다음 수신이 표시 위치에서 1 m를 넘으면 `start`가 다시 켜져 정상 이동한다 |
| `d>5` 중 보간 | — | 원본처럼 `place`만 하고 보간기를 멈추지 않는다(위 판독). 진행 중이던 목표가 남아 있으면 계속 간다. 끈 쪽 선택지는 아래 '사용자 확인 필요' |
| 지면 y | 수신 y를 `groundHeight(x,z,y+2)`로 바꿈 | 첫 표시·`d>5`의 `place`만 같은 재투영을 쓴다. 보간 목표 y는 쓰지 않는다(Calculate는 중력 축 제거). 이동 중 y는 표시 mover의 접지가 정하고, 낙하 보정(`top.y−1` 아래면 바닥에 놓음)은 그대로 둔다. 거리 `d`는 재투영 전 수신 좌표로 잰다(원본 = 수신 좌표 그대로) |
| 이동 모션 | UI 보간 속도 > 2.001이면 run6, 아니면 walk2(레버 0.5) | 위치 진행 중에는 항상 **레버 깊이 1 = Run 6 m/s**다. 원본 보간 속도는 6 고정이고, payload에 속도가 없으며, OnReceive는 속도를 바꾸지 않는다(분기에 `SetTranslationSpeed` 없음). 따라서 송신자의 걷기/달리기를 수신측이 구분할 근거가 없다. Run 액션 대응은 §6.10 ②와 같은 [근사]다(ComActor가 보간 출력을 받는 액션 미판독, 속도 6 = actorparam 달리기 6). 도착 문턱 6·dt = Run 한 틱 이동량 0.1 m라 둘이 맞는다 |
| 사건 순서 | 매 틱 `net:remote` → 다음 follow 틱 | `plaza_page` 순서(player → … → follow → … → ui): ui 틱의 수신이 `FollowSystem.remote`에 동기로 반영되고, 다음 틱 follow가 `calculate → mover.tick`을 한다 |
| 모델 로딩 중 수신 | 폐기(다음 매 틱 발행으로 회복) | 매 틱 발행이 없어졌으므로 로딩 중 **최신 수신 하나를 보관**하고, 로드가 끝나면 그 좌표로 첫 표시한다. 로딩 중 `remoteLeft`면 보관도 지운다 |
| 정지 전이 | 송신 없음(원본과 같음) | **바꾸지 않는다**(§3.4: 정지 좌표 별도 송신 없음). 정지 뒤 마지막 목표는 다음 움직임·sendAll(참가·새 멤버)까지 갱신되지 않는다. 회전 전용의 ≤1 m 차이와 마지막 송신 뒤 이동분이 남을 수 있다. 웹의 실제 송신 간격은 13틱(0.2167 s)이며, 로컬 충돌/접지까지 포함한 보편적 위치 오차 상한은 이 합만으로 보장하지 않는다. 평지 시험값은 아래 구현·시험 표를 참조한다 |
| 송신·wire·서버 | — | 그대로(INFO 10 B / REMOTE_INFO 12 B, 송신 타이머0.2 s·`Σvel²>0.1`, 웹 고정60 Hz 실제 간격13틱, force는 `sendAll`만) |

**사용자 확인 필요** (진행은 원본 쪽으로 정했다)

| 항목 | 정한 것(원본) | 선택지 |
|---|---|---|
| 정지 최종 좌표 | 보내지 않음. 걷기는 최대 약 1.4 m, 달리기는 마지막 송신 뒤 이동분이 남을 수 있다 | (a) 원본 그대로 (b) 송신측이 움직임→정지 전이 때 최종 좌표를 INFO 1회 force 송신(wire 그대로, 원본에 없음). 단 수신측 `d≤1`이면 회전만이라 1 m 안쪽 차이는 여전히 남는다 (c) (b) + 수신측 `d≤1`도 위치 진행(원본 분기와 다름) |
| 걷는 원격의 모습 | 표시 actor는 1 m가 쌓일 때까지 서 있다가 6 m/s로 달려 따라잡는다(웹 고정60 Hz 송신13틱 × 2 m/s ≈ 0.433 m/패킷이므로 약3패킷마다; 재구현 계산) | 원본 화면 대조 전까지 유지. 원본 실기에서 걷는 원격이 걷기 모션이면 ComActor의 보간 액션 선택을 판독해야 함 |
| `d>5` 때 진행 중 보간 | 멈추지 않음(분기에 Stop 없음) | 순간이동 뒤 남은 목표로 되돌아가는 장면이 보이면 `stop` 추가(원본과 다름) |

**구현·시험 (2026-10-09)** [웹]: `ui/net.ts`(목표·수명만), `ui/ui.ts`(패킷마다 `remote`, 매 틱 발행 제거), `ui/part.ts`(`net:remote`에서 mode·speed 제거), `follow.ts`(`AutoInterpolation`·`RemoteMotion`, 로딩 중 최신 수신 보관, debug `remotes[].mode/rx/target/rot`). 송신·wire·서버는 바꾸지 않았다. 송신 간격은 정확히 13틱(0.2167 s)이다(타이머 0.2를 다 깎은 다음 틱, test_plaza_ui ⑤).

| 시험 | 결과 |
|---|---|
| `test_plaza_actors` 2b(지연 0, 평지) | 표시 위치 기준 분기(마지막 수신 8에서는 0.5 m지만 표시 6에서 2.5 m → 보간), 2.5 m = Run 25틱 도착, 회전 전용이 남은 위치 진행을 멈추고 다음 >1 m 수신에 다시 이동, 순간이동 지면 y 재투영. 직선 2 s: **걷기 틱별 최대 오차 1.333 m**(수신 회전만 7·보간 3), **달리기 1.400 m**(출발 첫 패킷만 회전만), 멈춘 뒤 0.066 / 0.199 m, 표시 액션 Walk 0 |
| `test_room_server` ⑤(실제 서버 + 광장 UI 둘, 표시 actor = `RemoteMotion`) | **걷기 틱별 최대 오차 1.400 m**, 멈춘 뒤 0.035 m(마지막 수신 = 표시 4.965, 송신자 5.000). **달리기 1.535 m**(실제 소켓 지연 약 1틱 포함), 멈춘 뒤 0.199 m(마지막 수신 = 표시 16.801, 송신자 17.000). 정지 뒤 송신 0, 8 m 이동 → 순간이동, 나가기·재참가·끊김·해산·가짜 어댑터 뒤 표시 actor 0(잔상 없음) |
| `test_plaza_ui` ⑤ | 받기 표 = 마지막 수신 그대로·이탈 = 스테이션 전 슬롯. 가짜 원격 1 s 동안 `remote` 사건 수 = 받은 패킷 수(매 틱 발행 아님) |

멈춘 뒤 차이의 상한은 걷기 1 + 13/60×2 ≈ 1.43 m, 달리기 13/60×6 = 1.3 m다(두 시험의 작은 값은 멈춘 시각의 위상 때문). 이 상한은 원본 송신·수신 계약에서 생기며, 위 '사용자 확인 필요'의 (b)·(c)만 줄일 수 있다.

### 6.3 게임 구현 순서와 최소 계약 [설계]

아래는 원본 SDK 패킷 복제가 아닌 **웹에서 검토할 계약**이다. 메시지 opcode·최종 권한 정책은 구현 전에 정해야 한다.

1. **세션을 게임까지 전달:** `(sessionEpoch,gameId,settingsHash)`와 `PlayerID→(station,slot,isCom)`를 고정한다. 서버는 발신 station 소유 slot만 수락한다. 세션 호스트·seed 배포자·설정 배포자 역할을 별도 저장한다.
2. **시작 배리어:** 설정/참가자 매핑·선택된 seed·자원 준비 확인을 모은 뒤 공통 시작 frame을 배포한다. seed0은 원본 reset 의미와 충돌하므로 웹 seed 메시지에서는 reset 종류를 분리한다. 로드 완료만으로 logic을 시작하지 않는다.
3. **프레임 입력 버퍼:** `(epoch,station,slot,targetFrame,input)`를 저장하고 종류별 정규화/양자화를 한 번 수행한다. SDK에서 확인한 `targetFrame=F+D`, 최대 지연32/R65, 기본 제안10·협상/변경 조건을 참고해 frame ring 경계를 정의한다. 게임별 override·누락 대응의 미확정 경계를 채운 뒤 웹 D/R 정책을 정한다. 중복·오래된 epoch·소유권 위반은 명시적으로 거부한다.
4. **온라인 step gate:** 공통 진행 허용 frame이 준비될 때만 `logic.step`과 게임 timer/RNG 소비를 진행한다. 렌더·통신 pump는 계속 돈다. 입력 누락을 null/로컬 최신값으로 바꾸거나 `main.ts` backlog 시각 건너뛰기로 해소하지 않는다. 원본의 CoreSystem gate를 더 판독해야 그 구현 동등성을 주장할 수 있다.
5. **리듬 관측 계약:** `SoundSnapshot`의 게임 판정에 쓰이는 globals/locals를 공통 frame으로 결정하거나 명시적으로 합의한다. 각 브라우저 AudioContext 관측을 그대로 공유 게임 로직에 넣지 않는다. 결과에 영향 없는 view 효과·소리는 로컬 출력으로 유지한다.
6. **종료·중단 계약:** `(epoch,endFrame,resultDigest)` 확인과 최종 결과 확정자를 정의한다. 이는 아직 원본으로 확정된 정책이 아니다. disconnect·timeout이면 게임 진행/결과 확정을 멈추고 명시한 실패 경로로 보낸다. 전체 상태 snapshot/replay 근거를 확보하기 전에는 자동 재접속 후 중간 프레임 재개를 제공하지 않는다.

검증 기준은 동일 설정/seed/정규화된 `(frame,pads,sound)`에서 대표 세 게임의 결과 digest 일치, 지연 중 미진행, 짧은 버튼 보존, 오래된 epoch 차단, 시작/종료 확인 누락 시 미확정 유지다. 이것은 향후 구현 검증 항목이다.

## 7. 남은 증거와 구현 결정의 한계

| 미확정 영역 | 다음에 필요한 정확한 근거 |
|---|---|
| SDK stall → 전체 씬/파이버 gate | `0x710050f0d4`의 `+0x2a/+0xa8` 및 CoreSystem timing callback 소비자. 현재 frame export·ready·입력 accumulator만으로 pause 수준을 정할 수 없음 |
| 외부 wire envelope·일반 신뢰성 | §3.3 Pia type3 본문·9 B wrapper·§4.2 제한된 queue 재송신까지 확인. wrapper 인자7/8 의미, 외부 송신 virtual +0x88/+0x90 및 정상 누락 ACK/retry의 전 경로 필요 |
| 게임별 D·타임아웃 override | 공통 경로 Lmax32/R65·StartSync 제안10·30 s는 해소(§3.3). 각 모드/게임의 `SetupSyncBaseParam/StartSync` 인자 생산자 및 +0x370e writer 필요 |
| 입력 세부 필드 | 터치 항목 의미, SixAxis SIMD 반환/행렬, 동기 프록시 down/up 생성 `0x710050b6cc` 및 하위 HID 구현. raw byte를 보존하면 의미가 확정되는 것은 아님 |
| 게임별 opaque payload | `SetUserData/GetUserData` NRO import·간접 호출과 `+0x08..0x37` 생산자. 대표 결과 호출만으로 payload의 점수/객체 복제 유무를 정할 수 없음 |
| seed 조회 실패의 상위 보장 | `0x71001c94cc` 진입 전 seed sync 호출·완료 조건. seed host 변경은 확인했지만 MT 상태·객체 복원·재참가 배리어는 확인되지 않음 |
| 결과 일치·최종 권한 | MGResult 밖의 모드별 result transfer/commit 호출 및 end-frame/score 비교. GameSync 서비스의 문서 commit과 게임 frame 입력 채널은 별도 경로이며 같은 것으로 취급하지 않음 |
| 게임 재접속·탈락자 대체·전체 상태 resync | 진행 중 disconnect 이후 모드별 분기와 snapshot 저장/복원/replay 호출. SDK station 변경 재시작(§4.2)·seed 재동기·sync stop을 게임 중간 재개로 대체하지 않음 |
| 사용자 위치 불일치 재현 | §6.2 조건별로 tx→wire→UI→mover→root 좌표/존재/visible 비교. 최초 표시·충돌면·부하 후보는 실제 재현이 필요하며 관측 전에는 발생률/지연량을 정할 수 없음 |

## 8. 네트워크 세션 소유 계약 — 앱 수명 연결 (2026-10-10, [설계])

### 8.1 문제 [데이터: 웹 소스]

- 광장 UI 부품(`script/app/scene/world/plaza/ui/part.ts`)이 광장에 들어올 때마다 방 서비스 연결(`SocketIoOnline`)을 새로 만들고, 부품 해제(광장 나감) 때 `net.disconnect()` 한다(206행). 파티를 만든 뒤 광장 → 모드 선택 → 항구 → 미니게임으로 넘어가는 순간 연결이 끊긴다.
- 연결 소유자가 화면이라 다른 화면에서 같은 세션을 이어 쓸 수 없고, 연결·재접속·끊기를 한 곳에서 제어하지 못한다.
- 원본은 네트워크 세션이 장면과 독립해 앱 수명 동안 유지된다(§6 의 station·slot·epoch 소유권, [공용 감사 §5.3](common_system_audit.md) "게임 세션·seed·입력" 행 — 웹에 없음으로 기록됨).

### 8.2 계약

| 역할 | 주체 |
|---|---|
| 연결·세션 소유 | **앱 수명 싱글턴 `appNet()` 하나** — `script/app/common/net/session.ts`. 기존 앱 수명 서비스(`appAudio`·`appSave`·`appAssets`·`appBgm`·`appPhysx`)와 같은 방식 |
| 연결 시작 | 사용자가 온라인을 고른 화면(광장 친구 매치·온라인 화면)이 `appNet().connect(…)` 를 **요청**한다. 이미 연결돼 있으면 그대로 쓴다 |
| 연결 끝 | **세션이 실제로 끝날 때만**: 방 나가기·방 해산·매칭 취소(방 없음)·오류 확정·오프라인 선택·페이지 종료. **화면을 나가는 것은 연결에 영향이 없다** |
| 화면 | 들어오면 구독, 나가면 구독 해제만 한다(연결을 만들거나 끊지 않는다). 새 화면은 들어오자마자 지금 세션 상태(방·멤버·내 자리)를 받는다 |
| 여러 구독자 | 광장 UI·온라인 화면·모드 선택·항구·10턴 파티·온라인 미니게임 동기가 동시에 사건을 받는다(지금 어댑터의 단일 사건 받기 → `appNet` 이 펼쳐 준다) |
| 재접속·탭 숨김 | `appNet` 한 곳에서 정한다(정책은 8.5 사용자 확인) |
| 가짜(개발) | dev 흐름(`script/dev/flow.ts`)이 시작할 때 `?online=fake|off` 면 `dev/net/fake.ts` 의 가짜 어댑터를 `appNet()` 에 넣는다. app 은 dev 를 모른다. 지금의 광장 `ctx.online` 주입(2026-10-10 임시)은 이것으로 대체한다 |
| 결정성 | 미니게임 로직은 `appNet` 을 직접 보지 않는다. 틀(`app/minigame/frame`)의 FrameGate 가 세션에서 입력을 받아 넘긴다(minigame_scene §12.12.6) |

### 8.3 API 초안 [설계]

```ts
appNet(): NetSession                    // 앱 수명 하나
  setAdapter(a: OnlineAdapter)          // 기본 = SocketIoOnline, dev 가 가짜로 바꾼다(연결 전에만)
  connect(self): Promise<boolean>       // 이미 연결이면 즉시 true
  leave(reason)                         // 세션 끝: 'leaveRoom' | 'dissolved' | 'cancel' | 'error' | 'offline' | 'unload'
  subscribe(fn): () => void             // 화면은 이것만. 반환 = 구독 해제
  readonly state                        // connected · room · members · self station/slot
```

### 8.4 지금 `disconnect()` 호출 분류 [설계: 1차 분류 — 구현 때 online.md 판독 근거로 확정]

| 위치 | 상황 | 분류 → 바뀔 호출 |
|---|---|---|
| `app/scene/world/plaza/ui/part.ts` 206행(부품 해제) | 광장 장면을 나감 | **화면만 나감 → 구독 해제만** (이번 문제의 원인) |
| `app/scene/world/plaza/ui/ui.ts` 47행 `disconnect()` | 위 해제에서 부름 | 화면 해제 → 구독 해제만 |
| `app/scene/world/plaza/ui/ui.ts` 327행 | 친구 매치 메뉴가 방 없이 끝남 | 세션 끝 → `leave('cancel')` |
| `app/scene/menu/online/flow.ts` 275행 | 온라인 메뉴를 방 없이 나감 | 세션 끝 → `leave('cancel')` |
| `app/scene/menu/online/flow.ts` 529행 | 대기실 오류 표시 뒤 | 세션 끝 → `leave('error')` |
| `app/scene/menu/online/flow.ts` 649행 | 매칭 중단 | 세션 끝 → `leave('cancel')` |
| `app/scene/menu/online/flow.ts` 669행 | 오류 대화상자에서 다시 시도 안 함 | 세션 끝 → `leave('error')` |
| `app/scene/menu/online/flow.ts` 706행 | 오류 표시 뒤 | 세션 끝 → `leave('error')` |

### 8.5 사용자 확인 필요

- 탭이 오래 숨겨졌을 때 연결을 유지할지, 일정 시간 뒤 세션을 끝낼지(원본 Switch 는 슬립 시 세션 처리가 다름 [미확정]).
- 연결이 끊겼을 때 자동 재접속을 몇 번·몇 초까지 할지, 재접속 중 화면 표시.
- 오프라인 모드(혼자 하기)로 돌아갈 때 세션을 끝내는 시점.

### 8.6 구현 순서·검증·기간

1. 이 절 확정 → `script/app/common/net/session.ts`(`appNet()`·구독 펼치기·상태 보관·재접속).
2. 광장: 연결 생성·`disconnect()` 를 빼고 구독·해제만. `ctx.online` 주입 제거.
3. 온라인 화면: 8.4 의 세션 끝 호출을 `appNet().leave(…)` 로.
4. dev: 시작할 때 가짜를 `appNet()` 에 넣기.
5. 노드 시험: "광장 → 모드 선택 → 항구 → 다시 광장"에서 연결 유지, 세션 끝 사건에서만 끊김, 새 화면이 들어오자마자 방 상태 받기, 구독 해제 뒤 사건 안 받음.
6. 기간: 약 반나절~1일(에이전트 작업 기준).

## 9. 원본 네트워크 세션 수명

[데이터] 2026-10-10 추가. §1~§8은 그대로 보존했다. 조사 대상은 네트워크 소유자이며 공용 SceneBase/Work 수명 새 판독은 제외했다. 후속 ClearSession의 네트워크 reset만 이 갈래에서 다룬다(§9.15.5). 기존 [§2·4·6·8](12_online_sync.md), [온라인](../shell/online.md), [광장 §5](../shell/plaza_3d.md), [공용 감사 §5.3](common_system_audit.md)을 먼저 대조하고 빈 곳의 기존 C만 읽었다.

[판독] 장면 지역 `NetworkManager`와 main의 `bex::NetworkModule` 참조는 별개다. menu00·matching00 소멸자는 세션을 끊지 않고, 세션이 남으면 `bq::Net::SetAllListener()`를 호출한다. 근거: menu00.nro `@0x710002bf80/@0x710002c7a0`([C](../../../analysis/decomp/online_menu00.c)), matching00.nro `@0x7100003798/@0x7100003a64`([C](../../../analysis/decomp/online_matching00.c)).

[미확정] §8.1의 “원본은 앱 수명 동안 유지”는 위 장면 경계보다 넓은 표현이다. 현재 근거는 장면 지역 객체의 해제와 세션 종료가 다르다는 데까지다. main 전역 모듈의 설치·최종 해제 호출자는 확보하지 못했으며 웹의 앱 수명 appNet()은 §8의 [설계]다. main @0x7100150a80 생성 본체는 이제 [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)에 있으며 내부 자원 소유는 §9.15.2, 전체 수명 잔여는 §9.15.6을 따른다. 기존 필드는 [§3.3·4.1](12_online_sync.md) 재사용이다.

### 9.1 자료·기존 판독·공백 목록

[데이터] 주소는 모듈과 함께 대조했다. 같은 `0x7100003a64`도 matching00 소멸자와 mgm01 Params가 다르므로 주소만으로 합치지 않았다. 근거: [INDEX의 address/name/file](../../../analysis/decomp/INDEX.tsv), [main](../../../analysis/functions/main.nso.tsv)·[menu00](../../../analysis/functions/menu00.nro.tsv)·[matching00](../../../analysis/functions/matching00.nro.tsv)의 address/size/name/signature.

| 분류 | 기존 판독·자료와 재사용 범위 | 이번 공백 |
|---|---|---|
| [판독] 생성·참가·출발 | menu00.nro Connect `@0x7100032520`, Create `@0x71000340b0`, Join `@0x7100035a90`, Play `@0x7100037a00`; [online §3.1·4.8·5.4·5.6](../shell/online.md). [데이터] C 있음: [online_menu00.c](../../../analysis/decomp/online_menu00.c), [INDEX](../../../analysis/decomp/INDEX.tsv) | [미확정] 이 함수들은 재판독하지 않음. 지역 관리자 해제·명시적 종료의 차이만 보완 |
| [판독] 장면 데이터·시작 barrier | main StartSync `@0x7100218cd0`, IsSynced `@0x71002197bc`, NetworkGameScene `@0x71001c94cc`; [§2.1·2.2](12_online_sync.md). [데이터] 마지막 주소의 기존 C/명령 자료는 [core_b2.c](../../../analysis/decomp/core_b2.c)·[core_b7.c](../../../analysis/decomp/core_b7.c), 앞 두 본체 C는 현 목록에 없음 | [미확정] 장면 전환 중 네트워크 소유권. barrier/Work 내부는 재판독하지 않음 |
| [판독] station·slot·seed | main slot `@0x710013c440`, seed `@0x7100162210`, host 변경 `@0x7100161eb4/@0x71001624ac`; [§2.1·4.1](12_online_sync.md). [데이터] 현 C 본체 없음: [main 목록](../../../analysis/functions/main.nso.tsv)·[INDEX](../../../analysis/decomp/INDEX.tsv) | [미확정] SDK 재시작·seed 재동기와 세션 재참가/게임 복원을 구별 |
| [판독] 오류·방장 해산·이탈 | menu00.nro NetError `@0x7100039600`, NetSession `@0x7100039830`, MainImpl `@0x710005a170`; [online §5.5](../shell/online.md), [광장 §5](../shell/plaza_3d.md). [데이터] C 있음: [online_menu00.c](../../../analysis/decomp/online_menu00.c)·[plaza_menu00_npc_seq.c](../../../analysis/decomp/plaza_menu00_npc_seq.c) | [미확정] 재접속·Switch 슬립·플레이 중 호스트 교체. 완료된 함수는 재판독하지 않음 |
| [판독] 전 세계 매칭 | matching00.nro Matching_Bd `@0x7100010a00`, SetupSession `@0x7100012780`, CancelMatching `@0x7100013164`; [online §3.2·5.7·8](../shell/online.md). [데이터] C 있음: [online_matching00.c](../../../analysis/decomp/online_matching00.c) | [미확정] 매칭 지역 관리자와 공용 listener의 경계 |
| [데이터] 웹 현재 상태 | `disconnect` 8곳은 [§8.4](12_online_sync.md), 실제 조건은 [part.ts](../../script/app/scene/world/plaza/ui/part.ts)·[ui.ts](../../script/app/scene/world/plaza/ui/ui.ts)·[flow.ts](../../script/app/scene/menu/online/flow.ts). [설계] 배치 근거는 [DESIGN §10](../../DESIGN.md) | [설계] 화면 해제/취소/오류를 나누고 669행 분류를 보완 |
| [미확정] 추가 원본 자료 | main 전역 네트워크 수명·listener·재입장은 §9.15.2~9.15.7. [데이터] 원본/extracted는 읽기 전용이며 실행·추출·에셋 변경 없음 | [미확정] 최신 주소 미식별/결합은 §9.15.6의9행, 빈 C 요청은 §9.15.7의15주소 |

### 9.2 모듈·수명 소유자와 장면 전환

| 소유자 | 확인한 생성·유지·해제 |
|---|---|
| [판독] menu00 지역 `NetworkManager` | `@0x710002bf80`은 자기 `m_InstancePtr`를 설정하고 NetTransfer(group `0x2006`, 인자 `1`)·오류/세션 listener·지역 Entity·동기 수신기를 만든다. 기존 전역 `bex::NetworkModule`을 참조하고 이미 세션이 있으면 `+0xb8=2`, 없으면 `0`으로 시작한다. `ConnectNpln/CreateNplnSession`을 생성자에서 호출하지 않는다. [C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00 지역 해제 | `@0x710002c7a0`은 NetworkModule listener setter 호출, 세션 잔존 시 `bq::Net::SetAllListener`, Fiber·Entity·수신기·멤버 캐시·지역 NetTransfer 정리, 자기 singleton 포인터 초기화를 한다. 이 함수에는 `Disconnect/LeaveSession/ClearSession` 호출이 없다. [C](../../../analysis/decomp/online_menu00.c) |
| [판독] matching00 지역 `NetworkManager` | `@0x7100003798`은 자기 singleton·NetTransfer(group `0x2102`, 인자 `1`)·listener·동기 수신기를 만든다. `@0x7100003a64`는 session listener setter와 세션 잔존 시 `SetAllListener` 뒤 지역 자원을 정리한다. 이 소멸자도 `Disconnect/LeaveSession/ClearSession`을 호출하지 않는다. [C](../../../analysis/decomp/online_matching00.c) |
| [판독] 실제 통신 종료 요청 | menu00 `@0x710002d3ec`, matching00 `@0x7100003db4`의 `NetworkManager::Disconnect`는 각각 `bex::NetworkModule::Disconnect()`와 `bq::WorkModule::ClearSession()`을 호출한다. 지역 객체 해제와 다른 명시적 경로다. [menu00 C](../../../analysis/decomp/online_menu00.c)·[matching00 C](../../../analysis/decomp/online_matching00.c) |
| [판독] 장면 간 잔존 세션 사용 | menu00 Play `@0x7100037a00`은 `WaitSync(1)→FriendMatchSyncFinishSession→RequestCallScene(menu01)`로 이어지고, matching00 `@0x7100010a00`도 세션 setup 뒤 장면 교환을 요청한다. 기존 [online §5.6·3.2](../shell/online.md) 재사용 |
| [추정] 네트워크 소유 경계 | 지역 관리자 소멸 후 공용 listener로 넘기며 다음 화면이 잔존 세션을 사용할 수 있는 구조로 해석한다. 근거: menu00 `@0x710002c7a0`·matching00 `@0x7100003a64`의 [C](../../../analysis/decomp/online_menu00.c)·[C](../../../analysis/decomp/online_matching00.c), 전환 `menu00 @0x7100037a00`([online §5.6](../shell/online.md)). 모든 모드·최종 앱 종료까지의 수명은 [미확정] |
| [판독] 공용 네트워크 listener | main @0x710013cadc/@0x710013cb64의 단일 weak-handle 슬롯 덮어쓰기, @0x71001ea620의 공용 handler 복귀, @0x71001ea710의 0 tuple 해제를 새 C로 확인했다. 지역 Cancel의 누락 인자·세 번째 setter/dispatch는 [미확정]이다. [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c), 최신 §9.15.2 |

### 9.3 생성·참가·유지·해산의 호출 흐름

| 단계 | 원본 계약 |
|---|---|
| [판독] 연결과 방 생성 | menu00 `OnlineMenuImpl @0x710005c780→ConnectNpln @0x7100032520→CreateSession @0x71000340b0`; 방 없이 메뉴 종료할 때만 연결 종료. 방 생성 성공은 광장 대기실로 돌아가며 세션을 유지한다. [online §3.1·4.8](../shell/online.md) |
| [판독] 참가 | menu00 Join `@0x7100035a90`: NPLN 참가 성공 뒤 참가 요청/응답, 플레이어 데이터, 지도 데이터 대기 각 20 s, 최초 위치 전체 송신. 실패는 `LeaveSessionSilently` 경로다. 새 참가 요청이며 진행 중 게임 상태 복구의 근거는 아니다. [online §5.4·5.5](../shell/online.md) |
| [판독] 시작·입장 닫기 | menu00 Play `@0x7100037a00`은 입장 닫힘 대기·참가자 검사를 하고 `PlaySession(2,gameMode)` 후 공통 전환을 맞춘다. 시작은 연결 해제가 아니다. [online §5.6](../shell/online.md) |
| [판독] 나가기 요청 | menu00 `LeaveSession @0x710002e9e0`은 세션 존재·진행 Fiber 완료를 확인하고 `ClearFriendMatchPlayerUuIDList` 뒤 `+0x60`에 LeaveSessionFiber를 둔다. `@0x71000382f0`은 `RequestReserveLeaveSession(myStation)→NetworkModule::LeaveSession→GetResultLeaveSession==1` 동안 Wait 후 Sleep 0.5를 한다. 이는 Fiber의 API 결과 폴링이며 게임 frame ACK가 아니다. [C](../../../analysis/decomp/online_menu00.c) |
| [판독] 조용한 나가기 | menu00 `@0x710002ee7c`은 같은 존재/진행 검사·UUID 목록 정리 뒤 공용 `LeaveSessionSilentlyFiber`를 만든다. 이 호출자의 성공 반환 `1`은 요청 객체 생성까지이며 SDK 종료 성공을 뜻하지 않는다. [C](../../../analysis/decomp/online_menu00.c) |
| [판독] 해산 요청 | menu00 DissolveSession @0x710002ed78은 세션/진행 Fiber 검사 뒤 FiberLite를 만든다. PTR_LAB_71001c8b18 결합은 [미확정]이며 해산 본문 후보 @0x71000313f0을 후속에서 식별했다. 완료/실패는 §9.13.2·9.13.6을 따른다. [caller C](../../../analysis/decomp/online_menu00.c)·[후보 C](../../../ghidra_work/online/out/menu00.nro.c) |
| [판독] 화면에서 해산·나가기 | menu00 MainImpl `@0x710005a170`의 입력/람다 연결과 NetSession `@0x7100039830`의 해산 사건2·station 이탈 사건1은 [online §5.5](../shell/online.md) 재사용. 확인 대화상자 끝에서 네트워크 종료를 요청하는 흐름과 단순 화면 cleanup을 구별한다 |
| [미확정] Work 접점 | ClearSession main @0x710029f6b0의 네트워크 reset은 §9.15.5에서 판독했다. ClearFriendMatchPlayerUuIDList/FriendMatchSyncFinishSession 등 공용 Work 수명은 18 갈래 담당이다. menu00 @0x710002d3ec/@0x710002e9e0/@0x7100037a00([C](../../../analysis/decomp/online_menu00.c), [online §5.6](../shell/online.md)), main reset [C](../../../analysis/decomp/docs_gap_main.c) |

### 9.4 구조체·필드·식별자와 시작/결과의 경계

| 객체·필드 | 의미·근거 |
|---|---|
| [판독] menu00 관리자 `+0x40/+0x48/+0x50` | 오류 listener / 세션 listener / `NetMsgReceiverSync*`. `+0x58` FiberLite, `+0x60` 요청 Fiber, `+0xb8` 지역 참가 데이터 상태(생성 시 세션 유무로 2/0). `@0x710002bf80/@0x710002c7a0/@0x710002e9e0` [C](../../../analysis/decomp/online_menu00.c) |
| [판독] matching00 관리자 `+0x28/+0x30/+0x38` | 오류 listener / 세션 listener / `NetMsgReceiverSync*`. 지역 객체이며 생성/해제는 `@0x7100003798/@0x7100003a64`. [C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00 `+0x58:u64/+0x60:u16`, `+0x68:u64/+0x70:u16` | `StoreTeamStationId @0x71000040f0`은 메뉴값4에서 앞 쌍에 host station을 저장하고 뒤 쌍에는 첫 비로컬 사람 `PlayerWork::GetConstantID`를 저장한다. 세션 없음이면 뒤 쌍 Invalid, 연결 중 대상이 없으면 abort. 메뉴값4 경로 밖의 의미는 [미확정]. [C](../../../analysis/decomp/online_matching00.c) |
| [판독] station·slot·PlayerID | main `SetupOnlineControllerAssign @0x710013c440→@0x71001bcfd0`의 매핑, PlayerInfo stride `0x50`·slot `+0x11`, PlayerID 매핑 stride `0x20`·slot `+0x18`은 [§2.1](12_online_sync.md) 재사용. 장면 이름·표시 actor 번호를 station/slot 대신 쓰지 않는다 |
| [설계] `sessionEpoch` | 오래된 세션 메시지 차단을 위한 웹 계약이다. 원본의 숫자 epoch 필드·주소는 확인되지 않았다. [§6.3·8](12_online_sync.md), [DESIGN §10](../../DESIGN.md). 원본 구조체에 가상 offset을 만들지 않는다 |
| [판독] 씬 barrier | main StartSync `@0x7100218cd0`, IsSynced `@0x71002197bc`의 Work blob·PlayerID별 준비 확인은 [§2.2](12_online_sync.md) 재사용. 방 입장·SDK 입력 ready와 같은 flag로 합치지 않는다 |
| [판독] seed와 SDK 시작 | main seed `@0x7100162210`의 reset0·FIFO·호스트 역할, NetworkGameScene `@0x71001c94cc`의 seed 조회·sync 시작/실패는 [§2.2·4.1](12_online_sync.md) 재사용. seed 조회 실패에서도 phase가 다음으로 간다는 기존 경계를 유지한다 |
| [판독] 진행·stop | main `@0x7100152650`의 세션 state≠6 정리, `StopSync @0x71001bd398`·Fiber `@0x71001be030`의 SDK stop은 [§4.2](12_online_sync.md) 재사용. 입력 동기 종료와 방 세션 Leave/Disconnect는 별도 경로다 |
| [미확정] 결과 합의 | main `OnGameMain @0x71002e1818/OnEndingInit @0x71002e1b14`와 대표 게임 결과 writer에 전원 result digest 합의·최종 권한을 확정할 근거가 없다. [§5·7](12_online_sync.md). 시작 barrier·seed 전달·channel16(delay)을 결과 합의로 대체하지 않는다 |

### 9.5 화면 listener·API 폴링과 웹 구독

[판독] 원본의 화면은 지역 listener를 설치하고 공용 API 상태를 폴링한다. menu00 `SetErrorListener @0x710002c6ac`, `SetSessionEventListener @0x710002c708`, `CancelErrorListener @0x710002c99c`, `CancelSessionEventListener @0x710002c9d4`는 전역 NetworkModule setter를 호출한다([C](../../../analysis/decomp/online_menu00.c)). matching00 `@0x7100003fe4/@0x7100004050/@0x7100004088/@0x7100003b74`도 같은 종류의 setter 호출이다([C](../../../analysis/decomp/online_matching00.c)).

[판독] Connect 완료의 0.5 s 폴링은 matching00 `@0x7100012230`의 기존 [online §5.7](../shell/online.md), 대기실의 프레임별 세션/인원 확인은 menu00 `ComUiNetLobbySessionStatus::Update @0x7100075c30`의 [online §5.5](../shell/online.md) 재사용이다. 나가기 결과 Wait는 menu00 `@0x71000382f0`([C](../../../analysis/decomp/online_menu00.c))다. 어느 주기도 SDK 입력 frame 주기와 동일시하지 않는다.

[데이터] 웹 `SocketIoOnline.poll()`은 `out`을 반환한 뒤 빈 배열로 바꾼다([socketio.ts](../../script/app/common/net/socketio.ts), `poll/out`). `PlazaNet.poll()`은 그 결과를 온라인 흐름과 광장 queue로 나눈다([ui.ts](../../script/app/scene/world/plaza/ui/ui.ts), `PlazaNet.plaza/poll`). 화면 두 곳이 원 어댑터를 직접 poll하면 같은 사건을 함께 받을 계약이 없다.

[설계] `appNet`이 원 어댑터를 한 번 drain하고 세션 상태를 반영한 뒤 구독자에게 순서대로 전달한다. 새 구독자는 현재 상태를 즉시 받고, 해제된 화면은 이후 사건을 받지 않는다. 이는 원본의 동시 다중 구독을 판독한 결론이 아니라 [§8.2·8.3](12_online_sync.md)·[DESIGN §10](../../DESIGN.md)의 웹 계약이다.

### 9.6 `disconnect()` 8곳의 근거별 분류

[데이터] §8.4의 8개 위치를 현재 [part.ts](../../script/app/scene/world/plaza/ui/part.ts)·[ui.ts](../../script/app/scene/world/plaza/ui/ui.ts)·[flow.ts](../../script/app/scene/menu/online/flow.ts)에서 확인했다. 47행은 wrapper 메서드이며 내부 실제 호출은 48행이다. §8.4의 원문은 보존하고 아래에 분류를 보완한다.

| 위치·실제 조건 | 원본 근거 | 웹 판정 |
|---|---|---|
| [데이터] part.ts:206 `dispose`가 원 어댑터 종료 ([part.ts](../../script/app/scene/world/plaza/ui/part.ts)) | [판독] menu00 관리자 소멸 `@0x710002c7a0`은 Disconnect 없음. [C](../../../analysis/decomp/online_menu00.c) | [설계] 화면 구독 해제만. 장면 이동을 세션 종료로 처리하지 않음 |
| [데이터] ui.ts:47~48 `PlazaNet.disconnect`의 전달 함수 ([ui.ts](../../script/app/scene/world/plaza/ui/ui.ts)) | [판독] menu00 명시적 Disconnect `@0x710002d3ec`와 지역 해제 `@0x710002c7a0`은 다름. [C](../../../analysis/decomp/online_menu00.c) | [설계] 화면 해제는 구독 해제, 실제 종료 요청은 `appNet.leave(reason)`. 이 메서드가 항상 화면 해제라고 단정하지 않음 |
| [데이터] ui.ts:327 친구 흐름 완료 && `!flow.room` ([ui.ts](../../script/app/scene/world/plaza/ui/ui.ts)) | [판독] menu00 `OnlineMenuImpl @0x710005c780`도 방 없이 끝날 때 종료. [online §3.1](../shell/online.md) | [설계] 실제 세션 상태가 없을 때만 종료. `flow.result`가 error면 `leave('error')`, leave/dissolve면 해당 이유, 사용자 취소면 `leave('cancel')`; 화면의 오래된 room 사본만으로 잔존 세션을 끊지 않음 |
| [데이터] flow.ts:275 `isConnected && !room` ([flow.ts](../../script/app/scene/menu/online/flow.ts)) | [판독] menu00 `@0x710005c780`의 같은 조건. [online §3.1](../shell/online.md) | [설계] 방 없는 메뉴 종료 `leave('cancel')`. 오류를 표시한 종료라면 error 이유 보존 |
| [데이터] flow.ts:529 대기실 `pendingError` 표시 뒤 ([flow.ts](../../script/app/scene/menu/online/flow.ts)) | [판독] menu00 NetError `@0x7100039600`·NetSession `@0x7100039830`. [online §5.5](../shell/online.md) | [설계] `leave('error')`; 해산 사건이면 `leave('dissolved')`. 오류 창 중 화면 구독 해제와 연결 정리는 별도 |
| [데이터] flow.ts:649 매칭 결과 `'abort'` ([flow.ts](../../script/app/scene/menu/online/flow.ts)) | [판독] matching00 `CancelMatching @0x7100013164`는 세션 없을 때 Disconnect. [online §5.7](../shell/online.md) | [설계] `leave('cancel')`. 기존 세션이 있으면 매칭 취소와 그 세션 해산을 별도로 판단 |
| [데이터] flow.ts:669 실패 후 `again!==0→end('cancel')` ([flow.ts](../../script/app/scene/menu/online/flow.ts)) | [판독] matching00 CheckFail `@0x71000125c0`의 “그만둔다→CancelMatching”. [online §5.7](../shell/online.md) | [설계] §8.4의 `leave('error')` 분류를 `leave('cancel')`로 보완. 실패 뒤 사용자 재시도 거절은 취소 이유 |
| [데이터] flow.ts:706 매칭 `pendingError` 표시 뒤 ([flow.ts](../../script/app/scene/menu/online/flow.ts)) | [판독] matching00 RequestError `@0x7100004578`, 공용 오류 복귀는 [online §5.7·8](../shell/online.md) | [설계] `leave('error')`. 취소 버튼 경로와 구별 |

### 9.7 끊김·재접속·호스트 이탈·슬립

| 사건 | 원본에서 확인한 것 | 웹 차이·남은 경계 |
|---|---|---|
| [판독] 방장 해산 | menu00 사건2 `NetSessionListener @0x7100039830`은 해산 문구·menu00 복귀. [online §5.5](../shell/online.md) | [설계] `dissolved`로 세션을 끝내고 멤버·구독 상태를 정리. [미확정] 공용 오류 창과 모드별 복귀 전체 |
| [판독] station 이탈 | menu00 같은 listener 사건1: 자기 이탈 B3, 다른 station은 LeftStation 정리. 예약 이탈이 아니고 플레이 중 `+0x31`이면 B3. [online §5.5](../shell/online.md) | [설계] 단순 손님 퇴장·해산·게임 중 오류를 구별. “host가 떠나도 계속”을 원본 공통 규칙으로 두지 않음 |
| [판독] matching00 지역 이탈 감시 | `NetSessionListener @0x710000f7fc`은 사건 정보를 저장하고 메시지 `0x5f4e4502`·사건1에서 Work 쌍 `+0x3d08/+0x3d10` 또는 지역 쌍 `+0x68/+0x70`과 일치하면 `RequestError(2)`. 뒤 쌍의 생산자는 `StoreTeamStationId @0x71000040f0`. [C](../../../analysis/decomp/online_matching00.c) | [미확정] Work 쌍의 이름/수명은 18_scene_work 접점. 이 비교가 모든 모드의 호스트 교체 규칙을 뜻하지 않음 |
| [판독] SDK 참가 목록 변경·seed host 변경 | main `@0x7101026330→@0x71010268e0`의 입력 ring 재시작, `@0x7100161eb4/@0x71001624ac`의 seed 재동기. [§4.1·4.2](12_online_sync.md) | [미확정] 네트워크 계정 재인증·같은 station 재접속·게임 snapshot/RNG 소비 index/점수 복원. 이 두 재동기로 게임 중간 재개를 주장하지 않음 |
| [판독] 재입장 데이터·허용 호출 | menu00 Join @0x7100035a90, matching00 @0x7100010a00의 기존 [online §3.2·8](../shell/online.md) 재사용. main AllowReentry @0x71001ea1b8 및 ReEntryFiber @0x710034c564/@0x710034c970은 새 [C](../../../analysis/decomp/docs_gap_main.c)로 판독(§9.15.4) | [미확정] 저장 방 검색/재참가는 확인됐지만 자동 reconnect·최종 모드·host 승계·게임 snapshot 전체는 §9.15.6 잔여 |
| [데이터] 현 웹 끊김/재참가 | [socketio.ts](../../script/app/common/net/socketio.ts)의 disconnect 후 `closeSocket`, 기존 [online §9.6](../shell/online.md)의 새 station 재참가·재접속 없음 | [설계] 연결 재시도와 방/게임 재가입을 분리. 15 s 핑 감지는 기존 웹 설정이며 원본 timeout 값으로 사용하지 않음 |
| [미확정] Switch 슬립·resume | [§8.5](12_online_sync.md)는 슬립을 미확정으로 기록한다. main 목록의 `nn::oe::SetResumeNotificationEnabled @0x710144d2e0`는 외부 심볼 존재만 확인된다. [main 목록](../../../analysis/functions/main.nso.tsv) | [미확정] 슬립 진입/복귀 소비자·세션 처리 코드 주소 미식별. 브라우저 탭 숨김을 Switch 슬립으로 자동 대응시키지 않음 |
| [설계] 탭 숨김·오프라인 복귀 | [§6.1·8.5](12_online_sync.md)·[DESIGN §10](../../DESIGN.md)의 웹 정책 대상 | [설계] 숨김만으로 Disconnect하거나 온라인 frame을 로컬 backlog 폐기로 건너뛰지 않는 안을 추천한다(미승인). 숨김 제한시간·오프라인 전환 종료 시점은 §9.11 사용자 확인에 남김 |

### 9.8 애니·효과·소리·카메라·에셋·상호작용

[판독: 어셈블리] 대기실 안내의 방장/손님 라벨은 menu00 `SetGuide @0x7100076440`의 기존 [online §4.6·10](../shell/online.md) 문자열 판독을 재사용한다. 해산·나가기 문구의 표시와 세션 종료 완료 시점은 같은 증거가 아니다.

[판독] menu00 Play `@0x7100037a00`의 BGM 정지·`SQ_SE_MENU00_TRANSITION_WHO`·0.5 s 페이드·WaitSync(1)·1.0 s 대기는 [online §5.6·7](../shell/online.md) 재사용이다. menu00 `SelectedBalloonImpl @0x710005ed30`의 온라인 카메라/플레이어 Stop과 메시지7 시작은 같은 §5.6 정정에 있다. 소리·페이드·카메라 정지를 연결 해제로 바꾸지 않는다.

[판독] 광장 위치·스탬프·원격 actor 표시는 menu00 `@0x710003fd64/@0x71000421e0`와 [광장 §5.1](../shell/plaza_3d.md), 세션 끝/멤버 이탈 정리는 `NetSessionListener @0x7100039830`의 [online §5.5](../shell/online.md) 재사용이다. [설계] 화면 actor·UI 자원은 화면 수명으로 정리하고 session station/slot 상태는 `appNet`에 둔다([§8](12_online_sync.md), [DESIGN §10](../../DESIGN.md)).

[데이터] 이번 조사에는 새 애니·효과·소리·카메라 에셋 분석/변환이 없다. 기존 온라인 레이아웃·라벨·소리 목록은 [online §2·7](../shell/online.md), 광장 UI 목록은 [plaza §5](../shell/plaza_3d.md)의 실제 경로·필드 근거를 재사용한다.

### 9.9 웹 설계·의사 흐름

| 층·단계 | 책임 |
|---|---|
| [설계] `game/lib/net` 코어 + 엔진/통신 어댑터 | 상태 전이·frame 입력 buffer·검증은 import 0 코어, 브라우저/Socket.IO I/O는 어댑터. 실제 분리는 두 번째 사용처인 게임 동기가 생길 때 한다. [DESIGN §10.1·10.2·10.4](../../DESIGN.md) |
| [설계] `app/common/net/session.ts` | `appNet()`이 연결·세션·station/slot·웹 epoch·오류/취소 이유를 소유하고 단일 poll→현재 상태 갱신→구독 전달을 담당한다. [§8.2·8.3](12_online_sync.md), [DESIGN §10](../../DESIGN.md) |
| [설계] `app/scene/{menu,world,mode,system}` | 연결·참가·Leave 요청과 화면 구독만 담당한다. cleanup은 구독/표시 객체만 해제한다. SceneBase/Work 세부 구현은 18_scene_work의 판독과 연결한다. [DESIGN §10.2·10.5](../../DESIGN.md), [§9.2](12_online_sync.md) |
| [설계] `app/minigame/{frame,kit,mg####}` | frame이 참가자 매핑·seed·시작 허용과 FrameGate를 받아 setup/입력을 전달한다. mg#### 로직은 `appNet`을 직접 부르지 않고 고정1/60·주입 난수·f32를 유지한다. [DESIGN §3·10.3·10.5](../../DESIGN.md), [§6.3·8.2](12_online_sync.md) |
| [설계] `dev/net/fake.ts` | app 공개 API로 가짜 어댑터를 연결 전에 주입한다. app→dev import는 0이다. [DESIGN §10.1·10.4](../../DESIGN.md) |
| [설계] 화면 진입→전환 | `subscribe→현재 세션 snapshot→화면 갱신→unsubscribe`; connection/session은 전환을 통과한다. 원본 지역 관리자 해제 근거는 menu00 `@0x710002c7a0`·matching00 `@0x7100003a64`([menu00 C](../../../analysis/decomp/online_menu00.c)·[matching00 C](../../../analysis/decomp/online_matching00.c)) |
| [설계] 종료 요청 | `leave(reason)→게임 FrameGate/결과 확정 중단→필요한 방 종료 요청→세션/매핑/queue 정리→복귀`. 요청·완료·실패를 구별하고 늦은 사건은 이전 epoch로 차단한다. [§6.3·8.3](12_online_sync.md), 원본 나가기 요청/폴링 menu00 `@0x710002e9e0/@0x71000382f0`([C](../../../analysis/decomp/online_menu00.c)) |

[설계] 기본은 판독된 원본 분기다. 전체 상태 복구가 미확정인 동안 자동 게임 중간 재개·CPU 대체·host 결과 덮어쓰기를 구현 계약으로 확정하지 않는다. 향후 선택은 미승인 추천으로 남기며 이 작업에서는 코드를 바꾸지 않는다. 근거: main `@0x71001c94cc/@0x7100162210/@0x71002e1818`의 기존 [§2.2·4.1·5·7](12_online_sync.md).

[설계] 공용 SceneBase·Work 소유권 및 요청/cleanup 경계 → [18_scene_work.md](18_scene_work.md) §3·§5·§8·§9.
### 9.10 검증 기대값

[설계] 아래는 후속 구현의 기대값이며 이번 원본 실행/웹 실행 결과가 아니다. 근거는 각 행의 원본 주소 또는 현재 웹 필드·함수다.

| 경우 | 기대값·근거 |
|---|---|
| [설계] 광장→모드 선택→항구→광장 | 연결 객체·세션·station/slot 유지, 화면 구독만 교체. menu00 소멸 `@0x710002c7a0`([C](../../../analysis/decomp/online_menu00.c)), [§8.6](12_online_sync.md) |
| [설계] 화면 두 곳 동시 구독 | 같은 순서의 사건을 각 1회 받고 원 어댑터 poll은 1회. 해제 뒤 해당 화면 수신 0, 새 화면은 현재 state를 즉시 받음. [socketio.ts의 out/poll](../../script/app/common/net/socketio.ts), [§8.3](12_online_sync.md) |
| [설계] 방 없는 메뉴 취소·669행 재시도 거절 | `cancel` 이유 보존, 잔존 세션 존재 여부 검사. menu00 `@0x710005c780`·matching00 `@0x7100013164`의 [online §3.1·5.7](../shell/online.md), [flow.ts의 again/result](../../script/app/scene/menu/online/flow.ts) |
| [설계] 나가기·해산·통신 오류 | 요청과 완료를 분리, 현재 멤버/원격 표시 정리, 늦은 사건으로 이전 actor가 살아나지 않음. menu00 `@0x71000382f0/@0x7100039830`([C](../../../analysis/decomp/online_menu00.c), [online §5.5·9.6](../shell/online.md)) |
| [설계] 시작 barrier·seed·입력 준비 일부 미완료 | 해당 준비 상태를 구분해 FrameGate에 전달. 원본 seed 실패 phase는 별도 보장 확인 전 “항상 무한 대기”로 바꾸지 않음. main `@0x71002197bc/@0x71001c94cc/@0x7100162210`의 [§2.2·4.1](12_online_sync.md) |
| [설계] 끊김 뒤 재접속·이전 게임 결과 도착 | 복구 승인이 없는 상태에서 같은 game frame을 재개하거나 이전 결과를 commit하지 않음. epoch 검사는 웹 규칙. main SDK 재시작 `@0x71010268e0`와 결과 `@0x71002e1b14`의 [§4.2·5·6.3](12_online_sync.md) |
| [설계] 탭 숨김 후 복귀 | 숨김 사건만으로 Switch 슬립/원본 이탈을 합성하지 않음. 공유 frame을 로컬 backlog 점프로 건너뛰지 않음. [§6.1·8.5](12_online_sync.md), [DESIGN §3·10](../../DESIGN.md) |

### 9.11 미확정·사용자 확인

[미확정] 아래9항목은 상위 공백 ID를 유지한 현재 목록이다. 최신 상태는 §9.15.6의0전체 해결·6부분해결·3남음이다. 원본 실행 대조는 없으며 성공률·시간을 실측값으로 쓰지 않는다. 근거: [§7·8.5·9.15.6](12_online_sync.md).

| ID | 남은 항목·필요 근거 |
|---|---|
| [미확정] U1 | main 전역 설치·파괴/앱 최종 종료 caller. @0x7100150a80의 내부 자원 소유는 확인했지만 전체 수명은 미확정. [C](../../../analysis/decomp/docs_gap_main.c)·[§9.15.2·9.15.6](12_online_sync.md) |
| [미확정] U2 | main @0x710013cadc/@0x710013cb64의 단일 슬롯 교체·@0x71001ea710의 0 해제는 확인. 지역 Cancel 누락 인자·세 번째 setter/dispatch·공용 owner는 N4/N5·M3 잔여. [C](../../../analysis/decomp/docs_gap_main.c)·[§9.15.2](12_online_sync.md) |
| [미확정] U3 | main Disconnect @0x710013c04c/Leave @0x710013c7f8·예약 @0x71001eacb4·ClearSession @0x710029f6b0의 wrapper/직접 reset은 확인. SDK 완료/실패·예약 제거·간접 reset은 N1~N3/N6~N8·M7/M8. [C](../../../analysis/decomp/docs_gap_main.c)·[§9.15.3·9.15.5](12_online_sync.md) |
| [미확정] U4 | menu00 DissolveSession @0x710002ed78의 PTR_LAB_71001c8b18 결합과 SDK 해산 완료. 후보 @0x71000313f0은 확보했으나 호출 연결은 미확정. §9.13.2·9.13.5·A1. [caller C](../../../analysis/decomp/online_menu00.c)·[후보 C](../../../ghidra_work/online/out/menu00.nro.c) |
| [미확정] U5 | main AllowReentry @0x71001ea1b8/ReEntryFiber @0x710034c564/@0x710034c970의 저장 재참가 흐름은 확인. 최종 callback/모드·host 승계·복구 범위는 N9~N15/M9·U7. [C](../../../analysis/decomp/docs_gap_main.c)·[§9.15.4](12_online_sync.md) |
| [미확정] U6 | Switch 슬립/복귀의 실제 네트워크 소비자. 외부 심볼 `main @0x710144d2e0`의 존재만 [main 목록](../../../analysis/functions/main.nso.tsv)으로 확인. 코드 주소 미식별 A2 |
| [미확정] U7 | 진행 중 끊김 후 게임 전체 상태·RNG 소비 위치·점수 복원/대체. main `@0x71010268e0/@0x71001624ac`의 기존 [§4.1·4.2](12_online_sync.md)는 입력/seed 재동기까지만. 복구 호출자 미식별 A3 |
| [미확정] U8 | seed 조회 실패의 상위 보장과 실제 공통 step gate 연결. main `@0x71001c94cc/@0x710050f0d4`의 기존 [§2.2·3.3·7](12_online_sync.md). 이 갈래에서는 재판독/요청 범위를 늘리지 않음 |
| [미확정] U9 | 결과/end-frame 전원 확인·최종 권한·불일치 처리. main `@0x71002e1818/@0x71002e1b14`의 기존 [§5·7](12_online_sync.md). 준비도와 별개로 미확정 유지 |

| 사용자 확인 | 미승인 추천·범위 |
|---|---|
| [설계] 탭 숨김 | 숨김만으로 세션을 끝내지 않고 통신 상태에 따라 오류 처리하는 안을 추천. 숨김 유지 제한시간은 미승인. 원본 슬립은 U6이며 [§8.5](12_online_sync.md)와 별개 |
| [설계] 재접속 | 초기에는 연결 오류 표시·명시적 새 참가를 추천. 자동 재시도 횟수/시간·대기 UI와 게임 중간 복구는 미승인. [§6.3·8.5](12_online_sync.md), U5·U7 |
| [설계] 오프라인 복귀 | 사용자가 오프라인 전환을 확정하면 Leave 요청을 시작하고 완료/실패를 기록한 뒤 복귀하는 안을 추천. SDK 세부 실패 처리와 정확한 전환 시점은 미승인. menu00 `@0x71000382f0`([C](../../../analysis/decomp/online_menu00.c)), [§8.5](12_online_sync.md) |

### 9.12 준비도·출처 대응·새 판독·Ghidra 요청

#### 9.12.1 준비도와 출처 대응

| 준비도 | 가능한 범위·근거 |
|---|---|
| [설계] 바로 가능 | `appNet` 앱 소유·화면 구독 해제·단일 poll·현재 상태 전달·취소/오류 이유 분리 설계. main의 전체 앱 수명 동등성은 주장하지 않음. [§8](12_online_sync.md), [DESIGN §10](../../DESIGN.md), menu00 `@0x710002c7a0/@0x710002d3ec`([C](../../../analysis/decomp/online_menu00.c)) |
| [설계] 근사 필요 | NPLN→웹 방 서버 대응, 오류 코드/핑 timeout·웹 epoch·탭 정책. 원본값/원본 슬립으로 표기하지 않음. [online §9.5·9.6](../shell/online.md), [§6.3·8.5](12_online_sync.md) |
| [미확정] 판독 필요 | 전역 전체 수명·listener dispatch·SDK 종료/실패·간접 reset·재입장 최종 callback/host 승계·슬립·게임 복구·결과 합의. 최신 U1~U9/N1~N15/M1~M9는 [§9.15.6·9.15.7](12_online_sync.md) |

| 이 절의 내용 | 원본/웹 출처 대응 |
|---|---|
| [판독] §9.2·9.3·9.4·9.5 | menu00 `@0x710002bf80/@0x710002c7a0/@0x710002d3ec/@0x71000382f0`와 matching00 `@0x7100003798/@0x7100003a64`; [menu00 C](../../../analysis/decomp/online_menu00.c)·[matching00 C](../../../analysis/decomp/online_matching00.c), 세부 주소는 새 판독 표 |
| [판독] §9.3·9.4·9.7·9.8 | menu00 Join/Play `@0x7100035a90/@0x7100037a00`, listener `@0x7100039830`; [online §3·5·7·8](../shell/online.md), main StartSync/IsSynced/NetworkGameScene/slot/seed `@0x7100218cd0/@0x71002197bc/@0x71001c94cc/@0x710013c440/@0x7100162210`; [기존 §2·4·5](12_online_sync.md), [공용 감사 §5.3](common_system_audit.md) |
| [데이터] §9.5·9.6 | 웹 `SocketIoOnline.out/poll`, `PlazaNet.poll/disconnect`, `OnlineFlow.room/pendingError/again/result`; [socketio.ts](../../script/app/common/net/socketio.ts)·[ui.ts](../../script/app/scene/world/plaza/ui/ui.ts)·[flow.ts](../../script/app/scene/menu/online/flow.ts)·[part.ts](../../script/app/scene/world/plaza/ui/part.ts) |
| [설계] §9.9·9.10·9.11·준비도 | [DESIGN §3·10](../../DESIGN.md)와 [§6.3·8](12_online_sync.md). 원본 판독과 웹 선택을 분리 |

#### 9.12.2 최초 새 판독 목록

[데이터] 최초 조사에서 새로 읽은 것은 아래 21함수의 기존 C뿐이다. 후속14함수는 §9.13.7에 따로 기록한다. [INDEX](../../../analysis/decomp/INDEX.tsv)와 모듈별 TSV로 주소/본체를 대조했으며 원본 C·INDEX·함수 목록은 수정하지 않았다. 나머지 destructor wrapper·이미 완료된 함수·어셈블리 본문은 새로 읽지 않았다.

| 모듈 | 새 판독 함수·주소 | 기존 C |
|---|---|---|
| [판독] menu00.nro | `NetworkManager::NetworkManager @0x710002bf80` | [online_menu00.c](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00.nro | `SetErrorListener @0x710002c6ac` | [같은 C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00.nro | `SetSessionEventListener @0x710002c708` | [같은 C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00.nro | `NetworkManager::~NetworkManager @0x710002c7a0` | [같은 C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00.nro | `CancelErrorListener @0x710002c99c` | [같은 C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00.nro | `CancelSessionEventListener @0x710002c9d4` | [같은 C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00.nro | `NetworkManager::Disconnect @0x710002d3ec` | [같은 C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00.nro | `NetworkManager::LeaveSession @0x710002e9e0` | [같은 C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00.nro | `NetworkManager::DissolveSession @0x710002ed78` | [같은 C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00.nro | `NetworkManager::LeaveSessionSilently @0x710002ee7c` | [같은 C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu00.nro | `LeaveSessionFiber::Update @0x71000382f0` | [같은 C](../../../analysis/decomp/online_menu00.c) |
| [판독] matching00.nro | `NetworkManager::NetworkManager @0x7100003798` | [online_matching00.c](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | `NetworkManager::~NetworkManager @0x7100003a64` | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | `CancelSessionEventListener @0x7100003b74` | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | `NetworkManager::IsMyPC @0x7100003c0c`(WorkModule::IsLocalPlayer 위임만 확인) | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | `NetworkManager::Disconnect @0x7100003db4` | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | `SetErrorListener @0x7100003fe4` | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | `CancelErrorListener @0x7100004050` | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | `SetSessionEventListener @0x7100004088` | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | `StoreTeamStationId @0x71000040f0` | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | `NetSessionListener::ReceiveMessageImpl @0x710000f7fc` | [같은 C](../../../analysis/decomp/online_matching00.c) |

#### 9.12.3 최초 Ghidra 요청 이력·현재 확보 상태

[데이터] 최초 요청9주소(R1~R9), 후속6주소(R10~R15), ClearSession(R16)은 당시 C가 없어 요청했다. 현재16개 모두 main.nso [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)·[main TSV](../../../analysis/functions/main.nso.tsv)에 있으며 새 판독은 §9.15.1이다. 아래 표는 최초 요청 이유를 보존한 이력이며 현재 추출 요청은 §9.15.7의 빈 하위 함수15주소다. 새 추출은 하지 않았다.

| ID | 모듈·주소·함수 | 최초 요청 이유(현재 확보·§9.15 판독) |
|---|---|---|
| [데이터] R1 | main.nso `@0x7100150a80 FUN_7100150a80` | 기존 [§3.3·4.1](12_online_sync.md)의 생성 필드는 재사용. 전체 네트워크 소유자 설치/최종 해제 호출자 연결용 C 요청 ([main TSV](../../../analysis/functions/main.nso.tsv)) |
| [데이터] R2 | main.nso `@0x710013c04c bex::NetworkModule::Disconnect` | 명시적 종료의 내부 위임·수명·완료 조건 ([main TSV](../../../analysis/functions/main.nso.tsv)) |
| [데이터] R3 | main.nso `@0x710013c7f8 bex::NetworkModule::LeaveSession` | 방 이탈과 통신 Disconnect의 내부 차이·실패 처리 ([main TSV](../../../analysis/functions/main.nso.tsv)) |
| [데이터] R4 | main.nso `@0x710013cadc bex::NetworkModule::SetErrorListener` | weak handle 설치/해제·공용 오류 owner ([main TSV](../../../analysis/functions/main.nso.tsv)) |
| [데이터] R5 | main.nso `@0x710013cb64 bex::NetworkModule::SetSessionEventListener` | listener 교체/해제·동시 구독 가능성 ([main TSV](../../../analysis/functions/main.nso.tsv)) |
| [데이터] R6 | main.nso `@0x71001ea620 bq::Net::SetAllListener` | menu00/matching00 해제 뒤 공용 listener 복귀의 실제 대상 ([main TSV](../../../analysis/functions/main.nso.tsv)) |
| [데이터] R7 | main.nso `@0x71001ea710 bq::Net::CancelAllListener` | 매칭 진입에서 임시 listener로 넘어가는 공용 경계 ([main TSV](../../../analysis/functions/main.nso.tsv)) |
| [데이터] R8 | main.nso `@0x71001ea1b8 bq::Net::AllowReentry` | 재입장·host 이어받기 허용과 실제 복구의 관계 ([main TSV](../../../analysis/functions/main.nso.tsv)) |
| [데이터] R9 | main.nso `@0x71001eacb4 bq::Net::RequestReserveLeaveSession` | 예정 이탈 표시와 오류 억제·실제 종료의 순서 ([main TSV](../../../analysis/functions/main.nso.tsv)) |

[데이터] R1~R9의 주소·이름·크기는 [main TSV](../../../analysis/functions/main.nso.tsv), 현재 확보된 본체는 [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)가 근거다. 최초 미식별 A묶음3개는 숫자 주소 수에 합치지 않는다. 최신9행의 미식별/결합 상태는 §9.15.6을 따른다.

| ID | 모듈·주소 | 식별 요청·이유 |
|---|---|---|
| [미확정] A1 | menu00.nro, 후보 @0x71000313f0·호출 결합 미확정 | DissolveSession @0x710002ed78의 PTR_LAB_71001c8b18와 후보 결합을 확인해야 한다. §9.13.2·9.13.6. [caller C](../../../analysis/decomp/online_menu00.c)·[후보 C](../../../ghidra_work/online/out/menu00.nro.c) |
| [미확정] A2 | main.nso, 코드 주소 미식별 | Switch 슬립/복귀 notification 소비자와 네트워크 종료·재개 호출자. 외부 `SetResumeNotificationEnabled @0x710144d2e0` 심볼만 존재: [main TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] A3 | main.nso·모드 NRO, 코드 주소 미식별 | 전역 네트워크 최종 해제 및 host 승계/게임 snapshot 복구 호출자. 기존 main `@0x7100150a80/@0x71010268e0/@0x71001624ac`의 [§3.3·4.1·4.2](12_online_sync.md)로는 호출자를 식별 못 함 |

[설계] 후속 통합은 출처 절 끝에 정리본 링크 한 줄만 추가한다. [online §5.5·5.6·8](../shell/online.md), [plaza §5](../shell/plaza_3d.md), [공용 감사 §5.3](common_system_audit.md)이 대상이며 README 수정은 필요 없다. 이번에는 이 출처 문서들을 수정하지 않았다.

### 9.13 미확정 후속 caller/callee 조사

[데이터] U1~U9의 기존 C 공백만 후속 조사했다. 최초21함수(§9.12.2)와 완료된 함수는 재판독하지 않았다. 추가14함수·누계35함수이며 주소는 §9.13.7이다. [INDEX](../../../analysis/decomp/INDEX.tsv)·모듈별 TSV·C 헤더를 대조했다.

#### 9.13.1 menu01 수명·host/station 사건

| 분기 | 판독과 남은 경계 |
|---|---|
| [판독] 지역 생성·해제 | menu01.nro 생성자 @0x710002f078은 자기 singleton, NetTransfer(group 0x2004, 인자1), Entity·ComListener·세션 listener·수신기를 만들고 전역 NetworkModule에 listener를 설치한다. 소멸자 @0x710002f840은 세션 잔존 시 SetAllListener, 지역 자원·singleton을 정리하며 Disconnect/LeaveSession/ClearSession을 호출하지 않는다. [menu01 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] 필드·명시적 종료 | menu01 관리자 +0x40 HandleSource, +0x48 세션 listener, +0x50 동기 수신기, +0x58 진행 객체, +0x60 RankingDataHolder. Disconnect @0x710002fcac은 공용 Disconnect와 Work ClearSession을 호출한다. SetSessionEventListener @0x710002f71c/CancelSessionEventListener @0x710002fa1c은 공용 setter 위임이며 해제 인자는 C에서 완전 복원되지 않는다. [menu01 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] 사건 저장·가입 | NetSessionListener::ReceiveMessageImpl @0x71000329e0은 listener +0x10 사건, +0x18/+0x20 ConstantID 쌍, +0x30 발생 flag를 저장한다. 메시지0x5f4e4502의 사건0은 Work JoinedStation으로 전달한다. [menu01 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] 사건2 | 같은 @0x71000329e0은 이전 Work host 쌍 +0x3d18/+0x3d20을 보관하고 사건 쌍을 SetHostConstantId로 설정한다. 이전/새 host PlayerID 조회 뒤 SetErrorReturnSceneName("menu01"), RequestError(3,"sys_error_B2",oldID,newID), Wipe pause 0xc를 요청한다. [menu01 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [미확정] 사건2 공통 의미 | menu00 @0x7100039830의 해산 문구([online §5.5](../shell/online.md))와 위 host 갱신은 장면별 반응이다. SDK 사건2 enum·host 승계 완료·플레이 계속은 확정하지 않는다. main listener/재입장 @0x710013cb64/@0x71001ea620/@0x710034c970은 [C](../../../analysis/decomp/docs_gap_main.c)로 확보했지만 최신 잔여는 §9.15.6이다 |
| [판독] 사건1·자기 이탈 | menu01 @0x71000329e0은 Work 로컬 쌍 +0x3d08/+0x3d10과 같으면 NetTransfer Clear·Work LeftStation을 호출한다. 사람 존재 helper/예약 이탈에 걸리지 않는 오류 갈래는 menu00·reason4·sys_error_B3 복귀를 요청한다. 예약 이탈은 CancelReserveLeaveSession으로 구별한다. [menu01 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] 사건1·다른 station | 같은 @0x71000329e0은 해당 NetTransfer Clear·Work RequestLeftStation 뒤 departed/로컬 예약 이탈·현재 host 일치·다른 remote human 존재 여부로 분기한다. 오류 갈래는 menu01의 B1/B3 또는 저장 ReentryData Clear·SaveRequest 뒤 menu00의 B9다. 모든 host 이탈 후 계속하는 규칙은 아니다. [menu01 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] 사람 존재 helper | FUN_71000331b0 @0x71000331b0은 GetPlayerList(...,4)에서 이탈자와 다른 PlayerType0이 있으면0, 없으면 진행 객체 정리·RequestError(4,"sys_error_B9",Invalid,Invalid) 뒤1이다. FUN_7100033490 @0x7100033490은 로컬과 이탈자 모두와 다른 PlayerType0이 있으면0, 없으면1이다. [menu01 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [미확정] Work 접점 | 목록 필터4 전체 정의, ConstantID 생성/교체 수명, LeftStation/RequestLeftStation 제거 시점은 공용 Work 담당이다. [18_scene_work §3~5·8](18_scene_work.md) 재사용. main ClearSession @0x710029f6b0의 직접 reset은 이 갈래 §9.15.5 [C](../../../analysis/decomp/docs_gap_main.c)로 판독했고 간접 reset helper만 N7/N8에 남긴다 |

[추정] menu00→menu01의 지역 관리자 교체 중 잔존 세션 이용 해석은 강화된다. menu00 Play @0x7100037a00([online §5.6](../shell/online.md))와 menu01 @0x710002f078/@0x710002f840([C](../../../ghidra_work/online/out/menu01.nro.c))가 근거다. 앱 전체 전역 수명·모든 전환 보존은 U1이다.

#### 9.13.2 해산·조용한 이탈의 caller/callee

| 경로 | 기존 C로 닫힌 부분 |
|---|---|
| [판독] matching00 Leave | NetworkManager::LeaveSession @0x7100004ab0은 LeaveSessionSilentlyFiber를 지역 +0x40에 설치·기존 객체 교체, IsCompleted까지 Wait 후 Work ClearSession을 호출한다. caller는 SDK 성공값을 검사하지 않는다. [matching00 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00 Dissolve | DissolveSession @0x7100004b4c은 세션 존재·host·진행 요청을 검사하고 DissolveSessionSilentlyFiber(false)를 +0x40에 둔다. 완료 후 내부 성공/실패는 이 caller에 없다. [matching00 C](../../../analysis/decomp/online_matching00.c) |
| [판독] 이름과 본문 | DissolveAndRecreateSessionFiber::Update @0x710000c500은 silent Leave 생성·완료 대기 뒤 ClearSession·RequestError를 호출한다. 본문에는 CreateSession 호출이 없다. 이름만으로 자동 방 재생성/재참가를 판독하지 않는다. [matching00 C](../../../analysis/decomp/online_matching00.c) |
| [판독] 요청 caller | 기존 SetupSession @0x7100012780([online §5.7·8](../shell/online.md)) → RequestDissolveAndRecreateSession @0x7100004c00 → LeaveSession @0x7100004ab0/오류 요청. 메뉴값4·저장 station 쌍 조건의 NetTransfer 전송 확인 대기는 최대30,000,000,000 ns=30 s이며 실패도 오류 경로다. 이 본문에도 세션 생성 호출은 없다. [matching00 C](../../../analysis/decomp/online_matching00.c) |
| [판독] menu00 해산 후보 | FUN_71000313f0 @0x71000313f0은 함수 객체 +8의 관리자를 사용해 세션/진행 요청을 검사한다. SetSessionEntry·GetResultSessionEntry 폴링, NetTransfer 전송, DissolveSessionSilentlyFiber(false) 설치·완료 대기 뒤 StopSoundRebootScene, 1.0 s FadeOut·대기, 진행 객체 정리, 친구 UUID 목록 정리, MenuReturnCode(1,0), RequestRebootScene으로 이어진다. [menu00 C](../../../ghidra_work/online/out/menu00.nro.c) |
| [미확정] 후보 결합·상태값 | 위 후보와 DissolveSession @0x710002ed78의 PTR_LAB_71001c8b18 가상 호출 결합은 C에 없다. SetSessionEntry 인자·폴링 SSA도 완전 복원되지 않았다. 포인터를 코드 주소로 바꾸거나 입장 닫기/SDK 성공값을 확정하지 않는다. [caller C](../../../analysis/decomp/online_menu00.c)·[후보 C](../../../ghidra_work/online/out/menu00.nro.c) |
| [판독] 장면 요청 접점 | 후보의 RequestRebootScene은 소리/페이드 뒤 요청한다. [데이터] 명칭 대응은 main RequestRebootScene @0x71002cafa0이며, 종전 @0x71002caf7c는 RequestReturnScene(name)이다. [18_scene_work 부록 B.2](18_scene_work.md)·[main TSV](../../../analysis/functions/main.nso.tsv)의 주소 대응을 재사용한다. [판독] OnMainEnd 전달 main @0x71002ca9e0은 [18_scene_work §3~5](18_scene_work.md) 재사용이다. 부모 instance 보존·최종 네트워크 해제까지 확대하지 않는다 |

[미확정] IsCompleted는 caller 대기 종료 근거이며 SDK 성공/실패·예약 제거 순서와 동일한 보장은 없다. main wrapper/결과/silent ctor @0x710013c04c/@0x710013c7f8/@0x710013c800/@0x710013c2f0/@0x71001f83e0/@0x71001f8564는 [C](../../../analysis/decomp/docs_gap_main.c)로 확보했다. 빈 하위 함수 N1~N3/N6, virtual Update M7/M8는 §9.15.3·9.15.7. menu00 Leave @0x71000382f0은 [§9.3](12_online_sync.md) 재사용이다.

#### 9.13.3 재입장·모드 복귀·focus

| 근거 | 확인 결과 |
|---|---|
| [판독] 저장 재개 UI | menu00 ReEntryImpl @0x71000553f0의 저장/flag 검사·재개 확인·계정/컨트롤러 복원·ReturnCode·네트워크 검사 뒤 ReEntryFiber, 폐기/실패의 ReentryData Clear·SaveRequest→설정은 [plaza_intro §3.3](../shell/plaza_intro.md) 재사용이다. 새 Join @0x7100035a90([online §5.4](../shell/online.md))와 구별한다 |
| [판독] 공용 이탈 오류 복귀 | main FUN_71001ec490 @0x71001ec490의 자기/예약 이탈 배제·flag별 B1/B3/B6 및 mgmrs/mgmet/menu00 복귀는 [mgm01_freeplay §3.3](../shell/mgm01_freeplay.md) 재사용이다. RecreateSessionFiber ctor @0x71002d30c0·mgmrs SyncedSetupGame @0x7100003e5c도 같은 문서의 재구성 진입이며 게임 snapshot 증거는 아니다 |
| [판독: 어셈블리] 재구성 sync | main RecreateSessionFiber::StartSync @0x71002d44fc/SessionFailedProcess @0x71002d453c는 [mgm01_freeplay §4.3·5.4](../shell/mgm01_freeplay.md)·[mgC_main_uitimer2.c](../../../analysis/decomp/mgC_main_uitimer2.c) 재사용이다. 새 C 수에 넣지 않는다 |
| [판독] 실제 저장 재입장 본문 | main ReEntryFiber ctor @0x710034c564/Update @0x710034c970은 현재 [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)에 있다. 저장 방 검색·참가·phase/실패·국소 매핑은 §9.15.4. 최종 target/host 승계/snapshot은 [미확정]이며 모든 끊김의 자동 재접속으로 일반화하지 않는다 |
| [판독] focus 소비자 | main FUN_7100195228 @0x7100195228은 GetCurrentFocusState()가1~3이면 RendererModule에 각각0/1/1 flag를 전달한다. 이 본문에는 NetworkModule·Leave·Disconnect·재입장 호출이 없다. [core_b1.c](../../../analysis/decomp/core_b1.c)·[main TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] 슬립과 focus | 위 코드는 렌더러 전달만 확인한다. nn::oe::SetResumeNotificationEnabled @0x710144d2e0 소비자 또는 Switch 슬립의 네트워크 처리를 식별한 것은 아니다. 현 C에서 resume 설정/notification 소비자 연결을 확보하지 못해 A2 유지다. [main TSV](../../../analysis/functions/main.nso.tsv)·[core_b1.c](../../../analysis/decomp/core_b1.c) |

#### 9.13.4 barrier·seed·게임 복원·결과 합의

| 구분 | 범위와 차단선 |
|---|---|
| [판독] 전송 확인 | matching00 @0x7100004c00의 IsReceivedSend와 main seed @0x71001525a0의 [§4.1](12_online_sync.md)은 NetTransfer 송신 확인이며 종료 frame·점수 digest 전원 합의가 아니다. [matching00 C](../../../analysis/decomp/online_matching00.c) |
| [판독] 시작·gate | main StartSync @0x7100218cd0/IsSynced @0x71002197bc, NetworkGameScene @0x71001c94cc, SDK ready @0x710050f0d4는 [§2.2·3.3](12_online_sync.md) 재사용이다. seed 실패 phase 진행·SDK F 진행 불가까지이며 상위 seed 보장/씬 전체 gate는 U8이다 |
| [판독] 결과 저장 | 결과100칸 ring은 MinigameModeWork 소유다. main SetMinigameResult @0x71001f0460, readers @0x71001f2a24/@0x71001f2a64/@0x71001f2a80의 [18_scene_work §4.3](18_scene_work.md)·[mgm01_freeplay §6.6·8.3](../shell/mgm01_freeplay.md) 재사용이며 저장 위치 확인은 네트워크 합의와 다르다 |
| [미확정] 종료 기록·합의 | main OnGameMain @0x71002e1818/OnEndingInit @0x71002e1b14의 [§5·7](12_online_sync.md), [minigame_result §6.5·11](../shell/minigame_result.md)만으로 final authority·end-frame ACK·불일치 처리·프리 플레이 writer 전체를 닫을 수 없다. U9 유지 |
| [데이터] 웹 FrameGate | MgPadState/FrameGate accX/Y/Z 전달, MergedPad.read 입력 순서·후속 병합 제한, flow canStep(false)의 step/frame 미진행은 [19_motion_input §8·9.3](19_motion_input.md) 재사용이다. 실제 gap은 accel 입력 생성·MergedPad 병합이며 “FrameGate가 acc를 버린다”를 전제로 삼지 않는다 |
| [설계] 복구 경계 | U7/U9가 열린 동안 epoch·고정1/60·주입 난수·f32·FrameGate를 지키며 seed 재배포만으로 게임 객체/RNG 소비 위치/score를 복원했다고 처리하지 않는다. tab hidden/offline은 §9.11 미승인 추천이다. [§4.1·6.3·8.5](12_online_sync.md)·[DESIGN §10](../../DESIGN.md) |

#### 9.13.5 해결된 부분·잔여·구현 차단

[미확정] 아래는 §9.13 조사 시점의 부분해결5/남음4 이력이다. R1~R16의 C는 이후 확보했고 최신0전체 해결·6부분해결·3남음 및 빈 하위 요청은 §9.15.6·9.15.7을 따른다. 원본 실행 확인은 없다. [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)·[§9.15.6](12_online_sync.md).

| ID | 해결/한정 | 잔여·구현 차단 |
|---|---|---|
| [미확정] U1 부분 해결 | menu01 @0x710002f840도 소멸 시 세션 종료 없음. §9.13.1 [C](../../../ghidra_work/online/out/menu01.nro.c) | 전역 설치/파괴 R1/A3. [설계] appNet 화면 분리 가능, 원본 앱 전체 수명 동등성 차단 |
| [미확정] U2 유지 | menu01 @0x710002f71c/@0x710002fa1c도 공용 setter. §9.13.1 [C](../../../ghidra_work/online/out/menu01.nro.c) | null/교체/동시 구독·공용 handler R4~R7. [설계] 웹 drain/fanout 가능, 원본 listener 동일성 차단 |
| [미확정] U3 부분 해결 | matching00 @0x7100004ab0/@0x710000c500 silent 완료→ClearSession/오류. §9.13.2 [C](../../../analysis/decomp/online_matching00.c) | SDK 성공/실패·reserve R2/R3/R9~R13. [설계] 요청/완료 분리 가능, 완전한 오류 전이 재현 차단 |
| [미확정] U4 부분 해결 | menu00 후보 @0x71000313f0·소리/페이드/reboot. §9.13.2 [C](../../../ghidra_work/online/out/menu00.nro.c) | PTR_LAB_71001c8b18 결합 A1·SDK 성공 R11/R13. [설계] 후보를 확정 caller로 사용 차단 |
| [미확정] U5 부분 해결 | menu01 @0x71000329e0 host 갱신/오류, menu00 @0x71000553f0 재개, main @0x71001ec490 복귀. [§9.13.1·9.13.3](12_online_sync.md) | R8/R14/R15·실제 승계/재입장 보존 상태. [설계] 확인 오류 분기 가능, 자동 reconnect/모든 모드 재개 차단 |
| [미확정] U6 부분 해결 | main focus @0x7100195228은 렌더러 flag만. [C](../../../analysis/decomp/core_b1.c) | sleep/resume 네트워크 consumer A2. [설계] 웹 탭 정책 선택 가능, Switch 슬립 동일 선언 차단 |
| [미확정] U7 유지 | main seed @0x71001624ac 재동기와 재입장 UI 범위 구별. [§4.1](12_online_sync.md)·[plaza_intro §3.3](../shell/plaza_intro.md) | snapshot/RNG 소비/점수·CPU 대체 A3. [설계] 게임 중간 복구·대체 차단 |
| [미확정] U8 유지 | main @0x71001c94cc/@0x710050f0d4 seed 실패/SDK gate와 웹 FrameGate 구별. [§2.2·3.3](12_online_sync.md)·[19 §9.3](19_motion_input.md) | 상위 seed 보장·씬 전체 gate caller 미식별. [설계] 웹 gate 연결 가능, 전체 정지 동등성 차단 |
| [미확정] U9 유지 | main @0x71001f0460 ring 소유·전송 확인과 합의 분리. [18 §4.3](18_scene_work.md)·[결과 §6.5](../shell/minigame_result.md) | final authority/end-frame/불일치 caller 미식별. [설계] UI/typed 전달 가능, 온라인 commit 계약 차단 |

#### 9.13.6 최소 추가 C·미식별·준비도

[데이터] §9.13 조사 시점에는 R1~R15 main.nso 15주소가 TSV만 있고 C471개/INDEX에 본체가 없어 요청했다. 이후 R16과 함께16개 모두 [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)로 확보했다. 아래 R10~R15는 당시 요청 이유의 이력이다. 현재 요청15주소는 별개 하위 함수 N1~N15(§9.15.7)이며 이번 추출0이다. [main TSV](../../../analysis/functions/main.nso.tsv).

| ID | 모듈·주소·함수 | 당시 요청 정보(현재 확보·§9.15 판독) |
|---|---|---|
| [데이터] R10 | main.nso @0x710013c800 bex::NetworkModule::GetResultLeaveSession | 결과1 Wait와 완료/성공/실패의 위임 대상. [main TSV](../../../analysis/functions/main.nso.tsv) |
| [데이터] R11 | main.nso @0x710013c2f0 bex::NetworkModule::GetResultSessionEntry | 해산 후보 entry 결과 폴링·실패. [main TSV](../../../analysis/functions/main.nso.tsv) |
| [데이터] R12 | main.nso @0x71001f83e0 bq::LeaveSessionSilentlyFiber::LeaveSessionSilentlyFiber | virtual Update 대상·silent 완료/오류 식별. 생성자만으로 성공 의미를 닫지 않음. [main TSV](../../../analysis/functions/main.nso.tsv) |
| [데이터] R13 | main.nso @0x71001f8564 bq::DissolveSessionSilentlyFiber::DissolveSessionSilentlyFiber | virtual Update·bool 동작·완료/오류. Update 주소는 현 TSV에서 식별 못 해 만들지 않음. [main TSV](../../../analysis/functions/main.nso.tsv) |
| [데이터] R14 | main.nso @0x710034c564 bq::ReEntryFiber::ReEntryFiber | 저장/네트워크/모드 인자 소유·초기 상태. [main TSV](../../../analysis/functions/main.nso.tsv) |
| [데이터] R15 | main.nso @0x710034c970 bq::ReEntryFiber::Update | 실제 재입장·target scene·host/실패·복구 상태. [main TSV](../../../analysis/functions/main.nso.tsv) |

| 우선 조사 | 요청·후속 식별 |
|---|---|
| [설계] 종료·listener | 기존 R2~R7/R9~R13은 확보·판독했고 현재 N1~N8이 빈 하위 함수다. silent Update는 M7/M8이며 ctor만으로 실제 주소를 만들지 않는다. [§9.15.3·9.15.7](12_online_sync.md) |
| [설계] 재개·host | R8/R14/R15 확보로 저장 재참가·국소 매핑은 확인했다. N9~N15 및 성공 callback M9가 잔여이며 snapshot은 별도다. main @0x71001ea1b8/@0x710034c970 [C](../../../analysis/decomp/docs_gap_main.c)·[§9.15.4](12_online_sync.md) |
| [설계] owner·남은 hook | R1 내부 ctor는 확보됐지만 전역 설치/파괴·gate/결과 caller는 M3/M5/M6이다. 실제 주소가 없어 일괄 추출 주소를 지정하지 않는다. [§9.15.2·9.15.6](12_online_sync.md) |

| 미식별 묶음 | 후속 결과 |
|---|---|
| [미확정] A1 결합 미확정 | menu00 후보 @0x71000313f0 확보, PTR_LAB_71001c8b18와의 vtable/함수 객체 결합 잔여. 후보 C는 있어 새 추출 요청이 아니다. [menu00 C](../../../ghidra_work/online/out/menu00.nro.c)·[caller C](../../../analysis/decomp/online_menu00.c) |
| [미확정] A2 consumer 미식별 | main focus @0x7100195228은 sleep/resume 네트워크 consumer가 아니다. SetResumeNotificationEnabled @0x710144d2e0 연결 미확보. [core_b1.c](../../../analysis/decomp/core_b1.c)·[main TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] A3 핵심 caller 미식별 | menu01 @0x71000329e0의 오류 복귀는 확인했지만 전역 최종 해제·게임 snapshot 복구 본체는 미식별. ClearSession main @0x710029f6b0 직접 reset은 최신 [§9.15.5](12_online_sync.md) [C](../../../analysis/decomp/docs_gap_main.c)로 확인. 공용 Work 수명은 [18](18_scene_work.md) 재사용 |

[데이터] 기존 미식별 묶음3개 중 A1은 후보 주소 확보·결합 미확정, A2/A3은 핵심 코드 주소 미식별이다. silent virtual Update·원본 전체 gate·결과 합의 caller 주소 부족도 해당 U/R행에 명시했으며 숫자15개에 가상 주소를 더하지 않았다. [§9.13.5](12_online_sync.md)·[main TSV](../../../analysis/functions/main.nso.tsv).

| 준비도 | 후속 판정 |
|---|---|
| [설계] 바로 가능 | 앱 세션/화면 구독 분리·단일 poll/fanout·종료 이유/단계·menu01 오류 분기·고정1/60·주입 RNG·f32·FrameGate. [DESIGN §10](../../DESIGN.md)·menu01 @0x710002f840/@0x71000329e0 [C](../../../ghidra_work/online/out/menu01.nro.c)·[19 §9.3](19_motion_input.md) |
| [설계] 근사 필요 | transport·timeout·epoch·tab hidden/offline/reconnect UI는 플랫폼 선택이며 §9.11 미승인 추천 유지. [online §9.5·9.6](../shell/online.md)·[§6.3·8.5](12_online_sync.md) |
| [미확정] 판독 필요 | U1~U9의 종료/복구/합의 잔여와 미식별/결합. 기존 R1~R16은 본체 확보됐으며 현재 N1~N15·M1~M9는 [§9.15.6·9.15.7](12_online_sync.md) |

#### 9.13.7 후속 새 판독·출처 대응·검증

[데이터] 아래14함수만 후속 새 판독이다. menu01 8개·menu00 후보1개는 INDEX 미수록이지만 실제 ghidra_work/online/out/*.c 헤더·모듈 TSV로 C 존재 확인. matching00 4개·main 1개는 INDEX/TSV 모두 확인했다. INDEX 보완·새 C 추출은 없다. [INDEX](../../../analysis/decomp/INDEX.tsv)·[menu01 TSV](../../../analysis/functions/menu01.nro.tsv)·[menu00 TSV](../../../analysis/functions/menu00.nro.tsv)·[matching00 TSV](../../../analysis/functions/matching00.nro.tsv)·[main TSV](../../../analysis/functions/main.nso.tsv).

| 모듈 | 후속 새 판독 함수·주소 | 기존 C |
|---|---|---|
| [판독] menu01.nro | NetworkManager::NetworkManager @0x710002f078 | [menu01.nro.c](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] menu01.nro | SetSessionEventListener @0x710002f71c | [같은 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] menu01.nro | NetworkManager::~NetworkManager @0x710002f840 | [같은 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] menu01.nro | CancelSessionEventListener @0x710002fa1c | [같은 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] menu01.nro | NetworkManager::Disconnect @0x710002fcac | [같은 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] menu01.nro | NetSessionListener::ReceiveMessageImpl @0x71000329e0 | [같은 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] menu01.nro | FUN_71000331b0 @0x71000331b0 | [같은 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] menu01.nro | FUN_7100033490 @0x7100033490 | [같은 C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] matching00.nro | NetworkManager::LeaveSession @0x7100004ab0 | [online_matching00.c](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | NetworkManager::DissolveSession @0x7100004b4c | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | RequestDissolveAndRecreateSession @0x7100004c00 | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] matching00.nro | DissolveAndRecreateSessionFiber::Update @0x710000c500 | [같은 C](../../../analysis/decomp/online_matching00.c) |
| [판독] menu00.nro | FUN_71000313f0 @0x71000313f0 | [menu00.nro.c](../../../ghidra_work/online/out/menu00.nro.c) |
| [판독] main.nso | FUN_7100195228 @0x7100195228 | [core_b1.c](../../../analysis/decomp/core_b1.c) |

[데이터] 재사용은 최초21함수(§9.12.2), menu00 @0x71000553f0([plaza_intro §3.3](../shell/plaza_intro.md)), main @0x71001ec490/@0x71002d30c0([mgm01_freeplay §3.3·4.3·5.4](../shell/mgm01_freeplay.md)), Scene/Work @0x71002ca9e0/@0x71001f0460([18 §3~5·8](18_scene_work.md)), FrameGate/MgPadState/MergedPad 필드([19 §8·9.3](19_motion_input.md))다. 재사용 함수는14개에 다시 세지 않았다.

[설계] 검증 기대값은 menu01 사건2 host 갱신→B2/menu01, 예약 이탈 분기, 마지막 remote human 이탈 B9/ReentryData 정리, matching00 silent 완료→ClearSession→오류 순서다. menu01 @0x71000329e0/@0x71000331b0/@0x7100033490([C](../../../ghidra_work/online/out/menu01.nro.c)), matching00 @0x7100004ab0/@0x710000c500([C](../../../analysis/decomp/online_matching00.c))가 근거이며 SDK 성공/실측으로 표기하지 않는다.

[데이터] §9.13 완료 시점 검증: §1~§8 원래56,343바이트 SHA-256 4ac5c24f93009ed2b1f0e9ba47be8040bd10fbfeb2856d70245a88af50f017d9 보존, §9 UTF-8·LF, CommonMark 링크318/318·새 경로 오류0, 당시 새 판독35함수/고유 요청15주소 대조, git diff --check 통과. 최신 검증은 §9.15.8이다. 기존 §6.1 ../../script/core/clock.ts는 현 경로에 없지만 §1~§8 보존으로 변경하지 않았다. 괄호 설명을 링크 오류로 세지 않는다. [§6.1](12_online_sync.md)·[INDEX](../../../analysis/decomp/INDEX.tsv).

[설계] 부모 통합은 §9.12.3 출처 절 끝 한 줄만 유지한다. 후속은 §9만 쓰며 README·출처·C·INDEX·TSV·코드·에셋은 수정하지 않았다. [18_scene_work §8](18_scene_work.md) 온라인 접점은 §9.13.1·9.13.2에서 재사용했고 상호 링크 추가는 부모 통합 대상이다.


### 9.14 남은 구현 차단 경계 추가 조사

[데이터] §9.14 조사 시점에는 직전35함수·5부분해결(§9.12·9.13)을 재사용하고 빈 C6함수를 추가로 읽어 누계41함수였다. 이 시점에는 기존 바이트를 보존하고 하위 절만 추가했다. 최신16개 추가·누계57·현재 요청은 §9.15다. [INDEX](../../../analysis/decomp/INDEX.tsv)·모듈 TSV·C 헤더를 먼저 대조했으며 원본 실행/추출은 없다.

#### 9.14.1 후보 일괄 목록·새 판독 범위

| 후보·모듈·주소 | 기존 판독/본체와 처리 |
|---|---|
| [판독] menu00 Join/Play @0x7100035a90/@0x7100037a00, matching00 SetupSession @0x7100012780 | [online §5.4·5.6·5.7](../shell/online.md) 재사용. 최초21+후속14는 [§9.12.2·9.13.7](12_online_sync.md) 재사용하며 본문을 다시 읽지 않음 |
| [판독] menu00.nro IsProcLeave @0x710002cc90 | 이번 새1. [online_menu00.c](../../../analysis/decomp/online_menu00.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)·[menu00 TSV](../../../analysis/functions/menu00.nro.tsv) 모두 존재 |
| [판독] menu00.nro JoinSessionFiber::Notice_JoinSessionMissed @0x7100037368 | 이번 새1. [같은 C](../../../analysis/decomp/online_menu00.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)·[menu00 TSV](../../../analysis/functions/menu00.nro.tsv) 모두 존재 |
| [판독] menu00.nro JoinSessionFiber::LeaveSessionSilently @0x71000377d0 | 이번 새1. [같은 C](../../../analysis/decomp/online_menu00.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)·[menu00 TSV](../../../analysis/functions/menu00.nro.tsv) 모두 존재. 같은 주소의 mg0906 항목과 합치지 않음 |
| [판독] matching00.nro PlaySessionFiber::Update @0x7100009280 | 이번 새1. [online_matching00.c](../../../analysis/decomp/online_matching00.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)·[matching00 TSV](../../../analysis/functions/matching00.nro.tsv) 모두 존재. 같은 주소의 mg1002 Ending은 다른 함수 |
| [판독] menu01.nro Scene::SetupGame @0x7100039b90 | 이번 새1. [menu01.nro.c](../../../ghidra_work/online/out/menu01.nro.c) 헤더·[menu01 TSV](../../../analysis/functions/menu01.nro.tsv) 존재. INDEX의 같은 주소 mg0911 항목은 이 함수가 아님. 네트워크 조건/매핑 caller만 다루며 공용 SceneBase 본문은 읽지 않음 |
| [판독] menu01.nro SequenceStartKbMode::ExitImpl @0x7100055d70 | 이번 새1. [menu01.nro.c](../../../ghidra_work/online/out/menu01.nro.c) 헤더·[menu01 TSV](../../../analysis/functions/menu01.nro.tsv) 존재, INDEX 미수록. 지역 Exit와 네트워크 종료 호출을 구별 |
| [판독] main.nso ClearSession @0x710029f6b0 및 R1~R15 | 당시에는 TSV만 있었으나 현재16개 모두 [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)에 있다. 새 판독 §9.15.1·네트워크 reset §9.15.5. 이전16주소는 본체 요청에서 닫았다 |

[데이터] 관련 caller 재사용은 menu00 ReEntryImpl @0x71000553f0([plaza_intro §3.3](../shell/plaza_intro.md)), main 이탈 @0x71001ec490·RecreateSessionFiber ctor @0x71002d30c0·mgmrs GameFlow @0x7100003f80([mgm01_freeplay §3.3·4.3·5.4](../shell/mgm01_freeplay.md)), Scene/Work/결과 소유([18_scene_work §3~5·8](18_scene_work.md))다. 초대·UI 표시만 하는 후보는 구현 차단 우선 범위에서 제외하고 새 판독 수에 넣지 않았다.

#### 9.14.2 예약 이탈·메뉴 진입·출발의 국소 경계

| 확인한 경계 | 기존 C의 분기와 한계 |
|---|---|
| [판독] 예약 이탈은 완료 flag와 다름 | menu00 IsProcLeave @0x710002cc90은 IsConnected가 거짓이면0, 참이면 GetMyStationId→IsReserveLeaveSession 검사 결과에 따라1/0이다. Leave Fiber의 완료나 SDK 결과값을 검사하지 않는다. [C](../../../analysis/decomp/online_menu00.c) |
| [판독] 참가 실패 알림 억제 | menu00 Notice_JoinSessionMissed @0x7100037368은 내 station 예약 이탈이 아닐 때만 UiNotice SetID·RegisterNotice를 호출한다. @0x71000377d0도 같은 조건의 알림 뒤 지역 NetworkManager::LeaveSessionSilently를 호출하고 관리자 +0x60이 없거나 IsCompleted일 때까지 Wait한다. 직접 SDK 성공 검사/ClearSession은 없다. 정확한 SetID 인자는 C에 완전 복원되지 않아 알림00~03을 이 helper 하나로 확정하지 않는다. [C](../../../analysis/decomp/online_menu00.c) |
| [판독] menu01 입장 연결 검사 | Scene::SetupGame @0x7100039b90은 연결됐으나 세션 없음이면 지역 Disconnect를 호출한다. 세션 있음·station 수<2이면 menu00 복귀 이름·reason4·sys_error_B3를 요청한다. 이 요청 직후 C가 곧바로 return하는 것은 아니다. [C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] menu01 PlayerID/PadID 재구성 | 같은 @0x7100039b90의 세션 경로는 Normalize·PlayerID 초기화 뒤 GetHostStationId 쌍 비교의 가입 항목 loop, 다른 가입 항목 loop, 미할당 PlayerID의 PlayerType1 부여 순서다. [추정] getter 출력 SSA가 C에서 완전 복원되지 않아 이를 host-first 매핑으로 해석하되 반환 필드 연결은 추가 확인 대상이다. ControllerMonitor에 PlayerID 및 ConstantID/OnlineSlot을 연결하고 PadID·정렬·SetupOnlineControllerAssign을 호출한다. 오프라인 경로는 NormalizeLocal·ResetControllerAssign이다. [C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] CPU 분류의 시점 | 같은 @0x7100039b90에서 PlayerType1 경로에 SetAccountID/SetCheckID/SetAwakePlayer/SetNickname/SetSessionState(0)/SetConstantID(Invalid,0xff) 호출이 있다. SessionState2/3을 PlayerType1로 바꾸는 후행 검사도 있다. 인자 누락 때문에 계정·awake·닉네임의 정확한 초기값은 확정하지 않는다. 이는 menu01 진입 처리이며 진행 중 게임의 즉시 CPU 대체/snapshot/RNG 복원 증거가 아니다. [C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] 모드 선택 Exit와 세션 종료 구별 | menu01 SequenceStartKbMode::ExitImpl @0x7100055d70은 UI/카메라 정리 후 Normalize 여부를 고르고 BasePlayerType/BaseCharacterID 복원·RandamizeComCharacter·MenuWorkAsync::RestoreLocalPlayerData·상태0xc 설정으로 이어진다. 이 본문에 Leave/Disconnect/ClearSession은 없다. GamesyncClient +0x60 값>4이면 Normalize를 건너뛰는 조건은 보이나 그 필드 전체 의미는 미확정이다. [C](../../../ghidra_work/online/out/menu01.nro.c) |
| [판독] matching00 출발 준비 | PlaySessionFiber::Update @0x7100009280은 IsConnected/IsSessionConnected가 거짓이면 반환한다. 사람/로컬 순서·PlayerID/색/order를 준비하고 GetSessionMember 반환 경계 n과 PlayerID 비교로 PlayerType을 설정한다. 유효 id≥0의 PadID는 controller 최대값 m에 대해 C상 id−(m≠0이면 trunc(id/m), 아니면0)×m이다. WorkModule::PlaySession(1,GetGameMode(MenuWork+0xc)), 오류 복귀 menu00·MenuReturnCode(1,0), CPU/팀/ControllerAssign 준비·Sleep0.5가 이어진다. [C](../../../analysis/decomp/online_matching00.c) |
| [미확정] 출발 준비와 결과 합의 | 위 @0x7100009280의 이름 있는 네트워크 호출은 세션 조회·player data 조회·controller 할당·Work PlaySession이다. 본문에 NetTransfer Send/WaitSync/SDK GetResult/seed 송신/SetMinigameResult/end-frame ACK 호출은 확인되지 않았다. 시작 준비 데이터를 종료 결과 digest로 해석하지 않는다. 동적 호출·상위 SetupSession의 보장 전체는 이 함수만으로 닫을 수 없다. [C](../../../analysis/decomp/online_matching00.c), 기존 SetupSession @0x7100012780은 [online §5.7](../shell/online.md) 재사용 |

[설계] 웹은 세션 station/slot/epoch와 장면 진입의 PlayerID/PadID 재구성을 구별한다. 원본 menu01 @0x7100039b90의 [C](../../../ghidra_work/online/out/menu01.nro.c)를 “세션 키가 장면마다 바뀜”으로 해석하지 않는다. 게임 중간 CPU 대체·복구는 U7, 결과 commit은 U9가 열린 상태이며 [DESIGN §10](../../DESIGN.md)의 appNet/scene/frame 책임과 고정1/60·주입 난수·f32·FrameGate를 유지한다.

#### 9.14.3 미식별·미확정 갱신

[데이터] A1의 PTR_LAB_71001c8b18은 현 C에서 menu00 DissolveSession @0x710002ed78의 두 사본([선별 C](../../../analysis/decomp/online_menu00.c)·[전체 C](../../../ghidra_work/online/out/menu00.nro.c))에 각1참조만 있다. 실제 함수 객체 초기화/vtable 결합은 없다. 후보 @0x71000313f0의 직전 판독은 §9.13.2 재사용이며 새로 읽지 않았다.

| ID | 이번에 좁힌 부분·잔여 |
|---|---|
| [미확정] U1·U2 | menu01 진입/Exit @0x7100039b90/@0x7100055d70 [C](../../../ghidra_work/online/out/menu01.nro.c) 재사용. main ctor/listener R1/R4~R7은 현재 [C](../../../analysis/decomp/docs_gap_main.c)로 확보됐고 단일 슬롯/0 해제는 확인. 전역 최종 소유와 dispatch 잔여는 §9.15.2·9.15.6 |
| [미확정] U3 | 예약/알림 caller menu00 @0x710002cc90/@0x7100037368/@0x71000377d0 [C](../../../analysis/decomp/online_menu00.c) 재사용. SDK wrapper/결과/silent ctor/ClearSession은 확보돼 §9.15.3·9.15.5에 판독. SDK 성공/실패·간접 reset은 N1~N3/N6~N8·M7/M8 |
| [미확정] U4·A1 | 후보 주소는 확보됐으나 결합·SDK 해산 성공은 미확정 유지. menu00 @0x710002ed78/@0x71000313f0의 [§9.13.2](12_online_sync.md), 이번 참조 수 대조는 위 문단 |
| [미확정] U5 | menu01 진입/Exit @0x7100039b90/@0x7100055d70 [C](../../../ghidra_work/online/out/menu01.nro.c) 재사용. AllowReentry·ReEntryFiber main @0x71001ea1b8/@0x710034c564/@0x710034c970은 현재 [C](../../../analysis/decomp/docs_gap_main.c)로 판독. 실제 saved rejoin과 최종 승계/복원 미확정은 §9.15.4·9.15.6 |
| [미확정] U6·A2 | 추가 sleep/resume 소비자 C는 확보 못 했다. focus @0x7100195228와 외부 @0x710144d2e0의 [§9.13.3](12_online_sync.md) 재사용. 브라우저 hidden을 Switch 슬립과 합치지 않음 |
| [미확정] U7·A3 | menu01 @0x7100039b90의 CPU 재분류는 진입 시점으로 한정했다. [C](../../../ghidra_work/online/out/menu01.nro.c). 진행 중 game 객체/RNG 소비 위치/score 복구·즉시 대체 caller는 여전히 미식별이므로 U7을 새 부분해결로 올리지 않음 |
| [미확정] U8·U9 | matching00 @0x7100009280의 출발 준비/결과 호출 경계를 좁혔다. [C](../../../analysis/decomp/online_matching00.c). 상위 seed 보장·씬 전체 gate·final authority/end-frame/불일치 처리는 여전히 주소 미식별. [기존 §2.2·3.3·5·7](12_online_sync.md) 재사용 |

[데이터] §9.14 시점 집계는 새6·누계41, U 전체 해결0/부분해결5/남음4였다. 최신은 추가16·누계57, 전체 해결0/부분해결6/남음3(열린 U9개)이며 [§9.15.1·9.15.6](12_online_sync.md)을 따른다. 사용자 선택3개는 [§9.11](12_online_sync.md)의 미승인 추천을 유지한다. A묶음3개는 최신 M1~M9로 세분했으며 임의 주소는 만들지 않았다.

#### 9.14.4 당시16 요청의 확보·현재 하위 공백

[데이터] §9.14의 main.nso 고유16요청(R1~R16)은 현재 모두 [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)·[main TSV](../../../analysis/functions/main.nso.tsv)에 있다. 이16개를 새로 판독했으며 본체 요청에서 닫았다. 최신 C486개 재대조에도 빈 하위15주소 N1~N15는 본체가 없어 §9.15.7에 남긴다. 새 추출/어셈블리 판독0이다.

| 요청·모듈·정확한 주소 | 필요 이유·구현 차단 |
|---|---|
| [판독] R16 main.nso @0x710029f6b0 bq::WorkModule::ClearSession (340 B) | [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)로 확보. Work 로컬/host Invalid·조건부 local type0·목록 전체 state0/slot0xff·controller reset은 §9.15.5에서 확인. 간접 reset N7/N8은 [미확정]. 부모18에 공유할 네트워크 접점이며 원래 본체 요청은 닫음 |
| [판독] R2/R3/R9~R13 main.nso @0x710013c04c/@0x710013c7f8/@0x71001eacb4/@0x710013c800/@0x710013c2f0/@0x71001f83e0/@0x71001f8564 | [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c) 본체 확보·판독. 위임/결과 index/예약 wrapper/ctor까지 확인. SDK 완료·실패는 N1~N3/N6·M7/M8. 최신 [§9.15.3·9.15.7](12_online_sync.md) |
| [판독] R1/R4~R7 main.nso @0x7100150a80/@0x710013cadc/@0x710013cb64/@0x71001ea620/@0x71001ea710 | [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c) 본체 확보·판독. 내부 소유자·단일 슬롯·0 해제/공용 복귀 확인. 전역 전체 수명·세 번째 setter/dispatch는 N4/N5·M3. 최신 [§9.15.2·9.15.6](12_online_sync.md) |
| [판독] R8/R14/R15 main.nso @0x71001ea1b8/@0x710034c564/@0x710034c970 | [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c) 본체 확보·판독. 저장 방 검색/참가·국소 Work 갱신 확인. N9~N15·M9/게임 snapshot·host 승계 잔여. 최신 [§9.15.4·9.15.6](12_online_sync.md) |

[설계] 이전16개 본체는 재요청하지 않는다. 현재 조사 순서는 N1~N8 종료/결과/listener/reset→N9~N15 저장 재입장 연결이며 silent Update/callback은 실제 항목 식별 후 요청한다. 전역 owner·슬립·전체 gate·결과 합의는 주소 근거를 먼저 확보한다. SDK 성공값·복구 수치를 추정으로 채우지 않는다. [§9.15.6·9.15.7](12_online_sync.md).

#### 9.14.5 준비도·기대값·검증

| 준비도 | 최신 판정 |
|---|---|
| [설계] 바로 가능 | 화면 cleanup/모드 Exit와 세션 종료 분리·단일 poll/구독·예약 이탈에 따른 UI 억제·menu01 진입의 mapping 갱신 경계 설계. menu00 @0x710002cc90/@0x7100037368 [C](../../../analysis/decomp/online_menu00.c), menu01 @0x7100039b90/@0x7100055d70 [C](../../../ghidra_work/online/out/menu01.nro.c), [DESIGN §10](../../DESIGN.md) |
| [설계] 근사 필요 | 웹 transport/epoch/timeout·tab hidden/offline·재접속 안내는 §9.11 추천 그대로 미승인. [기존 §6.3·8.5·9.11](12_online_sync.md) |
| [미확정] 판독 필요 | U1~U9의 잔여·간접 reset·SDK 완료·silent Update/callback·전역 owner/슬립/snapshot/gate/결과. 현재 N1~N15와 M1~M9를 구별한다. [§9.15.6·9.15.7](12_online_sync.md) |

[설계] 기대값은 예약 이탈 시 참가 실패 알림0·silent 대기 유지, menu01 진입의 host/가입자/미할당자 구분, 모드 선택 Exit 뒤 세션 유지다. menu00 @0x7100037368/@0x71000377d0 [C](../../../analysis/decomp/online_menu00.c), menu01 @0x7100039b90/@0x7100055d70 [C](../../../ghidra_work/online/out/menu01.nro.c)가 근거다. PlayerID 재구성을 진행 중 게임의 slot/epoch 교체로 확대하지 않으며 SDK 성공·결과 commit 기대값은 미확정이다.

[미확정] 18 갈래 공유 접점은 menu01 SetupGame @0x7100039b90의 Normalize/SetPlayerID/SetPlayerType/ControllerAssign, ExitImpl @0x7100055d70의 RestoreLocalPlayerData, matching00 @0x7100009280의 WorkModule::PlaySession이다. 공용 SceneBase/Work 본문은 재판독하지 않았다. ClearSession @0x710029f6b0의 네트워크 reset은 이 갈래 R16로 관리하고 다른 Work 수명은 [18_scene_work](18_scene_work.md)에 둔다.

[데이터] §9.14 완료 당시 검증은 §9 CommonMark 링크386/386·새 경로 오류0·참조식 정의0, 누계41개 새 판독 주소/모듈/C 헤더, 당시16개 고유 요청·C 부재, git diff --check였다. 이후 부모의 §9.9 링크와 신규 C16개를 반영한 현재 검증은 §9.15.8을 따른다. 기존 §6.1 clock.ts는 보존한다. [§9.13.7](12_online_sync.md)·[INDEX](../../../analysis/decomp/INDEX.tsv).

### 9.15 제공된 네트워크 C 판독과 현재 잔여

[데이터] §9.14 이후 제공된 main.nso 16주소(R1~R16)의 본체를 [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)·[main TSV](../../../analysis/functions/main.nso.tsv)로 먼저 대조했다. 이전41함수는 §9.12.2·9.13.7·9.14.1의 판독을 재사용하고 다시 읽지 않았다. 이번 새 판독16·누계57함수이며 새 추출/어셈블리 판독은0이다. §1~§8과 부모가 추가한 §9.9의 18 링크는 보존했다.

#### 9.15.1 확보 자료·새 판독 목록

[데이터] 최신 재대조에서 허용된 C 파일은486개, INDEX 수정 시각은 2026-10-10 02:31:46 UTC였다. docs_gap 이름에 한정하지 않고 두 C 경로의 목록·수정 시각·관련 모듈/함수 헤더를 확인했다. 이후 추가된 다른 모듈 C는 담당 갈래에 두며 재판독하지 않았다. 현재 N1~N15의 본체 및 silent Update 이름의 추가 확보는0이다. [INDEX](../../../analysis/decomp/INDEX.tsv)·[main TSV](../../../analysis/functions/main.nso.tsv), 이번16개 출처는 [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c).

[데이터] 아래16행은 모두 main.nso이며 C 헤더·INDEX file/name/address·TSV address/name/size가 일치한다. 원래 R 요청은 본체 확보로 닫고, 여전히 빈 하위 함수만 §9.15.7에 새 요청으로 남긴다. 공용 SceneBase/Work 본문은 제외하고 ClearSession의 네트워크 reset만 판독했다. [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)·[INDEX](../../../analysis/decomp/INDEX.tsv)·[main TSV](../../../analysis/functions/main.nso.tsv).

| 이전 ID·모듈·주소 | 이번 새 판독 함수·출처 |
|---|---|
| [판독] R1 main.nso @0x7100150a80 | FUN_7100150a80 생성 본체. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R2 main.nso @0x710013c04c | bex::NetworkModule::Disconnect. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R3 main.nso @0x710013c7f8 | bex::NetworkModule::LeaveSession. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R4 main.nso @0x710013cadc | bex::NetworkModule::SetErrorListener. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R5 main.nso @0x710013cb64 | bex::NetworkModule::SetSessionEventListener. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R6 main.nso @0x71001ea620 | bq::Net::SetAllListener. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R7 main.nso @0x71001ea710 | bq::Net::CancelAllListener. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R8 main.nso @0x71001ea1b8 | bq::Net::AllowReentry. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R9 main.nso @0x71001eacb4 | bq::Net::RequestReserveLeaveSession. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R10 main.nso @0x710013c800 | bex::NetworkModule::GetResultLeaveSession. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R11 main.nso @0x710013c2f0 | bex::NetworkModule::GetResultSessionEntry. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R12 main.nso @0x71001f83e0 | bq::LeaveSessionSilentlyFiber::LeaveSessionSilentlyFiber. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R13 main.nso @0x71001f8564 | bq::DissolveSessionSilentlyFiber::DissolveSessionSilentlyFiber. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R14 main.nso @0x710034c564 | bq::ReEntryFiber::ReEntryFiber. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R15 main.nso @0x710034c970 | bq::ReEntryFiber::Update. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] R16 main.nso @0x710029f6b0 | bq::WorkModule::ClearSession. [C](../../../analysis/decomp/docs_gap_main.c) |

#### 9.15.2 네트워크 내부 소유자·listener의 실제 경계

| 객체·계약 | 확인한 생성/필드/설치·잔여 |
|---|---|
| [판독] main @0x7100150a80 내부 객체 | ErrorListener +0xa8, SessionEventListener +0x148과 HandleSource +0x150, allocator 및 NetTransfer +0x12f8, owner를 받는 EntryCallback +0x1318을 초기화한다. 외부 오류/세션 weak-handle 슬롯은 각각 0으로 시작한다. 생성 설정값은 기존 §3.3·4.1을 재사용한다. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] facade→내부 객체 | main Disconnect @0x710013c04c, LeaveSession @0x710013c7f8 및 setter @0x710013cadc/@0x710013cb64는 NetworkModule this+0x28의 포인터를 사용한다. 위 생성 본체를 facade 자체의 전역 설치 함수로 단정하지 않는다. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] 오류·세션 슬롯 교체 | main SetErrorListener @0x710013cadc는 weak-handle의 u64/u64/u32를 내부 +0x128/+0x130/+0x138에, SetSessionEventListener @0x710013cb64는 +0x180/+0x188/+0x190에 복사한다. 각 종류는 단일 슬롯 덮어쓰기이며 구독 배열에 추가하는 본문은 없다. 세션 setter 선행 검사 FUN_710013c16c의 본체는 N4 공백이다. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] 공용 handler 복귀 | main SetAllListener @0x71001ea620은 DAT_7101c142d8 owner가 있으면 +0xf8/+0x100/+0x108의 객체로 weak-handle을 만들어 오류·세션·세 번째 setter FUN_710013cba4에 넘긴다. 객체가 없으면 0 tuple이다. 세 번째 슬롯 종류/dispatch와 owner 생성·최종 파괴는 미확정이다. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] 공용 슬롯 해제 | main CancelAllListener @0x71001ea710은 0 weak-handle tuple을 같은 세 setter에 전달한다. Disconnect/Leave/ClearSession을 직접 호출하지 않는다. 앞 두 슬롯의 0 해제는 setter 복사와 함께 확인됐으며 세 번째 setter 본체는 N5 공백이다. [C](../../../analysis/decomp/docs_gap_main.c) |
| [미확정] 지역 Cancel 인자·dispatch | 위 main 본체는 단일 슬롯·공용 0 해제를 닫지만, 기존 menu00/matching00/menu01 지역 Cancel C의 누락 인자까지 채우지는 않는다. 지역 판독은 §9.5·9.13.1 재사용이다. 모든 event/error dispatch의 유효성 검사·전역 최종 해제는 미확정이다. main @0x710013cb64/@0x71001ea620 [C](../../../analysis/decomp/docs_gap_main.c), 지역 주소/출처는 [§9.5·9.13.1](12_online_sync.md) |

[설계] 원본 setter의 단일 슬롯과 웹 appNet의 다중 구독 fanout은 구별한다. 화면 전환 뒤 공용 handler 복귀는 원본 main @0x71001ea620([C](../../../analysis/decomp/docs_gap_main.c)) 근거지만, 웹의 상태 즉시 전달·구독자별 사건1회는 [§9.5·9.9](12_online_sync.md)·[DESIGN §10](../../DESIGN.md)의 계약이다. import 0 코어+어댑터, app/common 연결, app/scene/{menu,world,mode,system}, app/minigame/{frame,kit,mg####}, dev 분리와 app→dev 0을 유지한다.

#### 9.15.3 Disconnect·Leave·예약·silent 완료

| 경로·모듈·주소 | 본체로 닫힌 부분·남은 의미 |
|---|---|
| [판독] main Disconnect @0x710013c04c | FUN_71001415c8(내부 객체)에 위임한다. 이 wrapper 자체에는 완료 폴링·Work reset이 없다. 실제 요청/상태/실패는 N1. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] main LeaveSession @0x710013c7f8 | FUN_71001617b4(내부 객체)에 위임한다. Disconnect와 서로 다른 하위 함수다. N2 없이 방 이탈과 transport 종료의 전체 계약을 확정하지 않는다. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] main 결과 getter @0x710013c800/@0x710013c2f0 | 같은 FUN_7100153690에 각각 index 0xd(Leave)/0xc(Entry)를 넘긴다. 메뉴 caller의 GetResultLeaveSession==1 대기는 §9.3 재사용이며 이 wrapper만으로 1의 성공 enum 의미를 확정하지 않는다. 결과 저장/갱신은 N3. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] main 예약 이탈 @0x71001eacb4 | ConstantID u64/u16을 복사하고 PTR_DAT_7101a873c0가 가리키는 객체의 FUN_71001ead00에 전달한다. 이 본문은 SDK Leave를 직접 호출하지 않는다. 예약의 저장/전파/제거 시점은 N6. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] main silent ctor @0x71001f83e0/@0x71001f8564 | 각각 phase +0x10=0, vtable PTR_DAT_7101a87450/PTR_DAT_7101a87458의 +0x10 연결, 공용 pause 값 전달을 확인했다. Dissolve는 bool을 +0x14에 저장한다. 두 생성자 자체에는 SDK 종료/완료 판정이 없다. virtual Update의 실제 코드 주소는 여전히 미식별이며 인접 주소를 만들지 않는다. [C](../../../analysis/decomp/docs_gap_main.c) |

[미확정] main @0x710013c04c/@0x710013c7f8/@0x710013c800 및 silent ctor @0x71001f83e0/@0x71001f8564([C](../../../analysis/decomp/docs_gap_main.c))는 요청 wrapper·결과 index·초기 상태까지 닫았다. Fiber IsCompleted와 SDK 성공, 해산 완료와 입장 닫기 완료는 여전히 별개다. menu00 해산 후보 결합은 [§9.13.2·9.14.3](12_online_sync.md)의 A1을 재사용한다.

#### 9.15.4 저장된 재입장: 허용·검색·참가·완료

| 단계·주소(main.nso) | 원본 흐름·한계 |
|---|---|
| [판독] AllowReentry @0x71001ea1b8 | 세션 연결·IsHost·NetworkMode==2일 때만 처리한다. map의 gameMode/searchWord/uniqueId를 수정해 FUN_710013c9d8에 적용한다. 허용은 기존 uniqueId의 하위63비트+1(0이면1), 불허는 기존 값에 상위비트 설정이다. 실제 값은 기록하지 않는다. 반환1은 이 본문 처리까지이며 적용 완료/host 승계 성공을 폴링하지 않는다. map read/apply는 N12/N13. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] ReEntryFiber ctor @0x710034c564 | handler +0x10을 초기화하고 저장 ReentryData 0x240바이트를 +0x18에 복사한다. +0x258/+0x260 계정 쌍과 +0x268 초기 상태를 둔다. PlayerID==-1은 preselected 저장/계정 경로, 그 외는 해당 PlayerID 저장/PlayerWork 경로다. 필요한 저장/플레이어/계정이 없으면 abort하는 갈래와 preselected 저장 없음의 조기 return을 구별한다. 값은 기록하지 않는다. handler initializer는 N9. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] Update 시작 @0x710034c970 | +0x268 상태가1일 때까지 Wait하고 이미 세션이 있으면 abort한다. FUN_71001ea7b8 뒤 저장 자료 유효성 및 kind∈{1,2}를 검사한다. 유효하지 않으면 phase4/reason3이다. 이는 모든 transport 끊김을 감시하는 자동 reconnect loop의 증거가 아니다. N11. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] 연결·세션 setup @0x710034c970 | NetworkMode가2가 아니면 기존 연결을 Disconnect→mode==-1까지 0.1 s 폴링→ConnectNpln→IsConnecting 동안 0.1 s 폴링한다. 연결되면 로컬 사람 PlayerInfo로 SetupNplnSession을 호출한다. 구성/인증 인자와 저장 비밀 값은 생략한다. setup 실패는 phase4/reason2 경로다. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] 저장 방 검색 @0x710034c970 | CanStartAnySessionProcess 대기와 검색 loop가 30,000,000,000 ns=30 s deadline을 공유한다. 저장 searchWord/uniqueId 조건으로 FUN_710013c458을 호출하고 phase2로 검색한다. 첫 비어 있지 않은 검색 결과에서 SearchStop→phase3→JoinSelectedNplnSession으로 간다. 결과의 room ID 및 저장 인자를 사용하며 값은 기록하지 않는다. N14/N15. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] 참가 대기 @0x710034c970 | IsSessionConnected까지 0.1 s 폴링하며 GetResultJoinSelectedSession 값5~22의 갈래는 실패 처리한다. 이 참가 대기 본문에는 위30 s deadline 검사가 없다. 검색 timeout을 참가 완료 전체 timeout으로 확대하지 않는다. SDK result enum의 명칭은 미확정이다. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] 성공 경로 @0x710034c970 | SetNetworkGame(2), 내/host station의 Work ConstantID, SetNotSyncScene(true)를 설정한다. preselected 저장이 있으면 FUN_710023d910을 호출한다. GetPlayerList(...,0)의 사람(PlayerType0)은 로컬 쌍과 순차 slot으로 SetConstantID, 그 외 SessionState2는3으로 바꾼다. SetAllListener 뒤 virtual +0x30 callback을 호출하고 phase4/reason1을 쓴다. 저장 helper N10·callback target은 미확정이다. [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] 실패 경로 @0x710034c970 | 검색 timeout/저장 무효의 reason3, 연결·setup·참가 실패의 reason2가 보인다. 일부 검색 상태 분기도 Disconnect 후 phase4로 간다. reason 숫자를 SDK 성공 enum 또는 사용자 메시지 ID로 바꾸지 않는다. 성공·실패 phase는 Fiber +0x268의 국소 상태다. [C](../../../analysis/decomp/docs_gap_main.c) |

[미확정] main ReEntryFiber @0x710034c564/@0x710034c970([C](../../../analysis/decomp/docs_gap_main.c))로 저장된 방 검색·명시적 재참가·로컬 매핑 갱신은 확인됐다. virtual +0x30 대상·kind별 최종 장면·host 승계의 전체 완료·GameWork/게임 객체/RNG 소비 위치/score 복원은 확정하지 않았다. 시작 barrier·seed·결과 합의는 [§9.4·9.13.4](12_online_sync.md)의 별도 경계를 유지한다.

[설계] 웹 재접속은 transport 연결, 저장/선택된 방 재참가, 게임 상태 재개를 별도 상태로 둔다. 원본 @0x710034c970의 검색30 s·0.1 s 폴링([C](../../../analysis/decomp/docs_gap_main.c))을 브라우저 hidden 제한시간이나 자동 재시도 횟수로 옮기지 않는다. §9.11의 탭 숨김·재접속·오프라인 복귀3개 선택은 모두 미승인 추천이며 고정1/60·주입 난수·f32·FrameGate를 지킨다. [DESIGN §3·10](../../DESIGN.md).

#### 9.15.5 ClearSession의 네트워크 reset 계약

[판독] main bq::WorkModule::ClearSession @0x710029f6b0은 아래 순서로 직접 필드/PlayerWork를 정리한다. 네트워크 종료 caller는 [§9.2·9.13.1·9.13.2](12_online_sync.md)의 완료 판독을 재사용하며 SDK 종료 성공을 이 함수가 새로 증명하지 않는다. [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c).

| 대상·필드 | 확인한 초기화·정리 |
|---|---|
| [판독] PlayerWorkHolder this+0x12d0 | 먼저 NormalizeLocal을 호출한다. 내부 NormalizeLocal 본문과 목록 필터 정의는 이 갈래에서 새로 읽지 않는다. main @0x710029f6b0 [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] Work 수치/범위/flag | this+0x3d04의 s32=0, +0x3d38에 +0x3d30 값 복사, +0x3d28의 byte=0이다. 명칭 미식별 필드를 임의로 epoch/session member counter로 이름 붙이지 않는다. [추정] +0x3d30/+0x3d38은 begin/end 범위 비우기로 해석하지만 타입은 추가 확인 대상이다. main @0x710029f6b0 [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] Work 로컬·host 쌍 | +0x3d08/+0x3d10과 +0x3d18/+0x3d20을 각각 ConstantID::Invalid로 설정한다. 이전 listener 비교 접점은 §9.7·9.13.1 재사용이다. main @0x710029f6b0 [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] GetPlayerList(...,4)의 조건부 type | SessionState∈{2,3,4}이고 IsLocal이면 PlayerType0으로 바꾼다. 이 조건을 모든 플레이어의 type0 초기화로 확대하지 않는다. main @0x710029f6b0 [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] 같은 목록의 모든 플레이어 | SetSessionState(0), SetConstantID(Invalid,0xff)를 호출한다. 조건부 PlayerType 변경과 달리 이 두 호출은 나열된 모두에 적용된다. 0xff는 여기의 온라인 slot 초기값이며 새 station 생성이 아니다. main @0x710029f6b0 [C](../../../analysis/decomp/docs_gap_main.c) |
| [판독] 후행 정리 | ResetControllerAssign→FUN_71001e9c88→FUN_71001eaf78→AccountMgr::ReEntryPlayer 뒤 목록 임시 메모리를 해제한다. 두 helper는 N7/N8이다. main @0x710029f6b0 [C](../../../analysis/decomp/docs_gap_main.c) |
| [미확정] 간접 영향·보존 범위 | 이 본문에는 GameWork/RNG/결과 ring을 직접 지우는 이름 있는 호출이 없다. NormalizeLocal·두 helper·ReEntryPlayer의 간접 영향이 열려 있으므로 게임 상태·결과가 전부 보존된다고 단정하지 않는다. 결과 ring 소유는 [18 §4.3](18_scene_work.md) 재사용이다. main @0x710029f6b0 [C](../../../analysis/decomp/docs_gap_main.c) |

[설계] 18 갈래에는 main @0x710029f6b0의 직접 reset 필드·조건부 type·전원 state/slot·controller reset 및 두 helper 공백을 공유한다. [18_scene_work §8·11·부록 C](18_scene_work.md)의 “ClearSession C 부재”는 부모 통합에서 수정할 접점이며 이 작업은 그 문서를 쓰지 않는다. 공용 SceneBase/Work의 생성·소멸·request/cleanup 소유권은 18의 담당으로 유지한다. [C](../../../analysis/decomp/docs_gap_main.c).

→ 정리본: [18_scene_work.md](18_scene_work.md) §4·§8·§11
#### 9.15.6 미확정 현재 집계·주소 미식별

| ID | 이번 해결/한정 | 남은 경계 |
|---|---|---|
| [미확정] U1 부분 해결 | main 내부 ctor @0x7100150a80의 자원 소유, facade +0x28 위임 확인. [C](../../../analysis/decomp/docs_gap_main.c) | facade/공용 owner 설치·최종 파괴·모든 모드의 앱 전체 수명 |
| [미확정] U2 부분 해결 | 단일 오류/세션 weak-handle 교체, 공용 0 해제·3 handler 복귀 확인. main @0x710013cadc/@0x710013cb64/@0x71001ea620/@0x71001ea710 [C](../../../analysis/decomp/docs_gap_main.c) | N4/N5 유효성·세 번째 슬롯·dispatch 및 지역 Cancel의 누락 인자 |
| [미확정] U3 부분 해결 | Disconnect/Leave 하위 위임, 결과 index, 예약 wrapper, ClearSession 직접 reset 확인. main @0x710013c04c/@0x710013c7f8/@0x710013c800/@0x710013c2f0/@0x71001eacb4/@0x710029f6b0 [C](../../../analysis/decomp/docs_gap_main.c) | N1~N3/N6~N8와 silent Update: SDK 완료/실패·예약 제거·간접 reset |
| [미확정] U4 부분 해결 | 해산 후보/소리/페이드/reboot는 [§9.13.2](12_online_sync.md) 재사용. main Dissolve silent ctor @0x71001f8564 [C](../../../analysis/decomp/docs_gap_main.c) | A1 결합·실제 virtual Update 및 SDK 해산 성공 |
| [미확정] U5 부분 해결 | 허용 조건·저장 재입장 ctor·검색/참가/phase·국소 Work 갱신 확인. main @0x71001ea1b8/@0x710034c564/@0x710034c970 [C](../../../analysis/decomp/docs_gap_main.c) | N9~N15·virtual 성공 callback·최종 모드/host 승계/복구 범위 |
| [미확정] U6 부분 해결 | main focus @0x7100195228의 렌더러 전달만 확인한 [§9.13.3](12_online_sync.md) 재사용 | A2 Switch sleep/resume 네트워크 consumer 주소 |
| [미확정] U7 남음 | saved rejoin의 매핑은 게임 snapshot 증거가 아님. main @0x710034c970 [C](../../../analysis/decomp/docs_gap_main.c) | 게임 객체/RNG 소비 위치/score·게임 중 CPU 대체·실제 복구 caller |
| [미확정] U8 남음 | main @0x71001c94cc/@0x710050f0d4의 seed/barrier/gate는 기존 [§2.2·9.13.4](12_online_sync.md) 재사용 | 상위 seed 실패 보장·씬 전체 gate 연결 caller |
| [미확정] U9 남음 | main @0x71001f0460/@0x71002e1818/@0x71002e1b14의 결과 ring/전송 확인은 기존 [§9.13.4](12_online_sync.md) 재사용 | final authority·end-frame ACK·불일치/commit caller |

[데이터] 현재 U 전체 해결0·부분해결6(U1~U6)·남음3(U7~U9), 열린 상위 항목9개다. listener 슬롯·직접 reset·saved rejoin의 국소 계약이 닫힌 것과 U 전체 해결은 구별했다. 이번16함수·누계57 및 현재 요청15주소는 [§9.15.1·9.15.7](12_online_sync.md), 사용자 선택3개는 [§9.11](12_online_sync.md)에 남는다.

| 주소 미식별/결합 항목 | 정확한 요청 범위·있는 근거 |
|---|---|
| [미확정] M1 결합 미확정(A1) | menu00 PTR_LAB_71001c8b18→후보 @0x71000313f0의 함수 객체/vtable 결합. 후보 C 있음, 새 추출 주소가 아님. [§9.13.2·9.14.3](12_online_sync.md) 재사용 |
| [미확정] M2 코드 주소 미식별(A2) | Switch sleep/resume 네트워크 consumer. 외부 main @0x710144d2e0 및 focus @0x7100195228은 [§9.13.3](12_online_sync.md) 재사용 |
| [미확정] M3 코드 주소 미식별(A3 소유) | 전역 facade/공용 handler owner 설치·최종 파괴 caller. main @0x7100150a80/@0x71001ea620 본체만 있음. [C](../../../analysis/decomp/docs_gap_main.c) |
| [미확정] M4 코드 주소 미식별(A3 복구) | 게임 snapshot/RNG 소비/score·중간 CPU 대체 caller. main ReEntry Update @0x710034c970의 매핑 갱신은 [§9.15.4](12_online_sync.md)에서 한정 |
| [미확정] M5 코드 주소 미식별 | 상위 seed 보장·씬 전체 gate caller. 기존 main @0x71001c94cc/@0x710050f0d4의 [§2.2·3.3·9.13.4](12_online_sync.md) 재사용 |
| [미확정] M6 코드 주소 미식별 | 결과 final authority/end-frame/불일치 caller. 기존 main @0x71002e1818/@0x71002e1b14의 [§5·7·9.13.4](12_online_sync.md) 재사용 |
| [미확정] M7 코드 주소 미식별 | LeaveSessionSilentlyFiber virtual Update. ctor main @0x71001f83e0의 PTR_DAT_7101a87450+0x10 연결만 있음. [C](../../../analysis/decomp/docs_gap_main.c) |
| [미확정] M8 코드 주소 미식별 | DissolveSessionSilentlyFiber virtual Update. ctor main @0x71001f8564의 PTR_DAT_7101a87458+0x10 연결만 있음. [C](../../../analysis/decomp/docs_gap_main.c) |
| [미확정] M9 코드 주소 미식별 | ReEntryFiber 성공 virtual +0x30 target. main Update @0x710034c970의 callback 호출만 있음. ctor vtable PTR_DAT_7101a875e8의 실제 항목 자료 없음. [C](../../../analysis/decomp/docs_gap_main.c) |

[데이터] 위9행은 결합 미확정1·코드 주소 미식별8이며 옛 A묶음3개를 더 구체적으로 나눈 것이다. 이8개에 임의 숫자 주소를 만들거나 §9.15.7의15주소에 합산하지 않는다. [§9.13.6·9.15.6](12_online_sync.md).

#### 9.15.7 현재 Ghidra 요청 표: 빈 하위 함수만

[데이터] 현재 고유 요청은 main.nso 15주소다. [main TSV](../../../analysis/functions/main.nso.tsv)의 address/name/size는 모두 있지만 [INDEX](../../../analysis/decomp/INDEX.tsv) 및 허용 범위 C486개(analysis/decomp/*.c·ghidra_work/*/out/*.c)의 헤더에는 본체가 없다. C를 대신 읽거나 추출하지 않았다. R1~R16은 더 이상 본체 요청에 넣지 않는다. 아래 호출 근거는 모두 새 [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)다.

| ID·모듈·주소·크기 | 호출 근거·요청 이유 |
|---|---|
| [미확정] N1 main.nso @0x71001415c8 FUN_71001415c8 (584 B) | Disconnect @0x710013c04c의 내부 요청/상태·완료/실패. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N2 main.nso @0x71001617b4 FUN_71001617b4 (608 B) | LeaveSession @0x710013c7f8의 내부 이탈·transport 경계/완료/실패. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N3 main.nso @0x7100153690 FUN_7100153690 (12 B) | getter @0x710013c800/@0x710013c2f0의 index 0xd/0xc 저장 결과값 연결. 이 reader만으로 모든 result writer가 닫힌다고 보장하지 않음. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N4 main.nso @0x710013c16c FUN_710013c16c (156 B) | SetSessionEventListener @0x710013cb64의 선행 검사·허용 상태. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N5 main.nso @0x710013cba4 FUN_710013cba4 (24 B) | Set/CancelAllListener @0x71001ea620/@0x71001ea710의 세 번째 setter 종류/슬롯. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N6 main.nso @0x71001ead00 FUN_71001ead00 (408 B) | RequestReserveLeaveSession @0x71001eacb4의 예약 저장·전파/제거 순서. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N7 main.nso @0x71001e9c88 FUN_71001e9c88 (24 B) | ClearSession @0x710029f6b0의 후행 reset helper 영향. 네트워크 reset만 이 갈래 담당. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N8 main.nso @0x71001eaf78 FUN_71001eaf78 (24 B) | 같은 ClearSession @0x710029f6b0의 후행 reset helper 영향. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N9 main.nso @0x710034d250 FUN_710034d250 (360 B) | ReEntry ctor @0x710034c564의 handler 초기화·+0x268 상태1 전이 연결. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N10 main.nso @0x710023d910 FUN_710023d910 (260 B) | ReEntry Update @0x710034c970 성공의 preselected 저장 변경 범위. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N11 main.nso @0x71001ea7b8 FUN_71001ea7b8 (52 B) | 같은 Update @0x710034c970의 연결 전 공용 준비/handler 영향. 함수명 없이 추정 reset 이름을 부여하지 않음. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N12 main.nso @0x710013c9c4 FUN_710013c9c4 (20 B) | AllowReentry @0x71001ea1b8의 map read 소유/반환 연결. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N13 main.nso @0x710013c9d8 FUN_710013c9d8 (8 B) | 같은 AllowReentry @0x71001ea1b8의 map 변경 적용·내부 위임. 완료 성공 의미는 별도 확인. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N14 main.nso @0x710013c458 FUN_710013c458 (8 B) | ReEntry Update @0x710034c970의 저장 검색 조건 설정/시작 위임. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |
| [미확정] N15 main.nso @0x710013c384 FUN_710013c384 (44 B) | 같은 Update @0x710034c970의 검색 상태 getter와 실패 분기 연결. [C](../../../analysis/decomp/docs_gap_main.c)·[TSV](../../../analysis/functions/main.nso.tsv) |

[설계] 우선은 N1~N8의 종료/결과/listener/reset, 다음은 N9~N15의 저장 재입장 연결이다. tiny wrapper 확보는 하위 caller 식별에 필요한 단계이며 성공 enum·전체 복구의 보장을 뜻하지 않는다. silent Update와 성공 callback은 M7~M9에서 실제 항목 식별 후 요청하고 인접 함수를 대신 지정하지 않는다. 전역 owner·슬립·snapshot·gate·결과는 M2~M6의 주소 근거를 먼저 확보한다. [§9.15.3~9.15.7](12_online_sync.md).

#### 9.15.8 준비도·검증 기대값·출처 대응

| 준비도 | 현재 판정 |
|---|---|
| [설계] 바로 가능 | 화면/세션 종료 분리·단일 drain/fanout·원본 단일 listener 슬롯 대응·직접 Work reset 필드·저장 방 재입장 단계·취소/오류 이유 설계. main @0x710013cadc/@0x710013cb64/@0x710034c970/@0x710029f6b0 [C](../../../analysis/decomp/docs_gap_main.c), [DESIGN §10](../../DESIGN.md) |
| [설계] 근사 필요 | NPLN→웹 transport/epoch/timeout·tab hidden/offline/reconnect UI. 원본 검색30 s를 플랫폼 timeout으로 자동 채택하지 않음. main @0x710034c970 [C](../../../analysis/decomp/docs_gap_main.c), [§6.3·8.5·9.11](12_online_sync.md) 미승인 추천 |
| [미확정] 판독 필요 | N1~N15와 M1~M9: SDK 종료/실패·간접 reset·dispatch·최종 owner 수명·silent 완료·재입장 callback/host 승계·슬립·snapshot·전체 gate·결과 합의. [§9.15.6·9.15.7](12_online_sync.md) |

| 후속 검증 경우 | 기대값·근거 |
|---|---|
| [설계] 공용 listener 설치/해제 | 앞 두 슬롯은 마지막 weak-handle로 교체되고 CancelAllListener 뒤 0 tuple이다. 동시에 두 화면을 붙이는 웹 fanout은 appNet에서 구현한다. main @0x710013cadc/@0x710013cb64/@0x71001ea620/@0x71001ea710 [C](../../../analysis/decomp/docs_gap_main.c), [DESIGN §10](../../DESIGN.md) |
| [설계] ClearSession 직접 효과 | Work 로컬/host Invalid, 목록의 state0/slot0xff, 해당 local state2~4의 type0, ControllerAssign reset. helper 영향과 게임 결과 보존은 아직 기대값으로 확정하지 않는다. main @0x710029f6b0 [C](../../../analysis/decomp/docs_gap_main.c) |
| [설계] saved rejoin 성공/실패 | phase2검색→phase3참가→callback→phase4/reason1; 저장 무효/검색 timeout은 reason3, 연결/setup/참가 실패는 reason2의 본문 분기. 참가 loop 전체에30 s cutoff를 추가하면 웹 선택으로 표시한다. main @0x710034c970 [C](../../../analysis/decomp/docs_gap_main.c) |
| [설계] 탭 숨김·게임 중간 재개 | hidden 자체로 원본 슬립/이탈을 합성하지 않고, reconnect/seed 재배포만으로 게임 snapshot/score를 복구했다고 처리하지 않는다. 고정1/60·주입 난수·f32·FrameGate 유지. [§9.13.4·9.15.4·9.15.6](12_online_sync.md), [DESIGN §3·10](../../DESIGN.md) |

[데이터] 새16함수의 원본 출처는 모두 main.nso [docs_gap_main.c](../../../analysis/decomp/docs_gap_main.c)이며 필드/흐름은 §9.15.2~9.15.5, 잔여/요청은 §9.15.6·9.15.7에 대응한다. 기존41함수·어셈블리·웹 disconnect8곳은 §9.12~9.14·9.6 재사용이다. 현재 원본 실행 확인0, 원본/웹 실행·headless·화면 촬영0이다.

[데이터] 최신 문서 정적 검증 통과: §9 CommonMark 링크543/543·새 상대 경로 오류0·참조식 정의0·표지 없는 문단0, 신규16함수 C 헤더/모듈/INDEX·현재15요청 TSV/C 부재·고유 주소 대조, web 저장소 git diff --check. §1~§8 원래56,343바이트 SHA-256 4ac5c24f93009ed2b1f0e9ba47be8040bd10fbfeb2856d70245a88af50f017d9 및 부모 §9.9 링크를 보존하고 §9는 UTF-8·LF로 작성했다. 이전41함수 판독은 재사용했으며 헤더/모듈 존재 대조도 누계57개로 확인했다. 기존 §6.1 clock.ts 링크는 보존 대상이며 괄호 설명을 오류로 세지 않는다. [§9.13.7](12_online_sync.md)·[INDEX](../../../analysis/decomp/INDEX.tsv).

[설계] README 수정은 필요 없다. 부모 통합은 출처 절 끝 정리본 링크 한 줄과 18의 별도 담당 접점 갱신으로 제한하며, 이 작업은 대상 MD의 §9만 수정했다. 출처/README/C/INDEX/SHARED/JSON/코드/에셋은 쓰지 않았다. 출처 링크 제안은 [§9.12.3](12_online_sync.md), 18 접점은 [§9.15.5](12_online_sync.md)다.
