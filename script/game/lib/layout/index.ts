/**
 * 명세 레이아웃 인스턴스 — 노드 값·재질 값·애니 재생(에르미트·계단, 1프레임/틱)·부품 인스턴스.
 * 규칙: 애니가 끝나면 마지막 값을 유지한다(원본 ui2d 처럼 값을 덮어쓰고 되돌리지 않음), 같은 프레임 두 키 = 불연속 [docs 6.3, engine 05 §3.7].
 */
export type Rgba = [number, number, number, number];

export interface NodeSpec {
  /** 원본 페인 이름 */
  n: string;
  /** 부모 노드 번호(−1 = 루트) */
  p: number;
  extra?: [number, number, number];
  mask?: { tex: string; wrapU: string; wrapV: string; srt: { t: [number, number]; r: number; s: [number, number] } };
  k: 'null' | 'pic' | 'txt' | 'wnd' | 'part';
  v: boolean;
  /** 자식에 알파 전파 */
  ia: boolean;
  /** 원점: x −1 왼·0 가운데·1 오른, y 1 위·0 가운데·−1 아래 */
  o: [number, number];
  po: [number, number];
  t: [number, number];
  /** z 회전(도) */
  r: number;
  s: [number, number];
  z: [number, number];
  a: number;
  vc?: Rgba[];
  m?: number;
  uv?: number[];
  txt?: { font: string; fs: [number, number]; cs: number; al: [number, number]; text: string };
  wnd?: { fs: { l: number; r: number; t: number; b: number }; frame: number; content: number; flags: number };
  part?: string;
  mag?: [number, number];
  /** 부품 덮어쓰기: 보이기·정점색, pane 기본 정보(t 위치·s 배율·z 크기, docs 12.5) */
  ov?: { n: string; vis?: boolean; vc?: Rgba[]; t?: [number, number]; s?: [number, number]; z?: [number, number] }[];
}

export interface MatSpec {
  name: string;
  black: Rgba;
  white: Rgba;
  tex: { name: string; wu: string; wv: string }[];
  srt: { t: [number, number]; r: number; s: [number, number] }[];
  /** 재질 블렌드(원본 mat1 flags bit10): op 1 더하기·2 빼기·3 거꾸로 빼기, 계수 0 영·1 하나·2 대상색·3 1−대상색·4 원본 알파·5 1−원본 알파·6 대상 알파·7 1−대상 알파·8 원본색·9 1−원본색 */
  blend?: { op: number; src: number; dst: number };
}

export interface TrackSpec {
  node?: number;
  mat?: number;
  prop: string;
  step: boolean;
  textures?: string[];
  keys: number[][];
}

export interface AnimSpec {
  len: number;
  loop: boolean;
  tracks: TrackSpec[];
}

export interface LayoutSpec {
  compatibility?: 'hudLegacy';
  size: [number, number];
  nodes: NodeSpec[];
  mats: MatSpec[];
  anims: Record<string, AnimSpec>;
}

export interface GlyphSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  left: number;
  adv: number;
  baseline: number;
  /** 컬러 아이콘 글리프(extension 폰트) */
  color: boolean;
  sheet: string;
  rgba: boolean;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface FontSpec {
  height: number;
  width: number;
  ascent: number;
  lineFeed?: number;
  glyphs: Record<string, GlyphSpec>;
}

export interface LayoutDocument {
  screen: [number, number];
  textures: Record<string, string>;
  srgb?: string[];
  layouts: Record<string, LayoutSpec>;
  fonts: Record<string, FontSpec>;
}



export interface NodeState {
  extra: [number, number, number];
  spec: NodeSpec;
  v: boolean;
  t: [number, number];
  r: number;
  s: [number, number];
  z: [number, number];
  a: number;
  vc: Rgba[];
  /** 그림 UV(덮어쓰기 가능) */
  uv: number[];
  children: number[];
}

export interface MatState {
  black: Rgba;
  white: Rgba;
  srt: { t: [number, number]; r: number; s: [number, number] }[];
}

