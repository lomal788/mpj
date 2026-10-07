/**
 * 장소 텔롭 menu00::ComUiLocationTelop · 다가가기 안내 bq::ComUiPopGuide · 온라인 안내 menu00::ComUiOnlineGuide — docs/shell/plaza_3d.md §5.1 ③④⑤.
 * 상태만(LayoutInst 를 직접 바꾼다).
 */
import type { LayoutInst } from '../../charselect/scene2d';
import { alignPanes, plainText, type MgmDrawHost } from '../../mgmcommon';
import { AREA_LABELS, UI_LAYOUT } from './data';

/** 4.1 공통 수명(−1 숨김·0 in·1 대기·2 out). In: 상태 ≥ 2 일 때만 [판독 ComUiLocationTelop::In/Out/Update] */
class TelopLife {
  st = -1;
  constructor(readonly inst: LayoutInst) {
    inst.visible = false;
  }
  in(imm = false): void {
    if (this.st >= 0 && this.st < 2) return;
    this.inst.visible = true;
    this.inst.play(imm ? 'normal' : 'in');
    this.st = imm ? 1 : 0;
  }
  out(imm = false): void {
    if (this.st === -1 || this.st === 2) return;
    if (imm) {
      this.st = -1;
      this.inst.visible = false;
      return;
    }
    this.st = 2;
    this.inst.play('out');
  }
  update(df: number): void {
    this.inst.update(df);
    if (this.st === 2 && this.inst.done) {
      this.inst.visible = false;
      this.st = -1;
    } else if (this.st === 0 && this.inst.done) {
      this.inst.play('normal');
      this.st = 1;
    }
  }
}

/** ComUiLocationTelop [판독 @0x7100073740·SetArea @0x7100073ac8·SetTitle @0x7100073dd0·SetDetail @0x7100073fb0] */
export class LocationTelop {
  readonly life: TelopLife;
  area = -1;
  title = '';
  detail = '';
  constructor(private readonly host: MgmDrawHost) {
    this.life = new TelopLife(host.layout(UI_LAYOUT.telop));
  }

  get inst(): LayoutInst {
    return this.life.inst;
  }

  /** −1 이면 아무것도 안 함. 8 초과는 빈 글자 [판독 switch default] */
  setArea(area: number): void {
    if (area === -1) return;
    this.area = area;
    const [name, detail] = AREA_LABELS[area] ?? ['', ''];
    const texts = this.host.spec.texts;
    this.title = name ? plainText(texts['mn00_mainMenu_ui_name'] ?? '', texts, { Text0: name }) : '';
    this.detail = detail ? plainText(texts['mn00_mainMenu_ui_detail'] ?? '', texts, { Text0: detail }) : '';
    for (const p of ['x_text_title', 'x_text_title_shadow']) this.inst.setText(p, this.title);
    for (const p of ['x_text_mess', 'x_text_mess_shadow']) this.inst.setText(p, this.detail);
    alignPanes(this.inst, 'A_alignment_00', { horizontal: true, kind: 0, gap: 0, stretch: false });
    this.inst.setVisible('x_icon_new', false);
  }

  setVisibleDetail(v: boolean): void {
    this.inst.setVisible('x_null_text_mess', v);
  }

  in(imm = false): void {
    this.life.in(imm);
  }
  out(imm = false): void {
    this.life.out(imm);
  }
  update(df: number): void {
    this.life.update(df);
  }
}

/** bq::ComUiPopGuide(sys_guide_pop_00) [판독 main @0x710027a194·In @0x710027a5cc·Out @0x710027a70c·SetIcon @0x710027a960·SetPopRotateZ @0x710027a7d8] */
export class PopGuide {
  readonly inst: LayoutInst;
  /** 0 숨김, 1 in, 2 normal, 3 out */
  st = 0;
  icon = -1;
  rotate = 0;
  /** 레이아웃 좌표(가운데 원점, y 위 +) */
  x = 0;
  y = 0;
  static readonly ICONS = ['x_icon_btn_left', 'x_icon_btn_right', 'x_icon_btn_top', 'x_icon_btn_under', 'x_icon_plus', 'x_icon_minus', 'x_icon_l', 'x_icon_r', 'x_icon_zl', 'x_icon_zr', 'x_icon_sl', 'x_icon_sr', 'x_icon_stick', 'x_icon_stick_l', 'x_icon_stick_r'];

