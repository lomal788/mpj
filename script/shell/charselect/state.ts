/**
 * 캐릭터 선택 순수 상태기계 — 원본 bq::ComUiSelectPlayerCharacter(main @0x7100339360~) 갱신 규칙.
 * 근거·절 번호: web/docs/shell/charselect.md (3.2 In, 3.3 상태, 5 선택·OK, 4 필드). DOM·three 를 쓰지 않는다(노드에서 시험).
 *
 * 한 번의 step() = 원본 60fps 한 프레임. 입력은 플레이어 칸마다 {trig, rep} 비트(4절 표), 출력은 화면이 처리할 사건 목록.
 * 페인 애니 끝 판정(원본 AnimationSlot 재생 상태 3)은 애니 길이(명세 데이터)로 이 안에서 센다.
 */

/** 입력 비트 [판독: 사용 위치에서 뜻을 정함] */
export const PAD = {
  A: 0x1,
  B: 0x2,
  UP: 0x20800,
  DOWN: 0x80400,
  LEFT: 0x10100,
  RIGHT: 0x40200,
} as const;

/** 커서 값 22 = 랜덤 버튼 */
export const RANDOM = 22;
export const CHARA_COUNT = 22;

export type BtnAnim = 'normal' | 'on' | 'off' | 'cursor' | 'press' | 'pressed' | 'disable' | 'miss';
export type LayoutAnim = 'in' | 'normal' | 'out';

export type CharSelectEvent =
  /** 버튼 페인 애니(chara = 표 번호 0..21, 22 랜덤). next 는 끝난 뒤 이어지는 애니(원본 vt+0x1b8 EnqueuePlay) */
  | { type: 'btn'; chara: number; anim: BtnAnim; next?: BtnAnim }
  /** 버튼 위 커서 표시(player = 칸 번호, −1 = 없음, com = CPU 글자) */
  | { type: 'mark'; chara: number; player: number; com: boolean }
  /** 카드 슬롯의 캐릭터 바꾸기(chara 22·잠김 = 이름 숨김·모델 없음) */
  | { type: 'card'; slot: number; chara: number; shown: boolean }
  /** 카드 모션 */
  | { type: 'motion'; slot: number; clip: string; next?: string }
  | { type: 'se'; label: string; chara?: number }
  | { type: 'voice'; slot: number; chara: number }
  | { type: 'voiceStop'; slot: number }
  | { type: 'vib'; player: number; name: string }
  /** 레이아웃 애니: grid = 격자(sys_base_charasel_01), cards = 카드(sys_base_charasel_00), ok = OK 버튼 */
  | { type: 'layout'; target: 'grid' | 'cards' | 'ok' | 'guide'; anim: string; next?: string }
  | { type: 'visible'; target: 'grid' | 'ok' | 'guide' | 'all'; visible: boolean }
  /** 카드 배치(사람 수) */
  | { type: 'cards'; count: number; slots: { slot: number; player: number }[] }
  | { type: 'decided'; result: number[] }
  | { type: 'cancel' }
  | { type: 'finished'; decided: boolean };

export interface PlayerSetup {
  /** 0 사람, 1 COM (원본 PlayerWork::GetPlayerType ≠ 0 → 1) */
  type: 0 | 1;
  /** 이전 캐릭터(PlayerWork::GetCharacterID). 없으면 칸 번호 [추정] */
  initial?: number;
}

export interface CharSelectConfig {
  /** 표 번호 → BtnNo (selectCharacterList.json) */
  btnNo: number[];
  /** 잠금 해제: 폴린(표 12) = GameFlag 1, 닌군(표 21) = GameFlag 0 */
  unlocked: { pauline: boolean; ninji: boolean };
  /** 사용 불가 목록(SetEnableCharacterBtn false) */
  disabled?: number[];
  players: PlayerSetup[];
  /** 조작 플레이어 칸(원본 GetOperationPlayerId). 기본 0 */
  operator?: number;
  /** 0..n−1 정수(원본 bex::RandModule::SyncRandMod) */
  rand: (n: number) => number;
  /** 애니 길이(프레임) — 명세 데이터. 기본값은 원본 bflan frameSize */
  animLen?: Partial<AnimLen>;
}

export interface AnimLen {
  layoutIn: number;
  layoutOut: number;
  okPress: number;
  btn: Record<BtnAnim, number>;
}

export const DEFAULT_ANIM_LEN: AnimLen = {
  layoutIn: 5,
  layoutOut: 5,
  okPress: 19,
  btn: { normal: 0, on: 9, off: 0, cursor: 0, press: 19, pressed: 0, disable: 0, miss: 20 },
};

