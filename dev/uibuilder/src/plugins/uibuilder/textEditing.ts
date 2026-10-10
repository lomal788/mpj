import type { EditorDocument } from "../../editor/document";
import { props, type Binding } from "./schema";

export function setDataText(
  doc: EditorDocument,
  dataset: string,
  index: number,
  path: string,
  value: string,
) {
  const rows = (
    doc.settings.datasets as Record<string, Record<string, unknown>[]>
  )?.[dataset];
  if (!rows?.[index]) throw Error("없는 데이터 항목");
  const keys = path.split(".");
  if (
    keys.some(
      (k) => !k || ["__proto__", "constructor", "prototype"].includes(k),
    )
  )
    throw Error("유효하지 않은 데이터 필드");
  let row = rows[index];
  for (const key of keys.slice(0, -1)) {
    if (!row[key] || typeof row[key] !== "object" || Array.isArray(row[key]))
      row[key] = {};
    row = row[key] as Record<string, unknown>;
  }
  row[keys.at(-1)!] = value;
}
export function setFixedText(
  doc: EditorDocument,
  id: string,
  pane: string,
  value: string,
) {
  const entity = doc.entities.find((x) => x.id === id);
  if (!entity) throw Error("없는 부품");
  const bindings = (props(entity).bindings ??= []);
  const binding = bindings.find((x) => x.kind === "text" && x.pane === pane);
  if (binding) {
    binding.value = value;
    delete binding.field;
  } else bindings.push({ pane, kind: "text", value });
}
