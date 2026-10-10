import { ScreenRuntime, type ScreenEvent } from "../../engine/screen/core";
import { dispatchActions, type AppServices } from "./actions";
import { props, type RenderItem, type Renderer } from "./schema";
import type { EditorDocument } from "../../editor/document";
import { itemLabel } from "./itemLabel";

export type PreviewPhase =
  "stopped" | "entering" | "selecting" | "deciding" | "exiting" | "finished";
export interface PreviewResult {
  type: "decide" | "cancel";
  pid: number;
  name: string;
  data: Record<string, unknown>;
}

/** A screen session owns its animations, frame gates, input and injected application hooks. */
export class PreviewController {
  runtime: ScreenRuntime | null = null;
  phase: PreviewPhase = "stopped";
  result: PreviewResult | null = null;
  private input: PreviewInput | null = null;
  private items: RenderItem[] = [];
  private focused = new Map<number, string>();
  private pending: { event: ScreenEvent; frames: number }[] = [];
  private wait = 0;
  private multi = false;
  private exitOnDecide = true;
  private config = { players: 1, repeatDelay: 24, repeatInterval: 6 };
  constructor(
    private renderer: Renderer,
    private services: AppServices,
    private createInput: () => PreviewInput,
    private changed: () => void = () => {},
  ) {}
  private phaseTo(phase: PreviewPhase) {
    this.phase = phase;
    this.changed();
  }
  private play(item: RenderItem, tags: string[], nextTags: string[] = []) {
    const exists = (tag: string) =>
      !this.renderer.animation || !!this.renderer.animation(item.id, tag);
    const tag = tags.find(exists),
      next = nextTags.find(exists);
    if (tag === undefined) return 0;
    this.renderer.play(item.id, tag, next);
    const a = this.renderer.animation?.(item.id, tag);
    return a && !a.loop ? a.frames : 0;
  }
  start(doc: EditorDocument, items: RenderItem[]) {
    this.stop();
    this.items = items;
    this.result = null;
    const p = (doc.settings.input as Record<string, unknown>) ?? {};
    this.multi = p.multi === true;
    this.exitOnDecide =
      (doc.settings.preview as Record<string, unknown>)?.exitOnDecide !== false;
    this.config = {
      players: Math.min(4, Math.max(1, Number(p.players) || 1)),
      repeatDelay: Math.max(1, Number(p.repeatDelay) || 24),
      repeatInterval: Math.max(1, Number(p.repeatInterval) || 6),
    };
    this.renderer.reset?.();
    this.renderer.draw(items);
    this.wait = 0;
    for (const item of items) {
      const value = props(item.entity);
      if (value.interactive)
        this.play(
          item,
          value.disabled || item.data.disabled === true
            ? ["disable", "disable_normal", "normal"]
            : ["normal", "normal_00"],
        );
      else if (!value.animation)
        this.wait = Math.max(
          this.wait,
          this.play(item, ["in", "in_normal", "normal", ""], ["normal"]),
        );
    }
    const interactive = items.filter((x) => props(x.entity).interactive);
    const rows = [...new Set(interactive.map((x) => Math.round(x.y)))].sort(
      (a, b) => b - a,
    );
    let seed = 0x12345678;
    this.runtime = new ScreenRuntime(
      interactive.map((x) => ({
        id: x.id,
        owner: props(x.entity).owner ?? 0,
        row: rows.indexOf(Math.round(x.y)),
        col: Math.round(x.x),
        enabled: !props(x.entity).disabled && x.data.disabled !== true,
        visible: true,
      })),
      {
        wrap: p.wrap !== false,
        repeatWrap: p.repeatWrap === true,
        multi: this.multi,
        columns: 1,
      },
      {
        event: (e) => this.event(e),
        random: () => {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          return (seed >>> 0) / 4294967296;
        },
      },
    );
    this.input = this.createInput();
    this.phaseTo("entering");
    if (!this.wait) this.selecting();
  }
  private selecting() {
    this.phaseTo("selecting");
    this.runtime?.initialize(
      Array.from({ length: this.config.players }, (_, i) => i),
    );
    this.changed();
  }
  private event(e: ScreenEvent) {
    const item = this.items.find((x) => x.id === e.id);
    if (e.type === "focus" && item) {
      const old = this.focused.get(e.pid);
      this.focused.set(e.pid, item.id);
      if (
        old &&
        old !== item.id &&
        ![...this.focused.values()].includes(old) &&
        ![...(this.runtime?.decided.values() ?? [])].includes(old)
      ) {
        const previous = this.items.find((x) => x.id === old)!;
        this.play(
          previous,
          ["off", "off_01", "normal"],
          ["normal", "normal_00"],
        );
      }
      this.play(item, ["on", "cursor", "normal"], ["cursor"]);
      dispatchActions(e, this.items, this.services);
      this.changed();
    } else if (e.type === "decide" && item) {
      const frames = this.play(
        item,
        ["press", "act"],
        this.multi ? ["pressed"] : [],
      );
      this.pending.push({ event: e, frames });
      if (!this.multi) this.phaseTo("deciding");
    } else if (e.type === "cancel") {
      this.result = {
        type: "cancel",
        pid: e.pid,
        name: item ? itemLabel(item) : "화면",
        data: item?.data ?? {},
      };
      dispatchActions(e, this.items, this.services);
      this.exit();
    }
  }
  private exit() {
    this.pending = [];
    this.wait = 0;
    for (const item of this.items)
      this.wait = Math.max(
        this.wait,
        this.play(
          item,
          props(item.entity).interactive
            ? ["off", "off_01", "normal"]
            : ["out"],
        ),
      );
    this.phaseTo("exiting");
    if (!this.wait) this.phaseTo("finished");
  }
  tick() {
    if (!this.runtime || !this.input || this.phase === "finished") return;
    const inputs = this.input.poll(
      this.config.players,
      this.config.repeatDelay,
      this.config.repeatInterval,
    );
    this.renderer.tick();
    if (this.phase === "entering" || this.phase === "exiting") {
      if (--this.wait <= 0)
        this.phase === "entering" ? this.selecting() : this.phaseTo("finished");
      return;
    }
    const completed = this.pending.filter((x) => --x.frames <= 0);
    this.pending = this.pending.filter((x) => x.frames > 0);
    for (const { event } of completed) {
      const item = this.items.find((x) => x.id === event.id)!;
      dispatchActions(event, this.items, this.services);
      this.result = {
        type: "decide",
        pid: event.pid,
        name: itemLabel(item),
        data: item.data,
      };
      this.changed();
    }
    if (
      completed.length &&
      !this.pending.length &&
      (!this.multi || this.runtime.decided.size >= this.config.players)
    ) {
      if (this.exitOnDecide) {
        this.exit();
        return;
      }
      this.phaseTo("selecting");
      for (const { event } of completed)
        this.play(
          this.items.find((x) => x.id === event.id)!,
          ["on", "cursor"],
          ["cursor"],
        );
    }
    if (this.phase !== "selecting") return;
    if (!this.runtime.items.length) {
      const first = inputs.find((x) => x.cancel || x.decide);
      if (first)
        this.event({
          type: first.cancel ? "cancel" : "decide",
          pid: first.pid,
          id:
            this.items.find(
              (x) => x.entity.type === "ui.part" && !x.entity.locked,
            )?.id ?? null,
        });
    } else {
      for (const x of inputs.filter((x) => x.cancel)) this.cancel(x.pid);
      if (this.phase === "selecting")
        this.runtime.tick(
          inputs.filter(
            (x) =>
              !x.cancel && !this.pending.some((p) => p.event.pid === x.pid),
          ),
        );
    }
  }
  focus(id: string, pid = 0) {
    if (this.phase === "selecting") this.runtime?.focus(pid, id);
  }
  click(id: string, pid = 0) {
    if (this.phase === "selecting" && this.runtime?.focus(pid, id))
      this.runtime.decide(pid);
  }
  decide(pid = 0) {
    if (this.phase !== "selecting") return;
    const id = this.runtime?.cursors.get(pid);
    if (id) this.click(id, pid);
    else
      this.event({
        type: "decide",
        pid,
        id:
          this.items.find(
            (x) => !x.entity.locked && x.entity.type === "ui.part",
          )?.id ?? null,
      });
  }
  cancel(pid = 0) {
    if (this.phase !== "selecting") return;
    if (this.multi && this.runtime?.decided.has(pid)) {
      const id = this.runtime.decided.get(pid)!;
      this.runtime.decided.delete(pid);
      this.pending = this.pending.filter((x) => x.event.pid !== pid);
      const item = this.items.find((x) => x.id === id)!;
      this.play(item, ["normal"]);
      this.play(item, ["on", "cursor"], ["cursor"]);
      dispatchActions({ type: "cancel", pid, id }, this.items, this.services);
      this.result = {
        type: "cancel",
        pid,
        name: itemLabel(item),
        data: item.data,
      };
      this.changed();
    } else if (!this.runtime?.items.length)
      this.event({
        type: "cancel",
        pid,
        id:
          this.items.find(
            (x) => !x.entity.locked && x.entity.type === "ui.part",
          )?.id ?? null,
      });
    else this.runtime?.cancel(pid);
  }
  random(pid = 0) {
    if (this.phase === "selecting") this.runtime?.random(pid);
  }
  stop() {
    this.runtime?.dispose();
    this.runtime = null;
    this.input?.dispose();
    this.input = null;
    this.focused.clear();
    this.pending = [];
    this.wait = 0;
    this.phaseTo("stopped");
  }
  dispose() {
    this.stop();
    this.services.dispose?.();
  }
}
export interface PreviewInput {
  nativePoll?(players: number): {hold: number; trig: number}[];
  poll(
    players: number,
    delay: number,
    interval: number,
  ): {
    pid: number;
    dx: number;
    dy: number;
    repeat: boolean;
    decide: boolean;
    cancel: boolean;
  }[];
  dispose(): void;
}
