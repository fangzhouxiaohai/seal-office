import './styles.css'
import { SERVER_DOWNLOADS, SERVER_VERSION, detectPlatform } from './downloads.mjs'

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

const status = document.querySelector('.download-status')
const primary = document.querySelector('.download-primary')
const platformLinks = document.querySelectorAll('[data-platform]')
const labels = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: '安卓版', harmony: '鸿蒙版' }

platformLinks.forEach((link) => {
  const platform = link.dataset.platform
  const url = SERVER_DOWNLOADS[platform]
  if (!url) return
  link.href = url
  link.classList.add('is-available')
})

const platform = detectPlatform(navigator.userAgent)
if (platform && SERVER_DOWNLOADS[platform] && primary) {
  primary.href = SERVER_DOWNLOADS[platform]
  primary.textContent = `下载 ${labels[platform]}`
}
if (status) status.textContent = `最新版本 v${SERVER_VERSION}，安装包由海豹办公服务器提供`