export interface PlayerState {
  /** 원본 +0x38 플레이어 ID = 칸 번호 = 입력 패드 */
  pid: number;
  /** +0x3c */
  type: 0 | 1;
  /** +0x40 표 번호 0..21, 22 랜덤 */
  cursor: number;
  /** +0x44 카드 슬롯(사람 순번), COM −1 */
  slot: number;
  /** +0x48 */
  onGrid: boolean;
  /** +0x49 */
  decided: boolean;
}

/** 상태 +0x108: 0 in 대기, 1 선택, 2 OK 확인, 3 OK press 대기, 4 out 대기, 5 끝 */
export type Phase = 0 | 1 | 2 | 3 | 4 | 5;

export interface PadFrame {
  trig: number;
  rep: number;
}

interface BtnPlay {
  anim: BtnAnim;
  left: number;
  next?: BtnAnim;
}

export class CharSelectState {
  phase: Phase = 5;
  readonly players: PlayerState[];
  readonly result: number[];
  /** +0xfc */
  cancelled = false;
  /** +0xfd IsDecided */
  decided = false;
  operator: number;
  readonly humans: number;
  frame = 0;
  private readonly cfg: CharSelectConfig;
  private readonly len: AnimLen;
  private readonly disabled: Set<number>;
  private readonly btnPlay = new Map<number, BtnPlay>();
  private layoutLeft = 0;
  private okLeft = 0;
  private out: CharSelectEvent[] = [];

  constructor(cfg: CharSelectConfig) {
    this.cfg = cfg;
    this.len = { ...DEFAULT_ANIM_LEN, ...cfg.animLen, btn: { ...DEFAULT_ANIM_LEN.btn, ...(cfg.animLen?.btn ?? {}) } };
    this.disabled = new Set(cfg.disabled ?? []);
    const n = cfg.players.length;
    this.players = cfg.players.map((p, i) => ({ pid: i, type: p.type, cursor: -1, slot: -1, onGrid: false, decided: false }));
    this.result = new Array(n).fill(-1);
    this.operator = cfg.operator ?? 0;
    this.humans = this.players.filter((p) => p.type === 0).length;
  }

  /** 표 번호 ↔ BtnNo (FUN_710033c0f0 / FUN_7100339b30) */
  btnOf(c: number): number {
    return c === RANDOM ? RANDOM : this.cfg.btnNo[c];
  }

  charaOf(b: number): number {
    if (b === RANDOM) return RANDOM;
    const i = this.cfg.btnNo.indexOf(b);
    return i;
  }

  locked(c: number): boolean {
    if (c === 12) return !this.cfg.unlocked.pauline;
    if (c === 21) return !this.cfg.unlocked.ninji;
    return false;
  }

  isDisabled(c: number): boolean {
    return this.disabled.has(c);
  }

  /** 점유: 커서가 c 이고 (사람 또는 onGrid) — 자기 자신 포함 [판독] */
  occ(c: number): boolean {
    return this.players.some((p) => p.cursor === c && (p.type === 0 || p.onGrid));
  }

  private emit(e: CharSelectEvent): void {
    this.out.push(e);
  }

  private playBtn(c: number, anim: BtnAnim, next?: BtnAnim): void {
    this.btnPlay.set(c, { anim, left: this.len.btn[anim], next });
    this.emit(next ? { type: 'btn', chara: c, anim, next } : { type: 'btn', chara: c, anim });
  }

  /** 버튼 페인 애니가 끝났는가(원본 GetPlaybackState == 3) */
  btnDone(c: number): boolean {
    const b = this.btnPlay.get(c);
    return !b || (b.left <= 0 && !b.next);
  }

  btnAnim(c: number): BtnAnim {
    return this.btnPlay.get(c)?.anim ?? 'normal';
  }

