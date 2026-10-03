import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from 'antd'
import { 读取本地文件内容, 注册最近文档错误弹窗, 记录最近文档, 通过对话框打开文件, 通过路径打开文件 } from './fileOpen'
import { 保存为纯文本 } from './editor/exportDoc'
import { 创建工作表, 写入单元格 } from './sheet/model'

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI')
  vi.restoreAllMocks()
})

describe('本地文件打开', () => {
  it('读取失败时保留原始错误，不返回空文档', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { readFile: vi.fn().mockResolvedValue({ 成功: false, 错误: '文件不存在' }) },
    })
    await expect(读取本地文件内容('C:\\资料\\报告.docx')).rejects.toThrow('文件不存在')
  })

  it('格式解析失败时明确报错', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true, 扩展名: '.docx' }),
        office: { readDocx: vi.fn().mockResolvedValue({ 成功: false, 错误: '压缩包损坏' }) },
      },
    })
    await expect(读取本地文件内容('C:\\资料\\报告.docx')).rejects.toThrow('压缩包损坏')
  })

  it('读取表格时保留全部工作表而非仅首表', async () => {
    const 工作表列表 = [
      { 名称: '汇总', html: '<table><tr><td>1</td></tr></table>' },
      { 名称: '明细', html: '<table><tr><td>2</td></tr></table>' },
    ]
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true, 扩展名: '.xlsx' }),
        office: { readXlsx: vi.fn().mockResolvedValue({ 成功: true, html: 工作表列表[0].html, 工作表列表, 警告: ['图表尚未导入'] }) },
      },
    })
    const 结果 = await 读取本地文件内容('C:\\资料\\账本.xlsx')
    expect(结果.工作表列表).toHaveLength(2)
    expect(结果.工作表列表?.map((工作表) => '名称' in 工作表 ? 工作表.名称 : 工作表.name)).toEqual(['汇总', '明细'])
    expect(结果.工作表列表?.map((工作表) => 'html' in 工作表 ? 工作表.html : undefined)).toEqual([
      '<table><tbody><tr><td>1</td></tr></tbody></table>',
      '<table><tbody><tr><td>2</td></tr></tbody></table>',
    ])
    expect(结果.警告).toEqual(['图表尚未导入'])
  })

  it('文字文档保留解析器的未导入内容警告', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true, 扩展名: '.docx' }),
        office: { readDocx: vi.fn().mockResolvedValue({ 成功: true, html: '<p>正文</p>', 警告: ['图片尚未导入'] }) },
      },
    })
    await expect(读取本地文件内容('C:\\资料\\报告.docx')).resolves.toEqual({ 类型: 'word', 内容: '<p>正文</p>', 警告: ['图片尚未导入'] })
  })

  it('文字文档把页面设置交给打开链路', async () => {
    const 页面设置 = { 纸张: 'A5', 纸张方向: '横向', 页边距: '窄', 分栏: '两栏', 水印: '无', 页面边框: '方框', 页面颜色: '#FFF2CC', 文字方向: '竖排' }
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true, 扩展名: '.docx' }),
        office: { readDocx: vi.fn().mockResolvedValue({ 成功: true, html: '<p>正文</p>', 页面设置 }) },
        recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 打开 = vi.fn()
    await 通过路径打开文件('C:\\资料\\页面.docx', { info: vi.fn(), success: vi.fn() }, { error: vi.fn() }, 打开)
    expect(打开).toHaveBeenCalledWith('word', '<p>正文</p>', 'C:\\资料\\页面.docx', undefined, 页面设置)
  })

  it('演示文稿保留解析器的未导入内容警告', async () => {
    const 演示文稿 = { 幻灯片列表: [{ 标识: '第一页' }] }
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true, 扩展名: '.pptx' }),
        office: { readPptx: vi.fn().mockResolvedValue({ 成功: true, 演示文稿, 警告: ['图片尚未导入'] }) },
      },
    })
    await expect(读取本地文件内容('C:\\资料\\演示.pptx')).resolves.toEqual({ 类型: 'ppt', 演示文稿, 警告: ['图片尚未导入'] })
  })

  it('CSV 文件进入表格模块并保留引号中的逗号与换行', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: '姓名,说明\r\n张三,"甲,乙\n<script>"', 二进制: false, 扩展名: '.csv' }) },
    })
    const 结果 = await 读取本地文件内容('C:\\资料\\人员.csv')
    expect(结果.类型).toBe('table')
    expect(结果.内容).toContain('<td data-value-type="text">甲,乙\n&lt;script&gt;</td>')
    expect(结果.内容).not.toContain('<script>')
  })

  it('CSV 中的公式样式内容和前导零保持为文本单元格', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: '编号,内容\r\n0012,=1+1', 二进制: false, 扩展名: '.csv' }) },
    })
    const 结果 = await 读取本地文件内容('C:\\资料\\原始数据.csv')
    expect(结果.内容).toContain('<td data-value-type="text">0012</td>')
    expect(结果.内容).toContain('<td data-value-type="text">=1+1</td>')
  })

  it.each(['txt', 'md', 'json'])('%s 文本转义标签后进入文字模块', async (扩展) => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: '<img src=x onerror=alert(1)>\n第二行', 二进制: false, 扩展名: `.${扩展}` }) },
    })
    const 结果 = await 读取本地文件内容(`C:\\资料\\内容.${扩展}`)
    expect(结果.类型).toBe('word')
    expect(结果.内容).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(结果.内容).not.toContain('<img')
  })

  it('旧版工作表数组 JSON 从公共打开链路进入表格并保留模型和文件指纹', async () => {
    const 工作表列表 = [写入单元格(创建工作表('预算'), 'A1', '42')]
    const 路径 = 'C:\\资料\\预算.json'
    const 最近 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: JSON.stringify(工作表列表), 二进制: false, 扩展名: '.json', 文件指纹: '旧版指纹' }),
        recentAdd: 最近,
      },
    })
    const 打开 = vi.fn()
    const 弹窗 = { error: vi.fn() }
    const 已打开 = await 通过路径打开文件(路径, { info: vi.fn(), success: vi.fn() }, 弹窗, 打开)
    expect(已打开).toBe(true)
    expect(打开).toHaveBeenCalledWith('table', 工作表列表, 路径, undefined, undefined, '旧版指纹')
    expect(最近).toHaveBeenCalledWith(expect.objectContaining({ 路径, 类型: 'table' }))
    expect(弹窗.error).not.toHaveBeenCalled()
  })

  it('普通 JSON 对象和普通数组仍作为转义后的文字打开', async () => {
    const 读取 = vi.fn()
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { readFile: 读取 } })
    for (const 内容 of ['{"标题":"<脚本>"}', '[{"名称":"列表"}]', '[{"单元格":["甲","乙"]}]']) {
      读取.mockResolvedValueOnce({ 成功: true, 内容, 二进制: false, 扩展名: '.json' })
      const 结果 = await 读取本地文件内容('C:\\资料\\内容.json')
      expect(结果.类型).toBe('word')
      expect(保存为纯文本(结果.内容 ?? '')).toBe(内容)
      expect(结果.内容).not.toContain('<脚本>')
    }
  })

  it('损坏的旧版工作表 JSON 明确报错，不作为文字静默打开', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: '[{"id":"sheet-1","name":"预算","单元格":{},"行数":100,"列数":26,"列宽":[]}]', 二进制: false, 扩展名: '.json' }) },
    })
    await expect(读取本地文件内容('C:\\资料\\损坏.json')).rejects.toThrow('旧版表格文件结构不正确')
  })

  it.each([
    ['txt', '第一行\r\n\r\n第三行\r\n'],
    ['md', '甲\r乙\r'],
    ['json', '{\r\n  "项目": "预算"\r\n}\r\n'],
    ['txt', '甲\r\n乙\n丙\r丁'],
  ])('%s 文件打开后直接保存可保留原换行字节', async (扩展, 原文) => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 原文, 二进制: false, 扩展名: `.${扩展}` }) },
    })
    const 结果 = await 读取本地文件内容(`C:\\资料\\内容.${扩展}`)
    expect(结果.类型).toBe('word')
    expect(保存为纯文本(结果.内容 ?? '')).toBe(原文)
  })

  it('纯文本编辑已有行及新增行后沿用来源换行风格', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: '甲\r\n乙\r\n', 二进制: false, 扩展名: '.txt' }) },
    })
    const 结果 = await 读取本地文件内容('C:\\资料\\内容.txt')
    const 更新 = (结果.内容 ?? '').replace('乙', '新内容').replace(/<\/p>$/, '</p><p>新增</p>')
    expect(保存为纯文本(更新)).toBe('甲\r\n新内容\r\n\r\n新增')
  })

  it('网页富文本导入时保留正文格式并移除可执行内容', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { readFile: vi.fn().mockResolvedValue({
        成功: true,
        内容: '<h2 style="text-align:center">标题</h2><table><tr><td><strong>数据</strong></td></tr></table><img src="x" onerror="window.electronAPI.readFile(\'C:/secret\')"><a href="javascript:alert(1)">链接</a><script>alert(1)</script>',
        二进制: false,
        扩展名: '.html',
      }) },
    })
    const 结果 = await 读取本地文件内容('C:\\资料\\文档.html')
    expect(结果.类型).toBe('word')
    expect(结果.内容).toContain('style="text-align:center"')
    expect(结果.内容).toContain('<table>')
    expect(结果.内容).toContain('<strong>数据</strong>')
    expect(结果.内容).not.toMatch(/onerror|javascript:|<script/i)
    expect(结果.警告).toContain('HTML 的页面样式、脚本及元数据未完整导入，不能直接覆盖来源文件')
  })

  it('PDF 文件按二进制交给阅读工作台', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'JVBERi0=', 二进制: true, 扩展名: '.pdf' }) },
    })
    await expect(读取本地文件内容('C:\\资料\\说明.pdf')).resolves.toEqual({ 类型: 'pdf', 内容: 'JVBERi0=' })
  })

  it('从系统对话框打开时把真实路径传给编辑器', async () => {
    const 路径 = 'C:\\资料\\报告.docx'
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        showOpenDialog: vi.fn().mockResolvedValue(路径),
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true, 扩展名: '.docx' }),
        office: { readDocx: vi.fn().mockResolvedValue({ 成功: true, html: '<p>正文</p>' }) },
        recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      },
    })
    const 消息 = { info: vi.fn(), success: vi.fn(), error: vi.fn() }
    const 弹窗 = { error: vi.fn() }
    const 打开 = vi.fn()
    const 已打开 = await 通过对话框打开文件(消息, 弹窗, 打开)
    expect(打开).toHaveBeenCalledWith('word', '<p>正文</p>', 路径, undefined)
    expect(弹窗.error).not.toHaveBeenCalled()
    expect(已打开).toBe(true)
  })

  it('系统文件关联传来的路径复用解析和标签创建链路', async () => {
    const 路径 = 'C:\\资料\\报告.docx'
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true, 扩展名: '.docx' }),
        office: { readDocx: vi.fn().mockResolvedValue({ 成功: true, html: '<p>正文</p>' }) },
        recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      },
    })
    const 打开 = vi.fn()
    const 已打开 = await 通过路径打开文件(路径, { info: vi.fn(), success: vi.fn() }, { error: vi.fn() }, 打开)
    expect(打开).toHaveBeenCalledWith('word', '<p>正文</p>', 路径, undefined)
    expect(已打开).toBe(true)
  })

  it('从系统对话框打开时把保真警告传给编辑器', async () => {
    const 路径 = 'C:\\资料\\报告.docx'
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        showOpenDialog: vi.fn().mockResolvedValue(路径),
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true, 扩展名: '.docx' }),
        office: { readDocx: vi.fn().mockResolvedValue({ 成功: true, html: '<p>正文</p>', 警告: ['图片尚未导入'] }) },
        recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      },
    })
    const 打开 = vi.fn()
    await 通过对话框打开文件({ info: vi.fn(), success: vi.fn() }, { error: vi.fn() }, 打开)
    expect(打开).toHaveBeenCalledWith('word', '<p>正文</p>', 路径, ['图片尚未导入'])
  })

  it('打开失败时展示友好弹窗，不调用编辑器', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\损坏.docx'),
        readFile: vi.fn().mockResolvedValue({ 成功: false, 错误: '没有读取权限' }),
      },
    })
    const 消息 = { info: vi.fn(), success: vi.fn(), error: vi.fn() }
    const 弹窗 = { error: vi.fn() }
    const 打开 = vi.fn()
    const 已打开 = await 通过对话框打开文件(消息, 弹窗, 打开)
    expect(打开).not.toHaveBeenCalled()
    expect(弹窗.error).toHaveBeenCalledWith(expect.objectContaining({ title: '打开文件失败', content: expect.stringContaining('没有读取权限') }))
    expect(已打开).toBe(false)
  })

  it('最近记录落盘结束后完成打开且不显示成功提示', async () => {
    let 完成记录!: (结果: { 成功: boolean }) => void
    const 记录请求 = new Promise<{ 成功: boolean }>((完成) => { 完成记录 = 完成 })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\记录.txt'),
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: '正文', 二进制: false, 扩展名: '.txt' }),
        recentAdd: vi.fn().mockReturnValue(记录请求),
      },
    })
    const 打开 = vi.fn()
    let 已完成 = false
    const 消息 = { info: vi.fn(), success: vi.fn() }
    const 弹窗 = { error: vi.fn() }
    const 打开过程 = 通过对话框打开文件(消息, 弹窗, 打开).then((结果) => {
      已完成 = true
      return 结果
    })
    await vi.waitFor(() => expect(打开).toHaveBeenCalledTimes(1))
    expect(已完成).toBe(false)
    完成记录({ 成功: true })
    await expect(打开过程).resolves.toBe(true)
    expect(消息.info).not.toHaveBeenCalled()
    expect(消息.success).not.toHaveBeenCalled()
    expect(弹窗.error).not.toHaveBeenCalled()
  })

  it('最近记录写入失败时展示错误弹窗', async () => {
    const 提示 = vi.spyOn(Modal, 'warning').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }))
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { recentAdd: vi.fn().mockResolvedValue({ 成功: false, 错误: '记录文件损坏' }) },
    })
    await expect(记录最近文档('C:\\资料\\报告.docx', '报告.docx', 'word')).resolves.toBe(false)
    expect(提示).toHaveBeenCalledWith(expect.objectContaining({ title: '最近文档记录未更新', content: expect.stringContaining('记录文件损坏') }))
  })

  it('应用外壳注册弹窗后最近记录失败使用主题内弹窗', async () => {
    const 提示 = vi.fn()
    const 取消注册 = 注册最近文档错误弹窗(提示)
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { recentAdd: vi.fn().mockResolvedValue({ 成功: false, 错误: '记录文件损坏' }) },
    })
    try {
      await expect(记录最近文档('C:\\资料\\报告.docx', '报告.docx', 'word')).resolves.toBe(false)
      expect(提示).toHaveBeenCalledWith({ title: '最近文档记录未更新', content: '文件操作已完成，但最近文档列表未更新：记录文件损坏' })
    } finally {
      取消注册()
    }
  })

  it('打开成功而最近记录失败时仅显示非致命警告，不同时报打开成功', async () => {
    const 路径 = 'C:\\资料\\报告.txt'
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: '正文', 二进制: false, 扩展名: '.txt' }),
      recentAdd: vi.fn().mockResolvedValue({ 成功: false, 错误: '记录文件损坏' }),
    } })
    const 警告 = vi.fn()
    const 取消注册 = 注册最近文档错误弹窗(警告)
    const 消息 = { info: vi.fn(), success: vi.fn() }
    const 弹窗 = { error: vi.fn() }
    const 打开 = vi.fn()
    try {
      await expect(通过路径打开文件(路径, 消息, 弹窗, 打开)).resolves.toBe(true)
      expect(打开).toHaveBeenCalledTimes(1)
      expect(警告).toHaveBeenCalledWith(expect.objectContaining({ title: '最近文档记录未更新' }))
      expect(消息.success).not.toHaveBeenCalled()
      expect(弹窗.error).not.toHaveBeenCalled()
    } finally {
      取消注册()
    }
  })
})
