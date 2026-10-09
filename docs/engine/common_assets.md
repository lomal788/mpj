# 시스템 효과음·공용 UI 그림 공용 에셋 — `web/assets/common/`

2026-10-08. 상태: **구현·변환·압축 빌드·노드 대조 완료**(설계 §1~8 은 구현 전에 적었고, 결과는 §9). 2단계(범주로 넓힘, 사용자 결정)는 §11. 작성 형식·확정 수준 표기는 [chara_assets.md](chara_assets.md)·[font_assets.md](font_assets.md)와 같다.
여기서 [실행]은 "이 문서의 도구로 돌려 수치를 얻음", [설계]는 원본과 무관한 웹 쪽 결정, **사용자 확인 필요**는 기본값을 정해 둔 곳이다.

사용자 요구: "시스템 효과음과 공용 UI 그림 부분 작업해 줘." 캐릭터·NPC(`assets/chara/`)·글꼴(`assets/font/`)과 같은 원칙이다 — **한 곳에서 관리하고, 한 곳만 고치면 모든 화면에 반영**된다.

---

## 1. 결론

| 결론 | 근거 |
|---|---|
| 여러 화면이 같이 쓰는 시스템 효과음·2D UI 그림은 **`web/assets/common/{sound,tex}/` 한 곳**에 둔다. 화면 폴더에는 그 화면만 쓰는 것과 명세가 남는다 | §2 측정: 같은 바이트 파일이 화면 폴더마다 따로 있었다(소리 8개가 27벌, 그림 55장이 122벌) |
| 이름은 `common`(원본 상주 공용 `_ResidentAudio`·공용 레이아웃 아카이브 `bq.nx.bea/Parts.lyt` 에 대응). `mgmcommon` 은 미니게임 모드 공용 묶음(mgm00·mgmet·mgm01 레이아웃)이라 뜻이 다르므로 쓰지 않는다 | §3 |
| 공용으로 올리는 기준 = **(가) 범주: 시스템 효과음 `SQ_SE_SYS_*` 전부·`sys_` UI 그림 전부(원본 상주 공용) — 2단계 §11, 사용자 결정 2026-10-08** + **(나) 그 밖에 같은 원본 단위 + 같은 바이트 + 둘 이상의 화면 폴더**(얼굴 22·`mn0x_` 6·`mgmet_pict_free_02`). 원본 단위 = 그림은 텍스처 이름 하나, 소리는 **시퀀스 하나**(fsar 의 fileId·시작 위치·뱅크). 이름이 같아도 내용이 다르면 화면에 남긴다(지금 0건) | 사용자 지시(조정자 전달). [데이터] `SQ_SE_MGM01_{CANCEL,CUR,DEC,DECI_S,DECI_LR}` 는 `SQ_SE_SYS_{CANCEL,CURSOR,DECI,DECI_S,DECI_LR}` 와 **같은 시퀀스를 가리키는 다른 라벨**(별칭)이다 → 파일 하나. 그림은 이름이 다르면 원본에서 다른 BNTX 항목이라 바이트가 같아도 따로 둔다(chara_assets.md §4.1 과 같은 판단) |
| 명세는 공용 파일을 **자기 기준 폴더 상대 경로**(`../common/…`)로 가리킨다. 명세 필드·읽는 코드(`url(p)`)는 그대로 | 캐릭터·글꼴과 같은 방식. URL·로더 키는 `new URL` 로 정규화되어 `common/…` 하나가 된다(`view/assetKey.ts`) |
| 캐릭터 얼굴 아이콘 `face_128_pcNN^u` 는 **`common/tex/`**(chara 아님) | 원본 위치가 캐릭터 아카이브(`chara~pcNN`)가 아니라 공용 레이아웃 아카이브 `bq Parts.lyt` 의 `timg/__Combined.bntx` 이고(`UiSharedTextureModule::GetPCFace`), 2D 레이아웃 그림(uiimage, 압축 분류 ui)이다. `chara/` 는 3D 폴더(`TEX3D_ROOTS`, 밉·색 분류)라 넣으면 압축 분류가 바뀐다 §4.2 |
| 압축 빌드 분류는 그대로: 그림 = 2D UI(uastc 계열, 작은 것·4의 배수 아닌 것 keep), 소리 = Opus(ogg)+m4a | `common/` 은 `TEX3D_ROOTS` 밖이라 ui, `sound/wave/` 가 아니라 lossy. 경로만 바뀐 같은 내용은 옛 결과를 복사한다 §8 |

---

## 2. 지금(전) 상태 [실행]

내용 sha1 로 비교(스크래치 `dup_all.cjs`·`dup_detail.cjs`, 캐릭터·글꼴·3D 폴더 제외).

### 2.1 시스템 효과음 — 같은 시퀀스·같은 바이트

| 공용 파일(시퀀스) | 라벨 → 화면 폴더 | 벌 | 한 벌 B |
|---|---|---|---|
| `SQ_SE_SYS_DECI_L` | 같은 라벨 → charselect·mgmet·online·partyrule·setplayer | 5 | 366,764 |
| `SQ_SE_SYS_CANCEL` | 같은 라벨 → charselect·mgmcommon·modeselect, `SQ_SE_MGM01_CANCEL` → mgm01 | 4 | 66,284 |
| `SQ_SE_SYS_CURSOR` | 같은 라벨 → charselect·mgmcommon·modeselect, `SQ_SE_MGM01_CUR` → mgm01 | 4 | 39,404 |
| `SQ_SE_SYS_DECI` | 같은 라벨 → charselect·mgmcommon·modeselect, `SQ_SE_MGM01_DEC` → mgm01 | 4 | 55,724 |
| `SQ_SE_SYS_ERROR` | 같은 라벨 → charselect·mgmcommon·modeselect | 3 | 87,404 |
| `SQ_SE_SYS_CURSOR_S` | 같은 라벨 → mgmet·partyrule·plaza/ui | 3 | 24,044 |
| `SQ_SE_SYS_DECI_S` | 같은 라벨 → mgmcommon, `SQ_SE_MGM01_DECI_S` → mgm01 | 2 | 41,324 |
| `SQ_SE_SYS_DECI_LR` | 같은 라벨 → online, `SQ_SE_MGM01_DECI_LR` → mgm01 | 2 | 39,404 |
| 합 | | **27 벌 2.98 MB** | 한 벌씩 0.72 MB(겹친 양 2.25 MB) |

