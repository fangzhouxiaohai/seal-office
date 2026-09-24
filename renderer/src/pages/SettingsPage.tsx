// 设置页面 - 按照项目UI风格和专业设计规范实现
import { useState } from 'react'
import { Tabs, Card, Switch, Select, message } from 'antd'
import { useSettings } from '../store/settingsStore'
import { useAppStore } from '../store'
import AboutDialog from '../components/AboutDialog'
import DefaultAppSetter from '../components/DefaultAppSetter'
import HelpManual from '../components/HelpManual'
import Icon from '../components/Icon'

const { Option } = Select

const SettingsPage = () => {
  const { 主题, 切换主题, 语言, 设置语言 } = useSettings()
  const { goHome } = useAppStore()
  const [关于打开, set关于打开] = useState(false)
  const [帮助打开, set帮助打开] = useState(false)
  const [活动Tab, 设活动Tab] = useState('general')

  const 标签项 = [
    {
      key: 'general',
      label: '常规设置',
      icon: 'settings',
      children: (
        <Card title="界面设置" variant="borderless" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>深浅模式</div>
              <div style={{ color: '#8a92a6', fontSize: 13 }}>切换浅色/深色主题</div>
            </div>
            <Switch
              checked={主题 === '深色'}
              onChange={切换主题}
              checkedChildren="深色"
              unCheckedChildren="浅色"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #f0f2f5', marginTop: 8 }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>界面语言</div>
              <div style={{ color: '#8a92a6', fontSize: 13 }}>当前仅支持中文</div>
            </div>
            <Select value={语言} onChange={设置语言} style={{ width: 120 }}>
              <Option value="zh-CN">简体中文</Option>
            </Select>
          </div>
        </Card>
      )
    },
    {
      key: 'system',
      label: '系统设置',
      icon: 'cpu',
      children: <DefaultAppSetter />
    },
    {
      key: 'help',
      label: '帮助与支持',
      icon: 'help-circle',
      children: (
        <Card title="帮助资源" variant="borderless">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { 标题: '使用手册', 描述: '查看详细的功能说明和操作指南', 图标: 'book-open' },
              { 标题: '常见问题', 描述: '查看常见问题的解答', 图标: 'question-mark-circle' },
              { 标题: '反馈建议', 描述: '向我们反馈使用体验', 图标: 'mail' }
            ].map((项, 索引) => (
              <div key={索引} style={{ padding: 12, border: '1px solid #e8ebf0', borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name={项.图标} size={16} />
                    <span style={{ fontWeight: 500 }}>{项.标题}</span>
                  </div>
                  <button
                    className="ant-btn ant-btn-primary ant-btn-sm"
                    onClick={() => {
                      if (项.标题 === '反馈建议') {
                        message.success('感谢反馈！请发送邮件至 24519660@qq.com')
                      } else {
                        set帮助打开(true)
                      }
                    }}
                  >
                    查看
                  </button>
                </div>
                <div style={{ color: '#8a92a6', fontSize: 13, marginTop: 4, marginLeft: 24 }}>{项.描述}</div>
              </div>
            ))}
            <div style={{ padding: 12, border: '1px solid #e8ebf0', borderRadius: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="info" size={16} />
                  <span style={{ fontWeight: 500 }}>关于海豹办公</span>
                </div>
                <button
                  className="ant-btn ant-btn-primary ant-btn-sm"
                  onClick={() => set关于打开(true)}
                >
                  查看
                </button>
              </div>
              <div style={{ color: '#8a92a6', fontSize: 13, marginTop: 4, marginLeft: 24 }}>查看版本信息和开源许可</div>
            </div>
          </div>
        </Card>
      )
    },
    {
      key: 'about',
      label: '关于',
      icon: 'info',
      children: (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ 
            width: 64, 
            height: 64, 
            margin: '0 auto 16px',
            background: '#2b6cf6',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 32,
            fontWeight: 'bold'
          }}>
            海
          </div>
          <h2 style={{ marginBottom: 8 }}>海豹办公 Seal Office</h2>
          <p style={{ color: '#8a92a6', marginBottom: 24 }}>版本 1.1.0</p>
          <Card style={{ maxWidth: 400, margin: '0 auto', textAlign: 'left', marginBottom: 24 }}>
            <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f2f5' }}>
              <span style={{ color: '#8a92a6', marginRight: 16 }}>作者：</span>
              <strong>饮风一笑</strong>
            </div>
            <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f2f5' }}>
              <span style={{ color: '#8a92a6', marginRight: 16 }}>邮箱：</span>
              <a href="mailto:24519660@qq.com">24519660@qq.com</a>
            </div>
            <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f2f5' }}>
              <span style={{ color: '#8a92a6', marginRight: 16 }}>说明：</span>
              <strong>本程序永久免费开源</strong>
            </div>
            <div style={{ padding: '8px 0' }}>
              <span style={{ color: '#8a92a6', marginRight: 16 }}>开源地址：</span>
              <a href="https://github.com/seal-office/seal-office" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>
          </Card>
          <p style={{ color: '#8a92a6', fontSize: 14, marginBottom: 16 }}>专业AI开发定制小程序APP</p>
          <button className="ant-btn ant-btn-primary" onClick={() => set关于打开(true)}>查看详情</button>
        </div>
      )
    }
  ]

  return (
    <div className="settings-page" style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button 
          className="ant-btn"
          onClick={goHome}
          style={{ marginRight: 8 }}
        >
          <Icon name="arrow-left" size={16} />
          返回首页
        </button>
        <h1 style={{ margin: 0 }}>设置</h1>
      </div>
      
      <Tabs 
        activeKey={活动Tab} 
        onChange={设活动Tab}
        items={标签项.map(项 => ({
          key: 项.key,
          label: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name={项.icon} size={16} />
              {项.label}
            </span>
          ),
          children: 项.children
        }))}
        style={{ maxWidth: 800 }}
      />
      
      <AboutDialog 打开状态={关于打开} 关闭回调={() => set关于打开(false)} />
      <HelpManual 打开状态={帮助打开} 关闭回调={() => set帮助打开(false)} />
    </div>
  )
}

export default SettingsPage
