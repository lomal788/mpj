/**
 * 온라인 화면 흐름(순수) — 프렌드 매치(menu00 OnlineMenuImpl sub 1·2·3 + 대기실) 와 전 세계 매칭(menu01 대전 상대 → matching00 Matching_Bd).
 * 근거: docs/shell/online.md 3·5. 원본 파이버 = 제너레이터(yield 한 번 = Fiber::Wait 1프레임). 네트워크는 OnlineAdapter 사건만 본다.
 */
import { waitTime, type Flow } from '../mgmcommon/fiber';
import { LobbyStatusPanel, NetMenuPanel, OpponentPanel, RoomTypePanel, SessionInfoPanel, SessionListView, StateTelopPanel, type OIO, type Sink } from './panels';
import {
  BTN,
  FAIL_LIMIT,
  JOIN_TIMEOUT_S,
  KOOPA,
  MATCHING_TIME,
  NOTICE,
  PASSWORD_LEN,
  ROOM_ID_LEN,
  type ErrorCode,
  type OnlineAdapter,
  type OnlineEvent,
  type OnlineSelf,
  type RoomMember,
  type RoomSize,
  type RoomState,
  type RoomSummary,
} from './types';
import { DialogBox, Keypad, LoadingTelop, MemberList, TimerView, type DialogSpec } from './widgets';

export type OnlineEntry = 'friend' | 'world' | 'lobbyHost' | 'lobbyClient';

export interface OnlineFlowOptions {
  ev: Sink;
  net: OnlineAdapter;
  self: OnlineSelf;
  /** 처음 온라인(저장 플래그 +0x6c 꺼짐) → 안내 대화상자 2개 [판독 ConnectNplnFiber] */
  firstOnline: boolean;
  matchingTime?: number;
  failLimit?: number;
}

const ERROR_LABEL: Record<ErrorCode, string> = { B3: 'sys_error_B3', B4: 'sys_error_B4', B6: 'sys_error_B6', B9: 'sys_error_B9' };

export class OnlineFlow {
  readonly ev: Sink;
  readonly net: OnlineAdapter;
  readonly self: OnlineSelf;
  readonly netMenu: NetMenuPanel;
  readonly roomType: RoomTypePanel;
  readonly list: SessionListView;
  readonly info: SessionInfoPanel;
  readonly lobby: LobbyStatusPanel;
  readonly opponent: OpponentPanel;
  readonly mtlp: StateTelopPanel;
  readonly dialog: DialogBox;
  readonly keypad: Keypad;
  readonly loading: LoadingTelop;
  readonly timer: TimerView;
  readonly members: MemberList;
  io: OIO = { trig: 0, rep: 0, hold: 0, done: () => true };
  dt = Math.fround(1 / 60);
  step = 'start';
  readonly history: string[] = [];
  finished = false;
  result = '';
  /** 검색 결과(거르기 끝) */
  rooms: RoomSummary[] = [];
  /** 방 ID 모드(NetworkManager+0xa0) */
  searchId = '';
  room: RoomState | null = null;
  private inbox: OnlineEvent[] = [];
  private pendingError: string | null = null;
  private playRequested = false;
  private busy = 0;
  private guideOn: string[] | null = null;
  private firstOnline: boolean;
  private readonly matchingTime: number;
  private readonly failLimit: number;
  timeLeft = 0;

  constructor(o: OnlineFlowOptions) {
    this.ev = o.ev;
    this.net = o.net;
    this.self = o.self;
    this.firstOnline = o.firstOnline;
    this.matchingTime = o.matchingTime ?? MATCHING_TIME;
    this.failLimit = o.failLimit ?? FAIL_LIMIT;
    this.netMenu = new NetMenuPanel(o.ev);
    this.roomType = new RoomTypePanel(o.ev);
    this.list = new SessionListView(o.ev);
    this.info = new SessionInfoPanel(o.ev);
    this.lobby = new LobbyStatusPanel(o.ev);
    this.opponent = new OpponentPanel(o.ev);
    this.mtlp = new StateTelopPanel(o.ev);
    this.dialog = new DialogBox(o.ev);
    this.keypad = new Keypad(o.ev);
    this.loading = new LoadingTelop(o.ev);
    this.timer = new TimerView(o.ev);
    this.members = new MemberList(o.ev);
  }

