import { cleanup,fireEvent,render,screen,waitFor,within } from '@testing-library/react'
import { describe,it,expect,vi } from 'vitest'
import RibbonPanel from './RibbonPanel'
import { RIBBON_TABS } from './tabSpecs'
import { 表格标签 } from '../../sheet/ribbonSpecs'
import { 演示标签 } from '../../ppt/ribbonSpecs'

for(const [kind,tabs] of [['文字',RIBBON_TABS],['表格',表格标签],['演示',演示标签]] as const) {
  describe(kind+'全部功能区控件绑定',()=>{
    it.each(tabs)('$label 标签的每个按钮、下拉入口与参数都可正确派发',async(tab)=>{
      const dispatch=vi.fn(),open=vi.fn()
      const {container}=render(<RibbonPanel activeKey={tab.key} tabs={tabs} onCommand={dispatch} onDropdownOpen={open}/>)
      const groups=container.querySelectorAll('.wps-ribbon-group')
      for(let i=0;i<tab.groups.length;i++) {
        const buttons=groups[i].querySelectorAll<HTMLButtonElement>('button')
        expect(buttons.length).toBe(tab.groups[i].items.length)
        for(let j=0;j<buttons.length;j++) {
          const item=tab.groups[i].items[j],button=buttons[j]
          expect(button).toHaveAccessibleName(item.label)
          expect(button.querySelector('svg')).not.toBeNull()
          if(item.options?.length) {
            for(const option of item.options) {
              const label=typeof option==='string'?option:option.label,value=typeof option==='string'?option:option.value
              fireEvent.click(button)
              const menu=await screen.findByRole('menu')
              expect(within(menu).getAllByRole('menuitem')).toHaveLength(item.options.length)
              fireEvent.click(within(menu).getByRole('menuitem',{name:label}))
              expect(dispatch).toHaveBeenLastCalledWith(item.commandId,value)
              await waitFor(()=>expect(screen.queryByRole('menu')).toBeNull())
            }
          }else {
            fireEvent.click(button);expect(dispatch).toHaveBeenLastCalledWith(item.commandId,item.固定参数)
          }
        }
      }
      cleanup()
    })
  })
}

it('禁用的格式命令有原因提示且不执行，动态值缺省时保留原菜单标签',()=>{
  const run=vi.fn()
  render(<RibbonPanel activeKey="start" 获取当前值={()=>undefined} 获取禁用态={id=>id.startsWith('font.')} 获取禁用原因={()=>'文档已保护'} onCommand={run}/>)
  const font=screen.getByRole('button',{name:'字体'})
  expect(font).toHaveTextContent('宋体');expect(font).toBeDisabled();expect(font).toHaveAttribute('title','文档已保护')
  fireEvent.click(font);expect(run).not.toHaveBeenCalled()
})
