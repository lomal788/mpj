/**
 * 페이지 ↔ 미니게임 항구 화면(app/scene/world/mgmet: 액티비티 선택+첫 설명, 규칙 설정) 연결 — 어댑터(입력·소리·에셋 경로)와 60Hz 고정 스텝 루프. mgmcommon_page.ts 와 같은 방식.
 * 시험값: 패널의 "항구 시험값"(첫 설명 flag 8·재방문 flag 1·시작 지점·보스 개방·이름) 또는 URL ?first=1 ?again=1 ?sp=0~7 ?boss=0 ?nick=…, 사람/COM = 패널 COM 칸.
 * bex 비트: A 0x1·B 0x2·X 0x4·Y 0x8 [추정 mgm_common.md 11]·L 0x10·R 0x20·ZL 0x40·ZR 0x80·십자 0x100~0x800·스틱 0x10000~0x80000. 3D 항구 = 고정 배경 그림(modeselect 임시 대역).
 */
import { ASSETS } from './env';
import { shellSound } from './view/sound';
import { NPAD, STICK_MAX, type PadInput } from '@game/core/pad';
import { createWork, MessageFlow, MessageWindow, MgmetGuides, MgmInput, MgmSound, MgmView, MODE_FLAG, type MgmPlayer } from '@app/common/ui';
import { ACTIVITIES, applyMgmetExtra, CPU_LEVELS, EXPLAIN_LABELS, MGMET_EXTRA_PART, MgmetHub, type MgmetExtra, type MgmetResult } from '@app/scene/world/mgmet';
import { MgmetHowtoView } from '@app/scene/world/mgmet/howto';
import { logicWipe, sceneOut } from './view/appTransition';
import { appBgm } from './view/bgm';
import { appSave } from './view/save';
import type { PadSource } from './view/input';

const STICK_ON = 0.5 * STICK_MAX;

function toBex(p: PadInput | null): number {
  if (!p) return 0;
  let b = 0;
  const map: [number, number][] = [
    [NPAD.A, 0x1],
    [NPAD.B, 0x2],
    [NPAD.X, 0x4],
    [NPAD.Y, 0x8],
    [NPAD.L, 0x10],
    [NPAD.R, 0x20],
    [NPAD.ZL, 0x40],
    [NPAD.ZR, 0x80],
    [NPAD.LEFT, 0x100],
    [NPAD.RIGHT, 0x200],
    [NPAD.DOWN, 0x400],
    [NPAD.UP, 0x800],
  ];
  for (const [n, x] of map) if (p.buttons & n) b |= x;
  if (p.lx < -STICK_ON) b |= 0x10000;
  if (p.ly > STICK_ON) b |= 0x20000;
  if (p.lx > STICK_ON) b |= 0x40000;
  if (p.ly < -STICK_ON) b |= 0x80000;
  return b;
}

export interface MgmetTestValues {
  firstHowtoSeen: boolean;
  again: boolean;
  startPoint: number;
  bossOpen: boolean;
  nickname: string;
}

const START_POINTS: [number, string][] = [
  [0, '0 일반 진입(인사)'],
  ...ACTIVITIES.map((a): [number, string] => [a.startPoint, `${a.startPoint} 직접: ${a.title}`]).sort((x, y) => x[0] - y[0]),
  [7, '7 mgm01 복귀'],
];

