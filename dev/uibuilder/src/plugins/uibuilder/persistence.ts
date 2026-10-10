import { button, el, input, field, select } from "../../editor/dom";
import type { EditorContext } from "../../editor/extensions";
import { validateDocument } from "../../editor/document";
async function request(url: string, init?: RequestInit) {
  const r = await fetch(url, init),
    data = await r.json();
  if (!r.ok) throw Error(data.error ?? `HTTP ${r.status}`);
  return data;
}
export async function saveProject(ctx: EditorContext) {
  const d = ctx.store.document;
  const saved = await request(`/api/projects/${encodeURIComponent(d.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  });
  ctx.store.dirty = false;
  ctx.store.emit();
  ctx.notify(`저장: ${saved.path}`);
}
export function exportProject(ctx: EditorContext) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(ctx.store.document, null, 2)], {
      type: "application/json",
    }),
  );
  const a = el("a");
  a.href = url;
  a.download = `${ctx.store.document.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
export async function openProject(ctx: EditorContext) {
  const names = (await request("/api/projects")) as string[];
  const dialog = el("dialog", "project-dialog");
  dialog.append(el("h2", "", "화면 열기"));
  let selected = names[0] ?? "";
  dialog.append(
    select(
      names.map((value) => ({ value, label: value })),
      selected,
      (v) => (selected = v),
    ),
  );
  dialog.append(
    button("저장된 화면 열기", async () => {
      if (!selected) return;
      ctx.store.load(
        await request(`/api/projects/${encodeURIComponent(selected)}`),
      );
      dialog.close();
      dialog.remove();
    }),
  );
  const upload = el("input");
  upload.type = "file";
  upload.accept = ".json";
  upload.onchange = () =>
    void (async () => {
      const file = upload.files?.[0];
      if (!file) return;
      ctx.store.load(validateDocument(JSON.parse(await file.text())));
      dialog.close();
      dialog.remove();
    })().catch((e) => ctx.notify(e.message));
  dialog.append(
    field("JSON 가져오기", upload),
    button("닫기", () => {
      dialog.close();
      dialog.remove();
    }),
  );
  document.body.append(dialog);
  dialog.showModal();
}
