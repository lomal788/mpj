/**
 * 명세 레이아웃 2D 렌더러 — three 직교 카메라(1920×1080, 원점 가운데, y 위 +)로 사각형을 그린다.
 * 변환: M(노드) = M(부모)·T(부모 원점점)·T(t)·Rz(r)·S(s) [docs 6, engine 05 §3.3 규칙].
 * 색: 재질 black + (white − black)·텍스처(칸 2개면 곱 [근사]) × 정점색 × 누적 알파. 글자: black→white 를 커버리지로 보간 [추정].
 * 색 공간: 정점색·재질색은 선형 값, sRGB 형식 텍스처(spec.srgb)는 선형으로 풀어 선형 버퍼에서 섞고 마지막에 sRGB 로 내보낸다
 *   [데이터+참고 이미지: 배경 #3490db → 캡처 (129,197,233) = sRGB 부호화 값, 제목 띠 #070203 → (45,21,27)].
 * 창(wnd): flags bit0 이면 프레임 재질 텍스처로 9칸(모서리 뒤집기·변/내용 clamp) [근사], 아니면 내용만.
 * 시스템 폰트(명세에 없는 글꼴, 계정 이름)는 브라우저 산세리프로 그린다 [근사]. 컬러 아이콘 글리프(extension)는 본 글꼴이면 글리프 색 그대로,
 * 그림자 글꼴이면 모양(알파)만 재질 색으로 칠한다 [추정: 캡처의 안내 아이콘 = 흰 윤곽 + 어두운 바탕].
 */
import * as THREE from 'three';
import type { LayoutInst, NodeState } from './scene2d';
import type { FontSpec, Rgba, Spec } from './types';

type Mat3 = [number, number, number, number, number, number];

const mul = (a: Mat3, b: Mat3): Mat3 => [
  a[0] * b[0] + a[1] * b[3],
  a[0] * b[1] + a[1] * b[4],
  a[0] * b[2] + a[1] * b[5] + a[2],
  a[3] * b[0] + a[4] * b[3],
  a[3] * b[1] + a[4] * b[4],
  a[3] * b[2] + a[4] * b[5] + a[5],
];
const tr = (x: number, y: number): Mat3 => [1, 0, x, 0, 1, y];
const xf = (m: Mat3, x: number, y: number): [number, number] => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];

/** 원점 규칙의 사각형 (왼, 아래, 오른, 위) */
export function rectOf(o: [number, number], w: number, h: number): [number, number, number, number] {
  const l = o[0] === -1 ? 0 : o[0] === 1 ? -w : -w / 2;
  const t = o[1] === 1 ? 0 : o[1] === -1 ? h : h / 2;
  return [l, t - h, l + w, t];
}

/**
 * 부모 원점 기준점. 부모 원점이 가운데(관측된 전부)면 부모의 위치점(부모 로컬 0,0) — 부모 사각형 가운데가 아니다
 * [참고 이미지+계산: 제목 띠 pict_base_right_00(왼쪽 원점)의 자식 right_01 이 같은 자리에 겹쳐야 캡처 그라데이션(1550 → 108, 1650 → 171)이 선형 합성 값과 맞는다].
 * 왼쪽·오른쪽·위·아래 부모 원점은 이 화면에 없다 → 부모 사각형 가장자리 [추정].
 */
function anchor(parent: NodeState | null, child: NodeState): [number, number] {
  if (!parent) return [0, 0];
  const [l, b, r, t] = rectOf(parent.spec.o, parent.z[0], parent.z[1]);
  const po = child.spec.po;
  return [po[0] === -1 ? l : po[0] === 1 ? r : 0, po[1] === 1 ? t : po[1] === -1 ? b : 0];
}

function local(n: NodeState): Mat3 {
  const rz = (n.r * Math.PI) / 180;
  const c = Math.cos(rz);
  const s = Math.sin(rz);
  return [c * n.s[0], -s * n.s[1], n.t[0], s * n.s[0], c * n.s[1], n.t[1]];
}

/** 노드의 화면 좌표계 행렬(부품·조상 포함)을 구한다 — 소리 위치·검사용 */
export function nodeMatrix(root: LayoutInst, path: string, base: Mat3 = [1, 0, 0, 0, 1, 0]): Mat3 | null {
  const segs = path.split('/');
  let inst: LayoutInst = root;
  let m = base;
  let parentNode: NodeState | null = null;
  for (let si = 0; si < segs.length; si++) {
    const j = inst.byName.get(segs[si]);
    if (j === undefined) return null;
    const chain: number[] = [];
    for (let k: number = j; k >= 0; k = inst.nodes[k].spec.p) chain.unshift(k);
    let parent: NodeState | null = parentNode;
    for (const k of chain) {
      const n = inst.nodes[k];
      const [ax, ay] = anchor(parent, n);
      m = mul(mul(m, tr(ax, ay)), local(n));
      parent = n;
    }
    if (si < segs.length - 1) {
      const p = inst.parts.get(j);
      if (!p) return null;
      parentNode = inst.nodes[j];
      inst = p;
    }
  }
  return m;
}

