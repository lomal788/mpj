# 01. 엔진 코어 — 메인 루프·시간·파이버·난수·장면 수명·엔티티

2026-10-02. 상태: **분석 진행**(코어 판독 완료, 원본 실행 확인 없음). 웹 코드는 고치지 않았다(9절은 명세다).
확정 수준: **[실행]** 원본 실행 확인, **[판독]** 원본 명령 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**. 이 문서에 [실행]은 없다. 재구현 계산은 "재구현 계산"이라고 따로 적는다.

주소는 SwitchLoader 기본 베이스(0x7100000000) 기준이고 **모듈 이름과 함께** 쓴다. 이 문서의 주소는 따로 적지 않으면 모두 main NSO다(`main @0x…`).

---

## 1. 기능 개요

미니게임 코드(NRO)는 엔진 코어 위에서 돈다. 웹 포팅에서 그대로 재현해야 하는 코어 동작은 다섯 가지다.

| 코어 | 원본 | 결론 요약 |
|---|---|---|
| 시간 | `bex::MainModule::GetDeltaTime` | 프레임 시작에 `CoreSystem::g_FrameStep.delta`를 복사한 값이다. **리듬 장면(mg1801~mg1810)은 고정 1/60(f32 `0x3C888889`)**, 그 밖의 오프라인 장면은 **실측 프레임 시간(최대 0.05 s)** 이다. boot.nbinit의 Fixed 설정은 nnMain이 Variable60으로 덮어쓴다 [판독] |
| 업데이트 순서 | CoreSystem 타이밍 0x0D→0x0E→0x0F(서브스텝 n회)→…→0x1B | 0x0E에서 SceneModule(장면 상태기계) → FiberModule(파이버) 순서다 [판독] |
| 파이버 | `bex::Fiber`, `bex::FiberModule` | 장면 시퀀스마다 목록 하나, **우선순위(int, 오름차순) 안정 정렬 + 등록 순서**로 한 프레임에 한 번씩 돈다. `Wait()` = 다음 프레임에 이어서 [판독] |
| 난수 | `bex::RandModule` | 비동기·동기 두 개의 **MT19937**. 분포 식이 서로 다르다(비동기 `uniform_int` 기각 표본, 동기 `(u·n)>>32`) [판독], 파이썬 재구현이 numpy MT19937과 1,000개 일치 [재구현 계산] |
| 장면 수명 | `bex::GameScene` 구현체 상태 0~10, `bq::SceneBase`, `bq::MinigameScene` | OnEntry→OnStart→…→OnBegin→OnLoaded→OnLoadComplete→OnSetup(SetupScene·SetupGame)→동기 시드→OnStartUpdate(SyncedSetupScene·SyncedSetupGame)→UpdateMain(흐름 파이버)→OnMainEnd→OnCleanup [판독] |

mg1801 쪽 결론(판정 `elapsed`가 증가 후 값인지 등)은 [analysis/notes/mg1801_core.md](../../../analysis/notes/mg1801_core.md)에 모았다.

## 2. 분석 대상·자료 위치

| 항목 | 위치 |
|---|---|
| 원본 | Super Mario Party Jamboree US v0, `extracted/exefs/main`(NSO), `romfs/nro/NX_Release/mg1801.nro` |
| 엔진 설정 | `extracted/romfs/boot.nbinit` [데이터] |
| Ghidra 프로젝트 | `ghidra_work/core/jamboree_main`(main.nso), `ghidra_work/core/mg1801/core_mg1801`(mg1801.nro, 디스어셈블 대조용으로 새로 가져옴) |
| 판독 덤프 | `analysis/decomp/core_b1.c`~`core_b14.c`(명령별 덤프, 머리줄 `// ######## <명령>`), `core_mg1801_dis.c`(mg1801 디스어셈블) |
| 도구 | `tools/ghidra_scripts/CoreTool.java`(주소 디컴파일·범위·디스어셈블·참조·vtable), `tools/core_rand.py`(난수 재구현) |
| 계산 결과 | `analysis/core_rand_vectors.json`(난수 시험 벡터) |

CoreTool 사용 예(한 번에 여러 명령, 약 30초):

```sh
MSYS_NO_PATHCONV=1 ./tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/core jamboree_main \
  -process main.nso -noanalysis -readOnly -scriptPath c:/dev/mpj/tools/ghidra_scripts \
  -postScript CoreTool.java c:/dev/mpj/analysis/decomp/out.c dec:7100196670 range:710018c800-710018e900 \
  dis:710013aae0-710013b400 refs:7101c0beb8 vtgot:7101a85700:26 ptrs:71019e15c8:72
```

## 3. 진입점과 전체 호출 흐름

### 3.1 메인 루프 [판독]

`nnMain @0x7100003540`

1. `bex::MainModule` 생성(`FUN_7100194650`, vtable `0x71019ca5c8`, 시간 구조체 0x78 B를 `MainModule+0x28`에 둔다).
2. `FUN_71001947c0(g_Module, "boot.nbinit")`가 설정 파일을 읽어 부트 설정 `0x7101c0c420`(`FUN_7100193ec8`)에 채운다(`FUN_7100194dac`).
3. **이어서 nnMain이 부트 설정 몇 칸을 상수로 덮어쓴다.** 그중 `+0x18`(프레임레이트 열거, 4.5) = **1(Variable60)** 이다 (`@0x71000035d8 str w8(=1),[x0,#0x18]`).
4. `MainModule vt+0x40`(`FUN_7100003a90`) = 메인 루프.

```c
// FUN_7100003a90 (MainModule vt+0x40)
vt+0x48(cfg);            // FUN_7100003b28 → FUN_7100195494: 시간 구조체·CoreSystem·프레임 타이머 초기화
first = vt+0x58;          // 첫 바퀴만
for (;;) {
  first ? vt+0x58() : vt+0x70();   // 0x70 = FUN_710019608c (World3d 정리, time+0x28 카운터 감소)
  if (vt+0x88())  break;           // FUN_71001960c0 종료 요청
  vt+0x60();                        // FUN_710019581c 프레임 시작: DeltaTime·FrameCount 갱신 (6.3)
  vt+0x68();                        // FUN_710019594c 일시정지 비트를 CoreSystem 에 반영 (5.6)
  FUN_7100984460();                 // CoreSystem 한 프레임: 타이밍 0x0D..0x1B, 다음 프레임 스텝 계산
}
vt+0x50();                          // 종료
```

### 3.2 CoreSystem 한 프레임 `FUN_7100984460` [판독]

CoreSystem 인스턴스는 `*(0x7101c45478)`(0x1720 B, 생성 `FUN_71009831e0`)이다. 모듈은 "타이밍 번호"마다 처리기를 등록하고(`FUN_7100984a20(timing, token, fn)`), 같은 타이밍 안의 순서는 의존 간선으로 정한다(3.3).

```c
// 평상시(CoreSystem+0x30 == 0)
for (t = 0x0D; t < 0x1A; t++) {
  if (t == 0x0F) {                                   // FixUpdate 서브스텝
    if (!g_IsFixUpdateSubstepEnabled) Run(0x0F);
    else {
      acc = CS+0x1684;
      for (k = CS+0x1688; k > 0; k--) {              // 횟수는 앞 프레임 끝에서 계산(6.2)
        step = g_SubDeltaSec;                         // (서브스텝이 꺼져 있으면 g_FrameStep.delta)
        Run(0x0F); acc += step;
      }
      CS+0x1684 = acc - g_FrameStep.delta;
    }
    continue;
  }
  Run(t);
}
Run(0x1B);
// … 프레임 페이싱(지연 판정, CS+0x16c0 이하) …
FUN_7100983e48();   // 다음 프레임의 g_FrameStep 계산(6.1) + 서브스텝 횟수 + Run(9,10,11,12)
if (CS+0x1670 != CS+0x1674) FUN_7100984de8(...);   // 일시정지 단계 변경 → Run(0x1C)
```

- `CoreSystem+0x30`이 켜진 특수 모드(백그라운드 등으로 보임 [추정])에서는 0x24, 0x13, 0x15~0x19만 돈다.
- 시작 때 `FUN_7100983c00`이 타이밍 0, 1~4를 돌고 `FUN_7100983e48`로 첫 프레임 스텝을 만든다. 6은 종료 처리기다.
- 타이밍 번호의 공식 이름은 찾지 못했다 [미확정]. 문자열 `Timing_FixUpdate`, `Timing_Update`, `Timing_PostUpdate`는 ComRigger 쪽 열거라 이 번호와 대응을 확인하지 못했다.

### 3.3 타이밍 안의 순서 [판독]

- 등록 `FUN_71009886d0`은 간선 (루트 → 토큰)을 만든다.
- 순서 지정 `FUN_7100984a58(t, A, B)` → `FUN_7100988760`은 간선 **(B → A)** 를 만든다.
- 정렬 `FUN_71009891a0`은 진입 차수 0부터 내보내는 위상 정렬(Kahn)이다. 간선 (X → Y)는 "X가 Y보다 먼저"다.
- 즉 `a58(t, A, B)` = "타이밍 t에서 **B 다음에 A**".
- 방향 교차 확인: FiberModule 등록은 `a58(2, Fiber, Scene)`이다. 즉 초기화 타이밍 2에서 Scene이 먼저다. FiberModule 초기화 `FUN_710018e890`은 시퀀스 수를 SceneModule(`FUN_710019f354`)에서 읽으므로 Scene이 먼저 있어야 한다. 이 의존과 방향이 맞는다.
- 토큰: Scene = `*0x7101a85b68`(=`0x7101c0e508`), Fiber = `*0x7101a85b58`(=`0x7101c0b438`).

이번 작업에 필요한 타이밍 0x0E의 관계:

