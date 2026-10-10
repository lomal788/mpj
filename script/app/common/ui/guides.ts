/**
 * 조작 안내 ComUiGuide00(sys_guide_03 1칸) — 위치 번호(sys_guide_pos_01 x_pos_NN)·정렬(6..11 왼쪽 [추정], 12..17 오른쪽 [판독 charselect.md 6.1])·
 * In/Out, mgmet::UiManager 의 HowTo(11)·Back(17)·Skip(12)·Next(17) (docs/shell/mgm_common.md 5.4). 배치는 charselect 화면과 같은 방식.
 */
import { nodeMatrix } from '@app/common/ui/layout/render';
import type { LayoutInst } from '@game/lib/layout';
import type { Mat3 } from './itemLayout';
import type { MgmSound } from './sound';
import { measure, plainText } from './text';
import type { MgmDrawHost } from './window';

const pad2 = (n: number): string => String(n).padStart(2, '0');

export class MgmGuide {
  readonly inst: LayoutInst;
  readonly base: Mat3;
  readonly side: 'left' | 'right';
  shown = false;

  constructor(
    private readonly host: MgmDrawHost,
    readonly pos: number,
    label: string,
  ) {
    this.inst = host.layout('sys_guide_03');
    this.side = pos >= 12 ? 'right' : 'left';
    for (const a of ['left', 'center', 'right']) this.inst.setVisible(`x_alignment_${a}`, a === this.side);
    for (let i = 1; i < 4; i++) this.inst.setVisible(`sys_guide_${this.side}_${pad2(i)}`, false);
    const s = plainText(host.spec.texts[label] ?? label, host.spec.texts);
    const g = `sys_guide_${this.side}_00`;
    this.inst.setText(`${g}/x_text`, s);
    this.inst.setText(`${g}/x_text_shadow`, s);
    const tf = this.inst.find(`${g}/x_text`);
    const ts = tf?.[0].nodes[tf[1]].spec.txt;
    const w = ts ? measure(host.spec.fonts[ts.font], ts.fs, ts.cs, s) : 0;
    const gn = this.inst.find(g);
    if (gn) gn[0].nodes[gn[1]].t[0] = this.side === 'right' ? -w / 2 : w / 2;
    this.inst.visible = false;
    const posM = nodeMatrix(host.layout('sys_guide_pos_01'), `x_pos_${pad2(pos)}`);
    this.base = [1, 0, posM ? posM[2] : 0, 0, 1, posM ? posM[5] : 0];
  }

  /** Idle(보임이고 in/normal) 인가 */
  get idle(): boolean {
    return this.inst.visible && (this.inst.current === 'in' || this.inst.current === 'normal');
  }

  /** In: checkIdle 이면 이미 Idle 일 때 무시 */
  in(checkIdle = true): void {
    if (checkIdle && this.idle) return;
    this.inst.visible = true;
    this.shown = true;
    this.inst.play('in', 'normal');
  }

  out(): void {
    if (!this.inst.visible) return;
    this.shown = false;
    this.inst.play('out');
  }

  update(): void {
    this.inst.update(1);
    if (!this.shown && this.inst.current === 'out' && this.inst.done) this.inst.visible = false;
  }

  draw(): void {
    if (this.inst.visible) this.host.draw(this.inst, this.base);
  }
}

/** mgmet::UiManager 안내 묶음(5.4). Next 라벨은 Mode 별 [미확정] → 부르는 쪽이 준다 */
export class MgmetGuides {
  readonly howto: MgmGuide;
  readonly back: MgmGuide;
  readonly skip: MgmGuide;
  readonly next: MgmGuide | null;

  constructor(
    host: MgmDrawHost,
    private readonly sound?: MgmSound,
    private readonly operator: () => number = () => 0,
    nextLabel?: string,
  ) {
    this.howto = new MgmGuide(host, 11, 'mgmet_ui_howtoplay');
    this.back = new MgmGuide(host, 17, 'sys_ctrl_back');
    this.skip = new MgmGuide(host, 12, 'sys_ctrl_skip');
    this.next = nextLabel ? new MgmGuide(host, 17, nextLabel) : null;
  }

  /** UiManager::In(group): 0 = Back + HowTo, 1 = + RuleConfigView(부르는 쪽) */
  in(group: number): void {
    if (group !== 0 && group !== 1) return;
    this.back.in();
    this.howto.in();
  }

  out(group: number): void {
    if (group !== 0 && group !== 1) return;
    this.back.out();
    this.howto.out();
  }

  /** TopRightOpSkipMessage: Idle 검사 없이 In */
  inSkip(): void {
    this.skip.in(false);
  }

  /** BottomRightNextMessage Out(false) = PROCEED + 진동 뒤 Out, Out(true) = 소리 없이 */
  outNext(silent = false): void {
    if (!silent) this.enterNext();
    this.next?.out();
  }

  /** Enter() = PROCEED + 진동(조작 플레이어). 진동 이름 [미확정] */
  enterNext(): void {
    this.sound?.playSe('SQ_SE_SYS_PROCEED');
    this.sound?.vibrate(this.operator(), 'proceed');
  }

  update(): void {
    for (const g of [this.howto, this.back, this.skip, this.next]) g?.update();
  }

  draw(): void {
    for (const g of [this.howto, this.back, this.skip, this.next]) g?.draw();
  }
}
