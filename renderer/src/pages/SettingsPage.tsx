// 设置页面
import React, { useState } from 'react'
import { useSettings } from '../store/settingsStore'
import AboutDialog from '../components/AboutDialog'
import DefaultAppSetter from '../components/DefaultAppSetter'
import HelpManual from '../components/HelpManual'
import { Tabs, Card, Switch, List, Avatar } from 'antd'

const SettingsPage = () => {
  const { 主题, 切换主题 } = useSettings()
  const [关于打开, set关于打开] = useState(false)
  const [帮助打开, set帮助打开] = useState(false)

  const 标签项 = [
    {
      key: 'general',
      label: '常规设置',
      children: React.createElement(Card, { 
        style: { marginBottom: '16px' }
      },
        React.createElement('h3', { style: { marginTop: 0 } }, '界面设置'),
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '12px 0'
          }
        },
          React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 'bold', marginBottom: '4px' } }, '深浅模式'),
            React.createElement('div', { style: { color: '#888', fontSize: '12px' } }, '切换浅色/深色主题')
          ),
          React.createElement(Switch, {
            checked: 主题 === '深色',
            onChange: 切换主题,
            checkedChildren: 主题 === '深色' ? '深色' : '浅色'
          })
        )
      ),
      React.createElement(Card, null,
        React.createElement('h3', { style: { marginTop: 0 } }, '语言设置'),
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '12px 0'
          }
        },
          React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 'bold', marginBottom: '4px' } }, '界面语言'),
            React.createElement('div', { style: { color: '#888', fontSize: '12px' } }, '当前仅支持中文')
          ),
          React.createElement('span', { style: { color: '#888' } }, '简体中文')
        )
      )
    },
    {
      key: 'system',
      label: '系统设置',
      children: React.createElement(DefaultAppSetter, null)
    },
    {
      key: 'help',
      label: '帮助与支持',
      children: React.createElement(Card, null,
        React.createElement('h3', { style: { marginTop: 0 } }, '帮助资源'),
        React.createElement(List, {
          dataSource: [
            { 标题: '使用手册', 描述: '查看详细的功能说明和操作指南', 操作: () => set帮助打开(true) },
            { 标题: '常见问题', 描述: '查看常见问题的解答', 操作: () => set帮助打开(true) },
            { 标题: '反馈建议', 描述: '向我们反馈使用体验', 操作: () => alert('感谢反馈！请发送邮件至 24519660@qq.com') },
            { 标题: '关于海豹办公', 描述: '查看版本信息和开源许可', 操作: () => set关于打开(true) }
          ],
          renderItem: (项: any) =>
            React.createElement(List.Item, {
              actions: [
                React.createElement('button', {
                  key: 'action',
                  onClick: 项.操作,
                  className: 'ant-btn ant-btn-primary ant-btn-sm'
                }, '查看')
              ],
              style: { cursor: 'pointer' }
            },
              React.createElement(List.Item.Meta, {
                title: 项.标题,
                description: 项.描述
              })
            )
        })
      )
    },
    {
      key: 'about',
      label: '关于',
      children: React.createElement('div', { 
        style: { 
          textAlign: 'center', 
          padding: '40px 20px' 
        }
      },
        React.createElement('div', { 
          style: { 
            fontSize: '64px',
            marginBottom: '16px'
          }
        }, '🐉'),
        
        React.createElement('h2', null, '海豹办公 Seal Office'),
        React.createElement('p', { style: { color: '#888', marginBottom: '24px' } }, '版本 1.1.0'),

        React.createElement(Card, { 
          style: { 
            maxWidth: '400px', 
            margin: '0 auto', 
            textAlign: 'left',
            marginBottom: '24px'
          }
        },
          React.createElement('div', { style: { padding: '8px 0', borderBottom: '1px solid #E8EBF0' } },
            React.createElement('span', { style: { color: '#888', marginRight: '16px' } }, '作者：'),
            React.createElement('strong', null, '饮风一笑')
          ),
          React.createElement('div', { style: { padding: '8px 0', borderBottom: '1px solid #E8EBF0' } },
            React.createElement('span', { style: { color: '#888', marginRight: '16px' } }, '邮箱：'),
            React.createElement('a', { href: 'mailto:24519660@qq.com' }, '24519660@qq.com')
          ),
          React.createElement('div', { style: { padding: '8px 0', borderBottom: '1px solid #E8EBF0' } },
            React.createElement('span', { style: { color: '#888', marginRight: '16px' } }, '说明：'),
            React.createElement('strong', null, '本程序永久免费开源')
          ),
          React.createElement('div', { style: { padding: '8px 0' } },
            React.createElement('span', { style: { color: '#888', marginRight: '16px' } }, '开源地址：'),
            React.createElement('a', { 
              href: 'https://github.com/seal-office/seal-office',
              target: '_blank'
            }, 'GitHub')
          )
        ),

        React.createElement('p', { 
          style: { 
            color: '#888',
            fontSize: '14px',
            marginBottom: '16px'
          }
        }, '专业AI开发定制小程序APP'),

        React.createElement('button', {
          onClick: () => set关于打开(true),
          className: 'ant-btn ant-btn-primary'
        }, '查看详情')
      )
    }
  ]

  return React.createElement('div', { 
    className: 'settings-page',
    style: { 
      padding: '20px',
      maxWidth: '800px',
      margin: '0 auto'
    }
  },
    React.createElement('h1', { style: { marginBottom: '24px' } }, '设置'),
    React.createElement(Tabs, { 
      tabs: 标签项, 
      type: 'card',
      size: 'large'
    }),

    // 关于对话框
    React.createElement(AboutDialog, {
      打开状态: 关于打开,
      关闭回调: () => set关于打开(false)
    }),

    // 帮助手册对话框
    React.createElement(HelpManual, {
      打开状态: 帮助打开,
      关闭回调: () => set帮助打开(false)
    })
  )
}

export default SettingsPage
