/**
 * 플레이 방법 설정 판 — menu01::ComUiBdSettingRule (ctor @0x710007df20, Start @0x7100083d80, Cursor @0x710007eac0, UpdateProcess @0x710007f4f4,
 * UpdateSet* @0x710007f8f0~@0x7100081660, Set* @0x7100082060~@0x7100083630, Finish @0x710007f7dc). 근거: docs/shell/partyrule.md 4.5·5.4.
 */
import { PanelLife } from './panel';
import { BONUS_INDEX, BONUS_TYPE, downMask, RULE_CURSOR, RULE_ICON, RULE_NEW, RULE_PICT, RULE_SET, RULE_TITLE, TURN_VALUE, turnIndex, upMask } from './tables';
import type { PartyMsg, PartyRuleConfig, PIO, PSink } from './types';

const RULE_MINUTES = [90, 120, 150, 180, 210, 100] as const;
const YES_NO = (p: string): string => `${p}/x_text_yes_no`;

export class RulePanel {
  readonly life: PanelLife;
  result = -1;
  mode: 0 | 1 = 0;
  row = -1;
  readonly rowOn = [false, false, false, false, false];
  /** +0x50 TURN·+0x68 보너스·+0x80 설명·+0x98 체감·+0xb0 정하는 법 목록 */
  readonly lists: number[][] = [[], [], [], [], []];
  /** +0xc8..+0xd8 값(−1 = 아직 없음) */
  readonly value = [-1, -1, -1, -1, -1];
  private guideOn = false;

  constructor(
    private readonly ev: PSink,
    private readonly msg: PartyMsg,
    private readonly cfg: PartyRuleConfig,
  ) {
    this.life = new PanelLife('rule', ev, msg);
    for (let i = 0; i < 5; i++) this.text(`${RULE_SET(i)}/x_text_title`, RULE_TITLE[i]);
    this.text(`${RULE_PICT(0)}/x_text_top`, 'mn01_bd_ui_detail_time_top');
    this.text(`${RULE_PICT(0)}/x_text_bottom`, 'mn01_bd_ui_detail_time_bottom');
    for (let i = 0; i < 5; i++) this.ev.push({ t: 'tex', scr: 'rule', path: `${RULE_SET(i)}/x_icon`, key: RULE_ICON[i] });
    for (let i = 0; i < 5; i++) this.play(`${RULE_CURSOR(i)}/x_parts_cursor`, 'normal');
    for (let i = 0; i < 5; i++) this.vis(RULE_NEW(i), false);
    this.cursor(-1);
    this.ev.push({ t: 'show', scr: 'rule', v: false });
  }

  private text(path: string, label: string, ins?: Record<string, string | number>): void {
    this.ev.push({ t: 'text', scr: 'rule', path, label, ins });
  }

  private vis(path: string, v: boolean): void {
    this.ev.push({ t: 'vis', scr: 'rule', path, v });
  }

  private play(path: string, tag: string, next?: string): void {
    this.ev.push({ t: 'play', scr: 'rule', path, tag, next });
  }

  private tex(path: string, key: string): void {
    this.ev.push({ t: 'tex', scr: 'rule', path, key });
  }

  private onCursor(i: number): void {
    this.play(RULE_SET(i), 'cursor');
    this.play(RULE_CURSOR(i), 'cursor');
    this.vis(RULE_PICT(i), true);
  }

  private offCursor(i: number): void {
    this.play(RULE_SET(i), 'normal');
    this.play(RULE_CURSOR(i), 'normal');
    this.vis(RULE_PICT(i), false);
  }

  private disable(i: number): void {
    this.play(RULE_SET(i), 'disable');
    this.play(RULE_CURSOR(i), 'disable');
    this.vis(RULE_PICT(i), false);
  }

  private hint(label: string): void {
    const m = this.msg;
    m.setMessageLabel(label);
    m.setOwner(-1);
    m.disablePadInput(true, false);
    m.setFlagForceAllDraw(true);
    if (!m.isWorking()) m.start();
    else m.requestNext(true);
  }

  private bonusLabel(): string {
    const b = this.value[1];
    if (b === 2) return 'mn01_bd_mw_detail_bonus01';
    if (b === 1) return this.value[0] === 4 ? 'mn01_bd_mw_detail_bonus02' : 'mn01_bd_mw_detail_bonus03';
    return 'mn01_bd_mw_detail_bonus00';
  }

  private rowLabel(row: number): string | null {
    switch (row) {
      case 0:
        return 'mn01_bd_mw_detail_turn';
      case 1:
        return this.value[1] >= 0 && this.value[1] <= 2 ? this.bonusLabel() : null;
      case 2:
        return this.value[2] === 1 ? 'mn01_bd_mw_detail_inst01' : this.value[2] === 0 ? 'mn01_bd_mw_detail_inst00' : null;
      case 3:
        return this.value[3] === 1 ? 'mn01_bd_mw_detail_gyro01' : this.value[3] === 0 ? 'mn01_bd_mw_detail_gyro00' : null;
      case 4:
        return this.value[4] === 1 ? 'mn01_bd_mw_detail_decide01' : this.value[4] === 0 ? 'mn01_bd_mw_detail_decide00' : null;
      default:
        return null;
    }
  }

