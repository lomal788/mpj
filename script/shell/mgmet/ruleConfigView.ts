/**
 * 규칙 설정 화면 — RuleConfigState 사건을 공용 창(MgmWindow, mgmet_base_rule_00 + 열 부품 mgmet_rule_option_00/01/02·mgmet_btn_play_00)에 옮긴다.
 * 열 배치 = Alignment 계산(alignment.ts, ui2d_alignment.md 6.4), 배경 = SetupBaseBg(mgmet_ruleconfig.md 6.3), 글자·아이콘 = 7.2. 근거·[추정]: mgmet_ruleconfig.md 9.1.
 */
import { alignPanes } from '../mgmcommon/alignment';
import { paneGlobal } from '../mgmcommon/itemLayout';
import type { MgmSound } from '../mgmcommon/sound';
import { MgmWindow, type MgmDrawHost } from '../mgmcommon/window';
import { RuleConfigState, type RuleConfigInfo, type RuleEvent, type RuleUpdate } from './ruleConfig';
import {
  BASE_BG_WIDE_X,
  COL,
  COL_PANES,
  COL_TITLE,
  CPU_LEVELS,
  EXPERIENCE_LABELS,
  EXPLAIN_LABELS,
  OPTION01_ALL,
  OPTION01_CONTENT,
  ROUND_VALUES,
  RULE_ALIGNMENT,
  STAR_VALUES,
  VS_TABLE,
} from './tables';

export class RuleConfigView {
  readonly state = new RuleConfigState();
  readonly win: MgmWindow;
  private alignDirty = false;
  /** VS 슬롯 표시용 플레이어 order → 종류(0 사람, 1 COM) */
  playerTypes: number[] = [0, 1, 1, 1];

  constructor(
    host: MgmDrawHost,
    private readonly sound?: MgmSound,
    private readonly operator: () => number = () => 0,
  ) {
    this.win = new MgmWindow(host, 'mgmet_base_rule_00');
    this.win.setText(`${COL_PANES[COL.PLAY]}/x_text_00`, 'mgmet_rule_ui_play');
    this.state.activate(false);
    this.apply();
  }

  private colPart(col: number) {
    return this.win.inst.part(COL_PANES[col]);
  }

  private setTitle(col: number): void {
    const t = COL_TITLE[col];
    if (!t) return;
    this.win.setText(`${COL_PANES[col]}/${t[0]}`, t[1]);
    const content = OPTION01_CONTENT[col];
    if (content) {
      for (const n of OPTION01_ALL) this.win.inst.setVisible(`${COL_PANES[col]}/${n}`, n === content);
      this.win.inst.setVisible(`${COL_PANES[col]}/x_bd_00`, col !== COL.CPU);
      this.win.inst.setVisible(`${COL_PANES[col]}/x_bd_01`, col === COL.CPU);
    }
  }

  private setBody(col: number, index: number, left: boolean, right: boolean): void {
    const p = COL_PANES[col];
    switch (col) {
      case COL.VS: {
        const perm = VS_TABLE[index] ?? VS_TABLE[0];
        perm.forEach((order, slot) => {
          const type = this.playerTypes[order] ?? 0;
          this.win.setText(`${p}/x_text_face_0${slot}`, type === 1 ? 'mgmet_rule_ui_teamCpu' : `mgmet_rule_ui_teamP${order + 1}`);
        });
        break;
      }
      case COL.ROUND:
        this.win.setText(`${p}/x_text_round_00`, 'mgmet_rule_ui_round00', { Number0: ROUND_VALUES[index] ?? 0 });
        break;
      case COL.STAR:
        this.win.setText(`${p}/x_text_win_00`, 'mgmet_rule_ui_round00', { Number0: STAR_VALUES[index] ?? 0 });
        break;
      case COL.CPU:
        this.win.setText(`${p}/x_text_cpu_01`, 'mgmet_rule_ui_cpulevel00', { Text0: CPU_LEVELS[index] ?? CPU_LEVELS[0] });
        this.win.inst.setMatSrtT(`${p}/x_icon_cpu`, 0, index * 0.25);
        break;
      case COL.EXPLAIN:
        this.win.setText(`${p}/x_text_explain_01`, EXPLAIN_LABELS[index] ?? EXPLAIN_LABELS[0]);
        this.win.inst.setMatSrtT(`${p}/x_icon_explain`, 0, index * 0.25);
        break;
      case COL.EXPERIENCE:
        this.win.setText(`${p}/x_text_mg_02`, EXPERIENCE_LABELS[index] ?? EXPERIENCE_LABELS[0]);
        this.win.inst.setVisible(`${p}/x_controller_00`, index === 1);
        this.win.inst.setVisible(`${p}/x_controller_01`, index === 0);
        break;
    }
    this.win.inst.part(`${p}/x_cursor_00`)?.play('normal');
    this.win.inst.setVisible(`${p}/x_cursor_00/right`, right);
    this.win.inst.setVisible(`${p}/x_cursor_00/left`, left);
  }

