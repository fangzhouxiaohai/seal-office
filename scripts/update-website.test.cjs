const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { validateWebsite, makeActivationScript } = require('./update-website.cjs')

describe('官网更新发布', () => {
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
