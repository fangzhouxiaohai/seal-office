// 演示智能服务配置：翻译/语音/识别三类服务的密钥统一写入系统安全存储的密文文件。
// 密钥不进入普通设置、备份与日志；对外只暴露「已配置密钥」布尔值。
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const 服务种类列表 = Object.freeze(['翻译', '语音', '识别'])
const 最大密钥长度 = 4096
const 本机主机 = ['localhost', '127.0.0.1', '[::1]']

const 是记录 = (值) => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)

function 规范地址(地址) {
  if (typeof 地址 !== 'string' || !地址.trim() || 地址.length > 2048) throw new Error('请填写有效的服务接口地址')
  let 网址
  try { 网址 = new URL(地址.trim()) } catch { throw new Error('服务接口地址格式无效') }
  if (网址.username || 网址.password || 网址.hash) throw new Error('接口地址不能包含账号、密码或片段标识')
  for (const 参数名 of 网址.searchParams.keys()) {
    if (/^(?:api[_-]?key|x[_-]?api[_-]?key|key|token|access[_-]?token|authorization|auth|secret|password)$/i.test(参数名)) {
      throw new Error('请在访问密钥栏填写密钥，不要放入接口地址')
    }
  }
  if (网址.protocol !== 'https:' && !(网址.protocol === 'http:' && 本机主机.includes(网址.hostname))) {
    throw new Error('远程服务须使用安全连接；本机服务可使用 HTTP')
  }
  return 网址.toString()
}

function 规范文本字段(值, 名称, 最大长度, 可空 = true) {
  if (值 === undefined) return 可空 ? '' : undefined
  if (typeof 值 !== 'string') throw new Error(`${名称}格式无效`)
  const 文本 = 值.trim()
  if (!可空 && !文本) throw new Error(`请填写有效的${名称}`)
  if (文本.length > 最大长度) throw new Error(`${名称}过长：最多 ${最大长度} 个字符`)
  return 文本
}

function 规范术语表(值) {
  if (值 === undefined) return []
  if (!Array.isArray(值) || 值.length > 200) throw new Error('术语表格式无效：最多 200 条')
  return 值.map((项) => {
    if (!是记录(项)) throw new Error('术语表条目格式无效')
    const 原文 = 规范文本字段(项.原文, '术语原文', 80, false)
    const 译文 = 规范文本字段(项.译文, '术语译文', 80, false)
    return { 原文, 译文 }
  })
}

/** 按种类校验配置；非法时抛出可直接展示的真实原因。 */
function 规范服务配置(种类, 输入, 原配置 = {}) {
  if (!服务种类列表.includes(种类)) throw new Error(`演示智能服务种类无效：${String(种类)}`)
  if (!是记录(输入)) throw new Error('演示智能服务设置无效')
  const 配置 = {
    名称: 规范文本字段(输入.名称 ?? 原配置.名称 ?? '', '服务名称', 60),
    地址: 规范地址(输入.地址 ?? 原配置.地址 ?? ''),
    模型: 规范文本字段(输入.模型 ?? 原配置.模型 ?? '', '模型名称', 120),
    密钥: 输入.清除密钥 === true ? '' : 规范文本字段(输入.密钥 ?? 原配置.密钥 ?? '', '服务密钥', 最大密钥长度),
  }
  if (种类 === '翻译') {
    配置.目标语言 = 规范文本字段(输入.目标语言 ?? 原配置.目标语言 ?? 'zh', '目标语言', 10, false)
    if (!/^[A-Za-z][A-Za-z-]{1,9}$/.test(配置.目标语言)) throw new Error('目标语言格式无效：请使用 zh、en、ja 一类语言代码')
    配置.术语表 = 规范术语表(输入.术语表 ?? 原配置.术语表)
  }
  if (种类 === '语音') {
    配置.声线 = 规范文本字段(输入.声线 ?? 原配置.声线 ?? '', '声线', 60, false)
    配置.语速 = 输入.语速 ?? 原配置.语速 ?? 1
    if (typeof 配置.语速 !== 'number' || !Number.isFinite(配置.语速) || 配置.语速 < 0.5 || 配置.语速 > 2) {
      throw new Error('语速无效：允许 0.5 到 2 之间的数值')
    }
  }
  if (种类 === '识别') {
    配置.识别模式 = 输入.识别模式 ?? 原配置.识别模式 ?? '图像理解'
    if (!['图像理解', '文字识别'].includes(配置.识别模式)) throw new Error('识别模式无效：仅支持图像理解或文字识别')
  }
  return 配置
}

