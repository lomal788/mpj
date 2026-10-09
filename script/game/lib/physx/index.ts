/**
 * PhysX 4.1.2 WebAssembly 바인딩 — import 0(three·DOM·mpj 없음). physx.wasm 의 C ABI export 만 감싼다(바인딩 전용 숨은 함수 없음):
 * 다른 wasm 모듈도 같은 export 를 import 로 받아 같은 일을 한다. ABI·버퍼 배치·핸들·메모리 규칙: docs/engine/11_moving_collision.md §9.4.
 *
 * - 생성: createPhysx(wasm 바이트 또는 WebAssembly.Module) — 받아 오기(fetch·fs)는 쓰는 쪽이 한다. import 객체는 physxImports() 하나.
 * - 메모리: memory.grow 뒤에도 오프셋은 그대로이고 typed array 뷰만 다시 만든다(views() 한 곳, buffer 가 바뀌었으면 새로 만듦).
 * - 핸들: 0 = 실패. 세대 포함 정수라 해제된 핸들은 다시 써도 거부된다(px_error_* 에 이유).
 * 소스·빌드: ./native(PhysX 4.1 a2c0428 중 컴파일한 파일만 + shim), ./build/build.py(em++). 라이선스: ./LICENSE.md(BSD-3).
 */
export { readApx, APX_TYPES, type ApxCollection, type ApxShape, type ApxActor, type ApxTriangleMesh, type ApxConvexMesh } from './apx';

export const PX_ABI_VERSION = 1;

/** PxHitFlag 비트(include/PxQueryReport.h) */
export const PxHitFlag = {
  ePOSITION: 0x1, eNORMAL: 0x2, eUV: 0x8, eASSUME_NO_INITIAL_OVERLAP: 0x10, eMESH_MULTIPLE: 0x20, eMESH_ANY: 0x40, eMESH_BOTH_SIDES: 0x80,
  ePRECISE_SWEEP: 0x100, eMTD: 0x200, eFACE_INDEX: 0x400, eDEFAULT: 0x403,
} as const;

/** PxShapeFlag 비트 */
export const PxShapeFlag = { eSIMULATION_SHAPE: 1, eSCENE_QUERY_SHAPE: 2, eTRIGGER_SHAPE: 4, eVISUALIZATION: 8 } as const;

/** io 슬롯 기하 종류(PxGeometryType) */
export const enum PxGeom { Sphere = 0, Plane = 1, Capsule = 2, Box = 3, Convex = 4, TriangleMesh = 5 }

/** 기하 블록 9슬롯 — capsule 은 SDK X축 */
export type PxGeometryDesc =
  | { type: PxGeom.Sphere; radius: number }
  | { type: PxGeom.Plane }
  | { type: PxGeom.Capsule; radius: number; halfHeight: number }
  | { type: PxGeom.Box; hx: number; hy: number; hz: number }
  | { type: PxGeom.Convex | PxGeom.TriangleMesh; mesh: number; scale?: readonly number[]; scaleRot?: readonly number[] };

/** 자세 [px,py,pz,qx,qy,qz,qw] */
export type PxPose = ArrayLike<number>;

