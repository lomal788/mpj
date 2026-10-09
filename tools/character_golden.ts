/**
 * 캐릭터 런타임 이전 골든(노드, WebGL·헤드리스 없음) — docs/engine/09_character.md §14.6.
 * 소비자(캐릭터 선택·광장 플레이어·광장 NPC·결과 무대·mg1801)를 같은 조건으로 돌려 틱마다 뼈 로컬 TRS·모프·메시 보임·눈/몸/NPC 재질 uniform·
 * 카메라를 sha1 한 줄로 남긴다. 이전 전 기록(GOLDEN_SHA256)과 같아야 한다(tools/test_character.ts 12절).
 *   npx tsx tools/character_golden.ts <출력 폴더> [full] [시나리오]   (full = 틱마다 원문도 남김)
 * 노드 환경: fetch = web/assets 파일, glb = GLTFLoader.parse(텍스처 스텁), 렌더러 = 가짜(컴파일·그리기 없음), Math.random = 시나리오마다 고정 씨앗.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetHooks } from '@app/scene/menu/charselect/assetHooks';
import { Preview3D } from '@app/scene/menu/charselect/preview3d';
import { CharSelectState, PAD, type CharSelectEvent } from '@app/scene/menu/charselect/state';
import type { Spec } from '@app/scene/menu/charselect/types';
import { ACTION_MOTION, PlazaCharaLoader, PlazaMover, shapeOf, type Lever } from '@app/scene/world/plaza/player';
import { BLEND_NPC, NpcSystem, type Npc, type NpcSpecFile } from '@app/scene/world/plaza/npc';
import type { PlazaContext } from '@app/scene/world/plaza/types';
import { createResultStage } from '@app/minigame/frame/result/stage';
import { DEFAULT_RESULT_OPTIONS } from '@app/minigame/frame/scene/resultContract';
import type { ResultStageHostExt, ResultStageInputExt } from '@app/minigame/frame/result/types';
import { CharacterActor, CharacterTemplate, type CharaInfo } from '@app/minigame/mg1801/view/character';
import { Mg1801Harness } from './mg_node_host';
import { mg1801Options } from '@app/minigame/mg1801';
import { emptyPad } from '@game/core/pad';
import { characterDefaults, HEAD_RULES_WEB, RULES_WEB } from '@game/lib/character';
import type { Assets } from '../script/view/assets';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 이전 전(2026-10-09, 공용 런타임 도입 전 코드 트리로 이 도구를 돌린) 기록의 sha256 — 시나리오 텍스트 전체. 지금은 characterDefaults 를 RULES_WEB·HEAD_RULES_WEB 로 돌린 실행과 비교 */
export const GOLDEN_SHA256_WEB: Record<string, string> = {
  charselect: '9dd16d85128bcf157c3540c4d7eaef0ea0dc50c773df452702889a46e3ea8b3a',
  plaza_player_pc01: '1c3627981e7fd497b19b3068b1b408f836eaaf006166b3a64213c29fd9bb67a6',
  plaza_player_pc07: 'a15dd28645df31cd3d2b871ffcd32abe934481398b1e433a4b789e3171fb1106',
  plaza_player_pc13: '3f04c9711be00a2ee1f50dbfc308ffbe8a50db975a6313c2fb3666ffb8253529',
  plaza_player_pc54: '0e53f57391456d17abd465028a27dc524ab7172b44105755e34eee24c395517e',
  plaza_npc: 'a34471478444f4edf0b2e20c0d478b38f92fa9ca39a8c6c24fd20450b02b0a18',
  mgresult_win1: '9e7efc070129d3e36c1089b8e4b216f79b10fe1d117408148e7e8c77cd144a72',
  mgresult_draw: 'd8ee8888cb8236fca917c9949d8e91cfc8a714d6d04cc92cb3f7cdd60b44703d',
  mgresult_win2_theme: '444b4b12a6bef46abc69cf023475c0bda6dc5c2c1fd0eb5722dd5c2f1a0d31bd',
  mgresult_dice: '68bcadfc3c43d73274c6721a5c11de4f2b1b78cd1d199b913e4e27240380fe67',
  mg1801_normal: 'ec256e91690bf3c1792032b85b5effd72069a7bee5659ca43960a40b987368a9',
  mg1801_long180: 'eb7564fbd008cc7971014bd67995d1b12564ade66133c5665af978907b169ab4',
};

