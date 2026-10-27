import { useEffect, useRef } from 'react'
import { App } from 'antd'
import { useAppStore } from '../../renderer/src/store'
import Icon from '../../renderer/src/components/Icon'
import { mobileSection } from './home'

export default function MobileNavigation() {
  const store = useAppStore(), { message } = App.useApp()
  const route = { module: store.module, navKey: store.navKey, tab: store.activeWorkspaceTabId }
  const routes = useRef([route]), restoring = useRef(false)
  useEffect(() => {
    if (restoring.current) { restoring.current = false; return }
    if (route.module === 'home' && route.navKey === 'home') { routes.current = [route]; return }
    const previous = routes.current[routes.current.length - 1]
    if (JSON.stringify(previous) !== JSON.stringify(route)) routes.current.push(route)
  }, [route.module, route.navKey, route.tab])
  const navigate = (key: string) => {
    store.goHome()
    store.setNavKey(key)
  }
  useEffect(() => {
    const send = (action: string) => window.uni?.webView?.postMessage({ data: { action, token: window.sealNative?.token } })
    const visible = (node: Element) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none' && !node.querySelector('.ant-zoom-leave,.ant-fade-leave')
    const back = (event: Event) => {
      if (event.defaultPrevented) return
      event.preventDefault()
      const overlays = [...document.querySelectorAll('.ant-modal-wrap,.ant-drawer-open')].filter(visible)
      const top = overlays[overlays.length - 1]
      if (top) {
        const close = top.querySelector<HTMLButtonElement>('.ant-modal-close,.ant-drawer-close,.assistant-collapse,.ant-modal-confirm-btns button:not(:disabled):not(.ant-btn-dangerous)')
        if (close) close.click()
        return
      }
      // 不可关闭的恢复密钥/保存对话框仍由用户完成，不跳转到底层首页。
      // 先给当前模块处理内部层级，避免监听器注册顺序把子目录直接跳回首页。
      if (!window.dispatchEvent(new Event('seal-before-native-back', {cancelable:true}))) return
      if (store.module === 'home' && store.navKey === 'home') {
        void store.刷新工作状态备份().then(result => { if (result.成功) send('back-root'); else message.error(result.错误 || '保存工作区失败，请重试') }).catch(() => message.error('保存工作区失败，请重试'))
        return
      }
      routes.current.pop()
      const previous = routes.current[routes.current.length - 1]
      restoring.current = true
      if (previous?.tab && previous.module !== 'home' && store.workspaceTabs.some(tab => tab.id === previous.tab)) store.selectWorkspaceTab(previous.tab)
      else store.setModule(previous?.module ?? 'home')
      store.setNavKey(previous?.navKey ?? 'home')
    }
    const persist = () => { void store.刷新工作状态备份().then((result) => { if (!result.成功) message.error(result.错误 || '保存工作区失败') }).catch((error) => message.error(error instanceof Error ? error.message : '保存工作区失败')) }
    const healthy = () => send('healthy')
    window.addEventListener('seal-native-back', back); window.addEventListener('seal-persist-workspace', persist); window.addEventListener('seal-native-probe', healthy)
    let lastState = ''
    const report = () => {
      if (!window.sealNative) return
      const state = { action: 'state', token: window.sealNative.token, atHome: store.module === 'home' && store.navKey === 'home' && !document.querySelector('.ant-modal-wrap:not([style*="display: none"]), .ant-drawer-open'), unsaved: store.workspaceTabs.filter((tab) => tab.dirty).length }
      const value = JSON.stringify(state)
      if (value !== lastState) { lastState = value; window.uni?.webView?.postMessage({ data: state }) }
    }
    const observer = new MutationObserver(report)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    report()
    return () => { observer.disconnect(); window.removeEventListener('seal-native-back', back); window.removeEventListener('seal-persist-workspace', persist); window.removeEventListener('seal-native-probe', healthy) }
  }, [store, message])
  return <>
    <nav className="seal-mobile-nav" aria-label="移动工作台导航">
      {[{key:'home',section:'home',label:'首页',icon:'home'},{key:'my-cloud',section:'cloud',label:'云盘',icon:'folder'},{key:'apps',section:'services',label:'服务',icon:'grid'},{key:'market',section:'templates',label:'模板',icon:'page-view'},{key:'mobile-profile',section:'mine',label:'我的',icon:'users'}].map(item=><button key={item.key} aria-label={item.label==='首页'?'返回首页':item.label} aria-current={store.module==='home'&&mobileSection(store.navKey)===item.section?'page':undefined} onClick={()=>navigate(item.key)}><Icon name={item.icon} size={23} variant="outline"/><span>{item.label}</span></button>)}
    </nav>
  </>
}
