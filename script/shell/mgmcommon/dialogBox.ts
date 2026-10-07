/**
 * 공용 대화상자 bq::ComUiDialogBox — 순수 상태(DialogBoxState: 열기·칸 이동·결정·취소·닫기)와 sys_dialog_00 크기 규칙(layoutDialogBox·resizeSplitWindow).
 * 근거: docs/shell/dialog_box.md 4~6·9.1 (main FUN_7100207c38·FUN_7100208b80·FUN_7100209234·FUN_7100208240·In @0x71002093d0), online.md 9.3 정정 1~7.
 * 메시지 창 선택지(세로 2~4지)는 이 부품이 아니라 messageWindow 의 선택지 API 다(dialog_box.md 1·3.2).
 */
import type { LayoutInst } from '../charselect/scene2d';
import { alignPanes } from './alignment';

/** FUN_7100208240 상수 [판독] + 정렬 ali1 [데이터] */
export const DIALOG_SIZE = {
  btnW0: 520,
  btnMin: 360,
  btnPad: 240,
  winPad: 200,
  textMinW: 1234,
  textMaxW: 1794,
  winMinH: 426,
  winMaxH: 954,
  choiceGap: 20,
  yGap: 34,
} as const;

/** bex 원시 비트 [판독 FUN_7100208b80] */
export const DIALOG_BIT = { A: 0x1, B: 0x2, LEFT: 0x10100, RIGHT: 0x40200 } as const;

export const DIALOG_SE = {
  DECI: 'SQ_SE_SYS_DECI',
  CANCEL: 'SQ_SE_SYS_CANCEL',
  CURSOR: 'SQ_SE_SYS_CURSOR',
  MES_PROC: 'SQ_SE_SYS_MES_PROC',
} as const;

export const DIALOG_VIB = { CURSOR: 'bv_vib_sys_cursor', DECI: 'bv_vib_sys_deci' } as const;

export interface DialogBoxSize {
  btnW: number;
  winW: number;
  winH: number;
}

/** FUN_7100208240: 버튼 폭 = max(min(520, 최대 글자 + 240), 360), 창 폭 = max(n>0 ? n·w + 200 : 200, clamp(글자 + 200, 1234, 1794)), 창 높이 = clamp(버튼 높이 + 글자 높이 + 200, 426, 954) */
export function dialogBoxSize(n: number, choiceMaxW: number, textW: number, textH: number, btnH: number): DialogBoxSize {
  const S = DIALOG_SIZE;
  const btnW = Math.max(Math.min(S.btnW0, choiceMaxW + S.btnPad), S.btnMin);
  const textWin = Math.min(Math.max(textW + S.winPad, S.textMinW), S.textMaxW);
  const winW = n > 0 ? Math.max(n * btnW + S.winPad, textWin) : Math.max(S.winPad, textWin);
  const winH = Math.min(Math.max((n > 0 ? btnH : 0) + textH + S.winPad, S.winMinH), S.winMaxH);
  return { btnW, winW, winH };
}

/** 나눈 창(조각 '창#…') 크기 바꾸기: 모서리는 끝에, 변·가운데는 늘인다(원점 가운데 창) [설계: 조각 재배치] */
export function resizeSplitWindow(inst: LayoutInst, path: string, w: number, h?: number): void {
  const f = inst.find(path);
  if (!f) return;
  const [li, ni] = f;
  const node = li.nodes[ni];
  const sw = node.spec.z[0];
  const sh = node.spec.z[1];
  const hh = h ?? node.z[1];
  node.z = [w, hh];
  for (const ci of node.children) {
    const c = li.nodes[ci];
    const name = c.spec.n;
    if (!name.startsWith(`${node.spec.n}#`)) continue;
    const side = name.slice(node.spec.n.length + 1);
    const [cw, ch] = c.spec.z;
    const left = side.includes('L');
    const right = side.includes('R');
    const top = side.includes('T');
    const bottom = side.includes('B');
    c.t[0] = left ? -(w / 2 - cw / 2) : right ? w / 2 - cw / 2 : 0;
    c.z[0] = left || right ? cw : cw + (w - sw);
    c.t[1] = top ? hh / 2 - ch / 2 : bottom ? -(hh / 2 - ch / 2) : 0;
    c.z[1] = top || bottom ? ch : ch + (hh - sh);
  }
}

/** 글자 페인 경로 → 지금 문구 [폭, 높이] */
export type DialogMeasure = (path: string) => [number, number];