  private mark(s: string): void {
    this.step = s;
    this.history.push(s);
    if (this.history.length > 200) this.history.shift();
  }

  private guide(labels: string[] | null): void {
    const k = labels ? labels.join('|') : null;
    if (k === (this.guideOn ? this.guideOn.join('|') : null)) return;
    this.guideOn = labels;
    this.ev.push({ t: 'guide', labels });
  }

  /** 어댑터 사건(틱 시작) — 방 상태·알림·오류는 여기서, 기다리는 흐름은 inbox 로 */
  onEvent(e: OnlineEvent): void {
    switch (e.t) {
      case 'created':
      case 'joined':
        this.room = structuredClone(e.room);
        break;
      case 'memberJoined':
        if (this.room) {
          this.room.members.push({ ...e.member });
          this.ev.push({ t: 'notice', label: NOTICE.JoinSession, ins: { Text0: e.member.name } });
        }
        break;
      case 'memberReady': {
        const m = this.room?.members.find((x) => x.station === e.station);
        if (m) m.ready = true;
        break;
      }
      case 'memberLeft':
        if (this.room) this.room.members = this.room.members.filter((x) => x.station !== e.station);
        break;
      case 'dissolved':
        this.room = null;
        this.pendingError = 'mn01_friend_mw_lobby_dismiss_client';
        break;
      case 'error':
        this.room = null;
        this.pendingError = ERROR_LABEL[e.code];
        break;
      default:
        break;
    }
    this.inbox.push(e);
  }

  /** types 중 하나가 올 때까지(시간 넘으면 null) */
  private *waitEvent<T extends OnlineEvent['t']>(types: readonly T[], timeout = Infinity): Flow<Extract<OnlineEvent, { t: T }> | null> {
    let t = 0;
    for (;;) {
      const i = this.inbox.findIndex((e) => (types as readonly string[]).includes(e.t));
      if (i >= 0) return this.inbox.splice(i, 1)[0] as Extract<OnlineEvent, { t: T }>;
      if (this.pendingError) return null;
      yield;
      t += this.dt;
      if (t >= timeout) return null;
    }
  }

  private sleep(sec: number): Flow {
    return waitTime(sec, () => this.dt);
  }

  private *showDialog(s: DialogSpec): Flow<number> {
    this.dialog.open(s);
    while (this.dialog.working) yield;
    return this.dialog.result;
  }

  private *input(header: string, len: number): Flow<string | null> {
    this.keypad.open(header, len);
    while (this.keypad.working) yield;
    return this.keypad.result ?? null;
  }

  private end(r: string): void {
    this.result = r;
    this.finished = true;
    this.mark(`end:${r}`);
  }

  /** 오류 표시(bq::Net::RequestError 대체: 대화상자, A 로 닫음) */
  private *showError(label: string): Flow {
    this.pendingError = null;
    this.guide(null);
    this.mark(`error:${label}`);
    this.ev.push({ t: 'se', label: 'SQ_SE_SYS_ERROR' });
    yield* this.showDialog({ label });
  }

  /** 들어가는 곳 */
  *run(entry: OnlineEntry): Flow {
    if (entry === 'world') {
      yield* this.world();
      return;
    }
    if (entry === 'lobbyHost' || entry === 'lobbyClient') {
      if (!(yield* this.connect())) return;
      this.ev.push({ t: 'show', l: 'bg', v: true });
      this.ev.push({ t: 'play', l: 'bg', path: '', tag: 'normal' });
      if (entry === 'lobbyHost') this.net.createRoom(4, '');
      else {
        this.net.searchRooms(-1);
        const s = yield* this.waitEvent(['searchDone'], JOIN_TIMEOUT_S);
        const r = s?.rooms.find((x) => !x.locked && x.members.length + this.self.humans <= x.size);
        if (r) this.net.joinRoom(r.id, '');
      }
      const e = yield* this.waitEvent(['created', 'joined', 'joinFailed', 'createFailed'], JOIN_TIMEOUT_S);
      if (!e || (e.t !== 'created' && e.t !== 'joined')) {
        yield* this.showError('sys_notice_joinSessionMissed00');
        this.end('fail');
        return;
      }
    }
    for (;;) {
      if (!this.room) {
        const r = yield* this.friendMenu();
        if (r !== 'room') {
          this.end(r);
          return;
        }
      }
      const l = yield* this.lobbyFlow();
      if (l !== 'menu') {
        this.end(l);
        return;
      }
    }
  }

