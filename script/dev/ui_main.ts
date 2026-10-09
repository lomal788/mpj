/**
 * UI 시험 페이지(dev/ui.html) — 셸 화면(shell/*)을 게임 없이 단독으로 띄워 시험한다.
 * URL: ?ui=charselect  화면 id(UIS)
 *      ?com=0001       플레이어별 COM(1) / 사람(0)
 *      ?mute=1         소리 끔
 *      ?auto=1         열자마자 시작
 */
import '../style.css';
import '../view/assetMode';
import { runCharSelect, type CharSelectRun } from '../charselect_page';
import { runModeSelect, type ModeSelectRun } from '../modeselect_page';
import { runMgmCommonDemo, type MgmCommonRun } from './mgmcommon_page';
import { runMgmScreen, type MgmScreenRun } from './mgmscreens_page';
import { runMgm01Filter, runMgm01List, runMgm01Setting, type Mgm01ListRun, type Mgm01Run } from '../mgm01_page';
import { mgmetTestValues, runMgmet, type MgmetRun } from '../mgmet_page';
import { partyRuleTestValues, runPartyRule, type PartyRuleRun } from './partyrule_page';
import { runSetPlayer, type SetPlayerRun } from '../setplayer_page';
import { onlineTestValues, runOnline, type OnlineRun } from './online_page';
import { runMgResult, type MgResultRun } from './mgresult_page';
import { runMgScenePage, type MgScenePageRun } from './mgscene_page';
import { runMgStagePage, type MgStagePageRun } from './mgstage_page';
import { runSplitScreenPage, type SplitScreenPageRun } from './splitscreen_page';
import { runCharacterPage, type CharacterPageRun } from './character_page';
import { runEffectPage, type EffectPageRun } from './effect_page';
import { runSoundPage, type SoundPageRun } from './sound_page';
import { KeyboardPad, padSourcesFor } from '../view/input';
import { appBgm } from '../view/bgm';
import { appSave } from '../view/save';
import { installTransition, sceneIn, sceneOut } from '../view/appTransition';
import { FLOW_END_FADE } from '../view/screenBgm';

interface UiRun {
  stop(): void;
  debug(): string;
}

interface UiDef {
  id: string;
  name: string;
  run(stage: HTMLElement, cfg: { com: boolean[]; muted: boolean; onDone(result: string): void }): Promise<UiRun>;
}

const keyboard = new KeyboardPad();
appSave();

const PHASE = ['0', '1', '2', '3', '4', '5'];

