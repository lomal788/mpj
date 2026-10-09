/**
 * 잠금 안내 화면 — AnnounceState(announce.ts)를 mgm01_mes_announce_00 에 옮긴다 (docs/shell/mgm01_freeplay.md 6.2·6.4·7).
 * play(reason) → in → normal(0.75 s 또는 skip) → out. 잠금 선택 때 ERROR SE 는 목록 쪽이 낸다(6.2).
 */
import type { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import type { MgmView } from '../../../../shell/mgmcommon/view';
import { AnnounceState } from './announce';

export class AnnounceScreen {
  readonly state = new AnnounceState();
  readonly inst: LayoutInst;

  constructor(private readonly view: MgmView) {
    this.inst = view.layout('mgm01_mes_announce_00');
    this.inst.visible = false;
  }

  play(reason: number): boolean {
    const r = this.state.play(reason);
    this.apply();
    return r;
  }

  get active(): boolean {
    return this.state.active;
  }

  input(trig: number): void {
    this.state.input(trig);
  }

  update(dt: number): void {
    this.inst.update(1);
    this.state.step(dt, this.inst.done);
    this.apply();
  }

  private apply(): void {
    for (const e of this.state.drain()) {
      if (e.type === 'text') this.inst.setText('x_text_00', this.view.text(e.label));
      else if (e.type === 'show') this.inst.visible = e.visible;
      else this.inst.play(e.name);
    }
  }

  draw(): void {
    if (this.inst.visible) this.view.draw(this.inst);
  }
}
