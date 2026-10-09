/**
 * 승패 표·잠금 안내·플레이 방법 단독 화면 상태 시험 (docs/shell/mgm01_freeplay.md 6.2·6.4·6.6·7, mgmet_flow.md 7.2).
 *   npx tsx tools/test_mgmscreens.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MgResultEntry } from '@app/common/ui/contracts';
import { ANNOUNCE_HOLD, ANNOUNCE_LABEL, AnnounceState } from '@app/scene/minigame/mgm01/announce';
import { HISTORY_ROWS, HistoryState, earliestFromRing, historyFromRing, writeRing } from '@app/scene/minigame/mgm01/historyView';
import { HOWTO_KINDS, HOWTO_PANE_TEXT } from '@app/scene/world/mgmet/tables';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (c) pass++;
  else {
    fail++;
    console.log('실패', m);
  }
};

const ring = (n: number, mk: (r: number) => MgResultEntry): (MgResultEntry | null)[] => {
  const a: (MgResultEntry | null)[] = new Array(100).fill(null);
  for (let r = 1; r <= n; r++) writeRing(a, r, mk(r));
  return a;
};

// 승패 표: 고리·가장 오래된 것부터·스크롤·점수
{
  const a = ring(12, (r) => ({ id: r, judge: 1, results: [r % 2 ? 1 : 0, 0, 2, 255] }));
  const s = new HistoryState(historyFromRing(a, 12));
  ok(s.src.count === 12 && s.scroll === 4 && s.maxScroll === 4, '12판: 처음 스크롤 = count−8');
  ok(s.rows().length === HISTORY_ROWS && s.rows()[0].entry?.id === 5, '처음 보이는 첫 열 = 5번째 판');
  ok(s.scores()[0] === 6 && s.scores()[1] === 0 && s.scores()[2] === 0 && s.scores()[3] === 0, '점수 = raw byte == (judge≠0), 2·255 는 승 아님');
  s.input(0, 0x100);
  ok(s.scroll === 3, '왼쪽 반복 = −1');
  s.input(0, 0x100 | 0x200);
  ok(s.scroll === 3, '동시 입력은 exact 비교라 무시');
  s.input(0, 0x40000);
  s.input(0, 0x40000);
  ok(s.scroll === 4, '스틱 오른쪽 +1, 끝에서 멈춤');
  s.drain();
  s.input(0x2, 0);
  const ev = s.drain();
  ok(s.closed && ev.some((e) => e.type === 'se' && e.label === 'SQ_SE_MGM01_CANCEL') && ev.some((e) => e.type === 'close'), 'B = CANCEL + 닫기');
  ok(s.scrollbar.visible && Math.abs(s.scrollbar.pos - 1) < 1e-6, '스크롤바 위치 = scroll/(count−8)');
}
{
  const a = ring(130, (r) => ({ id: r, judge: 0, results: [0, 1, 0, 0] }));
  ok(earliestFromRing(a, 130, 0)?.id === 31, '130판: 가장 오래된 것 = 31번째 판(고리 100)');
  const s = new HistoryState(historyFromRing(a, 130));
  ok(s.src.count === 100 && s.scores()[0] === 100 && s.scores()[1] === 0, 'judge 0 이면 byte 0 이 승');
  const e = new HistoryState(historyFromRing(ring(0, () => ({ id: 0, judge: 0, results: [0, 0, 0, 0] })), 0));
  ok(e.src.count === 0 && !e.scrollbar.visible && e.rows().every((r) => !r.entry), '기록 없음');
}

// 잠금 안내: in 완료 → normal → 0.75 s(f32 누적) → out, trig > 1 = skip
{
  const st = new AnnounceState();
  ok(!st.play(0) && !st.active, 'reason 0 = 안내 없음');
  ok(st.play(1) && st.phase === 'in', 'reason 1 = in');
  st.step(1 / 60, true);
  ok(st.phase === 'normal', 'in 끝 → normal');
  let n = 0;
  const dt = Math.fround(1 / 60);
  while (st.phase === 'normal' && n < 200) {
    st.step(dt, true);
    n++;
  }
  let acc = 0;
  let m = 0;
  while (acc < Math.fround(ANNOUNCE_HOLD)) {
    acc = Math.fround(acc + dt);
    m++;
  }
  ok(st.phase === 'out' && n === m, `0.75 s = ${m} 틱`);
  st.step(dt, true);
  ok(st.phase === 'idle', 'out 끝 → idle');
  st.play(2);
  st.step(dt, true);
  st.input(1);
  st.step(dt, true);
  ok(st.phase === 'normal', 'A(trig 1)는 skip 아님');
  st.input(2);
  st.step(dt, true);
  ok(st.phase === 'out', 'B(trig 2) = skip');
}

// 쓰는 라벨이 명세에 있는가
{
  const spec = JSON.parse(readFileSync(join(WEB, 'assets/mgmcommon/spec.json'), 'utf8')) as { texts: Record<string, string> };
  const extra = JSON.parse(readFileSync(join(WEB, 'assets/mgmet/extra.json'), 'utf8')) as { textures: Record<string, string> };
  const m01 = JSON.parse(readFileSync(join(WEB, 'assets/mgmcommon/mgm01.json'), 'utf8')) as { layouts: Record<string, unknown> };
  const faces = JSON.parse(readFileSync(join(WEB, 'assets/mgm01/faces.json'), 'utf8')) as { textures: Record<string, string> };
  for (const l of ['mgm01_ui_mgTable00', 'mgm01_ui_mgTable01', 'mgm01_ui_countWin', ...ANNOUNCE_LABEL.filter((x): x is string => !!x)]) ok(l in spec.texts, `문구 ${l}`);
  for (const l of ['mgm01_history_00', 'mgm01_history_01', 'mgm01_history_02', 'mgm01_history_title_00', 'mgm01_mes_announce_00']) ok(l in m01.layouts, `레이아웃 ${l}`);
  ok(['pc01', 'pc02', 'pc03', 'pc04'].every((pc) => `face_128_${pc}^u` in faces.textures), '얼굴 텍스처');
  const free = HOWTO_KINDS[0];
  for (let p = 0; p < free.pages; p++) {
    ok(`${free.message}${String(p).padStart(2, '0')}` in spec.texts, `플레이 방법 문구 p${p}`);
    ok(`${free.pict}_${String(p).padStart(2, '0')}^o` in extra.textures, `플레이 방법 그림 p${p}`);
  }
  for (const [, [, label]] of Object.entries(HOWTO_PANE_TEXT)) ok(label in spec.texts, `정보 페인 문구 ${label}`);
}

console.log(`\n합계: ${pass} 통과, ${fail} 실패`);
if (fail) process.exit(1);
