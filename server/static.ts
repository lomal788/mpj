/**
 * 배포용 정적 파일 응답 — 사전 압축(.br·.gz) 선택, 정확한 MIME, 캐시 헤더(해시 이름 = immutable 1년, 나머지 = no-cache + ETag/304).
 * node 내장(fs·path·http 타입)만 쓰고 프로젝트 모듈을 import 하지 않는다(다른 게임 서버에 그대로 옮겨 쓰게 — ddalkkakrider 등).
 * 설계: docs/engine/loader_manager.md §5.8.4·§5.8.5. 개발 서버(server/main.ts 기본·tools/serve.ts 기본)는 이것을 쓰지 않는다.
 *
 *   const handle = createStaticHandler({ root: '/path/to/dist' });
 *   http.createServer((req, res) => handle(req, res));
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.hdr': 'image/vnd.radiance',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/** 내용 해시 이름: 에셋 `.<8 hex>.<ext>`(tools/build_assets.ts), esbuild `.<8자 base32>.js|css|map`(tools/build.ts) */
export const HASHED = /\.[0-9a-f]{8}\.[a-z0-9]+$|\.[A-Z2-7]{8}\.(js|css)(\.map)?$/;

export const IMMUTABLE = 'public, max-age=31536000, immutable';

export interface StaticOptions {
  /** 내줄 폴더(절대 경로) */
  root: string;
  /** 해시 이름 판정(기본 HASHED) */
  hashed?: (pathname: string) => boolean;
  /** 폴더 요청에 붙일 파일(기본 index.html) */
  index?: string;
}

/** Accept-Encoding 에서 받는 인코딩(q=0 은 뺌) */
function accepted(header: string | string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (Array.isArray(header) ? header.join(',') : (header ?? '')).split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    if (name && !(q && Number(q.slice(2)) === 0)) out.add(name);
  }
  return out;
}

const etags = new Map<string, { size: number; mtime: number; tag: string }>();

/** ETag — 해시 이름은 크기·시각(내용은 이름이 보장), 그 밖은 내용 sha1(다시 빌드해 시각만 바뀌어도 304 가 나게) */
function etagOf(file: string, st: fs.Stats, byContent: boolean, suffix: string): string {
  if (!byContent) return `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}${suffix}"`;
  const c = etags.get(file);
  if (c && c.size === st.size && c.mtime === st.mtimeMs) return c.tag;
  const tag = `"${crypto.createHash('sha1').update(fs.readFileSync(file)).digest('base64url').slice(0, 20)}${suffix}"`;
  etags.set(file, { size: st.size, mtime: st.mtimeMs, tag });
  return tag;
}

function statFile(p: string): fs.Stats | null {
  try {
    const st = fs.statSync(p);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

/** (req, res) → 처리했으면 true. 없는 파일은 404 를 보내고 true(다른 처리기로 넘기려면 exists 로 먼저 확인) */
export function createStaticHandler(o: StaticOptions): (req: http.IncomingMessage, res: http.ServerResponse) => boolean {
  const root = path.resolve(o.root);
  const hashed = o.hashed ?? ((p: string) => HASHED.test(p));
  const index = o.index ?? 'index.html';
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return true;
    }
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return true;
    }
    if (rel.endsWith('/')) rel += index;
    let file = path.resolve(root, `.${rel}`);
    if (!path.extname(file) && !statFile(file) && statFile(`${file}.html`)) file = `${file}.html`;
    const st = file.startsWith(root + path.sep) ? statFile(file) : null;
    if (!st) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }).end('Not found');
      return true;
    }
    const enc = accepted(req.headers['accept-encoding']);
    const br = statFile(`${file}.br`);
    const gz = statFile(`${file}.gz`);
    let send = file;
    let sendSt = st;
    let encoding = '';
    if (br && enc.has('br')) {
      send = `${file}.br`;
      sendSt = br;
      encoding = 'br';
    } else if (gz && (enc.has('gzip') || enc.has('x-gzip'))) {
      send = `${file}.gz`;
      sendSt = gz;
      encoding = 'gzip';
    }
    const isHashed = hashed(rel);
    const headers: Record<string, string | number> = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': sendSt.size,
      'Cache-Control': isHashed ? IMMUTABLE : 'no-cache',
      ETag: etagOf(send, sendSt, !isHashed, encoding ? `-${encoding}` : ''),
      'X-Content-Type-Options': 'nosniff',
    };
    if (encoding) headers['Content-Encoding'] = encoding;
    if (br || gz) headers.Vary = 'Accept-Encoding';
    const inm = req.headers['if-none-match'];
    if (inm && inm.split(',').some((t) => t.trim().replace(/^W\//, '') === headers.ETag)) {
      delete headers['Content-Length'];
      delete headers['Content-Type'];
      delete headers['Content-Encoding'];
      res.writeHead(304, headers).end();
      return true;
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(send).pipe(res);
    return true;
  };
}
