# 슈퍼 마리오 파티 잼버리 웹 포팅

Super Mario Party Jamboree(Switch) 미니게임을 원본 동작 그대로 웹으로 옮기는 프로젝트다. 원본 분석은 상위 폴더 [../README.md](../README.md)와 [docs/analysis/](docs/analysis/)에 있다.
구조는 미니게임천국 웹(`E:/programming/python/analysis/web`)의 mp4_new 설계를 따르고, 번들러는 vite 대신 **esbuild**를 쓴다.

| 항목 | 상태 (2026-10-02) |
|---|---|
| 뼈대(페이지·루프·계약·도구) | 완료 — 타입 검사·빌드·스모크 통과 |
| 게임 | mg1801 싹둑싹둑 수프 — 회색 박스(로직 원본 판독, 화면 상자, BGM). `?game=mg1801` |
| 게임 분석 문서 | [docs/minigame/](docs/minigame/README.md) |
| 캐릭터 선택 화면 | 독립 모듈 `script/shell/charselect`(엔진층 미의존) — `?charselect=1`(시작 → 선택 → 고른 캐릭터로 게임). 분석·명세 [docs/shell/charselect.md](docs/shell/charselect.md) |

설계 규칙은 [DESIGN.md](DESIGN.md), 진행 상황은 [PROGRESS.md](PROGRESS.md).

## 실행

```sh
npm install
npm run dev          # 개발 서버 http://localhost:5181/ (esbuild watch, 고치면 페이지 자동 새로 고침)
npm run build        # tsc --noEmit + 배포 빌드 → dist/ (상대 경로라 어느 경로에 올려도 된다)
npm run typecheck    # 타입 검사만
npm run check        # 등록된 게임 로직을 노드에서 두 번 돌려 결정성 확인
npm run smoke        # 헤드리스 크로미움으로 페이지·게임 실행, 콘솔 오류 확인, test/out/smoke/*.png
```

조작(첫 사람): WASD/방향키 = 왼쪽 스틱, J = A, K = B, U = X, I = Y, Q = L, E = R, Enter = +, Backspace = −. 게임패드는 표준 매핑을 닌텐도 배치로 읽는다([script/view/input.ts](script/view/input.ts)).

URL 옵션: `?game=<id>` `?seed=<n>` `?com=0111` `?debug=1` `?fast=N` `?mute=1` `?auto=1` `?charselect=1`(시작 전 캐릭터 선택). 시험 훅은 `window.__mpj`(stage, frame, seed, result, error, hold, charselect), `window.__charselect`.

캐릭터 선택 모듈: 에셋 변환 `c:/dev/mpj/.venv/Scripts/python web/tools/analysis/charsel_web_assets.py [ui] [sound] [chara]`, 시험 `npx tsx tools/test_charselect.ts`(상태기계)·`npx tsx tools/check_charselect.ts`(원본 데이터 대조·import 검사)·`npx tsx tools/shot_charselect.ts`(헤드리스).

UI 시험 페이지: http://localhost:51811/ui.html — 셸 화면을 게임 없이 단독으로 띄운다. 화면 선택·1~4P COM·소리 끔·디버그(fps·상태기계·카드 3D 로딩 ms)·결과 표시. URL `?ui=charselect` `?com=0001` `?mute=1` `?auto=1`. 키 J = A, K = B, 방향키·WASD. 스모크 `npx tsx tools/smoke_ui.ts`. 화면 추가는 `script/ui_main.ts` 의 `UIS` 에 등록.

## 구조

