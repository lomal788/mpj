/**
 * 메시지 창 bq::ComUiMessageWindow — 순수 상태기계(state.ts) 사건을 bq Parts 메시지 창 레이아웃(sys_meswin_00 등)에 옮긴다.
 * 근거: docs/shell/message_window.md 3~7·9절. 공개 API = mgm_common.md 9.2 MessageWindowAdapter + 9.4 추가 함수.
 */
import type { LayoutInst } from '../../charselect/scene2d';
import type { Mat3 } from '../itemLayout';
import type { MgmSound } from '../sound';
import { measure, parseMessage, plainText, RichTextPane, type Inserts } from '../text';
import type { MgmSpec } from '../types';
import type { MgmDrawHost } from '../window';
import { pageLayout, setPlace, WINDOW_TYPE, type PageLayout } from './layout';
import { MsgWinState, type MsgEvent, type MsgPage, type ResolvedPage } from './state';

export interface MessageWindowAdapter {
  setMessageLabel(label: string): void;
  addMessageLabel(label: string): void;
  setInsert(key: string, value: string | number): void;
  setChoices?(a: string, b: string): void;
  disablePadInput(pad: boolean, b: boolean): void;
  setOwner(pid: number): void;
  setTalkSkip(pid: number): void;
  setOffset(v: [number, number, number]): void;
  start(): void;
  out(): void;
  isOut(): boolean;
  isEnd(): boolean;
  isNextInputWait(): boolean;
  isAllTalkEnd(): boolean;
  currentMessageNo(): number;
  requestNext(b: boolean): void;
  choiceResult(): number;
}

/** 입력: 플레이어별 누름 비트·COM 여부(MgmInput 이 맞춘다) */
export interface MessageWindowInput {
  trigOf(pid: number): number;
  isCom(pid: number): boolean;
}

interface WinLayout {
  inst: LayoutInst;
  text: RichTextPane;
  shadow: RichTextPane;
  bd: { w: number; h: number; x: number; y: number };
}

export class MessageWindow implements MessageWindowAdapter {
  readonly st: MsgWinState;
  private readonly layouts = new Map<string, WinLayout>();
  private cur: WinLayout | null = null;
  private place: [number, number] = [0, 0];
  private inserts = new Map<number, Inserts>();
  private readonly spec: MgmSpec;
  /** 시험·디버그용 최근 사건 */
  readonly log: MsgEvent[] = [];

  constructor(
    private readonly host: MgmDrawHost,
    private readonly input: MessageWindowInput,
    private readonly sound?: MgmSound,
  ) {
    this.spec = host.spec;
    this.st = new MsgWinState((p, off) => this.resolvePage(p, off));
  }

  private pageIndex(p: MsgPage): number {
    return this.st.pages.indexOf(p);
  }

  private resolvePage(p: MsgPage, userOffset: [number, number, number]): ResolvedPage {
    const attr = this.spec.msgAttr[p.label];
    const layout = pageLayout(this.spec.meswin, attr, userOffset);
    const ins = this.inserts.get(this.pageIndex(p)) ?? {};
    const rt = parseMessage(this.spec.texts[p.label] ?? p.label, this.spec.texts, ins);
    const wi = this.spec.meswin.attrLists.WindowInfo[attr?.wi ?? 0];
    const emo = this.spec.meswin.emotion?.[attr?.emo ?? 0];
    return { rt, layout, stayOpen: wi === 'WI_StayOpen', voiceKey: emo?.normal ?? null };
  }

  private winLayout(name: string): WinLayout {
    let w = this.layouts.get(name);
    if (w) return w;
    const inst = this.host.layout(name);
    inst.visible = false;
    inst.part('x_cursor')?.play('normal');
    const ls = this.spec.lineSpace[name] ?? {};
    const bdf = inst.find('x_bd_00');
    const bn = bdf ? bdf[0].nodes[bdf[1]] : null;
    w = {
      inst,
      text: new RichTextPane(this.host.all, inst, 'x_text', ls.x_text ?? 0, true),
      shadow: new RichTextPane(this.host.all, inst, 'x_text_shadow', ls.x_text_shadow ?? 0, false),
      bd: bn ? { w: bn.z[0], h: bn.z[1], x: bn.t[0], y: bn.t[1] } : { w: 1920, h: 1080, x: 0, y: 0 },
    };
    this.layouts.set(name, w);
    return w;
  }

  /** 화자 표시(6.5): Name = 이름표(폭 = 글자 폭 + 60), Normal·NormalSmall = 얼굴, NoneChara = 없음 */
  private speaker(w: WinLayout, pl: PageLayout): void {
    const inst = w.inst;
    const isName = pl.type === WINDOW_TYPE.Name;
    const isIcon = pl.type === WINDOW_TYPE.Normal || pl.type === WINDOW_TYPE.NormalSmall;
    inst.setVisible('x_name', isName);
    inst.setVisible('x_icon', isIcon);
    if (!isName) return;
    const nameLabel = pl.chara?.name ?? '';
    const s = plainText(this.spec.texts.sys_mw_name ?? '[1:1:00cd]', this.spec.texts, { Text0: nameLabel });
    inst.setText('x_text_name', s);
    const tf = inst.find('x_text_name');
    const bf = inst.find('x_base_name');
    if (!tf || !bf) return;
    const ts = tf[0].nodes[tf[1]].spec.txt!;
    const wpx = measure(this.spec.fonts[ts.font], ts.fs, ts.cs, s);
    const bn = bf[0].nodes[bf[1]];
    bn.z = [wpx + 60, ts.fs[1]];
    tf[0].nodes[tf[1]].z = [wpx, ts.fs[1]];
  }

