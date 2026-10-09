/**
 * 광장 B 갈래 시험 — 1번 플레이어 이동(player.ts)·추종 카메라(camera.ts)를 노드에서 돈다.
 * 기대값 근거: docs/shell/plaza_3d.md §3.5(actorparam.json·FollowPlayerImpl 어셈블리 판독). 원본 실행 대조가 아니라 판독식의 재구현 시험이다.
 * 충돌은 원본 CollisionMain(PhysX 삼각 메시 → extracted/converted/scene/apx obj)을 stage3d MeshCollider 로 읽는다.
 *
 *   npx tsx tools/test_plaza_move.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { MeshCollider } from '../script/shell/stage3d/meshCollider';
import { ACTOR, leverFromStick, NO_LEVER, PlazaMover, startSocketCount, transitBlend, wrapDeg, type Lever, type Transit } from '@app/scene/world/plaza/player';
import { applyPose, isBalloonFront, MenuCameraFollow } from '@app/scene/world/plaza/camera';
import type { PlazaCameraParam } from '@app/scene/world/plaza/types';

const ROOT = join(import.meta.dirname, '..', '..');
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
function nearV(a: THREE.Vector3, b: [number, number, number], eps: number, msg: string): void {
  ok(a.distanceTo(new THREE.Vector3(...b)) <= eps, `${msg}: ${a.toArray().map((x) => x.toFixed(4))} != ${b}`);
}

function plane(y: number, half = 50): MeshCollider {
  return new MeshCollider({ vertices: [-half, y, -half, half, y, -half, half, y, half, -half, y, half], indices: [0, 2, 1, 0, 3, 2] });
}

const cam = new THREE.PerspectiveCamera(40, 16 / 9, 1, 2000);
cam.position.set(0, 0, 10);
cam.lookAt(0, 0, 0);

const param = JSON.parse(readFileSync(join(ROOT, 'extracted/bea/menu~menu00.nx.bea/menu/menu00/data/CameraParam.json'), 'utf-8').replace(/^﻿/, '')) as PlazaCameraParam;
const actorParam = JSON.parse(readFileSync(join(ROOT, 'extracted/bea/bq.nx.bea/common/data/actorparam.json'), 'utf-8').replace(/^﻿/, '')).ActorParam as number[][];
const spec = JSON.parse(readFileSync(join(ROOT, 'web/assets/plaza/player/spec.json'), 'utf-8')) as { transit: Transit[]; chars: { pc: string; glb: string; clips: Record<string, unknown> }[] };

console.log('1. ActorParam 값(데이터) ↔ player.ts');
near(ACTOR.runSpeed, actorParam[0][0], 0, '달리기 행0');
near(ACTOR.walkSpeed, actorParam[1][0], 0, '걷기 행1');
near(ACTOR.airAccel, actorParam[2][0], 0, '공중 가속 행2');
near(ACTOR.turnGround, actorParam[3][0], 0, '땅 선회 행3');
near(ACTOR.turnGroundFast, actorParam[4][0], 0, '빠른 선회 행4');
near(ACTOR.turnFastDeg, actorParam[5][0], 0, '문턱 행5');
near(ACTOR.turnAir, actorParam[6][0], 0, '공중 선회 행6');
near(ACTOR.turnAirFast, actorParam[7][0], 0, '공중 빠른 선회 행7');
near(ACTOR.leverRun, actorParam[32][0], 0, '레버 문턱 행32');

console.log('2. 레버(카메라 기준) · 달리기 문턱');
{
  const up = leverFromStick(0, 1, cam);
  near(up.dirX, 0, 1e-6, '위 = 카메라 앞 x');
  near(up.dirZ, -1, 1e-6, '위 = 카메라 앞 z');
  near(Math.abs(up.deg), 180, 1e-6, '위 각');
  const right = leverFromStick(1, 0, cam);
  near(right.dirX, 1, 1e-6, '오른쪽 x');
  near(right.deg, 90, 1e-6, '오른쪽 각');
  near(leverFromStick(1, 1, cam).depth, 1, 1e-9, '대각 깊이 1 로 자름');
  const m = new PlazaMover({ radius: 0.9, height: 1.54 }, plane(0));
  m.place(new THREE.Vector3(0, 0, 0), 0);
  const at = (d: number): string => m.tick({ ...leverFromStick(0, d, cam) });
  ok(at(0.79) === 'Walk', '깊이 0.79 → Walk');
  ok(at(0.8) === 'Run', '깊이 0.8 → Run');
  ok(at(0.01) === 'Walk', '깊이 0.01 → Walk');
  ok(m.tick(NO_LEVER) === 'Idle', '깊이 0 → Idle');
  near(m.speed, 0, 0, 'Idle 들어가면 속도 0');
}

console.log('3. 속도(1 s = 60 프레임, 평지)');
{
  for (const [depth, expect, name] of [[0.5, 2, '걷기'], [1, 6, '달리기']] as const) {
    const m = new PlazaMover({ radius: 0.9, height: 1.54 }, plane(0));
    m.place(new THREE.Vector3(0, 0, 0), 90);
    const lv: Lever = leverFromStick(depth, 0, cam);
    for (let i = 0; i < 60; i++) m.tick(lv);
    near(m.pos.x, expect, 1e-6, `${name} 60f 이동 x`);
    near(m.speed, expect, 1e-9, `${name} 속도`);
    near(m.pos.y, 0, 1e-9, `${name} 지면 y`);
  }
}

console.log('4. 선회(360°/s, 85° 이상 1100°/s)');
{
  const m = new PlazaMover({ radius: 0.9, height: 1.54 }, plane(0));
  m.place(new THREE.Vector3(0, 0, 0), 0);
  const back = leverFromStick(0, -1, cam);
  near(back.deg, 0, 1e-6, '아래 = 카메라 쪽(+Z) 0°');
  const left: Lever = { ...leverFromStick(-1, 0, cam), depth: 0.5 };
  m.tick(left);
  near(m.yaw, -1100 / 60, 1e-9, '90° 차 → 첫 프레임 1100/60');
  m.tick(left);
  near(m.yaw, -1100 / 60 - 360 / 60, 1e-9, '차 71.7° (<85) → 둘째 프레임 360/60');
  let n = 2;
  while (Math.abs(wrapDeg(m.yaw + 90)) > 1e-9 && n < 100) {
    m.tick(left);
    n++;
  }
  ok(n === 13, `90° 도는 데 13 프레임(1 + ceil(71.67/6)): ${n}`);
  const m2 = new PlazaMover({ radius: 0.9, height: 1.54 }, plane(0));
  m2.place(new THREE.Vector3(0, 0, 0), 0);
  const up = leverFromStick(0, 1, cam);
  let k = 0;
  while (Math.abs(wrapDeg(m2.yaw - 180)) > 1e-9 && k < 100) {
    m2.tick(up);
    k++;
  }
  ok(k === 6 + Math.ceil((180 - 6 * (1100 / 60)) / 6), `180° 회전 = 1100°/s 6 프레임 + 360°/s 12 프레임: ${k}`);
  near(m2.pos.z, -6 * k / 60, 1e-6, '이동은 레버 방향 바로(몸 회전과 무관)');
}

console.log('5. 지면 보정(아래 d+0.4 안 붙이기, 위 0.5 안 오르기, 그 밖 낙하 49 m/s²)');
{
  const m = new PlazaMover({ radius: 0.9, height: 1.54 }, plane(0));
  m.place(new THREE.Vector3(0, 0.39, 0), 0);
  m.tick(NO_LEVER);
  near(m.pos.y, 0, 1e-9, '0.39 위 → 붙음');
  ok(m.grounded, '붙은 뒤 접지');
  const m2 = new PlazaMover({ radius: 0.9, height: 1.54 }, plane(0));
  m2.place(new THREE.Vector3(0, 0.6, 0), 0);
  m2.tick(NO_LEVER);
  ok(!m2.grounded, '0.6 위 → 공중');
  m2.tick(NO_LEVER);
  ok(m2.action === 'Fall', '공중 → Fall');
  near(m2.vVert, -(9.8 * 5) / 60, 1e-9, '낙하 1 프레임 속도 = −9.8·5/60');
  let f = 0;
  while (!m2.grounded && f < 60) {
    m2.tick(NO_LEVER);
    f++;
  }
  ok(m2.grounded && Math.abs(m2.pos.y) < 1e-9, `착지 y 0 (${f} f)`);
  const m3 = new PlazaMover({ radius: 0.9, height: 1.54 }, MeshCollider.merge([plane(0), new MeshCollider({ vertices: [0.5, 0.3, -5, 5, 0.3, -5, 5, 0.3, 5, 0.5, 0.3, 5], indices: [0, 2, 1, 0, 3, 2] })]));
  m3.place(new THREE.Vector3(0, 0, 0), 90);
  for (let i = 0; i < 30; i++) m3.tick({ ...leverFromStick(1, 0, cam), depth: 0.5 });
  near(m3.pos.y, 0.3, 1e-6, '0.3 턱 오름');
}

console.log('6. 원본 CollisionMain(삼각 4440) 위 보행');
{
  const obj = readFileSync(join(ROOT, 'extracted/converted/scene/apx/menu~menu00__menu__menu00__map__72cbf6799dc022826ea52ed8ed6d9c3f.obj'), 'utf-8');
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const line of obj.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') vertices.push(+p[1], +p[2], +p[3]);
    else if (p[0] === 'f') indices.push(...p.slice(1, 4).map((x) => parseInt(x, 10) - 1));
  }
  const col = new MeshCollider({ vertices, indices });
  ok(col.triangles === 4440, `삼각형 4440: ${col.triangles}`);
  const g = col.groundHeight(0, 22.316, -2.365);
  ok(!!g, '시작 자리 지면 있음');
  if (g) near(g.y, -2.365, 0.05, '시작 자리 지면 y');
  const m = new PlazaMover({ radius: 0.9, height: 1.54 }, col);
  m.place(new THREE.Vector3(0, -2.365, 22.316), 180);
  const towardShop = leverFromStick(0, -1, cam);
  for (let i = 0; i < 600; i++) m.tick(towardShop);
  ok(m.grounded, '10 s 달린 뒤 접지');
  ok(m.pos.z > 25.49 - 0.9 - 0.1 && m.pos.z < 25.49 - 0.9 + 0.1, `+Z 로 달리면 중앙 원형 벽(z 25.49)에 반지름 0.9 앞에서 막힘 z=${m.pos.z.toFixed(3)}`);
  near(m.pos.y, -2.266, 1e-3, '벽 앞 0.099 턱(바닥 −2.266)에 올라섬');
  console.log(`   +Z 달리기 10 s → (${m.pos.toArray().map((x) => x.toFixed(3))})`);
  for (const x of [0, -1, 1]) {
    const s = new PlazaMover({ radius: 0.9, height: 1.54 }, col);
    s.place(new THREE.Vector3(x, -2.365, 22.316), 180);
    let reached = -1;
    for (let i = 0; i < 360 && reached < 0; i++) {
      s.tick({ depth: 1, dirX: 0, dirZ: -1, deg: 180 });
      if (s.pos.z < 9 && s.pos.y >= -0.01) reached = i;
    }
    ok(reached >= 0, `계단 오르기 x=${x}: 시작 → 기구 앞(z < 9, y ≥ 0) ${reached >= 0 ? `${(reached / 60).toFixed(2)} s` : `실패 (${s.pos.toArray().map((v) => v.toFixed(2))})`}`);
  }
}

console.log('7. 모션 전이(sys_pc.mpat)');
{
  near(transitBlend(spec.transit, 'co_idle00', 'co_walk00')! * 60, 12, 1e-9, 'idle→walk 12f');
  near(transitBlend(spec.transit, 'co_walk00', 'co_run00')! * 60, 8, 1e-9, 'walk→run 8f');
  near(transitBlend(spec.transit, 'co_run00', 'co_walk00')! * 60, 12, 1e-9, 'run→walk 12f');
  near(transitBlend(spec.transit, 'co_walk00', 'co_idle00')! * 60, 12, 1e-9, 'walk→idle 12f');
  near(transitBlend(spec.transit, 'co_run00', 'co_idle00')! * 60, 10, 1e-9, 'run→idle 10f');
  ok(spec.chars.length === 22 && spec.chars.every((c) => c.glb && ['co_idle00', 'co_walk00', 'co_run00'].every((k) => k in c.clips)), '22명 glb 에 co_idle00·co_walk00·co_run00');
  ok(spec.chars.every((c) => ['mn_bnclr_get00', 'mn_bnclr_idle00'].every((k) => k in c.clips)), '22명 glb 에 쌍안경 mn_bnclr_get00·mn_bnclr_idle00');
  const clips = spec.chars[0].clips as Record<string, { frames: number; loop: boolean }>;
  ok(clips.mn_bnclr_get00.loop === false && clips.mn_bnclr_idle00.loop === true, `get00 1회·idle00 루프: ${JSON.stringify([clips.mn_bnclr_get00, clips.mn_bnclr_idle00])}`);
  ok(transitBlend(spec.transit, 'co_idle00', 'mn_bnclr_get00') === undefined, 'bnclr 전이는 sys_pc.mpat 에 없음 → MotionArg 기본');
}

console.log('7c. LookAt(기구 선택: 입력 끔 → balloon_pos 쪽으로 선회 규칙 그대로)');
{
  const m = new PlazaMover({ radius: 0.9, height: 1.54 }, plane(0));
  m.place(new THREE.Vector3(0, 0, 22.316), 0);
  m.inputEnabled = false;
  m.lookAt(new THREE.Vector3(0, 0, 0));
  near(Math.abs(m.targetYaw), 180, 1e-9, '목표 회전 = balloon_pos 쪽 180°');
  let n = 0;
  while (Math.abs(wrapDeg(m.yaw - m.targetYaw)) > 1e-9 && n < 100) {
    ok(m.tick(leverFromStick(0, 1, cam)) === 'Idle', '입력 꺼짐 → Idle 유지');
    n++;
  }
  ok(n === 18, `180° = 1100°/s 6f + 360°/s 12f = 18f: ${n}`);
  near(m.pos.z, 22.316, 1e-9, 'LookAt 중 이동 없음');
  const m2 = new PlazaMover({ radius: 0.9, height: 1.54 }, plane(0));
  m2.place(new THREE.Vector3(3, 0, 3), 0);
  m2.lookAt(new THREE.Vector3(0, 5, 0), true);
  near(m2.yaw, -135, 1e-9, 'immediate(SetRotateLookAt) = 바로, y 무시');
}

console.log('7b. 시작 소켓 사람 수(COM 제외)');
{
  const P = (local: boolean, isCom: boolean) => ({ local, isCom });
  ok(startSocketCount([P(true, false), P(true, true), P(true, true), P(true, true)]) === 1, '사람 1 + COM 3 → p1');
  ok(startSocketCount([P(true, false), P(true, false), P(true, true), P(false, false)]) === 2, '사람 2 + COM 1 + 원격 1 → p2');
  ok(startSocketCount([P(true, false), P(true, false), P(true, false), P(true, false)]) === 4, '사람 4 → p4');
  ok(startSocketCount([]) === 1, '없으면 p1');
}

console.log('8. 추종 카메라(FollowPlayerImpl)');
{
  const c = new MenuCameraFollow(param);
  nearV(c.target, [0, -2.365, 22.316], 1e-6, '목표 시작 = char_plaza_default_pos');
  const pose = c.pose();
  ok(!isBalloonFront(c.target), '시작 목표는 기구 앞 아님(z 22.3 ≥ 18)');
  nearV(pose.at, [0, -2.365 + 2.5, 22.316], 1e-6, '평소 주시점 +2.5');
  nearV(pose.eye, [0, -2.365 + 2.5 + 10 * Math.sin((15 * Math.PI) / 180), 22.316 + 10], 1e-6, '평소 눈 = 주시점 + 10·(중심 쪽 수평 단위, sin15)');
  near(pose.fovy, 40, 0, '평소 fovy 40');
  const c2 = new MenuCameraFollow(param);
  c2.target.set(0, 0, 0);
  c2.follow(new THREE.Vector3(2.9, 0, 0), new THREE.Vector3(0, 0, 1));
  nearV(c2.target, [0, 0, 0], 0, '거리 2.9 ≤ 3 → 안 움직임');
  c2.follow(new THREE.Vector3(4, 0, 0), new THREE.Vector3(0, 0, 1));
  nearV(c2.target, [4 * (16 / 9) * 0.01, 0, 0], 1e-7, '옆 4 → d·k·0.01 (k = 16/9)');
  const c3 = new MenuCameraFollow(param);
  c3.target.set(0, 0, 0);
  c3.follow(new THREE.Vector3(0, 0, -4), new THREE.Vector3(0, 0, 1));
  nearV(c3.target, [0, 0, -2 * 4 * (16 / 9) * 0.01], 1e-7, '카메라 앞 4 → 두 배');
  const b = new MenuCameraFollow(param);
  b.target.set(3, -2.365, 13.5);
  const pb = b.pose();
  near(pb.t, 0.5, 1e-9, '기구 앞 z 13.5 → t 0.5');
  nearV(pb.at, [1.5, -2.365 + 2.5 + 0.5 * 5.5, 13.5], 1e-6, '섞인 주시점');
  near(pb.fovy, 52.5, 1e-9, '섞인 fovy');
  const vx = 0 - 1.5;
  const vz = 33 - 13.5;
  const vl = Math.hypot(vx, vz);
  nearV(pb.eye, [1.5 + 14 * (vx / vl), pb.at.y + 14 * Math.sin((7.5 * Math.PI) / 180), 13.5 + 14 * (vz / vl)], 1e-6, '섞인 눈(길이 14, 각 7.5°)');
  const b2 = new MenuCameraFollow(param);
  b2.target.set(2, -2.365, 5);
  const p2 = b2.pose();
  near(p2.t, 1, 0, 'z 5 → t 1');
  nearV(p2.at, [0, -2.365 + 8, 9], 1e-6, 't 1 → z 9·x 0·+8');
  nearV(p2.eye, [0, -2.365 + 8, 27], 1e-6, 't 1 → 눈 길이 18, 각 0');
  near(p2.fovy, 65, 0, 't 1 → fovy 65');
  const b3 = new MenuCameraFollow(param);
  b3.target.set(9, 0, 10);
  ok(b3.pose().t === -1, 'x = 9 은 기구 앞 아님(엄격 부등호)');
  const cam2 = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 5000);
  applyPose(cam2, pose);
  ok(cam2.near === 1 && cam2.far === 2000 && cam2.fov === 40, 'near 1·far 2000·fovy');
  const dir = new THREE.Vector3();
  cam2.getWorldDirection(dir);
  ok(dir.z < 0, '카메라는 중심 쪽에서 플레이어(−Z)를 봄');
}

console.log('8b. 캡처 구도 재검증(내려보는 각 = atan(sin 각), 세로 fov)');
{
  const pitch = (q: { at: THREE.Vector3; eye: THREE.Vector3 }): number => THREE.MathUtils.radToDeg(Math.atan2(q.eye.y - q.at.y, Math.hypot(q.eye.x - q.at.x, q.eye.z - q.at.z)));
  const c = new MenuCameraFollow(param);
  const p0 = c.pose();
  near(pitch(p0), THREE.MathUtils.radToDeg(Math.atan(Math.sin((15 * Math.PI) / 180))), 1e-9, '평소 내려보는 각 14.51°');
  near(Math.hypot(p0.eye.x - p0.at.x, p0.eye.z - p0.at.z), 10, 1e-9, '평소 수평 거리 = 길이 10(cos 곱 없음)');
  c.target.set(0, -2.365, 14.4);
  const p10 = c.pose();
  near(p10.t, 0.4, 1e-9, '캡처 10 구도: z 14.4 → t 0.4');
  near(pitch(p10), THREE.MathUtils.radToDeg(Math.atan(Math.sin((9 * Math.PI) / 180))), 1e-6, '캡처 10: 내려보는 각 8.9°');
  near(p10.fovy, 50, 1e-9, '캡처 10: fovy 50');
  const horizon = 0.5 - 0.5 * Math.tan((pitch(p10) * Math.PI) / 180) / Math.tan((p10.fovy * Math.PI) / 360);
  ok(horizon > 0.3 && horizon < 0.36, `캡처 10: 수평선 화면 높이 ${horizon.toFixed(3)}(캡처 ≈0.29~0.33)`);
  c.target.set(0, -2.365, 5);
  const p11 = c.pose();
  near(pitch(p11), 0, 1e-9, '캡처 11: 수평 시선(수평선 가운데)');
  const basket = (2 * Math.atan(2.5 / Math.abs(p11.eye.z))) / (2 * Math.atan(Math.tan((65 * Math.PI) / 360) * (16 / 9)));
  ok(basket > 0.09 && basket < 0.13, `캡처 11: 바구니(지름 5 m) 화면 폭 비 ${basket.toFixed(3)}(캡처 ≈0.11)`);
}

console.log('9. 플레이어·카메라 함께(달리며 따라가기)');
{
  const m = new PlazaMover({ radius: 0.9, height: 1.54 }, plane(-2.365));
  m.place(new THREE.Vector3(0, -2.365, 22.316), 180);
  const c = new MenuCameraFollow(param);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 1, 2000);
  applyPose(camera, c.pose());
  let maxLag = 0;
  for (let i = 0; i < 240; i++) {
    m.tick(leverFromStick(1, 0, camera));
    c.step(m.pos, camera);
    maxLag = Math.max(maxLag, m.pos.distanceTo(c.target));
  }
  console.log(`   오른쪽 달리기 4 s: 플레이어 (${m.pos.toArray().map((x) => x.toFixed(3))}), 목표 (${c.target.toArray().map((x) => x.toFixed(3))}), 최대 거리 ${maxLag.toFixed(3)}`);
  ok(maxLag > 3 && maxLag < 6, `달리기 중 목표 지연 3~6 m: ${maxLag}`);
  const m2 = new PlazaMover({ radius: 0.9, height: 1.54 }, plane(-2.365));
  m2.place(new THREE.Vector3(0, -2.365, 22.316), 180);
  const c2 = new MenuCameraFollow(param);
  applyPose(camera, c2.pose());
  for (let i = 0; i < 180; i++) {
    m2.tick(leverFromStick(0, 1, camera));
    c2.step(m2.pos, camera);
  }
  const pz = c2.pose();
  console.log(`   기구 쪽 달리기 3 s: 플레이어 z ${m2.pos.z.toFixed(3)}, 목표 z ${c2.target.z.toFixed(3)}, t ${pz.t.toFixed(4)}, fovy ${pz.fovy.toFixed(3)}`);
  ok(pz.t > 0, '기구 앞으로 오면 섞임 시작');
}

console.log(`\n${count - fails}/${count} 통과`);
if (fails) process.exit(1);
