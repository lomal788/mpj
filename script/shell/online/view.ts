/**
 * 그리기 — 흐름 사건(OEv)을 명세 레이아웃(assets/online/online.json + 공용 spec.json + mgm01/faces.json)에 옮긴다. 근거: docs/shell/online.md 7·9.3.
 * 그리기 순서 [설계]: 배경 → 판(만들기/찾기·방 종류·목록·정보·대전 상대·매칭) → 대기 텔롭·로딩 → 대화상자·숫자 입력 → 알림 → 안내.
 */
import { nodeMatrix } from '../charselect/render2d';
import type { LayoutInst } from '../charselect/scene2d';
import type { Mat3 } from '../mgmcommon/itemLayout';
import { alignPanes } from '../mgmcommon/alignment';
import { layoutDialogBox } from '../mgmcommon/dialogBox';
import { measure, parseMessage, plainText, RichTextPane } from '../mgmcommon/text';
import type { MgmDrawHost } from '../mgmcommon/window';
import { faceKey, type Lay, type OEv } from './panels';

export const LAYOUT: Record<Lay, string> = {
  bg: 'mn00_friend_bg_00',
  netMenu: 'mn00_friend_base_set_00',
  roomType: 'mn00_friend_base_num_00',
  list: 'mn00_room_search_00',
  info: 'mn00_room_info_00',
  lobby: 'mn00_base_lobby_00',
  mbg: 'matching00_bg_00',
  mtlp: 'matching00_tlp_00',
  member: 'matching00_base_member_00',
  opponent: 'mn01_base_opponent_00',
  loading: 'sys_tlp_loading_00',
  timer: 'sys_timer_00',
  dialog: 'sys_dialog_00',
  keypad: 'sys_dialog_00',
};
const ORDER: Lay[] = ['bg', 'mbg', 'netMenu', 'roomType', 'list', 'opponent', 'member', 'mtlp', 'timer', 'info', 'lobby', 'loading', 'dialog', 'keypad'];
/** ComUiGuide00 위치 0x11 = 17(오른쪽 아래), x_alignment_right gap 40 [데이터 sys_guide_03 ali1] */
const GUIDE_POS = 17;
const GUIDE_GAP = 40;
/** 대기 텔롭 정렬(mn00_tlp_lobby_00 ali1: 수평 가운데, gap 32·32·30 [데이터]) */
const LOBBY_ALIGN: [string, number][] = [
  ['A_alignment_00', 32],
  ['A_alignment_01', 32],
  ['A_alignment_02', 30],
];
/** 알림 보이는 시간 [설계] */
const NOTICE_SEC = 2;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 나눈 창 조각(이름 '창#…')을 같은 부모의 다른 자식보다 먼저 그린다 — ui2d 는 창(내용·테두리) 다음 자식을 그린다.
 *  변환물은 조각이 자식 끝에 붙어 sys_dialog_00 의 글자·선택지를 덮었다(헤드리스 확인) [설계 보정] */
function frameFirst(inst: LayoutInst): void {
  for (const n of inst.nodes) {
    if (n.children.length < 2) continue;
    const isPiece = (i: number): boolean => inst.nodes[i].spec.n.includes('#');
    n.children = [...n.children.filter(isPiece), ...n.children.filter((i) => !isPiece(i))];
  }
  for (const p of inst.parts.values()) frameFirst(p);
}

export class OnlineView {
  readonly inst: Record<Lay, LayoutInst>;
  private readonly guide: LayoutInst;
  private readonly guideBase: Mat3;
  private guideShown = false;
  private readonly noticeRoot: LayoutInst;
  private readonly notice: LayoutInst;
  private noticeT = -1;
  private readonly winMembers: LayoutInst[] = [];
  memberCount = 0;
  private lobbyDirty = false;
  /** 마지막으로 쓴 문구 원문(크기 계산용) */
  private readonly raw = new Map<string, { raw: string; ins?: Record<string, string | number> }>();
  /** 여러 줄·색 글자(RichTextPane, mgm_common.md 9.6 과 같은 규칙) — 레이아웃 → 경로 → 부품 */
  private readonly rich = new Map<Lay, Map<string, RichTextPane>>();
  readonly log: OEv[] = [];
  readonly notices: string[] = [];

