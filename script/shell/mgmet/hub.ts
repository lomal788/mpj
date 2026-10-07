/**
 * 미니게임 항구 허브 mgmet::Scene — 상태 +0x330(0~10)·선택 ID +0x338·다음 모드 +0x328·나가기 +0x32c 와 파이버 흐름
 * (MinigameModeFlow·SeqUpdate·InitSelectMode·InitFromMgm01·StartEventFlow·ModeSelectStart/CameraMove/CameraIdle·ModeStartFlow·FreeplayMainFlow·
 * FirstHowToPlayFlow·HowToPlayFlow·Mgm01SetRuleFlow·FreeplayAfterFlow·FreeplayReturnFlow). 근거: docs/shell/mgmet_flow.md 3~8·9.1, mgmet_ruleconfig.md 3·8.
 * 3D(섬·NPC·카메라)는 MgmetSignals 신호로만 받는다(기본 즉시 [설계]). 한 틱 = 입력 → 흐름 → UI 갱신(mgm_common.md 9.6).
 */
import { MODE_FLAG, playedCount, type MgmSave, type MgmWork, type SceneRouter } from '../mgmcommon/contracts';
import { FiberRunner, waitTime, waitUntil, waitFrames, type Flow } from '../mgmcommon/fiber';
import type { MgmetGuides } from '../mgmcommon/guides';
import type { MgmInput, MgmPlayer } from '../mgmcommon/input';
import { MESSSAGE_WINDOW_OFFSET, type MessageFlow } from '../mgmcommon/messageFlow';
import type { MessageWindow } from '../mgmcommon/messageWindow';
import type { MgmSound } from '../mgmcommon/sound';
import type { MgmDrawHost } from '../mgmcommon/window';
import { ActivityTitle } from './activityTitle';
import { Fade, FadeLayer } from './fade';
import { FreePlayInfo } from './freePlayInfo';
import { commitFreePlay, freePlayConfig, type FreePlayCommit } from './ruleConfig';
import { RuleConfigView } from './ruleConfigView';
import {
  ACTIVITIES,
  ACTIVITY_MAX,
  adjustStartPoint,
  BIT,
  BOSS_ID,
  EXIT_CONFIRM,
  FREEPLAY_ID,
  GREETING_AGAIN,
  GREETING_FIRST,
  HUB_NAME,
  idFromStartPoint,
  inputVec,
  SE,
} from './tables';
import { IMMEDIATE_SIGNALS, type MgmetHowto, type MgmetSignals } from './types';

export type MgmetResult =
  | { kind: 'mgm01'; nextMode: number; rule: FreePlayCommit }
  | { kind: 'exit' }
  | { kind: 'activity'; id: number; nextMode: number }
  | { kind: 'rule'; update: 1 | 3; rule: FreePlayCommit };

export interface MgmetHubOptions {
  host: MgmDrawHost;
  input: MgmInput;
  sound: MgmSound;
  msg: MessageWindow;
  flow: MessageFlow;
  guides: MgmetGuides;
  save: MgmSave;
  work: MgmWork;
  players: () => readonly MgmPlayer[];
  howto?: MgmetHowto;
  signals?: MgmetSignals;
  router?: SceneRouter;
  /** sync 보스 개방(+0x3b1) */
  bossOpen?: boolean;
  /** 조작자 닉네임(빈 문자열 = 손님) */
  nickname?: string;
  /** 플레이 수를 셀 미니게임 ID(MGList::IsAvailable 집합) */
  availableIds?: Iterable<number>;
  /** 'hub' = 항구 전체, 'rule' = 프리 플레이 규칙 설정만(Mgm01SetRuleFlow) */
  entry?: 'hub' | 'rule';
  /** PlayerWork ComLevel 적용 */
  setComLevel?: (level: number) => void;
  onDone?: (r: MgmetResult) => void;
}

const DT = Math.fround(1 / 60);

