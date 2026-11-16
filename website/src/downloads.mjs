const patterns = {
  windows: /^seal-office-setup-.*\.exe$/i,
  macos: /^seal-office-.*-macos\.dmg$/i,
  linux: /^seal-office-.*-amd64\.deb$/i,
  android: /^seal-office-.*-android\.apk$/i,
  harmony: /^seal-office-.*-harmony\.hap$/i,
}

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
