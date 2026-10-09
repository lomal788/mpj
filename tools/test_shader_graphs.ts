/** 셰이더 사전·재결합·원본 SASS f32 표본·three 패치 GLSL 컴파일 노드 시험. 화면 생성·촬영 없음. 14_shader_graphs.md §7·§10. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import { applyGraph, graphSource, type GraphDef } from '../script/shell/stage3d/graph';
import { MaterialSetup, patchUnlit, patchVertexColor } from '../script/shell/stage3d/material';
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
const python = join(ROOT, '.venv/Scripts/python.exe');
const requests = records.flatMap((r) => r.variants.map((v) => ({ name: r.name, variant: v, options: material(v).shader!.options, material: material(v), environment: JSON.parse(readFileSync(join(WEB, 'assets/mg', v.game, 'manifest.json'), 'utf8')).env })));
const selected = spawnSync(python, ['-c', String.raw`import json,sys
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/"tools/analysis"))
import shader_graph_dictionary as d
out=[]
for r in json.load(sys.stdin):
    graph=d.load_definition(r["options"],material=r["material"],environment=r["environment"])
    if graph:out.append(dict(name=r["name"],variant=r["variant"],graph=graph))
print(json.dumps(out,ensure_ascii=False))`], { cwd: WEB, input: JSON.stringify(requests), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 16 * 1024 * 1024 });
ok(selected.status === 0, `실제 재질 사전 분기 ${selected.stderr}`);
const effective = (JSON.parse(selected.stdout) as { name: string; variant: Variant; graph: GraphDef }[]).map((v) => ({ ...records.find((r) => r.name === v.name)!, graph: v.graph, variants: [v.variant] }));
const active = records.filter((r) => r.graph && ['decoded', 'approx'].includes(r.status));
for (const r of records) {
  const options = Object.fromEntries(Object.entries(r.options).sort(([a], [b]) => a.localeCompare(b)));
  const hash = createHash('sha256').update(JSON.stringify(options)).digest('hex');
  ok(r.version === 1 && r.name === hash + '.json', `사전 키 ${r.name}`);
  for (const v of r.variants) {
    const opts = material(v).shader?.options ?? {};
    ok(Object.entries(options).every(([k, value]) => opts[k] === value), `${v.game}/${v.material} 옵션 일치`);
  }
}
for (const r of effective) {
  const def = r.graph;
  for (const v of r.variants) {
    const f = material(v);
    const manifest = JSON.parse(readFileSync(join(WEB, 'assets/mg', v.game, 'manifest.json'), 'utf8')) as { graphs: GraphDef[]; env: { windNoise?: string }; textures: Record<string, unknown> };
    const applied = manifest.graphs.find((g) => g.material === v.material && g.models.includes(v.model));
    ok(applied?.program === def.program, `${v.game}/${v.material} manifest 해시 반영`);
    for (const [key, value] of Object.entries(def)) {
      if (['material', 'models', 'program', 'samplers'].includes(key)) continue;
      ok(JSON.stringify((applied as unknown as Record<string, unknown> | undefined)?.[key]) === JSON.stringify(value), `${v.material} manifest 식 ${key}`);
    }
    const params = f.params ?? {};
    const source = graphSource(def, (n) => { const value = params[n]?.value; return Array.isArray(value) ? value.length : 1; });
    for (const sampler of source.texIndex.keys()) ok(def.samplerSources?.[sampler] === 'environment' ? manifest.env.windNoise === def.samplers[sampler] && !!manifest.textures[def.samplers[sampler]!] : f.samplers?.some((s) => s.sampler === sampler || s.slots.includes(sampler)) === true, `${v.game}/${v.material} 샘플러 ${sampler}`);
    for (const raw of source.raws) ok(raw in params, `${v.game}/${v.material} 파라미터 ${raw}`);
    const texts = JSON.stringify({ ...def, material: undefined, models: undefined, program: undefined, approx: undefined, samplers: undefined, samplerSources: undefined });
    const utilities = [...texts.matchAll(/\b([PC])([0-7])\b/g)];
    for (const m of utilities) ok(`material_utility_${m[1] === 'P' ? 'parameter' : 'color'}${m[2]}` in params, `${v.material} 유틸리티 ${m[0]}`);
    const attrs = glb(v).meshes.flatMap((m) => m.primitives.map((p) => p.attributes));
    for (const i of [1, 2, 3]) if (new RegExp(`\\buv${i}\\b`).test(texts)) ok(attrs.some((a) => `TEXCOORD_${i}` in a), `${v.material} uv${i} 데이터`);
    if (/\bc0\b/.test(texts)) ok(attrs.some((a) => '_C0' in a), `${v.material} c0 데이터`);
  }
}
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
r=next(r for r in records if r["graph"])
variants=[{"selector":{"static_opt_base_color_texture":str(i)},"requiresSamplers":["_a0"],"status":"approx","graph":r["graph"]} for i in [0,1]]
branch=dict(r,status="partial",graph=None,graphVariants=variants)
f={"name":"분기대상","samplers":[{"sampler":"_a0","texture":"대상텍스처","slots":[]}]}
with patch("shader_graph_dictionary.Path.read_text",return_value=json.dumps(branch)):
    assert d.load_definition(r["options"]) is None; checks+=1
    opts0=dict(r["options"],static_opt_base_color_texture="0")
    opts1=dict(r["options"],static_opt_base_color_texture="1")
    a=d.load_definition(opts0,material=f); b=d.load_definition(opts1,material=f)
    assert a and b and a["program"]!=b["program"]; checks+=1
    assert d.graph_id(opts0)==d.graph_id(opts1); checks+=1
    assert d.load_definition(dict(opts0,static_opt_base_color_texture="2"),material=f) is None; checks+=1
    assert d.load_definition(opts0,material={"samplers":[]}) is None; checks+=1
    assert d.load_definition(opts0,material={"samplers":[{"sampler":"_a0","texture":None}]}) is None; checks+=1
branch["graphVariants"].append(variants[0])
with patch("shader_graph_dictionary.Path.read_text",return_value=json.dumps(branch)):
    try: d.load_definition(opts0,material=f); raise AssertionError("분기 중복 허용")
    except ValueError: checks+=1
wind=next(r for r in records if r["options"].get("vertex_shader_graph_color")=="2522730817")
f={"name":"환경대상","shader":{"attribAssign":{"_c0":"_c0"}},"samplers":[]}
assert d.load_definition(wind["options"],material=f) is None; checks+=1
w=d.load_definition(wind["options"],material=f,environment={"windNoise":"다른게임잡음"})
assert w["samplers"]=={"sgLayer10":"다른게임잡음"}; checks+=1
assert d.bind_definition(w,f,"환경모델")["samplers"]==w["samplers"]; checks+=1
assert d.load_definition(wind["options"],material={"shader":{"attribAssign":{}}},environment={"windNoise":"다른게임잡음"}) is None; checks+=1
film=next(r for r in records if r["options"].get("fragment_shader_graph_color")=="2077426685")
v=next(v for v in film["graphVariants"] if len(v.get("requiresMissingSamplers",[]))==2)
f={"samplers":[{"sampler":"_a0","texture":"알베도","slots":[]}]}
g=d.load_definition(dict(film["options"],**v["selector"]),material=f)
assert g and 'vec3(0.0)' in g['fsPrelude']; checks+=1
f["samplers"]+=[{"sampler":"sg_utility_texture2d0","texture":"필름","slots":[]},{"sampler":"sg_utility_texture2d1","texture":"잡음","slots":[]}]
g2=d.load_definition(dict(film["options"],**v["selector"]),material=f)
assert g2 and g2['program']!=g['program'] and 'sg_utility_texture2d1' in g2['fsPrelude']; checks+=1
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
    if (!['fadd', 'fmul', 'ffma', 'fmnmx', 'mufu', 'rro', 'mov', 'mov32i'].includes(op)) continue;
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
    } else if (op === 'fmnmx') value = tokens.includes('not') ? Math.max(a, operand(tokens, endA)[0]) : Math.min(a, operand(tokens, endA)[0]);
    else if (op === 'mufu') value = F(special === 'rcp' ? 1 / a : special === 'rsq' ? 1 / Math.sqrt(a) : special === 'lg2' ? Math.log2(a) : special === 'ex2' ? 2 ** a : special === 'sin' ? Math.sin(a) : NaN);
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

const screenGraph = active.find((r) => r.options.fragment_shader_graph_color === '1946182249')!;
const screenLines = readFileSync(join(ROOT, screenGraph.variants[0].fs), 'utf8').split(/\r?\n/);
const screenMath = screenLines.slice(12, 26).filter((l) => !l.startsWith('ipa'));
const colorMath = screenLines.slice(142, 165).filter((l) => /^(fadd ftz \$r(26|25|27) |ffma ftz \$r(26|25|27) |mov \$r27 |fmul ftz \$r(12|13|14) )/.test(l));
for (let i = 0; i < 64; i++) {
  const a = [rand(), rand(), rand()]; const mask = [rand(), rand(), rand()]; const c0 = [rand() * 2, rand() * 2, rand() * 2]; const c1 = [rand(), rand(), rand()];
  const un: Record<string, number> = {};
  for (let c = 0; c < 3; c++) { const suf = c ? `+0x${c * 4}` : ''; un['Material.material_utility_color0' + suf] = F(c0[c]); un['Material.material_utility_color1' + suf] = c1[c]; }
  const out = sas(colorMath, { $r30: F(c0[0]), $r31: F(c0[1]), $r8: mask[0], $r9: mask[1], $r10: mask[2], $r12: a[0], $r13: a[1], $r14: a[2] }, un);
  const expected = a.map((x, c) => F(x * fm(F(F(c0[c]) - c1[c]), mask[c], c1[c])));
  const error = Math.max(...expected.map((x, c) => Math.abs(x - out['$r' + (12 + c)])));
  maxError = Math.max(maxError, error); ok(error <= 2e-7, `G09 SASS RGB ${i} 오차 ${error}`);
}
for (const [x, y] of [[0.5, 0.5], [640, 360], [-4, 100], [1500, 800], [100, -2]]) {
  const un = { 'Layer[0x470]': 0, 'Layer[0x474]': 0, 'Layer[0x488]': F(1 / 1280), 'Layer[0x48c]': F(1 / 720), 'Layer[0x458]': F(1 / 1280), 'Layer[0x45c]': F(1 / 720) };
  const out = sas(screenMath, { $r0: x, $r4: y, $r7: 1 }, un);
  const uv = [x, y].map((p, c) => F(Math.max(0, Math.min(F(1 - F(1 / [1280, 720][c])), F(p * F(1 / [1280, 720][c]))))));
  ok(out.$r8 === uv[0] && out.$r9 === uv[1], `G09 SASS screen clamp ${x}/${y}`);
}
for (const [program, readUnder, expectedMuddy] of [['graph:test', '0', false], ['graph:test', '1', true], ['plaza', '0', true]] as const) {
  const f = { name: 'waterFixture', shader: { options: { static_opt_shader_graph: '1', static_opt_water_enable: '1', static_opt_water_muddy_enable: '1', static_opt_read_under_water: readUnder, static_opt_state_type: '0' } }, params: { material_water_opacity: { value: 0 }, material_water_muddy_range: { value: 50 }, material_water_muddy_color: { value: [0.8, 1, 1] } } } as Fres;
  const m = new THREE.MeshStandardMaterial(); m.userData.fres = f;
  const setup = new MaterialSetup({ url: () => '' }, null as unknown as THREE.WebGLRenderer, {}, { pmrem: {} as THREE.PMREMGenerator, cubes: new Map() });
  setup.globals = { env: { P: Array.from({ length: 4 }, () => new THREE.Vector4()) }, ms: { value: 0 }, worldFrame: { value: 0 }, sunDir: new THREE.Vector3(0, 1, 0) } as unknown as StageGlobals;
  setup.graphs = { waterFixture: [{ material: 'waterFixture', models: ['fixture'], program, samplers: {}, baseColor: 'vec3(0.1)' }] };
  await setup.prepare(new THREE.Mesh(new THREE.PlaneGeometry(), m), 'fixture');
  ok(m.customProgramCacheKey().includes('mpj-water') === expectedMuddy, `water 원본 옵션 ${program}/${readUnder} 범위 보존`);
}
const windCase = effective.find((r) => r.options.vertex_shader_graph_color === '2522730817')!;
const windDef = windCase.graph;
const windFres = material(windCase.variants[0]);
const windParams = initParams(new THREE.MeshStandardMaterial(), windFres);
const windGlobals = { env: { P: Array.from({ length: 4 }, () => new THREE.Vector4()) }, ms: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) } } as unknown as StageGlobals;
let rejected = false;
try { await applyGraph(new THREE.MeshStandardMaterial(), windDef, windFres, windParams, windGlobals, async () => ({ tex: new THREE.Texture(), snorm: false })); } catch (e) { rejected = String(e).includes('World 프레임 입력 누락'); }
ok(rejected, 'G01 필수 worldFrame 누락 거절');
windGlobals.worldFrame = { value: 0xffffffff };
rejected = false;
try { await applyGraph(new THREE.MeshStandardMaterial(), windDef, windFres, windParams, windGlobals, async () => null); } catch (e) { rejected = String(e).includes('환경 샘플러 누락'); }
ok(rejected, 'G01 환경 잡음 로드 실패 거절');
const clockMaterial = new THREE.MeshStandardMaterial();
await applyGraph(clockMaterial, windDef, windFres, windParams, windGlobals, async () => ({ tex: new THREE.Texture(), snorm: false }));
const clockShader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms) };
clockMaterial.onBeforeCompile(clockShader as Parameters<typeof clockMaterial.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
ok(clockShader.uniforms.mpjWorldFrame === windGlobals.worldFrame && clockShader.uniforms.mpjWorldFrame.value === 0xffffffff, 'World u32 참조 공급·float24 경계 보존');
windGlobals.worldFrame.value = 60;
ok(clockShader.uniforms.mpjWorldFrame.value === 60 && windGlobals.ms.value === 0, '프레임 업데이트 참조·ms 독립');
for (const [frame, divisor, expected] of [[60, 2000, 0.03], [60, 800, 0.075], [0xffffffff, 2000, 0.6475]]) ok(Math.abs(Math.fround((frame >>> 0) % divisor / divisor) - expected) < 1e-7, `World 프레임 나머지 ${frame}/${divisor}`);
console.log(`사전 ${records.length}, 단일 정의 ${active.length}, 실제 적용 재질 ${effective.length}; SASS RGB/alpha304·시간/SIN176·screen5, 최대절대오차 ${maxError}`);

const resolveChunks = (s: string): string => s.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_m, n: string) => resolveChunks((THREE.ShaderChunk as Record<string, string>)[n] ?? `#error missing ${n}`));
const unroll = (s: string): string => s.replace(/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g, (_m, a: string, b: string, body: string) => Array.from({ length: +b - +a }, (_, k) => body.replace(/\[\s*i\s*\]/g, `[ ${k + +a} ]`).replace(/UNROLLED_LOOP_INDEX/g, String(k + +a))).join(''));
const nums = (s: string): string => s.replace(/NUM_DIR_LIGHTS/g, '1').replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g, '0').replace(/NUM_SPOT_LIGHT_(MAPS|COORDS|SHADOWS)/g, '0').replace(/NUM_(SPOT|RECT_AREA|POINT|HEMI)_LIGHTS/g, '0').replace(/NUM_DIR_LIGHT_SHADOWS/g, '0').replace(/NUM_POINT_LIGHT_SHADOWS/g, '0').replace(/NUM_CLIPPING_PLANES|UNION_CLIPPING_PLANES/g, '0');
const defs = '#define STANDARD\n#define USE_UV\n#define USE_MAP\n#define MAP_UV uv\n#define USE_NORMALMAP\n#define USE_NORMALMAP_TANGENTSPACE\n#define NORMALMAP_UV uv\n#define USE_ROUGHNESSMAP\n#define ROUGHNESSMAP_UV uv\n';
const vsHead = `#version 300 es\n#define attribute in\n#define varying out\n#define texture2D texture\nprecision highp float;\nprecision highp int;\n${defs}\nuniform mat4 modelMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\nuniform mat4 viewMatrix;\nuniform mat3 normalMatrix;\nuniform vec3 cameraPosition;\nuniform bool isOrthographic;\nattribute vec3 position;\nattribute vec3 normal;\nattribute vec2 uv;\n`;
const fsHead = `#version 300 es\n#define varying in\nlayout(location=0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n#define texture2D texture\n#define textureCube texture\n#define texture2DLodEXT textureLod\n#define textureCubeLodEXT textureLod\nprecision highp float;\nprecision highp int;\n${defs}\nuniform mat4 viewMatrix;\nuniform vec3 cameraPosition;\nuniform bool isOrthographic;\nvec4 linearToOutputTexel(vec4 value){return value;}\n`;
const jobs: { name: string; vs: string; fs: string }[] = [];
for (const r of effective) {
  for (const reverse of [false, true]) {
    const v = r.variants[0]; const f = material(v); const m = new THREE.MeshStandardMaterial(); const p = initParams(m, f);
    let priorRenderCalls = 0; m.onBeforeRender = () => { priorRenderCalls++; };
    const globals = { env: { P: Array.from({ length: 4 }, () => new THREE.Vector4()) }, ms: { value: 0 }, worldFrame: { value: 0 }, sunDir: new THREE.Vector3(0, 1, 0) } as unknown as StageGlobals;
    const patch = (): void => { if (f.shader?.options?.static_opt_shading_type === '0') patchUnlit(m); if (f.shader?.options?.static_opt_mul_vertex_base_color === '1') patchVertexColor(m, 0); };
    if (reverse) patch();
    await applyGraph(m, r.graph!, f, p, globals, async () => ({ tex: new THREE.Texture(), snorm: false }));
    if (!reverse) patch();
    const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(sh, null as unknown as THREE.WebGLRenderer);
    ok((sh.vertexShader.match(/attribute vec4 _c0;/g) ?? []).length <= 1, `${v.material} 패치 순서${reverse} 정점색 선언1`);
    if (sh.fragmentShader.includes('vec2 screenUV =')) {
      const vp = new THREE.Vector4(30, 20, 1280, 720); const renderer = { getCurrentViewport: (value: THREE.Vector4) => value.copy(vp) } as unknown as THREE.WebGLRenderer;
      Reflect.apply(m.onBeforeRender, m, [renderer, null, null, null, null, null]);
      const u = sh.uniforms.mpjGraphViewport.value as THREE.Vector4; const version = m.version;
      ok(u.equals(vp) && priorRenderCalls === 1, `${v.material} viewport·이전 onBeforeRender 보존`);
      Reflect.apply(m.onBeforeRender, m, [renderer, null, null, null, null, null]);
      ok(m.version === version, `${v.material} viewport 불변 때 재준비 없음`);
      vp.set(12, 18, 640, 360); Reflect.apply(m.onBeforeRender, m, [renderer, null, null, null, null, null]);
      ok(u.equals(vp) && m.version > version, `${v.material} viewport 변경 재업로드`);
    }
    if (r.graph.aoMode === 'replace') ok(!sh.fragmentShader.includes('#include <aomap_fragment>') && sh.fragmentShader.includes('indirectDiffuse *= mpjAO'), `${v.material} AO 대체·중복곱 없음`);

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
