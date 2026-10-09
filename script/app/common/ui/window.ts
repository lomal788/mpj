/**
 * 공용 창 ComUiMinigameModeWindowCommon — 창 생애(windowLife)·메뉴 격자(menuGrid) 사건을 명세 레이아웃에 옮긴다 (docs/shell/mgm_common.md 3.2·4~6·9.3).
 * 페인 항목 애니 = 그 페인 부품 인스턴스의 태그 재생(부품이 아니면 무시 [설계, 9.6]). 항목 레이아웃은 창 뒤에 그린다 [설계].
 */
import type { Render2D } from '@app/scene/menu/charselect/render2d';
import type { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { IDENTITY, MgmLayout, type ConstraintOwner, type Mat3 } from './itemLayout';
import { MenuGrid, type MenuAnimeSet, type MenuEvent, type MenuItem } from './menuGrid';
import { parseMessage, plainText, RichTextPane, type Inserts } from './text';
import type { MgmSpec } from './types';
import { WindowLife } from './windowLife';

/** MgmView 중 창이 쓰는 부분(시험에서는 WebGL 없이 대역) */
export interface MgmDrawHost {
  readonly all: Spec;
  readonly spec: MgmSpec;
  readonly r2d: Render2D;
  layout(name: string): LayoutInst;
  draw(inst: LayoutInst, base?: Mat3, alpha?: number): void;
}

export class MgmWindow implements ConstraintOwner {
  readonly inst: LayoutInst;
  readonly life = new WindowLife();
  readonly grid: MenuGrid;
  base: Mat3 = IDENTITY;
  private readonly rich = new Map<string, RichTextPane>();
  private readonly paneText = new Map<string, { raw: string; inserts: Inserts }>();

  constructor(
    readonly host: MgmDrawHost,
    layout: string | LayoutInst,
  ) {
    this.inst = typeof layout === 'string' ? host.layout(layout) : layout;
    this.grid = new MenuGrid({
      isVisible: (it) => this.itemVisible(it),
      isEnd: (it) => (it.layout ? (it.layout as MgmLayout).isEnd() : (this.inst.part(it.pane ?? '')?.done ?? true)),
    });
    this.life.init();
    this.applyLife();
    this.grid.setupMenu(0, 0, false, false);
  }

  private itemVisible(it: MenuItem): boolean {
    if (it.layout) return (it.layout as MgmLayout).visible;
    if (!it.pane) return false;
    const f = this.inst.find(it.pane);
    return !!f && f[0].nodes[f[1]].v;
  }

  private applyLife(): void {
    for (const e of this.life.drain()) {
      if (e.type === 'play') this.inst.play(e.anim);
      else this.inst.visible = e.visible;
    }
  }

  private applyGrid(): MenuEvent[] {
    const ev = this.grid.drain();
    for (const e of ev) {
      if (e.type !== 'play' || !e.anim) continue;
      const it = this.grid.item(e.row, e.col);
      if (!it) continue;
      const next = e.next ?? undefined;
      if (it.layout) (it.layout as MgmLayout).play(e.anim, next);
      else if (it.pane) this.inst.part(it.pane)?.play(e.anim, next);
    }
    return ev;
  }

  setAnimeWindow(names: readonly [string, string, string]): void {
    this.life.setAnimeWindow(names);
  }

  in(imm = false): boolean {
    const r = this.life.in(imm);
    this.applyLife();
    return r;
  }

  out(imm = false): boolean {
    const r = this.life.out(imm);
    this.applyLife();
    return r;
  }

  isVisible(): boolean {
    return this.life.visible;
  }

  /** IsEndAnimation(창 레이아웃) */
  isEndAnimation(): boolean {
    return this.inst.done;
  }

  /** 한 틱: 창 생애 갱신(보일 때만) → 레이아웃 애니 진행 → 붙인 항목 레이아웃(창 다음, AddDependency) */
  update(): void {
    if (this.life.visible) {
      this.life.update(this.inst.done);
      this.applyLife();
    }
    this.inst.update(1);
    for (const row of this.grid.grid) for (const it of row) if (it.layout) (it.layout as MgmLayout).update();
  }

  setupMenu(rows: number, cols: number, o: { wrap?: boolean; checkEnable?: boolean } = {}): void {
    this.grid.setupMenu(rows, cols, !!o.wrap, !!o.checkEnable);
  }

  clearMenu(): void {
    this.grid.clearMenu();
  }

  addAnimeSet(m: MenuAnimeSet): number {
    return this.grid.addAnimeSet(m);
  }

  setupItem(r: number, c: number, pane: string, k = 0): void {
    this.grid.setupItem(r, c, pane, k);
  }

  setupFinish(): MenuEvent[] {
    this.grid.setupFinish();
    return this.applyGrid();
  }

  hookItem(r: number, c: number, item: MgmLayout): void {
    const it = this.grid.item(r, c);
    if (!it) return;
    it.layout = item;
    if (it.pane) item.setConstraint(this, it.pane);
  }

  unhookItem(r: number, c: number): void {
    const it = this.grid.item(r, c);
    if (!it?.layout) return;
    (it.layout as MgmLayout).removeConstraint();
    it.layout = null;
  }

  get cursor(): { row: number; col: number } {
    return { row: this.grid.cursorRow, col: this.grid.cursorCol };
  }

  setCursor(r: number, c: number, imm = false): boolean {
    const v = this.grid.setCursor(r, c, imm);
    this.applyGrid();
    return v;
  }

  moveX(dir: number): boolean {
    const v = this.grid.moveCursorX(dir);
    this.applyGrid();
    return v;
  }

  moveY(dir: number): boolean {
    const v = this.grid.moveCursorY(dir);
    this.applyGrid();
    return v;
  }

  decide(r = this.grid.cursorRow, c = this.grid.cursorCol): void {
    this.grid.decide(r, c);
    this.applyGrid();
  }

  setItemEnable(r: number, c: number, e: boolean): void {
    this.grid.setItemEnable(r, c, e);
    this.applyGrid();
  }

  /** vt+0x278: layout 있으면 layout.SetVisible, 아니면 SetPaneVisible */
  setItemVisible(r: number, c: number, v: boolean): void {
    const it = this.grid.item(r, c);
    if (!it) return;
    if (it.layout) (it.layout as MgmLayout).visible = v;
    else if (it.pane) this.inst.setVisible(it.pane, v);
  }

  isItemVisible(r: number, c: number): boolean {
    return this.grid.isItemVisible(r, c);
  }

  isItemSelectable(r: number, c: number): boolean {
    return this.grid.isItemSelectable(r, c);
  }

  isCursorItemAnimating(): boolean {
    return this.grid.isCursorItemAnimating();
  }

  /** GetText(pane).SetMessageLabel(label) — label 이 메시지 라벨이 아니면 문자열 그대로 */
  setText(pane: string, label: string, inserts: Inserts = {}): void {
    this.paneText.set(pane, { raw: this.host.spec.texts[label] ?? label, inserts: { ...inserts } });
    this.renderText(pane);
  }

  /** SetPaneTextInsertMessage(pane, key, value) — key = 'Text0'·'Number0', value = 라벨/문자열/숫자 */
  insert(pane: string, key: string, value: string | number): void {
    let pt = this.paneText.get(pane);
    if (!pt) {
      const f = this.inst.find(pane);
      pt = { raw: (f && f[0].spec.nodes[f[1]].txt?.text) ?? '', inserts: {} };
      this.paneText.set(pane, pt);
    }
    pt.inserts[key] = value;
    this.renderText(pane);
  }

  /** 지금 페인 문구(태그 푼 것) */
  textOf(pane: string): string {
    const pt = this.paneText.get(pane);
    return pt ? plainText(pt.raw, this.host.spec.texts, pt.inserts) : '';
  }

  private renderText(pane: string): void {
    const pt = this.paneText.get(pane)!;
    const texts = this.host.spec.texts;
    const rt = parseMessage(pt.raw, texts, pt.inserts);
    const multi = rt.units.some((u) => u.ch === '\n' || u.color);
    let rp = this.rich.get(pane);
    if (multi) {
      if (!rp) {
        rp = new RichTextPane(this.host.all, this.inst, pane, this.host.spec.lineSpace[this.inst.name]?.[pane] ?? 0, !pane.endsWith('_shadow'));
        this.rich.set(pane, rp);
      }
      rp.set(rt);
    } else {
      if (rp) {
        rp.set(null);
        this.rich.delete(pane);
      }
      this.inst.setText(pane, plainText(pt.raw, texts, pt.inserts));
    }
  }

  /** 그리기: 창 → 여러 줄 글자 → 붙인 항목 레이아웃(커서 항목은 마지막 [설계: 같은 순위 엔티티 순서 미확정]) */
  draw(): void {
    if (!this.inst.visible) return;
    this.host.draw(this.inst, this.base);
    for (const rp of this.rich.values()) rp.draw(this.host.r2d, this.base);
    const cur = this.grid.item(this.grid.cursorRow, this.grid.cursorCol);
    const one = (it: MenuItem): void => {
      if (!it.layout) return;
      const p = (it.layout as MgmLayout).placement(this.base);
      if (p) this.host.draw((it.layout as MgmLayout).inst, p.m, p.alpha);
    };
    for (const row of this.grid.grid) for (const it of row) if (it !== cur) one(it);
    if (cur) one(cur);
  }
}

