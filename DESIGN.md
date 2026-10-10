# 설계

2026-10-02. 미니게임천국 웹 mp4_new의 `DESIGN.md`를 이 프로젝트에 맞게 옮긴 규칙이다. 원본이 GameCube(PPC, HSF)에서 Switch(AArch64, Bezel 엔진)로 바뀐 부분만 다르다.

## 1. 목표

원본의 관측 가능한 동작을 재현한다. 원본보다 자연스럽거나 현대적인 구현은 목표가 아니다. 원본의 특이한 계산·예외도 확인 없이 정리하지 않는다.

## 2. 원본과 근거

- 원본: `c:/dev/original/`(읽기 전용). 추출물은 `../extracted/`, 디컴파일은 `../analysis/decomp/<모듈>.c`, 함수 목록은 `../analysis/functions/<모듈>.tsv`.
- 미니게임은 `romfs/nro/NX_Release/mg####.nro` 하나가 한 게임이다. 공용 프레임워크는 main(`bq::`, `bex::`, `ca::`, `nn::bezel::`)에 있다.
- 코드 주석의 근거 표기: `[판독: mg1801 Obj::Update @0x7100008a64]`. 주소는 모듈 이름과 함께 적는다(모듈마다 같은 베이스 0x7100000000을 쓴다).
- 확정 수준은 상위 README의 다섯 단계를 쓴다: [실행] [판독] [데이터] [추정] [미확정].

## 3. 결정성과 수치

- 로직은 60Hz 고정 스텝이다. `step()` 한 번 = 원본 한 프레임이다(`boot.nbinit` FixedFrameRate_Fps60).
- 원본 게임 코드는 `bex::MainModule::GetDeltaTime()`(초)을 쓴다. 웹은 `core/clock.ts`의 `FRAME_DT`를 쓴다.
  - 리듬 장면(mg1801~mg1810)과 온라인에서는 원본도 고정 f32(1/60)이다 [판독].
  - 그 밖의 오프라인 미니게임은 원본이 실측 프레임 시간(최대 0.05 s)을 쓴다. 그런 게임은 고정 1/60으로 근사한다고 게임 문서에 적는다(docs/engine/01_core.md).
- 원본이 float로 저장하는 값은 저장할 때마다 `F()`(Math.fround)로 자른다. 원본의 `(int)(f * 60.0)` 같은 변환은 식 그대로 옮긴다(`toInt`).
- 난수는 원본 `bex::RandModule`(MT19937 두 개: 비동기·동기) 식과 소비 순서를 따른다(`core/rng.ts`, 재구현 `web/tools/analysis/core_rand.py`와 벡터 일치). 동기 난수는 장면 시작 때 `setSyncRandSeed(rand())`로 다시 시드한다.
- 한 프레임 순서: 제품 파이버(등록 순, 같은 우선순위) → 장면 흐름 파이버. 새로 만든 파이버는 다음 프레임부터 돈다(docs/engine/01_core.md).
- 로직에는 DOM, three.js, `Date`, `performance`가 없다. 노드(tsx)에서 그대로 돈다.

## 4. 로직 → 화면 단방향

- 로직은 `state`(매 프레임 갱신)와 `events`(이번 프레임의 소리·이펙트·진동)를 내놓는다. 화면은 읽기만 한다.
- 화면에 필요한 값(모델 표시·위치·회전·모션 프레임·뼈 표시)도 로직이 계산해 state에 넣는다. 그래야 골든과 대조할 수 있다.
- 사건 이름은 원본 라벨을 그대로 쓴다(`SQ_SE_MG1801_JUST`, `mg1801_water_entry00`). 공용 유니온은 `core/events.ts`.

## 5. 게임 계약

`script/game.ts`. 페이지는 `GameDef`로만 게임을 다룬다.

- `createLogic(setup)` → `GameLogic { step(pads), state, events, done, result }`
- `createView(ctx, assets)` → `GameView { load, onStep, render, status, debug, dispose }`
- `describeResult(result, setup)` → 결과 표

게임 폴더 `script/games/<id>/`:

| 파일 | 내용 |
|---|---|
| `index.ts` | GameDef |
| `state.ts` | 로직 → 화면 계약(단위·좌표계·이름을 머리 주석에) |
| `logic/` | 원본 클래스마다 한 파일(`Scene`, `ObjectMan`, `Obj`, `PlayerMan`, `Player` …). 필드는 의미 있는 이름으로 짓고 원본 오프셋을 주석에 남긴다(`/** Obj+0x174 */ elapsed = 0;`) |
| `logic/data.ts` | 원본에서 뽑은 상수표(손으로 고치지 않는다, 만든 도구 이름을 머리에) |
| `view/` | three.js 엔티티, 사건 → 소리 |

