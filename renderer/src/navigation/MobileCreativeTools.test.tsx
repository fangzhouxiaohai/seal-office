import { App } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CreativeTools from '../../../mobile/web/CreativeTools'
import { downloadFile } from '../../../mobile/web/native'
import { SettingsProvider } from '../store/settingsStore'

vi.mock('../../../mobile/web/native',()=>({ downloadFile:vi.fn(async()=>{}) }))

describe('手机创作工具',()=>{
  it('收集表开在填写视图，并可从同一张表导出数据',()=>{
    render(<App><SettingsProvider><CreativeTools tool="collect-form"/></SettingsProvider></App>)
    expect(screen.getByRole('button',{name:'填写表单'})).toBeVisible()
    expect(screen.getByRole('button',{name:'导出 Excel'})).toBeVisible()
    expect(screen.getByRole('button',{name:'导出当前视图 CSV'})).toBeVisible()
  })
  it('使用输入的分类和数值生成真正的图表文件，错误数据不能导出',async()=>{
    render(<App><CreativeTools tool="make-chart"/></App>)
    const data=screen.getByLabelText('图表数据')
    fireEvent.change(data,{target:{value:'甲,18\n乙,32'}})
    fireEvent.click(screen.getByRole('button',{name:'导出 SVG'}))
    await waitFor(()=>expect(downloadFile).toHaveBeenCalled())
    const [filename,bytes,mime]=vi.mocked(downloadFile).mock.lastCall!
    expect(filename).toMatch(/\.svg$/)
    expect(mime).toBe('image/svg+xml')
    const image=new DOMParser().parseFromString(new TextDecoder().decode(bytes),'image/svg+xml')
    expect(image.querySelector('svg')).not.toBeNull()
    expect(image.documentElement.textContent).toContain('乙')
    fireEvent.change(data,{target:{value:'错误,不是数值'}})
    expect(screen.getByRole('button',{name:'导出 SVG'})).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('第 1 行')
  })
  it('手写空白不能导出，笔画结束后能导出，撤销恢复空白',async()=>{
    render(<App><CreativeTools tool="handwriting"/></App>)
    const ink=screen.getByLabelText('手写画布')
    vi.spyOn(ink,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,400,180))
    const button=screen.getByRole('button',{name:'导出 SVG'})
    expect(button).toBeDisabled()
    for (const [event,n] of [['pointerdown',15],['pointermove',42],['pointerup',61]] as const) {
      const e=new MouseEvent(event,{bubbles:true,clientX:n,clientY:20}); Object.defineProperty(e,'pointerId',{value:9}); fireEvent(ink,e)
    }
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(()=>expect(vi.mocked(downloadFile).mock.lastCall?.[0]).toBe('手写字迹.svg'))
    expect(new TextDecoder().decode(vi.mocked(downloadFile).mock.lastCall![1])).toContain('polyline')
    fireEvent.click(screen.getByRole('button',{name:'撤销上一笔'}))
    expect(button).toBeDisabled()
  })
})
