// 最近文档列表行：与网格卡片提供相同的文件操作。
import { useState } from 'react'
import { App as AntdApp, Dropdown, Input, Modal } from 'antd'
import { 桥接 } from '../ipc/bridge'
import { formatSize, formatTime, type DocItem } from '../mock/recentDocs'
import { DOC_TYPE_COLOR, DOC_TYPE_ICON, DOC_TYPE_LABEL } from '../docMeta'
import Icon from './Icon'

interface Props {
  doc: DocItem
  onOpen?: (标识: string) => void
  onToggleStar?: (标识: string) => void
  onRename?: (标识: string, 名称: string) => Promise<void> | void
  onRemove?: (标识: string) => void
  /** 批量管理：整行改为勾选，不触发打开 */
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (标识: string) => void
}

const DocRow = ({ doc, onOpen, onToggleStar, onRename, onRemove, selectable = false, selected = false, onToggleSelect }: Props) => {
  const { modal } = AntdApp.useApp()
  const [重命名中, 设重命名中] = useState(false)
  const [草稿名称, 设草稿名称] = useState(doc.name)

  const 确认重命名 = async () => {
    const 名称 = 草稿名称.trim()
    if (!名称) {
      modal.warning({ title: '文档名称无效', content: '请输入文件名称后再保存。', okText: '确定' })
      return
    }
    try {
      await onRename?.(doc.id, 名称)
      设重命名中(false)
    } catch (错误) {
      modal.error({ title: '重命名失败', content: 错误 instanceof Error ? 错误.message : '无法重命名文件', okText: '确定' })
    }
  }

  const 确认移除 = () => modal.confirm({
    title: '从最近列表移除',
    content: `确定从最近列表移除「${doc.name}」吗？磁盘中的文件不会删除。`,
    okText: '移除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => onRemove?.(doc.id),
  })

  const 打开所在文件夹 = async () => {
    try {
      const 结果 = await 桥接.revealInFolder(doc.路径 ?? '')
      if (!结果.成功) throw new Error(结果.错误 || '无法定位文件')
    } catch (错误) {
      modal.error({ title: '打开所在文件夹失败', content: 错误 instanceof Error ? 错误.message : '无法定位文件', okText: '确定' })
    }
  }

  const 菜单项 = [
    { key: 'open', label: '打开' },
    ...(doc.路径 !== undefined ? [{ key: 'reveal', label: '打开所在文件夹' }] : []),
    { key: 'rename', label: '重命名' },
    { key: 'star', label: doc.starred ? '取消星标' : '添加星标' },
    { type: 'divider' as const },
    { key: 'remove', label: '从最近列表移除' },
  ]

  const 处理菜单点击 = ({ key, domEvent }: { key: string; domEvent: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement> }) => {
    domEvent.stopPropagation()
    switch (key) {
      case 'open': onOpen?.(doc.id); break
      case 'reveal': void 打开所在文件夹(); break
      case 'rename': 设草稿名称(doc.name); 设重命名中(true); break
      case 'star': onToggleStar?.(doc.id); break
      case 'remove': 确认移除(); break
      default: break
    }
  }

  return <>
    <div className={`wps-doc-row${selectable && selected ? ' wps-doc-row--selected' : ''}`}>
      <span className="wps-doc-row__main">
        {selectable
          ? <input
              type="checkbox"
              className="wps-check"
              aria-label={`${selected ? '取消选择' : '选择'} ${doc.name}`}
              checked={selected}
              onChange={() => onToggleSelect?.(doc.id)}
            />
          : null}
        <button
          type="button"
          className="wps-doc-row__name"
          aria-label={selectable ? `${selected ? '取消选择' : '选择'} ${doc.name}` : `打开 ${doc.name}`}
          aria-pressed={selectable ? selected : undefined}
          title={doc.name}
          onClick={() => (selectable ? onToggleSelect?.(doc.id) : onOpen?.(doc.id))}
        >
          <Icon name={DOC_TYPE_ICON[doc.type]} size={18} color={DOC_TYPE_COLOR[doc.type]} className="wps-doc-row__icon" />
          {doc.name}
        </button>
      </span>
      <span className="wps-doc-row__type">{DOC_TYPE_LABEL[doc.type]}</span>
      <span className="wps-doc-row__time">{formatTime(doc.updatedAt)}</span>
      <span className="wps-doc-row__size">{formatSize(doc.size)}</span>
      <span className="wps-doc-row__actions">
        <button type="button" className="wps-doc-row__action wps-doc-row__star" aria-label={doc.starred ? '取消星标' : '添加星标'} title={doc.starred ? '取消星标' : '添加星标'} onClick={() => onToggleStar?.(doc.id)}>
          <Icon name={doc.starred ? 'star-filled' : 'star'} size={15} />
        </button>
        <Dropdown menu={{ items: 菜单项, onClick: 处理菜单点击 }} trigger={['click']}>
          <button type="button" className="wps-doc-row__action" aria-label="更多操作" title="更多操作">
            <Icon name="more" size={16} />
          </button>
        </Dropdown>
      </span>
    </div>
    <Modal open={重命名中} title="重命名文档" okText="确定" cancelText="取消" onOk={() => void 确认重命名()} onCancel={() => 设重命名中(false)}>
      <Input value={草稿名称} placeholder="请输入新的文档名称" maxLength={120} onChange={(事件) => 设草稿名称(事件.target.value)} />
    </Modal>
  </>
}

export default DocRow
