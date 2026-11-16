const patterns = {
  windows: /^seal-office-setup-.*\.exe$/i,
  macos: /^seal-office-.*-macos\.dmg$/i,
  linux: /^seal-office-.*-amd64\.deb$/i,
  android: /^seal-office-.*-android\.apk$/i,
  harmony: /^seal-office-.*-harmony\.hap$/i,
}

// 官网直接使用服务器已上架并经过校验的安装包，避免依赖境外发布站点。
export const SERVER_DOWNLOADS = Object.freeze({
  windows: 'https://seal.xingmasoft.com/api/v1/release-assets/7be1d5a2-e79b-4590-bf9a-97c1c2add4ca/seal-office-setup-2.7.6.exe',
  macos: 'https://seal.xingmasoft.com/api/v1/release-assets/a16bd326-b64e-4ba0-8492-2e62810f21fa/seal-office-2.7.6-macos.dmg',
  linux: 'https://seal.xingmasoft.com/api/v1/release-assets/f58c1c23-7af9-44d1-9792-c1409096b911/seal-office-2.7.6-amd64.deb',
  android: 'https://seal.xingmasoft.com/api/v1/release-assets/ebb45e7a-01a8-4e50-a0c5-bde235abab21/seal-office-2.7.6-android.apk',
  harmony: 'https://seal.xingmasoft.com/api/v1/release-assets/0b35dc76-5892-41fa-8830-1dbd0897dba4/seal-office-2.7.6-harmony.hap',
})

export const SERVER_VERSION = '2.7.6'

export function selectDownloads(release) {
  const downloads = {}
  const assets = Array.isArray(release?.assets) ? release.assets : []
  for (const [platform, pattern] of Object.entries(patterns)) {
    const asset = assets.find(item => pattern.test(item.name) && typeof item.browser_download_url === 'string' && item.browser_download_url.startsWith('https://github.com/fangzhouxiaohai/seal-office/releases/download/'))
    if (asset) downloads[platform] = asset.browser_download_url
  }
  return downloads
}

export function detectPlatform(agent) {
  if (/android/i.test(agent)) return 'android'
  if (/harmonyos/i.test(agent)) return 'harmony'
  if (/windows/i.test(agent)) return 'windows'
  if (/macintosh|mac os/i.test(agent) && !/iphone|ipad/i.test(agent)) return 'macos'
  if (/linux/i.test(agent)) return 'linux'
  return null
}
