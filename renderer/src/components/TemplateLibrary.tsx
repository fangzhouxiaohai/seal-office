// 模板库组件
import { useState } from 'react'
import { Drawer } from 'antd'
import { ALL_TEMPLATES, type 模板项 } from '../data/templates'

const TemplateLibrary = ({ onSelect }: {
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

  const 分类按钮 = Object.entries(分类映射).map(([键, 值]) => (
    <button
      key={键}
      className={`ant-btn ${当前分类 === 键 ? 'ant-btn-primary' : ''}`}
      onClick={() => set当前分类(键)}
      style={{ margin: '0 8px 8px 0' }}
    >
      {值.标签}
    </button>
  ))

  return (
    <div className="template-library" style={{ padding: '20px' }}>
      {/* 标题 */}
      <h2 style={{ marginBottom: '16px' }}>模板库</h2>

      {/* 分类筛选 */}
      <div style={{ marginBottom: '20px' }}>
        {分类按钮}
      </div>

      {/* 模板列表 */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {过滤模板.map((模板) => (
          <div
            key={模板.id}
            onClick={() => set预览模板(模板)}
            style={{ 
              cursor: 'pointer',
              transition: 'transform 0.2s',
              border: `1px solid ${模板.分类 === 'word' ? '#2B6CF6' : 模板.分类 === 'table' ? '#00A870' : '#ED7B2F'}`,
              borderRadius: '8px',
              padding: '16px',
              backgroundColor: '#fff'
            }}
          >
            <div style={{ marginBottom: '12px' }}>
              <span className={`ant-tag ant-tag-${分类映射[模板.分类].颜色}`}>
                {分类映射[模板.分类].标签}
              </span>
              {(模板.标签 || []).map((标签) => (
                <span key={标签} className="ant-tag" style={{ marginLeft: '8px' }}>
                  {标签}
                </span>
              ))}
            </div>
            <h3 style={{ margin: '0 0 8px' }}>{模板.名称}</h3>
            <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px', height: '40px', overflow: 'hidden' }}>
              {模板.描述}
            </p>
            <button
              className="ant-btn ant-btn-primary"
              style={{ width: '100%' }}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation()
                if (onSelect) {
                  onSelect(模板)
                } else {
                  set预览模板(模板)
                }
              }}
            >
              使用模板
            </button>
          </div>
        ))}
      </div>

      {/* 预览抽屉 */}
      <Drawer
        title="模板预览"
        placement="right"
        width={600}
        open={!!预览模板}
        onClose={() => set预览模板(null)}
        extra={
          <button
            className="ant-btn ant-btn-primary"
            onClick={() => {
              if (预览模板 && onSelect) {
                onSelect(预览模板)
              }
              set预览模板(null)
            }}
          >
            使用此模板
          </button>
        }
      >
        {预览模板 && (
          <div>
            <h3>{预览模板.名称}</h3>
            <p style={{ color: '#888', marginBottom: '16px' }}>{预览模板.描述}</p>
            <div style={{ 
              border: '1px solid #E8EBF0',
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: '#FAFAFA',
              maxHeight: '400px',
              overflow: 'auto'
            }}
              dangerouslySetInnerHTML={{ __html: 预览模板.内容 }}
            />
          </div>
        )}
      </Drawer>
    </div>
  )
}

export default TemplateLibrary
