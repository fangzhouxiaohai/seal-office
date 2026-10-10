// vite.config.js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import pkg from './package.json'
import { 共享校验模块 } from './scripts/shared-validation-plugin.mjs'
import { inlineMarketImages } from './scripts/inline-image-plugin.mjs'

export default defineConfig({
  // 渲染进程源码位于 renderer 目录，因此将 root 指向该目录
  root: 'renderer',
  // 调用方配置开发缓存后，共享模块预构建与测试缓存也使用同一磁盘。
  cacheDir: process.env.npm_config_cache ? `${process.env.npm_config_cache}/../vite/seal-office` : undefined,
  // 使用相对路径，保证 Electron 以 file:// 加载构建产物时静态资源可正确解析
  base: './',
  plugins: [共享校验模块(), inlineMarketImages(), react()],
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
    // 图片签名、图表与公式语法校验由浏览器和主进程共用同一批纯函数模块。
    commonjsOptions: { include: [/node_modules/, /main[\\/]office[\\/]imageData\.js$/, /main[\\/]office[\\/]pptx[\\/]chartData\.js$/, /main[\\/]office[\\/]pptx[\\/]formulaSyntax\.js$/] },
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
    // 保留线程模式的文件隔离，单个工作线程避免富编辑器争用资源。
    // 不使用 threads=false：它会让多个文件共享同一个 jsdom 环境。
    minThreads: 1,
    maxThreads: 1,
    // 表格编辑器会渲染 2600 个单元格，jsdom 下构造成本远高于浏览器，
    // 慢速测试机允许更长执行时间；所有功能断言仍必须成立。
    testTimeout: 60000,
  },
})
