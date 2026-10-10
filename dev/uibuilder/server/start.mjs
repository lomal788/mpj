import http from "node:http";
import { context } from "../../../node_modules/esbuild/lib/main.js";
import { ROOT, WEB, options } from "../build.mjs";
import { handler } from "./http.mjs";
const ctx = await context(options);
await ctx.watch();
await ctx.rebuild();
const pos = process.argv.indexOf("--port");
const port = Number(pos < 0 ? 51812 : process.argv[pos + 1]);
const server = http.createServer(handler(ROOT, WEB));
server.on("error", async (e) => {
  console.error(e.message);
  await ctx.dispose();
  process.exit(1);
});
server.listen(port, "127.0.0.1", () =>
  console.log(`MPJ Studio: http://127.0.0.1:${port}/dev/uibuilder/`),
);
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close();
  await ctx.dispose();
  process.exit();
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
