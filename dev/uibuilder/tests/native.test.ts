import assert from "node:assert/strict";
import {test} from "node:test";
import {CharSelectState,PAD,type CharSelectConfig} from "@app/scene/menu/charselect/state";
import {SessionListView,type OEv,type OIO} from "@app/scene/menu/online/panels";
import {BTN,type RoomSummary} from "@app/common/net/protocol/types";
import {characterPointerPath} from "../src/adapters/mpj/characterPointer";
const config:CharSelectConfig={btnNo:[0,1,2,3,4,5,6,7,8,9,11,12,10,13,14,15,16,17,18,19,20,21],unlocked:{pauline:true,ninji:true},players:[{type:0,initial:0},{type:0,initial:1}],rand:()=>0};
test("character pointer delegates each route step to the imported web selection state",()=>{
 const state=new CharSelectState(config);state.start(true);
 const path=characterPointerPath(state,20,0,config);assert.ok(path.length>0);
 for(const direction of path)state.step([{trig:direction,rep:0},{trig:0,rep:0}]);
 assert.equal(state.players[0].cursor,20);assert.equal(state.players[1].cursor,1);
 assert.deepEqual(characterPointerPath(state,1,0,config),[]);
 state.step([{trig:PAD.A,rep:0}]);assert.equal(state.players[0].decided,true);
 state.step([{trig:PAD.B,rep:0}]);assert.equal(state.players[0].decided,false);
});
test("imported room list scrolls the five-row window, updates names/faces/locks and keeps repeat at edges",()=>{
 const events:OEv[]=[],panel=new SessionListView({push:e=>events.push(e)});
 const rooms:RoomSummary[]=Array.from({length:12},(_,i)=>({id:String(i),host:`room ${i}`,size:4,members:[i%22],locked:i===6}));
 const io=(trig=0,rep=0):OIO=>({trig,rep,hold:0,done:()=>true});
 panel.setType(4,false);panel.life.in(true);panel.refresh(rooms);
 for(let i=0;i<6;i++){panel.move(io(BTN.DOWN),rooms.length);panel.refresh(rooms);}
 assert.equal(panel.cursor,6);assert.equal(panel.top,2);
 assert.ok(events.some(e=>e.t==="raw"&&e.path==="x_btn_04/x_parts_username/x_text_00"&&e.s==="room 6"));
 assert.ok(events.some(e=>e.t==="vis"&&e.path==="x_btn_04/x_icon_pass"&&e.v));
 assert.ok(events.some(e=>e.t==="face"&&e.chara===6));
 panel.cursor=11;panel.top=7;assert.equal(panel.move(io(0,BTN.DOWN),12),false);assert.equal(panel.cursor,11);
 panel.move(io(BTN.DOWN),12);assert.equal(panel.cursor,0);assert.equal(panel.top,0);
 panel.setType(8,false);assert.ok(events.some(e=>e.t==="play"&&e.path==="x_tab_8"&&e.tag==="on"));
});
