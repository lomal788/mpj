/**
 * 멤버 설정 판 — menu01::ComUiBdSettingMember (ctor @0x7100073f70, Start @0x710007ca30, UpdateCursor @0x71000750d0, Cursor @0x7100077984,
 * ComLevelImpl @0x7100077d10, ComSpeedImpl @0x710007aa60, HandicapImpl @0x710007b660, ComCharacterImpl @0x7100075de0 일부). 근거: docs/shell/partyrule.md 4.2·5.2·6.1.
 * 순수: 입력·애니 끝 조회(PIO) → 그리기 사건(PEvent)·메시지 창 호출·설정값(PartyRuleConfig) 변경.
 */
import { FiberRunner, type FiberHandle, type Flow } from '@app/common/ui/fiber';
import { PanelLife } from './panel';
import { BIT, COM_LEVEL_LABEL, downMask, leftMask, listAnim, MEMBER_ROW, MEMBER_ROW_LABEL, rightMask, SPEED_LABEL, upMask } from './tables';
import type { PartyMsg, PartyRuleConfig, PIO, PSink } from './types';

const LIST = 'x_parts_list';
const LV = (i: number): string => `${LIST}/x_btn_level/x_parts_0${i}`;
const SP = (i: number): string => `${LIST}/x_btn_speed/x_parts_0${i}`;
const HD = (i: number): string => `${LIST}/x_btn_handicap/x_parts_0${i}`;
const PC = (i: number): string => `${LIST}/x_btn_cpu/x_pc_0${i}`;

export class MemberPanel {
  readonly life: PanelLife;
  closing = false;
  readonly rowOn = [false, false, false, false];
  row = -1;
  rowCount = 0;
  comCount = 0;
  readonly isCom = [false, false, false, false];
  charaCursor = 0;
  levelMerge = 4;
  readonly level = [0, 0, 0, 0];
  levelCursor = 0;
  fast = false;
  readonly handicap = [0, 0, 0, 0];
  handiCursor = 0;
  rowLabel: string[] = [...MEMBER_ROW_LABEL];
  private readonly fibers = new FiberRunner();
  private fiber: FiberHandle<void> | null = null;
  private io: PIO = { trig: 0, rep: 0, hold: 0, done: () => true };
  private guideLabel: string | null = null;

  constructor(
    private readonly ev: PSink,
    private readonly msg: PartyMsg,
    private readonly cfg: PartyRuleConfig,
  ) {
    this.life = new PanelLife('member', ev, msg);
    this.construct();
  }

  private play(path: string, tag: string, next?: string): void {
    this.ev.push({ t: 'play', scr: 'member', path, tag, next });
  }

  private vis(path: string, v: boolean): void {
    this.ev.push({ t: 'vis', scr: 'member', path, v });
  }

  private text(path: string, label: string, ins?: Record<string, string | number>): void {
    this.ev.push({ t: 'text', scr: 'member', path, label, ins });
  }

  private se(label: string, path?: string): void {
    this.ev.push({ t: 'se', label, scr: path ? 'member' : undefined, path });
  }

  private guide(label: string): void {
    if (this.guideLabel === label) return;
    this.guideLabel = label;
    this.ev.push({ t: 'guide', scr: 'member', label });
  }

  /** 생성자: 행 제목·CPU 글자·개별 설정/없음 글자, 버튼·칸 애니 초기화, 숨김 */
  private construct(): void {
    this.text(`${LIST}/x_btn_cpu/x_text_title`, 'mn01_bd_ui_member_title_chara');
    this.text(`${LIST}/x_btn_level/x_text_title`, 'mn01_bd_ui_member_title_level');
    this.text(`${LIST}/x_btn_speed/x_text_title`, 'mn01_bd_ui_member_title_speed');
    this.text(`${LIST}/x_btn_handicap/x_text_title`, 'mn01_bd_ui_member_title_handi');
    for (let i = 0; i < 4; i++) {
      this.text(`${PC(i)}/x_text_CPU`, 'mn01_mode_ui_member_CPU');
      this.text(`${PC(i)}/x_text_CPU_shadow`, 'mn01_mode_ui_member_CPU');
    }
    this.text(`${LV(4)}/x_text_speed`, 'mn01_bd_ui_member_level_each');
    this.text(`${LV(5)}/x_text_speed`, 'mn01_bd_ui_member_level_each');
    this.text(`${HD(4)}/x_text_speed`, 'mn01_bd_ui_member_handi_off');
    this.vis(`${HD(4)}/null_handicap`, false);
    this.vis(`${HD(4)}/null_speed`, true);
    for (const r of MEMBER_ROW) this.play(r, 'normal_00');
    for (let i = 0; i < 4; i++) this.play(PC(i), 'normal_00');
    for (const g of [LV, SP, HD]) for (let i = 0; i < 6; i++) this.play(g(i), 'normal');
    for (const g of [LV, SP, HD]) for (let i = 0; i < 6; i++) this.play(`${g(i)}/x_parts_cursor`, 'normal');
    this.ev.push({ t: 'show', scr: 'member', v: false });
  }

