/**
 * 공용 bq UI 대체 부품 [설계, online.md 9.3] — 대화상자(sys_dialog_00), 숫자 입력(swkbd 대체, sys_dialog_00 둘째 인스턴스),
 * 로딩 텔롭(sys_tlp_loading_00), 타이머(sys_timer_00), 매칭 참가자 판(matching00_base_member_00 + win_member_00).
 * 원본 엔진 동작(ComUiDialogBox·UiNoticeModule·ComUiLoadingTelop·ComUiTimer)은 미분석 → 레이아웃·문구만 원본, 동작은 단순.
 */
import { BTN, type RoomMember } from './types';
import { Life, type Ins, type OIO, type Sink } from './panels';

export interface DialogSpec {
  label: string;
  ins?: Ins;
  /** 선택지 라벨 0~3개 */
  choices?: string[];
  /** 기본 커서 */
  initial?: number;
  /** B 로 닫을 수 있으면 그 결과 번호 */
  cancel?: number;
  /** 결정 SE(칸별), 없으면 SQ_SE_SYS_DECI */
  deciSe?: Record<number, string>;
}

/** 대화상자: in → 대기(좌우·A·B) → out. 결과 = 선택 번호, 선택지 없으면 0 */
export class DialogBox {
  readonly life: Life;
  private spec: DialogSpec | null = null;
  cursor = 0;
  result = -1;

  constructor(
    private readonly ev: Sink,
    readonly l: 'dialog' | 'keypad' = 'dialog',
  ) {
    this.life = new Life(ev, l);
  }

  get working(): boolean {
    return this.life.st !== -1;
  }

  open(s: DialogSpec): void {
    this.spec = s;
    this.result = -1;
    const n = s.choices?.length ?? 0;
    this.cursor = s.initial ?? 0;
    this.ev.push({ t: 'text', l: this.l, path: 'x_text', label: s.label, ins: s.ins });
    this.ev.push({ t: 'vis', l: this.l, path: 'x_alignment_choise', v: n > 0 });
    for (let i = 0; i < 3; i++) {
      const p = `x_choise_0${i}`;
      this.ev.push({ t: 'vis', l: this.l, path: p, v: i < n });
      if (i < n) this.ev.push({ t: 'text', l: this.l, path: `${p}/x_text_dialog`, label: s.choices![i] });
    }
    this.ev.push({ t: 'dialogLayout', l: this.l, n });
    this.paint(true);
    this.life.out(true);
    this.life.in();
  }

  private paint(imm: boolean): void {
    const n = this.spec?.choices?.length ?? 0;
    for (let i = 0; i < n; i++) {
      const on = i === this.cursor;
      this.ev.push({ t: 'play', l: this.l, path: `x_choise_0${i}`, tag: imm ? (on ? 'cursor' : 'normal') : on ? 'on' : 'off', next: imm ? undefined : on ? 'cursor' : 'normal' });
    }
  }

  close(r: number): void {
    this.result = r;
    this.life.out();
  }

  update(io: OIO): void {
    this.life.update(io);
    if (!this.life.idle || !this.spec || this.result >= 0) return;
    const n = this.spec.choices?.length ?? 0;
    const t = io.trig;
    if (t & BTN.A) {
      this.ev.push({ t: 'se', label: this.spec.deciSe?.[this.cursor] ?? 'SQ_SE_SYS_DECI' });
      if (n > 0) this.ev.push({ t: 'play', l: this.l, path: `x_choise_0${this.cursor}`, tag: 'press' });
      this.close(n > 0 ? this.cursor : 0);
    } else if (t & BTN.B && this.spec.cancel !== undefined) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL' });
      this.close(this.spec.cancel);
    } else if (n > 1 && t & BTN.LEFT && this.cursor > 0) {
      this.cursor--;
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR' });
      this.paint(false);
    } else if (n > 1 && t & BTN.RIGHT && this.cursor < n - 1) {
      this.cursor++;
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR' });
      this.paint(false);
    }
  }
}

/** 숫자 키보드(swkbd 대체): 위/아래 = 숫자, 좌우 = 자리, A = 확정, B = 취소(null) [설계] */
export class Keypad {
  readonly life: Life;
  digits: number[] = [];
  pos = 0;
  result: string | null | undefined = undefined;
  private header = '';

  constructor(private readonly ev: Sink) {
    this.life = new Life(ev, 'keypad');
  }

