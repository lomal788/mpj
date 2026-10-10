import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { PostChain, type PostParams } from '@app/common/render3d/post';
import { MaterialSetup } from '@app/common/render3d/material';
import type { Fres } from '@app/common/render3d/types';
import { PostChain as GamePost, POST_PRESETS } from '@app/minigame/mg1801/view/post';
import { MaterialSetup as GameMaterials } from '@app/minigame/mg1801/view/material';
import { Water } from '@app/minigame/mg1801/view/water';
import type { Assets } from '../script/view/assets';

export const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class RenderProbe {
  autoClear = true;
  autoClearColor = true;
  autoClearDepth = true;
  autoClearStencil = true;
  toneMapping: THREE.ToneMapping = THREE.ACESFilmicToneMapping;
  toneMappingExposure = 1.7;
  outputColorSpace = THREE.SRGBColorSpace;
  width = 1920;
  height = 1080;
  target: THREE.WebGLRenderTarget | null = null;
  color = new THREE.Color(0.2, 0.3, 0.4);
  alpha = 0.7;
  readonly rows: unknown[] = [];
  readonly targets = new Map<THREE.WebGLRenderTarget, number>();
  readonly textures = new Map<THREE.Texture, string>();
  readonly materials = new Set<THREE.Material>();
  readonly gl = this as unknown as THREE.WebGLRenderer;
  private readonly viewport = new THREE.Vector4(0, 0, 1920, 1080);
  private readonly scissor = new THREE.Vector4(0, 0, 1920, 1080);
  private scissorTest = false;
  getViewport(v: THREE.Vector4): THREE.Vector4 { return v.copy(this.viewport); }
  setViewport(x: number | THREE.Vector4, y?: number, w?: number, h?: number): void { if (typeof x === 'number') this.viewport.set(x, y!, w!, h!); else this.viewport.copy(x); }
  getScissor(v: THREE.Vector4): THREE.Vector4 { return v.copy(this.scissor); }
  setScissor(x: number | THREE.Vector4, y?: number, w?: number, h?: number): void { if (typeof x === 'number') this.scissor.set(x, y!, w!, h!); else this.scissor.copy(x); }
  getScissorTest(): boolean { return this.scissorTest; }
  setScissorTest(on: boolean): void { this.scissorTest = on; }
  getPixelRatio(): number { return 1; }
  getDrawingBufferSize(v: THREE.Vector2): THREE.Vector2 { return v.set(this.width, this.height); }
  getRenderTarget(): THREE.WebGLRenderTarget | null { return this.target; }
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void {
    this.target = target;
    if (target && !this.targets.has(target)) {
      const id = this.targets.size + 1;
      this.targets.set(target, id);
      this.textures.set(target.texture, `target${id}`);
      if (target.depthTexture) this.textures.set(target.depthTexture, `depth${id}`);
    }
  }
  getClearColor(c: THREE.Color): THREE.Color { return c.copy(this.color); }
  getClearAlpha(): number { return this.alpha; }
  setClearColor(c: THREE.Color, alpha = 1): void { this.color.copy(c); this.alpha = alpha; }
  compile(): void {}
  compileAsync(): Promise<void> { return Promise.resolve(); }
  clear(): void { this.rows.push(['clear', this.targets.get(this.target!) ?? 0]); }
  value(v: unknown): unknown {
    if ((v as THREE.Texture | null)?.isTexture) return this.textures.get(v as THREE.Texture) ?? (v as THREE.Texture).name;
    if (v && typeof (v as THREE.Vector2).toArray === 'function') return (v as THREE.Vector2).toArray();
    if (Array.isArray(v)) return v.map((x) => this.value(x));
    return v;
  }
  render(obj: THREE.Object3D): void {
    const material = (obj as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (material) this.materials.add(material);
    const target = this.target;
    this.rows.push({
      target: target ? [this.targets.get(target), target.width, target.height, target.texture.type, target.depthBuffer, !!target.depthTexture] : null,
      shader: material ? [digest(material.vertexShader), digest(material.fragmentShader), material.defines, material.blending] : 'scene',
      uniforms: material ? Object.fromEntries(Object.entries(material.uniforms).map(([k, u]) => [k, this.value(u.value)])) : {},
      tone: this.toneMapping, exposure: this.toneMappingExposure, autoClear: this.autoClear,
    });
  }
}

export const plazaParams = (): PostParams => JSON.parse(readFileSync(resolve('assets/plaza/world/manifest.json'), 'utf8')).env.post;

const texture = (name: string): THREE.Texture => { const t = new THREE.Texture(); t.name = name; return t; };

function shaderState(m: THREE.MeshStandardMaterial): unknown {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms) };
  m.onBeforeCompile(shader as Parameters<typeof m.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
  const probe = new RenderProbe();
  return {
    vertex: digest(shader.vertexShader), fragment: digest(shader.fragmentShader),
    uniforms: Object.fromEntries(Object.entries(shader.uniforms).filter(([k]) => k.startsWith('mpj')).map(([k, u]) => [k, probe.value(u.value)])),
    color: m.color.toArray(), roughness: m.roughness, metalness: m.metalness, fog: m.fog,
    light: [m.lightMap?.name, m.lightMap?.channel, m.lightMapIntensity], env: [m.envMap?.name, m.envMapIntensity],
    blend: [m.transparent, m.depthWrite, m.blending, m.blendSrc, m.blendDst],
  };
}

