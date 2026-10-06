const { 提取资源, 压缩图片, 安全名, 扩展名 } = require('./resourceTools')
const fs = require('fs')
const path = require('path')
const os = require('os')

const 数据 = (文本) => Buffer.from(文本).toString('base64')

describe('资源提取', () => {
  it('按类型写扩展名、净化文件名并返回逐项结果', async () => {
    const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-资源-'))
    const 结果 = await 提取资源([
      { 标识: 'a'.repeat(64), 类型: 'image/png', 数据: 数据('PNG字节'), 名称: '图/片:名称' },
      { 标识: 'b'.repeat(64), 类型: 'video/mp4', 数据: 数据('视频字节') },
    ], 目录)
    expect(结果.汇总).toEqual({ 总数: 2, 成功: 2, 失败: 0 })
    expect(path.basename(结果.结果[0].路径)).toBe('图_片_名称.png')
    expect(fs.readFileSync(结果.结果[0].路径).toString()).toBe('PNG字节')
    expect(path.extname(结果.结果[1].路径)).toBe('.mp4')
    expect(结果.结果[1].字节数).toBe(Buffer.from('视频字节').length)
  })

  it('重名自动追加序号且不覆盖已存在文件', async () => {
    const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-资源-'))
    fs.writeFileSync(path.join(目录, '同名.png'), '已存在')
    const 结果 = await 提取资源([{ 标识: 'c'.repeat(64), 类型: 'image/png', 数据: 数据('新字节'), 名称: '同名' }], 目录)
    expect(path.basename(结果.结果[0].路径)).toBe('同名-1.png')
    expect(fs.readFileSync(path.join(目录, '同名.png')).toString()).toBe('已存在')
  })

  it('单项失败不影响其他项，并给出真实原因', async () => {
    const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-资源-'))
    const 结果 = await 提取资源([
      { 标识: 'd'.repeat(64), 类型: 'image/png', 数据: '' },
      { 标识: 'e'.repeat(64), 类型: 'image/png', 数据: 数据('好字节') },
    ], 目录)
    expect(结果.汇总).toEqual({ 总数: 2, 成功: 1, 失败: 1 })
    expect(结果.结果[0].错误).toContain('字节')
    expect(结果.结果[1].成功).toBe(true)
  })

  it('拒绝空列表与空目录', async () => {
    await expect(提取资源([], 'E:\\Temp')).rejects.toThrow('没有可提取的资源')
    await expect(提取资源([{ 标识: 'f'.repeat(64), 类型: 'image/png', 数据: 数据('x') }], '')).rejects.toThrow('请选择资源提取目录')
  })

  it('扩展名与文件名净化规则明确', () => {
    expect(扩展名('image/jpeg')).toBe('.jpg')
    expect(扩展名('application/vnd.seal')).toBe('.bin')
    const 净化后 = 安全名('..\\..\\根目录:写入')
    expect(净化后).not.toMatch(/[\\/:*?"<>|]/)
    expect(净化后.startsWith('.')).toBe(false)
    expect(净化后).toContain('根目录_写入')
    expect(安全名('')).toBe('资源')
  })
})

describe('图片压缩', () => {
  const 原图 = Buffer.alloc(2000, 7)

  it('压缩成功后返回新字节与尺寸', async () => {
    const 结果 = await 压缩图片({ 数据: 原图.toString('base64'), 类型: 'image/png' }, { 质量: 0.6, 最大边: 800 }, {
      重采样: async (字节, 类型, 选项) => { expect(选项).toEqual({ 质量: 0.6, 最大边: 800 }); return { 字节: Buffer.alloc(500, 1), 类型, 宽: 800, 高: 600 } },
    })
    expect(结果).toMatchObject({ 成功: true, 原字节数: 2000, 新字节数: 500, 宽: 800, 高: 600 })
  })

  it('压缩后没有变小时如实返回失败并保持原图', async () => {
    const 结果 = await 压缩图片({ 数据: 原图.toString('base64'), 类型: 'image/jpeg' }, {}, {
      重采样: async () => ({ 字节: Buffer.alloc(2000, 1), 类型: 'image/jpeg' }),
    })
    expect(结果.成功).toBe(false)
    expect(结果.原因).toContain('不小于原图')
    expect(结果).not.toHaveProperty('字节')
  })

  it('不支持的格式、非法质量与空重采样都给出真实原因', async () => {
    await expect(压缩图片({ 数据: 原图.toString('base64'), 类型: 'image/gif' }, {})).rejects.toThrow('只支持压缩 PNG 与 JPEG')
    await expect(压缩图片({ 数据: 原图.toString('base64'), 类型: 'image/png' }, { 质量: 2 }, {})).rejects.toThrow('压缩质量必须在 0 与 1 之间')
    await expect(压缩图片({ 数据: 原图.toString('base64'), 类型: 'image/png' }, {}, { 重采样: async () => ({ 字节: Buffer.alloc(0) }) })).rejects.toThrow('没有返回图片字节')
    await expect(压缩图片({ 数据: '', 类型: 'image/png' }, {})).rejects.toThrow('图片资源字节无效')
  })

  it('桌面版重采样可用时使用真实实现（无 Electron 时给出真实原因）', async () => {
    const 模块 = require('./resourceTools')
    const 输出 = await 模块.压缩图片({ 数据: 原图.toString('base64'), 类型: 'image/png' }, {}).catch(错误 => ({ 错误: 错误.message }))
    if (输出.错误) expect(输出.错误).toMatch(/当前环境不支持图片重采样|图片无法解码/)
    else expect(输出).toHaveProperty('原字节数')
  })
})
