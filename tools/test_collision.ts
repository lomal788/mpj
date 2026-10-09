/**
 * 공용 충돌 런타임 시험(노드, 헤드리스 없음) — docs/engine/11_moving_collision.md §9.
 * physx(wasm 단위) 1) ABI·import·메모리 증가  2) 형상별 해석 기대값(광선·sweep·침투 닫힌 해)  3) hit flag 비트 조합  4) .apx → 쿠킹 스트림(원본 RTree 바이트 그대로)
 *                  5) RTree 순회 순서 = 원본 페이지 DFS 순서(touch 순서)  6) wasm→wasm import 경로(손으로 만든 모듈) = JS 경로
 * collision 계약  7) 가짜 백엔드: hit flags·마스크·제외·validity·initialOverlap·캡슐 quarter-turn·libc++ 정렬·Map 평균  8) 수명(Stage/Unstage·enabled·세대·teleport)
 * 통합(physx 백엔드) 9) 레이어·제외·initialOverlap·MTD·All 정렬  10) 광장·mg0122·mg0101 로드·질의  11) 결정성(두 번·새 인스턴스 해시 같음)
 *                  12) import 경계·할당  13) 광장 MeshCollider 대비(보고용 수치, 바꾸지 않음)
 *
 *   npx tsx tools/test_collision.ts
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { PerformanceObserver } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createPhysx, readApx, type Physx, PxGeom, PxHitFlag, type PxGeometryDesc, PX_ABI_VERSION } from '@game/lib/physx';
import {
  CollisionWorld, RULES_ORIGINAL, RULES_WEB, libcxxSort, resolveMapContacts, rayHitFlags, shapeHitFlags, toSdk, quatRotate, emptyResult, capsuleFromSegment,
  type BackendHit, type CollisionBackend, type CastResult, type MapContact, type Pose, type SdkGeometry, type Vec3, type Penetration,
} from '@game/lib/collision';
import { PhysxCollisionBackend } from '@game/lib/collision-physx';
import { MeshCollider, type MeshColliderData } from '@app/common/render3d';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(WEB, 'assets');
let n = 0;
let bad = 0;
const ok = (c: boolean, msg: string, d = ''): void => {
  n++;
  if (!c) bad++;
  console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}${d ? `  — ${d}` : ''}`);
};
const near = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps;
const nearV = (a: ArrayLike<number>, b: ArrayLike<number>, eps: number): boolean => near(a[0], b[0], eps) && near(a[1], b[1], eps) && near(a[2], b[2], eps);
const fmt = (v: ArrayLike<number>): string => `(${Array.from(v).map((x) => +x.toFixed(5)).join(', ')})`;
const ID: Pose = [0, 0, 0, 0, 0, 0, 1];
const at = (x: number, y: number, z: number, q: number[] = [0, 0, 0, 1]): Pose => [x, y, z, q[0], q[1], q[2], q[3]];
const WASM = fs.readFileSync(path.join(WEB, 'script/game/lib/physx/physx.wasm'));
const px = await createPhysx(WASM);
if (process.argv.includes('--alloc-child')) {
  console.log(JSON.stringify(await allocProbe(px)));
  process.exit(0);
}

/** 질의 경로 할당 측정(GC 없는 구간의 new space 증가, 빈 구간 중앙값을 뺌) */
async function allocProbe(p: Physx): Promise<{ med: number; chunks: number }> {
  const backend = new PhysxCollisionBackend(p);
  const world = new CollisionWorld(backend);
  for (const f of ['72cbf6799dc022826ea52ed8ed6d9c3f', '8fd195287993206ecec0115f93468058']) {
    const { shapes } = backend.loadApx(new Uint8Array(fs.readFileSync(path.join(ASSETS, 'plaza/world/physics/apx', `${f}.apx`))), 2);
    world.createBody({ entity: { index: 1, generation: 1 }, motion: 0, pose: [0, 0, 0, 0, 0, 0, 1], shapes });
  }
  const r = emptyResult();
  const capArg = { shape: { geometry: { kind: 'capsule' as const, radius: 0.4, halfHeight: 0.25 }, local: [0, 0.65, 0, 0, 0, 0, 1] as Pose }, position: [0, 2, 10] as Vec3, rotation: [0, 0, 0, 1] as [number, number, number, number], direction: [0, -1, 0] as Vec3, distance: 5, mask: 4 };
  const rayArg = { origin: [0, 25, 10] as Vec3, direction: [0, -1, 0] as Vec3, distance: 60, mask: 4 };
  const work = (k: number): void => {
    for (let i = 0; i < k; i++) {
      rayArg.origin[0] = (i % 40) - 20;
      world.castRay(rayArg, r);
      capArg.position[0] = (i % 30) - 15;
      world.castShape(capArg, r);
    }
  };
  work(60000);
  let gcs = 0;
  const obs = new PerformanceObserver((list) => { gcs += list.getEntries().length; });
  obs.observe({ entryTypes: ['gc'] });
  const newSpace = (): number => v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')?.space_used_size ?? 0;
  const flush = async (): Promise<void> => { await new Promise((res) => setTimeout(res, 0)); await new Promise((res) => setImmediate(res)); };
  const chunk = async (doWork: boolean): Promise<number | null> => {
    await flush();
    const g0 = gcs;
    const b = newSpace();
    if (doWork) work(2000);
    const a = newSpace();
    await flush();
    return gcs === g0 ? a - b : null;
  };
  const base: number[] = [];
  for (let i = 0; i < 7; i++) { const d = await chunk(false); if (d !== null) base.push(d); }
  const z = base.sort((x, y) => x - y)[base.length >> 1] ?? 0;
  const ds: number[] = [];
  for (let i = 0; i < 15; i++) { const d = await chunk(true); if (d !== null) ds.push(d - z); }
  obs.disconnect();
  return { med: ds.sort((x, y) => x - y)[ds.length >> 1] ?? -1, chunks: ds.length };
}

console.log('1) ABI·import·메모리 증가');
{
  const mod = new WebAssembly.Module(WASM);
  const imps = WebAssembly.Module.imports(mod).map((i) => `${i.module}.${i.name}`);
  ok(imps.length === 1 && imps[0] === 'env.emscripten_notify_memory_growth', 'import = env.emscripten_notify_memory_growth 하나', imps.join(' '));
  const exps = WebAssembly.Module.exports(mod).map((e) => e.name);
  ok(exps.includes('memory') && exps.includes('px_alloc') && exps.includes('px_free') && exps.includes('px_abi_version'), 'export memory·px_alloc·px_free·px_abi_version');
  ok(px.x.px_abi_version() === PX_ABI_VERSION && px.x.px_physx_version() === 0x04010200, 'ABI 1·PhysX 4.1.2', px.x.px_physx_version().toString(16));
  ok(px.x.px_io_size() === 1024 && px.x.px_hits_capacity() === 256 && px.x.px_hit_stride() === 64, 'io 1024 B·hit 256 × 64 B');
  const before = px.x.memory.buffer.byteLength;
  const big = px.x.px_alloc(48 << 20);
  const after = px.x.memory.buffer.byteLength;
  px.setF(0, 1.5);
  ok(big !== 0 && after > before && px.getF(0) === 1.5, 'memory.grow 뒤 오프셋 유지·뷰 다시 만듦', `${before >> 20} → ${after >> 20} MiB`);
  px.x.px_free(big);
  ok(px.x.px_mesh_release(0x7fff0001) === 0 && px.lastError() === 'invalid handle', '없는 핸들 거부(세대 검사)');
}

