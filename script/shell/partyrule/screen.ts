/**
 * 파티 규칙 화면 묶음 — 판·흐름(순수) + 메시지 창(mgmcommon MessageWindow) + 그리기(PartyView). 한 틱 순서 [설계, partyrule.md 9.2]:
 * 입력 → 제목·띠·판 갱신(판 파이버 포함) → 단계 흐름 → 메시지 창 → 레이아웃 애니. 사건은 생기는 즉시 레이아웃에 적용한다.
 */
import { FiberRunner } from '../mgmcommon/fiber';
import { MgmInput, type MgmPlayer } from '../mgmcommon/input';
import { MessageWindow } from '../mgmcommon/messageWindow';
import type { MgmSound } from '../mgmcommon/sound';
import type { MgmPadSource, MgmSpec } from '../mgmcommon/types';
import type { MgmDrawHost } from '../mgmcommon/window';
import { CheckPanel } from './check';
import { MapTelop, PartyFlow, TitleHeader, updateHeaders } from './flow';
import { MemberPanel } from './member';
import { RulePanel } from './rule';
import type { PartyRuleConfig, PEvent, PIO } from './types';
import { PartyView } from './view';

export const PARTYRULE_PART = '../partyrule/partyrule.json';
export const PARTYRULE_FACES = '../mgm01/faces.json';

export interface PartyRuleExtra {
  texts: Record<string, string>;
  msgAttr: MgmSpec['msgAttr'];
  sounds: Record<string, { file: string; gain: number }>;
}

/** partyrule.json 의 문구·메시지 속성·소리를 공용 명세에 더한다(같은 이름은 공용 쪽을 남김) */
export function applyPartyRuleExtra(spec: MgmSpec, extra: PartyRuleExtra): void {
  for (const [k, v] of Object.entries(extra.texts)) if (!(k in spec.texts)) spec.texts[k] = v;
  for (const [k, v] of Object.entries(extra.msgAttr)) if (!(k in spec.msgAttr)) spec.msgAttr[k] = v;
  for (const [k, v] of Object.entries(extra.sounds)) if (!(k in spec.sounds)) spec.sounds[k] = v;
}

export interface PartyRuleOptions {
  host: MgmDrawHost;
  cfg: PartyRuleConfig;
  pads: MgmPadSource;
  sound?: MgmSound;
  /** 시작 단계: checkMember(기본)·member·check·rule */
  start?: string;
  onNote?(text: string): void;
}

export class PartyRuleScreen {
  readonly cfg: PartyRuleConfig;
  readonly input: MgmInput;
  readonly msg: MessageWindow;
  readonly view: PartyView;
  readonly member: MemberPanel;
  readonly check: CheckPanel;
  readonly rule: RulePanel;
  readonly title: TitleHeader;
  readonly telop: MapTelop;
  readonly flow: PartyFlow;
  private readonly runner = new FiberRunner();
  readonly notes: string[] = [];
  frame = 0;

  constructor(o: PartyRuleOptions) {
    this.cfg = o.cfg;
    const players = (): MgmPlayer[] => o.cfg.players.map((p, pid) => ({ pid, type: p.com ? 1 : 0 }));
    this.input = new MgmInput(o.pads, players);
    this.msg = new MessageWindow(o.host, { trigOf: (p) => this.input.trigOf(p), isCom: (p) => this.input.isCom(p) }, o.sound);
    this.view = new PartyView(
      o.host,
      (label, x) => o.sound?.playSe(label, x),
      (t) => {
        this.notes.push(t);
        o.onNote?.(t);
      },
    );
    const sink = { push: (e: PEvent): void => this.view.push(e) };
    const op = (): number => this.input.operator;
    this.title = new TitleHeader(sink);
    this.telop = new MapTelop(sink);
    this.member = new MemberPanel(sink, this.msg, o.cfg);
    this.check = new CheckPanel(sink, this.msg, o.cfg, op);
    this.rule = new RulePanel(sink, this.msg, o.cfg);
    this.flow = new PartyFlow({ ev: sink, msg: this.msg, cfg: o.cfg, operator: op, member: this.member, check: this.check, rule: this.rule, title: this.title, telop: this.telop }, o.start);
    this.runner.start(this.flow.run());
  }

  get finished(): boolean {
    return this.flow.finished;
  }

  tick(dt: number): void {
    this.frame++;
    this.input.update();
    const io: PIO = { trig: this.input.trig(), rep: this.input.rep(), hold: this.input.hold(), done: (s, p) => this.view.done(s, p) };
    updateHeaders(io, this.title, this.telop);
    this.member.update(io);
    this.check.update(io);
    this.rule.update(io);
    this.runner.step();
    this.msg.update(dt);
    this.view.update();
  }

  draw(): void {
    this.view.draw();
    this.msg.draw();
    this.view.drawTop();
  }

  /** 결과 칸(설정값) */
  summary(): Record<string, unknown> {
    const c = this.cfg;
    return {
      step: this.flow.step,
      players: c.players.map((p, i) => `${i + 1}P ${p.chara}${p.com ? '(CPU)' : ''} 난이도${p.level} 핸디캡${p.handicap}`),
      turnMax: c.turnMax,
      bonusType: c.bonusType,
      flag4_inst: c.flag4,
      flag6_gyro: c.flag6,
      flag7_vote: c.flag7,
      flag8_fast: c.flag8,
      menu: { level: c.menuLevel, speed: c.menuSpeed, inst: c.menuInst, gyro: c.menuGyro },
      boardId: c.boardId,
      saveFlags: [...c.saveFlags].map((f) => `0x${f.toString(16)}`),
      history: this.flow.history,
      notes: this.notes,
    };
  }
}
