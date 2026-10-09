/**
 * mgmet::ActivityTitle(UI_ActivitiTitle, mgmet_act_title_00) — 제목 API 전체(docs/shell/mgmet_flow.md 7.1). 공용 창 MgmWindow 의 레이아웃에 태그를 직접 재생한다
 * (창 생애 in/normal/out 가 아니라 API 마다 정해진 태그 → 다음 태그).
 */
import { paneGlobal } from '@app/common/ui/itemLayout';
import type { MgmSound } from '@app/common/ui/sound';
import { MgmWindow, type MgmDrawHost } from '@app/common/ui/window';
import { ACTIVITIES, SE } from './tables';

export class ActivityTitle {
  readonly win: MgmWindow;

  constructor(
    host: MgmDrawHost,
    private readonly sound?: MgmSound,
  ) {
    this.win = new MgmWindow(host, 'mgmet_act_title_00');
  }

  private play(tag: string, next?: string): void {
    this.win.inst.play(tag, next);
  }

  /** Impl::SetTitleText: Text0 = 제목 표, 라벨 mgmet_ui_activity_name → x_text_act_shadow·x_text_act_00 */
  setTitleText(id: number): void {
    const key = ACTIVITIES[id]?.title ?? ACTIVITIES[2].title;
    this.win.setText('x_text_act_shadow', 'mgmet_ui_activity_name', { Text0: key });
    this.win.setText('x_text_act_00', 'mgmet_ui_activity_name', { Text0: key });
  }

  titleText(): string {
    return this.win.textOf('x_text_act_00');
  }

  inTitle(): void {
    this.win.inst.visible = true;
    this.play('in', 'normal');
  }

  outTitle(): void {
    this.play('out');
  }

  actIn(): void {
    this.play('act', 'act_normal');
  }

  actOut(): void {
    this.play('act_out');
  }

  playIdle(): void {
    this.play('normal');
  }

  enter(): void {
    this.play('press');
  }

  isEndAnimation(): boolean {
    return this.win.inst.done;
  }

  inLeftArrow(): void {
    this.play('left_select_01', 'normal');
  }

  inRightArrow(): void {
    this.play('right_select_01', 'normal');
  }

  outLeftArrow(): void {
    this.play('left_select_00');
  }

  outRightArrow(): void {
    this.play('right_select_00');
  }

  setVisibleArrow(v: boolean): void {
    this.setVisibleLeft(v);
    this.setVisibleRight(v);
  }

  setVisibleLeft(v: boolean): void {
    this.win.inst.setVisible('x_cursor_00/x_null_left', v);
  }

  setVisibleRight(v: boolean): void {
    this.win.inst.setVisible('x_cursor_00/x_null_right', v);
  }

  private arrowSe(side: 'left' | 'right'): void {
    const g = paneGlobal(this.win.inst, `x_cursor_00/x_null_${side}`);
    this.sound?.playSe2D(SE.CURSOR, g ? 960 + g.m[2] : 960);
  }

  playLeftArrowSE(): void {
    this.arrowSe('left');
  }

  playRightArrowSE(): void {
    this.arrowSe('right');
  }

  hide(): void {
    this.win.inst.visible = false;
  }

  tick(): void {
    this.win.update();
  }

  draw(): void {
    this.win.draw();
  }
}
