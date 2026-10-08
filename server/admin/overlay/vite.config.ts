import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import {NaiveUiResolver} from 'unplugin-vue-components/resolvers'
export default defineConfig({base:'/',plugins:[vue(),Components({resolvers:[NaiveUiResolver()]})],build:{outDir:'../../dist',emptyOutDir:true,sourcemap:false},server:{host:'127.0.0.1',port:9527,proxy:{'/api':{target:'http://127.0.0.1:8096',rewrite:p=>p.replace(/^\/api/,'')}}}})
