/**
 * 텍스처 압축(빌드 단계, tools/build_assets.ts 가 부른다) — PNG 소스 → KTX2(Basis Universal) 또는 PNG 그대로.
 * 설계·기준: docs/engine/assets_pipeline.md §3.
 *
 * 종류(classify)
 *   keep   : PNG 그대로(무손실) — 글꼴 아틀라스, LUT·램프·SSS 확산표, 큐브맵 면, 가로·세로가 4의 배수가 아닌 것(BC/ETC 블록 정렬),
 *            2D 캔버스(new Image)로 직접 그리는 그림
 *   ui     : 2D 레이아웃 텍스처(render2d·lyt) — 밉 없음, 품질 우선(ETC1S 는 45 dB 이상일 때만)
 *   color  : 3D 색(알베도·발광 등 sRGB) — ETC1S 우선, 기준 미달이면 UASTC
 *   data   : 3D 선형 자료(거칠기·금속·AO·마스크·라이트맵 등) — ETC1S 우선, 기준 미달이면 UASTC
 *   normal : 3D 노멀 — UASTC 만(ETC1S 는 RG 두 채널 정밀도가 모자람)
 *
 * 품질 기준(GATE)은 basisu -stats 가 주는 0번 밉 PSNR(소스 PNG 대비, 8비트)로 판정한다. 시도 순서대로 첫 통과를 쓰고,
 * 끝까지 미달이면 마지막(UASTC, RDO 없음)을 쓴다(ui 는 그래도 미달이면 PNG). 결과 KTX2 가 PNG 보다 크고 64K 픽셀 이하면 PNG 를 쓴다(tiny).
 *
 * 색공간: KTX2 DFD 의 sRGB 표시는 인코더의 지각 지표·밉 필터에만 쓴다. 런타임은 PNG 경로와 같게 colorSpace 를 소비자가 정한다
 * (shell/stage3d/assetLoader.ts 가 KTX2 를 NoColorSpace 로 되돌림). flipY 는 모든 소비자가 false(glTF 규칙)라 뒤집지 않는다.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

export type TexClass = 'keep' | 'ui' | 'color' | 'data' | 'normal';

export interface TexHint {
  srgb?: boolean;
  format?: string;
  cube?: boolean;
  /** glb 재질 슬롯에서 본 쓰임 */
  slot?: 'color' | 'normal' | 'data';
  keep?: string;
}

export interface TexPlan {
  cls: TexClass;
  /** 지각(sRGB) 지표·sRGB 밉 */
  srgb: boolean;
  mips: boolean;
  reason: string;
}

export interface Psnr {
  /** 채널별 PSNR(dB) — 없는 채널은 빠짐 */
  R?: number;
  G?: number;
  B?: number;
  A?: number;
  RGB?: number;
  Y?: number;
  /** 채널별 최대 절대 오차(0..255) */
  maxErr?: number;
}

export interface TexResult {
  out: 'ktx2' | 'png';
  codec: 'etc1s' | 'uastc-rdo' | 'uastc' | 'png';
  bytes: number;
  psnr: Psnr | null;
  tries: { codec: string; bytes: number; psnr: Psnr | null; pass: boolean }[];
  reason: string;
  w: number;
  h: number;
  levels: number;
  /** KTX2 에 알파 채널이 있는지(DFD) */
  alpha: boolean;
}

/** 3D 텍스처가 있는 폴더(나머지는 2D UI). assets/ 기준 */
export const TEX3D_ROOTS = ['plaza/world/', 'plaza/player/', 'charselect/chara/', 'mg1801/tex/', 'mg1801/chara/', 'mg1801/effect/', 'mg1801/npc/', 'mg1801/model/'];
/** new Image() 로 2D 캔버스에 직접 그리는 그림(페이지 배경) */
export const CANVAS_IMAGES = ['modeselect/backdrop_temp.png'];

/** 품질 기준(dB). docs/engine/assets_pipeline.md §3.3 */
export const GATE = {
  color: { etc1sY: 40, etc1sRgb: 32, etc1sA: 36, uastcRgb: 38 },
  data: { etc1s: 38, uastc: 38 },
  normal: { uastc: 36 },
  ui: { etc1s: 45, uastc: 42, floor: 40 },
};
export const TINY_PIXELS = 256 * 256;
/** 인코더 설정이 바뀌면 올린다(증분 캐시 무효화) */
export const TEX_RECIPE = 'tex-v1';
/** 종류별 추가 버전(그 종류만 다시 인코딩) — color c2: 휘도(Y) 판독 고침 */
export const CLASS_RECIPE: Partial<Record<TexClass, string>> = { color: 'c2' };