  constructor(
    private readonly host: MgmDrawHost,
    private readonly onSe?: (label: string) => void,
    private readonly onNote?: (text: string) => void,
  ) {
    this.inst = Object.fromEntries(ORDER.map((l) => [l, host.layout(LAYOUT[l])])) as Record<Lay, LayoutInst>;
    for (const l of ORDER) {
      this.inst[l].visible = false;
      frameFirst(this.inst[l]);
    }
    this.guide = host.layout('sys_guide_03');
    this.guide.visible = false;
    for (const a of ['left', 'center']) this.guide.setVisible(`x_alignment_${a}`, false);
    const posM = nodeMatrix(host.layout('sys_guide_pos_01'), `x_pos_${pad2(GUIDE_POS)}`);
    this.guideBase = [1, 0, posM ? posM[2] : 0, 0, 1, posM ? posM[5] : 0];
    this.noticeRoot = host.layout('sys_notice_00');
    this.notice = host.layout('sys_notice_01');
    this.notice.visible = false;
    for (let i = 0; i < 8; i++) {
      const w = host.layout('matching00_win_member_00');
      for (const p of ['x_icon_buster', 'x_parts_skill', 'x_parts_rank']) w.setVisible(p, false);
      this.winMembers.push(w);
    }
  }

  private text(label: string, ins?: Record<string, string | number>): string {
    const texts = this.host.spec.texts;
    return plainText(texts[label] ?? label, texts, ins ?? {});
  }

  /** 이 경로의 애니가 끝났는가(재생 없음·반복 애니도 끝으로 본다) */
  done(l: Lay, path: string): boolean {
    const root = this.inst[l];
    const i = path === '' ? root : root.part(path);
    if (!i) return true;
    const cur = i.current;
    return i.done || (!!cur && !!i.spec.anims[cur]?.loop);
  }

  /** 수평 가운데 정렬, 글자 페인 폭 = 글자 폭 [근사: ui2d 글자 측정 미확정, ui2d_alignment.md 11절 2] */
  private alignCenter(inst: LayoutInst, path: string, gap: number): void {
    const f = inst.find(path);
    if (!f) return;
    const [li, ni] = f;
    const kids = li.nodes[ni].children.map((ci) => li.nodes[ci]).filter((k) => k.v);
    const ext = kids.map((k) => {
      const ts = k.spec.txt;
      if (ts) {
        const s = li.texts.get(li.byName.get(k.spec.n) ?? -1) ?? '';
        return measure(this.host.spec.fonts[ts.font], ts.fs, ts.cs, s) * Math.abs(k.s[0]);
      }
      return k.z[0] * Math.abs(k.s[0]);
    });
    let x = -(ext.reduce((a, b) => a + b, 0) + gap * Math.max(0, kids.length - 1)) / 2;
    kids.forEach((k, i) => {
      k.t[0] = x + ((1 + k.spec.o[0]) * ext[i]) / 2;
      x += ext[i] + gap;
    });
  }

  private realignLobby(): void {
    const tlp = this.inst.lobby.part('x_parts_tlp');
    if (tlp) for (const [p, g] of LOBBY_ALIGN) this.alignCenter(tlp, p, g);
  }

