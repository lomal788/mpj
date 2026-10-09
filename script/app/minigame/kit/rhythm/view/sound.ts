/**
 * 리듬 공용 소리(화면 어댑터) — mg1801/view/sound.ts 에서 옮겼다(docs/engine/02_rhythm.md 14절). 장면 프리셋 이름만 게임이 넘긴다.
 * manifest 는 게임 Assets 폴더 기준 'manifest.json' 이다(mg1801 = assets/mg1801/manifest.json). 아래는 옮기기 전 설명 그대로다.
 *
 * mg1801 소리 — 로직 사건(원본 라벨) → assets/mg1801/manifest.json(tools/mg1801_web_assets.py 가 만든다).
 * - 시퀀스 BGM(SQ_BGM_*)은 BPM(G11)별 자체 렌더 wav 를 그 BPM 으로 고른다(렌더에 없는 BPM 이면 가장 가까운 것 [근사]). 사운드 volume 이 렌더에 들어 있다.
 * - 리듬 마스터 SQ_BGM_RC_MAIN_RHYTHM 과 오프닝 SQ_BGM_RC_MGCMN_OP(OnGameStartAfter, FUN_71004263c8)는 실시간 시퀀스(view/seq.ts)로 돈다.
 *   마스터 countTrack 이 G14(16분 위치)·G12(접수한 곡)를 쓰고, rhythmdrumTrack 이 마디 첫머리마다 G13 이 등록 곡 ID(18011·18013·50·18000 …)면
 *   킥을 4박 쉬고 아니면 4분 킥(note 36)을 친다. OP 는 G13 = 1 로 마스터를 출발시키고 하이햇·크래시를 친다 [데이터: rc_cmn FSEQ, 04_sound.md 5.3].
 * - 리듬 BGM 핸드셰이크(원본 그대로 전역 변수로): 로직의 'se'(SoundModule::Play — 단계 2 게임 BGM, 단계 6 종료 BGM)가 렌더 BGM 을 "요청"한다.
 *   요청 = 그 시퀀스 Track_0 첫 틱의 G13 = 곡 ID 쓰기와 출발 대기(STARTTRIGGER_CHECK)를 이 파일이 대신 한다. 그러면
 *     재생 중인 앞 곡(OP 는 실시간 시퀀스가 스스로, 렌더 BGM 은 아래 대리)이 마디 끝 8틱 전 ENDPLAY_CHECK 에서 G10 = 1 →
 *     마스터 countTrack 이 다음 마디 첫 틱에 G12 = G13 → 그 시각(오디오 시계)에 렌더 wav 를 0 초부터 시작한다(BGM 틱 0 = countTrack 마디 경계).
 *   렌더 BGM 의 시퀀스 쪽 일(대리) [데이터: SQ_BGM_MG1801_A Track_0·ENDPLAY_CHECK, 시뮬레이션 tools/rhythm_seqsim.py]:
 *     출발 때 TEMPO_SETTING(G8 = 0, G9 = L13 = 0)과 G8 코드 진행(렌더에서 기록한 시각), 다른 곡이 요청되면 출발 시각 + (376 + 384k)틱의
 *     첫 ENDPLAY_CHECK 에서 G10 = 1, G12 가 다른 곡이 되면 ENDPLAY_CHECK_VOLOFF 의 main_volume 0 → 그 시각에 렌더를 끊는다.
 *   근사: ENDPLAY_CHECK 에서 음악 트랙이 닫힌 뒤 G12 가 바뀔 때까지(8틱) 렌더는 새 노트를 그대로 낸다(원본은 이미 울리던 음만 남는다).
 *   로직의 'bgm'(단계 3·7, G12 접수) 사건은 요청한 곡이면 소리를 내지 않는다(이미 핸드셰이크가 냈다). 마스터가 없으면(오디오 없음 등) 그 사건 때 바로 낸다.
 *   그래서 게임 BGM 시작은 원본처럼 소리 쪽(오디오 시계의 마스터)이 정한다.
 * - 게임이 읽는 값(observe): 원본 게임 프레임은 박자 G14·곡 교대 G12 와 게임 BGM 지역 변수 L0 을 사운드 스레드에서 읽는다(사운드 → 게임).
 *   이 파일은 전역 변수 쓰기를 오디오 시각과 함께 기록해 두고, 페이지가 스텝마다 그 스텝의 오디오 시각을 주면 그때 값을 돌려준다(로직 rhythm.ts 가 읽는다).
 *   렌더 BGM 의 L0 은 대리가 만든다: 접수 전 −1, 접수 틱 0, 접수 + 192틱(2박) 1 [데이터: SQ_BGM_MG1801_A/C 트랙 1, 02_rhythm.md 5.3].
 *   SQ_BGM_RC_REMIX 도 같은 2박으로 둔다 [추정 — logic/game.ts 머리 주석과 같다].
 * - 스트림(SM_*)은 원본 디코드 wav × (사운드 volume/127 × 트랙 volume/127).
 * - 효과음 시퀀스(SQ_SE_*)는 원본 명령을 웹에서 실시간으로 돈다(view/seq.ts). 물보라의 무작위 피치·볼륨(재생마다)과 wait 16 지연,
 *   JUST 아르페지오의 코드(G8)·콤보(L0) 추종과 재생 중 L0 증가 연장, 환호의 L5(달성률) 분기가 원본 명령 그대로 일어난다.
 * - 세팅 프리셋 라벨 치환: mg1801 은 장면 적재 완료 때부터 [판독 bq::SceneBase::OnLoadComplete → FUN_71000bdca4 → FUN_71000facc0],
 *   mg1800_cmn·mg1801_result 는 로직의 soundPreset 사건 때부터.
 * - 전역 변수: G11 = BPM(사건과 함께 받는 state.bpm), G8 = 지금 BGM 렌더에서 기록한 코드 진행을 오디오 시계로 읽는다. 처음 −1.
 *   나머지(G9·G10·G12·G13·G14)는 실시간 시퀀스들과 위 렌더 대리가 함께 쓰는 한 벌이다.
 * - 핸들·동시 재생 한도·라벨 치환·3D 는 공용 코어 lib/sound 가 한다(규칙 스위치, 기본 RULES_ORIGINAL — 04_sound.md §13.4).
 * - 같은 플레이어(PLY_*) 동시 재생 한도: 넘치면 우선순위가 가장 낮고(같으면 가장 오래된) 소리를 멈추고, 새 소리가 그보다 낮으면 내지 않는다 [추정: nn::atk 공개 동작].
 * - BGM 끼리(핸드셰이크 밖에서 바로 낸 BGM): 웹 규칙(supersede 'web')은 새 SQ_BGM 이 시작하면 반복(loop)하는 이전 BGM 을 멈춘다 [근사: 즉시].
 *   원본 규칙(기본)은 멈추지 않는다(04_sound.md §13.9).
 *   반복하지 않는 BGM 은 soundStop 이나 자연 끝까지 둔다(원본 단계 9 는 게임 BGM 핸들만 멈춘다).
 * - 렌더 BGM 은 공용 스트리밍 재생기(view/bgm.ts → lib/bgmstream, docs/engine/04_sound.md §12.8)로 낸다: 표본 0 = 출발 오디오 시각(통파일 start(at) 와 같은 식),
 *   처음 받는 BPM 의 곡은 로드 때 첫 조각을 풀어 두고(원본 prefetch), 나머지는 요청 때 푼다. 늦으면 지금처럼 늦은 만큼 건너뛴다.
 *
 * 3D(Play3D) [판독: 04_sound.md 6.7, view/audio.ts calc3d]:
 *   리스너 0 = 카메라(bex 기본값 interiorSize 10·maxVolumeDistance 20·unitDistance 50, FUN_71000e3e30).
 *   프리셋 mg1801 의 P 레코드가 리스너 3·4·6 을 켠다(maxVolumeDistance 23·23·50, unitDistance 10). 이들의 카메라 기준 오프셋이 리스너 0 과 같아(0,0,0)
 *   FUN_71000e1830 이 중복으로 표시하고, 중복 리스너는 행렬을 갱신하지 않는다(FUN_71000e09c0). 그래서 그 위치는 초기값으로 남는다 — (0,0,0) 으로 둔다 [추정].
 *   결과: 출력 리스너가 여럿이라 팬은 계산하지 않고(가운데), 볼륨은 리스너 최댓값이라 무대(원점 50 안)의 소리는 1 이 된다.
 */
