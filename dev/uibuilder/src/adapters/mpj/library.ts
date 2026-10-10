import type { Catalog, PartEntry } from "../../plugins/uibuilder/schema";
export class MpjLibrary {
  catalog!: Catalog;
  async load() {
    const r = await fetch("/api/catalog");
    if (!r.ok) throw Error("부품 카탈로그를 읽지 못했습니다.");
    this.catalog = await r.json();
    return this.catalog;
  }
  entry(id: string): PartEntry {
    const part = this.catalog.entries.find((p) => p.id === id);
    if (!part) throw Error(`부품 없음: ${id}`);
    if (part.readonly) throw Error("트리형 HUD 자료는 아직 읽기 전용입니다.");
    return part;
  }
}
