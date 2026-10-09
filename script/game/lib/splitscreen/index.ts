/**
 * 분할 화면 공용 코어 — import 0(외부 라이브러리·three·DOM·프로젝트 파일 없음). 원본 계약·웹 계약: docs/engine/10_split_screen.md §2~§6·§9.
 *
 * - bq::SplitScreenLayerList(SplitTo·CreateParams·SetParam·AnimationTo·IsFinished·IsSplitting)와 ComSplitScreen tick(상태 갱신 → 분할 여부 변화 → 선 In/Out
 *   → 경계 배치)을 옮긴다. 정규화 좌표(왼쪽 위 원점, y 아래), f32(Math.fround) 순서 보존, 시간은 step(dt) 로만(기본 1/60 고정 스텝, 시계는 호출자 몫).
 * - Viewport 계산: float viewport·성분별 정수 절삭 scissor·GL 원점 y, draw용 보정 카메라 모드3(type0 수평 FOV 보존, type1·3 halfHeight), 3D→HUD 식.
 * - 분할선(Parts.lyt sys_dividing_lines): 내부 경계 모으기·병합(Line2DPacker), pane 26개 위치·길이, in/out/normal 알파(BFLAN hermite).
 * - 그리기는 하지 않는다(three 어댑터 lib/splitscreen-three, DOM 어댑터 lib/splitscreen-dom). step·update·layout 은 할당 0.
 */

const F = Math.fround;

export const STEP_SEC = F(1 / 60);
export const FLT_EPSILON = 1.1920929e-7;
export const BASE_W = 1920;
export const BASE_H = 1080;
export const CORRECT_RT_ASPECT = F(16 / 9);
export const LINE_MERGE_EPS = 0.0001;
export const MG0122_CAPTURE = { perCamera: [960, 540], extra: [1920, 1080], extraCamera: 0 } as const;

export type LineKeys = readonly (readonly [number, number, number])[];

export const DIVIDING_LINES = {
  layout: 'sys_dividing_lines',
  texture: 'sys_dividing_line^s',
  group: 'Null_all',
  count: 13,
  paneWidth: 8,
  vLength: 1080,
  hLength: 1920,
  vRotate: 0,
  hRotate: 90,
  black: [0, 0, 0, 0] as readonly number[],
  white: [2, 2, 2, 255] as readonly number[],
  uvV: 38.57143,
  uvH: 66.206894,
  anim: {
    in: { frames: 9, keys: [[0, 0, 0], [9, 255, 0]] as LineKeys },
    normal: { frames: 1, keys: [[0, 255, 0]] as LineKeys },
    out: { frames: 9, keys: [[0, 255, 0], [9, 0, 0]] as LineKeys },
  },
  drawPriority: 0x8100,
} as const;

