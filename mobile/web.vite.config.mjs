import { defineConfig } from '../node_modules/vite/dist/node/index.js'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { 共享校验模块 } from '../scripts/shared-validation-plugin.mjs'
import { inlineMarketImages } from '../scripts/inline-image-plugin.mjs'
const directory = fileURLToPath(new URL('.', import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(directory, '../package.json'), 'utf8'))
export default defineConfig({
  root: path.join(directory, 'web'), base: './', publicDir: path.join(directory, 'web/public'),
  plugins: [共享校验模块(), inlineMarketImages({ mobileImages: path.join(directory, 'assets/template-images') }), react()],
  resolve: { alias: [{ find: './pdfWorkerFactory', replacement: path.join(directory, 'web/pdfWorkerFactory.ts') }] },
  esbuild: { charset: 'ascii' },
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __SEAL_PLATFORM__: JSON.stringify(process.env.SEAL_PLATFORM || 'web') },
  worker: { format: 'iife', rollupOptions: { output: { inlineDynamicImports: true } } },
  server: { host: '127.0.0.1', port: 5180, strictPort: true, fs: { allow: [path.dirname(directory)] }, proxy: { '/api': { target: 'https://seal.xingmasoft.com', changeOrigin: true } } },
  build: { target: ['chrome100', 'safari15'], outDir: path.join(directory, 'static/office'), emptyOutDir: true,
    commonjsOptions: { include: [/node_modules/, /main[\\/]office[\\/]/] } }
})
