#!/usr/bin/env node
// 外部办公程序依赖门槛（2.8.1 第十一节）：盘点产品源码、打包配置、持续集成与部署脚本中
// 仍在定位、调用、下载、安装或提示 LibreOffice / soffice 的位置。
// 历史报告、旧版本验收记录与升级计划只记录过去的事实，不计入。
// 用法：node scripts/check-office-runtime-free.cjs [--check] [--json 输出.json]
//   --check  仍有未替换路径时以非零退出，用作 2.8.1 发版阻断门槛
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const 规则 = /\bsoffice(?:\.com|\.bin)?\b|libreoffice|LibreOffice|office-runtime|prepare-office-runtime|定位兼容引擎|选择兼容过滤器|nativeConversion/
// 扫描范围：会进入安装包、运行时、构建或 CI 的位置
const 范围 = ['main', 'renderer/src', 'mobile/web', 'mobile/scripts', 'converter', 'build', 'scripts', '.github/workflows', 'package.json', 'seal-server']
// 只记录历史或说明自身规则的文件
const 排除 = [
  /(^|\/)node_modules\//, /(^|\/)dist\//, /\.test\.(c?js|mjs|tsx?)$/, /_test\.(cjs|py)$/, /(^|\/)test_[^/]+\.py$/,
  /^scripts\/check-office-runtime-free\.cjs$/,
  /^scripts\/finalize-v200-[^/]+\.cjs$/, /^scripts\/publish-release-2\.5\.0\.py$/, /^scripts\/capture-2\.5\.0-screenshots\.cjs$/,
]
const 分类 = [
  [/^main\/office\//, '桌面主进程转换'],
  [/^main\//, '桌面主进程其他'],
  [/^renderer\//, '桌面与网页渲染层'],
  [/^mobile\//, '移动网页与打包'],
  [/^converter\//, '服务端转换服务'],
  [/^seal-server\//, '服务端'],
  [/^build\//, '安装包配置'],
  [/^\.github\//, '持续集成'],
  [/^package\.json$/, '安装包配置'],
  [/^scripts\//, '构建、验收与部署脚本'],
]

function* 遍历(相对) {
  const 绝对 = path.join(root, 相对)
  if (!fs.existsSync(绝对)) return
  const 状态 = fs.statSync(绝对)
  if (状态.isFile()) { yield 相对; return }
  for (const 名称 of fs.readdirSync(绝对)) {
    if (名称 === 'node_modules' || 名称 === '.git') continue
    yield* 遍历(path.posix.join(相对, 名称))
  }
}

const 结果 = []
for (const 起点 of 范围) for (const 文件 of 遍历(起点)) {
  if (排除.some(正则 => 正则.test(文件))) continue
  if (!/\.(c?js|mjs|tsx?|json|ya?ml|py|ps1|sh|service|txt|md|cjs|uvue|ts|java|kt|gradle)$|Dockerfile$/.test(文件)) continue
  const 内容 = fs.readFileSync(path.join(root, 文件), 'utf8')
  if (!规则.test(内容)) continue
  const 行 = 内容.split(/\r?\n/).map((文本, 序号) => ({ 行号: 序号 + 1, 文本: 文本.trim() })).filter(x => 规则.test(x.文本))
  结果.push({ 文件, 类别: 分类.find(([正则]) => 正则.test(文件))?.[1] ?? '其他', 行: 行.map(x => ({ 行号: x.行号, 文本: x.文本.slice(0, 160) })) })
}

const 按类别 = {}
for (const 项 of 结果) (按类别[项.类别] ||= []).push(项)
for (const [类别, 列表] of Object.entries(按类别)) {
  console.log(`\n【${类别}】${列表.length} 个文件`)
  for (const 项 of 列表) console.log(`  ${项.文件}  (${项.行.map(x => x.行号).join(', ')})`)
}
const 行数 = 结果.reduce((和, 项) => 和 + 项.行.length, 0)
console.log(`\n仍引用外部办公程序：${结果.length} 个文件，${行数} 处`)
const 输出 = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null
if (输出) fs.writeFileSync(输出, JSON.stringify({ 时间: new Date().toISOString(), 文件数: 结果.length, 引用数: 行数, 结果 }, null, 2))
if (process.argv.includes('--check') && 结果.length) {
  console.error('2.8.1 发版阻断：仍有未替换的外部办公程序路径')
  process.exitCode = 1
}
module.exports = { 规则 }
