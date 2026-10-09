# 12. 미니게임 진행 중 온라인 동기화

2026-10-08 작성, 2026-10-09 이동·SDK 후속 보완. 확정 범례: **[판독]** 원본 코드·명령·호출 주소 확인, **[데이터]** 원본 바이너리 배치 확인, **[웹]** 현재 TypeScript 확인, **[설계]** 웹 구현 제안, **[미확정]** 추가 근거 필요. 원본 실행·실제 네트워크 접속은 하지 않았다. 주소는 별도 모듈 표기가 없으면 US v0 **main NSO**, 베이스 `0x7100000000`이다.

## 1. 범위와 결론

[방·대기실](../shell/online.md)의 완료 결론을 전제로 **게임 시작 준비 이후의 동기 입력·진행·종료**를 보완한다. 사용자 보고인 광장 원격 위치 불일치는 §3.4·6.2에서 이동 데이터 경로만 추가로 다룬다. 기존 [코어](01_core.md) §3·5·6.6~6.7의 프레임 순서·난수 알고리즘, [입력](05_ui_input.md)·[웹 입력](input_web.md)의 버튼·자이로 의미, [미니게임 씬](../shell/minigame_scene.md)의 단계표는 그대로 참조한다.

- **[판독] 입력을 프레임 버퍼로 교환한다.** SDK는 버튼·스틱·터치·SixAxis 채널 `0~5`와 플레이어 사용자 데이터 채널 `8~15`를 별도로 처리한다. `0x78 B` 사용자 레코드를 컨트롤러 입력 패킷으로 해석하면 안 된다.
- **[판독] SDK 진행은 입력 가용 범위로 제한된다.** 현재 프레임 `F`에 지연 `D`를 더한 프레임에 로컬 입력을 넣고, 진행 가능 범위가 부족하면 `0x4c2c`로 멈춘다. 확인한 계약은 아래 필드·조건으로 표현한다. 전체 구조를 lockstep/rollback/상태복제 중 하나로 단정할 근거는 아직 부족하다.
- **[판독] seed 배포자·씬 데이터 배포자·입력 소유자는 서로 다른 역할이다.** 세션 호스트를 모든 점수·판정의 단일 권한자로 보는 분기는 대표 게임의 판정/결과 호출부에서 확인되지 않았다.
- **[웹] 광장 수신 좌표와 표시 좌표는 별개다.** `RemoteActor`의 0.2 s 보간 뒤 `FollowSystem`이 목표 추종·로컬 충돌을 다시 계산한다. 정지 최종 좌표 미전송과 이중 보간은 코드로 확인했으며, 보고된 각 증상의 직접 원인은 §6.2 관측으로 구분해야 한다.
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
| [server/games.ts](../../server/games.ts), [wire.ts](../../script/shell/online/wire.ts) | 서버 등록은 `mpj-plaza` 하나. `MSG`에는 방 제어·광장 INFO/STAMP만 있으며 게임 frame input/seed/start barrier/result 메시지는 없음. 기존 방 프로토콜의 크기·권한은 online.md §9.5 참조 |
| [socketio.ts](../../script/shell/online/socketio.ts) | `reconnection:true` 옵션은 있으나 disconnect handler가 `closeSocket()`으로 socket을 명시 종료. 게임 재접속/프레임 재전송 계약은 없음. 광장 이탈 시 연결 종료는 online.md §9.5~9.6의 완료 결론 |
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
  → PlazaUi.tick → RemoteTable.receive/step → 매 틱 net:remote
  → FollowSystem.remote → 다음 follow 틱 이동·충돌 → sync(root.position) → render
