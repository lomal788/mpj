# 05. UI·입력·FX 트리거 — 레이아웃(.lyt), 폰트, 메시지 태그, 입력·자이로, FX 트리거·진동

2026-10-02. 상태: **분석 진행**(포맷 파서 완료, 입력·트리거 판독 일부). 웹 코드는 고치지 않았다(10절은 명세다).
확정 수준: **[실행]** 원본 실행 확인, **[판독]** 원본 명령 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**. 이 문서에 원본 [실행]은 없다. 자체 파서·렌더를 돌린 결과는 **[실행: 파서 실행 확인]** 으로 따로 적는다.
주소는 SwitchLoader 기본 베이스(0x7100000000) 기준이고 따로 적지 않으면 main NSO다(`main @0x…`).

리듬 공용 UI 매니저(`ca::rm::RmUiTelopMan`, `RmUiStatusMan`, `RmUiCntWipe`)의 게임 규칙은 [02_rhythm.md](02_rhythm.md)가 다룬다. 이 문서는 그 UI가 쓰는 포맷·재생 규칙과 포팅 방식만 다룬다.

---

## 1. 결론 요약

| 주제 | 결론 | 수준 |
|---|---|---|
| 레이아웃 컨테이너 | `.lyt` = **SARC**(해시 키 0x65) 안에 `blyt/*.bflyt`, `anim/*.bflan`, `timg/__Combined.bntx`, `fcpx/*.bfcpx` | [데이터] |
| 레이아웃 포맷 | **nn::ui2d BFLYT/BFLAN v9.0.0.0**. 공개 BFLYT(v8, Switch-Toolbox) 구조와 같고, v9에서 새 섹션 `ctl1`, 재질 플래그 bit19(상세 컴바이너 추정)만 추가 | [실행: 파서 실행 확인] 전 레이아웃 1,262 bflyt·3,587 bflan, 섹션 크기 검증 오류 0 |
| `.lyt.bgsh` | SARC(`bgsh/__ArchiveShader.bnsh`, `.bushvt`) = 레이아웃 전용 셰이더. 셰이더가 필요 없는 레이아웃은 5바이트 `DUMMY` (mg1801) | [데이터] |
| 레이아웃 재생 | 페인 트리·원점·부모 원점·알파 전파·재질 흑/백 보간·bflan 에르미트 곡선을 PIL로 재현한 렌더가 의미 있는 화면을 낸다(mg1801 연습 와이프, 리듬 JUST 텔롭, 리듬 점수판) | [실행: 파서 실행 확인], 원본 화면 대조는 없음 |
| 비트맵 폰트 | `.ffnt` = **FFNT v4.1**. 글리프 시트 = 내장 BNTX(BC4 배열 텍스처, **상하 반전 저장**), 셀 피치 = 셀+1px. 로캘·크기별 **부분집합**(게임 문구에 쓰는 글자만) | [실행: 파서 실행 확인] 88개 전부 |
| 텔롭 폰트 | `bqfont_telop.bfotf` = XOR 난독 OpenType("Nin-Mario Font v3_2"). 복호화하면 그대로 웹폰트로 쓸 수 있다 | [실행: 파서 실행 확인] |
| 메시지 태그 | `bq.msbp` 태그 그룹 4개: 0 System(Ruby/Font/Size/Color/PageBreak/Reference), 1 insert(Number/Text/…), 2 localize(복수형·조사·대소문자), 3 control(Wait_Scale). **바이너리에서는 string 파라미터 일부가 빠진다**(Color 의 name, Size 의 size) | [데이터] |
| 입력 API | `bex::InputModule::GetAcc(PlayerID)` = 패드 객체 +0x1C0 의 16바이트 벡터 그대로. 원천은 `nn::hid::GetSixAxisSensorStates` → **단위 G**. 4번째 성분 = 벡터 패딩 | [판독] (w=0 은 [추정]) |
| 단일 Joy-Con 축 | 엔진이 JoyLeft는 (x,y)→(−y,x), JoyRight는 (x,y)→(y,−x)로 돌려 "가로 쥐기" 기준 축으로 만든다 | [판독] |
| FX 트리거 | `.ftrg` = 버전 0x021A0000의 **객체 이미지 + 슬롯(종류, 상대 오프셋)** 직렬화. 루트 = SE·FX·VB 트리거 표 + 애니 프레임 이벤트 표 | [판독]+[데이터] 1,547개 전부 파싱 |
| mg1801 FX | 아카이브 자체엔 ftrg가 없다. `VB_MG1801_JUST/SUCCESS`(진동), 칼 휘두름 모션 2·3프레임의 `RC_/VO_RHY_KNIFE_SWING00`(소리·보이스)이 **캐릭터 공용 ftrg**에 있다 | [데이터] |
| 진동 | `.bnvib` = 200 Hz × 4바이트 샘플(진폭·주파수 코드 × 저/고역). 재생 설정은 `vib.nx.bea/vib/vibration.msgpack`(게인·우선순위) | [데이터], 주파수 환산식 [미확정] |
| HUD 포팅 | **레이아웃 재생기(최소 기능)를 만드는 쪽**을 권한다. 손 재현은 동적 텍스처·캡처·전용 셰이더가 필요한 것만 | 판단(8절) |

## 2. 자료 위치와 도구

| 항목 | 위치 |
|---|---|
| 레이아웃 | 아카이브마다 `<경로>/layout.lyt`(+`.bgsh`), 공용 `bq.nx.bea/Parts.lyt`(252 bflyt·719 bflan·10 fcpx·BNTX 131 MB), 로캘 `bq.nx.<locale>.bea/common/layout_loc.lyt`, mg1801 `mg~mg1801.nx.bea/mg/mg1801/layout.lyt`, 리듬 공용 `mg~mg1800.nx.bea/mg/mg1800/layout.lyt`, `libca~mg_common`, `libca~common` |
| 빈 GUI 아카이브 | `_ResidentGuiLayout`, `_SystemGuiLayout`, `_ResidentFont`, `_ResidentLocalizeMessage` 등 6개 BEA는 파일 0개(256 B 안팎) [데이터] |
| 폰트 | `font~font.nx.bea/Parts.lyt/Font/`(ja·en 등), `font~font_kr/_cn/_tw` 의 `Font_kr/…`: `*.ffnt`, `bqfont_telop.bfotf`, `FcpxSet.nbfcpxset`(msgpack), `FcpxSet.nbfcpxsetlyt`(SARC: fcpx 12개) |
| 메시지 | `message~mess.nx.bea/mess/bin/bq.msbp`, `message~<locale>.nx.bea/mess/bin/<locale>/*.msbt`(71개) + `style.mstl`, 변환본 `extracted/message/{koKR,enUS}/*.json` |
| 입력 데이터 | `extracted/romfs/boot.nbinit`(bezel_hid_init), `mg~mgInst.nx.bea/mg/mgInst/data/mgInst.json`, `bq.nx.bea/common/data/mgListCA.json`·`mgListND.json` |
| FX 트리거 | 아카이브마다 `<경로>/ftrg/*.ftrg`(1,547개), 캐릭터 공용 `bq.nx.bea/chara/pc/ftrgBase/ftrg/{fx,se,vb,vo,rc,st}_pc_base.ftrg`, 캐릭터별 `chara~pcNN.nx.bea/chara/pc/pcNN_*/ftrg/` |
| 진동 | `vib.nx.bea/vib/bnvib/*.bnvib`(463), `vib/seq/*.msgpack`(32), `vib/vibration.msgpack` |
| 디컴파일 | `analysis/decomp/ui_input.c`(InputModule·Vibration·MGList), `ui_hid_callers.c`·`ui_hid_core.c`(nn::hid 호출·축 변환), `ui_pad_update.c`, `ui_fxtrigger.c`(ComFxTrigger), `ui_ftrg_magic.c`·`ui_ftrg_res.c`(FTRG 로더·접근자) |
| 참고 공개 소스 | `tools/oss/ref_ui/`(Switch-Toolbox Layout/CAFE, Font/BXFNT, BFTTF.cs) — 필드 이름 기준으로만 썼다 |

