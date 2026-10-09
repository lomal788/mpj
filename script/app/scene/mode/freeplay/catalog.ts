/**
 * 프리 플레이 목록 데이터 — 112 게임·필터 14·ID 매핑·잠금 조건·팀 표·기록 형식(순수 계산, 그리기 없음).
 * 근거: docs/shell/mgm01_freeplay.md 4.2·6.1(필터·순서·형식)·6.4(잠금·NEW)·6.5(설정 항목·팀 표·기록)·8.2·8.3(팀 배정). 원본에 없는 웹 결정은 9절 [설계]/[추정].
 */
import type { LockEnv, Mgm01CatalogJson, Mgm01Player, TeamRow } from './types';

export const FILTER = {
  MgAll: 0,
  Mg4vs: 1,
  Mg1vs3: 2,
  Mg2vs2: 3,
  MgDuel: 4,
  MgItem: 5,
  MgChallenge: 6,
  MgBoss: 7,
  MgGyro: 8,
  MgEndless: 9,
  MgAthlon: 10,
  MgBusters: 11,
  MgRhythm: 12,
  MgFavorite: 13,
} as const;

export const FILTER_COUNT = 14;

export const GAME_RULE_NO: Readonly<Record<string, number>> = {
  VS4: 0,
  '2VS2': 1,
  '1VS3': 2,
  '1VS1': 3,
  Boss: 9,
  Rhythm: 10,
  Chara: 8,
  Busters: 11,
  AthlonSP: 12,
  Athlon: 13,
};

export const GAME_RULE_SURE: readonly string[] = ['VS4', '2VS2', '1VS3', '1VS1', 'Boss', 'Rhythm'];

export const RULE_TYPE_LABEL: Readonly<Record<string, string>> = {
  VS4: 'mgm01_ui_mgRuleTypeFp00',
  '2VS2': 'mgm01_ui_mgRuleTypeFp01',
  '1VS3': 'mgm01_ui_mgRuleTypeFp02',
  '1VS1': 'mgm01_ui_mgRuleTypeFp03',
  Chara: 'mgm01_ui_mgRuleTypeFp04',
  Boss: 'mgm01_ui_mgRuleTypeFp06',
  Rhythm: 'mgm01_ui_mgRuleTypeFp07',
  Busters: 'mgm01_ui_mgRuleTypeFp08',
  AthlonSP: 'mgm01_ui_mgRuleTypeFp09',
  Athlon: 'mgm01_ui_mgRuleTypeFp10',
  Item: 'mgm01_ui_mgRuleTypeFp11',
};

export const TEAM_TABLE: readonly TeamRow[] = [
  { format: 0, cands: [[0, 1, 2, 3]] },
  { format: 4, cands: [[0, 1, 2, 3], [1, 0, 2, 3], [2, 0, 1, 3], [3, 0, 1, 2]] },
  { format: 5, cands: [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]] },
  { format: 6, cands: [[0, 1]] },
  { format: 6, cands: [[0, 1]] },
  { format: 6, cands: [[0, 1], [0, 2], [1, 2]] },
  { format: 6, cands: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]] },
  { format: 3, cands: [[0]] },
  { format: 3, cands: [[0], [1]] },
  { format: 3, cands: [[0], [1], [2]] },
  { format: 3, cands: [[0], [1], [2], [3]] },
  { format: 3, cands: [[0]] },
  { format: 2, cands: [[0, 1]] },
  { format: 1, cands: [[0, 1, 2]] },
  { format: 0, cands: [[0, 1, 2, 3]] },
];

export const TEAM_FORMAT_PANE = ['x_vs4', 'x_vs3', 'x_vs2', 'x_vs1', 'x_1vs3', 'x_2vs2', 'x_1vs1'] as const;

export const MODE_IDS: readonly number[] = [4, 5, 9, 11, 21];

export const MG_ID_LIMIT = 152;

