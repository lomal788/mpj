/**
 * 개별 설정 화면 그리기·흐름 — settingView(순수 상태)를 공용 창(MgmWindow, mgm01_base_mginfo_00)에 옮긴다. DecideMinigameFlow 상태 4 의 MgSettingFlow 자리.
 * 근거: docs/shell/mgm01_freeplay.md 5.1·6.2·6.5(ApplySetting: 물리 rule pane 차례, hidden -1, GetCursorPaneName, CPU UV t = index×0.25)·7(mginfo in/out 10, left/right_select 8, 고유 문구), mgm_common.md 9.6.
 * 항목 애니 세트·문구 페인 배정·heart 애니·게임 넘김 창 애니는 원본 표가 문서에 없어 9절 [설계].
 */
import type { Flow } from '../mgmcommon/fiber';
import type { MgmDrawHost } from '../mgmcommon/window';
import { MgmWindow } from '../mgmcommon/window';
import type { MgmSound } from '../mgmcommon/sound';
import { recordView, RULE_TYPE_LABEL, TEAM_FORMAT_PANE } from './catalog';
import { SETTING_ITEM, SettingState, type SettingDeps, type SettingInit, type SettingResult } from './settingView';
import type { Mgm01PlayRequest, Mgm01SettingValues } from './types';

export const SETTING_PANES = ['x_rule/x_team_00', 'x_rule/x_rule_option_00', 'x_rule/x_rule_option_01', 'x_rule/x_play_00'] as const;
export const SETTING_ITEM_ANIME = ['normal', 'off', 'on', 'off', null, null, 'lock', 'lock', 'lock', 'lock', null, null] as const;
export const PLAY_BUTTON_ANIME = ['normal', 'off', 'on', 'off', 'press', null, 'on_ng', 'off_ng', 'on_ng', 'off_ng', 'press_ng', null] as const;
const FACE_START: Readonly<Record<number, number>> = { 0: 0, 4: 4, 5: 8, 6: 12, 3: 14, 2: 15, 1: 17 };

export interface SettingOutcome {
  result: SettingResult;
  id: number;
  values: Mgm01SettingValues;
  request: Mgm01PlayRequest | null;
  favoriteDirty: boolean;
}

export interface SettingScreenDeps extends SettingDeps {
  sound: MgmSound;
  input(): { trig: number; rep: number };
  record(id: number, endless: boolean): number | null;
  playCount(id: number): number;
  thumb?(id: number): string | null;
  onShow?(id: number): void;
}

const PREVIEW_SLOT: readonly (readonly [number, string])[] = [
  [-3, '06'],
  [-2, '05'],
  [-1, '04'],
  [0, '00'],
  [1, '01'],
  [2, '02'],
  [3, '03'],
  [4, '07'],
];

export class SettingScreen {
  readonly win: MgmWindow;
  state: SettingState | null = null;
  private readonly kRule: number;
  private readonly kPlay: number;

  constructor(
    readonly host: MgmDrawHost,
    readonly deps: SettingScreenDeps,
  ) {
    this.win = new MgmWindow(host, 'mgm01_base_mginfo_00');
    this.win.setupMenu(1, 4, { wrap: false, checkEnable: false });
    this.kRule = this.win.addAnimeSet(SETTING_ITEM_ANIME);
    this.kPlay = this.win.addAnimeSet(PLAY_BUTTON_ANIME);
    SETTING_PANES.forEach((p, c) => this.win.setupItem(0, c, p, c === 3 ? this.kPlay : this.kRule));
    this.win.setText('x_rule/x_play_00/x_text_00', 'mgm01_ui_playButton');
    this.win.setText('x_cursor_LR/x_text_L', 'mgm01_ctrl_mgFilterL01');
    this.win.setText('x_cursor_LR/x_text_R', 'mgm01_ctrl_mgFilterR01');
    this.win.setText('x_text_rule', '');
    for (let i = 0; i < 3; i++) this.win.setText(`x_rule/x_team_00/x_vs_0${i}`, 'mgm01_ui_vs');
  }

  colOf(item: number): number {
    const s = this.state!;
    if (item === SETTING_ITEM.TEAM) return 0;
    if (item === SETTING_ITEM.PLAY) return 3;
    return 1 + s.rulePane[item - 1];
  }

  private bindGame(): void {
    const s = this.state!;
    const g = s.game;
    const w = this.win;
    const genre = RULE_TYPE_LABEL[g.rule];
    w.inst.setVisible('x_mggenre', !!genre);
    if (genre) w.setText('x_mggenre', genre);
    w.setText('x_mgname', 'mgm01_ui_mgNameFp', { Text0: g.nameLabel });
    w.inst.part('x_heart_00')?.play(this.deps.isFavorite(g.id) ? 'normal' : 'off');
    const tk = this.deps.thumb?.(g.id);
    if (tk) w.inst.setTexture('x_thum_00', 1, tk);
    this.deps.onShow?.(g.id);
    this.bindRecord();
    w.inst.setVisible('x_cursor_LR', s.ids.length > 1);
    w.setItemVisible(0, 0, s.valid[SETTING_ITEM.TEAM]);
    for (let k = 0; k < 2; k++) w.setItemVisible(0, 1 + k, s.rulePane.includes(k));
    this.bindTeam();
    for (let i = 1; i <= 3; i++) this.bindRule(i);
  }

