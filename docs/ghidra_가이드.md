# Ghidra 분석 가이드

분석 흐름: **Ghidra 단일 프로젝트(MCP)로 분석 → 확정된 계약만 MD → .ts 구현 → 진행도(web/progress)로 집계**

| 위치 | 담는 것 | 역할 |
|---|---|---|
| Ghidra 프로젝트 | 주소별 사실: 함수 이름·네임스페이스·시그니처·구조체·enum·주석·태그 | 분석 작업 공간(캐시) |
| git 스냅샷 `web/ghidra/db/` | 위 내용을 텍스트로 내보낸 것 + 태그 어휘·기능 목록 | **기준 원본**: 이력·diff·리뷰·grep |
| 기능 MD `web/docs/**` | 기능 단위 계약: 흐름·상태 전이·계산 규칙·웹 설계·기대값·미확정 목록 | 구현 근거. 의사코드·오프셋표는 복사하지 않고 함수 ID로 연결 |
| .ts | 구현 + `@orig` 표시 | 포팅 연결의 기준 원본 |
| 시험 보고서 | 시험 통과 결과 | 검증의 기준 원본 |

## 0. 원칙

1. **사실 하나는 한 곳에만 저장한다.** 같은 내용을 Ghidra·MD·코드에 복사하지 않는다.
2. **계산할 수 있는 것은 저장하지 않는다.** 미니게임 소속, 작은 함수 여부, 포팅 여부, 기능 범위는 스캐너가 계산한다.
3. 사람(또는 AI)이 판단해야만 알 수 있는 것만 Ghidra 태그로 붙인다: 분석 상태, 소유 시스템, 제외 여부.

## 1. 함수 ID

- 형식: **`모듈:주소`** — 소문자 16진수, `0x` 없음.
  - 예: `main:7100123400`, `mg0108:71000041e0`, `mgm02:710001704c`
- 모듈 이름은 파일 이름에서 확장자를 뺀 것이다: `main`(main.nso), `mg0108`(mg0108.nro), `menu00`, `bd01` …
- **모든 NRO가 같은 기준 주소(0x7100000000)에서 시작한다.** 모듈 없는 주소는 어느 함수인지 알 수 없으므로 MD·코드·주석 어디서든 함수 ID 형식으로 쓴다.
- 주소는 함수 시작 주소다. 함수 안쪽 위치를 가리킬 때는 `main:7100123400+0x48`처럼 쓴다.

## 2. 분석 규칙

1. 기능을 다룰 때는 `docs/README.md`(기능 → MD 목록)에서 관련 MD를 먼저 찾는다.
2. 함수 하나를 찾을 때는 스냅샷(`web/ghidra/db/`)을 grep하거나 Ghidra MCP로 조회한다.
3. MD나 Ghidra에 이미 확정된 로직이 있으면 다시 분석하지 않고 재사용한다.
4. MD에 내용이 없거나 부족할 때만 Ghidra MCP로 새로 분석한다.
5. 새로 확인된 사실은 Ghidra에 바로 반영한다: 함수명·구조체·타입·enum·주석·상태 태그.
6. 부분 분석 결과도 Ghidra에 남긴다(plate 주석 + `ST_PARTIAL`). 검증되지 않은 가설은 확정된 이름이나 타입으로 적용하지 않고 주석에만 적는다.
7. 기능의 계약이 확정되면 MD를 만들거나 고친다. MD 기준은 "100% 완료"가 아니라 "확정된 계약 + 미확정 목록"이다.
8. 기존 분석과 모순되면 이전 결과를 임의로 덮어쓰지 않는다. 근거를 확인한 뒤 고치고, 확인 전에는 `ST_RECHECK`로 바꾼다.
9. TypeScript 구현은 MD를 먼저 쓴다. 원본 계산식이나 분기 확인이 필요할 때만 Ghidra MCP를 부른다.
10. 원본 함수를 옮긴 코드에는 `@orig`를 표시한다(§6).
11. 작업이 끝나면 스냅샷을 내보내고 검사를 돌린 뒤 git diff로 확인한다(§10).

## 3. 네임스페이스

- **원본 심볼이 있는 함수의 네임스페이스는 옮기지 않는다.** 예: `mg0108::Camera::SetupGame`, `bq::MinigameModeWork::…`. 원본 이름 자체가 근거다.
- 네임스페이스 정리는 이름 없는 `FUN_…` 함수에만 한다. 예: `SharedEngine::Actor`.
- 소속은 네임스페이스가 아니라 태그(소유 시스템)와 계산(미니게임 소속)으로 나눈다. 공용 함수는 여러 게임에 쓰이는데, 네임스페이스는 하나만 가질 수 있기 때문이다.

## 4. 정보별 저장 위치

| 정보 | 저장 위치 | 정하는 쪽 |
|---|---|---|
| 분석 상태 | Ghidra 태그 `ST_*` | 분석자 판단 |
| 소유 시스템 (main 함수만) | Ghidra 태그 `SYS_*` | 분석자 판단 |
| 진행도 제외 | Ghidra 태그 `EX_*` | 판단 + 자동 일괄 |
| 미니게임 소속 | **계산**: NRO 모듈 = 게임, 공용 함수는 호출 그래프 | 스캐너 |
| 작은 함수 | **계산**: 크기·호출 수(기준은 `tags.json`) | 스캐너 |
| 포팅 여부·파일·수준 | **웹 코드 `@orig`** | 구현자 |
| 시험 통과 | **시험 보고서** | 시험 실행 |
| 기능 범위 | **계산**: `features.json` 시작 함수 → 호출 그래프 | 스캐너 |

