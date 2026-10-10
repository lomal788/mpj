import { build } from "../../node_modules/esbuild/lib/main.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const WEB = path.resolve(ROOT, "../..");
export const options = {
  absWorkingDir: ROOT,
  entryPoints: ["src/main.ts"],
  outdir: path.join(ROOT, "dist"),
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
  tsconfig: path.join(ROOT, "tsconfig.json"),
};
if (process.argv[1] === fileURLToPath(import.meta.url)) await build(options);