| 등록 함수 | 처리기 | 순서 지정 | 뜻 |
|---|---|---|---|
| SceneModule 등록 `FUN_710019eb24` | 0x0E `FUN_710019f150`(장면 Update), 0x10 빈 함수, 0x12 `FUN_710019f1d0`(장면 Anytime) | `a58(0x0E, Fiber토큰, Scene토큰)` | **장면 → 파이버** |
| FiberModule 등록 `FUN_710018e33c` | 0x02 시퀀스 생성, 0x06 정리, 0x0E `FUN_710018e5f0`(파이버 실행) | `a58(0x0E, 토큰@0x7101c436f8, Fiber토큰)` | 파이버 → 그 모듈 |

0x0E에는 이 밖에도 등록 함수 `0x71001cc798`, `0x71006bc21c`, `0x710078ca54`, `0x71004f703c`, `0x7100004df0`, `0x71002c85c0`, `0x710080653c`, `0x7100226e1c`, `0x71008a273c`의 처리기가 있다. 이들의 모듈 이름과 장면·파이버와의 상대 순서는 확인하지 않았다 [미확정]. 0x0F(FixUpdate)는 `0x7100613f5c`, `0x71008a273c`가 등록한다(물리·컴포넌트 고정 갱신으로 보임 [추정]). **게임 코드(장면 흐름·제품 파이버)는 0x0F가 아니라 0x0E에서 프레임당 한 번 돈다** [판독].

### 3.4 한 프레임 안의 게임 코드 순서 (미니게임) [판독]

```
MainModule vt+0x60 : DeltaTime = g_FrameStep.delta, FrameCount++          (6.3)
CoreSystem 타이밍 0x0D
CoreSystem 타이밍 0x0E
  ├ SceneModule FUN_710019f150 : 시퀀스마다
  │    FiberModule 현재 시퀀스 = 장면 시퀀스 (FUN_710018e674)
  │    맨 앞 장면: (처음이면 Start) → 일시정지 아니면 GameScene::Update → 구현체 상태기계 (5.1)
  │      상태 9: bq::SceneBase::UpdateMain (5.2)  ← 첫 호출에서 흐름 파이버 생성
  └ FiberModule FUN_710018e5f0 : 시퀀스 0,1,… 마다 FUN_710018f400 (6.4)
       대기 목록 → 실행 목록 뒤에 붙이고, 우선순위 안정 정렬 → 앞에서부터 한 번씩 재개
CoreSystem 타이밍 0x0F × n (n = 고정 60에서 1)
CoreSystem 타이밍 0x10 … 0x19 (0x12: 장면 Anytime(paused) → UpdateAnytime)
CoreSystem 타이밍 0x1B, 다음 g_FrameStep 계산, 타이밍 9~0x0C
```

mg1801의 실제 순서(같은 시퀀스, 우선순위 모두 0):

| 순서 | 파이버 | 생성 시점 | 하는 일 |
|---|---|---|---|
| 1 | Product<StageMan> (MapImpl) | OnStartUpdate → SyncedSetupGame → `MaintainProductImpl::Initialize` | `Wait()`만 |
| 2 | Product<ObjectMan> | 위와 같음(Stage 다음) | `Obj::Update` 75개 (`elapsed += dt`) |
| 3 | Product<PlayerMan> | 위와 같음(Object 다음) | `Player::MyUpdate` 4명 → `JudgeInput` |
| 4 | `OnStartUpdate`가 만드는 0x40 B 파이버(`FUN_71002d16fc`) | OnStartUpdate 끝 | [미확정] |
| 5 | 장면 흐름 `FiberLite "bq::SceneBase"` | 다음 프레임 UpdateMain 첫 호출 | `MinigameFlow` 한 걸음 → 상태 9면 `RmMgSceneBase::OnGameMain`(채보 줄 → `ObjectMan::Entry`) |

- 제품 세 개와 흐름 파이버는 모두 `bex::Fiber::Fiber(prio=0, false)`로 만들어진다(mg1801 `CreateStage/CreateObject/CreatePlayer`, main `bq::SceneBase::UpdateMain`의 `FiberLite::Create(…,0,0)`).
- 그래서 정렬 뒤에도 등록 순서가 남는다. 결론은 **Stage → Object → Player → … → 장면 흐름** 이다.
- 장면 흐름이 맨 뒤라서, 이번 프레임에 `Entry`된 채소는 이번 프레임에 `Obj::Update`를 받지 않는다. 다음 프레임부터 Update → 판정 순서로 돈다.

## 4. 구조체·필드·상수

### 4.1 MainModule 시간 구조체 (`MainModule+0x28`가 가리키는 0x78 B, 생성 `FUN_7100194650`)

| 오프셋 | 타입 | 이름(웹 권장) | 초기값 | writer | reader |
|---|---|---|---|---|---|
| +0x08 | f32 | `deltaTime` | 0 | 프레임 시작 `FUN_710019581c` (= `g_FrameStep.delta`) | `GetDeltaTime @0x7100196670`, `GetDeltaRate @0x7100196694` |
| +0x0C | f32 | `unscaledDelta` | 0 | 같음 (= delta × (1/timeScale)) | [미확정] |
| +0x10 | u64 | `lastTick` | 0 | 같음 | 같음 |
| +0x18 | f32 | `realDelta`(실측 초) | 0 | 같음 (`(float)ns / 1e9`) | `FUN_71001966c8`(이름 없음) |
| +0x1C | s32 | `frameCount` | 0 | 같음 (+1, 전역 `*0x7101a85cc8`에도 복사) | `GetFrameCount @0x71001966ec` |
| +0x20 | u8 | 종료 요청 | 0 | — | vt+0x88 |
| +0x21 / +0x22 | u8 | nbinit 읽음 / 초기화 끝 | 0 | `FUN_71001947c0` / `FUN_7100195494` | 프레임레이트 변경 함수 |
| +0x24 | u16 | 일시정지 비트(단계 0~15) | 0 | `SetPause @0x71001967d8`, `CancelPause @0x7100196848` | vt+0x68 |
| +0x38 | s32 | 현재 프레임레이트 열거(4.5) | 0 → 초기화에서 1 | `FUN_7100195494`, `SetTemporaryFrameRate @0x71001964ec`, `FUN_710019642c` | `GetFrameRate`, `GetTimePerFrame` |
| +0x3C | s32 | 기본 프레임레이트 | 같음 | `FUN_7100195494` | `ResetFrameRate`, `FUN_710019642c(…,0)` |
| +0x40 | f32 | 목표 fps(=FixUpdateSubStepFps 60) | 60.0 | `FUN_7100195494` | `GetTargetFrameRate`, 서브스텝 간격 1/x |
| +0x44 | f32 | 현재 timeScale | 1.0 | 프레임 시작 | `GetTimeScale @0x710019664c` |
| +0x48 | f32 | 요청 timeScale | 1.0 | `FUN_7100196630`(ca 쪽 4곳에서 호출) | 프레임 시작 |
| +0x70 | f32 | CPU 부스트 타이머 | −1 | `Enable/DisableCpuBoostMode` | `FUN_71001951d4` |

### 4.2 CoreSystem 전역·필드 (인스턴스 `*(0x7101c45478)`)

| 위치 | 타입 | 이름 | writer | 뜻 |
|---|---|---|---|---|
| `g_FrameStep @0x7101bc5d08` | {u8 isFixed, f32 delta(+4), s64 ns(+8), s64 ns(+0x10)} | 이번 프레임 스텝 | `FUN_7100983e48`만 | `delta`가 GetDeltaTime의 원천이다. `Fiber::Sleep`도 이 값을 뺀다 |
| `0x7101bc5d20` | f32 | 1/delta | `FUN_7100983e48` | |
| `g_SubDeltaSec @0x7101bc5d24` | f32 | 서브스텝 간격 | 같음 (CS+0x1680 복사) | 1/FixUpdateSubStepFps(60) = `0x3C888889` [추정: f32 나눗셈과 double→f32 모두 같은 비트] |
| `g_IsFixUpdateSubstepEnabled @0x7101c454b0` | u8 | 서브스텝 켬 | 같음 (CS+0x167d) | 1 |
| CS+0x38 | handle | 프레임 타이머(4.3) | `FUN_71009831e0` | |
| CS+0x58 / +0x60 | s64 | 실측 프레임 간격 ns / 마지막 시각 | `FUN_7100983e48` (CS+0x70 = 1일 때) | 가변 모드 입력 |
| CS+0x1670 / +0x1674 | u32 | 일시정지 비트 요청 / 적용 | `FUN_7100984ee0` / `FUN_7100984de8` | |
| CS+0x1678 | s32 | 현재 일시정지 단계 P (−1 = 없음, 0~16) | `FUN_7100984de8` | `MainModule::GetPauseLevel` |
| CS+0x1684 | f32 | 서브스텝 누적(빚) | 프레임 처리 | 초기 0 |
| CS+0x1688 | s32 | 이번 프레임 서브스텝 수 | `FUN_7100983e48` | 초기 1 |

### 4.3 프레임 타이머 (CS+0x38, 0x30 B, 생성 `FUN_71009877f8`, 스텝 계산 vt+0x28 = `FUN_7100987af8`)

| 오프셋 | 이름 | 생성값 | 설정 함수 | 값(Variable60 / Fixed60) |
|---|---|---|---|---|
| +0x10 | mode (0 고정, 1 가변) | 0 | `FUN_7100987ab0` | 1 / 0 |
| +0x14 | fps | 60.0 | `FUN_7100987ab8` | 60 |
| +0x18 | timeScale | 1.0 | `0x7100987ac8`(MainModule이 요청 시) | 1.0 |
| +0x1C | vsync 간격 n (fps = 60/(n+1)) | 0 | `FUN_7100987ad8` | 0 |
| +0x20 | 최소 fps(가변 상한 시간) | 15.0 | `FUN_7100987ae0` | 20.0 |
| +0x24 | 최대 fps | 240.0 | `FUN_7100987ae8` | 60.0 |
| +0x28 | 상한 플래그 | 0 | `FUN_7100987af0` | 1 |

