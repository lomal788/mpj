/**
 * 리듬 장면 기반 — 원본 main ca::rm::RmMgSceneBase. 게임 Scene 은 이것을 상속해 원본 vtable 훅만 덮는다
 * (docs/engine/02_rhythm.md 4절 훅, 7절 단계, 14절 웹 공용 모듈). import 0(같은 폴더만).
 *
 * step 한 번 = 원본 한 프레임 [판독: docs/engine/01_core.md, analysis/notes/mg1801_core.md 2절]:
 *   패드 읽기(게임) → RmSoundMan 파이버(JUST 판정음 타이머) → 결과 연출 파이버 → 제품 파이버(게임 updateProducts)
 *   → 장면 흐름 파이버(MinigameFlow 처리기 하나: 8 OnGameStartAfter, 9 OnGameMain, 10 OnGameEnd, 11 OnGameFinish,
 *     12 OnGameEndingBefore, 13 OnGameEnding). 처리기가 다음 단계를 돌려주면 다음 프레임부터 그 처리기가 돈다(@0x71002e0844).
 * 파이버 순서는 생성 순서다: RmSoundMan(SetupGame) → 결과 연출(SyncedSetupGame) → 제품(RmSyncedSetupGame) → 흐름(다음 프레임 UpdateMain).
 * 박자(G14)·곡 교대(G12)·게임 BGM L0 은 step 의 sound 관측(오디오 쪽 시퀀서 값)을 읽고, 없으면 프레임 모델(clock.ts)이 만든다.
 *
 * OnGameMain 단계 0~10 은 원본 RmMgSceneBase::OnGameMain @0x71004441e8 의 switch 를 goto(같은 프레임에 다음 case)까지 옮긴다
 * [판독: analysis/notes/mg1801_rhythm.md 5절, main_ca_rm.c]. 모드는 RmGameWork+0x20(0 노멀 1 롱 2 하드 3 리믹스)이고,
 * 1·3 은 리듬 쿠킹(rc_stage01) 코스 안에서만 나오므로 그 경로(+0x1C = 1, 코스 index, +0x2C)를 함께 둔다(web/docs/minigame/rc_stage01.md).
 *
 * 원본과 다른 점:
 * - OnGameStartAfter 전(MinigameFlow 1~7: 장면 사운드 시작·페이드인·오프닝)은 공용 틀 app/minigame/frame/scene 이 돈다(리듬 장면 훅은 모두 1,
 *   docs/shell/minigame_scene.md §12.12.3).
 * - 리듬 쿠킹의 컨트롤 안내 와이프(RmUiCntWipe 표시)는 닫히는 때를 정하는 내부 갱신을 판독하지 못했다 [미확정]. 웹은 바로 끝난 것으로 둔다
 *   (시험은 controlWipeFrames 로 길이를 넣어 SQ_BGM_RC_CALIBRATION 조건을 본다).
 * - 리믹스 BGM(SQ_BGM_RC_REMIX)의 L0=1 시점은 mg18xx A·C 와 같은 "시작 2박 뒤"로 둔다 [추정].
 * - 원본 결과 점수판(FUN_7100448610)을 시작한 프레임을 state.resultPanelFrame 에 남기고, 점수판 람다가 끝날 때(RESULT_PANEL_FRAMES 뒤) done.
 * mgscene(app/minigame/frame/scene MgGame) 위에서 흐름 슬롯(onGameStartAfter…onGameEnding)·update()·updateAnimation() 을 그대로 쓴다
 * (어댑터 mgGame.ts RmMgGame, 흐름 단계 진행은 틀 MinigameFlow) — 02_rhythm.md 14.6.
 */
import type { RmChartRow } from './chart';
import { RhythmClock } from './clock';
import {
  BEATS_PER_BAR,
  CALIBRATION_FRAMES,
  F,
  RESULT_MOTIONS,
  RESULT_PANEL_DELAY_BEATS,
  RESULT_PANEL_FRAMES,
  RM_DT,
  RM_WIPE_WHITE as WIPE_WHITE,
} from './data';
import { type RmChartRule, type RmConfig, RmGameWork, type RmOptions, resolveRmConfig } from './gameWork';
import { RmSoundMan, rmEndingBgmName, rmInterEndBgmName } from './soundMan';
import { starJudge } from './status';
import type { Phase, RmEventSink, RmPadInput, RmPlayerEntity, RmSoundSnapshot, RmV3, RmWipe } from './types';

/** 원본 RmMgSceneBase::Data(훅 인자) — 줄 번호, 박 상태, 그 줄 8칸 문자열 */
export interface RmBeatData {
  row: number;
  beat: number;
  item: RmChartRow;
}

