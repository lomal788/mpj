/**
 * 스탬프 bq::UiStamp / bq::ComUiStamp / 조작부(안내·목록) — docs/shell/plaza_3d.md §5.1 ②.
 * 판독 C: analysis/decomp/plaza_main_stamp.c·plaza_main_stamp_list.c. 상태만(LayoutInst 를 직접 바꾼다).
 */
import { RepeatGen } from '@app/scene/menu/charselect/state';
import type { LayoutInst } from '@game/lib/layout';
import { plainText, type MgmDrawHost } from '@app/common/ui';
import { stampTexture, UI_LAYOUT, type StampDef } from './data';

/** 입력 비트(bex) [판독 FUN_7100356e20·FUN_710035c9b4] */
export const STAMP_BTN = {
  A: 0x1,
  B: 0x2,
  X: 0x4,
  Y: 0x8,
  L_ZL: 0x50,
  R_ZR: 0xa0,
  LEFT: 0x10100,
  RIGHT: 0x40200,
  UP: 0x20800,
  DOWN: 0x80400,
  STICK: 0xf0000,
} as const;

/** stamp_00 의 inout 길이(−25..65) [데이터] */
export const STAMP_INOUT_FRAMES = 90;

/** bq::ComUiStamp — 말풍선 한 번(inout) [판독 @0x7100359c98·PlayInout @0x7100358904·FUN_71003585e0] */
export class StampBalloon {
  readonly inst: LayoutInst;
  /** −1 없음, 0 재생 중, 2 끝(IsFinished = 상태 > 1) */
  st = -1;
  stamp = -1;
  frames = 0;
  constructor(private readonly host: MgmDrawHost) {
    this.inst = host.layout('stamp_00');
    this.inst.visible = false;
  }

  /** 그림(x_stamp_00 칸 0)·글자(x_text_00 = 메시지 라벨)·글자색(데이터 RGB) 다음 inout */
  play(s: StampDef, chara: number): void {
    this.stamp = s.id;
    this.inst.setTexture('x_stamp_00', 0, stampTexture(s, chara));
    const texts = this.host.spec.texts;
    const str = plainText(texts[s.label] ?? '', texts);
    for (const p of ['x_text_00', 'x_text_00_shadow']) this.inst.setText(p, str);
    const f = this.inst.find('x_text_00');
    if (f) f[0].nodes[f[1]].vc = [0, 1, 2, 3].map(() => [s.color[0], s.color[1], s.color[2], 255]);
    this.inst.play('inout');
    this.inst.visible = true;
    this.st = 0;
    this.frames = 0;
  }

  get finished(): boolean {
    return this.st !== 0;
  }

  update(df: number): void {
    if (this.st !== 0) return;
    this.inst.update(df);
    this.frames += df;
    if (this.inst.done) {
      this.inst.visible = false;
      this.st = 2;
    }
  }
}

/** 단순 수명(−1 숨김, 0 in, 1 대기, 2 out). out(imm) = 바로 숨김 [판독 FUN_710035d858·d8ac·d39c·d31c] */
class Life {
  st = -1;
  constructor(readonly inst: LayoutInst) {
    inst.visible = false;
  }
  in(imm = false): void {
    this.inst.visible = true;
    this.inst.play(imm ? 'normal' : 'in');
    this.st = imm ? 1 : 0;
  }
  out(imm = false): void {
    if (imm) {
      this.inst.visible = false;
      this.st = -1;
      return;
    }
    if (this.st === -1 || this.st === 2) return;
    this.inst.play('out');
    this.st = 2;
  }
  update(df: number): void {
    this.inst.update(df);
    if (this.st === 0 && this.inst.done) {
      this.inst.play('normal');
      this.st = 1;
    } else if (this.st === 2 && this.inst.done) {
      this.inst.visible = false;
      this.st = -1;
    }
  }
}

export type StampEvent = { t: 'se'; label: string } | { t: 'vib'; label: string } | { t: 'send'; stamp: number } | { t: 'list'; open: boolean };

