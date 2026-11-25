#!/usr/bin/env node
// 界面文案扫描与台账守卫（2.8.0 工作流一 S2/S5）。
//
// 1. 台账校验：键名格式 域.页面.用途、键全局唯一、英文必填且不含中文、中英文占位符一致。
// 2. 已迁移文件守卫：登记在 已迁移文件 中的源码不得再出现未经台账的中文界面文字。
// 3. 源码盘点：用 Babel AST 提取渲染层与移动 Web 中的中文字符串与 JSX 文本（跳过注释、导入路径、
//    属性名与标识符），按“内联双语 t(中, 英) / DOM 适配器词典覆盖 / 未覆盖”分类，输出缺失清单。
//
// 用法：node scripts/scan-interface-language.cjs [--check] [--report 输出.json] [--max-uncovered N]
//   --check           台账或已迁移文件有问题时以非零退出（CI 用）
//   --max-uncovered N 未覆盖条目超过基线 N 时失败，防止新增未翻译文案
const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('@babel/parser')

const root = path.resolve(__dirname, '..')
const 中文 = /[㐀-鿿]/u
const 源码目录 = ['renderer/src', 'mobile/web']
const 词典目录 = 'renderer/src/i18n'
const 台账目录 = 'renderer/src/i18n/ledger'
/** 不属于界面翻译范围的源码（计划第一章：Office 文件内容与用户内容不翻译），逐条登记原因 */
const 排除 = {
  'renderer/src/data/presentationTemplates/': '演示模板正文（文件内容）',
  'renderer/src/data/templates.ts': '文档模板正文（文件内容）',
  'renderer/src/utils/简繁单字表.ts': '简繁转换数据表',
  'renderer/src/ppt/model/langConvert.ts': '简繁词语转换数据表',
}
const 已排除 = 文件 => Object.keys(排除).some(前缀 => 文件.startsWith(前缀))
const 相对 = 文件 => path.relative(root, 文件).split(path.sep).join('/')

function 读源(文件) {
  return parse(fs.readFileSync(文件, 'utf8'), { sourceType: 'module', errorRecovery: true, plugins: [文件.endsWith('x') ? 'jsx' : null, 'typescript'].filter(Boolean) })
}

/** 通用 AST 遍历：回调收到节点与父节点 */
function 遍历(节点, 回调, 父 = null) {
  if (!节点 || typeof 节点.type !== 'string') return
  回调(节点, 父)
  for (const [键, 值] of Object.entries(节点)) {
    if (['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments', 'extra'].includes(键)) continue
    if (Array.isArray(值)) for (const 子 of 值) 遍历(子, 回调, 节点)
    else if (值 && typeof 值 === 'object') 遍历(值, 回调, 节点)
  }
}

function 遍历文件(目录, 过滤) {
  const 结果 = []
  const 走 = 当前 => {
    for (const 项 of fs.readdirSync(当前, { withFileTypes: true })) {
      const 完整 = path.join(当前, 项.name)
      if (项.isDirectory()) { if (!['node_modules', '__fixtures__', 'tmp-test'].includes(项.name)) 走(完整) }
      else if (过滤(完整)) 结果.push(完整)
    }
  }
  if (fs.existsSync(目录)) 走(目录)
  return 结果
}

const 键名 = 节点 => 节点?.type === 'Identifier' ? 节点.name : 节点?.type === 'StringLiteral' ? 节点.value : null
const 字符串值 = 节点 => 节点?.type === 'StringLiteral' ? 节点.value : 节点?.type === 'TemplateLiteral' && !节点.expressions.length ? 节点.quasis[0].value.cooked : null

// ---------- 台账 ----------
function 读取台账() {
  const 条目 = new Map(), 问题 = [], 已迁移 = []
  for (const 文件 of 遍历文件(path.join(root, 台账目录), f => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))) {
    遍历(读源(文件), (节点) => {
      if (节点.type === 'ObjectProperty' && 节点.value?.type === 'ObjectExpression') {
        const 键 = 键名(节点.key)
        const 字段 = Object.fromEntries(节点.value.properties.filter(p => p.type === 'ObjectProperty').map(p => [键名(p.key), 字符串值(p.value)]))
        if (!键 || !('zh' in 字段)) return
        const 位置 = `${相对(文件)}:${节点.loc.start.line}`
        if (条目.has(键)) 问题.push(`${位置} 键重复：${键}（首次定义于 ${条目.get(键).位置}）`)
        if (!/^[a-z0-9]+(\.[a-z0-9]+)+$/.test(键)) 问题.push(`${位置} 键名不符合 域.页面.用途：${键}`)
        if (!字段.en || !字段.en.trim()) 问题.push(`${位置} 缺少英文：${键}`)
        else if (中文.test(字段.en)) 问题.push(`${位置} 英文中含中文：${键}`)
        const 占位 = 文本 => [...String(文本 || '').matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
        if (字段.en && 占位(字段.zh) !== 占位(字段.en)) 问题.push(`${位置} 中英文占位符不一致：${键}`)
        条目.set(键, { ...字段, 位置 })
      }
      if (节点.type === 'VariableDeclarator' && 键名(节点.id) === '已迁移文件' && 节点.init?.type === 'ArrayExpression')
        for (const 元素 of 节点.init.elements) if (元素?.type === 'StringLiteral') 已迁移.push(元素.value)
    })
  }
  return { 条目, 问题, 已迁移 }
}

