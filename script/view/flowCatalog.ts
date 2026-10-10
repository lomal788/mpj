/**
 * 흐름 예측 묶음 → 관리자 키 목록(mpj 전용). 설계: docs/engine/loader_manager.md §13.3. 키 = web/assets/ 기준 소스 경로.
 * 화면이 실제로 읽는 키와 같아야 한다: 2D 그림 = Render2D.load(명세 + 부품의 textures, 기준 폴더 상대) → uiimage,
 * 여러 화면 공용 그림·효과음은 명세가 ../common/… 로 가리켜 normPath 뒤 같은 키 common/…(docs/engine/common_assets.md),
 * 글꼴 = 명세 fonts {dir, chars} → 공용 font/fcpx.json·<FFNT>/glyphs.json(json) + chars 가 든 원본 시트 font/<FFNT>/<n>.png(uiimage, docs/engine/font_assets.md),
 * Preview3D(캐릭터 선택·광장 플레이어·NPC) = 모델 glb·모션 glb(anims)·motions·눈·눈꺼풀 — 공용 assets/chara/ 라 세 화면이 같은 키(docs/engine/chara_assets.md),
 * 광장 무대 = world.ts plazaP0Paths(World 와 같은 규칙). 화면 BGM = 'bgm:<라벨>' → common/sound/bgm.json 의 파일 첫 조각(docs/engine/04_sound.md §12.14).
 * 명세 json 은 받은 json 함수(관리자 json, 묶음 등급)로 읽고 고치지 않는다. 동적 import 로만 불러 진입 청크를 키우지 않는다.
 */
import { FCPX_FILE, sheetsFor, tablePath, type FcpxTable, type FontRef, type FontTable } from '@app/common/ui/layout/fontTable';
import type { CharaSpec } from '@app/scene/menu/charselect/types';
import { NPC_MODEL } from '@app/scene/world/plaza/npc';
import { PLAZA_CARD_PART } from '@app/scene/world/plaza/ui/card';
import { PLAZA_UI_PART } from '@app/scene/world/plaza/ui/data';
import { defaultDecoState } from '@app/scene/world/plaza/deco';
import type { PlazaLayoutEntry } from '@app/scene/world/plaza/types';
import { plazaP0Paths, type PlazaFirstFile } from '@app/scene/world/plaza/world';
import { ONLINE_FACES, ONLINE_PART } from '@app/scene/menu/online/screen';
import { mgStageKey, mgStageP0Paths, type MgManifest } from '@app/minigame/frame/stage';
import type { FlowJson, FlowKeys } from './flow';
import { BGM_SPEC_PATH } from './screenBgm';

export interface FlowCatalogOptions {
  /** 압축 모드: glb 안 텍스처도 관리자를 지남 → 광장 P0 모델 텍스처를 묶음에 넣음 */
  gltfTextures: boolean;
  gameKeys?(name: string, json: FlowJson): Promise<FlowKeys | null>;
  /** 게임 이름 → 에셋 폴더(ASSETS 기준, 끝 '/') */
  gameDir?(name: string): string | null;
  /** BGM wav 키 → 미리 받을 키(압축 모드 = 첫 조각, docs/engine/04_sound.md §12). 없으면 그대로 */
  bgmKey?(key: string): string;
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
  fonts?: Record<string, FontRef>;
}

/** 2D 화면: 기준 폴더의 spec.json + 부품(합치기 = mgmcommon mergeSpec: 같은 이름은 뒤가 이김) → 그림 키 */
async function screen2d(json: FlowJson, base: string, parts: readonly string[]): Promise<[string, string][]> {
  const files = ['spec.json', ...parts];
  const specs = await Promise.all(files.map((f) => json<Spec2d>(normPath(base + f))));
  const tex: Record<string, string> = {};
  const fonts: Record<string, FontRef> = {};
  for (const s of specs) {
    Object.assign(tex, s.textures ?? {});
    for (const [k, f] of Object.entries(s.fonts ?? {})) fonts[k] = fonts[k]?.dir === f.dir ? { dir: f.dir, chars: (fonts[k].chars ?? '') + (f.chars ?? '') } : f;
  }
  const out: [string, string][] = files.map((f) => [normPath(base + f), 'json']);
  const seen = new Set<string>();
  const add = (k: string, kind: string): void => {
    if (!seen.has(k)) {
      seen.add(k);
      out.push([k, kind]);
    }
  };
  for (const p of Object.values(tex)) add(normPath(base + p), 'uiimage');
  for (const [family, f] of Object.entries(fonts)) {
    const dir = `${normPath(base + f.dir)}/`;
    const fcpx = await json<FcpxTable>(dir + FCPX_FILE);
    const fam = fcpx[family];
    if (!fam) continue;
    add(dir + FCPX_FILE, 'json');
    const tables = await Promise.all(fam.fonts.map((n) => json<FontTable>(dir + tablePath(n))));
    for (const n of fam.fonts) add(dir + tablePath(n), 'json');
    for (const p of sheetsFor(tables, f.chars ?? '')) add(dir + p, 'uiimage');
  }
  return out;
}

