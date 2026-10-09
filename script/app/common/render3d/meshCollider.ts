/**
 * 삼각 메시 충돌(Collider 구현) — 원본 PhysX 삼각 메시(apx → collision.json)를 그대로 쓴다(docs/shell/stage3d.md §5, plaza_3d.md §3.2).
 * - 지면: (x, z) 를 지나는 수직선과 **위를 향한**(법선 y > 0) 삼각형의 교점 중 fromY + STEP 아래에서 가장 높은 것. 아래를 향한 면(계단 밑판 등)은 지면이 아니다.
 *   가파른 위향 면(계단 챌판 77.6° 등)도 STEP 안이면 디딜 수 있다(PhysX stepOffset 처럼 단을 오름) [근사].
 * - 벽: 원기둥(반지름 r, 발 y + STEP ~ y + height)이 걸을 수 없는 면(가파른 면)과 겹치면 수평으로 밀어낸다(벽 미끄러짐).
 *   PhysX 컨트롤러의 자동 오르기(stepOffset 만큼 올려서 앞으로 쓸기)처럼, 몸 아랫면을 발 + STEP 에서 시작하는 반구로 보고 중심에서 수평 d 떨어진
 *   접점이 그 반구(yLo + r − √(r² − d²))보다 낮으면 벽으로 치지 않는다 — 반지름 0.9 몸이 계단 다음 단 챌판에 걸리지 않게 [근사: PhysX 캡슐·autostep].
 * STEP·SLOPE_LIMIT 는 PhysX 캐릭터 컨트롤러의 stepOffset·slopeLimit 자리 [근사: 원본 값 미확정].
 * 질의는 XZ 격자(CELL m) 로 후보 삼각형을 줄인다.
 */
import * as THREE from 'three';
import type { Collider, GroundHit } from './types';

export interface MeshColliderData {
  /** x,y,z 반복(월드) */
  vertices: number[];
  /** 삼각형 꼭짓점 번호 3개씩 */
  indices: number[];
}

export const COLLIDER_STEP = 0.5;
export const COLLIDER_SLOPE_LIMIT_DEG = 45;
const CELL = 2;
const UP_MIN = 0.05;
const ITER = 3;

export class MeshCollider implements Collider {
  readonly v: Float32Array;
  readonly tri: Uint32Array;
  readonly nrm: Float32Array;
  readonly walk: Uint8Array;
  readonly up: Uint8Array;
  private readonly grid = new Map<number, number[]>();
  readonly minX: number;
  readonly minZ: number;
  readonly obj = new THREE.Object3D();

