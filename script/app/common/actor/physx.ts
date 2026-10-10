import wasmUrl from '@game/lib/physx/physx.wasm';
import { createPhysx, type Physx } from '@game/lib/physx';

let module: Promise<WebAssembly.Module> | null = null;
export async function createActorPhysx(): Promise<Physx> {
  module ??= (async () => {
    const response = await fetch(new URL(wasmUrl, import.meta.url));
    if (!response.ok) throw new Error(`Actor PhysX load failed: ${response.status}`);
    return WebAssembly.compile(await response.arrayBuffer());
  })().catch(error => { module = null; throw error; });
  return createPhysx(await module);
}
