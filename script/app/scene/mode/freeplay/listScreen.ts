/**
 * 프리 플레이 목록 화면 — ListState(listView.ts)를 공용 창 mgm01_base_freeplay_00(3행×112열 메뉴)과 항목 레이아웃 mgm01_thum_00 112개(MinigameListItem%03d)에 옮긴다. DecideMinigameFlow 상태 2(MgListFlow).
 * 근거: docs/shell/mgm01_freeplay.md 5.5(진입·나감 순서)·6.7(ApplyChangeMgList·ApplyChangeMgList2·ResetMgItem·MoveCursor·PrepareMgListFlow)·7.1(썸네일 = 재질 칸1). 웹 결정 9.2.
 */
import type { LayoutInst } from '@game/lib/layout';
import type { Flow } from '@app/common/ui/fiber';
import type { MgmGuide } from '@app/common/ui/guides';
import { MgmLayout, paneGlobal } from '@app/common/ui/itemLayout';
import type { MgmSound } from '@app/common/ui/sound';
import { measure, plainText } from '@app/common/ui/text';
import type { MgmView } from '@app/common/ui/view';
import { MgmWindow } from '@app/common/ui/window';
import { AnnounceScreen } from './announceScreen';
import { LIST_FORMAT } from './catalog';
import type { FilterApplied } from './listFilter';
import { LIST_ITEM_MAX, listPane, ListState, MG_LIST_MENU_ANIME, PLACEHOLDER_NAME, PLACEHOLDER_THUMB, thumbKey, type ListDeps, type ListExit } from './listView';

export interface ListScreenDeps extends ListDeps {
  sound: MgmSound;
  input(): { trig: number; rep: number };
  operator(): number;
  consumeNew(id: number): void;
  guide?: MgmGuide | null;
  newRate?: number;
}

export interface ListOutcome {
  result: ListExit;
  id: number;
  enumNo: number;
  index: number;
}

export interface ListOpen {
  resume: boolean;
  selectedId: number;
  index?: number;
}

function resizeWindow(inst: LayoutInst, path: string, w: number): void {
  const f = inst.find(path);
  if (!f) return;
  const [li, ni] = f;
  const node = li.nodes[ni];
  const sw = node.spec.z[0];
  node.z = [w, node.z[1]];
  for (const ci of node.children) {
    const c = li.nodes[ci];
    const name = c.spec.n;
    if (!name.startsWith(`${node.spec.n}#`)) continue;
    const side = name.slice(node.spec.n.length + 1);
    const cw = c.spec.z[0];
    const left = side.includes('L');
    const right = side.includes('R');
    c.t[0] = left ? -(w / 2 - cw / 2) : right ? w / 2 - cw / 2 : 0;
    c.z[0] = left || right ? cw : cw + (w - sw);
  }
}

export class ListScreen {
  readonly win: MgmWindow;
  readonly items: MgmLayout[] = [];
  readonly announce: AnnounceScreen;
  readonly state: ListState;
  private hooked = -1;
  private texts: Record<string, string>;

  constructor(
    readonly view: MgmView,
    readonly deps: ListScreenDeps,
    enumNo = 0,
  ) {
    this.texts = view.spec.texts;
    this.state = new ListState(deps, enumNo);
    const w = (this.win = new MgmWindow(view, 'mgm01_base_freeplay_00'));
    w.setupMenu(3, LIST_ITEM_MAX, { wrap: true, checkEnable: false });
    const k = w.addAnimeSet(MG_LIST_MENU_ANIME);
    for (let t = 0; t < 3; t++) {
      const f = LIST_FORMAT[t];
      for (let i = 0; i < f.cols * f.rows; i++) w.setupItem(t, i, listPane(t, i), k);
    }
    for (let i = 0; i < LIST_ITEM_MAX; i++) {
      const it = new MgmLayout(view.layout('mgm01_thum_00'));
      for (let s = 0; s < 3; s++) it.inst.setVisible(`x_new_0${s}`, false);
      it.visible = false;
      this.items.push(it);
    }
    this.announce = new AnnounceScreen(view);
    w.setupFinish();
    w.setText('x_cursor_LR/x_text_L', 'mgm01_ctrl_mgFilterL01');
    w.setText('x_cursor_LR/x_text_R', 'mgm01_ctrl_mgFilterR01');
    w.setText('x_guide_00', 'mgm01_ctrl_mgChoiceFp00');
    w.setText('x_guide_01', 'mgm01_ctrl_mgChoiceFp01');
    w.setText('x_text_01', 'mgm01_mw_favoriteNone');
  }

