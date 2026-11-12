const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const read = name => fs.readFileSync(path.join(root, name), 'utf8')

test('匿名分享地址由独立下载页处理，不回落到管理后台', () => {
  const html = read('share/index.html')
  const config = read('server/deploy/nginx-admin-assets.conf')
  const deploy = read('scripts/deploy-server.cjs')
  assert.match(html, /id="download"[^>]*>下载文件/)
  assert.doesNotMatch(html, /登录管理后台|管理员工作台/)
  assert.match(html, /<script src="\.\/app\.js\?v=2"/)
  assert.doesNotMatch(html, /<script>/)
  assert.ok(fs.existsSync(path.join(root, 'share/app.js')))
  assert.match(config, /location \^~ \/share\//)
  assert.match(config, /\/share\//)
  for (const configFile of ['server/deploy/nginx-admin-assets.conf', 'server/deploy/nginx-https.conf']) {
    const source = read(configFile)
    for (const route of [/location = \/share\/\s*\{([^}]*)\}/, /location \^~ \/share\/\s*\{([^}]*)\}/]) {
      const match = source.match(route)
      assert.ok(match, `${configFile} 缺少下载页路由`)
      assert.match(match[1], /Cache-Control[^\n]*no-store/)
      assert.match(match[1], /Referrer-Policy[^\n]*no-referrer/)
      assert.match(match[1], /Content-Security-Policy[^\n]*script-src 'self'/)
    }
  }
  assert.match(deploy, /share\/index\.html/)
  assert.match(deploy, /share\/app\.js/)
})

test('服务端部署必须实际解压并核对新接口文件，不能被行尾注释跳过', () => {
  const deploy = read('scripts/deploy-server.cjs')
  assert.doesNotMatch(deploy, /cp -a current\/\.[^\n]*#/)
  assert.match(deploy, /test -f .*myShares\.cjs/)
  assert.match(deploy, /sha256sum .*index\.cjs/)
})