console.log('2) 형상별 해석 기대값(PxGeometryQuery)');
{
  const sphere: PxGeometryDesc = { type: PxGeom.Sphere, radius: 1 };
  let k = px.geomRaycast(sphere, ID, [-5, 0, 0], [1, 0, 0], 10, PxHitFlag.eDEFAULT);
  let h = px.readHit(0);
  ok(k === 1 && near(h.distance, 4, 1e-6) && nearV(h.position, [-1, 0, 0], 1e-6) && nearV(h.normal, [-1, 0, 0], 1e-6), '광선→구 r1: 거리 4·법선 −X', `${h.distance} ${fmt(h.normal)}`);
  const box: PxGeometryDesc = { type: PxGeom.Box, hx: 1, hy: 2, hz: 3 };
  k = px.geomRaycast(box, ID, [0.3, 10, -0.4], [0, -1, 0], 20, PxHitFlag.eDEFAULT);
  h = px.readHit(0);
  ok(k === 1 && near(h.distance, 8, 1e-6) && nearV(h.normal, [0, 1, 0], 1e-6) && nearV(h.position, [0.3, 2, -0.4], 1e-6), '광선→박스(1,2,3): 거리 8·윗면', `${h.distance}`);
  const capsule: PxGeometryDesc = { type: PxGeom.Capsule, radius: 0.5, halfHeight: 1 };
  k = px.geomRaycast(capsule, ID, [0.5, 5, 0], [0, -1, 0], 10, PxHitFlag.eDEFAULT);
  h = px.readHit(0);
  ok(k === 1 && near(h.distance, 4.5, 1e-5) && nearV(h.normal, [0, 1, 0], 1e-5), '광선→캡슐(SDK X축) 원통부: 거리 4.5', `${h.distance}`);
  k = px.geomRaycast(capsule, ID, [1.3, 5, 0], [0, -1, 0], 10, PxHitFlag.eDEFAULT);
  h = px.readHit(0);
  const yc = Math.sqrt(0.25 - 0.09);
  ok(k === 1 && near(h.distance, 5 - yc, 1e-5) && nearV(h.normal, [0.3 / 0.5, yc / 0.5, 0], 1e-4), '광선→캡슐 끝 반구: 거리 5−√(r²−0.3²)', `${h.distance} ${fmt(h.normal)}`);
  k = px.geomRaycast(sphere, ID, [0, 0, 0], [1, 0, 0], 10, PxHitFlag.eDEFAULT);
  h = px.readHit(0);
  ok(k === 1 && h.distance === 0 && nearV(h.normal, [-1, 0, 0], 0), '광선 시작이 안: 거리 0·법선 −dir');
  // sweep 닫힌 해
  const ball: PxGeometryDesc = { type: PxGeom.Sphere, radius: 0.5 };
  const cube: PxGeometryDesc = { type: PxGeom.Box, hx: 1, hy: 1, hz: 1 };
  k = px.geomSweep(ball, at(0.2, 5, 0.1), [0, -1, 0], 10, cube, ID, PxHitFlag.eDEFAULT);
  h = px.readHit(0);
  ok(k === 1 && near(h.distance, 3.5, 1e-4) && nearV(h.normal, [0, 1, 0], 1e-4) && nearV(h.position, [0.2, 1, 0.1], 1e-3), '구 r.5 sweep→박스 윗면: 3.5', `${h.distance} ${fmt(h.position)}`);
  k = px.geomSweep(ball, at(-5, 0, 0), [1, 0, 0], 10, { type: PxGeom.Sphere, radius: 1 }, ID, PxHitFlag.eDEFAULT);
  h = px.readHit(0);
  ok(k === 1 && near(h.distance, 3.5, 1e-5) && nearV(h.normal, [-1, 0, 0], 1e-5) && nearV(h.position, [-1, 0, 0], 1e-5), '구 sweep→구: 3.5·접점 (−1,0,0)', `${h.distance}`);
  const capX: PxGeometryDesc = { type: PxGeom.Capsule, radius: 0.5, halfHeight: 1 };
  k = px.geomSweep(capX, at(0, 4, 0), [0, -1, 0], 10, cube, ID, PxHitFlag.eDEFAULT);
  h = px.readHit(0);
  ok(k === 1 && near(h.distance, 2.5, 1e-4) && nearV(h.normal, [0, 1, 0], 1e-4), '눕힌 캡슐 sweep→박스: 2.5', `${h.distance}`);
  k = px.geomSweep({ type: PxGeom.Box, hx: 0.5, hy: 0.5, hz: 0.5 }, at(0, 4, 0), [0, -1, 0], 10, cube, ID, PxHitFlag.eDEFAULT);
  h = px.readHit(0);
  ok(k === 1 && near(h.distance, 2.5, 5e-3) && nearV(h.normal, [0, 1, 0], 1e-4), '박스 sweep→박스(GJK raycast): 2.5 − PhysX GJK 허용치(0.0025 앞에서 멈춤)', `${h.distance}`);
  // 초기 겹침
  k = px.geomSweep(ball, at(0, 1.2, 0), [0, -1, 0], 5, cube, ID, PxHitFlag.eDEFAULT);
  h = px.readHit(0);
  ok(k === 1 && h.distance === 0 && nearV(h.normal, [0, 1, 0], 1e-6), '초기 겹침(eDEFAULT): 거리 0·법선 −dir', `${h.distance} ${fmt(h.normal)}`);
  k = px.geomSweep(ball, at(0, 1.2, 0), [0, -1, 0], 5, cube, ID, PxHitFlag.eDEFAULT | PxHitFlag.eMTD);
  h = px.readHit(0);
  ok(k === 1 && near(h.distance, -0.3, 1e-4) && nearV(h.normal, [0, 1, 0], 1e-4), '초기 겹침(eMTD): 거리 −깊이 0.3·법선 = MTD(+Y)', `${h.distance} ${fmt(h.normal)}`);
  const pen = px.geomPenetration({ type: PxGeom.Sphere, radius: 1 }, at(0.2, 1.5, 0), cube, ID);
  ok(!!pen && near(pen[3], 0.5, 1e-4) && nearV(pen, [0, 1, 0], 1e-4), 'computePenetration 구 r1 @y1.5 vs 박스: 깊이 .5·+Y', pen ? `${fmt(pen)} ${pen[3]}` : 'null');
  ok(px.geomOverlap(ball, at(0, 1.4, 0), cube, ID) && !px.geomOverlap(ball, at(0, 1.6, 0), cube, ID), 'overlap 경계(1.4 겹침 / 1.6 아님)');
}

