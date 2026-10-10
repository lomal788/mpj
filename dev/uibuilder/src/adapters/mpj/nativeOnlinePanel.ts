import { createNativeHost } from "./nativeHost";
import { OnlineView } from "@app/scene/menu/online/view";
import { applyOnlineExtra } from "@app/scene/menu/online/screen";
import {NetMenuPanel,RoomTypePanel,OpponentPanel,type OIO,type Lay} from "@app/scene/menu/online/panels";
import {RepeatGen} from "@app/scene/menu/charselect/state";
import {BTN} from "@app/common/net/protocol/types";
import {nodeMatrix} from "@app/scene/menu/charselect/render2d";
import {readField} from "../../plugins/uibuilder/data";
import {partName} from "./nativeBindings";
import type { NativePreviewFactory } from "../../plugins/uibuilder/nativePreview";
export const nativeOnlinePanel:NativePreviewFactory=async(doc,canvas,input,app)=>{
 const host=await createNativeHost(canvas,["../online/online.json","../mgm01/faces.json"]);applyOnlineExtra(host.spec,await(await fetch("/api/library/online")).json());
 const view=new OnlineView(host,label=>app.sound(label)),sink={push:view.push.bind(view)},kind=String(doc.settings.onlinePanel),repeat=new RepeatGen();
 const panel=kind==="netMenu"?new NetMenuPanel(sink):kind==="roomType"?new RoomTypePanel(sink):new OpponentPanel(sink),lay=kind as Lay;
 view.push({t:"show",l:"bg",v:true});view.push({t:"play",l:"bg",path:"",tag:"normal"});
 if(panel instanceof NetMenuPanel)panel.start();else if(panel instanceof RoomTypePanel)panel.start(1);else panel.start(1,false);
 const layoutNames:Record<string,string>={netMenu:"mn00_friend_base_set_00",roomType:"mn00_friend_base_num_00",opponent:"mn01_base_opponent_00"};
 const base=doc.entities.find(n=>partName(n)===layoutNames[kind]);
 if(base)for(const b of (base.props.bindings as import("../../plugins/uibuilder/schema").Binding[])??[])if(b.kind==="text")view.push({t:"text",l:lay,path:b.pane,label:String(b.field?readField({},b.field):b.value)});
 let pending=0,result="",roomDeciding=false,returned=false,confirmQueued=false;
 const finish=(cancel:boolean)=>{if(returned)return;returned=true;result=cancel?"취소":`결정 · ${panel.sel===0?(kind==="netMenu"?"방 만들기":kind==="roomType"?"4인 방":"CPU / 가까이"):kind==="netMenu"?"방 찾기":kind==="roomType"?"8인 방":"전 세계"}`;app.return(cancel?"cancel":{template:doc.id,choice:panel.sel});};
 return {
 tick(){const s=input.nativePoll?.(1)?.[0]??{hold:0,trig:0},trig=s.trig|pending|(confirmQueued && !pending && view.done(lay,"x_parts_btn_00") && view.done(lay,"x_parts_btn_01") ? BTN.A:0);if(trig&BTN.A)confirmQueued=false;pending=0;const io:OIO={hold:s.hold,trig,rep:repeat.next(s.hold,trig),done:(l,p)=>view.done(l,p)};
  if(panel instanceof RoomTypePanel){panel.life.update(io);if(panel.life.idle && panel.btnIdle(io)){
    if(roomDeciding){finish(false);panel.life.out();}
    else if(trig&BTN.B){finish(true);panel.life.out();}
    else if(trig&BTN.A){panel.press();roomDeciding=true;}
    else if(trig&BTN.LEFT)panel.select(0,false);else if(trig&BTN.RIGHT)panel.select(1,false);
  }}else{panel.update(io);if(panel.decided)finish(panel instanceof NetMenuPanel?panel.canceled:panel.result<0);}
  view.update(1/60);
 },draw(){host.begin();view.draw(()=>"");host.end();},decide(){confirmQueued=true;},cancel(){confirmQueued=false;pending|=BTN.B;},
 focus(id){if(!panel.life.idle || roomDeciding || (panel instanceof NetMenuPanel && panel.decided) || (panel instanceof OpponentPanel && panel.decided))return false;const target=Number(id);if(target!==panel.sel)pending|=target===0?BTN.LEFT:BTN.RIGHT;return true;},random(){pending|=Math.random()<.5?BTN.LEFT:BTN.RIGHT;},
 get status(){return panel.life.st===0?"등장 중":panel.life.st===2?"퇴장 중":panel.life.st===-1?"미리보기 종료":roomDeciding?"결정 애니메이션":"입력 대기";},get result(){return result;},
 get targets(){if(!panel.life.idle || roomDeciding)return [];return [0,1].map(i=>{const path=`x_parts_btn_0${i}`,m=nodeMatrix(view.inst[lay],path);return{id:String(i),name:kind==="netMenu"?(i?"방 찾기":"방 만들기"):kind==="roomType"?(i?"8인 방":"4인 방"):(i?"전 세계":"CPU / 가까이"),x:m?.[2]??0,y:m?.[5]??0,width:540,height:650,focused:panel.sel===i};});},
 dispose(){input.dispose();host.dispose();host.gl.forceContextLoss();}
 };
};