파일 경로는 Ghidra에 적지 않는다. 파일을 옮길 때마다 낡기 때문이다. 함수 → 파일 연결은 스캐너가 `@orig`에서 계산한다.

## 5. Ghidra 태그

손으로 붙이는 태그는 함수당 최대 3개다: 상태 1, 시스템 1, 제외 0~1. 어휘는 `web/ghidra/db/tags.json`에 고정한다(§9.1).

- 태그 이름에는 프로젝트 이름을 넣지 않는다(`ST_`·`SYS_`·`EX_`). 도구(snapshot·progress)는 태그 이름이 아니라 `tags.json`의 `axis`(status·system·exclude)와 `state`를 읽는다. 그래서 다른 프로젝트도 `tags.json`만 바꿔 같은 도구를 쓴다.

### 5.1 상태 `ST_*` (axis `status`, 하나만, 없으면 미착수)

| 태그 | state | 완료 기준 | 집계 |
|---|---|---|---|
| (없음) | — | 손대지 않음 | 미착수 |
| `ST_PARTIAL` | partial | 일부 사실 확인. plate 주석 필수 | 부분 |
| `ST_ANALYZED` | complete | 모든 분기를 이해했고, 호출하는 함수의 역할이 알려져 있고, 쓰는 필드·상수를 확인함. 함수 안에 미확정이 없음. plate 주석 필수 | **완료** |
| `ST_RECHECK` | recheck | 모순이 생겨 다시 확인해야 함 | 경고(완료에서 제외) |

- 함수 밖의 미확정(호출자 쪽 사용법 등)은 ANALYZED를 막지 않는다. 그 미확정은 기능 MD에 적는다.
- `VERIFIED`는 쓰지 않는다. 웹 검증은 시험 보고서로 따로 집계한다.

### 5.2 시스템 `SYS_*` (axis `system`, main 함수에만, 하나)

NRO 함수는 모듈로 소속이 정해지므로 붙이지 않는다. progress의 엔진 분야는 이 목록과 1:1이다(순서·이름도 `tags.json`의 `label`).

| 태그 | 이름 | 범위 | 관련 문서 |
|---|---|---|---|
| `SYS_CORE` | 코어 | 엔티티·컴포넌트·파이버·난수·수학·메모리 | engine/01 |
| `SYS_SCENE` | 장면·흐름 | 장면 수명·전환·Work·모드 진행 | engine/18, 15 |
| `SYS_ACTOR` | 액터 | ComActor·패드 해석·점프·조건·접지·NPC·CPU | engine/17 |
| `SYS_CHARACTER` | 캐릭터 | 캐릭터 모델·표정·의상·캐릭터 데이터 | engine/09 |
| `SYS_ANIMATION` | 애니메이션 | 스켈레톤·포즈·모션·블렌드·IK | engine/09 |
| `SYS_COLLISION` | 물리·충돌 | 충돌 질의·강체·물리 연결 | engine/11 |
| `SYS_CAMERA` | 카메라 | 카메라·투영·FSNB·흔들림 | engine/07, 20 |
| `SYS_RENDER` | 렌더링 | 모델·메시·텍스처·조명·그림자·렌더 패스·분할 화면·LOD | engine/03, 10, render_unify |
| `SYS_SHADER` | 셰이더·머티리얼 | 셰이더·머티리얼 파라미터·유니폼 | engine/14 |
| `SYS_EFFECT` | 이펙트 | 이펙트·파티클 | engine/08 |
| `SYS_UI` | UI·레이아웃 | 레이아웃·폰트·메시지·대화상자 | engine/05 UI 부분 |
| `SYS_INPUT` | 입력 | 패드·체감 입력 | engine/05 입력 부분, 19 |
| `SYS_SOUND` | 사운드·진동 | SE·BGM·음성·진동 | engine/04 |
| `SYS_NET` | 네트워크 | 온라인·세션·동기화 | engine/12 |
| `SYS_SAVE` | 저장·보상 | 저장 데이터·보상·업적 | engine/16 |
| `SYS_ASSET` | 리소스·데이터 | 리소스 로더·아카이브·장면 데이터 | engine/06, loader_manager |
| `SYS_GAME` | 게임 코드(main 안) | main 안의 게임 규칙·모드 코드(bq·ca·sb·wl) | — |

### 5.3 제외 `EX_*` (axis `exclude`, 진행도 분모에서 뺌)

| 태그 | 뜻 |
|---|---|
| `EX_LIB` | nn SDK·표준 라이브러리·PhysX 등 외부 코드. 대부분은 progress의 `lib_pattern`이 이름으로 자동 제외한다 |
| `EX_DEBUG` | 디버그·개발 전용 기능 |

### 5.4 plate 주석 형식

```
[판독] 2026-10-11 / md: docs/minigame/mg0301.md §6.2
본문…
```

- 첫 줄: `[근거 수준] 날짜 / md: 경로 §절` (md가 없으면 생략)
- 근거 수준: `[판독]` 디컴파일 확인, `[추정]` 해석, `[미확정]` 공백
- 날짜는 나중에 RECHECK 대상을 판단하는 데 쓴다.
- 웹 파일 경로는 적지 않는다(§4).

### 5.5 예시

