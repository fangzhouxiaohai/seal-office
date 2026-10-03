// vite.config.js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  // 渲染进程源码位于 renderer 目录，因此将 root 指向该目录
  root: 'renderer',
  // 使用相对路径，保证 Electron 以 file:// 加载构建产物时静态资源可正确解析
  base: './',
  plugins: [react()],
  // PDF 阅读器的兼容工作线程需先补齐浏览器接口，再动态装载解析模块。
  worker: { format: 'es' },
  // 注入应用版本号，供设置页/关于页/页脚统一读取，避免多处硬编码不一致
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: 'localhost',
    port: 5172,
    strictPort: true,
    hmr: true,
  },
  build: {
    target: 'chrome114',
    // 图片签名与尺寸校验由浏览器和主进程共用同一个纯函数模块。
    commonjsOptions: { include: [/node_modules/, /main[\\/]office[\\/]imageData\.js$/] },
    // 构建产物输出到项目根目录的 dist
    outDir: '../dist',
    emptyOutDir: true,
  },
  // 测试配置：路径相对 root（renderer）解析
  test: {
    environment: 'jsdom',
    globals: false,
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // 表格编辑器会渲染 2600 个单元格，jsdom 下构造成本远高于浏览器，
    // 放宽超时以避免全量并行运行时的偶发失败
    testTimeout: 20000,
  },
})
