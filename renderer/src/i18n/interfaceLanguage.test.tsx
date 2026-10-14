import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { SettingsProvider, useSettings } from '../store/settingsStore'
import { RIBBON_TABS, type RibbonTabSpec } from '../editor/ribbon/tabSpecs'
import { 表格标签 } from '../sheet/ribbonSpecs'
import { 演示标签 } from '../ppt/ribbonSpecs'
import { InterfaceLanguageAdapter, 翻译界面文本 } from './interfaceLanguage'

const 夹具 = () => {
  const { 设置语言 } = useSettings()
  const [显示保存, set显示保存] = useState(false)
  return <>
    <InterfaceLanguageAdapter />
    <button type="button" onClick={() => set显示保存(true)}>打开</button>
    <button type="button" aria-label="切换回中文" onClick={() => 设置语言('zh-CN')}>语言控制</button>
    {显示保存 ? <span>保存</span> : null}
    <div contentEditable suppressContentEditableWarning>打开</div>
    <div className="wps-sheet"><span>首页</span></div>
    <span data-ui-language-ignore="true">设置</span>
  </>
}

describe('界面中英文适配', () => {
  beforeEach(() => {
    localStorage.setItem('seal-language', 'en-US')
    document.body.innerHTML = ''
  })

  it('翻译常用文案和动态数量文案', () => {
    expect(翻译界面文本('首页', 'en-US')).toBe('Home')
    expect(翻译界面文本('找到 2 个匹配文件', 'en-US')).toBe('Found 2 matching files')
    expect(翻译界面文本('首页', 'zh-CN')).toBe('首页')
  })

  it('除正式品牌名外，文字、表格与演示的全部功能区文案都有英文映射', () => {
    const 收集功能区文案 = (标签列表: RibbonTabSpec[]) => 标签列表.flatMap((标签) => [
      标签.label,
      ...标签.groups.flatMap((分组) => [
        分组.name,
        ...分组.items.flatMap((项目) => [
          项目.label,
          ...(项目.options ?? []).map((选项) => typeof 选项 === 'string' ? 选项 : 选项.label),
        ]),
      ]),
    ])
    const 未覆盖 = [...RIBBON_TABS, ...表格标签, ...演示标签]
      .flatMap((标签) => 收集功能区文案([标签]))
      .filter((文案) => {
        const 英文 = 翻译界面文本(文案, 'en-US')
        return 英文 !== '海豹办公' && /[\u3400-\u9fff]/u.test(英文)
      })
    expect(未覆盖).toEqual([])
  })

  it('翻译当前及后来插入的界面节点，但不改动用户内容区域', async () => {
    render(<SettingsProvider><夹具 /></SettingsProvider>)
    const 打开 = await screen.findByRole('button', { name: 'Open' })
    await userEvent.click(打开)
    expect(await screen.findByText('Save')).toBeInTheDocument()
    expect(screen.getByText('打开', { selector: '[contenteditable="true"]' })).toBeInTheDocument()
    expect(screen.getByText('首页', { selector: '.wps-sheet span' })).toBeInTheDocument()
    expect(screen.getByText('设置', { selector: '[data-ui-language-ignore="true"]' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '切换回中文' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '打开' })).toBeInTheDocument())
    expect(screen.getByText('保存')).toBeInTheDocument()
  })
})
