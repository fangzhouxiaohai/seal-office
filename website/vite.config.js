import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: '.',
  base: '/website-assets/',
  build: { outDir: '../website-dist', emptyOutDir: true },
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
})
