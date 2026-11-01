// 皮肤包格式校验：客户端导入、上传与服务端公开审核共用，不访问文件系统或网络。
const 皮肤最大字节 = 512 * 1024
const 背景图最大字节 = 300 * 1024
const 皮肤颜色键 = ['bg', 'sidebar', 'card', 'toolbar', 'text', 'text2', 'text3', 'border', 'brand', 'brandHover', 'brandSoft', 'hover', 'selected', 'gradientFrom', 'gradientTo']
const 顶层字段 = ['format', 'schema', 'id', 'name', 'author', 'version', 'description', 'light', 'dark', 'radius', 'background']
const 模式名称 = { light: '浅色', dark: '深色' }

function 相对亮度(颜色) {
  const 分量 = [1, 3, 5].map(起点 => parseInt(颜色.slice(起点, 起点 + 2), 16) / 255)
    .map(值 => 值 <= 0.03928 ? 值 / 12.92 : Math.pow((值 + 0.055) / 1.055, 2.4))
  return 0.2126 * 分量[0] + 0.7152 * 分量[1] + 0.0722 * 分量[2]
}

/** WCAG 2.x 对比度，范围 1–21。 */
function 对比度(前景, 背景) {
  const 甲 = 相对亮度(前景), 乙 = 相对亮度(背景)
  return (Math.max(甲, 乙) + 0.05) / (Math.min(甲, 乙) + 0.05)
}

function 文本字段(值, 名称, 最小, 最大) {
  if (typeof 值 !== 'string' || 值.trim().length < 最小 || 值.trim().length > 最大) throw new Error(`${名称}须为 ${最小}–${最大} 个字符`)
  if (/[<>\u0000-\u001f]/.test(值)) throw new Error(`${名称}不能包含尖括号或控制字符`)
  return 值.trim()
}

function 校验颜色组(组, 模式) {
  const 名称 = 模式名称[模式]
  if (!组 || typeof 组 !== 'object' || Array.isArray(组)) throw new Error(`缺少${名称}模式颜色`)
  for (const 键 of Object.keys(组)) if (!皮肤颜色键.includes(键)) throw new Error(`${名称}模式包含未知颜色键：${键}`)
  const 结果 = {}
  for (const 键 of 皮肤颜色键) {
    if (!(键 in 组)) throw new Error(`${名称}模式缺少颜色键：${键}`)
    if (typeof 组[键] !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(组[键])) throw new Error(`${名称}模式 ${键} 须为 #RRGGBB 格式的颜色`)
    结果[键] = 组[键].toUpperCase()
  }
  const 检查 = (前景, 背景, 下限, 说明) => {
    const 值 = 对比度(结果[前景], 结果[背景])
    if (值 < 下限) throw new Error(`${名称}模式${说明}对比度为 ${值.toFixed(2)}:1，低于 ${下限}:1 的可读性要求`)
  }
  检查('text', 'card', 4.5, '正文与卡片')
  检查('text', 'bg', 4.5, '正文与背景')
  检查('text2', 'card', 3, '次要文字与卡片')
  const 白字 = 对比度('#FFFFFF', 结果.brand)
  if (白字 < 3) throw new Error(`${名称}模式主色上的白色文字对比度为 ${白字.toFixed(2)}:1，低于 3:1，主按钮文字不可读`)
  return 结果
}

const 图片签名 = {
  png: 字节 => [137, 80, 78, 71, 13, 10, 26, 10].every((值, 下标) => 字节[下标] === 值),
  jpeg: 字节 => 字节[0] === 255 && 字节[1] === 216 && 字节[2] === 255,
  webp: 字节 => String.fromCharCode(...字节.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...字节.subarray(8, 12)) === 'WEBP',
}

function 解码base64(文本) {
  if (typeof atob === 'function') return Uint8Array.from(atob(文本), 字符 => 字符.charCodeAt(0))
  return new Uint8Array(Buffer.from(文本, 'base64'))
}

