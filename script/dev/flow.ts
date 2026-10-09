/**
 * 개발 흐름(하네스 /dev) — app/flow 공개 API(한 판 호스트 createGameHost·게임 흐름 createGameFlow)를 조합해 개발 기능을 붙인다.
 * app 은 이 파일을 모른다. 이 파일이 있든 없든 배포(script/main.ts) 동작은 같다.
 * - 루프: rAF 마다 호스트 prime → due 만큼 step → draw(app/flow runGameLoop 와 같은 순서) + ?fast=N(rAF 당 N 스텝, 오디오 시계 끔)·hold(멈춤)·?synclog·상태 줄·디버그 줄
 * - 설정: ?avlat → host.latency
 * - 시험 훅: window.__mpj(Hook — 호스트·흐름의 읽기 상태)·__flow·__plaza
 * - 화면 인자: 광장에 URL 옵션(params), 항구에 시험값(mgmet_page mgmetTestValues — 패널 칸·?first·?again·?sp·?boss·?nick)
 * - ?skipsetup=1(&chars=·&names=): 플레이어 설정을 건너뛰고 enterPlaza
 */
import { createGameFlow, createGameHost, flowScreens, type FlowRun, type FlowScreens, type GameFlow, type GameHost, type Stage } from '@app/flow';
import type { MgResultEntry } from '@app/common/ui';
import type { PlazaPageRun } from '../plaza_page';
import { appFlow } from '../view/appFlow';

export interface Hook {
  stage: Stage;
  frame: number;
  seed: number | null;
  result: unknown;
  error: string | null;
  /** 이 프레임에 닿으면 멈춘다(스크린샷용) */
  held: number | null;
  hold(frame: number | null): void;
  /** 밀려서 버린 스텝 수(이 판) */
  dropped: number;
  /**
   * ?synclog=1 — steps: 스텝마다 [프레임, performance.now, currentTime, 들리는 오디오 시각, g14, row, stage, BGM 사건, 스텝 시각, 관측 여부],
   * frames: rAF 마다 [들리는 오디오 시각, 마지막 스텝 시각], audio: 소리 쪽(view/sound.ts)
   */
  sync: { steps: unknown[]; frames: unknown[]; audio: unknown[] } | null;
  /** ?charselect=1 결과(pcNN 목록, 취소 null) */
  charselect?: string[] | null;
  /** ?plaza=1 흐름 단계(setplayer·plaza·modeselect·mgmet·mgm01·game·end)와 광장 실행기 debug */
  flow?: string;
  plaza?: () => Record<string, unknown> | null;
  /** 광장 P0 진행(n/total 항목) — 화면 문구 대신(loader_manager.md §13.5) */
  plazaLoad?: string;
  entry?: MgResultEntry | null;
  scene?: () => { stage: number; frame: number } | null;
}

export interface DevGameOptions {
  mount(stageBox: HTMLElement): void;
  params: URLSearchParams;
  fast: number;
  avlat: string | null;
  synclog: boolean;
  status(text: string): void;
  debug?(text: string): void;
}

export interface DevGame {
  readonly host: GameHost;
  readonly flow: GameFlow;
  readonly hook: Hook;
  startFlow(com: boolean[]): void;
  prepareFlow(): void;
}

