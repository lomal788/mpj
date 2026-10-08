/**
 * 개발 서버 — esbuild watch + serve. web/ 전체를 정적으로 내주고 bundle/ 만 다시 만든다.
 * 고치면 다시 빌드하고, 페이지는 /esbuild 변경 알림을 받아 새로 고친다(script/main.ts 의 __DEV__ 블록).
 *
 *   npm run dev                  http://localhost:5181/
 *   npx tsx tools/serve.ts --port 5190
 *   npx tsx tools/serve.ts --dist        배포 미리보기: web/dist/(npm run build 결과)를 배포 헤더로 내준다(server/static.ts — 사전 압축·immutable·ETag)
 */
import http from "node:http";
import path from "node:path";
import { context } from "esbuild";
import { createStaticHandler } from "../server/static";
import { WEB, options } from "./esbuild_config";

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

// const port = Number(argValue('--port') ?? DEV_PORT);
const port = Number(argValue("--port") ?? 51811);
if (process.argv.includes("--dist")) {
  const handle = createStaticHandler({ root: path.join(WEB, "dist") });
  http.createServer((req, res) => handle(req, res)).listen(port, () => console.log(`배포 미리보기: http://localhost:${port}/ (web/dist)`));
} else {
  const ctx = await context(options(true, path.join(WEB, "bundle")));
  await ctx.watch();
  const { hosts, port: realPort } = await ctx.serve({ servedir: WEB, port });
  console.log(
    `개발 서버: http://localhost:${realPort}/ (네트워크: ${hosts.join(", ")})`,
  );
}
