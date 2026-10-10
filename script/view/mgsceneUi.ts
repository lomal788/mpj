/**
 * 미니게임 공용 틀 2D 그리기 — 로직(app/minigame/frame/scene)의 UiLayer 상태를 원본 레이아웃(assets/mgscene/ui.json)으로 그린다.
 * 재생기 = view/lyt.ts(mg1801 과 같음: 텔롭 OTF 글꼴·부품·마스크). 게임 3D 다음에 공유 renderer의 UI RT로 겹친다(docs/shell/minigame_scene.md §12.2).
 * 상태 → 인스턴스: 애니 태그가 바뀌면 play, 매 그리기 setFrame(로직 프레임), 그 뒤 글자·페인 표시·재질 ty(타이머 숫자)·얼굴 텍스처를 덮어쓴다.
 * 얼굴 = 부품 sys_face_00 의 x_face_pc64 재질 둘째 칸(sys_face_dummy*)을 face_128_pcNN^u 로(UiControlStatusFace 규칙, mg1801 과 같음).
 */
import type * as THREE from 'three';
import { resolveSpecFonts } from '@app/common/ui/layout/fontSheet';
import type { UiLayer } from '@app/minigame/frame/scene';
import { type UiImage } from '@app/common/render3d/assetLoader';
import type { Assets } from './assets';
import { LayoutInstance, LytRenderer, type Lan, type Lyt, type LytFontAtlas, type LytTelopFont } from './lyt';

export interface MgSceneUiJson {
  layouts: Record<string, Lyt>;
  anims: Record<string, Record<string, Lan>>;
  textures: Record<string, string>;
  fonts: Record<string, LytFontAtlas>;
  telopFont: LytTelopFont;
  texts: Record<string, string>;
}

interface Bound {
  inst: LayoutInstance;
  layout: string;
  tag: string | null;
  partTag: string | null;
}

export class MgSceneUi {
  private readonly bound = new Map<string, Bound>();

  private constructor(
    readonly data: MgSceneUiJson,
    private readonly r: LytRenderer,
  ) {}

  static async load(assets: Assets): Promise<MgSceneUi> {
    const d = await assets.json<MgSceneUiJson>('ui.json');
    const images = new Map<string, UiImage>();
    await Promise.all(Object.entries(d.textures).map(async ([name, file]) => images.set(name, await assets.image(file))));
    await resolveSpecFonts(d.fonts as Record<string, unknown>, (p) => assets.url(p));
    const fonts = new Map<string, { meta: LytFontAtlas }>();
    for (const [fam, meta] of Object.entries(d.fonts)) fonts.set(fam, { meta });
    let telop: LytTelopFont | null = null;
    try {
      const face = new FontFace(d.telopFont.family, await assets.bytes(d.telopFont.file));
      await face.load();
      document.fonts.add(face);
      telop = d.telopFont;
    } catch (e) {
      console.warn('mgscene: 텔롭 글꼴을 읽지 못했다', e);
    }
    return new MgSceneUi(d, new LytRenderer({ images, fonts, telop }));
  }

  dispose(): void { this.r.dispose(); this.bound.clear(); }

  private instance(layer: UiLayer): Bound {
    let b = this.bound.get(layer.id);
    if (!b || b.layout !== layer.layout) {
      const d = this.data;
      const inst = new LayoutInstance(d.layouts[layer.layout], d.anims[layer.layout] ?? {}, (file) =>
        d.layouts[file] ? { lyt: d.layouts[file], anims: d.anims[file] ?? {} } : null,
      );
      b = { inst, layout: layer.layout, tag: null, partTag: null };
      this.bound.set(layer.id, b);
    }
    return b;
  }

  private static split(path: string, inst: LayoutInstance): [LayoutInstance | null, string] {
    const i = path.lastIndexOf('/');
    if (i < 0) return [inst, path];
    return [inst.part(path.slice(0, i)), path.slice(i + 1)];
  }

  private apply(layer: UiLayer): LayoutInstance {
    const b = this.instance(layer);
    const inst = b.inst;
    inst.visible = layer.visible;
    inst.pos = { x: layer.pos.x, y: layer.pos.y };
    inst.order = layer.order;
    if (layer.anim) {
      if (layer.animTarget) {
        const part = inst.part(layer.animTarget);
        if (part) {
          if (b.partTag !== layer.anim) {
            part.play(layer.anim);
            b.partTag = layer.anim;
          }
          part.setFrame(layer.frame);
        }
      } else {
        if (b.tag !== layer.anim) {
          inst.play(layer.anim);
          b.tag = layer.anim;
        }
        inst.setFrame(layer.frame);
      }
    }
    for (const [p, s] of layer.texts) {
      const [li, pane] = MgSceneUi.split(p, inst);
      li?.texts.set(pane, s);
    }
    for (const [p, v] of layer.paneVisible) {
      const [li, pane] = MgSceneUi.split(p, inst);
      li?.setPaneVisible(pane, v);
    }
    for (const [mat, ty] of layer.matTy) {
      const m = inst.mats.get(mat);
      if (m?.srt[0]) m.srt[0].t[1] = ty;
    }
    for (const [path, chara] of layer.faces) {
      const face = inst.part(path);
      if (!face) continue;
      for (const m of face.mats.values()) {
        const k = m.tex.findIndex((t) => t.startsWith('sys_face_dummy') || t.startsWith('face_128_'));
        if (k >= 0) m.tex[k] = `face_128_${chara}^u`;
      }
    }
    return inst;
  }

  /** 레이어 목록(로직 MgScene.layers() — order 오름차순)을 HUD 에 그린다 */
  draw(ctx: CanvasRenderingContext2D, layers: readonly UiLayer[], gl: THREE.WebGLRenderer): void {
    this.r.begin();
    for (const l of layers) this.r.draw(this.apply(l));
    this.r.end(ctx, gl);
  }
}
