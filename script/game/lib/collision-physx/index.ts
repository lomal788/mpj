/**
 * 충돌 포트 → PhysX 4.1.2 wasm 어댑터. import = ../collision(코어) + ../physx(바인딩)만(사운드 어댑터와 같은 방식).
 * 씬 하나(PxScene)를 질의 백엔드로 쓴다: Stage = addActor, Unstage = removeActor, 셰이프 enabled = PxShapeFlags 의 simulation·scene query 비트.
 * .apx 를 PhysX 메시로 싣고(원본 BVH33 RTree 그대로, physx/apx.ts) 충돌 코어에 넘길 형상 목록을 만든다.
 * 설계: docs/engine/11_moving_collision.md §9(웹 런타임 계약).
 */
import type { BackendHit, CollisionBackend, CollisionShapeDesc, MotionType, Penetration, Pose, SdkGeometry, Vec3 } from '../collision';
import { type ApxCollection, IO, type Physx, type PxGeometryDesc, type PxHit, PxGeom, emptyHit, readApx } from '../physx';

function pxGeom(g: SdkGeometry): PxGeometryDesc {
  switch (g.type) {
    case 0: return { type: PxGeom.Sphere, radius: g.params[0] };
    case 1: return { type: PxGeom.Plane };
    case 2: return { type: PxGeom.Capsule, radius: g.params[0], halfHeight: g.params[1] };
    case 3: return { type: PxGeom.Box, hx: g.params[0], hy: g.params[1], hz: g.params[2] };
    default: return { type: g.type === 4 ? PxGeom.Convex : PxGeom.TriangleMesh, mesh: g.mesh, scale: g.params.slice(0, 3), scaleRot: g.params.slice(3, 7) };
  }
}

/** 디버그 그리기용 메시 자료(정점 world 아님 — 메시 로컬) */
export interface DebugMesh {
  vertices: Float32Array;
  indices: Uint32Array;
}

export class PhysxCollisionBackend implements CollisionBackend {
  readonly scene: number;
  private readonly staged = new Set<number>();
  private readonly hit: PxHit = emptyHit();
  private readonly penOut: number[] = [0, 0, 0, 0];
  readonly debugMeshes = new Map<number, DebugMesh>();

  constructor(readonly px: Physx, gravity: Vec3 = [0, -9.8, 0]) {
    this.scene = px.x.px_scene_create(gravity[0], gravity[1], gravity[2]);
    if (!this.scene) throw new Error(`PxScene 생성 실패: ${px.lastError()}`);
  }

  createBody(motion: MotionType, pose: Pose): number {
    return this.px.createActor(motion, pose);
  }
  releaseBody(body: number): void {
    this.staged.delete(body);
    this.px.x.px_actor_release(body);
  }
  stage(body: number): void {
    if (this.staged.has(body)) return;
    this.px.x.px_scene_add(this.scene, body);
    this.staged.add(body);
  }
  unstage(body: number): void {
    if (!this.staged.delete(body)) return;
    this.px.x.px_scene_remove(this.scene, body);
  }
  setBodyPose(body: number, pose: Pose, mode: 'set' | 'target'): void {
    this.px.setActorPose(body, pose, mode === 'target');
  }
  createShape(body: number, geom: SdkGeometry, local: Pose, filter: [number, number, number, number], material: [number, number, number], shapeFlags: number): number {
    const h = this.px.createShape(body, pxGeom(geom), local, filter, material, shapeFlags);
    if (!h) throw new Error(`PxShape 생성 실패: ${this.px.lastError()}`);
    return h;
  }
  setShapeFlags(shape: number, shapeFlags: number): void {
    this.px.x.px_shape_set_flags(shape, shapeFlags);
  }
  setShapeFilter(shape: number, filter: [number, number, number, number]): void {
    this.px.setShapeFilter(shape, filter);
  }

  private read(n: number, out: BackendHit[]): number {
    const h = this.hit;
    for (let i = 0; i < n; i++) {
      this.px.readHit(i, h);
      const o = out[i];
      o.position[0] = h.position[0]; o.position[1] = h.position[1]; o.position[2] = h.position[2];
      o.normal[0] = h.normal[0]; o.normal[1] = h.normal[1]; o.normal[2] = h.normal[2];
      o.distance = h.distance;
      o.flags = h.flags;
      o.faceIndex = h.faceIndex;
      o.shape = h.shape;
    }
    return n;
  }

