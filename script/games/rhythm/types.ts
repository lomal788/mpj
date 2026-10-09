/**
 * 리듬 공용 로직 → 화면 계약과 주입 인터페이스(import 0). 게임 state.ts 가 이 타입을 넓힌다(docs/engine/02_rhythm.md 14절).
 * 좌표는 원본 월드 단위, 시간은 초. 사건 이름은 원본 라벨 그대로.
 */

/** 3 성분 벡터(core/fmath V3 와 같은 모양) */
export interface RmV3 {
  x: number;
  y: number;
  z: number;
}

export type Phase = 'ready' | 'main' | 'ending' | 'result';

/** 이번 스텝의 사운드 관측(game.ts SoundSnapshot 과 같은 모양) */
export interface RmSoundSnapshot {
  /** 이 값이 나타내는 AudioContext 시각(초) */
  time: number;
  /** 전역 변수 G0..G15(원본 기본 −1) */
  globals: readonly number[];
  /** 재생 요청한 사운드 라벨별 지역 변수 L0..L15. 핸들이 없으면 그 라벨이 없다 */
  locals: Readonly<Record<string, readonly number[]>>;
}

/** 리듬 공용 사건(게임 사건 유니온이 이것을 품는다). se·bgm 은 core/events GameEvent 와 같은 모양 */
export type RmEvent =
  /** 2D 효과음(원본 SoundModule::Play) */
  | { k: 'se'; label: string }
  /** BGM(원본 RmMgSceneBase::SetGameBgmName 등으로 고른 곡) */
  | { k: 'bgm'; label: string }
  /** 판정 텔롭(원본 RmUiTelopMan::ShowTimingTelop) 과 시작·끝 텔롭(player −1) */
  | { k: 'telop'; player: number; judge: 'JUST' | 'FAST' | 'SLOW' | 'START' | 'FINISH'; pos: RmV3 }
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

export interface RmPadInput {
  buttons: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  accX: number;
  accY: number;
  accZ: number;
}

/** 이번 프레임 사건을 받는 곳(게임 사건 배열을 그대로 넘긴다) */
export interface RmEventSink {
  length: number;
  push(...e: RmEvent[]): number;
}

/** 흰 페이드(bq::WipeModule) — lib/transition Transition 을 게임이 넘긴다 */
export interface RmWipe {
  fadeOut(type: number, speed: number): void;
  fadeIn(type: number, speed: number): void;
  readonly playing: boolean;
}

/** 결과 연출 모션(원본 RmMgSceneBase 결과 객체가 Play). next = 끝나면 이어 재생(SetModelNextMotion) */
export interface RmResultMotion {
  name: string;
  next: string | null;
  speed: number;
  frame: number;
}

/** 원본 RmGameWork::SetPlayerEntity 로 등록한 플레이어 — 결과 연출이 모션·머리 시선을 바꾼다 */
export interface RmPlayerEntity {
  resultMotion: RmResultMotion | null;
  look: { head: boolean };
  headTarget: RmV3 | null;
}

/** 공용 UI 가 읽는 플레이어 화면 값 */
export interface RmPlayerStateView {
  pos: RmV3;
  isCom: boolean;
  /** 캐릭터 ID(pcNN) */
  char: string;
  /** 결과 연출 모션(원본 파일 이름, 없으면 칼 모션). next = 끝나면 이어 재생(SetModelNextMotion) */
  resultMotion?: RmResultMotion | null;
}

/** 리듬 공용 state 필드(게임 state 가 넓힌다) */
export interface RmSceneState {
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
  players: readonly RmPlayerStateView[];
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
