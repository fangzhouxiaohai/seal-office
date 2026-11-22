import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // 管理后台部署在站点 /admin/ 路径下
  base: '/admin/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist'
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      // 联调后端为线上现役服务；本机 8096 仅在服务器本地监听，不可直达
      '/api': {
        target: 'https://seal.xingmasoft.com',
        changeOrigin: true,
        secure: true
      }
    }
  }
})
