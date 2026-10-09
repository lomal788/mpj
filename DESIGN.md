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
    flow/        흐름 표·등록표(화면 ID → 모듈, 다음 화면, 미니게임 ID → 게임)  [나중]
    common/      앱 공용 서비스(원본 bq 계열: 렌더·소리·입력·에셋·저장·공용 UI)   [나중]
    scene/       원본 NRO 중 화면·모드 — 같은 높이, 2단(분류/단위) 고정
      menu/        setplayer · charselect · modeselect · partyrule · online      (menu01 등)
      world/       plaza(menu00) · mgmet(항구)
      mode/        freeplay(mgm01) · [board(bd01) · bowser(kb01) · athlon(ca01) · rhythmcooking(rc_stage01) …]
      system/      [op · ed · matching00 · gyroPadChange …]
    minigame/    미니게임 전부
      frame/       한 판 틀(mgscene) · 결과(mgresult) · 장면 로더(mgstage)        (원본 main bq::MinigameScene·MGResult)
      kit/         계열 공통: rhythm · [athlon · kb · patapata …]                (원본 main ca::rm·ca::coin_athlon·ca::kb·sb)
      mg####/      게임 하나 = 폴더 하나, 평평하게. mps 게임은 mps_ 접두어
  dev/         시험 페이지(script/dev + dev/ui.html, 주소 /dev/ui)
```
`[ ]` = 아직 없는 자리. 규칙상 위치가 정해져 있다.

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

### 10.6 흐름 추적

등록표·요청 방식은 "정의로 이동"으로 다음 화면을 따라가기 어렵다. 그래서 세 곳에서 읽히게 한다.

1. **`app/flow` 등록표 한 파일** — 장면 ID·모듈·부를 수 있는 장면(call/change 대상)·미니게임 등록이 모두 여기 있다. 화면·게임 모듈을 import 하는 유일한 곳이라 표에서 IDE 정의 이동이 된다(ID 는 문자열 유니언 타입, 요청 API 인자도 같은 타입).
2. **장면 계약**: 각 화면 계약에 요청할 수 있는 ID 와 읽기·쓰기 Work 가 적혀 있다.
3. **실행 기록**: 매니저가 요청·전환마다 `[flow] plaza → mgmet → freeplay → call minigame(mg1801) → return freeplay` 를 남기고, 개발 모드에서는 Work 변경도 기록한다(개발 콘솔·`window.__mpj.flow`). 등록표에서 문서용 흐름도를 만드는 도구를 둔다.

### 10.7 지금 상태와 남은 이동

- 됨: `game/core`·`game/lib`(별칭 `@game`), `app/scene/{menu,world}`, `script/dev`, 공용 폴더 2개 — 옛 `shell/mgmcommon` → `app/common/ui`, 옛 `shell/stage3d` → `app/common/render3d`(별칭 `@app/common`), 미니게임 — 옛 `scene/minigame/{mgscene,mgresult,mgstage}` → `app/minigame/frame/{scene,result,stage}`, 옛 `mgm01` → `app/scene/mode/freeplay`, 옛 `games/rhythm` → `app/minigame/kit/rhythm`, 옛 `games/{mg1801,mgdummy}` → `app/minigame/{mg1801,mgdummy}`, 옛 `games/index.ts` → `app/minigame/index.ts`(게임 등록표, 별칭 `@app/minigame`).
- 남음: `view/`·페이지 파일·`main.ts`·`mgrun.ts`(→ `app/minigame/frame`)·`game.ts`(게임 계약 → `app/minigame/frame`)·`env.ts` → `app/common`·`app/flow`·`app/main.ts`.
- 화면끼리의 직접 import(광장 → 캐릭터 선택 미리보기, 결과 무대 → 광장 시선 등)는 `app/common` 으로 올려 없앤다.
- 장면 계약·요청 API·Work(10.5)는 아직 없다. 지금은 프리 플레이 목록만 `SceneStack`(Call/Return)·`MgmWork` 를 쓰고, 나머지 흐름은 `main.ts` 함수(`flowPlaza`·`flowMgmet`·`playFromList` …)가 직접 잇는다. 허브·목록 Work 가 따로 노는 감사 문서 P1 항목(규칙 캐시·복귀 지점)도 Work 통일로 같이 푼다.
