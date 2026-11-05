const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目 = path.resolve(__dirname, '..')
const 皮肤 = require('../main/skins/builtinSkins.json')
const 临时目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-skin-controls-'))
app.setPath('userData', 临时目录)
app.disableHardwareAcceleration()
app.on('quit', () => {
  if (path.dirname(临时目录) !== path.resolve(os.tmpdir()) || !path.basename(临时目录).startsWith('seal-skin-controls-')) return
  try { fs.rmSync(临时目录, { recursive: true, force: true }) } catch {}
})

function 颜色(十六进制) {
  const 值 = 十六进制.replace('#', '')
  return `rgb(${parseInt(值.slice(0, 2), 16)}, ${parseInt(值.slice(2, 4), 16)}, ${parseInt(值.slice(4, 6), 16)})`
}

app.whenReady().then(async () => {
  const 窗口 = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  try {
    const 页面 = '<!doctype html><html><body><div class="wps-ribbon-tabs" role="tablist"><button class="wps-ribbon-tab wps-ribbon-tab--active" role="tab" aria-selected="true">开始</button><button class="wps-ribbon-tab" role="tab" aria-selected="false">插入</button></div><div class="assistant-composer"><textarea class="assistant-composer__input ant-input" aria-label="发送给智能助手的消息"></textarea></div></body></html>'
    await 窗口.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(页面)}`)
    for (const 文件 of ['renderer/src/styles.css', 'renderer/src/styles/flatDesktop.css', 'renderer/src/assistant/assistant.css']) {
      const 样式内容 = fs.readFileSync(path.join(项目, 文件), 'utf8')
      await 窗口.webContents.executeJavaScript(`(() => { const style = document.createElement('style'); style.textContent = ${JSON.stringify(样式内容)}; document.head.append(style) })()`)
    }
    await 窗口.webContents.executeJavaScript("(() => { const style = document.createElement('style'); style.textContent = '* { transition: none !important; }'; document.head.append(style) })()")
    for (const 样式 of [皮肤[0].light, 皮肤[2].light, 皮肤[2].dark]) {
      const 深色 = 样式 === 皮肤[2].dark
      const 结果 = await 窗口.webContents.executeJavaScript(`(async () => {
        const root = document.documentElement;
        root.setAttribute('data-theme', ${JSON.stringify(深色 ? 'dark' : 'light')});
        for (const [key, value] of Object.entries(${JSON.stringify({ '--brand': 样式.brand, '--brand-hover': 样式.brandHover, '--brand-soft': 样式.brandSoft, '--border': 样式.border, '--bg-card': 样式.card, '--text-1': 样式.text, '--text-2': 样式.text2, '--bg-subtle': 样式.hover })})) root.style.setProperty(key, value);
        const tab = document.querySelector('.wps-ribbon-tab--active');
        const composer = document.querySelector('.assistant-composer');
        const input = composer.querySelector('textarea');
        input.disabled = false;
        input.blur();
        await new Promise(resolve => setTimeout(resolve, 60));
        const normal = getComputedStyle(composer).borderColor;
        input.focus();
        await new Promise(resolve => setTimeout(resolve, 60));
        const focused = getComputedStyle(composer).borderColor;
        const ring = getComputedStyle(composer).boxShadow;
        const selected = getComputedStyle(tab).backgroundColor;
        const selectedText = getComputedStyle(tab).color;
        input.disabled = true;
        await new Promise(resolve => setTimeout(resolve, 60));
        const disabled = getComputedStyle(composer).borderColor;
        return { normal, focused, ring, selected, selectedText, disabled };
      })()`)
      assert.equal(结果.selected, 颜色(深色 ? 样式.brandSoft : 样式.brand), '选中标签应跟随皮肤颜色')
      assert.equal(结果.focused, 颜色(样式.brand), '助手输入框聚焦边框应使用皮肤主色')
      assert.notEqual(结果.normal, 颜色(样式.border), '助手输入框普通边框应有皮肤色')
      assert.equal(结果.disabled, 颜色(样式.border), '禁用态边框应回到中性色')
      assert.notEqual(结果.ring, 'none', '聚焦状态应有可见焦点环')
      if (深色) assert.equal(结果.selectedText, 颜色(样式.text), '深色选中态文字应保持可读')
    }
    console.log('菜单选中态与助手输入框的浅色、深色及聚焦、禁用状态均随皮肤变化')
  } finally {
    窗口.destroy()
    app.quit()
  }
}).catch(错误 => { console.error(错误); app.exit(1) })
