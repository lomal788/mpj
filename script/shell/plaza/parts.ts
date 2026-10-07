/**
 * 광장 부품 목록 — 갈래마다 자기 줄(import 한 줄 + 목록 한 항목)만 Edit 한다(docs/shell/plaza_3d.md §6.5). 순서 = update 순서.
 */
import type { PlazaPartFactory } from './types';
import { createPlayer } from './player';
import { createCamera } from './camera';
import { createPlazaUi } from './ui';
import { createFollow } from './follow';
import { createNpcs } from './npc';
import { createInteract } from './interact';
import { createBalloon } from './balloon';
import { createOverview } from './overview';

export const PLAZA_PARTS: { name: string; create: PlazaPartFactory }[] = [
  { name: 'player', create: createPlayer },
  { name: 'camera', create: createCamera },
  { name: 'follow', create: createFollow },
  { name: 'npc', create: createNpcs },
  { name: 'interact', create: createInteract },
  { name: 'balloon', create: createBalloon },
  { name: 'ui', create: createPlazaUi },
  { name: 'overview', create: createOverview },
];
