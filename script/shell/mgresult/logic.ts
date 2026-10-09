/**
 * 미니게임 3D 결과 무대(bq::MGResult) 순수 계산 — three 없음(노드 시험 tools/test_mgresult.ts 가 그대로 부른다).
 * 근거 docs/shell/minigame_result.md: 패턴 고르기 §6.1, 텔롭 번호(FUN_71002f1870) §6.3, 등록·폭 합(SetPlayer) §6.6, 모델·카메라 후보 ef450·efcd4·f13c0,
 * 배치 e9270(PosType 0~8, f3800 행 순회, 쿠파 보정) §6.6, 모션 ee410·ea020·eb650 §6.8, 주사위 Fisher–Yates·승자 이동 §6.9.
 * f32 식은 원본 연산 순서대로 Math.fround, 정규화는 ARM64 FRSQRTE + FRSQRTS 2회(§6.6).
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface PatternRow {
  Pattern: number;
  Rule: string;
  Mode: string;
  Team: number;
  Win: number;
  Lose: number;
  Draw: number;
}

export interface ListRow {
  Pattern: number;
  Telop_1: string;
  Telop_2: string;
  TelopIn: number;
  WinLoseType: string;
  PosType: string;
  CamType: string;
  KoopaOffsetZ: number;
  Pos_Normal_1: string;
  Pos_Normal_2: string;
  Pos_Overlook_1: string;
  Pos_Overlook_2: string;
  Cam_Normal_1: string;
  Cam_Normal_2: string;
  Cam_Overlook_1: string;
  Cam_Overlook_2: string;
}

export interface CharaParam {
  id: number;
  pc: string;
  number: number;
  name: string;
  head: Record<string, number | null>;
  resultWinMotionWidth: number;
  resultDrawLoseMotionWidth: number;
  resultWinMotionSize: number;
  resultDrawLoseMotionSize: number;
  resultCameraPositionOffsetY: number;
  resultCameraTargetOffsetY: number;
  resultEyePosY: number;
  [k: string]: unknown;
}

export interface PosBone {
  name: string;
  parent: number;
  T: Vec3;
  R: Vec3;
}

export interface CamCurve {
  field: string;
  type: string;
  pre: string;
  post: string;
  scale: number;
  offset: number;
  frames: number[];
  keys: number[][];
}

export interface CamClip {
  source: string;
  name: string;
  frames: number;
  loop: boolean;
  mode: string;
  projection: string;
  base: { near: number; far: number; aspect: number; fovy: number; pos: Vec3; aim: Vec3; twist: number };
  curves: CamCurve[];
}

/** 무대 계산에 쓰는 플레이어(등록 순서 = SetPlayer 순서) */
export interface LogicPlayer {
  pid: number;
  chara: string;
  order: number;
  teamId: number;
  winLose: number;
  coin: number;
}

export interface LogicInput {
  gameRule: number;
  isCoin: boolean;
  isChara: boolean;
  judgeType: number;
  boardMode: number;
  playMode: number;
  /** MGList 숫자 id(PataPata 0x75~0x78·Battle 0x77·Taxi 0x78 판정). 없으면 그 규칙에 걸리지 않는다 */
  listId?: number;
  /** MGEntry 인원(텔롭 Telop_2 조건 = 4명). 없으면 등록 인원 */
  entryCount?: number;
  players: LogicPlayer[];
  cameraType: number;
  cameraPattern: number;
  pcPosOffset: Vec3;
  /** 결과 흐름 함수가 등록됐는가(+0x120, 갈래 B) — 무대에서는 항상 false */
  hasFlow?: boolean;
}

export interface LogicSpec {
  list: { pattern: PatternRow[]; list: ListRow[] };
  chara: CharaParam[];
  pos: Record<string, PosBone[]>;
}

const f = Math.fround;

