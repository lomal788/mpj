import type * as THREE from 'three';
import { PostChain as CommonPostChain, type PostParams } from '@app/common/render3d/post';

export type PostPreset = 'post' | 'post_result00';

const BASE: PostParams = {
  exposure: 1,
  exposureOffset: 0,
  outputScale: 1,
  bloom: true,
  bloomThreshold: 1,
  bloomIntensity: 1,
  bloomSpread: 1,
  bloomClip: 100,
  dof: true,
  dofFocalDistance: 17,
  dofFocalRegion: 25,
  dofNearTransition: 0,
  dofFarTransition: 7,
  fxaa: true,
  fxaaEdgeThreshold: 0.166,
  fxaaEdgeThresholdMin: 0.0833,
  fxaaSubPixel: 0.75,
};

/** posteffect_* 재질 값 [데이터] */
export const POST_PRESETS: Record<PostPreset, PostParams> = {
  post: BASE,
  post_result00: { ...BASE, bloomClip: 1000, dofFocalDistance: 20, dofFocalRegion: 30, dofFarTransition: 15 },
};

export class PostChain extends CommonPostChain {
  constructor(gl: THREE.WebGLRenderer) {
    super(gl, POST_PRESETS.post, null, { mode: 'neutralBloomApprox', fxaaDigits: 4 });
  }

  /** 원본 MapImpl::ReceiveState(0,6): post00 엔티티를 지우고 post_result00 을 새로 만든다 */
  setPreset(name: PostPreset): void {
    this.configure(POST_PRESETS[name]);
  }
}
