import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider } from 'antd'
import { SettingsProvider } from '../store/settingsStore'
import MultiTablePage from './MultiTablePage'
import NotesPage from './NotesPage'
import { newBaseTable } from './workspaceTools'
import { 桥接 } from '../ipc/bridge'
const show = (node: React.ReactNode) => render(<SettingsProvider><ConfigProvider button={{autoInsertSpace:false}}><App>{node}</App></ConfigProvider></SettingsProvider>)
beforeEach(() => localStorage.clear())
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
it('英文多维表格的动态计数使用英文，原有表名仍保持原文', () => {
  localStorage.setItem('seal-language', 'en-US')
  show(<MultiTablePage/>)
  expect(screen.getByText('0 records · 5 fields')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '项目任务' })).toBeInTheDocument()
})
it('真实多维表格表单新增、看板与搜索共用记录，重开保留零预算', async () => {
  const user = userEvent.setup(), result = show(<MultiTablePage/>)
  await user.click(screen.getByRole('button',{name:'添加记录'}))
  fireEvent.change(within(screen.getByRole('dialog')).getByRole('textbox',{name:'事项'}),{target:{value:'新项目😀'}})
  fireEvent.change(within(screen.getByRole('dialog')).getByRole('spinbutton',{name:'预算'}),{target:{value:'0'}})
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'保存'}))
  await waitFor(() => expect(JSON.parse(localStorage.getItem('seal-multitable-v1')!).tables[0].records[0].values).toMatchObject({title:'新项目😀',amount:0}))
  await user.click(screen.getByRole('button',{name:'看板'})); expect(screen.getByRole('button',{name:'新项目😀'})).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('搜索记录'),{target:{value:'不存在'}}); expect(screen.queryByRole('button',{name:'新项目😀'})).not.toBeInTheDocument()
  result.unmount(); show(<MultiTablePage/>); expect(await screen.findByText('新项目😀')).toBeInTheDocument()
})
it('笔记真实输入自动保存、Markdown安全预览及置顶回收状态可恢复', async () => {
  const user = userEvent.setup(); show(<NotesPage/>)
  await user.click(screen.getByRole('button',{name:'新建笔记'}))
  fireEvent.change(screen.getByLabelText('笔记标题'),{target:{value:'工作记录'}})
  fireEvent.change(screen.getByLabelText('笔记正文'),{target:{value:'# 项目复盘\n\n- [x] 已完成\n<script>window.bad=1</script>\n\n![本机配图](data:image/png;base64,iVBORw0KGgo=)\n![无效脚本](javascript:alert(1))'}})
  await user.click(screen.getByRole('button',{name:'置顶'})); await user.click(screen.getByRole('button',{name:'预览'}))
  expect(screen.getByRole('heading',{name:'项目复盘'})).toBeInTheDocument(); expect(document.querySelector('.notes-markdown script')).toBeNull()
  expect(screen.getByRole('img',{name:'本机配图'})).toHaveAttribute('src','data:image/png;base64,iVBORw0KGgo=')
  expect(screen.getByRole('img',{name:'无效脚本'})).not.toHaveAttribute('src','javascript:alert(1)')
  await user.click(screen.getByRole('button',{name:'移到回收站'})); expect(JSON.parse(localStorage.getItem('seal-notes-v1')!).notes[0]).toMatchObject({title:'工作记录',pinned:true,trashed:true})
  await user.click(screen.getByRole('button',{name:'恢复'})); expect(JSON.parse(localStorage.getItem('seal-notes-v1')!).notes[0].trashed).toBe(false)
})
it('损坏的两种应用数据保持原文并提供原始备份入口', () => {
  for (const [key,Node] of [['seal-multitable-v1',MultiTablePage],['seal-notes-v1',NotesPage]] as const) { localStorage.setItem(key,'{bad'); const result = show(<Node/>); expect(screen.getByRole('button',{name:/导出原始备份/})).toBeInTheDocument(); expect(localStorage.getItem(key)).toBe('{bad'); result.unmount() }
})
it('损坏数据可通过真实恢复文件流程修复，确认前保留原文', async () => {
  localStorage.setItem('seal-multitable-v1','{bad')
  const user = userEvent.setup(), result = show(<MultiTablePage/>), table = newBaseTable('恢复的数据')
  const file = new File(['backup'],'backup.json',{type:'application/json'})
  Object.defineProperty(file,'text',{value:async()=>JSON.stringify({schema:1,tables:[table]})})
  fireEvent.change(result.container.querySelector('input[type=file]')!,{target:{files:[file]}})
  const dialog = await screen.findByRole('dialog')
  expect(localStorage.getItem('seal-multitable-v1')).toBe('{bad')
  await user.click(within(dialog).getByRole('button',{name:'恢复'}))
  await waitFor(()=>expect(JSON.parse(localStorage.getItem('seal-multitable-v1')!).tables[0].name).toBe('恢复的数据'))
  expect(screen.getByRole('tab',{name:'恢复的数据'})).toBeInTheDocument()
})
it('删除正在筛选的状态字段后仍显示原记录，不能留下无法清除的隐形筛选', async () => {
  const table = newBaseTable(); table.records = [{id:'record',updated:1,values:{title:'筛选后的原记录',status:'待开始'}}]
  localStorage.setItem('seal-multitable-v1',JSON.stringify({schema:1,tables:[table]}))
  const user=userEvent.setup();show(<MultiTablePage/>)
  await user.click(screen.getByRole('combobox',{name:'筛选状态'}))
  await user.click(screen.getByText('待开始',{selector:'.ant-select-item-option-content'}))
  expect(screen.getByText('筛选后的原记录')).toBeInTheDocument()
  await user.click(within(screen.getByText('状态 · 状态').closest('div')!).getByRole('button',{name:'删除字段：状态'}))
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('删除字段「状态」？1 条记录中的该字段值将一并删除')
  await user.click(within(dialog).getByRole('button',{name:'删除字段'}))
  await waitFor(()=>expect(JSON.parse(localStorage.getItem('seal-multitable-v1')!).tables[0].fields.some((f:{id:string})=>f.id==='status')).toBe(false))
  expect(screen.getByText('筛选后的原记录')).toBeInTheDocument()
})

