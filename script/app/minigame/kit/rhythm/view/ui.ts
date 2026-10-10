/**
 * 리듬 공용 2D UI(화면 어댑터) — mg1801/view/ui.ts 에서 옮겼다(docs/engine/02_rhythm.md 14절). 게임은 이름과 와이프 레이아웃 이름만 넘긴다.
 * 레이아웃·글꼴은 게임 Assets 폴더 기준 'ui/ui.json' 이다(mg1801 = assets/mg1801/ui). 아래는 옮기기 전 설명 그대로다.
 *
 * mg1801 2D UI — 리듬 공용 UI(main ca::rm)를 원본 레이아웃으로 재생한다(view/lyt.ts). 에셋은 tools/mg1801_web_ui.py → assets/mg1801/ui.
 * 로케일은 koKR 고정(메시지). 비트맵 글꼴 = 공용 assets/font/ 원본 시트(ui.json fonts = {dir, chars}, docs/engine/font_assets.md).
 *
 * 판독한 원본 동작 [판독 main, 주소는 SwitchLoader 기본 베이스]:
 *   - 판정 텔롭 RmUiTelopMan::ShowTimingTelop @0x710043a800: 레이아웃 mg1800_tlp_fast/slow/just(형식 0 FAST·1 SLOW·2 JUST),
 *     글자 = rc00_tlp_timing01/02/00(표 @0x71019f1af8). 플레이어당 8칸 원형(+0x13F0 &7), 위치 = LytPosFrom3DPos(pos3d),
 *     "in" 재생. 살아 있는 이전 텔롭은 위치 그대로 z 만 −1, −2… 로 밀어 새 텔롭이 위에 온다.
 *   - START/FINISH: bq::ComUiMGTelop 형식 0/2 = sys_tlp_start_00 / sys_tlp_finish_00, 글자 mg_tl101 / mg_tl301.
 *     Start → "in", 끝나면 "normal", oneshot 시간(SetOneshot: START f32 0x3ed55555, FINISH 0x3fb55555 초)이 지나면 "out" →
 *     끝나면 숨김(FUN_7100211768·FUN_7100211acc, 분기 FUN_71002116d8).
 *   - PERFECT FUN_710043af00 → FUN_710043ad7c: 점수 == GetResultPlayerScoreMax 인 플레이어마다 camgcmm_tlp_perfect(글자 rc00_tlp_timing04),
 *     위치 = (그 플레이어 엔티티 x, 네 플레이어 엔티티 y 의 최소, z) 를 화면 투영. "in" 뒤 "idle" 반복, 속도 PlayRate(BPM/120).
 *     OnGameEndingBefore 에서 Out(FUN_710043b250) → "out".
 *   - 상태 UI = RmUiBarStatus(FUN_7100436758) 레이아웃 mg1800_score_00 (sys_mgstat_* 는 RmUiStatusMan 의 ComUiStatus 가 값 보관용으로만
 *     만들고 In 을 부르지 않아 보이지 않는다). 단계 5 끝(START 와 같은 때) 표시 "in" → 끝나면 페인 애니 x_gauge_gr_00/01 "gauge" 속도 0 →
 *     매 프레임 FUN_7100436bc8: 목표 = trunc(달성/총점·50)/50, 지금 프레임/최대 < 목표면 속도 1 로 진행, 아니면 목표 프레임에 놓고 멈춤.
 *     점수가 들어올 때마다(FUN_71004361c4) x_active_gr_00 "active". OnGameEndingBefore 에서 "out" → 끝나면 숨김(FUN_7100436860).
 *   - 흰 페이드: bq::WipeModule FadeOut/FadeIn(White) = 공용 wipe.bflyt "WipeWhite_out/_normal/_in"(20프레임). 애니·프레임은 로직 state.fade.
 *     상태 UI 표시·숨김과 PERFECT 숨김은 로직의 statusUi·perfectTelop 을 따른다(없으면 단계·phase 로 본다).
 *   - 와이프 RmUiCntWipe: 미니게임 모드(PlayMode 1)는 SyncedSetupGame 이 SetControlWipeDisp(false) 를 불러 ShowWipe 가 아무것도 하지 않는다.
 *     그래서 원본 단독 실행에서는 mg1801_wip_bg_00/01 이 보이지 않는다. ?rcwipe=1 일 때만 리듬 쿠킹 경로(DISP_TYPE 0)를 미리 본다:
 *     "in" → 단계 0 이 닫기를 요청하면 "idle"(PlayRate) → 4.0/PlayRate 초 뒤 "out" → 끝나면 숨김(FUN_7100431720).
 *   - 결과 점수판(FUN_7100448be0 이 만든 파이버, 시작 FUN_7100448610, 매 프레임 람다 @0x71004495f0 — 디스어셈블리로 읽음 [판독]):
 *     만들 때: mg1800_free_result_flash_00 하나·_flash_01 넷·mg1800_free_result_00(SetDrawPriority 1)을 숨겨 두고 x_text_00/01/02 =
 *     rc00_tlp_fp_result00/01/02(정수 0, ".", 소수 0).
 *     시작(승패 모션과 같은 프레임, 람다 @0x7100447d10 의 FUN_71004475d0 다음): +0x174 = GetResultStarAchieveRateFix(= trunc(달성률/20·10)/10·20,
 *     FUN_710042ca10 의 +0x664), result_00 표시. 순서 i(0~3)마다 pid = GetOrderToPlayerId(i), x_parts_face_0{i+1} 의 얼굴(UiControlStatusFace →
 *     face_128_pcNN^u, sys_face_01 의 x_face_pc128), flash_01[i] 위치 = 그 부품 페인 전역 위치, 목표 +0x188+4i =
 *     GetResultPlayerStarAchieveRateFix(pid)(= 점수 / (자르기 수·2)·100), 부품 애니 "in", x_text_00 = rc00_tlp_fp_result03("CPU"),
 *     x_text_cpu_gr_00 표시 = IsPlayerCom(pid), x_text_01 = rc00_tlp_stage_result_thum01(Number0 = 정수부, Number1 = 소수 첫째 자리).
 *     람다 상태 0: 부품 애니 "gauge" 속도 0·프레임 0, 목표/20 ≥ 0.1 이면 SQ_SE_MG1800_MGRES_CNT(Play2D), 상태 1. 상태 0·1: 타이머 += dt,
 *     0.5 초 전에는 표시값 += dt·200(목표에서 멈추고 그때 그 SE 정지), 0.5 초가 되면 표시값 = 목표·flash_01 넷 표시 "flash"·SE 정지,
 *     result_00 "in" 을 속도 0·프레임 0(null_00 알파 0), 상태 2. 매 프레임 얼굴 게이지 프레임 = 표시값, 글자 갱신.
 *     상태 2: 애니 슬롯이 있으면(FUN_71003b1540) 상태 3. 상태 3: 0.5 초 뒤 "min_max" 속도 0·프레임 0, SQ_SE_MG1800_STR_CNT, 상태 4.
 *     상태 4: +0x170 += dt·100, 목표(+0x174)에 닿으면 flash_00 표시 "flash"·STR_CNT 정지·SQ_SE_MG1800_STR_CNT_STP. "min_max" 프레임 = +0x170,
 *     x_text_00 = trunc(+0x170/20·10)/10 의 정수부, x_text_02 = 소수 첫째 자리. 3.0 초 뒤 끝(+0x48 = 1).
 *     시작 프레임은 로직 state.resultPanelFrame, 없으면 결과 모션이 승패(co_win/joy/lose00a)로 바뀐 프레임으로 본다.
 * 근사: 텔롭 z 밀기는 그리는 순서로만 낸다, PERFECT 의 3D 이펙트(mg_common_pt_eff)·SE(SQ_SE_MG1800_PERFECT, SQ_SE_MG_FINISH)는 여기서 내지 않는다,
 *   ShowTimingTelop 의 실수 인자(mg1801 0.0)는 시작 프레임으로 본다 [추정], START/FINISH 의 런타임 장식 텍스처 x_tlp_*_D(ctl1)는 없다,
 *   와이프 미리보기의 조작 그림(x_operate_00, FUN_7100433500)은 바꾸지 않는다. 레이아웃 사이 그리는 순서(SetDrawPriority 값)는 [추정].
 *   결과 점수판: 람다가 시작과 같은 프레임에 처음 돈다고 본다(±1), 순서 → pid 는 같은 번호, SE 위치(Play2D 의 페인 위치)는 쓰지 않고
 *   MGRES_CNT 정지는 라벨 단위라 마지막 플레이어가 목표에 닿을 때(또는 0.5 초) 한 번 멈춘다, flash 레이아웃은 result_00 위에 그린다 [추정],
 *   얼굴 재질(바탕 × 얼굴 투영 텍스처)은 두 텍스처 곱, 메시지 태그 [1:0:NNcd] = 변수 NN 의 정수.
 */
