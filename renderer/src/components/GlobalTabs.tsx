import type { KeyboardEvent } from 'react'
import { App as AntdApp, Dropdown } from 'antd'
import Icon from './Icon'
import { useAppStore, type WorkspaceTab } from '../store'
import './bottomTabs.css'
import {flushCloudBeforeClose} from '../cloud/autosaveLifecycle'

const 类型图标: Record<WorkspaceTab['type'], string> = {
  word: 'doc-word',
  table: 'doc-table',
  ppt: 'doc-ppt',
  pdf: 'doc-pdf',
}

const GlobalTabs = () => {
  const { modal } = AntdApp.useApp()
  const { workspaceTabs, activeWorkspaceTabId, selectWorkspaceTab, closeWorkspaceTab, createDoc } = useAppStore()

  const 处理标签按键 = (事件: KeyboardEvent<HTMLButtonElement>) => {
    const 标签按钮 = Array.from(事件.currentTarget.closest('.wps-global-tabs')?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
    const 当前序号 = 标签按钮.indexOf(事件.currentTarget)
    if (当前序号 < 0) return
    let 目标序号: number
    switch (事件.key) {
      case 'ArrowRight': 目标序号 = (当前序号 + 1) % 标签按钮.length; break
      case 'ArrowLeft': 目标序号 = (当前序号 - 1 + 标签按钮.length) % 标签按钮.length; break
      case 'Home': 目标序号 = 0; break
      case 'End': 目标序号 = 标签按钮.length - 1; break
      default: return
    }
    事件.preventDefault()
    标签按钮[目标序号].focus()
    标签按钮[目标序号].click()
  }

  const 请求关闭 = (标签: WorkspaceTab) => {
    if (!标签.dirty) {
      closeWorkspaceTab(标签.id)
      return
    }
    modal.confirm({
      title: '文档有未保存的修改',
      content: `关闭「${标签.name}」将放弃尚未保存的内容。`,
      okText: '放弃修改',
      cancelText: '取消',
      onOk: async () => {await flushCloudBeforeClose(标签.id);closeWorkspaceTab(标签.id)},
    })
  }

  return (
    <div className="wps-global-tabs" role="tablist" aria-label="工作区标签">
      <button
        type="button"
        role="tab"
        aria-selected={activeWorkspaceTabId === 'home'}
        tabIndex={activeWorkspaceTabId === 'home' ? 0 : -1}
        className={`wps-global-tabs__home${activeWorkspaceTabId === 'home' ? ' wps-global-tabs__home--active' : ''}`}
        onClick={() => selectWorkspaceTab('home')}
        onKeyDown={处理标签按键}
      >
        <Icon name="home" size={15} />
        <span>首页</span>
      </button>
      <div className="wps-global-tabs__list" role="presentation">
        {workspaceTabs.map((标签) => (
          <div className={`wps-global-tab${activeWorkspaceTabId === 标签.id ? ' wps-global-tab--active' : ''}`} key={标签.id}>
            <button
              type="button"
              role="tab"
              aria-selected={activeWorkspaceTabId === 标签.id}
              tabIndex={activeWorkspaceTabId === 标签.id ? 0 : -1}
              className="wps-global-tab__select"
              title={标签.path ?? 标签.name}
              onClick={() => selectWorkspaceTab(标签.id)}
              onKeyDown={处理标签按键}
              onDoubleClick={() => {
                try {
                  if (localStorage.getItem('seal-tab-double-click-close') === 'true') 请求关闭(标签)
                } catch (错误) {
                  modal.error({ title: '读取标签设置失败', content: 错误 instanceof Error ? 错误.message : '无法读取本机工作偏好', okText: '确定' })
                }
              }}
            >
              <Icon name={类型图标[标签.type]} size={15} />
              <span className="wps-global-tab__name">{标签.name}</span>
              {标签.dirty && <span className="wps-global-tab__dirty" aria-label="未保存" title="未保存" />}
            </button>
            <button
              type="button"
              className="wps-global-tab__close"
              aria-label={`关闭 ${标签.name}`}
              title={`关闭 ${标签.name}`}
              onClick={() => 请求关闭(标签)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
      <Dropdown menu={{ items: [
        { key: 'word', label: '新建文字' },
        { key: 'table', label: '新建表格' },
        { key: 'ppt', label: '新建演示' },
        { key: 'pdf', label: 'PDF 工具' },
      ], onClick: ({ key }) => createDoc(key as WorkspaceTab['type']) }} trigger={['click']}>
        <button type="button" className="wps-global-tabs__create" aria-label="新建标签" title="新建标签">
          <Icon name="plus" size={15} />
        </button>
      </Dropdown>
    </div>
  )
}

export default GlobalTabs
