/**
 * 미니게임 항구(mgmet) 데이터 표 — 액티비티 ID·제목·다음 모드·시작 지점(mgmet_flow.md 4.2), 앞 안내·설명 페이지(7.2), 규칙 열·값·문구(mgmet_ruleconfig.md 4·7), 정렬(ui2d_alignment.md 6.4).
 * [추정]·[설계] 표시는 docs/shell/mgmet_flow.md 9.1·mgmet_ruleconfig.md 9.1 에 적었다.
 */
import type { AlignParams } from '../mgmcommon/alignment';

export interface Activity {
  id: number;
  /** 제목 표 mgmet @0x71000fe058 */
  title: string;
  /** SetNextMGMode 표 mgmet @0x71000e3658 → MinigameModeID */
  nextMode: number;
  /** 직접 진입 시작 지점 */
  startPoint: number;
  /** 앞 안내 표 mgmet @0x71000e3700 */
  guide: string;
}

export const ACTIVITIES: readonly Activity[] = [
  { id: 0, title: 'im_mode13_name', nextMode: 4, startPoint: 4, guide: 'mgm04_ent_mw_guide00' },
  { id: 1, title: 'im_mode12_name', nextMode: 3, startPoint: 3, guide: 'mgm03_ent_mw_guide00' },
  { id: 2, title: 'im_mode10_name', nextMode: 1, startPoint: 1, guide: 'mgm01_ent_mw_guide00' },
  { id: 3, title: 'im_mode14_name', nextMode: 5, startPoint: 5, guide: 'mgm05_ent_mw_guide00' },
  { id: 4, title: 'im_mode11_name', nextMode: 2, startPoint: 2, guide: 'mgm02_ent_mw_guide00' },
  { id: 5, title: 'im_mode09_name', nextMode: 6, startPoint: 6, guide: 'mgm06_ent_mw_guide00' },
];

export const FREEPLAY_ID = 2;
export const ACTIVITY_MAX = 5;
export const BOSS_ID = 4;

/** GetModeIDFromNumber 표 mgmet @0x71000e368c */
export const MODE_ID_FROM_NUMBER: readonly number[] = [2, 4, 1, 0, 3, 5];
/** Scene +0x344 생성자 값(위치 복원 모드 번호) */
export const RESTORE_MODE_NUMBER: readonly number[] = [4, 3, 1, 5, 2, 6];

/** GetModeIDFromMGMWorkStartPoint mgmet @0x710004c30c: 2~6 → 표 mgmet @0x71000e36a4, 그 밖 2 */
export function idFromStartPoint(sp: number): number {
  return sp >= 2 && sp <= 6 ? [4, 1, 0, 3, 5][sp - 2] : FREEPLAY_ID;
}

/** GetAndResetStartMode mgmet @0x710004a294 의 보정(flag 0x3d·보스 미개방) */
export function adjustStartPoint(sp: number, flag3d: boolean, bossOpen: boolean): number {
  let v = sp;
  if (flag3d) {
    if (v >= 7 && v <= 11) v -= 6;
    else if (v === 12) v = 6;
  }
  if (!bossOpen && (v === 6 || v === 12)) v = 1;
  return v;
}

/** 첫 인사 / 재방문 인사(mgmet_flow.md 7.2), Text0 = im_mode03_name */
export const GREETING_FIRST: readonly string[] = ['mgmet_entFirst_mw_guide00', 'mgmet_entFirst_mw_guide01', 'mgmet_entFirst_mw_guide02'];
export const GREETING_AGAIN: readonly string[] = ['mgmet_entAgain_mw_guide00'];
export const HUB_NAME = 'im_mode03_name';
/** ConfirmReturnSceneFlow 문구 [판독: 어셈블리 mgmet @0x710005a07c·0x710005a0e0·0x710005a120, dialog_box.md 6.3] */
export const EXIT_CONFIRM = { label: 'mgmet_back_mw_guide', yes: 'mgmet_back_mw_guide_a0', no: 'mgmet_back_mw_guide_a1' } as const;

export interface HowtoKind {
  /** HowtoPlay Setup 첫 인자(Impl+0x58) */
  kind: number;
  /** 페이지 메시지 접두(+ %02d) */
  message: string;
  /** 페이지 그림 접두(+ _%02d^o) */
  pict: string;
  pages: number;
  /** 페이지별로 보일 정보 페인(나머지는 숨김) */
  panes: readonly (string | null)[];
}

/** 프리 플레이 1 = [판독][데이터](mgmet_flow.md 6.2). 나머지 = 라벨 접두·그림 수 대응 [추정], 정보 페인 없음 */
export const HOWTO_KINDS: readonly HowtoKind[] = [
  { kind: 1, message: 'mgmet_fp_mw_howToPlay', pict: 'mgmet_pict_free', pages: 3, panes: [null, 'x_free_00', 'x_free_01'] },
  { kind: 2, message: 'mgmet_cmgb_mw_howToPlay', pict: 'mgmet_pict_chal', pages: 3, panes: [null, null, null] },
  { kind: 3, message: 'mgmet_dt_mw_howToPlay', pict: 'mgmet_pict_daily', pages: 3, panes: [null, null, null] },
  { kind: 4, message: 'mgmet_tm_mw_howToPlay', pict: 'mgmet_pict_tag', pages: 3, panes: [null, null, null] },
  { kind: 5, message: 'mgmet_sb_mw_howToPlay', pict: 'mgmet_pict_surv', pages: 4, panes: [null, null, null, null] },
  { kind: 6, message: 'mgmet_bm_mw_howToPlay', pict: 'mgmet_pict_boss', pages: 3, panes: [null, null, null] },
];
export const HOWTO_INFO_PANES: readonly string[] = ['x_chal_00', 'x_free_00', 'x_free_01'];
export const HOWTO_PANE_TEXT: Readonly<Record<string, [string, string]>> = {
  x_free_00: ['x_free_00/x_text_free_00', 'mgmet_ui_act01'],
  x_free_01: ['x_free_01/x_text_free_01', 'mgmet_ui_act02'],
};