  private colX(col: number): number {
    const g = paneGlobal(this.win.inst, COL_PANES[col]);
    return g ? 960 + g.m[2] : 960;
  }

  private apply(): void {
    for (const e of this.state.drain()) this.applyOne(e);
  }

  private applyOne(e: RuleEvent): void {
    switch (e.t) {
      case 'activate':
        break;
      case 'visible':
        this.win.inst.setVisible(COL_PANES[e.col], e.v);
        break;
      case 'title':
        this.setTitle(e.col);
        break;
      case 'body':
        this.setBody(e.col, e.index, e.left, e.right);
        break;
      case 'lock': {
        const p = this.colPart(e.col);
        p?.play('lock');
        this.win.inst.setVisible(`${COL_PANES[e.col]}/x_gray_01`, false);
        break;
      }
      case 'anim': {
        const p = this.colPart(e.col);
        if (!p || !p.hasAnim(e.anim)) break;
        p.play(e.anim);
        if (e.imm) p.update(p.spec.anims[e.anim].len);
        break;
      }
      case 'se':
        this.sound?.playSe2D(e.label, this.colX(e.col));
        break;
      case 'vib':
        this.sound?.vibrate(this.operator(), 'rule');
        break;
      case 'align':
        this.alignDirty = true;
        break;
      case 'in':
        this.win.in(false);
        break;
      case 'out':
        this.win.out(false);
        break;
    }
  }

  setupMgm(cfg: RuleConfigInfo): void {
    this.state.setupMgm(cfg);
    this.apply();
    this.layoutNow();
  }

  in(): void {
    this.state.in();
    this.apply();
  }

  out(): void {
    this.state.out();
    this.apply();
  }

  update(trig: number, rep: number): RuleUpdate {
    this.setupBaseBg();
    const r = this.state.update(trig, rep);
    this.apply();
    return r;
  }

  getResult(): RuleConfigInfo {
    return this.state.getResult();
  }

  /** 다음 UI 갱신에서 dirty Alignment 를 소비(ui2d_alignment.md 5절) */
  private layoutNow(): void {
    if (!this.alignDirty) return;
    this.alignDirty = false;
    alignPanes(this.win.inst, 'A_alignment_00', RULE_ALIGNMENT);
  }

  /** Impl::SetupBaseBg mgmet @0x71000810c8: null_01 = P + A − C (N < 5), 아니면 (−850, 0) */
  setupBaseBg(): void {
    const inst = this.win.inst;
    const cfg = this.state.config;
    const node = (path: string) => {
      const f = inst.find(path);
      return f ? f[0].nodes[f[1]] : null;
    };
    const w0 = node(`${COL_PANES[COL.EXPERIENCE]}/x_bd_00`)?.z[0] ?? 0;
    let n = 0;
    let p = 0;
    let c = 0;
    const order: [number, number][] = [
      [COL.EXPERIENCE, cfg.displayExperience],
      [COL.EXPLAIN, cfg.displayExplain],
      [COL.CPU, cfg.displayCpu],
      [COL.ROUND, cfg.displayRound],
      [COL.STAR, cfg.displayStar],
      [COL.VS, cfg.displayVs],
    ];
    for (const [col, d] of order) {
      if (!d) continue;
      n++;
      p = node(COL_PANES[col])?.t[0] ?? 0;
      const wl = node(`${COL_PANES[col]}/${col === COL.CPU ? 'x_bd_01' : 'x_bd_00'}`)?.z[0] ?? w0;
      c = (wl - w0) / 2;
    }
    const a = node('A_alignment_00')?.t[0] ?? 0;
    const bg = node('null_01');
    if (bg) bg.t[0] = n < 5 ? p + a - c : BASE_BG_WIDE_X;
  }

  tick(): void {
    this.layoutNow();
    this.win.update();
  }

  draw(): void {
    this.win.draw();
  }
}
