// 帮助手册组件 - 瀑布流文章布局
import React from 'react'
import { useState } from 'react'
import { Input } from 'antd'
import { useSettings } from '../store/settingsStore'

const { Search } = Input

interface 帮助文章 {
  标题: string
  正文: string[]
  标签: string
  标签颜色: string
  配图: string
  配图说明: string
}

const 配图占位符 = (索引: number): string => {
  const 颜色方案 = [
    ['#4A90D9', '#357ABD'],
    ['#52C41A', '#389E0D'],
    ['#FA8C16', '#D46B08'],
    ['#722ED1', '#531DAB'],
    ['#13C2C2', '#08979C'],
    ['#EB2F96', '#C41D7F'],
    ['#2F54EB', '#1D39C4'],
    ['#A12F96', '#C41D7F']
  ]
  const 方案 = 颜色方案[索引 % 颜色方案.length]
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="320" viewBox="0 0 600 320">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${方案 [0]};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${方案 [1]};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="600" height="320" fill="url(#g)" rx="8"/>
      <text x="300" y="160" font-family="Arial,sans-serif" font-size="24" fill="white" text-anchor="middle" dominant-baseline="middle" opacity="0.9">海豹办公 · ${索引 + 1}</text>
    </svg>
  `)}`
}

const 帮助数据: 帮助文章[] = [
  {
    标题: '欢迎使用海豹办公',
    正文: [
      '海豹办公是一款功能完整的本地办公软件套件，包含文字文档、电子表格和演示文稿三大核心模块。所有数据处理均在本地完成，保障您的隐私安全。',
      '您可以通过首页快速创建新文档，或打开最近使用的文档。支持导入导出 Word、Excel、PPT、PDF 等多种常见格式。',
      '界面简洁直观，操作符合办公习惯，无需复杂学习即可上手使用。'
    ],
    标签: '入门',
    标签颜色: 'blue',
    配图: 配图占位符(0),
    配图说明: '海豹办公首页界面，展示新建文档和最近文档列表'
  },
  {
    标题: '快速创建文档',
    正文: [
      '在首页点击"文字文档"、"电子表格"或"演示文稿"按钮，即可快速创建对应类型的新文档。',
      '创建后的文档会自动保存到"我的文档"文件夹，您也可以随时更改保存位置。',
      '文档采用 JSON 格式本地存储，支持版本管理和数据恢复。'
    ],
    标签: '入门',
    标签颜色: 'blue',
    配图: 配图占位符(1),
    配图说明: '新建文档选择界面，提供三种文档类型选项'
  },
  {
    标题: '文字文档编辑',
    正文: [
      '文字编辑器提供完整的文档编辑功能。顶部功能栏包含字体、字号、颜色、粗体、斜体、下划线等常用格式设置。',
      '支持段落对齐方式设置（左对齐、居中、右对齐、两端对齐），以及项目符号和编号列表。',
      '可插入表格、图片、形状等对象，并设置对象的环绕方式和层叠顺序。右键点击编辑区域可快速访问常用命令。'
    ],
    标签: '文档',
    标签颜色: 'blue',
    配图: 配图占位符(2),
    配图说明: '文字编辑器界面，展示工具栏和编辑区域'
  },
  {
    标题: '表格数据处理',
    正文: [
      '表格编辑器支持单元格数据输入、格式设置和公式计算。点击任意单元格即可编辑内容。',
      '右键表格单元格可快速执行剪切、复制、粘贴、插入行列等操作。支持拖拽调整行高和列宽。',
      '提供丰富的单元格边框样式、背景色填充和对齐方式设置，满足各类报表制作需求。'
    ],
    标签: '表格',
    标签颜色: 'green',
    配图: 配图占位符(3),
    配图说明: '表格编辑器界面，展示单元格编辑和格式设置'
  },
  {
    标题: '演示文稿制作',
    正文: [
      '演示文稿模块支持多页幻灯片编辑。左侧缩略图面板可快速切换和排序幻灯片。',
      '每页幻灯片支持添加文本框、图片、形状等元素，并可设置动画过渡效果。',
      '提供多种预设版式模板，快速搭建专业级演示文稿。支持全屏播放和排练计时功能。'
    ],
    标签: '演示',
    标签颜色: 'purple',
    配图: 配图占位符(4),
    配图说明: '演示文稿编辑界面，展示幻灯片缩略图和编辑区'
  },
  {
    标题: '文件保存与导出',
    正文: [
      '按 Ctrl+S 快捷键可快速保存当前文档。也可通过顶部菜单的"文件"选项卡执行保存和另存为操作。',
      '支持保存为多种格式：文字文档（.docx、.txt）、电子表格（.xlsx、.csv）、演示文稿（.pptx）。',
      '使用"导出为 PDF"功能可将文档转换为 PDF 格式，便于分享和打印。PDF 导出保持原文档版式和样式。'
    ],
    标签: '文件',
    标签颜色: 'orange',
    配图: 配图占位符(5),
    配图说明: '文件菜单界面，展示保存和导出选项'
  },
  {
    标题: '模板快速开始',
    正文: [
      '海豹办公内置多种实用模板，包括简历、合同、报告、财务报表、会议记录等常用文档类型。',
      '使用模板可大幅减少重复劳动。选择模板后，只需填入您的具体内容即可完成文档制作。',
      '模板位于首页的模板区域，也可在创建新文档时从模板列表中选择。新模板会定期更新。'
    ],
    标签: '模板',
    标签颜色: 'purple',
    配图: 配图占位符(6),
    配图说明: '模板选择界面，展示各类预置模板缩略图'
  },
  {
    标题: '界面主题切换',
    正文: [
      '在设置页面中可以切换浅色和深色两种界面主题。浅色模式适合明亮环境，深色模式适合夜间或暗光环境。',
      '主题设置会自动保存，下次启动时恢复上次选择的主题，无需重复设置。',
      '主题切换仅影响界面外观，不影响文档内容和功能使用。所有模块共享同一主题设置。'
    ],
    标签: '界面',
    标签颜色: 'default',
    配图: 配图占位符(7),
    配图说明: '设置页面中的主题切换选项'
  }
]