- 모두 같은 원본(`_ResidentAudio.nx.bea/_Resident/AddonAudioProject.fspj`)을 같은 도구(`sound_seq.py render`)로 렌더한 것이라 바이트가 같다.
- [데이터] 별칭: `SQ_SE_MGM01_CANCEL` 과 `SQ_SE_SYS_CANCEL` 은 fileId 2·시작 위치 1247·뱅크 1·볼륨 110·플레이어 111 이 모두 같다(나머지 넷도 같은 식, `common_shared.py check` 가 대조). 원본은 시퀀스 하나에 라벨 둘이고, 웹은 라벨 표(`sounds{라벨: {file, gain}}`)를 라벨마다 두되 `file` 은 같은 파일 하나를 가리킨다.

### 2.2 공용 UI 그림 — 같은 이름·같은 바이트

| 묶음 | 이름 | 벌 | 겹친 양 |
|---|---|---|---|
| 캐릭터 얼굴 `face_128_pcNN^u` | 22 | charselect/tex · mg1801/ui/tex = 44 | 0.48 MB |
| `mgmet_pict_free_02^o` | 1 | mgmcommon/tex/mgmet · mgmet/tex = 2 | 0.44 MB |
| `sys_icon_hard_*`(13)·`sys_icon_lamp_*`(3)·`sys_pat_balloon^s` | 17 | charselect · setplayer = 34 | 0.08 MB |
| `sys_white_00^s` | 1 | 7 화면(charselect·mgmcommon·online·partyrule·setplayer·plaza/ui·mg1801/ui) | — |
| `sys_win_00^s`·`sys_win_shadow_00^s` | 2 | charselect·mgmcommon·online·plaza/ui = 8 | — |
| `sys_face_dummy(256)^q`·`sys_facebase_01/02^s`·`sys_username_01^s`·`sys_icon_rank_00^q` | 6 | 2~3 화면 | 0.10 MB |
| `mn00_white_00^s`·`mn01_{icon_feel_00,stripe_00,win_00,win_20px,win_shadow_00}^*` | 6 | modeselect·partyrule·online·plaza/ui 중 둘 = 12 | 0.003 MB |
| 합 | **55** | **122 벌 2.19 MB** | 한 장씩 1.08 MB(겹친 양 1.10 MB) |

- 이름이 같고 내용이 다른 것: **0**(`common_shared.py check`).
- **이름이 다르고 바이트가 같은 것**(따로 둠): 42 묶음 0.48 MB. 예: `sys_win_00^s` ↔ `mn01_win_00^s`·`mgm01_win_00^s`·`mgmet_win_00^s`·`matching00_win_00^s`(13벌이 1×1 같은 그림), `mgm00_ef_ring_00^s` ↔ `mgm01_…`·`mgmet_…`, `face_64_pc01^q` ↔ `sys_face_dummy64^q`(mgmcommon 안 14개), `mgmet_pict_cpu_00^q` ↔ `mn01_pict_cpu_00^q`. 원본에서 다른 아카이브의 다른 텍스처라 한쪽을 고쳐도 다른 쪽은 그대로여야 한다.
- 범위 밖으로 둔 중복: `mg1801/tex` 안 `.hdr` 8개(0.47 MB, 3D 환경광), `plaza/world` 3개(3D) — 시스템 소리·2D UI 가 아니다.

### 2.3 원래 경로 규칙

| 명세 | 경로 기준 폴더 | 소리 `file` | 그림 `textures` |
|---|---|---|---|
| `charselect/spec.json` | `charselect/` | `sound/X.wav` | `tex/x.png` |
| `modeselect/spec.json` | `modeselect/` | `sound/X.wav` | `tex/x.png` |
| `mgmcommon/{spec,mgmet,mgm01}.json` | `mgmcommon/` | `sound/X.wav` | `tex/{common,mgmet,mgm01}/x.png` |
| `mgmet/extra.json`·`online/online.json`·`partyrule/partyrule.json`·`setplayer/setplayer.json`·`plaza/ui/plaza_{ui,card}.json` | `mgmcommon/`(mergeSpec 로 합쳐짐) | `../<화면>/sound/X.wav` | `../<화면>/tex/<줄임>/x.png` |
| `mgm01/faces.json` | `mgmcommon/` | — | `../charselect/tex/face_128_pcNN_u.png`(이미 남의 폴더를 가리킴) |
| `mgm01/catalog.json` | `assets/`(mgm01_page 는 `mgm01/` 로 시작하면 assets 기준, mgmscreens_page 는 앞에 `../` 를 붙여 mgmcommon 기준으로) | `mgm01/sound/X.wav` | — |
| `mg1801/ui/ui.json` | `mg1801/ui/` | — | `tex/x.png` |

같은 그림이 경로가 달라 **로더 관리자 키도 달랐다**(예 `charselect/tex/sys_white_00_s.png` ≠ `mgmcommon/tex/common/sys_white_00_s.png`) → 화면을 넘어갈 때마다 다시 받고 다시 풀었다.

---

