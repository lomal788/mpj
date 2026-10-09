/**
 * 페이지 ↔ 미니게임 3D 결과 무대(shell/mgresult) 단독 시험 — ui.html?ui=mgresult. 틀(shell/mgscene) 없이 시험용 호스트(검은 막 와이프·글자 텔롭)로 돌린다.
 * URL: ?mgr=<규칙> vs4|2vs2|1vs3|1vs1|coin|coin-team|chara|charank|boss|quest|bossrush (기본 vs4)
 *      ?wl=1000   플레이어별 승패(1 승·0 패·2 무, 글자 수 = 인원 1~4)   ?coin=5,0,2,0  플레이어별 코인(coin 규칙)
 *      ?pcs=pc01,pc02,pc03,pc04  캐릭터   ?team=0011  TeamID   ?order=0123  GetOrder   ?camtype=0|1(Normal|Overlook)   ?campat=-1|0|1
 *      ?theme=pc14  테마 캐릭터(JudgeType ≠ 0 일 때)   ?judge=1  JudgeType   ?seed=1  주사위 동기 난수 씨앗   ?off=0,0,0  SetPcPosOffset
 * 화면 모양 확인은 사용자가 직접(docs/shell/minigame_result.md §12.7 체크 목록).
 */
import * as THREE from 'three';
import { ASSETS } from './env';
import { MT19937 } from './core/rng';
import { createResultStage, type ResultStageEvent, type ResultStageExt, type ResultStageInputExt } from './shell/mgresult';
import { DEFAULT_RESULT_OPTIONS } from './shell/mgscene/resultContract';

export interface MgResultRun {
  readonly stage: ResultStageExt;
  stop(): void;
  debug(): string;
}

export interface MgResultPageCfg {
  params: URLSearchParams;
  onDone(result: string): void;
}

const RULES: Record<string, Partial<ResultStageInputExt>> = {
  vs4: { gameRule: 0 },
  '2vs2': { gameRule: 1 },
  '1vs3': { gameRule: 2 },
  '1vs1': { gameRule: 3 },
  coin: { gameRule: 0, isCoin: true },
  'coin-team': { gameRule: 1, isCoin: true },
  chara: { gameRule: 0, isChara: true, judgeType: 1 },
  charank: { gameRule: 0, isChara: true, judgeType: 0 },
  boss: { gameRule: 9 },
  quest: { gameRule: 9, boardMode: 2 },
  bossrush: { gameRule: 9, playMode: 6 },
};

const DEFAULT_PCS = ['pc01', 'pc02', 'pc03', 'pc04'];

export function inputFromParams(q: URLSearchParams): ResultStageInputExt {
  const rule = RULES[q.get('mgr') ?? 'vs4'] ?? RULES.vs4;
  const wl = (q.get('wl') ?? '1000').replace(/[^012]/g, '').slice(0, 4) || '1';
  const n = wl.length;
  const pcs = (q.get('pcs') ?? '').split(',').filter((s) => /^pc\d\d$/.test(s));
  const coins = (q.get('coin') ?? '').split(',').map((s) => Number(s) || 0);
  const team = q.get('team') ?? (rule.gameRule === 1 ? '0011' : rule.gameRule === 2 ? '0111' : '0000');
  const order = q.get('order') ?? '0123';
  const seed = Number(q.get('seed') ?? 1) >>> 0;
  const mt = new MT19937(seed);
  const off = (q.get('off') ?? '0,0,0').split(',').map((s) => Number(s) || 0);
  return {
    mgId: 'test',
    gameRule: rule.gameRule ?? 0,
    isCoin: !!rule.isCoin,
    isChara: !!rule.isChara,
    judgeType: q.has('judge') ? Number(q.get('judge')) : (rule.judgeType ?? 0),
    boardMode: rule.boardMode ?? 0,
    playMode: rule.playMode ?? 0,
    players: Array.from({ length: n }, (_, k) => ({
      pid: k,
      chara: pcs[k] ?? DEFAULT_PCS[k],
      order: Number(order[k] ?? k),
      teamId: Number(team[k] ?? 0),
      isCom: k > 0,
      winLose: Number(wl[k]) as 0 | 1 | 2,
      rank: 0,
      coin: rule.isCoin ? (coins[k] ?? (k === 0 ? 5 : 0)) : 0,
    })),
    opts: {
      ...DEFAULT_RESULT_OPTIONS,
      cameraType: Number(q.get('camtype') ?? 0),
      cameraPattern: Number(q.get('campat') ?? -1),
      pcPosOffset: [off[0] ?? 0, off[1] ?? 0, off[2] ?? 0],
      themeChara: q.get('theme'),
    },
    rand: () => mt.nextU32(),
  };
}