import * as THREE from 'three';
import { appTransition, CLOSED, CLOSING, OPEN, OPENING, Transition, WIPE_WHITE } from '@game/lib/transition';
import type { V3 } from '@game/core/fmath';
import { resolveSpecFonts } from '@app/common/ui/layout/fontSheet';
import { loadUiImage, type UiImage } from '@app/common/render3d/assetLoader';
import type { Assets } from '../../../../../view/assets';
import { envelopeSamples, envelopeWeb50, vibDefaults } from '@game/lib/vibration';
import type { PadSource, VibSegment } from '../../../../../view/input';
import { playVibration } from '../../../../../view/vibration';
import { LayoutInstance, type Lan, type Lyt, type LytFontAtlas, type LytTelopFont } from '@app/common/ui/layout/raw';
import { LytRenderer } from '@app/common/ui/layout/render';
import type { RmEvent, RmSceneState } from '../types';

/** 공용 UI 가 읽는 state(게임 state 가 넓힌다) */
export type RmUiState = RmSceneState;

/** 공용 UI 설정 — 게임마다 다른 것 */
export interface RmUiOptions {
  /** 경고 문구에 쓰는 이름(예 'mg1801') */
  name: string;
  /** RmUiCntWipe 레이아웃 [bg_01, bg_00] (mg1801 = mg1801_wip_bg_01, mg1801_wip_bg_00) */
  wipeLayouts: readonly [string, string];
}

