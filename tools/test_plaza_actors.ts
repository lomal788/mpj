/**
 * 광장 C 갈래 시험 — NPC 배치·따라가기·상호작용 영역·기구 출발 사건(docs/shell/plaza_3d.md §6.10).
 * 기대값 근거: §6.10 판독(어셈블리 포함). 원본 실행 대조가 아니라 판독식의 재구현 시험이다. 소켓·클립은 실제 변환물(glb·spec)에서 읽는다.
 *
 *   npx tsx tools/test_plaza_actors.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { MeshCollider } from '../script/shell/stage3d/meshCollider';
import { PlazaMover, NO_LEVER } from '../script/shell/plaza/player';
import { DECO_NPCS, DECO_PROPS, MANAGER_NPCS, NPC_MODEL, type NpcSpecFile } from '../script/shell/plaza/npc';
import { autoInterp, FOLLOW, FollowLogic, leverToward, meshRayBlocked, plazaHumans, RemoteMotion } from '../script/shell/plaza/follow';
import { RemoteSender } from '../script/shell/plaza/ui/net';
import { AREA, calcTurnDegY, getArea, InteractSystem, judge, popPosition, POINT_SOCKETS, RESULT, type InteractPoints } from '../script/shell/plaza/interact';
import { BalloonSystem, FsnbCamera, TAKEOFF } from '../script/shell/plaza/balloon';
import { GRAPH, layerOf, srtMaya } from '../script/shell/plaza/npcMaterial';
import type { PlazaContext, PlazaPlayerSetup } from '../script/shell/plaza/types';

const ROOT = join(import.meta.dirname, '..', '..');
const WORLD = join(ROOT, 'web', 'assets', 'plaza', 'world');
const GFX = join(ROOT, 'extracted', 'converted', 'graphics', 'menu00');
let fails = 0;
let count = 0;
function ok(cond: boolean, msg: string): void {
  count++;
  if (!cond) {
    fails++;
    console.log('  실패:', msg);
  }
}
function near(a: number, b: number, eps: number, msg: string): void {
  ok(Math.abs(a - b) <= eps, `${msg}: ${a} != ${b} (±${eps})`);
}

/** glb JSON 노드로 뼈 나무를 만든다(메시 없음) */
function glbNodes(path: string): THREE.Object3D {
  const b = readFileSync(path);
  const jl = b.readUInt32LE(12);
  const js = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')) as { nodes: { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[]; scenes?: { nodes: number[] }[] };
  const objs = js.nodes.map((n) => {
    const o = new THREE.Object3D();
    o.name = n.name ?? '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  js.nodes.forEach((n, i) => n.children?.forEach((c) => objs[i].add(objs[c])));
  const root = new THREE.Object3D();
  for (const i of js.scenes?.[0]?.nodes ?? [0]) root.add(objs[i]);
  root.updateMatrixWorld(true);
  return root;
}
const wpos = (root: THREE.Object3D, name: string): THREE.Vector3 | null => root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()) ?? null;

const model = (name: string): string => {
  const a = join(WORLD, 'model', `${name}.glb`);
  return existsSync(a) ? a : join(GFX, 'model', `${name}.glb`);
};
const attach = glbNodes(model('menu00_loc_attach00'));
const deco = glbNodes(model('menu00_loc_deco_npc_attach00'));
const quest = glbNodes(model('menu00_loc_ev_quest_start'));
const balloonModel = glbNodes(join(ROOT, 'extracted', 'converted', 'graphics', 'menu_common', 'model', 'menu_cmn_balloon00.glb'));
const sock = (n: string): THREE.Vector3 | null => wpos(attach, n) ?? wpos(deco, n) ?? wpos(quest, n);

console.log('1. NPC 배치(§6.10 ③)');
{
  const spec = JSON.parse(readFileSync(join(WORLD, 'chara', 'spec.json'), 'utf8')) as NpcSpecFile;
  const ids = new Set<number>([...MANAGER_NPCS.map((m) => m.id), ...DECO_NPCS.map((d) => d.id)]);
  ok(ids.size === 11, `NPC 종류 11 (BeginScene LoadSceneNonPlayerCharacter): ${ids.size}`);
  ok([...ids].sort((a, b) => a - b).join(',') === [0x01, 0x04, 0x05, 0x09, 0x0b, 0x20, 0x29, 0x2e, 0x2f, 0x37, 0x38].join(','), 'NPC ID 표 = BeginScene 11종');
  ok(MANAGER_NPCS.length === 5, 'NpcManager 5(MC·Kameck·직원 3)');
  const byGroup = (g: string): number => DECO_NPCS.filter((d) => d.group === g).length;
  ok(byGroup('E') === 19 && byGroup('B') === 3 && byGroup('C') === 3, `장식 NPC E19/B3/C3: ${byGroup('E')}/${byGroup('B')}/${byGroup('C')}`);
  ok(DECO_NPCS.length + MANAGER_NPCS.length === 30, '광장 NPC 30체(+기구 MC 1)');
  for (const id of ids) {
    const c = spec.chars.find((x) => x.pc === NPC_MODEL[id]);
    ok(!!c && existsSync(join(WORLD, 'chara', c.glb!)), `모델 glb ${NPC_MODEL[id]}`);
    ok(!!c?.npc.some((r) => r.id === id), `spec 레코드 ID 0x${id.toString(16)}`);
  }
  for (const m of MANAGER_NPCS) ok(!!sock(m.socket), `NpcManager 소켓 ${m.socket}`);
  for (const d of DECO_NPCS) {
    if (d.host) {
      const p = DECO_PROPS.find((x) => x.name === d.host)!;
      ok(!!wpos(glbNodes(join(GFX, 'model', `${p.model}.glb`)), d.socket), `${d.name} 경로 뼈 ${p.model}/${d.socket}`);
    } else ok(!!wpos(deco, d.socket), `${d.name} 소켓 ${d.socket}`);
    const c = spec.chars.find((x) => x.pc === NPC_MODEL[d.id])!;
    ok(!!c.clips?.[d.motion], `${d.name} 모션 ${d.motion} 이 ${c.pc} 에 있음`);
    if (d.badminton) ok(!!c.clips?.[d.badminton.swing], `${d.name} 스윙 ${d.badminton.swing}`);
  }
  for (const p of DECO_PROPS) {
    const g = join(GFX, 'model', `${p.model}.glb`);
    ok(existsSync(g), `소품 변환물 ${p.model}`);
    if (!p.host) ok(!!wpos(deco, p.socket), `소품 소켓 ${p.socket}`);
  }
  const PROP_ANIMS = ['npc00_obj', 'npc07_obj', 'npc02_obj', 'air_npc03', 'air_npc04', 'air_npc05'];
  ok(DECO_PROPS.every((p) => !p.clip || (p.clip === p.model && PROP_ANIMS.includes(p.clip))), `소품 애니 = MapManager::Create 가 이름을 넘기는 것만(§6.14 #15): ${DECO_PROPS.filter((p) => p.clip).map((p) => p.clip).join(',')}`);
  ok(!DECO_PROPS.find((p) => p.name === 'Group02_item')?.clip, '비치볼(Group02_item)은 자기 클립 없이 ball_anim 만 따라감');
  {
    const b = readFileSync(join(GFX, 'model', 'menu00_ast_beachball00.glb'));
    const jl = b.readUInt32LE(12);
    const js = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')) as { nodes: { name?: string }[]; animations: { channels: { sampler: number; target: { node: number; path: string } }[]; samplers: { output: number }[] }[]; accessors: { bufferView: number; byteOffset?: number }[]; bufferViews: { byteOffset?: number }[] };
    const bin = 20 + jl + 8;
    const a = js.animations[0];
    const ch = a.channels.find((c) => js.nodes[c.target.node].name === 'beach_ball' && c.target.path === 'translation')!;
    const acc = js.accessors[a.samplers[ch.sampler].output];
    const off = bin + (js.bufferViews[acc.bufferView].byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const t = [0, 4, 8].map((k) => b.readFloatLE(off + k));
    ok(Math.hypot(t[0], t[1], t[2]) > 50, `비치볼 anm00 은 보드 월드 좌표(${t.map((v) => v.toFixed(1)).join(', ')}) — 틀면 공이 ball_anim 에서 64 m 떨어져 돈다`);
  }
  const kin = spec.chars.find((x) => x.pc === 'npc022')!;
  for (const m of ['bd_flag_idle00', 'bd_flag_swing00', 'co_bye00', 'co_joy03', 'bnclr_idle00', 'bnclr_pass00']) ok(!!kin.clips?.[m], `키노피오 모션 ${m}`);
  ok((kin.layers['npc022_body_arr_alb'] ?? []).length === 6, '키노피오 색 층 6');
  const mc = sock('mc_plaza_default_pos')!;
  near(mc.x, -5.06, 0.01, 'MC x');
  near(mc.z, 19.94, 0.01, 'MC z');
  const kq = sock('menu00_ev_quest_start_cut00_npc00_pos')!;
  near(kq.x, 14.93, 0.01, 'Kameck x(LOCATER_QUEST 0)');
  ok(!!wpos(balloonModel, 'pos_takeoff_mc') && !!wpos(balloonModel, 'pos_takeoff_4p_pc03'), '기구 출발 소켓 pos_takeoff_mc·pos_takeoff_4p_pc03');
}

console.log('2. 따라가기(§6.10 ②)');
{
  const humans: PlazaPlayerSetup[] = [
    { slot: 0, chara: 'pc01', isCom: false, local: true, name: 'P1' },
    { slot: 1, chara: 'pc02', isCom: true, local: true, name: 'COM' },
    { slot: 2, chara: 'pc03', isCom: false, local: true, name: 'P3' },
  ];
  const hs = plazaHumans(humans);
  ok(hs.length === 2 && hs[1].slot === 2, 'COM(PlayerType 1) 은 광장에 안 나옴, 사람만 슬롯 순');
  const f = new FollowLogic();
  const free = (): boolean => false;
  const self = new THREE.Vector3(0, 0, 0);
  const lead = new THREE.Vector3(0, 0, 2.5);
  f.step(self, lead, free);
  ok(!f.running, '거리 2.5 (≤ 2.6) 에선 출발 안 함');
  lead.set(0, 0, 2.61);
  f.step(self, lead, free);
  ok(f.running, '거리 2.61 (> 2.6) 출발');
  ok(f.target.distanceTo(new THREE.Vector3(0, 0, 2.5)) < 1e-6, '목표 = 가장 새 점(0.6 이하 이동은 점이 안 바뀜)');
  ok(f.count === 1, `0.6 이하 이동은 새 점 아님: ${f.count}`);
  lead.set(0, 0, 3.3);
  f.step(self, lead, free);
  ok(f.count === 2, '0.6 넘게 움직이면 새 점');
  self.set(0, 0, 1.0);
  f.step(self, lead, free);
  ok(f.running, '거리 2.3(2.0~2.6 사이)에선 그대로');
  self.set(0, 0, 1.4);
  f.step(self, lead, free);
  ok(!f.running, '거리 1.9 (< 2.0) 정지');
  const g = new FollowLogic();
  for (let i = 0; i < 9; i++) g.push(new THREE.Vector3(i, 0, 0));
  ok(g.count === 5 && g.point(0).x === 8 && g.point(4).x === 4, `원형 버퍼 5칸·가장 새 점 앞: ${g.count} ${g.point(0).x} ${g.point(4).x}`);
  const wall = new MeshCollider({ vertices: [-5, -5, 1, 5, -5, 1, 5, 5, 1, -5, 5, 1], indices: [0, 1, 2, 0, 2, 3] });
  const blocked = meshRayBlocked(wall);
  ok(blocked(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), FOLLOW.rayLen), '1.3 m 광선이 1 m 앞 벽에 막힘');
  ok(!blocked(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), FOLLOW.rayLen), '반대쪽은 안 막힘');
  ok(!blocked(new THREE.Vector3(0, 1, -0.5), new THREE.Vector3(0, 0, 1), FOLLOW.rayLen), '1.5 m 앞 벽은 1.3 m 광선 밖');
  const h = new FollowLogic();
  h.push(new THREE.Vector3(0, 0, 10));
  h.push(new THREE.Vector3(3, 0, 0));
  h.step(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 10), (from, dir) => dir.z > 0.9);
  ok(h.running && h.target.x === 3, '가장 새 점이 막히면 다음(더 오래된) 점');
  const ai = autoInterp(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 5, 0.09));
  ok(ai.arrive, '남은 수평 거리 ≤ 6/60 이면 도착(높이 무시)');
  const ai2 = autoInterp(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 4));
  near(ai2.dirX, 0.6, 1e-9, '수평 단위 방향 x');
  const floor = new MeshCollider({ vertices: [-60, 0, -60, 60, 0, -60, 60, 0, 60, -60, 0, 60], indices: [0, 2, 1, 0, 3, 2] });
  const leader = new PlazaMover({ radius: 0.9, height: 1.5 }, floor);
  const fol = new PlazaMover({ radius: 0.9, height: 1.5 }, floor);
  leader.place(new THREE.Vector3(0, 0, 0), 0);
  fol.place(new THREE.Vector3(0, 0, -1.5), 0);
  const logic = new FollowLogic();
  const run = leverToward(0, 1, 1);
  let maxGap = 0;
  let speeds = 0;
  for (let i = 0; i < 300; i++) {
    leader.tick(i < 240 ? run : NO_LEVER);
    logic.step(fol.pos, leader.pos, () => false);
    let lv = NO_LEVER;
    if (logic.running) {
      const r = autoInterp(fol.pos, logic.target);
      if (r.arrive) {
        fol.pos.x = logic.target.x;
        fol.pos.z = logic.target.z;
        logic.running = false;
      } else lv = leverToward(r.dirX, r.dirZ);
    }
    fol.tick(lv);
    if (i > 30 && i < 240) {
      maxGap = Math.max(maxGap, fol.pos.distanceTo(leader.pos));
      speeds = Math.max(speeds, fol.speed);
    }
  }
  const gap = fol.pos.distanceTo(leader.pos);
  ok(gap >= FOLLOW.stopDist - 0.11 && gap <= FOLLOW.startDist + 0.11, `멈춘 뒤 간격 2.0~2.6: ${gap.toFixed(3)}`);
  ok(maxGap < 4, `달리는 동안 간격 유지(< 4): ${maxGap.toFixed(3)}`);
  near(speeds, FOLLOW.speed, 1e-6, '따라가기 속도 = AutoInterpolation 6.0(달리기)');
}

