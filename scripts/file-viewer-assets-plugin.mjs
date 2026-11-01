import path from 'node:path'

/** 云空间预览所用渲染器的运行资源（Worker / WASM / 字体），与 fileViewerEngine.tsx 中注册的渲染器对应。 */
export const 预览资源渲染器 = ['pdf', 'archive', 'office-word-openxml', 'office-presentation', 'office-presentation-binary', 'spreadsheet-openxml']

/** 构建完成后把 file-viewer 资源复制到产物目录的 file-viewer/，供 Electron file:// 与网页同域加载。 */
export function 预览资源复制() {
  let 输出目录 = ''
  return {
    name: 'seal-file-viewer-assets', apply: 'build',
    configResolved(config) { 输出目录 = path.resolve(config.root, config.build.outDir) },
    async closeBundle() {
      // 仅在构建结束时加载 ESM 复制工具，避免 Vite 以 CommonJS 方式读取配置时报错。
      const { copyFileViewerAssets } = await import('file-viewer-copy-assets')
      await copyFileViewerAssets({ targetDir: path.join(输出目录, 'file-viewer'), rendererIds: 预览资源渲染器, clean: false })
    },
  }
}
