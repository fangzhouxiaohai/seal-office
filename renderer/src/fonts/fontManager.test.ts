import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fontBytes = Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0])
const record = {
  标识: 'system-0123456789abcdefabcd', 名称: '仿宋_GB2312', 家族: '仿宋_GB2312', 英文名: 'FangSong_GB2312',
  别名: ['FangSong_GB2312', '仿宋'], 样式: 'Regular', 字重: 400, 斜体: false, 格式: 'ttf', 大小: fontBytes.length,
  中文字形: true, 拉丁字形: true, 可嵌入: true, 授权位: 0, 来源: 'system' as const, 文件名: 'simfang.ttf',
}

function 安装桥接() {
  ;(window as any).electronAPI = {
    fonts: {
      list: vi.fn(async () => ({ 成功: true, 数据: { 系统: [record], 自定义: [], 平台: 'win32', 扫描时间: '2026-10-26T00:00:00.000Z', 目录: [], 跳过: 0 } })),
      read: vi.fn(async () => ({ 成功: true, 数据: { ...record, 数据: Buffer.from(fontBytes).toString('base64') } })),
      import: vi.fn(), remove: vi.fn(), openFolder: vi.fn(),
    },
  }
}

describe('专属格式字体嵌入', () => {
  beforeEach(() => {
    if (typeof FontFace === 'undefined') (globalThis as any).FontFace = class {
      family: string
      constructor(family: string) { this.family = family }
      load() { return Promise.resolve(this) }
    }
  })
  afterEach(() => { delete (window as any).electronAPI; vi.resetModules() })

  it('把实际使用的公文字体字节写入专属文档载荷', async () => {
    安装桥接()
    const manager = await import('./fontManager')
    await manager.初始化字体目录()
    expect(manager.查找字体记录('仿宋_GB2312')).toHaveLength(1)
    const output = await manager.准备保存字体资源('word', {
      html: '<p style="font-family:\'仿宋_GB2312\',serif">正文</p>',
      页面设置: { 页眉Html: '<p style="font-family:仿宋_GB2312">页眉</p>' },
    }) as any
    expect(output.字体资源).toHaveLength(1)
    expect(output.字体资源[0]).toMatchObject({ 家族: '仿宋_GB2312', 文件大小: fontBytes.length, 格式: 'ttf' })
    expect(Buffer.from(output.字体资源[0].数据, 'base64')).toEqual(Buffer.from(fontBytes))
  })

  it('表格与演示模型也按字体字段收集，而不是只扫描 HTML', async () => {
    const module = await import('./fontManager')
    expect(module.收集文档字体('table', { 工作表列表: [{ 单元格: { A1: { 格式: { 字体: '方正小标宋简体' } } } }] })).toContain('方正小标宋简体')
    expect(module.收集文档字体('ppt', { 演示文稿: { 主题: { 字体: { 标题: '黑体', 正文: '仿宋' } }, 幻灯片列表: [] } })).toEqual(expect.arrayContaining(['黑体', '仿宋']))
    expect(module.字体回退链('方正小标宋简体')).toEqual(expect.arrayContaining(['华文中宋', 'STZhongsong', 'SealNotoSerif']))
  })

  it('打开文档时注册嵌入字体，换设备再次保存仍保留字体字节', async () => {
    安装桥接()
    const added: string[] = []
    const fonts = { add: (face: any) => { added.push(face.family); return face }, check: () => true, ready: Promise.resolve() }
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
    const module = await import('./fontManager')
    const payload = {
      html: '<p style="font-family: 仿宋_GB2312">正文</p>',
      字体格式: 1,
      字体资源: [{ 标识: 'system-0123456789abcdefabcd', 名称: '仿宋_GB2312', 家族: '仿宋_GB2312', 别名: ['FangSong_GB2312'], 样式: 'Regular', 字重: 400, 斜体: false, 格式: 'ttf', 文件大小: fontBytes.length, 数据: Buffer.from(fontBytes).toString('base64') }],
    }
    await module.准备打开文档字体('word', payload)
    expect(module.查找字体记录('仿宋_GB2312')[0].来源).toBe('embedded')
    expect(added).toContain('仿宋_GB2312')
    const output = await module.准备保存字体资源('word', payload) as any
    expect(output.字体资源).toHaveLength(1)
  })
})
