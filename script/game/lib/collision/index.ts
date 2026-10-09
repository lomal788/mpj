/**
 * 공용 충돌 질의 코어 — import 0(three·DOM·mpj·physx 없음). 원본 nn::bezel PhysicsWorld 규약을 그대로 둔다:
 * CastRay/CastShape(+All) 결과 구조·validity·initialOverlap, 레이어 = 번호(마스크는 1 << layer), 제외 엔티티, 캡슐 엔진 Y축 → SDK X축 quarter-turn,
 * PxHitFlag 조합(0x403/0x423/0x603/+0x80), All 결과 거리 정렬(libc++ std::sort), Map 침투 보정(후보 16·depth > .01·평균),
 * 형상 수명(Stage/Unstage·enabled·세대 핸들·teleport). 실제 판정은 백엔드 포트(CollisionBackend)가 한다 — 예: lib/collision-physx(PhysX 4.1.2 wasm).
 * 설계·원본 근거: docs/engine/11_moving_collision.md §3·§4·§6·§9(웹 런타임 계약).
 */

export type Vec3 = [number, number, number];
/** 자세 [px,py,pz,qx,qy,qz,qw] */
export type Pose = [number, number, number, number, number, number, number];

/** 엔티티 약한 핸들(원본 weak handle 의 번호·세대) */
export interface EntityRef {
  index: number;
  generation: number;
}

/** 형상 기하(엔진 규약). capsule 은 엔진 Y축(원본 CreateCapsule(radius, halfHeight)) */
export type CollisionGeometry =
  | { kind: 'sphere'; radius: number }
  | { kind: 'capsule'; radius: number; halfHeight: number }
  /** .apx 에 구운 PxShape 캡슐(이미 SDK X축 — quarter-turn 을 더하지 않는다) */
  | { kind: 'capsuleX'; radius: number; halfHeight: number }
  | { kind: 'box'; halfExtents: Vec3 }
  | { kind: 'plane' }
  | { kind: 'mesh'; mesh: number; scale?: Vec3; scaleRot?: [number, number, number, number] }
  | { kind: 'convex'; mesh: number; scale?: Vec3; scaleRot?: [number, number, number, number] };

/** 백엔드(SDK) 기하. capsule 은 SDK X축. type = PxGeometryType */
export interface SdkGeometry {
  type: 0 | 1 | 2 | 3 | 4 | 5;
  /** sphere [r] / capsule [r, hh] / box [hx,hy,hz] / mesh·convex [sx,sy,sz, rx,ry,rz,rw] */
  params: number[];
  mesh: number;
}

/** 형상 하나(원본 CollisionShape: 로컬 translation +0x10·quat +0x20·기하 +0x40·종류 +0x80) */
export interface CollisionShapeDesc {
  geometry: CollisionGeometry;
  /** 로컬 자세(기본 원점·identity) */
  local?: Pose;
  /** 레이어 번호(0~31). 질의 마스크와 다른 값이다(마스크 = 1 << layer) */
  layer: number;
  tag?: string;
  enabled?: boolean;
  /** PxShapeFlags 원본 값(기본 0x0B = simulation·scene query·visualization) */
  shapeFlags?: number;
  /** [정적 마찰, 동적 마찰, 반발] */
  material?: [number, number, number];
}

/** 0 Static / 1 Kinematic / 2 Dynamic(원본 RigidBody MotionType, §2.3) */
export type MotionType = 0 | 1 | 2;

export interface BodyDesc {
  entity: EntityRef;
  motion: MotionType;
  pose: Pose;
  shapes: CollisionShapeDesc[];
  /** 만들자마자 Stage(질의 대상) — 기본 true */
  staged?: boolean;
}

/** 질의 결과 한 건(원본 CastResult 0x80 B) */
export interface CastResult {
  /** +0x00 world */
  position: Vec3;
  /** +0x10 world */
  normal: Vec3;
  /** +0x20 Collision(몸체) 핸들 */
  body: number;
  /** +0x38 Entity */
  entity: EntityRef;
  /** +0x50 SDK hit 거리 비트 그대로 */
  distance: number;
  /** +0x54 0 정상 / 4 position 없음·NaN / 2 normal 없음·NaN(위치 검사가 먼저) */
  validity: number;
  /** +0x58 Shape 핸들 */
  shape: number;
  /** +0x70 distance <= 0 */
  initialOverlap: boolean;
  /** SDK 부가: face index·PxHitFlags */
  faceIndex: number;
  flags: number;
  tag: string | undefined;
}

/** 원본 RayArg */
export interface CastRayArg {
  origin: Vec3;
  /** 단위 방향(래퍼는 정규화하지 않는다) */
  direction: Vec3;
  distance: number;
  /** +0x24 대상 레이어 비트마스크 */
  mask: number;
  /** +0x28 제외 엔티티 */
  exclude?: EntityRef | null;
  /** +0x40 All 결과 거리 정렬 */
  sort?: boolean;
  /** +0x41 → eMESH_MULTIPLE(0x423) */
  meshMultiple?: boolean;
  /** +0x42 → eMESH_BOTH_SIDES(+0x80) */
  bothSides?: boolean;
}