it('记录行、字段条与页脚使用图标按钮：只操作所点对象，导出筛选后的记录', async () => {
  const table = newBaseTable()
  table.records = [{id:'a',updated:1,values:{title:'甲记录',status:'待开始'}},{id:'b',updated:2,values:{title:'乙记录',status:'进行中'}},{id:'c',updated:3,values:{title:'丙记录',status:'已完成'}}]
  localStorage.setItem('seal-multitable-v1',JSON.stringify({schema:1,tables:[table]}))
  const user = userEvent.setup(), result = show(<MultiTablePage/>)
  const edit = screen.getByRole('button',{name:'编辑记录：乙记录'}), remove = screen.getByRole('button',{name:'删除记录：乙记录'})
  expect(edit.querySelector('svg')?.getAttribute('data-icon')).toBe('edit')
  expect(remove.querySelector('svg')?.getAttribute('data-icon')).toBe('trash')
  expect(edit.closest('.tool-row-actions')).toBe(remove.closest('.tool-row-actions'))
  // 点图标不切换行选中状态
  await user.click(edit)
  expect(within(await screen.findByRole('dialog')).getByRole('textbox',{name:'事项'})).toHaveValue('乙记录')
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:/取\s*消/}))
  expect(result.container.querySelectorAll('.ant-table-row-selected')).toHaveLength(0)
  await user.click(remove)
  const dialog = await screen.findByRole('dialog',{name:'删除记录'})
  expect(dialog).toHaveTextContent('删除记录「乙记录」？')
  await user.click(within(dialog).getByRole('button',{name:'删除记录'}))
  await waitFor(()=>expect(JSON.parse(localStorage.getItem('seal-multitable-v1')!).tables[0].records.map((r:{id:string})=>r.id)).toEqual(['a','c']))
  // 字段条：齿轮与垃圾桶并排，提示带字段名
  const settings = screen.getByRole('button',{name:'设置字段「事项」'})
  expect(settings.querySelector('svg')?.getAttribute('data-icon')).toBe('settings')
  expect(settings.closest('.seal-icon-actions')).toBe(screen.getByRole('button',{name:'删除字段：事项'}).closest('.seal-icon-actions'))
  // 页脚导出图标：三条记录筛到一条，CSV 只含该条
  vi.spyOn(桥接, 'showSaveDialog').mockResolvedValue('/tmp/视图.csv' as never)
  const saved = vi.spyOn(桥接, 'saveToFile').mockResolvedValue({ 成功: true } as never)
  fireEvent.change(screen.getByRole('textbox',{name:'搜索记录'}),{target:{value:'丙'}})
  const exportButton = screen.getByRole('button',{name:'导出当前视图 CSV'})
  expect(exportButton.querySelector('svg')?.getAttribute('data-icon')).toBe('export-file')
  await user.click(exportButton)
  await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1))
  const csv = String(saved.mock.calls[0][1])
  expect(csv).toContain('丙记录'); expect(csv).not.toContain('甲记录')
})

it('只剩一个字段时删除图标禁用并说明原因', () => {
  const table = newBaseTable(); table.fields = [table.fields[0]]
  localStorage.setItem('seal-multitable-v1',JSON.stringify({schema:1,tables:[table]}))
  show(<MultiTablePage/>)
  const remove = screen.getByRole('button',{name:'删除字段：事项'})
  expect(remove).toBeDisabled()
  expect(remove).toHaveAttribute('title','至少保留一个字段，不能删除')
})