  push(e: OEv): void {
    this.log.push(e);
    if (this.log.length > 600) this.log.shift();
    if ((e.t === 'text' || e.t === 'vis') && e.l === 'lobby') this.lobbyDirty = true;
    switch (e.t) {
      case 'show':
        this.inst[e.l].visible = e.v;
        break;
      case 'play': {
        const i = e.path === '' ? this.inst[e.l] : this.inst[e.l].part(e.path);
        i?.play(e.tag, e.next);
        break;
      }
      case 'vis':
        this.inst[e.l].setVisible(e.path, e.v);
        break;
      case 'text': {
        const texts = this.host.spec.texts;
        const raw = (texts[e.label] ?? e.label) + (e.suffix ?? '');
        this.setText(e.l, e.path, raw, e.ins);
        const sh = `${e.path}_shadow`;
        if (this.inst[e.l].find(sh)) this.setText(e.l, sh, raw, e.ins);
        break;
      }
      case 'raw': {
        if (e.path.startsWith('#digit:')) {
          const f = this.inst[e.l].find(e.path.slice(7));
          if (f) {
            const v = (Number(e.s) || 0) * 0.1;
            f[0].nodes[f[1]].uv = [0, v, 1, v, 0, v + 0.1, 1, v + 0.1];
          }
        } else this.inst[e.l].setText(e.path, e.s);
        break;
      }
      case 'face':
        this.inst[e.l].setTexture(e.path, 1, faceKey(e.chara));
        break;
      case 'place': {
        const f = this.inst[e.l].find(e.path);
        if (f) f[0].nodes[f[1]].t[0] = e.x;
        break;
      }
      case 'se':
        this.onSe?.(e.label);
        break;
      case 'notice': {
        const s = this.text(e.label, e.ins);
        this.notices.push(s);
        this.showNotice(e.label, s);
        break;
      }
      case 'dialogLayout':
        this.layoutDialog(e.l, e.n);
        break;
      case 'guide':
        this.setGuide(e.labels);
        break;
      case 'note':
        this.onNote?.(e.text);
        break;
      default:
        break;
    }
  }

  /** 알림 [판독 FUN_7100252860·FUN_710025366c·FUN_71002537b0, online.md 9.3 정정]: 참가 알림 = x_text_00, 그 밖 = x_text_01, x_pict 는 GotReward 만 보임 → 정렬(수평·왼쪽·gap 0) → in → SQ_SE_SYS_NOTICE */
  private showNotice(label: string, s: string): void {
    const join = label === 'sys_notice_joinSession';
    const reward = label === 'sys_notice_gotReward';
    const n = this.notice;
    n.setText(join ? 'x_text_00' : 'x_text_01', s);
    n.setVisible('x_text_00', join);
    n.setVisible('x_text_01', !join);
    n.setVisible('x_pict', reward);
    alignPanes(n, 'A_alignment_00', { horizontal: true, kind: 0, gap: 0, stretch: false });
    n.visible = true;
    n.play('in', 'normal');
    this.noticeT = 0;
    this.onSe?.('SQ_SE_SYS_NOTICE');
  }

  /** 글자 페인의 지금 문구 폭·높이(여러 줄 = 최대 폭, 줄 수 × 글자 높이 + 줄 간격) */
  private textBounds(l: Lay, path: string): [number, number] {
    const inst = this.inst[l];
    const f = inst.find(path);
    const ts = f?.[0].nodes[f[1]].spec.txt;
    if (!f || !ts) return [0, 0];
    const raw = this.raw.get(`${l}:${path}`);
    const s = raw ? plainText(raw.raw, this.host.spec.texts, raw.ins ?? {}) : (f[0].texts.get(f[1]) ?? '');
    const lines = s.split('\n');
    const font = this.host.spec.fonts[ts.font];
    const w = Math.max(0, ...lines.map((x) => measure(font, ts.fs, ts.cs, x)));
    const ls = this.host.spec.lineSpace[LAYOUT[l]]?.[path.split('/').pop() ?? ''] ?? 0;
    return [w, lines.length * ts.fs[1] + (lines.length - 1) * ls];
  }

  /** bq::ComUiDialogBox 크기 [판독 FUN_7100208240 @0x7100208240, online.md 9.3 정정 1~7] → 공용 layoutDialogBox(dialog_box.md 9.1) */
  private layoutDialog(l: Lay, n: number): void {
    const inst = this.inst[l];
    layoutDialogBox(inst, n, (path) => this.textBounds(l, path));
    const xt = inst.find('x_text');
    if (xt) {
      const r = this.rich.get(l)?.get('x_text');
      if (r) {
        const raw = this.raw.get(`${l}:x_text`);
        if (raw) r.set(parseMessage(raw.raw, this.host.spec.texts, raw.ins ?? {}));
      }
    }
  }

