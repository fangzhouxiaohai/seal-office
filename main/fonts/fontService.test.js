const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const { 创建字体服务 } = require('./fontService')

function nameTable(family) {
  const value = Buffer.from(family, 'utf16le')
  const swapped = Buffer.alloc(value.length)
  for (let index = 0; index < value.length; index += 2) { swapped[index] = value[index + 1]; swapped[index + 1] = value[index] }
  const table = Buffer.alloc(6 + 12 + swapped.length)
  table.writeUInt16BE(0, 0); table.writeUInt16BE(1, 2); table.writeUInt16BE(18, 4)
  table.writeUInt16BE(3, 6); table.writeUInt16BE(1, 8); table.writeUInt16BE(0x0804, 10); table.writeUInt16BE(1, 12)
  table.writeUInt16BE(swapped.length, 14); table.writeUInt16BE(0, 16); swapped.copy(table, 18)
  return table
}

function fakeFont(family) {
  const head = Buffer.alloc(54), name = nameTable(family)
  const count = 2, header = 12 + count * 16
  const output = Buffer.alloc(header + 56 + name.length)
  output.writeUInt32BE(0x00010000, 0); output.writeUInt16BE(count, 4)
  output.write('head', 12, 4, 'latin1'); output.writeUInt32BE(header, 20); output.writeUInt32BE(54, 24)
  output.write('name', 28, 4, 'latin1'); output.writeUInt32BE(header + 56, 36); output.writeUInt32BE(name.length, 40)
  head.copy(output, header); name.copy(output, header + 56)
  return output
}

describe('字体服务', () => {
  let root, system
  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'seal-font-'))
    system = path.join(root, 'system'); await fsp.mkdir(system)
    await fsp.writeFile(path.join(system, 'gongwen.ttf'), fakeFont('仿宋_GB2312'))
  })
  afterEach(async () => { await fsp.rm(root, { recursive: true, force: true }) })

  it('扫描系统字体、导入自定义字体、读取字面并按文件移除', async () => {
    const source = path.join(root, '方正小标宋简体.ttf')
    await fsp.writeFile(source, fakeFont('方正小标宋简体'))
    const service = 创建字体服务({ 数据目录: path.join(root, 'data'), 字体目录: [system], 选择文件: async () => [source], 打开目录: async () => {} })
    const listed = await service.列出()
    expect(listed.系统.some((item) => item.名称 === '仿宋_GB2312')).toBe(true)
    expect(listed.自定义).toHaveLength(0)
    const imported = await service.导入字体()
    expect(imported.导入).toHaveLength(1)
    expect(imported.导入[0].名称).toBe('方正小标宋简体')
    const after = await service.列出()
    expect(after.自定义).toHaveLength(1)
    expect(after.自定义[0].文件名).toBeUndefined()
    const read = await service.读取字体(after.自定义[0].标识)
    expect(read.名称).toBe('方正小标宋简体')
    expect(Buffer.from(read.数据, 'base64').subarray(0, 4).toString('hex')).toBe('00010000')
    const removed = await service.移除字体(after.自定义[0].标识)
    expect(removed.移除).toEqual(['方正小标宋简体'])
    expect((await service.列出()).自定义).toHaveLength(0)
  })

  it('重复导入同一字体不会复制第二份', async () => {
    const source = path.join(root, '仿宋_GB2312.ttf')
    await fsp.writeFile(source, fakeFont('仿宋_GB2312'))
    const service = 创建字体服务({ 数据目录: path.join(root, 'data'), 字体目录: [system], 选择文件: async () => [source] })
    await service.导入字体()
    const second = await service.导入字体()
    expect(second.导入).toHaveLength(0)
    expect(second.重复).toHaveLength(1)
  })
})
