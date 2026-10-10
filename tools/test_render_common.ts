import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PostChain } from '@app/common/render3d/post';
import { MaterialSetup } from '@app/common/render3d/material';
import { PostChain as GamePost, POST_PRESETS } from '@app/minigame/mg1801/view/post';
import { MaterialSetup as GameMaterials } from '@app/minigame/mg1801/view/material';
import { RenderProbe, renderCommonSnapshot, plazaParams } from './render_common_fixture';

let passed = 0;
const test = async (name: string, run: () => unknown | Promise<unknown>): Promise<void> => {
  await run(); passed++; console.log(`통과: ${name}`);
};

const expected = JSON.parse(readFileSync(new URL('./render_common_golden.json', import.meta.url), 'utf8')) as { source: string; cases: Record<string, string> };
const actual = await renderCommonSnapshot();
assert.deepEqual(Object.keys(actual), Object.keys(expected.cases));
for (const [name, hash] of Object.entries(expected.cases)) await test(`통합 전 ${expected.source}: ${name}`, () => assert.equal(actual[name], hash));

await test('게임 어댑터는 공용 후처리·재질을 사용', () => {
  assert.equal(Object.getPrototypeOf(GamePost.prototype), PostChain.prototype);
  assert.equal(Object.getPrototypeOf(GameMaterials.prototype), MaterialSetup.prototype);
});

await test('프리셋 전환이 다른 인스턴스와 상수에 영향을 주지 않음', () => {
  const before = JSON.stringify(POST_PRESETS);
  const ga = new RenderProbe(), gb = new RenderProbe();
  const a = new GamePost(ga.gl), b = new GamePost(gb.gl);
  a.setPreset('post_result00');
  a.render(new THREE.Scene(), new THREE.PerspectiveCamera());
  b.render(new THREE.Scene(), new THREE.PerspectiveCamera());
  const focal = (g: RenderProbe): number[] => [...g.materials].filter((m) => (m as THREE.ShaderMaterial).uniforms?.focalEnd).map((m) => (m as THREE.ShaderMaterial).uniforms.focalEnd.value as number);
  assert.deepEqual(focal(ga), [50]); assert.deepEqual(focal(gb), [42]);
  assert.equal(JSON.stringify(POST_PRESETS), before);
  a.dispose(); b.dispose();
});

await test('근사 블룸 비활성화·DOF 켜기·끄기와 렌더러 복원', () => {
  const g = new RenderProbe();
  const p = new PostChain(g.gl, { ...POST_PRESETS.post, dof: false }, null, { mode: 'neutralBloomApprox', fxaaDigits: 4 });
  p.set({ bloom: false });
  p.render(new THREE.Scene(), new THREE.PerspectiveCamera());
  assert.equal(g.materials.size, 2);
  p.configure({ ...POST_PRESETS.post, bloom: false });
  p.render(new THREE.Scene(), new THREE.PerspectiveCamera());
  assert.equal(g.materials.size, 3);
  assert.ok([...g.targets.keys()].some((t) => t.depthTexture));
  p.dispose();
  assert.equal(g.toneMapping, THREE.ACESFilmicToneMapping); assert.equal(g.toneMappingExposure, 1.7);
});

await test('선택한 패스 사전 컴파일·타깃 복원·사용 자원 해제', async () => {
  for (const game of [false, true]) {
    const g = new RenderProbe();
    const p = game ? new GamePost(g.gl) : new PostChain(g.gl, plazaParams(), null);
    const calls: { target: THREE.WebGLRenderTarget | null; fs: string[] }[] = [];
    g.gl.compileAsync = async (scene) => {
      const fs: string[] = [];
      scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.ShaderMaterial; if (m?.fragmentShader) fs.push(m.fragmentShader); });
      calls.push({ target: g.target, fs });
      return scene;
    };
    const previous = new THREE.WebGLRenderTarget(8, 8);
    g.setRenderTarget(previous);
    await p.precompile();
    assert.equal(g.target, previous);
    assert.equal(calls.length, 2); assert.ok(calls[0].target); assert.equal(calls[1].target, null);
    assert.equal(calls.flatMap((c) => c.fs).some((s) => s.includes('cocAt')), game);
    assert.equal(calls.flatMap((c) => c.fs).some((s) => s.includes('bloomClip')), game);
    p.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    const disposed = new Map<object, number>();
    for (const resource of [...g.materials, ...g.targets.keys()].filter((x) => x !== previous)) {
      disposed.set(resource, 0);
      resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource)! + 1));
    }
    p.dispose();
    assert.ok([...disposed.values()].every((n) => n === 1));
    previous.dispose();
  }
});

