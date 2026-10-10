import type { Catalog } from "./schema";
import { BASIC_TEMPLATES,makeBasicTemplate,sceneRegion } from "./templates/basic";
import { CHARACTER_TEMPLATES,characterTemplate } from "./templates/characters";
import { ROOM_TEMPLATES,roomTemplate } from "./templates/online";
import { SCREEN_TEMPLATES,screenTemplate } from "./templates/screens";
export {sceneRegion};
export const TEMPLATES=[...BASIC_TEMPLATES.map(t=>({...t,group:"공용",mode:"사용자 화면 예제"})),...CHARACTER_TEMPLATES.map(t=>({...t,mode:"기존 화면 동작"})),...ROOM_TEMPLATES.map(t=>({...t,mode:"기존 화면 동작 · 샘플 방"})),...SCREEN_TEMPLATES.map(t=>({...t,mode:["net-menu","room-type","opponent"].includes(t.id)?"기존 화면 동작":"구성 프리셋"}))];
export function makeTemplate(id:string,catalog:Catalog){
 if(CHARACTER_TEMPLATES.some(t=>t.id===id))return characterTemplate(id,catalog);
 if(ROOM_TEMPLATES.some(t=>t.id===id))return roomTemplate(id,catalog);
 if(SCREEN_TEMPLATES.some(t=>t.id===id))return screenTemplate(id,catalog);
 return makeBasicTemplate(id,catalog);
}