## 3. 원본 구조 [데이터]

| 원본 | 내용 | 웹 |
|---|---|---|
| `_ResidentAudio.nx.bea/_Resident/AddonAudioProject.fspj` | 상주 사운드 프로젝트 — 화면 SE 라벨(`SQ_SE_SYS_*`·`SQ_SE_MGM01_*`·`SQ_SE_MATCHING00_*` 등)이 모두 여기 하나의 표에 있고, 라벨은 시퀀스 파일(fileId 2) 안 시작 위치 + 뱅크를 가리킨다. 다른 라벨이 같은 시퀀스를 가리키기도 한다(§2.1 별칭) | 시퀀스 하나 = wav 하나. 여러 화면이 쓰는 시퀀스는 `common/sound/<SQ_SE_SYS_ 라벨>.wav` |
| `bq.nx.bea/Parts.lyt`(`timg/__Combined.bntx` 등, 텍스처 861장) | 공용 부품 레이아웃·공용 텍스처: `sys_*` 전부, 캐릭터 얼굴 `face_{64,128,256}_pcNN`, 카드 배경, 스탬프, 미니게임 썸네일 | 원본 이름 하나 = PNG 하나. 여러 화면이 쓰는 것은 `common/tex/` |
| 화면·모드 레이아웃 아카이브(`menu~menu00`·`menu~menu01`·`mgm~mgmet` 등) | 그 장면 레이아웃과 텍스처 | 대부분 그 화면 폴더. 웹이 한 장면을 두 화면으로 나눈 곳(menu01 = 모드 선택·파티 규칙, menu00 = 온라인·광장 UI)과 mgmet 설명 그림(mgmcommon 묶음·mgmet 추가 조각)만 겹쳐 `common/tex/` |

[실행] 화면 폴더의 `sys_*` 97장은 전부 bq Parts BNTX 에 있다. 공용 그림 55장 중 48장이 bq Parts, 7장(`mn00_*`·`mn01_*`·`mgmet_pict_free_02^o`)이 화면 아카이브 것이다.

---

## 4. 공용 폴더 구조 [설계]

```
web/assets/common/
  sound/<라벨>.wav            여러 화면이 쓰는 시스템 효과음(시퀀스 하나 = 파일 하나, 이름 = 그 시퀀스의 SQ_SE_SYS_ 라벨) — sound_seq.py 렌더 바이트 그대로
  tex/<원본 이름>.png          여러 화면이 쓰는 2D UI 그림 — 이름 = 원본 텍스처 이름의 ^ 를 _ 로(화면 폴더와 같은 규칙), 픽셀 = 원본 디코드 그대로
```

- 이름에 해시를 붙이지 않는다(캐릭터 텍스처와 다름): UI 텍스처·라벨 이름은 원본에서 전역으로 하나이고, 같은 이름에 다른 내용이 오면 변환기가 경고한다(§6).
- 별칭 라벨(`SQ_SE_MGM01_CANCEL` 등)은 파일을 따로 두지 않는다. 이름을 SYS 쪽으로 정한 것은 시스템 효과음 이름이라서이고 원본에 "주 라벨" 표시는 없다 [설계].
- 하위 폴더 없음(원본 공용 아카이브가 평평한 이름 공간).

### 4.1 공용으로 올리는 기준

| 대상 | 어디 | 이유 |
|---|---|---|
| 같은 원본 단위·같은 바이트를 둘 이상의 화면 폴더가 갖던 소리 8(라벨 13)·그림 55 | `common/` | §2. 한 곳만 고치면 모든 화면 |
| ~~한 화면만 쓰는 시스템 효과음·`sys_*` 그림 → 그 화면 폴더~~ → 2단계(§11): 한 화면만 쓰는 것도 `common/`(범주 = 상주 공용). `SQ_SE_SYS_MES_PROC`·`PROCEED`·`SKIP`(mgmcommon), `CANCEL_S`·`NOTICE`·`ONLIN_PLY_RNDMATCH`(online), `sys_*` 71장 | `common/` | 사용자 결정(2026-10-08) |
| 이름이 다르고 바이트가 같은 그림(42 묶음) | 각자 폴더 | 원본에서 다른 BNTX 항목(다른 아카이브·다른 이름). 합치면 한쪽 편집이 다른 쪽에 번짐 — **사용자 확인 필요** |
| BGM·보이스(`charselect/sound/SM_BGM_MENU_MAP.wav`·`voice/`)·미니게임 소리(`mg1801/sound/`) | 원래 폴더 | 시스템 효과음 아님. 화면 하나만 씀 |
| 화면 명세(json) | 원래 폴더 | 그 화면 데이터 |

### 4.2 캐릭터 얼굴 아이콘(`face_128_pcNN^u`)을 어디에 두나

| 기준 | `common/tex/`(채택) | `chara/` |
|---|---|---|
| 원본 위치 | `bq Parts.lyt` 공용 텍스처(`UiSharedTextureModule::GetPCFace "face_%s_pc%02d^u"`) — 레이아웃 공용 | 캐릭터 아카이브 `chara~pcNN` 에는 없다 |
| 쓰는 곳 | 2D 레이아웃(캐릭터 선택 버튼, 승패 표·온라인·광장 하단 줄의 `x_face_pc128`, mg1801 결과 `sys_face_01`) — uiimage | 3D 모델(glb)·눈 텍스처 |
| 압축 분류 | 2D UI(uastc, 밉 없음) — 지금과 같음 | `TEX3D_ROOTS` 라 color(ETC1S 우선·밉) 로 바뀜 |

→ `common/tex/`. 같은 원칙(한 곳 관리)은 그대로 지켜진다. `face_64`·`face_256`(한 화면씩)도 나중에 여러 화면이 쓰면 같은 곳으로 온다.

