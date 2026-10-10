import type { Entity } from "../../editor/document";
import type { LayoutInst } from "@app/scene/menu/charselect/scene2d";
import { props } from "../../plugins/uibuilder/schema";
import { readField } from "../../plugins/uibuilder/data";
export function applyBindings(inst: LayoutInst, entity: Entity, data: Record<string,unknown>) {
  for(const b of props(entity).bindings ?? []) {
    const value=b.field?readField(data,b.field):b.value;
    if(b.kind==="text") inst.setText(b.pane,String(value??""));
    if(b.kind==="image" && value) inst.setTexture(b.pane,b.slot??0,String(value));
    if(b.kind==="visible") inst.setVisible(b.pane,value!==false && value!=="false" && value!==0);
  }
}

export const partName = (entity:Entity) => String(entity.props.part ?? entity.name).split("/").at(-1)!;
