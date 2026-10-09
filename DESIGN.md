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

## 10. 폴더·import 규칙 (2026-10-09)

- `script/game/core`(결정적 계산: 시계·난수·패드·f32), `script/game/lib/<이름>`(공용 코어, import 0) + `script/game/lib/<이름>-<엔진>`(어댑터: three·dom·webaudio·gamepad·localstorage).
- `game/` 밖에서 core·lib 를 부를 때는 별칭 `@game/core/…`·`@game/lib/…` 만 쓴다(`tsconfig.json` `paths` 한 곳 — esbuild·tsx 가 같이 읽는다). 폴더를 옮기면 별칭 한 줄만 고친다.
- `game/lib` 안의 어댑터 → 자기 코어는 상대 경로(`../sound`)로 둔다. 폴더째 다른 프로젝트(ddalkkakrider 포털 등)로 가져갈 때 별칭 설정 없이 돈다. 공용 lib 끼리, lib → shell·games·view import 는 금지(경계 시험).
- 개발·시험 페이지는 `script/dev/` + `dev/ui.html`(주소 `/dev/ui`).
- 화면은 `script/app/scene/<묶음>/<화면>`: `menu`(플레이어 설정·캐릭터 선택·모드 선택·보드 규칙·온라인), `world`(광장·항구 mgmet), `minigame`(한 판 틀 mgscene·결과 mgresult·장면 로더 mgstage·프리 플레이 mgm01). 화면 폴더 밖에서 부를 때는 별칭 `@app/scene/…`, 화면 폴더 안은 상대 경로.
- 남은 정리(나중): `shell/mgmcommon`·`shell/stage3d`·`view/`·페이지 파일 → `app/common`·`app/flow`·`app/main.ts`. 화면끼리의 직접 import(광장 → 캐릭터 선택 미리보기 등)는 그때 `app/common` 으로 올려 없앤다.
