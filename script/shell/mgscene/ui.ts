/**
 * 미니게임 공용 틀 2D UI 모델(순수 로직) — 와이프·텔롭(ComUiMGTelop)·종료 타이머(ComUiTimer)·상태 얼굴(ComUiStatus)·스킵 안내(ComUiGuideSkip)·MGUiMgr.
 * 화면은 UiLayer 상태(레이아웃·애니 태그·프레임·글자·페인 표시·재질 ty·얼굴)를 그대로 그린다(view/mgsceneUi.ts).
 * 판독 근거: docs/shell/minigame_scene.md §12.1. 애니 진행 규칙: 매 UI 틱에 컴포넌트 판정(끝 검사·다음 애니 시작)을 먼저 하고 그 뒤
 * 모든 애니를 speed 만큼 진행한다 — 어디서 시작했든(흐름 처리기·틱 판정) 길이 N 의 애니는 시작 틱부터 N 틱 진행한 뒤의 틱에서 끝으로 본다
 * (엔진 애니 슬롯 갱신과 컴포넌트 틱의 순서 미판독, §12.11).
 */
import type { MgSceneEvent, UiAnimTable, UiPaneBox } from './types';

const F = Math.fround;

export class UiLayer {
  visible = false;
  anim: string | null = null;
  frame = 0;
  speed = 1;
  /** 애니를 거는 부품 경로(null = 레이아웃 전체) */
  animTarget: string | null = null;
  private next: string | null = null;
  readonly texts = new Map<string, string>();
  readonly paneVisible = new Map<string, boolean>();
  /** 재질 이름 → 텍스처 SRT 이동 y(ComUiTimer 숫자) */
  readonly matTy = new Map<string, number>();
  /** 부품 경로(얼굴 페인을 품은 부품) → 'pcNN' */
  readonly faces = new Map<string, string>();
  pos = { x: 0, y: 0 };

  constructor(
    readonly id: string,
    public layout: string,
    private readonly anims: UiAnimTable,
    readonly order: number,
  ) {}

  len(tag: string): { frames: number; loop: boolean } {
    const a = this.anims[this.animLayout()]?.[tag];
    if (!a) throw new Error(`mgscene: 애니 없음 ${this.animLayout()}_${tag}`);
    return a;
  }

  /** 애니가 걸리는 레이아웃 이름(부품이면 그 부품 레이아웃) */
  animLayout(): string {
    return this.animTarget ? (this.partLayouts.get(this.animTarget) ?? this.layout) : this.layout;
  }

  /** 부품 경로 → 부품 레이아웃(animTarget 용) */
  readonly partLayouts = new Map<string, string>();

  has(tag: string): boolean {
    return !!this.anims[this.animLayout()]?.[tag];
  }

  play(tag: string, speed = 1): void {
    this.len(tag);
    this.anim = tag;
    this.frame = 0;
    this.speed = speed;
    this.next = null;
  }

  /** 원본 SetNextAnimation / EnqueuePlayAnimation */
  enqueue(tag: string): void {
    this.next = tag;
  }

  get ended(): boolean {
    if (!this.anim) return true;
    const a = this.len(this.anim);
    return !a.loop && this.frame >= a.frames;
  }

  tick(): void {
    if (!this.anim) return;
    const a = this.len(this.anim);
    this.frame += this.speed;
    if (a.loop) this.frame = a.frames > 0 ? this.frame % a.frames : 0;
    else if (this.frame > a.frames) this.frame = a.frames;
    if (this.next && this.ended) {
      const n = this.next;
      this.next = null;
      this.anim = n;
      this.frame = 0;
      this.speed = 1;
    }
  }

  setText(pane: string, s: string): void {
    this.texts.set(pane, s);
  }
}

// ---------------------------------------------------------------- 와이프(WipeModule / MgWipeModule)

export const WIPE_TYPES = ['Black', 'White', 'CrossFade', 'Loading'] as const;

