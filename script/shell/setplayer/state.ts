/**
 * 플레이어 설정 흐름 상태기계 — bq::ComUiSettingPlayer 의 단계 람다를 제너레이터(Fiber::Wait = yield)로 옮긴 것.
 * DOM·three 없음(노드 시험). 입력 = 컨트롤러 trig 비트, 질의 = 애니 끝·안내 상태, 출력 = 사건 목록.
 * 근거: docs/shell/setplayer.md 3.2·3.3·6.1~6.7. 함수 주소는 각 메서드 주석.
 */
import { FiberRunner, PAD, operationPlayerId, waitUntil, type FiberHandle, type Flow } from '../mgmcommon';
import { ControllerApplet, type ControllerPool } from './applet';
import type { ControllerInput, SetPlayerStartArg, SlotWork } from './types';

export type SpEvent =
  | { k: 'anim'; path: string; tag: string; next?: string }
  | { k: 'se'; label: string; at?: string }
  | { k: 'vib'; name: string }
  | { k: 'title'; mode: 0 | 1 | 2 }
  | { k: 'titleOut' }
  | { k: 'guideIn' }
  | { k: 'guideOut' }
  | { k: 'root'; tag: 'in' | 'normal' }
  | { k: 'bg'; on: boolean }
  | { k: 'applet'; count: number }
  | { k: 'appletClose'; ok: boolean }
  | { k: 'account'; pid: number }
  | { k: 'name'; pid: number; current: string; maxLen: number }
  | { k: 'charSelect' }
  | { k: 'charSelectOut' }
  | { k: 'done'; cancelled: boolean };

/** 화면 쪽 질의(애니 끝 = 원본 vt+0x1d0 || vt+0x1c8: 끝났거나 반복 중) */
export interface SpEnv {
  idle(path: string): boolean;
  /** ComUiGuide00::IsFinished(숨김) */
  guideFinished(): boolean;
  /** ComUiGuide00::IsIdle */
  guideIdle(): boolean;
}

/** 캐릭터 수(표 0..21, selectCharacterList) */
export const CHARA_COUNT = 22;
/** 소프트웨어 키보드 최대 글자 수 [추정 setplayer.md 6.7] */
export const NAME_MAX = 10;

export const USER = 'x_parts_user';
export const CURSOR_NUM = 'x_parts_user/x_cursor_num';
export const BTN_OK = 'x_parts_user/x_btn_ok';
export const win = (n: number, k: number): string => `x_parts_user/x_user_${n}_${k}P`;
/** N = 2..4 인원 창 전부(FUN_7100347c80·9030·9260·9940 의 대상) */
export const MULTI_WINS: readonly string[] = [2, 3, 4].flatMap((n) => Array.from({ length: n }, (_, i) => win(n, i + 1)));
/** 1인 창 포함(FUN_710034794c·9f24) */
export const ALL_WINS: readonly string[] = [win(1, 1), ...MULTI_WINS];

const isGuest = (s: SlotWork | undefined): boolean => !s || s.manageIdx === -1;

export class SetPlayerFlow {
  /** +0x38 단계: 0 인원·1 컨트롤러·2 유저·3 캐릭터·4 끝 */
  step = 0;
  /** +0x3c −1 숨김·0 in·1 정상·2 out */
  uiState = -1;
  /** +0x40 */
  count = 1;
  /** +0x44 / +0x48 */
  row = -1;
  col = -1;
  /** +0x100 */
  cancelled = false;
  applet: ControllerApplet | null = null;
  doneSent = false;
  events: SpEvent[] = [];
  private readonly runner = new FiberRunner();
  private main: FiberHandle<void> | null = null;
  private sys: FiberHandle<void> | null = null;
  private input: ControllerInput | null = null;
  private account: { pid: number; v: { uid: string; nickname: string } | null } | null = null;
  private named: { pid: number; v: string | null } | null = null;
  private charResult: { decided: boolean; chars?: number[] } | null = null;
  private nextManage = 1;

  constructor(
    readonly arg: SetPlayerStartArg,
    readonly slots: SlotWork[],
    readonly pool: ControllerPool,
    private readonly env: SpEnv,
  ) {}

  private emit(e: SpEvent): void {
    this.events.push(e);
  }

  takeEvents(): SpEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  get finished(): boolean {
    return this.step > 3 || this.step < 0;
  }

  /** 조작 플레이어(GetOperationPlayerId) 컨트롤러의 누름 */
  private opTrig(): number {
    const pid = operationPlayerId(this.slots.map((s) => ({ pid: s.pid, type: s.type })));
    const id = pid >= 0 ? this.pool.assign[pid] : null;
    return id && this.input ? this.input.poll(id).trig : 0;
  }

