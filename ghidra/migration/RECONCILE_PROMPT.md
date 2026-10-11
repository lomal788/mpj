# 웹 코드 대조 지시문 (가이드 §13.8)

`{MODULE}`·`{CODE}`만 바꿔 쓴다.

---

웹 구현과 Ghidra 지식을 원본 디컴파일 기준으로 맞춘다. **판정 기준은 디컴파일 C**다. md(=지금 Ghidra에 들어간 내용)와 웹 코드가 다르면 어느 쪽도 그대로 이기지 않는다.

## 입력
- 모듈: `{MODULE}` (예: `mg1801`). 이 모듈이 부르는 main 함수도 범위에 넣는다.
- 웹 코드: `{CODE}` 아래 `.ts` (원본 주소 참조·주석·상수·계산식)
- Ghidra 지식(스냅샷): `C:/dev/mpj/web/ghidra/db/` — `romfs/nro/NX_Release/{MODULE}.nro/`, `exefs/main.nso/`
  - `functions/*.tsv`: `addr size name namespace namesrc sigsrc thunk tags signature`
  - `comments/*.jsonl`: 함수별 plate 주석(지금까지 이전된 판독 내용)
  - `types.jsonl`: 구조체·enum
- 이전 기록: `C:/dev/mpj/web/ghidra/migration/*.jsonl`(형식은 같은 폴더 `README.md`), 이 모듈 것: `minigame_{MODULE}.jsonl` 등
- 디컴파일 C: `C:/dev/mpj/analysis/decomp/INDEX.tsv`(주소 → 함수 → 파일)로 찾는다. 필요한 함수 C가 없으면 차이 목록에 "C 없음"으로 적고 판정을 미룬다.

## 출력 (이것만 만든다/고친다)
1. **추가 기록** `C:/dev/mpj/web/ghidra/migration/web_{MODULE}.jsonl` — README 형식.
   - 웹 코드에만 있고 Ghidra(plate·타입)에 없는 원본 사실: 상수 값, 계산식, 분기 조건, 필드 오프셋·뜻, 시그니처, 함수 안 위치 메모.
   - **디컴파일 C로 확인한 것만** `[판독]`. 확인 못 한 것은 `[추정]`이고 줄 앞에 `웹 구현 근거:`를 붙인다.
   - plate 첫 줄: `[판독|추정|미확정] 2026-10-11 / web: <파일>:<줄>` (문서 대신 웹 위치).
   - `src`: `web/script/...:<줄>`.
   - Ghidra에 이미 같은 사실이 있으면 쓰지 않는다.
   - 웹이 원본과 다르게 근사한 함수는 plate에 `웹 근사: <무엇을 왜>` 줄을 넣는다.
   - 문서(Ghidra)가 낡았다고 판정한 함수는 `st: ST_RECHECK`, plate에 `정정: <무엇이 틀렸고 C에서는 무엇인지>`.
2. **차이 목록** `C:/dev/mpj/web/ghidra/migration/web_{MODULE}.diff.md` — 표 한 줄에 하나:
   `함수 ID | 항목 | Ghidra(이전된 내용) | 웹 동작(파일:줄) | 디컴파일 C 판정 | 결론`
   - 결론은 `웹 오류`(웹을 고쳐야 함) / `문서 낡음`(Ghidra를 고침) / `의도한 근사` / `C 없음·판정 보류` 중 하나.
   - 차이가 없으면 표에 넣지 않는다. 맨 위에 요약(대조한 함수 수, 결론별 수)을 쓴다.
3. **코드 표시** — `{CODE}`의 `.ts`에 `@orig`만 단다(가이드 §6).
   - 형식: 선언(함수·메서드·클래스·상수) 바로 위 JSDoc에 `@orig <모듈>:<주소> <full|partial|approx> [— 메모]`. 기존 JSDoc이 있으면 그 블록에 줄을 더하고, 없으면 `/** @orig … */` 한 줄을 선언 위에 넣는다.
   - 여러 원본을 합친 선언은 표시 여러 줄, 한 원본이 여러 선언에 나뉘면 조각마다 같은 주소·같은 수준 + 메모로 맡은 부분.
   - 수준은 같은 주소 표시가 붙은 웹 선언 전체가 그 원본을 얼마나 옮겼는지. `approx`는 메모에 이유 필수.
   - **기존 주석·코드는 한 글자도 지우거나 바꾸지 않는다.** 표시 줄만 추가한다. 줄바꿈 형식(LF/CRLF)은 파일 그대로.
   - 다 단 뒤 `C:/dev/mpj/web` 에서 `npx tsc --noEmit` 이 통과해야 한다.

## 하지 않는 것
- 코드 동작 수정(웹 오류는 차이 목록에만 적는다), db·Ghidra 직접 수정, git add/commit, 다른 모듈 파일 수정.

## 보고 (한국어, 짧게)
대조한 원본 함수 수, 추가 기록 수(판독/추정), 차이 목록 결론별 수, `@orig` 단 선언 수(full/partial/approx), tsc 결과, 판정이 어려웠던 사례 3개 이내.
