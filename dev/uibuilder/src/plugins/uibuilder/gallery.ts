import { el,button,select } from "../../editor/dom";
import type { EditorContext } from "../../editor/extensions";
import type { EditorDocument } from "../../editor/document";
import type { BuilderServices } from "./services";
import { makeTemplate,TEMPLATES } from "./templates";
import { partDocument } from "./presentation";
import { createThumbnails } from "./thumbnails";
import { mountPreview } from "./previewDialog";
interface Entry {id:string;title:string;group:string;detail?:string;doc:()=>EditorDocument;part?:import("./schema").PartEntry}
export function showGallery(ctx:EditorContext,services:BuilderServices,openTemplate:(id:string)=>void){
 const dialog=el("dialog","gallery-dialog"),header=el("div","preview-heading"),controls=el("div","gallery-tools"),list=el("div","gallery-grid"),board=el("div","comparison-grid"),status=el("span","gallery-count"),selection=new Map<string,Entry>(),thumbnails=createThumbnails(services);
 let scope="templates",group="all",comparisons:(()=>void)[]=[],closed=false;
 const close=()=>{if(closed)return;closed=true;comparisons.forEach(f=>f());thumbnails.dispose();dialog.close();dialog.remove();};
 header.append(el("h2","","미리보기 갤러리"),button("닫기",close));
 const search=el("input");search.type="search";search.placeholder="화면 · 레이아웃 이름 검색";search.setAttribute("aria-label","갤러리 검색");
 const compare=button("선택한 화면 함께 실행 (0/4)",()=>{
  comparisons.forEach(f=>f());comparisons=[];board.replaceChildren();
  for(const entry of selection.values()){const tile=el("section","comparison-tile");tile.setAttribute("aria-label",`${entry.title} 비교 미리보기`);board.append(tile);comparisons.push(mountPreview(tile,entry.doc(),ctx,services,entry.part));}
  board.classList.toggle("four-up",selection.size>2);
  board.hidden=false;list.hidden=true;back.hidden=false;compare.disabled=true;
 });
 const back=button("갤러리로 돌아가기",()=>{comparisons.forEach(f=>f());comparisons=[];board.replaceChildren();board.hidden=true;list.hidden=false;back.hidden=true;compare.disabled=!selection.size;});back.hidden=true;compare.disabled=true;board.hidden=true;
 const update=()=>{compare.textContent=`선택한 화면 함께 실행 (${selection.size}/4)`;compare.disabled=!selection.size;};
 const scopePicker=select([{value:"templates",label:`템플릿 ${TEMPLATES.length}개`},{value:"parts",label:`변환 레이아웃 ${services.catalog.entries.filter(p=>!p.readonly).length}개`}],scope,v=>{scope=v;selection.clear();groupPicker.hidden=scope!=="templates";update();render();});scopePicker.setAttribute("aria-label","갤러리 종류");
 const groupPicker=select([{value:"all",label:"전체 화면"},...[...new Set(TEMPLATES.map(t=>t.group))].map(g=>({value:g,label:g}))],group,v=>{group=v;render();});groupPicker.setAttribute("aria-label","템플릿 화면 종류");
 controls.append(scopePicker,groupPicker,search,compare,back,status);dialog.append(header,controls,el("p","hint","여러 이미지를 한 번에 확인하고, 최대 4개 화면을 동시에 실행합니다. 클릭한 화면이 키보드·패드 입력을 받습니다."),board,list);document.body.append(dialog);dialog.showModal();
 function render(){thumbnails.clear();list.replaceChildren();const q=search.value.toLowerCase();
  const entries:Entry[]=scope==="templates"?TEMPLATES.map(t=>({id:t.id,title:t.name,group:t.group,detail:t.mode,doc:()=>makeTemplate(t.id,services.catalog)})):services.catalog.entries.filter(p=>!p.readonly).map(p=>({id:p.id,title:p.layout,group:p.category,doc:()=>partDocument(p),part:p}));
  const filtered=entries.filter(e=>(scope!=="templates"||group==="all"||e.group===group)&&`${e.title} ${e.id}`.toLowerCase().includes(q));status.textContent=`${filtered.length}개 표시`;
  for(const entry of filtered){const card=el("article","gallery-card"),image=el("img","gallery-thumbnail"),label=el("label","gallery-selection"),pick=el("input");pick.type="checkbox";pick.checked=selection.has(entry.id);pick.setAttribute("aria-label",`${entry.title} 비교 선택`);
   pick.onchange=()=>{if(pick.checked){if(selection.size>=4){pick.checked=false;ctx.notify("최대 4개 화면을 함께 실행할 수 있습니다.");return;}selection.set(entry.id,entry);}else selection.delete(entry.id);update();};
   image.alt=`${entry.title} 미리보기 준비 중`;label.append(pick,el("strong","",entry.title));const actions=el("div","row");
   actions.append(button("단독 실행",()=>{selection.clear();selection.set(entry.id,entry);update();compare.click();}));
   if(scope==="templates")actions.append(button("편집 화면으로 열기",()=>{openTemplate(entry.id);close();}));
   else actions.append(button("부품 추가",()=>{const n=entry.doc().entities[0];ctx.store.execute("부품 추가",d=>d.entities.push(n));ctx.store.select(n.id);}));
   card.append(image,label,el("small","",`${entry.group} · ${entry.detail??"원본 레이아웃"}`),actions);list.append(card);thumbnails.observe(image,`${scope}:${entry.id}`,entry.doc());
  }
 }
 search.oninput=render;dialog.addEventListener("cancel",e=>{e.preventDefault();close();});render();return close;
}