## 6. 검증

- `npm run check`: 같은 설정 두 번 → 프레임마다 같은지(결정성).
- 원본 골든: `tools/golden.ts` 형식(jsonl.gz, f32 비트 보존). 원본 실행 기록이 없으면 재구현 계산·합성 시험으로 대신하고, 문서에 어느 쪽인지 적는다.
- 게임별 `tools/verify_<id>.ts`: 골든과 프레임마다 비트 비교, 첫 불일치에서 멈춘다.
- `npm run smoke`: 브라우저에서 페이지와 게임이 오류 없이 끝나는지.
- 함수 단위 시험 통과를 전체 동작 검증으로 넓혀 말하지 않는다.

## 7. 에셋

- 원본 그림은 원본 그대로 쓴다. 근사(셰이더·조명·그림자)는 게임 문서의 "근사" 절에 적는다.
- 게임마다 `assets/<id>/manifest.json`이 입구다(형식은 `assets/README.md`). 모델은 glb(FRES → BfresLibrary 변환), 텍스처는 png(BNTX → DDS → png), 소리는 ogg/wav(vgmstream).

## 8. 화면

- 기준 해상도 1920×1080(16:9). WebGL 캔버스 위에 HUD 2D 캔버스를 겹친다.
- 원본 셰이더(BNSH)는 쓸 수 없으므로 재질은 근사한다.

## 9. 빌드

- esbuild. 개발은 `tools/serve.ts`(watch + serve), 배포는 `tools/build.ts`. 페이지 엔트리는 `tools/esbuild_config.ts`의 `ENTRIES`.
- 큰 중간 산출물은 `c:/dev/mpj/extracted/` 아래에 두고 web/에는 변환 결과만 둔다.

## 10. 폴더 구조·import 규칙 (2026-10-09 사용자 결정)

### 10.1 최상위 두 층

```
script/
  game/        엔진 무관 핵심 (잠금) — 다른 프로젝트(ddalkkakrider 포털 등)로 폴더째 가져간다
    core/        결정적 계산: 시계·난수·패드·f32·스케줄러
    lib/<이름>   공용 코어(import 0) + lib/<이름>-<엔진> 어댑터(three·dom·webaudio·gamepad·localstorage)
  app/         mpj 제품 — 원본 모듈을 옮긴 화면·모드·미니게임
    main.ts      조립만(Composition Root)                              [나중]
    flow/        게임 흐름 — host.ts(한 판 호스트: 화면·렌더러·오디오 시계·start/step/draw)·index.ts(createGameFlow: 플레이어 설정~프리 플레이 흐름 함수). 게임만, 개발 코드 없음.
                 [나중] 흐름 표·등록표(화면 ID → 모듈, 다음 화면, 미니게임 ID → 게임)
    common/      앱 공용 서비스(원본 bq 계열: 렌더·소리·입력·에셋·저장·공용 UI)   [나중]
      net/         통신(2026-10-10): protocol/(wire·types — 클라이언트·서버 공용 규약, 서버는 여기만 import) + socketio.ts(방 서비스 클라이언트). 공용 통신 코어 game/lib/net 은 두 번째 사용처(온라인 미니게임 동기)가 생길 때 뽑는다
    scene/       원본 NRO 중 화면·모드 — 같은 높이, 2단(분류/단위) 고정
      menu/        setplayer · charselect · modeselect · partyrule · online      (menu01 등)
      world/       plaza(menu00) · mgmet(항구)
      mode/        freeplay(mgm01) · [board(bd01) · bowser(kb01) · athlon(ca01) · rhythmcooking(rc_stage01) …]
      system/      [op · ed · matching00 · gyroPadChange …]
                   mginst(게임 설명 화면, 2026-10-10): 미니게임 실행은 연결하지 않고 데이터·준비 입력·빌린 preview texture 포트만 둔다.
                   controllerstandby(2026-10-10): 컨트롤러 설정 대기 모달 표시·OK 상태 주입만 제공. 게임 흐름·기기 등록·통신 미연결 — docs/shell/controller_standby.md.
    minigame/    미니게임 전부
      frame/       한 판 틀(mgscene) · 결과(mgresult) · 장면 로더(mgstage)        (원본 main bq::MinigameScene·MGResult)
      kit/         계열 공통: rhythm · [athlon · kb · patapata …]                (원본 main ca::rm·ca::coin_athlon·ca::kb·sb)
      mg####/      게임 하나 = 폴더 하나, 평평하게. mps 게임은 mps_ 접두어
  dev/         개발 하네스(main.ts·flow.ts, 주소 /dev)·시험 페이지(ui_main.ts + dev/ui.html, 주소 /dev/ui), dev/game = 시험용 가짜 게임(mgdummy, 등록표에 없음). 별칭 `@dev`, app 은 dev 를 부르지 않는다
               dev/net/fake.ts = 가짜 방 서비스(FakeOnline). 광장은 ctx.online 으로 주입받고(app 은 dev 를 모름), dev/flow.ts 가 ?online=fake|off 일 때 넣는다
  main.ts      배포용 진입점(index.html) — 게임만
```
`[ ]` = 아직 없는 자리. 규칙상 위치가 정해져 있다.