/** 원본 CastShapeArg(선형 sweep — 회전 궤적 없음) */
export interface CastShapeArg {
  shape: CollisionShapeDesc | Omit<CollisionShapeDesc, 'layer'>;
  /** +0x90 position, +0xA0 quat */
  position: Vec3;
  rotation: [number, number, number, number];
  /** +0xB0 단위 방향 */
  direction: Vec3;
  distance: number;
  mask: number;
  exclude?: EntityRef | null;
  /** +0xE0 All 결과 거리 정렬 */
  sort?: boolean;
  /** +0xE1 → eMTD(0x603) */
  mtd?: boolean;
  /** +0xE2 → eMESH_BOTH_SIDES(+0x80) */
  bothSides?: boolean;
}

/** 백엔드가 채우는 hit(SDK 좌표·값 그대로) */
export interface BackendHit {
  position: Vec3;
  normal: Vec3;
  distance: number;
  flags: number;
  faceIndex: number;
  /** 백엔드 셰이프 id */
  shape: number;
}

/** 침투 결과 */
export interface Penetration {
  /** Actor 를 대상 바깥으로 미는 world 단위 방향 */
  direction: Vec3;
  depth: number;
}

/** 질의 백엔드 포트 — SDK 규약(PhysX PxScene/PxGeometryQuery 의미). 필터는 원본 prefilter 와 같은 숫자 규약으로 넘긴다 */
export interface CollisionBackend {
  createBody(motion: MotionType, pose: Pose): number;
  releaseBody(body: number): void;
  stage(body: number): void;
  unstage(body: number): void;
  /** mode 'set' = 자세 바로 바꿈(teleport, Dynamic 속도 0) / 'target' = Kinematic 목표(다음 물리 step 에 반영) */
  setBodyPose(body: number, pose: Pose, mode: 'set' | 'target'): void;
  /** filter = [layer, shapeId, entity.index, entity.generation](원본 prefilter 가 읽는 simulation filter data) */
  createShape(body: number, geom: SdkGeometry, local: Pose, filter: [number, number, number, number], material: [number, number, number], shapeFlags: number): number;
  setShapeFlags(shape: number, shapeFlags: number): void;
  setShapeFilter(shape: number, filter: [number, number, number, number]): void;
  /** all = false: block 1건(eBLOCK) / true: touch 목록(SDK 보고 순서, 최대 maxOut) */
  raycast(origin: Vec3, dir: Vec3, distance: number, hitFlags: number, mask: number, exclude: [number, number], all: boolean, maxOut: number, out: BackendHit[]): number;
  sweep(geom: SdkGeometry, pose: Pose, dir: Vec3, distance: number, hitFlags: number, mask: number, exclude: [number, number], all: boolean, maxOut: number, out: BackendHit[]): number;
  /** touch 후보(셰이프 id 만) */
  overlap(geom: SdkGeometry, pose: Pose, mask: number, exclude: [number, number], maxOut: number, out: number[]): number;
  /** computePenetration(geom@pose vs 셰이프의 현재 world 자세) */
  penetration(geom: SdkGeometry, pose: Pose, shape: number, out: Penetration): boolean;
}

/** 원본 규칙 스위치(기본 = 원본) */
export interface CollisionRules {
  /** All 질의 touch 버퍼(원본 0x80) */
  touchBuffer: number;
  /** Map 침투 후보 수(원본 16) */
  mapCandidates: number;
  /** Map 접촉 최소 깊이(원본 depth > .01) */
  mapMinDepth: number;
  /** All 정렬 = libc++ std::sort(원본 FUN_7100625f80) / 'stable' = 웹 안정 정렬 */
  allSort: 'libcxx' | 'stable';
}

export const RULES_ORIGINAL: CollisionRules = Object.freeze({ touchBuffer: 128, mapCandidates: 16, mapMinDepth: 0.01, allSort: 'libcxx' });
export const RULES_WEB: CollisionRules = Object.freeze({ touchBuffer: 128, mapCandidates: 16, mapMinDepth: 0.01, allSort: 'stable' });
export const collisionDefaults = { rules: RULES_ORIGINAL };

const f = Math.fround;
/** 원본 quarter-turn: sin/cos(π/4) — Z축 +90°(엔진 Y축 캡슐 → SDK X축) [근사: 원본은 다항식 sin/cos, 같은 f32 값으로 둔다] */
const QT = f(Math.SQRT1_2);

/** q · r (f32 단계마다) */
export function quatMul(a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number, out: number[], oo: number): void {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  const bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[oo] = f(f(f(f(aw * bx) + f(ax * bw)) + f(ay * bz)) - f(az * by));
  out[oo + 1] = f(f(f(f(aw * by) + f(ay * bw)) + f(az * bx)) - f(ax * bz));
  out[oo + 2] = f(f(f(f(aw * bz) + f(az * bw)) + f(ax * by)) - f(ay * bx));
  out[oo + 3] = f(f(f(f(aw * bw) - f(ax * bx)) - f(ay * by)) - f(az * bz));
}