interface VibData {
  bnvib: string;
  rateHz: number;
  ampLow: number[];
  ampHigh: number[];
  gainMaster: number;
  gainLow: number;
  gainHigh: number;
  priority: number;
}

/** 결과 점수판에 쓰는 메시지 라벨 [판독 FUN_7100448be0·FUN_7100448610·람다] */
const FP_RESULT = ['rc00_tlp_fp_result00', 'rc00_tlp_fp_result01', 'rc00_tlp_fp_result02'];
/** main GetDeltaTime 고정 f32(1/60) */
const DT = Math.fround(1 / 60);
const RESULT_WIN_MOTIONS = new Set(['co_win00a', 'co_joy00a', 'co_lose00a']);

/** 메시지 태그 [1:0:NNcd](insert.Number, 변수 NN)를 숫자로 */
const fmtMsg = (msg: string, vars: number[]): string => msg.replace(/\[1:0:([0-9a-f]{2})cd\]/g, (_, i: string) => String(vars[parseInt(i, 16)] ?? 0));

interface ResultPanel {
  result: LayoutInstance;
  flash00: LayoutInstance;
  flash01: LayoutInstance[];
  /** 람다 상태(+0x40), 타이머(+0x44) */
  state: number;
  timer: number;
  /** +0x170 / +0x174 별 게이지 지금·목표 */
  star: number;
  starTarget: number;
  /** +0x178.. 표시값, +0x188.. 목표, +0x218.. MGRES_CNT 재생 중 */
  disp: number[];
  target: number[];
  cnt: boolean[];
  /** +0x1b0 STR_CNT 재생 중 */
  strCnt: boolean;
  done: boolean;
}

interface UiJson {
  layouts: Record<string, Lyt>;
  anims: Record<string, Record<string, Lan>>;
  textures: Record<string, string>;
  fonts: Record<string, LytFontAtlas>;
  telopFont: LytTelopFont;
  texts: Record<string, string>;
  vib: Record<string, VibData>;
}

type Judge = 'FAST' | 'SLOW' | 'JUST';
/** RmUiTelopMan 생성자 표 순서(@0x7101aa5e88 레이아웃, @0x71019f1af8 글자) */
const TIMING: Record<Judge, { lyt: string; label: string }> = {
  FAST: { lyt: 'mg1800_tlp_fast', label: 'rc00_tlp_timing01' },
  SLOW: { lyt: 'mg1800_tlp_slow', label: 'rc00_tlp_timing02' },
  JUST: { lyt: 'mg1800_tlp_just', label: 'rc00_tlp_timing00' },
};
const SLOTS = 8;
/** ComUiMGTelop::SetOneshot 값(초): f32 0x3ed55555, 0x3fb55555 */
const ONESHOT = { START: 0.41666666, FINISH: 1.4166666 };
/** RmUiCntWipe 와이프 객체 +0x84 = 4.0 / PlayRate (초) [판독 FUN_7100434568] */
const WIPE_IDLE_SEC = 4.0;
/** 진동 포락선 구간(ms). 브라우저가 진폭을 연속으로 바꾸지 못해 구간 평균으로 나눈다 [근사] */
const VIB_STEP_MS = 50;

interface MgTelop {
  inst: LayoutInstance;
  /** ComUiMGTelop+0x3C: 0 대기, 1 in, 2 normal, 3 out, 4 끝 */
  state: number;
  timer: number;
  oneshot: number;
}

const lytPosFrom3D = (camera: THREE.Camera, p: V3): { x: number; y: number } => {
  const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
  return { x: (v.x * 1920) / 2, y: (v.y * 1080) / 2 };
};