export class MgmetHub {
  readonly title: ActivityTitle;
  readonly rule: RuleConfigView;
  readonly info: FreePlayInfo;
  readonly fade = new Fade();
  private readonly fadeLayer: FadeLayer;
  private readonly fibers = new FiberRunner();
  private readonly sig: MgmetSignals;
  /** +0x330 */
  seq = -1;
  /** +0x338 */
  selected = -1;
  /** +0x328 */
  nextMode = -1;
  /** +0x32c */
  exitRequested = false;
  /** +0x334 */
  restore = false;
  /** +0x335 */
  opSkip = false;
  /** +0x33c */
  pendingGuide = false;
  /** 앞 안내를 다 보인 ID(시험·디버그용) */
  guideId = -1;
  /** +0x340: −1 일반, 0 ID 증가(왼쪽), 1 ID 감소(오른쪽) */
  dirField = -1;
  bossOpen: boolean;
  firstHowtoSeen: boolean;
  phase = '';
  result: MgmetResult | null = null;
  readonly log: string[] = [];
  awakeCount = 0;

  constructor(private readonly o: MgmetHubOptions) {
    this.sig = o.signals ?? IMMEDIATE_SIGNALS;
    this.bossOpen = o.bossOpen ?? true;
    this.title = new ActivityTitle(o.host, o.sound);
    this.rule = new RuleConfigView(o.host, o.sound, () => o.input.operator);
    this.info = new FreePlayInfo(o.host);
    this.fadeLayer = new FadeLayer(o.host);
    this.firstHowtoSeen = !!(o.save.modeFlags & MODE_FLAG.FIRST_HOWTO_MGM01);
    this.fibers.start(o.entry === 'rule' ? this.ruleOnly() : this.main(), (r) => this.finish(r));
  }

  private note(s: string): void {
    this.log.push(s);
    if (this.log.length > 200) this.log.shift();
  }

  private finish(r: MgmetResult): void {
    this.result = r;
    this.phase = '끝';
    this.o.onDone?.(r);
  }

  private comCount(): number {
    return this.o.players().filter((p) => p.type === 1).length;
  }

  private setupInfo(): void {
    const ids = this.o.availableIds ?? Array.from({ length: 152 }, (_, i) => i);
    this.info.setup(this.o.nickname ?? '', playedCount(this.o.save, ids));
  }

  /** MgmetSetupOpSkipFlag: 지금 방문은 기존 값, 기존 0 이면 save OR 1 + SaveRequest */
  private setupSyncBefore(): void {
    this.opSkip = !!(this.o.save.modeFlags & MODE_FLAG.OP_SKIP);
    if (!this.opSkip) {
      this.o.save.modeFlags |= MODE_FLAG.OP_SKIP;
      this.o.save.requestSave();
    }
    this.firstHowtoSeen = !!(this.o.save.modeFlags & MODE_FLAG.FIRST_HOWTO_MGM01);
    this.setupInfo();
  }

  /** MinigameModeFlow mgmet @0x7100049ed0 */
  private *main(): Flow<MgmetResult> {
    this.setupSyncBefore();
    this.seq = 0;
    for (;;) {
      const r = yield* this.seqUpdate();
      if (r) return r;
      if (this.nextMode !== -1) {
        this.o.router?.call('mgm01', { nextMode: this.nextMode });
        return { kind: 'mgm01', nextMode: this.nextMode, rule: this.lastCommit! };
      }
      if (this.exitRequested) {
        this.o.router?.ret();
        return { kind: 'exit' };
      }
      yield;
    }
  }

  private lastCommit: FreePlayCommit | null = null;

  private *seqUpdate(): Flow<MgmetResult | null> {
    switch (this.seq) {
      case 0:
        this.initialize();
        return null;
      case 1:
        yield* this.enterEventFlow();
        return null;
      case 4:
        yield* this.startEventFlow();
        return null;
      case 5:
        yield* this.modeSelectStart();
        return null;
      case 6:
        this.phase = '카메라 전환(상태 6)';
        yield* waitUntil(() => this.sig.selectionCameraIdle());
        this.seq = 7;
        return null;
      case 7:
        yield* this.modeSelectCameraIdle();
        return null;
      case 8:
        return yield* this.modeStartFlow();
      case 10:
        yield* this.freeplayReturnFlow();
        return null;
      default:
        return null;
    }
  }

  /** Initialize mgmet @0x710004a164 + GetAndResetStartMode */
  private initialize(): void {
    const w = this.o.work;
    const sp = adjustStartPoint(w.entranceStartPoint, w.flags.has(0x3d), this.bossOpen);
    w.flags.delete(0x3d);
    w.entranceStartPoint = 0;
    this.selected = FREEPLAY_ID;
    this.note(`시작 지점 ${sp}`);
    if (sp === 7) {
      this.selected = FREEPLAY_ID;
      this.seq = 10;
    } else if (sp >= 1 && sp <= 6) {
      this.selected = idFromStartPoint(sp);
      this.seq = 5;
    } else {
      this.o.sound.playBgm(0);
      this.seq = 1;
    }
  }

