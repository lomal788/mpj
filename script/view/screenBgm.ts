/**
 * 화면별 원본 BGM 규칙(데이터) — 화면 시작 때 틀 라벨, 나가기 종류별 정지 페이드 초(null = 이어 재생). 근거: docs/engine/04_sound.md §12.14.2.
 * 페이드 = FadeTimePreset 표(mgmcommon/sound.ts FADE_TIME_PRESET): 2 = 0.7 s, 3 = 0.2 s, 6 = 0.5 s. 곡 명세 = assets/common/sound/bgm.json.
 */
import { fadeTime } from '@app/common/ui/sound';

export const BGM_SPEC_PATH = 'common/sound/bgm.json';

/** 흐름 끝(취소·광장 나감)·dev/ui.html 화면 바꾸기 [설계] */
export const FLOW_END_FADE = 0.5;

export interface ScreenBgmRule {
  /** 화면 시작 때 틀 라벨(같은 라벨이 돌고 있으면 그대로) — null = 화면 모듈(MgmSound PlayBgm)이 정함 */
  enter: string | null;
  /** 나가기 종류 → 정지 페이드 초, null = 끊지 않음 */
  exit: Readonly<Record<string, number | null>>;
}

export const SCREEN_BGM = {
  /** menu00 SequenceFront(타이틀 곡 이어짐) → ~SequenceFront StopBgmTitle(2) */
  setplayer: { enter: 'SM_BGM_TITLE', exit: { done: fadeTime(2), cancel: fadeTime(2) } },
  /** menu00 PlayBgmMenu → 기구 TakeOffImpl StopBgm(2), 세션 PlaySessionFiber StopBgm(6) */
  plaza: { enter: 'SM_BGM_MENU', exit: { balloon: fadeTime(2), session: fadeTime(6), cancel: FLOW_END_FADE } },
  /** menu01 SequenceManager::Initialize PlayBgm → StartAnimImpl·CheckExitImpl StopBgm(6) */
  modeselect: { enter: 'SM_BGM_MENU_MAP', exit: { decided: fadeTime(6), cancel: fadeTime(6) } },
  /** menu01 안(이어 재생) → 다음 장면 StartAnimImpl StopBgm(6), 취소 = 같은 메뉴 */
  charselect: { enter: 'SM_BGM_MENU_MAP', exit: { decided: fadeTime(6), cancel: null } },
  /** menu01 SequenceStartBd → StartAnimImpl StopBgm(6), 뒤로 = 이어짐 */
  partyrule: { enter: 'SM_BGM_MENU_MAP', exit: { start: fadeTime(6), back: null } },
  /** menu00 광장 위 프렌드 UI(광장 곡 이어짐) */
  onlineFriend: { enter: 'SM_BGM_MENU', exit: { done: null } },
  /** matching00 GameFlow → StopBgm·CleanupGame Stop_Preset(2) */
  onlineWorld: { enter: 'SM_BGM_MATCHING', exit: { done: fadeTime(2) } },
  /** mgmet: PlayBgm(0/1/2)는 hub, 떠날 때 MinigameModeScene::CleanupScene Stop_Preset(2) */
  mgmet: { enter: null, exit: { leave: fadeTime(2) } },
  /** mgm01: PlayBgm(4)/(5)·StopBgm(3)/(2)는 장면, 떠날 때 CleanupScene Stop_Preset(2) */
  mgm01: { enter: null, exit: { leave: fadeTime(2) } },
} as const satisfies Record<string, ScreenBgmRule>;

export type BgmScreen = keyof typeof SCREEN_BGM;
