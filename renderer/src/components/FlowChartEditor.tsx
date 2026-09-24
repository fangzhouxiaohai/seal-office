// 流程图编辑器组件
import { useState, useRef, type MouseEvent } from 'react'

export interface FlowNode {
  id: string
  type: '起点' | '终点' | '处理' | '判断' | '输入输出'
  x: number
  y: number
  文本: string
  width?: number
  height?: number
}

export interface FlowConnection {
  id: string
  from: string
  to: string
  标签?: string
}

interface 形状样式 {
  填充: string
  文字颜色: string
  圆角: number
}

const 形状映射: Record<FlowNode['type'], 形状样式> = {
  '起点': { 填充: '#52C41A', 文字颜色: '#FFFFFF', 圆角: 20 },
  '终点': { 填充: '#FF4D4F', 文字颜色: '#FFFFFF', 圆角: 20 },
  '处理': { 填充: '#1890FF', 文字颜色: '#FFFFFF', 圆角: 4 },
  '判断': { 填充: '#FAAD14', 文字颜色: '#FFFFFF', 圆角: 0 },
  '输入输出': { 填充: '#722ED1', 文字颜色: '#FFFFFF', 圆角: 0 }
}

const FlowChartEditor = ({ 节点列表, 连接线, onNodesChange, onConnectionsChange }: {
  节点列表: FlowNode[]
  连接线: FlowConnection[]
  onNodesChange: (节点: FlowNode[]) => void
  onConnectionsChange: (连接线: FlowConnection[]) => void
}) => {
  const [选中节点, set选中节点] = useState<string | null>(null)
  const [拖拽中, 设拖拽中] = useState(false)
  const [拖拽偏移, ] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  const 添加节点 = (类型: FlowNode['type']) => {
    const 新节点: FlowNode = {
      id: `node-${Date.now()}`,
      type: 类型,
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      文本: 类型 === '起点' ? '开始' : 类型 === '终点' ? '结束' : '新建节点',
      width: 120,
      height: 60
    }
    onNodesChange([...节点列表, 新节点])
  }

  const 处理鼠标移动 = (e: MouseEvent) => {
    if (!拖拽中 || !选中节点 || !svgRef.current) return
    
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left - 拖拽偏移.x + 20
    const y = e.clientY - rect.top - 拖拽偏移.y + 20

    const 新节点列表 = 节点列表.map(n => 
      n.id === 选中节点 ? { ...n, x: Math.max(0, x), y: Math.max(0, y) } : n
    )
    onNodesChange(新节点列表)
  }

  const 处理鼠标释放 = () => {
    设拖拽中(false)
    set选中节点(null)
  }

  const 删除选中节点 = () => {
    if (!选中节点) return
    const 新节点列表 = 节点列表.filter(n => n.id !== 选中节点)
    const 新连接线 = 连接线.filter(c => c.from !== 选中节点 && c.to !== 选中节点)
    onNodesChange(新节点列表)
    onConnectionsChange(新连接线)
    set选中节点(null)
  }

  return (
    <div style={{ 
      border: '1px solid #E8EBF0',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      {/* 工具栏 */}
      <div style={{ 
        padding: '12px',
        background: '#FAFBFC',
        borderBottom: '1px solid #E8EBF0',
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap'
      }}>
        {Object.keys(形状映射).map((类型) => (
          <button
            key={类型}
            onClick={() => 添加节点(类型 as FlowNode['type'])}
            style={{
              padding: '8px 12px',
              border: '1px solid #E8EBF0',
              borderRadius: '4px',
              background: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              borderRadius: (形状映射 as any)[类型].圆角 === 0 ? '0' : '50%',
              background: (形状映射 as any)[类型].填充
            }} />
            {类型}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={删除选中节点}
          disabled={!选中节点}
          style={{
            padding: '8px 12px',
            border: '1px solid #FF4D4F',
            borderRadius: '4px',
            background: 选中节点 ? '#FFF1F0' : '#fff',
            color: 选中节点 ? '#FF4D4F' : '#999',
            cursor: 选中节点 ? 'pointer' : 'not-allowed'
          }}
        >
          删除
        </button>
      </div>

      {/* 画布 */}
      <div 
        style={{ 
          position: 'relative',
          height: '500px',
          background: '#F5F7FA'
        }}
        onMouseMove={处理鼠标移动}
        onMouseUp={处理鼠标释放}
        onMouseLeave={处理鼠标释放}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ background: 'transparent' }}
        >
          {/* 绘制连接线 */}
          {连接线.map((conn) => {
            const 从节点 = 节点列表.find(n => n.id === conn.from)
            const 到节点 = 节点列表.find(n => n.id === conn.to)
            if (!从节点 || !到节点) return null
            
            return (
              <line
                key={conn.id}
                x1={从节点.x + (从节点.width || 120) / 2}
                y1={从节点.y + (从节点.height || 60) / 2}
                x2={到节点.x + (到节点.width || 120) / 2}
                y2={到节点.y + (到节点.height || 60) / 2}
                stroke="#999"
                strokeWidth={2}
              />
            )
          })}

          {/* 绘制节点 */}
          {节点列表.map((节点) => {
            const 样式 = 形状映射[节点.type]
            const 是否选中 = 选中节点 === 节点.id
            return (
              <g
                key={节点.id}
                transform={`translate(${节点.x}, ${节点.y})`}
                cursor="move"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation()
                  set选中节点(节点.id)
                }}
              >
                <rect
                  width={节点.width || 120}
                  height={节点.height || 60}
                  rx={样式.圆角 || 0}
                  fill={样式.填充}
                  stroke={是否选中 ? '#2B6CF6' : '#333'}
                  strokeWidth={是否选中 ? 3 : 1}
                />
                <text
                  x={(节点.width || 120) / 2}
                  y={(节点.height || 60) / 2 + 5}
                  textAnchor="middle"
                  fill={样式.文字颜色}
                  fontSize={14}
                  fontWeight="bold"
                  pointerEvents="none"
                >
                  {节点.文本}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export default FlowChartEditor
