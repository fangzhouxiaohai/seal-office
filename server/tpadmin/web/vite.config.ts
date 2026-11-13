/**
 * Vite 配置:开发代理 /adminapi → 后端 8000 端口,构建产物可部署到 server/public/admin/。
 * TDesign 组件按需引入:模板里用到哪个 <t-xxx> 才打包哪个,不再整库注册。
 * Author: qiufeng
 */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { TDesignResolver } from 'unplugin-vue-components/resolvers';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: '/admin-assets/',
  plugins: [
    vue(),
    Components({
      resolvers: [TDesignResolver({ library: 'vue-next' })],
      // 组件类型声明,IDE 与 vue-tsc 用
      dts: 'src/types/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/adminapi': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
