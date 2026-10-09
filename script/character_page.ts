/**
 * UI 시험 항목 "캐릭터 런타임" — 공용 캐릭터 런타임(lib/character·lib/character-three·view/character.ts)을 캐릭터 하나로 본다. 설계: docs/engine/09_character.md §14.5.
 * 패널: 캐릭터 고르기, 모션 목록 재생(블렌드 초·속도·같은 모션 다시·다음 모션), 원본 스위치(모션 전이·시선), 시선 대상(드래그·자동 원·없음),
 *       발소리 지면(co_ground), 사건 로그(SE·보이스·진동·이펙트 — 모션 프레임 이벤트 FTRG).
 * URL: ui.html?ui=character&pc=pc01&motion=co_walk00&original=0
 * 화면 모양 확인은 사용자가 직접. 소리 = mgscene 사운드 표에 있는 라벨만 들린다(없는 라벨은 로그만).
 */
import * as THREE from 'three';
import type { CharacterEvent } from './lib/character';
import type { PadSource } from './view/input';
import { AudioOut } from './view/audio';
import { Assets } from './view/assets';
import { MgSceneSound } from './view/mgsceneSound';
import { createCharacter, routeCharacterEvents, type MpjCharacter } from './view/character';

export interface CharacterPageRun {
  readonly chara: () => MpjCharacter | null;
  stop(): void;
  debug(): string;
}

export interface CharacterPageCfg {
  params: URLSearchParams;
  pads: (PadSource | null)[];
  muted: boolean;
  onDone(result: string): void;
}

