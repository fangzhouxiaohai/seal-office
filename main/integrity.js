const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const 清单文件名 = 'integrity-manifest.json'

function 校验值(内容) {
  return crypto.createHash('sha256').update(内容).digest('hex')
}

function 扫描文件(根目录, 相对目录) {
  const 绝对目录 = path.join(根目录, 相对目录)
  return fs.readdirSync(绝对目录, { withFileTypes: true }).flatMap((条目) => {
    const 相对路径 = path.join(相对目录, 条目.name)
    if (条目.isDirectory()) return 扫描文件(根目录, 相对路径)
    if (!条目.isFile() || 条目.name === 清单文件名) return []
    const 内容 = fs.readFileSync(path.join(根目录, 相对路径))
    return [{ 路径: 相对路径.split(path.sep).join('/'), 校验值: 校验值(内容), 字节数: 内容.byteLength }]
  })
}

function 生成清单(根目录) {
  return { 版本: 1, 文件: [...扫描文件(根目录, 'main'), ...扫描文件(根目录, 'dist')].sort((左, 右) => 左.路径.localeCompare(右.路径)) }
}

function 验证清单结构(清单) {
  if (!清单 || 清单.版本 !== 1 || !Array.isArray(清单.文件) || 清单.文件.length === 0) throw new Error('完整性清单无效')
  for (const 条目 of 清单.文件) {
    if (!条目 || typeof 条目.路径 !== 'string' || !/^(main|dist)\/[\w./-]+$/.test(条目.路径) || 条目.路径.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(条目.校验值) || !Number.isSafeInteger(条目.字节数) || 条目.字节数 < 0) {
      throw new Error('完整性清单包含无效文件记录')
    }
  }
}

function 核验清单(根目录, 清单) {
  验证清单结构(清单)
  const 异常 = []
  for (const 条目 of 清单.文件) {
    const 目标 = path.join(根目录, ...条目.路径.split('/'))
    let 内容
    try {
      内容 = fs.readFileSync(目标)
    } catch (错误) {
      异常.push({ 路径: 条目.路径, 原因: 错误?.code === 'ENOENT' ? '文件缺失' : '文件无法读取' })
      continue
    }
    if (内容.byteLength !== 条目.字节数 || 校验值(内容) !== 条目.校验值) {
      异常.push({ 路径: 条目.路径, 原因: '校验值不一致' })
    }
  }
  return { 完整: 异常.length === 0, 检查文件数: 清单.文件.length, 异常 }
}

function 检查安装目录(根目录) {
  const 清单路径 = path.join(根目录, 'main', 清单文件名)
  if (!fs.existsSync(清单路径)) throw new Error('当前目录没有构建时生成的完整性清单，请使用 Windows 打包版本检查')
  let 清单
  try {
    清单 = JSON.parse(fs.readFileSync(清单路径, 'utf8'))
  } catch (错误) {
    throw new Error(`无法读取完整性清单：${错误 instanceof Error ? 错误.message : '内容无效'}`)
  }
  return 核验清单(根目录, 清单)
}

module.exports = { 生成清单, 核验清单, 检查安装目录 }
