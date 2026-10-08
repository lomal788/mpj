/**
 * 사전 압축 — 정적 파일 옆에 .br(brotli 품질 11·창 24)·.gz(gzip 9)를 만든다. 서버(server/static.ts)가 Accept-Encoding 을 보고 그대로 보낸다.
 * node 내장 zlib 만 쓴다(비동기 — libuv 스레드 풀에서 동시에 돈다). 설계: docs/engine/loader_manager.md §5.8.4.
 *
 * 규칙: 압축 이득이 있는 확장자(PRECOMPRESS)만, 압축본이 원본의 95 % 이하이고 64 B 이상 줄 때만 파일을 둔다(아니면 원본만).
 * ktx2·png·ogg·m4a 는 측정상 이득 없음(Basis·PNG·Opus·AAC 자체 압축) — 대상에서 뺀다.
 * 내용 해시 이름 규칙 hashedName 도 여기 둔다(build_assets·시험이 같이 씀, §5.8.1).
 */
import fs from 'node:fs';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

export const PRECOMPRESS = /\.(json|glb|gltf|bin|hdr|otf|ttf|flac|md|txt|svg|js|mjs|css|html|wasm|map)$/i;

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

/** a/b/x.fmab.json + 3f2c9a1b → a/b/x.fmab.3f2c9a1b.json(마지막 확장자 앞) */
export const hashedName = (rel: string, h: string): string => {
  const dot = rel.lastIndexOf('.');
  return dot > rel.lastIndexOf('/') ? `${rel.slice(0, dot)}.${h}${rel.slice(dot)}` : `${rel}.${h}`;
};

const worth = (raw: number, packed: number): boolean => packed <= raw * 0.95 && raw - packed >= 64;

/** 한 파일: 만든 .br·.gz 크기(이득 없어 안 만들었으면 0) */
export async function precompressFile(file: string): Promise<{ raw: number; br: number; gz: number }> {
  const b = await fs.promises.readFile(file);
  const [br, gz] = await Promise.all([
    brotli(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 24, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.byteLength } }),
    gzip(b, { level: 9 }),
  ]);
  const out = { raw: b.byteLength, br: 0, gz: 0 };
  if (worth(b.byteLength, br.byteLength)) {
    await fs.promises.writeFile(`${file}.br`, br);
    out.br = br.byteLength;
  }
  if (worth(b.byteLength, gz.byteLength)) {
    await fs.promises.writeFile(`${file}.gz`, gz);
    out.gz = gz.byteLength;
  }
  return out;
}

/** 여러 파일을 n 개씩 동시에 */
export async function precompressAll(files: string[], n = 4, each?: (file: string, r: { raw: number; br: number; gz: number }) => void): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, files.length)) }, async () => {
      while (next < files.length) {
        const f = files[next++];
        const r = await precompressFile(f);
        each?.(f, r);
      }
    }),
  );
}
