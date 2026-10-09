/**
 * 미니게임 3D 결과 무대 실행(bq::MGResult 결과 파이버 FUN_71002e7d90 갈래 A) — docs/shell/minigame_result.md §6.2~6.4·§6.8~6.9·§12.
 * 파이버는 제너레이터 하나: yield 한 번 = 원본 Fiber Wait 한 번 = step() 한 번(1/60 고정). step 은 파이버 → 카메라 프레임 → 캐릭터 모션(Preview3D) → 머리 시선(plaza Heading) 순.
 * 캐릭터 = 공용 assets/chara(charselect Preview3D 파이프라인), 배치·카메라·모션 수치 = logic.ts. 3D 만 그린다(와이프·텔롭·코인 2D 는 틀).
 * 빛: host.world 가 없으면 캐릭터 선택과 같은 env(평행광·반구광) [근사: 원본은 미니게임 무대 env].
 */
import * as THREE from 'three';
import { mpatTables, Preview3D } from '../charselect/preview3d';
import type { CharaSpec, Spec } from '../charselect/types';
import { Heading } from '../plaza/heading';
import * as L from './logic';
import { SPEC_PATH, camPath, type MgResultSpec, type ResultStageEvent, type ResultStageExt, type ResultStageHostExt, type ResultStageInputExt } from './types';

const f = Math.fround;

function normPath(p: string): string {
  const out: string[] = [];
  for (const s of p.split('/')) {
    if (s === '..') out.pop();
    else if (s !== '.' && s !== '') out.push(s);
  }
  return out.join('/');
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`mgresult: ${url} 를 읽지 못했다 (${r.status})`);
  return (await r.json()) as T;
}

export function loadResultSpec(url: (p: string) => string): Promise<MgResultSpec> {
  return getJson<MgResultSpec>(url(SPEC_PATH));
}

export function logicInput(input: ResultStageInputExt): L.LogicInput {
  return {
    gameRule: input.gameRule,
    isCoin: input.isCoin,
    isChara: input.isChara,
    judgeType: input.judgeType,
    boardMode: input.boardMode,
    playMode: input.playMode,
    listId: input.listId,
    entryCount: input.entryCount,
    players: input.players.map((p) => ({ pid: p.pid, chara: p.chara, order: p.order, teamId: p.teamId, winLose: p.winLose, coin: p.coin })),
    cameraType: input.opts.cameraType,
    cameraPattern: input.opts.cameraPattern,
    pcPosOffset: input.opts.pcPosOffset,
    hasFlow: false,
  };
}

export function charaFiles(c: CharaSpec): string[] {
  const base = 'mgresult/';
  if (!c.glb) return [];
  const out = [c.glb, ...(c.anims ?? [])];
  if (c.motions) out.push(c.motions);
  if (c.eye?.tex) out.push(c.eye.tex);
  if (c.eye?.lid) out.push(c.eye.lid.tex);
  return out.map((p) => normPath(base + p));
}

export function themeOf(input: ResultStageInputExt): string | null {
  return input.judgeType !== 0 ? input.opts.themeChara : null;
}

export function stageFiles(spec: MgResultSpec, input: ResultStageInputExt): string[] {
  const p = L.plan(spec, logicInput(input), input.opts.motions);
  const out = new Set<string>([SPEC_PATH, 'chara/mpat.json']);
  if (p.camera) out.add(camPath(p.camera));
  const pcs = input.players.map((x) => x.chara);
  const th = themeOf(input);
  if (th) pcs.push(th);
  for (const pc of pcs) {
    const c = spec.chars.find((x) => x.pc === pc);
    if (c) for (const k of charaFiles(c)) out.add(k);
  }
  return [...out];
}

export async function resultStagePrefetch(input: ResultStageInputExt, url: (p: string) => string): Promise<string[]> {
  return stageFiles(await loadResultSpec(url), input);
}

