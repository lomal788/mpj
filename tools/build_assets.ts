/**
 * 배포용 에셋 빌드 — 소스 web/assets/(편집·개발 페이지용, 변환기 출력 그대로) → 압축본 web/assets-dist/(배포·일반 실행).
 * 설계·기준·결과: docs/engine/assets_pipeline.md.
 *
 *   npx tsx tools/build_assets.ts                 증분(소스 내용 해시·설정이 같으면 건너뜀)
 *     --only plaza/world/                         이 경로로 시작하는 소스만(나머지는 이전 결과 유지)
 *     --force                                     캐시 무시
 *     --jobs 4                                    동시 인코더 수(basisu·ffmpeg 프로세스)
 *     --no-tex | --no-mesh | --no-audio           그 종류는 이전 결과 유지(처음이면 PNG/glb/wav 그대로 복사)
 *     --no-precompress                            .br·.gz 사전 압축을 건너뜀(기본: 해시 이름 옆에 증분으로 만든다 — tools/precompress.ts 규칙)
 *     --prune                                     지금 결과에 없는 dist 파일(옛 산출물)을 지운다 — 사용자가 직접 실행할 때만
 *
 * 산출물
 *   assets-dist/<소스와 같은 경로>   png → .ktx2(또는 png 그대로), wav → .ogg+.m4a 또는 .flac, glb → 같은 이름(meshopt), json → 같은 이름(공백 제거), 그 밖 = 복사
 *                                   (해시 없는 작업본 — 증분 비교·같은 내용 복사의 원본)
 *   assets-dist/<경로>.<sha256 8>.<확장자>   배포본(내용 해시 이름, 작업본의 복사) + 이득 있으면 .br·.gz. 배포(tools/build.ts)는 이것만 싣는다
 *   assets-dist/index.json          런타임 표 { v: 2, ktx2[], lossy[], flac[], names{압축본 이름 → 해시 이름}, streams{BGM 소스 → 조각 배치} }
 *                                   (shell/stage3d/assetLoader.ts 가 읽음, 형식: docs/engine/loader_manager.md §5.8.2, BGM 조각: docs/engine/04_sound.md §12 —
 *                                   조각 가상 경로 <이름>.bgm/NNN.wav 도 lossy 에 넣어 소리 이름 바꿈을 그대로 탄다)
 *   assets-dist/report.json         파일별 형식·크기·PSNR·GPU 추정, 폴더별 합
 *   assets-dist/build-state.json    증분 캐시(소스 sha1·설정·결과). 텍스처·소리는 경로만 바뀐 같은 내용(키 = 경로 뺀 내용·설정)이면 옛 결과를 복사한다
 *                                   (캐릭터 공용 폴더 assets/chara/·시스템 효과음과 공용 UI 그림 assets/common/ 으로 옮긴 것 — docs/engine/chara_assets.md, common_assets.md)
 *   web/vendor/basis/               three 의 Basis 트랜스코더(js·wasm) 정적 복사 — 외부 CDN 금지
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { classify, CLASS_RECIPE, encodeTexture, gpuBytes, isTex3d, pngInfo, TEX_RECIPE, type TexHint, type TexPlan, type TexResult } from './assets_tex';
import { imageSlots, MESH_RECIPE, packGlb, readGlb, type MeshStats } from './assets_mesh';
import { AUDIO_RECIPE, audioKind, BGM_RECIPE, encodeAudio, wavInfo, type AudioOut } from './assets_audio';
import { bgmChunkKey, sameLoop, validLoop, type BgmPlan } from '../script/lib/bgmstream';
import { hashedName, PRECOMPRESS, precompressAll } from './precompress';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = path.join(WEB, 'assets');
export const DIST = path.join(WEB, 'assets-dist');
const STATE = path.join(DIST, 'build-state.json');
const INDEX = path.join(DIST, 'index.json');
const REPORT = path.join(DIST, 'report.json');
const VENDOR = path.join(WEB, 'vendor', 'basis');
const JSON_RECIPE = 'json-v1';
const COPY_RECIPE = 'copy-v1';
const COMPRESSIBLE = /\.(json|glb|hdr|otf|ttf|bin)$/i;

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? '') : null;
};
const flag = (name: string): boolean => process.argv.includes(name);

type Kind = 'tex' | 'mesh' | 'audio' | 'json' | 'copy';
interface Entry {
  rel: string;
  kind: Kind;
  key: string;
  srcBytes: number;
  /** dist 상대 경로 → 바이트 */
  outs: Record<string, number>;
  /** 압축 전송 추정(brotli q9) — json·glb·hdr 등 */
  br?: number;
  tex?: TexResult & { plan: TexPlan };
  mesh?: MeshStats;
  audio?: Omit<AudioOut, 'files'>;
  /** 압축본 이름 → 해시 이름(배포본) */
  names?: Record<string, string>;
  /** 해시 이름 → [.br 바이트, .gz 바이트](0 = 이득 없어 안 만듦) */
  pre?: Record<string, [number, number]>;
}
interface State {
  v: 1;
  entries: Record<string, Entry>;
}

