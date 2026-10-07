# ui2d Alignment — mgmet 규칙 화면의 최종 열 좌표

## 1. 기능 개요와 보이는 동작

[판독] Alignment는 표시된 자식의 경계를 측정하고 한 축의 위치를 다시 쓴다. `RequestAlignment`의 기존 판독은 [mgmet_ruleconfig.md](mgmet_ruleconfig.md) §6.3을 참조한다. 이번 분석은 dirty bit를 소비하는 `FUN_71014138ac` — main @0x71014138ac부터 계산까지 연결한다.

[판독][데이터] `ali1`의 u32=2는 수평에서 오른쪽 정렬, f32=-75는 남은 자식 사이의 간격이다. 숨긴 열의 폭과 간격은 합산하지 않는다. 프리 플레이의 설명 열은 CPU 유무와 관계없이 같은 오른쪽 위치에 남고, CPU를 표시하면 설명 왼쪽에 붙는다. 플레이 버튼은 Alignment의 형제다.

[실행: 변환] 고정 크기·원점 가운데·자원 기본 변환에서 CPU=(136,-299), 설명=(507,-299), 플레이=(910,-386)이라는 root 좌표를 얻었다. CPU를 숨기면 설명과 플레이 좌표는 그대로다. 원본 게임 실행/캡처 대조는 수행하지 않았다.

## 2. 분석 대상·자료 위치

[데이터] 버전은 Super Mario Party Jamboree US v0, main NSO다. 새 파일의 경로는 `C:/dev/mpj/`를 기준으로 한다.

| 자료 | 위치·역할 [데이터] |
|---|---|
| 함수 목록 | `analysis/functions/main.nso.tsv`, `analysis/decomp/INDEX.tsv` |
| 갱신·계산 C | `analysis/decomp/ui2dalign_main.c`: 생성/복사, dirty reader, 수평/수직 양 방향, 수평 측정 |
| 측정 보조 C | `ui2dalign_more.c`: 사용자 플래그·자식 경계·변환; `ui2dalign_vertical.c`: 수직 측정; `ui2dalign_order.c`: 목록 삽입과 수직 자식 경계 |
| 기존 C 재사용 | `mgmet_main_alignment.c`: RequestAlignment; `mgmcommon_main_guilayout_all.c`: 레이아웃 관련 기존 함수 |
| 기존 변환 데이터 재사용 | `analysis/mgmet_layout/mgmet_base_rule_00.bflyt.json`, `mgmet_rule_option_00/01.bflyt.json`; old 문서 §7.1의 입력 값 |
| 계산 결과 | `analysis/ui2dalign_evidence.json` |
| 검증 도구·보고서 | `web/tools/analysis/mgm01_verify_stage3.py`, `analysis/mgm01_validation.json` |

[판독] main의 이름 없는 함수는 원래의 `FUN_…` 표기를 유지한다. 아래 `extent`, `bias`, `gap`은 C의 측정 결과를 설명하기 위한 변수명이다. SDK enum 이름을 새로 붙이지 않았다. 이번 Alignment 판독에는 어셈블리를 사용하지 않았다.

## 3. 진입점과 호출 흐름

| 순서 | 함수·모듈 주소 [판독] | 처리 |
|---|---|---|
| 자원 생성 | `FUN_71014137b8` — main @0x71014137b8 | ali1 kind/gap/stretch/axis를 객체에 복사, dirty 설정 |
| 복사 | `FUN_7101413828` — main @0x7101413828 | Alignment 전용 필드 복사 |
| 요청 | `nn::ui2d::Alignment::RequestAlignment` — main @0x7101413818 | 기존 문서 §6.3 참조 |
| 갱신 | `FUN_71014138ac` — main @0x71014138ac | dirty 소비 → `FUN_71013fefa0` 변환 준비 → 축/kind 분기 → `FUN_71013fdfd0` 및 후속 가상 호출 |
| 수평 start/center | `FUN_7101413960` — main @0x7101413960 | 앞에서 뒤로 배치, center면 총폭 보정 |
| 수평 end | `FUN_7101414320` — main @0x7101414320 | 뒤에서 앞으로 배치 |
| 수직 start/center | `FUN_71014144c0` — main @0x71014144c0 | 위에서 아래로 배치, center면 총높이 보정 |
| 수직 end | `FUN_7101414e90` — main @0x7101414e90 | 아래에서 위로 배치 |
| 수평/수직 측정 | `FUN_7101413c10` / `FUN_7101414770` — main @0x7101413c10 / main @0x7101414770 | visible/ignore 검사, extent/gap/bias/대상 포인터 반환 |
| 자식 경계 | `FUN_7101415720` / `FUN_7101415e70` — main @0x7101415720 / main @0x7101415e70 | 필요한 타입/플래그에서 후손 경계를 합산 |

