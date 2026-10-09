/**
 * 규칙 설정 순수 상태 — mgmet::RuleConfigView Impl(+0x68 ConfigInfo·+0x98 현재 열·+0x9c 첫 열·+0xa0 In)·ButtonBase(+0x38 index·+0x3c viewOnly),
 * SetupMgm·Update·PlayMove·GetResult·LoadWorkData, 프리 플레이 commit(Mgm01SetRuleFlow 후처리). 근거: docs/shell/mgmet_ruleconfig.md 4~8·9.1.
 * 입력 {trig, rep} → 결과 0~4 + 그리기 사건(drain). 레이아웃에는 손대지 않는다(ruleConfigView.ts).
 */
import type { MgmWork } from '@app/common/ui/contracts';
import { COL, COL_MAX, inputVec, SE } from './tables';

/** ConfigInfo 48 바이트(+0x00~+0x2c) */
export interface RuleConfigInfo {
  displayExperience: number;
  indexExperience: number;
  displayExplain: number;
  indexExplain: number;
  displayCpu: number;
  indexCpu: number;
  displayStar: number;
  indexStar: number;
  displayRound: number;
  indexRound: number;
  displayVs: number;
  indexVs: number;
}

export const emptyConfig = (): RuleConfigInfo => ({
  displayExperience: 0,
  indexExperience: 0,
  displayExplain: 0,
  indexExplain: 0,
  displayCpu: 0,
  indexCpu: 0,
  displayStar: 0,
  indexStar: 0,
  displayRound: 0,
  indexRound: 0,
  displayVs: 0,
  indexVs: 0,
});

export type RuleEvent =
  | { t: 'activate'; on: boolean }
  | { t: 'visible'; col: number; v: boolean }
  | { t: 'title'; col: number }
  | { t: 'body'; col: number; index: number; left: boolean; right: boolean }
  | { t: 'lock'; col: number }
  | { t: 'anim'; col: number; anim: string; imm: boolean }
  | { t: 'se'; label: string; col: number }
  | { t: 'vib' }
  | { t: 'align' }
  | { t: 'in' }
  | { t: 'out' };

/** Update 반환: 0 계속, 1 시작(플레이 A), 2 설명 다시 보기(0x8), 3 취소(첫 열 B), 4 0x4 */
export type RuleUpdate = 0 | 1 | 2 | 3 | 4;

export class RuleConfigState {
  config: RuleConfigInfo = { ...emptyConfig(), indexExperience: 1 };
  readonly index = [0, 0, 0, 0, 0, 0, 0];
  readonly viewOnly = [false, false, false, false, false, false, false];
  readonly visible = [false, false, false, false, false, false, false];
  current = 0;
  first = 0;
  inFlag = false;
  active = false;
  private events: RuleEvent[] = [];

  drain(): RuleEvent[] {
    const o = this.events;
    this.events = [];
    return o;
  }

  private emit(e: RuleEvent): void {
    this.events.push(e);
  }

  private setVisible(col: number, v: boolean): void {
    this.visible[col] = v;
    this.emit({ t: 'visible', col, v });
  }

  /** ButtonBase::SetBody(index, withSound) + SetCursorUpDown */
  private setBody(col: number, index: number, sound: boolean): void {
    if (col === COL.PLAY) {
      this.emit({ t: 'anim', col, anim: 'normal', imm: false });
      return;
    }
    this.emit({ t: 'body', col, index, right: index !== 0, left: index !== COL_MAX[col] });
    if (sound) {
      this.emit({ t: 'se', label: SE.CURSOR_S, col });
      this.emit({ t: 'vib' });
    }
  }

  /** ButtonBase::Setup(index) */
  private setup(col: number, index: number): void {
    this.index[col] = index;
    this.setBody(col, index, false);
  }

  /** Round/MGSetsumei PlayLock: viewOnly = 1, lock 애니, x_gray_01 숨김 */
  private lock(col: number): void {
    this.viewOnly[col] = true;
    this.emit({ t: 'lock', col });
  }

