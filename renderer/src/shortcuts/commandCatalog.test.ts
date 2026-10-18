import { expect, it } from 'vitest'
import { 命令表 } from '../editor/commands'
import { 表格命令表 } from '../sheet/sheetCommands'
import { 演示命令表 } from '../ppt/pptCommands'
import { commandCatalog } from './commandCatalog'
import { shortcutDefinitions } from './shortcuts'

it('每个已实现通用命令均有可配置快捷键，目录中的命令实际存在', () => {
  for (const [scope,registry] of [['word',命令表],['sheet',表格命令表],['ppt',演示命令表]] as const) {
    const registered = Object.keys(registry).filter(id => !(scope==='sheet' && ['insert.pivot','cell.format'].includes(id)))
    const configured = shortcutDefinitions.filter(item=>item.scope===scope).flatMap(item=>[item.command,item.targetCommand??item.command])
    expect(registered.filter(id=>!configured.includes(id)),scope+' missing').toEqual([])
    expect(commandCatalog[scope].map(([id])=>id).filter(id=>!registry[id]),scope+' invalid').toEqual([])
  }
})