function 公开服务配置(配置) {
  if (!配置) return null
  const { 密钥, ...其余 } = 配置
  return { ...其余, 已配置密钥: Boolean(密钥) }
}

function 创建服务配置存储({ 配置路径, 存储 = fs.promises, 安全存储 }) {
  if (!配置路径 || !安全存储) throw new Error('演示智能服务安全存储未初始化')
  let 队列 = Promise.resolve()
  let 缓存 = null

  const 排队 = (操作) => {
    const 本次 = 队列.then(操作)
    队列 = 本次.then(() => undefined, () => undefined)
    return 本次
  }

  async function 读取全部() {
    let 密文
    try { 密文 = await 存储.readFile(配置路径) }
    catch (错误) {
      if (错误?.code === 'ENOENT') { 缓存 = {}; return 缓存 }
      throw new Error('演示智能服务设置读取失败，请检查本机配置文件')
    }
    if (!安全存储.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法读取演示智能服务设置')
    try {
      const 数据 = JSON.parse(安全存储.decryptString(Buffer.from(密文)))
      if (!是记录(数据)) throw new Error('结构无效')
      缓存 = 数据
      return 缓存
    } catch {
      throw new Error('演示智能服务设置无法解密，请重新配置服务')
    }
  }

  async function 写入全部(数据) {
    const 临时路径 = `${配置路径}.tmp-${randomUUID()}`
    try {
      if (typeof 存储.mkdir === 'function') await 存储.mkdir(path.dirname(配置路径), { recursive: true })
      await 存储.writeFile(临时路径, 安全存储.encryptString(JSON.stringify(数据)), { mode: 0o600 })
      await 存储.rename(临时路径, 配置路径)
    } catch {
      try { await 存储.unlink(临时路径) } catch { /* 临时文件可能尚未创建 */ }
      throw new Error('演示智能服务设置保存失败，请检查本机存储空间和权限')
    }
    缓存 = 数据
  }

  const 读取 = (种类) => 排队(async () => 公开服务配置((await 读取全部())[种类] ?? null))

  const 保存 = (种类, 输入) => 排队(async () => {
    if (!服务种类列表.includes(种类)) throw new Error(`演示智能服务种类无效：${String(种类)}`)
    if (!安全存储.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法安全保存演示智能服务设置')
    const 全部 = await 读取全部()
    const 配置 = 规范服务配置(种类, 输入, 全部[种类])
    await 写入全部({ ...全部, [种类]: 配置 })
    return 公开服务配置(配置)
  })

  const 清除 = (种类) => 排队(async () => {
    if (!服务种类列表.includes(种类)) throw new Error(`演示智能服务种类无效：${String(种类)}`)
    const 全部 = await 读取全部()
    delete 全部[种类]
    if (Object.keys(全部).length === 0) {
      try { await 存储.unlink(配置路径) } catch (错误) { if (错误?.code !== 'ENOENT') throw new Error('清除演示智能服务设置失败') }
      缓存 = {}
      return
    }
    await 写入全部(全部)
  })

  /** 兼容旧翻译设置：先写入新存储并读回校验，成功后才由调用方清除旧设置。 */
  const 迁移翻译配置 = (旧配置) => 排队(async () => {
    const 全部 = await 读取全部()
    if (全部.翻译) return { 成功: false, 原因: '翻译服务配置已存在，未覆盖现有设置' }
    let 配置
    try { 配置 = 规范服务配置('翻译', 旧配置) }
    catch (错误) { return { 成功: false, 原因: 错误 instanceof Error ? 错误.message : '旧翻译设置无效' } }
    await 写入全部({ ...全部, 翻译: 配置 })
    const 校验 = (await 读取全部()).翻译
    if (!校验 || 校验.地址 !== 配置.地址 || 校验.目标语言 !== 配置.目标语言 || 校验.密钥 !== 配置.密钥) {
      return { 成功: false, 原因: '迁移校验失败，新存储内容与预期不一致' }
    }
    return { 成功: true, 目标语言: 配置.目标语言 }
  })

  return {
    读取,
    保存,
    清除,
    迁移翻译配置,
    读取全部: () => 排队(async () => 读取全部()),
    读取公开全部: () => 排队(async () => Object.fromEntries(服务种类列表.map((种类) => [种类, 公开服务配置((缓存 ?? {})[种类] ?? null)]))),
    /** 仅供主进程内部调用实际服务使用；不经过 IPC。 */
    读取内部密钥: (种类) => 缓存?.[种类]?.密钥 ?? '',
    读取内部配置: (种类) => 缓存?.[种类] ?? null,
  }
}

module.exports = { 创建服务配置存储, 服务种类列表, 规范服务配置, 公开服务配置 }