[판독] 자식 연결 노드는 Pane+8이며 첫 포인터가 이전, 둘째가 다음이다. sentinel은 부모 Pane+0x20, 그 다음 링크(부모+0x28)가 첫 자식이다. `nn::ui2d::Pane::PrependChild` — main @0x71013fd854는 이 첫 자식 앞에 삽입한다. `InsertChild` — main @0x71013fd824도 같은 연결 구조를 사용한다. 따라서 start/center는 `+0x28 → node[1]`, end는 `+0x20 → node[0]`를 따라간다. 이를 자원 자식 순서가 뒤집혔다고 해석할 필요는 없다.

## 4. 구조체·필드·상수 표

| Alignment 상대 오프셋 | 형·초기화 [판독] | writer | reader |
|---|---|---|---|
| +0x20/+0x28 | 이전/다음 자식 목록 sentinel | Pane 삽입/제거 | 네 계산 함수 |
| +0x30/+0x34 | f32 translate x/y, 기존 Pane 값 | 수평/수직 계산 | 이후 변환/그리기 |
| +0x50/+0x54 | f32 width/height, 기존 Pane 값 | 자원·크기 setter | 배치 경계, stretch 잔여 크기 |
| +0x58 bit0 | visible | visibility setter | 측정·center 보정 |
| +0x58 bit4 | 변환 dirty | 계산 때 OR 0x10 | 후속 Pane 변환 갱신 |
| +0x5b | 원점 비트, 가로 하위2/세로 다음2 | 자원 초기화 | 측정, stretch 크기 보정 |
| +0xd4 | u32 kind ← ali1 본문+0x54 | `FUN_71014137b8`/복사 | kind<2/==1/==2 분기 |
| +0xd8 | f32 기본 gap ← 본문+0x58 | 생성/복사 | 측정 결과 gap |
| +0xdc | byte stretch ← 본문+0x5c | 생성/복사 | 끝 자식의 크기 재분배 |
| +0xdd bit0 | 계산 요청, 생성 시 1 | 생성/요청 | 갱신이 검사하고 먼저 0으로 지움 |
| +0xdd bit1 | 축 ← 본문+0x5d bit0 | 생성/복사 | 0 수평 / 1 수직 |

| kind | 가로/세로 의미 [판독] | 기준점·순회 |
|---|---|---|
| 0 | left / top | -W/2 / +H/2에서 자식 순서대로 |
| 1 | center | 0에서 순서대로 놓고 총길이의 절반 보정 |
| 2 | right / bottom | +W/2 / -H/2에서 자식 역순으로 |
| ≥3 | 계산 분기 자체는 end로 들어감 | 유효한 SDK enum인지 [미확정]; stretch는 ==2 검사도 있음 |

[판독] 측정 출력은 f32 extent(+0), gap(+4), bias(+8), Pane 포인터(+0x10)이다. 고정 폭 가운데 원점의 무회전/배율1 자식은 extent=폭, bias=0으로 환원된다. 일반 변환에서는 저장 width만 더하면 안 된다.

## 5. 상태 전이와 수명

| 상태 | 진입·매 갱신 [판독] | 전이 |
|---|---|---|
| dirty | 생성 또는 RequestAlignment | 다음 `FUN_71014138ac`에서 bit0을 지우고 계산 |
| 계산 중 | 부모 변환 준비, 자식 측정·위치 변경 | 자식 transform dirty 설정, 후속 Pane 갱신 |
| clean | bit0=0 | Alignment 전용 배치 생략, 일반 Pane 갱신은 진행 |
| 다시 dirty | 표시 열/값을 바꾼 호출자가 요청 | 다음 UI 갱신에서 현재 visible 집합으로 다시 계산 |

[판독] visibility 변경만으로 이 함수가 즉시 호출되는 것은 아니다. mgmet의 요청 순서는 기존 [mgmet_ruleconfig.md](mgmet_ruleconfig.md) §3·5·6.3 참조다. 숨긴 자식은 이전 위치를 보유하지만 이번 배치의 폭·간격에 참여하지 않는다.

## 6. 계산식·조건·의사코드

### 6.1 측정과 숨김·간격

