/**
 * MGSound(미니게임 소리 시점) 모델 — 표 audio/data/mgsound_setting.json(MgSoundData)로 MG BGM·결과 징글·호루라기·건너뛰기 소리를 사건으로 낸다.
 * 판독: docs/shell/minigame_scene.md §12.1 (mgscene_web1.c·mgscene_web2.c: FUN_71001e4a54·4c9c·4af0·4f28·4308·559c·51e0·597c,
 * TryStartResultSound·TryStartWhistle). 실제 재생은 화면 쪽(view/mgsceneSound.ts)이 사건을 받아 한다.
 */
import { fadeTimeSec } from '@game/lib/sound';
import type { MgPlayer, MgSceneEvent, MgSoundRow } from './types';

const F = Math.fround;
/** FADE_TIME_02 = Stop_Preset(2) = 0.7 초 [04_sound.md §12 표] */
const FADE_PRESET_SEC: Record<string, number> = { FADE_TIME_02: 0.7 };
/** FadeTimePreset 이름 → 초(공용 코어 표, docs/shell/mgm_common.md 6.9). 이름 꼴이 아니면 위 표·0.7 */
const fadeSec = (name: string): number => fadeTimeSec(name, FADE_PRESET_SEC[name] ?? 0.7);

interface Slot {
  label: string;
  /** 남은 지연(초) — >0 이면 아직 재생 전 */
  delay: number;
  playing: boolean;
  region: string | null;
}

/** 결과 징글 라벨 — FUN_71001e51e0(id, timing, telopType) */
export function resultJingleLabel(gameRule: number, timing: number, telopType: number, players: readonly MgPlayer[]): string | null {
  if (gameRule >= 0 && gameRule < 15 && ((1 << gameRule) & 0x28f) !== 0) {
    if (timing !== 1 || telopType === -1) {
      for (const p of players) if (p.rank === 0 || p.winLose === 1) return 'SM_JIN_MG_WIN';
      return 'SM_JIN_MG_DRAW';
    }
  } else if (gameRule === 14) {
    if (telopType === 8) return 'SM_JIN_MG_DRAW';
    if (telopType === -1) return players[0]?.winLose === 2 ? 'SM_JIN_MG_DRAW' : 'SM_JIN_MG_WIN';
    if (telopType === 5) return 'SM_JIN_MG_WIN';
    return null;
  } else if (timing !== 1 || telopType === -1) return null;
  if (telopType === 8) return 'SM_JIN_MG_DRAW';
  if (telopType === 5) return 'SM_JIN_MG_WIN';
  return null;
}

export class MgSound {
  /** +0x1c 오프닝 건너뜀, +0x1d 리전 점프함 */
  skipped = false;
  regionJumped = false;
  /** +0x164 결과 징글 한 번 */
  resultDone = false;
  private bgm: Slot | null = null;
  private bgmStopDelay = 0;
  private jingle: Slot | null = null;

  constructor(
    readonly rec: MgSoundRow | null,
    private readonly emit: (e: MgSceneEvent) => void,
  ) {}

  /** FUN_71001e4a54(pos, extra) — 0 telop_start, 1 telop_3, 2 scene_start */
  bgmAt(pos: number, extra = 0): boolean {
    const r = this.rec;
    if (!r) return false;
    if (pos === 0 && r.bgmPos === 2 && this.skipped) {
      this.noIntro();
      extra = 0;
    } else if (r.bgmPos !== pos) return false;
    this.playBgm(extra);
    return true;
  }

  /** FUN_71001e4af0 — mg_bgm_label_no_intro(표 104행 모두 빈 값) */
  private noIntro(): void {
    const r = this.rec!;
    if (this.bgm || !r.bgmNoIntro) return;
    this.bgm = { label: r.bgmNoIntro, delay: 0, playing: true, region: null };
    this.emit({ k: 'bgm', label: r.bgmNoIntro, region: null });
  }

