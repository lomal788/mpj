# 00. 추출 파이프라인

원본 NSP에서 분석 가능한 파일을 꺼내는 과정과 그 검증 결과. 모든 산출물은 `extracted/` 아래에 있고, 이 문서의 명령으로 다시 만들 수 있다.

## 1. 원본

| 파일 | 크기 | 비고 |
|---|---|---|
| `c:/dev/original/Super Mario Party Jamboree [0100965017338000][v0][US].nsp` | 5,681,175,376 | 분석 대상 |
| `c:/dev/original/Super-Mario-Party-Jamboree-Switch-BASE-GAME.nsp.rar` | 5,855,965,024 | 미개봉, 위 NSP와 동일 여부 **[미확정]** |
| `c:/dev/original/prod.keys`, `title.keys` | — | 사용자 제공. 값은 문서·로그에 옮기지 않는다 |

원본 폴더에는 쓰지 않는다. 모든 출력은 `c:/dev/mpj/` 아래.

## 2. NSP (PFS0) 구성 [데이터]

| 이름 | NSP 내 오프셋 | 크기 | Content Type |
|---|---|---|---|
| `01009650173380000000000000000012.cert` | 0x190 | 1,792 | |
| `01009650173380000000000000000012.tik` | 0x890 | 704 | 공통 티켓, KeyGeneration 18 |
| `f929e6a8fcb185fa7dca60649d06cb06.nca` | 0xB50 | 5,679,267,840 | Program |
| `9bc395260801219b1622a086cde5520b.nca` | 0x15282CB50 | 1,626,624 | Control |
| `9a12f6760662dc62437a89ab397870c2.nca` | 0x1529B9D50 | 274,432 | Manual |
| `0cb06c199bc4f38a612fd89445e5ecfa.cnmt.nca` | 0x1529FCD50 | 3,584 | Meta |

모든 NCA: NCA3, KeyGeneration 18, Download 배포, SDK 17.5.4 (Meta만 19.0.0).

## 3. Program NCA 섹션 [데이터]

| 섹션 | NCA 오프셋 | 크기 | FS | 해시 | 암호 |
|---|---|---|---|---|---|
| 0 ExeFS | 0x151010000 | 0x181C000 | PFS0 | HierarchicalSha256 | AES-CTR |
| 1 RomFS | 0x1C000 | 0x150FF4000 | RomFS | IVFC (6레벨) | AES-CTR, **NCA 압축(LZ4)** |
| 2 Logo | 0x4000 | 0x18000 | PFS0 | HierarchicalSha256 | 없음 |

### RomFS IVFC 레벨 (섹션 기준 오프셋)

| 레벨 | 오프셋 | 크기 | 블록 |
|---|---|---|---|
| 0 | 0x0 | 0x4000 | 0x4000 |
| 1 | 0x4000 | 0x4000 | 0x4000 |
| 2 | 0x8000 | 0x4000 | 0x4000 |
| 3 | 0xC000 | 0x8000 | 0x4000 |
| 4 | 0x14000 | 0xA9C000 | 0x4000 |
| 5 (데이터) | 0xAB0000 | 0x1505425C0 | 0x4000 |

### NCA 압축 (CompressionInfo, FS 헤더 +0x178) [데이터]

- 테이블: 데이터 레벨 기준 오프셋 0x15052E5C0, 크기 0x14000. 테이블 끝이 데이터 레벨 끝과 정확히 맞는다.
- BucketTree `BKTR` v1, 엔트리 1,310개, 엔트리 크기 0x18:
  `VirtualOffset i64, PhysicalOffset i64, Type u8, Level i8, Reserved u16, PhysicalSize u32`
- Type 0 = 비압축(가상↔물리 1:1), 3 = LZ4 블록(가상 0x10000 단위). Type 1(0 채움)은 처리만 해두었고 이 NCA에서는 관측하지 못했다.
- 가상(압축 해제 후) RomFS 크기 0x15352E348 = 5,692,908,360 바이트.
- 노드 구조: 0x4000 노드. 노드 0은 L1 오프셋 노드(엔트리셋 2개), 노드 1·2는 엔트리셋(682 + 628 = 1,310).

## 4. 무결성 검증 [실행 — 자체 스크립트]

`web/tools/analysis/nca_romfs.py verify` 로 IVFC 전 레벨을 SHA-256 검증했다 (로그: `extracted/verify_romfs.log`).

| 레벨 | 불일치 블록 |
|---|---|
| 0~3 | 0 |
| 4 | 6 (블록 673~678) |
| 5 (데이터, 344,401 블록) | **0** |

해석:
- 데이터 블록 344,401개 × 해시 32B = 0xA82A20 바이트 → 레벨 4의 블록 0~672만 실제 데이터를 가리킨다.
- 불일치가 난 673~678은 레벨 4 할당 크기(0xA9C000)의 남는 꼬리이며 어떤 데이터 블록도 가리키지 않는다.
- 따라서 **RomFS 데이터는 전부 해시 일치**. nstool의 "Hash layer 4 failed" 경고는 이 미사용 꼬리 블록 때문으로 판단한다. **[실행]**
- 꼬리 블록이 왜 불일치하는지(덤프 도구의 0 채움 등)는 **[미확정]**. 데이터 정확성에는 영향 없다.

