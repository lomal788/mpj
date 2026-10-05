# 웹 포팅 진행 현황과 남은 작업

2026-10-02 기준.

## 1. 현재 상태

| 항목 | 상태 | 근거 |
|---|---|---|
| 페이지·루프·게임 계약 | 완료 | `npm run typecheck` 통과 |
| esbuild 개발 서버 | 완료 | `tools/serve.ts` 기동, index·bundle 200 응답 확인 |
| 배포 빌드 | 완료 | `npm run build` → dist/ (main.js 562KB) |
| 스모크 | 완료 | `npm run smoke` 통과(index, 콘솔 오류 없음) |
| 게임 | mg1801 원본 모델·원본 로직(모드 4종) | 아래 표 |

| 게임 | 분석 | 구현 | 대조 |
|---|---|---|---|
| mg1801 싹둑싹둑 수프 | 진행 — 게임 로직 판독·재구현 계산 완료, 미확정 11항 ([docs/minigame/mg1801.md](docs/minigame/mg1801.md)) | **회색 박스** — 로직·단계·점수 원본 판독대로, 카메라 원본 값, 소리 원본 렌더·디코드, 모델은 상자 | 노드 시험 13항 통과(`tools/test_mg1801.ts`, 재구현 계산 수준: 줄 시각·종료 BGM 40 s·점수·별 판정 포함), 스모크 통과. 원본 실행 대조 없음 |

### mg1801 회색 박스에서 원본과 다른 점 (2026-10-02 갱신)

