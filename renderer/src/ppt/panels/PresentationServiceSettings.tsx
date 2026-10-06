// 演示智能服务设置：语音与识别服务的密钥统一进入主进程安全存储，并展示真实能力状态。
import React from 'react'
import { App as AntdApp } from 'antd'
import { 桥接, type 演示服务种类, type 演示能力表 } from '../../ipc/bridge'

interface Props {
  on能力变化?: () => void
}

const 种类说明: Record<演示服务种类, string> = {
  翻译: '旧版本曾把翻译密钥保存在浏览器设置中；迁移后统一写入系统安全存储。',
  语音: '语音合成必须单独配置；文本模型不能代替语音合成。',
  识别: '图像识别需要具备图像理解或文字识别能力的模型服务。',
}

export default function PresentationServiceSettings({ on能力变化 }: Props) {
  const { message, modal } = AntdApp.useApp()
  const [种类, set种类] = React.useState<演示服务种类>('语音')
  const [名称, set名称] = React.useState('')
  const [地址, set地址] = React.useState('')
  const [模型, set模型] = React.useState('')
  const [密钥, set密钥] = React.useState('')
  const [声线, set声线] = React.useState('')
  const [语速, set语速] = React.useState(1)
  const [已配置密钥, set已配置密钥] = React.useState(false)
  const [声线列表, set声线列表] = React.useState<Array<{ 标识: string; 名称: string }>>([])
  const [能力, set能力] = React.useState<演示能力表 | null>(null)
  const [忙碌, set忙碌] = React.useState(false)
  const [状态文本, set状态文本] = React.useState('')

  const 载入 = React.useCallback(async (目标: 演示服务种类) => {
    const [服务, 能力结果] = await Promise.all([桥接.presentationAi.getService(目标), 桥接.presentationAi.capabilities()])
    if (能力结果.成功 && 能力结果.数据) set能力(能力结果.数据)
    if (!服务.成功) { set状态文本(服务.错误 ?? '服务设置读取失败'); return }
    const 配置 = 服务.数据
    set名称(配置?.名称 ?? ''); set地址(配置?.地址 ?? ''); set模型(配置?.模型 ?? '')
    set声线(配置?.声线 ?? ''); set语速(配置?.语速 ?? 1)
    set已配置密钥(Boolean(配置?.已配置密钥)); set密钥('')
    set状态文本(配置 ? '已载入现有设置；密钥不会回显，留空表示保持不变' : '尚未配置该服务')
  }, [])

  React.useEffect(() => { void 载入(种类) }, [种类, 载入])

  const 保存 = async () => {
    set忙碌(true)
    try {
      const 结果 = await 桥接.presentationAi.saveService(种类, {
        名称, 地址, 模型, 声线: 种类 === '语音' ? 声线 : undefined, 语速: 种类 === '语音' ? 语速 : undefined,
        ...(密钥 ? { 密钥 } : {}),
      })
      if (!结果.成功) throw new Error(结果.错误 ?? '服务设置保存失败')
      set密钥(''); set已配置密钥(Boolean(结果.数据?.已配置密钥))
      set状态文本('设置已保存到系统安全存储')
      on能力变化?.()
      await 载入(种类)
    } catch (错误) { modal.error({ title: '保存服务设置失败', content: 错误 instanceof Error ? 错误.message : '保存失败' }) }
    finally { set忙碌(false) }
  }

  const 清除 = async () => {
    set忙碌(true)
    try {
      const 结果 = await 桥接.presentationAi.clearService(种类)
      if (!结果.成功) throw new Error(结果.错误 ?? '清除服务设置失败')
      set状态文本('已清除该服务设置')
      on能力变化?.()
      await 载入(种类)
    } catch (错误) { modal.error({ title: '清除服务设置失败', content: 错误 instanceof Error ? 错误.message : '清除失败' }) }
    finally { set忙碌(false) }
  }

  const 探测 = async () => {
    set忙碌(true)
    try {
      const 结果 = await 桥接.presentationAi.probeService(种类, { 地址, 模型, ...(密钥 ? { 密钥 } : {}) })
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '服务探测失败')
      set状态文本(结果.数据.可用
        ? `服务可用${结果.数据.模型列表?.length ? `，可用模型 ${结果.数据.模型列表.length} 个` : ''}${结果.数据.警告 ? `；${结果.数据.警告}` : ''}`
        : `服务不可用：${结果.数据.原因 ?? '原因未知'}`)
    } catch (错误) { modal.error({ title: '服务探测失败', content: 错误 instanceof Error ? 错误.message : '探测失败' }) }
    finally { set忙碌(false) }
  }

  const 读取声线 = async () => {
    set忙碌(true)
    try {
      const 结果 = await 桥接.presentationAi.voices()
      if (!结果.成功) throw new Error(结果.错误 ?? '声线读取失败')
      set声线列表(结果.数据 ?? [])
      set状态文本(结果.数据?.length ? `服务返回 ${结果.数据.length} 个可用声线，请选择后保存` : '服务没有返回可用声线')
    } catch (错误) { modal.error({ title: '读取声线失败', content: 错误 instanceof Error ? 错误.message : '读取声线失败' }) }
    finally { set忙碌(false) }
  }

  const 迁移旧翻译 = async () => {
    let 旧配置: { 地址?: string; 密钥?: string; 目标语言?: string }
    try {
      const 原文 = localStorage.getItem('seal.office.translate')
      if (!原文) { void message.info('未发现旧翻译设置'); return }
      旧配置 = JSON.parse(原文) as { 地址?: string; 密钥?: string; 目标语言?: string }
    } catch { modal.error({ title: '旧翻译设置无法读取', content: '旧翻译设置内容已损坏，未做任何迁移' }); return }
    if (typeof 旧配置.地址 !== 'string' || !旧配置.地址.trim()) { void message.info('旧翻译设置没有可用地址，无需迁移'); return }
    set忙碌(true)
    try {
      const 结果 = await 桥接.presentationAi.migrateLegacyTranslate({ 地址: 旧配置.地址, 密钥: 旧配置.密钥 ?? '', 目标语言: 旧配置.目标语言 ?? 'zh' })
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 ?? '迁移失败')
      if (!结果.数据.成功) { set状态文本(`未迁移：${结果.数据.原因 ?? '原因未知'}`); return }
      // 新存储写入并校验通过后才清除旧设置。
      localStorage.removeItem('seal.office.translate')
      set状态文本('旧翻译设置已迁移到系统安全存储，并已清除旧的明文设置')
      on能力变化?.()
      await 载入('翻译')
    } catch (错误) { modal.error({ title: '迁移旧翻译设置失败', content: 错误 instanceof Error ? 错误.message : '迁移失败' }) }
    finally { set忙碌(false) }
  }

  return React.createElement('section', { className: 'wps-ppt-service-settings', 'aria-label': '演示智能服务设置' },
    React.createElement('h4', null, '演示智能服务'),
    能力 ? React.createElement('ul', { 'aria-label': '能力状态' },
      (['文本', '语音合成', '图像识别'] as const).map((名称) => React.createElement('li', { key: 名称 }, `${名称}：${能力[名称].状态}${能力[名称].原因 ? `（${能力[名称].原因}）` : ''}`)),
    ) : null,
    React.createElement('label', null, '服务种类', React.createElement('select', { 'aria-label': '服务种类', value: 种类, onChange: (事件: React.ChangeEvent<HTMLSelectElement>) => set种类(事件.target.value as 演示服务种类) },
      (['语音', '识别', '翻译'] as const).map((项) => React.createElement('option', { key: 项, value: 项 }, 项)),
    )),
    React.createElement('p', { className: 'wps-ppt-properties__hint' }, 种类说明[种类]),
    React.createElement('label', null, '名称', React.createElement('input', { 'aria-label': '服务名称', value: 名称, onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set名称(事件.target.value) })),
    React.createElement('label', null, '接口地址', React.createElement('input', { 'aria-label': '接口地址', value: 地址, placeholder: 'https://…', onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set地址(事件.target.value) })),
    React.createElement('label', null, '模型', React.createElement('input', { 'aria-label': '模型名称', value: 模型, onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set模型(事件.target.value) })),
    React.createElement('label', null, `访问密钥${已配置密钥 ? '（已保存，留空保持不变）' : ''}`, React.createElement('input', { 'aria-label': '访问密钥', type: 'password', value: 密钥, onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set密钥(事件.target.value) })),
    种类 === '语音' ? React.createElement(React.Fragment, null,
      React.createElement('label', null, '声线', React.createElement('input', { 'aria-label': '声线', list: 'wps-ppt-voice-list', value: 声线, onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set声线(事件.target.value) })),
      声线列表.length ? React.createElement('datalist', { id: 'wps-ppt-voice-list' }, 声线列表.map((项) => React.createElement('option', { key: 项.标识, value: 项.标识 }, 项.名称))) : null,
      React.createElement('label', null, '语速', React.createElement('input', { 'aria-label': '语速', type: 'number', min: 0.5, max: 2, step: 0.05, value: 语速, onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set语速(Number(事件.target.value)) })),
      React.createElement('p', { className: 'wps-ppt-properties__hint' }, '缺少女声时以服务实际返回的声线为准，不使用系统语音冒充。'),
    ) : null,
    React.createElement('div', { className: 'wps-ppt-properties__actions' },
      React.createElement('button', { type: 'button', disabled: 忙碌, onClick: () => void 保存() }, '保存到安全存储'),
      React.createElement('button', { type: 'button', disabled: 忙碌, onClick: () => void 探测() }, '探测服务'),
      种类 === '语音' ? React.createElement('button', { type: 'button', disabled: 忙碌, onClick: () => void 读取声线() }, '读取声线') : null,
      种类 === '翻译' ? React.createElement('button', { type: 'button', disabled: 忙碌, onClick: () => void 迁移旧翻译() }, '迁移旧翻译设置') : null,
      React.createElement('button', { type: 'button', disabled: 忙碌, onClick: () => void 清除() }, '清除该服务'),
    ),
    状态文本 ? React.createElement('p', { role: 'status', 'aria-live': 'polite' }, 状态文本) : null,
  )
}