/** 0 없음, 1 out 재생, 2 덮음(normal), 3 in 재생 */
export class MgWipe {
  readonly layer: UiLayer;
  state = 2;
  type = 0;

  constructor(
    anims: UiAnimTable,
    /** flag 0 이면 MgWipeModule 이 SystemCallBack 으로 넘겨 와이프를 그리지 않는다 [판독] → 바로 끝난 것으로 [추정] */
    private readonly inst: boolean,
  ) {
    this.layer = new UiLayer('wipe', 'wipe', anims, 0x9000);
    if (!inst) {
      this.layer.visible = true;
      this.layer.play(`Wipe${WIPE_TYPES[this.type]}_normal`);
    } else this.state = 0;
  }

  fadeOut(speed = 1): void {
    if (this.inst) {
      this.state = 2;
      return;
    }
    const t = WIPE_TYPES[this.type];
    this.layer.visible = true;
    this.layer.play(`Wipe${t}_out`, speed);
    this.layer.enqueue(`Wipe${t}_normal`);
    this.state = 1;
  }

  fadeIn(speed = 1): void {
    if (this.inst) {
      this.state = 0;
      return;
    }
    this.layer.visible = true;
    this.layer.play(`Wipe${WIPE_TYPES[this.type]}_in`, speed);
    this.state = 3;
  }

  /** MgWipeModule::IsPlayingFadeAnim */
  playing(): boolean {
    return this.state === 1 || this.state === 3;
  }

  /** MgWipeModule::IsFinishedFadeOut */
  covered(): boolean {
    return this.state === 2;
  }

  tick(): void {
    if (this.state === 0) return;
    if (this.state === 1 && this.layer.anim?.endsWith('_normal')) this.state = 2;
    else if (this.state === 3 && this.layer.ended) {
      this.state = 0;
      this.layer.visible = false;
      this.layer.anim = null;
      return;
    }
    this.layer.tick();
  }
}

// ---------------------------------------------------------------- 텔롭(ComUiMGTelop)

export const TELOP_LAYOUT = [
  'sys_tlp_start_00',
  'sys_tlp_321go_00',
  'sys_tlp_finish_00',
  'sys_tlp_round_00',
  'sys_tlp_round_01',
  'sys_tlp_win_center_00',
  'sys_tlp_win_top_00',
  'sys_tlp_win_00',
  'sys_tlp_draw_00',
  'sys_tlp_final_attack',
];
const TELOP_FIRST = ['in', 'count', 'in', 'inout', 'inout', 'in', 'in', 'in', 'in', 'in'];
/** SetOneshot 값(FUN_71002e2e90) — f32 0x3ED55555 / 0x3FB55555 */
export const ONESHOT_START = F(0.41666666);
export const ONESHOT_FINISH = F(1.4166666);

export interface TelopDeps {
  anims: UiAnimTable;
  texts: Record<string, string>;
  inst: boolean;
  emit(e: MgSceneEvent): void;
  /** MGSound::TryStartResultSound(1, type) */
  resultSound(type: number): void;
}

/** 상태 +0x3c: 0 대기, 1 첫 애니, 2 normal, 3 out, 4 끝 */
export class MgTelop {
  readonly layer: UiLayer;
  state = 0;
  oneshot: number | null = null;
  timer = 0;
  /** +0x5c 321go 카운터 */
  counter = 0;

  constructor(
    readonly type: number,
    private readonly deps: TelopDeps,
    /** 승리 텔롭 플레이어(PlayerList) */
    private readonly players: readonly { pid: number; chara: string }[] = [],
    order = 0x8800,
  ) {
    let layout = type >= 0 ? TELOP_LAYOUT[type] : 'sys_tlp_start_00';
    if (players.length > 2) {
      if (type === 6) layout = 'sys_tlp_win_top_01';
      else if (type === 7) layout = 'sys_tlp_win_01';
    }
    this.layer = new UiLayer(`telop${type}`, layout, deps.anims, order);
  }

