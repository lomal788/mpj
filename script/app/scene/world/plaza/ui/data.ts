/**
 * 광장 2D UI 명세 확장(assets/plaza/ui/plaza_ui.json) — 스탬프 표·단축·상수. 근거: docs/shell/plaza_3d.md §5.1.
 */
import type { MgmSpec, MgmSpecPart } from '@app/common/ui';
import { CHARA_PC } from '@app/scene/menu/online';

export const PLAZA_UI_PART = '../plaza/ui/plaza_ui.json';

/** stampList.json StampData 한 줄(id = 배열 번호 = StampID) [데이터] */
export interface StampDef {
  id: number;
  number: number;
  type: 'PC' | 'COMMON';
  layout: string;
  texture: string;
  label: string;
  listLabel: string;
  color: [number, number, number];
  valid: number;
  price: number;
  unlock: number;
}

export interface PlazaUiExtra extends MgmSpecPart {
  texts: Record<string, string>;
  msgAttr: MgmSpec['msgAttr'];
  sounds: Record<string, { file: string; gain: number }>;
  stamps: StampDef[];
  /** StampShortcutData → StampID, 순서 L·R·X·Y [데이터] */
  stampShortcuts: { menu: number[]; bd: number[] };
}

/** 문구·소리를 공용 명세에 더한다(같은 이름은 공용 쪽을 남김, online applyOnlineExtra 와 같은 규칙) */
export function applyPlazaUiExtra(spec: MgmSpec, extra: PlazaUiExtra): void {
  for (const [k, v] of Object.entries(extra.texts)) if (!(k in spec.texts)) spec.texts[k] = v;
  for (const [k, v] of Object.entries(extra.sounds)) if (!(k in spec.sounds)) spec.sounds[k] = v;
}

/** 스탬프 그림 텍스처 키: 캐릭터 스탬프 = stamp_<PCNumber 2자리><번호 3자리>, 공용 = TextureName [데이터 Parts BNTX 이름] */
export function stampTexture(s: StampDef, chara: number): string {
  if (s.type === 'PC') {
    const pc = (CHARA_PC[chara] ?? CHARA_PC[0]).slice(2);
    return `stamp_${pc}${String(s.number % 1000).padStart(3, '0')}^u`;
  }
  return `${s.texture}^u`;
}

/** 목록 항목: 가진 것 또는 해금 그룹 −1(저장 데이터 없음 → 해금 그룹 −1 만) [판독 FUN_710035ae30, UnlockGroup 대응 추정] */
export function listStamps(stamps: readonly StampDef[], owned: (id: number) => boolean = () => false): number[] {
  return stamps.filter((s) => owned(s.id) || s.unlock === -1).map((s) => s.id);
}

/** menu00::AREA → [이름 라벨, 설명 라벨] [판독 ComUiLocationTelop::SetArea @0x7100073ac8] */
export const AREA_LABELS: readonly (readonly [string, string])[] = [
  ['im_mn_balloon_name', 'im_mn_balloon_detail'],
  ['im_mn_guide_name', 'im_mn_guide_detail'],
  ['im_mn02_name', 'im_mn02_detail'],
  ['im_mn03_name', 'im_mn03_detail'],
  ['im_mn04_name', 'im_mn04_detail'],
  ['im_mn05_name', 'im_mn05_detail'],
  ['im_mn06_name', 'im_mn06_detail'],
  ['im_mn_friend_name', 'im_mn_friend_detail'],
  ['im_mode19_name', 'im_mn_quest_detail'],
];

/** 레이아웃 이름 [판독: 생성자 문자열] */
export const UI_LAYOUT = {
  statusBase: 'mncom_base_status_00',
  status: 'mncom_status_00',
  empty: 'mncom_status_01',
  telop: 'mn00_text_plaza_00',
  onlineGuide: 'mn00_friend_guide_00',
  pop: 'sys_guide_pop_00',
  stampGuide: 'sys_stamp_guide_00',
  stampListMulti: 'sys_stamp_list_00',
  stampListSolo: 'sys_stamp_list_01',
} as const;

/** 스탬프 말풍선 소리 [판독 FUN_71003589c0] */
export const stampSe = (pid: number, remote: boolean): string => (remote || pid < 0 ? 'SQ_SE_STAMP_PC' : `SQ_SE_STAMP_${pid + 1}P`);