```
ID:    mg0301:7100123400   (UpdateRobot)
Tags:  ST_ANALYZED
Plate: [판독] 2026-10-11 / md: docs/minigame/mg0301.md §6.2
```

- 시스템 태그가 없는 이유: NRO 함수라서 소속(mg0301)이 모듈로 정해진다.
- 포팅 여부는 코드의 `@orig mg0301:7100123400 full`에서 계산된다.

### 5.6 검사 (progress가 '규칙 위반'으로 표시)

- `tags.json`에 없는 태그
- 상태 태그가 2개 이상, 시스템 태그가 2개 이상
- 시스템 태그를 시스템 분류 영역(main)이 아닌 곳에 붙임
- `plate: true`인 상태(PARTIAL·ANALYZED)인데 plate 주석이 없거나 첫 줄 형식이 다름
- `@orig`가 가리키는 함수 ID가 스냅샷에 없음
- 타입 설명에 정의 안 된 `ST_`·`SYS_`·`EX_` 단어

### 5.7 구조체·타입

Ghidra 데이터 타입에는 태그가 없으므로 **설명(description)에 같은 태그 이름을 적는다.**

```
ST_ANALYZED SYS_RENDER
[판독] 2026-10-11 / md: web/docs/engine/03_graphics.md §4
```

- 상태: 설명의 `ST_*`가 우선. 없으면 이름 있는 필드가 하나라도 있으면 부분, 없으면 미분석(디맹글러가 만든 빈 자리표시).
- 분야: 설명의 `SYS_*`가 우선. 없으면 타입 경로에 엔진 이름 패턴을 적용한다.
- 필드 채움률: 기본 이름(`field_0x…` 등)이 아닌 필드가 차지하는 바이트 / 구조체 크기.
- 진행도 대상: struct·union·enum. 라이브러리 경로(libc 헤더·std·nn(bezel 제외) 등)는 뺀다. NRO는 그 모듈 네임스페이스의 타입만 센다(나머지는 main 타입의 복사본).

### 5.8 클래스 타입의 소유와 동기화

Ghidra 타입은 프로그램마다 따로 있다. 자동 분석의 디맹글러가 심볼에 나온 클래스마다 빈 구조체를 `/Demangler/<네임스페이스>/<클래스>`에 만들고, 클래스 메서드의 `this`는 `/<네임스페이스>/<클래스>`(있으면)를 쓴다. 그래서 main 클래스(`bq::`·`actor::`·`nn::bezel::` 등)는 그 클래스를 참조하는 NRO마다 빈 사본이 있다.

- **클래스 정체:** 타입 경로에서 `/Demangler`를 뗀 경로. `/Demangler/bq/Foo`와 `/bq/Foo`는 같은 클래스다.
- **소유 프로그램:** 그 클래스 네임스페이스에 thunk 아닌 함수가 있는 프로그램. 없으면 정의가 채워진 곳이 하나뿐인 프로그램.
- **정의는 소유 프로그램에서만 고친다.** NRO 쪽 기록·수정이 main 클래스를 가리키면 `migrate.py`가 소유 프로그램으로 보낸다.
- **동기화:** `snapshot.py sync-types`(`tools/sync_types.py`)가 소유자의 정의를 그 클래스를 이미 참조하는 다른 프로그램에 넣는다.
  - 필드가 참조하는 타입도 함께 옮긴다. 값으로 들어간 타입은 정의를 옮기고, 포인터로만 쓰인 타입은 대상에 없으면 자리표시를 만든다. 경로는 대상 프로그램의 같은 클래스 경로로 바꾼다.
  - 사본 설명 첫 줄에 `SYNC_FROM <모듈>:<경로>`(`config.json` `sync_marker`)를 단다. 표시가 있는 사본만 다시 쓰고, 표시 없이 내용이 있으면 그 프로그램에서 직접 고친 것으로 보고 덮어쓰지 않는다.
  - 대상에서 그 타입을 값으로 품은 다른 타입이 있는데 크기가 바뀌면 넣지 않고 보고한다.
  - 바뀐 것이 없을 때까지 반복하므로 몇 번을 돌려도 결과가 같다.
  - 보고서: `web/ghidra/sync_types_report.md`
- MCP로 main 구조체를 고친 뒤에는 서버를 끄고 `sync-types` → `apply`를 돌린다.

## 6. 웹 코드 표시 `@orig`

원본 함수·데이터를 옮긴 코드의 선언(함수·메서드·클래스·상수) 바로 위 JSDoc에 단다. 런타임에 영향이 없고, 선언에 붙어 있어 파일을 옮기거나 이름을 바꿔도 따라간다.

```ts
/** @orig <모듈>:<주소> <수준> [— 메모] */
```

| 수준 | 뜻 |
|---|---|
| `full` | 원본 식·분기를 그대로 옮김 |
| `partial` | 일부 분기만 옮김 |
| `approx` | 근사(원본과 다름을 알고 있음). **메모에 이유 필수** |
| `ref` | 연결만 확인, 수준 미정. `tools/orig_scan.mjs`가 자동으로 단 것. 그 선언을 작업할 때 위 셋 중 하나로 바꾼다 |

- 한 표시 = 원본 하나 ↔ 웹 선언 하나의 연결. 여러 대 여러로 단다.
- **수준은 같은 주소 표시가 붙은 웹 선언 전체가 그 원본을 얼마나 옮겼는지**다.

