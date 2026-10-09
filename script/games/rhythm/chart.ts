/**
 * 채보 — 원본 RmChartDataMan [판독: ReadChartData @0x710043ecd0]. 키 8개(1P~4P, OBJ1~OBJ4), 줄 수 = 1P 길이.
 * 공용 부분(JSON → 줄)만 둔다. 채보 파일 import 와 이름 표는 게임 쪽(예 games/mg1801/logic/chart.ts).
 */

export type RmRawChart = Record<string, { code: string }[]>;

/** 한 줄 = 원본 RmMgSceneBase::Data 의 문자열 부분 */
export interface RmChartRow {
  index: number;
  /** 1P~4P */
  player: [string, string, string, string];
  /** OBJ1~OBJ4 */
  obj: [string, string, string, string];
}

/** 원본 RmChartDataMan::ReadChartData 결과를 줄 목록으로(키 8개가 모두 있는 채보 — 02_rhythm.md 6.1) */
export function readChartRows(c: RmRawChart): RmChartRow[] {
  const at = (key: string, i: number): string => c[key]?.[i]?.code ?? '';
  return c['1P'].map((_, i) => ({
    index: i,
    player: [at('1P', i), at('2P', i), at('3P', i), at('4P', i)],
    obj: [at('OBJ1', i), at('OBJ2', i), at('OBJ3', i), at('OBJ4', i)],
  }));
}