/** R(q)·v (PxQuat::rotate 연산 순서, f32) */
export function quatRotate(q: ArrayLike<number>, qo: number, v: ArrayLike<number>, out: number[], oo: number): void {
  const qx = q[qo], qy = q[qo + 1], qz = q[qo + 2], qw = q[qo + 3];
  const vx = f(2 * v[0]), vy = f(2 * v[1]), vz = f(2 * v[2]);
  const w2 = f(f(qw * qw) - 0.5);
  const dot2 = f(f(f(qx * vx) + f(qy * vy)) + f(qz * vz));
  out[oo] = f(f(f(vx * w2) + f(f(f(qy * vz) - f(qz * vy)) * qw)) + f(qx * dot2));
  out[oo + 1] = f(f(f(vy * w2) + f(f(f(qz * vx) - f(qx * vz)) * qw)) + f(qy * dot2));
  out[oo + 2] = f(f(f(vz * w2) + f(f(f(qx * vy) - f(qy * vx)) * qw)) + f(qz * dot2));
}

/** a ∘ b(PxTransform 곱: p = a.p + R(a.q)·b.p, q = a.q·b.q) */
export function poseMul(a: ArrayLike<number>, b: ArrayLike<number>, out: number[], t: number[] = [0, 0, 0], q: number[] = [0, 0, 0, 0]): number[] {
  q[0] = b[0]; q[1] = b[1]; q[2] = b[2];
  quatRotate(a, 3, q, t, 0);
  quatMul(a, 3, b, 3, q, 0);
  out[0] = f(a[0] + t[0]); out[1] = f(a[1] + t[1]); out[2] = f(a[2] + t[2]);
  out[3] = q[0]; out[4] = q[1]; out[5] = q[2]; out[6] = q[3];
  return out;
}

export const IDENTITY: Readonly<Pose> = Object.freeze([0, 0, 0, 0, 0, 0, 1]) as Readonly<Pose>;
const QUARTER: Pose = [0, 0, 0, 0, 0, QT, QT];

/** 엔진 기하 + 로컬 자세 → SDK 기하 + SDK 로컬 자세(캡슐만 Z축 quarter-turn 을 더한다, 원본 FUN_71006045f0) */
export function toSdk(g: CollisionGeometry, local: ArrayLike<number>, outPose: number[], out: SdkGeometry = { type: 0, params: [], mesh: 0 }): SdkGeometry {
  for (let i = 0; i < 7; i++) outPose[i] = local[i];
  const p = out.params;
  out.mesh = 0;
  switch (g.kind) {
    case 'sphere':
      out.type = 0; p.length = 1; p[0] = g.radius;
      return out;
    case 'plane':
      out.type = 1; p.length = 0;
      return out;
    case 'capsule':
      quatMul(local, 3, QUARTER, 3, outPose, 3);
      out.type = 2; p.length = 2; p[0] = g.radius; p[1] = g.halfHeight;
      return out;
    case 'capsuleX':
      out.type = 2; p.length = 2; p[0] = g.radius; p[1] = g.halfHeight;
      return out;
    case 'box':
      out.type = 3; p.length = 3; p[0] = g.halfExtents[0]; p[1] = g.halfExtents[1]; p[2] = g.halfExtents[2];
      return out;
    case 'convex':
    case 'mesh': {
      const s = g.scale ?? UNIT;
      const r = g.scaleRot ?? NO_ROT;
      out.type = g.kind === 'mesh' ? 5 : 4;
      p.length = 7;
      p[0] = s[0]; p[1] = s[1]; p[2] = s[2]; p[3] = r[0]; p[4] = r[1]; p[5] = r[2]; p[6] = r[3];
      out.mesh = g.mesh;
      return out;
    }
  }
}
const UNIT: Readonly<Vec3> = [1, 1, 1];
const NO_ROT: Readonly<[number, number, number, number]> = [0, 0, 0, 1];

/** 원본 hit flags(PhysicsWorldExtension::CastRay @0x7100624fe8 / CastShape @0x71006252e0) */
export function rayHitFlags(a: Pick<CastRayArg, 'meshMultiple' | 'bothSides'>): number {
  return (a.meshMultiple ? 0x423 : 0x403) | (a.bothSides ? 0x80 : 0);
}
export function shapeHitFlags(a: Pick<CastShapeArg, 'mtd' | 'bothSides'>): number {
  return (a.mtd ? 0x603 : 0x403) | (a.bothSides ? 0x80 : 0);
}

// ---------------------------------------------------------------- libc++ std::sort(원본 FUN_7100625f80 — introsort, 비교 = distance <)

