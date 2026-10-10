import { el, button, input, field, select } from "../../../editor/dom";
import type { EditorContext } from "../../../editor/extensions";
import { props, type Binding } from "../schema";
import type { BuilderServices } from "../services";
import { mountTextFields } from "./text";
export function mountInspector(
  host: HTMLElement,
  ctx: EditorContext,
  { catalog }: BuilderServices,
) {
  const body = el("div", "inspector-body");
  host.append(body);
  return ctx.store.subscribe(() => {
    body.replaceChildren();
    const n = ctx.store.selected;
    body.append(
      field(
        "화면 ID",
        input(ctx.store.document.id, (v) =>
          ctx.store.execute("이름", (d) => (d.id = v)),
        ),
      ),
      field(
        "제목",
        input(ctx.store.document.title, (v) =>
          ctx.store.execute("제목", (d) => (d.title = v)),
        ),
      ),
    );
    if (!n) {
      body.append(el("p", "hint", "캔버스 또는 레이어에서 부품을 선택하세요."));
      return;
    }
    body.append(
      el(
        "h3",
        "",
        n.type === "ui.part"
          ? "원본 레이아웃"
          : n.type === "ui.scene3d"
            ? "3D 서비스 영역"
            : "그룹",
      ),
      field(
        "이름",
        input(n.name, (v) => ctx.store.update(n.id, (n) => (n.name = v))),
      ),
    );
    const textPart =
      n.type === "ui.part"
        ? catalog.entries.find((x) => x.id === n.props.part)
        : undefined;
    if (textPart) mountTextFields(body, ctx, n, textPart);
    const coords = el("div", "property-grid");
    for (const [key, label] of Object.entries({
      x: "X (오른쪽 +)",
      y: "Y (위쪽 +)",
      width: "영역 폭",
      height: "영역 높이",
      scale: "배율",
      rotation: "회전 °",
    }))
      coords.append(
        field(
          label,
          input(
            String(n.transform[key as keyof typeof n.transform]),
            (v) => {
              const val = Number(v);
              if (Number.isFinite(val))
                ctx.store.update(
                  n.id,
                  (n) => (n.transform[key as keyof typeof n.transform] = val),
                );
            },
            "number",
          ),
        ),
      );
    body.append(coords);
    body.append(
      field(
        "부모 그룹",
        select(
          [
            { value: "", label: "화면 루트" },
            ...ctx.store.document.entities
              .filter((x) => x.type === "ui.group" && x.id !== n.id)
              .map((x) => ({ value: x.id, label: x.name })),
          ],
          n.parent ?? "",
          (v) => ctx.store.update(n.id, (n) => (n.parent = v || null)),
        ),
      ),
    );
    if (n.type === "ui.scene3d") {
      body.append(
        field(
          "장면 서비스 ID",
          input(String(n.props.sceneService ?? ""), (v) =>
            ctx.store.update(n.id, (n) => (n.props.sceneService = v)),
          ),
        ),
        el(
          "p",
          "hint",
          "3D는 영역·서비스 ID만 저장합니다. 실제 장면은 앱 서비스에서 연결합니다.",
        ),
      );
      return;
    }
    if (n.type !== "ui.part") return;
    const p = props(n),
      part = catalog.entries.find((x) => x.id === p.part);
    if (!part) return;
    body.append(
      el("p", "source-label", `${part.id} · ${part.file}`),
      field(
        "원본 애니 태그",
        select(
          [
            { value: "", label: "기본 상태" },
            ...part.animations.map((a) => ({
              value: a.tag,
              label: `${a.tag || "(무명)"} · ${a.frames}f${a.loop ? " ↻" : ""}`,
            })),
          ],
          p.animation ?? "",
          (v) => ctx.store.update(n.id, (n) => (n.props.animation = v)),
        ),
      ),
      field(
        "덧씌우기 시점",
        select(
          [
            { value: "initial", label: "초기값만 (애니가 이후 변경)" },
            { value: "persistent", label: "매 프레임 (애니와 충돌 가능)" },
          ],
          p.animationMode ?? "initial",
          (v) => ctx.store.update(n.id, (n) => (n.props.animationMode = v)),
        ),
      ),
    );
    const inter = el("input");
    inter.type = "checkbox";
    inter.checked = !!p.interactive;
    inter.onchange = () =>
      ctx.store.update(n.id, (n) => (n.props.interactive = inter.checked));
    body.append(field("입력 대상", inter));
    const disabled = el("input");
    disabled.type = "checkbox";
    disabled.checked = !!p.disabled;
    disabled.onchange = () =>
      ctx.store.update(n.id, (n) => (n.props.disabled = disabled.checked));
    body.append(field("선택 불가", disabled));
    const sets = Object.keys(
      (ctx.store.document.settings.datasets as object) ?? {},
    );
    body.append(
      field(
        "데이터 목록",
        select(
          [
            { value: "", label: "단일 부품" },
            ...sets.map((value) => ({ value, label: value })),
          ],
          p.dataset ?? "",
          (v) => ctx.store.update(n.id, (n) => (n.props.dataset = v)),
        ),
      ),
    );
    for (const [key, label, value] of [
      ["columns", "열 수", p.columns ?? 1],
      ["gapX", "가로 간격", p.gapX ?? n.transform.width],
      ["gapY", "세로 간격", p.gapY ?? n.transform.height],
      ["owner", "입력 소유자 (0~3)", p.owner ?? 0],
    ] as const)
      body.append(
        field(
          label,
          input(
            String(value),
            (v) => ctx.store.update(n.id, (n) => (n.props[key] = Number(v))),
            "number",
          ),
        ),
      );
    body.append(
      field(
        "목록 필터",
        input(p.filter ?? "", (v) =>
          ctx.store.update(n.id, (n) => (n.props.filter = v)),
        ),
      ),
      field(
        "정렬 필드",
        input(p.sort ?? "", (v) =>
          ctx.store.update(n.id, (n) => (n.props.sort = v)),
        ),
      ),
    );
    body.append(el("h3", "", "Pane 연결"));
    const bindings = p.bindings ?? [];
    bindings.forEach((b, index) => {
      const box = el("div", "binding-card");
      const update = (change: Partial<Binding>) =>
        ctx.store.update(n.id, (n) =>
          Object.assign(props(n).bindings![index], change),
        );
      box.append(
        field(
          "Pane 경로",
          input(b.pane, (v) => update({ pane: v })),
        ),
        field(
          "종류",
          select(
            ["text", "image", "visible", "color"].map((value) => ({
              value,
              label: value,
            })),
            b.kind,
            (v) => update({ kind: v as Binding["kind"] }),
          ),
        ),
        field(
          "데이터 필드",
          input(b.field ?? "", (v) => update({ field: v || undefined })),
        ),
        field(
          "고정값",
          input(b.value ?? "", (v) => update({ value: v, field: undefined })),
        ),
        field(
          "그림 칸 (0부터)",
          input(
            String(b.slot ?? 0),
            (v) => update({ slot: Number(v) }),
            "number",
          ),
        ),
        button("연결 삭제", () =>
          ctx.store.update(n.id, (n) => props(n).bindings!.splice(index, 1)),
        ),
      );
      body.append(box);
    });
    body.append(
      button("연결 +", () =>
        ctx.store.update(n.id, (n) =>
          (props(n).bindings ??= []).push({
            pane: part.panes.find((x) => x.kind === "txt")?.name ?? "",
            kind: "text",
            value: "새 문구",
          }),
        ),
      ),
    );
    const panes = el("details", "pane-list");
    panes.append(el("summary", "", `원본 Pane ${part.panes.length}개`));
    for (const pane of part.panes)
      panes.append(
        el(
          "p",
          "mono",
          `${pane.name} · ${pane.kind} · ${pane.size.join("×")}${pane.textureSlots.length ? " · " + pane.textureSlots.map((x) => `${x.slot}:${x.name}`).join(",") : ""}`,
        ),
      );
    body.append(
      panes,
      el(
        "p",
        "hint",
        "원본 크기는 읽기 전용입니다. 영역 폭·높이는 편집/3D 영역 경계, 배율은 원본 그리기 크기입니다. nested Parts는 pane/child 경로로 연결합니다.",
      ),
    );
  });
}
