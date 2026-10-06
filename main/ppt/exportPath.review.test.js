const { 写入导出文件 } = require('./export')
const fs = require('fs')
const os = require('os')
const path = require('path')

const 建目录 = () => {
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-export-review-'))
  const 输出 = path.join(根, '输出')
  fs.mkdirSync(输出)
  return { 根, 输出 }
}
const 条目 = (数量) => Array.from({ length: 数量 }, (_, i) => ({ 序号: i, 类型: 'image/png', 数据: Buffer.from(`页面${i}`) }))

it('导出基础名含路径分隔时不能逃出目标目录', () => {
  const { 根, 输出 } = 建目录()
  const 列表 = 写入导出文件(输出, '..\\..\\逃逸', 'PNG', 条目(1))
  for (const 项 of 列表) {
    expect(path.resolve(项.路径).startsWith(path.resolve(输出) + path.sep)).toBe(true)
  }
  expect(fs.readdirSync(根).filter(名称 => 名称 !== '输出')).toEqual([])
})

it('多页导出的目录名含路径分隔时同样不能逃出目标目录', () => {
  const { 根, 输出 } = 建目录()
  const 列表 = 写入导出文件(输出, '..\\..\\逃逸多页', 'PNG', 条目(3))
  for (const 项 of 列表) {
    expect(path.resolve(项.路径).startsWith(path.resolve(输出) + path.sep)).toBe(true)
  }
  expect(fs.readdirSync(根).filter(名称 => 名称 !== '输出')).toEqual([])
})

it('导出基础名含斜杠或空字节时给出确定命名而不是异常路径', () => {
  const { 输出 } = 建目录()
  const 列表 = 写入导出文件(输出, 'a/b/../../c', 'PDF', 条目(1))
  expect(path.resolve(列表[0].路径).startsWith(path.resolve(输出) + path.sep)).toBe(true)
  expect(path.basename(列表[0].路径)).not.toMatch(/[\\/]/)
})
