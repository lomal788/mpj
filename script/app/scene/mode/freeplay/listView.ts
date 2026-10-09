/**
 * 프리 플레이 목록 본체 — 순수 상태(목록 구성·커서·끝 행 이동·결정/잠금/랜덤/승패 표/취소·필터·NEW 관찰). DecideMinigameFlow 상태 2(MgListFlow).
 * 근거: docs/shell/mgm01_freeplay.md 5.5(전이·SE)·6.1(형식)·6.2(입력 표·정정)·6.3(끝 행·랜덤)·6.4(잠금·NEW)·6.7(3행×112열 메뉴·위치→페인 표·Prepare·ResetMgItem). 웹 결정은 9.2.
 */
import { LIST_FORMAT, positiveMod, type Mgm01Catalog } from './catalog';
import { ListFilterState, type FilterApplied, type FilterDeps } from './listFilter';
import { NewObserver, NEW_ICON_WAIT } from './announce';

export const LIST_PANE_TABLE: readonly (readonly number[])[] = [
  [
    0, 8, 16, 24, 31, 38, 45, 52, 59, 66, 73, 80, 87, 94, 101, 1, 9, 17, 25, 32, 39, 46, 53, 60, 67, 74, 81, 88, 95, 102, 2, 10, 18, 26, 33, 40, 47, 54, 61, 68, 75, 82, 89, 96, 103, 3, 11, 19,
    27, 34, 41, 48, 55, 62, 69, 76, 83, 90, 97, 104, 4, 12, 20, 28, 35, 42, 49, 56, 63, 70, 77, 84, 91, 98, 105, 5, 13, 21, 29, 36, 43, 50, 57, 64, 71, 78, 85, 92, 99, 106, 6, 14, 22, 30, 37,
    44, 51, 58, 65, 72, 79, 86, 93, 100, 107, 7, 15, 23, 108, 109, 110, 111,
  ],
  [0, 4, 8, 12, 16, 20, 24, 28, 1, 5, 9, 13, 17, 21, 25, 29, 2, 6, 10, 14, 18, 22, 26, 30, 3, 7, 11, 15, 19, 23, 27, 31],
  [0, 3, 6, 9, 12, 1, 4, 7, 10, 13, 2, 5, 8, 11, 14],
];
export const LIST_ITEM_MAX = 112;
export const MG_LIST_MENU_ANIME = ['on', null, null, 'off', 'press', 'normal', 'on_ng', null, null, 'off_ng', 'press_ng', 'normal_ng'] as const;
export const LIST_SE = {
  cursor: 'SQ_SE_MGM01_CUR',
  decide: 'SQ_SE_MGM01_DEC',
  error: 'SQ_SE_SYS_ERROR',
  random: 'SQ_SE_MGM01_DECI_S',
  history: 'SQ_SE_MGM01_DECI_S',
  cancel: 'SQ_SE_MGM01_CANCEL',
} as const;
export const PLACEHOLDER_THUMB = 'mgboss^o';
export const PLACEHOLDER_NAME = 'mgm01_ui_mgNameNone';

export function listPane(type: number, i: number): string {
  return `x_thum_0${type}_${String(LIST_PANE_TABLE[type][i]).padStart(2, '0')}`;
}

export function thumbKey(name: string): string {
  return `${name}^o`;
}

/** MgListFlow_MoveCursor(dx, dy, fresh) — 6.3: fresh 가 아니면 끝을 넘는 이동을 먼저 막고, 위/아래 넘침은 마지막 행 빈칸 Q 로 돌린 뒤 dx 를 더해 양수 modulo */
export function listMoveTarget(cursor: number, n: number, w: number, dx: number, dy: number, fresh: boolean): number {
  let ddx = dx;
  let ddy = dy;
  if (!fresh) {
    if (cursor < w && ddy < 0) ddy = 0;
    if (n - w <= cursor && ddy > 0) ddy = 0;
    if (ddx < 0 && cursor % w === 0) ddx = 0;
    else if (ddx > 0 && (cursor === n - 1 || cursor % w === w - 1)) ddx = 0;
  }
  if (ddx === 0 && ddy === 0) return cursor;
  const r = n % w;
  const q = (w - r) % w;
  let t = cursor + ddy * w;
  if (t < 0) t = t < -q ? t + q : t - r;
  else if (t >= n) t = t - n < q ? t + r : t - q;
  return positiveMod(t + ddx, n);
}

