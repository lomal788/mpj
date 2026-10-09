/**
 * 모드 선택(맵 메뉴) 화면 독립 모듈 — 공개 진입점. 게임 엔진층(script/game/core·games·view)에 의존하지 않는다(tools/check_modeselect.ts 가 검사).
 * 명세: docs/shell/modeselect.md, 에셋: assets/modeselect(spec.json 등, tools/analysis/modesel_web_assets.py).
 */
export { createModeSelect, type ModeSelectHandle } from './screen';
export { BUTTONS, ModeSelectState, NOTICE_COOLDOWN, PAD, type ModeEvent, type PadFrame } from './state';
export type { ModeEntry, ModeSelectAssetAdapter, ModeSelectFlags, ModeSelectInputAdapter, ModeSelectOptions, ModeSelectResult, ModeSelectSoundAdapter, ModeSpec } from './types';
