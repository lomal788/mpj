// 웹 코드의 원본 주소 참조 → @orig 연결(1단계) + 디컴파일 C 상수 비교 후보(2단계). LLM 없이 돈다.
//
//   node orig_scan.mjs --code <폴더> [--apply] [--report <md>]
//
// - 선언(함수·메서드·생성자·클래스·변수·속성) 바로 위 주석의 주소(@0x71…, 0x71…, FUN_71…)를 그 선언에 붙인다.
// - 모듈: 주소 바로 앞(같은 줄 40자 안)에 적힌 모듈 이름, 없으면 파일 경로의 모듈 폴더 이름, 없으면 config.json 의 기본 모듈.
// - db(web/ghidra/db)에서 함수 시작인지 확인한다. 함수 시작이 아니면 보고서에만 남긴다.
// - 표시를 다는 연결: 선언 이름 = 원본 함수 이름(대소문자·기호 무시)이거나, 주석의 주소가 하나뿐인 함수 선언.
//   수준은 ref(연결 확인, 수준 미정). 기존 주석은 바꾸지 않고 선언 바로 위에 /** @orig 모듈:주소 ref */ 를 넣는다.
// - 상수 비교: 연결된 함수의 디컴파일 C(analysis/decomp/INDEX.tsv)에서 실수 상수를 뽑아, 웹 선언 본문과 같은 파일에 없는 것을 후보로 올린다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const TOOLS = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CFG_PATH = process.env.GHIDRA_TOOLS_CONFIG || path.join(TOOLS, '..', 'config.json');
const cfgRaw = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const cfgBase = path.dirname(CFG_PATH);
const cfg = {
  db: path.resolve(cfgBase, cfgRaw.db),
  root: path.resolve(cfgBase, cfgRaw.repo_root || '../..'),
  decompIndex: path.resolve(cfgBase, cfgRaw.decomp_index || '../../analysis/decomp/INDEX.tsv'),
  defaultModule: cfgRaw.default_module || 'main',
  tsPackage: path.resolve(cfgBase, cfgRaw.typescript || '../node_modules/typescript'),
};
const require = createRequire(import.meta.url);
const ts = require(cfg.tsPackage);

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const codeDir = path.resolve(opt('--code'));
const apply = args.includes('--apply');
const reportPath = path.resolve(opt('--report', path.join(TOOLS, '..', 'reports', `orig_scan_${path.basename(codeDir)}.md`)));

// db: 모듈 → 함수표
const modules = new Map();
for (const dirent of walk(cfg.db)) {
  if (path.basename(dirent) !== 'meta.json') continue;
  const meta = JSON.parse(fs.readFileSync(dirent, 'utf8'));
  modules.set(meta.module.toLowerCase(), { dir: path.dirname(dirent), meta, funcs: null });
}
function funcsOf(mod) {
  const m = modules.get(mod);
  if (!m) return null;
  if (!m.funcs) {
    m.funcs = new Map();
    const fdir = path.join(m.dir, 'functions');
    for (const f of fs.readdirSync(fdir)) {
      const lines = fs.readFileSync(path.join(fdir, f), 'utf8').split('\n');
      for (const line of lines.slice(1)) {
        if (!line) continue;
        const c = line.split('\t');
        m.funcs.set(c[0], { addr: c[0], size: +c[1], name: c[2], ns: c[3], thunk: c[6] === '1', tags: c[7] });
      }
    }
  }
  return m.funcs;
}
const modNames = [...modules.keys()].sort((a, b) => b.length - a.length);
const modRe = new RegExp(`\\b(${modNames.map(escapeRe).join('|')})(?:\\.nso|\\.nro)?\\b`, 'gi');
const addrRe = /(?:@\s*)?(?:0x|FUN_)(71[0-9a-fA-F]{8})\b/g;
const origRe = /@orig\s+([A-Za-z0-9_.-]+):(?:0x)?([0-9a-fA-F]+)\s+(full|partial|approx|ref)\b/g;

// 디컴파일 C 색인
const cIndex = new Map();
if (fs.existsSync(cfg.decompIndex)) {
  for (const line of fs.readFileSync(cfg.decompIndex, 'utf8').split('\n').slice(1)) {
    const [a, name, file] = line.split('\t');
    if (!a || !file) continue;
    const key = a.toLowerCase();
    if (!cIndex.has(key)) cIndex.set(key, []);
    cIndex.get(key).push({ name: name.replace(/ \(created\)$/, ''), file });
  }
}
const cFileCache = new Map();
function cBody(mod, addr, dbName) {
  const rows = cIndex.get(addr) || [];
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const pick = rows.find(r => norm(r.name.split('::').pop()) === norm(dbName))
    || rows.find(r => r.file.toLowerCase().startsWith(mod))
    || (rows.length === 1 ? rows[0] : null);
  if (!pick) return null;
  const file = path.join(path.dirname(cfg.decompIndex), pick.file);
  if (!cFileCache.has(file)) cFileCache.set(file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  const text = cFileCache.get(file);
  const head = new RegExp(`^// ==== ${addr}\\b.*$`, 'mi');
  const m = head.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const end = rest.search(/^\/\/ ==== /m);
  return { file: pick.file, body: end >= 0 ? rest.slice(0, end) : rest };
}
const floatRe = /(?<![\w.])-?\d+\.\d+(?:[eE][-+]?\d+)?f?(?![\w.])/g;
const fmovRe = /NEON_fmov\(0x([0-9a-fA-F]{8}),/g;
const numRe = /(?<![\w.])\d+(?:\.\d+)?(?:[eE][-+]?\d+)?(?![\w.])/g;
const trivial = v => [0, 1, 0.5, 2].includes(Math.abs(v)) || Math.abs(v) < 1e-6;
const bitsToFloat = h => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, parseInt(h, 16)); return b.getFloat32(0); };
const floats = s => new Set([...[...s.matchAll(floatRe)].map(m => parseFloat(m[0])), ...[...s.matchAll(fmovRe)].map(m => bitsToFloat(m[1]))]
  .map(v => +Math.abs(v).toPrecision(6)).filter(v => !trivial(v)));