console.log('3) hit flag 비트 조합(0x403·0x423·0x603·+0x80)');
{
  ok(rayHitFlags({}) === 0x403 && rayHitFlags({ meshMultiple: true }) === 0x423 && rayHitFlags({ bothSides: true }) === 0x483, 'Ray +0x41/+0x42 → 0x423/0x483');
  ok(shapeHitFlags({}) === 0x403 && shapeHitFlags({ mtd: true }) === 0x603 && shapeHitFlags({ mtd: true, bothSides: true }) === 0x683, 'Shape +0xE1/+0xE2 → 0x603/0x683');
  ok(PxHitFlag.eDEFAULT === (PxHitFlag.ePOSITION | PxHitFlag.eNORMAL | PxHitFlag.eFACE_INDEX), 'eDEFAULT = POSITION|NORMAL|FACE_INDEX');
  // 한 면 삼각형(+Y) 메시: 아래에서 쏘면 eMESH_BOTH_SIDES 일 때만
  const tri = buildMeshStream([[-1, 0, -1], [-1, 0, 1], [1, 0, 0]], [0, 1, 2]);
  const m = px.createTriangleMesh(tri);
  const mesh: PxGeometryDesc = { type: PxGeom.TriangleMesh, mesh: m };
  const a = px.geomRaycast(mesh, ID, [0, 1, 0], [0, -1, 0], 5, 0x403);
  const b = px.geomRaycast(mesh, ID, [0, -1, 0], [0, 1, 0], 5, 0x403);
  const c = px.geomRaycast(mesh, ID, [0, -1, 0], [0, 1, 0], 5, 0x483);
  const hc = px.readHit(0);
  ok(m !== 0 && a === 1 && b === 0 && c === 1 && nearV(hc.normal, [0, 1, 0], 1e-6), '단면 메시: 뒤에서는 0x483 만 hit·법선은 단면 메시라 삼각형 법선 그대로(PhysX DE7458)', `${a} ${b} ${c} ${fmt(hc.normal)}`);
  const f1 = px.geomRaycast(mesh, ID, [0, 1, 0], [0, -1, 0], 5, 0x1);
  ok(f1 === 1 && (px.readHit(0).flags & PxHitFlag.eNORMAL) === 0, 'eNORMAL 없으면 법선 플래그 없음', `flags ${px.readHit(0).flags.toString(16)}`);
  px.x.px_mesh_release(m);
}

/** 테스트용 NXS MESH v15 스트림(RTree 한 페이지, 잎 하나) — 손으로 만든 최소 메시 */
function buildMeshStream(verts: number[][], idx: number[]): Uint8Array {
  const nt = idx.length / 3;
  const b = new ArrayBuffer(4096);
  const dv = new DataView(b);
  let o = 0;
  const ch = (s: string, last?: number): void => {
    for (let i = 0; i < 3; i++) dv.setUint8(o++, s.charCodeAt(i));
    dv.setUint8(o++, last ?? s.charCodeAt(3));
  };
  const u = (v: number): void => { dv.setUint32(o, v, true); o += 4; };
  const fl = (v: number): void => { dv.setFloat32(o, v, true); o += 4; };
  ch('NXS', 1); ch('MESH'); u(15); u(0); u(0); u(verts.length); u(nt);
  for (const v of verts) for (const x of v) fl(x);
  for (const i of idx) u(i);
  const mn = [0, 1, 2].map((k) => Math.min(...verts.map((v) => v[k])));
  const mx = [0, 1, 2].map((k) => Math.max(...verts.map((v) => v[k])));
  ch('RTR', 'E'.charCodeAt(0)); u(2);
  fl(mn[0]); fl(mn[1]); fl(mn[2]); fl(0); fl(mx[0]); fl(mx[1]); fl(mx[2]); fl(0);
  for (let i = 0; i < 8; i++) fl(i < 3 ? 1 : 0);
  u(4); u(1); u(1); u(1); u(1); u(0);
  const page = [mn[0], 3e38, 3e38, 3e38, mn[1], 3e38, 3e38, 3e38, mn[2], 3e38, 3e38, 3e38, mx[0], -3e38, -3e38, -3e38, mx[1], -3e38, -3e38, -3e38, mx[2], -3e38, -3e38, -3e38];
  for (const x of page) fl(x);
  u((0 << 5) | ((nt - 1) << 1) | 1); u(0); u(0); u(0);
  fl(0);
  fl(mn[0]); fl(mn[1]); fl(mn[2]); fl(mx[0]); fl(mx[1]); fl(mx[2]);
  u(0);
  return new Uint8Array(b, 0, o).slice();
}

const apxPath = (rel: string): string => path.join(ASSETS, rel);
const PLAZA_MAIN = 'plaza/world/physics/apx/72cbf6799dc022826ea52ed8ed6d9c3f.apx';
const MG0101_A0 = 'mg/mg0101/physics/apx/8e77ec3428912b09e660cd1e6958db6c.apx';

/** 쿠킹 스트림 해석(시험용) */
function parseStream(b: Uint8Array): { serial: number; nv: number; nt: number; tris: number[]; pages: Uint8Array; nPages: number; root: number; remap: number[] | null } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 12;
  const u = (): number => { const v = dv.getUint32(o, true); o += 4; return v; };
  o += 4;
  const serial = u(), nv = u(), nt = u();
  o += 12 * nv;
  const i16 = (serial & 8) !== 0;
  const tris: number[] = [];
  for (let i = 0; i < 3 * nt; i++) { tris.push(i16 ? dv.getUint16(o, true) : dv.getUint32(o, true)); o += i16 ? 2 : 4; }
  if (serial & 1) o += 2 * nt;
  let remap: number[] | null = null;
  if (serial & 2) {
    const mx = u();
    remap = [];
    for (let i = 0; i < nt; i++) { remap.push(mx <= 0xff ? b[o] : mx <= 0xffff ? dv.getUint16(o, true) : dv.getUint32(o, true)); o += mx <= 0xff ? 1 : mx <= 0xffff ? 2 : 4; }
  }
  if (serial & 16) o += 12 * nt;
  o += 8 + 64;
  const root = dv.getUint32(o + 4, true);
  const nPages = dv.getUint32(o + 16, true);
  o += 24;
  return { serial, nv, nt, tris, pages: b.slice(o, o + 112 * nPages), nPages, root, remap };
}

console.log('4) .apx → 쿠킹 스트림(원본 RTree·삼각형 순서 바이트 그대로)');
for (const rel of [PLAZA_MAIN, MG0101_A0, 'mg/mg0122/physics/apx/a0ca640bc25e4231d242b22dbd468c3e.apx']) {
  const bytes = new Uint8Array(fs.readFileSync(apxPath(rel)));
  const col = readApx(bytes);
  const [obj, m] = [...col.meshes][0];
  if (m.kind !== 'trimesh') continue;
  const s = parseStream(m.stream);
  // 원본 추가 데이터의 RTree 페이지(align128) 를 직접 찾아 비교
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pagesRaw = findPages(bytes, s.nPages, s.pages);
  const h = px.createTriangleMesh(m.stream);
  px.x.px_tri_mesh_info(h);
  ok(h !== 0 && px.getU(0) === m.nbVertices && px.getU(1) === m.nbTriangles && px.getU(2) === m.flags && pagesRaw,
    `${rel.split('/')[1]}: 메시 ${obj} 정점 ${m.nbVertices}·삼각형 ${m.nbTriangles}·플래그 ${m.flags}·RTree ${s.nPages}쪽 원본과 같음`, `${dv.byteLength} B`);
  px.x.px_mesh_release(h);
}
function findPages(b: Uint8Array, nPages: number, pages: Uint8Array): boolean {
  for (let o = 0; o + pages.length <= b.length; o += 128) {
    let same = true;
    for (let i = 0; i < pages.length && same; i += 16) if (b[o + i] !== pages[i] || b[o + i + 4] !== pages[i + 4]) same = false;
    if (same && Buffer.compare(Buffer.from(b.subarray(o, o + pages.length)), Buffer.from(pages)) === 0) return nPages > 0;
  }
  return false;
}