/** 게임이 기반에 넘기는 것 */
export interface RmSceneInit {
  /** 미니게임 이름(소문자, 예 'mg1801') — BGM 접두 SQ_BGM_<MG>, 결과 프리셋 <mg>_result, 결과 앰비언트·징글 이름 */
  mg: string;
  /** 채보 고르기(모드 → 채보 이름) */
  chart: RmChartRule;
  /** 이번 프레임 사건(게임 사건 배열) */
  events: RmEventSink;
  /** 흰 페이드(bq::WipeModule) */
  wipe: RmWipe;
  /** 플레이어(레인 순서)별 CPU 여부 */
  isCom: readonly boolean[];
  /** 결과 시작 FUN_7100446b60 이 머리를 돌리는 기본 레이어 카메라 위치(게임 결과 카메라) */
  resultCameraPos: RmV3;
}

/** 원본 결과 기록 FUN_710042ca10 (단계 8) 가운데 쓰는 것 */
interface ResultRecord {
  scores: number[];
  rate: number;
  judge: number;
  /** 점수 == GetResultPlayerScoreMax */
  perfect: boolean[];
}

export abstract class RmMgSceneBase {
  readonly cfg: RmConfig;
  /** 박자 시계(원본 snd::* + 마스터 시퀀스) */
  readonly clock: RhythmClock;
  /** RmMgSceneBase+0x310 */
  readonly gameWork: RmGameWork;
  /** RmMgSceneBase+0x328 */
  readonly soundMan: RmSoundMan;
  protected readonly eventSink: RmEventSink;
  private readonly wipe: RmWipe;
  private readonly mg: string;
  /** "SQ_BGM_" + 대문자 미니게임 이름 */
  private readonly bgmPrefix: string;
  private readonly resultCameraPos: RmV3;
  private readonly controlWipeFrames: number;
  /** RmChartDataMan 줄(게임이 RmSyncedSetupGame 에서 읽는다) */
  protected rows: readonly RmChartRow[] = [];
  /** RmGameWork::SetPlayerEntity 로 등록한 플레이어 */
  private entities: readonly RmPlayerEntity[] = [];
  protected phase: Phase = 'ready';
  protected frame = 0;
  /** MinigameFlow 단계(+0x214). 0 = OnGameStartAfter 전 대기 */
  protected flow = 0;
  protected nextFlow = 0;
  /** 원본 OnGameMain·OnGameEnd·OnGameEndingBefore·OnGameEnding 이 함께 쓰는 단계(this+0x370) */
  protected stage = 0;
  /** +0x374 단계 타이머 */
  protected stageTimer = 0;
  /** 원본 RmMgSceneBase+0x378 경과 프레임 */
  protected elapsedFrame = 0;
  /** +0x37C 다음 Entry 줄 */
  protected row = 0;
  /** +0x380 */
  protected lastBeatState = -1;
  /** +0x384 / +0x388 Lock 배분 */
  protected lockRow = 0;
  protected lockBeat = -1;
  /** 단계 1·3 박 수(원본은 +0x37C 를 같이 쓰고 단계가 바뀔 때 0 으로 지운다) */
  protected countBeats = 0;
  /** RmGameWork+0x24 SetMainBeatType */
  protected mainBeatType = 1;
  /** +0x420 / +0x421 / +0x424 SetMgBgmBeforeOneBeatStart */
  protected beforeOneBeat = false;
  protected useBeatCheck = false;
  protected beforeBeatType = 1;
  /** +0x428 SetNextChartDataOffset */
  protected nextOffset = -1;
  /** +0x469 SetGameEndForce */
  protected forceEnd = false;
  protected bgmStartFrame = -1;
  /** +0x3D8 확정된 게임 BGM 이름(FUN_7100441990) */
  protected bgmLabel = '';
  /** +0x3C0 SetGameBgmFinName */
  protected gameBgmFinName = '';
  protected endingLabel = '';
  /** +0x473 TrigRmGameWipeFadeOutStart 한 번 */
  protected wipeFadeTriggered = false;
  /** 컨트롤 안내 와이프 닫기 요청 프레임(FUN_7100431c5c) */
  protected wipeCloseFrame = -1;
  /** +0x430 SQ_BGM_RC_CALIBRATION 핸들(시작 프레임) */
  protected calibrationFrame = -1;
  /** +0x462 결과 기록 한 번 */
  protected record: ResultRecord | null = null;
  /** PERFECT 텔롭을 띄운 플레이어 */
  protected readonly perfectShown = [false, false, false, false];
  protected statusUi = false;
  protected practiceArrow = false;
  protected perfectTelop = false;
  /** OnGameEnding +0x471 앰비언트 끝(또는 생략), +0x472 환호 끝 */
  protected ambientDone = false;
  protected cheerDone = false;
  /** 결과 연출 객체(+0x358) 갱신 람다 상태: −1 없음, 0 대기, 2 점수판 */
  protected resultState = -1;
  protected resultPanelFrame: number | undefined = undefined;
  protected resultTimer = 0;
  protected finished = false;

