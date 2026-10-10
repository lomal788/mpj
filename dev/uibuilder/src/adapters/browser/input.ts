/** DOM/gamepad adapter; samples inputs only when the fixed-tick preview gate polls. */
export class PreviewInput {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private previous = new Map<number, number>();
  private holds = new Map<string, number>();
  private down = (e: KeyboardEvent) => {
    if (this.target && !this.target.contains(document.activeElement)) return;
    if ((e.target as HTMLElement).closest("input,textarea,select")) return;
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Enter",
        "Escape",
        " ",
      ].includes(e.key)
    )
      e.preventDefault();
    this.keys.add(e.key);
    if (!e.repeat) this.pressed.add(e.key);
  };
  private up = (e: KeyboardEvent) => this.keys.delete(e.key);
  private blur = () => this.clear();
  constructor(
    private target?: HTMLElement,
    private keyboardOwner: () => number = () => 0,
  ) {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.blur);
  }
  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.previous.clear();
    this.holds.clear();
  }
  poll(players: number, delay: number, interval: number) {
    const inputs = [];
    const samples = this.sample(players);
    for (const {pid, bits, fresh} of samples) {
      let move = 0,
        repeated = false;
      for (const bit of [1, 2, 4, 8]) {
        const key = `${pid}:${bit}`,
          held = bits & bit ? (this.holds.get(key) ?? 0) + 1 : 0;
        this.holds.set(key, held);
        if (fresh & bit) move |= bit;
        else if (held > delay && (held - delay) % interval === 0) { move |= bit; repeated = true; }
      }
      inputs.push({pid, dx: move & 1 ? -1 : move & 2 ? 1 : 0, dy: move & 4 ? -1 : move & 8 ? 1 : 0, repeat: repeated, decide: !!(fresh & 16), cancel: !!(fresh & 32)});
    }
    return inputs;
  }
  nativePoll(players: number) {
    const convert = (b: number) => (b & 1 ? 0x100 : 0) | (b & 2 ? 0x200 : 0) | (b & 4 ? 0x800 : 0) | (b & 8 ? 0x400 : 0) | (b & 16 ? 1 : 0) | (b & 32 ? 2 : 0);
    return this.sample(players).map(({bits,fresh}) => ({hold: convert(bits), trig: convert(fresh)}));
  }
  private sample(players: number) {
    const samples = [];
    const active = !this.target || this.target.contains(document.activeElement);
    if (!active) { this.clear(); return Array.from({length: players}, (_,pid) => ({pid,bits:0,fresh:0})); }
    const pads = navigator.getGamepads?.() ?? [];
    for (let pid = 0; pid < players; pid++) {
      let bits = 0;
      if (pid === this.keyboardOwner()) {
        const has = (key: string) =>
          this.keys.has(key) || this.pressed.has(key);
        if (has("ArrowLeft")) bits |= 1;
        if (has("ArrowRight")) bits |= 2;
        if (has("ArrowUp")) bits |= 4;
        if (has("ArrowDown")) bits |= 8;
        if (has("Enter") || has(" ")) bits |= 16;
        if (has("Escape")) bits |= 32;
      }
      const pad = pads[pid];
      if (pad) {
        if (pad.axes[0] < -0.5 || pad.buttons[14]?.pressed) bits |= 1;
        if (pad.axes[0] > 0.5 || pad.buttons[15]?.pressed) bits |= 2;
        if (pad.axes[1] < -0.5 || pad.buttons[12]?.pressed) bits |= 4;
        if (pad.axes[1] > 0.5 || pad.buttons[13]?.pressed) bits |= 8;
        if (pad.buttons[0]?.pressed) bits |= 16;
        if (pad.buttons[1]?.pressed) bits |= 32;
      }
      let fresh = bits & ~(this.previous.get(pid) ?? 0);
      if (pid === this.keyboardOwner()) {
        if (this.pressed.has("ArrowLeft")) fresh |= 1;
        if (this.pressed.has("ArrowRight")) fresh |= 2;
        if (this.pressed.has("ArrowUp")) fresh |= 4;
        if (this.pressed.has("ArrowDown")) fresh |= 8;
        if (this.pressed.has("Enter") || this.pressed.has(" ")) fresh |= 16;
        if (this.pressed.has("Escape")) fresh |= 32;
      }
      this.previous.set(pid, bits);
      samples.push({pid, bits, fresh});
    }
    this.pressed.clear();
    return samples;
  }
  dispose() {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.blur);
    this.clear();
  }
}