/** 패널에 시험값 칸을 한 번 만든다(다음 시작부터 적용) */
export function mgmetTestValues(): MgmetTestValues {
  const q = new URLSearchParams(location.search);
  let box = document.querySelector<HTMLElement>('.jw-mgmet-test');
  if (!box) {
    const panel = document.querySelector<HTMLElement>('.jw-panel');
    box = document.createElement('div');
    box.className = 'jw-mgmet-test';
    box.innerHTML = `<div>항구 시험값(다음 시작부터)</div>
      <label>첫 설명 본 적 있음(flag 8) <input type="checkbox" data-k="first" /></label>
      <label>항구 재방문(flag 1) <input type="checkbox" data-k="again" /></label>
      <label>보스 러시 개방 <input type="checkbox" data-k="boss" /></label>
      <label>시작 지점 <select data-k="sp"></select></label>
      <label>이름 <input type="text" data-k="nick" size="10" /></label>`;
    const sel = box.querySelector<HTMLSelectElement>('[data-k=sp]')!;
    for (const [v, n] of START_POINTS) sel.append(new Option(n, String(v)));
    sel.value = q.get('sp') ?? '0';
    box.querySelector<HTMLInputElement>('[data-k=first]')!.checked = q.get('first') === '1';
    box.querySelector<HTMLInputElement>('[data-k=again]')!.checked = q.get('again') === '1';
    box.querySelector<HTMLInputElement>('[data-k=boss]')!.checked = q.get('boss') !== '0';
    box.querySelector<HTMLInputElement>('[data-k=nick]')!.value = q.get('nick') ?? '';
    const anchor = panel?.querySelector('.jw-ui-start');
    if (anchor) anchor.before(box);
    else panel?.append(box);
  }
  const ck = (k: string): boolean => box!.querySelector<HTMLInputElement>(`[data-k=${k}]`)?.checked ?? false;
  return {
    firstHowtoSeen: ck('first'),
    again: ck('again'),
    bossOpen: ck('boss'),
    startPoint: Number(box.querySelector<HTMLSelectElement>('[data-k=sp]')?.value ?? 0),
    nickname: box.querySelector<HTMLInputElement>('[data-k=nick]')?.value ?? '',
  };
}

export interface MgmetRun {
  readonly phase: string;
  readonly hub: MgmetHub;
  stop(): void;
  press(bits: number): void;
  debug(): string;
}

export function describeMgmetResult(r: MgmetResult): string {
  const rule = (c: { cpu: number; explain: number; flag4: boolean }, texts: Record<string, string>): string =>
    `CPU ${texts[CPU_LEVELS[c.cpu]] ?? c.cpu}(index ${c.cpu})  설명 ${texts[EXPLAIN_LABELS[c.explain]] ?? c.explain}(index ${c.explain})  flag4 ${c.flag4 ? 1 : 0}`;
  const t = lastTexts;
  switch (r.kind) {
    case 'mgm01':
      return `프리 플레이 시작 → mgm01 (다음 모드 ${r.nextMode})\n${rule(r.rule, t)}`;
    case 'exit':
      return '항구 나가기(ReturnScene)';
    case 'activity':
      return `결정: ${t[ACTIVITIES[r.id].title] ?? r.id} (ID ${r.id} → MinigameModeID ${r.nextMode}, 진입 미구현)`;
    case 'rule':
      return `규칙 ${r.update === 1 ? '시작(플레이)' : '취소(첫 열 B)'}\n${rule(r.rule, t)}`;
  }
}

let lastTexts: Record<string, string> = {};