export function createDevGame(o: DevGameOptions): DevGame {
  const q = o.params;
  const fast = o.fast;
  const avlat = o.avlat;
  const screens: FlowScreens = {
    ...flowScreens,
    plaza: (stage, cfg) => flowScreens.plaza(stage, { ...cfg, params: q }),
    mgmet: async (entry, stage, cfg) => {
      const { runMgmet, mgmetTestValues } = await import('../mgmet_page');
      return runMgmet(entry, stage, { ...cfg, test: mgmetTestValues() });
    },
  };
  const host = createGameHost(o.mount);
  host.audioClock = fast === 0;
  host.latency = { compensate: avlat !== 'raw', extraMs: Number(avlat) || 0 };
  const flow = createGameFlow(host, screens);

  const hook: Hook = {
    get stage() {
      return host.stage;
    },
    get frame() {
      return host.frame;
    },
    get seed() {
      return host.seed;
    },
    get result() {
      return host.result;
    },
    get error() {
      return host.error;
    },
    held: null,
    hold(frame) {
      this.held = frame;
    },
    get dropped() {
      return host.dropped;
    },
    sync: o.synclog ? { steps: [], frames: [], audio: [] } : null,
    get flow() {
      return flow.screen;
    },
    plaza: () => flow.plaza?.debug() ?? null,
    get plazaLoad() {
      return flow.plazaLoad;
    },
    get entry() {
      return flow.entry;
    },
    scene: () => (host.run ? { stage: host.run.scene.stage, frame: host.run.scene.frame } : null),
  };
  (window as unknown as { __mpj: Hook }).__mpj = hook;
  flow.listen((e) => {
    if (e.type === 'screen') (window as unknown as { __flow?: FlowRun | null }).__flow = e.run;
    else if (e.type === 'plaza') (window as unknown as { __plaza?: PlazaPageRun }).__plaza = e.run;
  });
  if (hook.sync) {
    const audioLog = hook.sync.audio;
    void import('@app/minigame/kit/rhythm/view/sound').then((m) => m.setRhythmSoundTrace((e) => void audioLog.push(e)));
  }
  host.listen((e) => {
    if (e.type === 'step' && hook.sync) logSync(e.t, e.observed);
  });

  function logSync(t: number, observed: boolean): void {
    const logic = host.logic!;
    const st = logic.state as { g14?: number; row?: number; stage?: number };
    const ev = (logic.events as { k: string; label?: string }[]).filter((e) => (e.k === 'bgm' || e.k === 'se') && e.label?.startsWith('SQ_BGM')).map((e) => `${e.k}:${e.label}`);
    hook.sync!.steps.push([host.frame, performance.now(), host.audio?.ctx.currentTime ?? null, host.heardTime(), st.g14 ?? null, st.row ?? null, st.stage ?? null, ev.length ? ev : null, t, observed]);
  }

  const loop = (): void => {
    requestAnimationFrame(loop);
    if (host.stage !== 'running' || !host.logic || !host.view) return;
    if (hook.held !== null && host.frame >= hook.held) {
      /* 멈춘 동안은 시계를 따라 옮긴다(풀면 그 자리부터) */
      host.resync();
      host.draw();
      return;
    }
    if (!host.prime()) return;
    const budget = fast > 0 ? fast : host.due();
    for (let i = 0; i < budget && host.stage === 'running'; i++) {
      if (hook.held !== null && host.frame >= hook.held) break;
      host.step();
    }
    if (hook.sync) hook.sync.frames.push([host.heardTime(), host.stepTime()]);
    const view = host.view;
    const logic = host.logic;
    if (view && logic) {
      host.draw();
      const s = view.status(logic.state);
      o.status(`${host.def?.id ?? ''} 프레임 ${host.frame} ${s.phase}${s.timeLeft !== null ? ` 남은 ${s.timeLeft}` : ''}`);
      if (o.debug) o.debug(view.debug(logic.state, logic.events));
    }
  };
  requestAnimationFrame(loop);

  return {
    host,
    flow,
    hook,
    startFlow(com) {
      if (q.get('skipsetup') === '1') {
        const chars = com.map((_, i) => `pc0${i + 1}`);
        const cq = q.get('chars');
        if (cq) cq.split(',').forEach((c, i) => c && i < chars.length && (chars[i] = c));
        const nq = q.get('names');
        flow.enterPlaza({ com, chars, names: nq ? com.map((_, i) => nq.split(',')[i] || `${i + 1}P`) : undefined });
        return;
      }
      flow.start(com);
    },
    prepareFlow() {
      appFlow().enter('boot');
      void import('../view/plazaGl').then((m) => m.installPlazaGl(q));
    },
  };
}