console.log('2b. 원격 표시 actor — OnReceive 거리 분기·AutoInterpolation 하나(12_online_sync §6.2.1)');
{
  const floor = new MeshCollider({ vertices: [-60, 0, -60, 60, 0, -60, 60, 0, 60, -60, 0, 60], indices: [0, 2, 1, 0, 3, 2] });
  const mover = new PlazaMover({ radius: 0.9, height: 1.5 }, floor);
  const m = new RemoteMotion(mover);
  const V = (x: number, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const ticks = (n: number): string[] => {
    const acts: string[] = [];
    for (let i = 0; i < n; i++) acts.push(m.tick());
    return acts;
  };
  m.spawn(V(0, 3, 0), 90);
  ok(mover.pos.y === 0 && mover.yaw === 90 && m.mode === 'spawn', `첫 표시 = 받은 x/z·지면 y·회전 즉시: ${mover.pos.toArray()} ${mover.yaw}`);
  ok(m.receive(V(6), 0) === 'teleport' && mover.pos.x === 6 && mover.yaw === 0, '표시 위치에서 > 5 → 순간이동(위치·회전 즉시)');
  ok(m.receive(V(6.8), 45) === 'rotate' && !m.interp.movePos && m.interp.moveRot, '≤ 1 → 회전 전용 Start(위치 flag 끔)');
  ticks(30);
  ok(mover.pos.x === 6 && Math.abs(mover.yaw - 45) < 1e-9, `회전만: 위치 그대로·몸 선회 도착: ${mover.pos.x} ${mover.yaw}`);
  ok(m.receive(V(8), 90) === 'interp', '1 < d ≤ 5 → 위치·회전 Start');
  ok(m.receive(V(8.5), 90) === 'interp', '거리 = 표시 위치(6) 기준 2.5 m → 보간(마지막 수신 8 기준이면 0.5 m 회전만)');
  const acts = ticks(30);
  const firstIdle = acts.indexOf('Idle');
  ok(acts.slice(0, firstIdle).every((x) => x === 'Run') && firstIdle === 25, `보간 = Run 6 m/s(0.1 m/틱), 2.5 m = 25틱 뒤 도착: ${firstIdle}`);
  ok(mover.pos.x === 8.5 && !m.interp.movePos, '도착 = 목표 x/z 로 맞추고 위치 flag 끔(TryFinish)');
  ok(Math.abs(mover.yaw - 90) < 1e-9, '도착 뒤 수신 회전으로 선회');
  m.receive(V(11), 90);
  ticks(5);
  const mid = mover.pos.x;
  ok(Math.abs(mid - 9) < 1e-9, `보간 5틱 = 0.5 m: ${mid}`);
  ok(m.receive(V(9.5), 90) === 'rotate', '진행 중 ≤ 1 수신 = 회전 전용');
  ticks(10);
  ok(mover.pos.x === mid, '회전 전용은 남은 위치 진행을 멈춤(원본 flag 0x0100)');
  ok(m.receive(V(11), 90) === 'interp', '회전 전용 뒤 > 1 수신 = 다시 위치 Start');
  ticks(30);
  ok(mover.pos.x === 11 && mover.action === 'Idle', `회전 전용 뒤 새 목표로 정상 이동·도착: ${mover.pos.x}`);
  m.receive(V(13), 90);
  ticks(2);
  ok(m.receive(V(30, 4), 90) === 'teleport' && mover.pos.x === 30 && mover.pos.y === 0, '순간이동도 지면 y 재투영');
  ok(m.interp.movePos, '> 5 분기는 보간기를 멈추지 않음(원본 분기에 Stop 없음)');

  const trial = (depth: number, moveTicks: number): { maxErr: number; finalErr: number; modes: Record<string, number>; acts: Record<string, number> } => {
    const snd = new PlazaMover({ radius: 0.9, height: 1.5 }, floor);
    const rcv = new PlazaMover({ radius: 0.9, height: 1.5 }, floor);
    snd.place(V(-20, 0, 5), 90);
    const rm = new RemoteMotion(rcv);
    rm.spawn(snd.pos.clone(), 90);
    const tx = new RemoteSender(0);
    const DT = Math.fround(1 / 60);
    let last = snd.pos.clone();
    let maxErr = 0;
    const modes: Record<string, number> = {};
    const acts: Record<string, number> = {};
    for (let i = 0; i < moveTicks + 120; i++) {
      snd.tick(i < moveTicks ? leverToward(1, 0, depth) : NO_LEVER);
      const a = rm.tick();
      acts[a] = (acts[a] ?? 0) + 1;
      const vel = [(snd.pos.x - last.x) / DT, (snd.pos.y - last.y) / DT, (snd.pos.z - last.z) / DT, 0];
      last = snd.pos.clone();
      if (tx.step(DT, vel)) {
        const q = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v * 256))) / 256;
        const md = rm.receive(V(q(snd.pos.x), q(snd.pos.y), q(snd.pos.z)), snd.yaw);
        modes[md] = (modes[md] ?? 0) + 1;
      }
      if (i < moveTicks) maxErr = Math.max(maxErr, Math.hypot(snd.pos.x - rcv.pos.x, snd.pos.z - rcv.pos.z));
    }
    return { maxErr, finalErr: Math.hypot(snd.pos.x - rcv.pos.x, snd.pos.z - rcv.pos.z), modes, acts };
  };
  const walk = trial(0.5, 120);
  const run = trial(1, 120);
  console.log(`   직선 걷기 2 m/s 2 s(지연 0): 틱별 최대 오차 ${walk.maxErr.toFixed(3)} m, 멈춘 뒤 ${walk.finalErr.toFixed(3)} m, 수신 ${JSON.stringify(walk.modes)}, 표시 액션 ${JSON.stringify(walk.acts)}`);
  console.log(`   직선 달리기 6 m/s 2 s(지연 0): 틱별 최대 오차 ${run.maxErr.toFixed(3)} m, 멈춘 뒤 ${run.finalErr.toFixed(3)} m, 수신 ${JSON.stringify(run.modes)}, 표시 액션 ${JSON.stringify(run.acts)}`);
  ok(walk.maxErr <= 1 + (13 / 60) * 2 + 0.1 + 1e-6, `걷기 오차 ≤ 1(회전만 구간) + 13틱 송신 간격 × 2 m/s + 한 틱: ${walk.maxErr.toFixed(3)}`);
  ok(run.maxErr <= (13 / 60) * 6 + 0.1 + 1e-6, `달리기 오차 ≤ 13틱 송신 간격 × 6 m/s + 한 틱: ${run.maxErr.toFixed(3)}`);
  ok((walk.modes.rotate ?? 0) > 0 && (walk.modes.interp ?? 0) > 0, '걷기 = 회전만·보간이 섞임(0.4 m/패킷)');
  ok((run.modes.rotate ?? 0) === 1 && (run.modes.interp ?? 0) > 0, '달리기 = 출발 첫 패킷(0.1 m)만 회전만, 나머지 보간(1.3 m/패킷 > 1)');
  ok(!walk.acts.Walk && !run.acts.Walk, '표시 actor 는 보간 중 Run 만(원본 보간 속도 6 고정)');
  ok(walk.finalErr <= 1 + (13 / 60) * 2 + 1e-6 && run.finalErr <= (13 / 60) * 6 + 1e-6, `멈춘 뒤 최종 차이(정지 좌표 미송신, 원본과 같음): 걷기 ${walk.finalErr.toFixed(3)}·달리기 ${run.finalErr.toFixed(3)}`);
}