/** 키 배열 [[프레임, 값, 기울기]] 의 값 */
export function evalKeys(keys: number[][], f: number, step: boolean): number {
  if (keys.length === 0) return 0;
  if (step) {
    let v = keys[0][1];
    for (const k of keys) if (k[0] <= f) v = k[1];
    return v;
  }
  if (f <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (f >= last[0]) return last[1];
  for (let i = 0; i + 1 < keys.length; i++) {
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (f >= k0[0] && f <= k1[0]) {
      const d = k1[0] - k0[0];
      if (d === 0) return k1[1];
      const t = (f - k0[0]) / d;
      const t2 = t * t;
      const t3 = t2 * t;
      const s0 = k0[2] ?? 0;
      const s1 = k1[2] ?? 0;
      return (2 * t3 - 3 * t2 + 1) * k0[1] + (t3 - 2 * t2 + t) * d * s0 + (-2 * t3 + 3 * t2) * k1[1] + (t3 - t2) * d * s1;
    }
  }
  return last[1];
}

export class LayoutPlayer {
  frame = 0;
  speed = 1;
  constructor(readonly name: string, readonly anim: AnimSpec, public next?: string, readonly onlyNodes?: Set<number>, readonly onlyMats?: Set<number>) {}
  get ended(): boolean { return !this.anim.loop && this.frame >= this.anim.len; }
  advance(frames: number): void {
    const n = this.anim.len;
    this.frame += frames * this.speed;
    if (this.anim.loop) { if (n > 0) this.frame = ((this.frame % n) + n) % n; }
    else if (this.frame > n) this.frame = n;
  }
}

export class LayoutInst {
  readonly nodes: NodeState[];
  readonly mats: MatState[];
  readonly parts = new Map<number, LayoutInst>();
  readonly byName = new Map<string, number>();
  /** 텍스트 페인 문자열 */
  readonly texts = new Map<number, string>();
  /** 재질 텍스처 칸 바꾸기(얼굴·3D 렌더 타깃): 재질 번호 → 칸 → 텍스처 키 */
  readonly texOverride = new Map<number, Map<number, string>>();
  visible = true;
  player: LayoutPlayer | null = null;
  readonly channels = new Map<string, LayoutPlayer>();

  constructor(
    readonly name: string,
    readonly spec: LayoutSpec,
    all: Pick<LayoutDocument, 'layouts'>,
  ) {
    this.nodes = spec.nodes.map((n) => ({
      spec: n,
      v: n.v,
      t: [n.t[0], n.t[1]],
      r: n.r,
      extra: [...(n.extra ?? [0, 0, 0])] as [number, number, number],
      s: [n.s[0], n.s[1]],
      z: [n.z[0], n.z[1]],
      a: n.a,
      vc: (n.vc ?? [
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
      ]).map((c) => [...c] as Rgba),
      uv: n.uv ? [...n.uv] : [0, 0, 1, 0, 0, 1, 1, 1],
      children: [],
    }));
    this.nodes.forEach((n, i) => {
      if (n.spec.p >= 0) this.nodes[n.spec.p].children.push(i);
      this.byName.set(n.spec.n, i);
      if (n.spec.k === 'txt' && n.spec.txt?.text) this.texts.set(i, n.spec.txt.text);
    });
    this.mats = spec.mats.map((m) => ({ black: [...m.black] as Rgba, white: [...m.white] as Rgba, srt: m.srt.map((s) => ({ t: [...s.t] as [number, number], r: s.r, s: [...s.s] as [number, number] })) }));
    this.nodes.forEach((n, i) => {
      if (n.spec.k !== 'part' || !n.spec.part) return;
      const ls = all.layouts[n.spec.part];
      if (!ls) return;
      const inst = new LayoutInst(n.spec.part, ls, all);
      for (const o of n.spec.ov ?? []) {
        const j = inst.byName.get(o.n);
        if (j === undefined) continue;
        if (o.vis !== undefined) inst.nodes[j].v = o.vis;
        if (o.vc) inst.nodes[j].vc = o.vc.map((c) => [...c] as Rgba);
        if (o.t) inst.nodes[j].t = [o.t[0], o.t[1]];
        if (o.s) inst.nodes[j].s = [o.s[0], o.s[1]];
        if (o.z) inst.nodes[j].z = [o.z[0], o.z[1]];
      }
      this.parts.set(i, inst);
    });
  }

  /** 'a/b/c' 경로(부품 이름/페인 이름)로 노드 찾기 → [인스턴스, 노드 번호] */
  find(path: string): [LayoutInst, number] | null {
    const segs = path.split('/');
    let inst: LayoutInst = this;
    for (let i = 0; i < segs.length; i++) {
      const j = inst.byName.get(segs[i]);
      if (j === undefined) return null;
      if (i === segs.length - 1) return [inst, j];
      const p = inst.parts.get(j);
      if (!p) return null;
      inst = p;
    }
    return null;
  }

  part(path: string): LayoutInst | null {
    const f = this.find(path);
    return f ? (f[0].parts.get(f[1]) ?? null) : null;
  }

  setVisible(path: string, v: boolean): void {
    const f = this.find(path);
    if (f) f[0].nodes[f[1]].v = v;
  }

  setText(path: string, s: string): void {
    const f = this.find(path);
    if (f) f[0].texts.set(f[1], s);
  }

  /** 노드의 재질 칸 텍스처를 바꾼다 */
  setTexture(path: string, slot: number, key: string): void {
    const f = this.find(path);
    if (!f) return;
    const m = f[0].nodes[f[1]].spec.m;
    if (m === undefined || m < 0) return;
    let mm = f[0].texOverride.get(m);
    if (!mm) f[0].texOverride.set(m, (mm = new Map()));
    mm.set(slot, key);
  }

  /** 노드 재질의 텍스처 SRT 이동(칸 0) */
  setMatSrtT(path: string, tx: number, ty: number): void {
    const f = this.find(path);
    if (!f) return;
    const m = f[0].nodes[f[1]].spec.m;
    const st = m !== undefined && m >= 0 ? f[0].mats[m].srt[0] : undefined;
    if (st) st.t = [tx, ty];
  }

  /** 노드 재질의 white 색 */
  setMatWhite(path: string, c: Rgba): void {
    const f = this.find(path);
    if (!f) return;
    const m = f[0].nodes[f[1]].spec.m;
    if (m !== undefined && m >= 0) f[0].mats[m].white = [...c] as Rgba;
  }

  hasAnim(tag: string): boolean {
    return !!this.spec.anims[tag];
  }

  /** 레이아웃 애니 재생(태그). next = 끝나면 이어서 재생(원본 EnqueuePlay) */
  play(tag: string, next?: string): void {
    const a = this.spec.anims[tag];
    if (!a) {
      if (next && this.spec.anims[next]) this.play(next);
      return;
    }
    this.player = new LayoutPlayer(tag, a, next);
    this.applyPlayer();
  }

  get current(): string | null {
    return this.player?.name ?? null;
  }

  /** 지금 애니가 끝났는가(반복이 아니고 마지막 프레임에 닿음) */
  get done(): boolean {
    const p = this.player;
    return !p || (!p.anim.loop && p.frame >= p.anim.len && !p.next);
  }

  /** 1틱 진행 후 트랙 값을 쓴다. 부품도 함께 */
  update(frames = 1): void {
    const p = this.player;
    if (p) {
      p.frame += frames * p.speed;
      const n = p.anim.len;
      if (p.anim.loop) {
        if (n > 0) p.frame = ((p.frame % n) + n) % n;
      } else if (p.frame >= n) {
        if (p.next) {
          const nx = p.next;
          this.play(nx);
        } else p.frame = n;
      }
      this.applyPlayer();
    }
    for (const channel of this.channels.values()) { channel.advance(frames); this.applyPlayer(channel); }
    for (const part of this.parts.values()) part.update(frames);
  }

  applyPlayer(p: LayoutPlayer | null = this.player): void {
    if (!p) return;
    const f = p.frame;
    for (const tr of p.anim.tracks) {
      const v = evalKeys(tr.keys, f, tr.step);
      if (tr.node !== undefined) {
        if (p.onlyNodes && !p.onlyNodes.has(tr.node)) continue;
        const n = this.nodes[tr.node];
        switch (tr.prop) {
          case 'tz': n.extra[0] = v; break;
          case 'rx': n.extra[1] = v; break;
          case 'ry': n.extra[2] = v; break;
          case 'tx':
            n.t[0] = v;
            break;
          case 'ty':
            n.t[1] = v;
            break;
          case 'rz':
            n.r = v;
            break;
          case 'sx':
            n.s[0] = v;
            break;
          case 'sy':
            n.s[1] = v;
            break;
          case 'w':
            n.z[0] = v;
            break;
          case 'h':
            n.z[1] = v;
            break;
          case 'a':
            n.a = Math.max(0, Math.min(255, this.spec.compatibility === 'hudLegacy' ? v : Math.round(v)));
            break;
          case 'vis':
            n.v = Math.round(v) !== 0;
            break;
          default:
            if (tr.prop.startsWith('vc')) {
              const k = Number(tr.prop.slice(2));
              n.vc[k >> 2][k & 3] = Math.max(0, Math.min(255, this.spec.compatibility === 'hudLegacy' ? v : Math.round(v)));
            }
        }
      } else if (tr.mat !== undefined) {
        if (p.onlyMats && !p.onlyMats.has(tr.mat)) continue;
        const m = this.mats[tr.mat];
        if (tr.prop.startsWith('tex')) {
          const name = tr.textures?.[Math.round(v)];
          if (name !== undefined) {
            let ov = this.texOverride.get(tr.mat);
            if (!ov) this.texOverride.set(tr.mat, ov = new Map());
            ov.set(Number(tr.prop.slice(3)), name);
          }
        } else if (tr.prop.startsWith('blk')) m.black[Number(tr.prop.slice(3))] = Math.max(0, Math.min(255, this.spec.compatibility === 'hudLegacy' ? v : Math.round(v)));
        else if (tr.prop.startsWith('wht')) m.white[Number(tr.prop.slice(3))] = Math.max(0, Math.min(255, this.spec.compatibility === 'hudLegacy' ? v : Math.round(v)));
        else if (tr.prop.startsWith('srt')) {
          const [i, k] = tr.prop.slice(3).split('.').map(Number);
          const s = m.srt[i];
          if (!s) continue;
          if (k < 2) s.t[k] = v;
          else if (k === 2) s.r = v;
          else s.s[k - 3] = v;
        }
      }
    }
  }
}

export type Mat3 = [number, number, number, number, number, number];

export const mul = (a: Mat3, b: Mat3): Mat3 => [
  a[0] * b[0] + a[1] * b[3],
  a[0] * b[1] + a[1] * b[4],
  a[0] * b[2] + a[1] * b[5] + a[2],
  a[3] * b[0] + a[4] * b[3],
  a[3] * b[1] + a[4] * b[4],
  a[3] * b[2] + a[4] * b[5] + a[5],
];
export const tr = (x: number, y: number): Mat3 => [1, 0, x, 0, 1, y];
export const xf = (m: Mat3, x: number, y: number): [number, number] => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];

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
export function anchor(parent: NodeState | null, child: NodeState, boundsCenter = false): [number, number] {
  if (!parent) return [0, 0];
  const [l, b, r, t] = rectOf(parent.spec.o, parent.z[0], parent.z[1]);
  const po = child.spec.po;
  return [po[0] === -1 ? l : po[0] === 1 ? r : boundsCenter ? (l + r) / 2 : 0, po[1] === 1 ? t : po[1] === -1 ? b : boundsCenter ? (b + t) / 2 : 0];
}

export function local(n: NodeState): Mat3 {
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
      const [ax, ay] = anchor(parent, n, inst.spec.compatibility === 'hudLegacy');
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