/** sys_dialog_00 인스턴스에 크기 규칙 적용(칸 버튼 폭·x_alignment_choise·창·x_alignment_y) */
export function layoutDialogBox(inst: LayoutInst, n: number, measure: DialogMeasure): DialogBoxSize {
  let maxW = 0;
  for (let i = 0; i < n; i++) maxW = Math.max(maxW, measure(`x_choise_0${i}/x_text_dialog`)[0]);
  let btnH = 0;
  const [tw, th] = measure('x_text');
  const pre = dialogBoxSize(n, maxW, tw, th, 0);
  const w = pre.btnW;
  for (let i = 0; i < n; i++) {
    const part = inst.part(`x_choise_0${i}`);
    if (!part) continue;
    for (const p of ['x_btn', 'x_btn_shadow', 'x_btn_ef']) resizeSplitWindow(part, p, w);
    const bf = part.find('x_btn');
    if (bf) btnH = bf[0].nodes[bf[1]].z[1];
  }
  const choise = inst.find('x_alignment_choise');
  if (choise) {
    const [li, ni] = choise;
    li.nodes[ni].children.forEach((ci, i) => {
      const c = li.nodes[ci];
      if (c.spec.k === 'part') c.z = [i < n ? w : c.spec.z[0], c.z[1]];
    });
  }
  alignPanes(inst, 'x_alignment_choise', { horizontal: true, kind: 1, gap: DIALOG_SIZE.choiceGap, stretch: false });
  const size = dialogBoxSize(n, maxW, tw, th, btnH);
  resizeSplitWindow(inst, 'x_win_dialog', size.winW, size.winH);
  const y = inst.find('x_alignment_y');
  if (y) {
    const [li, ni] = y;
    for (const ci of li.nodes[ni].children) {
      const c = li.nodes[ci];
      if (c.spec.n === 'x_text') c.z = [c.spec.z[0], th];
    }
  }
  alignPanes(inst, 'x_alignment_y', { horizontal: false, kind: 1, gap: DIALOG_SIZE.yGap, stretch: false });
  return size;
}

/** 상태 사건 — 그리는 쪽이 칸 부품(x_choise_0N) 애니·소리·진동으로 옮긴다 */
export type DialogEvent =
  | { t: 'anim'; choice: number; tag: string; next?: string }
  | { t: 'visible'; choice: number; v: boolean }
  | { t: 'se'; label: string }
  | { t: 'se2d'; label: string; choice: number }
  | { t: 'vib'; label: string }
  | { t: 'nullCursor'; v: boolean }
  | { t: 'arrowIcon'; v: boolean };

export interface DialogInputResult {
  close: boolean;
  ev: DialogEvent[];
}

/** bq::ComUiDialogBox 상태(+0x38 0 끝·1 in·2 대기·3 out) */
export class DialogBoxState {
  st = 0;
  /** +0x3c (0 일반, 2 로딩) */
  type = 0;
  /** +0x90 */
  count = 0;
  /** +0x4c */
  initial = 0;
  /** +0x44 */
  cursor = -1;
  /** +0x48 */
  result = -1;
  /** +0x96 */
  cancelEnable = false;
  /** +0x74 (기본 A) */
  hidButton: number = DIALOG_BIT.A;
  /** +0x50.. */
  disabled = [false, false, false];
  /** +0x140 / +0x158 (빈 문자열 = 기본) */
  deciSe = ['', '', ''];
  deciVib = ['', '', ''];
  /** +0xa0 / +0xa4 */
  private reqChoice = -1;
  private reqDecide = false;

  /** SetChoiceCount(1..3, 밖이면 원본 abort) */
  setChoiceCount(n: number): void {
    if (n < 1 || n > 3) throw new Error(`mgmcommon: 대화상자 선택지 수 ${n} (1..3)`);
    this.count = n;
  }

  isEnd(): boolean {
    return this.st < 1;
  }

  isWorking(): boolean {
    return this.st > 0;
  }

  /** In(imm) @0x71002093d0: 상태 1(in) 또는 2(즉시), 커서·결과 −1, 선택지 있으면 커서 = 기본, 칸 cursor/normal/disable */
  open(imm = false): DialogEvent[] {
    const ev: DialogEvent[] = [];
    this.st = imm ? 2 : 1;
    this.cursor = -1;
    this.result = -1;
    if (this.type === 0 && this.count > 0) {
      this.cursor = this.initial;
      for (let i = 0; i < this.count; i++) {
        ev.push({ t: 'anim', choice: i, tag: this.disabled[i] ? 'disable' : i === this.cursor ? 'cursor' : 'normal' });
        ev.push({ t: 'visible', choice: i, v: true });
      }
    }
    ev.push({ t: 'arrowIcon', v: false });
    ev.push({ t: 'nullCursor', v: false });
    return ev;
  }

  /** 틱 상태 1: in 애니 끝 → 2 */
  inDone(): void {
    if (this.st === 1) this.st = 2;
  }