type Less<T> = (a: T, b: T) => boolean;
function swp<T>(a: T[], i: number, j: number): void {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
}
function sort3<T>(a: T[], x: number, y: number, z: number, c: Less<T>): number {
  let r = 0;
  if (!c(a[y], a[x])) {
    if (!c(a[z], a[y])) return r;
    swp(a, y, z);
    r = 1;
    if (c(a[y], a[x])) {
      swp(a, x, y);
      r = 2;
    }
    return r;
  }
  if (c(a[z], a[y])) {
    swp(a, x, z);
    return 1;
  }
  swp(a, x, y);
  r = 1;
  if (c(a[z], a[y])) {
    swp(a, y, z);
    r = 2;
  }
  return r;
}
function sort4<T>(a: T[], x1: number, x2: number, x3: number, x4: number, c: Less<T>): number {
  let r = sort3(a, x1, x2, x3, c);
  if (c(a[x4], a[x3])) {
    swp(a, x3, x4);
    r++;
    if (c(a[x3], a[x2])) {
      swp(a, x2, x3);
      r++;
      if (c(a[x2], a[x1])) {
        swp(a, x1, x2);
        r++;
      }
    }
  }
  return r;
}
function sort5<T>(a: T[], x1: number, x2: number, x3: number, x4: number, x5: number, c: Less<T>): number {
  let r = sort4(a, x1, x2, x3, x4, c);
  if (c(a[x5], a[x4])) {
    swp(a, x4, x5);
    r++;
    if (c(a[x4], a[x3])) {
      swp(a, x3, x4);
      r++;
      if (c(a[x3], a[x2])) {
        swp(a, x2, x3);
        r++;
        if (c(a[x2], a[x1])) {
          swp(a, x1, x2);
          r++;
        }
      }
    }
  }
  return r;
}
function insertionSort3<T>(a: T[], first: number, last: number, c: Less<T>): void {
  let j = first + 2;
  sort3(a, first, first + 1, j, c);
  for (let i = j + 1; i !== last; i++) {
    if (c(a[i], a[j])) {
      const t = a[i];
      let k = j;
      j = i;
      do {
        a[j] = a[k];
        j = k;
      } while (j !== first && c(t, a[--k]));
      a[j] = t;
    }
    j = i;
  }
}
function insertionSortIncomplete<T>(a: T[], first: number, last: number, c: Less<T>): boolean {
  switch (last - first) {
    case 0:
    case 1:
      return true;
    case 2:
      if (c(a[last - 1], a[first])) swp(a, first, last - 1);
      return true;
    case 3:
      sort3(a, first, first + 1, last - 1, c);
      return true;
    case 4:
      sort4(a, first, first + 1, first + 2, last - 1, c);
      return true;
    case 5:
      sort5(a, first, first + 1, first + 2, first + 3, last - 1, c);
      return true;
  }
  let j = first + 2;
  sort3(a, first, first + 1, j, c);
  let count = 0;
  for (let i = j + 1; i !== last; i++) {
    if (c(a[i], a[j])) {
      const t = a[i];
      let k = j;
      j = i;
      do {
        a[j] = a[k];
        j = k;
      } while (j !== first && c(t, a[--k]));
      a[j] = t;
      if (++count === 8) return i + 1 === last;
    }
    j = i;
  }
  return true;
}
function siftDown<T>(a: T[], first: number, c: Less<T>, len: number, start: number): void {
  let child = start - first;
  if (len < 2 || ((len - 2) >> 1) < child) return;
  child = 2 * child + 1;
  let ci = first + child;
  if (child + 1 < len && c(a[ci], a[ci + 1])) {
    ci++;
    child++;
  }
  if (c(a[ci], a[start])) return;
  const top = a[start];
  do {
    a[start] = a[ci];
    start = ci;
    if (((len - 2) >> 1) < child) break;
    child = 2 * child + 1;
    ci = first + child;
    if (child + 1 < len && c(a[ci], a[ci + 1])) {
      ci++;
      child++;
    }
  } while (!c(a[ci], top));
  a[start] = top;
}
function heapSort<T>(a: T[], first: number, last: number, c: Less<T>): void {
  const n = last - first;
  for (let s = (n - 2) >> 1; s >= 0; s--) siftDown(a, first, c, n, first + s);
  for (let len = n; len > 1; len--, last--) {
    swp(a, first, last - 1);
    siftDown(a, first, c, len - 1, first);
  }
}
function introsort<T>(a: T[], first: number, last: number, c: Less<T>, depth: number): void {
  const limit = 30;
  for (;;) {
    const len = last - first;
    switch (len) {
      case 0:
      case 1:
        return;
      case 2:
        if (c(a[last - 1], a[first])) swp(a, first, last - 1);
        return;
      case 3:
        sort3(a, first, first + 1, last - 1, c);
        return;
      case 4:
        sort4(a, first, first + 1, first + 2, last - 1, c);
        return;
      case 5:
        sort5(a, first, first + 1, first + 2, first + 3, last - 1, c);
        return;
    }
    if (len <= limit) {
      insertionSort3(a, first, last, c);
      return;
    }
    if (depth === 0) {
      heapSort(a, first, last, c);
      return;
    }
    depth--;
    let m = first;
    const lm1 = last - 1;
    let nSwaps: number;
    let delta = len >> 1;
    m += delta;
    if (len >= 1000) {
      delta >>= 1;
      nSwaps = sort5(a, first, first + delta, m, m + delta, lm1, c);
    } else nSwaps = sort3(a, first, m, lm1, c);
    let i = first;
    let j = lm1;
    let restart = false;
    if (!c(a[i], a[m])) {
      for (;;) {
        if (i === --j) {
          i++;
          j = last;
          if (!c(a[first], a[--j])) {
            for (;;) {
              if (i === j) return;
              if (c(a[first], a[i])) {
                swp(a, i, j);
                nSwaps++;
                i++;
                break;
              }
              i++;
            }
          }
          if (i === j) return;
          for (;;) {
            while (!c(a[first], a[i])) i++;
            while (c(a[first], a[--j]));
            if (i >= j) break;
            swp(a, i, j);
            nSwaps++;
            i++;
          }
          first = i;
          restart = true;
          break;
        }
        if (c(a[j], a[m])) {
          swp(a, i, j);
          nSwaps++;
          break;
        }
      }
    }
    if (restart) continue;
    i++;
    if (i < j) {
      for (;;) {
        while (c(a[i], a[m])) i++;
        while (!c(a[--j], a[m]));
        if (i > j) break;
        swp(a, i, j);
        nSwaps++;
        if (m === i) m = j;
        i++;
      }
    }
    if (i !== m && c(a[m], a[i])) {
      swp(a, i, m);
      nSwaps++;
    }
    if (nSwaps === 0) {
      const fs = insertionSortIncomplete(a, first, i, c);
      if (insertionSortIncomplete(a, i + 1, last, c)) {
        if (fs) return;
        last = i;
        continue;
      } else if (fs) {
        first = ++i;
        continue;
      }
    }
    if (i - first < last - i) {
      introsort(a, first, i, c, depth);
      first = ++i;
    } else {
      introsort(a, i + 1, last, c, depth);
      last = i;
    }
  }
}

