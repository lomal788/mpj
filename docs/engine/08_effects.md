# 08 이펙트 (파티클 · VFXB · bex::Effect)

상태: **부분 판독**. CPU 6,232개 정의의 공통 계산·기판독 mg1800/mg1801 GPU 식은 6.1~6.4에 보존했다. Effect 내부 Start/Stop·selfDestroy·부착 갱신(5.3), 자식 속성 평가(6.2), 정렬·draw 입력과 추가 billboard 대표 식(6.5), 전체 9,642개 정의의 분석 범위(10.4)를 연결했다. 별도 GPU·Combiner/soft FS·장면별 패스 입력·좌표 옵션의 남은 분기는 11절, 구현 차단 조건은 13절에 있다.

확정 수준 표기는 작업 지침 [분석.txt](../../../../web/분석.txt)(`c:/dev/web/분석.txt`)를 따른다.

- **[실행: 파서]** 우리가 만든 파서를 원본 파일 전체에 돌려 확인한 것
- **[판독]** 원본 CPU 코드 또는 Maxwell SASS·셰이더 메타데이터를 읽어 확인한 것
- **[데이터]** 데이터 값을 확인한 것
- **[추정]**, **[미확정]** — 근사 또는 연결이 확인되지 않은 것
- 필드 표의 **P/C/D** = 전체 파일 파서 검사 / 원본 코드 판독 / 데이터 값 확인

이 문서에 원본 실행(게임 실행) 확인은 없다.

관련 문서:
- 게임 로직의 이펙트 호출 시점 — [../minigame/mg1801.md](../minigame/mg1801.md) 6.5·6.9·3.4
- FX 트리거(.ftrg) 형식 — [05_ui_input.md](05_ui_input.md)
- BNTX 디코드 — [03_graphics.md](03_graphics.md) (도구 `web/tools/analysis/graphics_bntx.py`)
- 아카이브 로딩 — [06_scene_data.md](06_scene_data.md)
- 프레임 타이밍 — [01_core.md](01_core.md)

---

## 1. 기능 개요와 사용자에게 보이는 동작

mg1801(싹둑싹둑 수프)에서 보이는 파티클은 네 가지다.

| 화면 | 이펙트 이름 | 언제 | 근거 |
|---|---|---|---|
| 냄비 위로 피어오르는 김 | `mg1801_steam00` | 장면 준비(MapImpl::Initialize) 때 켜서 계속 냄 | [판독] |
| 결과 연출 때의 김 | `mg1801_steam01` | 상태 (0,6) 때 steam00 을 멈추고 바꿔 켬 | [판독] |
| 채소 조각이 물에 떨어질 때 물보라 | `mg1801_water_entry00`(감자·가지·당근) / `01`(토마토·버섯) | Obj::EntrySe, 조각마다 하나 | [판독] |
| 칼질 판정 때 반짝임 고리 | `mg1800_success01`(JUST) / `mg1800_success00`(FAST·SLOW) | Player::UpdateAttack → `ShowCommonEffect` | [판독][데이터] |

`RmStarEffectMan::Start`는 이름과 달리 **파티클을 만들지 않는다.** 플레이어 점수만 더한다(3.4) [판독].

---

## 2. 분석 대상 원본·버전·자료 위치

| 항목 | 위치 |
|---|---|
| 이펙트 바이너리 | 각 아카이브의 `_Vfx/<경로>/ConvertList.xml`. 이름은 xml이지만 실제로는 VFXB 바이너리다(BEA 타입 `_VFX2`). 149개 파일, 모두 VFXB 버전 53 [실행: 파서] |
| 셰이더 | 같은 폴더의 `ConvertList.xml.bnsh`, `ConvertList.xml.compute.bnsh` (BNSH) |
| mg1801 | `extracted/bea/mg~mg1801.nx.bea/_Vfx/mg/mg1801/ConvertList.xml` (1,360,484 B; 8,866,460 B는 mg0101 파일) |
| 리듬 공용 | `extracted/bea/mg~mg1800.nx.bea/_Vfx/mg/mg1800/ConvertList.xml` (`mg1800_success00/01`) |
| 미니게임 공용 | `extracted/bea/libca~mg_common.nx.bea/_Vfx/libca/mg_common/ConvertList.xml` (`mg_common_pt_effect_00`) |
| 상주(bq) | `extracted/bea/bq.nx.bea/_Vfx/bq/ConvertList.xml` (48 MB, `fx_*` 공용 이펙트) |
| 파서 | `web/tools/analysis/effect_vfxb.py` (tree / dump / check / find) |
| 덤프 | `extracted/converted/effect/{mg1801,mg1800,mg_common}/vfxb.json`, `tex/*.png`, `textures.bntx`, `primitives.bfres`. 미리보기는 `extracted/converted/effect/contact_sheet.png`, mg1801 메시 프리미티브는 `mg1801/prim/primitives.glb` |
| 디컴파일 | `analysis/decomp/effect_bex.c`(bex::Effect 전체), `effect_main2.c`(RmStarEffectMan·이름 해석), `effect_vfx2_calc.c`(vfx2 이미터 계산), `effect_mg1801_dis.c`·`effect_mg1801_dis2.c`·`effect_mg1801_steam_dis.c`(mg1801 호출부 디스어셈블) |
| Ghidra 스크립트 | `web/tools/analysis/ghidra_scripts/EffectTool.java` (CoreTool 사본, 명령 dec/dis/disf/refs/srch/ptrs) |
| 참고 오픈소스 | `tools/oss/EffectLibrary`(KillzXGaming, EFT2 PtclFile·Emitter.cs), `tools/oss/Switch-Toolbox`(PCTL.cs). 이 게임의 버전 53 배치는 EffectLibrary v50 배치와 다르다. 다른 부분은 4.3에서 원본 코드로 맞췄다 |

주소는 SwitchLoader 기본 베이스 0x7100000000 기준이고 모듈 이름과 함께 쓴다.

---

## 3. 진입점과 전체 호출 흐름

### 3.1 계층 [판독]

```
게임 코드 (mg1801::util::PlayEffect, ca::rm::util::EffectCreate/ShowCommonEffect, FxTrigger)
  └ bex::Effect                 main 0x710011be04~0x710011c908. 핸들 = {Effect*, 약한참조 블록, 세대}
      └ 내부 객체(0x130 B, operator_new) — Effect+8 이 가리킴
          └ nn::bezel::ParticleFx2Emitter   (+0x10 포인터, +0x18 약한참조, +0x20 세대)
              └ nn::bezel::ParticleFx2Module::g_Module  → nn::vfx2 (심볼 거의 없음, main 0x7100720000~0x71007a0000 부근)
```

### 3.2 bex::Effect API (main) [판독: effect_bex.c]

| 함수 | 주소 | 하는 일 |
|---|---|---|
| `Create(name)` | 0x710011be04 | 내부 객체를 만들고 EffectModule 목록에 등록한다(FUN_710011c020). FUN_710011d070(내부, name)으로 이미터셋을 찾아 이미터를 만든다. 실패하면 빈 핸들 |
| `Create(name, World3d)` | 0x710011bec0 | 같은 일을 지정 월드로 한다(FUN_710011d1e0) |
| `Setup(name)` | 0x710011bfa4 | FUN_710011d070 을 다시 부른다. 기존 이미터가 있으면 vtable+0x28 로 정리한 뒤 다시 만든다 |
| `Start(bool)` | 0x710011c170 | FUN_710011d538: 인자가 참이면 내부 Update(011f090)를 먼저 부른다. 이어 이미터 Start(07262a8), 내부+0x120=0. 최초 계산 조건은 5.3 |
| `Stop(bool)` | 0x710011c178 | 011cbdc→0725b10. false=즉시 kill, true=fade 요청(5.3) |
| `StopImmediately()` | 0x710011c188 | FUN_7100725b10(이미터, 0) |
| `SetPosition(v)` | 0x710011c334 | 내부+0x80 = v(16 B), 내부+0x119 = 1(위치 갱신 필요). 실제 행렬 반영은 내부 Update 또는 Start(true)의 선행 Update(5.3) |
| `SetSelfDestroyEnabled(b)` | 0x710011c714 | 내부+0x118 = b |
| `SetLayerVisibilityBit(bits)` | 0x710011c798 | `ParticleFx2Emitter::SetLayerVisibilityBit` |
| `SetScale/SetRotation/SetTransform/Attach/SetMultiplyColor/SetParticleGlobalScale/SetAnimationSpeed/…` | 0x710011c358~ | mg1801 은 쓰지 않는다 |

- 생성 직후 레이어 비트는 `EffectModule` 기본값이다(`FUN_71001186bc`, `EffectModule::GetDefaultLayerVisibilityBit` 계열). 생성 기본값은 **0xFFF**(0117610). 카메라 마스크와의 최종 교집합은 6.5.

### 3.3 이름 → 이미터셋 해석 [판독: effect_main2.c FUN_710072c680]

`Create(name)`은 `ParticleFx2Module` 에 등록된 리소스 목록(모듈+0x38..+0x40, 16 B 원소)을 **등록 순서대로** 돈다. 각 리소스마다 아래를 차례로 시도하고, 처음 맞는 것을 쓴다.