  /** Impl::SetupMgm mgmet @0x710007d974 */
  setupMgm(cfg: RuleConfigInfo): void {
    this.config = { ...cfg };
    this.active = true;
    this.emit({ t: 'activate', on: true });
    for (let c = 0; c <= COL.PLAY; c++) {
      this.setVisible(c, false);
      this.viewOnly[c] = false;
    }
    this.setVisible(COL.PLAY, true);
    this.setBody(COL.PLAY, 0, false);
    let cand = 0;
    const show = (col: number, idx: number): void => {
      this.setVisible(col, true);
      this.emit({ t: 'title', col });
      this.setup(col, idx);
    };
    if (cfg.displayExperience === 1) {
      show(COL.EXPERIENCE, cfg.indexExperience);
      cand = COL.EXPERIENCE;
    }
    if (cfg.displayExplain === 2) {
      show(COL.EXPLAIN, cfg.indexExplain);
      this.lock(COL.EXPLAIN);
    } else if (cfg.displayExplain === 1) {
      show(COL.EXPLAIN, cfg.indexExplain);
      cand = COL.EXPLAIN;
    }
    if (cfg.displayCpu === 1) {
      show(COL.CPU, cfg.indexCpu);
      cand = COL.CPU;
    }
    if (cfg.displayRound === 2) {
      show(COL.ROUND, cfg.indexRound);
      this.lock(COL.ROUND);
    } else if (cfg.displayRound === 1) {
      show(COL.ROUND, cfg.indexRound);
      cand = COL.ROUND;
    }
    if (cfg.displayStar === 1) {
      show(COL.STAR, cfg.indexStar);
      cand = COL.STAR;
    }
    if (cfg.displayVs === 1) {
      show(COL.VS, cfg.indexVs);
      cand = COL.VS;
    }
    this.current = cand;
    this.first = cand;
    this.playMove(cand, true, false, false);
    this.emit({ t: 'align' });
  }

  /** Impl::PlayMove mgmet @0x7100080260 */
  private playMove(col: number, imm: boolean, confirm: boolean, forward: boolean): void {
    this.emit({ t: 'anim', col, anim: 'on', imm });
    for (let c = 0; c <= COL.PLAY; c++) if (c !== col && this.visible[c] && !this.viewOnly[c]) this.emit({ t: 'anim', col: c, anim: 'off', imm });
    if (col === COL.PLAY) this.setBody(COL.PLAY, 0, false);
    if (imm) return;
    if (!confirm) {
      this.emit({ t: 'se', label: SE.CURSOR, col });
      this.emit({ t: 'vib' });
    } else if (forward) {
      this.emit({ t: 'se', label: SE.DECI, col });
      this.emit({ t: 'vib' });
    } else this.emit({ t: 'se', label: SE.CANCEL, col });
  }

  /** RuleConfigView::In — visible, in → normal, +0xa0 = 1 */
  in(): void {
    this.inFlag = true;
    this.emit({ t: 'in' });
  }

  /** RuleConfigView::Out — +0xa0 일 때만 out */
  out(): void {
    if (!this.inFlag) return;
    this.inFlag = false;
    this.emit({ t: 'out' });
  }

  activate(on: boolean): void {
    this.active = on;
    this.emit({ t: 'activate', on });
  }

  private prevVisible(c: number): number {
    let i = c - 1;
    while (i > 0 && !this.visible[i]) i--;
    return i;
  }

  private nextVisible(c: number): number {
    let i = c + 1;
    while (i < COL.PLAY && !this.visible[i]) i++;
    return i;
  }

  private moveValue(up: boolean): void {
    const c = this.current;
    if (c === COL.PLAY) return;
    if (up ? this.index[c] < COL_MAX[c] : this.index[c] > 0) {
      this.index[c] += up ? 1 : -1;
      this.setBody(c, this.index[c], true);
    }
  }