  setOneshot(sec: number): void {
    this.oneshot = F(sec);
  }

  private name(chara: string): string {
    return this.deps.texts[`im_${chara}_name`] ?? chara;
  }

  private trigger(tag: string, n = 0): void {
    const L = this.layer.layout;
    const e = this.deps.emit;
    if (L === 'sys_tlp_start_00' && tag === 'in') {
      e({ k: 'se', label: 'SQ_SE_TLP_START' });
      e({ k: 'voice', label: 'WD_VOI_LOC_SYS_START' });
    } else if (L === 'sys_tlp_finish_00' && tag === 'in') {
      e({ k: 'se', label: 'SQ_SE_TLP_FINISH' });
      e({ k: 'voice', label: 'WD_VOI_LOC_SYS_FINISH' });
    } else if (L === 'sys_tlp_draw_00' && tag === 'in') e({ k: 'voice', label: 'WD_VOI_LOC_SYS_DRAW' });
    else if (L === 'sys_tlp_321go_00' && tag === 'count') {
      e({ k: 'se', label: `SQ_SE_TLP_321GO_${n}` });
      e({ k: 'voice', label: `WD_VOI_LOC_SYS_${n}` });
    } else if (L === 'sys_tlp_321go_00' && tag === 'go') {
      e({ k: 'se', label: 'SQ_SE_TLP_321GO_GO' });
      e({ k: 'voice', label: 'WD_VOI_LOC_SYS_GO' });
    }
  }

  private playTag(tag: string, n = 0): void {
    this.layer.play(tag);
    this.trigger(tag, n);
  }

  /** ComUiMGTelop::Start */
  start(): void {
    const t = this.type;
    if (t === -1) return;
    if (this.deps.inst && t < 2) {
      this.state = 4;
      return;
    }
    const L = this.layer;
    const tx = this.deps.texts;
    if (t === 0) L.setText('x_tlp_start', tx.mg_tl101 ?? 'START');
    else if (t === 1) {
      this.counter = 0;
      L.setText('x_text_00', '3');
    } else if (t === 2) {
      L.setText('x_tlp_finish', tx.mg_tl301 ?? 'FINISH');
      this.deps.emit({ k: 'se', label: 'SQ_SE_MG_FINISH' });
    } else if (t >= 5 && t <= 7) {
      for (let i = 0; i < 4; i++) {
        L.paneVisible.set(`x_text_name_0${i}`, false);
        L.paneVisible.set(`x_text_name_0${i}_shadow`, false);
      }
      const ps = this.players.length < 2 ? this.players : [...this.players].sort((a, b) => a.pid - b.pid);
      ps.forEach((p, i) => {
        const nm = this.name(p.chara);
        L.setText(`x_text_name_0${i}`, nm);
        L.setText(`x_text_name_0${i}_shadow`, nm);
        L.paneVisible.set(`x_text_name_0${i}`, true);
        L.paneVisible.set(`x_text_name_0${i}_shadow`, true);
      });
      if (ps.length === 3) L.paneVisible.set('x_text_name_03', false);
      L.setText('x_text_win', ps.length < 2 ? (tx.mg_tl302_wins ?? 'WINS') : (tx.mg_tl302_win ?? 'WIN'));
      this.deps.emit({ k: 'voice', label: ps.length < 2 ? 'WD_VOI_LOC_SYS_WINNER' : 'WD_VOI_LOC_SYS_WINNERS' });
      this.deps.resultSound(5);
    } else if (t === 8) {
      L.setText('x_text_draw', tx.mg_tl303 ?? 'DRAW');
      this.deps.resultSound(8);
    }
    L.visible = true;
    this.playTag(TELOP_FIRST[t], 3);
    this.state = 1;
  }

  /** ComUiMGTelop::Out — oneshot 이 아니고 normal 일 때만 */
  out(): void {
    if (this.oneshot !== null || this.state !== 2) return;
    this.layer.play('out');
    this.state = 3;
  }