export class RmUi {
  private data: UiJson | null = null;
  private lyt: LytRenderer | null = null;
  private readonly timing = new Map<string, LayoutInstance>();
  private readonly cursor = [0, 0, 0, 0];
  private seq = 0;
  private readonly mgTelop = new Map<'START' | 'FINISH', MgTelop>();
  private readonly perfect: ({ inst: LayoutInstance; state: number } | null)[] = [null, null, null, null];
  private score: LayoutInstance | null = null;
  /** RmUiBarStatus+0x40: 0 숨김, 1 in, 2 게이지, 3 out */
  private scoreState = 0;
  private scoreShown = false;
  /** RmUiBarStatus+0x4C(게이지에 반영한 달성값) */
  private gaugeShown = 0;
  private lastSum = 0;
  /** PERFECT 텔롭이 한 번이라도 켜졌는지(state.perfectTelop 끔 감지용) */
  private perfectOn = false;
  private readonly fade = new Transition();
  private fadeOn = false;
  private readonly wipe: LayoutInstance[] = [];
  private wipeState = -1;
  private wipeTimer = 0;
  private readonly rcWipe: boolean;
  /** 따라간 로직 프레임 */
  private frame = 0;
  private readonly queue: { e: RmEvent; frame: number }[] = [];
  /** 결과 점수판(FUN_7100448be0 파이버). 처음 시작할 때 만든다 */
  private panel: ResultPanel | null = null;
  /** 결과 점수판 소리(view/index.ts 가 SoundMap 으로 보낸다). stop = 그 라벨 정지 */
  onSound: ((label: string, stop: boolean) => void) | null = null;
  /** load() 가 끝나면 풀린다(시험용) */
  readonly ready: Promise<void>;

  constructor(
    private readonly assets: Assets,
    /** 원본 bex::util::LytPosFrom3DPos — 화면 카메라로 투영 */
    private readonly camera: () => THREE.Camera,
    private readonly opts: RmUiOptions,
  ) {
    this.rcWipe = typeof location !== 'undefined' && new URLSearchParams(location.search).get('rcwipe') === '1';
    this.ready = this.load().catch((e: unknown) => console.warn(`${opts.name} UI 를 읽지 못했다(글자 HUD 만 남는다)`, e));
  }

  get loaded(): boolean {
    return this.lyt !== null;
  }

  private async load(): Promise<void> {
    const d = await this.assets.json<UiJson>('ui/ui.json');
    const loadImg = (path: string): Promise<UiImage> => loadUiImage(this.assets.url(`ui/${path}`)).catch(() => Promise.reject(new Error(`UI 그림을 읽지 못했다: ${path}`)));
    const images = new Map<string, UiImage>();
    await Promise.all(Object.entries(d.textures).map(async ([name, file]) => images.set(name, await loadImg(file))));
    const fonts = new Map<string, { meta: LytFontAtlas }>();
    await resolveSpecFonts(d.fonts as Record<string, unknown>, (p) => this.assets.url(`ui/${p}`));
    for (const [fam, meta] of Object.entries(d.fonts)) fonts.set(fam, { meta });
    let telop: LytTelopFont | null = null;
    try {
      const buf = await this.assets.bytes(`ui/${d.telopFont.file}`);
      const face = new FontFace(d.telopFont.family, buf);
      await face.load();
      document.fonts.add(face);
      telop = d.telopFont;
    } catch (e) {
      console.warn('텔롭 폰트를 읽지 못했다', e);
    }
    this.data = d;
    this.lyt = new LytRenderer({ images, fonts, telop });
    for (const k of ['START', 'FINISH'] as const) {
      const inst = this.instance(k === 'START' ? 'sys_tlp_start_00' : 'sys_tlp_finish_00');
      inst.texts.set(k === 'START' ? 'x_tlp_start' : 'x_tlp_finish', d.texts[k === 'START' ? 'mg_tl101' : 'mg_tl301']);
      this.mgTelop.set(k, { inst, state: 0, timer: 0, oneshot: ONESHOT[k] });
    }
    this.score = this.instance('mg1800_score_00');
    if (this.rcWipe) {
      for (const n of this.opts.wipeLayouts) {
        const w = this.instance(n);
        w.visible = true;
        w.play('in');
        this.wipe.push(w);
      }
      const bg = this.wipe[1];
      /* RmGameWork+0x1C == 0(리듬 쿠킹 진행 아님): x_half_gr·x_full_gr 숨김 [판독 FUN_7100431d8c] */
      bg.setPaneVisible('x_half_gr', false);
      bg.setPaneVisible('x_full_gr', false);
      bg.texts.set('x_text_00', d.texts.rc00_wip_ui_title00);
      bg.texts.set('x_text_01', d.texts.rc00_wip_ui_title01);
      this.wipeState = 0;
    }
  }

  private instance(name: string): LayoutInstance {
    const d = this.data!;
    return new LayoutInstance(d.layouts[name], d.anims[name] ?? {}, (file) => (d.layouts[file] ? { lyt: d.layouts[file], anims: d.anims[file] ?? {} } : null));
  }

  /** 이벤트를 그 스텝 프레임과 함께 받아 둔다(그리기 때 프레임 순서대로 처리) */
  push(e: RmEvent, frame: number): void {
    if (e.k === 'telop' || e.k === 'perfect') this.queue.push({ e, frame });
  }

