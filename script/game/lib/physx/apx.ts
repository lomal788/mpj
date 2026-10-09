/**
 * PhysX 4.1.2 바이너리 직렬화(.apx, SEBD, 플랫폼 NX64) 리더 — import 0.
 * NX64 는 LP64 배치라 wasm32 PhysX 가 PxSerialization::createCollectionFromBinary 로 바로 읽을 수 없고, 게임 정의 객체(USER_1024·1025)는 직렬화기가 없다.
 * 그래서 형상 데이터만 원본 배치로 읽고, 삼각 메시·볼록체는 PhysX 쿠킹 스트림 형식(NXS MESH v15 / NXS CVXM v13)으로 **다시 포장**한다
 * (원본에 구운 BVH33 RTree 페이지·삼각형 순서·extraTrigData·faceRemap 을 바이트 그대로 옮긴다 — 다시 굽지 않는다).
 * 배치 근거: docs/engine/06_scene_data.md §5.1, 11_moving_collision.md §9.3. 스트림 형식: PhysX GuMeshFactory.cpp loadMeshData·GuRTree.cpp RTree::load·GuConvexMesh.cpp ConvexMesh::load.
 */

export const APX_TYPES: Record<number, string> = {
  2: 'CONVEX_MESH', 3: 'TRIANGLE_MESH_BVH33', 4: 'TRIANGLE_MESH_BVH34', 5: 'RIGID_DYNAMIC', 6: 'RIGID_STATIC', 7: 'SHAPE', 8: 'MATERIAL', 9: 'CONSTRAINT',
};

/** PxGeometryType */
export const enum PxGeometryType { Sphere = 0, Plane = 1, Capsule = 2, Box = 3, Convex = 4, TriangleMesh = 5, HeightField = 6 }

export interface ApxTriangleMesh {
  kind: 'trimesh';
  object: number;
  nbVertices: number;
  nbTriangles: number;
  /** PxTriangleMeshFlags(+0x5C, bit1 = 16비트 인덱스) */
  flags: number;
  rtreePages: number;
  /** 쿠킹 스트림(NXS MESH v15) — PxPhysics::createTriangleMesh(PxInputStream) 입력 */
  stream: Uint8Array;
}

export interface ApxConvexMesh {
  kind: 'convex';
  object: number;
  nbVertices: number;
  nbPolygons: number;
  /** 쿠킹 스트림(NXS CVXM v13). bigConvex(가우스 맵) 는 지원하지 않는다 → null */
  stream: Uint8Array | null;
}

export interface ApxShape {
  object: number;
  geometry: PxGeometryType;
  /** 로컬 자세 [px,py,pz,qx,qy,qz,qw] */
  pose: number[];
  /** sphere [r] / capsule [r, halfHeight](SDK X축) / box [hx,hy,hz] / mesh [sx,sy,sz, rx,ry,rz,rw] / plane [] */
  params: number[];
  /** 메시 객체 번호(trimesh·convex) */
  mesh: number | null;
  /** PxMeshGeometryFlags(trimesh: eDOUBLE_SIDED = 2) */
  meshFlags: number;
  /** PxShapeFlags(+0x90) — 1 simulation, 2 scene query, 4 trigger, 8 visualization */
  shapeFlags: number;
  /** Sc::ShapeCore 필터 데이터(+0x50 query, +0x60 simulation) */
  queryFilter: number[];
  simulationFilter: number[];
  /** 재질(+첫 재질) — 정적·동적 마찰·반발 */
  material: [number, number, number] | null;
}

export interface ApxActor {
  object: number;
  dynamic: boolean;
  pose: number[];
  shapes: number[];
}

export interface ApxCollection {
  version: number;
  platform: string;
  objects: number[];
  meshes: Map<number, ApxTriangleMesh | ApxConvexMesh>;
  shapes: ApxShape[];
  actors: ApxActor[];
  /** 추가 데이터를 앞에서부터 읽다 멈춘 이유(메시·재질이 아닌 객체가 메시보다 먼저 나오면 그 뒤 메시는 위치를 모른다) */
  stopped: string | null;
}

const a16 = (o: number): number => (o + 15) & ~15;

class Reader {
  readonly dv: DataView;
  constructor(readonly b: Uint8Array) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  u8(o: number): number { return this.b[o]; }
  u16(o: number): number { return this.dv.getUint16(o, true); }
  u32(o: number): number { return this.dv.getUint32(o, true); }
  f32(o: number): number { return this.dv.getFloat32(o, true); }
  /** u64 하위·상위 */
  u64lo(o: number): number { return this.dv.getUint32(o, true); }
  u64hi(o: number): number { return this.dv.getUint32(o + 4, true); }
  fs(o: number, n: number): number[] {
    const r: number[] = [];
    for (let i = 0; i < n; i++) r.push(this.f32(o + 4 * i));
    return r;
  }
}