  /** Start @0x710034a080 (3.2) */
  start(): void {
    this.cancelled = false;
    const free: number[] = [];
    for (let c = 0; c < CHARA_COUNT; c++) if (this.slots.every((s) => s.type === 1 || s.character !== c)) free.push(c);
    let k = 0;
    for (const s of this.slots) if (s.type !== 0) s.character = free[k++] ?? s.character;
    this.pool.setPlayers(1, 1);
    this.setCount(this.arg.initial);
    this.emit({ k: 'anim', path: CURSOR_NUM, tag: 'cursor' });
    for (const w of ALL_WINS) this.emit({ k: 'anim', path: w, tag: 'normal_number' });
    this.emit({ k: 'anim', path: USER, tag: 'normal_number' });
    this.buttons(-1, -1, false);
    this.uiIn(false);
    this.step = 0;
  }

  /** In @0x7100349b70 */
  private uiIn(skip: boolean): void {
    if (this.uiState === 0 || this.uiState === 1) return;
    this.emit({ k: 'root', tag: skip ? 'normal' : 'in' });
    this.uiState = skip ? 1 : 0;
    if (this.arg.withBg) this.emit({ k: 'bg', on: true });
  }

  /** FUN_71003476a4 (6.1) */
  setCount(n: number): void {
    this.count = Math.max(Math.min(n, this.arg.max), this.arg.min);
    this.slots.forEach((s, i) => (s.type = this.count < i + 1 ? 1 : 0));
  }

  /** FUN_71003454f4 (6.4): row/col = 커서, skip = OK 의 on/off 건너뜀 */
  private buttons(row: number, col: number, skip: boolean): void {
    for (let k = 2; k <= 4; k++) {
      const guest = isGuest(this.slots[k - 1]);
      for (let n = k; n <= 4; n++) {
        this.emit({ k: 'anim', path: `${win(n, k)}/x_parts_btn_00`, tag: row === k && col === 0 ? 'cursor' : 'normal' });
        this.emit({ k: 'anim', path: `${win(n, k)}/x_parts_btn_01`, tag: guest ? (row === k && col === 1 ? 'cursor' : 'normal') : 'disable' });
      }
    }
    if (col === 2) this.emit(skip ? { k: 'anim', path: BTN_OK, tag: 'cursor' } : { k: 'anim', path: BTN_OK, tag: 'on', next: 'cursor' });
    else this.emit(skip ? { k: 'anim', path: BTN_OK, tag: 'normal' } : { k: 'anim', path: BTN_OK, tag: 'off', next: 'normal' });
  }

  private unlink(s: SlotWork): void {
    s.nickname = '';
    s.manageIdx = -1;
    s.uid = '';
  }

  private winAnims(list: readonly string[], tag: string, next: string, userTag: string, userNext: string): void {
    this.emit({ k: 'anim', path: USER, tag: userTag, next: userNext });
    for (const w of list) this.emit({ k: 'anim', path: w, tag, next });
  }

  /** 한 프레임: UI 갱신(FUN_71003462ac) → 단계 파이버 시작(FUN_710034640c) → 파이버 진행 */
  update(input: ControllerInput): void {
    this.input = input;
    if (this.uiState === 0 && this.env.idle('')) this.uiState = 1;
    const mainFree = !this.main || this.main.done;
    const sysFree = !this.sys || this.sys.done;
    if (this.uiState === 1 && this.env.idle(USER) && mainFree && sysFree && this.step >= 0 && this.step <= 3) {
      const f = [this.numberStep, this.controllerStep, this.userStep, this.charaStep][this.step].call(this);
      this.main = this.runner.start(f);
    }
    this.runner.step();
    if (this.finished && !this.doneSent) {
      this.doneSent = true;
      this.emit({ k: 'done', cancelled: this.cancelled });
    }
  }

  private guideEnd(): void {
    if (!this.env.guideFinished()) this.emit({ k: 'guideOut' });
    this.emit({ k: 'titleOut' });
  }

