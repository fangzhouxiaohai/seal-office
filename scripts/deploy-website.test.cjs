const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { validateReleaseFiles, checkPublicResponses } = require('./deploy-website.cjs')

const hash = value => createHash('sha256').update(value).digest('hex')
test('发布前核验官网和后台入口及资源', () => {
  const assets = new Map([
    ['website/index.html', '<title>海豹办公｜让每一份工作都清晰落地</title><script src="/website-assets/assets/site.js"></script>'],
    ['website/assets/site.js', '网站代码'],
    ['admin/index.html', '<title>海豹办公管理后台</title><script src="/admin-assets/assets/admin.js"></script>'],
    ['admin/assets/admin.js', '后台代码'],
  ])
  assert.doesNotThrow(() => validateReleaseFiles(assets))
  assets.delete('admin/assets/admin.js')
  assert.throws(() => validateReleaseFiles(assets), /后台.*资源/)
})
test('线上验收核查页面、资源与既有服务', async () => {
  const bodies = new Map([
    ['/', '<title>海豹办公｜让每一份工作都清晰落地</title>'],
    ['/admin/', '<title>海豹办公管理后台</title>'],
    ['/website-assets/assets/site.js', '网站代码'],
    ['/admin-assets/assets/admin.js', '后台代码'],
    ['/office/', '<title>海豹办公</title>'],
    ['/share/', '<title>文件下载 - 海豹办公</title>'],
    ['/api/v1/capabilities', '{"version":1}'],
  ])
  const fetcher = async (url) => {
    const body = bodies.get(new URL(url).pathname)
    return { status: body === undefined ? 404 : 200, text: async () => body || '' }
  }
  const options = { baseUrl: 'https://example.test', siteAsset: '/website-assets/assets/site.js', adminAsset: '/admin-assets/assets/admin.js', siteHash: hash('网站代码'), adminHash: hash('后台代码') }
  await assert.doesNotReject(() => checkPublicResponses(options, fetcher))
  bodies.set('/admin-assets/assets/admin.js', '错误内容')
  await assert.rejects(() => checkPublicResponses(options, fetcher), /后台资源/)
})
