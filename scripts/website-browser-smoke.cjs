const { app, BrowserWindow, session } = require('electron')
const assert = require('node:assert/strict')

async function waitFor(window, expression) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const value = await window.webContents.executeJavaScript(expression)
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('页面状态等待超时：' + expression)
}

app.whenReady().then(async () => {
  const browser = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { session: session.fromPartition('website-smoke-' + Date.now()) } })
  try {
    await browser.loadURL('https://seal.xingmasoft.com/')
    await waitFor(browser, '!!document.querySelector(".menu-toggle")')
    const homepage = await browser.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('.menu-toggle')
      const navigation = document.querySelector('#navigation')
      button.click()
      const opened = button.getAttribute('aria-expanded') === 'true' && navigation.classList.contains('is-open')
      navigation.querySelector('a[href="#features"]').click()
      return { title: document.title, opened, closed: button.getAttribute('aria-expanded') === 'false', image: document.querySelector('.hero-screen img').naturalWidth > 0, overflow: document.documentElement.scrollWidth > innerWidth }
    })()`)
    assert.match(homepage.title, /海豹办公｜/)
    assert.equal(homepage.opened, true)
    assert.equal(homepage.closed, true)
    assert.equal(homepage.image, true)
    assert.equal(homepage.overflow, false)
    console.log('官网移动端页面、图片和导航通过')
    await browser.loadURL('https://seal.xingmasoft.com/admin/')
    await waitFor(browser, 'location.pathname === "/admin/login" && !!document.querySelector("input")')
    const login = await browser.webContents.executeJavaScript('({ path: location.pathname, title: document.title, text: document.body.innerText })')
    assert.equal(login.path, '/admin/login')
    assert.match(login.text, /登录/)
    console.log('后台登录页与路由跳转通过')
    await browser.loadURL('https://seal.xingmasoft.com/login')
    await waitFor(browser, 'location.pathname === "/admin/login" && !!document.querySelector("input")')
    await browser.loadURL('https://seal.xingmasoft.com/seal/overview')
    await waitFor(browser, 'location.pathname === "/admin/login" && !!document.querySelector("input")')
    console.log('历史登录和菜单地址跳转通过')
  } finally { browser.destroy() }
}).then(() => app.quit()).catch(error => { console.error('浏览器检查失败：' + error.message); app.exit(1) })
