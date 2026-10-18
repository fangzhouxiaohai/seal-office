// Independent production bundle: never writes dist/ or mobile/unpackage/.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { inlineMarketImages } from './inline-image-plugin.mjs'
import { 共享校验模块 } from './shared-validation-plugin.mjs'
export default defineConfig({ root: 'test/template-browser', base: './', worker: { format: 'es' }, define: { __APP_VERSION__: JSON.stringify('2.0.0') }, plugins: [共享校验模块(), inlineMarketImages(), react()], build: { target: 'chrome114', outDir: '../../.upgrade-private/template-expansion-verification/dist', emptyOutDir: true, commonjsOptions: { include: [/node_modules/, /main[\\/]office[\\/]imageData\.js$/, /main[\\/]office[\\/]pptx[\\/]chartData\.js$/, /main[\\/]office[\\/]pptx[\\/]formulaSyntax\.js$/] } } })
