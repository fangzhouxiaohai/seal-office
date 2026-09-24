// 主进程测试配置：主进程代码位于 renderer 之外，且依赖 Node 能力，
// 与渲染进程的 jsdom 配置无法共用，故单独一份配置。
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // 主进程源码是 CommonJS，无法 import vitest 的具名导出，
    // 因此启用全局 describe/it/expect
    globals: true,
    include: ['main/**/*.test.js'],
    // 生成与解析 Office 文件涉及压缩包读写，放宽超时
    testTimeout: 30000,
  },
})