  /** EnterEventFlow — 오프닝 3D 연출은 신호 하나로 대체 [설계] */
  private *enterEventFlow(): Flow {
    this.phase = '오프닝(3D 생략)';
    yield* waitUntil(() => this.sig.openingDone());
    this.seq = 4;
  }

  /** StartEventFlow mgmet @0x710004cd60: 첫/재방문 인사 → 줌 → ID 2, 상태 5 */
  private *startEventFlow(): Flow {
    this.phase = '인사';
    this.o.sound.playBgm(1);
    this.o.msg.setManualClose(false);
    this.o.msg.disableNextKeyWait(false);
    this.o.flow.prepare(this.opSkip ? GREETING_AGAIN : GREETING_FIRST, undefined, undefined, { Text0: HUB_NAME });
    yield* this.o.flow.flow(0);
    yield* waitUntil(() => this.sig.zoomDone());
    this.selected = FREEPLAY_ID;
    this.seq = 5;
  }

  /** ModeSelectStart mgmet @0x710004d270 (+ InitMGMWork) */
  private *modeSelectStart(): Flow {
    this.phase = '선택 준비(상태 5)';
    const w = this.o.work;
    w.round = 0;
    for (const f of [0x3c, 6, 1]) w.flags.delete(f);
    this.dirField = -1;
    if (this.restore) {
      yield* waitUntil(() => this.sig.coinBattleEventDone());
      this.restore = false;
      this.fade.fadeIn(1.0);
    }
    this.seq = 6;
  }

  /** ShowGuideMessageFrontOfMode mgmet @0x7100059e40 */
  private *showGuide(id: number): Flow {
    const m = this.o.msg;
    m.setManualClose(true);
    this.o.flow.prepare(ACTIVITIES[id].guide);
    m.setFlagForceAllDraw(true);
    m.disableNextKeyWait(true);
    this.o.flow.open();
    yield* waitUntil(() => m.isAllTalkEnd());
  }

  /** HideGuideMessageFrontOfMode: Out 요청만 */
  private hideGuide(): void {
    if (!this.o.msg.isEnd()) this.o.msg.out();
  }

  private leftAllowed(): boolean {
    return this.selected < ACTIVITY_MAX && (this.selected !== BOSS_ID || this.bossOpen);
  }

  /** ModeSelectCameraIdle mgmet @0x710004d6d0 */
  private *modeSelectCameraIdle(): Flow {
    this.phase = '액티비티 선택(상태 7)';
    const t = this.title;
    t.setTitleText(this.selected);
    if (this.dirField === 0) t.inLeftArrow();
    else if (this.dirField === 1) t.inRightArrow();
    else t.inTitle();
    t.win.inst.visible = true;
    t.setVisibleLeft(this.leftAllowed());
    t.setVisibleRight(this.selected > 0);
    this.o.guides.back.in();
    this.pendingGuide = true;
    for (;;) {
      if (this.pendingGuide && this.sig.npcReady()) {
        yield* this.showGuide(this.selected);
        this.pendingGuide = false;
        this.guideId = this.selected;
        if (!this.o.sound.isPlayBgm()) this.o.sound.playBgm(2);
      }
      const trig = this.o.input.trig();
      const v = inputVec(trig, 0);
      if (v === 3 || trig & BIT.LR_LEFT) {
        if (this.leftAllowed()) {
          this.move(1);
          return;
        }
      } else if (v === 4 || trig & BIT.LR_RIGHT) {
        if (this.selected > 0) {
          this.move(-1);
          return;
        }
      } else if (trig & BIT.B) {
        this.o.sound.playSe(SE.CANCEL);
        const yes = yield* this.confirmReturnSceneFlow();
        if (yes) {
          this.exitRequested = true;
          this.seq = -1;
          return;
        }
        this.pendingGuide = true;
        return;
      } else if (trig & BIT.A) {
        this.o.sound.playSe(SE.DECI);
        this.o.sound.vibrate(this.o.input.operator, 'VB_MGMET_SELECT_DECI');
        t.enter();
        this.o.guides.back.out();
        this.hideGuide();
        this.guideId = -1;
        this.note(`결정 ID ${this.selected}`);
        this.seq = 8;
        return;
      }
      yield;
    }
  }

