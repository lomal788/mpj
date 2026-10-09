/**
 * 페이지 ↔ 온라인 멀티 화면(app/scene/menu/online) 연결 — partyrule_page.ts 와 같은 어댑터(입력·소리·에셋)·60Hz 고정 스텝 루프, dev/ui.html 시험값 패널.
 * 네트워크는 가짜(FakeOnline). 시험값(패널 또는 URL): entry=friend|world|lobbyHost|lobbyClient, rooms=방 수, join=입장 간격 s(0 = 없음),
 * leave=퇴장까지 s(0 = 안 나감), err=none|connect|join|password|full|dissolve|disconnect|match|timeout, first=1(첫 온라인 안내),
 * humans=1~4(이 기기 사람 수), chara=0~21, match=매칭 걸리는 s, mtime=MATCHING_TIME. 배경 ?bg=none|URL(기본 modeselect/backdrop_temp.png).
 * 키: J=A, K=B, U=X(갱신·방 정보), I=Y(방 ID·패스워드 표시), Q=L, E=R, Enter=+(매칭 취소), 방향키.
 */
import { ASSETS } from '../env';
import { shellSound } from '../view/sound';
import { NPAD, STICK_MAX, type PadInput } from '@game/core/pad';
import { MgmSound, MgmView } from '../shell/mgmcommon';
import { applyOnlineExtra, FakeOnline, ONLINE_FACES, ONLINE_PART, OnlineScreen, type FakeError, type OnlineEntry, type OnlineExtra } from '@app/scene/menu/online';
import type { PadSource } from '../view/input';
import { appBgm } from '../view/bgm';

const STICK_ON = 0.5 * STICK_MAX;
const DT = Math.fround(1 / 60);

/** bex 비트: X 0x4·Y 0x8 [판독 online.md 4.9 정정: 안내 글리프 위치 ↔ 입력 비트], 0x10 L·0x20 R·0x40 ZL·0x80 ZR·0x1000 +·0x2000 − 는 [추정] */
function toBex(p: PadInput | null): number {
  if (!p) return 0;
  let b = 0;
  if (p.buttons & NPAD.A) b |= 0x1;
  if (p.buttons & NPAD.B) b |= 0x2;
  if (p.buttons & NPAD.X) b |= 0x4;
  if (p.buttons & NPAD.Y) b |= 0x8;
  if (p.buttons & NPAD.L) b |= 0x10;
  if (p.buttons & NPAD.R) b |= 0x20;
  if (p.buttons & NPAD.ZL) b |= 0x40;
  if (p.buttons & NPAD.ZR) b |= 0x80;
  if (p.buttons & NPAD.LEFT) b |= 0x100;
  if (p.buttons & NPAD.RIGHT) b |= 0x200;
  if (p.buttons & NPAD.DOWN) b |= 0x400;
  if (p.buttons & NPAD.UP) b |= 0x800;
  if (p.buttons & NPAD.PLUS) b |= 0x1000;
  if (p.buttons & NPAD.MINUS) b |= 0x2000;
  if (p.lx < -STICK_ON) b |= 0x10000;
  if (p.ly > STICK_ON) b |= 0x20000;
  if (p.lx > STICK_ON) b |= 0x40000;
  if (p.ly < -STICK_ON) b |= 0x80000;
  return b;
}

export interface OnlineTest {
  entry: OnlineEntry;
  rooms: number;
  join: number;
  leave: number;
  err: FakeError;
  first: boolean;
  humans: number;
  chara: number;
  match: number;
  mtime: number;
}

const ERRS: FakeError[] = ['none', 'connect', 'join', 'password', 'full', 'dissolve', 'disconnect', 'match', 'timeout'];