| 조건 | 결과 [판독] | 근거 main 주소 |
|---|---|---|
| alignment ignore 플래그 | 측정 false, 배치 제외 | `FUN_71013ffa48` main @0x71013ffa48 |
| visible bit0=0 | 측정 false, 배치 제외 | main @0x7101413c10 / main @0x7101414770 |
| own gap 플래그 | 기본 gap 대신 확장 데이터의 f32 사용 | `FUN_71013ffaac` main @0x71013ffaac, `FUN_71013ffb74` main @0x71013ffb74 |
| aggregate 플래그 | 자식 경계 재귀 합산 | `FUN_71013ffb10` main @0x71013ffb10, main @0x7101415720 / main @0x7101415e70 |
| 후손 합산 경계 없음/길이0 | 합산 경로는 false | 수평/수직 측정 함수 |
| 일반 경계 | 원점·변환을 적용한 축 투영 경계 | `FUN_71014150e0` main @0x71014150e0, `FUN_71014155b0` main @0x71014155b0 |

[판독] 플래그 조회는 Pane+0x60 bit2와 +0xa8 확장 사용자 데이터의 type 0x15를 검사한다. 플래그 byte의 bit0=own gap, bit1=ignore, bit2=aggregate다. 같은 이름의 JSON userData raw에 이 byte를 직접 대입해서는 안 된다. 타입에 따라 자동으로 후손 합산 또는 vt+0x168 경계를 사용하는 분기도 있다. 해당 RTTI 무명 데이터의 SDK 타입명은 §11에 남긴다.

[판독] 첫 **측정 성공 자식**의 gap은 0으로 취급한다. 그 다음부터 현재 배치하는 자식의 gap을 더한다. end 정렬에서는 자식 역순으로 순회하므로 gap의 소유자도 그 역순의 현재 자식이다. 모든 gap이 -75인 mgmet에서는 이 방향 차이로 결과가 달라지지 않는다.

### 6.2 고정 크기 의사코드

[판독] 다음은 네 계산 함수의 stretch=0 경로를 합친 의사코드다. `measure`는 위 표의 조건과 변환된 경계를 반환한다. 의사코드는 원본 SDK 코드가 아니다.

```text
axisSize = horizontal ? parent.width : parent.height
ordered = kind < 2 ? children : reverse(children)
direction = (horizontal ? +1 : -1) * (kind < 2 ? +1 : -1)
cursor = kind == 1 ? 0 : -direction * axisSize / 2
total = 0; first = true
for child in ordered:
    result = measure(child)
    if result.failed: continue
    g = first ? 0 : result.gap
    cursor += direction * g
    child.axisTranslation = cursor + direction*result.extent/2 - result.bias
    child.transformDirty = true
    cursor += direction * result.extent
    total += g + result.extent
    first = false
if kind == 1:
    for visible, nonignored child:
        child.axisTranslation -= direction * total/2
```

[판독] center의 두 번째 순회는 visible/ignore를 다시 검사하지만 측정 성공 여부를 저장해 다시 검사하지는 않는다. 후손 경계가 비어 처음 측정에 실패한 visible 자식도 이 보정에 들어갈 수 있다. 웹에서 이 예외를 일반적인 필터 배열 한 번으로 지우지 않는다.

### 6.3 stretch=1 경로

[판독] 처음 배치에서 지정된 물리적 끝 자식의 extent/bias를 0으로 만든 뒤 고정 크기 경로와 같은 방식으로 합계를 얻는다. left/top은 마지막 자식, right/bottom은 첫 자식, center는 양 끝을 대상으로 검사한다. 이후 `remaining = axisSize - total`을 계산한다.

| kind | 최종 크기 writer [판독] | 원점 가운데일 때 위치 추가 보정 |
|---|---|---|
| 0 | 순회에서 마지막으로 측정 성공한 자식의 크기=remaining | 가로 +remaining/2, 세로 -remaining/2 |
| 1 | 처음·마지막 측정 성공 자식의 크기=remaining/2 | 가로 처음 +remaining/4·마지막 -remaining/4; 세로 부호 반대 |
| 2 | 역순에서 마지막으로 측정 성공한 자식의 크기=remaining | 가로 -remaining/2, 세로 +remaining/2 |

