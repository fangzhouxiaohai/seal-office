// 右键菜单定位回归：菜单必须用 fixed 定位贴着光标出现（此前 absolute 被定位祖先偏移到别处）
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ContextMenu, { type 菜单节点 } from './ContextMenu'

const 菜单: 菜单节点[] = [
  { type: 'item', commandId: 'a', label: '项目一' },
  { type: 'item', commandId: 'b', label: '项目二' },
]

describe('右键菜单定位', () => {
  it('使用 fixed 定位并出现在光标右下角（间隙 2px）', () => {
    const { baseElement } = render(
      <ContextMenu open x={200} y={150} items={菜单} onCommand={() => {}} />
    )
    // portal 挂载在 body 下
    const 菜单元素 = baseElement.ownerDocument.querySelector('.wps-context-menu') as HTMLElement
    expect(菜单元素).not.toBeNull()
    expect(菜单元素.style.position).toBe('fixed')
    expect(菜单元素.style.transform).toBe('translate(202px, 152px)')
  })

  it('靠近右缘时翻转到光标左侧', () => {
    const { baseElement } = render(
      <ContextMenu open x={1900} y={100} items={菜单} onCommand={() => {}} />
    )
    const 菜单元素 = baseElement.ownerDocument.querySelector('.wps-context-menu') as HTMLElement
    const 匹配 = /translate\((-?\d+)px/.exec(菜单元素.style.transform)
    expect(匹配).not.toBeNull()
    // 1900 + 220 已越出常见视口宽，应翻转为负偏移（光标左侧）
    expect(Number(匹配![1])).toBeLessThan(1900)
  })
})