import type * as THREE from 'three';
import type { V3 } from '@game/core/fmath';
import type { SoundSnapshot } from '../../../../../game';
import type { Assets } from '../../../../../view/assets';
import { SoundCatalog, soundDefaults, type SoundDef } from '@game/lib/sound';
import type { BufferPayload, Voice } from '@game/lib/sound-webaudio';
import type { AudioOut, Bus, Listener3d, Sound3dInfo } from '../../../../../view/audio';
import { bgmSource, type AppBgmSource } from '../../../../../view/bgm';
import { SeqEngine, type SeqData } from '../../../../../view/seq';
import { soundSystem, type MpjSound, type StreamPayload } from '../../../../../view/sound';

interface PlayerInfo {
  name: string;
  max: number;
}
interface BgmRender {
  file: string;
  durationSec: number;
  loop: { startSec: number; endSec: number } | null;
  /** [초, 값] — 렌더에서 전역 8(코드)을 쓴 시각 */
  g8: [number, number][];
  /** Track_0 이 G13 에 쓰는 곡 ID(없으면 null) */
  songId: number | null;
}
type Entry =
  | { kind: 'bgm'; bus: Bus; player: PlayerInfo | null; bpm: Record<string, BgmRender> }
  | { kind: 'stream'; bus: Bus; player: PlayerInfo | null; file: string; gain: number; loop: { startSec: number; endSec: number } | null }
  | { kind: 'seq'; bus: Bus; player: PlayerInfo | null; playerPriority: number; sound3d: Sound3dInfo | null; seq: SeqData };
