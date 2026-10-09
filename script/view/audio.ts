/**
 * 소리 출력 — WebAudio 버스(se·voice·bgm → master). 원본 라벨 → 파일 대응은 게임 manifest 가 정한다.
 * 3D 효과음 계산은 원본 nn::atk Sound3DEngine·Sound3DCalculator 를 옮긴 calc3d 가 한다(공용 코어 lib/sound 로 옮겼고 여기서 다시 내보낸다, docs/engine/04_sound.md 6.7).
 * 시퀀스 효과음의 실시간 재생은 seq.ts.
 */
export type Bus = 'se' | 'voice' | 'bgm';

export class AudioOut {
  readonly ctx = new AudioContext();
  private readonly master = this.ctx.createGain();
  private readonly buses: Record<Bus, GainNode>;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private readonly playing = new Set<AudioBufferSourceNode>();

  constructor() {
    this.master.connect(this.ctx.destination);
    const bus = (): GainNode => {
      const g = this.ctx.createGain();
      g.connect(this.master);
      return g;
    };
    this.buses = { se: bus(), voice: bus(), bgm: bus() };
  }

  resume(): Promise<void> {
    return this.ctx.resume();
  }

  /** url 의 소리를 한 번만 받아 디코드한다 */
  load(url: string): Promise<AudioBuffer> {
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`소리를 읽지 못했다: ${url} (${r.status})`);
          return r.arrayBuffer();
        })
        .then((b) => this.ctx.decodeAudioData(b));
      this.buffers.set(url, p);
    }
    return p;
  }

  busNode(bus: Bus): AudioNode {
    return this.buses[bus];
  }

  /** stopAll 이 멈출 수 있게 등록한다(다른 곳에서 만든 소스) */
  track(src: AudioBufferSourceNode): void {
    src.addEventListener('ended', () => this.playing.delete(src));
    this.playing.add(src);
  }

  /** when: 시작 AudioContext 시각(없으면 지금), offset: 버퍼 안 시작 초 */
  play(
    buf: AudioBuffer,
    bus: Bus,
    opts: { loop?: boolean; loopStart?: number; loopEnd?: number; gain?: number; when?: number; offset?: number } = {},
  ): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = opts.loop ?? false;
    if (opts.loopStart !== undefined) src.loopStart = opts.loopStart;
    if (opts.loopEnd !== undefined) src.loopEnd = opts.loopEnd;
    let out: AudioNode = this.buses[bus];
    if (opts.gain !== undefined) {
      const g = this.ctx.createGain();
      g.gain.value = opts.gain;
      g.connect(out);
      out = g;
    }
    src.connect(out);
    this.track(src);
    src.start(opts.when ?? 0, opts.offset ?? 0);
    return src;
  }

  setMuted(m: boolean): void {
    this.master.gain.value = m ? 0 : 1;
  }

  stopAll(): void {
    for (const s of this.playing) {
      try {
        s.stop();
      } catch {
        /* 이미 멈춤 */
      }
    }
    this.playing.clear();
  }

  dispose(): void {
    this.stopAll();
    void this.ctx.close();
  }
}

/** 페이지 흐름 전체에 하나인 AudioOut(셸 화면·앱 BGM·게임이 같은 컨텍스트·같은 사운드 코어 — docs/engine/04_sound.md §13.11.1). 만들 수 없으면 null */
export function appAudio(): AudioOut | null {
  const G = globalThis as { __mpjAudio?: AudioOut | null };
  if (G.__mpjAudio === undefined) {
    try {
      G.__mpjAudio = new AudioOut();
    } catch {
      G.__mpjAudio = null;
    }
  }
  return G.__mpjAudio;
}

export { calc3d, SOUND3D_MANAGER, type Ambient3d, type Listener3d, type Sound3dInfo } from '../lib/sound';
