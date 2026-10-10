// 用项目自带 Chromium 绘制图标，避免额外安装图像转换依赖。
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const 设计 = require('../renderer/src/components/fileIconDesign.json')
const 根目录 = path.resolve(__dirname, '..')
const 源目录 = path.join(__dirname, 'file-icons')
const 图标目录 = path.join(根目录, 'main', 'windows', 'file-icons')
const 尺寸列表 = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const 临时目录 = path.join(process.env.TEMP || 'E:\\Temp', 'seal-file-icons-' + process.pid)
app.setPath('userData', 临时目录)
app.setPath('sessionData', 临时目录)
app.disableHardwareAcceleration()

function 生成SVG(类型) {
  const 装饰 = 类型.decoration === 'cells'
    ? [33,44].flatMap(y => [35,45].map(x => `<rect x="${x}" y="${y}" width="8" height="8" rx="1.5"/>`)).join('')
    : [34,41,48,55].map((y,i) => `<rect x="${i === 3 ? 20 : 42}" y="${y}" width="${i === 3 ? 31 : 9}" height="3" rx="1.5"/>`).join('')
  const 标识 = 类型.symbol ? `<path d="${类型.symbol}" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="${类型.glyph}" fill="#FFFFFF" fill-rule="evenodd"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${设计.viewBox}"><path d="${设计.paper}" fill="${设计.paperColor}" stroke="${设计.outlineColor}" stroke-width="${设计.strokeWidth}"/><path d="${设计.fold}" fill="none" stroke="${设计.outlineColor}" stroke-width="${设计.strokeWidth}"/><g fill="${类型.color}" opacity="0.12">${装饰}</g><rect x="12" y="23" width="26" height="32" rx="4" fill="${类型.color}" opacity="0.65"/><rect x="6" y="23" width="26" height="32" rx="4" fill="${类型.color}"/><path d="M6 47H32V51A4 4 0 0 1 28 55H10A4 4 0 0 1 6 51Z" fill="#000000" opacity="0.08"/>${标识}</svg>`
}
function 生成ICO(帧) {
  const 头部 = Buffer.alloc(6 + 帧.length * 16)
  头部.writeUInt16LE(1, 2)
  头部.writeUInt16LE(帧.length, 4)
  let 偏移 = 头部.length
  帧.forEach(({ 尺寸, 数据 }, 序号) => {
    const 开始 = 6 + 序号 * 16
    头部[开始] = 头部[开始 + 1] = 尺寸 === 256 ? 0 : 尺寸
    头部.writeUInt16LE(1, 开始 + 4)
    头部.writeUInt16LE(32, 开始 + 6)
    头部.writeUInt32LE(数据.length, 开始 + 8)
    头部.writeUInt32LE(偏移, 开始 + 12)
    偏移 += 数据.length
  })
  return Buffer.concat([头部, ...帧.map(项 => 项.数据)])
}
app.whenReady().then(async () => {
  fs.mkdirSync(源目录, { recursive: true })
  fs.mkdirSync(图标目录, { recursive: true })
  const 窗口 = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true } })
  await 窗口.loadURL('data:text/html;charset=utf-8,<html><body></body></html>')
  for (const [名称, 类型] of Object.entries(设计.types)) {
    const svg = 生成SVG(类型)
    fs.writeFileSync(path.join(源目录, 名称 + '.svg'), svg + '\n')
    const 帧 = []
    for (const 尺寸 of [...尺寸列表, 512]) {
      const 编码 = await 窗口.webContents.executeJavaScript(`new Promise((完成,拒绝)=>{
        const 图=new Image();图.onload=()=>{const 画布=document.createElement('canvas');画布.width=画布.height=${尺寸};画布.getContext('2d').drawImage(图,0,0,${尺寸},${尺寸});完成(画布.toDataURL('image/png').split(',')[1])};
        图.onerror=()=>拒绝(new Error('文件图标绘制失败'));图.src=${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))};
      })`)
      const 数据 = Buffer.from(编码, 'base64')
      if (数据.readUInt32BE(0) !== 0x89504e47) throw new Error('图标绘制未返回 PNG')
      if (尺寸 === 512) fs.writeFileSync(path.join(源目录, 名称 + '.png'), 数据)
      else 帧.push({ 尺寸, 数据 })
    }
    fs.writeFileSync(path.join(图标目录, 名称 + '.ico'), 生成ICO(帧))
    console.log(`已生成 ${名称} 文件图标，${帧.length} 个尺寸`)
  }
  // 文档中的设计预览明确展示真实图标，覆盖浅深背景与常用尺寸。
  const 名称映射 = { word: '文字文档', table: '电子表格', ppt: '演示文稿', pdf: 'PDF 文档' }
  const 扩展映射 = { word: 'DOC / DOCX', table: 'XLS / XLSX', ppt: 'PPT / PPTX', pdf: 'PDF' }
  const 栏目 = Object.entries(设计.types).map(([名称, 类型]) => `<section><div class="large">${生成SVG(类型)}</div><h2>${名称映射[名称]}</h2><p>${扩展映射[名称]}</p><div class="sizes">${[16, 24, 32, 48].map(尺寸 => `<div>${生成SVG(类型).replace('<svg ', `<svg width="${尺寸}" height="${尺寸}" `)}<span>${尺寸}</span></div>`).join('')}</div><div class="dark">${[16, 32, 64].map(尺寸 => 生成SVG(类型).replace('<svg ', `<svg width="${尺寸}" height="${尺寸}" `)).join('')}</div></section>`).join('')
  const html = `<html lang="zh-CN"><meta charset="utf-8"><style>
    :root{--space:24px;--paper:#fff;--text:#1a1d24;--secondary:#5c6472;--line:#e8ebf0;--dark:#20242c}
    *{box-sizing:border-box}body{margin:0;padding:40px;font-family:'Microsoft YaHei';background:var(--paper);color:var(--text)}
    h1{font-size:24px;margin:0 0 8px;font-weight:600}header p{margin:0 0 32px;color:var(--secondary);font-size:14px}
    main{display:flex;gap:var(--space)}section{flex:1;min-width:0;border-top:1px solid var(--line);padding-top:var(--space)}
    .large{width:112px;height:112px}h2{font-size:18px;margin:16px 0 8px;font-weight:600}p{font-size:13px;color:var(--secondary);margin:0 0 24px}
    .sizes{height:84px;display:flex;gap:24px;align-items:flex-end}.sizes div{display:flex;flex-direction:column;align-items:center;gap:8px}.sizes span{font-size:12px;color:var(--secondary)}
    .dark{margin-top:24px;padding:16px;display:flex;align-items:center;gap:24px;background:var(--dark);border-radius:4px}
    footer{font-size:12px;color:var(--secondary);margin-top:24px}
    </style><header><h1>海豹办公 · 文件类型图标</h1><p>折角纸张、彩色字母块与内容纹理</p></header><main>${栏目}</main><footer>参考风格图标预览 · 下方为深色背景 · 同类旧式与现代格式共用类别图标</footer></html>`
  窗口.setContentSize(1100, 640)
  await 窗口.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await 窗口.webContents.executeJavaScript('document.fonts.ready.then(()=>true)')
  const 截图目录 = path.join(根目录, 'docs', 'screenshots', 'v' + require('../package.json').version)
  fs.mkdirSync(截图目录, { recursive: true })
  const 预览 = await new Promise((完成, 拒绝) => {
    const 接收 = (_事件, _区域, 图像) => {
      const 像素 = 图像.toBitmap()
      let 内容像素 = 0
      for (let 位置 = 0; 位置 < 像素.length; 位置 += 4) {
        if (像素[位置] < 240 || 像素[位置 + 1] < 240 || 像素[位置 + 2] < 240) 内容像素++
      }
      if (内容像素 < 1000) return
      clearTimeout(超时); 窗口.webContents.removeListener('paint', 接收); 完成(图像)
    }
    const 超时 = setTimeout(() => { 窗口.webContents.removeListener('paint', 接收); 拒绝(new Error('图标预览绘制超时')) }, 10000)
    窗口.webContents.on('paint', 接收)
    窗口.webContents.invalidate()
  })
  if (预览.isEmpty()) throw new Error('图标预览生成失败')
  fs.writeFileSync(path.join(截图目录, 'file-type-icons.png'), 预览.toPNG())
  窗口.destroy()
  app.quit()
}).catch(错误 => { console.error(错误); app.exit(1) })