  constructor(opts: RmOptions, init: RmSceneInit) {
    this.cfg = resolveRmConfig(opts, init.chart);
    this.controlWipeFrames = opts.controlWipeFrames ?? 0;
    this.eventSink = init.events;
    this.wipe = init.wipe;
    this.mg = init.mg;
    this.bgmPrefix = `SQ_BGM_${init.mg.toUpperCase()}`;
    this.resultCameraPos = init.resultCameraPos;
    this.clock = new RhythmClock(this.cfg.bpm);
    this.gameWork = new RmGameWork(init.isCom);
    this.soundMan = new RmSoundMan(init.events, this.clock, RM_DT);
  }

  get done(): boolean {
    return this.finished;
  }

  // ------------------------------------------------------------------ 게임이 설정에서 부르는 것(원본 RmSyncedSetupGame 자리)

  /** 원본 RmGameWork::SetMainBeatType */
  protected setMainBeatType(t: number): void {
    this.mainBeatType = t;
  }

  /** 원본 SetMgBgmBeforeOneBeatStart(use, type): 단계 4·5 에서 GetBeatState(type) == 마디 마지막 단위면 꼬리를 돈다(02_rhythm.md 7.2) */
  protected setMgBgmBeforeOneBeatStart(useBeatCheck: boolean, beatType: number): void {
    this.beforeOneBeat = true;
    this.useBeatCheck = useBeatCheck;
    this.beforeBeatType = beatType;
  }

  /** 원본 SetNextChartDataOffset */
  protected setNextChartDataOffset(n: number): void {
    this.nextOffset = n;
  }

  /** 원본 RmChartDataMan::ReadChartData 결과 */
  protected setChartData(rows: readonly RmChartRow[]): void {
    this.rows = rows;
  }

  /** 원본 SetGameBgmName + FUN_7100441990 결과(게임 BGM 라벨) */
  /** @orig main:7100441990 ref */
  protected setGameBgmLabel(label: string): void {
    this.bgmLabel = label;
  }

  /** 원본 SetGameBgmFinName(단계 6 에서 FUN_71004421a0 규칙으로 바뀐다) */
  /** @orig main:71004421a0 ref */
  protected setGameBgmFinName(name: string): void {
    this.gameBgmFinName = name;
  }

  /** 원본 RmGameWork::SetPlayerEntity */
  protected setPlayerEntities(list: readonly RmPlayerEntity[]): void {
    this.entities = list;
  }

  /** 원본 SetGameEndForce(+0x469) */
  protected setGameEndForce(): void {
    this.forceEnd = true;
  }

  // ------------------------------------------------------------------ 게임이 덮는 훅(원본 vtable, 기본 = 원본 기반 구현)

  /** +0x2B0 — OnGameStartAfter 끝. 기반 1 반환 */
  protected onRmGameStartAfter(): boolean {
    return true;
  }
  /** +0x2B8 — 단계 0·1(1회) */
  protected trigRmGameWipeFadeOutStart(): void {}
  /** +0x2C0 — 단계 2 */
  protected trigRmGameMainBgmPracticeStart(): void {}
  /** +0x2C8 — 단계 2(리믹스)·3 */
  protected trigRmGameMainBgmPracticeFinish(): void {}
  /** +0x2D0 — 단계 4 */
  protected trigRmGameMainBgmIntroStart(): void {}
  /** +0x2D8 — 단계 5 */
  protected trigRmGameMainBgmTopStart(): void {}
  /** +0x2E0 — OnGameMain 꼬리 끝(반환값이 OnGameMain 반환). 기반 1 반환, 리듬 10종은 모두 0 을 돌려주게 덮는다 */
  protected onRmGameMain(): boolean {
    return true;
  }
  /** +0x2E8 — 단계 7 */
  protected trigRmGameMainChartEnd(): void {}
  /** +0x2F0 — OnGameEnd. 기반 1 반환 */
  protected onRmGameEnd(): boolean {
    return true;
  }
  /** +0x2F8 — OnGameFinish. 기반 1 반환 */
  protected onRmGameFinish(): boolean {
    return true;
  }
  /** +0x300 — OnGameEndingBefore */
  protected trigRmGameEndingSetting(): void {}
  /** +0x328 — 줄 배분(Entry) */
  protected onRmRecieveBeatEntry(_d: RmBeatData): void {}
  /** +0x330 — 줄 배분(Lock, 단계 ≥ 6) */
  protected onRmRecieveBeatEntryLock(_d: RmBeatData): void {}
  /** +0x338 — 줄 배분(NextEntry, nextOffset > 0) */
  protected onRmRecieveBeatNextEntry(_d: RmBeatData): void {}