  /**
   * 로직 프레임까지 따라간다. 프레임마다 이미 돌던 애니를 1프레임 진행한 뒤, 그 프레임 이벤트로 새 애니를 0프레임에서 시작한다.
   * 단계·점수·상(phase) 변화는 그리는 때의 state 로 본다(한 그리기에 여러 스텝이면 마지막 값만 본다 [근사]).
   */
  sync(state: RmUiState): void {
    if (!this.data) {
      this.frame = state.frame;
      this.queue.length = 0;
      return;
    }
    const rate = state.bpm / 120;
    if (state.frame < this.frame) this.frame = state.frame;
    const panelStart = this.panelStartFrame(state);
    while (this.frame < state.frame) {
      this.frame++;
      this.advance(state, rate);
      while (this.queue.length && this.queue[0].frame <= this.frame) this.event(state, this.queue.shift()!.e, rate);
      if (panelStart !== null && panelStart <= this.frame && !this.panel) this.startPanel(state);
      if (this.panel) this.tickPanel();
    }
    for (const q of this.queue.splice(0)) this.event(state, q.e, rate);
    const hasStatus = state.statusUi !== undefined;
    if (state.perfect && state.perfectTelop !== false) state.perfect.forEach((p, i) => p && !this.perfect[i] && state.stage >= 8 && this.showPerfect(state, i, rate));
    /* 상태 UI: 로직이 statusUi(단계 5 켬, OnGameEnd 끔)를 주면 그대로, 없으면 단계 6 진입·ending 으로 본다 */
    if (hasStatus ? state.statusUi : state.stage >= 6 && state.phase === 'main') this.showScore();
    if (hasStatus ? this.scoreShown && !state.statusUi : state.phase === 'ending') this.hideScore();
    const sum = Math.max(0, Math.min(999, state.scores.reduce((a, b) => a + b, 0)));
    if (sum !== this.lastSum) {
      /* FUN_71004361c4: 점수 갱신마다 x_active_gr_00 "active" */
      if (this.score && this.scoreState !== 0) this.score.playPane('x_active_gr_00', 'active');
      this.lastSum = sum;
    }
    /* PERFECT Out(FUN_710043b250, OnGameEndingBefore): perfectTelop 이 꺼지면, 없으면 ending 으로 본다 */
    if (state.perfectTelop !== undefined ? this.perfectOn && !state.perfectTelop : state.phase === 'ending') this.hidePerfect(rate);
    if (state.perfectTelop) this.perfectOn = true;
    /* 흰 페이드(bq::WipeModule, 공용 wipe.bflyt): 로직이 애니·프레임을 준다 */
    const f = state.fade;
    if (f && (this.fadeOn || !appTransition().following)) {
      this.fade.set(f.anim === 'WipeWhite_in' ? OPENING : f.anim === 'WipeWhite_out' ? CLOSING : CLOSED, WIPE_WHITE, f.frame);
      if (!this.fadeOn) appTransition().follow(this.fade);
      this.fadeOn = true;
    } else if (this.fadeOn) {
      this.fade.set(OPEN, WIPE_WHITE, 0);
      appTransition().unfollow(this.fade);
      this.fadeOn = false;
    }
  }

  /** 결과 점수판 시작 프레임: 로직 state.resultPanelFrame, 없으면 결과 모션이 승패로 바뀐 프레임(모션 프레임 ÷ 속도만큼 앞) */
  private panelStartFrame(state: RmUiState): number | null {
    if (state.resultPanelFrame !== undefined) return state.resultPanelFrame;
    const rm = state.players[0]?.resultMotion;
    if (!rm || !RESULT_WIN_MOTIONS.has(rm.name)) return null;
    return state.frame - Math.round(rm.frame / (rm.speed || 1));
  }

  private setText(inst: LayoutInstance, pane: string, text: string): void {
    inst.texts.set(pane, text);
    inst.texts.set(`${pane}_shadow`, text);
  }

  private faceText(part: LayoutInstance, v: number): void {
    this.setText(part, 'x_text_01', fmtMsg(this.data!.texts.rc00_tlp_stage_result_thum01, [Math.trunc(v), Math.trunc((v - Math.trunc(v)) * 10)]));
  }

