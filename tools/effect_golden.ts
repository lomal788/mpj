/**
 * 이펙트 런타임 이전 골든(노드, WebGL·헤드리스 없음) — docs/engine/08_effects.md §14.6.
 * mg1801 EffectSystem(view/effects.ts)을 같은 조건으로 돌려 틱마다 장면 그룹의 입자 배치 메시를 읽고
 * 입자(월드 위치·크기·회전·색0·색1·나이·수명·UV 난수) 집합·그리기 순서와 그리기 상태(blend·depth·cull·renderOrder·defines·uniform·텍스처)를 sha1 한 줄로 남긴다.
 * 이전 전 코드(입자 상태를 GPU 속성으로 올리고 셰이더가 나이로 계산)는 그 정점 셰이더 식을 여기서 그대로 계산해 같은 기록 형식으로 만든다.
 *   npx tsx tools/effect_golden.ts [출력 폴더] [full] [시나리오]   (full = 틱마다 원문도 남김)
 *   GOLDEN_RULES=web  → 코어 effectDefaults.rules = RULES_WEB(이전 전 기록 GOLDEN_SHA256_WEB 과 같아야 한다)
 *   MPJ_WEB=<web 폴더> → 에셋 위치(이전 전 코드 트리를 스크래치에 재구성해 돌릴 때)
 * 노드 환경: 텍스처 = 이름만 있는 THREE.Texture, glb = GLTFLoader.parse, 카메라 view = 고정(mg1801 비슷한 위치, 원본 깊이 정렬용).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectSystem } from '@app/minigame/mg1801/view/effects';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = process.env.MPJ_WEB ? path.resolve(process.env.MPJ_WEB) : HERE;

/** 이전 전(2026-10-09, 공용 이펙트 런타임 도입 전 코드 트리로 이 도구를 돌린) 기록의 sha256 — 지금은 RULES_WEB 실행과 비교 */
export const GOLDEN_SHA256_WEB: Record<string, string> = {
  steam00: '3f81a2c519c5c077c10aa1f3c3ab62a2be97550f817cc89f29fe1f79b09991d7',
  steam01: '747edbe001f744bff66b61f280c45dbae46f7ebaf00e1534d66d60b7109b60e1',
  water_entry00: '578552d0959aa52eace565a7a7a5d67114cbd0e48077bc143ad1daef6107785f',
  water_entry01: 'f1c9797eb25bc64f6c002d834d6a2d0ad24507ed1f76b58da9b0ecb2974dda25',
  success00: '18d68f621ccf34614a96cd246a2e6a8086bd2e9fa8d066d70ce87ac49db3be30',
  success01: '324c39c808c4e0e50e4e045a009405ce9a48ed401c45d3dd48d39ddfa9eb2c03',
  pt_effect: 'fdec2c7fe36d7d668dd9f0f103ec4d679131c42c3604e00045bb2b753319a66c',
  common_success: '14a097afac84d30cdc624cb69c8a6ce6ec5c6cb181d09ba55224a67f8aeee0fb',
  mix: '91b6c2fa8382f40f59f7f7cde940ec5353750d492288c3714ef9ed335b8f906b',
};

/** 원본 규칙(기본) 기준 — 2026-10-09 RULES_ORIGINAL 로 돌린 기록 */
export const GOLDEN_SHA256: Record<string, string> = {
  steam00: 'adb46afea9cfff6ee64de4c96902e46a598d2809de9557a4defdba9051c4992e',
  steam01: '05bb18a86d3ea3c327fc78681efb7069d451a7912f4be979d2b07b616d2a974c',
  water_entry00: '10c82eab36dae3dcc51688592e2dc321a2fe8978f23d7f7a7a47cb40055a8e43',
  water_entry01: '749df3b33a6971a0d2b40e89aa9d930b92f907ed95f2de48b50686d5beec3a08',
  success00: '4869e204faeaeeddf2910212bca3f05184b7fb459c341419333dfc734481baa0',
  success01: 'a7f0002b9e9843df6820b63af20d278fb5420858c86415d65c98767ded71fa36',
  pt_effect: '41937f24f7a1b2259c668a17d4488823f7c997351fbc7b57c97b44b36ae10b63',
  common_success: '6249538706a66be6b18aa878c182cedae28e81e522e00dadaf235bb5d804baf4',
  mix: 'a70e09f95377112a2564bc9f8c78d8b080bd353526c254268a7ace5e863a8be7',
};