  /** 웹: 제품 파이버(원본 MaintainProduct 의 Stage → Object → Player 등) */
  protected abstract updateProducts(): void;
  /** 웹: 게임 쪽 모션 진행(애니메이션 갱신, 파이버 뒤) */
  protected updateGameAnimation(): void {}
  /** 웹: 장면 끝(결과 점수판 끝 또는 RequestReturnScene) — 게임이 결과 객체를 만든다 */
  protected abstract onResultReady(): void;

  // ------------------------------------------------------------------ 한 프레임

  abstract readInput(input: readonly (RmPadInput | null)[]): void;

  /** 원본 한 프레임 머리(사건 비우기·사운드 관측·frame++·틀이 정한 흐름 단계 반영). 게임 update() 가 패드를 읽은 뒤 부른다 */
  beginFrame(sound: RmSoundSnapshot | null): void {
    this.eventSink.length = 0;
    this.clock.observe(sound);
    this.frame++;
    this.flow = this.nextFlow;
  }

  onSetGameSequence(stage: number): void {
    this.nextFlow = stage;
  }

  clearEvents(): void {
    this.eventSink.length = 0;
  }

  /** 파이버들(흐름 처리기 앞) — RmSoundMan 파이버 → 박자 시계 → 결과 연출 파이버 → 제품 파이버 */
  update(): void {
    this.soundMan.tickExcellentSe();
    this.clock.tick();
    this.updateResultFiber();
    if (this.finished) return;
    this.updateProducts();
  }

  // ------------------------------------------------------------------ MinigameFlow 처리기

  /** 원본 RmMgSceneBase::OnGameStartAfter @0x7100443fa8 (inst 아님) */
  /** @orig main:7100443fa8 ref */
  onGameStartAfter(): boolean {
    /* FUN_71004263c8: 마스터 SQ_BGM_RC_MAIN_RHYTHM + SQ_BGM_RC_MGCMN_OP 재생(이 순서, 같은 프레임), RmSoundMan+0x28 의 limit = (60/BPM)·0.5.
       OnGameStartAfter 는 첫 줄에서 이것을 부르고 1 을 돌려주므로 MinigameFlow 8 의 한 프레임에만 돈다 [판독 @0x7100443fa8].
       원본은 RmGameWork 의 재생 중 플래그(FUN_710042cfc4·cfd4)가 서 있으면 각각 건너뛴다(리듬 쿠킹 코스 둘째 게임부터는 앞 게임의 마스터가 이어 돈다).
       웹은 앞 게임이 없어 늘 새로 튼다 [근사]. 박자 시계(rhythm.start)도 같은 프레임 = 마스터 틱 0 이다 */
    this.eventSink.push({ k: 'bgm', label: 'SQ_BGM_RC_MAIN_RHYTHM' }, { k: 'bgm', label: 'SQ_BGM_RC_MGCMN_OP' });
    this.clock.start();
    this.soundMan.setExcellentLimit(this.clock.bpm);
    this.setPhase('main');
    this.stage = 0;
    if (this.cfg.remixShort) {
      this.wipeFadeTriggered = true;
      this.lastBeatState = this.clock.beatState(0);
      this.stage = 2;
    }
    /* OnRmGameStartAfter(+0x2B0) 는 끝에서 부른다. 반환값 쓰임(mg1809 = 시퀀스 완료 여부)은 이 웹 대리에서 다루지 않는다 — 02_rhythm.md 14.10 */
    this.onRmGameStartAfter();
    return true;
  }

  /** 흰 페이드가 재생 중인지(원본 WipeModule::IsPlayingFadeAnim: in/out 애니 재생 중) */
  private fadePlaying(): boolean {
    return this.wipe.playing;
  }

  /**
   * 원본 RmMgSceneBase::OnGameEnd @0x71004453c4 (inst 아님): 점수판 아웃(+0x42C) 뒤
   * - 모드 3 이 아니고 (메들리 결과 || +0x2C == 0): 흰 페이드아웃(1.0), +0x370 = 0, OnRmGameEnd(=1) → 단계 11
   * - 그 밖(리믹스): +0x370 = 0 이면 (+0x2C ≠ 0 이면 셰프 모자 FUN_710042a300) 페이드아웃, +0x370 = 1 → 페이드가 끝나면 RequestReturnScene
   */
  /** @orig main:71004453c4 ref */
  onGameEnd(): boolean {
    const c = this.cfg;
    this.statusUi = false;
    if (c.mode !== 3 && (c.medley || !c.midCourse)) {
      this.wipe.fadeOut(WIPE_WHITE, 1.0);
      this.stage = 0;
      return this.onRmGameEnd();
    }
    if (this.stage !== 1) {
      if (this.stage !== 0) return false;
      this.wipe.fadeOut(WIPE_WHITE, 1.0);
      this.stage = 1;
    }
    if (!this.fadePlaying()) this.finish();
    return false;
  }