  /** FUN_7100448be0(만들기) + FUN_7100448610(시작) */
  private startPanel(state: RmUiState): void {
    const d = this.data!;
    const result = this.instance('mg1800_free_result_00');
    const flash00 = this.instance('mg1800_free_result_flash_00');
    const flash01 = [0, 1, 2, 3].map(() => this.instance('mg1800_free_result_flash_01'));
    /* 만들 때: x_text_00 = 정수 0, x_text_01 = ".", x_text_02 = 소수 0 */
    this.setText(result, 'x_text_00', fmtMsg(d.texts[FP_RESULT[0]], [0]));
    this.setText(result, 'x_text_01', d.texts[FP_RESULT[1]]);
    this.setText(result, 'x_text_02', fmtMsg(d.texts[FP_RESULT[2]], [0]));
    /* GetResultStarAchieveRateFix = FUN_710042ca10 의 +0x664: f = f32(달성률 / 1 경기) / 20, trunc(f·10)/10·20 */
    const f = Math.fround(Math.fround(state.rate) / 20);
    const starTarget = Math.fround((Math.trunc(f * 10) / 10) * 20);
    result.visible = true;
    const target: number[] = [];
    for (let i = 0; i < 4; i++) {
      const pid = i;
      const face = `x_parts_face_${String(i + 1).padStart(2, '0')}`;
      const part = result.part(face);
      const icon = result.part(`${face}/x_parts_face_00`);
      const tex = `face_128_${state.players[pid]?.char ?? 'pc01'}^u`;
      const mat = icon?.mats.get('x_face_pc128');
      if (mat && d.textures[tex]) mat.tex[1] = tex;
      const gp = result.paneGlobalPos(face);
      if (gp) flash01[i].pos = gp;
      /* GetResultPlayerStarAchieveRateFix: 점수 / (ExtA·ExtB + 자르기 수·2) · 100, mg1801 은 Ext 없음 */
      const den = (state.personal[pid] ?? 0) * 2;
      target.push(den > 0 ? Math.fround(Math.fround((state.scores[pid] ?? 0) / den) * 100) : 0);
      result.playPane(face, 'in');
      if (part) {
        this.setText(part, 'x_text_00', d.texts.rc00_tlp_fp_result03);
        part.setPaneVisible('x_text_cpu_gr_00', !!state.players[pid]?.isCom);
        this.faceText(part, target[i]);
      }
    }
    this.panel = { result, flash00, flash01, state: 0, timer: 0, star: 0, starTarget, disp: [0, 0, 0, 0], target, cnt: [false, false, false, false], strCnt: false, done: false };
  }

  private sound(label: string, stop = false): void {
    this.onSound?.(label, stop);
  }

  /** 람다 @0x71004495f0 한 번(프레임마다) */
  private tickPanel(): void {
    const p = this.panel!;
    if (p.done) return;
    const faces = [1, 2, 3, 4].map((n) => `x_parts_face_${String(n).padStart(2, '0')}`);
    let count = false;
    if (p.state === 0) {
      faces.forEach((face, i) => {
        p.result.playPane(face, 'gauge', 0);
        p.result.setPaneFrame(face, 0);
        if (Math.fround(p.target[i] / 20) >= Math.fround(0.1)) {
          this.sound('SQ_SE_MG1800_MGRES_CNT');
          p.cnt[i] = true;
        }
      });
      p.state = 1;
      p.timer = DT;
      if (p.timer < 0.5) count = true;
      else this.finishCount(p);
    } else if (p.state === 1) {
      p.timer = Math.fround(p.timer + DT);
      if (p.timer >= 0.5) this.finishCount(p);
      else count = true;
    } else if (p.state === 2) {
      /* FUN_71003b1540: result_00 의 애니 슬롯이 있으면 상태 3, 타이머 = dt */
      p.state = 3;
      p.timer = DT;
      if (p.timer >= 0.5) this.startStar(p);
    } else if (p.state === 3) {
      p.timer = Math.fround(p.timer + DT);
      if (p.timer >= 0.5) this.startStar(p);
    } else if (p.state === 4) this.tickStar(p);
    if (count) {
      /* 표시값 += dt·100·2, 목표를 넘으면 목표에 두고 MGRES_CNT 정지(라벨 단위라 모두 닿을 때 한 번) */
      const add = Math.fround(Math.fround(DT * 100) * 2);
      const playing = p.cnt.some((c) => c);
      p.disp.forEach((v, i) => {
        const n = Math.fround(v + add);
        p.disp[i] = n > p.target[i] ? p.target[i] : n;
        if (n > p.target[i]) p.cnt[i] = false;
      });
      if (playing && p.cnt.every((c) => !c)) this.sound('SQ_SE_MG1800_MGRES_CNT', true);
    }
    if (count || p.state === 2) this.updateFaces(p, faces);
  }

  /** 람다 0.5 초: 표시값 = 목표, flash_01 넷 "flash", 재생 중인 MGRES_CNT 정지, result_00 "in" 속도 0 프레임 0, 상태 2 */
  private finishCount(p: ResultPanel): void {
    p.disp = [...p.target];
    for (const f of p.flash01) {
      f.visible = true;
      f.play('flash');
    }
    if (p.cnt.some((c) => c)) this.sound('SQ_SE_MG1800_MGRES_CNT', true);
    p.cnt = [false, false, false, false];
    p.result.play('in', 0, 0);
    p.state = 2;
    p.timer = 0;
  }

  private updateFaces(p: ResultPanel, faces: string[]): void {
    faces.forEach((face, i) => {
      p.result.setPaneFrame(face, p.disp[i]);
      const part = p.result.part(face);
      if (part) this.faceText(part, p.disp[i]);
    });
  }

  /** 람다 상태 3 끝: "min_max" 속도 0 프레임 0, STR_CNT, 상태 4 — 같은 프레임에 상태 4 를 한 번 돈다 */
  private startStar(p: ResultPanel): void {
    p.result.play('min_max', 0, 0);
    this.sound('SQ_SE_MG1800_STR_CNT');
    p.strCnt = true;
    p.state = 4;
    p.timer = 0;
    this.tickStar(p);
  }

