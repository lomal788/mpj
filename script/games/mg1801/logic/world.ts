/**
 * 한 판의 공유 상태 — 원본 MaintainProduct 인터페이스(GetScene/GetPlayerMan/GetObjectMan/GetStageMan)와
 * 엔진 모듈(MainModule·RandModule·SoundModule)을 묶은 자리. 제품들이 서로를 여기로 찾는다.
 */
import type { V3 } from '../../../core/fmath';
import { FRAME_DT } from '../../../core/clock';
import type { RandModule } from '../../../core/rng';
import type { RhythmClock } from '../../rhythm/clock';
import type { RmGameWork } from '../../rhythm/gameWork';
import type { RmSoundMan } from '../../rhythm/soundMan';
import type { Mg1801Event } from '../state';
import { type Mg1801Params, PARAMS } from './data';
import type { ObjectMan } from './objectMan';
import type { PlayerMan } from './playerMan';

export class World {
  readonly params: Mg1801Params = { ...PARAMS };
  /** 원본 Obj::sm_outline_place[4] — 외곽선 안내 레인 점유(Obj 생성자가 0 으로 지운다) */
  readonly outlinePlace = [0, 0, 0, 0];
  objectMan!: ObjectMan;
  playerMan!: PlayerMan;
  /** 원본 RmGameWork+0x20 리듬 모드(0 노멀, 1 롱, 2 하드, 3 리믹스) */
  mode = 0;
  /** 별 총점(CalcTotalPoint) */
  totalPoint = 0;

  constructor(
    readonly rhythm: RhythmClock,
    readonly rng: RandModule,
    /** 플레이어(레인 순서)별 CPU 여부 — 원본 RmGameWork::IsPlayerCom */
    readonly isCom: readonly boolean[],
    /** 플레이어(레인 순서)별 캐릭터 ID(pcNN) */
    readonly chars: readonly string[],
    /** 이번 프레임 사건(장면 기반 RmMgSceneBase 와 같은 배열) */
    readonly events: Mg1801Event[],
    /** 원본 RmGameWork(장면 +0x310 싱글턴) — 점수 */
    private readonly gameWork: RmGameWork,
    /** 원본 RmSoundMan(장면 +0x328 싱글턴) — JUST 판정음 */
    private readonly soundMan: RmSoundMan,
  ) {}

  /** 원본 RmGameWork+0xEBC 플레이어 점수(0..999) */
  get scores(): readonly number[] {
    return this.gameWork.scores;
  }

  /** 원본 bex::MainModule::GetDeltaTime — 리듬 장면은 고정 f32(1/60) [판독: docs/engine/01_core.md] */
  get dt(): number {
    return FRAME_DT;
  }

  /** 원본 FUN_7100427040 한 프레임(games/rhythm/soundMan.ts RmSoundMan) */
  tickExcellentSe(): void {
    this.soundMan.tickExcellentSe();
  }

  /** 마스터 시작(FUN_71004263c8) 때 +0x2C = (60 / BPM) · 0.5 (RmSoundMan) */
  setExcellentLimit(bpm: number): void {
    this.soundMan.setExcellentLimit(bpm);
  }

  /** 원본 RmSoundMan::PlayExcellentSe(-1, true) @0x7100426e38 (games/rhythm/soundMan.ts) */
  playExcellentSe(): void {
    this.soundMan.playExcellentSe();
  }

  /** 원본 RmStarEffectMan::Start → FUN_710042a6b8 (games/rhythm/gameWork.ts RmGameWork) */
  addScore(playerId: number, points: number): void {
    this.gameWork.addScore(playerId, points);
  }

  /** 팀 합(≤999) — 원본 RmUiStatusMan 이 달성 점수로 쓴다 (RmGameWork) */
  teamScore(): number {
    return this.gameWork.teamScore();
  }

  se3d(label: string, pos: V3): void {
    this.events.push({ k: 'se3d', label, pos: { ...pos } });
  }

  se(label: string): void {
    this.events.push({ k: 'se', label });
  }

  effect(name: string, pos: V3): void {
    this.events.push({ k: 'effect', name, pos: { ...pos } });
  }
}