export interface Mgm01Game {
  index: number;
  id: number;
  name: string;
  nameLabel: string;
  genre: number[];
  setLock: boolean;
  solo: boolean;
  offline: boolean;
  rule: string;
  ruleNo: number | null;
  gyro: number;
  callInst: boolean;
  mode: boolean;
  rhythm: boolean;
  recordKind: number;
}

export interface Mgm01FilterInfo {
  enumNo: number;
  name: string;
  label: string;
  sortIdx: number;
}

export function recordKind(id: number): number {
  if (id === 24) return 0;
  if (id === 10) return 1;
  if ([3, 12, 15, 16].includes(id)) return 2;
  if (MODE_IDS.includes(id)) return 3;
  if ((id >= 79 && id <= 83) || (id >= 86 && id <= 90)) return 4;
  return -1;
}

export function listType(n: number): 0 | 1 | 2 {
  return n >= 33 ? 0 : n >= 16 ? 1 : 2;
}

export const LIST_FORMAT = [
  { pane: 'x_filter_00', cols: 14, rows: 8, thumb: 2 },
  { pane: 'x_filter_01', cols: 8, rows: 4, thumb: 1 },
  { pane: 'x_filter_02', cols: 5, rows: 3, thumb: 0 },
] as const;

export function positiveMod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function filterNextIndex(index: number, dir: number, n = FILTER_COUNT): number {
  return positiveMod(index + dir, n);
}

export function humanCount(players: readonly Mgm01Player[]): number {
  return players.slice(0, 4).filter((p) => p.type === 0).length;
}

export function cpuSlotCount(players: readonly Mgm01Player[]): number {
  return players.slice(0, 4).filter((p) => p.type !== 0 && (p.baseType ?? p.type) !== 0).length;
}

export function teamTableIndex(ruleNo: number | null, players: readonly Mgm01Player[], online = false): number {
  const sub = cpuSlotCount(players);
  switch (ruleNo) {
    case 1:
      return 2;
    case 2:
      return 1;
    case 3:
      return 6 - sub;
    case 8:
    case 12:
      return 10 - sub;
    case 11:
    case 13:
      return (online ? 14 : 10) - sub;
    default:
      return 0;
  }
}

export function positionOrder(ruleNo: number | null, players: readonly Mgm01Player[]): number[] {
  const four = players.slice(0, 4);
  if (ruleNo !== null && [3, 8, 11, 12, 13].includes(ruleNo)) {
    const key = (p: Mgm01Player): number => (p.type === 0 || (p.baseType ?? p.type) === 0 ? 20 : 0) - p.pid;
    return [...four].sort((a, b) => key(b) - key(a)).map((p) => p.pid);
  }
  return [...four].sort((a, b) => a.pid - b.pid).map((p) => p.pid);
}

export function teamIdsByPosition(format: number, cand: readonly number[]): number[] {
  const ids = [-1, -1, -1, -1];
  cand.forEach((pos, i) => {
    if (format === 4 || format === 6) ids[pos] = i === 0 ? 0 : 1;
    else if (format === 5) ids[pos] = i < 2 ? 0 : 1;
    else ids[pos] = 0;
  });
  return ids;
}

export function isComLevelAdjustable(ruleNo: number | null, players: readonly Mgm01Player[]): boolean {
  if (ruleNo !== null && [8, 10, 11, 12, 13].includes(ruleNo)) return false;
  if (ruleNo === 3 && humanCount(players) >= 2) return false;
  return players.some((p) => p.type === 1);
}

export function recordView(kind: number, endless: boolean, record: number): { label: string; inserts: Record<string, string | number> } | null {
  switch (kind) {
    case 0:
      return { label: 'mgm01_ui_highscore01', inserts: { Number0: record } };
    case 1:
      return { label: 'mgm01_ui_highscore02', inserts: { Text0: `${Math.trunc(record / 100)}.${String(record % 100).padStart(2, '0')}` } };
    case 2:
    case 3: {
      if (kind === 3 && !endless) return null;
      const r = Math.min(record, 59999);
      return {
        label: 'mgm01_ui_highscore03',
        inserts: { Text0: String(Math.trunc(r / 6000)), Text1: String(Math.trunc(r / 100) % 60).padStart(2, '0'), Text2: String(r % 100).padStart(2, '0') },
      };
    }
    case 4:
      return { label: 'mgm01_ui_highscore04', inserts: { Text0: String(record) } };
    default:
      return null;
  }
}