export interface ListDeps extends FilterDeps {
  catalog: Mgm01Catalog;
  isNew(id: number): boolean;
  rand(n: number): number;
}

export type ListExit = 3 | 4 | 7;

export type ListEvent =
  | { type: 'se'; label: string; at?: 'cursor' | 'filterL' | 'filterR' }
  | { type: 'fx' }
  | { type: 'vibrate' }
  | { type: 'apply'; result: FilterApplied }
  | { type: 'cursor'; index: number; imm: boolean }
  | { type: 'decide'; index: number }
  | { type: 'announce'; reason: number }
  | { type: 'skip' }
  | { type: 'filterAnim'; name: string; dir: number }
  | { type: 'reset' }
  | { type: 'newConsume'; id: number; index: number }
  | { type: 'exit'; result: ListExit; id: number };

export class ListState {
  readonly filter: ListFilterState;
  cursor = -1;
  selectedId = -1;
  resume = false;
  phase: 'idle' | 'filter' | 'exit' = 'idle';
  exitResult: ListExit | null = null;
  readonly observer: NewObserver;
  private events: ListEvent[] = [];

  constructor(
    readonly deps: ListDeps,
    enumNo = 0,
    newWait = NEW_ICON_WAIT,
  ) {
    this.filter = new ListFilterState(deps.catalog, deps, enumNo);
    this.observer = new NewObserver(newWait);
  }

  get ids(): number[] {
    return this.filter.applied.ids;
  }

  get type(): 0 | 1 | 2 {
    return this.filter.applied.type;
  }

  get cols(): number {
    return LIST_FORMAT[this.type].cols;
  }

  get enumNo(): number {
    return this.filter.applied.enumNo;
  }

  get index(): number {
    return this.filter.applied.index;
  }

  newVisible(id: number): boolean {
    return this.deps.isNew(id) && this.deps.reason(id) !== 0;
  }

  private observe(id: number, index: number): void {
    if (this.newVisible(id)) this.observer.start(id, index);
    else this.observer.stop();
  }

  /** PrepareMgListFlow 의 목록 쪽: 필터 index 목록 → resume 이면 저장 ID 위치 → apply → 커서(imm) → NEW 관찰 */
  prepare(index = -1): void {
    if (index >= 0) this.filter.index = index;
    this.observer.stop();
    const r = this.filter.apply();
    let pos = 0;
    if (this.resume) {
      const k = r.ids.indexOf(this.selectedId);
      if (k >= 0) pos = k;
    }
    this.phase = 'idle';
    this.exitResult = null;
    this.cursor = r.ids.length ? pos : -1;
    this.events.push({ type: 'apply', result: r });
    if (r.ids.length) {
      this.events.push({ type: 'cursor', index: pos, imm: true });
      this.observe(r.ids[pos], pos);
    }
  }

  /** MgListFlow 가 Prepare 뒤 resume 을 끈다 */
  opened(): void {
    this.resume = false;
  }

  private exit(result: ListExit, id: number): void {
    this.phase = 'exit';
    this.exitResult = result;
    this.selectedId = id;
    this.events.push({ type: 'exit', result, id });
  }

  private decide(): boolean {
    const i = this.cursor;
    const id = this.ids[i];
    this.events.push({ type: 'decide', index: i });
    this.selectedId = id;
    const reason = this.deps.reason(id);
    if (reason === -1) {
      this.events.push({ type: 'se', label: LIST_SE.decide }, { type: 'fx' });
      this.exit(4, id);
      return true;
    }
    this.events.push({ type: 'se', label: LIST_SE.error }, { type: 'vibrate' }, { type: 'announce', reason });
    return false;
  }

  private random(): boolean {
    const cand = this.deps.catalog.mgIdList(this.enumNo, false, this.deps.reason, this.deps.favorite);
    if (!cand.length) {
      this.events.push({ type: 'se', label: LIST_SE.error }, { type: 'vibrate' });
      return false;
    }
    this.events.push({ type: 'se', label: LIST_SE.random }, { type: 'fx' });
    const r = Math.min(Math.max(this.deps.rand(cand.length), 0), cand.length - 1);
    const id = cand[r];
    let idx = this.ids.indexOf(id);
    if (idx < 0) idx = r;
    this.cursor = idx;
    this.events.push({ type: 'cursor', index: idx, imm: true }, { type: 'decide', index: idx });
    this.exit(4, id);
    return true;
  }

