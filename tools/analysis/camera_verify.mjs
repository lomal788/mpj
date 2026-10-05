// camera_verify: re-implementation check of the original camera-anim view matrix (main FUN_71007758a4 Aim,
// FUN_7100775b90 EulerZXY) against the three.js mapping proposed in web/docs/engine/07_camera_lighting.md.
//   node tools/camera_verify.mjs            -> formula check with exact sin/cos (must be < 1e-9, exit 1 otherwise)
//                                              + informational error of the original SinCos table vs exact trig
// Inputs: extracted/converted/camera/mg1801_cameras.json (camera_probe cam), sincos_table.json (sdk table).
// This is a re-implementation calculation, not an original run.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const THREE = require(path.resolve('web/node_modules/three/build/three.cjs'));

const tbl = JSON.parse(fs.readFileSync('extracted/converted/camera/sincos_table.json', 'utf8')).entries;
const f32 = Math.fround;
// nn::util SinCos via table: idx = fcvtzs(rad * 2^31/pi); entry = tbl[(idx>>24)&0xff]; frac = (idx & 0xffffff) * 2^-24
let EXACT = true;
function sinCos(rad) {
  if (EXACT) return { c: Math.cos(rad), s: Math.sin(rad) };
  const k = f32(f32(2147483648) / f32(Math.PI));
  let x = BigInt(Math.trunc(f32(rad * k)));
  const e = tbl[Number((x >> 24n) & 0xffn)];
  const fr = f32(Number(x & 0xffffffn) * 5.9604645e-8);
  return { c: f32(e[0] + fr * e[2]), s: f32(e[1] + fr * e[3]) };
}
const norm = (v) => { const l = Math.hypot(...v); return l === 0 ? v : v.map((a) => a / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// returns camera axes X,Y,Z (columns of the original row-vector view matrix) + translation row
function origAim(pos, aim, twist) {
  const d = [pos[0] - aim[0], pos[1] - aim[1], pos[2] - aim[2]];
  if (d[0] === 0 && d[2] === 0) {
    // vertical special case (twist ignored)
    if (d[1] > 0) return { X: [1, 0, 0], Y: [0, 0, -1], Z: [0, 1, 0], pos };
    return { X: [1, 0, 0], Y: [0, 0, 1], Z: [0, -1, 0], pos };
  }
  const z = norm(d);
  const r = norm([d[2], 0, -d[0]]);
  const u = cross(z, r);
  const { c, s } = sinCos(twist);
  const X = [c * r[0] + s * u[0], c * r[1] + s * u[1], c * r[2] + s * u[2]];
  const Y = [-s * r[0] + c * u[0], -s * r[1] + c * u[1], -s * r[2] + c * u[2]];
  return { X, Y, Z: z, pos };
}
function origEuler(pos, rot) {
  const a = sinCos(rot[0]), b = sinCos(rot[1]), g = sinCos(rot[2]);
  const [cx, sx, cy, sy, cz, sz] = [a.c, a.s, b.c, b.s, g.c, g.s];
  // rows of view rotation part as decompiled: col j = camera axis j
  const m = [
    [cy * cz + sx * sy * sz, -cy * sz + sx * sy * cz, cx * sy],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + sx * cy * sz, sy * sz + sx * cy * cz, cx * cy],
  ];
  const col = (j) => [m[0][j], m[1][j], m[2][j]];
  return { X: col(0), Y: col(1), Z: col(2), pos };
}
function threeAxes(cam) {
  cam.updateMatrixWorld(true);
  const e = cam.matrixWorld.elements;
  return { X: [e[0], e[1], e[2]], Y: [e[4], e[5], e[6]], Z: [e[8], e[9], e[10]], pos: [e[12], e[13], e[14]] };
}
function threeAim(pos, aim, twist) {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(...pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(...aim);
  cam.rotateZ(twist);
  return threeAxes(cam);
}
function threeEuler(pos, rot) {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(...pos);
  cam.rotation.set(rot[0], rot[1], rot[2], 'YXZ');
  return threeAxes(cam);
}
function err(a, b) {
  let axis = 0, trans = 0;
  for (const k of ['X', 'Y', 'Z', 'pos']) for (let i = 0; i < 3; i++) axis = Math.max(axis, Math.abs(a[k][i] - b[k][i]));
  // translation row of the original view matrix = -dot(pos, axis)
  for (const k of ['X', 'Y', 'Z']) trans = Math.max(trans, Math.abs(-dot(a.pos, a[k]) + dot(b.pos, b[k])));
  return { axis, trans };
}

const cases = [];
const cams = JSON.parse(fs.readFileSync('extracted/converted/camera/mg1801_cameras.json', 'utf8'));
for (const f of cams) for (const s of f.scenes) for (const c of s.cameras) {
  cases.push({ name: `${f.file}`, mode: c.rotationMode, pos: c.base.pos, rot: c.base.rotOrAim, twist: c.base.twist });
}
let seed = 1;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
for (let i = 0; i < 200; i++) {
  cases.push({ name: `aim#${i}`, mode: 'Aim', pos: [rnd() * 30, rnd() * 30, rnd() * 30], rot: [rnd() * 5, rnd() * 5, rnd() * 5], twist: rnd() * 3 });
  cases.push({ name: `euler#${i}`, mode: 'EulerZXY', pos: [rnd() * 30, rnd() * 30, rnd() * 30], rot: [rnd() * 3, rnd() * 3, rnd() * 3], twist: 0 });
}
function run(label, limit) {
  let worstAxis = 0, worstPos = 0, bad = 0;
  for (const c of cases) {
    const o = c.mode === 'Aim' ? origAim(c.pos, c.rot, c.twist) : origEuler(c.pos, c.rot);
    const t = c.mode === 'Aim' ? threeAim(c.pos, c.rot, c.twist) : threeEuler(c.pos, c.rot);
    const e = err(o, t);
    worstAxis = Math.max(worstAxis, e.axis);
    worstPos = Math.max(worstPos, e.trans);
    if (limit && Math.max(e.axis, e.trans) > limit) bad++;
    if (!c.name.includes('#')) console.log(`${label} ${c.name.padEnd(28)} ${c.mode.padEnd(9)} axisErr=${e.axis.toExponential(2)} transErr=${e.trans.toExponential(2)}`);
  }
  console.log(`${label} cases=${cases.length} worstAxisErr=${worstAxis.toExponential(2)} worstTransErr=${worstPos.toExponential(2)}` + (limit ? ` over${limit}=${bad}` : ''));
  return bad;
}
EXACT = true;
const bad = run('[exact trig]', 1e-9);
EXACT = false;
run('[sdk table ]', 0);
// Informational: NDC of mg1801 logic points (web/docs/minigame/mg1801.md 4.5/4.6) under each camera, aspect 16:9
// (ApplyAspectEnabled=false so the anim aspect 1.78 is not used).
const pts = [
  ['veg entry lane0 (x=-3,y=7.5,z=0)', [-3, 7.5, 0]],
  ['veg entry lane3 (x=3,y=7.5,z=0)', [3, 7.5, 0]],
  ['veg judge lane0 (x=-3,y=1.5,z=0)', [-3, 1.5, 0]],
  ['player0 feet (x=-3,y=0,z=-2)', [-3, 0, -2]],
  ['player3 feet (x=3,y=0,z=-2)', [3, 0, -2]],
];
for (const f of cams) for (const sc of f.scenes) for (const c of sc.cameras) {
  const cam = new THREE.PerspectiveCamera((c.base.fovyRad * 180) / Math.PI, 16 / 9, c.base.near, c.base.far);
  cam.position.set(...c.base.pos);
  cam.lookAt(...c.base.rotOrAim);
  cam.rotateZ(c.base.twist);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const out = pts.map(([n, p]) => { const v = new THREE.Vector3(...p).project(cam); return `${n}: (${v.x.toFixed(3)}, ${v.y.toFixed(3)})`; });
  console.log(`[ndc] ${f.file}`);
  for (const line of out) console.log(`  ${line}`);
}
process.exit(bad ? 1 : 0);
