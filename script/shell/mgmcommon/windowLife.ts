/**
 * 공용 창 생애(순수 상태) — ComUiMinigameModeWindowCommon +0x38/+0x39/+0x40, vt+0x220~0x238 (docs/shell/mgm_common.md 5.1).
 */

export type WindowEvent = { type: 'play'; anim: string } | { type: 'visible'; visible: boolean };

export const DEFAULT_WINDOW_ANIME: readonly [string, string, string] = ['in', 'normal', 'out'];

export class WindowLife {
  names: [string, string, string] = [...DEFAULT_WINDOW_ANIME];
  visible = false;
  opening = false;
  closing = false;
  private queue: WindowEvent[] = [];

  drain(): WindowEvent[] {
    const o = this.queue;
    this.queue = [];
    return o;
  }

  private setVisible(v: boolean): void {
    this.visible = v;
    this.queue.push({ type: 'visible', visible: v });
  }

  private play(anim: string): void {
    this.queue.push({ type: 'play', anim });
  }

  /** vt+0x220 */
  init(): void {
    this.setVisible(false);
    this.opening = false;
    this.closing = false;
    this.names = [...DEFAULT_WINDOW_ANIME];
  }

  /** SetAnimeWindow */
  setAnimeWindow(names: readonly [string, string, string]): void {
    this.names = [names[0], names[1], names[2]];
  }

  /** vt+0x228: 보임 && !closing 이면 아무것도 안 함 */
  in(imm: boolean): boolean {
    if (this.visible && !this.closing) return false;
    this.opening = false;
    this.closing = false;
    if (imm) {
      this.play(this.names[1]);
    } else {
      this.play(this.names[0]);
      this.opening = true;
    }
    this.setVisible(true);
    return true;
  }

  /** vt+0x230: 보임 && !closing 일 때만 */
  out(imm: boolean): boolean {
    if (!(this.visible && !this.closing)) return false;
    this.opening = false;
    this.closing = true;
    if (imm) this.setVisible(false);
    else this.play(this.names[2]);
    return true;
  }

  /** vt+0x238 (원본은 보일 때만 불림 — 틱 메시지 처리 vt+0x210) */
  update(animEnd: boolean): void {
    if (!this.visible) return;
    if (this.opening && animEnd) {
      this.opening = false;
      this.play(this.names[1]);
    }
    if (this.closing && animEnd) this.setVisible(false);
  }
}
