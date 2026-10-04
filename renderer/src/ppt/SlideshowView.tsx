// 全屏放映视图：黑底全屏展示幻灯片，点击或方向键翻页，Esc 退出。
// 文本框沿用画布的绝对坐标（960×540），按窗口尺寸等比缩放并居中。
import React from 'react'
import { SlideObjects, type 图片地址表 } from './render/SlideObjects'
import { createPortal } from 'react-dom'
import { App as AntdApp } from 'antd'
import { 桥接 } from '../ipc/bridge'
import { 标记放映开始 } from './presentationState'
import { 画布宽, 画布高, type 演示文稿, type 幻灯片 } from './deck'

interface Props {
  图片地址?: 图片地址表
  文稿: 演示文稿
  当前索引: number
  on翻页: (目标索引: number) => void
  on退出: () => void
}

/** 单页幻灯片的只读渲染；缩放比由容器按窗口计算后传入 */
function 放映页({ 幻灯片, 缩放, 图片地址 }: { 幻灯片: 幻灯片; 缩放: number; 图片地址?: 图片地址表 }) {
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
    React.createElement(SlideObjects, { 幻灯片, 图片地址 })
  )
}

const 放映内容 = ({ 文稿, 当前索引, on翻页, on退出, 图片地址 }: Props) => {
  const { modal } = AntdApp.useApp()
  const 放映根 = React.useRef<HTMLDivElement>(null)
  const 退出引用 = React.useRef(on退出)
  退出引用.current = on退出
  React.useLayoutEffect(() => {
    const 释放放映状态 = 标记放映开始()
    const 原焦点 = document.activeElement
    放映根.current?.focus()
    return () => {
      释放放映状态()
      if (原焦点 instanceof HTMLElement && 原焦点.isConnected) 原焦点.focus()
    }
  }, [])

  React.useEffect(() => {
    const 放映元素 = 放映根.current
    let 已卸载 = false
    let 会话标识: string | undefined
    let 浏览器全屏归本视图 = false
    const 展示错误 = (标题: string, 错误: unknown) => {
      modal.error({ title: 标题, content: 错误 instanceof Error ? 错误.message : '系统全屏操作失败' })
    }
    const 恢复窗口 = async (标识: string) => {
      try {
        const 结果 = await 桥接.exitSlideshowFullscreen(标识)
        if (!结果.成功) throw new Error(结果.错误 || '无法恢复原窗口')
      } catch (错误) { 展示错误('恢复放映窗口失败', 错误) }
    }
    const 取消监听 = 桥接.onSlideshowEnded((标识) => {
      if (!已卸载 && 标识 === 会话标识) 退出引用.current()
    })
    const 浏览器状态变化 = () => {
      if (!已卸载 && 浏览器全屏归本视图 && !document.fullscreenElement) 退出引用.current()
    }
    document.addEventListener('fullscreenchange', 浏览器状态变化)
    void (async () => {
      try {
        if (桥接.放映全屏可用) {
          const 结果 = await 桥接.enterSlideshowFullscreen()
          if (!结果.成功 || !结果.会话标识) throw new Error(结果.错误 || '系统未返回有效放映会话')
          会话标识 = 结果.会话标识
          if (已卸载) await 恢复窗口(会话标识)
        } else {
          const 根 = 放映元素
          if (!根?.requestFullscreen) throw new Error('当前环境不支持全屏放映，请使用 Windows 桌面版')
          await 根.requestFullscreen()
          浏览器全屏归本视图 = true
          if (已卸载 && document.fullscreenElement === 根) await document.exitFullscreen()
        }
      } catch (错误) {
        if (!已卸载) {
          退出引用.current()
          展示错误('无法开始全屏放映', 错误)
        }
      }
    })()
    return () => {
      已卸载 = true
      取消监听()
      document.removeEventListener('fullscreenchange', 浏览器状态变化)
      if (会话标识) void 恢复窗口(会话标识)
      if (浏览器全屏归本视图 && document.fullscreenElement === 放映元素) {
        void document.exitFullscreen().catch((错误: unknown) => 展示错误('退出全屏失败', 错误))
      }
    }
  }, [modal])

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
      // 隔离隐藏编辑器的保存、增删页和标签切换快捷键。
      事件.stopImmediatePropagation()
      事件.preventDefault()
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
    document.addEventListener('keydown', 处理按键, true)
    return () => document.removeEventListener('keydown', 处理按键, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [安全索引, 总页数])

  return createPortal(React.createElement(
    'div',
    {
      className: 'wps-slideshow',
      ref: 放映根,
      tabIndex: -1,
      role: 'dialog',
      'aria-label': '幻灯片放映',
      onClick: 前进,
      onContextMenu: (事件: React.MouseEvent) => 事件.preventDefault(),
    },
    React.createElement(放映页, { 图片地址, key: 文稿.幻灯片列表[安全索引].id, 幻灯片: 文稿.幻灯片列表[安全索引], 缩放 }),
    React.createElement(
      'div',
      { className: 'wps-slideshow__indicator' },
      `${安全索引 + 1} / ${总页数}`
    )
  ), document.body)
}

const SlideshowView = (props: Props) => {
  const { modal } = AntdApp.useApp()
  const 空文稿 = props.文稿.幻灯片列表.length === 0
  const 退出引用 = React.useRef(props.on退出)
  退出引用.current = props.on退出
  React.useEffect(() => {
    if (!空文稿) return
    退出引用.current()
    modal.warning({ title: '无法开始放映', content: '请先添加至少一张幻灯片，再开始放映。', okText: '我知道了' })
  }, [空文稿, modal])
  return 空文稿 ? null : React.createElement(放映内容, props)
}

export default SlideshowView
