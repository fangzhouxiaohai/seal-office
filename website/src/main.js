import './styles.css'
import { detectPlatform } from './downloads.mjs'
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

const primary = document.querySelector('.download-primary')
const platform = detectPlatform(navigator.userAgent)
const link = document.querySelector(`[data-platform="${platform}"]`)
if (primary && link) {
  primary.href = link.href
  primary.textContent = `下载 ${link.textContent.trim()}`
} else if (primary && platform === 'macos') {
  // macOS 浏览器可能在 Apple 芯片上也报告 Intel。
  primary.textContent = '选择 macOS 芯片版本'
}

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
