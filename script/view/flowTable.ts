/**
 * 화면 흐름 예측 표(데이터) — 화면 키 → 들어갈 때 P0 로 올릴 자기 묶음, 미리 받을 다음 화면 묶음, "지금 상태" 알림별 추가 예측.
 * 설계: docs/engine/loader_manager.md §13.2. 묶음 이름의 키 목록은 flowCatalog.ts, 표를 돌리는 쪽은 flow.ts.
 * next = 바로 다음 화면(데이터 절약·느린 망 lite 에서도 받음). '{v}' = 상태 값, '{chars}' = 진입 때 넘긴 캐릭터마다.
 */
import { P2, P3 } from '../lib/assetcore';

export type FlowScreen = 'boot' | 'setplayer' | 'charselect' | 'plaza' | 'modeselect' | 'mgmet' | 'mgm01' | 'game';

export interface FlowPredict {
  readonly bundle: string;
  readonly pri: number;
  readonly next: boolean;
}

export interface FlowEntry {
  readonly own: readonly string[];
  readonly predict: readonly FlowPredict[];
  /** '<상태 이름>:<값>' 또는 '<상태 이름>:*' → 예측 */
  readonly states?: Readonly<Record<string, readonly FlowPredict[]>>;
}

const PLAZA_NEXT = (pri: number, next: boolean): FlowPredict[] => [
  { bundle: 'plaza:p0', pri, next },
  { bundle: 'plaza:ui', pri, next },
  { bundle: 'plaza:npc', pri, next },
];

export const FLOW_TABLE: Readonly<Record<FlowScreen, FlowEntry>> = {
  boot: { own: ['setplayer'], predict: [] },
  setplayer: {
    own: ['setplayer', 'bgm:SM_BGM_TITLE'],
    predict: [{ bundle: 'bgm:SM_BGM_MENU', pri: P3, next: false }, { bundle: 'charselect', pri: P2, next: true }, { bundle: 'char:first', pri: P2, next: true }, { bundle: 'charselect:sound', pri: P2, next: true }, ...PLAZA_NEXT(P3, false)],
  },
  charselect: {
    own: ['charselect'],
    predict: PLAZA_NEXT(P3, true),
    states: { 'decided:*': [{ bundle: 'plaza:player:{v}', pri: P2, next: true }, ...PLAZA_NEXT(P2, true)] },
  },
  plaza: {
    own: ['plaza:p0', 'plaza:ui', 'plaza:npc', 'plaza:player:{chars}', 'bgm:SM_BGM_MENU'],
    predict: [{ bundle: 'modeselect', pri: P3, next: true }, { bundle: 'bgm:SM_BGM_MENU_MAP', pri: P3, next: true }],
    states: { 'area:balloon': [{ bundle: 'modeselect', pri: P2, next: true }] },
  },
  modeselect: {
    own: ['modeselect', 'bgm:SM_BGM_MENU_MAP'],
    predict: [],
    states: { 'cursor:mgm': [{ bundle: 'mgmet', pri: P2, next: true }, { bundle: 'bgm:SM_JIN_MGMET_OPENING', pri: P2, next: true }, { bundle: 'bgm:SM_BGM_MGMET_ENTRANCE_JMP', pri: P2, next: true }], 'cursor:*': [{ bundle: 'plaza:p0', pri: P2, next: true }] },
  },
  mgmet: { own: ['mgmet', 'bgm:SM_JIN_MGMET_OPENING', 'bgm:SM_BGM_MGMET_ENTRANCE_JMP'], predict: [{ bundle: 'mgm01', pri: P2, next: true }, { bundle: 'bgm:SM_BGM_MGM01_FREEPLAY', pri: P2, next: true }, { bundle: 'modeselect', pri: P3, next: false }] },
  mgm01: { own: ['mgm01', 'bgm:SM_BGM_MGM01_FREEPLAY', 'bgm:SM_JIN_MGM01_FREEPLAY_ENDSTINGER'], predict: [], states: { 'game:*': [{ bundle: 'game:{v}', pri: P2, next: true }, { bundle: 'mgstage:{v}', pri: P2, next: true }] } },
  game: { own: [], predict: [{ bundle: 'mgm01', pri: P3, next: true }, { bundle: 'bgm:SM_BGM_MGM01_FREEPLAY', pri: P3, next: true }] },
};
