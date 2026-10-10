export type CameraVector = readonly [number, number, number];
export type CameraMatrix = readonly number[];

export interface CameraNumericOps {
  sinCos(radians: number): readonly [number, number];
  sqrt(value: number): number;
}

export interface CameraProjection {
  type: 'perspective' | 'orthographic';
  fovy: number;
  aspect: number;
  near: number;
  far: number;
}

export interface CameraSample {
  pos: CameraVector;
  rotOrAim: CameraVector;
  mode: 'Aim' | 'EulerZXY';
  twist: number;
  projection: CameraProjection;
}

export interface CameraSnapshot {
  position: CameraVector;
  right: CameraVector;
  up: CameraVector;
  back: CameraVector;
  focus: number;
  projection: CameraProjection;
}

export interface CameraPass {
  applyAspect?: boolean;
  applyNearFar?: boolean;
}

const cross = (a: CameraVector, b: CameraVector): CameraVector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (v: CameraVector, ops: CameraNumericOps): number => ops.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const unit = (v: CameraVector, ops: CameraNumericOps): CameraVector => {
  const n = length(v, ops);
  if (!(n > 0)) throw new Error('camera: zero direction');
  return [v[0] / n, v[1] / n, v[2] / n];
};
const transform = (m: CameraMatrix, v: CameraVector, w: number): CameraVector => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * w,
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * w,
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * w,
];

export function cameraSnapshot(sample: CameraSample, current: CameraProjection, ops: CameraNumericOps, pass: CameraPass = {}, entityWorld?: CameraMatrix): CameraSnapshot {
  const projection = {
    ...sample.projection,
    aspect: pass.applyAspect ? sample.projection.aspect : current.aspect,
    near: pass.applyNearFar === false ? current.near : sample.projection.near,
    far: pass.applyNearFar === false ? current.far : sample.projection.far,
  };
  if (!['perspective', 'orthographic'].includes(projection.type)) throw new Error('camera: unsupported projection');
  if (!(projection.aspect > 0 && projection.fovy > 0 && projection.near >= 0 && projection.far > projection.near)) throw new Error('camera: invalid projection');
  if (projection.type === 'perspective' && !(projection.near > 0 && projection.fovy < Math.PI)) throw new Error('camera: invalid perspective');
  let right: CameraVector, up: CameraVector, back: CameraVector, focus: number;
  if (sample.mode === 'Aim') {
    const d: CameraVector = [sample.pos[0] - sample.rotOrAim[0], sample.pos[1] - sample.rotOrAim[1], sample.pos[2] - sample.rotOrAim[2]];
    focus = length(d, ops);
    if (focus === 0) throw new Error('camera: coincident eye and aim is unsupported');
    if (d[0] === 0 && d[2] === 0) {
      right = [1, 0, 0];
      up = [0, 0, d[1] > 0 ? -1 : 1];
      back = [0, d[1] > 0 ? 1 : -1, 0];
    } else {
      back = unit(d, ops);
      const r = unit([d[2], 0, -d[0]], ops), u = cross(back, r);
      const [s, c] = ops.sinCos(sample.twist);
      right = [c * r[0] + s * u[0], c * r[1] + s * u[1], c * r[2] + s * u[2]];
      up = [-s * r[0] + c * u[0], -s * r[1] + c * u[1], -s * r[2] + c * u[2]];
    }
  } else if (sample.mode === 'EulerZXY') {
    const [sx, cx] = ops.sinCos(sample.rotOrAim[0]), [sy, cy] = ops.sinCos(sample.rotOrAim[1]), [sz, cz] = ops.sinCos(sample.rotOrAim[2]);
    right = [cy * cz + sy * sx * sz, cx * sz, -sy * cz + cy * sx * sz];
    up = [-cy * sz + sy * sx * cz, cx * cz, sy * sz + cy * sx * cz];
    back = [sy * cx, -sx, cy * cx];
    focus = -1;
  } else throw new Error('camera: unsupported rotation mode');
  let position: CameraVector = [...sample.pos];
  if (entityWorld) {
    if (entityWorld.length !== 16) throw new Error('camera: expected column-major world matrix');
    position = transform(entityWorld, position, 1);
    right = transform(entityWorld, right, 0);
    up = transform(entityWorld, up, 0);
    back = transform(entityWorld, back, 0);
  }
  return { position, right, up, back, focus, projection };
}

export interface BakedCameraClip {
  name?: string;
  frames: number;
  loop?: boolean;
  mode: string;
  pos: number[][];
  rotOrAim: number[][];
  twist: number[];
  fovyRad: number[];
  near: number[];
  far: number[];
}

export function sampleBakedApprox(clip: BakedCameraClip, frame: number): CameraSample {
  const i = Math.max(0, Math.min(clip.pos.length - 1, Math.floor(frame)));
  const p = clip.pos[i], r = clip.rotOrAim[i];
  if (!p || !r) throw new Error('camera: empty baked sample');
  if (clip.mode !== 'Aim' && clip.mode !== 'EulerZXY') throw new Error(`camera: unsupported baked mode ${clip.mode}`);
  return {
    pos: [p[0], p[1], p[2]], rotOrAim: [r[0], r[1], r[2]], mode: clip.mode,
    twist: clip.twist[i] ?? 0,
    projection: { type: 'perspective', fovy: clip.fovyRad[i], near: clip.near[i], far: clip.far[i], aspect: 1 },
  };
}

export class BakedCameraPlayerApprox {
  private currentFrame: number;
  private playbackSpeed: number;
  playing = true;
  stopped = false;

  constructor(readonly frames: number, readonly loop = false, startFrame = 0, speed = 1) {
    if (!(Number.isFinite(frames) && frames >= 0)) throw new Error('camera: invalid duration');
    this.currentFrame = Math.fround(startFrame);
    this.playbackSpeed = Math.fround(speed);
  }

  get frame(): number { return this.currentFrame; }
  set frame(value: number) { this.currentFrame = Math.fround(value); }
  get speed(): number { return this.playbackSpeed; }
  set speed(value: number) { this.playbackSpeed = Math.fround(value); }
  get finished(): boolean { return !this.loop && this.frame >= this.frames; }
  stop(): void { this.stopped = true; }

  step(frames = 1): boolean {
    if (this.stopped) return false;
    if (this.playing) {
      const f = Math.fround(this.frame + Math.fround(Math.fround(frames) * this.speed));
      this.frame = this.loop && this.frames > 0 ? ((f % this.frames) + this.frames) % this.frames : Math.max(0, Math.min(f, this.frames));
    }
    return true;
  }
}
