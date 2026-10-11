/**
 * 채소 하나 — 원본 mg1801::Obj [판독: Obj::Obj @0x7100004b90, Entry @0x7100007bd0, Update @0x7100008a64,
 * RecieveHit @0x710000849c, CutObj @0x71000095f0, EntrySe @0x7100009060, Stop @0x7100009480].
 * 필드 이름 옆 주석은 원본 Obj 기준 오프셋이다. 근거와 해석은 docs/minigame/mg1801.md 4.5·6.2~6.9절.
 *
 * 화면 전용 처리(모델 표시, 뼈 표시, 외곽선, 'move' 모션 속도)는 값만 state 로 내보낸다.
 * 외곽선 안내는 원본 UpdateOutlineOnOff @0x7100008e40 대로 레인 점유(World.outlinePlace = sm_outline_place)를 따진다.
 * 켜는 조건(Entry 의 guide)은 ObjectMan 이 OBJ1 'L' && RmGameWork::IsOutLineGuideDispEnable(모드 < 2)로 정한다.
 */
import { F, type V3, v3 } from '@game/core/fmath';
import type { ObjView } from '../state';
import { MAX_CUT_COUNTS, OFFSET_X, SE_L_LABEL, SE_S_LABEL } from './data';
import type { World } from './world';

export const JUST = 0;
export const FAST = 1;
export const SLOW = 2;
export const NONE = 3;

const HALF_PI = F(Math.PI / 2);
const QUARTER_PI = F(Math.PI / 4);

export class Obj {
  /** +0x004 VEGETABLE_ID */
  readonly type: number;
  readonly cuts: number;
  /** +0x0B0 레인별 판정 완료 */
  readonly judged: boolean[];
  /** +0x0C8 레인별 판정(−1 없음) */
  readonly judge: number[];
  /** +0x0E0 조각 물보라 지연(초) */
  readonly splashDelay: number[];
  /** +0x0F8 */
  readonly splashed: boolean[];
  /** +0x110 조각 각도(도) */
  readonly pieceAngle: number[];
  /** +0x128 조각 회전 방향 누적 */
  readonly pieceRotDir: number[];
  /** 조각 훅 x 이동량(원본 ComAttachment +0x40) */
  readonly pieceDx: number[];
  /** +0x140 시작 레인 */
  lane = 0;
  /** +0x150 기준 위치 */
  readonly pos: V3 = v3();
  /** 이번 프레임 표시 위치(원본 Update 의 지역 변수 → SetTranslation) */
  readonly shown: V3 = v3();
  /** +0x160 */
  readonly vel: V3 = v3();
  /** +0x170 */
  active = false;
  /** +0x171 */
  outlineGuide = false;
  /** +0x172 외곽선을 보이고 레인을 점유 중 */
  outlineShown = false;
  /** 외곽선 엔티티(+0x38) 위치 — Entry 때 (lane·2 − 3 + offsetX, 1.5, 0) [판독: @0x7100007f20~0x7100007f64] */
  readonly outlinePos: V3 = v3();
  /** +0x174 등장 후 경과(초) */
  elapsed = 0;
  /** +0x178 박자 안 경과(초) */
  stepTimer = 0;
  /** +0x17C */
  cutRotState = 0;
  /** +0x180 */
  lastBeat = -1;
  /** +0x190 시작 오일러 */
  readonly rot0: V3 = v3();
  /** 이번 프레임 회전 */
  readonly rot: V3 = v3();

  constructor(
    /** +0x000 풀 번호 */
    readonly id: number,
    type: number,
    private readonly w: World,
  ) {
    this.type = type;
    this.cuts = MAX_CUT_COUNTS[type];
    const n = this.cuts;
    this.judged = new Array<boolean>(n).fill(false);
    this.judge = new Array<number>(n).fill(-1);
    this.splashDelay = new Array<number>(n + 1).fill(0);
    this.splashed = new Array<boolean>(n + 1).fill(false);
    this.pieceAngle = new Array<number>(n + 1).fill(0);
    this.pieceRotDir = new Array<number>(n + 1).fill(0);
    this.pieceDx = new Array<number>(n + 1).fill(0);
  }

