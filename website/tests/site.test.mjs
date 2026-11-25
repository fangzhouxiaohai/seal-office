import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const root = new URL('../', import.meta.url)
const file = async (path) => readFile(new URL(path, root), 'utf8')
const exists = async (path) => access(new URL(path, root))

const assertExists = async (path) => {
  await assert.doesNotReject(() => exists(path), `缺少官网文件：${path}`)
}

describe('海豹办公官网页面', () => {
  it('声明中文产品信息、搜索摘要与同一备案链接', async () => {
    const html = await file('index.html')
    assert.match(html, /<html lang="zh-CN">/)
    assert.match(html, /<title>海豹办公｜让每一份工作都清晰落地<\/title>/)
    assert.match(html, /海豹办公/)
    assert.match(html, /name="description"/)
    assert.match(html, /新ICP备2024014104号-7/)
    assert.match(html, /https:\/\/beian\.miit\.gov\.cn\//)
  })

  it('提供参考官网风格所需的导航、产品展示与行动入口', async () => {
    const html = await file('index.html')
    assert.match(html, /href="#features"/)
    assert.match(html, /href="#workflow"/)
    assert.match(html, /href="#downloads"/)
    assert.match(html, /href="\/office\/"/)
    assert.match(html, /href="\/admin\/"/)
    assert.match(html, /(?:seal\.xingmasoft\.com\/api\/v1\/release-assets|github\.com\/fangzhouxiaohai\/seal-office\/releases\/download)/)
    assert.match(html, /class="hero-ambient"/)
    assert.match(html, /id="features"/)
    assert.match(html, /id="workflow"/)
    assert.match(html, /id="downloads"/)
  })

  it('官网源文件使用独立构建配置，避免和桌面应用资源冲突', async () => {
    const config = await file('vite.config.js')
    assert.match(config, /root:\s*['"]\.['"]|root:\s*__dirname/)
    assert.match(config, /base:\s*['"]\/website-assets\/['"]|base:\s*['"]\/website-assets\/['"]\s*,/)
    assert.match(config, /outDir:\s*['"]\.\.\/website-dist['"]|outDir:\s*path\.resolve\([^)]*website-dist/)
    await assertExists('src/main.js')
    await assertExists('src/styles.css')
  })

  it('官网脚本包含可访问的交互状态，而不是静态占位页', async () => {
    const script = await file('src/main.js')
    const styles = await file('src/styles.css')
    assert.match(script, /addEventListener\(['"]click['"]|addEventListener\(['"]change['"]|querySelectorAll/)
    assert.match(script, /aria-expanded|aria-selected|aria-current/)
    assert.match(styles, /prefers-reduced-motion/)
    assert.match(styles, /@media\s*\([^)]*max-width/)
  })

  it('仅接管官网根路径并保留后台、办公应用、接口和分享路径', async () => {
    const nginx = await file('../seal-server/deploy/nginx-website.conf')
    assert.match(nginx, /location\s*=\s*\/\s*\{/)
    assert.match(nginx, /websitecurrent/)
    assert.match(nginx, /location\s+\^~\s+\/website-assets\//)
    assert.match(nginx, /location\s+\^~\s+\/admin\//)
    assert.match(nginx, /location\s*=\s*\/admin\s*\{[^}]*\/admin\//s)
    assert.doesNotMatch(nginx, /location\s+\/\s*\{/)
    assert.match(nginx, /\/office\//)
    assert.match(nginx, /\/api\//)
    assert.match(nginx, /\/share\//)
  })
})

describe('管理后台路由隔离', () => {
  it('后台路由以 /admin/ 为根，登录后不会跳转到官网', async () => {
    const router = await file('../seal-admin-web/src/router/index.ts')
    assert.match(router, /createWebHistory\(['"]\/admin\/['"]\)/)
  })
})

describe('管理后台登录跳转', () => {
  it('登录失效时在后台路径内跳转并保留相对路由', async () => {
    const session = await file('../seal-admin-web/src/utils/session.ts')
    assert.match(session, /location\.assign\(['"]\/admin\/login['"]\)/)
    assert.match(session, /pathname\.startsWith\(['"]\/admin\/login['"]\)/)
  })
})

describe('官网根路径配置', () => {
  it('将根路径定位到官网文件，避免目录索引拼接到文件名', async () => {
    const nginx = await file('../seal-server/deploy/nginx-website.conf')
    assert.match(nginx, /location\s*=\s*\/\s*\{[^}]*root\s+[^;]*websitecurrent\s*;[^}]*try_files\s+\/index\.html\s+=404\s*;/s)
  })
})

describe('后台生产构建路径', () => {
  it('静态资源以 /admin/ 为基础路径，与 nginx 后台规则一致', async () => {
    const vite = await file('../seal-admin-web/vite.config.ts')
    assert.match(vite, /base:\s*['"]\/admin\/['"]/)
  })
})