interface ListenerParam {
  interiorSize: number;
  maxVolumeDistance: number;
  unitDistance: number;
}
interface Manifest {
  bpms: number[];
  sounds: Record<string, Entry>;
  substitute: Record<string, { to: string; preset: string }>;
  listener3d: { default: ListenerParam; preset: (ListenerParam & { index: number })[] };
}

/** 소리 사건(로직 state.ts Mg1801Event 중 소리 쪽) */
export type SoundEvent =
  | { k: 'bgm'; label: string }
  | { k: 'bgmStop' }
  | { k: 'se'; label: string }
  | { k: 'se3d'; label: string; pos: V3 }
  | { k: 'seLocal'; label: string; index: number; value: number }
  | { k: 'soundStop'; label: string }
  | { k: 'soundPreset'; name: string }
  | { k: 'justSound'; combo: number; play?: boolean };

type SeqEntry = Extract<Entry, { kind: 'seq' }>;

/** 핸들 표시 비트(코어 flags) — 웹 규칙의 BGM 끼리 정지가 본다 */
const H_BGM = 1;
const H_LOOP = 2;
let rmSeq = 0;

/** 파일 소리 하나(렌더 BGM·스트림) */
interface FileHandle extends Voice {
  /** 오디오 시각 t 에 끊는다 */
  stopAt(t: number): void;
}

/** 핸드셰이크로 도는 렌더 BGM 하나 — 원본 리듬 BGM 시퀀스(Track_0·음악 트랙)가 전역 변수로 하는 일을 대신한다 */
interface RhythmBgm {
  label: string;
  songId: number;
  render: BgmRender;
  entry: Extract<Entry, { kind: 'bgm' }>;
  /** 코어 핸들(요청부터 끝까지 하나) */
  h: number;
  /** 핸들 GainNode — 출발 때 스트림을 여기에 잇는다 */
  out: AudioNode | null;
  /** G12 == 곡 ID 가 된 오디오 시각(= BGM 틱 0). null = 출발 대기 */
  acceptAt: number | null;
  /** 출발 뒤 G13 이 다른 곡으로 바뀐 시각 */
  supersededAt: number | null;
  /** 음악 트랙이 ENDPLAY_CHECK 에서 G10 = 1 을 쓰고 닫혔다 */
  ended: boolean;
  file: FileHandle | null;
}

/** 처음부터 받아 둘 BGM(BPM 120). 나머지(리믹스, BPM 180)는 뒤에서 받는다 */
const EAGER_BPM = 120;
const LAZY_BGM = new Set(['SQ_BGM_RC_REMIX']);
const ZERO16 = new Float32Array(16);
const ORIGIN: V3 = { x: 0, y: 0, z: 0 };
/** 리듬 마스터 라벨 — 렌더 BGM 핸드셰이크의 출발 신호(G12)를 이 시퀀스의 countTrack 이 쓴다 */
const MASTER = 'SQ_BGM_RC_MAIN_RHYTHM';
/** 리듬 BGM 시퀀스 timebase 와 ENDPLAY_CHECK 위치(마디 384틱 중 376틱째) [데이터: SQ_BGM_MG1801_A·RC_MGCMN_OP FSEQ] */
const RHYTHM_TIMEBASE = 96;
/** 소리 시각 기록 구독(시퀀서 노트·전역값 쓰기·렌더 BGM 출발 시각 [종류, …값]). null = 기록 안 함 */
let soundTrace: ((e: unknown[]) => void) | null = null;
export function setRhythmSoundTrace(fn: ((e: unknown[]) => void) | null): void {
  soundTrace = fn;
}
const BAR_TICKS = 384;
const ENDPLAY_TICK = 376;
/** 게임 BGM 트랙 1 이 L0 = 1 을 쓰는 틱(접수 뒤 2박) [데이터] */
const BGM_L0_TICK = 192;

