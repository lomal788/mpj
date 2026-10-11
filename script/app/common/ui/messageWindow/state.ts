/**
 * 메시지 창 상태기계(순수) — bq::ComUiMessageWindow 상태 +0x28·하위 +0x2c, 넘김 판정 FUN_7100318030·FUN_71003194c0 (docs/shell/message_window.md 3·5·6.2).
 * 입력: dt·플레이어별 누름 비트·COM 여부·현재 창 애니 끝 → 사건. 한 틱에 하위 단계 하나, 글자 진행은 상태 처리 뒤(9.4 [설계]).
 */
import type { RichText } from '../text';
import type { PageLayout } from './layout';
import { Typer } from './typer';

const f = Math.fround;
export const INPUT_LOCK = f(0.2);
export const COM_WAIT = f(0.6667);
export const NEXT_MASK = 0x1;
export const SE_PUT = 'SQ_SE_SYS_MES_PUT';
export const SE_PROC = 'SQ_SE_SYS_MES_PROC';
export const SE_CHOICE_CURSOR = 'SQ_SE_SYS_CURSOR';
export const SE_CHOICE_DECI = 'SQ_SE_SYS_DECI';
export const SE_CHOICE_CANCEL = 'SQ_SE_SYS_CANCEL';
export const VIB_CHOICE_DECI = 'bv_vib_sys_deci';
/** 선택지 위·아래 비트(FUN_71003197d0) */
export const CHOICE_UP = 0x20800;
export const CHOICE_DOWN = 0x80400;
/** 창 형식 Announce(5)·Subtitle(6) 은 더킹 안 함 */
const NO_DUCK = new Set([5, 6]);

export interface MsgPage {
  label: string;
}

/** 선택지 칸(+0x158 + i×0x98): 라벨·결정 SE(+0x1a0)·결정 진동(+0x1b8)·사용 불가(+0x1e8) */
export interface ChoiceItem {
  label: string;
  deciSe: string | null;
  deciVib: string | null;
  disabled: boolean;
}

export interface ResolvedPage {
  rt: RichText;
  layout: PageLayout;
  /** WindowInfo StayOpen */
  stayOpen: boolean;
  /** Emotion 기본 보이스 키(VoiceKey_Normal) */
  voiceKey: string | null;
}

export interface MsgIO {
  trigOf(pid: number): number;
  isCom(pid: number): boolean;
  /** 지금 창 레이아웃 애니가 끝났는가 */
  animEnd: boolean;
}

export type MsgEvent =
  | { type: 'layout'; layout: PageLayout }
  | { type: 'visible'; visible: boolean }
  | { type: 'anim'; anim: 'in' | 'normal' | 'out' | 'in_choice' }
  | { type: 'arrow'; visible: boolean }
  | { type: 'text'; page: number; rt: RichText }
  | { type: 'clearText' }
  | { type: 'reveal'; count: number }
  | { type: 'se'; label: string }
  | { type: 'vib'; pid: number; label: string }
  | { type: 'voice'; key: string; voiceId: string }
  | { type: 'duck'; group: number; on: boolean }
  | { type: 'nextWait' }
  | { type: 'choiceSetup'; cursor: number; items: ChoiceItem[] }
  | { type: 'choiceOpen'; cursor: number; items: ChoiceItem[] }
  | { type: 'choiceSelect'; cursor: number; count: number }
  | { type: 'choiceDecide'; index: number }
  | { type: 'advance' }
  | { type: 'end' };

export class MsgWinState {
  state = -1;
  sub = 0;
  pages: MsgPage[] = [];
  page = 0;
  owner = -1;
  owners: number[] = [];
  talkSkip = -1;
  nextMask = NEXT_MASK;
  padDisabled = false;
  arrowWhenDisabled = false;
  noNextWait = false;
  manualClose = false;
  forceAllDraw = false;
  nextRequested = false;
  skipRequested = false;
  nextInputWait = false;
  isOut = false;
  freshOpen = false;
  inputLock = 0;
  comTimer = 0;
  userOffset: [number, number, number] = [0, 0, 0];
  speed = 0;
  online = false;
  typer: Typer | null = null;
  arrow = false;
  current: ResolvedPage | null = null;
  windowType = -1;
  /** 선택지 수(+0x430)·준비됨(+0x50d)·선택형(+0x50b)·커서(+0x434)·결과(+0x438)·초기 커서(+0x43c)·취소 가능(+0x515) */
  choiceCount = 0;
  choicePending = false;
  choice = false;
  choiceCursor = -1;
  choiceResult = -1;
  choiceInit = 0;
  cancelEnable = false;
  choices: ChoiceItem[] = [];
  private out: MsgEvent[] = [];

