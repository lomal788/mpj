import { FCPX_FILE, tablePath, sheetsFor, type FontRef, type FcpxTable, type FontTable } from '@app/common/ui/layout/fontTable';

type Json = <T>(key: string) => Promise<T>;
type Key = readonly [string, string];
const path = (value: string): string => {
  const parts: string[] = [];
  for (const part of value.split('/')) {
    if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
};
interface Character {
  glb: string; motions: string; anims?: string[]; resultAnims?: string[]; resultGlb?: string;
  eyeTex?: string; color?: { albedo: string };
}
interface Layout {
  textures: Record<string, string>; fonts: Record<string, FontRef>; telopFont?: { file: string };
}
interface Sound {
  file?: string; seq?: { waves: { file: string }[] }; bpm?: Record<string, { file: string }>;
}

export async function mg1801AssetKeys(json: Json, chars: readonly string[], bgmKey: (key: string) => string): Promise<Key[]> {
  const out = new Map<string, string>();
  const add = (file: string, kind: string): void => { out.set(path(file), kind); };
  const get = async <T>(file: string): Promise<T> => { add(file, 'json'); return json<T>(path(file)); };
  const [manifest, textures, characters, effects, ui, commonUi, commonSound] = await Promise.all([
    get<{ sounds: Record<string, Sound> }>('mg1801/manifest.json'),
    get<Record<string, { files: string[] }>>('mg1801/model/textures.json'),
    get<Record<string, Character>>('mg1801/chara/index.json'),
    get<{ textures: Record<string, { file: string }> }>('mg1801/effect/effects.json'),
    get<Layout>('mg1801/ui/ui.json'), get<Layout>('mgscene/ui.json'),
    get<{ se: Record<string, Sound>; voice: Record<string, Sound>; bgm: Record<string, Sound> }>('mgscene/sound/sound.json'), get('mgscene/tables.json'),
  ]);
  const models = ['bg00', 'floor00', 'water00', 'stool_npc00', 'result00', 'knife00', 'arrow00', 'stool01', 'stool02', 'stool03', 'soup00', 'soup01', 'soup02', 'soup03'];
  for (let type = 0; type < 5; type++) {
    const name = `obj0${type}`; models.push(name, `${name}_outline00`);
    for (let i = 0; i < [2, 3, 4, 5, 2][type]; i++) models.push(`${name}_${i}`);
  }
  for (const name of models) add(`mg1801/model/mg1801_${name}.glb`, 'gltf');
  for (const e of Object.values(textures)) for (const file of e.files) add(`mg1801/tex/${file}`, file.endsWith('.hdr') ? 'bytes' : 'texture');
  for (const key of new Set([...chars.map(c => characters[c] ? c : 'pc01'), 'npc002'])) {
    const c = characters[key]; if (!c) continue;
    add(`mg1801/chara/${c.glb}`, 'gltf'); add(`mg1801/chara/${c.motions}`, 'json');
    for (const file of [...(c.anims ?? []), ...(c.resultAnims ?? (c.resultGlb ? [c.resultGlb] : []))]) add(`mg1801/chara/${file}`, 'gltf');
    if (c.eyeTex) add(`mg1801/chara/${c.eyeTex}`, 'texture');
    if (c.color) add(`mg1801/chara/${c.color.albedo}`, 'texture');
  }
  add('mg1801/effect/primitives.glb', 'gltf');
  for (const e of Object.values(effects.textures)) add(`mg1801/effect/${e.file}`, 'texture');
  for (const e of Object.values(manifest.sounds)) {
    if (e.file) add(`mg1801/${e.file}`, 'bytes');
    for (const wave of e.seq?.waves ?? []) add(`mg1801/${wave.file}`, 'bytes');
    for (const render of Object.values(e.bpm ?? {})) add(bgmKey(path(`mg1801/${render.file}`)), 'bytes');
  }
  for (const kind of ['se', 'voice', 'bgm'] as const) for (const e of Object.values(commonSound[kind] ?? {})) {
    if (e.file) add(kind === 'bgm' ? bgmKey(path(`mgscene/sound/${e.file}`)) : `mgscene/${e.file}`, 'bytes');
  }
  for (const [base, layout] of [['mg1801/ui/', ui], ['mgscene/', commonUi]] as const) {
    for (const file of Object.values(layout.textures)) add(base + file, 'uiimage');
    if (layout.telopFont) add(base + layout.telopFont.file, 'bytes');
    for (const [family, ref] of Object.entries(layout.fonts)) {
      const dir = path(base + ref.dir) + '/';
      const fcpx = await get<FcpxTable>(dir + FCPX_FILE), fonts = fcpx[family]?.fonts ?? [];
      const tables = await Promise.all(fonts.map(name => get<FontTable>(dir + tablePath(name))));
      for (const file of sheetsFor(tables, ref.chars ?? '')) add(dir + file, 'uiimage');
    }
  }
  return [...out];
}
