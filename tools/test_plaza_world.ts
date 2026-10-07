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
import { COLLIDER_STEP, MeshCollider, type MeshColliderData } from '../script/shell/stage3d/meshCollider';
import { graphSource, type GraphDef, type GraphSource } from '../script/shell/stage3d/graph';
import { patchRefraction, patchSss, patchUnlit, patchVertexColor, patchWater } from '../script/shell/stage3d/material';
import { initParams, patchSrt0, srtMatrix } from '../script/shell/stage3d/params';

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
  const wrap = (vs: string, fs: string, tangent: boolean): { vs: string; fs: string } => {
    const t = tangent ? '#define USE_TANGENT' + String.fromCharCode(10) : '';
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
  const patched = (name: string, fn: (m: THREE.MeshStandardMaterial) => void): { name: string; vs: string; fs: string } => {
    const m = new THREE.MeshStandardMaterial();
    fn(m);
    const sh = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(sh, null as unknown as THREE.WebGLRenderer);
    return { name, ...wrap(sh.vertexShader, sh.fragmentShader, false) };
  };
  const dummy = new THREE.Texture();
  const jobs = [
    { name: '(표준)', ...build(null, false) },
    patched('(무조명 shading_type 0)', (m) => patchUnlit(m)),
    patched('(SSS shading_type 2)', (m) => patchSss(m, dummy, dummy, 1)),
    patched('(srt0)', (m) => patchSrt0(m, initParams(m, { shader: { options: {} } }))),
    patched('(굴절 refraction)', (m) => patchRefraction(m, 0, 0.5, 1, true)),
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

console.log('8. import 경계(mgm_common.md §9.1)');
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
      const okSpec = spec === 'three' || spec.startsWith('three/') || (spec.startsWith('.') && allowed.some((a) => resolve(dir, spec).startsWith(join(SHELL, a))));
      ok(okSpec, `${p2.slice(WEB.length + 1)} import ${spec}`);
    }
  }
};
scan(join(SHELL, 'plaza'), ['plaza', 'stage3d', 'mgmcommon', 'online', 'charselect']);
scan(join(SHELL, 'stage3d'), ['stage3d']);

console.log(`${count - fails}/${count}`);
if (fails) process.exit(1);
