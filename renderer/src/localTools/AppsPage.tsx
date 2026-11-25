import { App as AntdApp } from 'antd'
import Icon from '../components/Icon'
import { 桥接 } from '../ipc/bridge'
import { useAppStore } from '../store'
import { navigationAvailable } from '../navConfig'
import { 取色调 } from '../components/navTones'
import { useT } from '../i18n/t'
import type { 文案键 } from '../i18n/ledger'
import './localTools.css'

type 应用分类 = 'edit' | 'local' | 'settings'

interface 应用入口 {
  图标: string
  键: 'word' | 'table' | 'ppt' | 'pdf' | 'database' | 'calendar' | 'scan' | 'receipt' | 'mindmap' | 'flow' | 'multitable' | 'design' | 'notes' | 'knowledge' | 'ai' | 'settings'
  分类: 应用分类
  打开: () => void
}

export default function AppsPage() {
  const { modal } = AntdApp.useApp()
  const t = useT()
  const { createDoc, setNavKey, showSettings } = useAppStore()
  const 打开助手 = () => {
    if (!桥接.ai.可用) {
      modal.error({ title: t('apps.ai.unavailable.title'), content: t('apps.ai.unavailable.content') })
      return
    }
    window.dispatchEvent(new Event('seal-open-assistant'))
  }
  const 入口: 应用入口[] = [
    { 键: 'word', 图标: 'doc-word', 分类: 'edit', 打开: () => createDoc('word') },
    { 键: 'table', 图标: 'doc-table', 分类: 'edit', 打开: () => createDoc('table') },
    { 键: 'ppt', 图标: 'doc-ppt', 分类: 'edit', 打开: () => createDoc('ppt') },
    { 键: 'pdf', 图标: 'pdf', 分类: 'edit', 打开: () => createDoc('pdf') },
    { 键: 'database', 图标: 'doc-table', 分类: 'edit', 打开: () => setNavKey('database') },
    { 键: 'calendar', 图标: 'calendar', 分类: 'local', 打开: () => setNavKey('calendar') },
    { 键: 'scan', 图标: 'scan', 分类: 'local', 打开: () => setNavKey('scan') },
    { 键: 'receipt', 图标: 'doc-table', 分类: 'local', 打开: () => setNavKey('receipt') },
    { 键: 'mindmap', 图标: 'mindmap', 分类: 'local', 打开: () => setNavKey('mindmap') },
    { 键: 'flow', 图标: 'flow', 分类: 'local', 打开: () => setNavKey('flow') },
    { 键: 'multitable', 图标: 'doc-table', 分类: 'local', 打开: () => setNavKey('multitable') },
    { 键: 'design', 图标: 'edit', 分类: 'local', 打开: () => setNavKey('design') },
    { 键: 'notes', 图标: 'doc-word', 分类: 'local', 打开: () => setNavKey('notes') },
    { 键: 'knowledge', 图标: 'knowledge', 分类: 'local', 打开: () => setNavKey('knowledge') },
    { 键: 'ai', 图标: 'ai', 分类: 'local', 打开: 打开助手 },
    { 键: 'settings', 图标: 'settings', 分类: 'settings', 打开: showSettings },
  ]

  return <div className="local-page">
    <header className="local-page__header"><div><h1>{t('apps.page.title')}</h1><p>{t('apps.page.description')}</p></div></header>
    {(['edit', 'local', 'settings'] as const).map((分类) => <section className="apps-section" key={分类}>
      <h2>{t(`apps.category.${分类}` as 文案键)}</h2>
      <div className="apps-grid">
        {入口.filter((项) => 项.分类 === 分类 && (项.键 !== 'database' || navigationAvailable('database'))).map((项) => <button className="apps-entry" type="button" key={项.键} data-tone={取色调(项.键)} onClick={项.打开}>
          <span className="seal-tone-chip seal-tone-chip--lg" data-tone={取色调(项.键)} aria-hidden="true"><Icon name={项.图标} size={22} variant="outline" /></span>
          <span><strong>{t(`apps.${项.键}.name` as 文案键)}</strong><small>{t(`apps.${项.键}.description` as 文案键)}</small></span>
        </button>)}
      </div>
    </section>)}
  </div>
}