  /** In(skipIn) @0x710033d680 — 사건 목록을 돌려준다 */
  start(skipIn = false): CharSelectEvent[] {
    this.out = [];
    this.emit({ type: 'visible', target: 'all', visible: true });
    this.emit({ type: 'layout', target: 'grid', anim: skipIn ? 'normal' : 'in' });
    this.layoutLeft = skipIn ? 0 : this.len.layoutIn;
    this.phase = skipIn ? 1 : 0;
    this.emit({ type: 'layout', target: 'guide', anim: 'in', next: 'normal' });
    this.cancelled = false;
    this.decided = false;
    for (const c of this.disabled) {
      this.playBtn(c, 'disable');
      this.emit({ type: 'mark', chara: c, player: -1, com: false });
    }
    // 커서 초기값 FUN_710033e620: 이전 캐릭터가 앞 플레이어 커서와 겹치거나 사용 불가면 0..21 의 첫 빈 칸
    this.players.forEach((p, i) => {
      p.decided = false;
      p.slot = -1;
      p.onGrid = false;
      p.cursor = -1;
      const want = this.cfg.players[i].initial ?? i;
      const taken = (c: number): boolean => this.players.some((q, j) => j < i && q.cursor === c);
      let c = want;
      if (taken(c) || this.isDisabled(c)) {
        c = want;
        for (let k = 0; k < CHARA_COUNT; k++) {
          if (!taken(k) && !this.isDisabled(k)) {
            c = k;
            break;
          }
        }
      }
      p.cursor = c;
      this.result[i] = c;
    });
    for (let c = 0; c <= RANDOM; c++) if (!this.isDisabled(c)) this.playBtn(c, 'normal');
    // 모드 0: 사람에게 슬롯 번호, 사람 커서가 사용 불가면 첫 빈 칸(없으면 랜덤)
    let slot = 0;
    for (const p of this.players) {
      if (p.type !== 0) continue;
      p.slot = slot++;
      if (this.isDisabled(p.cursor)) {
        let c = RANDOM;
        for (let k = 0; k < CHARA_COUNT; k++) {
          if (!this.occ(k) && !this.isDisabled(k)) {
            c = k;
            break;
          }
        }
        p.cursor = c;
      }
    }
    this.emit({ type: 'cards', count: this.humans, slots: this.players.filter((p) => p.type === 0).map((p) => ({ slot: p.slot, player: p.pid })) });
    this.emit({ type: 'layout', target: 'cards', anim: 'in', next: 'normal' });
    for (const p of this.players) {
      if (p.type !== 0) continue;
      p.onGrid = true;
      this.place(p, p.cursor);
    }
    if (this.humans === 1) this.operator = this.players.find((p) => p.type === 0)!.pid;
    return this.out;
  }

  /** 커서 놓기 FUN_710033c3f0 (5.3) */
  private place(p: PlayerState, c: number): void {
    const old = p.cursor;
    p.cursor = c;
    if (old >= 0 && old !== c) {
      if (this.isDisabled(old)) this.playBtn(old, 'disable');
      else this.playBtn(old, 'off', 'normal');
      this.emit({ type: 'mark', chara: old, player: -1, com: false });
    }
    if (this.isDisabled(c)) this.playBtn(c, 'disable');
    else this.playBtn(c, 'on', 'cursor');
    this.emit({ type: 'mark', chara: c, player: p.pid, com: p.type !== 0 });
    if (p.slot >= 0) this.emit({ type: 'card', slot: p.slot, chara: c, shown: c !== RANDOM && !this.locked(c) });
  }

  /** 랜덤 선택 FUN_710033c650 */
  private randomPick(): number {
    const pool: number[] = [];
    for (let c = 0; c < CHARA_COUNT; c++) {
      if (this.occ(c) || this.isDisabled(c)) continue;
      if (this.locked(c)) continue;
      pool.push(c);
    }
    return pool[this.cfg.rand(pool.length)];
  }

  /** COM 선택 FUN_710033d270: 위 조건 + 이미 result 에 있는 캐릭터 제외 */
  private comPick(): number {
    const pool: number[] = [];
    for (let c = 0; c < CHARA_COUNT; c++) {
      if (this.occ(c) || this.isDisabled(c) || this.locked(c)) continue;
      if (this.result.includes(c)) continue;
      pool.push(c);
    }
    return pool[this.cfg.rand(pool.length)];
  }

  private anyUndecidedHuman(): boolean {
    return this.players.some((p) => p.type === 0 && !p.decided);
  }

  /** 한 프레임. pads[i] = 칸 i 의 입력 */
  step(pads: readonly (PadFrame | undefined)[]): CharSelectEvent[] {
    this.out = [];
    this.frame++;
    this.tickAnims();
    switch (this.phase) {
      case 0:
        if (this.layoutLeft <= 0) {
          this.emit({ type: 'layout', target: 'grid', anim: 'normal' });
          this.phase = 1;
        }
        break;
      case 1:
        this.select(pads);
        break;
      case 2:
        this.confirm(pads);
        break;
      case 3:
        if (this.okLeft <= 0) {
          this.decided = true;
          this.doOut();
        }
        break;
      case 4:
        if (this.layoutLeft <= 0) {
          this.phase = 5;
          this.emit({ type: 'visible', target: 'all', visible: false });
          this.emit({ type: 'finished', decided: this.decided });
        }
        break;
    }
    return this.out;
  }

