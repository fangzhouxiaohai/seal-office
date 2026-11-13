/**
 * Vitest 配置:沿用 vite.config.ts 的别名与插件,单元测试放在 src/**\/*.test.ts。
 * Author: qiufeng
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts'],
    },
  }),
);
