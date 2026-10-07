/**
 * 이름표 규칙(UiControlStatusName vt+0xc0 = main @0x71002a4a20)과 컨트롤러 아이콘 고르기(vt+0xb8 = main @0x710029265c).
 * 근거: docs/shell/setplayer.md 6.8·6.9.
 */
import type { PadType, SlotWork } from './types';

/**
 * 사람(또는 SessionState 2·3·4): 닉네임, 비면 im_guest00_name("게스트", 번호 없음).
 * COM: 닉네임, 비면 캐릭터 이름(vt+0xc8 [추정]).
 */
export function displayName(s: SlotWork, guest: string, charaName: (c: number) => string): string {
  const humanLike = s.type === 0 || s.session === 2 || s.session === 3 || s.session === 4;
  if (s.nickname !== '') return s.nickname;
  return humanLike ? guest : charaName(s.character);
}

/** PadType → sys_icon_hard_01 컨트롤 이름(5·6 은 세로 잡기 설정이면 V, 아니면 H) */
export function hardIcon(t: PadType, vertical = false): string {
  switch (t) {
    case 2:
      return 'FullKey';
    case 3:
      return 'Handheld';
    case 4:
      return 'Dual';
    case 5:
      return vertical ? 'JoyConV_Left' : 'JoyConH';
    case 6:
      return vertical ? 'JoyConV_Right' : 'JoyConH';
  }
}

/** 램프는 2·4·5·6 만(손에 든 본체 3 은 없음) */
export const hasLamp = (t: PadType): boolean => t !== 3;

/** Gamepad.id → PadType [설계 9.4] */
export function padTypeOfGamepad(id: string): PadType {
  if (/Joy-Con L\+R|Joy-Con \(L\/R\)/i.test(id)) return 4;
  if (/Joy-Con \(L\)/i.test(id)) return 5;
  if (/Joy-Con \(R\)/i.test(id)) return 6;
  return 2;
}
