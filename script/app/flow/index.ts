/**
 * 게임 흐름 — 플레이어 설정 → 광장 → 기구 → 모드 메뉴 → 항구 → 프리 플레이 목록 → 게임(한 판 호스트 host.ts) → 복귀(docs/shell/plaza_3d.md §6.9).
 * 화면 전환은 같은 문서 안의 장면 교체뿐이다(주소를 읽거나 바꾸지 않는다, DESIGN.md §10.1 진입점).
 *
 * 공개 API: createGameHost·runGameLoop(host.ts), createGameFlow(host, screens) → start(사람/COM)·enterPlaza(플레이어가 정해진 채 광장부터)·listen(사건)·
 * 읽기 전용 상태(screen·plaza·plazaLoad·entry), flowScreens(화면 실행 함수 표), prepareFlow(흐름 미리 받기·광장 GL 준비).
 */
import { GAMES } from '@app/minigame';
import { freePlaySetup } from '../../mgrun';
import { prefetchMode, appFlow } from '../../view/appFlow';
import { sceneIn, sceneOut } from '../../view/appTransition';
import { FLOW_END_FADE } from '../../view/screenBgm';
import { padSourcesFor } from '../../view/input';
import { appSave, mgRunSaveHooks } from '../../view/save';
import type { Mgm01ListRun } from '../../mgm01_page';
import type { MgmetRun } from '../../mgmet_page';
import type { ModeSelectRun } from '../../modeselect_page';
import type { PlazaPageRun } from '../../plaza_page';
import type { SetPlayerRun } from '../../setplayer_page';
import type { MgResultEntry } from '@app/common/ui';
import type { Mgm01PlayRequest } from '@app/scene/mode/freeplay';
import type { GameHost, SetupDraft } from './host';

export { createGameHost, runGameLoop, type GameHost, type HostEvent, type SetupDraft, type Stage, type StartOptions } from './host';

export interface FlowScreens {
  setplayer: typeof import('../../setplayer_page').runSetPlayer;
  plaza: typeof import('../../plaza_page').runPlaza;
  modeselect: typeof import('../../modeselect_page').runModeSelect;
  mgmet: typeof import('../../mgmet_page').runMgmet;
  mgm01: typeof import('../../mgm01_page').runMgm01List;
}

export const flowScreens: FlowScreens = {
  setplayer: async (...a) => (await import('../../setplayer_page')).runSetPlayer(...a),
  plaza: async (...a) => (await import('../../plaza_page')).runPlaza(...a),
  modeselect: async (...a) => (await import('../../modeselect_page')).runModeSelect(...a),
  mgmet: async (...a) => (await import('../../mgmet_page')).runMgmet(...a),
  mgm01: async (...a) => (await import('../../mgm01_page')).runMgm01List(...a),
};

export interface FlowRun {
  stop(): void;
}

export interface FlowPlayers {
  com: boolean[];
  chars?: string[];
  names?: string[];
}

export type FlowEvent =
  | { type: 'screen'; name: string; run: FlowRun | null }
  | { type: 'plaza'; run: PlazaPageRun }
  | { type: 'end'; text: string; reason: 'cancel' | 'exit' | 'error' };

export interface GameFlow {
  readonly screen: string | undefined;
  readonly plaza: PlazaPageRun | null;
  readonly plazaLoad: string | undefined;
  readonly entry: MgResultEntry | null | undefined;
  listen(fn: (e: FlowEvent) => void): () => void;
  start(com: boolean[]): void;
  enterPlaza(players: FlowPlayers): void;
}

export function prepareFlow(): void {
  appFlow().enter('boot');
  void import('../../view/plazaGl').then((m) => m.installPlazaGl());
}

