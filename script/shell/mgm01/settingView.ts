/**
 * 개별 설정(한 판 전 팀·CPU·모드·리듬 난이도·즐겨찾기·랜덤) — 순수 상태(입력 비트·press 완료 신호 → 사건). DecideMinigameFlow 상태 4.
 * 근거: docs/shell/mgm01_freeplay.md 5.1(설정 진입·종료 commit)·6.2(설정 입력 표·우선순위)·6.3(랜덤 = unlocked 후보 SyncRandRange)·6.5(항목 valid·값 범위·팀 표)·8.3(호출 계약).
 * 값 범위 끝에서 안 바뀌면 무음(6.5). SE 라벨 고르기와 항목 이동 SE 는 9절 [설계].
 */
import {
  isComLevelAdjustable,
  positionOrder,
  positiveMod,
  TEAM_TABLE,
  teamIdsByPosition,
  teamTableIndex,
  type Mgm01Catalog,
  type Mgm01Game,
} from './catalog';
import type { Mgm01Filter, Mgm01PlayRequest, Mgm01Player, Mgm01SettingValues } from './types';

export const SETTING_ITEM = { TEAM: 0, CPU: 1, MODE: 2, RHYTHM: 3, PLAY: 4 } as const;
export const SETTING_SE = {
  value: 'SQ_SE_MGM01_CUR',
  cursor: 'SQ_SE_MGM01_CUR',
  game: 'SQ_SE_MGM01_CUR',
  random: 'SQ_SE_MGM01_DECI_S',
  play: 'SQ_SE_MGM01_DEC',
  back: 'SQ_SE_MGM01_CANCEL',
  likeOn: 'SQ_SE_MGM01_LIKE_ADD',
  likeOff: 'SQ_SE_MGM01_LIKE_DIS',
} as const;

export interface SettingDeps {
  catalog: Mgm01Catalog;
  players(): readonly Mgm01Player[];
  online?: boolean;
  filter: Mgm01Filter;
  unlocked: readonly number[];
  isFavorite(id: number): boolean;
  setFavorite(id: number, on: boolean): void;
  rand(n: number): number;
}

export interface SettingInit extends Mgm01SettingValues {
  id: number;
  resume: boolean;
}

export type SettingResult = 'list' | 'random' | 'play';

export type SettingEvent =
  | { type: 'se'; label: string }
  | { type: 'cursor'; from: number; to: number }
  | { type: 'value'; item: number; value: number }
  | { type: 'game'; dir: number; id: number }
  | { type: 'favorite'; on: boolean }
  | { type: 'press' }
  | { type: 'exit'; result: SettingResult; id: number };

export class SettingState {
  ids: number[];
  pos: number;
  id: number;
  values: [number, number, number, number];
  valid: [boolean, boolean, boolean, boolean, boolean] = [false, false, false, false, true];
  rulePane: [number, number, number] = [-1, -1, -1];
  teamTable = 0;
  cursor = 0;
  phase: 'active' | 'press' | 'exit' = 'active';
  result: SettingResult | null = null;
  favoriteDirty = false;
  readonly resume: boolean;
  private events: SettingEvent[] = [];

  constructor(
    readonly deps: SettingDeps,
    init: SettingInit,
  ) {
    this.ids = deps.unlocked.length ? [...deps.unlocked] : [init.id];
    this.id = init.id;
    this.pos = Math.max(0, this.ids.indexOf(init.id));
    this.values = [init.team, init.cpu, init.endless ? 1 : 0, init.rhythm];
    this.resume = init.resume;
    this.apply();
    this.cursor = init.resume ? SETTING_ITEM.PLAY : this.search(0, 1);
  }

  get game(): Mgm01Game {
    const g = this.deps.catalog.game(this.id);
    if (!g) throw new Error(`mgm01: 게임 없음 ${this.id}`);
    return g;
  }

  get teamCount(): number {
    return TEAM_TABLE[this.teamTable]?.cands.length ?? 1;
  }

  range(item: number): number {
    return item === SETTING_ITEM.TEAM ? this.teamCount : item === SETTING_ITEM.CPU ? 4 : 2;
  }

  apply(): void {
    const g = this.game;
    const players = this.deps.players();
    this.teamTable = teamTableIndex(g.ruleNo, players, !!this.deps.online);
    this.valid = [this.teamCount > 1, isComLevelAdjustable(g.ruleNo, players), g.mode, g.rhythm, true];
    for (let i = 0; i < 4; i++) this.values[i] = Math.min(Math.max(this.values[i], 0), this.range(i) - 1);
    let k = 0;
    this.rulePane = [-1, -1, -1];
    for (let i = 0; i < 3; i++) if (this.valid[i + 1]) this.rulePane[i] = k++;
  }

  search(from: number, dir: number): number {
    if (dir >= 0) {
      for (let i = Math.max(from, 0); i <= SETTING_ITEM.PLAY; i++) if (this.valid[i]) return i;
      return SETTING_ITEM.PLAY;
    }
    for (let i = Math.min(from, SETTING_ITEM.PLAY); i >= 0; i--) if (this.valid[i]) return i;
    return this.search(0, 1);
  }