  /** 단계 0 인원 main @0x7100346d00 (6.1) */
  private *numberStep(): Flow {
    this.pool.setPlayers(1, 1);
    this.emit({ k: 'anim', path: CURSOR_NUM, tag: 'cursor' });
    yield* waitUntil(() => this.env.idle(CURSOR_NUM));
    this.emit({ k: 'title', mode: 0 });
    for (;;) {
      if (this.arg.cancelable) {
        if (this.env.guideFinished()) this.emit({ k: 'guideIn' });
      } else if (this.env.guideIdle()) this.emit({ k: 'guideOut' });
      const t = this.opTrig();
      if (this.arg.cancelable && t & PAD.B) {
        this.emit({ k: 'se', label: 'SQ_SE_SYS_CANCEL' });
        this.cancelled = true;
        this.step = 4;
        this.guideEnd();
        return;
      }
      if (t & PAD.A) break;
      let n = this.count;
      let at = '';
      if (t & (PAD.LEFT | PAD.STICK_LEFT) && this.arg.min < this.count) {
        n = this.count - 1;
        at = `${CURSOR_NUM}/cursor_left`;
      }
      if (t & (PAD.RIGHT | PAD.STICK_RIGHT) && this.count < this.arg.max) {
        n = n < this.arg.max ? n + 1 : this.arg.max;
        at = `${CURSOR_NUM}/cursor_right`;
      }
      if (n !== this.count) {
        this.emit({ k: 'se', label: 'SQ_SE_SYS_CURSOR', at });
        this.emit({ k: 'vib', name: 'bv_vib_sys_cursor' });
        this.setCount(n);
        this.emit({ k: 'anim', path: USER, tag: 'in_userwin', next: 'normal_number' });
        for (const w of ALL_WINS) this.emit({ k: 'anim', path: w, tag: 'normal_number' });
        this.emit({ k: 'anim', path: CURSOR_NUM, tag: 'on', next: 'cursor' });
      }
      yield;
    }
    this.emit({ k: 'se', label: 'SQ_SE_SYS_DECI' });
    this.emit({ k: 'vib', name: 'bv_vib_sys_deci' });
    this.emit({ k: 'anim', path: CURSOR_NUM, tag: 'press', next: 'normal' });
    this.setCount(this.count);
    for (const s of this.slots) if (s.pid !== 0 && s.type !== 0) this.unlink(s);
    this.emit({ k: 'anim', path: CURSOR_NUM, tag: 'off', next: 'normal' });
    yield* waitUntil(() => this.env.idle(CURSOR_NUM));
    this.step = 1;
    this.guideEnd();
  }

  /** 단계 1 컨트롤러 main @0x7100347ad0 (6.2). 애플릿은 대체 [설계 9.4] */
  private *controllerStep(): Flow {
    if (this.count > 1) {
      this.pool.setPlayers(this.count, this.count);
      if (!this.pool.minimal()) {
        this.applet = new ControllerApplet(this.pool, this.count);
        this.emit({ k: 'applet', count: this.count });
        yield;
        while (this.applet.state === 'open') {
          if (this.input) this.applet.step(this.input);
          if (this.applet.state !== 'open') break;
          yield;
        }
        this.emit({ k: 'appletClose', ok: this.applet.state === 'ok' });
        this.applet = null;
        if (!this.pool.minimal()) {
          this.step = 0;
          return;
        }
      }
    }
    if (this.count === 1) {
      if (!this.arg.toCharSelect) this.step = 4;
      else {
        this.emit({ k: 'anim', path: USER, tag: 'to_charasel_01', next: 'normal_charasel_01' });
        this.emit({ k: 'anim', path: win(1, 1), tag: 'to_charasel', next: 'normal_charasel' });
        this.step = 3;
      }
      return;
    }
    this.buttons(-1, -1, false);
    this.step = 2;
    this.row = 2;
    this.col = 0;
    this.winAnims(MULTI_WINS, 'to_user', 'normal_user', 'to_user', 'normal_user');
  }

  /** 단계 2 유저 main @0x7100347eb0 (6.3) */
  private *userStep(): Flow {
    this.emit({ k: 'title', mode: 1 });
    this.buttons(this.row, this.col, false);
    for (;;) {
      if (!this.pool.minimal()) {
        this.step = 0;
        break;
      }
      if (this.env.guideFinished()) this.emit({ k: 'guideIn' });
      const t = this.opTrig();
      if (t & PAD.B) {
        this.emit({ k: 'se', label: 'SQ_SE_SYS_CANCEL' });
        this.step = 0;
        break;
      }
      if (t & PAD.A) {
        if (this.col === 2) {
          this.emit({ k: 'se', label: 'SQ_SE_SYS_DECI_L' });
          this.emit({ k: 'vib', name: 'bv_vib_sys_deci_l' });
          this.emit({ k: 'anim', path: BTN_OK, tag: 'press' });
          this.step = this.arg.toCharSelect ? 3 : 4;
          break;
        }
        if (this.col !== 0 && this.col !== 1) break;
        this.emit({ k: 'se', label: 'SQ_SE_SYS_DECI' });
        this.emit({ k: 'vib', name: 'bv_vib_sys_deci' });
        this.press(this.row, this.col);
        const pid = this.row - 2 < 3 && this.row - 2 >= 0 ? this.row - 1 : -1;
        const s = this.slots[pid];
        if (!s) break;
        if (this.col === 1) {
          if (isGuest(s)) this.sys = this.runner.start(this.nameFlow(pid));
        } else if (!isGuest(s)) this.unlink(s);
        else this.sys = this.runner.start(this.accountFlow(pid));
        break;
      }
      let r = this.row;
      let c = this.col;
      if (c < 2) {
        const r1 = r < 4 ? 3 : r;
        if (t & (PAD.LEFT | PAD.STICK_LEFT)) r = r1 - 1;
        let n2 = this.count;
        if (r + 1 < n2) n2 = r + 1;
        if (t & (PAD.RIGHT | PAD.STICK_RIGHT)) r = n2;
        if (!isGuest(this.slots[r - 1])) c = 0;
      }
      if (t & (PAD.DOWN | PAD.STICK_DOWN)) {
        c = c === 0 ? (isGuest(this.slots[r - 1]) ? 1 : 2) : c + 1;
        if (c > 1) c = 2;
      }
      if (t & (PAD.UP | PAD.STICK_UP)) {
        c -= 1;
        if (c === 1) c = isGuest(this.slots[r - 1]) ? 1 : 0;
        if (c < 1) c = 0;
      }
      if (r !== this.row || c !== this.col) {
        this.row = r;
        this.col = c;
        const at = c === 2 ? BTN_OK : `${win(this.count, r)}/x_parts_btn_0${c}`;
        this.emit({ k: 'se', label: 'SQ_SE_SYS_CURSOR', at });
        this.emit({ k: 'vib', name: 'bv_vib_sys_cursor' });
        this.buttons(this.row, this.col, false);
      }
      yield;
    }
    this.guideEnd();
    yield* waitUntil(() => this.env.idle(BTN_OK));
    if (this.step === 3) this.winAnims(MULTI_WINS, 'to_charasel', 'normal_charasel', 'to_charasel_00', 'normal_charasel_00');
    else if (this.step === 0) this.winAnims(MULTI_WINS, 'back_number', 'normal_number', 'back_number_00', 'normal_number');
  }