```

| 단계/파일 | 실제 값·조건 |
|---|---|
| 발신 [ui/part.ts](../../script/shell/plaza/ui/part.ts), [ui/net.ts](../../script/shell/plaza/ui/net.ts) | `input/follow` actor의 로컬 비COM 사람 순번을 wire slot으로 압축. slot<4, 방 멤버≥2. timer≤0·`Σvel²>0.1`일 때만 보내고 timer=0.2; `joined/memberReady`의 `sendAll`은 force. 계속 움직여도 정확한 12틱 고정 송신이 아니며, 정지/회전 dirty·정기 heartbeat 없음 |
| 실제 payload [wire.ts](../../script/shell/online/wire.ts) | `INFO=0x10`: `[type:u8,slot:u8,x/y/z:i16 LE,yaw:u16 LE]`, 10 B. 서버 삽입 후 `REMOTE_INFO=0x90`: `[type:u8,station:u16 LE,slot:u8,x/y/z:i16 LE,yaw:u16 LE]`, 12 B. `qpos=clamp(round(pos×256),−32768,32767)`, 복원 `q/256`; 표현 범위 `[-128,127.99609375] m`. `qyaw=round(frac(yaw/2π)×65536)`를 u16으로 저장. frame/timestamp/sequence/velocity/버튼/충돌 상태 없음 |
| 중계 [rooms.ts](../../server/games/mpj-plaza/rooms.ts), [index.ts](../../server/games/mpj-plaza/index.ts) | INFO 길이10·slot<발신자의 프로필 사람 수만 검사. station은 연결에서 주입하며 호스트 조건 없이 다른 station으로 동일 좌표 relay. `others` 기본 volatile=false, 현재 INFO도 그 경로: 일반 Socket.IO emit. 서버의 250 ms tick은 연결 정리이며 이동 송신 주기가 아님. 마지막 위치 저장/늦은 참가자 snapshot·서버 이동/충돌 계산은 없음 |
| 수신 [socketio.ts](../../script/shell/online/socketio.ts), [ui.ts](../../script/shell/plaza/ui/ui.ts) | 멤버 매핑 없는 station/slot은 폐기. UI도 live remote station만 수용. 첫 INFO가 있어야 RemoteTable actor 생성. 누적 event queue를 틱에서 비우며 좌표의 원래 frame/나이를 판정할 정보 없음. 참가/준비의 강제 송신이 최초 표시를 담당함 |
| 1차 좌표 처리 `RemoteActor` | **렌더 mover와 다른 내부 pos**로 5/1 m 분기. ≤1 m 새 위치는 버리고 회전만 0.2 s slerp; 1~5 m는 내부 pos를 0.2 s 선형 보간. 마지막 목표 하나만 있고 frame history/외삽·입력 예측·rollback buffer는 없음. 완료 후에도 mode를 유지하며 UI는 패킷이 없어도 같은 mode/pos를 매 틱 발행 |
| 2차 이동 [follow.ts](../../script/shell/plaza/follow.ts), [player.ts](../../script/shell/plaza/player.ts) | `net:remote.pos`의 y를 `groundHeight(x,z,y+2)`로 바꿈. interp 목표를 `autoInterp(speed=6,dt=1/60)`의 방향으로 추종하되 보간 산출 speed>2.001이면 run6, 아니면 walk2. 도착 거리≤0.1이면 x/z snap. 로컬 collider·접지·선회를 다시 적용한 `mover.pos`가 actor와 root에 복사됨. rotate는 target=null; spawn/teleport는 매 틱 place. 따라서 UI 내부 좌표 도달이 렌더 actor 도달을 뜻하지 않음 |

**확인된 경로와 재현 후보:**

| 구분 | 위치 불일치/실시간성에 미치는 구체 조건 | 확인할 재현·관측 |
|---|---|---|
| 확인: 정지 최종 위치 미전송 | timer가 남은 동안 움직인 뒤 멈추면 마지막 이동분은 다음 송신 시각의 vel=0에 막힘. 이후 움직임/force까지 원격 목표가 오래된 좌표에 머묾. 원본 송신 조건도 같지만 정지 좌표 일치 보장은 없음 | 마지막 INFO 직후 0.2 s 이내 짧게 이동→완전 정지. `P_local`과 마지막 `P_wire` 차이가 남고 stopped 상태에서 INFO가 추가되지 않는지 비교. 단순 신뢰 전송으로 해결되지 않음 |
| 확인: 중복 보간·다른 거리 기준 | 원본은 실제 Player 위치를 기준으로 하나의 보간기를 시작한다. 웹은 RemoteActor 내부 좌표 기준 분기 뒤 충돌하는 렌더 mover를 다시 추종시킴. 모드가 rotate가 되면 렌더 mover가 남은 목표를 잃을 수 있음 | 평지 직선→회전/정지와 벽·계단 근처를 비교. 동일 틱 `P_wire,P_ui,P_mover,P_root` 및 mode/target/speed를 함께 기록. `P_wire≈P_ui`인데 `P_mover`만 뒤처지면 수신 누락보다 후단 이동 경로가 원인 |
| 확인: 1 m 무시 구간·0.2 s 근사 | `d≤1` 위치 무시는 원본 규칙이다. 걷기2 m/s×0.2 s≈0.4 m라 연속 패킷을 받아도 위치 갱신이 매번 되지 않음. 웹의 0.2 s 선형 보간시간은 원본 확정 상수가 아님 | 평지 걷기/달리기에서 매 수신 d와 mode를 비교. 패킷 도착은 규칙적인데 rotate가 이어지면 지연·누락으로 오진하지 않음. 실시간 위치 일치를 목표로 하면 해당 deadband 정책을 별도로 결정 |
| 후보: 최초 표시/로더/장면 보임 | 멤버 매핑 전 INFO 폐기, 최초 INFO 부재, `FollowSystem.loading` 중 새 이벤트 폐기, 기구 전환 `setVisible(false)`는 각기 다른 조건. 로더 완료는 첫 이벤트 좌표로 spawn하고 다음 UI 틱에서 회복 가능 | 둘 다 정지한 상태의 순차 참가·여러 로컬 사람·느린 모델 로드·기구 출발을 각각 비교. `(station,slot)` 프로필/INFO/RemoteTable/remote actor 존재·root.visible을 구분. 최초 송신과 UI 적용의 실제 순서가 필요 |
| 후보: 좌표 범위·충돌면·슬롯 | 범위 밖은 i16 포화; 수신 y는 로컬 바닥 재투영. `createPlayer`는 local slot0을 먼저 선택해 isCom을 검사하지 않으나 송신 순번은 비COM만 포함. 정상 설정이 이런 조합을 허용하는지는 별도 확인 필요 | `abs(x/y/z)≥128`, 계단/복층, CPU가 slot0인 설정을 따로 확인. 송신 전/복원 좌표, collider hit y, 실제 actor slot과 프로필 순번을 비교. 카메라·캐릭터 문서의 병행 변경은 해당 작업에서 검증 |
| 후보: 부하·호출자 | 광장 FixedClock은 최대4틱 이후 밀린 시간을 버린다. `scene.step(df>1)` 직접 사용은 part별 여러 틱 실행으로 마지막 pos만 송신 샘플링할 수 있지만 **현재 plaza_page는 항상 step(1)을 반복**하므로 이 배치 문제를 현재 기본 실행 원인으로 단정할 수 없음 | 정상/30 fps/탭 복귀에서 실제 wall time, 실행 틱수와 INFO 간격을 비교. 직접 df>1 호출은 별도 API 재현으로 분리 |

기존 관측은 `window.__plaza.debug()`의 `actors`, `parts.player`, `parts.follow.remotes`, `parts.ui.remote/log`다. 프로토콜 단계는 디버거에서 `encInfo/decInfo/RemoteActor.receive/FollowSystem.remote/sync`를 관측한다. 최소 비교 record는 `(local wallTime,실행 tick,station,wireSlot,actorSlot,tx/rx,mode,P_local,P_wire,P_ui,P_mover,P_root,target,root.visible)`와 `Etx=|P_local−P_wire|,Erx=|P_wire−P_ui|,Efollow=|P_ui−P_mover|,Erender=|P_mover−P_root|`다. 다른 기기의 wallTime은 공통 frame이 아니므로 RTT 없이 단방향 지연으로 계산하지 않는다. 현재 debug에는 패킷별 좌표/시각·target/visible 전체가 없어서 그 값은 추가 관측이 필요하다.

광장 수정의 검토 계약 [설계]: 정지 전이·최종 좌표 dirty/회전 dirty·초기 전체 송신을 명시하고, 수신 원본 목표를 한 actor 보간기에 공급한다. 원본 동등성을 원하면 5/1 m 분기는 **표시 actor 위치** 기준으로 한 번만 적용한다. 렌더용 충돌/접지 보정의 허용 오차와 수정 권한을 정하고 UI 논리 좌표와 물리 좌표의 차이를 측정한다. timestamp/sequence·최신 좌표 backfill의 필요성은 웹 계약으로 정하되, 광장 위치 메시지를 미니게임 input/frame 버퍼로 재사용하지 않는다.

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
