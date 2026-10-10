# 디컴파일 가이드·체크리스트

분석 문서(부록 "Ghidra 추출 요청 표")에 남은 C 없는 함수를 뽑아 `analysis/decomp/*.c`에 넣고 `INDEX.tsv`에 등록하는 절차.

## 1. 도구·위치

| 항목 | 위치 |
|---|---|
| Ghidra | `c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat` (SwitchLoader 포함) |
| 스크립트 | `web/tools/analysis/ghidra_scripts/` |
| 원본 NRO | `extracted/romfs/nro/NX_Release/<모듈>.nro` (읽기만) |
| 함수 목록 | `analysis/functions/<모듈>.tsv` (address·size·name·signature) |
| C 출력 | `analysis/decomp/*.c` |
| 색인 | `analysis/decomp/INDEX.tsv` (address·name·file, LF) |

### 프로젝트별 프로그램
| 프로그램 | 프로젝트(`ghidra_work/<폴더> <이름>`) |
|---|---|
| main.nso | `core jamboree_main` (분석 완료본) |
| mgmet.nro | `mgmcommon g3` |
| mg0118·mg0906 | `mgA mgA` |
| mg0108·mg0110·mg0113·mg0116·mg0203·mgm02~06·mg1704 | `gap1010 gap1010` (2026-10-10 임포트) |
| bd01.nro | `gap1010bd gap1010bd` (2026-10-10 임포트) |
| menu00·menu01·matching00 | `online g3`/`g4` |

없는 NRO는 새 프로젝트로 `-import`(자동 분석)한다. `ERROR Failed to find .got section. (NRO0Adapter)`는 무시해도 된다.

## 2. 스크립트 선택

| 경우 | 스크립트 | 인자 |
|---|---|---|
| NRO 전체 | `DecompileAll.java` | `<출력 폴더>` → `<프로그램>.c` |
| 주소 목록(함수 안 주소면 그 함수) | `CharacterDecompAddr.java` | `<출력.c> <hex>...`, `ptr:<hex>:<n>`(vtable), `name:<전체 이름>` |
| 함수로 정의 안 된 주소 | `CharacterFtrgMissing.java` | `<출력.c> <hex>...` (임시로 함수 생성, `-readOnly`라 저장 안 됨) |
| 이름 패턴 | `DecompileNamed.java` | `<출력.c> <정규식~정규식> [깊이]` |
| 호출자 | `DecompileCallers.java` | `<출력.c> <정규식~...>` |
| 데이터 주소 참조 함수 | `SceneXrefDecomp.java` | `<출력.c> <주소~주소>` |

### 명령 형식
```sh
MSYS_NO_PATHCONV=1 c:/dev/mpj/tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat \
  c:/dev/mpj/ghidra_work/core jamboree_main -process main.nso -noanalysis -readOnly \
  -scriptPath c:/dev/mpj/web/tools/analysis/ghidra_scripts \
  -postScript CharacterDecompAddr.java c:/dev/mpj/analysis/decomp/<이름>.c <주소...> > <로그> 2>&1
```
새 NRO 임포트: `... <폴더> <프로젝트> -import <nro...> -scriptPath ... -postScript DecompileAll.java c:/dev/mpj/analysis/decomp`

## 3. 절차
1. 문서 부록 C(추출 요청 표)와 본문 "C 없음" 표기에서 모듈·주소를 모은다. 외부 import stub(size 1 external, 예 `0x7101eff000`)은 제외한다.
2. 이미 있는지 확인한다: `INDEX.tsv` 주소 검색, `ghidra_work/*/out/*.c` 머리줄 검색.
3. 함수 경계를 `analysis/functions/<모듈>.tsv`로 본다. 목록에 없는 주소는 바로 앞 함수 `address+size`와 이어지는지 확인한 뒤 `CharacterFtrgMissing`으로 뽑는다.
4. 함수가 수십 개 이상인 작은 NRO(미니게임·모드)는 전체(`DecompileAll`), 큰 모듈(main·bd01)은 주소만 뽑는다.
5. 출력을 확인한다: `// ==== ` 머리줄 수 = 요청 수, `no function at`·`decompile failed` 없음.
6. `CharacterFtrgMissing`로 만든 함수는 머리줄 끝에 ` (created)`를 붙인다(기존 관례).
7. `INDEX.tsv`에 새 파일 행만 덧붙인다(`address\tname\tfile`, 주소 소문자, `0x` 없음, LF). 전체 재생성(`decomp_index.py`)은 순서가 바뀌므로 쓰지 않는다.
8. 분석 문서는 고치지 않는다. 보고에 파일명·함수 수·실패 주소를 적는다.

## 4. 체크리스트
- [ ] 요청 주소 수와 출력 머리줄 수가 같다
- [ ] `no function at` / `decompile failed` 0
- [ ] created 함수 표기
- [ ] INDEX 새 행 수 = 새 머리줄 수, 중복 없음
- [ ] 원본·extracted 쓰기 없음, 키 출력 없음, git add/commit 없음
- [ ] 분석 문서 무수정

## 5. 2026-10-10 추출 현황
| 파일 | 내용 | 상태 |
|---|---|---|
| `docs_gap_main.c` | main 85함수(18_scene_work 38·mgm_modes 14·12_online_sync §9 R1~R15·20_camera 12+BakedFloat 3·render_unify Q1~Q3), created 5 | 완료, INDEX 등록 |
| `motion_gap_mg0906.c` | mg0906 람다 `710002968c` (created) | 완료, INDEX 등록 |
| `mgm_modes_mgmet.c` | mgmet 4함수 | 완료, INDEX 등록 |
| `mgm_modes_bd01.c` | bd01 16함수 | 완료, INDEX 등록 |
| `mg0108.nro.c`·`mg0110.nro.c` | 전체 | 완료, INDEX 등록 |
| `mg0113`·`mg0116`·`mg0203`·`mgm02~06`·`mg1704` `.nro.c` | 전체 | 완료, INDEX 등록 |

남은 일: 실행 끝난 파일 확인(3단계 5) → INDEX 덧붙이기(아래 명령).
```sh
cd c:/dev/mpj/analysis/decomp && for f in docs_gap_main.c motion_gap_mg0906.c mgm_modes_mgmet.c mgm_modes_bd01.c mg0108.nro.c mg0110.nro.c mg0113.nro.c mg0116.nro.c mg0203.nro.c mgm02.nro.c mgm03.nro.c mgm04.nro.c mgm05.nro.c mgm06.nro.c mg1704.nro.c; do
  grep -q "	$f\$" INDEX.tsv || sed -n "s/^\/\/ ==== \([0-9a-fA-F]*\) \(.*\)\$/\1	\2	$f/p" $f >> INDEX.tsv; done
```

남은 실패: mg0113 `7100012ff0 mg0113::GameMgr::PenguinMove` — 60초·120초 모두 디컴파일 시간 초과. 머리줄은 `mg0113.nro.c`·INDEX에 있으나 본문 없음. 더 긴 제한(예 600초)으로 재시도하거나 어셈블리로 읽는다.