export function pngInfo(file: string): { w: number; h: number; colorType: number } {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(33);
  fs.readSync(fd, b, 0, 33, 0);
  fs.closeSync(fd);
  if (b.readUInt32BE(12) !== 0x49484452) throw new Error(`PNG 가 아니다: ${file}`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}

const stem = (rel: string): string => path.posix.basename(rel).replace(/\.png$/i, '').replace(/_[0-9a-f]{12}$/, '');

export function classify(rel: string, w: number, h: number, hint: TexHint): TexPlan {
  const name = stem(rel);
  const keep = (reason: string): TexPlan => ({ cls: 'keep', srgb: false, mips: false, reason });
  if (hint.keep) return keep(hint.keep);
  if (CANVAS_IMAGES.includes(rel)) return keep('canvas2d');
  if (/(^|\/)font\//.test(rel) || /font/i.test(name)) return keep('font');
  if (hint.cube) return keep('cube');
  if (/(^|_)(lut|ramp|diff)(_|$)/i.test(name)) return keep('lut');
  if (w % 4 || h % 4) return keep('size%4');
  const is3d = TEX3D_ROOTS.some((r) => rel.startsWith(r));
  if (!is3d) return { cls: 'ui', srgb: true, mips: false, reason: 'ui' };
  if (hint.slot === 'normal' || /_(nml|nrm)(_|$)/.test(name)) return { cls: 'normal', srgb: false, mips: true, reason: hint.slot === 'normal' ? 'glb normalTexture' : 'name' };
  const colorByName = /_(alb|emi|col|base)(_|$)/.test(name);
  const srgb = hint.srgb ?? (hint.slot === 'color' ? true : hint.slot === 'data' ? false : colorByName);
  if (srgb) return { cls: 'color', srgb: true, mips: true, reason: hint.srgb !== undefined ? `format ${hint.format ?? 'srgb'}` : hint.slot ? 'glb color' : 'name' };
  return { cls: 'data', srgb: false, mips: true, reason: hint.srgb !== undefined ? `format ${hint.format ?? 'linear'}` : hint.slot ? 'glb data' : 'name' };
}

const require = createRequire(import.meta.url);
export function basisuPath(): string {
  const pkg = path.dirname(require.resolve('basis_universal/package.json'));
  const exe = path.join(pkg, 'bin', process.platform === 'win32' ? 'basisu.exe' : 'basisu');
  if (!fs.existsSync(exe)) throw new Error(`basisu 실행 파일이 없다: ${exe} (npm i -D basis_universal)`);
  return exe;
}

function run(exe: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((res, rej) => {
    const p = spawn(exe, args, { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', rej);
    p.on('close', (code) => res({ code: code ?? -1, out }));
  });
}

/** basisu -stats 출력의 첫 블록(0번 밉) */
export function parseStats(out: string): Psnr | null {
  const r: Psnr = {};
  let max = 0;
  let any = false;
  for (const line of out.split(/\r?\n/)) {
    const m = /^\.basis (RGBA|RGB|R|G|B|A|709 Luma)(?::|\s+Avg:)?\s*Max:\s*(\d+).*PSNR:\s*([\d.]+)/.exec(line);
    if (!m) continue;
    const key = m[1] === '709 Luma' ? 'Y' : m[1] === 'RGBA' ? null : (m[1] as 'R' | 'G' | 'B' | 'A' | 'RGB');
    if (!key) continue;
    if (r[key] !== undefined) continue;
    r[key] = Number(m[3]);
    if (key === 'R' || key === 'G' || key === 'B' || key === 'A') max = Math.max(max, Number(m[2]));
    any = true;
  }
  if (!any) return null;
  r.maxErr = max;
  return r;
}

const minCh = (p: Psnr | null): number => (p ? Math.min(...(['R', 'G', 'B', 'A'] as const).map((k) => p[k] ?? Infinity)) : 0);

interface Try {
  codec: 'etc1s' | 'uastc-rdo' | 'uastc';
  args: string[];
  pass: (p: Psnr | null) => boolean;
}

function tries(plan: TexPlan): Try[] {
  const etc1s: string[] = ['-q', '255', '-comp_level', '2'];
  const uastc = (rdo: number | null): string[] => ['-uastc', '-uastc_level', '2', ...(rdo ? ['-uastc_rdo_l', String(rdo)] : []), '-ktx2_zstandard_level', '19'];
  const g = GATE;
  switch (plan.cls) {
    case 'color':
      return [
        { codec: 'etc1s', args: etc1s, pass: (p) => !!p && (p.Y ?? 0) >= g.color.etc1sY && (p.RGB ?? 0) >= g.color.etc1sRgb && (p.A ?? Infinity) >= g.color.etc1sA },
        { codec: 'uastc-rdo', args: uastc(1), pass: (p) => !!p && (p.RGB ?? 0) >= g.color.uastcRgb },
        { codec: 'uastc', args: uastc(null), pass: () => true },
      ];
    case 'data':
      return [
        { codec: 'etc1s', args: etc1s, pass: (p) => minCh(p) >= g.data.etc1s },
        { codec: 'uastc-rdo', args: uastc(1), pass: (p) => minCh(p) >= g.data.uastc },
        { codec: 'uastc', args: uastc(null), pass: () => true },
      ];
    case 'normal':
      return [
        { codec: 'uastc-rdo', args: uastc(1), pass: (p) => minCh(p) >= g.normal.uastc },
        { codec: 'uastc', args: uastc(null), pass: () => true },
      ];
    case 'ui':
      return [
        { codec: 'etc1s', args: etc1s, pass: (p) => minCh(p) >= g.ui.etc1s },
        { codec: 'uastc-rdo', args: uastc(0.5), pass: (p) => minCh(p) >= g.ui.uastc },
        { codec: 'uastc', args: uastc(null), pass: (p) => minCh(p) >= g.ui.floor },
      ];
    default:
      return [];
  }
}

let tmpSeq = 0;
const TMP = path.join(os.tmpdir(), 'mpj-build-assets');

/** KTX2 헤더: 레벨 수(levelCount, 0 = 1)·알파 여부(DFD 표본 채널: ETC1S AAA=15, UASTC RGBA=3·RRRG=5) */
export function ktx2Info(file: string): { levels: number; alpha: boolean } {
  const b = fs.readFileSync(file);
  const levels = Math.max(1, b.readUInt32LE(40));
  const dfd = b.readUInt32LE(48);
  const model = b[dfd + 4 + 8];
  const blockSize = b.readUInt16LE(dfd + 4 + 6);
  let alpha = false;
  for (let o = dfd + 4 + 24; o + 16 <= dfd + 4 + blockSize; o += 16) {
    const ch = b[o + 3] & 15;
    if ((model === 163 && ch === 15) || (model === 166 && (ch === 3 || ch === 5))) alpha = true;
  }
  return { levels, alpha };
}

/**
 * src(PNG) 를 계획대로 압축해 outKtx2 에 쓰거나(ktx2), PNG 를 outPng 로 복사한다(png).
 */
export async function encodeTexture(src: string, plan: TexPlan, outKtx2: string, outPng: string): Promise<TexResult> {
  const { w, h } = pngInfo(src);
  const pngBytes = fs.statSync(src).size;
  const copyPng = (reason: string, t: TexResult['tries'] = [], psnr: Psnr | null = null): TexResult => {
    fs.mkdirSync(path.dirname(outPng), { recursive: true });
    fs.copyFileSync(src, outPng);
    return { out: 'png', codec: 'png', bytes: pngBytes, psnr, tries: t, reason, w, h, levels: 1, alpha: true };
  };
  if (plan.cls === 'keep') return copyPng(plan.reason);
  fs.mkdirSync(TMP, { recursive: true });
  const exe = basisuPath();
  const common = ['-ktx2', '-stats', ...(plan.mips ? ['-mipmap', '-mip_filter', 'box', plan.srgb ? '-mip_srgb' : '-mip_linear'] : []), ...(plan.srgb ? [] : ['-linear'])];
  const done: TexResult['tries'] = [];
  let chosen: { codec: Try['codec']; file: string; bytes: number; psnr: Psnr | null } | null = null;
  const list = tries(plan);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const tmp = path.join(TMP, `t${process.pid}_${tmpSeq++ % 64}_${t.codec}.ktx2`);
    const r = await run(exe, [...common, ...t.args, src, '-output_file', tmp]);
    if (r.code !== 0 || !fs.existsSync(tmp)) throw new Error(`basisu 실패(${r.code}) ${src}\n${r.out.slice(-800)}`);
    const psnr = parseStats(r.out);
    const bytes = fs.statSync(tmp).size;
    const pass = t.pass(psnr);
    done.push({ codec: t.codec, bytes, psnr, pass });
    if (pass || i === list.length - 1) {
      if (!pass && plan.cls === 'ui') return copyPng('quality', done, psnr);
      chosen = { codec: t.codec, file: tmp, bytes, psnr };
      break;
    }
  }
  if (!chosen) return copyPng('no-try', done);
  if (chosen.bytes >= pngBytes && w * h <= TINY_PIXELS) return copyPng('tiny', done, null);
  fs.mkdirSync(path.dirname(outKtx2), { recursive: true });
  fs.copyFileSync(chosen.file, outKtx2);
  return { out: 'ktx2', codec: chosen.codec, bytes: chosen.bytes, psnr: chosen.psnr, tries: done, reason: plan.reason, w, h, ...ktx2Info(outKtx2) };
}

/**
 * GPU 메모리 추정(바이트, 밉 포함). three KTX2Loader 의 형식 우선순위(r180) 기준:
 *   desktop(BPTC 있음) : ETC1S·UASTC → BC7(1 B/px)
 *   mobile(ASTC+ETC2)  : UASTC → ASTC 4x4(1 B/px), ETC1S → ETC1/ETC2 RGB(0.5 B/px) · 알파 있으면 ETC2 RGBA(1 B/px)
 *   PNG                : RGBA8(4 B/px)
 * mipped: 소스 모드에서 밉을 만드는지(3D = 예, UI = 아니오)
 */
export function gpuBytes(r: Pick<TexResult, 'out' | 'codec' | 'w' | 'h'>, alpha: boolean, mipped: boolean, platform: 'desktop' | 'mobile'): number {
  const px = r.w * r.h * (mipped ? 4 / 3 : 1);
  if (r.out === 'png') return px * 4;
  if (platform === 'mobile' && r.codec === 'etc1s' && !alpha) return px * 0.5;
  return px;
}