function makeLights(env: Spec['env']): THREE.Object3D[] {
  const lc = env.lightColor;
  const dir = new THREE.DirectionalLight(new THREE.Color(lc[0], lc[1], lc[2]), Math.PI);
  const e = new THREE.Euler((env.lightRotDeg[0] * Math.PI) / 180, (env.lightRotDeg[1] * Math.PI) / 180, (env.lightRotDeg[2] * Math.PI) / 180, 'XYZ');
  const d = new THREE.Vector3(0, 0, -1).applyEuler(e);
  dir.position.copy(d.clone().multiplyScalar(-10));
  dir.target.position.set(0, 0, 0);
  return [dir, dir.target, new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.6)];
}

interface Actor {
  pid: number;
  slot: number;
  pc: string;
  chara: L.CharaParam;
  holder: THREE.Group;
  heading: Heading;
  theme: boolean;
}

type Fiber = Generator<void, void, void>;

export async function createResultStage(input: ResultStageInputExt, host: ResultStageHostExt): Promise<ResultStageExt> {
  const gl = host.gl as THREE.WebGLRenderer;
  const spec = await loadResultSpec((p) => host.url(p));
  const li = logicInput(input);
  const P = L.plan(spec, li, input.opts.motions);
  const emit = (e: ResultStageEvent): void => host.onEvent?.(e);
  emit({ type: 'pattern', pattern: P.pattern, model: P.model, camera: P.camera, telopNo: P.telopNo, telopPlace: P.telopPlace, dice: P.dice });

  const origin = host.world?.origin ? { pos: host.world.origin.pos, quat: host.world.origin.quat } : undefined;
  const scene = host.world?.scene ?? new THREE.Scene();
  const own: THREE.Object3D[] = host.world ? [] : makeLights(spec.env);
  for (const o of own) scene.add(o);
  const camera = new THREE.PerspectiveCamera(25, 1.78, 1, 10000);

  const bones = P.model ? spec.pos[P.model] : undefined;
  const slots = bones ? L.slotsOf(bones, origin) : {};
  const clip = P.camera ? await getJson<L.CamClip>(host.url(camPath(P.camera))) : null;

  const theme = themeOf(input);
  const pcs = input.players.map((p) => p.chara);
  if (theme) pcs.push(theme);
  const url = (p: string): string => host.url(normPath(`mgresult/${p}`));
  const mpat = await getJson<Parameters<typeof mpatTables>[0]>(host.url('chara/mpat.json')).catch(() => null);
  const preview = new Preview3D({ chars: spec.chars, env: spec.env } as unknown as Spec, url, undefined, { mpat: mpatTables(mpat, [`${input.mgId}_pc`, 'sys_pc']) });
  const actors: Actor[] = [];
  if (P.row) {
    preview.setup(pcs.map(() => [1, 1] as [number, number]));
    const idx = pcs.map((pc) => Math.max(0, spec.chars.findIndex((c) => c.pc === pc)));
    preview.prefetch([...new Set(idx)]);
    idx.forEach((k, s) => preview.setChara(s, k, true));
    const t0 = performance.now();
    while (preview.slots.some((s) => !s.root)) {
      if (performance.now() - t0 > 60000) throw new Error('mgresult: 캐릭터 준비 시간 초과');
      preview.render(gl);
      await new Promise((r) => setTimeout(r, 0));
    }
    pcs.forEach((pc, s) => {
      const holder = new THREE.Group();
      holder.name = `MGResult_${pc}_${s}`;
      holder.add(preview.slots[s].root!);
      holder.visible = false;
      scene.add(holder);
      const chara = L.charaOf(spec, pc);
      const heading = new Heading({ ...chara.head, head_weight: L.headWeight(chara) });
      heading.bind(holder);
      const isTheme = !!theme && s === pcs.length - 1;
      actors.push({ pid: isTheme ? -1 : input.players[s].pid, slot: s, pc, chara, holder, heading, theme: isTheme });
    });
  }

  const actorOf = (pid: number): Actor | undefined => actors.find((a) => a.pid === pid && !a.theme);
  const themeActor = actors.find((a) => a.theme);
  const winLose = new Map(input.players.map((p) => [p.pid, p.winLose as number]));
  const writes: { pid: number; winLose: 0 | 1 }[] = [];
  const play = (a: Actor | undefined, clipA: string, clipB: string | null): void => {
    if (!a) return;
    preview.play(a.slot, clipA, clipB ?? undefined);
    emit({ type: 'motion', pid: a.pid, a: clipA, b: clipB });
  };

  let camFrame = 0;
  let camPlaying = false;
  const camFinished = (): boolean => !!clip && !clip.loop && camFrame >= clip.frames;
  const camWorld = (v: L.Vec3): THREE.Vector3 => {
    if (!origin) return new THREE.Vector3(v[0], v[1], v[2]);
    const r = L.quatRotate(origin.quat, v);
    return new THREE.Vector3(origin.pos[0] + r[0], origin.pos[1] + r[1], origin.pos[2] + r[2]);
  };
  const applyCamera = (): void => {
    if (!clip) return;
    const pose = L.cameraPose(clip, camFrame);
    const [near, far] = L.nearFar(pose, input.opts.nearZ, input.opts.farZ);
    camera.position.copy(camWorld(pose.pos));
    camera.up.set(0, 1, 0);
    camera.lookAt(camWorld(pose.aim));
    if (pose.twist) camera.rotateZ(pose.twist);
    camera.fov = THREE.MathUtils.radToDeg(pose.fovy);
    camera.aspect = pose.aspect;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  applyCamera();

  let lastLayout: L.LayoutResult | null = null;
  const place = (): void => {
    if (!P.row) return;
    const cp = camera.position;
    const lay = L.layout(spec, { ...li, players: li.players.map((p) => ({ ...p, winLose: winLose.get(p.pid) ?? p.winLose })) }, P.row, P.reg, slots, [cp.x, cp.y, cp.z]);
    lastLayout = lay;
    for (const pl of lay.places) {
      const a = actorOf(pl.pid);
      if (!a) continue;
      a.holder.position.set(pl.pos[0], pl.pos[1], pl.pos[2]);
      a.holder.quaternion.set(pl.quat[0], pl.quat[1], pl.quat[2], pl.quat[3]);
      a.holder.visible = true;
    }
    if (themeActor && lay.fellow) {
      themeActor.holder.position.set(...lay.fellow.pos);
      themeActor.holder.quaternion.set(...lay.fellow.quat);
      themeActor.holder.visible = true;
    }
  };
  const lookTargets = P.row ? L.lookTargets(li, P.row, P.reg) : [];
  const lookCam = (): void => {
    for (const pid of lookTargets) {
      const a = actorOf(pid);
      if (a) a.heading.target = { pos: camera.position.clone() };
    }
  };
  const headPos = (a: Actor): THREE.Vector3 => {
    const h = a.holder.getObjectByName('head_aimcont');
    a.holder.updateMatrixWorld(true);
    return h ? h.getWorldPosition(new THREE.Vector3()) : a.holder.position.clone().add(new THREE.Vector3(0, a.chara.resultEyePosY, 0));
  };
  const themeLook = (): void => {
    if (!themeActor || input.judgeType === 0) return;
    const wins = input.players.filter((p) => winLose.get(p.pid) === 1);
    if (wins.length === 1) {
      const a = actorOf(wins[0].pid);
      if (!a) return;
      const cur = preview.slots[a.slot].current;
      themeActor.heading.target = { pos: cur === P.motions.winA ? headPos(a) : a.holder.position.clone().add(new THREE.Vector3(0, a.chara.resultEyePosY, 0)) };
      return;
    }
    const cand = (P.reg.list1.length ? P.reg.list1 : P.reg.list2).map((p) => actorOf(p.pid)).filter((a): a is Actor => !!a);
    if (!cand.length) return;
    const first = cand[0].holder.position;
    const last = cand[cand.length - 1].holder.position;
    let y = 0;
    for (const a of cand) y += headPos(a).y;
    themeActor.heading.target = { pos: new THREE.Vector3((first.x + last.x) / 2, y / cand.length, (first.z + last.z) / 2) };
  };

  function* sleep(sec: number): Fiber {
    let t = 0;
    while (t < sec) {
      yield;
      t = f(t + L.DT);
    }
  }
  function* waitFade(each?: () => void): Fiber {
    while (host.fading()) {
      each?.();
      yield;
    }
  }

  let telopDone = false;
  const telop = (t: number): void => {
    if (telopDone || !P.row || t < P.row.TelopIn) return;
    telopDone = true;
    if (P.row.WinLoseType === 'Normal') {
      if (P.telopNo !== -1) host.winTelop.start(P.telopNo, P.telopPlace);
      emit({ type: 'telopIn', frame: t, no: P.telopNo, place: P.telopPlace, coin: false });
    } else {
      for (const p of P.reg.list2) host.coinShow(p.pid, p.coin);
      emit({ type: 'telopIn', frame: t, no: P.telopNo, place: P.telopPlace, coin: true });
    }
  };

  function* prepare(): Fiber {
    emit({ type: 'fadeOut' });
    host.fade('out', L.SEC.fadeOut);
    yield* waitFade();
    yield* sleep(L.SEC.afterFadeOut);
    if (P.row) {
      for (const a of actors) {
        if (a.theme) continue;
        if (P.motions.idle !== spec.chars[preview.slots[a.slot].chara]?.idle) play(a, P.motions.idle, null);
      }
      lookCam();
      place();
      host.uiTimingOut(2);
      if (P.dice) for (const p of input.players) if (p.winLose === 0) play(actorOf(p.pid), P.motions.loseA, P.motions.loseB);
      if (P.telopNo !== -1) host.resultSound(P.telopNo);
    }
    emit({ type: 'setup' });
    yield* sleep(L.SEC.afterSetup);
    emit({ type: 'fadeIn' });
    host.fade('in', L.SEC.fadeIn);
    yield* waitFade(() => {
      if (!P.row) return;
      lookCam();
      place();
    });
  }

  function* normal(): Fiber {
    for (const m of L.startMotions(P.row!, P.reg, P.motions)) play(actorOf(m.pid), m.a, m.b);
    if (themeActor) play(themeActor, L.MOTION.applause, null);
    camPlaying = true;
    emit({ type: 'cameraStart' });
    while (!camFinished()) {
      telop(camFrame);
      lookCam();
      themeLook();
      place();
      yield;
    }
    emit({ type: 'cameraEnd' });
    if (P.telopNo !== -1) {
      host.winTelop.out();
      emit({ type: 'telopOut' });
      while (!host.winTelop.finished()) yield;
    }
  }

  function* dice(): Fiber {
    camPlaying = true;
    emit({ type: 'cameraStart' });
    lookCam();
    host.bgm('SM_BGM_SSMG_DICE');
    host.se('SQ_SE_TLP_MG_RES_WIN_DIC');
    const gt = host.genericTelop;
    if (gt) {
      gt.start('mg_tl401_windice');
      yield* sleep(L.SEC.diceTelopHold);
      gt.out();
      while (!gt.finished()) yield;
    } else yield* sleep(L.SEC.diceTelopHold);
    yield* sleep(L.SEC.diceTelopAfter);
    const roll = L.diceRoll(P.reg, () => input.rand());
    for (const pid of roll.candidates) play(actorOf(pid), L.MOTION.diceIdle, null);
    for (const pid of roll.candidates) {
      const a = actorOf(pid);
      play(a, L.MOTION.diceJump, L.MOTION.diceIdle);
      const n = a ? (spec.chars[preview.slots[a.slot].chara]?.clips?.[L.MOTION.diceJump]?.frames ?? 48) : 48;
      for (let k = 0; k < n; k++) yield;
      host.dice?.(pid, roll.values[pid]);
      emit({ type: 'dice', pid, value: roll.values[pid] });
    }
    host.bgm(null);
    yield* sleep(L.SEC.diceGuideOut);
    yield* sleep(L.SEC.diceAfterRoll);
    for (const w of roll.writes) {
      winLose.set(w.pid, w.winLose);
      writes.push(w);
      if (w.winLose === 0) play(actorOf(w.pid), P.motions.loseA, P.motions.loseB);
    }
    emit({ type: 'diceWinner', pid: roll.winner, writes: roll.writes });
    const win = actorOf(roll.winner);
    const wp = input.players.find((p) => p.pid === roll.winner);
    const fix = wp ? slots[`pos_pc${String(wp.order).padStart(2, '0')}_fix`] : undefined;
    if (win && fix) {
      const p0: L.Vec3 = [f(win.holder.position.x), f(win.holder.position.y), f(win.holder.position.z)];
      const p1 = fix.pos;
      const d = L.normalize3(L.sub3(p1, p0));
      win.holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(d[0], d[1], d[2]).normalize());
      play(win, L.MOTION.walk, null);
      let s = 0;
      do {
        const p = L.walkAt(p0, p1, s);
        win.holder.position.set(p[0], p[1], p[2]);
        themeLook();
        yield;
        s = f(s + L.DT);
      } while (s <= L.SEC.walkEnd);
    }
    play(win, P.motions.winA, P.motions.winB);
    if (themeActor) play(themeActor, L.MOTION.applause, null);
    host.winTelop.start(L.DICE_TELOP_NO, 'WinRightTop');
    emit({ type: 'telopIn', frame: camFrame, no: L.DICE_TELOP_NO, place: 'WinRightTop', coin: false });
    let t = 0;
    while (t < L.SEC.diceWinTelop) {
      lookCam();
      themeLook();
      yield;
      t = f(t + L.DT);
    }
    host.winTelop.out();
    emit({ type: 'telopOut' });
    while (!host.winTelop.finished()) {
      lookCam();
      themeLook();
      yield;
    }
  }

  function* fiber(): Fiber {
    yield* prepare();
    if (!P.row) return;
    if (P.dice) yield* dice();
    else yield* normal();
  }

  const gen = fiber();
  let done = false;
  let frames = 0;
  return {
    get done() {
      return done;
    },
    writes,
    step() {
      if (done) return;
      frames++;
      if (gen.next().done) {
        done = true;
        emit({ type: 'done' });
      }
      if (camPlaying && clip) camFrame = Math.min(clip.frames, camFrame + 1);
      applyCamera();
      if (actors.length) {
        preview.update();
        for (const a of actors) a.heading.apply(a.holder, 1);
      }
    },
    render() {
      gl.render(scene, camera);
    },
    dispose() {
      for (const a of actors) a.holder.removeFromParent();
      for (const o of own) o.removeFromParent();
      preview.dispose();
    },
    debug: () => ({
      pattern: P.pattern,
      model: P.model,
      camera: P.camera,
      size: P.size,
      camIdx: P.camIdx,
      telop: [P.telopNo, P.telopPlace],
      dice: P.dice,
      frames,
      camFrame,
      done,
      places: lastLayout ? (lastLayout as L.LayoutResult).places.map((p) => ({ pid: p.pid, slot: p.slot, pos: p.pos.map((v) => +v.toFixed(4)) })) : [],
      motions: actors.map((a) => `${a.theme ? 'theme' : a.pid}:${a.pc}:${preview.slots[a.slot].current}`),
      writes,
    }),
  };
}