/**
 * 조작부(FUN_7100355b30·FUN_7100356e20) + 목록(FUN_710035ae30·FUN_710035c9b4) + 안내(FUN_710035d564).
 * 로컬 사람(조작 플레이어 제외, §8)마다 하나. 목록 = 이 기기 사람 ≥ 2 이면 sys_stamp_list_00(6칸), 1명이면 sys_stamp_list_01(8칸).
 */
export class StampCtrl {
  readonly guide: Life;
  readonly list: Life;
  /** +0x3c: −1 꺼짐, 0/1 켜짐 */
  st = -1;
  /** +0xed: 목록을 한 번 열었다 */
  opened = false;
  cursor = 0;
  top = 0;
  readonly perPage: number;
  readonly solo: boolean;
  private readonly reps = new RepeatGen();

  constructor(
    private readonly host: MgmDrawHost,
    readonly pid: number,
    readonly chara: number,
    readonly items: readonly number[],
    readonly shortcuts: readonly number[],
    localHumans: number,
    private readonly stamps: readonly StampDef[],
  ) {
    this.solo = localHumans < 2;
    this.perPage = this.solo ? 8 : 6;
    this.guide = new Life(host.layout(UI_LAYOUT.stampGuide));
    const texts = host.spec.texts;
    const g = plainText(texts['smp_ctrl_several_top'] ?? '', texts);
    for (const p of ['x_text_00']) this.guide.inst.setText(p, g);
    this.list = new Life(host.layout(this.solo ? UI_LAYOUT.stampListSolo : UI_LAYOUT.stampListMulti));
    if (this.solo) {
      this.list.inst.setText('x_text_close', plainText(texts['smp_oneList_ctrl_back'] ?? '', texts));
      this.list.inst.setText('x_text_close_shadow', plainText(texts['smp_oneList_ctrl_back'] ?? '', texts));
      this.list.inst.setText('x_text_stamp', plainText(texts['smp_oneList_ctrl_muteCheck'] ?? '', texts));
      this.list.inst.setText('x_text_stamp_shadow', plainText(texts['smp_oneList_ctrl_muteCheck'] ?? '', texts));
      this.list.inst.setVisible('null_guide_stamp', false);
      this.list.inst.setVisible('null_stamp_on_off', false);
    }
  }

  /** In(imm) [판독 FUN_71003577e0]: imm 이 아니면 안내 "in", 목록은 그대로 */
  in(imm = false): void {
    if (imm) {
      this.list.out(true);
      this.guide.in(true);
    } else this.guide.in(false);
    this.st = imm ? 1 : 0;
    this.opened = false;
  }

  /** Out(imm) [판독 FUN_7100357d50] */
  out(imm = false): void {
    this.list.out(imm);
    this.guide.out(imm);
    this.st = -1;
    this.opened = false;
  }

  /** 목록 칸 그리기 상태 [판독 FUN_710035b8c0·FUN_710035ba00] */
  private refreshList(anim: boolean): void {
    const n = this.items.length;
    for (let i = 0; i < this.perPage; i++) {
      const p = `x_parts_icon_${String(i).padStart(2, '0')}`;
      const k = this.top + i;
      const vis = k < n;
      this.list.inst.setVisible(p, vis);
      if (!vis) continue;
      const s = this.stamps[this.items[k]];
      this.list.inst.setTexture(`${p}/x_icon_stamp`, 0, stampTexture(s, this.chara));
      const icon = this.list.inst.part(p);
      if (icon && anim) icon.play(i === this.cursor ? 'on' : 'off', i === this.cursor ? 'cursor' : 'normal');
      else if (icon) icon.play(i === this.cursor ? 'cursor' : 'normal');
    }
    const cur = this.items[this.top + this.cursor];
    if (cur !== undefined) {
      const texts = this.host.spec.texts;
      this.list.inst.setText('x_parts_text/x_text_00', plainText(texts[this.stamps[cur].listLabel] ?? '', texts));
    }
  }