값의 근거:
- CoreSystem 생성(`FUN_71009831e0`)에는 두 경로가 있다. boot.nbinit을 읽은 경우(부트 설정 +0x8a4 = 1, 실제 부팅)는 nbinit 로더(`@0x7100523718`에서 꼬리 호출)가 `bezel_core_init` 값으로 만든다. 읽지 않은 경우는 `FUN_7100195494`가 `FUN_7100195270`으로 설정을 만들어 부른다.
- 어느 경로든 `FUN_7100195494` 끝에서 `FUN_7100195690(time)`이 `time+0x38`(= 1, nnMain이 덮어씀)을 타이머에 적용한다. 그래서 mode·n·minfps·maxfps·플래그는 표의 Variable60 값이 된다. +0x14(fps)와 서브스텝 설정은 nbinit 값(서브스텝 켬, 60)을 따른다 [판독 + 데이터]. 서브스텝 fps → 간격 변환 식은 nbinit 경로에서 따로 보지 않았다 [추정: 1/60].
- 변경은 `FUN_7100195690`이다.
- `FUN_7100195690`의 프레임레이트 2~8용 표(main `@0x71015d6eac/ec8/ee4`)는 n = [1,1,2,2,3,3,2], maxfps = [30,30,20,20,15,15,20], minfps = [20,20,10,10,10,10,10]이다 [데이터].

### 4.4 장면별 프레임레이트 강제 [판독]

| 호출 | 위치 | 효과 |
|---|---|---|
| `FUN_710019642c(MainModule, 1)` | `ca::rm::RmMgSceneBase::RmMgSceneBase @0x7100440fb8` | 가변이면 같은 fps의 고정으로 바꾼다(1→0, 3→2, 5→4, 7→6, 8→0). 그 전에 고정이었는지를 `this+0x474`에 저장한다 |
| `FUN_710019642c(MainModule, this[0x474])` | `~RmMgSceneBase @0x7100441390` | 원래 고정이 아니었으면 기본값(+0x3C = 1)으로 되돌린다 |
| `FUN_710019642c(…,1)` / `(…,0)` | `FUN_71001bceac` / `FUN_71001be030` (네트워크 동기 시작/끝) | **온라인 동기 중에는 고정** |

`RmMgSceneBase`를 쓰는 NRO는 mg1801~mg1810 열 개다 [데이터: 함수 목록의 import]. 나머지 미니게임은 오프라인에서 Variable60이다.

### 4.5 프레임레이트 열거 (`time+0x38`) [판독 `FUN_7100194dac`, `GetTimePerFrame @0x710019658c`]

| 값 | 뜻 | GetTimePerFrame |
|---|---|---|
| 0 | Fixed 60 | 0.016666668 |
| 1 | Variable (최대 ≥ 60) | 0.016666668 |
| 2 / 3 | Fixed 30 / Variable 30 | 0.033333335 |
| 4 / 5 | Fixed 20 / Variable 20 | 0.05 |
| 6 / 7 | Fixed 15 / Variable 15 | 0.06666667 |
| 8 | 가변(그 밖) | 1/목표fps |

- boot.nbinit을 열거로 바꾸는 규칙(`FUN_7100194dac`)은 이렇다. Fixed는 Fps60/30/20/15 → 0/2/4/6이다. Variable은 VariableFrameRateMax가 ≥60/≥30/≥20/≥15/그 밖 → 1/3/5/7/8이다.
- boot.nbinit은 Fixed+Fps60(=0)이다 [데이터]. 그러나 nnMain이 곧바로 1로 덮어쓴다 [판독].
- docs/01 §5의 "고정 60fps" 기술은 **설정 파일 값으로는 맞지만 실제 동작은 아니다**. 이 문서가 정정한다.

### 4.6 FiberImpl (0xF0 B, `bex::Fiber+8`, 생성 `FUN_710018d988`)

| 오프셋 | 이름(웹 권장) | 초기값 | writer | reader |
|---|---|---|---|---|
| +0x08 | 소유 `bex::Fiber*` | 생성자 | `Fiber::Fiber @0x710018c9b0` | 진입 `FUN_710018d950`(owner vt+0x20 = Update) |
| +0x10 | nn::os::FiberType | — | `FUN_710018db0c`(처음 재개 직전 InitializeFiber) | |
| +0x30 bit2 | 완료 | 0 | OS | `IsCompleted`, 스케줄러 |
| +0x68 / +0x70 | 스택 / 크기 | 0 / 기본 | `FUN_710018db0c` / `SetStackSize` | |
| +0x74 | `pauseLevel` | 0 | `Fiber::SetPauseLevel @0x710018cb30`(0~16) | 스케줄러 |
| +0x78 | 시퀀스 번호 | 등록 때 | `FUN_710018e68c` | 해제 |
| +0x7C | `priority` | 생성자 인자(int) | `FUN_710018d988` | 정렬 `FUN_710018f740` |
| +0x80 | 이름 HashedString | "" | `Fiber(name,…)` | |
| +0x90 | `sleepTimer` (f32 초, 음수 = 영원히) | 0 | `Sleep` | 재개 판정 |
| +0x94 | `waitCount` (음수 = 영원히) | 0 | `Wait(n)` | 재개 판정 |
| +0xA0~+0xC0 | 조건 std::function | 없음 | `WaitWhile/WaitUntil` | 재개 판정 |
| +0xD1 | global | 0 | `SetGlobal` | 시퀀스 정리 `FUN_710018ef50` |
| +0xD2 | 시작됨 | 0 | 재개 때 | 소멸 |
| +0xD3 | 조건 종류 (1 = While, 0 = Until) | 0 | `WaitWhile/Until` | 재개 판정 |
| +0xD5 | 정지(소멸 요청) | 0 | `~Fiber`(`FUN_710018dca8`) | 스케줄러 |
| +0xD8 | 소유 객체(자동 삭제 대상) | 생성자 | `Fiber::Fiber` | `FUN_710018d0c0` |
| +0xE0 | autoDestroy | 0 | `SetAutoDestroyEnabled` | 완료 처리 |

`bex::Fiber` 자체(0x10 B)는 vtable `0x71019d5390`과 `+8 = FiberImpl*`이다. vtable은 +0x18 `StartUpdate`(빈 함수, 재개 직전 1회) → +0x20 `Update`(파이버 본체), +0x28 `Destroy`다. 게임 클래스는 `bex::Fiber`를 멤버로 두고 vtable +0x20을 자기 `Update`(비가상 thunk)로 덮는다. mg1801 `ObjectManImpl`의 Fiber 부분은 `this+0x10`이고, thunk는 `mg1801 @0x7100004a20`이다.

### 4.7 FiberModule 시퀀스 (0x88 B, 생성 `FUN_710018e890`, 수 = SceneModule 시퀀스 수 `FUN_710019f354`)

| 오프셋 | 내용 |
|---|---|
| +0x08 | 시퀀스 번호(`FUN_710018d310`) |
| +0x18 | 대기 목록(새 파이버, std::list) |
| +0x30 | 실행 목록 |
| +0x48 | 완료(자동 삭제 아님) 목록 |
| +0x60 | 삭제 요청 목록 |
| +0x78 | 재정렬 필요 |
| +0x80 | 지금 도는 FiberImpl(`Fiber::Wait` 등이 찾는 대상, `FUN_710018e7c4`) |

FiberModule 데이터 +0x20 = 현재 시퀀스 번호다. 등록·`Wait` 대상 판정에 쓰인다. SceneModule이 장면을 갱신하기 전에 `FUN_710018e674`로 바꾸고, 파이버 실행 루프가 돌 때마다 바꾼 뒤 끝에 0으로 돌린다.

### 4.8 RandModule (생성 `FUN_7100189200`)

| 객체+오프셋 | 내용 |
|---|---|
| RandModule+0x08 | → {async 엔진*, sync 엔진*} (0x10 B) |
| 엔진+0x00 | vtable: async `0x71019d3c00`, sync `0x71019d3c50`. 분포 함수는 +0x10..+0x38 |
| 엔진+0x008 | u32 mt[624] |
| 엔진+0x9C8 | u64 index (시드 후 0) |
| 엔진+0x9D0 | u32 마지막 시드(`FUN_710018942c` = GetSyncRandSeed가 읽음) |

시드:
- 두 엔진 모두 생성 때 `nn::os::GetSystemTick()` 하위 32비트다.
- async는 다시 시드하지 않는다.
- sync는 `SetSyncRandSeed @0x7100189438`(→ `FUN_710013aa70`)로만 바뀐다(6.6, 6.7).

같은 구조의 두 번째 난수 모듈이 `*(0x7101bfc400)`에 있다(생성 `FUN_71000319c8`, actor 코드 영역이라 actor 라이브러리용으로 보임 [추정]). `OnStartUpdate`가 그 sync 엔진에 bex sync 시드를 똑같이 넣는다.

### 4.9 장면 구현체 (bex::NetworkGameScene 쪽, 0x120 B, 생성 `FUN_71001c7a00`, vtable `0x71019d6d38`)

| 오프셋 | 내용 |
|---|---|
| +0x08, +0x38 | 장면(bq::SceneBase) 포인터 |
| +0x2C | 시퀀스 번호(`GameScene::GetSequence`) |
| +0x30 | CPU 부스트 켬 |
| +0x40 | **상태** 0~10 (5.1) |
| +0x44 | 동기 중 |
| +0x50 | 동기용 일시정지 단계(4) |
| +0x54 | 장면 일시정지 단계(5) |

`bex::GameScene`의 공개 함수 Entry/Start/Update/Anytime/IsFinished/Shutdown/ShutdownProcess/IsShutdownComplete(`@0x71001ca150~0x71001ca1c0`)는 모두 `this+0x28`(구현체)의 vtable +0x10~+0x50으로 넘긴다.

