/**
 * 광장 "처음 보이는 것" 목록 빌드 도구(노드, 헤드리스 없음) — docs/engine/loader_manager.md §6.1·§11.5.
 *
 * 소스 glb(web/assets/plaza/world/model, 비압축)를 읽어 노드 계층·부착(hookKey/hookNode — world.ts 처럼 node.add, 배율 상속)·스킨(쉬는 자세:
 * 관절 월드 × 역바인드)으로 월드 삼각형을 만들고, 시작 카메라들에서 CPU 깊이 버퍼에 물체 번호로 그려 픽셀이 있는 레이아웃 항목을 뽑는다.
 * - 시작 카메라: 1P 시작 소켓 pc_plaza_balloon_pos_p{1..4}_pc00(player.ts 시작 규칙) 마다 MenuCameraFollow(camera.ts 그대로)를 1·10·30·60·120 프레임
 *   돌린 자세의 합집합. 16:9, 화각 여유 10%.
 * - 가림(보수적 — 목록이 넓어지는 쪽): 불투명 재질의 앞면만 깊이를 쓴다. 반투명·더하기·곱하기·알파 마스크 재질, 뒷면, 장식 항목(보임 규칙이 있는 것 —
 *   같은 자리 변형끼리 서로 가리지 않게)은 깊이를 쓰지 않고 검사만 한다.
 * - 출력 assets/plaza/world/plaza_first.json { v, first, hosts, bounds{key: [cx,cy,cz,r]}, start, tex{모델: glb 가 참조하는 png}, cameras } — 장식 보임 규칙은 실행 때(world.ts) 필터.
 *   hosts = 다른 항목이 붙는 부모 + 로케이터(AttachLocater*: 부품들이 생성 때 소켓을 찾음).
 *
 *   npx tsx tools/plaza_first.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MenuCameraFollow } from '../script/shell/plaza/camera';
import { decoIdOfKey } from '../script/shell/plaza/deco';
import type { PlazaCameraParam, PlazaLayoutEntry } from '../script/shell/plaza/types';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const W = join(WEB, 'assets', 'plaza', 'world');
const OUT = join(W, 'plaza_first.json');
const RES_W = 480;
const RES_H = 270;
const FOV_MARGIN = 1.1;
const FRAMES = [1, 10, 30, 60, 120];
const PLAYERS = [1, 2, 3, 4];

interface Manifest {
  models: Record<string, { url: string }>;
  plaza: { layout: PlazaLayoutEntry[]; extraLayout?: PlazaLayoutEntry[]; cameraParam: PlazaCameraParam };
}
const man = JSON.parse(readFileSync(join(W, 'manifest.json'), 'utf-8')) as Manifest;
const entries = [...man.plaza.layout, ...(man.plaza.extraLayout ?? [])].filter((e) => e.dir === 'model' && man.models[e.fmdb]);
const byKey = new Map(entries.map((e) => [e.key, e]));

// ---------------------------------------------------------------- glb 읽기

interface Gltf {
  json: {
    nodes?: { name?: string; children?: number[]; mesh?: number; skin?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
    scenes?: { nodes: number[] }[];
    scene?: number;
    meshes?: { primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }[] }[];
    skins?: { joints: number[]; inverseBindMatrices?: number }[];
    materials?: { alphaMode?: string; extras?: { fres?: { visible?: boolean; shader?: { options?: Record<string, string> } } } }[];
    accessors: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }[];
    bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
  };
  bin: Buffer;
}

function readGlb(file: string): Gltf {
  const b = readFileSync(file);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString()) as Gltf['json'];
  const bo = 20 + jl;
  const bl = b.readUInt32LE(bo);
  return { json, bin: b.subarray(bo + 8, bo + 8 + bl) };
}

const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const CSIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function accessor(g: Gltf, i: number): Float64Array {
  const a = g.json.accessors[i];
  const n = NCOMP[a.type];
  const out = new Float64Array(a.count * n);
  if (a.bufferView === undefined) return out;
  const bv = g.json.bufferViews[a.bufferView];
  const cs = CSIZE[a.componentType];
  const stride = bv.byteStride ?? cs * n;
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  for (let k = 0; k < a.count; k++) {
    for (let c = 0; c < n; c++) {
      const o = base + k * stride + c * cs;
      let v: number;
      switch (a.componentType) {
        case 5126:
          v = dv.getFloat32(o, true);
          break;
        case 5125:
          v = dv.getUint32(o, true);
          break;
        case 5123:
          v = dv.getUint16(o, true);
          if (a.normalized) v /= 65535;
          break;
        case 5122:
          v = dv.getInt16(o, true);
          if (a.normalized) v = Math.max(v / 32767, -1);
          break;
        case 5121:
          v = dv.getUint8(o);
          if (a.normalized) v /= 255;
          break;
        default:
          v = dv.getInt8(o);
          if (a.normalized) v = Math.max(v / 127, -1);
      }
      out[k * n + c] = v;
    }
  }
  return out;
}

function localMatrix(n: NonNullable<Gltf['json']['nodes']>[number]): THREE.Matrix4 {
  if (n.matrix) return new THREE.Matrix4().fromArray(n.matrix);
  const t = n.translation ?? [0, 0, 0];
  const r = n.rotation ?? [0, 0, 0, 1];
  const s = n.scale ?? [1, 1, 1];
  return new THREE.Matrix4().compose(new THREE.Vector3(t[0], t[1], t[2]), new THREE.Quaternion(r[0], r[1], r[2], r[3]), new THREE.Vector3(s[0], s[1], s[2]));
}

/** 모델 뿌리(월드 행렬 root) 아래 노드 월드 행렬(이름 → 행렬)과 삼각형(월드 좌표) */
interface Built {
  nodeWorld: Map<string, THREE.Matrix4>;
  /** [x0,y0,z0,x1,…] 삼각형 3 정점씩 */
  tris: Float32Array;
  /** 삼각형별 가림 가능(불투명 재질) */
  opaque: Uint8Array;
}

