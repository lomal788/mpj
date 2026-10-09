/**
 * 공용 저장 시험(노드, 헤드리스 없음) — docs/engine/16_save.md.
 * 1) 코어 문서 구조  2) 버전·마이그레이션(옛 키 3종 → mpj.save)  3) 요청 수명(처리 중·완료·한 번 쓰기·SaveRequestFiber)
 * 4) 저장소 실패 때 계속 동작  5) 허브↔목록 공유(첫 안내·opSkip·플레이한 수)  6) 플레이 횟수 commit(단계 11 사람별)·mgrun save 사건
 * 7) 결정성(저장 고리 있음/없음 로직 같음)  8) 메시지 속도(MessageWindow 글자 진행)·가이드 setter  9) import 경계
 *
 *   npx tsx tools/test_save.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mg1801Game } from '../script/games/mg1801';
import { MemoryStorage, SaveCore, saveRequestFiber, type SaveSectionDef } from '../script/lib/save';
import { LocalStorageSave, type WebStorageLike } from '../script/lib/save-localstorage';
import { createMgRun, freePlaySetup, type MgRunSave } from '../script/mgrun';
import type { Render2D } from '../script/shell/charselect/render2d';
import { LayoutInst } from '../script/shell/charselect/scene2d';
import type { Spec } from '../script/shell/charselect/types';
import { MemorySave, MessageWindow, MgmSound, MODE_FLAG, MG_FLAG, playedCount, setMessageSpeedSource, type MgmDrawHost, type MgmSpec } from '../script/shell/mgmcommon';
import { commitPlayCount, settlePlayResult } from '../script/shell/mgm01';
import { consumeNew, setupPlayData } from '../script/shell/mgm01/announce';
import { createWork } from '../script/shell/mgmcommon';
import { localGate } from '../script/shell/mgscene';
import { createMpjSave, guideMessageSpeedCursor, guideMessageSpeedValue, LEGACY_KEYS, mgRunSaveHooks, SAVE_KEY, setGuideMessageSpeed } from '../script/view/save';
import { resolveFontsFromDisk } from './fontSpecNode';
import { stableText } from './mg_determinism';
import { nodeMgAssets } from './mg_node_host';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
let bad = 0;
const ok = (c: boolean, msg: string, d = ''): void => {
  n++;
  if (!c) bad++;
  console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}${d ? `  — ${d}` : ''}`);
};
const manual = { schedule: (): void => {} };

interface Num {
  v: number;
}
const NUM: SaveSectionDef<Num> = { name: 'num', defaults: () => ({ v: 7 }), normalize: (r) => ({ v: typeof (r as Num)?.v === 'number' ? (r as Num).v : 7 }) };

console.log('1. 코어 문서 구조');
{
  const st = new MemoryStorage(JSON.stringify({ format: 't', version: 1, sections: { num: { v: 3 }, other: { keep: true } } }));
  const c = new SaveCore({ format: 't', version: 1, storage: st, ...manual });
  const num = c.register(NUM);
  const rep = c.load();
  ok(rep.source === 'storage' && num.get().v === 3, '읽은 섹션 값', JSON.stringify(rep));
  ok(!c.dirty(), '읽은 그대로면 변경 없음');
  num.get().v = 4;
  ok(c.dirty(), '살아 있는 값 수정 → 변경 감지');
  const doc = JSON.parse(c.serialize());
  ok(doc.format === 't' && doc.version === 1 && doc.sections.num.v === 4 && doc.sections.other.keep === true, '직렬화: format·version·섹션, 모르는 섹션 보존', c.serialize());
  ok(st.writes === 0, '요청 전에는 쓰지 않는다(원본: 메모리 → SaveRequest 때 기록)');
  const c2 = new SaveCore({ format: 't', version: 1, storage: new MemoryStorage(JSON.stringify({ format: 't', version: 1, sections: { num: 'bad' } })), ...manual });
  c2.load();
  ok(c2.register(NUM).get().v === 7, 'load 뒤 등록·모양 틀린 값 → 기본값');
  let dup = false;
  try {
    c2.register(NUM);
  } catch {
    dup = true;
  }
  ok(dup, '같은 섹션 두 번 등록 = 오류');
}

console.log('2. 버전·마이그레이션');
{
  const st = new MemoryStorage(JSON.stringify({ format: 't', version: 1, sections: { old: { x: 5 } } }));
  const c = new SaveCore({ format: 't', version: 2, storage: st, ...manual, migrations: [{ from: 1, run: (s) => ({ num: { v: (s.old as { x: number }).x * 2 } }) }] });
  const num = c.register(NUM);
  const rep = c.load();
  ok(rep.migrated === 1 && num.get().v === 10 && c.isProcessing(), '판 1 → 2 마이그레이션, 끝나면 바로 쓰기 요청', JSON.stringify(rep));
  c.process();
  ok(JSON.parse(st.text!).version === 2 && st.writes === 1, '새 판으로 기록');
  const newer = new MemoryStorage(JSON.stringify({ format: 't', version: 9, sections: { num: { v: 1 } } }));
  const cn = new SaveCore({ format: 't', version: 2, storage: newer, ...manual });
  const nn = cn.register(NUM);
  ok(cn.load().source === 'newer' && nn.get().v === 7 && cn.lastError?.phase === 'version', '새 판 문서: 기본값·오류 version');
  cn.request();
  ok(cn.process() === 'blocked' && newer.writes === 0 && !cn.isProcessing(), '새 판 문서는 덮어쓰지 않는다(blocked)');
  const corrupt = new MemoryStorage('{broken');
  const cc = new SaveCore({ format: 't', version: 2, storage: corrupt, ...manual });
  cc.register(NUM);
  ok(cc.load().source === 'corrupt' && cc.lastError?.phase === 'parse', '깨진 문서: corrupt·오류 parse');
  cc.request();
  ok(cc.process() === 'written' && JSON.parse(corrupt.text!).format === 't' && cc.lastError === null, '다음 요청 때 덮어씀, 오류 해소');

  const legacy: Record<string, string> = {
    [LEGACY_KEYS.prefs]: JSON.stringify({ game: 'mg1801', com: [false, false, true, true], muted: true, options: { mg1801: { mode: '2' } } }),
    [LEGACY_KEYS.mgm01]: JSON.stringify({ modeFlags: 13, mg: [[101, { head: 3, flags: 4 }], [7, { head: 0, flags: 1 }]] }),
    [LEGACY_KEYS.menuData0]: '1',
  };
  const ms = new MemoryStorage(null);
  const read: string[] = [];
  const s = createMpjSave(ms, { ...manual, readKey: (k) => (read.push(k), legacy[k] ?? null) });
  ok(s.core.loadReport?.source === 'legacy' && s.core.loadReport.version === 0 && s.core.loadReport.migrated === 1, '새 키 없음 → 옛 키 3종(판 0) → 판 1', JSON.stringify(s.core.loadReport));
  ok(s.run.get().game === 'mg1801' && (s.run.get().com as boolean[]).join() === 'false,false,true,true' && s.run.get().muted === true, 'jamboree-web/prefs → run');
  ok(s.mgm.modeFlags === 13 && s.mgm.minigame(101).head === 3 && s.mgm.minigame(101).flags === 4 && s.mgm.minigame(7).flags === 1, 'mpj.mgm01.save → minigameMode·minigame');
  ok(s.plaza.menuBit(0), 'mpj.plaza.menuData0 → menu 비트 0');
  ok(s.isProcessing(), '옮긴 뒤 바로 쓰기 요청');
  s.core.process();
  const doc = JSON.parse(ms.text!);
  ok(doc.format === 'mpj.save' && doc.version === 1 && doc.sections.minigame['101'].join() === '3,4' && doc.sections.menu.bits.join() === '0' && doc.sections.system.messageSpeed === 0, '새 문서 하나(mpj.save)', ms.text!);
  ok(Object.keys(legacy).length === 3 && legacy[LEGACY_KEYS.menuData0] === '1', '옛 키는 지우지 않는다');
  read.length = 0;
  const s2 = createMpjSave(ms, { ...manual, readKey: (k) => (read.push(k), legacy[k] ?? null) });
  ok(s2.core.loadReport?.source === 'storage' && read.length === 0 && s2.mgm.minigame(101).head === 3, '새 문서가 있으면 옛 키를 다시 읽지 않는다');
  const empty = createMpjSave(new MemoryStorage(null), { ...manual, readKey: () => null });
  ok(empty.core.loadReport?.source === 'empty' && empty.messageSpeed() === 0 && empty.system.get().messageSpeed === 0, '아무것도 없음: 메시지 속도 기본 0(원본 새 세이브 FUN_710023e890 memset)');
}

console.log('3. 요청 수명');
{
  const st = new MemoryStorage(null);
  const q: (() => void)[] = [];
  const c = new SaveCore({ format: 't', version: 1, storage: st, schedule: (f) => q.push(f) });
  const num = c.register(NUM);
  c.load();
  ok(!c.isProcessing(), '처음: 처리 중 아님');
  num.get().v = 1;
  c.request();
  c.request();
  c.request();
  ok(c.isProcessing() && q.length === 1 && c.stats.requests === 3, '요청 3번 → 처리 중, 처리 예약 1번');
  q.shift()!();
  ok(!c.isProcessing() && st.writes === 1 && c.lastResult === 'written', '처리 → 한 번 쓰기, 처리 끝');
  c.request();
  q.shift()!();
  ok(c.lastResult === 'unchanged' && st.writes === 1, '바뀐 것 없음 → 쓰지 않음(unchanged)');
  num.get().v = 2;
  const fib = saveRequestFiber(c);
  let frames = 0;
  while (!fib.next().done) {
    frames++;
    if (q.length) q.shift()!();
  }
  ok(frames === 1 && st.writes === 2 && JSON.parse(st.text!).sections.num.v === 2, 'SaveRequestFiber: 요청 → 처리 중인 동안 yield → 끝', `${frames}`);
  const ms = new MemorySave();
  ms.requestSave();
  ok(ms.saveRequests === 1 && !ms.isProcessing(), '기본 MemorySave(메모리 칸): 요청 수만 센다');
}

console.log('4. 저장소 실패');
{
  const st = new MemoryStorage(null);
  st.failRead = true;
  const s = createMpjSave(st, { ...manual, readKey: () => null });
  ok(s.core.loadReport?.source === 'readError' && s.core.lastError?.phase === 'read', '읽기 실패(사생활 모드 등) → 메모리 동작·오류 read');
  s.mgm.modeFlags |= MODE_FLAG.OP_SKIP;
  st.failWrite = true;
  s.mgm.requestSave();
  ok(s.isProcessing(), '요청 → 처리 중');
  s.core.process();
  ok(!s.isProcessing() && s.core.lastResult === 'error' && s.core.lastError?.phase === 'write' && s.core.stats.errors === 1, '쓰기 실패 → 처리 끝(대기가 멈추지 않음)·오류 write');
  ok((s.mgm.modeFlags & MODE_FLAG.OP_SKIP) !== 0, '메모리 값은 그대로 계속 쓴다');
  st.failWrite = false;
  s.mgm.requestSave();
  s.core.process();
  ok(s.core.lastResult === 'written' && JSON.parse(st.text!).sections.minigameMode.flags === 1, '다음 요청에서 다시 써서 성공');

  const quota: WebStorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  const ls = new LocalStorageSave(SAVE_KEY, () => quota);
  const s2 = createMpjSave(ls, { ...manual, readKey: (k) => ls.readKey(k) });
  s2.system.get().messageSpeed = 2;
  s2.request();
  s2.core.process();
  ok(s2.core.lastResult === 'error' && ls.memory !== null && JSON.parse(ls.memory).sections.system.messageSpeed === 2 && s2.messageSpeed() === 2, '할당량 초과: 오류 기록, 메모리 글·값 유지');
  const none = new LocalStorageSave(SAVE_KEY, () => null);
  const s3 = createMpjSave(none, { ...manual, readKey: (k) => none.readKey(k) });
  ok(s3.core.loadReport?.source === 'readError' && none.readKey('x') === null, 'localStorage 없음(노드) → readError, 옛 키 읽기는 null');
  const blocked: WebStorageLike = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
  };
  const lb = new LocalStorageSave(SAVE_KEY, () => blocked);
  ok(createMpjSave(lb, { ...manual, readKey: (k) => lb.readKey(k) }).core.loadReport?.source === 'readError', '접근 차단(SecurityError) → readError, 예외가 밖으로 나가지 않음');
  const real: Record<string, string> = {};
  const fine = new LocalStorageSave(SAVE_KEY, () => ({ getItem: (k) => real[k] ?? null, setItem: (k, v) => void (real[k] = v) }));
  const s4 = createMpjSave(fine, { ...manual, readKey: (k) => fine.readKey(k) });
  s4.request();
  s4.core.process();
  ok(Object.keys(real).join() === SAVE_KEY, `키 하나만 쓴다(${SAVE_KEY})`);
}

console.log('5. 허브↔목록 공유');
{
  const st = new MemoryStorage(null);
  const s = createMpjSave(st, { ...manual, readKey: () => null });
  const hubSave = s.mgm;
  const listSave = s.mgm;
  ok(hubSave === listSave, '허브와 목록이 같은 MemorySave 인스턴스');
  hubSave.modeFlags |= MODE_FLAG.OP_SKIP;
  hubSave.requestSave();
  hubSave.modeFlags |= MODE_FLAG.FIRST_HOWTO_MGM01;
  hubSave.requestSave();
  const work = createWork();
  ok(setupPlayData(listSave, work, [101, 7, 3]), '목록 첫 준비(SetupPlayData): NEW·비트 4·요청');
  consumeNew(work, listSave, 7);
  listSave.setMinigame(101, { head: 2, flags: listSave.minigame(101).flags | MG_FLAG.FAVORITE });
  ok(s.core.stats.requests === 3, '요청 3번(opSkip·첫 안내·준비), NEW 끔·즐겨찾기는 요청 없음(원본 §1.3)', `${s.core.stats.requests}`);
  s.core.process();
  const again = createMpjSave(st, { ...manual, readKey: () => null }).mgm;
  ok((again.modeFlags & (MODE_FLAG.OP_SKIP | MODE_FLAG.FIRST_HOWTO_MGM01 | MODE_FLAG.MGM01_SETUP)) === 13, '다시 읽기: opSkip·첫 안내·준비 비트 유지', `${again.modeFlags}`);
  ok(again.minigame(101).head === 2 && (again.minigame(101).flags & MG_FLAG.FAVORITE) !== 0 && (again.minigame(7).flags & MG_FLAG.NEW) === 0, '마지막 요청 뒤 메모리 변경(NEW 끔·즐겨찾기)도 다음 요청 때 같이 기록됨');
  ok(playedCount(again, [101, 7, 3]) === 1, '허브의 플레이한 수(head≠0)도 같은 저장에서');
}

await mg1801Game.load?.();
console.log('6. 플레이 횟수 commit');
{
  const s = createMpjSave(new MemoryStorage(null), { ...manual, readKey: () => null });
  const players = [
    { pid: 0, isCom: false, gamePlay: true },
    { pid: 1, isCom: false, gamePlay: true },
    { pid: 2, isCom: true, gamePlay: true },
    { pid: 3, isCom: false, gamePlay: false },
  ];
  const others = new MemorySave();
  ok(commitPlayCount((p) => (p === 0 ? s.mgm : p === 3 ? others : null), 101, players) === 1 && s.mgm.minigame(101).head === 1 && others.minigame(101).head === 0, '사람·참가·세이브 있는 칸만 +1(CPU·불참·손님 제외, FUN_71002db9f0)');
  s.mgm.setMinigame(101, { head: 999, flags: 0 });
  commitPlayCount(() => s.mgm, 101, players.slice(0, 1));
  ok(s.mgm.minigame(101).head === 999, '999 상한');
  const fresh = new MemorySave();
  const e = { id: 101, judge: 1, results: [2, 2, 2, 2] as [number, number, number, number] };
  ok(settlePlayResult(fresh, 101, true, e, () => e, true) === e && fresh.minigame(101).head === 0, '장면이 센 실제 결과는 목록이 다시 세지 않음(countedByScene)');

  const hooksLog: string[] = [];
  const mpj = createMpjSave(new MemoryStorage(null), { ...manual, readKey: () => null });
  const real = mgRunSaveHooks(mpj, 101);
  const hooks: MgRunSave = {
    playCount: (p) => {
      hooksLog.push(`count:${p.length}`);
      real.playCount(p);
    },
    request: () => {
      hooksLog.push('request');
      real.request();
    },
  };
  const run = (save?: MgRunSave): { hashes: string[]; stages: number[] } => {
    const r = { id: 101, cpu: 2, endless: false, rhythm: 0, useGyro: false, callInst: false, team: { teamIdByPid: [0, 0, 0, 0], gamePlayByPid: [true, true, true, true] } };
    const fp = freePlaySetup(r, ['pc05', 'pc02', 'pc13', 'pc51'], [false, true, true, true]);
    const { tables, ui } = nodeMgAssets();
    const pads = [null, null, null, null];
    const m = createMgRun({ def: mg1801Game, setup: { players: fp.players, seed: 5, practice: false, options: {} }, tables, ui, gate: localGate(() => pads), play: fp.play, endless: fp.endless, save });
    const hashes: string[] = [];
    const stages: number[] = [];
    for (let f = 0; f < 6000 && !m.ended; f++) {
      const st = m.scene.stage;
      m.tick(null);
      if (m.scene.events.some((x) => x.k === 'save')) stages.push(st);
      hashes.push(stableText([m.scene.stage, m.scene.events, (m.logic as unknown as { state: unknown }).state, f % 60 === 0 ? (m.logic as unknown as { game: unknown }).game : null]));
    }
    hashes.push(stableText(m.logic.result));
    return { hashes, stages };
  };
  const a = run(hooks);
  ok(a.stages.join() === '11,16', 'save 사건: 단계 11·16 각 1번', a.stages.join());
  ok(hooksLog.join() === 'count:4,request', '단계 11 → 플레이 횟수(참가자 넘김), 단계 16 → SaveRequest', hooksLog.join());
  ok(mpj.mgm.minigame(101).head === 1 && mpj.isProcessing(), '1P(사람·칸 0)만 +1, 저장 요청 처리 중');
  console.log('7. 결정성(저장은 로직에 영향 없음)');
  const b = run(undefined);
  const diff = a.hashes.findIndex((h, i) => h !== b.hashes[i]);
  ok(a.hashes.length === b.hashes.length && diff < 0, `저장 고리 있음/없음 틱별 로직 상태 같음(${a.hashes.length} 틱)`, `첫 차이 ${diff}`);
  const mgrunSrc = readFileSync(join(WEB, 'script/mgrun.ts'), 'utf8');
  ok(!/save\.(playCount|request)\([^)]*\)\s*[;,]?\s*(?:return|logic\.|scene\.)/.test(mgrunSrc) && !/=\s*init\.save/.test(mgrunSrc), 'mgrun: 저장 고리 반환값을 로직에 넣지 않음');
}

console.log('8. 메시지 속도');
{
  const spec = JSON.parse(readFileSync(join(WEB, 'assets/mgmcommon/spec.json'), 'utf8')) as MgmSpec;
  await resolveFontsFromDisk(spec.fonts as Record<string, unknown>, join(WEB, 'assets/mgmcommon'));
  const all = spec as unknown as Spec;
  const host: MgmDrawHost = { all, spec, r2d: null as unknown as Render2D, layout: (nm) => new LayoutInst(nm, spec.layouts[nm], all), draw: () => {} };
  const input = { trigOf: () => 0, isCom: () => false };
  const DT = Math.fround(1 / 60);
  const firstChar = (mw: MessageWindow): number => {
    mw.setMessageLabel('mgmet_entFirst_mw_guide01');
    mw.start();
    for (let f = 0; f <= 60; f++) {
      if ((mw.st.typer?.visible ?? 0) > 0) return f;
      mw.update(DT);
    }
    return -1;
  };
  const s = createMpjSave(new MemoryStorage(null), { ...manual, readKey: () => null });
  setMessageSpeedSource(() => s.messageSpeed());
  const typerOf = (mw: MessageWindow): { interval?: number } => mw.st.typer as unknown as { interval?: number };
  const w0 = new MessageWindow(host, input, new MgmSound(spec.sounds, (p) => p));
  const f0 = firstChar(w0);
  ok(w0.st.speed === 0 && Math.abs((typerOf(w0).interval ?? 0) - 0.05) < 1e-6, '기본 0: 글자 간격 0.05 s', `첫 글자 틱 ${f0}`);
  s.system.get().messageSpeed = 2;
  const w2 = new MessageWindow(host, input, new MgmSound(spec.sounds, (p) => p));
  const f2 = firstChar(w2);
  ok(w2.st.speed === 2 && Math.abs((typerOf(w2).interval ?? 0) - 0.1) < 1e-6 && f2 > f0, '저장값 2: 생성 때 원천 값 → 0.1 s(첫 글자가 늦다)', `${f0} → ${f2}`);
  s.system.get().messageSpeed = 1;
  w0.update(DT);
  ok(w0.st.speed === 1, '값이 바뀌면 이미 있는 창도 다음 update 에서 원천 값(다음 페이지 시작부터 적용 = 원본 페이지마다 읽기)');
  const w1 = new MessageWindow(host, input, new MgmSound(spec.sounds, (p) => p));
  w1.setMessageLabel('mgmet_entFirst_mw_guide01');
  w1.start();
  ok(w1.st.typer?.visible === w1.st.typer?.length && !w1.st.typer?.typing, '저장값 1: 페이지 시작 즉시 전부');
  const wf = new MessageWindow(host, input, new MgmSound(spec.sounds, (p) => p));
  wf.setSpeed(2);
  wf.update(DT);
  ok(wf.st.speed === 2, 'setSpeed = 창별 덮어쓰기(원본 +0x90/+0x94), 원천보다 우선');
  s.system.get().messageSpeed = 7;
  ok(s.messageSpeed() === 0, '그 밖 원값 → 0.05 s 동작(FUN_7100322e40: 2·1 아니면 0.05)');
  setMessageSpeedSource(null);

  ok([0, 1, 2, 7].map(guideMessageSpeedCursor).join() === '1,0,2,0', '가이드 초기 커서 역매핑 0→1·1→0·2→2(그 밖 0)');
  ok([0, 1, 2].map(guideMessageSpeedValue).join() === '1,0,2', '가이드 결과 → 저장값 r==2?2:(r!=1)');
  const st = new MemoryStorage(null);
  const g = createMpjSave(st, { ...manual, readKey: () => null });
  const fib = setGuideMessageSpeed(g, 2);
  let yields = 0;
  while (!fib.next().done) {
    yields++;
    g.core.process();
  }
  ok(g.system.get().messageSpeed === 2 && yields === 1 && JSON.parse(st.text!).sections.system.messageSpeed === 2, '가이드 결정 → +0x74 쓰기 → SaveRequestFiber(처리 끝까지 대기) → 기록');
}

console.log('9. import 경계');
{
  const imports = (file: string): string[] => [...readFileSync(file, 'utf8').matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);
  const core = imports(join(WEB, 'script/lib/save/index.ts'));
  ok(core.length === 0, 'lib/save 코어 import 0', core.join());
  const ad = imports(join(WEB, 'script/lib/save-localstorage/index.ts'));
  ok(ad.length === 1 && ad[0] === '../save', 'lib/save-localstorage 는 ../save 만', ad.join());
  const coreSrc = readFileSync(join(WEB, 'script/lib/save/index.ts'), 'utf8');
  ok(!/localStorage|document\.|window\.|mpj|Mgm|MessageWindow/.test(coreSrc.replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '')), '코어 본문에 매체·DOM·mpj 이름 없음');
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []));
  const shellBad = walk(join(WEB, 'script/shell')).filter((f) => imports(f).some((s) => /lib\/save|view\/save/.test(s)));
  ok(shellBad.length === 0, '셸은 저장 모듈을 import 하지 않는다(구조 인터페이스로만)', shellBad.join());
  const ls = walk(join(WEB, 'script')).filter((f) => !f.includes('lib/save-localstorage') && !f.includes('lib\\save-localstorage') && /localStorage\s*\.\s*(getItem|setItem)/.test(readFileSync(f, 'utf8')));
  ok(ls.length === 0, 'localStorage 직접 접근은 어댑터 하나뿐', ls.map((f) => f.slice(WEB.length + 1)).join());
}

console.log(`\n${n - bad}/${n} 통과`);
process.exitCode = bad ? 1 : 0;