1. name 을 소문자로 바꾸고 `/`를 `\`로 바꾼 문자열을 ESFT 경로표 문자열과 비교한다(`FUN_710075cdd0`, 표 원소 0x28 B의 +0x18).
   - 예: `mg\mg1801\effect\mg1801_steam00.eset`
2. 앞에 `..\`(DAT 0x71015922c5)를 붙여 다시 비교한다.
3. 마지막 `.` 뒤를 잘라낸 원래 이름을 이미터셋 이름(ESET 바이너리+0x10)과 `strcmp` 한다(`FUN_710075cd20`).

- 게임 코드는 확장자 없는 이미터셋 이름(`mg1801_steam00`)을 넘기므로 3단계에서 맞는다.
- FX 트리거 자원은 `fx_unused.eset`처럼 확장자를 붙여 쓴다. 이 경우 1·2단계 경로 비교나 3단계(확장자 제거)로 맞는다 [판독: 해석 순서][추정: 트리거 쪽 실제 문자열 조합].
- 리소스 목록은 로드된 아카이브의 `_Vfx`다. mg1801 장면에서는 `mg/mg1801`, `mg/mg1800`, `libca/mg_common`, 상주 `bq`가 있다([06_scene_data.md](06_scene_data.md), SHARED 게시판의 scene 항목) [판독].
- **이름 충돌 우선순위**(같은 이미터셋 이름이 두 리소스에 있을 때)는 등록 순서다. 그 순서는 [미확정]이다. mg1801 이 쓰는 이름 6개는 전체 149개 파일에서 각각 한 파일에만 있다 [실행: 파서 find].

### 3.4 리듬 공용 유틸 (main) [판독]

| 함수 | 주소 | 동작 |
|---|---|---|
| `ca::rm::util::EffectCreate(name, selfDestroy)` | 0x7100436f20 | `Effect::Create` → `Setup(name)` → `SetSelfDestroyEnabled(selfDestroy)`. 핸들을 돌려준다. 실패하면 Abort |
| `ca::rm::util::ShowCommonEffect(id, pos)` | 0x7100436fc0 | name = 표[id] → `Create` → `Setup` → `SetSelfDestroyEnabled(1)` → `SetPosition(pos)` → `Start(false)` |
| `CMN_EFFECT_ID` 표 | 0x71019f1aa8 | **0 = `mg1800_success01`, 1 = `mg1800_success00`** (8 B 포인터 2개, 다음 칸 0) [데이터] |
| `ca::rm::RmStarEffectMan::Start(pos, float, int, int)` | 0x7100446948 | `w2 == -1`이면 아무것도 하지 않는다. 아니면 `FUN_710042a6b8(RmGameWork, w2, w3)` 로 꼬리호출한다 |
| `ca::rm::RmStarEffectMan::Start(pos, vec, float, int, int)` | 0x710044696c | 위와 같고 인자 레지스터가 `w3, w4` 다. **벡터·float 인자는 쓰지 않는다** |
| `FUN_710042a6b8(RmGameWork*, player, pts)` | 0x710042a6b8 | 건너뛰는 조건: `RmGameWork+0x6cc != 0` 이고 비트셋 `+0xE58` 의 player 비트가 켜짐. 그 밖에는 `RmGameWork+0xEBC+4·player = clamp(old + pts, 0, 999)` (player < 4, 아니면 Abort) → `FUN_71004361c4`(RmUiStatusMan → `ComUiStatus::SetValue`) |

- `ShowCommonEffect`는 mg1802·1803·1804·1805·1808·1809·1810 에서도 부른다(`analysis/decomp/rhythm_mg18xx_callers.c`) [판독]. 리듬 게임 공용 반짝임이다.

### 3.5 mg1801 호출부 [판독]

| 호출 | 위치 | 이름 | 위치값 | 그 밖 |
|---|---|---|---|---|
| `mg1801::util::PlayEffect(name, pos, layerBits, selfDestroy)` | 0x7100013cd0 | — | — | 순서: `Create` → `SetSelfDestroyEnabled(selfDestroy&1)` → `Start(false)` → `SetPosition(pos)` → `SetLayerVisibilityBit(layerBits)` |
| MapImpl::Initialize 끝 | 0x71000106d8 | `mg1801_steam00` | `Vector3f::ConstantZero` (0,0,0) | layerBits 1, selfDestroy false. 핸들은 MapImpl+0x240..+0x250 |
| MapImpl::ReceiveState (0,6) | 0x7100010e78 | `mg1801_steam01` | (0,0,0) | 먼저 MapImpl+0x240 핸들에 `Stop(false)`. 그다음 같은 인자로 PlayEffect, 핸들을 덮어쓴다 |
| Obj::EntrySe | 0x7100009060~ | type∈{0,4} → `mg1801_water_entry01`, 그 밖 → `…00` | (조각 x, **−0.5**, 조각 z) | `ca::rm::util::EffectCreate(name, true)` → `SetPosition` → `Start(false)`. 조각마다 하나(규칙은 mg1801.md 6.9) |
| Player::UpdateAttack | 0x710000cfe0 | 판정 `w20==0`(JUST) → id 0 `mg1800_success01`, 그 밖 → id 1 `mg1800_success00` | (Player+0xB0.x, 1.5, 0) | `ShowCommonEffect` |
| 같은 곳 | 0x710000d0d4 | `RmStarEffectMan::Start(pos=(pid·2−3, 1.5, 0), vec=DAT_71000315a0, beatToSec(0,1), pid, pts)` | — | **pts = JUST 2, FAST·SLOW 1** (`mov w4,w20`; w20 = 2 또는 1) |

- `PlayEffect`의 Start→SetPosition 순서는 5.3의 일반 생성 경로에서는 방출 전에 행렬을 제출할 수 있다. 별도 생성 콜백·선계산 경로까지 같은 첫 위치라고 일반화하지 않는다. mg1801 steam 위치는 원점이다.
- mg1801 에는 FX(파티클) 트리거가 없다. 칼 모션의 트리거는 SE·VO 뿐이다([05_ui_input.md](05_ui_input.md), ui 담당 덤프 `extracted/converted/ui/ftrg/mg1801_triggers.json`) [데이터].

---

## 4. 구조체·필드·상수·열거형

### 4.1 VFXB 파일 헤더 (0x40 B) [실행: 파서]

| 오프셋 | 타입 | 값(mg1801) | 의미 |
|---|---|---|---|
| 0x00 | char[8] | `VFXB    ` | 매직 + 공백 4 |
| 0x08 | u16 | 0x0400 | 그래픽 API 버전 (EffectLibrary 이름) |
| 0x0A | u16 | **53** (0x35) | VFX 버전. 149개 파일 전부 53 |
| 0x0C | u16 | 0xFEFF | BOM(리틀 엔디언) |
| 0x0E | u8 | 0x0C | 정렬(2^12) |
| 0x0F | u8 | 0x40 | 대상 주소 크기 |
| 0x10 | u32 | 0x20 | 이름 오프셋 |
| 0x14 | u16 | 0 | 플래그 |
| 0x16 | u16 | 0x40 | 첫 섹션 오프셋 |
| 0x18 | u32 | 0 | 재배치 표 |
| 0x1C | u32 | 파일 크기 | |

### 4.2 섹션 헤더 (모든 섹션 공통 0x20 B) [실행: 파서]

| +오프셋 | 타입 | 이름 | 비고 |
|---|---|---|---|
| 0x00 | char[4] | magic | |
| 0x04 | u32 | size | 바이너리 크기(컨테이너는 전체 크기) |
| 0x08 | u32 | childOffset | 섹션 시작 기준, 없으면 0xFFFFFFFF |
| 0x0C | u32 | nextOffset | 형제 섹션, 없으면 0xFFFFFFFF |
| 0x10 | u32 | attrOffset | EMTR 의 하위 속성 섹션(필드·애니) 시작 |
| 0x14 | u32 | binaryOffset | 바이너리 데이터 시작 |
| 0x18 | u32 | 0 | |
| 0x1C | u16 | childCount | |
| 0x1E | u16 | 0 | |

최상위 섹션 순서(mg1801):

| 섹션 | 내용 |
|---|---|
| `ESTA` | 자식 = `ESET` × 4 |
| `ESFT` | 이미터셋 원본 경로표. 바이너리 16 B 머리(0) 뒤에 `{u32 next, i32 len, char[len]}` 반복 |
| `GRTF` | 자식 `GTNT`(텍스처 설명표) + 바이너리 = **BNTX 파일 통째**(binOffset 0x5E0, 정렬 4096) |
| `PRMA` | vfx 자체 프리미티브(mg1801 은 비어 있음) |
| `TRMA` | 자식 `TRIM` 1개(트리밍 데이터로 추정) [미확정] |
| `G3PR` | 자식 `G3NT` + 바이너리 = **BFRES(FRES) 통째**(메시 프리미티브) |

셰이더(`GRSN`/`GRSC`)는 이 게임에서 파일 안에 없고 `.bnsh` 로 분리돼 있다 [데이터].

`ESET` 섹션:
- 바이너리 = 16 B(0) + 이름 char[64] + u32×10. 10번째 u32 앞 칸이 이미터 수다(mg1801: 3, 1, 7, 7, 자식 포함).
- 자식 = `EMTR`.

`EMTR` 섹션:
- 바이너리 = EmitterData **0x1100 B 고정**(4.3).
- 자식 = 자식 이미터(`EMTR`).
- attr 체인 = 하위 섹션(4.6).
- 바이너리 시작은 파일 기준 256 B 정렬이다.

`GTNT`/`G3NT` 원소: `{u64 id, u32 next(0이면 끝), i32 len, byte[len]}`.
- GTNT 의 byte = 텍스처 이름(BNTX 안 이름과 같음).
- G3NT 의 byte 는 8 B 값(예 `0001ffff02ff0000`)이고 의미는 [미확정].
- 프리미티브 ID 는 같은 이름 텍스처의 ID 와 같은 값이다(`mg1801_bubble00` 0x5832afa7, `mg1801_crown00` 0xe5d7b000).
- 해시 함수는 CRC32·FNV-1/1a·djb2 가 아니다 [실행].

### 4.3 EmitterData (0x1100 B, 버전 53) [실행: 파서][판독: 표시한 필드]

오프셋은 EMTR 바이너리 시작 기준이다. 이름은 EffectLibrary 이름을 따르고, 원본 심볼이 아니다.

| 오프셋 | 크기 | 필드 | 검증 | 비고 |
|---|---|---|---|---|
| 0x000 | 16 | flag, randomSeed, pad×2 | P | mg1801 전부 0 |
| 0x010 | 96 | name | P D | `steam00` 등 |
| 0x070 | 0xC50 | **Static 블록**(아래 표) | P C | vfx2 가 0x000~0xCBF(0xCC0 B)를 그대로 GPU 상수 버퍼에 복사한다(FUN_71007491a0 `memcpy(…,*param_1,0xcc0)`) 뒤 루프·고정색·키 패딩을 초기화한다. 위치 계산은 calcType/프로그램별로 다르다(6.3) |
| 0xCC0 | 0x88 | EmitterInfo: u8×16(isParticleDraw, sortType, **calcType**(0xCC2), followType, …), randomSeed, drawPath, alphaFadeTime, fadeInTime, trans xyz(0xCE0), transRand xyz, rotate xyz(0xCF8, 라디안), rotateRand, scale xyz(0xD10), color0 rgba(0xD1C), color1 rgba, emissionRange… | P D C(0xCC3) | calcType 분포 0:6,232 / 1:3,011 / 2:399 |
| 0xD48 | 0x20 | Inherit: u8×16, u64, velocityRate, scaleRate | P | |
| 0xD68 | 0x48 | **Emission**: isOneTime(0xD68), isWorldGravity(0xD69), isEmitDistEnabled(0xD6A), isWorldOrientedVelocity, **start**(0xD6C u32), **timing**(0xD70 u32), **duration**(0xD74 u32), **rate**(0xD78 f32), **rateRandom**(0xD7C, 정수 %), **interval**(0xD80 i32), intervalRandom(0xD84 정수), positionRandom, gravityScale, gravityDir xyz, emitterDist unit/min/max/margin, emitterDistParticlesMax(0xDAC) | P C D | 쓰임은 6.1 |
| 0xDB0 | 0x58 | **Shape**: volumeType(0xDB0), sweepStartRandom, arcType, isVolumeLatitudeEnabled, …, sweepLongitude(0xDB8), sweepLatitude, sweepStart, volumeSurfacePosRand, caliberRatio, lineCenter, lineLength(0xDD0), **volumeRadius xyz(0xDD4)**, **volumeFormScale xyz(0xDE0)**, primEmitType(0xDEC), primitiveIndex u64(0xDF0), numDivideCircle(0xDF8), …Random, numDivideLine(0xE00), …Random | P C | 코드: volumeType 2 → ×numDivideCircle, 13 → ×numDivideLine. 0xDE0~0xDE8 × 이미터셋 스케일 |
| 0xE08 | 0x10 | **Render**: isBlendEnable, isDepthTest, depthFunc, isDepthMask, isAlphaTest, alphaFunc, **blendType**(0xE0E), displaySide, alphaThreshold, pad | P D | |
| 0xE18 | 0x60 | **Particle**: infiniteLife(0xE18), isTriming, **billboardType**(0xE1A), rotType, offsetType, rotRevRand xyz, isRotate xyz(0xE20~22), …, **life**(0xE28 i32 프레임), lifeRandom(0xE2C), momentumRandom, vertexInfoFlags, **primitiveID**(0xE38 u64), primitiveExID(0xE40), 루프 enable u8×9(0xE48~50), 랜덤 위상 u8×9(0xE51~59), pad, 색/알파 루프 주기 u16×4(0xE5C), scale 주기 i32(0xE64), 추가 애니 주기 i32×4(0xE68, 표본 100) | P C | 코드: infiniteLife 는 isOneTime 일 때만 유효(아니면 0으로 덮음). life 는 0xE28 또는 이미터 애니 최대값 |
| 0xE78 | 0x10 | Combiner u8×16 | P D | 거의 `00…00 00080808 …` |
| 0xE88 | 0xAC | **ShaderRef**: u8×4(+2 = 두 번째 셰이더 있음), 0xE8C, 0xE90, **shaderIndex(0xE94)**, shaderIndex2(0xE98), 0xE9C(−1), computeShaderIndex(0xEA0, 이름 추정), …, `SHADER_1` 같은 정의 문자열(0xEF0), actionIndex(0xF30, 이름 추정) | P D | shaderIndex 는 파일 안 이미터 순서대로 0,1,2… 증가하는 BNSH 변형 번호 |
| 0xF34 | 0x30 | **Velocity**: allDirection(0xF34), designatedDirScale, designatedDir xyz, diffusionDirAngle, xzDiffusion, diffusion xyz, velRandom, emVelInherit | P C D | 코드: allDirection × 이미터셋 스케일. steam 방향 (0,1,0) |
| 0xF64 | 16 | 이미터 속도 상속의 크기 상한 + 미확정 f32×3 | P C(첫 값) | 074fea4에서 emVelInherit 속도 길이를 첫 값으로 제한(6.2); (100,0,0,0) 흔함 |
| 0xF74 | 0x2C | **Color**: u8×8, color0Type, color1Type, alpha0Type, alpha1Type(0xF7C~F7F), color0 rgb + alpha0, color1 rgb + alpha1 | P D | 타입 0 고정, 2 = 8키 애니(키 수와 일치) |
| 0xFA0 | 0x24 | **Scale**: scale xyz, scaleRandom xyz(%), u8×4, scaleMin, scaleMax | P D | |
| 0xFC4 | 0x0C | Fluctuation u8×8 + u32 | P | |
| 0xFD0 | 0x18×6 | **Sampler[6]**: textureID u64, wrapU, wrapV, filter, isSphereMap, maxLOD, lodBias, u8×4 | **P(ID 11,057개 전부 GTNT 에 있음)** | wrap 0 Mirror, 1 Repeat [데이터: 4.4] |
| 0x1060 | 0x10×6 | **TexAnim[6]**: patternAnimType, isScroll, isRotate, isScale, **repeat**, invRandU, invRandV, … | P D | |
| 0x10C0 | 0x40 | reserved | P | |

Static 블록 세부(0x070~0xCBF):

| 오프셋 | 필드 | 검증 |
|---|---|---|
| 0x070 | flags1..4 | P |
| 0x080 | **키 개수** numColor0Keys, numAlpha0Keys, numColor1Keys, numAlpha1Keys, numScaleKeys, numParamKeys | D: mg1801 17개 이미터 모두 키 표의 실제 키 수와 일치 |
| 0x098 | u32×4 (0/1) | P |
| 0x0A8~0x0FF | 런타임 애니 루프 값 | 원본 파일 5,485 표본은 전부 0(P). 복사 후 +0xB0~D4·E0~FC를 루프 주기/랜덤 위상으로 덮어쓴다(C, 6.3). 파서의 `unknownV53` 및 이 범위의 v50 필드 이름을 런타임 이름으로 쓰지 않는다. +A8/AC·D8/DC는 미확정 |
| 0x100 | **gravityDir xyz, gravityScale(0x10C)** | D: (0,−1,0), 0.006~0.008. 코드 0x10C 읽음(C) |
| 0x110 | **airRes** | D: 0.95~1.0 |
| 0x114~0x15F | 흔들림(amplitude/cycle/phase)·계수 | P |
| 0x160 | TexPatAnim[6] (각 0x90 = f32×4 + i32×32 표) | P(표 값 0..31 위치 일치) |
| 0x4C0 | TexScrollAnim[6] (각 0x50) | P. 마지막 4칸 이름(uvScale/uvDiv)은 값(0,0,1,1)으로 보아 순서가 [미확정] |
| 0x6A0 | colorScale 등 4 | |
| 0x6B0 | **color0 키표**(8키 × {x,y,z,t}) | D |
| 0x730 | **alpha0 키표** | D(알파는 x=y=z) |
| 0x7B0 | color1 키표 | D |
| 0x830 | alpha1 키표 | D |
| 0x8B0 | softEdge, fresnel, near/far alpha, decal, alphaThreshold, … (16 f32) | P |
| 0x8F0 | **scale 키표** | C D(배율, 입자 base scale에 곱함) |
| 0x970 | param 키표, 0x9F0~0xB70 애니 키표 4개 | P |
| 0xBF0 | f32×16 | P |
| 0xC30 | rotateInit xyz, rotateInitRand xyz, **rotateAdd xyz(0xC50)**, rotateRegist, rotateAddRand xyz, … | C(0xC30·0xC40 읽음) D(π 값) |
| 0xC80 | scaleLimitDist…, f32×16 | P |

- 키 한 개는 `{x, y, z, time}` 이다. time 은 수명 대비 비율 0..1 [데이터: 0→1 증가].
- 키표 오프셋은 EffectLibrary v50 표기보다 +0x20 뒤다. 추가 32 B의 구조적 위치와 런타임 루프 슬롯의 의미는 구별한다(6.3).

### 4.4 열거형 (값 분포는 9,642 이미터 전체) [실행: 파서]

| 필드 | 값 → 의미 | 근거 |
|---|---|---|
| volumeType | 0 Point, 1 Circle, **2 CircleDiv**, 3 CircleFill, 4 Sphere, 5 SphereDiv, 6 SphereDiv64, 7 SphereFill, 8 Cylinder, 9 CylinderFill, 10 Box, 11 BoxFill, 12 Line, **13 LineDiv**, 14 Rectangle, 15 Primitive | EffectLibrary 열거와 16개 CPU 함수표를 대조 [판독: 6.2]. SphereDiv64의 실제 표본 수는 DB4가 선택 |
| blendType | 0 일반 알파, 1 가산, 2 역감산, 3 곱, 4 스크린, 5 ONE / ONE_MINUS_SRC_ALPHA | 공용 writer·NVN 변환표 대조 [판독: 6.6]. isBlendEnable과 RGB/alpha의 별도 factor/op를 함께 적용 |
| billboardType | 0(6,546), 3, 4, 5, 6, 7, 1, 10, 2 | EffectLibrary 의 VertexTransformMode(0 Billboard, 1 PlateXY, 2 PlateXZ, 3 DirectionalY, 4 DirectionalPolygon, …)는 이 버전과 맞지 않는다. 물결(4)의 판독된 VS는 로컬 `(x,y,z)→(x,z,−y)` 축 치환으로 XZ 판을 만든다 [판독: 6.4]. 거품/왕관(3)은 메시 정점과 입자 변환을 읽는다. 다른 프로그램까지의 열거형 전체 의미는 미확정 |
| calcType | 0 CPU, 1 GPU, 2 GPU+스트림아웃 | 이름은 EffectLibrary. 확인한 0은 현재 위치 속성, 1은 초기 위치/속도의 해석식, 2는 CS 상태 갱신 + VS를 사용 [판독: 6.3]. 2의 실제 버퍼 제출 방식은 미확정 |
| color*Type | 0 고정, 2 8키 애니 | 키 개수와 타입 2 가 함께 나타남 [데이터]. 1(랜덤) [추정] |
| sampler wrap | 0 Mirror, 1 Repeat | 4분의1 원 텍스처(`mg1800_success00_ring00` 등 64×64)가 wrap 0 + `repeat=3` 이고, 반쪽 별(`mg_common_star_00` 32×64)이 wrapU 0 + `repeat=1` → **repeat 0 = 1×1, 1 = 2×1, 2 = 1×2, 3 = 2×2 로 UV 를 늘리고 Mirror 로 대칭 복사해 전체 그림을 만든다** [데이터][추정: 셰이더 식] |

### 4.5 bex::Effect 내부 객체 (0x130 B) [판독]

| 오프셋 | 내용 | writer | reader |
|---|---|---|---|
| +0x10 / +0x18 / +0x20 | ParticleFx2Emitter* / 약한참조 블록 / 세대 | FUN_710011d070 | 모든 Set* |
| +0x28..+0x38 | 소속 엔티티(월드) 핸들 | FUN_710011d070 / d1e0 | |
| +0x80 | 위치 Vector3f(16 B) | SetPosition | GetPosition, 갱신 |
| +0x118 | selfDestroy (u8) | SetSelfDestroyEnabled | 011f3ac 생존·pause 검사 → 0118820 지연 정리 목록(5.3) |
| +0x119 | 위치 갱신 필요 (u8) | SetPosition | 갱신 |
| +0x120 / +0x121 | 캐시된 pause / 수동 pause | Start·011d7b8 | 갱신·selfDestroy 조기 반환 |
| +0x128 | 핸들 블록(Create 가 반환) | | Create |

### 4.6 EMTR 하위 섹션(attr 체인) [실행: 파서 — 종류·개수만]

| magic | 수(전체) | 추정 의미 | mg1801 |
|---|---|---|---|
| CSDP | 2,164 | 커스텀 셰이더 파라미터(f32 16개 + 2개 …) | 대부분 이미터(shader00 은 (0.254,0.15,0.065) 색) |
| FRND | 1,131 | 랜덤 필드(흔들림) | steam00: (0.005,0,0.005) + 표 (4,3,2,1.5,0.6,0.42,0.23,0.15) |
| CADP | 889 | 커스텀 액션 파라미터 | — |
| FSPN | 364 | 회전 필드(스핀) | water_entry bubble00: 0.05 |
| FRN1 | 255 | 랜덤 필드 변형 | wave00: (0.0003, 0, 0.0003) |
| FCOL / FCOV / FCLN / FMAG / FPAD / FGWD | 207/96/49/16/6/2 | 충돌 / 수렴 / 컬 노이즈 / 자석 / 위치 더하기 / ? | — |
| EP01..03 | 4/158/95 | ? | — |
| EA** (EATR, EADV, EAER, EAC0, EAET, EASL, EAOV, EAC1, EAPL, EAES, EAA0, EASS) | 1~61 | 이미터 애니메이션: `{u8 enable, loop, randomStart, pad; u32 keyCount; u32 loopCount; {x,y,z,t}×n}` (EffectLibrary) | — |

- 이름은 4문자 magic과 EffectLibrary를 근거로 삼았다. 태그→리소스 포인터→CPU 필드/애니 함수는 6.2, FRN1→GPU 필드 버퍼는 6.3에서 연결했다. CPU FRN1의 난수 테이블과 wave00 CS의 sine 힘은 서로 다른 식이다.

---

## 5. 상태 전이와 전체 수명

### 5.1 이펙트 하나의 수명 [판독]

`Create`는 Effect를 등록하고 emitter handle을 구성한다. `Start`는 활성 emitter set을 만들거나 재개한다. `Stop(false)`와 `StopImmediately`는 즉시 kill 경로이고, `Stop(true)`는 계산을 계속하는 fade 요청이다. `selfDestroy`는 pause가 해제되고 emitter가 더 이상 살아 있지 않을 때 정리 목록에 넣은 뒤 후속 단계에서 Effect를 해제한다(5.3).

### 5.2 mg1801 이펙트별 수명

| 이펙트 | 시작 | 끝 | 겹침 |
|---|---|---|---|
| steam00 | MapImpl::Initialize | 상태 (0,6) 의 `Stop(false)` | 1개 |
| steam01 | 상태 (0,6) | 장면 해제(명시 Stop 없음 [판독: ReceiveState 범위]) | 1개 |
| water_entry00/01 | 조각마다 | 모든 이미터가 one-time 이라 저절로 끝나고 selfDestroy | 동시에 여러 개(조각 수만큼) |
| mg1800_success00/01 | 판정마다 | one-time + selfDestroy | 플레이어 4명 × 판정 |

- 일시정지·장면 끝의 일괄 정지는 `EffectModule::StopAll`/`Cleanup`(0x7100117188/0x7100117110)이 있다. 호출 시점은 [미확정].

### 5.3 내부 갱신·정지·부착 행렬

근거: [effect_runtime_b1.c](../../../analysis/decomp/effect_runtime_b1.c), [b2](../../../analysis/decomp/effect_runtime_b2.c), [b3](../../../analysis/decomp/effect_runtime_b3.c), [b4](../../../analysis/decomp/effect_runtime_b4.c), [b5](../../../analysis/decomp/effect_runtime_b5.c), [b6](../../../analysis/decomp/effect_runtime_b6.c), [b7](../../../analysis/decomp/effect_runtime_b7.c). 주소는 모두 main. 이하 `I`=Effect 내부, `B`=ParticleFx2Emitter, `W`=vfx2 EmitterSet, `E`=개별 emitter, `D`=EmitterData.

| 경로 | 판독 결과 |
|---|---|
| `Start(true)` 011d538 | `I.vt+18`=011f090 Update → `B.vt+58`=07262a8 Start → `I[120]=0`. 되감기 호출이 아니다 |
| `Start(false)` 07262a8 | 유효 W가 정지 상태이면 W[38] bit1을 켜 재개. 이미 실행 중이면 기존 W를 kill하고 07676ac→07674a0→0745f60→07461e0으로 새 emitter set을 구성한 뒤 B[80] 행렬을 074786c로 제출 |
| 최초 방출 | 07461e0→07463bc→073b83c는 emitter 생성·초기화이며 이 직접 경로에 입자 방출 호출은 없다. 0745f60의 생성 콜백(W+220)·074f620의 콜백 경로는 별도다. 따라서 **별도 콜백/선계산 없이 첫 Effect Update→vfx 계산으로 진행하는 경우** Start 뒤 SetPosition도 첫 방출 전에 반영된다. 모든 호출 모드에 대한 무조건 보장은 남음 |
| Effect 갱신 011f090 | 011d7b8의 pause 또는 유효하지 않은 emitter이면 반환. I[119]가 켜지면 scale I[60]·quat I[70]·position I[80]로 로컬 행렬 I[90..CF]를 재작성하고 dirty를 지운다. B.vt+40=0727ba8이 B[80..BF]와 W[100..13F]에 제출 |
| 일반 행렬 분해 074786c | 열벡터 `b_j`의 길이 `s_j=sqrt(dot(b_j,b_j))`를 W[1A0..1A8]에 저장. `s_j>0`이면 정규화한 basis, 아니면 0을 W[140..16F]에 저장. translation은 W[170..17F], 전체 행렬은 W[100..13F] |
| `Stop(false)` 011cbdc→0725b10 | 0746d30→07678a0으로 W 전체 kill. 잔여입자를 수명만큼 유지하는 동작이 아니다. steam00→steam01 호출도 이 경로 |
| `Stop(true)` 0727250→0746d3c | W[38]에 `0x20`만 OR. 0746d4c가 이를 fade 인수로 074d580에 전달한다. D[CC8] 조건으로 방출 허용을 바꾸며 D[CCB]/D[CCC]가 켜진 경우 fade 값 `F=max(0,F−dt/D[CD8])`; CD8<1 또는 F≤1.1920929e−7이면 0. 종료 임계점에서는 074d580이 false를 반환한다. fade 옵션 없는 분기는 duration·잔여수명 종료 조건으로 계속 계산한다 |
| 생존 판정 0727394 | handle 세대 일치·W[E8]>0·W[38]&0x400 필요. W[38] bit1 또는 W[28]==−1이면 alive. 입자 수 하나만으로 판정하지 않는다 |
| selfDestroy 011f3ac/0118820 | I[118]!=0, I[120]==0이고 emitter handle이 무효이거나 alive=false이면 활성 목록(Module+10)에서 정리 목록(+28)으로 이동. 0118990→011d528이 후속 단계에서 해제 |
| 모듈 순서 0116f58 | Effect Update wrapper 01170d8→0118820은 timing **0x12**, 지연 해제 01170ec→0118990은 **0x14**에 등록. Scene→Fiber(0x0E), fixed physics(0x0F)와 혼동하지 않는다. vfx 계산과 모든 생성 콜백의 세부 선후는 미확정 |

`Attach`는 입자 `followType`과 다른 Effect 단위의 부착이다. `011f550`은 entity 약한 handle을 I[40/48/50]에 저장하고 attribute bit8을 지운다. 모델 본 부착 `011f584/011f64c`는 owner entity와 본 번호 I[110]을 저장하고 bit8을 켠다.

| attribute / 경로 | 행렬·시점 |
|---|---|
| low bits `1/2/4` (011d900) | entity scale/rotation/translation을 각각 선택한다. 7은 CalculateTransform 전체. 본 부착은 SkeletonPose::CalculateWorldTransform(I[110]); 선택한 parent TRS와 로컬 TRS를 합성한다. 열벡터 표기로 `M_out=M_parent_selected·M_local` |
| bit3/bit4 (011f090) | bit3 경로는 B.vt+50=0727cd0의 현재 행렬을 I[D0..10F]에 capture. bit4=0은 I[11A]로 1회, bit4=1은 매 Update capture하고 dirty 표시. capture 합성은 별도 경로이며 일반 entity follow와 동일 옵션이 아니다 |
| bit5/bit7 (011ea74/011eefc) | socket pose의 0x54 B 원소(본 번호)와 +50 유효 바이트를 검사하고 행렬·가시성을 제출한다. bit7이 켜지고 bit5가 꺼진 경우 ComModel+2C의 가시성 bit0을 B에 동기화. 완전한 socket 상태 의미와 잘못된 본 번호 경계는 남음 |
| bit6 (011e480) | Scene graphics layer **0xC**를 얻어 `(x/width+0.5, 0.5−y/height, 0)`를 camera helper 0862914로 변환하고 capture translation을 덮는다. 단순 world 따라가기와 다르다 |
| pause (011d7b8) | MainModule pause query(01968a4, I[11C]) 또는 수동 I[121]을 I[120]에 캐시. alive emitter의 vt+68/+70으로 pause/resume 전이를 전달. pause 중에는 selfDestroy도 보류 |

입자 `followType` D[CC3]은 정렬 reader 073e3a0에서 구분된다. 0은 현재 E[100..13F], 1은 입자별 E[350/358/360] 세 행의 basis·translation, 2는 입자별 basis와 **현재 E[130..138] translation**을 쓴다. 저장 행렬이 없으면 현재 E 행렬로 fallback한다. 셰이더 제출·초기화의 모든 조합까지 확정한 것은 아니다.

`E[30] bit18`은 followType이 아니다. 074c3a0의 **EAER/EAES/EAET**가 R[B7]을 켜고 073b83c가 이를 bit18로 옮긴다. 074d010은 bit18=0이면 E[180..1FF] 행렬을 E[200..27F]로 복사하고, bit18=1이면 identity에서 이미터 애니 TRS를 재구성한다. 자식·상속 행렬은 이 뒤 별도 분기다.

---

## 6. 계산식·조건·의사코드

### 6.1 방출 [판독: effect_vfx2_calc.c, 일부 추정]

필드: `start`(0xD6C), `timing`(0xD70), `duration`(0xD74), `rate`(0xD78), `rateRandom`(0xD7C, %), `interval`(0xD80), `isOneTime`(0xD68).

1. **one-time 보정**(FUN_71007491a0 끝) [판독]: `isOneTime && !isEmitDistEnabled && duration < interval` 이면 `interval = duration`.
2. **방출 창**(FUN_710074d580) [판독]:
   - 일반 이미터: 시작 = `start`, 끝 = `start + duration`.
   - 자식(bit0) 중 부모 수명 timing(bit17) 경로: 시작 `S=parent.life·timing/100`; one-time(bit20)이면 끝 `S+duration`, 아니면 끝 `parent.life`. bit17이 없는 경로의 S/end는 일반 start/duration 값이다.
   - 시간 ≥ 시작이고, (끝 제한이 없거나 시간 < 끝) 일 때 방출 함수(FUN_710074cb60)를 부른다. `F=E[30]`, one-time=bit20(D[D68]), child=bit0(R[BF]), 부모 수명 timing=bit17(D[D5C])다. 실제 허용식은 `emitAllowed && bit3 && (!bit0 || bit17) && t>=S && ((!bit20 && !bit0) || t<end || !bit1)`이다. 첫 방출 상태 bit1이 꺼진 예외를 포함하며 일반 연속 이미터(!bit20&&!bit0)는 duration으로 닫지 않는다.
3. **방출 간격**(FUN_710074cb60) [판독 일부]: 간격 = `interval + 1` 프레임. 간격마다 다음 값을 누적한다(`u = oldSeed·2⁻³²`를 먼저 읽고, 이미터 LCG `seed = oldSeed·0x41C64E6D + 0x3039`를 u32로 갱신).
   - `rate × emissionScale(인스턴스+0xDC) × 모듈 배율(+0x24C) × (100 − u·rateRandom)/100`
   - 누적 값의 정수 부분만큼 입자를 만든다. 방출 상태 E[30] bit1=0인 분기에서 **이번 rate 값을** 최소1로 올린다(`if (fVar15 <= 1.0) fVar15 = 1.0`). 이 값과 누적 remainder는 별도이며 interval·dt 경계를 함께 적용한다.
   - 다음 간격은 `073dcec`에서 `(float(interval)+1+float(int32(high32(uint64(oldSeed)·int64(intervalRandom)))))·E[E0]·W[250]`로 정한다. 랜덤은 %가 아닌 정수 간격 증가이며 LCG 1회 소비. 최초 캐시는 `073b83c`의 interval+1이다. 음수 intervalRandom도 이 명령의 signed 값·상위32비트 변환을 따르며 clamp를 가정하지 않는다.
   - `074f620`은 방출 batch마다 추가 LCG 1회를 소비한다. primEmitType=0의 CircleDiv/LineDiv는 `nDiv−trunc(u·uint32(divRand)·0.01·nDiv)`를 방출 수에 곱한다. 다음 슬롯이 살아 있거나 사용자 데이터를 보유하면 batch를 중단한다.
4. **최대 입자 수**(FUN_710073d51c, FUN_7100760da4) [판독]:

```ts
dur = duration !== 0 ? duration : 1;
step = interval + 1;
k = (조건 플래그) ? floor(dur / step) : floor(lifeMax / step);
n = floor(floor(rate * k) + floor(rate) * 2);
if (primEmitType === 0) {
  if (volumeType === 13) n *= numDivideLine;
  else if (volumeType === 2) n *= numDivideCircle;
}
if (자식 이미터) n *= 부모 최대 입자 수;
```

웹 풀 크기를 정하는 데 쓴다.

- mg1801 one-time 이미터의 방출 일정은 아래와 같다. 1·2·3을 적용한 값이다. 일반 one-time의 시간 창은 `t<end`이며, 초기 bit1=0 예외·첫 계산 dt/콜백 선후는 5.3·위 방출 조건을 함께 적용한다.

| 이미터 | duration | interval→보정 | 간격 | 방출 프레임 | 1회 수 |
|---|---|---|---|---|---|
| water_entry shader00 | 5 | 59→5 | 6 | 0 | 5 (01 은 3) |
| splash01 / splash02 | 1 | 0 | 1 | 0 | 15 / 12 |
| bubble00 | 1 | 59(01:29)→1 | 2 | 0 | 120 |
| wave00 | 24 | 7 | 8 | 0, 8, 16 | 1 |
| wave01 | 30 | 4 | 5 | 0, 5, 10, 15, 20, 25 | 1 |
| white_wave00 | 10 | 1 | 2 | 0, 2, 4, 6, 8 | 1 |
| success ring00/01 | 1 | 9→1 | 2 | 0 | 1 |
| success twinkle00~02 | 5 | 10→5 | 6 | 0 | 10 |
| steam00 (연속) | — | 9 | 10 | 0, 10, 20, … | 6 |
| steam01 (연속) | — | 29 | 30 | 0, 30, 60, … | 4 |

### 6.2 초기화·CPU 입자 갱신 [판독]

`calcType=0`은 6,232개(전체 9,642개의 64.63%; 상위 5,703·자식 529)다. `FUN_710073b83c`가 인스턴스 플래그 bit 14를 세우며 `074d580→074e070→0755834`로 갱신한다. 생성은 CPU/GPU 공통 `074f620→074f880→074fea4`다. 이 절의 함수 주소는 모두 `0x7100000000+표기값`, 오프셋은 16진수다. `E`=이미터 인스턴스, `D=*(E+48)`=EmitterData, `R=*(E+40)`=리소스, `W=*E`=이미터셋 인스턴스. `075c530`이 `*(R+270)=D+70`으로 연결하므로 CPU의 Static 상대 `A0`은 파일 `110`(airRes)이다.

**입자 배열·속성 연결.** 배열 stride는 0x10 B(16 B), 메타데이터 `*(E+60)`은 0x20 B(32 B)다. `074f880`의 작성과 `074cf04/074e070`의 GPU 복사를 대조했다. 표의 VS 속성은 6.3의 표준 프로그램 배치이며 커스텀 VS는 별도 배치다.

| E의 배열 포인터 | 값 | 표준 VS reader |
|---|---|---|
| 310 | `P.xyz`, `P.w=L`(float 수명) | `a[80..8C]` |
| 318 | `V.xyz`, `V.w=b`(생성 시각) | `a[90..9C]` |
| 320 | 이동 방향 tangent | 프로그램별 |
| 328 | `scale₀.xyz`, `m=1+Rₘ−2uRₘ` | `a[A0..AC]` |
| 330 | 생성 때 뽑은 `U.xyzw` | `a[B0..BC]` |
| 338 | `θ₀.xyz`, serial % capacity | `a[C0..CC]` |
| 350/358/360 | 입자별 변환 3행 | 커스텀 VS의 변환 속성 |
| 메타데이터 +0/+4/+8/+C/+10/+18 | 유효 serial / 충돌 횟수 / b / L / 사용자 데이터 2개 | CPU 생존·콜백용 |

**난수.** LCG는 매번 **이전 seed**로 `u=float(seed)·2⁻³²`를 얻은 뒤 `seed=(seed·41C64E6D+3039) mod 2³²`로 진행한다. float 반올림 때문에 최상단 값은 1이 될 수 있다. `D[CC4]`의 seed 선택은 0=공유 xorshift128의 다음 값(5,460개), 1=`W[264]`(45개), 2=`D[CD0]·DFDC1C35 mod 2³²`(727개). `0759750`의 전역 강제 seed 분기가 선택값을 덮을 수 있다. 초기 seed의 하위/상위 16비트는 `E[4A0/4A2]`, 전체는 `E[4A4]`다.

LCG와 별도로 `0759410`이 각 512개의 float4 테이블 `N/Q`를 만든다(`DAT_7101c40600/608`). xorshift 상태 `(178EAB2C,E318145E,45F0CDB4,720A056D)`, shift 11/8/19에서 각 성분을 `(bitcast_f32(3F800000 | (rng>>9))−1)·2−1`로 뽑는다. N은 그대로, Q는 다음 xyz를 정규화하며 w=0. Q는 정육면체 표본의 정규화이므로 구면 균등분포가 아니다. N/Q 접근은 각각 16비트 cursor `E[4A0/4A2]`를 증가시키며 index는 `cursor & 1FF`다.

**형상 표본.** `7101b59378`의 16개 함수 포인터를 판독했다. 아래 `r=D[DD4..DDC]⊙E[468..470]`, `vₐ=E[444]`, `c=D[DC8]`(caliberRatio), `u`는 연속 LCG 값이다. 형상 출력 P/V는 로컬 좌표다.

| type / CPU 정의 수 | 함수 | 위치·초기 형상 속도 |
|---|---|---|
| 0 Point / 3,268 | 0750ef0 | `P=0; V=vₐ·Qnext` |
| 1 Circle / 264 | 0750f28 | `θ=start+sweep·(u−0.5); P=(rₓsinθ,0,r_zcosθ); V=vₐ(sinθ,0,cosθ)`; 타원 위치를 정규화한 속도가 아님 |
| 2 CircleDiv / 681 | 07510c4→0752c38 | 시작각−sweep/2에서 분할 간격으로 진행, `DC4·(2u−1)` 각도 지터. 전주 2π는 분모 n, 부분 호는 n>1일 때 n−1. primEmitType별 index/분할 수 경계는 남음 |
| 3 CircleFill / 406 | 07510f8 | Circle 위치에 `ρ=√(u+(1−u)(1−c)²)`를 곱함; `V=vₐ·normalize(P)`(퇴화 시 +Z) |
| 4 Sphere / 544 | 07513b4 | `P=r⊙d; V=vₐd`. 일반 가지 `d_y=2u−1`; arcType=1은 `d_y=1−u(1−cos(latitude))`, 축 회전. 경도 helper 0753370·위도 경계 일부 미확정 |
| 5 SphereDiv / 62 | 07518d4 | DB3 선택 방향표; primEmitType 1=랜덤, 2=순차, 0=방출 index. 위도 필터가 표본을 거부할 수 있음 |
| 6 SphereDiv64 / 10 | 0751d7c→0752ed0 | DB4가 실제 표본 수를 선택; 이름과 달리 항상 64개가 아님. 선택표와 count−2 index 사용 |
| 7 SphereFill / 370 | 0751d9c | Sphere 방향에 `ρ=1−c+c√u`를 곱해 P 생성; V는 ρ와 무관. 체적 균등의 세제곱근 식이 아님 |
| 8 Cylinder / 78 | 07522f8 | Circle + `P_y=r_y(2u−1)`; V_y=0 |
| 9 CylinderFill / 57 | 0752378 | CircleFill + 랜덤 P_y; 높이를 추가한 뒤 V를 다시 정규화하지 않음 |
| 10 Box / 42 | 07523f8 | 첫 seed가 55555555/AAAAAAAA 경계로 Z/Y/X 면 선택, 다음 seed로 부호; 나머지 좌표는 −1~1. 면적 비례 표본이 아님 |
| 11 BoxFill / 115 | 0752588 | 아래 껍질 분할 식; V는 P 정규화(0이면 0) |
| 12 Line / 95 | 07527b4 | `ℓ=D[DD0]·E[470]; P_z=ℓ(u−(1+lineCenter)/2); V_z=vₐ`; 선은 Z축 |
| 13 LineDiv / 136 | 0752824 | `P_z=ℓ(h+j/(n−1)−(1+lineCenter)/2)`; n=1이면 h=0.5·역수=0, 그 밖 h=0. primEmitType 0의 j는 감소 전 n으로 나머지를 취함 |
| 14 Rectangle / 12 | 075293c | XZ 둘레의 X/Z 면 선택, 다른 축은 −1~1; V=P 정규화 |
| 15 Primitive / 92 | 0752a90 | `R[278]`의 위치/노말 배열(+30/+38)을 선택·형상 변환. 리소스 부재는 Point로 대체; 범위 밖 index 가지는 미확정 |

BoxFill은 `a=1−c`(a=1이면 0.999로 변경), `b=1−a`, `w=u₀(1−a³)`, `(x,y,z)=(u₁,u₂,u₃)`에서: w<b이면 `y=a+by`; w<b+ab이면 `y=ay; x=a+bx`; 그 밖 `y=ay; x=ax; z=a+bz`. 다음 3개 u가 각 성분 부호를 뒤집고 r을 곱한다. SphereDiv 두 방향표의 전체 수치·일부 경계는 미확정이다. sin/cos 표기는 원본 범위 축소·다항식 및 NEON 정규화의 수학적 요약이다.

**초기 속도·변환.** `074fea4`의 기본 방출(개별 행렬 override 없음), `isWorldOrientedVelocity=0`, diffusionDirAngle=0 가지:

```text
P₀ = Pshape + positionRandom·Qnext              # positionRandom≠0일 때만 Q 소비
V₀ = W[258]·(1−u·D[F5C]/100)
     ·(Vshape + xzDiffusion·normalize(Pshape.x,0,Pshape.z)
        + E[450]·W[25C]·D[F3C..F44])
     + Nnext⊙D[F50..F58]
     + capped(D[F60]·E[490..498]/Δt, D[F64])
     + inverse3x3(E[140/150/160])·W[1F0..1F8]
