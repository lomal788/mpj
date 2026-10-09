/**
 * 셸 화면 원본 BGM 시험(노드, 헤드리스 없음). 명세: docs/engine/04_sound.md §12.14.
 * 1) 화면별 원본 라벨 → bgm.json → 소스 wav·압축본(통파일·조각) 존재(404 0)
 * 2) 반복 값 = BFSTM 헤더(romfs/stream, 읽기만) — 프레임 수·loopStart·frameCount, 항구는 리전 REG_MAIN
 * 3) 화면 전환: 실제 AppBgm·MgmSound + 가짜 AudioContext — 이어 재생(같은 스트림)·새로 틀기·페이드 정지 시각 = 판독값(호출 지점 역어셈블 FadeTimePreset)
 * 4) 미리 받기: flowCatalog 'bgm:<라벨>' = 첫 조각 키, flowTable 이 화면 곡을 own/predict 로 가짐
 *
 *   npx tsx tools/test_shell_bgm.ts            (먼저 npm run assets)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bgmChunkKey, parseWav, planBgm, type BgmPlan, type BgmSource } from '@game/lib/bgmstream';
import { MGM_BGM_KIND, MgmSound } from '../script/shell/mgmcommon/sound';
import { AppBgm, type BgmSpecMap } from '../script/view/bgm';
import { flowKeys, normPath } from '../script/view/flowCatalog';
import { FLOW_TABLE } from '../script/view/flowTable';
import { BGM_SPEC_PATH, SCREEN_BGM } from '../script/view/screenBgm';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(WEB, '..');
const SRC = path.join(WEB, 'assets');
const DIST = path.join(WEB, 'assets-dist');
const STREAM = path.join(ROOT, 'extracted', 'romfs', 'stream');

let count = 0;
let fails = 0;
const ok = (cond: boolean, msg: string, detail = ''): void => {
  count++;
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}${detail ? `  — ${detail}` : ''}`);
};
const near = (a: number, b: number, e = 1e-9): boolean => Math.abs(a - b) <= e;

interface Entry {
  file: string;
  gain: number;
  rate: number;
  frames: number;
  loopStart?: number;
  loopEnd?: number;
}
const spec = JSON.parse(fs.readFileSync(path.join(SRC, BGM_SPEC_PATH), 'utf8')) as { bgm: Record<string, Entry> };
const index = JSON.parse(fs.readFileSync(path.join(DIST, 'index.json'), 'utf8')) as { lossy: string[]; names: Record<string, string>; streams: Record<string, BgmPlan> };
const base = BGM_SPEC_PATH.replace(/[^/]+$/, '');

// ================================================================ 1. 라벨 → 파일
console.log('\n# 1. 화면별 원본 라벨 → 명세 → 파일(소스·압축본)');
/** 화면이 트는 라벨(SCREEN_BGM.enter + 항구·프리 플레이 PlayBgm 종류 0·1·2·4·5) */
const LABELS: string[] = [...new Set<string>([...Object.values(SCREEN_BGM).map((r) => r.enter).filter((l): l is NonNullable<typeof l> => !!l), ...[0, 1, 2, 4, 5].map((k) => MGM_BGM_KIND[k] as string), 'SM_BGM_MENU_MAP'])];
const distHas = (rel: string): boolean => ['.ogg', '.m4a'].every((ext) => {
  const n = index.names[rel.replace(/\.wav$/, ext)];
  return !!n && fs.existsSync(path.join(DIST, n));
});
let missing = 0;
for (const l of LABELS) {
  const e = spec.bgm[l];
  if (!e) {
    ok(false, `${l} 명세 있음`);
    missing++;
    continue;
  }
  const rel = normPath(base + e.file);
  const srcOk = fs.existsSync(path.join(SRC, rel));
  const whole = index.lossy.includes(rel) && distHas(rel);
  const plan = index.streams[rel];
  const isBgm = /(^|_)BGM_/.test(l);
  const chunks = !isBgm || (!!plan && plan.chunks.every((_, i) => distHas(bgmChunkKey(rel, i))));
  if (!srcOk || !whole || !chunks) missing++;
  ok(srcOk && whole && chunks, `${l} → ${rel}`, `소스 ${srcOk ? 'O' : 'X'} 통파일 ${whole ? 'O' : 'X'} 조각 ${isBgm ? (plan ? `${plan.chunks.length}개` : 'X') : '해당 없음(징글)'}`);
}
ok(missing === 0, `없는 파일 0 (404 0)`, `라벨 ${LABELS.length}개`);
const cs = JSON.parse(fs.readFileSync(path.join(SRC, 'charselect/spec.json'), 'utf8')) as { bgm: { file: string; loopStart: number; loopEnd: number } };
ok(normPath('charselect/' + cs.bgm.file) === normPath(base + spec.bgm.SM_BGM_MENU_MAP.file), '캐릭터 선택 명세 bgm = 공용 SM_BGM_MENU_MAP.wav(한 파일)', cs.bgm.file);

