export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
}
const inputCommits = new WeakMap<HTMLInputElement, () => void>();
export function commitPendingInputs() {
  // Commit the values before an action can replace the inspector or save it.
  for (const node of document.querySelectorAll("input"))
    inputCommits.get(node)?.();
}
export function button(text: string, fn: () => void | Promise<void>, cls = "") {
  const b = el("button", cls, text);
  b.type = "button";
  b.onclick = () =>
    void Promise.resolve()
      .then(() => {
        commitPendingInputs();
        return fn();
      })
      .catch((e) =>
        window.dispatchEvent(
          new CustomEvent("editor-error", { detail: String(e.message ?? e) }),
        ),
      );
  return b;
}
export function field(label: string, input: HTMLElement) {
  const l = el("label", "field");
  l.append(el("span", "", label), input);
  return l;
}
export function input(
  value: string,
  change: (v: string) => void,
  type = "text",
) {
  const i = el("input");
  i.type = type;
  i.value = value;
  let committed = value;
  const commit = () => {
    if (i.value === committed) return;
    try {
      change(i.value);
      committed = i.value;
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent("editor-error", {
          detail: String((e as Error).message),
        }),
      );
    }
  };
  inputCommits.set(i, commit);
  i.onchange = commit;
  i.onblur = commit;
  i.onkeydown = (e) => {
    if (e.key === "Enter") commit();
  };
  return i;
}
export function select(
  options: { value: string; label: string }[],
  value: string,
  change: (v: string) => void,
) {
  const s = el("select");
  for (const o of options) {
    const p = el("option", "", o.label);
    p.value = o.value;
    s.append(p);
  }
  s.value = value;
  s.onchange = () => change(s.value);
  return s;
}
