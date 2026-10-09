/**
 * 온라인 화면 UI 부품(순수 상태) — ComUiNet* 와 matching00 ComUi* 의 수명·입력. 그리기는 사건(OEv)으로만 낸다(view.ts 가 적용).
 * 근거: docs/shell/online.md 4·5. 원본 이름은 각 클래스 주석, 웹이 정한 것은 [설계].
 */
import { BTN, CHARA_PC, LIST_ROWS, type RoomSummary } from './types';

export type Lay =
  | 'bg'
  | 'netMenu'
  | 'roomType'
  | 'list'
  | 'info'
  | 'lobby'
  | 'mbg'
  | 'mtlp'
  | 'member'
  | 'opponent'
  | 'loading'
  | 'timer'
  | 'dialog'
  | 'keypad';

export type Ins = Record<string, string | number>;

export type OEv =
  | { t: 'show'; l: Lay; v: boolean }
  | { t: 'play'; l: Lay; path: string; tag: string; next?: string }
  | { t: 'vis'; l: Lay; path: string; v: boolean }
  | { t: 'text'; l: Lay; path: string; label: string; ins?: Ins; suffix?: string }
  | { t: 'raw'; l: Lay; path: string; s: string }
  | { t: 'face'; l: Lay; path: string; chara: number }
  | { t: 'se'; label: string }
  | { t: 'notice'; label: string; ins?: Ins }
  | { t: 'guide'; labels: string[] | null }
  | { t: 'scroll'; ratio: number; pos: number; v: boolean }
  | { t: 'place'; l: Lay; path: string; x: number }
  | { t: 'dialogLayout'; l: Lay; n: number }
  | { t: 'note'; text: string };

export interface Sink {
  push(e: OEv): void;
}

/** 한 틱 입력 + 레이아웃 애니 끝 확인 */
export interface OIO {
  trig: number;
  rep: number;
  hold: number;
  done(l: Lay, path: string): boolean;
}

/** 4.1 공통 수명: −1 숨김, 0 in, 1 대기, 2 out */
export class Life {
  st = -1;
  constructor(
    private readonly ev: Sink,
    readonly l: Lay,
  ) {}

  /** Start/In: −1·2 일 때만 in(imm = normal) */
  in(imm = false): void {
    if (this.st === 0 || this.st === 1) return;
    this.ev.push({ t: 'show', l: this.l, v: true });
    this.ev.push({ t: 'play', l: this.l, path: '', tag: imm ? 'normal' : 'in' });
    this.st = imm ? 1 : 0;
  }

  out(imm = false): void {
    if (this.st === -1 || this.st === 2) return;
    if (imm) {
      this.st = -1;
      this.ev.push({ t: 'show', l: this.l, v: false });
      return;
    }
    this.st = 2;
    this.ev.push({ t: 'play', l: this.l, path: '', tag: 'out' });
  }

  update(io: OIO): void {
    if (this.st === 0 && io.done(this.l, '')) {
      this.ev.push({ t: 'play', l: this.l, path: '', tag: 'normal' });
      this.st = 1;
    } else if (this.st === 2 && io.done(this.l, '')) {
      this.ev.push({ t: 'show', l: this.l, v: false });
      this.st = -1;
    }
  }

  get idle(): boolean {
    return this.st === 1;
  }

  get finished(): boolean {
    return this.st < 0;
  }
}

/** 두 버튼 선택 공통(Select: 고른 쪽 on→cursor, 다른 쪽 off→normal; 그림 부품도 같은 애니) */
function selectPair(ev: Sink, l: Lay, sel: number, imm: boolean, pict: [string, string], enabled: [boolean, boolean] = [true, true]): void {
  for (let i = 0; i < 2; i++) {
    const btn = `x_parts_btn_0${i}`;
    const on = i === sel;
    if (!imm) ev.push({ t: 'play', l, path: btn, tag: on ? 'on' : 'off', next: on ? 'cursor' : 'normal' });
    else ev.push({ t: 'play', l, path: btn, tag: on ? 'cursor' : 'normal' });
    if (pict[i]) ev.push({ t: 'play', l, path: pict[i], tag: on && enabled[i] ? 'cursor' : 'normal' });
  }
}