  /** Out(imm) @0x71002080e4: 상태 1·2 에서만. imm 이면 바로 초기화 */
  out(imm = false): void {
    if (this.st !== 1 && this.st !== 2) return;
    if (imm) {
      this.reset();
      this.st = 0;
    } else this.st = 3;
  }

  /** 틱 상태 3: out 애니 끝 → 초기화, 0 */
  outDone(): void {
    if (this.st !== 3) return;
    this.reset();
    this.st = 0;
  }

  /** FUN_710020792c (결과 +0x48 은 남긴다) */
  private reset(): void {
    this.type = 0;
    this.reqChoice = -1;
    this.initial = 0;
    this.disabled = [false, false, false];
    this.count = 0;
    this.cancelEnable = false;
    this.reqDecide = false;
    this.deciSe = ['', '', ''];
    this.deciVib = ['', '', ''];
  }

  /** RequestChoice @0x710020a5f8: 대기·일반·선택지 있음·범위 안·불가 아님일 때만 예약 */
  requestChoice(i: number): void {
    if (this.st === 2 && this.type === 0 && this.count > 0 && i >= 0 && i < this.count && !this.disabled[i]) this.reqChoice = i;
  }

  /** RequestDecide @0x710020a638: 선택지 없음 = MES_PROC + 예약(다음 입력에서 닫힘), 있음 = 결과·press·SE 만 */
  requestDecide(): DialogEvent[] {
    if (this.st !== 2 || this.type !== 0) return [];
    if (this.count === 0) {
      this.reqDecide = true;
      return [{ t: 'se', label: DIALOG_SE.MES_PROC }];
    }
    if (this.cursor > 2) return [];
    this.result = this.cursor;
    return [
      { t: 'anim', choice: this.cursor, tag: 'press' },
      { t: 'se', label: this.deciSe[this.cursor] || DIALOG_SE.DECI },
    ];
  }

  /** FUN_7100208b80(선택지) / FUN_7100209234(없음): 상태 2·일반 형식에서만. human = 로컬 사람(칸 커서·화살표 보이기) */
  input(trig: number, human = true): DialogInputResult {
    const ev: DialogEvent[] = [];
    if (this.st !== 2 || this.type !== 0) return { close: false, ev };
    if (this.count === 0) {
      let close = false;
      if (this.reqDecide) {
        this.reqDecide = false;
        close = true;
      } else if (trig & this.hidButton) {
        ev.push({ t: 'se', label: DIALOG_SE.MES_PROC });
        close = true;
      }
      if (human) ev.push({ t: 'arrowIcon', v: true });
      return { close, ev };
    }
    const decideHit = (trig & this.hidButton) !== 0;
    const ext = this.reqDecide;
    if (!ext && !decideHit) {
      if (trig & DIALOG_BIT.B && this.cancelEnable) {
        ev.push({ t: 'se', label: DIALOG_SE.CANCEL });
        this.result = -1;
        return { close: true, ev };
      }
      const cur = this.cursor;
      let to = cur;
      if (this.reqChoice !== -1) {
        to = this.reqChoice;
        this.reqChoice = -1;
      } else if (trig & DIALOG_BIT.LEFT) {
        for (let i = this.count - 1; i >= 0; i--) {
          if (i < cur && !this.disabled[i]) {
            to = i;
            break;
          }
        }
      } else if (trig & DIALOG_BIT.RIGHT) {
        for (let i = 0; i < this.count; i++) {
          if (i > cur && !this.disabled[i]) {
            to = i;
            break;
          }
        }
      }
      if (to !== cur) {
        this.cursor = to;
        for (let i = 0; i < this.count; i++) {
          if (this.disabled[i]) continue;
          const on = i === to;
          ev.push({ t: 'anim', choice: i, tag: on ? 'on' : 'off', next: on ? 'cursor' : 'normal' });
        }
        ev.push({ t: 'se2d', label: DIALOG_SE.CURSOR, choice: to });
        ev.push({ t: 'vib', label: DIALOG_VIB.CURSOR });
      }
      if (human) ev.push({ t: 'nullCursor', v: true });
      return { close: false, ev };
    }
    this.reqDecide = false;
    if (decideHit) {
      this.result = this.cursor;
      ev.push({ t: 'anim', choice: this.cursor, tag: 'press' });
      ev.push({ t: 'se', label: this.deciSe[this.cursor] || DIALOG_SE.DECI });
      ev.push({ t: 'vib', label: this.deciVib[this.cursor] || DIALOG_VIB.DECI });
    }
    if (human) ev.push({ t: 'nullCursor', v: true });
    return { close: true, ev };
  }
}