  /** ConnectNplnFiber [판독 5.7] */
  private *connect(): Flow<boolean> {
    if (this.net.isConnected()) return true;
    this.mark('connect');
    if (this.firstOnline) {
      yield* this.showDialog({ label: 'sys_network_check_dlg00' });
      const r = yield* this.showDialog({ label: 'sys_network_check_dlg01', choices: ['sys_network_check_dlg01_a00', 'sys_network_check_dlg01_a01'] });
      if (r === 1) {
        this.end('cancel');
        return false;
      }
    }
    this.loading.in();
    this.net.connect();
    const e = yield* this.waitEvent(['connected', 'connectFailed'], JOIN_TIMEOUT_S);
    this.loading.life.out();
    while (!this.loading.life.finished) yield;
    if (e?.t !== 'connected') {
      yield* this.showError('sys_error_B3');
      this.end('connectFailed');
      return false;
    }
    this.firstOnline = false;
    return true;
  }

  /** OnlineMenuImpl [판독 3.1] — 'room'(방에 들어감) / 'exit' / 'connectFailed' 등 */
  private *friendMenu(): Flow<string> {
    if (!(yield* this.connect())) return this.result || 'connectFailed';
    this.ev.push({ t: 'show', l: 'bg', v: true });
    this.ev.push({ t: 'play', l: 'bg', path: '', tag: 'normal' });
    yield* this.sleep(0.5);
    let sub = 1;
    while (sub !== 0 && this.net.isConnected()) {
      if (sub === 1) sub = yield* this.menuStep();
      else if (sub === 2) sub = yield* this.roomTypeStep();
      else if (sub === 3) sub = yield* this.listStep();
      if (this.pendingError) {
        yield* this.showError(this.pendingError);
        sub = 0;
      }
    }
    yield* this.sleep(0.5);
    if (this.net.isConnected() && !this.room) this.net.disconnect();
    this.ev.push({ t: 'show', l: 'bg', v: false });
    return this.room ? 'room' : 'exit';
  }

  private *menuStep(): Flow<number> {
    this.mark('netMenu');
    this.netMenu.start();
    while (!this.netMenu.life.finished) yield;
    if (this.netMenu.canceled) return 0;
    return this.netMenu.sel === 0 ? 2 : 3;
  }

  /** ComUiNetMenuRoomType + 람다 2 [판독 5.2] */
  private *roomTypeStep(): Flow<number> {
    this.mark('roomType');
    this.roomType.start(this.self.humans);
    let stage = 1;
    let password = '';
    let canceled = false;
    while (stage !== 0 && !canceled) {
      while (!this.roomType.life.idle || !this.roomType.btnIdle(this.io)) yield;
      if (stage === 1) {
        this.guide(['sys_ctrl_back']);
        for (;;) {
          yield;
          if (!this.roomType.btnIdle(this.io)) continue;
          const t = this.io.trig;
          if (t & BTN.B) {
            this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL' });
            canceled = true;
            break;
          }
          if (t & BTN.A) {
            this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI' });
            this.roomType.press();
            if (this.roomType.sel === 0) stage = 3;
            else if (this.self.humans < 2) stage = 2;
            else yield* this.showDialog({ label: 'mn01_friend_ui_number_check' });
            break;
          }
          const sel = this.roomType.sel;
          if (t & BTN.LEFT && sel !== 0 && this.roomType.enabled[0]) {
            this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR' });
            this.roomType.select(0, false);
          } else if (t & BTN.RIGHT && sel !== 1 && this.roomType.enabled[1]) {
            this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR' });
            this.roomType.select(1, false);
          }
        }
        this.guide(null);
      } else if (stage === 2) {
        this.mark('roomType:characterCheck');
        if (this.self.chara === KOOPA) {
          yield* this.showDialog({ label: 'mn01_friend_mw_search_koopaChange' });
          this.self.chara = 0;
          this.ev.push({ t: 'note', text: '캐릭터 다시 고르기 [설계: 자동으로 마리오]' });
        }
        stage = 3;
      } else if (stage === 3) {
        this.mark('roomType:password');
        const r = yield* this.showDialog({
          label: 'mn01_friend_mw_roomSet_passCheck',
          choices: ['mn01_friend_mw_roomSet_pass00', 'mn01_friend_mw_roomSet_pass01', 'mn01_friend_mw_roomSet_pass02'],
          initial: 1,
          cancel: 2,
          deciSe: { 2: 'SQ_SE_SYS_CANCEL' },
        });
        if (r === 1) {
          password = '';
          stage = 0;
        } else if (r === 0) {
          const pw = yield* this.input('sys_swkbd_password_host_header', PASSWORD_LEN);
          if (pw === null) stage = 1;
          else {
            password = pw;
            stage = 0;
          }
        } else stage = 1;
        if (stage === 1) this.roomType.select(this.roomType.sel, true);
      }
    }
    this.roomType.life.out();
    while (!this.roomType.life.finished) yield;
    if (canceled) return 1;
    yield* this.sleep(0.5);
    this.mark('createSession');
    const size: RoomSize = this.roomType.sel === 1 ? 8 : 4;
    this.net.createRoom(size, password);
    const e = yield* this.waitEvent(['created', 'createFailed'], JOIN_TIMEOUT_S);
    yield* this.sleep(0.5);
    return e?.t === 'created' ? 0 : 1;
  }

