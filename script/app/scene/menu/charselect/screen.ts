/**
 * 캐릭터 선택 화면 컨트롤러 — 상태기계(state.ts) 사건을 명세 레이아웃(scene2d)·3D 카드(preview3d)·어댑터(소리·진동)로 옮긴다.
 * 레이아웃 조립·그리기 순서·문구는 docs/shell/charselect.md 3.1·5·6·7 [판독·데이터]. 엔진층(script/game/core·games·view)을 쓰지 않는다.
 * 3D 미리 받기 등급(커서 → 주변 칸 → 나머지)은 charaTiers — docs/engine/loader_manager.md §13.4.
 */
import { MenuSurface } from '@app/common/render/menu';
import { mpatTables, Preview3D, type LoadStat, type PrepStat } from './preview3d';
import { nodeMatrix, Render2D } from '@app/common/ui/layout/render';
import { LayoutInst } from '@game/lib/layout';
import { CharSelectState, RANDOM, RepeatGen, type CharSelectEvent, type PadFrame } from './state';
import type { CharSelectOptions, Spec } from './types';

/** 컨트롤러 아이콘 칸(sys_icon_hard_01 컨트롤 Joycon) [데이터]. 어느 것을 쓰는지는 [미확정] — 기본 JoyConH(캡처) */
const HARD_ICONS: Record<string, number> = { Handheld: 0, JoyConH: 1, JoyConV_Left: 2, JoyConV_Right: 3, Dual: 4, FullKey: 5 };

const pad2 = (n: number): string => String(n).padStart(2, '0');

export interface CharSelectHandle {
  /** 한 틱(1/60 s) */
  step(): void;
  render(): void;
  dispose(): void;
  readonly state: CharSelectState;
  readonly spec: Spec;
  /** 시험용: 레이아웃 인스턴스 */
  readonly layouts: Record<'bg' | 'title' | 'cards' | 'grid' | 'ok' | 'guide', LayoutInst>;
  /** 카드 3D 로딩 구간 시간(docs 12.7 측정) */
  readonly loadStats: readonly LoadStat[];
  /** 카드 3D 미리 준비 구간별 메인 스레드 시간(docs 12.10) */
  readonly prepStats: readonly PrepStat[];
}

/**
 * 3D 미리 받기 순서·등급(loader_manager.md §13.4): 사람 커서 캐릭터(랜덤 칸 제외) → 사람 커서 이웃 칸(가장 가까운 두 칸 거리 × 1.6 안, 대각 포함) → 나머지.
 * 각 묶음 안은 가장 가까운 커서(랜덤 칸·COM 커서 포함)와의 거리순. open = 받을 수 있는 캐릭터(잠김 제외)
 */