const 帮助卡片 = (文章: 帮助文章, _索引: number, 主题: string) => {
  const isDark = 主题 === '深色'
  const 卡片背景 = isDark ? '#2D333F' : '#FFFFFF'
  const 文字颜色 = isDark ? '#E0E0E0' : '#262626'
  const 次要文字颜色 = isDark ? '#9AA0A6' : '#595959'

  return React.createElement('div', {
    className: 'help-article-card',
    style: {
      background: 卡片背景,
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      cursor: 'default'
    },
    onMouseEnter: (e: React.MouseEvent) => {
      const el = e.currentTarget as HTMLElement
      el.style.transform = 'translateY(-2px)'
      el.style.boxShadow = isDark
        ? '0 4px 16px rgba(0,0,0,0.4)'
        : '0 4px 16px rgba(0,0,0,0.15)'
    },
    onMouseLeave: (e: React.MouseEvent) => {
      const el = e.currentTarget as HTMLElement
      el.style.transform = 'translateY(0)'
      el.style.boxShadow = isDark
        ? '0 2px 8px rgba(0,0,0,0.3)'
        : '0 2px 8px rgba(0,0,0,0.1)'
    }
  },
    // 标签和标题区域
    React.createElement('div', {
      className: 'help-article-header',
      style: {
        padding: '16px 20px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderBottom: isDark ? '1px solid #3D4450' : '1px solid #F0F0F0'
      }
    },
      React.createElement('span', {
        className: 'help-article-tag',
        style: {
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 500,
          color: 文章.标签颜色 === 'blue' ? (isDark ? '#7CB9E8' : '#1890FF') :
            文章.标签颜色 === 'green' ? (isDark ? '#73D13D' : '#52C41A') :
              文章.标签颜色 === 'orange' ? (isDark ? '#FFB347' : '#FA8C16') :
                文章.标签颜色 === 'purple' ? (isDark ? '#B37FEB' : '#722ED1') :
                  文章.标签颜色 === 'red' ? (isDark ? '#FF7875' : '#FF4D4F') :
                    文章.标签颜色 === 'cyan' ? (isDark ? '#5CD1D3' : '#13C2C2') :
                      (isDark ? '#8C8C8C' : '#8C8C8C'),
          background: 文章.标签颜色 === 'blue' ? (isDark ? 'rgba(124,185,232,0.15)' : 'rgba(24,144,255,0.08)') :
            文章.标签颜色 === 'green' ? (isDark ? 'rgba(115,209,61,0.15)' : 'rgba(82,196,26,0.08)') :
              文章.标签颜色 === 'orange' ? (isDark ? 'rgba(255,179,71,0.15)' : 'rgba(250,140,22,0.08)') :
                文章.标签颜色 === 'purple' ? (isDark ? 'rgba(179,127,235,0.15)' : 'rgba(114,46,209,0.08)') :
                  文章.标签颜色 === 'red' ? (isDark ? 'rgba(255,120,117,0.15)' : 'rgba(255,77,79,0.08)') :
                    文章.标签颜色 === 'cyan' ? (isDark ? 'rgba(92,209,211,0.15)' : 'rgba(19,194,194,0.08)') :
                      (isDark ? 'rgba(140,140,140,0.15)' : 'rgba(140,140,140,0.08)'),
          border: `1px solid ${文章.标签颜色 === 'blue' ? (isDark ? '#7CB9E8' : '#91D5FF') :
              文章.标签颜色 === 'green' ? (isDark ? '#73D13D' : '#B7EB8F') :
                文章.标签颜色 === 'orange' ? (isDark ? '#FFB347' : '#FFD591') :
                  文章.标签颜色 === 'purple' ? (isDark ? '#B37FEB' : '#D3ADF7') :
                    文章.标签颜色 === 'red' ? (isDark ? '#FF7875' : '#FFA39E') :
                      文章.标签颜色 === 'cyan' ? (isDark ? '#5CD1D3' : '#87E8DE') :
                        (isDark ? '#595959' : '#D9D9D9')}`
        }
      }, 文章.标签),
      React.createElement('h3', {
        style: {
          margin: 0,
          fontSize: '17px',
          fontWeight: 600,
          color: 文字颜色,
          flex: 1
        }
      }, 文章.标题)
    ),
    // 配图区域
    React.createElement('div', {
      className: 'help-article-image',
      style: {
        width: '100%',
        height: '200px',
        overflow: 'hidden',
        position: 'relative'
      }
    },
      React.createElement('img', {
        src: 文章.配图,
        alt: 文章.配图说明,
        style: {
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block'
        }
      }),
      React.createElement('div', {
        style: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '8px 16px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
          fontSize: '12px',
          color: 'rgba(255,255,255,0.9)'
        }
      }, 文章.配图说明)
    ),
    // 正文内容
    React.createElement('div', {
      className: 'help-article-content',
      style: {
        padding: '16px 20px 20px'
      }
    },
      ...文章.正文.map((段落,索引) =>
        React.createElement('p', {
          key: 索引,
          style: {
            margin: '0 0 10px',
            fontSize: '14px',
            lineHeight: 1.75,
            color: 次要文字颜色,
            textAlign: 'justify',
            ...(索引 === 文章.正文.length - 1 ? { marginBottom: 0 } : {})
          }
        }, 段落)
      )
    )
  )
}

