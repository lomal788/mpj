/**
 * glb 압축(빌드 단계, tools/build_assets.ts 가 부른다) — 설계·기준: docs/engine/assets_pipeline.md §4.
 *
 * 1. 외부 이미지 URI(../tex/x.png)는 그대로 밖에 둔다(여러 glb·매니페스트가 같은 텍스처를 나눠 씀). KTX2 로 바뀐 이미지는
 *    URI 를 .ktx2 로, mimeType image/ktx2, 텍스처는 KHR_texture_basisu 로 바꾼다.
 * 2. 애니: 이웃 키의 보간으로 1e-6 안에서 다시 나오는 키를 지운다(resample, 처음·끝 키는 남아 길이 그대로). 회전 키(쿼터니언)는
 *    int16 정규화로 양자화(KHR_mesh_quantization, 성분 오차 ≤ 1/65534). 이동·크기·모프 가중치는 float 그대로.
 * 3. 모든 버퍼 뷰를 EXT_meshopt_compression 으로 무손실 압축(필터 없음 — 정점·인덱스·애니 바이트 그대로 복원). 정점·삼각형 순서 재배열은
 *    하지 않는다(반투명 메시는 삼각형 순서가 그리기 순서라 화면이 바뀔 수 있음).
 * gltf-transform 의 GLB 쓰기는 이미지를 안에 넣어 버리므로, JSON 으로 쓰고 GLB 를 직접 묶는다.
 */
import { Accessor, Document, Format, GLB_BUFFER, NodeIO, VertexLayout } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions';
import { resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

export const MESH_RECIPE = 'mesh-v1';
/** 애니 키 줄이기 허용 오차(gltf-transform resample) */
export const RESAMPLE_TOLERANCE = 1e-6;

export interface GlbJson {
  images?: { uri?: string; mimeType?: string; bufferView?: number; name?: string }[];
  materials?: {
    pbrMetallicRoughness?: { baseColorTexture?: { index: number }; metallicRoughnessTexture?: { index: number } };
    normalTexture?: { index: number };
    occlusionTexture?: { index: number };
    emissiveTexture?: { index: number };
  }[];
  textures?: { source?: number }[];
  buffers?: { uri?: string; byteLength: number }[];
  [k: string]: unknown;
}

export function readGlb(bytes: Uint8Array): { json: GlbJson; bin: Uint8Array | null } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('glb 가 아니다');
  let off = 12;
  let json: GlbJson | null = null;
  let bin: Uint8Array | null = null;
  while (off + 8 <= bytes.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const body = bytes.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)) as GlbJson;
    else if (type === 0x004e4942) bin = body;
    off += 8 + len;
  }
  if (!json) throw new Error('glb JSON 덩어리가 없다');
  return { json, bin };
}

function writeGlb(json: unknown, bin: Uint8Array | null): Uint8Array {
  const pad = (n: number): number => (n + 3) & ~3;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jl = pad(jsonBytes.byteLength);
  const bl = bin ? pad(bin.byteLength) : 0;
  const total = 12 + 8 + jl + (bin ? 8 + bl : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jl, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  for (let i = jsonBytes.byteLength; i < jl; i++) out[20 + i] = 0x20;
  if (bin) {
    const o = 20 + jl;
    dv.setUint32(o, bl, true);
    dv.setUint32(o + 4, 0x004e4942, true);
    out.set(bin, o + 8);
  }
  return out;
}

/** 이미지 URI 별 쓰임(색·노멀·자료) — 텍스처 분류 힌트 */
export function imageSlots(json: GlbJson): Map<string, 'color' | 'normal' | 'data'> {
  const out = new Map<string, 'color' | 'normal' | 'data'>();
  const put = (ti: number | undefined, slot: 'color' | 'normal' | 'data'): void => {
    if (ti === undefined) return;
    const src = json.textures?.[ti]?.source;
    const uri = src !== undefined ? json.images?.[src]?.uri : undefined;
    if (uri && !out.has(uri)) out.set(uri, slot);
  };
  for (const m of json.materials ?? []) {
    put(m.pbrMetallicRoughness?.baseColorTexture?.index, 'color');
    put(m.emissiveTexture?.index, 'color');
    put(m.normalTexture?.index, 'normal');
    put(m.pbrMetallicRoughness?.metallicRoughnessTexture?.index, 'data');
    put(m.occlusionTexture?.index, 'data');
  }
  return out;
}

export interface MeshStats {
  inBytes: number;
  outBytes: number;
  ktx2Images: number;
  pngImages: number;
  rotAccessors: number;
  keysIn: number;
  keysOut: number;
  /** 회전 양자화 최대 성분 오차 */
  rotMaxErr: number;
}

let io: NodeIO | null = null;
async function getIo(): Promise<NodeIO> {
  if (io) return io;
  await MeshoptEncoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).setVertexLayout(VertexLayout.SEPARATE);
  return io;
}

