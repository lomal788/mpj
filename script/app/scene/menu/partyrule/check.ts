/**
 * 규칙 확인 판 — menu01::ComUiBdCheckRule (ctor @0x7100063d00, Start @0x7100064ee0, SetupTurn @0x7100064f60, SetupBonus @0x7100065290,
 * SetupInst/Gyro/Choice @0x7100065550/@0x71000658a0/@0x7100065bf0, UpdateProcess @0x71000646b4, StateMessageImpl @0x71000647c4). 근거: docs/shell/partyrule.md 4.4·5.3·6.4.
 */
import { FiberRunner, type FiberHandle, type Flow } from '../../../../shell/mgmcommon/fiber';
import { PanelLife } from './panel';
import { CHECK_ICON, CHECK_MINUTES, CHECK_NEW, CHECK_SET, CHECK_TITLE, CHECK_TURN, checkTurnIndex, checkWinAnim } from './tables';
import type { PartyMsg, PartyRuleConfig, PIO, PSink } from './types';

const TITLE_LABEL = ['mn01_bd_ui_check_turn', 'mn01_bd_ui_check_bonus', 'mn01_bd_ui_check_inst', 'mn01_bd_ui_check_gyro', 'mn01_bd_ui_check_decide'] as const;
const ICON_TEX = ['mn01_icon_timer_00^q', 'mn01_icon_star_00^q', 'mn01_icon_balloon_00^q', 'mn01_icon_feel_00^q', 'mn01_icon_mg_00^q'] as const;

export class CheckPanel {
  readonly life: PanelLife;
  /** +0x3c: −1 대기, 0 스타트, 1 뒤로, 2 플레이 방법 설정 */
  result = -1;
  /** +0x48 메시지 라벨, +0x60 선택지 3개 */
  label = 'mn01_bd_mw_check';
  threeChoices = true;
  private readonly fibers = new FiberRunner();
  private fiber: FiberHandle<void> | null = null;

  constructor(
    private readonly ev: PSink,
    private readonly msg: PartyMsg,
    private readonly cfg: PartyRuleConfig,
    private readonly operator: () => number,
  ) {
    this.life = new PanelLife('check', ev, msg);
    this.text('x_parts_win/x_text_mg', 'mn01_bd_ui_check_mg');
    for (let i = 0; i < 5; i++) {
      this.text(CHECK_TITLE(i), TITLE_LABEL[i]);
      this.ev.push({ t: 'tex', scr: 'check', path: CHECK_ICON(i), key: ICON_TEX[i] });
      this.vis(CHECK_NEW(i), false);
    }
    this.ev.push({ t: 'show', scr: 'check', v: false });
  }

  private text(path: string, label: string, ins?: Record<string, string | number>): void {
    this.ev.push({ t: 'text', scr: 'check', path, label, ins });
  }

  private vis(path: string, v: boolean): void {
    this.ev.push({ t: 'vis', scr: 'check', path, v });
  }

  setItemCount(n: number): void {
    const a = checkWinAnim(n);
    if (a) this.ev.push({ t: 'play', scr: 'check', path: 'x_parts_win', tag: a });
  }

  private setupTurn(): void {
    this.text(CHECK_TITLE(0), TITLE_LABEL[0]);
    this.ev.push({ t: 'tex', scr: 'check', path: CHECK_ICON(0), key: ICON_TEX[0] });
    this.vis(CHECK_NEW(0), false);
    const k = checkTurnIndex(this.cfg.turnMax);
    this.text('x_parts_win/x_text_turn', 'mn01_bd_ui_check_choice_turn', { Number0: CHECK_TURN[k] });
    this.text('x_parts_win/x_text_time', 'mn01_bd_ui_check_aboutTime', { Number0: CHECK_MINUTES[k] });
  }

  private setupBonus(): void {
    this.text(CHECK_TITLE(1), TITLE_LABEL[1]);
    this.ev.push({ t: 'tex', scr: 'check', path: CHECK_ICON(1), key: ICON_TEX[1] });
    this.vis(CHECK_NEW(1), this.cfg.boardMode === 0 && this.cfg.gameFlag22 && !this.cfg.saveFlags.has(0x3b));
    const lab = ['mn01_bd_ui_check_choice_no', 'mn01_bd_ui_check_choice_yes', 'mn01_bd_ui_check_choice_original'][this.cfg.bonusType];
    if (lab) this.text(CHECK_SET(1), lab);
  }

