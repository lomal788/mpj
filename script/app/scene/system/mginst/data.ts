import { plainText } from '@app/common/ui/text';
import type { GuideGroup, MgInstAssets, MgInstContent } from './types';

export function mgInstContent(assets: MgInstAssets, game: string, group: GuideGroup = 'A', rowIndex?: number): MgInstContent {
  const raw = rowIndex === undefined ? assets.raw.mgInst.slice(1).find(row => row.Name === game) : assets.raw.mgInst[rowIndex];
  if (!raw) throw new Error(`mginst: missing game data ${game}`);
  if (raw.Name !== game) throw new Error(`mginst: rowIndex does not match ${game}`);
  const texts = assets.texts;
  const text = (key: string): string => key ? plainText(texts[key] ?? '', texts) : '';
  const insert = (key: string, value: string): string => plainText(texts[key] ?? '', texts, { Text0: value });
  const index = { A: 0, B: 1, C: 2 }[group];
  const operations = [0, 1, 2, 3].map(i => text(String(raw[`Input${i}_${group}`] ?? ''))).filter(Boolean);
  return {
    game,
    title: insert('inst_mgTitle', texts[`im_${game}_name`] ?? raw.Title),
    rule: insert('inst_mg_rule', String(raw.DetailExp)),
    operationTitle: text(String(raw[`InputTitle_${group}`] ?? '')),
    operations,
    advantageTitle: text('inst_adv_ui'),
    advantage: insert('inst_mg_adv', String(raw.AdvantagePlayerExp)),
    readyLabel: text('inst_readyOK'),
    okLabel: text('inst_OK'),
    group,
    controllerId: Number(raw[`ControllerID_${index}`]),
    controllerHold: String(assets.raw.controller.find(row => row.ID === Number(raw[`ControllerID_${index}`]))?.Hold ?? ''),
    instLayerId: Number(raw[`Inst_LayerID_${index}`]),
    usesGyro: [0, 1, 2].some(i => raw[`Gyro${i}_${group}`] === 1),
    raw,
  };
}