### 4.10 bq::SceneBase 필드 (생성 `@0x71002c9bd4`)

| 오프셋 | 내용 | writer | reader |
|---|---|---|---|
| +0x10 | 일시정지 단계(bex::SceneBase, 기본 5) | `FUN_71001a2c70` | SceneModule, 흐름 파이버 |
| +0x38 | UpdateMain 단계 | UpdateMain | UpdateMain |
| +0x3C | OnLoaded 단계 | OnLoaded | OnLoaded |
| +0x40/+0x48/+0x50 | 흐름 파이버 핸들 {ptr, node, gen} | UpdateMain | UpdateMain, OnCleanup, SetPauseLevel |
| +0x58 | 장면 종류(아카이브 로드 분기) | OnEntry | OnLoaded |
| +0x60/+0x68/+0x70 | "SceneRoot" 엔티티 핸들 | OnEntry | OnCleanup |
| +0xC0 | 요청된 장면 전환(−1 없음, 0 Exchange, 1 Call, 2 Return, 3 Reboot) | `Request*Scene` | UpdateMain, OnMainEnd |
| +0xE1/+0xE2/+0xE3/+0xE4 | 흐름 파이버 플래그/세션 엔트리/페이드 사용/첫 Begin | 생성자 등 | |

### 4.11 핸들 (WeakHandle / HandlePtr) [판독]

- 형식은 `{T* ptr, Node* node, u32 gen}`(0x18 B)이다.
- 유효 조건은 `node != 0 && gen == (u32)(node->word0 >> 32) && ptr != 0`이다. 확인 예: `bq::SceneBase::SetPauseLevel`, `UpdateMain`, `ComMatter::GetModel` 등 전부 같은 식이다.
- 노드는 `nn::bezel::detail::RcArena` 풀에서 온다(`FUN_710018d7d0`).
- 대상이 사라지면 `node->word0 += 1<<32`(세대 +1)를 원자적으로 하고 노드를 자유 목록에 돌려준다. 그래서 남은 약한 핸들은 자동으로 무효가 된다.

## 5. 상태 전이와 수명

### 5.1 장면 구현체 상태기계 (구현체 vt+0x28 = `FUN_71001c8190`, SceneModule 0x0E에서 매 프레임) [판독]

매 호출 처음에 장면 vt+0xE0(심볼 `bq::SceneBase::Background`), 끝에 vt+0xE8(`Foreground`)을 부른다. 이름과 달리 매 프레임 호출된다. bq 기본 구현은 둘 다 빈 함수다.

| 시점·상태 | 하는 일 | 다음 |
|---|---|---|
| Entry (구현체 vt+0x10 `FUN_71001c8068`) | CPU 부스트, 시퀀스 번호 기록, **OnEntry**(vt+0xA0) | — |
| Start (vt+0x20 `FUN_71001c8108`) | **OnStart**(vt+0xA8), 아카이브 로더 시작 | 1 |
| 1 | 장면 시작 네트워크 전송 완료 대기. 온라인이면 `SetPause(+0x50)` | 2 (같은 프레임에 이어서) |
| 2, 3 | 두 번째 전송, 네트워크 대기 | 4 |
| 4 | vt+0x98(UnlockParams) 뒤 **OnBegin**(vt+0x108)이 참이 될 때까지 | 5 (다음 프레임) |
| 5 | 아카이브 로드 완료 대기 | 6 |
| 6 | **OnLoaded**(vt+0x110)가 참이면 **OnLoadComplete**(vt+0xB0) | 7 |
| 7 | **OnSetup**(vt+0x118)이 참이면 CPU 부스트 끔 | 8 |
| 8 | `FUN_71001c94cc`(동기 시드·동기 시작, 6.7)가 참이면 **OnStartUpdate**(vt+0x120) | 9 |
| 9 | 매 프레임 **UpdateMain**(vt+0xB8). 거짓이 되면 **OnMainEnd**(vt+0xC0), vt+0x98 | 10 |
| 10 | IsFinished(vt+0x38: 상태 > 9) | SceneModule이 정리로 넘긴다 |
| 정리 (SceneModule `FUN_71001a6650`) | Shutdown 1회(구현체 vt+0x40 → **OnCleanup** vt+0xC8), 매 프레임 ShutdownProcess(vt+0x48 → **OnCleanupProcessing** vt+0xD0), IsShutdownComplete(vt+0x50 → 로더 한가 + **IsCleanupComplete** vt+0xD8) | 다음 장면 생성 |

- `switch`의 `break` 뒤에 상태를 바꾸므로 4→5, 6→7, 7→8, 8→9, 9→10은 **한 프레임에 한 단계**다. 1→2→3→4는 조건이 맞으면 한 프레임에 이어서 진행한다.
- OnStartUpdate와 첫 UpdateMain은 서로 다른 프레임이다.

bq 쪽 오버라이드가 부르는 하위 가상 함수 [판독 vtable `0x71019e15c8`(SceneBase), `0x71019e2fb0`(MinigameScene), `0x71019f1e30`(RmMgSceneBase)]:

| bq::SceneBase 함수 | 부르는 가상(순서대로) | MinigameScene / RmMgSceneBase 구현 |
|---|---|---|
| OnEntry @0x71002c9f68 | 장면 루트 엔티티 생성, vt+0x190 LoadPlayerMotionArchive, 장면 종류 0이면 vt+0x140(SetSyncCond) | — |
| OnBegin @0x71002ca2f8 | (첫 1회 세이브 변환) vt+0x168 | `MinigameScene::BeginScene @0x71002df258`(동기 → 미니게임 ID → 데이터 로드, 0~3단계) |
| OnLoaded @0x71002ca37c | vt+0x198 IsLoadingArchive | — |
| OnSetup @0x71002ca4b0 | vt+0x170 → vt+0x148 | `MinigameScene::SetupScene @0x71002df440` → `RmMgSceneBase::SetupGame @0x71004415a4` |
| OnStartUpdate @0x71002ca65c | actor 난수에 시드 복사, vt+0x178 → vt+0x150, 0x40 B 파이버 생성 | `MinigameScene::SyncedSetupScene @0x71002e0270` → `RmMgSceneBase::SyncedSetupGame @0x7100443340`(→ mg1801 `RmSyncedSetupGame`, 제품 생성) |
| UpdateMain @0x71002ca780 | 흐름 파이버 → vt+0x160 | `MinigameScene::GameFlow @0x71002df24c` → vt+0x1A0 `MinigameFlow @0x71002e0500` |
| OnCleanup @0x71002caaf0 | 흐름 파이버 삭제, vt+0x158 → vt+0x180 | `RmMgSceneBase::CleanupGame @0x7100443c20` → `MinigameScene::CleanupScene @0x71002e0344` |

### 5.2 bq::SceneBase::UpdateMain (`this+0x38`) [판독 @0x71002ca780]

| 단계 | 조건 | 동작 | 반환 |
|---|---|---|---|
| 0, 1 | (전환 요청 없음) | `FiberLite::Create(람다 "bq::SceneBase", prio 0)`. 람다 vtable `0x71019e1778` +0x30이 장면 vt+0x160을 부른다. 핸들을 +0x40에 두고 파이버 일시정지 단계 = 장면 +0x10 | 참 (단계 2) |
| 2 | | 페이드 쓰면 장면 사운드 시작·`FadeIn(1.0)` | 단계 3 |
| 3 | 흐름 파이버가 살아 있는 동안 | 대기. 핸들이 무효가 되면 파이버 객체 삭제 | 단계 4 |
| 4 | 또는 단계 ≤ 3에서 전환 요청(+0xC0 ≠ −1) | 단계 5. 페이드면 SE 그룹 정지·`FadeOut(1.0)` | 참 |
| 5 | 페이드가 끝나면 | 단계 −1 | **거짓**(→ 구현체가 OnMainEnd) |

`MinigameFlow`는 단계를 다 돌면 `RequestReturnScene` 후 `Fiber::Sleep(-1)`(영원히)이다. 그래서 흐름 파이버는 스스로 끝나지 않는다. 전환 요청으로 단계 5 → OnMainEnd → OnCleanup에서 지워진다.

### 5.3 MinigameFlow [판독 @0x71002e0500, 한 걸음 `FUN_71002e0844`]

```c
FUN_71002e0548(this);                        // 초기화: 단계(+0x214)=1, vt+0x1a8(OnSetGameSequence)
while (Step()) bex::Fiber::Wait();           // 한 프레임에 한 걸음
RequestReturnScene(); bex::Fiber::Sleep(-1.0);
// Step:
vt+0x1b0 OnGameSequenceBefore; MGSound 갱신;
next = HANDLER[state](this);                 // 멤버 함수 포인터 표 0x71019e3250, 0~0x12
vt+0x1b8 OnGameSequenceAfter;
if (next != state) { state = next; subCounter(+0x218) = 0; vt+0x1a8(OnSetGameSequence); }
if (7 <= state <= 9 && 3분 타이머 만료) { vt+0x1c0 OnThreeMinTimerEnd; state = 10; … }
return state != 0x13;
```

단계 9의 처리기(`FUN_71002e1818`)가 vt+0x238 = `OnGameMain`을 부른다. 단계별 의미는 장면 문서 범위로 남긴다 [미확정].

### 5.4 파이버 수명 [판독]

```
new bex::Fiber(prio, …) ──등록 FUN_710018e68c──▶ 현재 시퀀스 대기 목록
   │  (FiberModule 이 그 시퀀스를 처리할 때)
   ▼
StartUpdate → InitializeFiber → 실행 목록 끝에 붙임 → 우선순위 안정 정렬 → 이번 프레임에 첫 재개
   │  Update() 본문을 Wait/Sleep/WaitWhile/WaitUntil 까지 실행
   ▼
매 프레임: 정지(+0xD5)·완료 아니면 재개 조건(6.5) 검사 → 맞으면 SwitchToFiber
   │
   ├ Update 반환(완료) 또는 ~Fiber(정지) → 실행 목록에서 뺌
   │      autoDestroy 면 소유 객체 삭제, 아니면 완료 목록
   └ Fiber::Exit → 예외로 빠져나와 끝
```

