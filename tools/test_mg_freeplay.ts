/**
 * 프리 플레이 결과·설정 전달 시험(노드, 헤드리스 없음) — docs/shell/minigame_scene.md §12.12.4·§12.12.5, 감사 common_system_audit.md §1.2 P1 3줄.
 * 1) 프리 플레이 요청 → setup(팀·참가·CPU·리듬·엔드리스·설명·자이로) → 실제 mg1801 한 판 → 기록 {id, judge, results[4]} raw byte
 * 2) 돌아온 결과 정리: 실제 실행이 있으면 실패(null)는 null 그대로(가짜 결과 없음, 플레이 횟수 그대로), 성공은 플레이 횟수 +1
 * 3) 미등록 게임 → null, 4) 승패 표 점수(byte == (judge ≠ 0)) — 리듬은 승 0
 *
 *   npx tsx tools/test_mg_freeplay.ts
 */
import { GAMES } from '../script/games';
import { mg1801Game } from '../script/games/mg1801';
import type { Mg1801Logic } from '../script/games/mg1801/logic/game';
import { freePlaySetup } from '../script/mgrun';
import { MemorySave, type MgResultEntry } from '../script/shell/mgmcommon';
import { settlePlayResult, type Mgm01PlayRequest } from '@app/scene/minigame/mgm01';
import { historyScores } from '@app/scene/minigame/mgm01/historyView';
import { NodeMgRun } from './mg_node_host';

let n = 0;
let bad = 0;
const ok = (c: boolean, msg: string, d = ''): void => {
  n++;
  if (!c) bad++;
  console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}${d ? `  — ${d}` : ''}`);
};

const req = (o: Partial<Mgm01PlayRequest> = {}): Mgm01PlayRequest => ({
  id: 101,
  name: 'mg1801',
  rule: 'Rhythm',
  ruleNo: 10,
  filter: { enumNo: 0, index: 0, fromFavorite: false },
  team: { table: 0, choice: 0, format: 0, teamIdByPid: [0, 0, 0, 0], gamePlayByPid: [true, true, true, true] },
  cpu: 2,
  endless: false,
  rhythm: 1,
  useGyro: true,
  callInst: true,
  favoriteDirty: false,
  ...o,
});

await mg1801Game.load?.();
{
  const r = req();
  const fp = freePlaySetup(r, ['pc05', 'pc02', 'pc13', 'pc51'], [false, true, true, true]);
  ok(fp.players.every((p) => p.comLevel === 2 && p.teamId === 0 && p.gamePlay === true) && fp.players[0].char === 'pc05' && !fp.players[0].isCom, '요청 → setup: 캐릭터·CPU 여부·CPU 강도·팀·참가', JSON.stringify(fp.players[0]));
  ok(fp.play.rhythm === 1 && fp.play.useGyro && fp.play.callInst && fp.play.comLevel === 2 && fp.endless === false, '요청 → 설정: 리듬·자이로·설명·CPU·엔드리스');
  const run = new NodeMgRun(mg1801Game, { players: fp.players, seed: 3, practice: false, options: {} }, { play: fp.play, endless: fp.endless });
  const lg = run.run.logic as Mg1801Logic;
  ok(lg.game.cfg.mode === 2 && lg.game.cfg.chart === 'mg1801_rm_chart01', '리듬 설정 1 → mg1801 하드(RmGameWork+0x20 = 2, chart01)', `${lg.game.cfg.mode} ${lg.game.cfg.chart}`);
  ok(run.run.scene.players.map((p) => `${p.teamId}/${p.gamePlay}`).join() === '0/true,0/true,0/true,0/true' && run.run.scene.ctx.play?.useGyro === true, '팀·참가·자이로가 틀 PlayerWork 자리·문맥까지');
  for (let f = 0; f < 6000 && !run.run.ended; f++) run.step([null, null, null, null]);
  ok(run.run.ended && lg.done, '한 판 끝(틀 0x13)', `${run.run.scene.stage}`);
  const e = run.run.resultEntry(r.id);
  ok(e.id === 101 && e.judge === 1 && e.results.join() === '2,2,2,2', '기록: GameRule 10 → judge 1(GameRule ∉ {0,7}), byte 2×4(FUN_71001f271c)', JSON.stringify(e));
  ok(historyScores({ count: 1, earliest: () => e }).join() === '0,0,0,0', '승패 표 점수: byte 2 ≠ (judge≠0)=1 → 리듬은 승 0(옛 웹은 네 명 모두 승)');

  const save = new MemorySave();
  const head0 = save.minigame(r.id).head;
  let fakeCalls = 0;
  const fake = (): MgResultEntry => {
    fakeCalls++;
    return { id: r.id, judge: 1, results: [1, 0, 0, 0] };
  };
  ok(settlePlayResult(save, r.id, true, e, fake) === e && save.minigame(r.id).head === head0 + 1 && fakeCalls === 0, '실제 결과 → 그대로, 플레이 횟수 +1, 가짜 결과 안 씀');
  ok(settlePlayResult(save, r.id, true, null, fake) === null && save.minigame(r.id).head === head0 + 1 && fakeCalls === 0, '실패(null) → null(가짜 결과로 바꾸지 않음), 플레이 횟수 그대로');
  ok(settlePlayResult(save, r.id, false, null, fake)?.results.join() === '1,0,0,0' && fakeCalls === 1, '실제 실행 훅이 없을 때(dev/ui 단독)만 가짜 결과');
}
{
  ok(!GAMES.some((g) => g.id === 'mg0101'), '미등록 게임(mg0101)은 등록 목록에 없다 → main.playFromList 가 null');
  const team = freePlaySetup(req({ team: { table: 2, choice: 1, format: 5, teamIdByPid: [0, 1, 0, 1], gamePlayByPid: [true, true, true, true] } }), [], [false, false, true, true]);
  ok(team.players.map((p) => p.teamId).join() === '0,1,0,1', '2vs2 후보 1 팀 → teamId [0,1,0,1](FUN_71001f1930)');
  const dueling = freePlaySetup(req({ team: { table: 6, choice: 0, format: 6, teamIdByPid: [0, 1, -1, -1], gamePlayByPid: [true, true, false, false] } }), [], [false, false, true, true]);
  ok(dueling.players.map((p) => `${p.teamId}/${p.gamePlay}`).join() === '0/true,1/true,-1/false,-1/false', '1vs1 → 빠진 자리 teamId −1·gamePlay 거짓');
}

console.log(`\n${n - bad}/${n} 통과`);
process.exitCode = bad ? 1 : 0;
