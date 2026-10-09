/**
 * 광장(menu00) 무대 A 갈래 시험 — 에셋 명세(로드 목록·용량)·배치 소켓 좌표·장식 규칙·충돌 질의·import 경계를 노드에서 본다(WebGL 없음).
 * 기대값 근거: docs/shell/plaza_3d.md §6.5~6.7(MapStructure·ApplyDecoItem·DecoItemData 판독, 로케이터 [데이터]).
 *
 *   npx tsx tools/test_plaza_world.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FixedClock } from '../script/shell/plaza/scene';
import { DECO_ITEMS, DECO_TYPE, decoVisible, defaultDecoState, isDefaultDeco, parseDecoParam, setDecoDisplay } from '../script/shell/plaza/deco';
import type { PlazaLayoutEntry } from '../script/shell/plaza/types';
import { plazaPlan, type PlazaFirstFile } from '../script/shell/plaza/world';
import { Clip } from '../script/shell/stage3d/clip';
import { COLLIDER_STEP, MeshCollider, type MeshColliderData } from '../script/shell/stage3d/meshCollider';
import { graphSource, type GraphDef, type GraphSource } from '../script/shell/stage3d/graph';
import { patchRefraction, patchSss, patchUnlit, patchVertexColor, patchWater } from '../script/shell/stage3d/material';
import { initParams, patchSrt0, srtMatrix } from '../script/shell/stage3d/params';
import { fmabRepeatBad, glbRepeatBad } from './anim_repeat';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const W = join(WEB, 'assets', 'plaza', 'world');
let fails = 0;
let count = 0;
const ok = (cond: boolean, msg: string): void => {
  count++;
  if (!cond) {
    fails++;
    console.log('  실패:', msg);
  }
};
const near = (a: number, b: number, eps: number, msg: string): void => ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≈ ${b}`);

interface Manifest {
  models: Record<string, { url: string; bytes: number; texBytes: number; tex?: string[]; vertices: number; triangles: number; clips: Record<string, { frames: number; loop: boolean | null }> }>;
  textures: Record<string, { files: string[]; cube: boolean }>;
  anims: Record<string, string>;
  env: Record<string, unknown> & { light: { dir: number[]; color: number[] }; ibl: { common: string[] }; post: { lut: string | null; tonemapType: number } };
  plaza: { layout: PlazaLayoutEntry[]; cameraParam: Record<string, number>; collision: string; defaultAnims: Record<string, { kind: string; name: string }[]> };
}
const man = JSON.parse(readFileSync(join(W, 'manifest.json'), 'utf-8')) as Manifest;
const layout = man.plaza.layout;

console.log('1. 명세·로드 목록');
ok(layout.length === 111, `MapStructure 111항목 (${layout.length})`);
const modelEntries = layout.filter((e) => e.dir === 'model');
ok(modelEntries.every((e) => man.models[e.fmdb]), 'model 항목의 glb 가 모두 있다');
for (const m of Object.values(man.models)) ok(statSync(join(W, m.url)).size > 0, `${m.url} 파일`);
const texFiles = new Set(readdirSync(join(W, 'tex')));
const missing = Object.entries(man.textures).flatMap(([k, t]) => t.files.filter((f) => !texFiles.has(f)).map((f) => `${k}:${f}`));
ok(missing.length === 0, `색인 텍스처 파일 누락 0 (${missing.slice(0, 5).join(', ')})`);
for (const [k, p] of Object.entries(man.anims)) ok(texFiles.size > 0 && statSync(join(W, p)).size > 0, `anim ${k}`);
ok(Object.keys(man.anims).filter((k) => k.endsWith('.fmab')).length === 15, `fmab 14 + menu_common 기구 1 (${Object.keys(man.anims).filter((k) => k.endsWith('.fmab')).length})`);
const deco = defaultDecoState();
const visible = modelEntries.filter((e) => decoVisible(e, deco));
const need = new Set<string>();
const byKey = new Map(layout.map((e) => [e.key, e]));
const add = (k: string): void => {
  const e = byKey.get(k);
  if (!e || need.has(k) || e.dir !== 'model') return;
  need.add(k);
  if (e.hookKey) add(e.hookKey);
};
for (const e of visible) add(e.key);
const uniq = new Set([...need].map((k) => byKey.get(k)!.fmdb));
const glbBytes = [...uniq].reduce((a, n) => a + man.models[n].bytes, 0);
const texSet = new Set([...uniq].flatMap((n) => man.models[n].tex ?? []));
const texBytes = [...texSet].reduce((a, f) => a + statSync(join(W, 'tex', f)).size, 0);
const verts = [...need].reduce((a, k) => a + man.models[byKey.get(k)!.fmdb].vertices, 0);
console.log(`   처음 로드: 항목 ${need.size}(모델 ${uniq.size}종) glb ${(glbBytes / 1e6).toFixed(1)} MB + 텍스처 ${texSet.size}장 ${(texBytes / 1e6).toFixed(1)} MB, 정점 ${verts}`);
ok(need.size === 33, `처음 보이는 항목 = 늘 보임 26(비장식 모델 30 − 잠긴 보드 짝 3 − 갈매기 로케이터 1) + 장식 기본 7 (${need.size})`);
ok(glbBytes + texBytes < 100e6, `처음 로드 ≤ 100 MB (${((glbBytes + texBytes) / 1e6).toFixed(1)})`);
ok(man.plaza.defaultAnims.Ocean?.some((a) => a.kind === 'clip' && a.name === 'menu00_ocean00') && man.plaza.defaultAnims.Ocean?.some((a) => a.name === 'menu00_ocean00.fmab'), '바다 = fskb + fmab 루프');
ok(man.plaza.defaultAnims.FriendMatchObj?.[0]?.name === 'menu00_friendmatch_obj00_startup', '친구 매치 오브제 = startup 0 프레임 정지(Sleep 처음 상태)');
ok(!!man.models.menu00_loc_attach00.clips.pos_balloon_takeoff && man.models.menu00_loc_attach00.clips.pos_balloon_takeoff.frames === 500, '기구 출발 takeoff 500f 가 AttachLocater 에');
near(man.env.light.dir[0], -0.413176, 1e-4, '빛 방향 x');
near(man.env.light.dir[1], 0.766044, 1e-4, '빛 방향 y');
near(man.env.light.dir[2], 0.492404, 1e-4, '빛 방향 z');
ok(man.env.ibl.common[0] === 'menu00_plaza_rad' && man.env.ibl.common[1] === 'menu00_plaza_irr', 'IBL = plaza rad/irr');
ok(man.env.post.lut === 'menu00_lut_00' && man.env.post.tonemapType === 3, '포스트 LUT·톤맵 종류 3');
ok(man.plaza.cameraParam.MainMenuCameraLength === 10 && man.plaza.cameraParam.MainBalloonCameraFovy === 65, 'CameraParam 값');

console.log('2. 배치 소켓(로케이터 뼈 월드 좌표)');
function glbNodes(path: string): Map<string, THREE.Vector3> {
  const b = readFileSync(path);
  const n = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + n).toString('utf-8')) as { nodes: { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[]; scenes: { nodes: number[] }[] };
  const out = new Map<string, THREE.Vector3>();
  const walk = (i: number, parent: THREE.Matrix4): void => {
    const nd = j.nodes[i];
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...((nd.translation ?? [0, 0, 0]) as [number, number, number])),
      new THREE.Quaternion(...((nd.rotation ?? [0, 0, 0, 1]) as [number, number, number, number])),
      new THREE.Vector3(...((nd.scale ?? [1, 1, 1]) as [number, number, number])),
    );
    const w = parent.clone().multiply(m);
    if (nd.name) out.set(nd.name, new THREE.Vector3().setFromMatrixPosition(w));
    for (const c of nd.children ?? []) walk(c, w);
  };
  for (const r of j.scenes[0].nodes) walk(r, new THREE.Matrix4());
  return out;
}
const loc = glbNodes(join(W, man.models.menu00_loc_attach00.url));
const start = loc.get('char_start_pos');
ok(!!start, 'char_start_pos 있음');
if (start) {
  near(start.x, 0, 0.05, 'char_start_pos x');
  near(start.y, -2.4, 0.05, 'char_start_pos y');
  near(start.z, 22.3, 0.1, 'char_start_pos z');
}
const bal = loc.get('balloon_pos');
ok(!!bal && bal.length() < 0.01, `balloon_pos = 원점 (${bal?.toArray().map((v) => v.toFixed(2))})`);
for (const s of ['attach_shop_card', 'attach_shop_music', 'attach_shop_ranking', 'attach_shop_stamp', 'attach_shop_collection', 'attach_quest_cart00', 'friendmatch_obj00_pos', 'attach_renga_00', 'attach_renga_01', 'pc_plaza_balloon_pos_p1_pc00', 'mc_plaza_default_pos'])
  ok(loc.has(s), `소켓 ${s}`);
const hooks = layout.filter((e) => e.hookKey);
for (const e of hooks) {
  const host = byKey.get(e.hookKey)!;
  const nodes = glbNodes(join(W, man.models[host.fmdb].url));
  ok(nodes.has(e.hookNode), `부착 ${e.key} → ${e.hookKey}/${e.hookNode}`);
}

console.log('3. 장식 규칙(ApplyDecoItem·DecoItemData 판독)');
ok(DECO_ITEMS.length === 0x44 && DECO_TYPE.length === 0x44, 'DecoItemID 0..0x43');
ok([0, 7, 17, 24, 36, 44].every(isDefaultDeco) && !isDefaultDeco(1) && !isDefaultDeco(0x2d), 'IsDefault 마스크 0x101001020081');
const decoKeys = new Set(DECO_ITEMS.flat());
const flg = layout.filter((e) => e.flgDeco).map((e) => e.key);
ok(flg.every((k) => decoKeys.has(k)), `flgDeco 74 항목이 모두 표에 있다 (${flg.filter((k) => !decoKeys.has(k)).join(',')})`);
ok(DECO_ITEMS.flat().every((k) => byKey.has(k)), '표의 키가 모두 MapStructure 에 있다');
const vis = (s: typeof deco): string[] => layout.filter((e) => e.flgDeco && decoVisible(e, s)).map((e) => e.key);
ok(vis(deco).join() === 'Sculpture_Dft,Garland_Dft,Fountain_Dft,Tree_Dft,Tile_Dft,Balloon_Dft_00,Balloon_Dft_01', `처음 = _Dft 7 (${vis(deco).join()})`);
const s2 = defaultDecoState();
setDecoDisplay(s2, 2, true);
ok(!s2.display[0] && s2.display[2], 'Sculpture_Bd04 켜면 같은 종류 Dft 꺼짐');
setDecoDisplay(s2, 31, true);
setDecoDisplay(s2, 32, true);
ok(s2.display[31] && s2.display[32], 'Plant(종류 4)는 여러 개');
ok(vis(parseDecoParam('all')).length === flg.length, 'deco=all 이면 장식 전부 보임');
ok(parseDecoParam('Pick_Mario,0x3f').display[0x34] && parseDecoParam('Pick_Mario,0x3f').display[0x3f], 'deco=키,id');
const bd = (u: number): string[] => layout.filter((e) => /^bd0/.test(e.key) && decoVisible(e, { display: deco.display, unlockBd: u })).map((e) => e.key);
ok(bd(0).join() === 'bd02Obj_lock,bd03Obj_lock,bd06Obj_lock', `잠김 = _lock 3 (${bd(0).join()})`);
ok(bd(0x10101).join() === 'bd02Obj,bd03Obj,bd06Obj', '해금 = Obj 3');
ok(bd(0x100).join() === 'bd02Obj_lock,bd03Obj,bd06Obj_lock', 'bit8 = bd03');

console.log('4. 충돌(원본 PhysX 삼각 메시)');
const col = JSON.parse(readFileSync(join(W, man.plaza.collision), 'utf-8')) as Record<string, MeshColliderData>;
const main = new MeshCollider(col.CollisionMain);
ok(col.CollisionMain.vertices.length / 3 === 2666 && main.triangles === 4440, `CollisionMain 2666/4440 (${col.CollisionMain.vertices.length / 3}/${main.triangles})`);
ok(new MeshCollider(col.CollisionFirst).triangles === 76, 'CollisionFirst 76');
const g0 = main.groundHeight(0, 22.3, 0);
ok(!!g0, '시작 자리 지면 있음');
if (g0) near(g0.y, -2.4, 0.15, '시작 자리 지면 y');
const g1 = main.groundHeight(0, 5, 0);
console.log(`   지면 (0,5) = ${g1?.y.toFixed(3)}, (0,22.3) = ${g0?.y.toFixed(3)}, (10,30) = ${main.groundHeight(10, 30, 0)?.y.toFixed(3)}`);
ok(!!g1, '기구 앞 지면 있음');
const p = new THREE.Vector3(0, g0?.y ?? -2.4, 22.3);
for (let i = 0; i < 120; i++) {
  const mv = main.collide(p, new THREE.Vector3(0.5, 0, 0), 0.9, 1.6);
  p.add(mv);
  const g = main.groundHeight(p.x, p.z, p.y);
  if (g && g.y <= p.y + COLLIDER_STEP) p.y = g.y;
}
console.log(`   +x 로 60 m 밀기 → x ${p.x.toFixed(2)} y ${p.y.toFixed(2)}`);
ok(p.x < 28.8, '벽에서 멈춘다(맵 x 범위 안)');
const q = new THREE.Vector3(0, g0?.y ?? -2.4, 22.3);
for (let i = 0; i < 120; i++) {
  q.add(main.collide(q, new THREE.Vector3(0, 0, 0.5), 0.9, 1.6));
  const g = main.groundHeight(q.x, q.z, q.y);
  if (g && g.y <= q.y + COLLIDER_STEP) q.y = g.y;
}
console.log(`   +z 로 60 m 밀기 → z ${q.z.toFixed(2)} y ${q.y.toFixed(2)}`);
ok(q.z < 62.1, '+z 벽에서 멈춘다');
const free = main.collide(new THREE.Vector3(0, g0?.y ?? -2.4, 22.3), new THREE.Vector3(0.1, 0, 0), 0.9, 1.6);
near(free.x, 0.1, 1e-6, '빈 바닥은 그대로 이동');

console.log('5. TexSrt 행렬(Maya)');
const id = srtMatrix({ mode: 0, sx: 1, sy: 1, r: 0, tx: 0, ty: 0 });
ok(id.equals(new THREE.Matrix3()), '단위값 = 항등');
const t = new THREE.Vector3(0.25, 0.5, 1).applyMatrix3(srtMatrix({ mode: 0, sx: 1, sy: 1, r: 0, tx: 0.1, ty: 0.2 }));
ok(Math.abs(t.x - 0.15) < 1e-6 && Math.abs(t.y - 0.7) < 1e-6, `이동 (u − tx, v + ty) = (${t.x.toFixed(3)}, ${t.y.toFixed(3)})`);

console.log('6. 셰이더 그래프 정의 → GLSL ES 3.00 컴파일(three 표준 재질 + 그래프 조각, moderngl 이 있으면)');
{
  const graphs = (man as unknown as { graphs: GraphDef[] }).graphs;
  ok(graphs.length >= 70, `그래프 정의 ${graphs.length} (판독 묶음 1·2)`);
  const texMissing = graphs.flatMap((g) => Object.values(g.samplers).filter((t): t is string => !!t && !man.textures[t]));
  ok(texMissing.length === 0, `그래프 샘플러 텍스처가 색인에 있다 (${texMissing.join(',')})`);
  const resolve = (s: string): string => s.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_m, n: string) => resolve((THREE.ShaderChunk as Record<string, string>)[n] ?? `#error missing ${n}`));
  const unroll = (s: string): string =>
    s.replace(/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g, (_m, a: string, b: string, body: string) => {
      let out = '';
      for (let i = +a; i < +b; i++) out += body.replace(/\[\s*i\s*\]/g, `[ ${i} ]`).replace(/UNROLLED_LOOP_INDEX/g, String(i));
      return out;
    });
  const nums = (s: string): string =>
    s
      .replace(/NUM_DIR_LIGHTS/g, '1')
      .replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g, '0')
      .replace(/NUM_SPOT_LIGHT_(MAPS|COORDS|SHADOWS)/g, '0')
      .replace(/NUM_(SPOT|RECT_AREA|POINT|HEMI)_LIGHTS/g, (m) => (m === 'NUM_POINT_LIGHTS' ? '1' : '0'))
      .replace(/NUM_DIR_LIGHT_SHADOWS/g, '1')
      .replace(/NUM_POINT_LIGHT_SHADOWS/g, '0')
      .replace(/NUM_CLIPPING_PLANES/g, '0')
      .replace(/UNION_CLIPPING_PLANES/g, '0');
  const defs = ['#define STANDARD', '#define USE_UV', '#define USE_MAP', '#define MAP_UV uv', '#define USE_NORMALMAP', '#define USE_NORMALMAP_TANGENTSPACE', '#define NORMALMAP_UV uv', '#define USE_ROUGHNESSMAP', '#define ROUGHNESSMAP_UV uv', '#define USE_SHADOWMAP', '#define SHADOWMAP_TYPE_PCF', '#define USE_FOG', '#define USE_ENVMAP', '#define ENVMAP_TYPE_CUBE_UV', '#define ENVMAP_MODE_REFLECTION', '#define CUBEUV_TEXEL_WIDTH 0.001', '#define CUBEUV_TEXEL_HEIGHT 0.001', '#define CUBEUV_MAX_MIP 8.0'].join('\n');
  const vsPre = `#version 300 es\n#define attribute in\n#define varying out\n#define texture2D texture\nprecision highp float;\nprecision highp int;\n${defs}\nuniform mat4 modelMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\nuniform mat4 viewMatrix;\nuniform mat3 normalMatrix;\nuniform vec3 cameraPosition;\nuniform bool isOrthographic;\nattribute vec3 position;\nattribute vec3 normal;\nattribute vec2 uv;\n#ifdef USE_UV1\nattribute vec2 uv1;\n#endif\n#ifdef USE_TANGENT\nattribute vec4 tangent;\n#endif\n`;
  const fsPre = `#version 300 es\n#define varying in\nlayout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n#define texture2D texture\n#define textureCube texture\n#define texture2DLodEXT textureLod\n#define textureCubeLodEXT textureLod\nprecision highp float;\nprecision highp int;\n${defs}\nuniform mat4 viewMatrix;\nuniform vec3 cameraPosition;\nuniform bool isOrthographic;\nvec4 linearToOutputTexel( vec4 value ) { return value; }\n`;
  const wrap = (vs: string, fs: string, tangent: boolean, extra = ''): { vs: string; fs: string } => {
    const t = (tangent ? '#define USE_TANGENT' + String.fromCharCode(10) : '') + extra;
    return { vs: vsPre.replace('#define STANDARD', `${t}#define STANDARD`) + unroll(nums(resolve(vs))), fs: fsPre.replace('#define STANDARD', `${t}#define STANDARD`) + unroll(nums(resolve(fs))) };
  };
  const build = (src: GraphSource | null, tangent: boolean): { vs: string; fs: string } => {
    let vs = THREE.ShaderLib.physical.vertexShader;
    let fs = THREE.ShaderLib.physical.fragmentShader;
    if (src) {
      const head = `uniform vec4 mpjP[8];\nuniform vec4 mpjC[4];\nuniform mat3 mpjSrt[4];\nuniform vec4 mpjEnvP[4];\nuniform float mpjMs;\nuniform vec3 mpjSunDir;\nvec2 srt0(vec2 u) { return (mpjSrt[0] * vec3(u, 1.0)).xy; }\nvec2 srt1(vec2 u) { return (mpjSrt[1] * vec3(u, 1.0)).xy; }\nvec2 srt2(vec2 u) { return (mpjSrt[2] * vec3(u, 1.0)).xy; }\nvec2 srt3(vec2 u) { return (mpjSrt[3] * vec3(u, 1.0)).xy; }\n${src.rawDecl}${[...src.texIndex.values()].map((i) => `uniform sampler2D mpjGT${i};\nvec4 mpjT${i}(vec2 u) { return texture2D(mpjGT${i}, u); }`).join('\n')}`;
      vs = vs.replace('#include <common>', `#include <common>\n${head}\n${src.vsDecl}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${src.vsBody}`);
      fs = fs.replace('#include <common>', `#include <common>\n${head}\n${src.fsDecl}`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${src.fsBody}`);
    }
    return wrap(vs, fs, tangent);
  };
  const patched = (name: string, fn: (m: THREE.MeshPhysicalMaterial) => void, extra = ''): { name: string; vs: string; fs: string } => {
    const m = new THREE.MeshPhysicalMaterial();
    fn(m);
    const sh = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(sh, null as unknown as THREE.WebGLRenderer);
    return { name, ...wrap(sh.vertexShader, sh.fragmentShader, false, extra) };
  };
  const dummy = new THREE.Texture();
  const jobs = [
    { name: '(표준)', ...build(null, false) },
    patched('(무조명 shading_type 0)', (m) => patchUnlit(m)),
    patched('(SSS shading_type 2)', (m) => patchSss(m, dummy, dummy, 1)),
    patched('(srt0)', (m) => patchSrt0(m, initParams(m, { shader: { options: {} } }))),
    patched('(굴절 refraction, 투과 버퍼)', (m) => patchRefraction(m, 0, 0.5, 1, true, 1.333, 0.03, 0.03), '#define PHYSICAL' + String.fromCharCode(10) + '#define USE_TRANSMISSION' + String.fromCharCode(10)),
    patched('(물 합성 water)', (m) => patchWater(m, 0.2, [0.28, 0.43, 0.38], 0.33)),
    patched('(정점색 곱)', (m) => patchVertexColor(m, 0)),
...graphs.flatMap((g) => [false, true].map((t) => ({ name: `${g.material}/${g.program}${t ? '+tangent' : ''}`, ...build(graphSource(g), t) })))];
  const py = `
import json, sys
try:
    import moderngl
except Exception:
    print(json.dumps({"skip": True})); sys.exit(0)
ctx = moderngl.create_standalone_context()
out = {}
for j in json.load(sys.stdin):
    try:
        ctx.program(vertex_shader=j["vs"], fragment_shader=j["fs"]).release(); out[j["name"]] = None
    except Exception as e:
        out[j["name"]] = str(e)[:600]
print(json.dumps(out))
`;
  if (process.env.PLAZA_GLSL_DUMP) writeFileSync(process.env.PLAZA_GLSL_DUMP, JSON.stringify(jobs.slice(0, 3)));
  const r = spawnSync('python', ['-c', py], { input: JSON.stringify(jobs), encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const res = JSON.parse(r.stdout || '{"skip":true}') as Record<string, string | null> & { skip?: boolean };
  if (res.skip) console.log('   (moderngl 없음 — GLSL 컴파일 건너뜀)');
  else {
    ok(res['(표준)'] === null, `표준 물리 재질 기준 컴파일 ${String(res['(표준)'] ?? '').replace(/\s+/g, ' ').slice(0, 400)}`);
    const bad = Object.entries(res).filter(([k, v]) => k !== '(표준)' && v);
    for (const [k, v] of bad.slice(0, 6)) console.log('   컴파일 실패', k, String(v).replace(/\s+/g, ' ').replace(/GLSL Compiler failed fragment_shader =+ /, '').slice(0, 300));
    ok(bad.length === 0, `그래프 ${jobs.length - 1} 변형 GLSL 컴파일 (실패 ${bad.length})`);
  }
}

console.log('7. 원본 60 fps 시간(FixedClock — 화면 주사율과 무관)');
for (const hz of [30, 60, 75, 120, 144, 240]) {
  const c = new FixedClock();
  let n = 0;
  for (let i = 0; i < hz * 10; i++) n += c.advance(1000 / hz);
  ok(Math.abs(n - 600) <= 1, `${hz} Hz 로 10 초 → 원본 ${n} 프레임(600)`);
}
{
  const c = new FixedClock();
  const stall = c.advance(3000);
  let after = 0;
  for (let i = 0; i < 144; i++) after += c.advance(1000 / 144);
  ok(stall === FixedClock.MAX_STEPS && Math.abs(after - 60) <= 1, `3 초 멈춤 뒤: 그 프레임 ${stall} 스텝(넘친 밀림 버림), 다음 1 초 ${after} 프레임(빨리 감기 없음)`);
}

{
  const root = new THREE.Object3D();
  root.name = 'r';
  const track = new THREE.VectorKeyframeTrack('r.position', [0, 1], [0, 0, 0, 60, 0, 0]);
  const c = new Clip(new THREE.AnimationMixer(root), new THREE.AnimationClip('a', 1, [track]), undefined, { loop: true });
  const xs: number[] = [];
  for (let i = 0; i < 30; i++) {
    c.step(1);
    xs.push(root.position.x);
  }
  ok(c.frames === 60 && c.frame === 30, `클립 진행량 = 스텝당 1 프레임(원본 delta × 60 × 속도 1): ${c.frame}/${c.frames}`);
  ok(xs.every((x, i) => Math.abs(x - (i + 1)) < 1e-4), `한 스텝 이동 = 1 프레임분(초당 60 프레임): ${xs.slice(0, 3).map((x) => x.toFixed(3)).join(',')}`);
}

console.log('8. import 경계(mgm_common.md §9.1 — lib/assetcore·assetcore-three 는 어디서나 허용)');
const SHELL = join(WEB, 'script', 'shell');
const scan = (dir: string, allowed: string[]): void => {
  for (const f of readdirSync(dir)) {
    const p2 = join(dir, f);
    if (statSync(p2).isDirectory()) {
      scan(p2, allowed);
      continue;
    }
    if (!f.endsWith('.ts')) continue;
    for (const m of readFileSync(p2, 'utf-8').matchAll(/from '([^']+)'/g)) {
      const spec = m[1];
      const lib = spec.startsWith('.') && [join(WEB, 'script', 'lib', 'assetcore'), join(WEB, 'script', 'lib', 'assetcore-three'), join(WEB, 'script', 'lib', 'transition')].includes(resolve(dir, spec));
      const okSpec = spec === 'three' || spec.startsWith('three/') || lib || (spec.startsWith('.') && allowed.some((a) => resolve(dir, spec).startsWith(join(SHELL, a))));
      ok(okSpec, `${p2.slice(WEB.length + 1)} import ${spec}`);
    }
  }
};
scan(join(SHELL, 'plaza'), ['plaza', 'stage3d', 'mgmcommon', 'online', 'charselect']);
scan(join(SHELL, 'stage3d'), ['stage3d']);

console.log('9. 단계 로딩 계획(loader_manager.md §11.4·§11.5 — plaza_first.json)');
{
  const first = JSON.parse(readFileSync(join(W, 'plaza_first.json'), 'utf-8')) as PlazaFirstFile;
  const all = [...layout, ...((man.plaza as { extraLayout?: PlazaLayoutEntry[] }).extraLayout ?? [])];
  const keySet = new Set(all.map((e) => e.key));
  ok(first.first.length > 0 && first.first.every((k) => keySet.has(k)), `처음 보이는 것 ${first.first.length}개, 모두 레이아웃 키`);
  ok(first.first.includes('CentralPlaza') && first.first.includes('Balloon'), '광장 바닥·기구는 처음 보임');
  ok(['AttachLocater', 'AttachLocaterQuest', 'AttachLocaterDecoNpc'].every((k) => first.hosts.includes(k)), '로케이터 3개는 hosts');
  const models = all.filter((e) => e.dir === 'model' && man.models[e.fmdb]);
  ok(models.every((e) => first.bounds[e.key]?.length === 4 || man.models[e.fmdb].triangles === 0), `경계 구 ${Object.keys(first.bounds).length}/${models.length}(삼각형 0 인 경로 로케이터 제외)`);
  ok(first.start.length === 3 && Math.abs(first.start[2]) > 0, `시작 위치 ${first.start}`);
  const by = new Map(all.map((e) => [e.key, e]));
  const d0 = defaultDecoState();
  const need = new Set<string>();
  const addN = (k: string): void => {
    const e = by.get(k);
    if (!e || need.has(k) || !models.includes(e)) return;
    need.add(k);
    if (e.hookKey) addN(e.hookKey);
  };
  for (const e of models) if (decoVisible(e, d0)) addN(e.key);
  const list = all.filter((e) => need.has(e.key));
  const { pri, order } = plazaPlan(list, by, first);
  const cnt = [0, 1, 2, 3].map((p) => list.filter((e) => pri.get(e.key) === p).length);
  console.log(`   기본 장식: 필요 ${list.length} → P0 ${cnt[0]} · P1 ${cnt[1]} · P3 ${cnt[3]}`);
  ok(cnt[0] > 0 && cnt[0] < list.length, 'P0 은 일부만');
  ok(pri.get('CentralPlaza') === 0 && pri.get('AttachLocater') === 0, '바닥·로케이터 P0');
  ok(list.filter((e) => /^Shop/.test(e.key)).every((e) => pri.get(e.key) === 3), '상점 P3');
  ok(list.every((e) => !e.hookKey || !need.has(e.hookKey) || pri.get(e.hookKey)! <= pri.get(e.key)!), '부착 부모 등급 ≤ 자식');
  ok(order.every((e, i) => i === 0 || pri.get(order[i - 1].key)! <= pri.get(e.key)!), '순서 = 등급순');
  ok(list.every((e) => pri.has(e.key)), '필요한 것 모두 등급');
}

console.log('10. 애니 커브 반복(원본 wrap Repeat — §6.14 #14c ③, 변환기 Curves.cs)');
{
  const stuck = (v: number[]): number => {
    const last = v[v.length - 1];
    let k = v.length - 1;
    while (k > 0 && Math.abs(v[k - 1] - last) < 1e-6) k--;
    return k;
  };
  const REPEAT: [string, string, string, string, number, number][] = [["menu00_central_plaza00", "menu00_grass00_mt", "utility_parameter0", "0x08", 0, 400], ["menu00_fountain_water", "fountain_water00_mt", "utility_parameter0", "0x08", 0, 600], ["menu00_fountain_water", "fountain_water00_mt", "utility_parameter0", "0x0C", 0, 200], ["menu00_fountain_water", "fountain_water00_mt", "utility_parameter1", "0x08", 0, 1800], ["menu00_fountain_water", "fountain_water00_mt", "utility_parameter1", "0x0C", 0, 1800], ["menu00_fountain_water", "fountain_water00_mt", "utility_parameter3", "0x0C", 0, 20], ["menu00_fountain_water", "fountain_water01_mt", "utility_parameter0", "0x08", 0, 1800], ["menu00_fountain_water", "fountain_water01_mt", "utility_parameter0", "0x0C", 0, 1800], ["menu00_fountain_water", "fountain_water01_mt", "utility_parameter1", "0x08", 0, 1800], ["menu00_fountain_water", "fountain_water01_mt", "utility_parameter1", "0x0C", 0, 1800], ["menu00_fountain_water", "menu00_stage_caustics", "utility_parameter0", "0x08", 0, 300], ["menu00_fountain_water", "menu00_stage_caustics", "utility_parameter0", "0x0C", 0, 300], ["menu00_fountain_water", "menu00_stage_caustics", "utility_parameter1", "0x08", 0, 300], ["menu00_fountain_water", "menu00_stage_caustics", "utility_parameter1", "0x0C", 0, 300], ["menu00_fountain_water", "menu00_stage_caustics", "utility_parameter2", "0x08", 0, 600], ["menu00_fountain_water", "menu00_stage_caustics", "utility_parameter2", "0x0C", 0, 600], ["menu00_jet_fountain00", "menu00_jet_fountain00_mt", "texture_srt0", "0x14", 0, 30], ["menu00_jet_fountain00", "menu00_jet_fountain00_mt", "utility_parameter1", "0x0C", 0, 60], ["menu00_jet_fountain00", "menu00_jet_fountain00_mt", "utility_parameter2", "0x0C", 0, 60], ["menu00_jet_fountain00", "menu00_jet_fountain01_mt", "texture_srt0", "0x14", 0, 30], ["menu00_jet_fountain00", "menu00_jet_fountain01_mt", "utility_parameter1", "0x0C", 0, 60], ["menu00_jet_fountain00", "menu00_jet_fountain01_mt", "utility_parameter2", "0x0C", 0, 60], ["menu00_ocean00", "menu01_ocean00_mt", "utility_parameter0", "0x08", 30, 630], ["menu00_ocean00_op", "menu01_ocean00_mt", "utility_parameter0", "0x08", 30, 630], ["menu00_stage00_water00", "menu00_stage_caustics", "utility_parameter0", "0x08", 0, 300], ["menu00_stage00_water00", "menu00_stage_caustics", "utility_parameter0", "0x0C", 0, 300], ["menu00_stage00_water00", "menu00_stage_caustics", "utility_parameter1", "0x08", 0, 300], ["menu00_stage00_water00", "menu00_stage_caustics", "utility_parameter1", "0x0C", 0, 300], ["menu00_stage00_water00", "menu00_stage_caustics", "utility_parameter2", "0x08", 0, 600], ["menu00_stage00_water00", "menu00_stage_caustics", "utility_parameter2", "0x0C", 0, 600], ["menu00_stage00_water00", "stage_flag_mt", "utility_parameter0", "0x08", 0, 300], ["menu00_stage00_water00", "stage_flag_mt", "utility_parameter1", "0x00", 0, 598]];
  type Fmab = { materialAnims: { frames: number; materials: Record<string, { params: Record<string, Record<string, number | number[]>> }> }[] };
  const cache = new Map<string, Fmab>();
  const bad: string[] = [];
  for (const [file, mat, param, off, start, end] of REPEAT) {
    let j = cache.get(file);
    if (!j) cache.set(file, (j = JSON.parse(readFileSync(join(W, man.anims[file + '.fmab']), 'utf-8')) as Fmab));
    const a = j.materialAnims[0];
    const v = a.materials[mat]?.params['material_' + param]?.[off];
    const period = end - start;
    const f0 = start + Math.floor(period / 3);
    if (!Array.isArray(v)) bad.push(`${file} ${mat} ${param}[${off}] 없음`);
    else if (f0 + period <= a.frames && Math.abs(v[f0 + period] - v[f0]) > 1e-4) bad.push(`${file} ${mat} ${param}[${off}] f${f0 + period} ${v[f0 + period]} ≠ f${f0} ${v[f0]}`);
    else if (end < a.frames && stuck(v) <= end) bad.push(`${file} ${mat} ${param}[${off}] ${end}f 뒤 끝값 고정`);
  }
  ok(bad.length === 0, `Repeat 커브 ${REPEAT.length}개(광장 fmab 6개, 원본 커브 덤프 [데이터])가 구간 뒤에도 주기대로 반복${bad.length ? ': ' + bad.slice(0, 4).join(' · ') : ''}`);
  for (const file of ['menu00_ocean00', 'menu00_fountain_water']) {
    const a = cache.get(file)!.materialAnims[0];
    const rows = REPEAT.filter((r) => r[0] === file);
    const moving = rows.filter((r) => {
      const v = a.materials[r[1]].params['material_' + r[2]][r[3]] as number[];
      const t = v.slice(r[5] + 1);
      return t.length > 0 && Math.max(...t) - Math.min(...t) > 1e-6;
    });
    ok(moving.length === rows.filter((r) => r[5] < a.frames).length, `${file}: 한 주기 뒤(${rows.map((r) => r[5]).join('·')}f 뒤)에도 값이 변하는 트랙 ${moving.length}/${rows.length}`);
  }
  const b = readFileSync(join(W, 'model', 'menu00_jet_fountain00.glb'));
  const jl = b.readUInt32LE(12);
  const g = JSON.parse(b.subarray(20, 20 + jl).toString('utf-8')) as { accessors: { bufferView: number; byteOffset?: number; count: number; type: string }[]; bufferViews: { byteOffset?: number }[]; animations: { samplers: { output: number }[] }[] };
  const bin = b.subarray(20 + jl + 8);
  const comps: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };
  let bonesMoving = 0;
  let bonesStuck = 0;
  for (const s of g.animations[0].samplers) {
    const acc = g.accessors[s.output];
    const o = (g.bufferViews[acc.bufferView].byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const c = comps[acc.type];
    for (let k = 0; k < c; k++) {
      const v = Array.from({ length: acc.count }, (_, i) => bin.readFloatLE(o + (i * c + k) * 4));
      if (Math.max(...v) - Math.min(...v) < 1e-6) continue;
      bonesMoving++;
      if (stuck(v) < acc.count * 0.9) bonesStuck++;
    }
  }
  ok(bonesMoving >= 5 && bonesStuck === 0, `물기둥 fskb 움직이는 채널 ${bonesMoving}개, 끝값 고정 ${bonesStuck}개(기둥 2~5 는 키가 −50~264 로 엇갈림)`);
}

console.log('11. menu_common 애니 커브 반복(기구 fmab·퀘스트 발판 fskb — 원본 wrap Repeat)');
{
  const rb = fmabRepeatBad(join(W, 'anim', 'menu_cmn_balloon00.fmab.json'), [
    ['menu01_balloon00_mt', 'texture_srt1', '0x10', 0, 600],
    ['menu01_balloon00_mt', 'utility_parameter0', '0x0C', 0, 300],
    ['menu01_balloon00_mt', 'utility_parameter1', '0x00', -20, 290],
  ]);
  ok(rb.length === 0, `기구 fmab Repeat 커브 3개가 구간 앞뒤에서도 반복 ${rb.join(' · ')}`);
  const rq = glbRepeatBad(join(W, 'model', 'menu_cmn_quest_platform00.glb'), 'menu_cmn_quest_platform00_ev_quest_start_cut02', [['menu_cmn_quest_platform00', 0, 100]]);
  ok(rq.length === 0, `퀘스트 발판 cut02(320f, 0~100f Repeat)가 100f 주기 ${rq.join(' · ')}`);
}

console.log(`${count - fails}/${count}`);
if (fails) process.exit(1);