  private tickStar(p: ResultPanel): void {
    const n = Math.fround(p.star + Math.fround(DT * 100));
    p.star = n;
    if (n > p.starTarget) {
      p.star = p.starTarget;
      if (p.strCnt) {
        p.flash00.visible = true;
        p.flash00.play('flash');
        this.sound('SQ_SE_MG1800_STR_CNT', true);
        this.sound('SQ_SE_MG1800_STR_CNT_STP');
        p.strCnt = false;
      }
    }
    p.result.setFrame(p.star);
    /* x_text_00 = (int)(값/20·10) / 10, x_text_02 = 나머지 */
    const w = Math.trunc(Math.fround(Math.fround(p.star / 20) * 10));
    const whole = Math.trunc(w / 10);
    const d = this.data!;
    this.setText(p.result, 'x_text_00', fmtMsg(d.texts[FP_RESULT[0]], [whole]));
    this.setText(p.result, 'x_text_02', fmtMsg(d.texts[FP_RESULT[2]], [w - whole * 10]));
    p.timer = Math.fround(p.timer + DT);
    if (p.timer >= 3) p.done = true;
  }

  private hideScore(): void {
    if (!this.score || this.scoreState === 0 || this.scoreState === 3) return;
    /* FUN_71004360bc: "out" → 끝나면 숨김 */
    this.score.play('out');
    this.scoreState = 3;
  }

  private hidePerfect(rate: number): void {
    for (const p of this.perfect) {
      if (p && p.state !== 3 && p.state !== 0) {
        p.inst.play('out', rate);
        p.state = 3;
      }
    }
  }

  private event(state: RmUiState, e: RmEvent, rate: number): void {
    if (e.k === 'telop') {
      if (e.judge === 'START' || e.judge === 'FINISH') {
        this.startMgTelop(e.judge);
        /* 단계 5: START 텔롭과 같은 때 상태 UI 표시(FUN_7100436030). 로직이 statusUi 를 주면 그쪽을 따른다 */
        if (e.judge === 'START' && state.statusUi === undefined) this.showScore();
      } else if (e.player >= 0) this.showTiming(e.player, e.judge, e.pos);
    } else if (e.k === 'perfect') this.showPerfect(state, e.player, rate);
  }

  private advance(state: RmUiState, rate: number): void {
    for (const t of this.timing.values()) {
      if (!t.visible) continue;
      t.update(1);
      if (t.main?.ended) t.visible = false;
    }
    for (const m of this.mgTelop.values()) {
      if (m.state === 0 || m.state === 4) continue;
      m.inst.update(1);
      if (m.state === 1 && m.inst.main?.ended) {
        m.inst.play('normal');
        m.state = 2;
        m.timer = 0;
      } else if (m.state === 2) {
        m.timer += 1 / 60;
        if (m.oneshot <= m.timer) {
          m.inst.play('out');
          m.state = 3;
        }
      } else if (m.state === 3 && m.inst.main?.ended) {
        m.inst.visible = false;
        m.state = 4;
      }
    }
    for (const p of this.perfect) {
      if (!p || p.state === 0) continue;
      p.inst.update(1);
      if (p.state === 1 && p.inst.main?.ended) {
        p.inst.play('idle', rate);
        p.state = 2;
      } else if (p.state === 3 && p.inst.main?.ended) {
        p.inst.visible = false;
        p.state = 0;
      }
    }
    this.advanceScore(state);
    this.advanceWipe(state, rate);
    const pn = this.panel;
    if (pn) {
      pn.result.update(1);
      pn.flash00.update(1);
      for (const f of pn.flash01) f.update(1);
    }
  }

  private showScore(): void {
    if (!this.score || this.scoreShown) return;
    this.scoreShown = true;
    this.score.visible = true;
    this.score.play('in');
    this.scoreState = 1;
  }

  private advanceScore(state: RmUiState): void {
    const s = this.score;
    if (!s || this.scoreState === 0) return;
    s.update(1);
    if (this.scoreState === 1 && s.main?.ended) {
      s.playPane('x_gauge_gr_00', 'gauge', 0);
      s.playPane('x_gauge_gr_01', 'gauge', 0);
      this.scoreState = 2;
    } else if (this.scoreState === 2) this.gauge(state);
    else if (this.scoreState === 3 && s.main?.ended) {
      s.visible = false;
      this.scoreState = 0;
    }
  }

  /** FUN_7100436bc8 [판독] */
  private gauge(state: RmUiState): void {
    const s = this.score!;
    const total = state.totalPoint;
    const sum = Math.min(999, state.scores.reduce((a, b) => a + b, 0));
    const achieved = sum < 0 ? 0 : Math.min(sum, total);
    if (achieved <= this.gaugeShown || total <= 0) return;
    const target = Math.trunc((achieved / total) * 50) / 50;
    const g0 = s.paneAnims.get('x_gauge_gr_00')!;
    const g1 = s.paneAnims.get('x_gauge_gr_01')!;
    const max = g0.lan.frameSize;
    if (g0.frame / max < target) {
      g0.speed = 1;
      g1.speed = 1;
      return;
    }
    g0.frame = g1.frame = max * target;
    g0.speed = g1.speed = 0;
    this.gaugeShown = achieved;
  }

