import { templateDocument,addPart,text,visible } from "./factory";
import type { Catalog,Binding } from "../schema";
export const CHARACTER_TEMPLATES=[{id:"card-grid",name:"캐릭터 격자 · 4P",group:"캐릭터"},{id:"characters-1p",name:"캐릭터 선택 · 1P",group:"캐릭터"},{id:"characters-2p",name:"캐릭터 선택 · 2P",group:"캐릭터"},{id:"characters-3p",name:"캐릭터 선택 · 3P",group:"캐릭터"},{id:"characters-locked",name:"캐릭터 선택 · 잠금 포함",group:"캐릭터"}];
export const CHARACTERS=["마리오","루이지","피치","데이지","와리오","와루이지","요시","키노피코","키노피오","로젤리나","동키콩","캐서린","폴린","쿠파","굼바","헤이호","엉금엉금","쪼르뚜","쿠파주니어","부끄부끄","가봉","닌군"];
export const PCS=["pc01","pc02","pc03","pc04","pc05","pc06","pc07","pc08","pc09","pc11","pc12","pc13","pc14","pc50","pc51","pc52","pc53","pc54","pc56","pc58","pc61","pc62"];
export const BUTTONS=[0,1,2,3,4,5,6,7,8,9,11,12,10,13,14,15,16,17,18,19,20,21];
export function characterTemplate(id:string,catalog:Catalog){
 const definition=CHARACTER_TEMPLATES.find(t=>t.id===id)!,d=templateDocument(id,definition.name),count=id.match(/-(\d)p$/)?.[1];
 d.settings.nativePreview="charselect";d.settings.input={...(d.settings.input as object),players:Number(count)||4,multi:true};d.settings.unlocked={pauline:id!=="characters-locked",ninji:id!=="characters-locked"};
 addPart(d,catalog,"sys_bg_set_00").locked=true;
 addPart(d,catalog,"sys_connect_tlp_00").props.bindings=[text("x_text_title_00","캐릭터를 선택해 주세요")];
 const cards=addPart(d,catalog,"sys_base_charasel_00"),players=Number(count)||4;
 cards.props.bindings=Array.from({length:4},(_,i)=>visible(`x_null_${i+1}win`,i+1===players));
 const grid=addPart(d,catalog,"sys_base_charasel_01",0,-296);
 const bindings:Binding[]=[visible("x_null_win",false),text("x_parts_btn_random/x_text_random","랜덤")];
 for(let c=0;c<22;c++){const b=`x_parts_btn_${String(BUTTONS[c]).padStart(2,"0")}`,locked=id==="characters-locked"&&(c===12||c===21);
 bindings.push(visible(`${b}/x_null_open`,!locked),visible(`${b}/x_null_secret`,locked),text(`${b}/x_text_secret`,"?"));
 for(const part of ["x_parts_pc128","x_face_secret"])bindings.push({pane:`${b}/${part}/x_face_pc256`,kind:"image",slot:1,value:`face_128_${PCS[c]}^u`});
 }
 grid.props.bindings=bindings;
 // Standalone OK is controlled by the imported native screen, hidden in the edit composition.
 const ok=addPart(d,catalog,"sys_btn_ok_00");ok.visible=false;ok.props.bindings=[text("x_text_ok","OK")];
 return d;
}
