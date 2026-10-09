/**
 * 미니게임 3D 결과 무대(bq::MGResult) 공개 진입점. import 경계: 같은 폴더·three·app/scene/menu/charselect(Preview3D)·app/scene/world/plaza/heading·app/minigame/frame/scene/resultContract(타입)만.
 * 문서 docs/shell/minigame_result.md §12, 에셋 web/assets/mgresult(tools/analysis/mgresult_web_assets.py), 시험 tools/test_mgresult.ts.
 */
export { createResultStage, resultStagePrefetch, loadResultSpec, stageFiles, logicInput, charaFiles } from './stage';
export * as resultLogic from './logic';
export type * from './types';
export { SPEC_PATH, camPath } from './types';