  private bindRecord(): void {
    const s = this.state!;
    const g = s.game;
    const endless = g.mode && s.values[SETTING_ITEM.MODE] === 1;
    const rec = this.deps.record(g.id, endless);
    const rv = rec === null ? null : recordView(g.recordKind, endless, rec);
    this.win.inst.setVisible('x_record_01', !!rv);
    if (rv) {
      this.win.setText('x_record_01/x_text_00', 'mgm01_pt_highscore00');
      this.win.setText('x_record_01/x_text_01', rv.label, rv.inserts);
    }
    this.win.setText('x_record_00/x_text_00', 'mgm01_ui_playCount00');
    this.win.setText('x_record_00/x_text_01', 'mgm01_pt_playCount01', { Number0: this.deps.playCount(g.id) });
  }

  private bindPreview(): void {
    const s = this.state!;
    const n = s.ids.length;
    for (const [o, k] of PREVIEW_SLOT) {
      const key = this.deps.thumb?.(s.ids[(((s.pos + o) % n) + n) % n]);
      if (key) this.win.inst.setTexture(`x_preview/x_preview_${k}`, 1, key);
    }
  }

  private bindTeam(): void {
    const s = this.state!;
    const tv = s.teamView();
    const base = 'x_rule/x_team_00';
    TEAM_FORMAT_PANE.forEach((p, f) => this.win.inst.setVisible(`${base}/${p}`, f === tv.format));
    const start = FACE_START[tv.format] ?? 0;
    const players = this.deps.players();
    tv.positions.forEach((pos, k) => {
      const pid = tv.order[pos];
      const pl = players.find((p) => p.pid === pid);
      const label = !pl || pl.type !== 0 ? 'mgm01_ui_cpu' : `mgm01_ui_player0${pid + 1}`;
      this.win.setText(`${base}/x_text_face_${String(start + k).padStart(2, '0')}`, label);
    });
  }

  private bindRule(item: number): void {
    const s = this.state!;
    const k = s.rulePane[item - 1];
    if (k < 0) return;
    const base = `x_rule/x_rule_option_0${k}`;
    const v = s.values[item];
    const cpu = item === SETTING_ITEM.CPU;
    this.win.inst.setVisible(`${base}/x_rule_00`, !cpu);
    this.win.inst.setVisible(`${base}/x_rule_01`, cpu);
    if (cpu) {
      this.win.setText(`${base}/x_text_02`, 'mgm01_ui_rule_CpuSetting00');
      this.win.setText(`${base}/x_text_cpu_00`, 'mgm01_ui_rule_CpuSetting01', { Text0: `im_comLevel0${v}` });
      this.win.inst.setMatSrtT(`${base}/x_icon_00`, 0, v * 0.25);
    } else {
      const kind = item === SETTING_ITEM.MODE ? 'Endless' : 'Rhythm';
      this.win.setText(`${base}/x_text_01`, `mgm01_ui_rule_${kind}Setting02`);
      this.win.setText(`${base}/x_text_00`, `mgm01_ui_rule_${kind}Setting0${v}`);
    }
  }

  private flushSound(ev: { type: string; label?: string }): void {
    if (ev.type === 'se' && ev.label) this.deps.sound.playSe(ev.label);
  }

  *flow(init: SettingInit): Flow<SettingOutcome> {
    let cur = init;
    for (;;) {
      const s = new SettingState(this.deps, cur);
      this.state = s;
      this.bindGame();
      this.bindPreview();
      let previewWait = false;
      this.win.setupFinish();
      this.win.setCursor(0, this.colOf(s.cursor), true);
      this.win.in(false);
      yield* this.waitOpen();
      while (s.phase !== 'exit') {
        yield;
        if (s.phase === 'active') {
          const i = this.deps.input();
          s.input(i.trig, i.rep);
        } else if (s.phase === 'press' && !this.win.isCursorItemAnimating()) s.pressDone();
        const pv = this.win.inst.part('x_preview');
        if (previewWait && (!pv || pv.done)) {
          previewWait = false;
          this.bindPreview();
          pv?.play('normal');
        }
        for (const e of s.drain()) {
          this.flushSound(e);
          if (e.type === 'cursor') this.win.setCursor(0, this.colOf(e.to));
          else if (e.type === 'value') {
            if (e.item === SETTING_ITEM.TEAM) this.bindTeam();
            else this.bindRule(e.item);
            if (e.item === SETTING_ITEM.MODE) this.bindRecord();
          } else if (e.type === 'game') {
            const side = e.dir < 0 ? 'left_select' : 'right_select';
            this.win.inst.play(side, 'normal');
            this.win.inst.part('x_preview')?.play(side);
            this.win.inst.part('x_cursor_LR')?.play(side);
            previewWait = true;
            this.bindGame();
            this.win.setCursor(0, this.colOf(s.cursor));
          } else if (e.type === 'favorite') this.win.inst.part('x_heart_00')?.play(e.on ? 'on' : 'out', e.on ? 'normal' : 'off');
          else if (e.type === 'press') this.win.decide();
        }
      }
      this.win.out(false);
      while (this.win.isVisible()) yield;
      const values = s.commit();
      if (s.result === 'random') {
        cur = { ...values, id: s.id, resume: s.resume };
        continue;
      }
      return {
        result: s.result!,
        id: s.id,
        values,
        request: s.result === 'play' ? s.playRequest() : null,
        favoriteDirty: s.favoriteDirty,
      };
    }
  }

  private *waitOpen(): Flow {
    while (this.win.life.opening) yield;
  }

  update(): void {
    this.win.update();
  }

  draw(): void {
    this.win.draw();
  }
}