const glbCache = new Map<string, Gltf>();

function build(fmdb: string, root: THREE.Matrix4): Built {
  const url = man.models[fmdb].url;
  let g = glbCache.get(url);
  if (!g) glbCache.set(url, (g = readGlb(join(W, url))));
  const nodes = g.json.nodes ?? [];
  const world: THREE.Matrix4[] = new Array(nodes.length);
  const walk = (i: number, parent: THREE.Matrix4): void => {
    world[i] = parent.clone().multiply(localMatrix(nodes[i]));
    for (const c of nodes[i].children ?? []) walk(c, world[i]);
  };
  for (const r of g.json.scenes?.[g.json.scene ?? 0]?.nodes ?? []) walk(r, root);
  const nodeWorld = new Map<string, THREE.Matrix4>();
  nodes.forEach((n, i) => n.name && world[i] && !nodeWorld.has(n.name) && nodeWorld.set(n.name, world[i]));
  const tris: number[] = [];
  const opq: number[] = [];
  const v = new THREE.Vector3();
  const acc = new THREE.Vector3();
  nodes.forEach((n, ni) => {
    if (n.mesh === undefined || !world[ni]) return;
    const mesh = g!.json.meshes![n.mesh];
    let jm: THREE.Matrix4[] | null = null;
    if (n.skin !== undefined) {
      const sk = g!.json.skins![n.skin];
      const ibm = sk.inverseBindMatrices !== undefined ? accessor(g!, sk.inverseBindMatrices) : null;
      jm = sk.joints.map((j, k) => (world[j] ?? root).clone().multiply(ibm ? new THREE.Matrix4().fromArray(Array.from(ibm.subarray(k * 16, k * 16 + 16))) : new THREE.Matrix4()));
    }
    for (const p of mesh.primitives) {
      if ((p.mode ?? 4) !== 4) continue;
      const mat = p.material !== undefined ? g!.json.materials?.[p.material] : undefined;
      const fres = mat?.extras?.fres;
      if (fres?.visible === false) continue;
      const o = fres?.shader?.options ?? {};
      const opaque = (mat?.alphaMode ?? 'OPAQUE') === 'OPAQUE' && !['1', '2', '4'].includes(o.static_opt_state_type ?? '0') && o.static_opt_punchthrough !== '1' && o.refraction_enable !== '1' ? 1 : 0;
      const pos = accessor(g!, p.attributes.POSITION);
      const cnt = pos.length / 3;
      const wp = new Float32Array(cnt * 3);
      const J = jm && p.attributes.JOINTS_0 !== undefined ? accessor(g!, p.attributes.JOINTS_0) : null;
      const Wt = jm && p.attributes.WEIGHTS_0 !== undefined ? accessor(g!, p.attributes.WEIGHTS_0) : null;
      for (let k = 0; k < cnt; k++) {
        if (jm && J && Wt) {
          acc.set(0, 0, 0);
          let ws = 0;
          for (let c = 0; c < 4; c++) {
            const w = Wt[k * 4 + c];
            if (!w) continue;
            v.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]).applyMatrix4(jm[J[k * 4 + c]] ?? root);
            acc.addScaledVector(v, w);
            ws += w;
          }
          if (ws > 0) acc.multiplyScalar(1 / ws);
          else acc.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]).applyMatrix4(world[ni]);
        } else acc.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]).applyMatrix4(world[ni]);
        wp[k * 3] = acc.x;
        wp[k * 3 + 1] = acc.y;
        wp[k * 3 + 2] = acc.z;
      }
      const idx = p.indices !== undefined ? accessor(g!, p.indices) : Float64Array.from({ length: cnt }, (_, i) => i);
      for (let t = 0; t + 2 < idx.length; t += 3) {
        for (let c = 0; c < 3; c++) {
          const q = idx[t + c] * 3;
          tris.push(wp[q], wp[q + 1], wp[q + 2]);
        }
        opq.push(opaque);
      }
    }
  });
  return { nodeWorld, tris: Float32Array.from(tris), opaque: Uint8Array.from(opq) };
}