  /** SearchSessionFiber / SearchIdSessionFiber [판독 5.3] */
  private *search(kind: RoomSize | -1, notify: boolean, id = ''): Flow {
    this.busy++;
    if (notify) this.ev.push({ t: 'notice', label: NOTICE.SerchSession00 });
    yield* this.sleep(0.5);
    if (id) this.net.searchRoomById(id);
    else this.net.searchRooms(kind);
    const e = yield* this.waitEvent(['searchDone'], JOIN_TIMEOUT_S);
    this.rooms = e?.rooms ?? [];
    if (id) this.searchId = this.rooms.length ? id : '';
    if (this.rooms.length === 0 && (notify || id)) this.ev.push({ t: 'notice', label: NOTICE.SerchSession01 });
    else if (this.rooms.length) yield* this.sleep(0.5);
    this.busy--;
  }

  /** ComUiNetSessionList + 람다 3 [판독 5.3] */
  private *listStep(): Flow<number> {
    this.mark('sessionList');
    const L = this.list;
    this.searchId = '';
    this.rooms = [];
    L.cursor = 0;
    L.top = 0;
    L.setType(4, false);
    L.clearAll();
    L.life.in();
    yield* this.search(-1, true);
    while (!L.life.finished) {
      yield;
      L.settle(this.io);
      if (L.life.st !== 1) continue;
      if (this.room) {
        L.life.out();
        this.guide(null);
        continue;
      }
      if (this.dialog.working || this.keypad.working) {
        this.guide(null);
        continue;
      }
      const idMode = this.searchId !== '';
      const n = this.rooms.length;
      if (this.rooms.some((r) => r.size === 8) && this.self.humans < 2) L.type = 8;
      L.setType(L.type, idMode);
      if (this.busy === 0) {
        this.guide(['mn01_friend_ctrl_search_renew', 'mn01_friend_ctrl_search_ID', idMode ? 'mn01_friend_ctrl_search_back' : 'sys_ctrl_back']);
        L.move(this.io, n);
      } else this.guide(null);
      L.refresh(this.rooms);
      if (this.busy > 0) continue;
      const t = this.io.trig;
      if (t & BTN.B) {
        this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL' });
        if (!idMode) {
          L.life.out();
          this.guide(null);
        } else {
          this.searchId = '';
          L.clearAll();
          yield* this.search(L.type, true);
        }
      } else if (t & BTN.Y) {
        this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI_S' });
        L.clearAll();
        if (idMode) yield* this.search(L.type, false, this.searchId);
        else yield* this.search(L.type, true);
      } else if (t & BTN.X) {
        this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI_S' });
        const id = yield* this.input('sys_swkbd_roomID_header', ROOM_ID_LEN);
        if (id) {
          L.clearAll();
          L.cursor = 0;
          L.top = 0;
          yield* this.search(L.type, false, id);
        }
      } else if (!idMode && t & BTN.TAB_L && L.type === 8) {
        this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI_LR' });
        this.ev.push({ t: 'play', l: 'list', path: 'null_l_all', tag: 'left_select' });
        L.clearAll();
        L.type = 4;
        L.cursor = 0;
        L.top = 0;
        yield* this.search(4, true);
      } else if (!idMode && t & BTN.TAB_R && L.type === 4) {
        this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI_LR' });
        this.ev.push({ t: 'play', l: 'list', path: 'null_r_all', tag: 'right_select' });
        L.clearAll();
        L.cursor = 0;
        L.top = 0;
        if (this.self.humans === 1) {
          L.type = 8;
          yield* this.search(8, true);
        } else this.ev.push({ t: 'notice', label: NOTICE.PlayModeMissed01 });
      } else if (t & BTN.A && n > 0 && !L.rowsAnimating()) {
        this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI' });
        L.playRow(L.cursor - L.top, 3);
        yield* this.join(this.rooms[L.cursor]);
      }
    }
    if (!this.room) return 1;
    this.ev.push({ t: 'note', text: '페이드 아웃 1.0 s [판독 람다 3]' });
    yield* this.sleep(1.0);
    return 0;
  }

