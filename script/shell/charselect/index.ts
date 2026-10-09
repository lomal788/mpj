/**
 * 캐릭터 선택 화면 독립 모듈 — 공개 진입점. 게임 엔진층(script/game/core·games·view)에 의존하지 않는다(tools/check_charselect.ts 가 검사).
 * 명세: docs/shell/charselect.md, 에셋: assets/charselect(spec.json 등, tools/analysis/charsel_web_assets.py).
 */
export { createCharSelect, type CharSelectHandle } from './screen';
export { CharSelectState, PAD, RANDOM, RepeatGen, type CharSelectEvent, type PadFrame } from './state';
export type { CharSelectAssetAdapter, CharSelectInputAdapter, CharSelectOptions, CharSelectPlayer, CharSelectSoundAdapter, Spec } from './types';
