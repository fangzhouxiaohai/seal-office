import { afterEach, describe, expect, it, vi } from 'vitest'
import { 保存全部文档, 规范保存路径 } from './saveAll'
import { 创建工作表 } from '../sheet/model'

/** 造一个最小的桥接替身：三种类型的转换与写盘都能观测 */
const 安装桥接 = (覆盖: Record<string, unknown> = {}) => {
  const 写入 = vi.fn(async (模型: unknown) => ({ 成功: true, 数据: btoa('PK'), 模型 }))
  const 保存 = vi.fn(async () => ({ 成功: true, 文件指纹: '指纹-新' }))
  const 选择路径 = vi.fn(async () => 'D:\\文档\\另存.docx' as string | null)
  const 资源导出 = vi.fn(async () => ({ 成功: true, 条目: [] as Array<{ 标识: string; 类型: string; 数据: string }> }))
  const 接口 = {
    showSaveDialog: 选择路径,
    saveToFile: 保存,
    office: { writeDocx: 写入, writeXlsx: 写入, writePptx: 写入 },
    presentationResources: { export: 资源导出, restore: vi.fn(), sync: vi.fn(), release: vi.fn() },
    ...覆盖,
  }
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: 接口 })
  return { 写入, 保存, 选择路径, 资源导出, 接口 }
}

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

