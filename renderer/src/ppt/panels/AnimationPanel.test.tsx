import { fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿, 创建幻灯片, 复制幻灯片, 删除文本框 } from '../deck'
import { 应用全部切换 } from '../model/transitions'
import AnimationPanel from './AnimationPanel'
it('面板提交切换、自动换片、对象动画且应用全部保留隐藏与对象', () => {
  const 文稿 = 创建演示文稿(), 页 = 文稿.幻灯片列表[0], 修改 = vi.fn()
  render(<App><AnimationPanel 文稿={文稿} 页={页} 选中={页.文本框列表[0].id} 只读={false} on修改={修改}/></App>)
  fireEvent.change(screen.getByLabelText('切换效果'), {target:{value:'擦除'}})
  expect(修改.mock.calls[0][0].幻灯片列表[0].切换.效果).toBe('擦除')
  fireEvent.click(screen.getByRole('button',{name:'添加对象动画'}))
  expect(修改.mock.calls[1][0].幻灯片列表[0].动画序列[0].对象标识).toBe(页.文本框列表[0].id)
  文稿.幻灯片列表.push({...创建幻灯片(),隐藏:true}); 页.切换={效果:'擦除',持续毫秒:700,方向:'上',方式:'外',轴:'水平'}
  const 全部=应用全部切换(文稿,页); expect(全部.幻灯片列表[1].隐藏).toBe(true); expect(全部.幻灯片列表[1].文本框列表).toBe(文稿.幻灯片列表[1].文本框列表)
})
it('复制页面重映射动画目标，删除目标同步清除动画', () => {
  const 文稿=创建演示文稿(), 页=文稿.幻灯片列表[0]; 页.动画序列=[{id:'动画',对象标识:页.文本框列表[0].id,效果:'出现',触发:'单击',持续毫秒:0}]
  const 副本=复制幻灯片(文稿,页.id).幻灯片列表[1]; expect(副本.动画序列![0].对象标识).toBe(副本.文本框列表[0].id); expect(删除文本框(页,页.文本框列表[0].id).动画序列).toEqual([])
})