const posix = (p: string): string => p.split(path.sep).join('/');
const sha1 = (file: string): string => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
const brSize = (b: Uint8Array): number => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 } }).byteLength;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

async function pool<T>(items: T[], n: number, fn: (x: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

/** JSON 안의 텍스처 색인(files[]+srgb, file+srgb)과 glb 재질 슬롯에서 텍스처 힌트를 모은다(파일 이름 기준) */
function collectHints(files: string[]): Map<string, TexHint> {
  const byName = new Map<string, TexHint>();
  const put = (name: string, h: TexHint): void => {
    const cur = byName.get(name) ?? {};
    byName.set(name, { ...h, ...cur, slot: cur.slot ?? h.slot });
  };
  const visit = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      for (const x of o) visit(x);
      return;
    }
    const r = o as Record<string, unknown>;
    if (typeof r.srgb === 'boolean') {
      const h: TexHint = { srgb: r.srgb, format: typeof r.format === 'string' ? r.format : undefined, cube: r.cube === true };
      if (Array.isArray(r.files)) for (const f of r.files) if (typeof f === 'string') put(path.posix.basename(f), h);
      if (typeof r.file === 'string') put(path.posix.basename(r.file), h);
    }
    for (const v of Object.values(r)) visit(v);
  };
  const slots = new Map<string, TexHint['slot']>();
  for (const f of files) {
    if (f.endsWith('.json') && fs.statSync(f).size < 4e6 && !/\.(fmab|fsnb)\.json$/.test(f)) {
      try {
        visit(JSON.parse(fs.readFileSync(f, 'utf8')));
      } catch {
        /* JSON 이 아닌 것은 건너뜀 */
      }
    } else if (f.endsWith('.glb')) {
      const { json } = readGlb(new Uint8Array(fs.readFileSync(f)));
      for (const [uri, slot] of imageSlots(json)) {
        const rel = posix(path.relative(SRC, path.resolve(path.dirname(f), decodeURIComponent(uri))));
        if (!slots.has(rel)) slots.set(rel, slot);
      }
    }
  }
  const out = new Map<string, TexHint>();
  for (const f of files) {
    if (!f.endsWith('.png')) continue;
    const rel = posix(path.relative(SRC, f));
    const h = { ...(byName.get(path.posix.basename(rel)) ?? {}) };
    const s = slots.get(rel);
    if (s) h.slot = s;
    out.set(rel, h);
  }
  return out;
}