[판독] 가로 원점이 왼쪽/오른쪽이면 위 절반 보정 대신 0 또는 remaining 전체를 쓰며, 세로도 원점 비트에 따라 보정량을 고른다. 남은 크기에 clamp는 없다. 물리적 끝 자식이 숨겨진 경우 “0으로 측정할 대상”과 “마지막 성공 자식”이 다를 수 있다. 성공 자식이 전혀 없는 stretch 입력은 마지막 포인터가 0으로 남는 코드 경로가 있어 정상 입력이라는 보장을 별도로 확인해야 한다. mgmet의 +0xdc는 0이므로 이번 최종 좌표 계산에 이 경로는 들어가지 않는다.

### 6.4 mgmet 프리 플레이 최종 좌표

[데이터] 입력은 기존 문서 §7.1에서 확보한 자원이다. parent root=1920×1080, `null_00`=(0,-299), `A_alignment_00`=(-22,0), width=1504, height=218, kind=2, gap=-75, stretch=0, horizontal이다. CPU=`x_rule_03`, 설명=`x_rule_04`; 둘의 폭446·원점 가운데·회전0·배율1을 사용한다. `x_play_00`은 형제이며 저장 위치=(910,-87)이다.

| 표시 조합 | 배치 순회 | 계산 [판독][데이터] | Alignment 로컬 | root 좌표 [실행: 변환] |
|---|---|---|---|---|
| CPU·설명·플레이 | 설명 → CPU | right=752; 설명 x=752−223 | 설명 (529,0) | 설명 (507,-299) |
| 동일 | 설명 다음 CPU | right=752−446−(-75)=381; CPU x=381−223 | CPU (158,0) | CPU (136,-299) |
| 동일 | 플레이는 별도 형제 | (910,-87)+(0,-299) | Alignment 대상 아님 | 플레이 (910,-386) |
| 설명·플레이 | 설명만 | 첫 gap=0; x=752−223 | 설명 (529,0) | 설명 (507,-299) |
| 동일 | CPU hidden | 폭·gap·위치 writer에서 제외 | CPU 이전 위치는 유지 | 표시 좌표 없음 |
| 동일 | 플레이는 별도 형제 | 같은 형제 변환 | Alignment 대상 아님 | 플레이 (910,-386) |

[실행: 변환] 1920×1080에서 root 원점을 화면 중앙으로 바꾸면 CPU 중심=(1096,839), 설명=(1467,839), 플레이=(1870,926)이다. y는 화면 아래 방향으로 뒤집었다. 이는 열/버튼 부모의 기준점이며 내부 그림·텍스트의 중심이나 클릭 영역을 뜻하지 않는다.

[실행: 변환] 새 계산식에 기존 전체 열의 폭 `[470,446,446,446,446,366]`을 넣으면 `x_rule_00..05`의 x가 `[-1258,-875,-504,-133,238,569]`로 나온다. 기존 자원의 저장 위치와 일치한다. 열 일부만 남길 때 이 저장 위치를 그대로 쓰는 방식은 새 계산 결과와 다르다.

## 7. 애니·소리·레이아웃·메시지 연결

[판독] Alignment 함수 자체에는 SE·BGM·메시지·UI 애니 재생이 없다. mgmet의 버튼 값/애니와 요청 시점은 [mgmet_ruleconfig.md](mgmet_ruleconfig.md) §6.2·7.2·7.3을 참조한다. `SetupBaseBg`의 폭/배경 식도 기존 §6.3에 유지한다.

[판독] Alignment 계산 뒤의 자식 위치를 배경 식의 P에 공급해야 한다. 저장 x=-133/238을 CPU/설명의 최종 P로 사용하는 것은 이번 visible 집합과 맞지 않는다. [미확정] 배경 폭 계산과 UI 갱신의 정확한 같은 프레임 순서는 original capture 또는 parent update 호출 순서가 더 필요하다.

## 8. 다른 기능과의 상호작용·저장되는 값

| 데이터 | writer → reader [판독] | 수명 |
|---|---|---|
| Alignment dirty/axis | 요청·생성 → main 갱신 | UI 객체 내부 |
| 자식 visible | RuleConfigView 구성 → 측정 | 현재 화면 구성 |
| 자식 위치·stretch 크기 | 계산 → Pane transform/그리기 | UI 객체 내부; 숨김 때 이전 값 유지 |
| CPU·설명 규칙 값 | 기존 mgmet Work/Sync 계약 → 표시 여부·버튼 | 기존 문서 §8 참조 |

[판독] Alignment 계산은 Work/Sync/세이브 writer가 아니다. CPU 난이도·설명 index 캐시, 시작/취소 commit은 기존 분석을 다시 정의하지 않는다.

