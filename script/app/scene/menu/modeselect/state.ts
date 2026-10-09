/**
 * 모드 선택 상태기계 — 순수 로직(DOM·three 없음, 노드 시험 tools/test_modeselect.ts).
 * 근거: docs/shell/modeselect.md 3·5절 = menu01.nro ComUiMap::Update @0x71000a5d48, UpdateProcess @0x71000a5f70, Cursor @0x71000a55c0,
 * Start @0x71000a68e4, In/Out @0x71000a6820/688c, OnButton @0x71000a6d78 [판독].
 */

/** bex 입력 비트 [판독: 사용 위치]. 0x8 은 취소에 같이 쓰이는 버튼 [미확정: Y 추정] */
export const PAD = {
  A: 0x1,
  B: 0x2,
  Y: 0x8,
  CANCEL: 0xa,
  DPAD_DOWN: 0x400,
  DPAD_UP: 0x800,
  UP: 0x20800,
  DOWN: 0x80400,
} as const;

export const BUTTONS = 9;
/** 불가 알림 재표시 막기(초) — UpdateProcess `+0x5c = 3.0f` */
export const NOTICE_COOLDOWN = 3.0;
/** CheckModePlayable 반환 → 알림 ID(MODE_PLAYABLE::GetMessageLabel) */
export const NOTICE_ID: Record<number, string> = { 1: 'Notice_PlayModeMissed00', 2: 'Notice_PlayModeMissed01', 3: 'Notice_PlayModeMissed04' };

export type ModeEvent =
  | { type: 'btn'; button: number; anim: string; next?: string }
  | { type: 'icon'; button: number; anim: 'on' | 'off' }
  | { type: 'win'; button: number; visible: boolean }
  | { type: 'text'; button: number }
  | { type: 'layout'; anim: 'in' | 'out' | 'normal_00' }
  | { type: 'visible'; visible: boolean }
  | { type: 'guide'; anim: 'in' | 'out' }
  | { type: 'se'; label: string; button?: number }
  | { type: 'vib'; name: string }
  | { type: 'notice'; id: string }
  | { type: 'decided'; button: number }
  | { type: 'cancel' };

export interface PadFrame {
  trig: number;
  rep: number;
  hold: number;
}

export class ModeSelectState {
  /** −1 숨김, 0 in, 1 대기, 2 out (+0x3c) */
  phase = -1;
  /** +0x38 */
  closing = false;
  /** +0x39 */
  running = false;
  /** +0x54 */
  cursor = -1;
  /** +0x58: 결정 버튼, 9 = 취소, −1 */
  result = -1;
  /** +0x5c (초) */
  noticeTimer = 0;
  readonly shown: boolean[] = [];
  readonly enabled: boolean[] = [];
  readonly playable: number[] = [];
  guideShown = false;
  /** 진행한 프레임 수(시험용) */
  frame = 0;
  private ev: ModeEvent[] = [];

  constructor(private readonly getPlayable: (button: number) => number) {
    this.setup();
    this.setCursor(-1, false);
    this.ev = [];
  }

  /** Setup @0x71000a5080: 보이기(≠4)·가능(==0) */
  setup(): void {
    for (let i = 0; i < BUTTONS; i++) {
      const p = this.getPlayable(i);
      this.playable[i] = p;
      this.shown[i] = p !== 4;
      this.enabled[i] = p === 0;
    }
  }

  /** 보이는 버튼 목록(정렬 순서) */
  list(): number[] {
    const out: number[] = [];
    for (let i = 0; i < BUTTONS; i++) if (this.shown[i]) out.push(i);
    return out;
  }

  /** MapMenuImpl: In(false) → Start() */
  start(): ModeEvent[] {
    this.ev = [];
    this.in(false);
    this.closing = false;
    this.running = true;
    this.result = -1;
    this.setup();
    let c = this.cursor;
    if (c === -1 || !this.shown[c]) {
      c = -1;
      for (let i = 0; i < BUTTONS; i++)
        if (this.shown[i] && this.enabled[i]) {
          c = i;
          break;
        }
    }
    if (c !== -1) this.setCursor(c, false);
    if (this.phase > 1 || this.phase < 0) {
      this.ev.push({ type: 'layout', anim: 'in' });
      this.phase = 0;
      this.ev.push({ type: 'visible', visible: true });
    }
    return this.ev;
  }

  private in(skip: boolean): void {
    if (this.phase >= 0 && this.phase < 2) return;
    this.ev.push({ type: 'layout', anim: skip ? 'normal_00' : 'in' });
    this.phase = skip ? 1 : 0;
    this.ev.push({ type: 'visible', visible: true });
  }

  /** Out(immediate) @0x71000a688c */
  out(immediate: boolean): ModeEvent[] {
    this.ev = [];
    if (this.phase === -1 || this.phase === 2) return this.ev;
    if (immediate) {
      this.phase = -1;
      this.ev.push({ type: 'visible', visible: false });
    } else {
      this.phase = 2;
      this.ev.push({ type: 'layout', anim: 'out' });
    }
    return this.ev;
  }

  get finished(): boolean {
    return this.phase < 0;
  }

