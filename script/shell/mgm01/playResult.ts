/**
 * 프리 플레이 한 판이 돌아올 때의 결과 정리 — 실제 실행(cfg.play)이 있으면 그 결과만 쓴다(실패·미등록 = null → 기록·Round·플레이 횟수 그대로),
 * 시험용 가짜 결과는 실제 실행이 없을 때(ui.html 단독)만. 결과가 있으면 플레이 횟수 +1(최대 999 — 원본은 미니게임 장면 save 사건, 웹 근사).
 * 계약: docs/shell/minigame_scene.md §12.12.4.
 */
import type { MgmSave, MgResultEntry } from '../mgmcommon/contracts';

export function countMinigamePlay(save: MgmSave, id: number): void {
  const e = save.minigame(id);
  save.setMinigame(id, { head: Math.min(999, e.head + 1), flags: e.flags });
}

export function settlePlayResult(save: MgmSave, id: number, hasRealPlay: boolean, real: MgResultEntry | null, fake: () => MgResultEntry): MgResultEntry | null {
  if (!hasRealPlay) return fake();
  if (real) countMinigamePlay(save, id);
  return real;
}