console.log('3. 영역·다가가기(§6.10 ①)');
{
  const P = (k: keyof InteractPoints): THREE.Vector3 => sock(POINT_SOCKETS[k])!.clone();
  const pts: InteractPoints = { center: P('center'), mc: P('mc'), quest: P('quest'), stamp: P('stamp'), card: P('card'), music: P('music'), datahouse: P('datahouse'), ranking: P('ranking'), friend: P('friend') };
  near(pts.center.z, 33, 1e-3, 'GetArea 중심 = camera00_pos z 33');
  near(calcTurnDegY(-1, 0), 270, 1e-9, 'CalcTurnDegY(−1,0) = 270');
  ok(getArea({ x: 0, z: 10 }, pts.center) === AREA.BALLOON, '기구 앞(z<18, |x|<9) = 0');
  ok(getArea({ x: 9.5, z: 10 }, pts.center) !== AREA.BALLOON, 'x = 9.5 는 기구 앞 아님');
  const at = (name: string): THREE.Vector3 => sock(name)!;
  const expect: [string, number][] = [
    ['attach_shop_stamp', AREA.STAMP],
    ['attach_shop_card', AREA.CARD],
    ['attach_shop_music', AREA.MUSIC],
    ['attach_shop_collection', AREA.DATAHOUSE],
    ['attach_shop_ranking', AREA.RANKING],
    ['friendmatch_obj00_pos', AREA.FRIEND],
    ['attach_quest_cart00', AREA.QUEST],
    ['mc_plaza_default_pos', AREA.GUIDE],
    ['char_start_pos', AREA.GUIDE],
  ];
  for (const [n, a] of expect) ok(getArea(at(n), pts.center) === a, `${n} → 영역 ${a} (실제 ${getArea(at(n), pts.center)})`);
  for (const n of ['pc_plaza_balloon_pos_p1_pc00', 'pc_plaza_balloon_pos_p2_pc00', 'pc_plaza_balloon_pos_p3_pc00', 'pc_plaza_balloon_pos_p4_pc00', 'pc_plaza_balloon_pos_p4_pc01'])
    ok(getArea(at(n), pts.center) === AREA.GUIDE, `시작 ${n} (x ${at(n).x.toFixed(6)}) → 1 가이드 (실제 ${getArea(at(n), pts.center)})`);
  for (const n of ['pc_plaza_balloon_pos_p2_pc01', 'pc_plaza_balloon_pos_p4_pc02', 'pc_plaza_balloon_pos_p4_pc03'])
    ok(getArea(at(n), pts.center) === AREA.FRIEND, `시작 ${n} (x > 0) → 7 친구 매치(원본 atan2f(d.x, d.z) 330~360°)`);
  ok(getArea({ x: -1.05, z: 22.3 }, pts.center) === AREA.GUIDE && getArea({ x: 1.05, z: 22.3 }, pts.center) === AREA.FRIEND, '계단 앞 x<0 가이드 / x>0 친구 매치');
  near(calcTurnDegY(pts.center.x + 1.05, pts.center.z - 22.3), 5.6, 0.05, '(−1.05, 22.3) → 5.6°');
  const res = (p: THREE.Vector3, humans = 1, online = false): number => judge(p, pts, humans, online).result;
  ok(res(new THREE.Vector3(0, -2.4, 5)) === RESULT.BALLOON, '기구 앞 → 6');
  ok(res(pts.mc.clone().add(new THREE.Vector3(2.9, 0, 0))) === RESULT.GUIDE, 'MC 2.9 m → 5');
  ok(judge(pts.mc.clone().add(new THREE.Vector3(2.9, 0, 0)), pts, 1, false).nearMc, 'MC 3 m 안 = FragSwing·서로 보기');
  ok(res(pts.mc.clone().add(new THREE.Vector3(3.01, 0, 0))) !== RESULT.GUIDE, 'MC 3.01 m 는 가이드 아님');
  ok(res(pts.stamp.clone().add(new THREE.Vector3(-6.9, 0, 0))) === RESULT.STAMP, '스탬프 직원 6.9 m → 8');
  ok(res(pts.stamp.clone().add(new THREE.Vector3(-7.1, 0, 0))) !== RESULT.STAMP, '스탬프 7.1 m → 아님');
  ok(res(pts.card.clone()) === RESULT.CARD, '카드 → 9');
  ok(res(pts.music.clone().add(new THREE.Vector3(0, 0, -3))) === RESULT.MUSIC, '뮤직 → 10');
  ok(res(pts.datahouse.clone()) === RESULT.DATAHOUSE, '데이터 하우스 → 11');
  ok(res(pts.ranking.clone().add(new THREE.Vector3(3, 0, 0))) === RESULT.RANKING, '랭킹 → 12');
  ok(res(pts.quest.clone().add(new THREE.Vector3(0, 0, 2.9))) === RESULT.QUEST, '퀘스트 2.9 m → 7');
  ok(res(pts.friend.clone().add(new THREE.Vector3(0, 0, 2.5))) === RESULT.ONLINE_MENU, '친구 매치 2.5 m(사람 1) → 3');
  ok(res(pts.friend.clone().add(new THREE.Vector3(0, 0, 2.5)), 4) === 0, '사람 4 이면 친구 매치 안내 없음');
  ok(res(pts.card.clone(), 1, true) === 0, '접속 중이면 상점 안내 없음');
  ok(res(new THREE.Vector3(0, -2.4, 5), 1, true) === RESULT.BALLOON, '접속 중에도 기구는 6');
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 1, 2000);
  cam.position.set(0, 5, 30);
  cam.lookAt(0, 0, 20);
  cam.updateMatrixWorld();
  const pp = popPosition(new THREE.Vector3(0, -2.4, 20), 1.5, cam);
  near(pp.x, pp.ndc[0] * 960 + 70, 1e-9, '안내 x = ndc·960 + 70');
  near(pp.y, pp.ndc[1] * 540, 1e-9, '안내 y = ndc·540');
  const pl = new THREE.Vector3(0, -2.4, 20).add(new THREE.Vector3(0, 1.5 * 0.8, 0)).project(cam);
  near(pp.ndc[1], pl.y, 1e-9, '안내 높이 = PCHeight × 0.8');
}

