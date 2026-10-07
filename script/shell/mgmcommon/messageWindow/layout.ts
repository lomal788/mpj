/**
 * 메시지 창 배치(순수) — 레이아웃 고르기·SetPlace·페이지 오프셋 (docs/shell/message_window.md 6.1·4.2).
 */
import type { MeswinData, MsgAttr } from '../types';

/** PositionData 이름 → 번호(Top_Left 0 … Bottom_Right 8, Default 9) */
export const PLACE: Readonly<Record<string, number>> = {
  Top_Left: 0,
  Top_Center: 1,
  Top_Right: 2,
  Center_Left: 3,
  Center_Center: 4,
  Center_Right: 5,
  Bottom_Left: 6,
  Bottom_Center: 7,
  Bottom_Right: 8,
  Default: 9,
};

/** 표 @0x71015d76a4: 배치 번호 → (가로 0 왼·1 가운데·2 오른, 세로 3 위·1 가운데·4 아래) */
const PLACE_AXES: readonly [number, number][] = [
  [0, 3],
  [1, 3],
  [2, 3],
  [0, 1],
  [1, 1],
  [2, 1],
  [0, 4],
  [1, 4],
  [2, 4],
];

/** ComUiBase::SetPlace(p): 경계 페인(x_bd_00) 크기 W×H·위치 (bx, by) 기준 레이아웃 이동량 */
export function setPlace(p: number, bd: { w: number; h: number; x: number; y: number }, screen: [number, number] = [1920, 1080]): [number, number] {
  const ax = PLACE_AXES[p];
  if (!ax) return [0, 0];
  const x = ax[0] === 0 ? -(screen[0] - bd.w) / 2 - bd.x : ax[0] === 2 ? (screen[0] - bd.w) / 2 - bd.x : 0;
  const y = ax[1] === 3 ? (screen[1] - bd.h) / 2 - bd.y : ax[1] === 4 ? -(screen[1] - bd.h) / 2 - bd.y : 0;
  return [x, y];
}

export const WINDOW_TYPE: Readonly<Record<string, number>> = { Normal: 0, NormalSmall: 1, Name: 2, NoneChara: 3, Talking: 4, Announce: 5, Subtitle: 6, Model: 7 };

export interface PageLayout {
  /** ATR WindowType 번호(WindowData 칸) */
  wt: number;
  /** 창 형식 번호(+0x80) */
  type: number;
  layout: string;
  /** 배치 번호(Default 면 창 형식 기본 위치, Talking 제외) */
  place: number;
  chara: MeswinData['chara'][number] | null;
  /** 페이지 오프셋(ATR OffsetX/Y, SetOffset 값이 0 이 아니면 그것) */
  offset: [number, number];
}

const EMPTY_ATTR: MsgAttr = { wt: 0, ch: 0, pos: 0, ox: 0, oy: 0, emo: 0, wi: 0 };

/** FUN_710031a480 + FUN_7100315fe0 의 배치 고르기. 선택형이면 WindowData Layout01(partyrule.md 6.2) */
export function pageLayout(meswin: MeswinData, attr: MsgAttr | undefined, userOffset: [number, number, number], choice = false): PageLayout {
  const a = attr ?? EMPTY_ATTR;
  const w = meswin.window[a.wt] ?? meswin.window[0];
  const type = WINDOW_TYPE[w.type] ?? 0;
  const posName = meswin.attrLists.Position[a.pos] ?? 'Default';
  let place = PLACE[posName] ?? 9;
  if (place === 9 && type !== WINDOW_TYPE.Talking) place = PLACE[w.pos] ?? 1;
  const chara = a.ch > 0 ? (meswin.chara[a.ch] ?? null) : null;
  const offset: [number, number] = userOffset[0] !== 0 || userOffset[1] !== 0 ? [userOffset[0], userOffset[1]] : [a.ox, a.oy];
  return { wt: a.wt, type, layout: choice && w.layoutChoice ? w.layoutChoice : w.layout, place, chara, offset };
}
