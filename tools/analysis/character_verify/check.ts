// Independent check of the character glb (tools/character_glb.py) with three.js GLTFLoader in node.
// usage: node tools/character_verify/run.mjs tools/character_verify/check.ts [pc01]
// writes extracted/converted/character/<pc>/verify_three.json
//
// 1. glb loads in three.js; skeleton bone count / bone names vs. FRES (tools/bfres_probe, separate program)
// 2. clip duration*60 and loop flag vs. FSKA FrameCount/Loop read by bfres_probe
// 3. AnimationMixer pose at integer frames == stored keyframes; R_hand / attach_R_hand path through the swing
// 4. reference slot model (motion_ref.ts) driven like mg1801 Player::MyUpdate -> swing length in frames per BPM
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SlotRef, argFromName, MotionArg, NEG_FLT_MAX } from './motion_ref';

const ROOT = path.resolve(path.dirname(process.argv[1]), '../../../..');
const pc = process.argv[2] ?? 'pc01';
const DIR = path.join(ROOT, 'extracted/converted/character', pc);
const PROBE = path.join(ROOT, 'web/tools/analysis/bfres_probe/bin/Release/net7.0/bfres_probe.exe');
const BEA = path.join(ROOT, 'extracted/bea');

const stubTextures = () => ({ name: 'stub_textures', loadTexture: () => Promise.resolve(new THREE.Texture()) });
function parse(buf: Buffer): Promise<any> {
  const loader = new GLTFLoader();
  loader.register(stubTextures as any);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => loader.parse(ab, '', res, rej));
}

function probe(files: string[]) {
  const txt = execFileSync(PROBE, files, { encoding: 'utf8' });
  const out: Record<string, any> = {};
  let cur = '';
  for (const line of txt.split(/\r?\n/)) {
    if (!line.startsWith(' ')) { cur = line.split(':')[0]; continue; }
    let m = line.match(/^\s+model (\S+): bones=(\d+) shapes=(\d+)/);
    if (m) out[cur] = { ...(out[cur] ?? {}), bones: +m[2], shapes: +m[3] };
    m = line.match(/^\s+skel (\S+): frames=(\d+) bones=(\d+) loop=(\w+)/);
    if (m) out[cur] = { ...(out[cur] ?? {}), frames: +m[2], animBones: +m[3], loop: m[4] === 'True' };
  }
  return out;
}

const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
const glbName = path.basename(meta.character.model).replace('.fmdb', '.glb');
const gltf = await parse(fs.readFileSync(path.join(DIR, glbName)));
const scene: THREE.Object3D = gltf.scene;
scene.updateMatrixWorld(true);
const report: any = { pc, glb: glbName, errors: [] as string[] };