  private tickAnims(): void {
    if (this.layoutLeft > 0) this.layoutLeft--;
    if (this.okLeft > 0) this.okLeft--;
    for (const b of this.btnPlay.values()) {
      if (b.left > 0) b.left--;
      else if (b.next) {
        b.anim = b.next;
        b.left = this.len.btn[b.next];
        b.next = undefined;
      }
    }
  }

  private pad(p: PlayerState, pads: readonly (PadFrame | undefined)[]): PadFrame {
    return pads[p.pid] ?? { trig: 0, rep: 0 };
  }

  /** 5.1 이동 — 새 BtnNo 를 돌려준다 */
  private move(cur0: number, trig: number, rep: number): number {
    const occB = (b: number): boolean => this.occ(this.charaOf(b));
    const disB = (b: number): boolean => this.isDisabled(this.charaOf(b));
    let target = cur0;
    if (cur0 !== RANDOM) {
      let t = -1;
      if (trig & PAD.UP) {
        if (cur0 > 10) t = (cur0 + 11) % 22;
      } else if (trig & PAD.DOWN) {
        if (cur0 < 11) t = (cur0 + 11) % 22;
      }
      if (t >= 0 && !occB(t) && !disB(t)) target = t;
    }
    const cur = target;
    if (trig & (PAD.LEFT | PAD.RIGHT)) {
      const right = (trig & PAD.RIGHT) !== 0;
      const d = right ? 1 : -1;
      let entry = right ? 0 : 10;
      if (trig & PAD.DOWN) entry = right ? 11 : 21;
      let c = cur;
      for (let guard = 0; guard < 64; guard++) {
        const atEdge = right ? c === 10 || c === 21 : c === 0 || c === 11;
        if (atEdge && !occB(RANDOM)) return RANDOM;
        const n = c === RANDOM ? entry : (c + d + 22) % 22;
        if (occB(n) || disB(n)) {
          c = n;
          continue;
        }
        return n;
      }
      return cur;
    }
    if (rep & PAD.RIGHT) {
      if (cur === RANDOM || cur === 10 || cur === 21) return cur;
      const end = cur < 11 ? 10 : 21;
      for (let n = cur; n <= end; n++) if (!occB(n) && !disB(n)) return n;
      return cur;
    }
    if (rep & PAD.LEFT) {
      if (cur === RANDOM) return cur;
      const start = cur > 10 ? 11 : 0;
      for (let n = cur; n >= start; n--) if (!occB(n) && !disB(n)) return n;
      return occB(RANDOM) ? cur : RANDOM;
    }
    return cur;
  }

  /** 상태 1 FUN_710033a1e0 */
  private select(pads: readonly (PadFrame | undefined)[]): void {
    for (const p of this.players) {
      if (p.type !== 0) continue;
      const { trig, rep } = this.pad(p, pads);
      if (this.anyUndecidedHuman() && !p.decided) {
        const nb = this.move(this.btnOf(p.cursor), trig, rep);
        const nc = this.charaOf(nb);
        if (nc !== p.cursor) {
          p.decided = false;
          this.place(p, nc);
          this.emit({ type: 'se', label: 'SQ_SE_SYS_CURSOR', chara: nc });
          this.emit({ type: 'vib', player: p.pid, name: 'bv_vib_sys_cursor' });
        }
      }
      if (!p.decided) {
        if (trig & PAD.A) {
          const c = p.cursor;
          if (this.locked(c) || this.isDisabled(c)) {
            this.playBtn(c, 'miss');
            this.emit({ type: 'se', label: 'SQ_SE_SYS_ERROR' });
            this.emit({ type: 'vib', player: p.pid, name: 'bv_vib_sys_error' });
          } else {
            const random = c === RANDOM;
            if (random) this.place(p, this.randomPick());
            p.decided = true;
            this.playBtn(p.cursor, 'press', 'pressed');
            if (p.slot >= 0) {
              this.emit({ type: 'motion', slot: p.slot, clip: 'co_chr_slct00a', next: 'co_chr_slct00b' });
              this.emit({ type: 'voice', slot: p.slot, chara: p.cursor });
            }
            this.emit({ type: 'se', label: 'SQ_SE_SYS_DECI' });
            this.emit({ type: 'vib', player: p.pid, name: 'bv_vib_sys_deci' });
          }
        }
        if (trig & PAD.B && p.pid === this.operator && !this.cancelled) {
          this.cancelled = true;
          this.emit({ type: 'se', label: 'SQ_SE_SYS_CANCEL' });
          this.emit({ type: 'cancel' });
          this.doOut();
          return;
        }
      } else if (trig & PAD.B) {
        this.undecide(p);
        this.emit({ type: 'se', label: 'SQ_SE_SYS_CANCEL' });
      }
    }
    if (this.anyUndecidedHuman()) return;
    if (!this.players.every((p) => p.cursor < 0 || this.btnDone(p.cursor))) return;
    this.emit({ type: 'visible', target: 'ok', visible: true });
    this.emit({ type: 'layout', target: 'ok', anim: 'in', next: 'normal' });
    this.emit({ type: 'visible', target: 'grid', visible: false });
    for (let c = 0; c <= RANDOM; c++) {
      if (this.occ(c) || this.isDisabled(c)) continue;
      this.playBtn(c, 'disable');
      this.emit({ type: 'mark', chara: c, player: -1, com: false });
    }
    this.phase = 2;
  }

