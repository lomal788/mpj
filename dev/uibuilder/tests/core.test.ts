import assert from "node:assert/strict";
import { test } from "node:test";
import { ScreenRuntime } from "../src/engine/screen/core";
import { EditorStore } from "../src/editor/store";
import {
  blankDocument,
  validateDocument,
  worldTransform,
} from "../src/editor/document";
import { ExtensionRegistry } from "../src/editor/extensions";
import { createEntity } from "../src/plugins/uibuilder/schema";
import { expandItems } from "../src/plugins/uibuilder/data";
const items = () =>
  Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    owner: 0,
    row: 0,
    col: i,
    enabled: i !== 2,
    visible: true,
  }));
const policy = { wrap: true, repeatWrap: false, multi: false, columns: 5 };
test("disabled items are skipped and repeated input stops at row end", () => {
  const r = new ScreenRuntime(items(), policy, { event() {}, random: () => 0 });
  r.initialize([0]);
  r.focus(0, "1");
  r.move(0, 1, 0);
  assert.equal(r.cursors.get(0), "3");
  r.focus(0, "4");
  r.move(0, 1, 0, true);
  assert.equal(r.cursors.get(0), "4");
  r.move(0, 1, 0, false);
  assert.equal(r.cursors.get(0), "0");
});
test("sparse vertical candidates prefer left on a distance tie", () => {
  const r = new ScreenRuntime(
    [
      { id: "a", owner: 0, row: 0, col: 1, enabled: true, visible: true },
      { id: "left", owner: 0, row: 1, col: 0, enabled: true, visible: true },
      { id: "right", owner: 0, row: 1, col: 2, enabled: true, visible: true },
    ],
    policy,
    { event() {}, random: () => 0 },
  );
  r.initialize([0]);
  r.move(0, 0, 1);
  assert.equal(r.cursors.get(0), "left");
});
test("same-tick multi-player decisions preserve player order and occupancy", () => {
  const r = new ScreenRuntime(
    items(),
    { ...policy, multi: true },
    { event() {}, random: () => 0 },
  );
  r.initialize([0, 1]);
  r.tick([
    { pid: 1, decide: true },
    { pid: 0, decide: true },
  ]);
  assert.equal(r.decided.get(0), "0");
  assert.equal(r.decided.has(1), false);
  r.move(1, 1, 0);
  r.decide(1);
  assert.equal(r.decided.get(1), "1");
  r.cancel(0);
  assert.equal(r.decided.has(0), false);
});
test("document command undo/redo preserves a whole edit and prevents invalid transactions", () => {
  const s = new EditorStore();
  s.execute("add", (d) => d.entities.push(createEntity("ui.part", "part")));
  const id = s.document.entities[0].id;
  s.update(id, (n) => (n.transform.x = 120));
  s.undo();
  assert.equal(s.document.entities[0].transform.x, 0);
  s.redo();
  assert.equal(s.document.entities[0].transform.x, 120);
  assert.throws(() => s.update(id, (n) => (n.transform.scale = -1)));
  assert.equal(s.document.entities[0].transform.scale, 1);
});
test("invalid references, duplicate IDs, and parent cycles are rejected", () => {
  const d = blankDocument(),
    a = createEntity("ui.group", "a"),
    b = createEntity("ui.group", "b");
  a.parent = b.id;
  b.parent = a.id;
  d.entities = [a, b];
  assert.throws(() => validateDocument(d));
  b.parent = null;
  validateDocument(d);
  d.entities.push({ ...a });
  assert.throws(() => validateDocument(d));
});
test("nested placement and dataset expansion use group rotation and scale", () => {
  const d = blankDocument(),
    g = createEntity("ui.group", "g"),
    n = createEntity("ui.part", "items");
  g.transform = {
    x: 100,
    y: 50,
    width: 500,
    height: 500,
    rotation: 90,
    scale: 2,
  };
  n.parent = g.id;
  n.transform.x = 10;
  n.props = { dataset: "games", columns: 2, gapX: 100, gapY: 50 };
  d.entities = [g, n];
  d.settings.datasets = {
    games: [{ name: "A" }, { name: "B" }, { name: "C" }],
  };
  const t = worldTransform(d, n);
  assert.ok(Math.abs(t.x - 100) < 1e-5);
  assert.equal(t.y, 70);
  const rows = expandItems(d);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].y, 270);
  assert.equal(rows[2].x, 200);
  g.visible = false;
  assert.equal(expandItems(d).length, 0);
});
test("extension IDs and command IDs cannot silently overwrite another extension", () => {
  const r = new ExtensionRegistry();
  r.register({
    id: "test",
    activate(api) {
      api.tool({ id: "save", label: "save", run() {} });
    },
  });
  assert.throws(() => r.register({ id: "test", activate() {} }));
  assert.throws(() => r.tool({ id: "save", label: "duplicate", run() {} }));
});
