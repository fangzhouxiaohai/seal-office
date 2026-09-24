// 帮助手册组件
import { useState } from 'react'
import { Input, Collapse, Tag, Card } from 'antd'
import { useSettings } from '../store/settingsStore'

const { Search } = Input

interface 帮助项 {
  标题: string
  内容: string
  标签: string
  标签颜色: string
}

const 帮助数据: 帮助项[] = [
  {
    标题: '入门指南',
    内容: '欢迎使用海豹办公！您可以通过首页快速创建新文档或打开最近文档。支持文字文档、电子表格和演示文稿的创建和编辑。',
    标签: '入门',
    标签颜色: 'blue'
  },
  {
    标题: '文档编辑',
    内容: '在文档编辑器中，使用顶部功能栏进行文字编辑、格式设置、插入表格等操作。支持字体、字号、颜色、粗体、斜体等常用格式设置。',
    标签: '文档',
    标签颜色: 'blue'
  },
  {
    标题: '表格操作',
    内容: '表格支持插入、删除行列，设置边框，拖选范围等功能。点击表格单元格即可编辑内容，右键表格可快速操作行列。',
    标签: '表格',
    标签颜色: 'green'
  },
  {
    标题: '文件保存',
    内容: '按 Ctrl+S 可快速保存文档，或使用菜单栏中的"保存"和"另存为"功能。支持保存为 Word(.docx)、Excel(.xlsx)、PPT(.pptx)等格式。',
    标签: '文件',
    标签颜色: 'orange'
  },
  {
    标题: 'PDF导出',
    内容: '使用"文件"菜单中的"导出为PDF"功能，可将当前文档导出为PDF格式，方便分享和打印。',
    标签: '导出',
    标签颜色: 'red'
  },
  {
    标题: '模板使用',
    内容: '在首页或新建文档时，可以选择预置的模板快速开始。模板包含简历、合同、报告、财务报表等多种常用文档类型。',
    标签: '模板',
    标签颜色: 'purple'
  },
  {
    标题: '深浅模式切换',
    内容: '在"设置"页面中可以切换深浅模式。设置会自动保存，下次打开时会自动应用上次选择的主题。',
    标签: '界面',
    标签颜色: 'default'
  },
  {
    标题: '常见问题',
    内容: 'Q: 如何设为默认办公软件？\nA: 进入"设置"页面，点击"设为默认办公软件"即可。请注意可能需要管理员权限。\n\nQ: 保存的文件在哪里？\nA: 默认保存到"我的文档"文件夹，您可以在保存对话框中选择其他位置。',
    标签: '问答',
    标签颜色: 'cyan'
  }
]

const HelpManual = ({ 打开状态 = true, 关闭回调 }: {
  打开状态?: boolean
  关闭回调?: () => void
}) => {
  // 忽略打开状态，始终显示
  void 打开状态
  const [搜索关键词, set搜索关键词] = useState('')
  const { 主题 } = useSettings()

  const 过滤数据 = 帮助数据.filter(项 => {
    if (!搜索关键词) return true
    return 项.标题.includes(搜索关键词) || 项.内容.includes(搜索关键词)
  })

  return (
    <div className="help-manual" style={{ 
      padding: '20px',
      backgroundColor: 主题 === '深色' ? '#2D333F' : '#FFFFFF',
      minHeight: '400px'
    }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>帮助手册</h2>
        {关闭回调 && (
          <button
            onClick={关闭回调}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}
          >
            ×
          </button>
        )}
      </div>

      {/* 搜索框 */}
      <Search
        placeholder="搜索帮助内容..."
        value={搜索关键词}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => set搜索关键词(e.target.value)}
        style={{ marginBottom: '20px' }}
      />

      {/* 帮助内容 */}
      {过滤数据.length > 0 ? (
        <Card variant="borderless">
          <Collapse
            defaultActiveKey={['0']}
            items={过滤数据.map((项, 索引) => ({
              key: 索引.toString(),
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tag color={项.标签颜色}>{项.标签}</Tag>
                  <span>{项.标题}</span>
                </div>
              ),
              children: <p style={{ whiteSpace: 'pre-wrap' }}>{项.内容}</p>,
            }))}
          />
        </Card>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          未找到匹配的帮助内容
        </div>
      )}
    </div>
  )
}

export default HelpManual