/** 원본 All 정렬: std::sort(first, first + n, distance <) — libc++ introsort(깊이 2·floor(log2 n)) */
export function libcxxSort<T>(a: T[], n: number, less: Less<T>): void {
  if (n < 2) return;
  introsort(a, 0, n, less, 2 * (31 - Math.clz32(n)));
}

const byDistance: Less<CastResult> = (x, y) => x.distance < y.distance;

// ---------------------------------------------------------------- 핸들 표(세대)

interface Slot<T> {
  v: T | null;
  gen: number;
}
class HandleTable<T> {
  private slots: Slot<T>[] = [];
  private free: number[] = [];
  add(v: T): number {
    const i = this.free.length ? (this.free.pop() as number) : this.slots.push({ v: null, gen: 0 }) - 1;
    const s = this.slots[i];
    s.gen = (s.gen + 1) & 0x7fff || 1;
    s.v = v;
    return (s.gen << 16) | (i + 1);
  }
  get(h: number): T | null {
    const s = this.slots[(h & 0xffff) - 1];
    return s && s.v && s.gen === h >>> 16 ? s.v : null;
  }
  remove(h: number): T | null {
    const v = this.get(h);
    if (!v) return null;
    const i = (h & 0xffff) - 1;
    this.slots[i].v = null;
    this.free.push(i);
    return v;
  }
  *values(): IterableIterator<[number, T]> {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.v) yield [(s.gen << 16) | (i + 1), s.v];
    }
  }
}

interface ShapeState {
  handle: number;
  body: number;
  backend: number;
  desc: CollisionShapeDesc;
  enabled: boolean;
  shapeFlags: number;
}
interface BodyState {
  handle: number;
  backend: number;
  entity: EntityRef;
  motion: MotionType;
  pose: Pose;
  staged: boolean;
  shapes: number[];
}

export function emptyResult(): CastResult {
  return {
    position: [0, 0, 0], normal: [0, 0, 0], body: 0, entity: { index: 0, generation: 0 }, distance: f(3.4028234663852886e38), validity: 0, shape: 0,
    initialOverlap: false, faceIndex: 0, flags: 0, tag: undefined,
  };
}
function emptyBackendHit(): BackendHit {
  return { position: [0, 0, 0], normal: [0, 0, 0], distance: 0, flags: 0, faceIndex: 0, shape: 0 };
}

export interface MapContact {
  shape: number;
  body: number;
  entity: EntityRef;
  direction: Vec3;
  depth: number;
  /** contact+0x30 = direction × depth */
  vector: Vec3;
}

export class CollisionWorld {
  readonly rules: CollisionRules;
  private readonly bodies = new HandleTable<BodyState>();
  private readonly shapes = new HandleTable<ShapeState>();
  private readonly byBackendShape = new Map<number, number>();
  private readonly hits: BackendHit[] = [];
  private readonly ids: number[] = [];
  private readonly sdkPose: number[] = [0, 0, 0, 0, 0, 0, 1];
  private readonly qpose: number[] = [0, 0, 0, 0, 0, 0, 1];
  private readonly pen: Penetration = { direction: [0, 0, 0], depth: 0 };
  private readonly scratch: CastResult[] = [];
  private readonly geom: SdkGeometry = { type: 0, params: [], mesh: 0 };
  private readonly t3: number[] = [0, 0, 0];
  private readonly q4: number[] = [0, 0, 0, 0];