  /** Start(Setting): 바이트 0..3 = 멤버·난이도·속도·핸디캡 행 사용 */
  start(flags: number): void {
    this.closing = false;
    for (let r = 0; r < 4; r++) this.rowOn[r] = !!((flags >> (8 * r)) & 1);
    this.comCount = 0;
    this.cfg.players.forEach((p, i) => {
      this.isCom[i] = p.com;
      if (p.com) this.comCount++;
    });
    this.setupWindowSize();
    this.setupMember();
    this.setupComLevel();
    this.setupComSpeed();
    this.setupHandicap();
    const first = this.rowOn.indexOf(true);
    if (first >= 0) this.cursor(first, true);
    this.life.startIn();
    this.guideLabel = null;
  }

  private setupWindowSize(): void {
    this.rowCount = 1 + (this.rowOn[1] ? 1 : 0) + (this.rowOn[2] ? 1 : 0) + (this.rowOn[3] ? 1 : 0);
    this.play(LIST, listAnim(this.rowCount));
    this.vis(`${LIST}/x_alignment_list`, this.rowCount > 1);
    this.vis(MEMBER_ROW[1], this.rowOn[1]);
    this.vis(MEMBER_ROW[2], this.rowOn[2]);
    this.vis(MEMBER_ROW[3], this.rowOn[3]);
    this.ev.push({ t: 'align', scr: 'member', path: `${LIST}/x_alignment_list` });
  }

  private setupMember(): void {
    if (this.rowOn[0]) this.play(MEMBER_ROW[0], 'normal_00');
    this.play(MEMBER_ROW[0], 'disable');
    this.vis(`${LIST}/x_btn_cpu/x_text_title`, this.rowOn[0]);
    this.cfg.players.forEach((p, i) => this.ev.push({ t: 'face', scr: 'member', path: `${PC(i)}/x_parts_face`, chara: p.chara }));
    for (let i = 0; i < 4; i++) this.vis(`${PC(i)}/x_cpu`, this.isCom[i]);
    for (let i = 0; i < 4; i++) this.play(PC(i), 'normal_00');
  }

  private setComLevel(i: number, lv: number): void {
    if (lv >= 0 && lv <= 3) {
      this.text(`${LV(i)}/x_text_personal`, 'mn01_bd_ui_member_level_personal', { Text0: COM_LEVEL_LABEL[lv] });
      this.ev.push({ t: 'iconRow', scr: 'member', path: `${LV(i)}/x_icon_level`, row: lv });
    } else this.text(`${LV(i)}/x_text_personal`, 'mn01_bd_ui_member_level_personal');
  }

  private setComLevelMerge(lv: number): void {
    const each = lv === 4;
    for (const k of [4, 5]) {
      this.vis(`${LV(k)}/null_level`, !each);
      this.vis(`${LV(k)}/null_speed`, each);
    }
    if (each) return;
    for (const k of [4, 5]) {
      if (lv >= 0 && lv <= 3) {
        this.text(`${LV(k)}/x_text_personal`, 'mn01_bd_ui_member_level_personal', { Text0: COM_LEVEL_LABEL[lv] });
        this.ev.push({ t: 'iconRow', scr: 'member', path: `${LV(k)}/x_icon_level`, row: lv });
      } else this.text(`${LV(k)}/x_text_personal`, 'mn01_bd_ui_member_level_personal');
    }
  }