  /** 원본 Obj::Entry(int 미사용, bool guide, int lane) */
  /** @orig mg1801:7100007bd0 ref */
  entry(guide: boolean, lane: number): void {
    const n = this.cuts;
    this.pieceDx.fill(0);
    this.pos.x = F(lane * 2.0 - 3.0 + OFFSET_X[this.type]);
    this.pos.y = F(7.5);
    this.pos.z = 0;
    this.shown.x = this.pos.x;
    this.shown.y = this.pos.y;
    this.shown.z = this.pos.z;
    if (this.type === 4) {
      this.rot0.x = 0;
      this.rot0.y = -QUARTER_PI;
    } else {
      this.rot0.x = -HALF_PI;
      this.rot0.y = 0;
    }
    this.rot0.z = 0;
    this.rot.x = this.rot0.x;
    this.rot.y = this.rot0.y;
    this.rot.z = 0;
    this.outlineGuide = guide;
    this.outlineShown = false;
    if (guide) {
      this.outlinePos.x = this.pos.x;
      this.outlinePos.y = F(1.5);
      this.outlinePos.z = 0;
    }
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.lane = lane;
    this.active = true;
    this.elapsed = 0;
    this.stepTimer = 0;
    this.cutRotState = 0;
    this.lastBeat = -1;
    for (let k = 0; k < n; k++) {
      this.judged[k] = false;
      this.judge[k] = -1;
    }
    const rng = this.w.rng;
    for (let i = 0; i <= n; i++) {
      this.splashDelay[i] = F(F(rng.syncRandF() * 1.5) / 60);
      this.splashed[i] = false;
    }
    const perm: number[] = [];
    for (let i = 0; i <= n; i++) perm.push(i);
    for (let j = perm.length; j > 1; j--) {
      const r = rng.syncRandMod(j);
      const t = perm[j - 1];
      perm[j - 1] = perm[r];
      perm[r] = t;
    }
    for (let i = 0; i <= n; i++) this.splashDelay[i] = F(F(perm[i] * 1.5) / 60);
    for (let i = 0; i <= n; i++) {
      this.pieceAngle[i] = 0;
      this.pieceRotDir[i] = 0;
    }
  }

  /** 원본 Obj::RecieveHit(lane, judge) */
  /** @orig mg1801:710000849c ref */
  recieveHit(lane: number, judge: number): void {
    const k = lane - this.lane;
    if (k < 0 || k >= this.cuts) throw new Error(`mg1801: RecieveHit 범위 밖 lane=${lane} obj=${this.id}`);
    this.judged[k] = true;
    this.judge[k] = judge;
    this.w.se3d(judge === JUST ? 'SQ_SE_MG1801_JUST' : 'SQ_SE_MG1801_SUCCESS', this.shown);
  }

