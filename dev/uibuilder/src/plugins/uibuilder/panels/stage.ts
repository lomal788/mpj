import { el, button, select } from "../../../editor/dom";
import type { EditorContext } from "../../../editor/extensions";
import type { EditorDocument } from "../../../editor/document";
import { worldTransform } from "../../../editor/document";
import { props, partEntity, type RenderItem } from "../schema";
import { expandItems } from "../data";
import { PreviewController } from "../preview";
import type { BuilderServices } from "../services";
import { alignSelection, reorderSelection } from "../transforms";
import { showPreview } from "../previewDialog";
export function mountStage(
  host: HTMLElement,
  ctx: EditorContext,
  services: BuilderServices,
) {
  const tools = el("div", "stage-tools");
  let alignment = "x-center";
  tools.append(
    button("↶", () => ctx.store.undo()),
    button("↷", () => ctx.store.redo()),
    select(
      [
        { value: "x-start", label: "가로 시작" },
        { value: "x-center", label: "가로 가운데" },
        { value: "x-end", label: "가로 끝" },
        { value: "y-start", label: "세로 시작" },
        { value: "y-center", label: "세로 가운데" },
        { value: "y-end", label: "세로 끝" },
      ],
      alignment,
      (v) => (alignment = v),
    ),
    button("선택 정렬", () => alignSelection(ctx.store, alignment)),
    button("앞으로", () => reorderSelection(ctx.store, 1)),
    button("뒤로", () => reorderSelection(ctx.store, -1)),
    button("실행 미리보기", () => {
      showPreview(ctx.store.document, ctx, services);
    }),
  );
  host.append(tools);
  const viewport = el("div", "viewport"),
    frame = el("div", "stage-frame"),
    canvas = el("canvas", "stage-canvas"),
    overlay = el("div", "stage-overlay"),
    status = el("div", "stage-status", "원본 에셋 준비…");
  frame.append(canvas, overlay);
  viewport.append(frame);
  host.append(
    viewport,
    status,
    el(
      "p",
      "stage-help",
      "1920 × 1080 · 원점 가운데 / Y 위쪽 + · Shift 다중 선택 · 10px 스냅 · 미리보기: 방향키 / Enter / Esc · 패드 1~4",
    ),
  );
  const renderer = services.createRenderer(canvas),
    preview = new PreviewController(
      renderer,
      services.createPreviewServices(ctx),
      services.createInput,
    );
  let items: RenderItem[] = [],
    ready = false,
    signature = "",
    serial = 0,
    queue = Promise.resolve(),
    raf = 0,
    last = 0,
    acc = 0,
    disposed = false,
    dragging = false;
  const point = (x: number, y: number) => {
    const r = frame.getBoundingClientRect();
    return {
      x: ((x - r.left) / r.width) * 1920 - 960,
      y: 540 - ((y - r.top) / r.height) * 1080,
    };
  };
  function updateOverlay() {
    overlay.replaceChildren();
    for (const item of items) {
      const n = item.entity;
      if (n.locked && !ctx.store.preview) continue;
      const box = el(
        "button",
        `stage-box ${ctx.store.selection.includes(n.id) ? "selected" : ""} ${n.type === "ui.scene3d" ? "region" : ""}`,
      );
      box.type = "button";
      box.setAttribute("aria-label", `캔버스 ${n.name}`);
      box.dataset.entity = n.id;
      const local = renderer.bounds?.(item),
        width = (local?.width ?? n.transform.width) * item.scale,
        height = (local?.height ?? n.transform.height) * item.scale,
        r = (item.rotation * Math.PI) / 180,
        cx = (local?.x ?? 0) * item.scale,
        cy = (local?.y ?? 0) * item.scale,
        x = item.x + cx * Math.cos(r) - cy * Math.sin(r),
        y = item.y + cx * Math.sin(r) + cy * Math.cos(r);
      box.style.left = `${((960 + x - width / 2) / 1920) * 100}%`;
      box.style.top = `${((540 - y - height / 2) / 1080) * 100}%`;
      box.style.width = `${(Math.max(20, width) / 1920) * 100}%`;
      box.style.height = `${(Math.max(20, height) / 1080) * 100}%`;
      box.style.transform = `rotate(${-item.rotation}deg)`;
      if (n.type === "ui.scene3d")
        box.textContent = `3D · ${n.name} / ${props(n).sceneService}`;
      if (ctx.store.preview) {
        const pids = [...(preview.runtime?.cursors.entries() ?? [])]
          .filter(([, id]) => id === item.id)
          .map(([pid]) => pid);
        if (pids.length) {
          box.classList.add("focused");
          box.dataset.players = pids.map((x) => `${x + 1}P`).join(" / ");
        }
        box.onclick = () => preview.click(item.id);
      } else
        box.onpointerdown = (e) => {
          if (
            n.locked ||
            (n.parent &&
              ctx.store.document.entities.find((x) => x.id === n.parent)
                ?.locked)
          )
            return;
          e.preventDefault();
          dragging = true;
          ctx.store.select(n.id, e.shiftKey);
          const start = point(e.clientX, e.clientY),
            initial = structuredClone(ctx.store.document),
            selected = new Set(ctx.store.selection);
          dragging = true;
          box.setPointerCapture(e.pointerId);
          let dx = 0,
            dy = 0;
          const move = (event: PointerEvent) => {
            const p = point(event.clientX, event.clientY);
            dx = Math.round((p.x - start.x) / 10) * 10;
            dy = Math.round((p.y - start.y) / 10) * 10;
            const doc = structuredClone(initial);
            for (const node of doc.entities.filter(
              (x) => selected.has(x.id) && !x.locked,
            )) {
              const parent = node.parent
                ? doc.entities.find((x) => x.id === node.parent)
                : null;
              const t = parent
                ? worldTransform(doc, parent)
                : { scale: 1, rotation: 0 };
              const r = (t.rotation * Math.PI) / 180;
              node.transform.x +=
                (dx * Math.cos(r) + dy * Math.sin(r)) / t.scale;
              node.transform.y +=
                (-dx * Math.sin(r) + dy * Math.cos(r)) / t.scale;
            }
            items = expandItems(doc);
            renderer.draw(items);
            box.style.translate = `${(dx / 1920) * frame.clientWidth}px ${(-dy / 1080) * frame.clientHeight}px`;
          };
          const up = () => {
            box.onpointermove = null;
            box.onpointerup = null;
            box.onpointercancel = null;
            dragging = false;
            if (dx || dy) {
              ctx.store.execute("끌어 놓기", (doc) => {
                for (const node of doc.entities.filter(
                  (x) => selected.has(x.id) && !x.locked,
                )) {
                  const parent = node.parent
                    ? doc.entities.find((x) => x.id === node.parent)
                    : null;
                  const t = parent
                    ? worldTransform(doc, parent)
                    : { scale: 1, rotation: 0 };
                  const r = (t.rotation * Math.PI) / 180;
                  node.transform.x +=
                    (dx * Math.cos(r) + dy * Math.sin(r)) / t.scale;
                  node.transform.y +=
                    (-dx * Math.sin(r) + dy * Math.cos(r)) / t.scale;
                }
              });
            } else {
              items = expandItems(ctx.store.document);
              renderer.draw(items);
              updateOverlay();
            }
          };
          box.onpointermove = move;
          box.onpointerup = up;
          box.onpointercancel = up;
        };
      overlay.append(box);
    }
  }
  const refresh = () => {
    const sig = JSON.stringify(ctx.store.document);
    if (sig === signature) {
      if (ready && !dragging) {
        if (ctx.store.preview && !preview.runtime)
          preview.start(ctx.store.document, items);
        if (!ctx.store.preview && preview.runtime) preview.stop();
        updateOverlay();
      }
      return;
    }
    signature = sig;
    const version = ++serial;
    ready = false;
    preview.stop();
    status.textContent = "원본 부품·글꼴 준비…";
    const doc = structuredClone(ctx.store.document);
    queue = queue
      .then(async () => {
        if (version !== serial || disposed) return;
        await renderer.prepare(doc);
        if (version !== serial || disposed) return;
        items = expandItems(doc);
        renderer.draw(items);
        ready = true;
        if (ctx.store.preview) preview.start(doc, items);
        updateOverlay();
        status.textContent = `${items.length}개 표시 · 원본 레이아웃 재생기${renderer.warnings().length ? " · " + renderer.warnings().join(" / ") : ""}`;
      })
      .catch((e) => {
        if (!disposed) {
          status.textContent = `준비 실패: ${e.message}`;
          ctx.notify(e.message);
        }
      });
  };
  const resize = new ResizeObserver(() => {
    const w = Math.min(
      viewport.clientWidth - 48,
      ((viewport.clientHeight - 56) * 16) / 9,
    );
    frame.style.width = `${Math.max(100, w)}px`;
    frame.style.height = `${(Math.max(100, w) * 9) / 16}px`;
  });
  resize.observe(viewport);
  const off = ctx.store.subscribe(refresh);
  refresh();
  frame.ondragover = (e) => {
    e.preventDefault();
  };
  frame.ondrop = (e) => {
    e.preventDefault();
    const id = e.dataTransfer?.getData("application/mpj-part"),
      part = services.catalog.entries.find((x) => x.id === id);
    if (!part || part.readonly) return;
    const n = partEntity(part),
      p = point(e.clientX, e.clientY);
    n.transform.x = Math.round(p.x / 10) * 10;
    n.transform.y = Math.round(p.y / 10) * 10;
    ctx.store.execute("드롭", (d) => d.entities.push(n));
    ctx.store.select(n.id);
  };
  const loop = (now: number) => {
    if (disposed) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (ready && !dragging) {
      if (ctx.store.preview) {
        acc += dt;
        while (acc >= 1 / 60) {
          preview.tick();
          acc -= 1 / 60;
        }
      } else acc = 0;
      renderer.draw(items);
      if (ctx.store.preview) updateOverlay();
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    disposed = true;
    off();
    cancelAnimationFrame(raf);
    preview.dispose();
    resize.disconnect();
    void queue.finally(() => renderer.dispose());
  };
}
