/**
 * 충돌 런타임 three 디버그 그리기 어댑터 — import = three + ../collision(코어)만. 판정에는 쓰지 않는다(보기 전용).
 * 몸체·형상(엔진 규약: capsule Y축, capsuleX = SDK X축)을 선으로 그리고, 광선·sweep·hit(위치·법선)을 표시한다.
 * 메시 정점은 코어가 갖지 않으므로 meshData(백엔드 메시 핸들) 로 받는다. 설계: docs/engine/11_moving_collision.md §9.
 */
import * as THREE from 'three';
import type { CastResult, CollisionGeometry, CollisionWorld, Pose, Vec3 } from '../collision';

export interface DebugMeshData {
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
}

const SHAPE_COLOR = 0x3fa7ff;
const DISABLED_COLOR = 0x777777;

function capsuleLines(r: number, hh: number, axisX: boolean): THREE.BufferGeometry {
  const pts: number[] = [];
  const seg = 24;
  const ring = (y: number): void => {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      pts.push(Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y, Math.sin(a1) * r);
    }
  };
  ring(hh);
  ring(-hh);
  for (const s of [-1, 1]) {
    for (const plane of [0, 1]) {
      for (let i = 0; i < seg / 2; i++) {
        const a0 = (i / (seg / 2)) * Math.PI;
        const a1 = ((i + 1) / (seg / 2)) * Math.PI;
        const p = (a: number): [number, number, number] => {
          const h = Math.cos(a) * r;
          const y = s * (hh + Math.sin(a) * r);
          return plane ? [h, y, 0] : [0, y, h];
        };
        pts.push(...p(a0), ...p(a1));
      }
    }
  }
  for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r]]) pts.push(x, -hh, z, x, hh, z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  if (axisX) g.rotateZ(-Math.PI / 2);
  return g;
}

function meshLines(d: DebugMeshData): THREE.BufferGeometry {
  const pos: number[] = [];
  const seen = new Set<number>();
  const v = d.vertices;
  const ix = d.indices;
  const n = (v.length / 3) | 0;
  const edge = (a: number, b: number): void => {
    const k = a < b ? a * n + b : b * n + a;
    if (seen.has(k)) return;
    seen.add(k);
    pos.push(v[3 * a], v[3 * a + 1], v[3 * a + 2], v[3 * b], v[3 * b + 1], v[3 * b + 2]);
  };
  for (let t = 0; t + 2 < ix.length; t += 3) {
    edge(ix[t], ix[t + 1]);
    edge(ix[t + 1], ix[t + 2]);
    edge(ix[t + 2], ix[t]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function geometryLines(g: CollisionGeometry, meshData: (mesh: number) => DebugMeshData | null): THREE.BufferGeometry | null {
  switch (g.kind) {
    case 'sphere': return new THREE.WireframeGeometry(new THREE.SphereGeometry(g.radius, 16, 10));
    case 'box': return new THREE.EdgesGeometry(new THREE.BoxGeometry(g.halfExtents[0] * 2, g.halfExtents[1] * 2, g.halfExtents[2] * 2));
    case 'capsule': return capsuleLines(g.radius, g.halfHeight, false);
    case 'capsuleX': return capsuleLines(g.radius, g.halfHeight, true);
    case 'plane': {
      const pg = new THREE.PlaneGeometry(40, 40, 8, 8);
      pg.rotateY(Math.PI / 2);
      return new THREE.WireframeGeometry(pg);
    }
    case 'mesh':
    case 'convex': {
      const d = meshData(g.mesh);
      if (!d) return null;
      const lg = meshLines(d);
      const s = g.scale ?? [1, 1, 1];
      lg.scale(s[0], s[1], s[2]);
      return lg;
    }
  }
}

function setPose(o: THREE.Object3D, p: ArrayLike<number>): void {
  o.position.set(p[0], p[1], p[2]);
  o.quaternion.set(p[3], p[4], p[5], p[6]);
}

export class CollisionDebugView {
  readonly root = new THREE.Group();
  private readonly shapes = new THREE.Group();
  private readonly marks = new THREE.Group();
  private readonly mat = new THREE.LineBasicMaterial({ color: SHAPE_COLOR, transparent: true, opacity: 0.55, depthTest: true });
  private readonly matOff = new THREE.LineBasicMaterial({ color: DISABLED_COLOR, transparent: true, opacity: 0.35 });

  constructor(readonly world: CollisionWorld, readonly meshData: (mesh: number) => DebugMeshData | null) {
    this.root.add(this.shapes, this.marks);
    this.root.name = 'collision-debug';
  }

  /** 등록된 형상 전체를 다시 그린다(몸체 자세 × 형상 로컬 자세, 엔진 규약) */
  rebuild(enabled?: (shape: number) => boolean): void {
    this.clear(this.shapes);
    for (const sh of this.world.allShapes()) {
      const desc = this.world.shapeDesc(sh);
      const info = this.world.bodyInfo(this.world.bodyOf(sh));
      if (!desc || !info) continue;
      const lg = geometryLines(desc.geometry, this.meshData);
      if (!lg) continue;
      const line = new THREE.LineSegments(lg, enabled && !enabled(sh) ? this.matOff : this.mat);
      const body = new THREE.Group();
      setPose(body, info.pose);
      setPose(line, desc.local ?? [0, 0, 0, 0, 0, 0, 1]);
      body.add(line);
      this.shapes.add(body);
    }
  }

  clearMarks(): void {
    this.clear(this.marks);
  }

  /** 광선: 시작~끝(또는 hit) 선 */
  ray(origin: Vec3, dir: Vec3, distance: number, hitDistance: number | null, color = 0xffd23f): void {
    const end = hitDistance ?? distance;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...origin), new THREE.Vector3(origin[0] + dir[0] * end, origin[1] + dir[1] * end, origin[2] + dir[2] * end)]);
    this.marks.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color })));
  }

  /** sweep 형상 위치(시작·멈춘 곳) */
  sweepShape(geometry: CollisionGeometry, pose: Pose, color = 0xff8a3f): void {
    const lg = geometryLines(geometry, this.meshData);
    if (!lg) return;
    const l = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color }));
    setPose(l, pose);
    this.marks.add(l);
  }

  /** hit 점 + 법선(길이 len) */
  hit(r: CastResult, len = 0.6, color = 0xff3f6c): void {
    const p = new THREE.Vector3(...r.position);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color, depthTest: false }));
    s.position.copy(p);
    s.renderOrder = 10;
    const n = new THREE.BufferGeometry().setFromPoints([p, p.clone().addScaledVector(new THREE.Vector3(...r.normal), len)]);
    const nl = new THREE.Line(n, new THREE.LineBasicMaterial({ color: 0x7cff6b, depthTest: false }));
    nl.renderOrder = 10;
    this.marks.add(s, nl);
  }

  private clear(g: THREE.Group): void {
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | undefined;
        if (mat && mat !== this.mat && mat !== this.matOff) mat.dispose();
      });
    }
  }

  dispose(): void {
    this.clear(this.shapes);
    this.clear(this.marks);
    this.mat.dispose();
    this.matOff.dispose();
  }
}