---

## 5. 명세가 공용 파일을 가리키는 방식 [설계]

경로는 모두 **그 명세의 기준 폴더 상대 경로**(§2.3 표와 같은 기준, 앞에 `../common/` 이 붙을 뿐). 명세 필드 이름·형식은 바뀌지 않는다.

| 명세 | 기준 폴더 | 소리 예 | 그림 예 |
|---|---|---|---|
| `charselect/spec.json` | `charselect/` | `../common/sound/SQ_SE_SYS_DECI.wav` | `../common/tex/face_128_pc01_u.png` |
| `mgm01/catalog.json` | `assets/` | `SQ_SE_MGM01_CANCEL` → `common/sound/SQ_SE_SYS_CANCEL.wav` | — |
| `modeselect/spec.json` | `modeselect/` | `../common/sound/SQ_SE_SYS_CURSOR.wav` | `../common/tex/mn01_win_00_s.png` |
| `mgmcommon/*.json`·mgmcommon 기준 조각(mgmet·online·partyrule·setplayer·plaza_ui·plaza_card) | `mgmcommon/` | `../common/sound/SQ_SE_SYS_DECI_L.wav` | `../common/tex/sys_white_00_s.png` |
| `mgm01/faces.json` | `mgmcommon/` | — | `../common/tex/face_128_pc01_u.png`(charselect 폴더를 거치지 않음) |
| `mg1801/ui/ui.json` | `mg1801/ui/` | — | `../../common/tex/face_128_pc01_u.png` |

- 사운드 라벨 표(`sounds{라벨: {file, gain, evidence}}`)의 라벨·볼륨·근거는 그대로, `file` 만 바뀐다.
- 텍스처 표(`textures{원본 이름: 경로}`)·`srgb` 목록은 이름 기준이라 그대로, 경로만 바뀐다.

---

## 6. 변환기 [설계]

새 공용 모듈 `web/tools/analysis/common_shared.py` 를 화면 변환기들이 같이 쓴다. 원본(`C:/dev/original`)·`extracted/` 는 읽기만 한다.

| 함수 | 하는 일 |
|---|---|
| `sound_file(라벨)`·`is_common_tex(이름)` | 공용 여부를 정하는 곳(여기 한 곳). 소리 = 별칭 표 `ALIASES`(MGM01 → SYS) 또는 `SQ_SE_SYS_` 로 시작하는 라벨, 그림 = `sys_` 로 시작하는 이름 또는 `TEXTURES`(범주 밖 공용: 얼굴 22·`mn0x_` 6·`mgmet_pict_free_02`) — 2단계 §11 |
| `tex(이름, 그림, 화면 경로, 기준 폴더)` | 공용이면 `common/tex/<이름>.png`(PIL `optimize=True` PNG — 화면 변환기의 `img.save` 와 같은 바이트)에 쓰고 기준 폴더 상대 경로를 돌려준다. 아니면 화면 경로에 저장하고 `None`(부른 쪽이 원래 경로를 씀) |
| `sound(라벨, 렌더 wav, 화면 경로, 기준 폴더)` | 같은 규칙(바이트 그대로 복사) |
| `put` | **같은 경로에 다른 내용을 쓰면 경고**(`공용 파일 내용이 바뀜`)하고 덮어쓴다 — chara_shared.py 와 같다. 경고가 나오면 그 이름은 "이름 같고 내용 다름"이므로 공용 목록에서 빼고 화면에 남긴다 |
| `check` | 감사: 별칭 라벨이 정말 같은 시퀀스인지(fsar), 화면 폴더에 남은 공용 단위 사본, 공용 후보(같은 원본 단위·바이트가 둘 이상 화면에 새로 생김), 단위 같고 내용 다름, 빠진 공용 파일 → 모두 0 이어야 함 |

| 변환기 | 공용으로 가는 것 | 바뀌는 곳 |
|---|---|---|
| `charsel_web_assets.py ui sound` | 얼굴 22·sys_ 그림·SE 5 | `build_ui` 텍스처 저장, `build_sound` |
| `modesel_web_assets.py` | mn01 그림 3·SE 4 | 텍스처 저장, 소리 복사 |
| `mgmcommon_web_assets.py` | sys_ 그림·mgmet_pict_free_02·SE 5 | `Bundle.write_textures`(online·partyrule·setplayer·plaza_ui·plaza_card 도 이것을 씀), `render_sounds` |
| `mgmet_web_assets.py` | mgmet_pict_free_02·SE 2 | 텍스처 저장, 소리 |
| `online_web_assets.py`·`partyrule_web_assets.py`·`setplayer_web_assets.py`·`plaza_ui_assets.py`·`plaza_card_assets.py` | sys_·mn0x 그림·SE | 경로 앞붙이기(`../<화면>/`)를 공용 경로에는 하지 않음, 소리 |
| `mgm01_web_assets.py` | 별칭 SE 5(`SQ_SE_MGM01_{CANCEL,CUR,DEC,DECI_S,DECI_LR}`) | `render_sounds`(catalog `file` = assets 기준 `common/sound/…`) |
| `mg1801_web_ui.py` | 얼굴 22·sys_white·sys_facebase_01·sys_face_dummy | 텍스처 저장(레이아웃·얼굴 두 곳) |
| `mgm01_faces_part.py` | — | charselect 명세 경로를 `mgmcommon/` 기준으로 정규화(`../common/tex/…`) |

- 다시 만들기: 화면 변환기를 다시 돌리면 된다(순서 = 지금과 같음: charsel → modesel → mgmcommon → mgm01 → mgmet → online → partyrule → setplayer → plaza_ui → plaza_card → mgm01_faces_part → mg1801_web_ui). `common/` 을 비우고 새로 만들 때도 같다.
- 옛 화면 폴더 사본은 지우지 않고 scratchpad `old_common_assets/<원래 경로>` 로 옮긴다. `--prune` 하지 않는다.

