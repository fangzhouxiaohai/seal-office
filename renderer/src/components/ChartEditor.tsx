// 图表编辑器组件
import { useState, useEffect } from 'react'
import { Modal, Button, Select } from 'antd'
import { 生成图表Svg, 示例图表数据, type 图表类型 } from '../editor/graphics'

const ChartEditor = ({ 打开状态, 关闭回调, 确认回调 }: {
  打开状态: boolean
  关闭回调: () => void
  确认回调: (svg: string, 类型: 图表类型) => void
}) => {
  const [图表类型, set图表类型] = useState<图表类型>('柱形图')
  const [预览Svg, set预览Svg] = useState('')

  useEffect(() => {
    if (打开状态) {
      const svg = 生成图表Svg(图表类型, 示例图表数据)
      set预览Svg(svg)
    }
  }, [打开状态, 图表类型])

  if (!打开状态) return null

  return (
    <Modal
      title="插入图表"
      open={打开状态}
      onCancel={关闭回调}
      width={800}
      footer={[
        <Button key="cancel" onClick={关闭回调}>取消</Button>,
        <Button key="confirm" type="primary" onClick={() => 确认回调(预览Svg, 图表类型)}>插入</Button>
      ]}
    >
      <div style={{ display: 'flex', gap: '20px' }}>
        {/* 左侧：设置面板 */}
        <div style={{ width: '250px', flexShrink: 0 }}>
          <h4>图表类型</h4>
          <Select
            value={图表类型}
            onChange={set图表类型}
            style={{ width: '100%' }}
            options={[
              { label: '柱形图', value: '柱形图' },
              { label: '折线图', value: '折线图' },
              { label: '饼图', value: '饼图' }
            ]}
          />
          <div style={{ margin: '16px 0', borderTop: '1px solid #E8EBF0' }} />
          <h4>数据预览</h4>
          <div style={{
            background: '#F5F7FA',
            padding: '12px',
            borderRadius: '4px',
            maxHeight: '200px',
            overflow: 'auto',
            fontSize: '12px'
          }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(示例图表数据, null, 2)}
            </pre>
          </div>
        </div>
        {/* 右侧：预览面板 */}
        <div style={{ flex: 1 }}>
          <h4>预览</h4>
          <div style={{
            border: '1px solid #E8EBF0',
            borderRadius: '4px',
            padding: '20px',
            backgroundColor: '#fff',
            minHeight: '300px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
            dangerouslySetInnerHTML={{ __html: 预览Svg }}
          />
        </div>
      </div>
    </Modal>
  )
}

export default ChartEditor
