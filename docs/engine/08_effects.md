# 08 이펙트 (파티클 · VFXB · bex::Effect)

2026-10-02. 상태: **분석 진행**. 파일 형식은 전체 파일로 검사했고, 런타임 API와 mg1801 호출은 판독했다. 입자 하나하나의 운동식은 GPU 셰이더(BNSH) 쪽에 있어서 판독하지 못했다(6.4). 웹 구현은 하지 않았다.

확정 수준 표기는 작업 지침 [분석.txt](../../../../web/분석.txt)(`c:/dev/web/분석.txt`)를 따른다.

- **[실행: 파서]** 우리가 만든 파서를 원본 파일 전체에 돌려 확인한 것
- **[판독]** 원본 코드를 읽어 확인한 것
- **[데이터]** 데이터 값을 확인한 것
- **[추정]**, **[미확정]**

이 문서에 원본 실행(게임 실행) 확인은 없다.

관련 문서:
- 게임 로직의 이펙트 호출 시점 — [../minigame/mg1801.md](../minigame/mg1801.md) 6.5·6.9·3.4
- FX 트리거(.ftrg) 형식 — [05_ui_input.md](05_ui_input.md)
- BNTX 디코드 — [03_graphics.md](03_graphics.md) (도구 `tools/graphics_bntx.py`)
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
| mg1801 | `extracted/bea/mg~mg1801.nx.bea/_Vfx/mg/mg1801/ConvertList.xml` (1,360,484 B) |
| 리듬 공용 | `extracted/bea/mg~mg1800.nx.bea/_Vfx/mg/mg1800/ConvertList.xml` (`mg1800_success00/01`) |
| 미니게임 공용 | `extracted/bea/libca~mg_common.nx.bea/_Vfx/libca/mg_common/ConvertList.xml` (`mg_common_pt_effect_00`) |
| 상주(bq) | `extracted/bea/bq.nx.bea/_Vfx/bq/ConvertList.xml` (48 MB, `fx_*` 공용 이펙트) |
| 파서 | `tools/effect_vfxb.py` (tree / dump / check / find) |
| 덤프 | `extracted/converted/effect/{mg1801,mg1800,mg_common}/vfxb.json`, `tex/*.png`, `textures.bntx`, `primitives.bfres`. 미리보기는 `extracted/converted/effect/contact_sheet.png`, mg1801 메시 프리미티브는 `mg1801/prim/primitives.glb` |
| 디컴파일 | `analysis/decomp/effect_bex.c`(bex::Effect 전체), `effect_main2.c`(RmStarEffectMan·이름 해석), `effect_vfx2_calc.c`(vfx2 이미터 계산), `effect_mg1801_dis.c`·`effect_mg1801_dis2.c`·`effect_mg1801_steam_dis.c`(mg1801 호출부 디스어셈블) |
| Ghidra 스크립트 | `tools/ghidra_scripts/EffectTool.java` (CoreTool 사본, 명령 dec/dis/disf/refs/srch/ptrs) |
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
| `Start(bool)` | 0x710011c170 | FUN_710011d538: 인자가 참이면 먼저 vtable+0x18(되감기로 추정)을 부른다. 이어서 이미터 vtable+0x58(시작)을 부르고 내부+0x120 = 0 |
| `Stop(bool)` | 0x710011c178 | 내부 vtable+0x10 으로 넘긴다(본문 미판독) |
| `StopImmediately()` | 0x710011c188 | FUN_7100725b10(이미터, 0) |
| `SetPosition(v)` | 0x710011c334 | 내부+0x80 = v(16 B), 내부+0x119 = 1(위치 갱신 필요). 실제 반영은 다음 갱신 때다 [판독], 그 시점은 [미확정] |
| `SetSelfDestroyEnabled(b)` | 0x710011c714 | 내부+0x118 = b |
| `SetLayerVisibilityBit(bits)` | 0x710011c798 | `ParticleFx2Emitter::SetLayerVisibilityBit` |
| `SetScale/SetRotation/SetTransform/Attach/SetMultiplyColor/SetParticleGlobalScale/SetAnimationSpeed/…` | 0x710011c358~ | mg1801 은 쓰지 않는다 |