const VERT = `
attribute vec4 vcol;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vUv = uv;
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
uniform mat3 srt0;
uniform vec4 black;
uniform vec4 white;
uniform float alpha;
varying vec2 vUv;
varying vec4 vCol;
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  vec4 t = vec4(1.0);
  if (texCount > 0) {
    t = texture2D(map0, (srt0 * vec3(vUv, 1.0)).xy);
    if (srgb0 == 1) t.rgb = toLinear(t.rgb);
    if (texCount > 1) {
      vec4 t1 = texture2D(map1, vUv);
      if (srgb1 == 1) t1.rgb = toLinear(t1.rgb);
      t *= t1;
    }
  }
  vec4 c;
  if (mode == 1) c = mix(black, white, t.a);
  else if (mode == 2) c = t;
  else c = black + (white - black) * t;
  c *= vCol;
  c.a *= alpha;
  gl_FragColor = c;
}`;

interface Quad {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  pos: Float32Array;
  uv: Float32Array;
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

export class Render2D {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private readonly quads: Quad[] = [];
  private used = 0;
  private readonly images = new Map<string, HTMLImageElement | HTMLCanvasElement>();
  private readonly texCache = new Map<string, THREE.Texture>();
  /** 외부 텍스처(3D 렌더 타깃 등) */
  readonly dynamic = new Map<string, THREE.Texture>();
  private readonly sysText = new Map<string, { tex: THREE.CanvasTexture; w: number; h: number }>();
  private readonly white: THREE.DataTexture;
  private readonly srgb: Set<string>;
  /** 선형 합성 버퍼와 sRGB 내보내기 */
  private readonly linear: THREE.WebGLRenderTarget;
  private readonly outScene = new THREE.Scene();

  constructor(private readonly spec: Spec) {
    this.srgb = new Set(spec.srgb ?? []);
    this.linear = new THREE.WebGLRenderTarget(spec.screen[0], spec.screen[1], { type: THREE.HalfFloatType, samples: 4 });
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
    this.camera = new THREE.OrthographicCamera(-960, 960, 540, -540, -10, 10);
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.white.needsUpdate = true;
  }

