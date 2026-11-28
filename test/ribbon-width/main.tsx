// 功能区宽度校验夹具（2.8.1 第九节）：用真实 RibbonPanel、真实标签声明与真实全局样式渲染功能区，
// 由 scripts/verify-ribbon-width.cjs 在多种窗口内容宽度下测量字号输入框、字体颜色按钮与横向滚动。
// ?tabs=sheet|doc|ppt 选择表格、文字或演示功能区；?tab= 指定标签键；?lang=en-US 切换英文界面。
import { createRoot } from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import '../../renderer/src/styles.css'
import '../../renderer/src/styles/nativeControls.css'
import '../../renderer/src/styles/actionColors.css'
import '../../renderer/src/styles/flatDesktop.css'
import '../../renderer/src/sheet/sheetFeatures.css'
import RibbonPanel from '../../renderer/src/editor/ribbon/RibbonPanel'
import { RIBBON_TABS } from '../../renderer/src/editor/ribbon/tabSpecs'
import { 表格标签 } from '../../renderer/src/sheet/ribbonSpecs'
import { 演示标签 } from '../../renderer/src/ppt/ribbonSpecs'
import { SettingsProvider } from '../../renderer/src/store/settingsStore'
import { InterfaceLanguageAdapter } from '../../renderer/src/i18n/interfaceLanguage'

const 参数 = new URLSearchParams(location.search)
const 标签组 = { sheet: 表格标签, doc: RIBBON_TABS, ppt: 演示标签 }[参数.get('tabs') || 'sheet'] || 表格标签
try { localStorage.setItem('seal-language', 参数.get('lang') === 'en-US' ? 'en-US' : 'zh-CN') } catch { /* 夹具在无存储环境仍以中文渲染 */ }
const 当前 = 参数.get('tab') || 标签组[0].key
const 值 = (命令: string) => ({ 'cell.fontSize': '11', 'cell.fontColor': '#d32f2f', 'cell.fill': '#fff4bc' } as Record<string, string>)[命令]

createRoot(document.getElementById('root')!).render(<ConfigProvider><AntdApp><SettingsProvider>
  <InterfaceLanguageAdapter />
  <div className="wps-app" data-ribbon-ready="true">
    <RibbonPanel activeKey={当前} tabs={标签组} 获取当前值={值} />
  </div>
</SettingsProvider></AntdApp></ConfigProvider>)