- 생성 직후 레이어 비트는 `EffectModule` 기본값이다(`FUN_71001186bc`, `EffectModule::GetDefaultLayerVisibilityBit` 계열). 값은 [미확정].

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

- `PlayEffect`는 `Start` 뒤에 `SetPosition`을 부른다. SetPosition 은 "갱신 필요" 표시만 한다(3.2). 그래서 첫 방출 전에 위치가 반영되는지는 이미터 갱신 순서에 달렸다 [미확정]. mg1801 의 위치는 원점이라 결과는 같다.
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

검증 수준 표기:
- (P) — 149개 파일 9,642 이미터 전부에서 크기·ID 검사 통과
- (C) — vfx2 코드가 그 오프셋을 그 의미로 읽음 [판독: effect_vfx2_calc.c]
- (D) — 값 분포·mg1801 값이 의미와 맞음 [데이터]

| 오프셋 | 크기 | 필드 | 검증 | 비고 |
|---|---|---|---|---|
| 0x000 | 16 | flag, randomSeed, pad×2 | P | mg1801 전부 0 |
| 0x010 | 96 | name | P D | `steam00` 등 |
| 0x070 | 0xC50 | **Static 블록**(아래 표) | P C | vfx2 가 0x000~0xCBF(0xCC0 B)를 그대로 GPU 상수 버퍼에 복사한다(FUN_71007491a0 `memcpy(…,*param_1,0xcc0)`) → **입자 운동·색·크기 곡선은 셰이더가 계산한다** |
| 0xCC0 | 0x88 | EmitterInfo: u8×16(isParticleDraw, sortType, **calcType**(0xCC2), followType, …), randomSeed, drawPath, alphaFadeTime, fadeInTime, trans xyz(0xCE0), transRand xyz, rotate xyz(0xCF8, 라디안), rotateRand, scale xyz(0xD10), color0 rgba(0xD1C), color1 rgba, emissionRange… | P D C(0xCC3) | calcType 분포 0:6,232 / 1:3,011 / 2:399 |
| 0xD48 | 0x20 | Inherit: u8×16, u64, velocityRate, scaleRate | P | |
| 0xD68 | 0x48 | **Emission**: isOneTime(0xD68), isWorldGravity(0xD69), isEmitDistEnabled(0xD6A), isWorldOrientedVelocity, **start**(0xD6C u32), **timing**(0xD70 u32), **duration**(0xD74 u32), **rate**(0xD78 f32), **rateRandom**(0xD7C, 정수 %), **interval**(0xD80 i32), intervalRandom(0xD84 정수), positionRandom, gravityScale, gravityDir xyz, emitterDist unit/min/max/margin, emitterDistParticlesMax(0xDAC) | P C D | 쓰임은 6.1 |
| 0xDB0 | 0x58 | **Shape**: volumeType(0xDB0), sweepStartRandom, arcType, isVolumeLatitudeEnabled, …, sweepLongitude(0xDB8), sweepLatitude, sweepStart, volumeSurfacePosRand, caliberRatio, lineCenter, lineLength(0xDD0), **volumeRadius xyz(0xDD4)**, **volumeFormScale xyz(0xDE0)**, primEmitType(0xDEC), primitiveIndex u64(0xDF0), numDivideCircle(0xDF8), …Random, numDivideLine(0xE00), …Random | P C | 코드: volumeType 2 → ×numDivideCircle, 13 → ×numDivideLine. 0xDE0~0xDE8 × 이미터셋 스케일 |
| 0xE08 | 0x10 | **Render**: isBlendEnable, isDepthTest, depthFunc, isDepthMask, isAlphaTest, alphaFunc, **blendType**(0xE0E), displaySide, alphaThreshold, pad | P D | |
| 0xE18 | 0x60 | **Particle**: infiniteLife(0xE18), isTriming, **billboardType**(0xE1A), rotType, offsetType, rotRevRand xyz, isRotate xyz(0xE20~22), …, **life**(0xE28 i32 프레임), lifeRandom(0xE2C), momentumRandom, vertexInfoFlags, **primitiveID**(0xE38 u64), primitiveExID(0xE40), 루프 플래그 12 B, (0xE54 u32, 0xE58 u32), 루프 비율 i16×5(0xE5C), pad, i32×4(0xE68, 전부 100) | P C | 코드: infiniteLife 는 isOneTime 일 때만 유효(아니면 0으로 덮음). life 는 0xE28 또는 이미터 애니 최대값 |
| 0xE78 | 0x10 | Combiner u8×16 | P D | 거의 `00…00 00080808 …` |
| 0xE88 | 0xAC | **ShaderRef**: u8×4(+2 = 두 번째 셰이더 있음), 0xE8C, 0xE90, **shaderIndex(0xE94)**, shaderIndex2(0xE98), 0xE9C(−1), computeShaderIndex(0xEA0, 이름 추정), …, `SHADER_1` 같은 정의 문자열(0xEF0), actionIndex(0xF30, 이름 추정) | P D | shaderIndex 는 파일 안 이미터 순서대로 0,1,2… 증가하는 BNSH 변형 번호 |
| 0xF34 | 0x30 | **Velocity**: allDirection(0xF34), designatedDirScale, designatedDir xyz, diffusionDirAngle, xzDiffusion, diffusion xyz, velRandom, emVelInherit | P C D | 코드: allDirection × 이미터셋 스케일. steam 방향 (0,1,0) |
| 0xF64 | 16 | unknownV36 f32×4 | P | (100,0,0,0) 흔함 |
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
| 0x0A8~0x0FF | u32×22 | P: 5,485 표본 전부 0. EffectLibrary v50 에 없는 32 B 가 이 범위 어딘가에 있다(도구는 0x0B0 에 `unknownV53[8]`로 둠). 그래서 이 범위의 이름(loop rate/random 등)은 [미확정] |
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
| 0x8F0 | **scale 키표** | D(배율, base 에 곱함 [추정]) |
| 0x970 | param 키표, 0x9F0~0xB70 애니 키표 4개 | P |
| 0xBF0 | f32×16 | P |
| 0xC30 | rotateInit xyz, rotateInitRand xyz, **rotateAdd xyz(0xC50)**, rotateRegist, rotateAddRand xyz, … | C(0xC30·0xC40 읽음) D(π 값) |
| 0xC80 | scaleLimitDist…, f32×16 | P |