  forceOut(): void {
    this.layer.visible = false;
    this.state = 4;
  }

  finished(): boolean {
    return this.state !== 1 && this.state !== 2 && this.state !== 3;
  }

  isEndCountdown(): boolean {
    if (this.type !== 1) return true;
    if (this.state === 0) return false;
    if (this.state === 1) return this.counter > 2;
    return true;
  }

  private hide(): void {
    this.layer.visible = false;
    this.state = 4;
  }

  /** FUN_7100211bc0 — "count" 가 끝날 때마다 */
  private countdown(): void {
    const L = this.layer;
    switch (this.counter) {
      case 0:
        L.setText('x_text_00', '2');
        this.playTag('count', 2);
        break;
      case 1:
        L.setText('x_text_00', '1');
        this.playTag('count', 1);
        break;
      case 2:
        L.setText('x_text_01', this.deps.texts.mg_tl102_go ?? 'GO!');
        this.playTag('go');
        break;
      case 3:
        this.hide();
        break;
    }
    this.counter++;
  }

  /** 컴포넌트 틱(0x5f454e00): 상태 1 FUN_7100211768, 2 FUN_7100211acc, 3 FUN_7100211a04 */
  tick(dt: number): void {
    if (this.state === 0 || this.state === 4) return;
    this.logic(dt);
    if (this.state !== 4) this.layer.tick();
  }

  private logic(dt: number): void {
    if (this.state === 1) {
      if (!this.layer.ended) return;
      if (this.oneshot !== null && this.layer.anim === 'inout') {
        this.hide();
        return;
      }
      if (this.type === 1) {
        this.countdown();
        return;
      }
      this.layer.play('normal');
      this.state = 2;
    } else if (this.state === 2) {
      if (this.oneshot === null) return;
      this.timer = F(this.timer + dt);
      if (this.oneshot <= this.timer) {
        this.timer = 0;
        if (this.type === 0 || this.type === 2 || this.type === 8 || this.type === 9) {
          this.layer.play('out');
          this.state = 3;
        } else this.hide();
      }
    } else if (this.state === 3) {
      if (this.layer.ended) this.hide();
    }
  }
}

// ---------------------------------------------------------------- LytPlace(ComUiBase::SetPlace)

/** 표 0x15d76a4: (가로 0 왼·1 가운데·2 오른, 세로 3 위·1 가운데·4 아래) */
const PLACE: readonly [number, number][] = [
  [0, 3],
  [1, 3],
  [2, 3],
  [0, 1],
  [1, 1],
  [2, 1],
  [0, 4],
  [1, 4],
  [2, 4],
];

export function placePos(place: number, bd: UiPaneBox | undefined): { x: number; y: number } {
  if (!bd || place < 0 || place > 8) return { x: 0, y: 0 };
  const [h, v] = PLACE[place];
  let x = 0;
  let y = 0;
  if (h === 2) x = F(F(1920 - bd.size[0]) * 0.5 - bd.t[0]);
  else if (h === 0) x = F(F(-(1920 - bd.size[0])) * 0.5 - bd.t[0]);
  if (v === 4) y = F(F(-(1080 - bd.size[1])) * 0.5 - bd.t[1]);
  else if (v === 3) y = F(F(1080 - bd.size[1]) * 0.5 - bd.t[1]);
  return { x, y };
}

// ---------------------------------------------------------------- 종료 타이머(ComUiTimer)

const TIMER_DIGITS: readonly [string, number][] = [
  ['x_num_1_0', 1],
  ['x_num_2_0', 2],
  ['x_num_2_1', 2],
  ['x_num_3_0', 3],
  ['x_num_3_1', 3],
  ['x_num_3_2', 3],
];

