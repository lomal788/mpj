import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);

// tools/graphics_verify/shot.ts
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
var ROOT = path.resolve(path.dirname(process.argv[1]), "../..");
var { chromium } = createRequire(path.join(ROOT, "web/node_modules/x.js"))("playwright-core");
var MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".glb": "model/gltf-binary", ".json": "application/json" };
function findChromium() {
  const root = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "ms-playwright");
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)) : [];
  dirs.sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dirs) for (const sub of ["chrome-win64", "chrome-win"]) {
    const p = path.join(root, d, sub, "chrome.exe");
    if (fs.existsSync(p)) return p;
  }
  throw new Error("chromium not found");
}
var server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader("content-type", MIME[path.extname(f)] ?? "application/octet-stream");
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", () => r()));
var port = server.address().port;
var browser = await chromium.launch({ executablePath: findChromium(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
var page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
var errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(r.status() + " " + r.url());
});
var outDir = path.join(ROOT, "extracted/converted/graphics/shots");
fs.mkdirSync(outDir, { recursive: true });
for (const scene of process.argv.slice(2).length ? process.argv.slice(2) : ["mario", "mg1801"]) {
  const [name, extra] = scene.split("+");
  await page.goto(`http://127.0.0.1:${port}/tools/graphics_verify/view.html?scene=${name}${extra ? "&" + extra : ""}`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 12e4 });
  const file = path.join(outDir, scene.replace(/[+=&]/g, "_") + ".png");
  await page.locator("canvas").screenshot({ path: file });
  console.log("shot", file);
}
console.log("console errors/warnings:", errors.length ? errors.slice(0, 10) : "none");
await browser.close();
server.close();
