/**
 * 리듬 공용 상수표 — 원본 main ca::rm static 표·기본값과 웹 대리 길이. 근거는 docs/engine/02_rhythm.md(14절 = 웹 공용 모듈).
 * 손으로 값을 바꾸지 않는다(원본에서 다시 뽑을 때만 고친다). 이 폴더는 import 0 이라 f32·60fps 도구도 여기 둔다(값은 core/fmath·core/clock 과 같다).
 */

/** f32 자르기(core/fmath F 와 같음) */
export const F = Math.fround;

/** 원본 RmMgSceneBase 생성자가 고정 60fps 를 강제한다 [판독: 02_rhythm.md 3.1] — core/clock FPS 와 같음 */
export const RM_FPS = 60;

/** 원본 bex::MainModule::GetDeltaTime — 리듬 장면은 고정 f32(1/60) [판독: docs/engine/01_core.md] (core/clock FRAME_DT 와 비트 일치) */
export const RM_DT = F(1 / RM_FPS);

/** 리듬 공용 박자 계수 [데이터: main @0x71015d8dc4] */
export const BEAT_SCALE = [1.0, 0.5, 0.5, 0.25, 0.25, 0.125].map(F);

/** 박자 종류별 마디당 상태 수 [데이터: main @0x71015d8eb0] */
export const BEATS_PER_BAR = [4, 8, 8, 16, 16, 32] as const;

/**
 * BPM — 원본 RmGameWork::GetBpm(). RmGameWork 생성 기본값 120 이고, 단독·파티·미니게임 모드에서는 아무도 SetBpm 을 부르지 않는다
 * [판독: analysis/notes/mg1801_rhythm.md 2절]. 리듬 쿠킹 롱 모드 후반만 RC_SPEEDUP_BPM.
 */
export const BPM = 120;

/**
 * 리듬 쿠킹 롱 모드 후반 BPM — rc_stage01 Params speedup_bpm 기본 180 [판독: rc_stage01 Params::createInstance @0x710002ba34].
 * rc_stage01::Scene::SettingBpm @0x710002c564: 모드 1 이고 코스 index ≥ 코스 수/2(0 쪽 절삭) 일 때만 SetBpm(speedup_bpm).
 */
export const RC_SPEEDUP_BPM = 180;

/**
 * 흰 페이드(bq::WipeModule::FadeOut/FadeIn(1.0, WipeType 1 = "White")) 레이아웃 애니 길이
 * [데이터: bq_Parts wipe_WipeWhite_out / _in .bflan frameSize 20, 판독: FadeOut @0x710029c940 은 속도 1.0 으로 재생].
 * 레이아웃 1프레임 = 게임 1프레임으로 둔다 [추정].
 */
export const WIPE_WHITE_FRAMES = 20;

/** 와이프 종류 White — bq::WipeModule 종류 1(lib/transition WIPE_WHITE 와 같은 값, docs/engine/15_transition.md) */
export const RM_WIPE_WHITE = 1;

/**
 * 결과 연출 객체(RmMgSceneBase+0x358) 갱신 람다 @0x7100447d10: 결과 징글 뒤 0.5/GetPlayRate() 초가 지나면
 * 승패 모션(FUN_71004475d0)과 결과 점수판(FUN_7100448610)을 낸다 [판독]. 웹은 이 결과 점수판부터를 자기 결과 화면으로 대신한다.
 */
export const RESULT_PANEL_DELAY_BEATS = 0.5;
/**
 * 결과 점수판 람다(@0x71004495f0) 길이: 상태 0·1 0.5 초 → 상태 2 한 프레임(FUN_71003b1540) → 상태 3 0.5 초 → 상태 4 3.0 초 뒤 끝(+0x48 = 1).
 * 타이머는 dt 누적(PlayRate 무관) [판독, ui.ts 머리 주석]. 웹은 프레임 수로 센다 — f32 누적 문턱의 ±1 프레임은 [근사]
 */
export const RESULT_PANEL_FRAMES = 30 + 1 + 30 + 180;

/**
 * 결과 모션(파일 이름) — 결과 시작 FUN_7100447030 은 키 rm_co_idle00(파일 co_idle00)을 속도 1.0 으로,
 * 결과 점수판 직전 FUN_71004475d0 → FUN_7100446d90 은 별 판정 3 이면 co_win00a→b, 2 면 co_joy00a→b, 1 이하면 co_lose00a→b [판독][데이터: main 표 @0x71019f2210/0x71019f2258].
 * 코스 중간(RmGameWork+0x2C ≠ 0)·메들리 결과면 rc_pract_idle00(속도 GetPlayRate) [판독].
 */
export const RESULT_MOTIONS = { idle: 'co_idle00', win: 'co_win00a', joy: 'co_joy00a', lose: 'co_lose00a', pract: 'rc_pract_idle00' } as const;

/**
 * SQ_BGM_RC_CALIBRATION 핸들 수명 — 단계 1 은 핸들이 죽었을 때만 다시 재생한다. 시퀀스 길이 6.0 s(BPM 120 렌더)
 * [데이터: extracted/audio/mg1801/seq/SQ_BGM_RC_CALIBRATION.wav, 렌더 근사].
 */
export const CALIBRATION_FRAMES = 360;
