# 글꼴 공용 에셋 — `web/assets/font/`

2026-10-08. 상태: **구현 완료**(설계를 먼저 적고 구현). 수치 중 [추정]은 구현 전 계산, [실행]은 구현 뒤 도구로 잰 값이다(§9).
작성 형식·확정 수준 표기는 [05_ui_input.md](05_ui_input.md), [chara_assets.md](chara_assets.md)와 같다.

사용자 요구: "글꼴도 공용으로 쓸 수 있게 해 줘." 캐릭터·NPC(`assets/chara/`)와 같은 원칙이다. **한 곳에서 관리하고, 한 곳만 고치면 모든 화면에 반영**된다.

---

## 1. 결론

| 결론 | 근거 |
|---|---|
| 비트맵 글꼴(bqfont_*)은 **`web/assets/font/<원본 FFNT 이름>/` 한 곳**에 둔다. 글꼴마다 **원본 시트 그대로**(`0.png`…, 1024×1024 등 원본 크기·셀 배치 그대로)와 글리프 표 하나(`glyphs.json` = FINF·TGLP·CWDH·CMAP)를 둔다. 복합 글꼴(fcpx) 구성은 `font/fcpx.json` 하나 | 원본은 FFNT 파일 하나가 시트 여러 장을 가진다(05 §4.2). 화면별 부분집합 아틀라스는 같은 글자를 여러 벌 들고 있었다 §2 |
| 화면 명세의 `fonts` 는 **글꼴 이름 → `{dir, chars}`** 만 갖는다. `dir` = 공용 글꼴 폴더(명세 기준 상대 `../font/`), `chars` = 그 화면이 처음에 미리 받을 글자. 글리프 메트릭은 실행 때 공용 표에서 채운다 | 원본 글꼴의 **모든 글자**가 표에 있으므로 문자열이 늘어도 변환기를 다시 돌리지 않아도 된다. 표에 없는 글자는 `chars` 와 무관하게 실행 때 해당 시트를 받는다(§5.4) |
| 받기·GPU 올리기는 **필요한 시트만**, 시트 하나 = 로더 관리자 키 하나(`font/<글꼴>/<n>.png`, 종류 uiimage). 같은 시트의 THREE 텍스처는 앱에 하나(렌더러 문맥마다 한 번 업로드) | 사용자 지시(조정자 전달) §5 |
| 커버리지 시트는 **회색조 PNG(1채널)**, GPU 에는 **R8**(`THREE.RedFormat`)로 올린다. 셰이더는 R 을 커버리지로 읽는다(전엔 RGBA 의 A). 컬러 아이콘 시트(`*_extension`, 원본 BC7)만 RGBA PNG·RGBA8 | 원본 시트는 BC4(R 하나) §3. 지금 RGBA8 은 같은 값을 4바이트에 담았다 |
| 압축 빌드는 지금 규칙 그대로 **keep(무손실 PNG)**(`assets_tex.ts` classify 의 `font/` 규칙이 `font/<글꼴>/<n>.png` 에도 맞는다) | 글자 번짐 방지(assets_pipeline.md §3.1) |
| 원본 시트를 쓰면 **그리기 결과가 지금과 같다**: 셀 사이 1px 테두리가 전부 0 이라 선형 표본의 이웃 텍셀이 지금 아틀라스(빈칸 0)와 같고, 메트릭(크기·오프셋·전진폭·기준선)은 같은 CWDH·TGLP 값이다 §4 | [실행] 93장 테두리 열·행 0 확인, 메트릭 시험 §9 |

---

## 2. 지금(전) 상태 [실행]

같은 원본 글꼴을 화면마다 **그 화면이 쓰는 글자만 뽑아** 아틀라스를 따로 만들었다(`charsel_web_assets.build_atlas` 를 모든 2D 변환기가 불러 씀, mg1801 HUD 는 `mg1801_web_ui.build_atlas` 사본).

