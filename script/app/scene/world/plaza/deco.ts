/**
 * 장식·배경 오브제 보임 규칙(docs/shell/plaza_3d.md §6.6).
 * - menu00::MapManager::ApplyDecoItem @0x71000148f0: DecoItemID 마다 MapStructure key 의 모델을 SetVisible(IsDisplay(id)) [판독: 키 문자열 복원].
 *   0x3f·0x40·0x41 = 장식 NPC B·C·E 묶음 켜기/끄기, 0x43 = CentralPlaza 분수 별 FX(FX_DECO_FOUNTAIN_STAR00·SE) [판독].
 * - main bq::save::DecoItemData @0x710023aaa0~: id 마다 3비트(get·new·display), 종류 표 @0x71015d7ad0, 기본 장식 = IsDefault 마스크 0x101001020081,
 *   SetDisplay 는 종류가 4·8(IsMultipleDisplay)이 아니면 같은 종류의 display 를 먼저 지운다 [판독].
 * - 새 저장 데이터의 처음 값 = 기본 장식 6개만 display [추정: 초기화 함수 미판독, IsDefault 만 판독].
 * - MapManager::ApplyBgBd @0x71000197e0: bit 가 0(잠김)이면 bdNNObj 숨김·bdNNObj_lock 보임, 1 이면 반대 [판독].
 */
import type { PlazaDecoState, PlazaLayoutEntry } from './types';

export const DECO_ITEMS: readonly (readonly string[])[] = [
  ['Sculpture_Dft'], ['Sculpture_Bd01'], ['Sculpture_Bd04'], ['Sculpture_Bd05'], ['Sculpture_Bd06'], ['Sculpture_Bd07'], ['Sculpture_Star'],
  ['Garland_Dft'], ['Garland_Bd01'], ['Garland_Bd04'], ['Garland_Bd05'], ['Garland_Bd06'], ['Garland_Bd07'], ['Garland_Star'], ['Garland_Blue'], ['Garland_Green'], ['Garland_Yellow'],
  ['Fountain_Dft'], ['Fountain_Bd01'], ['Fountain_Bd04'], ['Fountain_Bd05'], ['Fountain_Bd06'], ['Fountain_Bd07'], ['Fountain_Star'],
  ['Tree_Dft'], ['Tree_Bd01'], ['Tree_Bd04'], ['Tree_Bd05'], ['Tree_Bd06'], ['Tree_Bd07'], ['Tree_Star'],
  ['Plant_Bd01'], ['Plant_Bd04'], ['Plant_Bd05'], ['Plant_Bd06'], ['Plant_Bd07'],
  ['Tile_Dft'], ['Tile_Bd01'], ['Tile_Bd04'], ['Tile_Bd05'], ['Tile_Bd06'], ['Tile_Bd07'], ['Tile_Star'], ['Tile_LittleStar'],
  ['Balloon_Dft_00', 'Balloon_Dft_01'], ['Balloon_Bd01_00', 'Balloon_Bd01_01'], ['Balloon_Bd04_00', 'Balloon_Bd04_01'], ['Balloon_Bd05_00', 'Balloon_Bd05_01'],
  ['Balloon_Bd06_00', 'Balloon_Bd06_01'], ['Balloon_Bd07_00', 'Balloon_Bd07_01'], ['Balloon_Star_00', 'Balloon_Star_01'], ['Balloon_LittleStar_00', 'Balloon_LittleStar_01'],
  ['Pick_Mario'], ['Pick_Luigi'], ['Pick_Peach'], ['Pick_Yoshi'], ['Pick_DK'], ['Pick_Daisy'], ['Pick_Wario'], ['Pick_Waluigi'], ['Pick_KoopaJr'], ['Pick_Rosetta'],
  ['Deco_D_AirGullLocater', 'Deco_D_Gull00', 'Deco_D_Gull01', 'Deco_D_Gull02'],
  [], [], [],
  ['Deco_A_Rainbow'],
  [],
];

/** DecoItemData 종류 표 @0x71015d7ad0 [데이터] */
export const DECO_TYPE: readonly number[] = [
  0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5,
  6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8,
];

export const DECO_ID = { NPC_B: 0x3f, NPC_C: 0x40, NPC_E: 0x41, RAINBOW: 0x42, FOUNTAIN_STAR_FX: 0x43 } as const;

const DEFAULT_MASK = 0x101001020081n;

export function isDefaultDeco(id: number): boolean {
  return id < 0x2d && ((DEFAULT_MASK >> BigInt(id)) & 1n) === 1n;
}

export function isMultipleDisplay(type: number): boolean {
  return type === 4 || type === 8;
}

const KEY_TO_ID = new Map<string, number>();
DECO_ITEMS.forEach((keys, id) => keys.forEach((k) => KEY_TO_ID.set(k, id)));

export function decoIdOfKey(key: string): number | undefined {
  return KEY_TO_ID.get(key);
}

export function defaultDecoState(): PlazaDecoState {
  return { display: DECO_ITEMS.map((_, id) => isDefaultDeco(id)), unlockBd: 0 };
}

/** DecoItemData::SetDisplay — 한 개만 보이는 종류면 같은 종류를 먼저 끈다 */
export function setDecoDisplay(s: PlazaDecoState, id: number, on: boolean): void {
  if (on && !isMultipleDisplay(DECO_TYPE[id])) DECO_TYPE.forEach((t, j) => t === DECO_TYPE[id] && (s.display[j] = false));
  s.display[id] = on;
}

/** 시험값 문자열: 'all' = 전부 보임, 'none' = 전부 끔, 'default', 또는 key·id 를 쉼표로(예 'Sculpture_Bd04,Pick_Mario,0x3f') — 앞에서부터 SetDisplay(true). bd 해금은 'bd=0x10101' 꼴 */
export function parseDecoParam(text: string, base: PlazaDecoState = defaultDecoState()): PlazaDecoState {
  const s: PlazaDecoState = { display: [...base.display], unlockBd: base.unlockBd };
  for (const tok of text.split(',').map((t) => t.trim()).filter(Boolean)) {
    if (tok === 'all') s.display = s.display.map(() => true);
    else if (tok === 'none') s.display = s.display.map(() => false);
    else if (tok === 'default') s.display = defaultDecoState().display;
    else if (tok.startsWith('bd=')) s.unlockBd = Number(tok.slice(3));
    else {
      const id = /^(0x[0-9a-f]+|\d+)$/i.test(tok) ? Number(tok) : decoIdOfKey(tok);
      if (id !== undefined && id >= 0 && id < DECO_ITEMS.length) setDecoDisplay(s, id, true);
    }
  }
  return s;
}

/** MapStructure 항목이 지금 보이는지 */
export function decoVisible(e: PlazaLayoutEntry, s: PlazaDecoState): boolean {
  const bg = /^(bd0[236])Obj(_lock)?$/.exec(e.key);
  if (bg) {
    const bit = { bd02: 0, bd03: 8, bd06: 16 }[bg[1]]!;
    const unlocked = ((s.unlockBd >> bit) & 1) === 1;
    return bg[2] ? !unlocked : unlocked;
  }
  const id = decoIdOfKey(e.key);
  if (id === undefined) return true;
  return s.display[id] === true;
}