export const POS_TYPES = ['Pos1', 'Pos2', 'Pos4_Win1', 'Pos4_Win2', 'Pos4_Win3', 'Pos4_Win4', 'Pos4_Draw', 'Pos4_Chara', 'Pos4_Boss'] as const;
export const KOOPA_ID = 13;
export const TEAM_GAP = 0.8;
export const TELOP_NO: Readonly<Record<string, number>> = { WinCenterBottom: 5, WinRightTop: 6, WinRightBottom: 7, Draw: 8 };
export const DICE_TELOP_NO = 6;
export const DEFAULT_MOTIONS = { idle: 'co_idle00', winA: 'co_win00a', winB: 'co_win00b', loseA: 'co_lose00a', loseB: 'co_lose00b' } as const;
export const MOTION = { applause: 'co_applause00', walk: 'co_walk00', diceIdle: 'co_dice_idle00', diceJump: 'co_jump_dice01' } as const;
export const SEC = {
  fadeOut: 1.0,
  afterFadeOut: 0.1,
  afterSetup: 0.5,
  fadeIn: 1.0,
  diceTelopHold: 1.0,
  diceTelopAfter: 1.0,
  diceGuideOut: 1.0,
  diceAfterRoll: 1.0,
  diceWinTelop: 5.0,
  walkEnd: 2.0,
  walkRate: 0.5,
} as const;
export const DT = f(1 / 60);

/** 규칙 이름 FUN_71002f462c */
export function ruleName(i: LogicInput): string {
  if (i.isCoin) return 'Coin';
  if (i.isChara) return i.judgeType !== 0 ? 'Chara' : 'CharaRank';
  if (i.gameRule === 9) return 'Boss';
  if (i.listId !== undefined && i.listId >= 0x75 && i.listId <= 0x78) return 'PataPata';
  if (i.gameRule >= 0 && i.gameRule < 4) return ['VS4', '2VS2', '1VS3', '1VS1'][i.gameRule];
  return 'None';
}

/** 모드 이름 FUN_71002f4758 */
export function modeName(i: LogicInput): string {
  if (i.gameRule === 9) return i.boardMode === 2 ? 'Quest' : i.playMode === 6 ? 'BossRush' : 'Normal';
  if (i.listId === 0x77) return 'Battle';
  if (i.listId === 0x78) return 'Taxi';
  return 'None';
}

export const isTeamRule = (gameRule: number): boolean => gameRule - 1 >= 0 && gameRule - 1 < 2;

/** 승·패·무 집계 FUN_71002f0ba0/4840/4a30 */
export function counts(i: LogicInput): { win: number; lose: number; draw: number } {
  let win = 0;
  let lose = 0;
  let draw = 0;
  for (const p of i.players) {
    if (i.isCoin) {
      if (p.coin > 0) win++;
      if (p.coin < 1) lose++;
    } else {
      if (p.winLose === 1) win++;
      if (p.winLose === 0) lose++;
      if (p.winLose === 2) draw++;
    }
  }
  return { win, lose, draw };
}

/** 패턴 고르기 FUN_71002ee230 */
export function selectPattern(spec: LogicSpec, i: LogicInput): number {
  const rule = ruleName(i);
  const mode = modeName(i);
  const team = isTeamRule(i.gameRule) ? 1 : 0;
  const c = counts(i);
  for (const r of spec.list.pattern) {
    if (r.Rule === rule && r.Mode === mode && r.Team === team && (r.Win === -1 || r.Win === c.win) && (r.Lose === -1 || r.Lose === c.lose) && (r.Draw === -1 || r.Draw === c.draw)) return r.Pattern;
  }
  return -1;
}

export function listRow(spec: LogicSpec, pattern: number): ListRow | null {
  return spec.list.list.find((r) => r.Pattern === pattern) ?? null;
}

export function charaOf(spec: LogicSpec, pc: string): CharaParam {
  const c = spec.chara.find((x) => x.pc === pc);
  if (!c) throw new Error(`mgresult: 캐릭터 수치 없음 ${pc}`);
  return c;
}

/** SetPlayer @0x71002edc80: 목록1(승자, Normal 만)·목록2(나머지) — PlayerID 오름차순 multimap, 폭 합은 등록 순서로 f32 누적 */
export interface Registered {
  list1: LogicPlayer[];
  list2: LogicPlayer[];
  winSum: number;
  loseSum: number;
}

export function register(spec: LogicSpec, i: LogicInput): Registered {
  const list1: LogicPlayer[] = [];
  const list2: LogicPlayer[] = [];
  let winSum = 0;
  let loseSum = 0;
  for (const p of i.players) {
    const c = charaOf(spec, p.chara);
    const ww = f(c.resultWinMotionWidth);
    const lw = f(c.resultDrawLoseMotionWidth);
    if (!i.isCoin) {
      if (p.winLose === 1) {
        list1.push(p);
        winSum = f(winSum + ww);
      } else {
        list2.push(p);
        loseSum = f(loseSum + lw);
      }
    } else {
      list2.push(p);
      loseSum = f(loseSum + (p.coin >= 1 ? ww : lw));
    }
  }
  const byPid = (a: LogicPlayer, b: LogicPlayer): number => a.pid - b.pid;
  return { list1: list1.sort(byPid), list2: list2.sort(byPid), winSum, loseSum };
}