/* ---------- 노드 환경 ---------- */
const fileOf = (u: string): string => {
  let s = String(u).replace(/^\.\//, '');
  if (!s.startsWith('assets/')) s = `assets/${s}`;
  return path.normalize(path.join(WEB, s));
};
const glbCache = new Map<string, Buffer>();
export function parseGlb(u: string): Promise<Any> {
  const f = fileOf(u);
  let b = glbCache.get(f);
  if (!b) glbCache.set(f, (b = fs.readFileSync(f)));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'stub_textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }) as Any);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return new Promise((res, rej) => loader.parse(ab, '', res, rej));
}
let installed = false;
export function install(): void {
  if (installed) return;
  installed = true;
  (globalThis as Any).fetch = async (u: string) => {
    const f = fileOf(u);
    if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    const b = fs.readFileSync(f);
    return { ok: true, status: 200, json: async () => JSON.parse(b.toString('utf8')), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  };
  GLTFLoader.prototype.loadAsync = function (u: string) {
    return parseGlb(u);
  } as Any;
  THREE.TextureLoader.prototype.loadAsync = async function () {
    return new THREE.Texture();
  } as Any;
  assetHooks.createGltfLoader = () => ({ loadAsync: (u: string) => parseGlb(u) }) as Any;
  assetHooks.loadTexture = async () => new THREE.Texture();
}
let captured: [Any, Any] | null = null;
const gl: Any = {
  compileAsync: () => Promise.resolve(),
  initTexture() {},
  render(scene: Any, cam: Any) {
    captured = [scene, cam];
  },
  setRenderTarget() {},
  getRenderTarget: () => null,
  getClearColor: (c: Any) => c,
  getClearAlpha: () => 1,
  setClearColor() {},
  clear() {},
};
const sleep0 = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** 결정적 난수(LCG) */
export function lcg(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.floor((s / 4294967296) * n);
  };
}

/* ---------- 스냅샷 ---------- */
const num = (v: number): string => (Object.is(v, -0) ? '-0' : String(v));
function snapObj(root: Any, out: string[]): void {
  root.traverse((o: Any) => {
    const p = o.position,
      q = o.quaternion,
      s = o.scale;
    let line = `${o.name}|${o.visible ? 1 : 0}|${num(p.x)},${num(p.y)},${num(p.z)}|${num(q.x)},${num(q.y)},${num(q.z)},${num(q.w)}|${num(s.x)},${num(s.y)},${num(s.z)}`;
    if (o.morphTargetInfluences) line += `|m${o.morphTargetInfluences.map(num).join(',')}`;
    const m = o.material;
    if (m && !Array.isArray(m)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) if (m[k]?.matrix) line += `|${k}${Array.from(m[k].matrix.elements as number[]).map(num).join(',')}`;
    out.push(line);
  });
}
const uni = (u: Any): string => {
  if (!u) return 'null';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(u) as [string, Any][]) {
    const x = v.value;
    if (x == null) parts.push(`${k}=null`);
    else if (typeof x === 'number') parts.push(`${k}=${num(x)}`);
    else if (Array.isArray(x)) parts.push(`${k}=${x.map((e: Any) => (e.toArray ? e.toArray().map(num).join(',') : num(e))).join(';')}`);
    else if (x.elements) parts.push(`${k}=${Array.from(x.elements as number[]).map(num).join(',')}`);
    else if (x.isColor) parts.push(`${k}=${num(x.r)},${num(x.g)},${num(x.b)}`);
    else if (x.toArray) parts.push(`${k}=${x.toArray().map(num).join(',')}`);
    else if (x.isTexture) parts.push(`${k}=tex`);
  }
  return parts.join(' ');
};
const sha1 = (s: string): string => crypto.createHash('sha1').update(s).digest('hex');

class Log {
  lines: string[] = [];
  full: string[] = [];
  constructor(
    readonly name: string,
    private readonly keepFull: boolean,
  ) {}
  tick(tag: string, state: string[]): void {
    const body = state.join('\n');
    this.lines.push(`${tag} ${sha1(body)}`);
    if (this.keepFull) this.full.push(`## ${tag}\n${body}`);
  }
  text(): string {
    return this.lines.join('\n') + '\n';
  }
}

function slotState(s: Any, out: string[]): void {
  out.push(`slot ${s.chara} ${s.shown} ${s.current} ${num(s.frame)} ${s.next}`);
  out.push(`eye ${uni(s.eye)}`);
  out.push(`body ${uni(s.body)}`);
  if (s.root) snapObj(s.root, out);
}