---

## 7. 읽는 쪽·캐시 [설계]

| 곳 | 바꾸는 것 |
|---|---|
| `app/scene/menu/charselect/render2d.ts`(모든 2D 화면 공용)·`app/minigame/mg1801/view/ui.ts` | 없음 — 명세 경로를 `url()` 이 붙이고 `..` 는 URL 이 접는다 |
| `app/scene/menu/charselect/assetHooks.ts` | `loadBytes(url)` 끼움점 추가(기본 = fetch → ArrayBuffer) |
| `view/appFlow.ts` broker | `loadBytes` 를 앱 로더 관리자 `bytes`(P1)로 — 받은 버퍼는 복사해 넘김(decodeAudioData 가 떼어 감). 관리자 밖(다른 종류로 쓰는 키 등)이면 직접 |
| 효과음을 fetch 로 직접 받던 곳: `mgm01_page`·`mgmcommon_page`·`mgmet_page`·`mgmscreens_page`·`modeselect_page`·`online_page`·`partyrule_page`·`setplayer_page`·`app/scene/world/plaza/ui/part.ts` | `assetHooks.loadBytes(url)` 로 — 흐름 안에서는 같은 키 = 한 번 받기 |
| `charselect_page`·`plaza_page` | 그대로(이미 관리자 `bytes` 키) |
| `mgm01_page` catalog 소리 | `mgm01/` 로 시작할 때만 assets 기준이던 규칙 → catalog `file` 앞에 `../` 를 붙여 mgmcommon 기준으로(mgmscreens_page 와 같은 규칙). `common/sound/…` 도 맞게 풀린다 |
| `view/flowCatalog.ts` | 코드 변경 없음(명세 경로를 `normPath` 로 접어 `common/…` 키가 됨). 머리 주석에 공용 폴더 |
| `tools/build_assets.ts` | 경로만 바뀐 같은 내용 옛 결과 복사(`moved`)를 소리에도 — ogg·m4a 가 전과 같은 바이트 |

- 로더 키(`assetKeyFrom`)는 URL 을 페이지 기준으로 풀어 `..` 를 접는다 → 모든 화면이 같은 소리·그림을 **같은 키 `common/…`·같은 주소**로 요청한다.
- 2D 그림은 이미 broker(`loadUiImage` → uiimage P0)를 지나므로 화면을 넘어가도 한 번 받고 한 번 푼다. 소리도 위 변경으로 같다.
- mg1801 HUD 그림은 게임 화면의 직접 로더(`loadUiImage`, 관리자 밖)라 같은 주소의 HTTP·서비스 워커 캐시만 쓴다(chara_assets.md §7 과 같은 상태) — **사용자 확인 필요**.

## 8. 압축 빌드 [설계]

- 그림: `assets_tex.ts classify` — `common/` 은 `TEX3D_ROOTS` 밖 → `ui`(4의 배수가 아니면 `keep size%4`). 화면 폴더에 있을 때와 같은 분류 키 → `moved` 로 옛 결과 복사(새 인코딩 0).
- 소리: `assets_audio.ts audioKind` — `sound/wave/` 가 아니므로 `lossy`(ogg + m4a). 이번에 `moved` 를 소리에도 적용해 옛 결과를 복사(새 인코딩 0, 같은 바이트).
- 개발 페이지에서 고칠 때: `common/tex/<이름>.png`·`common/sound/<라벨>.wav` 하나를 고치면 그것을 가리키는 모든 화면에 반영되고, `npm run assets` 증분이 그 파일만 다시 만든다.

---

## 9. 결과 [실행]

### 9.1 공용 폴더

| | 파일 | 소스 MB | 압축본 MB |
|---|---|---|---|
| `common/tex/` | 55(ktx2 36·png 19 — 작은 것·4의 배수 아닌 것) | 1.08 | 0.89 |
| `common/sound/` | 8(라벨 13) | 0.72 | ogg 0.08 + m4a 0.08 |
| **합** | **63** | **1.80** | **0.96**(ogg 기준) |

- 전(§2): 화면 폴더 149 파일(그림 122·소리 27) 소스 5.16 MB, 압축본 2.10 MB(그림 1.79·ogg 0.31) → 후: 63 파일 소스 1.80 MB(−3.36), 압축본 0.96 MB(−1.13).
- 에셋 전체(`assets-dist/report.json`): 소스 564.17 → 560.81 MB, 압축본 279.95 → 279.05 MB(ogg 7.31 → 7.07, m4a 10.10 → 9.85), 전송 추정 224.91 → 223.78 MB, 파일 2,624 → 2,538.
- 옛 화면 폴더 사본 149개(5.16 MB)는 지우지 않고 scratchpad `old_common_assets/<원래 경로>` 로 옮겼다. 압축본의 옛 산출물은 `--prune` 전까지 남는다(배포 `dist/` 에는 `index.json names` 에 있는 것만 실린다).

### 9.2 변환기가 서로 같은 것을 쓰는지 [실행]

