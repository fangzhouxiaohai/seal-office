import { useEffect, useState } from 'react'
import { App as AntdApp, Button, Input, InputNumber, Checkbox, Select } from 'antd'
import { 桥接, type 助手配置, type 思考强度, type 思考参数模式 } from '../ipc/bridge'
import 预设列表 from '../../../main/ai/providers.json'
import { 思考选项, 参数选项, 思考说明 } from './reasoning'
import './assistant.css'

interface Props { onSaved?: (配置: 助手配置) => void; compact?: boolean }

const 空配置: 助手配置 = { 名称: '', 地址: '', 模型: '', 上下文令牌: 131072, 已配置密钥: false }

export default function AiSettingsCard({ onSaved, compact = false }: Props) {
  const { message, modal } = AntdApp.useApp()
  const [配置, set配置] = useState<助手配置>(空配置)
  const [密钥, set密钥] = useState('')
  const [清除密钥, set清除密钥] = useState(false)
  const [读取中, set读取中] = useState(true)
  const [保存中, set保存中] = useState(false)
  const [高级展开, set高级展开] = useState(false)
  const 桌面可用 = 桥接.ai.可用

  useEffect(() => {
    if (!桌面可用) { set读取中(false); return }
    let 有效 = true
    const 读取配置 = () => {
      set读取中(true)
      void 桥接.ai.getConfig().then((结果) => {
        if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '无法读取模型设置')
        if (有效) { set配置(结果.数据); set密钥(''); set清除密钥(false) }
      }).catch((错误: unknown) => {
        if (有效) modal.error({ title: '读取模型设置失败', content: 错误 instanceof Error ? 错误.message : '请检查本机安全存储' })
      }).finally(() => { if (有效) set读取中(false) })
    }
    读取配置()
    window.addEventListener('seal-ai-setting-changed', 读取配置)
    return () => { 有效 = false; window.removeEventListener('seal-ai-setting-changed', 读取配置) }
  }, [modal, 桌面可用])

  const 保存 = async () => {
    set保存中(true)
    try {
      const 上下文令牌 = 配置.上下文令牌 ?? 131072
      if (!Number.isInteger(上下文令牌) || 上下文令牌 < 8192 || 上下文令牌 > 4194304) throw new Error('上下文令牌须为 8192 至 4194304 的整数，请按模型实际容量填写')
      const 结果 = await 桥接.ai.saveConfig({ 名称: 配置.名称, 地址: 配置.地址, 模型: 配置.模型, 服务商: 配置.服务商 ?? 'custom', 思考强度: 配置.思考强度 ?? 'high', 参数模式: 配置.参数模式 ?? 'none', 上下文令牌, ...(密钥 ? { 密钥 } : {}), 清除密钥 })
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '模型设置保存失败')
      set配置(结果.数据)
      set密钥('')
      set清除密钥(false)
      onSaved?.(结果.数据)
      window.dispatchEvent(new Event('seal-ai-setting-changed'))
      message.success('模型设置已保存')
    } catch (错误) {
      modal.error({ title: '保存模型设置失败', content: 错误 instanceof Error ? 错误.message : '请检查输入内容和本机安全存储' })
    } finally { set保存中(false) }
  }

  const 选择服务商 = (标识: string) => {
    const 预设 = 预设列表.find((项) => 项.标识 === 标识)
    set配置(预设 ? { 名称: 预设.名称, 地址: 预设.地址, 模型: 预设.模型, 服务商: 标识, 参数模式: 预设.参数模式 as 思考参数模式, 思考强度: 'high', 已配置密钥: false } : { ...空配置, 服务商: 'custom', 思考强度: 'high', 参数模式: 'none' })
    set密钥(''); set清除密钥(true); set高级展开(!预设 || !预设.模型)
  }
  const 预设 = 预设列表.find((项) => 项.标识 === 配置.服务商)
  const 编辑禁用 = !桌面可用 || 读取中 || 保存中
  const 显示高级 = !预设 || 高级展开

  const 清除设置 = () => {
    modal.confirm({
      title: '清除模型设置',
      content: '将删除本机保存的服务地址、模型名称和访问密钥。已打开文件不会改变。',
      okText: '确认清除',
      cancelText: '取消',
      onOk: async () => {
        try {
          const 结果 = await 桥接.ai.clearConfig()
          if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '无法删除本机模型设置')
          set配置(结果.数据)
          set密钥('')
          set清除密钥(false)
          onSaved?.(结果.数据)
          window.dispatchEvent(new Event('seal-ai-setting-changed'))
          message.success('模型设置已清除')
        } catch (错误) {
          modal.error({ title: '清除模型设置失败', content: 错误 instanceof Error ? 错误.message : '无法删除本机模型设置' })
        }
      },
    })
  }

  return <section className={`assistant-settings${compact ? ' assistant-settings--compact' : ''}`} aria-label="智能助手模型设置">
    <div className="assistant-settings__heading">
      <strong>智能助手模型服务</strong>
      <span>{桌面可用 ? (配置.已配置密钥 ? '已保存访问密钥' : '未保存访问密钥') : '仅桌面版可配置'}</span>
    </div>
    <p className="assistant-settings__note">{桌面可用 ? '支持兼容聊天补全接口的模型服务。文件内容仅在您发送消息时交给所配置的服务商。' : '请在 Windows 桌面版中配置并使用智能助手。'}</p>
    <div className="assistant-settings__grid">
      <label>模型服务商
        <Select aria-label="选择模型服务商" value={配置.服务商 ?? 'custom'} disabled={编辑禁用} onChange={选择服务商} options={[...预设列表.map((项) => ({ value: 项.标识, label: 项.名称 })), { value: 'custom', label: '自定义兼容服务' }]} />
      </label>
      {预设 ? <p className="assistant-settings__note">{预设.说明}</p> : null}
      {显示高级 ? <>
      <label>服务商名称
        <Input aria-label="模型服务商名称" value={配置.名称} disabled={!桌面可用 || 读取中 || 保存中} placeholder="如：本机模型服务" onChange={(事件) => set配置((当前) => ({ ...当前, 名称: 事件.target.value }))} />
      </label>
      <label>接口地址
        <Input aria-label="模型接口地址" value={配置.地址} disabled={!桌面可用 || 读取中 || 保存中} placeholder="完整的聊天补全接口地址" onChange={(事件) => set配置((当前) => ({ ...当前, 地址: 事件.target.value }))} />
      </label>
      <label>模型名称
        <Input aria-label="模型名称" value={配置.模型} disabled={!桌面可用 || 读取中 || 保存中} placeholder="请输入模型标识" onChange={(事件) => set配置((当前) => ({ ...当前, 模型: 事件.target.value }))} />
      </label>
      <label>思考参数模式
        <Select aria-label="思考参数模式" value={配置.参数模式 ?? 'none'} disabled={编辑禁用} options={参数选项} onChange={(值: 思考参数模式) => set配置((当前) => ({ ...当前, 参数模式: 值 }))} />
      </label>
      <label>上下文令牌
        <InputNumber aria-label="上下文令牌" value={配置.上下文令牌 ?? 131072} min={8192} max={4194304} step={8192} precision={0} disabled={编辑禁用} onChange={(值) => set配置((当前) => ({ ...当前, 上下文令牌: 值 ?? 0 }))} />
      </label>
      <p className="assistant-settings__note">按模型实际上下文容量填写。接近容量时会自动压缩历史记忆，完整对话仍保存在本机。</p>
      </> : <div className="assistant-settings__preset-summary">{配置.名称} · {配置.模型 || '待填写模型'}<Button type="link" onClick={() => set高级展开(true)}>高级设置</Button></div>}
      <label>默认思考强度
        <Select aria-label="默认思考强度" value={配置.思考强度 ?? 'high'} disabled={编辑禁用} options={思考选项} onChange={(值: 思考强度) => set配置((当前) => ({ ...当前, 思考强度: 值 }))} />
      </label>
      <p className="assistant-settings__note">{思考说明(配置.参数模式, 配置.思考强度)}</p>
      <label>访问密钥
        <Input.Password aria-label="模型访问密钥" autoComplete="new-password" value={密钥} disabled={编辑禁用} placeholder={配置.已配置密钥 ? '留空则沿用已保存密钥' : 预设 ? '填写该服务商的 API 密钥' : '无密钥的本机服务可留空'} onChange={(事件) => { set密钥(事件.target.value); if (事件.target.value) set清除密钥(false) }} />
      </label>
    </div>
    {配置.已配置密钥 ? <Checkbox checked={清除密钥} disabled={保存中} onChange={(事件) => set清除密钥(事件.target.checked)}>删除已保存密钥</Checkbox> : null}
    <div className="assistant-settings__actions"><Button onClick={清除设置} disabled={!桌面可用 || 保存中}>清除设置</Button><Button type="primary" onClick={() => void 保存()} loading={保存中} disabled={!桌面可用 || 读取中}>保存模型设置</Button></div>
  </section>
}