async function waitReady(p: Any): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    p.render(gl);
    const preps = [...p.preps.values()];
    if (preps.every((x: Any) => x.state === 'ready' || x.state === 'failed')) break;
    if (Date.now() - t0 > 120000) throw new Error('준비 시간 초과');
    await sleep0();
  }
}

type Out = (log: Log) => void;

/* ---------- A. 캐릭터 선택 ---------- */
async function charselect(full: boolean, out: Out): Promise<void> {
  const log = new Log('charselect', full);
  const spec = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/charselect/spec.json'), 'utf8')) as Spec;
  const p3d = new Preview3D(spec, (p: string) => `assets/charselect/${p}`, lcg(7));
  p3d.prefetch(spec.chars.map((_, i) => i));
  await waitReady(p3d);
  const BTN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const st = new CharSelectState({ btnNo: BTN, unlocked: { pauline: false, ninji: false }, players: ([0, 0, 0, 1] as const).map((t) => ({ type: t })), rand: lcg(11) });
  const handle = (ev: CharSelectEvent[]): void => {
    for (const e of ev as Any[]) {
      if (e.type === 'cards') p3d.setup(e.slots.map(() => [256, 256]));
      else if (e.type === 'card') p3d.setChara(e.slot, e.chara, e.shown);
      else if (e.type === 'motion') p3d.play(e.slot, e.clip, e.next);
    }
  };
  handle(st.start(false));
  const script: Record<number, [number, number][]> = {
    10: [[0, PAD.RIGHT]],
    20: [[0, PAD.RIGHT], [1, PAD.DOWN]],
    30: [[0, PAD.RIGHT]],
    40: [[2, PAD.LEFT]],
    50: [[1, PAD.DOWN]],
    60: [[0, PAD.A]],
    200: [[1, PAD.DOWN]],
    210: [[1, PAD.DOWN]],
    220: [[1, PAD.DOWN]],
    230: [[1, PAD.A]],
    300: [[0, PAD.B]],
    310: [[2, PAD.UP]],
    320: [[2, PAD.UP]],
    330: [[2, PAD.A]],
    400: [[0, PAD.LEFT]],
    410: [[0, PAD.A]],
  };
  for (let f = 0; f < 600; f++) {
    const pads: Any[] = [];
    for (const [p, t] of script[f] ?? []) pads[p] = { trig: t, rep: 0 };
    handle(st.step(pads));
    p3d.update();
    p3d.render(gl);
    const o: string[] = [`phase ${st.phase}`];
    for (const s of p3d.slots) slotState(s, o);
    log.tick(`f${f} ${p3d.slots.map((s) => `${s.chara}:${s.current}:${s.frame}`).join(',')}`, o);
  }
  out(log);
}

/* ---------- B. 광장 플레이어 ---------- */
async function plazaPlayer(full: boolean, out: Out): Promise<void> {
  const loader = await PlazaCharaLoader.create((p: string) => `assets/${p}`);
  for (const pc of ['pc01', 'pc07', 'pc13', 'pc54']) {
    const log = new Log(`plaza_player_${pc}`, full);
    const chara = await loader.load(pc, gl, async () => undefined, lcg(3), sleep0);
    const mover = new PlazaMover(shapeOf(chara.spec), null);
    mover.place(new THREE.Vector3(0, 0, 0), 180);
    let forced = false;
    for (let f = 0; f < 520; f++) {
      let lever: Lever = { depth: 0, dirX: 0, dirZ: 0, deg: 0 };
      if (f >= 30 && f < 90) lever = { depth: 0.5, dirX: 1, dirZ: 0, deg: 90 };
      else if (f >= 90 && f < 150) lever = { depth: 1, dirX: 0, dirZ: 1, deg: 0 };
      else if (f >= 190 && f < 220) lever = { depth: 0.6, dirX: -1, dirZ: 0, deg: -90 };
      if (f === 260) {
        forced = true;
        chara.play('co_nod00', 'co_idle00');
      }
      if (f === 380) chara.play('co_look02');
      if (f === 450) forced = false;
      const a = mover.tick(lever);
      if (a !== 'Fall' && !forced) chara.play(ACTION_MOTION[a]);
      chara.tick();
      chara.root.position.copy(mover.pos);
      chara.root.rotation.set(0, THREE.MathUtils.degToRad(mover.yaw), 0);
      const o: string[] = [`act ${a} ${chara.motion}`];
      slotState((chara as Any).preview.slots[0], o);
      log.tick(`f${f} ${a} ${chara.motion}`, o);
    }
    chara.dispose();
    out(log);
  }
}

