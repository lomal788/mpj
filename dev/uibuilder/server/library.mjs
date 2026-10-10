import fs from "node:fs/promises";
import path from "node:path";
export const SOURCES = {
  charselect: "charselect/spec.json",
  modeselect: "modeselect/spec.json",
  common: "mgmcommon/spec.json",
  freeplay: "mgmcommon/mgm01.json",
  harbor: "mgmcommon/mgmet.json",
  online: "online/online.json",
  plaza: "plaza/ui/plaza_ui.json",
  card: "plaza/ui/plaza_card.json",
  hud: "mgscene/ui.json",
};
const archive = (n) =>
  n.startsWith("mn01_")
    ? "M"
    : n.startsWith("mn00_")
      ? "L"
      : n.startsWith("mncom_")
        ? "U"
        : n.startsWith("matching00_")
          ? "Q"
          : n.startsWith("mgmet_")
            ? "H"
            : n.startsWith("mgm01_")
              ? "F"
              : n.startsWith("mgm00_")
                ? "C"
                : "P";
export async function library(web) {
  const specs = Object.fromEntries(
    await Promise.all(
      Object.entries(SOURCES).map(async ([source, file]) => [
        source,
        JSON.parse(await fs.readFile(path.join(web, "assets", file), "utf8")),
      ]),
    ),
  );
  const panes = (ls, source, prefix = "", seen = new Set()) => {
    const out = [];
    for (const n of ls.nodes ?? []) {
      out.push({
        name: prefix + n.n,
        kind: n.k,
        size: n.z,
        origin: n.o,
        parentOrigin: n.po,
        parent: n.p,
        material: n.m,
        font: n.txt?.font,
        text: n.txt?.text ?? "",
        visible: n.v,
        textureSlots:
          ls.mats[n.m]?.tex?.map((x, i) => ({ slot: i, name: x.name })) ?? [],
      });
      if (n.part && !seen.has(n.part)) {
        const child =
          specs[source].layouts[n.part] ?? specs.common.layouts[n.part];
        if (child)
          out.push(
            ...panes(
              child,
              specs[source].layouts[n.part] ? source : "common",
              prefix + n.n + "/",
              new Set([...seen, n.part]),
            ),
          );
      }
    }
    return out;
  };
  const entries = new Map();
  for (const [source, file] of Object.entries(SOURCES)) {
    const spec = specs[source];
    for (const [layout, ls] of Object.entries(spec.layouts)) {
      // Tree HUD uses a different renderer contract; preserve it as read-only.
      const nodes = ls.nodes ?? [];
      const id = `${archive(layout)}/${layout}`;
      if (entries.has(id) && !entries.get(id).readonly) continue;
      entries.set(id, {
        id,
        layout,
        source,
        file,
        size: ls.size ?? ls.root?.size ?? [1920, 1080],
        readonly: !ls.nodes,
        panes: panes(ls, source),
        animations: Object.entries(ls.anims ?? {}).map(([tag, a]) => ({
          tag,
          frames: a.len,
          loop: a.loop,
        })),
        category: /btn|arrowchoices/.test(layout)
          ? "버튼"
          : /cursor/.test(layout)
            ? "커서"
            : /thum|charamodel|card/.test(layout)
              ? "카드"
              : /meswin|dialog|win/.test(layout)
                ? "창"
                : /tlp|title/.test(layout)
                  ? "텔롭"
                  : /icon|face/.test(layout)
                    ? "아이콘"
                    : /bg|base/.test(layout)
                      ? "배경 / 조합"
                      : "기타",
      });
    }
  }
  const doc = await fs.readFile(
    path.join(web, "docs/engine/ui_parts_catalog.md"),
    "utf8",
  );
  let group = "";
  const raw = [];
  for (const [i, line] of doc.split("\n").entries()) {
    const h = /^### D\.([PCFHMLQU])\b/.exec(line);
    if (h) group = h[1];
    const row = /^\| \[데이터\] `([^`]+)`/.exec(line);
    if (group && row)
      raw.push({
        id: `${group}/${row[1]}`,
        layout: row[1],
        readonly: !entries.has(`${group}/${row[1]}`),
        line: i + 1,
        description: line.slice(0, 1200),
      });
  }
  return {
    entries: [...entries.values()],
    raw,
    sources: SOURCES,
    reference: "/docs/engine/ui_parts_catalog.md",
  };
}
