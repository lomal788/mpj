/**
 * 시험용 글꼴 해석 — 디스크의 명세 fonts({dir, chars})를 공용 글꼴 표(web/assets/font/)로 채운다(앱 Render2D.load 의 resolveFonts 와 같은 함수).
 * sheetFilesMissing = 글리프가 가리키는 원본 시트 파일 중 없는 것. 설계: docs/engine/font_assets.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolveFonts } from '@app/scene/menu/charselect/fontTable';
import type { FontSpec } from '@app/scene/menu/charselect/types';

export async function resolveFontsFromDisk(fonts: Record<string, unknown> | undefined, specDir: string): Promise<string[]> {
  if (!fonts) return [];
  const base = `${specDir.replace(/\\/g, '/').replace(/\/$/, '')}/`;
  return resolveFonts(fonts, (p) => base + p, async <T>(u: string): Promise<T> => JSON.parse(readFileSync(u, 'utf8')) as T);
}

export function sheetFilesMissing(f: FontSpec | undefined): string[] {
  if (!f?.glyphs) return ['(글꼴 없음)'];
  const files = new Set(Object.values(f.glyphs).map((g) => g.sheet));
  return [...files].filter((p) => !existsSync(p));
}
