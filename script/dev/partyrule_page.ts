/**
 * 페이지 ↔ 마리오 파티(보드) 파티 규칙 화면(shell/partyrule) 연결 — mgmscreens_page.ts 와 같은 어댑터(입력·소리·에셋)·60Hz 고정 스텝 루프, dev/ui.html 시험값 패널.
 * 시험값(패널 또는 URL): step=checkMember|member|check|rule(시작 단계), turn=10|12|15|20|25|30, bonus=0|1|2, handi=0,0,0,0, level=0~3(COM 난이도),
 * fast=1, inst=0, gyro=0, vote=1, flag20=1, flag22=1, board=0~6, champ=1. 사람/CPU = 패널 COM 칸. 배경 ?bg=none|URL(기본 modeselect/backdrop_temp.png).
 */
import { ASSETS } from '../env';
import { shellSound } from '../view/sound';
import { NPAD, STICK_MAX, type PadInput } from '@game/core/pad';
import { MgmSound, MgmView } from '../shell/mgmcommon';
import { applyPartyRuleExtra, defaultConfig, PARTYRULE_FACES, PARTYRULE_PART, PartyRuleScreen, type PartyRuleConfig, type PartyRuleExtra } from '../shell/partyrule';
import type { PadSource } from '../view/input';
import { appBgm } from '../view/bgm';

const STICK_ON = 0.5 * STICK_MAX;
const DT = Math.fround(1 / 60);

function toBex(p: PadInput | null): number {
  if (!p) return 0;
  let b = 0;
  if (p.buttons & NPAD.A) b |= 0x1;
  if (p.buttons & NPAD.B) b |= 0x2;
  if (p.buttons & NPAD.X) b |= 0x4;
  if (p.buttons & NPAD.Y) b |= 0x8;
  if (p.buttons & NPAD.LEFT) b |= 0x100;
  if (p.buttons & NPAD.RIGHT) b |= 0x200;
  if (p.buttons & NPAD.DOWN) b |= 0x400;
  if (p.buttons & NPAD.UP) b |= 0x800;
  if (p.lx < -STICK_ON) b |= 0x10000;
  if (p.ly > STICK_ON) b |= 0x20000;
  if (p.lx > STICK_ON) b |= 0x40000;
  if (p.ly < -STICK_ON) b |= 0x80000;
  return b;
}

export interface PartyRuleTest {
  step: string;
  turn: number;
  bonus: number;
  handi: number[];
  level: number;
  fast: boolean;
  inst: boolean;
  gyro: boolean;
  vote: boolean;
  flag20: boolean;
  flag22: boolean;
  board: number;
  champ: boolean;
}

