import { computeAlignment } from "@app/common/ui/alignment";
import type { EditorStore } from "../../editor/store";
/** MPJ alignment adapter; generic editor history remains independent. */
export function alignSelection(store: EditorStore, mode: string) {
  const selected = store.document.entities.filter(
    (n) => store.selection.includes(n.id) && !n.locked,
  );
  if (!selected.length) return;
  if (new Set(selected.map((n) => n.parent)).size !== 1)
    throw Error("같은 부모의 부품만 정렬할 수 있습니다.");
  const horizontal = mode.startsWith("x"),
    axis = horizontal ? "x" : "y",
    size = horizontal ? "width" : "height",
    kind = mode.endsWith("start") ? 0 : mode.endsWith("center") ? 1 : 2;
  const out = computeAlignment(
    { horizontal, kind, gap: 20, stretch: false },
    horizontal ? 1920 : 1080,
    selected.map((n) => ({
      visible: n.visible,
      extent: n.transform[size] * n.transform.scale,
      pos: n.transform[axis],
      bias: 0,
    })),
  );
  store.execute("정렬", (d) => {
    for (const [i, n] of selected.entries()) {
      const node = d.entities.find((x) => x.id === n.id)!;
      if (out.written[i]) node.transform[axis] = Math.fround(out.pos[i]);
    }
  });
}
export function reorderSelection(store: EditorStore, delta: number) {
  store.execute("겹침 순서", (d) => {
    const order = delta > 0 ? [...store.selection].reverse() : store.selection;
    for (const id of order) {
      const i = d.entities.findIndex((x) => x.id === id),
        j = i + delta;
      if (i >= 0 && j >= 0 && j < d.entities.length)
        [d.entities[i], d.entities[j]] = [d.entities[j], d.entities[i]];
    }
  });
}
