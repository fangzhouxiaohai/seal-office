// 云空间拖动 Electron 实窗校验（2.8.1 第一、四节）。在项目使用的 Electron 中打开 test/cloud-drag 夹具，
// 用 webContents.sendInputEvent 发送真实鼠标事件拖动，测量中间容器 .wps-main 的可视与内容尺寸、卡片边界，
// 并核对松手后文件所在目录。
// 用法（Linux 无显示器时加 xvfb-run -a）：
//   electron scripts/verify-cloud-drag-electron.cjs [--report 输出.json]
const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const root = path.resolve(__dirname, '..')
const 报告路径 = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null
const 端口 = 5200 + Math.floor(Math.random() * 400)
const 等待 = 毫秒 => new Promise(完成 => setTimeout(完成, 毫秒))

async function 打开(窗口, 查询) {
  await 窗口.loadURL(`http://127.0.0.1:${端口}/?${查询}`)
  for (let i = 0; i < 100; i++) {
    if (await 窗口.webContents.executeJavaScript(`document.querySelectorAll('.seal-drive-file').length`) > 0) break
    await 等待(100)
  }
  await 等待(300)
}
const 计算 = (窗口, 代码) => 窗口.webContents.executeJavaScript(`(() => { ${代码} })()`)
// 中间容器 .wps-main；长目录时实际纵向滚动的是其中的云页面 .seal-cloud-page
const 尺寸 = (窗口, 选择器 = '.wps-main') => 计算(窗口, `const m = document.querySelector('${选择器}'); return { 可视: [m.clientWidth, m.clientHeight], 内容: [m.scrollWidth, m.scrollHeight], 滚动: [m.scrollLeft, m.scrollTop], 窗口滚动: [scrollX, scrollY], 页面内容: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] }`)
const 卡片 = 窗口 => 计算(窗口, `const c = document.querySelector('.seal-drive-drag-preview'); if (!c) return null; const r = c.getBoundingClientRect(); return { 左: Math.round(r.left), 上: Math.round(r.top), 右: Math.round(r.right), 下: Math.round(r.bottom), 宽: Math.round(r.width), 高: Math.round(r.height), 文字: c.textContent, 父级: c.parentElement === document.body ? 'body' : c.parentElement.className }`)
const 名称中心 = (窗口, 名称) => 计算(窗口, `const e = [...document.querySelectorAll('.seal-drive-file')].find(x => x.querySelector('.seal-drive-file-name')?.textContent === ${JSON.stringify(名称)}); if (!e) return null; e.scrollIntoView?.({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + Math.min(r.width / 2, 200)), y: Math.round(r.top + r.height / 2) }`)
const 元素中心 = (窗口, 选择器, 序号 = 0) => 计算(窗口, `const e = document.querySelectorAll(${JSON.stringify(选择器)})[${序号}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }`)
async function 按下(窗口, x, y) {
  窗口.focus(); 窗口.webContents.focus()
  鼠标(窗口, 'mouseMove', x, y, false); await 等待(30)
  鼠标(窗口, 'mouseDown', x, y); await 等待(30)
}
function 鼠标(窗口, type, x, y, 按下 = true) {
  窗口.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...(按下 && type === 'mouseMove' ? { modifiers: ['leftButtonDown'] } : {}) })
}
async function 移动到(窗口, 起, 终, 步数 = 12) {
  for (let i = 1; i <= 步数; i++) { 鼠标(窗口, 'mouseMove', Math.round(起.x + (终.x - 起.x) * i / 步数), Math.round(起.y + (终.y - 起.y) * i / 步数)); await 等待(16) }
  await 等待(80)
}
const 相同 = (甲, 乙, 容差 = 1) => Math.abs(甲[0] - 乙[0]) <= 容差 && Math.abs(甲[1] - 乙[1]) <= 容差

