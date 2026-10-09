/**
 * UI 시험 항목 "충돌 질의" — 공용 충돌 런타임(lib/physx wasm·lib/collision·lib/collision-physx·lib/collision-three·view/collision.ts)을 원본 충돌 에셋 한 벌로 본다.
 * 설계: docs/engine/11_moving_collision.md §9. 패널: 맵 고르기(광장·mg0122·mg0101), 질의 종류(CastRay·CastRayAll·CastShape 구/캡슐/박스·All·overlap),
 * 마스크(1 << layer), 원본 인자 비트(+0x40 정렬·+0x41 MESH_MULTIPLE·+0x42/+0xE2 BOTH_SIDES·+0xE1 MTD), 거리.
 * 화면: 왼쪽 끌기 = 회전, 휠 = 거리, 오른쪽 끌기 = 이동, 클릭 = 카메라에서 커서 방향으로 질의(또는 "아래로" 켜면 커서 지점 위에서 아래로).
 * URL: dev/ui?ui=collision&map=plaza
 * 화면 모양 확인은 사용자가 직접.
 */
import * as THREE from 'three';
import { emptyResult, type CastResult, type CollisionGeometry, type MapContact, type Pose, type Vec3, resolveMapContacts } from '@game/lib/collision';
import { CollisionDebugView } from '@game/lib/collision-three';
import { Assets } from '../view/assets';
import { createMpjCollision, loadPhysicsSet, type LoadedEntity, type MpjCollision } from '../view/collision';

export interface CollisionPageRun {
  readonly collision: () => MpjCollision | null;
  stop(): void;
  debug(): string;
}

export interface CollisionPageCfg {
  params: URLSearchParams;
  onDone(result: string): void;
}

