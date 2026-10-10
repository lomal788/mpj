import { el, button, field, input, select } from "../../../editor/dom";
import type { EditorContext } from "../../../editor/extensions";
import type { Entity } from "../../../editor/document";
import { props, type PartEntry } from "../schema";
import { readField } from "../data";
import { setDataText, setFixedText } from "../textEditing";

export function mountTextFields(
  body: HTMLElement,
  ctx: EditorContext,
  entity: Entity,
  part: PartEntry,
) {
  const textPanes = part.panes.filter((x) => x.kind === "txt");
  if (!textPanes.length) return;
  const box = el("section", "text-editor");
  box.append(el("h3", "", "문구 편집"));
  const p = props(entity),
    bindings = (p.bindings ?? []).filter((b) => b.kind === "text");
  const sets = ctx.store.document.settings.datasets as Record<
    string,
    Record<string, unknown>[]
  >;
  const displayedFields = new Set<string>();
  for (const binding of bindings) {
    if (binding.field && p.dataset) {
      if (displayedFields.has(binding.field)) continue;
      displayedFields.add(binding.field);
      const rows = sets?.[p.dataset] ?? [],
        path = binding.field,
        dataset = p.dataset;
      box.append(el("p", "hint", `${binding.pane} · 목록 ${dataset}`));
      rows.forEach((row, i) =>
        box.append(
          field(
            `문구 ${i + 1} (${path})`,
            input(String(readField(row, path) ?? ""), (v) =>
              ctx.store.execute("목록 문구 수정", (doc) =>
                setDataText(doc, dataset, i, path, v),
              ),
            ),
          ),
        ),
      );
    } else
      box.append(
        field(
          `문구 · ${binding.pane}`,
          input(binding.value ?? "", (v) =>
            ctx.store.execute("문구 수정", (doc) =>
              setFixedText(doc, entity.id, binding.pane, v),
            ),
          ),
        ),
      );
  }
  if (!bindings.length) {
    const primary =
      textPanes.find(
        (x) => x.visible !== false && !/shadow|guide|secret/.test(x.name),
      ) ?? textPanes[0];
    box.append(
      field(
        `문구 · ${primary.name}`,
        input(primary.text ?? "", (v) =>
          ctx.store.execute("문구 수정", (doc) =>
            setFixedText(doc, entity.id, primary.name, v),
          ),
        ),
      ),
    );
  }
  let pane =
    textPanes.find((x) => !/shadow|guide|secret/.test(x.name))?.name ??
    textPanes[0].name;
  const picker = select(
    textPanes.map((x) => ({ value: x.name, label: x.name })),
    pane,
    (v) => (pane = v),
  );
  picker.setAttribute("aria-label", "문구를 넣을 텍스트 영역");
  const value = el("input");
  value.setAttribute("aria-label", "추가할 문구");
  value.placeholder = "새 버튼 문구";
  box.append(
    picker,
    value,
    button("문구 추가 / 교체", () =>
      ctx.store.execute("문구 추가", (doc) =>
        setFixedText(doc, entity.id, pane, value.value),
      ),
    ),
    button("문구 적용", () => ctx.notify("문구를 적용했습니다.")),
    el(
      "p",
      "hint",
      "목록 문구는 항목별로 수정합니다. 추가 / 교체는 해당 영역을 고정 문구로 바꿉니다.",
    ),
  );
  body.append(box);
}
