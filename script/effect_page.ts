/**
 * UI 시험 항목 "이펙트 런타임" — 공용 이펙트 런타임(lib/effect·lib/effect-three·view/effect.ts)을 이미터셋 하나로 본다. 설계: docs/engine/08_effects.md §14.9.
 * 패널: 이미터셋 고르기, 재생·정지(Stop false = 즉시 kill / true = fade)·반복, 원본 스위치(끄면 RULES_WEB, 다시 만듦), 부착 대상(없음·원 궤도 물체),
 *       이미터별 입자 수·사건 로그(create·start·emit·stop·release·missing).
 * URL: ui.html?ui=effect&set=mg1801_water_entry00&original=0
 * 화면 모양 확인은 사용자가 직접.
 */
import * as THREE from 'three';
import { Assets } from './view/assets';
import { MpjEffects, assetsLoader } from './view/effect';

export interface EffectPageRun {
  readonly fx: () => MpjEffects | null;
  stop(): void;
  debug(): string;
}

export interface EffectPageCfg {
  params: URLSearchParams;
  onDone(result: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

export async function runEffectPage(host: HTMLElement, cfg: EffectPageCfg): Promise<EffectPageRun> {
  const q = cfg.params;
  const canvas = el('canvas', 'position:absolute;inset:0;width:100%;height:100%');
  canvas.className = 'jw-gl';
  const panel = el('div', 'position:absolute;right:8px;top:8px;width:300px;max-height:calc(100% - 16px);overflow:auto;padding:8px;background:rgba(0,0,0,0.7);color:#fff;font:12px/1.5 sans-serif;z-index:3');
  const status = el('pre', 'margin:6px 0 0;font:11px/1.4 monospace;white-space:pre-wrap');
  const logBox = el('pre', 'margin:6px 0 0;max-height:200px;overflow:auto;font:11px/1.4 monospace;background:rgba(255,255,255,0.08);padding:4px');
  host.append(canvas, panel);

  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.setClearColor(0x3a4048, 1);
  const scene = new THREE.Scene();
  scene.add(new THREE.GridHelper(10, 20, 0x888888, 0x5a5a5a));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshBasicMaterial({ color: 0x2d5d86, transparent: true, opacity: 0.5 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.82;
  scene.add(water);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  camera.position.set(0, 6.5, 11);
  camera.lookAt(0, 0.5, 0);
  const mover = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffcc33 }));
  scene.add(mover);

  const row = (label: string, ...kids: HTMLElement[]): HTMLDivElement => {
    const d = el('div', 'margin:3px 0');
    d.append(el('span', 'display:inline-block;width:64px', label), ...kids);
    return d;
  };
  const btn = (text: string, f: () => void): HTMLButtonElement => {
    const b = el('button', 'margin:0 4px 0 0', text);
    b.addEventListener('click', f);
    return b;
  };
  const setSel = el('select', 'width:200px');
  const origIn = el('input', '');
  origIn.type = 'checkbox';
  origIn.checked = q.get('original') !== '0';
  const loopIn = el('input', '');
  loopIn.type = 'checkbox';
  loopIn.checked = q.get('loop') !== '0';
  const attachSel = el('select', '');
  for (const [v, t] of [
    ['none', '없음(원점)'],
    ['orbit', '원 궤도 물체'],
  ])
    attachSel.append(new Option(t, v));
  const scaleIn = el('input', 'width:60px');
  scaleIn.type = 'number';
  scaleIn.step = '0.1';
  scaleIn.value = q.get('scale') ?? '1';
  panel.append(
    el('div', 'font-weight:bold', '이펙트 런타임'),
    row('셋', setSel),
    row('', btn('재생', () => play()), btn('정지', () => stopFx(false)), btn('fade', () => stopFx(true))),
    row('반복', loopIn),
    row('원본', origIn),
    row('부착', attachSel),
    row('배율', scaleIn),
    status,
    logBox,
  );

  const assets = new Assets('mg1801/');
  let fx: MpjEffects | null = null;
  let handle = -1;
  let seenEvents = 0;
  const lines: string[] = [];
  const log = (s: string): void => {
    lines.push(s);
    if (lines.length > 200) lines.shift();
    logBox.textContent = lines.join('\n');
    logBox.scrollTop = logBox.scrollHeight;
  };
  let token = 0;
  const load = async (): Promise<void> => {
    const my = ++token;
    fx?.dispose();
    fx = null;
    handle = -1;
    seenEvents = 0;
    const f = new MpjEffects(scene, { loader: assetsLoader(assets), original: origIn.checked, name: 'effect_page', warn: (m) => log(`경고 ${m}`) });
    await f.load();
    if (my !== token) {
      f.dispose();
      return;
    }
    fx = f;
    const keep = setSel.value || q.get('set') || 'mg1801_water_entry00';
    setSel.textContent = '';
    for (const n of f.core.registry.names) setSel.append(new Option(n, n));
    setSel.value = f.core.registry.names.includes(keep) ? keep : f.core.registry.names[0];
    log(`규칙 ${f.core.rules.id} · 리소스 ${f.core.registry.resources.join(' → ')}`);
    play();
  };
  const play = (): void => {
    if (!fx) return;
    const attach = attachSel.value === 'orbit' ? mover : null;
    handle = fx.play(setSel.value, attach ? null : { x: 0, y: 0, z: 0 }, { scale: Number(scaleIn.value) || 1, attach, selfDestroy: true });
  };
  const stopFx = (fade: boolean): void => {
    if (fx && handle >= 0) fx.stop(handle, fade);
    loopIn.checked = false;
  };
  setSel.addEventListener('change', () => play());
  origIn.addEventListener('change', () => void load());

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
  let last = performance.now();
  let stopped = false;
  let t = 0;
  const loop = (now: number): void => {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    t += dt;
    mover.position.set(Math.sin(t) * 2, 0.5, Math.cos(t) * 1.2);
    mover.visible = attachSel.value === 'orbit';
    if (fx) {
      fx.update(dt);
      const c = fx.core;
      if (loopIn.checked && (handle < 0 || !c.has(handle))) play();
      for (; seenEvents < c.eventCount; seenEvents++) {
        if (c.eventCount - seenEvents > 64) seenEvents = c.eventCount - 64;
        const e = c.events[seenEvents & 63];
        log(`${e.step} ${e.kind} ${e.name}${e.kind === 'emit' ? ` +${e.count}` : ''} #${e.handle}`);
      }
      const ems = handle >= 0 ? c.emitters(handle) : [];
      status.textContent =
        `스텝 ${c.steps} 이펙트 ${c.activeCount} 핸들 ${handle}${c.has(handle) ? '' : ' (끝)'}\n` +
        (ems.length ? ems.map((e) => `${e.name.padEnd(14)} ${String(e.live).padStart(5)}${e.done ? ' 방출끝' : ''}`).join('\n') : '-') +
        `\n풀 입자 합 ${c.pools.reduce((s, p) => s + p.count, 0)}`;
    }
    gl.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  await load();

  return {
    fx: () => fx,
    stop() {
      stopped = true;
      token++;
      cancelAnimationFrame(raf);
      ro.disconnect();
      fx?.dispose();
      gl.dispose();
      canvas.remove();
      panel.remove();
    },
    debug: () => (fx ? `${setSel.value} 핸들 ${handle} 이펙트 ${fx.core.activeCount} 입자 ${fx.core.pools.reduce((s, p) => s + p.count, 0)}` : '읽는 중'),
  };
}