/** physx.wasm export(C ABI). 인자·반환은 i32/f32 숫자만 */
export interface PhysxExports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  px_abi_version(): number;
  px_physx_version(): number;
  px_io_offset(): number;
  px_io_size(): number;
  px_hits_offset(): number;
  px_hits_capacity(): number;
  px_hit_stride(): number;
  px_error_offset(): number;
  px_error_size(): number;
  px_error_count(): number;
  px_alloc(size: number): number;
  px_free(offset: number): void;
  px_init(): number;
  px_tri_mesh_create(offset: number, len: number): number;
  px_convex_mesh_create(offset: number, len: number): number;
  px_mesh_release(mesh: number): number;
  px_tri_mesh_info(mesh: number): number;
  px_geom_raycast(maxHits: number): number;
  px_geom_sweep(): number;
  px_geom_overlap(): number;
  px_geom_penetration(): number;
  px_scene_create(gx: number, gy: number, gz: number): number;
  px_scene_release(scene: number): number;
  px_actor_create(motion: number): number;
  px_actor_release(actor: number): number;
  px_scene_add(scene: number, actor: number): number;
  px_scene_remove(scene: number, actor: number): number;
  px_actor_set_pose(actor: number, mode: number): number;
  px_actor_get_pose(actor: number): number;
  px_shape_create(actor: number): number;
  px_shape_set_flags(shape: number, flags: number): number;
  px_shape_set_filter(shape: number): number;
  px_shape_set_local_pose(shape: number): number;
  px_shape_get_world_pose(shape: number): number;
  px_scene_raycast(scene: number, all: number, maxOut: number): number;
  px_scene_sweep(scene: number, all: number, maxOut: number): number;
  px_scene_overlap(scene: number, maxOut: number): number;
  px_shape_penetration(shape: number): number;
  px_scene_simulate(scene: number, dt: number): number;
  px_actor_set_velocity(actor: number): number;
  px_actor_get_velocity(actor: number): number;
  px_actor_set_mass(actor: number, mass: number): number;
  px_cct_manager_create(scene: number): number;
  px_cct_manager_release(mgr: number): number;
  px_cct_capsule_create(mgr: number): number;
  px_cct_release(cct: number): number;
  px_cct_move(cct: number): number;
  px_cct_get_position(cct: number): number;
  px_ext_d6_create(actor0: number, actor1: number): number;
  px_ext_joint_release(joint: number): number;
}

/** 질의 결과 한 건(hit 버퍼 16슬롯) */
export interface PxHit {
  position: [number, number, number];
  normal: [number, number, number];
  distance: number;
  u: number;
  v: number;
  flags: number;
  faceIndex: number;
  /** 셰이프 simulation filter data word0..3 */
  filter: [number, number, number, number];
  shape: number;
}

export const IO = {
  GEOM0: 0, POSE0: 9, DIR: 16, DIST: 19, FLAGS: 20, MASK: 21, EXCLUDE: 22, INFLATION: 24, FILTER: 16, MATERIAL: 20, SHAPE_FLAGS: 23,
  OUT_DIR: 32, OUT_DEPTH: 35, GEOM1: 40, POSE1: 49,
  RAY_ORIGIN: 0, RAY_DIR: 3, RAY_DIST: 6, RAY_FLAGS: 7, RAY_MASK: 8, RAY_EXCLUDE: 9,
} as const;

/** physx.wasm 의 import 객체. onGrow 는 memory.grow 알림(인자 = 메모리 번호) */
export function physxImports(onGrow?: () => void): WebAssembly.Imports {
  return { env: { emscripten_notify_memory_growth: () => onGrow?.() } };
}

export class Physx {
  readonly x: PhysxExports;
  private buf: ArrayBuffer | null = null;
  private _f32!: Float32Array;
  private _u32!: Uint32Array;
  private _u8!: Uint8Array;
  readonly ioBase: number;
  readonly hitsBase: number;
  readonly hitCapacity: number;

  constructor(instance: WebAssembly.Instance) {
    this.x = instance.exports as unknown as PhysxExports;
    this.x._initialize();
    if (this.x.px_abi_version() !== PX_ABI_VERSION) throw new Error(`physx ABI ${this.x.px_abi_version()} != ${PX_ABI_VERSION}`);
    if (!this.x.px_init()) throw new Error(`physx 초기화 실패: ${this.lastError()}`);
    this.ioBase = this.x.px_io_offset() >>> 2;
    this.hitsBase = this.x.px_hits_offset() >>> 2;
    this.hitCapacity = this.x.px_hits_capacity();
  }

  /** memory.grow 뒤 뷰 다시 만들기 — 모든 뷰 접근은 여기를 거친다 */
  views(): void {
    const b = this.x.memory.buffer;
    if (b === this.buf) return;
    this.buf = b as ArrayBuffer;
    this._f32 = new Float32Array(b);
    this._u32 = new Uint32Array(b);
    this._u8 = new Uint8Array(b);
  }
  get f32(): Float32Array { this.views(); return this._f32; }
  get u32(): Uint32Array { this.views(); return this._u32; }
  get u8(): Uint8Array { this.views(); return this._u8; }

  lastError(): string {
    const at = this.x.px_error_offset();
    const b = this.u8;
    let n = 0;
    while (n < this.x.px_error_size() && b[at + n] !== 0) n++;
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(b[at + i]);
    return s;
  }
  get errorCount(): number { return this.x.px_error_count(); }

