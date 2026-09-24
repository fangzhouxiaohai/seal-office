// 文件命令测试：打开、保存、导出
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 命令表 } from './commands'

describe('文件命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('file.open 打开文件命令', () => {
    it('应该存在 file.open 命令', () => {
      expect(命令表['file.open']).toBeDefined()
      expect(命令表['file.open'].label).toBe('打开文件')
    })

    it('应该在 Electron 环境中调用打开对话框', () => {
      const mockShowOpenDialog = vi.fn().mockResolvedValue(['C:\\test\\document.docx'])
      const mockReadFile = vi.fn().mockResolvedValue({ 成功: true, 内容: '<p>测试内容</p>' })
      const mock应用内容 = vi.fn()
      const mock刷新 = vi.fn()
      const mock通知 = vi.fn()

      // 模拟 electronAPI
      ;(window as any).electronAPI = {
        showOpenDialog: mockShowOpenDialog,
        readFile: mockReadFile,
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