class Writer {
  private buf: Uint8Array;
  private dv: DataView;
  n = 0;
  constructor(cap: number) {
    this.buf = new Uint8Array(cap);
    this.dv = new DataView(this.buf.buffer);
  }
  private need(k: number): void {
    if (this.n + k <= this.buf.length) return;
    const nb = new Uint8Array(Math.max(this.buf.length * 2, this.n + k));
    nb.set(this.buf);
    this.buf = nb;
    this.dv = new DataView(nb.buffer);
  }
  chunk(s: string, last?: number): void {
    this.need(4);
    for (let i = 0; i < 3; i++) this.buf[this.n++] = s.charCodeAt(i);
    this.buf[this.n++] = last ?? s.charCodeAt(3);
  }
  u8(v: number): void { this.need(1); this.buf[this.n++] = v; }
  u16(v: number): void { this.need(2); this.dv.setUint16(this.n, v, true); this.n += 2; }
  u32(v: number): void { this.need(4); this.dv.setUint32(this.n, v >>> 0, true); this.n += 4; }
  f32(v: number): void { this.need(4); this.dv.setFloat32(this.n, v, true); this.n += 4; }
  bytes(src: Uint8Array): void { this.need(src.length); this.buf.set(src, this.n); this.n += src.length; }
  done(): Uint8Array { return this.buf.slice(0, this.n); }
}

/** 원본 CenterExtents → PxBounds3(min = c − e, max = c + e, f32) */
function boundsFromCE(ce: number[]): number[] {
  const f = Math.fround;
  return [f(ce[0] - ce[3]), f(ce[1] - ce[4]), f(ce[2] - ce[5]), f(ce[0] + ce[3]), f(ce[1] + ce[4]), f(ce[2] + ce[5])];
}

/** Gu::TriangleMesh(BVH33) 객체 + 추가 데이터 → NXS MESH v15 스트림. 추가 데이터 끝 오프셋도 돌려준다 */
function triangleMesh(r: Reader, obj: number, at: number, extra: number): { mesh: ApxTriangleMesh; end: number } {
  const o = at;
  const nv = r.u32(o + 0x1c);
  const nt = r.u32(o + 0x20);
  const ce = r.fs(o + 0x38, 6);
  const geomEps = r.f32(o + 0x58);
  const flags = r.u8(o + 0x5c);
  const has = (off: number): boolean => r.u64lo(o + off) !== 0 || r.u64hi(o + off) !== 0;
  const hv = has(0x28), ht = has(0x30), he = has(0x50), hm = has(0x60), hr = has(0x68), ha = has(0x70);
  const rtree = o + 0xa0;
  const pages = r.u32(rtree + 0x50);
  let e = ((extra + 127) & ~127);
  const pagesAt = e;
  e += 112 * pages;
  const i16 = (flags & 2) !== 0;
  let vAt = -1, tAt = -1, xAt = -1, mAt = -1, rAt = -1, aAt = -1;
  if (hv) { e = a16(e); vAt = e; e += 12 * nv; }
  if (ht) { e = a16(e); tAt = e; e += (i16 ? 6 : 12) * nt; }
  if (he) { e = a16(e); xAt = e; e += nt; }
  if (hm) { e = a16(e); mAt = e; e += 2 * nt; }
  if (hr) { e = a16(e); rAt = e; e += 4 * nt; }
  if (ha) { e = a16(e); aAt = e; e += 12 * nt; }
  if (vAt < 0 || tAt < 0) throw new Error(`apx 삼각 메시 ${obj}: 정점·인덱스 없음`);
  const w = new Writer(64 + 12 * nv + 12 * nt + 112 * pages + 12 * nt);
  w.chunk('NXS', 1);
  w.chunk('MESH');
  w.u32(15);
  w.u32(0);
  let serial = 0;
  if (hm) serial |= 1;
  if (hr) serial |= 2;
  if (i16) serial |= 8;
  if (ha) serial |= 16;
  w.u32(serial);
  w.u32(nv);
  w.u32(nt);
  w.bytes(r.b.subarray(vAt, vAt + 12 * nv));
  w.bytes(r.b.subarray(tAt, tAt + (i16 ? 6 : 12) * nt));
  if (hm) w.bytes(r.b.subarray(mAt, mAt + 2 * nt));
  if (hr) {
    let max = 0;
    for (let i = 0; i < nt; i++) max = Math.max(max, r.u32(rAt + 4 * i));
    w.u32(max);
    for (let i = 0; i < nt; i++) {
      const v = r.u32(rAt + 4 * i);
      if (max <= 0xff) w.u8(v);
      else if (max <= 0xffff) w.u16(v);
      else w.u32(v);
    }
  }
  if (ha) w.bytes(r.b.subarray(aAt, aAt + 12 * nt));
  w.chunk('RTR', 'E'.charCodeAt(0));
  w.u32(2);
  w.bytes(r.b.subarray(rtree, rtree + 0x40));
  for (let k = 0; k < 5; k++) w.u32(r.u32(rtree + 0x40 + 4 * k));
  w.u32(0);
  w.bytes(r.b.subarray(pagesAt, pagesAt + 112 * pages));
  w.f32(geomEps);
  for (const v of boundsFromCE(ce)) w.f32(v);
  if (he) {
    w.u32(nt);
    w.bytes(r.b.subarray(xAt, xAt + nt));
  } else w.u32(0);
  return { mesh: { kind: 'trimesh', object: obj, nbVertices: nv, nbTriangles: nt, flags, rtreePages: pages, stream: w.done() }, end: e };
}

