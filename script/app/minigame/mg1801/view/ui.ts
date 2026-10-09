/**
 * mg1801 2D UI — 리듬 공용 UI 는 app/minigame/kit/rhythm/view/ui.ts(RmUi)로 옮겼다(docs/engine/02_rhythm.md 14절).
 * 여기는 mg1801 설정(와이프 레이아웃 이름)과 화면마다 하나 만드는 도우미만 둔다.
 */
import type * as THREE from 'three';
import type { Assets } from '../../../../view/assets';
import { RmUi } from '@app/minigame/kit/rhythm/view/ui';

export type Mg1801Ui = RmUi;

/** RmUiCntWipe 레이아웃 — mg1801_wip_bg_01·_00 */
const MG1801_UI = { name: 'mg1801', wipeLayouts: ['mg1801_wip_bg_01', 'mg1801_wip_bg_00'] } as const;

/**
 * 화면(Mg1801View)마다 UI 하나. view/index.ts 는 3D·캐릭터 담당과 함께 고치는 파일이라 필드를 늘리지 않고
 * onStep·drawHud 안에서 이 함수로 꺼내 쓴다(처음 부를 때 만들고 에셋을 읽기 시작한다).
 */
const UIS = new WeakMap<object, RmUi>();
export function mg1801Ui(owner: object, assets: Assets, camera: () => THREE.Camera): Mg1801Ui {
  let ui = UIS.get(owner);
  if (!ui) {
    ui = new RmUi(assets, camera, MG1801_UI);
    UIS.set(owner, ui);
  }
  return ui;
}

/** 화면 dispose 때 그 화면의 UI(레이아웃 텍스처·글자 캐시)를 푼다 */
export function disposeMg1801Ui(owner: object): void {
  UIS.get(owner)?.dispose();
  UIS.delete(owner);
}
