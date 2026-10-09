/**
 * 미니게임 항구(mgmet) 화면 사이 계약 — 허브가 부르는 부품 인터페이스와 3D 대기 신호(docs/shell/mgmet_flow.md 5.2·9.1).
 */
import type { Flow } from '@app/common/ui/fiber';

/** mgmet::HowtoPlay(Setup·Update(UpdateManual)·Destroy). update 반환 bit0 = 1: 마지막 페이지를 A 로 넘겨 끝남, 0: 페이지 0 의 B 로 끝남 [추정] */
export interface MgmetHowto {
  setup(kind: number, first: boolean): void;
  update(): Flow<number>;
  destroy(): void;
  tick(): void;
  draw(): void;
}

/** 3D 완료 신호(mgmet_flow.md 5.2). 웹 기본 = 모두 즉시 참 [설계] */
export interface MgmetSignals {
  openingDone(): boolean;
  zoomDone(): boolean;
  coinBattleEventDone(): boolean;
  selectionCameraIdle(): boolean;
  npcReady(): boolean;
  modeZoomDone(): boolean;
  departureDone(): boolean;
  allPlayersIdle(): boolean;
}

export const IMMEDIATE_SIGNALS: MgmetSignals = {
  openingDone: () => true,
  zoomDone: () => true,
  coinBattleEventDone: () => true,
  selectionCameraIdle: () => true,
  npcReady: () => true,
  modeZoomDone: () => true,
  departureDone: () => true,
  allPlayersIdle: () => true,
};