| 폴더 | 아틀라스 | PNG MB |
|---|---|---|
| `charselect/font` | 4 | 0.09 |
| `modeselect/font` | 3 | 0.11 |
| `mgmcommon/font` | 6 | 2.97 |
| `online/font` | 5 | 2.57 |
| `partyrule/font` | 6 | 7.12 |
| `setplayer/font` | 5 | 1.38 |
| `plaza/ui/font`(card_ 포함) | 10 | 6.19 |
| `mg1801/ui/font` | 6 | 0.17 |
| 합 | 45 | 20.6 MB (RGBA8 629.8 MiB) |

- `partyrule/font/bqfont_large(_shadow).png`(4.4 MB)는 `partyrule.json` 이 가리키지 않는 남은 파일이었다(명세 fonts 에 large 없음).

- 아틀라스 칸 = 패밀리 안 가장 큰 셀(extension 190×187 등) + 2px, 16열 고정이라 글자가 적어도 크다(partyrule `bqfont_large_shadow` 3072×6993).
- PNG 는 RGBA(RGB 흰색 + A 커버리지), GPU 는 RGBA8.

---

## 3. 원본 구조 [데이터]

`font~font_kr.nx.bea/Parts.lyt/Font_kr/` — FFNT 24개, 시트 합 93장(05 §4.2 표). 형식: 커버리지 시트 = BC4(`TGLP.format` 12), `*_extension` = BC7 컬러(19). 복합 글꼴 `FcpxSet.nbfcpxsetlyt` 안 `fcpx/*.bfcpx` 가 대체 순서를 준다:

| 복합 글꼴(fcpx) | 구성(대체 순서) |
|---|---|
| bqfont_small / _middle / _large | `<이름>_usen`, `<이름>`, `<이름>_extension` |
| 그 `_shadow` | `<이름>_shadow_usen`, `<이름>_shadow`, `<이름>_extension_shadow` |
| bqfont_emote(_shadow), bqfont_ruby(_shadow) | 자기 하나 |
| bqfont_telop, nintendo_udsg-r_std_003 | FFNT 없음(OTF·시스템 글꼴) → 이 문서 범위 밖 |

글자 → 글리프: 구성 순서대로 CMAP 에 있는 첫 글꼴(지금 변환기와 같은 규칙 [추정: 복합 글꼴 대체 순서]). 패밀리 높이·폭·ascent·줄 간격 = 본 글꼴(구성 둘째, 하나면 그것)의 FINF.

**그림자**: 원본은 그림자 모양을 별도 글꼴(`*_shadow`, 셀이 더 큼)로 미리 그려 두고, 레이아웃이 그림자 텍스트 페인을 본 페인 아래에 하나 더 둔다(05 §4.1). 웹도 그대로 — 그림자 패밀리는 그냥 다른 글꼴 하나다. 외곽선·두께를 계산으로 만들지 않는다.

---

## 4. 원본 시트 vs 합집합 새 아틀라스

| 기준 | 원본 시트 그대로(채택) | 모든 화면 글자의 합집합으로 새 아틀라스 |
|---|---|---|
| 원본 동일성 | 시트·셀 위치·메트릭이 원본 그대로. 다시 만든 픽셀 0 | 셀 픽셀은 같지만 배치를 새로 만듦 |
| 문자열이 늘 때 | 변환 다시 안 함(모든 글자가 이미 있음) | 변환기 다시 돌려야 함(빠진 글자는 안 보임) |
| 받는 양(앱 전체) | 쓰는 시트 78/93장, 8.44 MB [실행 §9] | 쓰는 글자 면적 15.5 Mpx, 대략 2 MB 안팎 [추정] |
| GPU(앱 전체, R8) | 81.5 MiB [실행 §9] | 15.5 MiB 남짓 [추정] |
| 전(화면별 RGBA8 부분집합, 명세가 가리키던 것) | 13.2 MB · 396.8 MiB | |