**진입점 (2026-10-09 사용자 결정)**

| 주소 | 페이지 · 진입 스크립트 | 하는 일 |
|---|---|---|
| `/` | 루트 `index.html` + `script/main.ts` (번들 `main`) | 배포용. 게임만 돈다. 개발 옵션·설정 패널·URL 옵션·시험 훅이 없다. 열자마자 실제 흐름을 처음(플레이어 설정)부터 돈다(시작 화면 없음). 소리 잠금은 첫 사용자 입력(포인터·키·터치) 때 공용 오디오 resume. 흐름이 끝나면(설정 취소·광장 나감) 흐름 처음으로. 서비스 워커·에셋 모드·흐름 미리 받기·전환 설치는 그대로 |
| `/dev` | `dev/index.html` + `script/dev/main.ts`·`script/dev/flow.ts` (번들 `dev`) | 개발 하네스. 게임 고르기·seed·com·게임별 옵션·debug·fast·synclog·avlat·mute·auto·charselect=1·plaza=1·skipsetup(chars·names) 등 기존 URL 옵션 전부, 시험 훅 `window.__mpj`·`__flow`·`__plaza`·`__charselect` |
| `/dev/ui` | `dev/ui.html` + `script/dev/ui_main.ts` (번들 `ui`) | 화면 단독 시험 페이지 |

- **app = 게임만.** `app/flow` 는 게임에 필요한 개념만 가진 공개 API 를 낸다. app 안에 "dev 면 이렇게" 분기·인자·이름이 없다.
  - 한 판 호스트 `createGameHost(mount)`(host.ts): `start(def, setup, {play, endless, save, leaveWipe})`·`step()`(한 스텝)·`prime()`/`due()`/`resync()`(스텝 시계)·`draw()`·`stop()`·`dispose()`, 읽기 전용 상태 `stage`·`frame`·`seed`·`result`·`error`·`dropped`·`def`·`setup`·`run`·`logic`·`view`·`audio`, 사건 `listen`(stage·view·step), 게임 설정 `muted`·`fixedSeed`(빈 문자열 = 무작위)·`audioClock`(오디오 시계 따름, 기본 켬)·`latency`(출력 지연 보정, 기본 자동 `{compensate: true, extraMs: 0}`). `runGameLoop(host)` = 배포 루프(rAF 마다 prime → due 만큼 step → draw).
  - 게임 흐름 `createGameFlow(host, screens = flowScreens)`(index.ts): `start(사람/COM)`(플레이어 설정부터)·`enterPlaza({com, chars, names})`(플레이어가 정해진 채 광장부터)·`listen`(screen·plaza·end{reason})·읽기 전용 `screen`·`plaza`·`plazaLoad`·`entry`. `flowScreens` = 화면 실행 함수 표(setplayer·plaza·modeselect·mgmet·mgm01). `prepareFlow()` = 흐름 미리 받기·광장 GL 준비.
  - 흐름은 플레이어 설정 → 광장 → 기구 → 모드 메뉴 → 항구 → 프리 플레이 → 미니게임 → 복귀. 배포 main 과 하네스가 같은 흐름 코드를 쓴다(중복 없음).
- **dev = app 공개 API 를 조합한 개발 흐름**(`script/dev/flow.ts`). dev 는 app 을 import 해도 되지만 app 은 dev 를 모르고, dev 가 있든 없든 배포 동작은 같다.
  - fast = dev 루프가 rAF 당 `host.step()` N 번(+ `host.audioClock = false`), hold = dev 루프가 멈춤, synclog = dev 가 `host.listen` step 사건·`host.heardTime()`·리듬 소리 구독 `setRhythmSoundTrace` 로 기록, avlat = `host.latency`, 시험 훅 = dev 가 `window.__mpj`(호스트·흐름 읽기 상태 getter)·`__flow`·`__plaza`·`__charselect` 를 건다, 단일 게임 시작 = dev 가 `host.start` 직접, skipsetup = dev 가 chars·names 를 만들어 `flow.enterPlaza`, 광장 URL 옵션·항구 시험값 = dev 가 `flowScreens` 를 감싸 화면 인자(`params`·`test`)를 더한 표를 넘김, 패널(상태 줄·결과·시작 버튼·자유 카메라) = dev 가 `listen` 사건과 읽기 상태로.
