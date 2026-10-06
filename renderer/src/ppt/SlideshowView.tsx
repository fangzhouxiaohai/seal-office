import { 监听播放后台 } from './playback/background'
import { 播放控制器, type 播放快照 } from './playback/controller'
import { 播放画面 } from './playback/PlaybackPage'
// 全屏放映视图：黑底全屏展示幻灯片，点击或方向键翻页，Esc 退出。
// 文本框沿用画布的绝对坐标（960×540），按窗口尺寸等比缩放并居中。
import React from 'react'
import { type 图片地址表 } from './render/SlideObjects'
import { createPortal } from 'react-dom'
import { App as AntdApp } from 'antd'
import { 桥接 } from '../ipc/bridge'
import { 标记放映开始 } from './presentationState'
import { type 演示文稿, type 演示对象 } from './deck'
import { 读取页面尺寸 } from './model/themes'
import { 临时批迹层, 橡皮移除, type 批迹, type 演示工具 } from './playback/PresenterTools'
import { 构造演讲者快照 } from './playback/presenterSnapshot'
import { 默认放映偏好, type 放映偏好 } from './playback/放映偏好'

interface Props {
  图片地址?: 图片地址表
  文稿: 演示文稿
  当前索引: number
  /** 自定义放映或页码范围得到的放映顺序；缺省时按常规可见页播放 */
  序列?: number[]
  偏好?: 放映偏好
  /** 进入放映时是否立即请求打开演讲者窗口 */
  请求演讲者?: boolean
  on翻页: (目标索引: number) => void
  on退出: () => void
  /** 用户明确选择保留笔迹时回调，由编辑器写入撤销历史。 */
  on保留笔迹?: (批迹: 批迹) => void
}

const 空批迹 = (颜色 = '#E34D59', 笔宽 = 3): 批迹 => ({ 颜色, 笔宽, 笔画: [] })

