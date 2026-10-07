/**
 * 출발 전 단계 흐름 — menu01::SequenceStartBd 상태 스택(UpdateImpl @0x7100041290) 중 9 CheckMemberImpl @0x7100043dc0·10 SettingMemberImpl @0x7100044780·
 * 12 CheckStartImpl @0x7100045140·13 SettingRuleImpl @0x71000459c0, 제목 띠 ComUiModeTitleHeader·보드 이름 띠 ComUiBdMapNameTelop. 근거: docs/shell/partyrule.md 3·5.5.
 */
import type { Flow } from '../mgmcommon/fiber';
import type { CheckPanel } from './check';
import type { MemberPanel } from './member';
import { PanelLife } from './panel';
import type { RulePanel } from './rule';
import { BOARD_NAME } from './tables';
import type { PartyMsg, PartyRuleConfig, PartyStep, PIO, PSink } from './types';

export class TitleHeader {
  readonly life: PanelLife;

  constructor(private readonly ev: PSink) {
    this.life = new PanelLife('title', ev, null);
    ev.push({ t: 'show', scr: 'title', v: false });
  }

  /** Start(MODE_ITEM 0, BoardMode) = SetMode + Start */
  start(boardMode: 0 | 1): void {
    this.ev.push({ t: 'text', scr: 'title', path: 'x_text_mode', label: boardMode === 1 ? 'mn01_bd_ui_mode_serious' : 'mn01_bd_ui_mode_party' });
    this.life.startIn();
  }
}

export class MapTelop {
  readonly life: PanelLife;

  constructor(private readonly ev: PSink) {
    this.life = new PanelLife('telop', ev, null);
    ev.push({ t: 'show', scr: 'telop', v: false });
  }

  /** SetBoard(id): x_text_title = mn01_bd_ui_check_map(Text0 = 보드 이름), x_base_0N 하나만 */
  setBoard(id: number): void {
    if (id < 0 || id > 6) return;
    this.ev.push({ t: 'text', scr: 'telop', path: 'x_text_title', label: 'mn01_bd_ui_check_map', ins: { Text0: BOARD_NAME[id] } });
    for (let i = 0; i < 7; i++) this.ev.push({ t: 'vis', scr: 'telop', path: `x_base_0${i}`, v: i === id });
  }
}

const STEP_OF: Record<number, PartyStep> = { 9: 'checkMember', 10: 'settingMember', 12: 'checkRule', 13: 'settingRule', 14: 'start' };
const START_STACK: Record<string, number[]> = { member: [9, 10], check: [9, 12], rule: [9, 12, 13], checkMember: [9] };

export interface PartyFlowParts {
  ev: PSink;
  msg: PartyMsg;
  cfg: PartyRuleConfig;
  operator: () => number;
  member: MemberPanel;
  check: CheckPanel;
  rule: RulePanel;
  title: TitleHeader;
  telop: MapTelop;
}

export class PartyFlow {
  stack: number[];
  step: PartyStep = 'checkMember';
  finished = false;
  /** 단계 기록(시험·결과 칸) */
  readonly history: PartyStep[] = [];

  constructor(
    private readonly p: PartyFlowParts,
    start = 'checkMember',
  ) {
    this.stack = [...(START_STACK[start] ?? [9])];
  }

  private push(s: number): void {
    this.stack.push(s);
  }

  private pop(): void {
    this.stack.pop();
  }

  /** UpdateImpl: 앞 단계가 끝나고 메시지 창이 일하지 않을 때 맨 위 단계를 실행 */
  *run(): Flow {
    const { msg } = this.p;
    for (;;) {
      while (msg.isWorking()) yield;
      const top = this.stack[this.stack.length - 1];
      if (top === undefined || top === 14) {
        this.p.title.life.out(false);
        this.p.telop.life.out(false);
        this.step = 'start';
        this.history.push('start');
        this.finished = true;
        return;
      }
      this.step = STEP_OF[top] ?? 'checkMember';
      this.history.push(this.step);
      if (top === 9) yield* this.checkMember();
      else if (top === 10) yield* this.settingMember();
      else if (top === 12) yield* this.checkStart();
      else if (top === 13) yield* this.settingRule();
      else this.pop();
      yield;
    }
  }

  private headers(): void {
    this.p.title.start(this.p.cfg.boardMode);
  }

  private *checkMember(): Flow {
    const { msg, cfg, telop } = this.p;
    this.headers();
    telop.setBoard(cfg.boardId);
    telop.life.in(false);
    msg.addMessageLabel('mn01_bd_mw_member_check');
    msg.setChoiceCount(3);
    msg.setChoiceLabel(0, 'mn01_bd_mw_member_check_a0');
    msg.setChoiceLabel(2, 'mn01_bd_mw_member_check_a1');
    msg.setChoiceLabel(1, 'mn01_bd_mw_member_check_a2');
    msg.setChoiceDeciSe(2, 'SQ_SE_SYS_CANCEL');
    msg.setChoiceDeciVib(2, 'bv_vib_sys_deci');
    msg.setInitialChoice(0);
    msg.setManualClose(true);
    msg.setCancelEnable(true);
    msg.setOwner(this.p.operator());
    msg.disablePadInput(false, false);
    msg.setFlagForceAllDraw(false);
    msg.start();
    while (msg.isWorking()) yield;
    msg.out();
    const r = msg.choiceResult();
    if (r === 1) {
      telop.life.out(false);
      this.push(10);
    } else if (r === 0) {
      if (cfg.boardMode === 1) {
        telop.life.out(false);
        this.p.ev.push({ t: 'note', text: '챔피언십 아이템 고르기(11) — 범위 밖, 규칙 확인으로' });
      }
      this.push(12);
    } else {
      telop.life.out(false);
      this.pop();
    }
  }

  private *settingMember(): Flow {
    const { cfg, member } = this.p;
    this.headers();
    const com = cfg.players.some((pl) => pl.com) ? 1 : 0;
    member.start(com | (com << 8) | (com << 16) | ((cfg.boardMode === 0 ? 1 : 0) << 24));
    while (!member.life.finished) yield;
    this.pop();
  }

  private *checkStart(): Flow {
    const { cfg, check, telop } = this.p;
    this.headers();
    telop.setBoard(cfg.boardId);
    telop.life.in(false);
    cfg.flag4 = cfg.menuInst;
    cfg.flag6 = cfg.menuGyro;
    check.label = cfg.boardMode === 1 ? 'mn01_bd_mw_check_serious' : 'mn01_bd_mw_check';
    check.threeChoices = true;
    check.setItemCount(cfg.gameFlag20 && cfg.boardMode === 0 ? 5 : 4);
    check.setupRow('inst', 2);
    check.setupRow('gyro', 3);
    check.setupRow('choice', 4);
    check.start();
    while (check.result === -1) yield;
    if (check.result === 0) this.p.ev.push({ t: 'note', text: 'GyroControllerConfigFiber(조이콘 설정 확인) — 범위 밖, 통과로 둠' });
    check.life.out(false);
    if (check.result === 2) {
      telop.life.out(false);
      this.push(13);
    } else if (check.result === 1) this.pop();
    else this.push(14);
    while (!check.life.finished) yield;
  }

  private *settingRule(): Flow {
    const { cfg, rule } = this.p;
    this.headers();
    rule.start(cfg.boardMode);
    while (!rule.life.finished) yield;
    this.pop();
  }
}

/** 프레임마다 제목·띠 수명 갱신 */
export function updateHeaders(io: PIO, title: TitleHeader, telop: MapTelop): void {
  title.life.update(io);
  telop.life.update(io);
}