// ================================================================ 2. 반복 = BFSTM 헤더
console.log('\n# 2. 반복 값 ↔ BFSTM 헤더');
function bfstm(file: string): { rate: number; loop: boolean; loopStart: number; frames: number; regions: Record<string, [number, number]> } {
  const b = fs.readFileSync(path.join(STREAM, `${file}.dspadpcm.bfstm`));
  const n = b.readUInt16LE(0x10);
  const blocks: Record<number, number> = {};
  for (let i = 0; i < n; i++) blocks[b.readUInt16LE(0x14 + 12 * i)] = b.readInt32LE(0x14 + 12 * i + 4);
  const body = blocks[0x4000] + 8;
  const si = body + b.readInt32LE(body + 4);
  const loop = b[si + 1] === 1;
  const rcount = b[si + 3];
  const rate = b.readUInt32LE(si + 4);
  const loopStart = b.readUInt32LE(si + 8);
  const frames = b.readUInt32LE(si + 12);
  const regions: Record<string, [number, number]> = {};
  if (rcount && blocks[0x4003] !== undefined) {
    const rsize = b.readUInt16LE(si + 0x38);
    const rofs = b.readInt32LE(si + 0x40);
    const r0 = blocks[0x4003] + 8 + rofs;
    for (let i = 0; i < rcount; i++) {
      const e = r0 + i * rsize;
      const name = b.subarray(e + 0xc0, e + 0x100).toString('latin1').split('\0')[0];
      regions[name] = [b.readUInt32LE(e), b.readUInt32LE(e + 4)];
    }
  }
  return { rate, loop, loopStart, frames, regions };
}
for (const l of LABELS) {
  const e = spec.bgm[l];
  if (!e) continue;
  const fl = e.file.replace(/\.wav$/, '');
  const h = bfstm(fl);
  const w = parseWav(fs.readFileSync(path.join(SRC, normPath(base + e.file))).buffer as ArrayBuffer);
  const want: [number, number] | null = l.endsWith('_JMP') ? (h.regions.REG_MAIN ?? null) : h.loop ? [h.loopStart, h.frames] : null;
  const got: [number, number] | null = typeof e.loopStart === 'number' && typeof e.loopEnd === 'number' ? [Math.round(e.loopStart * e.rate), Math.round(e.loopEnd * e.rate)] : null;
  const same = want === null ? got === null : !!got && got[0] === want[0] && got[1] === want[1];
  const distLoop = index.streams[normPath(base + e.file)]?.loop ?? null;
  const distSame = /(^|_)BGM_/.test(l) ? !!distLoop && !!want && distLoop[0] === want[0] && distLoop[1] === want[1] : true;
  ok(same && distSame && !!w && w.frames === h.frames && w.rate === h.rate && e.rate === h.rate, `${l} 반복 ${got ? got.join('→') : '없음'} = BFSTM ${want ? want.join('→') : '없음'}${l.endsWith('_JMP') ? '(리전 REG_MAIN)' : ''}`, `wav ${w?.frames} = ${h.frames} 표본, ${h.rate} Hz, 빌드 반복 ${distLoop ? distLoop.join('→') : '-'}`);
}
const GAIN: Record<string, number> = { SM_BGM_TITLE: 40, SM_BGM_MENU: 28, SM_BGM_MENU_MAP: 33, SM_BGM_MATCHING: 35, SM_JIN_MGMET_OPENING: 46, SM_BGM_MGMET_ENTRANCE_JMP: 29, SM_BGM_MGMET_ENTRANCE_NOINTRO_JMP: 29, SM_BGM_MGM01_FREEPLAY: 53, SM_JIN_MGM01_FREEPLAY_ENDSTINGER: 36 };
ok(Object.entries(GAIN).every(([l, v]) => near(spec.bgm[l]?.gain ?? -1, Math.round((v / 127) * 1e4) / 1e4)), 'gain = fspj 볼륨/127', Object.entries(GAIN).map(([l, v]) => `${l.replace(/^SM_(BGM|JIN)_/, '')} ${v}`).join(', '));

