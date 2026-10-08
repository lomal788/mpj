/**
 * 개발 서버 — esbuild watch + serve. web/ 전체를 정적으로 내주고 bundle/ 만 다시 만든다.
 * 고치면 다시 빌드하고, 페이지는 /esbuild 변경 알림을 받아 새로 고친다(script/main.ts 의 __DEV__ 블록).
 * 방 서버도 같은 프로세스·같은 포트(docs/shell/online.md 9.6): 앞단 node http 서버에 express API(/api/v1/*, server/api) + socket.io(/socket.io/*, 웹소켓 업그레이드 포함, server/socket),
 * 나머지 요청은 안쪽 esbuild serve(127.0.0.1 임의 포트)로 넘긴다. 광장 친구 매치 기본 = 이 실제 방 서버(?online=fake 만 가짜).
 *
 *   npm run dev                  http://localhost:51811/  (광장 http://localhost:51811/index.html?plaza=1)
 *   npx tsx tools/serve.ts --port 5190
 *   npx tsx tools/serve.ts --dist        배포 미리보기: web/dist/(npm run build 결과)를 배포 헤더로 내준다(server/static.ts — 사전 압축·immutable·ETag) + 같은 API·socket.io
 */
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { context } from "esbuild";
import { createApp } from "../server/api";
import { createSocket } from "../server/socket";
import { createStaticHandler } from "../server/static";
import { WEB, options } from "./esbuild_config";

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

function proxyTo(port: number): Handler {
  return (req, res) => {
    const up = http.request({ host: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    res.on("close", () => up.destroy());
    req.pipe(up);
  };
}

export async function startDevServer(o: { port?: number; host?: string; dist?: boolean } = {}) {
  let fallback: Handler;
  let dispose = async (): Promise<void> => {};
  if (o.dist) fallback = createStaticHandler({ root: path.join(WEB, "dist") });
  else {
    const ctx = await context({ ...options(true, path.join(WEB, "bundle")), logLevel: "warning" });
    await ctx.watch();
    const es = await ctx.serve({ servedir: WEB, host: "127.0.0.1" });
    fallback = proxyTo(es.port);
    dispose = () => ctx.dispose();
  }
  const server = http.createServer(createApp(fallback));
  const sockets = createSocket(server);
  await new Promise<void>((resolve) => server.listen(o.port ?? 51811, o.host, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : (o.port ?? 51811);
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    sockets,
    close: async () => {
      await sockets.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await dispose();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // const port = Number(argValue('--port') ?? DEV_PORT);
  const port = Number(argValue("--port") ?? 51811);
  const dist = process.argv.includes("--dist");
  const s = await startDevServer({ port, dist });
  const hosts = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4")
    .map((n) => n!.address);
  console.log(
    dist
      ? `배포 미리보기: http://localhost:${s.port}/ (web/dist + 방 서버)`
      : `개발 서버: http://localhost:${s.port}/ (네트워크: ${hosts.join(", ")}) — 방 서버(API + socket.io) 같은 포트, 광장 http://localhost:${s.port}/index.html?plaza=1`,
  );
}