## 5. 도구

| 도구 | 출처 | 용도 | 결과 |
|---|---|---|---|
| nstool 1.9.2 | [jakcron/nstool](https://github.com/jakcron/nstool) | NCA 헤더·티켓 판독, ExeFS·Control 추출 | 동작. RomFS는 위 꼬리 블록 때문에 거부 |
| hactool 1.4.0 | [SciresM/hactool](https://github.com/SciresM/hactool) | 시험 | KeyGeneration 0x11을 "Unknown"으로 처리, 섹션 해시 FAIL → **사용 안 함** |
| hactoolnet (LibHac) | Thealexbarney/LibHac | — | GitHub 저장소 404, 미사용 |
| `web/tools/analysis/nca_romfs.py` | 자체 | NCA 헤더 XTS 복호화, AES-CTR, IVFC 검증, BucketTree+LZ4 압축 해제, RomFS 추출 | 동작 |
| `web/tools/analysis/bea.py` | 자체 ([BEA-Library-Editor](https://github.com/KillzXGaming/BEA-Library-Editor) 소스 기준) | BEA(SCNE v6) 목록·추출, Zstd 해제 | 동작 |
| `web/tools/analysis/msbt.py` | 자체 | MSBT(LBL1/TXT2, UTF-16) → JSON, 제어 태그는 `[group:tag:params]`로 보존 | 동작 |
| Ghidra 12.1.2 + SwitchLoader 1.6.1 | [NSA/ghidra](https://github.com/NationalSecurityAgency/ghidra), [Adubbz/Ghidra-Switch-Loader](https://github.com/Adubbz/Ghidra-Switch-Loader) | NSO/NRO 로드, 심볼 적용, 디컴파일 | 동작 — [docs/02](02_code_modules.md) |
| vgmstream r2117 | [vgmstream/vgmstream](https://github.com/vgmstream/vgmstream) | bfstm 디코드 | 동작 (예: `SM_BGM_MG0101_JMP` 48kHz 2ch DSP-ADPCM 53.3초) |
| BfresLibrary | [KillzXGaming/BfresLibrary](https://github.com/KillzXGaming/BfresLibrary) | FRES 9.1 (fmdb/fskb/fmab/fvbb/fsnb) 로드 | 동작 — `web/tools/analysis/bfres_probe` |
| BNTX-Extractor | [aboood40091/BNTX-Extractor](https://github.com/aboood40091/BNTX-Extractor) | BNTX → DDS (디스위즐) | 2D 동작 (래퍼 `web/tools/analysis/bntx_to_dds.py`), 배열 텍스처 미지원 |
| SMPJ-Map-Editor | [MH13-YT/SMPJ-Map-Editor](https://github.com/MH13-YT/SMPJ-Map-Editor) | 참고: 보드 JSON 파일명·BEA 처리 방식 | 소스만 참고 |

콘텐츠 키는 nstool이 티켓에서 풀어낸 값을 `--content-key`로 넘긴다. 키 값은 문서에 남기지 않는다.

## 6. 재현 명령

```sh
cd c:/dev/mpj
NCA=extracted/nsp/f929e6a8fcb185fa7dca60649d06cb06.nca
K=c:/dev/original/prod.keys
CK=<nstool -v 출력의 "NCA Content Key / AES-CTR Key">

# NCA는 NSP 오프셋 0xB50에서 5,679,267,840 바이트를 잘라 만든다
.venv/Scripts/python web/tools/analysis/nca_romfs.py $NCA --keys $K --content-key $CK info
.venv/Scripts/python web/tools/analysis/nca_romfs.py $NCA --keys $K --content-key $CK verify
.venv/Scripts/python web/tools/analysis/nca_romfs.py $NCA --keys $K --content-key $CK list > extracted/romfs_list.txt
.venv/Scripts/python web/tools/analysis/nca_romfs.py $NCA --keys $K --content-key $CK extract --out extracted/romfs

# ExeFS / Control (Git Bash에서는 경로 변환을 꺼야 한다)
MSYS_NO_PATHCONV=1 nstool.exe -k $K --tik extracted/nsp/ticket.tik --part0 extracted/exefs $NCA

# BEA 전체
.venv/Scripts/python web/tools/analysis/bea.py extract extracted/romfs/Archive/*.bea --out extracted/bea

# 메시지
.venv/Scripts/python web/tools/analysis/msbt.py extracted/message/koKR <msbt 파일들>
```

## 7. 산출물 요약 [데이터]

- RomFS: 1,539 파일, 5,692,801,695 바이트 (`extracted/romfs_list.txt`)
- BEA: 949개, 내부 파일 127,203개, 압축 해제 합계 약 9.7 GiB
- ExeFS: `main`(NSO, 15.9MB, 압축 해제 이미지 0x1BFB4B0), `sdk`, `subsdk0`, `rtld`, `main.npdm`