- 화면 변환기 12개(charsel `ui sound`·modesel·mgmcommon·mgm01·mgmet·online·partyrule·setplayer·plaza_ui·plaza_card·mgm01_faces_part·mg1801_web_ui)를 차례로 돌려 **공용 파일 경고 0**. `sys_white_00^s` 는 7개 변환기가, 얼굴 22장은 2개 변환기가 같은 바이트로 썼다.
- 옮긴 옛 사본 149개 전부 공용 파일과 바이트가 같다(다름 0). 화면 폴더의 나머지 파일(679개)은 전과 바이트가 같다(바뀜 0, 없어짐 0, 새로 생김 0).
- 명세 차이 = 공용 경로로 바뀐 항목만(charselect 50, mgmcommon/spec 13, mgmet.json 1, mgmet/extra 3, modeselect 7, online 10, partyrule 9, setplayer 19, plaza_ui 6, plaza_card 1, mgm01/faces 22, mgm01/catalog 5, mg1801/ui 25). 그 밖 차이 0.
- `common_shared.py check`: 별칭 5쌍 모두 같은 시퀀스(fsar), 화면 폴더에 남은 공용 단위 사본 0, 공용 후보 0, 단위 같고 내용 다름 0, 빠진 공용 파일 0. 이름이 다르고 바이트가 같은 그림은 36 묶음 0.23 MB(원본 단위가 달라 따로 둠, §10).
- 맞춘 것 둘(공용과 무관한 원래 문제):
  - `charsel_web_assets.py ui sound`(chara 없이 실행)가 이전 명세에서 `glb·anims·clips·uv·eye` 만 옮기고 `motions·albedo·body` 를 버렸다(캐릭터 공용 폴더 작업 때 생긴 키) → 옮기는 키에 셋을 더함. 명세는 전과 같다.
  - `mg1801_web_ui.py` 는 텔롭 OTF 서브셋(fontTools)이 돌릴 때마다 머리 표 시간값만 달라진다(3,096 B, 130번째 바이트) → 옛 파일을 그대로 두었다(글리프 같음, 압축본 해시 유지).

### 9.3 키·캐시 [실행]

- `tools/test_prefetch.ts` 9절(새로 추가 11건): 명세 13개(+ 페이지별 주소 규칙 4가지: mgm01_page·mgmscreens_page catalog `../` 규칙, plaza_page loadSounds, mg1801 `Assets.url('ui/…')`)를 실제 페이지와 같은 URL 로 만들어 `assetKeyFrom` 으로 풀면
  - 그림 원본 이름 하나에 키 하나(화면 사이 같은 키) — 예 `sys_white_00^s` = `common/tex/sys_white_00_s.png`(7 화면), `face_128_pc01^u`(캐릭터 선택·mgm01 faces·mg1801), `mgmet_pict_free_02^o`(mgmet.json·extra.json).
  - 효과음 라벨 하나에 키 하나, `SQ_SE_SYS_DECI_L` = `common/sound/…`(5 화면), 별칭 5쌍 = 같은 `common/sound` 키.
  - 사운드 라벨 46개(명세마다 센 것) 전부 소스 파일로 해석, 그림·소리 키 525개(공용 63) 모두 소스에 있음(404 0)·압축본 해시 표에 있음.
- 압축 빌드(`npm run assets` 증분, 9 s): 그림 **새 인코딩 0**·옮긴 경로 옛 결과 복사 55, 소리 **새 인코딩 0**·옛 결과 복사 8 → 형식·PSNR·ogg/m4a 바이트가 전과 같다.
- 받는 양(압축본, 2D 그림 + 효과음, 소리 = ogg, 화면 = 그 화면 명세 + 부품 합친 것, 스크래치 `common_bytes.cjs`):

| 화면 | 전 키 | 후 키 | MB(전 = 후) |
|---|---|---|---|
| 인원 설정 | 75 | 75 | 0.25 |
| 캐릭터 선택 | 58 | 58 | 0.51 |
| 광장 UI(mgmcommon·온라인·faces·plaza_ui·카드 + 소리 표) | 285 | 276 | 21.20 → 21.11 |
| 모드 선택 | 54 | 54 | 1.42 |
| 항구(mgmet) | 136 | 136 | 8.19 |
| 미니게임 목록(mgm01) | 222 | 218 | 17.20 → 17.17 |
| 파티 규칙 | 111 | 111 | 0.74 |
| mg1801 HUD | 48 | 48 | 0.57 |
| **흐름 합(같은 키 한 번)** | **718 키 48.34 MB** | **638 키 47.65 MB** | **−0.69 MB(−80 키)** |

- 화면별 수는 명세가 적은 그림·효과음 파일 전부를 센 것이다(광장 UI 의 소리 = plaza_page 가 모으는 네 명세 + 온라인). 화면 하나만 보면 거의 같다(화면 안에서는 같은 이름이 이미 한 번만 읽혔다). 줄어드는 것은 **화면을 넘어갈 때 다시 받던 것**이다: 캐릭터 선택에서 받은 얼굴 22장·`sys_*` 는 mgm01 승패 표·온라인·광장 하단 줄·mg1801 결과가, 인원 설정에서 받은 `SQ_SE_SYS_DECI_L` 은 캐릭터 선택·항구·온라인·파티 규칙이 그대로 쓴다.
- 실제 페이지 콘솔 확인 1회: §9.5.

### 9.4 시험 [실행]

| 시험 | 전 | 후 |
|---|---|---|
| check_charselect | 2412/2412 | 2412/2412 |
| check_mgmcommon | 12954/12954 | 12954/12954 |
| check_modeselect | 1068/1068 | 1068/1068 |
| test_setplayer | 116/116 | 116/116 |
| test_online | 154/154 | 154/154 |
| test_partyrule | 106/106 | 106/106 |
| test_mgm01 | 277/277 | 277/277 |
| test_mgmet | 218/218 | 218/218 |
| test_mgmscreens | 38/38 | 38/38 |
| test_plaza_actors·move·ui·world·gl | 226·112·129·437·60 | 226·112·129·438·60(world: import 경계 검사 1건 늘어남 — part.ts 의 `charselect/assetHooks` import, 허용 범위) |
| test_prefetch | 115/115 | 126/126(9절 +11) |
| test_fonts | 138/138 | 138/138 |
| test_mg1801 | 통과 84 줄·실패 0 | 같음 |
| test_mgmcommon·test_charselect·test_modeselect | 119·67·71 | 같음 |
| tsc | 0 | 0 |
| `npm run build` | 통과 | 통과(배포 `dist/assets-dist/common/` 106 파일) |

