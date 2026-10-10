/**
 * 명세 레이아웃 2D 렌더러 — three 직교 카메라(1920×1080, 원점 가운데, y 위 +)로 사각형을 그린다.
 * 변환: M(노드) = M(부모)·T(부모 원점점)·T(t)·Rz(r)·S(s) [docs 6, engine 05 §3.3 규칙].
 * 색: 재질 black + (white − black)·텍스처(칸 2개면 곱 [근사]) × 정점색 × 누적 알파. 글자: black→white 를 커버리지로 보간 [추정].
 * 색 공간: 정점색·재질색은 선형 값, sRGB 형식 텍스처(spec.srgb)는 선형으로 풀어 선형 버퍼에서 섞고 마지막에 sRGB 로 내보낸다
 *   [데이터+참고 이미지: 배경 #3490db → 캡처 (129,197,233) = sRGB 부호화 값, 제목 띠 #070203 → (45,21,27)].
 * 창(wnd): flags bit0 이면 프레임 재질 텍스처로 9칸(모서리 뒤집기·변/내용 clamp) [근사], 아니면 내용만.
 * 시스템 폰트(명세에 없는 글꼴, 계정 이름)는 브라우저 산세리프로 그린다 [근사]. 컬러 아이콘 글리프(extension)는 본 글꼴이면 글리프 색 그대로,
 * 그림자 글꼴이면 모양(알파)만 재질 색으로 칠한다 [추정: 캡처의 안내 아이콘 = 흰 윤곽 + 어두운 바탕].
 * 글자 시트 = 공용 원본 FFNT 시트(fontSheet.ts·fontTable.ts, docs/engine/font_assets.md): 글리프마다 자기 시트, 회색조 시트는 R8 → red0 이면 R = 커버리지.
 */
import * as THREE from 'three';
import { anchor, local, mul, tr, xf, rectOf, type Mat3, type LayoutInst, type NodeState, type FontSpec, type Rgba, type LayoutDocument } from '../layout';

export interface LayoutImage { readonly width: number; readonly height: number; }
export interface LayoutRenderProviders {
  loadUiImage(url: string): Promise<LayoutImage>;
  textureFromImage(image: LayoutImage): THREE.Texture;
  resolveFonts(fonts: Record<string, FontSpec>, url: (p: string) => string): Promise<void>;
  sheetTexture(url: string, rgba: boolean): THREE.Texture | null;
  rasterText(font: string, str: string, size: [number, number]): { tex: THREE.Texture; w: number; h: number } | null;
}

const VERT = `
attribute vec4 vcol;
attribute vec2 uv1;
varying vec2 vUv;
varying vec2 vUv1;
varying vec4 vCol;
void main() {
  vUv = uv;
  vUv1 = uv1;
  vCol = vcol;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform sampler2D map0;
uniform sampler2D map1;
uniform int texCount;
uniform int mode;
uniform int srgb0;
uniform int srgb1;
uniform int red0;
uniform mat3 srt0;
uniform mat3 srt1;
uniform sampler2D maskMap;
uniform int maskOn;
uniform mat3 srtMask;
uniform int premultiplied;
uniform vec4 black;
uniform vec4 white;
uniform float alpha;
varying vec2 vUv;
varying vec2 vUv1;
varying vec4 vCol;
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  vec4 t = vec4(1.0);
  if (texCount > 0) {
    t = texture2D(map0, (srt0 * vec3(vUv, 1.0)).xy);
    if (red0 == 1) t = vec4(1.0, 1.0, 1.0, t.r);
    if (srgb0 == 1) t.rgb = toLinear(t.rgb);
    if (texCount > 1) {
      vec4 t1 = texture2D(map1, (srt1 * vec3(vUv1, 1.0)).xy);
      if (srgb1 == 1) t1.rgb = toLinear(t1.rgb);
      t *= t1;
    }
  }
  vec4 c;
  if (mode == 1) c = mix(black, white, t.a);
  else if (mode == 2) c = t;
  else c = premultiplied == 1 ? mix(black, white, t) : black + (white - black) * t;
  c *= vCol;
  if (maskOn == 1) c.a *= texture2D(maskMap, (srtMask * vec3(vUv, 1.0)).xy).a;
  c.a *= alpha;
  gl_FragColor = premultiplied == 1 ? vec4(c.rgb * c.a, c.a) : c;
}`;

interface Quad {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  pos: Float32Array;
  uv: Float32Array;
  uv1: Float32Array;
  col: Float32Array;
}

