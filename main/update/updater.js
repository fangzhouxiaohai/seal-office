// 版本更新服务（主进程）：查询云服务的最新发布；Windows 安装版下载安装包并核对 sha256 与字节数，
// 一致才启动安装程序并退出；商店版只打开微软商店。任何校验不一致都拒绝安装，不静默安装损坏包。
const fs = require('fs')
const path = require('path')
const { createHash, randomUUID } = require('crypto')

const 必要字段 = ['hasUpdate', 'version', 'mandatory', 'notes', 'url', 'sha256', 'bytes', 'publishedAt']
const 安装包上限 = 1024 * 1024 * 1024

/** 根据运行环境判定更新平台：商店版走微软商店，Ubuntu 与 macOS 领取各自安装包，便携版不自动安装。 */
function 判定更新平台({ platform = process.platform, windowsStore = Boolean(process.windowsStore), env = process.env } = {}) {
  if (platform === 'linux') return 'linux'
  if (platform === 'darwin') return 'macos'
  if (platform !== 'win32') return 'unsupported'
  if (windowsStore) return 'windows-store'
  if (env.PORTABLE_EXECUTABLE_DIR) return 'unsupported'
  return 'windows'
}

const 失败 = (消息, 附加 = {}) => Object.assign(new Error(消息), 附加)

function 创建更新服务({ 当前版本, 平台, 获取服务地址, 请求 = globalThis.fetch, 临时目录, 启动安装程序, 退出, 打开外部, 退出延迟 = 800, 超时 = 15000 }) {
  async function 检查(通道 = 'stable') {
    if (!['windows', 'windows-store', 'linux', 'macos'].includes(平台)) throw 失败('当前平台暂不支持在线更新', { code: 'UNSUPPORTED' })
    if (通道 !== 'stable' && 通道 !== 'beta') throw 失败('发布通道无效')
    const 地址 = `${String(获取服务地址()).replace(/\/$/, '')}/v1/updates/latest?platform=${encodeURIComponent(平台)}&version=${encodeURIComponent(当前版本)}&channel=${通道}`
    let 响应
    try { 响应 = await 请求(地址, { signal: AbortSignal.timeout(超时), headers: { Accept: 'application/json' } }) }
    catch (原因) { throw 失败('无法连接更新服务', { status: 0, cause: 原因 }) }
    if ([401, 403, 404].includes(响应.status)) throw 失败('更新服务尚未部署或配置不正确，请联系管理员完成后台部署后重试', { status: 响应.status })
    let 数据
    try { 数据 = await 响应.json() } catch { throw 失败('更新服务返回内容无效', { status: 响应.status }) }
    if (!响应.ok) throw 失败(数据?.error || '更新服务暂时不可用', { status: 响应.status })
    if (!数据 || typeof 数据.hasUpdate !== 'boolean') throw 失败('更新服务返回内容无效', { status: 响应.status })
    return Object.fromEntries(必要字段.filter(键 => 键 in 数据).map(键 => [键, 数据[键]]))
  }

  async function 下载并校验(发布) {
    let 网址
    try { 网址 = new URL(发布.url) } catch { throw 失败('安装包地址无效，已拒绝下载') }
    if (网址.protocol !== 'https:') throw 失败('安装包地址无效，已拒绝下载')
    if (typeof 发布.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(发布.sha256) || !Number.isSafeInteger(发布.bytes) || 发布.bytes <= 0 || 发布.bytes > 安装包上限) throw 失败('发布记录缺少安装包校验值，已拒绝安装')
    if (typeof 发布.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(发布.version)) throw 失败('发布版本号无效，已拒绝安装')
    const 目录 = path.join(临时目录, 'seal-office-update', randomUUID())
    fs.mkdirSync(目录, { recursive: true })
    const 文件 = path.join(目录, `seal-office-setup-${发布.version}.exe`)
    const 清理 = () => fs.rmSync(目录, { recursive: true, force: true })
    try {
      let 响应
      try { 响应 = await 请求(网址.toString(), { redirect: 'follow', signal: AbortSignal.timeout(30 * 60 * 1000) }) }
      catch (原因) { throw 失败('安装包下载失败，请检查网络后重试', { cause: 原因 }) }
      if (!响应.ok || !响应.body) throw 失败('安装包下载失败，请检查网络后重试')
      const 摘要 = createHash('sha256')
      const 句柄 = fs.openSync(文件, 'w', 0o600)
      let 大小 = 0
      try {
        for await (const 片段 of 响应.body) {
          大小 += 片段.length
          if (大小 > 发布.bytes) break
          摘要.update(片段)
          fs.writeSync(句柄, 片段)
        }
        fs.fsyncSync(句柄)
      } finally { fs.closeSync(句柄) }
      if (大小 !== 发布.bytes) throw 失败('安装包校验失败：文件大小与发布记录不一致，已拒绝安装')
      if (摘要.digest('hex') !== 发布.sha256.toLowerCase()) throw 失败('安装包校验失败：sha256 与发布记录不一致，已拒绝安装')
      return 文件
    } catch (错误) { 清理(); throw 错误 }
  }

  async function 安装(发布) {
    if (!发布 || typeof 发布 !== 'object') throw 失败('发布信息无效')
    if (平台 === 'linux' || 平台 === 'macos') {
      const 扩展名 = 平台 === 'macos' ? '.dmg' : '.deb'
      const 提示 = 平台 === 'macos' ? 'macOS 更新地址必须指向 DMG 安装包' : 'Ubuntu 更新地址必须指向 DEB 安装包'
      let 网址
      try { 网址 = new URL(发布.url) } catch { throw 失败(提示) }
      if (网址.protocol !== 'https:' || 网址.username || 网址.password || !网址.pathname.toLowerCase().endsWith(扩展名)) throw 失败(提示)
      await 打开外部(网址.toString())
      return { 已打开下载: true }
    }
    if (平台 === 'windows-store') {
      let 网址
      try { 网址 = new URL(发布.url) } catch { throw 失败('无法打开微软商店，请手动在商店中搜索海豹办公') }
      if (!['ms-windows-store:', 'https:'].includes(网址.protocol)) throw 失败('无法打开微软商店，请手动在商店中搜索海豹办公')
      await 打开外部(网址.toString())
      return { 已打开商店: true }
    }
    if (平台 !== 'windows') throw 失败('当前平台暂不支持在线更新', { code: 'UNSUPPORTED' })
    const 文件 = await 下载并校验(发布)
    await 启动安装程序(文件)
    // 留出时间把结果回传渲染端，再退出让安装程序覆盖文件
    setTimeout(() => 退出(), 退出延迟)
    return { 已启动安装: true }
  }

  return { 平台, 当前版本, 检查, 安装 }
}

module.exports = { 创建更新服务, 判定更新平台 }