  /** JoinSessionFiber [판독 5.4] */
  private *join(r: RoomSummary): Flow {
    this.busy++;
    this.mark('join');
    try {
      if (r.size === 8 && this.self.humans > 1) {
        this.ev.push({ t: 'notice', label: NOTICE.PlayModeMissed01 });
        return;
      }
      const ok = yield* this.showDialog({ label: 'mn01_friend_mw_search_join', ins: { Text0: r.host }, choices: ['mn01_friend_mw_search_join_a0', 'mn01_friend_mw_search_join_a1'], initial: 0 });
      if (ok !== 0) return;
      if (r.members.length === 0 || this.self.humans + r.members.length > r.size) {
        this.ev.push({ t: 'notice', label: NOTICE.JoinSessionMissed00 });
        return;
      }
      const koopa = r.size === 8 && this.self.chara === KOOPA;
      if (r.members.includes(this.self.chara) || koopa) {
        yield* this.showDialog({ label: koopa ? 'mn01_friend_mw_search_koopaChange' : 'mn01_friend_mw_search_change' });
        let c = 0;
        while (r.members.includes(c) || (r.size === 8 && c === KOOPA)) c++;
        this.self.chara = c;
        this.ev.push({ t: 'note', text: `캐릭터 다시 고르기 → ${c} [설계: 자동]` });
      }
      let pw = '';
      if (r.locked) {
        const v = yield* this.input('sys_swkbd_password_client_header', PASSWORD_LEN);
        if (!v) return;
        pw = v;
      }
      this.mark('joinRequest');
      this.net.joinRoom(r.id, pw);
      const e = yield* this.waitEvent(['joined', 'joinFailed'], JOIN_TIMEOUT_S * 2);
      if (e?.t !== 'joined') {
        this.ev.push({ t: 'notice', label: NOTICE.JoinSessionMissed00 });
        this.ev.push({ t: 'note', text: `참가 실패 ${e?.t === 'joinFailed' ? e.reason : 'timeout'}` });
        this.busy--;
        yield* this.search(this.list.type, false);
        this.busy++;
      }
    } finally {
      this.busy--;
    }
  }

