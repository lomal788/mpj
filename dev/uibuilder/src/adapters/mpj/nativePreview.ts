import type { NativePreviewFactory } from "../../plugins/uibuilder/nativePreview";
import { nativeCharSelect } from "./nativeCharSelect";
import { nativeRoomList } from "./nativeRoomList";
import { nativeWindow } from "./nativeWindow";
import { nativeOnlinePanel } from "./nativeOnlinePanel";
const registry: Record<string,NativePreviewFactory>={"online-panel":nativeOnlinePanel,window:nativeWindow,charselect:nativeCharSelect,"room-list":nativeRoomList};
export const nativePreview: NativePreviewFactory = (doc,canvas,input,app)=> {
  const create=registry[String(doc.settings.nativePreview)];
  if(!create)throw Error(`미리보기 어댑터 없음: ${doc.settings.nativePreview}`);
  return create(doc,canvas,input,app);
};