  get type(): 0 | 1 | 2 {
    return this.state.type;
  }

  get thumbSize(): number {
    return LIST_FORMAT[this.type].thumb;
  }

  private count(type: number): number {
    return LIST_FORMAT[type].cols * LIST_FORMAT[type].rows;
  }

  /** ApplyChangeMgList (6.7) */
  private applyChange(r: FilterApplied): void {
    const w = this.win;
    if (this.hooked >= 0) for (let i = 0; i < this.count(this.hooked); i++) w.unhookItem(this.hooked, i);
    const type = r.type;
    const cnt = this.count(type);
    for (let i = 0; i < cnt; i++) w.hookItem(type, i, this.items[i]);
    this.hooked = type;
    const s = LIST_FORMAT[type].thumb;
    const n = r.ids.length;
    for (let i = 0; i < n; i++) {
      const id = r.ids[i];
      const g = this.deps.catalog.game(id);
      const reason = this.deps.reason(id);
      const it = this.items[i].inst;
      const tex = reason === 0 || !g ? PLACEHOLDER_THUMB : thumbKey(g.name);
      it.setTexture(`x_game_${s}_0`, 1, tex);
      it.setTexture(`x_game_${s}_1`, 1, tex);
      it.setText(`x_mes_0${s}/x_text_00`, plainText(this.texts.mgm01_ui_mgNameBig ?? '', this.texts, { Text0: reason === 0 || !g ? PLACEHOLDER_NAME : g.nameLabel }));
      it.part(`x_heart_0${s}`)?.play(this.deps.favorite(id) ? 'normal' : 'off');
      it.setVisible('x_win_00', type === 2);
      it.setVisible('x_win_01', type === 1);
      it.setVisible('x_win_02', type === 0);
      w.setItemVisible(type, i, true);
      if (reason !== -1) {
        if (reason === 0) {
          it.setVisible(`x_gray_${s}_0`, false);
          it.setVisible(`x_gray_${s}_1`, false);
        }
        w.setItemEnable(type, i, false);
      }
    }
    for (let i = n; i < cnt; i++) w.setItemVisible(type, i, false);
    for (let i = Math.max(n, cnt); i < LIST_ITEM_MAX; i++) this.items[i].visible = false;
    for (let t = 0; t < 3; t++) w.inst.setVisible(LIST_FORMAT[t].pane, t === type);
    w.inst.setVisible('x_no_favorite', r.emptyFavorite);
    w.setText('x_text_00', r.label);
  }

  /** ApplyChangeMgList2 의 Wait 다음 부분: 이름 말풍선 너비·화면 안 보정, NEW 표시 (6.7) */
  private applyChange2(): void {
    const ids = this.state.ids;
    const s = this.thumbSize;
    for (let i = 0; i < ids.length; i++) {
      const it = this.items[i].inst;
      const tf = it.find(`x_mes_0${s}/x_text_00`);
      const ts = tf?.[0].nodes[tf[1]].spec.txt;
      const str = tf ? (tf[0].texts.get(tf[1]) ?? '') : '';
      const tw = ts ? measure(this.view.spec.fonts[ts.font], ts.fs, ts.cs, str) : 0;
      const base = tw + 40;
      const bd = base + 32;
      const mes = it.part(`x_mes_0${s}`);
      if (mes) {
        resizeWindow(mes, 'x_base_00', base);
        const bf = mes.find('x_bd_00');
        if (bf) bf[0].nodes[bf[1]].z[0] = bd;
        const g = paneGlobal(this.win.inst, listPane(this.type, i));
        const x = g ? g.m[2] : 0;
        const half = bd * 0.5;
        let dx = 0;
        if (x - half < -960) dx = -(x - half + 960);
        else if (x + half > 960) dx = -(x + half - 960);
        const xf = mes.find('x_00');
        if (xf) xf[0].nodes[xf[1]].t[0] = dx;
      }
      this.applyNew(i, false);
    }
  }