  /** 줄바꿈·색이 있으면 RichTextPane, 아니면 페인 글자 */
  private setText(l: Lay, path: string, raw: string, ins?: Record<string, string | number>): void {
    this.raw.set(`${l}:${path}`, { raw, ins });
    const texts = this.host.spec.texts;
    const rt = parseMessage(raw, texts, ins ?? {});
    const multi = rt.units.some((u) => u.ch === '\n' || u.color);
    let m = this.rich.get(l);
    if (!m) this.rich.set(l, (m = new Map()));
    let rp = m.get(path);
    if (multi) {
      if (!rp) {
        rp = new RichTextPane(this.host.all, this.inst[l], path, this.host.spec.lineSpace[LAYOUT[l]]?.[path.split('/').pop() ?? ''] ?? 0, !path.endsWith('_shadow'));
        m.set(path, rp);
      }
      rp.set(rt);
      this.inst[l].setText(path, '');
    } else {
      if (rp) {
        rp.set(null);
        m.delete(path);
      }
      this.inst[l].setText(path, plainText(raw, texts, ins ?? {}));
    }
  }

  /** ComUiGuide00 여러 칸: 오른쪽 정렬, 칸 폭 = 글자 폭, 간격 40 [근사: 칸 폭 규칙 미확정] */
  private setGuide(labels: string[] | null): void {
    if (!labels) {
      if (this.guideShown) this.guide.play('out');
      this.guideShown = false;
      return;
    }
    const n = Math.min(4, labels.length);
    const ws: number[] = [];
    for (let i = 0; i < 4; i++) {
      const g = `sys_guide_right_${pad2(i)}`;
      this.guide.setVisible(g, i < n);
      if (i >= n) continue;
      const s = this.text(labels[i]);
      this.guide.setText(`${g}/x_text`, s);
      this.guide.setText(`${g}/x_text_shadow`, s);
      const tf = this.guide.find(`${g}/x_text`);
      const ts = tf?.[0].nodes[tf[1]].spec.txt;
      ws.push(ts ? measure(this.host.spec.fonts[ts.font], ts.fs, ts.cs, s) : 0);
    }
    let x = -(ws.reduce((a, b) => a + b, 0) + GUIDE_GAP * (n - 1));
    for (let i = 0; i < n; i++) {
      const f = this.guide.find(`sys_guide_right_${pad2(i)}`);
      if (f) f[0].nodes[f[1]].t[0] = x + ws[i] / 2;
      x += ws[i] + GUIDE_GAP;
    }
    this.guide.visible = true;
    if (!this.guideShown) this.guide.play('in', 'normal');
    this.guideShown = true;
  }

  setMembers(names: { name: string; chara: number }[]): void {
    this.memberCount = names.length;
    names.slice(0, 8).forEach((m, i) => {
      const w = this.winMembers[i];
      for (const t of ['x_text_00', 'x_text_01']) w.setText(`x_parts_username/${t}`, m.name);
      w.setTexture('x_parts_face/x_face_pc128', 1, faceKey(m.chara));
    });
  }

  update(dt: number): void {
    for (const l of ORDER) this.inst[l].update(1);
    if (this.lobbyDirty) {
      this.lobbyDirty = false;
      this.realignLobby();
    }
    this.guide.update(1);
    if (!this.guideShown && this.guide.current === 'out' && this.guide.done) this.guide.visible = false;
    for (const w of this.winMembers) w.update(1);
    if (this.noticeT >= 0) {
      this.noticeT += dt;
      this.notice.update(1);
      if (this.noticeT >= NOTICE_SEC && this.notice.current !== 'out') this.notice.play('out');
      if (this.notice.current === 'out' && this.notice.done) {
        this.notice.visible = false;
        this.noticeT = -1;
      }
    }
  }

  draw(slot: (i: number) => string): void {
    for (const l of ORDER) {
      const inst = this.inst[l];
      if (!inst.visible) continue;
      this.host.draw(inst);
      for (const rp of this.rich.get(l)?.values() ?? []) rp.draw(this.host.r2d);
      if (l === 'member') {
        for (let i = 0; i < Math.min(8, this.memberCount); i++) {
          const m = nodeMatrix(inst, slot(i)) as Mat3 | null;
          if (m) this.host.draw(this.winMembers[i], m);
        }
      }
    }
    if (this.notice.visible) {
      const m = nodeMatrix(this.noticeRoot, 'x_notice_00') as Mat3 | null;
      this.host.draw(this.notice, m ?? undefined);
    }
    if (this.guide.visible) this.host.draw(this.guide, this.guideBase);
  }
}