  constructor(host: MgmDrawHost) {
    this.inst = host.layout(UI_LAYOUT.pop);
    this.inst.visible = false;
  }

  setIcon(i: number): void {
    PopGuide.ICONS.forEach((n, k) => this.inst.setVisible(`x_icon_btn/${n}`, k === i));
    this.icon = i;
  }

  /** x_baloon 회전 r, x_icon_btn −r(글자는 바로 서게) */
  setPopRotateZ(deg: number): void {
    this.rotate = deg;
    const b = this.inst.find('x_baloon');
    if (b) b[0].nodes[b[1]].r = deg;
    const i = this.inst.find('x_icon_btn');
    if (i) i[0].nodes[i[1]].r = -deg;
  }

  get idle(): boolean {
    return this.st === 2;
  }
  get finished(): boolean {
    return this.st === 0;
  }

  in(imm = false): void {
    this.inst.visible = true;
    if (imm) {
      this.inst.play('normal');
      this.inst.part('x_icon_btn')?.play('normal');
      this.st = 2;
    } else {
      this.inst.play('in');
      this.st = 1;
    }
  }

  out(imm = false): void {
    if (imm) {
      this.st = 0;
      this.inst.visible = false;
      return;
    }
    this.st = 3;
    this.inst.play('out');
  }

  update(df: number): void {
    this.inst.update(df);
    if (this.st === 3 && this.inst.done) {
      this.inst.visible = false;
      this.st = 0;
    } else if (this.st === 1 && this.inst.done) {
      this.inst.play('normal');
      this.inst.part('x_icon_btn')?.play('normal');
      this.st = 2;
    }
  }

  /** MainImpl 의 표시 규칙 [판독]: 판정되면(끝나 있을 때) SetIcon(1)·SetPopRotateZ(−45)·In, 판정이 풀리면(대기일 때) Out */
  show(on: boolean, x: number, y: number): void {
    this.x = x;
    this.y = y;
    if (on) {
      if (this.finished) {
        this.setIcon(1);
        this.setPopRotateZ(-45);
        this.in(false);
      }
    } else if (this.idle) this.out(false);
  }
}

/** 화면 위치 = 뷰포트(−1..1) 투영 → 레이아웃 좌표 (x·960 + 70, y·540) [판독 MainImpl CalculateWorldToViewport] */
export function popScreenPos(ndcX: number, ndcY: number): [number, number] {
  return [ndcX * 1920 * 0.5 + 70, ndcY * 1080 * 0.5];
}

/** menu00::ComUiOnlineGuide(mn00_friend_guide_00) [판독 ctor @0x710007f910·In @0x710007fe40] */
export class OnlineGuide {
  readonly life: TelopLife;
  constructor(host: MgmDrawHost) {
    this.life = new TelopLife(host.layout(UI_LAYOUT.onlineGuide));
    const texts = host.spec.texts;
    const t = (l: string): string => plainText(texts[l] ?? '', texts);
    for (const [p, l] of [
      ['x_text_btn', 'mn01_mainMenu_ctrl_friend_btn'],
      ['x_text_friend', 'mn01_mainMenu_ctrl_friend_text'],
      ['x_text_guide', 'mn00_mainMenu_ctrl_look'],
    ] as const) {
      this.life.inst.setText(p, t(l));
      this.life.inst.setText(`${p}_shadow`, t(l));
    }
  }

  get inst(): LayoutInst {
    return this.life.inst;
  }

  /** In: 사람 수 < 4 이면 null_friend·x_btn 보임, 정렬 다시(x_alignment_guide ali1 오른쪽 gap 40 [데이터]) */
  in(humans: number, imm = false): void {
    if (this.life.st >= 0 && this.life.st < 2) return;
    this.life.in(imm);
    this.inst.setVisible('null_friend', humans < 4);
    this.inst.setVisible('x_btn', humans < 4);
    alignPanes(this.inst, 'x_alignment_guide', { horizontal: true, kind: 2, gap: 40, stretch: false });
  }

  out(imm = false): void {
    this.life.out(imm);
  }

  update(df: number): void {
    this.life.update(df);
  }
}
