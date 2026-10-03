const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function 是构建文件(相对路径) {
  if (相对路径 === 'main/integrity-manifest.json') return false
  if (!相对路径.startsWith('main/')) return true
  const 主进程路径 = 相对路径.slice('main/'.length)
  const 路径段 = 主进程路径.split('/')
  return !路径段.includes('node_modules') &&
    !路径段.includes('.vitest') &&
    主进程路径 !== 'main-test.js' &&
    !/\.(test|spec)\.js$/.test(主进程路径)
}

function 生成构建清单(根目录) {
  function 扫描(相对目录) {
    const 绝对目录 = path.join(根目录, ...相对目录.split('/'))
    return fs.readdirSync(绝对目录, { withFileTypes: true }).flatMap((条目) => {
      const 相对路径 = `${相对目录}/${条目.name}`
      if (!是构建文件(相对路径)) return []
      if (条目.isDirectory()) return 扫描(相对路径)
      if (!条目.isFile()) return []
      const 内容 = fs.readFileSync(path.join(绝对目录, 条目.name))
      return [{
        路径: 相对路径,
        校验值: crypto.createHash('sha256').update(内容).digest('hex'),
        字节数: 内容.byteLength,
      }]
    })
  }
  return { 版本: 1, 文件: [...扫描('main'), ...扫描('dist')].sort((左, 右) => 左.路径.localeCompare(右.路径)) }
}

if (require.main === module) {
  const 根目录 = path.resolve(__dirname, '..')
  const 清单 = 生成构建清单(根目录)
  fs.writeFileSync(path.join(根目录, 'main', 'integrity-manifest.json'), JSON.stringify(清单), 'utf8')
  process.stdout.write(`已生成 ${清单.文件.length} 个文件的完整性清单\n`)
}

module.exports = { 是构建文件, 生成构建清单 }
