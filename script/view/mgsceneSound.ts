/**
 * 미니게임 공용 틀 소리 — 로직 사건(se·voice·bgm·bgmStop·jingle)을 재생한다. 명세: assets/mgscene/sound/sound.json(틀 SE·보이스·징글·설명 BGM),
 * 게임 BGM 은 게임 폴더 sound/sound.json(예 assets/mgdummy). 근거: docs/shell/minigame_scene.md §12.1·§12.6.
 * BGM·결과 징글은 원본 MGSound 처럼 핸들이 따로다(BgmChannel 두 개, view/bgm.ts). 리전 점프(REG_SEQ_MAIN)는 처음부터 재생 [근사, §12.7].
 * groupStop(그룹 0x22 = MG BGM)은 BGM 채널 정지로만 옮긴다 [근사].
 */
import type { MgSceneEvent } from '../shell/mgscene';
import type { Assets } from './assets';
import type { AudioOut, Bus } from './audio';
import { BgmChannel } from './bgm';

interface SoundEntry {
  file: string;
  gain: number;
  bus?: Bus;
  loopStart?: number;
  loopEnd?: number;
}

interface SoundJson {
  se?: Record<string, SoundEntry>;
  voice?: Record<string, SoundEntry>;
  bgm?: Record<string, SoundEntry>;
}

export class MgSceneSound {
  readonly bgm: BgmChannel;
  readonly jingle: BgmChannel;
  /** 시험·디버그: 재생 요청 기록 */
  readonly log: string[] = [];
  private readonly table = new Map<string, { url: string; e: SoundEntry; kind: 'se' | 'voice' | 'bgm' }>();

  private constructor(private readonly audio: AudioOut | null) {
    this.bgm = new BgmChannel(() => audio?.ctx ?? null, 'mgscene-bgm');
    this.jingle = new BgmChannel(() => audio?.ctx ?? null, 'mgscene-jingle');
  }

  /** sources: 앞의 것이 우선(게임 → 틀) */
  static async load(audio: AudioOut | null, sources: { assets: Assets; path: string }[]): Promise<MgSceneSound> {
    const s = new MgSceneSound(audio);
    for (const src of [...sources].reverse()) {
      const j = await src.assets.json<SoundJson>(src.path).catch(() => null);
      if (!j) continue;
      const base = src.path.replace(/[^/]+$/, '');
      for (const kind of ['se', 'voice', 'bgm'] as const) {
        for (const [label, e] of Object.entries(j[kind] ?? {})) {
          const rel = kind === 'bgm' ? `${base}${e.file}` : e.file;
          s.table.set(label, { url: src.assets.url(rel), e, kind });
        }
      }
    }
    return s;
  }

  private oneShot(label: string, bus: Bus): void {
    const t = this.table.get(label);
    this.log.push(`${bus}:${label}`);
    if (!t || !this.audio || t.e.gain <= 0) return;
    const a = this.audio;
    void a.load(t.url).then(
      (buf) => a.play(buf, bus, { gain: t.e.gain }),
      () => undefined,
    );
  }

  private stream(ch: BgmChannel, label: string): void {
    const t = this.table.get(label);
    this.log.push(`stream:${label}`);
    if (!t) {
      console.warn(`mgscene: 소리 명세에 없는 BGM ${label}`);
      return;
    }
    const loop = typeof t.e.loopStart === 'number' && typeof t.e.loopEnd === 'number' ? { startSec: t.e.loopStart, endSec: t.e.loopEnd } : null;
    ch.play(label, t.url, { gain: t.e.gain, loop });
  }

  onEvents(events: readonly MgSceneEvent[]): void {
    for (const e of events) {
      if (e.k === 'se') this.oneShot(e.label, 'se');
      else if (e.k === 'voice') this.oneShot(e.label, 'voice');
      else if (e.k === 'bgm') this.stream(this.bgm, e.label);
      else if (e.k === 'jingle') this.stream(this.jingle, e.label);
      else if (e.k === 'bgmStop') this.bgm.stop(e.fadeSec);
      else if (e.k === 'groupStop' && e.groups.includes(0x22)) this.bgm.stop(e.sec);
      else if (e.k === 'groupStop' && e.groups.includes(0x20)) {
        this.bgm.stop(0.7);
        this.jingle.stop(0.7);
      }
    }
  }

  dispose(): void {
    this.bgm.stop(0);
    this.jingle.stop(0);
  }
}
