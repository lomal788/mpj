/**
 * 화면 페이드(검은 막) — FadeOut(sec)·IsFinishedFadeOut 대체(docs/shell/mgmet_flow.md 5.2, 9.1 [설계]). 상태는 순수, 그리기는 Render2D 사각형 하나.
 */
import { LayoutInst } from '../charselect/scene2d';
import type { MgmDrawHost } from '../mgmcommon/window';

export class Fade {
  /** 0 = 투명, 1 = 검정 */
  level = 0;
  private from = 0;
  private to = 0;
  private dur = 0;
  private t = 0;

  fadeOut(sec: number): void {
    this.start(1, sec);
  }

  fadeIn(sec: number): void {
    this.start(0, sec);
  }

  private start(to: number, sec: number): void {
    this.from = this.level;
    this.to = to;
    this.dur = sec;
    this.t = 0;
    if (sec <= 0) this.level = to;
  }

  isFinishedFadeOut(): boolean {
    return this.to === 1 && this.level >= 1;
  }

  isFinishedFadeIn(): boolean {
    return this.to === 0 && this.level <= 0;
  }

  update(dt: number): void {
    if (this.level === this.to) return;
    this.t = Math.fround(this.t + dt);
    const k = this.dur > 0 ? Math.min(1, this.t / this.dur) : 1;
    this.level = this.from + (this.to - this.from) * k;
  }
}

export class FadeLayer {
  private readonly inst: LayoutInst;

  constructor(private readonly host: MgmDrawHost) {
    this.inst = new LayoutInst(
      'mgmet_fade',
      {
        size: [1920, 1080],
        nodes: [
          { n: 'root', p: -1, k: 'null', v: true, ia: true, o: [0, 0], po: [0, 0], t: [0, 0], r: 0, s: [1, 1], z: [1920, 1080], a: 255 },
          { n: 'black', p: 0, k: 'pic', v: true, ia: false, o: [0, 0], po: [0, 0], t: [0, 0], r: 0, s: [1, 1], z: [1920, 1080], a: 0, m: 0 },
        ],
        mats: [{ name: 'black', black: [0, 0, 0, 0], white: [0, 0, 0, 255], tex: [], srt: [] }],
        anims: {},
      },
      host.all,
    );
  }

  draw(level: number): void {
    if (level <= 0) return;
    this.inst.nodes[1].a = Math.round(Math.min(1, level) * 255);
    this.host.draw(this.inst);
  }
}
