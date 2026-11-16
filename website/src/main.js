import './styles.css'

const toggle = document.querySelector('.menu-toggle')
const navigation = document.querySelector('#navigation')

if (toggle && navigation) {
  const setMenu = (expanded) => {
    toggle.setAttribute('aria-expanded', String(expanded))
    navigation.classList.toggle('is-open', expanded)
  }
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'))
  navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)))
  window.addEventListener('resize', () => { if (window.innerWidth > 760) setMenu(false) })
}

import { selectDownloads, detectPlatform } from './downloads.mjs'

const status = document.querySelector('.download-status')
const primary = document.querySelector('.download-primary')
const platformLinks = document.querySelectorAll('[data-platform]')

fetch('https://api.github.com/repos/fangzhouxiaohai/seal-office/releases/latest')
  .then(response => {
    if (!response.ok) throw new Error('无法获取版本信息')
    return response.json()
  })
  .then(release => {
    const downloads = selectDownloads(release)
    let available = 0
    platformLinks.forEach(link => {
      const url = downloads[link.dataset.platform]
      if (url) {
        link.href = url
        link.classList.add('is-available')
        available += 1
      } else {
        link.querySelector('small').textContent = '前往发布页查看'
      }
    })
    const platform = detectPlatform(navigator.userAgent)
    if (platform && downloads[platform]) {
      const labels = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: '安卓版', harmony: '鸿蒙版' }
      primary.href = downloads[platform]
      primary.textContent = `下载 ${labels[platform]}`
    }
    status.textContent = available ? `最新发布 ${release.tag_name || ''}，选择适合设备的版本` : '暂无可识别的安装包，请前往发布页查看'
  })
  .catch(() => {
    status.textContent = '暂时无法获取最新版本，请通过下方链接前往发布页下载'
    platformLinks.forEach(link => { link.querySelector('small').textContent = '前往发布页查看' })
  })