/** 개인 폭(f3800): Normal 은 승패 1 이면 승 폭, Coin 은 코인 > 0 이면 승 폭, 아니면 비승 폭 */
export function widthOf(spec: LogicSpec, p: LogicPlayer, coinType: boolean): number {
  const c = charaOf(spec, p.chara);
  const win = coinType ? p.coin > 0 : p.winLose === 1;
  return f(win ? c.resultWinMotionWidth : c.resultDrawLoseMotionWidth);
}

/** +0x134: 넓은 배치·카메라 후보(ef450) */
export function sizeIndex(spec: LogicSpec, i: LogicInput, reg: Registered): number {
  if (i.isCoin) {
    return i.players.some((p) => {
      const c = charaOf(spec, p.chara);
      return (p.coin > 0 ? c.resultWinMotionSize : c.resultDrawLoseMotionSize) === 1;
    })
      ? 1
      : 0;
  }
  if (reg.list1.length) return reg.list1.some((p) => charaOf(spec, p.chara).resultWinMotionSize === 1) ? 1 : 0;
  return reg.list2.some((p) => charaOf(spec, p.chara).resultDrawLoseMotionSize === 1) ? 1 : 0;
}

export function modelName(row: ListRow, cameraType: number, size: number): string {
  const k = `Pos_${cameraType === 0 ? 'Normal' : 'Overlook'}_${size === 1 ? 2 : 1}` as keyof ListRow;
  return row[k] as string;
}

/** 카메라 후보(efcd4): 기본 +0x134, SetCameraPattern 이 −1 이 아니면 그 값 */
export function cameraIndex(cameraPattern: number, size: number): number {
  return cameraPattern !== -1 ? cameraPattern : size;
}

/** 카메라 이름(f13c0): CamType=PC 면 MGEntry(PlayerID 순)의 첫 승자(WinLose=1) PCNumber %02d [MGEntry 순서 추정: PlayerID] */
export function cameraName(spec: LogicSpec, row: ListRow, i: LogicInput, camIdx: number): string {
  const k = `Cam_${i.cameraType === 0 ? 'Normal' : 'Overlook'}_${camIdx === 1 ? 2 : 1}` as keyof ListRow;
  let n = row[k] as string;
  if (row.CamType === 'PC') {
    const ps = i.players.slice().sort((a, b) => a.pid - b.pid);
    const w = ps.find((p) => p.winLose === 1) ?? ps[0];
    if (w) n += String(charaOf(spec, w.chara).number).padStart(2, '0');
  }
  return n;
}

/** 텔롭 번호 +0x140 (FUN_71002f1870 [판독 ARM64]) */
export function telopPlace(spec: LogicSpec, row: ListRow, i: LogicInput, reg: Registered, camIdx: number): string {
  let place = row.Telop_1;
  const nWin = counts(i).win;
  const entry = i.entryCount ?? i.players.length;
  if (entry === 4 && (nWin === 2 || nWin === 3) && row.Telop_1 !== 'None' && row.Telop_2 !== 'None') {
    let best = 0;
    let charaId = 0;
    for (const p of reg.list1) {
      if (p.order >= best) {
        best = p.order;
        charaId = charaOf(spec, p.chara).id;
      }
    }
    const c = spec.chara[charaId];
    const key = `resultWinTelop_win${nWin === 2 ? 2 : 3}_cam${camIdx === 0 ? 1 : 2}_${i.cameraType !== 0 ? 'overlook' : 'normal'}`;
    if ((c?.[key] as number | undefined) ?? 0) place = row.Telop_2;
  }
  return place;
}

export const telopNo = (place: string): number => TELOP_NO[place] ?? -1;

/* ---------- f32 벡터 ---------- */

