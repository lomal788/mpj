/**
 * 명세 읽기·합치기와 2D 그리기 묶음 — 공용 명세(spec.json) + 모드 lyt 명세(mgmet.json·mgm01.json)를 합친다(원본 (자기 lyt, mgm00 lyt) 묶음, mgm_common.md 3.2·9.6).
 * 그리기는 charselect render2d 그대로. 나눈 창 정점색·흐림 창(BexZabutonBlurred) 처리는 modeselect 화면과 같은 규칙(modeselect.md 6.1·6.2) —
 * 9.1 import 경계상 modeselect 를 가져올 수 없어 여기에 같은 규칙을 둔다.
 * 글꼴: 명세 fonts = 공용 글꼴 참조 {dir, chars}, 같은 글꼴이면 chars 를 합친다(docs/engine/font_assets.md §5.3).
 */
import * as THREE from 'three';
import { MenuSurface } from '@app/common/render/menu';
import { nodeMatrix, Render2D } from '@app/common/ui/layout/render';
import { LayoutInst } from '@game/lib/layout';
import type { LayoutDocument as Spec } from '@game/lib/layout';
import { IDENTITY, mul, type Mat3 } from './itemLayout';
import type { MgmAssetAdapter, MgmSpec, MgmSpecPart } from './types';

/** 모드 명세를 공용 명세에 합친다. 같은 이름은 모드 쪽이 이긴다 [설계] */
export function mergeSpec(base: MgmSpec, part: MgmSpecPart): MgmSpec {
  return {
    ...base,
    textures: { ...base.textures, ...part.textures },
    srgb: [...new Set([...(base.srgb ?? []), ...(part.srgb ?? [])])],
    layouts: { ...base.layouts, ...part.layouts },
    split: { ...base.split, ...part.split },
    zabuton: { ...base.zabuton, ...part.zabuton },
    lineSpace: { ...base.lineSpace, ...part.lineSpace },
    fonts: mergeFonts(base.fonts, part.fonts),
  };
}

function mergeFonts(base: MgmSpec['fonts'], part: MgmSpecPart['fonts']): MgmSpec['fonts'] {
  const out = { ...base };
  for (const [k, f] of Object.entries(part ?? {})) {
    const a = out[k] as (typeof f & { dir?: string; chars?: string }) | undefined;
    const b = f as typeof f & { dir?: string; chars?: string };
    out[k] = a && a.dir === b.dir ? ({ ...b, chars: [...new Set((a.chars ?? '') + (b.chars ?? ''))].join('') } as typeof f) : f;
  }
  return out;
}

export async function loadMgmSpec(url: (p: string) => string, parts: readonly string[] = []): Promise<MgmSpec> {
  const get = async <T>(p: string): Promise<T> => {
    const r = await fetch(url(p));
    if (!r.ok) throw new Error(`mgmcommon: ${p} 를 읽지 못했다 (${r.status})`);
    return (await r.json()) as T;
  };
  let spec = await get<MgmSpec>('spec.json');
  for (const p of parts) spec = mergeSpec(spec, await get<MgmSpecPart>(p));
  return spec;
}

/** 나눈 창(modeselect.md 6.1): 창 노드 정점색 → 조각 꼭짓점 쌍선형. 부품까지 */
export function splitVc(spec: MgmSpec, inst: LayoutInst): void {
  for (const sw of spec.split[inst.name] ?? []) {
    const pi = inst.byName.get(sw.n);
    if (pi === undefined) continue;
    const pv = inst.nodes[pi].vc;
    const at = (x: number, y: number): [number, number, number, number] => {
      const u = Math.max(0, Math.min(1, (x + sw.w / 2) / sw.w));
      const v = Math.max(0, Math.min(1, (sw.h / 2 - y) / sw.h));
      const c = [0, 1, 2, 3].map((k) => {
        const top = pv[0][k] + (pv[1][k] - pv[0][k]) * u;
        const bot = pv[2][k] + (pv[3][k] - pv[2][k]) * u;
        return Math.round(top + (bot - top) * v);
      });
      return [c[0], c[1], c[2], c[3]];
    };
    for (const ci of inst.nodes[pi].children) {
      const c = inst.nodes[ci];
      if (!c.spec.n.startsWith(`${sw.n}#`)) continue;
      if (!sw.all && !c.spec.n.endsWith('#C')) continue;
      const [cx, cy] = c.t;
      const [hw, hh] = [c.z[0] / 2, c.z[1] / 2];
      c.vc = [at(cx - hw, cy + hh), at(cx + hw, cy + hh), at(cx - hw, cy - hh), at(cx + hw, cy - hh)];
    }
  }
  for (const p of inst.parts.values()) splitVc(spec, p);
}

export interface MgmViewOptions {
  canvas: HTMLCanvasElement;
  assets: MgmAssetAdapter;
  /** 합칠 모드 명세 파일('mgmet.json'·'mgm01.json') */
  parts?: string[];
  /** 뒤 3D 장면 대역 그림(없으면 흐림 창은 원래 텍스처) */
  backdrop?: CanvasImageSource & { width: number; height: number };
}

export class MgmView {
  readonly all: Spec;
  private readonly zabPrepared = new WeakSet<LayoutInst>();
  private backLayer: LayoutInst | null = null;

  private constructor(
    readonly spec: MgmSpec,
    readonly surface: MenuSurface,
    readonly r2d: Render2D,
    readonly url: (p: string) => string,
  ) {
    this.all = spec as unknown as Spec;
  }