  constructor(d: MeshColliderData) {
    this.v = Float32Array.from(d.vertices);
    this.tri = Uint32Array.from(d.indices);
    const n = this.tri.length / 3;
    this.nrm = new Float32Array(n * 3);
    this.walk = new Uint8Array(n);
    this.up = new Uint8Array(n);
    const cosLimit = Math.cos((COLLIDER_SLOPE_LIMIT_DEG * Math.PI) / 180);
    let minX = Infinity;
    let minZ = Infinity;
    for (let i = 0; i < this.v.length; i += 3) {
      minX = Math.min(minX, this.v[i]);
      minZ = Math.min(minZ, this.v[i + 2]);
    }
    this.minX = minX;
    this.minZ = minZ;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let t = 0; t < n; t++) {
      this.corner(t, 0, a);
      this.corner(t, 1, b);
      this.corner(t, 2, c);
      const nn = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      this.nrm.set([nn.x, nn.y, nn.z], t * 3);
      this.walk[t] = Math.abs(nn.y) >= cosLimit ? 1 : 0;
      this.up[t] = nn.y > UP_MIN ? 1 : 0;
      const x0 = Math.floor((Math.min(a.x, b.x, c.x) - minX) / CELL);
      const x1 = Math.floor((Math.max(a.x, b.x, c.x) - minX) / CELL);
      const z0 = Math.floor((Math.min(a.z, b.z, c.z) - minZ) / CELL);
      const z1 = Math.floor((Math.max(a.z, b.z, c.z) - minZ) / CELL);
      for (let gx = x0; gx <= x1; gx++)
        for (let gz = z0; gz <= z1; gz++) {
          const k = gx * 65536 + gz;
          let l = this.grid.get(k);
          if (!l) this.grid.set(k, (l = []));
          l.push(t);
        }
    }
  }

  static merge(list: MeshCollider[]): MeshCollider {
    const vertices: number[] = [];
    const indices: number[] = [];
    for (const m of list) {
      const base = vertices.length / 3;
      for (const x of m.v) vertices.push(x);
      for (const i of m.tri) indices.push(i + base);
    }
    return new MeshCollider({ vertices, indices });
  }

  get triangles(): number {
    return this.tri.length / 3;
  }

  private corner(t: number, k: number, out: THREE.Vector3): THREE.Vector3 {
    const i = this.tri[t * 3 + k] * 3;
    return out.set(this.v[i], this.v[i + 1], this.v[i + 2]);
  }

  private cells(x0: number, z0: number, x1: number, z1: number): Set<number> {
    const out = new Set<number>();
    const gx0 = Math.floor((Math.min(x0, x1) - this.minX) / CELL);
    const gx1 = Math.floor((Math.max(x0, x1) - this.minX) / CELL);
    const gz0 = Math.floor((Math.min(z0, z1) - this.minZ) / CELL);
    const gz1 = Math.floor((Math.max(z0, z1) - this.minZ) / CELL);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gz = gz0; gz <= gz1; gz++) for (const t of this.grid.get(gx * 65536 + gz) ?? []) out.add(t);
    return out;
  }

  /** 수직선 (x, z) 와 삼각형 t 의 교점 y(없으면 NaN) */
  private yAt(t: number, x: number, z: number): number {
    const i0 = this.tri[t * 3] * 3;
    const i1 = this.tri[t * 3 + 1] * 3;
    const i2 = this.tri[t * 3 + 2] * 3;
    const ax = this.v[i0], az = this.v[i0 + 2];
    const bx = this.v[i1], bz = this.v[i1 + 2];
    const cx = this.v[i2], cz = this.v[i2 + 2];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) return NaN;
    const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    const l2 = 1 - l0 - l1;
    const e = -1e-6;
    if (l0 < e || l1 < e || l2 < e) return NaN;
    return l0 * this.v[i0 + 1] + l1 * this.v[i1 + 1] + l2 * this.v[i2 + 1];
  }

  groundHeight(x: number, z: number, fromY?: number): GroundHit | null {
    const top = fromY === undefined ? Infinity : fromY + COLLIDER_STEP;
    let best = -Infinity;
    let bt = -1;
    for (const t of this.cells(x, z, x, z)) {
      if (!this.up[t]) continue;
      const y = this.yAt(t, x, z);
      if (Number.isNaN(y) || y > top) continue;
      if (y > best) {
        best = y;
        bt = t;
      }
    }
    if (bt < 0) return null;
    const n = new THREE.Vector3(this.nrm[bt * 3], this.nrm[bt * 3 + 1], this.nrm[bt * 3 + 2]);
    if (n.y < 0) n.negate();
    return { y: best, normal: n, object: this.obj };
  }

  collide(pos: THREE.Vector3, move: THREE.Vector3, radius: number, height: number): THREE.Vector3 {
    const p = new THREE.Vector3(pos.x + move.x, pos.y, pos.z + move.z);
    const yLo = pos.y + COLLIDER_STEP;
    const yHi = pos.y + height;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const q = new THREE.Vector3();
    for (let it = 0; it < ITER; it++) {
      let pushed = false;
      for (const t of this.cells(p.x - radius, p.z - radius, p.x + radius, p.z + radius)) {
        if (this.walk[t]) continue;
        this.corner(t, 0, a);
        this.corner(t, 1, b);
        this.corner(t, 2, c);
        if (Math.max(a.y, b.y, c.y) < yLo || Math.min(a.y, b.y, c.y) > yHi) continue;
        const cy = THREE.MathUtils.clamp(p.y + (COLLIDER_STEP + height) / 2, yLo, yHi);
        closestOnTri(new THREE.Vector3(p.x, cy, p.z), a, b, c, q);
        if (q.y < yLo || q.y > yHi) {
          const yy = THREE.MathUtils.clamp(q.y, yLo, yHi);
          closestOnTri(new THREE.Vector3(p.x, yy, p.z), a, b, c, q);
          if (q.y < yLo - 1e-3 || q.y > yHi + 1e-3) continue;
        }
        const dx = p.x - q.x;
        const dz = p.z - q.z;
        const d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        if (q.y - yLo < radius - Math.sqrt(Math.max(0, radius * radius - d * d))) continue;
        let nx: number;
        let nz: number;
        if (d > 1e-6) {
          nx = dx / d;
          nz = dz / d;
        } else {
          const tn = Math.hypot(this.nrm[t * 3], this.nrm[t * 3 + 2]) || 1;
          nx = this.nrm[t * 3] / tn;
          nz = this.nrm[t * 3 + 2] / tn;
          if (nx * move.x + nz * move.z > 0) {
            nx = -nx;
            nz = -nz;
          }
        }
        p.x += nx * (radius - d);
        p.z += nz * (radius - d);
        pushed = true;
      }
      if (!pushed) break;
    }
    return new THREE.Vector3(p.x - pos.x, 0, p.z - pos.z);
  }
}

function closestOnTri(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const t = new THREE.Triangle(a, b, c);
  return t.closestPointToPoint(p, out);
}
