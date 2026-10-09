/**
 * 공용 캐릭터 런타임 mpj 연결 — docs/engine/09_character.md §14.1·§14.2.
 * createCharacter(pc, {...}): 공용 에셋(assets/chara/<pc>: 모델·motion/*.glb·motions.json·ftrg.json, chara/ftrg_base.json·mpat.json),
 * 캐릭터 선택 명세(assets/charselect/spec.json — 몸·눈 셰이더 그래프·배율·환경), characterlist 시선 값(assets/mg1801/chara/index.json head·eyes)을 모아
 * 캐릭터 선택 Preview3D 한 칸(로더 관리자 broker 경유 받기·GPU 미리 준비·몸/눈 그래프·모션 = 공용 코어)을 빌려 장면 그룹 root 에 올린다(광장 플레이어와 같은 방식).
 * 미니게임은 chara.play('co_run00') 처럼 부르고 step()/update(dt) 만 돌리면 전이·깜빡임·시선·모션 이벤트(발소리·보이스)가 원본 규칙대로 나온다.
 * 사건 → routeCharacterEvents: se·voice = mgscene 사운드(MgSceneSound.onEvents, bgmstream 아님), vib = 장면 진동 표(없으면 Gamepad rumble), fx = 사건만(이펙트 런타임 없음).
 * 위치·회전은 바깥(ComActor 이동·충돌은 다음 작업)이 setPosition/setRotation 으로 넣는다. 보조 물리·face_param 은 코어 자리만(09 §13).
 */
import * as THREE from 'three';
import {
  EyeLook,
  FtrgBank,
  HEAD_RULES_ORIGINAL,
  HEAD_RULES_WEB,
  HeadLook,
  RULES_ORIGINAL,
  RULES_WEB,
  STEP_SEC,
  headInput,
  mpatRows,
  type CharacterCore,
  type CharacterEvent,
  type FtrgSource,
  type PlayOptions,
} from '@game/lib/character';
import { HeadView, type HeadTarget } from '@game/lib/character-three';
import { Preview3D } from '../shell/charselect/preview3d';
import type { CharaSpec, Spec } from '../shell/charselect/types';
import { ASSETS } from '../env';
import type { PadSource } from './input';

/** mg1801/chara/index.json 한 항목 중 시선 값(characterlist head_*·eye{i}_*) */
interface HeadInfo {
  head: { min_x: number; min_y: number; min_z: number; max_x: number; max_y: number; max_z: number; weight: number; chincoef: number };
  eyes: { shaderparam: string | null; t_offset_x: number; t_offset_y: number; t_scale_x: number; t_scale_y: number; t_rot: number; t_min_x: number; t_min_y: number; t_max_x: number; t_max_y: number }[];
}

export interface CreateCharacterOptions {
  /** GPU 미리 준비(컴파일·텍스처)에 쓰는 렌더러 */
  renderer: THREE.WebGLRenderer;
  /** assets/ 기준 경로 → URL(기본 ASSETS + 경로) */
  url?: (p: string) => string;
  /** 읽을 모션(기본 motions.json 전부) */
  motions?: readonly string[];
  /** 원본 스위치 묶음: 모션 RULES_ORIGINAL(mpat a/b·α/β, 이전 포즈 고정·본/shape 전이 clamp) + 시선 HEAD_RULES_ORIGINAL(뒤 40°/60°·턱·목) */
  original?: boolean;
  /** 전이표 이름(등록 순서 = 장면/캐릭터 → 장면/공통 → sys/캐릭터 → sys/공통), 기본 ['sys_pc'] */
  mpat?: readonly string[];
  /** FTRG 자동 부착 6 접두 밖에 더 붙일 접두(예 'rc_' — 리듬 장면) */
  ftrgPrefixes?: readonly string[];
  /** 시작 프레임·자원 선택 난수 0..n−1 */
  rand?: (n: number) => number;
  /** 준비 사이 기다림(기본 setTimeout 0) */
  tick?: () => Promise<void>;
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`캐릭터: ${url} 를 읽지 못했다 (${r.status})`);
  return (await r.json()) as T;
}

