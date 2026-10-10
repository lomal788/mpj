/**
 * 공용 이펙트 런타임 mpj 연결 — docs/engine/08_effects.md §14.1·§14.2.
 * createEffectSystem(parent, {loader | assets, files}): 코어(lib/effect) + three 어댑터(lib/effect-three)를 묶어 장면 그룹에 올리고,
 * 미니게임·셸은 fx.play('mg1801_water_entry00', pos) 처럼 이름으로 부르고 update(dt)/step() 만 돌린다(고정 1/60, 최대 15 스텝).
 * - 에셋: Assets(게임 폴더) 경유 — json·gltf·텍스처 모두 공용 로더 관리자. 수정 가능한 장면 복제본을 사용한다.
 * - 공용 성공 이펙트: ca::rm::util::ShowCommonEffect(id, pos) 표 CMN_EFFECT_ID(0 = mg1800_success01 JUST, 1 = mg1800_success00 FAST·SLOW, §3.4).
 * - 캐릭터 FX 트리거(05 §7.5): routeCharacterFx(ch, fx) — fx 사건의 .eset 을 훅 본(없으면 캐릭터 root)에 Attach 해 재생, 키 '_Stop' 은 같은 키를 fade 정지 [추정].
 * 원본 스위치: 기본 = 코어 effectDefaults(원본 규칙, 2026-10-09 사용자 결정). original:false 면 RULES_WEB.
 */
import * as THREE from 'three';
import { EffectCore, RULES_ORIGINAL, RULES_WEB, Xorshift128, effectDefaults, type EffectRules, type MatrixSource } from '@game/lib/effect';
import { EffectView, type EffectLoader } from '@game/lib/effect-three';
import type { CharacterEvent } from '@game/lib/character';
import type { Assets } from './assets';

/** CMN_EFFECT_ID 표 @0x71019f1aa8 [데이터 §3.4] */
export const CMN_EFFECT_ID = ['mg1800_success01', 'mg1800_success00'] as const;

/** 지금 웹에 있는 이펙트 자료(Assets 게임 폴더 기준) — mg1801 이 mg/mg1801·mg/mg1800·libca/mg_common 을 함께 가진다 */
export const EFFECT_FILES = { mg1801: 'effect/effects.json' } as const;

/** Assets(게임 폴더) → 받기 끼움점 */
export function assetsLoader(assets: Assets): EffectLoader {
  return {
    json: <T>(p: string) => assets.json<T>(p),
    texture: (p: string) => assets.texture(p),
    gltf: (p: string) => assets.gltf(p),
  };
}

export interface EffectSystemOptions {
  loader: EffectLoader;
  /** 원본 규칙(기본 effectDefaults.rules). rules 를 주면 그것 */
  original?: boolean;
  rules?: Readonly<EffectRules>;
  /** 결정성: 원본 공유 seed 원천(xorshift128) 씨앗 — 기본 고정값. web 은 이전 웹 시스템 LCG 0x12345678 */
  seed?: number;
  /** 장면 그룹 이름 */
  name?: string;
  warn?: (msg: string) => void;
}

export interface PlayOptions {
  /** SetScale */
  scale?: number;
  /** SetSelfDestroyEnabled(기본 true) */
  selfDestroy?: boolean;
  /** SetLayerVisibilityBit */
  layer?: number;
  /** SetAnimationSpeed(PlayRate) */
  rate?: number;
  /** Attach 대상 */
  attach?: THREE.Object3D | null;
}

/** THREE 물체 → 코어 부착 행렬 원천(월드 행렬) */
export function objectSource(obj: THREE.Object3D): MatrixSource {
  return {
    readMatrix(out: Float64Array): void {
      obj.updateWorldMatrix(true, false);
      const e = obj.matrixWorld.elements;
      for (let i = 0; i < 16; i++) out[i] = e[i];
    },
  };
}

/** 이펙트 시스템 하나(코어 + three 보기) */
export class MpjEffects {
  readonly core: EffectCore;
  readonly view: EffectView;
  private acc = 0;

  constructor(
    parent: THREE.Object3D,
    private readonly o: EffectSystemOptions,
  ) {
    const rules = o.rules ?? (o.original === undefined ? effectDefaults.rules : o.original ? RULES_ORIGINAL : RULES_WEB);
    const g = new Xorshift128((o.seed ?? 0x2545f491) >>> 0 || 1, 0x9e3779b9, 0x7f4a7c15, 0x94d049bb);
    this.core = new EffectCore({ rules, seed: () => g.next() });
    this.core.warn = o.warn ?? ((m) => console.warn(m));
    this.view = new EffectView(this.core, parent, o.name ?? 'effects');
  }

  get loaded(): boolean {
    return this.view.loaded;
  }

