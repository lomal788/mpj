/**
 * mg1801 상수표 — 원본 static 표와 Scene::Params 기본값. 근거는 docs/minigame/mg1801.md 4절.
 * 손으로 값을 바꾸지 않는다(원본에서 다시 뽑을 때만 고친다).
 */
import { F, f32FromBits } from '../../../core/fmath';

/** VEGETABLE_ID 순서 [데이터: Obj::ApplyCutBoneVisible::bone_vegetable_head_name] */
export const VEG_NAMES = ['tomato', 'potato', 'eggplant', 'carrot', 'mushroom'] as const;

/** 종류별 자르기 수 = 차지 레인 수 [데이터: ObjectManImpl::SetupPhase1::max_cut_counts @0x7100031690] */
export const MAX_CUT_COUNTS = [1, 2, 3, 4, 1] as const;

/** 등장 x 보정 [데이터: Obj::Entry::offsetX @0x71000316b8] */
export const OFFSET_X = [0, 1, 2, 3, 0] as const;

/** 종류마다 풀 크기 [판독: ObjectManImpl::SetupPhase1] */
export const POOL_PER_TYPE = 15;

/** 판정 뼈 이름 [데이터: bone_judge_name] */
export const JUDGE_NAMES = ['just', 'fast', 'slow'] as const;

/** 조각이 한꺼번에 떨어질 때(JUST 0개) [데이터: Obj::EntrySe::se_L_label] */
export const SE_L_LABEL = [
  'SQ_SE_MG1801_FOOD_FALL_WAT_SML',
  'SQ_SE_MG1801_FOOD_FALL_WAT_MDL',
  'SQ_SE_MG1801_FOOD_FALL_WAT_LRG',
  'SQ_SE_MG1801_FOOD_FALL_WAT_EXLRG',
  'SQ_SE_MG1801_FOOD_FALL_WAT_SML',
] as const;

/** 조각마다 떨어질 때 [데이터: Obj::EntrySe::se_S_label] */
export const SE_S_LABEL = [
  'SQ_SE_MG1801_FOOD_FALL_WAT_EXSML',
  'SQ_SE_MG1801_FOOD_FALL_WAT_SML',
  'SQ_SE_MG1801_FOOD_FALL_WAT_MDL',
  'SQ_SE_MG1801_FOOD_FALL_WAT_LRG',
  'SQ_SE_MG1801_FOOD_FALL_WAT_EXSML',
] as const;

/** 리듬 공용 박자 계수 [데이터: main @0x71015d8dc4] */
export const BEAT_SCALE = [1.0, 0.5, 0.5, 0.25, 0.25, 0.125].map(F);

/**
 * Scene::Params 기본값 [판독: Params::createInstance @0x710000e7e4]. 파일로 덮어쓰지 않는다(docs/minigame/mg1801.md 4.3).
 * cpuMiss 만 설정 패널에서 바꿀 수 있게 연다(원본 편집기 스위치, World 가 덮어쓴다).
 */
export const PARAMS = {
  chartNo: 0,
  isLineDraw: false,
  stopFrame: 10,
  isGenericBgm: false,
  rhythmNpcEnable: true,
  rhythmNpcMotNo: 0,
  cutRotEnable: true,
  cutRotSpeed: 90,
  justRangeFrame: 5,
  syncIdleMot: false,
  headLookWeight: F(0.3),
  acc: F(2.9),
  outlineAloneSize2: true,
  cpuMiss: false,
} as const;

export type Mg1801Params = { -readonly [K in keyof typeof PARAMS]: (typeof PARAMS)[K] extends boolean ? boolean : number };

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

/** 채보 한 줄의 박자 종류 [판독: RmSyncedSetupGame SetMainBeatType(1)] */
export const MAIN_BEAT_TYPE = 1;

/**
 * 칼 모션 길이(원본 프레임) — 22명 모두 rhy_knife_idle00 30프레임 루프, rhy_knife_swing00 20프레임 비루프
 * [데이터: chara~pcMot_rhy, docs/engine/09_character.md]. 재생 속도 BPM/120, IsFinished = 비루프에서 frame ≥ FrameMax [판독].
 */
export const IDLE_MOTION_FRAMES = 30;
export const SWING_MOTION_FRAMES = 20;

/**
 * rhy_knife_swing00 모션 FX 트리거: 2프레임 RC_RHY_KNIFE_SWING00 → SQ_SE_MG1801_SWING
 * [데이터: ui 담당 bq.nx.bea chara/pc/ftrgBase rc_pc_base.ftrg, docs/engine/05_ui_input.md]
 */
export const SWING_SE_FRAME = 2;

/**
 * 장면 흐름 앞부분 대기(원본 아님) — MinigameFlow 단계 1~7(장면 사운드 시작·페이드인·오프닝)을 지나 OnGameStartAfter 가 불릴 때까지.
 * 길이는 로딩·페이드·오프닝 객체에 따라 정해져 [미확정]이고, 줄–BGM 상대 시각에는 영향이 없다. 이 뒤의 단계 0~10 은 원본대로 돈다.
 */
