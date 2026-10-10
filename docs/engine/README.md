# 포팅 기반 분석 (엔진·그래픽·사운드·UI·장면)

게임 하나에 묶이지 않는 원본 시스템을 웹으로 옮기기 위한 명세다. 작성 형식과 확정 수준 표기는 [../../../분석.txt](../../../분석.txt)를 따른다. 게임별 문서는 [../minigame/](../minigame/README.md).

| 문서 | 범위 | 상태 |
|---|---|---|
| [01_core.md](01_core.md) | 메인 루프·시간, 파이버 순서, 난수, 장면 수명, 엔티티·컴포넌트 | 작성 중 |
| [02_rhythm.md](02_rhythm.md) | 리듬 미니게임 공용 프레임워크(`ca::rm`, mg1801~mg1810) | 작성 중 |
| [03_graphics.md](03_graphics.md) | FRES 모델·애니, BNTX 텍스처, 재질 근사, 이펙트, glTF 변환 | 작성 중 |
| [04_sound.md](04_sound.md) | 사운드 모듈, 라벨 체계, fsst·fspj·bfstm, 3D 사운드, 추출 | 작성 중 |
| [05_ui_input.md](05_ui_input.md) | 레이아웃(.lyt), 폰트, 메시지 태그, 입력·자이로, FX 트리거·진동 | 작성 중 |
| [06_scene_data.md](06_scene_data.md) | 아카이브 로딩·의존, 캐릭터·모션 데이터, nbmap, 게임 데이터, PhysX | 작성 중 |
| [07_camera_lighting.md](07_camera_lighting.md) | 카메라 시스템·씬 카메라 애니, mg1801 카메라 값, 조명·IBL, 포스트이펙트 | 작성 중 |
| [08_effects.md](08_effects.md) | VFXB 파티클 구조, bex::Effect 런타임, mg1801 이펙트, 웹 파티클 설계 | 작성 중 |
| [09_character.md](09_character.md) | 캐릭터 ID·에셋·뼈, 모션 시스템(재생·블렌드), 시선·흔들림 본, 캐릭터 glb 변환 | 작성 중 |
| [chara_assets.md](chara_assets.md) | 캐릭터·NPC 공용 에셋 폴더 `assets/chara/`(텍스처·모델·모션 한 벌, 화면 명세가 가리킴) | 구현 |
| [13_asset_converter.md](13_asset_converter.md) | 공용 에셋 변환기(아카이브 무관 코어·형식별 처리기·분류별 어댑터, 미니게임 어댑터 `mg_assets.py`), 출력 폴더·압축 분류 규칙, 기존 변환기 이전 표, 미니게임 장면 로더 `app/minigame/frame/stage`·보기 페이지 | 구현 |
| [common_roadmap.md](common_roadmap.md) | 공통(엔진) 작업 현황·남은 작업·미루면 비용이 커지는 것·권장 순서 | 정리 |
| [common_assets.md](common_assets.md) | 시스템 효과음·공용 UI 그림 공용 폴더 `assets/common/{sound,tex}/`(SQ_SE_SYS_*·sys_* 전부 + 여러 화면이 같이 쓰던 것 한 벌, 화면 명세가 가리킴) | 구현 |
| [16_save.md](16_save.md) | 공용 저장(Save): 원본 SaveDataMgr 칸·SaveData 배치·SaveRequest/IsProcessing 수명, 웹 코어 `lib/save`(import 0)·어댑터 `lib/save-localstorage`(키 `mpj.save` 하나)·mpj 연결 `view/save.ts`, 마이그레이션·메시지 속도 | 구현 |
| [17_actor.md](17_actor.md) | ComActor·ActorParam·ComActorPad·JumpCalculator·CPU override·접지/벽/carry·충돌/캐릭터 연결, import 0 코어·어댑터 설계 | 판독 통합·일부 미확정 |
| [19_motion_input.md](19_motion_input.md) | [설계] Converter·파형·입력원·FrameGate 결정성 계약 | 분석 정리본 |
| [render_unify.md](render_unify.md) | 앱 수명 WebGL 렌더러 통합·화면별 패스·준비/복구 계약 | 분석·설계, 실행 미확인 |
| [ui_parts_catalog.md](ui_parts_catalog.md) | /dev 원본 UI 부품·템플릿, 8 SARC·486 layout·화면 조합·칸·애니·준비도 | [데이터][설계] 정리 |
| [18_scene_work.md](18_scene_work.md) | SceneBase 수명·Call/Return/Exchange·7행 모드표·Work 소유권·장면 계약/요청 API | 판독 통합·stack/offset 일부 미확정 |
| [20_camera_runtime.md](20_camera_runtime.md) | 카메라 수학·FSNB·추종·흔들림 통합, import 0 코어·three 어댑터 설계 | 판독 재사용·미확정 12개 |
| [mps_porting.md](mps_porting.md) | MPS 미니게임→MPJ 웹 포팅 지침, hsmg402 호환 경계·작업 순서·견적·기존 시험 결과 | 사전 검토·설계 제안, 포팅 미착수 |
