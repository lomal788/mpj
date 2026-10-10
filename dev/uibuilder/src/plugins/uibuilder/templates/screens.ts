import type { Catalog } from "../schema";
import { templateDocument,addPart,text } from "./factory";
// Converted original compositions. Recipes reference source parts instead of copying layouts or screen logic.
export const SCREEN_TEMPLATES=[
 {id:"net-menu",name:"온라인 · 방 만들기 / 찾기",group:"온라인",source:"online",layout:"mn00_friend_base_set_00",menu:["x_parts_btn_00","x_parts_btn_01"]},
 {id:"room-type",name:"온라인 · 4인 / 8인 방 선택",group:"온라인",source:"online",layout:"mn00_friend_base_num_00",menu:["x_parts_btn_00","x_parts_btn_01"]},
 {id:"opponent",name:"온라인 · 대전 상대 선택",group:"온라인",source:"online",layout:"mn01_base_opponent_00",menu:["x_parts_btn_00","x_parts_btn_01"]},
 {id:"room-info",name:"온라인 · 방 정보",group:"온라인",source:"online",layout:"mn00_room_info_00",menu:[]},
 {id:"lobby",name:"온라인 · 로비 대기",group:"온라인",source:"online",layout:"mn00_base_lobby_00",menu:[]},
 {id:"matching",name:"온라인 · 매칭 텔롭",group:"온라인",source:"online",layout:"matching00_tlp_00",menu:[]},
 {id:"loading",name:"온라인 · 로딩 텔롭",group:"온라인",source:"online",layout:"sys_tlp_loading_00",menu:[]},
 {id:"freeplay",name:"프리 플레이 · 미니게임 선택 창",group:"미니게임",source:"freeplay",layout:"mgm01_base_freeplay_00",menu:[]},
 {id:"game-info",name:"프리 플레이 · 상세 / 규칙",group:"미니게임",source:"freeplay",layout:"mgm01_base_mginfo_00",menu:["x_rule/x_play_00"]},
 {id:"game-rules",name:"프리 플레이 · 팀 / 규칙 설정",group:"미니게임",source:"freeplay",layout:"mgm01_base_rule_00",menu:["x_play_00"]},
 {id:"minigame-lineup",name:"미니게임 · 라인업 선택",group:"미니게임",source:"common",layout:"mgm00_base_mgselect_00",menu:[]},
 {id:"minigame-result",name:"미니게임 · 결과 화면",group:"미니게임",source:"common",layout:"mgm00_base_mgresult_00",menu:[]},
 {id:"party-stats",name:"미니게임 · 4P 상태",group:"미니게임",source:"common",layout:"mgm00_base_mgmstat_00",menu:[]},
 {id:"harbor-opponent",name:"항구 · 대전 상대 선택",group:"항구",source:"harbor",layout:"mgmet_base_opponent_00",menu:["x_parts_btn_00","x_parts_btn_01"]},
 ...["freeplay","daily","chal","survival","tag"].map((mode,i)=>({id:`harbor-${mode}`,name:`항구 · ${["프리 플레이","데일리","챌린지","서바이벌","태그"][i]} 정보`,group:"항구",source:"harbor",layout:`mgmet_base_playinfo_${mode}_00`,menu:[]})),
 {id:"harbor-rules",name:"항구 · 규칙 설정",group:"항구",source:"harbor",layout:"mgmet_base_rule_00",menu:["x_play_00"]},
 {id:"harbor-results",name:"항구 · 데일리 결과",group:"항구",source:"harbor",layout:"mgmet_result_base_00",menu:[]},
 {id:"harbor-challenge-results",name:"항구 · 챌린지 승패표",group:"항구",source:"harbor",layout:"mgmet_chal_result_base_00",menu:[]},
 {id:"harbor-tag-results",name:"항구 · 태그 승패표",group:"항구",source:"harbor",layout:"mgmet_tag_result_base_00",menu:[]},
 {id:"plaza-stamps",name:"광장 · 스탬프 목록",group:"광장 / 카드",source:"plaza",layout:"sys_stamp_list_00",menu:[]},
 {id:"party-card",name:"광장 · 파티 카드",group:"광장 / 카드",source:"card",layout:"sys_card_base_00",menu:[]}
];
export function screenTemplate(id:string,catalog:Catalog){
 const t=SCREEN_TEMPLATES.find(x=>x.id===id)!,d=templateDocument(id,t.name);
 addPart(d,catalog,t.source==="online"?"mn00_friend_bg_00":"sys_bg_set_00").locked=true;
 const root=addPart(d,catalog,t.layout),part=catalog.entries.find(p=>p.layout===t.layout)!;
 d.settings.nativePreview="window";
 const panel:Record<string,string>={"net-menu":"netMenu","room-type":"roomType","opponent":"opponent"};
 if(panel[id]) {d.settings.nativePreview="online-panel";d.settings.onlinePanel=panel[id];}d.settings.window={source:t.source,layout:t.layout,menu:t.menu};
 const panes=new Set(part.panes.map(p=>p.name));
 root.props.bindings=part.panes.filter(p=>p.kind==="txt" && !p.text && !p.name.includes("shadow") && !p.name.includes("/") && /title|mgname|x_text_00$/.test(p.name)).slice(0,4).map(p=>text(p.name,p.name.includes("title")?t.name:p.name.includes("mgname")?"선택한 미니게임":"문구를 편집해 주세요"));
 for(const b of root.props.bindings as import("../schema").Binding[]){const shadow=`${b.pane}_shadow`;if(panes.has(shadow)) (root.props.bindings as import("../schema").Binding[]).push({...b,pane:shadow});}
 if(panel[id])root.props.bindings=[];
 return d;
}
