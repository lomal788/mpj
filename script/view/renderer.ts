/**
 * 렌더러 — 제품은 앱 RenderService의 WebGLRenderer를 빌린다. 서비스가 없는 단독 도구는 자체 생성한다.
 * 원본 기준 해상도는 1920×1080(boot.nbinit BaseWidth/Height) [데이터]. 캔버스 내부 해상도는 SCREEN_W×SCREEN_H 비율(16:9)을 지키고,
 * 실제 픽셀 수는 표시 크기 × devicePixelRatio 로 맞춘다.
 * 게임 화면이 포스트 체인(PostRenderer)을 걸면 render() 가 그 체인으로 그린다(HDR 타깃 → 블룸·톤맵 등). 끝나면 null 로 푼다.
 */
import * as THREE from 'three';
import type { RenderLease, RenderService } from '@app/common/render/service';
import type { UploadRecord } from '@game/lib/assetcore-three';

export const SCREEN_W = 1920;
export const SCREEN_H = 1080;

/** 장면을 받아 화면까지 그리는 포스트 체인 */
export interface PostRenderer {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}

export class Renderer {
  private readonly owned: THREE.WebGLRenderer | null;
  private lease_: RenderLease | null = null;
  get gl(): THREE.WebGLRenderer { return this.service?.renderer ?? this.owned!; }
  get lease(): RenderLease | null { return this.lease_; }
  get active(): boolean { return this.service ? !!this.lease_?.valid : true; }
  get uploads(): UploadRecord | undefined { return this.lease_?.valid ? this.lease_.uploads : undefined; }
  private post: PostRenderer | null = null;

  constructor(readonly canvas: HTMLCanvasElement, private readonly service?: RenderService) {
    this.owned = service ? null : new THREE.WebGLRenderer({ canvas, antialias: true });
    if (service) return;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.setClearColor(0x404040, 1);
    this.resize();
  }

  async activate(host: HTMLElement): Promise<RenderLease | null> {
    if (!this.service) return null;
    const lease = await this.service.acquire('game');
    this.lease_ = lease;
    lease.attach(host); this.resize();
    return lease;
  }

  release(lease = this.lease_): void {
    if (!lease || this.lease_ !== lease) return;
    this.post = null; this.lease_ = null; lease.release();
  }

  /** 표시 크기가 바뀌면 부른다 */
  resize(): void {
    if (!this.active) return;
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, Math.round((w * SCREEN_H) / SCREEN_W));
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (this.lease_) { this.lease_.resize(w, h, ratio); return; }
    this.gl.setPixelRatio(ratio);
    this.gl.setSize(w, h, false);
  }

  get aspect(): number {
    return SCREEN_W / SCREEN_H;
  }

  clear(): void {
    if (this.active) this.gl.clear();
  }

  setPost(post: PostRenderer | null): void {
    this.post = post;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.active) return;
    if (this.post) this.post.render(scene, camera);
    else this.gl.render(scene, camera);
  }

  dispose(): void {
    if (this.service) this.release();
    else this.gl.dispose();
  }
}