  /**
   * 원본 MinigameFlow 단계 11 FUN_71002e1910: OnGameFinish(=1) 뒤 하위 0 에서 끝 텔롭(FUN_71002e2e90)을 시작한다.
   * 리듬 장면은 SetupGame 이 SetFinishTelop(−1) 이라 텔롭이 없어 하위 99 → 다음 프레임 단계 12 [판독 + 추정: 엔티티 없음 → 0].
   * (그 두 프레임 세기는 공용 틀 app/minigame/frame/scene 의 단계 11 이 한다)
   */
  onGameFinish(): boolean {
    /* MinigameFlow 단계 11 FUN_71002e1910 의 끝 텔롭 하위 단계(onGameFinish 머리 주석) */
    return this.onRmGameFinish();
  }

  /** 원본 RmMgSceneBase::OnGameEndingBefore @0x7100445518 */
  /** @orig main:7100445518 ref */
  onGameEndingBefore(): boolean {
    const c = this.cfg;
    if (this.stage !== 0) {
      this.resultStart();
      this.stage = 0;
      return true;
    }
    if (c.mode === 3 || (!c.medley && c.midCourse)) {
      return true;
    }
    if (this.fadePlaying()) return false;
    this.statusUi = false;
    this.perfectTelop = false;
    this.trigRmGameEndingSetting();
    this.setPhase('ending');
    this.stage = 1;
    return false;
  }

  /**
   * 결과 시작 — 원본 FUN_7100447030 [판독]: 네 명에게 결과 모션 키 rm_co_idle00(파일 co_idle00)을 속도 1.0 으로,
   * 리듬 쿠킹·메들리·코스 중간이면 rc_pract_idle00 을 GetPlayRate 속도로. 이어서 FUN_7100446b60 이 머리 시선을 켜고 카메라 위치를 보게 한다.
   */
  private resultStart(): void {
    const c = this.cfg;
    const pract = c.rc && c.medley && c.midCourse;
    for (const p of this.entities) {
      p.resultMotion = pract
        ? { name: RESULT_MOTIONS.pract, next: null, speed: F(this.clock.bpm / 120), frame: 0 }
        : { name: RESULT_MOTIONS.idle, next: null, speed: 1, frame: 0 };
      p.look.head = true;
      p.headTarget = { ...this.resultCameraPos };
    }
  }

  /** 원본 RmMgSceneBase::OnGameEnding @0x7100445620 */
  /** @orig main:7100445620 ref */
  onGameEnding(): boolean {
    const c = this.cfg;
    const rec = this.record;
    const rate = rec?.rate ?? 0;
    const MG = this.mg.toUpperCase();
    if (this.stage === 0) {
      this.wipe.fadeIn(WIPE_WHITE, 1.0);
      /* FUN_71004431cc: LoadSettingPreset("<mg>_result") */
      this.eventSink.push({ k: 'soundPreset', name: `${this.mg}_result` });
      /* f32(rate / 20) 을 double 로 0.1 과 비교 — 작으면 앰비언트 생략(+0x471 = 1) [판독 @0x7100445694~0x71004456b4] */
      if (F(rate / 20) < 0.1) this.ambientDone = true;
      this.stageTimer = 0;
      this.stage = 1;
    }
    if (this.stage === 1) {
      this.stageTimer = F(RM_DT + this.stageTimer);
      if (this.stageTimer > F(0.1)) {
        if (!this.ambientDone) {
          this.eventSink.push({ k: 'bgm', label: `SM_AMB_${MG}_MG_RESULT` });
          this.ambientDone = true;
        }
        if (!this.cheerDone) {
          /* SQ_SE_RC_CHEER_MG_FIN(+0x2C ≠ 0 이면 _MG), 지역 변수 5 = (int)달성률 */
          this.eventSink.push({ k: 'seLocal', label: c.midCourse ? 'SQ_SE_RC_CHEER_MG' : 'SQ_SE_RC_CHEER_MG_FIN', index: 5, value: Math.trunc(rate) });
          this.cheerDone = true;
        }
      }
      if (this.fadePlaying()) return false;
      /* FUN_7100447a90: (+0x2C == 0) 결과 징글 GOOD(판정 > 1)/BAD, 결과 연출 갱신 람다 시작 */
      if (!c.midCourse) this.eventSink.push({ k: 'bgm', label: (rec?.judge ?? 0) > 1 ? `SM_JIN_${MG}_MG_RESULT_GOOD` : `SM_JIN_${MG}_MG_RESULT_BAD` });
      this.resultState = 0;
      this.resultTimer = 0;
      this.stageTimer = 0;
      this.stage = 2;
    }
    return false;
  }