/** 캐릭터 한 명(장면에 올린 root + 공용 코어 + three 시선) */
export class MpjCharacter {
  readonly root = new THREE.Group();
  private target: HeadTarget = null;
  private readonly inp = headInput();
  private acc = 0;
  /** 머리·눈 시선 켬(원본 SetHeadLookEnabled·SetEyesLookEnabled) */
  headOn = true;
  eyesOn = true;
  steps = 0;

  constructor(
    readonly pc: string,
    readonly spec: CharaSpec,
    private readonly preview: Preview3D,
    readonly head: HeadView | null,
    readonly eyes: (EyeLook | null)[],
  ) {
    this.root.name = `Character_${pc}`;
    this.root.add(preview.slots[0].root!);
    if (head) head.bind(this.root);
  }

  get core(): CharacterCore {
    return this.preview.slots[0].core;
  }

  get motion(): string {
    return this.core.main.name;
  }

  get frame(): number {
    return this.core.main.frame;
  }

  /** 모션 재생 — {blend 초, speed, start(프레임|'random'), force, next, type} */
  play(name: string, o: PlayOptions = {}): void {
    this.preview.playMotion(0, name, o);
  }

  /** 시선 대상: 월드 위치, 물체(뼈 이름), 또는 null(SetTargetNone) */
  lookAt(t: THREE.Vector3 | THREE.Object3D | null, bone?: string): void {
    this.target = !t ? null : (t as THREE.Vector3).isVector3 ? { pos: t as THREE.Vector3 } : { obj: t as THREE.Object3D, bone };
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  /** Y 축 회전(rad) 또는 사원수 */
  setRotation(r: number | THREE.Quaternion): void {
    if (typeof r === 'number') this.root.rotation.set(0, r, 0);
    else this.root.quaternion.copy(r);
  }

  /** 모션 이벤트(SE·보이스·진동·이펙트) — 사건 객체는 콜백 안에서만 읽는다 */
  on(cb: (e: CharacterEvent) => void): () => void {
    return this.core.on(cb);
  }

  /** 발소리 지면(co_ground 이름, 예 'wood_light') */
  setGround(name: string | null): void {
    this.core.ground = name;
  }

  /** 고정 스텝 하나(1/60): 모션 진행·이벤트 → 포즈·깜빡임·보임 → 머리 시선 → 눈 UV */
  step(): void {
    const slot = this.preview.slots[0];
    this.preview.update();
    this.steps++;
    const look = this.head?.look;
    if (this.head && look) {
      const m = this.core.main;
      const inp = this.inp;
      inp.headOn = this.headOn;
      inp.eyesOn = this.eyesOn;
      inp.motionWeight = m.info?.headLookWeight ?? NaN;
      inp.speedScale = m.speed * m.conditionSpeed;
      this.head.apply(this.root, 1, this.target, inp);
    }
    const eye = slot.eye;
    if (eye && look)
      this.eyes.forEach((el, i) => {
        if (!el) return;
        const u = (i === 0 ? eye.eyeOffset0 : eye.eyeOffset1).value;
        el.setMotion(u.x, u.y);
        el.updateFrom(1, look);
        if (el.has) u.set(el.outX, el.outY);
      });
  }

  /** 벽시계 dt(초) → 고정 스텝(최대 4) */
  update(dt: number): number {
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP_SEC - 1e-9 && n < 4) {
      this.acc -= STEP_SEC;
      this.step();
      n++;
    }
    if (n === 4) this.acc = 0;
    return n;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.preview.dispose();
  }
}

