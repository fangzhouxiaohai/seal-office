const patterns = {
  windows: /^seal-office-setup-.*\.exe$/i,
  macos: /^seal-office-.*-macos\.dmg$/i,
  'macos-arm64': /^seal-office-.*-macos-arm64\.dmg$/i,
  'macos-intel': /^seal-office-.*-macos-intel\.dmg$/i,
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
  if (/harmonyos|openharmony/i.test(agent)) return 'harmony'
  if (/android/i.test(agent)) return 'android'
  if (/windows/i.test(agent)) return 'windows'
  if (/macintosh|mac os/i.test(agent) && !/iphone|ipad/i.test(agent)) return 'macos'
  if (/linux/i.test(agent)) return 'linux'
  return null
}