  private undecide(p: PlayerState): void {
    p.decided = false;
    if (this.isDisabled(p.cursor)) this.playBtn(p.cursor, 'disable');
    else this.playBtn(p.cursor, 'on', 'cursor');
    if (p.slot >= 0) {
      this.emit({ type: 'motion', slot: p.slot, clip: p.cursor === 6 || p.cursor === 11 ? 'co_chr_idle00' : 'co_idle00' });
      this.emit({ type: 'voiceStop', slot: p.slot });
    }
  }

  /** 상태 2 FUN_710033b540 */
  private confirm(pads: readonly (PadFrame | undefined)[]): void {
    for (const p of this.players) {
      if (p.type !== 0) continue;
      if (this.pad(p, pads).trig & PAD.B) this.undecide(p);
    }
    if (this.anyUndecidedHuman()) {
      this.emit({ type: 'layout', target: 'ok', anim: 'back' });
      this.emit({ type: 'visible', target: 'grid', visible: true });
      for (let c = 0; c <= RANDOM; c++) {
        if (this.occ(c) || this.isDisabled(c)) continue;
        this.playBtn(c, 'off', 'normal');
      }
      this.emit({ type: 'se', label: 'SQ_SE_SYS_CANCEL' });
      this.phase = 1;
      return;
    }
    const op = pads[this.operator];
    if (!op || !(op.trig & PAD.A)) return;
    this.emit({ type: 'layout', target: 'ok', anim: 'press' });
    this.okLeft = this.len.okPress;
    this.emit({ type: 'se', label: 'SQ_SE_SYS_DECI_L' });
    this.emit({ type: 'vib', player: this.operator, name: 'bv_vib_sys_deci_l' });
    this.players.forEach((p, i) => {
      if (p.type === 0 || p.onGrid) this.result[i] = p.cursor;
    });
    this.players.forEach((p, i) => {
      if (p.type === 1 && !p.onGrid) this.result[i] = -1;
    });
    this.players.forEach((p, i) => {
      if (p.type === 1 && !p.onGrid) this.result[i] = this.comPick();
    });
    this.emit({ type: 'decided', result: [...this.result] });
    this.phase = 3;
  }

  /** Out(false) @0x710033e9f0 */
  private doOut(): void {
    this.emit({ type: 'layout', target: 'grid', anim: 'out' });
    this.emit({ type: 'layout', target: 'cards', anim: 'out' });
    this.emit({ type: 'visible', target: 'ok', visible: false });
    this.emit({ type: 'layout', target: 'guide', anim: 'out' });
    for (const p of this.players) if (p.slot >= 0) this.emit({ type: 'voiceStop', slot: p.slot });
    this.layoutLeft = this.len.layoutOut;
    this.phase = 4;
  }
}

/** 누름 비트에서 키 반복 비트를 만든다(원본 bex 반복 간격 [미확정] → 첫 반복 24f, 이후 6f [근사]) */
export class RepeatGen {
  private held = new Map<number, number>();
  constructor(
    private readonly first = 24,
    private readonly every = 6,
  ) {}

  /** hold = 지금 눌린 비트, trig = 이번 프레임 새로 눌린 비트 → rep 비트 */
  next(hold: number, trig: number): number {
    let rep = 0;
    for (const bit of [0x100, 0x200, 0x400, 0x800, 0x10000, 0x20000, 0x40000, 0x80000]) {
      if (!(hold & bit)) {
        this.held.delete(bit);
        continue;
      }
      const n = (this.held.get(bit) ?? 0) + 1;
      this.held.set(bit, n);
      if (trig & bit || (n > this.first && (n - 1 - this.first) % this.every === 0)) rep |= bit;
    }
    return rep;
  }
}
