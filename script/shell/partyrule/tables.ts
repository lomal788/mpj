/**
 * 파티 규칙 화면 표·상수 — docs/shell/partyrule.md 4.2·4.3·4.4·4.5·6.4 (menu01.nro 데이터·판독).
 */
import type { PartyRuleConfig } from './types';

/** 행 부품 표 @0x71001929b0 */
export const MEMBER_ROW = ['x_parts_list/x_btn_cpu', 'x_parts_list/x_btn_level', 'x_parts_list/x_btn_speed', 'x_parts_list/x_btn_handicap'] as const;
/** 행 설명 라벨(+0xc8·+0xe0·+0xf8·+0x110) */
export const MEMBER_ROW_LABEL = ['mn01_bd_mw_member_chara', 'mn01_bd_mw_member_level', 'mn01_bd_mw_member_speed', 'mn01_bd_mw_member_handi'] as const;
/** 창 크기 애니 @0x7100192998: rowCount 2·3·4, 그 밖 normal_03 */
export const listAnim = (rowCount: number): string => (rowCount >= 2 && rowCount <= 4 ? ['normal_02', 'normal_01', 'normal_00'][rowCount - 2] : 'normal_03');

export const COM_LEVEL_LABEL = ['im_comLevel00', 'im_comLevel01', 'im_comLevel02', 'im_comLevel03'] as const;
export const SPEED_LABEL = { normal: 'im_mn_com_speed_normal', quick: 'im_mn_com_speed_quick' } as const;

/** TURN 번호 → 턴 수(표 @0x7100163414) */
export const TURN_VALUE = [10, 15, 20, 25, 30, 12] as const;
/** SetupTurn 표시 칸(턴 표 @0x7100163310 / 분 표 @0x7100163328) */
export const CHECK_TURN = [10, 15, 20, 25, 30, 12] as const;
export const CHECK_MINUTES = [90, 120, 150, 180, 210, 100] as const;

/** SetupTurn 의 분기(@0x71000650b0, 바이트 표 @0x71001632f8): 턴 수 → 표시 칸, 표에 없으면 1 */
export function checkTurnIndex(turnMax: number): number {
  switch (turnMax) {
    case 10:
      return 0;
    case 12:
      return 5;
    case 20:
      return 2;
    case 25:
      return 3;
    case 30:
      return 4;
    default:
      return 1;
  }
}

/** SettingRule::Start: TurnMax → TURN 번호(목록에 없으면 SetTurn 이 첫 칸으로) */
export function turnIndex(turnMax: number): number {
  const i = (TURN_VALUE as readonly number[]).indexOf(turnMax);
  return i;
}

/** 보너스 번호 → BonusStarType(표 @0x7100163408), 역표 @0x7100163448 */
export const BONUS_TYPE = [1, 2, 0] as const;
export const BONUS_INDEX = [2, 0, 1] as const;

/** 규칙 확인 행 부품 표(@0x7100191a68·a90·ab8·ae0) */
export const CHECK_TITLE = (i: number): string => `x_parts_win/x_parts_title_0${i}/x_text_title`;
export const CHECK_ICON = (i: number): string => `x_parts_win/x_parts_title_0${i}/x_icon`;
export const CHECK_NEW = (i: number): string => `x_parts_win/x_parts_title_0${i}/x_parts_new`;
export const CHECK_SET = (i: number): string => `x_parts_win/x_parts_set_0${i}/x_text_set`;
/** 판 높이 애니 @0x7100163340 */
export const checkWinAnim = (n: number): string | null => (n >= 3 && n <= 5 ? `normal_${n}` : null);

/** 플레이 방법 설정 행: 버튼·커서·그림 이름(Button::GetPartsName·GetCursorName·GetIconName) */
export const RULE_SET = (i: number): string => `x_parts_win/x_parts_set_0${i}`;
export const RULE_CURSOR = (i: number): string => `x_parts_win/x_parts_set_0${i}/x_parts_cursor_00`;
export const RULE_PICT = (i: number): string => `x_parts_win/x_parts_pict_0${i}`;
export const RULE_NEW = (i: number): string => `x_parts_win/x_parts_set_0${i}/x_parts_new`;
/** 행 제목 라벨(ctor @0x710007df20) */
export const RULE_TITLE = ['mn01_bd_ui_detail_turnTitle', 'mn01_bd_ui_detail_bonusTitle', 'mn01_bd_ui_detail_instTitle', 'mn01_bd_ui_detail_gyroTitle', 'mn01_bd_ui_detail_decideTitle'] as const;
/** 행 아이콘 텍스처(ctor CreateTexture) */
export const RULE_ICON = ['mn01_icon_timer_00^q', 'mn01_icon_star_00^q', 'mn01_icon_balloon_00^q', 'mn01_icon_feel_00^q', 'mn01_icon_mg_00^q'] as const;

/** 보드 이름 라벨(BoardItemParam imNameLabel) */
export const BOARD_NAME = ['im_bd01_name', 'im_bd02_name', 'im_bd03_name', 'im_bd04_name', 'im_bd05_name', 'im_bd06_name', 'im_bd07_name'] as const;

/** 입력 비트(05_ui_input) */
export const BIT = { A: 0x1, B: 0x2, X: 0x8, UP: 0x20800, DOWN: 0x80400, LEFT: 0x10100, RIGHT: 0x40200, VERT: 0xa0c00 } as const;

/** 위·아래 반복 입력 마스크(반대 방향 홀드 중이면 십자키 비트만) */
export function upMask(hold: number): number {
  return hold & 0x400 ? 0x800 : 0x20800;
}
export function downMask(hold: number): number {
  return hold & 0x800 ? 0x400 : 0x80400;
}
export function leftMask(hold: number): number {
  return hold & 0x200 ? 0x100 : 0x10100;
}
export function rightMask(hold: number): number {
  return hold & 0x100 ? 0x200 : 0x40200;
}

/** C 의 (a % b) (음수면 음수) */
export const cmod = (a: number, b: number): number => a % b;

/** 시험 기본값(partyrule.md 9.3 [설계]): 캡처 두 장의 표시 */
export function defaultConfig(humans = 3, charas: readonly string[] = ['pc06', 'pc61', 'pc51', 'pc01']): PartyRuleConfig {
  const players = [0, 1, 2, 3].map((i) => ({ chara: charas[i] ?? 'pc01', com: i >= humans, level: 1, handicap: 0 }));
  return {
    players,
    flag4: true,
    flag6: true,
    flag7: false,
    flag8: false,
    turnMax: 10,
    bonusType: 1,
    boardId: 6,
    boardMode: 0,
    gameFlag20: false,
    gameFlag22: false,
    saveFlags: new Set(),
    menuLevel: players.map((p) => p.level),
    menuSpeed: false,
    menuInst: true,
    menuGyro: true,
  };
}