```

XZ 길이²≤2⁻²³이면 2개 LCG로 XZ 방향을 대신 뽑으며 xzDiffusion=0이면 이 분기를 건너뛴다. 속도 랜덤 u와 Nnext는 계수가 0이어도 소비한다. 이미터 이동 상속은 Δt>0일 때만 계산하고 `D[F64]`로 크기를 제한한다. 지정 방향을 무조건 정규화하지 않는다. diffusionDirAngle=A≠0은 추가 두 u로 `φ=2πu₁`, `cosθ=1−A/90+u₂A/90`를 만든 뒤 +Y→지정 방향 quaternion을 적용한다. world velocity·override 행렬·퇴화 quaternion의 전체 조합은 미확정이다.

`transRand`는 입자마다 더하는 상자 표본이 아니다. `073d770`이 이미터 회전 `D[CF8..D00]+(2u−1)⊙D[D04..D0C]` 3회, 이동 `D[CE0..CE8]+(2u−1)⊙D[CEC..CF4]` 3회로 이미터 행렬 `E[180..1FF]`를 만든다. `D[CC5]`가 켜지면 방출 간격 처리 `073dcec`에서 다시 뽑는다. 기본 입자는 로컬 P와 E의 변환 행을 보관하고 VS가 변환한다.

**크기·회전·수명.** `074f880`은 아래 순서로 생성 값을 작성한다.

```text
scale₀j = E[45C+4j]·W[1D0+4j]·(1−u_j·D[FAC+4j]/100)
m = 1 + D[E30] − 2u·D[E30]                     # momentumRandom: %가 아닌 이동 배율
b = E[28]
k = high32(uint64(oldSeed)·uint8(D[E2C]))
Lraw = E[420]·(1−0.01k)·E[E4]·W[5C]             # 정수 % 표본, 결과는 float
U = (uₓ,u_y,u_z,u_w)                            # 4회 LCG
θ₀ = R[1B0..1B8] + W[1B0..1B8]                # D[C30..C38]의 기본 회전 연결
```

크기 랜덤 xyz가 정확히 같으면 한 u를 공유하며 다르면 3회 뽑는다. m은 항상 1회, 유한 수명은 lifeRandom=0이어도 1회 소비한다. 무한 수명 플래그는 L=268435456(0x4D800000)이며 수명 난수를 건너뛴다. 수명은 UMULL→LSR→SCVTF→FMADD→STR S로 float에 저장한다(`074faf0..074fc34`); 디컴파일의 `(int)float` 표기를 정수 수명으로 해석하면 틀린다. 생성 콜백 `073ebe0`이 거부하면 L=0; 아니면 콜백 배율(`07589dc`, context+28)을 곱해 trunc(L)>0일 때 float L을 유지하고 그 밖 1로 보정한다. θ₀의 랜덤 증가·반전은 6.3의 VS가 U로 계산한다.

**시간·소멸·기본 적분.** `074e070`은 유효 serial이 있는 입자에 `age=E[28]−b`를 계산하고 age≥L이면 `073eb0c`(소멸/자식 처리), serial=0으로 끝낸다. 생존 입자는 `0755834` 이후 `073edb4` 콜백을 처리한다. `Δt=E[2C]`이며 age를 입자마다 임의로 1씩 증가시키는 방식이 아니다.

```text
P₁ = P + Δt·m·V                              # 감쇠·중력 적용 전 V
V₁ = (a==1 ? 1 : powf(a,Δt))·V                # a=D[110], abs/clamp 없음
if E[474] > 0: V₁ += Δt·C(E[474]·D[D90..D98])  # 중력에는 m을 곱하지 않음
필드 갱신 → 프레임 콜백 → 이동 tangent/그리기 속성 갱신
```

C는 로컬 중력(`D[D69]=0`)이면 그대로다. 월드 중력이고 followType=1이면 입자별 350/358/360 행렬의 열을 길이로 나눈 기저의 전치로 변환(0길이 열=0); 그 밖 E[140/150/160]의 행별 내적이다. tangent는 필드가 반영된 위치 차이를 사용하며 짧은 이동의 대체 방향·ε/δ 보정이 있다. **자식 상속의 속성 평가.** `074f278`은 부모의 scale₀/θ₀/U/L과 평가 시각을 읽어 크기·회전·색을 자식에 상속한다. 직접 부모를 읽는 가지의 시각은 `parent.now−parent.b−parent.Δt`이며 저장된 부모 context를 쓰는 가지도 있다. 이 보조 함수들을 CPU 매 프레임 루프의 호출로 일반화하지 않는다.

- `0755ccc`: `scale=scale₀⊙key(q)`; 키 수<2는 첫 xyz, 그 밖 `07534f0` 사용. q=age/L, scale 루프가 켜지고 period>0이면 `fmod(age+period·Uₓ·D[E55],period)/period`. 이후 FC5가 켜지면 X/Y fluctuation을 곱하며 Z는 유지한다. 자식의 D[D51]이 켜지면 평가 결과에 D[D64]를 곱해 자식 base scale을 덮는다.
- `07571ec`: fluctuation이 꺼진 기본 회전은 아래 식이다. CPU q=0 특례는 H=0이며 음수 q에도 `powf(q,t)`를 그대로 사용한다. GPU twinkle의 `abs(q)^t`·중심 이동한 랜덤 증가식(6.3)과 구별한다. 자식 D[D52]가 켜지면 평가 회전을 자식 θ₀에 쓴다.

```text
q=D[C5C]; H=t                         # q=1
q≠1: H=(1−(q==0 ? 1 : powf(q,t)))/(1−q)
ω=D[C50..C58] + D[C60..C68]⊙((Uₓ+U_y)/2,(U_y+U_z)/2,(Uₓ+U_z)/2)
γₓ=−1 if D[E1D]≠0 and U_z≥0.5 else +1
γ_y=−1 if D[E1E]≠0 and Uₓ≥0.5 else +1
γ_z=−1 if D[E1F]≠0 and U_y≥0.5 else +1
θ=γ⊙(θ₀+H·ω) + (U.xyz−0.5)⊙D[C40..C48]
```

회전 fluctuation은 [b22](../../../analysis/decomp/effect_runtime_b22.c)의 같은 07571ec에서 **θ₀에 먼저 더한 뒤 위 γ를 적용**한다. `F=R[270]`(packed Static, 원본 D보다 −70 오프셋), 축 j=0/1/2의 enable은 D[E7E+j], mode는 `D[E81+j]>>4`다. `τ_j=(F[C30+4j]+t)/F[C20+4j]+Uₓ·F[C40+4j]`이며 **모든 축의 랜덤 위상이 Uₓ**다. amplitude는 F[C10+4j]. mode0은 `φ_j=π·amplitude_j·SinCPU(2πτ_j)`, mode2/4는 `φ_j=π·amplitude_j·(τ_j−trunc(τ_j)<0.5 ? +1 : −1)`다. 그 밖 mode는 UnexpectedDefaultImpl로 간다. period=0 보호·입자 난수 재추출은 이 helper에 없다.

`SinCPU`의 입력 y는 `v=y−trunc(sign(y)·0.5+y/(2π))·2π`로 축소하고, v>π/2이면 π−v, v<−π/2이면 −π−v로 접는다. `z=v²`에 대해 `v·[1+z·((c₃+z·((c₁−z c₀)z−c₂))z−c₄)]`를 쓴다. 원본 `exefs/sdk`의 `nn::util::detail::SinCoefficients`(+8B56C4) f32 비트는 `[32D46A65,36391B32,39500FBD,3C088896,3E2AAAAB]`; π·2π·π/2·(2π)⁻¹은 각각 +8B6B14/+8B6B18/+8B6B1C/+8B6B24의 `[40490FDB,40C90FDB,3FC90FDB,3E22F983]`다. 기존 Ghidra NSO loader·MgmcommonData/CameraRefs로 읽었다. host sin으로 대체하는 식은 아니다.

- `0756134/0756990`: color0/1의 기본 RGBA는 D[F80..F8C]/D[F90..F9C]. RGB type=2는 수명/루프 위상의 키, type=3은 `uint32(Uₓ·keyCount)`번째 xyz; alpha type=2도 별도 키/주기로 평가한다. RGB에는 D[6A0]·호출자가 준 base RGB·이미터 애니 RGB, alpha에는 호출자의 base alpha·애니 alpha를 곱한다. FC4 fluctuation이 켜진 경로만 파형을 추가하고 최종 alpha를 0~1로 제한한다. 부모 색/알파를 선택적으로 자식 배열에 덮는 D[D54..D57]과 상속 분기의 실제 인수 조합은 추가 대조가 필요하다.

**필드 연결·순서.** `074c3a0`의 태그 로더와 `0755834`를 대조했다. R[BE]가 켜진 경우 실제 순서는 **FCOL→FRND→FRN1→FMAG→FSPN→FCOV→FCLN→FPAD→FGWD→FCSF**다. 아래 F는 해당 payload 시작, P/V는 각 필드 호출 시점의 값이다.

| 필드 / CPU 정의 수 | R 포인터 / 함수 | 확인한 갱신 |
|---|---|---|
| FRND / 883 | 308 / 0753be0→0757a70 | `P += A⊙Δwave`; 속도에 랜덤 힘을 더하는 식이 아님 |
| FRN1 / 151 | 310 / 0753d1c | age의 unsigned 정수 변환이 K의 배수이면 `V += A⊙Nnext`; Δt·m 없음 |
| FMAG / 10 | 318 / 0753ec0 | 활성 축(F[1/2/3])에 `V_j += Δt·k·((C_j−P_j)−V_j)`; k=F[4] 또는 애니 값, 목표 C=변환한 F[8..10] |
| FSPN / 317 | 320 / 0754528 | 위치의 축 평면 회전·반경 증가; V를 회전하지 않음 |
| FCOL / 188 | 328 / 0754958 | 평면 충돌·위치/속도·생성 시각·충돌 횟수 처리 |
| FCOV / 68 | 330 / 0754cc4 | `P += Δt·m·k·(C−P)`; k=F[10] 또는 애니 값, C=변환한 F[4..C] |
| FCLN / 35 | 340 / 0745630 | 위치·시간을 사용해 V 갱신; curl 전체 식 미확정 |
| FPAD / 0 | 338 / 07552f0 | `P += Δt·m·C(A)`; A=F[4..C] 또는 애니, 월드/로컬 변환 |
| FGWD / 2 | 348 / E[3B8/3C0] | 등록 함수 포인터 호출; 개별 구현 미확정 |
| FCSF / 0 | 350 / E[3C8] | 등록 함수 포인터 호출; 개별 구현 미확정 |

FRN1은 A=F[0..8], K=F[C] u32, 애니 enable/loop/phase/keyCount/period/interp/keys=F[10/14/18/1C/20/24/28]이다. 비루프 위상 age/L, 루프 위상 `fmod(age+period·Uₓ·phase,period)/period`; 키 수 0은 A=0, `07534f0`이 키를 평가한다. K=0인 CPU UDIV 가지는 age의 정수 값이 0일 때만 발동한다. 6.3의 wave CS는 K=0이면 힘을 끄므로 같은 식이 아니다.

FRND의 기본 가지(F[0]=0, F[1]=0)는 A=F[4..C], K=F[10], `ν=DAT_7101c405f8/K`, `x_j=(t*+K·U_j)ν`에서 아래 차분을 P에 더한다(`0758470`). ν의 전역 분자 값은 아직 확인하지 않았다.

```text
B(x)=4sin(1.6666666x)+3sin(2.3809524x)+2sin(4.347826x)+1.5sin(6.6666665x)
Δwave_j=B(x_j+Δtν)−B(x_j)
t*=age                                      # F[2]=0
F[2]≠0: a*=a+(1−Δt)(1−a); t*=(1−powf(a*,age))/(1−a*)  # a*=1이면 age
```

F[1]≠0은 `Σ F[1C+4k]·sin(x/F[2C+4k])`의 차분(`0758030`), F[0]≠0은 이미터 시각 E[28]과 F[14]/100·K, F[18]/100·K 및 축 위상 `(0,0.31415,0.92653)·K`를 사용한다(`0758260`); 후자의 전체 조합은 남음. A 애니 enable/loop/phase/keyCount/period/interp/keys는 F[3C/40/44/48/4C/50/54]다.

FSPN은 angle=F[0], axis=F[4] u32, radial=F[8]; angle 애니(F[C..])를 평가한 값만 π/180을 곱하며 고정 angle은 그대로 라디안이다. `θ=Δt·m·angle`, `ρ=Δt·m·radial`. 축 0은 `(y,z)→(cy+sz,cz−sy)`, 1은 `(x,z)→(cx−sz,sx+cz)`, 2는 `(x,y)→(cx+sy,cy−sx)`(c=cosθ,s=sinθ). 회전 후 평면 길이 r>0이면 `1+ρ/r`을 곱한다. radial 애니는 F[A4..BC]다.

FCOL은 F[0] 모드, F[1] 월드 평면, F[4] 높이, F[8] 반발, F[C] 최대 충돌 횟수(−1=무제한), F[10] 속도 배율이다. 로컬 평면 P_y<높이·모드0은 P_y=높이와 `V=배율·(Vₓ,−반발·V_y,V_z)`, 충돌 횟수+1. 모드1은 P_y=높이와 **b=age**를 기록하고 반환한다; 즉시 소멸로 단정할 수 없다. 월드 평면 변환과 FMAG/FCOV 목표의 follow/좌표 옵션 조합은 미확정이다.

**이미터 애니.** `074c3a0`의 포인터와 `074d580→0753630`의 출력 연결:

| 태그 | R 포인터 → E의 xyz 출력 | 초기값 |
|---|---|---|
| EAES / EAER / EAET | 358/360/368 → 3D8/3E4/3F0 | 이미터 scale / rotation / translation |
| EAC0 / EAC1 | 370/378 → 3FC/408 | color0 / color1 |
| EATR / EAPL | 380/388 → 414/420 | timeRate / particle life 최대값 |
| EAA0 / EAA1 | 390/398 → 42C/438 | alpha0 / alpha1 |
| EAOV / EADV | 3A0/3A8 → 444/450 | allDirection / designatedDirScale |
| EASL / EASS / EAGV | 3B0/3B8/3C0 → 45C/468/474 | particle scale / shape scale / gravityScale |

payload +0 enable, +1 loop, +2 interpolation, +4 keyCount, +C 첫 xyz, +18 첫 time. E[28]로 평가하며 루프는 마지막 key time의 fmod, interpolation=0 선형·1 이전 키 유지다. EASS에는 W[190..198], EAOV에는 W[254] 배율이 적용된다. EATR의 전체 시간 전달·상속/콜백 옵션은 남음.

**자식 속성의 현재 나이 평가** [판독: 074f278·0755ccc·0756134·0756990·07571ec, b4]

부모 생성 payload와 현재 부모 속성을 선택하는 E[30] bit17 분기가 있다. 현재 부모를 읽는 경로는 `age=(parent.E[28]−birth)−parent.dt`, `L=meta.life`로 다시 평가한다. D[D50]이면 `V_child += D[D60]·V_parent`; D[D51]이면 `scale_child=D[D64]·ScaleEval(L,age,baseScale,U)`; D[D52]이면 `RotationEval(age,θ₀,U)`를 자식 회전 속성에 기록한다. D[D54/55]는 color0/1 RGB, D[D56/57]는 각각 alpha를 독립적으로 상속한다. color helper 인수는 부모 E[42C]·E[B0/C0] 및 E[3FC..404] 곱셈 계수이며, 부모의 완성 RGBA를 생성 시점에 한 번 복사하는 식으로 대체하지 않는다.

크기 helper는 키가 2개 이상이면 `s=s_base·Key((age+period·U·randomPhase) mod period / period)`(loop>0), 아니면 `s=s_base·Key(age/L)`; 단일 키는 곱셈만 한다. fluctuation은 `τ=(phase+age)/period+U·randomPhase`, `q=τ−trunc(τ)`를 사용한다. mode0의 배율은 `1−A·(CosCPU(2πτ)+1)/2`, mode1은 `abs(1−Aq)`, mode2는 `abs(1−A·(q<0.5 ? 1:0))`. scale fluctuation은 X/Y에 적용하며 FC6=0이면 같은 배율, FC6!=0이면 Y의 별도 amplitude/period/phase를 사용한다. alpha helper는 같은 세 mode 후 [0,1]로 clamp한다. `CosCPU`는 원본 범위 축소·계수 다항식이며 host cos로의 대체는 비트 동등하지 않다.

회전 fluctuation이 없는 기본 누적은 `θ_j=σ_j·θ₀,j+randInit_j·(U_j−0.5)+G(age)·σ_j·ω_j`, `G=t`(regist=1), 그 밖 `(1−powResult)/(1−regist)`다. regist≠0이면 `powResult=regist^t`, 0이면 원본이 1로 두므로 G=0이다. `ω=rotateAdd+randAdd⊙((U_x+U_y),(U_y+U_z),(U_x+U_z))/2`; rotRevRand X/Y/Z가 켜지고 각각 U_z/U_x/U_y≥0.5이면 해당 σ=−1, 아니면 +1이다. 회전 fluctuation 채널·파형은 위 07571ec 계약을 사용한다. 색 키 보간 모드 전체는 남은 항목이다.

[정정 2026-10-10] [판독: 어셈블리] FRND DAT_7101c405f8의 분자 writer는 main.nso @0x71007588c0~0x71007588d8의 FloatPi+FloatPi=6.2831854820251465다. CS0의 kappa=6.283184051513672와 구별한다. 전역 분자 공백은 해소됐고 원본 공유 seed 초기 상태·생성/계산 콜백 선후는 별도 미확정이다. (근거: [plaza_intro.md](../shell/plaza_intro.md) §10.4·§13.2)
→ 광장 첫 진입 정리: [plaza_intro.md](../shell/plaza_intro.md) §10.4·§13.2

### 6.3 입자 프로그램별 운동·시간·키 [판독]

기존 광장 분석의 [sass_dis.py](../../tools/analysis/sass_dis.py)·[bnsh_sass.py](../../tools/analysis/bnsh_sass.py)를 재사용했다([plaza_3d.md](../shell/plaza_3d.md) 6.8·6.13, [charselect.md](../shell/charselect.md) 12.11). BNSH 변형 번호는 0부터이며 VS/FS/CS 단계는 1/5/6이다. 이 절의 주소·슬롯 오프셋은 16진수다. 아래 주소는 해당 BNSH 파일 시작 기준 코드 헤더 주소 `pa`; VS/FS 명령은 `pa+0x80`, 이 CS는 `pa+0x100`부터다. `c[n][offset]`·`a[offset]`은 실제 SASS 슬롯이며 BFSHA 재질용 도구의 의미 이름을 이펙트에 적용하지 않았다.

| 자원·이미터 | 변형 → VS pa | 위치 reader / 계산 |
|---|---|---|
| mg1800 ring 계열 | 0~3,9,10→15000; 6,7→17C00 | calcType 0, 현재 `a[80..88]`; 속도 적분 없음 |
| mg1800 twinkle00/01 | 4,5,11→16200 | calcType 1, 아래 해석식; 세 변형 VS 코드 동일 |
| mg1800 twinkle02 | 8→18C00 | calcType 1, 같은 위치 해석식; 키·흔들림·FS는 별도 |
| mg1801 steam00 / steam01 | 0,1→38000 / 6,7→3DA00 | calcType 0, 현재 `a[80..88]` |
| steam00 bubble00 / 자식 crown00 | 2,3→39900 / 4,5→3BC00 | calcType 0, 중심 `a[A0..A8]` / `a[B0..B8]`, 메시 정점은 각각 `a[90..98]` / `a[A0..A8]` |
| water_entry00/01 shader00 | 8→3EE00 | calcType 0, 현재 중심 + 입자별 3×4 변환 `a[D0/E0/F0]` |
| splash01 / splash02 / bubble00 | 9,10→40900 / 11→41D00 / 12→43800 | calcType 0, 현재 위치; 커스텀 정점 변환·속성 배치는 프로그램별로 다름 |
| wave00 | 13,14→44900; CS 0→3000 | calcType 2, 아래 CS가 `P,V`를 갱신하고 VS는 현재 `a[80..88]`을 읽음 |
| wave01 / white_wave00 | 15→45D00 / 16→46F00 | calcType 0, 현재 `a[80..88]`; XZ 판 변환(6.4) |
| mg0508 success ring / ring01 | 18~21→3C700 / 22,23→3DB00 | 모두 calcType 0, 현재 `a[80..88]` |
| mg0508 success twinkle00/01 / 02 | 24,25→3ED00 / 26,27→40600 | 모두 calcType 0, 현재 `a[80..88]`; mg1800 해석식과 별개(7.5) |

mg1801은 17변형/11종 VS, mg1800은 12변형/4종 VS다. 동일 주소 묶음은 코드 바이트도 동일하다. CPU 계열 VS에는 아래 중력·공기저항 적분이 없다. 이 관찰만으로 CPU 갱신부의 힘·적분식을 확정할 수는 없다.

**mg1800 twinkle 해석식.** `c[9]`는 EmitterData의 절대 오프셋을 유지한 Static, `c[A]`는 동적 인스턴스 상수다.

| 입력 | 슬롯 / 의미 |
|---|---|
| 초기 위치·수명 | `a[80..88]=p₀`, `trunc(a[8C])=L`(signed int) |
| 초기 속도·생성 시간 | `a[90..98]=v₀`, `a[9C]=b` |
| 크기·이동 배율·난수·회전 | `a[A0/A4]=s₀x/s₀y`, `a[AC]=m`, `a[B0/B4/B8]=rₓ/rᵧ/r_z`, `a[C0..C8]=θ₀` |
| 시간·힘 | `now=c[A][20]`, `τ=c[A][2C]`, `a=c[9][110]`, `g=c[9][100..108]·c[9][10C]` |

```text
t = now − b; T = t + τ
if L <= 0 or t >= L or b > now: 그리기 제외
if a == 1: F = T; G = T²/2
else:
  E = exp2(T·log2(abs(a)))
  F = (1−E)/(1−a)
  G = (T−(E−1)·1.4426950216293335/log2(a))/(1−a)