  /** UpdateNewIcon(id, i, consume) 의 표시 부분 */
  private applyNew(i: number, consumed: boolean): void {
    const id = this.state.ids[i];
    const it = this.items[i]?.inst;
    if (!it || id === undefined) return;
    const name = `x_new_0${this.thumbSize}`;
    if (consumed || !this.state.newVisible(id)) {
      it.setVisible(name, false);
      return;
    }
    it.setVisible(name, true);
    it.part(name)?.play('normal');
  }

  /** ResetMgItem (6.7) */
  private resetItems(): void {
    const w = this.win;
    const type = this.type;
    const s = this.thumbSize;
    w.setCursor(type, -1, true);
    for (let i = 0; i < LIST_ITEM_MAX; i++) {
      const it = this.items[i];
      it.visible = true;
      w.setItemEnable(type, i, true);
      it.inst.setVisible(`x_gray_${s}_0`, true);
      it.inst.setVisible(`x_gray_${s}_1`, true);
      it.visible = false;
    }
  }

  private seAt(label: string, at: 'cursor' | 'filterL' | 'filterR' | undefined): void {
    if (!at) {
      this.deps.sound.playSe(label);
      return;
    }
    const pane = at === 'cursor' ? listPane(this.type, this.state.cursor) : at === 'filterL' ? 'x_cursor_LR/x_text_L' : 'x_cursor_LR/x_text_R';
    const g = paneGlobal(this.win.inst, pane);
    this.deps.sound.playSe2D(label, g ? 960 + g.m[2] : 960);
  }

  private flush(): boolean {
    let applied = false;
    for (const e of this.state.drain()) {
      switch (e.type) {
        case 'se':
          this.seAt(e.label, e.at);
          break;
        case 'vibrate':
          this.deps.sound.vibrate(this.deps.operator(), 'error');
          break;
        case 'apply':
          this.applyChange(e.result);
          applied = true;
          break;
        case 'cursor':
          this.win.setCursor(this.type, e.index, e.imm);
          break;
        case 'decide':
          this.win.decide(this.type, e.index);
          break;
        case 'announce':
          this.announce.play(e.reason);
          break;
        case 'skip':
          this.announce.input(2);
          break;
        case 'filterAnim':
          this.win.inst.play(e.name);
          if (e.name.endsWith('_00')) this.win.inst.part('x_cursor_LR')?.play(e.dir < 0 ? 'left_select' : 'right_select');
          break;
        case 'reset':
          this.resetItems();
          break;
        case 'newConsume':
          this.deps.consumeNew(e.id);
          this.applyNew(e.index, true);
          break;
        default:
          break;
      }
    }
    return applied;
  }

  /** PrepareMgListFlow → MgListFlow → 나감 처리(5.5) */
  *flow(o: ListOpen): Flow<ListOutcome> {
    const s = this.state;
    const w = this.win;
    s.resume = o.resume;
    s.selectedId = o.selectedId;
    s.observer.stop();
    s.prepare(o.index ?? -1);
    this.flush();
    yield;
    this.applyChange2();
    w.inst.part('x_cursor_LR')?.play('normal');
    w.in(o.resume);
    this.deps.guide?.in();
    while (!w.isVisible() || w.life.opening || w.life.closing) yield;
    s.opened();
    let pendingApply2 = false;
    for (;;) {
      if (s.phase === 'exit') break;
      if (pendingApply2) {
        this.applyChange2();
        pendingApply2 = false;
      }
      if (s.phase === 'filter') {
        const was = s.filter.phase;
        s.stepFilter(w.isEndAnimation());
        if (this.flush()) pendingApply2 = true;
        if (was === 'select1' && s.filter.phase === 'idle') w.inst.play('normal');
      } else if (w.isVisible() && !w.life.opening && !w.life.closing) {
        const i = this.deps.input();
        s.input(i.trig, i.rep);
        this.flush();
      }
      s.stepNew(this.deps.newRate ?? 1);
      this.flush();
      yield;
    }
    s.observer.stop();
    const r = s.exitResult!;
    if (r === 7) this.deps.guide?.out();
    else if (r === 4) while (w.isCursorItemAnimating()) yield;
    w.out(false);
    while (w.isVisible()) yield;
    this.resetItems();
    return { result: r, id: s.selectedId, enumNo: s.enumNo, index: s.index };
  }

  update(dt: number): void {
    this.win.update();
    this.announce.update(dt);
  }

  draw(): void {
    this.win.draw();
    this.announce.draw();
  }
}
