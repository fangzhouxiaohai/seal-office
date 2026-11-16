import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { selectDownloads, detectPlatform, SERVER_DOWNLOADS } from '../src/downloads.mjs'

const release = {
  tag_name: 'v3.0.0',
  assets: [
    'seal-office-setup-3.0.0.exe',
    'seal-office-3.0.0-macos.dmg',
    'seal-office-3.0.0-amd64.deb',
    'seal-office-3.0.0-android.apk',
    'seal-office-3.0.0-harmony.hap',
    'SHA256SUMS.txt',
  ].map(name => ({ name, browser_download_url: `https://github.com/fangzhouxiaohai/seal-office/releases/download/v3.0.0/${name}` })),
}

describe('最新版下载', () => {
  it('从最新发布的附件匹配各端安装包', () => {
    const downloads = selectDownloads(release)
    assert.deepEqual(Object.keys(downloads), ['windows', 'macos', 'linux', 'android', 'harmony'])
    assert.match(downloads.windows, /setup-3\.0\.0\.exe$/)
    assert.match(downloads.harmony, /harmony\.hap$/)
  })

  it('忽略未知来源和缺失的附件', () => {
    const downloads = selectDownloads({ assets: [{ name: 'seal-office-setup-3.0.0.exe', browser_download_url: 'https://example.com/file.exe' }] })
    assert.deepEqual(downloads, {})
  })

  it('识别常见设备且不把安卓误判为 Linux', () => {
    assert.equal(detectPlatform('Mozilla Android Linux'), 'android')
    assert.equal(detectPlatform('Mozilla Windows NT'), 'windows')
    assert.equal(detectPlatform('Mozilla Macintosh'), 'macos')
    assert.equal(detectPlatform('Mozilla Linux'), 'linux')
    assert.equal(detectPlatform('unknown'), null)
  })
})


describe('服务器安装包地址', () => {
  it('五端下载均指向海豹办公服务器并包含当前版本', () => {
    assert.deepEqual(Object.keys(SERVER_DOWNLOADS), ['windows', 'macos', 'linux', 'android', 'harmony'])
    for (const url of Object.values(SERVER_DOWNLOADS)) {
      assert.match(url, /^https:\/\/seal\.xingmasoft\.com\/api\/v1\/release-assets\//)
      assert.match(url, /2\.7\.6/)
    }
    assert.doesNotMatch(Object.values(SERVER_DOWNLOADS).join('\n'), /github\.com/i)
  })
})
