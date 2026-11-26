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
  const compare = (left, right) => {
    const a = left.split('.').map(Number), b = right.split('.').map(Number)
    for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index]
    return 0
  }

  it('静态首页为每个包显示相应版本和服务器下载地址', async () => {
    const version = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
    const { document } = new JSDOM(html).window
    const links = Array.from(document.querySelectorAll('#downloads [data-platform]'))
    assert.deepEqual(links.map(link => link.dataset.platform), ['windows', 'macos-arm64', 'macos-intel', 'linux', 'android', 'harmony'])
    assert.match(document.querySelector('.hero-badge').textContent, new RegExp('最新版 v' + version.replaceAll('.', '\\.')))
    const serverAssets = {
      windows: `seal-office-setup-${version}.exe`,
      linux: `seal-office-${version}-amd64.deb`,
      android: `seal-office-${version}-android.apk`,
      harmony: `seal-office-${version}-harmony.hap`,
    }
    for (const link of links) {
      const platform = link.dataset.platform
      const url = new URL(link.href)
      if (platform === 'macos-arm64' || platform === 'macos-intel') {
        assert.equal(url.href, `https://github.com/fangzhouxiaohai/seal-office/releases/download/v${version}/seal-office-${version}-${platform}.dmg`)
        assert.ok(link.textContent.includes(`v${version}`))
        assert.ok(link.textContent.includes(platform === 'macos-arm64' ? 'Apple 芯片' : 'Intel 芯片'))
        continue
      }
      assert.equal(url.origin, 'https://seal.xingmasoft.com')
      assert.match(url.pathname, /^\/api\/v1\/release-assets\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\//)
      const name = url.pathname.split('/').pop()
      const assetVersion = name.match(/^seal-office-(?:setup-)?(\d+\.\d+\.\d+)/)?.[1]
      assert.ok(assetVersion, `${platform} 下载地址缺少版本号`)
      assert.ok(link.textContent.includes(`v${assetVersion}`), `${platform} 文案版本与下载地址不一致`)
      assert.ok(compare(assetVersion, version) <= 0, `${platform} 下载版本不得高于当前版本`)
      assert.equal(name, serverAssets[platform])
      assert.equal(assetVersion, version)
    }
  })

  it('下载区直接显示平台列表', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
    const { document } = new JSDOM(html).window
    assert.ok(document.querySelector('#downloads').firstElementChild.matches('.platform-list'))
  })
})