  /**
   * 원본 Obj::Update — 매 프레임. 줄 순서는 디스어셈블리 @0x7100008a64~0x7100008e34 그대로다:
   *   하강 표시 위치 계산(지역 변수) → 박 경계면 기준 위치 확정 → elapsed += dt
   *   → elapsed > t3 이면 { 낙하(> t3 + t1·0.5: pos += vel·dt, UpdateOutlineOnOff(false)) → (≥ t4 − 0.2f) EntrySe → (≥ t4 + t1) Push·Stop }
   *   → (elapsed < t4 && 박 바뀜) 'move' → SetTranslation(낙하 전에 계산한 표시 위치) → 회전 → CutObj → UpdateOutlineOnOff(true)
   * 반올림: 하강 분모는 fnmsub(한 번 반올림), 낙하 pos += vel·dt 는 fmul 뒤 fadd(두 번), 회전은 fmul 뒤 fadd(두 번).
   */
  /** @orig mg1801:7100008a64 ref */
  update(): void {
    if (!this.active) return;
    const w = this.w;
    const dt = w.dt;
    const t3 = w.rhythm.beatToSec(0, 3);
    const t4 = w.rhythm.beatToSec(0, 4);
    const t1 = w.rhythm.beatToSec(0, 1);
    const stopFrame = w.params.stopFrame;
    const stop = F(stopFrame / 60);
    let sx = this.pos.x;
    let sy = this.pos.y;
    let sz = this.pos.z;
    const acc = F(dt + this.stepTimer);
    this.stepTimer = acc;
    let commit = false;
    if (stop <= acc) {
      let k = F(F(acc - stop) / F(F(t1 * 60 - stopFrame) / 60));
      k = F(k + k);
      if (k > 2) k = 2;
      sx = F(k * 0 + this.pos.x);
      sy = F(k * -1 + this.pos.y);
      sz = F(k * 0 + this.pos.z);
      if (t1 < acc) commit = true;
    } else if (acc > t1) {
      commit = true;
    }
    if (commit) {
      this.stepTimer = 0;
      this.pos.x = sx;
      this.pos.y = sy;
      this.pos.z = sz;
    }
    this.elapsed = F(dt + this.elapsed);
    const t1Half = F(t1 * 0.5);
    if (this.elapsed > t3) {
      if (this.elapsed > F(t3 + t1Half)) {
        const vy = F(F(2 / t1) * -1 * 1.5);
        this.pos.y = F(F(vy * dt) + this.pos.y);
        this.vel.x = 0;
        this.vel.y = vy;
        this.vel.z = 0;
        this.updateOutlineOnOff(false);
      }
      if (F(t4 + F(-0.2)) <= this.elapsed) this.entrySe();
      if (this.elapsed >= F(t4 + t1)) {
        w.objectMan.pushResultVegetable(this.type, this.judge, this.lane);
        this.stop();
      }
    }
    if (this.elapsed < t4) {
      const beat = w.rhythm.beatState(0);
      if (beat !== this.lastBeat) this.lastBeat = beat;
    }
    this.shown.x = sx;
    this.shown.y = sy;
    this.shown.z = sz;
    let s = F(this.elapsed / t3);
    if (s > 1.25) s = F(1.25);
    this.rot.x = F(this.rot0.x + F((0 - this.rot0.x) * s));
    this.rot.y = F(this.rot0.y + F((0 - this.rot0.y) * s));
    this.rot.z = F(this.rot0.z + F((0 - this.rot0.z) * s));
    this.cutObj();
    this.updateOutlineOnOff(true);
  }

  /**
   * 원본 Obj::UpdateOutlineOnOff(bool) @0x7100008e40 [판독]:
   * - outlineGuide 일 때만. 범위 = (OutlineAloneSize2 && cuts ≥ 2) ? 레인 0..3 : lane..lane+cuts−1
   * - 켜기: 아직 안 보이고 범위가 모두 비었으면 점유하고 보인다. 하나라도 차 있으면 그대로(다음 호출에 다시 시도)
   * - 끄기: 보이는 중이면 점유를 풀고 숨긴 뒤 outlineGuide = 0. outlineShown 은 지우지 않는다(원본 그대로).
   *   안 보이는 중이면 아무것도 안 한다 — 그래서 막혀 있던 외곽선은 낙하 중에도 켜기를 다시 시도한다.
   */
  /** @orig mg1801:7100008e40 ref */
  private updateOutlineOnOff(on: boolean): void {
    if (!this.outlineGuide) return;
    const place = this.w.outlinePlace;
    const wide = this.w.params.outlineAloneSize2 && this.cuts >= 2;
    const start = wide ? 0 : this.lane;
    const count = wide ? 4 : this.cuts;
    if (start + count - 1 < 0 || start + count - 1 >= 4) throw new Error(`mg1801: 외곽선 범위 밖 obj=${this.id}`);
    if (!on) {
      if (!this.outlineShown) return;
      for (let i = start; i < start + count; i++) place[i] = 0;
      this.outlineGuide = false;
      return;
    }
    if (this.outlineShown) return;
    for (let i = start; i < start + count; i++) if (place[i] !== 0) return;
    for (let i = start; i < start + count; i++) place[i] = 1;
    this.outlineShown = true;
  }

