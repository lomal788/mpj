/**
 * bex::ComHeading 머리 시선(광장 NPC·따라가기 공용) — docs/engine/09_character.md §4.6·§6.8 [판독 main FUN_71001bea18·FUN_71001bfe08·FUN_71001c0c90·FUN_71001c1694].
 * 매 프레임 head_aimcont 로컬을 쉬는 자세로 되돌린 뒤(애니 클립에 이 뼈 트랙이 없음), 대상 방향 최단 회전을 head_weight 로 slerp →
 * YZX 분해 → head_min/max(도) 자름 → ZYX 재구성 → 모드 4(임계 감쇠 스프링 / 선형 / 둘의 slerp)로 따라간다.
 * 값: impl 기본 speedCoef 0.12·linearSpeed 5, 한계·가중치는 characterlist 레코드(head_*). 눈 시선(FUN_71001c5a58)은 eyeYaw/eyePitch 로 내보낸다.
 */
import * as THREE from 'three';

const DEG = Math.PI / 180;
const SPEED_COEF = 0.12;
const LINEAR_SPEED = 5;
const EYES_LOOK_WEIGHT = 1;
const FRAME_SEC = 1 / 60;
const K = Math.min(2000, Math.pow(SPEED_COEF, 2.252184) * 17851.338);
const C = 2 * Math.sqrt(K);
const W_LO = 2.0943952;
const W_HI = 4.1887903;
const F32_EPS = 1.1920929e-7;

export interface HeadParams {
  head_min_x?: number | null;
  head_min_y?: number | null;
  head_min_z?: number | null;
  head_max_x?: number | null;
  head_max_y?: number | null;
  head_max_z?: number | null;
  head_weight?: number | null;
}

/** 대상: 위치 고정 또는 물체(뼈 이름이 있으면 그 뼈 월드 위치, 없으면 물체 원점) */
export type HeadTarget = { pos: THREE.Vector3 } | { obj: THREE.Object3D; bone?: string } | null;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function slerpFromIdentity(q: THREE.Quaternion, t: number): THREE.Quaternion {
  const sg = q.w < 0 ? -1 : 1;
  const c = Math.abs(q.w);
  let s0 = 1 - t;
  let s1 = t * sg;
  if (c <= 1 - F32_EPS) {
    const th = Math.acos(c);
    const si = Math.sin(th);
    s0 = Math.sin((1 - t) * th) / si;
    s1 = (sg * Math.sin(t * th)) / si;
  }
  return new THREE.Quaternion(q.x * s1, q.y * s1, q.z * s1, s0 + q.w * s1);
}

export class Heading {
  target: HeadTarget = null;
  enabled = true;
  eyeYaw = 0;
  eyePitch = 0;
  eyesActive = false;
  private head: THREE.Object3D | null = null;
  private readonly rest = new THREE.Quaternion();
  private readonly cur = new THREE.Quaternion();
  private readonly vel = new THREE.Vector4();
  private readonly prevT = new THREE.Vector4(0, 0, 0, 1);
  private front = 1;
  private readonly min: THREE.Vector3;
  private readonly max: THREE.Vector3;
  private readonly weight: number;

  constructor(p: HeadParams) {
    this.min = new THREE.Vector3(p.head_min_x ?? -10, p.head_min_y ?? -90, p.head_min_z ?? 0).multiplyScalar(DEG);
    this.max = new THREE.Vector3(p.head_max_x ?? 10, p.head_max_y ?? 90, p.head_max_z ?? 0).multiplyScalar(DEG);
    this.weight = p.head_weight ?? 0.5;
  }

  /** 모델이 붙은 뒤 한 번: head_aimcont 와 쉬는 자세 */
  bind(root: THREE.Object3D): void {
    this.head = root.getObjectByName('head_aimcont') ?? null;
    if (this.head) this.rest.copy(this.head.quaternion);
  }

  get bound(): boolean {
    return !!this.head;
  }

  private targetPos(): THREE.Vector3 | null {
    const t = this.target;
    if (!t) return null;
    if ('pos' in t) return t.pos.clone();
    const b = t.bone ? t.obj.getObjectByName(t.bone) : null;
    return (b ?? t.obj).getWorldPosition(new THREE.Vector3());
  }

  /** 모션 포즈 뒤 steps 프레임만큼 */
  apply(root: THREE.Object3D, steps: number): void {
    const head = this.head;
    if (!head) return;
    head.quaternion.copy(this.rest);
    root.updateMatrixWorld(true);
    const tp = this.targetPos();
    const qT = new THREE.Quaternion();
    if (tp && this.enabled && head.parent) {
      const dir = head.parent.worldToLocal(tp.clone()).sub(head.position);
      const ent = root.worldToLocal(tp.clone()).sub(root.worldToLocal(head.getWorldPosition(new THREE.Vector3())));
      if (dir.lengthSq() > 0 && ent.lengthSq() > 0) {
        dir.normalize();
        this.front = ent.normalize().z;
        const d1 = 1 + dir.z;
        if (d1 <= F32_EPS) qT.set(1, 0, 0, 0);
        else {
          const s = Math.sqrt(d1 + d1);
          qT.set(-dir.y / s, dir.x / s, 0, s * 0.5);
        }
      }
    }
    const q = new THREE.Quaternion().slerp(qT, this.weight);
    if (tp) {
      const e = new THREE.Euler().setFromQuaternion(q, 'YZX');
      e.set(clamp(e.x, this.min.x, this.max.x), clamp(e.y, this.min.y, this.max.y), clamp(e.z, this.min.z, this.max.z), 'ZYX');
      q.setFromEuler(e);
    }
    const cur = this.cur;
    const vel = this.vel;
    const pt = this.prevT;
    for (let n = 0; n < steps; n++) {
      const w = Math.acos(clamp(q.x * pt.x + q.y * pt.y + q.z * pt.z + q.w * pt.w, -1, 1)) / FRAME_SEC;
      const lin = w > W_LO ? cur.clone().rotateTowards(q, FRAME_SEC * LINEAR_SPEED) : null;
      let spr: THREE.Quaternion | null = null;
      if (w < W_HI) {
        const h = FRAME_SEC;
        vel.x += ((cur.x - q.x) * -K - vel.x * C) * h;
        vel.y += ((cur.y - q.y) * -K - vel.y * C) * h;
        vel.z += ((cur.z - q.z) * -K - vel.z * C) * h;
        vel.w += ((cur.w - q.w) * -K - vel.w * C) * h;
        spr = new THREE.Quaternion(cur.x + vel.x * h, cur.y + vel.y * h, cur.z + vel.z * h, cur.w + vel.w * h).normalize();
      }
      if (lin && spr) cur.copy(spr.slerp(lin, (w - W_LO) / W_LO));
      else cur.copy((lin ?? spr)!);
      pt.set(q.x, q.y, q.z, q.w);
    }
    if (Math.abs(Math.abs(cur.w) - 1) >= F32_EPS) {
      head.quaternion.copy(cur).multiply(this.rest);
      head.updateMatrixWorld(true);
    }
    const t = Math.min(2, clamp(this.front + 1.8, 0, 2) * (EYES_LOOK_WEIGHT - this.weight));
    const ee = new THREE.Euler().setFromQuaternion(slerpFromIdentity(qT, t), 'YZX');
    this.eyePitch = ee.x;
    this.eyeYaw = ee.y;
    this.eyesActive = !!tp && this.enabled;
  }
}