export async function runMgResult(host: HTMLElement, cfg: MgResultPageCfg): Promise<MgResultRun> {
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const veil = document.createElement('div');
  veil.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none';
  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;right:12px;bottom:12px;padding:4px 8px;background:rgba(0,0,0,0.6);color:#fff;font:14px monospace;white-space:pre;pointer-events:none';
  host.append(canvas, veil, label);
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.setClearColor(0x4a4a4a, 1);

  let fade = { from: 0, to: 0, t: 0, dur: 0 };
  let telop = { on: false, outAt: -1 };
  let frame = 0;
  const notes: string[] = [];
  const note = (s: string): void => {
    notes.push(s);
    if (notes.length > 6) notes.shift();
    label.textContent = notes.join('\n');
  };
  const events: ResultStageEvent[] = [];
  const input = inputFromParams(cfg.params);
  const stage = await createResultStage(input, {
    gl,
    fade(dir, sec) {
      fade = { from: Number(veil.style.opacity) || 0, to: dir === 'out' ? 1 : 0, t: 0, dur: sec };
    },
    fading: () => fade.t < fade.dur,
    winTelop: {
      start(no, place) {
        telop = { on: true, outAt: -1 };
        note(`텔롭 ${no} ${place}`);
      },
      out() {
        telop.outAt = frame;
        note('텔롭 퇴장');
      },
      finished: () => telop.outAt >= 0 && frame - telop.outAt >= 30,
    },
    genericTelop: {
      start(msg) {
        note(`텔롭 ${msg}`);
      },
      out() {
        telop.outAt = frame;
      },
      finished: () => telop.outAt >= 0 && frame - telop.outAt >= 30,
    },
    coinShow: (pid, coin) => note(`${pid + 1}P 코인 ${coin}`),
    dice: (pid, v) => note(`${pid + 1}P 주사위 ${v}`),
    se: (l) => note(`SE ${l}`),
    bgm: (l) => note(`BGM ${l ?? '정지'}`),
    resultSound: (no) => note(`결과음 ${no}`),
    uiTimingOut: () => undefined,
    url: (p) => `${ASSETS}${p}`,
    onEvent: (e) => events.push(e),
  });

  const fit = (): void => {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    gl.setPixelRatio(devicePixelRatio);
    gl.setSize(w, h, false);
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(host);

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let stopped = false;
  let reported = false;
  const loop = (now: number): void => {
    if (stopped) return;
    acc = Math.min(acc + (now - last) / 1000, 0.25);
    last = now;
    while (acc >= 1 / 60) {
      acc -= 1 / 60;
      frame++;
      if (fade.t < fade.dur) fade.t = Math.min(fade.dur, fade.t + 1 / 60);
      veil.style.opacity = String(fade.dur > 0 ? fade.from + (fade.to - fade.from) * (fade.t / fade.dur) : fade.to);
      stage.step();
    }
    stage.render();
    if (stage.done && !reported) {
      reported = true;
      const w = stage.writes.map((x) => `${x.pid + 1}P=${x.winLose}`).join(' ');
      cfg.onDone(`완료 ${frame} 프레임${w ? `, 주사위 기록 ${w}` : ''}`);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    stage,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      stage.dispose();
      gl.dispose();
      canvas.remove();
      veil.remove();
      label.remove();
    },
    debug() {
      const d = stage.debug();
      const pl = (d.places as { pid: number; slot: string; pos: number[] }[]).map((p) => `${p.pid + 1}P ${p.slot} (${p.pos.join(', ')})`);
      return [`패턴 ${d.pattern}  모델 ${d.model}  카메라 ${d.camera} (후보 ${d.camIdx})`, `텔롭 ${(d.telop as unknown[]).join(' ')}  주사위 ${d.dice}`, `프레임 ${d.frames}  카메라 ${d.camFrame}${d.done ? '  완료' : ''}`, ...pl, ...(d.motions as string[])].join('\n');
    },
  };
}
