# 02. 코드 모듈과 심볼

## 1. 실행 파일 구성 [데이터]

| 파일 | 형식 | 크기 | 비고 |
|---|---|---|---|
| `extracted/exefs/main` | NSO (LZ4 세그먼트) | 15,934,795 | 압축 해제 이미지 0x1BFB4B0. 빌드 경로 `D:\bq\bq\Programs\Outputs\NX-NXFP2-a64\bq\Release\bq.nss` |
| `extracted/exefs/sdk` | NSO | 5,891,087 | Nintendo SDK |
| `extracted/exefs/subsdk0` | NSO | 3,410,237 | **[미확정]** 내용 |
| `extracted/exefs/rtld` | NSO | 8,180 | 런타임 링커 |
| `romfs/nro/NX_Release/*.nro` | NRO | 139개 | 장면·모드별 동적 모듈. 등록 목록 `.nrr/bq_Release.nrr` |

내부 코드명은 **bq**다 (빌드 경로, `bq::` 네임스페이스, `bq.nx.*.bea`).

### NRO 모듈 분류 [데이터 + 이름 근거 추정]

| 접두 | 개수 | 대응 (메시지 키·문구 근거) |
|---|---|---|
| `mg####` | 112 | 미니게임. 이름은 [minigame_catalog.tsv](../analysis/minigame_catalog.tsv) **[데이터]** |
| `bd01` | 1 | 보드 게임 본체 (8.2MB, 가장 큼). 보드 7종 데이터는 `bd~bd0#` BEA **[추정]** |
| `kb01`, `kbet` | 2 | 쿠파 버스터즈 (`im_mode01_name`, `mn01_mode_mw_explain_kb01`) **[추정]** |
| `ca01`, `caet` | 2 | 미니게임 순위로 칸을 전진하는 모드 — 쿠파 애슬론 **[추정]** |
| `rc_stage01` | 1 | 리듬 쿠킹 (`im_rc`, `rc_stage01` 사운드) **[추정]** |
| `mf01` | 1 | 협력해서 공을 골인 지점까지 옮기는 모드 **[추정]**, 정식 이름 **[미확정]** |
| `pp01`, `pp03`, `pp04`, `ppet` | 4 | extra/ppet 영상과 연결. 모드 이름 **[미확정]** |
| `mgm01`~`mgm06`, `mgmet`, `mgmrs`, `mgInst` | 9 | 미니게임 모드 계열 (`mgm0#.msbt`) **[추정]** |
| `menu00`, `menu01` | 2 | 메뉴 |
| `op`, `ed`, `boot`, `matching00` | 4 | 오프닝·엔딩·부트·매칭 흐름 (`flow~*` BEA) |
| `gyroPadChange` | 1 | 컨트롤러 변경 |

`*et` 접미 모듈의 의미는 **[미확정]**.

## 2. 심볼 [데이터 + 실행]

NRO는 main의 export를 이름으로 링크한다. 그래서 main과 NRO 양쪽의 동적 심볼 테이블에 **C++ 맹글링 이름이 남아 있다**.

- main: 맹글링 심볼 문자열 8,065개. 네임스페이스 빈도는 `nn` 2,878, `bq` 1,813, `ca` 1,039, `bex` 779, `actor` 418, `sb` 356, `wl` 134.
- mg0101.nro: 맹글링 문자열 1,285개. Ghidra 분석 후 함수 1,386개 중 1,170개(84%)에 이름이 붙었다.
- 클래스 단위로 이름이 살아 있다. mg0101 예: `MapMgr` 40, `PlayerMgr` 33, `ComPlayer` 32, `Scene` 30, `ComNaviGrid` 26, `ComAI` 25, `BarNPC` 23, `NPCMgr` 22, `CameraMgr` 21, `ComRankMgr` 19 (함수 수).
- 엔진 계층 **[추정 — 이름 근거]**:
  - `nn::bezel::*`: Nintendo Bezel Engine (Entity, HandlePtr, ComScript, AnimationNode 등)
  - `bex::*`: 엔진 확장 (MainModule, ComponentMultiSequence, PlayerID)
  - `bq::*`: 게임 공용 (PlayerWork, SingletonTemplate)
  - `mg####::*`: 미니게임별 로직

### 미들웨어 [데이터]