  /** 이펙트 자료 읽기(등록 순서 = 이름 충돌 우선순위) */
  async load(files: readonly string[] = [EFFECT_FILES.mg1801]): Promise<void> {
    for (const f of files) await this.view.load(this.o.loader, f);
  }

  /** Create → (SetScale·SetSelfDestroy·SetLayer·SetAnimationSpeed·Attach) → SetPosition → Start(false). 반환 = 핸들(실패 −1) */
  play(name: string, pos: { x: number; y: number; z: number } | null, o: PlayOptions = {}): number {
    if (!this.loaded) return -1;
    const c = this.core;
    const h = c.create(name);
    if (h < 0) return -1;
    if (o.scale !== undefined) c.setScale(h, o.scale);
    c.setSelfDestroy(h, o.selfDestroy ?? true);
    if (o.layer !== undefined) c.setLayerBits(h, o.layer);
    if (o.rate !== undefined) c.setAnimationSpeed(h, o.rate);
    if (o.attach) c.attach(h, objectSource(o.attach));
    if (pos) c.setPosition(h, pos.x, pos.y, pos.z);
    c.start(h);
    return h;
  }

  /** ca::rm::util::ShowCommonEffect(id, pos): Create → Setup → SetSelfDestroy(1) → SetPosition → Start(false) [판독 §3.4] */
  showCommonEffect(id: number, pos: { x: number; y: number; z: number }): number {
    const name = CMN_EFFECT_ID[id];
    return name ? this.play(name, pos) : -1;
  }

  attach(h: number, obj: THREE.Object3D | null): void {
    this.core.attach(h, obj ? objectSource(obj) : null);
  }

  setPosition(h: number, x: number, y: number, z: number): void {
    this.core.setPosition(h, x, y, z);
  }

  /** Stop(fade) — 원본: false = 즉시 kill, true = fade(§5.3) */
  stop(h: number, fade = false): void {
    this.core.stop(h, fade);
  }

  release(h: number): void {
    this.core.release(h);
  }

  /** 고정 스텝 하나 + GPU 올리기 */
  step(): void {
    this.core.step();
    this.view.sync();
  }

  /** 벽시계 dt(초) → 고정 스텝(최대 15 = 0.25 s) → GPU 올리기. 돈 스텝 수 */
  update(dt: number): number {
    this.acc += Math.min(Math.max(dt, 0), 0.25) * 60;
    let n = 0;
    while (this.acc >= 1 - 1e-9 && n < 15) {
      this.acc -= 1;
      this.core.step();
      n++;
    }
    if (n === 15) this.acc = 0;
    this.view.sync();
    return n;
  }

  /** 렌더 전 올리기만(생성 직후 등) */
  sync(): void {
    this.view.sync();
  }

  dispose(): void {
    this.core.clear();
    this.view.dispose();
  }
}

/** 만들고 읽기까지 */
export async function createEffectSystem(parent: THREE.Object3D, o: EffectSystemOptions & { files?: readonly string[] }): Promise<MpjEffects> {
  const fx = new MpjEffects(parent, o);
  await fx.load(o.files);
  return fx;
}

/** 캐릭터 한 명(MpjCharacter 등 — root·on 만 쓴다) */
export interface FxOwner {
  readonly root: THREE.Object3D;
  on(cb: (e: CharacterEvent) => void): () => void;
}

/**
 * 캐릭터 런타임 fx 사건(FTRG 종류 1, 05 §7.5) → 이펙트. 라벨 = 고른 .eset 자원 이름(이름 해석 §3.3 의 확장자 규칙),
 * 훅 = 본/로케이터 이름(없으면 root)에 Attach. 키 '<KEY>_Stop' 은 같은 키로 만든 이펙트를 Stop(true) [추정: 키 이름 규칙].
 * 없는 이름은 코어가 한 번 경고하고 무시(원본은 Abort, 웹 자료에 bq 상주 fx_* 가 아직 없다).
 */
export function routeCharacterFx(ch: FxOwner, fx: MpjEffects, log?: (e: CharacterEvent, handle: number) => void): () => void {
  const live = new Map<string, number>();
  return ch.on((e) => {
    if (e.kind !== 'fx') return;
    const stop = e.key.endsWith('_Stop');
    const key = stop ? e.key.slice(0, -5) : e.key;
    if (stop) {
      const h = live.get(key);
      if (h !== undefined) {
        fx.stop(h, true);
        live.delete(key);
      }
      log?.(e, h ?? -1);
      return;
    }
    const bone = e.hook ? ch.root.getObjectByName(e.hook) : undefined;
    const h = fx.play(e.label, null, { attach: bone ?? ch.root, selfDestroy: true });
    if (h >= 0) live.set(key, h);
    log?.(e, h);
  });
}