  /** 대기실(광장 + ComUiNetLobbySessionStatus) [판독 5.5·5.6] — 'menu' 다시 메뉴 / 'started' / 'error' */
  private *lobbyFlow(): Flow<string> {
    this.mark(this.room?.host ? 'lobby:host' : 'lobby:client');
    this.ev.push({ t: 'show', l: 'bg', v: false });
    this.lobby.start();
    for (;;) {
      yield;
      if (this.pendingError) {
        const label = this.pendingError;
        this.lobby.finish();
        yield* this.showError(label);
        this.net.disconnect();
        return 'error';
      }
      const room = this.room;
      if (!room) {
        this.lobby.finish();
        return 'menu';
      }
      const started = this.inbox.findIndex((e) => e.t === 'started');
      if (started >= 0) {
        const e = this.inbox.splice(started, 1)[0] as Extract<OnlineEvent, { t: 'started' }>;
        this.mark('playSession');
        return yield* this.playTail(e.room);
      }
      if (this.playRequested) {
        this.playRequested = false;
        if (room.host && !this.dialog.working && this.info.life.st === -1) {
          const r = yield* this.playSession();
          if (r) return r;
        }
      }
      if (this.dialog.working || this.info.life.st !== -1 || !this.lobby.life.idle) continue;
      const t = this.io.trig;
      if (room.host) {
        if (t & BTN.Y) {
          this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI_S' });
          this.info.start(room.id, room.password);
        } else if (t & BTN.X && room.members.length < room.size) {
          this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI_S' });
          this.ev.push({ t: 'note', text: '친구 초대(시스템 애플릿) [설계: 효과음만]' });
        } else if (t & BTN.B) {
          this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL' });
          const r = yield* this.showDialog({ label: 'mn01_friend_mw_lobby_dismiss', choices: ['mn01_friend_mw_lobby_dismiss_a0', 'mn01_friend_mw_lobby_dismiss_a1'], initial: 1, cancel: 1 });
          if (r === 0) {
            this.net.dissolveRoom();
            this.room = null;
            this.lobby.finish();
            this.mark('dissolve');
            return 'menu';
          }
        } else if (t & BTN.A) {
          this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI' });
          const r = yield* this.playSession();
          if (r) return r;
        }
      } else if (t & BTN.B) {
        this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL' });
        const r = yield* this.showDialog({ label: 'mn01_friend_mw_lobby_leave', choices: ['mn01_friend_mw_lobby_leave_a0', 'mn01_friend_mw_lobby_leave_a1'], initial: 1, cancel: 1 });
        if (r === 0) {
          this.net.leaveRoom();
          this.room = null;
          this.lobby.finish();
          this.mark('leave');
          return 'menu';
        }
      }
    }
  }

  /** 대기실 텔롭 입력값 [판독 6절] */
  lobbyState(): { inSession: boolean; ready: boolean; count: number; eight: boolean; host: boolean; canInvite: boolean } {
    const r = this.room;
    if (!r) return { inSession: false, ready: false, count: 0, eight: false, host: false, canInvite: false };
    const count = r.members.filter((m) => m.ready).length;
    return { inSession: true, ready: r.members.length >= 2 && count === r.members.length, count, eight: r.size === 8, host: r.host, canInvite: r.members.length < r.size };
  }

  /** PlaySessionFiber(방장) [판독 5.6] */
  private *playSession(): Flow<string | null> {
    this.mark('playSession');
    const room = this.room!;
    if (room.members.length < 2) {
      this.ev.push({ t: 'note', text: '스테이션 1 → 아무것도 안 함(혼자 진행) [판독]' });
      return null;
    }
    this.net.startRoom();
    const e = yield* this.waitEvent(['started'], JOIN_TIMEOUT_S);
    if (!e) {
      yield* this.showError('sys_error_B3');
      return 'error';
    }
    return yield* this.playTail(e.room);
  }

  /** 광장 기구(SelectedBalloonImpl 세션 분기)가 부르는 PlaySession — 대기실 흐름이 다음 틱에 방장이면 playSession [판독 online.md 5.6 정정] */
  requestPlay(): void {
    this.playRequested = true;
  }

  /** PlaySessionFiber 공통 끝(방장·손님 같음, 손님은 메시지 7 = started 로 들어옴) [판독 online.md 5.6 정정] */
  private *playTail(room: RoomState): Flow<string> {
    const ready = room.members.filter((m) => m.ready).length;
    if (ready < 2 || room.members.length < ready) {
      yield* this.showError('sys_error_B3');
      return 'error';
    }
    this.ev.push({ t: 'se', label: 'SQ_SE_MENU00_TRANSITION_WHO' });
    this.lobby.finish();
    yield* this.sleep(1.0);
    return 'started';
  }

