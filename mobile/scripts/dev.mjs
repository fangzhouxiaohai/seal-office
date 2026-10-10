import { createServer } from '../../node_modules/vite/dist/node/index.js'
import { fileURLToPath } from 'node:url'
import { buildCore } from './core-build.mjs'
await buildCore()
const server = await createServer({ configFile: fileURLToPath(new URL('../web.vite.config.mjs', import.meta.url)) })
await server.listen(); server.printUrls()
