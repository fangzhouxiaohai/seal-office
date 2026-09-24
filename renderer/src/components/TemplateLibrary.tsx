// 模板库组件
import React, { useState } from 'react'
import { ALL_TEMPLATES, type 模板项 } from '../data/templates'
import { Card, Tag, Button, Modal, Drawer } from 'antd'

const TemplateLibrary = ({ 打开状态 = true, 关闭回调, onSelect }: {
  打开状态?: boolean
  关闭回调?: () => void
  onSelect?: (模板: 模板项) => void
}) => {
  const [当前分类, set当前分类] = useState<string>('all')
  const [预览模板, set预览模板] = useState<模板项 | null>(null)

  const 分类映射: Record<string, { 标签: string; 颜色: string }> = {
    'all': { 标签: '全部', 颜色: 'default' },
    'word': { 标签: 'Word', 颜色: 'blue' },
    'table': { 标签: 'Excel', 颜色: 'green' },
    'ppt': { 标签: 'PPT', 颜色: 'orange' }
  }

  const 过滤模板 = 当前分类 === 'all' 
    ? ALL_TEMPLATES 
    : ALL_TEMPLATES.filter(项 => 项.分类 === 当前分类)

  const 分类按钮 = Object.entries(分类映射).map(([键, 值]) =>
    React.createElement(Button, {
      key: 键,
      type: 当前分类 === 键 ? 'primary' : 'default',
      onClick: () => set当前分类(键),
      style: { margin: '0 8px 8px 0' }
    }, 值.标签)
  )

  return React.createElement('div', { 
    className: 'template-library',
    style: { padding: '20px' }
  },
    // 标题
    React.createElement('h2', { style: { marginBottom: '16px' } }, '模板库'),

    // 分类筛选
    React.createElement('div', { style: { marginBottom: '20px' } },
      ...分类按钮
    ),

    // 模板列表
    React.createElement('div', { 
      style: { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }
    },
      过滤模板.map((模板) =>
        React.createElement(Card, {
          key: 模板.id,
          hoverable: true,
          onClick: () => set预览模板(模板),
          style: { 
            cursor: 'pointer',
            transition: 'transform 0.2s',
            borderColor: 模板.分类 === 'word' ? '#2B6CF6' : 模板.分类 === 'table' ? '#00A870' : '#ED7B2F'
          },
          styles: { body: { padding: '16px' } }
        },
          React.createElement('div', { style: { marginBottom: '12px' } },
            React.createElement(Tag, { color: 分类映射[模板.分类].颜色 }, 分类映射[模板.分类].标签),
            ...((模板.标签 || []).map((标签) =>
              React.createElement(Tag, { 
                key: 标签,
                style: { marginLeft: '8px' }
              }, 标签)
            ))
          ),
          React.createElement('h3', { style: { margin: '0 0 8px' } }, 模板.名称),
          React.createElement('p', { 
            style: { 
              color: '#888',
              fontSize: '13px',
              margin: '0 0 16px',
              height: '40px',
              overflow: 'hidden'
            }
          }, 模板.描述),
          React.createElement(Button, { 
            type: 'primary',
            block: true,
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation()
              if (onSelect) {
                onSelect(模板)
              } else {
                set预览模板(模板)
              }
            }
          }, '使用模板')
        )
      )
    ),

    // 预览抽屉
    React.createElement(Drawer, {
      title: '模板预览',
      placement: 'right',
      width: 600,
      open: !!预览模板,
      onClose: () => set预览模板(null),
      extra: React.createElement(Button, {
        type: 'primary',
        onClick: () => {
          if (预览模板 && onSelect) {
            onSelect(预览模板)
          }
          set预览模板(null)
        }
      }, '使用此模板')
    },
      预览模板 ? React.createElement('div', null,
        React.createElement('h3', null, 预览模板.名称),
        React.createElement('p', { style: { color: '#888', marginBottom: '16px' } }, 预览模板.描述),
        React.createElement('div', { 
          style: { 
            border: '1px solid #E8EBF0',
            borderRadius: '8px',
            padding: '20px',
            backgroundColor: '#FAFAFA',
            maxHeight: '400px',
            overflow: 'auto'
          },
          dangerouslySetInnerHTML: { __html: 预览模板.内容 }
        })
      ) : null
    )
  )
}

export default TemplateLibrary