function 校验背景(背景) {
  if (!背景 || typeof 背景 !== 'object' || Array.isArray(背景)) throw new Error('背景图设置无效')
  for (const 键 of Object.keys(背景)) if (!['image', 'opacity'].includes(键)) throw new Error(`背景图设置包含未知字段：${键}`)
  const 匹配 = typeof 背景.image === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(背景.image)
  if (!匹配) throw new Error('背景图只接受 PNG、JPEG 或 WebP 的 base64 数据')
  if (匹配[2].length * 3 / 4 > 背景图最大字节 + 3) throw new Error('背景图解码后不能超过 300 KB')
  const 字节 = 解码base64(匹配[2])
  if (字节.length > 背景图最大字节) throw new Error('背景图解码后不能超过 300 KB')
  if (字节.length < 12 || !图片签名[匹配[1]](字节)) throw new Error('背景图文件内容与声明的图片类型不一致')
  if (typeof 背景.opacity !== 'number' || !(背景.opacity >= 0 && 背景.opacity <= 0.4)) throw new Error('背景图透明度须在 0 到 0.4 之间')
  return { image: 背景.image, opacity: 背景.opacity }
}

/** 校验皮肤对象并返回规范化副本；不合法时抛出中文说明。 */
function 校验皮肤(皮肤) {
  if (!皮肤 || typeof 皮肤 !== 'object' || Array.isArray(皮肤)) throw new Error('皮肤内容须为 JSON 对象')
  for (const 键 of Object.keys(皮肤)) if (!顶层字段.includes(键)) throw new Error(`皮肤包含未知字段：${键}`)
  if (皮肤.format !== 'seal-skin' || 皮肤.schema !== 1) throw new Error('不是海豹办公皮肤：format 须为 seal-skin，schema 须为 1')
  if (typeof 皮肤.id !== 'string' || !/^[a-z0-9][a-z0-9.-]{2,63}$/.test(皮肤.id)) throw new Error('皮肤标识须为 3–64 位小写字母、数字、点或连字符')
  const 结果 = {
    format: 'seal-skin', schema: 1, id: 皮肤.id,
    name: 文本字段(皮肤.name, '皮肤名称', 1, 24),
    author: 皮肤.author === undefined ? '' : 文本字段(皮肤.author, '作者', 0, 32),
    version: '', description: 皮肤.description === undefined ? '' : 文本字段(皮肤.description, '皮肤说明', 0, 120),
  }
  if (typeof 皮肤.version !== 'string' || !/^\d{1,4}\.\d{1,4}\.\d{1,6}$/.test(皮肤.version)) throw new Error('皮肤版本须为 1.0.0 形式')
  结果.version = 皮肤.version
  结果.light = 校验颜色组(皮肤.light, 'light')
  结果.dark = 校验颜色组(皮肤.dark, 'dark')
  if (皮肤.radius !== undefined) {
    const 圆角 = 皮肤.radius
    if (!圆角 || typeof 圆角 !== 'object' || Object.keys(圆角).some(键 => !['card', 'control'].includes(键))) throw new Error('圆角设置只能包含 card 与 control')
    const 卡片 = 圆角.card ?? 12, 控件 = 圆角.control ?? 8
    if (!Number.isInteger(卡片) || 卡片 < 0 || 卡片 > 24 || !Number.isInteger(控件) || 控件 < 0 || 控件 > 16) throw new Error('圆角须为整数：卡片 0–24，控件 0–16')
    结果.radius = { card: 卡片, control: 控件 }
  }
  if (皮肤.background !== undefined) 结果.background = 校验背景(皮肤.background)
  return 结果
}

/** 解析 .sealskin 文本：限制体积后按 JSON 读取并校验。 */
function 解析皮肤文本(文本) {
  if (typeof 文本 !== 'string') throw new Error('皮肤文件内容无效')
  const 字节数 = typeof TextEncoder === 'function' ? new TextEncoder().encode(文本).length : Buffer.byteLength(文本)
  if (字节数 > 皮肤最大字节) throw new Error('皮肤文件不能超过 512 KB')
  let 数据
  try { 数据 = JSON.parse(文本.replace(/^﻿/, '')) } catch { throw new Error('皮肤文件不是有效的 JSON') }
  return 校验皮肤(数据)
}

module.exports = { 校验皮肤, 解析皮肤文本, 对比度, 皮肤颜色键, 皮肤最大字节, 背景图最大字节 }
