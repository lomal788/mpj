/**
 * 프리 플레이(mgm01) 화면 형식 — 목록 데이터(assets/mgm01/catalog.json ← tools/analysis/mgm01_web_assets.py)와 한 판 호출 계약.
 * 근거: docs/shell/mgm01_freeplay.md 4.2(JSON 구조)·6.5(팀 표)·8.3(호출 계약)·9절 [설계].
 */

export interface Mgm01GameJson {
  name: string;
  genre: number[];
  setLock: number;
  solo: number;
  offline: number;
}

export interface Mgm01FilterJson {
  name: string;
  sortIdx: number;
  label: string;
}

export interface Mgm01MgListJson {
  id: number;
  name: string;
  rule: string;
  endless: number;
  gyro: number;
  callInst: number;
  available: number;
}

export interface Mgm01RecordJson {
  name: string;
  stage: number;
  mode: number;
  format: number;
  sortOrder: number;
  initialRecord: number;
}

export interface Mgm01CatalogJson {
  version: number;
  genres: string[];
  games: Mgm01GameJson[];
  filters: Mgm01FilterJson[];
  mgList: Mgm01MgListJson[];
  records: Mgm01RecordJson[];
  sounds: Record<string, { file: string; gain: number }>;
}

export interface Mgm01Player {
  pid: number;
  type: 0 | 1;
  baseType?: 0 | 1;
  constantId?: number;
}

export interface LockEnv {
  bossOpen: boolean;
  playCount(id: number): number;
  connected: boolean;
  players: readonly Mgm01Player[];
}

export interface TeamRow {
  format: number;
  cands: number[][];
}

export interface Mgm01Filter {
  enumNo: number;
  index: number;
}

export interface Mgm01SettingValues {
  team: number;
  cpu: number;
  endless: boolean;
  rhythm: number;
}

export interface Mgm01PlayRequest {
  id: number;
  name: string;
  rule: string;
  ruleNo: number | null;
  filter: { enumNo: number; index: number; fromFavorite: boolean };
  team: { table: number; choice: number; format: number; teamIdByPid: number[]; gamePlayByPid: boolean[] };
  cpu: number;
  endless: boolean;
  rhythm: number;
  useGyro: boolean;
  callInst: boolean;
  favoriteDirty: boolean;
}