/** menu00::ComUiNetMenu — 방 만들기(0) / 방 찾기(1) [판독 4.2·5.1] */
export class NetMenuPanel {
  readonly life: Life;
  decided = false;
  canceled = false;
  /** 지난 선택 유지(Start 가 되돌리지 않음) */
  sel = 0;
  private guideOn = false;

  constructor(private readonly ev: Sink) {
    this.life = new Life(ev, 'netMenu');
    ev.push({ t: 'text', l: 'netMenu', path: 'x_text_title', label: 'mn01_friend_ui_start_title' });
    ev.push({ t: 'text', l: 'netMenu', path: 'x_parts_btn_00/x_text_title', label: 'mn01_friend_ui_start_hostTitle' });
    ev.push({ t: 'text', l: 'netMenu', path: 'x_parts_btn_00/x_text_mess', label: 'mn01_friend_ui_start_hostDetail' });
    ev.push({ t: 'text', l: 'netMenu', path: 'x_parts_btn_01/x_text_title', label: 'mn01_friend_ui_start_clientTitle' });
    ev.push({ t: 'text', l: 'netMenu', path: 'x_parts_btn_01/x_text_mess', label: 'mn01_friend_ui_start_clientDetail' });
    ev.push({ t: 'vis', l: 'netMenu', path: 'x_parts_btn_00/x_pict_search', v: false });
    ev.push({ t: 'vis', l: 'netMenu', path: 'x_parts_btn_01/x_pict_make', v: false });
  }

  private select(i: number, imm: boolean): void {
    this.sel = i;
    selectPair(this.ev, 'netMenu', i, imm, ['x_parts_btn_00/x_pict_make', 'x_parts_btn_01/x_pict_search']);
  }

  start(): void {
    this.decided = false;
    this.canceled = false;
    this.select(this.sel, false);
    this.life.in();
  }

  out(): void {
    this.life.out();
    if (this.guideOn) this.ev.push({ t: 'guide', labels: null });
    this.guideOn = false;
  }

  update(io: OIO): void {
    this.life.update(io);
    if (!this.life.idle) return;
    if (!io.done('netMenu', 'x_parts_btn_00') || !io.done('netMenu', 'x_parts_btn_01')) return;
    if (this.decided) {
      this.out();
      return;
    }
    if (!this.guideOn) {
      this.ev.push({ t: 'guide', labels: ['sys_ctrl_back'] });
      this.guideOn = true;
    }
    const t = io.trig;
    if (t & BTN.B) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL' });
      this.decided = true;
      this.canceled = true;
    } else if (t & BTN.A) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI' });
      const b = `x_parts_btn_0${this.sel}`;
      this.ev.push({ t: 'play', l: 'netMenu', path: b, tag: 'press' });
      this.ev.push({ t: 'play', l: 'netMenu', path: this.sel === 0 ? `${b}/x_pict_make` : `${b}/x_pict_search`, tag: 'press' });
      this.decided = true;
    } else {
      if (t & BTN.LEFT && this.sel !== 0) {
        this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR' });
        this.select(0, false);
      }
      if (t & BTN.RIGHT && this.sel !== 1) {
        this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR' });
        this.select(1, false);
      }
    }
  }
}

/** menu01::ComUiSelectMatchMode — 대전 상대: 0 CPU/가까이/친구, 1 전 세계 [판독 3.3·7절] */
export class OpponentPanel {
  readonly life: Life;
  decided = false;
  result = -1;
  sel = 0;
  enabled: [boolean, boolean] = [true, true];

  constructor(private readonly ev: Sink) {
    this.life = new Life(ev, 'opponent');
    ev.push({ t: 'text', l: 'opponent', path: 'x_parts_btn_01/x_text_title', label: 'mn01_bd_ui_match_world' });
    ev.push({ t: 'text', l: 'opponent', path: 'x_parts_btn_01/x_parts_guide/x_text_guide', label: 'mn01_mode_ui_match_only' });
    ev.push({ t: 'vis', l: 'opponent', path: 'x_parts_btn_00/x_pict_world', v: false });
    ev.push({ t: 'vis', l: 'opponent', path: 'x_parts_btn_01/x_pict_cpu', v: false });
  }

