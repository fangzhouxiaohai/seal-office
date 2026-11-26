import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { detectPlatform } from '../src/downloads.mjs'

const root = new URL('../', import.meta.url)

async function openHomepage(agent) {
  const html = await readFile(new URL('index.html', root), 'utf8')
  const script = (await readFile(new URL('src/main.js', root), 'utf8')).replace(/^import .*$/gm, '')
  const dom = new JSDOM(html, { url: 'https://seal.xingmasoft.com/', runScripts: 'outside-only' })
  Object.defineProperty(dom.window.navigator, 'userAgent', { value: agent })
  dom.window.detectPlatform = detectPlatform
  dom.window.autoStarfields = () => {}
  dom.window.eval(script)
  return dom
}

describe('移动导航', () => {
  it('点击菜单后展开，选择链接后关闭', async () => {
    const dom = await openHomepage('Mozilla Android')
    const toggle = dom.window.document.querySelector('.menu-toggle')
    const navigation = dom.window.document.querySelector('#navigation')
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    toggle.click()
    assert.equal(toggle.getAttribute('aria-expanded'), 'true')
    assert.equal(navigation.classList.contains('is-open'), true)
    navigation.querySelector('a[href="#features"]').click()
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.equal(navigation.classList.contains('is-open'), false)
    dom.window.close()
  })
})

describe('主下载按钮', () => {
  it('Mac 浏览器进入两种芯片版本的下载列表', async () => {
    const dom = await openHomepage('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    const { document } = dom.window
    const primary = document.querySelector('.download-primary')
    assert.equal(primary.hash, '#downloads')
    assert.match(primary.textContent, /选择 macOS 芯片版本/)
    assert.ok(document.querySelector('[data-platform="macos-arm64"]'))
    assert.ok(document.querySelector('[data-platform="macos-intel"]'))
    dom.window.close()
  })

  it('识别出平台时直接指向该平台标有版本的安装包', async () => {
    const version = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version
    const escaped = version.replace(/\./g, '\\.')
    const dom = await openHomepage('Mozilla/5.0 Android HarmonyOS')
    const { document } = dom.window
    const primary = document.querySelector('.download-primary')
    assert.equal(primary.href, document.querySelector('[data-platform="harmony"]').href)
    assert.match(primary.textContent, new RegExp(`鸿蒙.*v${escaped}`))
    dom.window.close()
  })
})