- 키 한 개는 `{x, y, z, time}` 이다. time 은 수명 대비 비율 0..1 [데이터: 0→1 증가].
- 키표 오프셋은 EffectLibrary 표기보다 +0x20 뒤에 있다(0x0A8 의 추가 32 B 때문).

### 4.4 열거형 (값 분포는 9,642 이미터 전체) [실행: 파서]

| 필드 | 값 → 의미 | 근거 |
|---|---|---|
| volumeType | 0 Point, 1 Circle, **2 CircleDiv**, 3 CircleFill, 4 Sphere, 5 SphereDiv, 6 SphereDiv64, 7 SphereFill, 8 Cylinder, 9 CylinderFill, 10 Box, 11 BoxFill, 12 Line, **13 LineDiv**, 14 Rectangle, 15 Primitive | EffectLibrary 열거. 2·13 은 코드로 확인 [판독]. 나머지 [추정] |
| blendType | 0(5,014) 일반 알파, 1(4,585) 가산, 2 감산, 3 곱, 4 스크린, 5(27) ? | EffectLibrary 열거 [추정]. 김(0)=반투명 연기, 물보라·고리(1)=가산 발광이라는 화면 기대와 맞음 |
| billboardType | 0(6,546), 3, 4, 5, 6, 7, 1, 10, 2 | EffectLibrary 의 VertexTransformMode(0 Billboard, 1 PlateXY, 2 PlateXZ, 3 DirectionalY, 4 DirectionalPolygon, …)는 이 버전과 맞지 않는다. 수면 위 물결(wave00/01, white_wave00)이 4 다 → 4 = 수평 판(XZ)으로 보인다 [추정]. 메시 프리미티브 거품(bubble00, crown00)이 3 이다 [미확정] |
| calcType | 0 CPU, 1 GPU, 2 GPU+스트림아웃 | EffectLibrary 이름 [추정] |
| color*Type | 0 고정, 2 8키 애니 | 키 개수와 타입 2 가 함께 나타남 [데이터]. 1(랜덤) [추정] |
| sampler wrap | 0 Mirror, 1 Repeat | 4분의1 원 텍스처(`mg1800_success00_ring00` 등 64×64)가 wrap 0 + `repeat=3` 이고, 반쪽 별(`mg_common_star_00` 32×64)이 wrapU 0 + `repeat=1` → **repeat 0 = 1×1, 1 = 2×1, 2 = 1×2, 3 = 2×2 로 UV 를 늘리고 Mirror 로 대칭 복사해 전체 그림을 만든다** [데이터][추정: 셰이더 식] |

