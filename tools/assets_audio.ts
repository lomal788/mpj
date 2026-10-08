/**
 * 소리 압축(빌드 단계, tools/build_assets.ts 가 부른다) — 설계·기준: docs/engine/assets_pipeline.md §5.
 *
 *   sound/wave/*.wav (시퀀서 악기 파형: 샘플 단위 반복 구간을 코드가 원본 rate 로 계산) → FLAC(무손실, 표본 수·rate 그대로)
 *   그 밖의 wav(BGM·SE·음성)                                                          → Opus(.ogg) + AAC-LC(.m4a) 두 벌
 * 런타임(shell/stage3d/assetLoader.ts)은 Opus 를 디코드할 수 있으면 .ogg, 아니면 .m4a 를 읽는다(구형 iOS Safari).
 * 둘 다 인코더 앞 지연(Opus pre-skip, AAC 프라이밍)을 컨테이너에 적어 디코더가 잘라내므로 시작 시각이 원본과 같다(검증: §8).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const AUDIO_RECIPE = 'audio-v1';
/** 비트레이트(kbps): 채널 수별 */
export const OPUS_KBPS = { 1: 64, 2: 128 } as const;
export const AAC_KBPS = { 1: 96, 2: 160 } as const;

export type AudioKind = 'flac' | 'lossy';

export interface WavInfo {
  rate: number;
  channels: number;
  bits: number;
  frames: number;
}

export function wavInfo(file: string): WavInfo {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`wav 가 아니다: ${file}`);
  let off = 12;
  let fmt: { rate: number; channels: number; bits: number } | null = null;
  let dataBytes = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const len = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') dataBytes = len;
    off += 8 + len + (len & 1);
  }
  if (!fmt) throw new Error(`wav fmt 없음: ${file}`);
  return { ...fmt, frames: dataBytes / (fmt.channels * (fmt.bits / 8)) };
}

export function audioKind(rel: string): AudioKind {
  return /(^|\/)sound\/wave\//.test(rel) ? 'flac' : 'lossy';
}

const require = createRequire(import.meta.url);
export function ffmpegPath(): string {
  const p = require('ffmpeg-static') as string | null;
  if (!p || !fs.existsSync(p)) throw new Error('ffmpeg 실행 파일이 없다 (npm i -D ffmpeg-static)');
  return p;
}

function ff(args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg 실패(${code}): ${err.slice(-500)}`))));
  });
}

export interface AudioOut {
  kind: AudioKind;
  /** dist 경로(소스 rel 의 확장자만 바꾼 것) → 바이트 */
  files: Record<string, number>;
  info: WavInfo;
}

/** src wav → outBase(확장자 없는 dist 경로) + .flac | .ogg/.m4a */
export async function encodeAudio(src: string, rel: string, outBase: string): Promise<AudioOut> {
  const info = wavInfo(src);
  const kind = audioKind(rel);
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const files: Record<string, number> = {};
  if (kind === 'flac') {
    await ff(['-i', src, '-map_metadata', '-1', '-c:a', 'flac', '-compression_level', '12', `${outBase}.flac`]);
    files['.flac'] = fs.statSync(`${outBase}.flac`).size;
  } else {
    const ch = Math.min(2, info.channels) as 1 | 2;
    await ff(['-i', src, '-map_metadata', '-1', '-c:a', 'libopus', '-b:a', `${OPUS_KBPS[ch]}k`, '-vbr', 'on', '-application', 'audio', '-compression_level', '10', `${outBase}.ogg`]);
    await ff(['-i', src, '-map_metadata', '-1', '-c:a', 'aac', '-b:a', `${AAC_KBPS[ch]}k`, '-movflags', '+faststart', `${outBase}.m4a`]);
    files['.ogg'] = fs.statSync(`${outBase}.ogg`).size;
    files['.m4a'] = fs.statSync(`${outBase}.m4a`).size;
  }
  return { kind, files, info };
}