  /** 명세 텍스처·폰트 이미지를 읽는다 */
  async load(url: (p: string) => string): Promise<void> {
    const jobs: Promise<void>[] = [];
    const get = (key: string, path: string): void => {
      jobs.push(
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = () => {
            this.images.set(key, img);
            res();
          };
          img.onerror = () => {
            console.warn(`charselect: 이미지를 읽지 못했다 ${path}`);
            res();
          };
          img.src = url(path);
        }),
      );
    };
    for (const [k, p] of Object.entries(this.spec.textures)) get(k, p);
    for (const [k, f] of Object.entries(this.spec.fonts)) get(`font:${k}`, f.image);
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
    t = new THREE.Texture(img);
    t.userData.srgb = this.srgb.has(key);
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
      const col = new Float32Array(16);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
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
          srt0: { value: new THREE.Matrix3() },
          black: { value: new THREE.Vector4() },
          white: { value: new THREE.Vector4(1, 1, 1, 1) },
          alpha: { value: 1 },
        },
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      q = { mesh, pos, uv, col };
      this.quads.push(q);
    }
    q.mesh.visible = true;
    q.mesh.renderOrder = this.used++;
    return q;
  }

  private emit(c: [number, number][], uv: number[], vc: Rgba[], black: Rgba, white: Rgba, alpha: number, mode: number, tex: THREE.Texture[], srt?: THREE.Matrix3, blend?: { op: number; src: number; dst: number }): void {
    const q = this.quad();
    const mt = q.mesh.material;
    if (blend && blend.op > 0) {
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
      for (let k = 0; k < 4; k++) q.col[i * 4 + k] = vc[i][k] / 255;
    }
    const g = q.mesh.geometry;
    for (const a of ['position', 'uv', 'vcol']) (g.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
    const u = q.mesh.material.uniforms;
    (u.black.value as THREE.Vector4).set(black[0] / 255, black[1] / 255, black[2] / 255, black[3] / 255);
    (u.white.value as THREE.Vector4).set(white[0] / 255, white[1] / 255, white[2] / 255, white[3] / 255);
    u.alpha.value = alpha / 255;
    u.mode.value = mode;
    u.texCount.value = Math.min(2, tex.length);
    u.srgb0.value = tex[0]?.userData.srgb ? 1 : 0;
    u.srgb1.value = tex[1]?.userData.srgb ? 1 : 0;
    u.map0.value = tex[0] ?? this.white;
    u.map1.value = tex[1] ?? this.white;
    (u.srt0.value as THREE.Matrix3).copy(srt ?? new THREE.Matrix3());
  }

  begin(): void {
    for (let i = 0; i < this.used; i++) this.quads[i].mesh.visible = false;
    this.used = 0;
  }

  draw(inst: LayoutInst, base: Mat3 = [1, 0, 0, 0, 1, 0]): void {
    if (!inst.visible) return;
    const root = inst.nodes.findIndex((n) => n.spec.p < 0);
    this.node(inst, root, base, null, 255);
  }

  render(gl: THREE.WebGLRenderer): void {
    for (let i = this.used; i < this.quads.length; i++) this.quads[i].mesh.visible = false;
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
    const [ax, ay] = anchor(parent, n);
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
        this.node(p, pr, mul(m, [mag[0], 0, 0, 0, mag[1], 0]), null, ca);
      }
    }
    for (const c of n.children) this.node(inst, c, m, n, ca);
  }

  private matTex(inst: LayoutInst, mi: number): { tex: THREE.Texture[]; srt: THREE.Matrix3 } {
    const ms = inst.spec.mats[mi];
    const ov = inst.texOverride.get(mi);
    let tex = ms.tex.map((t, s) => this.texture(ov?.get(s) ?? t.name, t.wu, t.wv));
    // 3D 칸(x_pict_3d): 1번 칸 = 렌더 타깃, 2번 칸 마스크는 시스템 데이터 형식 6 결합 규칙 [미확정]이라 쓰지 않는다 [근사: 아래쪽 흰 띠는 mask_00/01 페인이 그린다]
    if (tex[0]?.userData.linear) tex = [tex[0]];
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
    // 렌더 타깃은 아래가 v = 0 이라 첫 칸만 세로로 뒤집는다(마스크 칸은 그대로)
    if (tex[0]?.userData.flipV) srt.premultiply(new THREE.Matrix3().set(1, 0, 0, 0, -1, 1, 0, 0, 1));
    return { tex, srt };
  }

  private corners(m: Mat3, l: number, b: number, r: number, t: number): [number, number][] {
    return [xf(m, l, t), xf(m, r, t), xf(m, l, b), xf(m, r, b)];
  }

  private picture(inst: LayoutInst, n: NodeState, m: Mat3, [l, b, r, t]: number[], alpha: number): void {
    const mi = n.spec.m ?? -1;
    if (mi < 0) return;
    const { tex, srt } = this.matTex(inst, mi);
    const mat = inst.mats[mi];
    this.emit(this.corners(m, l, b, r, t), n.uv, n.vc, mat.black, mat.white, alpha, 0, tex, srt, inst.spec.mats[mi].blend);
  }

  private window(inst: LayoutInst, n: NodeState, m: Mat3, [l, b, r, t]: number[], alpha: number): void {
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
    if (!f) {
      this.systemText(str, ts.fs[1], m, place, top, bot, mat.black, mat.white, alpha);
      return;
    }
    const sx = ts.fs[0] / f.width;
    const sy = ts.fs[1] / f.height;
    const chars = [...str];
    let lw = 0;
    chars.forEach((ch, i) => {
      lw += (f.glyphs[ch]?.adv ?? f.width) * sx + (i > 0 ? ts.cs : 0);
    });
    const lh = f.height * sy;
    let [pen, yTop] = place(lw, lh);
    const img = this.images.get(`font:${ts.font}`);
    if (!img) return;
    const tex = this.texture(`font:${ts.font}`);
    const iw = img.width;
    const ih = img.height;
    for (const ch of chars) {
      const g = f.glyphs[ch];
      if (g && g.w > 0) {
        const gx = pen + g.left * sx;
        const gt = yTop - (f.ascent - g.baseline) * sy;
        const u0 = g.x / iw;
        const u1 = (g.x + g.w) / iw;
        const v0 = g.y / ih;
        const v1 = (g.y + g.h) / ih;
        this.emit(this.corners(m, gx, gt - g.h * sy, gx + g.w * sx, gt), [u0, v0, u1, v0, u0, v1, u1, v1], [top, top, bot, bot], mat.black, mat.white, alpha, g.color && !ts.font.endsWith('_shadow') ? 2 : 1, [tex]);
      }
      pen += (g?.adv ?? f.width) * sx + ts.cs;
    }
  }

  private systemText(str: string, px: number, m: Mat3, place: (w: number, h: number) => [number, number], top: Rgba, bot: Rgba, black: Rgba, white: Rgba, alpha: number): void {
    const key = `${str}|${px}`;
    let e = this.sysText.get(key);
    if (!e) {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      if (!ctx) return;
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
    const [x0, yt] = place(e.w, e.h);
    this.emit(this.corners(m, x0, yt - e.h, x0 + e.w, yt), [0, 0, 1, 0, 0, 1, 1, 1], [top, top, bot, bot], black, white, alpha, 1, [e.tex]);
  }

  dispose(): void {
    for (const q of this.quads) {
      q.mesh.geometry.dispose();
      q.mesh.material.dispose();
    }
    for (const t of this.texCache.values()) t.dispose();
    for (const e of this.sysText.values()) e.tex.dispose();
    this.white.dispose();
    this.linear.dispose();
  }
}