/** Preview3D 가 요청하는 캐릭터 파일(preview3d.ts files 와 같은 순서·종류) */
function charaFiles(base: string, c: Pick<CharaSpec, 'glb' | 'anims' | 'motions' | 'eye'>): [string, string][] {
  const out: [string, string][] = [];
  if (!c.glb) return out;
  out.push([normPath(base + c.glb), 'gltf']);
  for (const a of c.anims ?? []) out.push([normPath(base + a), 'gltf']);
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
      const snd = [...Object.values(s.sounds ?? {}).map((x) => x.file), ...Object.values(s.voices ?? {}).flatMap((v) => v.files)];
      for (const f of new Set(snd)) out.push([normPath(`charselect/${f}`), 'bytes']);
      if (s.bgm) {
        const k = normPath(`charselect/${s.bgm.file}`);
        out.push([o.bgmKey?.(k) ?? k, 'bytes']);
      }
      return out;
    }
    case 'plaza:p0': {
      const man = await json<{ textures?: Record<string, { files: string[] }>; anims?: Record<string, string>; env?: { ibl?: { common: string[]; chara?: string[] | null }; sky?: { texture?: string }; post?: { lut?: string }; envAnim?: string }; models: Record<string, { url: string }>; plaza: { layout: PlazaLayoutEntry[]; extraLayout?: PlazaLayoutEntry[]; collision: string } }>('plaza/world/manifest.json');
      const first = await json<PlazaFirstFile>('plaza/world/plaza_first.json');
      const env = man.env, extra: [string, string][] = [];
      for (const name of [...(env?.ibl?.common ?? []), ...(env?.ibl?.chara ?? []), env?.sky?.texture, env?.post?.lut]) {
        if (!name) continue;
        for (const file of man.textures?.[name]?.files ?? []) extra.push([`plaza/world/tex/${file}`, /\.hdr$/i.test(file) ? 'bytes' : 'texture']);
      }
      if (env?.envAnim && man.anims?.[env.envAnim]) extra.push([`plaza/world/${man.anims[env.envAnim]}`, 'json']);
      return [['plaza/world/manifest.json', 'json'], ...extra, ...plazaP0Paths(man.models, man.plaza, first, defaultDecoState(), o.gltfTextures).map(([p, k]) => [`plaza/world/${p}`, k] as const)];
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
  if (bundle.startsWith('mgresult:')) {
    const s = await json<{ chars: CharaSpec[] }>('mgresult/spec.json');
    const c = s.chars.find((x) => x.pc === bundle.slice('mgresult:'.length));
    return [['mgresult/spec.json', 'json'], ...(c ? charaFiles('mgresult/', c) : [])];
  }
  if (bundle.startsWith('bgm:')) {
    const j = await json<{ bgm: Record<string, { file: string }> }>(BGM_SPEC_PATH);
    const e = j.bgm[bundle.slice(4)];
    if (!e) return null;
    const k = normPath(BGM_SPEC_PATH.replace(/[^/]+$/, '') + e.file);
    return [[BGM_SPEC_PATH, 'json'], [o.bgmKey?.(k) ?? k, 'bytes']];
  }
  if (bundle.startsWith('game:')) {
    if (o.gameKeys) return o.gameKeys(bundle.slice(5), json);
    const dir = o.gameDir?.(bundle.slice(5));
    return dir ? [[normPath(`${dir}manifest.json`), 'json']] : null;
  }
  if (bundle.startsWith('mgstage:')) {
    const id = bundle.slice('mgstage:'.length);
    const idx = await json<{ games: Record<string, unknown> }>('mg/index.json');
    if (!idx.games[id]) return null;
    const man = await json<MgManifest>(mgStageKey(id, 'manifest.json'));
    return [['mg/index.json', 'json'], [mgStageKey(id, 'manifest.json'), 'json'], ...mgStageP0Paths(man, o.gltfTextures).map(([p, k]) => [mgStageKey(id, p), k] as [string, string])];
  }
  return null;
}