const f = (x: number): string => {
  const v = Math.fround(x);
  return Object.is(v, -0) ? '0' : String(v);
};

/* ---------- 노드 환경 ---------- */
function fakeAssets(dir: string): Any {
  const cache = new Map<string, Promise<unknown>>();
  const file = (p: string): string => path.join(WEB, 'assets', dir, p);
  return {
    url: (p: string) => `${dir}${p}`,
    texture: (p: string) => new THREE.TextureLoader().loadAsync(`${dir}${p}`),
    json: (p: string) => {
      const k = `json:${p}`;
      if (!cache.has(k)) cache.set(k, Promise.resolve(JSON.parse(fs.readFileSync(file(p), 'utf8'))));
      return cache.get(k);
    },
    gltf: (p: string) => {
      const k = `gltf:${p}`;
      if (!cache.has(k)) {
        const b = fs.readFileSync(file(p));
        const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
        cache.set(k, new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej)));
      }
      return cache.get(k);
    },
    dispose: () => undefined,
  };
}

let installed = false;
function install(): void {
  if (installed) return;
  installed = true;
  THREE.TextureLoader.prototype.loadAsync = function (u: string) {
    const t = new THREE.Texture();
    t.name = String(u).replace(/^.*\/tex\//, '');
    return Promise.resolve(t);
  } as Any;
}

/** 고정 카메라(mg1801 비슷한 위치) view 행렬 */
function viewMatrix(): THREE.Matrix4 {
  const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  cam.position.set(0, 6.5, 11);
  cam.lookAt(0, 0.5, 0);
  cam.updateMatrixWorld(true);
  return cam.matrixWorldInverse.clone();
}

/* ---------- 이전 전 셰이더 식(그대로) ---------- */
function keyAt(k: THREE.Vector4[], n: number, r: number): THREE.Vector4 {
  if (n <= 1 || r <= k[0].w) return k[0];
  for (let i = 1; i < 8; i++) {
    if (i >= n) break;
    if (r <= k[i].w) {
      const a = k[i - 1];
      const b = k[i];
      const t = (r - a.w) / Math.max(b.w - a.w, 1e-6);
      return new THREE.Vector4(a.x * (1 - t) + b.x * t, a.y * (1 - t) + b.y * t, a.z * (1 - t) + b.z * t, a.w * (1 - t) + b.w * t);
    }
  }
  return k[n - 1];
}

function recordsOld(mesh: THREE.Mesh): string[] {
  const g = mesh.geometry as THREE.InstancedBufferGeometry;
  const U = (mesh.material as THREE.ShaderMaterial).uniforms;
  const A = (n: string): Float32Array => (g.getAttribute(n) as THREE.InstancedBufferAttribute).array as Float32Array;
  const P0 = A('aP0'),
    V0 = A('aV0'),
    R0 = A('aRot'),
    RV = A('aRotV'),
    SC = A('aScl');
  const uTime = U.uTime.value as number;
  const grav = U.uGravity.value as THREE.Vector3;
  const drag = U.uDrag.value as number;
  const regist = U.uRegist.value as number;
  const fadeIn = U.uFadeIn.value as number;
  const out: string[] = [];
  for (let i = 0; i < g.instanceCount; i++) {
    const o = i * 4;
    const age = uTime - P0[o + 3];
    const life = V0[o + 3];
    if (age < 0 || age >= life) continue;
    const r = age / life;
    let p: number[];
    if (Math.abs(1 - drag) < 1e-5) {
      const k = age * (age + 1) * 0.5;
      p = [P0[o] + V0[o] * age + grav.x * k, P0[o + 1] + V0[o + 1] * age + grav.y * k, P0[o + 2] + V0[o + 2] * age + grav.z * k];
    } else {
      const s = (drag * (1 - Math.pow(drag, age))) / (1 - drag);
      const k = age - s;
      p = [P0[o] + V0[o] * s + (grav.x / (1 - drag)) * k, P0[o + 1] + V0[o + 1] * s + (grav.y / (1 - drag)) * k, P0[o + 2] + V0[o + 2] * s + (grav.z / (1 - drag)) * k];
    }
    const rf = Math.abs(1 - regist) < 1e-5 ? age : (1 - Math.pow(regist, age)) / (1 - regist);
    const rot = [R0[o] + RV[o] * rf, R0[o + 1] + RV[o + 1] * rf, R0[o + 2] + RV[o + 2] * rf];
    const sk = keyAt(U.uScaleK.value, U.uScaleN.value, r);
    const scl = [SC[o] * sk.x, SC[o + 1] * sk.y, SC[o + 2] * sk.z];
    const fade = fadeIn > 0 ? Math.min(Math.max((SC[o + 3] + age) / fadeIn, 0), 1) : 1;
    const c0 = keyAt(U.uC0.value, U.uC0N.value, r);
    const a0 = keyAt(U.uA0.value, U.uA0N.value, r);
    const c1 = keyAt(U.uC1.value, U.uC1N.value, r);
    const a1 = keyAt(U.uA1.value, U.uA1N.value, r);
    out.push([...p, ...scl, ...rot, c0.x, c0.y, c0.z, a0.x * fade, c1.x, c1.y, c1.z, a1.x, age, life, R0[o + 3], RV[o + 3], 1].map(f).join(','));
  }
  return out;
}

function recordsNew(mesh: THREE.Mesh): string[] {
  const g = mesh.geometry as THREE.InstancedBufferGeometry;
  const A = (n: string): Float32Array | null => ((g.getAttribute(n) as THREE.InstancedBufferAttribute | undefined)?.array as Float32Array) ?? null;
  const P = A('aPos')!,
    S = A('aScl')!,
    R = A('aRot')!,
    C0 = A('aC0')!,
    C1 = A('aC1')!,
    M = A('aMisc')!;
  const out: string[] = [];
  for (let i = 0; i < g.instanceCount; i++) {
    const o = i * 4;
    out.push(
      [P[o], P[o + 1], P[o + 2], S[o], S[o + 1], S[o + 2], R[o], R[o + 1], R[o + 2], C0[o], C0[o + 1], C0[o + 2], C0[o + 3], C1[o], C1[o + 1], C1[o + 2], C1[o + 3], P[o + 3], S[o + 3], R[o + 3], M[o], M[o + 1]]
        .map(f)
        .join(','),
    );
  }
  return out;
}

const DEFINE_KEYS = ['BILLBOARD', 'MODE', 'SAMPLERS', 'MESH_NORMAL', 'NO_UV', 'FS', 'BASIS', 'BB4_ORIG', 'ALPHA_LT'];

function drawState(mesh: THREE.Mesh): string {
  const m = mesh.material as THREE.ShaderMaterial;
  const U = m.uniforms;
  const v4 = (a: THREE.Vector4[]): string => a.map((v) => [v.x, v.y, v.z, v.w].map(f).join(' ')).join(';');
  const tex = (t: THREE.Texture | null): string => (t ? `${t.name}@${t.wrapS},${t.wrapT}` : '-');
  const def = DEFINE_KEYS.filter((k) => m.defines?.[k]).map((k) => `${k}=${m.defines[k]}`);
  const blend = m.blending === THREE.CustomBlending ? `custom:${m.blendSrc},${m.blendDst},${m.blendEquation},${m.blendSrcAlpha},${m.blendDstAlpha},${m.blendEquationAlpha}` : String(m.blending);
  return [
    mesh.name,
    mesh.renderOrder,
    blend,
    m.depthTest,
    m.depthWrite,
    m.depthFunc,
    m.side,
    m.transparent,
    def.join(' '),
    f(U.uColorScale.value),
    f(U.uAlphaRef.value),
    v4(U.uUvA.value),
    v4(U.uUvB.value),
    (U.uInv.value as THREE.Vector2[]).map((v) => `${v.x} ${v.y}`).join(';'),
    [U.uRedA.value.x, U.uRedA.value.y, U.uRedA.value.z].join(' '),
    tex(U.uTex0.value),
    tex(U.uTex1.value),
    tex(U.uTex2.value),
  ].join('|');
}

const sha1 = (s: string): string => crypto.createHash('sha1').update(s).digest('hex');

/** 한 틱의 장면 그룹 → 줄들(보이는 배치만, renderOrder 순) */
function snapshot(group: THREE.Object3D, t: number, full: string[] | null): string[] {
  const lines: string[] = [];
  const meshes = (group.children as THREE.Mesh[]).filter((m) => m.isMesh && m.visible).sort((a, b) => a.renderOrder - b.renderOrder);
  for (const m of meshes) {
    const old = !!(m.geometry as THREE.BufferGeometry).getAttribute('aP0');
    const inOrder = old ? recordsOld(m) : recordsNew(m);
    const recs = [...inOrder].sort();
    if (!recs.length) continue;
    const st = drawState(m);
    lines.push(`${t}|${m.renderOrder}|${m.name}|${recs.length}|${sha1(recs.join('\n'))}|${sha1(st)}|${sha1(inOrder.join('\n'))}`);
    if (full) full.push(`# ${t} ${m.name}\n${st}\n${recs.join('\n')}`);
  }
  return lines;
}

/* ---------- 시나리오 ---------- */
type Act = (fx: EffectSystem, t: number, st: { steam: number }) => void;

interface Scenario {
  ticks: number;
  act: Act;
}

const P = (x: number, y: number, z: number): { x: number; y: number; z: number } => ({ x, y, z });

export const SCENARIOS: Record<string, Scenario> = {
  steam00: {
    ticks: 260,
    act: (fx, t, st) => {
      if (t === 0) st.steam = fx.start('mg1801_steam00', P(0, 0, 0));
      if (t === 150) fx.stop(st.steam);
    },
  },
  steam01: { ticks: 200, act: (fx, t) => void (t === 0 && fx.start('mg1801_steam01', P(0, 0, 0))) },
  water_entry00: { ticks: 90, act: (fx, t) => void (t === 0 && fx.spawn('mg1801_water_entry00', P(1.2, -0.5, 0.3))) },
  water_entry01: { ticks: 90, act: (fx, t) => void (t === 0 && fx.spawn('mg1801_water_entry01', P(-0.7, -0.5, 0.1))) },
  success00: { ticks: 45, act: (fx, t) => void (t === 0 && fx.spawn('mg1800_success00', P(-1, 1.5, 0))) },
  success01: { ticks: 45, act: (fx, t) => void (t === 0 && fx.spawn('mg1800_success01', P(1, 1.5, 0))) },
  pt_effect: { ticks: 90, act: (fx, t) => void (t === 0 && fx.spawn('mg_common_pt_effect_00', P(-3, 0, 0), 1.5)) },
  common_success: {
    ticks: 70,
    act: (fx, t) => {
      for (let pid = 0; pid < 4; pid++) if (t === pid * 5) fx.spawn(`ca::rm::util::ShowCommonEffect#${pid % 2}`, P(pid * 2 - 3, 1.5, 0));
      if (t === 30) fx.spawn('mg1800_success01.eset', P(0, 1.5, 0));
    },
  },
  mix: {
    ticks: 240,
    act: (fx, t, st) => {
      if (t === 0) st.steam = fx.start('mg1801_steam00', P(0, 0, 0));
      if (t === 30) fx.spawn('mg1801_water_entry00', P(0.8, -0.5, 0.2));
      if (t === 31) fx.spawn('mg1801_water_entry01', P(-1.1, -0.5, -0.1));
      if (t === 40) fx.spawn('ca::rm::util::ShowCommonEffect#0', P(-3, 1.5, 0));
      if (t === 45) fx.spawn('ca::rm::util::ShowCommonEffect#1', P(1, 1.5, 0));
      if (t === 52) fx.spawn('mg1801_water_entry00', P(-0.2, -0.5, 0.4));
      if (t === 60) {
        fx.stop(st.steam);
        st.steam = fx.start('mg1801_steam01', P(0, 0, 0));
      }
      if (t === 70) fx.spawn('mg_common_pt_effect_00', P(3, 0, 0), 1.5);
      if (t === 75) fx.spawn('no_such_effect', P(0, 0, 0));
    },
  },
};

/** 시나리오 하나 → 기록 텍스트 */
export async function runScenario(name: string, full = false): Promise<{ text: string; full: string; active: number[] }> {
  install();
  const sc = SCENARIOS[name];
  const scene = new THREE.Scene();
  const fx = new EffectSystem(scene, fakeAssets('mg1801/'));
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    await fx.load();
    const core = (fx as Any).fx?.core;
    if (core?.view) core.view.set(viewMatrix().elements);
    const group = scene.getObjectByName('mg1801_effects')!;
    const st = { steam: -1 };
    const lines: string[] = [];
    const fl: string[] | null = full ? [] : null;
    const active: number[] = [];
    for (let t = 0; t < sc.ticks; t++) {
      sc.act(fx, t, st);
      fx.update(1 / 60);
      lines.push(...snapshot(group, t, fl));
      lines.push(`${t}|active|${fx.activeCount}`);
      active.push(fx.activeCount);
    }
    fx.dispose();
    return { text: lines.join('\n'), full: fl ? fl.join('\n') : '', active };
  } finally {
    console.warn = warn;
  }
}