  raycast(origin: Vec3, dir: Vec3, distance: number, hitFlags: number, mask: number, exclude: [number, number], all: boolean, maxOut: number, out: BackendHit[]): number {
    return this.read(this.px.raycast(this.scene, origin, dir, distance, hitFlags, mask, exclude, all, Math.min(maxOut, this.px.hitCapacity)), out);
  }
  sweep(geom: SdkGeometry, pose: Pose, dir: Vec3, distance: number, hitFlags: number, mask: number, exclude: [number, number], all: boolean, maxOut: number, out: BackendHit[]): number {
    this.px.setGeometryRaw(IO.GEOM0, geom.type, geom.params, geom.mesh);
    return this.read(this.px.sweepGeom0(this.scene, pose, dir, distance, hitFlags, mask, exclude, all, Math.min(maxOut, this.px.hitCapacity)), out);
  }
  overlap(geom: SdkGeometry, pose: Pose, mask: number, exclude: [number, number], maxOut: number, out: number[]): number {
    this.px.setGeometryRaw(IO.GEOM0, geom.type, geom.params, geom.mesh);
    const n = this.px.overlapGeom0(this.scene, pose, mask, exclude, Math.min(maxOut, this.px.hitCapacity));
    const u = this.px.u32;
    for (let i = 0; i < n; i++) out[i] = u[this.px.hitsBase + i * 16 + 15];
    out.length = n;
    return n;
  }
  penetration(geom: SdkGeometry, pose: Pose, shape: number, out: Penetration): boolean {
    const r = this.px.shapePenetration(shape, pxGeom(geom), pose, this.penOut);
    if (!r) return false;
    out.direction[0] = r[0]; out.direction[1] = r[1]; out.direction[2] = r[2];
    out.depth = r[3];
    return true;
  }

  dispose(): void {
    this.px.x.px_scene_release(this.scene);
    this.staged.clear();
  }

  /**
   * .apx 한 개 → PhysX 메시 핸들 + 충돌 코어 형상 목록(셰이프 로컬 자세·원본 PxShapeFlags·재질 그대로). layer 는 쓰는 쪽(nbmap attr 등)이 정한다.
   * 메시는 같은 바이트(키)면 다시 만들지 않는다.
   */
  loadApx(bytes: Uint8Array, layer: number, tag?: string): { collection: ApxCollection; shapes: CollisionShapeDesc[]; meshes: number[] } {
    const col = readApx(bytes);
    const handles = new Map<number, number>();
    const meshes: number[] = [];
    for (const [obj, m] of col.meshes) {
      if (!m.stream) continue;
      const h = m.kind === 'trimesh' ? this.px.createTriangleMesh(m.stream) : this.px.createConvexMesh(m.stream);
      if (!h) throw new Error(`PhysX 메시 생성 실패(${m.kind} ${obj}): ${this.px.lastError()}`);
      handles.set(obj, h);
      meshes.push(h);
      if (m.kind === 'trimesh') this.debugMeshes.set(h, debugTriMesh(m.stream));
    }
    const shapes: CollisionShapeDesc[] = [];
    for (const s of col.shapes) {
      const local = s.pose as Pose;
      const base = { local, layer, tag, shapeFlags: s.shapeFlags, material: s.material ?? undefined };
      if (s.geometry === 5 || s.geometry === 4) {
        const h = s.mesh !== null ? handles.get(s.mesh) : undefined;
        if (h === undefined) continue;
        const scale: Vec3 = [s.params[0], s.params[1], s.params[2]];
        const scaleRot: [number, number, number, number] = [s.params[3], s.params[4], s.params[5], s.params[6]];
        shapes.push({ ...base, geometry: { kind: s.geometry === 5 ? 'mesh' : 'convex', mesh: h, scale, scaleRot } });
      } else if (s.geometry === 0) shapes.push({ ...base, geometry: { kind: 'sphere', radius: s.params[0] } });
      else if (s.geometry === 3) shapes.push({ ...base, geometry: { kind: 'box', halfExtents: [s.params[0], s.params[1], s.params[2]] } });
      else if (s.geometry === 1) shapes.push({ ...base, geometry: { kind: 'plane' } });
      else if (s.geometry === 2) shapes.push({ ...base, geometry: { kind: 'capsuleX', radius: s.params[0], halfHeight: s.params[1] } });
    }
    return { collection: col, shapes, meshes };
  }
}

/** NXS MESH 스트림 → 정점·인덱스(디버그 그리기용) */
function debugTriMesh(b: Uint8Array): DebugMesh {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const serial = dv.getUint32(16, true);
  const nv = dv.getUint32(20, true);
  const nt = dv.getUint32(24, true);
  let o = 28;
  const vertices = new Float32Array(3 * nv);
  for (let i = 0; i < 3 * nv; i++, o += 4) vertices[i] = dv.getFloat32(o, true);
  const indices = new Uint32Array(3 * nt);
  const i16 = (serial & 8) !== 0;
  for (let i = 0; i < 3 * nt; i++) {
    indices[i] = i16 ? dv.getUint16(o, true) : dv.getUint32(o, true);
    o += i16 ? 2 : 4;
  }
  return { vertices, indices };
}