### 9.5 실제 페이지 콘솔 확인 1회 [실행]

개발 서버(51811), 4 URL 을 한 브라우저에서 동시에 45 s(촬영 없음, 스크래치 `diag_common.mts`):

| URL | 응답 | `common/` 응답(= 파일 수) | 4xx·요청 실패 | 콘솔 오류 |
|---|---|---|---|---|
| `?plaza=1`(시작 클릭) | 804 | 56(56) — 그림 51·소리 5 | 0 | 0 |
| `?plaza=1&skipsetup=1` | 731 | 51(51) | 0 | 0 |
| `?plaza=1&assets=dist` | 786 | 56(56) — ktx2·png·ogg | 0 | 0 |
| `?plaza=1&skipsetup=1&assets=dist` | 706 | 51(51) | 0 | 0 |

- 공용 파일마다 응답이 하나다 = 화면을 넘어가도 같은 그림·소리를 다시 받지 않았다(인원 설정 → 캐릭터 선택 → 광장 UI).

### 9.6 바꾼 파일

| 종류 | 파일 |
|---|---|
| 변환기 | 새 `tools/analysis/common_shared.py`, `charsel_web_assets.py`(공용 쓰기 + chara 없이 돌릴 때 키 보존), `modesel_web_assets.py`, `mgmcommon_web_assets.py`(`Bundle.write_textures`·`render_sounds`), `mgm01_web_assets.py`, `mgmet_web_assets.py`, `online_web_assets.py`, `partyrule_web_assets.py`, `setplayer_web_assets.py`, `plaza_ui_assets.py`, `plaza_card_assets.py`, `mg1801_web_ui.py`, `mgm01_faces_part.py` |
| 런타임 | `app/scene/menu/charselect/assetHooks.ts`(`loadBytes`), `view/appFlow.ts`(broker `bytes`), `mgm01_page.ts`(catalog `../` 규칙 + loadBytes), `mgmcommon_page.ts`·`mgmet_page.ts`·`mgmscreens_page.ts`·`modeselect_page.ts`·`online_page.ts`·`partyrule_page.ts`·`setplayer_page.ts`·`app/scene/world/plaza/ui/part.ts`(loadBytes), `view/flowCatalog.ts`(머리 주석) |
| 빌드 | `tools/build_assets.ts`(경로만 바뀐 소리도 옛 결과 복사) |
| 시험·도구 | `tools/test_prefetch.ts`(9절), `tools/shot_assets.ts`(소리 표본 경로 `common/sound/SQ_SE_SYS_DECI.wav`) |
| 에셋 | 새 `assets/common/{sound,tex}/` 63 파일, 명세 13개 경로 |
| 문서 | 이 문서, `README.md`, `assets_pipeline.md` §2, `loader_manager.md` §13.4, `assets/README.md` |

---

## 11. 2단계 — 범주로 넓히기(사용자 결정 2026-10-08) [설계]

사용자 결정: §10 의 1번(공용 범위를 범주로) 진행, 2번(MGM01 별칭 파일 하나) 확정.

| 범주 | 원본 | 웹 규칙 |
|---|---|---|
| 시스템 효과음 = 라벨 `SQ_SE_SYS_*` 전부 | 상주 사운드 `_ResidentAudio` 의 시스템 SE | `common/sound/<라벨>.wav`. 별칭(`SQ_SE_MGM01_*` 5개)은 그대로 SYS 파일 하나 |
| 공용 UI 그림 = 원본 이름이 `sys_` 로 시작하는 2D 텍스처 전부 | 공용 레이아웃 아카이브 `bq Parts.lyt`([실행] 화면 폴더의 `sys_*` 97장 전부 bq Parts BNTX 에 있다 §3) | `common/tex/<이름>.png` |
| 범주 밖이지만 여러 화면이 같은 이름·바이트로 쓰는 것 | 얼굴 `face_128_pcNN^u` 22(bq Parts), `mn00_/mn01_` 6(화면 아카이브), `mgmet_pict_free_02^o` | 1단계 그대로 `TEXTURES` 목록 |

- 새로 옮기는 것: 소리 6(`SQ_SE_SYS_MES_PROC`·`PROCEED`·`SKIP` — mgmcommon, `CANCEL_S`·`NOTICE`·`ONLIN_PLY_RNDMATCH` — online, 0.89 MB), 그림 `sys_*` 71장(0.15 MB, charselect·mgmcommon·online·partyrule·setplayer·plaza/ui·mg1801/ui).
- 그대로: 이름이 다르고 바이트만 같은 그림 36 묶음(원본 항목이 다름), `face_64`·`face_256`·카드·스탬프·썸네일(bq Parts 지만 `sys_` 아님, 한 화면), BGM·보이스.
- 이름 같고 내용 다름은 0(1단계 감사) — 다른 내용이 오면 `put` 이 경고한다. 그 이름은 범주에서 빼야 하는 예외로 `common_shared.py` 에 적는다(지금 없음).
- 압축 분류 그대로(ui·keep / lossy), 경로만 바뀐 것은 옛 결과 복사. 옛 화면 사본은 scratchpad `old_common_assets/` 로 mv.
- 읽는 쪽 변경 없음(명세 경로만 바뀜). `test_prefetch` 9절의 공용 키 수만 바뀐다.

### 11.1 결과 [실행]

