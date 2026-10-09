/**
 * 미니게임 3D 결과 무대(app/minigame/frame/result) 노드 상태 시험 — WebGL 없음. 기대값은 docs/shell/minigame_result.md 의 표·식을 시험 안에서 따로(배정밀도) 계산한다.
 * 1 패턴 고르기 §6.1  2 배치 §6.6·§7.1(1~4명, 승자 0~4명, Coin, 쿠파, 팀 간격, Pos2·Chara·Boss)  3 카메라 Cubic 표본 §6.7·§7.2
 * 4 모션 분기 §6.8  5 주사위·승자 이동 §6.9  6 텔롭 번호 §6.3  7 에셋 존재(404 0)  8 import 경계
 *
 *   npx tsx tools/test_mgresult.ts
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MT19937 } from '@game/core/rng';
import * as L from '@app/minigame/frame/result/logic';
import { charaFiles, stageFiles } from '@app/minigame/frame/result/stage';
import type { MgResultSpec, ResultStageInputExt } from '@app/minigame/frame/result/types';
import { DEFAULT_RESULT_OPTIONS } from '@app/minigame/frame/scene/resultContract';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = join(WEB, 'assets');
const spec = JSON.parse(readFileSync(join(A, 'mgresult', 'spec.json'), 'utf8')) as MgResultSpec;
let fails = 0;
let count = 0;
const ok = (cond: boolean, msg: string): void => {
  count++;
  if (!cond) {
    fails++;
    console.log('  실패:', msg);
  }
};
const near = (a: number, b: number, eps: number, msg: string): void => ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≈ ${b}`);
const section = (s: string): void => console.log(s);

type P = { chara: string; wl?: number; coin?: number; order?: number; team?: number };
const inp = (ps: P[], o: Partial<L.LogicInput> = {}): L.LogicInput => ({
  gameRule: 0,
  isCoin: false,
  isChara: false,
  judgeType: 0,
  boardMode: 0,
  playMode: 0,
  players: ps.map((p, k) => ({ pid: k, chara: p.chara, order: p.order ?? k, teamId: p.team ?? 0, winLose: p.wl ?? 0, coin: p.coin ?? 0 })),
  cameraType: 0,
  cameraPattern: -1,
  pcPosOffset: [0, 0, 0],
  ...o,
});
const four = (wl: number[], pcs = ['pc01', 'pc02', 'pc03', 'pc04']): P[] => wl.map((w, k) => ({ chara: pcs[k], wl: w }));

section('1 패턴 고르기');
const pat = (i: L.LogicInput): number => L.selectPattern(spec, i);
ok(pat(inp(four([1, 0, 0, 0]))) === 0, 'VS4 1승 → 0');
ok(pat(inp(four([1, 1, 0, 0]))) === 1, 'VS4 2승 → 1');
ok(pat(inp(four([1, 1, 1, 0]))) === 2, 'VS4 3승 → 2');
ok(pat(inp(four([1, 1, 1, 1]))) === 3, 'VS4 4승 → 3');
ok(pat(inp(four([2, 2, 2, 2]))) === 4, 'VS4 무 → 4');
ok(pat(inp(four([1, 1, 0, 0]), { gameRule: 1 })) === 5, '2VS2 2승 → 5');
ok(pat(inp(four([1, 1, 1, 1]), { gameRule: 1 })) === 6, '2VS2 4승 → 6');
ok(pat(inp(four([1, 0, 0, 0]), { gameRule: 2 })) === 8, '1VS3 1승 → 8');
ok(pat(inp([{ chara: 'pc01', wl: 1 }, { chara: 'pc02', wl: 0 }], { gameRule: 3 })) === 12, '1VS1 2명 → 12');
ok(pat(inp([{ chara: 'pc01', wl: 2 }, { chara: 'pc02', wl: 2 }], { gameRule: 3 })) === 14, '1VS1 무 → 14');
const coinP = (c: number[]): P[] => c.map((v, k) => ({ chara: ['pc01', 'pc02', 'pc03', 'pc04'][k], coin: v }));
ok(pat(inp(coinP([5, 0, 0, 0]), { isCoin: true })) === 15, 'Coin 1승 → 15');
ok(pat(inp(coinP([5, 0, 2, 0]), { isCoin: true })) === 16, 'Coin 2승 → 16');
ok(pat(inp(coinP([0, 0, 0, 0]), { isCoin: true })) === 19, 'Coin 0승 → 19');
ok(pat(inp(coinP([5, 0, 2, 0]), { isCoin: true, gameRule: 1 })) === 21, 'Coin 팀 2승 → 21');
ok(pat(inp(four([1, 0, 0, 0]), { isChara: true, judgeType: 1 })) === 25, 'Chara 1승 → 25');
ok(pat(inp(four([1, 1, 0, 0]), { isChara: true, judgeType: 1 })) === 26, 'Chara 2승 → 26');
ok(pat(inp(four([1, 1, 0, 0]), { isChara: true, judgeType: 0 })) === 31, 'CharaRank 2승 → 31');
ok(pat(inp(four([1, 1, 1, 1]), { gameRule: 9 })) === 38, 'Boss Normal 4승 → 38');
ok(pat(inp([{ chara: 'pc01', wl: 1 }], { gameRule: 9, boardMode: 2 })) === 40, 'Quest 1명 1승 → 40');
ok(pat(inp([{ chara: 'pc01', wl: 0 }, { chara: 'pc02', wl: 0 }, { chara: 'pc03', wl: 0 }], { gameRule: 9, boardMode: 2 })) === 46, 'Quest 3명 0승 3패 → 46');
ok(pat(inp(four([0, 0, 0, 0]), { gameRule: 9, playMode: 6 })) === 49, 'BossRush 4패 → 49');
ok(pat(inp([{ chara: 'pc01', wl: 1 }])) === -1, 'VS4 1명 → 없음(−1)');
ok(pat(inp([{ chara: 'pc01', wl: 1 }, { chara: 'pc02', wl: 0 }], { listId: 0x77 })) === 50, 'PataPata Battle 1승 → 50');

section('2 배치(문서 §7.1 슬롯 표 + §6.6 식, 배정밀도 기대값)');
type XZ = [number, number, number];
const DOC: Record<string, Record<string, XZ>> = {
  pos_pc_win1_1: { lose_center: [2.5, -4.8, -0.13962635], lose_l: [0.010412518, -5.048906, 0.06981318], lose_r: [4.961753, -4.35304, -0.3490659], win: [0, 0, 0.03490659] },
  pos_pc_win2_1: {
    lose_center: [3.3864958, -4.8, -0.17453295],
    lose_l: [0.43207252, -5.3209443, 0.104719765],
    lose_r: [6.340919, -4.2790556, -0.40142578],
    win_center: [0.4235803, -0.2, 0.17453295],
    win_l: [-1.5460352, 0.14729635, 0.43633235],
    win_r: [2.3931959, -0.54729635, -0.087266475],
  },
  pos_pc_win2_2: {
    lose_center: [3.3864958, -4.8, -0.17453295],
    lose_l: [0.43207252, -5.3209443, 0.104719765],
    lose_r: [6.340919, -4.2790556, -0.40142578],
    win_center: [0.3243633, -1.45, 0.13962635],
    win_l: [-2.1513069, -1.1020672, 0.41887906],
    win_r: [2.8000333, -1.7979327, -0.13962635],
  },
  pos_pc_win3_1: { lose: [4.1, -4.25, -0.26179942], win_center: [0.55, -0.35, 0.087266475], win_l: [-1.4336739, -0.07606904, 0.40142578], win_r: [2.551105, -0.424692, -0.19198623] },
  pos_pc_win4_1: { win_center: [1.2, -4, 0], win_l: [-2.3, -4, 0.2792527], win_r: [4.7, -4, -0.2792527] },
  pos_pc_win4_t_1: { win_center: [1.2, -4.5, 0], win_l: [-2.8, -4.5, 0.2792527], win_r: [5.2, -4.5, -0.2792527] },
  pos_pc_draw_1: { center: [1.2, -4, 0], l: [-2.3, -4, 0.2792527], r: [4.7, -4, -0.2792527] },
  pos_pc_duel_1: { L: [-1.3, -1, 0.20943953], R: [1.3, -1, -0.20943953] },
  pos_pc_chara_dice: {
    pc00: [-0.8442504, -4.4949045, 0.17453295],
    pc00_fix: [0.169098, -1.6273055, 0.17453295],
    pc01: [1.2643925, -4.6979437, 0.017453294],
    pc01_fix: [1.3167497, -1.6984009, 0.017453294],
    pc02: [3.3788369, -4.568619, -0.13962635],
    pc03: [5.447018, -4.110114, -0.296706],
  },
};
const W = (pc: string, win: boolean): number => {
  const c = spec.chara.find((x) => x.pc === pc)!;
  return win ? c.resultWinMotionWidth : c.resultDrawLoseMotionWidth;
};
for (const [m, slots] of Object.entries(DOC)) {
  const s = L.slotsOf(spec.pos[m]);
  for (const [k, v] of Object.entries(slots)) {
    const n = k === 'L' || k === 'R' ? `pos_pc_${k}` : k.startsWith('pc') ? `pos_${k}` : `pos_pc_${k}`;
    const got = s[n];
    ok(!!got, `${m} 슬롯 ${n}`);
    if (!got) continue;
    near(got.pos[0], v[0], 1e-6, `${m}.${n}.x`);
    near(got.pos[1], 0, 1e-6, `${m}.${n}.y(= −12 + 12)`);
    near(got.pos[2], v[1], 1e-6, `${m}.${n}.z`);
    near(2 * Math.atan2(got.quat[1], got.quat[3]), v[2], 1e-6, `${m}.${n}.Ry`);
  }
}
const rowExpect = (m: string, l: string, c: string, r: string, items: { pc: string; win: boolean; g?: number }[], extra = 0): XZ[] => {
  const S = DOC[m];
  const dx = S[r][0] - S[l][0];
  const dz = S[r][1] - S[l][1];
  const len = Math.hypot(dx, dz);
  const d = [dx / len, dz / len];
  const Wsum = items.reduce((a, it) => a + W(it.pc, it.win), 0) + extra;
  let cur = [S[c][0] - (d[0] * Wsum) / 2, S[c][1] - (d[1] * Wsum) / 2];
  const out: XZ[] = [];
  for (const it of items) {
    const w = W(it.pc, it.win);
    cur = [cur[0] + d[0] * (w / 2 + (it.g ?? 0)), cur[1] + d[1] * (w / 2 + (it.g ?? 0))];
    out.push([cur[0], 0, cur[1]]);
    cur = [cur[0] + (d[0] * w) / 2, cur[1] + (d[1] * w) / 2];
  }
  return out;
};
const lay = (i: L.LogicInput): { plan: L.ResultPlan; res: L.LayoutResult; at: (pid: number) => L.Placement | undefined } => {
  const plan = L.plan(spec, i);
  const res = L.layout(spec, i, plan.row!, plan.reg, L.slotsOf(spec.pos[plan.model!]));
  return { plan, res, at: (pid) => res.places.find((p) => p.pid === pid) };
};
const checkPos = (got: L.Placement | undefined, e: XZ, msg: string, eps = 1e-5): void => {
  ok(!!got, `${msg} 배치 있음`);
  if (!got) return;
  near(got.pos[0], e[0], eps, `${msg}.x`);
  near(got.pos[1], e[1], eps, `${msg}.y`);
  near(got.pos[2], e[2], eps, `${msg}.z`);
};
{
  const t = lay(inp(four([1, 0, 0, 0])));
  ok(t.plan.model === 'pos_pc_win1_1' && t.plan.camera === 'result_cam_win1_pc01', `Win1 모델·카메라 ${t.plan.model} ${t.plan.camera}`);
  checkPos(t.at(0), [0, 0, 0], 'Win1 승자 = pos_pc_win 고정');
  const e = rowExpect('pos_pc_win1_1', 'lose_l', 'lose_center', 'lose_r', [{ pc: 'pc02', win: false }, { pc: 'pc03', win: false }, { pc: 'pc04', win: false }]);
  [1, 2, 3].forEach((pid, k) => checkPos(t.at(pid), e[k], `Win1 패자 ${pid}`));
  near(2 * Math.atan2(t.at(1)!.quat[1], t.at(1)!.quat[3]), -0.13962635, 1e-6, 'Win1 패자 회전 = lose_center');
}
{
  const t = lay(inp(four([1, 1, 0, 0])));
  ok(t.plan.model === 'pos_pc_win2_1' && t.plan.camera === 'result_cam_win2_1', `Win2 모델·카메라 ${t.plan.model} ${t.plan.camera}`);
  const ew = rowExpect('pos_pc_win2_1', 'win_l', 'win_center', 'win_r', [{ pc: 'pc01', win: true }, { pc: 'pc02', win: true }]);
  const el = rowExpect('pos_pc_win2_1', 'lose_l', 'lose_center', 'lose_r', [{ pc: 'pc03', win: false }, { pc: 'pc04', win: false }]);
  checkPos(t.at(0), ew[0], 'Win2 승자 0');
  checkPos(t.at(1), ew[1], 'Win2 승자 1');
  checkPos(t.at(2), el[0], 'Win2 패자 2');
  checkPos(t.at(3), el[1], 'Win2 패자 3');
}
{
  const t = lay(inp(four([1, 1, 1, 0], ['pc01', 'pc02', 'pc03', 'pc04']).map((p, k) => ({ ...p, order: [2, 0, 1, 3][k] }))));
  ok(t.plan.model === 'pos_pc_win3_1', `Win3 모델 ${t.plan.model}`);
  const ew = rowExpect('pos_pc_win3_1', 'win_l', 'win_center', 'win_r', [{ pc: 'pc02', win: true }, { pc: 'pc03', win: true }, { pc: 'pc01', win: true }]);
  checkPos(t.at(1), ew[0], 'Win3 GetOrder 0(pid1) 먼저');
  checkPos(t.at(2), ew[1], 'Win3 GetOrder 1(pid2)');
  checkPos(t.at(0), ew[2], 'Win3 GetOrder 2(pid0)');
  checkPos(t.at(3), [4.1, 0, -4.25], 'Win3 패자 = pos_pc_lose 고정');
}
{
  const t = lay(inp(four([1, 1, 1, 1])));
  ok(t.plan.model === 'pos_pc_win4_1', `Win4 모델 ${t.plan.model}`);
  const e = rowExpect('pos_pc_win4_1', 'win_l', 'win_center', 'win_r', [0, 1, 2, 3].map((k) => ({ pc: `pc0${k + 1}`, win: true })));
  [0, 1, 2, 3].forEach((pid) => checkPos(t.at(pid), e[pid], `Win4 ${pid}`));
}
{
  const ps = four([1, 1, 1, 1]).map((p, k) => ({ ...p, team: [0, 0, 1, 1][k] }));
  const t = lay(inp(ps, { gameRule: 1 }));
  ok(t.plan.pattern === 6 && t.plan.model === 'pos_pc_win4_t_1', `2VS2 Win4 팀 모델 ${t.plan.model}`);
  const e = rowExpect('pos_pc_win4_t_1', 'win_l', 'win_center', 'win_r', [{ pc: 'pc01', win: true }, { pc: 'pc02', win: true }, { pc: 'pc03', win: true, g: 0.8 }, { pc: 'pc04', win: true }], 0.8);
  [0, 1, 2, 3].forEach((pid) => checkPos(t.at(pid), e[pid], `2VS2 Win4 팀 간격 ${pid}`));
}
{
  const t = lay(inp(four([2, 2, 2, 2])));
  ok(t.plan.model === 'pos_pc_draw_1', `Draw 모델 ${t.plan.model}`);
  const e = rowExpect('pos_pc_draw_1', 'l', 'center', 'r', [0, 1, 2, 3].map((k) => ({ pc: `pc0${k + 1}`, win: false })));
  [0, 1, 2, 3].forEach((pid) => checkPos(t.at(pid), e[pid], `Draw ${pid}`));
}
{
  const t = lay(inp(coinP([5, 0, 2, 0]), { isCoin: true }));
  ok(t.plan.pattern === 16 && t.plan.model === 'pos_pc_draw_1', `Coin 모델 ${t.plan.model}`);
  ok(t.plan.reg.list1.length === 0 && t.plan.reg.list2.length === 4, 'Coin 전원 목록2');
  near(t.plan.reg.loseSum, 1.6 + 1.4 + 1.5 + 1.3, 1e-5, 'Coin 폭 합 +0x300 = 코인>0 승 폭 + 나머지 비승 폭');
  const e = rowExpect('pos_pc_draw_1', 'l', 'center', 'r', [{ pc: 'pc01', win: true }, { pc: 'pc02', win: false }, { pc: 'pc03', win: true }, { pc: 'pc04', win: false }]);
  [0, 1, 2, 3].forEach((pid) => checkPos(t.at(pid), e[pid], `Coin ${pid}`));
}
{
  const t = lay(inp(four([1, 1, 0, 0], ['pc50', 'pc01', 'pc02', 'pc03'])));
  ok(t.plan.size === 1 && t.plan.model === 'pos_pc_win2_2' && t.plan.camera === 'result_cam_win2_2', `쿠파 승 Size 1 → 넓은 후보 ${t.plan.model} ${t.plan.camera}`);
  const ew = rowExpect('pos_pc_win2_2', 'win_l', 'win_center', 'win_r', [{ pc: 'pc50', win: true }, { pc: 'pc01', win: true }]);
  const S = DOC.pos_pc_win2_2;
  const dx = S.win_r[0] - S.win_l[0];
  const dz = S.win_r[1] - S.win_l[1];
  const len = Math.hypot(dx, dz);
  const side = [-dz / len, dx / len];
  checkPos(t.at(0), [ew[0][0] + side[0] * -0.25, 0, ew[0][2] + side[1] * -0.25], '쿠파 보정 P += normalize(d×Y)·KoopaOffsetZ(−0.25)');
  checkPos(t.at(1), ew[1], '쿠파 아닌 승자 보정 없음');
}
{
  const t = lay(inp([{ chara: 'pc01', wl: 1 }, { chara: 'pc02', wl: 0 }], { gameRule: 3 }));
  ok(t.plan.model === 'pos_pc_duel_1', `Pos2 모델 ${t.plan.model}`);
  checkPos(t.at(0), [-1.3, 0, -1], 'Pos2 0번째 = pos_pc_L');
  checkPos(t.at(1), [1.3, 0, -1], 'Pos2 이후 = pos_pc_R');
}
{
  const ps = four([1, 1, 0, 0]).map((p, k) => ({ ...p, order: [3, 1, 0, 2][k] }));
  const t = lay(inp(ps, { isChara: true, judgeType: 1 }));
  ok(t.plan.model === 'pos_pc_chara_dice' && t.plan.camera === 'result_cam_chara_dice' && t.plan.dice, `Chara 주사위 갈래 ${t.plan.model} ${t.plan.dice}`);
  const S = DOC.pos_pc_chara_dice;
  checkPos(t.at(2), [S.pc00[0], 0, S.pc00[1]], 'Chara GetOrder 0 → pos_pc00');
  checkPos(t.at(1), [S.pc01[0], 0, S.pc01[1]], 'Chara GetOrder 1 → pos_pc01');
  checkPos(t.at(3), [S.pc02[0], 0, S.pc02[1]], 'Chara GetOrder 2 → pos_pc02');
  checkPos(t.at(0), [S.pc03[0], 0, S.pc03[1]], 'Chara GetOrder 3 → pos_pc03');
}
{
  const t = lay(inp([{ chara: 'pc01', wl: 1 }, { chara: 'pc02', wl: 1 }, { chara: 'pc03', wl: 1 }], { gameRule: 9, boardMode: 2 }));
  ok(t.plan.pattern === 42 && t.plan.model === 'pos_pc_win4_1', `Boss Quest 3명 ${t.plan.pattern} ${t.plan.model}`);
  const e = rowExpect('pos_pc_win4_1', 'win_l', 'win_center', 'win_r', [0, 1, 2].map((k) => ({ pc: `pc0${k + 1}`, win: true })));
  [0, 1, 2].forEach((pid) => checkPos(t.at(pid), e[pid], `Boss 3명 ${pid}`));
}
{
  const t = lay(inp([{ chara: 'pc01', wl: 0 }], { gameRule: 9, boardMode: 2 }));
  ok(t.plan.pattern === 44 && t.plan.model === 'pos_pc_draw_1', `Boss Quest 1명 패 ${t.plan.pattern} ${t.plan.model}`);
  checkPos(t.at(0), rowExpect('pos_pc_draw_1', 'l', 'center', 'r', [{ pc: 'pc01', win: false }])[0], 'Boss 1명 = 비승 행 가운데');
}
{
  const t = L.plan(spec, inp(four([1, 0, 0, 0]), { cameraType: 1 }));
  ok(t.model === 'pos_pc_win1_1be' && t.camera === 'result_cam_win1be_pc01', `Overlook ${t.model} ${t.camera}`);
  const t2 = L.plan(spec, inp(four([1, 1, 0, 0]), { cameraPattern: 1 }));
  ok(t2.model === 'pos_pc_win2_1' && t2.camera === 'result_cam_win2_2', `CameraPattern 1 은 카메라만 ${t2.model} ${t2.camera}`);
  const off = lay(inp(four([1, 0, 0, 0]), { pcPosOffset: [0.5, 0.25, -1] }));
  checkPos(off.at(0), [0.5, 0.25, -1], 'PcPosOffset 더함');
}

section('3 카메라 Cubic 표본(§6.7 계수 표 · §7.2 끝값)');
const cam = (n: string): L.CamClip => JSON.parse(readFileSync(join(A, 'mgresult', 'cam', `${n}.json`), 'utf8')) as L.CamClip;
{
  const c = cam('result_cam_win2_1');
  const p0 = L.cameraPose(c, 0);
  near(p0.pos[0], 1.5000086, 2e-7, 'win2_1 f0 P.X');
  near(p0.pos[1], 1.4999985, 2e-7, 'win2_1 f0 P.Y');
  near(p0.pos[2], 8.49997, 2e-6, 'win2_1 f0 P.Z');
  near(p0.aim[1], 1.0999999, 2e-7, 'win2_1 f0 Aim.Y');
  const p300 = L.cameraPose(c, 300);
  near(p300.pos[0], 0.3999914, 2e-7, 'win2_1 f300 P.X');
  near(p300.pos[2], 5.300029, 2e-6, 'win2_1 f300 P.Z');
  near(p0.fovy, 0.43633232, 1e-8, 'fovy');
  ok(p0.aspect === 1.78 && p0.near === 1 && p0.far === 10000, 'aspect·near·far');
  const cubic = (k: number[], t: number, s: number, o: number): number => (k[0] + k[1] * t + k[2] * t * t + k[3] * t * t * t) * s + o;
  const x70 = cubic([16056, -1437, -334, -24], 0.5, 0.000021966078, 0.95);
  near(L.cameraPose(c, 70).pos[0], x70, 2e-6, 'win2_1 f70 P.X = Cubic(65..75, t 0.5)');
  const x93 = cubic([3332, -26173, -32767, 30569], (93 - 87) / 13, 0.000021966078, 0.95);
  near(L.cameraPose(c, 93).pos[0], x93, 2e-6, 'win2_1 f93 P.X = Cubic(87..100)');
  const lin = p0.pos[0] + ((p300.pos[0] - p0.pos[0]) * 93) / 300;
  ok(Math.abs(L.cameraPose(c, 93).pos[0] - lin) > 0.1, 'f93 은 끝값 선형 보간과 다름');
  near(L.cameraPose(c, 70.5).pos[0], cubic([16056, -1437, -334, -24], 0.55, 0.000021966078, 0.95), 2e-6, '소수 프레임도 Cubic');
  const z = cam('result_cam_win2_1').curves.find((x) => x.field === 'posZ')!;
  near(L.evalCurve(z, -5), L.evalCurve(z, 0), 0, 'Clamp 앞');
  near(L.evalCurve(z, 400), L.evalCurve(z, 300), 0, 'Clamp 뒤');
  const d = cam('result_cam_chara_dice');
  ok(d.curves.length === 0 && L.cameraPose(d, 120).pos[1] === 2.5, '주사위 카메라 정적');
  const w4 = cam('result_cam_win4_1');
  near(L.cameraPose(w4, 150).pos[2], 4.5000243, 3e-6, 'win4_1 f150 P.Z');
  const files = readdirSync(join(A, 'mgresult', 'cam'));
  ok(files.length === 95, `카메라 95개 (${files.length})`);
  let bad = 0;
  for (const fn of files) {
    const cc = JSON.parse(readFileSync(join(A, 'mgresult', 'cam', fn), 'utf8')) as L.CamClip;
    if (cc.frames !== 300 || cc.loop || cc.mode !== 'Aim' || cc.base.fovy !== 0.43633232 || cc.curves.some((x) => x.type !== 'Cubic' || x.pre !== 'Clamp' || x.post !== 'Clamp')) bad++;
  }
  ok(bad === 0, `95개 모두 300프레임·비루프·Aim·Cubic/Clamp (어긋남 ${bad})`);
  ok(L.nearFar(p0, -1, -1).join() === '1,10000' && L.nearFar(p0, 0.5, -1).join() === '0.5,10000', 'Near/Far override(한쪽만 음수면 그대로)');
}

section('4 모션 분기');
{
  const p = L.plan(spec, inp(four([1, 1, 0, 0])));
  const p2 = L.register(spec, inp(four([1, 1, 0, 2])));
  const m = L.startMotions(p.row!, p2, p.motions);
  ok(JSON.stringify(m) === JSON.stringify([
    { pid: 0, a: 'co_win00a', b: 'co_win00b' },
    { pid: 1, a: 'co_win00a', b: 'co_win00b' },
    { pid: 2, a: 'co_lose00a', b: 'co_lose00b' },
    { pid: 3, a: 'co_lose00a', b: 'co_lose00b' },
  ]), 'Normal: 목록1 승 A→B, 목록2(패·무) 패 A→B');
  ok(L.lookTargets(inp(four([1, 1, 0, 0])), p.row!, p.reg).join() === '0,1', 'Normal 시선 대상 = 목록1');
  const c = L.plan(spec, inp(coinP([5, 0, 2, 0]), { isCoin: true }));
  ok(L.startMotions(c.row!, c.reg, c.motions).map((x) => x.a).join() === 'co_win00a,co_lose00a,co_win00a,co_lose00a', 'Coin: 코인 > 0 승, 아니면 패');
  ok(L.lookTargets(inp(coinP([5, 0, 2, 0]), { isCoin: true }), c.row!, c.reg).join() === '0,2', 'Coin 시선 대상 = 코인 > 0');
  const d = inp(four([1, 1, 0, 0]), { isChara: true, judgeType: 1 });
  const dp = L.plan(spec, d);
  ok(dp.dice && L.lookTargets(d, dp.row!, dp.reg).join() === '0,1', '주사위 조건 시선 = 목록1');
  const d0 = inp(four([0, 0, 0, 0]), { isChara: true, judgeType: 1 });
  const d0p = L.plan(spec, d0);
  ok(d0p.dice && L.lookTargets(d0, d0p.row!, d0p.reg).join() === '0,1,2,3', '주사위 조건 목록1 비면 목록2');
  ok(!L.plan(spec, inp(four([1, 0, 0, 0]), { isChara: true, judgeType: 1 })).dice, '목록1 = 1 이면 일반 갈래');
  ok(!L.plan(spec, inp(four([1, 1, 0, 0]), { isChara: true, judgeType: 0 })).dice, 'JudgeType 0 이면 일반 갈래');
  const cm = L.motionNames({ winA: 'mg_win', loseB: '' });
  ok(cm.winA === 'mg_win' && cm.loseB === 'co_lose00b' && cm.idle === 'co_idle00', 'SetMotion 커스텀(빈 값은 기본)');
  const hw = (pc: string): number => L.headWeight(spec.chara.find((x) => x.pc === pc)!);
  ok(hw('pc01') === 0 && hw('pc02') === 0 && hw('pc06') === 0 && hw('pc58') === 1 && hw('pc61') === 0.4 && hw('pc03') === 0.5 && hw('pc50') === 0.5, '머리 가중치(ID 0/1/5 = 0, PC58 1, PC61 0.4, 그 외 0.5)');
  for (const c2 of spec.chars) for (const n of spec.clips) ok(!!c2.clips?.[n], `${c2.pc} 클립 ${n}`);
  ok(spec.chars.every((c2) => c2.clips?.co_jump_dice01?.frames === 48 && c2.clips.co_jump_dice01.loop === false), 'co_jump_dice01 전원 48 프레임 비루프(§7.3)');
}

section('5 주사위·승자 이동');
{
  const mt = new MT19937(1);
  const before = mt.calls;
  const v = L.diceShuffle(() => mt.nextU32());
  ok(v.slice().sort((a, b) => a - b).join() === '1,2,3,4,5,6,7,8,9,10', `순열 ${v.join(',')}`);
  ok(mt.calls - before === 9, `SyncRandMod 9회(n = 10 → 2) ${mt.calls - before}`);
  const mt2 = new MT19937(1);
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (let n = 10; n >= 2; n--) {
    const j = Number((BigInt(mt2.nextU32()) * BigInt(n)) >> 32n);
    [a[n - 1], a[j]] = [a[j], a[n - 1]];
  }
  ok(a.join() === v.join(), 'Fisher–Yates a[n−1] ↔ a[(u·n)>>32]');
  const reg = L.register(spec, inp(four([1, 0, 1, 0]), { isChara: true, judgeType: 1 }));
  const r = L.diceRoll(reg, () => new MT19937(7).nextU32());
  ok(r.candidates.join() === '0,2', '후보 = 목록1');
  ok(r.winner === (r.values[0] > r.values[2] ? 0 : 2), '승자 = 최댓값');
  ok(r.writes.length === 2 && r.writes.every((w) => w.winLose === (w.pid === r.winner ? 1 : 0)), '후보에게만 WinLose 기록');
  const s = L.slotsOf(spec.pos.pos_pc_chara_dice);
  const p0 = s.pos_pc01.pos;
  const p1 = s.pos_pc01_fix.pos;
  const mid = L.walkAt(p0, p1, 1);
  near(mid[0], (p0[0] + p1[0]) / 2, 1e-6, '이동 s = 1 → 중점 x');
  near(mid[2], (p0[2] + p1[2]) / 2, 1e-6, '이동 s = 1 → 중점 z');
  const ts = L.walkTimes();
  ok(ts[0] === 0 && ts[ts.length - 1] <= 2, `이동 표본 s 0 … ${ts[ts.length - 1]}`);
  console.log(`  이동 표본 ${ts.length}개, 마지막 s = ${ts[ts.length - 1]}, 마지막 P.z = ${L.walkAt(p0, p1, ts[ts.length - 1])[2]} (P1.z ${p1[2]})`);
  near(L.walkAt(p0, p1, ts[ts.length - 1])[2], p0[2] + (p1[2] - p0[2]) * ts[ts.length - 1] * 0.5, 1e-5, '마지막 표본 = 식 그대로(끝점 강제 없음)');
}

section('6 텔롭 번호(FUN_71002f1870)');
{
  ok(L.plan(spec, inp(four([1, 0, 0, 0]))).telopNo === 7, 'WinRightBottom → 7');
  ok(L.plan(spec, inp(four([1, 1, 1, 1]))).telopNo === 5, 'WinCenterBottom → 5');
  ok(L.plan(spec, inp(four([2, 2, 2, 2]))).telopNo === 8, 'Draw → 8');
  ok(L.plan(spec, inp(coinP([5, 0, 0, 0]), { isCoin: true })).telopNo === -1, 'Coin None → −1');
  const a = L.plan(spec, inp(four([1, 1, 0, 0], ['pc01', 'pc07', 'pc03', 'pc04'])));
  ok(a.telopPlace === 'WinRightTop' && a.telopNo === 6, `승자 중 GetOrder 최대 = 요시(win2 cam1 normal = 1) → Telop_2 ${a.telopPlace}`);
  const b = L.plan(spec, inp(four([1, 1, 0, 0], ['pc07', 'pc01', 'pc03', 'pc04'])));
  ok(b.telopPlace === 'WinRightBottom', `GetOrder 최대 = 마리오(0) → Telop_1 ${b.telopPlace}`);
  const c = L.plan(spec, { ...inp(four([1, 1, 0, 0], ['pc01', 'pc07', 'pc03', 'pc04'])), entryCount: 5 });
  ok(c.telopPlace === 'WinRightBottom', 'MGEntry 4명 아니면 Telop_1');
}

section('7 에셋 존재(404 0)');
{
  let missing = 0;
  const need = new Set<string>();
  for (const c of spec.chars) for (const k of charaFiles(c)) need.add(k);
  for (const n of spec.cams) need.add(`mgresult/cam/${n}.json`);
  for (const k of need)
    if (!existsSync(join(A, k))) {
      missing++;
      console.log('  없음:', k);
    }
  ok(missing === 0, `명세가 가리키는 파일 ${need.size}개 중 없음 ${missing}`);
  let refMiss = 0;
  const camSet = new Set(spec.cams);
  for (const r of spec.list.list) {
    for (const k of ['Pos_Normal_1', 'Pos_Normal_2', 'Pos_Overlook_1', 'Pos_Overlook_2'] as const) if (!spec.pos[r[k]]) refMiss++;
    for (const k of ['Cam_Normal_1', 'Cam_Normal_2', 'Cam_Overlook_1', 'Cam_Overlook_2'] as const) {
      const names = r.CamType === 'PC' ? spec.chara.map((c) => r[k] + String(c.number).padStart(2, '0')) : [r[k]];
      for (const n of names)
        if (!camSet.has(n)) {
          refMiss++;
          console.log('  표가 가리키는 카메라 없음:', n);
        }
    }
  }
  ok(refMiss === 0, `결과 표가 가리키는 배치·카메라 없음 ${refMiss}`);
  ok(Object.keys(spec.pos).length === 31 && spec.chars.length === 22 && spec.chara.length === 22, '배치 31·캐릭터 22');
  const sf = stageFiles(spec, { ...inp(four([1, 1, 0, 0])), mgId: 't', opts: { ...DEFAULT_RESULT_OPTIONS, themeChara: 'pc14' }, rand: () => 0 } as unknown as ResultStageInputExt);
  ok(sf.includes('mgresult/cam/result_cam_win2_1.json') && sf.includes('chara/pc01/motion/co_win00a.glb') && !sf.some((k) => k.includes('pc14')), `미리 받기 목록(테마는 JudgeType ≠ 0 일 때만) ${sf.length}`);
  ok(sf.every((k) => existsSync(join(A, k))), '미리 받기 목록 전부 있음');
}

section('8 import 경계');
{
  const dir = join(WEB, 'script', 'app', 'minigame', 'frame', 'result');
  const allow = /^(three|\.\/[a-z]+|@app\/scene\/menu\/charselect\/(preview3d|types)|@app\/scene\/world\/plaza\/heading|@app\/minigame\/frame\/scene\/resultContract)$/;
  for (const fn of readdirSync(dir)) {
    const src = readFileSync(join(dir, fn), 'utf8');
    for (const m of src.matchAll(/from '([^']+)'/g)) ok(allow.test(m[1]), `${fn}: import '${m[1]}'`);
  }
  const logic = readFileSync(join(dir, 'logic.ts'), 'utf8');
  ok(!/from '/.test(logic), 'logic.ts import 0');
}

console.log(`\n${count - fails}/${count} 통과`);
if (fails) process.exit(1);
