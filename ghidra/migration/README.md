# 기존 MD 분석 → Ghidra 이전 기록

`web/docs/**` 분석 MD에 있는 함수·구조체 지식을 Ghidra로 옮기기 위한 중간 기록이다. 에이전트는 MD를 읽고 **이 폴더에 기록만** 쓴다. db·Ghidra는 `tools/migrate.py`가 바꾼다.

## 파일
- `<문서 경로를 _로 바꾼 이름>.jsonl` — 예: `engine_17_actor.jsonl`, `minigame_mg0108.jsonl`
- 한 줄에 기록 하나(JSON). UTF-8, LF.
- 같은 문서를 다시 이전하면 그 파일을 통째로 다시 쓴다.

## 함수 기록
md의 함수 단위 설명은 이전 뒤 정리한다. 그래서 문서에 적힌 그 함수의 사실을 Ghidra 주석에 항목별로 기록한다.

```json
{"fn":"main:71001e8b68","st":"ST_ANALYZED","sys":"SYS_SCENE","name":"GetGameRule","ns":"bq::GameWork",
 "sig":{"ret":"/int","params":[]},
 "plate":"[판독] 2026-10-11 / md: web/docs/engine/18_scene_work.md §4
역할: GameWork+0x0 의 게임 규칙 값을 int 로 돌려준다.
쓰는 필드: +0x0 gameRule(int)
호출자: MinigameScene::BeginScene 이 규칙 분기에 쓴다.",
 "comments":[{"a":"71001e8b6c","t":"eol","c":"+0x0 gameRule"}],
 "src":"web/docs/engine/18_scene_work.md §4"}
```

| 키 | 필수 | 내용 |
|---|---|---|
| `fn` | ✅ | 함수 ID `모듈:주소`(소문자 16진수, `0x` 없음). 모듈은 `main`, `mg0108`, `menu00` … |
| `st` | ✅ | `ST_ANALYZED`(모든 분기·호출·필드 확인, 함수 안 미확정 없음) / `ST_PARTIAL`(일부) / `ST_RECHECK`(문서끼리 모순) |
| `plate` | ✅ | 첫 줄 `[판독|추정|미확정] YYYY-MM-DD / md: <문서> §<절>`. 다음 줄부터 문서에 적힌 그 함수의 사실을 항목별로: 역할, 입력·출력, 분기 조건, 계산식과 상수 값, 읽고 쓰는 필드(오프셋·뜻), 호출하는 함수와 목적, 부수 효과, 미확정 사항. 줄마다 `항목: 내용`. 문서에 짧은 의사코드가 있으면 그대로 옮겨도 된다. 문서에서 `[추정]`·`[미확정]`인 항목은 줄 앞에 그 표시를 붙인다 |
| `src` | ✅ | 근거 문서와 절 |
| `sys` | main만 | `SYS_*` 하나(`web/ghidra/db/tags.json`). NRO 함수에는 쓰지 않는다 |
| `name`, `ns` | 선택 | **`FUN_…`처럼 이름 없는 함수**에만. 문서에서 `[판독]`으로 확정된 이름만. 원본 심볼이 있는 함수는 이름을 바꾸지 않는다 |
| `sig` | 선택 | `[판독]`으로 확정된 시그니처. `{"ret":"/타입","params":[["이름","/타입"],…],"cc":"__thiscall"?}`. 클래스 메서드의 `this`는 넣지 않는다(자동). 매개변수 이름만 알고 타입을 모르면 타입은 db 시그니처의 기존 타입을 쓴다 |
| `comments` | 선택 | 함수 안 특정 주소의 메모 `[{"a":"주소","t":"pre|eol","c":"내용"}]`. 문서가 `+0x…` 위치나 명령 주소로 설명한 분기·표 인덱스·상수 |

## 전역 데이터 기록
문서가 데이터 주소(표·테이블·전역 변수·문자열)를 설명하면:
```json
{"data":"main:71015d840c","name":"g_SceneNameTable","type":"/char *[7]","plate":"[판독] 2026-10-11 / md: web/docs/engine/18_scene_work.md §3
장면 ID 0~6 → 장면 이름 문자열 포인터","src":"web/docs/engine/18_scene_work.md §3"}
```
- `type`은 확정된 경우만(모르면 생략, 이름과 plate만 붙는다). 배열은 `/<요소 타입>[개수]`.

## 구조체 기록
```json
{"type":"/Demangler/bq/GameWork","kind":"struct","size":24,"fields":[{"o":0,"l":4,"t":"/int","n":"gameRule","c":"규칙"}],"st":"ST_PARTIAL","sys":"SYS_SCENE","note":"[판독] 2026-10-11 / md: web/docs/engine/18_scene_work.md §4","src":"web/docs/engine/18_scene_work.md §4"}
```

| 키 | 내용 |
|---|---|
| `type` | 타입 경로. db `types.jsonl`에 **같은 클래스가 어느 경로로든 있으면 그 경로**(`/Demangler/<네임스페이스>/<이름>`, `/<네임스페이스>/<이름>` 등)를 쓴다. 없을 때만 `config.json`의 `new_type_category` 아래(`/mpj/<네임스페이스>/<이름>`) |
| `module` | 타입을 넣을 모듈(기본 `main`). 클래스 메서드가 다른 모듈에 있으면 `migrate.py`가 그 소유 모듈로 보낸다(가이드 §5.8) |
| `kind` | `struct` · `union` · `enum` |
| `size` | 바이트 크기. 모르면 마지막 필드 끝까지 |
| `fields` | struct·union: `{o 오프셋(10진), l 길이, t 타입 경로, n 이름, c 설명?}`. enum: `"values":[["이름",값],…]` |
| `st`·`sys`·`note` | 설명(description)에 들어간다(§5.7) |

- 타입 경로 예: `/int`, `/uint`, `/float`, `/bool`, `/byte`, `/undefined8`, `/pointer`, `/int *`, `/byte[16]`, 다른 구조체 `/Demangler/bex/Foo *`.
- `[판독]`인 오프셋만 넣는다. `[추정]`·`[미확정]` 필드는 넣지 않고 note에 적는다.

## 규칙
- 확정 수준을 지킨다: 이름·시그니처·타입·필드는 `[판독]`만. `[추정]`·`[미확정]`은 plate·note 글로만(줄 앞에 표시).
- 지역 변수 이름은 이번 이전에서 넣지 않는다(디컴파일 변수와 짝짓기 필요). 문서에 나온 지역 변수 뜻은 plate에 적는다.
- 모듈이 문서에서 분명하지 않은 주소는 기록하지 않고 `<문서>.unresolved.txt`에 줄마다 `주소 · 이유`로 남긴다.
- 함수 ID가 스냅샷에 있는지 확인한다: `web/ghidra/db/<프로젝트 경로>/functions/*.tsv`에서 주소 검색.
- 같은 함수가 여러 문서에 나오면 각 문서가 각자 기록한다. 합칠 때 `migrate.py`가 상태는 강한 쪽(RECHECK > ANALYZED > PARTIAL), plate는 문서 링크를 모두 남긴다. 이름이 다르면 충돌로 보고하고 넣지 않는다.
- 다른 폴더는 고치지 않는다.
