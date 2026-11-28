#!/usr/bin/env node
// 功能区单行校验（2.8.1 第九节）：用真实 RibbonPanel 与全局样式，在 1920、1440、1280、960、800 宽度下
// 断言表格“开始”标签的字号输入框宽度不小于 44、字体颜色文字只有 1 行、按钮高度不超过 56，
// 宽度不足时功能区出现横向滚动而不是压缩换行；同时回归文字与演示功能区没有按钮文字折行。
// 用法：node scripts/verify-ribbon-width.cjs [--report 输出.json]
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const 宽度 = [1920, 1440, 1280, 960, 800]
const 用例 = [
  { 名称: '表格·开始·中文', 查询: 'tabs=sheet', 宽度, 检查字号: true },
  { 名称: '表格·开始·英文', 查询: 'tabs=sheet&lang=en-US', 宽度, 检查字号: true },
  ...['insert', 'layout', 'formula', 'data', 'review', 'view'].map(tab => ({ 名称: `表格·${tab}`, 查询: `tabs=sheet&tab=${tab}`, 宽度: [1920, 1280] })),
  { 名称: '文字·开始', 查询: 'tabs=doc', 宽度: [1920, 1280] },
  { 名称: '演示·开始', 查询: 'tabs=ppt', 宽度: [1920, 1280] },
]

async function 测量(page) {
  return page.evaluate(() => {
    const 面板 = document.querySelector('.wps-ribbon-panel')
    if (!面板) return { 错误: '未找到功能区' }
    const 行数 = 元素 => {
      // 以单行行高估算行数：只统计按钮内直接的文字内容
      const 范围 = document.createRange()
      let 行 = 0, 上一行 = null
      for (const 节点 of Array.from(元素.childNodes)) {
        if (节点.nodeType !== Node.TEXT_NODE || !节点.textContent.trim()) continue
        范围.selectNodeContents(节点)
        for (const 矩形 of Array.from(范围.getClientRects())) {
          if (上一行 === null || Math.abs(矩形.top - 上一行) > 2) { 行++; 上一行 = 矩形.top }
        }
      }
      return 行
    }
    const 文字行数 = 元素 => {
      const 范围 = document.createRange()
      范围.selectNodeContents(元素)
      const 顶 = new Set()
      for (const 矩形 of Array.from(范围.getClientRects())) if (矩形.width > 0 && 矩形.height > 0) 顶.add(Math.round(矩形.top))
      return 顶.size
    }
    const 字号 = 面板.querySelector('.sheet-size-control')
    const 颜色 = 面板.querySelector('.sheet-color-trigger[data-seal-command="cell.fontColor"]')
    const 尺寸 = 元素 => { if (!元素) return null; const r = 元素.getBoundingClientRect(); return { 宽: Math.round(r.width * 10) / 10, 高: Math.round(r.height * 10) / 10 } }
    // 所有带文字的功能区按钮都不应折行
    const 折行按钮 = []
    for (const 按钮 of Array.from(面板.querySelectorAll('.wps-ribbon-button'))) {
      const 标签 = 按钮.querySelector('.wps-ribbon-button__label') || (按钮.classList.contains('sheet-color-trigger') ? 按钮 : null)
      if (!标签 || !标签.textContent.trim()) continue
      const n = 标签 === 按钮 ? 行数(按钮) : 文字行数(标签)
      if (n > 1) 折行按钮.push(标签.textContent.trim())
    }
    return {
      字号: 尺寸(字号),
      字体颜色: 尺寸(颜色),
      字体颜色行数: 颜色 ? 行数(颜色) : null,
      填充颜色: 尺寸(面板.querySelector('.sheet-color-trigger[data-seal-command="cell.fill"]')),
      // 同组大按钮的常见高度（众数），带下拉值的特殊按钮不参与比较
      大按钮高: (() => { const 计数 = new Map(); for (const 按钮 of Array.from(面板.querySelectorAll('.wps-ribbon-button--large'))) { const 高 = Math.round(按钮.getBoundingClientRect().height * 10) / 10; 计数.set(高, (计数.get(高) || 0) + 1) } return [...计数].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null })(),
      折行按钮,
      面板: { 可视宽: 面板.clientWidth, 内容宽: 面板.scrollWidth, 可横向滚动: 面板.scrollWidth > 面板.clientWidth + 1, 溢出样式: getComputedStyle(面板).overflowX },
      页面横向溢出: document.documentElement.scrollWidth > innerWidth + 1,
    }
  })
}

