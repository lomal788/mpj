/**
 * 온라인 멀티 화면 — 네트워크 어댑터 계약·상수. 근거: docs/shell/online.md 4·9.2.
 * 화면은 OnlineAdapter 만 본다. 요청은 즉시 반환하고 결과는 poll() 사건으로 온다(원본 파이버의 요청 → 결과 폴링과 같은 모양).
 */

export type RoomSize = 4 | 8;

/** 이 기기 쪽 정보(로컬 사람 수 = 원본 GetHumanPlayerCount) */
export interface OnlineSelf {
  name: string;
  /** PlayerCharacterID 0..21 */
  chara: number;
  humans: number;
}

export interface RoomMember {
  station: string;
  name: string;
  chara: number;
  host: boolean;
  /** 플레이어 데이터 받음(GetNetworkPlayerDataCount 의 상태 2) */
  ready: boolean;
  local: boolean;
}

/** 검색 결과 한 행(online.md 4.8 거르기 뒤) */
export interface RoomSummary {
  id: string;
  host: string;
  size: RoomSize;
  /** 참가자 캐릭터(참가 수 = 길이) */
  members: number[];
  locked: boolean;
}

export interface RoomState {
  id: string;
  size: RoomSize;
  password: string;
  /** 내가 방장 */
  host: boolean;
  entryOpen: boolean;
  members: RoomMember[];
}

export type JoinFailReason = 'missed' | 'full' | 'password' | 'members';
export type ErrorCode = 'B3' | 'B4' | 'B6' | 'B9';

export type OnlineEvent =
  | { t: 'connected' }
  | { t: 'connectFailed' }
  | { t: 'searchDone'; rooms: RoomSummary[] }
  | { t: 'created'; room: RoomState }
  | { t: 'createFailed' }
  | { t: 'joined'; room: RoomState }
  | { t: 'joinFailed'; reason: JoinFailReason }
  | { t: 'memberJoined'; member: RoomMember }
  | { t: 'memberReady'; station: string }
  | { t: 'memberLeft'; station: string }
  | { t: 'dissolved' }
  | { t: 'started'; room: RoomState }
  | { t: 'matchFound'; members: RoomMember[] }
  | { t: 'matchFailed' }
  | { t: 'error'; code: ErrorCode };

/** online.md 9.2 — 나중에 WebSocket 방 서버로 구현할 인터페이스 [설계] */
export interface OnlineAdapter {
  connect(): void;
  isConnected(): boolean;
  disconnect(): void;
  createRoom(size: RoomSize, password: string): void;
  /** -1 = 4인 방을 찾고, 없고 사람 1명이면 8인 방(SearchSessionFiber type −1) */
  searchRooms(size: RoomSize | -1): void;
  searchRoomById(id: string): void;
  joinRoom(id: string, password: string): void;
  leaveRoom(): void;
  dissolveRoom(): void;
  startRoom(): void;
  matchmake(): void;
  cancelMatchmake(): void;
  room(): RoomState | null;
  poll(): OnlineEvent[];
  tick?(dt: number): void;
}

/** PlayerCharacterID → 얼굴 텍스처 이름(characterlist.json 순서, SHARED [scene]) */
export const CHARA_PC = [
  'pc01', 'pc02', 'pc03', 'pc04', 'pc05', 'pc06', 'pc07', 'pc08', 'pc09', 'pc11', 'pc12',
  'pc13', 'pc14', 'pc50', 'pc51', 'pc52', 'pc53', 'pc54', 'pc56', 'pc58', 'pc61', 'pc62',
] as const;
/** 쿠파 PlayerCharacterID(0xd) — 8인 방 금지 [판독 CharacterCheckImpl] */
export const KOOPA = 13;

/** 방 목록 화면 행 수 [판독 UpdateProcess] */
export const LIST_ROWS = 5;
/** 패스워드·방 ID 자릿수 [판독 키보드 최소=최대] */
export const PASSWORD_LEN = 4;
export const ROOM_ID_LEN = 6;
/** 참가 요청·지도 데이터 대기 [판독 ConvertToTick(20000000000)] */
export const JOIN_TIMEOUT_S = 20;
/** matching00 Scene::Params 기본값 [판독 createInstance @0x710000ff9c] */
export const MATCHING_TIME = 120;
export const FAIL_LIMIT = 2;
/** 매칭 인원 대기 상한 [판독 SetupSession] */
export const MEMBER_WAIT_S = 30;
/** 매칭 오류 이유 0..5 → 문구(표 @0x710005d700) [데이터] */
export const MATCH_ERROR: readonly ErrorCode[] = ['B3', 'B6', 'B3', 'B9', 'B3', 'B6'];

/** 버튼 비트(bex, online.md 4.9) */
export const BTN = {
  A: 0x1,
  B: 0x2,
  Y: 0x4,
  X: 0x8,
  LEFT: 0x10100,
  RIGHT: 0x40200,
  UP: 0x20800,
  DOWN: 0x80400,
  DPAD_UP: 0x800,
  DPAD_DOWN: 0x400,
  TAB_L: 0x50,
  TAB_R: 0xa0,
  CANCEL_MATCH: 0x3000,
} as const;

/** 알림 ID → 라벨(noticeList.json) [데이터] */
export const NOTICE = {
  JoinSession: 'sys_notice_joinSession',
  JoinSessionMissed00: 'sys_notice_joinSessionMissed00',
  SerchSession00: 'sys_notice_serchSession00',
  SerchSession01: 'sys_notice_serchSession01',
  PlayModeMissed01: 'sys_notice_playModeMissed01',
} as const;
