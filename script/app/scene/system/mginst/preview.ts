export const MG_INST_PREVIEW_KEY = 'mginst:preview';

export class BorrowedPreviewSlot<T> {
  private closed = false;
  constructor(private readonly textures: Map<string, T>) {}
  set(texture: T | null): void {
    if (this.closed) return;
    if (texture === null) this.textures.delete(MG_INST_PREVIEW_KEY);
    else this.textures.set(MG_INST_PREVIEW_KEY, texture);
  }
  get connected(): boolean { return !this.closed && this.textures.has(MG_INST_PREVIEW_KEY); }
  dispose(): void { if (!this.closed) { this.set(null); this.closed = true; } }
}