  /** Start: 버튼 0 제목 = 세션 있음 friend, 사람 > 1 local, 아니면 com [판독 문자열·분기 추정] */
  start(humans: number, inSession: boolean): void {
    this.decided = false;
    this.result = -1;
    this.enabled = [true, !inSession && humans < 2];
    const label = inSession ? 'mn01_bd_ui_match_friend' : humans > 1 ? 'mn01_bd_ui_match_local' : 'mn01_bd_ui_match_com';
    this.ev.push({ t: 'text', l: 'opponent', path: 'x_parts_btn_00/x_text_title', label });
    if (!this.enabled[1]) this.sel = 0;
    this.paint(true);
    this.life.in();
    this.ev.push({ t: 'guide', labels: ['sys_ctrl_back'] });
  }

  update(io: OIO): void {
    this.life.update(io);
    if (!this.life.idle || this.decided) return;
    const t = io.trig;
    if (t & BTN.B) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL' });
      this.finish(-1);
    } else if (t & BTN.A) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI' });
      this.ev.push({ t: 'play', l: 'opponent', path: `x_parts_btn_0${this.sel}`, tag: 'press' });
      this.finish(this.sel);
    } else if (t & BTN.LEFT && this.sel !== 0) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR' });
      this.sel = 0;
      this.paint(false);
    } else if (t & BTN.RIGHT && this.sel !== 1 && this.enabled[1]) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR' });
      this.sel = 1;
      this.paint(false);
    }
  }

  /** 끈 버튼은 disable(null_disable·회색은 애니가 켠다) */
  private paint(imm: boolean): void {
    selectPair(this.ev, 'opponent', this.sel, imm, ['x_parts_btn_00/x_pict_cpu', 'x_parts_btn_01/x_pict_world'], this.enabled);
    if (!this.enabled[1]) this.ev.push({ t: 'play', l: 'opponent', path: 'x_parts_btn_01', tag: 'disable' });
  }

  private finish(r: number): void {
    this.decided = true;
    this.result = r;
    this.life.out();
    this.ev.push({ t: 'guide', labels: null });
  }
}

/** menu00::ComUiNetMenuRoomType 의 그리기·선택 부분(단계 흐름은 flow.ts) [판독 4.3·5.2] */
export class RoomTypePanel {
  readonly life: Life;
  sel = 0;
  enabled: [boolean, boolean] = [true, true];

  constructor(private readonly ev: Sink) {
    this.life = new Life(ev, 'roomType');
    for (const [i, room, det] of [
      [0, 'mn01_friend_ui_number_room00', 'mn01_friend_ui_number_detail00'],
      [1, 'mn01_friend_ui_number_room01', 'mn01_friend_ui_number_detail01'],
    ] as const) {
      for (const s of ['00', '01']) {
        ev.push({ t: 'text', l: 'roomType', path: `x_parts_btn_0${i}/x_text_title_${s}`, label: room });
        ev.push({ t: 'text', l: 'roomType', path: `x_parts_btn_0${i}/x_text_mess_${s}`, label: det });
      }
    }
    ev.push({ t: 'text', l: 'roomType', path: 'x_parts_btn_01/x_parts_guide/x_text_guide', label: 'mn01_friend_ui_number_only' });
    ev.push({ t: 'vis', l: 'roomType', path: 'x_parts_btn_00/x_pict_room8', v: false });
    ev.push({ t: 'vis', l: 'roomType', path: 'x_parts_btn_01/x_pict_room4', v: false });
  }

  select(i: number, imm: boolean): void {
    this.sel = i;
    selectPair(this.ev, 'roomType', i, imm, ['x_parts_btn_00/x_pict_room4', 'x_parts_btn_01/x_pict_room8'], this.enabled);
  }