| 도구 (`tools/`) | 하는 일 | 실행 결과 |
|---|---|---|
| `ui_sarc.py list/extract` | SARC 목록·추출(이름 해시 검증) | 129개 .lyt 전부 |
| `ui_lyt.py dump/survey` | bflyt·bflan·bfcpx·BNTX 목록 → JSON, 페인 트리 텍스트, 섹션 크기 검증 | 오류 0 (1,262/3,587) |
| `ui_render.py` | bflyt 정적 렌더(+bflan 한 프레임, FFNT 글자, 부품 재귀), `textures` 로 BNTX → PNG | `extracted/converted/ui/*/render_*.png` |
| `ui_font.py info/sheets/text/export/otf` | FFNT 파싱·시트 PNG·문자열 렌더·웹용 메트릭 JSON, BFOTF 복호화 | FFNT 88개 파싱 |
| `ui_msbp.py` | msbp → 태그·색·속성·스타일 표, mstl, msbt 태그 사용 통계·파라미터 해석 | `extracted/converted/ui/msbp/bq_msbp.json` |
| `ui_ftrg.py dump/survey/collect/find` | FTRG 객체 트리 JSON, 타입별 레이아웃 통계, 정규식으로 트리거·애니 이벤트 수집 | 1,547개 파싱, 루트 레이아웃 1종 |
| `ui_bnvib.py` | bnvib → JSON(진폭·주파수 코드, 50 ms 이중 진동 근사) | 463개 크기 검증 통과 |
| `ghidra_scripts/UiFindConst.java` | 32비트 상수(movz/movk)·문자열을 쓰는 함수 찾아 디컴파일 | FTRG 매직 사용 함수 29개 |

## 3. 레이아웃 `.lyt`

### 3.1 컨테이너 [데이터]

- `.lyt`는 BEA 타입 `_LAYOUT`, 내용은 SARC v0x0100(LE, 해시 키 0x65, 이름 표 있음)이다.
- 안의 경로: `blyt/<이름>.bflyt`, `anim/<레이아웃>_<태그>.bflan`(예: `mg1801_wip_bg_00_in.bflan`), `timg/__Combined.bntx`(레이아웃 묶음의 텍스처 전부를 한 BNTX에), `fcpx/<폰트>.bfcpx`.
- `.lyt.bgsh`(`_LYTSH`)는 SARC(`bgsh/__ArchiveShader.bnsh`, `bgsh/__ArchiveShader.bushvt`) 또는 문자열 `DUMMY`. bq 공용 Parts·layout_loc 은 실제 셰이더를 가진다. 웹은 쓰지 않는다(재질은 8절 근사).

### 3.2 BFLYT 헤더와 섹션 [실행: 파서 실행 확인]

헤더: `FLYT`, BOM `FFFE`, u16 헤더 크기 0x14, u32 버전 **0x09000000**, u32 파일 크기, u16 섹션 수. 섹션 = {char[4], u32 크기, 본문}. 전 레이아웃 관측 섹션 수:

| 섹션 | 수 | 내용 |
|---|---|---|
| `lyt1` | 1,262 | u8 drawFromCenter, f32 폭·높이(관측 전부 1920×1080), f32 maxParts 폭·높이, 이름 |
| `txl1` / `fnl1` | 1,005 / 684 | u16 개수 + u32 오프셋 표 + 문자열(텍스처·폰트 이름). 폰트 이름은 `bqfont_large.fcpx` 처럼 **fcpx** 를 가리킨다 |
| `mat1` | 1,151 | u16 개수 + 재질 오프셋(섹션 기준) — 3.5 |
| `pan1 pic1 txt1 wnd1 prt1 bnd1 ali1 scr1` | 6,581 / 5,327 / 1,971 / 1,417 / 2,370 / 121 / 191 / 20 | 페인 — 3.3, 3.4 |
| `pas1` / `pae1` | 6,428 | 직전 페인의 자식 시작·끝 |
| `grp1`, `grs1`/`gre1` | 1,347 / 59 | 그룹: char[34] 이름, u16 개수, 페인 이름 24 B × n. 그룹 트리 |
| `usd1` | 3,001 | 사용자 데이터. 직전 페인(없으면 레이아웃)에 붙는다. 항목 12 B {u32 이름 off, u32 데이터 off, u16 개수, u8 형식(0 문자열·1 int·2 float·3 구조체), u8} |
| `cnt1` | 559 | 컨트롤 — 3.6 |
| `ctl1` | 40 | **v9 신규**, 3.6 |

### 3.3 페인 공통 (`pan1` 본문 0x4C B, 모든 페인 앞부분) [데이터 + Switch-Toolbox 필드명]

| 오프셋 | 형식 | 필드 | 의미 |
|---|---|---|---|
| +0x00 | u8 | flags | bit0 표시, bit1 자식에 알파 전파(influencedAlpha), bit2 location adjust |
| +0x01 | u8 | origin | 하위 니블 = 자기 원점(x = n%4: 0 가운데·1 왼쪽·2 오른쪽, y = n/4: 0 가운데·1 위·2 아래), 상위 니블 = **부모 원점**(부모 사각형의 어느 점을 기준으로 위치를 재는가) |
| +0x02 | u8 | alpha | 0~255 |
| +0x03 | u8 | magFlags | 부품 배율 관련(관측 0) |
| +0x04 | char[24] | 이름 | 코드가 찾는 키(`x_` 접두가 코드 조작 대상인 관례 [추정]) |
| +0x1C | char[8] | userDataInfo | |
| +0x24 | f32×3 | translate | 부모 원점 기준, **y 위가 +**, 단위 = 1920×1080 화면 픽셀 |
| +0x30 | f32×3 | rotate | 도(°), z가 화면 회전 |
| +0x3C | f32×2 | scale | |
| +0x44 | f32×2 | size | 폭·높이 |

화면 변환(렌더 시험에서 쓴 규칙, 원본 화면 대조 전이라 [추정]):

```
M(pane) = M(parent) · T(parentAnchor) · T(translate) · Rz(rotate.z) · S(scale)
parentAnchor = 부모 사각형에서 parentOrigin 이 가리키는 점(부모 원점 기준 좌표)
사각형 = origin 에 따라 x∈[-w/2,w/2] | [0,w] | [-w,0], y∈[-h/2,h/2] | [-h,0](위 원점) | [0,h](아래 원점)
화면 픽셀 = (960 + X, 540 − Y)
알파: 자식 기준 알파 = 부모가 influencedAlpha 면 (부모 누적 × 부모 alpha/255), 아니면 부모 누적
```

### 3.4 페인 종류

