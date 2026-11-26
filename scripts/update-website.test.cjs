const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { validateWebsite, macDownloads, makeActivationScript } = require('./update-website.cjs')

describe('官网更新发布', () => {
  it('macOS 两个入口必须使用当前版本的自有服务器附件', () => {
    const base = 'https://seal.xingmasoft.com/api/v1/release-assets'
    const arm = base + '/10000000-0000-4000-8000-000000000001/seal-office-2.8.0-macos-arm64.dmg'
    const intel = base + '/10000000-0000-4000-8000-000000000002/seal-office-2.8.0-macos-intel.dmg'
    const html = `<a data-platform="macos-arm64" href="${arm}"></a><a data-platform="macos-intel" href="${intel}"></a>`
    assert.deepEqual(macDownloads(html, '2.8.0'), [arm, intel])
    assert.throws(() => macDownloads(html.replace(arm, arm.replace('seal.xingmasoft.com', 'github.com')), '2.8.0'), /自有服务器/)
    assert.throws(() => macDownloads(html, '2.8.1'), /当前版本/)
    assert.throws(() => macDownloads(html.replace(intel, arm), '2.8.0'), /Intel|intel/)
  })

  it('验证首页和对应的脚本、样式文件', () => {
    const files = new Map([
      ['index.html', Buffer.from('<title>海豹办公｜让每一份工作都清晰落地</title><script src="/website-assets/assets/site.js"></script><link href="/website-assets/assets/site.css">')],
      ['assets/site.js', Buffer.from('脚本')],
      ['assets/site.css', Buffer.from('样式')],
    ])
    assert.deepEqual(validateWebsite(files).map(item => item.path), ['assets/site.js', 'assets/site.css'])
    files.delete('assets/site.css')
    assert.throws(() => validateWebsite(files), /资源缺失/)
  })

  it('切换前保存旧版本并在健康检查失败时恢复', () => {
    const script = makeActivationScript('20260101000000-abcd1234', ['assets/site.js', 'assets/site.css'])
    assert.match(script, /readlink/)
    assert.match(script, /trap rollback ERR/)
    assert.match(script, /mv -Tf/)
    assert.match(script, /curl/)
    assert.match(script, /sha256sum/)
    assert.match(script, /cp -an/)
    assert.doesNotMatch(script, /nginx -s|systemctl|mv admin|cp .* admin/)
    assert.match(script, /\/admin\//)
  })
})