async function main(): Promise<void> {
  const out = process.argv[2] && process.argv[2] !== '-' ? path.resolve(process.argv[2]) : null;
  const full = process.argv.includes('full');
  const only = process.argv.slice(3).find((a) => a !== 'full');
  if (process.env.GOLDEN_RULES) {
    const lib = await import('../script/game/lib/effect').catch(() => null);
    if (lib) lib.effectDefaults.rules = process.env.GOLDEN_RULES === 'web' ? lib.RULES_WEB : lib.RULES_ORIGINAL;
  }
  if (out) fs.mkdirSync(out, { recursive: true });
  const want = process.env.GOLDEN_RULES === 'web' ? GOLDEN_SHA256_WEB : GOLDEN_SHA256;
  const res: Record<string, string> = {};
  let bad = 0;
  for (const name of Object.keys(SCENARIOS)) {
    if (only && name !== only) continue;
    const r = await runScenario(name, full);
    const h = crypto.createHash('sha256').update(r.text).digest('hex');
    res[name] = h;
    const ok = !want[name] || want[name] === h;
    if (!ok) bad++;
    console.log(`${name.padEnd(16)} ${h}${want[name] ? (ok ? '  같음' : '  다름') : ''}`);
    if (out) {
      fs.writeFileSync(path.join(out, `${name}.txt`), r.text);
      if (full) fs.writeFileSync(path.join(out, `${name}.full.txt`), r.full);
    }
  }
  if (out) fs.writeFileSync(path.join(out, 'golden.json'), JSON.stringify(res, null, 1));
  if (bad) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
