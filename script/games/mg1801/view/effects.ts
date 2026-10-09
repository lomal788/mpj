/**
 * mg1801 이펙트(파티클) — 원본 bex::Effect / nn::vfx2 이미터셋을 웹에서 재현한다.
 *
 * 자료: assets/mg1801/effect/effects.json(tools/mg1801_web_effects.py 가 effect_vfxb.py 덤프 raw 값을 그대로 옮긴 것),
 *       tex/*.png(원본 텍스처 그대로), primitives.glb(BFRES 메시 프리미티브 4개). 명세: docs/engine/08_effects.md.
 *
 * 쓰는 이미터셋: mg1801_steam00/01, mg1801_water_entry00/01, mg1800_success00/01, mg_common_pt_effect_00(PERFECT, 배율 1.5).
 * 로직 사건 별칭: 'ca::rm::util::ShowCommonEffect#0' = mg1800_success01(JUST), '#1' = mg1800_success00(FAST·SLOW).
 * 이름 해석은 원본 3단계(소문자·'/'→'\'·경로 비교, 확장자 제거 뒤 이미터셋 이름 비교)를 이름 비교만으로 줄였다 [판독 3.3].
 * 없는 이름: 원본은 Abort, 웹은 경고 후 -1 을 돌려준다(08_effects.md 10.2).
 *
 * 시간: 원본 vfx2 는 고정 60 fps 프레임 단위다. update(dtSec) 가 dt·60 프레임을 쌓고, 방출은 이미터 정수 프레임마다 한다.
 * 입자 상태는 생성 때 한 번 GPU 인스턴스 속성으로 올리고, 위치·색·크기는 정점 셰이더가 나이(프레임)로 계산한다
 * (원본도 Static 블록을 상수 버퍼로 넘겨 셰이더가 계산한다 [판독 4.3]). 이미터 정의마다 InstancedBufferGeometry 하나(링 버퍼).
 *
 * 원본 판독으로 따른 것 [판독: main vfx2, analysis/decomp/effect_vfx2_calc.c 와 이번에 디컴파일한 함수]:
 * - 방출 난수 = 이미터 LCG x' = x·0x41C64E6D + 0x3039, u = x·2^-32(갱신 전 값).
 * - one-time 보정 duration < interval → interval = duration, 간격 = interval+1 프레임, 방출 창 [start, start+duration).
 * - 한 번 방출 수: CircleDiv(2)·LineDiv(13)·primEmitType 0 이면 (numDivide − ⌊u·divRandom·0.01·numDivide⌋) × rate 개
 *   (FUN_710074f620). 분할 위치 i = 입자 번호 mod (분할 수+1), 각 = 시작 − 경도/2 + 경도/분할 수·i + surfacePosRandom·(2u−1)
 *   (FUN_7100752c38). 원 시작각은 sweepStartRandom 이면 호출 단위 난수 2πu.
 * - Circle(1): 각 = 시작 + 경도·u − 경도/2, 위치 (sin·rx, 0, cos·rz), 방향 = (sin,0,cos)·allDirection (FUN_7100750f28).
 * - Box(10): 면 하나(u<1/3 Z면, <2/3 Y면, 나머지 X면)를 고르고 그 축은 ±반경, 나머지 축은 [−r, r] 균등, 방향 = 정규화(위치)·allDirection.
 * - 크기 난수 = base·(1 − u·scaleRandom/100)(xyz 같으면 난수 하나), 수명 = ⌊L·(1 − ⌊u·lifeRandom⌋/100)⌋,
 *   momentumRandom m → 1 + m − 2um (FUN_710074f880).
 * - xzDiffusion: 속도 += 정규화(위치.xz)·값, positionRandom: 위치 += 단위벡터·값, diffusionDirAngle: cos 범위 1 − 각/90 (FUN_710074fea4 일부).
 *
 * 근사(원본과 다를 수 있는 것):
 * 1. 입자 운동: 프레임마다 v = v·airRes + gravity, p += v 를 닫힌 식으로 계산(08_effects.md 6.3 CPU 근사의 해석식). 원본 셰이더 식 미판독.
 * 2. 색 합성: rgb = mix(color1, color0, tex.rgb) × colorScale, a = alpha0 × alpha1 × texA. 컴바이너 열거 미판독
 *    (color1 이 JUST 주황·FAST 파랑 반짝임을 정하므로 텍스처 보간형으로 둠). 알파 없는 텍스처(BC1·BC7 RGB)는 max(r,g,b) 를 알파로 쓴다.
 *    두 번째 텍스처(같은 그림 스크롤)는 곱한다. flowmap(wave00/01 의 두 번째)은 쓰지 않는다.
 * 3. 커스텀 셰이더(SHADER_1, 샘플러 0 = *_nml, 1 = water_land00_01, 2 = 알베도): water_land00_01 을 매트캡(구형 환경맵)으로 보고
 *    노말(노말맵 또는 메시 법선)로 찾은 색 × 위 2번 색. CSDP 값·굴절·소프트 파티클·깊이 페이드는 쓰지 않는다.
 *    UV 없는 mg1801_bubble00 메시는 알베도를 뷰 법선 y 로 찾는다.
 * 4. 키 보간: 시간 비율 r = 나이/수명, 첫 키 앞은 첫 키, 끝 키 뒤는 끝 키, 사이는 선형(08_effects.md 6.3 [추정]).
 * 5. billboardType: 0 = 화면 정렬 사각형(또는 프리미티브 메시의 xy), 3 = 메시를 월드에 그대로(회전 ZYX), 4 = XZ 수평판(Y 회전).
 *    사각형은 1×1(−0.5..0.5), UV 왼쪽 위 원점(텍스처 flipY=false). 회전 순서 ZYX(= FRES EulerXYZ)는 [추정].
 * 6. 텍스처: wrap 0 = Mirror, 1 = Repeat, repeat 0/1/2/3 = UV 1×1/2×1/1×2/2×2 [데이터·추정 4.4]. invRandU/V = 입자마다 1/2 확률 반전,
 *    텍스처 스크롤·회전·스케일은 uv = 회전(uv) × scale × repeat + scroll + scrollAdd·나이 로 근사.
 * 7. 필드(FRND 흔들림·FSPN 스핀·FRN1)는 적용하지 않는다. 자식 이미터(steam00 bubble00 → crown00)는 부모 입자 나이 ⌊수명·timing/100⌋ 에
 *    그 위치에서 한 번 방출한다. 이미터 회전·크기는 위치·속도에만 적용하고 입자 크기에는 적용하지 않는다.
 * 8. 방출 정지(stop): 연속 방출만 멈추고 남은 입자는 수명대로 사라진다(원본 Stop(bool) 동작 미판독). 레이어 비트·정렬(sortType)·
 *    alphaFadeTime(정지 페이드)·intervalRandom 은 쓰지 않는다. isAlphaFadeIn 은 이미터 시작부터 fadeInTime 프레임 동안 알파를 올린다.
 * 9. Point(0) 방향은 원본 512개 단위벡터 표 대신 LCG 로 고른 균등 단위벡터. Sphere(4)도 같은 단위벡터 × 반경(위도·경도 범위 전체일 때만 맞다).
 *    이미터 LCG 시드는 원본 값을 모른다(시스템 LCG 로 정한다).
 * 10. 깊이 기록은 하지 않는다(isDepthMask 무시, depthWrite false). isDepthTest 는 따른다. 그리기 순서는 이미터셋·이미터 순서.
 * 11. 이미터셋 배율(bex::Effect::SetScale → 내부+0x60, 행렬로 반영)은 방출 위치(모양)·속도·입자 크기에 곱한다. 모양·allDirection 에 곱하는 것은
 *    08_effects.md 4절 [판독], 입자 크기·지정 방향 속도에 곱하는 것은 [추정]. 중력은 곱하지 않는다. SetAnimationSpeed(PlayRate)는 PERFECT 이펙트에만 BPM/120 으로 건다(index.ts, mg1801.md camgcmm_tlp_perfect).
 *
 * 2026-10-09 공용 이펙트 런타임 이전(08_effects.md §14): 위 계산은 lib/effect(코어, import 0)·lib/effect-three(three 어댑터)·view/effect.ts(mpj 연결)로 옮겼고,
 * 이 파일은 같은 이름·생성자·공개 메서드(EffectSystem: load·spawn·start·stop·update·dispose·activeCount)만 남겨 view/index.ts 를 바꾸지 않는다.
 * 위 1~11 근사는 RULES_WEB(이전 웹 그대로, 골든 같음)이고, 기본은 RULES_ORIGINAL(사용자 결정 — 항목별 차이는 08 §14.5 원본 스위치 표)이다.
 */
