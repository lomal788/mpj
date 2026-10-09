/**
 * 소리 압축(빌드 단계, tools/build_assets.ts 가 부른다) — 설계·기준: docs/engine/assets_pipeline.md §5.
 *
 *   sound/wave/*.wav (시퀀서 악기 파형: 샘플 단위 반복 구간을 코드가 원본 rate 로 계산) → FLAC(무손실, 표본 수·rate 그대로)
 *   그 밖의 wav(BGM·SE·음성)                                                          → Opus(.ogg) + AAC-LC(.m4a) 두 벌
 * 런타임(app/common/render3d/assetLoader.ts)은 Opus 를 디코드할 수 있으면 .ogg, 아니면 .m4a 를 읽는다(구형 iOS Safari).
 * 둘 다 인코더 앞 지연(Opus pre-skip, AAC 프라이밍)을 컨테이너에 적어 디코더가 잘라내므로 시작 시각이 원본과 같다(검증: §8).
 * BGM(명세가 BGM 라벨로 가리키는 wav)은 통파일에 더해 스트리밍 조각 <이름>.bgm/NNN.ogg|.m4a 를 만든다 — 배치는 런타임과 같은
 * script/game/lib/bgmstream planBgm·chunkSpans, PCM 은 소스 표본 바이트 그대로 ffmpeg stdin(docs/engine/04_sound.md §12).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { BGM_CHUNK_SEC, BGM_PAD, BGM_PLAN_V, bgmChunkKey, chunkSpans, parseWav, planBgm, type BgmPlan } from '../script/game/lib/bgmstream';

export const AUDIO_RECIPE = 'audio-v1';
/** BGM 조각 설정 — 바뀌면 BGM 만 다시 만든다 */
export const BGM_RECIPE = `bgm-v${BGM_PLAN_V}-${BGM_CHUNK_SEC}-${BGM_PAD}`;
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

function ff(args: string[], input?: Buffer): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg 실패(${code}): ${err.slice(-500)}`))));
    if (input) {
      p.stdin.on('error', () => undefined);
      p.stdin.end(input);
    }
  });
}

const opusArgs = (ch: 1 | 2): string[] => ['-map_metadata', '-1', '-c:a', 'libopus', '-b:a', `${OPUS_KBPS[ch]}k`, '-vbr', 'on', '-application', 'audio', '-compression_level', '10'];
const aacArgs = (ch: 1 | 2): string[] => ['-map_metadata', '-1', '-c:a', 'aac', '-b:a', `${AAC_KBPS[ch]}k`, '-movflags', '+faststart'];

/** BGM 조각 PCM(소스 표본 바이트 그대로) — 시험(tools/test_bgm_stream.ts)도 쓴다 */
export function bgmChunkPcm(wav: Buffer, plan: BgmPlan, i: number): { bytes: Buffer; fmt: string } {
  const w = parseWav(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer);
  if (!w) throw new Error('wav PCM 이 아니다');
  const stride = w.ch * (w.bits / 8);
  const parts: Buffer[] = [];
  for (const [src, n] of chunkSpans(plan, i)) {
    if (src < 0) parts.push(Buffer.alloc(n * stride, w.bits === 8 ? 0x80 : 0));
    else parts.push(Buffer.from(w.data.buffer, w.data.byteOffset + src * stride, n * stride));
  }
  const fmt = w.float ? 'f32le' : w.bits === 8 ? 'u8' : `s${w.bits}le`;
  return { bytes: Buffer.concat(parts), fmt };
}

/** BGM 조각 하나를 인코딩한다(raw PCM → .ogg 또는 .m4a) */
export async function encodeBgmChunk(pcm: { bytes: Buffer; fmt: string }, rate: number, channels: number, out: string): Promise<void> {
  const ch = Math.min(2, channels) as 1 | 2;
  const input = ['-f', pcm.fmt, '-ar', String(rate), '-ac', String(channels), '-i', 'pipe:0'];
  await ff([...input, ...(out.endsWith('.ogg') ? opusArgs(ch) : aacArgs(ch)), out], pcm.bytes);
}

export interface AudioOut {
  kind: AudioKind;
  /** dist 경로(소스 rel 의 확장자만 바꾼 것) → 바이트 */
  files: Record<string, number>;
  info: WavInfo;
  /** BGM 조각 배치(조각 파일 = outBase + '.bgm/NNN.ogg|.m4a') */
  stream?: BgmPlan;
}

/** src wav → outBase(확장자 없는 dist 경로) + .flac | .ogg/.m4a (+ bgm 이면 조각) */
export async function encodeAudio(src: string, rel: string, outBase: string, bgm?: { loop: [number, number] | null }): Promise<AudioOut> {
  const info = wavInfo(src);
  const kind = audioKind(rel);
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const files: Record<string, number> = {};
  if (kind === 'flac') {
    await ff(['-i', src, '-map_metadata', '-1', '-c:a', 'flac', '-compression_level', '12', `${outBase}.flac`]);
    files['.flac'] = fs.statSync(`${outBase}.flac`).size;
  } else {
    const ch = Math.min(2, info.channels) as 1 | 2;
    await ff(['-i', src, ...opusArgs(ch), `${outBase}.ogg`]);
    await ff(['-i', src, ...aacArgs(ch), `${outBase}.m4a`]);
    files['.ogg'] = fs.statSync(`${outBase}.ogg`).size;
    files['.m4a'] = fs.statSync(`${outBase}.m4a`).size;
    if (bgm) {
      const plan = planBgm(info.frames, info.rate, info.channels, bgm.loop);
      const wav = fs.readFileSync(src);
      const base = path.basename(outBase);
      fs.mkdirSync(`${outBase}.bgm`, { recursive: true });
      for (let i = 0; i < plan.chunks.length; i++) {
        const pcm = bgmChunkPcm(wav, plan, i);
        const stem = bgmChunkKey(base, i).slice(base.length).replace(/\.wav$/, '');
        for (const ext of ['.ogg', '.m4a']) {
          await encodeBgmChunk(pcm, info.rate, info.channels, `${outBase}${stem}${ext}`);
          files[`${stem}${ext}`] = fs.statSync(`${outBase}${stem}${ext}`).size;
        }
      }
      return { kind, files, info, stream: plan };
    }
  }
  return { kind, files, info };
}
