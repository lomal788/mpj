/**
 * 항구 추가 에셋(web/assets/mgmet/extra.json ← tools/analysis/mgmet_web_assets.py)의 문구·메시지 속성·소리를 공용 명세에 더한다.
 * 텍스처는 MgmView.create({ parts: ['mgmet.json', MGMET_EXTRA_PART] }) 가 합친다.
 */
import type { MgmSpec, MgmSpecPart, MsgAttr } from '../../../../shell/mgmcommon/types';

export const MGMET_EXTRA_PART = '../mgmet/extra.json';

export interface MgmetExtra extends MgmSpecPart {
  texts: Record<string, string>;
  msgAttr: Record<string, MsgAttr>;
  sounds: Record<string, { file: string; gain: number }>;
}

/** 같은 이름은 공용 쪽을 남긴다 */
export function applyMgmetExtra(spec: MgmSpec, extra: MgmetExtra): void {
  for (const [k, v] of Object.entries(extra.texts)) if (!(k in spec.texts)) spec.texts[k] = v;
  for (const [k, v] of Object.entries(extra.msgAttr)) if (!(k in spec.msgAttr)) spec.msgAttr[k] = v;
  for (const [k, v] of Object.entries(extra.sounds)) if (!(k in spec.sounds)) spec.sounds[k] = v;
}
