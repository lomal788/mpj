/**
 * 미니게임 공용 틀(bq::MinigameScene) 공개 진입점 — 순수 로직, import 0(셸 경계). 설계: docs/shell/minigame_scene.md §12.
 */
export * from './flow';
export * from './gate';
export * from './resultContract';
export * from './simple';
export * from './sound';
export * from './types';
export * from './ui';
import type { MgUiData, UiAnimTable, UiPaneBox } from './types';

/** ui.json(mgscene_web_assets.py) → 틀이 쓰는 UI 데이터(애니 길이·문구·x_bd_00) */
export function mgUiData(ui: {
  anims: Record<string, Record<string, { frameSize: number; loop: boolean }>>;
  texts: Record<string, string>;
  layouts: Record<string, { root: UiPaneJson }>;
}): MgUiData {
  const anims: UiAnimTable = {};
  for (const [l, tags] of Object.entries(ui.anims)) {
    anims[l] = {};
    for (const [t, a] of Object.entries(tags)) anims[l][t] = { frames: a.frameSize, loop: a.loop };
  }
  const boxes: Record<string, UiPaneBox> = {};
  for (const [l, lay] of Object.entries(ui.layouts)) {
    const find = (p: UiPaneJson): UiPaneJson | null => (p.name === 'x_bd_00' ? p : p.children.reduce<UiPaneJson | null>((a, c) => a ?? find(c), null));
    const bd = find(lay.root);
    if (bd) boxes[l] = { t: [bd.translate[0], bd.translate[1]], size: [bd.size[0], bd.size[1]] };
  }
  return { anims, texts: ui.texts, boxes };
}

export interface UiPaneJson {
  name: string;
  translate: number[];
  size: number[];
  children: UiPaneJson[];
}

/** 미리 받기 목록(assets/ 기준) — ui.json 이 가리키는 그림·글꼴 시트·텔롭 글꼴과 소리 명세 */
export function mgscenePrefetch(ui: { textures: Record<string, string>; telopFont?: { file: string } } | null): string[] {
  const out = ['mgscene/ui.json', 'mgscene/tables.json', 'mgscene/sound/sound.json'];
  if (!ui) return out;
  const norm = (p: string): string => {
    const parts: string[] = [];
    for (const s of `mgscene/${p}`.split('/')) {
      if (s === '..') parts.pop();
      else if (s !== '.') parts.push(s);
    }
    return parts.join('/');
  };
  for (const f of Object.values(ui.textures)) out.push(norm(f));
  if (ui.telopFont) out.push(norm(ui.telopFont.file));
  return [...new Set(out)];
}