p = p₀ + m·(v₀·F + g·G)
```

위 수명 분기는 출력 알파를 0, clip xyz를 0, w를 `5·c[8][1E4]`로 만든 뒤 종료한다(VS +28~F8). 풀 슬롯 삭제 식은 아니다. `a>0`이면 `E=a^T`, `G=(T−(a^T−1)/ln(a))/(1−a)`로 읽을 수 있다. 원본은 `a==1`을 정확히 비교하고 거듭제곱에는 `abs(a)`, G의 로그에는 `a`를 쓴다(+1B0~4D0). `a<=0`을 임의 clamp하지 않는다. MUFU/RRO·FTZ/FMA의 유한 정밀도까지 위 수학 표기가 보장하지는 않는다.

실제 mg1800 twinkle은 `a=0.949999988079071`, gravityScale=0, allDirection=1.5, 이미터 scale=0.05다. `F(1)=1`이므로 `v←a·v+g; p←p+v` 근사와도 첫 프레임부터 다르다. `m,r,θ₀`는 6.2의 공통 writer에서 연결됐으며 r=U.xyz다. τ는 6.4의 동적 UBO writer 인수이며 호출 모드별 시간 전달은 일부 남았다. VS 내부에는 새 난수를 생성하는 연산이 없다.

**wave00 CS 상태 갱신.** 포인터는 `c[0][270/274]=S`(Static), `[280/284]=D`(동적), `[290/294]=F`(필드), `[310/314]=P`, `[320/324]=V`, `[330/334]=d`, `[340/344]=M`, `[350/354]=U`다. 입자 배열 stride는 16 B; `i=32·blockIdx.x+threadIdx.x`, 상한은 `trunc(D[24])`다. `P.w=L`, `V.w=b`, `M.w=m`, `U.xyz=(uₓ,uᵧ,u_z)`이며 U를 읽기만 한다.

```text
t = D[20] − V.w; Δt = D[28]; L = trunc(P.w)
if i >= trunc(D[24]) or L <= 0 or t > L or t < 0: 갱신 생략
P′ = P.xyz + Δt·m·V.xyz                        # 이전 속도로 먼저 이동
V′ = exp2(Δt·log2(abs(S[110])))·V.xyz + Δt·g + N
K = trunc(F[5C]); A = F[50..58]; κ = 6.283184051513672
if K != 0 and trunc(t) % K == 0:
  Nₓ = Aₓ·sin(κ·(u_z−0.5) + u_z·t²)
  Nᵧ = Aᵧ·sin(κ·(uₓ−0.5) + uᵧ·t²)
  N_z = A_z·sin(κ·(uᵧ−0.5) + uₓ·t²)