console.log('5) RTree 순회 순서 = 원본 페이지 DFS 순서(touch 순서는 정렬 안 함)');
const backendFor = (): { backend: PhysxCollisionBackend; world: CollisionWorld } => {
  const backend = new PhysxCollisionBackend(px);
  return { backend, world: new CollisionWorld(backend) };
};
{
  for (const rel of [PLAZA_MAIN, MG0101_A0]) {
    const bytes = new Uint8Array(fs.readFileSync(apxPath(rel)));
    const { backend, world } = backendFor();
    const { shapes, collection } = backend.loadApx(bytes, 2);
    world.createBody({ entity: { index: 1, generation: 1 }, motion: 0, pose: ID, shapes });
    const m = [...collection.meshes.values()][0];
    const s = parseStream(m.kind === 'trimesh' ? m.stream : new Uint8Array());
    const rank = dfsRank(s.pages, s.root, s.nt);
    let checked = 0;
    let monotone = 0;
    let multi = 0;
    const out: CastResult[] = [];
    for (let x = -20; x <= 20; x += 2.5)
      for (let z = -10; z <= 50; z += 2.5) {
        const k = world.castRayAll({ origin: [x, 40, z], direction: [0, -1, 0], distance: 100, mask: 1 << 2, meshMultiple: true, bothSides: true }, out, 64);
        if (k < 2) continue;
        multi++;
        let okOrder = true;
        for (let i = 1; i < k; i++) if (rank[out[i].faceIndex] <= rank[out[i - 1].faceIndex]) okOrder = false;
        checked++;
        if (okOrder) monotone++;
      }
    ok(checked > 0 && monotone === checked, `${rel.split('/')[1]}: 여러 hit 광선 ${multi}개 전부 touch 순서 = 원본 RTree DFS 순서(스택 LIFO·자식 3→0)`, `${monotone}/${checked}`);
    world.dispose();
    backend.dispose();
  }
}
/** RTree::traverseRay 의 잎 방문 순서(자르기 없이): 뿌리 쪽 스택에 N−1..0 순으로 넣고, 쪽마다 ptrs[0..3] 을 넣고 LIFO 로 꺼낸다 */
function dfsRank(pages: Uint8Array, nRoot: number, nt: number): Int32Array {
  const dv = new DataView(pages.buffer, pages.byteOffset, pages.byteLength);
  const rank = new Int32Array(nt).fill(-1);
  let r = 0;
  const stack: number[] = [];
  for (let j = nRoot - 1; j >= 0; j--) stack.push(j * 112);
  while (stack.length) {
    const top = stack.pop() as number;
    if (top & 1) {
      const data = top;
      const cnt = ((data >> 1) & 15) + 1;
      const base = data >>> 5;
      for (let i = 0; i < cnt; i++) rank[base + i] = r++;
      continue;
    }
    for (let i = 0; i < 4; i++) {
      const minx = dv.getFloat32(top + 4 * i, true);
      const maxx = dv.getFloat32(top + 48 + 4 * i, true);
      if (minx > maxx) continue;
      stack.push(dv.getUint32(top + 96 + 4 * i, true));
    }
  }
  return rank;
}

console.log('6) wasm→wasm import 경로(손으로 만든 모듈이 px.px_scene_raycast 를 import 해 부름) = JS 경로');
{
  const bytes = new Uint8Array(fs.readFileSync(apxPath(PLAZA_MAIN)));
  const { backend, world } = backendFor();
  const { shapes } = backend.loadApx(bytes, 2);
  world.createBody({ entity: { index: 1, generation: 1 }, motion: 0, pose: ID, shapes });
  const caller = new WebAssembly.Instance(new WebAssembly.Module(tinyCallerModule()), { px: { px_scene_raycast: px.x.px_scene_raycast } });
  const run = (caller.exports as unknown as { run(scene: number, all: number, max: number): number }).run;
  let same = 0;
  let total = 0;
  let hits = 0;
  for (let x = -16; x <= 16; x += 4)
    for (let z = -8; z <= 56; z += 8) {
      const set = (): void => {
        px.raycast(backend.scene, [x, 30, z], [0, -1, 0], 60, 0x423, 1 << 2, [0, 0], true, 32);
      };
      set();
      const nj = px.raycast(backend.scene, [x, 30, z], [0, -1, 0], 60, 0x423, 1 << 2, [0, 0], true, 32);
      const a = Buffer.from(px.u8.slice(px.hitsBase * 4, px.hitsBase * 4 + nj * 64));
      set();
      px.u8.fill(0, px.hitsBase * 4, px.hitsBase * 4 + 64 * 32);
      const nw = run(backend.scene, 1, 32);
      const b = Buffer.from(px.u8.slice(px.hitsBase * 4, px.hitsBase * 4 + nw * 64));
      total++;
      hits += nj;
      if (nj === nw && Buffer.compare(a, b) === 0) same++;
    }
  ok(same === total && hits > 0, `JS 경로와 wasm 경로 결과 바이트 같음 ${same}/${total}(hit ${hits})`);
  world.dispose();
  backend.dispose();
}
/** (module (import "px" "px_scene_raycast" (func (param i32 i32 i32) (result i32))) (func (export "run") (param i32 i32 i32) (result i32) local.get 0 local.get 1 local.get 2 call 0)) */
function tinyCallerModule(): Uint8Array<ArrayBuffer> {
  const str = (s: string): number[] => [s.length, ...Array.from(s, (c) => c.charCodeAt(0))];
  const sec = (id: number, body: number[]): number[] => [id, body.length, ...body];
  const type = [0x60, 3, 0x7f, 0x7f, 0x7f, 1, 0x7f];
  const body = [0, 0x20, 0, 0x20, 1, 0x20, 2, 0x10, 0, 0x0b];
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...sec(1, [1, ...type]),
    ...sec(2, [1, ...str('px'), ...str('px_scene_raycast'), 0x00, 0]),
    ...sec(3, [1, 0]),
    ...sec(7, [1, ...str('run'), 0x00, 1]),
    ...sec(10, [1, body.length, ...body]),
  ]);
}

