import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { P0, type AssetManager } from '@game/lib/assetcore';
import { ScenePreparer } from '@game/lib/assetcore-three';
import type { UiImage } from '@app/common/render3d/assetLoader';

export interface AssetRuntime {
  manager: AssetManager;
  root: string;
}

/** (읽은 수, 전체, 지금 항목) */
export type Progress = (n: number, total: number, label: string) => void;
let nextOwner = 0;

export class Assets {
  readonly owner = `game-assets:${++nextOwner}`;
  private readonly copies = new Map<string, Promise<unknown>>();
  private readonly children: Assets[] = [];
  private readonly owned = new Set<{ dispose(): void }>();
  private readonly geometry = new Set<THREE.BufferGeometry>();
  private readonly models = new Set<THREE.Object3D>();
  private readonly preparing = new Set<ScenePreparer>();
  private closed = false;

  /** dir: ASSETS 기준 게임 폴더(끝에 '/') */
  constructor(readonly dir: string, private readonly runtime: AssetRuntime) {}

  get disposed(): boolean { return this.closed; }

  url(path: string): string { return new URL(this.dir + path, this.runtime.root).href; }

  key(path: string): string {
    const url = this.url(path), root = new URL(this.runtime.root).href;
    if (!root.endsWith('/') || !url.startsWith(root)) throw new Error(`Asset outside root: ${url}`);
    return decodeURIComponent(url.slice(root.length));
  }

  private alive(): void { if (this.closed) throw new Error(`Assets disposed: ${this.dir}`); }

  private get<T>(path: string, kind: string, pri: number): Promise<T> {
    this.alive();
    const key = this.key(path);
    this.runtime.manager.resetFailed(key);
    return this.runtime.manager.get<T>(key, kind, pri, this.owner).then(value => { this.alive(); return value; });
  }

  private copy<T>(path: string, kind: string, pri: number, make: (value: T) => T): Promise<T> {
    this.alive();
    const key = this.key(path), id = `${kind}:${key}`;
    this.runtime.manager.raise(key, pri);
    let p = this.copies.get(id) as Promise<T> | undefined;
    if (!p) {
      p = this.get<T>(path, kind, pri).then(value => { this.alive(); return make(value); });
      this.copies.set(id, p);
    }
    return p;
  }

  json<T>(path: string, pri = P0): Promise<T> { return this.copy<T>(path, 'json', pri, value => structuredClone(value)); }
  bytes(path: string, pri = P0): Promise<ArrayBuffer> { return this.get<ArrayBuffer>(path, 'bytes', pri).then(value => value.slice(0)); }
  image(path: string, pri = P0): Promise<UiImage> { return this.get<UiImage>(path, 'uiimage', pri); }

  texture(path: string, pri = P0): Promise<THREE.Texture> {
    return this.copy<THREE.Texture>(path, 'texture', pri, value => {
      const copy = value.clone(); this.owned.add(copy); return copy;
    });
  }

  gltf(path: string, pri = P0): Promise<GLTF> {
    return this.copy<GLTF>(path, 'gltf', pri, value => {
      const textures = new Map<THREE.Texture, THREE.Texture>(), materials = new Map<THREE.Material, THREE.Material>();
      const tex = (t: THREE.Texture): THREE.Texture => {
        let c = textures.get(t);
        if (!c) { c = t.clone(); textures.set(t, c); this.owned.add(c); }
        return c;
      };
      const mat = (m: THREE.Material): THREE.Material => {
        let c = materials.get(m);
        if (!c) {
          c = m.clone(); materials.set(m, c); this.owned.add(c);
          const dst = c as unknown as Record<string, unknown>;
          for (const [k, v] of Object.entries(m)) if (v instanceof THREE.Texture) dst[k] = tex(v);
          const uniforms = (m as THREE.ShaderMaterial).uniforms;
          if (uniforms) for (const [k, u] of Object.entries(uniforms)) {
            if (u.value instanceof THREE.Texture) (c as THREE.ShaderMaterial).uniforms[k].value = tex(u.value);
          }
        }
        return c;
      };
      const scenes = new Map<THREE.Group, THREE.Group>();
      const root = (source: THREE.Group): THREE.Group => {
        let c = scenes.get(source);
        if (!c) {
          c = cloneSkinned(source) as THREE.Group; scenes.set(source, c); this.models.add(c);
          c.traverse(o => {
            const mesh = o as THREE.Mesh;
            if (mesh.geometry) this.geometry.add(mesh.geometry);
            if (mesh.material) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(mat) : mat(mesh.material);
            const skeleton = (o as THREE.SkinnedMesh).skeleton;
            if (skeleton) this.owned.add(skeleton);
          });
        }
        return c;
      };
      return { ...value, scene: root(value.scene), scenes: value.scenes.map(root), animations: value.animations.map(clip => clip.clone()) };
    });
  }

  /** 하위 폴더(공용 캐릭터 등) */
  sub(dir: string): Assets {
    this.alive();
    const child = new Assets(dir, this.runtime); this.children.push(child); return child;
  }

  preserve(seen: Set<object>): void {
    for (const geometry of this.geometry) seen.add(geometry);
    for (const child of this.children) child.preserve(seen);
  }

  roots(): THREE.Object3D[] { return [...this.models, ...this.children.flatMap(child => child.roots())]; }

  async prepare(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, linear: boolean, gpu: { uploads?: import('@game/lib/assetcore-three').UploadRecord; offscreen?: boolean; valid?(): boolean } = {}): Promise<void> {
    this.alive();
    const group = new THREE.Group(); group.visible = false;
    for (const root of this.roots()) if (!root.parent) group.add(root);
    scene.add(group);
    const preparer = new ScenePreparer({ scene, camera: () => camera, renderer, scheduler: this.runtime.manager.scheduler, linear: () => linear, ...gpu });
    this.preparing.add(preparer);
    try {
      await preparer.prepare(scene, P0).promise; this.alive();
      if (gpu.valid && !gpu.valid()) throw new Error('Render preparation expired');
    }
    finally { preparer.dispose(); this.preparing.delete(preparer); group.removeFromParent(); group.clear(); }
  }

  /** 장면 복제 자원을 풀고 관리자 참조를 놓는다. 아직 읽는 중인 요청은 해제 뒤 복제하지 않는다 */
  dispose(seen: Set<object> = new Set()): void {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.preparing) p.dispose(); this.preparing.clear();
    for (const child of this.children) child.dispose(seen); this.children.length = 0;
    for (const resource of this.owned) if (!seen.has(resource)) { seen.add(resource); resource.dispose(); }
    this.owned.clear(); this.copies.clear(); this.models.clear(); this.geometry.clear();
    this.runtime.manager.release(this.owner);
  }
}