const MAPS: Record<string, { dir: string; name: string; mask: number }> = {
  plaza: { dir: 'plaza/world/physics/', name: '광장(menu00)', mask: 1 << 2 },
  mg0122: { dir: 'mg/mg0122/physics/', name: 'mg0122', mask: 1 << 14 },
  mg0101: { dir: 'mg/mg0101/physics/', name: 'mg0101', mask: 1 << 2 },
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

export async function runCollisionPage(host: HTMLElement, cfg: CollisionPageCfg): Promise<CollisionPageRun> {
  const q = cfg.params;
  const canvas = el('canvas', 'position:absolute;inset:0;width:100%;height:100%');
  canvas.className = 'jw-gl';
  const panel = el('div', 'position:absolute;right:8px;top:8px;width:320px;max-height:calc(100% - 16px);overflow:auto;padding:8px;background:rgba(0,0,0,0.75);color:#fff;font:12px/1.5 sans-serif;z-index:3');
  const status = el('pre', 'margin:6px 0 0;font:11px/1.4 monospace;white-space:pre-wrap');
  const result = el('pre', 'margin:6px 0 0;max-height:320px;overflow:auto;font:11px/1.4 monospace;background:rgba(255,255,255,0.08);padding:4px;white-space:pre-wrap');
  host.append(canvas, panel);

  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.setClearColor(0x2c3138, 1);
  const scene = new THREE.Scene();
  scene.add(new THREE.AxesHelper(2));
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  const orbit = { target: new THREE.Vector3(0, 0, 20), yaw: 0.6, pitch: 0.7, dist: 70 };
  const place = (): void => {
    const cp = Math.cos(orbit.pitch);
    camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist, orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist);
    camera.lookAt(orbit.target);
  };
  place();

  const row = (label: string, ...kids: HTMLElement[]): HTMLDivElement => {
    const d = el('div', 'margin:3px 0');
    d.append(el('span', 'display:inline-block;width:70px', label), ...kids);
    return d;
  };
  const check = (label: string, on = false): [HTMLLabelElement, HTMLInputElement] => {
    const l = el('label', 'margin-right:8px');
    const i = el('input', '');
    i.type = 'checkbox';
    i.checked = on;
    l.append(i, document.createTextNode(label));
    return [l, i];
  };
  const num = (v: string, w = 60): HTMLInputElement => {
    const i = el('input', `width:${w}px`);
    i.value = v;
    return i;
  };
  const mapSel = el('select', 'width:200px');
  for (const [k, m] of Object.entries(MAPS)) mapSel.append(new Option(m.name, k));
  mapSel.value = MAPS[q.get('map') ?? ''] ? (q.get('map') as string) : 'plaza';
  const modeSel = el('select', 'width:200px');
  for (const [v, t] of [
    ['ray', 'CastRay'],
    ['rayAll', 'CastRayAll'],
    ['sphere', 'CastShape 구 r'],
    ['capsule', 'CastShape 캡슐(엔진 Y축) r·h'],
    ['box', 'CastShape 박스 반폭 r·h·r'],
    ['sphereAll', 'CastShapeAll 구'],
    ['overlap', 'Map 접촉(캡슐 overlap + penetration)'],
  ])
    modeSel.append(new Option(t, v));
  const maskIn = num('0x4', 90);
  const distIn = num('200');
  const rIn = num('0.5');
  const hIn = num('0.25');
  const [downL, downIn] = check('아래로(커서 지점 위 30 m)', true);
  const [sortL, sortIn] = check('+0x40 정렬', true);
  const [multiL, multiIn] = check('+0x41 MESH_MULTIPLE');
  const [bothL, bothIn] = check('BOTH_SIDES(+0x42/+0xE2)');
  const [mtdL, mtdIn] = check('+0xE1 MTD');
  const [shapesL, shapesIn] = check('형상 그리기', true);
  panel.append(
    el('div', 'font-weight:bold', '충돌 질의(PhysX 4.1.2 wasm)'),
    row('맵', mapSel),
    row('질의', modeSel),
    row('mask', maskIn, el('span', 'margin-left:6px;opacity:.7', '= 1 << layer 의 합')),
    row('거리', distIn),
    row('r · h', rIn, hIn),
    el('div', '', ''),
    downL, sortL, multiL, bothL, mtdL, shapesL,
    status,
    result,
  );

  const assets = new Assets('');
  let col: MpjCollision | null = null;
  let view: CollisionDebugView | null = null;
  let loaded: LoadedEntity[] = [];
  let token = 0;
  const outAll: CastResult[] = [];
  const one = emptyResult();
  const contacts: MapContact[] = [];

  const load = async (): Promise<void> => {
    const my = ++token;
    if (view) {
      scene.remove(view.root);
      view.dispose();
      view = null;
    }
    col?.dispose();
    col = null;
    const m = MAPS[mapSel.value];
    maskIn.value = `0x${m.mask.toString(16)}`;
    status.textContent = '읽는 중…';
    const c = await createMpjCollision();
    const ents = await loadPhysicsSet(c, assets, m.dir, 2);
    if (my !== token) {
      c.dispose();
      return;
    }
    col = c;
    loaded = ents;
    view = new CollisionDebugView(c.world, (h) => c.backend.debugMeshes.get(h) ?? null);
    view.rebuild();
    view.root.visible = shapesIn.checked;
    scene.add(view.root);
    const box = new THREE.Box3().setFromObject(view.root);
    if (!box.isEmpty()) {
      box.getCenter(orbit.target);
      orbit.dist = Math.max(10, box.getSize(new THREE.Vector3()).length() * 0.9);
      place();
    }
    status.textContent =
      `엔티티 ${ents.length}: ${ents.map((e) => `${e.entity.name}(layer ${e.entity.layer ?? '-'}, 형상 ${e.shapes.length})`).join(', ')}\n` +
      `PhysX ${c.px.x.px_physx_version().toString(16)} ABI ${c.px.x.px_abi_version()} 메모리 ${(c.px.x.memory.buffer.byteLength / 1048576).toFixed(0)} MiB`;
    result.textContent = '화면을 클릭하면 질의한다';
  };

  const mask = (): number => Number(maskIn.value) >>> 0;
  const fmt = (v: ArrayLike<number>): string => Array.from(v).map((x) => x.toFixed(3)).join(', ');
  const line = (r: CastResult, i: number | null): string =>
    `${i === null ? '' : `#${i} `}dist ${r.distance.toFixed(4)} validity ${r.validity}${r.initialOverlap ? ' initialOverlap' : ''}\n` +
    `  pos (${fmt(r.position)}) n (${fmt(r.normal)})\n  face ${r.faceIndex === 0xffffffff ? '-' : r.faceIndex} flags 0x${r.flags.toString(16)} tag ${r.tag ?? '-'} shape ${r.shape.toString(16)} entity ${r.entity.index}`;

  const geometry = (): CollisionGeometry => {
    const r = Number(rIn.value) || 0.5;
    const h = Number(hIn.value) || 0.25;
    if (modeSel.value === 'capsule') return { kind: 'capsule', radius: r, halfHeight: h };
    if (modeSel.value === 'box') return { kind: 'box', halfExtents: [r, h, r] };
    return { kind: 'sphere', radius: r };
  };

  const cast = (origin: Vec3, dir: Vec3): void => {
    if (!col || !view) return;
    const w = col.world;
    view.clearMarks();
    const distance = Number(distIn.value) || 100;
    const mode = modeSel.value;
    const t0 = performance.now();
    const lines: string[] = [];
    if (mode === 'ray' || mode === 'rayAll') {
      const arg = { origin, direction: dir, distance, mask: mask(), sort: sortIn.checked, meshMultiple: multiIn.checked, bothSides: bothIn.checked };
      if (mode === 'ray') {
        const ok = w.castRay(arg, one);
        view.ray(origin, dir, distance, ok ? one.distance : null);
        if (ok) view.hit(one);
        lines.push(ok ? line(one, null) : '없음');
      } else {
        const k = w.castRayAll(arg, outAll, 64);
        view.ray(origin, dir, distance, null);
        for (let i = 0; i < k; i++) {
          view.hit(outAll[i]);
          lines.push(line(outAll[i], i));
        }
        if (!k) lines.push('없음');
      }
      lines.unshift(`hitFlags 0x${((multiIn.checked ? 0x423 : 0x403) | (bothIn.checked ? 0x80 : 0)).toString(16)} mask 0x${mask().toString(16)}`);
    } else if (mode === 'overlap') {
      const g: CollisionGeometry = { kind: 'capsule', radius: Number(rIn.value) || 0.5, halfHeight: Number(hIn.value) || 0.25 };
      const hitOk = w.castRay({ origin, direction: dir, distance, mask: mask() }, one);
      const p: Pose = hitOk ? [one.position[0], one.position[1] + 0.5, one.position[2], 0, 0, 0, 1] : [origin[0], origin[1], origin[2], 0, 0, 0, 1];
      const k = w.mapContacts(g, p, mask(), null, contacts);
      const avg = resolveMapContacts(contacts);
      view.sweepShape(g, p);
      lines.push(`캡슐 중심 (${fmt(p)}) 접촉 ${k}(후보 ≤ ${w.rules.mapCandidates}, depth > ${w.rules.mapMinDepth})`);
      for (const c of contacts) lines.push(`  shape ${c.shape.toString(16)} depth ${c.depth.toFixed(4)} dir (${fmt(c.direction)})`);
      lines.push(`평균 보정 (${fmt(avg)})`);
      const moved: Pose = [p[0] + avg[0], p[1] + avg[1], p[2] + avg[2], 0, 0, 0, 1];
      view.sweepShape(g, moved, 0x7cff6b);
    } else {
      const g = geometry();
      const all = mode === 'sphereAll';
      const arg = { shape: { geometry: g }, position: origin, rotation: [0, 0, 0, 1] as [number, number, number, number], direction: dir, distance, mask: mask(), sort: sortIn.checked, mtd: mtdIn.checked, bothSides: bothIn.checked };
      view.sweepShape(g, [origin[0], origin[1], origin[2], 0, 0, 0, 1]);
      if (!all) {
        const ok = w.castShape(arg, one);
        view.ray(origin, dir, distance, ok ? Math.max(0, one.distance) : null);
        if (ok) {
          const d = Math.max(0, one.distance);
          view.sweepShape(g, [origin[0] + dir[0] * d, origin[1] + dir[1] * d, origin[2] + dir[2] * d, 0, 0, 0, 1], 0x7cff6b);
          view.hit(one);
        }
        lines.push(ok ? line(one, null) : '없음');
      } else {
        const k = w.castShapeAll(arg, outAll, 64);
        view.ray(origin, dir, distance, null);
        for (let i = 0; i < k; i++) {
          view.hit(outAll[i]);
          lines.push(line(outAll[i], i));
        }
        if (!k) lines.push('없음');
      }
      lines.unshift(`hitFlags 0x${((mtdIn.checked ? 0x603 : 0x403) | (bothIn.checked ? 0x80 : 0)).toString(16)} mask 0x${mask().toString(16)}`);
    }
    lines.unshift(`${mode} 원점 (${fmt(origin)}) 방향 (${fmt(dir)}) ${(performance.now() - t0).toFixed(2)} ms`);
    result.textContent = lines.join('\n');
  };

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag: { x: number; y: number; button: number; moved: boolean } | null = null;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.button === 2) {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const s = orbit.dist * 0.0015;
      orbit.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
    } else {
      orbit.yaw -= dx * 0.005;
      orbit.pitch = Math.max(-1.5, Math.min(1.5, orbit.pitch + dy * 0.005));
    }
    place();
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (!d || d.moved || d.button !== 0) return;
    const rc = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin;
    const dir = ray.ray.direction;
    if (downIn.checked && col) {
      const pick = col.world.castRay({ origin: [o.x, o.y, o.z], direction: [dir.x, dir.y, dir.z], distance: 5000, mask: 0xffffffff, bothSides: true }, one);
      if (pick) {
        cast([one.position[0], one.position[1] + 30, one.position[2]], [0, -1, 0]);
        return;
      }
    }
    cast([o.x, o.y, o.z], [dir.x, dir.y, dir.z]);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.dist = Math.max(2, Math.min(800, orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
    place();
  }, { passive: false });
  mapSel.addEventListener('change', () => void load());
  shapesIn.addEventListener('change', () => {
    if (view) view.root.visible = shapesIn.checked;
  });

  const fit = (): void => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    gl.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  let raf = 0;
  let stopped = false;
  const loop = (): void => {
    if (stopped) return;
    gl.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  await load();

  return {
    collision: () => col,
    stop() {
      stopped = true;
      token++;
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (view) view.dispose();
      col?.dispose();
      gl.dispose();
      canvas.remove();
      panel.remove();
    },
    debug: () => (col ? `${mapSel.value} 엔티티 ${loaded.length} 오류 ${col.px.errorCount}` : '읽는 중'),
  };
}
