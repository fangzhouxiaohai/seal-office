// 云空间拖动实窗夹具（2.8.1 第一、四节）：按首页布局把真实 CloudFilesPage 放进带容器查询的 .wps-main，
// 左侧导航与顶栏占位复现截图中的容器偏移；云端接口为本地内存实现，只使用本夹具创建的六项数据。
// 由 scripts/verify-cloud-drag-electron.cjs 在 Electron 实窗中用真实指针事件拖动并测量。
import { createRoot } from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import '../../renderer/src/styles.css'
import '../../renderer/src/styles/nativeControls.css'
import '../../renderer/src/styles/actionColors.css'
import '../../renderer/src/styles/flatDesktop.css'
import '../../main/ui/dialog.css'
import '../../renderer/src/cloud/cloud.css'
import { SettingsProvider } from '../../renderer/src/store/settingsStore'
import { AppProvider } from '../../renderer/src/store'
import { CloudProvider } from '../../renderer/src/cloud/CloudProvider'
import CloudFilesPage from '../../renderer/src/cloud/CloudFilesPage'

const 参数 = new URLSearchParams(location.search)
const 数量 = Number(参数.get('items') || 6)
const 账号 = { id: 'drag-demo', phone: '13800000000', enabled: true, autosave: false, used: 1_000_000, quota: 300_000_000, hasPassword: true, keyRevision: 1 }
const 文件夹 = ['项目资料', '合同归档', '会议纪要', '设计稿', '财务报表']
const 节点 = [
  ...文件夹.map((名称, 序号) => ({ id: `folder-${序号}`, parent: null, kind: 'folder', deleted: 0, version: 0, updated: 1_700_000_000_000 + 序号, meta: { name: 名称 } })),
  ...Array.from({ length: Math.max(1, 数量 - 文件夹.length) }, (_, 序号) => ({ id: `doc-${序号}`, parent: null, kind: 'file', deleted: 0, version: 1, updated: 1_600_000_000_000 - 序号, bytes: 2048, meta: { name: 序号 ? `季度工作汇报 ${序号 + 1}.docx` : '二〇二六年第四季度部门工作汇报与预算执行情况说明.docx', filename: '汇报.docx' } })),
]
const 移动记录: unknown[] = []
;(window as any).__cloudDrag = { 移动记录, 节点 }
;(window as any).electronAPI = {
  // 工作区备份为空：夹具不恢复上次工作区，避免恢复提示遮住页面
  backupLoad: async () => ({ 成功: true, 内容: null }), backupSave: async () => ({ 成功: true }), backupClear: async () => ({ 成功: true }), backupPreserve: async () => ({ 成功: true }),
  cloud: { invoke: async (action: string, input: any) => {
  if (action === 'status' || action === 'refresh') return { 成功: true, 数据: { account: 账号, unlocked: true, statuses: {}, pending: 0 } }
  if (action === 'list') return { 成功: true, 数据: 节点.map(n => ({ ...n })) }
  if (action === 'pending') return { 成功: true, 数据: [] }
  if (action === 'move') { 移动记录.push(input); for (const id of input.ids) { const n = 节点.find(x => x.id === id); if (n) (n as any).parent = input.parent } return { 成功: true, 数据: {} } }
  return { 成功: true, 数据: {} }
} } }
try { localStorage.setItem('seal-cloud-view', 参数.get('view') === 'list' ? 'list' : 'grid') } catch { /* 视图偏好不影响校验 */ }

// 与应用外壳一致：左侧导航 332、顶栏 68，中间为带容器查询的 .wps-main
createRoot(document.getElementById('root')!).render(<ConfigProvider><AntdApp><SettingsProvider><AppProvider><CloudProvider>
  <div className="wps-app" style={{ display: 'flex', flexDirection: 'row', height: '100vh', overflow: 'hidden' }}>
    <aside data-test="sidebar" style={{ flex: '0 0 332px', overflowY: 'auto', background: '#f5f6fa' }} />
    <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div data-test="titlebar" style={{ flex: '0 0 68px' }} />
      <main className="wps-main" style={{ flex: '1 1 auto', minHeight: 0 }}><CloudFilesPage /></main>
    </div>
  </div>
</CloudProvider></AppProvider></SettingsProvider></AntdApp></ConfigProvider>)
