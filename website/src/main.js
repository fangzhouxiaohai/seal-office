import './styles.css'
import { SERVER_DOWNLOADS, SERVER_VERSION, detectPlatform } from './downloads.mjs'
import { autoStarfields } from './stars.mjs'

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

// 顶部首屏与底部页脚的星空动效
autoStarfields()

// 导航栏滚动状态：离开顶部后加深底色与描边
const header = document.querySelector('.header')
if (header) {
  const syncHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 12)
  syncHeader()
  window.addEventListener('scroll', syncHeader, { passive: true })
}

// 区块滚动显现：进入视口时添加可见类，仅触发一次
const revealItems = document.querySelectorAll('[data-reveal]')
if (revealItems.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    })
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' })
  revealItems.forEach((item) => observer.observe(item))
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'))
}