describe('关闭前保存全部文档', () => {
  it('关闭时 TXT、JSON 和网页按对应格式保存，不写成 DOCX 二进制',async()=>{
    const {保存,写入}=安装桥接()
    const result=await 保存全部文档([{标识:'txt',名称:'资料.txt',类型:'word',路径:'D:/资料.txt',html:'<p>甲</p><p><br></p><p>乙</p>'},{标识:'json',名称:'配置.json',类型:'word',路径:'D:/配置.json',html:'<p>{"name":"seal"}</p>'},{标识:'html',名称:'网页.html',类型:'word',路径:'D:/网页.html',html:'<p>正文</p>'}])
    expect(result.失败).toEqual([]);expect(写入).not.toHaveBeenCalled();expect(保存).toHaveBeenCalledWith('D:/资料.txt','甲\n\n乙','文本');expect(保存).toHaveBeenCalledWith('D:/配置.json','{"name":"seal"}','文本');expect(保存).toHaveBeenCalledWith('D:/网页.html',expect.stringContaining('<!DOCTYPE html>'),'文本')
  })
  it('按类型补扩展名并逐条写出，返回新的文件指纹', () => {
    expect(规范保存路径('word', 'D:\\文档\\报告')).toBe('D:\\文档\\报告.docx')
    expect(规范保存路径('table', 'D:\\文档\\表格')).toBe('D:\\文档\\表格.xlsx')
    expect(规范保存路径('ppt', 'D:\\文档\\演示')).toBe('D:\\文档\\演示.pptx')
    expect(规范保存路径('word', 'D:\\文档\\报告.DOCX')).toBe('D:\\文档\\报告.DOCX')
    expect(规范保存路径('table', 'D:\\文档\\表格.csv')).toBeNull()
    expect(规范保存路径('ppt', 'D:\\文档\\演示.pptx.bak')).toBeNull()
  })

  it('文字文档按 DOCX 模型写出，指纹随保存结果回传', async () => {
    const { 写入, 保存 } = 安装桥接()
    const 结果 = await 保存全部文档([{ 标识: '甲', 名称: '报告.docx', 类型: 'word', 路径: 'D:\\文档\\报告.docx', html: '<p>正文</p>', 文件指纹: '指纹-旧' }])
    expect(结果.失败).toEqual([])
    expect(结果.已保存).toEqual([{ 标识: '甲', 名称: '报告.docx', 路径: 'D:\\文档\\报告.docx', 文件指纹: '指纹-新' }])
    expect(写入).toHaveBeenCalledTimes(1)
    expect(保存).toHaveBeenCalledWith('D:\\文档\\报告.docx', expect.any(Uint8Array), '二进制', '指纹-旧')
  })

  it('表格与演示各自走 xlsx、pptx 转换，演示先导出图片资源', async () => {
    const { 写入, 资源导出 } = 安装桥接()
    const 工作表 = 创建工作表('Sheet1')
    工作表.单元格.A1 = { 原始值: '内容', 显示值: '内容', 格式: {} }
    const 结果 = await 保存全部文档([
      { 标识: '乙', 名称: '表格.xlsx', 类型: 'table', 路径: 'D:\\文档\\表格.xlsx', 表格模型: [工作表] },
      { 标识: '丙', 名称: '演示.pptx', 类型: 'ppt', 路径: 'D:\\文档\\演示.pptx', 演示模型: {
        id: 'p', name: '演示', 当前索引: 0,
        幻灯片列表: [{ id: '页1', 对象列表: [{ id: '图片', 类型: '图片', x: 0, y: 0, width: 10, height: 10, 资源标识: '指纹' }], 文本框列表: [] }],
      } as never },
    ])
    expect(结果.已保存.map((项) => 项.标识)).toEqual(['乙', '丙'])
    expect(资源导出).toHaveBeenCalledWith(['指纹'])
    expect(写入).toHaveBeenCalledTimes(2)
  })

  it('没有路径时先询问保存位置，用户取消则中止并标记已取消', async () => {
    const { 保存, 选择路径 } = 安装桥接()
    选择路径.mockResolvedValue(null)
    const 结果 = await 保存全部文档([{ 标识: '甲', 名称: '未命名文档', 类型: 'word', 路径: null, html: '<p>正文</p>' }])
    expect(结果.已取消).toBe(true)
    expect(结果.已保存).toEqual([])
    expect(保存).not.toHaveBeenCalled()
  })

  it('导入时有未完整内容的来源文件不允许被覆盖', async () => {
    const { 保存 } = 安装桥接()
    const 结果 = await 保存全部文档([{
      标识: '甲', 名称: '导入.docx', 类型: 'word', 路径: 'C:\\来源\\导入.docx',
      html: '<p>正文</p>', 来源路径: 'C:\\来源\\导入.docx', 警告: ['部分内容未导入'],
    }])
    expect(保存).not.toHaveBeenCalled()
    expect(结果.失败).toEqual([{ 标识: '甲', 名称: '导入.docx', 原因: '导入时有未完整导入的内容，已阻止覆盖来源文件，请另存为副本' }])
    expect(结果.已取消).toBe(false)
  })

  it('单个文档失败不打断其余文档，并带出原因', async () => {
    const 保存 = vi.fn(async (路径: string) => 路径.endsWith('坏.docx')
      ? { 成功: false, 错误: '文件被其他程序占用' }
      : { 成功: true, 文件指纹: '指纹-新' })
    安装桥接({ saveToFile: 保存 })
    const 结果 = await 保存全部文档([
      { 标识: '坏', 名称: '坏.docx', 类型: 'word', 路径: 'D:\\文档\\坏.docx', html: '<p>甲</p>' },
      { 标识: '好', 名称: '好.docx', 类型: 'word', 路径: 'D:\\文档\\好.docx', html: '<p>乙</p>' },
    ])
    expect(结果.已保存.map((项) => 项.标识)).toEqual(['好'])
    expect(结果.失败).toEqual([{ 标识: '坏', 名称: '坏.docx', 原因: '文件被其他程序占用' }])
  })

  it('格式转换失败与无法写入 DOCX 的内容都会作为失败原因返回', async () => {
    安装桥接({ office: { writeDocx: vi.fn(async () => ({ 成功: false, 错误: '转换服务不可用' })) } })
    const 结果 = await 保存全部文档([{ 标识: '甲', 名称: '报告.docx', 类型: 'word', 路径: 'D:\\文档\\报告.docx', html: '<p>正文</p>' }])
    expect(结果.失败[0].原因).toBe('转换服务不可用')

    const { 保存 } = 安装桥接()
    // 未知域无法写回 DOCX：与手动保存一致，阻止写出而不是静默丢内容
    const 含未知域 = await 保存全部文档([{
      标识: '乙', 名称: '域.docx', 类型: 'word', 路径: 'D:\\文档\\域.docx',
      html: '<p>前文<span data-seal-field="MERGEFIELD">客户名称</span>后文</p>',
    }])
    expect(保存).not.toHaveBeenCalled()
    expect(含未知域.失败[0].原因).toContain('尚无法写入 DOCX 的内容')
  })

  it('转换抛出的非 Error（如 DOMException）也带出可读原因', async () => {
    安装桥接({
      saveToFile: vi.fn(async () => { throw new DOMException('磁盘已满', 'QuotaExceededError') }),
    })
    const 结果 = await 保存全部文档([{ 标识: '甲', 名称: '报告.docx', 类型: 'word', 路径: 'D:\\文档\\报告.docx', html: '<p>正文</p>' }])
    expect(结果.失败[0].原因).toBe('磁盘已满')
  })

  it('保存路径格式不受支持时拒绝写出', async () => {
    const { 保存 } = 安装桥接()
    安装桥接({ showSaveDialog: vi.fn(async () => 'D:\\文档\\表格.csv') })
    const 结果 = await 保存全部文档([{ 标识: '甲', 名称: '表格', 类型: 'table', 路径: null, 表格模型: [] }])
    expect(结果.失败[0].原因).toContain('只能保存为 XLSX 格式')
    expect(保存).not.toHaveBeenCalled()
  })
})
