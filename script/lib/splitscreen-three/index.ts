/**
 * 분할 화면 three 어댑터 — three 와 코어(../splitscreen)만 import. 계약: docs/engine/10_split_screen.md §9.3·§9.4·§9.6.
 *
 * - 한 번 갱신한 장면을 레이어(GraphicsLayer ID 순)마다 viewport/scissor·draw용 보정 카메라로 그린다. 원본 카메라는 바꾸지 않는다(복사 후 보정).
 * - clear 정책: 레이어를 그리기 전 출력 전체 color+depth 한 번(원본 layer0 = 씬 clear 값), 레이어 ≥1 은 clear 없음. 후처리는 RegionPost.render(region).
 * - canvas 출력은 three 가 pixelRatio 를 곱하므로 물리 픽셀을 (px + 0.25) / pixelRatio 로 넘긴다(DPR 한 번). RT 출력은 RT 필드에 물리 값.
 * - 그림자 맵은 프레임 첫 레이어에서만. 끝나면 target·viewport·scissor·scissor test·autoClear·그림자 갱신값·출력 RT 필드를 들어올 때 값으로 되돌린다.
 * - Stage3D.update 같은 장면 갱신은 부르지 않는다(호출자가 프레임마다 한 번). capture() = mg0122 캡처 RT 자리(복사 시점·포스트 포함은 §5 미확정).
 */
import * as THREE from 'three';
import {
  CORRECT_RT_ASPECT,
  correctFrustum,
  correctPerspective,
  FIX_HORIZONTAL,
  glScissorY,
  ndcToLayoutPx,
  rect4,
  scissorPx,
  viewportInt,
  viewportPx,
  type FrustumFix,
  type PerspectiveFix,
  type Point2,
  type Rect4,
  type SplitScreenLayerList,
} from '../splitscreen';

export interface PostRegion {
  target: THREE.WebGLRenderTarget | null;
  viewport: THREE.Vector4;
  scissor: THREE.Vector4;
}

export interface RegionPost {
  render(scene: THREE.Scene, camera: THREE.Camera, region?: PostRegion): void;
}

export interface SplitGl {
  autoClear: boolean;
  readonly shadowMap: { autoUpdate: boolean; needsUpdate: boolean };
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  setRenderTarget(t: THREE.WebGLRenderTarget | null): void;
  getViewport(out: THREE.Vector4): THREE.Vector4;
  setViewport(x: number | THREE.Vector4, y?: number, w?: number, h?: number): void;
  getScissor(out: THREE.Vector4): THREE.Vector4;
  setScissor(x: number | THREE.Vector4, y?: number, w?: number, h?: number): void;
  getScissorTest(): boolean;
  setScissorTest(on: boolean): void;
  getDrawingBufferSize(out: THREE.Vector2): THREE.Vector2;
  getPixelRatio(): number;
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
}

export interface SplitRenderOptions {
  post?: RegionPost | null;
  target?: THREE.WebGLRenderTarget | null;
  clear?: boolean;
  rtAspect?: number;
  enabled?: readonly boolean[];
}

export interface SplitCaptureRequest {
  layer: number;
  target: THREE.WebGLRenderTarget;
  type: number;
  flags: number;
  post?: boolean;
  onDone?(): void;
}

type DrawCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

const Q = 0.25;

export class SplitRenderer {
  readonly stats = { frames: 0, layers: 0, renders: 0, captures: 0 };
  W = 1;
  H = 1;
  private readonly persp: THREE.PerspectiveCamera[] = [];
  private readonly ortho: THREE.OrthographicCamera[] = [];
  private readonly used: (THREE.Camera | null)[] = [];
  private readonly scissors: Rect4[] = [];
  private readonly vp = rect4();
  private readonly vpi = rect4();
  private readonly pfix: PerspectiveFix = { fovy: 0, aspect: 1, mode: 0 };
  private readonly ffix: FrustumFix = { l: 0, r: 0, b: 0, t: 0, mode: 0 };
  private readonly region: PostRegion = { target: null, viewport: new THREE.Vector4(), scissor: new THREE.Vector4() };
  private readonly saveVp = new THREE.Vector4();
  private readonly saveSc = new THREE.Vector4();
  private readonly saveRtVp = new THREE.Vector4();
  private readonly saveRtSc = new THREE.Vector4();
  private readonly size = new THREE.Vector2();
  private readonly v3 = new THREE.Vector3();
  private readonly captures: SplitCaptureRequest[] = [];

