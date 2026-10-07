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
/** 창 형식 Announce(5)·Subtitle(6) 은 더킹 안 함 */
const NO_DUCK = new Set([5, 6]);

export interface MsgPage {
  label: string;
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
  | { type: 'anim'; anim: 'in' | 'normal' | 'out' }
  | { type: 'arrow'; visible: boolean }
  | { type: 'text'; page: number; rt: RichText }
  | { type: 'clearText' }
  | { type: 'reveal'; count: number }
  | { type: 'se'; label: string }
  | { type: 'voice'; key: string; voiceId: string }
  | { type: 'duck'; group: number; on: boolean }
  | { type: 'nextWait' }
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
  private out: MsgEvent[] = [];

  constructor(private readonly resolve: (page: MsgPage, userOffset: [number, number, number]) => ResolvedPage) {}

  drain(): MsgEvent[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  private emit(e: MsgEvent): void {
    this.out.push(e);
  }

  setMessageLabel(label: string): void {
    this.pages = [{ label }];
    this.page = 0;
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
    const r = this.resolve(this.pages[this.page], this.userOffset);
    this.current = r;
    this.windowType = r.layout.type;
    this.emit({ type: 'layout', layout: r.layout });
  }

  /** FUN_7100318340: 페이지·삽입 비움, 오프셋 0 */
  private endProcess(): void {
    this.pages = [];
    this.userOffset = [0, 0, 0];
    this.typer = null;
  }

  /** Start @0x710031e660 */
  start(): void {
    if (this.pages.length === 0) {
      this.endProcess();
      this.state = -1;
      return;
    }
    const prev = this.state;
    this.isOut = false;
    this.page = 0;
    this.selectLayout();
    this.typer = null;
    this.emit({ type: 'clearText' });
    this.setArrow(false);
    this.state = prev === 2 ? 1 : 0;
    this.sub = 0;
    this.freshOpen = prev !== 2;
    if (!NO_DUCK.has(this.windowType)) this.emit({ type: 'duck', group: 0x13, on: true });
  }

  /** Out @0x7100316f38 */
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

  /** FUN_7100318030 넘김 판정(선택형 아님) */
  private judge(dt: number, io: MsgIO): boolean {
    this.inputLock = f(this.inputLock - dt);
    if (this.inputLock > 0) return false;
    if (this.nextRequested) {
      this.nextRequested = false;
      this.skipRequested = false;
      return true;
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
  private pageStart(): void {
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
            if (this.arrow) this.emit({ type: 'se', label: SE_PROC });
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
    if (t && this.state === 1) {
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