### 4.5 bex::Effect 내부 객체 (0x130 B) [판독]

| 오프셋 | 내용 | writer | reader |
|---|---|---|---|
| +0x10 / +0x18 / +0x20 | ParticleFx2Emitter* / 약한참조 블록 / 세대 | FUN_710011d070 | 모든 Set* |
| +0x28..+0x38 | 소속 엔티티(월드) 핸들 | FUN_710011d070 / d1e0 | |
| +0x80 | 위치 Vector3f(16 B) | SetPosition | GetPosition, 갱신 |
| +0x118 | selfDestroy (u8) | SetSelfDestroyEnabled | 갱신(파티클이 다 끝나면 스스로 파괴) [추정] |
| +0x119 | 위치 갱신 필요 (u8) | SetPosition | 갱신 |
| +0x120 | Start 때 0 | FUN_710011d538 | |
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

- 이 표의 "추정 의미"는 4문자 이름과 EffectLibrary 를 근거로 한 [추정]이다. 필드 효과의 식은 [미확정]이다.

---

## 5. 상태 전이와 전체 수명

### 5.1 이펙트 하나의 수명 [판독 + 추정]

```
Create(name)
  ├ 이름 해석 실패 → 빈 핸들. 게임 유틸(EffectCreate/ShowCommonEffect/PlayEffect)은 이때 AbortImpl
  └ 성공 → ParticleFx2Emitter(=vfx2 EmitterSet 인스턴스) 생성, 레이어 비트 = EffectModule 기본값
Start(false)    → 방출 시작(시간 0)
매 프레임         → 이미터마다 방출 판정(6.1) → 입자 생성(초기 위치·속도·수명) → 셰이더가 시간 t 로 그림
Stop(false)     → 방출 중단. 남은 입자의 처리는 [미확정](vtable+0x10)
selfDestroy=1   → 모든 이미터가 끝나고 입자가 다 사라지면 파괴 [추정]
```

### 5.2 mg1801 이펙트별 수명

| 이펙트 | 시작 | 끝 | 겹침 |
|---|---|---|---|
| steam00 | MapImpl::Initialize | 상태 (0,6) 의 `Stop(false)` | 1개 |
| steam01 | 상태 (0,6) | 장면 해제(명시 Stop 없음 [판독: ReceiveState 범위]) | 1개 |
| water_entry00/01 | 조각마다 | 모든 이미터가 one-time 이라 저절로 끝나고 selfDestroy | 동시에 여러 개(조각 수만큼) |
| mg1800_success00/01 | 판정마다 | one-time + selfDestroy | 플레이어 4명 × 판정 |

