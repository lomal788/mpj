/**
 * 플레이어 설정 흐름(bq::ComUiSettingPlayer) 공개 형식 — 시작 인자·플레이어 칸·결과 계약·시스템 애플릿 대체 어댑터.
 * 근거: docs/shell/setplayer.md 3.2·4·9.3. 레이아웃 명세는 mgmcommon MgmSpecPart 형식(assets/setplayer/setplayer.json).
 */

/** Start(StartArg) — setplayer.md 3.2 */
export interface SetPlayerStartArg {
  /** +0xf0 처음 인원 */
  initial: number;
  /** +0xf4 최소 인원 */
  min: number;
  /** +0xf8 최대 인원 */
  max: number;
  /** +0xfc 배경(sys_bg_set_00) */
  withBg: boolean;
  /** +0xfd 끝에 캐릭터 선택으로 */
  toCharSelect: boolean;
  /** +0xfe 인원 단계 B(뒤로) 허용 */
  cancelable: boolean;
}

/** menu01 SequenceModeSelect::MapMenuImpl·BinocularMenuImpl 의 인자(처음 = 지금 사람 수) [판독] */
export const mapMenuArg = (humans: number): SetPlayerStartArg => ({ initial: humans, min: 1, max: 4, withBg: true, toCharSelect: true, cancelable: false });
/** menu01 SequenceStartPaMode::CheckPlayerCountImpl 의 인자 [판독] */
export const PA_MODE_ARG: SetPlayerStartArg = { initial: 1, min: 1, max: 2, withBg: true, toCharSelect: false, cancelable: true };

/** bex::InputModule::GetPadType 값(setplayer.md 6.9): 2 FullKey, 3 Handheld, 4 Joy-Con 두 짝, 5 왼쪽 한 짝, 6 오른쪽 한 짝 */
export type PadType = 2 | 3 | 4 | 5 | 6;

/** 웹 컨트롤러(키보드 1개 + Gamepad API 패드) [설계 9.4] */
export interface Controller {
  id: string;
  kind: 'keyboard' | 'gamepad';
  padType: PadType;
  /** 본체 색(#rrggbb) — 두 짝이면 [왼, 오른] */
  colors?: string[];
}

/** 플레이어 칸(원본 PlayerWork 중 이 흐름이 쓰는 필드, setplayer.md 4절) */
export interface SlotWork {
  pid: number;
  /** PlayerType: 0 사람, 1 COM */
  type: 0 | 1;
  character: number;
  baseCharacter: number;
  nickname: string;
  /** ManageIdx: −1 = 게스트(계정 연동 없음) */
  manageIdx: number;
  /** AccountID 대역(연동 계정 식별) */
  uid: string;
  /** SessionState(오프라인 0) */
  session: number;
}

export interface SetPlayerSlot {
  pid: number;
  type: 'human' | 'com';
  controller: string | null;
  padType: PadType | null;
  nickname: string;
  linked: boolean;
  /** 이름표 글자(setplayer.md 6.8) */
  displayName: string;
  character: number;
}

/** 결과 계약(setplayer.md 9.3) → 캐릭터 선택 runCharSelect({ com, names, pads }) 로 그대로 */
export interface SetPlayerResult {
  count: number;
  slots: SetPlayerSlot[];
  cancelled: boolean;
  toCharSelect: boolean;
}

/** 시스템 애플릿 대체(setplayer.md 6.7·9.4) [설계] */
export interface SetPlayerSystemAdapter {
  /** 유저 선택 애플릿(bex::AccountSelector) 대체. null = 취소 */
  selectAccount(pid: number): Promise<{ uid: string; nickname: string } | null>;
  /** 소프트웨어 키보드(유저 이름 프리셋, 머리글 sys_swkbd_username_header) 대체. null = 취소 */
  editName(pid: number, current: string, maxLen: number): Promise<string | null>;
}

/** 컨트롤러별 이번 프레임 입력(bex 비트, mgmcommon PAD) */
export interface ControllerInput {
  /** 연결된 컨트롤러 목록(순서 = 웹 id 순서) */
  list(): Controller[];
  poll(id: string): { hold: number; trig: number };
}

export interface SetPlayerSoundAdapter {
  play?(label: string, url: string, gain: number, x?: number): void;
  vibrate?(controller: string, name: string): void;
}