/** 패널에 시험값 칸을 한 번 만든다(다음 시작부터 적용) */
export function onlineTestValues(): OnlineTest {
  const q = new URLSearchParams(location.search);
  let box = document.querySelector<HTMLElement>('.jw-online-test');
  if (!box) {
    const panel = document.querySelector<HTMLElement>('.jw-panel');
    box = document.createElement('div');
    box.className = 'jw-online-test';
    box.innerHTML = `<div>온라인 시험값(다음 시작부터, 네트워크 = 가짜)</div>
      <label>들어가는 곳 <select data-k="entry"><option value="friend">프렌드 매치(방 만들기/찾기)</option><option value="world">전 세계의 사람(매칭)</option><option value="lobbyHost">대기실(방장)</option><option value="lobbyClient">대기실(참가자)</option></select></label>
      <label>가짜 방 수 <input type="number" data-k="rooms" min="0" max="20" /></label>
      <label>입장 간격 s <input type="number" data-k="join" min="0" max="30" step="0.5" /></label>
      <label>퇴장까지 s <input type="number" data-k="leave" min="0" max="60" step="1" /></label>
      <label>오류 흉내 <select data-k="err">${ERRS.map((e) => `<option>${e}</option>`).join('')}</select></label>
      <label>첫 온라인 안내 <input type="checkbox" data-k="first" /></label>
      <label>이 기기 사람 수 <select data-k="humans">${[1, 2, 3, 4].map((n) => `<option>${n}</option>`).join('')}</select></label>
      <label>내 캐릭터 ID <input type="number" data-k="chara" min="0" max="21" /></label>
      <label>매칭 걸리는 s <input type="number" data-k="match" min="1" max="200" /></label>
      <label>MATCHING_TIME s <input type="number" data-k="mtime" min="10" max="120" /></label>`;
    const set = (k: string, v: string): void => {
      const el = box!.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-k=${k}]`);
      if (el) el.value = v;
    };
    set('entry', q.get('entry') ?? 'friend');
    set('rooms', q.get('rooms') ?? '7');
    set('join', q.get('join') ?? '3');
    set('leave', q.get('leave') ?? '0');
    set('err', q.get('err') ?? 'none');
    set('humans', q.get('humans') ?? '1');
    set('chara', q.get('chara') ?? '0');
    set('match', q.get('match') ?? '4');
    set('mtime', q.get('mtime') ?? '120');
    const first = box.querySelector<HTMLInputElement>('[data-k=first]');
    if (first) first.checked = q.get('first') === '1';
    const anchor = panel?.querySelector('.jw-ui-start');
    if (anchor) anchor.before(box);
    else panel?.append(box);
  }
  const val = (k: string): string => box!.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-k=${k}]`)?.value ?? '';
  const num = (k: string, d: number): number => {
    const v = Number(val(k));
    return Number.isFinite(v) ? v : d;
  };
  return {
    entry: (val('entry') || 'friend') as OnlineEntry,
    rooms: Math.max(0, Math.min(20, num('rooms', 7))),
    join: Math.max(0, num('join', 3)),
    leave: Math.max(0, num('leave', 0)),
    err: (ERRS.includes(val('err') as FakeError) ? val('err') : 'none') as FakeError,
    first: box.querySelector<HTMLInputElement>('[data-k=first]')?.checked ?? false,
    humans: Math.max(1, Math.min(4, num('humans', 1))),
    chara: Math.max(0, Math.min(21, num('chara', 0))),
    match: Math.max(1, num('match', 4)),
    mtime: Math.max(10, Math.min(120, num('mtime', 120))),
  };
}

export interface OnlineRun {
  readonly screen: OnlineScreen;
  stop(): void;
  press(bits: number): void;
  debug(): string;
}