  /** Start: btn_01 켬 = 사람 1명 → x_normal/x_gray 전환 */
  start(humans: number): void {
    this.enabled = [true, humans === 1];
    for (let i = 0; i < 2; i++) {
      this.ev.push({ t: 'vis', l: 'roomType', path: `x_parts_btn_0${i}/x_normal`, v: this.enabled[i] });
      this.ev.push({ t: 'vis', l: 'roomType', path: `x_parts_btn_0${i}/x_gray`, v: !this.enabled[i] });
    }
    this.select(this.sel, true);
    this.life.in();
  }

  press(): void {
    const b = `x_parts_btn_0${this.sel}`;
    this.ev.push({ t: 'play', l: 'roomType', path: b, tag: 'press' });
    if (this.enabled[this.sel]) this.ev.push({ t: 'play', l: 'roomType', path: this.sel === 0 ? `${b}/x_pict_room4` : `${b}/x_pict_room8`, tag: 'press' });
  }

  btnIdle(io: OIO): boolean {
    return io.done('roomType', 'x_parts_btn_00') && io.done('roomType', 'x_parts_btn_01');
  }
}

/** 행 버튼 애니 번호 1 on·2 cursor·3 press·4 normal·5 off·6 disable 과 사용자명 색 [데이터 @0x710019b590·@0x710019b5a8] */
export const ROW_ANIM = ['', 'on', 'cursor', 'press', 'normal', 'off', 'disable'] as const;
export const ROW_TEXTCOLOR = ['', 'textcolor_white', 'textcolor_white', 'textcolor_brown', 'textcolor_brown', 'textcolor_brown', 'textcolor_white'] as const;

/** menu00::ComUiNetSessionList 그리기(행·탭·스크롤) [판독 4.4·5.3] */
export class SessionListView {
  readonly life: Life;
  readonly rowAnim = [6, 6, 6, 6, 6];
  cursor = 0;
  top = 0;
  type: 4 | 8 = 4;
  private typeKey = '';
  private rowKey = '';

  constructor(private readonly ev: Sink) {
    this.life = new Life(ev, 'list');
    ev.push({ t: 'text', l: 'list', path: 'x_tab_4/x_text_title', label: 'mn01_friend_ui_search_title00' });
    ev.push({ t: 'text', l: 'list', path: 'x_tab_8/x_text_title', label: 'mn01_friend_ui_search_title01' });
    ev.push({ t: 'text', l: 'list', path: 'x_text_L', label: 'mn01_friend_ui_search_changeL' });
    ev.push({ t: 'text', l: 'list', path: 'x_text_L_shadow', label: 'mn01_friend_ui_search_changeL' });
    ev.push({ t: 'text', l: 'list', path: 'x_text_R', label: 'mn01_friend_ui_search_changeR' });
    ev.push({ t: 'text', l: 'list', path: 'x_text_R_shadow', label: 'mn01_friend_ui_search_changeR' });
  }

  playRow(i: number, a: number): void {
    this.rowAnim[i] = a;
    this.ev.push({ t: 'play', l: 'list', path: `x_btn_0${i}`, tag: ROW_ANIM[a] });
    this.ev.push({ t: 'play', l: 'list', path: `x_btn_0${i}/x_parts_username`, tag: ROW_TEXTCOLOR[a] });
  }

  clearAll(): void {
    this.rowKey = '';
    this.typeKey = '';
    for (let i = 0; i < LIST_ROWS; i++) this.playRow(i, 6);
    this.ev.push({ t: 'scroll', ratio: 1, pos: 0, v: false });
  }

  /** SetSessionType: 목록 모드 = 탭 보임·on/off, ID 모드 = 탭 없음 + "방을 찾았습니다." */
  setType(type: 4 | 8, idMode: boolean): void {
    this.type = type;
    const key = `${type}/${idMode}`;
    if (key === this.typeKey) return;
    this.typeKey = key;
    this.ev.push({ t: 'vis', l: 'list', path: 'x_null_tab', v: !idMode });
    this.ev.push({ t: 'vis', l: 'list', path: 'x_null_no_tab', v: idMode });
    if (!idMode) {
      this.ev.push({ t: 'play', l: 'list', path: 'x_tab_4', tag: type === 4 ? 'on' : 'off' });
      this.ev.push({ t: 'play', l: 'list', path: 'x_tab_8', tag: type === 8 ? 'on' : 'off' });
      this.ev.push({ t: 'vis', l: 'list', path: 'null_r_all', v: type === 4 });
      this.ev.push({ t: 'vis', l: 'list', path: 'null_l_all', v: type === 8 });
    }
    this.ev.push({ t: 'vis', l: 'list', path: 'x_text_mess_00', v: true });
    const label = idMode ? 'mn01_friend_ui_search_detail02' : type === 8 ? 'mn01_friend_ui_search_detail01' : 'mn01_friend_ui_search_detail00';
    this.ev.push({ t: 'text', l: 'list', path: 'x_text_mess_00', label });
  }

