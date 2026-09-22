// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 渲染进程源码位于 renderer 目录，因此将 root 指向该目录
  root: 'renderer',
  // 使用相对路径，保证 Electron 以 file:// 加载构建产物时静态资源可正确解析
  base: './',
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5172,
    strictPort: true,
    hmr: true,
  },
  build: {
    // 构建产物输出到项目根目录的 dist
    outDir: '../dist',
    emptyOutDir: true,
  },
})
