import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App as AntdApp } from 'antd'

const 调用 = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('../store', () => ({ useAppStore: () => ({}) }))
vi.mock('../store/settingsStore', () => ({ useSettings: () => ({ 语言: 'zh-CN' }) }))
vi.mock('../cloud/CloudProvider', () => ({
  cloudCall: (...参数: unknown[]) => 调用.fn(...参数),
  useCloud: () => ({ state: { account: { id: 'u', enabled: true }, unlocked: true }, configure: vi.fn(), refresh: vi.fn() }),
}))

import DevicesPage from './DevicesPage'
import SharedPage from './SharedPage'
import TagsPage from './TagsPage'
import TeamsPage from './TeamsPage'

describe('协作页面首次读取显示统一加载动画', () => {
  beforeEach(() => { 调用.fn.mockReset(); 调用.fn.mockReturnValue(new Promise(() => {})) })
  for (const [名称, 页面] of [['我的设备', DevicesPage], ['共享文档', SharedPage], ['标签', TagsPage], ['团队空间', TeamsPage]] as const) {
    it(名称, () => {
      render(<AntdApp><页面 /></AntdApp>)
      expect(screen.getByRole('status').textContent).toContain(`正在读取${名称}`)
      expect(screen.getByRole('heading', { name: 名称 })).toBeTruthy()
    })
  }
})