/** ARM64 FRSQRTE(단정밀도) — ARMv8 RecipSqrtEstimate(8비트 추정) */
export function frsqrte(x: number): number {
  const fx = f(x);
  if (fx === 0) return Infinity;
  if (fx < 0 || Number.isNaN(fx)) return NaN;
  if (!Number.isFinite(fx)) return 0;
  const buf = new DataView(new ArrayBuffer(4));
  buf.setFloat32(0, fx);
  let bits = buf.getUint32(0);
  let exp = (bits >>> 23) & 0xff;
  let frac = bits & 0x7fffff;
  if (exp === 0) {
    while ((frac & 0x400000) === 0) {
      frac <<= 1;
      exp--;
    }
    frac = (frac << 1) & 0x7fffff;
  }
  const top = (frac >>> 15) & 0xff;
  let a = (exp & 1) === 0 ? 256 + top : 128 + (top >>> 1);
  if (a < 256) a = a * 2 + 1;
  else {
    a = (a >> 1) << 1;
    a = (a + 1) * 2;
  }
  let b = 512;
  while (a * (b + 1) * (b + 1) < 2 ** 28) b++;
  const r = (b + 1) >> 1;
  const rexp = Math.floor((380 - exp) / 2);
  bits = ((rexp & 0xff) << 23) | ((r & 0xff) << 15);
  buf.setUint32(0, bits >>> 0);
  return buf.getFloat32(0);
}

/** FRSQRTS = (3 − a·b)/2 (곱셈·뺄셈 한 번 반올림) */
export const frsqrts = (a: number, b: number): number => f((3 - a * b) / 2);

/** 원본 SIMD 정규화(e9270·f3000): 길이 0 → 0, FRSQRTE 뒤 FRSQRTS 2회 */
export function normalize4(v: [number, number, number, number]): [number, number, number, number] {
  const x2 = f(v[0] * v[0]);
  const y2 = f(v[1] * v[1]);
  const z2 = f(v[2] * v[2]);
  const w2 = f(v[3] * v[3]);
  const s = f(f(z2 + x2) + f(w2 + y2));
  if (s === 0) return [0, 0, 0, 0];
  const e0 = frsqrte(s);
  const s1 = frsqrts(e0, f(e0 * s));
  const e1 = f(e0 * s1);
  const s2 = frsqrts(e1, f(s * e1));
  return v.map((c) => f(f(c * e1) * s2)) as [number, number, number, number];
}

export const normalize3 = (v: Vec3): Vec3 => normalize4([v[0], v[1], v[2], 0]).slice(0, 3) as Vec3;

export const add3 = (a: Vec3, b: Vec3): Vec3 => [f(a[0] + b[0]), f(a[1] + b[1]), f(a[2] + b[2])];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [f(a[0] - b[0]), f(a[1] - b[1]), f(a[2] - b[2])];

/** EulerXYZ → 쿼터니언(Rz·Ry·Rx, bfres 뼈 회전) */
export function quatEulerXYZ(r: Vec3): Quat {
  const [cx, sx] = [Math.cos(r[0] / 2), Math.sin(r[0] / 2)];
  const [cy, sy] = [Math.cos(r[1] / 2), Math.sin(r[1] / 2)];
  const [cz, sz] = [Math.cos(r[2] / 2), Math.sin(r[2] / 2)];
  return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz];
}

export function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

export const quatYaw = (yaw: number): Quat => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

export interface Slot {
  pos: Vec3;
  quat: Quat;
}

/** 배치 모델 뼈 → 슬롯 world 변환(ed800 translation·f0f70 quaternion). origin = SetModel pos_result(없으면 원점) */
export function slotsOf(bones: PosBone[], origin?: Slot): Record<string, Slot> {
  const world: Slot[] = [];
  const out: Record<string, Slot> = {};
  bones.forEach((b, k) => {
    const lq = quatEulerXYZ(b.R);
    const par: Slot = b.parent >= 0 ? world[b.parent] : (origin ?? { pos: [0, 0, 0], quat: [0, 0, 0, 1] });
    const t = quatRotate(par.quat, b.T);
    const pos: Vec3 = [f(par.pos[0] + t[0]), f(par.pos[1] + t[1]), f(par.pos[2] + t[2])];
    world[k] = { pos, quat: quatMul(par.quat, lq) };
    out[b.name] = world[k];
  });
  return out;
}

/* ---------- 배치 e9270 ---------- */

export interface Placement {
  pid: number;
  pos: Vec3;
  quat: Quat;
  slot: string;
}

export interface LayoutResult {
  posType: number;
  places: Placement[];
  /** +0x2D0 승 행 방향 / +0x310 비승 행 방향 */
  winDir: Vec3;
  loseDir: Vec3;
  /** 쿠파 보정에 쓴 방향(Draw = 비승, 그 외 = 승) */
  koopaDir: Vec3;
  fellow: Slot | null;
}

interface RowState {
  d: Vec3;
  cursor: Vec3;
  rot: Quat;
}

