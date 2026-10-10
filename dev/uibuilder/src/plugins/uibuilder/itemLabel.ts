import { props, type RenderItem } from "./schema";
import { readField } from "./data";
export function itemLabel(item: RenderItem) {
  const text = (props(item.entity).bindings ?? []).find(
    (b) => b.kind === "text",
  );
  const value = text
    ? text.field
      ? readField(item.data, text.field)
      : text.value
    : undefined;
  return String(value ?? item.data.name ?? item.entity.name);
}
