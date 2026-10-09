/**
 * 리듬 점수판 판정 — 원본 RmUiStatusMan(docs/engine/02_rhythm.md 8.2).
 */
import { F } from './data';

/** 원본 RmUiStatusMan::GetStarAchieveRate @0x7100436558 / GetStarAchieveJudge @0x7100436590 */
export function starJudge(achieved: number, total: number): { rate: number; judge: number } {
  let rate = total > 0 ? F(F(achieved / total) * 100) : 0;
  if (rate < 0) rate = 0;
  if (rate > 100) rate = 100;
  const judge = rate >= 80 ? 3 : rate >= 40 ? 2 : rate > 0 ? 1 : 0;
  return { rate, judge };
}