/** 명세 JSON 이 BGM 라벨(자기 label 또는 위 키에 _BGM_)로 가리키는 손실 압축 wav → 반복 표본(loop{startSec,endSec} 또는 loopStart/loopEnd 초) */
function collectBgm(files: string[]): Map<string, { loop: [number, number] | null }> {
  const out = new Map<string, { loop: [number, number] | null }>();
  const isBgm = (l: string | null): boolean => !!l && /(^|_)BGM_/.test(l);
  for (const f of files) {
    if (!f.endsWith('.json') || fs.statSync(f).size >= 4e6 || /\.(fmab|fsnb)\.json$/.test(f)) continue;
    let j: unknown;
    try {
      j = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      continue;
    }
    const dir = path.dirname(f);
    const visit = (o: unknown, label: string | null): void => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) {
        for (const x of o) visit(x, label);
        return;
      }
      const r = o as Record<string, unknown>;
      const own = typeof r.label === 'string' ? r.label : label;
      if (typeof r.file === 'string' && /\.wav$/i.test(r.file) && isBgm(own)) {
        const abs = path.resolve(dir, r.file);
        const rel = posix(path.relative(SRC, abs));
        if (!rel.startsWith('..') && fs.existsSync(abs) && audioKind(rel) === 'lossy') {
          const info = wavInfo(abs);
          const lp = r.loop as { startSec?: unknown; endSec?: unknown } | null | undefined;
          const sec = lp && typeof lp.startSec === 'number' && typeof lp.endSec === 'number' ? [lp.startSec, lp.endSec] : typeof r.loopStart === 'number' && typeof r.loopEnd === 'number' ? [r.loopStart, r.loopEnd] : null;
          const loop = sec ? validLoop([Math.round(sec[0] * info.rate), Math.round(sec[1] * info.rate)], info.frames) : null;
          const prev = out.get(rel);
          if (prev && !sameLoop(prev.loop, loop)) console.warn(`  BGM 반복이 명세마다 다르다(앞의 것 사용): ${rel} ${JSON.stringify(prev.loop)} / ${JSON.stringify(loop)} (${posix(path.relative(SRC, f))})`);
          else out.set(rel, { loop });
        }
      }
      for (const [k, v] of Object.entries(r)) visit(v, isBgm(k) ? k : own);
    };
    visit(j, null);
  }
  return out;
}

function copyVendor(): void {
  const lib = path.join(WEB, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis');
  fs.mkdirSync(VENDOR, { recursive: true });
  for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
    const s = path.join(lib, f);
    const d = path.join(VENDOR, f);
    if (!fs.existsSync(d) || fs.statSync(d).size !== fs.statSync(s).size || sha1(d) !== sha1(s)) fs.copyFileSync(s, d);
  }
}

const mb = (n: number): string => (n / 1e6).toFixed(1);