else: N = 0
```

`g=S[100..108]·S[10C]`. N에 Δt나 m을 곱하지 않으며 축별 위상 교차도 그대로다(CS +448~670). K=0은 정수 나머지 경로가 −1을 선택해 힘을 끈다. CS의 `t>L`과 VS의 `t>=L` 경계가 다르므로 t=L에서 갱신해도 그려지지 않는다. 버퍼 슬롯의 생성·회수는 이 코드에 없다.

`tangent d′=P′−P`를 일단 저장하고 퇴화 보정 뒤 다시 쓴다(+6F0~730, +970~978). `ε=9.999999974752427e−7`, `δ=0.0010000000474974513`(파일 +3B00의 c[1][0/4]): `|d′|<ε`이면 t≠0일 때 이전 d를 유지한다. t=0이면 gravityScale>0에서 `ε·normalize(gravityDir)`, 그 밖에는 V′, P′ 순으로 길이≥ε인 벡터를 정규화하며 둘 다 짧으면 `(0,ε,0)`이다. 일반 분기에서 `0<Δt·|V′|<δ`이고 `|d′|<δ`이면 `d′=Δt·V′`로 보정한다. CS에는 월드/로컬 행렬 변환이 없다.

wave00 데이터는 airRes=1, gravityScale=0이다. 기존 `FUN_71007491a0` writer([effect_vfx2_calc.c](../../../analysis/decomp/effect_vfx2_calc.c) 1710~1715행)의 `R[310]` payload xyz→필드 `[50/54/58]`, payload +C i32→float `[5C]`를 확인했다. 따라서 이 프로그램의 `A=(0.0003,0,0.0003)`, `K=1`이다. 초기 V/U/m도 6.2의 공통 작성부가 공급한다. CPU FRN1의 N 테이블 힘을 이 CS에 대입하지 않는다.

**색·알파·크기 키와 루프.** `FUN_71007491a0`는 Static 복사 뒤 다음 값을 쓴다([effect_vfx2_calc.c](../../../analysis/decomp/effect_vfx2_calc.c) 1253~1353행, 고정색·키 패딩은 같은 함수 앞부분).

| 채널 | 주기 P 슬롯 ← 원본(활성 플래그) | 랜덤 위상 Q 슬롯 ← 원본 |
|---|---|---|
| color0 / alpha0 | B0 / B4 ← E5C / E5E (E48 / E49) | C4 / C8 ← E51 / E52 |
| color1 / alpha1 | B8 / BC ← E60 / E62 (E4A / E4B) | CC / D0 ← E53 / E54 |
| scale | C0 ← E64 (E4C) | D4 ← E55 |
| 추가 애니 4채널 | E0/E4/E8/EC ← E68/E6C/E70/E74 (E4D~E50) | F0/F4/F8/FC ← E56~E59 |

비활성 P는 0, 활성 P는 원본 정수(color/alpha는 u16, scale/추가 애니는 i32)를 float로 변환한다. Q는 플래그의 0/1이다. 파서가 E54/E58 등을 u32로 읽은 이름이나 파일의 0인 B0~FF 값을 런타임 값으로 사용하면 틀린다. 확인한 VS의 채널 위상은 `P>0 ? fract(t/P + r·Q) : t/L`; 주기 100을 임의로 `100%·life`로 바꾸지 않는다. 채널별 r 선택은 별도 속성 reader다.

키 구간은 `FSET.GE`와 `(q−tᵢ)/(tᵢ₊₁−tᵢ)`·FMA로 **선형 보간**한다. 유효 키 시간이 증가하는 표본에서는 첫 키 이전은 첫 값, 마지막 키 이후는 마지막 값이다. 초기화 시 고정 색/알파를 첫 키 슬롯(6B0/730/7B0/830)에 쓰고, 1~7키 채널의 남은 슬롯은 마지막 xyz와 `마지막 time + 슬롯 번호`로 채운다. 원본 파일의 0 패딩을 그대로 보간하지 않는다. 크기는 입자 base scale×키 배율, 색은 키×동적 color0/1(`c[A][0..1C]`)×Static colorScale(6A0), 알파는 동적 fade(30) 등이 뒤에 적용된다.

mg1800 twinkle 변형 4의 회전 reader(+C30~1108)는 저항 q=`c[9][C5C]`에 대해 q=1이면 H=t, q=0이면 H=0, 그 밖에는 `H=(1−abs(q)^t)/(1−q)`다. `S=c[9]`, `bit(S[70],n)`은 비트 n의 0/1, `Bⱼ=sign(floor(2rⱼ))`일 때:

```text
σₓ = 1−2·bit(S[70],28)·B_z
σᵧ = 1−2·bit(S[70],29)·Bₓ
σ_z = 1−2·bit(S[70],1)·Bᵧ
ωₓ = S[C50] + (rₓ+rᵧ−1)·S[C60]
ωᵧ = S[C54] + (rᵧ+r_z−1)·S[C64]
ω_z = S[C58] + (rₓ+r_z−1)·S[C68]
θ = σ ⊙ (θ₀ + H·ω) + (r−0.5) ⊙ S[C40..C48]
```

⊙은 성분별 곱이다. 속성 r=U.xyz·θ₀의 CPU 작성은 6.2와 연결된다. 데이터의 q=1, rotateAdd.z=0.1745329201221466에서는 랜덤 증가/부호 반전이 없는 Z 증가분이 10°/프레임이다. 이 회전 reader를 다른 프로그램에 일반화하지 않는다.

twinkle00/01의 X 흔들림은 cycle=9, amplitude=0.7, phaseRandom=0; 02는 5, 0.75, 1이다. 판독한 X reader에서 `h=(t+S[148])/S[138]+rₓ·S[140]`이며 flags1 비트 0/1/2가 각각 아래 항을 선택해 더한다. 비트 조합을 하나의 파형 enum으로 단정하지 않는다.

```text
cos 항 = 1 − A·(0.5+0.5·cos(6.2831854820251465·h))
saw 항 = abs(1 − A·fract(h))
square 항 = abs(1 − A·(1 − I(fract(h)>=0.5)))
```

변형 4의 X base는 `a[A0]+sat(max(0,rₓ))`, Y는 `a[A4]`이고 키·선택된 흔들림·동적 scale `[34/38]`을 곱한다. 이 보정과 Y 흔들림 유무를 다른 프로그램에 일반화하지 않는다.

### 6.4 좌표계·픽셀식과 판독 경계 [판독]

mg1800 twinkle·고리와 mg0508 success는 중심을 `c[A][E0..10C]` 행렬과 `[110..11C]` 가산 벡터로 변환한다. 확인한 twinkle billboard 0 변형 4는 `c[8][180..1AC]` 기저와 `c[A][120/130/140]` 기저 길이(SQRT)를 사용하고 `[150..158]` 가산 뒤 `c[8][0..3C]` 투영으로 간다. mg1801 steam/wave 계열은 중심에 `[40..6C]`, 물결 도형에 `[80..AC]`를 사용한다. 동적 UBO writer `074ef00`의 아래 연결을 확인했다. 6.2의 기본 초기 P는 로컬이며 개별 override/follow 조합 전체는 남아 있다.

| 동적 UBO | CPU 작성 원본 |
|---|---|
| 20 / 24 / 28 / 2C | E[28] / active count / 인수2 / 인수1 |
| 40..6C | 4개씩 `(E[100],E[110],E[120],E[130])`, `(104,114,124,134)`, `(108,118,128,138)` |
| 80..AC | 위와 같은 전치 배치, 시작 원본 140/150/160/170 |
| E0..11C | E[200/210/220/230] 각 행의 xyz를 복사하고 w=0/0/0/1 |
| 120..15C | E[280/290/2A0/2B0] 각 행의 xyz를 복사하고 w=0/0/0/1 |

인수1=0이고 E[28]>0이면 `[20]=E[28]−E[2C]`, `[2C]=E[2C]`로 보정한다. 따라서 VS의 τ=`[2C]`와 CS의 Δt=`[28]`은 writer의 서로 다른 인수이며 동일하다고 단정하지 않는다. 상위 `074d010`의 모든 follow·월드/로컬 행렬 조합 및 카메라 제출 연결은 아직 미확정이다.

wave00 VS +838~B30은 로컬 Euler 변환 `Rᵧ·Rₓ·R_z` 뒤 `(x,y,z)→(x,z,−y)`를 적용한다. 회전 0이면 XY 사각형이 XZ 판이 된다. wave00 이미터 자체 회전은 0이며 white_wave는 Y=π/2이므로 XZ 배치를 이미터 X 회전으로 설명할 수 없다. billboard 3의 bubble/crown은 메시 정점·입자 변환을 읽는 경로이며, 5/6/7/10 및 열거형 전체는 미확정이다.

**wave00/01 flowmap FS**(변형 13/15, pa=45900): VS에서 받은 normalized age의 `h=fract(t/L)`로 아래 UV를 계산한다. flow는 sampler1(handle A)의 RG, tex는 sampler0(handle 8)이다.

```text
d = flow·0.7400000095367432 − 0.3700000047683716
T₀ = tex(UV − d·h); T₁ = tex(UV − d·fract(h+0.5))
w = 0.5 + 0.5·cos(6.2831854820251465·h)
T = T₀ + (T₁−T₀)·w
RGB = T.rgb·vertexColor0.rgb
alpha = sat(T.a·vertexAlpha0)·vertexFade
alpha <= c[9][8D8]이면 discard
```

0.74는 파일 +45C00의 c[1][0], 0.37은 immediate 0x3EBD70A4다. 흐름맵은 UV를 바꾸며 입자 위치의 힘 N과 별개다.

mg1800 twinkle FS 변형 4(pa=17A00)는 `RGB=C₁+tex.rgb²·(C₀−C₁)`, `alpha=sat(sat(tex.r²·C₀.a)·fade)`다. 변형 8/11(pa=1A500)은 같은 구조에서 tex를 제곱하지 않는다. 따라서 컴바이너를 일괄 `tex·color0`로 확정할 수 없다. shader00 FS의 `c[D][0..8]` 색 계수 등 CSDP reader 일부는 보이지만, CSDP payload 전체 배치·버퍼 작성부·노말/깊이 조합은 아직 미확정이다.

분석 범위는 표의 실제 프로그램과 해당 경로다. mg0508의 oil/fire GPU와 smoke CS는 이 표의 success와 다른 코드이며 운동식을 공유한다고 확인하지 않았다. CPU 공통 경로와 writer 연결은 6.2에 통합했으며 남은 좌표·필드·프로그램 분기는 11절에 구별했다.

---

### 6.5 추가 billboard 대표·정렬·draw state

v53의 공식 enum 이름은 확보하지 못했다. 참고 이름은 `tools/oss/EffectLibrary/EffectLibrary/Enums.cs`의 구판 0~8이며, 아래 동작 구분은 실제 프로그램의 설명이다.

각 `.bnsh`는 2절 원본 `_Vfx` 경로의 동반 파일이다. 기존 `bnsh_sass.py`로 VS(stage1)를 읽었다. 표의 주소는 BNSH 기준 stage blob 시작이며 SASS PC는 +0x80 뒤 명령 기준이다. 별도 계산식·shader define를 가진 같은 billboard 값에 표의 대표 식을 확대 적용하지 않는다.

| billboard | v53 동작 구분 / 참고 이름 | 정의·프로그램 근거 | 판독 범위 |
|---|---|---|---|
| 0 | 카메라 basis quad / 구판 Billboard | 기판독 mg1800 twinkle (6.3) | 카메라 basis의 회전·크기 적용 보존 |
| 1 | 카메라 위치 방향 quad / 구판 PlateXY와 불일치 | ca00_fountain_00 / ca00_waterfall01, k37 @150A00, PC05F8..0AD0 | 중심 `P_w=M_A·P`(c[A]40..6C). 법선 `n=normalize(c[8]1D0..1D8−P_w)`, 오른쪽 `r=normalize(n×(−c[8]10..18))`, 두 번째 축 `n×r`. 코너 ±0.5·scale·offset의 방향축을 만든다. 이 대표는 sin/cos·C30..68 회전 reader가 없고 두 normalize에 zero/parallel fallback이 없다 |
| 2 | strip payload / 구판 PlateXZ와 불일치 | mg1607_rock_hit00 / Light_Shaft00, k7 @3A900, PC0008..03D0 | 일반 quad 속성 대신 **0x30 B strip payload**: `i=int(c[C]48·c[C]5C)+(vertexID>>2)`, P=record[0..8], V=record[10..18], 폭=abs(record[0C]). `n=normalize(V)`, `r=normalize(n×c[8]1C0..1C8)`, 양측 `P±width·r/2`. `(c[9]74 & 0x100000)==c[1]00` 조건(P0)이면 `normalize(cameraPos−M_A.translation)·c[9]12C`를 추가. 연속 strip UV는 `(vertexID>>2)/(c[C]44−1)` |
| 3 | 메시·입자 변환 / 구판 DirectionalY를 그대로 적용 불가 | 기판독 mg1801 bubble/crown (6.4) | 실제 메시 속성·입자 변환; 전체 모드 미확정 |
| 4 | XZ 판 / 구판 DirectionalPolygon을 그대로 적용 불가 | 기판독 mg1801 wave (6.4) | 로컬 `(x,y,z)→(x,z,−y)` 보존 |
| 5 | tangent 방향 + 카메라 cross / 구판 Stripe를 그대로 적용 불가 | bd00_dice_cursed_decide00 / 02_line00, k5 @20F600 | `d=normalize(M_A.xyz·a[D0..D8])`(PC0818..0AD8), `r=normalize((−c[8]1C0..1C8)×d)`(PC0BB0..0DB8). `B=[r,d,r×d]·R_x(θₓ)·R_z(θ_z)·R_y(θ_y)`(PC0DC8..0FF8). 두 normalize에 zero/parallel fallback이 없다. 각도 입력은 아래 식 |
| 6 | 입자 행렬 축 정규화 / 구판 ComplexStripe를 그대로 적용 불가 | bd00_dice_hit00 / sparks00, k30 @223D00, PC0108..0368 | a[D0..D8] 위치를 a[E0/F0/100]의 세 행으로 변환. 행렬의 Y열 `(E4,F4,104)`, Z열 `(E8,F8,108)` 길이를 각각 계산하고 >0인 축만 정규화(아니면 0). `n=normalize(M_p.xyz·a[D0..D8])`, `r=normalize(n×Y′)`; 최종 `M_p·(a[80..88],1)+r·x+n·y+(r×n)·z`. Y′의 조건·상수는 아래. 별도 sin/cos·C30..68 회전 reader 없음 |
| 7 | 카메라 yaw + 3축 회전 / 구판 Primitive를 그대로 적용 불가 | bd06_fireball_down00 / glare00, k44 @1C5900 | `R_x(θₓ)·R_z(θ_z)·R_y(θ_y+ψ)`; θ_z=PC0F50 R14, θ_y+ψ=PC0F90 R6, θₓ=PC0F70 R7. yaw의 원본 유리식·0/∞ 분기는 아래. depth varying=`projectedZ−c[8]1F8`(PC12A8) |
| 8 | 원본 의미 미확정 / 구판 YBillboard | 전체 정의 0개 | 대응 v53 프로그램 부재. 이름/축을 구판에서 이식하지 않는다 |
| 9 | 원본 의미 미확정 / 구판 대응 이름 없음 | 전체 정의 0개 | 대응 v53 프로그램 부재. 지원 완료로 세지 않는다 |
| 10 | Y 기준 카메라 basis / 구판 대응 이름 없음 | mg1806_spot_00 / glare00, k21 @71000, PC0210..0568 | `f=normalize(c[8]20..28)`. c[8]14 부호에서 선택한 Y축과 cross로 r을 만들고 정규화, 퇴화 판정이면 normalize(c[8]00..08)로 fallback. `up=f×r`; 코너 크기·offset으로 `P_w+r·x+up·y+f·z`를 만든다. 입력 위치의 입자별 행렬 reader도 PC0378..0550에 존재 |

**대표 5·7의 상류 각도.** 6.2의 writer가 `U.xyz=a[B0/B4/B8]`, `θ₀=a[C0..C8]`를 작성한다. [b21](../../../analysis/decomp/effect_runtime_b21.c)의 074ba80은 D[E1D/E1E/E1F]를 D[70] bit28/29/30으로 바꾸고, 07491a0이 이를 UBO에 복사한다. rotateX/Y/Z=false(D[E20..22])는 대응 C30/C40/C50/C60/C80/CA0/CB0를 0, C90을 1로 초기화한다. 대표 5·7은 **C80..CB8 fluctuation reader가 없으며** 아래 누적·난수만 읽는다.

```text
t=emitterTime−birth; q=c[9][C5C]
H=t (q=1); H=0 (q=0); 그 밖 H=(1−abs(q)^t)/(1−q)
f(r)=sign(floor(2r)); eₓ/e_y/e_z=D[70] bit28/29/30
σ=(1−2eₓf(U_z), 1−2e_yf(Uₓ), 1−2e_zf(U_y))
ω=(C50,C54,C58)+(C60,C64,C68)⊙(Uₓ+U_y−1,U_y+U_z−1,Uₓ+U_z−1)
θ=σ⊙(θ₀+H·ω)+(U.xyz−0.5)⊙(C40,C44,C48)
```

오른쪽 Cxx는 `c[9][Cxx]`다. q의 pow 경로는 LG2→RRO.EX2→MUFU.EX2, 회전은 RRO.SINCOS→MUFU.SIN/COS다. 대표 5의 PC07C8..0CF8, 대표 7의 PC05D0..0D68에서 성분·부호·분기를 연결했다. CPU의 ω 평균식·signed pow(6.2)를 GPU 식으로 바꾸지 않는다.

**대표 6의 퇴화 분기.** `M_p`는 a[E0..10C]의 3×4 속성 행렬이다. Y/Z열 각각 길이>0이면 정규화하고 아니면 0으로 둔다(PC0208..0368). n은 이 행렬의 선형부로 변환한 a[D0..D8]를 **무조건 RSQ**한다(PC08C8..0918). `|dot(n,Y)|>c[1][00]`일 때만 `Y′=Y+c[1][04]·Z`, 아니면 Y′=Y(PC0958..0988), r은 n×Y′를 무조건 RSQ한다(PC0AE0..0B90). **[데이터]** k30의 control @054F10+700은 code blob 상대 offset `1100`이며 그 위치(파일 224E00, 명령 시작+1080)에 f32 비트 `3F7FF972,3A83126F`가 있다(`0.9998999834060669,0.0010000000474974513`). **[미확정]** 이 offset 필드→c[1] base 연결을 읽는 NVN shader loader C는 아직 연결하지 않았다. 필요한 최소 근거는 해당 control 필드 reader다. `bnsh_sass.disasm`의 오류 기반 풀 분리는 이 blob 전체를 성공 처리해 빈 풀을 반환하므로 두 값을 0으로 확정할 수 없다. 입력 축의 zero guard와 n/cross의 무조건 정규화는 서로 다른 분기다. 임의 수직축 fallback은 없다.

**대표 7의 yaw ψ.** `x=c[8][1C0], z=c[8][1C8]`. PC0AF0/0C78은 **둘 다 0**을 검사해 ψ=0(z<0이면 π, x<0이면 부호 반전)을 고른다. 둘 다 |∞|이면 z≥0에서 π/4, z<0에서 3π/4를 선택하고 x<0에서 부호 반전한다(PC0DD0..0E30). 그 밖 경로는 `m=max(|x|,|z|), n=min(|x|,|z|)`; m≥16이면 둘 다 1/16로 줄이고 `u=n·MUFU.RCP(m), v=u²`를 계산한다.

```text
N(v)=v·(−0.8233629465103149·v−5.674867153167725)+−6.565555095672607
D(v)=v·(v·(v+11.33538818359375)+28.84246826171875)+19.696670532226562
a=u+u·v·N(v)·MUFU.RCP(D(v))
|x|>|z|이면 a=1.5707963705062866−a
z<0이면 a=3.1415927410125732−a; x<0이면 a=−a; ψ=a
```

원본 즉시값 40B59883과 c[1][08..14], FFMA/FTZ·RCP 순서의 정규형이다(PC0E38..0F38). `atan2` 호출은 이 명령열을 대체하지 않는다. NaN·signed zero의 결과나 비트 동등성은 위 predicate/MUFU 계약에 남겨 두며 host 수학 함수로 확정하지 않는다.

**정렬** [판독: 073e3a0→0745100, b2·b3]

| D[CC1] | 키·순서 |
|---|---|
| 0 | 정렬하지 않고 instancing. ring buffer가 감기면 두 구간으로 draw |
| 1 | 속도 속성 vec4의 w(6.2의 생성 시각 b)를 key로 **내림차순**, 같으면 입자 index 오름차순(073fe30) |
| 2 | key=`cameraRowZ·(M_follow·P,1)`; D[E0B] depth-write가 0이면 내림차순(0741ee0), 켜지면 오름차순(0740d30). **두 key가 모두 음수이면 비교 방향을 뒤집는 원본 comparator**도 보존해야 한다 |
| 3 | 같은 속성 w key 오름차순, 같으면 index 오름차순(073ef30) |
| 4 | E[3D0] 등록 콜백. 전체 데이터 사용 0개, 의미는 미확정 |

정렬 대상 필터는 `(E.time−E.dt)−birth < life`; 실제 draw 필터는 `meta.valid && life>0 && E.time−birth<=life`다. VS의 `age>=life` 제거 및 CPU 갱신 경계와 각각 다르다. emitter 사이/장면 전체 투명 오브젝트 정렬로 대체하면 이 순서가 보존되지 않는다.

**제출 상태·레이어** [판독: 0744910·0743fd8·0743af0, b2·b3]

- 렌더 state override 값이 −1일 때 R[1F8]·R[220]·R[23C]를 각각 087d430/087d4d4/087d32c에 제출한다. vertex state는 R[C8+bufferIndex·20]. 프리미티브가 없으면 4정점 instance draw, 있으면 primitive vt+58/+60 경로다.
- static UBO는 0xCC0 B, 현재 emitter UBO는 0x160 B, 추가 resource UBO도 0x160 B. VS/FS의 메타데이터 슬롯(+3A..3C/+7C..7E)별로 **둘 다** 연결한다. sampler는 최대6개를 각각의 VS/FS 슬롯에 제출한다.
- Effect 기본 visibility bit는 **0xFFF**(0117610). 0768400은 `calcMask & W[18]==0` 또는 비활성 W이면 dt=0으로 계산한다. 이 값은 카메라의 최종 draw mask와 별개다. graphics layer 0xC는 5.3의 screen-space 변환 경로에서만 확정했다.
- 공용 blend/depth/raster 생성과 NVN 제출값은 6.6에서 판독했다. alpha test·Combiner/soft particle·layer override는 해당 근거와 별도로 구별한다.

---

### 6.6 공용 blend·depth·raster 생성과 제출 [판독]

근거: [b8](../../../analysis/decomp/effect_runtime_b8.c), [b9](../../../analysis/decomp/effect_runtime_b9.c), [b10](../../../analysis/decomp/effect_runtime_b10.c), [b11](../../../analysis/decomp/effect_runtime_b11.c). `075bbb4→07480c4→0759784`가 `D+E08` Render를 읽는다. `R+1C0`을 기준으로 blend는 `+38=R[1F8]`, depth/stencil은 `+60=R[220]`, raster는 `+7C=R[23C]`다. 일반 draw(0744910)와 strip draw(0760e84)가 이 상태들을 087d430/087d4d4/087d32c로 제출한다.

**Blend.** 0759784의 6바이트 선택표는 srcRGB=`0x10500060606`, dstRGB/dstAlpha=`0x70102010107`, srcAlpha=`0x10500010101`, RGB/alpha op=`0x20000`; 각 `type*8` shift의 하위 바이트를 쓴다. 0884dd0→0882aa0/0882a90의 원본 표는 @1607F5C/@1607F48이다. `087ef00`의 함수명 로딩과 최종 `nvnBlendStateSetBlendFunc/SetBlendEquation`, `nvnColorStateSetBlendEnable`까지 연결했다. NVN 수치 이름은 [NVN 헤더](https://codeviewer.zeldamods.org/uking/uking/lib/NintendoSDK/include/nvn/nvn.h.html)의 enum과 대조했다.

`C_s,A_s`는 FS 출력, `C_d,A_d`는 대상 framebuffer다. isBlendEnable=false(981개)이면 아래 합성은 비활성이다. true는 8,661개다.

| blend / 정의 수 | srcRGB,dstRGB,op (nn::gfx → NVN) | srcAlpha,dstAlpha,op | 합성식 |
|---|---|---|---|
| 0 / 5,014 | 6,7,0 → 5,6,1 | 1,7,0 → 2,6,1 | `C=C_s A_s+C_d(1−A_s); A=A_s+A_d(1−A_s)` |
| 1 / 4,585 | 6,1,0 → 5,2,1 | 1,1,0 → 2,2,1 | `C=C_s A_s+C_d; A=A_s+A_d` |
| 2 / 6 | 6,1,2 → 5,2,3 | 1,1,2 → 2,2,3 | **역감산** `C=C_d−C_s A_s; A=A_d−A_s` |
| 3 / 2 | 0,2,0 → 1,3,1 | 0,2,0 → 1,3,1 | `C=C_d C_s; A=A_d A_s` |
| 4 / 8 | 5,1,0 → 10,2,1 | 5,1,0 → 10,2,1 | `C=C_s(1−C_d)+C_d; A=A_s(1−A_d)+A_d` |
| 5 / 27 | 1,7,0 → 2,6,1 | 1,7,0 → 2,6,1 | `C=C_s+C_d(1−A_s); A=A_s+A_d(1−A_s)`; FS 출력의 premultiply 여부는 각 FS에서 확인 |

**Depth/raster.** depth test=D[E09], write=D[E0B]를 descriptor bit0/1에 복사하고 0884ffc의 NVN setter로 전달한다. depthFunc D[E0A]는 0..7만 허용하며 @15D4538의 `[1,2,3,4,5,6,7,8]`로 변환한다.

| depthFunc | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| 비교 | NEVER | LESS | EQUAL | LEQUAL | GREATER | NOTEQUAL | GEQUAL | ALWAYS |

실제 데이터는 3=9,627, 1=14, 6=1이다. test 활성 8,456, write 활성 2,168이며 두 값은 독립이다. displaySide D[E0F]는 0→cull0(NONE), 1→cull2(BACK), 2→cull1(FRONT), @160803C로 NVN 값에 변환해 0884bdc의 CullFace setter로 전달한다. 전체 9,642개 정의의 blend<6·depthFunc<8·displaySide≤2를 확인했다. 이는 **공통 고정 state 생성 적용 9,642/9,642·60/60조합**이며 shader/alpha/override를 포함한 원본 draw 완료율은 아니다.

공통 고정값도 유지한다([b17](../../../analysis/decomp/effect_runtime_b17.c)). descriptor 기본 작성기 087c0c0의 첫 u32는 `0x03020002`; polygon mode=2→NVN FILL(2), frontFace=0→@15D42E4의 CCW(1)이다. 0759784는 cull만 위 표로 바꾸고 bias/slope/clamp=0, multisample·depthClamp·rasterizerDiscard·conservativeRaster=false를 제출한다(0884bdc→087d32c). blend의 RGBA write mask=0xF, depth/stencil 기본 작성기 087c164의 stencil-enable=false도 그대로 유지한다.

**Alpha→FS.** 0759784는 Render +4/+5/+8(D[E0C/E0D/E10])을 읽지 않는다. 07480e0이 Static UBO 영역을 예약하고, 07491a0이 **D[000..CBF]를 그대로 0xCC0 B 복사**하며, 0743fd8이 metadata의 VS/FS 슬롯에 연결한다([b18](../../../analysis/decomp/effect_runtime_b18.c), 기존 effect_vfx2_calc.c·b3). 따라서 `c[9][8D8]=D[8D8]`이며 +70을 다시 더하지 않는다. 전체 9,642개에서 이 Static threshold와 Render D[E10]은 f32 비트가 같다. 이 일치는 파일 데이터의 계약이며 Render→Static 런타임 복사 명령은 아니다.

사용 중인 primary/secondary FS의 전체 blob hash 310종을 기존 `bnsh_sass.py`로 대조했다. threshold reader와 KIL 개수는 각각 **285종 1회·9종 2회·16종 0회**다. 303개 비교 명령 중 302개는 `FSETP.LE.FTZ; @P0 KIL`, 1개는 LT다. 아래 수는 primary FS를 사용하는 정의 기준이다.

| Render 설정 / 정의 수 | 실제 FS 계약 |
|---|---|
| isAlphaTest=true, alphaFunc=4 / 9,398 | `a≤D[8D8]`이면 폐기; 생존 조건 `a>threshold` |
| 같은 설정 / 91 | 서로 다른 중간 alpha에서 위 비교를 **두 번** 수행; 첫 테스트 뒤 alpha·soft 처리 결과를 다시 테스트 |
| 같은 설정 / 27 | threshold reader·KIL 없음. Render bool만 보고 discard를 추가하지 않는다 |
| isAlphaTest=false, alphaFunc=4 / 125 | threshold reader·KIL 없음 |
| isAlphaTest=true, alphaFunc=6 / 1 | mg0112_sled_bubble00/bubble00 k50·secondary k51, FS @132E00 PC00C8: `a<threshold` 폐기, 생존 `a≥threshold`; threshold=0.20000000298023224 |

`a`는 해당 비교 시점의 레지스터이며 최종 framebuffer alpha와 항상 같지 않다. 예를 들어 kb00_break_build_01_1/debris k18 FS @431900은 PC0078의 R7을 검사한 뒤 `R9=saturate(R7)·R10`을 PC00F0에서 재검사한다. fx_npc_woogan_heat00/ground00_heat00 k268 FS @496800은 PC01A8/0308에서 각각 R7/R4를 검사한다. threshold 자체의 연결과 모집단별 폐기 조건은 해결했으며, 각 FS의 Combiner·soft depth가 그 레지스터를 만드는 전체 식은 별도 프로그램 판독 범위다.

### 6.7 렌더 패스·draw mask·저해상도 blend override [판독]

근거: [b11](../../../analysis/decomp/effect_runtime_b11.c)의 00a7f70 생성자, [b12](../../../analysis/decomp/effect_runtime_b12.c)의 00a9798/00a9ccc, [b13](../../../analysis/decomp/effect_runtime_b13.c)의 00a9f2c/00a92b0. 패스 mask 표 @15D29F0과 [b14](../../../analysis/decomp/effect_runtime_b14.c)·[b15](../../../analysis/decomp/effect_runtime_b15.c)·[b16](../../../analysis/decomp/effect_runtime_b16.c)의 072da44→072d7c4→0729b90→0768c1c, blend profile writer 00b3f10을 연결했다.

| 생성 mode / 패스 | pass[50] mask | draw 경로 |
|---|---|---|
| 0 / ParticleFx2 (등록명 Translucent) | 1 | graphics layer의 color/depth target, 없으면 draw 인수의 color target |
| 1 / AfterPosteffect | 2 | 동일 target 선택; 실제 렌더 순서는 장면 pass 배열에 따름 |
| 2 / AfterLayout | 4 | 동일 target 선택 |
| 3 / ShrinkBuffer (등록명 LowResolution) | 8 | 자체 color target, 00a9798이 mask 16도 별도 조회. 00a9ccc→00aa6dc/00aaab8 합성 경로 |

layer의 ParticleFx2 확장 `L+10/+14/+18/+1C`은 입자 존재 / color 복사 필요 / depth 복사 필요 / depth-write mask다(0729050/0728f40/0729160). [b18](../../../analysis/decomp/effect_runtime_b18.c)의 **07295d0 writer**는 활성 layer에서 네 mask와 emitter 배열을 초기화하고, valid·enabled·W[28]==−1인 등록 emitter만 넣는다. binding layer가 있으면 현재 layer와 같아야 하며, 없으면 `layer[A8]&GetLayerVisibilityBit(07275d4)`를 검사한다. 0727940은 alive emitter E[38]의 `1<<(drawPath&31)`을 OR한다.

0726550(b4)은 살아 있는 emitter의 shader metadata +50/+0E 중 하나라도 −1이 아니면 wrapper[1B1](color), +51/+0F이면 [1B2](depth), Render D[E0B]이면 [1B3](depth-write)를 세운다(073ddc8/073de4c, [b21](../../../analysis/decomp/effect_runtime_b21.c)). 07295d0은 이 플래그에 따라 drawPath mask를 L[14/18/1C]에 각각 OR한다. depthFunc만으로 depth 복사 요청을 판단하지 않는다.

배열 record는 `{wrapper*, weight:u32, key:u32}` 0x10 B이며 weight=`W[DC]+W[E0]+W[E4]+sourceEmitterCount`다. key 상위8비트는 W[66] priority, 하위24비트는 `min(0, W[260]+setData[A4]+cameraDepth)`의 f32 부호·지수·가수를 압축한다. `cameraDepth=cam[78]+cam[48]·W[130]+cam[58]·W[134]+cam[68]·W[138]`다. 카메라가 없으면 priority만 쓴다. 압축은 sign=`bits>>8&0x800000`, e=`(bits>>23&0xFF)−0x40`(값 0이면 e=0), e<0이면 sign, e≥0x80이면 0x7F0000, 그 밖 `(bits>>7&0xFFFF)|((e&0x7F)<<16)|sign`이다. **0729d30은 unsigned key 내림차순** 정렬하며 동일 key의 안정 순서는 보장하지 않는다([b19](../../../analysis/decomp/effect_runtime_b19.c)). 0729b90은 이 정렬 후 배열을 증가 index로 순회한다. 6구간 경계 L[38..50]는 record 개수가 아니라 총 weight/6로 만들며 descriptor +68/+6C가 사용할 범위를 고른다.

layer 배열 writer의 공통 호출은 `0728808→072d780→07295d0`, draw는 `00a9f2c→0728e64→072da44→072d7c4→0729b90`다. 072d7c4는 현재 thread ID(098eafc)의 camera texture +7F0, depth target +7F8, buffer index +821을 작성하고, layer viewport의 GetDrawCamera 또는 기본 camera 경로를 072e608→0768730에 보낸다([b20](../../../analysis/decomp/effect_runtime_b20.c)·[b22](../../../analysis/decomp/effect_runtime_b22.c)·[b25](../../../analysis/decomp/effect_runtime_b25.c)). 0768730은 thread record stride 828의 +530과 GPU UBO +780에 **0x250 B camera block**을 복사하고 metadata stage 0/4/5 slot5에 제출한다([b21](../../../analysis/decomp/effect_runtime_b21.c)).

System 생성은 `0728548→072b860→0764700→07657f0`다([b29](../../../analysis/decomp/effect_runtime_b29.c)·[b30](../../../analysis/decomp/effect_runtime_b30.c)·[b31](../../../analysis/decomp/effect_runtime_b31.c)). 07657f0은 System[98]의 stride **0x828** thread 배열을 만들고 **+81C(thread draw mask)=0xFFFFFFFF**, +810(emitter mask)=0xFFFFFFFF, +818=0, +821(buffer index)=0으로 초기화한다. System[A0]의 stride 0x30 draw record +28/+24도 각각 0xFFFFFFFF다. 0768c1c은 매 제출 때 thread +81C/+810/+821을 record +28/+24/+2C로 복사한다. 따라서 별도 변경이 없는 공통 초기 경로에서 thread mask는 set을 제한하지 않으며, 기본 wrapper **0xFFF와 다른 슬롯**이다.

최종 set 제출(0768c1c)은 `W[28]==−1`이고 아래 세 조건이 모두 참일 때다. `W[18]` 계산 mask(6.5)와 이 draw 검사를 혼동하지 않는다.

```text
(threadDrawMask & W[34]) != 0
(W[30] & passMask) != 0
(moduleMask64 & W[20]) != 0
```

일반 draw descriptor의 override 인수는 6개 모두 −1로 초기화된다(0768be0). 00a7f70이 등록한 00a92b0은 073e904의 render callback에서 추가 blend state를 bind한다. isBlendEnable=false이면 반환하며, drawPath mask가 8/16일 때만 Renderer[8E0]의 아래 profile을 선택한다. 00b5044의 profile 위치는 `object+8+profile·28+targetGroup·208`이고 여기서는 targetGroup=0이다. 00b3f10→0884dd0이 쓰는 profile의 RGB/alpha factor·op를 같은 NVN 변환으로 읽었다.

| drawPath mask | blend | profile | 최종 RGB / alpha |
|---|---|---|---|
| 8 | 0 | 10 | `C=C_s A_s+C_d(1−A_s); A=A_d(1−A_s)` |
| 8 | 1 | 11 | `C=C_s A_s+C_d; A=A_s+A_d` |
| 8 | 5 | 12 | `C=C_s+C_d(1−A_s); A=A_d(1−A_s)` |
| 16 | 0 | 1 | 6.6의 blend 0과 동일 |
| 16 | 5 | 8 | 6.6의 blend 5와 동일 |
| 8/16 | 그 외 | 4 | blend 비활성, `C=C_s; A=A_s` |

profile 10/12의 **srcAlpha=ZERO**가 기본 state와 다르다. 0744910/0760e84는 공통 state를 bind한 **뒤** 073e904를 호출하므로 이 표가 콜백 후 blend 값이다. mask 8/16 이외에는 override하지 않는다. 다른 custom render callback이 false를 반환하면 draw 제출이 중단된다(073e904). 00a8c00은 shader metadata가 요청한 추가 VS/FS UBO 슬롯에 viewport·공용 렌더/환경 버퍼를 제출하는 콜백이며 운동 계산식의 대체가 아니다.

저해상도 합성의 공통 호출도 00a9ccc→00aa6dc/00aaab8로 연결된다(b18). mask16은 별도 target(+88)을 투명색으로 지운 뒤 입자를 그리고, builtin shader ID29·profile10·depth6·raster0으로 중간 target(+68)에 triangle을 제출한다. 마지막 resolve는 ID27·profile9를 선택해 layer color target(없으면 draw 인수 target)에 제출한다. 00a9798은 viewport 크기의 1/2 target 3개와 1/4 target 1개(최소1)를 만들고 UBO에 scissor·역 target 크기를 쓴다(b12). viewport/scissor 설정 reader는 08626c0/08627b0이며 장면별 실제 값은 해당 호출 인수다.

남은 장면 동등성의 최소 입력은 **해당 장면 pass 배열·drawPath·GetDrawCamera/viewport/scissor 값·custom callback 등록**, 저해상도 픽셀 식에는 builtin ID27/29의 프로그램 연결이다. 공통 초기화·제출 계약은 위와 같으며, 장면이 별도 mask 변경/콜백을 등록하면 그 호출 인수를 추가해야 한다. 0xFFF를 곧바로 최종 draw mask로 대입하지 않는다.

---

## 7. 이펙트·에셋 연결 — mg1801 이펙트 구성 [실행: 파서][데이터]

값은 `extracted/converted/effect/*/vfxb.json` 의 `summary` 에서 가져왔다.

열 설명:
- life = 수명(프레임) / 정수 % 랜덤. `k=high32(seed·lifeRandom)`, `L=life·(1−k/100)·배율`(6.2) [판독]
- 속도 = (allDirection / designatedDirScale·방향)
- 중력 = gravityScale (방향 (0,−1,0), white_wave 만 (0,1,0))
- 텍스처 = 샘플러 0,1,2

### 7.1 `mg1801_steam00` (이미터 2 + 자식 1)

| 이미터 | 계산 | 방출 | 모양 | life | 속도 | 크기·키 | 색·알파 | 블렌드 | 텍스처 | 하위 |
|---|---|---|---|---|---|---|---|---|---|---|
| steam00 | CPU | 연속, 10프레임마다 6개 | Box(10) 반경 (5,0,0), 이미터 위치 (0,−0.75,2) | 120 / 30% | (0.001 / 0.01·(0,1,0)) | 3.5(랜덤 50%), 키 0.41→1.5 | color1 2키 (0.51,0.28,0.06)→(0.85,0.58,0.19), alpha0 3키 0→0.075(r 0.22)→0 | 0 알파 | smoke00, smoke00 | FRND |
| bubble00 | CPU | 연속, 10프레임마다 2개 | Circle Fill(3) 반경 5, 위치 (0,−0.8,0) | 30 | 0 | (2.5,1.83,2.5) 랜덤 40%, 키 0.19→1 | color0 2키, alpha0 1→1(0.55)→0 | 1 가산 | bubble00_nml, water_land00_01, bubble00 | CSDP, 메시 `mg1801_bubble00` |
| └ crown00(자식) | CPU | 부모 수명 85%에 1개 | Point | 15 | 0 | 1.3, 키 (1,1,1)→(1.16,5,1.16)@0.46→(1.5,2,1.5) | alpha0 0→0.6→0.6→0 | 1 | crown00_nml, water_land00_01, crown00 | CSDP, 메시 `mg1801_crown00` |

거품이 올라와 터지면 왕관 모양 물방울이 생기는 구성이다.

### 7.2 `mg1801_steam01` (결과 연출)

| 이미터 | 방출 | 모양 | life | 속도 | 크기 | 색 | 텍스처 |
|---|---|---|---|---|---|---|---|
| steam00 | 연속, 30프레임마다 4개 | Circle(1) 반경 2, 위치 (0,1,5.17) | 90 / 30% | (0.001 / 0.025·(0,1,0)) | 3.0(50%), 키 0.41→1.5 | color1 고정 (0.55,0.48,0.32), alpha0 3키 0→0.1→0 | smoke00 ×2, FRND |

### 7.3 `mg1801_water_entry00` / `01` (7 이미터, 01 은 작은 판)

00 과 01 차이(01 = 토마토·버섯):

| 이미터 | 00 | 01 |
|---|---|---|
| shader00 | rate 5, 반경 (1,0.1,0.2), 크기 3 | rate 3, 반경 (0.5,0.1,0.2), 크기 2 |
| splash01 | 크기 1.3 | 0.8 |
| splash02 | 크기 3 | 2 |
| bubble00 | interval 59, designatedDirScale 0.25 | 29 (보정 뒤 같음), 0.2 |
| wave00 | 크기 1, alpha0 시작 0.3 | 0.5, 0.5 |
| wave01 | 크기 1.25 | 1.0 |
| 그 밖 | 같음 | 같음 |

00 의 값:

| 이미터 | 계산·추종 | 방출(6.1) | 모양 / 위치 | life | 속도 / 중력 / 공기 | 크기 | 색·알파 | 블렌드 | 텍스처 | 메시 | 하위 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| shader00 | CPU, follow 1 | 5개 | Circle Fill(3) (1,0.1,0.2), y −0.75 | 40 / 50% | (0 / 0.1·(0,1,0)), 0.006, 0.98 | (3,3,0) 50%, 0.2→1.25 | color0 2키 2.5→1.0(@0.5) 등 | 0 | splash_nml, water_land00_01, splash_alb | — | CSDP |
| splash01 | CPU | 15개 | Circle(1) 0.2, y −1.05 | 30 / 25% | (0.04 / 0.13), 0.007, 0.98 | 1.3 50%, 1→1.5 | alpha0 0→0.5→0 | 1 | splash_nml, water_land00_01, splash_alb | — | CSDP |
| splash02 | CPU | 12개 | Circle Fill 0.1, y −1.3 | 35 | (0.05 / 0.07), 0.0016, 0.97 | 3 30%, 0.4→1 | alpha0 1→0.5→0 | 1 | shave01 ×2 | primitiveExID 0x9170cc3f(TRIM) | CSDP |
| bubble00 | CPU | 120 × 분할 40 = 4,800개 (정정: 처음 120 으로 적었으나 CircleDiv·LineDiv 의 한 번 방출 수는 rate × 분할 수다 — FUN_710074f620 판독, numDivideCircle 40) | CircleDiv(2) 0.25, y −0.8 | 60 / 75% | (0 / 0.25·(0,0.8,0)), velRandom 50, 0.008, 0.95 | 0.25 75%, 0.59→0 | color1 1키, alpha0 1 | 0 | bubble1 (wrap 0) | `mg1801_circle00` [추정: 순서] | CSDP, FSPN |
| wave00 | **GPU+SO(2)**, follow 0 | 0,8,16 프레임 1개씩 | Point, y −0.32 | 45 | 0 | 1, 0→4 | alpha0 0.3→0.3→0 | 1 | wave00 (wrap 0), flowmap00 | — | CSDP, FRN1 |
| wave01 | CPU | 0,5,…,25 프레임 1개씩 | Point, y −0.32 | 45 / 50% | 0 | 1.25 25%, 0→2.5 | alpha0 0→0.3→0 | 1 | ring00 (wrap 0), flowmap00 | — | CSDP |
| white_wave00 | CPU, 회전 Y 90° | 0,2,…,8 프레임 1개씩 | Point (0.5,0.1,0.5), y −0.32 | 60 / 50% | 0, 중력 (0,1,0)·0, 0.95 | 3 25%, 0→1 | color0 2키, alpha0 0→0.3→0 | 1 | fall_side_splash00 ×2 | `mg1801_plane00` [추정: 순서] | CSDP |

- 효과 위치가 (조각 x, −0.5, 조각 z)이므로, 물결(y −0.32 오프셋)은 월드 y ≈ −0.82 에 생긴다 [재구현 계산: 더하기만]. 물 모델(`mg1801_water00`) 높이와 맞는지는 graphics 담당 변환물로 확인할 일이다 [미확정].
- 텍스처 14장은 전부 png 로 풀었다(`extracted/converted/effect/mg1801/tex/`, 형식 BC1/BC3/BC4/BC5/RGBA8).
  - `_nml` = 노말맵(BC5_SNORM)
  - `water_land00_01` = 냄비 수프 색 64×64
  - `flowmap00` = 흐름맵

### 7.4 공용 `mg1800_success01` (JUST, id 0) / `mg1800_success00` (FAST·SLOW, id 1)

| 셋 | 이미터 | 계산 | 방출 | life | 크기 키(배율) | 색 키 | 텍스처 |
|---|---|---|---|---|---|---|---|
| success01 | ring00 | CPU | 1개 | 15 | 1.2 × (0.02→1.65@0.34→2.6@0.75→2.8) | color0 흰→(1,0.92,0.44)→(1,0.44,0.44), alpha0 0→1@0.1→0@0.88 | success00_ring01 |
| | ring01 | CPU | 1개 | 20 | 1.0 × (0.51→1.75→2.6→2.8) | 흰→노랑→빨강 | ring02(무지개 4분의1) |
| | twinkle00 | GPU | 10개, CircleDiv(2) 반경 1 | 15 | 1.0 × (0.01→1.4@0.24→0.01@0.91) | color1 흰→주황→노랑 | twinkle00 |
| | twinkle01 | GPU | 10개, 반경 5 | 20 | 위와 같음 | 같은 계열 | twinkle00 |
| | twinkle02 | GPU | 10개, 반경 5 | 30 | 0.6 × (…0.42@0.54…) | 같은 계열 | twinkle01 |
| success00 | ring00 | CPU | 1개 | 15 | 1.05 × (0.20→…→2.8) | 흰, alpha0 0→1→0@0.75 | success00_ring00 |
| | ring01, ring01_Copy1~3 | CPU | 1개씩 | 15 | 0.8~0.88 × (0.51→…→2.8) | 청록 계열 키 | success00_ring01 |
| | twinkle00, twinkle02 | GPU | 10개 | 15, 20 | 0.84 / 0.6 | 흰→하늘→파랑 | twinkle00/01 |

- 공통 값:
  - 모두 one-time, 블렌드 1(가산), isDepthTest 0(항상 앞에 그림), displaySide 1.
  - ring 의 이미터 위치는 z −0.05.
  - twinkle 은 이미터 회전 (π/2, 0, 0.52 등), 스케일 0.05, allDirection 1.5, 공기 0.95.
- 텍스처는 4분의1 원·반쪽 별이다. `repeat=3`(2×2) + Mirror 로 펼쳐 전체 고리를 만든다(4.4).
- 요약: JUST 는 노랑→빨강 고리 + 주황 반짝이, FAST·SLOW 는 청록 고리 + 파랑 반짝이 [데이터: 키 색].

### 7.5 `mg0508_success00` — 기존 호출 분석과 셰이더 연결

호출 시점·상태는 [mg0508.md](../minigame/mg0508.md)의 완료 분석을 재사용한다. state 17에서 누적값이 1에 도달하면 점수·성공 이펙트·CHECK·포즈를 처리한다. `FUN_7100013f80`의 성공 이펙트 위치는 **월드 원점**, 레이어는 `1<<team`; 원형 pane 위치는 사운드 기준이다. pane 위치에 성공 이펙트를 추가하는 연결은 없다.

| 이미터 | 변형 / calcType | 원시 파라미터 |
|---|---|---|
| ring00_base, ring00 / ring01 | 18~21 / 22,23, 모두 0 | life 30, rate 1, trans=(0,0.125,0), airRes 1, gravityScale 0 |
| twinkle00/01 | 24,25, 모두 0 | life 38, rate 10, 반경 1, allDirection=1.4199999571, scale=0.15000000596, airRes=0.89999997616, gravityScale 0, velRandom=0.10000000149 |
| twinkle02 | 26,27, 0 | life 50, 그 밖 위와 같고 velRandom=0 |

twinkle rotateAdd.z=0.1745329201221466, rotateRegist=1이다. VS는 현재 위치를 읽고 CPU 공통 적분(6.2)이 매 step `P+=Δt·m·V; V*=0.89999997616^Δt`를 수행한다(gravityScale=0). `velRandom=0.10000000149`의 배율은 `1−0.0010000000149u`; 10%가 아니다. 형상·지정 방향·N/Q 난수는 6.2를 따르며 mg1800 GPU 해석식과 다르다. ring의 +0.125는 이펙트 내부 이미터 이동값이며 호출 위치와 구별한다.

### 7.6 그 밖

- `libca/mg_common` 의 `mg_common_pt_effect_00`(고리 1 + 별 2)은 main `FUN_710043ce38` 가 이름을 읽는다(`CaComUiPerfectTelop::SettingEffect` 0x710043c338 근처) [판독: 참조 1건]. mg1801 에서 쓰는지는 [미확정].
- mg1801 메시 프리미티브 BFRES 안 모델 이름: `mg1801_bubble00`, `mg1801_crown00`, `mg1801_circle00`, `mg1801_plane00` [실행: graphics_bfres2gltf dump]. glb 로 바꾼 파일은 `prim/primitives.glb` 다.
  - bubble00 과 crown00 은 텍스처와 ID 가 같아서 확정이다.
  - `0xfd58ff47` 를 circle00, `0xcb1b9b6f` 를 plane00 으로 본 것은 G3NT 순서와 모델 순서를 맞춘 [추정]이다.

---

## 8. 다른 기능과의 상호작용

| 대상 | 내용 |
|---|---|
| 로직 → 화면 | 이펙트는 시각 전용이다. 게임 상태에 영향이 없다. 판정·점수는 로직이 정한다(점수는 `RmStarEffectMan::Start` 가 더함, 3.4) [판독] |
| 소리 | 물보라 SE(`SQ_SE_MG1801_FOOD_FALL_WAT_*`)와 이펙트는 같은 프레임·같은 위치(y −0.5)에서 나간다(EntrySe) [판독] |
| FX 트리거 | ComFxTrigger 의 FX 트리거(종류 1)는 `.eset` 자원 이름을 갖는다. 같은 이름 해석(3.3)으로 이미터셋을 찾는 것으로 보인다(`bex::ComFxTrigger::AddParticleFxCallback` 0x710010d73c) [추정]. mg1801 은 FX 트리거를 쓰지 않는다 |
| 프레임 | vfx2 갱신은 엔진 타이밍 처리기(01_core 3.3)에서 돈다. 리듬 장면은 고정 1/60 이다(SHARED core 항목) → **방출·수명은 프레임 단위로 그대로 쓴다** [판독: 고정 60][추정: vfx2 가 프레임 1씩 진행] |
| 레이어 | mg1801 김은 layerBits 1. 카메라/레이어 마스크가 1 인 뷰에서만 그린다고 본다 [추정] |
| 일시정지 | `Effect::SetManualPause/SetPauseLevel` 이 있다. 리듬 장면의 사용은 [미확정] |

---

## 9. 웹 포팅 구조와 구현 순서

### 9.1 에셋 변환

```
web/tools/analysis/effect_vfxb.py dump <ConvertList.xml> <out> --png
  → vfxb.json(이미터셋·이미터 summary + raw), tex/*.png (graphics_bntx), primitives.bfres
graphics_bfres2gltf gltf primitives.bfres prim/primitives.glb --all
```

- 웹에는 `assets/mg1801/effects/<eset>.json` 을 둔다(summary 만, 손으로 고치지 않음). 텍스처 png 와 프리미티브 glb 를 함께 둔다.
- 필요한 셋: `mg1801_steam00`, `mg1801_steam01`, `mg1801_water_entry00`, `mg1801_water_entry01`, `mg1800_success00`, `mg1800_success01`.
- 텍스처: smoke00, bubble00(_nml), bubble1, crown00(_nml), splash_alb(_nml), shave01, wave00, ring00, flowmap00, fall_side_splash00, water_land00_01, mg1800 5장.

### 9.2 모듈 (web/script — 권장, 아직 없음)

| 웹 파일(권장 이름) | 원본 대응 | 책임 |
|---|---|---|
| `view/effects/registry.ts` | ParticleFx2Module 리소스 목록 + 이름 해석(3.3) | 이름 → EmitterSetDef. 확장자·경로 제거 규칙을 같게 한다 |
| `view/effects/effect.ts` | bex::Effect | `create(name)`, `setPosition`, `start`, `stop`, `selfDestroy`, `layerBits` |
| `view/effects/emitter.ts` | vfx2 Emitter | 방출 시계(6.1), LCG 0x41C64E6D/0x3039, 풀 크기(6.1 식 4) |
| `view/effects/particles.ts` | CPU 갱신 + VS/CS | 입자 상태 배열, 프로그램별 운동식, 키 보간 |
| `view/effects/render.ts` | BNSH | three.js `InstancedMesh`(평면 사각형 / glb 메시) + `ShaderMaterial` |
| `app/minigame/mg1801/view` | MapImpl·Obj·Player 호출 | 로직 사건 `effect` → registry |

**원본 이름과 웹 권장 이름**

| 원본 | 웹 권장 |
|---|---|
| `rate`(+0xD78), `interval`(+0xD80), `duration`(+0xD74), `start`(+0xD6C), `timing`(+0xD70) | `emit.rate`, `emit.step = interval+1`, `emit.duration`, `emit.start`, `emit.childTimingPct` |
| `particle.life`(+0xE28), `lifeRandom` | `life`, `lifeRandom` |
| `static.gravityDir/Scale`(+0x100/0x10C), `airRes`(+0x110) | `gravity`, `drag` |
| `color0/alpha0/color1/alpha1/scale` 키표 | `curves.color0` 등 `{t, v}` |
| `render.blendType` 0/1 | 6.6의 RGB/alpha 별도 factor/op를 ShaderMaterial 상태에 전달; preset 이름만으로 일치 판정하지 않음 |

### 9.3 업데이트 순서 후보 (프레임마다, 로직 step 뒤 화면 onStep)

```ts
for (const fx of effects) {
  if (fx.posDirty) { fx.applyPosition(); fx.posDirty = false; }      // 원본 +0x119
  for (const em of fx.emitters) {
    em.time += 1;                                                     // 고정 60 → 1프레임
    if (em.inWindow()) em.accumulate();                               // 6.1, LCG
    for (const p of em.particles) {
      p.age += 1;
      if (p.age >= p.life) kill(p);
      else updateByProgram(p, em);                                  // 6.2 CPU 경로 / 6.3 GPU 해석식·wave CS
    }
  }
  if (fx.selfDestroy && fx.allDone()) remove(fx);
}
// 그리기: 키 보간으로 색·알파·크기, billboardType 별 정점 변환
```

- 위 순서는 웹 설계 후보다. 셰이더의 그리기 제외와 풀 삭제는 별개이며, 일반 첫 방출·위치 반영·selfDestroy 경로는 5.3에서 판독했다. 특수 콜백 선후는 남아 있다. 난수는 방출·형상·생성 속성의 LCG 소비 순서와 N/Q cursor를 함께 보존해야 한다(6.2).

### 9.4 원본과 다를 근사 목록

| 항목 | 원본 | 웹 근사 | 동등성 유지 방법 |
|---|---|---|---|
| 입자 운동식 | CPU의 이동→감쇠·중력→필드(6.2), GPU 해석식·wave CS(6.3) | 일괄 `v=v·drag+g`는 원본과 다름 | Δt·m·갱신 순서와 프로그램별 식 보존 |
| 커스텀 셰이더(물보라 shader00·splash·bubble/crown: 노말맵 + 수프색 + 알베도, CSDP 파라미터) | 굴절·라이팅 계열 [추정] | 알베도 × color0 + 가산. 노말맵은 무시하거나 간단한 림 | 화면 대조 |
| flowmap(wave00/01) | 이중 UV 샘플·cos 혼합(6.4) | 생략하면 물결 표면이 다름 | 0.74/0.37과 수명 위상을 그대로 사용 |
| GPU+SO(wave00) | 현재 위치 이동 후 속도·주기 힘·tangent 갱신; payload 작성 연결 완료(6.3) | 계산 장소만 CPU로 옮길 수 있음 | 갱신 순서·Δt·힘 축·경계 보존 |
| 필드(FRND·FSPN·FRN1) | CPU 위치 흔들림/회전·테이블 속도 힘(6.2), wave CS sine 힘(6.3) | 임의 랜덤 가속은 근사 | 필드별 대상 P/V·실행 순서·위상·남은 옵션 구별 |
| 소프트 파티클·깊이 페이드 | 있음(softParticle 파라미터) | 없음(depthWrite false) | — |
| billboardType 3/4 | 메시 정점·입자 변환 / 물결 XZ 축 치환 판독(6.4) | 메시 변환을 생략하면 다름 | 프로그램별 속성·행렬 유지 |
| 정렬(sortType) | 6.5의 birth/depth key·depth-write·음수 비교 분기 | three.js 투명 정렬 | 원본 입자 순서 보존 필요 |

### 9.5 우선순위 (mg1801 최소 기능부터)

1. **이름 해석 + 수명 + one-time 방출**(6.1 표) + 빌보드 사각형 + 텍스처 + 블렌드 0/1 + 색·알파·크기 키 보간.
   - 이것으로 success00/01 고리(ring)와 water_entry splash01/02 가 나온다.
2. 4분의1·반쪽 텍스처 repeat+Mirror(4.4). 이게 없으면 고리가 4분의1로 보인다.
3. 연속 방출 + 중력·공기저항 + 속도 → steam00/01, bubble00(물보라), shader00.
4. 수평 판(billboard 4) → wave00/01, white_wave00.
5. 자식 이미터(timing %) + 메시 프리미티브(glb) → steam00 의 bubble/crown.
6. 필드(FRND/FSPN/FRN1), flowmap, 노말맵 셰이딩.

---

## 10. 검증 코드·실행 결과·기대값

### 10.1 실제로 돌린 것

| 검사 | 명령 | 결과 | 수준 |
|---|---|---|---|
| 전 파일 구조 | `python web/tools/analysis/effect_vfxb.py check extracted/bea` | 149 파일, 이미터셋 2,062, 이미터 9,642(자식 943). EmitterData 크기 0x1100 전부 일치(불일치 0). 샘플러 텍스처 ID 11,057개 전부 GTNT 에 있음(실패 0). 입자 프리미티브 ID 1,484개 전부 G3NT 에 있음(실패 0). 이름 깨짐 0 | [실행: 파서] |
| 키 개수 ↔ 키표 | `keys.py`(scratch) mg1801 17 이미터 | numColor0/Alpha0/Color1/Alpha1/Scale 키 수 = 키표의 유효 키 수, 모두 일치 | [데이터] |
| 오프셋 ↔ 코드 | Ghidra `srch` + 디컴파일 | 0xD68·0xD6A·0xD6C·0xD70·0xD74·0xD78·0xD7C·0xD80·0xDAC·0xDB0·0xDE0~0xDE8·0xDF8·0xE00·0xE18·0xE28·0xF34·0x10C 를 같은 의미로 읽음 | [판독] |
| 텍스처 디코드 | `dump --png` (graphics_bntx) | mg1801 14, mg1800 5, mg_common 3 → 22장 전부 성공, 육안 확인(contact_sheet.png) | [실행] |
| 프리미티브 | graphics_bfres2gltf dump/gltf | 모델 4개, glb 출력 | [실행] |
| 이펙트 이름 위치 | `effect_vfxb.py find` / esets 목록 | mg1801 이 쓰는 6개 이름이 각각 한 파일에만 있음 | [실행: 파서] |

### 10.2 셰이더 판독 검증

| 근거 | 확인 결과 |
|---|---|
| BNSH 메타데이터·코드 바이트 | mg1801 17변형/11종 VS, mg1800 12변형/4종 VS; mg0508 success 10변형의 shaderIndex·calcType·위치 reader 대응(6.3) |
| SASS 교차 판독 | envydis 미지원 MUFU 표기를 기존 nvdisasm의 SQRT로 확인; 회전 부호/난수 교차항과 CS 축·시간·수명 분기 확인 |
| 상수 풀 | CS +3B00의 ε/δ, 물결 FS +45C00의 0.74와 immediate 0.37이 식과 대응 |
| CPU writer | FUN_71007491a0의 루프 슬롯·고정색·키 패딩과 FRN1→필드50..5C, 074f880의 P/V/scale/U/θ₀와 VS reader 대응 |
| CPU 명령·포인터 대조 | 074faf0..074fc34의 UMULL/SCVTF/STR S 수명, 075c530의 R270=D+70, 074c3a0 태그 포인터와 0755834 필드 순서 확인 |
| CPU 정의 집계 | 기존 effect_vfxb 파서의 메모리 결과에서 6,232개=상위5,703+자식529; 형상 16종 수의 합=6,232, seed 선택 5,460+45+727=6,232 |

### 10.3 웹 구현 시 기대값 (재구현 대조용)

| 입력 | 기대 |
|---|---|
| `create("mg1800_success01")` | 이미터 5: ring00, ring01, twinkle00, twinkle01, twinkle02 |
| `create("mg1801_steam00.eset")` | 확장자 제거 규칙으로 `mg1801_steam00` 을 찾음 |
| 존재하지 않는 이름 | 원본은 Abort. 웹은 경고 후 무시(차이를 문서에 남김) |
| JUST 판정 | `mg1800_success01` 를 (x, 1.5, 0)에, 점수 +2 |
| FAST·SLOW 판정 | `mg1800_success00`, 점수 +1 |
| water_entry00 하나 | 프레임 0 에 shader00 5 + splash01 15 + splash02 12 + bubble00 4,800(120 × 분할 40, 위 표 정정) + wave00·wave01·white_wave00 각 1. wave00 은 프레임 8·16, wave01 은 5~25, white_wave00 은 2~8 에 더 남 [6.1 표 — 판독 식 적용, 끝 포함 여부 미확정] |
| steam00 정상 상태 입자 수 | 배율1에서 lifeRandom30은 k=0..29, 수명85.2~120. 10프레임마다6개이므로 경계·콜백을 제외한 대략51~72개 [판독 식 기반 계산] |

### 10.4 전체 모집단·원본 재현 판독 범위 [데이터]

전체 149파일의 ESET·자식 EMTR를 한 번씩 센 **9,642개 정의(자식 943)**다. calcType 0/1/2=6,232/3,011/399, 실제 `calc×billboard×blend` 조합 **60종**. 아래는 같은 조합별 정의 수이며 파일 간 복제도 원본 정의로 센다.

| billboard | CPU(0): blend=개수 | GPU(1): blend=개수 | GPU+SO(2): blend=개수 |
|---|---|---|---|
| 0 | 0=2,301, 1=2,159, 2=3, 5=6 | 0=907, 1=906, 2=2, 5=3 | 0=123, 1=136 |
| 1 | 0=27, 1=37, 4=2, 5=8 | 0=3, 1=16, 5=1 | 0=2 |
| 2 | 0=8, 5=4 | 1=4 | 0 |
| 3 | 0=463, 1=73 | 0=197, 1=115, 4=1, 5=1 | 0=47, 1=5 |
| 4 | 0=341, 1=328, 2=1, 5=1 | 0=110, 1=121, 5=2 | 0=1, 1=8 |
| 5 | 0=133, 1=146, 4=3 | 0=44, 1=330 | 0=8, 1=10 |
| 6 | 0=79, 1=44 | 0=119, 1=63, 3=2 | 0=44, 1=15 |
| 7 | 0=29, 1=33 | 0=28, 1=15, 4=2 | 0 |
| 10 | 1=2, 5=1 | 1=19 | 0 |

`followType` 0/1/2=5,712/3,291/639, `sortType` 0/1/2/3=8,485/84/935/138. 이 분포는 샘플 게임 수나 웹 구현률이 아니다.

| 판독 기준 | 정의 범위 | 제외·차단 조건 |
|---|---|---|
| CPU 공통 생성·적분·payload 연결 | 6,232 / 9,642 (64.63%) | 좌표/override·형상/필드 일부 분기와 최종 draw를 모두 해결했다는 뜻은 아니다 |
| 기존에 완전히 읽은 VS·FS blob과 바이트 동일 | **12 / 9,642 (0.124%)** | mg1800 k4/5/8/11·mg1801 k13/14/15의 stage1+stage5 blob 조합을 대조. 해당 정의의 모든 CS·custom writer·render state 완료를 뜻하지 않는다 |
| 공통 blend/depth/raster state 생성 | **9,642 / 9,642; 60 / 60 조합** | 0759784의 입력 범위·6.6의 NVN 변환 검증. alpha test·pass override·모든 draw 완료는 제외 |
| 위 12개의 calc×billboard×blend | (0,4,1)=2, (1,0,1)=5, (2,4,1)=5 | 신규 6종 대표 VS의 부분 판독은 이 완전 pair 수에 더하지 않았다 |
| 원본대로 draw 가능한 정의: **식 ∧ 입력 writer ∧ 모든 사용 stage ∧ render state ∧ layer/sort** | **완료 판정 보류** | 전체 정의에서 모든 조건을 통과시킨 집계는 없다. 12개도 모든 alpha/shader·최종 layer 조건을 검증하지 않았으므로 12개를 원본 drawable 완료로 보고하지 않는다 |

동일 blob 대조는 companion BNSH의 ShaderRef index가 가리키는 stage 머리·SPH·코드 범위 그대로 수행했다. 전체 고유 VS/FS(+보조 shader) blob 조합은 **2,369종**이다. 고유 shader 수, 정의 수, 계산 경로 coverage는 서로 다른 분모다.

---

## 11. 미확정 사항과 추가 분석에 필요한 근거

이전 12개 주제의 번호를 유지한다. 해결한 내부 경로와 실제 남은 분기를 구별한다.

대표 1/5/6/7의 상류 rotation reader·퇴화 제어 분기(6.5), CPU fluctuation 채널·원본 sin 계수(6.2), alpha threshold→FS 폐기 조건의 전체 모집단 연결(6.6), 공통 pass writer·thread mask 초기화/제출(6.7)은 판독했다. 대표 6의 c[1] 상수 base 연결, 같은 billboard 값의 다른 VS·Combiner/soft depth 전체는 **정적 자료가 남은 미판독**이며 자료 부재로 처리하지 않는다. 장면별 최종 순서는 해당 장면의 pass 배열·drawPath·viewport 설정을 특정해야 한다. **자료 부재**인 billboard 8/9는 현재 모집단에서 미사용이며 대응 BNSH가 없다. 최소 추가 근거는 해당 값의 사용 정의·프로그램 또는 v53 enum/shader compiler 정의다.

| # | 현재 상태·남은 항목 | 필요한 근거 |
|---|---|---|
| 1 | CPU 공통(6.2), 부착 TRS·follow reader(5.3), 자식 속성의 현재 나이 평가 해결. 남음: Sphere helper/분할표, world velocity·override 전체, mg0508 oil/fire·smoke 별도 GPU. CPU 회전 fluctuation은 6.2에서 해결 | 0753370·방향표, 074fea4 옵션, 해당 프로그램 SASS |
| 2 | B0~D4·E0~FC 런타임 슬롯 해결. A8/AC·D8/DC·추가 애니 채널 사용 남음 | 07491a0 나머지 writer와 프로그램별 reader |
| 3 | 기판독 0/3/4와 1/2/5/6/7/10 대표 축·yaw, 1/5/6/7 회전·퇴화 reader 해결(6.5). 남음: 대표 6의 c[1] base 연결, 같은 값의 다른 프로그램, 8/9 의미 | control @054F10+700의 NVN loader C reader, 각 미판독 VS·속성 metadata; 8/9는 사용 정의/BNSH 또는 v53 enum·shader compiler 정의 |
| 4 | 기판독 VS/CS·flowmap/twinkle FS·draw UBO/sampler 제출 및 blend 6종·depth 8종·raster 최종 state 해결(6.6). 남음: Combiner/CSDP 전체·soft depth/normal. alpha threshold writer·310 FS의 discard predicate는 해결(6.6) | 각 FS의 alpha 레지스터 생성식·sampler별 데이터 |
| 5 | 주요 CPU/GPU 필드 연결 해결. FRND 전역주파수, FCLN, 월드 충돌·목표 좌표 옵션, FGWD/FCSF 콜백·EATR 시간 남음 | 0758260/테이블, 0745630, 0754958/0753ec0/0754cc4·콜백 |
| 6 | **해결:** Stop(false)=즉시kill, true=fade 요청, alive 판정·pause·selfDestroy 0x12→0x14 지연 정리(5.3) | fade 옵션별 첫/끝 프레임 시각 동등성은 원본 실행 미확인 |
| 7 | **일반 경로 해결:** Start 직접 초기화에는 방출 없음, dirty TRS→W 제출. 별도 생성 콜백·선계산과 vfx 계산 단계까지의 전체 선후 남음 | 0745f60 생성 콜백·074f620 콜백 및 ParticleFx2Module timing |
| 8 | 이름 resolver의 등록 순서 우선 확정. 충돌 이름 리소스의 실제 등록 순서 남음 | ParticleFx2Module 등록 함수·장면 로딩 순서 |
| 9 | 기본 **0xFFF**·계산 mask, 4개 pass mask·layer 배열/요청 mask writer·camera UBO 제출·최종 set 교집합·저해상도 blend override·thread +81C 초기화/제출 해결(6.7). 장면 pass/viewport 값·custom/resolve FS 남음 | 장면 pass 배열·drawPath·viewport/scissor 인수, custom callback·builtin ID27/29 FS |
| 10 | G3NT 8바이트·ID 해시, TRMA/TRIM 대응 남음 | 기존 파일 분석의 고유 미확인 연결 |
| 11 | **경계 해결:** duration bit20·child bit0/17, 첫 방출 bit1 예외, 최초 rate 최소1, 계산·sort·VS 수명 경계 구별(6.1/6.5). 별도 콜백/선계산의 첫 방출은 #7 | 074cb60/074d580·073b83c(b5), 특수 strip 종료 분기 전체 |
| 12 | mg_common_pt_effect_00의 mg1801 사용 여부 남음 | 기존 043ce38 호출자 분석 재사용; 고유 연결만 추적 |

## 12. 사용자 확인 필요

원본 시각 검증 자료가 없으므로 첫 방출·fade 종료의 화면 동등성은 판독 결과와 구별해야 한다. 후속 구현 범위는 **mg1801·리듬 공용의 판독된 프로그램**인지 **전체 9,642개 정의**인지 먼저 정해야 한다. 전체 목표에는 11절의 미판독 shader/render 분기가 차단 조건이다.

## 13. 런타임 구현 준비도

| 필요한 항목 | 상태 | 차단 여부 |
|---|---|---|
| CPU 공통 운동·난수·키·주요 필드 | 판독(6.1~6.2), 일부 옵션 남음 | 기본 CPU 경로 가능, 모든 정의 동등성 차단 |
| Start/Stop/selfDestroy·부착/행렬 | 내부 경로 판독(5.3), 특수 콜백 선후 남음 | 일반 경로 가능, 첫 방출 전체 보장 차단 |
| GPU 계산·최종 VS/FS | 기판독 식 보존, 추가 대표 회전·basis·퇴화 분기 판독(6.5), 대표 6 c[1] base 연결 남음 | 미판독 상수 연결·프로그램 차단 |
| blend/depth/raster | 공통 최종 state·전체 입력 범위 판독(6.6) | 패스별 override는 별도 |
| alpha·soft particle·layer | alpha UBO·310 FS 폐기 조건(6.6), 패스 mask·thread 초기화/set 제출·저해상도 blend override 판독(6.7); Combiner/soft FS 전체·장면 pass 순서·resolve FS 남음 | 원본 drawable 완료 판정 차단 |
| 자식 상속·follow·특수 형상/필드 | 현재 나이 평가·reader 판독, 조합 전체 남음 | 해당 옵션 정의 차단 |
| 검증 범위 | 원본 데이터·C·SASS·9,642개 모집단 대조 | 실행·화면 동등성 미검증 |

## 14. 웹 런타임 계약 (2026-10-09, [effect-runtime])

모든 미니게임·셸이 같이 쓰는 이펙트(VFX) 공용 런타임이다. 게임은 `fx.play('mg1801_water_entry00', pos)`처럼 이름으로 부르고 고정 스텝만 돌린다. 판독 근거는 이 문서 §3~§7이며 이 절은 웹 쪽 계약만 적는다. 2026-10-09 사용자 결정으로 **기본 = 원본 규칙**(`RULES_ORIGINAL`)이고, 이전 웹 근사는 `RULES_WEB`으로 남겨 이전 전후 골든을 대조한다. 층 구조·원본 스위치·골든 방식은 캐릭터 런타임([09 §14](09_character.md))과 같다.

### 14.1 계층

| 계층 | 파일 | import | 하는 일 |
|---|---|---|---|
| 코어 | `script/game/lib/effect/index.ts` | 0(three·DOM·프로젝트 파일 없음) | `EffectRegistry`(§3.3 해석·등록 순서), `EffectCore`(bex::Effect 목록: Create·Start·Stop(bool)·StopImmediately·SetPosition/Rotation/Scale·SetSelfDestroy·SetLayerVisibilityBit·SetAnimationSpeed·Attach, 핸들 = 칸 + 세대), `ParticlePool`(이미터 정의 하나의 입자 배열 — 모든 인스턴스가 공유하는 링 버퍼), `EmitterRt`(정의마다 미리 계산: 키 표·최대 입자 수 §6.1 식 4·raw 플래그), 난수(`Lcg`·`Xorshift128`·N/Q 표·`sinCpu`), 정렬 key(`packDepth`). 숫자·사건만 낸다 |
| three 어댑터 | `script/game/lib/effect-three/index.ts` | three + 코어 | `EffectView`: effects.json·텍스처·프리미티브 읽기(`EffectLoader` 끼움점), 풀마다 InstancedBufferGeometry 하나에 코어 출력(월드 위치·크기·회전·색 2개·나이·수명·UV 난수·fade·기저)을 그리기 순서대로 올림. 셰이더는 billboard 0/3/4 변환·UV 애니·조각 합성·알파 시험만(입자 운동 없음). blend·depth·cull·FS 변형은 규칙에 따름 |
| mpj 연결 | `script/view/effect.ts` | 코어·어댑터·셸 | `MpjEffects`/`createEffectSystem(parent, {loader})`, `assetsLoader(Assets)`(json·gltf = Assets 캐시, 텍스처 = stage3d `loadTexture`), `play(name, pos, {scale, selfDestroy, layer, rate, attach})`, `showCommonEffect(id, pos)`(CMN_EFFECT_ID), `objectSource(obj)`(Attach 행렬 원천), `routeCharacterFx(ch, fx)`(캐릭터 FTRG fx 사건 연결) |
| 게임 | `script/app/minigame/mg1801/view/effects.ts` | mpj 연결 | `EffectSystem` 이름·생성자·공개 메서드(load·spawn·start·stop·update·dispose·activeCount) 유지, 내부만 공용 런타임 |

- 시간: 고정 스텝 1/60(`step()`), 재생 속도는 `SetAnimationSpeed` 배율(원본 규칙). `update(dt)`는 벽시계 → 스텝(최대 15 = 0.25 s, 이전 웹 clamp 와 같음).
- 결정성: 코어에 `Math.random`·벽시계 없음. 원본 공유 seed 원천은 생성자에 주입(`seed: () => u32`, mpj 기본 = 고정 씨앗 xorshift128). web 규칙은 이전 웹 시스템 LCG `0x12345678`.
- 할당: 입자 갱신·출력(`step()`+`sync()`)은 할당 0(실수 인자는 스크래치 칸으로 넘김). 방출이 있는 스텝은 최적화 밖 실수 상자가 남는다(김 2개 정상 상태 스텝당 약 150 B, 14.6). 풀은 모자랄 때만 두 배로, 이펙트·이미터 인스턴스는 이미터셋별 예비 목록으로 다시 쓴다.

### 14.2 API

```ts
// mpj 연결
const fx = await createEffectSystem(scene, { loader: assetsLoader(new Assets('mg1801/')), files: ['effect/effects.json'], original?: boolean, seed? });
const h = fx.play('mg1801_water_entry00', { x, y: -0.5, z }, { scale?, selfDestroy? /*기본 true*/, layer?, rate?, attach? });
fx.showCommonEffect(0 /*JUST*/, pos);       // ca::rm::util::ShowCommonEffect — 0 = mg1800_success01, 1 = mg1800_success00
fx.attach(h, bone); fx.setPosition(h, x, y, z);
fx.stop(h, fade? /*false = 즉시 kill*/); fx.release(h);
fx.update(dt) | fx.step();                  // 스텝 → GPU 올리기
const off = routeCharacterFx(character, fx); // fx 사건 → .eset 를 훅 본에 Attach 해 재생, '<KEY>_Stop' = Stop(true)
// 코어만(다른 게임에 파일 하나로 복사)
const core = new EffectCore({ rules: RULES_ORIGINAL | RULES_WEB, seed: () => u32 });
core.registry.registerJson(effectsJson);     // resources 순서 = 이름 충돌 우선순위
const h = core.create(name); core.setPosition(h, …); core.setSelfDestroy(h, true); core.start(h);
core.step(); core.view.set(cameraViewMatrix); core.sync();  // pools[k].order[0..count) 순서의 o* 출력 배열
```

- `create` 실패 = −1(원본 Abort, 웹은 한 번 경고 + `missing` 사건). 사건 고리 64개: create·start·stop·fade·kill·release·missing·emit(만든 입자 수).
- `start`: web = 즉시 방출(이전 웹 create), original = 다음 `step`의 첫 계산에서 방출(§5.3 일반 경로). 이미 시작한 것을 다시 Start 하면 이미터셋을 kill 하고 새로 만든다(§5.3 07262a8).
- 그리기 나이(original) = `E[28] − dt − b`(§6.4 동적 UBO writer 인수1=0 보정): 새 입자는 생성 스텝에 한 번 적분된 위치를 나이 0 으로 그린다. GPU 해석식의 T = 나이 + dt.

### 14.3 데이터(`tools/analysis/mg1801_web_effects.py`, 원본 읽기만)

`assets/mg1801/effect/effects.json`(받는 경로 그대로)에 원본 규칙용 값을 덧붙였다. 기존 필드는 재생성 전후 값이 같고 텍스처·glb 는 그대로다.

| 추가 | 내용 |
|---|---|
| `resources` | 등록 순서 `[{name, sets}]`: mg/mg1801 → mg/mg1800 → libca/mg_common — 이름 충돌 우선순위(§3.3, 실제 장면 등록 순서는 [미확정] §11 #8) |
| `sets.*.path` | ESFT 경로(이름 해석 1·2단계). ESFT 순서 = ESET 순서로 대응 |
| `Emitter.orig.info0` | EmitterData+0xCC0..0xCCF u8×16 원본 오프셋 그대로(CC1 정렬, CC3 follow, **CC4 seed 선택**, CC5 이미터 TRS 재추출, **CCB/CCC fade**). 파서 이름(isFadeEmit 등)은 런타임 의미와 어긋나 쓰지 않는다 |
| `orig.seed/drawPath/alphaFadeTime/depthFunc/alphaFunc/shader` | D[CD0]·CD4·CD8·E0A·E0D·ShaderRef(변형 번호) |
| `orig.fluct/fluctParam` | FC4 alpha·FC5 scale·FC6 scaleY·FC7, Static 130..14C(amplitude·cycle·phaseRnd·phaseInit) |
| `orig.loopOn/loopRandom/loopPeriod` | E48..E4C·E51..E55·E5C..E64(§6.3 루프 슬롯 writer) |
| `orig.soft/inherit0/inheritD58/inheritRate/velInheritMax` | isSoftParticle·soft 거리, D48..D57 u8·D58 u64·D60/D64, F64 |
| `orig.fspn/frn1/frnd` | 필드 payload f32·u32 둘 다(FSPN axis·FRN1 K·FRND K 는 u32 — f32 표기로 읽으면 0) |

### 14.4 소비자 이전 표

| 소비자 | 이전 | 어떻게 | 골든 |
|---|---|---|---|
| `app/minigame/mg1801/view/effects.ts` `EffectSystem` | 이전 | 내부 = `MpjEffects`(코어 + 어댑터). 계산·셰이더·재질·풀 코드와 그 주석은 코어·어댑터로 옮김. `view/index.ts` 무수정 | `RULES_WEB` 9 시나리오 이전 전과 같음(14.6) |
| 캐릭터 런타임 fx 사건(`view/character.ts` `routeCharacterEvents`가 받지 않던 것) | 연결 | `view/effect.ts` `routeCharacterFx(ch, fx)` — `ch.on`에 붙여 fx 사건만 받는다(`view/character.ts` 무수정) | 시험 없음(웹 자료에 bq 상주 `fx_*`·bd00 eset 없음 → 경고 후 무시) |
| 리듬 공용 성공 이펙트 | 별칭 | `showCommonEffect(id)` + effects.json 별칭 `ca::rm::util::ShowCommonEffect#0/1` | common_success 시나리오 |
| 다른 게임(mg18xx·mg0508 등) | 미룸 | 각 게임 `_Vfx` 덤프를 effects.json 형식으로 만들어 `load(files)`에 더하면 등록 순서대로 해석 | — |

