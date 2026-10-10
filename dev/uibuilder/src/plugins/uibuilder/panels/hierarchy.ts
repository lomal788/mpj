import { el, button } from "../../../editor/dom";
import type { EditorContext } from "../../../editor/extensions";
import { createEntity } from "../schema";
export function mountHierarchy(host: HTMLElement, ctx: EditorContext) {
  const tools = el("div", "row");
  tools.append(
    button("그룹 +", () => {
      const n = createEntity("ui.group", "새 그룹");
      ctx.store.execute("그룹 추가", (d) => d.entities.push(n));
      ctx.store.select(n.id);
    }),
    button("삭제", () => ctx.store.remove()),
  );
  host.append(tools);
  const list = el("div", "hierarchy-list");
  host.append(list);
  return ctx.store.subscribe(() => {
    list.replaceChildren();
    const add = (parent: string | null, depth: number) => {
      for (const n of ctx.store.document.entities.filter(
        (x) => x.parent === parent,
      )) {
        const row = el(
          "div",
          `layer-row ${ctx.store.selection.includes(n.id) ? "selected" : ""}`,
        );
        row.style.paddingLeft = `${depth * 14}px`;
        row.append(
          button(n.type === "ui.group" ? "▾" : "▧", () =>
            ctx.store.select(n.id),
          ),
          button(
            n.name,
            () =>
              ctx.store.select(
                n.id,
                window.event instanceof MouseEvent && window.event.shiftKey,
              ),
            "layer-name",
          ),
          button(n.visible ? "◉" : "○", () =>
            ctx.store.update(n.id, (n) => (n.visible = !n.visible)),
          ),
          button(n.locked ? "▣" : "◇", () =>
            ctx.store.update(n.id, (n) => (n.locked = !n.locked)),
          ),
        );
        list.append(row);
        add(n.id, depth + 1);
      }
    };
    add(null, 0);
  });
}