  /** menu01 대전 상대 → matching00 Matching_Bd [판독 3.2·3.3·5.7] */
  private *world(): Flow {
    this.mark('opponent');
    this.opponent.start(this.self.humans, false);
    while (!this.opponent.decided) yield;
    while (!this.opponent.life.finished) yield;
    if (this.opponent.result < 0) return this.end('cancel');
    if (this.opponent.result === 0) return this.end('offline');
    this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI' });
    this.ev.push({ t: 'show', l: 'mbg', v: true });
    yield* this.sleep(1.0);
    let fails = 0;
    let members: RoomMember[] | null = null;
    for (;;) {
      if (!(yield* this.connect())) return;
      const r = yield* this.matchMake();
      if (r === 'abort') {
        this.ev.push({ t: 'show', l: 'mbg', v: false });
        this.net.disconnect();
        return this.end('cancel');
      }
      if (r === 'error') return this.end('error');
      if (r) {
        members = r;
        break;
      }
      fails++;
      if (fails >= this.failLimit) {
        this.mark('soloSession');
        members = [{ station: 'self', name: this.self.name, chara: this.self.chara, host: true, ready: true, local: true }];
        for (let c = 0; members.length < 4; c++) if (c !== this.self.chara) members.push({ station: `com${c}`, name: `CPU`, chara: c, host: false, ready: true, local: false });
        this.ev.push({ t: 'note', text: `실패 ${fails}회 ≥ FAIL_LIMIT → 혼자 세션 + COM [추정]` });
        break;
      }
      this.mtlp.out();
      const again = yield* this.showDialog({ label: 'sys_error_E', choices: ['sys_error_E_a00', 'sys_error_E_a01'], initial: 0 });
      if (again !== 0) {
        this.ev.push({ t: 'show', l: 'mbg', v: false });
        this.net.disconnect();
        return this.end('cancel');
      }
    }
    this.mark('setupSession');
    this.mtlp.change(1);
    this.ev.push({ t: 'se', label: 'SQ_SE_SYS_ONLIN_PLY_RNDMATCH' });
    yield* this.sleep(3.0);
    this.mtlp.change(2);
    this.mark('playerList');
    this.members.start(members);
    this.ev.push({ t: 'se', label: 'SQ_SE_MATCHING00_MBR_LST' });
    yield* this.sleep(5.0);
    this.members.life.out();
    while (!this.members.life.finished) yield;
    this.end('started');
  }

  /** Scene::MatchMake [판독 5.7] — 참가자 / null(못 찾음) / 'abort' / 'error' */
  private *matchMake(): Flow<RoomMember[] | null | 'abort' | 'error'> {
    this.mark('matchMake');
    this.timeLeft = this.matchingTime;
    this.timer.life.in();
    this.timer.set(this.timeLeft);
    this.mtlp.start();
    this.guide(['mtch00_ctrl_cancel']);
    this.net.matchmake();
    let found: RoomMember[] | null = null;
    let aborted = false;
    for (;;) {
      yield;
      if (this.pendingError) {
        const label = this.pendingError;
        this.timer.life.out();
        this.mtlp.out();
        yield* this.showError(label);
        this.ev.push({ t: 'show', l: 'mbg', v: false });
        this.net.disconnect();
        return 'error';
      }
      this.timeLeft = Math.max(0, this.timeLeft - this.dt);
      this.timer.set(this.timeLeft);
      const i = this.inbox.findIndex((e) => e.t === 'matchFound' || e.t === 'matchFailed');
      if (i >= 0) {
        const e = this.inbox.splice(i, 1)[0];
        if (e.t === 'matchFound') found = e.members;
        break;
      }
      if (this.timeLeft <= 0) {
        this.net.cancelMatchmake();
        break;
      }
      if (this.dialog.working) continue;
      if (this.io.trig & BTN.CANCEL_MATCH) {
        this.guide(null);
        const r = yield* this.showDialog({ label: 'mtch00_dlg_cancel', choices: ['mtch00_dlg_cancel_a0', 'mtch00_dlg_cancel_a1'], initial: 1, deciSe: { 0: 'SQ_SE_SYS_DECI_L' } });
        if (r === 0) {
          aborted = true;
          this.net.cancelMatchmake();
          break;
        }
        this.guide(['mtch00_ctrl_cancel']);
      }
    }
    this.timer.life.out();
    this.guide(null);
    if (aborted) {
      this.mtlp.out();
      return 'abort';
    }
    yield* this.sleep(1.0);
    return found;
  }
}