| 항목 | 지금 | 근거·남은 것 |
|---|---|---|
| 장면 단계 | 원본 OnGameMain 단계 0~10 전부(단계 0~1 = 박 조건, 미니게임 모드는 와이프 없음), goto 같은 프레임 이어 실행, 결과 흐름(흰 페이드아웃 20f → (0,6) → 페이드인·프리셋 → 앰비언트 생략 조건·환호 → 징글 → 승패 모션) | [판독]. 남음: OnGameStartAfter 전 MinigameFlow 길이(`PREROLL_FRAMES` 60) |
| BPM | **120 확정** | [판독] RmGameWork 기본값 |
| 박자 시계 | 원본 구조(사운드 → 게임): 페이지가 매 스텝 "지금 들리는 오디오 시각"의 시퀀서 전역 변수(G12·G13·G14, BGM L0)를 `view.observe()` 로 읽어 `logic.step(pads, sound)` 에 넘긴다. 관측이 없으면(노드·무음) 프레임 모델 — 결과는 수정 전과 바이트 단위로 같다. 루프는 rAF 당 최대 120 스텝 따라잡기, 5 s 넘게 밀릴 때만 버림, 탭 숨김 때 AudioContext 정지 | 측정(tools/sync_measure.ts): 수정 전 로직이 소리보다 +0.6~0.7 s 늦고 부하 때 한 마디(1.9 s) 어긋남 → 수정 후 τ 기준 16 ms 이내. 근사: 출력 지연 보정(원본에 없음, `?avlat=raw` 로 끔), 시퀀서가 메인 스레드(렌더 멈춤 때 킥·효과음 지연), 원본 관측 지연 미확정 |
| 파이버 순서 | Object → Player → 장면 흐름 | [판독] |
| 난수 | 원본 MT19937 | [판독] 벡터 일치 |
| 점수·별 판정 | JUST 2 / FAST·SLOW 1, 달성률 ≥80·≥40·>0 → 별 3·2·1 = 결과 수프 번호 | [판독]. 시험: 전원 CPU 100% → 3 |
| 휘두름 입력 | A 버튼(키보드 J) = 휘두름. 가속도가 들어오면 원본 식 | 원본은 세로 Joy-Con R(ControllerID 16) |
| 외곽선 안내 | 원본 UpdateOutlineOnOff(레인 점유) 그대로, OBJ1 'L' && 모드<2, 화면 (x,1.5,0) | [판독] |
| 모드·난이도 | 설정 패널·URL `?mode=0/1/2/3`, `course`, `longPos`(롱 후반 BPM 180), `cpuMiss`. 채보·BGM·종료 BGM 원본 규칙 | CPU 강도(ComLevel)는 원본에서 mg1801 에 영향 없음 [판독] |
| 칼 모션 | 원본 rhy_knife_idle00 30프레임 반복, rhy_knife_swing00 20프레임 1회, 속도 BPM/120, SWING SE 모션 2프레임 | [데이터][판독] 09_character, mg1801.md 7.1 |
| 화면 | **원본 모델·원본 렌더 설정**: 무대 bg00·floor00·water00, 의자, 칼, 채소 본체+조각(원본 CutObj 훅·판정 뼈), 외곽선(ObjView.outline, (x,1.5,0)), 결과 result00·soup·결과 위치(attach_pc0i). 카메라 loop/result/capture(view/camera.ts, fovy = 세로 전체각 판독). 조명: 평행광 원본 색·방향, 재질 extras 대로 그림자 송수신·평행광 끄기, 라이트맵(gi_diffuse, UV1), IBL 배경 bg00 / 캐릭터 cha / 재질별 local cube 분리. 포스트(post.ts): HDR → DOF → 블룸 → 톤맵 → FXAA, 결과에서 post_result00. 수면 water.ts(fmab 프레임 적용). 마리오 몸 UV·눈동자(character.ts). 이펙트 effects.ts | 근사: 평행광·라이트맵 광량 단위(π 관례), 그림자 단일 맵 PCF·bias, 톤맵 곡선(Neutral 선택), 블룸 spread/clip·DOF 해석, 수면 셰이더 그래프 식, 큐브 면 순서·ibl_type 대응 [추정], 원본 툰 외곽선·BRDF 없음. 이펙트 근사는 effects.ts 머리 주석. 진행 중: 캐릭터 22종·NPC HEYHO, 원본 UI 레이아웃 |
| 소리 | BGM·종료·INTER_END·범용·리믹스·CALIBRATION = BPM 120·180 별 렌더(`sound/bgm/`), 스트림(앰비언트·징글) 원본 디코드, 효과음 = 원본 FSEQ 실시간 시퀀서(`script/view/seq.ts`, 파이썬 렌더와 상관 1.0000) — JUST_SOUND G8 64종·L0 전 단계 이어 재생, 환호 L5 분기, 물보라 피치·볼륨 무작위. 볼륨 체인·3D(리스너·panRange)·프리셋 치환·soundStop 라벨별 [판독] | 근사: BGM 은 자체 렌더(원본 녹음 상관 0.970), LFO·lpf·biquad·리버브(EFFECT_COMMON_ROOM_00 정의 없음) 미적용, 무작위는 Math.random. 마스터 `SQ_BGM_RC_MAIN_RHYTHM`·오프닝 `MGCMN_OP` 는 실시간 시퀀서로 G13/G12/G10 핸드셰이크(킥이 게임 BGM 마디부터 쉼, OP VOLOFF, BGM wav 는 G12 시각에 출발). 없음: 캐릭터 보이스(원본 프리셋이 MUTE) |
| UI | 원본 레이아웃 재생기(`script/view/lyt.ts`): 판정 텔롭 mg1800_tlp_*("빠름/느림/정확"), START/FINISH, 점수 게이지 mg1800_score_00, PERFECT, 원본 폰트(FFNT·bqfont_telop), 진동 원본 bnvib 파형 | 근사: 재질 색 합성·9-slice 해석·OTF 비율, 단일 줄 글자. 결과 점수판(mg1800_free_result_*, 얼굴 22명, 개인 달성·별 세기, 점수판 람다 끝까지 결과 장면 유지 241프레임), 연습 화살표 3D, PERFECT 이펙트 mg_common_pt_effect_00. 근사: 점수판 상태 시점 ±1프레임, 얼굴 재질 texgen·마스크 합성 |
