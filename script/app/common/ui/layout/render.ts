import * as THREE from 'three';
import { HudComposite } from '@app/common/render/hud';
import { LayoutRenderer, type LayoutRenderProviders } from '@game/lib/layout-three';
import { type LayoutDocument, nodeMatrix, rectOf, tr } from '@game/lib/layout';
import { assetHooks } from '@app/common/render3d/assetHooks';
import { textureFromImage, type UiImage } from '@app/common/render3d/assetLoader';
import { resolveSpecFonts, sheetTexture } from './fontSheet';
import { type LayoutInstance, type LytFontAtlas, type LytTelopFont } from './raw';

export { nodeMatrix, rectOf };

class TextRaster {
  private readonly sysText = new Map<string, { tex: THREE.Texture; w: number; h: number }>();
  private readonly telopCache = new Map<string, { tex: THREE.Texture; w: number; h: number; asc: number }>();
  systemText(str: string, px: number): { tex: THREE.Texture; w: number; h: number } | null {
    const key = `${str}|${px}`;
    let e = this.sysText.get(key);
    if (!e) {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      const font = `${px}px sans-serif`;
      ctx.font = font;
      const w = Math.ceil(ctx.measureText(str).width) + 2;
      const h = Math.ceil(px * 1.25);
      c.width = Math.max(1, w);
      c.height = Math.max(1, h);
      ctx.font = font;
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(str, 1, h / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.flipY = false;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      e = { tex, w: c.width, h: c.height };
      this.sysText.set(key, e);
    }
    return e;
  }
  /** OTF 글자를 캔버스에 래스터라이즈한다(문자열·배율마다 한 번) */
  telopImage(str: string, tf: LytTelopFont, ratio: number, px: number): { tex: THREE.Texture; w: number; h: number; asc: number } | null {
    const key = `${str}|${ratio}|${px}`;
    let e = this.telopCache.get(key);
    if (e) return e;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const font = `${px}px "${tf.family}"`;
    ctx.font = font;
    const w = ctx.measureText(str).width * ratio;
    const h = (px * (tf.ascent - tf.descent)) / tf.unitsPerEm;
    const asc = (px * tf.ascent) / tf.unitsPerEm;
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    ctx.font = font;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    ctx.setTransform(ratio, 0, 0, 1, 0, 0);
    ctx.fillText(str, 0, asc);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    e = { tex, w: c.width, h: c.height, asc };
    this.telopCache.set(key, e);
    return e;
  }

  dispose(): void { for (const e of this.sysText.values()) e.tex.dispose(); for (const e of this.telopCache.values()) e.tex.dispose(); }
}

export class Render2D extends LayoutRenderer {
  private readonly textRaster: TextRaster;
  constructor(spec: LayoutDocument) {
    const text = new TextRaster();
    super(spec, {
      loadUiImage: url => assetHooks.loadUiImage(url),
      textureFromImage: image => assetHooks.textureFromImage(image),
      resolveFonts: (fonts, url) => resolveSpecFonts(fonts, url),
      sheetTexture,
      rasterText: (font, str, size) => spec.fonts[font] ? null : text.systemText(str, size[1]),
    });
    this.textRaster = text;
  }
  override dispose(): void { super.dispose(); this.textRaster.dispose(); }
}

export interface LytResources {
  /** 텍스처 이름 → 그림 */
  images: Map<string, UiImage | HTMLCanvasElement | ImageBitmap>;
  /** fcpx 패밀리 → 공용 글꼴 메트릭(resolveSpecFonts 로 채운 것) */
  fonts: Map<string, { meta: LytFontAtlas }>;
  telop: LytTelopFont | null;
}

export function createHudBackend(res: LytResources): LayoutRenderer {
  const text = new TextRaster();
  const spec: LayoutDocument = { screen: [1920, 1080], textures: {}, layouts: {}, fonts: Object.fromEntries([...res.fonts].map(([name, f]) => [name, f.meta])) };
  const providers: LayoutRenderProviders = {
    loadUiImage: async () => { throw new Error('HUD images must be supplied by the host'); },
    textureFromImage: image => textureFromImage(image as UiImage),
    resolveFonts: async () => undefined,
    sheetTexture,
    rasterText: (font, str, fs) => {
      if (font !== 'bqfont_telop' || !res.telop) return null;
      const tf = res.telop, sx = fs[0] / tf.baseSize, sy = fs[1] / ((tf.baseSize * (tf.ascent - tf.descent)) / tf.unitsPerEm);
      return text.telopImage(str, tf, sx / sy, fs[1]);
    },
  };
  class HudBackend extends LayoutRenderer {
    override dispose(): void { super.dispose(); text.dispose(); }
  }
  const backend = new HudBackend(spec, providers, 'hudPremultiplied'); backend.setImages(res.images); return backend;
}

/** 레이아웃 그리기(공유 WebGL의 UI 전용 RT → 화면, Canvas2D HUD 호출 순서 유지) */
export class LytRenderer {
  private readonly backend: LayoutRenderer;
  /** WebGL 문맥은 호출자가 빌려주며 UI 타깃만 소유한다 */
  private readonly composite = new HudComposite();
  constructor(readonly res: LytResources) { this.backend = createHudBackend(res); }
  /** 프레임 시작: 지난 프레임 사각형을 모두 숨긴다 */
  begin(): void { this.backend.begin(); }
  draw(inst: LayoutInstance): void {
    inst.syncTexts(); this.backend.setImages(this.res.images);
    this.backend.draw(inst.core, tr(inst.pos.x, inst.pos.y));
  }
  /** ctx 의 앞선 내용을 먼저 합성한 뒤 레이아웃을 겹친다 */
  end(ctx: CanvasRenderingContext2D, gl: THREE.WebGLRenderer): void {
    if (this.backend.drawCount === 0) return;
    this.composite.render(gl, ctx, () => this.backend.render(gl));
  }
  dispose(): void { this.backend.dispose(); this.composite.dispose(); }
}