  /** 합친 칸 배치(MergeComLevel·SetupComLevel 의 보임 규칙, 6.1) */
  private mergeVisible(merged: boolean): void {
    this.vis(LV(0), true);
    if (merged) {
      this.vis(LV(1), this.comCount < 3);
      this.vis(LV(2), this.comCount < 2);
      this.vis(LV(3), this.comCount === 1);
      this.vis(LV(4), this.comCount === 2);
      this.vis(LV(5), this.comCount === 3);
    } else {
      for (const i of [1, 2, 3]) this.vis(LV(i), true);
      this.vis(LV(4), false);
      this.vis(LV(5), false);
    }
  }

  private personalAnims(cursorIdx: number | null): void {
    for (let i = 0; i < 4; i++) {
      if (!this.isCom[i]) this.play(LV(i), 'noset');
      else this.play(LV(i), cursorIdx === i ? 'cursor' : 'normal');
    }
  }

  private setupComLevel(): void {
    if (!this.rowOn[1]) return;
    this.vis(MEMBER_ROW[1], true);
    this.play(MEMBER_ROW[1], 'normal_00');
    let merge = -1;
    this.cfg.players.forEach((p, i) => {
      this.level[i] = p.level;
      if (p.com) {
        this.play(LV(i), 'normal');
        this.setComLevel(i, p.level);
        merge = merge < 0 ? p.level : merge !== p.level ? 4 : merge;
      } else this.play(LV(i), 'noset');
    });
    if (merge >= 0 && merge < 4 && this.comCount > 1) {
      this.mergeVisible(true);
      this.levelMerge = merge;
      this.setComLevelMerge(merge);
    } else {
      this.mergeVisible(false);
      this.levelMerge = 4;
    }
    this.personalAnims(null);
    this.play(LV(4), 'normal');
    this.play(LV(5), 'normal');
  }

  private setComSpeed(): void {
    const ins = { Text0: this.fast ? SPEED_LABEL.quick : SPEED_LABEL.normal };
    this.text(`${SP(3)}/x_text_speed`, 'mn01_bd_ui_member_speed_personal', ins);
    this.text(`${SP(4)}/x_text_speed`, 'mn01_bd_ui_member_speed_all', ins);
    this.text(`${SP(5)}/x_text_speed`, 'mn01_bd_ui_member_speed_all', ins);
  }

  private setupComSpeed(): void {
    if (!this.rowOn[1]) return;
    this.vis(SP(0), true);
    this.vis(SP(1), this.comCount < 3);
    this.vis(SP(2), this.comCount < 2);
    this.vis(SP(3), this.comCount === 1);
    this.vis(SP(4), this.comCount === 2);
    this.vis(SP(5), this.comCount === 3);
    for (const i of [0, 1, 2]) this.play(SP(i), 'noset');
    for (const i of [3, 4, 5]) this.play(SP(i), 'normal');
    this.fast = this.cfg.flag8;
    this.setComSpeed();
  }

  private setHandicapValue(i: number): void {
    this.text(`${HD(i)}/x_text_handicap`, 'mn01_bd_ui_member_handi', { Number0: this.handicap[i] });
  }

  private setupHandicap(): void {
    if (!this.rowOn[3]) return;
    let any = false;
    this.cfg.players.forEach((p, i) => {
      this.handicap[i] = p.handicap;
      if (p.handicap > 0) any = true;
      this.setHandicapValue(i);
      this.play(HD(i), 'normal');
    });
    for (let i = 0; i < 4; i++) this.vis(HD(i), any);
    this.vis(HD(4), !any);
  }

  /** Cursor(행, 즉시) — 행이 바뀌면 메시지 창에 행 설명 */
  cursor(row: number, imm: boolean): void {
    if (this.row !== row) {
      this.row = row;
      if (row !== -1) {
        this.msg.setMessageLabel(this.rowLabel[row]);
        this.msg.setOwner(-1);
        this.msg.disablePadInput(true, false);
        this.msg.setFlagForceAllDraw(true);
        this.msg.setManualClose(true);
        if (!this.msg.isWorking()) this.msg.start();
        else this.msg.requestNext(true);
      } else if (this.msg.isWorking()) this.msg.out();
    }
    for (let r = 0; r < 4; r++) {
      if (!this.rowOn[r]) continue;
      const on = this.row === r;
      if (imm) this.play(MEMBER_ROW[r], on ? 'cursor' : 'normal_00');
      else this.play(MEMBER_ROW[r], on ? 'on' : 'off_01', on ? 'cursor' : 'normal_00');
    }
  }