  /**
   * 결과 연출 파이버(FUN_7100446b20) — 람다 @0x7100447d10 상태 0 [판독]: timer += dt, timer ≥ (1/PlayRate)·0.5 이면
   * 승패 모션(FUN_71004475d0, 리듬 쿠킹이 아니거나 코스 마지막)과 결과 점수판(FUN_7100448610). 웹은 점수판에서 끝낸다.
   */
  private updateResultFiber(): void {
    if (this.resultState === 3) {
      /* 결과 점수판 람다(@0x71004495f0)가 끝 플래그(+0x48)를 세울 때까지 결과 장면을 유지한다 */
      if (this.frame - (this.resultPanelFrame ?? this.frame) >= RESULT_PANEL_FRAMES) this.finish();
      return;
    }
    if (this.resultState !== 0) return;
    this.resultTimer = F(RM_DT + this.resultTimer);
    const playRate = F(this.clock.bpm / 120);
    if (this.resultTimer < F(F(1 / playRate) * RESULT_PANEL_DELAY_BEATS)) return;
    const c = this.cfg;
    if (!c.rc || !c.midCourse) {
      /* FUN_71004475d0 → FUN_7100446d90: 판정 3 → co_win00a→b, 2 → co_joy00a→b, 1 이하 → co_lose00a→b(속도는 바꾸지 않는다) */
      const judge = this.record?.judge ?? 0;
      const a = judge > 1 ? (judge === 2 ? RESULT_MOTIONS.joy : RESULT_MOTIONS.win) : RESULT_MOTIONS.lose;
      for (const p of this.entities) p.resultMotion = { name: a, next: a.replace(/a$/, 'b'), speed: p.resultMotion?.speed ?? 1, frame: 0 };
    }
    /* FUN_7100448610: 결과 점수판 시작(같은 프레임) */
    this.resultState = 3;
    this.resultPanelFrame = this.frame;
  }

  // ------------------------------------------------------------------ OnGameMain

  /** 컨트롤 안내 와이프가 끝났는지(원본 RmUiCntWipe::IsWipeFinished = 내부 +0x80, 표시하지 않으면 생성자 값 1) */
  private wipeFinished(): boolean {
    if (!this.cfg.controlWipe) return true;
    return this.wipeCloseFrame >= 0 && this.frame - this.wipeCloseFrame >= this.controlWipeFrames;
  }

