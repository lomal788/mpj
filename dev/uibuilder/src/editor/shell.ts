import { el, button } from "./dom";
import type { ExtensionRegistry, EditorContext } from "./extensions";
export function mountEditor(
  root: HTMLElement,
  registry: ExtensionRegistry,
  ctx: EditorContext,
  workspaceName = "Editor",
) {
  const header = el("header", "app-header");
  header.append(
    el("div", "brand", "◈ MPJ STUDIO"),
    el("span", "workspace-name", workspaceName),
  );
  const title = el("span", "document-title");
  header.append(title);
  const tools = el("nav", "toolbar");
  for (const t of registry.tools)
    tools.append(button(t.label, () => t.run(ctx)));
  header.append(tools);
  const workspace = el("main", "workspace");
  const areas = new Map<string, HTMLElement>();
  for (const name of ["left", "center", "right", "bottom"]) {
    const area = el("section", `dock dock-${name}`);
    areas.set(name, area);
    workspace.append(area);
  }
  const status = el("footer", "statusbar", "준비");
  root.append(header, workspace, status);
  const disposers: (() => void)[] = [];
  for (const p of registry.panels) {
    const host = el("section", `panel panel-${p.id}`);
    host.append(el("h2", "panel-title", p.title));
    areas.get(p.area)!.append(host);
    const dispose = p.mount(host, ctx);
    if (dispose) disposers.push(dispose);
  }
  disposers.push(
    ctx.store.subscribe(
      () =>
        (title.textContent = `${ctx.store.document.title}${ctx.store.dirty ? " •" : ""}`),
    ),
  );
  ctx.store.emit();
  const notify = (event: Event) => {
    status.textContent = (event as CustomEvent).detail;
  };
  window.addEventListener("editor-notify", notify);
  window.addEventListener("editor-error", notify);
  const keys = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement).closest("input,textarea,select") ||
      ctx.store.preview
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? ctx.store.redo() : ctx.store.undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      ctx.store.redo();
    }
    if (e.key === "Delete") ctx.store.remove();
  };
  window.addEventListener("keydown", keys);
  return () => {
    disposers.forEach((d) => d());
    window.removeEventListener("keydown", keys);
    window.removeEventListener("editor-notify", notify);
    window.removeEventListener("editor-error", notify);
    root.replaceChildren();
  };
}