  /** 좌우 이동(6.1): 화살표 SE → 진동 → 카메라 → ID → 안내 닫기 → 방향 → 반대쪽 Out → Back Out → 상태 6 */
  private move(d: 1 | -1): void {
    const t = this.title;
    if (d === 1) t.playLeftArrowSE();
    else t.playRightArrowSE();
    this.o.sound.vibrate(this.o.input.operator, 'VB_MGMET_SELECT_CUR');
    this.selected += d;
    this.guideId = -1;
    this.hideGuide();
    this.dirField = d === 1 ? 0 : 1;
    if (d === 1) t.outRightArrow();
    else t.outLeftArrow();
    this.o.guides.back.out();
    this.note(`이동 ID ${this.selected}`);
    this.seq = 6;
  }

  /** ConfirmReturnSceneFlow mgmet @0x7100059fa0: 메시지 창 선택지 2지(예 DECI_L / 아니요 CANCEL), 기본 1, B 취소 → 결과 0 만 true (dialog_box.md 6.3) */
  private *confirmReturnSceneFlow(): Flow<boolean> {
    this.o.guides.back.out();
    this.title.actOut();
    const m = this.o.msg;
    m.out();
    this.guideId = -1;
    yield* waitUntil(() => m.isEnd());
    m.disablePadInput(false, false);
    m.disableNextKeyWait(false);
    m.setOffset([MESSSAGE_WINDOW_OFFSET[0], MESSSAGE_WINDOW_OFFSET[1], MESSSAGE_WINDOW_OFFSET[2]]);
    m.setOwner(this.o.input.operator);
    m.setChoiceCount(2);
    m.setMessageLabel(EXIT_CONFIRM.label);
    m.setInsert('Text0', HUB_NAME);
    m.setChoiceLabel(0, EXIT_CONFIRM.yes);
    m.setChoiceDeciSe(0, SE.DECI_L);
    m.setChoiceDeciVib(0, 'bv_vib_sys_deci_l');
    m.setChoiceLabel(1, EXIT_CONFIRM.no);
    m.setChoiceDeciSe(1, SE.CANCEL);
    m.setChoiceDeciVib(1, 'bv_vib_sys_deci');
    m.setCancelEnable(true);
    m.setInitialChoice(1);
    m.start();
    this.phase = '나가기 확인';
    yield* waitUntil(() => m.isEnd());
    const r = m.choiceResult();
    this.note(`나가기 확인 결과 ${r}`);
    return r === 0;
  }

  /** ModeStartFlow mgmet @0x710004dfd8 */
  private *modeStartFlow(): Flow<MgmetResult | null> {
    if (this.selected === FREEPLAY_ID) {
      yield* this.freeplayMainFlow();
      return null;
    }
    const a = ACTIVITIES[this.selected];
    yield* waitUntil(() => this.sig.modeZoomDone());
    this.seq = -1;
    return { kind: 'activity', id: a.id, nextMode: a.nextMode };
  }

  /** FreeplayMainFlow mgmet @0x710005ddd0 */
  private *freeplayMainFlow(): Flow {
    this.phase = '프리 플레이 준비';
    yield* waitUntil(() => this.sig.modeZoomDone());
    this.title.actIn();
    yield* this.firstHowToPlayFlow(1);
    this.info.in();
    this.o.guides.in(0);
    const r = yield* this.mgm01SetRuleFlow();
    this.info.out();
    this.o.guides.out(0);
    this.title.actOut();
    yield* this.freeplayAfterFlow(r);
  }

  /** FirstHowToPlayFlow mgmet @0x710005a75c: flag 8 이면 0, 아니면 Setup(kind, true) → Update → Destroy → 저장 → 1 */
  private *firstHowToPlayFlow(kind: number): Flow<number> {
    if (this.firstHowtoSeen) return 0;
    const h = this.o.howto;
    this.phase = '첫 설명';
    if (h) {
      h.setup(kind, true);
      yield* h.update();
      h.destroy();
    } else this.note('HowtoPlay 없음 — 첫 설명 생략 [설계]');
    this.saveFirstHowto();
    return 1;
  }

  /** SaveFirstHowtoPlayViewMgm01: save OR 8 + SaveRequest, sync+4 = 1 */
  private saveFirstHowto(): void {
    this.o.save.modeFlags |= MODE_FLAG.FIRST_HOWTO_MGM01;
    this.o.save.requestSave();
    this.firstHowtoSeen = true;
    this.note('첫 설명 저장(flag 8)');
  }