export class MgUiTimer {
  readonly layer: UiLayer;
  /** +0x40: 0 대기, 1 동작, 2 일시정지, 3 끝 */
  state = 0;
  remain = 0;
  /** +0x3c: 0 숨김, 1 in, 2 normal, 3 out */
  disp = 0;
  /** +0x48 경고 초, +0x4c 경고 켬, +0x4d 0 에 닿음 */
  alert = F(5);
  alertOn = true;
  reachedZero = false;
  private shown = -1;

  constructor(
    anims: UiAnimTable,
    private readonly bd: UiPaneBox | undefined,
    private readonly emit: (e: MgSceneEvent) => void,
    order = 0x8900,
  ) {
    this.layer = new UiLayer('timer', 'sys_timer_00', anims, order);
    this.setPlace(1);
  }

  setPlace(place: number): void {
    this.layer.pos = placePos(place, this.bd);
  }

  /** FUN_71002d5030 — 표시 정수(trunc)가 바뀐 프레임만 갱신 */
  private display(v: number, force: boolean): void {
    if (v > 999) v = 999;
    if (v <= 0) v = 0;
    const n = Math.trunc(v);
    const digits = n > 99 ? 3 : n > 9 ? 2 : 1;
    if (!force && this.shown === n) return;
    this.shown = n;
    let k = n;
    for (const [pane, d] of TIMER_DIGITS) {
      const on = d === digits;
      this.layer.paneVisible.set(pane, on);
      if (on) {
        this.layer.matTy.set(pane, F((k % 10) * 0.1));
        k = Math.trunc(k / 10);
      }
    }
    if (!this.alertOn) return;
    const r = this.remain > 0 ? this.remain : 0;
    if (this.alert > 0 && r <= this.alert) {
      this.layer.play('countdown');
      if (this.layer.visible && this.disp === 2) this.emit({ k: 'se', label: 'SQ_SE_SYS_MG_COUNT_TIMER' });
      if (!(v > 0)) this.reachedZero = true;
      return;
    }
    if (this.layer.anim?.includes('countdown')) this.layer.play('normal');
  }

  get displayValue(): number {
    return this.shown;
  }

  /** StartTimer(sec) */
  startTimer(sec: number): void {
    let s = F(sec);
    if (s > 999) s = 999;
    if (s <= 0) s = 0;
    this.remain = s;
    this.display(s, true);
    if (this.state === 1 && !(this.remain > 0)) this.state = 3;
    else if (this.remain > 0) this.state = 1;
  }

  suspend(): void {
    if (this.state === 1) this.state = 2;
  }

  resume(): void {
    if (this.state === 0 || this.state === 3) return;
    this.state = 1;
  }

  /** IsEndTimer: 상태 0 또는 3 */
  isEnd(): boolean {
    return this.state === 0 || this.state === 3;
  }

  remainSecond(): number {
    return this.remain > 0 ? this.remain : 0;
  }

  in(immediate = false): void {
    this.layer.visible = true;
    if (immediate) {
      this.layer.play('normal');
      this.disp = 2;
    } else {
      this.layer.play('in');
      this.disp = 1;
    }
  }

  out(immediate = false): void {
    if (immediate) {
      this.layer.visible = false;
      this.disp = 0;
      return;
    }
    let tag = 'out';
    if (this.alertOn) tag = this.alert < this.remainSecond() ? 'out' : 'out_red';
    if (this.alertOn && this.reachedZero && !this.layer.ended) this.layer.enqueue(tag);
    else this.layer.play(tag);
    this.disp = 3;
  }

  tick(dt: number): void {
    if (this.state === 1) {
      let r = F(this.remain - dt);
      this.remain = r;
      if (r <= 0) {
        r = 0;
        this.remain = 0;
        this.state = 3;
      }
      this.display(r > 0 ? r : 0, false);
    }
    if (this.disp === 1 && this.layer.ended) {
      if (this.layer.anim === 'in') this.layer.play('normal');
      this.disp = 2;
    } else if (this.disp === 3 && (this.layer.anim === 'out' || this.layer.anim === 'out_red') && this.layer.ended) {
      this.layer.visible = false;
      this.disp = 0;
    }
    if (this.layer.visible) this.layer.tick();
  }
}