  /** Cursor(행): 바뀌면 행·값 설명 메시지, 행 버튼 on/off */
  cursor(row: number): void {
    if (this.row !== row) {
      this.row = row;
      this.msg.setManualClose(true);
      const lab = this.rowLabel(row);
      if (row >= 0 && row <= 4) {
        if (lab) this.hint(lab);
      } else if (this.msg.isWorking()) this.msg.out();
    }
    for (let i = 0; i < 5; i++) {
      if (!this.rowOn[i]) continue;
      if (this.row === i) this.onCursor(i);
      else this.offCursor(i);
    }
  }

  private valuePict(i: number, changed: boolean, normal = 'normal', on = 'normal_on'): void {
    if (changed) this.play(RULE_PICT(i), on, normal);
    else this.play(RULE_PICT(i), normal);
  }

  private pick(i: number, v: number): number | null {
    const l = this.lists[i];
    if (l.length === 0) return null;
    return l.includes(v) ? v : l[0];
  }

  setTurn(v0: number): void {
    const v = this.pick(0, v0);
    if (v === null) return;
    this.text(YES_NO(RULE_CURSOR(0)), 'mn01_bd_ui_detail_choice_turn', { Number0: v >= 0 && v <= 5 ? TURN_VALUE[v] : 0 });
    this.text(`${RULE_PICT(0)}/x_text_turn`, 'mn01_bd_ui_detail_time_clock', { Number0: v >= 0 && v <= 5 ? RULE_MINUTES[v] : 0 });
    const ch = this.value[0] !== v;
    this.valuePict(0, ch);
    this.value[0] = v;
  }

  setBonus(v0: number): void {
    const v = this.pick(1, v0);
    if (v === null) return;
    const lab = v === 2 ? 'mn01_bd_ui_detail_choice_no' : v === 1 ? 'mn01_bd_ui_detail_choice_original' : v === 0 ? 'mn01_bd_ui_detail_choice_yes' : null;
    if (lab) this.text(YES_NO(RULE_CURSOR(1)), lab);
    const t4 = this.value[0] === 4;
    const pict = v === 2 ? '01' : v === 1 ? (t4 ? '02' : '03') : v === 0 ? (t4 ? '04' : '00') : null;
    if (pict) this.tex(`${RULE_PICT(1)}/x_pict_bonus`, `mn01_pict_bonus_${pict}^q`);
    const ch = this.value[1] !== v;
    this.valuePict(1, ch);
    this.value[1] = v;
    if (v === 1) this.cfg.saveFlags.add(0x3b);
    this.vis(RULE_NEW(1), this.cfg.boardMode === 0 && this.cfg.gameFlag22 && !this.cfg.saveFlags.has(0x3b));
  }

  setInst(v0: number): void {
    const v = this.pick(2, v0);
    if (v === null) return;
    this.text(YES_NO(RULE_CURSOR(2)), v === 1 ? 'mn01_bd_ui_detail_choice_no' : 'mn01_bd_ui_detail_choice_yes');
    this.tex(`${RULE_PICT(2)}/x_pict`, v === 1 ? 'mn01_pict_mginfo_01^q' : 'mn01_pict_mginfo_00^q');
    const ch = this.value[2] !== v;
    this.valuePict(2, ch, 'normal_00', 'normal_on_00');
    this.value[2] = v;
  }

  setGyro(v0: number): void {
    const v = this.pick(3, v0);
    if (v === null) return;
    this.text(YES_NO(RULE_CURSOR(3)), v === 1 ? 'mn01_bd_ui_detail_choice_no' : 'mn01_bd_ui_detail_choice_yes');
    this.tex(`${RULE_PICT(3)}/x_pict_joycon`, v === 1 ? 'mn01_pict_joycon_02^q' : 'mn01_pict_joycon_01^q');
    const ch = this.value[3] !== v;
    this.valuePict(3, ch);
    this.value[3] = v;
  }

  setChoice(v0: number): void {
    const v = this.pick(4, v0);
    if (v === null) return;
    this.text(YES_NO(RULE_CURSOR(4)), v === 1 ? 'mn01_bd_ui_detail_choice_vote' : 'mn01_bd_ui_detail_choice_random');
    this.tex(`${RULE_PICT(4)}/x_pict`, v === 1 ? 'mn01_pict_mg_01^q' : 'mn01_pict_mg_00^q');
    const ch = this.value[4] !== v;
    this.valuePict(4, ch);
    this.value[4] = v;
    if (v === 1) this.cfg.saveFlags.add(0x3c);
    this.vis(RULE_NEW(4), this.cfg.boardMode === 0 && this.cfg.gameFlag20 && !this.cfg.saveFlags.has(0x3c));
  }

