import { defineConfig } from '../node_modules/vite/dist/node/index.js'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { 共享校验模块 } from '../scripts/shared-validation-plugin.mjs'
import { inlineMarketImages } from '../scripts/inline-image-plugin.mjs'
const directory = fileURLToPath(new URL('.', import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(directory, '../package.json'), 'utf8'))
const localPdfWorker = {
  name: 'seal-local-pdf-worker', enforce: 'pre',
  transform(source, id) {
    if (id.replaceAll('\\', '/').endsWith('/renderer/src/pdf/pdfLoader.ts')) return source
      .replace("import workerUrl from './pdfWorker.ts?worker&url'", `import LocalPdfWorker from '${path.join(directory, 'web/pdfWorker.ts').replaceAll('\\', '/')}?worker&inline'`)
      .replace('pdfjs.GlobalWorkerOptions.workerSrc = workerUrl', 'if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new LocalPdfWorker()')
  }
}
export default defineConfig({
  root: path.join(directory, 'web'), base: './', publicDir: path.join(directory, 'web/public'),
  plugins: [localPdfWorker, 共享校验模块(), inlineMarketImages(), react()],
  esbuild: { charset: 'ascii' },
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __SEAL_PLATFORM__: JSON.stringify(process.env.SEAL_PLATFORM || 'web') },
  worker: { format: 'iife', rollupOptions: { output: { inlineDynamicImports: true } } },
  server: { host: '127.0.0.1', port: 5180, strictPort: true, fs: { allow: [path.dirname(directory)] }, proxy: { '/api': { target: 'https://seal.xingmasoft.com', changeOrigin: true } } },
  build: { target: ['chrome100', 'safari15'], outDir: path.join(directory, 'static/office'), emptyOutDir: true,
    commonjsOptions: { include: [/node_modules/, /main[\\/]office[\\/]/] } }
})