export class RmSoundMap {
  private m: Manifest = { bpms: [], sounds: {}, substitute: {}, listener3d: { default: { interiorSize: 10, maxVolumeDistance: 20, unitDistance: 50 }, preset: [] } };
  private readonly streams = new Map<string, AppBgmSource>();
  /** 라벨 표·세팅 프리셋(코어 SoundCatalog). 핸들·한도·치환·3D 는 공용 코어(view/sound.ts soundSystem) */
  private readonly cat: SoundCatalog;
  private readonly sys: MpjSound | null;
  private readonly seqVoice: string;
  private readonly bgmVoice: string;
  private readonly glob = new Array<number>(16).fill(-1);
  /** 전역 변수별 쓰기 기록 [오디오 시각, 값] — 시각 순. 게임 관측(observe)이 지난 시각의 값을 찾는다 */
  private readonly hist: [number, number][][] = Array.from({ length: 16 }, () => []);
  /** 마스터를 튼 적이 있는지(그 뒤부터 게임이 관측값을 읽는다) */
  private masterStarted = false;
  private bpm = 120;
  /** 지금 G8 을 쓰는 BGM(시작 오디오 시각, 렌더의 코드 진행) */
  private g8Src: { start: number; g8: [number, number][] } | null = null;
  private engine: SeqEngine | null = null;
  /** 핸드셰이크로 도는(또는 출발을 기다리는) 렌더 BGM */
  private readonly rhythm: RhythmBgm[] = [];

  constructor(
    private readonly assets: Assets,
    private readonly audio: AudioOut | null,
    /** 장면 적재 때 켜지는 세팅 프리셋(미니게임 이름, 예 'mg1801') */
    scenePreset: string,
  ) {
    this.cat = new SoundCatalog('rhythm').loadPreset(scenePreset);
    this.sys = audio ? soundSystem(audio) : null;
    const id = ++rmSeq;
    this.seqVoice = `rm-seq#${id}`;
    this.bgmVoice = `rm-bgm#${id}`;
    if (audio && this.sys) {
      this.engine = new SeqEngine(
        audio,
        {
          get: (i, time) => this.global(i, time),
          set: (i, v, time) => this.setGlobal(i, v, time),
        },
        this.sys.rules.random === 'original' ? this.sys.random : null,
      );
      this.sys.out.register(this.seqVoice, { ownsPan: true, start: (c, out) => this.startSeq(c.target, c.payload as SeqEntry, c.pan, c.local, out) });
      this.sys.out.register(this.bgmVoice, { start: (c, out) => this.startRhythm(c.payload as RhythmBgm, out) });
    }
  }

  /** manifest → 라벨 표(코어 SoundDef). 처리기: seq = 이 맵의 시퀀서, stream = buffer, bgm = bgmstream(핸드셰이크 BGM 은 rm-bgm) */
  private define(): void {
    for (const [label, e] of Object.entries(this.m.sounds)) {
      const def: SoundDef = {
        kind: e.kind,
        bus: e.bus,
        player: e.player?.name ?? null,
        playerMax: e.player?.max ?? 0,
        priority: e.kind === 'seq' ? e.playerPriority : 64,
        sound3d: e.kind === 'seq' ? e.sound3d : null,
        voice: e.kind === 'seq' ? this.seqVoice : e.kind === 'stream' ? 'buffer' : 'bgmstream',
        payload: e,
      };
      this.cat.define(label, def);
    }
    for (const [src, s] of Object.entries(this.m.substitute)) this.cat.substitute(src, s.to, s.preset);
  }

