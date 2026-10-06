// 智能讲 PPT 面板：分页生成讲稿、逐页试听、失败逐页如实报告，并可按页写入演讲备注。
import React from 'react'
import { App as AntdApp } from 'antd'
import { 桥接 } from '../../ipc/bridge'
import { type 演示文稿 } from '../deck'

interface Props {
  文稿: 演示文稿
  只读: boolean
  on修改: (文稿: 演示文稿) => void
}

interface 页面讲稿 { 页标识: string; 页序号: number; 标题: string; 讲稿: string; 音频?: { 缓存键?: string; 类型?: string; 字节数?: number; 数据: string }; 失败原因?: string; 命中缓存?: boolean }

export default function NarrationPanel({ 文稿, 只读, on修改 }: Props) {
  const { message, modal } = AntdApp.useApp()
  const [讲稿列表, set讲稿列表] = React.useState<页面讲稿[]>([])
  const [运行中, set运行中] = React.useState(false)
  const [状态文本, set状态文本] = React.useState('')
  const [播放中, set播放中] = React.useState<string | null>(null)
  const 音频引用 = React.useRef<HTMLAudioElement | null>(null)
  const 请求序号 = React.useRef(0)

  React.useEffect(() => () => { 音频引用.current?.pause(); 音频引用.current = null }, [])
  React.useEffect(() => 桥接.presentationAi.onStream((片段) => set状态文本(片段.内容)), [])

  const 页面清单 = React.useMemo(() => 文稿.幻灯片列表.map((页, 索引) => ({
    页标识: 页.id,
    页序号: 索引 + 1,
    标题: 页.title || `第 ${索引 + 1} 页`,
    文本: 页.文本框列表.map((框) => 框.text).filter(Boolean).join('\n'),
    备注: 页.备注 ?? '',
  })), [文稿])

  const 生成 = async () => {
    if (只读) return
    set运行中(true); set状态文本('正在生成讲稿')
    try {
      const 结果 = await 桥接.presentationAi.generateScript({
        请求标识: `ppt-script-${++请求序号.current}-${Date.now()}`,
        页列表: 页面清单.map((页) => ({ 页标识: 页.页标识, 标题: 页.标题, 文本: 页.文本, 备注: 页.备注 })),
      })
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '讲稿生成失败')
      const 表 = new Map(结果.数据.讲稿.map((项) => [项.页标识, 项.讲稿]))
      set讲稿列表(页面清单.filter((页) => 表.has(页.页标识)).map((页) => ({ 页标识: 页.页标识, 页序号: 页.页序号, 标题: 页.标题, 讲稿: 表.get(页.页标识)! })))
      set状态文本(`已生成 ${结果.数据.讲稿.length} 页讲稿；逐页试听后再决定是否写入备注`)
    } catch (错误) {
      modal.error({ title: '讲稿生成失败', content: 错误 instanceof Error ? 错误.message : '讲稿生成失败' })
    } finally { set运行中(false) }
  }

  const 试听 = async (项: 页面讲稿) => {
    try {
      if (播放中 === 项.页标识) { 音频引用.current?.pause(); set播放中(null); return }
      set状态文本(`正在合成第 ${项.页序号} 页讲解音频`)
      const 结果 = await 桥接.presentationAi.speak({ 文本: 项.讲稿 })
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '语音合成失败')
      set讲稿列表((旧) => 旧.map((值) => 值.页标识 === 项.页标识 ? { ...值, 音频: { 缓存键: 结果.数据!.缓存键, 类型: 结果.数据!.类型, 字节数: 结果.数据!.字节数, 数据: 结果.数据!.音频 }, 命中缓存: 结果.数据!.命中缓存, 失败原因: undefined } : 值))
      if (typeof Audio === 'function') {
        音频引用.current?.pause()
        const 音频 = new Audio(`data:${结果.数据.类型};base64,${结果.数据.音频}`)
        音频引用.current = 音频
        set播放中(项.页标识)
        音频.onended = () => set播放中(null)
        await 音频.play().catch(() => set播放中(null))
      }
      set状态文本(`第 ${项.页序号} 页讲解音频已就绪${结果.数据.命中缓存 ? '（命中缓存）' : ''}`)
    } catch (错误) {
      const 原因 = 错误 instanceof Error ? 错误.message : '语音合成失败'
      set讲稿列表((旧) => 旧.map((值) => 值.页标识 === 项.页标识 ? { ...值, 失败原因: 原因 } : 值))
      modal.error({ title: `第 ${项.页序号} 页语音合成失败`, content: 原因 })
    }
  }

  const 停止播放 = () => { 音频引用.current?.pause(); set播放中(null); set状态文本('已停止试听') }

  const 合成全部 = async () => {
    if (!讲稿列表.length) { void message.info('请先生成讲稿'); return }
    set运行中(true); set状态文本('正在合成全部讲解音频')
    try {
      const 结果 = await 桥接.presentationAi.narrate({ 请求标识: `ppt-narrate-${++请求序号.current}-${Date.now()}`, 讲稿: 讲稿列表.map((项) => ({ 页标识: 项.页标识, 讲稿: 项.讲稿 })) })
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '讲解音频合成失败')
      const 音频表 = new Map(结果.数据.音频.map((项) => [项.页标识, 项]))
      const 失败表 = new Map(结果.数据.失败.map((项) => [项.页标识, 项.原因]))
      set讲稿列表((旧) => 旧.map((项) => {
        const 音频 = 音频表.get(项.页标识)
        if (音频) return { ...项, 音频: { 缓存键: 音频.缓存键, 类型: 音频.类型, 字节数: 音频.字节数, 数据: 音频.音频 ?? '' }, 命中缓存: 音频.命中缓存, 失败原因: undefined }
        return { ...项, 失败原因: 失败表.get(项.页标识) ?? '该页未返回音频' }
      }))
      set状态文本(`成功 ${结果.数据.音频.length} 页，失败 ${结果.数据.失败.length} 页；失败原因见各页说明`)
    } catch (错误) {
      modal.error({ title: '讲解音频合成失败', content: 错误 instanceof Error ? 错误.message : '合成失败' })
    } finally { set运行中(false) }
  }

  const 写入备注 = (项: 页面讲稿) => {
    if (只读) return
    const 页 = 文稿.幻灯片列表.find((值) => 值.id === 项.页标识)
    if (!页) return
    const 写入 = () => on修改({ ...文稿, 幻灯片列表: 文稿.幻灯片列表.map((值) => 值.id === 项.页标识 ? { ...值, 备注: 项.讲稿 } : 值) })
    if (页.备注?.trim()) {
      modal.confirm({ title: '覆盖该页现有备注？', content: '该页已有演讲备注，写入讲稿会替换现有内容；此操作可以撤销。', okText: '替换备注', cancelText: '取消', onOk: 写入 })
      return
    }
    写入()
  }

  const 清空缓存 = async () => {
    try {
      const 结果 = await 桥接.presentationAi.clearAudioCache()
      if (!结果.成功) throw new Error(结果.错误 ?? '音频缓存清理失败')
      set状态文本('已清空本机讲解音频缓存')
    } catch (错误) { modal.error({ title: '清理音频缓存失败', content: 错误 instanceof Error ? 错误.message : '清理失败' }) }
  }

  return React.createElement('aside', { className: 'wps-ppt-properties', role: 'complementary', 'aria-label': '智能讲 PPT' },
    React.createElement('h3', null, '智能讲 PPT'),
    React.createElement('p', { className: 'wps-ppt-properties__hint' }, '讲稿由 AI 模型按页生成；讲解语音必须由已配置的 AI 语音合成服务提供。'),
    React.createElement('div', { className: 'wps-ppt-properties__actions' },
      React.createElement('button', { type: 'button', disabled: 只读 || 运行中 || !桥接.presentationAi.可用, onClick: () => void 生成() }, 运行中 ? '处理中…' : '生成分页讲稿'),
      React.createElement('button', { type: 'button', disabled: 运行中 || !讲稿列表.length, onClick: () => void 合成全部() }, '合成全部讲解音频'),
      React.createElement('button', { type: 'button', disabled: 播放中 === null, onClick: 停止播放 }, '停止试听'),
      React.createElement('button', { type: 'button', onClick: () => void 清空缓存() }, '清空音频缓存'),
    ),
    状态文本 ? React.createElement('p', { role: 'status', 'aria-live': 'polite' }, 状态文本) : null,
    React.createElement('ol', { className: 'wps-ppt-narration-list' },
      讲稿列表.map((项) => React.createElement('li', { key: 项.页标识 },
        React.createElement('p', null, `第 ${项.页序号} 页 · ${项.标题}`),
        React.createElement('p', { className: 'wps-ppt-properties__original' }, 项.讲稿),
        React.createElement('p', null, 项.失败原因
          ? `音频失败：${项.失败原因}`
          : 项.音频 ? `音频已就绪${项.命中缓存 ? '（缓存）' : ''}${项.音频.字节数 ? `，${Math.round(项.音频.字节数 / 1024)} KB` : ''}` : '尚未合成音频'),
        React.createElement('div', { className: 'wps-ppt-properties__actions' },
          React.createElement('button', { type: 'button', disabled: !桥接.presentationAi.可用, onClick: () => void 试听(项) }, 播放中 === 项.页标识 ? '停止' : '试听'),
          React.createElement('button', { type: 'button', disabled: 只读, onClick: () => 写入备注(项) }, '写入演讲备注'),
        ),
      )),
    ),
  )
}