| | 1단계 뒤 | 2단계 뒤 |
|---|---|---|
| `common/tex/` | 55 | **126**(`sys_*` 97 + 얼굴 22 + `mn0x_` 6 + `mgmet_pict_free_02` 1) |
| `common/sound/` | 8 | **14**(`SQ_SE_SYS_*` 전부, 라벨 19 — 별칭 5 포함) |
| 공용 소스 / 압축본 | 1.80 / 0.96 MB | 2.84 MB(그림 1.23·소리 1.61) / 1.17 MB(그림 1.01·ogg 0.16, m4a 0.18 따로) |

- 옮긴 옛 사본 77개(그림 71·소리 6, 1.04 MB)는 scratchpad `old_common_assets/` 로 mv(1단계와 합쳐 226개). 모두 공용 파일과 바이트가 같다(다름 0).
- 변환기 12개 다시 실행: 공용 파일 경고 0. 화면 폴더 나머지 파일 바뀜 0·없어짐 0·새로 생김 0. 명세 차이 = 공용 경로로 바뀐 77 항목만(charselect 8, mgmcommon/spec 17, online 9, partyrule 1, plaza_ui 25, plaza_card 11, setplayer 6), 그 밖 차이 0. 텔롭 OTF 는 1단계처럼 옛 파일 유지.
- `common_shared.py check`: 남은 공용 사본 0, 공용 후보 0, 단위 같고 내용 다름 0, 별칭 5쌍 같은 시퀀스. 이름이 다르고 바이트만 같은 그림 34 묶음 0.23 MB(따로 둠).
- 압축 빌드: 그림 새 인코딩 0·옛 결과 복사 71, 소리 새 인코딩 0·복사 6. 에셋 전체 수치(소스 560.81·압축본 279.05·전송 223.78 MB, 파일 2,538)는 1단계 뒤와 같다 — 한 화면만 쓰던 것을 옮겼을 뿐 중복이 없었으므로. 흐름 받는 양도 같다(638 키 47.65 MB).
- 시험: 1단계와 같은 수(§9.4), test_prefetch 126/126(9절 공용 키 = 그림 126 + 소리 14 = 140, 그림·소리 키 525개 404 0·압축본 표에 있음, 라벨 46개 해석), tsc 0, `npm run build` 통과(배포 `common/` 175 파일).
- 실제 페이지 콘솔 1회(개발 서버, 4 URL 동시 45 s, 촬영 없음): `?plaza=1` common 응답 80, `?plaza=1&skipsetup=1` 77, `&assets=dist` 각각 80·77 — 4xx·요청 실패 0, 콘솔 오류 0, 공용 파일마다 응답 하나.

---

## 10. 사용자 확인 필요

| 항목 | 지금 결정 | 다른 선택 |
|---|---|---|
| 공용으로 올리는 범위 | **사용자 결정(2026-10-08): 범주로 넓힘(§11)** — ~~둘 이상 화면이 같은 원본 단위·같은 바이트로 쓰는 것만(소리 8·그림 55)~~ | 범주로 올리기: 모든 `SQ_SE_SYS_*`(한 화면만 쓰는 6개 더, 0.89 MB)·bq Parts 의 모든 `sys_*`(한 화면만 쓰는 71장 더, 0.15 MB). 원본 상주·공용 아카이브와 더 같아지고 다음에 다른 화면이 쓸 때 목록을 안 고쳐도 됨. 미니게임 썸네일·스탬프·카드·`face_256`(bq Parts 지만 한 화면, 약 60 MB)까지 넣는 것은 범위가 커서 하지 않음 |
| 소리 별칭(`SQ_SE_MGM01_*` 5개 ↔ `SQ_SE_SYS_*`) | 같은 시퀀스라 파일 하나(이름 = SYS 라벨). mgm01 SE 를 고치면 시스템 SE 도 같이 바뀜(원본도 같은 시퀀스). **사용자 결정(2026-10-08): 합친 상태 확정** | 라벨마다 파일 따로(0.24 MB 더) — 웹에서만 다르게 고치고 싶을 때 |
| 이름이 다르고 바이트가 같은 그림(36 묶음 0.23 MB: `sys_win_00^s` ↔ `mn01_/mgm01_/mgmet_/matching00_win_00^s`, `mgm00_ef_ring_*` ↔ `mgm01_/mgmet_…`, `face_64_pc01^q` ↔ `sys_face_dummy64^q`, `mgmet_pict_cpu_*` ↔ `mn01_pict_cpu_*` 등) | 이름별로 따로(원본에서 다른 BNTX 항목) | 내용으로 합치면 −0.23 MB, 대신 한쪽 편집이 다른 화면에 번짐 |
| 캐릭터 얼굴 `face_128_pcNN^u` | `common/tex/`(원본 bq Parts 공용 UI, 2D 분류 유지) | `chara/tex/` — 캐릭터 에셋과 한곳이지만 압축 분류가 3D 로 바뀜 |
| mg1801 HUD 그림을 앱 로더 관리자에 넣기 | 안 함(같은 주소 → HTTP·서비스 워커 캐시만, chara_assets.md 와 같음) | 넣으면 캐릭터 선택에서 받은 얼굴·sys_ 를 푼 채 그대로 씀 |
| 개발 페이지 편집과 변환기 재실행 | 변환기가 덮어씀(재현 우선, 경고 출력) | 편집 목록을 두고 변환기가 건너뜀(개발 페이지 설계 때) |
| 범위 밖 중복 | `mg1801/tex` 안 `.hdr` 8개(0.47 MB)·`plaza/world` 3개는 3D 에셋이라 손대지 않음 | 3D 쪽 공용 정리 때 |
| 압축본 옛 산출물 | 남김(`--prune` 은 사용자 실행) | `npx tsx tools/build_assets.ts --prune` |
