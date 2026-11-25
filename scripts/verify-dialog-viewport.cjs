#!/usr/bin/env node
// 弹窗可视区域自动校验（2.8.0 工作流四）：在多种窗口尺寸与缩放下打开代表性弹窗，
// 断言弹窗四边在视口内、标题与关闭按钮可见、底部按钮可见、页面无横向滚动。
// 用法：node scripts/verify-dialog-viewport.cjs [--report 输出.json]
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
const 场景 = ['long', 'wide', 'preview', 'top', 'many', 'confirm', 'drawer']

async function 测量(page) {
  return page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight
    const 盒 = document.querySelector('.ant-modal-content, .ant-drawer-content-wrapper')
    if (!盒) return { 错误: '未找到弹窗' }
    const r = 盒.getBoundingClientRect()
    const 可见 = sel => { const e = 盒.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return b.top >= -1 && b.bottom <= vh + 1 && b.left >= -1 && b.right <= vw + 1 }
    return {
      四边在内: r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1,
      标题可见: 可见('.ant-modal-title, .ant-modal-confirm-title, .ant-drawer-title'),
      关闭可见: 可见('.ant-modal-close, .ant-drawer-close'),
      底部可见: 可见('.ant-modal-footer .ant-btn:last-child, .ant-modal-confirm-btns .ant-btn:last-child'),
      无横向滚动: document.documentElement.scrollWidth <= vw + 1,
      矩形: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
    }
  })
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
    for (const 视口 of 尺寸) for (const 名称 of 场景) {
      const page = await 浏览器.newPage({ viewport: { width: 视口.width, height: 视口.height } })
      await page.goto(`http://127.0.0.1:${端口}/?case=${名称}`)
      await page.waitForSelector('.ant-modal-content, .ant-drawer-content-wrapper', { timeout: 15000 })
      await page.waitForTimeout(400)
      const 值 = await 测量(page)
      const 通过 = !值.错误 && 值.四边在内 && 值.标题可见 !== false && 值.关闭可见 !== false && 值.底部可见 !== false && 值.无横向滚动
      结果.push({ 尺寸: 视口.名称, 场景: 名称, 通过, ...值 })
      await page.close()
    }
  } finally { await 浏览器?.close(); 服务.kill() }
  const 失败 = 结果.filter(x => !x.通过)
  for (const x of 结果) console.log(`${x.通过 ? '通过' : '失败'}  ${x.尺寸.padEnd(14)} ${x.场景.padEnd(8)} ${JSON.stringify(x.矩形 || x.错误)}`)
  if (报告路径) fs.writeFileSync(报告路径, JSON.stringify({ 时间: new Date().toISOString(), 总数: 结果.length, 失败: 失败.length, 结果 }, null, 2))
  console.log(`共 ${结果.length} 项，失败 ${失败.length} 项`)
  process.exitCode = 失败.length ? 1 : 0
}
main().catch(e => { console.error(e); process.exitCode = 1 })