// ---- 1. skeleton
const fmdb = path.join(BEA, meta.character.archive, 'chara/pc', `${pc}_${meta.character.charaname.toLowerCase()}`);
const fmdbPath = fs.existsSync(fmdb) ? path.join(fmdb, meta.character.model) : '';
const fresModel = fmdbPath ? probe([fmdbPath])[path.basename(fmdbPath)] : null;
let skinned: THREE.SkinnedMesh | null = null;
scene.traverse((o: any) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
const skelBones = skinned ? (skinned as THREE.SkinnedMesh).skeleton.bones.length : 0;
report.skeleton = { threeSkeletonBones: skelBones, fresBones: fresModel?.bones ?? null, fresShapes: fresModel?.shapes ?? null };
if (fresModel && skelBones !== fresModel.bones) report.errors.push(`skeleton bones ${skelBones} != FRES ${fresModel.bones}`);
const want = ['head_aimcont', 'chin', 'neck_roll', 'spine00', 'attach_R_hand', 'attach_L_hand', 'attach_head', 'NDcha_pos', 'facial_root'];
report.boneNames = Object.fromEntries(want.map((n) => [n, !!scene.getObjectByName(n)]));

// ---- 2. clips
const motionFiles: Record<string, string> = {};
for (const c of meta.clipTable) {
  if (c.name.endsWith('_shape')) continue;
  const arc = c.archive as string;
  const p = path.join(BEA, arc, 'chara/pc', fs.readdirSync(path.join(BEA, arc, 'chara/pc')).find((d) => d.startsWith(pc + '_'))!, 'motion', `${pc}_${c.name}.fskb`);
  motionFiles[c.name] = p;
}
const pr = probe(Object.values(motionFiles));
report.clips = {};
for (const clip of gltf.animations as THREE.AnimationClip[]) {
  if (clip.name.endsWith('_shape')) continue;
  const p = pr[path.basename(motionFiles[clip.name] ?? '')];
  const frames = Math.round(clip.duration * 60);
  const ex = (gltf.parser.json.animations.find((a: any) => a.name === clip.name) ?? {}).extras ?? {};
  report.clips[clip.name] = { duration: clip.duration, frames, loopExtras: ex.loop, fresFrames: p?.frames, fresLoop: p?.loop, tracks: clip.tracks.length, nameHash: ex.nameHash };
  if (!p) report.errors.push(`no FRES probe for ${clip.name}`);
  else {
    if (frames !== p.frames) report.errors.push(`${clip.name}: glb frames ${frames} != FRES ${p.frames}`);
    if (ex.loop !== p.loop) report.errors.push(`${clip.name}: loop ${ex.loop} != FRES ${p.loop}`);
  }
}

// ---- 3. poses
function poseAt(clipName: string, frame: number) {
  const clip = (gltf.animations as THREE.AnimationClip[]).find((c) => c.name === clipName)!;
  const mixer = new THREE.AnimationMixer(scene);
  const a = mixer.clipAction(clip);
  a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  mixer.setTime(frame / 60);
  scene.updateMatrixWorld(true);
  const w = (n: string) => { const o = scene.getObjectByName(n); if (!o) return null; const v = new THREE.Vector3(); o.getWorldPosition(v); return v.toArray().map((x) => +x.toFixed(4)); };
  const r = { R_hand: w('R_hand'), attach_R_hand: w('attach_R_hand'), head: w('head') };
  // keyframe identity: mixer value at integer frame == stored sample
  // 손 뼈가 없는 캐릭터(부끄부끄·닌군 등)는 R_hand 대신 attach_R_hand 트랙으로 본다
  const kb = scene.getObjectByName('R_hand') ? 'R_hand' : 'attach_R_hand';
  const tr = clip.tracks.find((t) => t.name === `${kb}.quaternion`);
  if (!tr) { mixer.stopAllAction(); mixer.uncacheRoot(scene); return { ...r, keyErr: 0 }; }
  const q = scene.getObjectByName(kb)!.quaternion;
  const k = Math.min(frame, tr.times.length - 1);
  const stored = Array.from(tr.values.slice(k * 4, k * 4 + 4));
  const err = Math.max(...stored.map((v, i) => Math.abs(v - [q.x, q.y, q.z, q.w][i])));
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
  return { ...r, keyErr: err };
}
report.swingPath = Object.fromEntries([0, 4, 8, 12, 16, 20].map((f) => [f, poseAt('rhy_knife_swing00', f)]));
report.idleLoop = { f0: poseAt('rhy_knife_idle00', 0), f15: poseAt('rhy_knife_idle00', 15), f30: poseAt('rhy_knife_idle00', 30) };
const maxKeyErr = Math.max(...Object.values<any>(report.swingPath).map((p) => p.keyErr));
if (maxKeyErr > 1e-6) report.errors.push('mixer pose != stored keyframe, err ' + maxKeyErr);
const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
report.swingHandTravel = +d(report.swingPath[0].attach_R_hand, report.swingPath[8].attach_R_hand).toFixed(4);
report.idleLoopSeam = +d(report.idleLoop.f0.attach_R_hand, report.idleLoop.f30.attach_R_hand).toFixed(6);

// ---- 4. reference slot driven like mg1801 Player (ctor + MyUpdate), BPM sweep
const F = Math.fround;
const clipsInfo = new Map<string, any>(Object.entries(report.clips).map(([n, c]: any) => [n, { frames: c.fresFrames, loop: c.fresLoop }]));
const idleMap = new Map<string, boolean>([['rhy_knife_idle00', true], ['rhy_knife_swing00', false]]); // AddAnimation(...,1,...) + "_idle" test
report.mg1801Swing = {};
for (const bpm of [90, 100, 120, 150, 180, 240]) {
  const slot = new SlotRef(clipsInfo, idleMap, () => 0);
  const speed = F(bpm / 120);
  slot.play(argFromName('rhy_knife_idle00')); slot.setFrame(0); slot.setSpeed(speed); // Player ctor @0x710000b4f0
  let motion = 0, req = -1, swingAt = -1, idleAt = -1;
  const mk = (n: number): MotionArg => ({ name: n ? 'rhy_knife_swing00' : 'rhy_knife_idle00', forceRestart: true, randomStartFrame: false, speedValid: true, startFrame: 0, speed, blendTime: NEG_FLT_MAX, transitionType: 1 });
  for (let t = 0; t < 120; t++) {
    if (t === 10) req = 1;                              // UpdateAttack: swing on frame 10
    if (req === -1 && motion === 1 && slot.isFinished()) req = 0; // MyUpdate @0x710000cb1c
    if (req !== -1) { slot.play(mk(req)); motion = req; if (req === 1) swingAt = t; else if (idleAt < 0) idleAt = t; req = -1; }
    slot.step();                                        // animation advance after the fiber [추정]
  }
  report.mg1801Swing[bpm] = { speed, swingFrames: idleAt - swingAt, seconds: +((idleAt - swingAt) / 60).toFixed(4), formula: Math.ceil(20 / speed) };
}

report.ok = report.errors.length === 0;
fs.writeFileSync(path.join(DIR, 'verify_three.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ok: report.ok, errors: report.errors, skeleton: report.skeleton, clips: report.clips, swingHandTravel: report.swingHandTravel, idleLoopSeam: report.idleLoopSeam, mg1801Swing: report.mg1801Swing }, null, 1));
