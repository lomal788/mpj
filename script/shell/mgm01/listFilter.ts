/**
 * 목록 머리 줄 필터(장르) 선택 — 순수 상태. 목록 화면(listView, 다음 단계)에 그대로 끼우는 부품: 입력 비트·창 애니 끝 신호 → 사건.
 * 근거: docs/shell/mgm01_freeplay.md 6.1(필터 순서·형식·빈 즐겨찾기)·6.2(필터 입력 exact rep 0x10/0x40·0x20/0x80)·7(DECI_LR, select_00 완료→재구성→select_01).
 */
import { FILTER, filterNextIndex, listType, type Mgm01Catalog } from './catalog';

export interface FilterApplied {
  enumNo: number;
  index: number;
  name: string;
  label: string;
  ids: number[];
  unlocked: number[];
  type: 0 | 1 | 2;
  emptyFavorite: boolean;
}

export type FilterEvent =
  | { type: 'se'; label: string }
  | { type: 'anim'; name: string }
  | { type: 'applied'; result: FilterApplied };

export interface FilterDeps {
  reason(id: number): number;
  favorite(id: number): boolean;
}

export const FILTER_SE = 'SQ_SE_MGM01_DECI_LR';

export class ListFilterState {
  index: number;
  phase: 'idle' | 'select0' | 'select1' = 'idle';
  private dir = 0;
  applied: FilterApplied;
  private events: FilterEvent[] = [];

  constructor(
    readonly catalog: Mgm01Catalog,
    private readonly deps: FilterDeps,
    enumNo: number = FILTER.MgAll,
  ) {
    const i = catalog.filterIndexOf(enumNo);
    this.index = i < 0 ? 0 : i;
    this.applied = this.apply();
  }

  apply(): FilterApplied {
    const f = this.catalog.filterAt(this.index);
    const ids = this.catalog.mgIdList(f.enumNo, true, this.deps.reason, this.deps.favorite);
    const unlocked = ids.filter((id) => this.deps.reason(id) === -1);
    this.applied = {
      enumNo: f.enumNo,
      index: this.index,
      name: f.name,
      label: f.label,
      ids,
      unlocked,
      type: listType(ids.length),
      emptyFavorite: f.enumNo === FILTER.MgFavorite && ids.length === 0,
    };
    return this.applied;
  }

  input(rep: number): boolean {
    if (this.phase !== 'idle') return false;
    let dir = 0;
    if (rep === 0x10 || rep === 0x40) dir = -1;
    else if (rep === 0x20 || rep === 0x80) dir = 1;
    if (!dir) return false;
    this.dir = dir;
    this.phase = 'select0';
    this.events.push({ type: 'se', label: FILTER_SE }, { type: 'anim', name: dir < 0 ? 'left_select_00' : 'right_select_00' });
    return true;
  }

  step(animDone: boolean): void {
    if (this.phase === 'select0' && animDone) {
      this.index = filterNextIndex(this.index, this.dir, this.catalog.filters.length);
      this.events.push({ type: 'applied', result: this.apply() }, { type: 'anim', name: this.dir < 0 ? 'left_select_01' : 'right_select_01' });
      this.phase = 'select1';
    } else if (this.phase === 'select1' && animDone) {
      this.phase = 'idle';
    }
  }

  drain(): FilterEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