// ---------------------------------------------------------------- 장면 조립(부모 먼저)

const built = new Map<string, Built>();
const rootOf = (e: PlazaLayoutEntry): THREE.Matrix4 => {
  if (!e.hookKey) return new THREE.Matrix4();
  const h = byKey.get(e.hookKey);
  if (!h) return new THREE.Matrix4();
  const hb = get(h);
  const m = hb.nodeWorld.get(e.hookNode);
  if (!m) console.warn(`부착 소켓 없음 ${e.key} → ${e.hookKey}/${e.hookNode}`);
  return m ? m.clone() : new THREE.Matrix4();
};
function get(e: PlazaLayoutEntry): Built {
  let b = built.get(e.key);
  if (!b) built.set(e.key, (b = build(e.fmdb, rootOf(e))));
  return b;
}
for (const e of entries) get(e);

const bounds: Record<string, [number, number, number, number]> = {};
for (const e of entries) {
  const t = built.get(e.key)!.tris;
  if (!t.length) continue;
  const box = new THREE.Box3();
  for (let i = 0; i < t.length; i += 3) box.expandByPoint(new THREE.Vector3(t[i], t[i + 1], t[i + 2]));
  const s = box.getBoundingSphere(new THREE.Sphere());
  bounds[e.key] = [+s.center.x.toFixed(3), +s.center.y.toFixed(3), +s.center.z.toFixed(3), +s.radius.toFixed(3)];
}

// ---------------------------------------------------------------- 시작 카메라

const loc = built.get('AttachLocater')?.nodeWorld;
if (!loc) throw new Error('AttachLocater 로케이터가 없다');
const posOf = (n: string): THREE.Vector3 | null => {
  const m = loc.get(n);
  return m ? new THREE.Vector3().setFromMatrixPosition(m) : null;
};
const camera00 = posOf('camera00_pos')!;
const charDefault = posOf('char_plaza_default_pos')!;
const balloon = posOf('balloon_pos')!;
const views: { p: number; frame: number; eye: number[]; at: number[]; fovy: number; m: THREE.Matrix4 }[] = [];
let start: THREE.Vector3 | null = null;
for (const p of PLAYERS) {
  const sp = posOf(`pc_plaza_balloon_pos_p${p}_pc00`) ?? posOf('char_start_pos');
  if (!sp) continue;
  if (p === 1) start = sp.clone();
  const follow = new MenuCameraFollow(man.plaza.cameraParam, camera00.clone(), charDefault.clone(), balloon.clone());
  const cam = new THREE.PerspectiveCamera(45, 16 / 9, 1, 2000);
  for (let f = 1; f <= FRAMES[FRAMES.length - 1]; f++) {
    const pose = follow.step(sp, cam);
    if (!FRAMES.includes(f)) continue;
    const c = new THREE.PerspectiveCamera((2 * Math.atan(Math.tan(((pose.fovy * Math.PI) / 180) / 2) * FOV_MARGIN) * 180) / Math.PI, 16 / 9, 1, 2000);
    c.position.copy(pose.eye);
    c.lookAt(pose.at);
    c.updateMatrixWorld();
    c.updateProjectionMatrix();
    views.push({ p, frame: f, eye: pose.eye.toArray().map((x) => +x.toFixed(3)), at: pose.at.toArray().map((x) => +x.toFixed(3)), fovy: pose.fovy, m: new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse) });
  }
}