const PCS = ['pc01', 'pc02', 'pc03', 'pc04', 'pc05', 'pc06', 'pc07', 'pc08', 'pc09', 'pc11', 'pc12', 'pc13', 'pc14', 'pc50', 'pc51', 'pc52', 'pc53', 'pc54', 'pc56', 'pc58', 'pc61', 'pc62'];
/** footstep_param GroundParam 일부(05 §7.7) */
const GROUNDS = ['', 'earth', 'stone', 'sand', 'wood_light', 'wood_heavy', 'grass', 'lawn', 'snow_soft', 'ice', 'water_1'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

export async function runCharacterPage(host: HTMLElement, cfg: CharacterPageCfg): Promise<CharacterPageRun> {
  const q = cfg.params;
  const canvas = el('canvas', 'position:absolute;inset:0;width:100%;height:100%');
  canvas.className = 'jw-gl';
  const panel = el('div', 'position:absolute;right:8px;top:8px;width:300px;max-height:calc(100% - 16px);overflow:auto;padding:8px;background:rgba(0,0,0,0.7);color:#fff;font:12px/1.5 sans-serif;z-index:3');
  const logBox = el('pre', 'margin:6px 0 0;max-height:220px;overflow:auto;font:11px/1.4 monospace;background:rgba(255,255,255,0.08);padding:4px');
  host.append(canvas, panel);

  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.setClearColor(0x5a6470, 1);
  const scene = new THREE.Scene();
  const dir = new THREE.DirectionalLight(0xffffff, Math.PI * 0.6);
  dir.position.set(0, 6, 8);
  scene.add(dir, new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.6));
  const grid = new THREE.GridHelper(10, 20, 0x888888, 0x666666);
  scene.add(grid);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffcc33 }));
  target.position.set(0.8, 1.3, 1.5);
  scene.add(target);
  let yaw = 0;
  let dist = 4.5;
  const aimCam = (): void => {
    camera.position.set(Math.sin(yaw) * dist, 1.3, Math.cos(yaw) * dist);
    camera.lookAt(0, 0.85, 0);
  };
  aimCam();

  const audio = cfg.muted ? null : new AudioOut();
  void audio?.resume();
  const sound = await MgSceneSound.load(audio, [{ assets: new Assets('mgscene/'), path: 'sound/sound.json' }]).catch(() => null);

  /* ---------- 패널 ---------- */
  const row = (label: string, ...kids: HTMLElement[]): HTMLDivElement => {
    const d = el('div', 'margin:3px 0;display:flex;gap:4px;align-items:center;flex-wrap:wrap');
    d.append(el('span', 'min-width:64px', label), ...kids);
    panel.append(d);
    return d;
  };
  const sel = (opts: string[], v: string): HTMLSelectElement => {
    const s = el('select', 'max-width:200px');
    for (const o of opts) s.append(new Option(o || '(없음)', o));
    s.value = v;
    return s;
  };
  const num = (v: number, step: number): HTMLInputElement => {
    const i = el('input', 'width:56px');
    i.type = 'number';
    i.step = String(step);
    i.value = String(v);
    return i;
  };
  const chk = (v: boolean): HTMLInputElement => {
    const i = el('input', '');
    i.type = 'checkbox';
    i.checked = v;
    return i;
  };
  const btn = (t: string, f: () => void): HTMLButtonElement => {
    const b = el('button', '', t);
    b.addEventListener('click', f);
    return b;
  };
  panel.append(el('div', 'font-weight:bold;margin-bottom:4px', '캐릭터 런타임'));
  const pcSel = sel(PCS, PCS.includes(q.get('pc') ?? '') ? q.get('pc')! : 'pc01');
  const origIn = chk(q.get('original') !== '0');
  row('캐릭터', pcSel, btn('다시 읽기', () => void load()));
  row('원본 스위치', origIn, el('span', 'opacity:0.7', 'mpat·전이 clamp·뒤 시선'));
  const motionSel = sel([], '');
  motionSel.size = 8;
  motionSel.style.width = '100%';
  panel.append(motionSel);
  const blendIn = num(-1, 0.05);
  const speedIn = num(1, 0.1);
  const forceIn = chk(false);
  const nextSel = sel([''], '');
  row('블렌드 초', blendIn, el('span', 'opacity:0.7', '−1 = 기본(0.1)'));
  row('속도', speedIn, el('span', '', '다시'), forceIn);
  row('다음', nextSel);
  const playBtn = btn('재생', () => play());
  row('', playBtn);
  motionSel.addEventListener('dblclick', () => play());
  const lookSel = sel(['drag', 'circle', 'camera', 'none'], 'drag');
  const headIn = chk(true);
  const eyesIn = chk(true);
  row('시선', lookSel, el('span', '', '머리'), headIn, el('span', '', '눈'), eyesIn);
  const groundSel = sel(GROUNDS, 'wood_light');
  row('지면', groundSel);
  const status = el('div', 'margin-top:4px;font:11px monospace;white-space:pre');
  panel.append(status, el('div', 'margin-top:6px', '사건 로그 (SE·보이스·진동·이펙트)'), logBox);
  panel.append(el('div', 'margin-top:4px;opacity:0.7', '캔버스 드래그 = 시선 대상 이동(drag), 휠 = 거리, 오른쪽 드래그 = 회전'));

  let ch: MpjCharacter | null = null;
  let off: (() => void) | null = null;
  const lines: string[] = [];
  const counts: Record<string, number> = { se: 0, voice: 0, vib: 0, fx: 0 };
  const log = (e: CharacterEvent): void => {
    counts[e.kind]++;
    lines.unshift(`${String(ch?.steps ?? 0).padStart(5)} ${e.kind.padEnd(5)} ${e.motion}@${e.frame} ${e.key} → ${e.label}${e.ground ? ` [${e.ground}]` : ''}${e.cond.length ? ` 조건:${e.cond.join(',')}` : ''}`);
    if (lines.length > 60) lines.pop();
    logBox.textContent = lines.join('\n');
  };

  const play = (): void => {
    if (!ch || !motionSel.value) return;
    const b = Number(blendIn.value);
    ch.play(motionSel.value, { blend: b >= 0 ? b : undefined, speed: Number(speedIn.value) || 1, force: forceIn.checked, next: nextSel.value || undefined });
  };

  let token = 0;
  const load = async (): Promise<void> => {
    const my = ++token;
    off?.();
    ch?.dispose();
    ch = null;
    status.textContent = '읽는 중…';
    const c = await createCharacter(pcSel.value, { renderer: gl, original: origIn.checked, mpat: ['mg1801_pc', 'sys_pc'], ftrgPrefixes: ['rc_'] });
    if (my !== token) {
      c.dispose();
      return;
    }
    ch = c;
    scene.add(c.root);
    c.setGround(groundSel.value || null);
    off = routeCharacterEvents(c, { sound, pad: cfg.pads[0] ?? null, log });
    const names = Object.keys(c.spec.clips ?? {}).filter((n) => n !== 'fcl_blink00');
    motionSel.replaceChildren(...names.map((n) => new Option(`${n} (${c.spec.clips![n].frames}${c.spec.clips![n].loop ? ' 루프' : ''})`, n)));
    nextSel.replaceChildren(new Option('(없음)', ''), ...names.map((n) => new Option(n, n)));
    const m = q.get('motion');
    if (m && names.includes(m)) {
      motionSel.value = m;
      play();
    }
  };
  pcSel.addEventListener('change', () => void load());
  origIn.addEventListener('change', () => void load());
  groundSel.addEventListener('change', () => ch?.setGround(groundSel.value || null));

  /* ---------- 시선 대상 드래그·카메라 ---------- */
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane();
  const ndc = new THREE.Vector2();
  let drag = 0;
  const onDown = (e: PointerEvent): void => {
    drag = e.button === 2 ? 2 : 1;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!drag) return;
    if (drag === 2) {
      yaw -= e.movementX * 0.01;
      aimCam();
      return;
    }
    if (lookSel.value !== 'drag') return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), target.position);
    ray.ray.intersectPlane(plane, target.position);
  };
  const onUp = (): void => {
    drag = 0;
  };
  const onWheel = (e: WheelEvent): void => {
    dist = Math.min(12, Math.max(1.5, dist + Math.sign(e.deltaY) * 0.3));
    aimCam();
    e.preventDefault();
  };
  const noMenu = (e: Event): void => e.preventDefault();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', noMenu);

  const fit = (): void => {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    gl.setPixelRatio(devicePixelRatio);
    gl.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(host);

  let raf = 0;
  let last = performance.now();
  let stopped = false;
  let t = 0;
  const loop = (now: number): void => {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    t += dt;
    if (lookSel.value === 'circle') target.position.set(Math.sin(t) * 1.6, 1.2 + Math.sin(t * 0.7) * 0.4, Math.cos(t) * 1.6);
    target.visible = lookSel.value !== 'none' && lookSel.value !== 'camera';
    if (ch) {
      ch.headOn = headIn.checked;
      ch.eyesOn = eyesIn.checked;
      ch.lookAt(lookSel.value === 'none' ? null : lookSel.value === 'camera' ? camera.position : target.position);
      ch.update(dt);
      const m = ch.core.main;
      const hl = ch.head?.look;
      status.textContent =
        `${ch.pc} ${m.name} f${m.frame.toFixed(1)}/${m.frameMax}${m.loop ? ' 루프' : ''} 상태 ${m.state}\n` +
        `다음 ${m.queuedName ?? '-'} 속도 ${m.speed}  전이 ${m.transitType ? `${m.transitType} ${m.transitElapsed.toFixed(3)}/${m.transitDuration.toFixed(3)}s` : '-'}\n` +
        `시선 ${hl ? `w ${hl.usedWeight} 눈 ${hl.eyesActive ? '켬' : '끔'} yaw ${hl.eyeYaw.toFixed(2)} pitch ${hl.eyePitch.toFixed(2)}` : '없음'}\n` +
        `사건 SE ${counts.se} 보이스 ${counts.voice} 진동 ${counts.vib} 이펙트 ${counts.fx}`;
    }
    gl.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  await load();

  return {
    chara: () => ch,
    stop() {
      stopped = true;
      token++;
      cancelAnimationFrame(raf);
      ro.disconnect();
      off?.();
      ch?.dispose();
      sound?.dispose();
      void audio?.ctx.close();
      gl.dispose();
      canvas.remove();
      panel.remove();
    },
    debug: () => {
      const m = ch?.core.main;
      return m ? `${ch!.pc} ${m.name} f${m.frame.toFixed(1)} 사건 ${lines.length}` : '읽는 중';
    },
  };
}