export function createGameFlow(host: GameHost, screens: FlowScreens = flowScreens): GameFlow {
  const { stageBox, glCanvas, hudCanvas, msg, keyboard, setMsg, dispose } = host;
  const listeners = new Set<(e: FlowEvent) => void>();
  const emit = (e: FlowEvent): void => {
    for (const fn of listeners) fn(e);
  };
  let screen: string | undefined;
  let plazaLoad: string | undefined;
  let entryNow: MgResultEntry | null | undefined;
  host.listen((e) => {
    if (e.type === 'stage' && e.stage === 'loading') entryNow = undefined;
  });

  // ---------------------------------------------------------------- 흐름(docs/shell/plaza_3d.md §6.9)
  let flowRun: FlowRun | null = null;
  let plazaPage: PlazaPageRun | null = null;
  const flowPlayers = { com: [] as boolean[], chars: [] as string[], names: undefined as string[] | undefined, pads: [] as ReturnType<typeof padSourcesFor> };

  const flowStep = (name: string, r: FlowRun | null): void => {
    flowRun?.stop();
    flowRun = r;
    if (r) sceneIn();
    screen = name;
    emit({ type: 'screen', name, run: r });
  };

  const endFlow = (text: string, reason: 'cancel' | 'exit' | 'error'): void => {
    flowStep('end', null);
    sceneIn();
    void import('../../view/bgm').then((m) => m.appBgm().stop(FLOW_END_FADE));
    plazaPage = null;
    glCanvas.style.visibility = hudCanvas.style.visibility = '';
    emit({ type: 'end', text, reason });
  };

  async function playFromList(req: Mgm01PlayRequest): Promise<MgResultEntry | null> {
    const d = GAMES.find((g) => g.id === req.name);
    if (!d) return null;
    await sceneOut();
    const others = [...stageBox.children].filter((c) => c !== glCanvas && c !== hudCanvas && c !== msg && !c.classList.contains('tr-wipe')) as HTMLElement[];
    for (const c of others) c.style.visibility = 'hidden';
    glCanvas.style.visibility = hudCanvas.style.visibility = '';
    screen = 'game';
    appFlow().enter('game');
    const fp = freePlaySetup(req, flowPlayers.chars, flowPlayers.com);
    const draft: SetupDraft = { players: fp.players, practice: false, options: {} };
    await host.start(d, draft, { play: fp.play, endless: fp.endless, save: mgRunSaveHooks(appSave(), req.id), leaveWipe: true });
    await new Promise<void>((res) => {
      const t = setInterval(() => {
        if (host.stage === 'done' || host.stage === 'error' || host.stage === 'idle') {
          clearInterval(t);
          res();
        }
      }, 100);
    });
    const run = host.run;
    const entry: MgResultEntry | null = host.stage === 'done' && run?.ended ? run.resultEntry(req.id) : null;
    await sceneOut();
    dispose();
    glCanvas.style.visibility = hudCanvas.style.visibility = 'hidden';
    for (const c of others) c.style.visibility = '';
    screen = 'mgm01';
    entryNow = entry;
    return entry;
  }

  function flowMgm01(): void {
    flowStep('mgm01-loading', null);
    appFlow().hint('gameCharacters', JSON.stringify(flowPlayers.chars));
    appFlow().enter('mgm01');
    void screens.mgm01(stageBox, {
      com: flowPlayers.com,
      pads: flowPlayers.pads,
      muted: host.muted,
      prepare: name => {
        const def = GAMES.find(g => g.id === name);
        if (prefetchMode() !== 'off' && def?.preparationKey) host.prepare(def, { players: flowPlayers.chars.map((char, i) => ({ char, isCom: flowPlayers.com[i] ?? false, comLevel: 0 })), practice: false, options: {} });
        else host.cancelPreparation();
      },
      play: playFromList,
      onDone: () => void sceneOut().then(flowMgmet),
    }).then((r: Mgm01ListRun) => flowStep('mgm01', r));
  }

  function flowMgmet(): void {
    flowStep('mgmet-loading', null);
    appFlow().enter('mgmet');
    void screens.mgmet('hub', stageBox, {
      com: flowPlayers.com,
      pads: flowPlayers.pads,
      muted: host.muted,
      onDone: (text) => queueMicrotask(() => (text.startsWith('프리 플레이 시작') ? flowMgm01() : flowModeSelect())),
    }).then((r: MgmetRun) => flowStep('mgmet', r));
  }

  function flowModeSelect(): void {
    flowStep('modeselect-loading', null);
    appFlow().enter('modeselect');
    void screens.modeselect(stageBox, {
      pad: flowPlayers.pads[0] ?? null,
      muted: host.muted,
      onDone: (r) => queueMicrotask(() => (r?.key === 'mgm' ? flowMgmet() : flowPlaza())),
    }).then((r: ModeSelectRun) => flowStep('modeselect', r));
  }

  function flowPlaza(): void {
    flowStep('plaza-loading', null);
    appFlow().enter('plaza', { chars: flowPlayers.chars.filter((_, i) => !flowPlayers.com[i]) });
    void screens.plaza(stageBox, {
      com: flowPlayers.com,
      chars: flowPlayers.chars,
      names: flowPlayers.names,
      pads: flowPlayers.pads,
      muted: host.muted,
      onProgress: (n, total, what) => void (screen === 'plaza-loading' && (plazaLoad = `${n}/${total} ${what}`)),
      onExit: (e) =>
        void sceneOut().then(() => {
          plazaPage = null;
          if (e.k === 'balloon' || e.k === 'session') flowModeSelect();
          else endFlow('광장 나감', 'exit');
        }),
    })
      .then((r) => {
        setMsg('');
        plazaPage = r;
        flowStep('plaza', r);
        emit({ type: 'plaza', run: r });
      })
      .catch((e: unknown) => {
        console.error(e);
        host.setError(String((e as Error).stack ?? e));
        endFlow(`광장 실패: ${(e as Error).message}`, 'error');
      });
  }

  function begin(com: boolean[]): void {
    flowStep('setplayer', null);
    appFlow().enter('setplayer');
    glCanvas.style.visibility = hudCanvas.style.visibility = 'hidden';
    flowPlayers.com = com;
    flowPlayers.chars = com.map((_, i) => `pc0${i + 1}`);
    flowPlayers.names = undefined;
    flowPlayers.pads = padSourcesFor(com, keyboard);
  }

  function plazaFlow(com: boolean[]): void {
    begin(com);
    let got = false;
    void screens.setplayer(stageBox, {
      com,
      keyboard,
      muted: host.muted,
      onResult: (r, chars, pads) => {
        if (r.cancelled || !chars) return;
        got = true;
        flowPlayers.com = r.slots.map((sl) => sl.type !== 'human');
        flowPlayers.chars = chars;
        flowPlayers.names = r.slots.map((sl) => sl.displayName);
        flowPlayers.pads = pads;
      },
      onDone: () => void sceneOut().then(() => (got ? flowPlaza() : endFlow('플레이어 설정 취소', 'cancel'))),
    }).then((r: SetPlayerRun) => flowStep('setplayer', r));
  }

  return {
    get screen() {
      return screen;
    },
    get plaza() {
      return plazaPage;
    },
    get plazaLoad() {
      return plazaLoad;
    },
    get entry() {
      return entryNow;
    },
    listen(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    start: plazaFlow,
    enterPlaza(players) {
      begin(players.com);
      if (players.chars) flowPlayers.chars = players.chars;
      if (players.names) flowPlayers.names = players.names;
      flowPlaza();
    },
  };
}