- 일시정지·장면 끝의 일괄 정지는 `EffectModule::StopAll`/`Cleanup`(0x7100117188/0x7100117110)이 있다. 호출 시점은 [미확정].

---

## 6. 계산식·조건·의사코드

### 6.1 방출 [판독: effect_vfx2_calc.c, 일부 추정]

필드: `start`(0xD6C), `timing`(0xD70), `duration`(0xD74), `rate`(0xD78), `rateRandom`(0xD7C, %), `interval`(0xD80), `isOneTime`(0xD68).

1. **one-time 보정**(FUN_71007491a0 끝) [판독]: `isOneTime && !isEmitDistEnabled && duration < interval` 이면 `interval = duration`.
2. **방출 창**(FUN_710074d580) [판독]:
   - 일반 이미터: 시작 = `start`, 끝 = `start + duration`.
   - 자식 이미터(플래그 bit 0x11): 시작 = 부모 수명 × `timing`/100, 끝 = 시작 + duration.
   - 시간 ≥ 시작이고, (끝 제한이 없거나 시간 < 끝) 일 때 방출 함수(FUN_710074cb60)를 부른다. 끝 제한이 걸리는 조건은 플래그 bit 0x14, bit 0 이다. 연속 이미터(isOneTime=0)는 duration 과 무관하게 계속 낸다 [추정: 플래그 뜻].
3. **방출 간격**(FUN_710074cb60) [판독 일부]: 간격 = `interval + 1` 프레임. 간격마다 다음 값을 누적한다(이미터 LCG `x = x·0x41C64E6D + 0x3039`, u = x·2⁻³²).
   - `rate × emissionScale(인스턴스+0xDC) × 모듈 배율(+0x24C) × (100 − u·rateRandom)/100`
   - 누적 값의 정수 부분만큼 입자를 만든다. 한 분기에서 누적값을 1 이상으로 올린다(`if (fVar15 <= 1.0) fVar15 = 1.0`) [판독: 분기 조건 뜻은 미확정].
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

- mg1801 one-time 이미터의 방출 일정은 아래와 같다. 1·2·3을 적용한 값이고, 끝 프레임 포함 여부는 [미확정]이다.

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

### 6.2 입자 초기값 [추정 — 필드 이름과 값 근거]

```ts
// 단위: 위치 = 월드 단위(모델과 같음), 시간 = 프레임(60fps), 속도 = 단위/프레임
p0 = effectPos + emitterTrans + shapeSample(volumeType, volumeRadius * volumeFormScale)
     + randomInBox(transRand);
dirNormal = 모양 표면 법선(구·원) 또는 0;
v0 = dirNormal * allDirection
   + normalize(designatedDir) * designatedDirScale
   + 확산(diffusionDirAngle, diffusion xyz);
v0 *= 1 - rand() * velRandom / 100;
life = particle.life * (1 - rand() * lifeRandom / 100); // lifeRandom 은 % 로 추정(값이 life 보다 큰 표본 있음). 범위 방향은 미확정
scale0 = scale.xyz * (1 - rand() * scaleRandom / 100);
rot0 = rotateInit + rand±(rotateInitRand);   // rotRevRand 면 부호 랜덤
```

### 6.3 시간에 따른 값 (셰이더 계산) [추정]

Static 블록이 GPU 상수 버퍼로 그대로 간다는 것은 [판독]이다(4.3). 아래 식은 그 필드 이름에 맞춘 추정이다.