  private nextRow(dir: 1 | -1): number {
    for (const k of dir > 0 ? [1, 2, 3] : [3, 2, 1]) {
      const r = (this.row + k) % 4;
      if (this.rowOn[r]) return r;
    }
    return -1;
  }

  private btnDone(r: number): boolean {
    return this.io.done('member', MEMBER_ROW[r]);
  }

  get busy(): boolean {
    return !!this.fiber && !this.fiber.done;
  }

  /** Update + UpdateCursor(파이버는 UpdateCursor 앞에서 한 걸음 [설계]) */
  update(io: PIO): void {
    this.io = io;
    this.life.update(io);
    this.fibers.step();
    if (this.life.phase !== 1 || this.busy) return;
    if (this.closing) {
      if ([0, 1, 2, 3].every((r) => this.btnDone(r))) {
        this.cfg.players.forEach((p, i) => (this.cfg.menuLevel[i] = p.level));
        this.cfg.menuSpeed = this.cfg.flag8;
        this.life.out(false);
      }
      return;
    }
    if (this.row === -1) {
      const first = this.rowOn.indexOf(true);
      if (first >= 0) this.cursor(first, true);
    }
    this.guide('mn01_bd_ctrl_detail_end');
    const trig = io.trig;
    if (trig & BIT.B) {
      this.se('SQ_SE_SYS_CANCEL');
      this.closing = true;
    }
    if (trig & BIT.A && this.rowOn[this.row]) {
      this.se('SQ_SE_SYS_DECI');
      this.ev.push({ t: 'vib', name: 'bv_vib_sys_deci' });
      this.play(MEMBER_ROW[this.row], 'press', 'normal_01');
      const g = [() => this.comCharacterImpl(), () => this.comLevelImpl(), () => this.comSpeedImpl(), () => this.handicapImpl()][this.row];
      this.fiber = this.fibers.start(g());
      return;
    }
    const r = io.rep | trig;
    let to = -1;
    if (r & upMask(io.hold)) to = this.nextRow(-1);
    else if (r & downMask(io.hold)) to = this.nextRow(1);
    else return;
    if (to < 0) return;
    const was = this.row;
    this.cursor(to, to === was);
    if (to === was) return;
    this.se('SQ_SE_SYS_CURSOR', MEMBER_ROW[to]);
    this.ev.push({ t: 'vib', name: 'bv_vib_sys_cursor' });
  }

  private *waitBtn(r: number): Flow {
    while (!this.btnDone(r)) yield;
  }

  private beginEdit(r: number, label = 'sys_ctrl_back'): void {
    this.guideLabel = null;
    this.guide(label);
    for (let k = 0; k < 4; k++) if (k !== r) this.play(MEMBER_ROW[k], 'disable');
  }

  private *endEdit(r: number, setup: () => void): Flow {
    yield* this.waitBtn(r);
    setup();
    this.cursor(r, true);
    yield;
  }

