/** Import 0. Fixed-tick screen interaction; rendering, RNG and app services are injected. */
export interface ScreenItem {
  id: string;
  owner: number;
  row: number;
  col: number;
  enabled: boolean;
  visible: boolean;
  occupiedBy?: number;
}
export interface ScreenPolicy {
  wrap: boolean;
  repeatWrap: boolean;
  multi: boolean;
  columns: number;
}
export interface ScreenEvent {
  type: "focus" | "decide" | "cancel";
  id: string | null;
  pid: number;
}
export interface ScreenHost {
  event(event: ScreenEvent): void;
  random(): number;
}
export class ScreenRuntime {
  tickIndex = 0;
  cursors = new Map<number, string>();
  decided = new Map<number, string>();
  constructor(
    public items: ScreenItem[],
    public policy: ScreenPolicy,
    private host: ScreenHost,
  ) {}
  private available(n: ScreenItem, pid: number) {
    return (
      n.visible &&
      n.enabled &&
      (this.policy.multi || n.owner === pid) &&
      (n.occupiedBy === undefined || n.occupiedBy === pid) &&
      ![...this.decided].some(([p, id]) => p !== pid && id === n.id)
    );
  }
  focus(pid: number, id: string) {
    if (this.decided.has(pid)) return false;
    const n = this.items.find((n) => n.id === id);
    if (!n || !this.available(n, pid)) return false;
    if (this.cursors.get(pid) === id) return true;
    this.cursors.set(pid, id);
    this.host.event({ type: "focus", id, pid });
    return true;
  }
  initialize(players: number[]) {
    for (const pid of players) {
      const n = this.items.find((n) => this.available(n, pid));
      if (n) this.focus(pid, n.id);
    }
  }
  move(pid: number, dx: number, dy: number, repeated = false) {
    if (this.decided.has(pid)) return;
    const n = this.items.find((n) => n.id === this.cursors.get(pid));
    if (!n) return;
    const candidates = this.items.filter((x) => this.available(x, pid));
    if (dx) {
      let row = candidates
        .filter((x) => x.row === n.row)
        .sort((a, b) => a.col - b.col);
      let next = row.filter((x) => (dx > 0 ? x.col > n.col : x.col < n.col));
      if (dx < 0) next.reverse();
      if (
        !next.length &&
        (repeated ? this.policy.repeatWrap : this.policy.wrap)
      )
        next = dx > 0 ? row : row.reverse();
      if (next[0]) this.focus(pid, next[0].id);
    }
    if (dy) {
      let rows = [...new Set(candidates.map((x) => x.row))].sort(
        (a, b) => a - b,
      );
      let dest = rows.filter((r) => (dy > 0 ? r > n.row : r < n.row));
      if (dy < 0) dest.reverse();
      if (
        !dest.length &&
        (repeated ? this.policy.repeatWrap : this.policy.wrap)
      )
        dest = dy > 0 ? rows : rows.reverse();
      if (dest[0] !== undefined) {
        const row = candidates
          .filter((x) => x.row === dest[0])
          .sort(
            (a, b) =>
              Math.abs(a.col - n.col) - Math.abs(b.col - n.col) ||
              a.col - b.col,
          );
        if (row[0]) this.focus(pid, row[0].id);
      }
    }
  }
  decide(pid: number) {
    const id = this.cursors.get(pid),
      n = this.items.find((x) => x.id === id);
    if (n && this.available(n, pid)) {
      if (this.policy.multi) this.decided.set(pid, n.id);
      this.host.event({ type: "decide", id: n.id, pid });
    }
  }
  cancel(pid: number) {
    this.decided.delete(pid);
    this.host.event({ type: "cancel", id: this.cursors.get(pid) ?? null, pid });
  }
  random(pid: number) {
    const rows = this.items.filter((x) => this.available(x, pid));
    if (rows.length)
      this.focus(
        pid,
        rows[
          Math.min(
            rows.length - 1,
            Math.max(0, Math.floor(this.host.random() * rows.length)),
          )
        ].id,
      );
  }
  tick(
    inputs: {
      pid: number;
      dx?: number;
      dy?: number;
      repeat?: boolean;
      decide?: boolean;
      cancel?: boolean;
    }[],
  ) {
    this.tickIndex++;
    for (const input of [...inputs].sort((a, b) => a.pid - b.pid)) {
      if (input.cancel) this.cancel(input.pid);
      else {
        this.move(input.pid, input.dx ?? 0, input.dy ?? 0, input.repeat);
        if (input.decide) this.decide(input.pid);
      }
    }
  }
  dispose() {
    this.cursors.clear();
    this.decided.clear();
    this.items = [];
  }
}