console.log('4. 결정 → 기구 출발 사건(§6.10 ④)');
{
  const events: [string, unknown][] = [];
  const listeners = new Map<string, ((v: unknown) => void)[]>();
  let exited: unknown = null;
  let buttons = 0;
  const drv: { d: { apply(c: THREE.PerspectiveCamera, df: number): boolean } | null } = { d: null };
  const takeoff = { name: 'pos_balloon_takeoff', frames: 500, loop: false, frame: 0, speed: 1, playing: true, isFinished: () => false, stop() {} };
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 1, 2000);
  camera.position.set(0, 5, 30);
  camera.lookAt(0, 0, 20);
  const actor = { slot: 0, kind: 'input' as const, chara: 'pc01', root: new THREE.Object3D(), pos: new THREE.Vector3(0, -2.4, 10), yaw: 0, speed: 0, motion: 'co_idle00', height: 1.5 };
  const collisions: [string, boolean][] = [];
  const ctx = {
    world: {
      socket: (n: string) => {
        const p = sock(n);
        return p ? { pos: p, quat: new THREE.Quaternion(), node: new THREE.Object3D() } : null;
      },
      entry: () => null,
      play: () => takeoff,
      setCollisionEnabled: (k: string, on: boolean) => collisions.push([k, on]),
      stage: { camera, manifest: { anims: {}, models: {} }, setCameraDriver: (d: typeof drv.d) => (drv.d = d), scene: new THREE.Scene() },
    },
    players: [{ slot: 0, chara: 'pc01', isCom: false, local: true, name: 'P1' }],
    actors: [actor],
    pad: () => ({ buttons, lx: 0, ly: 0, rx: 0, ry: 0 }),
    sound: { se: (l: string) => events.push(['se', l]), bgm: (l: string | null) => events.push(['bgm', l]) },
    overlay: null,
    on: (n: string, fn: (v: unknown) => void) => {
      listeners.set(n, [...(listeners.get(n) ?? []), fn]);
      return () => {};
    },
    emit: (n: string, v?: unknown) => {
      events.push([n, v]);
      for (const fn of listeners.get(n) ?? []) fn(v);
    },
    exit: (e: unknown) => (exited = e),
  } as unknown as PlazaContext;
  const it = new InteractSystem(ctx, null);
  it.update(1);
  ok(it.judge.area === AREA.BALLOON && it.judge.show, '기구 앞: 영역 0·안내 보임');
  ok(events.some(([n, v]) => n === 'interact:telop' && (v as { area: number }).area === 0), "텔롭 'interact:telop' area 0");
  ok(events.some(([n, v]) => n === 'interact:pop' && (v as { visible: boolean }).visible), "'interact:pop' visible");
  it.update(1);
  it.update(1);
  const telops = events.filter(([n, v]) => n === 'interact:telop' && (v as { area: number; visible: boolean }).area === 0 && (v as { visible: boolean }).visible).length;
  ok(telops === 3, `텔롭은 영역이 그대로여도 매 프레임 SetArea+In(원본 MainImpl): ${telops}/3 프레임`);
  ok(TAKEOFF.fadeOutSelectSec === 1, '기구 선택 페이드 아웃 1.0 s(어셈블리)');
  const bs = new BalloonSystem(ctx);
  ctx.on('interact:decide', (v) => {
    if ((v as { result: number }).result === RESULT.BALLOON) bs.begin();
  });
  buttons = 1;
  it.update(1);
  ok(it.state === RESULT.BALLOON, 'A → 상태 6');
  ok(events.some(([n, v]) => n === 'se' && v === 'SQ_SE_SYS_DECI'), 'SQ_SE_SYS_DECI');
  ok(events.some(([n, v]) => n === 'interact:decide' && (v as { result: number }).result === 6), "'interact:decide' result 6");
  ok(events.some(([n, v]) => n === 'player:input' && v === false) && events.some(([n, v]) => n === 'ui:mainLayout' && v === false), 'PlayerManager::Stop·MainMenuLayout Finish 신호');
  ok(bs.phase === 'selectFade' && events.some(([n, v]) => n === 'camera:follow' && v === false), '기구 선택 → 페이드 아웃·추종 카메라 끔');
  const cutJson = (f: string): unknown => JSON.parse(readFileSync(join(WORLD, 'anim', `${f}.json`), 'utf8'));
  const c0 = FsnbCamera.parse(cutJson(TAKEOFF.cut00))!;
  const c1 = FsnbCamera.parse(cutJson(TAKEOFF.cut01))!;
  ok(c0.frames === 260 && c1.frames === 500, `컷 길이 260/500: ${c0.frames}/${c1.frames}`);
  const b = bs as unknown as { clips: Record<string, unknown>; startTakeoff(): void; phase: string };
  b.clips = { cut00: c0, cut01: c1 };
  b.phase = 'setup';
  b.startTakeoff();
  ok(collisions.some(([k, on]) => k === 'CollisionMain' && !on), 'PlayBalloonTakeOff: CollisionMain 끔');
  buttons = 0;
  let cut01At = -1;
  let passAt = -1;
  let whoAt = -1;
  let exitAt = -1;
  for (let f = 1; f <= 600 && exitAt < 0; f++) {
    drv.d?.apply(camera, 1);
    bs.update(1);
    if (cut01At < 0 && bs.phase === 'cut01') cut01At = f;
    if (passAt < 0 && events.some(([n, v]) => n === 'se' && v === 'SM_JIN_MENU_TO_MAP')) passAt = f;
    if (whoAt < 0 && events.some(([n, v]) => n === 'se' && v === 'SQ_SE_MENU00_TRANSITION_WHO')) whoAt = f;
    if (exited) exitAt = f;
  }
  near(cut01At, 260, 1, 'cut00 260f 뒤 cut01(프레임 260 부터)');
  near(passAt - cut01At, 40, 1, '0.6667 s 뒤 쌍안경 건넴·SM_JIN_MENU_TO_MAP');
  near(whoAt, 400, 1, '카메라 프레임 400 에서 SQ_SE_MENU00_TRANSITION_WHO');
  near(exitAt - whoAt, 40, 1, '페이드 아웃 속도 0.5(FadeOut(White, 0.5) @0x7100047a74, 와이프 20프레임 ÷ 0.5 = 40) 뒤 장면 호출');
  ok(JSON.stringify(exited) === JSON.stringify({ k: 'balloon' }), `오프라인 → exit balloon(모드 메뉴): ${JSON.stringify(exited)}`);
  ok(exitAt < takeoff.frames, '출발 애니 500f 가 끝나기 전에 다음 장면');
  const m = srtMaya({ sx: 0.0625, sy: 1, r: 0, tx: -2, ty: 0 }, new THREE.Matrix3());
  const uv = new THREE.Vector3(0.5, 0.5, 1).applyMatrix3(m);
  near(uv.x, 0.0625 * 2.5, 1e-9, 'TexSrt Maya: 눈 띠 tx −2 → 칸 2');
}

