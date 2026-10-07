/**
 * 메시지 흐름 — bq::MinigameModeScene InitializeMessage·PrepareMessage·OpenMessage·OpenAutoMessage·MessageFlow·ContinueMessageFlow·
 * AutoMessageFlow·ContinueAutoMessageFlow·WaitEnd(FUN_7100361170)·DisableMessagePadInput·FinalizeMessage (docs/shell/mgm_common.md 5.3).
 * 파이버 Wait = 제너레이터 yield(fiber.ts).
 */
import { waitTime, type Flow } from './fiber';
import type { MessageWindowAdapter } from './messageWindow';

/** MESSSAGE_WINDOW_OFFSET(원본 철자) = (0,0,0) → 메시지 속성 OffsetX/Y 사용(4.3) */
export const MESSSAGE_WINDOW_OFFSET: readonly [number, number, number] = [0, 0, 0];
export const AUTO_PAGE_SEC = 3.0;

export interface MessageFlowContext {
  /** bq::mgm::GetOperationPlayerId(false) */
  operator(): number;
  /** GetDeltaTime */
  dt(): number;
}

export class MessageFlow {
  win: MessageWindowAdapter | null = null;
  /** Scene +0x108: −1 = 만듦, 0 = 문구 준비됨 */
  prepared = -1;

  constructor(
    private readonly make: () => MessageWindowAdapter,
    private readonly ctx: MessageFlowContext,
  ) {}

  private w(): MessageWindowAdapter {
    if (!this.win) throw new Error('mgmcommon: InitializeMessage 전에 메시지 흐름을 불렀다');
    return this.win;
  }

  /** InitializeMessage: 엔티티 "MessageWindow" + DisablePadInput(1, 0) */
  initialize(): void {
    this.win = this.make();
    this.win.disablePadInput(true, false);
    this.prepared = -1;
  }

  /** PrepareMessage(label, choice0, choice1). 라벨 배열 = 여러 페이지(AddMessageLabel) [설계] */
  prepare(label: string | readonly string[], choice0?: string, choice1?: string, inserts?: Record<string, string | number>): void {
    const w = this.w();
    const list = typeof label === 'string' ? [label] : label;
    w.setMessageLabel(list[0]);
    if (inserts) for (const [k, v] of Object.entries(inserts)) w.setInsert(k, v);
    for (const l of list.slice(1)) w.addMessageLabel(l);
    if (choice0 && choice1) w.setChoices?.(choice0, choice1);
    this.prepared = 0;
  }

  /** OpenMessage: owner = talkSkip = 조작 플레이어, 패드 입력 켬 */
  open(offset: readonly [number, number, number] = MESSSAGE_WINDOW_OFFSET): void {
    const w = this.w();
    const op = this.ctx.operator();
    w.setOwner(op);
    w.setTalkSkip(op);
    w.disablePadInput(false, false);
    w.setOffset([offset[0], offset[1], offset[2]]);
    w.start();
  }

  /** OpenAutoMessage: owner = talkSkip = −1, 패드 입력 막음 */
  openAuto(offset: readonly [number, number, number] = MESSSAGE_WINDOW_OFFSET): void {
    const w = this.w();
    w.setOwner(-1);
    w.setTalkSkip(-1);
    w.disablePadInput(true, false);
    w.setOffset([offset[0], offset[1], offset[2]]);
    w.start();
  }

  /** MessageFlow(n): n ≥ 0 → ContinueMessageFlow(n) 뒤 0, n < 0 → WaitEnd() */
  *flow(n: number): Flow<number> {
    this.open(MESSSAGE_WINDOW_OFFSET);
    if (n >= 0) {
      yield* this.continueFlow(n);
      return 0;
    }
    return yield* this.waitEnd();
  }

  /** ContinueMessageFlow(n): n ≥ 1 이면 바뀐 횟수 n+1(= 페이지 n 표시)에서 돌아온다(창은 열린 채) */
  *continueFlow(n: number): Flow<number> {
    const w = this.w();
    if (w.isOut()) return -1;
    yield;
    let changes = 0;
    for (;;) {
      while (w.isNextInputWait()) {
        w.setOwner(this.ctx.operator());
        yield;
      }
      const no = w.currentMessageNo();
      while (w.currentMessageNo() === no) {
        w.setOwner(this.ctx.operator());
        yield;
      }
      changes++;
      if (n >= 1 && changes === n + 1) return w.currentMessageNo();
      if (w.isAllTalkEnd()) break;
    }
    return yield* this.waitEnd();
  }

  /** AutoMessageFlow(n) */
  *autoFlow(n: number): Flow<number> {
    this.openAuto(MESSSAGE_WINDOW_OFFSET);
    yield;
    return yield* this.continueAuto(n);
  }

  /** ContinueAutoMessageFlow(n): 페이지 글자가 다 나오면 3.0 s 뒤 RequestNextMessage(0) */
  *continueAuto(n: number): Flow<number> {
    const w = this.w();
    let req = 0;
    for (;;) {
      while (!w.isNextInputWait()) yield;
      yield* waitTime(AUTO_PAGE_SEC, () => this.ctx.dt());
      w.requestNext(false);
      const no = w.currentMessageNo();
      while (w.currentMessageNo() === no) yield;
      req++;
      if (n >= 1 && req === n) return w.currentMessageNo();
      if (w.isAllTalkEnd()) break;
    }
    return yield* this.waitEnd();
  }

  /** FUN_7100361170: IsEnd 까지 기다린 뒤 GetChoiceResult */
  *waitEnd(): Flow<number> {
    const w = this.w();
    while (!w.isEnd()) yield;
    return w.choiceResult();
  }

  disablePadInput(a: boolean, b: boolean): void {
    this.w().disablePadInput(a, b);
  }

  finalize(): void {
    this.win = null;
  }
}
