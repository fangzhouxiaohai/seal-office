// 弹窗视口校验夹具：使用应用真实全局样式渲染代表性弹窗，由 scripts/verify-dialog-viewport.cjs 在多种尺寸下测量。
import { createRoot } from 'react-dom/client'
import { App as AntdApp, Button, ConfigProvider, Drawer, Modal, Select } from 'antd'
import '../../renderer/src/styles.css'
import '../../renderer/src/styles/nativeControls.css'
import '../../renderer/src/styles/actionColors.css'
import '../../renderer/src/styles/flatDesktop.css'
import '../../main/ui/dialog.css'

const 长段落 = Array.from({ length: 60 }, (_, i) => <p key={i}>第 {i + 1} 段：账号与云空间、历史版本、导入导出与帮助手册等长内容需要在正文区滚动，标题和底部按钮始终可见。A long English sentence to check wrapping in narrow windows.</p>)
const 场景 = new URLSearchParams(location.search).get('case') || 'long'

function 夹具() {
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