  setF(slot: number, ...v: number[]): void {
    const f = this.f32;
    for (let i = 0; i < v.length; i++) f[this.ioBase + slot + i] = v[i];
  }
  setU(slot: number, ...v: number[]): void {
    const u = this.u32;
    for (let i = 0; i < v.length; i++) u[this.ioBase + slot + i] = v[i] >>> 0;
  }
  getF(slot: number): number { return this.f32[this.ioBase + slot]; }
  getU(slot: number): number { return this.u32[this.ioBase + slot]; }
  setPose(slot: number, p: PxPose): void {
    const f = this.f32;
    for (let i = 0; i < 7; i++) f[this.ioBase + slot + i] = p[i];
  }
  getPose(slot: number, out: number[] = []): number[] {
    const f = this.f32;
    for (let i = 0; i < 7; i++) out[i] = f[this.ioBase + slot + i];
    return out;
  }
  setGeometry(slot: number, g: PxGeometryDesc): void {
    const f = this.f32;
    const u = this.u32;
    const b = this.ioBase + slot;
    u[b] = g.type;
    for (let i = 1; i < 9; i++) u[b + i] = 0;
    switch (g.type) {
      case PxGeom.Sphere: f[b + 1] = g.radius; break;
      case PxGeom.Plane: break;
      case PxGeom.Capsule: f[b + 1] = g.radius; f[b + 2] = g.halfHeight; break;
      case PxGeom.Box: f[b + 1] = g.hx; f[b + 2] = g.hy; f[b + 3] = g.hz; break;
      default: {
        const s = g.scale ?? [1, 1, 1];
        const r = g.scaleRot ?? [0, 0, 0, 1];
        f[b + 1] = s[0]; f[b + 2] = s[1]; f[b + 3] = s[2];
        f[b + 4] = r[0]; f[b + 5] = r[1]; f[b + 6] = r[2]; f[b + 7] = r[3];
        u[b + 8] = g.mesh;
      }
    }
  }

  /** 기하 블록을 숫자로 바로 쓴다(할당 없음): type = PxGeometryType, params = sphere [r] / capsule [r, hh] / box [hx,hy,hz] / mesh [sx,sy,sz, rx,ry,rz,rw] */
  setGeometryRaw(slot: number, type: number, params: ArrayLike<number>, mesh: number): void {
    const f = this.f32;
    const u = this.u32;
    const b = this.ioBase + slot;
    u[b] = type;
    for (let i = 1; i < 9; i++) u[b + i] = 0;
    for (let i = 0; i < params.length && i < 7; i++) f[b + 1 + i] = params[i];
    u[b + 8] = mesh;
  }

  /** 바이트를 physx 메모리에 복사해 함수에 오프셋으로 넘기고 해제 */
  withBytes<T>(bytes: Uint8Array, fn: (offset: number, len: number) => T): T {
    const at = this.x.px_alloc(bytes.length);
    if (!at) throw new Error('px_alloc 실패');
    try {
      this.u8.set(bytes, at);
      return fn(at, bytes.length);
    } finally {
      this.x.px_free(at);
    }
  }
  createTriangleMesh(stream: Uint8Array): number { return this.withBytes(stream, (o, n) => this.x.px_tri_mesh_create(o, n)); }
  createConvexMesh(stream: Uint8Array): number { return this.withBytes(stream, (o, n) => this.x.px_convex_mesh_create(o, n)); }

  /** hit 버퍼 i 번째를 out 에 읽는다(할당 없이 재사용) */
  readHit(i: number, out: PxHit = emptyHit()): PxHit {
    const f = this.f32;
    const u = this.u32;
    const b = this.hitsBase + i * 16;
    out.position[0] = f[b]; out.position[1] = f[b + 1]; out.position[2] = f[b + 2];
    out.normal[0] = f[b + 3]; out.normal[1] = f[b + 4]; out.normal[2] = f[b + 5];
    out.distance = f[b + 6]; out.u = f[b + 7]; out.v = f[b + 8];
    out.flags = u[b + 9]; out.faceIndex = u[b + 10];
    out.filter[0] = u[b + 11]; out.filter[1] = u[b + 12]; out.filter[2] = u[b + 13]; out.filter[3] = u[b + 14];
    out.shape = u[b + 15];
    return out;
  }

