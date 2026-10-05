# 01. 패키지 구성과 에셋 포맷

추출 방법은 [00_extraction_pipeline.md](00_extraction_pipeline.md) 참고. 이 문서는 무엇이 들어 있고 어떻게 읽는지를 다룬다.

## 1. RomFS 최상위 [데이터]

| 경로 | 수 | 내용 |
|---|---|---|
| `Archive/*.bea` | 949 | 거의 모든 에셋. Bezel Engine Archive |
| `stream/*.bfstm` | 443 | 스트리밍 사운드 (BGM·징글) |
| `nro/NX_Release/*.nro` | 139 | 동적 로드 코드 모듈 — [docs/02](02_code_modules.md) |
| `movie/**/*.mp4` | 5 | 오프닝(`bq_op.mp4`), extra/ppet 영상 |
| `boot.nbinit` | 1 | 엔진 초기화 설정 (JSON) — §5 |
| `ac.nx.archiveconfig` | 1 | 내용 `nx` (BOM 포함) |
| `.nrr/bq_Release.nrr` | 1 | NRO 등록 목록 |

### BEA 이름 규칙 [데이터]

`<분류>~<이름>.nx.bea`. 분류별 개수: `mg~mg####` 114(미니게임), `sound~*` 다수, `chara~npc*` 73, `chara~pc*` 22, `object~obj*` 19, `bd~bd0#` 8(보드), `bd~qtbd*` 6, `mgm~*` 7, `menu~*` 9, `ca~*` 6, `kb~*` 7, `extra~*` 6, `flow~*` 4, `message~<locale>` 16, `bq.nx.<locale>.bea` 15, `_Resident*`/`_System*` 엔진 공용 등.

## 2. BEA (SCNE) 포맷 [판독 — BEA-Library-Editor 소스 + 데이터]