| 섹션 | 공통 뒤 필드 | 비고 |
|---|---|---|
| `pic1` | 정점색 RGBA×4(TL,TR,BL,BR), u16 재질, u8 UV 세트 수, u8 플래그, UV 세트마다 f32×8(TL,TR,BL,BR) | 크기 검증: 8+0x4C+0x14+32·n = 섹션 크기 (전부 일치) |
| `txt1` | u16 버퍼 길이, u16 최대 길이, u16 재질, u16 폰트, u8 정렬(원점과 같은 니블 규칙), u8 줄 정렬, u8 플래그(bit0 그림자, bit1 길이 제한, bit4 글자별 변환), u8, f32 기울임, u32 텍스트 off, RGBA 위·아래 색, f32×2 글자 크기, f32 자간·행간, u32 이름 off, 그림자(위치·크기·색 2·기울임), u32 글자별 변환 off, f32(v8+) | 초기 문자열은 UTF-16. 게임 텔롭·점수는 **대부분 빈 문자열**이고 런타임에 메시지로 채운다(예 `x_tlp_start` 최대 2) [데이터] |
| `wnd1` | u16 늘림 ×4, u16 프레임 크기 ×4, u8 프레임 수, u8 플래그, u32 내용 off, u32 프레임 표 off; 내용 = 정점색×4 + u16 재질 + u8 UV 수 + UV; 프레임 = {u16 재질, u8 뒤집기} | 9분할 창 |
| `prt1` | u32 속성 수, f32×2 배율, 속성 0x28 B {char[24] 이름, u8×3 사용 플래그, u32 덮어쓰기 off, u32 사용자데이터 off, u32 페인정보 off}, 부품 레이아웃 이름 | 부품 = 같은 SARC(또는 bq `Parts.lyt`)의 다른 bflyt. 덮어쓰기 = 하위 섹션(pic1/txt1/wnd1) |
| `bnd1` | 없음 | 경계 상자(입력 영역 등) |
| `ali1`, `scr1` | 추가 바이트(정렬·스크롤 박스) | 파서는 원시값만 둔다 [미확정] |

### 3.5 재질 `mat1` [데이터]

재질 = char[28] 이름, **u32 flags, u32 고정값 0x08040200, RGBA black, RGBA white**(v8+ 순서), 이어서 flags 개수만큼:

| flags 비트 | 항목 | 크기 |
|---|---|---|
| 0–1 | 텍스처 맵 {s16 txl 인덱스, u8 (wrapU \| minFilter<<2), u8 (wrapV \| magFilter<<2)} — wrap 0 clamp·1 repeat·2 mirror | 4 B |
| 2–3 | 텍스처 SRT {f32 tx, ty, rot, sx, sy} | 20 B |
| 4–5 | 텍스처 좌표 생성 {u8 행렬, u8 원천, 14 B} | 16 B |
| 6–8 | TEV 단계 {u8 색, u8 알파, u16} | 4 B |
| 9 | 알파 비교 {u8 함수, 3 B, f32 기준} | 8 B |
| 10 | 블렌드 {op, src, dst, logic} | 4 B |
| 11 | 텍스처만 사용(플래그만) | 0 |
| 12 | 블렌드 로직 | 4 B |
| 14 | 간접 {f32 회전, 배율×2} | 12 B |
| 15–16 | 투영 텍스좌표 {f32×2 위치, f32×2 배율, u32} | 20 B |
| 17 | 폰트 그림자 {RGBA black, white} | 8 B |
| 18 | 알파 보간(플래그만) | 0 |
| **19** | **v9 신규, 상세 컴바이너로 추정**: u32 정보 + RGBA 상수×5 + u32, 단계마다 16 B | 0x1C + 0x10×TEV (관측 2건: `sys_meswin_model_00/_choices_00` 의 `x_model`) |

색 규칙(렌더 시험에서 씀, [추정]: ui2d 기본 컴바이너): TEV 단계가 없을 때 `출력 = black + (white − black) × 텍스처`(채널마다), 그다음 × 정점색 × 페인 누적 알파. 텍스처가 없으면 white 색 사각형.

텍스처 이름 접미와 형식 [데이터: mg1801·공용 관측]: `^s` = BC4 단일 채널(compSel 로 RGBA 확장; 재질 black/white 로 색을 입힌다), `^_C` = ASTC 8×6 sRGB 컬러, `^t` = 기타. 접미 의미의 공식 정의는 [미확정].

### 3.6 `cnt1`(컨트롤)·`ctl1` [데이터, 공개 도구에 없음]

`cnt1` = 코드가 쓰는 **기능 이름 → 페인/애니 이름 표**다. 레이아웃이 바뀌어도 코드는 기능 이름으로 접근한다.

| 오프셋(섹션 기준) | 내용 |
|---|---|
| +0x08 | u32 userName 오프셋 |
| +0x0C | u32 기능 페인 이름 표 오프셋 (24 B × n) |
| +0x10 / +0x12 | u16 페인 수 / u16 애니 수 |
| +0x14 | u32 페인 파라미터 이름 오프셋 표의 오프셋 (표 기준 상대 오프셋 n개) |
| +0x18 | u32 애니 파라미터 이름 오프셋 표의 오프셋 |
| +0x1C | 컨트롤 이름(인라인) |

예: `sys_mgstat_03` 컨트롤 `MGStatus` = {Face_P1..P4 → x_p_face_00..03, Name_P1_0 → x_parts_name_00, Name_P1_1 → (빈 이름 = 미배정), …, Score → x_text_score, Coin·Rank_00 → 미배정}.

`ctl1` = u32 개수 + 0x30 B 항목 {u32 이름 A off, u32 이름 B off, 0×0x18, u8[8](관측 항상 `01 0b 00 01 01 00 00 00`), u32 0, f32 값}. 예: `sys_tlp_start_00` (A `x_tlp_start_D`, B `x_tlp_start`, 0.25), `sys_mgstat_03` (`x_text_0N_D` → `x_text_0N`, 0.5). A 이름의 페인은 트리에 없다 → 런타임 복제(그림자/드롭) 페인 지정으로 보이나 **의미 [미확정]**.

### 3.7 애니메이션 BFLAN [실행: 파서 실행 확인]

- `pat1`: u16 순서, u16 그룹 수, u32 태그 이름 off, u32 그룹 이름 off, u32(v8+), s16 시작·끝 프레임, u8 자식 바인딩. 태그 이름은 `in`, `out`, `idle`, `normal`, `in_stage` 등 — 코드는 태그 이름으로 재생한다 [추정].
- `pai1`: u16 프레임 수, u8 반복, u16 텍스처 수(+이름), u16 대상 수, u32 대상 표 off. 대상 = {char[28] 이름, u8 태그 수, u8 종류(0 페인·1 재질·2 사용자), …}. 태그(`FLPA` 등) = {char[4], u8 트랙 수, 트랙 off}. 트랙 = {u8 인덱스, u8 대상, u8 곡선(1 계단·2 에르미트), u16 키 수, u32 키 off}, 키: 에르미트 {f32 프레임, 값, 기울기}, 계단 {f32 프레임, u16 값}.
- 같은 프레임에 키 두 개 = 불연속(점프). 에르미트 = 표준 3차 에르미트(기울기 × 구간 길이).

| 태그 | 관측 수 | 대상 값 |
|---|---|---|
| `FLPA` | 10,274 | 0–2 이동 xyz, 3–5 회전, 6–7 배율, 8–9 크기 |
| `FLVC` | 12,313 | 0–15 정점색(4정점×RGBA), 16 페인 알파 |
| `FLVI` | 222 | 표시(계단) |
| `FLMC` | 978 | 0–3 black RGBA, 4–7 white RGBA |
| `FLTS` | 592 | 텍스처 SRT |
| `FLTP` | 31 | 텍스처 바꾸기(pai1 텍스처 목록 인덱스) |
| `FLCT`, `FLIM` | 200, 4 | [미확정](파서는 키만 읽는다) |

