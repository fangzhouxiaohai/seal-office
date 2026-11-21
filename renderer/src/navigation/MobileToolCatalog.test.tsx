import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { AppProvider } from '../store'
import MobileServices from '../../../mobile/web/services'
import { quickCreateGroups, lookupEntry, decodeToolRoute, routeForEntry } from '../../../mobile/web/toolCatalog'

const modes = ['文件扫描','照片转PDF','拍照转Word','拍照转Excel','提取文字','图片翻译','证件扫描','去除手写','拍书籍']

describe('手机版服务直达', () => {
  it('九个拍照入口能还原各自的初始模式', () => {
    for (const mode of modes) {
      const entry = lookupEntry(mode)
      expect(decodeToolRoute(routeForEntry(entry))).toEqual({ kind:'scan', mode })
    }
    expect(decodeToolRoute('scan:未登记')).toBeNull()
  })

  it('首页快速创建包含录音、扫描、模板、简历和四类可编辑文件', () => {
    const ids = quickCreateGroups.flatMap(group => group.ids)
    for (const id of ['audio-text','文件扫描','templates','resume','word','ppt','table','pdf','collect-form']) expect(ids).toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach(id => expect(lookupEntry(id).label).toBeTruthy())
  })

  it('搜索跨越所有分类且能直接打开所选扫描或非扫描工具', async () => {
    const opened:string[]=[]
    render(<AntApp><AppProvider><MobileServices onOpen={entry=>opened.push(entry.id)}/></AppProvider></AntApp>)
    const input = screen.getByRole('searchbox', {name:'搜索办公服务'})
    for(const [query, label, id] of [['ＯＣＲ','拍照提取文字','提取文字'],['CAD转PDF','CAD 转 PDF','cad-pdf'],['抠图','一键抠图','cutout']]) {
      fireEvent.change(input, {target:{value:query}})
      fireEvent.click(screen.getByRole('button',{name:label}))
      expect(opened.at(-1)).toBe(id)
    }
    fireEvent.change(input,{target:{value:'完全不存在的工具'}})
    expect(screen.getByRole('status')).toHaveTextContent('未找到')
    fireEvent.change(input,{target:{value:''}})
    fireEvent.click(screen.getByRole('button',{name:'团队服务'}))
    expect(within(screen.getByRole('region',{name:'全部办公服务'})).getByRole('button',{name:'知识库'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'拍照转 Word'})).not.toBeInTheDocument()
  })
})