  /** FUN_71001e4c9c */
  private playBgm(extra: number): void {
    const r = this.rec!;
    const pending = !this.bgm || this.bgm.delay > 0;
    if (!pending || this.bgm?.playing || !r.bgm) return;
    const frames = r.bgmOffset === -1 ? 0 : r.bgmOffset + extra;
    if (!this.skipped) {
      this.bgm = { label: r.bgm, delay: 0, playing: false, region: null };
      if (frames === 0) this.startBgm();
      else this.bgm.delay = F(frames / 60);
    } else {
      const region = r.introSkipRegion || null;
      this.bgm = { label: r.bgm, delay: 0, playing: false, region };
      this.startBgm();
      if (region) this.regionJumped = true;
    }
  }

  private startBgm(): void {
    const b = this.bgm!;
    b.playing = true;
    b.delay = 0;
    this.emit({ k: 'bgm', label: b.label, region: b.region });
  }

  /** FUN_71001e4f28(immediate) — MG BGM 정지(stop_offset 있으면 지연) */
  stopBgm(immediate: boolean): void {
    const r = this.rec;
    if (this.bgm?.playing && r) {
      if (!immediate && r.bgmStopOffset !== 0) {
        this.bgmStopDelay = F(r.bgmStopOffset / 60);
        return;
      }
      this.emit({ k: 'bgmStop', fadeSec: fadeSec(r.bgmStopFade) });
    }
    this.bgm = null;
  }

  /** FUN_71001e559c — finish_jingle_label(표 104행 모두 빈 값) */
  finishJingle(): void {
    const r = this.rec;
    if (!r || !r.finishJingle) return;
    this.jingle = { label: r.finishJingle, delay: F(r.finishJingleOffset / 60), playing: false, region: null };
    if (r.finishJingleOffset === 0) this.startJingle();
  }

  /** MGSound::TryStartResultSound(timing, telopType) */
  resultSound(timing: number, telopType: number, gameRule: number, players: readonly MgPlayer[]): boolean {
    const r = this.rec;
    if (!r || r.resultPos !== timing || this.resultDone) return false;
    const label = resultJingleLabel(gameRule, timing, telopType, players);
    if (label) {
      this.jingle = { label, delay: F(r.resultOffset / 60), playing: false, region: null };
      if (r.resultOffset === 0) this.startJingle();
    }
    this.resultDone = true;
    return true;
  }

  private startJingle(): void {
    const j = this.jingle!;
    j.playing = true;
    j.delay = 0;
    this.emit({ k: 'jingle', label: j.label });
  }

  /** MGSound::TryStartWhistle(type) */
  whistle(type: number): void {
    if (this.rec && this.rec.whistle === type) this.emit({ k: 'se', label: 'SQ_SE_SYS_WHISTLE' });
  }

  /** FUN_71001e597c — 오프닝 건너뛰기(단계 4) */
  openingSkip(): void {
    this.emit({ k: 'se', label: 'SQ_SE_SYS_SKIP' });
    this.skipped = true;
    if (this.bgm?.playing) {
      if (this.rec?.introSkipRegion) {
        this.bgm.region = this.rec.introSkipRegion;
        this.regionJumped = true;
        this.emit({ k: 'bgm', label: this.bgm.label, region: this.bgm.region });
      } else {
        this.bgm = null;
        this.emit({ k: 'groupStop', groups: [0x22], sec: 0.3 });
      }
    }
    this.emit({ k: 'groupStop', groups: [0x23, 1, 0x25], sec: 0.3 });
  }

  /** FUN_71001e4308 — 매 걸음 지연 재생 갱신 */
  update(dt: number): void {
    const b = this.bgm;
    if (b && !b.playing && b.delay > 0) {
      b.delay = F(b.delay - dt);
      if (!(b.delay > 0)) this.startBgm();
    }
    if (this.bgmStopDelay > 0) {
      this.bgmStopDelay = F(this.bgmStopDelay - dt);
      if (!(this.bgmStopDelay > 0)) {
        this.bgmStopDelay = 0;
        this.emit({ k: 'bgmStop', fadeSec: fadeSec(this.rec?.bgmStopFade ?? '') });
        this.bgm = null;
      }
    }
    const j = this.jingle;
    if (j && !j.playing && j.delay > 0) {
      j.delay = F(j.delay - dt);
      if (!(j.delay > 0)) this.startJingle();
    }
  }

  get bgmLabel(): string | null {
    return this.bgm?.label ?? null;
  }

  get bgmPlaying(): boolean {
    return !!this.bgm?.playing;
  }
}