console.log('7) collision 계약(가짜 백엔드)');
class FakeBackend implements CollisionBackend {
  log: string[] = [];
  next = 1;
  rayArgs: { hitFlags: number; mask: number; exclude: [number, number]; all: boolean; maxOut: number } | null = null;
  sweepGeom: SdkGeometry | null = null;
  sweepPose: number[] = [];
  hits: BackendHit[] = [];
  shapeFilters = new Map<number, number[]>();
  shapeFlags = new Map<number, number>();
  createBody(motion: number): number { this.log.push(`body ${motion}`); return this.next++; }
  releaseBody(b: number): void { this.log.push(`release ${b}`); }
  stage(b: number): void { this.log.push(`stage ${b}`); }
  unstage(b: number): void { this.log.push(`unstage ${b}`); }
  setBodyPose(b: number, _p: Pose, mode: string): void { this.log.push(`pose ${b} ${mode}`); }
  createShape(_b: number, _g: SdkGeometry, _l: Pose, filter: [number, number, number, number], _m: [number, number, number], flags: number): number {
    const id = 100 + this.next++;
    this.shapeFilters.set(id, [...filter]);
    this.shapeFlags.set(id, flags);
    return id;
  }
  setShapeFlags(s: number, f: number): void { this.shapeFlags.set(s, f); }
  setShapeFilter(s: number, f: [number, number, number, number]): void { this.shapeFilters.set(s, [...f]); }
  raycast(_o: Vec3, _d: Vec3, _dist: number, hitFlags: number, mask: number, exclude: [number, number], all: boolean, maxOut: number, out: BackendHit[]): number {
    this.rayArgs = { hitFlags, mask, exclude: [...exclude] as [number, number], all, maxOut };
    const k = Math.min(this.hits.length, all ? maxOut : 1);
    for (let i = 0; i < k; i++) Object.assign(out[i], this.hits[i]);
    return k;
  }
  sweep(g: SdkGeometry, p: Pose, _d: Vec3, _dist: number, hitFlags: number, mask: number, exclude: [number, number], all: boolean, maxOut: number, out: BackendHit[]): number {
    this.sweepGeom = { type: g.type, params: [...g.params], mesh: g.mesh };
    this.sweepPose = [...p];
    return this.raycast([0, 0, 0], [0, 0, 0], 0, hitFlags, mask, exclude, all, maxOut, out);
  }
  overlap(): number { return 0; }
  penetration(): boolean { return false; }
}
{
  const fb = new FakeBackend();
  const w = new CollisionWorld(fb);
  const body = w.createBody({ entity: { index: 7, generation: 3 }, motion: 0, pose: ID, shapes: [{ geometry: { kind: 'box', halfExtents: [1, 1, 1] }, layer: 2, tag: 'Wall' }] });
  const shape = w.bodyInfo(body)!.shapes[0];
  const bs = [...fb.shapeFilters.keys()][0];
  ok(JSON.stringify(fb.shapeFilters.get(bs)) === JSON.stringify([2, shape, 7, 3]), 'filter = [layer 번호, 셰이프, 엔티티 번호, 세대](원본 prefilter 가 word0·word2·word3 을 읽음)');
  const hit = (over: Partial<BackendHit>): BackendHit => ({ position: [1, 2, 3], normal: [0, 1, 0], distance: 0.5, flags: 0x403, faceIndex: 0xffffffff, shape: bs, ...over });
  fb.hits = [hit({})];
  const r = emptyResult();
  ok(w.castRay({ origin: [0, 0, 0], direction: [0, -1, 0], distance: 5, mask: 1 << 2, exclude: { index: 9, generation: 1 } }, r), 'castRay 성공');
  ok(fb.rayArgs!.hitFlags === 0x403 && fb.rayArgs!.mask === 4 && fb.rayArgs!.exclude[0] === 9 && fb.rayArgs!.exclude[1] === 1 && !fb.rayArgs!.all, '마스크 = 1<<layer 그대로·제외(번호, 세대)·block');
  ok(r.body === body && r.shape === shape && r.entity.index === 7 && r.entity.generation === 3 && r.tag === 'Wall' && r.validity === 0 && !r.initialOverlap, 'CastResult: Collision·Entity·Shape·tag·validity 0');
  fb.hits = [hit({ distance: 0 })];
  w.castRay({ origin: [0, 0, 0], direction: [0, -1, 0], distance: 5, mask: 4 }, r);
  ok(r.initialOverlap && r.distance === 0, 'distance 0 → initialOverlap');
  fb.hits = [hit({ distance: -0.2 })];
  w.castRay({ origin: [0, 0, 0], direction: [0, -1, 0], distance: 5, mask: 4 }, r);
  ok(r.initialOverlap && r.distance === -0.2, 'distance < 0(MTD) → initialOverlap·값 그대로');
  fb.hits = [hit({ flags: 0x402 })];
  w.castRay({ origin: [0, 0, 0], direction: [0, -1, 0], distance: 5, mask: 4 }, r);
  const v1 = r.validity;
  fb.hits = [hit({ normal: [NaN, 0, 0] })];
  w.castRay({ origin: [0, 0, 0], direction: [0, -1, 0], distance: 5, mask: 4 }, r);
  const v2 = r.validity;
  fb.hits = [hit({ position: [NaN, 0, 0], normal: [NaN, 0, 0] })];
  w.castRay({ origin: [0, 0, 0], direction: [0, -1, 0], distance: 5, mask: 4 }, r);
  ok(v1 === 4 && v2 === 2 && r.validity === 4, 'validity: ePOSITION 없음 4·법선 NaN 2·둘 다면 위치 먼저(4)', `${v1} ${v2} ${r.validity}`);
  fb.hits = [hit({ shape: 999 })];
  ok(!w.castRay({ origin: [0, 0, 0], direction: [0, -1, 0], distance: 5, mask: 4 }, r), '모르는 셰이프 hit → 실패(원본: Collision 없음)');
  // 캡슐 quarter-turn
  const sp: number[] = [];
  const g = toSdk({ kind: 'capsule', radius: 0.5, halfHeight: 0.25 }, ID, sp);
  const ax: number[] = [0, 0, 0];
  quatRotate(sp, 3, [1, 0, 0], ax, 0);
  ok(g.type === 2 && nearV(ax, [0, 1, 0], 1e-6) && sp[5] === Math.fround(Math.SQRT1_2) && sp[6] === Math.fround(Math.SQRT1_2), '엔진 Y축 캡슐 → SDK X축: 로컬 q·qZ(+90°), SDK X → 엔진 Y', fmt(ax));
  const g2 = toSdk({ kind: 'capsuleX', radius: 0.5, halfHeight: 0.25 }, ID, sp);
  ok(g2.type === 2 && sp[6] === 1, 'capsuleX(.apx 에 구운 셰이프)는 quarter-turn 을 더하지 않음');
  fb.hits = [hit({})];
  w.castShape({ shape: { geometry: { kind: 'capsule', radius: 0.4, halfHeight: 0.25 }, local: [0, 0.65, 0, 0, 0, 0, 1] }, position: [1, 2, 3], rotation: [0, 0, 0, 1], direction: [0, -1, 0], distance: 2, mask: 2, mtd: true }, r);
  ok(fb.rayArgs!.hitFlags === 0x603 && nearV(fb.sweepPose, [1, 2.65, 3], 1e-6) && fb.sweepGeom!.type === 2, 'CastShape: 질의 자세 × 형상 로컬 자세·eMTD 0x603', fmt(fb.sweepPose));
  const seg = capsuleFromSegment([0, 0.5, 0], [0, 1, 0], 0.5);
  ok(seg.geometry.kind === 'capsule' && seg.geometry.halfHeight === 0.25 && nearV(seg.local, [0, 0.75, 0], 0) && seg.local[6] === 1, 'SetSourceCapsule(a,b,r) → h = |b−a|/2·중심 (a+b)/2(기본 Adjust .75/.25)');
  // All + 정렬
  fb.hits = [0.7, 0.2, 0.2, 0.9, 0.2, 0.1].map((d, i) => hit({ distance: d, faceIndex: i }));
  const out: CastResult[] = [];
  const k0 = w.castRayAll({ origin: [0, 0, 0], direction: [0, -1, 0], distance: 5, mask: 4 }, out, 16);
  const unsorted = out.slice(0, k0).map((x) => x.faceIndex).join();
  const k1 = w.castRayAll({ origin: [0, 0, 0], direction: [0, -1, 0], distance: 5, mask: 4, sort: true }, out, 16);
  const sorted = out.slice(0, k1).map((x) => x.distance);
  ok(fb.rayArgs!.all && unsorted === '0,1,2,3,4,5' && sorted.every((d, i) => i === 0 || sorted[i - 1] <= d), 'CastRayAll: 정렬 없으면 백엔드 순서·+0x40 이면 거리 오름차순', `${unsorted} → ${out.slice(0, k1).map((x) => x.faceIndex).join()}`);
  // libc++ introsort: 오름차순 + 동점 순서 고정(원본과 같은 알고리즘이면 같은 순서)
  let seed = 12345;
  const rnd = (): number => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) / 65536;
  let allSorted = true;
  const sig: string[] = [];
  for (const len of [6, 17, 31, 64, 128, 1200]) {
    const arr = Array.from({ length: len }, (_, i) => ({ d: Math.floor(rnd() * 8) / 4, i }));
    libcxxSort(arr, len, (a, b) => a.d < b.d);
    for (let i = 1; i < len; i++) if (arr[i - 1].d > arr[i].d) allSorted = false;
    sig.push(crypto.createHash('sha1').update(arr.map((x) => x.i).join()).digest('hex').slice(0, 8));
  }
  ok(allSorted, 'libcxxSort 오름차순(길이 6·17·31·64·128·1200, 동점 많음)', sig.join(' '));
  const ties = Array.from({ length: 40 }, (_, i) => ({ d: i % 3, i }));
  libcxxSort(ties, 40, (a, b) => a.d < b.d);
  const stable = Array.from({ length: 40 }, (_, i) => ({ d: i % 3, i })).sort((a, b) => a.d - b.d);
  ok(ties.map((x) => x.i).join() !== stable.map((x) => x.i).join(), '동점 순서: libc++(원본) ≠ 안정 정렬(RULES_WEB) — 스위치가 결과를 바꾼다');
  // Map 평균
  const cs: MapContact[] = [
    { shape: 1, body: 1, entity: { index: 1, generation: 1 }, direction: [0, 1, 0], depth: 0.2, vector: [0, 0.2, 0] },
    { shape: 2, body: 1, entity: { index: 1, generation: 1 }, direction: [1, 0, 0], depth: 0.1, vector: [0.1, 0, 0] },
  ];
  const avg = resolveMapContacts(cs);
  ok(nearV(avg, [0.05, 0.1, 0], 1e-7), 'Map 보정 = adjusted 벡터 평균(합산·순차 push 아님)', fmt(avg));
  ok(RULES_ORIGINAL.mapCandidates === 16 && RULES_ORIGINAL.mapMinDepth === 0.01 && RULES_ORIGINAL.touchBuffer === 128 && RULES_ORIGINAL.allSort === 'libcxx' && RULES_WEB.allSort === 'stable', '원본 규칙 값(후보 16·depth .01·touch 128·libc++)');

  console.log('8) 수명(Stage/Unstage·enabled·세대·teleport)');
  fb.log = [];
  w.unstage(body);
  w.stage(body);
  w.syncPose(body, at(1, 0, 0));
  w.teleport(body, at(2, 0, 0));
  ok(fb.log.join('|') === 'unstage 1|stage 1|pose 1 set|pose 1 set', 'Static: syncPose = 자세 교체, teleport = set', fb.log.join('|'));
  const kin = w.createBody({ entity: { index: 8, generation: 1 }, motion: 1, pose: ID, shapes: [] });
  const dyn = w.createBody({ entity: { index: 9, generation: 1 }, motion: 2, pose: ID, shapes: [] });
  fb.log = [];
  w.syncPose(kin, at(1, 0, 0));
  w.syncPose(dyn, at(1, 0, 0));
  w.teleport(dyn, at(3, 0, 0));
  ok(/^pose (\d+) target\|pose (\d+) set$/.test(fb.log.join('|')) && fb.log[0].split(' ')[1] !== fb.log[1].split(' ')[1], 'Kinematic = 목표·Dynamic 일반 동기화는 덮어쓰지 않음·teleport 만 set', fb.log.join('|'));
  w.setShapeEnabled(shape, false);
  const offFlags = fb.shapeFlags.get(bs);
  w.setShapeEnabled(shape, true);
  ok(offFlags === (0x0b & ~3) && fb.shapeFlags.get(bs) === 0x0b, 'enabled off = simulation·scene query 비트 끔(원본 플래그 보존)');
  w.removeBody(body);
  ok(w.bodyInfo(body) === null && w.shapeDesc(shape) === null && fb.log.includes('release 1'), '제거 → 핸들 무효(세대)·백엔드 해제');
  const body2 = w.createBody({ entity: { index: 7, generation: 4 }, motion: 0, pose: ID, shapes: [] });
  ok(body2 !== body && (body2 & 0xffff) === (body & 0xffff) && w.bodyInfo(body) === null, '같은 칸 재사용 시 세대 증가 → 옛 핸들 계속 무효', `${body.toString(16)} → ${body2.toString(16)}`);
  w.dispose();
}