export async function renderCommonSnapshot(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const name of ['plaza', 'game'] as const) {
    for (const size of [[1920, 1080], [853, 479], [1, 1]]) {
      for (const fxaa of [false, true]) {
        const gl = new RenderProbe();
        gl.width = size[0]; gl.height = size[1];
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(20, 16 / 9, 0.1, 10000);
        if (name === 'plaza') {
          const post = new PostChain(gl.gl, { ...plazaParams(), fxaa }, texture('lut'));
          post.render(scene, camera);
          post.dispose();
        } else {
          const before = POST_PRESETS.post.fxaa;
          const beforeResult = POST_PRESETS.post_result00.fxaa;
          POST_PRESETS.post.fxaa = fxaa; POST_PRESETS.post_result00.fxaa = fxaa;
          const post = new GamePost(gl.gl);
          post.render(scene, camera);
          post.setPreset('post_result00'); post.render(scene, camera);
          gl.width = 640; gl.height = 360; post.render(scene, camera);
          post.render(scene, new THREE.OrthographicCamera());
          post.dispose();
          POST_PRESETS.post.fxaa = before; POST_PRESETS.post_result00.fxaa = beforeResult;
        }
        result[`${name}/${size.join('x')}/fxaa=${fxaa}`] = digest([gl.rows, gl.toneMapping, gl.toneMappingExposure, gl.autoClear, gl.color.toArray(), gl.alpha]);
      }
    }
  }
  const assets = { url: (p: string) => p, json: async (p: string) => JSON.parse(readFileSync(resolve('assets/mg1801', p), 'utf8')) } as unknown as Assets;
  const gameMats = new GameMaterials(assets, new RenderProbe().gl);
  const commonMats = new MaterialSetup(assets, new RenderProbe().gl, {});
  for (const mats of [gameMats, commonMats]) {
    mats.common = { rad: texture('commonRad'), irr: Object.assign(new THREE.CubeTexture(), { name: 'commonIrr' }) };
    mats.chara = { rad: texture('charaRad'), irr: Object.assign(new THREE.CubeTexture(), { name: 'charaIrr' }) };
    const textures = new Map<string, THREE.Texture>();
    mats.texture = async (name) => { if (!textures.has(name)) textures.set(name, texture(name)); return textures.get(name)!; };
    mats.localRad = async (name) => texture(name);
  }
  for (const file of readdirSync(resolve('assets/mg1801/model')).filter((f) => f.endsWith('.glb')).sort()) {
    const b = readFileSync(resolve('assets/mg1801/model', file));
    const data = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) as { materials: { name: string; extras?: { fres?: Fres } }[] };
    for (const [i, src] of (data.materials ?? []).entries()) {
      if (!src.extras?.fres) continue;
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.4, 0.5) });
      m.name = src.name; m.userData.fres = structuredClone(src.extras.fres);
      m.customProgramCacheKey = () => 'fixture';
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
      await gameMats.prepare(mesh); await gameMats.prepare(mesh);
      result[`material/${file}/${i}`] = digest([shaderState(m), mesh.castShadow, mesh.receiveShadow]);
      if (file === 'mg1801_water00.glb' && m.name === 'mt_water00') {
        const water = new Water();
        await water.setup(mesh, assets, gameMats);
        for (const frame of [0, 60, 300, 1199, 1200, 3600]) {
          water.update(frame);
          result[`water/${frame}`] = digest(shaderState(mesh.material));
        }
      }
    }
  }
  for (const mode of ['water', 'refraction', 'sss', 'unlit', 'additive'] as const) {
    const options: Record<string, string> = { static_opt_directional_lighting_enable: '0', static_opt_water_enable: mode === 'water' ? '1' : '0', static_opt_water_muddy_enable: '1', static_opt_refraction_enable: mode === 'refraction' ? '1' : '0', static_opt_shading_type: mode === 'sss' ? '2' : mode === 'unlit' ? '0' : '1', static_opt_state_type: mode === 'additive' ? '2' : '0' };
    const m = new THREE.MeshStandardMaterial(); m.customProgramCacheKey = () => 'fixture';
    m.userData.fres = { shader: { options }, params: { material_water_opacity: { value: 0.2 }, material_water_muddy_color: { value: [0.2, 0.3, 0.4] }, material_water_muddy_range: { value: 3 } }, samplers: [{ texture: 'curvature', slots: ['sss_curvature_texture2d'] }, { texture: 'diffusion', slots: ['sss_diffusion_map_texture2d'] }] };
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
    await commonMats.prepare(mesh);
    result[`common/${mode}`] = digest(shaderState(mesh.material));
  }
  gameMats.dispose(); commonMats.dispose();
  return result;
}
