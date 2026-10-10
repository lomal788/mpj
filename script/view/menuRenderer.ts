import { appRenderService } from '@app/common/render/service';
import { plazaGl } from './plazaGl';

export async function menuCanvas(): Promise<HTMLCanvasElement> {
  await plazaGl().yieldForMenu();
  return appRenderService().canvas;
}
