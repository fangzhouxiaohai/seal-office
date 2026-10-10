import { Buffer } from 'buffer'
import { Modal } from 'antd'
import { platformFetch } from './native'
const configurationPath = '/seal/private/document-conversion.secure'
const maximumBytes = 20 * 1024 * 1024
type Configuration = { url: string; token: string }
export function conversionUrl(value: string) {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('请填写有效的文档转换服务地址') }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('转换服务须使用 HTTPS，本机测试可使用 HTTP；地址不能包含用户名、密码或参数')
  return url.href.replace(/\/+$/, '')
}
const confirm = (title: string, content: string, okText: string) => new Promise<boolean>(resolve => {
  Modal.confirm({ title, content, okText, cancelText: '取消', maskClosable: false, onOk: () => { resolve(true) }, onCancel: () => { resolve(false) } })
})
export function installConversionService(core: any) {
  const { storage, vault } = core
  const read = (): Configuration | null => {
    if (!storage.existsSync(configurationPath)) return null
    const value = JSON.parse(vault.safeStorage.decryptString(storage.readFileSync(configurationPath)))
    return { url: conversionUrl(value.url), token: value.token }
  }
  const merged = (input: { url: string; token?: string }): Configuration => {
    const url = conversionUrl(input.url), previous = read(), token = input.token?.trim() || (previous?.url === url ? previous.token : '')
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('请输入此服务的访问令牌（至少 32 位）；更换服务地址时需重新填写令牌')
    return { url, token }
  }
  const request = async (configuration: Configuration, route: string, body?: unknown) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), body ? 110000 : 15000)
    try {
      const response = await platformFetch(configuration.url + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + configuration.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal })
      const size = Number(response.headers.get('Content-Length'))
      if (size > Math.ceil(maximumBytes / 3) * 4 + 4096) throw new Error('转换服务返回的文件超过手机处理上限')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '转换服务请求失败（' + response.status + '）')
      return result
    } catch (error) {
      if (controller.signal.aborted) throw new Error('转换服务响应超时，原文件未修改，请检查网络后重试')
      throw error
    } finally { clearTimeout(timer) }
  }
  const test = async (configuration: Configuration) => {
    const result = await request(configuration, '/v1/capabilities')
    if (result.protocol !== 'seal-office-converter/1' || !Array.isArray(result.inputs) || !Array.isArray(result.outputs)) throw new Error('地址不是兼容的海豹办公文档转换服务')
    return result
  }
  window.sealDocumentConversion = {
    get() { const configuration = read(); return { url: configuration?.url || '', hasToken: !!configuration?.token } },
    async save(input) { const configuration = merged(input); storage.writeFileSync(configurationPath, vault.safeStorage.encryptString(JSON.stringify(configuration))); await storage.flushStorage() },
    async clear() { storage.rmSync(configurationPath, { force: true }); await storage.flushStorage() },
    async test(input) { const result = await test(merged(input)); return { inputCount: result.inputs.length, maximumBytes: result.maximumBytes } },
  }
  core.conversion.configureConversion({
    confirmLocal: (extension: string) => confirm('保存兼容表格', extension.toUpperCase() + ' 的手机离线输出主要保留数据和公式，高级样式、图表、图片等可能无法完整保留。请核对后保存副本；需要完整格式时使用 XLSX。', '继续保存'),
    remote: async (bytes: Uint8Array, inputFormat: string, outputFormat: string, type: string) => {
      const configuration = read()
      if (!configuration) throw new Error('此格式需要文档转换服务，请在设置中心填写自建服务地址和访问令牌；常用 DOCX、XLSX、PPTX 等可离线使用')
      if (bytes.length > maximumBytes) throw new Error('联网兼容转换最多支持 20 MiB；来源文件保持不变，可在电脑版处理大文件')
      if (!await confirm('使用文档转换服务', `将此文档发送至 ${configuration.url}，从 ${inputFormat.toUpperCase()} 转换为 ${outputFormat.toUpperCase()}。服务需要读取文档正文；请确认这是你信任的自建服务。转换完成后服务删除临时文件。`, '同意并转换')) throw new Error('已取消文档转换，原文件未修改')
      const capabilities = await test(configuration)
      if (!capabilities.inputs.includes(inputFormat) || !capabilities.outputs.includes(outputFormat)) throw new Error('此转换服务未支持所需格式，请更新自建服务')
      const result = await request(configuration, '/v1/convert', { inputFormat, outputFormat, type, data: Buffer.from(bytes).toString('base64') })
      if (result.outputFormat !== outputFormat || typeof result.data !== 'string' || result.data.length > Math.ceil(maximumBytes / 3) * 4) throw new Error('转换服务返回的文档格式无效')
      const output = Buffer.from(result.data, 'base64')
      if (!output.length || output.length > maximumBytes || output.toString('base64') !== result.data) throw new Error('转换结果数据无效或超过处理上限')
      return output
    },
  })
}
