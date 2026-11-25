import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ root: new URL('.', import.meta.url).pathname, plugins: [react()], server: { fs: { allow: ['../..'] } }, logLevel: 'error' })
