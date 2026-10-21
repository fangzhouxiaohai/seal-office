// 文件命令测试：打开、保存、导出
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { createElement } from 'react'
import { App as AntdApp, Modal } from 'antd'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { 命令表 } from './commands'
import { 读取本地文件内容 } from '../fileOpen'
import { 净化富文本 } from './sanitizeHtml'
import { AppProvider, useAppStore, type AppState } from '../store'

const 原生编解码器 = createRequire(import.meta.url)('../../../main/office/sealFormat.js')

const 页面视图 = {
  纸张: 'A4', 纸张方向: '纵向', 页边距: '常规', 分栏: '一栏', 水印: '无',
  页面边框: '无', 页面颜色: '无', 文字方向: '横排',
}

describe('文件命令', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI')
    Modal.destroyAll()
  })

  describe('file.open 打开文件命令', () => {
    it('应该存在 file.open 命令', () => {
      expect(命令表['file.open']).toBeDefined()
      expect(命令表['file.open'].label).toBe('打开文件')
    })

    it.each([false, true])('从工具栏打开带警告文字文件先确认转换或取消，不覆盖当前未保存正文（转换=%s）', async 转换 => {
      const 路径 = 'C:\\资料\\第二份.docx'
      const 副本路径 = 'C:\\资料\\第二份.sldoc'
      const 原件字节 = Buffer.from('原DOCX测试字节，不可改写')
      const 文件 = new Map<string, Buffer>([[路径, 原件字节]])
      const 指纹 = (数据: Buffer) => createHash('sha256').update(数据).digest('hex')
      let 状态!: AppState
      const 打开新文档 = vi.fn((类型: any, 内容: unknown, 新路径: string, 警告?: string[], 页面设置?: any, 文件指纹?: string) => {
        状态.createDoc(类型, 内容, { 路径: 新路径, 警告, 页面设置, 文件指纹 })
      })
      const 应用内容 = vi.fn()
      const 设置文档路径 = vi.fn()
      const 另存位置 = vi.fn().mockResolvedValue(副本路径)
      const 保存 = vi.fn(async (目标: string, 数据: string, 格式: string) => {
        expect(目标).toBe(副本路径); expect(格式).toBe('二进制')
        文件.set(目标, Buffer.from(数据, 'base64'))
        return { 成功: true, 文件指纹: 指纹(文件.get(目标)!) }
      })
      const 读取 = vi.fn(async (目标: string) => {
        const 数据 = 文件.get(目标)
        if (!数据) return { 成功: false, 错误: '文件尚未写出，不能打开内存副本' }
        return { 成功: true, 二进制: true, 内容: 数据.toString('base64'), 扩展名: 目标 === 路径 ? '.docx' : '.sldoc', 文件指纹: 指纹(数据) }
      })
      const 编码 = vi.fn(async (类型: string, 数据: unknown) => ({ 成功: true, 数据: (await 原生编解码器.writeSeal(类型, 数据)).toString('base64') }))
      const 解码 = vi.fn(async (扩展: string, 数据: string) => ({ 成功: true, ...await 原生编解码器.readSeal(扩展, Buffer.from(数据, 'base64')) }))
      ;(window as any).electronAPI = {
        showOpenDialog: vi.fn().mockResolvedValue(路径),
        showSaveDialog: 另存位置, saveToFile: 保存, readFile: 读取,
        office: { readDocx: vi.fn().mockResolvedValue({ 成功: true, html: '<p>第二份正文</p>', 警告: ['图片尚未导入'] }), writeSeal: 编码, readSeal: 解码 },
        recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }), recentList: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }), backupClear: vi.fn().mockResolvedValue({ 成功: true }),
      }
      const 探针 = () => { 状态 = useAppStore(); return null }
      render(createElement(AntdApp, null, createElement(AppProvider, null, createElement(探针))))
      await vi.waitFor(() => expect(状态.启动恢复结束).toBe(true))
      act(() => 状态.createDoc('word', '<p>第一份已保存正文</p>', { 路径: 'C:\\资料\\第一份.docx' }))
      const 第一份标识 = 状态.activeDocumentId!
      act(() => 状态.updateEditorHtml(第一份标识, '<p>第一份未保存正文</p>'))
      命令表['file.open'].run({
        当前文档名: '第一份.docx',
        读取内容: () => 状态.documents.find(项 => 项.id === 第一份标识)!.html,
        打开新文档,
        应用内容,
        设置文档路径,
        notify: vi.fn(),
        history: { record: vi.fn() },
      } as any)
      const 对话框 = await screen.findByRole('dialog', { name: '此文件需要转换后打开' })
      expect(within(对话框).getByText('图片尚未导入')).toBeInTheDocument()
      expect(打开新文档).not.toHaveBeenCalled(); expect(另存位置).not.toHaveBeenCalled(); expect(保存).not.toHaveBeenCalled()
      await userEvent.click(within(对话框).getByRole('button', { name: 转换 ? '转换为海豹格式' : '取消打开' }))
      if (转换) {
        await vi.waitFor(() => expect(打开新文档).toHaveBeenCalledWith('word', '<p>第二份正文</p>', 副本路径, ['图片尚未导入'], undefined, 指纹(文件.get(副本路径)!)))
        expect(另存位置).toHaveBeenCalledWith('第二份.sldoc', 'word')
        expect(保存).toHaveBeenCalledOnce(); expect(编码).toHaveBeenCalledOnce(); expect(解码).toHaveBeenCalledOnce()
        expect(读取.mock.calls.map(([目标]) => 目标)).toEqual([路径, 副本路径])
        expect(await 原生编解码器.readSeal('sldoc', 文件.get(副本路径))).toMatchObject({ 类型: 'word', html: '<p>第二份正文</p>', 警告: ['图片尚未导入'] })
        expect(状态.documents).toHaveLength(2)
        const 第二份 = 状态.documents.find(项 => 项.id !== 第一份标识)!
        expect(第二份).toMatchObject({ name: '第二份.sldoc', html: '<p>第二份正文</p>', 来源路径: 副本路径, 警告: ['图片尚未导入'], 文件指纹: 指纹(文件.get(副本路径)!) })
        expect(状态.文档路径[第二份.id]).toBe(副本路径)
        expect(状态.workspaceTabs.find(项 => 项.id === 第二份.id)?.dirty).toBe(false)
      } else {
        await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: '此文件需要转换后打开' })).toBeNull())
        expect(打开新文档).not.toHaveBeenCalled(); expect(另存位置).not.toHaveBeenCalled(); expect(保存).not.toHaveBeenCalled()
        expect(编码).not.toHaveBeenCalled(); expect(解码).not.toHaveBeenCalled()
        expect(状态.documents).toHaveLength(1); expect(状态.activeDocumentId).toBe(第一份标识)
      }
      expect(应用内容).not.toHaveBeenCalled()
      expect(设置文档路径).not.toHaveBeenCalled()
      expect(状态.documents.find(项 => 项.id === 第一份标识)?.html).toBe('<p>第一份未保存正文</p>')
      expect(状态.workspaceTabs.find(项 => 项.id === 第一份标识)?.dirty).toBe(true)
      expect(文件.get(路径)).toBe(原件字节)
      expect(文件.get(路径)?.toString()).toBe('原DOCX测试字节，不可改写')
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
        view: 页面视图,
        读取内容: () => '<p>正文</p>',
        显示文件错误,
        设置文档路径: vi.fn(),
        notify: vi.fn(),
      } as any)
      await vi.waitFor(() => expect(显示文件错误).toHaveBeenCalledWith('保存失败', '磁盘已满'))
    })

    it('保存纯文本文件时写入正文而非编辑器 HTML，并保留空行', async () => {
      const 写入 = vi.fn().mockResolvedValue({ 成功: true })
      ;(window as any).electronAPI = { saveToFile: 写入 }
      命令表['file.save'].run({
        当前文档名: '笔记.txt', 当前文档路径: 'C:\\资料\\笔记.txt',
        读取内容: () => '<p>第一行</p><p><br></p><p>第三行</p><p><br></p>',
        设置文档路径: vi.fn(), notify: vi.fn(),
      } as any)
      await vi.waitFor(() => expect(写入).toHaveBeenCalledWith('C:\\资料\\笔记.txt', '第一行\n\n第三行\n', '文本'))
    })

    it('打开后编辑 TXT、MD、JSON 再保存时保留原文件换行方式', async () => {
      for (const [扩展, 原文, 原值, 新值, 预期] of [
        ['txt', '甲\r\n乙\r\n', '乙', '新乙', '甲\r\n新乙\r\n'],
        ['md', '甲\r乙\r', '乙', '新乙', '甲\r新乙\r'],
        ['json', '{\r\n"值":1\r\n}', '1', '2', '{\r\n"值":2\r\n}'],
      ]) {
        const 路径 = `C:\\资料\\内容.${扩展}`
        const 写入 = vi.fn().mockResolvedValue({ 成功: true })
        Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
          readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 原文, 二进制: false, 扩展名: `.${扩展}` }),
          saveToFile: 写入,
        } })
        const 读取 = await 读取本地文件内容(路径)
        const 修改后Html = 净化富文本((读取.内容 ?? '').replace(原值, 新值))
        命令表['file.save'].run({
          当前文档名: `内容.${扩展}`, 当前文档路径: 路径,
          读取内容: () => 修改后Html,
          设置文档路径: vi.fn(), notify: vi.fn(),
        } as any)
        await vi.waitFor(() => expect(写入).toHaveBeenCalledWith(路径, 预期, '文本'))
      }
    })

    it('纯文本包含格式时阻止覆盖原文件', async () => {
      const 写入 = vi.fn()
      const 错误 = vi.fn()
      ;(window as any).electronAPI = { saveToFile: 写入 }
      命令表['file.save'].run({
        当前文档名: '笔记.txt', 当前文档路径: 'C:\\资料\\笔记.txt',
        读取内容: () => '<p><strong>加粗内容</strong></p>',
        显示文件错误: 错误, notify: vi.fn(),
      } as any)
      await vi.waitFor(() => expect(错误).toHaveBeenCalledWith('保存失败', expect.stringContaining('纯文本格式无法保存')))
      expect(写入).not.toHaveBeenCalled()
    })

    it('导入有未保真内容时禁止直接覆盖来源文件', async () => {
      const 写入 = vi.fn()
      const 提示 = vi.fn()
      ;(window as any).electronAPI = { saveToFile: 写入, office: { writeDocx: vi.fn() } }
      命令表['file.save'].run({
        当前文档名: '报告.docx',
        当前文档路径: 'C:\\资料\\报告.docx',
        view: 页面视图,
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
        view: 页面视图,
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
      await vi.waitFor(() => expect(上下文.设置文档路径).toHaveBeenCalledWith(
        'C:\\资料\\副本.docx',
        '<p>已修改</p>',
        undefined,
        expect.objectContaining({ 纸张: 页面视图.纸张, 纸张方向: 页面视图.纸张方向 }),
      ))
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
      expect(mock设置路径).not.toHaveBeenCalled()
      expect(mock通知).toHaveBeenCalledWith('PDF 已保存到：C:\\test\\doc.pdf')
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

    it('导出 PDF 后打开实际文件标签且不改写文字标签的路径', async () => {
      const 打开新文档 = vi.fn()
      const 设置文档路径 = vi.fn()
      ;(window as any).electronAPI = {
        exportToPdf: vi.fn().mockResolvedValue({ 成功: true, 路径: 'C:\\资料\\结果.pdf' }),
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'JVBERi0=', 二进制: true, 扩展名: '.pdf' }),
        recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      }
      命令表['file.exportPdf'].run({
        当前文档名: '报告.docx', 读取内容: () => '<p>正文</p>',
        打开新文档, 设置文档路径, notify: vi.fn(),
      } as any)
      await vi.waitFor(() => expect(打开新文档).toHaveBeenCalledWith('pdf', 'JVBERi0=', 'C:\\资料\\结果.pdf'))
      expect(设置文档路径).not.toHaveBeenCalled()
    })
  })
})
