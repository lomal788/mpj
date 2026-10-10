import { blankDocument, type EditorDocument } from "../../../editor/document";
import { partEntity, type Catalog, type Binding } from "../schema";
export function templateDocument(id:string,title:string) {
 const d=blankDocument();d.id=id;d.title=title;d.tool="ui-builder";d.settings={screen:[1920,1080],datasets:{},input:{wrap:true,repeatWrap:false,players:1,repeatDelay:24,repeatInterval:6}};return d;
}
export function addPart(d:EditorDocument,catalog:Catalog,name:string,x=0,y=0) {
 const part=catalog.entries.find(p=>p.layout===name && !p.readonly);if(!part)throw Error(`템플릿 부품 없음: ${name}`);
 const entity=partEntity(part);entity.transform.x=x;entity.transform.y=y;entity.props.interactive=false;d.entities.push(entity);return entity;
}
export const text=(pane:string,value:string):Binding=>({pane,kind:"text",value});
export const visible=(pane:string,value:boolean):Binding=>({pane,kind:"visible",value:String(value)});