console.log('9) 통합(physx 백엔드): 레이어·제외·initialOverlap·MTD·All 정렬');
{
  const { backend, world } = backendFor();
  const wall = (x: number, layer: number, e: number): number =>
    world.createBody({ entity: { index: e, generation: 1 }, motion: 0, pose: at(x, 0, 0), shapes: [{ geometry: { kind: 'box', halfExtents: [0.5, 2, 2] }, layer, tag: `L${layer}` }] });
  const w1 = wall(3, 1, 11);
  const w2 = wall(6, 2, 12);
  const w3 = wall(9, 2, 13);
  const r = emptyResult();
  const ray = (mask: number, exclude?: { index: number; generation: number }): number => (world.castRay({ origin: [0, 0, 0], direction: [1, 0, 0], distance: 20, mask, exclude }, r) ? r.distance : -1);
  ok(ray(1 << 1) === 2.5 && ray(1 << 2) === 5.5 && ray(0x6) === 2.5 && ray(1 << 3) === -1, 'mask 2→레이어1(2.5)·4→레이어2(5.5)·0x6→가까운 것·8→없음');
  ok(ray(0x6, { index: 11, generation: 1 }) === 5.5 && ray(0x6, { index: 11, generation: 2 }) === 2.5, '제외 엔티티(번호·세대 둘 다 같을 때만)');
  ok(ray(4) === 5.5 && r.validity === 0 && nearV(r.normal, [-1, 0, 0], 1e-6) && r.tag === 'L2' && r.body === w2, 'CastResult 위치·법선·몸체·tag');
  world.unstage(w2);
  ok(ray(4) === 8.5, 'Unstage → 질의 제외');
  world.stage(w2);
  world.setShapeEnabled(world.bodyInfo(w2)!.shapes[0], false);
  ok(ray(4) === 8.5, 'enabled off → 질의 제외');
  world.setShapeEnabled(world.bodyInfo(w2)!.shapes[0], true);
  world.teleport(w3, at(4.5, 0, 0));
  ok(ray(4) === 4, 'Static teleport → 다음 질의에 새 자세');
  const out: CastResult[] = [];
  world.teleport(w3, at(9, 0, 0));
  const ka = world.castRayAll({ origin: [0, 0, 0], direction: [1, 0, 0], distance: 20, mask: 0x6, sort: true }, out, 8);
  ok(ka === 3 && out[0].distance === 2.5 && out[1].distance === 5.5 && out[2].distance === 8.5, 'CastRayAll(+0x40) 거리 정렬 3건', out.slice(0, ka).map((x) => x.distance).join());
  // sweep: 엔진 Y축 캡슐을 바닥으로
  const floor = world.createBody({ entity: { index: 20, generation: 1 }, motion: 0, pose: at(0, -1, 0), shapes: [{ geometry: { kind: 'box', halfExtents: [10, 1, 10] }, layer: 2 }] });
  const cap = { geometry: { kind: 'capsule' as const, radius: 0.5, halfHeight: 0.25 }, local: [0, 0.75, 0, 0, 0, 0, 1] as Pose, layer: 1 };
  ok(world.castShape({ shape: cap, position: [0, 3, -5], rotation: [0, 0, 0, 1], direction: [0, -1, 0], distance: 10, mask: 4 }, r) && near(r.distance, 3, 1e-4) && nearV(r.normal, [0, 1, 0], 1e-4),
    '엔진 캡슐(중심 .75·h .25·r .5) sweep → 바닥: 거리 3(발끝 y=3 → 0)', `${r.distance}`);
  ok(world.castShape({ shape: cap, position: [0, -0.2, -5], rotation: [0, 0, 0, 1], direction: [0, -1, 0], distance: 1, mask: 4 }, r) && r.initialOverlap && r.distance === 0 && nearV(r.normal, [0, 1, 0], 1e-6),
    '초기 겹침(기본 0x403): distance 0·initialOverlap·법선 −dir');
  ok(world.castShape({ shape: cap, position: [0, -0.2, -5], rotation: [0, 0, 0, 1], direction: [0, -1, 0], distance: 1, mask: 4, mtd: true }, r) && r.initialOverlap && near(r.distance, -0.2, 1e-4) && nearV(r.normal, [0, 1, 0], 1e-4),
    '초기 겹침(+0xE1 eMTD): distance −0.2·MTD 법선 +Y', `${r.distance} ${fmt(r.normal)}`);
  const contacts: MapContact[] = [];
  const kc = world.mapContacts({ kind: 'capsule', radius: 0.5, halfHeight: 0.25 }, at(2.9, 0.6, 0), 0x6, null, contacts);
  const avg = resolveMapContacts(contacts);
  ok(kc === 2 && contacts.every((c) => c.depth > 0.01) && avg[0] < 0 && avg[1] > 0, 'Map 접촉: 벽(레이어1)+바닥 2건·depth > .01·평균 벡터(−X·+Y)', `${kc} ${fmt(avg)}`);
  const p: Penetration = { direction: [0, 0, 0], depth: 0 };
  ok(world.penetration({ kind: 'sphere', radius: 1 }, at(0, 0.5, 0), world.bodyInfo(floor)!.shapes[0], p) && near(p.depth, 0.5, 1e-4) && nearV(p.direction, [0, 1, 0], 1e-4), 'penetration 구 r1 vs 바닥: .5·+Y');
  void w1;
  world.dispose();
  backend.dispose();
}

