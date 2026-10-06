const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const { 是合法base64, base64字节数 } = require('./base64')

const 支持的捕获类型 = ['screen', 'window']
const 允许格式 = new Map([['webm', 'video/webm']])
const 默认最大字节 = 2 * 1024 * 1024 * 1024

/** 先按长度判断大小，再校验编码，避免超长内容触发昂贵的正则回溯。 */
function 解码base64(数据, 最大字节) {
  if (typeof 数据 !== 'string' || 数据.length === 0) throw new Error('录制内容为空，没有可保存的片段')
  const 字节数 = base64字节数(数据)
  if (字节数 <= 0) throw new Error('录制内容为空，没有可保存的片段')
  if (字节数 > 最大字节) throw new Error(`录制超过大小限制：${字节数} 字节`)
  if (!是合法base64(数据)) throw new Error('录制内容编码无效，无法保存')
  const 字节 = Buffer.from(数据, 'base64')
  if (字节.length === 0) throw new Error('录制内容为空，没有可保存的片段')
  return 字节
}

/** 建议名中的路径分隔符、设备名与通配符必须剔除，扩展名固定为 .webm。 */
function 规整建议名(建议名) {
  const 原文 = typeof 建议名 === 'string' ? 建议名.trim() : ''
  const 基础 = 原文.replace(/\.(webm|mp4)$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').slice(0, 80).trim()
  return `${基础.length > 0 ? 基础 : '屏幕录制'}.webm`
}

function 读取源类型(标识) {
  if (typeof 标识 !== 'string') return ''
  if (标识.startsWith('screen:')) return 'screen'
  if (标识.startsWith('window:')) return 'window'
  return ''
}

/** 默认捕获源必须把调用参数原样转发给 desktopCapturer，空选项会被 Electron 拒绝。 */
function 创建默认捕获源(取模块 = () => require('electron')) {
  return (参数) => {
    const 模块 = 取模块()
    if (!模块?.desktopCapturer?.getSources) throw new Error('当前环境不支持桌面捕获，请使用 Windows 桌面版')
    return 模块.desktopCapturer.getSources(参数)
  }
}

function 创建录制服务(选项 = {}) {
  const 捕获源 = 选项.捕获源 === undefined ? 创建默认捕获源(选项.取模块) : 选项.捕获源
  const 存储 = 选项.存储 ?? fs.promises
  const 最大字节 = 选项.最大字节 ?? 默认最大字节
  if (!Number.isSafeInteger(最大字节) || 最大字节 <= 0) throw new Error('录制大小限制无效')
  const 选择保存路径 = 选项.选择保存路径 ?? (async (建议名) => {
    const 对话框 = 选项.对话框 ?? require('electron').dialog
    const 结果 = await 对话框.showSaveDialog({ defaultPath: 建议名, filters: [{ name: 'WebM 视频', extensions: ['webm'] }] })
    return 结果?.canceled || !结果?.filePath ? null : 结果.filePath
  })

  async function 列出捕获源(类型列表) {
    if (!Array.isArray(类型列表) || 类型列表.length === 0 || 类型列表.some(类型 => !支持的捕获类型.includes(类型))) {
      throw new Error('捕获类型无效：只支持屏幕或窗口')
    }
    if (typeof 捕获源 !== 'function') throw new Error('当前环境不支持桌面捕获，请使用 Windows 桌面版')
    const 类型集合 = [...new Set(类型列表)]
    let 源列表
    try {
      源列表 = await 捕获源({ types: 类型集合, thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false })
    } catch (错误) {
      throw new Error(`读取捕获源失败：${错误 instanceof Error ? 错误.message : '系统未返回捕获源'}`)
    }
    if (!Array.isArray(源列表)) throw new Error('读取捕获源失败：系统返回格式无效')
    return {
      源列表: 源列表.map(源 => {
        const 类型 = 读取源类型(源?.id)
        let 缩略图 = ''
        try { if (源?.thumbnail && !源.thumbnail.isEmpty?.()) 缩略图 = 源.thumbnail.toDataURL() } catch { 缩略图 = '' }
        return {
          标识: typeof 源?.id === 'string' ? 源.id : '',
          名称: typeof 源?.name === 'string' && 源.name.trim() ? 源.name : (类型 === 'screen' ? '未命名屏幕' : '未命名窗口'),
          类型,
          显示器标识: typeof 源?.display_id === 'string' ? 源.display_id : '',
          缩略图,
        }
      }).filter(项 => 项.标识 && 项.类型),
    }
  }

  async function 保存录制(输入) {
    if (!输入 || typeof 输入 !== 'object') throw new Error('录制保存参数无效')
    const 格式 = 输入.格式 === undefined ? 'webm' : String(输入.格式).toLowerCase()
    if (!允许格式.has(格式)) {
      throw new Error(格式 === 'mp4'
        ? 'MP4 需要额外编码器与分发授权，完成真实验证前不提供 MP4 导出；请保存为 WebM'
        : `不支持的录制格式：${格式}`)
    }
    const 字节 = 解码base64(输入.数据, 最大字节)
    const 建议名 = 规整建议名(输入.建议名)
    const 挑选路径 = await 选择保存路径(建议名)
    if (!挑选路径) return { 已取消: true }
    if (typeof 挑选路径 !== 'string' || 挑选路径.trim().length === 0) throw new Error('保存路径无效')
    const 目标路径 = path.resolve(/\.webm$/i.test(挑选路径) ? 挑选路径 : `${挑选路径}.webm`)
    const 临时路径 = `${目标路径}.part-${randomUUID()}`
    try {
      await 存储.writeFile(临时路径, 字节)
      await 存储.rename(临时路径, 目标路径)
    } catch (错误) {
      try { await 存储.unlink(临时路径) } catch { /* 半成品可能尚未创建 */ }
      throw new Error(`保存录制失败：${错误 instanceof Error ? 错误.message : '磁盘写入失败'}`)
    }
    return { 路径: 目标路径, 字节数: 字节.length }
  }

  function 读取支持情况() {
    return {
      WebM: true,
      媒体类型: 允许格式.get('webm'),
      MP4: false,
      MP4原因: 'MP4 需要额外编码器与分发授权，完成真实验证前不提供导出',
    }
  }

  return { 列出捕获源, 保存录制, 读取支持情况 }
}

module.exports = { 创建录制服务, 创建默认捕获源, 规整建议名, 支持的捕获类型 }
