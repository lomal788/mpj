import fs from "node:fs/promises";
import path from "node:path";
import { library, SOURCES } from "./library.mjs";
import { createProjects } from "./projects.mjs";
export const safePath = (base, name) => {
  const p = path.resolve(base, `.${name}`);
  if (p !== base && !p.startsWith(base + path.sep))
    throw Error("허용되지 않은 경로");
  return p;
};
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".md": "text/plain; charset=utf-8",
};
export function handler(root, web) {
  const projects = createProjects(root);
  let catalog;
  const json = (res, data) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
  };
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const route = decodeURIComponent(url.pathname);
      if (route === "/api/catalog") {
        catalog ??= library(web);
        return json(res, await catalog);
      }
      if (route === "/api/projects" && req.method === "GET")
        return json(res, await projects.list());
      if (route.startsWith("/api/projects/")) {
        const name = route.slice(14);
        if (req.method === "GET") return json(res, await projects.read(name));
        if (req.method === "PUT") {
          if (
            req.headers.origin &&
            req.headers.origin !== `http://${req.headers.host}`
          )
            throw Error("동일 출처 저장만 허용합니다.");
          if (!String(req.headers["content-type"]).includes("application/json"))
            throw Error("JSON 요청만 허용합니다.");
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 2_000_000)
              throw Error("문서는 2MB 이하여야 합니다.");
          }
          return json(res, await projects.save(name, JSON.parse(body)));
        }
      }
      if (req.method !== "GET") {
        res.statusCode = 405;
        return res.end();
      }
      let file;
      if (route.startsWith("/api/library/")) {
        const source = route.slice(13);
        if (!SOURCES[source]) throw Error("명세 없음");
        file = path.join(web, "assets", SOURCES[source]);
      } else if (route.startsWith("/assets/"))
        file = safePath(path.join(web, "assets"), route.slice(7));
      else if (route.startsWith("/docs/"))
        file = safePath(path.join(web, "docs"), route.slice(5));
      else if (
        route === "/" ||
        route === "/dev/uibuilder/" ||
        route === "/dev/uibuilder"
      )
        file = path.join(root, "index.html");
      else if (
        route.startsWith("/dist/") ||
        route.startsWith("/dev/uibuilder/dist/")
      )
        file = safePath(root, route.replace("/dev/uibuilder", ""));
      else {
        res.statusCode = 404;
        return res.end("Not found");
      }
      res.setHeader(
        "content-type",
        mime[path.extname(file)] ?? "application/octet-stream",
      );
      res.end(await fs.readFile(file));
    } catch (e) {
      res.statusCode = e.code === "ENOENT" ? 404 : 400;
      json(res, { error: e.message });
    }
  };
}
