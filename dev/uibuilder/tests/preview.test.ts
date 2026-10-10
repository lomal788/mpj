import assert from "node:assert/strict";
import { test } from "node:test";
import { blankDocument } from "../src/editor/document";
import { createEntity, type Renderer } from "../src/plugins/uibuilder/schema";
import { expandItems } from "../src/plugins/uibuilder/data";
import { PreviewController } from "../src/plugins/uibuilder/preview";
import {
  setDataText,
  setFixedText,
} from "../src/plugins/uibuilder/textEditing";
import { PreviewInput } from "../src/adapters/browser/input";

function fixture(multi = false) {
  const doc = blankDocument();
  const base = createEntity("ui.part", "base"),
    a = createEntity("ui.part", "A"),
    b = createEntity("ui.part", "B");
  base.locked = true;
  a.props = {
    interactive: true,
    bindings: [{ pane: "label", kind: "text", field: "name" }],
    actions: [
      { event: "decide", kind: "work", target: "selection", value: "$item" },
    ],
  };
  b.props = { interactive: true };
  a.transform.x = -100;
  b.transform.x = 100;
  doc.entities = [base, a, b];
  doc.settings = { input: { multi, players: multi ? 2 : 1, wrap: false } };
  const plays: { id: string; tag: string; next?: string }[] = [],
    actions: unknown[] = [];
  const animations: Record<string, { frames: number; loop: boolean }> = {
    in: { frames: 2, loop: false },
    out: { frames: 2, loop: false },
    normal: { frames: 0, loop: false },
    on: { frames: 1, loop: false },
    off: { frames: 0, loop: false },
    cursor: { frames: 30, loop: true },
    press: { frames: 3, loop: false },
    pressed: { frames: 0, loop: false },
  };
  const renderer: Renderer = {
    async prepare() {},
    draw() {},
    tick() {},
    play(id, tag, next) {
      plays.push({ id, tag, next });
    },
    animation(id, tag) {
      return animations[tag] ?? null;
    },
    dispose() {},
    warnings() {
      return [];
    },
  };
  let inputs: any[] = [];
  const p = new PreviewController(
    renderer,
    {
      sound() {},
      vibrate() {},
      work(k, v) {
        actions.push([k, v]);
      },
      call() {},
      return() {},
    },
    () => ({
      poll() {
        const out = inputs;
        inputs = [];
        return out;
      },
      dispose() {},
    }),
  );
  const rows = expandItems(doc);
  p.start(doc, rows);
  p.tick();
  p.tick();
  return {
    p,
    doc,
    a,
    b,
    plays,
    actions,
    input: (x: any) => {
      inputs = [
        {
          pid: 0,
          dx: 0,
          dy: 0,
          repeat: false,
          decide: false,
          cancel: false,
          ...x,
        },
      ];
      p.tick();
    },
  };
}
test("preview restores old focus and navigates independent buttons horizontally", () => {
  const f = fixture();
  assert.equal(f.p.phase, "selecting");
  f.input({ dx: 1 });
  assert.equal(f.p.runtime?.cursors.get(0), f.b.id);
  assert.ok(
    f.plays.some(
      (x) => x.id === f.a.id && x.tag === "off" && x.next === "normal",
    ),
  );
  assert.equal(f.plays.at(-1)?.tag, "on");
  assert.equal(f.plays.at(-1)?.next, "cursor");
  const count = f.plays.length;
  f.input({ dx: 1 });
  assert.equal(f.plays.length, count);
});
test("confirmation gates input and dispatches actions once after press completes", () => {
  const f = fixture();
  f.input({ decide: true });
  assert.equal(f.p.phase, "deciding");
  assert.equal(f.actions.length, 0);
  f.input({ dx: 1, decide: true });
  f.p.tick();
  assert.equal(f.actions.length, 0);
  f.p.tick();
  assert.equal(f.actions.length, 1);
  assert.equal(f.p.phase, "exiting");
  assert.equal(f.p.result?.name, "A");
  f.p.tick();
  f.p.tick();
  assert.equal(f.p.phase, "finished");
  f.input({ decide: true });
  assert.equal(f.actions.length, 1);
});
test("cancel plays screen out and ends without confirmation side effects", () => {
  const f = fixture();
  f.input({ cancel: true });
  assert.equal(f.p.phase, "exiting");
  assert.equal(f.p.result?.type, "cancel");
  assert.equal(f.actions.length, 0);
  assert.ok(f.plays.some((x) => x.tag === "out"));
  f.p.tick();
  f.p.tick();
  assert.equal(f.p.phase, "finished");
});
test("multi-player cancellation releases only the confirmed player's selection", () => {
  const f = fixture(true);
  f.input({ decide: true });
  f.p.tick();
  f.p.tick();
  f.p.tick();
  assert.equal(f.p.runtime?.decided.get(0), f.a.id);
  f.input({ cancel: true });
  assert.equal(f.p.phase, "selecting");
  assert.equal(f.p.runtime?.decided.has(0), false);
  f.input({ dx: 1 });
  assert.equal(f.p.runtime?.cursors.get(0), f.b.id);
});
test("dataset text changes one item and fixed text replaces its field binding", () => {
  const f = fixture();
  f.doc.settings.datasets = { modes: [{ name: "old" }, { name: "keep" }] };
  setDataText(f.doc, "modes", 0, "name", "새 파티");
  assert.deepEqual(f.doc.settings.datasets, {
    modes: [{ name: "새 파티" }, { name: "keep" }],
  });
  setFixedText(f.doc, f.a.id, "label", "고정 버튼");
  assert.deepEqual(f.a.props.bindings, [
    { pane: "label", kind: "text", value: "고정 버튼" },
  ]);
  assert.throws(() => setDataText(f.doc, "modes", 0, "__proto__.x", "bad"));
});
test("keyboard taps survive keyup before the next fixed frame", () => {
  const callbacks = new Map<string, Function>();
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"),
    oldNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(k: string, fn: Function) {
        callbacks.set(k, fn);
      },
      removeEventListener(k: string) {
        callbacks.delete(k);
      },
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [] },
  });
  try {
    const input = new PreviewInput();
    const e = {
      key: "Enter",
      repeat: false,
      target: { closest: () => null },
      preventDefault() {},
    };
    callbacks.get("keydown")!(e);
    callbacks.get("keyup")!(e);
    assert.equal(input.poll(1, 24, 6)[0].decide, true);
    assert.equal(input.poll(1, 24, 6)[0].decide, false);
    callbacks.get("keydown")!(e);
    callbacks.get("keyup")!(e);
    assert.equal(input.poll(1, 24, 6)[0].decide, true);
    input.dispose();
    assert.equal(callbacks.size, 0);
    const owned = new PreviewInput(undefined, () => 2);
    callbacks.get("keydown")!(e);
    callbacks.get("keyup")!(e);
    const inputs = owned.poll(4, 24, 6);
    assert.equal(inputs[0].decide, false);
    assert.equal(inputs[2].decide, true);
    owned.dispose();
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else delete (globalThis as any).window;
    if (oldNav) Object.defineProperty(globalThis, "navigator", oldNav);
    else delete (globalThis as any).navigator;
  }
});