// ---------------------------------------------------------------- 상태 얼굴(ComUiStatus)

const POS4 = ['pos4_10', 'pos4_01', 'pos4_02', 'pos4_08', 'pos4_09', 'pos4_06', 'pos4_11', 'pos4_07', 'pos4_05', 'pos4_03', 'pos4_04'];
const POS22 = ['pos22_01', 'pos22_02', 'pos22_07', 'pos22_08', 'pos22_03', 'pos22_04', 'pos22_05', 'pos22_06'];

/** FUN_710030d4b8 — (match, place) → 레이아웃 */
export function statusLayout(match: number, place: number): string {
  let s: string;
  if (match === 0) s = place - 1 >= 0 && place - 1 < 11 ? POS4[place - 1] : 'pos4_00';
  else if (match === 1) s = place - 13 >= 0 && place - 13 < 8 ? POS22[place - 13] : 'pos22_00';
  else if (match === 2) s = place === 0x17 ? 'pos13_02' : place === 0x16 ? 'pos13_01' : 'pos13_00';
  else if (match === 3) s = place === 0x1a ? 'pos11_02' : place === 0x19 ? 'pos11_01' : 'pos11_00';
  else s = 'pos4_00';
  return `sys_mgstat_${s}`;
}

/** SetValue 종류별 최댓값 [판독 ComUiStatus::SetValue] */
function valueMax(type: number): number | null {
  if (type === 0) return 9999;
  if (type === 2 || type === 5) return 999;
  if (type === 4) return 99;
  if (type === 6 || type === 0xb) return 2;
  if (type === 7 || type === 0xc) return 3;
  if (type === 8 || type === 0xd) return 4;
  if (type === 9 || type === 0xe) return 5;
  if (type === 10 || type === 0xf) return 10;
  return null;
}

/** 얼굴만 보이는 칸(종류 0x10, 장면 상태 얼굴)에서 숨기는 페인 [근사: UiControlStatus 미판독, §12.7] */
const FACE_ONLY_HIDE = ['x_score', 'x_coin', 'x_lamp', 'x_name_with_score', 'x_name', 'x_promoter_icon', 'x_alignment_record'];

export class MgUiStatus {
  readonly layer: UiLayer;
  /** +0x44: −1 숨김, 0 in, 1 normal, 2 out */
  state = -1;
  readonly slots: { pid: number; part: string; value: number; rank: number }[] = [];

  constructor(
    readonly type: number,
    readonly match: number,
    readonly place: number,
    players: readonly { pid: number; chara: string }[],
    anims: UiAnimTable,
    inst: boolean,
    order = 0x8700,
  ) {
    this.layer = new UiLayer('status', statusLayout(match, place), anims, order);
    for (let i = 0; i < 4; i++) this.layer.paneVisible.set(`x_parts_0${i}`, false);
    players.forEach((p, i) => {
      const part = `x_parts_0${i}`;
      this.layer.paneVisible.set(part, true);
      this.layer.faces.set(`${part}/x_p_face_00`, p.chara);
      if (type === 0x10) for (const n of FACE_ONLY_HIDE) this.layer.paneVisible.set(`${part}/${n}`, false);
      this.slots.push({ pid: p.pid, part, value: 0, rank: -1 });
    });
    if (inst) this.layer.paneVisible.set('RootPane', false);
  }

  in(immediate = false): void {
    if (this.state === 0 || this.state === 1) return;
    this.layer.visible = true;
    if (immediate) {
      this.layer.play('normal');
      this.state = 1;
    } else {
      this.layer.play('in');
      this.state = 0;
    }
  }

  out(immediate = false): void {
    if (immediate) {
      this.state = -1;
      this.layer.visible = false;
      return;
    }
    this.state = 2;
    this.layer.play('out');
  }

