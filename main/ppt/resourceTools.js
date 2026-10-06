// 便捷工具（主进程侧）：把资源写成真实文件，以及图片重采样压缩。
// 全部依赖可注入，便于回归；压缩失败或没有变小时如实返回，不静默替换。
const fs = require('fs')
const path = require('path')

const 扩展名表 = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp',
  'video/webm': '.webm', 'video/mp4': '.mp4', 'audio/webm': '.weba', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg',
  'application/octet-stream': '.bin',
}

/** 文件名净化：去掉路径分隔符与保留字符，避免写出目标目录之外 */
function 安全名(名称) {
  const 结果 = String(名称 ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim()
  return 结果.slice(0, 80) || '资源'
}

function 扩展名(类型) {
  if (typeof 类型 === 'string' && 扩展名表[类型]) return 扩展名表[类型]
  if (typeof 类型 === 'string' && /^image\/[a-z0-9.+-]+$/i.test(类型)) return `.${类型.slice(6).replace(/[^a-z0-9]/gi, '')}`
  return '.bin'
}

/**
 * 提取资源到目录：逐项独立结果，重名自动追加序号，不覆盖已存在文件。
 * @param 条目列表 [{ 标识, 类型, 数据（base64）, 名称? }]
 */
async function 提取资源(条目列表, 目录, 依赖 = {}) {
  const 写入 = 依赖.写入文件 ?? ((路径, 字节) => fs.promises.writeFile(路径, 字节))
  const 存在 = 依赖.存在 ?? (路径 => fs.existsSync(路径))
  const 建目录 = 依赖.建目录 ?? (路径 => fs.promises.mkdir(路径, { recursive: true }))
  if (!Array.isArray(条目列表) || 条目列表.length === 0) throw new Error('没有可提取的资源')
  if (typeof 目录 !== 'string' || 目录.trim().length === 0) throw new Error('请选择资源提取目录')
  await 建目录(目录)
  const 结果 = []
  const 已用 = new Set()
  for (const 项 of 条目列表) {
    try {
      if (!项 || typeof 项.标识 !== 'string' || 项.标识.length === 0) throw new Error('资源标识无效')
      if (typeof 项.数据 !== 'string' || 项.数据.length === 0) throw new Error('资源字节缺失')
      const 字节 = Buffer.from(项.数据, 'base64')
      if (字节.length === 0) throw new Error('资源字节为空')
      const 基名 = 安全名(项.名称 ?? 项.标识.slice(0, 12))
      let 序号 = 0
      let 目标
      do {
        目标 = path.join(目录, `${基名}${序号 > 0 ? `-${序号}` : ''}${扩展名(项.类型)}`)
        序号 += 1
      } while (已用.has(目标) || 存在(目标))
      已用.add(目标)
      await 写入(目标, 字节)
      结果.push({ 标识: 项.标识, 类型: 项.类型, 路径: 目标, 字节数: 字节.length, 成功: true })
    } catch (错误) {
      结果.push({ 标识: 项?.标识 ?? '', 成功: false, 错误: 错误 instanceof Error ? 错误.message : '资源提取失败' })
    }
  }
  return { 结果, 汇总: { 总数: 结果.length, 成功: 结果.filter(项 => 项.成功).length, 失败: 结果.filter(项 => !项.成功).length } }
}

/** 默认重采样：用 Electron nativeImage 解码并缩放，仅在桌面版可用 */
function 默认重采样(字节, 类型, 选项) {
  let nativeImage
  try {
    nativeImage = require('electron').nativeImage
  } catch {
    throw new Error('当前环境不支持图片重采样，请在 Windows 桌面版中压缩图片')
  }
  if (!nativeImage?.createFromBuffer) throw new Error('当前环境不支持图片重采样，请在 Windows 桌面版中压缩图片')
  const 原图 = nativeImage.createFromBuffer(字节)
  if (原图.isEmpty()) throw new Error('图片无法解码，未进行压缩')
  const 原尺寸 = 原图.getSize()
  let 图 = 原图
  if (选项.最大边 > 0 && Math.max(原尺寸.width, 原尺寸.height) > 选项.最大边) {
    const 比例 = 选项.最大边 / Math.max(原尺寸.width, 原尺寸.height)
    图 = 原图.resize({ width: Math.max(1, Math.round(原尺寸.width * 比例)), height: Math.max(1, Math.round(原尺寸.height * 比例)) })
  }
  const 尺寸 = 图.getSize()
  const 输出 = 类型 === 'image/jpeg' ? 图.toJPEG(Math.round(选项.质量 * 100)) : 图.toPNG()
  return { 字节: Buffer.from(输出), 类型, 宽: 尺寸.width, 高: 尺寸.height }
}

/**
 * 压缩图片：返回新的字节与尺寸；无法压缩或压缩后更大时返回失败与真实原因。
 * @param 输入 { 数据（base64）, 类型 }
 * @param 选项 { 质量 0-1, 最大边（0 表示不限制） }
 */
async function 压缩图片(输入, 选项 = {}, 依赖 = {}) {
  const 重采样 = 依赖.重采样 ?? 默认重采样
  if (!输入 || typeof 输入.数据 !== 'string' || 输入.数据.length === 0) throw new Error('图片资源字节无效')
  const 类型 = 输入.类型
  if (!['image/png', 'image/jpeg'].includes(类型)) throw new Error(`当前只支持压缩 PNG 与 JPEG 图片，收到 ${typeof 类型 === 'string' && 类型 ? 类型 : '未知类型'}`)
  const 质量 = 选项.质量 ?? 0.8
  const 最大边 = 选项.最大边 ?? 0
  if (typeof 质量 !== 'number' || !(质量 > 0 && 质量 <= 1)) throw new Error('压缩质量必须在 0 与 1 之间')
  if (typeof 最大边 !== 'number' || !Number.isFinite(最大边) || 最大边 < 0) throw new Error('最大边设置无效')
  const 原字节 = Buffer.from(输入.数据, 'base64')
  if (原字节.length === 0) throw new Error('图片资源字节为空')
  const 输出 = await 重采样(原字节, 类型, { 质量, 最大边 })
  if (!输出 || !Buffer.isBuffer(输出.字节) || 输出.字节.length === 0) throw new Error('重采样没有返回图片字节，已保持原图不变')
  const 新类型 = 输出.类型 ?? 类型
  if (输出.字节.length >= 原字节.length) {
    return { 成功: false, 原因: `压缩后 ${输出.字节.length} 字节，不小于原图 ${原字节.length} 字节，已保持原图不变`, 原字节数: 原字节.length, 新字节数: 输出.字节.length }
  }
  return { 成功: true, 类型: 新类型, 字节: 输出.字节, 原字节数: 原字节.length, 新字节数: 输出.字节.length, 宽: 输出.宽, 高: 输出.高 }
}

module.exports = { 提取资源, 压缩图片, 安全名, 扩展名 }