- `app/flow`·`script/main.ts` 는 URL 을 읽거나 바꾸지 않는다(`location`·`history`·`URLSearchParams` 없음). 화면 전환은 같은 문서 안의 장면 교체뿐이고 주소는 그대로다.
- `app/flow`·`script/main.ts` 는 WebGL 렌더러를 새로 만들지 않는다 — 게임 화면 렌더러는 호스트가 앱 수명 동안 하나(`new Renderer` 한 곳), 광장은 `view/plazaGl` 앱 수명 렌더러.
- 경계 시험 `tools/test_entry.ts`(정적 검사): app·배포 main → dev import 0. app/** 전체·배포 main 에 개발 식별자 `DEV_ALL` = `__mpj`·`__flow`·`__plaza`·`__charselect`·`synclog`·`syncLog`·`skipsetup`·`skipSetup`·`mgmetTest`·`mgmetTestValues`·`avlat`·`onStatus`·`onBusy` 없음. app/flow·배포 main 에는 `DEV_FLOW` = `DEV_ALL` + `fast`·`logSync`·`MgmetTestValues`·`test`·`debug`·`freeCam`·`setFreeCamera`·`held`·`hold`·`Hook`·`prefs`·`savePrefs`·`params`·`URLSearchParams`·`location`·`history`·`pushState`·`replaceState` 와 `window.__*` 없음(주석 제외). `new Renderer` 1곳·`WebGLRenderer` 0. 배포 main 은 시작 화면 없이 최상위에서 `flow.start`. dev 에 흐름 함수·스텝 시계·한 판 조립을 따로 두지 않음.

### 10.2 원본 모듈 → 폴더 대응

| 원본 | 폴더 |
|---|---|
| nn::bezel·bex(엔진 모듈) | `game/core`·`game/lib` |
| bq 공용(UI·메시지·저장·보상·사운드 그룹) | `app/common` |
| bq::MinigameScene·MGResult | `app/minigame/frame` |
| ca::rm·ca::coin_athlon·ca::kb·sb::PataPata·wl | `app/minigame/kit/<계열>` |
| NRO 화면·모드(menu00·menu01·mgmet·mgm01~06·bd01·kb01·ca01·pp01·rc_stage01·op·ed·matching00 …) | `app/scene/<분류>/<단위>` |
| NRO 미니게임 mg####(112) | `app/minigame/mg####` |

### 10.3 추가할 때의 규칙

1. **원본 모듈 하나 = 폴더 하나.** 깊이는 늘리지 않는다. 새 종류가 기존 분류에 안 맞으면 분류를 하나 더한다(예: `scene/system`).
2. **공통은 원본이 둔 층에 둔다**(10.2). 두 곳 이상이 쓰면 올리고, 한 곳만 쓰면 그 폴더 안에 둔다.
3. **게임은 모드·계열 아래에 넣지 않는다.** 원본에서 게임은 여러 모드(프리 플레이·보드·리듬 쿠킹)에 나오고, 계열 공통을 둘 이상 쓰기도 한다(mg1804·mg1809 = ca::rm + coin_athlon). 게임은 필요한 kit 를 import 한다.
4. **서로 import 하지 않고 ID 로 요청한다.** 화면 → 다음 화면, 모드 → 미니게임은 장면 매니저에 ID 로 요청하고(10.5), 매니저가 `app/flow` 등록표에서 모듈을 찾는다(원본 CallMinigameScene(ID) → 이름표·MGList 와 같은 꼴). 그래서 추가는 "폴더 하나 + 등록 한 줄"이고 기존 파일을 고치지 않는다.
5. **의존 방향**: `app/minigame/mg####` → `app/minigame/kit` → `app/minigame/frame` → `app/common` → `game/`. `app/scene/*` → `app/common`·`app/minigame/frame` → `game/`. `game/` 은 아무것도 부르지 않는다. 분류끼리·단위끼리 직접 import 금지(경계 시험).

### 10.4 import

- `game/` 밖에서 core·lib 는 별칭 `@game/core/…`·`@game/lib/…`, `app/` 의 다른 폴더는 별칭 `@app/…` 만 쓴다(`tsconfig.json` `paths` 한 곳 — esbuild·tsx 가 같이 읽는다). 폴더를 옮기면 별칭 한 줄과 해당 import 만 고친다.
- 같은 단위 폴더 안은 상대 경로. `game/lib` 어댑터 → 자기 코어도 상대 경로(`../sound`) — 폴더째 가져갈 때 별칭 없이 돈다.

### 10.5 장면 계약·전환·Work (원본 방식, 2026-10-09 사용자 결정)

화면 사이 흐름은 원본처럼 **요청 API + Work 객체**로 한다. 화면이 결과값 `{next, args}` 를 돌려주는 방식은 쓰지 않는다(원본에 없는 모양이라 Work 필드 대조가 안 되고, Call/Return 의 "돌아오기"가 어색하다).

**1. 장면 수명 계약** — 모든 화면·모드는 원본 `bq::SceneBase` 수명을 같은 이름으로 가진다.

| 원본 [판독] | 웹 장면 계약 |
|---|---|
| `SceneBase` ctor `@0x71002c9bd4`·`OnEntry @0x71002c9f68` | `onEntry()` — 자원 등록·Work 읽기 |
| `BeginScene @0x71002df258` → `SetupScene @0x71002df440` | `setup()` |
| `SyncedSetupScene @0x71002e0270` | `syncedSetup()` (온라인 동기 뒤, 로컬은 바로) |
| 로드 완료(`OnLoadComplete`) | `onLoadComplete()` |
| 갱신(파이버) | `update()` — 화면 안 진행(대화·선택·연출)은 지금처럼 화면 코드(파이버·상태기계)가 맡는다 |
| `CleanupScene @0x71002e0344`·`OnCleanupProcessing` | `cleanup()` |

미니게임 장면은 여기에 `bq::MinigameScene` 흐름 훅(0~19단계, `MgGame`)을 더한 것이다(`app/minigame/frame`).

**2. 전환 = 장면 매니저에 요청** — 화면은 실행 중 아무 때나 요청하고, 실제 전환은 매니저가 프레임 경계에서 한다.

| 원본 [판독] | 웹 요청 API |
|---|---|
| `CallMinigameScene @0x71003601ac` | `scenes.call('minigame')` — 부른 장면은 스택에 남는다(push) |
| `CallMinigameModeScene @0x710036027c` | `scenes.call('<모드 ID>')` |
| `RequestReturnScene` | `scenes.return()` — 부른 장면으로 돌아간다(pop), 돌아간 장면은 `onReturn()` |
| 장면 바꾸기(같은 높이 이동) | `scenes.change('<ID>')` |

ID → 모듈은 `app/flow` 등록표가 정한다(원본 장면 이름표 `@0x71015d840c`).

**3. 데이터 = Work 객체** — 화면 사이 데이터는 인자로 넘기지 않고 원본과 같은 영역의 Work 에 쓰고 읽는다. 필드는 원본 오프셋과 1:1 로 이름을 붙여 대조한다.

| 원본 Work | 웹 | 예 |
|---|---|---|
| `PlayerWork` | `work.player` | 참가자·캐릭터·사람/COM·COM 강도·패드 |
| `GameWork` | `work.game` | 부를 미니게임 ID·설정, 결과(SetMinigameResult 결과 링) |
| `MinigameModeWork` | `work.mode` | 규칙 캐시(+0x764), 항구 복귀 지점(+0x4bc), 라운드·결과 100칸 |
| 영구 저장(SaveData) | 공용 저장 `appSave()` | Work 가 아니라 16_save.md 섹션 — Work 는 세션 상태만 |

- **쓰기 권한**: 각 화면 계약에 읽는 Work·쓰는 Work 를 적는다. Work 가 아무나 쓰는 전역 상태가 되지 않게, 쓰기는 그 영역의 주인(원본에서 쓰는 모듈)만 한다. 경계 시험으로 고정한다.
- **미니게임 한 판은 닫힌 상자**: 미니게임 로직은 Work 를 직접 읽거나 쓰지 않는다. 틀(`app/minigame/frame`)이 시작 때 Work 에서 setup 을 만들어 넘기고, 끝날 때 결과를 Work 에 기록한다(SetMinigameResult 계약). 결정성 규칙(`docs/shell/minigame_scene.md` §12.12.6)은 그대로다.

**한 판의 흐름**: 모드(예: freeplay)가 `work.game` 에 ID·설정을 쓰고 `scenes.call('minigame')` → 매니저가 `app/minigame/frame` 을 연다 → 틀이 등록표에서 `mg####` 를 받아 0~19단계를 돈다 → 결과를 `work.game` 결과 링에 쓴다 → `scenes.return()` → 모드의 `onReturn()` 이 결과를 읽는다(원본 Call/Return).

**2026-10-10 원본 수명 확인:** 위 표의 “부른 장면은 스택에 남는다”는 이름·설정·파라미터의 논리 이력이다. 원본의 일반 Call/Return은 부모 실행 객체를 종료·파괴하고, 복귀 때 factory 생성과 Entry를 다시 수행한다. 프리플레이는 새 장면이 Work를 읽어 ContinueFlow로 복원한다. `onReturn()`은 웹 알림 계약이며 원본 SceneBase에 같은 이름의 훅이 확인된 것은 아니다. 직접 C·현재 웹 차이·잔여는 [18_scene_work §11.9](docs/engine/18_scene_work.md#scene-return-lifetime)에 기록했다.

**웹 권고(미구현):** 논리 Scene은 재생성하고 renderer·다운로드/파싱 캐시·명시적 공유 자원은 별도 소유한다. 복귀의 필수 복원은 일반 진입 경로에서 Work를 읽어 수행하고, `onReturn()`에 결과 commit/Round 증가를 중복하지 않는다. 기존 onReturn 설계·현재 CPU 레이아웃 보관은 웹 어댑터와 최적화로 구분한다. 준비된 view의 prepare/take/activate 구조는 유지하고 게임 로직 수명과 분리한다. 세부 권고와 후속 검증 조건은 위 §11.9.3~§11.9.4이며, 이번 문서 반영을 전체 lifecycle 이전 완료로 세지 않는다.

[구현 후속 2026-10-10] 위 권고를 공용 `game/lib/scene`·`app/flow/scenes`·`app/common/work`와 첫 소비자 프리플레이↔미니게임에 적용했다. ID 이력으로 부모 논리를 재생성하고 일반 진입에서 Work를 읽으며, 필수 `onReturn`은 없다. 실제 한 판의 정상 종료 tick에서 frame 포트가 Round/결과 ring을 한 번 기록하고 무인자 return한다. `work.game.result`는 mode의 동일 ring을 읽는 view이며 새 ring을 만들지 않는다. 기존 renderer·MenuSurface·준비 자원 재사용은 유지하고 취소된 이전 scope의 완료/명령을 차단한다. 다른 메뉴/광장/보드 전체 이전은 후속이다. 상세 파일·검증·웹 어댑터 경계는 [18_scene_work §14](docs/engine/18_scene_work.md#14-웹-구현-기록-2026-10-10)에 기록했다.

### 10.6 흐름 추적

등록표·요청 방식은 "정의로 이동"으로 다음 화면을 따라가기 어렵다. 그래서 세 곳에서 읽히게 한다.

1. **`app/flow` 등록표 한 파일** — 장면 ID·모듈·부를 수 있는 장면(call/change 대상)·미니게임 등록이 모두 여기 있다. 화면·게임 모듈을 import 하는 유일한 곳이라 표에서 IDE 정의 이동이 된다(ID 는 문자열 유니언 타입, 요청 API 인자도 같은 타입).
2. **장면 계약**: 각 화면 계약에 요청할 수 있는 ID 와 읽기·쓰기 Work 가 적혀 있다.
3. **실행 기록**: 매니저가 요청·전환마다 `[flow] plaza → mgmet → freeplay → call minigame(mg1801) → return freeplay` 를 남기고, 개발 모드에서는 Work 변경도 기록한다(개발 콘솔·`window.__mpj.flow`). 등록표에서 문서용 흐름도를 만드는 도구를 둔다.

### 10.7 지금 상태와 남은 이동

- 됨: `game/core`·`game/lib`(별칭 `@game`), `app/scene/{menu,world}`, `script/dev`, 공용 폴더 2개 — 옛 `shell/mgmcommon` → `app/common/ui`, 옛 `shell/stage3d` → `app/common/render3d`(별칭 `@app/common`), 미니게임 — 옛 `scene/minigame/{mgscene,mgresult,mgstage}` → `app/minigame/frame/{scene,result,stage}`, 옛 `mgm01` → `app/scene/mode/freeplay`, 옛 `games/rhythm` → `app/minigame/kit/rhythm`, 옛 `games/mg1801` → `app/minigame/mg1801`, 옛 `games/mgdummy` → `dev/game/mgdummy`(시험용), 옛 `games/index.ts` → `app/minigame/index.ts`(게임 등록표, 별칭 `@app/minigame`).
- 됨(2026-10-09 진입점 분리): 루트 `index.html` + `script/main.ts` = 배포용(게임만, 바로 시작), `dev/index.html` + `script/dev/main.ts`(패널·URL 옵션) + `script/dev/flow.ts`(개발 흐름) = 하네스, 옛 `script/main.ts` 의 화면·스텝 시계·한 판 실행 → `app/flow/host.ts`, 흐름 함수(`flowPlaza`·`plazaFlow`·`flowModeSelect`·`flowMgmet`·`flowMgm01`·`playFromList`·`endFlow`) → `app/flow/index.ts`(별칭 `@app/flow`), 루프의 fast·hold·synclog·상태·디버그 줄과 시험 훅 → `dev/flow.ts`. 흐름 동작은 그대로다. 화면 쪽 선택 인자: `plaza_page` `params?`(없으면 빈 값)·`mgmet_page` `test?`(없으면 하네스 기본값과 같은 `MGMET_DEFAULT_VALUES`)·`view/plazaGl` `installPlazaGl(params = 빈 값)`. 리듬 소리의 `globalThis.__mpj.sync.audio` 읽기 → 구독 함수 `setRhythmSoundTrace`.
- 남은 진입점 규칙 위반(배포 흐름이 부르는 모듈, 큰 구조 변경이라 이번에 안 고침):
  - URL 읽기: `env.ts`(`?assets`)·`view/assetMode.ts`(`?texlod`)·`view/appFlow.ts`(`?prefetch`)·`view/hud.ts`(`?debug`)·`setplayer_page.ts`·`modeselect_page.ts`·`mgmet_page.ts` `runMgmet`(`?bg`)·`mgm01_page.ts` `runMgm01List`(`?bg`·`save`·`fav`·`boss`·`connected`)·`app/minigame/kit/rhythm/view/ui.ts`(`?rcwipe`), `plaza_page.ts`(`location.href` 로 에셋 URL 풀기). 배포 주소에는 쿼리가 없어 모두 기본값으로 돈다. 고치려면 각 화면 cfg 에 `params` 를 받게 바꾼다.
  - 화면마다 새 WebGL 문맥: 플레이어 설정(`app/scene/menu/setplayer` → `app/common/ui` `MgmView`)·캐릭터 선택(`app/scene/menu/charselect/screen.ts`)·모드 메뉴(`app/scene/menu/modeselect/screen.ts`)·항구(`MgmView`)·프리 플레이 목록(`MgmView`)이 들어올 때마다 `new THREE.WebGLRenderer`. 앱 수명 하나는 게임 화면(`app/flow` `Renderer`)·광장(`view/plazaGl`)·결과 무대(게임 렌더러 공유)·Lyt(공유 정적)뿐. 통합은 plazaGl 처럼 앱 수명 렌더러 + 캔버스 넘기기로 바꾸는 큰 구조 변경이다.
- app 안에 남은 개발용 코드(흐름 밖 모듈, 이번에 안 고침 — 경계 시험 DEV_ALL 에는 안 걸린다): 광장 `app/scene/world/plaza`(`ctx.params`: `online=fake|off`·`server`·`rooms`·`stamp`·`first`·`mute`·`decoNpc`·`loader`·`nowarm` 와 `debug()` 시험 훅 부품), 리듬 `kit/rhythm/view/ui.ts`(`?rcwipe=1` 리듬 쿠킹 와이프 미리보기, URL 직접 읽기), 게임 화면 `GameView.setFreeCamera`·`debug`·`status`(mg1801 view, 하네스 패널용). 옮기려면 광장 시험 인자를 dev 가 넘기는 화면 인자로, rcwipe 를 게임 설정(리듬 쿠킹 모드)으로 바꾼다.
- 사용자 확인 필요(진입점):
  - 배포 흐름이 끝나면(플레이어 설정 취소·광장 나감) 흐름 처음(플레이어 설정)으로 돌아가게 했다. 원본 근거를 찾지 않았다 — 원본은 타이틀 → 광장 진입 때 플레이어 설정이 나오므로 그쪽에 가깝게 골랐다. 광장 실패(에셋 오류)는 되풀이를 막으려고 메시지만 남긴다.
  - 소리 잠금 해제 입력은 포인터·키·터치다. 게임패드 버튼은 브라우저가 사용자 활성으로 치지 않아 패드만 쓰면 첫 키/터치 전까지 소리가 안 날 수 있다.
  - 출력 지연 보정은 기본 자동(`host.latency`)이다. 공용 저장 시스템 섹션으로 옮길지는 정하지 않았다.
#### 남은 단계 (순서대로, 1~4 는 이동·정리 = 동작 불변, 5~7 은 구조 변경)

1. ~~공용 폴더 2개~~ (됨) · 3. ~~미니게임 묶기~~ (됨) · 진입점 분리 (됨)
2. **`view/` 해체** — 26개 파일을 성격별로: `app/common/{assets,render,audio,input,character,effect,save,transition}`, 흐름 관련(`appFlow`·`flow`·`flowCatalog`·`flowTable`) → `app/flow`. 분류표를 먼저 정한다.
4. **루트·페이지 파일 정리 + app 안 개발용 코드 제거**
   - 페이지 파일(`charselect_page`·`mgm01_page`·`mgmet_page`·`modeselect_page`·`plaza_page`·`setplayer_page`) → 각 화면 폴더(`app/scene/<분류>/<화면>/page.ts`). 안의 시험값·URL 시험 옵션은 dev 로.
   - `mgrun.ts`·`game.ts`(게임 계약) → `app/minigame/frame`, `env.ts` → `app/common`.
   - **URL 직접 읽기 제거**(위 "남은 진입점 규칙 위반" 목록 전부): `env.ts`·`view/assetMode.ts`·`view/appFlow.ts`·`view/hud.ts`·`setplayer_page`·`modeselect_page`·`mgmet_page`·`mgm01_page`·`kit/rhythm/view/ui.ts`(`?rcwipe`)·`plaza_page`(`location.href`). 화면은 cfg 인자로 받고, 값은 dev 가 넘긴다(배포는 기본값).
   - **app 안 개발용 코드 → dev**(위 "app 안에 남은 개발용 코드" 목록 전부): 광장 `ctx.params` 시험 옵션·`debug()` 부품, 리듬 `?rcwipe`(→ 리듬 쿠킹 모드 게임 설정), 게임 화면 계약의 `setFreeCamera`·`debug`·`status`(→ dev 가 게임 view 를 감싸는 쪽으로).
   - 끝나면 경계 시험 `tools/test_entry.ts` 의 `DEV_ALL`·`DEV_FLOW` 검사 범위를 `app/**` 전체로 넓혀 다시 안 생기게 고정한다.
5. **화면끼리 직접 import 끊기** — 광장 → 캐릭터 선택 미리보기, 결과 무대 → 광장 시선 등을 `app/common/character` 로 올린다(결과 불변 골든).
6. **렌더러 하나로 통합** — 위 "화면마다 새 WebGL 문맥" 목록(플레이어 설정·캐릭터 선택·모드 메뉴·항구·프리 플레이 목록)을 앱 수명 three.js 렌더러 하나(`view/plazaGl` 방식 확장, `ScenePreparer`)에 그리게 바꾼다. 주소·문서 그대로, 화면만 바뀌는 배포 원칙(10.1)의 마지막 조각.
7. **장면 계약·요청 API·Work(10.5)** — 아래 상태 참고.
[설계] 렌더러 하나로 통합하기 위한 원본/웹 분석: [render_unify.md](docs/engine/render_unify.md).

[구현 후속 2026-10-10] 위 화면별 renderer 서술은 이전 상태다. 제품 광장·게임 호스트·메뉴·Lyt는 `app/common/render`의 앱 renderer/canvas 공유로 이전했다. 메뉴는 suspend/resume과 장면별 RT를 소유하고 Lyt는 호출자의 renderer로 HUD를 합성한다. 완료·검증은 [render_unify §16](docs/engine/render_unify.md#16-메뉴lyt-공유-렌더러-이전-2026-10-10)을 따른다. 게임 선택 시 사전 로딩과 활성 메뉴/GPU 준비의 프레임 예산 분배는 별도 미완료다.

[구현 후속 2026-10-10 — 선택 게임/광장 준비] 이전 미완료 기록의 후속이다. `GameView`의 선택적 `prepare(progress, gpu)`와 `activate()`로 자원 준비/게임 활성화를 구분한다. 호스트가 준비 시 보유한 ViewContext에 실제 setup/audio/pads를 주입한 뒤 활성화한다. `GameDef.assetKeys`·`preparationKey`가 소비자 요구와 재사용 키를 제공하며 게임 호스트의 `prepare`·`cancelPreparation`이 선택 수명을 연결한다. RenderService의 `prepareQueue`는 표시 lease와 구분되는 프레임 단위 권한이고 메뉴 `activeFrame` 뒤 GPU 작업을 직렬 실행한다. 제품 초기 메뉴에서 광장 준비를 유지하여 입장에 world를 인계한다. 상세 계약·구현 범위·Node 검증은 [render_unify §18](docs/engine/render_unify.md#18-선택-게임-실제-에셋메뉴-중-gpu-준비-구현-2026-10-10)을 따른다.
