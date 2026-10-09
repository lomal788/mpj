/**
 * mg1801 로직 → 화면 계약.
 * 좌표는 원본 월드 단위(레인 간격 2, 레인 x = lane·2 − 3, 채소 등장 y = 7.5, 판정 시점 y = 1.5, 플레이어 z = −2).
 * 각도는 라디안(오일러 XYZ), 조각 회전만 도(원본 CutObj 식 그대로). 시간은 초.
 */
import type { V3 } from '../../core/fmath';
import type { GameEvent } from '../../core/events';
import type { GameResult } from '../../game';
import type { Phase, RmEvent, RmSceneState } from '../rhythm/types';

export type { Phase };

export interface ObjView {
  id: number;
  type: number;
  active: boolean;
  lane: number;
  cuts: number;
  pos: V3;
  rot: V3;
  /** 조각(cuts+1)별 x 이동량과 Z 회전(도) */
  pieces: { dx: number; angleDeg: number; splashed: boolean }[];
  /** 자르기 자리별 판정(−1 없음, 0 JUST, 1 FAST, 2 SLOW) */
  judge: number[];
  /** 박마다 바뀌는 'move' 모션 시작 박 */
  moveBeat: number;
  /** 외곽선 안내 표시(원본 Obj::UpdateOutlineOnOff 결과 outlineShown). 로직이 채운다 */
  outline?: boolean;
  /** 외곽선 엔티티 위치 = Entry 때 (lane·2 − 3 + offsetX, 1.5, 0) [판독: Obj::Entry @0x7100007f20~0x7100007f64] */
  outlinePos?: V3;
}

export interface PlayerView {
  lane: number;
  isCom: boolean;
  /** 캐릭터 ID(pcNN)와 의자 번호(−1 없음) */
  char: string;
  stool: number;
  pos: V3;
  motion: 'idle' | 'swing';
  /** 모션 재생 프레임(원본 프레임, idle 0..30 루프 / swing 0..20) */
  motionFrame: number;
  cooldown: number;
  inputEnabled: boolean;
  /** 머리 추적(원본 UpdateHeadControl / ObjectManImpl::GetHeadTarget). target null = 추적 끔 */
  head?: { target: V3 | null; weight: number };
  /** 시선 켜짐(원본 ComHeading SetHeadLookEnabled / SetEyesLookEnabled) */
  look?: { head: boolean; eyes: boolean };
  /** 결과 연출 모션(원본 파일 이름, 없으면 칼 모션). next = 끝나면 이어 재생(SetModelNextMotion) */
  resultMotion?: { name: string; next: string | null; speed: number; frame: number } | null;
}

export interface LaneCount {
  just: number;
  fast: number;
  slow: number;
  miss: number;
}

/** 공용 리듬 state 필드(frame·phase·stage·박자·점수·별 판정·페이드·결과 점수판 등)는 games/rhythm/types.ts RmSceneState */
export interface Mg1801State extends RmSceneState {
  objs: ObjView[];
  players: PlayerView[];
  /** 레인별 판정 수 */
  counts: LaneCount[];
  /** 카메라 모션(원본 MapImpl: loop / result 채널(0,6) / capture 채널(2,2)) */
  camera?: 'loop' | 'result' | 'capture';
  /** NPC HEYHO(원본 MapImpl 채널 0,1·0,2·0,5). motion = 원본 모션 이름, frame = 원본 프레임, speed = 재생 배속 */
  npc?: { visible: boolean; motion: string; frame: number; speed: number };
}

/** 공용 리듬 사건(telop·justSound·seLocal·soundStop·soundPreset·perfect)은 games/rhythm/types.ts RmEvent */
export type Mg1801Event =
  | GameEvent
  | RmEvent
  /** FX 트리거(원본 ComFxTrigger::Play — 진동·소리 묶음) */
  | { k: 'fxTrigger'; player: number; name: string };

export interface Mg1801Result extends GameResult {
  counts: LaneCount[];
  totalPoint: number;
  scores: number[];
  achieved: number;
  rate: number;
  starJudge: number;
  /** 플레이어별 PERFECT(단계 8, RmGameWork::GetResultPlayerScoreMax 와 같음) */
  perfect?: boolean[];
  /** RmGameWork+0x20 */
  mode?: number;
}