  /** HowToPlayFlow mgmet @0x710005a47c: Setup(kind, false), 결과 bit0 && flag 없음 → 저장 */
  private *howToPlayFlow(kind: number): Flow {
    const h = this.o.howto;
    if (!h) {
      this.note('HowtoPlay 없음 — 설명 다시 보기 생략 [설계]');
      return;
    }
    h.setup(kind, false);
    const r = yield* h.update();
    h.destroy();
    if (r & 1 && !this.firstHowtoSeen) this.saveFirstHowto();
  }

  /** Mgm01SetRuleFlow mgmet @0x710005e090: Update 1 → 결과 1, 3 → 결과 2, 2 → 설명 후 다시 In */
  private *mgm01SetRuleFlow(): Flow<number> {
    this.phase = '규칙 설정';
    const rule = this.rule;
    rule.setupMgm(freePlayConfig(this.o.work, this.comCount()));
    rule.in();
    for (;;) {
      const u = rule.update(this.o.input.trig(), this.o.input.rep());
      if (u === 2) {
        rule.out();
        this.info.out();
        this.o.guides.out(0);
        this.phase = '설명 다시 보기';
        yield* this.howToPlayFlow(1);
        this.phase = '규칙 설정';
        rule.in();
        this.info.in();
        this.o.guides.in(0);
      } else if (u === 1 || u === 3) {
        rule.out();
        const res = rule.getResult();
        this.lastCommit = commitFreePlay(res, this.o.work, this.o.setComLevel);
        this.note(`규칙 결과 ${u} CPU ${res.indexCpu} 설명 ${res.indexExplain}`);
        this.lastUpdate = u;
        return u === 1 ? 1 : 2;
      }
      yield;
    }
  }

  private lastUpdate: 1 | 3 = 3;

  /** FreeplayAfterFlow mgmet @0x710005df20 */
  private *freeplayAfterFlow(r: number): Flow {
    if (r === 1) {
      this.phase = '출발';
      yield* waitTime(1.0, () => DT);
      yield* waitUntil(() => this.sig.departureDone());
      this.o.sound.stopBgm(2);
      this.awakeCount++;
      this.o.save.requestSave();
      this.nextMode = ACTIVITIES[this.selected].nextMode;
      this.seq = -1;
      return;
    }
    this.phase = '취소 → 항구';
    this.fade.fadeOut(1.0);
    yield* waitUntil(() => this.fade.isFinishedFadeOut());
    this.title.hide();
    this.selected = FREEPLAY_ID;
    this.restore = true;
    this.seq = 5;
  }

  /** FreeplayReturnFlow mgmet @0x710005e250: 0.3 s → 플레이어 idle && NPC 준비 → 상태 5 */
  private *freeplayReturnFlow(): Flow {
    this.phase = 'mgm01 복귀';
    yield* waitTime(0.3, () => DT);
    yield* waitUntil(() => this.sig.allPlayersIdle() && this.sig.npcReady());
    this.selected = FREEPLAY_ID;
    this.seq = 5;
  }

  /** 규칙 화면만(시험 페이지): 정보·안내 In → Mgm01SetRuleFlow → Out [설계] */
  private *ruleOnly(): Flow<MgmetResult> {
    this.setupSyncBefore();
    this.title.setTitleText(FREEPLAY_ID);
    this.title.win.inst.visible = true;
    this.title.actIn();
    this.info.in();
    this.o.guides.in(0);
    yield* this.mgm01SetRuleFlow();
    this.info.out();
    this.o.guides.out(0);
    this.title.actOut();
    yield* waitFrames(12);
    return { kind: 'rule', update: this.lastUpdate, rule: this.lastCommit! };
  }

  get running(): boolean {
    return this.result === null;
  }

  /** 한 틱: 입력 → 흐름 → UI */
  step(): void {
    this.o.input.update();
    this.fibers.step();
    this.o.msg.update(DT);
    this.o.howto?.tick();
    this.title.tick();
    this.rule.tick();
    this.info.tick();
    this.o.guides.update();
    this.fade.update(DT);
  }

  draw(): void {
    this.info.draw();
    this.rule.draw();
    this.title.draw();
    this.o.howto?.draw();
    this.o.guides.draw();
    this.o.msg.draw();
    this.fadeLayer.draw(this.fade.level);
  }
}