export const PREROLL_FRAMES = 60;

/**
 * 흰 페이드(bq::WipeModule::FadeOut/FadeIn(1.0, WipeType 1 = "White")) 레이아웃 애니 길이
 * [데이터: bq_Parts wipe_WipeWhite_out / _in .bflan frameSize 20, 판독: FadeOut @0x710029c940 은 속도 1.0 으로 재생].
 * 레이아웃 1프레임 = 게임 1프레임으로 둔다 [추정].
 */
export const WIPE_WHITE_FRAMES = 20;

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
 * NPC HEYHO(npc002) 모션 길이(원본 프레임, FSKA FrameCount, 모두 루프) [데이터: chara~npc002 npc002_co_*.fskb, tools/bfres_probe].
 * 원본 ca::rm::util::SetModelMotionSpeedAdjustFromTime @0x7100438a40: 속도 = GetFrameMax / (시간·60).
 */
export const NPC_MOTION_FRAMES: Record<string, number> = { co_idle00: 180, co_joyful00: 40, co_joyful02: 60 };

/** MapImpl 의 "co_joyful00" 키에 붙는 파일 = joy_mot[Params.RhythmNpcMotNo] [데이터: mg1801 joy_mot @0x710003b0f0] */
export const NPC_JOY_MOT = ['co_joyful02', 'co_joyful00'] as const;

/**
 * 결과 카메라 위치 — FUN_7100446b60(결과 시작)이 플레이어 머리를 기본 레이어 카메라 위치(+0xB0)로 돌린다 [판독].
 * 그 시점 카메라는 채널(0,6)의 'result' 모션 = mg1801_cam02 (0,5.5,20) [데이터: docs/minigame/mg1801.md 7.4]. 적용 프레임 차이는 [근사].
 */
export const RESULT_CAMERA_POS = { x: 0, y: 5.5, z: 20 } as const;

/**
 * 결과 모션(파일 이름) — 결과 시작 FUN_7100447030 은 키 rm_co_idle00(파일 co_idle00)을 속도 1.0 으로,
 * 결과 점수판 직전 FUN_71004475d0 → FUN_7100446d90 은 별 판정 3 이면 co_win00a→b, 2 면 co_joy00a→b, 1 이하면 co_lose00a→b [판독][데이터: main 표 @0x71019f2210/0x71019f2258].
 * 코스 중간(RmGameWork+0x2C ≠ 0)·메들리 결과면 rc_pract_idle00(속도 GetPlayRate) [판독].
 */
export const RESULT_MOTIONS = { idle: 'co_idle00', win: 'co_win00a', joy: 'co_joy00a', lose: 'co_lose00a', pract: 'rc_pract_idle00' } as const;

/**
 * PlayerCharacterID 순서(= bq.nx.bea common/data/characterlist.json 배열) [판독+데이터: scene 담당, docs/engine/06_scene_data.md]
 */
export const PLAYER_CHARACTER_IDS = [
  'pc01', 'pc02', 'pc03', 'pc04', 'pc05', 'pc06', 'pc07', 'pc08', 'pc09', 'pc11', 'pc12',
  'pc13', 'pc14', 'pc50', 'pc51', 'pc52', 'pc53', 'pc54', 'pc56', 'pc58', 'pc61', 'pc62',
] as const;

/**
 * 의자 고르기 — 원본 Player::Player 가 마스크를 순서대로 검사(먼저 맞는 것) [판독: mg1801 @0x710000b130].
 * 의자 모델 stool_model_name[i] 와 플레이어 y(원본 비트 그대로 — 약 0.838 / 0.568 / 0.218). 맞는 마스크가 없으면 의자 없음, y = 0.
 */
export const STOOLS = [
  { mask: 0x32c180, model: 'mg/mg1801/model/mg1801_stool01.fmdb', y: f32FromBits(0x3f56872b) },
  { mask: 0x7f7c9d3, model: 'mg/mg1801/model/mg1801_stool02.fmdb', y: f32FromBits(0x3f116872) },
  { mask: 0x7ffdddf, model: 'mg/mg1801/model/mg1801_stool03.fmdb', y: f32FromBits(0x3e5f3b60) },
] as const;

/**
 * 시선 예외 — Player::Player @0x710000b608: KURIBO(pc51) 머리 끔·눈 켬, TERESA(pc58) 머리·눈 끔, 그 밖은 둘 다 켬
 * [판독, docs/minigame/mg1801.md 4.6]. 결과 시작 FUN_7100446b60 은 네 명 모두 머리 시선을 켠다.
 */
export const LOOK_EXCEPTIONS: Record<string, { head: boolean; eyes: boolean }> = {
  pc51: { head: false, eyes: true },
  pc58: { head: false, eyes: false },
};
