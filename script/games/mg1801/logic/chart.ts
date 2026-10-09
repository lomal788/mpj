/**
 * 채보 — 원본 RmChartDataMan [판독: ReadChartData @0x710043ecd0]. 키 8개(1P~4P, OBJ1~OBJ4), 줄 수 = 1P 길이.
 * 채보 JSON 은 원본 그대로이고 BOM 만 뺐다(charts/).
 */
import chart00 from './charts/mg1801_rm_chart00.json';
import chart01 from './charts/mg1801_rm_chart01.json';
import chart05s from './charts/mg1801_rm_chart05s.json';
import { type RmChartRow, type RmRawChart as RawChart, readChartRows } from '../../rhythm/chart';

/** 한 줄 = 원본 RmMgSceneBase::Data 의 문자열 부분 */
export type ChartRow = RmChartRow;

export const CHARTS: Record<string, RawChart> = {
  mg1801_rm_chart00: chart00 as RawChart,
  mg1801_rm_chart01: chart01 as RawChart,
  mg1801_rm_chart05s: chart05s as RawChart,
};

export function chartRows(name: string): ChartRow[] {
  const c = CHARTS[name];
  if (!c) throw new Error(`mg1801: 채보가 없다 ${name}`);
  return readChartRows(c);
}
