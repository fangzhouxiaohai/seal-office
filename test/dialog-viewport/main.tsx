// 弹窗视口校验夹具：使用应用真实全局样式渲染代表性弹窗，由 scripts/verify-dialog-viewport.cjs 在多种尺寸下测量。
import { createRoot } from 'react-dom/client'
import { App as AntdApp, Button, ConfigProvider, Drawer, Modal, Select } from 'antd'
import '../../renderer/src/styles.css'
import '../../renderer/src/styles/nativeControls.css'
import '../../renderer/src/styles/actionColors.css'
import '../../renderer/src/styles/flatDesktop.css'
import '../../main/ui/dialog.css'

import { useEffect } from 'react'
import '../../renderer/src/cloud/cloud.css'
import { CloudProvider, useCloud } from '../../renderer/src/cloud/CloudProvider'

// 账号与云空间面板（2.8.0 方案 A）：模拟已登录且已开通云空间的账号，?expand=1 展开改密与注销表单
const 账号 = { id: 'demo', phone: '13812345678', enabled: true, autosave: false, used: 105_300_000, quota: 300_000_000, hasPassword: true, keyRevision: 1 }
;(window as any).electronAPI = { cloud: { invoke: async (action: string) => ({ 成功: true, 数据: action === 'status' || action === 'refresh' ? { account: 账号, unlocked: true, statuses: {}, pending: 0 } : {} }) } }
function 打开账号面板() {
  const cloud = useCloud()
  useEffect(() => {
    const timer = setTimeout(() => {
      cloud.configure()
      if (new URLSearchParams(location.search).get('expand')) setTimeout(() => {
        for (const 名称 of ['修改登录密码', '注销账号']) Array.from(document.querySelectorAll('button')).find(按钮 => 按钮.textContent?.trim() === 名称)?.click()
      }, 300)
    }, 300)
    return () => clearTimeout(timer)
  }, [])
  return null
}

const 长段落 = Array.from({ length: 60 }, (_, i) => <p key={i}>第 {i + 1} 段：账号与云空间、历史版本、导入导出与帮助手册等长内容需要在正文区滚动，标题和底部按钮始终可见。A long English sentence to check wrapping in narrow windows.</p>)
const 场景 = new URLSearchParams(location.search).get('case') || 'long'

function 夹具() {
  if (场景 === 'account') return <CloudProvider><打开账号面板 /></CloudProvider>
  if (场景 === 'drawer') return <Drawer open width={720} title="宽抽屉">{长段落}</Drawer>
  if (场景 === 'confirm') {
    Modal.confirm({ title: '确认删除这些文件？', content: <div>{长段落}</div>, okText: '删除', cancelText: '取消', className: 'viewport-case' })
    return null
  }
  const 宽度 = 场景 === 'wide' ? 1050 : 场景 === 'preview' ? 'min(1100px, 96vw)' : 520
  return <Modal open centered={场景 !== 'top'} width={宽度} title={'代表性弹窗：' + 场景 + '，标题很长很长很长很长很长很长很长很长'} okText="使用并编辑副本" cancelText="取消"
    footer={场景 === 'many' ? [<Button key="a">下载文件</Button>, <Button key="b">用海豹办公打开</Button>, <Button key="c">打印</Button>, <Button key="d" type="primary">关闭</Button>] : undefined}>
    {场景 === 'select' ? <Select open style={{ width: 240 }} options={Array.from({ length: 30 }, (_, i) => ({ value: i, label: '选项 ' + i }))} /> : null}
    {场景 === 'wide' ? <div style={{ width: 980, height: 600, background: '#eef' }}>固定宽度画布</div> : 长段落}
  </Modal>
}

createRoot(document.getElementById('root')!).render(<ConfigProvider><AntdApp><夹具 /></AntdApp></ConfigProvider>)