## 9. 웹 포팅 구조 — 제안, 코드 없음

[추정][웹 이름] [mgm_common.md](mgm_common.md) §9의 독립 의존 원칙을 따른다. `alignment.ts`는 레이아웃 데이터·현재 visible 집합·측정 경계를 받아 위치 결과를 반환하는 공용 shell 계산 부품으로 제안한다. 공용 레이아웃 변환은 charselect의 `scene2d/render2d` 계약을 사용하고 게임 런타임 import는 넣지 않는다.

| 책임 [추정][웹 이름] | 입력 → 결과 |
|---|---|
| `alignment.ts` | axis/kind/gap/stretch, 자식 순서·bounds·origin → 위치/크기 변경 |
| 규칙 화면 어댑터 | visible 변경 후 dirty 요청, 갱신 때 결과 적용 |
| 공용 layout renderer | 부모/자식 변환·그리기, 계산 알고리즘과 분리 |

[추정] 첫 구현은 이번에 쓰는 fixed size 경로를 보존하되, API에는 변환된 bounds와 bias를 넣는다. 모든 Parts의 측정 폭을 저장 width로 영구 대체하지 않는다. `core/games/view/game.ts/env.ts` 의존 금지와 `three`, 같은 shell 모듈, charselect 공용 state/types/RepeatGen 허용 경계는 기존 §9와 같다.

## 10. 검증 방법·실행 결과

[실행: 변환] `C:/dev/mpj/.venv/Scripts/python.exe web/tools/analysis/mgm01_verify_stage3.py`는 다음을 검사하며 결과를 `analysis/ui2dalign_evidence.json`과 `mgm01_validation.json`에 쓴다.

| 검사 | 결과 [실행: 변환] |
|---|---|
| 가로·세로 × kind0/1/2 | 6가지 위치 fixture 통과 |
| 숨김 자식 폭999 | 합계·간격에서 제외 |
| own gap·bias | child gap5와 bias3 적용, 순회 방향별 기대 좌표 일치 |
| 전체 여섯 열 | 새 식의 결과가 기존 저장 x와 일치 |
| CPU 있음/없음 | §6.4 좌표 일치, 설명/플레이 고정 |
| 문서/원본 보호 | 11절, 근거 태그, baseline906개 파일의 웹 소스·에셋 무변경; 기존 문서 추가 줄 제거 시 원래 hash 복구 |

[데이터] Alignment 계열 신규 C는 `ui2dalign_main.c` 중10개, `ui2dalign_more.c` 7개, `ui2dalign_vertical.c` 1개, `ui2dalign_order.c` 3개, 합계21개다. main 파일에 함께 있는 PlayerWork/Normalize 6개는 `mgm01_freeplay.md` §8의 근거다. 기존 함수와 module/address가 같은 중복 C는 새 집계에서 제외하고 기존 파일을 참조했다.

[미확정] 이 검증은 원본 binary를 실행한 결과가 아니다. 애니에 의해 변한 bounds, 현재 부모 SRT, renderer 스케일, 원본 화면 픽셀은 검증 대상에 포함하지 않았다.

## 11. 미확정 사항과 필요한 근거

| 우선순위·항목 [미확정] | 현재 확정 범위 | 필요한 구체적 근거 |
|---|---|---|
| 1. 원본 최종 프레임 | 고정 자원 변환에서 §6.4 좌표 계산 | CPU 있음/없음 상태의 Alignment 직후 Pane translate·bounds·parent matrix와 캡처 |
| 2. 무명 RTTI 타입과 복합 Parts 경계 | 측정 함수의 RTTI/aggregate/vt+0x168 분기 판독 | main `PTR_DAT_7101a937a0`, `PTR_DAT_7101a85068`의 실제 TypeInfo 등록/해당 vtable GetBounds; 텍스트·Parts 변화 fixture |
| 3. 배경 계산과 갱신 순서 | dirty 요청과 위치 writer, 기존 SetupBaseBg 식 연결 | UI root Update 호출 순서와 `SetupBaseBg`가 읽는 프레임의 위치 |
| 4. stretch 비정상 입력 | 음수 remaining, 숨긴 끝·성공 자식0 경로 존재 | stretch ali1 자원 목록 및 caller의 nonempty/visible 보장; kind≥3 실제 사용 여부 |

[판독] 기존 mgmet §11의 kind2/-75 의미, hidden child 처리, fixed size 최종 열 계산은 이 문서 §3~6으로 보충한다. 원본 화면 대조 항목은 계속 남긴다.
