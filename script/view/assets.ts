/**
 * 에셋 읽기 — 게임마다 assets/<게임>/manifest.json 이 입구다(assets/README.md).
 * 같은 경로는 한 번만 읽는다. 진행 표시는 load 단계에서 Progress 로 알린다.
 */
import { Assets as ManagedAssets, type AssetRuntime } from '@app/common/assets';
import { ASSETS } from '../env';
import { appAssets } from './appAssets';

export type { Progress } from '@app/common/assets';

export class Assets extends ManagedAssets {
  constructor(dir: string, runtime: AssetRuntime = { manager: appAssets(), root: new URL(ASSETS, typeof document === 'undefined' ? 'http://localhost/' : document.baseURI).href }) {
    super(dir, runtime);
  }
}
