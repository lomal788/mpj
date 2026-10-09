/**
 * 로직 결정성 검사 — 등록된 게임마다 같은 설정으로 로직을 두 번 돌려 매 프레임 state·events 가 같은지 본다(노드, DOM 없음).
 * 원본과의 대조(골든)가 아니라 "같은 입력이면 같은 결과"만 확인한다. 원본 대조는 게임별 verify 도구가 한다(DESIGN 6절).
 *
 *   npm run check                      전 게임, 시드 1, 전원 CPU, 최대 36000 프레임
 *   npx tsx tools/check_logic.ts mg1801 --seed 7 --frames 5000
 */
import { GAMES } from '../script/games';
import type { GameSetup } from '../script/game';
import { determinismCheck } from './mg_determinism';
import { NodeMgRun } from './mg_node_host';

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const only = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const seed = Number(argValue('--seed') ?? 1) >>> 0;
const maxFrames = Number(argValue('--frames') ?? 36000);

const games = only.length ? GAMES.filter((g) => only.includes(g.id)) : GAMES;
if (games.length === 0) console.log(GAMES.length === 0 ? '등록된 게임이 없다(script/games/index.ts).' : `없는 게임: ${only.join(', ')}`);
let bad = 0;
for (const def of games) {
  await def.load?.();
  const setup: GameSetup = { players: [0, 1, 2, 3].map((i) => ({ char: `pc0${i + 1}`, isCom: true, comLevel: 0 })), seed, practice: false };
  const r = determinismCheck(() => new NodeMgRun(def, setup), () => ({ pads: () => [null, null, null, null] }), { maxTicks: maxFrames });
  if (!r.ok) {
    bad++;
    console.log(`${def.id}: 프레임 ${r.firstDiff} 에서 달라짐`);
  } else {
    console.log(`${def.id}: ${r.ticks} 프레임 같음${r.ended ? '' : ` (끝나지 않음, 최대 ${maxFrames})`}`);
  }
}
process.exitCode = bad ? 1 : 0;