한국어 음절은 코드 순으로 시트 전체에 퍼져 있어(큰 글꼴 109자가 17장 중 17장에 걸침) 원본 시트를 쓰면 받는 장수가 많다. 앱 전체로는 받는 양 −36%, GPU 약 1/5 이지만 **글자가 적은 화면(캐릭터 선택·모드 선택·mg1801)은 처음 받는 양·GPU 가 오히려 는다**(§9.2). 합집합 아틀라스가 GPU·받는 양은 더 작지만 "문자열이 늘어도 다시 변환하지 않음"과 원본 구조를 잃는다. **조정자 지시(사용자 답) = 원본 시트**를 따른다. 합집합 안은 §10 사용자 확인 필요에 숫자와 함께 남긴다.

---

## 5. 설계 [설계]

### 5.1 폴더

```
web/assets/font/
  fcpx.json                       복합 글꼴 → {fonts: [FFNT 이름…(대체 순서)], main}
  bqfont_middle/
    glyphs.json                   이 FFNT 의 글리프 표
    0.png 1.png 2.png 3.png       원본 시트(상하 반전 푼 것), 회색조 = 커버리지
  bqfont_middle_extension/
    glyphs.json
    0.png                         컬러(RGBA) 시트
  …                               FFNT 24개 전부
```

변환기: `web/tools/analysis/font_web_assets.py`(원본 FFNT → 위 폴더, 화면과 무관하게 한 번). 원본·`extracted` 는 읽기만 한다.

### 5.2 `glyphs.json`

| 키 | 뜻 |
|---|---|
| `font`, `source` | FFNT 이름, 원본 경로 |
| `height`, `width`, `ascent`, `lineFeed`, `alterCharIndex`, `defaultWidth` | FINF |
| `cellW`, `cellH`, `baseline`, `cellsPerRow`, `cellsPerCol`, `sheetW`, `sheetH` | TGLP |
| `sheets` | 시트 파일 이름(`0.png`…), 순서 = 원본 시트 번호 |
| `color` | 시트가 RGBA 컬러(BC7)인가 |
| `extension` | `*_extension(_shadow)` — 지금 명세의 글리프 `color` 표시(컬러 아이콘 자리)와 같은 뜻 |
| `cmap` | 글자 → 글리프 번호 |
| `widths` | 글리프 번호 순 `[left, glyphWidth, charWidth]`(CWDH, 없으면 `null` → defaultWidth) |

글리프 위치 = 원본 규칙: 시트 = 번호 / (행당×열당), 셀 (cx, cy) → `(cx·(cellW+1)+1, cy·(cellH+1)+1)`(05 §4.2).

### 5.3 명세 `fonts`

```json
"fonts": { "bqfont_middle": { "dir": "../font/", "chars": "가나다…" } }
```

- `dir` 은 명세 기준 폴더에서 본 `assets/font/` (2D 화면·부품 `../font/`, mg1801 `ui/ui.json` 은 `../../font/`).
- `chars` = 변환기가 지금까지 아틀라스에 넣던 글자 그대로(그 글꼴에 있는 것만). **미리 받을 시트를 고르는 데만** 쓴다.
- mgmcommon `mergeSpec`: 같은 글꼴이면 `chars` 를 합친다(전엔 부품 아틀라스가 공용 아틀라스를 덮었다 — 이제 같은 공용 글꼴이라 덮을 것이 없다).

### 5.4 실행 흐름

1. `Render2D.load`(charselect·modeselect·mgmcommon 계열·광장 UI 공용)와 mg1801 `ui.ts` 가 `resolveFonts` 를 부른다: `fcpx.json`·필요한 `glyphs.json` 을 읽어(관리자 json 키, 앱에서 한 번) 패밀리별 FontSpec(`height·width·ascent·glyphs{글자: x,y,w,h,left,adv,baseline,color,sheet,u0..v1}`)을 만들어 **명세 객체 자리에 채운다**. 그 뒤 측정 코드(`f.glyphs[ch].adv` 등)는 그대로다.
2. `chars` 의 글자가 든 시트만 미리 받는다(P0). 받은 그림은 `fontSheet` 저장소가 키별로 하나만 가진다.
3. 그리기: 글리프마다 자기 시트 텍스처로 사각형 하나(지금도 글리프마다 사각형 하나). 시트가 아직 없으면 그 글자만 건너뛰고(펜은 전진) 받기를 시작한다 — `chars` 밖 글자(동적 문자열)도 변환 없이 몇 프레임 뒤 나타난다.
4. 원본 글꼴에 없는 글자 = 지금과 같다(그리지 않고 패밀리 폭만큼 전진). 시스템 글꼴 대체(05 §4.4)는 명세에 없는 패밀리(계정 이름 등)에만 — 지금과 같다.
5. 흐름 미리 받기(`flowCatalog.ts` screen2d): 명세·부품의 `fonts` → `font/fcpx.json`·`glyphs.json`(json) + 그 화면 `chars` 시트(uiimage). 키는 Render2D 가 읽는 것과 같은 `font/<글꼴>/<n>.png`.

