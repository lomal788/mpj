/**
 * 채보 — 원본 RmChartDataMan [판독: ReadChartData @0x710043ecd0]. 키 8개(1P~4P, OBJ1~OBJ4), 줄 수 = 1P 길이.
 * 채보 JSON 은 원본 그대로이고 BOM 만 뺐다(charts/).
 */
import chart00 from './charts/mg1801_rm_chart00.json';
import chart01 from './charts/mg1801_rm_chart01.json';
import chart05s from './charts/mg1801_rm_chart05s.json';

type RawChart = Record<string, { code: string }[]>;

/** 한 줄 = 원본 RmMgSceneBase::Data 의 문자열 부분 */
export interface ChartRow {
  index: number;
  /** 1P~4P */
  player: [string, string, string, string];
  /** OBJ1~OBJ4 */
  obj: [string, string, string, string];
}

export const CHARTS: Record<string, RawChart> = {
  mg1801_rm_chart00: chart00 as RawChart,
  mg1801_rm_chart01: chart01 as RawChart,
  mg1801_rm_chart05s: chart05s as RawChart,
};

export function chartRows(name: string): ChartRow[] {
  const c = CHARTS[name];
  if (!c) throw new Error(`mg1801: 채보가 없다 ${name}`);
  const at = (key: string, i: number): string => c[key]?.[i]?.code ?? '';
  return c['1P'].map((_, i) => ({
    index: i,
    player: [at('1P', i), at('2P', i), at('3P', i), at('4P', i)],
    obj: [at('OBJ1', i), at('OBJ2', i), at('OBJ3', i), at('OBJ4', i)],
  }));
}