  /**
   * 원본 RmMgSceneBase::OnGameMain 한 프레임. 참 = 1 반환(단계 10). 단계 사이 goto 는 continue 로 같은 프레임에 이어 간다.
   * 꼬리(줄 배분)를 타지 않고 돌아가는 곳(단계 0 대기, 리믹스 단계 2, 단계 10)은 원본처럼 꼬리 없이 끝난다.
   */
  onGameMain(): boolean {
    const r = this.clock;
    const c = this.cfg;
    const beat = r.beatState(this.mainBeatType);
    const beat4 = r.beatState(0);
    let skipCount = false;
    stages: for (;;) {
      switch (this.stage) {
        case 0:
          if (beat4 !== 1) return false;
          /* (!inst) FUN_7100431c5c 와이프 닫기 요청, 코스 첫 게임이면 FUN_710042a300(셰프 모자, 모드 3 만) */
          if (c.controlWipe && this.wipeCloseFrame < 0) this.wipeCloseFrame = this.frame;
          if (!c.controlWipe && !this.wipeFadeTriggered) {
            this.wipeFadeTriggered = true;
            this.trigRmGameWipeFadeOutStart();
          }
          this.countBeats = 0;
          this.lastBeatState = 1;
          this.stage = 1;
          skipCount = true;
          continue stages;
        case 1:
          if (!skipCount && this.lastBeatState !== beat4) {
            this.lastBeatState = beat4;
            this.countBeats++;
          }
          if (c.controlWipe && this.countBeats > 4 && (this.calibrationFrame < 0 || this.frame - this.calibrationFrame >= CALIBRATION_FRAMES)) {
            this.eventSink.push({ k: 'bgm', label: 'SQ_BGM_RC_CALIBRATION' });
            this.calibrationFrame = this.frame;
          }
          if (beat4 > 3 && this.wipeFinished()) {
            this.countBeats = 0;
            this.stage = 2;
            continue stages;
          }
          break stages;
        case 2:
          if (!(beat4 === 1 && r.g14 !== 16)) break stages;
          this.row = 0;
          this.lastBeatState = -1;
          this.lockRow = 0;
          this.lockBeat = -1;
          if (c.remixShort) {
            this.trigRmGameMainBgmPracticeStart();
            this.trigRmGameMainBgmPracticeFinish();
            this.stage = 4;
            return false;
          }
          this.trigRmGameMainBgmPracticeStart();
          /* 게임 BGM 이름 확정(FUN_7100441990) + 재생 요청(FUN_7100426948). 소리는 시퀀스 핸드셰이크로 다음 마디 첫 틱에 난다.
             요청(SoundModule::Play)은 'se' 로 낸다 — 시퀀스가 곧바로 G13 = 곡 ID 를 써 OP 를 끝내고 마스터 킥을 쉬게 한다. 'bgm' 은 단계 3 의 접수 */
          this.soundMan.requestGameBgm(this.bgmLabel);
          this.practiceArrow = true;
          this.countBeats = 0;
          this.stage = 3;
          continue stages;
        case 3:
          if (this.soundMan.gameBgmAccepted()) {
            /* FUN_7100426b8c 참(G12 가 바뀜) → PracticeFinish, +0x37C = 0, +0x380 = −1 */
            this.eventSink.push({ k: 'bgm', label: this.bgmLabel });
            this.bgmStartFrame = r.masterFrame;
            this.trigRmGameMainBgmPracticeFinish();
            this.row = 0;
            this.lastBeatState = -1;
            this.stage = 4;
            continue stages;
          }
          if (this.lastBeatState !== beat4) {
            if (this.countBeats < 4) this.eventSink.push({ k: 'se', label: 'SQ_SE_MG1800_COUNT_STICK' });
            this.lastBeatState = beat4;
            this.countBeats++;
          }
          if (beat4 > 2) this.practiceArrow = false;
          break stages;
        case 4:
          if (c.remixShort ? beat4 > 3 : this.soundMan.gameBgmIntro(this.bgmLabel)) {
            /* FUN_7100426c2c(게임 BGM 지역 변수 L0 == 1, 시작 2박 뒤) → FUN_7100426380 + IntroStart */
            this.trigRmGameMainBgmIntroStart();
            this.stage = 5;
            continue stages;
          }
          break stages;
        case 5:
          if (beat4 !== 1) break stages;
          this.eventSink.push({ k: 'soundPreset', name: 'mg1800_cmn' });
          /* TrigRmGameMainBgmTopStart(0,2): MapImpl NPC 'co_joyful00' 키(파일 joy_mot[MotNo]) 를 8분 4개(MotNo 1 이면 2개) 길이로 */
          this.trigRmGameMainBgmTopStart();
          if (!c.rc) this.eventSink.push({ k: 'telop', player: -1, judge: 'START', pos: { x: 0, y: 0, z: 0 } });
          this.statusUi = true;
          this.stage = 6;
          continue stages;
        case 6: {
          const n = this.rows.length;
          let go = false;
          if (c.mode === 3) {
            /* 모드 3: +0x2C == 0 이면 줄수 ≤ Lock && (게임 BGM 핸들 없음 || L1 == 1), +0x2C ≠ 0 이면 핸들 무효 || 줄수 ≤ Lock.
               mg1801 리믹스는 늘 코스 중간(A 슬롯)이고 BGM 은 이어 울리므로 줄수 ≤ Lock 이다. L1 은 [미확정]이라 참으로 둔다 */
            go = n <= this.lockRow;
          } else if (n - 4 <= this.lockRow) {
            go = true;
            this.endingLabel = c.midCourse
              ? rmInterEndBgmName(this.bgmPrefix, c.mode, c.bpm, c.chart01)
              : rmEndingBgmName(this.gameBgmFinName, this.bgmPrefix, c.mode, c.bpm, c.chart01);
            /* 종료 BGM 재생 요청(FUN_71004269d8, +0x2C ≠ 0 이면 +0x448 직접 Play) — 단계 2 와 같이 'se' 가 요청, 단계 7 'bgm' 이 접수 */
            this.soundMan.requestEndingBgm(this.endingLabel, c.midCourse);
          }
          if (!go) break stages;
          this.stageTimer = 0;
          this.stage = 7;
          continue stages;
        }
        case 7:
          if (c.mode === 3 || this.soundMan.endingBgmAccepted()) {
            if (c.mode !== 3) this.eventSink.push({ k: 'bgm', label: this.endingLabel });
            /* TrigRmGameMainChartEnd(0,5): Player::Finish ×4, MapImpl NPC co_idle00(2박 길이) */
            this.trigRmGameMainChartEnd();
            if (!c.rc) this.eventSink.push({ k: 'telop', player: -1, judge: 'FINISH', pos: { x: 0, y: 0, z: 0 } });
            this.stageTimer = 0;
            this.stage = 8;
            continue stages;
          }
          break stages;
        case 8:
          if (c.mode !== 3) {
            this.stageTimer = F(RM_DT + this.stageTimer);
            if (this.stageTimer < r.beatToSec(0, 1)) break stages;
          }
          this.recordResult();
          if (!c.rc && !c.midCourse) this.showPerfect();
          this.stageTimer = 0;
          this.stage = 9;
          /* 원본 case 8 은 break 없이 case 9 로 이어진다 */
          continue stages;
        case 9:
          if (c.mode !== 3) {
            this.stageTimer = F(RM_DT + this.stageTimer);
            if (!c.midCourse && this.stageTimer < r.beatToSec(0, 7)) break stages;
            this.eventSink.push({ k: 'soundStop', label: this.bgmLabel });
          }
          if (!c.midCourse) {
            /* StopMainBgm @0x71004261bc(마스터·OP) + FUN_7100426264(게임 BGM) */
            this.eventSink.push({ k: 'soundStop', label: 'SQ_BGM_RC_MAIN_RHYTHM' }, { k: 'soundStop', label: 'SQ_BGM_RC_MGCMN_OP' });
            if (c.mode === 3) this.eventSink.push({ k: 'soundStop', label: this.bgmLabel });
          }
          this.stageTimer = 0;
          this.stage = 10;
          continue stages;
        case 10:
          this.stage = 0;
          this.stageTimer = 0;
          return true;
        default:
          break stages;
      }
    }
    if (this.stage < 6) {
      /* SetMgBgmBeforeOneBeatStart(1,0): 단계 4·5 에서 4분 상태 == 마디 마지막 박이면 꼬리를 돈다 */
      if (
        this.beforeOneBeat &&
        this.stage > 3 &&
        (!this.useBeatCheck || (this.beforeBeatType === 0 ? beat4 : r.beatState(this.beforeBeatType)) === BEATS_PER_BAR[this.beforeBeatType])
      )
        this.entryTail(beat);
    } else {
      if (this.lockBeat !== beat && this.lockRow < this.rows.length && !this.forceEnd) {
        this.onRmRecieveBeatEntryLock({ row: this.lockRow, beat, item: this.rows[this.lockRow] });
        this.lockBeat = beat;
        this.lockRow++;
      }
      this.entryTail(beat);
    }
    return this.onRmGameMain();
  }

