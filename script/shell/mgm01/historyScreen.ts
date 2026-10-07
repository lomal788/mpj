/**
 * 승패 표 화면 — HistoryState(historyView.ts)를 mgm01_history_title_00·mgm01_history_00 공용 창에 옮긴다 (docs/shell/mgm01_freeplay.md 6.2·6.6·7).
 * 열 8개 = x_parts_NN(mgm01_history_01), 칸 = x_history_PP(mgm01_history_02: 일치면 win_normal, 아니면 normal), 왼쪽 = 플레이어 얼굴·승리 수.
 * [설계] 썸네일 칸은 미니게임 그림을 아직 변환하지 않아 원래 텍스처 그대로. 스크롤바(x_scr_mgm)는 노드가 비어 위치만 계산.
 */
import type { Flow } from '../mgmcommon/fiber';
import type { MgmInput } from '../mgmcommon/input';
import type { MgmSound } from '../mgmcommon/sound';
import type { MgmView } from '../mgmcommon/view';
import { MgmWindow } from '../mgmcommon/window';
import { HISTORY_ROWS, HistoryState, type HistorySource } from './historyView';

export class HistoryScreen {
  readonly state: HistoryState;
  readonly title: MgmWindow;
  readonly table: MgmWindow;

  constructor(
    view: MgmView,
    private readonly input: MgmInput,
    private readonly sound: MgmSound,
    src: HistorySource,
    faces: readonly string[],
  ) {
    this.state = new HistoryState(src);
    this.title = new MgmWindow(view, 'mgm01_history_title_00');
    this.table = new MgmWindow(view, 'mgm01_history_00');
    this.title.setText('x_text_00', 'mgm01_ui_mgTable00');
    this.title.setText('x_no_history/x_text_01', 'mgm01_ui_mgTable01');
    this.title.inst.setVisible('x_no_history', src.count === 0);
    faces.forEach((pc, p) => this.table.inst.setTexture(`x_face_0${p}/x_face_pc128`, 1, `face_128_${pc}^u`));
    const sc = this.state.scores();
    for (let p = 0; p < 4; p++) {
      this.table.inst.setVisible(`x_face_0${p}`, p < faces.length);
      this.table.setText(`num/x_text_0${p}`, 'mgm01_ui_countWin', { Number0: sc[p] });
      this.table.inst.setVisible(`num/x_text_0${p}`, p < faces.length);
    }
    this.table.inst.setVisible('x_all', src.count > 0);
    this.apply();
  }

  private apply(): void {
    for (const row of this.state.rows()) {
      const col = `x_parts_0${row.slot}`;
      this.table.inst.setVisible(col, !!row.entry);
      if (!row.entry) continue;
      for (let p = 0; p < 4; p++) this.table.inst.part(`${col}/x_history_0${p}`)?.play(row.win[p] ? 'win_normal' : 'normal');
    }
  }

  get scrollbar(): { visible: boolean; pos: number } {
    return this.state.scrollbar;
  }

  /** 열기 → 입력(좌우 스크롤, B 닫기) → 닫기 */
  *run(): Flow<void> {
    this.title.in(false);
    this.table.in(false);
    while (this.title.life.opening || this.table.life.opening) yield;
    for (;;) {
      yield;
      this.state.input(this.input.trig(), this.input.rep());
      let closed = false;
      for (const e of this.state.drain()) {
        if (e.type === 'scroll') this.apply();
        else if (e.type === 'se') this.sound.playSe(e.label);
        else if (e.type === 'close') closed = true;
      }
      if (closed) break;
    }
    this.title.out(false);
    this.table.out(false);
    while (this.title.isVisible() || this.table.isVisible()) yield;
  }

  update(): void {
    this.title.update();
    this.table.update();
  }

  draw(): void {
    this.table.draw();
    this.title.draw();
  }
}

export { HISTORY_ROWS };
