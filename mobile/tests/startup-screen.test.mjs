import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { JSDOM } from 'jsdom'

test('移动工作台加载占位页居中展示海豹标识，不显示加载话术', async () => {
  const html = await fs.readFile(new URL('../web/index.html', import.meta.url), 'utf8')
  assert.doesNotMatch(html, /正在打开海豹办公/)
  assert.match(html, /<img[^>]+src="\.\/icons\/startup-logo\.png"[^>]+alt="海豹办公"/)
  assert.match(html, /<strong>海豹办公<\/strong>/)
  assert.match(html, /class="startup-screen"/)
  assert.match(html, /align-items:\s*center/)
  assert.match(html, /justify-content:\s*center/)
})

test('安卓原生宿主只使用系统启动画面，网页入口不再叠加第二张标识', async () => {
  const html = await fs.readFile(new URL('../web/index.html', import.meta.url), 'utf8')
  const compatibility = await fs.readFile(new URL('../web/public/compatibility.js', import.meta.url), 'utf8')
  assert.doesNotMatch(html, /<script>[^<]*SealHost[^<]*<\/script>/)
  assert.match(compatibility, /window\.SealHost[\s\S]*sealAndroidHost/)
  const detection = compatibility.match(/if \(window\.SealHost\)[^\n]+/)[0]
  const native = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/office/index.html?native=1',
    runScripts: 'dangerously',
    beforeParse(window) { window.SealHost = { postMessage() {} } },
  })
  native.window.eval(detection)
  assert.equal(native.window.document.documentElement.dataset.sealAndroidHost, '1')
  assert.equal(native.window.getComputedStyle(native.window.document.querySelector('.startup-screen')).display, 'none')
  native.window.close()
  const web = new JSDOM(html, { url: 'https://seal.xingmasoft.com/office/', runScripts: 'dangerously' })
  web.window.eval(detection)
  assert.notEqual(web.window.getComputedStyle(web.window.document.querySelector('.startup-screen')).display, 'none')
  web.window.close()
})