기준: [KillzXGaming/BEA-Library-Editor](https://github.com/KillzXGaming/BEA-Library-Editor) `BezelEngineArchive_Lib`. 구현은 `tools/bea.py`.

### 헤더 (파일 시작 기준, LE)

| 오프셋 | 타입 | 필드 | Jamboree 값 |
|---|---|---|---|
| 0x00 | char[4] | `SCNE` | |
| 0x08 | u32 | version | `0x00060000` (major2 = 6) |
| 0x0C | u16 | BOM | `FF FE` |
| 0x0E | u8 | alignment (log2) | |
| 0x0F | u8 | target address size | |
| 0x16 | u16 | 첫 블록 오프셋 | |
| 0x18 | u32 | relocation table 오프셋 (`_RLT`) | |
| 0x1C | u32 | 파일 크기 | |
| 0x20 | u32 | file count | |
| 0x24 | u32 | ref count | |
| 0x28 | u64 | asset 오프셋 | |
| 0x30 | u64 | file info 오프셋 → u64 포인터 배열 → `ASST` | |
| 0x38 | u64 | `_DIC` 오프셋 | |
| 0x40 | u64 | 아카이브 이름 (u16 길이 + 문자열) | 예: `mg~mg0101` |
| 0x48 | u64 | 압축 이름 | `Zstd` |
| 0x50 | u64 | ref 목록 오프셋 | |

### ASST (엔트리 시작 기준)

| 오프셋 | 타입 | 필드 |
|---|---|---|
| 0x00 | char[4] | `ASST` |
| 0x04 | u32 + u64 | 블록 헤더 |
| 0x10 | u16, u16 | unk, unk2 |
| 0x14 | u32 | 저장 크기 |
| 0x18 | u32 | 원본 크기 |
| 0x1C | char[8] | 에셋 타입 (`_G3DMDL` 등, 비어 있을 수 있음) |
| 0x24 | u32 | unk3 |
| 0x28 | u64, u64 | file id 1, 2 |
| 0x38 | i64 | 데이터 오프셋 |
| 0x40 | u64 | 파일 이름 (u16 길이 + 문자열) |

데이터는 Zstd 프레임(`28 B5 2F FD`)이다. 949개 전부 추출했고 크기 불일치는 0건. **[실행]**

## 3. 에셋 타입 [데이터]

전체 통계는 [analysis/asset_types.tsv](../analysis/asset_types.tsv). 매직은 `mg~mg0101` 표본에서 확인했다.

| 확장자 | BEA 타입 | 매직 | 내용 | 읽기 수단 | 상태 |
|---|---|---|---|---|---|
| `.fmdb` | `_G3DMDL` | `FRES    ` ver 9.1 | 모델 (파일당 1모델) | [BfresLibrary](https://github.com/KillzXGaming/BfresLibrary) → `tools/bfres_probe` | **[실행]** 로드 성공 (예: `pc01_mario` 본 94, 셰이프 7, 머티리얼 5) |
| `.fskb` | `_G3DSKA` | `FRES` 9.1 | 스켈레탈 애니 | 같음 | **[실행]** 로드 성공 (예: `mg0101_fld0_op0` 300프레임, 본 32) |
| `.fmab` | `_G3DMAA` | `FRES` 9.1 | 머티리얼 애니 | 같음 | **[실행]** 로드 성공 |
| `.fvbb` | `_G3DVBA` | `FRES` 9.1 | 본 가시성 애니 | 같음 | **[실행]** 로드 성공 |
| `.fshb` | `_G3DSHA` | `FRES` 9.1 | 셰이프 애니 | 같음 | **[미확정]** 표본 시험 안 함 |
| `.fsnb` | `_G3DSNA` | `FRES` 9.1 | 씬 애니 (카메라·라이트) | 같음 | **[실행]** 로드 성공 (예: `mg0101_cam_game` 카메라 1) |
| `.bntx` / `.ftxb` | `_TEXDATA` / `_TEXREF` | `BNTX` ver 4.1 / 경로 문자열 | 텍스처 / 텍스처 참조 | [BNTX-Extractor](https://github.com/aboood40091/BNTX-Extractor) + `tools/bntx_to_dds.py` | **[실행]** 2D 텍스처 DDS→PNG 정상 (예: `mg0101_floor00_alb` BC1 512²). **배열 텍스처(`*_arr_*`)는 미지원** |
| `.apx` | `_PHYSX` | `SEBD`, ver 0x04010200, 빌드 해시 `77E92B17A4084033A0FDB51332D5A6BB`, 플랫폼 `NX64` | **PhysX 4.1.2 바이너리 직렬화** 충돌 | [NVIDIA PhysX 4.1](https://github.com/NVIDIAGameWorks/PhysX) SDK | **[데이터]** 형식 확정. PC에서 직접 읽기는 NX64 메타데이터가 없어 **[미확정]** |
| `.nbmap` | `_ENTITY` | `BEEGENTY` | 엔티티 배치 (맵) | 공개 파서 없음 | **[미확정]** |
| `.ftrg` | `_FXTRIG` | `FTRG` | 이펙트·사운드·진동 트리거 | 공개 파서 없음 | **[미확정]** |
| `.xml` | `_VFX2` | `VFXB` | 파티클 이펙트 (Effect 2) | Switch-Toolbox (VFXB/PTCL) | **[미확정]** |
| `.bnsh` / `.bnbshpk` / `.bfsha` | 셰이더 | `BNSH` / `BEZSHAPK` | GPU 셰이더 바이너리 | 웹에서는 재작성 대상 | — |
| `.lyt` / `.bgsh` | `_LAYOUT` / `_LYTSH` | | UI 레이아웃 | **[미확정]** | |
| `.fsst` / `.fspj` | `_ADDAUD` / `_MAINAUD` | | 사운드 아카이브·프로젝트 | vgmstream 지원 여부 | **[미확정]** |
| `.bfstm` | (RomFS 직접) | `FSTM` | 스트림 사운드 | vgmstream | **[실행]** 디코드 확인 |
| `.msbt` | (없음) | `MsgStdBn` | 텍스트 | `tools/msbt.py` | **[실행]** |
| `.json` | (없음) | UTF-8 BOM | **게임 데이터 (393개)** | 그대로 읽음 | **[데이터]** |
| `.csv` | (없음) | | 물리 라벨·속성 정의 등 (258개) | 그대로 읽음 | **[데이터]** |
| `.msgpack` | (없음) | | 오디오 점프 설정 등 (174개) | msgpack | **[미확정]** |
| `.bnvib` | (없음) | | HD 진동 (463개) | | 웹 포팅 범위 밖일 가능성 |

### 게임 데이터 JSON [데이터]

웹 포팅에서 그대로 쓸 수 있는 핵심 자료.

- 미니게임: `mg/mg####/data/database.json`. 예: mg0101의 `barPatternA/B`는 `{frameL, posL, frameR, posR}` 목록이다.
- 보드(bd00 공용 + 맵별): `bd00_ItemShop_Map0#`, `bd00_ItemBag_Map0#`, `bd00_ItemMass_Map0#`, `bd00_LuckyMass_Map0#`, `bd00_KoopaMass*`, `bd00_HiddenBlock`, `bd00_PlayerMove`, `bd00_EventMassMap01`, `bd00_MgTeam`, `bd00_LastspurtCharacterList`, `bd00_Emote*`, `bd00_Mess*` 등
- 맵 구조: `*_MapNode`, `*_MapPath`, `*_MapStructure`, `*_MapCamera`, `*_MapQuest`
- 리듬 쿠킹: `*_rm_chart##.json` (채보 추정 **[추정]**)

### 텍스트

`message~<locale>.nx.bea` 안의 `mess/bin/<locale>/*.msbt`. koKR·enUS는 `extracted/message/<locale>/*.json`으로 변환해 두었다. 이름 키 예: `im_mg0101_name`, `im_bd01_name`, `im_mode01_name`, `im_pc01_name`.

### 포맷 메모

- BNTX 4.1의 BRTI +0x10 바이트가 0x09다. BNTX-Extractor는 이 바이트를 타일 모드(0 = pitch, 1 = block-linear)로 읽는다. 그래서 `tools/bntx_to_dds.py`에서 하위 비트만 쓰도록 래핑했다. 상위 비트(0x08)의 의미는 **[미확정]**. 원본 저장소 코드는 수정하지 않았다.
- 배열 텍스처는 BfresLibrary 동봉 `Syroot.NintenTools.NSW.Bntx` 또는 Switch-Toolbox로 처리할 수 있는지 시험이 필요하다. **[미확정]**
- `tools/bfres_probe`는 BfresLibrary(netstandard2.0)를 참조하는 .NET 7 콘솔이다. 실행: `tools/bfres_probe/bin/Release/net7.0/bfres_probe.exe <파일들>`.

## 4. 사운드 [데이터]

- `stream/SM_BGM_*` 등 bfstm 443개: 48 kHz, DSP-ADPCM (표본 1개 확인).
- `sound~subarc_*`, `sound~snd_sp_*` BEA에 효과음·보이스·사운드 공간(`.bspp`).
- 오디오 설정: `audio.nx.bea` 안의 `audio/data/mgsound_setting.json`, `audio/jump_setting/conv/*.msgpack`.

## 5. 엔진 초기화 설정 `boot.nbinit` [데이터]

웹 포팅의 시간 축에 직접 영향을 주는 값들.

| 항목 | 값 |
|---|---|
| 해상도 기준 | 1920×1080 |
| 프레임레이트 | `FrameRateMode_Fixed`, `FixedFrameRate_Fps60` |
| 고정 업데이트 서브스텝 | `IsFixUpdateSubStepEnabled: true`, `FixUpdateSubStepFps: 60.0` |
| 기본 컬처 | `jaJP` |
| 물리 | `IsCcdEnabled: true`, `SolverType: PhysicsSolverType_Pgs` |
| 오디오 | 보이스 최대 96, BGM 슬롯 16, Opus 디코더 2 |
| FX 트리거 | 사운드 512, 파티클 256, 진동 64, 애니 이벤트 384 |
| 스크립트 | `ScriptDedicatedMemorySize` 8 MiB (main에 Lua 심볼 있음) |

**정정(2026-10-02, 엔진 코어 판독):**
- nnMain(`main @0x71000035d8`)이 파일을 읽은 직후 프레임 모드를 Variable60으로 덮어쓴다. 그래서 보통 장면은 실측 프레임 시간(최대 0.05 s)으로 돈다.
- 리듬 장면(`RmMgSceneBase` 생성자 `@0x7100440fb8`)과 온라인 동기 장면만 Fixed60을 강제한다.
- 물리 서브스텝(타이밍 0x0F)은 고정 60에서 프레임당 한 번 돈다.
- 자세한 내용은 [web/docs/engine/01_core.md](../web/docs/engine/01_core.md). **[판독]**

## 6. 미니게임 카탈로그 [데이터]

[analysis/minigame_catalog.tsv](../analysis/minigame_catalog.tsv). 112종 모두 `nro/mg####.nro`, `Archive/mg~mg####.nx.bea`, `im_mg####_name`(ko/en)이 1:1로 대응한다. 앞 두 자리 그룹(01~18)의 의미(미니게임 종류 분류 등)는 **[미확정]**.
