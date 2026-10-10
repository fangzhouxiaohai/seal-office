import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from '../../node_modules/vite/dist/node/index.js'
import { buildCore } from './core-build.mjs'
import { build as bundle } from 'esbuild'
const directory = fileURLToPath(new URL('..', import.meta.url))
export async function buildPlatform(platform = 'android') {
  if (!['android', 'ios', 'harmony', 'web'].includes(platform)) throw new Error('不支持的构建平台：' + platform)
  process.env.SEAL_PLATFORM = platform
  const desktop = JSON.parse(await fs.readFile(path.join(directory, '../package.json'), 'utf8'))
  const manifestFile = path.join(directory, 'manifest.json'), manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
  const [major, minor, patch] = desktop.version.split('.').map(Number)
  manifest.versionName = desktop.version; manifest.versionCode = String(major * 10000 + minor * 100 + patch)
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
  await buildCore()
  const output = platform === 'web' ? path.join(directory, 'unpackage/web') : path.join(directory, 'static/office')
  await build({ configFile: path.join(directory, 'web.vite.config.mjs'), build: { outDir: output } })
  if (platform !== 'web') {
    // Android/iOS 的 file:// 页面使用普通脚本，避免本地 ES module 的跨域限制。
    const htmlFile = path.join(output, 'index.html'), html = await fs.readFile(htmlFile, 'utf8')
    const entry = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/)
    if (!entry) throw new Error('未找到本地办公页面的脚本入口')
    await bundle({ entryPoints: [path.resolve(output, entry[1])], outfile: path.join(output, 'office.js'), bundle: true, format: 'iife', platform: 'browser', external: ['fs', 'https'], define: { 'import.meta.url': 'document.baseURI' }, target: ['chrome100', 'safari15'], minify: true, logLevel: 'warning' })
    await fs.writeFile(htmlFile, html.replace(entry[0], '<script defer src="./office.js"></script>').replace(/<link rel="modulepreload"[^>]*>/g, ''))
    // IIFE 已包含 Vite 的 JS 分块，只保留 CSS 和其它资源，避免在 APK 内重复携带。
    const assets = path.join(output, 'assets')
    for (const item of await fs.readdir(assets, { withFileTypes: true })) {
      if (item.isFile() && /\.(?:m?js|map)$/.test(item.name)) await fs.unlink(path.join(assets, item.name))
    }
    await fs.writeFile(path.join(output, '.gitkeep'), '')
  }
  await fs.writeFile(path.join(output, 'build-info.json'), JSON.stringify({ platform, desktopVersion: desktop.version, builtAt: new Date().toISOString(), architecture: 'uni-app-x-local-webview', defaultPackagePlatform: 'android' }, null, 2) + '\n')
  console.log(platform === 'web' ? `Web 构建完成：${output}（移动 H5 / PC 自适应）` : `${platform} 本地编辑器资源已准备：${output}；此步骤尚未生成 APK / IPA / HAP。`)
  return output
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildPlatform(process.argv[2] || 'android')