// ================================================================ 3. 화면 전환(가짜 AudioContext)
console.log('\n# 3. 화면 전환 — 이어 재생·새로 틀기·페이드 시각(판독값)');
type Ev = ['set' | 'ramp', number, number];
class FParam {
  events: Ev[] = [];
  constructor(public value: number) {}
  setValueAtTime(v: number, t: number): void {
    this.events.push(['set', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.events.push(['ramp', v, t]);
  }
  cancelScheduledValues(t: number): void {
    this.events = this.events.filter((e) => e[2] < t);
  }
}
class FGain {
  readonly gain: FParam;
  constructor(v = 1) {
    this.gain = new FParam(v);
  }
  connect(d: unknown): unknown {
    return d;
  }
  disconnect(): void {}
}
class FSrc {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  when = NaN;
  offset = 0;
  stopT = Infinity;
  connect(d: unknown): unknown {
    return d;
  }
  disconnect(): void {}
  start(when: number, offset: number): void {
    this.when = when;
    this.offset = offset;
  }
  stop(t: number): void {
    this.stopT = Math.min(this.stopT, t);
  }
}
class FCtx {
  currentTime = 0;
  state = 'running';
  readonly destination = {};
  readonly srcs: FSrc[] = [];
  readonly sampleRate = 48000;
  createBufferSource(): FSrc {
    const s = new FSrc();
    this.srcs.push(s);
    return s;
  }
  createGain(): FGain {
    return new FGain();
  }
}
const ctx = new FCtx();
/** 소스 = 명세의 프레임·반복으로 planBgm(빌드·런타임 공용) → 조각 길이만큼 빈 버퍼 */
const opened: { url: string; plan: BgmPlan }[] = [];
const source = (_c: AudioContext, url: string, loop: { startSec: number; endSec: number } | 'all' | null): BgmSource => {
  const e = Object.values(spec.bgm).find((x) => url.endsWith(`/${x.file}`))!;
  const lp: [number, number] | null = loop && loop !== 'all' ? [Math.round(loop.startSec * e.rate), Math.round(loop.endSec * e.rate)] : null;
  const plan = planBgm(e.frames, e.rate, 2, lp);
  opened.push({ url, plan });
  return {
    open: () => Promise.resolve(plan),
    load: (i) => {
      const c = plan.chunks[i];
      const len = c.pre + (c.end - c.start) + c.post;
      return Promise.resolve({ buffer: { length: len, numberOfChannels: 2, sampleRate: e.rate, duration: len / e.rate }, offset: c.pre / e.rate });
    },
  };
};
const specMap: BgmSpecMap = Object.fromEntries(Object.entries(spec.bgm).map(([k, v]) => [k, { ...v, url: `assets/${base}${v.file}` }]));
const bgm = new AppBgm({ ctx: () => ctx as unknown as AudioContext, spec: () => Promise.resolve(specMap), source });
const flush = async (): Promise<void> => {
  for (let k = 0; k < 4; k++) await new Promise((r) => setImmediate(r));
};
const streams = new Set<NonNullable<typeof bgm.ch.stream>>();
const pumpAll = (): void => {
  if (bgm.ch.stream) streams.add(bgm.ch.stream);
  for (const s of streams) s.pump();
};
const advance = async (sec: number): Promise<void> => {
  const end = ctx.currentTime + sec;
  while (ctx.currentTime < end - 1e-9) {
    await flush();
    pumpAll();
    ctx.currentTime = Math.min(end, ctx.currentTime + 0.1);
  }
  await flush();
  pumpAll();
};
/** 지금 스트림의 페이드 정지 기록: out 이득 ramp → 0 끝 시각, 노드 stop 시각 */
const fadeOf = (s: NonNullable<typeof bgm.ch.stream>): { at: number; end: number } | null => {
  const ev = (s.out.gain as unknown as FParam).events;
  const r = ev.find((e) => e[0] === 'ramp' && e[1] === 0);
  const set = ev.find((e) => e[0] === 'set');
  return r && set ? { at: set[2], end: r[2] } : null;
};
interface Step {
  name: string;
  run(): Promise<void> | void;
  /** 판독 페이드 초(이 단계에서 앞 곡이 이만큼 페이드), 0 = 즉시 끊김(PlayBgm Stop_Time(0)), undefined = 앞 곡을 건드리지 않음 */
  fade?: number;
  /** 이 단계 뒤 틀려 있어야 할 라벨, 같은 스트림이 이어져야 하면 continue */
  label: string | null;
  cont?: boolean;
}
const mgm = new MgmSound({}, (p) => p, bgm.hooks(false));
const STEPS: Step[] = [
  { name: '인원 설정 시작(SequenceFront, TITLE)', run: () => bgm.enter('setplayer'), label: 'SM_BGM_TITLE' },
  { name: '인원 설정 끝 → ~SequenceFront StopBgmTitle(2)', run: () => bgm.exit('setplayer', 'done'), fade: 0.7, label: null },
  { name: '광장 시작 PlayBgmMenu', run: () => bgm.enter('plaza'), label: 'SM_BGM_MENU' },
  { name: '광장 다시 시작(상점 복귀 등 — 이미 돌면 그대로)', run: () => bgm.enter('plaza'), label: 'SM_BGM_MENU', cont: true },
  { name: '기구 TakeOffImpl StopBgm(2)', run: () => bgm.exit('plaza', 'balloon'), fade: 0.7, label: null },
  { name: '모드 선택 Initialize PlayBgm', run: () => bgm.enter('modeselect'), label: 'SM_BGM_MENU_MAP' },
  { name: '캐릭터 선택(menu01 같은 장면 — 이어 재생)', run: () => bgm.enter('charselect'), label: 'SM_BGM_MENU_MAP', cont: true },
  { name: '캐릭터 선택 취소(이어 재생)', run: () => bgm.exit('charselect', 'cancel'), label: 'SM_BGM_MENU_MAP', cont: true },
  { name: '파티 규칙(이어 재생)', run: () => bgm.enter('partyrule'), label: 'SM_BGM_MENU_MAP', cont: true },
  { name: '파티 규칙 뒤로(이어 재생)', run: () => bgm.exit('partyrule', 'back'), label: 'SM_BGM_MENU_MAP', cont: true },
  { name: '모드 결정 StartAnimImpl StopBgm(6)', run: () => bgm.exit('modeselect', 'decided'), fade: 0.5, label: null },
  { name: '항구 InitOp PlayBgm(0) 오프닝 징글', run: () => void mgm.playBgm(0), label: 'SM_JIN_MGMET_OPENING' },
  { name: '항구 StartEventFlow PlayBgm(1) — 징글 즉시 끊음', run: () => void mgm.playBgm(1), fade: 0, label: 'SM_BGM_MGMET_ENTRANCE_JMP' },
  { name: '프리 플레이 출발 FreeplayAfterFlow StopBgm(2)', run: () => mgm.stopBgm(2), fade: 0.7, label: null },
  { name: 'mgm01 StartFlow PlayBgm(4)', run: () => void mgm.playBgm(4), label: 'SM_BGM_MGM01_FREEPLAY' },
  { name: 'mgm01 MgStartFlow StopBgm(3)', run: () => mgm.stopBgm(3), fade: 0.2, label: null },
  { name: 'mgm01 MgStartFlow PlayBgm(5) 징글', run: () => void mgm.playBgm(5), label: 'SM_JIN_MGM01_FREEPLAY_ENDSTINGER' },
  { name: '한 판 뒤 ContinueFlow PlayBgm(4) — 처음부터', run: () => void mgm.playBgm(4), fade: 0, label: 'SM_BGM_MGM01_FREEPLAY' },
  { name: 'mgm01 ExitFlow StopBgm(2)', run: () => mgm.stopBgm(2), fade: 0.7, label: null },
  { name: '항구 선택 대기 IsPlayBgm 거짓 → PlayBgm(2) NOINTRO', run: () => void (!mgm.isPlayBgm() && mgm.playBgm(2)), label: 'SM_BGM_MGMET_ENTRANCE_NOINTRO_JMP' },
  { name: '항구 떠남 CleanupScene Stop_Preset(2)', run: () => bgm.exit('mgmet', 'leave'), fade: 0.7, label: null },
  { name: '전 세계 매칭 GameFlow', run: () => bgm.enter('onlineWorld'), label: 'SM_BGM_MATCHING' },
  { name: '매칭 끝 CleanupGame Stop_Preset(2)', run: () => bgm.exit('onlineWorld', 'done'), fade: 0.7, label: null },
  { name: '광장(세션 출발 PlaySessionFiber StopBgm(6))', run: () => bgm.enter('plaza'), label: 'SM_BGM_MENU' },
  { name: '세션 출발', run: () => bgm.exit('plaza', 'session'), fade: 0.5, label: null },
];
for (const st of STEPS) {
  const before = bgm.ch.stream;
  const beforeSrcs = ctx.srcs.slice();
  const nSrc = opened.length;
  const nNode = ctx.srcs.length;
  const t = ctx.currentTime;
  await st.run();
  await advance(2);
  const now = bgm.ch.stream;
  const lab = bgm.ch.alive() ? bgm.ch.label : null;
  const parts: string[] = [];
  let pass = lab === st.label;
  if (st.cont) {
    pass &&= now === before && opened.length === nSrc;
    parts.push(now === before ? '같은 스트림 이어짐' : '새 스트림(틀림)');
  } else if (st.label) {
    const first = ctx.srcs[nNode];
    const pre = now?.plan?.chunks[0].pre ?? -1;
    pass &&= now !== before && opened.length === nSrc + 1 && !!first && near(first.offset, pre / 48000) && near(first.when, t + 0.06, 1 / 48000 + 1e-9);
    parts.push(`새로 처음부터(조각 0 offset ${first ? Math.round(first.offset * 48000) : '-'} = 패드, 시작 ${first ? (first.when - t).toFixed(3) : '-'} s 뒤)`);
  }
  if (st.fade !== undefined && before) {
    if (st.fade === 0) {
      const live = beforeSrcs.filter((x) => x.stopT > t + 1e-9 || x.stopT === Infinity);
      const stopMax = Math.max(...beforeSrcs.filter((x) => x.when <= t).map((x) => x.stopT));
      pass &&= !before.alive() && near(stopMax, t, 1e-6);
      parts.push(`앞 곡 즉시 끊김(울리던 노드 멈춤 @+${(stopMax - t).toFixed(3)} s, 남은 예약 ${live.length - beforeSrcs.filter((x) => x.when > t).length})`);
    } else {
      const f = fadeOf(before);
      pass &&= !!f && near(f.at, t) && near(f.end - f.at, st.fade, 1e-9) && !before.alive();
      parts.push(`앞 곡 페이드 ${f ? (f.end - f.at).toFixed(3) : '-'} s (판독 ${st.fade} s)`);
    }
  }
  ok(pass, st.name, `${lab ?? '없음'} — ${parts.join(', ')}`);
}
const ent = opened.find((o) => o.url.endsWith('SM_BGM_MGMET_ENTRANCE_JMP.wav'))!;
ok(!!ent && ent.plan.loop?.[0] === 176883 && ent.plan.loop?.[1] === 2303656, '항구 곡 배치 반복 = REG_MAIN [176883, 2303656)', JSON.stringify(ent?.plan.loop));
bgm.stop(0);

// ================================================================ 4. 미리 받기
console.log('\n# 4. 미리 받기 — bgm:<라벨> = 첫 조각 키, flowTable');
const readJson = <T,>(k: string): Promise<T> => Promise.resolve(JSON.parse(fs.readFileSync(path.join(SRC, k), 'utf8')) as T);
const bgmKey = (k: string): string => (index.streams[k] ? bgmChunkKey(k, 0) : k);
for (const l of ['SM_BGM_TITLE', 'SM_BGM_MENU', 'SM_BGM_MENU_MAP', 'SM_BGM_MATCHING', 'SM_JIN_MGMET_OPENING', 'SM_BGM_MGMET_ENTRANCE_JMP', 'SM_BGM_MGM01_FREEPLAY', 'SM_JIN_MGM01_FREEPLAY_ENDSTINGER']) {
  const keys = (await flowKeys(`bgm:${l}`, readJson, { gltfTextures: true, bgmKey })) ?? [];
  const rel = normPath(base + spec.bgm[l].file);
  const want = bgmKey(rel);
  const has = keys.some(([k, kind]) => k === want && kind === 'bytes');
  const exists = want.endsWith('.wav') && want.includes('.bgm/') ? distHas(want) : fs.existsSync(path.join(SRC, want));
  ok(has && exists, `bgm:${l} → ${want}`, `${keys.length}키, 파일 ${exists ? '있음' : '없음'}`);
}
const ownOf = (s: keyof typeof FLOW_TABLE): string[] => [...FLOW_TABLE[s].own, ...FLOW_TABLE[s].predict.map((p) => p.bundle), ...Object.values(FLOW_TABLE[s].states ?? {}).flat().map((p) => p.bundle)];
const TABLE: [keyof typeof FLOW_TABLE, string[]][] = [
  ['setplayer', ['bgm:SM_BGM_TITLE', 'bgm:SM_BGM_MENU']],
  ['plaza', ['bgm:SM_BGM_MENU', 'bgm:SM_BGM_MENU_MAP']],
  ['modeselect', ['bgm:SM_BGM_MENU_MAP', 'bgm:SM_JIN_MGMET_OPENING', 'bgm:SM_BGM_MGMET_ENTRANCE_JMP']],
  ['mgmet', ['bgm:SM_JIN_MGMET_OPENING', 'bgm:SM_BGM_MGMET_ENTRANCE_JMP', 'bgm:SM_BGM_MGM01_FREEPLAY']],
  ['mgm01', ['bgm:SM_BGM_MGM01_FREEPLAY', 'bgm:SM_JIN_MGM01_FREEPLAY_ENDSTINGER']],
  ['charselect', []],
];
for (const [s, want] of TABLE) {
  const got = ownOf(s);
  ok(want.every((w) => got.includes(w)), `flowTable ${s} 에 ${want.length ? want.join(', ') : '(charselect:sound 가 MENU_MAP 첫 조각)'}`);
}
const csKeys = (await flowKeys('charselect:sound', readJson, { gltfTextures: true, bgmKey })) ?? [];
ok(csKeys.some(([k]) => k === bgmKey('common/sound/SM_BGM_MENU_MAP.wav')), 'charselect:sound = 공용 SM_BGM_MENU_MAP 첫 조각(모드 선택과 같은 키)');

console.log(`\n${count - fails}/${count} 통과${fails ? ` — 실패 ${fails}` : ''}`);
process.exit(fails ? 1 : 0);
