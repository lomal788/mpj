/**
 * mg1801 몸체(로직·뷰) — index.ts 의 GameDef.load() 가 import() 로 받는다(코드 분할: 광장 등 다른 화면에 mg1801 코드가 실리지 않게).
 * 설계: docs/engine/loader_manager.md §5.8.8.
 */
export { Mg1801Game } from './logic/game';
export { Mg1801View } from './view';