console.log('10) 원본 충돌 에셋 로드·질의(광장·mg0122·mg0101)');
interface PhysicsSet { entities: { name: string; tag: string | null; layer: number | null; pos: number[]; quat: number[]; apx: string }[] }
const loadSet = (dir: string, backend: PhysxCollisionBackend, world: CollisionWorld): { bodies: number[]; tris: number } => {
  const set = JSON.parse(fs.readFileSync(path.join(ASSETS, dir, 'physics.json'), 'utf8')) as PhysicsSet;
  const bodies: number[] = [];
  let tris = 0;
  set.entities.forEach((e, i) => {
    const { shapes, collection } = backend.loadApx(new Uint8Array(fs.readFileSync(path.join(ASSETS, dir, e.apx))), e.layer ?? 0, e.tag ?? e.name);
    for (const m of collection.meshes.values()) if (m.kind === 'trimesh') tris += m.nbTriangles;
    bodies.push(world.createBody({ entity: { index: i + 1, generation: 1 }, motion: 0, pose: [e.pos[0], e.pos[1], e.pos[2], e.quat[0], e.quat[1], e.quat[2], e.quat[3]], shapes }));
  });
  return { bodies, tris };
};
for (const [dir, mask, origin] of [['plaza/world/physics', 1 << 2, [0, 30, 10]], ['mg/mg0122/physics', 1 << 14, [0, 30, 0]], ['mg/mg0101/physics', 1 << 2, [0, 30, 0]]] as const) {
  const { backend, world } = backendFor();
  const { bodies, tris } = loadSet(dir, backend, world);
  let hits = 0;
  let rays = 0;
  const r = emptyResult();
  for (let x = -20; x <= 20; x += 2)
    for (let z = -20; z <= 60; z += 2) {
      rays++;
      if (world.castRay({ origin: [origin[0] + x, origin[1], z], direction: [0, -1, 0], distance: 100, mask }, r) && r.validity === 0) hits++;
    }
  const sw = world.castShape({ shape: { geometry: { kind: 'capsule', radius: 0.5, halfHeight: 0.25 }, local: [0, 0.75, 0, 0, 0, 0, 1] }, position: [origin[0], origin[1], origin[2]], rotation: [0, 0, 0, 1], direction: [0, -1, 0], distance: 100, mask }, r);
  ok(bodies.length > 0 && hits > 0 && sw && r.validity === 0, `${dir}: 몸체 ${bodies.length}·삼각형 ${tris}·광선 ${hits}/${rays} hit·캡슐 sweep 거리 ${r.distance.toFixed(4)}`);
  world.dispose();
  backend.dispose();
}

