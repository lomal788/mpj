// Web glb (tools/mg1801_web_charas.py: dropped attributes / rest-equal channels, 1-key constant channels) vs. extracted glb
// (tools/character_glb.py): every bone world matrix and morph weight must match at every integer frame of every kept clip,
// when clips are played one after another on the same mixer (as character.ts does: stop old action, play new one).
// Result clips come from <model>_result.glb (clip-only glb) bound to the main model by node names.
// Shared assets (docs/engine/chara_assets.md): glb = model without clips, anims/resultAnims = one clip-only glb per motion, bound the same way.
// usage: node tools/character_verify/run.mjs tools/character_verify/web_same.ts [pc01 pc02 ... | all]
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT = path.resolve(path.dirname(process.argv[1]), '../../../..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/assets/mg1801/chara/index.json'), 'utf8'));
let keys = process.argv.slice(2);
if (!keys.length || keys[0] === 'all') keys = Object.keys(index);

const stubTextures = () => ({ name: 'stub_textures', loadTexture: () => Promise.resolve(new THREE.Texture()) });
function parse(buf: Buffer): Promise<any> {
  const loader = new GLTFLoader();
  loader.register(stubTextures as any);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => loader.parse(ab, '', res, rej));
}

function snapshot(scene: THREE.Object3D): Map<string, number[]> {
  scene.updateMatrixWorld(true);
  const m = new Map<string, number[]>();
  scene.traverse((o: any) => {
    if (o.isBone || o.type === 'Object3D') m.set(o.name, o.matrixWorld.elements.slice());
    if (o.morphTargetInfluences) m.set(o.name + '#w', o.morphTargetInfluences.slice());
  });
  return m;
}

let bad = 0;
for (const key of keys) {
  const e = index[key];
  const web = await parse(fs.readFileSync(path.join(ROOT, 'web/assets/mg1801/chara', e.glb)));
  for (const f of [...(e.anims ?? []), ...(e.resultAnims ?? []), ...(e.resultGlb ? [e.resultGlb] : [])])
    web.animations.push(...(await parse(fs.readFileSync(path.join(ROOT, 'web/assets/mg1801/chara', f)))).animations);
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'extracted/converted/character', key, 'meta.json'), 'utf8'));
  const src = await parse(fs.readFileSync(path.join(ROOT, 'extracted/converted/character', key, meta.glb)));
  const mixers = [new THREE.AnimationMixer(web.scene), new THREE.AnimationMixer(src.scene)];
  const prev: (THREE.AnimationAction | null)[][] = [[], []];
  let maxErr = 0;
  let worst = '';
  const order = (web.animations as THREE.AnimationClip[]).filter((c) => !c.name.endsWith('_shape')).map((c) => c.name);
  for (const name of [...order, ...order.slice().reverse()]) {
    const acts = [web, src].map((g, i) => {
      for (const a of prev[i]) a?.stop();
      const list = [name, name + '_shape'].map((n) => {
        const c = (g.animations as THREE.AnimationClip[]).find((x) => x.name === n);
        if (!c) return null;
        const a = mixers[i].clipAction(c);
        a.setLoop(THREE.LoopRepeat, Infinity);
        a.play();
        return a;
      });
      prev[i] = list;
      return list;
    });
    const clip = (web.animations as THREE.AnimationClip[]).find((c) => c.name === name)!;
    const frames = Math.round(clip.duration * 60);
    for (let f = 0; f <= frames; f++) {
      for (let i = 0; i < 2; i++) {
        for (const a of acts[i]) if (a) a.time = Math.min(f / 60, a.getClip().duration);
        mixers[i].update(0);
      }
      const A = snapshot(web.scene);
      const B = snapshot(src.scene);
      for (const [n, va] of A) {
        const vb = B.get(n);
        if (!vb) continue;
        for (let k = 0; k < va.length; k++) {
          const d = Math.abs(va[k] - vb[k]);
          if (d > maxErr) {
            maxErr = d;
            worst = `${name}@${f} ${n}[${k}]`;
          }
        }
      }
    }
  }
  const ok = maxErr < 1e-4;
  if (!ok) bad++;
  console.log(`${key} ${ok ? 'ok' : 'NG'} maxErr ${maxErr.toExponential(2)} ${worst}`);
}
process.exitCode = bad ? 1 : 0;