| 경우 | 다는 법 |
|---|---|
| 1:1 | 표시 하나 |
| 원본 여러 개 → 웹 하나(합침·인라인) | 그 선언에 표시를 여러 줄 |
| 원본 하나 → 웹 여러 개(나눔) | 조각마다 같은 주소·같은 수준, 메모에 맡은 부분(`— 입력 단계`) |
| 구조가 다름(상태기계 → 표 구동, 클래스 → 함수 묶음) | 그 역할을 하는 선언에 |
| 원본 전역 데이터·표 | 그 상수·표 선언에 데이터 주소로 |
| 일부러 옮기지 않음(디버그·플랫폼 전용) | 표시 없음. Ghidra에 `EX_DEBUG` 또는 plate 메모 |

- progress는 같은 주소의 표시를 모아 원본 하나에 연결된 웹 선언을 모두 보여 주고, 구현 수준은 그중 가장 높은 것으로 센다.
- 규칙 위반: 같은 주소 조각끼리 수준이 다름, `approx`인데 메모 없음, 스냅샷에 없는 주소.
- 기존 자유 형식 참조(`@0x…`, `main FUN_…`)는 그대로 두고, `orig_scan.mjs`가 그 위에 `@orig … ref`를 더한다(§13.8).
- 표시를 모두 지울 때는 `web/ghidra/tools/strip_orig.py`.
- 원본 사실을 새로 알게 되면 **Ghidra에 먼저** 기록하고 코드를 고친다. Ghidra가 기준이고 웹은 그에 맞춘다(§13.9 작업하면서 맞추기).

## 7. 기능 목록 `features.json`

- 전체 서비스 진행도의 단위다. 기능마다 이름, MD, 시작 함수 ID를 적는다.
- 스캐너가 시작 함수에서 호출 그래프를 따라가 범위를 정한다.
- 간접 호출(vtable·콜백·람다)은 호출 그래프에 안 잡히므로 `roots`에 추가로 적는다.
- 미니게임은 기능 목록에 따로 적지 않아도 된다. NRO 모듈 하나가 미니게임 하나다.

## 8. 진행도 (web/progress)

progress 서버가 `web/ghidra/db`를 직접 읽어 집계한다(문서 스캔 없음). 프로젝트별 규칙은 `web/progress/config/ghidra.json`, 태그 정의는 `tags.json`이다. db가 바뀌면 3초 안에 다시 읽는다.

- **분모:** 전체 함수 − 외부 라이브러리(`lib_pattern`·`EX_LIB`) − thunk − 작은 함수 − 제외 태그
- **분석:** 미착수 / 부분 / 완료 / 재확인 (status 축 태그)
- **포팅:** full / partial / approx / 없음 (`@orig`)
- **구조체·타입:** 완료 / 부분 / 빈 자리표시, 필드 채움률(§5.7)
- **규칙 위반:** §5.6

