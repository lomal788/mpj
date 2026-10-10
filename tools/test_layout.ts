import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import { nodeMatrix } from '@app/scene/menu/charselect/render2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { LayoutInstance, type Lyt, type Lan } from '../script/view/lyt';

const root = resolve(import.meta.dirname, '..');
const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(root, file), 'utf8')) as T;
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value, (_k, v) => typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v)).digest('hex');
const menuState = (l: LayoutInst): unknown => [l.current, l.done, l.nodes.map(n => [n.v, n.t, n.r, n.s, n.z, n.a, n.vc, n.uv]), l.mats.map(m => [m.black, m.white, m.srt]), [...l.parts].map(([i, p]) => [i, menuState(p)]), l.nodes.map(n => nodeMatrix(l, n.spec.n))];
const hudState = (l: LayoutInstance): unknown => [[...l.panes].map(([name, p]) => [name, p.visible, p.t, p.r, p.s, p.size, p.alpha, p.vtx, l.paneGlobalPos(name)]), [...l.mats].map(([name, m]) => [name, m.black, m.white, m.srt, m.tex]), [...l.parts].map(([name, p]) => [name, hudState(p)])];
const actual: Record<string, string> = {};
for (const file of ['charselect/spec.json', 'mgmcommon/spec.json']) {
  const spec = read<Spec>(`assets/${file}`);
  for (const [name, layout] of Object.entries(spec.layouts)) {
    const samples: unknown[] = [menuState(new LayoutInst(name, layout, spec))];
    for (const [tag, anim] of Object.entries(layout.anims)) {
      const inst = new LayoutInst(name, layout, spec); inst.play(tag);
      samples.push(menuState(inst));
      for (const df of [0.5, anim.len / 2, anim.len + 1]) { inst.update(df); samples.push(menuState(inst)); }
    }
    actual[`${file}:${name}`] = digest(samples);
  }
}
const hud = read<{ layouts: Record<string, Lyt>; anims: Record<string, Record<string, Lan>> }>('assets/mg1801/ui/ui.json');
const resolvePart = (file: string): { lyt: Lyt; anims: Record<string, Lan> } | null => hud.layouts[file] ? { lyt: hud.layouts[file], anims: hud.anims[file] ?? {} } : null;
for (const [name, lyt] of Object.entries(hud.layouts)) {
  const anims = hud.anims[name] ?? {};
  const samples: unknown[] = [hudState(new LayoutInstance(lyt, anims, resolvePart))];
  for (const [tag, anim] of Object.entries(anims)) {
    const inst = new LayoutInstance(lyt, anims, resolvePart); inst.play(tag);
    samples.push(hudState(inst));
    for (const df of [0.5, anim.frameSize / 2, anim.frameSize + 1]) { inst.update(df); samples.push(hudState(inst)); }
  }
  actual[`hud:${name}`] = digest(samples);
}
const goldenPath = resolve(import.meta.dirname, 'layout_golden.json');
const expected = JSON.parse(readFileSync(goldenPath, 'utf8')) as Record<string, string>;
let passed = 0, failed = 0;
for (const [name, value] of Object.entries(expected)) {
  try { assert.equal(actual[name], value); passed++; } catch { failed++; console.error(`FAIL layout baseline ${name}: ${actual[name]} != ${value}`); }
}
assert.deepEqual(Object.keys(actual), Object.keys(expected));
console.log(`layout golden: ${passed}/${passed + failed}`);
process.exitCode = failed ? 1 : 0;