  async load(onFile?: (n: number, total: number, name: string) => void): Promise<void> {
    this.m = await this.assets.json<Manifest>('manifest.json');
    this.define();
    if (!this.audio) return;
    const eager = new Set<string>();
    const eagerBgm = new Map<string, BgmRender>();
    const lazyBgm = new Map<string, BgmRender>();
    for (const [label, e] of Object.entries(this.m.sounds)) {
      if (e.kind === 'seq') for (const w of e.seq.waves) eager.add(w.file);
      else if (e.kind === 'stream') eager.add(e.file);
      else
        for (const [bpm, r] of Object.entries(e.bpm)) {
          if (Number(bpm) === EAGER_BPM && !LAZY_BGM.has(label)) eagerBgm.set(r.file, r);
          else lazyBgm.set(r.file, r);
        }
    }
    for (const f of eagerBgm.keys()) lazyBgm.delete(f);
    let n = 0;
    const total = eager.size + eagerBgm.size;
    await Promise.all([
      ...[...eager].map(async (f) => {
        await this.fetch(f);
        onFile?.(++n, total, f);
      }),
      ...[...eagerBgm.values()].map(async (r) => {
        await this.stream(r).pin(0);
        onFile?.(++n, total, r.file);
      }),
    ]);
    for (const r of lazyBgm.values()) this.stream(r).prefetch?.(0);
  }

  /** 렌더 BGM 의 스트리밍 소스(파일마다 하나 — 첫 조각을 풀어 둔 것을 유지) */
  private stream(r: Pick<BgmRender, 'file' | 'loop'>): AppBgmSource {
    let s = this.streams.get(r.file);
    if (!s) {
      s = bgmSource(this.audio!.ctx, this.assets.url(r.file), r.loop);
      this.streams.set(r.file, s);
    }
    return s;
  }

  private fetch(file: string): Promise<AudioBuffer | undefined> {
    return this.sys ? this.sys.load(this.assets.url(file)) : Promise.resolve(undefined);
  }

  /** 웹 규칙(supersede = web): 반복하는 BGM 핸들을 지금 멈춘다(except 빼고) */
  private stopLoopingBgm(except: number): void {
    const sys = this.sys;
    if (!sys) return;
    sys.core.forEach((h, _l, f) => {
      if (f & H_BGM && f & H_LOOP && h !== except) sys.core.stop(h);
    }, this.cat);
    sys.flush();
  }

  /** 시퀀서 처리기 — 원본 시퀀스 사운드 하나(SeqEngine 이 전역 변수를 같이 쓴다) */
  private startSeq(target: string, e: SeqEntry, pan: number, local: Readonly<Record<number, number>> | null, out: AudioNode): Voice | null {
    const sys = this.sys;
    if (!this.engine || !sys) return null;
    const bufs = e.seq.waves.map((w) => sys.peek(this.assets.url(w.file)));
    if (target === MASTER) this.masterStarted = true;
    const log = target === MASTER ? soundTrace : null;
    const onNote = log ? (key: number, time: number, start: number): void => void log(['note', key, time, start]) : undefined;
    const s = this.engine.play(e.seq, bufs, e.bus, { pan, local: (local ?? undefined) as Record<number, number> | undefined, onNote, dest: out });
    return {
      alive: () => !s.finished,
      stop: (fade) => {
        /* 페이드 정지(원본 규칙 그룹 정지): 핸들 이득을 줄이고 끝에 시퀀스를 멈춘다. 웹 규칙의 정지는 늘 0 */
        if (fade > 0 && !s.finished && this.audio) {
          const g = (out as GainNode).gain;
          const now = this.audio.ctx.currentTime;
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(0, now + fade);
          setTimeout(() => s.stop(), fade * 1000);
          return;
        }
        s.stop();
      },
      setLocal: (i, v) => {
        s.local[i] = v;
      },
    };
  }

  /** 핸드셰이크 BGM 처리기 — 요청부터 핸들 하나. 살아 있음 = 출발 대기·재생 목록에 있거나 스트림이 돎 */
  private startRhythm(rb: RhythmBgm, out: AudioNode): Voice {
    rb.out = out;
    return {
      alive: () => this.rhythm.includes(rb) || (rb.file?.alive() ?? false),
      stop: (fade) => {
        this.dropRhythm(rb);
        rb.file?.stop(fade);
      },
      stopAt: (t) => rb.file?.stopAt(t),
    };
  }

  private global(i: number, time: number): number {
    if (i === 11) return this.bpm;
    if (i === 10) this.rhythmEndCheck(time);
    if (i === 8 && this.g8Src) {
      const t = time - this.g8Src.start;
      let v = this.glob[8];
      for (const [at, val] of this.g8Src.g8) {
        if (at <= t) v = val;
        else break;
      }
      return v;
    }
    return this.glob[i];
  }

