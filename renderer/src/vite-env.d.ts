/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare module '*?seal-image' { const source: string; export default source }
/** 构建平台：desktop / web / android / harmony / ios，用于在移动原生包中剔除大体积组件 */
declare const __SEAL_PLATFORM__: string