  /** Start(BoardMode) */
  start(mode: 0 | 1): void {
    const c = this.cfg;
    this.result = -1;
    this.mode = mode;
    if (mode === 1) {
      this.lists[0] = [5];
      this.lists[1] = [0];
      this.lists[2] = [0, 1];
      this.lists[3] = [0, 1];
      this.lists[4] = [1];
    } else {
      this.lists[0] = [0, 1, 2, 3, 4];
      this.lists[1] = c.gameFlag22 ? [0, 1, 2] : [0, 2];
      this.lists[2] = [0, 1];
      this.lists[3] = [0, 1];
      this.lists[4] = c.gameFlag20 ? [0, 1] : [0];
    }
    this.play('x_parts_win', c.gameFlag20 && mode === 0 ? 'normal_5' : 'normal_4');
    for (let i = 0; i < 5; i++) {
      this.rowOn[i] = this.lists[i].length > 1;
      if (this.rowOn[i]) this.offCursor(i);
      else this.disable(i);
    }
    this.setTurn(turnIndex(c.turnMax));
    this.setBonus(c.bonusType >= 0 && c.bonusType <= 2 ? BONUS_INDEX[c.bonusType] : -1);
    this.setInst(c.flag4 ? 0 : 1);
    this.setGyro(c.flag6 ? 0 : 1);
    this.setChoice(c.flag7 ? 1 : 0);
    this.cursor(-1);
    this.guideOn = false;
    this.life.startIn();
  }

  private firstRow(): number {
    for (let i = 0; i < 4; i++) if (this.rowOn[i]) return i;
    return -1;
  }

  private moveRow(dir: 1 | -1): boolean {
    const ks = dir > 0 ? [1, 2, 3, 4] : [4, 3, 2, 1];
    for (const k of ks) {
      const r = (this.row + k) % 5;
      if (this.rowOn[r]) {
        this.cursor(r);
        return true;
      }
    }
    return false;
  }

  /** Update: phase 0 끝 → 첫 행 Cursor·normal; 대기 중 다섯 행 커서 애니가 끝나 있으면 UpdateProcess */
  update(io: PIO): void {
    if (this.life.phase === 0 && io.done('rule', '')) {
      this.row = -1;
      const f = this.firstRow();
      if (f >= 0) this.cursor(f);
    }
    this.life.update(io);
    if (!this.guideOn && this.life.phase >= 0) {
      this.guideOn = true;
      this.ev.push({ t: 'guide', scr: 'rule', label: 'mn01_bd_ctrl_detail_end' });
    }
    if (this.life.phase !== 1) return;
    for (let i = 0; i < 5; i++) if (!io.done('rule', RULE_CURSOR(i))) return;
    if (io.trig & 0x2) {
      this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL' });
      this.result = 1;
      this.finish();
      return;
    }
    this.updateSet(io);
  }

  private updateSet(io: PIO): void {
    const row = this.row;
    if (row < 0 || row > 4) return;
    if (!this.rowOn[row]) {
      this.moveRow(1);
      return;
    }
    const r = io.rep | io.trig;
    if (r & upMask(io.hold) || r & downMask(io.hold)) {
      if (this.moveRow(r & upMask(io.hold) ? -1 : 1)) {
        this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR', scr: 'rule', path: RULE_CURSOR(this.row) });
        this.ev.push({ t: 'vib', name: 'bv_vib_sys_cursor' });
      }
      return;
    }
    const l = this.lists[row];
    if (l.length === 0) return;
    let k = Math.max(0, l.indexOf(this.value[row]));
    const n = l.length;
    if (io.trig & 0x10100) k = (n + k - 1) % n;
    if (io.trig & 0x40200) k = (k + 1) % n;
    if (l[k] === this.value[row]) return;
    this.ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR_S', scr: 'rule', path: RULE_CURSOR(row) });
    this.ev.push({ t: 'vib', name: 'bv_vib_sys_cursor' });
    switch (row) {
      case 0:
        this.setTurn(l[k]);
        this.setBonus(this.value[1]);
        break;
      case 1:
        this.setBonus(l[k]);
        break;
      case 2:
        this.setInst(l[k]);
        break;
      case 3:
        this.setGyro(l[k]);
        break;
      default:
        this.setChoice(l[k]);
    }
    this.play(RULE_SET(row), 'press');
    this.play(RULE_CURSOR(row), 'press');
    if (row !== 0) {
      const lab = this.rowLabel(row);
      if (lab) {
        this.hint(lab);
        this.msg.setManualClose(true);
      }
    }
  }

  /** Finish: 값 저장 → Out */
  finish(): void {
    const c = this.cfg;
    const t = this.value[0];
    c.turnMax = t >= 0 && t <= 5 ? TURN_VALUE[t] : 0;
    const b = this.value[1];
    c.bonusType = b >= 0 && b <= 2 ? BONUS_TYPE[b] : 0;
    c.flag4 = this.value[2] === 0;
    c.flag6 = this.value[3] === 0;
    c.flag7 = this.value[4] === 1;
    c.menuInst = this.value[2] === 0;
    c.menuGyro = this.value[3] === 0;
    this.life.out(false);
  }
}
