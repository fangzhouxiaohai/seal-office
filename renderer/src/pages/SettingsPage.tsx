import { useState } from 'react'
import { Switch, Select, Button, Input, message } from 'antd'
import { useSettings } from '../store/settingsStore'
import { useAppStore } from '../store'
import DefaultAppSetter from '../components/DefaultAppSetter'
import Icon from '../components/Icon'
import SealLogo from '../components/SealLogo'
import { 读取翻译配置, 保存翻译配置 } from '../editor/translateSettings'
import './settings.css'

const SettingsPage = () => {
  const { 主题, 切换主题, 语言, 设置语言 } = useSettings()
  const { goHome } = useAppStore()
  const [活动Tab, 设活动Tab] = useState('general')
  const 初始翻译 = 读取翻译配置()
  const [翻译地址, 设翻译地址] = useState<string>(初始翻译.地址)
  const [翻译密钥, 设翻译密钥] = useState<string>(初始翻译.密钥 ?? '')
  const 标签 = [
    { key: 'general', label: '常规设置', icon: 'settings' },
    { key: 'translate', label: '翻译设置', icon: 'settings' },
    { key: 'system', label: '系统设置', icon: 'settings' },
    { key: 'about', label: '关于', icon: 'help' },
  ]

  const 信息 = {
    名称: '海豹办公',
    英文名称: 'Seal Office',
    版本: '1.2.0',
    作者: '饮风一笑',
    邮箱: '24519660@qq.com',
    说明: '本程序永久免费开源',
    开源地址: 'https://github.com/seal-office/seal-office',
    专业服务: '专业应用开发服务',
  }

  const 设置行 = (标题: string, 描述: string, 控件: React.ReactNode) => (
    <div className="settings-row"><div><div className="settings-row__title">{标题}</div><div className="settings-row__description">{描述}</div></div>{控件}</div>
  )

  const 关于内容 = (
    <div className="settings-panel" style={{ textAlign: 'center' }}>
      <SealLogo size={80} />
      <h2 style={{ margin: '16px 0 4px' }}>{信息.名称} {信息.英文名称}</h2>
      <p style={{ color: '#888', margin: '0 0 20px' }}>版本 {信息.版本}</p>
      <div style={{ background: '#F5F7FA', borderRadius: '8px', padding: '16px', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E8EBF0' }}>
          <span style={{ color: '#888' }}>作者</span>
          <span>{信息.作者}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E8EBF0' }}>
          <span style={{ color: '#888' }}>邮箱</span>
          <a href="mailto:24519660@qq.com" style={{ color: '#2B6CF6' }}>{信息.邮箱}</a>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E8EBF0' }}>
          <span style={{ color: '#888' }}>说明</span>
          <span>{信息.说明}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E8EBF0' }}>
          <span style={{ color: '#888' }}>开源地址</span>
          <a href={信息.开源地址} target="_blank" rel="noopener noreferrer" style={{ color: '#2B6CF6', wordBreak: 'break-all' }}>{信息.开源地址}</a>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span style={{ color: '#888' }}>专业服务</span>
          <span>{信息.专业服务}</span>
        </div>
      </div>
      <p style={{ color: '#888', fontSize: '12px', marginTop: '16px', marginBottom: 0 }}>© 2026 饮风一笑。本程序永久免费开源。</p>
    </div>
  )

  const 保存翻译设置 = () => {
    保存翻译配置({ 地址: 翻译地址, 密钥: 翻译密钥 })
    message.success('翻译设置已保存')
  }

  const 翻译内容 = (
    <div className="settings-panel">
      {设置行(
        '翻译服务地址',
        '填写翻译服务的接口地址，用于文字翻译功能的调用',
        <Input
          placeholder="https://api.example.com/translate"
          value={翻译地址}
          onChange={(事件: React.ChangeEvent<HTMLInputElement>) => 设翻译地址(事件.target.value)}
          style={{ width: 360 }}
        />
      )}
      {设置行(
        '翻译服务密钥',
        '调用翻译服务所需的密钥，填写后用于接口鉴权',
        <Input.Password
          placeholder="请输入密钥"
          value={翻译密钥}
          onChange={(事件: React.ChangeEvent<HTMLInputElement>) => 设翻译密钥(事件.target.value)}
          style={{ width: 360 }}
        />
      )}
      <div className="settings-row"><div></div><Button type="primary" onClick={保存翻译设置}>保存翻译设置</Button></div>
    </div>
  )

  const 内容 = 活动Tab === 'general' ? (
    <div className="settings-panel">
      {设置行('深浅模式', '切换浅色或深色主题', <Switch checked={主题 === '深色'} onChange={切换主题} checkedChildren="深色" unCheckedChildren="浅色" />)}
      {设置行('界面语言', '当前仅支持中文', <Select value={语言} onChange={设置语言} options={[{ value: 'zh-CN', label: '简体中文' }]} style={{ width: 120 }} />)}
    </div>
  ) : 活动Tab === 'translate' ? 翻译内容 : 活动Tab === 'system' ? <DefaultAppSetter /> : (
    关于内容
  )
  return <div className="settings-page"><div className="settings-page__header"><Button icon={<Icon name="arrow-left" size={16} />} onClick={goHome}>返回首页</Button><h1>设置</h1></div><div className="settings-page__layout"><nav className="settings-page__nav">{标签.map((项) => <button type="button" key={项.key} aria-selected={活动Tab === 项.key} onClick={() => 设活动Tab(项.key)}><Icon name={项.icon} size={16} /> {项.label}</button>)}</nav><main className="settings-page__content">{内容}</main></div></div>
}

export default SettingsPage