/** Gu::ConvexMesh 객체 + 추가 데이터 → NXS CVXM v13 스트림 */
function convexMesh(r: Reader, obj: number, at: number, extra: number): { mesh: ApxConvexMesh; end: number; big: boolean } {
  const o = at;
  const ce = r.fs(o + 0x20, 6);
  const com = r.fs(o + 0x38, 3);
  const neRaw = r.u16(o + 0x44);
  const ne = neRaw & 0x7fff;
  const nv = r.u8(o + 0x46);
  const np = r.u8(o + 0x47);
  const internal = r.fs(o + 0x58, 4);
  const nb = r.u32(o + 0x68) & 0x7fffffff;
  const big = r.u64lo(o + 0x70) !== 0 || r.u64hi(o + 0x70) !== 0;
  const mass = r.f32(o + 0x78);
  const inertia = r.fs(o + 0x7c, 9);
  const e = a16(extra);
  const polys = e;
  const verts = polys + 20 * np;
  const fbe = verts + 12 * nv;
  const fbv = fbe + 2 * ne;
  const edges = fbv + 3 * nv;
  const vd8 = edges + ((neRaw & 0x8000) ? 4 * ne : 0);
  let size = vd8 + nb - e;
  size += (4 - (size % 4)) % 4;
  const mesh: ApxConvexMesh = { kind: 'convex', object: obj, nbVertices: nv, nbPolygons: np, stream: null };
  if (!big) {
    const w = new Writer(256 + size);
    w.chunk('NXS', 1);
    w.chunk('CVXM');
    w.u32(13);
    w.u32(0);
    w.chunk('ICE', 1);
    w.chunk('CLHL');
    w.u32(13);
    w.u32(nv);
    w.u32(neRaw);
    w.u32(np);
    w.u32(nb);
    w.bytes(r.b.subarray(verts, verts + 12 * nv));
    w.bytes(r.b.subarray(polys, polys + 20 * np));
    w.bytes(r.b.subarray(vd8, vd8 + nb));
    w.bytes(r.b.subarray(fbe, fbe + 2 * ne));
    w.bytes(r.b.subarray(fbv, fbv + 3 * nv));
    if (neRaw & 0x8000) w.bytes(r.b.subarray(edges, edges + 4 * ne));
    w.f32(0);
    for (const v of boundsFromCE(ce)) w.f32(v);
    w.f32(mass);
    if (mass !== -1) {
      for (const v of inertia) w.f32(v);
      for (const v of com) w.f32(v);
    }
    w.f32(-1);
    for (const v of internal) w.f32(v);
    mesh.stream = w.done();
  }
  return { mesh, end: e + size, big };
}