console.log('11) 결정성(같은 입력 두 번·새 인스턴스 → 같은 해시)');
const runBatch = (p: Physx): string => {
  const backend = new PhysxCollisionBackend(p);
  const world = new CollisionWorld(backend);
  loadSet('plaza/world/physics', backend, world);
  const h = crypto.createHash('sha256');
  const r = emptyResult();
  const out: CastResult[] = [];
  const buf = new Float64Array(8);
  for (let x = -24; x <= 24; x += 1.5)
    for (let z = -8; z <= 58; z += 1.5) {
      const ok1 = world.castRay({ origin: [x, 25, z], direction: [0, -1, 0], distance: 60, mask: 4 }, r);
      buf.set([+ok1, r.distance, ...r.position, ...r.normal]);
      h.update(new Uint8Array(buf.buffer));
      const k = world.castRayAll({ origin: [x, 25, z], direction: [0, -1, 0], distance: 60, mask: 4, meshMultiple: true, sort: true }, out, 32);
      for (let i = 0; i < k; i++) h.update(`${out[i].distance},${out[i].faceIndex};`);
      const ks = world.castShape({ shape: { geometry: { kind: 'capsule', radius: 0.4, halfHeight: 0.25 }, local: [0, 0.65, 0, 0, 0, 0, 1] }, position: [x, 2, z], rotation: [0, 0, 0, 1], direction: [1, 0, 0], distance: 3, mask: 4, mtd: true }, r);
      buf.set([+ks, r.distance, ...r.position, ...r.normal]);
      h.update(new Uint8Array(buf.buffer));
    }
  world.dispose();
  backend.dispose();
  return h.digest('hex');
};
{
  const a = runBatch(px);
  const b = runBatch(px);
  const px2 = await createPhysx(WASM);
  const c = runBatch(px2);
  ok(a === b && b === c, '광장 질의 묶음 해시 같음(같은 인스턴스 두 번·새 인스턴스)', a.slice(0, 16));
}

console.log('12) import 경계·할당');
{
  const read = (p: string): string => fs.readFileSync(path.join(WEB, p), 'utf8');
  const imps = (s: string): string[] => [...new Set([...s.matchAll(/^(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]))].sort();
  const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  ok(JSON.stringify(imps(read('script/game/lib/physx/index.ts'))) === '["./apx"]' && imps(read('script/game/lib/physx/apx.ts')).length === 0, 'physx 바인딩 import 0(자기 apx 만)');
  ok(imps(read('script/game/lib/collision/index.ts')).length === 0, 'collision 코어 import 0');
  ok(JSON.stringify(imps(read('script/game/lib/collision-physx/index.ts'))) === '["../collision","../physx"]', 'collision-physx = ../collision + ../physx 만');
  ok(JSON.stringify(imps(read('script/game/lib/collision-three/index.ts'))) === '["../collision","three"]', 'collision-three = three + ../collision 만');
  const banned = /\b(THREE|document|window|Math\.random|performance\.now|Date\.now)\b/;
  ok(!banned.test(strip(read('script/game/lib/collision/index.ts'))) && !banned.test(strip(read('script/game/lib/physx/index.ts'))) && !banned.test(strip(read('script/game/lib/physx/apx.ts'))), '코어·바인딩에 three·DOM·Math.random·벽시계 없음');
  const shim = read('script/game/lib/physx/native/shim/px_shim.cpp');
  ok(/clock_gettime[\s\S]*tv_sec = 0/.test(shim) && !/pthread_create|std::thread/.test(shim), 'shim: 시계 0 고정·스레드 없음');
  const lic = read('script/game/lib/physx/LICENSE.md');
  ok(/NVIDIA CORPORATION/.test(lic) && /Redistribution and use in source and binary forms/.test(lic), 'physx/LICENSE.md(BSD-3 원문)');
  const exportsList = (WebAssembly.Module.exports(new WebAssembly.Module(WASM)).map((e) => e.name).filter((e) => e.startsWith('px_')));
  const bound = [...read('script/game/lib/physx/index.ts').matchAll(/^\s+(px_[a-z0-9_]+)\(/gm)].map((m) => m[1]);
  ok(exportsList.every((e) => bound.includes(e)) && bound.every((b) => exportsList.includes(b)), `PhysxExports 형식 = wasm px_* export ${exportsList.length}개(숨은 함수 없음)`);
  // 할당: 깨끗한 자식 프로세스에서(이 파일의 앞 시험들이 같은 함수에 여러 모양의 인자를 넘겨 다형 상태가 되므로)
  const r = JSON.parse(execFileSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--alloc-child'], { encoding: 'utf8' }).trim().split(String.fromCharCode(10)).pop() as string) as { med: number; chunks: number };
  ok(r.chunks >= 5 && r.med <= 1024, `castRay+castShape 4,000회 구간 new space 증가 중앙값 ${r.med} B(≤ 1 KiB, 질의당 할당 0 — 새 프로세스)`, `${r.chunks}구간`);
}

console.log('13) 광장 MeshCollider 대비(지면 높이, 보고용 — 광장 코드는 바꾸지 않음)');
{
  const col = JSON.parse(fs.readFileSync(path.join(ASSETS, 'plaza/world/collision.json'), 'utf8')) as Record<string, MeshColliderData>;
  const mc = new MeshCollider(col.CollisionMain);
  const backend = new PhysxCollisionBackend(px);
  const world = new CollisionWorld(backend);
  const { shapes } = backend.loadApx(new Uint8Array(fs.readFileSync(apxPath(PLAZA_MAIN))), 2, 'CollisionMain');
  world.createBody({ entity: { index: 1, generation: 1 }, motion: 0, pose: ID, shapes });
  const r = emptyResult();
  let both = 0, onlyMc = 0, onlyPx = 0, none = 0, maxDy = 0, sumDy = 0, normalDiff = 0, steep = 0, bigDy = 0, bigDyExplained = 0;
  for (let x = -28; x <= 28; x += 0.5)
    for (let z = -11; z <= 61; z += 0.5) {
      const g = mc.groundHeight(x, z, 20);
      const hit = world.castRay({ origin: [x, 20.5, z], direction: [0, -1, 0], distance: 100, mask: 4 }, r) && r.validity === 0;
      if (g && hit) {
        both++;
        const dy = Math.abs(g.y - r.position[1]);
        if (dy > 1e-3) {
          bigDy++;
          if (r.normal[1] <= 0.05) bigDyExplained++;
        }
        maxDy = Math.max(maxDy, dy);
        sumDy += dy;
        const dn = 1 - (g.normal.x * r.normal[0] + g.normal.y * r.normal[1] + g.normal.z * r.normal[2]);
        if (dn > 1e-4) normalDiff++;
        if (r.normal[1] < 0.707) steep++;
      } else if (g) onlyMc++;
      else if (hit) onlyPx++;
      else none++;
    }
  const total = both + onlyMc + onlyPx + none;
  console.log(`     격자 ${total}점(0.5 m): 둘 다 ${both}, MeshCollider 만 ${onlyMc}, PhysX 만 ${onlyPx}, 둘 다 없음 ${none}`);
  console.log(`     높이 차 최대 ${maxDy.toExponential(2)} m, 평균 ${(sumDy / Math.max(1, both)).toExponential(2)} m, 1 mm 넘는 점 ${bigDy}(그중 PhysX 면 법선 y ≤ .05 = MeshCollider 가 지면에서 빼는 면 ${bigDyExplained}), 법선 차(1−cos > 1e-4) ${normalDiff}, 원본 접지 법선 기준(y < .707) 미달 ${steep}`);
  ok(both > 0 && onlyMc === 0 && onlyPx === 0 && bigDy === bigDyExplained, '같은 메시: hit 여부 같음·1 mm 넘는 차이는 전부 거의 수직 면(MeshCollider UP_MIN .05 규칙)', `${both}점 중 ${bigDy}`);
  world.dispose();
  backend.dispose();
}

console.log(`\n${n - bad}/${n} 통과`);
if (bad) process.exit(1);
