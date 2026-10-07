/**
 * 판 공통 수명(ComUiBase 파생 In/Out/Start/Update/IsFinished, partyrule.md 5.1): phase −1 숨김·0 in·1 대기·2 out.
 */
import type { PartyMsg, PIO, PSink, Scr } from './types';

export class PanelLife {
  phase = -1;

  constructor(
    readonly scr: Scr,
    private readonly ev: PSink,
    private readonly msg: PartyMsg | null,
  ) {}

  /** Start 의 끝: phase 가 −1·2(부호 없는 비교 > 1)면 "in"·phase 0·보이기 */
  startIn(): void {
    if (this.phase >= 0 && this.phase < 2) return;
    this.phase = 0;
    this.ev.push({ t: 'play', scr: this.scr, path: '', tag: 'in' });
    this.ev.push({ t: 'show', scr: this.scr, v: true });
  }

  /** In(imm) */
  in(imm = false): void {
    if (this.phase >= 0 && this.phase < 2) return;
    this.phase = imm ? 1 : 0;
    this.ev.push({ t: 'play', scr: this.scr, path: '', tag: imm ? 'normal' : 'in' });
    this.ev.push({ t: 'show', scr: this.scr, v: true });
  }

  /** Out(imm): 메시지 창이 일하는 중이면 메시지도 Out */
  out(imm = false): void {
    if (this.phase === -1 || this.phase === 2) return;
    if (imm) {
      this.phase = -1;
      this.ev.push({ t: 'show', scr: this.scr, v: false });
    } else {
      this.phase = 2;
      this.ev.push({ t: 'play', scr: this.scr, path: '', tag: 'out' });
    }
    if (this.msg?.isWorking()) this.msg.out();
  }

  /** Update 앞부분(phase 0 끝 → normal, phase 2 끝 → 숨김) */
  update(io: PIO): void {
    if (this.phase === 2 && io.done(this.scr, '')) {
      this.phase = -1;
      this.ev.push({ t: 'show', scr: this.scr, v: false });
    } else if (this.phase === 0 && io.done(this.scr, '')) {
      this.phase = 1;
      this.ev.push({ t: 'play', scr: this.scr, path: '', tag: 'normal' });
    }
  }

  get finished(): boolean {
    return this.phase < 0;
  }

  get idle(): boolean {
    return this.phase === 1;
  }
}