  /** 목록 In(FUN_710035d31c) */
  openList(): void {
    this.list.in(false);
    this.refreshList(false);
  }

  /** 한 프레임 입력(trig·hold = 이 사람). canSend = 말풍선 없음/끝(FUN_7100357510). 보낼 스탬프 ID 또는 −1 */
  input(trig: number, hold: number, canSend: boolean, ev: StampEvent[]): number {
    if (this.st < 0) return -1;
    const rep = trig | this.reps.next(hold, trig);
    if (this.list.st === 1) {
      const r = this.listInput(trig, rep, canSend, ev);
      if (r >= 0 || this.list.st !== 1) return r;
    }
    if (!this.opened && canSend && trig & STAMP_BTN.STICK) {
      this.guide.out(false);
      this.openList();
      this.opened = true;
      ev.push({ t: 'list', open: true });
    }
    let k = -1;
    if (trig & STAMP_BTN.L_ZL) k = 0;
    else if (trig & STAMP_BTN.R_ZR) k = 1;
    else if (trig & STAMP_BTN.X) k = 2;
    else if (trig & STAMP_BTN.Y) k = 3;
    if (k < 0 || !canSend) return -1;
    return this.send(this.shortcuts[k], ev);
  }

  private send(stamp: number, ev: StampEvent[]): number {
    const wasOpen = this.list.st >= 0;
    this.list.out(true);
    this.guide.out(true);
    if (wasOpen) ev.push({ t: 'list', open: false });
    ev.push({ t: 'vib', label: 'bv_vib_stamp_deci' });
    ev.push({ t: 'send', stamp });
    return stamp;
  }

  /** 목록 입력 [판독 FUN_710035c9b4]: 좌우 = 칸(페이지 안 넘김), 위아래 = 페이지(넘김), A = press + 보내기, B = 닫기(1인 목록, §8) */
  private listInput(trig: number, rep: number, canSend: boolean, ev: StampEvent[]): number {
    const n = this.items.length;
    const per = this.perPage;
    let cur = this.cursor;
    let top = this.top;
    if (rep & STAMP_BTN.LEFT) cur--;
    else if (rep & STAMP_BTN.RIGHT) cur++;
    else if (rep & STAMP_BTN.UP) {
      top -= per;
      if (top < 0) top = Math.floor((n - 1) / per) * per;
    } else if (rep & STAMP_BTN.DOWN) {
      top += per;
      if (top >= n) top = 0;
    }
    const lastPage = Math.floor((n - 1) / per) * per;
    const onPage = top === lastPage ? n - lastPage : per;
    if (cur < 0) cur = onPage - 1;
    else if (cur >= onPage) cur = 0;
    if (top + cur >= n) cur = Math.max(0, n - 1 - top);
    if (cur !== this.cursor || top !== this.top) {
      this.cursor = cur;
      this.top = top;
      ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR_S' });
      ev.push({ t: 'vib', label: 'bv_vib_sys_cursor_s' });
      this.refreshList(true);
    }
    if (trig & STAMP_BTN.A && canSend) {
      const p = `x_parts_icon_${String(this.cursor).padStart(2, '0')}`;
      this.list.inst.part(p)?.play('press', 'cursor');
      return this.send(this.items[(this.top + this.cursor) % n], ev);
    }
    if (this.solo && trig & STAMP_BTN.B) {
      ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL' });
      this.list.out(false);
      ev.push({ t: 'list', open: false });
    }
    return -1;
  }

  update(df: number): void {
    this.guide.update(df);
    this.list.update(df);
  }
}

/** 칸 하나의 스탬프(말풍선 + 로컬이면 조작부) — UiStamp 맵 한 항목 */
export interface StampSlot {
  key: string;
  pid: number;
  chara: number;
  remote: boolean;
  balloon: StampBalloon;
  ctrl: StampCtrl | null;
}
