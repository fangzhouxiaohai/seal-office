#!/usr/bin/env node
// 弹窗可视区域自动校验（2.8.0 工作流四）：在多种窗口尺寸与缩放下打开代表性弹窗，
// 断言弹窗四边在视口内、标题与关闭按钮可见、底部按钮可见、页面无横向滚动。
// 2.8.1 增加系统栏占位模式：在手机视口上下放模拟状态栏与导航栏，断言弹窗不进入系统栏；
// --nohost 只放系统栏、不写宿主变量，用于复现 2.8.0 安卓宿主未让出系统栏时的失败。
// 用法：node scripts/verify-dialog-viewport.cjs [--nohost] [--report 输出.json]
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const 尺寸 = [
  { 名称: '1280×720', width: 1280, height: 720 },
  { 名称: '1024×600', width: 1024, height: 600 },
  { 名称: '1280×720@200%', width: 640, height: 360 },
  { 名称: '390×844', width: 390, height: 844 },
  { 名称: '320×568', width: 320, height: 568 },
]
const 场景 = ['long', 'wide', 'preview', 'top', 'many', 'confirm', 'drawer', 'account', 'account&expand=1']
// 系统栏占位（2.8.1）：按安卓 1080×2404、像素比 2.0 的现场换算为 540×1202，状态栏约 46.5、导航栏约 48，
// 另取常见手机尺寸。弹窗四边、标题、关闭按钮与底部按钮都不得进入两条系统栏。
const 系统栏尺寸 = [
  { 名称: '540×1202 系统栏', width: 540, height: 1202, 栏: [46.5, 48] },
  { 名称: '393×852 系统栏', width: 393, height: 852, 栏: [54, 34] },
  { 名称: '360×800 系统栏', width: 360, height: 800, 栏: [24, 48] },
  { 名称: '800×360 横屏', width: 800, height: 360, 栏: [24, 0] },
]
const 系统栏场景 = ['account', 'account&expand=1', 'long', 'confirm', 'many']
const 仅检查2_8_0 = process.argv.includes('--nohost')

async function 测量(page, 栏 = [0, 0]) {
  return page.evaluate(([栏顶, 栏底]) => {
    const vw = innerWidth, vh = innerHeight, 上界 = 栏顶, 下界 = vh - 栏底
    const 盒 = document.querySelector('.ant-modal-content, .ant-drawer-content-wrapper')
    if (!盒) return { 错误: '未找到弹窗' }
    const r = 盒.getBoundingClientRect()
    // 跳过零尺寸占位节点（确认框内保留空的 .ant-modal-title），只判定实际显示的元素
    const 可见 = sel => { const e = [...盒.querySelectorAll(sel)].find(x => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 }); if (!e) return null; const b = e.getBoundingClientRect(); return b.top >= 上界 - 1 && b.bottom <= 下界 + 1 && b.left >= -1 && b.right <= vw + 1 }
    const 正文 = 盒.querySelector('.ant-modal-body, .ant-drawer-body')
    const 正文样式 = 正文 ? getComputedStyle(正文).overflowY : ''
    return {
      四边在内: r.left >= -1 && r.top >= 上界 - 1 && r.right <= vw + 1 && r.bottom <= 下界 + 1,
      正文可滚动: !正文 || 正文.scrollHeight <= 正文.clientHeight + 1 || ['auto', 'scroll'].includes(正文样式) || [...正文.querySelectorAll('*')].some(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight),
      标题可见: 可见('.ant-modal-title, .ant-modal-confirm-title, .ant-drawer-title'),
      关闭可见: 可见('.ant-modal-close, .ant-drawer-close'),
      底部可见: 可见('.ant-modal-footer .ant-btn:last-child, .ant-modal-confirm-btns .ant-btn:last-child'),
      无横向滚动: document.documentElement.scrollWidth <= vw + 1,
      矩形: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
    }
  }, 栏)
}

async function main() {
  const 报告路径 = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null
  const 端口 = 4400 + Math.floor(Math.random() * 400)
  const 服务 = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'test/dialog-viewport/vite.config.mjs', '--port', String(端口), '--strictPort'], { cwd: root, stdio: 'ignore' })
  const 结果 = []
  let 浏览器
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${端口}/`)).ok) break } catch {} await new Promise(r => setTimeout(r, 500)) }
    浏览器 = await chromium.launch()
    const 任务 = [
      ...(仅检查2_8_0 ? [] : 尺寸.flatMap(视口 => 场景.map(名称 => ({ 视口, 名称, 栏: [0, 0], 查询: '' })))),
      ...系统栏尺寸.flatMap(视口 => 系统栏场景.map(名称 => ({ 视口, 名称, 栏: 视口.栏, 查询: `&bars=${视口.栏.join(',')}${仅检查2_8_0 ? '&nohost=1' : ''}` }))),
    ]
    for (const { 视口, 名称, 栏, 查询 } of 任务) {
      const page = await 浏览器.newPage({ viewport: { width: 视口.width, height: 视口.height } })
      await page.goto(`http://127.0.0.1:${端口}/?case=${名称}${查询}`)
      await page.waitForSelector('.ant-modal-content, .ant-drawer-content-wrapper', { timeout: 15000 })
      await page.waitForTimeout(名称.startsWith('account') ? 1500 : 400)
      // 等弹窗进入动画结束再测量，避免缩放过程中的矩形误判
      await page.waitForFunction(() => !document.getAnimations?.().some(动画 => 动画.playState === 'running'), null, { timeout: 5000 }).catch(() => {})
      const 值 = await 测量(page, 栏)
      const 通过 = !值.错误 && 值.四边在内 && 值.标题可见 !== false && 值.关闭可见 !== false && 值.底部可见 !== false && 值.无横向滚动 && 值.正文可滚动
      结果.push({ 尺寸: 视口.名称, 场景: 名称, 通过, ...值 })
      await page.close()
    }
  } finally { await 浏览器?.close(); 服务.kill() }
  const 失败 = 结果.filter(x => !x.通过)
  for (const x of 结果) console.log(`${x.通过 ? "通过" : "失败"}  ${x.尺寸.padEnd(16)} ${x.场景.padEnd(16)} ${JSON.stringify(x.矩形 || x.错误)}${x.通过 ? "" : "  " + Object.entries(x).filter(([k, v]) => v === false && k !== "通过").map(([k]) => k).join("、")}`)
  if (报告路径) fs.writeFileSync(报告路径, JSON.stringify({ 时间: new Date().toISOString(), 总数: 结果.length, 失败: 失败.length, 结果 }, null, 2))
  console.log(`共 ${结果.length} 项，失败 ${失败.length} 项`)
  process.exitCode = 失败.length ? 1 : 0
}
main().catch(e => { console.error(e); process.exitCode = 1 })