```ts
r = t / life;                                   // 0..1
color0 = type==2 ? keyLerp(color0Keys, r) : color0Const;
alpha0 = type==2 ? keyLerp(alpha0Keys, r).x : alpha0Const;
color1, alpha1 = 같은 방식;
scale  = scale0 * keyLerp(scaleKeys, r);          // 키 xyz = 배율
rot    = rot0 + rotateAdd * t;                    // rotateRegist 는 감쇠로 추정
// 운동(공기저항 a = airRes, 중력 g = gravityDir * gravityScale)
// CPU 적분 근사(웹 권장): 매 프레임  v = v * a + g;  p += v;
// 해석식 후보:  p(t) = p0 + v0 * (1 - a^t)/(1 - a) + g * (적분항)   (a=1 이면 v0*t + g*t²/2)
final = texSample(tex0) * color0 (컴바이너 0번 = 텍스처×색0) [추정], alpha = texA * alpha0
```

- keyLerp: 키가 1개면 상수다. r 이 첫 키 앞이면 첫 키, 마지막 키 뒤면 마지막 키 값을 쓴다. 그 사이는 선형 보간 [추정].
- **원본과 같게 하려면** 셰이더 식을 확정해야 한다(11절 1항).

### 6.4 판독하지 못한 부분과 이유

- vfx2 는 심볼이 없다. CPU 쪽 코드는 Static 블록의 공기저항(0x110)을 읽지 않는다(`srch #0x110` 에 float 읽기 0건) [판독]. 입자 위치는 정점 셰이더에서 계산한다고 본다.
- 셰이더는 `ConvertList.xml.bnsh`(Maxwell 바이너리)에 있다. Ryujinx 셰이더 변환기(Maxwell → GLSL)로 풀면 식을 읽을 수 있다. 이번 작업에서는 하지 않았다.

---

## 7. 이펙트·에셋 연결 — mg1801 이펙트 구성 [실행: 파서][데이터]

값은 `extracted/converted/effect/*/vfxb.json` 의 `summary` 에서 가져왔다.

열 설명:
- life = 수명(프레임) / 랜덤. 랜덤 값이 수명보다 큰 경우가 있어서(shader00 40/50, bubble00 60/75) 랜덤은 % 로 본다 [추정]
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

### 7.5 그 밖

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
tools/effect_vfxb.py dump <ConvertList.xml> <out> --png
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
| `view/effects/particles.ts` | 셰이더 | 입자 상태 배열, 프레임 적분, 키 보간 |
| `view/effects/render.ts` | BNSH | three.js `InstancedMesh`(평면 사각형 / glb 메시) + `ShaderMaterial` |
| `games/mg1801/view` | MapImpl·Obj·Player 호출 | 로직 사건 `effect` → registry |

**원본 이름과 웹 권장 이름**

| 원본 | 웹 권장 |
|---|---|
| `rate`(+0xD78), `interval`(+0xD80), `duration`(+0xD74), `start`(+0xD6C), `timing`(+0xD70) | `emit.rate`, `emit.step = interval+1`, `emit.duration`, `emit.start`, `emit.childTimingPct` |
| `particle.life`(+0xE28), `lifeRandom` | `life`, `lifeRandom` |
| `static.gravityDir/Scale`(+0x100/0x10C), `airRes`(+0x110) | `gravity`, `drag` |
| `color0/alpha0/color1/alpha1/scale` 키표 | `curves.color0` 등 `{t, v}` |
| `render.blendType` 0/1 | `THREE.NormalBlending` / `THREE.AdditiveBlending` |

### 9.3 업데이트 순서 (프레임마다, 로직 step 뒤 화면 onStep)

```ts
for (const fx of effects) {
  if (fx.posDirty) { fx.applyPosition(); fx.posDirty = false; }      // 원본 +0x119
  for (const em of fx.emitters) {
    em.time += 1;                                                     // 고정 60 → 1프레임
    if (em.inWindow()) em.accumulate();                               // 6.1, LCG
    for (const p of em.particles) {
      p.age += 1;
      if (p.age >= p.life) kill(p);
      else { p.vel = p.vel * drag + gravity; p.pos += p.vel; }        // 6.3 [추정]
    }
  }
  if (fx.selfDestroy && fx.allDone()) remove(fx);
}
// 그리기: 키 보간으로 색·알파·크기, billboardType 별 정점 변환
```