  constructor(private readonly resolve: (page: MsgPage, userOffset: [number, number, number], choice: boolean) => ResolvedPage) {}

  drain(): MsgEvent[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  private emit(e: MsgEvent): void {
    this.out.push(e);
  }

  /** SetMessageLabel @0x710031f2d0: 넘김 요청 0, 페이지 0, 하위 단계 0 (partyrule.md 6.3) */
  /** @orig main:710031f2d0 ref */
  setMessageLabel(label: string): void {
    this.nextRequested = false;
    this.pages = [{ label }];
    this.page = 0;
    this.sub = 0;
  }

  private item(i: number): ChoiceItem {
    while (this.choices.length <= i) this.choices.push({ label: '', deciSe: null, deciVib: null, disabled: false });
    return this.choices[i];
  }

  /** SetChoiceCount: 2..4 (아니면 원본 abort) */
  setChoiceCount(n: number): void {
    if (n < 2 || n > 4) throw new Error(`mgmcommon: 선택지 수 ${n} (2..4)`);
    this.choiceCount = n;
    this.choicePending = true;
  }

  setChoiceLabel(i: number, label: string): void {
    this.item(i).label = label;
    this.choicePending = true;
  }

  setChoiceDeciSe(i: number, se: string): void {
    this.item(i).deciSe = se;
  }

  setChoiceDeciVib(i: number, vib: string): void {
    this.item(i).deciVib = vib;
  }

  addMessageLabel(label: string): void {
    this.pages.push({ label });
  }

  setOwner(pid: number): void {
    this.owner = pid;
  }

  setOwners(pids: number[]): void {
    this.owner = -1;
    this.owners = [...pids];
  }

  setTalkSkip(pid: number): void {
    this.talkSkip = pid;
  }

  /** DisablePadInput(a, b): +0x504 = a, +0x516 = b */
  disablePadInput(a: boolean, b: boolean): void {
    this.padDisabled = a;
    this.arrowWhenDisabled = b;
  }

  setOffset(v: [number, number, number]): void {
    this.userOffset = [v[0], v[1], v[2]];
  }

  private selectLayout(): void {
    const r = this.resolve(this.pages[this.page], this.userOffset, this.choice);
    this.current = r;
    this.windowType = r.layout.type;
    this.emit({ type: 'layout', layout: r.layout });
    if (this.choice) {
      this.choiceCursor = this.choiceInit;
      this.choiceInit = 0;
      this.emit({ type: 'choiceSetup', cursor: this.choiceCursor, items: this.choices.slice(0, this.choiceCount) });
    }
  }

  /** FUN_7100318340: 페이지·삽입·선택지 비움, 오프셋 0. 글자 객체는 지우지 않는다(partyrule.md 6.3) */
  /** @orig main:7100318340 ref */
  private endProcess(): void {
    this.nextRequested = false;
    this.pages = [];
    this.userOffset = [0, 0, 0];
    this.choicePending = false;
    this.choice = false;
    this.choices = [];
  }

  /** Start @0x710031e660 */
  /** @orig main:710031e660 ref */
  start(): void {
    if (this.pages.length === 0) {
      this.endProcess();
      this.state = -1;
      return;
    }
    const prev = this.state;
    this.isOut = false;
    this.page = 0;
    this.choiceCursor = -1;
    this.choiceResult = -1;
    this.choice = this.choicePending;
    this.choicePending = false;
    const prevLayout = this.current?.layout.layout;
    this.selectLayout();
    if (prev === 2 && this.current?.layout.layout !== prevLayout) {
      this.emit({ type: 'anim', anim: 'normal' });
      this.emit({ type: 'visible', visible: true });
    }
    this.typer = null;
    this.emit({ type: 'clearText' });
    this.setArrow(false);
    this.state = prev === 2 ? 1 : 0;
    this.sub = 0;
    this.freshOpen = prev !== 2;
    if (!NO_DUCK.has(this.windowType)) this.emit({ type: 'duck', group: 0x13, on: true });
  }

  /** Out @0x7100316f38 */
  /** @orig main:7100316f38 ref */
  outRequest(): void {
    if (this.state === -1 || this.state >= 4) return;
    this.state = 3;
    this.sub = 0;
    this.isOut = true;
    this.nextInputWait = false;
    this.emit({ type: 'duck', group: 0x0d, on: false });
    this.emit({ type: 'duck', group: 0x13, on: false });
  }

  requestNext(skip: boolean): void {
    if (this.state !== 1) return;
    this.nextRequested = true;
    if (skip) this.skipRequested = true;
  }

  isEnd(): boolean {
    return this.state === -1 || this.state === 2 || this.state >= 4;
  }

  isAllTalkEnd(): boolean {
    return this.state > 2 || (this.pages.length > 0 && this.page === this.pages.length - 1 && !!this.typer && this.typer.done);
  }

  currentMessageNo(): number {
    return this.state === 1 ? this.page : -1;
  }

  private setArrow(v: boolean): void {
    if (this.arrow === v) return;
    this.arrow = v;
    this.emit({ type: 'arrow', visible: v });
  }

  private allOwnersCom(io: MsgIO): boolean {
    if (this.owner !== -1) return io.isCom(this.owner);
    return this.owners.every((o) => io.isCom(o));
  }

  /** SetDecideChoice @0x7100319e78 */
  /** @orig main:7100319e78 ref */
  private decideChoice(i: number): void {
    this.choiceCursor = i;
    this.choiceResult = i;
    this.emit({ type: 'choiceDecide', index: i });
    this.emit({ type: 'se', label: this.choices[i]?.deciSe || SE_CHOICE_DECI });
    this.emit({ type: 'vib', pid: this.owner, label: this.choices[i]?.deciVib || VIB_CHOICE_DECI });
  }

  /** FUN_71003197d0 사람 선택지 입력: in_choice 끝 뒤 A 결정·B 취소(+0x515)·위/아래 이동(끝에서 멈춤) */
  /** @orig main:71003197d0 ref */
  private choiceInput(io: MsgIO): boolean {
    if (!io.animEnd || this.padDisabled) return false;
    const trig = io.trigOf(this.owner);
    if (trig & this.nextMask) {
      this.decideChoice(this.choiceCursor);
      return true;
    }
    if (trig & 0x2 && this.cancelEnable) {
      this.emit({ type: 'se', label: SE_CHOICE_CANCEL });
      return true;
    }
    const cur = this.choiceCursor;
    let to = cur;
    if (trig & CHOICE_UP) {
      for (let i = this.choiceCount - 1; i >= 0; i--) {
        if (i < cur && !this.choices[i]?.disabled) {
          to = i;
          break;
        }
      }
    } else if (trig & CHOICE_DOWN) {
      for (let i = 0; i < this.choiceCount; i++) {
        if (i > cur && !this.choices[i]?.disabled) {
          to = i;
          break;
        }
      }
    }
    if (to !== cur) {
      this.choiceCursor = to;
      this.emit({ type: 'choiceSelect', cursor: to, count: this.choiceCount });
      this.emit({ type: 'se', label: SE_CHOICE_CURSOR });
    }
    return false;
  }

  /** FUN_7100318030 넘김 판정 */
  /** @orig main:7100318030 ref */
  private judge(dt: number, io: MsgIO): boolean {
    this.inputLock = f(this.inputLock - dt);
    if (this.inputLock > 0) return false;
    if (this.nextRequested) {
      this.nextRequested = false;
      this.skipRequested = false;
      return true;
    }
    if (this.choice) {
      if (this.owner === -1) return false;
      if (io.isCom(this.owner)) {
        this.comTimer = f(this.comTimer - dt);
        if (this.comTimer > 0) return false;
        this.decideChoice(this.choiceCursor);
        return true;
      }
      return this.choiceInput(io);
    }
    if (this.owner === -1) {
      let comTicked = false;
      for (const o of this.owners) {
        if (io.isCom(o)) {
          if (!comTicked) {
            this.comTimer = f(this.comTimer - dt);
            comTicked = true;
          }
          if (this.comTimer <= 0) return true;
        } else if (!this.padDisabled && io.trigOf(o) & this.nextMask) return true;
      }
      return false;
    }
    this.comTimer = f(this.comTimer - dt);
    if (io.isCom(this.owner) && this.comTimer <= 0) return true;
    return !this.padDisabled && !!(io.trigOf(this.owner) & this.nextMask);
  }

  /** FUN_7100316fb0: 페이지 시작 */
  /** @orig main:7100316fb0 ref */
  private pageStart(): void {
    const pg = this.pages[this.page];
    if (pg) this.current = { ...this.resolve(pg, this.userOffset, this.choice), layout: this.current!.layout };
    const cur = this.current!;
    this.typer = new Typer(cur.rt.units.length, cur.rt.waitScale, { speed: this.speed, online: this.online });
    if (this.talkSkip !== -1) this.owner = this.talkSkip;
    this.emit({ type: 'text', page: this.page, rt: cur.rt });
    this.emit({ type: 'reveal', count: this.typer.visible });
    if (this.freshOpen && this.page === 0 && cur.voiceKey && cur.layout.chara) this.emit({ type: 'voice', key: cur.voiceKey, voiceId: cur.layout.chara.voice });
    this.inputLock = INPUT_LOCK;
    this.comTimer = COM_WAIT;
  }

  /** 매 프레임(메시지 0x5f454e00 → FUN_7100315328) + 글자 객체 갱신 */
  /** @orig main:7100315328 ref */
  update(dt: number, io: MsgIO): void {
    switch (this.state) {
      case 0:
        if (this.sub === 0) {
          this.emit({ type: 'visible', visible: true });
          this.emit({ type: 'anim', anim: 'in' });
          this.setArrow(false);
          this.sub = 1;
        } else if (io.animEnd) {
          this.state = 1;
          this.sub = 0;
        }
        break;
      case 1:
        if (this.sub === 0) {
          this.emit({ type: 'anim', anim: 'normal' });
          this.pageStart();
          this.sub = 1;
        } else if (this.sub === 1) {
          if (this.skipRequested || this.typer?.done) {
            if (this.choice) {
              const items = this.choices.slice(0, this.choiceCount);
              this.emit({ type: 'anim', anim: 'in_choice' });
              this.emit({ type: 'choiceOpen', cursor: this.choiceCursor, items });
              this.emit({ type: 'duck', group: 0x0d, on: true });
            }
            this.nextInputWait = true;
            this.emit({ type: 'nextWait' });
            this.sub = 2;
          }
        } else if (this.sub === 2) {
          if (this.noNextWait) break;
          if (this.inputLock <= 0 && !this.allOwnersCom(io)) this.setArrow(!this.padDisabled || this.arrowWhenDisabled);
          if (this.judge(dt, io)) {
            this.nextInputWait = false;
            this.emit({ type: 'advance' });
            if (!this.choice && this.arrow) this.emit({ type: 'se', label: SE_PROC });
            this.sub = 3;
          }
        } else {
          this.setArrow(false);
          if (this.page + 1 < this.pages.length) {
            this.page++;
            this.typer = null;
            const prevLayout = this.current?.layout.layout;
            this.selectLayout();
            if (this.current?.layout.layout !== prevLayout) this.emit({ type: 'visible', visible: true });
            this.sub = 0;
          } else if (this.current?.stayOpen || this.manualClose) {
            this.endProcess();
            this.state = 2;
          } else {
            this.state = 3;
            this.sub = 0;
            this.isOut = true;
            this.emit({ type: 'duck', group: 0x0d, on: false });
            this.emit({ type: 'duck', group: 0x13, on: false });
          }
        }
        break;
      case 3:
        if (this.sub === 0) {
          this.emit({ type: 'clearText' });
          this.setArrow(false);
          this.emit({ type: 'anim', anim: 'out' });
          this.sub = 1;
        } else if (this.sub === 1) {
          if (io.animEnd) {
            this.emit({ type: 'visible', visible: false });
            this.sub = 2;
          }
        } else {
          this.endProcess();
          this.state = -1;
          this.emit({ type: 'end' });
        }
        break;
    }
    const t = this.typer;
    if (t) {
      if (t.typing && !this.padDisabled) {
        const sk = this.owner !== -1 ? [this.owner] : this.owners;
        if (sk.some((p) => !io.isCom(p) && io.trigOf(p) & this.nextMask)) t.skip();
      }
      const before = t.visible;
      const n = t.update(dt);
      for (let i = 0; i < n; i++) this.emit({ type: 'se', label: SE_PUT });
      if (t.visible !== before) this.emit({ type: 'reveal', count: t.visible });
    }
  }
}