const 放映内容 = ({ 文稿, 当前索引, on翻页, on退出, 图片地址, 序列, 偏好 = 默认放映偏好, 请求演讲者 = false, on保留笔迹 }: Props) => {
  const { modal } = AntdApp.useApp()
  const 放映根 = React.useRef<HTMLDivElement>(null)
  const 退出引用 = React.useRef(on退出)
  退出引用.current = on退出
  const 保留引用 = React.useRef(on保留笔迹)
  保留引用.current = on保留笔迹
  const [工具, set工具] = React.useState<演示工具>('无')
  const [屏幕, set屏幕] = React.useState<'无' | '黑' | '白'>('无')
  const [批迹, set批迹] = React.useState<批迹>(() => 空批迹())
  const [激光位置, set激光位置] = React.useState<{ x: number; y: number } | null>(null)
  const 批迹引用 = React.useRef(批迹); 批迹引用.current = 批迹
  const 结束放映 = React.useCallback(() => {
    const 当前 = 批迹引用.current
    if (!当前.笔画.length || !保留引用.current) { 退出引用.current(); return }
    modal.confirm({
      title: '保留手写笔迹？',
      content: '选择保留会把当前页的临时笔迹作为可编辑对象写入文稿并进入撤销历史；选择放弃只结束放映，不修改文稿。',
      okText: '保留笔迹', cancelText: '放弃笔迹',
      onOk: () => { 保留引用.current?.(当前); 退出引用.current() },
      onCancel: () => 退出引用.current(),
    })
  }, [modal])
  const 结束引用 = React.useRef(结束放映); 结束引用.current = 结束放映
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

  const [状态, set状态] = React.useState<播放快照 | null>(null)
  const 控制器 = React.useRef<播放控制器 | null>(null)
  const 翻页引用 = React.useRef(on翻页); 翻页引用.current = on翻页
  const [演讲者, set演讲者] = React.useState<{ 会话标识: string; 显示器名称: string; 提示?: string } | null>(null)
  const 演讲者引用 = React.useRef<typeof 演讲者>(null)
  演讲者引用.current = 演讲者
  const 计时 = React.useRef({ 起点: Date.now(), 暂停累计: 0, 暂停起点: null as number | null })
  const 顺序 = React.useMemo(() => 序列 ?? 文稿.幻灯片列表.map((_, 索引) => 索引).filter((索引) => !文稿.幻灯片列表[索引].隐藏), [序列, 文稿.幻灯片列表])
  const 已用毫秒 = () => {
    const 当前 = 计时.current
    const 暂停中 = 当前.暂停起点 === null ? 0 : Date.now() - 当前.暂停起点
    return Math.max(0, Date.now() - 当前.起点 - 当前.暂停累计 - 暂停中)
  }
  React.useEffect(() => {
    let 实例: 播放控制器
    try {
      实例 = new 播放控制器(文稿, 当前索引, { 更新: set状态, 翻页: i => 翻页引用.current(i), 结束: () => 结束引用.current(), 停止媒体: () => 放映根.current?.querySelectorAll('audio,video').forEach(节点 => { const 媒体 = 节点 as HTMLMediaElement; 媒体.pause(); 媒体.currentTime = 0 }) }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, 序列 ? { 序列 } : {})
      控制器.current = 实例; 实例.开始()
    } catch (错误) { 退出引用.current(); modal.error({ title: '无法开始放映', content: 错误 instanceof Error ? 错误.message : '播放参数无效' }); return }
    const 释放后台 = 监听播放后台(值 => 实例.后台(值), { 忽略失焦: () => 演讲者引用.current !== null })
    return () => { 释放后台(); 实例.销毁(); 控制器.current = null }
  }, [])
  const 总页数 = 顺序.length
  const 安全位置 = 状态 ? Math.max(0, 顺序.indexOf(状态.索引)) : 0
  const 安全索引 = 状态?.索引 ?? 顺序[0] ?? Math.min(Math.max(当前索引, 0), Math.max(0, 文稿.幻灯片列表.length - 1))
  const 页面尺寸 = 读取页面尺寸(文稿)
  const 缩放 = Math.min(视口尺寸.宽 / 页面尺寸.宽, 视口尺寸.高 / 页面尺寸.高)
  /** 演讲者窗口只接收只读快照；失败时展示真实原因，不影响观众画面继续放映 */
  const 打开演讲者 = React.useCallback(async (静默 = false) => {
    if (!桥接.presenter.可用) { if (!静默) modal.warning({ title: '无法打开演讲者视图', content: '当前环境不支持演讲者窗口，请使用 Windows 桌面版。' }); return }
    const 结果 = await 桥接.presenter.open({ 显示器: 偏好.屏幕 })
    if (!结果.成功 || !结果.会话标识) { if (!静默) modal.warning({ title: '无法打开演讲者视图', content: 结果.错误 ?? '系统未返回有效演讲者会话' }); return }
    set演讲者({ 会话标识: 结果.会话标识, 显示器名称: 结果.显示器名称 ?? '未获取到显示器信息', ...(结果.提示 ? { 提示: 结果.提示 } : {}) })
    // 演讲者窗口取得焦点后，观众画面必须继续播放：解除此前因失焦产生的暂停
    控制器.current?.后台(false)
    if (结果.提示) modal.info({ title: '演讲者视图已打开', content: 结果.提示, okText: '我知道了' })
  }, [偏好.屏幕, modal])
  React.useEffect(() => { if (请求演讲者) void 打开演讲者() }, [请求演讲者, 打开演讲者])
  React.useEffect(() => {
    if (!状态 || !演讲者) return
    void 桥接.presenter.update(演讲者.会话标识, {
      快照: 构造演讲者快照({ 文稿, 状态, 顺序, 已用毫秒: 已用毫秒(), 运行中: !状态.暂停 && 状态.阶段 !== '结束' }),
      显示器名称: 演讲者.显示器名称,
      ...(演讲者.提示 ? { 提示: 演讲者.提示 } : {}),
    })
  }, [状态, 文稿, 顺序, 演讲者])
  React.useEffect(() => {
    const 释放控制 = 桥接.presenter.onControl(({ 动作 }) => {
      if (动作 === '下一页') 控制器.current?.单击()
      else if (动作 === '上一页') 控制器.current?.后退()
      else if (动作 === '暂停') 控制器.current?.暂停(true)
      else if (动作 === '继续') 控制器.current?.暂停(false)
      else if (动作 === '首尾') 控制器.current?.首尾(true)
      else if (动作 === '结束') 退出引用.current()
    })
    const 释放关闭 = 桥接.presenter.onClosed(({ 会话标识, 原因 }) => {
      if (演讲者引用.current?.会话标识 !== 会话标识) return
      set演讲者(null)
      modal.warning({ title: '演讲者视图已结束', content: 原因, okText: '我知道了' })
    })
    const 释放显示变化 = 桥接.presenter.onDisplayChanged(({ 会话标识, 原因 }) => {
      if (演讲者引用.current?.会话标识 !== 会话标识) return
      modal.warning({ title: '演讲者显示器已变化', content: 原因, okText: '我知道了' })
    })
    return () => { 释放控制(); 释放关闭(); 释放显示变化() }
  }, [modal])
  React.useEffect(() => () => {
    const 当前会话 = 演讲者引用.current
    if (当前会话) void 桥接.presenter.close(当前会话.会话标识)
  }, [])
  React.useEffect(() => {
    const 当前 = 计时.current
    if (状态?.暂停) { if (当前.暂停起点 === null) 当前.暂停起点 = Date.now() }
    else if (当前.暂停起点 !== null) { 当前.暂停累计 += Date.now() - 当前.暂停起点; 当前.暂停起点 = null }
  }, [状态?.暂停])

  const 前进 = () => 控制器.current?.单击()
  const 后退 = () => 控制器.current?.后退()

  /** 对象动作：网页、页跳转与结束放映都在放映态执行，循环引用只会重复跳页不会卡死。 */
  const 执行动作 = (对象: 演示对象) => {
    const 链接 = 对象.链接
    if (!链接) return false
    if (链接.类型 === '网页') {
      void 桥接.openExternal(链接.目标).then(结果 => { if (!结果.成功) modal.error({ title: '打开链接失败', content: 结果.错误 ?? '系统无法打开该链接' }) })
      return true
    }
    if (链接.类型 === '结束') { 结束引用.current(); return true }
    if (链接.类型 === '页') {
      const 目标索引 = 文稿.幻灯片列表.findIndex(页 => 页.id === 链接.目标)
      if (目标索引 < 0) { modal.warning({ title: '跳转失败', content: '链接指向的页面已不存在，请重新设置动作。' }); return true }
      const 当前 = 控制器.current?.快照.索引
      if (当前 === 目标索引) return true
      const 可跳转 = 文稿.幻灯片列表[目标索引].隐藏 !== true
      if (!可跳转) modal.warning({ title: '无法跳转', content: '目标页面已隐藏，常规放映会跳过隐藏页。' })
      else 控制器.current?.跳转(目标索引)
      return true
    }
    return false
  }
  const 处理点击 = (事件: React.MouseEvent) => {
    if (工具 !== '无' || 屏幕 !== '无') return
    const 目标 = 事件.target instanceof Element ? 事件.target.closest('[data-对象标识]') : null
    const 对象 = 目标 && 文稿.幻灯片列表[安全索引]?.对象列表?.find(项 => 项.id === 目标.getAttribute('data-对象标识'))
    if (对象 && 执行动作(对象)) { 事件.stopPropagation(); return }
    前进()
  }

  React.useEffect(() => {
    const 处理按键 = (事件: KeyboardEvent) => {
      // 隔离隐藏编辑器的保存、增删页和标签切换快捷键。
      事件.stopImmediatePropagation()
      if (事件.key === 'Tab' || (事件.target instanceof HTMLButtonElement && ['Enter',' '].includes(事件.key))) return
      事件.preventDefault()
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(事件.key)) {
        事件.preventDefault()
        前进()
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(事件.key)) {
        事件.preventDefault()
        后退()
      } else if (事件.key.toLowerCase() === 'p') {
        控制器.current?.暂停(!控制器.current.快照.暂停)
      } else if (事件.key === 'Escape') {
        事件.preventDefault()
        结束引用.current()
      } else if (事件.key.toLowerCase() === 'b') {
        set屏幕(值 => 值 === '黑' ? '无' : '黑')
      } else if (事件.key.toLowerCase() === 'w') {
        set屏幕(值 => 值 === '白' ? '无' : '白')
      } else if (事件.key.toLowerCase() === 'l') {
        set工具(值 => 值 === '激光笔' ? '无' : '激光笔')
      } else if (事件.key.toLowerCase() === 'i') {
        set工具(值 => 值 === '画笔' ? '无' : '画笔')
      } else if (事件.key === 'Home') {
        事件.preventDefault()
        控制器.current?.首尾(false)
      } else if (事件.key === 'End') {
        事件.preventDefault()
        控制器.current?.首尾(true)
      }
    }
    document.addEventListener('keydown', 处理按键, true)
    return () => document.removeEventListener('keydown', 处理按键, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [安全位置, 总页数])

  const 当前页 = 文稿.幻灯片列表[安全索引]
  const 音效地址 = 当前页?.音效 ? 图片地址?.[当前页.音效.资源标识] : undefined
  const 按钮 = (名称: string, 激活: boolean, 执行: () => void, 提示: string) => React.createElement('button', {
    type: 'button', className: `wps-slideshow__tool${激活 ? ' is-active' : ''}`, 'aria-pressed': 激活, title: 提示,
    onClick: (事件: React.MouseEvent) => { 事件.stopPropagation(); 执行() },
  }, 名称)
  return createPortal(React.createElement(
    'div',
    {
      className: `wps-slideshow${工具 !== '无' ? ' is-tool-active' : ''}`,
      ref: 放映根,
      tabIndex: -1,
      role: 'dialog',
      'aria-label': '幻灯片放映',
      onClick: 处理点击,
      onContextMenu: (事件: React.MouseEvent) => 事件.preventDefault(),
    },
    状态 && React.createElement(播放画面, { 图片地址, 文稿, 状态, 缩放, on媒体失败: (错误: unknown) => modal.error({ title: '媒体播放失败', content: 错误 instanceof Error ? 错误.message : '媒体无法播放' }) }),
    音效地址 && React.createElement('audio', { key: `音效-${状态?.页代次 ?? 0}`, src: 音效地址, autoPlay: true, 'aria-label': '切换音效', style: { display: 'none' } }),
    状态 && 工具 !== '无' && React.createElement(临时批迹层, {
      工具, 颜色: 批迹.颜色, 笔宽: 批迹.笔宽, 批迹, 激光位置,
      on批迹: set批迹, on激光: set激光位置, on橡皮: 位置 => set批迹(当前 => 橡皮移除(当前, 位置)),
    }),
    屏幕 !== '无' && React.createElement('div', { className: 'wps-slideshow__screen', 'data-屏幕': 屏幕, 'aria-label': 屏幕 === '黑' ? '黑屏' : '白屏' }),
    React.createElement(
      'div',
      { className: 'wps-slideshow__indicator' },
      `${安全位置 + 1} / ${总页数}${状态?.暂停 ? '　已暂停' : ''}${批迹.笔画.length ? `　笔迹 ${批迹.笔画.length} 笔` : ''}`
    ),
    React.createElement('div', { className: 'wps-slideshow__tools', role: 'toolbar', 'aria-label': '演示工具' },
      按钮('画笔', 工具 === '画笔', () => set工具(值 => 值 === '画笔' ? '无' : '画笔'), '画笔（I）：临时批迹，退出时可选择保留'),
      按钮('橡皮', 工具 === '橡皮', () => set工具(值 => 值 === '橡皮' ? '无' : '橡皮'), '橡皮：擦除临时批迹'),
      按钮('清除', false, () => set批迹(当前 => ({ ...当前, 笔画: [] })), '清除全部临时批迹'),
      按钮('激光笔', 工具 === '激光笔', () => { set激光位置(null); set工具(值 => 值 === '激光笔' ? '无' : '激光笔') }, '激光笔（L）'),
      按钮('黑屏', 屏幕 === '黑', () => set屏幕(值 => 值 === '黑' ? '无' : '黑'), '黑屏（B）'),
      按钮('白屏', 屏幕 === '白', () => set屏幕(值 => 值 === '白' ? '无' : '白'), '白屏（W）')),
    React.createElement('button', { type: 'button', className: 'wps-slideshow__presenter', onClick: (事件: React.MouseEvent) => { 事件.stopPropagation(); if (演讲者) { void 桥接.presenter.close(演讲者.会话标识); set演讲者(null) } else void 打开演讲者() } }, 演讲者 ? '关闭演讲者视图' : '演讲者视图'),
    React.createElement('button', { type: 'button', className: 'wps-slideshow__pause', onClick: (事件: React.MouseEvent) => { 事件.stopPropagation(); 控制器.current?.暂停(!状态?.暂停) } }, 状态?.暂停 ? '继续放映' : '暂停放映')
  ), document.body)
}

const SlideshowView = (props: Props) => {
  const { modal } = AntdApp.useApp()
  const 空文稿 = props.文稿.幻灯片列表.length === 0 || props.文稿.幻灯片列表.every(页 => 页.隐藏)
  const 空序列 = props.序列 !== undefined && props.序列.length === 0
  const 退出引用 = React.useRef(props.on退出)
  退出引用.current = props.on退出
  React.useEffect(() => {
    if (!空文稿 && !空序列) return
    退出引用.current()
    modal.warning({
      title: '无法开始放映',
      content: 空序列 ? '当前放映范围内没有可播放的页面，请检查放映范围与隐藏页设置。'
        : props.文稿.幻灯片列表.length ? '所有幻灯片均已隐藏，请取消至少一页的隐藏状态。' : '请先添加至少一张幻灯片，再开始放映。',
      okText: '我知道了',
    })
  }, [空文稿, 空序列, modal])
  return 空文稿 || 空序列 ? null : React.createElement(放映内容, props)
}

export default SlideshowView
