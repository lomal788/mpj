import { MgmView } from "@app/common/ui/view";
let characterSpec:Promise<{textures:Record<string,string>}>|null=null;
/** Reuse the web spec merger/loader. Resolve each source's original relative texture paths. */
export async function createNativeHost(canvas:HTMLCanvasElement,parts:string[]){
 const source=await (characterSpec??=fetch("/api/library/charselect").then(r=>r.json()));
 const charTextures=new Set(Object.values(source.textures));
 return MgmView.create({canvas,parts:["../charselect/spec.json",...parts],assets:{url:p=>new URL(p,new URL(charTextures.has(p)?"/assets/charselect/":"/assets/mgmcommon/",location.origin)).pathname}});
}
