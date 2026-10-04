import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ObjectPropertiesPanel from './ObjectPropertiesPanel'
import { 创建幻灯片 } from '../deck'
import { 创建图形, 创建表格, 创建语义图 } from '../model/elements'
describe('选区权限', () => {
  it('首对象为图形时混选表格也禁用旋转', () => {
    const 页 = {...创建幻灯片('空白'),对象列表:[创建图形('矩形'),创建表格(2,2)]}
    render(<ObjectPropertiesPanel 页={页} 选中={页.对象列表.map(项=>项.id)} 只读={false} on修改={vi.fn()} on操作={vi.fn()}/>)
    expect(screen.getByLabelText('旋转角度')).toBeDisabled()
  })
  it('锁定语义组合禁用成员入口及被直接选中成员的属性', () => {
    const 页 = {...创建幻灯片('空白'),对象列表:创建语义图('流程')}, 组=页.对象列表.find(项=>项.类型==='组合')!
    组.锁定=true
    const 参数={页:页,选中:[组.id],只读:false,on修改:vi.fn(),on操作:vi.fn()}
    const {rerender}=render(<ObjectPropertiesPanel {...参数}/>)
    expect(screen.getByRole('button',{name:'开始'})).toBeDisabled()
    const 节点=页.对象列表.find(项=>项.形状?.文本==='开始')!
    rerender(<ObjectPropertiesPanel {...参数} 选中={[节点.id]}/>)
    expect(screen.getByLabelText('宽度')).toBeDisabled()
    expect(screen.getByRole('button',{name:'删除'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'锁定'})).toBeDisabled()
  })
})
