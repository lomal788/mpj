/**
 * 마리오 파티(보드) 파티 규칙 화면 — 설정값·사건·입력 형식. 근거: docs/shell/partyrule.md 4·9.2.
 * 원본 저장 위치: PlayerWork(ComLevel·BoardHandicap·캐릭터·PlayerType), flag 4·6·7·8, BoardWork(TurnMax·BonusStarType·BoardID·BoardMode), Menu+9·+10·+0x20..0x24.
 */
import type { Inserts } from '@app/common/ui/text';

export interface PartyPlayer {
  /** 캐릭터 얼굴 이름(face_128_<chara>^u, 예 pc01) */
  chara: string;
  /** PlayerType == 1 */
  com: boolean;
  /** ComLevel 0 쉬움 … 3 달인 */
  level: number;
  /** BoardHandicap 0..5 */
  handicap: number;
}

export interface PartyRuleConfig {
  players: PartyPlayer[];
  /** flag 4 미니게임 설명 있음, 6 체감 미니게임 있음, 7 투표, 8 CPU 속도 빠름 */
  flag4: boolean;
  flag6: boolean;
  flag7: boolean;
  flag8: boolean;
  turnMax: number;
  /** BonusStarType 0 없음, 1 있음, 2 기존 */
  bonusType: number;
  boardId: number;
  /** BoardMode 0 파티 규칙, 1 챔피언십 */
  boardMode: 0 | 1;
  /** GameFlag 0x20(투표 해금)·0x22(기존 보너스 해금) */
  gameFlag20: boolean;
  gameFlag22: boolean;
  /** SaveFlag(첫 안내·NEW 표시) */
  saveFlags: Set<number>;
  /** Menu+0x20..0x23 ComLevel 사본, +0x24 속도, +9 설명, +10 체감 */
  menuLevel: number[];
  menuSpeed: boolean;
  menuInst: boolean;
  menuGyro: boolean;
}

/** 화면 묶음: 멤버 설정·규칙 확인·플레이 방법 설정 판, 제목 띠, 보드 이름 띠 */
export type Scr = 'member' | 'check' | 'rule' | 'title' | 'telop';

/** 그리기 사건(path '' = 판 레이아웃 자체) */
export type PEvent =
  | { t: 'show'; scr: Scr; v: boolean }
  | { t: 'play'; scr: Scr; path: string; tag: string; next?: string }
  | { t: 'vis'; scr: Scr; path: string; v: boolean }
  | { t: 'text'; scr: Scr; path: string; label: string; ins?: Inserts }
  | { t: 'tex'; scr: Scr; path: string; key: string }
  | { t: 'iconRow'; scr: Scr; path: string; row: number }
  | { t: 'face'; scr: Scr; path: string; chara: string }
  | { t: 'align'; scr: Scr; path: string }
  | { t: 'guide'; scr: Scr; label: string | null }
  | { t: 'se'; label: string; scr?: Scr; path?: string }
  | { t: 'vib'; name: string }
  | { t: 'note'; text: string };

/** 프레임 입력(조작 플레이어 bex 비트)·애니 끝 조회 */
export interface PIO {
  trig: number;
  rep: number;
  hold: number;
  /** 그 화면의 path 부품(또는 '' = 판) 애니가 끝났는가 */
  done(scr: Scr, path: string): boolean;
}

/** 이 화면이 쓰는 메시지 창 기능(mgmcommon MessageWindow 의 부분) */
export interface PartyMsg {
  setMessageLabel(label: string): void;
  addMessageLabel(label: string): void;
  setOwner(pid: number): void;
  disablePadInput(pad: boolean, b: boolean): void;
  setFlagForceAllDraw(b: boolean): void;
  setManualClose(b: boolean): void;
  setChoiceCount(n: number): void;
  setChoiceLabel(i: number, label: string): void;
  setChoiceDeciSe(i: number, se: string): void;
  setChoiceDeciVib(i: number, vib: string): void;
  setCancelEnable(b: boolean): void;
  setInitialChoice(i: number): void;
  start(): void;
  out(): void;
  requestNext(b: boolean): void;
  isWorking(): boolean;
  isEnd(): boolean;
  choiceResult(): number;
}

/** 단계 [웹 이름] = 원본 상태 번호 9·10·12·13 */
export type PartyStep = 'checkMember' | 'settingMember' | 'checkRule' | 'settingRule' | 'start';

/** 사건 받는 곳(배열도 된다) — 화면은 받는 즉시 레이아웃에 적용한다 */
export interface PSink {
  push(e: PEvent): void;
}
