// 设置页面
import { useState } from 'react'
import { useSettings } from '../store/settingsStore'
import AboutDialog from '../components/AboutDialog'
import DefaultAppSetter from '../components/DefaultAppSetter'
import HelpManual from '../components/HelpManual'

const SettingsPage = () => {
  const { 主题, 切换主题 } = useSettings()
  const [关于打开, set关于打开] = useState(false)
  const [帮助打开, set帮助打开] = useState(false)

  const 标签项 = [
    {
      key: 'general',
      label: '常规设置',
      children: (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ marginTop: 0 }}>界面设置</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>深浅模式</div>
                <div style={{ color: '#888', fontSize: '12px' }}>切换浅色/深色主题</div>
              </div>
              <button
                className={`ant-btn ${主题 === '深色' ? 'ant-btn-primary' : ''}`}
                onClick={切换主题}
                style={{ padding: '4px 12px' }}
              >
                {主题 === '深色' ? '深色' : '浅色'}
              </button>
            </div>
          </div>
          <div>
            <h3>语言设置</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>界面语言</div>
                <div style={{ color: '#888', fontSize: '12px' }}>当前仅支持中文</div>
              </div>
              <span style={{ color: '#888' }}>简体中文</span>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'system',
      label: '系统设置',
      children: <DefaultAppSetter />
    },
    {
      key: 'help',
      label: '帮助与支持',
      children: (
        <div>
          <h3>帮助资源</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { 标题: '使用手册', 描述: '查看详细的功能说明和操作指南' },
              { 标题: '常见问题', 描述: '查看常见问题的解答' },
              { 标题: '反馈建议', 描述: '向我们反馈使用体验' }
            ].map((项, 索引) => (
              <div key={索引} style={{ padding: '12px', border: '1px solid #E8EBF0', borderRadius: '8px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{项.标题}</div>
                <div style={{ color: '#888', fontSize: '13px', marginBottom: '8px' }}>{项.描述}</div>
                <button
                  className="ant-btn ant-btn-primary ant-btn-sm"
                  onClick={() => {
                    if (项.标题 === '反馈建议') {
                      alert('感谢反馈！请发送邮件至 24519660@qq.com')
                    } else {
                      set帮助打开(true)
                    }
                  }}
                >
                  查看
                </button>
              </div>
            ))}
            <div style={{ padding: '12px', border: '1px solid #E8EBF0', borderRadius: '8px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>关于海豹办公</div>
              <div style={{ color: '#888', fontSize: '13px', marginBottom: '8px' }}>查看版本信息和开源许可</div>
              <button
                className="ant-btn ant-btn-primary ant-btn-sm"
                onClick={() => set关于打开(true)}
              >
                查看
              </button>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'about',
      label: '关于',
      children: (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🐉</div>
          <h2>海豹办公 Seal Office</h2>
          <p style={{ color: '#888', marginBottom: '24px' }}>版本 1.1.0</p>
          <div style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'left', padding: '16px', border: '1px solid #E8EBF0', borderRadius: '8px', marginBottom: '24px' }}>
            <div style={{ padding: '8px 0', borderBottom: '1px solid #E8EBF0' }}>
              <span style={{ color: '#888', marginRight: '16px' }}>作者：</span>
              <strong>饮风一笑</strong>
            </div>
            <div style={{ padding: '8px 0', borderBottom: '1px solid #E8EBF0' }}>
              <span style={{ color: '#888', marginRight: '16px' }}>邮箱：</span>
              <a href="mailto:24519660@qq.com">24519660@qq.com</a>
            </div>
            <div style={{ padding: '8px 0', borderBottom: '1px solid #E8EBF0' }}>
              <span style={{ color: '#888', marginRight: '16px' }}>说明：</span>
              <strong>本程序永久免费开源</strong>
            </div>
            <div style={{ padding: '8px 0' }}>
              <span style={{ color: '#888', marginRight: '16px' }}>开源地址：</span>
              <a href="https://github.com/seal-office/seal-office" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>
          </div>
          <p style={{ color: '#888', fontSize: '14px', marginBottom: '16px' }}>专业AI开发定制小程序APP</p>
          <button className="ant-btn ant-btn-primary" onClick={() => set关于打开(true)}>查看详情</button>
        </div>
      )
    }
  ]

  return (
    <div className="settings-page" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '24px' }}>设置</h1>
      <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #E8EBF0', marginBottom: '24px' }}>
        {标签项.map((标签) => (
          <button
            key={标签.key}
            className={`ant-btn ${标签.key === 'general' ? 'ant-btn-primary' : ''}`}
            onClick={() => alert(`切换到${标签.label}页面`)}
            style={{ 
              borderBottom: 标签.key === 'general' ? '2px solid #2B6CF6' : 'none',
              marginBottom: '-1px'
            }}
          >
            {标签.label}
          </button>
        ))}
      </div>
      {标签项.find(t => t.key === 'general')?.children}
      
      <AboutDialog 打开状态={关于打开} 关闭回调={() => set关于打开(false)} />
      <HelpManual 打开状态={帮助打开} 关闭回调={() => set帮助打开(false)} />
    </div>
  )
}

export default SettingsPage
