import * as THREE from "three";
import { Render2D } from "@app/scene/menu/charselect/render2d";
import { LayoutInst } from "@app/scene/menu/charselect/scene2d";
import { splitVc } from "@app/common/ui/view";
import type { LayoutSpec, Spec, Rgba } from "@app/scene/menu/charselect/types";
import type { MgmSpec } from "@app/common/ui/types";
import type { EditorDocument } from "../../editor/document";
import {
  props,
  type RenderItem,
  type Renderer,
} from "../../plugins/uibuilder/schema";
import { readField } from "../../plugins/uibuilder/data";
import type { MpjLibrary } from "./library";
import { layoutBounds } from "./bounds";
import { windowFramesFirst } from "./windowOrder";
interface RawSpec extends Spec {
  split?: Record<string, unknown[]>;
  zabuton?: Record<string, unknown[]>;
}
export class MpjRenderer implements Renderer {
  private gl: THREE.WebGLRenderer;
  private r2d: Render2D;
  private sources = new Map<string, RawSpec>();
  private instances = new Map<string, LayoutInst>();
  private messages = new Set<string>();
  private all = {
    version: 1,
    screen: [1920, 1080],
    textures: {},
    srgb: [],
    layouts: {},
    fonts: {},
    texts: {},
    chars: [],
    sounds: {},
    split: {},
    zabuton: {},
    lineSpace: {},
  } as unknown as Spec;
  constructor(
    canvas: HTMLCanvasElement,
    private library: MpjLibrary,
  ) {
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.gl.setPixelRatio(1);
    this.gl.setSize(1920, 1080, false);
    this.gl.autoClear = false;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.r2d = new Render2D(this.all);
  }
  private async source(name: string) {
    if (this.sources.has(name)) return this.sources.get(name)!;
    const r = await fetch(`/api/library/${name}`);
    if (!r.ok) throw Error(`명세 없음 ${name}`);
    const raw = (await r.json()) as RawSpec;
    this.sources.set(name, raw);
    return raw;
  }
  private async install(
    source: string,
    name: string,
    seen = new Set<string>(),
  ): Promise<string> {
    const key = `${source}/${name}`;
    if (this.all.layouts[key]) return key;
    if (seen.has(key)) throw Error(`부품 참조 순환 ${key}`);
    seen.add(key);
    const raw = await this.source(source);
    let ls = raw.layouts[name];
    if (!ls) {
      const common = await this.source("common");
      ls = common.layouts[name];
      if (ls) return this.install("common", name, seen);
      throw Error(`변환 명세에 없는 참조 ${key}`);
    }
    if (!ls.nodes) throw Error(`트리형 자료는 지원하지 않습니다: ${key}`);
    const copied = structuredClone(ls) as LayoutSpec;
    const dir =
      this.library.catalog.entries
        .find((p) => p.source === source)
        ?.file.replace(/[^/]+$/, "") ?? "mgmcommon/";
    for (const n of copied.nodes)
      if (n.part) n.part = await this.install(source, n.part, new Set(seen));
    for (const mat of copied.mats)
      for (const t of mat.tex) {
        const original = t.name;
        t.name = `${source}:${original}`;
        if (raw.textures[original])
          this.all.textures[t.name] = new URL(
            `/assets/${dir}${raw.textures[original]}`,
            location.origin,
          ).pathname;
      }
    const srgb = this.all.srgb!;
    for (const t of raw.srgb ?? [])
      if (!srgb.includes(`${source}:${t}`)) srgb.push(`${source}:${t}`);
    for (const [name, font] of Object.entries(raw.fonts ?? {}))
      this.all.fonts[name] = {
        ...font,
        dir: "/assets/font/",
      } as unknown as Spec["fonts"][string];
    this.all.layouts[key] = copied;
    const split = (this.all as unknown as MgmSpec).split;
    split[key] = (raw.split?.[name] ?? []) as MgmSpec["split"][string];
    return key;
  }
  async prepare(doc: EditorDocument) {
    this.instances.clear();
    this.messages.clear();
    for (const n of doc.entities) {
      if (n.type !== "ui.part") continue;
      const part = this.library.entry(String(n.props.part));
      await this.install(part.source, part.layout);
    }
    const imageKeys = new Set<string>();
    for (const entity of doc.entities) for(const b of props(entity).bindings ?? []) if(b.kind === "image") {
      const rows = b.field && props(entity).dataset ? ((doc.settings.datasets as Record<string,Record<string,unknown>[]>)[props(entity).dataset!] ?? []) : [{}];
      for(const row of rows) imageKeys.add(String(b.field ? readField(row,b.field) : b.value));
    }
    for(const [source,raw] of this.sources) for(const key of imageKeys) if(raw.textures[key]) {
      const dir=this.library.catalog.entries.find(p=>p.source===source)?.file.replace(/[^/]+$/,"") ?? "mgmcommon/";
      this.all.textures[`${source}:${key}`]=new URL(`/assets/${dir}${raw.textures[key]}`,location.origin).pathname;
    }
    // Sources expose full font families; chars only controls eager preloading.
    const chars =
      JSON.stringify(doc.settings.datasets) +
      doc.entities.map((n) => JSON.stringify(n.props.bindings ?? [])).join("");
    for (const f of Object.values(this.all.fonts)) Object.assign(f, { chars });
    this.r2d.dispose();
    this.r2d = new Render2D(this.all);
    await this.r2d.load((p) => p);
  }
  private instance(item: RenderItem) {
    let inst = this.instances.get(item.id);
    if (inst) return inst;
    const part = this.library.entry(String(props(item.entity).part));
    const key = `${part.source}/${part.layout}`;
    inst = new LayoutInst(key, this.all.layouts[key], this.all);
    windowFramesFirst(inst);
    this.instances.set(item.id, inst);
    const tag =
      props(item.entity).animation ??
      (inst.hasAnim("normal") ? "normal" : "normal_00");
    if (inst.hasAnim(tag)) inst.play(tag);
    this.bind(item, inst);
    return inst;
  }
  private bind(item: RenderItem, inst: LayoutInst) {
    for (const b of props(item.entity).bindings ?? []) {
      const value = b.field ? readField(item.data, b.field) : b.value;
      const f = inst.find(b.pane);
      if (!f) {
        this.messages.add(`없는 pane: ${item.entity.name}/${b.pane}`);
        continue;
      }
      if (b.kind === "text") inst.setText(b.pane, String(value ?? ""));
      if (b.kind === "visible")
        inst.setVisible(
          b.pane,
          value !== false && value !== "false" && value !== 0,
        );
      if (b.kind === "image") {
        const entry = this.library.entry(String(item.entity.props.part));
        const tex = this.all.textures[`${entry.source}:${value}`] ? `${entry.source}:${value}` : [...this.sources.keys()].map(s=>`${s}:${value}`).find(t=>this.all.textures[t]) ?? `${entry.source}:${value}`;
        if (this.all.textures[tex]) {
          inst.setTexture(b.pane, b.slot ?? 0, tex);
          if(b.pane.endsWith("/x_face_pc256") && b.pane.includes("x_parts_btn_")) {
            f[0].nodes[f[1]].z=[256/1.9,256/1.9];f[0].nodes[f[1]].uv=[0,0,1,0,0,1,1,1];
          }
        }
        else this.messages.add(`미등록 원본 텍스처: ${value}`);
      }
      if (b.kind === "color" && /^#[a-f0-9]{6}$/i.test(String(value))) {
        const c = String(value).slice(1);
        inst.setMatWhite(b.pane, [
          parseInt(c.slice(0, 2), 16),
          parseInt(c.slice(2, 4), 16),
          parseInt(c.slice(4, 6), 16),
          255,
        ] as Rgba);
      }
      if (
        Object.values(inst.spec.anims).some((a) =>
          a.tracks.some((t) => t.node === f[1]),
        )
      )
        this.messages.add(
          `애니와 덧씌우기 충돌 후보: ${item.entity.name}/${b.pane}`,
        );
    }
  }
  draw(items: RenderItem[]) {
    this.gl.setRenderTarget(null);
    this.gl.setClearColor(0x24364a);
    this.gl.clear();
    this.r2d.begin();
    for (const item of items) {
      if (item.entity.type !== "ui.part") continue;
      const inst = this.instance(item);
      if (props(item.entity).animationMode === "persistent")
        this.bind(item, inst);
      splitVc(this.all as unknown as MgmSpec, inst);
      const r = (item.rotation * Math.PI) / 180,
        s = item.scale;
      this.r2d.draw(inst, [
        Math.cos(r) * s,
        -Math.sin(r) * s,
        item.x,
        Math.sin(r) * s,
        Math.cos(r) * s,
        item.y,
      ]);
    }
    this.r2d.render(this.gl);
  }
  tick() {
    for (const inst of this.instances.values()) inst.update(1);
  }
  play(id: string, tag: string, next?: string) {
    const inst = this.instances.get(id);
    if (inst?.hasAnim(tag)) inst.play(tag, next);
    else if (next && inst?.hasAnim(next)) inst.play(next);
  }
  animation(id: string, tag: string) {
    const a = this.instances.get(id)?.spec.anims[tag];
    return a ? { frames: a.len, loop: a.loop } : null;
  }
  reset() {
    this.instances.clear();
  }
  warnings() {
    return [...this.messages];
  }
  bounds(item: RenderItem) {
    return item.entity.type === "ui.part"
      ? layoutBounds(this.instance(item))
      : null;
  }
  dispose() {
    this.instances.clear();
    this.r2d.dispose();
    this.gl.dispose();
    this.gl.forceContextLoss();
  }
}