  /** 원본 꼬리 ENTRY: 경과 프레임 +1, 8분 상태가 바뀌면 줄 하나 */
  private entryTail(beat: number): void {
    this.elapsedFrame++;
    if (beat !== this.lastBeatState && this.row < this.rows.length && !this.forceEnd) {
      this.onRmRecieveBeatEntry({ row: this.row, beat, item: this.rows[this.row] });
      if (this.nextOffset > 0 && this.row + this.nextOffset < this.rows.length) {
        this.onRmRecieveBeatNextEntry({ row: this.row + this.nextOffset, beat, item: this.rows[this.row + this.nextOffset] });
      }
      this.lastBeatState = beat;
      this.row++;
    }
  }

  /** 원본 결과 기록 FUN_710042ca10(단계 8, +0x462 로 한 번) — 점수·달성률·별 판정과 GetResultPlayerScoreMax 비교 */
  /** @orig main:710042ca10 ref */
  private recordResult(): void {
    if (this.record) return;
    const gw = this.gameWork;
    const j = starJudge(gw.teamScore(), gw.starTotal);
    /* GetResultPlayerScoreMax(idx, p) = ExtA·ExtB + personalPlayNum·2 (mg1801 은 Ext 없음). personalPlayNum 은 SetPersonalPlayNum(레인) 이고
       점수는 PlayerID 칸이다. 웹은 PlayerID = 레인이라 같은 칸을 비교한다 */
    const perfect = gw.scores.map((s, p) => s === gw.resultPlayerScoreMax(p));
    this.record = { scores: [...gw.scores], rate: j.rate, judge: j.judge, perfect };
  }

  /**
   * PERFECT 텔롭 — 원본 FUN_710043af00 [판독]: 플레이어 0~3 마다 GetResultPlayerScore == GetResultPlayerScoreMax 면 띄운다.
   * RmCmnParamMan+0x30(생성자 기본 1)이면 COM 은 뺀다(IsPlayerCom). 이 값을 덮어쓰는 곳은 찾지 못해 기본 1 로 둔다.
   */
  /** @orig main:710043af00 ref */
  private showPerfect(): void {
    const rec = this.record!;
    rec.perfect.forEach((ok, p) => {
      if (ok && !this.gameWork.isCom[p]) {
        this.perfectShown[p] = true;
        this.eventSink.push({ k: 'perfect', player: p });
        this.perfectTelop = true;
      }
    });
  }

  /** 모션 진행(애니메이션 갱신은 파이버 뒤) — NPC 와 결과 모션. 이번 프레임에 다시 시작한 것은 0 프레임에 둔다 */
  /* (NPC 는 게임 훅 updateGameAnimation — mg1801 MapImpl) */
  updateAnimation(): void {
    this.updateGameAnimation();
    for (const p of this.entities) if (p.resultMotion) p.resultMotion.frame = F(p.resultMotion.frame + p.resultMotion.speed);
  }

  protected finish(): void {
    this.setPhase('result');
    this.flow = 14;
    this.finished = true;
    this.onResultReady();
  }

  protected setPhase(p: Phase): void {
    this.phase = p;
  }
}