  /** 전역 변수 쓰기(시퀀스 또는 렌더 대리) — 렌더 BGM 의 출발 대기·끝 처리가 이 값을 본다 */
  private setGlobal(i: number, v: number, time: number): void {
    this.glob[i] = v;
    this.record(i, v, time);
    if (i === 13) {
      for (const r of [...this.rhythm]) {
        if (r.songId === v) continue;
        /* STARTTRIGGER_CHECK: 출발 전에 G13 이 자기 곡이 아니게 되면 fin */
        if (r.acceptAt === null) this.dropRhythm(r);
        else if (r.supersededAt === null) r.supersededAt = time;
      }
    } else if (i === 12) {
      for (const r of [...this.rhythm]) {
        if (r.acceptAt === null && r.songId === v) this.acceptRhythm(r, time);
        else if (r.acceptAt !== null && r.songId !== v && r.songId !== this.glob[13]) {
          /* Track_0 ENDPLAY_CHECK_VOLOFF: L15 ≠ G13 이고 L15 ≠ G12 → main_volume 0, fin */
          this.dropRhythm(r);
          r.file?.stopAt(time);
        }
      }
    }
  }

  /** 쓰기 기록(시각 순 삽입 — 요청의 G13 쓰기는 이미 앞서 처리한 시퀀서 프레임보다 이른 시각일 수 있다) */
  private record(i: number, v: number, time: number): void {
    const h = this.hist[i];
    let k = h.length;
    while (k > 0 && h[k - 1][0] > time) k--;
    h.splice(k, 0, [time, v]);
    soundTrace?.(['g', i, v, time, this.audio?.ctx.currentTime ?? null]);
  }

  /** time 까지 쓴 마지막 값(없으면 기본 −1) */
  private valueAt(i: number, time: number): number {
    const h = this.hist[i];
    for (let k = h.length - 1; k >= 0; k--) if (h[k][0] <= time) return h[k][1];
    return -1;
  }

  /** 출발(G12 == 곡 ID): TEMPO_SETTING(G8 = 0, G9 = L13 = 0), 코드 진행, 렌더 wav 를 그 시각 0 초부터 */
  private acceptRhythm(r: RhythmBgm, time: number): void {
    r.acceptAt = time;
    this.glob[8] = 0;
    this.glob[9] = 0;
    this.record(8, 0, time);
    this.record(9, 0, time);
    if (r.render.g8.length) this.g8Src = { start: time, g8: r.render.g8 };
    if (this.sys?.rules.supersede === 'web') this.stopLoopingBgm(r.h);
    r.file = this.startFile(r.label, r.entry, r.render.file, r.render.loop, undefined, r.render.durationSec, time, true, r.out);
    soundTrace?.(['bgmStart', r.label, time, this.audio?.ctx.currentTime ?? null]);
  }

  /** 출발한 렌더 BGM 의 음악 트랙 ENDPLAY_CHECK: 다른 곡이 요청된 뒤 첫 (출발 + 376 + 384k)틱에 G10 = 1 (G10 을 읽을 때 따진다) */
  private rhythmEndCheck(time: number): void {
    const tick = 60 / (this.bpm * RHYTHM_TIMEBASE);
    for (const r of this.rhythm) {
      if (r.acceptAt === null || r.supersededAt === null || r.ended) continue;
      const first = r.acceptAt + ENDPLAY_TICK * tick;
      const k = Math.max(0, Math.ceil((r.supersededAt - first) / (BAR_TICKS * tick) - 1e-9));
      const at = first + k * BAR_TICKS * tick;
      if (time >= at - 1e-9) {
        r.ended = true;
        this.glob[10] = 1;
        this.record(10, 1, at);
      }
    }
  }

  private dropRhythm(r: RhythmBgm): void {
    const i = this.rhythm.indexOf(r);
    if (i >= 0) this.rhythm.splice(i, 1);
  }

