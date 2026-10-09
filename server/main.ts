/**
 * 방 서버 + 페이지 서버 — ddalkkakrider `server.mjs` 처럼 http 서버 하나에 HTTP API(createApp) + socket.io(createSocket) + 정적 파일(web/)을 붙인다.
 * 같은 출처라 페이지가 `/socket.io/socket.io.js` 를 그대로 읽는다. 번들(bundle/)은 esbuild 로 먼저 만든다(--watch 면 고칠 때마다).
 * 근거: docs/shell/online.md 9.5.
 *
 *   npx tsx server/main.ts --port 8787 [--external] [--watch]
 *   npx tsx server/main.ts --dist           배포 미리보기: npm run build 결과 web/dist/ 를 배포 헤더(사전 압축·immutable·ETag, server/static.ts)로 내줌, 번들 빌드 안 함
 *   → http://127.0.0.1:8787/index.html?plaza=1&online=io
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { context } from 'esbuild';
import { options, WEB } from '../tools/esbuild_config';
import { createApp } from './api';
import { createStaticHandler } from './static';
import { createSocket, type Game, type SocketOptions } from './socket';
import type { Router } from 'express';

export const PLAZA_PORT = 8787;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.map': 'application/json',
};

const streams = new Set<http.ServerResponse>();

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/esbuild') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(':\n\n');
      streams.add(res);
      res.on('close', () => streams.delete(res));
      return;
    }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    let p = path.resolve(WEB, `.${rel}`);
    if (!p.startsWith(WEB + path.sep) && p !== WEB) throw new Error('outside');
    if (!path.extname(p) && !fs.existsSync(p) && fs.existsSync(`${p}.html`)) p = `${p}.html`;
    const stat = fs.statSync(p);
    if (!stat.isFile()) throw new Error('not file');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(p).pipe(res);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

export interface PlazaServerOptions {
  port?: number;
  host?: string;
  /** 번들 만들기(기본 켬), watch = 고칠 때마다 */
  build?: boolean;
  watch?: boolean;
  games?: Game[];
  routers?: (() => Router)[];
  socket?: SocketOptions;
  /** web/dist/ 를 배포 헤더로 내줌(번들 빌드 안 함) */
  dist?: boolean;
}

export async function startPlazaServer(o: PlazaServerOptions = {}) {
  let dispose: (() => Promise<void>) | null = null;
  if (o.build !== false && !o.dist) {
    const ctx = await context({ ...options(true, path.join(WEB, 'bundle')), logLevel: 'warning' });
    await ctx.rebuild();
    if (o.watch) await ctx.watch();
    dispose = () => ctx.dispose();
  }
  const server = http.createServer(createApp(o.dist ? createStaticHandler({ root: path.join(WEB, 'dist') }) : serveStatic, o.routers));
  const sockets = createSocket(server, { ...(o.games ? { games: o.games } : {}), ...o.socket });
  await new Promise<void>((resolve) => server.listen(o.port ?? PLAZA_PORT, o.host ?? '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : (o.port ?? PLAZA_PORT);
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    sockets,
    close: async () => {
      for (const r of streams) r.end();
      await sockets.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await dispose?.();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--port');
  const port = i >= 0 ? Number(process.argv[i + 1]) : PLAZA_PORT;
  const host = process.argv.includes('--external') ? '0.0.0.0' : '127.0.0.1';
  const s = await startPlazaServer({ port, host, watch: process.argv.includes('--watch'), dist: process.argv.includes('--dist') });
  console.log(`방 서버: ${host}:${s.port} — 페이지 http://127.0.0.1:${s.port}/index.html?plaza=1&online=io (Ctrl+C 로 끝)`);
}
