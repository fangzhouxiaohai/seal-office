import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { 演示标签 } from './ribbonSpecs'
import { 演示命令表 } from './pptCommands'
import { 读取演示命令状态 } from './model/commandStatus'

interface 条目 { commandId?: string; kind?: string; options?: unknown[]; label?: string }
const 全部条目 = (): 条目[] => {
  const 结果: 条目[] = []
  for (const 标签 of 演示标签) for (const 组 of 标签.groups) for (const 项 of 组.items as unknown as 条目[]) if (项.commandId) 结果.push(项)
  return 结果
}
const 编辑器源码 = (() => {
  for (const 候选 of ['renderer/src/ppt/PptEditor.tsx', 'src/ppt/PptEditor.tsx', '../ppt/PptEditor.tsx']) {
    const 路径 = resolve(process.cwd(), 候选)
    if (existsSync(路径)) return readFileSync(路径, 'utf8')
  }
  throw new Error('测试无法定位 PptEditor.tsx，工作目录：' + process.cwd())
})()

describe('复审：功能区入口与命令实现必须一致', () => {
  it('功能区入口要么注册在命令表，要么由编辑器显式派发，不存在点了没反应的死按钮', () => {
    const 缺失 = 全部条目().map(项 => 项.commandId!).filter(标识 => !演示命令表[标识])
    const 无派发 = Array.from(new Set(缺失)).filter(标识 => !编辑器源码.includes(`标识 === '${标识}'`))
    expect(无派发).toEqual([])
  })

  it('命令表里不能有「只弹后续版本提示、却被标为可用」的空实现', () => {
    const 占位命令 = Object.values(演示命令表)
      .filter(命令 => {
        const 提示: string[] = []
        const 上下文 = {
          文稿: { 幻灯片列表: [{ id: '页', 文本框列表: [], 背景色: '#FFFFFF', 版式: '空白' }], 当前索引: 0, id: '稿', name: '稿' },
          选中框标识: null, 更新文稿: () => {}, notify: (文本: string) => 提示.push(文本),
          撤销: () => {}, 重做: () => {}, 提示功能限制: () => {}, 切换视图: () => {},
        }
        try { (命令.run as unknown as (上下文: unknown, 参数?: string) => void)(上下文, '矩形') } catch { /* 缺上下文导致的失败不算占位 */ }
        return 提示.some(文本 => /将在后续版本接入|开发中|暂不支持/.test(文本))
      })
      .map(命令 => 命令.id)
      .filter(标识 => 读取演示命令状态(标识).状态 === '可用')
    expect(占位命令).toEqual([])
  })

  it('下拉入口必须有候选项，避免空菜单', () => {
    const 空下拉 = 全部条目().filter(项 => 项.kind === 'dropdown' && (!Array.isArray(项.options) || 项.options.length === 0))
    expect(空下拉.map(项 => 项.commandId)).toEqual([])
  })

  it('命令表里的命令必须能从功能区或右键菜单触达，避免不可用的死代码', () => {
    const 功能入口 = new Set(全部条目().map(项 => 项.commandId!))
    const 右键入口 = new Set([...编辑器源码.matchAll(/commandId: '([^']+)'/g)].map(匹配 => 匹配[1]))
    // view.prev / view.next 目前没有入口（既不在功能区也不在右键菜单），已作为复审发现登记；
    // 这里显式列出，保证新增的死命令仍然会让测试失败。
    const 已知未接入 = new Set(['view.prev', 'view.next'])
    const 不可达 = Object.keys(演示命令表).filter(标识 => !功能入口.has(标识) && !右键入口.has(标识) && !已知未接入.has(标识))
    expect(不可达).toEqual([])
  })

  it('暂不可用的入口必须有非空原因，不能只有结果没有解释', () => {
    const 无原因 = Object.keys(演示命令表).filter(标识 => {
      const 状态 = 读取演示命令状态(标识)
      return 状态.状态 === '暂不可用' && !状态.原因
    })
    expect(无原因).toEqual([])
  })
})
