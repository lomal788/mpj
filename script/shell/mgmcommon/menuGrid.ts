/**
 * 공용 창 메뉴 격자(순수 상태) — bq::mgm::ComUiMinigameModeWindowCommon +0x48~0x80, vt+0x240~0x2b8 (docs/shell/mgm_common.md 4.1·6.1~6.6).
 * 그리기 없음: 항목 보임·애니 끝은 host 로 묻고, 애니 재생 요청은 사건으로 낸다(drain).
 */

/** 항목 애니 세트 12칸: [0] cursor [1] rest [2] enter [3] leave [4] decide [5] afterDecide, [6..11] 같은 순서의 사용 불가판. null = 없음 */
export type MenuAnimeSet = readonly (string | null)[];

/** 기본 세트 @0x71019e9ea0 [데이터] */
export const DEFAULT_MENU_ANIME: MenuAnimeSet = ['cursor', 'normal', 'on', 'off', 'press', 'normal', 'cursor', 'disable', 'on', 'off', 'press', 'normal_ng'];

export interface MenuItem {
  pane: string | null;
  anime: number;
  enabled: boolean;
  /** HookMenuItemLayout 로 붙인 항목 레이아웃(그리기 쪽 객체) */
  layout: unknown | null;
}

export interface GridHost {
  /** layout 있으면 layout.IsVisible, 아니면 pane 있으면 IsPaneVisible(pane), 아니면 거짓 */
  isVisible(item: MenuItem, row: number, col: number): boolean;
  /** layout 있으면 layout.IsEndAnimation, 아니면 IsEndPaneAnimation(pane) */
  isEnd(item: MenuItem, row: number, col: number): boolean;
}

/**
 * 애니 사건: anim 재생 뒤 next 가 undefined 가 아니면 SetNextAnimation(next) 도 부른다(next = null 이어도 부름 — 원본 onCursorOut).
 * anim·next 가 null 이면 그리기 쪽은 아무것도 안 한다 [근사: 엔진 PlayAnimation(null) 미확정, 9.4]
 */
export type MenuEvent = { type: 'play'; row: number; col: number; anim: string | null; next?: string | null } | { type: 'edge' } | { type: 'loopGuard'; axis: 'x' | 'y' };

export class MenuGrid {
  animeSets: MenuAnimeSet[] = [];
  grid: MenuItem[][] = [];
  wrap = false;
  checkEnable = false;
  cursorCol = -1;
  cursorRow = -1;
  private out: MenuEvent[] = [];

  constructor(private readonly host: GridHost) {}

  drain(): MenuEvent[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  /** vt+0x240 */
  rowCount(): number {
    return this.grid.length;
  }

  /** vt+0x248: 0번 행 크기 */
  colCount(): number {
    return this.grid.length ? this.grid[0].length : 0;
  }

  item(r: number, c: number): MenuItem | undefined {
    return this.grid[r]?.[c];
  }

  /** vt+0x268 */
  setupMenu(rows: number, cols: number, wrap: boolean, checkEnable: boolean): void {
    this.animeSets = [DEFAULT_MENU_ANIME];
    this.grid.length = Math.min(this.grid.length, rows);
    while (this.grid.length < rows) this.grid.push([]);
    for (const row of this.grid) {
      row.length = Math.min(row.length, cols);
      while (row.length < cols) row.push({ pane: null, anime: 0, enabled: false, layout: null });
    }
    this.wrap = wrap;
    this.checkEnable = checkEnable;
    this.cursorCol = -1;
    this.cursorRow = -1;
  }

  /** vt+0x270 */
  clearMenu(): void {
    this.animeSets = [];
    this.grid = [];
    this.cursorCol = -1;
    this.cursorRow = -1;
  }

  /** SetupAddAnimeMenu → 번호 */
  addAnimeSet(m: MenuAnimeSet): number {
    this.animeSets.push(m);
    return this.animeSets.length - 1;
  }

  /** SetupItemMenu */
  setupItem(r: number, c: number, pane: string | null, k: number): void {
    this.grid[r][c] = { pane, anime: k, enabled: true, layout: null };
  }

  /** vt+0x250 */
  isItemVisible(r: number, c: number): boolean {
    const it = this.item(r, c);
    return !!it && this.host.isVisible(it, r, c);
  }

  /** vt+0x258 */
  isItemSelectable(r: number, c: number): boolean {
    const it = this.item(r, c);
    return !!it && this.isItemVisible(r, c) && (this.checkEnable ? it.enabled : true);
  }

  private set(r: number, c: number): MenuAnimeSet {
    return this.animeSets[this.grid[r][c].anime] ?? DEFAULT_MENU_ANIME;
  }

  private play(r: number, c: number, anim: string | null, next?: string | null): void {
    this.out.push(next === undefined ? { type: 'play', row: r, col: c, anim } : { type: 'play', row: r, col: c, anim, next });
  }

  /** SetupFinish: 보이는 항목마다 첫 애니(대체 규칙 없음) */
  setupFinish(): void {
    for (let r = 0; r < this.rowCount(); r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        if (!this.isItemVisible(r, c)) continue;
        const a = this.set(r, c);
        const sel = r === this.cursorRow && c === this.cursorCol;
        this.play(r, c, this.grid[r][c].enabled ? (sel ? a[0] : a[1]) : sel ? a[6] : a[7]);
      }
    }
  }