console.log('5. NPC 셰이더 그래프(§6.11)');
{
  const spec = JSON.parse(readFileSync(join(WORLD, 'chara', 'spec.json'), 'utf8')) as NpcSpecFile;
  for (const [pc, mats] of Object.entries(GRAPH)) {
    const c = spec.chars.find((x) => x.pc === pc);
    ok(!!c, `GRAPH 모델 ${pc} 가 spec 에 있음`);
    for (const [mat, r] of Object.entries(mats)) {
      for (const t of [r.arr?.tex, r.eye?.tex].filter((x): x is string => !!x)) {
        const files = c?.layers[t] ?? [];
        ok(files.length > 0 && files.every((f) => existsSync(join(WORLD, 'chara', f))), `${pc}/${mat} 텍스처 ${t} 실림(${files.length})`);
      }
    }
  }
  const n = (pc: string, t: string): number => spec.chars.find((x) => x.pc === pc)?.layers[t]?.length ?? 0;
  ok(n('npc022', 'npc022_body_arr_alb') === 6 && n('npc003', 'npc003_body_arr_alb') === 2 && n('npc053', 'npc053_body_arr_alb') === 2 && n('npc002', 'npc002_body_arr_alb') === 5, '배열 층 수 6/2/2/5');
  ok([0, 1, 2, 3, 4, 5, 6, 9, -1].map((p) => layerOf('kinopio', p, 6)).join(',') === '0,1,2,3,4,5,4,4,0', '키노피오 층: 0..5 = P, ≥6 → 4, <0 → 0');
  ok(layerOf('round', 0, 2) === 0 && layerOf('round', 1, 2) === 1 && layerOf('round', 5, 2) === 1, '노코노코 층 = round(P) (층 clamp)');
  ok(layerOf('round', 2, 5) === 2 && layerOf('zero', 1, 2) === 0, '헤이호 2 → 층 2, 눈꺼풀 = 층 0');
  const noko = spec.chars.find((x) => x.pc === 'npc003')!;
  const glb = readFileSync(join(WORLD, 'chara', noko.glb!));
  const js = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as { materials: { name: string; pbrMetallicRoughness?: { baseColorTexture?: unknown } }[] };
  ok(!js.materials.find((m) => m.name === 'body_m')?.pbrMetallicRoughness?.baseColorTexture, '노코노코 body_m glb 알베도 없음 → 배열 층으로 채움(흰색 방지)');
}

console.log(`\n${count - fails}/${count} 통과`);
if (fails) process.exit(1);