/** 패널에 시험값 칸을 한 번 만든다(다음 시작부터 적용) */
export function partyRuleTestValues(): PartyRuleTest {
  const q = new URLSearchParams(location.search);
  let box = document.querySelector<HTMLElement>('.jw-partyrule-test');
  if (!box) {
    const panel = document.querySelector<HTMLElement>('.jw-panel');
    box = document.createElement('div');
    box.className = 'jw-partyrule-test';
    box.innerHTML = `<div>파티 규칙 시험값(다음 시작부터)</div>
      <label>시작 단계 <select data-k="step"><option value="checkMember">멤버 확인</option><option value="member">멤버 설정</option><option value="check">규칙 확인</option><option value="rule">플레이 방법 설정</option></select></label>
      <label>턴 수 <select data-k="turn">${[10, 15, 20, 25, 30, 12].map((t) => `<option>${t}</option>`).join('')}</select></label>
      <label>보너스 스타 <select data-k="bonus"><option value="1">있음</option><option value="0">없음</option><option value="2">기존</option></select></label>
      <label>핸디캡 1~4P <input type="text" data-k="handi" size="8" /></label>
      <label>CPU 난이도 <select data-k="level"><option value="0">쉬움</option><option value="1">보통</option><option value="2">강함</option><option value="3">달인</option></select></label>
      <label>CPU 속도 빠름(flag 8) <input type="checkbox" data-k="fast" /></label>
      <label>미니게임 설명(flag 4) <input type="checkbox" data-k="inst" /></label>
      <label>체감 미니게임(flag 6) <input type="checkbox" data-k="gyro" /></label>
      <label>투표(flag 7) <input type="checkbox" data-k="vote" /></label>
      <label>GameFlag 0x20(투표 해금) <input type="checkbox" data-k="flag20" /></label>
      <label>GameFlag 0x22(기존 보너스) <input type="checkbox" data-k="flag22" /></label>
      <label>보드 <select data-k="board">${[0, 1, 2, 3, 4, 5, 6].map((b) => `<option>${b}</option>`).join('')}</select></label>
      <label>챔피언십 규칙 <input type="checkbox" data-k="champ" /></label>`;
    const set = (k: string, v: string): void => {
      const el = box!.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-k=${k}]`);
      if (el) el.value = v;
    };
    const ck = (k: string, v: boolean): void => {
      const el = box!.querySelector<HTMLInputElement>(`[data-k=${k}]`);
      if (el) el.checked = v;
    };
    set('step', q.get('step') ?? 'checkMember');
    set('turn', q.get('turn') ?? '10');
    set('bonus', q.get('bonus') ?? '1');
    set('handi', q.get('handi') ?? '0,0,0,0');
    set('level', q.get('level') ?? '1');
    set('board', q.get('board') ?? '6');
    ck('fast', q.get('fast') === '1');
    ck('inst', q.get('inst') !== '0');
    ck('gyro', q.get('gyro') !== '0');
    ck('vote', q.get('vote') === '1');
    ck('flag20', q.get('flag20') === '1');
    ck('flag22', q.get('flag22') === '1');
    ck('champ', q.get('champ') === '1');
    const anchor = panel?.querySelector('.jw-ui-start');
    if (anchor) anchor.before(box);
    else panel?.append(box);
  }
  const val = (k: string): string => box!.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-k=${k}]`)?.value ?? '';
  const on = (k: string): boolean => box!.querySelector<HTMLInputElement>(`[data-k=${k}]`)?.checked ?? false;
  const handi = val('handi')
    .split(',')
    .map((x) => Math.max(0, Math.min(5, Number(x) || 0)));
  return {
    step: val('step') || 'checkMember',
    turn: Number(val('turn')) || 10,
    bonus: Number(val('bonus')),
    handi: [0, 1, 2, 3].map((i) => handi[i] ?? 0),
    level: Number(val('level')) || 0,
    fast: on('fast'),
    inst: on('inst'),
    gyro: on('gyro'),
    vote: on('vote'),
    flag20: on('flag20'),
    flag22: on('flag22'),
    board: Number(val('board')),
    champ: on('champ'),
  };
}

function makeConfig(com: boolean[], t: PartyRuleTest): PartyRuleConfig {
  const c = defaultConfig(0);
  c.players.forEach((p, i) => {
    p.com = !!com[i];
    p.level = p.com ? t.level : 1;
    p.handicap = t.handi[i];
  });
  if (c.players.every((p) => p.com)) c.players[0].com = false;
  c.turnMax = t.turn;
  c.bonusType = t.bonus;
  c.flag8 = t.fast;
  c.flag4 = t.inst;
  c.flag6 = t.gyro;
  c.flag7 = t.vote;
  c.gameFlag20 = t.flag20;
  c.gameFlag22 = t.flag22;
  c.boardId = t.board;
  c.boardMode = t.champ ? 1 : 0;
  c.menuLevel = c.players.map((p) => p.level);
  c.menuSpeed = t.fast;
  c.menuInst = t.inst;
  c.menuGyro = t.gyro;
  return c;
}

export interface PartyRuleRun {
  readonly screen: PartyRuleScreen;
  stop(): void;
  press(bits: number): void;
  debug(): string;
}