const HelpManual = ({ 打开状态: _打开状态 = true, 关闭回调 }: {
  打开状态?: boolean
  关闭回调?: () => void
}) => {
  const [搜索关键词, set搜索关键词] = useState('')
  const { 主题 } = useSettings()

  const 过滤数据 = 帮助数据.filter(项 => {
    if (!搜索关键词) return true
    return 项.标题.includes(搜索关键词) || 项.正文.some(段落 => 段落.includes(搜索关键词))
  })

  const isDark = 主题 === '深色'
  // 是否作为全页面使用（无关闭回调即为全页面模式）
  const 全页面模式 = !关闭回调

  return React.createElement('div', {
    className: 'help-manual',
    style: {
      padding: 全页面模式 ? '24px 32px' : '20px',
      backgroundColor: isDark ? '#1A1F26' : '#F5F5F5',
      minHeight: 全页面模式 ? '0' : '400px',
      maxHeight: 全页面模式 ? 'none' : '600px',
      overflowY: 全页面模式 ? 'visible' : 'auto',
      height: 全页面模式 ? '100%' : 'auto',
      boxSizing: 'border-box'
    }
  },
    // 标题栏
    React.createElement('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 全页面模式 ? '32px' : '20px',
        paddingBottom: '16px',
        borderBottom: isDark ? '1px solid #3D4450' : '1px solid #E8E8E8'
      }
    },
      React.createElement('h2', {
        style: {
          margin: 0,
          fontSize: 全页面模式 ? '26px' : '22px',
          fontWeight: 600,
          color: isDark ? '#E0E0E0' : '#262626'
        }
      }, '帮助手册'),
      关闭回调 ? React.createElement('button', {
        onClick: 关闭回调,
        className: 'help-close-btn',
        style: {
          background: 'none',
          border: 'none',
          fontSize: '22px',
          color: isDark ? '#9AA0A6' : '#8C8C8C',
          cursor: 'pointer',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          transition: 'background 0.2s'
        },
        onMouseEnter: (e: React.MouseEvent) => {
          (e.currentTarget as HTMLButtonElement).style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
        },
        onMouseLeave: (e: React.MouseEvent) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'none'
        }
      }, '×') : null
    ),
    // 搜索框
    React.createElement(Search, {
      placeholder: '搜索帮助内容...',
      value: 搜索关键词,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => set搜索关键词(e.target.value),
      allowClear: true,
      style: {
        marginBottom: '24px',
        maxWidth: '100%'
      }
    }),
    // 文章列表（瀑布流布局）
    React.createElement('div', {
      className: 'help-articles-stream',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        paddingBottom: 全页面模式 ? '24px' : '0'
      }
    },
      ...过滤数据.map((文章, 索引) =>
        帮助卡片(文章, 索引, 主题)
      )
    ),
    // 空状态
    过滤数据.length === 0 ? React.createElement('div', {
      style: {
        textAlign: 'center',
        padding: '60px 20px',
        color: isDark ? '#9AA0A6' : '#8C8C8C',
        fontSize: '14px'
      }
    }, '未找到匹配的帮助内容') : null
  )
}

export default HelpManual
