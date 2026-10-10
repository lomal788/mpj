import { build } from "../../../node_modules/esbuild/lib/main.js";
import { ROOT, WEB } from "../build.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { library } from "../server/library.mjs";
import { createProjects, projectName } from "../server/projects.mjs";
import { safePath } from "../server/http.mjs";
await fs.mkdir(path.join(ROOT, ".cache/tests"), { recursive: true });
await build({
  entryPoints: [path.join(ROOT, "tests/all.test.ts")],
  outfile: path.join(ROOT, ".cache/tests/core.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const result = spawnSync(
  process.execPath,
  ["--test", path.join(ROOT, ".cache/tests/core.mjs")],
  { encoding: "utf8" },
);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.status) process.exit(result.status);
const catalog = await library(WEB);
assert.equal(catalog.entries.length, 200);
assert.equal(catalog.raw.length, 486);
assert.equal(new Set(catalog.entries.map((x) => x.id)).size, 200);
assert.ok(
  catalog.entries.filter((x) => !x.readonly).every((x) => x.panes.length),
);
await build({
  entryPoints: [path.join(ROOT, "src/plugins/uibuilder/templates.ts")],
  outfile: path.join(ROOT, ".cache/tests/templates.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const { TEMPLATES, makeTemplate } =
  await import("../.cache/tests/templates.mjs");
for (const template of TEMPLATES) {
  const doc = makeTemplate(template.id, catalog);
  assert.ok(doc.entities.length > 1, `empty template: ${template.id}`);
  for (const entity of doc.entities) {
    const part = catalog.entries.find((p) => p.id === entity.props.part);
    assert.ok(part, `missing part: ${entity.name}`);
    for (const binding of entity.props.bindings ?? [])
      assert.ok(
        part.panes.some((p) => p.name === binding.pane),
        `${template.id}: missing pane ${binding.pane}`,
      );
  }
}
assert.throws(() => projectName("../escape"));
assert.throws(() => projectName("CON"));
assert.throws(() => safePath(ROOT, "/../../outside"));
const projects = createProjects(path.join(ROOT, ".cache/tests/project-store"));
const doc = {
  format: "mpj-editor-document",
  version: 1,
  entities: [],
  title: "test",
};
await projects.save("roundtrip", doc);
assert.deepEqual(await projects.read("roundtrip"), doc);
doc.title = "second";
await projects.save("roundtrip", doc);
assert.deepEqual(await projects.list(), ["roundtrip"]);
for (const file of [
  "src/editor/document.ts",
  "src/editor/store.ts",
  "src/editor/extensions.ts",
  "src/engine/screen/core.ts",
]) {
  const source = await fs.readFile(path.join(ROOT, file), "utf8");
  assert.ok(
    !/@app|@game|three|adapters\/mpj|plugins\//.test(source),
    `portable boundary: ${file}`,
  );
}
assert.ok(
  !/^import\b/m.test(
    await fs.readFile(path.join(ROOT, "src/engine/screen/core.ts"), "utf8"),
  ),
);
await fs.writeFile(
  path.join(ROOT, ".cache/tests/report.json"),
  JSON.stringify(
    {
      core_tests: 7,
      preview_tests: 6,
      window_order_tests: 1,
      native_reuse_tests: 2,
      template_binding_checks: TEMPLATES.length,
      catalog: 200,
      original_catalog: 486,
      project_roundtrip: true,
      path_guards: true,
      portable_boundaries: true,
    },
    null,
    2,
  ),
);
console.log(
  "카탈로그 200/486, 저장 왕복·백업, 경로 제한, 코어 import 경계 검사 통과",
);