  constructor(readonly backend: CollisionBackend, rules: CollisionRules = collisionDefaults.rules) {
    this.rules = rules;
  }

  // ------------------------------------------------ 수명(원본 Stage/Unstage·enabled·세대·teleport, §2.2~2.3)

  createBody(desc: BodyDesc): number {
    const backend = this.backend.createBody(desc.motion, desc.pose);
    const st: BodyState = { handle: 0, backend, entity: { ...desc.entity }, motion: desc.motion, pose: [...desc.pose] as Pose, staged: false, shapes: [] };
    st.handle = this.bodies.add(st);
    for (const s of desc.shapes) this.addShape(st.handle, s);
    if (desc.staged !== false) this.stage(st.handle);
    return st.handle;
  }

  addShape(body: number, desc: CollisionShapeDesc): number {
    const b = this.bodies.get(body);
    if (!b) return 0;
    const geom = toSdk(desc.geometry, desc.local ?? IDENTITY, this.sdkPose);
    const st: ShapeState = { handle: 0, body, backend: 0, desc, enabled: desc.enabled !== false, shapeFlags: desc.shapeFlags ?? 0x0b };
    st.handle = this.shapes.add(st);
    const flags = st.enabled ? st.shapeFlags : st.shapeFlags & ~3;
    st.backend = this.backend.createShape(b.backend, geom, this.sdkPose as Pose, this.filterOf(st, b), desc.material ?? [0.5, 0.5, 0.9], flags);
    this.byBackendShape.set(st.backend, st.handle);
    b.shapes.push(st.handle);
    return st.handle;
  }

  private filterOf(s: ShapeState, b: BodyState): [number, number, number, number] {
    return [s.desc.layer & 31, s.handle, b.entity.index >>> 0, b.entity.generation >>> 0];
  }

  /** Stage(질의·물리 대상에 넣음) */
  stage(body: number): void {
    const b = this.bodies.get(body);
    if (!b || b.staged) return;
    this.backend.stage(b.backend);
    b.staged = true;
  }
  unstage(body: number): void {
    const b = this.bodies.get(body);
    if (!b || !b.staged) return;
    this.backend.unstage(b.backend);
    b.staged = false;
  }
  /** 형상 enabled(off = 질의·접촉 대상 아님) */
  setShapeEnabled(shape: number, on: boolean): void {
    const s = this.shapes.get(shape);
    if (!s || s.enabled === on) return;
    s.enabled = on;
    this.backend.setShapeFlags(s.backend, on ? s.shapeFlags : s.shapeFlags & ~3);
  }
  setShapeLayer(shape: number, layer: number): void {
    const s = this.shapes.get(shape);
    const b = s && this.bodies.get(s.body);
    if (!s || !b) return;
    s.desc = { ...s.desc, layer };
    this.backend.setShapeFilter(s.backend, this.filterOf(s, b));
  }
  /** 일반 자세 동기화(원본 FUN_71006097b4): Static = 자세 교체, Kinematic = 목표(다음 물리 step), Dynamic = 덮어쓰지 않음 */
  syncPose(body: number, pose: Pose): void {
    const b = this.bodies.get(body);
    if (!b) return;
    if (b.motion === 2) return;
    b.pose = [...pose] as Pose;
    this.backend.setBodyPose(b.backend, b.pose, b.motion === 1 ? 'target' : 'set');
  }
  /** Teleport(원본 EN0B → FUN_710060970c): 자세 바로 설정, Dynamic 만 선·각속도 0 */
  teleport(body: number, pose: Pose): void {
    const b = this.bodies.get(body);
    if (!b) return;
    b.pose = [...pose] as Pose;
    this.backend.setBodyPose(b.backend, b.pose, 'set');
  }
  /** 소멸: 모듈 목록 제거 + 세대 무효화(원본 FUN_71006082e0) */
  removeBody(body: number): void {
    const b = this.bodies.remove(body);
    if (!b) return;
    for (const s of b.shapes) {
      const st = this.shapes.remove(s);
      if (st) this.byBackendShape.delete(st.backend);
    }
    this.backend.releaseBody(b.backend);
  }
  dispose(): void {
    for (const [h] of [...this.bodies.values()]) this.removeBody(h);
  }
  bodyOf(shape: number): number {
    return this.shapes.get(shape)?.body ?? 0;
  }
  shapeDesc(shape: number): CollisionShapeDesc | null {
    return this.shapes.get(shape)?.desc ?? null;
  }
  bodyInfo(body: number): { entity: EntityRef; motion: MotionType; pose: Pose; staged: boolean; shapes: readonly number[] } | null {
    const b = this.bodies.get(body);
    return b ? { entity: b.entity, motion: b.motion, pose: b.pose, staged: b.staged, shapes: b.shapes } : null;
  }
  *allShapes(): IterableIterator<number> {
    for (const [h] of this.shapes.values()) yield h;
  }

  // ------------------------------------------------ 질의(원본 CastRay/CastShape(+All), §3)