- 같은 프레임의 FiberModule 처리 **전에** 만든 파이버는 그 프레임에 바로 돈다. SceneModule의 장면 갱신·Setup이 여기에 해당한다.
- 파이버 실행 **중에** 만든 파이버는 다음 프레임부터 돈다.

### 5.5 일시정지 단계 [판독]

- `MainModule::SetPause(L)`가 비트 L을 켠다. vt+0x68이 매 프레임 이 비트를 CoreSystem에 옮긴다.
- 현재 단계 P는 켜진 가장 높은 비트 번호다(`FUN_7100984de8`). 없으면 −1이다.
- 대상 단계 L의 정지 판정은 `FUN_71001968a4` → `FUN_71009850ac`이다. 식은 `P != -1 && max(L,0) <= P`이다.
  - 파이버: 단계 ≤ P면 이번 프레임을 건너뛴다(대기·Sleep도 줄지 않는다).
  - 장면: 장면 +0x10 ≤ P면 Update를 건너뛴다. Anytime은 `paused=true`로 불린다.
- P ≥ 16이면 MainModule 프레임 시작이 DeltaTime·FrameCount를 갱신하지 않는다.
- 파이버 기본 단계는 0이고 장면 기본 단계는 5다. 그래서 단계 0~4 정지는 게임 파이버만 멈추고 장면 상태기계는 돈다.

## 6. 계산식·의사코드

### 6.1 프레임 스텝 `FUN_7100987af8` (다음 프레임용, `FUN_7100983e48`이 부른다) [판독, 디스어셈블리 확인]

```c
out.ns8 = out.ns16 = 0;
if (mode == 0) {                                    // 고정
  fps   = 60 / (n + 1);                             // 정수 나눗셈
  out.ns8 = out.ns16 = 1000000000 / fps;
  out.isFixed = 1;
  out.delta = scale * ((float)(n + 1) / 60.0f);      // 모두 f32 (scvtf, fdiv s, fmul s)
} else {                                            // 가변 (mode 1)
  ns = (measured == 0) ? (s64)(1e9 / (double)maxfps)
                       : min((s64)(1e9 / (double)minfps), measured);   // 최대 0.05 s (minfps 20)
  out.isFixed = 0;
  out.ns8  = flag28 ? (s64)(1e9 / maxfps) : 0;
  out.ns16 = (flag28 && maxfps < fps) ? out.ns8 : (s64)(1e9 / fps);
  out.delta = scale * (float)((double)ns * 1e-9);   // double 곱 → f32 → f32 곱
}
```

재구현 계산(scale 1, n 0):

| 모드 | 입력 | delta (f32) |
|---|---|---|
| 고정 | — | 0.016666668 (`0x3C888889`) = f32(1/60) |
| 가변 | 16,666,667 ns | `0x3C888889` |
| 가변 | 16,666,666 ns | `0x3C888888` |
| 가변 | 17,500,000 ns | `0x3C8F5C29` |
| 가변 | 80,000,000 ns | `0x3D4CCCCD` (0.05로 잘림) |

measured(CS+0x58)는 `FUN_7100983e48`에서 `ConvertToTimeSpan(GetSystemTick)`의 차이(ns)다. 즉 직전 프레임 끝에서 이번 프레임 끝까지의 실측 간격이다. 그러므로 가변 모드의 DeltaTime은 **한 프레임 늦은 실측값**이다.

### 6.2 FixUpdate 서브스텝 횟수 [판독 `FUN_7100983e48`·`FUN_7100984460`, 재구현 계산]

```c
n   = substepEnabled ? (int)((delta - acc) / subDelta) : 1;   // f32 뺄셈·나눗셈, fcvtzs(0 쪽 절삭)
// 프레임 처리에서:
a = acc; repeat n: { Run(0x0F); a += subDelta; }  acc = a - delta;
```

- 고정 60(delta = subDelta = `0x3C888889`)은 매 프레임 n = 1이고 acc = 0을 유지한다 [재구현 계산 5프레임].
- 가변에서 정확히 16,666,666 ns가 나오면 delta가 subDelta보다 1ulp 작아 n = 0이 되고, 다음 프레임에 n = 2가 된다 [재구현 계산]. 게임 코드는 0x0F에서 돌지 않으므로 이 흔들림은 물리·컴포넌트 고정 갱신에만 영향을 준다 [추정].

### 6.3 MainModule 프레임 시작 `FUN_710019581c` (vt+0x60) [판독]

```c
if (CoreSystem.pauseLevel < 16) {
  ns = ConvertToTimeSpan(now - t.lastTick); t.lastTick = now;
  t.frameCount += 1; *g_FrameCountMirror(0x7101a85cc8) = t.frameCount;
  t.deltaTime  = g_FrameStep.delta;           // ← GetDeltaTime
  t.realDelta  = (float)ns / 1e9;
  if (타이머 핸들 유효) {
    t.timeScale = timer.scale;                // 0x7100987ac0
    t.unscaledDelta = t.deltaTime * (1.0f / t.timeScale);
    if (t.timeScale != t.requestedScale) { timer.scale = t.requestedScale (0x7100987ac8); t.timeScale = t.requestedScale; }
  } else { t.timeScale = 1.0; t.unscaledDelta = t.deltaTime; }
}
```

- timeScale 변경은 **다음** 프레임 스텝 계산부터 delta에 들어간다.
- `GetDeltaRate` = delta / (1/목표fps) 이다(고정 60에서 1.0).

### 6.4 파이버 한 프레임 (시퀀스마다 `FUN_710018f400`) [판독]

```c
// FUN_710018e5f0: for (i = 0; i < seqCount; i++) { cur = i; RunSequence(seq[i]); } cur = 0;
RunSequence(s):
  SceneModule 현재 시퀀스 지정, EntityModule 갱신 범위 지정(FUN_71008a30c0)
  for f in s.pending (등록 순):  f.StartUpdate(); InitializeFiber(f); s.active.push_back(f); s.dirty = 1;
  s.pending.clear();
  if (s.dirty) { s.dirty = 0; stable_merge_sort(s.active, by f.priority ascending); }   // FUN_710018f740
  for f in s.active (앞에서부터):
    if (IsPaused(f.pauseLevel)) continue;
    s.current = f; Resume(f);                   // FUN_710018dbb0 (6.5)
    if (f.stopped || f.completed) {
      s.active.erase(f);
      if (!f.autoDestroy) s.finished.push_back(f); else delete f.owner;
    }
    s.current = null;
  s.flushDestroyRequests();                     // FUN_710018ee70
```

`Resume`가 돌리는 동안 새로 만든 파이버는 `s.pending`에 들어간다. 그 파이버는 다음 프레임에 처리된다.

### 6.5 대기 함수 [판독 `FUN_710018ddb0`, `FUN_710018de1c`, `FUN_710018dbb0`, `FUN_710018df14`, `FUN_710018e070`]

```c
Wait(n=1):  c = (n > 0) ? n + 1 : n;  waitCount = c;
            if (c < 0 || (c != 0 && (waitCount = c - 1) != 0)) yield;      // Wait(0)은 즉시 반환
Sleep(s):   step = g_FrameStep.delta;  t = s + (s > 0 ? step : -0.0f);  sleepTimer = t;
            if (t >= 0) { if (t <= 0) return; t -= step; sleepTimer = t;
                          if (t <= 1.1920929e-05f) { sleepTimer = 0; return; } }
            yield;                                                          // s < 0 이면 영원히
WaitWhile(fn): cond = fn; whileMode = 1; if (fn()) yield; else 즉시 반환
WaitUntil(fn): cond = fn; whileMode = 0; if (!fn()) yield; else 즉시 반환

Resume(f):    // 매 프레임
  if (f.stopped || f.completed) return;
  c = f.waitCount;  if (c < 0) return;
  if (c != 0) { f.waitCount = c - 1; if (c - 1 != 0) return; }
  if (f.sleepTimer < 0) return;
  if (f.sleepTimer > 0) { f.sleepTimer -= g_FrameStep.delta; if (f.sleepTimer > 1.1920929e-05f) return; f.sleepTimer = 0; }
  if (f.cond) { if (f.cond() == f.whileMode) return; f.cond = null; }
  SwitchToFiber(f); f.started = 1;
```

| 호출 | 재개 시점 |
|---|---|
| `Wait()` = `Wait(1)` | **다음 프레임**, 같은 자리(우선순위·등록 순)에서 |
| `Wait(n)` | n 프레임 뒤 |
| `Wait(0)` | 기다리지 않음 |
| `Sleep(k/60)` (고정 60) | k 프레임 뒤 (남은 시간 ≤ 1.19e-5에서 깸) [재구현 계산 아님, 식 판독] |
| `Sleep(0)` | 기다리지 않음 |
| `Sleep(<0)` | 영원히 |
| `WaitWhile(fn)` | fn()이 거짓이 되는 첫 프레임(매 프레임 재개 직전에 검사) |

### 6.6 난수 알고리즘 [판독, 디스어셈블리 `core_b3.c` 1~578행]

엔진은 **MT19937**이다(`0x6C078965` 시드 확장, `0x9908B0DF`, 템퍼링 `0x9D2C5680/0xEFC60000`, 11/7/15/18). 한 번에 한 칸씩 갱신하는 libc++ 방식이지만 출력열은 표준 MT19937과 같다.

