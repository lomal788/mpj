/**
 * 흐름 예측 묶음 → 관리자 키 목록(mpj 전용). 설계: docs/engine/loader_manager.md §13.3. 키 = web/assets/ 기준 소스 경로.
 * 화면이 실제로 읽는 키와 같아야 한다: 2D 그림 = Render2D.load(명세 + 부품의 textures·fonts, 기준 폴더 상대) → uiimage,
 * Preview3D(캐릭터 선택·광장 플레이어·NPC) = glb·motions·눈·눈꺼풀, 광장 무대 = world.ts plazaP0Paths(World 와 같은 규칙).
 * 명세 json 은 받은 json 함수(관리자 json, 묶음 등급)로 읽고 고치지 않는다. 동적 import 로만 불러 진입 청크를 키우지 않는다.
 */
import type { CharaSpec } from '../shell/charselect/types';
import { NPC_MODEL } from '../shell/plaza/npc';
import { PLAZA_CARD_PART } from '../shell/plaza/ui/card';
import { PLAZA_UI_PART } from '../shell/plaza/ui/data';
import { defaultDecoState } from '../shell/plaza/deco';
import type { PlazaLayoutEntry } from '../shell/plaza/types';
import { plazaP0Paths, type PlazaFirstFile } from '../shell/plaza/world';
import { ONLINE_FACES, ONLINE_PART } from '../shell/online/screen';
import type { FlowJson, FlowKeys } from './flow';

export interface FlowCatalogOptions {
  /** 압축 모드: glb 안 텍스처도 관리자를 지남 → 광장 P0 모델 텍스처를 묶음에 넣음 */
  gltfTextures: boolean;
  /** 게임 이름 → 에셋 폴더(ASSETS 기준, 끝 '/') */
  gameDir?(name: string): string | null;
}

/** 'a/b/../c/./d' → 'a/c/d' */
export function normPath(p: string): string {
  const out: string[] = [];
  for (const s of p.split('/')) {
    if (s === '..') out.pop();
    else if (s !== '.' && s !== '') out.push(s);
  }
  return out.join('/');
}

interface Spec2d {
  textures?: Record<string, string>;
  fonts?: Record<string, { image: string }>;
}

/** 2D 화면: 기준 폴더의 spec.json + 부품(합치기 = mgmcommon mergeSpec: 같은 이름은 뒤가 이김) → 그림 키 */
async function screen2d(json: FlowJson, base: string, parts: readonly string[]): Promise<[string, string][]> {
  const files = ['spec.json', ...parts];
  const specs = await Promise.all(files.map((f) => json<Spec2d>(normPath(base + f))));
  const tex: Record<string, string> = {};
  const fonts: Record<string, { image: string }> = {};
  for (const s of specs) {
    Object.assign(tex, s.textures ?? {});
    Object.assign(fonts, s.fonts ?? {});
  }
  const out: [string, string][] = files.map((f) => [normPath(base + f), 'json']);
  const seen = new Set<string>();
  for (const p of [...Object.values(tex), ...Object.values(fonts).map((f) => f.image)]) {
    const k = normPath(base + p);
    if (!seen.has(k)) {
      seen.add(k);
      out.push([k, 'uiimage']);
    }
  }
  return out;
}

/** Preview3D 가 요청하는 캐릭터 파일(preview3d.ts files 와 같은 순서·종류) */
function charaFiles(base: string, c: Pick<CharaSpec, 'glb' | 'motions' | 'eye'>): [string, string][] {
  const out: [string, string][] = [];
  if (!c.glb) return out;
  out.push([normPath(base + c.glb), 'gltf']);
  if (c.motions) out.push([normPath(base + c.motions), 'json']);
  if (c.eye?.tex) out.push([normPath(base + c.eye.tex), 'texture']);
  if (c.eye?.lid) out.push([normPath(base + c.eye.lid.tex), 'texture']);
  return out;
}

interface CharsetSpec {
  chars: CharaSpec[];
  sounds?: Record<string, { file: string }>;
  voices?: Record<string, { files: string[] }>;
  bgm?: { file: string };
}

/** 캐릭터 선택 1P 처음 커서(state.start: initial ?? 0, 잠김 12·21 아님) */
const FIRST_CHARA = 0;

export async function flowKeys(bundle: string, json: FlowJson, o: FlowCatalogOptions): Promise<FlowKeys | null> {
  switch (bundle) {
    case 'setplayer':
      return [...(await screen2d(json, 'mgmcommon/', ['../setplayer/setplayer.json'])), ['charselect/spec.json', 'json']];
    case 'charselect':
      return screen2d(json, 'charselect/', []);
    case 'charselect:sound': {
      const out: [string, string][] = [];
      const s = await json<CharsetSpec>('charselect/spec.json');
      const snd = [...Object.values(s.sounds ?? {}).map((x) => x.file), ...Object.values(s.voices ?? {}).flatMap((v) => v.files), ...(s.bgm ? [s.bgm.file] : [])];
      for (const f of new Set(snd)) out.push([normPath(`charselect/${f}`), 'bytes']);
      return out;
    }
    case 'plaza:p0': {
      const man = await json<{ models: Record<string, { url: string }>; plaza: { layout: PlazaLayoutEntry[]; extraLayout?: PlazaLayoutEntry[]; collision: string } }>('plaza/world/manifest.json');
      const first = await json<PlazaFirstFile>('plaza/world/plaza_first.json');
      return [['plaza/world/manifest.json', 'json'], ...plazaP0Paths(man.models, man.plaza, first, defaultDecoState(), o.gltfTextures).map(([p, k]) => [`plaza/world/${p}`, k] as const)];
    }
    case 'plaza:ui':
      return screen2d(json, 'mgmcommon/', [ONLINE_PART, ONLINE_FACES, PLAZA_UI_PART, PLAZA_CARD_PART]);
    case 'plaza:npc': {
      const s = await json<{ chars: CharaSpec[] }>('plaza/world/chara/spec.json');
      const used = new Set(Object.values(NPC_MODEL));
      return [['plaza/world/chara/spec.json', 'json'], ...s.chars.filter((c) => used.has(c.pc)).flatMap((c) => charaFiles('plaza/world/chara/', c))];
    }
    case 'modeselect':
      return screen2d(json, 'modeselect/', []);
    case 'mgmet':
      return screen2d(json, 'mgmcommon/', ['mgmet.json', '../mgmet/extra.json']);
    case 'mgm01':
      return screen2d(json, 'mgmcommon/', ['mgm01.json', '../mgm01/faces.json', '../mgm01/thumbs.json']);
  }
  if (bundle === 'char:first' || bundle.startsWith('char:')) {
    const s = await json<CharsetSpec>('charselect/spec.json');
    const c = bundle === 'char:first' ? s.chars[FIRST_CHARA] : s.chars.find((x) => x.pc === bundle.slice(5));
    return c ? charaFiles('charselect/', c) : null;
  }
  if (bundle.startsWith('plaza:player:')) {
    const s = await json<{ chars: CharaSpec[] }>('plaza/player/spec.json');
    const pc = bundle.slice('plaza:player:'.length);
    const c = s.chars.find((x) => x.pc === pc) ?? s.chars[0];
    return [['plaza/player/spec.json', 'json'], ...charaFiles('plaza/player/', c)];
  }
  if (bundle.startsWith('game:')) {
    const dir = o.gameDir?.(bundle.slice(5));
    return dir ? [[normPath(`${dir}manifest.json`), 'json']] : null;
  }
  return null;
}