export async function runOnline(stage: HTMLElement, cfg: { pads: (PadSource | null)[]; muted: boolean; test: OnlineTest; onDone(result: string): void }): Promise<OnlineRun> {
  const q = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  stage.append(canvas);
  const snd = shellSound({ muted: cfg.muted, pan2d: false, scene: cfg.test.entry === 'world' ? 'matching00' : 'menu00', pads: (pid) => cfg.pads[pid] });

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
      console.warn(`online: 배경 이미지를 읽지 못했다 ${bgUrl}`);
    }
  }
  const url = (p: string): string => `${ASSETS}mgmcommon/${p}`;
  const view = await MgmView.create({ canvas, assets: { url }, parts: [ONLINE_PART, ONLINE_FACES], backdrop });
  const extra = (await (await fetch(url(ONLINE_PART))).json()) as OnlineExtra;
  applyOnlineExtra(view.spec, extra);
  const sound = new MgmSound(view.spec.sounds, view.url, snd.mgm());

  const t = cfg.test;
  const self = { name: 'Player', chara: t.chara, humans: t.humans };
  const net = new FakeOnline({ rooms: t.rooms, joinInterval: t.join, leaveAfter: t.leave, error: t.err, seed: 20261007, matchSec: t.match, self: { ...self } });
  const prev = new Map<number, number>();
  let extraBits = 0;
  const resultBox = document.querySelector<HTMLElement>('.jw-ui-result');
  const screen = new OnlineScreen({
    host: view,
    net,
    self,
    entry: t.entry,
    firstOnline: t.first,
    matchingTime: t.mtime,
    sound,
    pads: {
      poll(pid: number): { hold: number; trig: number } {
        let hold = toBex(cfg.pads[pid]?.read() ?? null);
        if (pid === 0) {
          hold |= extraBits;
          extraBits = 0;
        }
        const tr = hold & ~(prev.get(pid) ?? 0);
        prev.set(pid, hold);
        return { hold, trig: tr };
      },
    },
  });
  const describe = (): string => JSON.stringify(screen.summary(), null, 1);
  let lastKey = '';

  const render = (): void => {
    view.begin();
    screen.draw();
    view.end();
  };
  void appBgm().enter(t.entry === 'world' ? 'onlineWorld' : 'onlineFriend', cfg.muted);
  render();
  let done = false;
  let stopped = false;
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
      const f = screen.flow;
      const key = `${f.step}/${f.history.length}/${f.room?.members.length ?? -1}/${f.rooms.length}`;
      if (key !== lastKey) {
        lastKey = key;
        if (resultBox) resultBox.textContent = describe();
      }
      if (screen.finished) {
        done = true;
        appBgm().exit(t.entry === 'world' ? 'onlineWorld' : 'onlineFriend', 'done');
        cfg.onDone(describe());
      }
    }
    render();
    if (!stopped) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const run: OnlineRun = {
    screen,
    press(bits) {
      extraBits |= bits;
    },
    debug() {
      const f = screen.flow;
      const r = f.room;
      const lines = [`단계 ${f.step}  프레임 ${screen.frame}  접속 ${net.isConnected() ? '예' : '아니요'}`];
      if (r) {
        lines.push(`방 ${r.id} ${r.size}인 ${r.host ? '방장' : '참가자'} 패스워드 ${r.password ? '있음' : '없음'} 입장 ${r.entryOpen ? '열림' : '닫힘'}`);
        for (const m of r.members) lines.push(`  ${m.name} 캐릭터${m.chara}${m.ready ? '' : ' (데이터 대기)'}${m.host ? ' 방장' : ''}${m.local ? ' 나' : ''}`);
      } else if (f.step.startsWith('sessionList') || f.rooms.length) lines.push(`검색 결과 ${f.rooms.length}개, 커서 ${f.list.cursor}, 첫 칸 ${f.list.top}, 탭 ${f.list.type}${f.searchId ? `, 방 ID ${f.searchId}` : ''}`);
      if (f.step === 'matchMake') lines.push(`남은 시간 ${f.timeLeft.toFixed(1)} s`);
      if (f.dialog.working) lines.push(`대화상자 커서 ${f.dialog.cursor}`);
      if (f.keypad.working) lines.push(`숫자 입력 ${f.keypad.digits.join('')} (자리 ${f.keypad.pos})`);
      return lines.join('\n');
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
