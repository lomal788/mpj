/**
 * 필터(장르) 머리 줄 그리기·흐름 — listFilter(순수 상태)를 공용 창 mgm01_base_freeplay_00 의 header 에 옮긴다. 목록 본체(thum_all 3형식·썸네일·끝 행)는 다음 단계의 listView 몫이라 숨긴다 [설계].
 * 근거: docs/shell/mgm01_freeplay.md 6.1·6.2·7(header 문구, left/right_select_00 4f → 재구성 → _01 5f, DECI_LR), mgm_common.md 9.6.
 */
import type { Flow } from '@app/common/ui/fiber';
import type { MgmSound } from '@app/common/ui/sound';
import { MgmWindow, type MgmDrawHost } from '@app/common/ui/window';
import { ListFilterState, type FilterApplied, type FilterDeps } from './listFilter';
import type { Mgm01Catalog } from './catalog';

export interface FilterScreenDeps extends FilterDeps {
  sound: MgmSound;
  input(): { trig: number; rep: number };
  onApplied?(r: FilterApplied): void;
}

export class FilterScreen {
  readonly win: MgmWindow;
  readonly state: ListFilterState;

  constructor(
    readonly host: MgmDrawHost,
    readonly catalog: Mgm01Catalog,
    readonly deps: FilterScreenDeps,
    enumNo = 0,
  ) {
    this.win = new MgmWindow(host, 'mgm01_base_freeplay_00');
    this.state = new ListFilterState(catalog, deps, enumNo);
    this.win.setText('x_guide_00', 'mgm01_ctrl_mgChoiceFp00');
    this.win.setText('x_guide_01', 'mgm01_ctrl_mgChoiceFp01');
    this.win.setText('x_cursor_LR/x_text_L', 'mgm01_ctrl_mgFilterL00');
    this.win.setText('x_cursor_LR/x_text_R', 'mgm01_ctrl_mgFilterR00');
    this.win.setText('x_text_01', 'mgm01_mw_favoriteNone');
    this.win.inst.setVisible('thum_all', false);
    this.bind(this.state.applied);
  }

  bind(r: FilterApplied): void {
    this.win.setText('x_text_00', r.label);
    this.win.inst.setVisible('x_no_favorite', r.emptyFavorite);
    this.deps.onApplied?.(r);
  }

  *flow(): Flow<FilterApplied> {
    this.win.in(false);
    while (this.win.life.opening) yield;
    for (;;) {
      yield;
      const { trig, rep } = this.deps.input();
      if (this.state.phase === 'idle' && trig === 0x2) break;
      this.state.input(rep);
      this.state.step(this.win.isEndAnimation());
      for (const e of this.state.drain()) {
        if (e.type === 'se') this.deps.sound.playSe(e.label);
        else if (e.type === 'anim') this.win.inst.play(e.name);
        else this.bind(e.result);
      }
      if (this.state.phase === 'idle' && this.win.inst.current?.endsWith('_01') && this.win.isEndAnimation()) this.win.inst.play('normal');
    }
    this.win.out(false);
    while (this.win.isVisible()) yield;
    return this.state.applied;
  }

  update(): void {
    this.win.update();
  }

  draw(): void {
    this.win.draw();
  }
}