  constructor(readonly gl: SplitGl) {}

  drawCamera(i: number): THREE.Camera | null {
    return this.used[i] ?? null;
  }

  scissor(i: number): Rect4 | null {
    return this.used[i] ? this.scissors[i] : null;
  }

  capture(req: SplitCaptureRequest): void {
    this.captures.push(req);
  }

  project(world: THREE.Vector3, i: number, out: Point2): Point2 | null {
    const cam = this.used[i];
    if (!cam) return null;
    this.v3.copy(world).project(cam);
    return ndcToLayoutPx(this.v3.x, this.v3.y, this.scissors[i], this.W, this.H, out);
  }

  private drawCam(i: number, src: THREE.Camera, w: number, h: number, rt: number): THREE.Camera {
    src.updateWorldMatrix(true, false);
    if ((src as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const s = src as THREE.PerspectiveCamera;
      let d = this.persp[i];
      if (!d) {
        d = this.persp[i] = new THREE.PerspectiveCamera();
        d.matrixAutoUpdate = false;
        d.matrixWorldAutoUpdate = false;
      }
      const f = correctPerspective(THREE.MathUtils.degToRad(s.fov), s.aspect, w, h, this.pfix, rt);
      d.fov = f.mode === FIX_HORIZONTAL ? THREE.MathUtils.radToDeg(f.fovy) : s.fov;
      d.aspect = f.aspect;
      d.near = s.near;
      d.far = s.far;
      d.zoom = s.zoom;
      d.focus = s.focus;
      d.filmGauge = s.filmGauge;
      d.filmOffset = s.filmOffset;
      d.view = s.view;
      return this.finish(d, s);
    }
    if ((src as THREE.OrthographicCamera).isOrthographicCamera) {
      const s = src as THREE.OrthographicCamera;
      let d = this.ortho[i];
      if (!d) {
        d = this.ortho[i] = new THREE.OrthographicCamera();
        d.matrixAutoUpdate = false;
        d.matrixWorldAutoUpdate = false;
      }
      const f = correctFrustum(s.left, s.right, s.bottom, s.top, w, h, this.ffix, rt);
      d.left = f.l;
      d.right = f.r;
      d.bottom = f.b;
      d.top = f.t;
      d.near = s.near;
      d.far = s.far;
      d.zoom = s.zoom;
      d.view = s.view;
      return this.finish(d, s);
    }
    return src;
  }

  private finish(d: DrawCamera, s: THREE.Camera): DrawCamera {
    d.updateProjectionMatrix();
    d.layers.mask = s.layers.mask;
    d.matrixWorld.copy(s.matrixWorld);
    d.matrixWorldInverse.copy(s.matrixWorldInverse);
    d.matrix.copy(s.matrixWorld);
    return d;
  }

  private applyRect(target: THREE.WebGLRenderTarget | null, vx: number, vy: number, vw: number, vh: number, sx: number, sy: number, sw: number, sh: number): void {
    const gl = this.gl;
    if (target) {
      target.viewport.set(vx, vy, vw, vh);
      target.scissor.set(sx, sy, sw, sh);
      target.scissorTest = true;
      gl.setRenderTarget(target);
      return;
    }
    gl.setRenderTarget(null);
    const pr = gl.getPixelRatio();
    gl.setViewport((vx + Q) / pr, (vy + Q) / pr, (vw + Q) / pr, (vh + Q) / pr);
    gl.setScissor((sx + Q) / pr, (sy + Q) / pr, (sw + Q) / pr, (sh + Q) / pr);
    gl.setScissorTest(true);
  }

  private clearAll(target: THREE.WebGLRenderTarget | null): void {
    const gl = this.gl;
    if (target) {
      target.viewport.set(0, 0, this.W, this.H);
      target.scissorTest = false;
      gl.setRenderTarget(target);
    } else {
      gl.setRenderTarget(null);
      const pr = gl.getPixelRatio();
      gl.setViewport(0, 0, (this.W + Q) / pr, (this.H + Q) / pr);
      gl.setScissorTest(false);
    }
    gl.clear(true, true, true);
  }

  render(scene: THREE.Scene, cameras: readonly (THREE.Camera | null | undefined)[], list: SplitScreenLayerList, o: SplitRenderOptions = {}): void {
    const gl = this.gl;
    const target = o.target ?? null;
    const post = o.post ?? null;
    const rt = o.rtAspect ?? CORRECT_RT_ASPECT;
    const prevTarget = gl.getRenderTarget();
    gl.getViewport(this.saveVp);
    gl.getScissor(this.saveSc);
    const prevTest = gl.getScissorTest();
    const prevAuto = gl.autoClear;
    const sm = gl.shadowMap;
    const prevSmAuto = sm.autoUpdate;
    const prevSmNeeds = sm.needsUpdate;
    let prevRtTest = false;
    if (target) {
      this.saveRtVp.copy(target.viewport);
      this.saveRtSc.copy(target.scissor);
      prevRtTest = target.scissorTest;
    }
    try {
      if (target) {
        this.W = target.width;
        this.H = target.height;
      } else {
        gl.getDrawingBufferSize(this.size);
        this.W = this.size.x;
        this.H = this.size.y;
      }
      this.stats.frames++;
      const n = list.count;
      for (let i = 0; i < this.used.length; i++) this.used[i] = null;
      if (n === 0) {
        const cam = cameras[0];
        if (!cam) return;
        if (post) {
          if (target) {
            this.region.target = target;
            this.region.viewport.set(0, 0, this.W, this.H);
            this.region.scissor.set(0, 0, this.W, this.H);
            post.render(scene, cam, this.region);
          } else post.render(scene, cam);
        } else {
          gl.setRenderTarget(target);
          gl.render(scene, cam);
        }
        this.stats.renders++;
        return;
      }
      if (o.clear !== false) this.clearAll(target);
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        const p = list.layers[i].cur;
        const on = p.autoEnable ? p.w > 0 && p.h > 0 : (o.enabled?.[i] ?? true);
        if (!on) continue;
        const src = cameras[p.id];
        if (!src) continue;
        const cam = this.drawCam(i, src, p.w, p.h, rt);
        while (this.used.length <= i) this.used.push(null);
        while (this.scissors.length <= i) this.scissors.push(rect4());
        this.used[i] = cam;
        const sc = scissorPx(p, this.W, this.H, this.scissors[i]);
        const vi = viewportInt(viewportPx(p, this.W, this.H, this.vp), this.vpi);
        const vy = this.H - vi.y - vi.h;
        const sy = glScissorY(sc, this.H);
        if (drawn > 0) {
          sm.autoUpdate = false;
          sm.needsUpdate = false;
        }
        if (post) {
          this.region.target = target;
          this.region.viewport.set(vi.x, vy, vi.w, vi.h);
          this.region.scissor.set(sc.x, sy, sc.w, sc.h);
          post.render(scene, cam, this.region);
        } else {
          this.applyRect(target, vi.x, vy, vi.w, vi.h, sc.x, sy, sc.w, sc.h);
          gl.autoClear = false;
          gl.render(scene, cam);
        }
        drawn++;
        this.stats.renders++;
      }
      this.stats.layers = drawn;
      if (this.captures.length) this.runCaptures(scene, post);
    } finally {
      gl.autoClear = prevAuto;
      sm.autoUpdate = prevSmAuto;
      sm.needsUpdate = prevSmNeeds;
      if (target) {
        target.viewport.copy(this.saveRtVp);
        target.scissor.copy(this.saveRtSc);
        target.scissorTest = prevRtTest;
      }
      gl.setRenderTarget(null);
      gl.setViewport(this.saveVp);
      gl.setScissor(this.saveSc);
      gl.setScissorTest(prevTest);
      gl.setRenderTarget(prevTarget);
    }
  }

  private runCaptures(scene: THREE.Scene, post: RegionPost | null): void {
    const gl = this.gl;
    for (const c of this.captures) {
      const cam = this.used[c.layer];
      if (cam) {
        const t = c.target;
        t.viewport.set(0, 0, t.width, t.height);
        t.scissor.set(0, 0, t.width, t.height);
        t.scissorTest = false;
        if (c.post && post) {
          this.region.target = t;
          this.region.viewport.set(0, 0, t.width, t.height);
          this.region.scissor.set(0, 0, t.width, t.height);
          post.render(scene, cam, this.region);
        } else {
          gl.setRenderTarget(t);
          gl.clear(true, true, true);
          gl.autoClear = false;
          gl.render(scene, cam);
        }
        this.stats.captures++;
      }
      c.onDone?.();
    }
    this.captures.length = 0;
  }

  dispose(): void {
    this.persp.length = 0;
    this.ortho.length = 0;
    this.used.length = 0;
    this.captures.length = 0;
  }
}
