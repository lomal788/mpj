/**
 * 플레이어 설정 화면 — 상태기계(state.ts) 사건을 명세 레이아웃(assets/setplayer/setplayer.json + 공용 spec.json)·안내·소리로 옮긴다.
 * 그리기는 mgmcommon MgmView(= charselect render2d). 근거: docs/shell/setplayer.md 3.1·6.5·6.8·6.9·7·9.
 * 시스템 애플릿(컨트롤러 지원·유저 선택·소프트웨어 키보드)은 어댑터·페이지 몫 [설계 9.4].
 */
import { MgmGuide, MgmView, parseMessage, plainText, RichTextPane, type MgmAssetAdapter } from '@app/common/ui';
import type { LayoutInst } from '@game/lib/layout';
import { ControllerPool } from './applet';
import { displayName, hardIcon, hasLamp } from './names';
import { ALL_WINS, SetPlayerFlow, USER, win, type SpEvent } from './state';
import type { Controller, ControllerInput, PadType, SetPlayerResult, SetPlayerSoundAdapter, SetPlayerStartArg, SetPlayerSystemAdapter, SlotWork } from './types';

/** sys_icon_hard_01 x_icon_NN 칸 [데이터, charselect.md 12.5 와 같은 표] */
const HARD_INDEX: Record<string, number> = { Handheld: 0, JoyConH: 1, JoyConV_Left: 2, JoyConV_Right: 3, Dual: 4, FullKey: 5 };
const HARD_PANES = ['x_icon_hard_00', 'x_icon_hard_01', 'x_icon_hard_02', 'x_icon_hard_03', 'x_icon_hard_04_left', 'x_icon_hard_04_right', 'x_icon_hard_05'];
const pad2 = (n: number): string => String(n).padStart(2, '0');

export interface SetPlayerOptions {
  canvas: HTMLCanvasElement;
  /** assets/mgmcommon 기준 경로 → URL */
  assets: MgmAssetAdapter;
  arg: SetPlayerStartArg;
  input: ControllerInput;
  /** 처음 컨트롤러 할당(pid → 컨트롤러 id). 기본 1P = 목록 첫 컨트롤러 */
  assign?: (string | null)[];
  /** 처음 플레이어 칸(없으면 4칸: 1P 연동·나머지 게스트, 캐릭터 0..3) */
  slots?: SlotWork[];
  system: SetPlayerSystemAdapter;
  sound?: SetPlayerSoundAdapter;
  backdrop?: CanvasImageSource & { width: number; height: number };
  /** 캐릭터 이름(COM 이름표) */
  charaName?(c: number): string;
  /** 단계 3 진입: 페이지가 캐릭터 선택을 띄우고 끝나면 handle.resolveCharSelect 를 부른다 */
  onCharSelect?(r: SetPlayerResult): void;
  onCharSelectOut?(): void;
  onApplet?(open: boolean, count: number): void;
  onDone?(r: SetPlayerResult): void;
}

export interface SetPlayerHandle {
  readonly flow: SetPlayerFlow;
  readonly pool: ControllerPool;
  readonly base: LayoutInst;
  readonly title: LayoutInst;
  readonly view: MgmView;
  step(): void;
  render(): void;
  result(): SetPlayerResult;
  /** 문구(태그 제거) */
  text(label: string): string;
  resolveCharSelect(decided: boolean, chars?: number[]): void;
  dispose(): void;
}

export function defaultSlots(): SlotWork[] {
  return [0, 1, 2, 3].map((pid) => ({ pid, type: 0, character: pid, baseCharacter: pid, nickname: '', manageIdx: pid === 0 ? 0 : -1, uid: pid === 0 ? 'owner' : '', session: 0 }));
}

