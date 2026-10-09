/** 셰이더 사전·재결합·원본 SASS f32 표본·three 패치 GLSL 컴파일 노드 시험. 화면 생성·촬영 없음. 14_shader_graphs.md §7·§10. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import { applyGraph, graphSource, type GraphDef } from '../script/shell/stage3d/graph';
import { patchUnlit, patchVertexColor } from '../script/shell/stage3d/material';
import { initParams } from '../script/shell/stage3d/params';
import type { Fres } from '../script/shell/stage3d/types';
import type { StageGlobals } from '../script/shell/stage3d/stage';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(WEB, '..');
type Variant = { game: string; model: string; material: string; fs: string; vs: string };
type RecordDef = { version: number; options: Record<string, string>; status: string; graph: GraphDef | null; variants: Variant[] };
const dir = join(ROOT, 'analysis/mat/graphs');
const records = readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => ({ name: n, ...JSON.parse(readFileSync(join(dir, n), 'utf8')) as RecordDef }));
let count = 0;
let fails = 0;
const ok = (condition: boolean, message: string): void => { count++; if (!condition) { fails++; console.log('실패:', message); } };
const glb = (v: Variant): { materials: { extras: { fres: Fres } }[]; meshes: { primitives: { attributes: Record<string, number> }[] }[] } => {
  const b = readFileSync(join(WEB, 'assets/mg', v.game, 'model', v.model + '.glb'));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
};
const material = (v: Variant): Fres => glb(v).materials.find((m) => m.extras?.fres?.name === v.material)!.extras.fres;
const active = records.filter((r) => r.graph && ['decoded', 'approx'].includes(r.status));
for (const r of records) {
  const options = Object.fromEntries(Object.entries(r.options).sort(([a], [b]) => a.localeCompare(b)));
  const hash = createHash('sha256').update(JSON.stringify(options)).digest('hex');
  ok(r.version === 1 && r.name === hash + '.json', `사전 키 ${r.name}`);
  for (const v of r.variants) {
    const opts = material(v).shader?.options ?? {};
    ok(Object.entries(options).every(([k, value]) => opts[k] === value), `${v.game}/${v.material} 옵션 일치`);
  }
  if (!r.graph) continue;
  const def = r.graph;
  for (const v of r.variants) {
    const f = material(v);
    const manifest = JSON.parse(readFileSync(join(WEB, 'assets/mg', v.game, 'manifest.json'), 'utf8')) as { graphs: GraphDef[] };
    const applied = manifest.graphs.find((g) => g.material === v.material && g.models.includes(v.model));
    ok(applied?.program === `graph:${r.name.slice(0, -5)}`, `${v.game}/${v.material} manifest 해시 반영`);
    for (const [key, value] of Object.entries(def)) {
      if (['material', 'models', 'program', 'samplers'].includes(key)) continue;
      ok(JSON.stringify((applied as unknown as Record<string, unknown> | undefined)?.[key]) === JSON.stringify(value), `${v.material} manifest 식 ${key}`);
    }
    const params = f.params ?? {};
    const source = graphSource(def, (n) => { const value = params[n]?.value; return Array.isArray(value) ? value.length : 1; });
    for (const sampler of source.texIndex.keys()) ok(f.samplers?.some((s) => s.sampler === sampler || s.slots.includes(sampler)) === true, `${v.game}/${v.material} 샘플러 ${sampler}`);
    for (const raw of source.raws) ok(raw in params, `${v.game}/${v.material} 파라미터 ${raw}`);
    const texts = JSON.stringify(def);
    const utilities = [...texts.matchAll(/\b([PC])([0-7])\b/g)];
    for (const m of utilities) ok(`material_utility_${m[1] === 'P' ? 'parameter' : 'color'}${m[2]}` in params, `${v.material} 유틸리티 ${m[0]}`);
    const attrs = glb(v).meshes.flatMap((m) => m.primitives.map((p) => p.attributes));
    if (texts.includes('uv1')) ok(attrs.some((a) => 'TEXCOORD_1' in a), `${v.material} uv1 데이터`);
    if (texts.includes('c0')) ok(attrs.some((a) => '_C0' in a), `${v.material} c0 데이터`);
  }
}
const python = join(ROOT, '.venv/Scripts/python.exe');
const py = String.raw`
import copy,json,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path.cwd()/"tools/analysis"))
import shader_graph_dictionary as d
records=json.load(sys.stdin)
checks=0
for r in records:
    x=d.load_definition(r["options"])
    assert bool(x)==(r["status"] in ["decoded","approx"])
    checks+=1
    if not x: continue
    reversed_opts=dict(reversed(list(r["options"].items())))
    assert d.graph_id(r["options"])==d.graph_id(reversed_opts)
    checks+=1
    original=copy.deepcopy(x)
    f={"name":"다른_아카이브", "samplers":[{"sampler":"대상슬롯"+str(i),"texture":"대상텍스처"+str(i),"slots":[k]} for i,k in enumerate(x["samplers"])]}
    bound=d.bind_definition(x,f,"대상모델")
    assert bound["material"]==f["name"] and bound["models"]==["대상모델"] and x==original
    assert all(v=="대상텍스처"+str(i) for i,v in enumerate(bound["samplers"].values()))
    checks+=1
    if x["samplers"]:
        try: d.bind_definition(x,{"name":"누락","samplers":[]},"대상모델"); raise AssertionError("누락 허용")
        except ValueError: checks+=1
    broken=dict(r,options={})
    with patch("shader_graph_dictionary.Path.read_text",return_value=json.dumps(broken)):
        try: d.load_definition(r["options"]); raise AssertionError("오배정 허용")
        except ValueError: checks+=1
print(json.dumps({"checks":checks}))
`;
const dictTest = spawnSync(python, ['-c', py], { cwd: WEB, input: JSON.stringify(records), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
ok(dictTest.status === 0, `Python 사전 재사용·오배정 방지 ${dictTest.stdout.trim()} ${dictTest.stderr}`);

const F = Math.fround;
const fm = (a: number, b: number, c: number): number => F(a * b + c);
const sas = (lines: string[], registers: Record<string, number>, uniforms: Record<string, number>): Record<string, number> => {
  const regs = { ...registers };
  const operand = (tokens: string[], at: number): [number, number] => {
    let negative = false;
    let absolute = false;
    while (tokens[at] === 'neg' || tokens[at] === 'abs') { if (tokens[at] === 'neg') negative = !negative; else absolute = true; at++; }
    const tok = tokens[at++];
    let n = tok in regs ? regs[tok] : tok in uniforms ? uniforms[tok] : tok.startsWith('0x') ? (() => { const b = Buffer.alloc(4); b.writeUInt32LE(Number(tok)); return b.readFloatLE(); })() : NaN;
    if (!Number.isFinite(n) && !['-Infinity', 'Infinity'].includes(String(n))) throw new Error(`SASS 피연산자 ${tok}`);
    if (absolute) n = Math.abs(n);
    if (negative) n = -n;
    return [n, at];
  };
  for (const line of lines) {
    const tokens = line.split(/\s+/);
    let op = tokens.shift()!;
    if (op === 'fmul32i') op = 'fmul';
    if (op === 'fadd32i') op = 'fadd';
    if (op === 'ipa') { regs[tokens.find((t) => t.startsWith('$r'))!] = uniforms[tokens.find((t) => t.startsWith('a['))!]; continue; }
    if (!['fadd', 'fmul', 'ffma', 'mufu', 'rro', 'mov', 'mov32i'].includes(op)) continue;
    const saturate = tokens.includes('sat');
    const roundMode = tokens.includes('rz');
    const special = tokens[0];
    while (!tokens[0].startsWith('$r')) tokens.shift();
    const dest = tokens.shift()!;
    const [a, endA] = operand(tokens, 0);
    let value = a;
    if (op === 'fadd' || op === 'fmul' || op === 'ffma') {
      const [b, endB] = operand(tokens, endA);
      value = op === 'fadd' ? F(a + b) : op === 'fmul' ? F(a * b) : fm(a, b, operand(tokens, endB)[0]);
    } else if (op === 'mufu') value = F(special === 'rcp' ? 1 / a : special === 'rsq' ? 1 / Math.sqrt(a) : special === 'lg2' ? Math.log2(a) : special === 'ex2' ? 2 ** a : special === 'sin' ? Math.sin(a) : NaN);
    if (roundMode) throw new Error('표본 시험의 미지원 반올림');
    if (saturate) value = Math.min(Math.max(value, 0), 1);
    regs[dest] = F(value);
  }
  return regs;
};
const spot = active.find((r) => r.options.fragment_shader_graph_color === '1807808248')!;
const spotLines = readFileSync(join(ROOT, spot.variants[0].fs), 'utf8').split(/\r?\n/).filter(Boolean);
const arithmetic = spotLines.slice(spotLines.findIndex((l) => l.startsWith('fadd ftz $r7')), -2);
const phaseLines = spotLines.slice(spotLines.findIndex((l) => l.startsWith('mov32i $r9 0x3f000000')), spotLines.findIndex((l) => l.startsWith('fadd ftz $r7')));
const phaseConstant = Number(/360u\)\s*\*\s*([0-9.]+)/.exec(spot.graph!.fsPrelude!)?.[1]);
const constantBytes = Buffer.alloc(4); constantBytes.writeFloatLE(phaseConstant);
ok(constantBytes.readUInt32LE() === 0x3c0efa35, '탐조등 그래프 상수 비트 0x3c0efa35=π/360');
let seed = 0x67cd34e1;
const rand = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return F(seed / 2 ** 32); };
let maxError = 0;
for (const ms of [0, 1, 89, 90, 180, 270, 359, 360, 720, 123456, 0xffffffff]) {
  const x = BigInt(ms);
  const hi = (x * 0x6c16c16dn) >> 32n;
  const quotient = (((x - hi) >> 1n) + hi) >> 8n;
  const remainder = Number(x - quotient * 360n);
  ok(remainder === ms % 360, `SASS 정수 나머지 ${ms}`);
  for (let sample = 0; sample < 16; sample++) {
    const a = [rand(), rand(), rand()]; const b = [rand(), rand(), rand()];
    const c = [rand(), rand(), rand()]; const d = [rand(), rand(), rand()]; const p = [rand(), rand()];
    const rad = F(remainder * F(phaseConstant));
    const phase = fm(F(Math.sin(rad)), 0.5, 0.5);
    const phaseOut = sas(phaseLines, { $r8: F(remainder) }, {}).$r3;
    ok(Math.abs(phase - phaseOut) <= 1e-7, `SASS 시간·SIN 단계 ${ms}/${sample}`);
    const uniforms: Record<string, number> = { 'Material.material_utility_parameter0': p[0], 'Material.material_utility_parameter0+0x4': p[1] };
    c.forEach((v, i) => uniforms['Material.material_utility_color0' + (i ? `+0x${i * 4}` : '')] = v);
    d.forEach((v, i) => uniforms['Material.material_utility_color1' + (i ? `+0x${i * 4}` : '')] = v);
    const out = sas(arithmetic, { $r0: a[0], $r1: a[1], $r2: a[2], $r4: b[0], $r5: b[1], $r6: b[2], $r3: phase }, uniforms);
    const scalar = F(phase * fm(F(b[0] - a[0]), p[0], a[0]));
    const result = a.map((v, i) => { const q = F(b[i] * F(F(v + c[i]) * p[0])); return fm(scalar, c[i], fm(F(d[i] - q), p[1], q)); });
    const error = Math.max(...result.map((v, i) => Math.abs(v - out['$r' + i])));
    maxError = Math.max(maxError, error);
    ok(error <= 2e-7, `탐조등 SASS 표본 ${ms}/${sample} 오차 ${error}`);
  }
}
const hologram = active.find((r) => r.options.fragment_shader_graph_color === '1147244367')!;
const hLines = readFileSync(join(ROOT, hologram.variants[0].fs), 'utf8').split(/\r?\n/);
const hStart = hLines.findIndex((l) => l.startsWith('mov $r7 Material.material_emissive_color_scale'));
const hArithmetic = hLines.slice(hStart).filter(Boolean);
for (let sample = 0; sample < 64; sample++) {
  const color = [rand(), rand(), rand()]; const base = [rand(), rand(), rand()]; const emit = [rand(), rand(), rand()];
  const dot = F(0.1 + 0.9 * rand()); const p = [F(0.5 + 3 * rand()), rand()]; const scale = F(2 * rand());
  const un: Record<string, number> = { 'Material.material_emissive_color_scale': scale, 'Material.material_utility_parameter0': p[0], 'Material.material_utility_parameter0+0x4': p[1], 'Model[0x20c]': 1 };
  for (let i = 0; i < 3; i++) { const suffix = i ? `+0x${i * 4}` : ''; un['Material.material_base_color' + suffix] = base[i]; un['Material.material_emissive_color' + suffix] = emit[i]; }
  un['a[v14.x]'] = color[0];
  const out = sas(hArithmetic, { $r0: 0, $r1: color[1], $r2: color[2], $r6: 0, $r4: 0, $r5: 1, $r8: dot, $r9: F(Math.sqrt(1 - dot * dot)), $r10: 0 }, un);
  const result = color.map((v, i) => F(v * F(fm(v, base[i], F(scale * emit[i])) * p[1])));
  const error = Math.max(...result.map((v, i) => Math.abs(v - out['$r' + i])), Math.abs(F(dot ** p[0]) - out.$r3));
  maxError = Math.max(maxError, error);
  ok(error <= 2e-7, `홀로그램 SASS 표본 ${sample} 오차 ${error}`);
}
console.log(`사전 ${records.length}, 적용 ${active.length}; SASS 표본240, 최대절대오차 ${maxError}`);

const resolveChunks = (s: string): string => s.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_m, n: string) => resolveChunks((THREE.ShaderChunk as Record<string, string>)[n] ?? `#error missing ${n}`));
const unroll = (s: string): string => s.replace(/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g, (_m, a: string, b: string, body: string) => Array.from({ length: +b - +a }, (_, k) => body.replace(/\[\s*i\s*\]/g, `[ ${k + +a} ]`).replace(/UNROLLED_LOOP_INDEX/g, String(k + +a))).join(''));
const nums = (s: string): string => s.replace(/NUM_DIR_LIGHTS/g, '1').replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g, '0').replace(/NUM_SPOT_LIGHT_(MAPS|COORDS|SHADOWS)/g, '0').replace(/NUM_(SPOT|RECT_AREA|POINT|HEMI)_LIGHTS/g, '0').replace(/NUM_DIR_LIGHT_SHADOWS/g, '0').replace(/NUM_POINT_LIGHT_SHADOWS/g, '0').replace(/NUM_CLIPPING_PLANES|UNION_CLIPPING_PLANES/g, '0');
const defs = '#define STANDARD\n#define USE_UV\n#define USE_MAP\n#define MAP_UV uv\n#define USE_NORMALMAP\n#define USE_NORMALMAP_TANGENTSPACE\n#define NORMALMAP_UV uv\n#define USE_ROUGHNESSMAP\n#define ROUGHNESSMAP_UV uv\n';
const vsHead = `#version 300 es\n#define attribute in\n#define varying out\n#define texture2D texture\nprecision highp float;\nprecision highp int;\n${defs}\nuniform mat4 modelMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\nuniform mat4 viewMatrix;\nuniform mat3 normalMatrix;\nuniform vec3 cameraPosition;\nuniform bool isOrthographic;\nattribute vec3 position;\nattribute vec3 normal;\nattribute vec2 uv;\n`;
const fsHead = `#version 300 es\n#define varying in\nlayout(location=0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n#define texture2D texture\n#define textureCube texture\n#define texture2DLodEXT textureLod\n#define textureCubeLodEXT textureLod\nprecision highp float;\nprecision highp int;\n${defs}\nuniform mat4 viewMatrix;\nuniform vec3 cameraPosition;\nuniform bool isOrthographic;\nvec4 linearToOutputTexel(vec4 value){return value;}\n`;
const jobs: { name: string; vs: string; fs: string }[] = [];
for (const r of active) {
  for (const reverse of [false, true]) {
    const v = r.variants[0]; const f = material(v); const m = new THREE.MeshStandardMaterial(); const p = initParams(m, f);
    const globals = { env: { P: Array.from({ length: 4 }, () => new THREE.Vector4()) }, ms: { value: 0 }, sunDir: new THREE.Vector3(0, 1, 0) } as unknown as StageGlobals;
    const patch = (): void => { if (f.shader?.options?.static_opt_shading_type === '0') patchUnlit(m); if (f.shader?.options?.static_opt_mul_vertex_base_color === '1') patchVertexColor(m, 0); };
    if (reverse) patch();
    await applyGraph(m, r.graph!, f, p, globals, async () => ({ tex: new THREE.Texture(), snorm: false }));
    if (!reverse) patch();
    const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(sh, null as unknown as THREE.WebGLRenderer);
    ok((sh.vertexShader.match(/attribute vec4 _c0;/g) ?? []).length <= 1, `${v.material} 패치 순서${reverse} 정점색 선언1`);
    jobs.push({ name: `${v.material}/순서${reverse}`, vs: vsHead + unroll(nums(resolveChunks(sh.vertexShader))), fs: fsHead + unroll(nums(resolveChunks(sh.fragmentShader))) });
  }
}
const comp = spawnSync(python, [join(WEB, 'tools/analysis/shader_graph_compile.py')], { cwd: WEB, input: JSON.stringify(jobs), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 16 * 1024 * 1024 });
ok(comp.status === 0, `GLSL 컴파일기 실행 ${comp.stderr}`);
if (comp.status === 0) {
  const result = JSON.parse(comp.stdout) as { renderer: string; version: string; results: { name: string; ok: boolean; errors: string[] }[] };
  for (const item of result.results) ok(item.ok, `GLSL ${item.name}: ${item.errors.join(' / ')}`);
  console.log(`GLSL 컴파일·링크 ${result.results.filter((r) => r.ok).length}/${result.results.length}: ${result.renderer} ${result.version}`);
}
console.log(`${count - fails}/${count}`);
if (fails) process.exit(1);