/** 행 시작(d = normalize(R − L), cursor = C + ((0 − d)·W)·0.5) */
function rowStart(L: Slot, C: Slot, R: Slot, W: number): RowState {
  const d4 = normalize4([f(R.pos[0] - L.pos[0]), f(R.pos[1] - L.pos[1]), f(R.pos[2] - L.pos[2]), 0]);
  const d: Vec3 = [d4[0], d4[1], d4[2]];
  const cursor: Vec3 = [0, 1, 2].map((k) => f(C.pos[k] + f(f(f(0 - d[k]) * W) * 0.5))) as Vec3;
  return { d, cursor, rot: C.quat };
}

/** 행에 하나 놓기: cursor += d·(w/2 + g), P = cursor + offset, cursor += d·w/2 */
function rowPlace(r: RowState, w: number, g: number, off: Vec3): Vec3 {
  const half = f(w * 0.5);
  const step = f(half + g);
  for (let k = 0; k < 3; k++) r.cursor[k] = f(r.cursor[k] + f(r.d[k] * step));
  const p = add3(r.cursor, off);
  for (let k = 0; k < 3; k++) r.cursor[k] = f(r.cursor[k] + f(r.d[k] * half));
  return p;
}

/** MGEntry 정렬(f3800): GetOrder 오름차순, GameRule 1·2 는 TeamID 오름차순 다시(JS 정렬은 안정 — 원본 같은 팀 안 순서는 보장 없음) */
export function entryOrder(i: LogicInput): LogicPlayer[] {
  const a = i.players.slice().sort((x, y) => x.order - y.order);
  if (isTeamRule(i.gameRule)) a.sort((x, y) => x.teamId - y.teamId);
  return a;
}

export function posTypeIndex(name: string): number {
  return (POS_TYPES as readonly string[]).indexOf(name);
}

/**
 * 배치 e9270. slots = 이번 모델의 슬롯 world 변환. camPos = 지금 결과 카메라 위치(Pos1 전용).
 * 반환 places 는 위치를 정한 플레이어만(슬롯이 없는 행은 놓지 않음 — 원본 ed800 실패 동작 미확인 [추정]).
 */