async function 截图原场景(窗口, 结果) {
  await 打开(窗口, 'items=6')
  const 起拖前 = await 尺寸(窗口)
  const 起点 = await 元素中心(窗口, '.seal-drive-file', 5)
  await 按下(窗口, 起点.x, 起点.y)
  await 移动到(窗口, 起点, { x: 1280, y: 475 })
  const 拖动中 = await 尺寸(窗口), 卡片一 = await 卡片(窗口)
  const 目标 = await 名称中心(窗口, '项目资料')
  await 移动到(窗口, { x: 1280, y: 475 }, 目标, 8)
  const 目标提示 = await 卡片(窗口), 高亮 = await 计算(窗口, `return [...document.querySelectorAll('.seal-drive-file')].find(x => x.querySelector('.seal-drive-file-name')?.textContent === '项目资料').className`)
  await 移动到(窗口, 目标, { x: 1900, y: 988 }, 10)
  const 右下 = await 卡片(窗口), 右下尺寸 = await 尺寸(窗口)
  await 移动到(窗口, { x: 1900, y: 988 }, 目标, 10)
  鼠标(窗口, 'mouseUp', 目标.x, 目标.y)
  await 等待(500)
  const 结束 = await 尺寸(窗口), 移动 = await 计算(窗口, `return window.__cloudDrag.移动记录`)
  const 期望左 = 1280 + 12, 期望上 = 475 + 12
  const 检查 = {
    卡片挂到窗口级浮层: 卡片一?.父级 === 'body',
    卡片距指针12像素: 卡片一 && Math.abs(卡片一.左 - 期望左) <= 1 && Math.abs(卡片一.上 - 期望上) <= 1,
    卡片单行未被挤窄: 卡片一 && 卡片一.宽 >= 150 && 卡片一.高 <= 60,
    拖动中容器内容不变: 相同(拖动中.内容, 起拖前.内容) && 相同(拖动中.可视, 起拖前.可视),
    右下角容器内容不变: 相同(右下尺寸.内容, 起拖前.内容),
    松手后容器内容不变: 相同(结束.内容, 起拖前.内容),
    无新增滚动条: 起拖前.内容[0] <= 起拖前.可视[0] + 1 && 右下尺寸.内容[0] <= 右下尺寸.可视[0] + 1 && 右下尺寸.内容[1] <= 右下尺寸.可视[1] + 1,
    目标高亮与提示: /is-drop-target/.test(高亮) && /移至『项目资料』/.test(目标提示?.文字 || ''),
    右下角卡片完整可见: 右下 && 右下.左 >= 8 && 右下.上 >= 8 && 右下.右 <= 1904 - 8 && 右下.下 <= 993 - 8,
    只提交一次且目标正确: 移动.length === 1 && 移动[0].parent === 'folder-0' && JSON.stringify(移动[0].ids) === '["doc-0"]',
  }
  结果.push({ 场景: '截图原场景 1904×993，六项，网格', 通过: Object.values(检查).every(Boolean), 检查, 起拖前, 拖动中, 右下尺寸, 结束, 卡片: { 指针1280_475: 卡片一, 目标: 目标提示, 右下: 右下 }, 移动 })
}

async function 取消场景(窗口, 结果) {
  await 打开(窗口, 'items=6')
  const 起点 = await 元素中心(窗口, '.seal-drive-file', 5), 目标 = await 名称中心(窗口, '合同归档')
  await 按下(窗口, 起点.x, 起点.y)
  await 移动到(窗口, 起点, 目标)
  窗口.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  窗口.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await 等待(100)
  const 卡片残留 = await 卡片(窗口)
  鼠标(窗口, 'mouseUp', 目标.x, 目标.y)
  await 等待(400)
  const 移动 = await 计算(窗口, `return window.__cloudDrag.移动记录`)
  const 检查 = { 按Esc撤去卡片: 卡片残留 === null, 指针停在有效文件夹上也不移动: 移动.length === 0 }
  结果.push({ 场景: 'Esc 取消', 通过: Object.values(检查).every(Boolean), 检查, 移动 })
}