/**
 * src glb → 압축 glb. ktx2Uri(uri) 가 문자열을 주면 그 이미지를 KTX2 로 바꾼다(새 URI).
 */
export async function packGlb(src: Uint8Array, ktx2Uri: (uri: string) => string | null): Promise<{ bytes: Uint8Array; stats: MeshStats }> {
  const nio = await getIo();
  const { json, bin } = readGlb(src);
  const resources: Record<string, Uint8Array<ArrayBuffer>> = {};
  if (bin) resources[GLB_BUFFER] = bin as Uint8Array<ArrayBuffer>;
  for (const im of json.images ?? []) if (im.uri) resources[im.uri] = new Uint8Array(0);
  const doc: Document = await nio.readJSON({ json: json as never, resources });
  const stats: MeshStats = { inBytes: src.byteLength, outBytes: 0, ktx2Images: 0, pngImages: 0, rotAccessors: 0, keysIn: 0, keysOut: 0, rotMaxErr: 0 };

  let basisu = false;
  for (const tex of doc.getRoot().listTextures()) {
    const uri = tex.getURI();
    const to = uri ? ktx2Uri(uri) : null;
    if (to) {
      tex.setURI(to).setMimeType('image/ktx2');
      stats.ktx2Images++;
      basisu = true;
    } else stats.pngImages++;
  }
  if (basisu) doc.createExtension(KHRTextureBasisu).setRequired(true);

  const keys = (): number => doc.getRoot().listAnimations().reduce((n, a) => n + a.listSamplers().reduce((m, s) => m + (s.getInput()?.getCount() ?? 0), 0), 0);
  stats.keysIn = keys();
  if (stats.keysIn) await doc.transform(resample({ tolerance: RESAMPLE_TOLERANCE }));
  stats.keysOut = keys();

  const seen = new Set<Accessor>();
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== 'rotation') continue;
      const out = ch.getSampler()?.getOutput();
      if (!out || seen.has(out)) continue;
      seen.add(out);
      const a = out.getArray();
      if (!(a instanceof Float32Array) || out.getType() !== 'VEC4') continue;
      const q = new Int16Array(a.length);
      for (let i = 0; i < a.length; i++) {
        const v = Math.max(-1, Math.min(1, a[i]));
        q[i] = Math.round(v * 32767);
        stats.rotMaxErr = Math.max(stats.rotMaxErr, Math.abs(Math.max(q[i] / 32767, -1) - a[i]));
      }
      out.setArray(q).setNormalized(true);
      stats.rotAccessors++;
    }
  }
  if (stats.rotAccessors) doc.createExtension(KHRMeshQuantization).setRequired(true);

  if (doc.getRoot().listAccessors().length) {
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  }

  const outDoc = await nio.writeJSON(doc, { format: Format.GLTF, basename: 'glb' });
  const oj = outDoc.json as unknown as GlbJson & { bufferViews?: { buffer: number; extensions?: Record<string, { buffer: number }> }[] };
  const bufs = oj.buffers ?? [];
  const main = bufs.findIndex((b) => b.uri !== undefined && outDoc.resources[b.uri] !== undefined);
  let binOut: Uint8Array | null = null;
  if (main >= 0) {
    const uri = bufs[main].uri!;
    binOut = outDoc.resources[uri];
    delete bufs[main].uri;
    if (main !== 0) {
      const order = [main, ...bufs.map((_, i) => i).filter((i) => i !== main)];
      const remap = new Map(order.map((o, n) => [o, n]));
      oj.buffers = order.map((i) => bufs[i]);
      for (const bv of oj.bufferViews ?? []) {
        bv.buffer = remap.get(bv.buffer)!;
        const ext = bv.extensions?.EXT_meshopt_compression;
        if (ext) ext.buffer = remap.get(ext.buffer)!;
      }
    }
  }
  if ((oj.buffers ?? []).some((b, i) => i > 0 && b.uri !== undefined)) throw new Error('예상 밖 외부 버퍼');
  const asset = (oj as { asset?: Record<string, unknown> }).asset;
  if (asset) asset.generator = `mpj build_assets ${MESH_RECIPE} (gltf-transform)`;
  const bytes = writeGlb(oj, binOut);
  stats.outBytes = bytes.byteLength;
  return { bytes, stats };
}