export function layout(spec: LogicSpec, i: LogicInput, row: ListRow, reg: Registered, slots: Record<string, Slot>, camPos: Vec3 = [0, 0, 0]): LayoutResult {
  const pt = posTypeIndex(row.PosType);
  const off = i.pcPosOffset.map(f) as Vec3;
  const coinType = row.WinLoseType !== 'Normal';
  const team = isTeamRule(i.gameRule);
  const places: Placement[] = [];
  const zero: Vec3 = [0, 0, 0];
  let winDir: Vec3 = zero;
  let loseDir: Vec3 = zero;
  const S = (n: string): Slot | null => slots[n] ?? null;
  const rowOf = (l: string, c: string, r: string, W: number): RowState | null => {
    const L = S(l);
    const C = S(c);
    const R = S(r);
    return L && C && R ? rowStart(L, C, R, W) : null;
  };
  const isWin = (p: LogicPlayer): boolean => !coinType && p.winLose === 1;
  const fixed = (p: LogicPlayer, name: string): void => {
    const s = S(name);
    if (s) places.push({ pid: p.pid, pos: add3(s.pos, off), quat: s.quat, slot: name });
  };

  if (pt === 0) {
    const p = reg.list1[0] ?? reg.list2[0];
    const L = S('pos_pc_L');
    const R = S('pos_pc_R');
    if (p && L && R) {
      const mid: Vec3 = [f(f(L.pos[0] + R.pos[0]) * 0.5), f(f(L.pos[1] + R.pos[1]) * 0.5), f(f(L.pos[2] + R.pos[2]) * 0.5)];
      const pos = add3(mid, off);
      places.push({ pid: p.pid, pos, quat: quatYaw(Math.atan2(camPos[0] - pos[0], camPos[2] - pos[2])), slot: 'pos_pc_L+R' });
    }
  } else if (pt === 1) {
    i.players
      .slice()
      .sort((a, b) => a.pid - b.pid)
      .forEach((p, k) => fixed(p, k === 0 ? 'pos_pc_L' : 'pos_pc_R'));
  } else if (pt >= 2 && pt <= 6) {
    let win: RowState | null = null;
    let lose: RowState | null = null;
    const gapW = (W: number): number => (team && (pt === 5 || pt === 6) ? f(W + TEAM_GAP) : W);
    if (pt === 3 || pt === 4 || pt === 5) win = rowOf('pos_pc_win_l', 'pos_pc_win_center', 'pos_pc_win_r', pt === 5 ? gapW(reg.winSum) : reg.winSum);
    if (pt === 2 || pt === 3) lose = rowOf('pos_pc_lose_l', 'pos_pc_lose_center', 'pos_pc_lose_r', reg.loseSum);
    if (pt === 6) lose = rowOf('pos_pc_l', 'pos_pc_center', 'pos_pc_r', gapW(reg.loseSum));
    if (win) winDir = win.d.slice() as Vec3;
    if (lose) loseDir = lose.d.slice() as Vec3;
    let prevTeam = 0;
    for (const p of entryOrder(i)) {
      const g = team && (pt === 5 || pt === 6) && p.teamId !== prevTeam ? f(TEAM_GAP) : 0;
      prevTeam = p.teamId;
      const w = widthOf(spec, p, coinType);
      if (isWin(p)) {
        if (pt === 2) fixed(p, 'pos_pc_win');
        else if (win) places.push({ pid: p.pid, pos: rowPlace(win, w, g, off), quat: win.rot, slot: 'pos_pc_win_center' });
      } else if (pt === 4) fixed(p, 'pos_pc_lose');
      else if (lose) places.push({ pid: p.pid, pos: rowPlace(lose, w, g, off), quat: lose.rot, slot: pt === 6 ? 'pos_pc_center' : 'pos_pc_lose_center' });
    }
  } else if (pt === 7) {
    i.players
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((p, j) => fixed(p, `pos_pc${String(j).padStart(2, '0')}`));
  } else if (pt === 8) {
    const win = rowOf('pos_pc_win_l', 'pos_pc_win_center', 'pos_pc_win_r', reg.winSum);
    const lose = rowOf('pos_pc_l', 'pos_pc_center', 'pos_pc_r', reg.loseSum);
    if (win) winDir = win.d.slice() as Vec3;
    if (lose) loseDir = lose.d.slice() as Vec3;
    for (const p of i.players.slice().sort((a, b) => a.pid - b.pid)) {
      const w = widthOf(spec, p, coinType);
      const r = isWin(p) ? win : lose;
      if (r) places.push({ pid: p.pid, pos: rowPlace(r, w, 0, off), quat: r.rot, slot: isWin(p) ? 'pos_pc_win_center' : 'pos_pc_center' });
    }
  }

  const koopaDir = pt === 6 ? loseDir : winDir;
  if (row.KoopaOffsetZ !== 0) {
    const side = normalize3([f(f(koopaDir[1] * 0) - koopaDir[2]), f(f(koopaDir[2] * 0) - f(koopaDir[0] * 0)), f(koopaDir[0] - f(koopaDir[1] * 0))]);
    const kz = f(row.KoopaOffsetZ);
    for (const pl of places) {
      const p = i.players.find((x) => x.pid === pl.pid)!;
      if (charaOf(spec, p.chara).id !== KOOPA_ID) continue;
      pl.pos = [f(pl.pos[0] + f(side[0] * kz)), f(pl.pos[1] + f(side[1] * kz)), f(pl.pos[2] + f(side[2] * kz))];
    }
  }
  const fs = S('pos_pc_fellow');
  const fellow = fs ? { pos: add3(fs.pos, off), quat: fs.quat } : null;
  return { posType: pt, places, winDir, loseDir, koopaDir, fellow };
}

/* ---------- 모션 ---------- */

export interface MotionNames {
  idle: string;
  winA: string;
  winB: string;
  loseA: string;
  loseB: string;
}

/** ee410: 기본 이름 + SetMotion 커스텀(빈 문자열이 아니면 우선) */
export function motionNames(custom: Partial<MotionNames> | undefined): MotionNames {
  const o: MotionNames = { ...DEFAULT_MOTIONS };
  for (const k of Object.keys(o) as (keyof MotionNames)[]) if (custom?.[k]) o[k] = custom[k]!;
  return o;
}

/** 주사위 갈래 조건(e7d90): 캐릭터 미니게임·등록 흐름 없음·목록1 ≠ 1·JudgeType ≠ 0 */
export function isDiceBranch(i: LogicInput, reg: Registered): boolean {
  return i.isChara && !i.hasFlow && reg.list1.length !== 1 && i.judgeType !== 0;
}

export interface MotionCmd {
  pid: number;
  a: string;
  b: string | null;
}