  private moveCursor(to: number): void {
    if (to === this.cursor) return;
    this.events.push({ type: 'se', label: SETTING_SE.cursor }, { type: 'cursor', from: this.cursor, to });
    this.cursor = to;
  }

  private exit(result: SettingResult): void {
    this.phase = 'exit';
    this.result = result;
    this.events.push({ type: 'exit', result, id: this.id });
  }

  input(trig: number, rep: number): void {
    if (this.phase !== 'active') return;
    if (trig === 0x1) {
      if (this.cursor === SETTING_ITEM.PLAY) {
        this.phase = 'press';
        this.events.push({ type: 'se', label: SETTING_SE.play }, { type: 'press' });
      } else this.moveCursor(this.search(this.cursor + 1, 1));
      return;
    }
    if (trig === 0x2) {
      const first = this.search(0, 1);
      if (this.cursor <= first) {
        this.events.push({ type: 'se', label: SETTING_SE.back });
        this.exit('list');
      } else this.moveCursor(this.search(this.cursor - 1, -1));
      return;
    }
    if (trig === 0x4) {
      const on = !this.deps.isFavorite(this.id);
      this.deps.setFavorite(this.id, on);
      this.favoriteDirty = true;
      this.events.push({ type: 'se', label: on ? SETTING_SE.likeOn : SETTING_SE.likeOff }, { type: 'favorite', on });
      return;
    }
    if (trig === 0x8) {
      this.events.push({ type: 'se', label: SETTING_SE.random });
      const n = this.deps.unlocked.length;
      if (n === 0) return;
      this.id = this.deps.unlocked[Math.min(Math.max(this.deps.rand(n), 0), n - 1)];
      this.exit('random');
      return;
    }
    if (trig & 0x10100) {
      this.moveCursor(this.search(this.cursor - 1, -1));
      return;
    }
    if (trig & 0x40200) {
      this.moveCursor(this.search(this.cursor + 1, 1));
      return;
    }
    if (rep === 0x10 || rep === 0x40 || rep === 0x20 || rep === 0x80) {
      const dir = rep === 0x10 || rep === 0x40 ? -1 : 1;
      const np = positiveMod(this.pos + dir, this.ids.length);
      if (this.ids[np] === this.id) return;
      this.pos = np;
      this.id = this.ids[np];
      this.apply();
      if (!this.valid[this.cursor]) this.cursor = this.search(this.cursor, 1);
      this.events.push({ type: 'se', label: SETTING_SE.game }, { type: 'game', dir, id: this.id });
      return;
    }
    let dv = 0;
    if (trig & 0x80400) dv = -1;
    else if (trig & 0x20800) dv = 1;
    if (dv && this.cursor < SETTING_ITEM.PLAY) {
      const i = this.cursor;
      const v = Math.min(Math.max(this.values[i] + dv, 0), this.range(i) - 1);
      if (v === this.values[i]) return;
      this.values[i] = v;
      this.events.push({ type: 'se', label: SETTING_SE.value }, { type: 'value', item: i, value: v });
    }
  }

  pressDone(): void {
    if (this.phase === 'press') this.exit('play');
  }

  commit(): Mgm01SettingValues {
    return { team: this.values[0], cpu: this.values[1], endless: this.values[2] === 1, rhythm: this.values[3] };
  }

  teamView(): { format: number; positions: number[]; order: number[] } {
    const row = TEAM_TABLE[this.teamTable] ?? TEAM_TABLE[0];
    return { format: row.format, positions: row.cands[this.values[0]] ?? row.cands[0], order: positionOrder(this.game.ruleNo, this.deps.players()) };
  }

  playRequest(): Mgm01PlayRequest {
    const g = this.game;
    const v = this.commit();
    const tv = this.teamView();
    const byPos = teamIdsByPosition(tv.format, tv.positions);
    const teamIdByPid = [-1, -1, -1, -1];
    tv.order.forEach((pid, pos) => {
      if (pid >= 0 && pid < 4) teamIdByPid[pid] = byPos[pos] ?? -1;
    });
    return {
      id: g.id,
      name: g.name,
      rule: g.rule,
      ruleNo: g.ruleNo,
      filter: { enumNo: this.deps.filter.enumNo, index: this.deps.filter.index, fromFavorite: this.deps.filter.enumNo === 13 },
      team: { table: this.teamTable, choice: v.team, format: tv.format, teamIdByPid, gamePlayByPid: teamIdByPid.map((t) => t >= 0) },
      cpu: v.cpu,
      endless: g.mode && v.endless,
      rhythm: g.ruleNo === 10 ? v.rhythm : 0,
      useGyro: g.gyro !== -1,
      callInst: g.callInst,
      favoriteDirty: this.favoriteDirty,
    };
  }

  drain(): SettingEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
