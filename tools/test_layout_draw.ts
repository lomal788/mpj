import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createHudBackend } from '@app/common/ui/layout/render';
import { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import { Render2D } from '@app/scene/menu/charselect/render2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { LayoutInstance, type Lyt, type Lan } from '../script/view/lyt';

const root = resolve(import.meta.dirname, '..');
const read = <T>(p: string): T => JSON.parse(readFileSync(resolve(root, p), 'utf8')) as T;
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value, (_k, v) => typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v)).digest('hex');
function commands(scene: THREE.Scene): unknown {
  return scene.children.filter(c => c.visible).map(c => {
    const mesh = c as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>, u = mesh.material.uniforms;
    const matrix = (name: string): number[] => (u[name]?.value as THREE.Matrix3 | undefined)?.elements.slice() ?? new THREE.Matrix3().elements;
    return [mesh.renderOrder, ...['position', 'uv', 'vcol'].map(n => Array.from(mesh.geometry.getAttribute(n).array)), u.black.value.toArray(), u.white.value.toArray(), u.alpha.value, u.mode?.value ?? u.alphaMix?.value, u.texCount.value, matrix('srt0'), u.texCount.value > 1 ? matrix('srt1') : null, u.maskOn?.value ?? 0, u.maskOn?.value ? matrix('srtMask') : null, mesh.material.blending, mesh.material.blendSrc, mesh.material.blendDst];
  });
}
const actual: Record<string, string> = {};
for (const file of ['charselect/spec.json', 'mgmcommon/spec.json']) {
  const spec = read<Spec>(`assets/${file}`), renderer = new Render2D(spec);
  const clearText = (inst: LayoutInst): void => { inst.texts.clear(); for (const p of inst.parts.values()) clearText(p); };
  for (const [name, l] of Object.entries(spec.layouts)) {
    const inst = new LayoutInst(name, l, spec); clearText(inst);
    const output: unknown[] = [];
    for (const tag of [null, ...Object.keys(l.anims)]) {
      if (tag) { inst.play(tag); inst.update(l.anims[tag].len / 2); }
      renderer.begin(); renderer.draw(inst); output.push(commands(renderer.scene));
    }
    actual[`${file}:${name}`] = digest(output);
  }
  renderer.dispose();
}
const hud = read<{ layouts: Record<string, Lyt>; anims: Record<string, Record<string, Lan>> }>('assets/mg1801/ui/ui.json');
const resolver = (file: string): { lyt: Lyt; anims: Record<string, Lan> } | null => hud.layouts[file] ? { lyt: hud.layouts[file], anims: hud.anims[file] ?? {} } : null;
const renderer = createHudBackend({ images: new Map(), fonts: new Map(), telop: null });
for (const [name, lyt] of Object.entries(hud.layouts)) {
  const inst = new LayoutInstance(lyt, hud.anims[name] ?? {}, resolver); inst.visible = true;
  const output: unknown[] = [];
  for (const tag of [null, ...Object.keys(inst.anims)]) {
    if (tag) { inst.play(tag); inst.update(inst.anims[tag].frameSize / 2); }
    renderer.begin(); renderer.draw(inst.core); output.push(commands(renderer.scene));
  }
  actual[`hud:${name}`] = digest(output);
}
renderer.dispose();
const golden = resolve(import.meta.dirname, 'layout_draw_golden.json');
const expected = JSON.parse(readFileSync(golden, 'utf8')) as Record<string, string>;
let passed = 0, failed = 0;
for (const [key, value] of Object.entries(expected)) {
  try { assert.equal(actual[key], value); passed++; } catch { failed++; console.error(`FAIL layout draw ${key}: ${actual[key]} != ${value}`); }
}
assert.deepEqual(Object.keys(actual), Object.keys(expected));
console.log(`layout draw golden: ${passed}/${passed + failed}`);
process.exitCode = failed ? 1 : 0;