export class Mgm01Catalog {
  readonly games: Mgm01Game[];
  readonly filters: Mgm01FilterInfo[];
  private readonly byId = new Map<number, Mgm01Game>();
  private readonly lists: number[][];

  constructor(readonly json: Mgm01CatalogJson) {
    const mg = new Map(json.mgList.map((m) => [m.name, m]));
    this.games = json.games.map((g, index) => {
      const m = mg.get(g.name);
      if (!m) throw new Error(`mgm01: MGList 에 없는 게임 ${g.name}`);
      const ruleNo = GAME_RULE_NO[m.rule] ?? null;
      return {
        index,
        id: m.id,
        name: g.name,
        nameLabel: `im_${g.name}_name`,
        genre: g.genre,
        setLock: g.setLock !== 0,
        solo: g.solo !== 0,
        offline: g.offline !== 0,
        rule: m.rule,
        ruleNo,
        gyro: m.gyro,
        callInst: m.callInst !== 0,
        mode: MODE_IDS.includes(m.id),
        rhythm: g.offline !== 0 && ruleNo === 10,
        recordKind: recordKind(m.id),
      };
    });
    for (const g of this.games) this.byId.set(g.id, g);
    this.filters = json.filters
      .map((f, enumNo) => ({ enumNo, name: f.name, label: f.label, sortIdx: f.sortIdx }))
      .sort((a, b) => a.sortIdx - b.sortIdx);
    this.lists = [];
    for (let e = 0; e < FILTER.MgFavorite; e++) {
      this.lists.push(
        this.games
          .filter((g) => g.genre[e] > 0)
          .sort((a, b) => a.genre[e] - b.genre[e])
          .map((g) => g.id),
      );
    }
  }

  game(id: number): Mgm01Game | undefined {
    return this.byId.get(id);
  }

  gameByName(name: string): Mgm01Game | undefined {
    return this.games.find((g) => g.name === name);
  }

  filterAt(index: number): Mgm01FilterInfo {
    return this.filters[positiveMod(index, this.filters.length)];
  }

  filterIndexOf(enumNo: number): number {
    return this.filters.findIndex((f) => f.enumNo === enumNo);
  }

  filterList(enumNo: number, favorite: (id: number) => boolean = () => false): number[] {
    if (enumNo === FILTER.MgFavorite) {
      return this.games
        .filter((g) => favorite(g.id))
        .sort((a, b) => a.genre[FILTER.MgAll] - b.genre[FILTER.MgAll])
        .map((g) => g.id);
    }
    return [...(this.lists[enumNo] ?? [])];
  }

  lockReason(id: number, env: LockEnv): number {
    const g = this.byId.get(id);
    if (!g) return -1;
    if (g.setLock && !env.bossOpen && env.playCount(id) === 0) return 0;
    if (g.offline && env.connected) return 2;
    if (g.solo && humanCount(env.players) > 1) return 1;
    if (g.genre[FILTER.MgBusters] > 0 && env.connected) {
      const ids = env.players
        .slice(0, 4)
        .filter((p) => p.type === 0 && p.constantId !== undefined)
        .map((p) => p.constantId);
      if (new Set(ids).size < ids.length) return 3;
    }
    return -1;
  }

  mgIdList(enumNo: number, inclLocked: boolean, reason: (id: number) => number, favorite?: (id: number) => boolean): number[] {
    const all = this.filterList(enumNo, favorite);
    return inclLocked ? all : all.filter((id) => reason(id) === -1);
  }

  defaultRecord(name: string): number | null {
    let v: number | null = null;
    for (const r of this.json.records) if (r.name === name) v = r.initialRecord;
    return v;
  }
}
