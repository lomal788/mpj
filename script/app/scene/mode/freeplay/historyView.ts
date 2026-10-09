/**
 * 승패 표 — 결과 100칸 고리 읽기·8칸 보기·점수(순수 상태). 목록에서 Y 로 연다(DecideMinigameFlow 상태 3).
 * 근거: docs/shell/mgm01_freeplay.md 6.2(결과 입력: exact rep 좌/우 스크롤, trig B 닫기)·6.6(고리·earliest·score·raw byte 비교)·7(CANCEL, 스크롤 무음).
 */
import { RESULT_RING, type MgmWork, type MgResultEntry } from '@app/common/ui/contracts';

export const HISTORY_ROWS = 8;
export const HISTORY_CLOSE_SE = 'SQ_SE_MGM01_CANCEL';

export interface HistorySource {
  count: number;
  earliest(index: number): MgResultEntry | null;
}

export function earliestFromRing(ring: readonly (MgResultEntry | null)[], round: number, index: number): MgResultEntry | null {
  const count = Math.min(Math.max(round, 0), RESULT_RING);
  if (index < 0 || index >= count) return null;
  return ring[round >= RESULT_RING ? (round + index) % RESULT_RING : index] ?? null;
}

export function writeRing(ring: (MgResultEntry | null)[], round: number, e: MgResultEntry): void {
  ring[(((round - 1) % RESULT_RING) + RESULT_RING) % RESULT_RING] = e;
}

export function historyFromRing(ring: readonly (MgResultEntry | null)[], round: number): HistorySource {
  return { count: Math.min(Math.max(round, 0), RESULT_RING), earliest: (i) => earliestFromRing(ring, round, i) };
}

export function historyFromWork(work: MgmWork): HistorySource {
  const count = Math.min(Math.max(work.round, 0), RESULT_RING);
  const off = work.results.length - count;
  return {
    count,
    earliest: (i) => (i >= 0 && i < count ? (work.results[off + i] ?? null) : null),
  };
}

export function isWinByte(e: MgResultEntry, p: number): boolean {
  return e.results[p] === (e.judge !== 0 ? 1 : 0);
}

export function historyScores(src: HistorySource): [number, number, number, number] {
  const s: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < src.count; i++) {
    const e = src.earliest(i);
    if (!e || e.id < 0) continue;
    for (let p = 0; p < 4; p++) if (isWinByte(e, p)) s[p]++;
  }
  return s;
}

export interface HistoryRow {
  slot: number;
  entry: MgResultEntry | null;
  win: [boolean, boolean, boolean, boolean];
}

export type HistoryEvent = { type: 'se'; label: string } | { type: 'scroll'; offset: number } | { type: 'close' };

export class HistoryState {
  scroll: number;
  closed = false;
  private events: HistoryEvent[] = [];

  constructor(readonly src: HistorySource) {
    this.scroll = this.maxScroll;
  }

  get maxScroll(): number {
    return Math.max(this.src.count - HISTORY_ROWS, 0);
  }

  get scrollbar(): { visible: boolean; pos: number } {
    const m = this.src.count - HISTORY_ROWS;
    return m > 0 ? { visible: true, pos: this.scroll / m } : { visible: false, pos: 0 };
  }

  rows(): HistoryRow[] {
    const out: HistoryRow[] = [];
    for (let i = 0; i < HISTORY_ROWS; i++) {
      const k = this.scroll + i;
      const e = k < this.src.count ? this.src.earliest(k) : null;
      out.push({ slot: i, entry: e, win: [0, 1, 2, 3].map((p) => !!e && isWinByte(e, p)) as [boolean, boolean, boolean, boolean] });
    }
    return out;
  }

  scores(): [number, number, number, number] {
    return historyScores(this.src);
  }

  input(trig: number, rep: number): void {
    if (this.closed) return;
    let d = 0;
    if (rep === 0x100 || rep === 0x10000) d = -1;
    else if (rep === 0x200 || rep === 0x40000) d = 1;
    if (d) {
      const s = Math.min(Math.max(this.scroll + d, 0), this.maxScroll);
      if (s !== this.scroll) {
        this.scroll = s;
        this.events.push({ type: 'scroll', offset: s });
      }
    }
    if (trig & 0x2) {
      this.closed = true;
      this.events.push({ type: 'se', label: HISTORY_CLOSE_SE }, { type: 'close' });
    }
  }

  drain(): HistoryEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
