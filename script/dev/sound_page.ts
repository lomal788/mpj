/**
 * UI 시험 항목 "사운드 런타임" — 공용 사운드 런타임(lib/sound·lib/sound-webaudio·view/sound.ts)을 게임 경로 소비자 그대로 본다. 설계: docs/engine/04_sound.md §13.
 * 소비자: 리듬 RmSoundMap(assets/mg1801/manifest.json — 시퀀스·스트림·렌더 BGM·프리셋 치환·3D·플레이어 한도)과 틀 MgSceneSound(assets/mgscene/sound/sound.json).
 * 패널: 라벨 재생·3D 재생(위치)·라벨 정지, 리듬 마스터·OP, 세팅 프리셋, 그룹 정지(그룹·페이드), 덕킹(0x0d·0x13), 원본 스위치(끄면 RULES_WEB, AudioOut 을 새로 만듦),
 *       살아 있는 핸들 목록·명령 로그(start·stop·gain·pan·local).
 * URL: dev/ui?ui=sound&original=0&label=SQ_SE_MG1801_JUST
 * 소리 확인은 사용자가 직접.
 */
import * as THREE from 'three';
import { RULES_ORIGINAL, RULES_WEB, soundDefaults, type SoundCmd } from '@game/lib/sound';
import { RmSoundMap } from '@app/minigame/kit/rhythm/view/sound';
import { Assets } from '../view/assets';
import { AudioOut } from '../view/audio';
import { MgSceneSound } from '../view/mgsceneSound';
import { soundSystem, type MpjSound } from '../view/sound';

export interface SoundPageRun {
  readonly sys: () => MpjSound | null;
  stop(): void;
  debug(): string;
}

