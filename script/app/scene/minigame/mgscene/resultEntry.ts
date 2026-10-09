/**
 * 한 판 결과 → 모드 결과 기록 한 칸(원본 MinigameModeWork::SetMinigameResult 계약 {id, judge, results[4]} raw byte) — import 0.
 * byte 규칙 = main FUN_71001f271c(analysis/decomp/mgm01_main_contract.c, 호출자 미확정): GameRule 8·10 이면 judge 0 → 0xFF×4, 아니면 0x02×4,
 * 그 밖 judge 0 → PlayerWork rank, judge ≠ 0 → WinLose(−1 = 0xFF). 프리 플레이 judge = Mgm01SetupMinigamePlayInfo @0x71001f1c60
 * SetGameJudgeType(GameRule ≠ 7 && GameRule ≠ 0). 설계: docs/shell/minigame_scene.md §12.12.4.
 */
import type { MgPlayer } from './types';

export interface MgResultBytes {
  id: number;
  judge: number;
  results: [number, number, number, number];
}

export function freePlayJudgeType(gameRule: number): number {
  return gameRule !== 7 && gameRule !== 0 ? 1 : 0;
}

export function minigameResultEntry(id: number, judge: number, gameRule: number, players: readonly Pick<MgPlayer, 'pid' | 'rank' | 'winLose'>[]): MgResultBytes {
  const byte = (v: number): number => v & 0xff;
  if ((gameRule | 2) === 10) {
    const b = judge === 0 ? 0xff : 0x02;
    return { id, judge, results: [b, b, b, b] };
  }
  const results: [number, number, number, number] = [0xff, 0xff, 0xff, 0xff];
  for (let pid = 0; pid < 4; pid++) {
    const p = players.find((x) => x.pid === pid);
    if (p) results[pid] = byte(judge === 0 ? p.rank : p.winLose);
  }
  return { id, judge, results };
}
