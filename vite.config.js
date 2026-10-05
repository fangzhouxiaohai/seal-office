// vite.config.js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import pkg from './package.json'
import { 共享校验模块 } from './scripts/shared-validation-plugin.mjs'

export default defineConfig({
  // 渲染进程源码位于 renderer 目录，因此将 root 指向该目录
  root: 'renderer',
  // 调用方配置开发缓存后，共享模块预构建与测试缓存也使用同一磁盘。
  cacheDir: process.env.npm_config_cache ? `${process.env.npm_config_cache}/../vite/seal-office` : undefined,
  // 使用相对路径，保证 Electron 以 file:// 加载构建产物时静态资源可正确解析
  base: './',
  plugins: [共享校验模块(), react()],
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
    commonjsOptions: { include: [/node_modules/, /main[\\/]office[\\/]imageData\.js$/, /main[\\/]office[\\/]pptx[\\/]chartData\.js$/] },
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
    // 富编辑器与真实 Office 往返测试占用较多内存，限制并发以避免资源争用超时。
    minThreads: 1,
    maxThreads: 2,
    // 表格编辑器会渲染 2600 个单元格，jsdom 下构造成本远高于浏览器，
    // 放宽超时以避免全量并行运行时的偶发失败
    testTimeout: 20000,
  },
})
