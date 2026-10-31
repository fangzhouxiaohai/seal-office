import { App as AntdApp } from 'antd'
import Icon from '../components/Icon'
import { 桥接 } from '../ipc/bridge'
import { useAppStore } from '../store'
import { navigationAvailable } from '../navConfig'
import { 取色调 } from '../components/navTones'
import './localTools.css'

interface 应用入口 {
  名称: string
  说明: string
  图标: string
  键: string
  分类: '编辑文件' | '本地工具' | '应用设置'
  打开: () => void
}

export default function AppsPage() {
  const { modal } = AntdApp.useApp()
  const { createDoc, setNavKey, showSettings } = useAppStore()
  const 打开助手 = () => {
    if (!桥接.ai.可用) {
      modal.error({ title: '智能助手不可用', content: '请在 Windows 桌面版中配置模型服务商后使用。' })
      return
    }
    window.dispatchEvent(new Event('seal-open-assistant'))
  }
  const 入口: 应用入口[] = [
    { 名称: '文字', 键: 'word', 说明: '编写与编辑文档', 图标: 'doc-word', 分类: '编辑文件', 打开: () => createDoc('word') },
    { 名称: '表格', 键: 'table', 说明: '整理与计算数据', 图标: 'doc-table', 分类: '编辑文件', 打开: () => createDoc('table') },
    { 名称: '演示', 键: 'ppt', 说明: '制作幻灯片', 图标: 'doc-ppt', 分类: '编辑文件', 打开: () => createDoc('ppt') },
    { 名称: 'PDF 工具', 键: 'pdf', 说明: '阅读和处理 PDF 文件', 图标: 'pdf', 分类: '编辑文件', 打开: () => createDoc('pdf') },
    { 名称: 'Access 数据库', 键: 'database', 说明: '维护 MDB 与 ACCDB 数据库', 图标: 'doc-table', 分类: '编辑文件', 打开: () => setNavKey('database') },
    { 名称: '本机日历', 键: 'calendar', 说明: '安排日程并导出日历文件', 图标: 'calendar', 分类: '本地工具', 打开: () => setNavKey('calendar') },
    { 名称: '脑图', 键: 'mindmap', 说明: '梳理主题与分支', 图标: 'mindmap', 分类: '本地工具', 打开: () => setNavKey('mindmap') },
    { 名称: '流程图', 键: 'flow', 说明: '绘制步骤和连接关系', 图标: 'flow', 分类: '本地工具', 打开: () => setNavKey('flow') },
    { 名称: '多维表格', 键: 'multitable', 说明: '数据表、看板与表单共用记录', 图标: 'doc-table', 分类: '本地工具', 打开: () => setNavKey('multitable') },
    { 名称: '设计', 键: 'design', 说明: '海报、方图、横幅和信息长图', 图标: 'edit', 分类: '本地工具', 打开: () => setNavKey('design') },
    { 名称: '笔记', 键: 'notes', 说明: 'Markdown、笔记本、标签与回收站', 图标: 'doc-word', 分类: '本地工具', 打开: () => setNavKey('notes') },
    { 名称: '知识库', 键: 'knowledge', 说明: '整理资料与检索个人知识', 图标: 'knowledge', 分类: '本地工具', 打开: () => setNavKey('knowledge') },
    { 名称: '智能助手', 键: 'ai', 说明: '对话修改当前打开的文件', 图标: 'ai', 分类: '本地工具', 打开: 打开助手 },
    { 名称: '设置', 键: 'settings', 说明: '调整应用与模型服务配置', 图标: 'settings', 分类: '应用设置', 打开: showSettings },
  ]

  return <div className="local-page">
    <header className="local-page__header"><div><h1>应用</h1><p>打开本机可用的办公工具。</p></div></header>
    {(['编辑文件', '本地工具', '应用设置'] as const).map((分类) => <section className="apps-section" key={分类}>
      <h2>{分类}</h2>
      <div className="apps-grid">
        {入口.filter((项) => 项.分类 === 分类 && (项.名称 !== 'Access 数据库' || navigationAvailable('database'))).map((项) => <button className="apps-entry" type="button" key={项.名称} data-tone={取色调(项.键)} onClick={项.打开}>
          <span className="seal-tone-chip seal-tone-chip--lg" data-tone={取色调(项.键)} aria-hidden="true"><Icon name={项.图标} size={22} variant="outline" /></span>
          <span><strong>{项.名称}</strong><small>{项.说明}</small></span>
        </button>)}
      </div>
    </section>)}
  </div>
}