import type * as THREE from 'three';
import type { EffectRules } from '../../../lib/effect';
import type { Assets } from '../../../view/assets';
import { MpjEffects, assetsLoader } from '../../../view/effect';

type Vec3 = { x: number; y: number; z: number };

export class EffectSystem {
  /** 공용 이펙트 시스템(코어 + three 보기) — 시험·보기에서 직접 읽는다 */
  readonly fx: MpjEffects;
  private acc = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: Assets,
    o: { rules?: Readonly<EffectRules>; seed?: number } = {},
  ) {
    this.fx = new MpjEffects(this.scene, { loader: assetsLoader(this.assets), name: 'mg1801_effects', rules: o.rules, seed: o.seed });
  }

  async load(): Promise<void> {
    await this.fx.load(['effect/effects.json']);
  }

  /** 원본 Create + SetPosition(+ SetScale) + Start, selfDestroy = true. 반환 = 핸들(실패 −1) */
  spawn(name: string, pos: Vec3, scale = 1, rate?: number): number {
    return this.create(name, pos, true, scale, rate);
  }

  /** 반복 이미터(김)용. stop 할 때까지 남는다 */
  start(name: string, pos: Vec3): number {
    return this.create(name, pos, false);
  }

  /** 방출을 멈춘다. 남은 입자는 수명대로 사라지고 인스턴스도 그때 지운다 */
  /* 원본 규칙(기본)은 MapImpl::ReceiveState(0,6) 의 Stop(false) = 이미터셋 즉시 kill 뒤 핸들을 버린다(08 §5.3·§14.5) */
  stop(handle: number): void {
    const c = this.fx.core;
    if (c.rules.stop === 'web') {
      c.stop(handle);
      return;
    }
    c.stop(handle, false);
    c.release(handle);
  }

  update(dtSec: number): void {
    if (!this.fx.loaded) return;
    this.acc += Math.min(Math.max(dtSec, 0), 0.25) * 60;
    while (this.acc >= 1 - 1e-9) {
      this.acc -= 1;
      this.fx.core.step();
    }
    this.fx.sync();
  }

  dispose(): void {
    this.fx.dispose();
  }

  /** 살아 있는 인스턴스 수(시험용) */
  get activeCount(): number {
    return this.fx.core.activeCount;
  }

  private create(name: string, pos: Vec3, selfDestroy: boolean, scale = 1, rate?: number): number {
    if (!this.fx.loaded) return -1;
    const h = this.fx.play(name, pos, { scale, selfDestroy, rate });
    this.fx.sync();
    return h;
  }
}
