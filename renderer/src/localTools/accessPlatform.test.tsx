import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider } from '../store'
import { NAV_GROUPS, navigationAvailable } from '../navConfig'
import HomeSidebar from '../components/HomeSidebar'
import AppsPage from './AppsPage'
import MobileServices from '../../../mobile/web/services'

// Access 依赖 Windows ACE 驱动，Web / Android / HarmonyOS（均以 data-seal-platform 标记）不得出现任何 Access 新建或打开入口。
const 平台列表 = [['Web', 'web'], ['Android / HarmonyOS 原生宿主', 'app']] as const

const 包裹 = (节点: React.ReactNode) => render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider>{节点}</AppProvider></AntdApp></ConfigProvider>)

afterEach(() => {
  delete document.documentElement.dataset.sealPlatform
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('Access 入口只在 Windows 桌面版出现', () => {
  it('桌面版：导航注册表、首页新建菜单与应用页均保留 Access 入口', async () => {
    expect(navigationAvailable('database')).toBe(true)
    render(<HomeSidebar navKey="recent" onNavigate={vi.fn()} onNewDoc={vi.fn()} onNewAccess={vi.fn()} onOpenTemplate={vi.fn()} onOpenFile={vi.fn()} onNotify={vi.fn()} onOpenPdf={vi.fn()} onOpenHelp={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '新建' }))
    expect(within(await screen.findByRole('dialog', { name: '新建文档' })).getByRole('button', { name: /Access 数据库/ })).toBeInTheDocument()
  })

  for (const [名称, 标记] of 平台列表) {
    describe(名称, () => {
      it('导航注册表不开放 database', () => {
        document.documentElement.dataset.sealPlatform = 标记
        expect(navigationAvailable('database')).toBe(false)
        expect(NAV_GROUPS.flat().filter((项) => navigationAvailable(项.key)).map((项) => 项.key)).not.toContain('database')
      })

      it('首页新建菜单不出现 Access 数据库', async () => {
        document.documentElement.dataset.sealPlatform = 标记
        render(<HomeSidebar navKey="recent" onNavigate={vi.fn()} onNewDoc={vi.fn()} onNewAccess={vi.fn()} onOpenTemplate={vi.fn()} onOpenFile={vi.fn()} onNotify={vi.fn()} onOpenPdf={vi.fn()} onOpenHelp={vi.fn()} />)
        await userEvent.click(screen.getByRole('button', { name: '新建' }))
        const 弹窗 = await screen.findByRole('dialog', { name: '新建文档' })
        expect(within(弹窗).getByRole('button', { name: /文字文档/ })).toBeInTheDocument()
        expect(within(弹窗).queryByRole('button', { name: /Access/ })).not.toBeInTheDocument()
      })

      it('应用页不出现 Access 数据库', () => {
        document.documentElement.dataset.sealPlatform = 标记
        包裹(<AppsPage />)
        expect(screen.getByRole('button', { name: /本机日历/ })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Access/ })).not.toBeInTheDocument()
      })

      it('移动端服务搜索输入“Access”“数据库”“database”都搜不到 Access 入口', () => {
        document.documentElement.dataset.sealPlatform = 标记
        包裹(<MobileServices />)
        expect(document.querySelector('[data-nav-key="database"]')).toBeNull()
        for (const 关键词 of ['Access', '数据库', 'database']) {
          fireEvent.change(screen.getByRole('searchbox', { name: '搜索办公服务' }), { target: { value: 关键词 } })
          expect(document.querySelector('[data-nav-key="database"]')).toBeNull()
          expect(screen.queryByText(/Access/)).not.toBeInTheDocument()
        }
      })
    })
  }
})