  private apply(ev: MsgEvent[]): void {
    for (const e of ev) {
      this.log.push(e);
      if (this.log.length > 200) this.log.shift();
      switch (e.type) {
        case 'layout': {
          const w = this.winLayout(e.layout.layout);
          if (this.cur && this.cur !== w) this.cur.inst.visible = false;
          this.cur = w;
          const [px, py] = setPlace(e.layout.place, w.bd, this.spec.screen);
          this.place = [px + e.layout.offset[0], py + e.layout.offset[1]];
          this.speaker(w, e.layout);
          break;
        }
        case 'visible':
          if (this.cur) this.cur.inst.visible = e.visible;
          break;
        case 'anim':
          this.cur?.inst.play(e.anim);
          break;
        case 'arrow':
          this.cur?.inst.setVisible('x_cursor', e.visible);
          break;
        case 'text':
          this.cur?.text.set(e.rt);
          this.cur?.shadow.set(e.rt);
          break;
        case 'clearText':
          this.cur?.text.set(null);
          this.cur?.shadow.set(null);
          break;
        case 'reveal':
          this.cur?.text.reveal(e.count);
          this.cur?.shadow.reveal(e.count);
          break;
        case 'se':
          this.sound?.playSe(e.label);
          break;
        case 'voice':
          this.sound?.voice(e.key, e.voiceId);
          break;
        case 'duck':
          this.sound?.duck(e.group, e.on);
          break;
      }
    }
  }

  setMessageLabel(label: string): void {
    this.inserts.clear();
    this.st.setMessageLabel(label);
  }

  addMessageLabel(label: string): void {
    this.st.addMessageLabel(label);
  }

  /** 마지막으로 넣은 페이지의 삽입 값 [설계: 원본은 페이지마다 삽입 목록] */
  setInsert(key: string, value: string | number): void {
    const i = Math.max(0, this.st.pages.length - 1);
    const m = this.inserts.get(i) ?? {};
    m[key] = value;
    this.inserts.set(i, m);
  }

  setChoices(a: string, b: string): void {
    console.warn(`mgmcommon: 메시지 선택지는 1단계 미구현(${a}, ${b}) — message_window.md 9.4`);
  }

  disablePadInput(pad: boolean, b: boolean): void {
    this.st.disablePadInput(pad, b);
  }

  setOwner(pid: number): void {
    this.st.setOwner(pid);
  }

  setTalkSkip(pid: number): void {
    this.st.setTalkSkip(pid);
  }

  setOffset(v: [number, number, number]): void {
    this.st.setOffset(v);
  }

  setNextMask(mask: number): void {
    this.st.nextMask = mask;
  }

  setSpeed(s: 0 | 1 | 2): void {
    this.st.speed = s;
  }

  setOnline(b: boolean): void {
    this.st.online = b;
  }

  /** SetManualClose(b) — 마지막 페이지 뒤 닫지 않고 상태 2 [추정: +0x510] */
  setManualClose(b: boolean): void {
    this.st.manualClose = b;
  }

  disableNextKeyWait(b: boolean): void {
    this.st.noNextWait = b;
  }

  /** SetFlagForceAllDraw — 효과 [미확정], 값만 둔다 */
  setFlagForceAllDraw(b: boolean): void {
    this.st.forceAllDraw = b;
  }

  start(): void {
    this.st.start();
    this.apply(this.st.drain());
  }

  out(): void {
    this.st.outRequest();
    this.apply(this.st.drain());
  }

  isOut(): boolean {
    return this.st.isOut;
  }

  isEnd(): boolean {
    return this.st.isEnd();
  }

  isNextInputWait(): boolean {
    return this.st.nextInputWait;
  }

  isAllTalkEnd(): boolean {
    return this.st.isAllTalkEnd();
  }

  currentMessageNo(): number {
    return this.st.currentMessageNo();
  }

  requestNext(b: boolean): void {
    this.st.requestNext(b);
  }

  choiceResult(): number {
    return -1;
  }

  /** 한 틱: 상태기계 + 글자 → 레이아웃 애니 진행 */
  update(dt: number): void {
    this.st.update(dt, { trigOf: (p) => this.input.trigOf(p), isCom: (p) => this.input.isCom(p), animEnd: this.cur ? this.cur.inst.done : true });
    this.apply(this.st.drain());
    this.cur?.inst.update(1);
  }

  /** 지금 창의 화면 기준 행렬(SetPlace + 페이지 오프셋) */
  get base(): Mat3 {
    return [1, 0, this.place[0], 0, 1, this.place[1]];
  }

  get layoutInst(): LayoutInst | null {
    return this.cur?.inst ?? null;
  }

  get revealed(): number {
    return this.cur?.text.revealed ?? 0;
  }

  draw(): void {
    const w = this.cur;
    if (!w || !w.inst.visible) return;
    const b = this.base;
    this.host.draw(w.inst, b);
    w.shadow.draw(this.host.r2d, b);
    w.text.draw(this.host.r2d, b);
  }
}

