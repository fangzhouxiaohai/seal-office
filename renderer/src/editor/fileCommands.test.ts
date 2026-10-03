// 文件命令测试：打开、保存、导出
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 命令表 } from './commands'

describe('文件命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI')
  })

  describe('file.open 打开文件命令', () => {
    it('应该存在 file.open 命令', () => {
      expect(命令表['file.open']).toBeDefined()
      expect(命令表['file.open'].label).toBe('打开文件')
    })

    it('从工具栏打开文字文件时新建标签，不覆盖当前编辑内容', async () => {
      const 路径 = 'C:\\资料\\第二份.docx'
      const 打开新文档 = vi.fn()
      const 应用内容 = vi.fn()
      ;(window as any).electronAPI = {
        showOpenDialog: vi.fn().mockResolvedValue(路径),
        readFile: vi.fn().mockResolvedValue({ 成功: true, 二进制: true, 内容: 'AA==', 扩展名: '.docx' }),
        office: { readDocx: vi.fn().mockResolvedValue({ 成功: true, html: '<p>第二份正文</p>', 警告: ['图片尚未导入'] }) },
        recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      }
      命令表['file.open'].run({
        当前文档名: '第一份.docx',
        读取内容: () => '<p>第一份未保存正文</p>',
        打开新文档,
        应用内容,
        设置文档路径: vi.fn(),
        notify: vi.fn(),
        history: { record: vi.fn() },
      } as any)
      await vi.waitFor(() => expect(打开新文档).toHaveBeenCalledWith('word', '<p>第二份正文</p>', 路径, ['图片尚未导入']))
      expect(应用内容).not.toHaveBeenCalled()
    })

    it('应该在 Electron 环境中调用打开对话框', () => {
      const mockShowOpenDialog = vi.fn().mockResolvedValue('C:\\test\\document.txt')
      const mockReadFile = vi.fn().mockResolvedValue({ 成功: true, 内容: '测试内容', 二进制: false, 扩展名: '.txt' })
      const mock应用内容 = vi.fn()
      const mock刷新 = vi.fn()
      const mock通知 = vi.fn()

      // 模拟 electronAPI
      ;(window as any).electronAPI = {
        showOpenDialog: mockShowOpenDialog,
        readFile: mockReadFile,
        recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      }

      const 上下文 = {
        root: document.createElement('div'),
        history: {
          record: vi.fn(),
          撤销: vi.fn(),
          重做: vi.fn(),
        },
        refresh: mock刷新,
        notify: mock通知,
        view: {},
        setView: vi.fn(),
        执行格式化: vi.fn(),
        查询格式: vi.fn(),
        应用内容: mock应用内容,
        插入内容: vi.fn(),
        读取内容: vi.fn().mockReturnValue('<p>当前内容</p>'),
        下载: vi.fn(),
        打开查找: vi.fn(),
        导出: vi.fn(),
        检查拼写: vi.fn(),
        切换全选: vi.fn(),
        插入资源: vi.fn(),
        设置段落样式: vi.fn(),
        应用样式: vi.fn(),
        切换段落类名: vi.fn(),
        读取选区格式: vi.fn(),
        应用选区格式: vi.fn(),
        格式刷暂存: { 值: null },
        当前文档名: '未命名文档.docx',
        打开新文档: vi.fn(),
        打开表格网格: vi.fn(),
        打开文献管理: vi.fn(),
        打开比较面板: vi.fn(),
        文献列表: [],
        管理文献: vi.fn(),
        插入文献: vi.fn(),
        更新脚注: vi.fn(),
        生成目录: vi.fn(),
        插入题注: vi.fn(),
        插入交叉引用: vi.fn(),
        生成参考文献列表: vi.fn(),
        插入图表目录: vi.fn(),
        插入索引: vi.fn(),
        插入目录: vi.fn(),
        接受修订: vi.fn(),
        拒绝修订: vi.fn(),
        显示批注: vi.fn(),
        保护文档: vi.fn(),
        插入域: vi.fn(),
        插入书签: vi.fn(),
        插入分页符: vi.fn(),
        插入分节符: vi.fn(),
        插入页眉: vi.fn(),
        插入页脚: vi.fn(),
        插入文本框: vi.fn(),
        插入图片: vi.fn(),
        插入表格: vi.fn(),
        插入形状: vi.fn(),
        插入SmartArt: vi.fn(),
        插入艺术字: vi.fn(),
        插入超链接: vi.fn(),
        插入注释: vi.fn(),
        插入批注: vi.fn(),
        当前视图状态: '页面视图',
        标尺可见: true,
        网格线可见: false,
        段落标记可见: false,
        缩放比例: 100,
      } as any

      // 执行命令
      命令表['file.open'].run(上下文)

      // 验证调用了打开对话框
      expect(mockShowOpenDialog).toHaveBeenCalled()
    })
  })

  describe('file.save 保存命令', () => {
    it('应该存在 file.save 命令', () => {
      expect(命令表['file.save']).toBeDefined()
      expect(命令表['file.save'].label).toBe('保存')
    })

    it('保存失败通过友好弹窗展示真实原因', async () => {
      const 显示文件错误 = vi.fn()
      ;(window as any).electronAPI = {
        saveToFile: vi.fn().mockResolvedValue({ 成功: false, 错误: '磁盘已满' }),
        office: { writeDocx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'YQ==' }) },
      }
      命令表['file.save'].run({
        当前文档名: '报告.docx',
        当前文档路径: 'C:\\资料\\报告.docx',
        读取内容: () => '<p>正文</p>',
        显示文件错误,
        设置文档路径: vi.fn(),
        notify: vi.fn(),
      } as any)
      await vi.waitFor(() => expect(显示文件错误).toHaveBeenCalledWith('保存失败', '磁盘已满'))
    })

    it('导入有未保真内容时禁止直接覆盖来源文件', async () => {
      const 写入 = vi.fn()
      const 提示 = vi.fn()
      ;(window as any).electronAPI = { saveToFile: 写入, office: { writeDocx: vi.fn() } }
      命令表['file.save'].run({
        当前文档名: '报告.docx',
        当前文档路径: 'C:\\资料\\报告.docx',
        保真风险: { 来源路径: 'C:\\资料\\报告.docx', 警告: ['图片尚未导入'] },
        提示保真风险: 提示,
        读取内容: () => '<p>已修改</p>',
        notify: vi.fn(),
      } as any)
      await new Promise((完成) => setTimeout(完成, 0))
      expect(写入).not.toHaveBeenCalled()
      expect(提示).toHaveBeenCalledWith(['图片尚未导入'])
    })

    it('另存为必须避开来源路径，用户确认后才写入新文件', async () => {
      const 写入 = vi.fn().mockResolvedValue({ 成功: true })
      const 选择路径 = vi.fn().mockResolvedValueOnce('C:\\资料\\报告.docx').mockResolvedValueOnce('C:\\资料\\副本.docx').mockResolvedValueOnce('C:\\资料\\副本.docx')
      const 确认 = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      const 提示 = vi.fn()
      ;(window as any).electronAPI = {
        showSaveDialog: 选择路径,
        saveToFile: 写入,
        office: { writeDocx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'YQ==' }) },
      }
      const 上下文 = {
        当前文档名: '报告.docx',
        当前文档路径: 'C:\\资料\\报告.docx',
        保真风险: { 来源路径: 'C:\\资料\\报告.docx', 警告: ['图片尚未导入'] },
        提示保真风险: 提示,
        确认保真另存: 确认,
        读取内容: () => '<p>已修改</p>',
        设置文档路径: vi.fn(),
        notify: vi.fn(),
      } as any
      命令表['file.saveAs'].run(上下文)
      await new Promise((完成) => setTimeout(完成, 0))
      expect(写入).not.toHaveBeenCalled()
      expect(提示).toHaveBeenCalledTimes(1)
      expect(确认).not.toHaveBeenCalled()

      命令表['file.saveAs'].run(上下文)
      await new Promise((完成) => setTimeout(完成, 0))
      expect(写入).not.toHaveBeenCalled()
      expect(确认).toHaveBeenCalledTimes(1)

      命令表['file.saveAs'].run(上下文)
      await vi.waitFor(() => expect(写入).toHaveBeenCalledWith('C:\\资料\\副本.docx', expect.any(Uint8Array), '二进制'))
      expect(上下文.设置文档路径).toHaveBeenCalledWith('C:\\资料\\副本.docx', '<p>已修改</p>')
    })

    it('应该在 Electron 环境中调用保存对话框', () => {
      const mockShowSaveDialog = vi.fn().mockResolvedValue('C:\\test\\document.docx')
      const mockSaveToFile = vi.fn().mockResolvedValue({ 成功: true })
      const mock通知 = vi.fn()

      // 模拟 electronAPI
      ;(window as any).electronAPI = {
        showSaveDialog: mockShowSaveDialog,
        saveToFile: mockSaveToFile,
      }

      const 上下文 = {
        root: document.createElement('div'),
        history: {
          record: vi.fn(),
          撤销: vi.fn(),
          重做: vi.fn(),
        },
        refresh: vi.fn(),
        notify: mock通知,
        view: {},
        setView: vi.fn(),
        执行格式化: vi.fn(),
        查询格式: vi.fn(),
        应用内容: vi.fn(),
        插入内容: vi.fn(),
        读取内容: vi.fn().mockReturnValue('<p>测试内容</p>'),
        下载: vi.fn(),
        打开查找: vi.fn(),
        导出: vi.fn(),
        检查拼写: vi.fn(),
        切换全选: vi.fn(),
        插入资源: vi.fn(),
        设置段落样式: vi.fn(),
        应用样式: vi.fn(),
        切换段落类名: vi.fn(),
        读取选区格式: vi.fn(),
        应用选区格式: vi.fn(),
        格式刷暂存: { 值: null },
        当前文档名: 'document.docx',
        打开表格网格: vi.fn(),
        打开文献管理: vi.fn(),
        打开比较面板: vi.fn(),
        文献列表: [],
        管理文献: vi.fn(),
        插入文献: vi.fn(),
        更新脚注: vi.fn(),
        生成目录: vi.fn(),
        插入题注: vi.fn(),
        插入交叉引用: vi.fn(),
        生成参考文献列表: vi.fn(),
        插入图表目录: vi.fn(),
        插入索引: vi.fn(),
        插入目录: vi.fn(),
        接受修订: vi.fn(),
        拒绝修订: vi.fn(),
        显示批注: vi.fn(),
        保护文档: vi.fn(),
        插入域: vi.fn(),
        插入书签: vi.fn(),
        插入分页符: vi.fn(),
        插入分节符: vi.fn(),
        插入页眉: vi.fn(),
        插入页脚: vi.fn(),
        插入文本框: vi.fn(),
        插入图片: vi.fn(),
        插入表格: vi.fn(),
        插入形状: vi.fn(),
        插入SmartArt: vi.fn(),
        插入艺术字: vi.fn(),
        插入超链接: vi.fn(),
        插入注释: vi.fn(),
        插入批注: vi.fn(),
        当前视图状态: '页面视图',
        标尺可见: true,
        网格线可见: false,
        段落标记可见: false,
        缩放比例: 100,
      } as any

      // 执行命令
      命令表['file.save'].run(上下文)

      // 验证调用了保存对话框
      expect(mockShowSaveDialog).toHaveBeenCalled()
    })

    it('保存为 .pdf 时必须走真实 PDF 导出链路，而非按文本写盘', async () => {
      const mockExportToPath = vi.fn().mockResolvedValue({ 成功: true, 路径: 'C:\\test\\doc.pdf' })
      const mockSaveToFile = vi.fn()
      const mock通知 = vi.fn()
      const mock设置路径 = vi.fn()

      ;(window as any).electronAPI = {
        saveToFile: mockSaveToFile,
        pdf: { exportToPath: mockExportToPath },
      }

      const 上下文 = {
        root: document.createElement('div'),
        history: { record: vi.fn(), 撤销: vi.fn(), 重做: vi.fn() },
        notify: mock通知,
        view: {},
        setView: vi.fn(),
        读取内容: vi.fn().mockReturnValue('<p>测试内容</p>'),
        当前文档名: 'doc.pdf',
        当前文档路径: 'C:\\test\\doc.pdf',
        设置文档路径: mock设置路径,
      } as any

      命令表['file.save'].run(上下文)
      // 等待 Promise 链完成
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockExportToPath).toHaveBeenCalledWith('<p>测试内容</p>', 'C:\\test\\doc.pdf')
      // 不允许把 HTML 文本写进 .pdf 扩展名文件
      expect(mockSaveToFile).not.toHaveBeenCalled()
      expect(mock设置路径).toHaveBeenCalledWith('C:\\test\\doc.pdf', '<p>测试内容</p>')
    })
  })

  describe('file.exportPdf 导出PDF命令', () => {
    it('应该存在 file.exportPdf 命令', () => {
      expect(命令表['file.exportPdf']).toBeDefined()
      expect(命令表['file.exportPdf'].label).toBe('导出为PDF')
    })

    it('应该在 Electron 环境中调用PDF导出', () => {
      const mockExportToPdf = vi.fn().mockResolvedValue({ 成功: true, 路径: 'C:\\test\\document.pdf' })
      const mock通知 = vi.fn()

      // 模拟 electronAPI
      ;(window as any).electronAPI = {
        exportToPdf: mockExportToPdf,
      }

      const 上下文 = {
        root: document.createElement('div'),
        history: {
          record: vi.fn(),
          撤销: vi.fn(),
          重做: vi.fn(),
        },
        refresh: vi.fn(),
        notify: mock通知,
        view: {},
        setView: vi.fn(),
        执行格式化: vi.fn(),
        查询格式: vi.fn(),
        应用内容: vi.fn(),
        插入内容: vi.fn(),
        读取内容: vi.fn().mockReturnValue('<p>测试内容</p>'),
        下载: vi.fn(),
        打开查找: vi.fn(),
        导出: vi.fn(),
        检查拼写: vi.fn(),
        切换全选: vi.fn(),
        插入资源: vi.fn(),
        设置段落样式: vi.fn(),
        应用样式: vi.fn(),
        切换段落类名: vi.fn(),
        读取选区格式: vi.fn(),
        应用选区格式: vi.fn(),
        格式刷暂存: { 值: null },
        当前文档名: 'document.docx',
        打开表格网格: vi.fn(),
        打开文献管理: vi.fn(),
        打开比较面板: vi.fn(),
        文献列表: [],
        管理文献: vi.fn(),
        插入文献: vi.fn(),
        更新脚注: vi.fn(),
        生成目录: vi.fn(),
        插入题注: vi.fn(),
        插入交叉引用: vi.fn(),
        生成参考文献列表: vi.fn(),
        插入图表目录: vi.fn(),
        插入索引: vi.fn(),
        插入目录: vi.fn(),
        接受修订: vi.fn(),
        拒绝修订: vi.fn(),
        显示批注: vi.fn(),
        保护文档: vi.fn(),
        插入域: vi.fn(),
        插入书签: vi.fn(),
        插入分页符: vi.fn(),
        插入分节符: vi.fn(),
        插入页眉: vi.fn(),
        插入页脚: vi.fn(),
        插入文本框: vi.fn(),
        插入图片: vi.fn(),
        插入表格: vi.fn(),
        插入形状: vi.fn(),
        插入SmartArt: vi.fn(),
        插入艺术字: vi.fn(),
        插入超链接: vi.fn(),
        插入注释: vi.fn(),
        插入批注: vi.fn(),
        当前视图状态: '页面视图',
        标尺可见: true,
        网格线可见: false,
        段落标记可见: false,
        缩放比例: 100,
      } as any

      // 执行命令
      命令表['file.exportPdf'].run(上下文)

      // 验证调用了PDF导出
      expect(mockExportToPdf).toHaveBeenCalled()
    })
  })
})