function 判定(用例, 值) {
  const 问题 = []
  if (值.错误) return [值.错误]
  if (用例.检查字号) {
    if (!值.字号 || 值.字号.宽 < 44) 问题.push(`字号输入框宽 ${值.字号?.宽}`)
    if (!值.字体颜色 || 值.字体颜色行数 !== 1) 问题.push(`字体颜色文字 ${值.字体颜色行数} 行`)
    if (!值.字体颜色 || 值.字体颜色.高 > 56) 问题.push(`字体颜色按钮高 ${值.字体颜色?.高}`)
    if (值.填充颜色 && 值.字体颜色 && Math.abs(值.填充颜色.高 - 值.字体颜色.高) > 1) 问题.push('填充颜色与字体颜色按钮高度不一致')
    if (值.大按钮高 && 值.字体颜色 && Math.abs(值.大按钮高 - 值.字体颜色.高) > 2) 问题.push(`字体颜色按钮高 ${值.字体颜色.高} 与同组大按钮 ${值.大按钮高} 不一致`)
  }
  if (值.折行按钮.length) 问题.push(`按钮文字折行：${值.折行按钮.slice(0, 6).join('、')}`)
  if (值.面板.内容宽 > 值.面板.可视宽 + 1 && !['auto', 'scroll'].includes(值.面板.溢出样式)) 问题.push('溢出但功能区不可横向滚动')
  if (值.页面横向溢出) 问题.push('页面出现横向溢出')
  return 问题
}

async function main() {
  const 报告路径 = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null
  const 端口 = 4800 + Math.floor(Math.random() * 400)
  const 服务 = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'test/ribbon-width/vite.config.mjs', '--port', String(端口), '--strictPort'], { cwd: root, stdio: 'ignore' })
  const 结果 = []
  let 浏览器
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${端口}/`)).ok) break } catch {} await new Promise(r => setTimeout(r, 500)) }
    浏览器 = await chromium.launch()
    for (const 项 of 用例) for (const 宽 of 项.宽度) {
      const page = await 浏览器.newPage({ viewport: { width: 宽, height: 400 } })
      await page.goto(`http://127.0.0.1:${端口}/?${项.查询}`)
      await page.waitForSelector('.wps-ribbon-panel .wps-ribbon-group', { timeout: 30000 })
      await page.evaluate(() => document.fonts?.ready)
      await page.waitForTimeout(300)
      const 值 = await 测量(page)
      const 问题 = 判定(项, 值)
      结果.push({ 用例: 项.名称, 宽度: 宽, 通过: !问题.length, 问题, ...值 })
      await page.close()
    }
  } finally { await 浏览器?.close(); 服务.kill() }
  const 失败 = 结果.filter(x => !x.通过)
  for (const x of 结果) console.log(`${x.通过 ? '通过' : '失败'}  ${x.用例.padEnd(10)} ${String(x.宽度).padStart(4)}  字号 ${JSON.stringify(x.字号)}  字体颜色 ${JSON.stringify(x.字体颜色)}×${x.字体颜色行数 ?? '-'}行  大按钮高 ${x.大按钮高 ?? '-'}  滚动 ${x.面板?.可横向滚动 ? '是' : '否'}${x.问题.length ? '  ' + x.问题.join('；') : ''}`)
  if (报告路径) fs.writeFileSync(报告路径, JSON.stringify({ 时间: new Date().toISOString(), 浏览器: 'Playwright Chromium', 总数: 结果.length, 失败: 失败.length, 结果 }, null, 2))
  console.log(`共 ${结果.length} 项，失败 ${失败.length} 项`)
  process.exitCode = 失败.length ? 1 : 0
}
main().catch(e => { console.error(e); process.exitCode = 1 })
