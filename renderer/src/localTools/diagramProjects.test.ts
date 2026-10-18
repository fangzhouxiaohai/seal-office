import { describe, expect, it } from 'vitest'
import { DiagramProjectStore, createDiagramProject, editDiagramProject, moveDiagramHistory, diagramProjectPrefix, legacyDiagramKey } from './diagramProjects'
import { 新建图 } from './diagramData'

class MemoryStorage implements Storage {
  map = new Map<string, string>(); blocked = false
  get length() { return this.map.size }
  key(index: number) { return [...this.map.keys()][index] ?? null }
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { if (this.blocked) throw Error('空间不足'); this.map.set(key, value) }
  removeItem(key: string) { if (this.blocked) throw Error('禁止写入'); this.map.delete(key) }
  clear() { this.map.clear() }
}
const setup = (type: '脑图' | '流程图' = '脑图') => { const disk = new MemoryStorage(), drafts = new MemoryStorage(), memory = new Map(); return { disk, drafts, memory, store: new DiagramProjectStore(type, disk, drafts, memory) } }

describe('图工具独立项目存储', () => {
  it('浏览器禁用Storage属性访问时仍可打开错误列表并保留内存草稿', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!, sessionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')!
    try {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('存储已禁用') } }); Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw Error('会话存储已禁用') } })
      const store = new DiagramProjectStore('脑图'); expect(store.load().issues).not.toHaveLength(0); const failed = store.write(createDiagramProject('脑图', '无法持久化'), null); expect(failed.pending).toEqual({ error: '存储已禁用', durable: false }); expect(store.load().items.find(s => s.project.id === failed.project.id)?.project.title).toBe('无法持久化')
    } finally { Object.defineProperty(globalThis, 'localStorage', descriptor); Object.defineProperty(globalThis, 'sessionStorage', sessionDescriptor) }
  })
  it('A/B 内容和持久撤销栈隔离，重建实例仍可撤销A，不改变B', () => {
    const { store, disk, drafts, memory } = setup(); let a = store.write(createDiagramProject('脑图', '甲'), null), b = store.write(createDiagramProject('脑图', '乙'), null)
    a = store.write(editDiagramProject(a.project, { ...a.project.graph, 节点: a.project.graph.节点.map(n => ({ ...n, 文本: '甲的正文' })) }), a.baseRevision)
    b = store.write(editDiagramProject(b.project, { ...b.project.graph, 节点: b.project.graph.节点.map(n => ({ ...n, 文本: '乙的正文' })) }), b.baseRevision)
    const reloaded = new DiagramProjectStore('脑图', disk, drafts, memory); const savedA = reloaded.load().items.find(s => s.project.id === a.project.id)!
    const undone = reloaded.write(moveDiagramHistory(savedA.project, -1)!, savedA.baseRevision)
    expect(undone.project.graph.节点[0].文本).toBe('中心主题'); expect(reloaded.load().items.find(s => s.project.id === b.project.id)!.project.graph.节点[0].文本).toBe('乙的正文')
  })
  it('两种旧单图各安全迁移一次，原数据与备份字节保留，永久删除不复活', () => {
    for (const type of ['脑图', '流程图'] as const) {
      const { store, disk } = setup(type), raw = JSON.stringify(新建图(type)); disk.setItem(legacyDiagramKey(type), raw)
      const first = store.load(); expect(first.issues).toEqual([]); expect(first.items).toHaveLength(1); expect(first.items[0].project.title).toBe(`我的${type}`)
      expect(disk.getItem(legacyDiagramKey(type))).toBe(raw); expect(disk.getItem(legacyDiagramKey(type) + ':backup-v2')).toBe(raw)
      const deleted = store.write({ ...first.items[0].project, trashedAt: Date.now() }, first.items[0].baseRevision); store.permanentlyDelete(deleted)
      expect(store.load().items).toEqual([]); expect(disk.getItem(legacyDiagramKey(type))).toBe(raw)
    }
  })
  it('迁移配额/损坏失败不写完成标记，不覆盖旧数据，恢复空间后可重试', () => {
    const { store, disk } = setup(), raw = JSON.stringify(新建图('脑图')); disk.setItem(legacyDiagramKey('脑图'), raw); disk.blocked = true
    expect(store.load().issues[0].message).toContain('空间不足'); expect(disk.getItem('seal-diagram-migration-v2:mindmap')).toBeNull(); expect(disk.getItem(legacyDiagramKey('脑图'))).toBe(raw)
    disk.blocked = false; expect(store.load().items).toHaveLength(1)
    const invalid = setup('流程图'); invalid.disk.setItem(legacyDiagramKey('流程图'), '{broken'); expect(invalid.store.load().issues).toHaveLength(1); expect([...invalid.disk.map.keys()].some(k => k.startsWith(diagramProjectPrefix('流程图')))).toBe(false)
  })
  it('迁移最后标记失败后重试不重放旧图，永久删除前必须完成迁移标记', () => {
    const { store, disk } = setup(), set = disk.setItem.bind(disk), marker = 'seal-diagram-migration-v2:mindmap'; disk.setItem(legacyDiagramKey('脑图'), JSON.stringify(新建图('脑图')))
    let rejectMarker = true; disk.setItem = (key, value) => { if (key === marker && rejectMarker) throw Error('标记不可写'); set(key, value) }
    const initial = store.load(); expect(initial.issues).toHaveLength(1); expect(initial.items).toHaveLength(1)
    const edited = store.write(editDiagramProject(initial.items[0].project, { 节点: [{ id: 'edited', 文本: '迁移后编辑', x: 1, y: 1 }], 连线: [] }), initial.items[0].baseRevision)
    expect(store.load().items[0].project.graph.节点[0].文本).toBe('迁移后编辑')
    const trashed = store.write({ ...edited.project, trashedAt: Date.now() }, edited.baseRevision); expect(() => store.permanentlyDelete(trashed)).toThrow('标记不可写')
    rejectMarker = false; store.permanentlyDelete(trashed); expect(store.load().items).toEqual([])
  })
  it('失败后保留新内容及历史至会话草稿，重载可恢复，重试才宣告保存', () => {
    const { store, disk, drafts } = setup(); const original = store.write(createDiagramProject('脑图', '草稿'), null); disk.blocked = true
    const edited = editDiagramProject(original.project, { ...original.project.graph, 节点: original.project.graph.节点.map(n => ({ ...n, 文本: '不能丢失' })) }), failed = store.write(edited, original.baseRevision)
    expect(failed.pending?.error).toContain('空间不足'); expect(failed.pending?.durable).toBe(true)
    const reloaded = new DiagramProjectStore('脑图', disk, drafts, new Map()).load().items[0]; expect(reloaded.project.graph.节点[0].文本).toBe('不能丢失'); expect(reloaded.project.history.items).toHaveLength(2)
    expect(JSON.parse(disk.getItem(diagramProjectPrefix('脑图') + original.project.id)!).graph.节点[0].文本).toBe('中心主题')
    disk.blocked = false; const retried = store.write(reloaded.project, reloaded.baseRevision); expect(retried.pending).toBeUndefined(); expect(new DiagramProjectStore('脑图', disk, drafts, new Map()).load().items[0].project.graph.节点[0].文本).toBe('不能丢失')
  })
  it('磁盘和会话都不可写仍保留内存草稿，拒绝删除未保存草稿', () => {
    const { store, disk, drafts, memory } = setup(); const original = store.write(createDiagramProject('脑图', '草稿'), null); disk.blocked = drafts.blocked = true
    const failed = store.write(editDiagramProject(original.project, 新建图('脑图')), original.baseRevision); expect(failed.pending?.durable).toBe(false)
    expect(new DiagramProjectStore('脑图', disk, drafts, memory).load().items[0].pending).toBeTruthy(); expect(() => store.permanentlyDelete(failed)).toThrow('草稿')
  })
  it('第二窗口的新版本不得被陈旧编辑或恢复草稿静默覆盖', () => {
    const { store, disk, drafts } = setup(), initial = store.write(createDiagramProject('脑图', '并发'), null)
    const other = new DiagramProjectStore('脑图', disk, drafts, new Map()), changed = other.write({ ...initial.project, title: '另一窗口' }, initial.baseRevision)
    const conflict = store.write({ ...initial.project, title: '本机草稿' }, initial.baseRevision); expect(conflict.pending?.error).toContain('另一窗口'); expect(JSON.parse(disk.getItem(diagramProjectPrefix('脑图') + initial.project.id)!).revision).toBe(changed.project.revision)
  })
  it('成功重试后清理会话草稿失败，也不会在重载后复活旧草稿', () => {
    const { store, disk, drafts } = setup(), original = store.write(createDiagramProject('脑图', '旧草稿'), null)
    disk.blocked = true; const failed = store.write({ ...original.project, title: '待提交' }, original.baseRevision); expect(failed.pending).toBeTruthy()
    disk.blocked = false; drafts.blocked = true; const retried = store.write(failed.project, failed.baseRevision); expect(retried.pending).toBeUndefined()
    const next = store.write({ ...retried.project, title: '提交后的更新' }, retried.baseRevision); expect(next.pending).toBeUndefined()
    const restored = new DiagramProjectStore('脑图', disk, drafts, new Map()).load().items[0]; expect(restored.project.title).toBe('提交后的更新'); expect(restored.pending).toBeUndefined()
  })
  it('复制和回收站保留原图且历史独立，拒绝伪造/损坏的记录', () => {
    const { store, disk } = setup(), original = store.write(createDiagramProject('脑图', '甲'), null)
    const copy = store.write(createDiagramProject('脑图', '甲 副本', original.project.graph), null); expect(copy.project.id).not.toBe(original.project.id); expect(copy.project.history.items).toHaveLength(1)
    const trashed = store.write({ ...original.project, trashedAt: Date.now() }, original.baseRevision), restored = store.write({ ...trashed.project, trashedAt: undefined }, trashed.baseRevision); expect(restored.project.graph).toEqual(original.project.graph)
    disk.setItem(diagramProjectPrefix('脑图') + 'bad', JSON.stringify({ ...original.project, id: 'bad', history: { items: [], index: 100 } })); expect(store.load().issues).toHaveLength(1); expect(store.load().items).toHaveLength(2)
  })
})