  /** Impl::Update mgmet @0x7100080d0 계열(6.2 의사코드). trig = GetInputTrigger, rep = GetInputRepeat */
  update(trig: number, rep: number): RuleUpdate {
    const dir = inputVec(trig, rep);
    if (dir === 1) {
      this.moveValue(true);
      return 0;
    }
    if (dir === 2) {
      this.moveValue(false);
      return 0;
    }
    if (dir === 3) {
      if (this.current === this.first) return 0;
      this.current = this.prevVisible(this.current);
      this.playMove(this.current, false, false, false);
      return 0;
    }
    if (dir === 4) {
      if (this.current === COL.PLAY) return 0;
      this.current = this.nextVisible(this.current);
      this.playMove(this.current, false, false, true);
      return 0;
    }
    if (trig & 1) {
      if (this.current === COL.PLAY) {
        this.emit({ t: 'se', label: SE.DECI_L, col: COL.PLAY });
        this.emit({ t: 'vib' });
        this.emit({ t: 'anim', col: COL.PLAY, anim: 'press', imm: false });
        return 1;
      }
      this.current = this.nextVisible(this.current);
      this.playMove(this.current, false, true, true);
      return 0;
    }
    if (trig & 2) {
      if (this.current === this.first) {
        this.emit({ t: 'se', label: SE.CANCEL, col: this.current });
        return 3;
      }
      this.current = this.prevVisible(this.current);
      this.playMove(this.current, false, true, false);
      return 0;
    }
    if (trig & 8) return 2;
    return trig & 4 ? 4 : 0;
  }

  /** RuleConfigView::GetResult: 표시 flag 0 + 각 버튼의 현재 index(숨긴 열 포함) */
  getResult(): RuleConfigInfo {
    return {
      ...emptyConfig(),
      indexVs: this.index[COL.VS],
      indexRound: this.index[COL.ROUND],
      indexStar: this.index[COL.STAR],
      indexCpu: this.index[COL.CPU],
      indexExplain: this.index[COL.EXPLAIN],
      indexExperience: this.index[COL.EXPERIENCE],
    };
  }
}

/** ConfigInfo::LoadWorkData(오프라인 Work 캐시): valid 면 여섯 index 복사, 아니면 0. 표시 flag 는 건드리지 않음 */
export function loadWorkData(cfg: RuleConfigInfo, work: MgmWork): RuleConfigInfo {
  const r = work.rule;
  const v = r.valid;
  return {
    ...cfg,
    indexCpu: v ? r.cpu : 0,
    indexVs: v ? r.vs : 0,
    indexStar: v ? r.star : 0,
    indexRound: v ? r.round : 0,
    indexExplain: v ? r.explain : 0,
    indexExperience: v ? r.experience : 0,
  };
}

/** Mgm01SetRuleFlow 의 config: 지역값 0(+0x04 만 1) → LoadWorkData → 설명 표시 1, CPU 표시 = COM 수 ≠ 0 */
export function freePlayConfig(work: MgmWork, comCount: number): RuleConfigInfo {
  const cfg = loadWorkData({ ...emptyConfig(), indexExperience: 1 }, work);
  cfg.displayExplain = 1;
  cfg.displayCpu = comCount !== 0 ? 1 : 0;
  return cfg;
}

export interface FreePlayCommit {
  cpu: number;
  explain: number;
  /** flag::Set(4, explain == 0) */
  flag4: boolean;
}

/** 시작(1)·취소(3) 공통 후처리: CPU·설명 → Work 캐시(valid = 1), flag 4. PlayerWork ComLevel 적용은 부르는 쪽(setComLevel) */
export function commitFreePlay(res: RuleConfigInfo, work: MgmWork, setComLevel?: (level: number) => void): FreePlayCommit {
  setComLevel?.(res.indexCpu);
  work.rule.cpu = res.indexCpu;
  work.rule.explain = res.indexExplain;
  work.rule.valid = true;
  const flag4 = res.indexExplain === 0;
  if (flag4) work.flags.add(4);
  else work.flags.delete(4);
  return { cpu: res.indexCpu, explain: res.indexExplain, flag4 };
}