  get working(): boolean {
    return this.life.st !== -1;
  }

  open(headerLabel: string, len: number): void {
    this.digits = new Array<number>(len).fill(0);
    this.pos = 0;
    this.result = undefined;
    this.header = headerLabel;
    this.ev.push({ t: 'vis', l: 'keypad', path: 'x_alignment_choise', v: false });
    this.paint();
    this.life.out(true);
    this.life.in();
  }

  /** 시험·외부 입력: 바로 값 넣기 */
  set(value: string): void {
    this.digits = value.split('').map((c) => Number(c) || 0);
    this.paint();
  }

  private paint(): void {
    const s = this.digits.map((d, i) => (i === this.pos ? `(${d})` : ` ${d} `)).join('');
    this.ev.push({ t: 'text', l: 'keypad', path: 'x_text', label: this.header, suffix: `\n${s}` });
    this.ev.push({ t: 'dialogLayout', l: 'keypad', n: 0 });
  }

  update(io: OIO): void {
    this.life.update(io);
    if (!this.life.idle || this.result !== undefined) return;
    const t = io.trig | io.rep;
    if (io.trig & BTN.A) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_DECI' });
      this.result = this.digits.join('');
      this.life.out();
    } else if (io.trig & BTN.B) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL' });
      this.result = null;
      this.life.out();
    } else if (t & (BTN.UP | BTN.DOWN)) {
      this.digits[this.pos] = (this.digits[this.pos] + (t & BTN.UP ? 1 : 9)) % 10;
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR' });
      this.paint();
    } else if (io.trig & BTN.LEFT && this.pos > 0) {
      this.pos--;
      this.paint();
    } else if (io.trig & BTN.RIGHT && this.pos < this.digits.length - 1) {
      this.pos++;
      this.paint();
    }
  }
}

/** bq::ComUiLoadingTelop(sys_tlp_loading_00) — 문구 sys_network_load_tlp, 아이콘 반복 */
export class LoadingTelop {
  readonly life: Life;
  constructor(private readonly ev: Sink) {
    this.life = new Life(ev, 'loading');
    ev.push({ t: 'text', l: 'loading', path: 'x_text_mess', label: 'sys_network_load_tlp' });
  }

  in(): void {
    this.life.in();
    this.ev.push({ t: 'play', l: 'loading', path: 'x_parts_icon', tag: 'normal' });
  }
}

/** bq::ComUiTimer(sys_timer_00) — 남은 초를 숫자 그림(sys_num_time_00 세로 10칸 [추정 0..9 위부터])으로 [설계] */
export class TimerView {
  readonly life: Life;
  shown = -1;
  constructor(private readonly ev: Sink) {
    this.life = new Life(ev, 'timer');
  }

  set(sec: number): void {
    const v = Math.max(0, Math.ceil(sec));
    if (v === this.shown) return;
    this.shown = v;
    const s = String(Math.min(999, v));
    for (let n = 1; n <= 3; n++)
      for (let k = 0; k < n; k++) this.ev.push({ t: 'vis', l: 'timer', path: `x_num_${n}_${k}`, v: n === s.length });
    for (let k = 0; k < s.length; k++) this.ev.push({ t: 'raw', l: 'timer', path: `#digit:x_num_${s.length}_${k}`, s: s[s.length - 1 - k] });
  }
}

/** matching00::ComUiPlayerList 단순판 — 인원 칸 x_null_N_iP 에 win_member_00(얼굴·이름) [설계: 랭크·실력 아이콘 숨김] */
export class MemberList {
  readonly life: Life;
  members: RoomMember[] = [];
  constructor(private readonly ev: Sink) {
    this.life = new Life(ev, 'member');
  }

  start(members: RoomMember[]): void {
    this.members = members;
    const n = members.length <= 2 ? 2 : members.length <= 4 ? 4 : members.length <= 8 ? 8 : 20;
    for (const k of [2, 4, 8, 20]) this.ev.push({ t: 'vis', l: 'member', path: `x_null_${k}`, v: k === n });
    this.life.in();
  }

  /** 칸 이름(view 가 win_member_00 을 그 자리에 그린다) */
  slot(i: number): string {
    const n = this.members.length <= 2 ? 2 : this.members.length <= 4 ? 4 : this.members.length <= 8 ? 8 : 20;
    return `x_null_${n}_${i + 1}P`;
  }
}