  /** SetButton: 사용자명·얼굴 8칸·자물쇠 */
  setRow(i: number, r: RoomSummary): void {
    const b = `x_btn_0${i}`;
    for (const t of ['x_text_00', 'x_text_01']) this.ev.push({ t: 'raw', l: 'list', path: `${b}/x_parts_username/${t}`, s: r.host });
    for (let k = 0; k < 8; k++) {
      const f = `${b}/x_parts_face_0${k}`;
      this.ev.push({ t: 'vis', l: 'list', path: `${f}/x_face_on`, v: k < r.members.length });
      this.ev.push({ t: 'vis', l: 'list', path: `${f}/x_face_off`, v: k < r.size });
      if (k < r.members.length) this.ev.push({ t: 'face', l: 'list', path: `${f}/x_face_on/x_face_pc64`, chara: r.members[k] });
    }
    this.ev.push({ t: 'vis', l: 'list', path: `${b}/x_null_8`, v: r.size === 8 });
    this.ev.push({ t: 'vis', l: 'list', path: `${b}/x_icon_pass`, v: r.locked });
  }

  /** 행 다시 그림(UpdateProcess 뒷부분) */
  refresh(rooms: readonly RoomSummary[]): void {
    const key = `${this.top}/${this.cursor}/${rooms.map((r) => `${r.id}:${r.members.join(',')}`).join(';')}`;
    if (key === this.rowKey) return;
    this.rowKey = key;
    for (let i = 0; i < LIST_ROWS; i++) {
      const k = this.top + i;
      if (k >= rooms.length) {
        if (this.rowAnim[i] !== 6) this.playRow(i, 6);
        continue;
      }
      this.setRow(i, rooms[k]);
      const a = this.rowAnim[i];
      if (k === this.cursor) {
        if (a !== 1 && a !== 2) this.playRow(i, 1);
      } else if (a !== 4 && a !== 5) this.playRow(i, 5);
    }
    const n = rooms.length;
    this.ev.push(n <= LIST_ROWS ? { t: 'scroll', ratio: 1, pos: 0, v: false } : { t: 'scroll', ratio: LIST_ROWS / n, pos: this.top / (n - LIST_ROWS), v: true });
  }

  /** 위/아래 [판독 6절] — 바뀌었으면 true */
  move(io: OIO, n: number): boolean {
    if (n <= 0) return false;
    this.cursor = Math.max(0, Math.min(this.cursor, n - 1));
    this.top = Math.max(0, this.top);
    const up = io.hold & BTN.DPAD_DOWN ? BTN.DPAD_UP : BTN.UP;
    const down = io.hold & BTN.DPAD_UP ? BTN.DPAD_DOWN : BTN.DOWN;
    let next = this.cursor;
    if (io.trig & up) next = this.cursor < 1 ? n - 1 : this.cursor - 1;
    else if (io.rep & up) next = this.cursor - (this.cursor > 0 ? 1 : 0);
    else if (io.trig & down) next = this.cursor + 1 >= n ? 0 : this.cursor + 1;
    else if (io.rep & down) next = this.cursor + 1 >= n ? this.cursor : this.cursor + 1;
    if (next === this.cursor) return false;
    while (this.top > next) this.top--;
    while (next >= this.top + LIST_ROWS && this.top + 1 < n) this.top++;
    this.cursor = next;
    this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR' });
    return true;
  }