const piVals = [Math.PI, Math.PI * 2, Math.PI / 2, Math.PI / 4, Math.PI / 180, 180 / Math.PI];
const nums = s => new Set([...[...s.matchAll(numRe)].map(m => parseFloat(m[0])), ...(/Math\.PI|DEG|RAD/.test(s) ? piVals : [])]
  .map(v => +Math.abs(v).toPrecision(6)));

const declKinds = new Set([ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.MethodDeclaration, ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor, ts.SyntaxKind.SetAccessor, ts.SyntaxKind.ClassDeclaration, ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.PropertyDeclaration]);
const fnKinds = new Set([ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.MethodDeclaration, ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor, ts.SyntaxKind.SetAccessor]);

const out = { linked: [], already: [], weak: [], notFunc: [], unknownMod: [], constDiff: [], files: 0, edits: 0 };
for (const file of walk(codeDir)) {
  if (!/\.(ts|tsx|mts)$/.test(file) || file.includes('node_modules')) continue;
  out.files++;
  const text = fs.readFileSync(file, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const rel = path.relative(cfg.root, file).replace(/\\/g, '/');
  const fileMod = (rel.match(/\/(mg\d{4}|[a-z]+\d{2,})\//i) || [])[1]?.toLowerCase();
  const inserts = [];
  const visit = node => {
    if (declKinds.has(node.kind)) handle(node);
    ts.forEachChild(node, visit);
  };
  const handle = node => {
    const ranges = ts.getLeadingCommentRanges(text, node.pos) || [];
    const comment = ranges.map(r => text.slice(r.pos, r.end)).join('\n');
    const existing = new Set([...comment.matchAll(origRe)].map(m => `${m[1].toLowerCase()}:${m[2].toLowerCase()}`));
    const refs = [];
    for (const line of comment.split('\n')) {
      if (line.includes('@orig')) continue;
      for (const m of line.matchAll(addrRe)) {
        const before = line.slice(Math.max(0, m.index - 40), m.index);
        const mods = [...before.matchAll(modRe)];
        const explicit = mods.length > 0;
        const mod = (explicit ? mods[mods.length - 1][1] : (fileMod && modules.has(fileMod) ? fileMod : cfg.defaultModule)).toLowerCase();
        refs.push({ mod, addr: m[1].toLowerCase(), explicit });
      }
    }
    const uniq = [...new Map(refs.map(r => [`${r.mod}:${r.addr}`, r])).values()];
    const declName = declNameOf(node);
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const where = `${rel}:${line} ${declName}`;
    const tags = [];
    const link = (mod, f, by) => {
      const id = `${mod}:${f.addr}`;
      if (existing.has(id)) { out.already.push({ id, where }); return; }
      if (tags.includes(id)) return;
      tags.push(id);
      out.linked.push({ id, where, name: `${f.ns ? f.ns + '::' : ''}${f.name}`, by });
      const c = cBody(mod, f.addr, f.name);
      if (c) {
        const body = text.slice(node.getStart(sf), node.end);
        const webVals = new Set([...nums(body), ...nums(text)]);
        const missing = [...floats(c.body)].filter(v => ![...webVals].some(w => Math.abs(w - v) <= Math.abs(v) * 1e-4));
        if (missing.length) out.constDiff.push({ id, where, cfile: c.file, missing });
      }
    };
    for (const r of uniq) {
      let mod = r.mod;
      let funcs = funcsOf(mod);
      if (!funcs) { out.unknownMod.push({ id: `${mod}:${r.addr}`, where }); continue; }
      let f = funcs.get(r.addr);
      if (!f && !r.explicit && mod !== cfg.defaultModule) {
        const g = funcsOf(cfg.defaultModule)?.get(r.addr);
        if (g) { f = g; mod = cfg.defaultModule; }
      }
      const id = `${mod}:${r.addr}`;
      if (!f || f.thunk) { out.notFunc.push({ id, where, why: f ? 'thunk' : '함수 시작 아님' }); continue; }
      const nameMatch = norm(declName) && (norm(declName) === norm(f.name) || norm(declName) === norm(f.ns.split('::').pop()));
      const single = uniq.length === 1 && fnKinds.has(node.kind);
      if (!(nameMatch || single)) { out.weak.push({ id, where, name: f.name }); continue; }
      link(mod, f, nameMatch ? '주석 주소 + 이름 일치' : '주석 주소 하나');
    }
    if (!uniq.length && fnKinds.has(node.kind) && fileMod && modules.has(fileMod)) {
      const owner = ownerClassOf(node);
      const method = node.kind === ts.SyntaxKind.Constructor ? owner : declName;
      const idx = nameIndexOf(fileMod);
      const hits = owner ? idx.byMember.get(`${norm(owner)}.${norm(method)}`) : idx.byName.get(norm(method));
      if (hits && hits.length === 1 && norm(method).length >= 4) link(fileMod, hits[0], owner ? '이름 일치(클래스·메서드)' : '이름 일치(함수)');
      else if (hits && hits.length > 1) out.weak.push({ id: `${fileMod}:?`, where, name: `이름 같은 원본 ${hits.length}개` });
    }
    if (tags.length) {
      const start = node.getStart(sf);
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const indent = text.slice(lineStart, start).match(/^\s*/)[0];
      inserts.push({ at: lineStart, text: tags.map(t => `${indent}/** @orig ${t} ref */${eol}`).join('') });
    }
  };
  visit(sf);
  if (apply && inserts.length) {
    let s = text;
    for (const ins of inserts.sort((a, b) => b.at - a.at)) s = s.slice(0, ins.at) + ins.text + s.slice(ins.at);
    fs.writeFileSync(file, s);
    out.edits += inserts.length;
  }
}

const L = [];
L.push(`# @orig 연결·상수 비교 — ${path.relative(cfg.root, codeDir).replace(/\\/g, '/')}`, '');
L.push(`- 파일 ${out.files} · 연결 ${out.linked.length} · 이미 표시 ${out.already.length} · 약한 연결(표시 안 함) ${out.weak.length} · 함수 시작 아님 ${out.notFunc.length} · 모듈 모름 ${out.unknownMod.length}`);
L.push(`- 상수 차이 후보 ${out.constDiff.length} · ${apply ? `코드에 표시 ${out.edits}곳 추가` : '--apply 없이 실행(코드 그대로)'}`, '');
L.push('## 상수 차이 후보 (C에 있는 실수 상수가 웹 선언·파일에 없음)', '', '| 함수 | 웹 | C 파일 | C에만 있는 값 |', '|---|---|---|---|');
for (const d of out.constDiff.sort((a, b) => b.missing.length - a.missing.length)) L.push(`| ${d.id} | ${d.where} | ${d.cfile} | ${d.missing.join(', ')} |`);
L.push('', '## 연결', '', '| 함수 | 원본 이름 | 웹 | 근거 |', '|---|---|---|---|');
for (const d of out.linked) L.push(`| ${d.id} | ${d.name} | ${d.where} | ${d.by} |`);
L.push('', '## 약한 연결 (주석에 주소가 여럿이고 이름이 다름 — 사람이 확인)', '', '| 주소 | 원본 이름 | 웹 |', '|---|---|---|');
for (const d of out.weak) L.push(`| ${d.id} | ${d.name} | ${d.where} |`);
L.push('', '## 함수 시작 아님·모듈 모름', '');
for (const d of out.notFunc) L.push(`- ${d.id} (${d.why}) — ${d.where}`);
for (const d of out.unknownMod) L.push(`- ${d.id} (모듈 스냅샷 없음) — ${d.where}`);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, L.join('\n') + '\n');
console.log(`연결 ${out.linked.length} · 약한 ${out.weak.length} · 함수 아님 ${out.notFunc.length} · 상수 차이 후보 ${out.constDiff.length}${apply ? ` · 표시 ${out.edits}곳` : ''} → ${reportPath}`);

function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function nameIndexOf(mod) {
  const m = modules.get(mod);
  if (m.nameIndex) return m.nameIndex;
  const byMember = new Map(), byName = new Map();
  const add = (map, k, f) => { if (!map.has(k)) map.set(k, []); map.get(k).push(f); };
  for (const f of funcsOf(mod).values()) {
    if (f.thunk || /^(FUN_|thunk_|LAB_)/.test(f.name)) continue;
    const cls = f.ns ? f.ns.split('::').pop() : '';
    if (cls) add(byMember, `${norm(cls)}.${norm(f.name)}`, f);
    else add(byName, norm(f.name), f);
  }
  return (m.nameIndex = { byMember, byName });
}
function ownerClassOf(node) {
  const p = node.parent;
  return p && (p.kind === ts.SyntaxKind.ClassDeclaration || p.kind === ts.SyntaxKind.ClassExpression) && p.name ? p.name.getText() : '';
}
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function declNameOf(node) {
  if (node.kind === ts.SyntaxKind.VariableStatement) return node.declarationList.declarations.map(d => d.name.getText()).join(',');
  if (node.kind === ts.SyntaxKind.Constructor) return node.parent?.name?.getText() || 'constructor';
  return node.name ? node.name.getText() : '';
}