export async function runPartyRule(
  stage: HTMLElement,
  cfg: { com: boolean[]; pads: (PadSource | null)[]; muted: boolean; test: PartyRuleTest; onDone(result: string): void },
): Promise<PartyRuleRun> {
  const q = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  stage.append(canvas);
  const snd = shellSound({ muted: cfg.muted, pan2d: false, scene: 'menu01', pads: (pid) => cfg.pads[pid] });

  const bgParam = q.get('bg');
  const bgUrl = bgParam === 'none' ? null : (bgParam ?? `${ASSETS}modeselect/backdrop_temp.png`);
  let backdrop: HTMLImageElement | undefined;
  if (bgUrl) {
    const img = new Image();
    img.src = bgUrl;
    try {
      await img.decode();
      backdrop = img;
    } catch {
      console.warn(`partyrule: 배경 이미지를 읽지 못했다 ${bgUrl}`);
    }
  }
  const url = (p: string): string => `${ASSETS}mgmcommon/${p}`;
  const view = await MgmView.create({ canvas, assets: { url }, parts: [PARTYRULE_PART, PARTYRULE_FACES], backdrop });
  const extra = (await (await fetch(url(PARTYRULE_PART))).json()) as PartyRuleExtra;
  applyPartyRuleExtra(view.spec, extra);
  const sound = new MgmSound(view.spec.sounds, view.url, snd.mgm());

  const conf = makeConfig(cfg.com, cfg.test);
  const prev = new Map<number, number>();
  let extraBits = 0;
  const resultBox = document.querySelector<HTMLElement>('.jw-ui-result');
  const screen = new PartyRuleScreen({
    host: view,
    cfg: conf,
    sound,
    start: cfg.test.step,
    pads: {
      poll(pid: number): { hold: number; trig: number } {
        let hold = toBex(cfg.pads[pid]?.read() ?? null);
        if (pid === screen.input.operator || (screen.input.operator < 0 && pid === 0)) {
          hold |= extraBits;
          extraBits = 0;
        }
        const t = hold & ~(prev.get(pid) ?? 0);
        prev.set(pid, hold);
        return { hold, trig: t };
      },
    },
  });
  const describe = (): string => JSON.stringify(screen.summary(), null, 1);
  let lastStep = '';

  const render = (): void => {
    view.begin();
    screen.draw();
    view.end();
  };
  render();
  void appBgm().enter('partyrule', cfg.muted);
  let done = false;
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const loop = (now: number): void => {
    acc += Math.min(250, now - last);
    last = now;
    let n = 0;
    while (acc >= 1000 / 60 && n < 4 && !done) {
      screen.tick(DT);
      acc -= 1000 / 60;
      n++;
      const key = `${screen.flow.step}/${screen.flow.history.length}`;
      if (key !== lastStep) {
        lastStep = key;
        if (resultBox) resultBox.textContent = describe();
      }
      if (screen.finished) {
        done = true;
        appBgm().exit('partyrule', screen.flow.stack[screen.flow.stack.length - 1] === 14 ? 'start' : 'back');
        cfg.onDone(describe());
      }
    }
    render();
    if (!stopped) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  let stopped = false;
  const run: PartyRuleRun = {
    screen,
    press(bits) {
      extraBits |= bits;
    },
    debug() {
      const m = screen.msg.st;
      return `단계 ${screen.flow.step}  스택 ${screen.flow.stack.join(',')}  조작 ${screen.input.operator + 1}P  프레임 ${screen.frame}
메시지 상태 ${m.state}/${m.sub}  선택형 ${m.choice ? `커서 ${m.choiceCursor}` : '아님'}  결과 ${m.choiceResult}
멤버 행 ${screen.member.row}  편집 ${screen.member.busy ? 1 : 0}  규칙 확인 결과 ${screen.check.result}  플레이 방법 행 ${screen.rule.row}`;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      done = true;
      view.dispose();
      canvas.remove();
      snd.close(300);
    },
  };
  return run;
}
