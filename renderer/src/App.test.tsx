import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { RECENT_DOCS } from './mock/recentDocs'

/** 通过「新建」下拉选择文档类型（WPS 首页的新建入口为下拉菜单） */
const 通过新建菜单创建 = async (名称: string) => {
  await userEvent.click(screen.getByText('新建'))
  await userEvent.click(await screen.findByText(名称))
}

describe('应用外壳（WPS 版式首页）', () => {
  it('渲染顶栏、图标栏、导航栏与推荐面板', () => {
    const { container } = render(<App 初始最近文档={RECENT_DOCS} />)
    expect(screen.getByText('Seal Office')).toBeInTheDocument()
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

  it('全局设置下拉含设置与关于我们，分别打开设置页与关于弹窗', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByRole('button', { name: '全局设置' }))
    const 设置项 = await screen.findByRole('menuitem', { name: '设置' })
    expect(screen.getByRole('menuitem', { name: '关于我们' })).toBeInTheDocument()
    await userEvent.click(设置项)
    expect(document.body).toHaveTextContent('设置中心')
  })

  it('主题切换按钮在深浅模式间翻转', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    const 之前 = document.documentElement.getAttribute('data-theme')
    await userEvent.click(screen.getByRole('button', { name: '切换深浅模式' }))
    const 之后 = document.documentElement.getAttribute('data-theme')
    expect(之前).not.toBe(之后)
  })

  it('搜索框按文档名过滤最近列表', async () => {
    const { container } = render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.type(screen.getByPlaceholderText('搜索最近文档名称'), '预算')
    expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(1)
    expect(container.textContent).toContain('部门预算执行明细表.xlsx')
  })

  it('从新建菜单打开模板库', async () => {
    render(<App 初始最近文档={RECENT_DOCS} />)
    await userEvent.click(screen.getByRole('button', { name: '新建' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: '从模板新建' }))
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
    for (let 序号 = 0; 序号 < 5; 序号 += 1) {
      await userEvent.click(screen.getAllByRole('button', { name: '取消星标' })[0])
    }
    expect(screen.getByText('暂无最近文档')).toBeInTheDocument()
  })

  it('通过新建下拉进入文字编辑器并可返回首页', async () => {
    const { container } = render(<App 初始最近文档={RECENT_DOCS} />)
    await 通过新建菜单创建('新建文字')
    // 文档模块已由占位页升级为完整编辑器
    expect(container.querySelector('.wps-ribbon-tabs')).not.toBeNull()
    expect(container.querySelector('.wps-editor-canvas__content')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '返回首页' }))
    expect(screen.getByText('新建')).toBeInTheDocument()
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
    expect(document.body).toHaveTextContent('欢迎使用海豹办公')
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
