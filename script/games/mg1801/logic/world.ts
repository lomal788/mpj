/**
 * 한 판의 공유 상태 — 원본 MaintainProduct 인터페이스(GetScene/GetPlayerMan/GetObjectMan/GetStageMan)와
 * 엔진 모듈(MainModule·RandModule·SoundModule)을 묶은 자리. 제품들이 서로를 여기로 찾는다.
 */
import { F, type V3 } from '../../../core/fmath';
import { FRAME_DT } from '../../../core/clock';
import type { RandModule } from '../../../core/rng';
import type { Mg1801Event } from '../state';
import { type Mg1801Params, PARAMS } from './data';
import type { ObjectMan } from './objectMan';
import type { PlayerMan } from './playerMan';
import { RhythmClock } from './rhythm';

/**
 * RmSoundMan+0x28 의 0x38 B 파이버(FUN_7100426fcc 생성, 본문 FUN_7100427040) — PlayExcellentSe 상태 [판독: main].
 * 파이버는 매 프레임 timer += dt, timer ≥ limit 이면 count = 1. limit 은 마스터 시작(FUN_71004263c8) 때 (60/BPM)·0.5.
 */
interface ExcellentSe {
  /** +0x28 마지막 새 재생 뒤 경과(초) */
  timer: number;
  /** +0x2C 반 박(초). 마스터 시작 전 0 */
  limit: number;
  /** +0x30 L0 로 쓰는 수 */
  count: number;
  /** +0x10..0x20 SQ_SE_RC_JUST 핸들이 있는지 */
  handle: boolean;
}

export class World {
  readonly params: Mg1801Params = { ...PARAMS };
  /** 원본 Obj::sm_outline_place[4] — 외곽선 안내 레인 점유(Obj 생성자가 0 으로 지운다) */
  readonly outlinePlace = [0, 0, 0, 0];
  private readonly excellent: ExcellentSe = { timer: 0, limit: 0, count: 0, handle: false };
  readonly events: Mg1801Event[] = [];
  objectMan!: ObjectMan;
  playerMan!: PlayerMan;
  /** 원본 RmGameWork+0x20 리듬 모드(0 노멀, 1 롱, 2 하드, 3 리믹스) */
  mode = 0;
  /** 원본 RmMgSceneBase+0x378 경과 프레임 */
  elapsedFrame = 0;
  /** 원본 RmGameWork+0xEBC 플레이어 점수(0..999) */
  readonly scores = [0, 0, 0, 0];
  /** 별 총점(CalcTotalPoint) */
  totalPoint = 0;

  constructor(
    readonly rhythm: RhythmClock,
    readonly rng: RandModule,
    /** 플레이어(레인 순서)별 CPU 여부 — 원본 RmGameWork::IsPlayerCom */
    readonly isCom: readonly boolean[],
    /** 플레이어(레인 순서)별 캐릭터 ID(pcNN) */
    readonly chars: readonly string[],
  ) {}

  /** 원본 bex::MainModule::GetDeltaTime — 리듬 장면은 고정 f32(1/60) [판독: docs/engine/01_core.md] */
  get dt(): number {
    return FRAME_DT;
  }

  /** 원본 FUN_7100427040 한 프레임 — RmSoundMan 생성(SetupGame)이 제품보다 먼저라 같은 프레임에서 제품 파이버보다 앞서 돈다 */
  tickExcellentSe(): void {
    const e = this.excellent;
    e.timer = F(this.dt + e.timer);
    if (e.limit <= e.timer) e.count = 1;
  }

  /** 마스터 시작(FUN_71004263c8) 때 +0x2C = (60 / BPM) · 0.5 */
  setExcellentLimit(bpm: number): void {
    this.excellent.limit = F(F(60 / bpm) * 0.5);
  }

  /**
   * 원본 RmSoundMan::PlayExcellentSe(-1, true) @0x7100426e38 [판독]:
   *   핸들 없음 || limit ≤ timer || count > 3 → 새로 Play("SQ_SE_RC_JUST"), timer = 0, count = 1
   *   그 밖 → (60/BPM)·0.5 < timer 면 새로 Play(timer 는 그대로), count + 1
   *   끝에 L0 = count.
   * 핸들 수명: 원본은 시퀀스가 끝나면 핸들이 죽는다. 코드표에 있는 G8 이면 시퀀스가 마지막 단계 뒤 wait 96(2박) 이라
   * 반 박 조건이 먼저 걸려 결과가 같고, 코드표 밖 G8(무음 fin)만 핸들이 바로 죽는다. 로직은 G8 을 모르므로 핸들은 첫 재생 뒤 살아 있다고 둔다 [근사].
   */
  playExcellentSe(): void {
    const e = this.excellent;
    let play = false;
    if (!e.handle || e.limit <= e.timer || e.count > 3) {
      play = true;
      e.handle = true;
      e.timer = 0;
      e.count = 1;
    } else {
      if (F(F(60 / this.rhythm.bpm) * 0.5) < e.timer) play = true;
      e.count = e.count + 1;
    }
    this.events.push({ k: 'justSound', combo: e.count, play });
  }

  /** 원본 RmStarEffectMan::Start → FUN_710042a6b8: score = clamp(score + points, 0, 999) */
  addScore(playerId: number, points: number): void {
    this.scores[playerId] = Math.max(0, Math.min(999, this.scores[playerId] + points));
  }

  /** 팀 합(≤999) — 원본 RmUiStatusMan 이 달성 점수로 쓴다 */
  teamScore(): number {
    return Math.min(999, this.scores.reduce((a, b) => a + b, 0));
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
