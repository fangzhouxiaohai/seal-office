import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const root = new URL('../', import.meta.url)

describe('移动导航', () => {
  it('点击菜单后展开，选择链接后关闭', async () => {
    const html = await readFile(new URL('index.html', root), 'utf8')
    const script = (await readFile(new URL('src/main.js', root), 'utf8')).split('\nconst status')[0].replace(/^import .*$/gm, '')
    const dom = new JSDOM(html, { url: 'https://seal.xingmasoft.com/', runScripts: 'outside-only' })
    dom.window.eval(script)
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
