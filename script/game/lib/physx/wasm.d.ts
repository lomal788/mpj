/** physx.wasm import = 번들러(esbuild file 로더)가 내준 상대 URL(가져온 모듈 기준, new URL(url, import.meta.url) 로 푼다) */
declare module '*.wasm' {
  const url: string;
  export default url;
}