### 14.5 원본 스위치

기본 `effectDefaults.rules = RULES_ORIGINAL`. `RULES_WEB` 정의는 남기고 기본 경로에서 쓰지 않는다(끄는 길 = `effectDefaults.rules`, `createEffectSystem({original:false})`, `new EffectSystem(scene, assets, {rules})`).

| 항목(스위치) | `RULES_WEB`(이전 웹 근사) | `RULES_ORIGINAL`(기본) | 근거 | mg1801 에서 바뀌는 것 |
|---|---|---|---|---|
| 이름 해석(resolve) | 별칭 → 소문자 basename·확장자 제거, 모든 셋 한 표 | 등록 순서로 ESFT 경로(소문자·`/`→`\`) → `..\`+경로 → 마지막 `.` 앞 이름 strcmp | §3.3 | 없음(쓰는 이름이 모두 셋 이름) |
| 운동식 순서(motion) | 속도에 drag 먼저 곱한 닫힌 식, m 은 v₀ 에 곱함 | CPU: `P += Δt·m·V` 뒤 `V·a^Δt`, `V += Δt·g`(m 없음) → 필드. calcType 1: `p₀ + m(v₀F(T)+gG(T))`. calcType 2: wave CS | §6.2·§6.3 | 모든 입자 위치 |
| 방출(emission) | 생성 즉시 방출(첫 그리기 나이 1) | Start 뒤 첫 step 에서 방출, 그리기 나이 0, 첫 방출 rate≤1 → 1, intervalRandom(LCG 1회) | §5.3·§6.1 | 모든 입자가 한 프레임 일찍 보이고 수명 L 프레임 동안 그려짐 |
| 표본 분포·난수(sampling) | LCG 균등 단위벡터(Point·Sphere·positionRandom·diffusion), 회전 `init + u·initRand` 뒤 1/2 부호, 정수 수명 `trunc(L(1−⌊u·r⌋/100))`, 이미터 seed = 시스템 LCG | Point = Q 표, diffusion = N 표(cursor = seed 하위/상위 16비트), CircleFill ρ=√(u+(1−u)(1−c)²), 회전 `σ⊙(θ₀+H·ω)+(U−0.5)⊙initRand`, ω 의 (Uₐ+U_b)/2(CPU)·(Uₐ+U_b−1)(GPU), float 수명 `L(1−0.01k)` k=high32(seed·r), U 4개, seed 선택 CC4(0 공유 xorshift·1 셋 seed·2 D[CD0]·DFDC1C35), 이미터 TRS 난수 6회 | §6.2 | 김 회전 범위(±π/2 + 누적), 수명 소수, 반짝이·물결 흩어짐 |
| 필드(fields) | 없음 | FSPN(축 평면 회전·반경 +Δt·m·radial), FRN1(CPU), wave CS 주기 힘 N. FRND 는 둘 다 없음(14.7) | §6.2·§6.3 | 물보라 bubble00(FSPN axis 1 → xz 로 퍼짐), wave00(N) |
| 키·흔들림(keys) | 선형 키, 루프·fluctuation·color type 3 없음 | 8슬롯 패딩 키, 루프 위상 fmod, scale(FC5/FC6)·alpha(FC4, [0,1]) 흔들림 mode0 cos, color type 3 | §6.2·§6.3 | 반짝이 twinkle00~02 크기·알파 깜빡임, 물보라 bubble00 크기 흔들림 |
| fade-in(fadeIn) | info CCB 를 시작 페이드인(fadeInTime)으로 | 쓰지 않음(CCB/CCC = 정지 fade 선택) | §5.3 | water_entry shader00 의 첫 10 프레임 알파 |
| 정지(stop) | 방출만 멈추고 입자 수명대로 | Stop(false) = 이미터셋 즉시 kill, Stop(true) = fade `F = max(0, F − dt/D[CD8])`(CCB 알파·CCC 크기), 0 이면 kill | §5.3 | 결과 연출 (0,6) steam00 → steam01 교체 때 김 입자가 바로 사라짐 |
| 정렬(sort) | 풀의 칸 순서 | 이미터셋 key(상위 8비트 priority + min(0, 카메라 깊이) 압축, unsigned 내림차순, 같으면 생성 순서) → 셋 안 sortType 1/2/3(2 = 깊이, depthMask 0 내림차순, 둘 다 음수면 방향 뒤집기) | §6.5·§6.7 | wave01·white_wave00(sortType 2) 그리기 순서, 여러 물보라 사이 순서 |
| follow(follow) | 생성 때 월드 고정 | 0 = 현재 이미터 행렬, 1 = 생성 때 행렬, 2 = 생성 때 기저 + 현재 이동 | §5.3 | 정지한 이펙트는 f32 반올림 차이뿐(움직이는 부착에서만 보임) |
| 상속(inherit) | 없음 | 자식 D[D50/51/52] 속도·크기·회전 | §6.2 | 없음(mg1801 자료 상속 플래그 0) |
| PlayRate(playRate) | 쓰지 않음 | SetAnimationSpeed → 이미터 dt | §3.2 | 없음 — mg1801 view/index.ts 가 PERFECT `mg_common_pt_effect_00` 에 BPM/120 을 넘기지 않음(14.8) |
| 그리기 상태(render) | NormalBlending/AdditiveBlending, depthWrite false, DoubleSide | blend 표 6종(RGB·alpha 별도, isBlendEnable), depthMask(D[E0B])·depthFunc(D[E0A])·cull(displaySide 0 없음/1 뒤/2 앞)·alphaFunc 6 = `<`, billboard 4 = 로컬 Rᵧ·Rₓ·R_z 뒤 `(x,y,z)→(x,z,−y)` + 이미터 기저(billboard 3 도 기저), FS: mg1800 twinkle 변형 4 = `C₁+tex²(C₀−C₁)`·`sat(sat(tex.r²C₀.a)·fade)`, 8/11 = 같은 식 tex 그대로, mg1801 wave 13/15 = flowmap(0.74/0.37·이중 샘플 cos 혼합, RGB = T·C₀) | §6.4·§6.6 | 모든 재질(가산 alpha = A_s+A_d), water_entry·반짝이 뒷면 컬링, 물결 판 방향·흐름, success/PERFECT depthMask(depthTest 꺼져 깊이 쓰기는 없음) |
| soft depth | 없음 | 없음 | §11 #4 soft FS 미판독 | 없음 — isSoftParticle 2 인 shader00·splash01/02·white_wave00 은 [미확정] |
| f32 | double | Math.fround | — | 비트 |

- 그리기 순서용 카메라: 배치 메시 `onBeforeRender`가 마지막 카메라 view 행렬을 코어에 넘기고 다음 `sync`가 쓴다(한 프레임 늦음 [근사]).
- 원본 규칙에서도 웹 근사로 둔 것: 커스텀 FS(물보라·거품 노말맵·매트캡 합성·CSDP), billboard 0 의 화면 Z 회전, 텍스처 repeat/Mirror·스크롤 식, UV 반전 난수(U.w·U.z 를 씀 [근사]), Sphere 경도(helper 0753370 미판독, φ = start + sweep(u−0.5) [근사]), 이미터 회전 순서 ZYX, 자식 입자 원점(부모 입자 월드 위치 + 자식 E, follow 1 처럼 [근사]).

### 14.6 검증(노드, 헤드리스 없음)

- `tools/test_effect.ts` 106건: 0 이름 해석(등록 순서·경로·확장자·strcmp 대소문자·별칭·없는 이름) · 1 핸들 세대·Start 전 무계산 · 2 방출 수(water_entry00 프레임 0 = 5·15·12·4800·1·1·1, wave00 0/8/16, wave01 0~25/5, white_wave00 0~8/2, one-time 보정, 최대 입자 수, 첫 방출 최소 1, intervalRandom) · 3 float 수명·죽음 경계 · 4 운동 단계값(CPU 순서, web 과 차이, GPU F(T), wave CS N·K=1, FSPN 반경) · 5 N/Q 표·LCG·회전 분포 · 6 키 패딩·보간·고정색·루프 · 7 정렬(내림/오름/음수 뒤집기, key 압축, 먼 셋 먼저) · 8 Stop(false)/web stop/fade·selfDestroy 지연 해제 · 9 PlayRate·follow 0/1 · 10 결정성(Math.random 0회, 같은 씨앗 같음) · 11 import 경계·할당(입자 갱신·출력 0.00 B/스텝, 방출 포함 약 147 B/스텝) · 12 §10.3 기대값(success01 이미터 5, `.eset` 해석, JUST/FAST 별칭, steam00 정상 상태 51~72) · 13 골든 18건.
- 골든 `tools/effect_golden.ts`: 9 시나리오(steam00 시작·150 틱 정지, steam01, water_entry00/01, success00/01, pt_effect ×1.5, common_success 4명, mix = mg1801 흐름 축약 + 없는 이름)를 1/60 틱마다 돌려 장면 그룹의 배치 메시를 읽는다. 입자 기록 = 월드 위치·크기·회전·색0·색1·나이·수명·UV 난수 2·fade(f32). 줄 = 틱·renderOrder·이름·수·집합 sha1·그리기 상태 sha1·그리기 순서 sha1. 이전 전 코드(GPU 닫힌 식)는 그 정점 셰이더 식을 도구가 그대로 계산해 같은 기록으로 만든다.
  - **이전 검증(a)**: 이전 전 코드 트리를 스크래치에 재구성해 같은 도구로 돌린 기록 = `GOLDEN_SHA256_WEB`. `RULES_WEB` 실행이 9/9 시나리오 기록 파일 바이트까지 같다(입자 집합·순서·그리기 상태).
  - **원본 기준(b)**: `GOLDEN_SHA256` = `RULES_ORIGINAL`(기본) 실행. 항목 하나씩 되돌려 본 영향(이미터): fields → 물보라 bubble00·wave00, keys → 물보라 bubble00·twinkle00/01/02, sort → white_wave00·wave01, render → 모든 그리기 상태(입자 값 불변), follow → wave00·white_wave00·twinkle(f32 반올림만), stop → steam00·bubble00·crown00(교체 시점), inherit·playRate → 없음. 운동·방출·표본은 원본 경로 자체라 모든 이미터.
- 이펙트는 시각 전용이라 로직·카메라·캐릭터 값과 연결이 없다(기존 노드 시험 전체 통과로 확인).

### 14.7 자리만 둔 것·남은 것

- FRND(김 steam00/01 흔들림): 기본 가지 식은 있으나 `ν = DAT_7101c405f8/K`의 전역 분자 미판독(§6.2) → 두 규칙 모두 적용하지 않음 [미확정]. 자료는 F[2]=1(a* 경로)·A=(0.005,0,0.005)·K=1000.
- soft particle·Combiner/CSDP 커스텀 FS(물보라 shader00·splash·bubble/crown): §11 #4 미판독 → 웹 근사(매트캡) [근사].
- 회전 fluctuation(D[E7E..]·Static C80..)·색/알파 상속 D[D54..D57]·FCOL/FMAG/FCOV/FCLN/FPAD·이미터 이동 속도 상속(F64)·world velocity·EA** 이미터 애니: mg1801 자료에서 쓰지 않아 미구현.
- 파형 선택(FC7, 자료 값 8)·flags1 비트 → mode 연결 미판독 → cos(mode0) [근사].
- 이미터 scale(예 twinkle 0.05)을 입자 크기에 곱하는지: VS 의 `c[A][120..]` = E[280..] 원천 미확정 → 위치·속도에만 곱함(이전 웹과 같음) [미확정].
- 저해상도 패스(drawPath 8/16 profile)·layer 마스크·장면 pass 배열: 그리지 않음(§6.7, 장면 값 필요). `layerBits`는 저장만.
- intervalRandom 으로 간격이 1 미만이 되면 1(무한 반복 방지) [근사].
- §6.1 표의 success twinkle "1회 수 10"은 rate 이고, CircleDiv 는 rate × 분할(twinkle00 6 → 60, twinkle02 8 → 80)이다(bubble00 정정과 같은 규칙, 이전 웹·원본 규칙 모두 60/80).

[정정 2026-10-10] [판독] 첫 항목의 FRND 전역 분자 미판독은 위 writer로 해소됐다. 웹 FRND 미구현과 원본 seed/콜백 순서 공백은 별개이며, 이 정정으로 웹 규칙 적용이 완료됐다는 뜻은 아니다. (근거: [plaza_intro.md](../shell/plaza_intro.md) §10.4·§13.2·§16)
→ 광장 첫 진입 정리: [plaza_intro.md](../shell/plaza_intro.md) §10.4·§16

[설계] → 정리본: [mg0203](../minigame/mg0203.md) · [mg0108](../minigame/mg0108.md) · [mg0110](../minigame/mg0110.md) · [mg0116](../minigame/mg0116.md) · [mg0113](../minigame/mg0113.md) §7~§9
### 14.8 사용자 확인 필요

- **crown00(김 거품 위 왕관)의 시점**: 원본 식에서 자식 방출 S = parent.life·timing/100 은 bit17(D[D5C])일 때만이고, 자료의 D[D5C]=0 이다. bit17 없는 자식 경로(§6.1 허용식의 `!bit0 || bit17`, 073eb0c 소멸/자식 처리)는 판독되지 않아 이전 웹처럼 부모 수명 ⌊L·85/100⌋ 프레임에 방출한다 [근사]. 원본은 부모 소멸 때일 수 있다.
- **CCB(파서 이름 isAlphaFadeIn)**: §5.3 판독은 CCB/CCC 를 Stop(true) fade 선택으로 읽는다. 원본 규칙에서 water_entry shader00 의 시작 10 프레임 페이드인을 없앴다. 시작 페이드인이 다른 칸에 있는지는 미확인.
- (해소 2026-10-09) **PlayRate**: PERFECT `mg_common_pt_effect_00`은 원본대로 BPM/120 속도로 재생한다(mg1801.md `camgcmm_tlp_perfect`, GetPlayRate @0x7100425e60). `index.ts`가 `spawn(name, pos, 1.5, state.bpm / 120)`으로 넘긴다.
- 캐릭터 FTRG fx 키 `<KEY>_Stop` = 같은 키 이펙트의 Stop(true)로 본 것은 키 이름 규칙 [추정]. 웹 자료에 캐릭터 fx eset(bq 상주 `fx_*`, `bd00_*`)이 없어 지금은 경고만 난다 — 변환 범위 결정 필요.
- 이름 충돌 등록 순서(mg/mg1801 → mg/mg1800 → libca/mg_common)는 §11 #8 [미확정]이다(mg1801 이 쓰는 이름은 충돌 없음).
- 원본 공유 xorshift seed 원천의 초기 상태는 미판독 → 고정 주입 씨앗(결정성 규칙). 원본과 같은 난수 열은 기대할 수 없다.
- billboard 4 원본 변환으로 물결 판이 위(+Y)를 향하고 displaySide 1 컬링이 켜졌다. 화면 확인은 사용자가 직접(`dev/ui?ui=effect`).

### 14.9 보기 페이지(`dev/ui?ui=effect`)

`script/effect_page.ts`: 이미터셋 고르기, 재생·정지(Stop false/true)·반복, 원본 스위치(다시 만듦), 부착 대상(없음·원 궤도 물체), 이미터별 입자 수·사건 로그. URL `&set=mg1801_water_entry00&original=0`. 화면 확인은 사용자가 직접.
