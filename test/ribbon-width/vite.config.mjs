import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { 共享校验模块 } from '../../scripts/shared-validation-plugin.mjs'
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [共享校验模块(), react()],
  define: { __APP_VERSION__: JSON.stringify('ribbon-width'), __SEAL_PLATFORM__: JSON.stringify('desktop') },
  server: { fs: { allow: ['../..'] } },
  logLevel: 'error',
})
