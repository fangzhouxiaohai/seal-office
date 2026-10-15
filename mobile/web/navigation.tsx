import { useEffect, useState } from 'react'
import { App, Button, Drawer } from 'antd'
import { useAppStore } from '../../renderer/src/store'
import { useCloud } from '../../renderer/src/cloud/CloudProvider'
import { useSettings } from '../../renderer/src/store/settingsStore'
import Icon from '../../renderer/src/components/Icon'
import { NAV_GROUPS } from '../../renderer/src/navConfig'
import { 通过对话框打开文件 } from '../../renderer/src/fileOpen'

export default function MobileNavigation() {
  const [open, setOpen] = useState(false), store = useAppStore(), cloud = useCloud(), settings = useSettings(), { message, modal } = App.useApp()
  const navigate = (key: string) => {
    store.goHome()
    store.handleNav(key, (text) => message.info(text))
    if (key === 'settings') store.showSettings()
    else if (key === 'help') store.showHelp()
    else if (key === 'pdf') store.setModule('pdf')
    setOpen(false)
  }
  useEffect(() => {
    const back = (event: Event) => {
      if (event.defaultPrevented) return
      if (open) { setOpen(false); return }
      const close = document.querySelector<HTMLButtonElement>('.ant-modal-wrap:not([style*="display: none"]) .ant-modal-close, .ant-drawer-open .ant-drawer-close, .ant-drawer-open .assistant-collapse')
      if (close) { close.click(); return }
      // 不可关闭的恢复密钥/保存对话框仍由用户完成，不跳转到底层首页。
      if (document.querySelector('.ant-modal-wrap:not([style*="display: none"]), .ant-drawer-open')) return
      // 先给当前模块处理内部层级，避免监听器注册顺序把子目录直接跳回首页。
      if (!window.dispatchEvent(new Event('seal-before-native-back', {cancelable:true}))) return
      store.goHome()
    }
    const persist = () => { void store.刷新工作状态备份().then((result) => { if (!result.成功) message.error(result.错误 || '保存工作区失败') }).catch((error) => message.error(error instanceof Error ? error.message : '保存工作区失败')) }
    window.addEventListener('seal-native-back', back); window.addEventListener('seal-persist-workspace', persist)
    let lastState = ''
    const report = () => {
      if (!window.sealNative) return
      const state = { action: 'state', token: window.sealNative.token, atHome: store.module === 'home' && store.navKey === 'home' && !open && !document.querySelector('.ant-modal-wrap:not([style*="display: none"]), .ant-drawer-open'), unsaved: store.workspaceTabs.filter((tab) => tab.dirty).length }
      const value = JSON.stringify(state)
      if (value !== lastState) { lastState = value; window.uni?.webView?.postMessage({ data: state }) }
    }
    const observer = new MutationObserver(report)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    report()
    return () => { observer.disconnect(); window.removeEventListener('seal-native-back', back); window.removeEventListener('seal-persist-workspace', persist) }
  }, [store, open, message])
  return <>
    <nav className="seal-mobile-nav" aria-label="移动工作台导航">
      <button aria-label="返回首页" aria-current={store.module === 'home' && !open ? 'page' : undefined} onClick={() => store.goHome()}><Icon name="home" size={23} variant="outline"/><span>首页</span></button>
      <button aria-label="打开文件" onClick={() => { void 通过对话框打开文件(message, modal, (类型, 内容, 路径, 警告, 页面设置, 文件指纹) => store.createDoc(类型, 内容, { 路径, 警告, 页面设置, 文件指纹 })) }}><Icon name="folder" size={23} variant="outline"/><span>文件</span></button>
      <button aria-label="打开智能助手" onClick={() => window.dispatchEvent(new Event('seal-open-assistant'))}><Icon name="ai" size={23} variant="outline"/><span>助手</span></button>
      <button aria-label="全部功能" aria-current={open ? 'page' : undefined} aria-expanded={open} onClick={() => setOpen(true)}><Icon name="grid" size={23} variant="outline"/><span>功能</span></button>
    </nav>
    <Drawer title="海豹办公" placement="bottom" height="80%" open={open} onClose={() => setOpen(false)} className="seal-mobile-functions">
      <div className="seal-mobile-create">
        {([{ key: 'word', label: '文字', icon: 'doc-word' }, { key: 'table', label: '表格', icon: 'doc-table' }, { key: 'ppt', label: '演示', icon: 'doc-ppt' }, { key: 'pdf', label: 'PDF', icon: 'doc-pdf' }] as const).map((item) => <Button key={item.key} data-document-type={item.key} onClick={() => { store.createDoc(item.key); setOpen(false) }}><Icon name={item.icon} size={36}/>{item.label}</Button>)}
      </div>
      <div className="seal-mobile-function-grid">{NAV_GROUPS.flat().filter((item) => item.implemented && !['desktop', 'download'].includes(item.key)).map((item) => <button key={item.key} data-nav-key={item.key} aria-current={store.navKey === item.key ? 'page' : undefined} onClick={() => navigate(item.key)}><Icon name={item.icon} size={32}/><span>{item.key === 'document' ? '应用文档空间' : item.label}</span></button>)}</div>
      <div className="seal-mobile-account"><Button onClick={() => { cloud.configure(); setOpen(false) }}>账号与云空间</Button><Button onClick={settings.切换主题}>切换{settings.主题 === '深色' ? '浅' : '深'}色</Button></div>
    </Drawer>
  </>
}