const UIS: UiDef[] = [
  {
    id: 'charselect',
    name: '캐릭터 선택',
    async run(stage, cfg) {
      const r: CharSelectRun = await runCharSelect(stage, {
        com: cfg.com,
        pads: padSourcesFor(cfg.com, keyboard),
        muted: cfg.muted,
        onDone: (chars) => cfg.onDone(chars ? chars.map((c, i) => `${i + 1}P ${c}`).join('  ') : '취소'),
      });
      (window as unknown as { __charselect?: CharSelectRun }).__charselect = r;
      return {
        stop: () => r.stop(),
        debug() {
          const s = r.handle.state;
          const lines = [`phase ${PHASE[s.phase] ?? s.phase}  operator ${s.operator}`];
          for (const p of s.players) lines.push(`${p.pid + 1}P ${p.type ? 'COM' : '사람'} cursor ${p.cursor} slot ${p.slot}${p.decided ? ' 결정' : ''}`);
          const ls = r.handle.loadStats.slice(-3);
          for (const l of ls) lines.push(`load ${l.pc}${l.cached ? ' (캐시)' : ''} ${l.loadMs.toFixed(0)} ms`);
          return lines.join('\n');
        },
      };
    },
  },
  {
    id: 'modeselect',
    name: '모드 선택(맵 메뉴)',
    async run(stage, cfg) {
      const r: ModeSelectRun = await runModeSelect(stage, {
        pad: padSourcesFor([false], keyboard)[0],
        muted: cfg.muted,
        onDone: (m) => cfg.onDone(m ? `${m.key} (${m.name}, 버튼 ${m.button}, 다음 ${m.next})` : '취소'),
      });
      (window as unknown as { __modeselect?: ModeSelectRun }).__modeselect = r;
      return {
        stop: () => r.stop(),
        debug() {
          const s = r.handle.state;
          return `phase ${s.phase}  cursor ${s.cursor}  result ${s.result}\nshown ${s.shown.map((v) => (v ? 1 : 0)).join('')}  enabled ${s.enabled.map((v) => (v ? 1 : 0)).join('')}`;
        },
      };
    },
  },
  {
    id: 'mgmcommon',
    name: '공용 UI·메시지 창',
    async run(stage, cfg) {
      const r: MgmCommonRun = await runMgmCommonDemo(stage, { com: cfg.com, pads: padSourcesFor(cfg.com, keyboard), muted: cfg.muted, onDone: cfg.onDone });
      (window as unknown as { __mgmcommon?: MgmCommonRun }).__mgmcommon = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  ...(
    [
      ['mgm01-history', '프리 플레이: 승패 표', 'history'],
      ['mgm01-announce', '프리 플레이: 잠금 안내', 'announce'],
      ['mgmet-howto', '항구: 플레이 방법', 'howto'],
    ] as const
  ).map(
    ([id, name, kind]): UiDef => ({
      id,
      name,
      async run(stage, cfg) {
        const r: MgmScreenRun = await runMgmScreen(kind, stage, { com: cfg.com, pads: padSourcesFor(cfg.com, keyboard), muted: cfg.muted, onDone: cfg.onDone });
        (window as unknown as { __mgmscreen?: MgmScreenRun }).__mgmscreen = r;
        return { stop: () => r.stop(), debug: () => r.debug() };
      },
    }),
  ),
  {
    id: 'mgm01-setting',
    name: '프리 플레이: 개별 설정',
    async run(stage, cfg) {
      const r: Mgm01Run = await runMgm01Setting(stage, { com: cfg.com, pads: padSourcesFor(cfg.com, keyboard), muted: cfg.muted, onDone: cfg.onDone });
      (window as unknown as { __mgm01?: Mgm01Run }).__mgm01 = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'mgm01-filter',
    name: '프리 플레이: 필터(장르)',
    async run(stage, cfg) {
      const r: Mgm01Run = await runMgm01Filter(stage, { com: cfg.com, pads: padSourcesFor(cfg.com, keyboard), muted: cfg.muted, onDone: cfg.onDone });
      (window as unknown as { __mgm01?: Mgm01Run }).__mgm01 = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  ...(
    [
      ['mgmet', '항구: 액티비티 선택·첫 설명', 'hub'],
      ['mgmet-rule', '항구: 규칙 설정', 'rule'],
    ] as const
  ).map(
    ([id, name, entry]): UiDef => ({
      id,
      name,
      async run(stage, cfg) {
        const r: MgmetRun = await runMgmet(entry, stage, { com: cfg.com, pads: padSourcesFor(cfg.com, keyboard), muted: cfg.muted, test: mgmetTestValues(), onDone: cfg.onDone });
        (window as unknown as { __mgmet?: MgmetRun }).__mgmet = r;
        return { stop: () => r.stop(), debug: () => r.debug() };
      },
    }),
  ),
  {
    id: 'partyrule',
    name: '마리오 파티: 파티 규칙 설정',
    async run(stage, cfg) {
      const r: PartyRuleRun = await runPartyRule(stage, { com: cfg.com, pads: padSourcesFor(cfg.com, keyboard), muted: cfg.muted, test: partyRuleTestValues(), onDone: cfg.onDone });
      (window as unknown as { __partyrule?: PartyRuleRun }).__partyrule = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'setplayer',
    name: '로컬 멀티: 플레이어 설정 → 캐릭터 선택',
    async run(stage, cfg) {
      const r: SetPlayerRun = await runSetPlayer(stage, { com: cfg.com, keyboard, muted: cfg.muted, onDone: cfg.onDone });
      (window as unknown as { __setplayer?: SetPlayerRun }).__setplayer = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'online',
    name: '온라인: 프렌드 매치 방·대기실 / 전 세계 매칭',
    async run(stage, cfg) {
      const r: OnlineRun = await runOnline(stage, { pads: padSourcesFor([false, true, true, true], keyboard), muted: cfg.muted, test: onlineTestValues(), onDone: cfg.onDone });
      (window as unknown as { __online?: OnlineRun }).__online = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'mgm01-list',
    name: '프리 플레이: 목록(전체 흐름)',
    async run(stage, cfg) {
      const r: Mgm01ListRun = await runMgm01List(stage, { com: cfg.com, pads: padSourcesFor(cfg.com, keyboard), muted: cfg.muted, onDone: cfg.onDone });
      (window as unknown as { __mgm01list?: Mgm01ListRun }).__mgm01list = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'mgresult',
    name: '미니게임 결과 무대(3D)',
    async run(stage, cfg) {
      const r: MgResultRun = await runMgResult(stage, { params: new URLSearchParams(location.search), onDone: cfg.onDone });
      (window as unknown as { __mgresult?: MgResultRun }).__mgresult = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'mgscene',
    name: '미니게임 공용 틀',
    async run(stage, cfg) {
      const r: MgScenePageRun = await runMgScenePage(stage, { com: cfg.com, pads: padSourcesFor(cfg.com, keyboard), muted: cfg.muted, onDone: cfg.onDone });
      (window as unknown as { __mgscene?: MgScenePageRun }).__mgscene = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'mgstage',
    name: '미니게임 장면 보기',
    async run(stage, cfg) {
      const r: MgStagePageRun = await runMgStagePage(stage, { params: new URLSearchParams(location.search), onDone: cfg.onDone });
      (window as unknown as { __mgstage?: MgStagePageRun }).__mgstage = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'splitscreen',
    name: '분할 화면',
    async run(stage, cfg) {
      const r: SplitScreenPageRun = await runSplitScreenPage(stage, { params: new URLSearchParams(location.search), onDone: cfg.onDone });
      (window as unknown as { __splitscreen?: SplitScreenPageRun }).__splitscreen = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'character',
    name: '캐릭터 런타임',
    async run(stage, cfg) {
      const r: CharacterPageRun = await runCharacterPage(stage, { params: new URLSearchParams(location.search), pads: padSourcesFor(cfg.com, keyboard), muted: cfg.muted, onDone: cfg.onDone });
      (window as unknown as { __character?: CharacterPageRun }).__character = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'effect',
    name: '이펙트 런타임',
    async run(stage, cfg) {
      const r: EffectPageRun = await runEffectPage(stage, { params: new URLSearchParams(location.search), onDone: cfg.onDone });
      (window as unknown as { __effect?: EffectPageRun }).__effect = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
  {
    id: 'sound',
    name: '사운드 런타임',
    async run(stage, cfg) {
      const r: SoundPageRun = await runSoundPage(stage, { params: new URLSearchParams(location.search), muted: cfg.muted, onDone: cfg.onDone });
      (window as unknown as { __sound?: SoundPageRun }).__sound = r;
      return { stop: () => r.stop(), debug: () => r.debug() };
    },
  },
];

const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
app.className = 'jw';
app.innerHTML = `
  <div class="jw-stage"><div class="jw-msg" hidden></div><pre class="jw-ui-debug"></pre></div>
  <div class="jw-panel">
    <h1>UI 시험</h1>
    <label>화면 <select class="jw-ui-sel"></select></label>
    <div class="jw-ui-com"></div>
    <label>소리 끔 <input type="checkbox" class="jw-ui-mute" /></label>
    <label>디버그 <input type="checkbox" class="jw-ui-dbg" checked /></label>
    <button class="jw-ui-start">시작</button>
    <button class="jw-ui-stop">그만</button>
    <div>결과</div>
    <pre class="jw-ui-result"></pre>
    <div class="jw-ui-help">J = A(결정), K = B(취소), 방향키·WASD = 이동, 게임패드 지원</div>
    <a href="./dev/index.html">게임 페이지로</a>
  </div>`;
const stage = app.querySelector<HTMLElement>('.jw-stage')!;
const msg = app.querySelector<HTMLElement>('.jw-msg')!;
const dbg = app.querySelector<HTMLElement>('.jw-ui-debug')!;
const sel = app.querySelector<HTMLSelectElement>('.jw-ui-sel')!;
const comBox = app.querySelector<HTMLElement>('.jw-ui-com')!;
const muteIn = app.querySelector<HTMLInputElement>('.jw-ui-mute')!;
const dbgIn = app.querySelector<HTMLInputElement>('.jw-ui-dbg')!;
const startBtn = app.querySelector<HTMLButtonElement>('.jw-ui-start')!;
const stopBtn = app.querySelector<HTMLButtonElement>('.jw-ui-stop')!;
const resultBox = app.querySelector<HTMLElement>('.jw-ui-result')!;
installTransition(stage);

Object.assign(dbg.style, {
  position: 'absolute',
  left: '8px',
  top: '8px',
  margin: '0',
  padding: '6px 8px',
  background: 'rgba(0,0,0,0.55)',
  font: '12px/1.4 monospace',
  pointerEvents: 'none',
  zIndex: '2',
});

for (const u of UIS) sel.append(new Option(u.name, u.id));
sel.value = UIS.some((u) => u.id === q.get('ui')) ? q.get('ui')! : UIS[0].id;

const comParam = q.get('com') ?? '0111';
const comIns = [0, 1, 2, 3].map((i) => {
  const l = document.createElement('label');
  l.textContent = `${i + 1}P COM`;
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = comParam[i] === '1';
  l.append(c);
  comBox.append(l);
  return c;
});
muteIn.checked = q.get('mute') === '1';

const setMsg = (s: string): void => {
  msg.textContent = s;
  msg.hidden = s === '';
};

let cur: UiRun | null = null;
let token = 0;

const stop = (): void => {
  token++;
  cur?.stop();
  cur = null;
  appBgm().stop(FLOW_END_FADE);
  dbg.textContent = '';
};

async function start(): Promise<void> {
  await sceneOut();
  stop();
  const my = token;
  const def = UIS.find((u) => u.id === sel.value) ?? UIS[0];
  resultBox.textContent = '';
  setMsg('읽는 중…');
  try {
    const r = await def.run(stage, {
      com: comIns.map((c) => c.checked),
      muted: muteIn.checked,
      onDone(result) {
        if (cur === r) cur = null;
        resultBox.textContent = result;
        dbg.textContent = '';
      },
    });
    if (my !== token) {
      r.stop();
      return;
    }
    cur = r;
    sceneIn();
    setMsg('');
  } catch (e) {
    console.error(e);
    sceneIn();
    setMsg(`시작 실패: ${(e as Error).message}`);
  }
}

let frames = 0;
let fpsT = performance.now();
let fps = 0;
const tick = (now: number): void => {
  frames++;
  if (now - fpsT >= 500) {
    fps = (frames * 1000) / (now - fpsT);
    frames = 0;
    fpsT = now;
  }
  dbg.hidden = !dbgIn.checked || !cur;
  if (cur && dbgIn.checked) dbg.textContent = `${fps.toFixed(0)} fps\n${cur.debug()}`;
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

startBtn.addEventListener('click', () => void start());
stopBtn.addEventListener('click', () => {
  void sceneOut().then(() => {
    stop();
    sceneIn();
    setMsg('그만뒀다');
  });
});
if (q.get('auto') === '1') void start();