  /** 씬 광선(nn::bezel CastRay 규약: filter flags 7, prefilter = 레이어 마스크·제외 엔티티) */
  raycast(scene: number, origin: ArrayLike<number>, dir: ArrayLike<number>, distance: number, hitFlags: number, mask: number,
          exclude: ArrayLike<number>, all: boolean, maxOut: number): number {
    const f = this.f32;
    const u = this.u32;
    const b = this.ioBase;
    f[b] = origin[0]; f[b + 1] = origin[1]; f[b + 2] = origin[2];
    f[b + 3] = dir[0]; f[b + 4] = dir[1]; f[b + 5] = dir[2]; f[b + 6] = distance;
    u[b + 7] = hitFlags >>> 0; u[b + 8] = mask >>> 0; u[b + 9] = exclude[0] >>> 0; u[b + 10] = exclude[1] >>> 0;
    return this.x.px_scene_raycast(scene, all ? 1 : 0, maxOut);
  }

  /** 씬 선형 sweep(nn::bezel CastShape 규약). 기하는 setGeometry·setGeometryRaw 로 GEOM0 에 먼저 쓴다 */
  sweepGeom0(scene: number, pose: PxPose, dir: ArrayLike<number>, distance: number, hitFlags: number, mask: number,
             exclude: ArrayLike<number>, all: boolean, maxOut: number, inflation = 0): number {
    const f = this.f32;
    const u = this.u32;
    const b = this.ioBase;
    for (let i = 0; i < 7; i++) f[b + 9 + i] = pose[i];
    f[b + 16] = dir[0]; f[b + 17] = dir[1]; f[b + 18] = dir[2]; f[b + 19] = distance;
    u[b + 20] = hitFlags >>> 0; u[b + 21] = mask >>> 0; u[b + 22] = exclude[0] >>> 0; u[b + 23] = exclude[1] >>> 0;
    f[b + 24] = inflation;
    return this.x.px_scene_sweep(scene, all ? 1 : 0, maxOut);
  }

  sweep(scene: number, geom: PxGeometryDesc, pose: PxPose, dir: ArrayLike<number>, distance: number, hitFlags: number, mask: number,
        exclude: ArrayLike<number>, all: boolean, maxOut: number, inflation = 0): number {
    this.setGeometry(IO.GEOM0, geom);
    return this.sweepGeom0(scene, pose, dir, distance, hitFlags, mask, exclude, all, maxOut, inflation);
  }

  /** overlap(기하는 GEOM0 에 먼저 쓴다) → touch(셰이프 핸들 = hit 슬롯 15) */
  overlapGeom0(scene: number, pose: PxPose, mask: number, exclude: ArrayLike<number>, maxOut: number): number {
    const f = this.f32;
    const u = this.u32;
    const b = this.ioBase;
    for (let i = 0; i < 7; i++) f[b + 9 + i] = pose[i];
    u[b + 21] = mask >>> 0; u[b + 22] = exclude[0] >>> 0; u[b + 23] = exclude[1] >>> 0;
    return this.x.px_scene_overlap(scene, maxOut);
  }

  overlap(scene: number, geom: PxGeometryDesc, pose: PxPose, mask: number, exclude: ArrayLike<number>, maxOut: number): number {
    this.setGeometry(IO.GEOM0, geom);
    return this.overlapGeom0(scene, pose, mask, exclude, maxOut);
  }

  /** computePenetration(geom@pose, 씬 셰이프) → out [dx,dy,dz,depth] 또는 null */
  shapePenetration(shape: number, geom: PxGeometryDesc, pose: PxPose, out: number[] = []): number[] | null {
    this.setGeometry(IO.GEOM0, geom);
    this.setPose(IO.POSE0, pose);
    if (!this.x.px_shape_penetration(shape)) return null;
    for (let i = 0; i < 4; i++) out[i] = this.getF(IO.OUT_DIR + i);
    return out;
  }