export function charaTiers(
  btnXY: ReadonlyMap<number, readonly [number, number]>,
  cursors: readonly number[],
  human: readonly number[],
  open: readonly number[],
): { order: number[]; now: number; near: number } {
  let pitch2 = Infinity;
  for (const [a, pa] of btnXY) for (const [b, pb] of btnXY) if (a !== b) pitch2 = Math.min(pitch2, (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2);
  const cur = cursors.map((c) => btnXY.get(c)).filter((v): v is readonly [number, number] => !!v);
  const d = (c: number): number => {
    const q = btnXY.get(c);
    return q && cur.length ? Math.min(...cur.map(([x, y]) => (x - q[0]) ** 2 + (y - q[1]) ** 2)) : 0;
  };
  const hum = human.map((c) => btnXY.get(c)).filter((v): v is readonly [number, number] => !!v);
  const nearHuman = (c: number): boolean => {
    const q = btnXY.get(c);
    return !!q && hum.some(([x, y]) => (x - q[0]) ** 2 + (y - q[1]) ** 2 <= pitch2 * 1.6 * 1.6);
  };
  const mine = new Set(human.filter((c) => c !== RANDOM && open.includes(c)));
  const near = open.filter((c) => !mine.has(c) && nearHuman(c));
  const rest = open.filter((c) => !mine.has(c) && !near.includes(c));
  const byD = (a: number, b: number): number => d(a) - d(b);
  return { order: [...[...mine].sort(byD), ...near.sort(byD), ...rest.sort(byD)], now: mine.size, near: near.length };
}

export async function createCharSelect(opts: CharSelectOptions & { controller?: string[] }): Promise<CharSelectHandle> {
  const url = (p: string): string => opts.assets.url(p);
  const spec = (await (await fetch(url('spec.json'))).json()) as Spec;
  const r2d = new Render2D(spec);
  let surface: MenuSurface | null = null;
  let preview: Preview3D | null = null;
  try {
  await r2d.load(url);
  surface = await MenuSurface.create(opts.canvas, spec.screen[0], spec.screen[1]);
  const gpu = surface;
  const gl = gpu.gl;
  const mpat = await fetch(url('../chara/mpat.json'))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const p3d = preview = new Preview3D(spec, url, undefined, { mpat: mpatTables(mpat, ['sys_pc']) });

  const L = (name: string): LayoutInst => new LayoutInst(name, spec.layouts[name], spec);
  const layouts = {
    bg: L('sys_bg_set_00'),
    title: L('sys_connect_tlp_00'),
    cards: L('sys_base_charasel_00'),
    grid: L('sys_base_charasel_01'),
    ok: L('sys_btn_ok_00'),
    guide: L('sys_guide_03'),
  };
  const texts = spec.texts;
  const chars = spec.chars;

  // 제목·배경 (ComUiSettingPlayer 단계 2 문구, FUN_7100344890)
  layouts.title.setText('x_text_title_00', texts.mn01_connect_ui_chara_title);
  layouts.title.play('in', 'normal');
  layouts.bg.play('normal');
  // 격자: constrained = 1 → x_null_win 숨김 [판독 생성자]
  layouts.grid.setVisible('x_null_win', false);
  layouts.grid.setText('x_parts_btn_random/x_text_random', texts.mn01_connect_ui_chara_random);
  const btnPath = (c: number): string => (c === RANDOM ? 'x_parts_btn_random' : `x_parts_btn_${pad2(chars[c].btn)}`);
  const unlocked = opts.unlocked ?? { pauline: false, ninji: false };
  const isLocked = (c: number): boolean => (c === 12 && !unlocked.pauline) || (c === 21 && !unlocked.ninji);
  for (const c of chars) {
    const b = btnPath(c.index);
    const locked = isLocked(c.index);
    layouts.grid.setVisible(`${b}/x_null_open`, !locked);
    layouts.grid.setVisible(`${b}/x_null_secret`, locked);
    // 얼굴 = face_128_pcNN (GetPCFace 크기 "128"). 버튼 부품의 덮어쓴 얼굴 재질은 얼굴 칸이 투영 텍스좌표(texCoordGen source 4)이고
    // 텍스처 SRT 배율 1.9 [데이터] → 256 칸에서 얼굴이 256/1.9 ≈ 134.7 px 로 가운데에 붙는다 [추정: 투영 규칙, 캡처 칸 크기와 일치].
    // 둥근 사각 모양 칸도 같은 크기로 둔다 [근사]
    const face = `face_128_${c.pc}^u`;
    for (const part of ['x_parts_pc128', 'x_face_secret']) {
      layouts.grid.setTexture(`${b}/${part}/x_face_pc256`, 1, face);
      const f = layouts.grid.find(`${b}/${part}/x_face_pc256`);
      if (f) {
        f[0].nodes[f[1]].z = [256 / 1.9, 256 / 1.9];
        f[0].nodes[f[1]].uv = [0, 0, 1, 0, 0, 1, 1, 1];
      }
    }
  }
  // OK 버튼
  layouts.ok.setText('x_text_ok', texts.mn01_connect_ui_chara_ok);
  layouts.ok.visible = false;
  // 안내: sys_guide_03 오른쪽 정렬 1개(SetGuidePos 17 → 정렬 2, 개수 1) [판독 ComUiGuide00]
  for (const a of ['x_alignment_left', 'x_alignment_center']) layouts.guide.setVisible(a, false);
  for (let i = 1; i < 4; i++) layouts.guide.setVisible(`sys_guide_right_${pad2(i)}`, false);
  layouts.guide.setText('sys_guide_right_00/x_text', texts.sys_ctrl_back);
  layouts.guide.setText('sys_guide_right_00/x_text_shadow', texts.sys_ctrl_back);
  {
    // 오른쪽 정렬: 글자 오른쪽 끝을 x_pos 에 맞춘다 [추정: ali1 배치, 캡처 일치]
    const f = spec.fonts.bqfont_middle;
    const fs = 52;
    let w = 0;
    for (const ch of texts.sys_ctrl_back) w += (f.glyphs[ch]?.adv ?? f.width) * (fs / f.width);
    const g = layouts.guide.find('sys_guide_right_00');
    if (g) g[0].nodes[g[1]].t[0] = -w / 2;
  }
  const posM = nodeMatrix(new LayoutInst('sys_guide_pos_01', spec.layouts.sys_guide_pos_01, spec), 'x_pos_17');
  const guideBase: [number, number, number, number, number, number] = [1, 0, posM ? posM[2] : 900, 0, 1, posM ? posM[5] : -478];

  const players = opts.players;
  const rand = opts.rand ?? ((n: number): number => Math.floor(Math.random() * n));
  const state = new CharSelectState({
    btnNo: chars.map((c) => c.btn),
    unlocked,
    disabled: opts.disabled,
    players: players.map((p) => ({ type: p.type === 'human' ? 0 : 1, initial: p.initial })),
    rand,
    animLen: {
      layoutIn: spec.layouts.sys_base_charasel_01.anims.in.len,
      layoutOut: spec.layouts.sys_base_charasel_01.anims.out.len,
      okPress: spec.layouts.sys_btn_ok_00.anims.press.len,
      btn: Object.fromEntries(Object.entries(spec.layouts.sys_btn_charasel_00.anims).map(([k, a]) => [k, a.len])) as never,
    },
  });
  const reps = players.map(() => new RepeatGen());
  let cardCount = 0;
  const winPath = (slot: number): string => (cardCount === 1 ? 'x_parts_1win' : `x_parts_${cardCount}win_${slot + 1}P`);
  const controller = (i: number): string => opts.controller?.[i] ?? 'JoyConH';

  // 컨트롤러 아이콘(docs 12.5): 본체 색 = 재질 white [추정], 램프 = 재질 SRT t.y 0.5 켜짐·0 꺼짐, 플레이어 p 는 램프 0..p 켜짐 [추정: 캡처 2P = ●●○○]
  const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const bodyColor = (i: number): [number, number, number, number] => {
    const h = /^#?([0-9a-f]{6})$/i.exec(players[i]?.controllerColor ?? '#06b6df')?.[1] ?? '06b6df';
    const c = [0, 2, 4].map((k) => Math.round(255 * toLinear(parseInt(h.slice(k, k + 2), 16) / 255)));
    return [c[0], c[1], c[2], 255];
  };
  const setHard = (inst: LayoutInst, path: string, type: string, player: number): void => {
    const idx = HARD_ICONS[type] ?? 1;
    for (let k = 0; k < 6; k++) inst.setVisible(`${path}/x_icon_${pad2(k)}`, k === idx);
    const col = bodyColor(player);
    for (const pane of ['x_icon_hard_00', 'x_icon_hard_01', 'x_icon_hard_02', 'x_icon_hard_03', 'x_icon_hard_04_left', 'x_icon_hard_04_right', 'x_icon_hard_05'])
      inst.setMatWhite(`${path}/${pane}`, col);
    for (let k = 0; k < 4; k++) inst.setMatSrtT(`${path}/x_pict_lamp_${pad2(k)}`, 0, k <= player % 4 ? 0.5 : 0);
  };

  const gridBase = (): [number, number, number, number, number, number] => {
    const m = nodeMatrix(layouts.cards, 'x_null_win_charasel');
    return m ? [1, 0, m[2], 0, 1, m[5]] : [1, 0, 0, 0, 1, -296];
  };

  // 3D 미리 준비 순서(docs 12.10): 지금 커서 칸(랜덤 칸 포함)에 가까운 캐릭터부터, 잠긴 캐릭터 제외.
  const btnXY = new Map<number, [number, number]>();
  for (const c of [...chars.map((x) => x.index), RANDOM]) {
    const m = nodeMatrix(layouts.grid, btnPath(c));
    if (m) btnXY.set(c, [m[2], m[5]]);
  }
  const prefetch = (): void => {
    const open = chars.map((c) => c.index).filter((c) => !isLocked(c));
    const human = state.players.filter((p) => p.type === 0 && !isLocked(p.cursor)).map((p) => p.cursor);
    const t = charaTiers(
      btnXY,
      state.players.map((p) => p.cursor),
      human,
      open,
    );
    p3d.prefetch(t.order, t.now, t.near);
  };

  const handle = (ev: CharSelectEvent[]): void => {
    if (ev.some((e) => e.type === 'card')) prefetch();
    for (const e of ev) {
      switch (e.type) {
        case 'btn': {
          const part = layouts.grid.part(btnPath(e.chara));
          if (part?.hasAnim(e.anim) || (e.next && part?.hasAnim(e.next))) part!.play(e.anim, e.next);
          break;
        }
        case 'mark': {
          const b = btnPath(e.chara);
          const cur = `${b}/x_parts_cursor`;
          for (let k = 1; k <= 8; k++) {
            layouts.grid.setVisible(`${cur}/x_cursor_${k}P`, k - 1 === e.player);
            layouts.grid.setVisible(`${b}/x_pict_base_${k}P`, k - 1 === e.player);
          }
          const human = e.player >= 0 && !e.com;
          layouts.grid.setVisible(`${cur}/x_player`, human);
          layouts.grid.setVisible(`${cur}/x_com`, e.player >= 0 && e.com);
          if (human) {
            layouts.grid.setText(`${cur}/x_text_num_00`, String(e.player + 1));
            layouts.grid.setText(`${cur}/x_text_num_00_shadow`, String(e.player + 1));
          } else if (e.player >= 0) {
            layouts.grid.setText(`${cur}/x_text_COM`, texts.mn01_connect_ui_chara_CPU);
            layouts.grid.setText(`${cur}/x_text_COM_shadow`, texts.mn01_connect_ui_chara_CPU);
          }
          if (e.player >= 0) setHard(layouts.grid, `${cur}/x_parts_hard`, controller(e.player), e.player);
          break;
        }
        case 'cards': {
          cardCount = e.count;
          for (let n = 1; n <= 4; n++) layouts.cards.setVisible(`x_null_${n}win`, n === e.count);
          const lay = spec.layouts[`sys_win_charamodel_0${Math.max(0, e.count - 1)}`];
          const pict = lay.nodes.find((n) => n.n === 'x_pict_3d')!;
          p3d.setup(e.slots.map(() => [pict.z[0], pict.z[1]]));
          for (const s of e.slots) {
            const w = winPath(s.slot);
            r2d.dynamic.set(`rt:${s.slot}`, p3d.slots[s.slot].rt.texture);
            layouts.cards.setTexture(`${w}/x_pict_3d`, 0, `rt:${s.slot}`);
            // StatusName Name_01 = x_text_01(부품 덮어쓰기로 보이고 검은 글자), Name_00 = x_text_00(숨김) [데이터]
            for (const t of ['x_text_00', 'x_text_01']) layouts.cards.setText(`${w}/x_parts_username/${t}`, players[s.player].name ?? `${s.player + 1}P`);
            setHard(layouts.cards, `${w}/x_parts_hard`, controller(s.player), s.player);
          }
          break;
        }
        case 'card': {
          const w = winPath(e.slot);
          layouts.cards.setVisible(`${w}/x_text_chara`, e.shown);
          if (e.shown) layouts.cards.setText(`${w}/x_text_chara`, texts[chars[e.chara].label]);
          p3d.setChara(e.slot, e.chara, e.shown);
          break;
        }
        case 'motion':
          p3d.play(e.slot, e.clip, e.next);
          break;
        case 'se': {
          const s = spec.sounds?.[e.label];
          let x: number | undefined;
          if (e.chara !== undefined) {
            const m = nodeMatrix(layouts.grid, btnPath(e.chara), gridBase());
            if (m) x = 960 + m[2];
          }
          if (s) opts.sound?.play?.(e.label, url(s.file), s.gain, x);
          break;
        }
        case 'voice': {
          // 변형 하나(원본 userproc 1 RAND_VOICE_PLAY_CN4 [추정: 0..T15−1 무작위], docs 12.4)
          const v = spec.voices?.[chars[e.chara].pc];
          if (v && v.files.length) opts.sound?.voice?.(v.label, url(v.files[rand(v.files.length)]), v.gain, e.slot);
          break;
        }
        case 'voiceStop':
          opts.sound?.voiceStop?.(e.slot);
          break;
        case 'vib':
          opts.sound?.vibrate?.(e.player, e.name);
          break;
        case 'layout': {
          const inst = e.target === 'grid' ? layouts.grid : e.target === 'cards' ? layouts.cards : e.target === 'ok' ? layouts.ok : layouts.guide;
          inst.play(e.anim, e.next);
          break;
        }
        case 'visible': {
          if (e.target === 'all') {
            for (const k of ['cards', 'grid', 'guide'] as const) layouts[k].visible = e.visible;
          } else layouts[e.target].visible = e.visible;
          break;
        }
        case 'decided':
          opts.onDecided?.(e.result);
          break;
        case 'cancel':
          opts.onCancel?.();
          break;
        case 'finished':
          // 결정 → 다음 장면: StopBgm(Stop_Preset, 페이드 프리셋 [미확정] → 0.5 s [근사]). 취소(뒤로)는 같은 메뉴라 BGM 을 끊지 않는다(docs 12.3)
          if (e.decided) opts.sound?.bgmStop?.(0.5);
          opts.onFinished?.(e.decided);
          break;
      }
    }
  };

  // 소리 버퍼 미리 받기(docs 12.10): SE·보이스 변형 전부 — 결정 순간 디코드 지연으로 보이스가 늦거나 빠지지 않게(BGM 은 어댑터가 첫 조각부터 스트리밍)
  opts.sound?.preload?.([...Object.values(spec.sounds ?? {}).map((x) => url(x.file)), ...Object.values(spec.voices ?? {}).flatMap((v) => v.files.map(url))]);
  // 배경음악: 장면(menu01) 시작부터 돌던 SM_BGM_MENU_MAP 을 이어서 튼다(어댑터가 이미 돌고 있으면 무시, docs 12.3)
  if (spec.bgm) opts.sound?.bgm?.(spec.bgm.label, url(spec.bgm.file), spec.bgm.gain, spec.bgm.loopStart, spec.bgm.loopEnd);
  handle(state.start(false));

  let disposed = false;
  const step = (): void => {
    if (disposed) return;
    const pads: PadFrame[] = players.map((p, i) => {
      if (p.type !== 'human') return { trig: 0, rep: 0 };
      const { hold, trig } = opts.input.poll(i);
      return { trig, rep: reps[i].next(hold, trig) };
    });
    handle(state.step(pads));
    for (const l of Object.values(layouts)) l.update(1);
    p3d.update();
  };

  const render = (): void => {
    if (disposed || !gpu.active) return;
    gl.setRenderTarget(null);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    p3d.render(gl);
    r2d.begin();
    r2d.draw(layouts.bg);
    r2d.draw(layouts.cards);
    r2d.draw(layouts.grid, gridBase());
    r2d.draw(layouts.ok);
    r2d.draw(layouts.guide, guideBase);
    r2d.draw(layouts.title);
    r2d.render(gl);
  };

  return {
    step,
    render,
    state,
    spec,
    layouts,
    loadStats: p3d.stats,
    prepStats: p3d.prepStats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      void gpu.disposeAfter(p3d.settle(), () => { p3d.dispose(); r2d.dispose(); })
        .catch(error => console.warn('charselect cleanup', error));
    },
  };
  } catch (error) { await preview?.settle(); preview?.dispose(); r2d.dispose(); surface?.dispose(); throw error; }
}