export async function createSetPlayer(opts: SetPlayerOptions): Promise<SetPlayerHandle> {
  const view = await MgmView.create({ canvas: opts.canvas, assets: opts.assets, parts: ['../setplayer/setplayer.json'], backdrop: opts.backdrop });
  try {
  const part = (await (await fetch(opts.assets.url('../setplayer/setplayer.json'))).json()) as { texts: Record<string, string>; sounds: Record<string, { file: string; gain: number }> };
  const texts = { ...view.spec.texts, ...part.texts };
  const sounds = { ...view.spec.sounds, ...part.sounds };
  const t = (label: string): string => plainText(texts[label] ?? label, texts);

  const controllers = (): Controller[] => opts.input.list();
  const pool = new ControllerPool(() => controllers().map((c) => c.id));
  const first = controllers()[0]?.id ?? null;
  (opts.assign ?? [first, null, null, null]).forEach((v, i) => (pool.assign[i] = v));
  const slots = opts.slots ?? defaultSlots();

  const bg = view.layout('sys_bg_set_00');
  const base = view.layout('sys_connect_base_00');
  const title = view.layout('sys_connect_tlp_00');
  const guide = new MgmGuide(view, 17, 'sys_ctrl_back');
  bg.visible = false;
  base.visible = false;
  title.visible = false;
  let titleState = -1;

  base.setText(`${USER}/x_btn_ok/x_text_ok`, t('mn01_ui_ok'));
  const sub = new RichTextPane(view.all, base, `${USER}/x_text_00`, view.spec.lineSpace['sys_connect_parts_null_00']?.['x_text_00'] ?? 0);
  sub.set(parseMessage(texts['mn01_connect_ui_user_sub'] ?? '', texts));
  for (let n = 2; n <= 4; n++) {
    base.setText(`${win(n, 1)}/x_text_mess`, t('mn01_connect_ui_user_connected'));
    for (let k = 2; k <= n; k++) base.setText(`${win(n, k)}/x_parts_btn_01/x_text_00`, t('mn01_connect_ui_user_name'));
  }

  const instOf = (path: string): LayoutInst | null => (path === '' ? base : base.part(path));
  const idle = (path: string): boolean => {
    const inst = instOf(path);
    if (!inst) return true;
    const cur = inst.current;
    return inst.done || (cur !== null && !!inst.spec.anims[cur]?.loop);
  };

  const flow = new SetPlayerFlow(opts.arg, slots, pool, {
    idle,
    guideFinished: () => !guide.inst.visible,
    guideIdle: () => guide.idle,
  });

  const result = (): SetPlayerResult => ({
    count: flow.count,
    cancelled: flow.cancelled,
    toCharSelect: opts.arg.toCharSelect,
    slots: slots.map((s) => {
      const cid = s.type === 0 ? pool.assign[s.pid] : null;
      const c = controllers().find((x) => x.id === cid);
      return {
        pid: s.pid,
        type: s.type === 0 ? 'human' : 'com',
        controller: cid ?? null,
        padType: c?.padType ?? null,
        nickname: s.nickname,
        linked: s.manageIdx !== -1,
        displayName: displayName(s, t('im_guest00_name'), opts.charaName ?? ((c) => `pc${pad2(c + 1)}`)),
        character: s.character,
      };
    }),
  });

  const opController = (): string | null => pool.assign[0];
  const playSe = (label: string): void => {
    const s = sounds[label];
    if (s) opts.sound?.play?.(label, opts.assets.url(s.file), s.gain);
  };

  const setTitle = (mode: 0 | 1 | 2): void => {
    const label = ['mn01_connect_ui_number_title', 'mn01_connect_ui_user_title', 'mn01_connect_ui_chara_title'][mode];
    title.setText('x_text_title_00', t(label));
    if (titleState > 1 || titleState < 0) {
      title.play('in');
      titleState = 0;
      title.visible = true;
    }
  };
  const titleOut = (): void => {
    if (titleState === -1 || titleState === 2) return;
    titleState = 2;
    title.play('out');
  };

  const handle = (e: SpEvent): void => {
    switch (e.k) {
      case 'anim':
        instOf(e.path)?.play(e.tag, e.next);
        break;
      case 'se':
        playSe(e.label);
        break;
      case 'vib': {
        const id = opController();
        if (id) opts.sound?.vibrate?.(id, e.name);
        break;
      }
      case 'title':
        setTitle(e.mode);
        break;
      case 'titleOut':
        titleOut();
        break;
      case 'guideIn':
        guide.in(false);
        break;
      case 'guideOut':
        guide.out();
        break;
      case 'root':
        base.visible = true;
        base.play(e.tag, e.tag === 'in' ? 'normal' : undefined);
        break;
      case 'bg':
        bg.visible = e.on;
        bg.play('normal');
        break;
      case 'applet':
        opts.onApplet?.(true, e.count);
        break;
      case 'appletClose':
        opts.onApplet?.(false, flow.count);
        break;
      case 'account':
        void opts.system.selectAccount(e.pid).then((v) => flow.resolveAccount(e.pid, v));
        break;
      case 'name':
        void opts.system.editName(e.pid, e.current, e.maxLen).then((v) => flow.resolveName(e.pid, v));
        break;
      case 'charSelect':
        opts.onCharSelect?.(result());
        break;
      case 'charSelectOut':
        opts.onCharSelectOut?.();
        break;
      case 'done':
        opts.onDone?.(result());
        break;
    }
  };

  const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const linColor = (hex: string | undefined): [number, number, number, number] => {
    const h = /^#?([0-9a-f]{6})$/i.exec(hex ?? '#06b6df')?.[1] ?? '06b6df';
    const c = [0, 2, 4].map((k) => Math.round(255 * toLinear(parseInt(h.slice(k, k + 2), 16) / 255)));
    return [c[0], c[1], c[2], 255];
  };

  /** 6.9 컨트롤러 아이콘(사람·유효 패드만, 그 밖은 숨김 [추정 FUN_7100292788]) */
  const setHard = (path: string, pid: number): void => {
    const s = slots[pid];
    const c = s && s.type === 0 ? controllers().find((x) => x.id === pool.assign[pid]) : undefined;
    const pt: PadType | null = c?.padType ?? null;
    const idx = pt === null ? -1 : HARD_INDEX[hardIcon(pt)];
    for (let k = 0; k < 6; k++) base.setVisible(`${path}/x_icon_${pad2(k)}`, k === idx);
    base.setVisible(`${path}/x_null_lamp`, pt !== null && hasLamp(pt));
    if (!c) return;
    for (const pane of HARD_PANES) base.setMatWhite(`${path}/${pane}`, linColor(pane.endsWith('_right') ? (c.colors?.[1] ?? c.colors?.[0]) : c.colors?.[0]));
    for (let k = 0; k < 4; k++) base.setMatSrtT(`${path}/x_pict_lamp_${pad2(k)}`, 0, k <= pid % 4 ? 0.5 : 0);
  };

  /** 6.5 매 프레임 표시(FUN_71003465d0) + 인원 숫자·화살표(FUN_71003476a4) */
  const refresh = (): void => {
    for (let n = 1; n <= 4; n++) base.setVisible(`${USER}/x_win_${n}`, flow.count === n);
    const guest = t('im_guest00_name');
    for (const w of ALL_WINS) {
      const m = /x_user_(\d)_(\d)P$/.exec(w)!;
      const pid = Number(m[2]) - 1;
      const s = slots[pid];
      const name = s ? displayName(s, guest, opts.charaName ?? ((c) => `pc${pad2(c + 1)}`)) : '';
      base.setText(`${w}/x_parts_username/x_text_00`, name);
      base.setText(`${w}/x_parts_username/x_text_01`, name);
      setHard(`${w}/x_parts_hard`, pid);
      if (pid >= 1) base.setText(`${w}/x_parts_btn_00/x_text_00`, t(s && s.manageIdx !== -1 ? 'mn01_connect_ui_user_release' : 'mn01_connect_ui_user_account'));
    }
    base.setText(`${USER}/x_cursor_num/x_text_num`, t(`mn01_connect_ui_player_number${pad2(flow.count)}`));
    base.setText(`${USER}/x_cursor_num/x_text_num_shadow`, t(`mn01_connect_ui_player_number${pad2(flow.count)}`));
    base.setVisible(`${USER}/x_cursor_num/x_icon_cursor_left`, opts.arg.min < flow.count);
    base.setVisible(`${USER}/x_cursor_num/x_icon_cursor_right`, flow.count < opts.arg.max);
  };

  flow.start();
  for (const e of flow.takeEvents()) handle(e);
  refresh();

  return {
    flow,
    pool,
    base,
    title,
    view,
    step() {
      flow.update(opts.input);
      for (const e of flow.takeEvents()) handle(e);
      refresh();
      bg.update(1);
      base.update(1);
      title.update(1);
      if (titleState === 0 && title.done) titleState = 1;
      if (titleState === 2 && title.done) {
        titleState = -1;
        title.visible = false;
      }
      guide.update();
    },
    render() {
      view.begin();
      if (bg.visible) view.draw(bg);
      if (base.visible) {
        view.draw(base);
        sub.draw(view.r2d);
      }
      guide.draw();
      if (title.visible) view.draw(title);
      view.end();
    },
    result,
    text: t,
    resolveCharSelect(decided, chars) {
      flow.resolveCharSelect(decided, chars);
    },
    dispose() {
      view.dispose();
    },
  };
  } catch (error) { view.dispose(); throw error; }
}