  private readonly excl: [number, number] = [0, 0];
  private exclude(e: EntityRef | null | undefined): [number, number] {
    this.excl[0] = e ? e.index >>> 0 : 0;
    this.excl[1] = e ? e.generation >>> 0 : 0;
    return this.excl;
  }

  /** SDK hit → CastResult(원본 FUN_710062c3bc). 셰이프를 모르면 false(원본: Collision 없음 → 결과 미기록) */
  private convert(h: BackendHit, out: CastResult): boolean {
    const sh = this.byBackendShape.get(h.shape);
    const s = sh !== undefined ? this.shapes.get(sh) : null;
    const b = s ? this.bodies.get(s.body) : null;
    if (!s || !b) return false;
    out.position[0] = h.position[0]; out.position[1] = h.position[1]; out.position[2] = h.position[2];
    out.normal[0] = h.normal[0]; out.normal[1] = h.normal[1]; out.normal[2] = h.normal[2];
    out.distance = h.distance;
    out.body = b.handle;
    out.entity.index = b.entity.index;
    out.entity.generation = b.entity.generation;
    out.shape = s.handle;
    out.initialOverlap = h.distance <= 0;
    out.faceIndex = h.faceIndex;
    out.flags = h.flags;
    out.tag = s.desc.tag;
    const pl = f(Math.sqrt(f(f(f(h.position[1] * h.position[1]) + f(h.position[0] * h.position[0])) + f(h.position[2] * h.position[2]))));
    const nl = f(Math.sqrt(f(f(f(h.normal[0] * h.normal[0]) + f(h.normal[1] * h.normal[1])) + f(h.normal[2] * h.normal[2]))));
    if (Number.isNaN(pl) || (h.flags & 1) === 0) out.validity = 4;
    else if (Number.isNaN(nl) || (h.flags & 2) === 0) out.validity = 2;
    else out.validity = 0;
    return true;
  }

  private ensureHits(n: number): void {
    while (this.hits.length < n) this.hits.push(emptyBackendHit());
  }

  /** 원본 CastRay: block 1건. 반환 = 성공(결과 유효성은 validity 로 따로 본다) */
  castRay(a: CastRayArg, out: CastResult): boolean {
    this.ensureHits(1);
    const n = this.backend.raycast(a.origin, a.direction, a.distance, rayHitFlags(a), a.mask >>> 0, this.exclude(a.exclude), false, 1, this.hits);
    return n > 0 && this.convert(this.hits[0], out);
  }

  /** 원본 CastRayAll: touch 목록(최대 max) → sort 면 거리 정렬. 반환 = 결과 수 */
  castRayAll(a: CastRayArg, out: CastResult[], max: number): number {
    this.ensureHits(max);
    const n = this.backend.raycast(a.origin, a.direction, a.distance, rayHitFlags(a), a.mask >>> 0, this.exclude(a.exclude), true, max, this.hits);
    return this.collect(n, out, a.sort === true);
  }

  private shapePose(a: CastShapeArg): SdkGeometry {
    const local = a.shape.local ?? IDENTITY;
    const geom = toSdk(a.shape.geometry, local, this.sdkPose, this.geom);
    const qp = this.qpose;
    qp[0] = a.position[0]; qp[1] = a.position[1]; qp[2] = a.position[2];
    qp[3] = a.rotation[0]; qp[4] = a.rotation[1]; qp[5] = a.rotation[2]; qp[6] = a.rotation[3];
    poseMul(qp, this.sdkPose, this.sdkPose, this.t3, this.q4);
    return geom;
  }

  /** 원본 CastShape: 형상(로컬 자세 포함)의 선형 sweep, block 1건 */
  castShape(a: CastShapeArg, out: CastResult): boolean {
    this.ensureHits(1);
    const g = this.shapePose(a);
    const n = this.backend.sweep(g, this.sdkPose as Pose, a.direction, a.distance, shapeHitFlags(a), a.mask >>> 0, this.exclude(a.exclude), false, 1, this.hits);
    return n > 0 && this.convert(this.hits[0], out);
  }

  castShapeAll(a: CastShapeArg, out: CastResult[], max: number): number {
    this.ensureHits(max);
    const g = this.shapePose(a);
    const n = this.backend.sweep(g, this.sdkPose as Pose, a.direction, a.distance, shapeHitFlags(a), a.mask >>> 0, this.exclude(a.exclude), true, max, this.hits);
    return this.collect(n, out, a.sort === true);
  }

  private collect(n: number, out: CastResult[], sort: boolean): number {
    let k = 0;
    for (let i = 0; i < n; i++) {
      while (out.length <= k) out.push(emptyResult());
      if (this.convert(this.hits[i], out[k])) k++;
    }
    if (sort && k > 1) {
      if (this.rules.allSort === 'libcxx') libcxxSort(out, k, byDistance);
      else {
        const s = this.scratch;
        s.length = 0;
        for (let i = 0; i < k; i++) s.push(out[i]);
        s.sort((x, y) => x.distance - y.distance);
        for (let i = 0; i < k; i++) out[i] = s[i];
      }
    }
    return k;
  }