  /** FUN_7100348d3c: 고른 버튼 press(그 칸이 있는 N 인원 창 전부) */
  private press(row: number, col: number): void {
    for (let n = Math.max(row, 2); n <= 4; n++) this.emit({ k: 'anim', path: `${win(n, row)}/x_parts_btn_0${col}`, tag: 'press' });
  }

  /** 연동 람다 main @0x710034b100 (6.7) — 유저 선택 애플릿 대체 */
  private *accountFlow(pid: number): Flow {
    this.account = null;
    this.emit({ k: 'account', pid });
    yield* waitUntil(() => this.account !== null && this.account.pid === pid);
    const v = this.account!.v;
    this.account = null;
    if (!v) return;
    const s = this.slots[pid];
    if (s.manageIdx !== -1) this.unlink(s);
    s.manageIdx = this.nextManage++;
    s.uid = v.uid;
    s.nickname = v.nickname;
  }

  /** 이름 람다 main @0x710034b340 (6.7) — 소프트웨어 키보드 대체 */
  private *nameFlow(pid: number): Flow {
    const s = this.slots[pid];
    if (s.manageIdx !== -1) return;
    this.named = null;
    this.emit({ k: 'name', pid, current: s.nickname, maxLen: NAME_MAX });
    yield* waitUntil(() => this.named !== null && this.named.pid === pid);
    const v = this.named!.v;
    this.named = null;
    if (v !== null) s.nickname = v.slice(0, NAME_MAX);
  }

  /** 단계 3 캐릭터 선택 main @0x71003494a0 (6.6). 안쪽은 페이지가 runCharSelect 로 [설계 9.5] */
  private *charaStep(): Flow {
    this.emit({ k: 'title', mode: 2 });
    this.charResult = null;
    this.emit({ k: 'charSelect' });
    yield* waitUntil(() => this.charResult !== null);
    const r = this.charResult!;
    if (r.decided) {
      if (r.chars) r.chars.forEach((c, i) => this.slots[i] && (this.slots[i].character = c));
      for (const s of this.slots) s.baseCharacter = s.character;
      this.step = 4;
    } else {
      this.emit({ k: 'charSelectOut' });
      if (this.count === 1) {
        this.emit({ k: 'anim', path: USER, tag: 'back_number_01', next: 'normal_number' });
        this.emit({ k: 'anim', path: win(1, 1), tag: 'back_user', next: 'normal_number' });
        this.step = 0;
      } else {
        this.buttons(-1, -1, false);
        this.winAnims(MULTI_WINS, 'back_user', 'normal_user', 'back_user', 'normal_user');
        this.step = 2;
      }
    }
    this.emit({ k: 'titleOut' });
    yield* waitUntil(() => this.env.idle(USER));
  }

  resolveAccount(pid: number, v: { uid: string; nickname: string } | null): void {
    this.account = { pid, v };
  }

  resolveName(pid: number, v: string | null): void {
    this.named = { pid, v };
  }

  /** 캐릭터 선택 결과(결정 = 칸별 캐릭터 표 번호, 취소 = false) */
  resolveCharSelect(decided: boolean, chars?: number[]): void {
    this.charResult = { decided, chars };
  }
}