  /** ComLevelImpl: 1단계 합친 칸(0..4, 4 = 개별) → 2단계 COM 칸별(0..3) */
  private *comLevelImpl(): Flow {
    yield* this.waitBtn(1);
    this.beginEdit(1);
    let go2 = this.levelMerge === 4;
    if (!go2) {
      this.mergeVisible(true);
      this.personalAnims(null);
      this.play(LV(4), 'cursor');
      this.play(LV(5), 'cursor');
      const start = this.levelMerge;
      for (;;) {
        const t = this.io.trig;
        if (t & BIT.B) {
          this.se('SQ_SE_SYS_CANCEL');
          this.levelMerge = start;
          yield* this.endEdit(1, () => this.setupComLevel());
          return;
        }
        if (t & BIT.A) {
          this.se('SQ_SE_SYS_DECI');
          this.ev.push({ t: 'vib', name: 'bv_vib_sys_deci' });
          if (this.levelMerge === 4) {
            yield;
            go2 = true;
            break;
          }
          this.play(MEMBER_ROW[1], 'press_01', 'cursor');
          for (const p of this.cfg.players) p.level = this.levelMerge;
          yield* this.endEdit(1, () => this.setupComLevel());
          return;
        }
        let v = this.levelMerge;
        if (t & BIT.DOWN) v = (v + 4) % 5;
        if (t & BIT.UP) v = (v + 1) % 5;
        if (v !== this.levelMerge) {
          this.levelMerge = v;
          if (this.comCount === 2) this.se('SQ_SE_SYS_CURSOR_S', LV(4));
          if (this.comCount === 3) this.se('SQ_SE_SYS_CURSOR_S', LV(5));
          this.ev.push({ t: 'vib', name: 'bv_vib_sys_cursor' });
          this.setComLevelMerge(v);
          this.play(LV(4), 'move', 'cursor');
          this.play(LV(5), 'move', 'cursor');
        }
        yield;
      }
    }
    if (!go2) return;
    this.mergeVisible(false);
    this.levelCursor = Math.max(0, this.isCom.indexOf(true));
    this.personalAnims(this.levelCursor);
    this.play(LV(4), 'normal');
    this.play(LV(5), 'normal');
    for (;;) {
      const t = this.io.trig;
      if (t & BIT.B) {
        this.se('SQ_SE_SYS_CANCEL');
        break;
      }
      if (t & BIT.A) {
        this.se('SQ_SE_SYS_DECI');
        this.ev.push({ t: 'vib', name: 'bv_vib_sys_deci' });
        this.play(MEMBER_ROW[1], 'press_01', 'cursor');
        this.cfg.players.forEach((p, i) => {
          if (this.isCom[i]) p.level = this.level[i];
        });
        break;
      }
      const rr = this.io.rep | t;
      const cur = this.levelCursor;
      let to = cur;
      const ks = rr & leftMask(this.io.hold) ? [3, 2, 1, 0] : rr & rightMask(this.io.hold) ? [1, 2, 3, 4] : [];
      for (const k of ks) {
        const c = (cur + k) % 4;
        if (this.isCom[c]) {
          to = c;
          break;
        }
      }
      if (to !== cur) {
        this.levelCursor = to;
        this.se('SQ_SE_SYS_CURSOR', LV(to));
        this.ev.push({ t: 'vib', name: 'bv_vib_sys_cursor' });
        this.personalAnims(to);
      }
      const v0 = this.level[this.levelCursor];
      let v = v0;
      if (t & BIT.DOWN) v = (v + 3) % 4;
      if (t & BIT.UP) v = (v + 1) % 4;
      if (v !== v0) {
        this.se('SQ_SE_SYS_CURSOR_S', LV(this.levelCursor));
        this.ev.push({ t: 'vib', name: 'bv_vib_sys_cursor' });
        this.level[this.levelCursor] = v;
        this.setComLevel(this.levelCursor, v);
        this.play(LV(this.levelCursor), 'move', 'cursor');
      }
      yield;
    }
    yield* this.endEdit(1, () => this.setupComLevel());
  }

  /** ComSpeedImpl: 위/아래로 보통↔빠름, A = flag 8 */
  private *comSpeedImpl(): Flow {
    yield* this.waitBtn(2);
    this.beginEdit(2);
    for (const i of [3, 4, 5]) this.play(SP(i), 'cursor');
    for (;;) {
      const t = this.io.trig;
      if (t & BIT.B) {
        this.se('SQ_SE_SYS_CANCEL');
        break;
      }
      if (t & BIT.A) {
        this.se('SQ_SE_SYS_DECI');
        this.ev.push({ t: 'vib', name: 'bv_vib_sys_deci' });
        if (this.rowOn[2]) this.play(MEMBER_ROW[2], 'press_01', 'cursor');
        this.cfg.flag8 = this.fast;
        break;
      }
      if (t & BIT.VERT) {
        this.fast = !this.fast;
        if (this.comCount >= 1 && this.comCount <= 3) {
          this.se('SQ_SE_SYS_CURSOR_S', SP(this.comCount + 2));
          this.ev.push({ t: 'vib', name: 'bv_vib_sys_cursor' });
        }
        this.setComSpeed();
        for (const i of [3, 4, 5]) this.play(SP(i), 'move', 'cursor');
      }
      yield;
    }
    yield* this.endEdit(2, () => this.setupComSpeed());
  }

