import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'
import { selectDownloads, detectPlatform } from '../src/downloads.mjs'

const release = {
  tag_name: 'v3.0.0',
  assets: [
    'seal-office-setup-3.0.0.exe',
    'seal-office-3.0.0-macos.dmg',
    'seal-office-3.0.0-macos-arm64.dmg',
    'seal-office-3.0.0-amd64.deb',
    'seal-office-3.0.0-android.apk',
    'seal-office-3.0.0-harmony.hap',
    'SHA256SUMS.txt',
  ].map(name => ({ name, browser_download_url: `https://github.com/fangzhouxiaohai/seal-office/releases/download/v3.0.0/${name}` })),
}

describe('最新版下载', () => {
  it('从最新发布的附件匹配各端安装包', () => {
    const downloads = selectDownloads(release)
    assert.deepEqual(Object.keys(downloads), ['windows', 'macos', 'macos-arm64', 'linux', 'android', 'harmony'])
    assert.match(downloads['macos-arm64'], /-macos-arm64\.dmg$/)
    assert.match(downloads.macos, /-macos\.dmg$/)
    assert.match(downloads.windows, /setup-3\.0\.0\.exe$/)
    assert.match(downloads.harmony, /harmony\.hap$/)
  })

  it('忽略未知来源和缺失的附件', () => {
    const downloads = selectDownloads({ assets: [{ name: 'seal-office-setup-3.0.0.exe', browser_download_url: 'https://example.com/file.exe' }] })
    assert.deepEqual(downloads, {})
  })

  it('识别常见设备且不把安卓误判为 Linux', () => {
    assert.equal(detectPlatform('Mozilla Android Linux'), 'android')
    assert.equal(detectPlatform('Mozilla Android HarmonyOS'), 'harmony')
    assert.equal(detectPlatform('Mozilla OpenHarmony'), 'harmony')
    assert.equal(detectPlatform('Mozilla Windows NT'), 'windows')
    assert.equal(detectPlatform('Mozilla Macintosh'), 'macos')
    assert.equal(detectPlatform('Mozilla Linux'), 'linux')
    assert.equal(detectPlatform('unknown'), null)
  })
})


describe('分平台下载入口', () => {
  it('静态首页为每个包显示相应版本和来源', async () => {
    const version = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version
    const escaped = version.replace(/\./g, '\\.')
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
    const { document } = new JSDOM(html).window
    const links = Array.from(document.querySelectorAll('#downloads [data-platform]'))
    assert.deepEqual(links.map(link => link.dataset.platform), ['windows', 'macos-arm64', 'macos-intel', 'linux', 'android', 'harmony'])
    for (const link of links) {
      if (link.dataset.platform === 'macos-arm64') {
        assert.equal(link.href, `https://github.com/fangzhouxiaohai/seal-office/releases/download/v${version}/seal-office-${version}-macos-arm64.dmg`)
        assert.match(link.textContent, new RegExp(`Apple 芯片.*ARM64.*v${escaped}`))
      } else if (link.dataset.platform === 'macos-intel') {
        // Intel 版暂未随本版更新，仍指向已发布的 2.7.6。
        assert.equal(link.href, 'https://seal.xingmasoft.com/api/v1/release-assets/a16bd326-b64e-4ba0-8492-2e62810f21fa/seal-office-2.7.6-macos.dmg')
        assert.match(link.textContent, /Intel.*v2\.7\.6/)
      } else {
        assert.match(link.href, new RegExp(`^https://seal\\.xingmasoft\\.com/api/v1/release-assets/[^/]+/seal-office-.*${escaped}`))
        assert.match(link.textContent, new RegExp(`v${escaped}`))
      }
    }
    const intel = document.querySelector('[data-platform="macos-intel"]')
    assert.match(intel.textContent, /Intel/)
  })
})