  private move(rep: number, trig: number): void {
    let dy = 0;
    if (rep & 0x800) dy = -1;
    else if (rep & 0x400) dy = 1;
    else if (rep & 0x20000) dy = -1;
    else if (rep & 0x80000) dy = 1;
    let dx = 0;
    if (rep & 0x100) dx = -1;
    else if (rep & 0x200) dx = 1;
    else if (rep & 0x10000) dx = -1;
    else if (rep & 0x40000) dx = 1;
    if (!dx && !dy) return;
    const n = this.ids.length;
    const to = listMoveTarget(this.cursor, n, this.cols, dx, dy, (trig & 0xf0f00) !== 0);
    if (to === this.cursor) return;
    this.cursor = to;
    this.events.push({ type: 'se', label: LIST_SE.cursor, at: 'cursor' }, { type: 'fx' }, { type: 'cursor', index: to, imm: true });
    this.observe(this.ids[to], to);
  }

  private moveFilter(rep: number): void {
    if (!this.filter.input(rep)) return;
    this.phase = 'filter';
    for (const e of this.filter.drain()) {
      if (e.type === 'se') {
        const next = rep === 0x20 || rep === 0x80;
        this.events.push({ type: 'se', label: e.label, at: next ? 'filterR' : 'filterL' }, { type: 'fx' });
      } else if (e.type === 'anim') this.events.push({ type: 'filterAnim', name: e.name, dir: e.name.startsWith('left') ? -1 : 1 });
    }
  }

  /** MgListFlow 한 프레임 입력(창이 active·열림/닫힘 중 아님일 때만 부른다) */
  input(trig: number, rep: number): void {
    if (this.phase !== 'idle') return;
    if (!this.ids.length) {
      if (trig === 0x4) {
        this.events.push({ type: 'se', label: LIST_SE.history }, { type: 'fx' }, { type: 'skip' });
        this.exit(3, -1);
        return;
      }
      if (trig === 0x2) {
        this.events.push({ type: 'se', label: LIST_SE.cancel }, { type: 'skip' });
        this.exit(7, -1);
        return;
      }
      this.moveFilter(rep);
      if (trig > 1) this.events.push({ type: 'skip' });
      return;
    }
    if (trig === 0x8 || trig === 0x1) {
      if (trig === 0x8) this.random();
      else this.decide();
      this.moveFilter(rep);
      if (trig > 1) this.events.push({ type: 'skip' });
      return;
    }
    this.move(rep, trig);
    if (trig === 0x4) {
      this.events.push({ type: 'se', label: LIST_SE.history }, { type: 'fx' }, { type: 'skip' });
      this.exit(3, this.ids[this.cursor] ?? -1);
      return;
    }
    if (trig === 0x2) {
      this.events.push({ type: 'se', label: LIST_SE.cancel }, { type: 'skip' });
      this.exit(7, this.selectedId);
      return;
    }
    this.moveFilter(rep);
    if (trig > 1) this.events.push({ type: 'skip' });
  }

  /** 필터 애니 끝 신호: select_00 끝 → ResetMgItem → index±1 → Prepare(목록·커서 0) → select_01, 그 끝 → idle */
  stepFilter(animDone: boolean): void {
    if (this.phase !== 'filter') return;
    const before = this.filter.phase;
    if (before === 'select0' && animDone) {
      this.events.push({ type: 'reset' });
      this.filter.step(true);
      this.observer.stop();
      const r = this.filter.applied;
      this.cursor = r.ids.length ? 0 : -1;
      for (const e of this.filter.drain()) {
        if (e.type === 'applied') {
          this.events.push({ type: 'apply', result: e.result });
          if (r.ids.length) {
            this.events.push({ type: 'cursor', index: 0, imm: true });
            this.observe(r.ids[0], 0);
          }
        } else if (e.type === 'anim') this.events.push({ type: 'filterAnim', name: e.name, dir: e.name.startsWith('left') ? -1 : 1 });
      }
    } else if (before === 'select1' && animDone) {
      this.filter.step(true);
      this.filter.drain();
      this.phase = 'idle';
    }
  }

  /** NEW 관찰 Fiber 한 틱 */
  stepNew(rate: number): void {
    const id = this.observer.step(rate);
    if (id !== null) this.events.push({ type: 'newConsume', id, index: this.observer.index });
  }

  drain(): ListEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