  /** HandicapImpl: 칸(플레이어) 좌우, 값 위/아래 0..5 순환, A = SetBoardHandicap */
  private *handicapImpl(): Flow {
    yield* this.waitBtn(3);
    this.beginEdit(3);
    for (let i = 0; i < 4; i++) this.vis(HD(i), true);
    this.vis(HD(4), false);
    this.handiCursor = 0;
    for (let i = 0; i < 4; i++) this.play(HD(i), i === this.handiCursor ? 'cursor' : 'normal');
    for (;;) {
      const t = this.io.trig;
      if (t & BIT.B) {
        this.se('SQ_SE_SYS_CANCEL');
        break;
      }
      if (t & BIT.A) {
        this.se('SQ_SE_SYS_DECI');
        this.ev.push({ t: 'vib', name: 'bv_vib_sys_deci' });
        if (this.rowOn[3]) this.play(MEMBER_ROW[3], 'press_01', 'cursor');
        this.cfg.players.forEach((p, i) => (p.handicap = this.handicap[i]));
        break;
      }
      const rr = this.io.rep | t;
      const cur = this.handiCursor;
      let to = cur;
      if (rr & leftMask(this.io.hold)) to = (cur + 3) % 4;
      else if (rr & rightMask(this.io.hold)) to = (cur + 1) % 4;
      to = Math.min(3, Math.max(0, to));
      if (to !== cur) {
        this.handiCursor = to;
        this.se('SQ_SE_SYS_CURSOR', HD(to));
        this.ev.push({ t: 'vib', name: 'bv_vib_sys_cursor' });
        for (let i = 0; i < 4; i++) this.play(HD(i), i === to ? 'cursor' : 'normal');
      }
      const v0 = this.handicap[this.handiCursor];
      let v = v0;
      if (t & BIT.DOWN) v = (v + 5) % 6;
      if (t & BIT.UP) v = (v + 1) % 6;
      if (v !== v0) {
        this.se('SQ_SE_SYS_CURSOR_S', HD(this.handiCursor));
        this.ev.push({ t: 'vib', name: 'bv_vib_sys_cursor' });
        this.handicap[this.handiCursor] = v;
        this.setHandicapValue(this.handiCursor);
        this.play(HD(this.handiCursor), 'move', 'cursor');
      }
      yield;
    }
    yield* this.endEdit(3, () => this.setupHandicap());
  }

  /** ComCharacterImpl 일부: COM 얼굴 칸 이동·B. A(캐릭터 고르기 판)·X(무작위)는 범위 밖 → 사건만 [설계 9.3] */
  private *comCharacterImpl(): Flow {
    yield* this.waitBtn(0);
    this.play(LIST, 'normal_03');
    this.vis(`${LIST}/x_alignment_list`, false);
    this.beginEdit(0, 'mn01_bd_ui_member_chara_random');
    this.charaCursor = Math.max(0, this.isCom.indexOf(true));
    const anims = (): void => {
      for (let i = 0; i < 4; i++) this.play(PC(i), !this.isCom[i] ? 'disable' : i === this.charaCursor ? 'cursor' : 'normal_00');
    };
    anims();
    this.msg.setMessageLabel('mn01_bd_mw_member_chara_select00');
    this.msg.setOwner(-1);
    this.msg.disablePadInput(true, false);
    this.msg.setFlagForceAllDraw(true);
    this.msg.setManualClose(true);
    if (!this.msg.isWorking()) this.msg.start();
    else this.msg.requestNext(true);
    this.row = -2;
    for (;;) {
      const t = this.io.trig;
      if (t & BIT.B) {
        this.se('SQ_SE_SYS_CANCEL');
        break;
      }
      if (t & BIT.A) this.ev.push({ t: 'note', text: `캐릭터 고르기 판(ComUiSelectPlayerCharacter) — 범위 밖, ${this.charaCursor + 1}P` });
      if (t & BIT.X) this.ev.push({ t: 'note', text: 'RandomComCharacter — 범위 밖' });
      const rr = this.io.rep | t;
      const cur = this.charaCursor;
      let to = cur;
      const ks = rr & leftMask(this.io.hold) ? [3, 2, 1] : rr & rightMask(this.io.hold) ? [1, 2, 3] : [];
      for (const k of ks) {
        const c = (cur + k) % 4;
        if (this.isCom[c]) {
          to = c;
          break;
        }
      }
      if (to !== cur) {
        this.charaCursor = to;
        this.se('SQ_SE_SYS_CURSOR', PC(to));
        this.ev.push({ t: 'vib', name: 'bv_vib_sys_cursor' });
        anims();
      }
      yield;
    }
    this.play(LIST, listAnim(this.rowCount));
    this.vis(`${LIST}/x_alignment_list`, this.rowCount > 1);
    this.setupMember();
    yield;
    this.row = -1;
    this.cursor(0, true);
  }
}