  setValue(pid: number, v: number): void {
    const s = this.slots.find((x) => x.pid === pid);
    if (!s) return;
    const max = valueMax(this.type);
    if (max !== null) {
      if (v >= max) v = max;
      if (v < 1) v = 0;
    }
    s.value = v;
    this.layer.setText(`${s.part}/x_text_score`, String(v));
    this.layer.setText(`${s.part}/x_text_score_shadow`, String(v));
  }

  setRank(pid: number, rank: number): void {
    const s = this.slots.find((x) => x.pid === pid);
    if (!s) return;
    s.rank = rank;
    this.layer.setText(`${s.part}/x_text_rank_00`, rank >= 0 ? String(rank + 1) : '');
    this.layer.setText(`${s.part}/x_text_rank_00_shadow`, rank >= 0 ? String(rank + 1) : '');
  }

  tick(): void {
    if (this.state === -1) return;
    if (this.state === 0 && this.layer.ended) {
      this.layer.play('normal');
      this.state = 1;
    } else if (this.state === 2 && this.layer.ended) {
      this.layer.visible = false;
      this.state = -1;
      return;
    }
    this.layer.tick();
  }
}

// ---------------------------------------------------------------- 스킵 안내(ComUiGuideSkip)

export class MgSkipGuide {
  readonly layer: UiLayer;
  shown = false;

  constructor(anims: UiAnimTable, texts: Record<string, string>) {
    this.layer = new UiLayer('skipGuide', 'sys_guide_pos_00', anims, 0x8a00);
    this.layer.partLayouts.set('x_parts_09', 'sys_guide_00');
    this.layer.animTarget = 'x_parts_09';
    for (let i = 0; i < 18; i++) if (i !== 9) this.layer.paneVisible.set(`x_parts_${String(i).padStart(2, '0')}`, false);
    this.layer.setText('x_parts_09/x_text_right', texts.mg_ui501 ?? '');
    this.layer.setText('x_parts_09/x_text_right_shadow', texts.mg_ui501 ?? '');
  }

  /** FUN_71002e2690 — ComUiGuideBase::In(0) */
  show(): void {
    this.shown = true;
    this.layer.visible = true;
    this.layer.play('in');
    this.layer.enqueue('normal');
  }

  /** FUN_71002e40f0 — 엔티티 삭제(바로 사라짐) */
  close(): void {
    this.shown = false;
    this.layer.visible = false;
    this.layer.anim = null;
  }

  tick(): void {
    if (this.shown) this.layer.tick();
  }
}

// ---------------------------------------------------------------- MGUiMgr(In/Out 시점)

export interface MgUiEntry {
  inTiming: number;
  outTiming: number;
  in(immediate: boolean): void;
  out(immediate: boolean): void;
}

export class MgUiMgr {
  readonly entries: MgUiEntry[] = [];
  readonly timers: MgUiEntry[] = [];
  /** 시험용 기록: [종류, n] */
  readonly log: ['in' | 'out' | 'timersOut', number][] = [];

  entry(e: MgUiEntry): void {
    this.entries.push(e);
  }

  entryTimer(e: MgUiEntry): void {
    this.timers.push(e);
    this.entries.push(e);
  }

  /** FUN_71002d6cd0(n) */
  timingIn(n: number): void {
    this.log.push(['in', n]);
    for (const e of this.entries) if (e.inTiming === n) e.in(false);
  }

  /** MGUiMgr::TimingOut(n) — n == 2 면 즉시 끔 */
  timingOut(n: number): void {
    this.log.push(['out', n]);
    for (const e of this.entries) if (e.outTiming === n) e.out(n === 2);
  }

  /** FUN_71002d74e0 — 등록 타이머 전부 Out */
  timersOut(): void {
    this.log.push(['timersOut', 0]);
    for (const e of this.timers) e.out(false);
  }
}