- 로직 결정성과는 무관하다(화면 전용). 그래서 Math.random 을 써도 로직 골든에는 영향이 없다. 원본과 같은 무늬가 필요하면 LCG 를 쓴다.

### 9.4 원본과 다를 근사 목록

| 항목 | 원본 | 웹 근사 | 동등성 유지 방법 |
|---|---|---|---|
| 입자 운동식 | GPU 셰이더(미판독) | CPU 프레임 적분 `v=v·drag+g` | BNSH 판독 뒤 식 교체(11절) |
| 커스텀 셰이더(물보라 shader00·splash·bubble/crown: 노말맵 + 수프색 + 알베도, CSDP 파라미터) | 굴절·라이팅 계열 [추정] | 알베도 × color0 + 가산. 노말맵은 무시하거나 간단한 림 | 화면 대조 |
| flowmap(wave00/01) | 흐름맵 UV 왜곡 | 생략하거나 시간 UV 오프셋 | — |
| GPU+SO(wave00) | 스트림아웃 | CPU 와 같게 | — |
| 필드(FRND·FSPN·FRN1) | 랜덤 흔들림·회전 | 작은 랜덤 가속(값은 하위 섹션 그대로) [추정] | — |
| 소프트 파티클·깊이 페이드 | 있음(softParticle 파라미터) | 없음(depthWrite false) | — |
| billboardType 3/4 | 미확정 | 3 = 메시 그대로(카메라 무관), 4 = XZ 평판 | 화면 대조 |
| 정렬(sortType) | 이미터별 | three.js 투명 정렬 | — |

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
| 전 파일 구조 | `python tools/effect_vfxb.py check extracted/bea` | 149 파일, 이미터셋 2,062, 이미터 9,642(자식 943). EmitterData 크기 0x1100 전부 일치(불일치 0). 샘플러 텍스처 ID 11,057개 전부 GTNT 에 있음(실패 0). 입자 프리미티브 ID 1,484개 전부 G3NT 에 있음(실패 0). 이름 깨짐 0 | [실행: 파서] |
| 키 개수 ↔ 키표 | `keys.py`(scratch) mg1801 17 이미터 | numColor0/Alpha0/Color1/Alpha1/Scale 키 수 = 키표의 유효 키 수, 모두 일치 | [데이터] |
| 오프셋 ↔ 코드 | Ghidra `srch` + 디컴파일 | 0xD68·0xD6A·0xD6C·0xD70·0xD74·0xD78·0xD7C·0xD80·0xDAC·0xDB0·0xDE0~0xDE8·0xDF8·0xE00·0xE18·0xE28·0xF34·0x10C 를 같은 의미로 읽음 | [판독] |
| 텍스처 디코드 | `dump --png` (graphics_bntx) | mg1801 14, mg1800 5, mg_common 3 → 22장 전부 성공, 육안 확인(contact_sheet.png) | [실행] |
| 프리미티브 | graphics_bfres2gltf dump/gltf | 모델 4개, glb 출력 | [실행] |
| 이펙트 이름 위치 | `effect_vfxb.py find` / esets 목록 | mg1801 이 쓰는 6개 이름이 각각 한 파일에만 있음 | [실행: 파서] |

### 10.2 웹 구현 시 기대값 (재구현 대조용)