async function 长目录场景(窗口, 结果) {
  await 打开(窗口, 'items=80&view=list')
  for (let i = 0; i < 50; i++) { if (await 计算(窗口, `return document.querySelectorAll('.seal-drive-file').length`) >= 80) break; await 等待(100) }
  const 页 = '.seal-cloud-page'
  // 先滚到底，再拖最后一项靠近文件区上沿，找回原先看不见的文件夹
  await 计算(窗口, `const m = document.querySelector('${页}'); m.scrollTop = m.scrollHeight; return m.scrollTop`)
  await 等待(300)
  const 起始 = await 尺寸(窗口, 页), 外层起始 = await 尺寸(窗口)
  const 末项 = await 计算(窗口, `const list = document.querySelectorAll('.seal-drive-file'); const r = list[list.length - 1].getBoundingClientRect(); return { x: Math.round(r.left + 200), y: Math.round(r.top + r.height / 2) }`)
  const 区域上沿 = await 计算(窗口, `const m = document.querySelector('${页}').getBoundingClientRect(); return Math.round(Math.max(m.top, 0))`)
  await 按下(窗口, 末项.x, 末项.y)
  const 边缘 = { x: 末项.x, y: 区域上沿 + 6 }
  await 移动到(窗口, 末项, 边缘)
  for (let i = 0; i < 400; i++) { if ((await 尺寸(窗口, 页)).滚动[1] === 0) break; await 等待(16) }
  const 到顶 = await 尺寸(窗口, 页), 外层到顶 = await 尺寸(窗口)
  // 离开边缘后停止滚动，再按当前位置投放到滚动后才出现的文件夹
  const 文件夹 = await 计算(窗口, `const e = [...document.querySelectorAll('.seal-drive-file')].find(x => x.querySelector('.seal-drive-file-name')?.textContent === '会议纪要'); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + 200), y: Math.round(r.top + r.height / 2) }`)
  await 移动到(窗口, 边缘, 文件夹, 8)
  const 停止前 = await 尺寸(窗口, 页); await 等待(300); const 停止后 = await 尺寸(窗口, 页)
  鼠标(窗口, 'mouseUp', 文件夹.x, 文件夹.y)
  await 等待(500)
  const 移动 = await 计算(窗口, `return window.__cloudDrag.移动记录`)
  const 检查 = {
    内容超出一屏: 起始.内容[1] > 起始.可视[1] + 100 && 起始.滚动[1] > 0,
    靠近上沿滚到顶部: 到顶.滚动[1] === 0,
    只改变文件区纵向滚动: 到顶.滚动[0] === 起始.滚动[0] && 到顶.内容[0] <= 到顶.可视[0] + 1 && 相同(外层到顶.滚动, 外层起始.滚动, 0) && 相同(到顶.窗口滚动, 起始.窗口滚动, 0),
    离开边缘即停: 停止前.滚动[1] === 停止后.滚动[1],
    投放到滚动后出现的文件夹: 移动.length === 1 && 移动[0].parent === 'folder-2' && 移动[0].ids.length === 1,
  }
  结果.push({ 场景: '超过一屏的目录 80 项，列表', 通过: Object.values(检查).every(Boolean), 检查, 起始, 到顶, 外层起始, 外层到顶, 移动 })
}

app.whenReady().then(async () => {
  const 服务 = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'test/cloud-drag/vite.config.mjs', '--port', String(端口), '--strictPort'], { cwd: root, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
  const 结果 = []
  let 退出码 = 1
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${端口}/`)).ok) break } catch {} await 等待(500) }
    const 窗口 = new BrowserWindow({ width: 1904, height: 993, useContentSize: true, show: true, webPreferences: { contextIsolation: true } })
    for (const 场景 of [截图原场景, 取消场景, 长目录场景]) {
      try { await 场景(窗口, 结果) } catch (错误) { 结果.push({ 场景: 场景.name, 通过: false, 错误: String(错误?.stack || 错误) }) }
    }
    for (const x of 结果) console.log(`${x.通过 ? '通过' : '失败'}  ${x.场景}  ${x.错误 || Object.entries(x.检查).filter(([, v]) => !v).map(([k]) => k).join('、')}`)
    if (结果[0]?.卡片) console.log('卡片（指针 1280,475）：', JSON.stringify(结果[0].卡片.指针1280_475), ' 容器起拖前/拖动中：', JSON.stringify(结果[0].起拖前.内容), JSON.stringify(结果[0].拖动中.内容))
    if (报告路径) fs.writeFileSync(报告路径, JSON.stringify({ 时间: new Date().toISOString(), electron: process.versions.electron, chrome: process.versions.chrome, 窗口: '1904×993', 结果 }, null, 2))
    const 失败 = 结果.filter(x => !x.通过).length
    console.log(`共 ${结果.length} 个场景，失败 ${失败} 个（Electron ${process.versions.electron}）`)
    退出码 = 失败 ? 1 : 0
  } finally { 服务.kill(); app.exit(退出码) }
})
