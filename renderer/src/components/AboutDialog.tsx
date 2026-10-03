// 关于对话框
import React from 'react'
import { Modal, Button } from 'antd'
import SealLogo from './SealLogo'

const AboutDialog = ({ 打开状态 = true, 关闭回调 }: {
  打开状态?: boolean
  关闭回调?: () => void
}) => {
  // 获取应用信息（从 electronAPI 或默认值）
  const 信息 = {
    名称: '海豹办公',
    英文名称: 'Seal Office',
    版本: __APP_VERSION__,
    作者: '饮风一笑',
    邮箱: '24519660@qq.com',
    说明: '本程序永久免费开源',
    开源地址: 'https://github.com/seal-office/seal-office',
    专业服务: '专业应用开发服务',
  }

  return React.createElement(Modal, {
    title: '关于海豹办公',
    open: 打开状态,
    onCancel: 关闭回调,
    onOk: 关闭回调,
    footer: [
      React.createElement(Button, { 
        key: 'close', 
        onClick: 关闭回调 
      }, '关闭')
    ],
    width: 500
  },
    React.createElement('div', { 
      style: { 
        textAlign: 'center', 
        padding: '20px 0' 
      }
    },
      // Logo 和名称
      React.createElement('div', { style: { marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' } },
        React.createElement(SealLogo, { size: 72, withBackground: false })
      ),
      
      React.createElement('h2', { 
        style: { 
          margin: '0 0 8px',
          fontSize: '24px'
        }
      }, 信息.名称),
      
      React.createElement('p', { 
        style: { 
          color: '#888',
          margin: '0 0 20px'
        }
      }, 信息.英文名称, ' v' + 信息.版本),

      // 详细信息
      React.createElement('div', { 
        style: { 
          background: '#F5F7FA',
          borderRadius: '8px',
          padding: '16px',
          textAlign: 'left',
          marginBottom: '20px'
        }
      },
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: '1px solid #E8EBF0'
          }
        },
          React.createElement('span', { style: { color: '#888' } }, '作者'),
          React.createElement('span', null, 信息.作者)
        ),
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: '1px solid #E8EBF0'
          }
        },
          React.createElement('span', { style: { color: '#888' } }, '邮箱'),
          React.createElement('a', { 
            href: 'mailto:' + 信息.邮箱,
            style: { color: '#2B6CF6' }
          }, 信息.邮箱)
        ),
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: '1px solid #E8EBF0'
          }
        },
          React.createElement('span', { style: { color: '#888' } }, '说明'),
          React.createElement('span', null, 信息.说明)
        ),
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: '1px solid #E8EBF0'
          }
        },
          React.createElement('span', { style: { color: '#888' } }, '开源地址'),
          React.createElement('a', { 
            href: 信息.开源地址,
            target: '_blank',
            rel: 'noopener noreferrer',
            style: { color: '#2B6CF6', wordBreak: 'break-all' }
          }, 信息.开源地址)
        ),
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between',
            padding: '8px 0'
          }
        },
          React.createElement('span', { style: { color: '#888' } }, '专业服务'),
          React.createElement('span', null, 信息.专业服务)
        )
      ),

      // 版权信息
      React.createElement('p', { 
        style: { 
          color: '#888',
          fontSize: '12px',
          margin: 0
        }
      }, '© 2026 饮风一笑。本程序永久免费开源。')
    )
  )
}

export default AboutDialog
