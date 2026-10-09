/**
 * 프리 플레이 한 판이 돌아올 때의 결과 정리 — 실제 실행(cfg.play)이 있으면 그 결과만 쓴다(실패·미등록 = null → 기록·Round·플레이 횟수 그대로),
 * 시험용 가짜 결과는 실제 실행이 없을 때(dev/ui.html 단독)만. 플레이 횟수 +1(최대 999)은 원본처럼 한 판 장면의 save 사건(단계 11, mgrun commitPlayCount — docs/engine/16_save.md)이 하고,
 * 여기서는 장면이 세지 않은 결과(countedByScene 거짓)일 때만 센다.
 * 계약: docs/shell/minigame_scene.md §12.12.4.
 */
import type { MgmSave, MgResultEntry } from '@app/common/ui/contracts';

export function countMinigamePlay(save: MgmSave, id: number): void {
  const e = save.minigame(id);
  save.setMinigame(id, { head: Math.min(999, e.head + 1), flags: e.flags });
}

/** 미니게임 장면 단계 11 FUN_71002db9f0: 참가자 중 사람(PlayerType≠1)마다 그 플레이어 세이브(GetSaveData(PlayerID), 없으면 건너뜀)의 횟수 +1. docs/engine/16_save.md §1.3 */
export function commitPlayCount(saveOf: (pid: number) => MgmSave | null, id: number, players: readonly { pid: number; isCom: boolean; gamePlay?: boolean }[]): number {
  let n = 0;
  for (const p of players) {
    if (p.isCom || p.gamePlay === false) continue;
    const s = saveOf(p.pid);
    if (!s) continue;
    countMinigamePlay(s, id);
    n++;
  }
  return n;
}

export function settlePlayResult(save: MgmSave, id: number, hasRealPlay: boolean, real: MgResultEntry | null, fake: () => MgResultEntry, countedByScene = false): MgResultEntry | null {
  if (!hasRealPlay) return fake();
  if (real && !countedByScene) countMinigamePlay(save, id);
  return real;
}
