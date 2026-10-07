/**
 * 광장 보기(OverView, 결과 13) — menu00::SequenceMainMenu::OverViewImpl @0x710005f930 [판독]:
 * PlayFxTrigger("ST_DUCKING_START_LOOKMENU") → CameraManager::PlayAnim(0x10) + SetSpeed(0)(= 카메라 표 16 'deco_00' = env/menu00_deco_all_cam.fsnb
 * 프레임 0 정지, 표는 CameraManager::Initialize 의 이름 표 menu00.nro 0x1c7a58·경로 표 0x19b2e4 [데이터]) → 안내 ComUiGuide00(pos 0x11) In →
 * 조작 플레이어 GetTrigger & 6(bex B 0x2 | X 0x4)까지 대기 → SQ_SE_SYS_CANCEL → 안내 Out → StopAnim → "ST_DUCKING_FINISH_LOOKMENU" → 상태 2.
 * 시작은 C(interact.ts)의 'interact:decide' {result: 13}. 끝나면 'overview:end' 를 낸다.
 */
import { FsnbCamera } from './balloon';
import { PLAZA_BTN, type PlazaContext, type PlazaPart, type PlazaPartFactory } from './types';

export const OVERVIEW_CAMERA = { index: 0x10, label: 'deco_00', file: 'menu00_deco_all_cam.fsnb' } as const;
const RESULT_OVERVIEW = 13;

export const createOverview: PlazaPartFactory = async (ctx: PlazaContext): Promise<PlazaPart> => {
  const stage = ctx.world.stage;
  const path = stage.manifest.anims[OVERVIEW_CAMERA.file];
  const clip = path ? FsnbCamera.parse(await (await fetch(stage.assetUrl(path))).json()) : null;
  let active = false;
  let prev = 0;
  let acc = 0;
  let shown = 0;
  const operator = (): number => ctx.players.find((p) => p.local && !p.isCom)?.slot ?? 0;
  const begin = (): void => {
    if (active || !clip) return;
    active = true;
    shown = 0;
    prev = ctx.pad(operator())?.buttons ?? 0;
    const cam = new FsnbCamera(clip, 0);
    cam.playing = false;
    stage.setCameraDriver(cam, 'anim');
    ctx.emit('ui:overview', true);
  };
  const end = (): void => {
    active = false;
    ctx.sound.se('SQ_SE_SYS_CANCEL');
    stage.setCameraDriver(null, 'anim');
    ctx.emit('ui:overview', false);
    ctx.emit('overview:end', true);
    ctx.emit('player:input', true);
    ctx.emit('ui:mainLayout', true);
  };
  const off = ctx.on('interact:decide', (v) => {
    if ((v as { result: number }).result === RESULT_OVERVIEW) begin();
  });
  return {
    name: 'overview',
    update(df) {
      if (!active) return;
      acc += df;
      while (acc >= 1 - 1e-6 && active) {
        acc -= 1;
        shown++;
        const b = ctx.pad(operator())?.buttons ?? 0;
        const trig = b & ~prev;
        prev = b;
        if (shown > 1 && trig & (PLAZA_BTN.B | PLAZA_BTN.X)) end();
        else {
          ctx.emit('player:input', false);
          ctx.emit('ui:mainLayout', false);
        }
      }
    },
    debug: () => ({ active, frames: shown, camera: clip ? OVERVIEW_CAMERA.file : null }),
    dispose() {
      off();
      if (active) stage.setCameraDriver(null, 'anim');
    },
  };
};