| 영역(areas) | 분류 방식 | 아래 단계 |
|---|---|---|
| 엔진(main) | `system`: `SYS_*` 태그 → 이름 패턴 → 주소 이웃 추정 | 분야 → 근거(태그·이름·주소 추정) → 네임스페이스 |
| 미니게임(mg####) | `stage`: 메서드 이름으로 시작·진행·종료·정리·메시지·접근자·자동 생성·이름 없음 | 단계 → 게임 → 클래스 |
| 보드·화면·모드 | `none` | 모듈 → 클래스 |
| 타입 | 영역 분류를 그대로 | 분야 또는 모듈 |

- **주소 이웃 추정:** 이름 없는 함수의 앞뒤 분류된 함수가 같은 분야이고 0x8000 안이면 그 분야로 본다. 이름을 가린 시험(main 1,095개)에서 97% 맞았다. 호출 관계 추정은 63~74%라 기본에서 끈다.
- **모듈 간 의존:** NRO의 thunk 이름(`<EXTERNAL>::` 제거)을 main 함수와 이름으로 맞춰, 게임마다 쓰는 엔진 함수 수와 그 분석률을 보여 준다(트리의 게임 이름 옆 `의존 완료/전체`).
- **기능별 진척**(`features.json`)과 **검증**(시험 보고서)은 아직 없다.

## 9. 정의 파일 형식

### 9.1 `web/ghidra/db/tags.json`

```json
{
  "version": 2,
  "trivial": { "maxSize": 32, "maxCalls": 0 },
  "tags": {
    "ST_PARTIAL":  { "axis": "status", "state": "partial",  "label": "부분", "plate": true, "desc": "…" },
    "ST_ANALYZED": { "axis": "status", "state": "complete", "label": "완료", "plate": true, "desc": "…" },
    "ST_RECHECK":  { "axis": "status", "state": "recheck",  "label": "재확인", "desc": "…" },
    "SYS_SHADER":  { "axis": "system", "label": "셰이더·머티리얼", "doc": "web/docs/engine/14_shader_graphs.md", "desc": "…" },
    "EX_LIB":      { "axis": "exclude", "label": "외부 라이브러리", "desc": "…" }
  }
}
```

- `desc`는 Ghidra 태그 설명(tag comment)으로 등록된다(`snapshot.py tags`).
- system 태그의 순서가 progress 엔진 분야의 순서다.

### 9.2 `web/ghidra/db/features.json`

```json
{
  "version": 1,
  "features": [
    {
      "id": "plaza.move",
      "label": "광장 이동",
      "system": "SYS_ACTOR",
      "md": "web/docs/shell/plaza_3d.md#3.5",
      "roots": ["main:71000149e8"]
    }
  ]
}
```

### 9.3 스냅샷 `web/ghidra/db/<프로젝트 안 경로>/`

폴더는 Ghidra 프로젝트 경로와 같다. 예: `db/exefs/main.nso/`, `db/romfs/nro/NX_Release/mg0108.nro/`

| 파일 | 내용 |
|---|---|
| `meta.json` | 모듈·프로젝트 경로·기준 주소·언어 |
| `functions/<구간>.tsv` | `addr size name namespace namesrc sigsrc thunk tags signature` (전체 함수) |
| `calls/<구간>.tsv` | `caller` → 호출하는 함수 주소 목록(외부는 `ext:이름`) |
| `comments/<구간>.jsonl` | 모든 주석 `{a, t(plate/pre/eol/post/repeatable), c}` |
| `signatures.jsonl` | 사용자가 지정한 시그니처(복원용 구조: cc·ret·params·varargs·noreturn) |
| `labels.tsv` | 사용자 라벨 |
| `types.jsonl` | struct·union·enum·typedef·funcdef. 필드는 오프셋·길이·타입 경로·이름·주석·비트필드 |

- `<구간>` = 주소 1MB 단위 시작 주소(예: `7100100000`). main.nso(약 23MB)는 20여 개로 나뉘고, NRO는 대부분 1~2개다. 함수가 바뀌면 그 구간 파일만 바뀐다.
- `namesrc`·`sigsrc`: `u` 사용자, `i` 임포트(원본 심볼), `a` 분석, `d` 기본.
- 주소는 소문자 16진수, `0x` 없음. 행은 주소 순. 같은 DB면 같은 바이트를 쓴다.
- 구조체·enum은 C 헤더가 아니라 JSON으로 쓴다. 복원할 때 파싱하지 않고 오프셋대로 만들기 때문에 깨지지 않는다.
- 들어가지 않는 것: 지역 변수 이름·타입, 사용자 지정 참조, 북마크, 전역 데이터에 적용한 타입. 이것들은 `.gzf` 백업으로만 복원된다.

## 10. 버전 관리

Ghidra DB(`.gpr`/`.rep`)는 바이너리라 git으로 diff·merge가 안 된다. 그래서 두 층으로 관리한다.

| 층 | 위치 | 복원 범위 | 용도 |
|---|---|---|---|
| 텍스트 스냅샷 | `web/ghidra/db/` (git) | §9.3 범위(이름·네임스페이스·태그·주석·시그니처·라벨·타입). 왕복 시험으로 보장 | 리뷰·이력·grep |
| 기준본 `.gzf` | `ghidra_work/baseline/` | 임포트·자동 분석 직후 상태 100% | 복원의 출발점 |
| 백업 `.gzf` | `ghidra_work/backup/<날짜>/` | 그 시점 상태 100% | 완전 복원 |

### 10.1 자동 갱신 흐름
1. MCP 서버(`web/ghidra/ghidra_mcp_server.bat`)로 작업한다.
2. 저장할 때마다(`s` 키, 10분 자동 저장, `q` 종료) 실행기가 **바뀐 프로그램만** 서버 안에서 `ExportSnapshot.java`를 돌려 `web/ghidra/db`를 갱신한다.
   - 바뀐 프로그램은 Ghidra 변경 번호로 판단한다. 변경 없으면 건너뛴다.
   - 서버 안 스크립트 실행을 위해 실행기가 `GHIDRA_MCP_ALLOW_SCRIPTS=1`로 서버를 띄운다(localhost 전용).
   - `e` 키: 열린 프로그램을 모두 강제로 내보낸다.
3. git diff로 확인하고 커밋한다(커밋은 사람이 한다).
4. db가 어긋났다고 의심되면 서버를 끄고 `python web/ghidra/tools/snapshot.py export --all`로 전체를 다시 쓴다. 같은 스크립트라 결과가 같다.

### 10.2 snapshot.py (헤드리스, 서버가 꺼져 있을 때)

| 명령 | 하는 일 |
|---|---|
| `export [--all \| --programs main,mg0108]` | 프로젝트 → db 전체 다시 쓰기 |
| `apply [--all \| --programs …]` | db → 프로젝트(복원·동기화). 주석·라벨·태그는 db와 같아지도록 맞춘다 |
| `baseline [--all] [--force]` | 기준본 `.gzf` 만들기(임포트 직후 1회) |
| `backup [--all]` | 완전 백업 `.gzf` |
| `link` | NRO 외부 라이브러리 → `/exefs/main.nso` |
| `tags` | `db/tags.json` → 모든 프로그램 태그 등록 |
| `sync-types [--dry]` | 소유 프로그램의 클래스 정의를 같은 클래스를 쓰는 다른 프로그램으로(§5.8, db 텍스트만 바꿈) |
| `roundtrip --programs …` | 기준본 + db 적용 → 다시 내보내기 → db와 diff. **diff가 비어야 통과** |

- 시험용으로 `--project`·`--db`·`--baseline`으로 경로를 바꿀 수 있다.
- 로그: `ghidra_work/mpj/logs/`

### 10.3 복원 순서
1. 새 프로젝트에 기준본 `.gzf` 임포트(분석 없음)
2. `snapshot.py link` → `snapshot.py apply --all`
3. `snapshot.py roundtrip`으로 확인(선택)

`.gzf` 백업이 있으면 그것을 임포트하는 것만으로 완전히 복원된다.

### 10.4 하지 않는다
- `.gpr`/`.rep`·`.gzf`를 git이나 LFS에 넣기
- 동시 작업은 필요할 때만 로컬 Ghidra Server로 한다(checkout/checkin). 서버 이력은 보조이고 최종 기록은 git 스냅샷이다.

## 11. 프로젝트·폴더 구성

### 11.1 Ghidra 프로젝트
- 위치: `C:/dev/mpj/ghidra_work/mpj/mpj.gpr` (Ghidra 12.1.4). git에 넣지 않는다.
- 프로젝트 안 경로는 원본 구조 그대로다. 분류(미니게임·화면·보드)는 경로가 아니라 모듈 이름과 태그로 나눈다.
  ```
  /exefs/main.nso
  /romfs/nro/NX_Release/*.nro   (139개)
  ```
- sdk·subsdk0·rtld(nn SDK)는 넣지 않는다. 필요해지면 `/exefs/`에 추가한다.
- NRO의 외부 라이브러리는 `/exefs/main.nso`로 연결한다(`snapshot.py link`, `config.json`의 `link_target`).
- 원본(`C:/dev/original`)과 `extracted/`는 읽기만 한다. 키 값은 출력·기록하지 않는다.

### 11.2 web/ghidra (git)
새로 만드는 Ghidra 관련 파일은 모두 `web/ghidra` 안에 둔다.

```
web/ghidra/
├── config.json                    도구 공용 설정(Ghidra·JDK·프로젝트·db·기준본·백업 경로, 모듈↔프로그램 대응)
├── ghidra_mcp_server.bat          실행(더블클릭)
├── tools/                         스크립트
│   ├── ghidra_mcp_server.py       MCP 서버 실행기
│   ├── LinkExternal.java          외부 라이브러리 → link_target 프로그램 연결
│   ├── RegisterTags.java          tags.json → 태그 등록
│   ├── ExportSnapshot.java        프로그램 → db (서버 안·헤드리스 공용)
│   ├── ApplySnapshot.java         db → 프로그램 (복원·동기화)
│   ├── ExportGzf.java             기준본·백업 .gzf
│   ├── snapshot.py                export·apply·baseline·backup·link·tags·roundtrip
│   ├── orig_scan.mjs              웹 코드 ↔ 원본 함수 @orig ref 연결·상수 차이 후보(§13.8)
│   ├── headless_conventions.patch ghidra-mcp 헤드리스 패치
│   └── ghidra-mcp.commit          패치를 적용한 ghidra-mcp 커밋
├── reports/                       orig_scan 보고서
└── db/                            git diff용 내보내기(기준 원본)
    ├── tags.json
    ├── features.json
    ├── exefs/main.nso/            §9.3
    └── romfs/nro/NX_Release/<모듈>.nro/
```

- 큰 도구(Ghidra 12.1.4, ghidra-mcp 소스·빌드, Maven)는 `C:/dev/mpj/tools/`에 둔다.
- 기존 `web/tools/analysis/ghidra_scripts/`는 그대로 둔다.

### 11.3 스크립트 실행 형식
```sh
JAVA_HOME="C:/Program Files/Java/jdk-21" MSYS_NO_PATHCONV=1 \
  c:/dev/mpj/tools/ghidra_12.1.4_PUBLIC/support/analyzeHeadless.bat \
  c:/dev/mpj/ghidra_work/mpj mpj -process -recursive -noanalysis \
  -scriptPath c:/dev/mpj/web/ghidra/tools -postScript <스크립트> [인자]
```
- MCP 서버가 프로젝트를 열고 있으면 실행할 수 없다(프로젝트 잠금). 서버를 `q`로 닫은 뒤 실행한다.

## 12. Ghidra MCP: bethington/ghidra-mcp

https://github.com/bethington/ghidra-mcp

| 항목 | 내용 |
|---|---|
| 방식 | 헤드리스 서버(엔드포인트 190개)를 쓴다 |
| 필요한 기능 | 함수 태그 추가·삭제·목록, 이름 일괄 변경, 구조체 생성·수정, 주석 일괄, 호출자·피호출자, 호출 그래프, 디컴파일, Ghidra Server checkout/checkin·이력 |
| 요구 사항 | Ghidra 12.1.4, Java 21, Maven 3.9+, Python 3.10+ |
| 라이선스 | Apache 2.0 (v7.0.0, 커밋 `tools/ghidra-mcp.commit`) |

### 12.1 설치 (2026-10-11 확인)
- Ghidra 12.1.4: `C:/dev/mpj/tools/ghidra_12.1.4_PUBLIC`
- SwitchLoader: 12.1.4용 릴리스가 없어 소스(`tools/mcp/switchloader`)를 JDK 21로 빌드해 설치했다. NSO·NRO 임포트·분석 정상.
- ghidra-mcp: `tools/mcp/ghidra-mcp`에 `tools/headless_conventions.patch`를 적용하고 `mvn clean package -P headless -DskipTests`로 빌드한다. 빌드 전에 `python -m tools.setup install-ghidra-deps --ghidra-path <Ghidra 12.1.4>`로 Ghidra jar를 로컬 Maven에 넣는다.
- JDK는 21을 쓴다(`JAVA_HOME="C:/Program Files/Java/jdk-21"`). 기본 JAVA_HOME(17)으로는 빌드가 실패한다.

### 12.2 시험 결과 (분석 프로젝트 사본, main.nso + mg0108)

| 항목 | 결과 |
|---|---|
| 태그 | 추가·일괄·목록·태그로 함수 찾기 됨. 한글 태그 설명 됨 |
| 구조체 | 생성·조회 됨. 헤드리스는 필드 이름을 강제로 바꿈(`gameRule` → `nGameRule`) → 패치로 해결(§12.3) |
| 여러 프로그램 | 한 서버에서 main.nso(함수 65,139개)·mg0108(1,194개) 전환 |
| 우리 형식 | 한글 plate 주석·`MPJ_*` 태그 됨. 이름 규칙은 경고만, 거부 없음(strict 끔) |
| 속도 | 디컴파일 0.24~0.75초, 태그 검색(6.5만 개) 0.35초, 호출 그래프·상호 참조 0.01초 |
| 저장 | **명시적 저장 필요.** 저장 없이 끄면 변경이 사라진다. 저장 후 재시작하면 남는다 |

### 12.3 운영 규칙
- **서버 실행:** `web/ghidra/ghidra_mcp_server.bat`
  - 키: `s` 저장(+db 갱신) · `e` db 강제 내보내기 · `i` 상태 · `q` 또는 Ctrl+C 저장·내보내기 후 종료 · `h` 도움말
  - 10분마다 자동 저장(`--autosave`, 0이면 끔)
  - 서버(java)는 실행기 창과 분리돼 있다. 실행기를 다시 켜면 떠 있는 서버에 붙는다.
  - 로그: `ghidra_work/mpj/ghidra_mcp_server.log`
- **이름 규칙 설정:** `ghidra_work/mpj/.ghidra-mcp/conventions.json`
  ```json
  { "strict_mode": "off", "hungarian": { "auto_fix_struct_fields": false },
    "global_naming": { "validate": false, "require_g_prefix": false },
    "plate_comments": { "validate": false } }
  ```
  원본 헤드리스 서버는 이 파일을 읽지 않는다(GUI만 읽음). `tools/headless_conventions.patch`가 프로젝트를 열 때 읽게 한다.
- **쓰기 뒤 확인:** `set_function_prototype`은 "성공"을 반환해도 클래스 메서드의 `this` 타입은 바뀌지 않는다. 클래스 함수는 클래스 구조체를 고친다. 쓰기 뒤에는 결과를 다시 읽어 확인한다.
- **구조체 대량 반영**은 MCP가 아니라 스냅샷 일괄 적용 스크립트로 한다.
- 스크립트 실행 엔드포인트는 db 자동 갱신(§10.1) 때문에 실행기가 켠다(`GHIDRA_MCP_ALLOW_SCRIPTS=1`). 그래서 접속은 반드시 localhost 전용으로 둔다(`--bind 127.0.0.1`).

## 13. 기존 MD 분석 이전 (1회)

기존 MD의 분석은 이미 끝난 것이라 다시 분석하지 않고 옮겨 적기만 한다. 손이 가는 곳은 모듈 판별·문서 간 충돌·구조체 세 가지다.

### 13.1 기반
1. **단일 프로젝트:** `ghidra_work/mpj`에 `main.nso`와 분석된 NRO를 넣는다.
2. **정의 파일:** `tags.json`(§9.1)을 만들고 Ghidra에 태그를 등록한다. 태그 설명(tag comment)에 완료 기준을 적는다.
3. **스크립트 3개:** 스냅샷 내보내기, 스냅샷 일괄 적용(= 복원, §10), 검사(§5.6). 왕복해서 같은 결과가 나오는지 확인한다.
4. **자동 일괄 반영:**
   - `EX_LIB`: 심볼 패턴(nn::, std::, physx:: 등)으로 부여
   - 기존 `ghidra_work/` 프로젝트 30여 개에서 붙인 이름·타입을 모은다

### 13.2 MD → 이전 기록
- 문서 하나(또는 시스템 하나)씩 **이전 기록** `web/ghidra/migration/<문서>.jsonl`을 쓴다. 형식은 `web/ghidra/migration/README.md`.
- 문서마다 기록 파일이 달라 병렬로 할 수 있다. 기록을 쓰는 쪽은 db·Ghidra를 직접 고치지 않는다.
- 뽑는 것: 함수 ID, 상태(`ST_*`), 시스템(`SYS_*`, main만), plate 주석(첫 줄 `[근거] 날짜 / md: 문서 §절` + 짧은 요약), 이름 없는 함수의 이름·네임스페이스, 구조체·enum.
- **확정 수준을 지킨다.**
  - `[판독]`만 이름·타입·구조체 필드로 넣는다.
  - `[추정]`·`[미확정]`은 plate 글로만 남기고 상태는 `ST_PARTIAL`.
- **모듈 판별:** 모듈 없이 적힌 주소는 문서 맥락으로 모듈을 정한다. 모호하면 기록하지 않고 `<문서>.unresolved.txt`에 남긴다.
- 함수 ID는 스냅샷(`web/ghidra/db/.../functions/*.tsv`)에 있는지 확인하고 쓴다.

### 13.3 병합·검사 `tools/migrate.py`
- 이전 기록을 모아 db 텍스트에 합친다(`--dry`는 검사만). 결과는 `migration/report.md`.
- 검사: 함수 ID 존재, 정의된 태그·축, 시스템 태그 위치, plate 첫 줄 형식.
- 여러 문서가 같은 함수를 기록하면: 상태는 강한 쪽(RECHECK > ANALYZED > PARTIAL), plate는 문서 링크를 모두 남기고 원래 plate(디맹글 시그니처 등)는 `---` 아래 보존, 이름이 다르면 **충돌로 보고하고 넣지 않는다**.
- 원본 심볼이 있는 함수는 이름을 바꾸지 않는다(문서 이름이 다르면 보고만).
- 충돌은 사용자가 정한다. 정하기 전에는 `ST_RECHECK`로 둘 수 있다.

### 13.4 Ghidra 적용·확인
1. MCP 서버를 끈 상태에서 `snapshot.py apply --programs <모듈들>` (db → Ghidra 일괄 적용, MCP로 한 건씩 넣지 않는다)
2. `snapshot.py export --programs <모듈들>`로 다시 내보내 git diff 확인
3. 대표 함수 몇 개를 디컴파일해 이름·타입이 제대로 붙었는지 본다
4. progress에서 분야별 진척과 규칙 위반을 확인한다

### 13.5 MD 정리
- 함수 단위로 복사된 내용(의사코드, 오프셋 표, 주소 목록)은 함수 ID로 바꾼다.
- 기능 계약(흐름·상태·계산 규칙·웹 설계·기대값·미확정 목록)만 남긴다.
- 문서별로 병렬로 할 수 있다.

### 13.6 이후
1. **기능 목록:** `features.json`에 기능별 시작 함수를 적고, 호출 그래프로 빠진 간접 호출을 `roots`에 보탠다.
2. **MCP 연결:** ghidra-mcp를 설치하고 SwitchLoader를 확인한다(§12).
3. **progress 스캐너 입력 교체:** MD 추측 → 스냅샷 태그 + `@orig` + 시험 보고서.
4. **`@orig` 전환:** 새 코드는 처음부터 `@orig`를 쓴다. 기존 자유 형식 참조는 해당 파일을 고칠 때 바꾼다.
5. **README 자동 생성:** 함수 주소·복원 이름·역할·MD 링크는 스냅샷에서 생성한다. 손으로 쓰는 README는 기능 → MD 목록만 둔다.

### 13.7 진행 단위
- 시스템 단위로 끊어서 13.2~13.5를 반복한다. 예: actor → 장면·Work → 사운드 → …
- 중간에 멈춰도 그때까지 옮긴 시스템은 바로 쓸 수 있다.
- C 덤프(`analysis/decomp/*.c`)와 INDEX.tsv는 이전이 끝날 때까지 그대로 둔다.

### 13.8 웹 코드 연결 (1회, 자동)
웹 전체를 미리 대조하지 않는다. 기계적으로 이어지는 것만 스크립트로 잇고 끝낸다.

```
node web/ghidra/tools/orig_scan.mjs --code web/script            # 보고서만 (web/ghidra/reports/orig_scan_<폴더>.md)
node web/ghidra/tools/orig_scan.mjs --code web/script --apply    # 선언 위에 /** @orig <모듈>:<주소> ref */ 추가
```

- 잇는 기준: ① 선언 주석의 원본 주소가 스냅샷의 함수 시작이고, 선언 이름이 원본 이름과 같거나 주석의 주소가 하나뿐인 함수 선언 ② 모듈 폴더(`mg####`) 안 클래스·메서드 이름이 원본 `클래스::메서드`와 하나만 일치.
- 주소 앞에 모듈 이름이 없으면 파일 경로의 모듈, 그 모듈에 없는 주소면 `main`에서 찾는다.
- 기존 주석·코드는 바꾸지 않는다. 이미 단 표시는 다시 달지 않으므로 여러 번 돌려도 된다.
- 보고서의 약한 연결(주소 여럿·이름 다름)·데이터 주소는 표시하지 않는다. 그 코드를 작업할 때 사람이 단다.
- 상수 차이 후보: 연결된 함수의 디컴파일 C(`analysis/decomp/INDEX.tsv`) 실수 상수 중 웹 파일에 없는 값. 참고용이다.
- 2026-10-11 실행: 파일 310, 표시 168곳(함수 155개), `tsc --noEmit` 통과.

### 13.9 이후: 작업하면서 맞추기
일괄 대조·충돌 정리·이전 기록 재생성은 하지 않는다. md 이전은 끝났고, 이후 Ghidra는 MCP로 직접 고친다(`migration/*.jsonl`·`first_setup.py`는 다시 쓰지 않는다).

새 포팅·수정으로 원본 함수를 만질 때 그 함수만:
1. MCP로 디컴파일과 이름·plate·태그를 읽는다. md에서 옮긴 plate는 낡았을 수 있으니 디컴파일이 기준이다.
2. `.ts`와 비교한다. 웹이 틀렸으면 웹을 고친다. 원본 사실을 새로 알았거나 plate가 틀렸으면 MCP로 Ghidra에 넣는다(이름·시그니처·구조체 필드·plate·`ST_*`).
3. 만진 선언의 `@orig`를 `full`/`partial`/`approx — 이유`로 바꾸거나 단다.
4. db 반영은 서버 런처가 바뀐 프로그램만 자동으로 내보낸다(§10.1).

- 이전 때 충돌로 남은 것(`migration/report.md`)도 그 함수를 만질 때 정한다.
- `migration/RECONCILE_PROMPT.md`는 모듈 단위 일괄 대조가 꼭 필요할 때를 위해 보관만 한다.