### 5.5 GPU 형식

- 커버리지 시트: PNG 회색조 → `THREE.Texture(img)` + `format = RedFormat`(WebGL2 `texStorage2D(R8)` + `texSubImage2D(RED)`), 1 B/px. 셰이더: `red0 == 1` 이면 `t = vec4(1, 1, 1, t.r)` — 전 RGBA 아틀라스 값 `(255,255,255,a)` 와 같은 벡터라 이후 계산(`mix(black, white, t.a)`)이 같다.
- 컬러 시트(extension): RGBA PNG·RGBA8, 전과 같음.
- 밉맵 없음·선형 필터·clamp — 전과 같음.
- **검토만(문서)**: 데스크톱에서 원본 BC4 블록을 그대로 올리기(`EXT_texture_compression_rgtc`, 0.5 B/px = R8 의 절반). 원본 GPU 와 같은 표본값이지만 모바일 대부분이 지원하지 않아 R8 대체가 꼭 필요하고, 받는 양은 BC4 원자료(시트당 512 KiB)가 PNG(시트당 약 0.1 MB)보다 크다. KTX2(BC4 + zstd) 로 받으면 비슷해질 수 있다. 기본은 R8.

### 5.6 원본 동일성 근거

지금 아틀라스: 셀을 그대로 붙이고 사이를 투명(0)으로 둠. 그리기 사각형 = 글리프 `x..x+w`, `y..y+cellH`, 선형 표본은 `[x−1, x+w] × [y−1, y+cellH]` 텍셀만 읽는다. 원본 시트에서 이 범위는 같은 셀 픽셀 + 테두리(1px)이고 **테두리는 93장 전부 0**([실행] §9) → 같은 값. 메트릭은 같은 CWDH·TGLP 를 쓴다. 그래서 글자 모양·자간·줄바꿈·그림자 위치가 바뀌지 않는다.

---

## 6. 읽는 곳

| 파일 | 바뀐 것 |
|---|---|
| `script/app/scene/menu/charselect/fontTable.ts`(신규, three 없음) | 표 형식·패밀리 해석·글자 → 시트 계산(앱·flowCatalog·시험 공용) |
| `script/app/scene/menu/charselect/fontSheet.ts`(신규) | 시트 그림·텍스처 저장소(앱 하나), `resolveFonts`(명세 자리 채우기) |
| `script/app/scene/menu/charselect/render2d.ts` | load = resolveFonts + 미리 받기, text = 글리프별 시트 텍스처, 셰이더 `red0` |
| `script/app/scene/menu/charselect/types.ts` | FontSpec/GlyphSpec(시트·uv) |
| `script/app/common/ui/view.ts` | mergeSpec `fonts` chars 합치기 |
| `script/view/lyt.ts`, `script/games/mg1801/view/ui.ts` | mg1801 HUD 같은 방식 |
| `script/view/flowCatalog.ts` | 글꼴 시트 키 |

---

## 7. 변환기

| 변환기 | 바뀐 것 |
|---|---|
| `font_web_assets.py`(신규) | 원본 FFNT 24개 → `assets/font/` 전부 + `font_ref(패밀리, 글자, dir)` |
| `charsel_web_assets.py`, `modesel_web_assets.py`, `mgmcommon_web_assets.py`, `online_web_assets.py`, `partyrule_web_assets.py`, `setplayer_web_assets.py`, `plaza_ui_assets.py`, `plaza_card_assets.py`, `mg1801_web_ui.py` | 아틀라스를 만들던 자리에서 `font_ref` 로 `{dir, chars}` 만 씀. 글자 고르는 규칙(라벨 목록 등)은 그대로 |