| 라이브러리 | 근거 |
|---|---|
| PhysX 4.1.2 | main 문자열 `PhysX-4_1_2-release`, `Px*` 타입 138종. `.apx` 헤더 `SEBD` ver 0x04010200, 플랫폼 태그 `NX64` |
| Lua | `lua_pushfstring`, `luaopen_` 등. `ScriptDedicatedMemorySize`. 실제 스크립트 에셋 위치는 **[미확정]** |

## 3. 시간 API 사용 [판독]

mg0101의 타이머는 프레임 카운트가 아니라 `bex::MainModule::GetDeltaTime()`(main export)를 뺀다. 예: `mg0101::BarNPC::UpdateWait(float&)` @ `0x71000197A0` (mg0101.nro 로드 기준 주소).

```c
if (0.0 < *t) {
  dt = bex::MainModule::GetDeltaTime();
  *t = *t - dt;
  if (*t <= 0.0) { Idle(this); return; }
}
```

mg0101에서 `GetDeltaTime` 10회, `GetFrameCount` 2회 사용. `GetDeltaTime`은 프레임 시작 때 `g_FrameStep.delta`를 복사한 값이다. 오프라인 보통 장면에서는 실측 프레임 시간(최대 0.05 s, 한 프레임 늦음)이고, 리듬·온라인 장면에서는 고정 f32(1/60)이다 **[판독]**. 근거는 [web/docs/engine/01_core.md](../web/docs/engine/01_core.md).

## 4. Ghidra 환경

| 항목 | 값 |
|---|---|
| Ghidra | `tools/ghidra_12.1.2_PUBLIC` (JDK 21) |
| 로더 | SwitchLoader 1.6.1 (Ghidra 12.1.2 빌드) — NSO/NRO 직접 로드, 동적 심볼 적용 |
| NRO 프로젝트 | `ghidra_proj/jamboree` (mg0101), `ghidra_proj/g0`~`g4` (나머지 138개, 크기 균형 5분할 — `ghidra_proj/group#.txt`) |
| main 프로젝트 | `ghidra_proj_main/jamboree_main` (`main.nso`) |
| 함수 목록 | `analysis/functions/<모듈>.nro.tsv`, `main.nso.tsv` (address, size, name, signature) — NRO 139개 + main 전부 완료. main은 63,952개 중 이름 있는 것 9,058개(export 심볼만) |
| 디컴파일 덤프 | `analysis/decomp/<모듈>.c` — 함수마다 `// ==== <주소> <이름>` 머리줄 |
| 스크립트 | `ExportFunctions.java`(함수 목록), `DecompileAll.java`(모듈 전체), `DecompileNamed.java`(이름 패턴 + 피호출 깊이), `DecompileCallers.java`(호출자) — `tools/ghidra_scripts/` |
| 보조 도구 | `tools/nro.py`(NRO 동적 심볼·static 표 읽기), `tools/fn.py`(덤프에서 함수 뽑기) |

`DecompileNamed`·`DecompileCallers`의 패턴은 `~`로 여러 개를 잇는다(예 `"ca::rm::~bex::RandModule::"`). cmd가 `| ; , ^`를 해석하므로 패턴에 쓰지 않는다.

로더 로그의 `ERROR Failed to find .got section. (NRO0Adapter)`는 모든 NRO에서 나오지만 분석과 심볼 적용은 성공했다. 영향 범위는 **[미확정]**.

주소는 SwitchLoader의 기본 베이스(0x7100000000) 기준이다. 모듈마다 같은 주소 공간을 쓰므로 **주소를 적을 때는 반드시 모듈 이름을 함께 적는다.**

### 재현

```sh
# 가져오기 + 분석 + 함수 목록
MSYS_NO_PATHCONV=1 tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_proj <프로젝트> \
  -import <nro 경로> -overwrite -scriptPath c:/dev/mpj/tools/ghidra_scripts \
  -postScript ExportFunctions.java c:/dev/mpj/analysis/functions

# 이미 분석한 프로그램 디컴파일 덤프
MSYS_NO_PATHCONV=1 tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_proj <프로젝트> \
  -process <프로그램 이름> -noanalysis -readOnly -scriptPath c:/dev/mpj/tools/ghidra_scripts \
  -postScript DecompileAll.java c:/dev/mpj/analysis/decomp
```

GUI로 열려면 `tools/ghidra_12.1.2_PUBLIC/ghidraRun.bat` 실행 후 위 프로젝트를 연다. headless 작업이 같은 프로젝트를 잡고 있는 동안에는 열리지 않는다.