  /**
   * 게임이 읽는 사운드 값 — time(AudioContext 시각)까지 시퀀서·렌더 대리가 쓴 전역 변수와, 리듬 BGM 핸들의 지역 변수.
   * 원본 게임 프레임의 SoundModule::ReadGlobalVariable·SoundHandle::ReadLocalVariable 자리다. 먼저 시퀀서를 지금까지 돌려 둔다.
   * 마스터를 튼 적이 없으면 null(로직은 자기 프레임 모델). 마스터가 멈춘 뒤에도 기록된 마지막 값을 준다(원본 전역 변수도 그대로 남는다).
   */
  observe(time: number): SoundSnapshot | null {
    this.sys?.update();
    if (!this.audio || !this.engine || !this.masterStarted) return null;
    this.engine.pump();
    const globals = this.hist.map((_, i) => (i === 8 || i === 11 ? this.global(i, time) : this.valueAt(i, time)));
    const locals: Record<string, number[]> = {};
    const tick = 60 / (this.bpm * RHYTHM_TIMEBASE);
    for (const r of this.rhythm) {
      const l0 = r.acceptAt === null || time < r.acceptAt ? -1 : time < r.acceptAt + BGM_L0_TICK * tick ? 0 : 1;
      locals[r.label] = [l0, ...new Array<number>(15).fill(-1)];
    }
    return { time, globals, locals };
  }

  private masterAlive(): boolean {
    return !!this.sys && this.sys.core.find(MASTER, this.cat) !== 0;
  }

  /**
   * 리듬 BGM 재생 요청(원본 SoundModule::Play → 시퀀스 Track_0 첫 틱: G13 = 곡 ID, 모든 트랙이 G12 == 곡 ID 를 기다림).
   * 렌더 BGM 라벨이면 true(소리는 핸드셰이크가 낸다). 마스터가 없으면 요청을 걸지 않는다 — 로직의 'bgm'(접수) 사건이 바로 낸다.
   */
  private request(label: string): boolean {
    const e = this.m.sounds[this.resolve(label)];
    if (!e || e.kind !== 'bgm') return false;
    const sys = this.sys;
    if (!this.audio || !sys || !this.masterAlive()) return true;
    const r = this.pickBgm(e);
    if (!r || r.songId === null) return true;
    const now = this.audio.ctx.currentTime;
    const rb: RhythmBgm = { label, songId: r.songId, render: r, entry: e, h: 0, out: null, acceptAt: null, supersededAt: null, ended: false, file: null };
    rb.h = sys.play(this.cat, label, { payload: rb, voice: this.bgmVoice, flags: H_BGM | (r.loop ? H_LOOP : 0) });
    if (!rb.h) return true;
    this.rhythm.push(rb);
    void this.stream(r).pin(0);
    this.setGlobal(13, r.songId, now);
    return true;
  }

  /** 프리셋 라벨 치환(켜진 프리셋만) */
  private resolve(label: string): string {
    return this.sys ? this.sys.core.resolve(this.cat, label) : this.cat.resolve(label, soundDefaults.rules);
  }

  /** view/index.ts onStep 의 소리 사건. bpm = state.bpm(G11), camera = 리스너(3D) */
  onEvent(e: SoundEvent, bpm: number, camera: THREE.Camera): void {
    this.bpm = bpm;
    const sys = this.sys;
    sys?.update();
    switch (e.k) {
      case 'bgm':
        /* 요청해 둔 렌더 BGM 은 핸드셰이크(G12)가 이미 냈거나 곧 낸다 */
        if (this.rhythm.some((r) => r.label === e.label)) break;
        this.play(e.label, {});
        break;
      case 'bgmStop':
        sys?.core.forEach((h, _l, f) => {
          if (f & H_BGM) sys.core.stop(h);
        }, this.cat);
        sys?.flush();
        break;
      case 'se':
        if (this.request(e.label)) break;
        this.play(e.label, {});
        break;
      case 'se3d':
        this.play(e.label, { pos: e.pos, camera });
        break;
      case 'seLocal':
        this.play(e.label, { local: { [e.index]: e.value } });
        break;
      case 'soundStop':
        sys?.core.forEach((h, l) => {
          if (l === e.label) sys.core.stop(h);
        }, this.cat);
        sys?.flush();
        break;
      case 'soundPreset':
        this.cat.loadPreset(e.name);
        break;
      case 'justSound':
        this.playJust(e.combo, e.play ?? true);
        break;
    }
  }

  /**
   * JUST 판정음 — 원본 PlayExcellentSe: 새로 재생할 때는 Play("SQ_SE_RC_JUST") 뒤 L0 = combo, 아니면 같은 핸들의 L0 만 바꾼다
   * (핸들이 이미 끝났으면 원본처럼 아무 일도 없다)
   */
  playJust(combo: number, play: boolean): void {
    if (play) {
      this.play('SQ_SE_RC_JUST', { local: { 0: combo } });
      return;
    }
    const sys = this.sys;
    if (!sys) return;
    sys.core.forEach((h, l) => {
      if (l === 'SQ_SE_RC_JUST') sys.core.writeLocal(h, 0, combo);
    }, this.cat);
    sys.flush();
  }