export interface SoundPageCfg {
  params: URLSearchParams;
  muted: boolean;
  onDone(result: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

const GROUPS: [number, string][] = [
  [0x20, '0x20 전부'],
  [0x22, '0x22 BGM'],
  [0x23, '0x23 징글'],
  [0x24, '0x24 SE(_SE_)'],
  [0x01, '0x01 SQ_SE'],
  [0x25, '0x25 보이스'],
  [0x29, '0x29 환경음'],
  [0x27, '0x27 시퀀스'],
  [0x26, '0x26 스트림'],
];

export async function runSoundPage(host: HTMLElement, cfg: SoundPageCfg): Promise<SoundPageRun> {
  const q = cfg.params;
  const panel = el('div', 'position:absolute;inset:8px;overflow:auto;padding:8px;background:#20242a;color:#eee;font:12px/1.5 sans-serif');
  const handles = el('pre', 'margin:6px 0 0;max-height:220px;overflow:auto;font:11px/1.4 monospace;background:rgba(255,255,255,0.06);padding:4px');
  const logBox = el('pre', 'margin:6px 0 0;max-height:240px;overflow:auto;font:11px/1.4 monospace;background:rgba(255,255,255,0.06);padding:4px');
  host.append(panel);

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);
  camera.position.set(0, 6.5, 11);
  camera.lookAt(0, 0.5, 0);
  camera.updateMatrixWorld();

  let audio: AudioOut | null = null;
  let sys: MpjSound | null = null;
  let rm: RmSoundMap | null = null;
  let mg: MgSceneSound | null = null;
  let labels: string[] = [];
  const log: string[] = [];
  const push = (s: string): void => {
    log.push(s);
    if (log.length > 200) log.shift();
    logBox.textContent = log.slice(-60).join('\n');
  };

  const row = (label: string, ...kids: HTMLElement[]): HTMLDivElement => {
    const d = el('div', 'margin:4px 0');
    d.append(el('span', 'display:inline-block;width:88px', label), ...kids);
    return d;
  };
  const btn = (text: string, f: () => void): HTMLButtonElement => {
    const b = el('button', 'margin:0 4px 0 0', text);
    b.onclick = f;
    return b;
  };
  const num = (v: number, min: number, max: number, step: number): HTMLInputElement => {
    const i = el('input', 'width:120px;vertical-align:middle');
    i.type = 'range';
    i.min = String(min);
    i.max = String(max);
    i.step = String(step);
    i.value = String(v);
    return i;
  };

  const original = el('input', '');
  original.type = 'checkbox';
  original.checked = q.get('original') !== '0';
  const labelSel = el('select', 'max-width:260px');
  const px = num(0, -30, 30, 0.5);
  const pz = num(0, -80, 20, 0.5);
  const posTxt = el('span', 'margin-left:6px');
  const presetSel = el('select', '');
  for (const p of ['mg1801', 'mg1800_cmn', 'mg1801_result']) presetSel.append(new Option(p, p));
  const groupSel = el('select', '');
  for (const [g, n] of GROUPS) groupSel.append(new Option(n, String(g)));
  const fade = num(0.5, 0, 2, 0.1);
  const duckSel = el('select', '');
  for (const g of [0x0d, 0x13]) duckSel.append(new Option(`0x${g.toString(16)}`, String(g)));
  const status = el('div', 'margin-top:6px');

  const ev = (e: Parameters<RmSoundMap['onEvent']>[0]): void => {
    if (!rm) return;
    rm.onEvent(e, 120, camera);
    push(`사건 ${JSON.stringify(e)}`);
  };
  const pos = (): { x: number; y: number; z: number } => ({ x: Number(px.value), y: 1, z: Number(pz.value) });
  posTxt.textContent = '';
  px.oninput = pz.oninput = () => (posTxt.textContent = `(${px.value}, 1, ${pz.value})`);

  panel.append(
    el('div', 'font-weight:bold', '사운드 런타임 (04 §13)'),
    row('원본 스위치', original, el('span', 'margin-left:4px', '끄면 RULES_WEB(AudioOut 새로)')),
    row('라벨', labelSel),
    row('', btn('재생', () => ev({ k: 'se', label: labelSel.value })), btn('3D 재생', () => ev({ k: 'se3d', label: labelSel.value, pos: pos() })), btn('라벨 정지', () => ev({ k: 'soundStop', label: labelSel.value }))),
    row('3D 위치', px, pz, posTxt),
    row('리듬', btn('마스터', () => ev({ k: 'se', label: 'SQ_BGM_RC_MAIN_RHYTHM' })), btn('OP', () => ev({ k: 'se', label: 'SQ_BGM_RC_MGCMN_OP' })), btn('JUST 콤보', () => ev({ k: 'justSound', combo: 3, play: true })), btn('BGM 정지', () => ev({ k: 'bgmStop' }))),
    row('프리셋', presetSel, btn('켜기', () => ev({ k: 'soundPreset', name: presetSel.value }))),
    row(
      '그룹 정지',
      groupSel,
      fade,
      btn('정지', () => {
        if (!sys) return;
        const n = sys.core.stopGroup(Number(groupSel.value), Number(fade.value));
        sys.flush();
        push(`그룹 0x${Number(groupSel.value).toString(16)} 정지 ${fade.value} s → ${n}개`);
      }),
    ),
    row(
      '틀 사건',
      btn('징글 WIN', () => mg?.onEvents([{ k: 'jingle', label: 'SM_JIN_MG_WIN' }])),
      btn('BGM MGINST', () => mg?.onEvents([{ k: 'bgm', label: 'SM_BGM_MGINST', region: null }])),
      btn('호루라기', () => mg?.onEvents([{ k: 'se', label: 'SQ_SE_SYS_WHISTLE' }])),
      btn('0x20 정지', () => mg?.onEvents([{ k: 'groupStop', groups: [0x20], sec: 0.5 }])),
    ),
    row(
      '덕킹',
      duckSel,
      btn('켬', () => {
        sys?.core.duckGroup(Number(duckSel.value), true);
        sys?.flush();
      }),
      btn('끔', () => {
        sys?.core.duckGroup(Number(duckSel.value), false);
        sys?.flush();
      }),
    ),
    status,
    el('div', 'margin-top:6px', '핸들'),
    handles,
    el('div', 'margin-top:6px', '명령 로그'),
    logBox,
  );

  let token = 0;
  const build = async (): Promise<void> => {
    const my = ++token;
    rm?.stopBgm();
    mg?.dispose();
    audio?.dispose();
    audio = null;
    sys = null;
    rm = null;
    mg = null;
    soundDefaults.rules = original.checked ? RULES_ORIGINAL : RULES_WEB;
    if (cfg.muted) {
      status.textContent = '소리 끔 — 패널만';
      return;
    }
    const a = new AudioOut();
    void a.resume();
    const s = soundSystem(a);
    const drain = s.core.drain.bind(s.core);
    s.core.drain = (fn: (c: SoundCmd) => void): void =>
      drain((c) => {
        if (c.op === 'start') push(`start h${c.h} ${c.label}${c.target !== c.label ? ` → ${c.target}` : ''} 음량 ${c.gain.toFixed(3)} 팬 ${c.pan.toFixed(2)}`);
        else if (c.op === 'stop') push(`stop h${c.h} ${c.label} 페이드 ${c.time}`);
        else push(`${c.op} h${c.h} ${c.label}${c.op === 'gain' ? ` ${c.gain.toFixed(3)} / ${c.time} s` : ''}${c.op === 'local' ? ` L${c.index}=${c.value}` : ''}`);
        fn(c);
      });
    const r = new RmSoundMap(new Assets('mg1801/'), a, 'mg1801');
    status.textContent = '읽는 중…';
    await r.load((n, total) => (status.textContent = `읽는 중 ${n}/${total}`));
    const m = await MgSceneSound.load(a, [{ assets: new Assets('mgscene/'), path: 'sound/sound.json' }]);
    if (my !== token) {
      r.stopBgm();
      m.dispose();
      a.dispose();
      return;
    }
    audio = a;
    sys = s;
    rm = r;
    mg = m;
    const manifest = await new Assets('mg1801/').json<{ sounds: Record<string, unknown> }>('manifest.json');
    labels = Object.keys(manifest.sounds).sort();
    labelSel.replaceChildren(...labels.map((l) => new Option(l, l)));
    const want = q.get('label');
    if (want && labels.includes(want)) labelSel.value = want;
    status.textContent = `규칙 ${s.rules.id}`;
    push(`AudioOut 새로 — 규칙 ${s.rules.id}`);
  };
  original.onchange = () => void build();
  await build();

  const timer = setInterval(() => {
    if (!sys || !rm) return;
    rm.observe(sys.audio.ctx.currentTime);
    sys.update();
    const rows: string[] = [];
    sys.core.forEach((h, label) => rows.push(`h${h} ${label}${sys!.core.target(h) !== label ? ` → ${sys!.core.target(h)}` : ''}`));
    handles.textContent = rows.join('\n') || '(없음)';
    status.textContent = `규칙 ${sys.rules.id} · 핸들 ${rows.length} · 재생 ${sys.core.stats.played} 거절 ${sys.core.stats.rejected} 밀림 ${sys.core.stats.evicted} · 디코드 ${sys.decode.size}`;
  }, 100);

  return {
    sys: () => sys,
    stop() {
      token++;
      clearInterval(timer);
      rm?.stopBgm();
      mg?.dispose();
      audio?.dispose();
      panel.remove();
    },
    debug: () => (sys ? `규칙 ${sys.rules.id} 핸들 ${sys.core.count} 재생 ${sys.core.stats.played} 라벨 ${labels.length}` : '읽는 중'),
  };
}
