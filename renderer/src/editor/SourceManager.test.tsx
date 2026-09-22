import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import SourceManager from './SourceManager'
import type { 文献 } from './citation'

const 示例: 文献[] = [
  { id: 'ref-1', 作者: '张三', 标题: '办公自动化', 年份: '2024', 来源: '计算机工程' },
]

/** 以受控方式渲染，使输入能真正回写到面板 */
const 渲染面板 = (初始: 文献[], 变更?: (列表: 文献[]) => void) => {
  const 包装 = () => {
    const [列表, set列表] = useState(初始)
    return (
      <SourceManager
        open
        sources={列表}
        onClose={() => {}}
        onChange={(新列表) => {
          set列表(新列表)
          if (变更 !== undefined) {
            变更(新列表)
          }
        }}
      />
    )
  }
  return render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <包装 />
    </ConfigProvider>
  )
}

describe('文献管理面板', () => {
  it('未打开时不渲染内容', () => {
    const { container } = render(
      <SourceManager open={false} sources={示例} onClose={() => {}} onChange={() => {}} />
    )
    expect(container.querySelector('.wps-source-manager')).toBeNull()
  })

  it('展示现有文献的作者与标题', () => {
    渲染面板(示例)
    expect(screen.getByDisplayValue('张三')).toBeInTheDocument()
    expect(screen.getByDisplayValue('办公自动化')).toBeInTheDocument()
  })

  it('修改字段后内容随之更新', async () => {
    const 变更 = vi.fn()
    渲染面板(示例, 变更)
    const 标题输入 = screen.getByDisplayValue('办公自动化')
    await userEvent.clear(标题输入)
    await userEvent.type(标题输入, '新标题')
    expect(screen.getByDisplayValue('新标题')).toBeInTheDocument()
    const 最后一次 = 变更.mock.calls[变更.mock.calls.length - 1][0] as 文献[]
    expect(最后一次[0].标题).toBe('新标题')
  })

  it('点击添加条目后列表增加一项', async () => {
    const 变更 = vi.fn()
    渲染面板(示例, 变更)
    await userEvent.click(screen.getByRole('button', { name: '添加文献' }))
    expect(screen.getByText('共 2 条文献')).toBeInTheDocument()
    expect(变更).toHaveBeenCalled()
  })

  it('点击删除后列表移除该项', async () => {
    const 变更 = vi.fn()
    渲染面板(示例, 变更)
    await userEvent.click(screen.getByRole('button', { name: '删除文献 1' }))
    expect(screen.getByText('尚未添加文献')).toBeInTheDocument()
    expect(变更).toHaveBeenCalled()
  })

  it('无文献时展示中文空提示', () => {
    render(
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <SourceManager open sources={[]} onClose={() => {}} onChange={() => {}} />
      </ConfigProvider>
    )
    expect(screen.getByText('尚未添加文献')).toBeInTheDocument()
  })

  it('点击完成回传关闭事件', async () => {
    const 关闭 = vi.fn()
    render(
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <SourceManager open sources={示例} onClose={关闭} onChange={() => {}} />
      </ConfigProvider>
    )
    await userEvent.click(screen.getByRole('button', { name: '完成' }))
    expect(关闭).toHaveBeenCalledTimes(1)
  })
})