  rowsAnimating(): boolean {
    return this.rowAnim.some((a) => a === 1 || a === 3 || a === 5);
  }

  /** 애니 끝 → on→cursor, off→normal(UpdateLayout) */
  settle(io: OIO): void {
    for (let i = 0; i < LIST_ROWS; i++) {
      const a = this.rowAnim[i];
      if ((a === 1 || a === 5) && io.done('list', `x_btn_0${i}`)) this.playRow(i, a === 1 ? 2 : 4);
      else if (a === 3 && io.done('list', `x_btn_0${i}`)) this.rowAnim[i] = 2;
    }
  }
}

/** menu00::ComUiNetSessionInfo [판독 4.5] */
export class SessionInfoPanel {
  readonly life: Life;
  hasPass = false;

  constructor(private readonly ev: Sink) {
    this.life = new Life(ev, 'info');
    for (const [p, l] of [
      ['x_text_title', 'mn01_friend_ui_info_title'],
      ['x_text_room_00', 'mn01_friend_ui_info_IDTitle'],
      ['x_text_lock_00', 'mn01_friend_ui_info_passTitle'],
      ['x_text_lock_02', 'mn01_friend_ui_info_passOpen'],
      ['x_text_no_00', 'mn01_friend_ui_info_voice01'],
    ] as const)
      ev.push({ t: 'text', l: 'info', path: p, label: l });
  }

  start(id: string, password: string): void {
    this.hasPass = password !== '';
    this.ev.push({ t: 'text', l: 'info', path: 'x_text_room_01', label: 'mn01_friend_ui_info_ID', ins: { Text0: id } });
    this.ev.push({ t: 'vis', l: 'info', path: 'x_text_lock_01', v: false });
    this.ev.push({ t: 'vis', l: 'info', path: 'x_text_lock_02', v: this.hasPass });
    this.ev.push({ t: 'vis', l: 'info', path: 'x_text_no_00', v: !this.hasPass });
    if (this.hasPass) this.ev.push({ t: 'text', l: 'info', path: 'x_text_lock_01', label: 'mn01_friend_ui_info_pass', ins: { Text0: password } });
    this.life.in();
    this.ev.push({ t: 'guide', labels: ['sys_ctrl_back'] });
  }

  update(io: OIO): void {
    this.life.update(io);
    if (!this.life.idle) return;
    if (this.hasPass) {
      const show = (io.hold & BTN.X) !== 0;
      this.ev.push({ t: 'vis', l: 'info', path: 'x_text_lock_01', v: show });
      this.ev.push({ t: 'vis', l: 'info', path: 'x_text_lock_02', v: !show });
    }
    if (io.trig & BTN.B) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL_S' });
      this.life.out();
      this.ev.push({ t: 'guide', labels: null });
    }
  }
}

/** menu00::ComUiNetLobbySessionStatus [판독 4.6·5.5] */
export class LobbyStatusPanel {
  readonly life: Life;
  on = false;
  telop = -1;
  count = -1;
  eight = false;
  host = false;
  private guideKey = '';

  constructor(private readonly ev: Sink) {
    this.life = new Life(ev, 'lobby');
    ev.push({ t: 'text', l: 'lobby', path: 'x_parts_tlp/x_text_00', label: 'mn01_friend_tlp_lobby_wait' });
    ev.push({ t: 'text', l: 'lobby', path: 'x_parts_tlp/x_text_01', label: 'mn01_friend_tlp_lobby_start' });
  }

  start(): void {
    this.on = true;
    this.telop = -1;
    this.count = -1;
    this.guideKey = '';
  }

  finish(): void {
    this.on = false;
    this.life.out();
  }

  /** SetTelop: 0→1 move_00→normal_01, 1→0 move_01→normal_00, 처음은 normal_0s */
  private setTelop(s: number): void {
    if (s === this.telop) return;
    const p = 'x_parts_tlp';
    if (this.telop === -1) this.ev.push({ t: 'play', l: 'lobby', path: p, tag: s ? 'normal_01' : 'normal_00' });
    else this.ev.push({ t: 'play', l: 'lobby', path: p, tag: s ? 'move_00' : 'move_01', next: s ? 'normal_01' : 'normal_00' });
    this.telop = s;
  }

