const path = require('path')

/** 包内关系只能定位包内文件；拒绝编码后的越界和操作系统路径。 */
function 解析部件路径(来源, 目标) {
  if (typeof 目标 !== 'string' || !目标) throw new Error('演示文件无效：关系目标为空')
  let 解码目标
  try { 解码目标 = decodeURIComponent(目标) } catch { throw new Error('演示文件无效：关系目标编码损坏') }
  if (/[\\\x00-\x20?#]/.test(解码目标) || /%[0-9a-f]{2}/i.test(解码目标) || /^[a-z][a-z\d+.-]*:/i.test(解码目标) || 解码目标.startsWith('//')) {
    throw new Error('演示文件无效：关系目标不是安全的包内部件路径')
  }
  const 分段 = 解码目标.startsWith('/') ? [] : path.posix.dirname(来源).split('/').filter(项 => 项 && 项 !== '.')
  for (const 段 of 解码目标.split('/')) {
    if (!段 || 段 === '.') continue
    if (段 === '..') {
      if (!分段.length) throw new Error('演示文件无效：关系目标超出压缩包根目录')
      分段.pop()
    } else 分段.push(段)
  }
  if (!分段.length) throw new Error('演示文件无效：关系目标不是文件')
  return 分段.join('/')
}

function 读取部件(压缩包, 路径) {
  const 文件 = 压缩包.file(路径)
  if (!文件 || 文件.dir) throw new Error(`演示文件无效：关系目标部件不存在（${路径}）`)
  if (文件.unsafeOriginalName && 文件.unsafeOriginalName !== 路径) {
    throw new Error(`演示文件无效：压缩包部件路径不安全（${路径}）`)
  }
  return 文件
}

module.exports = { 解析部件路径, 读取部件 }
