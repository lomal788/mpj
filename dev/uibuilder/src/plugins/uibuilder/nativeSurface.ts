import { el,button,select } from "../../editor/dom";
import type { EditorDocument } from "../../editor/document";
import type { EditorContext } from "../../editor/extensions";
import type { BuilderServices } from "./services";
import type { NativeSession } from "./nativePreview";
/** Browser chrome is editor-owned; native session rendering and behavior stay in the web adapter. */
export function mountNativeSurface(host:HTMLElement,doc:EditorDocument,ctx:EditorContext,services:BuilderServices) {
  const surface=el("div","preview-surface"), frame=el("div","preview-frame"),canvas=el("canvas","preview-canvas"),hits=el("div","preview-hits"),status=el("p","preview-state","원본 화면 준비 중…"),result=el("p","preview-result"),controls=el("div","preview-controls");
  canvas.tabIndex=0;canvas.setAttribute("aria-label",`${doc.title} 실행 미리보기 화면`);frame.append(canvas,hits);
  surface.append(el("h3","",doc.title),frame,status,result,controls,el("p","hint","기존 web 화면 재사용 · 방향키 / Enter / Esc · 방 목록 좌우: 4·8인 탭"));host.append(surface);
  let session:NativeSession|null=null,preparing=false,disposed=false,raf=0,last=0,acc=0,pid=0,hitKey="",generation=0;
  const app=services.createPreviewServices(ctx);
  const sync=()=>{
    if(!session)return;
    status.textContent=session.status;result.textContent=session.result;
    const targets=session.targets,key=JSON.stringify(targets);
    if(key===hitKey)return;hitKey=key;hits.replaceChildren();
    for(const t of targets){const b=el("button","preview-hit");b.type="button";b.tabIndex=-1;b.setAttribute("aria-label",`미리보기 선택 ${t.name}`);b.setAttribute("aria-pressed",String(t.focused??false));b.style.cssText=`left:${(960+t.x-t.width/2)/19.2}%;top:${(540-t.y-t.height/2)/10.8}%;width:${t.width/19.2}%;height:${t.height/10.8}%`;
      b.onpointerdown=e=>{e.preventDefault();canvas.focus();};b.onclick=()=>{canvas.focus();const focused=session?.focus(t.id,pid);if(focused!==false && !t.id.startsWith("tab"))session?.decide(pid);};hits.append(b);
    }
  };
  const start=async()=>{
    if(preparing || disposed)return;preparing=true;
    const version=++generation;session?.dispose();session=null;hitKey="";hits.replaceChildren();status.textContent="원본 화면 준비 중…";
    const input=services.createInput(frame,()=>pid);
    try {const next=await services.createNativePreview!(structuredClone(doc),canvas,input,app);
      if(disposed || version!==generation){next.dispose();return;}session=next;sync();canvas.focus();
    }catch(e){input.dispose();if(!disposed)status.textContent=`준비 실패: ${String(e)}`;}finally{preparing=false;}
  };
  controls.append(button("다시 실행",()=>void start()),button("결정 (A / Enter)",()=>{session?.decide(pid);canvas.focus();}),button("취소 (B / Esc)",()=>{session?.cancel(pid);canvas.focus();}),button("랜덤 선택",()=>{session?.random(pid);canvas.focus();}));
  const players=Number((doc.settings.input as any)?.players)||1;
  if(players>1){const picker=select(Array.from({length:players},(_,i)=>({value:String(i),label:`키보드 / 마우스 ${i+1}P`})),"0",v=>{pid=Number(v);canvas.focus();});picker.setAttribute("aria-label",`${doc.title} 조작 플레이어`);controls.append(picker);}
  const loop=(now:number)=>{if(disposed)return;acc+=last?Math.min((now-last)/1000,.1):0;last=now;while(acc>=1/60){session?.tick();acc-=1/60;}session?.draw();sync();raf=requestAnimationFrame(loop);};raf=requestAnimationFrame(loop);void start();
  return ()=>{if(disposed)return;disposed=true;generation++;cancelAnimationFrame(raf);session?.dispose();app.dispose?.();surface.remove();};
}