재현: `python web/tools/analysis/font_web_assets.py`(공용 글꼴) → 각 화면 변환기(명세). 화면 변환기는 공용 글꼴을 다시 만들지 않는다(원본에만 의존).

옛 화면별 `font/` 파일은 지우지 않고 scratchpad `old_fonts/` 로 옮겼다(§9).

---

## 8. 압축 빌드·미리 받기

- `tools/assets_tex.ts` classify: `(^|/)font/` → keep. `font/bqfont_middle/0.png` 도 맞으므로 **규칙 변경 없음**. keep PNG 는 회색조 그대로 복사된다.
- `tools/build_assets.ts`: 글꼴 전용 규칙 없음(확인). 변경 없음.
- `script/view/flowCatalog.ts`: §5.4-5.

---

## 9. 결과 [실행]

### 9.1 변환

- `font_web_assets.py`: FFNT 24개 → 시트 93장(회색조 89·RGBA 4) + 표 24 + `fcpx.json`, 9.51 MB, 12.8 s.
- `font_web_assets.py check`: 시트 93장의 셀 사이 테두리 열·행 **0 이 아닌 줄 0**(§5.6 근거).
- 재현: 화면 변환기 9개(charsel `build_ui`, modesel, mgmcommon, online, partyrule, setplayer, plaza_ui, plaza_card, mg1801_web_ui)를 출력 폴더만 scratchpad 로 바꿔 다시 돌린 결과의 `fonts` = 옮긴 명세의 `fonts` (9개 모두 같음). 기존 명세는 옛 아틀라스 글리프 키를 그대로 `chars` 로 옮겼다.

### 9.2 받는 양·GPU 전/후 (화면 = 그 화면 명세 + 부품 합친 것, 후 = `chars` 시트 미리 받기)

| 화면 | 전 받는 양 MB | 전 GPU MiB(RGBA8) | 후 시트 | 후 받는 양 MB | 후 GPU MiB(R8, 컬러 RGBA8) |
|---|---|---|---|---|---|
| 캐릭터 선택 | 0.09 | 6.4 | 13 | 1.10 | 16.5 |
| 모드 선택 | 0.11 | 5.7 | 13 | 1.07 | 14.0 |
| 인원 설정(setplayer) | 2.41 | 64.6 | 74 | 8.18 | 74.5 |
| 온라인 | 3.15 | 89.4 | 74 | 8.18 | 74.5 |
| 파티 규칙 | 3.39 | 97.0 | 74 | 8.18 | 74.5 |
| 광장 UI | 3.93 | 122.8 | 77 | 8.39 | 77.5 |
| 항구·미니게임 목록(mgmet·mgm01) | 2.97 | 85.6 | 74 | 8.18 | 74.5 |
| mg1801 HUD | 0.17 | 8.1 | 22 | 2.10 | 21.5 |
| **앱 전체**(위 화면 모두 거침, 같은 것 한 번) | 13.23 | 396.8 | 78 | 8.44 | 81.5 |

- 전 GPU 는 화면 렌더러마다 따로 올렸고 화면을 닫으면 풀었다. 후는 시트 텍스처가 앱에 하나씩 남는다(닫아도 유지) → 화면을 오가도 다시 받거나 올리지 않는다. 같은 시트를 R8 대신 RGBA8 로 올렸다면 앱 전체 302 MiB.
- 첫 화면이 mgmcommon 계열이면 큰 그림자 글꼴(`bqfont_large_shadow`, 시트 32장 4.3 MB)이 대부분이다 — 큰 글꼴 글자 95자가 29장에 퍼짐.
- 압축 빌드(`build_assets`): `font` 9.7 MB keep 그대로(표의 GPU 추정 371 MiB 는 도구가 PNG 를 RGBA8 로 셈 — 실제는 R8).

### 9.3 같은지 [실행]

