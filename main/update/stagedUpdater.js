// 更新包暂存服务：仅接收与后台记录一致的发布，不允许渲染端传入本地安装路径。
const fs = require('fs')
const path = require('path')
const { createHash, randomUUID } = require('crypto')

const 上限 = 1024 * 1024 * 1024
const 扩展 = { windows: '.exe', linux: '.deb', macos: '.dmg' }
const 错误 = 文案 => new Error(文案)

function 创建暂存更新({ 平台, 当前版本, 目录, 检查, 请求 = globalThis.fetch, 打开安装包, 通知 = () => {}, 下载超时 = 30 * 60 * 1000 }) {
  const 数据 = path.join(目录, 'pending.json')
  const 交付记录 = path.join(目录, 'handed-off.json')
  let 控制器 = null, 进行 = null, 安装进行 = false, 当前 = { 阶段: '空闲', 已下载: 0, 总大小: 0 }
  const 变更 = 值 => { 当前 = { ...当前, ...值 }; 通知({ ...当前 }) }
  const 限定 = 名称 => typeof 名称 === 'string' && /^package-[0-9a-f-]{36}\.(exe|deb|dmg)$/.test(名称) && 名称.endsWith(扩展[平台] || '!')
  function 读取交付() {
    let rows
    try { rows = JSON.parse(fs.readFileSync(交付记录, 'utf8')) }
    catch (e) { if (e.code === 'ENOENT') return []; throw 错误('无法读取安装器文件记录') }
    if (!Array.isArray(rows) || rows.some(x => !x || !限定(x.文件) || typeof x.版本 !== 'string')) throw 错误('安装器文件记录无效')
    return rows
  }
  function 保存交付(rows) {
    const 临时 = path.join(目录, `handoff-${randomUUID()}.tmp`)
    try { fs.writeFileSync(临时, JSON.stringify(rows), { flag:'wx', mode:0o600 }); fs.renameSync(临时, 交付记录) }
    catch (e) { fs.rmSync(临时, { force:true }); throw e }
  }
  function 清理已安装() {
    if (!当前版本) return
    const rows = 读取交付(), 已安装 = rows.filter(x => x.版本 === 当前版本)
    if (!已安装.length) return
    for (const row of 已安装) fs.rmSync(path.join(目录, row.文件), { force:true })
    保存交付(rows.filter(x => x.版本 !== 当前版本))
  }
  const 比对 = (a, b) => Boolean(a?.hasUpdate && b && a.version === b.version && a.url === b.url && a.sha256?.toLowerCase() === b.sha256?.toLowerCase() && a.bytes === b.bytes)
  function 验证发布(p) {
    let u
    try { u = new URL(p.url) } catch { throw 错误('安装包地址无效') }
    if (u.protocol !== 'https:' || u.username || u.password || !扩展[平台]) throw 错误('安装包地址无效')
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(p.version || '') || !/^[a-f0-9]{64}$/i.test(p.sha256 || '') || !Number.isSafeInteger(p.bytes) || p.bytes <= 0 || p.bytes > 上限) throw 错误('发布记录缺少有效校验信息')
  }
  async function 确认(p, 通道, 信号) {
    验证发布(p)
    let 监听
    const 取消 = 信号 && new Promise((_, reject) => {
      监听 = () => reject(错误('下载已取消'))
      if (信号.aborted) 监听(); else 信号.addEventListener('abort', 监听, { once:true })
    })
    let 最新
    try { 最新 = await (信号 ? Promise.race([检查(通道, 信号), 取消]) : 检查(通道)) }
    finally { if (监听) 信号.removeEventListener('abort', 监听) }
    if (!比对(最新, p)) throw 错误('发布信息已变化，请重新检查更新')
  }
  function 读取() {
    let p
    try { p = JSON.parse(fs.readFileSync(数据, 'utf8')) } catch (e) { if (e.code === 'ENOENT') return null; throw 错误('暂存更新记录无效') }
    if (!p || !限定(p.文件) || !['stable','beta'].includes(p.通道) || typeof p.任务标识 !== 'string') throw 错误('暂存更新记录无效')
    验证发布(p.发布)
    return p
  }
  async function 校验(p) {
    const 文件 = path.join(目录, p.文件)
    let 属性
    try { 属性 = fs.lstatSync(文件) } catch { throw 错误('暂存安装包不存在，请重新下载') }
    if (!属性.isFile() || 属性.isSymbolicLink() || 属性.size !== p.发布.bytes) throw 错误('安装包校验失败，请重新下载')
    const hash = createHash('sha256')
    for await (const 块 of fs.createReadStream(文件)) hash.update(块)
    if (hash.digest('hex') !== p.发布.sha256.toLowerCase()) throw 错误('安装包校验失败，请重新下载')
    return 文件
  }
  async function 状态() {
    if (平台 === 'windows' && 当前.阶段 === '安装中') {
      let 结果
      try { 结果 = JSON.parse(fs.readFileSync(path.join(目录, 'install-result.json'), 'utf8')) }
      catch (e) { if (e.code !== 'ENOENT') throw 错误('无法读取安装执行结果') }
      if (结果?.任务标识 === 当前.任务标识 && 结果.成功 === false) 变更({ 阶段:'失败', 错误:String(结果.错误 || '启动安装程序失败').slice(0,200) })
    }
    if (进行 || 当前.阶段 !== '空闲') return { ...当前 }
    清理已安装()
    const p = 读取()
    if (!p) return { ...当前 }
    if (当前版本 && p.发布.version === 当前版本) {
      fs.rmSync(path.join(目录, p.文件), { force:true })
      fs.rmSync(数据, { force:true })
      fs.rmSync(path.join(目录, 'install-result.json'), { force:true })
      return { ...当前 }
    }
    await 校验(p)
    let 结果
    try { 结果 = JSON.parse(fs.readFileSync(path.join(目录, 'install-result.json'), 'utf8')) }
    catch (e) { if (e.code !== 'ENOENT') throw 错误('无法读取安装执行结果') }
    if (结果?.任务标识 === p.任务标识 && 结果.成功 === false) {
      当前 = { 阶段:'失败', 已下载:p.发布.bytes, 总大小:p.发布.bytes, 版本:p.发布.version, 任务标识:p.任务标识, 错误:String(结果.错误 || '启动安装程序失败').slice(0,200) }
      return { ...当前 }
    }
    当前 = { 阶段: '已就绪', 已下载: p.发布.bytes, 总大小: p.发布.bytes, 版本: p.发布.version, 任务标识: p.任务标识 }
    return { ...当前 }
  }
  async function 取响应(url, signal) {
    for (let i = 0; i < 6; i++) {
      const u = new URL(url)
      if (u.protocol !== 'https:' || u.username || u.password) throw 错误('安装包地址无效')
      const r = await 请求(u.toString(), { signal, redirect: 'manual' })
      if (![301,302,303,307,308].includes(r.status)) return r
      const location = r.headers.get('location')
      if (!location) throw 错误('安装包下载地址无效')
      url = new URL(location, u).toString()
    }
    throw 错误('安装包下载跳转次数过多')
  }
  async function 下载(发布) {
    if (安装进行 || (平台 === 'windows' && 当前.阶段 === '安装中')) throw 错误('更新正在安装')
    if (进行) throw 错误('已有更新正在下载')
    if (!发布 || typeof 发布 !== 'object' || Array.isArray(发布)) throw 错误('发布信息无效')
    const id = randomUUID(), controller = new AbortController()
    let 已超时 = false
    const 计时器 = setTimeout(() => { 已超时 = true; controller.abort() }, 下载超时)
    控制器 = controller
    let 结束
    进行 = new Promise(resolve => { 结束 = resolve })
    const 通道 = 发布.channel ?? 'stable'
    let 临时
    当前 = { 阶段:'下载中', 已下载:0, 总大小:Number.isSafeInteger(发布.bytes) ? 发布.bytes : 0, 版本:发布.version, 任务标识:id }
    通知({ ...当前 })
    try {
      if (!['stable','beta'].includes(通道)) throw 错误('发布通道无效')
      // 新任务替代旧待安装任务，避免取消或失败后重启又出现旧版本。
      const 原待安装 = 读取()
      if (原待安装) {
        fs.rmSync(数据, { force:true })
        if (!读取交付().some(x => x.文件 === 原待安装.文件)) fs.rmSync(path.join(目录, 原待安装.文件), { force:true })
        fs.rmSync(path.join(目录, 'install-result.json'), { force:true })
      }
      await 确认(发布, 通道, controller.signal)
      if (controller.signal.aborted) throw 错误('下载已取消')
      fs.mkdirSync(目录, { recursive:true, mode:0o700 })
      const 文件名 = `package-${id}${扩展[平台]}`
      临时 = path.join(目录, 文件名 + '.part')
      const r = await 取响应(发布.url, controller.signal)
      if (!r.ok || !r.body) throw 错误('安装包下载失败，请检查网络后重试')
      const hash = createHash('sha256'), fd = fs.openSync(临时, 'wx', 0o600)
      let 已下载 = 0
      try {
        for await (const 块 of r.body) {
          if (controller.signal.aborted) throw 错误('下载已取消')
          已下载 += 块.length
          if (已下载 > 发布.bytes) throw 错误('安装包校验失败：文件大小不一致')
          hash.update(块)
          let 偏移 = 0
          while (偏移 < 块.length) 偏移 += fs.writeSync(fd, 块, 偏移, 块.length - 偏移)
          变更({ 已下载 })
        }
        fs.fsyncSync(fd)
      } finally { fs.closeSync(fd) }
      if (controller.signal.aborted) throw 错误('下载已取消')
      变更({ 阶段:'校验中' })
      if (已下载 !== 发布.bytes || hash.digest('hex') !== 发布.sha256.toLowerCase()) throw 错误('安装包校验失败，请重新下载')
      const 原记录 = 读取()
      fs.renameSync(临时, path.join(目录, 文件名)); 临时 = null
      const 元数据 = { 文件:文件名, 发布:{ version:发布.version, url:发布.url, sha256:发布.sha256, bytes:发布.bytes }, 通道, 任务标识:id }
      const 元临时 = path.join(目录, `pending-${id}.tmp`)
      try { fs.writeFileSync(元临时, JSON.stringify(元数据), { mode:0o600, flag:'wx' }); fs.renameSync(元临时, 数据) }
      catch (e) { fs.rmSync(元临时, { force:true }); fs.rmSync(path.join(目录, 文件名), { force:true }); throw e }
      if (原记录 && 原记录.文件 !== 文件名) fs.rmSync(path.join(目录, 原记录.文件), { force:true })
      变更({ 阶段:'已就绪' })
      return { ...当前 }
    } catch (e) {
      if (临时) fs.rmSync(临时, { force:true })
      const message = 已超时 ? '安装包下载超时，请检查网络后重试' : controller.signal.aborted ? '下载已取消' : (e.message || '下载失败')
      变更({ 阶段: controller.signal.aborted && !已超时 ? '已取消' : '失败', 错误:message })
      throw 错误(message)
    } finally { clearTimeout(计时器); 控制器 = null; 进行 = null; 结束() }
  }
  async function 取消() { if (控制器) { 控制器.abort(); await 进行 } return { ...当前 } }
  async function 安装() {
    if (安装进行 || (平台 === 'windows' && 当前.阶段 === '安装中')) throw 错误('更新正在安装')
    if (进行) throw 错误('更新正在下载')
    安装进行 = true
    try {
      const p = 读取()
      if (!p) throw 错误('没有已下载的安装包')
      await 确认(p.发布, p.通道)
      const 文件 = await 校验(p)
      const 交付 = 读取交付()
      if (!交付.some(x => x.文件 === p.文件)) 保存交付([...交付, { 文件:p.文件, 版本:p.发布.version }])
      变更({ 阶段:'安装中', 版本:p.发布.version, 任务标识:p.任务标识 })
      try { await 打开安装包(文件, p.发布, p.任务标识); return { ...当前 } }
      catch (e) { 变更({ 阶段:'已就绪', 错误:e.message || '无法打开安装包' }); throw e }
    } finally { 安装进行 = false }
  }
  return { 下载, 取消, 状态, 安装 }
}
module.exports = { 创建暂存更新 }
