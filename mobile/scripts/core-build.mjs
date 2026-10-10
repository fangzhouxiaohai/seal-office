import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
const directory = fileURLToPath(new URL('..', import.meta.url)), root = path.dirname(directory)

export async function buildCore() {
  await fs.mkdir(path.join(directory, 'web/generated'), { recursive: true })
  await build({
    entryPoints: [path.join(directory, 'web/core.cjs')], outfile: path.join(directory, 'web/generated/core.mjs'),
    bundle: true, platform: 'browser', format: 'esm', target: ['chrome100', 'safari15'], minify: true,
    inject: [path.join(directory, 'web/shims/globals.js')],
    alias: {
      electron: path.join(directory, 'web/shims/electron.js'), fs: path.join(directory, 'web/shims/fs.js'),
      crypto: path.join(directory, 'web/shims/crypto.js'), path: path.join(directory, 'node_modules/path-browserify/index.js'),
      zlib: path.join(directory, 'web/shims/zlib.js'),
      os: path.join(directory, 'web/shims/unavailable.js'), http: path.join(directory, 'web/shims/unavailable.js'), https: path.join(directory, 'web/shims/unavailable.js')
    },
    plugins: [{ name: 'seal-browser-platform', setup(context) {
      context.onResolve({ filter: /(?:\.\.\/ppt\/export|\.\/export)$/ }, (args) => {
        if (args.importer.replaceAll('\\', '/').includes('/main/')) return { path: path.join(directory, 'web/presentationExport.cjs') }
      })
      context.onLoad({ filter: /[\\/]main[\\/]pdf[\\/]pdfTools\.js$/ }, async (args) => {
        let source = await fs.readFile(args.path, 'utf8')
        const start = source.indexOf('async function 字体('), end = source.indexOf('/** 页面坐标', start)
        if (start < 0 || end < 0) throw new Error('桌面 PDF 字体接口已变化，请更新跨端适配')
        source = source.slice(0, start) + `const { 字体 } = require(${JSON.stringify(path.join(directory, 'web/pdfFont.cjs'))})\n\n` + source.slice(end)
        return { contents: source, loader: 'js', resolveDir: path.dirname(args.path) }
      })
    } }],
    nodePaths: [path.join(directory, 'node_modules'), path.join(root, 'node_modules')],
    logLevel: 'warning'
  })
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildCore()