```
web/
  index.html            페이지. ./bundle/main.js·main.css 를 건다
  script/               브라우저 코드 (esbuild 엔트리 script/main.ts)
    main.ts             페이지 조립: 화면, 설정 패널, 60Hz 고정 스텝 루프, URL 옵션, 시험 훅
    env.ts              DEV·BASE·ASSETS (vite import.meta.env 대신)
    game.ts             게임 계약: GameDef / GameLogic / GameView / GameSetup / GameResult
    style.css           페이지 스타일 (main.ts 가 import → bundle/main.css)
    games/index.ts      등록된 게임 목록 GAMES
    games/<id>/         게임 하나 (logic/ state.ts view/ index.ts) — 아직 없음
    core/               로직 부품 (DOM·three.js 없음, 노드에서도 돈다)
      clock.ts          60fps, FRAME_DT, 루프 상수
      fmath.ts          f32(Math.fround)·벡터 도구
      sched.ts          bex::Fiber 대응 제너레이터 스케줄러
      pad.ts            Switch Npad 입력 형식, 누름/뗌
      rng.ts            bex::RandModule 계약 (알고리즘 미확정, 구현 없음)
      events.ts         로직 → 화면 사건 유니온
    shell/charselect/   캐릭터 선택 독립 모듈(state 순수 상태기계·scene2d/render2d 자체 명세 2D·preview3d 카드 3D·screen 컨트롤러, three 만 import)
    charselect_page.ts  페이지 ↔ 캐릭터 선택 모듈 어댑터(입력 비트·SE·루프)
    ui_main.ts          UI 시험 페이지(ui.html) — 셸 화면 목록(UIS)·옵션·디버그
    view/               화면 부품 (브라우저 전용)
      renderer.ts       three.js WebGLRenderer, 기준 1920×1080
      assets.ts         manifest·json·glTF 읽기 (assets/<게임>/)
      audio.ts          WebAudio 버스 se·voice·bgm
      input.ts          키보드·Gamepad → PadInput
      hud.ts            2D HUD 캔버스
  tools/                노드 도구 (tsx)
    esbuild_config.ts   엔트리·출력·define 공용 설정
    serve.ts            개발 서버 (watch + serve, servedir = web/)
    build.ts            배포 빌드 (dist/)
    check_logic.ts      로직 결정성 검사
    golden.ts           골든 형식 (f32 비트 보존 + JSON Merge Patch jsonl.gz)
    browser.ts          크로미움 찾기, 시험용 esbuild 서버
    smoke.ts            스모크 시험
    analysis/           원본 추출·분석 도구 (python·Ghidra 스크립트·C# 변환기, 루트 기준 실행)
  assets/               변환한 에셋 (게임별 manifest.json) — assets/README.md
  docs/analysis/        공용 원본 분석 (추출·패키지·코드 모듈)
  docs/minigame/        미니게임별 원본 분석·포팅 명세
  test/                 골든·스크린샷 — test/README.md
```

의존 방향: `core` ← `games/*/logic` ← `games/*/view` → `view`. `core`와 `logic`은 DOM·three.js를 import하지 않는다. `main.ts`는 `game.ts` 계약과 `games/index.ts`만 안다.

## vite → esbuild 대응

| vite 기능 | 여기서는 |
|---|---|
| `import.meta.env.BASE_URL` / `DEV` | `script/env.ts`의 `BASE`(`'./'`)·`DEV`(esbuild define `__DEV__`) |
| `publicDir` | `assets/`를 같은 이름으로 내준다(개발: servedir, 배포: dist/assets 복사). 코드는 `${ASSETS}…` |
| HTML 엔트리(`<script src="*.ts">`) | HTML은 `./bundle/<엔트리>.js`를 건다. 엔트리는 `tools/esbuild_config.ts`의 `ENTRIES` |
| CSS import | 그대로 import, esbuild가 `bundle/<엔트리>.css`로 낸다. HTML에 `<link>` |
| `import.meta.glob` | 쓰지 않는다. 게임은 `games/index.ts`에 손으로 등록한다 |
| HMR | 없음. `/esbuild` 변경 알림으로 페이지 전체를 새로 고친다 |
| `createServer`(시험 도구) | `tools/browser.ts`의 `startServer`(esbuild serve) |

## 새 게임 추가

1. 원본 분석 문서를 `docs/minigame/<id>.md`로 쓴다(형식은 `../분석.txt`).
2. `script/games/<id>/`에 `state.ts`(로직 → 화면 계약), `logic/`(원본 클래스마다 하나), `view/`, `index.ts`(GameDef)를 둔다.
3. `script/games/index.ts`의 `GAMES`에 더한다.
4. 에셋 변환물을 `assets/<id>/manifest.json`과 함께 둔다.
5. `npm run check`, `npm run smoke`로 확인하고, 원본 골든이 생기면 게임별 verify 도구로 대조한다.
