/**
 * 프리 플레이(mgm01) 개별 설정·필터 상태 시험 — script/app/scene/minigame/mgm01 의 순수 상태(catalog·listFilter·settingView)와
 * 실제 명세(assets/mgmcommon + assets/mgm01/catalog.json)로 만든 설정 화면·필터 화면 흐름을 노드에서 돈다(WebGL 없음).
 * 기대값 근거: docs/shell/mgm01_freeplay.md 6.1·6.2·6.4·6.5·8.3·9절(판독한 규칙의 재구현 시험, 원본 실행 대조 아님).
 *
 *   npx tsx tools/test_mgm01.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeMatrix, rectOf, type Render2D } from '@app/scene/menu/charselect/render2d';
import { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { resolveFontsFromDisk } from './fontSpecNode';
import { createWork, FiberRunner, MemorySave, mergeSpec, MgmInput, MgmSound, plainText, type MgmDrawHost, type MgmSpec, type MgmSpecPart, type MgmView, type MgResultEntry } from '@app/common/ui';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fmabRepeatBad, glbRepeatBad } from './anim_repeat';
import {
  FILTER,
  filterNextIndex,
  FilterScreen,
  isComLevelAdjustable,
  LIST_FORMAT,
  LIST_PANE_TABLE,
  LIST_SE,
  ListScreen,
  listMoveTarget,
  listPane,
  ListState,
  ListFilterState,
  listType,
  Mgm01Catalog,
  Mgm01Scene,
  PLACEHOLDER_THUMB,
  positionOrder,
  recordView,
  SETTING_ITEM,
  SettingScreen,
  SettingState,
  teamIdsByPosition,
  teamTableIndex,
  TEAM_TABLE,
  thumbKey,
  type LockEnv,
  type Mgm01Carry,
  type Mgm01CatalogJson,
  type Mgm01PlayRequest,
  type Mgm01Player,
  type SettingDeps,
  type SettingOutcome,
} from '@app/scene/minigame/mgm01';

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
await resolveFontsFromDisk(spec.fonts as Record<string, unknown>, join(WEB, 'assets/mgmcommon'));
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
  const span = (p: string): number[] => {
    const m = nodeMatrix(w.inst, p)!;
    const f = w.inst.find(p)!;
    const n = f[0].nodes[f[1]];
    const [l, , r] = rectOf(n.spec.o, n.z[0], n.z[1]);
    return [m[0] * l + m[2], m[0] * r + m[2]].map((v) => Math.round(v * 1000) / 1000);
  };
  eq(span('x_rule/x_play_00/base'), [586, 1018], '플레이 버튼 판 = 원본 규칙 계산 586..1018(오른쪽 58 px 화면 밖은 원본 데이터, ui2d_alignment.md 12.3)');
  ok(span('x_rule/x_play_00/cursor')[1] <= 960 && span('x_rule/x_play_00/x_text_00')[1] <= 960, '플레이 아이콘·글자 칸 오른쪽 끝 ≤ 960');
  eq([span('x_rule/x_rule_option_00'), span('x_rule/x_rule_option_01')], [[-459, 41], [-33, 467]], '규칙 두 칸 화면 x(12.3, 위치는 레이아웃 그대로)');
  eq([w.cursor.col, w.isItemVisible(0, 0), w.isItemVisible(0, 1), w.isItemVisible(0, 2)], [1, false, true, true], '커서 CPU(pane0), 팀 숨김, rule pane 2개 보임');
  eq(w.textOf('x_mgname'), spec.texts.im_mg0106_name, '이름 = im_mg0106_name');
  eq(w.textOf('x_rule/x_rule_option_00/x_text_cpu_00'), spec.texts.im_comLevel00, 'CPU 문구 = im_comLevel00');
  eq(w.textOf('x_rule/x_rule_option_01/x_text_00'), spec.texts.mgm01_ui_rule_EndlessSetting00, '모드 문구 노멀');
  eq(w.inst.find('x_record_01')![0].nodes[w.inst.find('x_record_01')![1]].v, false, 'kind3 노멀 = 하이 스코어(x_record_01, 6.7 정정) 숨김');
  eq(w.textOf('x_record_00/x_text_01'), '3회', '플레이 횟수 삽입(x_record_00, 6.7 정정)');
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
  ok(w.inst.find('x_record_01')![0].nodes[w.inst.find('x_record_01')![1]].v, '엔드리스 = 하이 스코어 보임');
  eq(w.textOf('x_record_01/x_text_01'), '0:30.00', '엔드리스 기본 기록 3000 = 0:30.00');
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

console.log('8. 목록 본체 순수 상태 (6.3·6.7·5.5)');
const facesPart = JSON.parse(readFileSync(join(WEB, 'assets/mgm01/faces.json'), 'utf8')) as MgmSpecPart;
const thumbsPart = JSON.parse(readFileSync(join(WEB, 'assets/mgm01/thumbs.json'), 'utf8')) as MgmSpecPart;
const merged2 = mergeSpec(mergeSpec(merged, facesPart), thumbsPart);
const all2 = merged2 as unknown as Spec;
const view2 = {
  all: all2,
  spec: merged2,
  r2d: null as unknown as Render2D,
  layout: (n: string) => new LayoutInst(n, merged2.layouts[n], all2),
  draw: () => {},
  text: (l: string) => merged2.texts[l] ?? '',
} as unknown as MgmView;
const allIds = cat.filterList(FILTER.MgAll);
const bossIds = cat.filterList(FILTER.MgBoss);
{
  LIST_PANE_TABLE.forEach((t, type) => {
    const n = LIST_FORMAT[type].cols * LIST_FORMAT[type].rows;
    eq([...t].sort((a, b) => a - b), [...Array(n).keys()], `위치→페인 표 ${type} = 0..${n - 1} 순열`);
    const lay = merged2.layouts.mgm01_base_freeplay_00;
    const pos = t.map((_, i) => lay.nodes.find((nd) => nd.n === listPane(type, i))?.t ?? null);
    ok(pos.every((p) => p !== null), `형식 ${type} 페인 전부 레이아웃에 있음`);
    const W = LIST_FORMAT[type].cols;
    let rowMajor = true;
    for (let i = 1; i < n; i++) {
      const a = pos[i - 1]!;
      const b = pos[i]!;
      if (i % W === 0 ? !(b[1] < a[1]) : !(b[0] > a[0] && b[1] === a[1])) rowMajor = false;
    }
    ok(rowMajor, `형식 ${type} 위치 i = 행 우선 화면 순서(열 ${W})`);
  });
  eq(listPane(0, 14), 'x_thum_00_101', '형식0 위치 14 = x_thum_00_101 (표 데이터)');
  eq([listMoveTarget(0, 112, 14, 0, -1, false), listMoveTarget(0, 112, 14, 0, -1, true)], [0, 98], '맨 위 위: 반복 = 막힘, 새로 누름 = 아래 끝 같은 열');
  eq([listMoveTarget(13, 112, 14, 1, 0, false), listMoveTarget(13, 112, 14, 1, 0, true)], [13, 14], '행 끝 오른쪽: 반복 막힘, 새로 = 다음 위치');
  eq([listMoveTarget(1, 7, 5, 0, -1, true), listMoveTarget(5, 7, 5, 0, 1, true), listMoveTarget(6, 7, 5, 0, 1, true), listMoveTarget(3, 7, 5, 0, -1, true)], [6, 0, 1, 3], 'N=7·W=5 끝 행 Q 보정(6.3)');
  eq([listMoveTarget(6, 7, 5, 1, 0, false), listMoveTarget(5, 7, 5, -1, 0, false), listMoveTarget(5, 7, 5, 0, 1, false)], [6, 5, 5], 'N−1 오른쪽·열0 왼쪽·끝 행 아래 반복 = 막힘');

  const reason = (id: number): number => cat.lockReason(id, { bossOpen: false, playCount: () => 0, connected: false, players: players([0, 1, 1, 1]) });
  const news = new Set<number>([allIds[1]]);
  let rnd = 0;
  const deps = { catalog: cat, reason, favorite: () => false, isNew: (id: number) => news.has(id), rand: () => rnd };
  const ls = new ListState(deps);
  ls.prepare();
  const ev0 = ls.drain();
  eq([ev0[0].type, ev0[1]], ['apply', { type: 'cursor', index: 0, imm: true }], '처음 = 목록 구성 + 커서 0');
  eq([ls.ids.length, ls.type, ls.cols], [112, 0, 14], 'MgAll = 112·형식0·14열');
  ls.input(0x200, 0x200);
  eq(ls.drain(), [{ type: 'se', label: LIST_SE.cursor, at: 'cursor' }, { type: 'fx' }, { type: 'cursor', index: 1, imm: true }, { type: 'skip' }], '오른쪽 = CUR(2D)·FX·커서 1, trig>1 skip');
  eq([ls.observer.running, ls.observer.id], [true, allIds[1]], 'NEW 칸 = 관찰 시작');
  for (let i = 0; i < 12; i++) ls.stepNew(1);
  eq(ls.drain(), [], '누적 12 = 아직(wait < 누적)');
  ls.stepNew(1);
  eq(ls.drain(), [{ type: 'newConsume', id: allIds[1], index: 1 }], '13 = NEW 소비');
  ls.input(0x1, 0x1);
  eq(
    ls.drain().map((e) => (e.type === 'se' ? e.label : e.type)),
    ['decide', LIST_SE.decide, 'fx', 'exit'],
    'A = Decide·SQ_SE_MGM01_DEC·FX → 4',
  );
  eq([ls.phase, ls.exitResult, ls.selectedId], ['exit', 4, allIds[1]], '나감 4 = 결정 ID');

  const bossPos = allIds.indexOf(bossIds[0]);
  ls.selectedId = bossIds[0];
  ls.resume = true;
  ls.prepare();
  ls.drain();
  eq(ls.cursor, bossPos, 'resume = 저장 ID 칸으로 커서');
  ls.opened();
  ls.input(0x1, 0x1);
  eq(
    ls.drain(),
    [{ type: 'decide', index: bossPos }, { type: 'se', label: 'SQ_SE_SYS_ERROR' }, { type: 'vibrate' }, { type: 'announce', reason: 0 }],
    '잠긴 보스 A = press_ng·ERROR·진동·안내(reason0)',
  );
  eq(ls.phase, 'idle', '잠금 = 목록 계속');
  rnd = 2;
  ls.input(0x8, 0x8);
  const unl = cat.mgIdList(FILTER.MgAll, false, reason);
  const re = ls.drain();
  eq(re.slice(0, 2), [{ type: 'se', label: LIST_SE.random }, { type: 'fx' }], 'Y = 랜덤 DECI_S·FX');
  eq([ls.exitResult, ls.selectedId, ls.cursor], [4, unl[2], allIds.indexOf(unl[2])], '랜덤 = unlocked 후보[rand] 로 커서·결정 → 4');
  ok(re.some((e) => e.type === 'skip'), 'trig>1 = 안내 skip');
  ls.resume = false;
  ls.prepare(0);
  ls.drain();
  ls.input(0x4, 0x4);
  eq([ls.drain()[0], ls.exitResult], [{ type: 'se', label: LIST_SE.history }, 3], 'X = 승패 표 DECI_S → 3');
  ls.prepare(0);
  ls.drain();
  ls.input(0x2, 0x2);
  eq([ls.drain()[0], ls.exitResult], [{ type: 'se', label: LIST_SE.cancel }, 7], 'B = CANCEL → 7');
  ls.prepare(0);
  ls.drain();
  ls.input(0x20, 0x20);
  eq(
    ls.drain(),
    [{ type: 'se', label: 'SQ_SE_MGM01_DECI_LR', at: 'filterR' }, { type: 'fx' }, { type: 'filterAnim', name: 'right_select_00', dir: 1 }, { type: 'skip' }],
    'R = DECI_LR(2D)·right_select_00, trig>1 skip',
  );
  ls.input(0x1, 0x1);
  eq(ls.drain(), [], '필터 애니 중 입력 없음');
  ls.stepFilter(false);
  eq(ls.drain(), [], 'select_00 진행 중');
  ls.stepFilter(true);
  eq(
    ls.drain().map((e) => e.type),
    ['reset', 'apply', 'cursor', 'filterAnim'],
    'select_00 끝 = ResetMgItem → 재구성 → 커서 0 → select_01',
  );
  eq([ls.enumNo, ls.ids.length, ls.type, ls.cursor], [1, 29, 1, 0], '4인 대전 29개 = 형식1, 커서 0');
  ls.stepFilter(true);
  eq(ls.phase, 'idle', 'select_01 끝 = idle');
  const lf = new ListState(deps, FILTER.MgFavorite);
  lf.prepare();
  eq([lf.ids.length, lf.type, lf.filter.applied.emptyFavorite], [0, 2, true], '빈 즐겨찾기 = N0·형식2');
  lf.drain();
  lf.input(0x1, 0x1);
  lf.input(0x8, 0x8);
  lf.input(0x800, 0x800);
  eq([lf.phase, lf.drain().filter((e) => e.type !== 'skip')], ['idle', []], '빈 목록: A·Y·방향 무시');
  lf.input(0x4, 0x4);
  eq([lf.exitResult, lf.selectedId], [3, -1], '빈 목록 X = 승패 표');
}

console.log('9. 실제 명세: 목록 화면 (3형식·썸네일·라벨·필터)');
{
  let pending = { trig: 0, rep: 0 };
  const press = (b: number): void => {
    pending = { trig: b, rep: b };
  };
  const consumed: number[] = [];
  const news = new Set<number>([allIds[0]]);
  const reason = (id: number): number => cat.lockReason(id, { bossOpen: false, playCount: () => 0, connected: false, players: players([0, 1, 1, 1]) });
  const ls = new ListScreen(view2, {
    catalog: cat,
    reason,
    favorite: (id) => id === allIds[2],
    isNew: (id) => news.has(id),
    rand: () => 0,
    sound,
    input: () => {
      const p = pending;
      pending = { trig: 0, rep: 0 };
      return p;
    },
    operator: () => 0,
    consumeNew: (id) => {
      news.delete(id);
      consumed.push(id);
    },
  });
  const fr = new FiberRunner();
  let out: { result: number } | null = null;
  fr.start(ls.flow({ resume: false, selectedId: -1 }), (r) => (out = r));
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      fr.step();
      ls.update(Math.fround(1 / 60));
    }
  };
  const vis = (inst: LayoutInst, p: string): boolean | undefined => {
    const f = inst.find(p);
    return f ? f[0].nodes[f[1]].v : undefined;
  };
  const txt = (inst: LayoutInst, p: string): string | undefined => {
    const f = inst.find(p);
    return f ? f[0].texts.get(f[1]) : undefined;
  };
  const tex = (inst: LayoutInst, p: string): string | undefined => {
    const f = inst.find(p);
    if (!f) return undefined;
    const m = f[0].nodes[f[1]].spec.m;
    return m === undefined ? undefined : f[0].texOverride.get(m)?.get(1);
  };
  tick(2);
  eq(ls.win.life.opening, true, '첫 진입 = in 애니(resume0)');
  tick(14);
  ok(ls.win.isVisible() && !ls.win.life.opening, '목록 창 열림');
  eq([vis(ls.win.inst, 'x_filter_00'), vis(ls.win.inst, 'x_filter_01'), vis(ls.win.inst, 'x_filter_02')], [true, false, false], '112개 = x_filter_00');
  eq(ls.win.textOf('x_text_00'), '전부', '머리 줄 = 필터 라벨');
  eq([ls.win.textOf('x_guide_00'), ls.win.textOf('x_guide_01')], [plainText(spec.texts.mgm01_ctrl_mgChoiceFp00, spec.texts), plainText(spec.texts.mgm01_ctrl_mgChoiceFp01, spec.texts)], '안내 문구 Fp00/01');
  const g0 = cat.game(allIds[0])!;
  const it0 = ls.items[0].inst;
  eq([tex(it0, 'x_game_2_0'), tex(it0, 'x_game_2_1')], [thumbKey(g0.name), thumbKey(g0.name)], '항목 0 썸네일 칸1 = mg0101^o (크기 2)');
  eq([vis(it0, 'x_win_00'), vis(it0, 'x_win_01'), vis(it0, 'x_win_02')], [false, false, true], '형식0 = x_win_02');
  eq(
    txt(it0, 'x_mes_02/x_text_00'),
    plainText(merged2.texts.mgm01_ui_mgNameBig, merged2.texts, { Text0: g0.nameLabel }),
    '말풍선 = mgm01_ui_mgNameBig(이름)',
  );
  eq([vis(it0, 'x_new_02'), it0.part('x_new_02')?.current], [true, 'normal'], 'NEW 보임');
  eq(ls.items[2].inst.part('x_heart_02')?.current, 'normal', '즐겨찾기 = heart normal');
  eq(ls.items[1].inst.part('x_heart_02')?.current, 'off', '아님 = heart off');
  eq(it0.current, 'on', '커서 항목 = on');
  const bp = allIds.indexOf(bossIds[0]);
  const ib = ls.items[bp].inst;
  eq([tex(ib, 'x_game_2_0'), vis(ib, 'x_gray_2_0'), ls.win.grid.item(0, bp)?.enabled], [PLACEHOLDER_THUMB, false, false], '잠긴 보스 = mgboss^o·회색 숨김·선택 불가');
  eq(txt(ib, 'x_mes_02/x_text_00'), plainText(spec.texts.mgm01_ui_mgNameNone, spec.texts), '잠긴 보스 이름 = mgm01_ui_mgNameNone');
  const keys = Object.keys(thumbsPart.textures);
  eq(keys.length, 113, '썸네일 113장(112 + mgboss)');
  eq(cat.games.filter((g) => !thumbsPart.textures[thumbKey(g.name)]).map((g) => g.name), [], '112 게임 썸네일 전부 있음');
  ok(keys.every((k) => (thumbsPart.srgb ?? []).includes(k)), '썸네일 sRGB');
  ok(keys.every((k) => existsSync(join(WEB, 'assets/mgmcommon', thumbsPart.textures[k]))), '썸네일 PNG 파일 있음');
  const font = merged2.fonts.bqfont_small;
  const lack = new Set<string>();
  for (const g of cat.games) for (const ch of plainText(merged2.texts[g.nameLabel] ?? '', merged2.texts)) if (ch !== ' ' && !font.glyphs[ch]) lack.add(ch);
  eq([...lack], [], '말풍선 글꼴(bqfont_small)에 112 이름 글자 전부');
  tick(14);
  eq(consumed, [allIds[0]], '커서 칸 NEW 소비');
  eq(vis(it0, 'x_new_02'), false, '소비 = x_new 숨김');
  sound.log.length = 0;
  press(0x200);
  tick(1);
  eq([ls.state.cursor, ls.win.cursor.col], [1, 1], '오른쪽 = 커서 1');
  ok(sound.log.some((l) => l.type === 'se' && l.label === 'SQ_SE_MGM01_CUR'), 'CUR SE');
  press(0x20);
  tick(1);
  eq(ls.win.inst.current, 'right_select_00', '필터 R = right_select_00');
  tick(12);
  eq([ls.state.enumNo, ls.state.type, vis(ls.win.inst, 'x_filter_01')], [1, 1, true], '4인 대전 → x_filter_01');
  const g1 = cat.game(ls.state.ids[0])!;
  eq([tex(ls.items[0].inst, 'x_game_1_0'), vis(ls.items[0].inst, 'x_win_01'), ls.win.isItemVisible(1, 29)], [thumbKey(g1.name), true, false], '형식1 썸네일·x_win_01, 29번 칸 숨김');
  eq(ls.items[40].visible, false, '형식1 칸 수(32) 밖 항목 숨김');
  for (let k = 0; k < 6; k++) {
    press(0x20);
    tick(16);
  }
  eq([ls.state.enumNo, ls.state.type, ls.state.ids.length, vis(ls.win.inst, 'x_filter_02')], [7, 2, 5, true], '보스 5개 → 형식2');
  eq(tex(ls.items[0].inst, 'x_game_0_0'), PLACEHOLDER_THUMB, '형식2 = 크기0, 보스 자리');
  press(0x2);
  tick(30);
  eq((out as { result: number } | null)?.result, 7, 'B = 7');
  ok(!ls.win.isVisible(), '창 닫힘');
}

console.log('10. 상태기계: 목록 ↔ 설정 ↔ 승패 표 ↔ 한 판 호출 ↔ 복귀 ↔ 취소 (5.2·5.5·8.3)');
{
  let bits = 0;
  const ps: Mgm01Player[] = players([0, 1, 1, 1]);
  const input = new MgmInput(
    {
      poll: (pid: number) => {
        const b = pid === 0 ? bits : 0;
        if (pid === 0) bits = 0;
        return { hold: b, trig: b };
      },
    },
    () => ps,
  );
  const save = new MemorySave();
  const work = createWork();
  for (const g of cat.games) work.mg.set(g.id, { isNew: false, unlock: true, favorite: false });
  work.mg.get(allIds[3])!.isNew = true;
  const calls: Mgm01PlayRequest[] = [];
  let exited = 0;
  const carry: Mgm01Carry = { values: { team: 0, cpu: 2, endless: false, rhythm: 0 } };
  const mk = (returned?: MgResultEntry): Mgm01Scene =>
    new Mgm01Scene(
      {
        view: view2,
        input,
        sound,
        catalog: cat,
        work,
        save,
        players: () => ps,
        lockEnv: () => ({ bossOpen: false, playCount: (id) => save.minigame(id).head, connected: false, players: ps }),
        rand: () => 0,
        record: () => null,
        faces: ['pc01', 'pc02', 'pc03', 'pc04'],
        carry,
        call: (r) => calls.push(r),
        exit: () => exited++,
      },
      returned ?? null,
    );
  let sc = mk();
  const run = (n = 1, b = 0): void => {
    for (let i = 0; i < n; i++) {
      if (i === 0 && b) bits = b;
      input.update();
      sc.step();
    }
  };
  const states = (): number[] => sc.log.filter((e) => e.type === 'state').map((e) => (e as { to: number }).to);
  run(20);
  eq([sc.state, states()], [2, [0, 2]], '처음 0 → 2');
  run(1, 0x200);
  run(1, 0x200);
  run(1, 0x200);
  eq(sc.list.state.cursor, 3, '커서 3');
  run(1, 0x1);
  run(40);
  eq(sc.state, 4, 'A → 설정 4');
  const st = sc.setting!.state!;
  eq(st.id, allIds[3], '설정 게임 = 결정 ID');
  eq(st.values[1], 2, 'CPU 초기 = carry 2');
  eq(work.mg.get(allIds[3])!.isNew, false, '설정 표시 = NEW 소비(ApplyListMgSetting)');
  const tx = (p: string): string | undefined => {
    const f = sc.setting!.win.inst.find(p);
    const m = f ? f[0].nodes[f[1]].spec.m : undefined;
    return f && m !== undefined ? f[0].texOverride.get(m)?.get(1) : undefined;
  };
  const unl = cat.mgIdList(FILTER.MgAll, false, (id) => sc.reason(id));
  const pos = unl.indexOf(allIds[3]);
  const nm = (k: number): string => thumbKey(cat.game(unl[(((pos + k) % unl.length) + unl.length) % unl.length])!.name);
  eq(
    [tx('x_thum_00'), tx('x_preview/x_preview_00'), tx('x_preview/x_preview_06'), tx('x_preview/x_preview_03'), tx('x_preview/x_preview_07')],
    [nm(0), nm(0), nm(-3), nm(3), nm(4)],
    '설정 큰 그림·미리보기 오프셋 → 페인(6.7)',
  );
  run(1, 0x2);
  run(40);
  eq([sc.state, sc.list.state.cursor, sc.list.win.inst.current], [2, 3, 'normal'], '첫 항목 B → 목록, 커서 복원, in 애니 없이(resume)');
  run(1, 0x4);
  run(40);
  eq(sc.state, 3, 'X → 승패 표 3');
  run(1, 0x2);
  run(40);
  eq([sc.state, sc.list.state.cursor], [2, 3], '승패 표 B → 목록, 커서 복원');
  run(1, 0x1);
  run(40);
  eq(sc.state, 4, '다시 설정');
  for (let k = 0; k < 4 && sc.setting?.state?.cursor !== 4; k++) {
    run(1, 0x1);
    run(4);
  }
  run(1, 0x1);
  run(120);
  eq(states().slice(-4), [4, 5, 6, 8], 'Play → 5 → 6 → 8');
  eq([sc.state, calls.length], [8, 1], '1.0 s 뒤 한 판 호출');
  const req = calls[0];
  eq([req.id, req.cpu, req.filter.enumNo], [allIds[3], 2, 0], '호출 계약 = ID·CPU·필터');
  eq(work.freeplaySelect, { filter: 0, index: 0, id: allIds[3], fromFavorite: false }, 'ModeData 선택 저장');
  sc = mk({ id: req.id, judge: 1, results: [1, 0, 0, 0] });
  eq([work.round, work.results.length, work.results[0].id], [1, 1, req.id], '복귀 = Round 1·결과 기록');
  run(3);
  eq([sc.state, sc.list.state.cursor, sc.list.win.inst.current], [2, 3, 'normal'], 'ContinueFlow = 목록, 같은 칸, in 애니 없음');
  run(30);
  run(1, 0x4);
  run(40);
  const hs = sc.history!;
  const f = hs.table.inst.find('x_parts_00/x_thumbnail');
  const m = f ? f[0].nodes[f[1]].spec.m : undefined;
  eq(f && m !== undefined ? f[0].texOverride.get(m)?.get(1) : undefined, thumbKey(cat.game(req.id)!.name), '승패 표 열 썸네일 = 그 게임');
  run(1, 0x2);
  run(40);
  run(1, 0x2);
  run(60);
  eq([states().slice(-2), exited], [[7, 9], 1], '목록 B → 7 → 9 → 항구로');
  ok(!sc.guide.shown, 'Back 안내 Out');
}

console.log('11. 3D 애니 커브 반복(원본 wrap Repeat — 변환기 Curves.cs, plaza_3d.md §6.14 #14c ③). mgm01 바다·mgm00 바나나 결과 모션은 아직 변환 산출물이 없어 변환기를 그 자리에서 돌린다');
{
  const EXE = join(WEB, 'tools/analysis/graphics_bfres2gltf/bin/Release/net7.0/graphics_bfres2gltf.exe');
  const BEA = join(WEB, '..', 'extracted', 'bea');
  const OUT = join(WEB, 'test/out/anim_repeat');
  const seaSrc = join(BEA, 'mgm~mgm01.nx.bea/mgm/mgm01/model/mgm01_sea00.fmab');
  if (!existsSync(EXE) || !existsSync(seaSrc)) console.log('   건너뜀: 변환기나 원본 아카이브 없음');
  else {
    mkdirSync(OUT, { recursive: true });
    const sea = join(OUT, 'mgm01_sea00.fmab.json');
    spawnSync(EXE, ['anim', seaSrc, sea]);
    const r = fmabRepeatBad(sea, [
      ['beach_sand00_cw_mt', 'utility_parameter0', '0x00', 60, 660],
      ['beach_sand00_w_mt', 'utility_parameter0', '0x00', 60, 660],
      ['mgmen_ocean00_mt', 'utility_parameter0', '0x08', 30, 630],
      ['sand00_mt', 'utility_parameter0', '0x00', 60, 660],
    ]);
    ok(r.length === 0, `mgm01_sea00.fmab Repeat 커브 4개가 구간 앞뒤에서도 반복 ${r.join(' · ')}`);
    const bones: [string, number, number][] = ['pelvis', 'L_thigh', 'L_calf', 'L_foot', 'R_thigh', 'R_calf', 'R_foot', 'spine00', 'L_clavicle', 'L_upperarm', 'L_forearm', 'L_hand', 'attach_L_hand_mrr', 'L_hand_roll', 'R_clavicle', 'R_upperarm', 'R_forearm', 'R_hand', 'attach_R_hand_mrr', 'R_hand_roll', 'head', 'chin'].map((b) => [b, 0, 30]);
    const yoshi = join(BEA, 'chara~npc071.nx.bea/chara/npc/npc071_yoshi/model/npc071_yoshi.fmdb');
    for (const k of ['00', '01']) {
      const clip = `mgm04_result00_banana${k}_shake00a`;
      const glb = join(OUT, clip + '.glb');
      spawnSync(EXE, ['gltf', yoshi, glb, '--anim', join(BEA, 'mgm~mgm00.nx.bea/mgm/mgm00/model', clip + '.fskb')]);
      const rb = glbRepeatBad(glb, clip, bones);
      ok(rb.length === 0, `${clip}.fskb(뼈 23개 0~30f Repeat, 같은 뼈를 가진 요시 모델에 붙여 구움 — tail 은 요시에 없어 뺌)가 120f 내내 30f 주기 ${rb.slice(0, 3).join(' · ')}`);
    }
  }
}

console.log(fails ? `실패 ${fails}/${count}` : `통과 ${count}/${count}`);
process.exit(fails ? 1 : 0);
