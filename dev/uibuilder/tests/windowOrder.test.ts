import assert from "node:assert/strict";
import { test } from "node:test";
import { windowFramesFirst } from "../src/adapters/mpj/windowOrder";
test("converted window pieces draw before labels, including nested parts", () => {
  const part: any = {
    nodes: [
      { spec: { n: "root" }, children: [1, 2] },
      { spec: { n: "label" }, children: [] },
      { spec: { n: "window#C" }, children: [] },
    ],
    parts: new Map(),
  };
  const root: any = {
    nodes: [
      { spec: { n: "root" }, children: [1, 2, 3] },
      { spec: { n: "label" }, children: [] },
      { spec: { n: "window#C" }, children: [] },
      { spec: { n: "button" }, children: [] },
    ],
    parts: new Map([[3, part]]),
  };
  windowFramesFirst(root);
  assert.deepEqual(root.nodes[0].children, [2, 1, 3]);
  assert.deepEqual(part.nodes[0].children, [2, 1]);
});