  private listeners(camera: THREE.Camera): Listener3d[] {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    const d = this.m.listener3d.default;
    const out: Listener3d[] = [{ pos: { x: e[12], y: e[13], z: e[14] }, view: camera.matrixWorldInverse.elements, ...d, output: true }];
    for (const p of this.m.listener3d.preset) {
      out.push({ pos: ORIGIN, view: ZERO16, interiorSize: p.interiorSize, maxVolumeDistance: p.maxVolumeDistance, unitDistance: p.unitDistance, output: true });
    }
    return out;
  }

  private play(label: string, o: { pos?: V3; camera?: THREE.Camera; local?: Record<number, number> }): void {
    const sys = this.sys;
    if (!this.audio || !sys) return;
    const target = this.resolve(label);
    const e = this.m.sounds[target];
    if (!e) return;
    const now = this.audio.ctx.currentTime;
    if (e.kind === 'seq') {
      const is3d = !!(o.pos && o.camera && e.sound3d);
      if (is3d) sys.core.setListeners(this.listeners(o.camera!));
      sys.play(this.cat, label, { pos: is3d ? o.pos : null, local: o.local, flags: e.bus === 'bgm' ? H_BGM : 0 });
      return;
    }
    const isBgm = target.startsWith('SQ_BGM') || target.startsWith('SM_BGM');
    let loop: { startSec: number; endSec: number } | null;
    let payload: StreamPayload | BufferPayload;
    if (e.kind === 'bgm') {
      const r = this.pickBgm(e);
      if (!r) return;
      loop = r.loop;
      if (r.g8.length) this.g8Src = { start: now, g8: r.g8 };
      payload = { source: this.stream({ file: r.file, loop: r.loop }), at: now };
    } else {
      loop = e.loop;
      payload = { url: this.assets.url(e.file), gain: e.gain, loop: e.loop, durationSec: Infinity, late: 'skip', at: now };
    }
    const supersede = isBgm && sys.rules.supersede === 'web';
    sys.play(this.cat, label, { payload, flags: (isBgm ? H_BGM : 0) | (loop ? H_LOOP : 0), onAdmit: supersede ? () => this.stopLoopingBgm(0) : undefined });
  }

  /**
   * 파일 소리(렌더 BGM·스트림)를 오디오 시각 at 에 0 초부터 시작한다(at 이 지났거나 버퍼가 늦게 오면 그만큼 건너뛴다).
   * 재생기(목소리)만 만든다 — 코어 핸들과 묶는 것은 부르는 쪽(핸드셰이크·파일 처리기).
   */
  private startFile(
    label: string,
    e: Extract<Entry, { kind: 'bgm' }>,
    file: string,
    loop: { startSec: number; endSec: number } | null,
    gain: number | undefined,
    duration: number,
    at: number,
    isBgm: boolean,
    dest: AudioNode | null,
  ): FileHandle {
    void label;
    void duration;
    void isBgm;
    return this.sys!.stream({ source: this.stream({ file, loop }), gain, at }, dest ?? this.audio!.busNode(e.bus)) as FileHandle;
  }

  private pickBgm(e: Extract<Entry, { kind: 'bgm' }>): BgmRender | undefined {
    const exact = e.bpm[String(this.bpm)];
    if (exact) return exact;
    let best: BgmRender | undefined;
    let bd = Infinity;
    for (const [k, r] of Object.entries(e.bpm)) {
      const d = Math.abs(Number(k) - this.bpm);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  /** 모든 소리를 멈춘다(view dispose 가 부른다) */
  stopBgm(): void {
    const sys = this.sys;
    if (sys) {
      sys.core.forEach((h) => sys.core.stop(h), this.cat);
      sys.flush();
      sys.out.unregister(this.seqVoice);
      sys.out.unregister(this.bgmVoice);
      if (sys.rules.sceneExit) {
        const sub = new Set<string>();
        for (const e of Object.values(this.m.sounds)) if (e.kind === 'seq') for (const w of e.seq.waves) if (/(^|\/)subarc_/.test(w.file)) sub.add(this.assets.url(w.file));
        sys.release([...sub]);
      }
    }
    this.rhythm.length = 0;
    this.engine?.stopAll();
  }
}
