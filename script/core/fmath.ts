/**
 * f32 수학 — 원본(AArch64)은 float 연산이 많다. 원본이 float 에 저장하는 값은 저장할 때마다 F() 로 자른다.
 * 계산 중간을 double 로 둘지 f32 로 자를지는 함수마다 판독해서 정한다(DESIGN 3절). 이 파일은 그 도구만 둔다.
 */

export const F = Math.fround;

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x: F(x), y: F(y), z: F(z) });

export const setV3 = (o: V3, x: number, y: number, z: number): V3 => {
  o.x = F(x);
  o.y = F(y);
  o.z = F(z);
  return o;
};

export const copyV3 = (o: V3, a: V3): V3 => setV3(o, a.x, a.y, a.z);

/** a + b·s (f32 로 한 번 자른다) */
export const addScaledV3 = (o: V3, a: V3, b: V3, s: number): V3 => setV3(o, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** a + (b - a)·t */
export const lerpF = (a: number, b: number, t: number): number => F(a + (b - a) * t);

/** C 의 (int)float 변환(0 쪽 절삭) */
export const toInt = (v: number): number => Math.trunc(v) | 0;

export const DEG2RAD = F(0.017453292);

/** u32 비트 → f32 값(원본 상수를 비트 그대로 옮길 때) */
export const f32FromBits = (u: number): number => new Float32Array(new Uint32Array([u >>> 0]).buffer)[0];
