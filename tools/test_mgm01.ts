/**
 * 프리 플레이(mgm01) 개별 설정·필터 상태 시험 — script/shell/mgm01 의 순수 상태(catalog·listFilter·settingView)와
 * 실제 명세(assets/mgmcommon + assets/mgm01/catalog.json)로 만든 설정 화면·필터 화면 흐름을 노드에서 돈다(WebGL 없음).
 * 기대값 근거: docs/shell/mgm01_freeplay.md 6.1·6.2·6.4·6.5·8.3·9절(판독한 규칙의 재구현 시험, 원본 실행 대조 아님).
 *
 *   npx tsx tools/test_mgm01.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Render2D } from '../script/shell/charselect/render2d';
import { LayoutInst } from '../script/shell/charselect/scene2d';
import type { Spec } from '../script/shell/charselect/types';
import { FiberRunner, mergeSpec, MgmSound, type MgmDrawHost, type MgmSpec, type MgmSpecPart } from '../script/shell/mgmcommon';
import {
  FILTER,
  filterNextIndex,
  FilterScreen,
  isComLevelAdjustable,
  ListFilterState,
  listType,
  Mgm01Catalog,
  positionOrder,
  recordView,
  SETTING_ITEM,
  SettingScreen,
  SettingState,
  teamIdsByPosition,
  teamTableIndex,
  TEAM_TABLE,
  type LockEnv,
  type Mgm01CatalogJson,
  type Mgm01Player,
  type SettingDeps,
  type SettingOutcome,
} from '../script/shell/mgm01';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
let count = 0;
function ok(cond: boolean, msg: string): void {
  count++;
  if (!cond) {
    fails++;
    console.log('  실패:', msg);
  }
}
function eq<T>(a: T, b: T, msg: string): void {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}

const json = JSON.parse(readFileSync(join(WEB, 'assets/mgm01/catalog.json'), 'utf8')) as Mgm01CatalogJson;
const spec = JSON.parse(readFileSync(join(WEB, 'assets/mgmcommon/spec.json'), 'utf8')) as MgmSpec;
const cat = new Mgm01Catalog(json);
const players = (types: (0 | 1)[]): Mgm01Player[] => types.map((type, pid) => ({ pid, type }));
const byRule = (rule: string): number[] => cat.games.filter((g) => g.rule === rule).map((g) => g.id);

console.log('1. 목록 데이터: 게임 112·필터 14·순서·ID·라벨 (6.1·6.5)');
{
  eq(cat.games.length, 112, '게임 수');
  eq(cat.filters.length, 14, '필터 수');
  eq(
    cat.filters.map((f) => f.name),
    ['MgAll', 'Mg4vs', 'Mg1vs3', 'Mg2vs2', 'MgDuel', 'MgItem', 'MgChallenge', 'MgBoss', 'MgGyro', 'MgEndless', 'MgAthlon', 'MgBusters', 'MgRhythm', 'MgFavorite'],
    '필터 표시 순서 = SortIdx',
  );
  eq(
    cat.filters.map((f) => f.enumNo),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    '필터 enum = 표 6.1',
  );
  const counts = [112, 29, 12, 12, 5, 5, 10, 5, 15, 5, 14, 10, 10];
  for (let e = 0; e < 13; e++) {
    const l = cat.filterList(e);
    eq(l.length, counts[e], `필터 ${e} 수`);
    const cols = l.map((id) => cat.game(id)!.genre[e]);
    eq(cols, [...cols].sort((a, b) => a - b), `필터 ${e} 열 값 오름차순`);
    eq(new Set(cols).size, cols.length, `필터 ${e} 열 값 유일`);
  }
  eq(cat.filterList(FILTER.MgFavorite).length, 0, '즐겨찾기 없음 = 0');
  eq(new Set(cat.games.map((g) => g.id)).size, 112, 'ID 유일');
  ok(cat.games.every((g) => g.id >= 0 && g.id < 152), 'ID < 152');
  eq([4, 5, 9, 11, 21].map((id) => json.mgList[id].endless), [1, 1, 1, 1, 1], '모드 ID {4,5,9,11,21} = MGList Endless');
  eq(json.mgList.filter((m) => m.endless).map((m) => m.id), [4, 5, 9, 11, 21], 'Endless 전부 = 모드 ID');
  eq(byRule('Rhythm').sort((a, b) => a - b), [107, 108, 109, 110, 111, 112, 113, 114, 115, 116], '리듬 ID 0x6B~0x74 (02_rhythm.md)');
  eq(json.mgList.filter((m) => /^pp0/.test(m.name)).map((m) => m.id), [117, 118, 119, 120], 'PataPata 0x75~0x78 (minigame_result.md)');
  for (const r of json.records) {
    const id = json.mgList.find((m) => m.name === r.name)!.id;
    const k = cat.game(id)?.recordKind ?? -1;
    const expect = r.mode === 1 ? 3 : r.format === 0 ? (k === 0 ? 0 : 4) : r.format === 1 ? 2 : 1;
    eq(k, expect, `기록 kind ↔ gamerecord ${r.name}`);
  }
  const labels = new Set<string>([
    ...cat.filters.map((f) => f.label),
    ...cat.games.map((g) => g.nameLabel),
    'mgm01_ui_mgNameFp',
    'mgm01_ui_playButton',
    'mgm01_ui_vs',
    'mgm01_ui_cpu',
    'mgm01_ui_player01',
    'mgm01_ui_player04',
    'mgm01_ui_rule_CpuSetting00',
    'mgm01_ui_rule_CpuSetting01',
    'mgm01_ui_rule_EndlessSetting02',
    'mgm01_ui_rule_RhythmSetting01',
    'mgm01_pt_highscore00',
    'mgm01_ui_playCount00',
    'mgm01_pt_playCount01',
    'mgm01_ui_highscore01',
    'mgm01_ui_highscore02',
    'mgm01_ui_highscore03',
    'mgm01_ui_highscore04',
    'mgm01_mw_favoriteNone',
    'mgm01_ctrl_mgChoiceFp00',
    'mgm01_ctrl_mgChoiceFp01',
    'im_comLevel00',
    'im_comLevel03',
  ]);
  const missing = [...labels].filter((l) => spec.texts[l] === undefined);
  eq(missing, [], '쓰는 라벨 전부 공용 명세 texts 에 있음');
  for (const s of Object.keys(json.sounds)) ok(/^SQ_SE_MGM01_/.test(s), `mgm01 SE ${s}`);
  eq([listType(112), listType(33), listType(32), listType(16), listType(15), listType(0)], [0, 0, 1, 1, 2, 2], '형식 경계 33/16');
  eq([filterNextIndex(0, -1), filterNextIndex(13, 1), filterNextIndex(5, 1)], [13, 0, 6], '필터 ±1 양수 modulo');
}

console.log('2. 잠금 조건 순서 (6.4)');
{
  const env = (o: Partial<LockEnv> = {}): LockEnv => ({ bossOpen: false, playCount: () => 0, connected: false, players: players([0, 1, 1, 1]), ...o });
  const boss = cat.gameByName('mg1703')!.id;
  eq(cat.lockReason(boss, env()), 0, '보스 SetLock·미개방·0회 = 0');
  eq(cat.lockReason(boss, env({ bossOpen: true })), -1, '보스 개방 = -1');
  eq(cat.lockReason(boss, env({ playCount: () => 1 })), -1, '보스 1회 이상 = -1');
  const rhythm = byRule('Rhythm')[0];
  eq(cat.lockReason(rhythm, env({ connected: true })), 2, '리듬(OfflinePlayOnly) 접속 = 2');
  const solo = cat.games.find((g) => g.solo && !g.offline && !g.setLock)!.id;
  eq(cat.lockReason(solo, env({ players: players([0, 0, 1, 1]) })), 1, 'SoloPlayOnly 사람 2 = 1');
  eq(cat.lockReason(solo, env()), -1, 'SoloPlayOnly 사람 1 = -1');
  const busters = cat.filterList(FILTER.MgBusters).find((id) => !cat.game(id)!.solo)!;
  const same: Mgm01Player[] = [
    { pid: 0, type: 0, constantId: 7 },
    { pid: 1, type: 0, constantId: 7 },
    { pid: 2, type: 1 },
    { pid: 3, type: 1 },
  ];
  eq(cat.lockReason(busters, env({ connected: true, players: same })), 3, '버스터즈 접속·같은 ConstantID = 3');
  eq(cat.lockReason(busters, env({ connected: false, players: same })), -1, '버스터즈 오프라인 = -1');
}

console.log('3. 필터 선택 순수 상태 (6.1·6.2·7)');
{
  const fav = new Set<number>();
  let locked = new Set<number>(cat.filterList(FILTER.MgBoss));
  const st = new ListFilterState(cat, { reason: (id) => (locked.has(id) ? 0 : -1), favorite: (id) => fav.has(id) });
  eq([st.applied.enumNo, st.applied.ids.length, st.applied.type, st.applied.unlocked.length], [0, 112, 0, 107], '처음 = 전부 112, 형식 0, unlocked 107');
  ok(!st.input(0x10 | 0x100), '동시 누름(마스크 다름) = 무시');
  ok(!st.input(0x1), 'A = 필터 아님');
  ok(st.input(0x20), '0x20 = 다음');
  eq(st.drain(), [{ type: 'se', label: 'SQ_SE_MGM01_DECI_LR' }, { type: 'anim', name: 'right_select_00' }], 'DECI_LR + select_00');
  ok(!st.input(0x20), 'select 중 입력 무시 [설계]');
  st.step(false);
  eq(st.drain(), [], '애니 안 끝남');
  st.step(true);
  const ev = st.drain();
  eq(ev.map((e) => e.type), ['applied', 'anim'], 'select_00 끝 → 재구성 → select_01');
  eq([st.applied.enumNo, st.applied.ids.length, st.applied.type, st.applied.label], [1, 29, 1, 'mgm01_ui_filterMgGenre01'], '4인 대전 29 형식 1');
  st.step(true);
  eq(st.phase, 'idle', 'select_01 끝 → idle');
  st.input(0x40);
  st.drain();
  st.step(true);
  st.step(true);
  eq(st.applied.enumNo, 0, '0x40 = 이전 → 전부');
  st.input(0x10);
  st.step(true);
  st.step(true);
  eq([st.applied.enumNo, st.applied.ids.length, st.applied.type, st.applied.emptyFavorite], [13, 0, 2, true], '전부 이전 = 즐겨찾기(빈) 형식 2');
  const a = cat.filterList(0)[50];
  const b = cat.filterList(0)[3];
  fav.add(a).add(b);
  st.apply();
  eq(st.applied.ids, [b, a], '즐겨찾기 = MgAll 열 순서');
  st.index = cat.filterIndexOf(FILTER.MgBoss);
  st.apply();
  eq([st.applied.ids.length, st.applied.unlocked.length], [5, 0], '보스 잠김: 목록 5 (inclLocked) unlocked 0');
  locked = new Set();
  st.apply();
  eq(st.applied.unlocked.length, 5, '보스 개방 unlocked 5');
}

console.log('4. 팀 표·배정·CPU 조정 (6.5·8.2·8.3)');
{
  eq(TEAM_TABLE.length, 15, '팀 표 15행');
  eq([teamTableIndex(0, players([0, 1, 1, 1])), teamTableIndex(1, players([0, 1, 1, 1])), teamTableIndex(2, players([0, 1, 1, 1]))], [0, 2, 1], 'rule0→0, rule1→2, rule2→1');
  eq([teamTableIndex(3, players([0, 1, 1, 1])), teamTableIndex(3, players([0, 0, 1, 1])), teamTableIndex(3, players([0, 0, 0, 1])), teamTableIndex(3, players([0, 0, 0, 0]))], [3, 4, 5, 6], 'duel 6 − CPU 수');
  eq([teamTableIndex(8, players([0, 1, 1, 1])), teamTableIndex(8, players([0, 0, 0, 0])), teamTableIndex(13, players([0, 0, 1, 1])), teamTableIndex(13, players([0, 0, 1, 1]), true)], [7, 10, 8, 12], 'rule8 10−CPU, rule13 offline 10/online 14 − CPU');
  eq(teamIdsByPosition(4, [1, 0, 2, 3]), [1, 0, 1, 1], '1vs3 후보1 = [1,0,1,1]');
  eq(teamIdsByPosition(5, [0, 2, 1, 3]), [0, 1, 0, 1], '2vs2 후보1 = [0,1,0,1]');
  eq(teamIdsByPosition(6, [1, 3]), [-1, 0, -1, 1], '1vs1 [1,3]');
  eq(teamIdsByPosition(3, [2]), [-1, -1, 0, -1], 'vs1 [2]');
  eq(positionOrder(3, players([1, 1, 0, 0])), [2, 3, 0, 1], 'duel 정렬: 사람 먼저·PlayerID 오름차순');
  eq(positionOrder(0, players([1, 1, 0, 0])), [0, 1, 2, 3], 'rule0 은 정렬 없음');
  eq(
    [isComLevelAdjustable(0, players([0, 1, 1, 1])), isComLevelAdjustable(0, players([0, 0, 0, 0])), isComLevelAdjustable(10, players([0, 1, 1, 1])), isComLevelAdjustable(3, players([0, 0, 1, 1])), isComLevelAdjustable(3, players([0, 1, 1, 1]))],
    [true, false, false, false, true],
    'IsComLevelAdjustable',
  );
  eq(recordView(1, false, 1234)?.inserts, { Text0: '12.34' }, 'kind1 %01d.%02d');
  eq(recordView(2, false, 9000)?.inserts, { Text0: '1', Text1: '30', Text2: '00' }, 'kind2 분/초/소수');
  eq(recordView(2, false, 99999)?.inserts, { Text0: '9', Text1: '59', Text2: '99' }, 'kind2 59999 cap');
  eq([recordView(3, false, 3000), recordView(-1, false, 1)], [null, null], 'kind3 노멀·kind-1 숨김');
}

const mkDeps = (id: number, ps: Mgm01Player[], o: Partial<SettingDeps> = {}): SettingDeps & { fav: Set<number> } => {
  const fav = new Set<number>();
  return {
    catalog: cat,
    players: () => ps,
    filter: { enumNo: 0, index: 0 },
    unlocked: cat.filterList(0),
    isFavorite: (x) => fav.has(x),
    setFavorite: (x, on) => (on ? fav.add(x) : fav.delete(x)),
    rand: () => 0,
    fav,
    ...o,
  };
};
const init = (id: number, resume = false) => ({ id, team: 0, cpu: 0, endless: false, rhythm: 0, resume });

console.log('5. 개별 설정 순수 상태 (6.2·6.5)');
{
  const ps = players([0, 1, 1, 1]);
  const d = mkDeps(4, ps);
  const s = new SettingState(d, init(4));
  eq(s.valid, [false, true, true, false, true], 'mg0106(ID4): 팀 1후보 숨김·CPU·모드·Play');
  eq(s.rulePane, [0, 1, -1], 'CPU→pane0, 모드→pane1, 리듬 -1');
  eq(s.cursor, SETTING_ITEM.CPU, '첫 valid = CPU');
  s.input(0x400, 0);
  eq(s.drain(), [], 'CPU 0 에서 아래 = 경계 무음');
  s.input(0x800, 0);
  eq(s.drain(), [{ type: 'se', label: 'SQ_SE_MGM01_CUR' }, { type: 'value', item: 1, value: 1 }], 'CPU +1 = CUR');
  s.input(0x20000, 0);
  s.input(0x20000, 0);
  s.input(0x20000, 0);
  s.drain();
  eq(s.values[1], 3, 'CPU 0..3 clamp');
  s.input(0x1, 0x1);
  eq(s.cursor, SETTING_ITEM.MODE, 'A = 다음 valid');
  s.input(0x800, 0);
  s.drain();
  eq(s.commit().endless, true, '모드 엔드리스');
  s.input(0x40200, 0);
  eq(s.cursor, SETTING_ITEM.PLAY, '오른쪽 = 다음 valid(리듬 건너뜀)');
  s.input(0x200, 0);
  eq(s.cursor, SETTING_ITEM.PLAY, '끝 clamp');
  s.input(0x2, 0x2);
  s.input(0x2, 0x2);
  eq(s.cursor, SETTING_ITEM.CPU, 'B 두 번 = CPU');
  s.drain();
  s.input(0x2, 0x2);
  eq([s.phase, s.result], ['exit', 'list'], '첫 항목에서 B = 목록 복귀');
  ok(s.drain().some((e) => e.type === 'se' && e.label === 'SQ_SE_MGM01_CANCEL'), '복귀 CANCEL [설계]');

  const r = new SettingState(mkDeps(4, ps), init(4, true));
  eq(r.cursor, SETTING_ITEM.PLAY, 'resume = Play 커서');
  r.input(0x4, 0x4);
  eq(r.drain(), [{ type: 'se', label: 'SQ_SE_MGM01_LIKE_ADD' }, { type: 'favorite', on: true }], 'Y 즐겨찾기 켬');
  r.input(0x4, 0x4);
  eq(r.drain()[0], { type: 'se', label: 'SQ_SE_MGM01_LIKE_DIS' }, 'Y 즐겨찾기 끔');
  ok(r.favoriteDirty, 'favorite dirty');
  r.input(0x1 | 0x4, 0);
  eq(r.phase, 'active', '동시 누름 A|Y = 결정 아님');
  r.input(0, 0x20);
  const ge = r.drain();
  eq(ge[1], { type: 'game', dir: 1, id: cat.filterList(0)[cat.filterList(0).indexOf(4) + 1] }, '0x20 = 다음 미니게임');
  r.input(0, 0x10);
  eq(r.id, 4, '0x10 = 이전 미니게임');
  r.drain();
  r.input(0x1, 0x1);
  eq([r.phase, r.drain().map((e) => e.type)], ['press', ['se', 'press']], 'Play A = press');
  r.pressDone();
  eq([r.phase, r.result], ['exit', 'play'], 'press 완료 → play');
  const req = r.playRequest();
  eq([req.id, req.name, req.ruleNo, req.team.table, req.team.teamIdByPid, req.team.gamePlayByPid.every(Boolean), req.endless, req.rhythm], [4, 'mg0106', 0, 0, [0, 0, 0, 0], true, false, 0], '호출 계약(vs4)');

  const x = new SettingState(mkDeps(4, ps, { rand: (n) => n - 1 }), init(4));
  x.input(0x8, 0x8);
  const last = cat.filterList(0)[111];
  eq([x.phase, x.result, x.id, x.drain()[0]], ['exit', 'random', last, { type: 'se', label: 'SQ_SE_MGM01_DECI_S' }], 'X 랜덤 = unlocked 후보 SyncRandRange');
  const xe = new SettingState(mkDeps(4, ps, { unlocked: [] }), init(4));
  eq(xe.ids, [4], '후보 0 = 현재 ID fallback');
  xe.input(0x8, 0x8);
  eq([xe.phase, xe.drain()], ['active', [{ type: 'se', label: 'SQ_SE_MGM01_DECI_S' }]], '후보 0 랜덤 = DECI_S 만');

  const duel = byRule('1VS1')[0];
  const four = players([0, 0, 0, 0]);
  const dd = new SettingState(mkDeps(duel, four), init(duel));
  eq([dd.teamTable, dd.teamCount, dd.valid], [6, 6, [true, false, false, false, true]], '듀얼 4인: 팀 6후보, CPU 없음');
  for (let i = 0; i < 6; i++) dd.input(0x800, 0);
  eq(dd.values[0], 5, '팀 0..5 clamp');
  eq(dd.playRequest().team.teamIdByPid, [-1, -1, 0, 1], '듀얼 후보 5 = [2,3]');
  const d2 = new SettingState(mkDeps(duel, players([1, 0, 1, 0])), init(duel));
  eq([d2.teamTable, d2.teamView().order], [4, [1, 3, 0, 2]], '듀얼 사람 2(pid1·3): 표 4, 위치 = 사람 먼저');
  eq(d2.playRequest().team.teamIdByPid, [-1, 0, -1, 1], '듀얼 사람 2 → pid1 팀0·pid3 팀1');
  eq(d2.valid[1], false, '듀얼 사람≥2 CPU 조정 불가');

  const vs13 = byRule('1VS3')[0];
  const t3 = new SettingState(mkDeps(vs13, ps), init(vs13));
  eq([t3.teamTable, t3.teamCount, t3.cursor], [1, 4, SETTING_ITEM.TEAM], '1vs3: 표 1, 4후보, 커서 팀');
  t3.input(0x800, 0);
  eq(t3.playRequest().team.teamIdByPid, [1, 0, 1, 1], '1vs3 후보1');

  const rh = byRule('Rhythm')[0];
  const rs = new SettingState(mkDeps(rh, ps), init(rh));
  eq([rs.valid, rs.rulePane, rs.cursor], [[false, false, false, true, true], [-1, -1, 0], SETTING_ITEM.RHYTHM], '리듬: 리듬 난이도만');
  rs.input(0x800, 0);
  eq(rs.playRequest().rhythm, 1, '리듬 하드 → rhythm 1');
}

console.log('6. 실제 명세: 설정 화면 흐름 (mginfo 창·항목·문구)');
const part = JSON.parse(readFileSync(join(WEB, 'assets/mgmcommon/mgm01.json'), 'utf8')) as MgmSpecPart;
const merged = mergeSpec(spec, part);
const all = merged as unknown as Spec;
const host: MgmDrawHost = { all, spec: merged, r2d: null as unknown as Render2D, layout: (n) => new LayoutInst(n, merged.layouts[n], all), draw: () => {} };
const sound = new MgmSound({ ...spec.sounds, ...json.sounds }, (p) => p);
{
  let pending = { trig: 0, rep: 0 };
  const press = (b: number): void => {
    pending = { trig: b, rep: b };
  };
  const ps = players([0, 1, 1, 1]);
  const d = mkDeps(4, ps);
  const scr = new SettingScreen(host, { ...d, sound, input: () => {
    const p = pending;
    pending = { trig: 0, rep: 0 };
    return p;
  }, record: (id) => cat.defaultRecord(cat.game(id)!.name), playCount: () => 3 });
  const fr = new FiberRunner();
  let out: SettingOutcome | null = null;
  fr.start(scr.flow(init(4)), (r) => (out = r));
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      fr.step();
      scr.update();
    }
  };
  tick(20);
  const w = scr.win;
  ok(w.isVisible() && !w.life.opening, '창 열림');
  eq([w.cursor.col, w.isItemVisible(0, 0), w.isItemVisible(0, 1), w.isItemVisible(0, 2)], [1, false, true, true], '커서 CPU(pane0), 팀 숨김, rule pane 2개 보임');
  eq(w.textOf('x_mgname'), spec.texts.im_mg0106_name, '이름 = im_mg0106_name');
  eq(w.textOf('x_rule/x_rule_option_00/x_text_cpu_00'), spec.texts.im_comLevel00, 'CPU 문구 = im_comLevel00');
  eq(w.textOf('x_rule/x_rule_option_01/x_text_00'), spec.texts.mgm01_ui_rule_EndlessSetting00, '모드 문구 노멀');
  eq(w.inst.find('x_record_00')![0].nodes[w.inst.find('x_record_00')![1]].v, false, 'kind3 노멀 = 하이 스코어 숨김');
  eq(w.textOf('x_record_01/x_text_01'), '3회', '플레이 횟수 삽입');
  eq([w.inst.part('x_rule/x_rule_option_00')?.current, w.inst.part('x_rule/x_rule_option_01')?.current], ['normal', 'off'], '커서 항목 on→normal, 나머지 off');
  press(0x800);
  tick(2);
  eq(w.textOf('x_rule/x_rule_option_00/x_text_cpu_00'), spec.texts.im_comLevel01, 'CPU +1 문구');
  ok(sound.log.some((l) => l.type === 'se' && l.label === 'SQ_SE_MGM01_CUR'), 'CUR SE 기록');
  press(0x1);
  tick(2);
  press(0x800);
  tick(2);
  eq(w.textOf('x_rule/x_rule_option_01/x_text_00'), spec.texts.mgm01_ui_rule_EndlessSetting01, '모드 엔드리스');
  ok(w.inst.find('x_record_00')![0].nodes[w.inst.find('x_record_00')![1]].v, '엔드리스 = 하이 스코어 보임');
  eq(w.textOf('x_record_00/x_text_01'), '0:30.00', '엔드리스 기본 기록 3000 = 0:30.00');
  press(0x1);
  tick(2);
  eq(w.cursor.col, 3, 'Play 커서');
  press(0x1);
  tick(2);
  eq(w.inst.part('x_rule/x_play_00')?.current, 'press', 'Play press');
  tick(60);
  ok(out !== null, '흐름 끝');
  const o = out as unknown as SettingOutcome;
  eq([o.result, o.values, o.request?.cpu, o.request?.endless], ['play', { team: 0, cpu: 1, endless: true, rhythm: 0 }, 1, true], '결과 = play + 설정값');
  ok(!w.isVisible(), '창 닫힘');
}

console.log('7. 실제 명세: 필터 화면 흐름 (freeplay header)');
{
  let pending = { trig: 0, rep: 0 };
  const applied: number[] = [];
  const scr = new FilterScreen(host, cat, {
    reason: () => -1,
    favorite: () => false,
    sound,
    input: () => {
      const p = pending;
      pending = { trig: 0, rep: 0 };
      return p;
    },
    onApplied: (r) => applied.push(r.enumNo),
  });
  const fr = new FiberRunner();
  let res: { enumNo: number } | null = null;
  fr.start(scr.flow(), (r) => (res = r));
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      fr.step();
      scr.update();
    }
  };
  tick(20);
  eq(scr.win.textOf('x_text_00'), '전부', '머리 줄 = 전부');
  eq(scr.win.inst.find('thum_all')![0].nodes[scr.win.inst.find('thum_all')![1]].v, false, '목록 본체 숨김');
  pending = { trig: 0x20, rep: 0x20 };
  tick(1);
  eq(scr.win.inst.current, 'right_select_00', 'select_00');
  tick(6);
  eq(scr.win.textOf('x_text_00'), spec.texts.mgm01_ui_filterMgGenre01, '재구성 = 4인 대전');
  tick(8);
  eq([scr.state.phase, scr.win.inst.current], ['idle', 'normal'], 'select_01 뒤 normal');
  pending = { trig: 0x10, rep: 0x10 };
  tick(16);
  pending = { trig: 0x10, rep: 0x10 };
  tick(16);
  eq([scr.state.applied.enumNo, scr.win.textOf('x_text_00')], [13, '즐겨찾기'], '두 번 이전 = 즐겨찾기');
  eq(scr.win.inst.find('x_no_favorite')![0].nodes[scr.win.inst.find('x_no_favorite')![1]].v, true, '빈 즐겨찾기 문구 보임');
  eq(applied, [0, 1, 0, 13], 'onApplied 순서');
  pending = { trig: 0x2, rep: 0x2 };
  tick(20);
  eq((res as unknown as { enumNo: number } | null)?.enumNo, 13, 'B = 닫고 마지막 필터 반환 [설계]');
}

console.log(fails ? `실패 ${fails}/${count}` : `통과 ${count}/${count}`);
process.exit(fails ? 1 : 0);