export function hermite(keys: LineKeys, f: number): number {
  const n = keys.length;
  if (n === 0) return 0;
  if (f <= keys[0][0]) return keys[0][1];
  if (f >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && f > keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const d = b[0] - a[0];
  if (d <= 0) return b[1];
  const t = (f - a[0]) / d;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * d * a[2] + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * d * b[2];
}

export class SplitParam {
  id = 0;
  x = 0;
  y = 0;
  w = 1;
  h = 1;
  minDepth = 0;
  maxDepth = 1;
  autoEnable = true;

  set(id: number, x: number, y: number, w: number, h: number): this {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.minDepth = 0;
    this.maxDepth = 1;
    this.autoEnable = true;
    return this;
  }

  copy(o: SplitParam): this {
    this.id = o.id;
    this.x = o.x;
    this.y = o.y;
    this.w = o.w;
    this.h = o.h;
    this.minDepth = o.minDepth;
    this.maxDepth = o.maxDepth;
    this.autoEnable = o.autoEnable;
    return this;
  }

  get visible(): boolean {
    return this.w > 0 && this.h > 0;
  }
}

export function createParams(cols: number, rows: number, focus: number, out: SplitParam[]): number {
  const n = cols * rows;
  while (out.length < n) out.push(new SplitParam());
  const fc = focus >= 0 ? focus % cols : -1;
  const fr = focus >= 0 ? Math.floor(focus / cols) : -1;
  const cw = F(1 / cols);
  const rh = F(1 / rows);
  let y = 0;
  for (let r = 0; r < rows; r++) {
    const h = focus < 0 ? rh : r === fr ? 1 : 0;
    let x = 0;
    for (let c = 0; c < cols; c++) {
      const w = focus < 0 ? cw : c === fc ? 1 : 0;
      const id = r * cols + c;
      out[id].set(id, x, y, w, h);
      x = F(x + w);
    }
    y = F(y + h);
  }
  return n;
}

export class SplitLayer {
  readonly cur = new SplitParam();
  readonly target = new SplitParam();
  readonly start = new SplitParam();
  duration = 0;
  elapsed = 0;
}

const lerp = (a: number, b: number, t: number): number => F(a + F(t * F(b - a)));

export class SplitScreenLayerList {
  readonly layers: SplitLayer[] = [];
  count = 0;
  cols = 0;
  rows = 0;
  private readonly tmp: SplitParam[] = [];

  splitTo(cols: number, rows: number, focus: number, sec: number): void {
    const n = createParams(cols, rows, focus, this.tmp);
    this.cols = cols;
    this.rows = rows;
    this.animationTo(this.tmp, n, sec);
  }

  private fit(n: number): void {
    while (this.layers.length < n) this.layers.push(new SplitLayer());
    this.count = n;
  }

  setParam(params: readonly SplitParam[], n = params.length): void {
    this.fit(n);
    for (let i = 0; i < n; i++) {
      const l = this.layers[i];
      l.cur.copy(params[i]);
      l.target.copy(params[i]);
      l.start.copy(params[i]);
      l.duration = 0;
      l.elapsed = 0;
    }
  }

  animationTo(params: readonly SplitParam[], n = params.length, sec: number): void {
    if (!(sec > 0)) {
      this.setParam(params, n);
      return;
    }
    if (n !== this.count) throw new Error(`splitscreen: AnimationTo 개수가 다르다(${this.count} → ${n}) — 원본 Abort`);
    const d = F(sec);
    for (let i = 0; i < n; i++) {
      const l = this.layers[i];
      l.start.copy(l.cur);
      l.target.copy(params[i]);
      l.duration = d;
      l.elapsed = 0;
    }
  }

  update(dt: number): void {
    const d = F(dt);
    for (let i = 0; i < this.count; i++) {
      const l = this.layers[i];
      if (l.duration <= 0) continue;
      l.elapsed = F(l.elapsed + d);
      if (l.elapsed >= l.duration) {
        l.cur.copy(l.target);
        l.duration = 0;
        l.elapsed = 0;
        continue;
      }
      const t = F(l.elapsed / l.duration);
      const s = l.start;
      const g = l.target;
      const c = l.cur;
      c.x = lerp(s.x, g.x, t);
      c.y = lerp(s.y, g.y, t);
      c.w = lerp(s.w, g.w, t);
      c.h = lerp(s.h, g.h, t);
      c.minDepth = lerp(s.minDepth, g.minDepth, t);
      c.maxDepth = lerp(s.maxDepth, g.maxDepth, t);
    }
  }

  isFinished(): boolean {
    for (let i = 0; i < this.count; i++) if (this.layers[i].duration > 0) return false;
    return true;
  }

  isSplitting(): boolean {
    let n = 0;
    for (let i = 0; i < this.count; i++) if (this.layers[i].cur.visible && ++n >= 2) return true;
    return false;
  }

  param(i: number): SplitParam {
    return this.layers[i].cur;
  }

  clear(): void {
    this.count = 0;
    this.cols = 0;
    this.rows = 0;
  }
}

export interface Rect4 {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rect4 = (): Rect4 => ({ x: 0, y: 0, w: 0, h: 0 });

export function viewportPx(p: SplitParam, W: number, H: number, out: Rect4): Rect4 {
  out.x = F(p.x * W);
  out.y = F(p.y * H);
  out.w = F(p.w * W);
  out.h = F(p.h * H);
  return out;
}

export function scissorPx(p: SplitParam, W: number, H: number, out: Rect4): Rect4 {
  out.x = Math.trunc(F(p.x * W));
  out.y = Math.trunc(F(p.y * H));
  out.w = Math.trunc(F(p.w * W));
  out.h = Math.trunc(F(p.h * H));
  return out;
}

export function viewportInt(vp: Rect4, out: Rect4): Rect4 {
  const x0 = Math.round(vp.x);
  const y0 = Math.round(vp.y);
  const x1 = Math.round(vp.x + vp.w);
  const y1 = Math.round(vp.y + vp.h);
  out.x = x0;
  out.y = y0;
  out.w = x1 - x0;
  out.h = y1 - y0;
  return out;
}

export function glViewportY(vp: Rect4, H: number): number {
  return F(H - F(vp.y + vp.h));
}

export function glScissorY(sc: Rect4, H: number): number {
  return H - sc.y - sc.h;
}

export function drawAspect(w: number, h: number, rtAspect: number = CORRECT_RT_ASPECT): number {
  return F(F(w / h) * F(rtAspect));
}

export interface PerspectiveFix {
  fovy: number;
  aspect: number;
  mode: number;
}

export const FIX_SKIP = 0;
export const FIX_KEEP = 1;
export const FIX_VERTICAL = 2;
export const FIX_HORIZONTAL = 3;

export function correctPerspective(fovy0: number, aspect0: number, w: number, h: number, out: PerspectiveFix, rtAspect: number = CORRECT_RT_ASPECT): PerspectiveFix {
  out.fovy = fovy0;
  out.aspect = aspect0;
  if (w < FLT_EPSILON || h < FLT_EPSILON) {
    out.mode = FIX_SKIP;
    return out;
  }
  const A = drawAspect(w, h, rtAspect);
  const A0 = F(aspect0);
  if (Math.abs(F(A0 - A)) < FLT_EPSILON) {
    out.mode = FIX_KEEP;
    return out;
  }
  out.aspect = A;
  if (A < A0) {
    out.mode = FIX_VERTICAL;
    return out;
  }
  const h0 = F(Math.atan(F(A0 * F(Math.tan(F(F(fovy0) * 0.5))))));
  out.fovy = F(2 * F(Math.atan(F(F(Math.tan(h0)) / A))));
  out.mode = FIX_HORIZONTAL;
  return out;
}

export interface FrustumFix {
  l: number;
  r: number;
  b: number;
  t: number;
  mode: number;
}

export function correctFrustum(l: number, r: number, b: number, t: number, w: number, h: number, out: FrustumFix, rtAspect: number = CORRECT_RT_ASPECT): FrustumFix {
  out.l = l;
  out.r = r;
  out.b = b;
  out.t = t;
  if (w < FLT_EPSILON || h < FLT_EPSILON) {
    out.mode = FIX_SKIP;
    return out;
  }
  const A = drawAspect(w, h, rtAspect);
  const cx = F(F(l + r) * 0.5);
  const cy = F(F(b + t) * 0.5);
  const hw = F(F(r - l) * 0.5);
  let hh = F(F(t - b) * 0.5);
  const A0 = F(hw / hh);
  if (A >= A0) {
    hh = F(hh * F(A0 / A));
    out.mode = FIX_HORIZONTAL;
  } else out.mode = FIX_VERTICAL;
  out.l = F(cx - F(A * hh));
  out.r = F(cx + F(A * hh));
  out.b = F(cy - hh);
  out.t = F(cy + hh);
  return out;
}

export interface Point2 {
  x: number;
  y: number;
}

export function ndcToLayout(u: number, v: number, p: Rect4 | SplitParam, out: Point2): Point2 {
  out.x = BASE_W * (p.x + ((u + 1) * p.w) / 2) - BASE_W / 2;
  out.y = BASE_H / 2 - BASE_H * (p.y + ((1 - v) * p.h) / 2);
  return out;
}

export function ndcToLayoutPx(u: number, v: number, sc: Rect4, W: number, H: number, out: Point2): Point2 {
  out.x = (BASE_W * (sc.x + ((u + 1) * sc.w) / 2)) / W - BASE_W / 2;
  out.y = BASE_H / 2 - (BASE_H * (sc.y + ((1 - v) * sc.h) / 2)) / H;
  return out;
}

export class LinePane {
  visible = false;
  x = 0;
  y = 0;
  length = 0.5;

  constructor(
    readonly name: string,
    readonly vertical: boolean,
  ) {
    this.length = vertical ? DIVIDING_LINES.vLength : DIVIDING_LINES.hLength;
  }

  get rotate(): number {
    return this.vertical ? DIVIDING_LINES.vRotate : DIVIDING_LINES.hRotate;
  }
}

export const LINE_HIDDEN = 0;
export const LINE_IN = 1;
export const LINE_NORMAL = 2;
export const LINE_OUT = 3;

class SegBuf {
  c: Float64Array;
  a0: Float64Array;
  a1: Float64Array;
  n = 0;

  constructor(cap: number) {
    this.c = new Float64Array(cap);
    this.a0 = new Float64Array(cap);
    this.a1 = new Float64Array(cap);
  }

  push(c: number, a0: number, a1: number): void {
    if (this.n >= this.c.length) {
      const g = (s: Float64Array): Float64Array => {
        const d = new Float64Array(s.length * 2);
        d.set(s);
        return d;
      };
      this.c = g(this.c);
      this.a0 = g(this.a0);
      this.a1 = g(this.a1);
    }
    const i = this.n++;
    this.c[i] = c;
    this.a0[i] = a0;
    this.a1[i] = a1;
  }

  sortMerge(): void {
    const { c, a0, a1 } = this;
    for (let i = 1; i < this.n; i++) {
      const kc = c[i];
      const k0 = a0[i];
      const k1 = a1[i];
      let j = i - 1;
      while (j >= 0 && (c[j] > kc + LINE_MERGE_EPS || (Math.abs(c[j] - kc) <= LINE_MERGE_EPS && a0[j] > k0))) {
        c[j + 1] = c[j];
        a0[j + 1] = a0[j];
        a1[j + 1] = a1[j];
        j--;
      }
      c[j + 1] = kc;
      a0[j + 1] = k0;
      a1[j + 1] = k1;
    }
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      if (m > 0 && Math.abs(c[m - 1] - c[i]) <= LINE_MERGE_EPS && a0[i] <= a1[m - 1] + LINE_MERGE_EPS) {
        if (a1[i] > a1[m - 1]) a1[m - 1] = a1[i];
        continue;
      }
      c[m] = c[i];
      a0[m] = a0[i];
      a1[m] = a1[i];
      m++;
    }
    this.n = m;
  }
}

const isInner = (v: number): boolean => v > 0 && v < 1;

export class DividingLines {
  readonly panes: LinePane[] = [];
  readonly vertical: LinePane[] = [];
  readonly horizontal: LinePane[] = [];
  state = LINE_HIDDEN;
  frame = 0;
  vCount = 0;
  hCount = 0;
  dropped = 0;
  private readonly v = new SegBuf(64);
  private readonly h = new SegBuf(64);

  constructor() {
    const n = DIVIDING_LINES.count;
    for (let i = 0; i < n; i++) this.vertical.push(new LinePane(`x_v_${String(i).padStart(2, '0')}`, true));
    for (let i = 0; i < n; i++) this.horizontal.push(new LinePane(`x_h_${String(i).padStart(2, '0')}`, false));
    this.panes.push(...this.vertical, ...this.horizontal);
  }

  in(immediate: boolean): void {
    this.state = immediate ? LINE_NORMAL : LINE_IN;
    this.frame = 0;
  }

  out(immediate: boolean): void {
    this.state = immediate ? LINE_HIDDEN : LINE_OUT;
    this.frame = 0;
  }

  advance(): void {
    if (this.state === LINE_IN) {
      this.frame += 1;
      if (this.frame >= DIVIDING_LINES.anim.in.frames) {
        this.state = LINE_NORMAL;
        this.frame = 0;
      }
    } else if (this.state === LINE_OUT) {
      this.frame += 1;
      if (this.frame >= DIVIDING_LINES.anim.out.frames) {
        this.state = LINE_HIDDEN;
        this.frame = 0;
      }
    }
  }

  get alpha(): number {
    switch (this.state) {
      case LINE_IN:
        return hermite(DIVIDING_LINES.anim.in.keys, this.frame);
      case LINE_NORMAL:
        return hermite(DIVIDING_LINES.anim.normal.keys, this.frame);
      case LINE_OUT:
        return hermite(DIVIDING_LINES.anim.out.keys, this.frame);
      default:
        return 0;
    }
  }

  get shown(): boolean {
    return this.state !== LINE_HIDDEN;
  }

  layout(list: SplitScreenLayerList): void {
    const v = this.v;
    const h = this.h;
    v.n = 0;
    h.n = 0;
    for (let i = 0; i < list.count; i++) {
      const p = list.layers[i].cur;
      const x1 = F(p.x + p.w);
      const y1 = F(p.y + p.h);
      if (p.h > 0) {
        if (isInner(p.x)) v.push(p.x, p.y, y1);
        if (isInner(x1)) v.push(x1, p.y, y1);
      }
      if (p.w > 0) {
        if (isInner(p.y)) h.push(p.y, p.x, x1);
        if (isInner(y1)) h.push(y1, p.x, x1);
      }
    }
    v.sortMerge();
    h.sortMerge();
    const n = DIVIDING_LINES.count;
    this.dropped = Math.max(0, v.n - n) + Math.max(0, h.n - n);
    this.vCount = Math.min(v.n, n);
    this.hCount = Math.min(h.n, n);
    for (let i = 0; i < n; i++) {
      const pv = this.vertical[i];
      pv.visible = i < this.vCount;
      if (pv.visible) {
        const y0 = BASE_H / 2 - BASE_H * v.a0[i];
        const y1 = BASE_H / 2 - BASE_H * v.a1[i];
        pv.x = -BASE_W / 2 + BASE_W * v.c[i];
        pv.y = (y0 + y1) / 2;
        pv.length = Math.abs(y0 - y1);
      }
      const ph = this.horizontal[i];
      ph.visible = i < this.hCount;
      if (ph.visible) {
        const x0 = -BASE_W / 2 + BASE_W * h.a0[i];
        const x1 = -BASE_W / 2 + BASE_W * h.a1[i];
        ph.y = BASE_H / 2 - BASE_H * h.c[i];
        ph.x = (x0 + x1) / 2;
        ph.length = Math.abs(x0 - x1);
      }
    }
  }
}

export class SplitScreen {
  readonly list = new SplitScreenLayerList();
  readonly lines = new DividingLines();
  splitting = false;
  started = 0;
  steps = 0;

  to(cols: number, rows: number, focus: number, sec: number): void {
    this.list.splitTo(cols, rows, focus, sec);
    if (sec > 0) this.started++;
  }

  step(dt: number = STEP_SEC): void {
    this.steps++;
    this.lines.advance();
    this.list.update(dt);
    const s = this.list.isSplitting();
    if (s !== this.splitting) {
      this.splitting = s;
      if (s) this.lines.in(false);
      else this.lines.out(false);
    }
    this.lines.layout(this.list);
  }

  finish(): void {
    if (this.list.count > 0) this.list.splitTo(this.list.cols, this.list.rows, 0, 0);
  }

  reset(): void {
    this.list.clear();
    this.splitting = false;
    this.lines.out(true);
    this.lines.layout(this.list);
  }
}
