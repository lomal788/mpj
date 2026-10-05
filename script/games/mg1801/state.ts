/**
 * mg1801 로직 → 화면 계약.
 * 좌표는 원본 월드 단위(레인 간격 2, 레인 x = lane·2 − 3, 채소 등장 y = 7.5, 판정 시점 y = 1.5, 플레이어 z = −2).
 * 각도는 라디안(오일러 XYZ), 조각 회전만 도(원본 CutObj 식 그대로). 시간은 초.
 */
import type { V3 } from '../../core/fmath';
import type { GameEvent } from '../../core/events';
import type { GameResult } from '../../game';

export type Phase = 'ready' | 'main' | 'ending' | 'result';

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

export interface Mg1801State {
  frame: number;
  phase: Phase;
  /** 원본 OnGameMain 단계(RmMgSceneBase+0x370) */
  stage: number;
  chart: string;
  bpm: number;
  /** 사운드 전역 14(마디 안 16분 위치 1..16)와 마디 번호 */
  g14: number;
  bar: number;
  /** 게임 BGM(SQ_BGM_MG1801_A) 시작 뒤 초(시작 전 −1) */
  bgmTime: number;
  row: number;
  rows: number;
  objs: ObjView[];
  players: PlayerView[];
  /** 레인별 판정 수 */
  counts: LaneCount[];
  /** 플레이어 점수(원본 RmGameWork+0xEBC, JUST 2·FAST/SLOW 1) */
  scores: number[];
  /** CalcTotalPoint 합계(별 총점)와 레인별 자르기 수 */
  totalPoint: number;
  personal: number[];
  /** 달성률(0..100)과 별 판정 0..3(= 결과 수프 번호) */
  rate: number;
  starJudge: number;
  /** 리듬 모드(RmGameWork+0x20): 0 노멀, 1 롱, 2 하드, 3 리믹스 */
  mode?: number;
  /** 카메라 모션(원본 MapImpl: loop / result 채널(0,6) / capture 채널(2,2)) */
  camera?: 'loop' | 'result' | 'capture';
  /** NPC HEYHO(원본 MapImpl 채널 0,1·0,2·0,5). motion = 원본 모션 이름, frame = 원본 프레임, speed = 재생 배속 */
  npc?: { visible: boolean; motion: string; frame: number; speed: number };
  /** 플레이어별 PERFECT(점수 = GetResultPlayerScoreMax) */
  perfect?: boolean[];
  /** PERFECT 텔롭이 떠 있는지(단계 8 에 띄우고 OnGameEndingBefore 에서 숨김) */
  perfectTelop?: boolean;
  /** 원본 MinigameFlow 단계(8 OnGameStartAfter, 9 OnGameMain, 10 OnGameEnd, 11 OnGameFinish, 12 OnGameEndingBefore, 13 OnGameEnding, 14 결과) */
  flow?: number;
  /**
   * 흰 페이드(bq::WipeModule FadeOut/FadeIn(1.0, White) → 레이아웃 "WipeWhite_out"/"_in" 20프레임, out 뒤에는 "WipeWhite_normal" 로 하얗게 머문다).
   * frame = 그 애니 재생 프레임. null = 페이드 없음
   */
  fade?: { anim: 'WipeWhite_out' | 'WipeWhite_normal' | 'WipeWhite_in'; frame: number } | null;
  /** 리듬 점수판(RmUiStatusMan) 표시 — 단계 5 에 켜고 OnGameEnd 에서 끈다 */
  statusUi?: boolean;
  /** 연습 화살표(RmPracticeArrowMan) — 단계 2 에 켜고 단계 3 에서 4분 상태 > 2 면 끈다 */
  practiceArrow?: boolean;
  /**
   * 결과 점수판(FUN_7100448610)을 시작한 로직 프레임. 원본은 결과 람다 @0x7100447d10 이 승패 모션(FUN_71004475d0) 바로 뒤에 부른다.
   * 점수판 람다(@0x71004495f0)는 그 뒤 약 0.5 + 1/60 + 0.5 + 3.0 초 돌고 끝 플래그(+0x48)를 세운다. 없으면 화면이 결과 모션으로 짐작한다
   */
  resultPanelFrame?: number;
  /** 지금 게임 BGM 라벨(FUN_7100441990 규칙) */
  bgmLabel?: string;
  /** 리듬 쿠킹 코스 안: index·count 와 RmGameWork+0x2C(뒤에 게임이 더 남음). null = 미니게임 모드(단독) */
  course?: { index: number; count: number; midCourse: boolean } | null;
}

export type Mg1801Event =
  | GameEvent
  /** 판정 텔롭(원본 RmUiTelopMan::ShowTimingTelop) 과 시작·끝 텔롭(player −1) */
  | { k: 'telop'; player: number; judge: 'JUST' | 'FAST' | 'SLOW' | 'START' | 'FINISH'; pos: V3 }
  /** FX 트리거(원본 ComFxTrigger::Play — 진동·소리 묶음) */
  | { k: 'fxTrigger'; player: number; name: string }
  /**
   * JUST 판정음(원본 PlayExcellentSe → 프리셋 치환 SQ_SE_MG1801_JUST_SOUND). combo = 지역 변수 L0.
   * play = 새로 SoundModule::Play(SQ_SE_RC_JUST) 했는지(거짓이면 재생 중인 핸들의 L0 만 바꿈)
   */
  | { k: 'justSound'; combo: number; play?: boolean }
  /** 효과음 + 지역 변수 쓰기(원본 SoundModule::Play → SoundHandle::WriteLocalVariable(index, value)) */
  | { k: 'seLocal'; label: string; index: number; value: number }
  /**
   * 그 라벨의 소리만 멈춤(원본 SoundHandle::Stop). 단계 9 의 FUN_7100426264 는 게임 BGM 핸들만, StopMainBgm 은 마스터·OP 만 멈춘다 —
   * 종료 BGM(MG_ENDING/INTER_END)은 다른 핸들이라 계속 울린다
   */
  | { k: 'soundStop'; label: string }
  /** 사운드 세팅 프리셋 적용(원본 SoundModule::LoadSettingPreset) — 단계 5 "mg1800_cmn", OnGameEnding "mg1801_result" */
  | { k: 'soundPreset'; name: string }
  /** PERFECT 텔롭(원본 FUN_710043af00) */
  | { k: 'perfect'; player: number };

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
