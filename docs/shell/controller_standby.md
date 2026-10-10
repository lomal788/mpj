# 컨트롤러 설정 대기 모달

2026-10-10. 범위: 원본 화면 분석과 독립 표시 부품. 현재 게임·컨트롤러 등록·네트워크에는 연결하지 않는다.

## 1. 원본 자료

- 한국어 `menu01_mode.json`의 `mn01_modeStart_ui_gyro_standby`: “다른 플레이어의 컨트롤러 설정을\r\n기다리는 중입니다.”
- Parts.lyt의 `sys_standby_base`와 `sys_standby_pcface`. Switch 시스템 등록 애플릿과 별개의 MPJ 자체 대기 화면이다.
- [controller_standby_main.c](../../../analysis/decomp/controller_standby_main.c): main 5함수. `7100374110`은 기존 C를 재사용하고, 생성자 `7100372db8`·결과 전송 `7100374de0`·표시 갱신 `7100374f30`·완료 판정 `71003751b0`은 가이드대로 추가 추출했다. 생성자는 Parts.lyt의 sys_standby_base를 생성한다. 설정 결과 기록 후 대기 문구 설정, pid<4의 사람 슬롯 표시·CPU 숨김, UiControlStatusFace에 pid 전달, 완료 대기·세션 동기화·지연·닫기 순서다. 표시 갱신은 설정 성공 bit를 가진 사람 슬롯의 준비 애니 및 normal_ok를 예약하고 SQ_SE_SYS_CNTRLR_SET_OK를 재생한다. 내부 흐름 전체를 웹 화면의 자동 종료 조건으로 복제하지 않는다.

## 2. 화면 구성 [데이터]

원본 좌표는 1920×1080이다. 첨부는 오른쪽이 잘린 화면이므로 이미지 폭에 맞춰 창 좌표를 다시 만들지 않는다.

| 요소 | 원본 값 |
|---|---|
| 배경 어둡게 | `pict_back_black`, 전체 화면, alpha 160 |
| 흰 창·그림자 | `window`·`window_shadow`, 1589×765, 가운데 |
| 대기 문구 | `x_text`, (0,182), 1200×300, bqfont_middle, 71×71, 중앙 정렬 |
| 얼굴 영역 | `A_pcface`, (0,-92), 네 슬롯 x=-450,-150,150,450 |
| 얼굴 | `x_pcface256`, 256×256, mask 슬롯 0·캐릭터 슬롯 1 |
| 준비 | `normal` → `ok` → `normal_ok`; OK 문구·그림자와 초록 배경은 원본 애니 트랙 사용 |

## 3. 웹 구현 기록

| 파일 | 역할·상태 |
|---|---|
| `script/app/scene/system/controllerstandby/{index,screen}.ts` | 독립 화면, 준비 상태 주입, 열기·닫기·해제 완료 |
| `tools/analysis/controller_standby_web_assets.py` | 원본 두 레이아웃·애니·메시지·기존 256px 얼굴/공용 폰트 참조 변환 완료 |
| `assets/controllerstandby/controllerstandby.json` | MgmSpecPart 형태, 경로는 mgmcommon 기준 |
| `script/dev/controllerstandby_page.ts`·`ui_main.ts` | `/dev/ui?ui=controllerstandby&auto=1&com=0000`, 표시 검증 전용 |
| `tools/test_controller_standby.ts` | 원본 수치·애니·상태·자원·수명·import 경계 Node 시험 완료 |

원본에서는 main의 UiGameControllerConfig가 만드는 UI 부품이다. 웹의 system/controllerstandby는 이를 독립 화면으로 확인·재사용하기 위한 래퍼이며 별도의 원본 NRO가 있었다는 뜻은 아니다. MgmView·공용 LayoutInst·공유 렌더러를 사용하고 렌더러를 새로 생성하지 않는다.

호출자는 플레이어와 초기 ready를 전달하고 `setReady(pid, value)`로 표시를 변경한다. 전원이 OK라도 자동 종료하지 않는다. `close()`는 닫기 애니, `dispose()`는 자원 해제다. 이 화면은 패드·설정 결과·네트워크·타이머를 자체 판정하지 않는다.

배경은 호출자가 제공할 선택적 배경 이미지 포트이며, 개발 페이지의 기본 배경은 단색이다. 광장 재생 화면·이름표는 이 모달 소유가 아니다. 4개 슬롯의 원본 고정 위치를 유지하고 없는 슬롯·CPU는 숨긴다. 인원 감소 시 ali1 재정렬은 이번 범위에서 보류한다. 글자색은 원본 x_text 재질의 black=(0,0,0,0)·white=(0,0,0,255)를 그대로 쓴다. 준비 효과음·네트워크·시스템 애플릿은 이번 독립 화면 범위 밖이다.

표시 API는 createControllerStandby({canvas, assets, players, background?}) → screen이다. assets.url은 기존 MgmView와 같은 assets/mgmcommon 기준이다. step()은 고정 1/60의 1프레임을 진행한다. render()는 독립 화면을 그리고 draw()는 호스트의 begin/end 사이에 모달만 그린다. phase는 entering→waiting→closing→closed이며 dispose 뒤 disposed다. 새 ready=true에는 ok 15프레임→normal_ok를 재생하고, 초기 ready=true는 normal_ok를 바로 적용한다. ready=false로 바꾸면 normal로 돌아간다. 중복 설정은 애니를 다시 시작하지 않는다. close는 원본 out 5프레임을 재생하고 dispose는 한 번만 호스트를 해제한다.

개발 페이지는 ready=1111(기본) 또는 ready=1000, chars=pc05,pc07,pc50,pc04를 받을 수 있다. 플레이어별 OK 전환·닫기 버튼은 dev 전용이며 화면 자체의 조작 안내가 아니다. 준비 상태는 cfg.com의 사람이면서 존재하는 슬롯에만 적용한다. 현재 제품 진입점에는 호출을 추가하지 않았다.

## 4. 검증

| 검사 | 결과 |
|---|---|
| test_controller_standby | 13/13 |
| test_mginst | 35/35 |
| test_fonts | 161/161, 새 화면 메시지 누락 글리프 0 |
| test_entry | 460/460 |
| test_layout_runtime | 16/16 |
| test_render_service | 47/47 |
| test_setplayer | 116/116 |
| npm run typecheck | 통과 |
| dev/ui esbuild, write:false | 통과, 디스크 빌드 산출물 없음 |

Node 시험 총 848/848 통과. 새 화면은 실제 LayoutRenderer에 변환 명세를 넣어 검정 글자 uniform·네 얼굴의 UV/UV1 attribute·유효한 정점을 확인한다. WebGL 문맥·브라우저는 실행하지 않았다. 시험 작성 중 in 첫 프레임의 배경 alpha가 0인 것을 최종 alpha 160으로 잘못 비교한 시험 및 renderer.load에 URL 함수 대신 문자열을 넣은 시험 오류를 수정했다. 최종 실패 0.

Ghidra 추출 4함수 성공, 기존 C 재사용 1함수, INDEX 5행 등록. 미추출 요청 0. 기존 게임 동작 변경 없음. 실제 광장 배경 연결·네트워크 합의·자동 종료·기기 등록은 사용자가 나중에 연결할 범위로 남긴다.