export async function runMgmet(
  entry: 'hub' | 'rule',
  stage: HTMLElement,
  cfg: { com: boolean[]; pads: (PadSource | null)[]; muted: boolean; test: MgmetTestValues; onDone(result: string): void },
): Promise<MgmetRun> {
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  stage.append(canvas);
  const snd = shellSound({ muted: cfg.muted, pan2d: true, scene: 'mgmet', pads: (pid) => cfg.pads[pid] });

  const bgParam = new URLSearchParams(location.search).get('bg');
  const bgUrl = bgParam === 'none' ? null : (bgParam ?? `${ASSETS}modeselect/backdrop_temp.png`);
  let backdrop: HTMLImageElement | undefined;
  if (bgUrl) {
    const img = new Image();
    img.src = bgUrl;
    try {
      await img.decode();
      backdrop = img;
    } catch {
      console.warn(`mgmet: 배경 이미지를 읽지 못했다 ${bgUrl}`);
    }
  }
  const url = (p: string): string => `${ASSETS}mgmcommon/${p}`;
  const view = await MgmView.create({ canvas, assets: { url }, parts: ['mgmet.json', MGMET_EXTRA_PART], backdrop });
  const extra = (await (await fetch(url(MGMET_EXTRA_PART))).json()) as MgmetExtra;
  applyMgmetExtra(view.spec, extra);
  lastTexts = view.spec.texts;

  const players: MgmPlayer[] = [0, 1, 2, 3].map((pid) => ({ pid, type: cfg.com[pid] ? 1 : 0 }));
  if (players.every((p) => p.type === 1)) players[0].type = 0;
  const prev = new Map<number, number>();
  let extraBits = 0;
  const input: MgmInput = new MgmInput(
    {
      poll(pid: number): { hold: number; trig: number } {
        let hold = toBex(cfg.pads[pid]?.read() ?? null);
        if (pid === input.operator || (input.operator < 0 && pid === 0)) {
          hold |= extraBits;
          extraBits = 0;
        }
        const t = hold & ~(prev.get(pid) ?? 0);
        prev.set(pid, hold);
        return { hold, trig: t };
      },
    },
    () => players,
  );
  const sound = new MgmSound(view.spec.sounds, view.url, snd.mgm(appBgm().hooks(cfg.muted)));
  const msg = new MessageWindow(view, input, sound);
  const flow = new MessageFlow(() => msg, { operator: () => input.operator, dt: () => Math.fround(1 / 60) });
  flow.initialize();
  const guides = new MgmetGuides(view, sound, () => input.operator);
  const save = appSave().mgm;
  if (cfg.test.firstHowtoSeen) save.modeFlags |= MODE_FLAG.FIRST_HOWTO_MGM01;
  if (cfg.test.again) save.modeFlags |= MODE_FLAG.OP_SKIP;
  const work = createWork();
  work.entranceStartPoint = cfg.test.startPoint;
  const howto = new MgmetHowtoView(view, input, sound);

  let done = false;
  let result: MgmetResult | null = null;
  const wipe = logicWipe();
  const hub = new MgmetHub({
    host: view,
    input,
    sound,
    msg,
    flow,
    guides,
    save,
    work,
    players: () => players,
    howto,
    bossOpen: cfg.test.bossOpen,
    nickname: cfg.test.nickname,
    entry,
    transition: wipe,
    onDone: (r) => {
      result = r;
    },
  });

  const render = (): void => {
    view.begin();
    hub.draw();
    view.end();
  };
  render();
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let endWait = 0;
  const loop = (now: number): void => {
    acc += Math.min(250, now - last);
    last = now;
    let n = 0;
    while (acc >= 1000 / 60 && n < 4 && !done) {
      hub.step();
      if (result && ++endWait > 20) {
        done = true;
        const r = result;
        wipe.release();
        void sceneOut().then(() => {
          run.stop();
          cfg.onDone(describeMgmetResult(r));
        });
        return;
      }
      acc -= 1000 / 60;
      n++;
    }
    if (!done) {
      render();
      raf = requestAnimationFrame(loop);
    }
  };
  raf = requestAnimationFrame(loop);
  let stopped = false;
  const run: MgmetRun = {
    get phase() {
      return hub.phase;
    },
    hub,
    press(bits) {
      extraBits |= bits;
    },
    debug() {
      const s = hub.rule.state;
      return [
        `phase ${hub.phase}  상태 ${hub.seq}  ID ${hub.selected}  조작 ${input.operator + 1}P`,
        `세이브 flag ${save.modeFlags.toString(2).padStart(4, '0')}  캐시 ${work.rule.valid ? `CPU ${work.rule.cpu} 설명 ${work.rule.explain}` : '없음'}`,
        `규칙 열 ${s.current}/${s.first}  index ${s.index.slice(0, 6).join(',')}`,
        `메시지 상태 ${msg.st.state} 페이지 ${msg.st.page}`,
        ...hub.log.slice(-3),
      ].join('\n');
    },
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      done = true;
      wipe.release();
      view.dispose();
      canvas.remove();
      appBgm().exit('mgmet', 'leave');
      snd.close(300);
    },
  };
  return run;
}
