/**
 * 공용 에셋 변환기(tools/analysis/asset_convert.py + mg_assets.py)·미니게임 장면 로더(shell/mgstage) 노드 시험 — WebGL·헤드리스 없음.
 * 설계: docs/engine/13_asset_converter.md §11.
 *   1 manifest 유효성(게임 5개)  2 참조 파일 존재(404 0)  3 glb 로드(three GLTFLoader, 텍스처 대신 빈 Texture)  4 셰이더 그래프 graph.ts 형식
 *   5 공용 폴더 중복 0  6 기존 산출물 비교(mg1801·광장 — 변환기 중간 출력 analysis/asset_convert 와 바이트 비교)  7 로더 단계 묶음·미리 받기
 *   8 카메라 클립(구운 fsnb → three 카메라)  9 압축 분류(converted.json → assets_tex.isTex3d)  10 import 경계
 *
 *   npx tsx tools/test_mg_assets.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { P0, P1, P2, P3 } from '@game/lib/assetcore';
import { applyFsnb, MgCamera, mgStageKey, mgStageP0Paths, mgStagePlan, normPath, parseFsnb, CAMERA_MIN_NEAR, type MgManifest } from '../script/shell/mgstage';
import { graphSource, type GraphDef } from '../script/shell/stage3d/graph';
import { classify, isTex3d } from './assets_tex';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(WEB, '..');
const A = join(WEB, 'assets');
const GAMES = ['mg0508', 'mg0106', 'mg0101', 'mg0122', 'mg0102'];
let fails = 0;
let count = 0;
const ok = (cond: boolean, msg: string): void => {
  count++;
  if (!cond) {
    fails++;
    console.log('  실패:', msg);
  }
};
const sha = (p: string): string => createHash('sha1').update(readFileSync(p)).digest('hex');
const glbJson = (p: string): { images?: { uri?: string }[]; materials?: { extras?: { fres?: { name?: string } } }[]; nodes?: { name?: string; extras?: Record<string, unknown> }[] } => {
  const b = readFileSync(p);
  const n = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + n).toString('utf8'));
};
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : []);
const mans = new Map<string, MgManifest>();
for (const g of GAMES) mans.set(g, JSON.parse(readFileSync(join(A, 'mg', g, 'manifest.json'), 'utf8')) as MgManifest);

console.log('1. manifest 유효성');
for (const [g, m] of mans) {
  ok(m.set === `mg/${g}` && m.adapter === 'mg' && m.asset.archive === `mg~${g}.nx.bea`, `${g} 머리`);
  ok(Object.keys(m.models).length > 0 && Object.keys(m.asset.cameras ?? {}).length > 0, `${g} 모델·카메라 있음`);
  const keys = new Set(m.mg.layout.map((e) => e.key));
  ok(keys.size === m.mg.layout.length, `${g} 배치 키 중복 0`);
  for (const e of m.mg.layout) {
    ok(!!m.models[e.model], `${g} 배치 ${e.key} 모델 ${e.model}`);
    if (e.hookKey) ok(keys.has(e.hookKey) && !!e.hookNode, `${g} 부착 ${e.key} → ${e.hookKey}/${e.hookNode}`);
    for (const a of e.anims) ok(a.kind === 'clip' ? !!m.models[e.model].clips[a.name] : !!m.anims[a.name], `${g} ${e.key} 애니 ${a.kind}:${a.name}`);
  }
  ok(!!m.mg.camera.first && !!m.asset.cameras?.[m.mg.camera.first] && !!m.asset.cameras?.[m.mg.camera.game ?? ''], `${g} 첫·본편 카메라 ${m.mg.camera.first}·${m.mg.camera.game}`);
  for (const k of [...m.mg.first.p0, ...m.mg.first.p1, ...m.mg.first.p2]) ok(keys.has(k), `${g} 단계 키 ${k}`);
  ok(m.mg.first.p0.length > 0, `${g} P0 ${m.mg.first.p0.length}`);
  const env = m.env as { light?: { dir: number[] }; ibl?: { common: string[]; chara: string[] | null }; post?: { lut: string | null }; sky?: { model: string; texture: string | null }; envAnim?: string };
  ok(!!env.light && Math.abs(Math.hypot(...env.light.dir) - 1) < 1e-4, `${g} 빛 방향 단위`);
  for (const t of [...(env.ibl?.common ?? []), ...(env.ibl?.chara ?? []), env.post?.lut, env.sky?.texture].filter(Boolean) as string[]) ok(!!m.textures[t], `${g} 환경 텍스처 ${t} 색인`);
  if (env.sky) ok(!!m.models[env.sky.model], `${g} 하늘 모델`);
  if (env.envAnim) ok(!!m.anims[env.envAnim], `${g} envAnim`);
  for (const [n, v] of Object.entries(m.asset.envVariants ?? {})) ok(['environment', 'directional_light', 'posteffect', 'skybox', 'point_light'].includes(v.kind), `${g} 환경 변형 ${n}`);
}
console.log(`   배치 ${[...mans].map(([g, m]) => `${g} ${m.mg.layout.length}(P0 ${m.mg.first.p0.length})`).join(', ')}`);

console.log('2. 참조 파일 존재(404 0)');
const missing: string[] = [];
let refs = 0;
const need = (base: string, rel: string, what: string): void => {
  refs++;
  const p = resolve(base, rel);
  if (!existsSync(p)) missing.push(`${what}: ${relative(A, p)}`);
};
for (const [g, m] of mans) {
  const D = join(A, 'mg', g);
  for (const [n, mm] of Object.entries(m.models)) {
    need(D, mm.url, `${g} model ${n}`);
    for (const t of (mm as { tex?: string[] }).tex ?? []) need(join(D, 'tex'), t, `${g} model tex ${n}`);
    for (const im of glbJson(join(D, mm.url)).images ?? []) if (im.uri) need(join(D, 'model'), decodeURIComponent(im.uri), `${g} glb image ${n}`);
  }
  for (const [n, t] of Object.entries(m.textures)) for (const f of t.files) need(join(D, 'tex'), f, `${g} texture ${n}`);
  for (const p of Object.values(m.anims)) need(D, p, `${g} anim`);
  for (const c of Object.values(m.asset.cameras ?? {})) need(D, c.file, `${g} cam`);
  if (m.asset.collision) need(D, m.asset.collision, `${g} collision`);
  if (m.asset.ui) {
    need(D, m.asset.ui.file, `${g} ui`);
    const ui = JSON.parse(readFileSync(join(D, m.asset.ui.file), 'utf8')) as { textures: Record<string, string>; fonts: Record<string, { dir: string }> };
    for (const p of Object.values(ui.textures)) need(join(D, 'ui'), p, `${g} ui tex`);
    for (const f of Object.values(ui.fonts)) need(join(D, 'ui'), f.dir, `${g} ui font dir`);
  }
  if (m.asset.sound) {
    need(D, m.asset.sound.file, `${g} sound`);
    const s = JSON.parse(readFileSync(join(D, m.asset.sound.file), 'utf8')) as { se: Record<string, { file: string }>; bgm: Record<string, { file: string }> };
    for (const e of [...Object.values(s.se), ...Object.values(s.bgm)]) need(join(D, 'sound'), e.file, `${g} sound file`);
  }
  if (m.asset.fx) {
    need(D, m.asset.fx.file, `${g} fx`);
    const fx = JSON.parse(readFileSync(join(D, m.asset.fx.file), 'utf8')) as { textures: Record<string, string> };
    for (const p of Object.values(fx.textures)) need(join(D, 'fx'), p, `${g} fx tex`);
  }
  for (const p of m.asset.data ?? []) need(D, p, `${g} data`);
  for (const pg of m.asset.pending?.graphs ?? []) if (pg.sass) need(ROOT, pg.sass, `${g} graph sass`);
}
need(A, 'mg/index.json', 'index');
ok(missing.length === 0, `참조 ${refs}개 중 없음 ${missing.length} ${missing.slice(0, 5).join(' | ')}`);
console.log(`   참조 ${refs}, 없음 ${missing.length}`);

console.log('3. glb 로드(three GLTFLoader)');
const stubTextures = (): { name: string; loadTexture: () => Promise<THREE.Texture> } => ({ name: 'stub_textures', loadTexture: () => Promise.resolve(new THREE.Texture()) });
async function parseGlb(p: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const loader = new GLTFLoader();
  loader.register(stubTextures as never);
  const b = readFileSync(p);
  return loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '');
}
let glbs = 0;
const bad: string[] = [];
for (const [g, m] of mans) {
  for (const [n, mm] of Object.entries(m.models)) {
    try {
      const gl = await parseGlb(join(A, 'mg', g, mm.url));
      glbs++;
      let meshes = 0;
      gl.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      const clips = Object.keys(mm.clips);
      if (meshes === 0 && mm.vertices > 0) bad.push(`${g}/${n}: 메시 0`);
      for (const c of clips) if (!gl.animations.some((a) => a.name === c)) bad.push(`${g}/${n}: 클립 ${c} 없음`);
    } catch (e) {
      bad.push(`${g}/${n}: ${(e as Error).message}`);
    }
  }
}
ok(bad.length === 0, `glb ${glbs}개 로드·메시·클립 (${bad.slice(0, 5).join(' | ')})`);
console.log(`   glb ${glbs}개, 문제 ${bad.length}`);
{
  const m = mans.get('mg0508')!;
  const gl = await parseGlb(join(A, 'mg', 'mg0508', m.models.mg0508_bg00.url));
  ok(!!gl.scene.getObjectByName('pos_cuttingboard00') && !!gl.scene.getObjectByName('pos_cuttingboard01'), 'mg0508 bg00 부착 뼈 pos_cuttingboard00·01');
  const gp = await parseGlb(join(A, 'mg', 'mg0101', mans.get('mg0101')!.models.mg0101_floor_a.url));
  let vb = 0;
  gp.scene.traverse((o) => {
    if ((o.userData as { visBone?: string }).visBone === 'parts') vb++;
  });
  ok(vb > 0, `mg0101 floor_a 메시 visBone 'parts'(fvbb 보임 대상) ${vb}`);
}

console.log('4. 셰이더 그래프 graph.ts 형식');
let graphs = 0;
let pending = 0;
for (const [g, m] of mans) {
  for (const d of ((m as unknown as { graphs?: GraphDef[] }).graphs ?? [])) {
    graphs++;
    ok(typeof d.material === 'string' && Array.isArray(d.models) && d.models.every((x) => !!m.models[x]) && typeof d.samplers === 'object', `${g} 그래프 ${d.material} 필드`);
    let src: unknown = null;
    try {
      src = graphSource(d);
    } catch (e) {
      src = null;
      ok(false, `${g} 그래프 ${d.material} graphSource: ${(e as Error).message}`);
    }
    ok(!!src, `${g} 그래프 ${d.material} GLSL 조각`);
    for (const t of Object.values(d.samplers)) if (t) ok(!!m.textures[t], `${g} 그래프 ${d.material} 샘플러 텍스처 ${t} 색인`);
  }
  for (const p of m.asset.pending?.graphs ?? []) {
    pending++;
    ok(!!m.models[p.model] && !!p.sass, `${g} 판독 대기 ${p.material} SASS 준비`);
  }
}
console.log(`   그래프 ${graphs}(광장 판독 재사용), 판독 대기 ${pending}`);

console.log('5. 공용 폴더 중복 0');
const shared = new Map<string, string>();
for (const top of ['common', 'chara', 'font'])
  for (const p of walk(join(A, top))) if (/\.(png|hdr|wav|otf)$/.test(p)) shared.set(`${statSync(p).size}:${sha(p)}`, relative(A, p));
const dup: string[] = [];
for (const g of GAMES) for (const p of walk(join(A, 'mg', g))) if (/\.(png|hdr|wav|otf)$/.test(p) && shared.has(`${statSync(p).size}:${sha(p)}`)) dup.push(relative(A, p));
ok(dup.length === 0, `게임 폴더에 공용 폴더와 같은 바이트 0 (${dup.slice(0, 5).join(', ')})`);
const sharedRefs = [...mans.values()].flatMap((m) => m.asset.shared ?? []);
for (const s of sharedRefs) ok(existsSync(join(A, s)), `공용 참조 ${s}`);
console.log(`   공용 색인 ${shared.size}, 게임 쪽 같은 바이트 ${dup.length}, 공용 참조 ${sharedRefs.length} ${sharedRefs.join(', ')}`);

console.log('6. 기존 산출물 비교(같은 원본 → 새 코어)');
const cmp = (newDir: string, oldDir: string, re: RegExp): { same: number; diff: string[]; onlyNew: string[] } => {
  const r = { same: 0, diff: [] as string[], onlyNew: [] as string[] };
  for (const f of existsSync(newDir) ? readdirSync(newDir).filter((x) => re.test(x)) : []) {
    const o = join(oldDir, f);
    if (!existsSync(o)) r.onlyNew.push(f);
    else if (sha(join(newDir, f)) === sha(o)) r.same++;
    else r.diff.push(f);
  }
  return r;
};
const C = join(ROOT, 'analysis', 'asset_convert');
const rows: [string, string, string, RegExp][] = [
  ['mg1801 모델 glb', join(C, 'mg', 'mg1801', 'model'), join(A, 'mg1801', 'model'), /\.glb$/],
  ['mg1801 텍스처', join(C, 'mg', 'mg1801', 'tex'), join(A, 'mg1801', 'tex'), /\.(png|hdr)$/],
  ['mg1801 fmab', join(C, 'mg', 'mg1801', 'anim'), join(A, 'mg1801', 'model'), /\.fmab\.json$/],
  ['광장 모델 glb', join(C, 'menu', 'menu00', 'model'), join(A, 'plaza', 'world', 'model'), /\.glb$/],
];
for (const [name, n, o, re] of rows) {
  if (!existsSync(n)) {
    console.log(`   ${name}: 중간 출력 없음(건너뜀 — mg_assets.py mg1801 --out <scratch> 또는 asset_convert.py menu~menu00 --models … 를 먼저)`);
    continue;
  }
  const r = cmp(n, o, re);
  const usedOnly = name.includes('텍스처');
  ok(r.diff.length === 0, `${name}: 같은 이름 다른 바이트 0 (${r.diff.slice(0, 5).join(', ')})`);
  console.log(`   ${name}: 같음 ${r.same}, 다름 ${r.diff.length}, 새 쪽에만 ${r.onlyNew.length}${usedOnly ? '(쓰지 않는 rgh/mtl 원본 등 — 게임 폴더에는 쓰는 것만 나감)' : ''} ${r.onlyNew.slice(0, 4).join(' ')}`);
}

console.log('7. 로더 단계 묶음·미리 받기');
for (const [g, m] of mans) {
  const plan = mgStagePlan(m.mg);
  const byKey = new Map(m.mg.layout.map((e) => [e.key, e]));
  for (const e of m.mg.layout) {
    const pr = plan.pri.get(e.key)!;
    ok(pr === (m.mg.first.p0.includes(e.key) ? P0 : m.mg.first.p1.includes(e.key) ? P1 : e.visible ? P2 : P3), `${g} ${e.key} 등급 ${pr}`);
    if (e.hookKey) ok(plan.pri.get(e.hookKey)! <= pr, `${g} 부착 부모 ${e.hookKey} 등급 ≤ ${e.key}`);
    ok(!e.hookKey || byKey.has(e.hookKey), `${g} 부모 있음`);
  }
  for (let i = 1; i < plan.order.length; i++) ok(plan.pri.get(plan.order[i - 1].key)! <= plan.pri.get(plan.order[i].key)!, `${g} 순서 = 등급`);
  const p0 = mgStageP0Paths(m, false);
  const p0t = mgStageP0Paths(m, true);
  ok(p0[0][0] === m.asset.cameras![m.mg.camera.first!].file && p0[0][1] === 'json', `${g} 미리 받기 첫 항목 = 첫 카메라`);
  ok(p0.filter((x) => x[1] === 'gltf').length === new Set(m.mg.first.p0.map((k) => byKey.get(k)!.model)).size, `${g} P0 glb 수 = P0 모델 종류`);
  ok(p0t.length >= p0.length && p0t.every(([p]) => existsSync(join(A, 'mg', g, p))), `${g} 미리 받기 경로 전부 존재(텍스처 포함 ${p0t.length})`);
  ok(mgStageKey(g, 'tex/../../../common/tex/x.png') === 'common/tex/x.png' && normPath('a/./b/../c') === 'a/c', '키 정규화');
}
{
  const m = mans.get('mg0101')!;
  const plan = mgStagePlan(m.mg);
  const c = [P0, P1, P2, P3].map((p) => [...plan.pri.values()].filter((v) => v === p).length);
  console.log(`   mg0101 등급 P0/P1/P2/P3 = ${c.join('/')}`);
}

console.log('8. 카메라 클립');
for (const [g, m] of mans) {
  for (const [name, info] of Object.entries(m.asset.cameras ?? {})) {
    const clip = parseFsnb(JSON.parse(readFileSync(join(A, 'mg', g, info.file), 'utf8')));
    ok(!!clip && clip.pos.length === clip.frames + 1 && clip.frames === info.frames, `${g} ${name} 프레임 ${info.frames}`);
    if (!clip) continue;
    const cam = new THREE.PerspectiveCamera();
    applyFsnb(cam, clip, 0);
    ok(cam.position.distanceTo(new THREE.Vector3(...(clip.pos[0] as [number, number, number]))) < 1e-6 && Math.abs(cam.fov - THREE.MathUtils.radToDeg(clip.fovyRad[0])) < 1e-6 && cam.near >= CAMERA_MIN_NEAR, `${g} ${name} 0 프레임 자세`);
  }
}
{
  const m = mans.get('mg0508')!;
  const clip = parseFsnb(JSON.parse(readFileSync(join(A, 'mg', 'mg0508', m.asset.cameras!.mg0508_cam_start.file), 'utf8')))!;
  const c = new MgCamera('mg0508_cam_start', clip);
  const cam = new THREE.PerspectiveCamera();
  for (let i = 0; i < 400; i++) c.apply(cam, 1);
  ok(c.finished && c.frame === clip.frames, `비루프 카메라는 끝 프레임에서 멈춤 (${c.frame}/${clip.frames})`);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  ok(fwd.y < 0, `mg0508 시작 카메라가 아래(식탁)를 본다 (fwd.y ${fwd.y.toFixed(3)})`);
  const lp = new MgCamera('x', { ...clip, loop: true }, { loop: true });
  for (let i = 0; i < clip.frames + 10; i++) lp.apply(cam, 1);
  ok(Math.abs(lp.frame - 10) < 1e-9, `루프 카메라는 되돌아감 (${lp.frame})`);
}

console.log('9. 압축 분류(converted.json)');
{
  const reg = JSON.parse(readFileSync(join(A, 'converted.json'), 'utf8')) as { roots: Record<string, unknown>; roles: Record<string, string> };
  for (const g of GAMES) ok(!!reg.roots[`mg/${g}`], `등록 mg/${g}`);
  ok(isTex3d('mg/mg0508/tex/mg0508_bg00_alb.png') && isTex3d('mg/mg0508/fx/tex/a.png') && !isTex3d('mg/mg0508/ui/tex/a.png'), 'tex/·fx/tex/ = 3D, ui/tex/ = UI');
  ok(!isTex3d('mgscene/tex/a.png') && isTex3d('plaza/world/tex/a.png'), '기존 화면 폴더 분류 그대로');
  ok(classify('mg/mg0508/tex/mg0508_grass00_nml.png', 512, 512, {}).cls === 'normal' && classify('mg/mg0508/ui/tex/x.png', 64, 64, {}).cls === 'ui', '분류 결과');
}

console.log('10. import 경계');
{
  const dir = join(WEB, 'script', 'shell', 'mgstage');
  const allow = /^(three|\.\/[a-z]+|\.\.\/stage3d|\.\.\/stage3d\/assetHandlers|\.\.\/plaza\/world|@game\/lib\/assetcore|@game\/lib\/assetcore-three|@game\/lib\/splitscreen|@game\/lib\/splitscreen-three)$/;
  for (const fn of readdirSync(dir)) {
    const src = readFileSync(join(dir, fn), 'utf8');
    for (const mm of src.matchAll(/from '([^']+)'/g)) ok(allow.test(mm[1]), `${fn}: import '${mm[1]}'`);
  }
  const core = readdirSync(join(WEB, 'script', 'game', 'lib', 'assetcore')).map((f) => readFileSync(join(WEB, 'script', 'game', 'lib', 'assetcore', f), 'utf8'));
  ok(core.every((s) => !/^import .* from '/m.test(s)), '로더 코어(lib/assetcore) import 0');
}

console.log(fails ? `실패 ${fails}/${count}` : `통과 ${count}/${count}`);
process.exit(fails ? 1 : 0);