/* ---------- C. 광장 NPC ---------- */
async function plazaNpc(full: boolean, out: Out): Promise<void> {
  const log = new Log('plaza_npc', full);
  const spec = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/plaza/world/chara/spec.json'), 'utf8')) as NpcSpecFile;
  const stage = { renderer: gl, prepare: async () => undefined, manifest: { models: {} }, loadModel: async () => null };
  const ctx = { params: new URLSearchParams(''), assetUrl: (p: string) => `assets/${p}`, world: { stage, socket: () => null }, actors: [], on: () => () => undefined } as unknown as PlazaContext;
  const warn = console.warn;
  console.warn = () => undefined;
  const sys = new NpcSystem(ctx, spec);
  await sys.load(1);
  console.warn = warn;
  const npcs = [...sys.npcs.values()];
  npcs.forEach((n, i) => n.holder.position.set((i % 6) * 1.5 - 4, 0, Math.floor(i / 6) * 1.5));
  const mc = sys.npc('MC') as Npc;
  const kam = sys.npc('Kameck');
  const tgt = new THREE.Vector3(0, 1.4, 3);
  for (let f = 0; f < 420; f++) {
    if (f === 5) for (const n of npcs) n.lookAt({ pos: tgt });
    if (f >= 5 && f < 200) tgt.set(Math.sin(f / 30) * 4, 1.2 + Math.cos(f / 50), 3 + Math.cos(f / 23) * 2);
    if (f === 60) mc.play('talk', BLEND_NPC);
    if (f === 120) mc.play('swing', BLEND_NPC);
    if (f === 150) kam?.play('talk', BLEND_NPC);
    if (f === 200) for (const n of npcs) n.lookAt({ obj: mc.holder, bone: 'head_aimcont' });
    if (f === 220) tgt.set(0, 1.5, -6);
    if (f === 260) for (const n of npcs.slice(0, 10)) n.lookAt({ pos: tgt });
    if (f === 320) for (const n of npcs) n.lookAt(null);
    if (f === 330) mc.idle();
    sys.update(1);
    const o: string[] = [];
    for (const n of npcs) {
      o.push(
        `npc ${n.name} ${n.current} ${n.motion} ${num(n.frame)} eye ${n.heading.eyesActive} ${num(n.heading.eyeYaw)} ${num(n.heading.eyePitch)} ${[0, 1].map((i) => n.look.eyeOffset(i)?.toArray().map(num).join(',') ?? 'null').join(';')}`,
      );
      for (const m of (n.look as Any).mats) o.push(`mat ${m.name} ${uni(m.uni)}`);
      snapObj(n.holder, o);
    }
    log.tick(`f${f} ${mc.motion}`, o);
  }
  sys.dispose();
  out(log);
}

