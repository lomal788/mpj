import { el, button, select } from "../../editor/dom";
import type { EditorDocument } from "../../editor/document";
import type { EditorContext } from "../../editor/extensions";
import { props, type PartEntry, type RenderItem } from "./schema";
import type { BuilderServices } from "./services";
import { PreviewController, type PreviewPhase } from "./preview";
import { presentationItems } from "./presentation";
import { itemLabel } from "./itemLabel";

import { mountNativeSurface } from "./nativeSurface";

const PHASE: Record<PreviewPhase, string> = {
  stopped: "준비",
  entering: "등장 중",
  selecting: "입력 대기",
  deciding: "결정 애니메이션",
  exiting: "퇴장 중",
  finished: "미리보기 종료",
};
/** Parts, templates and complete documents share the same isolated execution surface. */
export function mountPreview(
  host: HTMLElement,
  doc: EditorDocument,
  ctx: EditorContext,
  services: BuilderServices,
  part?: PartEntry,
) {
  if(doc.settings.nativePreview && services.createNativePreview) return mountNativeSurface(host,doc,ctx,services);
  const snapshot = structuredClone(doc),
    dialog = el("div", "preview-surface");
  const heading = el("div", "preview-heading"),
    title = el(
      "h2",
      "",
      `${part ? "레이아웃" : "화면"} 미리보기 · ${doc.title}`,
    );
  const canvas = el("canvas", "preview-canvas"),
    frame = el("div", "preview-frame"),
    hits = el("div", "preview-hits");
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "실행 미리보기 화면");
  frame.append(canvas, hits);
  const status = el("p", "preview-state", "원본 자산 준비 중…"),
    result = el("p", "preview-result");
  const footer = el("div", "preview-controls"),
    debug = el("details", "preview-debug"),
    log = el("pre", "event-log");
  debug.append(el("summary", "", "동작 로그"), log);
  const renderer = services.createRenderer(canvas),
    app = services.createPreviewServices(ctx);
  let items: RenderItem[] = [],
    disposed = false,
    preparing = true,
    ready = false,
    raf = 0,
    last = 0,
    acc = 0,
    pid = 0;
  const boxes = new Map<string, HTMLButtonElement>();
  const logs: string[] = [];
  const event = (kind: string, value: unknown) => {
    logs.unshift(`${kind}: ${JSON.stringify(value)}`);
    logs.length = Math.min(40, logs.length);
    log.textContent = logs.join("\n");
  };
  const controller = new PreviewController(
    renderer,
    {
      sound: (x) => {
        event("sound", x);
        app.sound(x);
      },
      vibrate: (p, x) => {
        event("vibrate", { pid: p, name: x });
        app.vibrate(p, x);
      },
      work: (k, v) => {
        event("work", { key: k, value: v });
        app.work(k, v);
      },
      call: (k, v) => {
        event("call", { id: k, payload: v });
        app.call(k, v);
      },
      return: (v) => {
        event("return", v);
        app.return(v);
      },
      dispose: () => app.dispose?.(),
    },
    () => services.createInput(frame, () => pid),
    () => {
      status.textContent = PHASE[controller.phase];
      const r = controller.result;
      result.textContent = r
        ? `${r.pid + 1}P ${r.type === "decide" ? "결정" : "취소"} · ${r.name}`
        : "";
      updateHits();
    },
  );
  function updateHits() {
    for (const [id, box] of boxes) {
      const focused = [
        ...(controller.runtime?.cursors.values() ?? []),
      ].includes(id);
      box.setAttribute("aria-pressed", String(focused));
      box.disabled = controller.phase !== "selecting";
    }
  }
  function mountHits() {
    hits.replaceChildren();
    boxes.clear();
    for (const item of items.filter(
      (x) =>
        props(x.entity).interactive &&
        !props(x.entity).disabled &&
        x.data.disabled !== true,
    )) {
      const b = el("button", "preview-hit"),
        bounds = renderer.bounds?.(item);
      b.type = "button";
      b.tabIndex = -1;
      b.setAttribute("aria-label", `미리보기 선택 ${itemLabel(item)}`);
      const w = (bounds?.width ?? item.entity.transform.width) * item.scale,
        h = (bounds?.height ?? item.entity.transform.height) * item.scale;
      const x = item.x + (bounds?.x ?? 0) * item.scale,
        y = item.y + (bounds?.y ?? 0) * item.scale;
      b.style.cssText = `left:${(960 + x - w / 2) / 19.2}%;top:${(540 - y - h / 2) / 10.8}%;width:${w / 19.2}%;height:${h / 10.8}%;transform:rotate(${-item.rotation}deg)`;
      b.onpointerenter = () => controller.focus(item.id, pid);
      b.onpointerdown = (e) => {
        e.preventDefault();
        canvas.focus();
      };
      b.onclick = () => controller.click(item.id, pid);
      hits.append(b);
      boxes.set(item.id, b);
    }
    updateHits();
  }
  const close = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    controller.dispose();
    dialog.remove();
    if (!preparing) renderer.dispose();
  };
  heading.append(title);
  footer.append(
    button("랜덤 선택", () => {
      controller.random(pid);
      canvas.focus();
    }),
    button("다시 실행", () => {
      if (ready) {
        controller.start(snapshot, items);
        mountHits();
        canvas.focus();
      }
    }),
    button("결정 (A / Enter)", () => {
      controller.decide(pid);
      canvas.focus();
    }),
    button("취소 (B / Esc)", () => {
      controller.cancel(pid);
      canvas.focus();
    }),
  );
  const players =
    Number((doc.settings.input as Record<string, unknown>)?.players) || 1;
  if (players > 1)
    footer.append(
      select(
        Array.from({ length: players }, (_, i) => ({
          value: String(i),
          label: `키보드 / 마우스 ${i + 1}P`,
        })),
        "0",
        (v) => {
          pid = Number(v);
          canvas.focus();
        },
      ),
    );
  if (part) {
    let tag = part.animations[0]?.tag ?? "";
    const pick = select(
      part.animations.map((a) => ({
        value: a.tag,
        label: `${a.tag || "(무명)"} · ${a.frames}f${a.loop ? " ↻" : ""}`,
      })),
      tag,
      (v) => (tag = v),
    );
    pick.setAttribute("aria-label", "미리보기 애니메이션");
    footer.append(
      pick,
      button("태그 재생", () => {
        if (ready) {
          renderer.play(items[0].id, tag);
          canvas.focus();
        }
      }),
    );
  }
  dialog.append(
    heading,
    frame,
    status,
    result,
    footer,
    el("p", "hint", "방향키 / A·Enter 결정 / B·Esc 취소 · 클릭 또는 패드 입력"),
    debug,
  );
  host.append(dialog);
  canvas.focus();
  void renderer
    .prepare(snapshot)
    .then(() => {
      if (disposed) {
        return;
      }
      items = presentationItems(snapshot, renderer);
      ready = true;
      controller.start(snapshot, items);
      mountHits();
      canvas.focus();
      function loop(now: number) {
        if (disposed) return;
        acc += last ? Math.min((now - last) / 1000, 0.1) : 0;
        last = now;
        while (acc >= 1 / 60) {
          controller.tick();
          acc -= 1 / 60;
        }
        renderer.draw(items);
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);
    })
    .catch((e) => {
      if (!disposed) {
        status.textContent = `준비 실패: ${e.message}`;
        ctx.notify(e.message);
      }
    })
    .finally(() => {
      preparing = false;
      if (disposed) renderer.dispose();
    });
  return close;
}

export function showPreview(doc:EditorDocument,ctx:EditorContext,services:BuilderServices,part?:PartEntry) {
  const dialog=el("dialog","preview-dialog"),heading=el("div","preview-heading");
  let dispose=()=>{};
  const close=()=>{dispose();dialog.close();dialog.remove();};
  heading.append(el("h2","",doc.title),button("닫기",close));dialog.append(heading);document.body.append(dialog);dialog.showModal();
  dispose=mountPreview(dialog,doc,ctx,services,part);
  dialog.addEventListener("cancel",e=>{e.preventDefault();});
  return close;
}