// ---------- DOM 适配器词典 ----------
function 读取词典() {
  const 覆盖 = new Set()
  for (const 文件 of 遍历文件(path.join(root, 词典目录), f => /\.tsx?$/.test(f) && !/\.test\./.test(f) && !f.includes(path.sep + 'ledger' + path.sep)))
    遍历(读源(文件), 节点 => { if (节点.type === 'ObjectProperty') { const 键 = 键名(节点.key); if (键 && 中文.test(键)) 覆盖.add(键) } })
  return 覆盖
}

// ---------- 源码提取 ----------
const 规范 = 文本 => String(文本).replace(/\s+/g, ' ').trim()
const 调用名 = 节点 => 节点?.type === 'Identifier' ? 节点.name : 节点?.type === 'MemberExpression' ? 调用名(节点.property) : ''

function 提取(文件) {
  const 结果 = []
  const 记 = (节点, 文本, 种类, 内联 = false) => {
    const 值 = 规范(文本)
    if (!值 || !中文.test(值)) return
    结果.push({ 文件: 相对(文件), 行: 节点.loc.start.line, 文本: 值, 种类, 内联 })
  }
  遍历(读源(文件), (节点, 父) => {
    if (节点.type === 'JSXText') return 记(节点, 节点.value, 'JSX')
    const 是字符串 = 节点.type === 'StringLiteral' || (节点.type === 'TemplateLiteral')
    if (!是字符串 || !父) return
    // 跳过导入路径、对象键、类型字面量、成员下标与 JSX 属性名
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'TSLiteralType', 'TSEnumMember'].includes(父.type)) return
    if (父.type === 'CallExpression' && (调用名(父.callee) === 'require' || 父.callee.type === 'Import')) return
    if (父.type === 'ObjectProperty' && 父.key === 节点) return
    if (父.type === 'MemberExpression' && 父.property === 节点) return
    const 文本 = 节点.type === 'StringLiteral' ? 节点.value : 节点.quasis.map(q => q.value.cooked).join('{…}')
    // 内联双语：t('中', 'English') 一类调用的第一个参数
    const 内联 = 父.type === 'CallExpression' && 父.arguments[0] === 节点 && 父.arguments.length >= 2 && /^(t|tt|tr|翻译|双语)$/.test(调用名(父.callee)) && !中文.test(JSON.stringify(父.arguments[1].value ?? 父.arguments[1].quasis?.map(q => q.value.cooked) ?? ''))
    记(节点, 文本, 节点.type === 'StringLiteral' ? '字符串' : '模板', 内联)
  })
  return 结果
}

function main() {
  const 参数 = process.argv.slice(2)
  const 检查 = 参数.includes('--check')
  const 报告 = 参数.includes('--report') ? 参数[参数.indexOf('--report') + 1] : null
  const 上限 = 参数.includes('--max-uncovered') ? Number(参数[参数.indexOf('--max-uncovered') + 1]) : null
  const 台账 = 读取台账(), 词典 = 读取词典()
  const 文件列表 = 源码目录.flatMap(目录 => 遍历文件(path.join(root, 目录), f => /\.(ts|tsx)$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f) && !/\.d\.ts$/.test(f) && !f.includes(path.join('renderer', 'src', 'i18n') + path.sep)))
  const 条目 = 文件列表.filter(f => !已排除(相对(f))).flatMap(提取)
  const 未覆盖 = 条目.filter(x => !x.内联 && !词典.has(x.文本))
  const 迁移违规 = 条目.filter(x => 台账.已迁移.includes(x.文件))
  const 问题 = [...台账.问题, ...迁移违规.map(x => `${x.文件}:${x.行} 已迁移文件仍含未经台账的中文：${x.文本}`)]
  if (上限 !== null && 未覆盖.length > 上限) 问题.push(`未覆盖中文文案 ${未覆盖.length} 条，超过基线 ${上限} 条；新增文案请写入台账并用 t(键)`)
  const 按文件 = {}
  for (const x of 未覆盖) (按文件[x.文件] ||= []).push({ 行: x.行, 文本: x.文本 })
  const 摘要 = {
    时间: new Date().toISOString(),
    台账条目: 台账.条目.size,
    已迁移文件: 台账.已迁移,
    扫描文件: 文件列表.length,
    排除范围: 排除,
    中文文案: 条目.length,
    内联双语: 条目.filter(x => x.内联).length,
    词典覆盖: 条目.filter(x => !x.内联 && 词典.has(x.文本)).length,
    未覆盖: 未覆盖.length,
    未覆盖文件数: Object.keys(按文件).length,
    问题,
  }
  console.log(JSON.stringify({ ...摘要, 问题: 问题.slice(0, 50) }, null, 2))
  if (报告) {
    fs.mkdirSync(path.dirname(path.resolve(报告)), { recursive: true })
    fs.writeFileSync(报告, JSON.stringify({ ...摘要, 未覆盖清单: Object.fromEntries(Object.entries(按文件).sort((a, b) => b[1].length - a[1].length)) }, null, 2))
  }
  if (检查 && 问题.length) process.exitCode = 1
}

if (require.main === module) main()
module.exports = { 读取台账, 读取词典, 提取 }