/* ---------- D. 결과 무대 ---------- */
async function mgresult(full: boolean, out: Out): Promise<void> {
  const cases: [string, number[], { judgeType?: number; theme?: string; isChara?: boolean }][] = [
    ['win1', [1, 0, 0, 0], {}],
    ['draw', [2, 2, 2, 2], {}],
    ['win2_theme', [1, 1, 0, 0], { judgeType: 1, theme: 'pc14' }],
    ['dice', [1, 1, 1, 0], { judgeType: 1, isChara: true }],
  ];
  for (const [name, wl, o] of cases) {
    const log = new Log(`mgresult_${name}`, full);
    const pcs = ['pc01', 'pc05', 'pc58', 'pc13'];
    const r = lcg(5);
    const input = {
      mgId: 'mg1801',
      gameRule: 0,
      isCoin: false,
      isChara: !!o.isChara,
      judgeType: o.judgeType ?? 0,
      boardMode: 0,
      playMode: 0,
      players: wl.map((w, k) => ({ pid: k, chara: pcs[k], order: k, teamId: 0, winLose: w, coin: 0 })),
      opts: { ...DEFAULT_RESULT_OPTIONS, themeChara: o.theme ?? null },
      rand: () => r(4294967296) >>> 0,
    } as unknown as ResultStageInputExt;
    let fade = 0;
    let telop = -1;
    let gtel = -1;
    const host = {
      gl,
      fade: (_d: string, sec: number) => (fade = Math.round(sec * 60)),
      fading: () => fade-- > 0,
      winTelop: {
        start() {
          telop = -1;
        },
        out() {
          telop = 20;
        },
        finished: () => telop-- <= 0,
      },
      genericTelop: {
        start() {
          gtel = -1;
        },
        out() {
          gtel = 15;
        },
        finished: () => gtel-- <= 0,
      },
      coinShow() {},
      se() {},
      bgm() {},
      resultSound() {},
      uiTimingOut() {},
      dice() {},
      url: (p: string) => `assets/${p}`,
    } as unknown as ResultStageHostExt;
    const stage = await createResultStage(input, host);
    for (let f = 0; f < 2400 && !stage.done; f++) {
      stage.step();
      const dbg = stage.debug();
      const s: string[] = [JSON.stringify(dbg)];
      captured = null;
      stage.render();
      if (captured) {
        const [sc, cam] = captured as [Any, Any];
        s.push(`cam ${Array.from(cam.matrixWorld.elements as number[]).map(num).join(',')} ${num(cam.fov)}`);
        for (const c of sc.children) if (c.name.startsWith('MGResult_')) snapObj(c, s);
      }
      log.tick(`f${f} ${(dbg.motions as string[]).join(',')} cam${dbg.camFrame}`, s);
    }
    out(log);
  }
}

/* ---------- E. mg1801 CharacterActor ---------- */
async function mg1801(full: boolean, out: Out): Promise<void> {
  const assets = {
    json: async (p: string) => JSON.parse(fs.readFileSync(fileOf(`mg1801/${p}`), 'utf8')),
    gltf: (p: string) => parseGlb(`mg1801/${p}`),
    url: (p: string) => `assets/mg1801/${p}`,
  } as unknown as Assets;
  const index = (await assets.json('chara/index.json')) as Record<string, CharaInfo>;
  const runs: [string, string[], ReturnType<typeof mg1801Options>][] = [
    ['normal', ['pc01', 'pc51', 'pc58', 'pc13'], mg1801Options({ mode: '0' })],
    ['long180', ['pc56', 'pc12', 'pc61', 'pc02'], mg1801Options({ mode: '1', longPos: 'rc3' })],
  ];
  for (const [name, chars, opts] of runs) {
    const log = new Log(`mg1801_${name}`, full);
    const tpls = new Map<string, CharacterTemplate>();
    for (const k of chars) if (!tpls.has(k)) tpls.set(k, await CharacterTemplate.load(assets, k, index[k]));
    for (const t of tpls.values()) await t.loadResult(assets);
    const actors = chars.map((k) => new CharacterActor(tpls.get(k)!));
    const setup = { players: chars.map((c, i) => ({ char: c, isCom: i > 0, comLevel: 0 })), seed: 1, practice: false, options: {} };
    const g = new Mg1801Harness(setup as Any, opts);
    let endingFrame = -1;
    for (let f = 1; f < 60 * 150 && !g.done; f++) {
      const p1 = emptyPad();
      if (f % 37 === 0) p1.buttons |= 1;
      g.step([p1, null, null, null]);
      const state = g.state as Any;
      const ending = state.phase === 'ending' || state.phase === 'result';
      const o: string[] = [];
      state.players.forEach((p: Any, i: number) => {
        const actor = actors[i];
        actor.root.position.set(p.pos.x, p.pos.y, p.pos.z);
        const cid = actor.tpl.info.id;
        actor.headLook = p.look?.head ?? (cid !== 14 && cid !== 19);
        actor.eyesLook = p.look?.eyes ?? cid !== 19;
        actor.setHead(p.head?.target ?? null, p.head?.weight ?? 0);
        const rm = p.resultMotion;
        if (rm) {
          let nm = actor.hasMotion(rm.name) ? rm.name : 'co_idle00';
          let fr = rm.frame;
          const a = actor.tpl.motions[nm];
          if (a && !a.loop && fr >= a.frames && rm.next && actor.hasMotion(rm.next)) {
            fr -= a.frames;
            nm = rm.next;
          }
          const m = actor.tpl.motions[nm];
          if (m?.loop) fr %= m.frames;
          actor.pose(nm, fr, { now: state.frame });
        } else if (ending) {
          if (endingFrame < 0) endingFrame = state.frame;
          const fr = actor.tpl.motions.co_idle00?.frames ?? 1;
          actor.pose('co_idle00', (state.frame - endingFrame) % fr, { now: state.frame });
        } else actor.pose(p.motion === 'swing' ? 'rhy_knife_swing00' : 'rhy_knife_idle00', p.motionFrame, { now: state.frame });
        o.push(`p${i} ${p.motion} ${num(p.motionFrame)} eye ${uni((actor as Any).eye)}`);
        snapObj(actor.root, o);
      });
      log.tick(`f${f} ${state.phase} ${state.players.map((p: Any) => `${p.motion}:${p.motionFrame}`).join(',')}`, o);
    }
    out(log);
  }
}

