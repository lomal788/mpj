/**
 * 페이지 ↔ 미니게임 모드 공용 UI 모듈(shell/mgmcommon) 데모 연결 — 어댑터(입력·소리·에셋 경로)와 60Hz 고정 스텝 루프. charselect_page.ts·modeselect_page.ts 와 같은 방식.
 * 데모 흐름(원본 라벨·레이아웃 그대로, 흐름 순서는 확인용 구성 [설계]):
 *   ① 메시지 흐름(사람 A): mgmet_entFirst_mw_guide00~02 (Text0 = im_mode03_name)  ② 자동 흐름(3.0 s): mgmet_fp_mw_howToPlay00~02
 *   ③ 공용 창 mgm00_tlp_course_01(SetAnimeWindow in_left/normal_left/out_left) "프리 플레이"
 *   ④ 공용 메뉴 mgm01_base_freeplay_00 + 항목 레이아웃 mgm01_thum_00 15개(x_filter_02 의 x_thum_02_NN 에 SetConstraint), 3행×5열 격자, 안내 Back·HowTo
 *   bex 비트: A 0x1, B 0x2, 십자 0x100~0x800, 스틱 0x10000~0x80000 (docs/shell/mgm_common.md 6.10)
 */
import { ASSETS } from './env';
import { shellSound } from './view/sound';
import { NPAD, STICK_MAX, type PadInput } from './core/pad';
import {
  FiberRunner,
  MessageFlow,
  MessageWindow,
  MgmetGuides,
  MgmInput,
  MgmLayout,
  MgmSound,
  MgmView,
  MgmWindow,
  PAD,
  paneGlobal,
  plainText,
  waitFrames,
  waitUntil,
  type Flow,
  type MgmPlayer,
} from './shell/mgmcommon';
import type { PadSource } from './view/input';

const STICK_ON = 0.5 * STICK_MAX;
const DT = Math.fround(1 / 60);