const FACTOR: THREE.BlendingSrcFactor[] = [
  THREE.ZeroFactor,
  THREE.OneFactor,
  THREE.DstColorFactor,
  THREE.OneMinusDstColorFactor,
  THREE.SrcAlphaFactor,
  THREE.OneMinusSrcAlphaFactor,
  THREE.DstAlphaFactor,
  THREE.OneMinusDstAlphaFactor,
  THREE.SrcColorFactor,
  THREE.OneMinusSrcColorFactor,
];
const EQUATION: THREE.BlendingEquation[] = [THREE.AddEquation, THREE.AddEquation, THREE.SubtractEquation, THREE.ReverseSubtractEquation, THREE.MinEquation, THREE.MaxEquation];

const WRAP: Record<string, THREE.Wrapping> = { clamp: THREE.ClampToEdgeWrapping, repeat: THREE.RepeatWrapping, mirror: THREE.MirroredRepeatWrapping };

export class LayoutRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private readonly quads: Quad[] = [];
  private used = 0;
  private readonly images = new Map<string, LayoutImage>();
  private readonly texCache = new Map<string, THREE.Texture>();
  /** 외부 텍스처(3D 렌더 타깃 등) */
  readonly dynamic = new Map<string, THREE.Texture>();
  private readonly white: THREE.DataTexture;
  private readonly srgb: Set<string>;
  /** 선형 합성 버퍼와 sRGB 내보내기 */
  private readonly linear: THREE.WebGLRenderTarget | null;
  private readonly outScene = new THREE.Scene();

  constructor(private readonly spec: LayoutDocument, private readonly providers: LayoutRenderProviders, readonly profile: 'menuLinear' | 'hudPremultiplied' = 'menuLinear') {
    this.srgb = new Set(spec.srgb ?? []);
    this.linear = profile === 'hudPremultiplied' ? null : new THREE.WebGLRenderTarget(spec.screen[0], spec.screen[1], { type: THREE.HalfFloatType, samples: 4 });
    if (this.linear) {
    const out = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { src: { value: this.linear.texture } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader:
          'uniform sampler2D src; varying vec2 vUv; void main() { vec3 c = clamp(texture2D(src, vUv).rgb, 0.0, 1.0); gl_FragColor = vec4(mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)), 1.0); }',
        depthTest: false,
        depthWrite: false,
      }),
    );
    out.frustumCulled = false;
    this.outScene.add(out);
    }
    this.camera = new THREE.OrthographicCamera(-960, 960, 540, -540, -10, 10);
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.white.needsUpdate = true;
  }

  /** 명세 텍스처·폰트 이미지를 읽는다 */
  async load(url: (p: string) => string): Promise<void> {
    const jobs: Promise<void>[] = [];
    const get = (key: string, path: string): void => {
      jobs.push(
        this.providers.loadUiImage(url(path)).then(
          (img) => void this.images.set(key, img),
          () => console.warn(`charselect: 이미지를 읽지 못했다 ${path}`),
        ),
      );
    };
    for (const [k, p] of Object.entries(this.spec.textures)) get(k, p);
    jobs.push(this.providers.resolveFonts(this.spec.fonts, url));
    await Promise.all(jobs);
  }

  private texture(key: string, wu = 'clamp', wv = 'clamp'): THREE.Texture {
    const d = this.dynamic.get(key);
    if (d) return d;
    const ck = `${key}|${wu}|${wv}`;
    let t = this.texCache.get(ck);
    if (t) return t;
    const img = this.images.get(key);
    if (!img) return this.white;
    t = this.providers.textureFromImage(img);
    t.userData.srgb = this.profile === 'menuLinear' && this.srgb.has(key);
    t.flipY = false;
    t.wrapS = WRAP[wu] ?? THREE.ClampToEdgeWrapping;
    t.wrapT = WRAP[wv] ?? THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.texCache.set(ck, t);
    return t;
  }

  private quad(): Quad {
    let q = this.quads[this.used];
    if (!q) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(12);
      const uv = new Float32Array(8);
      const uv1 = new Float32Array(8);
      const col = new Float32Array(16);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
      g.setAttribute('vcol', new THREE.BufferAttribute(col, 4));
      g.setIndex([0, 2, 1, 1, 2, 3]);
      const m = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          map0: { value: this.white },
          map1: { value: this.white },
          texCount: { value: 0 },
          mode: { value: 0 },
          srgb0: { value: 0 },
          srgb1: { value: 0 },
          red0: { value: 0 },
          srt0: { value: new THREE.Matrix3() },
          srt1: { value: new THREE.Matrix3() },
          maskMap: { value: this.white },
          maskOn: { value: 0 },
          srtMask: { value: new THREE.Matrix3() },
          premultiplied: { value: this.profile === 'hudPremultiplied' ? 1 : 0 },
          black: { value: new THREE.Vector4() },
          white: { value: new THREE.Vector4(1, 1, 1, 1) },
          alpha: { value: 1 },
        },
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      q = { mesh, pos, uv, uv1, col };
      this.quads.push(q);
    }
    q.mesh.visible = true;
    q.mesh.renderOrder = this.used++;
    return q;
  }

  private emit(c: [number, number][], uv: number[], vc: Rgba[], black: Rgba, white: Rgba, alpha: number, mode: number, tex: THREE.Texture[], srt?: THREE.Matrix3, blend?: { op: number; src: number; dst: number }, srt1?: THREE.Matrix3, mask?: NodeState['spec']['mask'], uv1 = uv): void {
    const q = this.quad();
    const mt = q.mesh.material;
    if (this.profile === 'hudPremultiplied') {
      mt.blending = THREE.CustomBlending; mt.blendEquation = THREE.AddEquation; mt.blendSrc = THREE.OneFactor; mt.blendDst = THREE.OneMinusSrcAlphaFactor; mt.blendSrcAlpha = THREE.OneFactor; mt.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    } else if (blend && blend.op > 0) {
      mt.blending = THREE.CustomBlending;
      mt.blendEquation = EQUATION[blend.op] ?? THREE.AddEquation;
      mt.blendSrc = FACTOR[blend.src] ?? THREE.SrcAlphaFactor;
      mt.blendDst = (FACTOR[blend.dst] ?? THREE.OneMinusSrcAlphaFactor) as THREE.BlendingDstFactor;
    } else mt.blending = THREE.NormalBlending;
    for (let i = 0; i < 4; i++) {
      q.pos[i * 3] = c[i][0];
      q.pos[i * 3 + 1] = c[i][1];
      q.pos[i * 3 + 2] = 0;
      q.uv[i * 2] = uv[i * 2];
      q.uv[i * 2 + 1] = uv[i * 2 + 1];
      q.uv1[i * 2] = uv1[i * 2];
      q.uv1[i * 2 + 1] = uv1[i * 2 + 1];
      for (let k = 0; k < 4; k++) q.col[i * 4 + k] = vc[i][k] / 255;
    }
    const g = q.mesh.geometry;
    for (const a of ['position', 'uv', 'uv1', 'vcol']) (g.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
    const u = q.mesh.material.uniforms;
    (u.black.value as THREE.Vector4).set(black[0] / 255, black[1] / 255, black[2] / 255, black[3] / 255);
    (u.white.value as THREE.Vector4).set(white[0] / 255, white[1] / 255, white[2] / 255, white[3] / 255);
    u.alpha.value = alpha / 255;
    u.mode.value = mode;
    u.texCount.value = Math.min(2, tex.length);
    u.srgb0.value = tex[0]?.userData.srgb ? 1 : 0;
    u.srgb1.value = tex[1]?.userData.srgb ? 1 : 0;
    u.red0.value = tex[0]?.userData.red && (this.profile !== 'hudPremultiplied' || mode === 1) ? 1 : 0;
    u.map0.value = tex[0] ?? this.white;
    u.map1.value = tex[1] ?? this.white;
    (u.srt0.value as THREE.Matrix3).copy(srt ?? new THREE.Matrix3());
    (u.srt1.value as THREE.Matrix3).copy(srt1 ?? new THREE.Matrix3());
    u.maskOn.value = mask ? 1 : 0;
    u.maskMap.value = mask ? this.texture(mask.tex, mask.wrapU, mask.wrapV) : this.white;
    (u.srtMask.value as THREE.Matrix3).copy(this.srtMatrix(mask?.srt));
  }

  begin(): void {
    for (let i = 0; i < this.used; i++) this.quads[i].mesh.visible = false;
    this.used = 0;
  }

  draw(inst: LayoutInst, base: Mat3 = [1, 0, 0, 0, 1, 0], alpha = 255): void {
    if (!inst.visible) return;
    const root = inst.nodes.findIndex((n) => n.spec.p < 0);
    this.node(inst, root, base, null, alpha);
  }

  render(gl: THREE.WebGLRenderer): void {
    for (let i = this.used; i < this.quads.length; i++) this.quads[i].mesh.visible = false;
    if (!this.linear) { gl.render(this.scene, this.camera); return; }
    gl.setRenderTarget(this.linear);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(this.scene, this.camera);
    gl.setRenderTarget(null);
    gl.render(this.outScene, this.camera);
  }

  private node(inst: LayoutInst, i: number, pm: Mat3, parent: NodeState | null, alpha: number): void {
    const n = inst.nodes[i];
    if (!n.v) return;
    const [ax, ay] = anchor(parent, n, inst.spec.compatibility === 'hudLegacy');
    const m = mul(mul(pm, tr(ax, ay)), local(n));
    const my = (alpha * n.a) / 255;
    const rect = rectOf(n.spec.o, n.z[0], n.z[1]);
    const k = n.spec.k;
    if (k === 'pic') this.picture(inst, n, m, rect, my);
    else if (k === 'wnd') this.window(inst, n, m, rect, my);
    else if (k === 'txt') this.text(inst, i, n, m, rect, my);
    const ca = n.spec.ia ? my : alpha;
    if (k === 'part') {
      const p = inst.parts.get(i);
      if (p && p.visible) {
        const mag = n.spec.mag ?? [1, 1];
        const pr = p.nodes.findIndex((x) => x.spec.p < 0);
        this.node(p, pr, mul(m, [mag[0], 0, 0, 0, mag[1], 0]), inst.spec.compatibility === 'hudLegacy' ? n : null, ca);
      }
    }
    for (const c of n.children) this.node(inst, c, m, n, ca);
  }

  private matTex(inst: LayoutInst, mi: number): { tex: THREE.Texture[]; srt: THREE.Matrix3; srt1: THREE.Matrix3 } {
    const ms = inst.spec.mats[mi];
    const ov = inst.texOverride.get(mi);
    let tex = ms.tex.map((t, s) => this.texture(ov?.get(s) ?? t.name, t.wu, t.wv));
    // 3D 칸(x_pict_3d): 1번 칸 = 렌더 타깃, 2번 칸 마스크는 시스템 데이터 형식 6 결합 규칙 [미확정]이라 쓰지 않는다 [근사: 아래쪽 흰 띠는 mask_00/01 페인이 그린다]
    if (this.profile === 'menuLinear' && tex[0]?.userData.linear) tex = [tex[0]];
    const st = inst.mats[mi].srt[0];
    const srt = new THREE.Matrix3();
    if (st) {
      // nw4r 식 텍스처 행렬 [추정]: uv' = R·S·(uv − 0.5) + 0.5 + t
      const r = (st.r * Math.PI) / 180;
      const c = Math.cos(r);
      const s = Math.sin(r);
      const a = c * st.s[0];
      const b = -s * st.s[1];
      const d = s * st.s[0];
      const e = c * st.s[1];
      srt.set(a, b, 0.5 - 0.5 * a - 0.5 * b + st.t[0], d, e, 0.5 - 0.5 * d - 0.5 * e + st.t[1], 0, 0, 1);
    }
    if (inst.spec.compatibility === 'hudLegacy') srt.copy(this.srtMatrix(st));
    // 렌더 타깃은 아래가 v = 0 이라 해당 칸만 세로로 뒤집는다(마스크 칸은 그대로)
    if (tex[0]?.userData.flipV) srt.premultiply(new THREE.Matrix3().set(1, 0, 0, 0, -1, 1, 0, 0, 1));
    const srt1 = inst.spec.compatibility === 'hudLegacy' ? this.srtMatrix(inst.mats[mi].srt[1]) : new THREE.Matrix3();
    if (tex[1]?.userData.flipV) srt1.premultiply(new THREE.Matrix3().set(1, 0, 0, 0, -1, 1, 0, 0, 1));
    return { tex, srt, srt1 };
  }

  private corners(m: Mat3, l: number, b: number, r: number, t: number): [number, number][] {
    return [xf(m, l, t), xf(m, r, t), xf(m, l, b), xf(m, r, b)];
  }

  private picture(inst: LayoutInst, n: NodeState, m: Mat3, [l, b, r, t]: number[], alpha: number): void {
    const mi = n.spec.m ?? -1;
    if (mi < 0) {
      if (inst.spec.compatibility === 'hudLegacy') this.emit(this.corners(m, l, b, r, t), n.uv, n.vc, [0, 0, 0, 0], [255, 255, 255, 255], alpha, 0, [], undefined, undefined, undefined, n.spec.mask);
      return;
    }
    const { tex, srt, srt1 } = this.matTex(inst, mi);
    const mat = inst.mats[mi];
    this.emit(this.corners(m, l, b, r, t), n.uv, n.vc, mat.black, mat.white, alpha, 0, tex, srt, inst.spec.mats[mi].blend, srt1, n.spec.mask, n.uv1);
  }

  private window(inst: LayoutInst, n: NodeState, m: Mat3, [l, b, r, t]: number[], alpha: number): void {
    if (inst.spec.compatibility === 'hudLegacy') { this.hudWindow(inst, n, m, [l, b, r, t], alpha); return; }
    const w = n.spec.wnd!;
    const fm = w.frame;
    if (!(w.flags & 1) || fm < 0) {
      if (w.content < 0) return;
      const mat = inst.mats[w.content];
      this.emit(this.corners(m, l, b, r, t), [0, 0, 1, 0, 0, 1, 1, 1], n.vc, mat.black, mat.white, alpha, 0, this.matTex(inst, w.content).tex);
      return;
    }
    // 내용(가운데) = 내용 재질·정점색, 모서리·변 = 프레임 재질 텍스처(LT 를 뒤집어 씀) [근사]
    const fs = w.fs;
    const cm = inst.mats[w.content >= 0 ? w.content : fm];
    const ctex = w.content >= 0 ? this.matTex(inst, w.content).tex : [];
    const fmat = inst.mats[fm];
    const ftex = this.matTex(inst, fm).tex;
    const img = this.images.get(inst.spec.mats[fm].tex[0]?.name ?? '');
    const tw = img ? img.width : fs.l;
    const th = img ? img.height : fs.t;
    const xs = [l, l + fs.l, r - fs.r, r];
    const ys = [t, t - fs.t, b + fs.b, b];
    const uCol = [
      [0, fs.l / tw],
      [fs.l / tw, fs.l / tw],
      [fs.r / tw, 0],
    ];
    const vRow = [
      [0, fs.t / th],
      [fs.t / th, fs.t / th],
      [fs.b / th, 0],
    ];
    const whiteV: Rgba[] = [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ];
    this.emit(this.corners(m, xs[1], ys[2], xs[2], ys[1]), [0, 0, 1, 0, 0, 1, 1, 1], n.vc, cm.black, cm.white, alpha, 0, ctex);
    for (let iy = 0; iy < 3; iy++) {
      for (let ix = 0; ix < 3; ix++) {
        if (ix === 1 && iy === 1) continue;
        const [uL, uR] = uCol[ix];
        const [vT, vB] = vRow[iy];
        const c: [number, number][] = [xf(m, xs[ix], ys[iy]), xf(m, xs[ix + 1], ys[iy]), xf(m, xs[ix], ys[iy + 1]), xf(m, xs[ix + 1], ys[iy + 1])];
        this.emit(c, [uL, vT, uR, vT, uL, vB, uR, vB], whiteV, fmat.black, fmat.white, alpha, 0, ftex);
      }
    }
  }

  private text(inst: LayoutInst, idx: number, n: NodeState, m: Mat3, [l, b, r, t]: number[], alpha: number): void {
    const str = inst.texts.get(idx) ?? '';
    if (!str) return;
    const ts = n.spec.txt!;
    const mat = n.spec.m !== undefined && n.spec.m >= 0 ? inst.mats[n.spec.m] : { black: [0, 0, 0, 0] as Rgba, white: [255, 255, 255, 255] as Rgba };
    const top = n.vc[0];
    const bot = n.vc[2];
    const place = (lw: number, lh: number): [number, number] => {
      const x = ts.al[0] === -1 ? l : ts.al[0] === 1 ? r - lw : (l + r) / 2 - lw / 2;
      const y = ts.al[1] === 1 ? t : ts.al[1] === -1 ? b + lh : (b + t) / 2 + lh / 2;
      return [x, y];
    };
    const f: FontSpec | undefined = this.spec.fonts[ts.font];
    const raster = this.providers.rasterText(ts.font, str, ts.fs);
    if (raster) {
      const [x, y] = place(raster.w, raster.h);
      this.emit(this.corners(m, x, y - raster.h, x + raster.w, y), [0, 0, 1, 0, 0, 1, 1, 1], [top, top, bot, bot], mat.black, mat.white, alpha, 1, [raster.tex]);
      return;
    }
    if (!f) return;
    const sx = ts.fs[0] / f.width;
    const sy = ts.fs[1] / f.height;
    const chars = [...str];
    let lw = 0;
    chars.forEach((ch, i) => {
      lw += (f.glyphs[ch]?.adv ?? f.width) * sx + (i > 0 ? ts.cs : 0);
    });
    const lh = f.height * sy;
    let [pen, yTop] = place(lw, lh);
    for (const ch of chars) {
      const g = f.glyphs[ch];
      const tex = g && g.w > 0 ? this.providers.sheetTexture(g.sheet, g.rgba) : null;
      if (g && tex) {
        const gx = pen + g.left * sx;
        const gt = yTop - (f.ascent - g.baseline) * sy;
        const { u0, v0, u1, v1 } = g;
        this.emit(this.corners(m, gx, gt - g.h * sy, gx + g.w * sx, gt), [u0, v0, u1, v0, u0, v1, u1, v1], [top, top, bot, bot], mat.black, mat.white, alpha, inst.spec.compatibility !== 'hudLegacy' && g.color && !ts.font.endsWith('_shadow') ? 2 : 1, [tex]);
      }
      pen += (g?.adv ?? f.width) * sx + ts.cs;
    }
  }

  private srtMatrix(st: { t: [number, number]; r: number; s: [number, number] } | undefined): THREE.Matrix3 {
    if (!st) return new THREE.Matrix3();
    const rad = st.r * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    const a = c * st.s[0], b = -s * st.s[1], d = s * st.s[0], e = c * st.s[1];
    return new THREE.Matrix3().set(a, b, st.t[0] + 0.5 - 0.5 * a - 0.5 * b, d, e, st.t[1] + 0.5 - 0.5 * d - 0.5 * e, 0, 0, 1);
  }

  /** 창: windowFlags bit0 이면 프레임 재질 하나로 9칸 [근사], 아니면 내용만 */
  private hudWindow(inst: LayoutInst, n: NodeState, m: Mat3, [l, b, r, t]: number[], alpha: number): void {
    const w = n.spec.wnd!;
    const emit = (mi: number, corners: [number, number][], uv: number[]): void => {
      const mat = inst.mats[mi], maps = mi >= 0 ? this.matTex(inst, mi) : null;
      this.emit(corners, uv, n.vc, mat?.black ?? [0, 0, 0, 0], mat?.white ?? [255, 255, 255, 255], alpha, 0, maps?.tex ?? [], maps?.srt, undefined, maps?.srt1);
    };
    if (!(w.flags & 1) || w.frame < 0) { emit(w.content, this.corners(m, l, b, r, t), n.uv); return; }
    const fs = w.fs, ov = inst.texOverride.get(w.frame);
    const img = this.images.get(ov?.get(0) ?? inst.spec.mats[w.frame].tex[0]?.name ?? '');
    const tw = img ? img.width : fs.l, th = img ? img.height : fs.t;
    const xs = [l, l + fs.l, r - fs.r, r], ys = [t, t - fs.t, b + fs.b, b];
    // 모서리 텍스처(LT)를 오른쪽·아래 모서리에서는 뒤집어 쓰고, 변·내용은 clamp 로 텍스처 안쪽 끝 텍셀을 늘린다
    const us = [[0, fs.l / tw], [1, 1], [fs.r / tw, 0]], vs = [[0, fs.t / th], [1, 1], [fs.b / th, 0]];
    for (let iy = 0; iy < 3; iy++) for (let ix = 0; ix < 3; ix++) {
      const [ul, ur] = us[ix], [vt, vb] = vs[iy];
      emit(w.frame, this.corners(m, xs[ix], ys[iy + 1], xs[ix + 1], ys[iy]), [ul, vt, ur, vt, ul, vb, ur, vb]);
    }
  }

  setImages(images: ReadonlyMap<string, LayoutImage>): void { for (const [key, image] of images) this.images.set(key, image); }
  get drawCount(): number { return this.used; }

  dispose(): void {
    for (const q of this.quads) {
      q.mesh.geometry.dispose();
      q.mesh.material.dispose();
    }
    for (const t of this.texCache.values()) t.dispose();
    this.white.dispose();
    this.linear?.dispose();
    for (const mesh of this.outScene.children as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }
}
