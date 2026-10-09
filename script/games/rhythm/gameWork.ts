/**
 * 원본 ca::rm::RmGameWork(docs/engine/02_rhythm.md 3.2) 중 웹이 쓰는 것 + 모드·코스 설정 풀기.
 * 모드·코스·BPM 은 리듬 쿠킹(rc_stage01 SettingGameWork·SettingBpm)이 쓰는 값이고, 미니게임 모드 프리플레이는 노멀·하드·BPM 120 이다.
 */
import { BPM, RC_SPEEDUP_BPM } from './data';

export interface RmCourse {
  index: number;
  count: number;
}

export interface RmOptions {
  /** 시험용: 채보 직접 지정(원본 IsChartDataFree 경로 = Params.chartNo) */
  chart?: string;
  /** RmGameWork+0x20. 1·3 은 리듬 쿠킹에서만 나오므로 course 가 없으면 코스 첫 게임으로 둔다 */
  mode?: number;
  /**
   * 리듬 쿠킹 코스 안이면 index(+0x38)·count(+0x3C). 없으면 미니게임 모드 프리플레이(mgm01, PlayMode 1).
   * 코스 수: 노멀·하드 3, 롱 6, 리믹스 6. mg1801 은 리믹스에서 A 슬롯(index 0, chart05s)만 맡는다 [판독: rc_stage01.md 4.6·6.1].
   */
  course?: RmCourse | null;
  /** 시험 전용: 리듬 쿠킹 컨트롤 안내 와이프가 닫기 요청(단계 0) 뒤 끝나는 프레임 수 */
  controlWipeFrames?: number;
  /** 시험 전용: OnGameStartAfter 전 대기 프레임 */
  prerollFrames?: number;
}

/** 모드·코스에서 정해지는 RmGameWork·RmMgSceneBase 값 */
export interface RmConfig {
  mode: number;
  /** RmGameWork+0x1C == 1(리듬 쿠킹 진행 중) */
  rc: boolean;
  index: number;
  count: number;
  /** RmGameWork+0x2C — 코스에서 뒤에 게임이 더 남음 (rc_stage01 PreGameWaitFunc @0x71000355ec: idx < 코스수−1) */
  midCourse: boolean;
  /** RmGameWork+0x6C5 — rc_stage01 Params.mg_result_visible(기본 1) → SetMedleyMgResultEnable [판독] */
  medley: boolean;
  bpm: number;
  chart: string;
  /** RmMgSceneBase+0x470 — 채보 경로에 "chart01." */
  chart01: boolean;
  /** 리믹스 2번째 이후(모드 3 && 코스 index > 0) — 단계 0~5 단축. mg1801 은 A 슬롯뿐이라 원본에서는 생기지 않는다 */
  remixShort: boolean;
  /** RmUiCntWipe+0x1D — 컨트롤 안내 와이프 표시. PlayMode 1(미니게임 모드)·리믹스 2번째 이후면 끈다 [판독: SyncedSetupGame @0x7100443340] */
  controlWipe: boolean;
}

/** 게임마다 다른 채보 고르기(원본 RmSyncedSetupGame 등 — 02_rhythm.md 6.2) */
export interface RmChartRule {
  /** 모드 → 채보 이름(확장자 없이) */
  chartName(mode: number): string;
  /** 리믹스 코스 자리 고정(예: mg1801 은 A 슬롯 index 0 만) */
  remixCourse?(course: RmCourse): RmCourse;
}

export function resolveRmConfig(opts: RmOptions, rule: RmChartRule): RmConfig {
  let mode = opts.mode ?? 0;
  if (![0, 1, 2, 3].includes(mode)) mode = 0;
  let course = opts.course ?? null;
  if ((mode === 1 || mode === 3) && !course) course = { index: 0, count: mode === 1 || mode === 3 ? 6 : 3 };
  if (mode === 3 && course && rule.remixCourse) course = rule.remixCourse(course);
  const rc = course !== null;
  const index = course?.index ?? 0;
  const count = course?.count ?? 1;
  const bpm = rc && mode === 1 && index >= Math.trunc(count / 2) ? RC_SPEEDUP_BPM : BPM;
  const chart = opts.chart ?? rule.chartName(mode);
  const remixShort = mode === 3 && index > 0;
  return {
    mode,
    rc,
    index,
    count,
    midCourse: rc && index < count - 1,
    medley: rc,
    bpm,
    chart,
    chart01: `${chart}.json`.includes('chart01.'),
    remixShort,
    controlWipe: rc && !remixShort,
  };
}

/** 원본 RmGameWork 중 점수·결과 쪽 */
export class RmGameWork {
  /** 원본 RmGameWork+0xEBC 플레이어 점수(0..999) */
  readonly scores = [0, 0, 0, 0];
  /** 별 총점(SetStarTotalScore, 게임이 CalcTotalPoint 등으로 넘긴다) */
  starTotal = 0;
  /** SetPersonalPlayNum — 결과 최대 점수용 개인 횟수(PlayerID 칸) */
  readonly personalPlayNum = [0, 0, 0, 0];
  /** SetPersonalPlayNumExt(pid, a, b) — 추가 최대 점수 a·b (mg1807·1810) */
  readonly personalExtA = [0, 0, 0, 0];
  readonly personalExtB = [0, 0, 0, 0];

  constructor(
    /** 플레이어(레인 순서)별 CPU 여부 — 원본 RmGameWork::IsPlayerCom */
    readonly isCom: readonly boolean[],
  ) {}

  /** 원본 RmStarEffectMan::Start → FUN_710042a6b8: score = clamp(score + points, 0, 999) */
  addScore(playerId: number, points: number): void {
    this.scores[playerId] = Math.max(0, Math.min(999, this.scores[playerId] + points));
  }

  /** 팀 합(≤999) — 원본 RmUiStatusMan 이 달성 점수로 쓴다 */
  teamScore(): number {
    return Math.min(999, this.scores.reduce((a, b) => a + b, 0));
  }

  setStarTotalScore(total: number): void {
    this.starTotal = total;
  }

  setPersonalPlayNum(pid: number, n: number): void {
    this.personalPlayNum[pid] = n;
  }

  setPersonalPlayNumExt(pid: number, a: number, b: number): void {
    this.personalExtA[pid] = a;
    this.personalExtB[pid] = b;
  }

  /** GetResultPlayerScoreMax(idx, p) = ExtA·ExtB + personalPlayNum·2 [판독 02_rhythm.md 8.3] */
  resultPlayerScoreMax(pid: number): number {
    return this.personalExtA[pid] * this.personalExtB[pid] + this.personalPlayNum[pid] * 2;
  }
}