| 함수 | 비동기(async) | 동기(sync) |
|---|---|---|
| `Rand()` | u = MT 출력 | u = MT 출력 |
| `RandMod(n)` / `SyncRandMod(n)` | n < 2 → 0(**소비 없음**). 아니면 libc++ `uniform_int_distribution(0, n−1)`: 비트 수 w = n이 2의 거듭제곱이면 log2 n, 아니면 bit_length(n). `u & (2^w−1)`이 n 미만이 될 때까지 다시 뽑음 | n < 2 → 0(소비 없음). 아니면 **(u × n) >> 32** (한 번) |
| `RandRange(a,b)` | lo = min, hi = max(부호 없는 비교). hi − lo < 2 → lo(소비 없음). 아니면 uniform_int(lo, hi−1) → **[lo, hi)** | 같은 조건, lo + ((u × (hi−lo)) >> 32) |
| `RandF()` | f32(u) × 2⁻³² + 0 | f32(u) × 2⁻³² |
| `RandModF(x)` | x ≤ 0 → 0(소비 없음). 아니면 **fmadd(x, f32(u)·2⁻³², 0)**(곱을 한 번만 반올림) | x ≤ 0 → 0. 아니면 f32(f32(u) × x) × 2⁻³² |
| `RandRangeF(a,b)` | d = f32(max − min). **fmadd(d, f32(u)·2⁻³², min)**(한 번 반올림) | d = f32(max − min). f32(min + f32(f32(d × f32(u)) × 2⁻³²)) |

- f32(u)는 `ucvtf`(가까운 짝수)다. 그래서 u ≥ `0xFFFFFF80`이면 RandF/SyncRandF가 **1.0**을 낸다(`[0,1]` 닫힌 구간) [재구현 계산 `edge`].
- 모든 분포가 MT 출력 하나를 쓴다. 예외는 async `uniform_int`의 기각 재추첨과 위의 "소비 없음" 경우다.
- 웹에서 fmadd를 그대로 옮기려면 곱(48비트)과 합을 정확히 계산한 뒤 한 번만 f32로 반올림해야 한다. `Math.fround(a*b + c)`는 이중 반올림 위험이 있다. 구현 예는 `tools/core_rand.py` `f32_round_exact`다.

### 6.7 시드를 넣는 곳 [판독]

| 시점 | 함수 | 시드 |
|---|---|---|
| 부팅(RandModule 생성) | `FUN_7100189200` | async·sync 모두 `GetSystemTick()` |
| **장면마다** 상태 8 | `FUN_71001c94cc` | 오프라인: `SetSyncRandSeed(async.Rand())`. 온라인: 네트워크가 정한 값(`FUN_710013c894`). 호출처는 이 함수 두 곳뿐이다(`refs:7100189438`) |
| 바로 다음 OnStartUpdate | `bq::SceneBase::OnStartUpdate` | actor 난수 모듈 sync에 `GetSyncRandSeed()`(같은 시드) |

NRO 중 `SetSyncRandSeed`를 부르는 곳은 없다 [데이터: 139개 함수 목록의 import].

오프라인에서 한 판의 동기 난수열은 이렇게 정해진다.
- 부팅 시각 → async 상태 → 장면 시작 순간의 async 소비량이 시드를 정한다.
- 그래서 원본에서 재현할 수 없다. 웹은 시드를 입력으로 받는다(9.3).

## 7. 다른 표현 계층과의 연결

| 대상 | 코어 쪽 연결 |
|---|---|
| 애니메이션·이펙트·사운드 | 각 모듈의 타이밍 처리기(0x10~0x19, 0x1B)에서 돈다. 게임 파이버(0x0E)가 이번 프레임에 정한 상태를 같은 프레임 뒤 타이밍에서 반영한다 [판독: 타이밍 순서]. 세부는 [03_graphics.md](03_graphics.md), [04_sound.md](04_sound.md), [08_effects.md](08_effects.md), [09_character.md](09_character.md) 범위다. 각 처리기가 붙는 타이밍 번호는 이 문서 3.3 표에 있다 [미확정: 모듈 이름] |
| 사운드 박자 | 리듬 장면의 박자 변수는 사운드 엔진 값이다. 그래서 GetDeltaTime(고정 1/60)과 별개 시계다(mg1801.md 8절, [02_rhythm.md](02_rhythm.md)) |
| 일시정지 메뉴 | 5.5. UI는 더 높은 일시정지 단계에서 돈다 [추정] |

## 8. 다른 기능과의 상호작용

| 상황 | 동작 | 근거 |
|---|---|---|
| 리듬 미니게임(mg1801~1810) | 장면 생성 때 Fixed60 강제, 소멸 때 복원 | 4.4 [판독] |
| 온라인 동기 | 동기 동안 Fixed. 동기 난수 시드도 네트워크에서 받는다 | 4.4, 6.7 [판독] |
| 처리 지연(오프라인 일반 미니게임) | 가변: delta = 실측(≤0.05 s), 게임 타이머가 실제 시간을 따라간다. 고정: delta는 그대로 1/60이고 게임이 느려진다 | 6.1 [판독] |
| timeScale | ca 쪽 `FUN_7100415a58` 등 4곳이 `FUN_7100196630`으로 바꾼다. 미니게임 NRO에서는 import 없음 | [판독], 쓰임새 [미확정] |
| 프레임 길이 측정 | GetFrameCount는 루프 1회당 +1(P<16). 미니게임 NRO 3개만 쓴다 | [데이터] |
| 같은 프레임 순서 | 장면 갱신(Setup·OnStartUpdate·UpdateMain) → 파이버(우선순위·등록 순) | 3.4 [판독] |

## 9. 웹 포팅 명세

원본 클래스 구조를 웹 core 계층에 둔다. 코어는 DOM·three.js가 없다(DESIGN 3절).

### 9.1 모듈과 책임

| 웹 파일 | 원본 | 책임 |
|---|---|---|
| `core/clock.ts` | `bex::MainModule` 시간 구조체 + CoreSystem 프레임 스텝 | 프레임 모드(고정/가변), delta·frameCount·timeScale, 서브스텝 누적 |
| `core/sched.ts` | `bex::Fiber` / `FiberImpl` / `FiberModule` 시퀀스 | 대기·실행 목록, 우선순위 안정 정렬, Wait/Sleep/WaitWhile/WaitUntil, 일시정지 단계, 자동 삭제 |
| `core/rng.ts` | `bex::RandModule` | MT19937 두 개, 비동기·동기 분포 |
| `core/scene.ts` (신규 권장) | 장면 구현체 상태기계 + `bq::SceneBase`/`MinigameScene` 훅 | 5.1·5.2의 단계, 흐름 파이버 생성 |
| `core/frame.ts` (신규 권장) | `FUN_7100984460`의 타이밍 | 한 step = MainModule 프레임 시작 → 장면 → 파이버 → 고정 갱신 → 후처리 |

### 9.2 clock.ts 수정안

현재 상수 `FRAME_DT = F(1/60)`는 **리듬 장면과 온라인에서 원본과 비트 단위로 같다** [판독]. 바꿀 점은 이렇다.
- 근거 주석의 [추정]을 [판독]으로 바꾼다.
- 가변 모드와 서브스텝을 시험용으로 둔다.

```ts
// 원본: main FUN_7100987af8 / FUN_710019581c / FUN_7100983e48
export const FPS = 60;
export const FRAME_DT = F(F(1) / F(60));          // 0x3C888889 (고정 모드 delta, scale 1)
export const SUB_DT = F(1 / F(60));                // g_SubDeltaSec
export type FrameMode = 'fixed' | 'variable';

export class Clock {
  mode: FrameMode = 'fixed';      // 리듬·온라인 = fixed. 일반 오프라인 미니게임 원본은 variable(9.6)
  timeScale = F(1);               // MainModule+0x44
  requestedScale = F(1);          // +0x48
  deltaTime = F(0);               // +0x08  GetDeltaTime
  frameCount = 0;                 // +0x1C  GetFrameCount
  private nextDelta = FRAME_DT;   // g_FrameStep.delta (다음 프레임용)
  private acc = F(0); substeps = 1;

  /** MainModule vt+0x60 — step() 맨 처음 */
  beginFrame(pauseLevel = -1): void {
    if (pauseLevel >= 16) return;
    this.frameCount = (this.frameCount + 1) | 0;
    this.deltaTime = this.nextDelta;
    if (this.timeScale !== this.requestedScale) this.timeScale = this.requestedScale;  // 다음 스텝부터 반영
  }
  /** FUN_7100983e48 — step() 맨 끝. measuredNs 는 가변 모드 시험 때만 */
  endFrame(measuredNs = 0): void {
    const d = this.mode === 'fixed'
      ? F(this.timeScale * F(F(1) / F(60)))
      : F(this.timeScale * F(Math.min(measuredNs || Math.trunc(1e9 / 60), Math.trunc(1e9 / 20)) * 1e-9));
    this.nextDelta = d;
    this.substeps = Math.trunc(F(F(d - this.acc) / SUB_DT));
    let a = this.acc; for (let i = 0; i < this.substeps; i++) a = F(a + SUB_DT);
    this.acc = F(a - d);   // (실제로는 0x0F 처리 뒤에 갱신 — 고정 갱신이 없으면 결과 같음)
  }
}
```

- 가변 식의 `measuredNs == 0` 분기는 원본 그대로다.
- 웹 루프(`main.ts`의 60Hz 누적기)는 그대로 둔다. 로직 step 한 번 = 원본 한 프레임이다.

### 9.3 rng.ts 수정안 (계약 → 구현)