await test('근사 영역 출력은 GL 상태를 바꾸기 전에 명시적으로 거절', () => {
  const g = new RenderProbe(); const p = new GamePost(g.gl);
  assert.throws(() => p.render(new THREE.Scene(), new THREE.PerspectiveCamera(), { target: null, viewport: new THREE.Vector4(0, 0, 10, 10), scissor: new THREE.Vector4(0, 0, 10, 10) }), /region/);
  assert.equal(g.rows.length, 0); p.dispose();
});

await test('주입한 텍스처·HDR·큐브 로더와 PMREM 수명·캐시를 공용으로 처리', async () => {
  let pngLoads = 0, hdrLoads = 0, cubeLoads = 0, pngDisposed = 0, hdrDisposed = 0, cubeDisposed = 0, targetDisposed = 0;
  const png = new THREE.Texture(), hdr = new THREE.Texture();
  png.addEventListener('dispose', () => pngDisposed++); hdr.addEventListener('dispose', () => hdrDisposed++);
  const index = { a: { files: ['a.png'], cube: false, srgb: true }, b: { files: ['b.hdr'], cube: false, srgb: false }, rad: { files: ['px', 'nx', 'py', 'ny', 'pz', 'nz'], cube: true, srgb: false } };
  const m = new MaterialSetup({ url: (x) => x }, new RenderProbe().gl, index, undefined, {
    texture: async () => { pngLoads++; return png; },
    hdrTexture: async () => { hdrLoads++; return hdr; },
    hdrCube: async (paths) => {
      assert.deepEqual(paths, index.rad.files.map((x) => `tex/${x}`)); cubeLoads++;
      const cube = new THREE.CubeTexture(); cube.addEventListener('dispose', () => cubeDisposed++); return cube;
    },
  });
  const fromCubemap = THREE.PMREMGenerator.prototype.fromCubemap;
  THREE.PMREMGenerator.prototype.fromCubemap = () => { const t = new THREE.WebGLRenderTarget(); t.addEventListener('dispose', () => targetDisposed++); return t; };
  try {
    const [a, same, b] = await Promise.all([m.texture('a'), m.texture('a'), m.texture('b')]);
    assert.equal(a, same); assert.equal(a, png); assert.equal(b, hdr); assert.equal(png.colorSpace, THREE.SRGBColorSpace); assert.equal(png.flipY, false);
    await m.loadIbl(['rad', 'rad'], ['rad', 'rad']);
    assert.equal(m.common, m.chara); assert.equal(pngLoads, 1); assert.equal(hdrLoads, 1); assert.equal(cubeLoads, 2);
    m.dispose(true);
    assert.equal(pngDisposed, 0); assert.equal(hdrDisposed, 1); assert.equal(cubeDisposed, 2); assert.equal(targetDisposed, 1);
  } finally { THREE.PMREMGenerator.prototype.fromCubemap = fromCubemap; }
});

await test('공용 렌더 파일은 장면·게임·view·dev를 참조하지 않음', () => {
  for (const file of ['material.ts', 'post.ts', 'postApprox.ts']) {
    const src = readFileSync(new URL(`../script/app/common/render3d/${file}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/from ['"]([^'"]+)['"]/g)) assert.ok(m[1] === 'three' || m[1].startsWith('three/') || /^\.\/[^/]+$/.test(m[1]), `${file}: ${m[1]}`);
  }
});

console.log(`render common: ${passed}/${passed} 통과`);
