import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SlideObjects, 文本样式 } from './SlideObjects'
import { 创建文本框 } from '../deck'
import { 导出为Html预览 } from '../deckExport'
import SlideCanvas from '../SlideCanvas'
import type { 幻灯片 } from '../deck'
describe('统一只读对象渲染', () => {
  it('窄文本框和长串共享盒模型与换行规则，网页独立运行',()=>{
    const 框=创建文本框(0,0,40,90,'长串ABCDEFGHIJKLMN\n第二行',20)
    expect(文本样式(框)).toMatchObject({boxSizing:'border-box',overflowWrap:'anywhere',border:'0 solid transparent'})
    const html=导出为Html预览({id:'文稿',name:'测试',当前索引:0,幻灯片列表:[{id:'页',title:'测试',版式:'空白',背景色:'#FFFFFF',文本框列表:[框]}]},'测试')
    expect(html).toContain('box-sizing:border-box');expect(html).toContain('overflow-wrap:anywhere')
    const 页:幻灯片={id:'页',title:'测试',版式:'空白',背景色:'#FFFFFF',文本框列表:[框]}
    const {container,rerender}=render(<SlideCanvas 幻灯片={页} 选中框标识={框.id} 缩放={1} 编辑框标识={null} 编辑值="" 显示网格线={false} on选中框={()=>{}} on双击框={()=>{}} on编辑值变化={()=>{}} on提交编辑={()=>{}} on拖动框={()=>{}} on文本选择={()=>{}} />)
    const 编辑框=container.querySelector('[data-框标识]') as HTMLElement
    expect(编辑框.style.boxSizing).toBe('border-box');expect(编辑框.style.borderWidth).toBe('0px');expect(编辑框.style.overflowWrap).toBe('anywhere')
    const 编辑样式=编辑框.style.cssText
    rerender(<SlideObjects 幻灯片={页}/>)
    expect((container.querySelector('[data-框标识]') as HTMLElement).style.cssText).toBe(编辑样式)
  })
  it('使用真实图片资源、裁剪和旋转且不添加编辑控件', () => {
    const 页: 幻灯片 = { id: '页', title: '测试', 版式: '空白', 背景色: '#FFFFFF', 文本框列表: [], 对象列表: [{ id: '图片', 类型: '图片', x: 10, y: 20, width: 300, height: 200, 旋转: 30, 裁剪: { 左: .25, 上: 0, 右: .25, 下: 0 }, 资源标识: '资源' }] }
    const { container } = render(<SlideObjects 幻灯片={页} 图片地址={{ 资源: 'data:image/png;base64,真实字节' }} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,真实字节')
    expect(screen.getByRole('img').style.width).toBe('200%')
    expect(container.querySelector('[data-对象标识="图片"]')).toHaveStyle({ transform: 'rotate(30deg)' })
    expect(screen.queryByRole('button')).toBeNull()
  })
})