### 3.8 실측 — mg1801·리듬 공용·공용 상태 UI

| 레이아웃 | 구성 [데이터] | 렌더 시험 [실행: 파서 실행 확인] |
|---|---|---|
| `mg1801_wip_bg_00` | 연습(와이프) 화면. 46 페인·27 재질. 셰프 모자 진행 점 `x_full_gr`(6개)·`x_half_gr`(3개), 설명 텍스트 `x_text_00/01`(bqfont_large, 빈 문자열), 조작 그림 `x_operate_00`, 캐릭터 실루엣 `chara_00/01`(840×3360 BC4 시트, UV로 프레임 선택), 채소 `sub_00..02`. 애니 `in`(20–30), `idle`(30–150 반복), `out`(160–170), `in_stage`(0–2) | `extracted/converted/ui/mg1801/render_wip_bg_00_idle30.png` |
| `mg1801_wip_bg_01` | 배경 1장(`mg1801_bg_00^_C` 640×360 ASTC) + 필터 | `render_wip_bg_01_idle30.png` |
| `mg1800_tlp_just/fast/slow` | 리듬 판정 텔롭. `all` 아래 텍스트 2장(`x_text_00_shadow` = bqfont_middle_shadow 주황 #ffa000, `x_text_00` = bqfont_middle 73pt). `in`(0–40): 배율 1.45→1.0(2–5f), 알파 0→255(0–2f)→0(36f), y 0→60(13–34f), 글자 black 색 흰색→0(4–7f, 빛남) | `extracted/converted/ui/mg1800/render_tlp_just_strip.png`(0·3·6·20f) |
| `sys_mgstat_posrhythm_00` | 리듬 점수판: `prt1 x_parts_00` → 부품 `sys_mgstat_03`(cnt1 `MGStatus`) | `extracted/converted/ui/bq_Parts/render_mgstat_posrhythm_00.png` — 얼굴 칸은 런타임 동적 텍스처라 비어 있다 |
| `sys_tlp_*` | 공용 텔롭(START/FINISH/321GO/WIN…): 대부분 txt1 1–2개 + bqfont_telop | 트리 `extracted/converted/ui/bq_Parts/*.tree.txt` |

### 3.9 공개 BFLYT 과의 관계

공개 도구(Switch-Toolbox `Layout/CAFE`, flyte)의 v8 BFLYT 정의로 섹션·페인·재질·애니가 **그대로 읽힌다**(1,262개 섹션 크기 일치). 다른 점은 v9의 `ctl1` 섹션, 재질 flags bit19 블록, BFLAN 태그 `FLCT`·`FLIM`이다. 웹 재생기는 이 차이만 건너뛰면 된다.

## 4. 폰트

### 4.1 구성 [데이터]

- `FcpxSet.nbfcpxset`(msgpack, `bezel_complex_font_set`) = 복합 폰트 목록 12개: `nintendo_udsg-r_std_003`, `bqfont_large`, `_middle`, `_ruby`, `_small`, `_emote`, `_telop`, 그리고 각 `_shadow`. 텍스처 캐시 8192×4096, 글리프 노드 8,192.
- `*.bfcpx`(FCPX v3.9) = 복합 폰트 하나의 구성 폰트 목록. 예 `bqfont_large.fcpx` = [`bqfont_large_usen.bffnt`, `bqfont_large.bffnt`, `bqfont_large_extension.bffnt`] — 글자 범위별 대체 순서로 보인다. 범위 표 구조는 [미확정]. `nintendo_udsg-r_std_003` 은 롬에 없다 → 시스템 공유 폰트 [추정].
- 그림자 폰트는 별도 글리프 시트(외곽 모양)이고, 레이아웃은 그림자 텍스트 페인을 **본 텍스트 페인 아래에 한 장 더** 둔다(3.8 텔롭).
- `boot.nbinit` `bezel_gui_layout_init`: LayoutConstantBufSize·FontConstantBufSize 10 MiB, 동적 텍스처 공유 96, 캡처 텍스처 24.

### 4.2 FFNT v4.1 [실행: 파서 실행 확인 — 88개]

| 블록 | 필드 |
|---|---|
| 헤더 | `FFNT`, BOM, u16 0x14, u32 0x04010000, u32 크기, u16 블록 수 |
| `FINF` | u8 형식, u8 높이, u8 폭, u8 ascent, u16 줄 간격, u16 대체 글리프, u8×3 기본 폭(left, glyph, char), u8 인코딩(1 = UTF-16 [추정]), u32 TGLP·CWDH·CMAP 오프셋(+8 = 블록 시작) |
| `TGLP` | u8 셀 폭·높이, u8 시트 수, u8 최대 글자 폭, u32 시트 크기, u16 기준선, u16 형식(관측 12), u16 행당 셀, u16 열당 셀, u16 시트 폭·높이(1024), u32 시트 오프셋(0x1000). 시트 데이터 = **BNTX 하나**(BC4 `0x1d01`, 배열 레이어 = 시트 수). `시트 크기 × 시트 수 = BNTX 크기` |
| `CWDH` | u16 첫·끝 글리프, u32 다음, 글리프마다 {s8 left, u8 glyphWidth, u8 charWidth} |
| `CMAP` | u32 첫·끝 코드, u16 방식(0 직접 {u16 오프셋}, 1 표 {s16×n}, 2 스캔 {u16 n, u16, (u32 코드, s16 글리프, u16)×n}), u16, u32 다음 |

글리프 위치: 시트 = 글리프 / (행당×열당), 셀 (cx, cy) → 픽셀 `(cx·(cellW+1)+1, cy·(cellH+1)+1)`. **시트는 상하 반전으로 저장**돼 있어 디코드 뒤 뒤집어야 한다 [데이터: 시트 PNG 확인, 렌더 `extracted/converted/ui/font/text_kr_large.png` 정상]. 커버리지는 BC4 R 채널.

| 폰트(ko) | 높이 | 셀 | 시트 | 글자 수 |
|---|---|---|---|---|
| bqfont_small | 76 | 49×55 | 4 | 1,112 |
| bqfont_middle | 100 | 59×65 | 4 | 980 |
| bqfont_large | 190 | 116×129 | 17 | 940 |
| (ja/en) bqfont_middle | 100 | 61×77 | 5 | 992 |

**부분집합 주의** [데이터]: koKR 메시지 전체에 쓰인 1,263자 중 bqfont_small(+usen+extension)에 없는 글자 87, middle 247, large 295(일본어 가나, 원문자, 일부 한글 음절 등). 스타일마다 그 스타일에 들어가는 문구의 글자만 담았다 → 임의 문자열은 표시되지 않을 수 있다.

### 4.3 BFOTF [실행: 파서 실행 확인]

`u32 매직(LE 0x1A879BD9)` + `u32 크기^키`, 이후 **빅엔디언 u32 단위 XOR**(키 2785117442 — 매직별, BFTTFutil/Switch-Toolbox 기준). 복호화 결과 `OTTO`(CFF OpenType) 500,460 B, 이름 "Nin-Mario Font v3_2 / Solid", cmap 8,252자. 로캘 간 동일 파일. 렌더 `extracted/converted/ui/font/telop_otf.png`.

### 4.4 웹 대체

| 용도 | 방법 |
|---|---|
| 일반 UI 글자(bqfont_*) | `ui_font.py export` → 시트 PNG(알파 = 커버리지) + 메트릭 JSON. 캔버스에서 셀을 잘라 `globalCompositeOperation` 으로 색 입힘(재질 black/white 보간 × 글자색). 크기 배율 = fontSize.y / FINF.height [추정] |
| 시트에 없는 글자 | 같은 크기의 웹폰트(예: 한국어 고딕) 대체 렌더. 원본은 시스템 공유 폰트로 대체한다고 보인다 [추정] |
| 텔롭(bqfont_telop) | 복호화한 OTF를 `@font-face` 로 그대로 사용(배포 허용 여부는 프로젝트 판단) |
| 그림자 | 그림자 폰트 시트를 별도 텍스트 페인으로 아래에 그림(레이아웃 그대로) |

## 5. 메시지

### 5.1 언어와 파일 [데이터]

- 로캘 15종(`message~deEU … zhTW`, 별도 `message~mess` 에 bq.msbp), 각 71개 msbt + `style.mstl`. 원본 문서 목록(CTI1) = `board/bd00.mstxt` 등 71개.
- `boot.nbinit` DefaultCulture·Culture = `jaJP`(기본값), 실제 언어는 시스템 설정으로 정해진다 [추정].
- 로캘별로 더 갈라지는 것: `font~font_kr/_cn/_tw`(한·중 글리프), `bq.nx.<locale>.bea/common/layout_loc.lyt`(`_sys_tips.bflyt` + 로캘 텍스처), `sound~subarc_sysvoi_<locale>`.

### 5.2 제어 태그 (`bq.msbp` TGG2/TAG2/TGP2/TGL2) [데이터]

msbt 변환본의 `[g:t:hex]` = 그룹 g, 태그 t, 파라미터 바이트(리틀 엔디언). u8 파라미터 뒤에는 정렬 패딩 `cd` 가 붙는다.

| 태그 | 이름(파라미터) | 바이너리 실제 | 사용(koKR) | 웹 처리 |
|---|---|---|---|---|
| [0:0] | System.Ruby(rt:string) | — | 0 | 루비(미사용) |
| [0:1] | System.Font(face:string) | u16 1개(관측 `0200`, `ffff`) — 폰트 인덱스/해제로 보임 | 16 | 2 = 폰트 전환, ffff = 원래대로 [추정] |
| [0:2] | System.Size(percent:u16, size:string) | **u16 percent 만** | 38 (100·150·135·80·75·66) | 글자 크기 % (100 = 원래대로) |
| [0:3] | System.Color(r,g,b,a:u8, name:string) | **RGBA 4 B 만** | 1,652 | 색 전환. 닫는 태그 없이 다음 Color 까지 유지(`070203ff` = 기본 검정, `ffffffff` 흰색으로 되돌림) |
| [0:4] | System.PageBreak() | — | 0 | |
| [0:5] | System.Reference(mstxt, label, lang) | — | 0 | |
| [1:0] | insert.Number(index:u8) | | 433 | 인자 index 의 숫자 삽입 |
| [1:1] | insert.Text(index:u8) | | 814 | 인자 문자열 삽입(캐릭터·보드 이름 등) |
| [1:2] | insert.Text_NumFloat(index:u8) | | 5 | 실수 삽입 |
| [1:3] | insert.Number_Pcs(index:u8) | | 29 | 개수 표기 숫자 |
| [2:0] | localize.pcs_Rus(sn, sg, pg:string) | | ruEU | 러시아어 복수형 3형 |
| [2:1] | localize.pcs_Othr(s, p:string) | u16 바이트 길이 + UTF-16 × 2 | enUS 등 | 단수/복수(예 coin/coins) |
| [2:2]/[2:3] | Cap()/Decap() | | | 다음 삽입 첫 글자 대·소문자 |
| [2:4] | localize.Particle(char:list) | u8 = none·ha(은/는)·wo(을/를)·ga(이/가)·to(와/과)·ni·ya·san | koKR 101 | 앞 삽입어 받침에 따라 조사 고르기 |
| [2:5]/[2:6] | pcs_*_NumID(index, …) | | | 인자 숫자 기준 복수형 |
| [3:0] | control.Wait_Scale(scale:f32) | f32 | 38 (8.0, 1.0) | 글자 출력 속도 배율(대화창) |

색 표(CLR1/CLB1): 0 `text_mw_important` #fa1e04, 1 `text_mw_white` #ffffff, 2 `text_mw_black` #070203, 3 `ms_grid_dark` #a0a0a0, 4 `symbol_white`, 6 `text_orange` #ff3502, 그 밖은 시험색.
속성(ATI2/ALB1/ALI2, 메시지마다 붙는 메타): VoiceKey, OffsetX/Y, ProperNoun, WindowType(WT_Empty…WT_Subtitle), Character(CH_*), Position(9방향), Emotion, WindowInfo, Motion, TextCheck*(번역 검수 상태). 메시지별 속성 값은 msbt ATR1 에 있다 — `tools/msbt.py` 는 읽지 않는다 [미확정: 값 해석].

### 5.3 스타일 (SYL3·SLB1·style.mstl) [데이터]

- SYL3 1,312개 {s32 영역 폭, s32 줄 수, s32 폰트 인덱스, s32 기본색 인덱스} + 이름(SLB1, 예 `sys_username_S`, `sys_mw_talk`, `kb_tlp_cntdwn_ovly`).
- `style.mstl`(로캘별, 매직 없음) = u32 개수(1,312, SYL3과 같음) + 0x40 B 레코드: +0x00 영역 폭, +0x04 줄 수, +0x08 **기본색 RGBA(해석된 값)**, +0x0C 폰트 인덱스(FcpxSet 순서로 보임: 2 middle·4 small·7 large_shadow·8 middle_shadow·9 ruby_shadow [추정]), +0x18/+0x1C f32 글자 배율 x·y(0.45~1.4), +0x20 f32(12.0 등, 행간 [추정]), +0x28 u32 4, +0x34 f32 60/70/100(자동 축소 하한 % [추정]). koKR과 enUS는 1,220개 레코드가 다르다 → **로캘별 글자 배율·폭이 다르다**.

## 6. 입력

### 6.1 `bex::InputModule` [판독 `analysis/decomp/ui_input.c`]

패드 객체 목록 = `InputModule+0x28` → {begin, end} 벡터. PlayerID 로 찾을 때는 패드 +0x08, PadID 로 찾을 때는 +0x0C 를 비교한다. 못 찾으면 0 벡터(`ConstantZero`).

| 함수 | 주소 | 반환 |
|---|---|---|
| `GetPlayerCountMax` | @0x710019115c | `*(+0x28)+0xA0` |
| `SetControllerPlayers(min,max)` / `SetControllerStyle(style)` | @0x7100191168 / @0x7100191180 | `nn::bezel::HidModule` 로 위임 |
| `GetPadType(PlayerID)` | @0x7100191b30 | 패드 +0x184 |
| `GetAcc` = `GetAccLeft` | @0x71001932a0 / @0x7100193230 | 패드 **+0x1C0**, 16 B 벡터(f32 x,y,z,w) |
| `GetAccRight` | @0x71001931c0 | 패드 +0x1D0 |
| `GetGyro` = `GetGyroLeft` / `GetGyroRight` | @0x71001933f0 / @0x7100193310 | +0x1E0 / +0x1F0 |
| `GetAngle*`, `GetDirection*` | @0x7100193460… | 같은 방식의 다른 오프셋 |
| `GetHold/Trigger/Release/Repeat`, `IsHoldA`…, `GetStickLeft/Right` | | 버튼·스틱(nn::bezel::GameController 경유) |

mg1801 의 휘두름 판정 `|GetAcc| > 2.9`가 "4성분 제곱합"인 이유: 16 B 벡터 반환이라 NEON이 네 칸을 다 더한다. 4번째 칸은 Vector3 의 패딩이다 [판독]. 값이 항상 0인지는 기록 쪽을 끝까지 못 봤다 [추정: 0].

### 6.2 원천: nn::hid 6축 센서 [판독 `ui_hid_callers.c`, `ui_hid_core.c`]

- `FUN_71007e6030`: 스타일 마스크로 `GetSixAxisSensorHandles` → `StartSixAxisSensor`(핸들 최대 8).
- `FUN_71007e5d10`: 매 프레임 `GetSixAxisSensorStates(states, 16, handle)` 로 **최대 16샘플**을 받아 0x610 B 링 버퍼에 복사(새 샘플 수 계수). `SixAxisSensorState` 배치: +0x00 deltaTime, +0x08 샘플 번호, **+0x10 acceleration**, +0x1C angularVelocity, +0x28 angle, +0x34 direction(3×3).
- 단위: nn::hid 정의상 가속도 = **G**, 각속도 = 회전수/초(1.0 = 360°/s) [nn::hid 공개 정의 기준, 원본 상수로는 미확인].
- `FUN_71007e5584`(샘플마다): 스타일 bit3(JoyLeft)이면 acc·angVel·angle 의 (x,y) → (−y, x), angle 회전 −0.25회 + 자세 행렬 90° 회전; bit4(JoyRight)이면 (x,y) → (y, −x), +0.25회. **단일 Joy-Con 은 가로 쥐기 기준 축으로 바뀐 값이 게임에 온다** [판독].
- 패드 객체 +0x1C0 에 어떤 샘플(마지막/평균/최대)을 넣는지는 기록 함수를 못 찾았다 [미확정]. 웹은 "그 프레임 마지막 샘플"로 둔다.

### 6.3 boot.nbinit `bezel_hid_init` [데이터]

MinPlayer 1, MaxPlayer 1, Style `GameControllerStyle_FullKey`, 컨트롤러 지원 애플릿 자동 시작, 1인일 때 휴대 모드 허용, JoyDual 을 FullKey 로 보지 않음. 게임 코드가 장면마다 `SetControllerPlayers`/`SetControllerStyle` 로 바꾼다. 디버그 키보드 패드 매핑(비활성): A=J, B=K, X=L, Y=;, L=I, R=O, ZL=U, +=Y, −=E, 십자=C/F/B/V, 왼쪽 스틱 WASD, 오른쪽 스틱 화살표 — 웹 키 배치 참고용.

### 6.4 미니게임별 조작 데이터 [데이터 + 판독]

| 데이터 | 의미 |
|---|---|
| `mgListCA/ND.json` `Gyro` | `bq::MGList` 엔트리(0x20 B) +0x1C 에 그대로 들어간다. `UseGyro` = (값 ≠ −1), `GetGyroType` = 값 [판독 @0x71001e1744/@0x71001e1778]. CA(쿠파 애슬론 계열) 목록에서는 mg1801~mg1810 리듬 10종만 1, ND 목록 0/1/2/−1. 0·1·2 의 차이 [미확정] |
| `mgInst.json` `controller[]` | 조작 설명 손 그림 28종: Hold(Horizontal/Vertical), HandAnim·StrapAnim 번호, AnimSpeed, 모델 `ObjectID_JOYCON_R`(27)/`_L`(1), 훅 `R_attach_hand` |
| `mgInst[].ControllerID_0..2` | 설명 칸 0~2 에 보일 손 그림(위 표 ID). mg1801 = 16 → "joycon縦持ち_08"(**세로 쥐기** Joy-Con R) |
| `Gyro{0,1,2}_{A,B,C}` | 설명 칸 × 조작 방식 A/B/C 별 자이로 사용 표시. mg1801 은 Gyro0_A = 1 만. A/B/C 가 어떤 컨트롤러 형태인지 [미확정] |
| `Inst_/Pause_LayerID_*`, `Input*_A..C` | 설명·일시정지 화면 레이어와 조작 문구 키(`inst_mg1801_ctrl00`) |

### 6.5 웹 설계

`core/pad.ts` 의 `PadInput.accX/Y/Z`(G)를 원본 `GetAcc` 결과로 본다. 입력원별:

| 입력원 | 가속도 만들기 | 주의 |
|---|---|---|
| WebHID Joy-Con | 6축 보고서 원시값 → G(감도 설정에 따른 LSB/G는 기기 문서값 [미확정]), 단일 Joy-Con 이면 6.2 축 변환 적용 | Chrome 계열만. 보고서 3샘플/패킷, 프레임마다 마지막 샘플 |
| DeviceMotion(휴대폰) | `accelerationIncludingGravity`(m/s²) ÷ 9.80665 | 원본 Joy-Con 값도 중력 포함으로 본다 [추정: 정지 시 크기 ≈ 1G]. iOS 권한 요청 필요. 축 방향은 기기 기준이라 다르지만 **mg1801 은 크기만 쓰므로 무관** |
| Gamepad API | 모션 값 없음 | 버튼으로 대체 |
| 키보드·버튼 | 누른 프레임에 크기 3.0 G 벡터 1프레임 주입(예 (0,0,3)) | 쿨다운·판정은 로직이 원본대로 처리. 로직 입력 층은 원본처럼 acc 를 받는다(mg1801.md 9.5 의 "swing 층"과 같은 효과) |

휘두름 근사에서 지킬 점:
- 원본 판정은 **프레임당 한 번**, 그 프레임 벡터의 크기 > `params.acc`(2.9)이다. 프레임 사이 최대값을 쓰면 원본보다 잘 잡힌다 → 마지막 샘플만 쓴다.
- 임계는 원본 값 그대로 두고, 감도 보정이 필요하면 입력 층에서 배율을 곱한다(로직 상수 불변).
- 쿨다운(1박)이 있으므로 연속 키 입력·자동 반복은 같은 결과가 된다. 키 반복 이벤트는 무시한다.

## 7. FX 트리거와 진동

### 7.1 FTRG 바이너리 [판독 `ui_ftrg_magic.c`, `ui_ftrg_res.c` + 데이터]

| 오프셋 | 형식 | 내용 |
|---|---|---|
| 0x00 | char[4] | `FTRG` (`0x47525446`) |
| 0x04 | u16, u16 | BOM `FFFE`, 0x14 |
| 0x08 | u32 | 버전 0x021A0000. 로더 `FUN_7101110450` 은 0x02180000 ≤ v ≤ 0x021A0000 만 받는다 |
| 0x0C | u32 | 파일 크기 |
| 0x10 | u32 | 섹션 수(관측 1) |
| 0x14 | {u16 id, u16, u32 off, u32 size}×n | id 0x9000 = `DATA`(`FUN_7101110400(file, 0x9000)` 으로 찾음) |

- 루트 슬롯 = DATA+8 (`FUN_710110f6cc`: `ptr = slot + *(s32*)(slot+4)`).
- **슬롯** = {u32 종류, s32 오프셋}, 대상 = (슬롯을 가진 객체의 시작) + 오프셋. 접근자 `FUN_710110f6f0`(객체+0x0C 슬롯의 배열 i번째), `f744`(+0x14), `f798`(+0x1C), `f7ec`(+0x24), `f858`(+0x2C)… 가 이 규칙이다.
- **배열** = u32 개수 + {u32 원소 타입 ID(0x91xx), s32 오프셋}×n, 원소 대상 = 엔트리 주소 + 오프셋.
- 객체 = 타입별 고정 레이아웃(원시 u32/f32 + 슬롯, 정렬 없음). 슬롯 종류: 0x1F01 문자열, 0x0100 배열, 속성 값 0x0201(정수/불)·0x0202(f32)·0x0203(문자열)·0x0204(열거 문자열)·0x0209, 0x0400·0x0403(루트 끝 3개, 별도 그래프 데이터 [미확정]).
- **속성 목록** = u32 개수 + {슬롯 이름(0x1F01), 슬롯 값}×n(16 B, 원소 기준).
- 레이아웃은 1,547개 전부에서 관측으로 정했다(`ui_ftrg.py survey`). 이름(필드 의미)은 문자열·값으로 추정했다.

### 7.2 루트(0x9100) 스키마 [데이터, 1,547개 모두 같은 레이아웃]

| 오프셋 | 내용 |
|---|---|
| +0x00 | 이름(파일 이름과 같음) |
| +0x08 | 0x9102 배열: 소리 변형 묶음 {이름, [0x9103{변형 이름}]} (예 `se_honeycomb_lrg` = big_a/b/c) |
| +0x10 | **SE 트리거**(0x9101) 배열 |
| +0x18 | **FX(파티클) 트리거** 배열 |
| +0x20 | **VB(진동) 트리거** 배열 |
| +0x28 | 0x9104 배열: 파라미터 {이름, u32 형식, 기본값} (예 `se_dice_speed`) |
| +0x30, +0x38 | 문자열 |
| +0x40 | **애니 프레임 이벤트**(0x9106): {모션 이름, fskb 경로, 문자열, f32, [0x9107{트리거 키, u32 프레임, u32×3, u32}], …, 속성{IsAvailable, AnimationLength}} |
| +0x48 | 0x9108 배열: 트리거 범주(`SoundEventTrigger`, `ProgramEventTrigger`, `SoundSystemTrigger`…) |
| +0x50 | u32 해시 |
| +0x54 | 모델 경로(대상 fmdb, 예 `chara/pc/pc01_mario/model/pc01_mario.fmdb`) |
| +0x7C | 0x9114 배열: 파라미터 → 사운드 파라미터 곡선({이름, 파라미터, …, [0x9115 곡선]}) |
| +0x84/+0x8C/+0x94 | 종류 0x0400/0x0403 블록(조건·상태 그래프로 보임 [미확정]) |

### 7.3 트리거(0x9101) [데이터]

| 종류 | 레이아웃 |
|---|---|
| SE (+0x00 = 0) | +0x14 **키**, +0x1C/+0x24/+0x2C 문자열, +0x34 **훅**(본/로케이터, 예 `NDcha_pos`, `attach_fx00`), +0x3C 경로 접두, +0x44 속성(SoundVolume, SoundPan, SoundLpf, SoundBiquadFilter*, SoundAux*, SoundDucking*, PlayOffsetSec, Sound3DPinning, ParentGroupPath…), +0x50 자원[0x9105{`<폴더>/<사운드 라벨>`, f32 50.0}] |
| FX (+0x00 = 1) | SE와 같은 앞부분 + 자원 `.eset` 이름 + f32 배율류 7개(1.0) — 파티클 세부는 [08_effects.md](08_effects.md) |
| VB (+0x00 = 2) | +0x10~+0x2C f32 쌍 4개(1.0 등), +0x30 **키**, +0x50 속성(ParentGroupPath, VibrationHookFlag, PlayOffsetSec), +0x5C 자원[0x9105{`<폴더>/<bnvib 이름>`, f32 50.0}] |

자원 f32 50.0 은 전 파일 공통값이다(가중치/확률 [추정]). 자원 경로의 마지막 성분이 사운드 라벨·bnvib 이름이다(`…/SQ_SE_MG1801_SWING`, `…/bv_vib_mg1801_just` → `vib/bnvib/bv_vib_mg1801_just.bnvib`) [데이터].

### 7.4 mg1801 연결 [데이터 `extracted/converted/ui/ftrg/mg1801_triggers.json`]

| 키 | 종류 | 파일 | 자원 | 발생 |
|---|---|---|---|---|
| `VB_MG1801_JUST` | VB | `vb_pc_base.ftrg` | `bv_vib_mg1801_just`(38샘플, 0.19 s) | `Player::UpdateAttack` JUST, **사람만**(`!IsPlayerCom`) [판독 mg1801 @0x710000cf1c 부근] |
| `VB_MG1801_SUCCESS` | VB | `vb_pc_base.ftrg` | `bv_vib_mg1801_success`(29샘플, 0.145 s) | FAST/SLOW(COM 여부 검사 없음) [판독] |
| `RC_RHY_KNIFE_SWING00` | SE | `rc_pc_base`, 캐릭터별 `rc_pcNN_*` 21개 | `SQ_SE_MG1801_SWING`, 훅 `NDcha_pos` | 모션 `rhy_knife_swing00`(길이 20) **프레임 2** 이벤트 |
| `VO_RHY_KNIFE_SWING00` | SE | `vo_pc_base`, 캐릭터별 `vo_pcNN_*` | `SQ_VOI_PCNN_JUMP`(캐릭터별, pc62 는 `ACTION_HIGH`) | 같은 모션 **프레임 3**(pc62 는 2) |
| `SE_FS_LAND_SML` | SE | 일부 캐릭터 | 발소리 | 같은 모션 프레임 15 (2명) |

진동 설정(`vibration.msgpack` vib_define): `bv_vib_mg1801_just`·`_success` 모두 Gain_Master 1.3, priority 72, vib_slot 0, 3D 아님. mg1801 의 JUST 소리 `SQ_SE_MG1801_JUST`·`SUCCESS` 는 FX 트리거가 아니라 코드가 직접 `Play3D` 한다(mg1801.md 6.5). 보이스는 세팅 프리셋 `mg1800_cmn` 이 MUTE로 바꾼다([04_sound.md](04_sound.md)).

### 7.5 `ComFxTrigger::Play` 흐름 [판독]

1. 캐릭터 엔티티에 `actor::Util::AddFxTrigger` @0x71000376c0 가 `<폴더>/ftrg/<이름>.ftrg` 경로를 만들어 `bex::ComFxTrigger::AttachFxTrigger` 로 붙인다(공용 base + 캐릭터별).
2. 게임 코드(mg1801 `UpdateAttack`)는 플레이어 엔티티의 컴포넌트 목록(엔티티 +0x38..+0x40, 0x20 B 단위)에서 `ComFxTrigger` 타입을 찾고 `bex::ComFxTrigger::Play(키)`.
3. `bex::ComFxTrigger::Play` @0x710010d224 → 핸들 검증 → `nn::bezel::ComFxTrigger::Play(impl, key)` @0x71005f0cec. 이후 키 검색·재생은 엔진 내부(미판독). 진동 대상 플레이어는 `SetVibrationPlayerId`(impl +0x7638).
4. 애니 프레임 이벤트는 모션 재생 중 해당 프레임에 엔진이 같은 키를 발생시킨다 [추정: 7.2 +0x40 데이터].
- 용량(boot.nbinit `bezel_fx_trigger_init`): 사운드 512, 파티클 256, 진동 64, 애니 이벤트 384/플레이어 192/트리거 1,024, 플레이어 256.

### 7.6 BNVIB [데이터 `tools/ui_bnvib.py`, 463개]

u32 메타 크기(4 | 12 | 16), u16 형식 3, u16 **200 Hz**, (메타 12/16: u32 loopStart, loopEnd, [loopInterval]), u32 데이터 크기, 샘플 4 B. 바이트 0·2 = 진폭(감쇠하는 쪽), 1·3 = 주파수 코드. `nn::hid::VibrationValue` 순서 {ampLow, freqLow, ampHigh, freqHigh} 로 본다 [추정]. `vibration.msgpack` 의 `vib_setting`(값 지정형)은 저역 160 Hz·고역 320 Hz 를 쓴다. 주파수 코드 → Hz 식 [미확정]. 진동 시퀀스(`vib/seq/*.msgpack`)는 {play 라벨·gain, wait 초, loop_start/end} 명령 목록.

### 7.7 웹 설계

- 로직은 지금처럼 원본 키(`VB_MG1801_JUST`)를 `events` 로 낸다. 화면 층이 **키 → 동작 표**(이 문서 도구로 생성)를 보고 소리·파티클·진동을 낸다. 애니 프레임 이벤트는 모션 재생기가 프레임 통과 시 같은 키를 낸다.
- 진동: Gamepad `vibrationActuator.playEffect('dual-rumble', {duration, strongMagnitude, weakMagnitude})` — strong ← ampLow, weak ← ampHigh, Gain_Master 곱 후 1로 자른다. 브라우저가 연속 갱신을 지원하지 않으므로 50 ms 구간 포락선(`webDualRumble50ms`)을 순서대로 다시 부르거나 첫 구간 최대값·전체 길이로 한 번 부른다. 주파수는 표현할 수 없다.
- 키가 표에 없으면 원본처럼 조용히 무시한다(엔진 설정 `IsSuppressWarningTriggerKeyNotFound: false` 는 경고만).

## 8. HUD 포팅 방침

판단: **최소 레이아웃 재생기**(bflyt 페인 트리 + bflan 트랙 + FFNT 글자)를 만들고, 공용 텔롭·상태 UI 는 원본 레이아웃 데이터로 돌린다. 근거:
- 포맷이 공개 BFLYT 와 같고 전 파일이 검증 오류 없이 읽힌다(3.2).
- 텔롭·점수판의 움직임은 bflan 키(팝 1.45→1.0, 알파·상승·빛남 타이밍)가 전부다. 손으로 옮기면 이 값을 다시 적어야 하고 틀리기 쉽다. 렌더 시험에서 파서 출력만으로 재현됐다(3.8).
- 필요한 재생 기능이 적다: 페인 5종(pan/pic/txt/wnd/prt), 재질은 흑/백 보간 + 정점색 + 텍스처 1장, 트랙 5종(FLPA·FLVC·FLVI·FLMC·FLTP).

| 대상 | 판단 기준 | 방식 |
|---|---|---|
| 텔롭(sys_tlp_*, mg1800_tlp_*), 와이프·연습 화면(mg18xx_wip_*), 점수판·상태(sys_mgstat_*) | 텍스처 + 텍스트 + 키 애니만 | **레이아웃 재생기** |
| 텍스트 내용 | 페인 문자열이 비어 있고 코드가 메시지 키로 채움 | 재생기 + 메시지 키 표(02_rhythm/게임 문서에서 키를 받는다) |
| 얼굴·캐릭터 아이콘·캡처 화면 | 동적 텍스처 공유·캡처 텍스처(boot.nbinit) | 재생기에 텍스처 주입 API, 그림은 손으로 준비 |
| 재질 bit19(상세 컴바이너)·`.bgsh` 아카이브 셰이더를 쓰는 레이아웃 | 원본 셰이더 없이는 색이 다름 | 손 재현 또는 근사 표시, 문서 "근사" 절에 기록 |
| 메시지 창(대화·선택지) | 글자 출력 속도 태그·자동 축소·mstl 스타일 | 재생기 + 별도 텍스트 레이아웃 구현 |
| 디버그·개발 표시 | — | 기존 `view/hud.ts` 그대로 |

구현 순서(권장): ① `ui_lyt.py dump` JSON + `ui_render.py textures` PNG + `ui_font.py export` 를 `assets/` 로 옮기는 변환 스크립트 → ② 캔버스 2D 재생기(3.3 변환식, 3.7 곡선) → ③ `mg1800_tlp_just` 를 `ui_render.py` 출력 PNG 와 픽셀 비교(같은 규칙의 두 구현 대조, 원본 대조 아님) → ④ cnt1 기능 이름으로 페인 찾기.

## 9. 검증 — 실제로 돌린 것

| 종류 | 내용 | 결과 |
|---|---|---|
| 파서 | `ui_lyt.py survey` 전 .lyt 129개 | bflyt 1,262·bflan 3,587, 섹션 크기·재질 길이·파일 끝 검증 오류 0 |
| 렌더 | `ui_render.py` mg1801 와이프 2종, mg1800 JUST 텔롭 4프레임, 리듬 점수판(부품 재귀) | PNG 생성, 화면 구성 타당(원본 화면 대조 없음) |
| 폰트 | `ui_font.py` FFNT 88개 파싱, ko/en 문자열 렌더, BFOTF 복호화 → PIL 로드·렌더 | 정상 |
| 메시지 | `ui_msbp.py` msbp 12섹션, mstl 1,312 = SYL3 1,312, koKR 태그 사용 3,000여 건 파라미터 해석 | `bq_msbp.json` |
| FTRG | `ui_ftrg.py survey` 1,547개 | 실패 0, 루트 레이아웃 1종, 0x9105·0x9106 레이아웃 1종 |
| BNVIB | `ui_bnvib.py` 463개 | 크기 검증 통과 |
| 판독 | Ghidra: InputModule 전부, nn::hid 호출자 9개, FTRG 매직 사용 함수 29개, ComFxTrigger | `analysis/decomp/ui_*.c` |
| 원본 실행 | 없음 | — |

## 10. 미확정 사항과 필요한 근거

| 항목 | 영향 | 필요한 근거 |
|---|---|---|
| 패드 +0x1C0 에 넣는 샘플(마지막/최대/평균), w 성분 값 | 휘두름 판정 민감도 | 패드 객체 갱신 함수 판독(+0x1C0 기록처) |
| `Gyro` 값 0/1/2, mgInst A/B/C 조작 방식 | 조작 안내·입력 모드 | `bq::MGList::GetGyroType` 호출자 판독 |
| `ctl1` 의미, 재질 bit19 블록 필드, `FLCT`·`FLIM`, `ali1`·`scr1` 추가 바이트 | 일부 레이아웃 표시 | ui2d 런타임(nn::ui2d) 판독 또는 다른 v9 게임 자료 |
| 원점·회전·알파·컴바이너 규칙의 원본 일치 | HUD 위치·색 | 원본 화면 캡처와 렌더 비교 |
| FFNT 크기 배율(fontSize/높이), fcpx 대체 범위 표 | 글자 크기·대체 | ui2d 텍스트 렌더 판독, FCPX 구조 |
| msbt ATR1 속성 값, Font 태그 u16 의미 | 대화창 | `tools/msbt.py` 확장(수정 금지라 별도 도구), 대화창 코드 판독 |
| mstl 필드 +0x0C·+0x20·+0x34 의미 | 로캘별 글자 배율 | 메시지 스타일 적용 코드 판독 |
| FTRG 0x0400/0x0403 블록, 0x9101 앞부분 u32/f32 의미, 자원 f32 50.0 | 트리거 세부 | `nn::bezel::ComFxTrigger` 내부(@0x71005f0cec 이후) 판독 |
| bnvib 주파수 코드 → Hz | 진동 음색(웹에서 표현 불가라 영향 작음) | nn::hid 진동 파일 파서 판독 |
