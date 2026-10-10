import { MgmView } from "@app/common/ui/view";
import { applyOnlineExtra } from "@app/scene/menu/online/screen";
import { OnlineView } from "@app/scene/menu/online/view";
import { SessionListView, type OIO } from "@app/scene/menu/online/panels";
import { BTN, type RoomSummary } from "@app/common/net/protocol/types";
import { RepeatGen } from "@app/scene/menu/charselect/state";
import type { NativePreviewFactory } from "../../plugins/uibuilder/nativePreview";
import { readField } from "../../plugins/uibuilder/data";
import { applyBindings,partName } from "./nativeBindings";

/** Actual web panels/view; networking is supplied by editable sample rows for a builder preview. */
export const nativeRoomList: NativePreviewFactory = async (doc,canvas,input,app) => {
  const host=await MgmView.create({canvas,assets:{url:p=>new URL(p,new URL("/assets/mgmcommon/",location.origin)).pathname},parts:["../online/online.json","../mgm01/faces.json"]});
  const extra=await (await fetch("/api/library/online")).json(); applyOnlineExtra(host.spec,extra);
  const view=new OnlineView(host,label=>app.sound(label));
  const panel=new SessionListView({push:e=>view.push(e)}), rep=new RepeatGen();
  const sets=(doc.settings.datasets??{}) as Record<string,Record<string,unknown>[]>;
  const dataset=doc.entities.find(n=>partName(n)==="mn00_room_search_00")?.props.dataset;
  const data=sets[String(dataset??"roomScreen")]?.[0]??{}, all=(data.rooms??[]) as RoomSummary[];
  let headingDirty=true;
  let type:4|8=doc.settings.roomSize===8?8:4, rows=all.filter(r=>r.size===type), pending=0, result="", deciding=false;
  view.push({t:"show",l:"bg",v:true}); view.push({t:"play",l:"bg",path:"",tag:"normal"});
  panel.clearAll(); panel.setType(type,false); panel.life.in(); panel.refresh(rows);
  const base=doc.entities.find(n=>partName(n)==="mn00_room_search_00");
  if(base){const t=base.transform,root=view.inst.list.nodes[0];root.t=[t.x,t.y];root.s=[t.scale,t.scale];root.r=t.rotation;}
  // Row bindings are driven by the original panel, so only editor-authored heading overrides persist.
  const headingBindings=base?{...base,props:{...base.props,bindings:(base.props.bindings as any[]??[]).filter(b=>!b.pane.startsWith("x_btn_") && !b.pane.startsWith("x_tab_"))}}:null;
  const io = (hold=0,trig=0):OIO=>({hold,trig,rep:rep.next(hold,trig),done:(l,p)=>view.done(l,p)});
  const switchType = (next:4|8) => { headingDirty=true; type=next;rows=all.filter(r=>r.size===type);panel.cursor=panel.top=0;panel.clearAll();panel.setType(type,false);panel.refresh(rows); };
  return {
    tick() {
      const sampled=input.nativePoll?.(1)?.[0]??{hold:0,trig:0}, p=io(sampled.hold,sampled.trig|pending);pending=0;
      panel.life.update(p);panel.settle(p);
      if(panel.life.idle && !deciding) {
        if(p.trig & BTN.B) {result="취소 · 방 목록";app.return("cancel");panel.life.out();}
        else if(p.trig & BTN.A && rows.length && !panel.rowsAnimating()) {panel.playRow(panel.cursor-panel.top,3);deciding=true;}
        else if(p.trig & BTN.LEFT) switchType(4);
        else if(p.trig & BTN.RIGHT) switchType(8);
        else {panel.move(p,rows.length);panel.refresh(rows);}
      } else if(deciding && view.done("list",`x_btn_0${panel.cursor-panel.top}`)) {
        const room=rows[panel.cursor];result=`결정 · ${room.host} (${room.members.length}/${room.size})`;app.return(room);deciding=false;panel.life.out();
      }
      if(headingBindings && headingDirty) for(const b of (headingBindings.props.bindings as import("../../plugins/uibuilder/schema").Binding[]) ?? []) {
        if(b.kind==="text") view.push({t:"text",l:"list",path:b.pane,label:String(b.field?readField(data,b.field):b.value)});
        else applyBindings(view.inst.list,{...headingBindings,props:{bindings:[b]}},data);
      }
      headingDirty=false;
      view.update(1/60);
    },
    draw() {host.begin();view.draw(()=>"");host.end();},
    decide() {pending|=BTN.A;},cancel() {pending|=BTN.B;},
    focus(id) {
      if(!panel.life.idle || deciding)return;
      if(id==="tab4" || id==="tab8") {switchType(id==="tab4"?4:8);return;}
      const index=Number(id);if(index>=0 && index<rows.length){panel.cursor=index;panel.refresh(rows);}
    },
    random() {if(rows.length){panel.cursor=Math.floor(Math.random()*rows.length);panel.top=Math.max(0,panel.cursor-4);panel.refresh(rows);}},
    get status() {return panel.life.st===0?"등장 중":panel.life.st===2?"퇴장 중":panel.life.st===-1?"미리보기 종료":deciding?"결정 애니메이션":`입력 대기 · ${type}인 방 · ${rows.length?panel.cursor+1:0}/${rows.length} · 표시 ${panel.top+1}–${Math.min(panel.top+5,rows.length)}`;},
    get result() {return result;},
    get targets() {
      if(!panel.life.idle || deciding)return [];
      return [{id:"tab4",name:"4인 방",x:-332,y:441,width:650,height:90,focused:type===4},{id:"tab8",name:"8인 방",x:332,y:441,width:650,height:90,focused:type===8},...rows.slice(panel.top,panel.top+5).map((r,i)=>({id:String(panel.top+i),name:r.host,x:0,y:138-i*112,width:1330,height:100,focused:panel.cursor===panel.top+i}))];
    },
    dispose() {input.dispose();host.dispose();host.gl.forceContextLoss();}
  };
};
