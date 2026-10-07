/**
 * mgmet::FreePlayInfo(mgmet_base_playinfo_freeplay_00) — 조작자 이름(비었으면 im_guest00_name)·플레이한 미니게임 수·/112, In/Out 은 공용 창 생애(완료 대기 없음).
 * 근거: docs/shell/mgmet_flow.md 7.2·8. 글자 페인 대응은 레이아웃 위치 [추정, 9.1].
 */
import { MgmWindow, type MgmDrawHost } from '../mgmcommon/window';

export class FreePlayInfo {
  readonly win: MgmWindow;

  constructor(host: MgmDrawHost) {
    this.win = new MgmWindow(host, 'mgmet_base_playinfo_freeplay_00');
  }

  /** Impl::Setup mgmet @0x710006fa9c */
  setup(nickname: string, played: number): void {
    this.win.setText('x_name_host_00/x_name_00', nickname || 'im_guest00_name');
    this.win.setText('x_mg_00', 'mgmet_rule_ui_fp00');
    for (const p of ['x_num_01', 'x_num_01_shadow']) this.win.setText(p, 'mgmet_rule_ui_fp01', { Number0: played });
    for (const p of ['x_num_00', 'x_num_00_shadow']) this.win.setText(p, 'mgmet_rule_ui_fp02');
  }

  in(): void {
    this.win.in(false);
  }

  out(): void {
    this.win.out(false);
  }

  tick(): void {
    this.win.update();
  }

  draw(): void {
    this.win.draw();
  }
}