| 입력 | 기대 |
|---|---|
| `create("mg1800_success01")` | 이미터 5: ring00, ring01, twinkle00, twinkle01, twinkle02 |
| `create("mg1801_steam00.eset")` | 확장자 제거 규칙으로 `mg1801_steam00` 을 찾음 |
| 존재하지 않는 이름 | 원본은 Abort. 웹은 경고 후 무시(차이를 문서에 남김) |
| JUST 판정 | `mg1800_success01` 를 (x, 1.5, 0)에, 점수 +2 |
| FAST·SLOW 판정 | `mg1800_success00`, 점수 +1 |
| water_entry00 하나 | 프레임 0 에 shader00 5 + splash01 15 + splash02 12 + bubble00 4,800(120 × 분할 40, 위 표 정정) + wave00·wave01·white_wave00 각 1. wave00 은 프레임 8·16, wave01 은 5~25, white_wave00 은 2~8 에 더 남 [6.1 표 — 판독 식 적용, 끝 포함 여부 미확정] |
| steam00 정상 상태 입자 수 | 10프레임마다 6개 × 수명 84~120(랜덤 30% 가정) → 50~72개 근처 [재구현 계산, 랜덤 해석 추정] |

---

## 11. 미확정 사항과 추가 분석에 필요한 근거

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| 1 | 입자 운동·색·크기 곡선의 정확한 식(공기저항·중력 적분, 키 보간 방식, 랜덤 범위 방향) | 모든 입자의 모양 | `ConvertList.xml.bnsh` 를 Ryujinx ShaderTools 등으로 GLSL 변환해 정점 셰이더 판독 |
| 2 | Static 0x0A8~0x0FF 의 필드 이름(추가 32 B 위치) | 루프 계열 값. 지금 표본은 전부 0이라 영향 없음 | 0이 아닌 표본을 찾거나 vfx2 코드에서 읽는 곳 |
| 3 | billboardType 열거(3, 4, 5, 6, 7, 10) | 물결·메시 방향 | 셰이더 판독 또는 화면 대조 |
| 4 | Combiner·ShaderRef 의 나머지 필드, CSDP 16 값의 의미 | 커스텀 셰이딩 | 셰이더 판독 |
| 5 | 하위 섹션(FRND, FSPN, FRN1, EA**)의 필드 배치와 효과 | 흔들림·회전 | vfx2 코드에서 4문자 상수(예 0x444E5246) 검색 |
| 6 | Stop(bool) 동작(vtable+0x10), selfDestroy 시점, 남은 입자 처리 | steam00 → steam01 전환 모습 | `effect_bex.c` 내부 vtable(PTR_DAT_7101a851e8) 함수 판독 |
| 7 | SetPosition 이 Start 뒤에 불릴 때 첫 방출 위치 | 원점이 아닌 PlayEffect 사용 게임 | 내부 갱신 함수(+0x119 읽는 곳) 판독 |
| 8 | 같은 이미터셋 이름이 여러 리소스에 있을 때의 우선순위(등록 순서) | 다른 게임 | ParticleFx2Module 리소스 등록 함수 판독 |
| 9 | 기본 레이어 비트와 카메라 레이어 마스크 | 표시 여부 | `FUN_71001186bc`, 카메라 담당 문서 |
| 10 | G3NT 8바이트·ID 해시, TRMA/TRIM | 프리미티브 대응(지금은 순서 추정) | 다른 파일 표본 비교 |
| 11 | 방출 끝 프레임 포함 여부(duration 경계)·intervalRandom 적용식 | 물결 개수 ±1 | FUN_710074cb60 나머지 판독 |
| 12 | `mg_common_pt_effect_00` 사용처 | 미니게임 공용 연출 | FUN_710043ce38 호출자 |

### 정정 기록

- mg1801.md 7절의 "`RmStarEffectMan`" 이펙트 항목: 실제로는 파티클이 아니라 점수 가산이다(3.4). 그 문서는 이 담당이 고치지 않는다. 같은 내용을 SHARED 게시판에 올렸다.
- 작업 지시의 "mg1801 ConvertList 약 8.8 MB"는 mg0101(8,866,460 B)의 크기다. mg1801 은 1,360,484 B 다 [데이터].