/** 일반 시작 ea020(Normal: 목록1 승 A→B, 목록2 패 A→B / Coin: 목록2 코인 > 0 이면 승, 아니면 패) */
export function startMotions(row: ListRow, reg: Registered, m: MotionNames): MotionCmd[] {
  const out: MotionCmd[] = [];
  if (row.WinLoseType === 'Normal') {
    for (const p of reg.list1) out.push({ pid: p.pid, a: m.winA, b: m.winB });
    for (const p of reg.list2) out.push({ pid: p.pid, a: m.loseA, b: m.loseB });
  } else {
    for (const p of reg.list2) out.push(p.coin > 0 ? { pid: p.pid, a: m.winA, b: m.winB } : { pid: p.pid, a: m.loseA, b: m.loseB });
  }
  return out;
}

/** 카메라를 보는 대상(e8c20): 주사위 조건 → 목록1(없으면 목록2), Coin → 목록2 중 코인 > 0, 그 외 목록1 */
export function lookTargets(i: LogicInput, row: ListRow, reg: Registered): number[] {
  if (isDiceBranch(i, reg)) return (reg.list1.length ? reg.list1 : reg.list2).map((p) => p.pid);
  if (row.WinLoseType !== 'Normal') return reg.list2.filter((p) => p.coin > 0).map((p) => p.pid);
  return reg.list1.map((p) => p.pid);
}

/** 머리 가중치(ee410 0x71002eec70~ed5c): CharacterID 0/1/5 → 0, 그 외 PCHeadControlWeight(PC58 1, PC61 0.4, 나머지 0.5) */
export function headWeight(c: CharaParam): number {
  if (c.id === 0 || c.id === 1 || c.id === 5) return 0;
  if (c.number === 58) return 1;
  if (c.number === 61) return 0.4;
  return 0.5;
}

/* ---------- 주사위 eb650 ---------- */

/** SyncRandMod(n): n < 2 → 0(소비 없음), 아니면 (u × n) >> 32 (01_core.md) */
export function syncRandMod(rand: () => number, n: number): number {
  if (n < 2) return 0;
  const u = rand() >>> 0;
  return Math.floor((u * n) / 4294967296);
}

/** [1..10] Fisher–Yates: 남은 길이 n = 10 → 2, j = SyncRandMod(n), a[n−1] ↔ a[j] */
export function diceShuffle(rand: () => number): number[] {
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (let n = a.length; n >= 2; n--) {
    const j = syncRandMod(rand, n);
    const t = a[n - 1];
    a[n - 1] = a[j];
    a[j] = t;
  }
  return a;
}

export interface DiceResult {
  candidates: number[];
  values: Record<number, number>;
  winner: number;
  writes: { pid: number; winLose: 0 | 1 }[];
}

/** 후보 = 목록1(없으면 목록2) PlayerID 순, 섞은 값을 차례로 배정, 최댓값 PlayerID 가 승자. 후보에게만 WinLose 기록 */
export function diceRoll(reg: Registered, rand: () => number): DiceResult {
  const cand = (reg.list1.length ? reg.list1 : reg.list2).map((p) => p.pid);
  const vals = diceShuffle(rand);
  const values: Record<number, number> = {};
  let winner = -1;
  let best = -1;
  cand.forEach((pid, k) => {
    values[pid] = vals[k];
    if (vals[k] > best) {
      best = vals[k];
      winner = pid;
    }
  });
  return { candidates: cand, values, winner, writes: cand.map((pid) => ({ pid, winLose: pid === winner ? 1 : 0 })) };
}

/** 승자 이동 표본 P = P0 + (P1 − P0)·(s·0.5) */
export function walkAt(p0: Vec3, p1: Vec3, s: number): Vec3 {
  const k = f(f(s) * f(SEC.walkRate));
  return [0, 1, 2].map((j) => f(p0[j] + f(f(p1[j] - p0[j]) * k))) as Vec3;
}

/** 이동 루프(ec8cc~ec910)의 s 값들: s = 0 부터, dt 를 f32 로 누적, 누적 s ≤ 2.0 이면 반복 */
export function walkTimes(dt: number = DT): number[] {
  const out: number[] = [];
  let s = 0;
  do {
    out.push(s);
    s = f(s + f(dt));
  } while (s <= SEC.walkEnd);
  return out;
}

/* ---------- 카메라 FSNB ---------- */

