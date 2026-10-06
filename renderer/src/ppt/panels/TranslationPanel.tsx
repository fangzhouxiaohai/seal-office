// 翻译与语义校对面板：范围选择、候选差异预览、逐条与整体应用、服务能力引导。
import React from 'react'
import { App as AntdApp } from 'antd'
import { 桥接, type 校对建议, type 翻译候选, type 演示能力表 } from '../../ipc/bridge'
import { type 演示文稿 } from '../deck'
import { 收集智能条目, 应用条目集合, type 智能条目, type 智能范围 } from '../model/aiTargets'
import 服务设置面板 from './PresentationServiceSettings'

interface Props {
  文稿: 演示文稿
  当前索引: number
  选中: string[]
  只读: boolean
  on修改: (文稿: 演示文稿) => void
}

const 语言选项 = [
  { 值: 'zh', 名称: '简体中文' },
  { 值: 'en', 名称: '英语' },
  { 值: 'ja', 名称: '日语' },
  { 值: 'ko', 名称: '韩语' },
  { 值: 'fr', 名称: '法语' },
  { 值: 'de', 名称: '德语' },
  { 值: 'ru', 名称: '俄语' },
  { 值: 'es', 名称: '西班牙语' },
]

export default function TranslationPanel({ 文稿, 当前索引, 选中, 只读, on修改 }: Props) {
  const { message, modal } = AntdApp.useApp()
  const [范围, set范围] = React.useState<智能范围>('当前页')
  const [目标语言, set目标语言] = React.useState('en')
  const [术语文本, set术语文本] = React.useState('')
  const [运行中, set运行中] = React.useState(false)
  const [状态文本, set状态文本] = React.useState('')
  const [能力, set能力] = React.useState<演示能力表 | null>(null)
  const [设置展开, set设置展开] = React.useState(false)
  const [候选, set候选] = React.useState<Array<{ 条目: 智能条目; 译文: string; 采用: boolean }>>([])
  const [建议, set建议] = React.useState<Array<{ 条目: 智能条目; 建议: 校对建议; 采用: boolean }>>([])
  const [双语副本, set双语副本] = React.useState(false)
  const 请求序号 = React.useRef(0)

  const 条目 = React.useMemo(() => 收集智能条目(文稿, 范围, 当前索引, 选中), [文稿, 范围, 当前索引, 选中])
  const 术语表 = React.useMemo(() => 术语文本.split('\n').map((行) => 行.split(/[=:：\t]/)).filter((项) => 项.length >= 2 && 项[0].trim() && 项[1].trim()).map((项) => ({ 原文: 项[0].trim(), 译文: 项.slice(1).join('=').trim() })), [术语文本])

  const 刷新能力 = React.useCallback(async () => {
    const 结果 = await 桥接.presentationAi.capabilities()
    if (结果.成功 && 结果.数据) set能力(结果.数据)
    else if (!结果.成功) set能力(null)
  }, [])

  React.useEffect(() => { void 刷新能力() }, [刷新能力])
  React.useEffect(() => 桥接.presentationAi.onStream((片段) => set状态文本(片段.内容)), [])

  const 缺文本能力 = 能力 && 能力.文本.状态 !== '可用'

  const 执行翻译 = async () => {
    if (只读) return
    if (!条目.length) { void message.warning('当前范围没有可翻译的文字'); return }
    if (缺文本能力) { set设置展开(true); void message.warning(能力!.文本.原因 ?? '请先配置模型服务'); return }
    set运行中(true); set状态文本('正在准备翻译')
    try {
      const 请求标识 = `ppt-translate-${++请求序号.current}-${Date.now()}`
      const 结果 = await 桥接.presentationAi.translate({ 请求标识, 条目: 条目.map((项) => ({ 对象标识: 项.对象标识, 原文: 项.原文, 来源: 项.来源 })), 目标语言, 术语表 })
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '翻译失败')
      const 表 = new Map(条目.map((项) => [项.对象标识, 项]))
      set候选(结果.数据.译文.map((项: 翻译候选) => ({ 条目: 表.get(项.对象标识)!, 译文: 项.译文, 采用: true })).filter((项) => 项.条目))
      set建议([])
      set状态文本(`已生成 ${结果.数据.译文.length} 条候选译文，请核对后应用`)
    } catch (错误) {
      modal.error({ title: '翻译失败', content: 错误 instanceof Error ? 错误.message : '翻译失败' })
    } finally { set运行中(false) }
  }

  const 执行校对 = async () => {
    if (只读) return
    if (!条目.length) { void message.warning('当前范围没有可校对的文字'); return }
    if (缺文本能力) { set设置展开(true); void message.warning(能力!.文本.原因 ?? '请先配置模型服务'); return }
    set运行中(true); set状态文本('正在进行语义校对')
    try {
      const 请求标识 = `ppt-proofread-${++请求序号.current}-${Date.now()}`
      const 结果 = await 桥接.presentationAi.proofread({ 请求标识, 条目: 条目.map((项) => ({ 对象标识: 项.对象标识, 原文: 项.原文, 来源: 项.来源 })) })
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '语义校对失败')
      const 表 = new Map(条目.map((项) => [项.对象标识, 项]))
      set建议(结果.数据.建议.map((项) => ({ 条目: 表.get(项.对象标识)!, 建议: 项, 采用: true })).filter((项) => 项.条目))
      set候选([])
      set状态文本(结果.数据.建议.length ? `发现 ${结果.数据.建议.length} 条语义建议，请逐条确认` : '未发现语义问题')
    } catch (错误) {
      modal.error({ title: '语义校对失败', content: 错误 instanceof Error ? 错误.message : '语义校对失败' })
    } finally { set运行中(false) }
  }

  const 应用候选 = async () => {
    const 采用 = 候选.filter((项) => 项.采用)
    if (!采用.length) return
    try {
      const 核对 = await 桥接.presentationAi.validateTranslation(
        采用.map((项) => ({ 对象标识: 项.条目.对象标识, 原文: 项.条目.原文, 译文: 项.译文 })),
        采用.map((项) => ({ 对象标识: 项.条目.对象标识, 原文: 当前原文(文稿, 项.条目) })),
      )
      if (!核对.成功) throw new Error(核对.错误 ?? '译文核对失败')
      const 新稿 = 应用条目集合(文稿, 采用.map((项) => ({ 条目: 项.条目, 新文本: 双语副本 ? `${项.条目.原文}\n${项.译文}` : 项.译文 })))
      on修改(新稿)
      set候选([])
      set状态文本(`已应用 ${采用.length} 条译文，可用撤销恢复`)
    } catch (错误) {
      modal.error({ title: '应用译文失败', content: 错误 instanceof Error ? 错误.message : '应用译文失败' })
    }
  }

  const 应用建议 = async (索引: number) => {
    const 项 = 建议[索引]
    if (!项) return
    try {
      const 核对 = await 桥接.presentationAi.validateSuggestion(
        [{ 对象标识: 项.条目.对象标识, 原文: 项.条目.原文, 建议文本: 项.建议.建议文本 }],
        [{ 对象标识: 项.条目.对象标识, 原文: 当前原文(文稿, 项.条目) }],
      )
      if (!核对.成功) throw new Error(核对.错误 ?? '建议核对失败')
      on修改(应用条目集合(文稿, [{ 条目: 项.条目, 新文本: 项.建议.建议文本 }]))
      set建议((旧) => 旧.filter((_, 位置) => 位置 !== 索引))
      set状态文本('已应用 1 条建议，可用撤销恢复')
    } catch (错误) {
      modal.error({ title: '应用建议失败', content: 错误 instanceof Error ? 错误.message : '应用建议失败' })
    }
  }

  return React.createElement('aside', { className: 'wps-ppt-properties', role: 'complementary', 'aria-label': '翻译与语义校对' },
    React.createElement('h3', null, '翻译与智能校对'),
    React.createElement('p', { className: 'wps-ppt-properties__hint' }, '本机规则检查只标注排版问题；此处为调用 AI 模型服务的语义分析。'),
    !桥接.presentationAi.可用
      ? React.createElement('p', { role: 'status' }, '当前环境不支持演示智能服务，请使用 Windows 桌面版。')
      : null,
    React.createElement('fieldset', { disabled: 只读 || 运行中 },
      React.createElement('legend', null, '范围与语言'),
      React.createElement('label', null, '处理范围', React.createElement('select', { 'aria-label': '处理范围', value: 范围, onChange: (事件: React.ChangeEvent<HTMLSelectElement>) => { set范围(事件.target.value as 智能范围); set候选([]); set建议([]) } },
        React.createElement('option', { value: '选区' }, `选区（${选中.length} 个对象）`),
        React.createElement('option', { value: '当前页' }, '当前页'),
        React.createElement('option', { value: '全文' }, '全文'),
      )),
      React.createElement('label', null, '目标语言', React.createElement('select', { 'aria-label': '目标语言', value: 目标语言, onChange: (事件: React.ChangeEvent<HTMLSelectElement>) => set目标语言(事件.target.value) },
        语言选项.map((项) => React.createElement('option', { key: 项.值, value: 项.值 }, 项.名称)),
      )),
      React.createElement('label', null, '术语表（每行一条，原文=译文）', React.createElement('textarea', { 'aria-label': '术语表', rows: 3, value: 术语文本, onChange: (事件: React.ChangeEvent<HTMLTextAreaElement>) => set术语文本(事件.target.value), placeholder: '海豹办公=Seal Office' })),
      React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: 双语副本, onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set双语副本(事件.target.checked) }), '应用时生成双语副本（原文+译文）'),
      React.createElement('p', null, `范围内可处理条目：${条目.length}`),
    ),
    React.createElement('div', { className: 'wps-ppt-properties__actions' },
      React.createElement('button', { type: 'button', onClick: () => void 执行翻译(), disabled: 只读 || 运行中 || !桥接.presentationAi.可用 }, 运行中 ? '处理中…' : '翻译所选范围'),
      React.createElement('button', { type: 'button', onClick: () => void 执行校对(), disabled: 只读 || 运行中 || !桥接.presentationAi.可用 }, '语义校对'),
      React.createElement('button', { type: 'button', onClick: () => void 刷新能力() }, '刷新服务状态'),
      React.createElement('button', { type: 'button', onClick: () => set设置展开((值) => !值) }, 设置展开 ? '收起服务设置' : '服务设置'),
    ),
    状态文本 ? React.createElement('p', { role: 'status', 'aria-live': 'polite' }, 状态文本) : null,
    能力 ? React.createElement('ul', { className: 'wps-ppt-properties__capabilities', 'aria-label': '服务能力状态' },
      (['文本', '语音合成', '图像识别'] as const).map((名称) => React.createElement('li', { key: 名称 },
        `${名称}：${能力[名称].状态}${能力[名称].原因 ? `（${能力[名称].原因}）` : ''}`,
      )),
    ) : null,
    设置展开 ? React.createElement(服务设置面板, { on能力变化: () => void 刷新能力() }) : null,
    候选.length ? React.createElement('fieldset', { disabled: 只读 },
      React.createElement('legend', null, '译文候选（预览不修改文稿）'),
      React.createElement('ul', { className: 'wps-ppt-properties__candidates' },
        候选.map((项, 索引) => React.createElement('li', { key: 项.条目.对象标识 },
          React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: 项.采用, onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set候选((旧) => 旧.map((值, 位置) => 位置 === 索引 ? { ...值, 采用: 事件.target.checked } : 值)) }), 项.条目.来源),
          React.createElement('p', { className: 'wps-ppt-properties__original' }, 项.条目.原文),
          React.createElement('p', { className: 'wps-ppt-properties__translated' }, 项.译文),
        )),
      ),
      React.createElement('div', { className: 'wps-ppt-properties__actions' },
        React.createElement('button', { type: 'button', onClick: () => void 应用候选() }, `应用选中的 ${候选.filter((项) => 项.采用).length} 条译文`),
        React.createElement('button', { type: 'button', onClick: () => { set候选([]); set状态文本('已放弃本次译文候选') } }, '放弃候选'),
      ),
    ) : null,
    建议.length ? React.createElement('fieldset', { disabled: 只读 },
      React.createElement('legend', null, `语义建议（${建议.length} 条，逐条确认）`),
      React.createElement('ul', { className: 'wps-ppt-properties__suggestions' },
        建议.map((项, 索引) => React.createElement('li', { key: 项.条目.对象标识 + 索引 },
          React.createElement('p', null, `${项.条目.来源} · ${项.建议.问题类型}`),
          React.createElement('p', { className: 'wps-ppt-properties__original' }, 项.建议.原文),
          React.createElement('p', null, 项.建议.说明),
          React.createElement('p', { className: 'wps-ppt-properties__translated' }, 项.建议.建议文本),
          React.createElement('div', { className: 'wps-ppt-properties__actions' },
            React.createElement('button', { type: 'button', onClick: () => void 应用建议(索引) }, '应用此建议'),
            React.createElement('button', { type: 'button', onClick: () => set建议((旧) => 旧.filter((_, 位置) => 位置 !== 索引)) }, '忽略'),
          ),
        )),
      ),
    ) : null,
  )
}

/** 读取条目当前原文，供应用前的版本核对。 */
export function 当前原文(文稿: 演示文稿, 条目: 智能条目): string {
  const 页 = 文稿.幻灯片列表[条目.页码 - 1]
  if (!页) return ''
  if (条目.种类 === '备注') return 页.备注 ?? ''
  if (条目.种类 === '文本') return 页.文本框列表.find((项) => 项.id === 条目.文本框标识)?.text ?? ''
  const 对象 = (页.对象列表 ?? []).find((项) => 项.id === 条目.对象标识路径)
  if (!对象) return ''
  if (条目.种类 === '图形') return 对象.形状?.文本 ?? ''
  if (条目.单元格) return 对象.表格?.单元格[条目.单元格.行]?.[条目.单元格.列]?.文本 ?? ''
  return ''
}
