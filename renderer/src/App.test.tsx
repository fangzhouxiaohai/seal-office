import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'node:module'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { theme } from 'antd'
import App, { 动态主题容器 } from './App'
import { RECENT_DOCS } from './mock/recentDocs'
import { 桥接 } from './ipc/bridge'
import { SettingsProvider, useSettings } from './store/settingsStore'
import { htmlToDocxModel } from './editor/commands'

const 加载模块 = createRequire(import.meta.url)
const { 生成docx } = 加载模块('../../main/office/docxWriter.js')
const { 读取docx } = 加载模块('../../main/office/docxReader.js')

/** 通过首页居中新建弹窗选择文档类型。 */
const 通过新建菜单创建 = async (名称: string) => {
  const 选项: Record<string, string> = { 新建文字: '文字文档', 新建表格: '电子表格', 新建演示: '演示文稿' }
  await userEvent.click(screen.getByRole('button', { name: '新建' }))
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(选项[名称] ?? 名称) }))
}

describe('应用外壳（WPS 版式首页）', () => {
  it.each(['首页打开', '最近列表'])('%s 重开真实 DOCX 时保留黑色标题和已保存状态', async (入口) => {
    const 原接口 = Object.getOwnPropertyDescriptor(window, 'electronAPI')
    const 数据 = await 生成docx(htmlToDocxModel('<h1 style="color:black">黑色标题</h1><p>文档正文</p>'))
    const 路径 = 'C:\\资料\\黑色标题.docx'
    const 读取 = vi.fn(async (内容: string) => ({ 成功: true, ...await 读取docx(Buffer.from(内容, 'base64')) }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      showOpenDialog: vi.fn().mockResolvedValue(路径),
      readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 数据.toString('base64'), 二进制: true, 扩展名: '.docx' }),
      office: { readDocx: 读取 },
      recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      recentList: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      backupClear: vi.fn().mockResolvedValue({ 成功: true }),
      reportUnsavedCount: vi.fn().mockResolvedValue({ 成功: true }),
    } })
    try {
      const { container } = render(<App 初始最近文档={[{
        id: '标题核验', name: '黑色标题.docx', type: 'word', 路径,
        size: 数据.length, updatedAt: '2026-10-04 12:00', starred: false, shared: false,
      }]} />)
      if (入口 === '首页打开') await userEvent.click(screen.getByRole('button', { name: '打开' }))
      else {
        await userEvent.click(screen.getByRole('button', { name: '列表视图' }))
        await userEvent.click(screen.getByRole('button', { name: '打开 黑色标题.docx' }))
      }
      const 标签 = await screen.findByRole('tab', { name: '黑色标题.docx' })
      const 标题 = container.querySelector('.wps-editor-canvas__content h1') as HTMLElement
      expect(标题).toHaveTextContent('黑色标题')
      expect(getComputedStyle(标题.querySelector('span')! as HTMLElement).color).toBe('rgb(0, 0, 0)')
      expect(读取).toHaveBeenCalledOnce()
      expect(标签.querySelector('.wps-global-tab__dirty')).toBeNull()
      expect(screen.queryByRole('dialog')?.textContent).toBeUndefined()
    } finally {
      if (原接口) Object.defineProperty(window, 'electronAPI', 原接口)
      else Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('自动恢复未保存工作区时保留正文和标记，不显示恢复提示', async () => {
    const 原接口 = Object.getOwnPropertyDescriptor(window, 'electronAPI')
    localStorage.setItem('seal-session-restore', 'true')
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: JSON.stringify({
        documents: [{ id: '恢复文字', name: '恢复.docx', html: '<p>待保存正文</p>', 已保存Html: '<p>旧正文</p>', type: 'word' }],
        activeDocumentId: '恢复文字', activeModule: 'word',
      }) }),
      backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      reportUnsavedCount: vi.fn().mockResolvedValue({ 成功: true }),
    } })
    try {
      render(<App 初始最近文档={[]} />)
      const 标签 = await screen.findByRole('tab', { name: /恢复.docx/ })
      expect(标签.querySelector('.wps-global-tab__dirty')).not.toBeNull()
      expect(screen.getByText('待保存正文')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.querySelector('.ant-message')).toBeNull()
      expect(screen.queryByText('已恢复编辑内容')).toBeNull()
    } finally {
      localStorage.removeItem('seal-session-restore')
      if (原接口) Object.defineProperty(window, 'electronAPI', 原接口)
      else Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('联系客服使用固定弹窗展示邮箱，关闭后回到当前页面', async () => {
    render(<App 初始最近文档={[]} />)
    await userEvent.click(screen.getByRole('button', { name: '联系客服' }))
    const 弹窗 = await screen.findByRole('dialog', { name: '联系客服' })
    expect(弹窗).toHaveTextContent('24519660@qq.com')
    expect(document.querySelector('.ant-message')).toBeNull()
    await userEvent.click([...弹窗.querySelectorAll('button')].find((按钮) => 按钮.textContent === '关闭')!)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '联系客服' })).toBeNull())
  })

  it('导入文档修改并保存后，关闭程序核验报告零个未保存文件', async () => {
    const 原接口 = Object.getOwnPropertyDescriptor(window, 'electronAPI')
    let 请求关闭: ((标识: string) => void) | undefined
    const 回复 = vi.fn().mockResolvedValue({ 成功: true })
    const 写入 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\导入.docx'),
      readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'YQ==', 二进制: true, 扩展名: 'docx' }),
      saveToFile: 写入,
      recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      recentList: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      office: {
        readDocx: vi.fn().mockResolvedValue({ 成功: true, html: '<p>导入正文</p>', 页面设置: {
          纸张: 'A4', 纸张方向: '纵向', 页边距: '常规', 分栏: '一栏', 页面边框: '无', 页面颜色: '无', 文字方向: '横排', 水印: '无',
        } }),
        writeDocx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'YQ==' }),
      },
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      reportUnsavedCount: vi.fn(() => new Promise(() => {})),
      onCloseStateRequested: (回调: (标识: string) => void) => { 请求关闭 = 回调; return () => { 请求关闭 = undefined } },
      respondCloseState: 回复,
    } })
    try {
      const { container } = render(<App 初始最近文档={[]} />)
      await userEvent.click(screen.getByRole('button', { name: '打开' }))
      await screen.findByRole('tab', { name: '导入.docx' })
      const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
      编辑区.innerHTML = '<p>修改并保存的正文</p>'
      fireEvent.input(编辑区)
      await userEvent.click(screen.getByRole('button', { name: '保存' }))
      await screen.findByText('文件已保存')
      expect(写入).toHaveBeenCalledOnce()
      await act(async () => { 请求关闭?.('保存后退出') })
      await waitFor(() => expect(回复).toHaveBeenCalledWith('保存后退出', { 未保存数量: 0, 备份成功: true }))
    } finally {
      if (原接口) Object.defineProperty(window, 'electronAPI', 原接口)
      else Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('关闭前核验读取当前未保存标签，即使异步上报仍未完成', async () => {
    const 原接口 = Object.getOwnPropertyDescriptor(window, 'electronAPI')
    let 请求关闭: ((标识: string) => void) | undefined
    let 完成备份: ((结果: { 成功: boolean }) => void) | undefined
    const 回复 = vi.fn().mockResolvedValue({ 成功: true })
    const 上报 = vi.fn(() => new Promise(() => {}))
    const 备份 = vi.fn(() => new Promise<{ 成功: boolean }>((完成) => { 完成备份 = 完成 }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      backupSave: 备份,
      reportUnsavedCount: 上报,
      onCloseStateRequested: (回调: (标识: string) => void) => { 请求关闭 = 回调; return () => { 请求关闭 = undefined } },
      respondCloseState: 回复,
    } })
    try {
      render(<App 初始最近文档={[]} />)
      await 通过新建菜单创建('新建文字')
      expect(screen.getByRole('tab', { name: /未命名文档\.docx/ })).toBeInTheDocument()
      expect(请求关闭).toBeTypeOf('function')
      请求关闭?.('本次关闭')
      await waitFor(() => expect(备份).toHaveBeenCalledOnce())
      expect(回复).not.toHaveBeenCalled()
      完成备份?.({ 成功: true })
      await waitFor(() => expect(回复).toHaveBeenCalledWith('本次关闭', { 未保存数量: 1, 备份成功: true }))
      expect(上报).toHaveBeenCalled()
    } finally {
      if (原接口) Object.defineProperty(window, 'electronAPI', 原接口)
      else Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('关闭前工作区备份失败时向主进程报告失败原因', async () => {
    const 原接口 = Object.getOwnPropertyDescriptor(window, 'electronAPI')
    let 请求关闭: ((标识: string) => void) | undefined
    const 回复 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      backupSave: vi.fn().mockResolvedValue({ 成功: false, 错误: '磁盘空间不足' }),
      reportUnsavedCount: vi.fn().mockResolvedValue({ 成功: true }),
      onCloseStateRequested: (回调: (标识: string) => void) => { 请求关闭 = 回调; return () => { 请求关闭 = undefined } },
      respondCloseState: 回复,
    } })
    try {
      render(<App 初始最近文档={[]} />)
      await 通过新建菜单创建('新建文字')
      请求关闭?.('备份失败')
      await waitFor(() => expect(回复).toHaveBeenCalledWith('备份失败', {
        未保存数量: 1, 备份成功: false, 备份错误: '磁盘空间不足',
      }))
    } finally {
      if (原接口) Object.defineProperty(window, 'electronAPI', 原接口)
      else Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('启用新文件提醒后由应用外壳启动目录检测', async () => {
    localStorage.setItem('seal-new-file-alert-folder', 'desktop')
    const 可用 = vi.spyOn(桥接, '可用', 'get').mockReturnValue(true)
    const 列表 = vi.spyOn(桥接, 'listKnownFolder').mockResolvedValue({ 成功: true, 路径: 'C:/Users/测试/Desktop', 文件: [] })
    const 备份 = vi.spyOn(桥接, 'backupLoad').mockResolvedValue({ 成功: true, 内容: null })
    const 关闭保护 = vi.spyOn(桥接, 'reportUnsavedCount').mockResolvedValue({ 成功: true })
    try {
      render(<App 初始最近文档={[]} />)
      await waitFor(() => expect(列表).toHaveBeenCalledWith('desktop'))
    } finally {
      可用.mockRestore()
      列表.mockRestore()
      备份.mockRestore()
      关闭保护.mockRestore()
      localStorage.removeItem('seal-new-file-alert-folder')
    }
  })
  it('渲染顶栏、图标栏、导航栏与推荐面板', () => {
    const { container } = render(<App 初始最近文档={RECENT_DOCS} />)
    expect(screen.getByRole('img', { name: '海豹办公' })).toBeInTheDocument()
    expect(screen.queryByText('Seal Office')).toBeNull()
    expect(screen.getByText('新建')).toBeInTheDocument()
    expect(screen.getByText('打开')).toBeInTheDocument()
    // 图标栏、左侧导航、右侧推荐面板
    expect(container.querySelector('.wps-homerail')).not.toBeNull()
    expect(container.querySelectorAll('.wps-homenav__item').length).toBeGreaterThanOrEqual(3)
    expect(container.querySelector('.wps-recommend')).not.toBeNull()
    expect(screen.getByText('精选推荐')).toBeInTheDocument()
  })

  it('首页顶栏为居中大搜索框与通知/客服/全局设置/主题切换/头像图标组', () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    expect(document.querySelector('.wps-titlebar__search--home')).not.toBeNull()
    expect(screen.getByRole('button', { name: '通知' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '联系客服' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '全局设置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换深浅模式' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '未登录，点击登录' })).toBeInTheDocument()
  })

  it('通知入口展示本次运行的通知而不跳到设置', async () => {
    render(<App 初始最近文档={[]} />)
    window.dispatchEvent(new CustomEvent('seal-local-notification', { detail: { 标题: '桌面有新文件', 内容: '发现 1 个新办公文件：报告.docx。' } }))
    await userEvent.click(screen.getByRole('button', { name: '通知' }))
    expect(await screen.findByRole('dialog', { name: '通知' })).toBeInTheDocument()
    expect(screen.getByText('桌面有新文件')).toBeInTheDocument()
    expect(screen.getByText('发现 1 个新办公文件：报告.docx。')).toBeInTheDocument()
    expect(screen.queryByText('设置中心')).toBeNull()
  })

  it('全局设置下拉含设置与关于我们，分别打开设置页与关于弹窗', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByRole('button', { name: '全局设置' }))
    const 设置项 = await screen.findByRole('menuitem', { name: '设置' })
    expect(screen.getByRole('menuitem', { name: '关于我们' })).toBeInTheDocument()
    await userEvent.click(设置项)
    expect(document.body).toHaveTextContent('设置中心')
  })

  it('主题切换入口首次进入设置即存在，返回首页和重启后仍可用且保留主题', async () => {
    localStorage.removeItem('seal-theme')
    try {
      const { unmount } = render(<App 初始最近文档={[]} />)
      expect(screen.getAllByRole('button', { name: '切换深浅模式' })).toHaveLength(1)
      await userEvent.click(screen.getByRole('button', { name: '全局设置' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: '设置' }))
      expect(document.body).toHaveTextContent('设置中心')
      await userEvent.click(screen.getByRole('button', { name: '切换深浅模式' }))
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
      expect(localStorage.getItem('seal-theme')).toBe('深色')
      await userEvent.click(screen.getByRole('tab', { name: '首页' }))
      expect(screen.getAllByRole('button', { name: '切换深浅模式' })).toHaveLength(1)
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
      unmount()
      render(<App 初始最近文档={[]} />)
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
      await userEvent.click(screen.getByRole('button', { name: '切换深浅模式' }))
      expect(document.documentElement).toHaveAttribute('data-theme', 'light')
      expect(localStorage.getItem('seal-theme')).toBe('浅色')
    } finally {
      localStorage.removeItem('seal-theme')
    }
  })

  it('主题切换同步更新弹窗和表单使用的组件库令牌', async () => {
    localStorage.removeItem('seal-theme')
    const 令牌探针 = () => {
      const { 切换主题 } = useSettings()
      const { token } = theme.useToken()
      return <><output data-testid="组件主题令牌">{token.colorPrimary}|{token.colorBgContainer}</output><button onClick={切换主题}>切换主题令牌</button></>
    }
    render(<SettingsProvider><动态主题容器><令牌探针 /></动态主题容器></SettingsProvider>)
    const 浅色令牌 = screen.getByTestId('组件主题令牌').textContent
    expect(浅色令牌).toMatch(/#2b6cf6\|#ffffff/i)
    await userEvent.click(screen.getByRole('button', { name: '切换主题令牌' }))
    const 深色令牌 = screen.getByTestId('组件主题令牌').textContent
    expect(深色令牌).toMatch(/\|#252a33$/i)
    expect(深色令牌).not.toBe(浅色令牌)
    localStorage.removeItem('seal-theme')
  })

  it('搜索框按文档名过滤最近列表', async () => {
    const { container } = render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.type(screen.getByPlaceholderText('搜索最近文档名称或内容'), '预算')
    expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(1)
    expect(container.textContent).toContain('部门预算执行明细表.xlsx')
  })

  it('从新建菜单打开模板库', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByRole('button', { name: '新建' }))
    await userEvent.click(await screen.findByRole('button', { name: /模板库/ }))
    expect(await screen.findByRole('dialog', { name: '模板库' })).toBeInTheDocument()
  })

  it('点击星标导航后仅渲染星标文档', async () => {
    const { container } = render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByText('星标'))
    expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(5)
    expect(container.querySelectorAll('.wps-doc-card__star--on')).toHaveLength(5)
  })

  it('共享能力未接入时明确提示且不切换最近文档', async () => {
    const { container } = render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByText('共享'))
    expect(await screen.findByText('「共享」功能即将开放')).toBeInTheDocument()
    expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(RECENT_DOCS.length)
  })

  it('单击文档卡片后进入选中态', async () => {
    const { container } = render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByText('部门预算执行明细表.xlsx'))
    const 选中卡片 = container.querySelectorAll('.wps-doc-card--active')
    expect(选中卡片).toHaveLength(1)
    expect(选中卡片[0].textContent).toContain('部门预算执行明细表.xlsx')
  })

  it('取消全部星标后星标筛选展示空状态', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByText('星标'))
    const 星标按钮 = screen.getAllByRole('button', { name: '取消星标' })
    expect(星标按钮).toHaveLength(5)
    for (const 按钮 of 星标按钮) await userEvent.click(按钮)
    expect(screen.getByText('暂无最近文档')).toBeInTheDocument()
  })

  it('通过新建弹窗进入文字编辑器并可返回首页', async () => {
    const { container } = render(<App 初始最近文档={RECENT_DOCS} />)
    await 通过新建菜单创建('新建文字')
    // 文档模块已由占位页升级为完整编辑器
    expect(container.querySelector('.wps-ribbon-tabs')).not.toBeNull()
    expect(container.querySelector('.wps-editor-canvas__content')).not.toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: '首页' }))
    expect(screen.getByText('新建')).toBeInTheDocument()
  })

  it('首页与多个文档显示在固定底部标签栏，切换不丢失编辑状态', async () => {
    const { container } = render(<App 初始最近文档={[]} />)
    expect(container.querySelector('.wps-global-tabs')).not.toBeNull()
    expect(screen.getByRole('tab', { name: '首页' })).toHaveAttribute('aria-selected', 'true')
    await 通过新建菜单创建('新建文字')
    expect(container.querySelector('.wps-main--editor > .wps-doc-tabs')).toBeNull()
    expect(screen.getByRole('tab', { name: /未命名文档\.docx/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '首页' }))
    await 通过新建菜单创建('新建表格')
    expect(screen.getByRole('tab', { name: /未命名表格\.xlsx/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: /未命名文档\.docx/ }))
    expect(container.querySelector('.wps-editor-canvas__content')).not.toBeNull()
  })

  it('新建文档时顶栏显示未命名文档，不显示无关文件名', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    await 通过新建菜单创建('新建表格')
    expect(document.querySelector('.wps-titlebar__doc')?.textContent).toBe('未命名表格.xlsx')
  })

  it('推荐面板的本机工具入口进入实际编辑模块', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByRole('button', { name: '空白表格' }))
    expect(document.querySelector('.wps-titlebar__doc')?.textContent).toBe('未命名表格.xlsx')
  })

  it('侧栏 PDF 工具入口切换到 PDF 模块', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByText('PDF 工具'))
    expect(document.querySelector('.wps-homebody')).toBeNull()
  })

  it('从 PDF 页底部返回首页后可以进入日历', async () => {
    render(<App 初始最近文档={[]} />)
    await userEvent.click(screen.getByText('PDF 工具'))
    expect(document.querySelector('.wps-main--pdf')).not.toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: '首页' }))
    await userEvent.click(document.querySelector('.wps-homerail__item:nth-child(2)')!)
    expect(document.querySelector('.wps-homebody')).not.toBeNull()
    expect(await screen.findByRole('heading', { name: '本机日历' })).toBeInTheDocument()
  })

  it.each(['新建文字', '新建表格', '新建演示', '新建 PDF'])('文件页面 %s 不显示全局左栏且可以从底部返回首页', async (名称) => {
    const { container } = render(<App 初始最近文档={[]} />)
    if (名称 === '新建 PDF') await userEvent.click(screen.getByText('PDF 工具'))
    else await 通过新建菜单创建(名称)
    expect(container.querySelector('.wps-homebody')).toBeNull()
    expect(container.querySelector('.wps-sidebar')).toBeNull()
    expect(screen.queryByRole('button', { name: '返回首页' })).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: '首页' }))
    expect(container.querySelector('.wps-homebody')).not.toBeNull()
  })

  it('演示文稿通过 F5 全屏播放，最后一页结束后恢复窗口与助手入口', async () => {
    const 原接口 = Object.getOwnPropertyDescriptor(window, 'electronAPI')
    const 进入 = vi.fn().mockResolvedValue({ 成功: true, 会话标识: '应用放映会话' })
    const 退出 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      enterSlideshowFullscreen: 进入, exitSlideshowFullscreen: 退出,
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      reportUnsavedCount: vi.fn().mockResolvedValue({ 成功: true }),
    } })
    try {
      render(<App 初始最近文档={[]} />)
      await 通过新建菜单创建('新建演示')
      const 放映前未保存数 = document.querySelectorAll('.wps-global-tab__dirty').length
      expect(screen.getByRole('button', { name: '打开智能助手' })).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'F5' })
      await waitFor(() => expect(进入).toHaveBeenCalledTimes(1))
      expect(screen.queryByRole('button', { name: '打开智能助手' })).toBeNull()
      expect(screen.getByRole('dialog', { name: '幻灯片放映' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('dialog', { name: '幻灯片放映' }))
      await waitFor(() => expect(退出).toHaveBeenCalledWith('应用放映会话'))
      expect(screen.queryByRole('dialog', { name: '幻灯片放映' })).toBeNull()
      expect(screen.getByRole('button', { name: '打开智能助手' })).toBeInTheDocument()
      expect(document.querySelectorAll('.wps-global-tab__dirty')).toHaveLength(放映前未保存数)
    } finally {
      if (原接口) Object.defineProperty(window, 'electronAPI', 原接口)
      else Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('无真实路径的演示记录不会打开空白文档', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.dblClick(screen.getByText('部门预算执行明细表.xlsx'))
    expect(await screen.findByText('最近记录缺少文件路径，无法打开')).toBeInTheDocument()
    expect(document.querySelector('.wps-titlebar__doc')).toBeNull()
  })

  it('渲染底部状态栏统计', () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    expect(screen.getByText('共 12 个文档')).toBeInTheDocument()
  })

  it('从全局设置进入设置页后展示 WPS 式分组', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByRole('button', { name: '全局设置' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: '设置' }))
    expect(document.body).toHaveTextContent('外观设置')
    expect(document.body).toHaveTextContent('工作环境')
    expect(document.body).toHaveTextContent('沙箱保护')
  })

  it('点击帮助手册打开独立弹窗而非整页跳转', async () => {
    const { container } = render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByText('帮助手册'))
    // 弹窗在 body 下渲染，包含手册内容
    expect(document.body).toHaveTextContent('帮助手册')
    expect(document.body).toHaveTextContent('从首页开始')
    // 仍是首页布局（未整页切换）
    expect(container.querySelector('.wps-homebody')).not.toBeNull()
    // 关闭弹窗后内容消失
    const 关闭 = document.querySelector('.ant-modal-close')
    if (关闭 !== null) {
      await userEvent.click(关闭 as HTMLElement)
    }
    await waitFor(
      () => {
        // jsdom 不执行退出动画，关闭后弹窗容器应隐藏
        const 遮罩 = document.querySelector('.ant-modal-wrap') as HTMLElement | null
        expect(遮罩 === null || 遮罩.style.display === 'none').toBe(true)
      },
      { timeout: 3000 }
    )
  })
})