/** nn::g3d AnimCurve(camera_probe Eval 과 같은 식, f32): Cubic v = (k0 + (k1 + (k2 + k3·t)·t)·t)·scale + offset, Clamp */
export function evalCurve(c: CamCurve, frame: number): number {
  const fr = c.frames;
  const n = fr.length;
  if (n === 0) return 0;
  const s = f(c.scale === 0 ? 1 : c.scale);
  const o = f(c.offset);
  const k = c.keys;
  const isInt = c.type === 'StepInt' || c.type === 'BakedInt';
  if (isInt) {
    let i = 0;
    if (frame > fr[0]) while (i + 1 < n && fr[i + 1] <= frame) i++;
    return Math.trunc(k[i][0]) + Math.trunc(o);
  }
  if (c.type === 'StepBool' || c.type === 'BakedBool') {
    let i = 0;
    if (frame > fr[0]) while (i + 1 < n && fr[i + 1] <= frame) i++;
    return k[i][0] !== 0 ? 1 : 0;
  }
  let i = 0;
  if (frame > fr[0]) while (i + 1 < n && fr[i + 1] <= frame) i++;
  if (c.type === 'BakedFloat') return f(f(k[i][0] * s) + o);
  if (frame <= fr[0]) return f(f(k[0][0] * s) + o);
  if (i >= n - 1) return f(f(k[n - 1][0] * s) + o);
  const span = f(fr[i + 1] - fr[i]);
  const t = span > 0 ? f(f(f(frame) - f(fr[i])) / span) : 0;
  const kk = k[i];
  if (c.type === 'Cubic') return f(f(f(kk[0] + f(f(kk[1] + f(f(kk[2] + f(kk[3] * t)) * t)) * t)) * s) + o);
  return f(f(f(kk[0] + f(kk[1] * t)) * s) + o);
}

export interface CamPose {
  pos: Vec3;
  aim: Vec3;
  twist: number;
  fovy: number;
  near: number;
  far: number;
  aspect: number;
}

/** 한 프레임 카메라 값(base + 곡선). 원본 채널 = posX/Y/Z(0x10~0x18)·rotX/Y/Z = Aim(0x1C~0x24) */
export function cameraPose(clip: CamClip, frame: number): CamPose {
  const b = clip.base;
  const v: Record<string, number> = {
    near: b.near,
    far: b.far,
    aspect: b.aspect,
    fovy: b.fovy,
    posX: b.pos[0],
    posY: b.pos[1],
    posZ: b.pos[2],
    rotX: b.aim[0],
    rotY: b.aim[1],
    rotZ: b.aim[2],
    twist: b.twist,
  };
  for (const c of clip.curves) v[c.field] = evalCurve(c, frame);
  return { pos: [v.posX, v.posY, v.posZ], aim: [v.rotX, v.rotY, v.rotZ], twist: v.twist, fovy: v.fovy, near: v.near, far: v.far, aspect: v.aspect };
}

/** SetCameraNearZ/FarZ(f4f00): 둘 다 음수면 그대로, 한쪽만 음수면 그쪽은 현재 값 유지 */
export function nearFar(pose: CamPose, nearZ: number, farZ: number): [number, number] {
  if (nearZ < 0 && farZ < 0) return [pose.near, pose.far];
  return [nearZ < 0 ? pose.near : nearZ, farZ < 0 ? pose.far : farZ];
}

/* ---------- 계획(무대 준비 §6.2 한 번에) ---------- */

export interface ResultPlan {
  pattern: number;
  row: ListRow | null;
  reg: Registered;
  size: number;
  camIdx: number;
  model: string | null;
  camera: string | null;
  telopPlace: string;
  telopNo: number;
  dice: boolean;
  motions: MotionNames;
}

export function plan(spec: LogicSpec, i: LogicInput, custom?: Partial<MotionNames>): ResultPlan {
  const reg = register(spec, i);
  const pattern = selectPattern(spec, i);
  const row = pattern >= 0 ? listRow(spec, pattern) : null;
  const size = sizeIndex(spec, i, reg);
  const camIdx = cameraIndex(i.cameraPattern, size);
  const model = row ? modelName(row, i.cameraType, size) : null;
  const camera = row ? cameraName(spec, row, i, camIdx) : null;
  const place = row ? telopPlace(spec, row, i, reg, camIdx) : 'None';
  return { pattern, row, reg, size, camIdx, model, camera, telopPlace: place, telopNo: telopNo(place), dice: isDiceBranch(i, reg), motions: motionNames(custom) };
}