  /** 매 틱(켬일 때): 세션 없음 → Out, 있음 → 텔롭·인원·안내 */
  update(io: OIO, s: { inSession: boolean; ready: boolean; count: number; eight: boolean; host: boolean; canInvite: boolean }): void {
    this.life.update(io);
    if (!this.on) return;
    if (!s.inSession) {
      this.life.out();
      return;
    }
    this.life.in();
    this.eight = s.eight;
    this.host = s.host;
    this.setTelop(s.ready ? 1 : 0);
    if (s.count !== this.count) {
      this.count = s.count;
      const label = s.eight ? 'mn01_friend_tlp_lobby_number01' : 'mn01_friend_tlp_lobby_number00';
      this.ev.push({ t: 'text', l: 'lobby', path: 'x_parts_tlp/x_text_num_00', label, ins: { Number0: s.count } });
      this.ev.push({ t: 'text', l: 'lobby', path: 'x_parts_tlp/x_text_num_01', label, ins: { Number0: s.count } });
    }
    const key = `${s.host}/${s.canInvite}`;
    if (key !== this.guideKey) {
      this.guideKey = key;
      const g = 'x_parts_tlp/x_text_guide_0';
      this.ev.push({ t: 'vis', l: 'lobby', path: `${g}0`, v: true });
      this.ev.push({ t: 'vis', l: 'lobby', path: `${g}1`, v: s.host && s.canInvite });
      this.ev.push({ t: 'vis', l: 'lobby', path: `${g}2`, v: s.host });
      if (s.host) {
        this.ev.push({ t: 'text', l: 'lobby', path: `${g}0`, label: 'mn01_friend_ctrl_lobby_info' });
        this.ev.push({ t: 'text', l: 'lobby', path: `${g}1`, label: 'mn01_friend_ctrl_lobby_invite' });
        this.ev.push({ t: 'text', l: 'lobby', path: `${g}2`, label: 'mn01_friend_ctrl_lobby_dismiss' });
      } else this.ev.push({ t: 'text', l: 'lobby', path: `${g}0`, label: 'mn01_friend_ctrl_lobby_leave' });
    }
  }
}

/** matching00::ComUiStateTelop [판독 5.7 ChangeMessage] — 상태 0 없음, 1 시작 문구 고정, 2 찾는 중, 3 성공 */
export class StateTelopPanel {
  state = 0;
  constructor(private readonly ev: Sink) {}

  start(): void {
    this.ev.push({ t: 'show', l: 'mtlp', v: true });
    this.ev.push({ t: 'text', l: 'mtlp', path: 'x_text_search', label: 'mtch00_tlp_wait' });
    if (this.state !== 2) this.ev.push({ t: 'play', l: 'mtlp', path: '', tag: 'normal_search' });
    this.state = 2;
  }

  change(t: 0 | 1 | 2): void {
    if (t === 0) {
      this.ev.push({ t: 'text', l: 'mtlp', path: 'x_text_search', label: 'mtch00_tlp_wait' });
      if (this.state === 2) return;
      this.ev.push({ t: 'play', l: 'mtlp', path: '', tag: 'to_search' });
      this.state = 2;
    } else if (t === 1) {
      this.ev.push({ t: 'text', l: 'mtlp', path: 'x_text_ready', label: 'mtch00_tlp_loading' });
      this.ev.push({ t: 'play', l: 'mtlp', path: '', tag: 'to_ready' });
      this.state = 3;
    } else {
      this.ev.push({ t: 'text', l: 'mtlp', path: 'x_text_ready', label: 'mtch00_tlp_start' });
      if (this.state === 1) return;
      this.ev.push({ t: 'play', l: 'mtlp', path: '', tag: 'normal_ready' });
      this.state = 1;
    }
  }

  out(): void {
    this.ev.push({ t: 'show', l: 'mtlp', v: false });
  }
}

/** 얼굴 텍스처 키 */
export const faceKey = (chara: number): string => `face_128_${CHARA_PC[chara] ?? CHARA_PC[0]}^u`;