  /** vt+0x288 */
  onCursorIn(r: number, c: number, imm: boolean): void {
    if (r < 0 || c < 0 || !this.isItemSelectable(r, c)) return;
    const a = this.set(r, c);
    const e = this.grid[r][c].enabled;
    const T = e ? a[2] : a[8];
    const L = e ? a[0] : a[6];
    if (!imm && T) {
      if (L) this.play(r, c, T, L);
      else this.play(r, c, T);
    } else if (!L) {
      if (T) this.play(r, c, T);
    } else this.play(r, c, L);
  }

  /** vt+0x290: !imm && T 일 때 setNext(L) 를 L 이 null 이어도 부른다 */
  onCursorOut(r: number, c: number, imm: boolean): void {
    if (r < 0 || c < 0 || !this.isItemSelectable(r, c)) return;
    const a = this.set(r, c);
    const e = this.grid[r][c].enabled;
    const T = e ? a[3] : a[9];
    const L = e ? a[1] : a[7];
    if (!imm && T) this.play(r, c, T, L);
    else if (!L) {
      if (T) this.play(r, c, T);
    } else this.play(r, c, L);
  }

  /** vt+0x298: 넘김 없는 끝(파생 훅) */
  onCursorEdge(): void {
    this.out.push({ type: 'edge' });
  }

  /** vt+0x2a0 */
  setCursor(r: number, c: number, imm: boolean): boolean {
    if (c === this.cursorCol && r === this.cursorRow) return false;
    this.onCursorOut(this.cursorRow, this.cursorCol, imm);
    this.cursorCol = c;
    this.cursorRow = r;
    this.onCursorIn(r, c, imm);
    return true;
  }

  /** vt+0x2a8: 같은 행에서 열 이동, 크기는 무시하고 부호만 */
  moveCursorX(dir: number): boolean {
    if (dir === 0 || (this.cursorCol < 0 && this.cursorRow < 0)) return false;
    const n = this.colCount();
    const s = dir < 0 ? -1 : 1;
    let c = this.cursorCol;
    let guard = 0;
    do {
      c += s;
      if (c < 0 || c >= n) {
        if (!this.wrap) {
          this.onCursorEdge();
          return false;
        }
        c = (((c + n) % n) + n) % n;
      }
      if (++guard > n + 1) {
        this.out.push({ type: 'loopGuard', axis: 'x' });
        return false;
      }
    } while (!this.isItemSelectable(this.cursorRow, c));
    return this.setCursor(this.cursorRow, c, false);
  }

  /** vt+0x2b0: 행 이동, 선택 불가 칸이면 왼쪽 우선으로 가장 가까운 열 */
  moveCursorY(dir: number): boolean {
    if (dir === 0 || (this.cursorCol < 0 && this.cursorRow < 0)) return false;
    const m = this.rowCount();
    const s = dir < 0 ? -1 : 1;
    let r = this.cursorRow;
    let c = this.cursorCol;
    let guard = 0;
    do {
      r += s;
      if (r < 0 || r >= m) {
        if (!this.wrap) {
          this.onCursorEdge();
          return false;
        }
        r = (((r + m) % m) + m) % m;
      }
      if (!this.isItemSelectable(r, c)) {
        let found = -1;
        for (let k = c - 1; k >= 0; k--)
          if (this.isItemSelectable(r, k)) {
            found = k;
            break;
          }
        if (found < 0)
          for (let k = c + 1; k < this.colCount(); k++)
            if (this.isItemSelectable(r, k)) {
              found = k;
              break;
            }
        if (found >= 0) c = found;
      }
      if (++guard > m + 1) {
        this.out.push({ type: 'loopGuard', axis: 'y' });
        return false;
      }
    } while (!this.isItemSelectable(r, c));
    return this.setCursor(r, c, false);
  }

  /** vt+0x280: 즉시, setNext 없음 */
  setItemEnable(r: number, c: number, e: boolean): void {
    const it = this.item(r, c);
    if (!it) return;
    it.enabled = e;
    if (r < 0 || c < 0 || !this.isItemSelectable(r, c)) return;
    const a = this.set(r, c);
    const sel = c === this.cursorCol && r === this.cursorRow;
    const name = sel ? ((e ? a[0] : a[6]) ?? (e ? a[2] : a[8])) : ((e ? a[1] : a[7]) ?? (e ? a[3] : a[9]));
    this.play(r, c, name);
  }

  /** vt+0x2b8: null 검사 없음 */
  decide(r: number, c: number): void {
    const it = this.item(r, c);
    if (!it) return;
    const a = this.set(r, c);
    if (it.enabled) this.play(r, c, a[4], a[5]);
    else this.play(r, c, a[10], a[11]);
  }

  /** vt+0x260: 항목 레이아웃 = IsEndAnimation(끝났음), 페인 항목 = 재생 중 — 원본 비대칭 그대로(6.6) */
  isCursorItemAnimating(): boolean {
    if (this.cursorCol < 0 && this.cursorRow < 0) return false;
    const it = this.item(this.cursorRow, this.cursorCol);
    if (!it) return false;
    if (it.layout) return this.host.isEnd(it, this.cursorRow, this.cursorCol);
    return !this.host.isEnd(it, this.cursorRow, this.cursorCol);
  }
}