/** 2026-10-09 사용자 결정(기본 = 원본 규칙, 09 §14.7)으로 기본값으로 돌린 기준 — 시나리오별 바뀐 까닭은 09 §14.7 끝 표 */
export const GOLDEN_SHA256: Record<string, string> = {
  charselect: '49d325aac1894098d20e54612a34ead78086bb649639a921115c0899092230fc',
  plaza_player_pc01: '322de98e49bca5ce9ad5b232469a8fe078daf75cd64b3697a6d2fffa72f34752',
  plaza_player_pc07: '4cac48c14b85c871ef6449908c7d978b63a95f5e2f1ad1d19508b467ddd3297e',
  plaza_player_pc13: '42aa5e686fb3d1dbc8668f79e818e091184f70da481c02a92896f207b1664a81',
  plaza_player_pc54: '9b9a9bc2c83ddf65139c948b7cfdacd125b55295bb884fa67952b4997042dacd',
  plaza_npc: '2c26fd0e2f2e04d2765e0b76111d385fe447bdfb05d03b4e8d22fa6d4bb17184',
  mgresult_win1: 'f9cc345ae4204bb4d68ec4d18da7ef40e47d369fe2ae59a97b5ab272ced8139a',
  mgresult_draw: 'e716c2fa56d07b7d9d6f9c2c72efb8558547acc9359e2ed06c2ea1d87326c201',
  mgresult_win2_theme: '284089db5a16f55353b4ef6ec8661c266f05365377f040ff1d1288e00106877b',
  mgresult_dice: '36fd8c1f960c875a0209abe7e3d0a85985133dc28f7f36f33f991746ee79e5cc',
  mg1801_normal: 'ec256e91690bf3c1792032b85b5effd72069a7bee5659ca43960a40b987368a9',
  mg1801_long180: '1e7dc177867cba7bc194d8c41185ee053203a83cff00475f10155eb68b61647e',
};

export const SCENARIOS: Record<string, (full: boolean, out: Out) => Promise<void>> = { charselect, plaza_player: plazaPlayer, plaza_npc: plazaNpc, mgresult, mg1801 };

/** 시나리오를 돌려 이름 → {텍스트, 원문} */
export async function runGolden(only?: string, full = false, web = false): Promise<Map<string, { text: string; full: string }>> {
  install();
  const res = new Map<string, { text: string; full: string }>();
  const random = Math.random;
  const defaults = { ...characterDefaults };
  if (web) {
    characterDefaults.motion = RULES_WEB;
    characterDefaults.head = HEAD_RULES_WEB;
  }
  try {
    for (const [k, fn] of Object.entries(SCENARIOS)) {
      if (only && only !== k) continue;
      const mr = lcg(12345);
      Math.random = () => mr(4294967296) / 4294967296;
      await fn(full, (log) => res.set(log.name, { text: log.text(), full: log.full.join('\n') + '\n' }));
    }
  } finally {
    Math.random = random;
    Object.assign(characterDefaults, defaults);
  }
  return res;
}

export const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2];
  const full = process.argv[3] === 'full';
  const web = process.env.GOLDEN_RULES === 'web';
  const res = await runGolden(process.argv[4], full, web);
  const want = web ? GOLDEN_SHA256_WEB : GOLDEN_SHA256;
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  for (const [name, r] of res) {
    if (outDir) {
      fs.writeFileSync(path.join(outDir, `${name}.txt`), r.text);
      if (full) fs.writeFileSync(path.join(outDir, `${name}.full.txt`), r.full);
    }
    const h = sha256(r.text);
    console.log(`${name}: ${r.text.split('\n').length - 1} 틱 ${h === want[name] ? '기준과 같음' : `다름 ${h}`}`);
  }
  process.exit(0);
}
