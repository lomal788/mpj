import { createNativeHost } from "./nativeHost";
import { MgmWindow } from "@app/common/ui/window";
import { nodeMatrix } from "@app/scene/menu/charselect/render2d";
import { RepeatGen } from "@app/scene/menu/charselect/state";
import { PAD } from "@app/common/ui/input";
import type { NativePreviewFactory } from "../../plugins/uibuilder/nativePreview";
import { applyBindings,partName } from "./nativeBindings";
import { windowFramesFirst } from "./windowOrder";
const parts: Record<string,string>={online:"../online/online.json",freeplay:"mgm01.json",harbor:"mgmet.json",plaza:"../plaza/ui/plaza_ui.json",card:"../plaza/ui/plaza_card.json"};
export const nativeWindow:NativePreviewFactory=async(doc,canvas,input,app)=>{
 const config=doc.settings.window as {source:string;layout:string;menu:string[]},host=await createNativeHost(canvas,parts[config.source]?[parts[config.source]]:[]);
 const win=new MgmWindow(host,config.layout),base=doc.entities.find(e=>partName(e)===config.layout)!;
 windowFramesFirst(win.inst);const repeat=new RepeatGen();let pending=0,deciding=false,result="";
 const p=base.transform,angle=p.rotation*Math.PI/180;win.base=[Math.cos(angle)*p.scale,-Math.sin(angle)*p.scale,p.x,Math.sin(angle)*p.scale,Math.cos(angle)*p.scale,p.y];
 win.setupMenu(1,config.menu.length,{wrap:(doc.settings.input as any)?.wrap!==false,checkEnable:true});config.menu.forEach((path,i)=>win.setupItem(0,i,path));
 win.setupFinish();if(config.menu.length)win.setCursor(0,0,true);win.in();
 const background=host.layout("sys_bg_set_00");background.play("normal");
 const bindings=()=>applyBindings(win.inst,base,{});bindings();
 return {
 tick(){const s=input.nativePoll?.(1)?.[0]??{hold:0,trig:0},trig=s.trig|pending;pending=0;const rep=repeat.next(s.hold,trig);
  if(win.life.visible && !win.life.opening && !win.life.closing){
   if(deciding){if(!win.isCursorItemAnimating()){const choice=config.menu[win.cursor.col];result=`결정 · ${choice??doc.title}`;app.return({template:doc.id,choice});win.out();deciding=false;}}
   else if(trig&PAD.B){result="취소";app.return("cancel");win.out();}
   else if(trig&PAD.A){if(config.menu.length){win.decide();deciding=true;}else{result="확인";app.return(doc.id);win.out();}}
   else if((trig|rep)&(PAD.LEFT|PAD.UP))win.moveX(-1);
   else if((trig|rep)&(PAD.RIGHT|PAD.DOWN))win.moveX(1);
  }
  win.update();bindings();
 },
 draw(){host.begin();host.draw(background);win.draw();host.end();},
 decide(){pending|=PAD.A;},cancel(){pending|=PAD.B;},focus(id){if(!deciding&&!win.life.opening&&!win.life.closing)win.setCursor(0,Number(id));},random(){if(config.menu.length)win.setCursor(0,Math.floor(Math.random()*config.menu.length));},
 get status(){return !win.life.visible?"미리보기 종료":win.life.opening?"등장 중":win.life.closing?"퇴장 중":deciding?"결정 애니메이션":"입력 대기";},get result(){return result;},
 get targets(){if(!win.life.visible||win.life.opening||win.life.closing||deciding)return [];return config.menu.map((path,i)=>{const m=nodeMatrix(win.inst,path,win.base),part=win.inst.part(path),pane=part?.nodes.find(n=>n.spec.k==="pic");return{id:String(i),name:part?.texts.values().next().value??path,x:m?.[2]??0,y:m?.[5]??0,width:Math.min(700,pane?.z[0]??500)*p.scale,height:Math.min(220,pane?.z[1]??130)*p.scale,focused:win.cursor.col===i};});},
 dispose(){input.dispose();host.dispose();host.gl.forceContextLoss();}
 };
};