// ---------------------------------------------------------------- CPU 깊이 버퍼

const depth = new Float32Array(RES_W * RES_H);
const ids = new Int32Array(RES_W * RES_H);
const seen = new Set<string>();
const isDeco = (e: PlazaLayoutEntry): boolean => decoIdOfKey(e.key) !== undefined || /^bd0[236]Obj(_lock)?$/.test(e.key);

function clipTri(m: Float64Array, t: Float32Array, i: number, out: number[][]): number {
  const v: number[][] = [];
  for (let c = 0; c < 3; c++) {
    const x = t[i + c * 3];
    const y = t[i + c * 3 + 1];
    const z = t[i + c * 3 + 2];
    v.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]]);
  }
  out.length = 0;
  for (let k = 0; k < 3; k++) {
    const a = v[k];
    const b = v[(k + 1) % 3];
    const da = a[2] + a[3];
    const db = b[2] + b[3];
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const s = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s]);
    }
  }
  return out.length;
}

/** 삼각형 하나(화면 좌표) 칠하기. write = 깊이 쓰기, 돌려주는 값 = 깊이 검사를 통과한 픽셀이 있었는지 */
function raster(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, id: number, write: boolean): boolean {
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (area === 0) return false;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const x1 = Math.min(RES_W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const y1 = Math.min(RES_H - 1, Math.ceil(Math.max(ay, by, cy)));
  let hit = false;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * az + w1 * bz + w2 * cz;
      if (z < -1 || z > 1) continue;
      const o = y * RES_W + x;
      if (z >= depth[o]) continue;
      hit = true;
      if (write) {
        depth[o] = z;
        ids[o] = id;
      }
    }
  }
  return hit;
}

const keys = entries.map((e) => e.key);
const poly: number[][] = [];
for (const view of views) {
  depth.fill(Infinity);
  ids.fill(-1);
  const m = Float64Array.from(view.m.elements);
  for (const pass of [0, 1]) {
    entries.forEach((e, id) => {
      const b = built.get(e.key)!;
      const deco = isDeco(e);
      for (let t = 0, ti = 0; t < b.tris.length; t += 9, ti++) {
        const n = clipTri(m, b.tris, t, poly);
        if (n < 3) continue;
        const s = poly.map((q) => [((q[0] / q[3]) * 0.5 + 0.5) * RES_W, (1 - ((q[1] / q[3]) * 0.5 + 0.5)) * RES_H, q[2] / q[3]]);
        const front = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[1][1] - s[0][1]) * (s[2][0] - s[0][0]) < 0;
        const occ = !deco && b.opaque[ti] === 1 && front;
        if (pass === 0 && !occ) continue;
        for (let k = 1; k + 1 < s.length; k++) {
          const hit = raster(s[0][0], s[0][1], s[0][2], s[k][0], s[k][1], s[k][2], s[k + 1][0], s[k + 1][1], s[k + 1][2], id, pass === 0);
          if (pass === 1 && hit) seen.add(e.key);
        }
      }
    });
  }
  for (let o = 0; o < ids.length; o++) if (ids[o] >= 0) seen.add(keys[ids[o]]);
}

const hosts = new Set<string>(entries.filter((e) => /^AttachLocater/.test(e.key)).map((e) => e.key));
for (const e of entries) if (e.hookKey && byKey.has(e.hookKey)) hosts.add(e.hookKey);
const first = keys.filter((k) => seen.has(k));
const tex: Record<string, string[]> = {};
for (const e of entries) {
  const g = glbCache.get(man.models[e.fmdb].url);
  const imgs = ((g?.json as { images?: { uri?: string }[] } | undefined)?.images ?? []).map((i) => (i.uri ?? '').split('/').pop() ?? '').filter((f) => /\.png$/i.test(f));
  tex[e.fmdb] = [...new Set(imgs)];
}
const out = {
  v: 1,
  source: 'tools/plaza_first.ts (CPU 깊이 버퍼, loader_manager.md §11.5)',
  first,
  hosts: [...hosts],
  start: start ? start.toArray().map((x) => +x.toFixed(3)) : [0, -2.365, 22.316],
  bounds,
  tex,
  cameras: views.map((v) => ({ p: v.p, frame: v.frame, eye: v.eye, at: v.at, fovy: v.fovy })),
};
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`처음 보이는 것 ${first.length}/${entries.length}, 로케이터·부모 ${hosts.size}, 카메라 ${views.length} → ${OUT.slice(WEB.length + 1)}`);
console.log(first.join(' '));