/** .apx 바이트 → 형상 컬렉션(메시는 쿠킹 스트림으로 재포장) */
export function readApx(bytes: Uint8Array): ApxCollection {
  const r = new Reader(bytes);
  if (r.u32(0) !== 0x44424553) throw new Error('apx: SEBD 아님');
  const version = r.u32(4);
  const platform = String.fromCharCode(bytes[40], bytes[41], bytes[42], bytes[43]);
  let o = a16(48);
  o = a16(o + 4);
  const nMan = r.u32(o);
  o += 4;
  const manifest: [number, number][] = [];
  for (let i = 0; i < nMan; i++) manifest.push([r.u32(o + 8 * i), r.u16(o + 8 * i + 4)]);
  o += 8 * nMan;
  const objSize = r.u32(o);
  o = a16(o + 4);
  const nImp = r.u32(o);
  o = a16(o + 4 + 16 * nImp);
  const nExp = r.u32(o);
  o = a16(o + 4 + 16 * nExp);
  const nRef = r.u32(o);
  const refs = new Map<string, number>();
  for (let i = 0; i < nRef; i++) {
    const at = o + 4 + 16 * i;
    refs.set(`${r.u64hi(at)}:${r.u64lo(at)}`, r.u32(at + 8));
  }
  o = o + 4 + 16 * nRef;
  const nH16 = r.u32(o);
  o = a16(o + 4 + 8 * nH16);
  const objBase = o;
  const objAt = (i: number): number => objBase + manifest[i][0];
  const refAt = (at: number): number | null => {
    const v = refs.get(`${r.u64hi(at)}:${r.u64lo(at)}`);
    return v === undefined ? null : v;
  };
  const meshes = new Map<number, ApxTriangleMesh | ApxConvexMesh>();
  let stopped: string | null = null;
  let e = a16(objBase + objSize);
  for (let i = 0; i < manifest.length; i++) {
    const t = manifest[i][1];
    e = a16(e);
    if (t === 3) {
      const m = triangleMesh(r, i, objAt(i), e);
      meshes.set(i, m.mesh);
      e = m.end;
    } else if (t === 2) {
      const m = convexMesh(r, i, objAt(i), e);
      meshes.set(i, m.mesh);
      if (m.big) {
        stopped = `bigConvex ${i}`;
        break;
      }
      e = m.end;
    } else if (t === 8) continue;
    else {
      if (manifest.slice(i).some(([, tt]) => tt === 2 || tt === 3)) stopped = `${APX_TYPES[t] ?? t} ${i}`;
      break;
    }
  }
  const materials = new Map<number, [number, number, number]>();
  for (let i = 0; i < manifest.length; i++) {
    if (manifest[i][1] !== 8) continue;
    const m = objAt(i);
    materials.set(i, [r.f32(m + 0x34), r.f32(m + 0x30), r.f32(m + 0x38)]);
  }
  const firstMaterial = [...materials.values()][0] ?? null;
  const shapes: ApxShape[] = [];
  const shapeIndex = new Map<number, number>();
  for (let i = 0; i < manifest.length; i++) {
    if (manifest[i][1] !== 7) continue;
    const s = objAt(i);
    const g = r.u32(s + 0x98) as PxGeometryType;
    const q = r.fs(s + 0x70, 4);
    const p = r.fs(s + 0x80, 3);
    let params: number[] = [];
    let mesh: number | null = null;
    let meshFlags = 0;
    if (g === PxGeometryType.Sphere) params = [r.f32(s + 0x9c)];
    else if (g === PxGeometryType.Capsule) params = r.fs(s + 0x9c, 2);
    else if (g === PxGeometryType.Box) params = r.fs(s + 0x9c, 3);
    else if (g === PxGeometryType.TriangleMesh) {
      params = r.fs(s + 0x9c, 7);
      meshFlags = r.u8(s + 0xb8);
      mesh = refAt(s + 0xc0);
    } else if (g === PxGeometryType.Convex) {
      params = r.fs(s + 0x9c, 7);
      mesh = refAt(s + 0xb8);
      meshFlags = r.u8(s + 0xc0);
    }
    shapeIndex.set(i, shapes.length);
    shapes.push({
      object: i, geometry: g, pose: [...p, ...q], params, mesh, meshFlags, shapeFlags: r.u8(s + 0x90),
      queryFilter: [r.u32(s + 0x50), r.u32(s + 0x54), r.u32(s + 0x58), r.u32(s + 0x5c)],
      simulationFilter: [r.u32(s + 0x60), r.u32(s + 0x64), r.u32(s + 0x68), r.u32(s + 0x6c)],
      material: firstMaterial,
    });
  }
  const actors: ApxActor[] = [];
  for (let i = 0; i < manifest.length; i++) {
    const t = manifest[i][1];
    if (t !== 5 && t !== 6) continue;
    const a = objAt(i);
    actors.push({ object: i, dynamic: t === 5, pose: [...r.fs(a + 0xa0, 3), ...r.fs(a + 0x90, 4)], shapes: [] });
  }
  return { version, platform, objects: manifest.map(([, t]) => t), meshes, shapes, actors, stopped };
}