  /** SetupInst·SetupGyro·SetupChoice(행 번호) */
  setupRow(kind: 'inst' | 'gyro' | 'choice', i: number): void {
    const k = kind === 'inst' ? 2 : kind === 'gyro' ? 3 : 4;
    this.text(CHECK_TITLE(i), TITLE_LABEL[k]);
    this.ev.push({ t: 'tex', scr: 'check', path: CHECK_ICON(i), key: ICON_TEX[k] });
    const c = this.cfg;
    const isNew = kind === 'choice' && c.boardMode === 0 && c.gameFlag20 && !c.saveFlags.has(0x3c);
    this.vis(CHECK_NEW(i), isNew);
    if (i < 1 || i > 4) return;
    if (kind === 'inst') this.text(CHECK_SET(i), c.flag4 ? 'mn01_bd_ui_check_choice_yes' : 'mn01_bd_ui_check_choice_no');
    else if (kind === 'gyro') this.text(CHECK_SET(i), c.flag6 ? 'mn01_bd_ui_check_choice_yes' : 'mn01_bd_ui_check_choice_no');
    else this.text(CHECK_SET(i), c.flag7 ? 'mn01_bd_ui_check_choice_vote' : 'mn01_bd_ui_check_choice_random');
  }

  start(): void {
    this.result = -1;
    this.setupTurn();
    this.setupBonus();
    this.life.startIn();
  }

  get busy(): boolean {
    return !!this.fiber && !this.fiber.done;
  }

  update(io: PIO): void {
    this.life.update(io);
    this.fibers.step();
    if (this.life.phase === 1 && this.result === -1 && !this.busy) this.fiber = this.fibers.start(this.stateMessage());
  }

  private *once(label: string, flag: number): Flow {
    const m = this.msg;
    m.setOwner(this.operator());
    m.disablePadInput(false, false);
    m.setFlagForceAllDraw(false);
    m.addMessageLabel(label);
    m.start();
    while (m.isWorking()) yield;
    this.cfg.saveFlags.add(flag);
  }

  /** StateMessageImpl: 첫 안내(보너스·투표) → 확인 메시지 + 선택지 → 결과 */
  private *stateMessage(): Flow {
    const m = this.msg;
    while (!m.isEnd()) yield;
    const c = this.cfg;
    if (c.boardMode === 0 && c.gameFlag22 && !c.saveFlags.has(0x1a)) yield* this.once('mn01_bd_mw_check_bonus', 0x1a);
    if (c.boardMode === 0 && c.gameFlag20 && !c.saveFlags.has(0x1b)) yield* this.once('mn01_bd_mw_check_decide', 0x1b);
    m.addMessageLabel(this.label);
    let back: number;
    let setting: number;
    if (this.threeChoices) {
      m.setChoiceCount(3);
      m.setChoiceLabel(0, 'mn01_bd_mw_check_a0');
      m.setChoiceLabel(2, 'mn01_bd_mw_check_a1');
      m.setChoiceLabel(1, 'mn01_bd_mw_check_a2');
      back = 2;
      setting = 1;
    } else {
      m.setChoiceCount(2);
      m.setChoiceLabel(0, 'mn01_bd_mw_check_a0');
      m.setChoiceLabel(1, 'mn01_bd_mw_check_a1');
      back = 1;
      setting = 2;
    }
    m.setChoiceDeciSe(0, 'SQ_SE_SYS_DECI_L');
    m.setChoiceDeciVib(0, 'bv_vib_sys_deci_l');
    m.setChoiceDeciSe(back, 'SQ_SE_SYS_CANCEL');
    m.setChoiceDeciVib(back, 'bv_vib_sys_deci');
    m.setInitialChoice(0);
    m.setManualClose(true);
    m.setCancelEnable(true);
    m.setOwner(this.operator());
    m.disablePadInput(false, false);
    m.setFlagForceAllDraw(false);
    m.start();
    while (m.isWorking()) yield;
    m.out();
    const r = m.choiceResult();
    this.result = r === 0 ? 0 : r === setting ? 2 : 1;
  }
}