/** 캐릭터 하나 만들기(모델·모션·FTRG·전이표·시선 값 읽기 → 준비 끝까지 기다림) */
export async function createCharacter(pc: string, o: CreateCharacterOptions): Promise<MpjCharacter> {
  const url = o.url ?? ((p: string) => `${ASSETS}${p}`);
  const [cs, motions, heads, ftrgPc, ftrgBase, mpat] = await Promise.all([
    getJson<Spec>(url('charselect/spec.json')),
    getJson<Record<string, { frames: number; loop: boolean }>>(url(`chara/${pc}/motions.json`)),
    getJson<Record<string, HeadInfo>>(url('mg1801/chara/index.json')).catch(() => ({}) as Record<string, HeadInfo>),
    getJson<{ model: string; sources: Record<string, FtrgSource> }>(url(`chara/${pc}/ftrg.json`)).catch(() => null),
    getJson<{ sources: Record<string, FtrgSource> }>(url('chara/ftrg_base.json')).catch(() => null),
    getJson<Record<string, [string | null, string | null, number, number, number, number][]>>(url('chara/mpat.json')).catch(() => ({}) as Record<string, never>),
  ]);
  const base = cs.chars.find((c) => c.pc === pc);
  if (!base) throw new Error(`캐릭터: 명세에 없는 ${pc}`);
  const names = (o.motions ?? Object.keys(motions)).filter((n) => motions[n]);
  const c: CharaSpec = {
    ...base,
    anims: names.map((n) => `../chara/${pc}/motion/${n}.glb`),
    clips: Object.fromEntries(names.map((n) => [n, { frames: motions[n].frames, loop: motions[n].loop }])),
  };
  const rand = o.rand ?? ((n: number) => Math.floor(Math.random() * n));
  const ftrg = ftrgPc ? new FtrgBank({ ...(ftrgBase?.sources ?? {}), ...ftrgPc.sources }, ftrgPc.model, o.ftrgPrefixes ?? []) : null;
  const tables = (o.mpat ?? ['sys_pc']).map((n) => mpatRows(mpat[n] ?? []));
  const preview = new Preview3D({ chars: [c], env: cs.env } as unknown as Spec, (p) => url(`charselect/${p}`), rand, {
    rules: (o.original ?? true) ? RULES_ORIGINAL : RULES_WEB,
    mpat: tables,
    ftrg,
    rand01: () => rand(0x1000000) / 0x1000000,
  });
  preview.setup([[1, 1]]);
  preview.prefetch([0]);
  preview.setChara(0, 0, true);
  const t0 = performance.now();
  while (!preview.slots[0].root) {
    if (performance.now() - t0 > 60000) throw new Error(`캐릭터 준비 시간 초과: ${pc}`);
    preview.render(o.renderer);
    await (o.tick ? o.tick() : new Promise((res) => setTimeout(res, 0)));
  }
  const hi = (heads as Record<string, HeadInfo>)[pc];
  const h = hi?.head;
  const look = h
    ? new HeadLook({ minDeg: [h.min_x, h.min_y, h.min_z], maxDeg: [h.max_x, h.max_y, h.max_z], weight: h.weight, chinCoef: h.chincoef }, (o.original ?? true) ? HEAD_RULES_ORIGINAL : HEAD_RULES_WEB)
    : null;
  const params = c.eye?.params ?? ['material_utility_parameter1', 'material_utility_parameter0'];
  const eyes = params.map((p) => {
    const e = hi?.eyes.find((x) => x.shaderparam === p);
    return e ? new EyeLook({ ox: e.t_offset_x, oy: e.t_offset_y, sx: e.t_scale_x, sy: e.t_scale_y, rot: e.t_rot, minx: e.t_min_x, miny: e.t_min_y, maxx: e.t_max_x, maxy: e.t_max_y }, 'blend') : null;
  });
  return new MpjCharacter(pc, c, preview, look ? new HeadView(look) : null, eyes);
}

/** 사건 받는 곳: mgscene 사운드(se·voice), 진동(장면 표가 있으면 vibrate 가 true, 없으면 패드 rumble) */
export interface CharacterEventSinks {
  sound?: { onEvents(events: readonly { k: 'se' | 'voice'; label: string }[]): void } | null;
  pad?: PadSource | null;
  vibrate?(key: string, label: string): boolean;
  /** 모든 사건(보기·로그) */
  log?(e: CharacterEvent): void;
}

/** 모션 이벤트 → 기존 공용 모듈. 이펙트(fx)는 이펙트 런타임이 없어 사건만 낸다(받는 쪽 비움) */
export function routeCharacterEvents(ch: MpjCharacter, sinks: CharacterEventSinks): () => void {
  const one = { k: 'se' as 'se' | 'voice', label: '' };
  const arr = [one];
  return ch.on((e) => {
    sinks.log?.(e);
    if (e.kind === 'se' || e.kind === 'voice') {
      one.k = e.kind;
      one.label = e.label;
      sinks.sound?.onEvents(arr);
    } else if (e.kind === 'vib') {
      if (!sinks.vibrate?.(e.key, e.label)) sinks.pad?.rumble?.(100);
    }
  });
}