| 시험 | 결과 |
|---|---|
| `tools/test_fonts.ts <옛 명세 폴더>` — 명세 9개 `{dir, chars}`·chars 글자 전부 있음·표/시트 파일 있음·옛 아틀라스 글리프 14,373개의 w·h·left·adv·baseline·color + 패밀리 height·width·ascent | 14,554/14,554 |
| 화면 문구(texts) 글자 중 그 화면 글꼴 어디에도 없는 글자 | 9개 명세 모두 0 |
| 표본 픽셀(scratchpad `font/pixels.py`): 옛 아틀라스 글리프 사각형 + 1px 이웃 ↔ 원본 시트 같은 자리(커버리지 = 옛 A ↔ 새 R, 컬러 = RGBA) | 14,373개 중 다름 0 |
| 실제 페이지 콘솔(개발 서버, `?plaza=1` 시작 클릭 / `?plaza=1&skipsetup=1`, 40 s, 촬영 없음) | 4xx·요청 실패 0, 콘솔 오류 0, 글꼴 응답 99 / 93 |

화면 시험: check_charselect 2412/2412, check_mgmcommon 12954/12954, check_modeselect 1068/1068, test_setplayer 116/116, test_online 154/154, test_partyrule 106/106, test_mgm01 277/277, test_mgmet 218/218, test_mgmscreens 38/38, test_plaza_ui 129/129, test_prefetch 115/115, test_mgmcommon 119/119, tsc 오류 0, `npm run build` 통과.

시험 수정(형식이 바뀐 곳만): 디스크 명세를 읽는 시험은 `tools/fontSpecNode.ts` `resolveFontsFromDisk` 로 앱과 같은 해석을 한 뒤 검사한다. `f.image` 파일 확인 → `sheetFilesMissing`(글리프가 가리키는 시트 파일), test_partyrule "화면 글꼴 덮어씀" → "화면 글꼴 = 공용 글꼴(화면 글자 전부 있음)"(덮어쓸 화면별 아틀라스가 없어짐).

### 9.4 옮긴 파일

옛 화면별 글꼴 PNG 45개(20.6 MB)는 지우지 않고 scratchpad `old_fonts/<원래 경로>` 로 옮겼다. 빈 `font/` 폴더는 남겼다. `mg1801/ui/font/bqfont_telop.otf`(텔롭 OTF 서브셋)는 비트맵 글꼴이 아니라 그대로 둔다.

---

## 10. 사용자 확인 필요

1. **글자가 적은 화면의 첫 받는 양이 는다**(§9.2: 캐릭터 선택 0.09 → 1.10 MB, mgmcommon 계열 2.4~3.9 → 8.2 MB). 원본 시트는 한국어 음절이 코드 순으로 퍼져 화면이 몇 자만 써도 여러 장을 받는다. 앱 전체로는 줄고(13.2 → 8.4 MB, 397 → 82 MiB) 두 번째 화면부터는 캐시를 쓴다. 더 줄이려면 "원본 시트 + 쓰는 글자만 모은 공용 묶음 시트(앱 전체 15.5 Mpx ≈ R8 16 MiB)" 혼합안이 있다 — 묶음에 없는 글자만 원본 시트로 받는다. 조정자 지시대로 원본 시트만으로 두었다.
2. **chars 밖 글자**(동적 문자열)는 그 글자의 시트를 그때 받아 몇 프레임 늦게 나타난다. 전에는 아틀라스에 없으면 아예 안 그렸다(전진만) — 이제 원본 글꼴에 있는 글자는 그려진다.
3. **시트 텍스처는 앱 수명 동안 유지**(화면을 닫아도 GPU 에 남음, 최대 = 쓴 시트 합 81.5 MiB). 화면마다 풀고 다시 올리는 쪽이 낫다면 참조 수로 풀 수 있다.
4. **RGTC(BC4) 직접 업로드**는 문서 검토만(§5.5). 기본 R8.
5. 복합 글꼴 대체 순서(usen → 본 → extension)는 지금 변환기와 같은 [추정]이다(fcpx 범위 표 미판독, 05 §4.1).
