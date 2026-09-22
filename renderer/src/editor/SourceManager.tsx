// 文献管理面板：维护引文数据源，供插入引文与生成书目使用。
import React from 'react'
import { Button, Input, Modal } from 'antd'
import Icon from '../components/Icon'
import { 新建文献, type 文献 } from './citation'

interface Props {
  open: boolean
  sources: 文献[]
  onClose: () => void
  onChange: (列表: 文献[]) => void
}

const 字段列表: Array<{ 键: keyof 文献; 占位: string }> = [
  { 键: '作者', 占位: '作者' },
  { 键: '标题', 占位: '标题' },
  { 键: '来源', 占位: '来源' },
  { 键: '年份', 占位: '年份' },
]

const SourceManager = ({ open, sources, onClose, onChange }: Props) => {
  if (!open) {
    return null
  }

  const 更新字段 = (标识: string, 字段: keyof 文献, 值: string) => {
    onChange(sources.map((项) => (项.id === 标识 ? { ...项, [字段]: 值 } : 项)))
  }

  const 添加 = () => {
    onChange([...sources, 新建文献(sources)])
  }

  const 删除 = (标识: string) => {
    onChange(sources.filter((项) => 项.id !== 标识))
  }

  return React.createElement(
    Modal,
    {
      open,
      title: '文献管理',
      width: 720,
      onCancel: onClose,
      footer: React.createElement(
        Button,
        { type: 'primary', onClick: onClose },
        '完成'
      ),
    },
    React.createElement(
      'div',
      { className: 'wps-source-manager' },
      React.createElement(
        'div',
        { className: 'wps-source-manager__toolbar' },
        React.createElement(
          Button,
          { onClick: 添加, icon: React.createElement(Icon, { name: 'plus', size: 14 }) },
          '添加文献'
        ),
        React.createElement(
          'span',
          { className: 'wps-source-manager__count' },
          `共 ${sources.length} 条文献`
        )
      ),
      sources.length === 0
        ? React.createElement('p', { className: 'wps-source-manager__empty' }, '尚未添加文献')
        : React.createElement(
            'div',
            { className: 'wps-source-manager__list' },
            sources.map((项, 下标) =>
              React.createElement(
                'div',
                { key: 项.id, className: 'wps-source-manager__row' },
                React.createElement('span', { className: 'wps-source-manager__index' }, `${下标 + 1}`),
                字段列表.map((字段) =>
                  React.createElement(Input, {
                    key: 字段.键,
                    className: 'wps-source-manager__field',
                    placeholder: 字段.占位,
                    value: String(项[字段.键] ?? ''),
                    onChange: (事件: React.ChangeEvent<HTMLInputElement>) =>
                      更新字段(项.id, 字段.键, 事件.target.value),
                  })
                ),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'wps-source-manager__remove',
                    'aria-label': `删除文献 ${下标 + 1}`,
                    onClick: () => 删除(项.id),
                  },
                  React.createElement(Icon, { name: 'close', size: 14 })
                )
              )
            )
          )
    )
  )
}

export default SourceManager
