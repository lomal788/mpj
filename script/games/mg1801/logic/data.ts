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