async function main(): Promise<void> {
  const t0 = performance.now();
  const only = arg('--only');
  const force = flag('--force');
  const jobs = Number(arg('--jobs') ?? Math.max(2, Math.min(6, Math.floor(os.cpus().length / 4))));
  const skip = { tex: flag('--no-tex'), mesh: flag('--no-mesh'), audio: flag('--no-audio') };
  fs.mkdirSync(DIST, { recursive: true });
  copyVendor();
  const prev: State = fs.existsSync(STATE) ? (JSON.parse(fs.readFileSync(STATE, 'utf8')) as State) : { v: 1, entries: {} };
  const state: State = { v: 1, entries: {} };
  const files = walk(SRC).sort();
  const hints = collectHints(files);
  const bgms = collectBgm(files);
  console.log(`소스 ${files.length}개, 힌트 ${hints.size}개, BGM ${bgms.size}개, 동시 ${jobs}`);

  const want = (rel: string): boolean => !only || rel.startsWith(only);
  const reuse = (rel: string, key: string): Entry | null => {
    const e = prev.entries[rel];
    if (!e || force || e.key !== key) return null;
    if (!Object.keys(e.outs).every((o) => fs.existsSync(path.join(DIST, o)))) return null;
    return e;
  };
  const keep = (rel: string): boolean => {
    const e = prev.entries[rel];
    if (e && Object.keys(e.outs).every((o) => fs.existsSync(path.join(DIST, o)))) {
      state.entries[rel] = e;
      return true;
    }
    return false;
  };
  const byKey = new Map<string, Entry>();
  for (const e of Object.values(prev.entries)) if ((e.kind === 'tex' || e.kind === 'audio') && !byKey.has(e.key) && Object.keys(e.outs).every((o) => fs.existsSync(path.join(DIST, o)))) byKey.set(e.key, e);
  const stem = (r: string): string => r.replace(/\.[^./]+$/, '');
  const moved = (rel: string, key: string): Entry | null => {
    const e = force ? undefined : byKey.get(key);
    if (!e) return null;
    const outs: Record<string, number> = {};
    for (const [o, n] of Object.entries(e.outs)) {
      const to = stem(rel) + o.slice(stem(e.rel).length);
      fs.mkdirSync(path.dirname(path.join(DIST, to)), { recursive: true });
      fs.copyFileSync(path.join(DIST, o), path.join(DIST, to));
      outs[to] = n;
    }
    return { rel, kind: e.kind, key, srcBytes: e.srcBytes, outs, br: e.br, tex: e.tex, audio: e.audio };
  };
  const copyAs = (src: string, rel: string, key: string, kind: Kind): Entry => {
    const d = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(src, d);
    const e: Entry = { rel, kind, key, srcBytes: fs.statSync(src).size, outs: { [rel]: fs.statSync(d).size } };
    if (COMPRESSIBLE.test(rel)) e.br = brSize(fs.readFileSync(d));
    return e;
  };

  const groups: Record<Kind, string[]> = { tex: [], mesh: [], audio: [], json: [], copy: [] };
  for (const f of files) {
    const rel = posix(path.relative(SRC, f));
    const ext = path.extname(rel).toLowerCase();
    const kind: Kind = ext === '.png' ? 'tex' : ext === '.glb' ? 'mesh' : ext === '.wav' ? 'audio' : ext === '.json' ? 'json' : 'copy';
    groups[kind].push(rel);
  }
  const hashes = new Map<string, string>();
  const hashOf = (rel: string): string => {
    let h = hashes.get(rel);
    if (!h) hashes.set(rel, (h = sha1(path.join(SRC, rel))));
    return h;
  };

  // 1. 텍스처 — 내용이 같은 PNG(캐릭터 텍스처는 charselect·plaza/player·mg1801 에 같은 것이 있음)는 한 번만 인코딩해 결과를 복사
  let done = 0;
  let encoded = 0;
  let deduped = 0;
  let movedN = 0;
  const same = new Map<string, Promise<{ r: TexResult; outRel: string }>>();
  let lastSave = performance.now();
  const texList = groups.tex;
  await pool(texList, jobs, async (rel) => {
    const src = path.join(SRC, rel);
    const { w, h } = pngInfo(src);
    const plan = classify(rel, w, h, hints.get(rel) ?? {});
    const key = `${TEX_RECIPE}${CLASS_RECIPE[plan.cls] ? `-${CLASS_RECIPE[plan.cls]}` : ''}|${hashOf(rel)}|${plan.cls}|${plan.srgb}|${plan.mips}|${plan.reason}`;
    if (!want(rel)) {
      keep(rel);
      return;
    }
    if (skip.tex) {
      if (!keep(rel)) state.entries[rel] = copyAs(src, rel, `copy|${hashOf(rel)}`, 'tex');
      return;
    }
    const old = reuse(rel, key);
    const mv = old ? null : moved(rel, key);
    if (old) {
      state.entries[rel] = old;
    } else if (mv) {
      state.entries[rel] = mv;
      movedN++;
    } else {
      const dupKey = `${hashOf(rel)}|${plan.cls}|${plan.srgb}|${plan.mips}`;
      const first = same.get(dupKey);
      let r: TexResult;
      let outRel: string;
      if (first) {
        const f = await first;
        outRel = f.r.out === 'ktx2' ? rel.replace(/\.png$/i, '.ktx2') : rel;
        fs.mkdirSync(path.dirname(path.join(DIST, outRel)), { recursive: true });
        fs.copyFileSync(path.join(DIST, f.outRel), path.join(DIST, outRel));
        r = f.r;
        deduped++;
      } else {
        const job = (async () => {
          const res = await encodeTexture(src, plan, path.join(DIST, rel.replace(/\.png$/i, '.ktx2')), path.join(DIST, rel));
          return { r: res, outRel: res.out === 'ktx2' ? rel.replace(/\.png$/i, '.ktx2') : rel };
        })();
        same.set(dupKey, job);
        ({ r, outRel } = await job);
        encoded++;
      }
      state.entries[rel] = { rel, kind: 'tex', key, srcBytes: fs.statSync(src).size, outs: { [outRel]: r.bytes }, tex: { ...r, plan } };
      if (performance.now() - lastSave > 30000) {
        lastSave = performance.now();
        fs.writeFileSync(STATE, JSON.stringify({ v: 1, entries: { ...prev.entries, ...state.entries } }));
      }
    }
    done++;
    if (done % 50 === 0 || done === texList.length) console.log(`  텍스처 ${done}/${texList.length} (새로 ${encoded}, 같은 내용 복사 ${deduped}, 옮긴 경로 옛 결과 복사 ${movedN}) ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  });
  const texOut = (rel: string): 'ktx2' | 'png' | null => {
    const e = state.entries[rel];
    return e?.kind === 'tex' ? (e.tex?.out ?? (e.outs[rel] !== undefined ? 'png' : 'ktx2')) : null;
  };

  // 2. glb
  for (const rel of groups.mesh) {
    const src = path.join(SRC, rel);
    if (!want(rel)) {
      keep(rel);
      continue;
    }
    const { json } = readGlb(new Uint8Array(fs.readFileSync(src)));
    const deps: string[] = [];
    const map = new Map<string, string>();
    for (const im of json.images ?? []) {
      if (!im.uri) continue;
      const depRel = posix(path.relative(SRC, path.resolve(path.dirname(src), decodeURIComponent(im.uri))));
      const o = texOut(depRel);
      deps.push(`${depRel}:${o ?? '?'}`);
      if (o === 'ktx2') map.set(im.uri, im.uri.replace(/\.png$/i, '.ktx2'));
    }
    const key = `${MESH_RECIPE}|${hashOf(rel)}|${deps.sort().join(',')}`;
    if (skip.mesh) {
      if (!keep(rel)) state.entries[rel] = copyAs(src, rel, `copy|${hashOf(rel)}`, 'mesh');
      continue;
    }
    const old = reuse(rel, key);
    if (old) {
      state.entries[rel] = old;
      continue;
    }
    const { bytes, stats } = await packGlb(new Uint8Array(fs.readFileSync(src)), (u) => map.get(u) ?? null);
    const d = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.writeFileSync(d, bytes);
    state.entries[rel] = { rel, kind: 'mesh', key, srcBytes: stats.inBytes, outs: { [rel]: bytes.byteLength }, br: brSize(bytes), mesh: stats };
  }
  console.log(`  glb ${groups.mesh.length} ${((performance.now() - t0) / 1000).toFixed(0)} s`);

  // 3. 소리
  let audioNew = 0;
  let audioMoved = 0;
  await pool(groups.audio, jobs, async (rel) => {
    const src = path.join(SRC, rel);
    const bgm = bgms.get(rel);
    const key = `${AUDIO_RECIPE}|${hashOf(rel)}${bgm ? `|${BGM_RECIPE}:${bgm.loop ? bgm.loop.join('-') : 'none'}` : ''}`;
    if (!want(rel)) {
      keep(rel);
      return;
    }
    if (skip.audio) {
      if (!keep(rel)) state.entries[rel] = copyAs(src, rel, `copy|${hashOf(rel)}`, 'audio');
      return;
    }
    const old = reuse(rel, key);
    if (old) {
      state.entries[rel] = old;
      return;
    }
    const mv = moved(rel, key);
    if (mv) {
      state.entries[rel] = mv;
      audioMoved++;
      return;
    }
    audioNew++;
    const base = rel.replace(/\.wav$/i, '');
    const r = await encodeAudio(src, rel, path.join(DIST, base), bgm);
    const outs: Record<string, number> = {};
    for (const [ext, n] of Object.entries(r.files)) outs[base + ext] = n;
    state.entries[rel] = { rel, kind: 'audio', key, srcBytes: fs.statSync(src).size, outs, audio: { kind: r.kind, info: r.info, ...(r.stream ? { stream: r.stream } : {}) } };
  });
  console.log(`  소리 ${groups.audio.length} (새로 ${audioNew}, 옮긴 경로 옛 결과 복사 ${audioMoved}) ${((performance.now() - t0) / 1000).toFixed(0)} s`);

  // 4. json·그 밖
  for (const rel of [...groups.json, ...groups.copy]) {
    const src = path.join(SRC, rel);
    const isJson = rel.toLowerCase().endsWith('.json');
    const key = `${isJson ? JSON_RECIPE : COPY_RECIPE}|${hashOf(rel)}`;
    if (!want(rel)) {
      keep(rel);
      continue;
    }
    const old = reuse(rel, key);
    if (old) {
      state.entries[rel] = old;
      continue;
    }
    if (!isJson) {
      state.entries[rel] = copyAs(src, rel, key, 'copy');
      continue;
    }
    const text = fs.readFileSync(src, 'utf8');
    let out: string;
    try {
      out = JSON.stringify(JSON.parse(text));
    } catch {
      out = text;
    }
    const d = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.writeFileSync(d, out);
    const buf = Buffer.from(out);
    state.entries[rel] = { rel, kind: 'json', key, srcBytes: fs.statSync(src).size, outs: { [rel]: buf.byteLength }, br: brSize(buf) };
  }

  // 해시 이름(배포본) — 새로 만든 산출물만 내용을 다시 잰다(재사용 항목은 이전 names 가 있고 파일이 있으면 그대로)
  let hashedNew = 0;
  for (const e of Object.values(state.entries)) {
    const outs = Object.keys(e.outs);
    if (e.names && outs.every((o) => e.names![o] && fs.existsSync(path.join(DIST, e.names![o])))) continue;
    e.names = {};
    e.pre = undefined;
    for (const o of outs) {
      const n = hashedName(o, crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, o))).digest('hex').slice(0, 8));
      if (!fs.existsSync(path.join(DIST, n))) fs.copyFileSync(path.join(DIST, o), path.join(DIST, n));
      e.names[o] = n;
    }
    hashedNew++;
  }
  if (hashedNew) console.log(`  해시 이름 ${hashedNew}개 항목`);

  // 사전 압축(해시 이름 옆) — 결정은 항목에 남겨 다음 빌드는 건너뜀
  if (!flag('--no-precompress')) {
    const todo: { e: Entry; n: string }[] = [];
    for (const e of Object.values(state.entries))
      for (const n of Object.values(e.names ?? {})) {
        if (!PRECOMPRESS.test(n)) continue;
        const p = e.pre?.[n];
        const d = path.join(DIST, n);
        if (p && (!p[0] || fs.existsSync(`${d}.br`)) && (!p[1] || fs.existsSync(`${d}.gz`))) continue;
        todo.push({ e, n });
      }
    let raw = 0;
    let br = 0;
    let done = 0;
    const byFile = new Map(todo.map((t) => [path.join(DIST, t.n), t]));
    await precompressAll([...byFile.keys()], Math.max(4, jobs), (f, r) => {
      const t = byFile.get(f)!;
      (t.e.pre ??= {})[t.n] = [r.br, r.gz];
      raw += r.raw;
      br += r.br || r.raw;
      if (++done % 200 === 0) console.log(`  사전 압축 ${done}/${todo.length} ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    });
    if (todo.length) console.log(`  사전 압축 ${todo.length}개 ${mb(raw)} → br ${mb(br)} MB`);
  }

  // 소스에서 사라진 항목은 버린다(파일은 --prune 때만 지움)
  const index = { v: 2, ktx2: [] as string[], lossy: [] as string[], flac: [] as string[], names: {} as Record<string, string>, streams: {} as Record<string, BgmPlan> };
  const names: [string, string][] = [];
  for (const e of Object.values(state.entries)) {
    if (e.kind === 'tex' && Object.keys(e.outs)[0]?.endsWith('.ktx2')) index.ktx2.push(e.rel);
    if (e.kind === 'audio' && e.audio) (e.audio.kind === 'flac' ? index.flac : index.lossy).push(e.rel);
    if (e.kind === 'audio' && e.audio?.stream) {
      index.streams[e.rel] = e.audio.stream;
      for (let i = 0; i < e.audio.stream.chunks.length; i++) index.lossy.push(bgmChunkKey(e.rel, i));
    }
    names.push(...Object.entries(e.names ?? {}));
  }
  index.ktx2.sort();
  index.lossy.sort();
  index.flac.sort();
  index.names = Object.fromEntries(names.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  fs.writeFileSync(INDEX, JSON.stringify(index));
  fs.writeFileSync(STATE, JSON.stringify(state));

  // 옛 산출물
  const live = new Set<string>(['index.json', 'report.json', 'build-state.json']);
  for (const e of Object.values(state.entries)) {
    for (const o of Object.keys(e.outs)) live.add(o);
    for (const n of Object.values(e.names ?? {})) {
      live.add(n);
      const p = e.pre?.[n];
      if (p?.[0]) live.add(`${n}.br`);
      if (p?.[1]) live.add(`${n}.gz`);
    }
  }
  const orphans = walk(DIST)
    .map((f) => posix(path.relative(DIST, f)))
    .filter((r) => !live.has(r));
  if (orphans.length) {
    if (flag('--prune')) {
      for (const o of orphans) fs.rmSync(path.join(DIST, o));
      console.log(`  옛 산출물 ${orphans.length}개 지움`);
    } else console.log(`  옛 산출물 ${orphans.length}개(지우려면 --prune): ${orphans.slice(0, 5).join(', ')}${orphans.length > 5 ? ' …' : ''}`);
  }

  writeReport(state);
  console.log(`완료 ${((performance.now() - t0) / 1000).toFixed(0)} s → ${posix(path.relative(WEB, DIST))}/ (index ktx2 ${index.ktx2.length}·lossy ${index.lossy.length}·flac ${index.flac.length}·BGM 조각 ${Object.keys(index.streams).length}곡)`);
}

function writeReport(state: State): void {
  type Row = { src: number; dist: number; distOgg: number; distM4a: number; transferSrc: number; transferDist: number; gpuSrc: number; gpuDesk: number; gpuMob: number; n: number };
  const zero = (): Row => ({ src: 0, dist: 0, distOgg: 0, distM4a: 0, transferSrc: 0, transferDist: 0, gpuSrc: 0, gpuDesk: 0, gpuMob: 0, n: 0 });
  const folders: Record<string, Row> = {};
  const kinds: Record<string, Row> = {};
  const codecs: Record<string, { n: number; src: number; dist: number; minPsnr: number; meanPsnr: number }> = {};
  const total = zero();
  const files: Record<string, unknown>[] = [];
  for (const e of Object.values(state.entries)) {
    const top = e.rel.split('/').slice(0, e.rel.startsWith('plaza/') || e.rel.startsWith('mg/') ? 2 : 1).join('/');
    const rows = [(folders[top] ??= zero()), (kinds[e.kind] ??= zero()), total];
    let dist = 0;
    let ogg = 0;
    let m4a = 0;
    for (const [o, n] of Object.entries(e.outs)) {
      if (o.endsWith('.m4a')) m4a += n;
      else if (o.endsWith('.ogg')) ogg += n;
      else dist += n;
    }
    let gpuSrc = 0;
    let gpuDesk = 0;
    let gpuMob = 0;
    if (e.tex) {
      const mipped = isTex3d(e.rel);
      gpuSrc = gpuBytes({ out: 'png', codec: 'png', w: e.tex.w, h: e.tex.h }, true, mipped, 'desktop');
      gpuDesk = gpuBytes(e.tex, e.tex.alpha, mipped, 'desktop');
      gpuMob = gpuBytes(e.tex, e.tex.alpha, mipped, 'mobile');
      const c = (codecs[`${e.tex.plan.cls}:${e.tex.codec}`] ??= { n: 0, src: 0, dist: 0, minPsnr: Infinity, meanPsnr: 0 });
      c.n++;
      c.src += e.srcBytes;
      c.dist += dist;
      if (e.tex.psnr) {
        const p = Math.min(...(['R', 'G', 'B', 'A'] as const).map((k) => e.tex!.psnr![k] ?? Infinity));
        c.minPsnr = Math.min(c.minPsnr, p);
        c.meanPsnr += p;
      }
    }
    for (const r of rows) {
      r.n++;
      r.src += e.srcBytes;
      r.dist += dist;
      r.distOgg += ogg;
      r.distM4a += m4a;
      r.transferSrc += e.srcBytes;
      r.transferDist += (e.br ?? dist) + ogg;
      r.gpuSrc += gpuSrc;
      r.gpuDesk += gpuDesk;
      r.gpuMob += gpuMob;
    }
    files.push({
      src: e.rel,
      kind: e.kind,
      out: Object.keys(e.outs),
      srcBytes: e.srcBytes,
      distBytes: dist + ogg,
      m4aBytes: m4a || undefined,
      br: e.br,
      ...(e.tex ? { cls: e.tex.plan.cls, codec: e.tex.codec, reason: e.tex.reason, w: e.tex.w, h: e.tex.h, alpha: e.tex.alpha, psnr: e.tex.psnr, tries: e.tex.tries.map((t) => `${t.codec}:${t.pass ? 'ok' : 'x'}`) } : {}),
      ...(e.mesh ? { mesh: e.mesh } : {}),
      ...(e.audio ? { audio: e.audio.kind, rate: e.audio.info.rate, ch: e.audio.info.channels } : {}),
    });
  }
  for (const c of Object.values(codecs)) c.meanPsnr = c.n ? +(c.meanPsnr / c.n).toFixed(2) : 0;
  const round = (r: Row): Record<string, number> => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'n' ? v : +(v / 1e6).toFixed(2)]));
  fs.writeFileSync(
    REPORT,
    JSON.stringify(
      {
        note: 'MB 단위(1e6). dist = 압축본(소리는 ogg 만, m4a 는 따로), transferDist = json·glb 는 brotli q9 추정 + 나머지 그대로. gpu = 모든 텍스처를 한 번에 올렸을 때(밉 포함) 추정',
        total: round(total),
        folders: Object.fromEntries(Object.entries(folders).map(([k, v]) => [k, round(v)])),
        kinds: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, round(v)])),
        codecs: Object.fromEntries(Object.entries(codecs).map(([k, v]) => [k, { ...v, src: +(v.src / 1e6).toFixed(2), dist: +(v.dist / 1e6).toFixed(2), minPsnr: v.minPsnr === Infinity ? null : +v.minPsnr.toFixed(2) }])),
        files,
      },
      null,
      1,
    ),
  );
  console.log('\n폴더           소스MB   압축MB(ogg)  m4aMB  전송추정MB  GPU소스MB  GPU데스크톱  GPU모바일');
  for (const [k, v] of [...Object.entries(folders).sort((a, b) => b[1].src - a[1].src), ['합계', total] as const]) {
    console.log(
      `${k.padEnd(14)} ${mb(v.src).padStart(7)} ${mb(v.dist + v.distOgg).padStart(10)} ${mb(v.distM4a).padStart(7)} ${mb(v.transferDist).padStart(10)} ${mb(v.gpuSrc).padStart(10)} ${mb(v.gpuDesk).padStart(11)} ${mb(v.gpuMob).padStart(10)}`,
    );
  }
  console.log('\n종류:형식      개수  소스MB  압축MB  최소PSNR  평균PSNR');
  for (const [k, c] of Object.entries(codecs).sort()) console.log(`${k.padEnd(16)} ${String(c.n).padStart(4)} ${mb(c.src).padStart(7)} ${mb(c.dist).padStart(7)} ${String(c.minPsnr === Infinity ? '-' : c.minPsnr.toFixed(1)).padStart(8)} ${String(c.meanPsnr || '-').padStart(9)}`);
}

await main();