function toBex(p: PadInput | null): number {
  if (!p) return 0;
  let b = 0;
  if (p.buttons & NPAD.A) b |= 0x1;
  if (p.buttons & NPAD.B) b |= 0x2;
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

/** mgm01 MgListMenuAnime @mgm01 0x71000530a0 [데이터] */
const MG_LIST_ANIME = ['on', null, null, 'off', 'press', 'normal', 'on_ng', null, null, 'off_ng', 'press_ng', 'normal_ng'];
const ROWS = 3;
const COLS = 5;

export interface MgmCommonRun {
  readonly phase: string;
  readonly view: MgmView;
  readonly msg: MessageWindow;
  readonly menu: MgmWindow;
  stop(): void;
  /** 시험용: 다음 입력 읽기에 bits 를 한 번 더한다(조작 플레이어) */
  press(bits: number): void;
  debug(): string;
}

export async function runMgmCommonDemo(
  stage: HTMLElement,
  cfg: { com: boolean[]; pads: (PadSource | null)[]; muted: boolean; onDone(result: string): void },
): Promise<MgmCommonRun> {
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  stage.append(canvas);
      // Play2D 위치 → 좌우 팬: 원본 팬 곡선 [미확정] → 화면 x 선형 [근사] (charselect_page 와 같음)
  const snd = shellSound({ muted: cfg.muted, pan2d: true, scene: 'mgmcommon', pads: (pid) => cfg.pads[pid] });

  // 흐림 창 뒤 그림: 원본 = 항구 3D 장면 [미확정] → modeselect 의 임시 대역 그림 [근사]. ?bg=none 이면 없음
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
      console.warn(`mgmcommon: 배경 이미지를 읽지 못했다 ${bgUrl}`);
    }
  }

  const view = await MgmView.create({ canvas, assets: { url: (p) => `${ASSETS}mgmcommon/${p}` }, parts: ['mgm01.json'], backdrop });
  const texts = view.spec.texts;
  const players: MgmPlayer[] = [0, 1, 2, 3].map((pid) => ({ pid, type: cfg.com[pid] ? 1 : 0 }));
  if (players.every((p) => p.type === 1)) players[0].type = 0;
  const prev = new Map<number, number>();
  let extra = 0;
  const input: MgmInput = new MgmInput(
    {
      poll(pid: number): { hold: number; trig: number } {
        let hold = toBex(cfg.pads[pid]?.read() ?? null);
        if (pid === input.operator || (input.operator < 0 && pid === 0)) {
          hold |= extra;
          extra = 0;
        }
        const t = hold & ~(prev.get(pid) ?? 0);
        prev.set(pid, hold);
        return { hold, trig: t };
      },
    },
    () => players,
  );
  const sound = new MgmSound(view.spec.sounds, view.url, snd.mgm());
  const msg = new MessageWindow(view, input, sound);
  const flow = new MessageFlow(() => msg, { operator: () => input.operator, dt: () => DT });
  flow.initialize();
  const guides = new MgmetGuides(view, sound, () => input.operator);

  const telop = new MgmWindow(view, 'mgm00_tlp_course_01');
  telop.setAnimeWindow(['in_left', 'normal_left', 'out_left']);
  telop.setText('x_text_00', 'mgm01_start_tlp_courseName');
  telop.setText('x_text_00_shadow', 'mgm01_start_tlp_courseName');

  const menu = new MgmWindow(view, 'mgm01_base_freeplay_00');
  menu.setText('x_text_00', 'mgm01_ui_filterMgGenre00');
  menu.setText('x_guide_00', 'mgm01_ctrl_mgChoiceFp00');
  menu.setText('x_guide_01', 'mgm01_ctrl_mgChoiceFp01');
  menu.setText('x_cursor_LR/x_text_L', 'mgm01_ctrl_mgFilterL00');
  menu.setText('x_cursor_LR/x_text_R', 'mgm01_ctrl_mgFilterR00');
  menu.setupMenu(ROWS, COLS, { wrap: false, checkEnable: false });
  const k = menu.addAnimeSet(MG_LIST_ANIME);
  const games = Object.keys(texts)
    .filter((l) => /^im_mg\d{4}_name$/.test(l))
    .sort()
    .slice(0, ROWS * COLS);
  const items: MgmLayout[][] = [];
  for (let r = 0; r < ROWS; r++) {
    items.push([]);
    for (let c = 0; c < COLS; c++) {
      const n = c * ROWS + r;
      menu.setupItem(r, c, `x_thum_02_${String(n).padStart(2, '0')}`, k);
      const it = new MgmLayout(view.layout('mgm01_thum_00'));
      // 목록 형식 2(N ≤ 15) = 썸네일 크기 0 → x_win_00 만(mgm01_freeplay.md 6.1). NEW·즐겨찾기 표시는 데모 데이터에 없음
      it.inst.setVisible('x_win_01', false);
      it.inst.setVisible('x_win_02', false);
      it.inst.setVisible('new_00', false);
      it.inst.setVisible('x_heart_00', false);
      it.inst.setText('x_mes_00/x_text_00', plainText(texts.mgm01_ui_mgNameBig ?? '', texts, { Text0: games[n] ?? 'mgm01_ui_mgNameNone' }));
      menu.hookItem(r, c, it);
      items[r].push(it);
    }
  }
  menu.setItemEnable(2, 4, false);
  menu.setupFinish();

  let phase = '시작';
  let done = false;
  let result = '';
  const fibers = new FiberRunner();

  function* demo(): Flow {
    phase = '메시지(A 로 넘김)';
    flow.prepare(['mgmet_entFirst_mw_guide00', 'mgmet_entFirst_mw_guide01', 'mgmet_entFirst_mw_guide02'], undefined, undefined, { Text0: 'im_mode03_name' });
    yield* flow.flow(0);
    phase = '자동 메시지(3.0 s)';
    flow.prepare(['mgmet_fp_mw_howToPlay00', 'mgmet_fp_mw_howToPlay01', 'mgmet_fp_mw_howToPlay02']);
    yield* flow.autoFlow(0);
    phase = '공용 창(텔롭)';
    telop.in(false);
    yield* waitUntil(() => !telop.life.opening);
    yield* waitFrames(60);
    telop.out(false);
    yield* waitUntil(() => !telop.isVisible());
    phase = '공용 메뉴';
    menu.in(false);
    guides.in(0);
    menu.setCursor(0, 0, false);
    for (;;) {
      yield;
      const trig = input.trig();
      const rep = input.rep();
      const pos = menu.cursor;
      const se2d = (label: string): void => {
        const g = paneGlobal(menu.inst, `x_thum_02_${String(menu.cursor.col * ROWS + menu.cursor.row).padStart(2, '0')}`);
        sound.playSe2D(label, g ? 960 + g.m[2] : 960);
      };
      if (trig === PAD.A) {
        if (menu.grid.item(pos.row, pos.col)?.enabled) {
          sound.playSe('SQ_SE_SYS_DECI');
          menu.decide();
          yield* waitFrames(1);
          while (menu.isCursorItemAnimating()) yield;
          yield* waitFrames(30);
          result = `결정 ${plainText(texts[games[pos.col * ROWS + pos.row]] ?? '', texts)} (행 ${pos.row}, 열 ${pos.col})`;
          break;
        }
        sound.playSe('SQ_SE_SYS_ERROR');
        menu.decide();
        continue;
      }
      if (trig === PAD.B) {
        sound.playSe('SQ_SE_SYS_CANCEL');
        result = '취소';
        break;
      }
      let moved = false;
      if (rep & 0x10100) moved = menu.moveX(-1);
      else if (rep & 0x40200) moved = menu.moveX(1);
      else if (rep & 0x20800) moved = menu.moveY(-1);
      else if (rep & 0x80400) moved = menu.moveY(1);
      if (moved) se2d('SQ_SE_SYS_CURSOR');
    }
    menu.out(false);
    guides.out(0);
    yield* waitUntil(() => !menu.isVisible());
    phase = '끝';
  }
  fibers.start(demo(), () => {
    done = true;
    run.stop();
    cfg.onDone(result);
  });

  const step = (): void => {
    input.update();
    fibers.step();
    msg.update(DT);
    telop.update();
    menu.update();
    guides.update();
  };
  const render = (): void => {
    view.begin();
    menu.draw();
    telop.draw();
    msg.draw();
    guides.draw();
    view.end();
  };
  render();

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const loop = (now: number): void => {
    acc += Math.min(250, now - last);
    last = now;
    let n = 0;
    while (acc >= 1000 / 60 && n < 4 && !done) {
      step();
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
  const run: MgmCommonRun = {
    get phase() {
      return phase;
    },
    view,
    msg,
    menu,
    press(bits) {
      extra |= bits;
    },
    debug() {
      const s = msg.st;
      return [
        `phase ${phase}  조작 ${input.operator + 1}P`,
        `메시지 상태 ${s.state}/${s.sub} 페이지 ${s.page} 글자 ${msg.revealed}${s.typer ? `/${s.typer.length}` : ''} 넘김대기 ${msg.isNextInputWait() ? 1 : 0}`,
        `메뉴 커서 (${menu.cursor.row},${menu.cursor.col}) 보임 ${menu.isVisible() ? 1 : 0}`,
      ].join('\n');
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
