import { useState } from 'react'
import { Switch, Select, message, Button } from 'antd'
import { useSettings } from '../store/settingsStore'
import { useAppStore } from '../store'
import AboutDialog from '../components/AboutDialog'
import DefaultAppSetter from '../components/DefaultAppSetter'
import HelpManual from '../components/HelpManual'
import Icon from '../components/Icon'
import SealLogo from '../components/SealLogo'
import './settings.css'

const SettingsPage = () => {
  const { 主题, 切换主题, 语言, 设置语言 } = useSettings()
  const { goHome } = useAppStore()
  const [关于打开, set关于打开] = useState(false)
  const [帮助打开, set帮助打开] = useState(false)
  const [活动Tab, 设活动Tab] = useState('general')
  const 标签 = [
    { key: 'general', label: '常规设置', icon: 'settings' },
    { key: 'system', label: '系统设置', icon: 'settings' },
    { key: 'help', label: '帮助与支持', icon: 'help' },
    { key: 'about', label: '关于', icon: 'help' },
  ]
  const 设置行 = (标题: string, 描述: string, 控件: React.ReactNode) => (
    <div className="settings-row"><div><div className="settings-row__title">{标题}</div><div className="settings-row__description">{描述}</div></div>{控件}</div>
  )
  const 内容 = 活动Tab === 'general' ? (
    <div className="settings-panel">
      {设置行('深浅模式', '切换浅色或深色主题', <Switch checked={主题 === '深色'} onChange={切换主题} checkedChildren="深色" unCheckedChildren="浅色" />)}
      {设置行('界面语言', '当前仅支持中文', <Select value={语言} onChange={设置语言} options={[{ value: 'zh-CN', label: '简体中文' }]} style={{ width: 120 }} />)}
    </div>
  ) : 活动Tab === 'system' ? <DefaultAppSetter /> : 活动Tab === 'help' ? (
    <div className="settings-panel">
      {['使用手册', '常见问题', '反馈建议'].map((标题) => <div className="settings-row" key={标题}><div><div className="settings-row__title">{标题}</div><div className="settings-row__description">查看相关内容或提交反馈</div></div><Button type="primary" size="small" onClick={() => 标题 === '反馈建议' ? message.success('感谢反馈，请发送邮件至 24519660@qq.com') : set帮助打开(true)}>查看</Button></div>)}
      {设置行('关于海豹办公', '查看版本信息和开源许可', <Button size="small" onClick={() => set关于打开(true)}>查看</Button>)}
    </div>
  ) : (
    <div className="settings-panel" style={{ textAlign: 'center' }}><SealLogo size={80} withBackground={false} /><h2>海豹办公 Seal Office</h2><p>版本 1.2.0</p><Button type="primary" onClick={() => set关于打开(true)}>查看详情</Button></div>
  )
  return <div className="settings-page"><div className="settings-page__header"><Button icon={<Icon name="arrow-left" size={16} />} onClick={goHome}>返回首页</Button><h1>设置</h1></div><div className="settings-page__layout"><nav className="settings-page__nav">{标签.map((项) => <button type="button" key={项.key} aria-selected={活动Tab === 项.key} onClick={() => 设活动Tab(项.key)}><Icon name={项.icon} size={16} /> {项.label}</button>)}</nav><main className="settings-page__content">{内容}</main></div><AboutDialog 打开状态={关于打开} 关闭回调={() => set关于打开(false)} /><HelpManual 打开状态={帮助打开} 关闭回调={() => set帮助打开(false)} /></div>
}

export default SettingsPage
