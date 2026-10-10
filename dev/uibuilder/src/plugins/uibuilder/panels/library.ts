import { el, button, select } from "../../../editor/dom";
import type { EditorContext } from "../../../editor/extensions";
import type { EditorDocument } from "../../../editor/document";
import { partEntity } from "../schema";
import { makeTemplate, TEMPLATES, sceneRegion } from "../templates";
import type { BuilderServices } from "../services";
import { createThumbnails } from "../thumbnails";
import { partDocument } from "../presentation";
import { showGallery } from "../gallery";
import { showPreview } from "../previewDialog";

export function mountLibrary(
  host: HTMLElement,
  ctx: EditorContext,
  services: BuilderServices,
) {
  const { catalog } = services,
    thumbnails = createThumbnails(services);
  const previews = new Set<() => void>();
  const addTemplate = (id: string) => {
    const d = makeTemplate(id, catalog);
    ctx.store.execute("템플릿 화면 열기", draft => Object.assign(draft, d));
    const edit =
      d.entities.find((n) => n.props.interactive) ??
      d.entities.find((n) => !n.locked);
    if (edit) ctx.store.select(edit.id);
  };
  let template = "select-menu",
    mode = "parts",
    group = "all";
  const tools = el("div", "library-tools");
  const templatePicker = select(
    TEMPLATES.map((t) => ({ value: t.id, label: t.name })),
    template,
    (v) => (template = v),
  );
  templatePicker.setAttribute("aria-label", "구성 템플릿");
  tools.append(
    templatePicker,
    button("갤러리 / 동시 미리보기", () => { previews.add(showGallery(ctx,services,addTemplate)); }),
    button("템플릿으로 열기", () => addTemplate(template)),
    button("템플릿 미리보기", () => {
      previews.add(showPreview(makeTemplate(template, catalog), ctx, services));
    }),
    button("3D 영역 +", () =>
      ctx.store.execute("3D 영역 추가", (d) => d.entities.push(sceneRegion())),
    ),
  );
  host.append(tools);
  const tabs = el("div", "row library-tabs");
  tabs.append(
    button("레이아웃 목록", () => {
      mode = "parts";
      render();
    }),
    button("템플릿 목록", () => {
      mode = "templates";
      render();
    }),
  );
  host.append(tabs);
  const search = el("input");
  search.type = "search";
  search.placeholder = "원본 이름·종류 검색";
  search.setAttribute("aria-label", "부품 검색");
  host.append(
    search,
    el(
      "p",
      "hint",
      `${catalog.entries.length}개 변환 레이아웃 · 원본 ${catalog.raw.length}개`,
    ),
  );
  const groups = select(
    [
      { value: "all", label: "전체 부품" },
      ...[
        "버튼",
        "카드",
        "창",
        "커서",
        "텔롭",
        "아이콘",
        "배경 / 조합",
        "기타",
      ].map((x) => ({ value: x, label: x })),
      { value: "raw", label: "원본 전체 목록 (읽기 전용)" },
    ],
    group,
    (v) => {
      group = v;
      render();
    },
  );
  groups.setAttribute("aria-label", "부품 종류");
  host.append(groups);
  const list = el("div", "part-list");
  host.append(list);
  function card(
    name: string,
    meta: string,
    doc: EditorDocument | null,
    key: string,
    preview: () => void,
    add?: () => void,
  ) {
    const row = el("div", "library-card"),
      image = el("img", "library-thumbnail");
    image.alt = doc
      ? `${name} 미리보기 준비 중`
      : "현재 렌더러에서 지원하지 않는 원본";
    const view = button("", preview, "library-preview");
    view.setAttribute("aria-label", `${name} 미리보기`);
    view.append(image, el("span", "thumbnail-caption", "▶ 미리보기"));
    view.disabled = !doc;
    row.append(view, el("strong", "part-name", name), el("small", "", meta));
    if (add) row.append(button("+ 추가", add, "library-add"));
    list.append(row);
    if (doc) thumbnails.observe(image, key, doc);
    return row;
  }
  function render() {
    thumbnails.clear();
    list.replaceChildren();
    groups.hidden = mode === "templates";
    const q = search.value.toLowerCase();
    if (mode === "templates") {
      for (const t of TEMPLATES.filter((t) =>
        `${t.name} ${t.id}`.toLowerCase().includes(q),
      )) {
        const doc = makeTemplate(t.id, catalog);
        card(
          t.name,
          `${t.group} · ${t.mode} · 문구 편집 가능`,
          doc,
          `template:${t.id}`,
          () => previews.add(showPreview(doc, ctx, services)),
          () => addTemplate(t.id),
        );
      }
      return;
    }
    if (group === "raw") {
      for (const raw of catalog.raw.filter((p) =>
        `${p.id} ${p.description}`.toLowerCase().includes(q),
      )) {
        const row = el("a", "raw-row", raw.id);
        row.href = `/docs/engine/ui_parts_catalog.md#L${raw.line}`;
        row.target = "_blank";
        row.title = raw.description;
        list.append(row);
      }
      return;
    }
    for (const part of catalog.entries.filter(
      (p) =>
        (group === "all" || p.category === group) &&
        `${p.layout} ${p.category}`.toLowerCase().includes(q),
    )) {
      const doc = part.readonly ? null : partDocument(part);
      const row = card(
        part.layout,
        `${part.id.split("/")[0]} · ${part.category} · ${part.animations.length} 애니${part.readonly ? " · 읽기 전용" : ""}`,
        doc,
        part.id,
        () => {
          if (doc) previews.add(showPreview(doc, ctx, services, part));
        },
        part.readonly
          ? undefined
          : () => {
              const n = partEntity(part);
              ctx.store.execute("부품 추가", (d) => d.entities.push(n));
              ctx.store.select(n.id);
            },
      );
      row.draggable = !part.readonly;
      row.ondragstart = (e) =>
        e.dataTransfer?.setData("application/mpj-part", part.id);
    }
  }
  search.oninput = render;
  render();
  return () => {
    thumbnails.dispose();
    for (const close of previews) close();
  };
}

