/**
 * 채소 풀과 판정 — 원본 mg1801::ObjectManImpl [판독: SetupPhase1 @0x7100003d00, Entry @0x7100003f50,
 * JudgeInput @0x71000044d0, SendHitJudge @0x7100004640, PushResultVegetable @0x71000046a0, GetHeadTarget @0x71000047e0,
 * Update @0x7100004920].
 */
import { F, type V3 } from '@game/core/fmath';
import type { LaneCount } from '../state';
import type { ChartRow } from './chart';
import { POOL_PER_TYPE } from './data';
import { FAST, JUST, NONE, Obj, SLOW } from './obj';
import type { World } from './world';

/** 원본 JudgeInput 반환 — objId 칸은 SendHitJudge 가 param_2[2] 로 읽는 것에서 정했다 [추정] */
export interface JudgeData {
  type: number;
  diff: number;
  objId: number;
}

const TYPE_OF: Record<string, number> = { L: 2, M: 1, X: 3, Z: 4 };

export class ObjectMan {
  /** +0x28 풀(종류 우선 순서) */
  readonly pool: Obj[] = [];
  /** 레인별 판정 집계(원본 ResultData 를 레인으로 펼친 것) */
  readonly counts: LaneCount[] = [0, 1, 2, 3].map(() => ({ just: 0, fast: 0, slow: 0, miss: 0 }));

  constructor(private readonly w: World) {
    let id = 0;
    for (let type = 0; type < 5; type++) for (let i = 0; i < POOL_PER_TYPE; i++) this.pool.push(new Obj(id++, type, w));
  }

  /** 원본 ObjectManImpl::Entry(Data) — 줄 하나 */
  entry(row: ChartRow): void {
    const obj1 = row.obj[0];
    for (let lane = 0; lane < 4; lane++) {
      const code = row.player[lane];
      if (code.length === 0 || code[0] === ' ') continue;
      const type = TYPE_OF[code[0]] ?? 0;
      const obj = this.pool.find((o) => o.type === type && !o.active);
      if (!obj) continue;
      const guide = obj1.length > 0 && obj1[0] === 'L' && this.isOutLineGuideDispEnable();
      obj.entry(guide, lane);
    }
  }

  /** 원본 RmGameWork::IsOutLineGuideDispEnable = RmGameWork+0x20(리듬 모드) < 2 — 노멀·롱에서 켜고 하드·리믹스에서 끈다 [판독, 02_rhythm 3.2] */
  private isOutLineGuideDispEnable(): boolean {
    return this.w.mode < 2;
  }

  /** 원본 ObjectManImpl::JudgeInput(lane) — 풀 순서로 처음 걸리는 채소 */
  judgeInput(lane: number): JudgeData {
    const w = this.w;
    const target = w.rhythm.beatToSec(0, 3);
    const win = w.rhythm.beatToSec(1, 1);
    const targetF = Math.trunc(F(target * 60));
    const winF = Math.trunc(F(win * 60));
    for (const o of this.pool) {
      if (!o.active) continue;
      const k = lane - o.lane;
      if (k < 0 || k >= o.cuts) continue;
      if (o.judged[k]) continue;
      const diff = targetF - Math.trunc(F(o.elapsed * 60));
      if (Math.abs(diff) > winF) continue;
      const type = Math.abs(diff) <= w.params.justRangeFrame ? JUST : diff >= 1 ? FAST : SLOW;
      return { type, diff, objId: o.id };
    }
    return { type: NONE, diff: 0, objId: -1 };
  }

  /**
   * 원본 ObjectManImpl::GetHeadTarget(lane, out) [판독 @0x71000047e0, f32 곱 뒤 fcvtzs]:
   * 풀 순서로 처음 걸리는 채소 — 활성이고 레인 범위 안이며 (int)(t1·60) ≤ ef 이고 (int)(tw·60) ≤ (int)(t3·60) − ef
   * (ef = (int)(elapsed·60)). 그 채소 본체 엔티티 위치(이번 프레임 Update 가 넣은 표시 위치)를 돌려준다.
   */
  getHeadTarget(lane: number): V3 | null {
    const r = this.w.rhythm;
    const t3F = Math.trunc(F(r.beatToSec(0, 3) * 60));
    const twF = Math.trunc(F(r.beatToSec(1, 1) * 60));
    const t1F = Math.trunc(F(r.beatToSec(0, 1) * 60));
    for (const o of this.pool) {
      if (!o.active) continue;
      if (!(o.lane <= lane && lane < o.lane + o.cuts)) continue;
      const ef = Math.trunc(F(o.elapsed * 60));
      if (t1F <= ef && twF <= t3F - ef) return { ...o.shown };
    }
    return null;
  }

  /** 원본 ObjectManImpl::SendHitJudge(lane, judgeData) */
  sendHitJudge(lane: number, j: JudgeData): void {
    const o = this.pool.find((p) => p.id === j.objId);
    if (o) o.recieveHit(lane, j.type);
  }

  /** 원본 PushResultVegetable(type, judge[]) — 레인별로 펼쳐 센다(−1 = 놓침) */
  pushResultVegetable(_type: number, judge: readonly number[], lane: number): void {
    judge.forEach((j, k) => {
      const c = this.counts[lane + k];
      if (j === JUST) c.just++;
      else if (j === FAST) c.fast++;
      else if (j === SLOW) c.slow++;
      else c.miss++;
    });
  }

  /** 원본 Update 파이버 한 프레임 */
  update(): void {
    for (const o of this.pool) o.update();
  }

  anyActive(): boolean {
    return this.pool.some((o) => o.active);
  }
}