export function howtoKind(kind: number): HowtoKind {
  return HOWTO_KINDS.find((k) => k.kind === kind) ?? HOWTO_KINDS[0];
}

/** 규칙 열 번호(RuleType) */
export const COL = { VS: 0, ROUND: 1, STAR: 2, CPU: 3, EXPLAIN: 4, EXPERIENCE: 5, PLAY: 6 } as const;
export const COL_PANES: readonly string[] = ['x_rule_00', 'x_rule_01', 'x_rule_02', 'x_rule_03', 'x_rule_04', 'x_rule_05', 'x_play_00'];
/** 버튼 index 최대(값 표 길이 − 1) */
export const COL_MAX: readonly number[] = [2, 2, 2, 3, 1, 1, 0];
/** VS 표 mgmet @0x71000e3790 */
export const VS_TABLE: readonly (readonly number[])[] = [
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [0, 3, 1, 2],
];
/** Round 표 mgmet @0x71000e37c0, Star 표 mgmet @0x71000e37cc */
export const ROUND_VALUES: readonly number[] = [5, 7, 10];
export const STAR_VALUES: readonly number[] = [3, 5, 10];
/** CPU 표 mgmet @0x71000e37d8 */
export const CPU_LEVELS: readonly string[] = ['im_comLevel00', 'im_comLevel01', 'im_comLevel02', 'im_comLevel03'];
export const EXPLAIN_LABELS: readonly string[] = ['mgmet_rule_ui_explain00', 'mgmet_rule_ui_explain01'];
export const EXPERIENCE_LABELS: readonly string[] = ['mgmet_rule_ui_bodilyMg00', 'mgmet_rule_ui_bodilyMg01'];

/** 열 제목 라벨(7.2) → 제목 페인(부품 안, y +76 글자 [추정: 레이아웃 위치]) */
export const COL_TITLE: readonly ([string, string] | null)[] = [
  ['x_vs_00', 'mgmet_rule_ui_team'],
  ['x_text_round_01', 'mgmet_rule_ui_round01'],
  ['x_text_win_01', 'mgmet_rule_ui_wincount01'],
  ['x_text_cpu_00', 'mgmet_rule_ui_cpulevel01'],
  ['x_text_explain_00', 'mgmet_rule_ui_explain02'],
  ['x_text_mg_01', 'mgmet_rule_ui_bodilyMg02'],
  null,
];
/** SetVisibleOption01: 열1~4 공통 option01 의 내용 페인 */
export const OPTION01_CONTENT: Readonly<Record<number, string>> = { 1: 'x_rule_round', 2: 'x_rule_win', 3: 'x_rule_cpu', 4: 'x_rule_explain' };
export const OPTION01_ALL = ['x_rule_round', 'x_rule_win', 'x_rule_cpu', 'x_rule_explain'];

/** A_alignment_00 ali1 추가 바이트 02000000 000096c2 00000000 = kind 2·gap −75·stretch 0, 수평(ui2d_alignment.md 6.4) */
export const RULE_ALIGNMENT: AlignParams = { horizontal: true, kind: 2, gap: -75, stretch: false };
/** SetupBaseBg N ≥ 5 일 때 null_01 x(float32 0xc4548000) */
export const BASE_BG_WIDE_X = -850;

/** 입력 비트(mgm_common.md 6.10) */
export const BIT = {
  A: 0x1,
  B: 0x2,
  BTN4: 0x4,
  BTN8: 0x8,
  LR_LEFT: 0x50,
  LR_RIGHT: 0xa0,
  UP: 0x800,
  DOWN: 0x400,
  LEFT: 0x100,
  RIGHT: 0x200,
  S_UP: 0x20000,
  S_DOWN: 0x80000,
  S_LEFT: 0x10000,
  S_RIGHT: 0x40000,
} as const;

/** mgmet::Input::GetInputVec mgmet @0x710007d060: 1 위 2 아래 3 왼 4 오른, 0 없음 */
export function inputVec(trig: number, rep: number): number {
  const tr = trig | rep;
  if (tr & BIT.UP) return 1;
  if (tr & BIT.DOWN) return 2;
  if (tr & BIT.LEFT) return 3;
  if (tr & BIT.RIGHT) return 4;
  if (trig & BIT.S_UP) return 1;
  if (trig & BIT.S_DOWN) return 2;
  if (trig & BIT.S_LEFT) return 3;
  if (trig & BIT.S_RIGHT) return 4;
  return 0;
}

export const SE = {
  CURSOR: 'SQ_SE_SYS_CURSOR',
  CURSOR_S: 'SQ_SE_SYS_CURSOR_S',
  DECI: 'SQ_SE_SYS_DECI',
  DECI_L: 'SQ_SE_SYS_DECI_L',
  CANCEL: 'SQ_SE_SYS_CANCEL',
  MES_PROC: 'SQ_SE_SYS_MES_PROC',
  SKIP: 'SQ_SE_SYS_SKIP',
} as const;
