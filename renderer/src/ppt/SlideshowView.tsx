// 全屏放映视图：黑底全屏展示幻灯片，点击或方向键翻页，Esc 退出。
// 文本框沿用画布的绝对坐标（960×540），按窗口尺寸等比缩放并居中。
import React from 'react'
import { 画布宽, 画布高, type 演示文稿, type 幻灯片 } from './deck'

interface Props {
  文稿: 演示文稿
  当前索引: number
  on翻页: (目标索引: number) => void
  on退出: () => void
}

/** 单页幻灯片的只读渲染；缩放比由容器按窗口计算后传入 */
function 放映页({ 幻灯片, 缩放 }: { 幻灯片: 幻灯片; 缩放: number }) {
  const 过渡类名 = 幻灯片.过渡效果 === '淡入淡出' ? ' wps-slideshow__page--fade'
    : 幻灯片.过渡效果 === '推进' ? ' wps-slideshow__page--push' : ''
  return React.createElement(
    'div',
    {
      className: `wps-slideshow__page${过渡类名}`,
      style: {
        width: `${画布宽}px`,
        height: `${画布高}px`,
        background: 幻灯片.背景色,
        transform: `scale(${缩放})`,
      },
    },
    幻灯片.文本框列表.map((框) => {
      const 内容 =
        框.片段列表 && 框.片段列表.length > 0
          ? 框.片段列表.map((片段, 索引) =>
              React.createElement(
                'span',
                {
                  key: 索引,
                  style: {
                    color: 片段.颜色 || 框.颜色,
                    fontWeight: 片段.加粗 ? 600 : undefined,
                    fontStyle: 片段.斜体 ? 'italic' : undefined,
                    textDecoration: 片段.下划线 ? 'underline' : undefined,
                  },
                },
                片段.文本
              )
            )
          : 框.text
      return React.createElement(
        'div',
        {
          key: 框.id,
          className: 'wps-slideshow__box',
          style: {
            left: `${框.x}px`,
            top: `${框.y}px`,
            width: `${框.width}px`,
            height: `${框.height}px`,
            fontSize: `${框.字号}px`,
            fontFamily: 框.字体,
            fontWeight: 框.加粗 ? 600 : 400,
            fontStyle: 框.斜体 ? 'italic' : 'normal',
            textDecoration: 框.下划线 ? 'underline' : 'none',
            color: 框.颜色,
            textAlign: 框.对齐,
          },
        },
        内容
      )
    })
  )
}

const SlideshowView = ({ 文稿, 当前索引, on翻页, on退出 }: Props) => {
  const [视口尺寸, set视口尺寸] = React.useState({
    宽: window.innerWidth,
    高: window.innerHeight,
  })

  React.useEffect(() => {
    const 处理缩放 = () => set视口尺寸({ 宽: window.innerWidth, 高: window.innerHeight })
    window.addEventListener('resize', 处理缩放)
    return () => window.removeEventListener('resize', 处理缩放)
  }, [])

  const 总页数 = 文稿.幻灯片列表.length
  const 安全索引 = Math.min(Math.max(当前索引, 0), Math.max(0, 总页数 - 1))
  const 缩放 = Math.min(视口尺寸.宽 / 画布宽, 视口尺寸.高 / 画布高)

  const 前进 = () => {
    if (安全索引 < 总页数 - 1) {
      on翻页(安全索引 + 1)
    } else {
      // 最后一页再点击/翻页即结束放映
      on退出()
    }
  }
  const 后退 = () => {
    if (安全索引 > 0) {
      on翻页(安全索引 - 1)
    }
  }

  React.useEffect(() => {
    const 处理按键 = (事件: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(事件.key)) {
        事件.preventDefault()
        前进()
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(事件.key)) {
        事件.preventDefault()
        后退()
      } else if (事件.key === 'Escape') {
        事件.preventDefault()
        on退出()
      } else if (事件.key === 'Home') {
        事件.preventDefault()
        on翻页(0)
      } else if (事件.key === 'End') {
        事件.preventDefault()
        on翻页(总页数 - 1)
      }
    }
    document.addEventListener('keydown', 处理按键)
    return () => document.removeEventListener('keydown', 处理按键)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [安全索引, 总页数])

  return React.createElement(
    'div',
    {
      className: 'wps-slideshow',
      role: 'dialog',
      'aria-label': '幻灯片放映',
      onClick: 前进,
      onContextMenu: (事件: React.MouseEvent) => 事件.preventDefault(),
    },
    React.createElement(放映页, { key: 文稿.幻灯片列表[安全索引].id, 幻灯片: 文稿.幻灯片列表[安全索引], 缩放 }),
    React.createElement(
      'div',
      { className: 'wps-slideshow__indicator' },
      `${安全索引 + 1} / ${总页数}`
    )
  )
}

export default SlideshowView