  static async create(opts: MgmViewOptions): Promise<MgmView> {
    const url = (p: string): string => opts.assets.url(p);
    const spec = await loadMgmSpec(url, opts.parts ?? []);
    const r2d = new Render2D(spec as unknown as Spec);
    let surface: MenuSurface | null = null;
    try {
      await r2d.load(url);
      surface = await MenuSurface.create(opts.canvas, spec.screen[0], spec.screen[1]);
      const v = new MgmView(spec, surface, r2d, url);
      if (opts.backdrop) v.setBackdrop(opts.backdrop);
      return v;
    } catch (error) { r2d.dispose(); surface?.dispose(); throw error; }
  }

  get gl(): THREE.WebGLRenderer { return this.surface.gl; }

  text(label: string): string {
    return this.spec.texts[label] ?? '';
  }

  layout(name: string): LayoutInst {
    const ls = this.spec.layouts[name];
    if (!ls) throw new Error(`mgmcommon: 레이아웃 없음 ${name}`);
    return new LayoutInst(name, ls, this.all);
  }

  /** 흐림 창 뒤 그림: 화면 전체(선명) + 흐린 사본(반경 화면 높이 2% [근사], modeselect.md 6.2 와 같음) */
  setBackdrop(bd: CanvasImageSource & { width: number; height: number }): void {
    const [W, H] = this.spec.screen;
    const mk = (blur: number): THREE.Texture => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      if (blur > 0) g.filter = `blur(${blur}px)`;
      g.drawImage(bd, -2 * blur, -2 * blur, W + 4 * blur, H + 4 * blur);
      const t = new THREE.CanvasTexture(c);
      t.flipY = false;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.userData.srgb = true;
      return t;
    };
    this.r2d.dynamic.set('zabuton:sharp', mk(0));
    this.r2d.dynamic.set('zabuton:blur', mk(Math.round(H * 0.02)));
    this.backLayer = new LayoutInst(
      'backdrop',
      {
        size: [W, H],
        nodes: [
          { n: 'root', p: -1, k: 'null', v: true, ia: true, o: [0, 0], po: [0, 0], t: [0, 0], r: 0, s: [1, 1], z: [W, H], a: 255 },
          { n: 'scene', p: 0, k: 'pic', v: true, ia: false, o: [0, 0], po: [0, 0], t: [0, 0], r: 0, s: [1, 1], z: [W, H], a: 255, m: 0, uv: [0, 0, 1, 0, 0, 1, 1, 1] },
        ],
        mats: [{ name: 'scene', black: [0, 0, 0, 0], white: [255, 255, 255, 255], tex: [{ name: 'zabuton:sharp', wu: 'clamp', wv: 'clamp' }], srt: [{ t: [0, 0], r: 0, s: [1, 1] }] }],
        anims: {},
      },
      this.all,
    );
  }

  /** 흐림 창 조각: 흐림 칸은 화면 공간(투영), 칸 0 은 재질 SRT 로 원래 UV(modeselect 화면 updateZabuton 과 같은 식) */
  private zabuton(inst: LayoutInst, base: Mat3): void {
    if (!this.backLayer) return;
    const list = this.spec.zabuton[inst.name];
    if (!list) return;
    for (const z of list) {
      const pi = inst.byName.get(z.pane);
      if (pi === undefined) continue;
      if (!this.zabPrepared.has(inst)) for (const ci of inst.nodes[pi].children) for (const slot of z.slots) inst.setTexture(inst.nodes[ci].spec.n, slot, 'zabuton:blur');
      for (const ci of inst.nodes[pi].children) {
        const c = inst.nodes[ci];
        const m0 = nodeMatrix(inst, c.spec.n) as Mat3 | null;
        if (!m0) continue;
        const m = mul(base, m0);
        const hw = c.z[0] / 2;
        const hh = c.z[1] / 2;
        const sc = [
          [-hw, hh],
          [hw, hh],
          [-hw, -hh],
          [hw, -hh],
        ].map(([lx, ly]) => [(m[0] * lx + m[1] * ly + m[2] + 960) / 1920, (540 - (m[3] * lx + m[4] * ly + m[5])) / 1080]);
        const o = c.spec.uv ?? [0, 0, 1, 0, 0, 1, 1, 1];
        c.uv = sc.flat();
        const mi = c.spec.m;
        if (mi === undefined || mi < 0) continue;
        const au = (o[2] - o[0]) / (sc[1][0] - sc[0][0]);
        const av = (o[5] - o[1]) / (sc[2][1] - sc[0][1]);
        const bu = o[0] - au * sc[0][0];
        const bv = o[1] - av * sc[0][1];
        inst.mats[mi].srt[0] = { t: [bu - 0.5 + 0.5 * au, bv - 0.5 + 0.5 * av], r: 0, s: [au, av] };
      }
    }
    this.zabPrepared.add(inst);
  }

  begin(): void {
    if (!this.surface.active) return;
    this.gl.setRenderTarget(null);
    this.gl.setClearColor(0x000000, 1);
    this.gl.clear();
    this.r2d.begin();
    if (this.backLayer) this.r2d.draw(this.backLayer);
  }

  draw(inst: LayoutInst, base: Mat3 = IDENTITY, alpha = 255): void {
    if (!this.surface.active || !inst.visible) return;
    splitVc(this.spec, inst);
    this.zabuton(inst, base);
    this.r2d.draw(inst, base, alpha);
  }

  end(): void {
    this.surface.frame(() => this.r2d.render(this.gl));
  }

  dispose(): void {
    this.r2d.dispose();
    this.surface.dispose();
  }
}