  createActor(motion: 0 | 1 | 2, pose: PxPose): number {
    this.setPose(0, pose);
    return this.x.px_actor_create(motion);
  }
  setActorPose(actor: number, pose: PxPose, kinematicTarget = false): number {
    this.setPose(0, pose);
    return this.x.px_actor_set_pose(actor, kinematicTarget ? 1 : 0);
  }
  createShape(actor: number, geom: PxGeometryDesc, local: PxPose, filter: readonly number[], material: readonly number[], shapeFlags: number): number {
    this.setGeometry(IO.GEOM0, geom);
    this.setPose(IO.POSE0, local);
    this.setU(IO.FILTER, filter[0], filter[1], filter[2], filter[3]);
    this.setF(IO.MATERIAL, material[0], material[1], material[2]);
    this.setU(IO.SHAPE_FLAGS, shapeFlags);
    return this.x.px_shape_create(actor);
  }
  setShapeFilter(shape: number, filter: readonly number[]): number {
    this.setU(IO.FILTER, filter[0], filter[1], filter[2], filter[3]);
    return this.x.px_shape_set_filter(shape);
  }
  setShapeLocalPose(shape: number, local: PxPose): number {
    this.setPose(IO.POSE0, local);
    return this.x.px_shape_set_local_pose(shape);
  }
  shapeWorldPose(shape: number, out: number[] = []): number[] | null {
    if (!this.x.px_shape_get_world_pose(shape)) return null;
    return this.getPose(0, out);
  }

  /** PxGeometryQuery(씬 없이 두 기하) — 시험·단일 형상 판정용 */
  geomRaycast(target: PxGeometryDesc, pose: PxPose, origin: ArrayLike<number>, dir: ArrayLike<number>, distance: number, hitFlags: number, maxHits = 1): number {
    this.setGeometry(IO.GEOM1, target);
    this.setPose(IO.POSE1, pose);
    this.setF(IO.RAY_ORIGIN, origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], distance);
    this.setU(IO.RAY_FLAGS, hitFlags);
    return this.x.px_geom_raycast(maxHits);
  }
  geomSweep(geom: PxGeometryDesc, pose: PxPose, dir: ArrayLike<number>, distance: number, target: PxGeometryDesc, targetPose: PxPose, hitFlags: number, inflation = 0): number {
    this.setGeometry(IO.GEOM0, geom);
    this.setPose(IO.POSE0, pose);
    this.setF(IO.DIR, dir[0], dir[1], dir[2], distance);
    this.setU(IO.FLAGS, hitFlags);
    this.setF(IO.INFLATION, inflation);
    this.setGeometry(IO.GEOM1, target);
    this.setPose(IO.POSE1, targetPose);
    return this.x.px_geom_sweep();
  }
  geomPenetration(g0: PxGeometryDesc, p0: PxPose, g1: PxGeometryDesc, p1: PxPose, out: number[] = []): number[] | null {
    this.setGeometry(IO.GEOM0, g0);
    this.setPose(IO.POSE0, p0);
    this.setGeometry(IO.GEOM1, g1);
    this.setPose(IO.POSE1, p1);
    if (!this.x.px_geom_penetration()) return null;
    for (let i = 0; i < 4; i++) out[i] = this.getF(IO.OUT_DIR + i);
    return out;
  }
  geomOverlap(g0: PxGeometryDesc, p0: PxPose, g1: PxGeometryDesc, p1: PxPose): boolean {
    this.setGeometry(IO.GEOM0, g0);
    this.setPose(IO.POSE0, p0);
    this.setGeometry(IO.GEOM1, g1);
    this.setPose(IO.POSE1, p1);
    return this.x.px_geom_overlap() !== 0;
  }
}

export function emptyHit(): PxHit {
  return { position: [0, 0, 0], normal: [0, 0, 0], distance: 0, u: 0, v: 0, flags: 0, faceIndex: 0, filter: [0, 0, 0, 0], shape: 0 };
}

/** wasm 바이트(또는 컴파일된 Module) → 초기화된 Physx. 받아 오기는 쓰는 쪽(브라우저 fetch·노드 fs) */
export async function createPhysx(wasm: BufferSource | WebAssembly.Module): Promise<Physx> {
  let px: Physx | null = null;
  const imports = physxImports(() => px?.views());
  const inst = wasm instanceof WebAssembly.Module ? await WebAssembly.instantiate(wasm, imports) : (await WebAssembly.instantiate(wasm, imports)).instance;
  px = new Physx(inst);
  return px;
}