  /** OnButton @0x71000a6d78 */
  private onButton(i: number, immediate: boolean): void {
    const en = this.enabled[i];
    if (immediate) this.ev.push({ type: 'btn', button: i, anim: en ? 'cursor' : 'disable_cursor' });
    else this.ev.push({ type: 'btn', button: i, anim: en ? 'on' : 'disable_on', next: en ? 'cursor' : 'disable_cursor' });
  }

  /** Cursor(b, immediate) @0x71000a55c0 */
  setCursor(b: number, immediate: boolean): void {
    this.cursor = b;
    for (let i = 0; i < BUTTONS; i++) {
      if (i === b) this.onButton(i, immediate);
      else this.ev.push({ type: 'btn', button: i, anim: this.enabled[i] ? 'normal' : 'disable_normal' });
    }
    for (let i = 0; i < BUTTONS; i++) {
      this.ev.push({ type: 'icon', button: i, anim: 'off' });
      this.ev.push({ type: 'win', button: i, visible: false });
    }
    if (b >= 0 && b < BUTTONS) {
      this.ev.push({ type: 'icon', button: b, anim: 'on' });
      this.ev.push({ type: 'win', button: b, visible: true });
    }
    this.ev.push({ type: 'text', button: b });
  }

  /** 한 프레임(Update @0x71000a5d48). layoutDone = 레이아웃 애니 끝(IsEndAnimation), dt = 프레임 초 */
  step(pad: PadFrame, layoutDone: boolean, dt = 1 / 60): ModeEvent[] {
    this.ev = [];
    this.frame++;
    if (this.noticeTimer > 0) this.noticeTimer -= dt;
    if (this.phase === 2) {
      if (layoutDone) {
        this.ev.push({ type: 'visible', visible: false });
        this.phase = -1;
      }
    } else if (this.phase === 0 && layoutDone) {
      // "normal_00" 태그는 이 레이아웃에 없다 [데이터] → 마지막 값 유지 [추정]
      this.ev.push({ type: 'layout', anim: 'normal_00' });
      this.phase = 1;
    }
    this.process(pad);
    return this.ev;
  }

  /** UpdateProcess @0x71000a5f70 */
  private process(pad: PadFrame): void {
    if (this.phase !== 1 || !this.running) return;
    if (this.closing) {
      this.running = false;
      if (this.guideShown) {
        this.guideShown = false;
        this.ev.push({ type: 'guide', anim: 'out' });
      }
      if (this.result === 9) this.ev.push({ type: 'cancel' });
      else this.ev.push({ type: 'decided', button: this.result });
      return;
    }
    if (!this.guideShown) {
      this.guideShown = true;
      this.ev.push({ type: 'guide', anim: 'in' });
    }
    const trig = pad.trig;
    if (trig & PAD.CANCEL) {
      this.ev.push({ type: 'se', label: 'SQ_SE_SYS_CANCEL' });
      this.closing = true;
      this.result = 9;
      return;
    }
    const list = this.list();
    if (list.length === 0) {
      this.setCursor(-1, false);
      return;
    }
    let target: number;
    if (this.cursor === -1) target = list[0];
    else {
      const n = list.length;
      let k = list.indexOf(this.cursor);
      if (k < 0) k = 0;
      const up = pad.hold & PAD.DPAD_DOWN ? PAD.DPAD_UP : PAD.UP;
      const down = pad.hold & PAD.DPAD_UP ? PAD.DPAD_DOWN : PAD.DOWN;
      let j: number;
      if (trig & up) j = (n + k - 1) % n;
      else if (pad.rep & up) j = k === 0 ? 0 : k - 1;
      else if (trig & down) j = (k + 1) % n;
      else j = pad.rep & down && k + 1 < n ? k + 1 : k;
      target = list[j];
      if (target === this.cursor) {
        if (trig & PAD.A) this.decide();
        return;
      }
      this.ev.push({ type: 'se', label: 'SQ_SE_SYS_CURSOR', button: target });
      this.ev.push({ type: 'vib', name: 'cursor' });
    }
    this.setCursor(target, false);
  }

  private decide(): void {
    const c = this.cursor;
    if (!this.enabled[c]) {
      // MissButton @0x71000a65d0: "miss" → 다음 "disable_cursor"
      this.ev.push({ type: 'btn', button: c, anim: 'miss', next: 'disable_cursor' });
      this.ev.push({ type: 'se', label: 'SQ_SE_SYS_ERROR' });
      this.ev.push({ type: 'vib', name: 'error' });
      if (this.noticeTimer <= 0) {
        const id = NOTICE_ID[this.playable[c]];
        if (id) {
          this.ev.push({ type: 'notice', id });
          this.noticeTimer = NOTICE_COOLDOWN;
        }
      }
      return;
    }
    this.ev.push({ type: 'btn', button: c, anim: 'press' });
    this.ev.push({ type: 'se', label: 'SQ_SE_SYS_DECI' });
    this.ev.push({ type: 'vib', name: 'deci' });
    this.closing = true;
    this.result = c > 8 ? -1 : c;
  }
}