  /** overlap → 셰이프 핸들(touch, SDK 보고 순서) */
  overlap(geometry: CollisionGeometry, pose: Pose, mask: number, exclude: EntityRef | null, out: number[], max: number): number {
    const g = toSdk(geometry, IDENTITY, this.sdkPose, this.geom);
    poseMul(pose, this.sdkPose, this.sdkPose, this.t3, this.q4);
    const ids = this.ids;
    const n = this.backend.overlap(g, this.sdkPose as Pose, mask >>> 0, this.exclude(exclude), max, ids);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const h = this.byBackendShape.get(ids[i]);
      if (h !== undefined) out[k++] = h;
    }
    out.length = k;
    return k;
  }

  /** computePenetration(geometry@pose vs 등록 셰이프) — direction 은 질의 형상을 대상 바깥으로 미는 world 방향 */
  penetration(geometry: CollisionGeometry, pose: Pose, shape: number, out: Penetration): boolean {
    const s = this.shapes.get(shape);
    if (!s) return false;
    const g = toSdk(geometry, IDENTITY, this.sdkPose, this.geom);
    poseMul(pose, this.sdkPose, this.sdkPose, this.t3, this.q4);
    return this.backend.penetration(g, this.sdkPose as Pose, s.backend, out);
  }

  /**
   * Actor–Map 접촉(원본 §4.1 AB/Physics): overlap 후보 rules.mapCandidates 개(candidate 형상) → 각 셰이프와 computePenetration(실제 형상) →
   * depth > rules.mapMinDepth 만 vector = direction × depth.
   */
  mapContacts(geometry: CollisionGeometry, pose: Pose, mask: number, exclude: EntityRef | null, out: MapContact[], candidate?: CollisionGeometry): number {
    const cand: number[] = [];
    this.overlap(candidate ?? geometry, pose, mask, exclude, cand, this.rules.mapCandidates);
    let k = 0;
    const p = this.pen;
    for (const sh of cand) {
      if (!this.penetration(geometry, pose, sh, p)) continue;
      if (!(p.depth > this.rules.mapMinDepth)) continue;
      const s = this.shapes.get(sh);
      const b = s && this.bodies.get(s.body);
      if (!s || !b) continue;
      const c: MapContact = out[k] ?? { shape: 0, body: 0, entity: { index: 0, generation: 0 }, direction: [0, 0, 0], depth: 0, vector: [0, 0, 0] };
      c.shape = sh;
      c.body = b.handle;
      c.entity.index = b.entity.index;
      c.entity.generation = b.entity.generation;
      c.direction[0] = p.direction[0]; c.direction[1] = p.direction[1]; c.direction[2] = p.direction[2];
      c.depth = p.depth;
      c.vector[0] = f(p.direction[0] * p.depth); c.vector[1] = f(p.direction[1] * p.depth); c.vector[2] = f(p.direction[2] * p.depth);
      out[k++] = c;
    }
    out.length = k;
    return k;
  }
}

/**
 * Map 보정(원본 DefaultAdjustCharacterVsMap @0x710002a624: raw 벡터를 그대로 +0x40 에 복사 → DefaultFinalizeCharacterVsMap @0x710002aac0: 평균).
 * 반환 = 위치에 더할 벡터(접촉 없으면 0). 순차 push·합산이 아니다.
 */
export function resolveMapContacts(contacts: readonly MapContact[], out: Vec3 = [0, 0, 0]): Vec3 {
  out[0] = 0; out[1] = 0; out[2] = 0;
  const n = contacts.length;
  if (!n) return out;
  let x = 0, y = 0, z = 0;
  for (const c of contacts) {
    x = f(x + c.vector[0]);
    y = f(y + c.vector[1]);
    z = f(z + c.vector[2]);
  }
  const inv = f(1 / n);
  out[0] = f(x * inv); out[1] = f(y * inv); out[2] = f(z * inv);
  return out;
}

/** 엔진 캡슐 끝점 입력(ActorHitShape::SetSourceCapsule(a, b, r)) → CreateCapsule(r, h) + 로컬 자세(중심 (a+b)/2, UnitY → 축 회전), §3.3 */
export function capsuleFromSegment(a: Vec3, b: Vec3, radius: number): { geometry: CollisionGeometry; local: Pose } {
  const dx = f(b[0] - a[0]), dy = f(b[1] - a[1]), dz = f(b[2] - a[2]);
  const len = f(Math.sqrt(f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz))));
  const local: Pose = [f(a[0] + f(dx * 0.5)), f(a[1] + f(dy * 0.5)), f(a[2] + f(dz * 0.5)), 0, 0, 0, 1];
  if (len > 0) {
    const ax = f(dx / len), ay = f(dy / len), az = f(dz / len);
    const d = ay;
    if (d < -0.9999999) {
      local[3] = 1; local[6] = 0;
    } else {
      const cx = az, cz = f(-ax);
      const s = f(Math.sqrt(f(f(1 + d) * 2)));
      local[3] = f(cx / s); local[4] = 0; local[5] = f(cz / s); local[6] = f(s * 0.5);
    }
  }
  return { geometry: { kind: 'capsule', radius, halfHeight: f(len * 0.5) }, local };
}
