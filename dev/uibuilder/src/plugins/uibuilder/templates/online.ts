import type { Catalog,Binding } from "../schema";
import { templateDocument,addPart,text } from "./factory";
import { PCS } from "./characters";
export const ROOM_TEMPLATES=[{id:"list",name:"방 목록 · 4인",group:"온라인"},{id:"rooms-8p",name:"방 목록 · 8인",group:"온라인"},{id:"rooms-empty",name:"방 목록 · 빈 목록",group:"온라인"}];
export function roomTemplate(id:string,catalog:Catalog){
 const d=templateDocument(id,ROOM_TEMPLATES.find(t=>t.id===id)!.name);d.settings.nativePreview="room-list";d.settings.roomSize=id==="rooms-8p"?8:4;
 addPart(d,catalog,"mn00_friend_bg_00").locked=true;
 const base=addPart(d,catalog,"mn00_room_search_00");base.props.dataset="roomScreen";
 const rooms=id==="rooms-empty"?[]:Array.from({length:24},(_,i)=>({id:`room-${i+1}`,host:`파티 방 ${i+1}`,size:i<12?4:8,locked:i%4===3,members:Array.from({length:1+i%(i<12?4:8)},(_,k)=>(i+k)%22)}));
 d.settings.datasets={roomScreen:[{rooms}]};
 const offset=id==="rooms-8p"?12:0;
 const bindings:Binding[]=[text("x_text_mess_00",rooms.length?"참가할 방을 선택해 주세요":"찾은 방이 없습니다"),text("x_tab_4/x_text_title","4인 방"),text("x_tab_8/x_text_title","8인 방")];
 for(let i=0;i<5;i++){
  const b=`x_btn_0${i}`,r=rooms[offset+i];
  if(!r){bindings.push({pane:b,kind:"visible",value:"false"});continue;}
  for(const p of ["x_text_00","x_text_01"])bindings.push({pane:`${b}/x_parts_username/${p}`,kind:"text",field:`rooms.${offset+i}.host`});
  bindings.push({pane:`${b}/x_null_8`,kind:"visible",value:String(r.size===8)},{pane:`${b}/x_icon_pass`,kind:"visible",value:String(r.locked)});
  for(let k=0;k<8;k++){const f=`${b}/x_parts_face_0${k}`;bindings.push({pane:`${f}/x_face_on`,kind:"visible",value:String(k<r.members.length)},{pane:`${f}/x_face_off`,kind:"visible",value:String(k<r.size)});if(k<r.members.length)bindings.push({pane:`${f}/x_face_on/x_face_pc64`,kind:"image",slot:1,value:`face_128_${PCS[r.members[k]]}^u`});}
 }
 base.props.bindings=bindings;return d;
}