```ts
// 원본: main @0x710013a9d0(MT 시드) @0x710013aae0(한 칸 생성) 외 6.6 표
class MT19937 { mt = new Uint32Array(624); i = 0; seedValue = 0; calls = 0;
  seed(s: number) { s >>>= 0; this.mt[0] = s; for (let k = 1; k < 624; k++) {
      const p = this.mt[k-1] ^ (this.mt[k-1] >>> 30);
      this.mt[k] = (Math.imul(0x6c078965, p) + k) >>> 0; } this.i = 0; this.seedValue = s; }
  next(): number { const mt = this.mt, i = this.i, j = (i + 1) % 624, k = (i + 397) % 624;
      const y = (mt[i] & 0x80000000) | (mt[j] & 0x7ffffffe);
      const v = (mt[k] ^ (y >>> 1) ^ ((mt[j] & 1) ? 0x9908b0df : 0)) >>> 0;
      mt[i] = v; this.i = j; this.calls++;
      let z = v ^ (v >>> 11); z ^= (z << 7) & 0x9d2c5680; z ^= (z << 15) & 0xefc60000; z ^= z >>> 18; return z >>> 0; } }

const mulHi = (u: number, n: number) => Number((BigInt(u) * BigInt(n)) >> 32n);   // (u*n)>>32 (또는 상·하 16비트 분할)
const ucvtf = (u: number) => Math.fround(u);                                        // u32 → f32 (가까운 짝수)

export class RandModule {
  readonly async = new MT19937(); readonly sync = new MT19937();
  constructor(bootSeed: number) { this.async.seed(bootSeed); this.sync.seed(bootSeed); }  // 원본은 둘 다 SystemTick
  setSyncRandSeed(s: number) { this.sync.seed(s); }
  getSyncRandSeed() { return this.sync.seedValue; }
  // 비동기
  rand() { return this.async.next(); }
  randMod(n: number) { n >>>= 0; return n < 2 ? 0 : uniformInt(this.async, 0, n - 1); }
  randRange(a: number, b: number) { a >>>= 0; b >>>= 0; const lo = Math.min(a, b), hi = Math.max(a, b);
      return hi - lo < 2 ? lo : uniformInt(this.async, lo, hi - 1); }
  randF() { return Math.fround(ucvtf(this.async.next()) * 2 ** -32); }
  randModF(x: number) { x = Math.fround(x); if (!(x > 0)) return 0; return fmaF32(x, ucvtf(this.async.next()) * 2 ** -32, 0); }
  randRangeF(a: number, b: number) { a = F(a); b = F(b); const mx = a > b ? a : b, mn = a > b ? b : a;
      return fmaF32(F(mx - mn), ucvtf(this.async.next()) * 2 ** -32, mn); }
  // 동기
  syncRand() { return this.sync.next(); }
  syncRandMod(n: number) { n >>>= 0; return n < 2 ? 0 : mulHi(this.sync.next(), n); }
  syncRandRange(a: number, b: number) { a >>>= 0; b >>>= 0; const lo = Math.min(a, b), d = Math.max(a, b) - lo;
      return d < 2 ? lo : (lo + mulHi(this.sync.next(), d)) >>> 0; }
  syncRandF() { return Math.fround(ucvtf(this.sync.next()) * 2 ** -32); }
  syncRandModF(x: number) { x = F(x); if (!(x > 0)) return 0; return F(F(ucvtf(this.sync.next()) * x) * 2 ** -32); }
  syncRandRangeF(a: number, b: number) { a = F(a); b = F(b); const mn = a > b ? b : a, mx = a > b ? a : b;
      const s0 = F(F(mx - mn) * ucvtf(this.sync.next())); return F(mn + F(s0 * 2 ** -32)); }
}
// uniformInt: libc++ uniform_int_distribution + independent_bits_engine (main @0x710013b400)
function uniformInt(e: MT19937, a: number, b: number): number {
  if (((b - a) >>> 0) === 0) return b;
  const r = (b - a + 1) >>> 0; if (r === 0) return e.next();
  const w = 32 - Math.clz32(r) - ((r & (r - 1)) === 0 ? 1 : 0);
  const mask = w >= 32 ? 0xffffffff : (2 ** w - 1);
  for (;;) { const u = (e.next() & mask) >>> 0; if (u < r) return (a + u) >>> 0; }
}
// fmaF32(a,b,c): a·b+c 를 정확히(유리수/BigInt) 계산해 f32 로 한 번 반올림. tools/core_rand.py f32_round_exact 와 같은 결과여야 한다.
```

시드 운용:

| 원본 | 웹 |
|---|---|
| 부팅 시 `GetSystemTick` | `GameSetup.seed`로 async·sync를 시드한다 |
| 장면 상태 8 오프라인: `SetSyncRandSeed(async.Rand())` | 장면 드라이버가 상태 8에 해당하는 시점에 같은 호출을 한다. 소비 순서 유지 |
| 골든 대조 | sync 시드를 직접 주입하는 옵션(`setup.syncSeed?`)을 둔다 |

`calls`(소비 횟수)는 엔진별로 센다. 대조 도구가 동기 난수 소비 횟수를 프레임마다 기록하게 한다.

### 9.4 sched.ts 수정안

현재 구현의 차이와 고칠 점:
- 우선순위가 없다.
- 일시정지 단계가 없다.
- `Wait(n)`·`Sleep`·`WaitWhile/Until`이 없다.
- 실행 중 생성만 다음 프레임으로 미루고, **실행 전에 만든 파이버도 다음 프레임으로 미루지는 않는다**. 이것은 원본과 같다. 다만 "대기 목록"이 없어서 정렬 시점이 다르다.

```ts
// 원본: main FUN_710018f400(시퀀스 처리) FUN_710018dbb0(재개) FUN_710018ddb0(Wait) FUN_710018de1c(Sleep)
export const WAKE_EPS = F(1.1920929e-05);
export type Co = Generator<WaitReq | void, void, unknown>;   // yield 값으로 대기 종류를 넘긴다
export type WaitReq = { wait: number } | { sleep: number } | { while: () => boolean } | { until: () => boolean };

export class Fiber {
  priority: number; pauseLevel = 0; autoDestroy = false; tag: string;
  waitCount = 0; sleepTimer = F(0); cond: (() => boolean) | null = null; whileMode = false;
  stopped = false; completed = false; started = false;
}
export class Sequence {                 // FiberModule 시퀀스 하나 (장면 시퀀스마다)
  pending: Fiber[] = []; active: Fiber[] = []; dirty = false; current: Fiber | null = null;
}
export class Scheduler {
  seqs: Sequence[]; cur = 0;            // FiberModule+0x28 → +0x20 현재 시퀀스
  spawn(co, { priority = 0, tag = '', pauseLevel = 0 } = {}): Fiber { /* this.seqs[this.cur].pending.push(f) */ }
  runFrame(clock: Clock, pauseLevelNow: number): void {
    for (let i = 0; i < this.seqs.length; i++) { this.cur = i; this.runSeq(this.seqs[i], clock, pauseLevelNow); }
    this.cur = 0;
  }
  private runSeq(s: Sequence, clock: Clock, P: number) {
    if (s.pending.length) { for (const f of s.pending) s.active.push(f); s.pending.length = 0; s.dirty = true; }
    if (s.dirty) { s.dirty = false; stableSortBy(s.active, (f) => f.priority); }   // Array.prototype.sort 는 안정 정렬
    for (let k = 0; k < s.active.length; ) {
      const f = s.active[k];
      if (P !== -1 && Math.max(f.pauseLevel, 0) <= P) { k++; continue; }
      s.current = f; this.resume(f, clock); s.current = null;
      if (f.stopped || f.completed) s.active.splice(k, 1); else k++;
    }
  }
  private resume(f: Fiber, clock: Clock) {
    if (f.stopped || f.completed) return;
    const c = f.waitCount; if (c < 0) return;
    if (c !== 0) { f.waitCount = c - 1; if (c - 1 !== 0) return; }
    if (f.sleepTimer < 0) return;
    if (f.sleepTimer > 0) { f.sleepTimer = F(f.sleepTimer - clock.deltaTime); if (f.sleepTimer > WAKE_EPS) return; f.sleepTimer = F(0); }
    if (f.cond) { if (f.cond() === f.whileMode) return; f.cond = null; }
    // 다음 대기 요청까지 실행. 즉시 반환하는 요청(Wait(0), Sleep(0), 이미 만족한 WaitWhile 등)은 같은 resume 안에서 계속 돈다
    for (;;) { const r = f.co.next(); if (r.done) { f.completed = true; return; } if (this.arm(f, r.value, clock)) return; }
  }
  /** 대기 요청을 걸고, 실제로 멈춰야 하면 true (6.5 식 그대로) */
  private arm(f: Fiber, req: WaitReq | void, clock: Clock): boolean { /* Wait/Sleep/While/Until */ }
}
```

- 게임 코드는 `yield` = `bex::Fiber::Wait()`(=`{wait:1}`)로 쓴다. `yield { sleep: s }` = `Sleep(s)`다.
- 파이버 하나의 첫 실행은 등록 후 첫 `runFrame`에서 대기 요청까지다. mg1801 `ObjectManImpl::Update`처럼 **첫 실행에 바로 일을 하고 나서 Wait하는 본문**은 원본 루프 모양을 그대로 옮긴다.

### 9.5 한 step 순서 (core/frame.ts 권장)

```ts
step(pads) {
  clock.beginFrame(pause.level);              // MainModule vt+0x60
  input.latch(pads);                          // 입력 샘플 시점은 입력 문서 범위 [미확정]
  // 타이밍 0x0D: (게임 로직 없음)
  scenes.update();                            // 0x0E SceneModule: 구현체 상태기계, 시퀀스 = 장면 시퀀스
  sched.runFrame(clock, pause.level);         // 0x0E FiberModule
  for (i < clock.substeps) fixedUpdate(SUB_DT);   // 0x0F (웹 미니게임 로직에서는 보통 비어 있음)
  scenes.anytime(pause.level);                // 0x12
  collectStateAndEvents();                    // 0x10~0x1B 표현 계층 대응 → state/events
  clock.endFrame();                           // 다음 프레임 delta·서브스텝
}
```