  private advanceWipe(state: RmUiState, rate: number): void {
    if (this.wipeState < 0 || this.wipeState > 3) return;
    for (const w of this.wipe) w.update(1);
    const [bg01, bg00] = this.wipe;
    if (this.wipeState === 0 && bg01.main?.ended) this.wipeState = 1;
    if (this.wipeState === 1 && state.stage >= 1) {
      /* 단계 0 → 1(GetBeatState(0)==1)에서 닫기 요청(와이프 객체 +0x81) */
      for (const w of this.wipe) w.play('idle', rate);
      this.wipeState = 2;
      this.wipeTimer = 1 / 60;
    } else if (this.wipeState === 2) {
      this.wipeTimer += 1 / 60;
      if (WIPE_IDLE_SEC / rate <= this.wipeTimer) {
        bg01.play('out', rate);
        bg00.play('out', rate);
        this.wipeState = 3;
      }
    } else if (this.wipeState === 3 && bg01.main?.ended) {
      for (const w of this.wipe) w.visible = false;
      this.wipeState = 4;
    }
  }

  private showTiming(player: number, judge: Judge, pos: V3): void {
    const t = TIMING[judge];
    const slot = this.cursor[player];
    const key = `${player}:${slot}:${judge}`;
    let inst = this.timing.get(key);
    if (!inst) {
      inst = this.instance(t.lyt);
      const text = this.data!.texts[t.label];
      inst.texts.set('x_text_00', text);
      inst.texts.set('x_text_00_shadow', text);
      this.timing.set(key, inst);
    }
    inst.visible = true;
    inst.pos = lytPosFrom3D(this.camera(), pos);
    inst.order = ++this.seq;
    inst.play('in', 1, 0);
    this.cursor[player] = (slot + 1) & (SLOTS - 1);
  }

  private startMgTelop(k: 'START' | 'FINISH'): void {
    const m = this.mgTelop.get(k);
    if (!m) return;
    m.inst.visible = true;
    m.inst.play('in');
    m.state = 1;
    m.timer = 0;
  }

  private showPerfect(state: RmUiState, player: number, rate: number): void {
    if (this.perfect[player]) return;
    const inst = this.instance('camgcmm_tlp_perfect');
    const text = this.data!.texts.rc00_tlp_timing04;
    inst.texts.set('x_text_00', text);
    inst.texts.set('x_text_00_shadow', text);
    const p = state.players[player]?.pos;
    if (!p) return;
    const minY = Math.min(...state.players.map((q) => q.pos.y));
    inst.pos = lytPosFrom3D(this.camera(), { x: p.x, y: minY, z: p.z });
    inst.visible = true;
    inst.play('in', rate);
    this.perfect[player] = { inst, state: 1 };
  }

  /** VB_ 트리거 → 원본 bnvib 진폭 포락선(Gain_Master·Gain_Low/High 곱, 1 로 자름)을 50 ms 구간으로 */
  vibrate(pad: PadSource | null | undefined, key: string): void {
    const v = this.data?.vib[key];
    if (!pad || !v) return;
    if (!pad.vibrate) {
      pad.rumble?.(Math.round((v.ampLow.length / v.rateHz) * 1000));
      return;
    }
    const segs: VibSegment[] =
      vibDefaults.rules.envelope === 'web50' ? envelopeWeb50(v, v.gainMaster, v.gainLow, v.gainHigh, VIB_STEP_MS) : envelopeSamples(v, v.gainMaster, v.gainLow, v.gainHigh);
    if (vibDefaults.rules.priority) playVibration(pad, v.priority, segs);
    else pad.vibrate(segs);
  }

  draw(ctx: CanvasRenderingContext2D, state: RmUiState): void {
    this.sync(state);
    const r = this.lyt;
    if (!r) return;
    r.begin();
    if (this.score) r.draw(this.score);
    for (const t of [...this.timing.values()].filter((x) => x.visible).sort((a, b) => a.order - b.order)) r.draw(t);
    for (const p of this.perfect) if (p) r.draw(p.inst);
    for (const m of this.mgTelop.values()) r.draw(m.inst);
    for (const w of this.wipe) r.draw(w);
    if (this.panel) {
      r.draw(this.panel.result);
      for (const f of this.panel.flash01) r.draw(f);
      r.draw(this.panel.flash00);
    }
    r.end(ctx);
  }

  dispose(): void {
    if (this.fadeOn) appTransition().unfollow(this.fade);
    this.fadeOn = false;
    this.lyt?.dispose();
  }
}

