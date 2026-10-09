/**
 * 플레이 방법 mgmet::HowtoPlay(Setup·Update(UpdateManual)·Destroy) — 설명 그림 창 mgmet_act_img_00 + 메시지 창 (docs/shell/mgmet_flow.md 4.3·6.2·7.2).
 * 페이지 = 메시지 라벨 하나 + 그림 x_img_00 칸 1(mgmet_pict_*_NN^o) + 페이지별 정보 페인. A = 메시지 창 넘김(MES_PROC).
 * [설계] 페이지 이동 규칙의 세부(UpdateManual 지역 변수)는 문서에 없어: 페이지들을 한 메시지 묶음으로 열고 현재 페이지 번호로 그림을 바꾼다.
 *   다시 보기(first = false)에서 페이지 0 의 넘김 대기 중 B = CANCEL·종료(반환 0), 마지막 페이지 A 로 끝나면 반환 1(types.ts MgmetHowto [추정]).
 *   이전 페이지로 돌아가기는 없다.
 */
import type { Flow } from '../../../../shell/mgmcommon/fiber';
import { PAD, type MgmInput } from '../../../../shell/mgmcommon/input';
import { MessageWindow } from '../../../../shell/mgmcommon/messageWindow';
import type { MgmSound } from '../../../../shell/mgmcommon/sound';
import type { MgmView } from '../../../../shell/mgmcommon/view';
import { MgmWindow } from '../../../../shell/mgmcommon/window';
import { HOWTO_INFO_PANES, HOWTO_PANE_TEXT, howtoKind, type HowtoKind } from './tables';
import type { MgmetHowto } from './types';

export class MgmetHowtoView implements MgmetHowto {
  private img: MgmWindow | null = null;
  private msg: MessageWindow | null = null;
  private kind: HowtoKind = howtoKind(1);
  private first = true;
  page = -1;

  constructor(
    private readonly view: MgmView,
    private readonly input: MgmInput,
    private readonly sound: MgmSound,
  ) {}

  setup(kind: number, first: boolean): void {
    this.kind = howtoKind(kind);
    this.first = first;
    this.page = -1;
    this.img = new MgmWindow(this.view, 'mgmet_act_img_00');
    for (const [pane, [textPane, label]] of Object.entries(HOWTO_PANE_TEXT)) {
      this.img.setText(textPane, label);
      this.img.inst.setVisible(pane, false);
    }
    this.msg = new MessageWindow(this.view, this.input, this.sound);
  }

  private showPage(p: number): void {
    const img = this.img!;
    this.page = p;
    img.inst.setTexture('x_img_00', 1, `${this.kind.pict}_${String(p).padStart(2, '0')}^o`);
    for (const pane of HOWTO_INFO_PANES) img.inst.setVisible(pane, this.kind.panes[p] === pane);
  }

  *update(): Flow<number> {
    const img = this.img!;
    const msg = this.msg!;
    const labels = Array.from({ length: this.kind.pages }, (_, i) => `${this.kind.message}${String(i).padStart(2, '0')}`);
    this.showPage(0);
    img.in(false);
    msg.setMessageLabel(labels[0]);
    for (const l of labels.slice(1)) msg.addMessageLabel(l);
    const op = this.input.operator;
    msg.setOwner(op);
    msg.setTalkSkip(op);
    msg.disablePadInput(false, false);
    msg.start();
    let result = 1;
    for (;;) {
      yield;
      const no = msg.currentMessageNo();
      if (no !== this.page && no >= 0 && no < this.kind.pages) this.showPage(no);
      if (!this.first && this.page === 0 && msg.isNextInputWait() && this.input.trig() === PAD.B) {
        this.sound.playSe('SQ_SE_SYS_CANCEL');
        msg.out();
        result = 0;
        break;
      }
      if (msg.isAllTalkEnd()) break;
    }
    while (!msg.isEnd()) yield;
    img.out(false);
    while (img.isVisible()) yield;
    return result;
  }

  destroy(): void {
    this.img = null;
    this.msg = null;
    this.page = -1;
  }

  tick(): void {
    this.img?.update();
    this.msg?.update(Math.fround(1 / 60));
  }

  draw(): void {
    this.img?.draw();
    this.msg?.draw();
  }
}