  /** 원본 Obj::EntrySe — 물에 닿을 때 소리·물보라 */
  /** @orig mg1801:7100009060 ref */
  private entrySe(): void {
    const n = this.cuts;
    let justCount = 0;
    for (let k = 0; k < n; k++) if (this.judge[k] === 0) justCount++;
    const effect = (this.type | 4) === 4 ? 'mg1801_water_entry01' : 'mg1801_water_entry00';
    const at = (i: number): V3 => ({ x: F(this.shown.x + this.piecePosX(i)), y: F(-0.5), z: this.shown.z });
    if (justCount === 0) {
      if (!this.splashed[0]) {
        this.w.se3d(SE_L_LABEL[this.type], { x: this.shown.x, y: F(-0.5), z: this.shown.z });
        for (let i = 0; i <= n; i++) this.w.effect(effect, at(i));
        this.splashed[0] = true;
      }
      return;
    }
    const dt = this.w.dt;
    for (let i = 0; i <= n; i++) {
      if (this.splashed[i]) continue;
      this.splashDelay[i] = F(this.splashDelay[i] - dt);
      if (this.splashDelay[i] <= 0) {
        this.w.se3d(SE_S_LABEL[this.type], at(i));
        this.w.effect(effect, at(i));
        this.splashed[i] = true;
      }
    }
  }

  /** 조각 i 의 본체 기준 x 중심(화면·이펙트 위치용, 레인 간격 2) */
  piecePosX(i: number): number {
    const n = this.cuts;
    const left = i === 0 ? -n : -n + 1 + 2 * (i - 1);
    const right = i === n ? n : -n + 1 + 2 * i;
    return (left + right) / 2 + this.pieceDx[i];
  }

  /** 원본 Obj::CutObj — JUST 자리에서 조각을 가르고 돌린다 */
  /** @orig mg1801:71000095f0 ref */
  private cutObj(): void {
    const n = this.cuts;
    const w = this.w;
    const dt = w.dt;
    if (w.params.cutRotEnable) {
      const t3 = w.rhythm.beatToSec(0, 3);
      const tw = w.rhythm.beatToSec(1, 1);
      if (this.cutRotState === 0 && F(t3 + tw) <= this.elapsed) {
        let next = 1;
        if (n >= 1) {
          for (let i = 0; i < n; i++) {
            if (this.judge[i] === 0) {
              let count = i !== 0 || n === 1 ? 2 : 1;
              let j = i;
              while (count-- > 0) {
                if (this.judge[i] === 0 && (i === 0 || n === j || this.judge[i - 1] === 0)) {
                  this.pieceRotDir[j] = F((j <= (n - 1) >>> 1 ? 1 : -1) + this.pieceRotDir[j]);
                }
                j++;
              }
            } else {
              this.pieceRotDir[i] = 0;
              this.pieceRotDir[i + 1] = 0;
            }
          }
          next = this.cutRotState + 1;
        }
        this.cutRotState = next;
      }
    }
    const vel = new Array<number>(n + 1).fill(0);
    for (let i = 0; i < n; i++) {
      if (this.judge[i] !== 0) continue;
      for (let j = 0; j <= n; j++) vel[j] = F(vel[j] + (j <= i ? F(-0.4) : F(0.4)));
    }
    for (let j = 0; j <= n; j++) {
      this.pieceDx[j] = F(this.pieceDx[j] + F(dt * vel[j]));
      this.pieceAngle[j] = F(this.pieceAngle[j] + F(F(dt * this.pieceRotDir[j]) * w.params.cutRotSpeed));
    }
  }

  /** 원본 Obj::Stop — +0x170(active)·+0x171(outlineGuide) 를 함께 0 으로(16비트 쓰기), outlineShown 과 점유는 그대로 */
  /** @orig mg1801:7100009480 ref */
  stop(): void {
    this.active = false;
    this.outlineGuide = false;
  }

  view(): ObjView {
    return {
      id: this.id,
      type: this.type,
      active: this.active,
      lane: this.lane,
      cuts: this.cuts,
      pos: { ...this.shown },
      rot: { ...this.rot },
      pieces: this.pieceDx.map((dx, i) => ({ dx, angleDeg: this.pieceAngle[i], splashed: this.splashed[i] })),
      judge: [...this.judge],
      moveBeat: this.lastBeat,
      outline: this.outlineShown && this.outlineGuide,
      outlinePos: { ...this.outlinePos },
    };
  }
}
