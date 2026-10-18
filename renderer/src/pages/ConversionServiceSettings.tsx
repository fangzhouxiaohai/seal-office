import { useEffect, useState } from 'react'
import { App, Button, Input } from 'antd'
type Configuration = { url: string; token?: string }
declare global {
  interface Window {
    sealDocumentConversion?: {
      get(): { url: string; hasToken: boolean }
      save(input: Configuration): Promise<void>
      clear(): Promise<void>
      test(input: Configuration): Promise<{ inputCount: number; maximumBytes: number }>
    }
  }
}
export default function ConversionServiceSettings() {
  const api = window.sealDocumentConversion
  const { message } = App.useApp()
  const [url, setUrl] = useState(''), [token, setToken] = useState(''), [hasToken, setHasToken] = useState(false)
  const [busy, setBusy] = useState(false), [readError, setReadError] = useState(false)
  useEffect(() => {
    if (!api) return
    try { const result = api.get(); setUrl(result.url); setHasToken(result.hasToken) }
    catch { setReadError(true); message.error('读取文档转换配置失败，请清除后重新配置') }
  }, [api, message])
  if (!api) return null
  const action = async (kind: 'save' | 'test' | 'clear') => {
    setBusy(true)
    try {
      if (kind === 'clear') { await api.clear(); setUrl(''); setToken(''); setHasToken(false); setReadError(false); message.success('文档转换配置已清除') }
      else if (kind === 'save') { await api.save({ url, token }); setToken(''); setHasToken(true); message.success('文档转换配置已加密保存') }
      else { const result = await api.test({ url, token }); message.success(`服务连接正常，支持 ${result.inputCount} 种文档输入，单文件上限 ${Math.floor(result.maximumBytes / 1024 / 1024)} MiB`) }
    } catch (error) { message.error(error instanceof Error ? error.message : '文档转换服务操作失败') }
    finally { setBusy(false) }
  }
  return <>
    <h2 className="settings-group__title">文档格式兼容</h2>
    <div className="settings-wps-card">
      <div className="settings-wps-row"><div className="settings-wps-row__text"><div className="settings-wps-row__title">自建文档转换服务</div><div className="settings-wps-row__desc">DOCX、XLSX、PPTX、CSV 等在本机处理。未设置自建服务时，联网转换使用当前已登录并开通云空间的账号；也可在下方配置自己的服务。每次发送正文前确认，来源文件保留。</div></div></div>
      <div className="settings-wps-row"><label htmlFor="seal-conversion-url">服务地址</label><Input id="seal-conversion-url" aria-label="文档转换服务地址" className="settings-wps-row__input" placeholder="https://office.example.com" value={url} disabled={busy || readError} onChange={event => setUrl(event.target.value)} /></div>
      <div className="settings-wps-row"><label htmlFor="seal-conversion-token">访问令牌</label><Input.Password id="seal-conversion-token" aria-label="文档转换访问令牌" className="settings-wps-row__input" placeholder={hasToken ? '已配置，留空不修改' : '填写自建服务的访问令牌'} value={token} autoComplete="off" disabled={busy || readError} onChange={event => setToken(event.target.value)} /></div>
      <div className="settings-wps-row" style={{ gap: 8, flexWrap: 'wrap' }}><Button type="primary" loading={busy} disabled={readError} onClick={() => void action('save')}>保存转换配置</Button><Button disabled={busy || readError || !url.trim()} onClick={() => void action('test')}>测试连接</Button><Button disabled={busy || (!hasToken && !readError)} onClick={() => void action('clear')}>清除配置</Button></div>
    </div>
  </>
}