### 9.6 웹 환경 때문에 바꾸는 부분과 동등성

| 원본 | 웹 | 동등성 |
|---|---|---|
| 일반 미니게임 오프라인 = 가변 delta(실측) | 기본은 고정 `FRAME_DT` | 원본도 60fps가 유지되면 delta는 실측 16.67 ms 근처다. 그러나 비트까지 같지는 않다(16,666,666 ns → `0x3C888888`). 일반 미니게임 골든은 **원본 실측 delta 열을 입력으로 받아** `clock.mode='variable'`로 재생해야 비트 일치를 기대할 수 있다 |
| 리듬·온라인 = 고정 | 고정 | 비트 일치 [판독] |
| nn::os 파이버(스택 전환) | 제너레이터 | 대기 의미·순서·첫 실행 시점을 6.4·6.5대로 맞춘다 |
| 시스템 틱 시드 | `GameSetup.seed` | 6.7의 소비 순서를 지킨다 |

### 9.7 엔티티·컴포넌트 모델 옮기기

원본 구조는 다음과 같다 [판독].

- **Entity**: `nn::bezel::EntityModule::CreateEntity(name, …)`가 핸들(4.11)을 돌려준다. 장면은 OnEntry에서 "SceneRoot"를 만든다.
- **AddComponent<T>(args)** (예: `@0x7100289310`):
  - 경로는 `bex::ComponentUtil::SafeCreate<T>(HandlePtr<Entity>, args)` → `_internalCheckComponentValidity` → `AddComponentImpl`이다.
  - 결과로 `WeakHandle<T>`를 돌려준다. 실패하면 생성한 컴포넌트의 세대를 올리고 지운다.
- **컴포넌트 목록**은 `Entity+0x38..+0x40`, 0x20 B 항목이다. 내용은 +8 Component*, +0x10 핸들 노드, +0x18 TypeDesc*다.
- **GetComponent<T>** (예: `@0x71001c1270`): 목록에서 TypeDesc가 T 또는 공통 TypeDesc(`0x7101a832b8`)인 첫 항목을 찾는다. 그 항목을 TypeDesc vtable(+8 IsDerivedFrom, +0x20 CastTo)로 캐스팅한다.
- **bq::ComMatter** (생성 `@0x71002af8b4` → `FUN_71002af940`): 캐릭터·물체 묶음 컴포넌트다.
  - MatterType 0·3은 ComModel이 이미 있어야 한다. 1은 ComCamera를, 2는 actor::ComActor를 더한다.
  - 플래그에 따라 actor::ComActorMotion·FxTrigger를 더한다.
  - `GetModel/GetMotion/GetActor`는 같은 엔티티 목록에서 핸들로 꺼낸다.
- **ComActorMotion**(`Play @0x710002dd98`, `SetSpeed`, `SetFrame`), **bex::ComHeading**(`@0x71001bf2a8~`: 머리 추적 대상·가중치·각도 제한): 표현용 컴포넌트다. 갱신 타이밍은 0x0E 뒤 모듈 처리기다 [추정]. 동작 세부는 [09_character.md](09_character.md)를 따른다.

웹 권장 구조:

| 원본 | 웹 | 이유 |
|---|---|---|
| Entity + 컴포넌트 목록 | 로직 객체가 필요한 필드만 가진다(예: Obj의 `pos`, `rot`, 모션 요청). three.js 객체는 view가 만든다 | DESIGN 4절(로직 → 화면 단방향) |
| WeakHandle {ptr,node,gen} | `Handle<T> { obj: T | null; gen: number }` + 객체의 `gen`. 해제 때 `gen++` | 지운 객체 참조를 원본처럼 "무효"로 만든다 |
| ComActorMotion.Play/SetFrame/SetSpeed | state의 `motion {name, frame, speed}` 요청. view가 재생 | 모션 프레임을 로직이 정하면 골든 대조가 된다 |
| ComMatter.SetBoneVisible 등 | state의 뼈 표시 목록 | |
| ComHeading | state의 `headTarget` | |

### 9.8 원본 이름 ↔ 웹 권장 이름

| 원본 | 웹 권장 |
|---|---|
| `MainModule+0x28 +0x08` / `+0x1C` / `+0x44` / `+0x48` | `clock.deltaTime` / `clock.frameCount` / `clock.timeScale` / `clock.requestedScale` |
| `g_FrameStep.delta` | `clock.nextDelta` |
| `g_SubDeltaSec`, CS+0x1684, CS+0x1688 | `SUB_DT`, `clock.acc`, `clock.substeps` |
| 타이머 +0x10 | `clock.mode` |
| CS+0x1678 | `pause.level` |
| FiberImpl +0x7C / +0x74 / +0x94 / +0x90 / +0xD3 / +0xD5 / +0xE0 | `priority` / `pauseLevel` / `waitCount` / `sleepTimer` / `whileMode` / `stopped` / `autoDestroy` |
| FiberModule 시퀀스 +0x18 / +0x30 / +0x80 | `pending` / `active` / `current` |
| RandModule async / sync 엔진 | `rng.async` / `rng.sync` |
| 장면 구현체 +0x40 | `scene.implState` |
| bq::SceneBase +0x38 / +0xC0 / +0x10 | `scene.mainStep` / `scene.request` / `scene.pauseLevel` |

## 10. 검증

| 종류 | 내용 | 결과 |
|---|---|---|
| 원본 명령 판독 | 위 주소 전부(덤프 `analysis/decomp/core_b*.c`) | 이 문서 |
| 디스어셈블리 확인 | GetDeltaTime(`ldr s0,[x8,#8]`), 프레임 스텝 f32 연산(`scvtf s0`, `fdiv s0,s0,s1(60.0)`, `fmul`), nnMain `str w8(=1),[x0,#0x18]`, 난수 분포 전부, mg1801 `SyncRandMod`·`RandMod` 인자(`mov w1,w21`/`w26` = 남은 개수) | 6절과 일치 |
| 재구현 계산 | `tools/core_rand.py`: MT19937을 numpy `MT19937._legacy_seeding`(init_genrand) 출력과 시드 5개 × 1,000개 비교 | **전부 일치**. MT19937(5489) 첫 출력 3499211612(표준값) |
| 재구현 계산 | 분포 벡터(시드 0, 1, 5489, 0x12345678, 0xFFFFFFFF) → `analysis/core_rand_vectors.json` | 아래 표 |
| 재구현 계산 | 프레임 스텝·서브스텝(6.1·6.2 표) | f32(1/60) = `0x3C888889`, 고정 n=1·acc=0 유지 |
| 원본 실행 | 없음 | — |

시험 벡터 발췌(재구현 계산, 원본 실행 아님):

| 시드 | MT 첫 5개 | SyncRandMod(7) ×5 | RandMod(7) ×5 (MT 소비) | SyncRandF 첫 값 |
|---|---|---|---|---|
| 0 | 2357136044, 2546248239, 3071714933, 3626093760, 2588848963 | 3,4,5,5,4 | 4,5,0,3,3 (6) | `0x3F0C7F0B` |
| 1 | 1791095845, 4282876139, 3093770124, 4005303368, 491263 | 2,6,5,6,0 | 5,3,4,0,1 (6) | `0x3ED583E8` |
| 5489 | 3499211612, 581869302, 3890346734, 3586334585, 545404204 | 5,0,6,5,0 | 4,6,6,1,4 (5) | `0x3F5091BB` |

- mg1801 `Obj::Entry` 당근(자르기 4) 한 번의 동기 소비는 9회다(SyncRandF 5 + SyncRandMod 4).
- 시드 0에서 splashDelay = [0.025, 0, 0.075, 0.05, 0.1] s다(`mg1801_entry_carrot_cuts4`).

검증하지 않은 범위:
- 원본 실행 결과와 대조하지 않았다. 원본에서 GetDeltaTime 값을 직접 읽은 적도 없다.
- 0x0E의 다른 모듈 처리기 순서와 0x0F 처리기 내용은 확인하지 않았다.
- `uniform_int`는 libc++ 소스 형태와 디컴파일을 대조해 옮겼다. libc++ 바이너리로 돌려 비교하지는 않았다.
- 웹 코드는 바꾸지 않았다. 9절은 명세다.

## 11. 미확정 사항과 필요한 근거

| 항목 | 영향 | 필요한 근거 |
|---|---|---|
| 타이밍 번호 이름(0x0D, 0x10~0x1B)과 각 모듈 정체 | 표현 계층 갱신 위치 | 등록 함수(3.3 표)의 g_Module 심볼 대조 |
| 0x0E의 다른 처리기들과 장면·파이버의 상대 순서 | 장면 외 모듈이 게임 파이버보다 앞서 도는지 | `a58` 호출 전체 그래프 재구성(토큰 주소 → 모듈) |
| OnStartUpdate가 만드는 0x40 B 파이버(`FUN_71002d16fc`)의 일 | 흐름 파이버 앞에서 도는 다른 일 | 그 클래스 vtable +0x20 판독 |
| 가변 모드 실측 간격의 측정 지점(present/vsync와의 관계) | 일반 미니게임 delta 열 | 타이밍 0x1B·페이싱(CS+0x16c0) 판독, 또는 원본 실행 기록 |
| `Background/Foreground`가 매 프레임 불리는 이유(심볼 이름 불일치) | 없음(bq 구현 비어 있음) | bex 쪽 다른 장면 클래스 판독 |
| MinigameFlow 단계 0~0x12 의미 | 장면 흐름 | 처리기 표 `0x71019e3250` 판독(장면 문서 범위) |
| 입력 샘플링 타이밍 | 휘두름 판정 프레임 | InputModule 처리기 타이밍 |
| actor 난수 모듈(`*0x7101bfc400`) 정체와 쓰는 곳 | 모션 랜덤 프레임 등 | `FUN_7100031b68` 등 호출자 판독 |
