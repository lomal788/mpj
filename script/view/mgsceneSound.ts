/**
 * 미니게임 공용 틀 소리 — 로직 사건(se·voice·bgm·bgmStop·jingle)을 재생한다. 명세: assets/mgscene/sound/sound.json(틀 SE·보이스·징글·설명 BGM),
 * 게임 BGM 은 게임 폴더 sound/sound.json(예 assets/mgdummy). 근거: docs/shell/minigame_scene.md §12.1·§12.6.
 * BGM·결과 징글은 원본 MGSound 처럼 핸들이 따로다(공용 코어 핸들 두 칸, 재생은 bgmstream 처리기 — view/sound.ts). 리전 점프(REG_SEQ_MAIN)는 처음부터 재생 [근사, §12.7].
 * groupStop 은 원본 규칙(기본)에서 코어 그룹 소속으로 같은 코어의 모든 핸들을 멈추고, 웹 규칙에서는 틀 BGM·징글 채널만 멈춘다(04_sound.md §13.4).
 */
import type { MgSceneEvent } from '../shell/mgscene';
import { SoundCatalog } from '@game/lib/sound';
import type { BufferPayload } from '@game/lib/sound-webaudio';
import type { Assets } from './assets';
import type { AudioOut, Bus } from './audio';
import { enterSoundScene, soundSystem, type MpjSound, type StreamPayload } from './sound';

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

/** BGM·결과 징글 핸들 한 칸(원본 MGSound 의 핸들 둘 — 이전 BgmChannel 과 같은 규칙: 같은 라벨이 돌면 그대로, 새 곡이면 앞 곡을 바로 끊는다) */
interface Channel {
  h: number;
  label: string | null;
  owner: string;
}

export class MgSceneSound {
  /** 시험·디버그: 재생 요청 기록 */
  readonly log: string[] = [];
  private readonly table = new Map<string, { url: string; e: SoundEntry; kind: 'se' | 'voice' | 'bgm' }>();
  /** 라벨 표(코어). 핸들·그룹은 페이지 공용 코어(view/sound.ts soundSystem) */
  private readonly cat = new SoundCatalog('mgscene');
  private readonly sys: MpjSound | null;
  private readonly bgmCh: Channel = { h: 0, label: null, owner: 'mgscene-bgm' };
  private readonly jingleCh: Channel = { h: 0, label: null, owner: 'mgscene-jingle' };

  private constructor(private readonly audio: AudioOut | null) {
    this.sys = audio ? soundSystem(audio) : null;
    enterSoundScene(this.sys, 'mg');
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
          s.define(label, src.assets.url(rel), e, kind);
        }
      }
    }
    return s;
  }

  /** 표 한 줄 → 코어 정의. se·voice = buffer 처리기(풀리는 대로 처음부터), bgm = bgmstream 처리기 */
  private define(label: string, url: string, e: SoundEntry, kind: 'se' | 'voice' | 'bgm'): void {
    if (kind === 'bgm') {
      const loop = typeof e.loopStart === 'number' && typeof e.loopEnd === 'number' ? { startSec: e.loopStart, endSec: e.loopEnd } : null;
      const payload: StreamPayload = { url, gain: e.gain, loop, resume: true };
      this.cat.define(label, { kind: 'bgm', bus: 'bgm', player: null, playerMax: 0, priority: 64, sound3d: null, voice: 'bgmstream', payload });
      return;
    }
    const payload: BufferPayload = { url, gain: e.gain, late: 'wait' };
    this.cat.define(label, { kind: 'stream', bus: kind, player: null, playerMax: 0, priority: 64, sound3d: null, voice: 'buffer', payload, orig: label.startsWith('SQ_') ? 'seq' : 'stream' });
  }

  private oneShot(label: string, bus: Bus): void {
    const t = this.table.get(label);
    this.log.push(`${bus}:${label}`);
    if (!t || !this.audio || !this.sys || t.e.gain <= 0) return;
    if (t.kind === 'bgm') {
      const payload: BufferPayload = { url: t.url, gain: t.e.gain, late: 'wait' };
      this.sys.play(this.cat, label, { payload, voice: 'buffer' });
      return;
    }
    this.sys.play(this.cat, label);
  }

  private stream(ch: Channel, label: string): void {
    const t = this.table.get(label);
    this.log.push(`stream:${label}`);
    if (!t) {
      console.warn(`mgscene: 소리 명세에 없는 BGM ${label}`);
      return;
    }
    const sys = this.sys;
    if (ch.label === label && sys?.core.alive(ch.h)) return;
    this.stopCh(ch, 0);
    if (!sys) return;
    const p = this.cat.defs.get(label)?.payload as StreamPayload;
    ch.h = sys.play(this.cat, label, { payload: { ...p, owner: ch.owner } });
    ch.label = label;
  }

  private stopCh(ch: Channel, fade: number): void {
    if (ch.h) this.sys?.stop(ch.h, fade);
    ch.h = 0;
    ch.label = null;
  }

  /** 그룹 정지 — 원본 규칙은 코어 소속으로 같은 코어의 모든 핸들, 웹 규칙은 틀 BGM·징글 채널만(이전 그대로) */
  private groupStop(groups: readonly number[], sec: number): void {
    const sys = this.sys;
    if (sys && sys.rules.groups === 'original') {
      for (const g of groups) sys.core.stopGroup(g, sec);
      sys.flush();
      if (!sys.core.alive(this.bgmCh.h)) this.bgmCh.label = null;
      if (!sys.core.alive(this.jingleCh.h)) this.jingleCh.label = null;
      return;
    }
    if (groups.includes(0x22)) this.stopCh(this.bgmCh, sec);
    else if (groups.includes(0x20)) {
      this.stopCh(this.bgmCh, 0.7);
      this.stopCh(this.jingleCh, 0.7);
    }
  }

  onEvents(events: readonly MgSceneEvent[]): void {
    for (const e of events) {
      if (e.k === 'se') this.oneShot(e.label, 'se');
      else if (e.k === 'voice') this.oneShot(e.label, 'voice');
      else if (e.k === 'bgm') this.stream(this.bgmCh, e.label);
      else if (e.k === 'jingle') this.stream(this.jingleCh, e.label);
      else if (e.k === 'bgmStop') this.stopCh(this.bgmCh, e.fadeSec);
      else if (e.k === 'groupStop') this.groupStop(e.groups, e.sec);
    }
    this.sys?.update();
  }

  dispose(): void {
    this.stopCh(this.bgmCh, 0);
    this.stopCh(this.jingleCh, 0);
  }
}
