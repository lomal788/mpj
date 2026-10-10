import { createCharSelect } from "@app/scene/menu/charselect/screen";
import { nodeMatrix } from "@app/scene/menu/charselect/render2d";
import { PAD, RANDOM } from "@app/scene/menu/charselect/state";
import type { LayoutInst } from "@app/scene/menu/charselect/scene2d";
import type { NativePreviewFactory, NativeSession } from "../../plugins/uibuilder/nativePreview";
import { characterPointerPath } from "./characterPointer";
import { applyBindings,partName } from "./nativeBindings";

/** The editor only adapts its document/input contract. The web screen owns all selection and rendering. */
export const nativeCharSelect: NativePreviewFactory = async (doc, canvas, input, app) => {
  const players = Math.min(4, Math.max(1, Number((doc.settings.input as any)?.players) || 4));
  const pending = Array.from({length: players}, () => ({hold:0, trig:0}));
  const pointerPaths = new Map<number,number[]>(), pointerConfirm = new Set<number>();
  let pads = pending.map(x=>({...x})), result = "";
  const handle = await createCharSelect({canvas,
    assets: {url: p => new URL(p, new URL("/assets/charselect/", location.origin)).pathname},
    input: {poll: pid => pads[pid] ?? {hold:0,trig:0}},
    players: Array.from({length: players}, (_,i)=>({type: "human" as const, name:`${i+1}P`, initial:i})),
    unlocked: (doc.settings.unlocked as {pauline:boolean; ninji:boolean}) ?? {pauline:true,ninji:true},
    sound: {play: label=>app.sound(label), vibrate:(pid,name)=>app.vibrate(pid,name)},
    onDecided: ids => { result = `결정 · ${ids.map((id,i)=>`${i+1}P ${handle.spec.texts[handle.spec.chars[id]?.label]??id}`).join(" / ")}`; app.return(ids); },
    onCancel: ()=> { result="취소 · 캐릭터 선택"; app.return("cancel"); }
  });
  const roles: Record<string, keyof typeof handle.layouts> = {sys_bg_set_00:"bg",sys_connect_tlp_00:"title",sys_base_charasel_00:"cards",sys_base_charasel_01:"grid",sys_btn_ok_00:"ok",sys_guide_03:"guide"};
  const apply = (persistentOnly=false) => { for (const entity of doc.entities) { if(persistentOnly && entity.props.animationMode!=="persistent")continue; const layout = roles[partName(entity)]; if (layout) {
      const inst=handle.layouts[layout],root=inst.nodes[0],t=entity.transform;
      root.t=[t.x,t.y+(layout==="grid"?296:0)];root.s=[t.scale,t.scale];root.r=t.rotation;
      applyBindings(inst, entity, {});
    } } };
  apply();
  const path = (c: number) => c===RANDOM ? "x_parts_btn_random" : `x_parts_btn_${String(handle.spec.chars[c].btn).padStart(2,"0")}`;
  const send = (pid:number, bits:number) => { if(pending[pid]) pending[pid].trig |= bits; };
  const target = (inst: LayoutInst, p:string, base?: Parameters<typeof nodeMatrix>[2]) => nodeMatrix(inst,p,base);
  return {
    tick() { const sampled=input.nativePoll?.(players) ?? pending.map(()=>({hold:0,trig:0})); pads=sampled.map((s,i)=>({hold:s.hold, trig:s.trig|pending[i].trig})); pending.forEach(x=>x.trig=0);
      for(const [pid,path] of pointerPaths) {
        if(path.length) pads[pid].trig |= path.shift()!;
        else {pointerPaths.delete(pid);if(pointerConfirm.delete(pid))pads[pid].trig |= PAD.A;}
      }
      handle.step(); apply(true); },
    draw() {handle.render();},
    decide(pid) {if(pointerPaths.has(pid))pointerConfirm.add(pid);else send(handle.state.phase===2?handle.state.operator:pid,PAD.A);}, cancel(pid) {pointerPaths.delete(pid);pointerConfirm.delete(pid);send(handle.state.phase===2?handle.state.operator:pid,PAD.B);},
    focus(id,pid) {
      if(id==="ok")return;
      const path=characterPointerPath(handle.state,Number(id),pid,{btnNo:handle.spec.chars.map(c=>c.btn),unlocked:(doc.settings.unlocked as {pauline:boolean;ninji:boolean})??{pauline:true,ninji:true},players:[],rand:n=>Math.floor(Math.random()*n)});
      if(path.length)pointerPaths.set(pid,path);
      return path.length>0 || handle.state.players[pid]?.cursor===Number(id);
    },
    random(pid) { (this as NativeSession).focus(String(RANDOM),pid); },
    get status() { return ["등장 중", "입력 대기", "최종 OK 확인", "결정 애니메이션", "퇴장 중", "미리보기 종료"][handle.state.phase]; },
    get result() { return result || handle.state.players.map(p=>`${p.pid+1}P ${handle.spec.texts[handle.spec.chars[p.cursor]?.label] ?? "랜덤"}${p.decided?" ✓":""}`).join(" · "); },
    get targets() {
      const base=target(handle.layouts.cards,"x_null_win_charasel"), matrix: [number,number,number,number,number,number]=[1,0,base?.[2]??0,0,1,base?.[5]??-296];
      const items = Array.from({length:RANDOM+1},(_,c)=>{ const m=target(handle.layouts.grid,path(c),matrix); return {id:String(c),name:handle.spec.texts[handle.spec.chars[c]?.label]??"랜덤",x:m?.[2]??0,y:m?.[5]??0,width:140,height:148,focused:handle.state.players.some(p=>p.cursor===c)}; });
      if(handle.state.phase===2) return [{id:"ok",name:"OK",x:0,y:-420,width:520,height:140,focused:true}];
      return handle.state.phase===1?items:[];
    },
    dispose() {input.dispose(); handle.dispose();}
  };
};
