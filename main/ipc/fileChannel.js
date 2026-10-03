const { dialog, app, shell, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { createHash, randomUUID } = require('crypto')
const { 读取docx } = require('../office/docxReader')
const { 读取xlsx } = require('../office/xlsxCodec')
const { 读取pptx } = require('../office/pptxCodec')

const 文本扩展名 = new Set(['.html', '.htm', '.txt', '.md', '.csv', '.json'])
const 可浏览扩展名 = new Set([...文本扩展名, '.docx', '.xlsx', '.pptx', '.pdf'])
const 已知文件夹 = { desktop: 'desktop', document: 'documents', download: 'downloads' }
const 保存对话框授权 = new WeakMap()

function 规范路径(目标) {
  const 绝对路径 = path.resolve(目标)
  return process.platform === 'win32' ? 绝对路径.toLowerCase() : 绝对路径
}

function 计算文件指纹(目标, 内容) {
  return createHash('sha256').update(规范路径(目标)).update('\0').update(内容).digest('hex')
}

function 读取目标指纹(目标) {
  try {
    return 计算文件指纹(目标, fs.readFileSync(目标))
  } catch (错误) {
    if (错误.code === 'ENOENT') return null
    throw 错误
  }
}

function 文件冲突错误(原因) {
  const 错误 = new Error(`${原因}，已阻止覆盖。请重新打开文件或另存为其他名称。`)
  错误.code = 'FILE_CONFLICT'
  return 错误
}

/**
 * 把渲染进程传入的文件内容统一转成 Buffer。
 * 支持三种形态：
 *   1. Buffer：直接使用；
 *   2. Uint8Array（二进制字节）：拷贝为 Buffer；
 *   3. 格式为'二进制'时的 base64 字符串：解码为二进制字节；
 *   4. 其它情况按 UTF-8 文本处理。
 */
function 内容转缓冲(内容, 格式) {
  if (Buffer.isBuffer(内容)) return 内容
  if (内容 instanceof Uint8Array) {
    return Buffer.from(内容.buffer, 内容.byteOffset, 内容.byteLength)
  }
  const 文本 = String(内容 ?? '')
  if (格式 === '二进制') {
    // 合法的 base64 文本（长度是 4 的倍数且仅含 base64 字符）按二进制解码
    if (文本.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(文本)) {
      return Buffer.from(文本, 'base64')
    }
    return Buffer.from(文本, 'utf8')
  }
  return Buffer.from(文本, 'utf8')
}

function 原子写入文件(目标, 内容) {
  const 临时 = path.join(path.dirname(目标), `.${path.basename(目标)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    fs.writeFileSync(临时, 内容, { flag: 'wx' })
    fs.renameSync(临时, 目标)
  } catch (错误) {
    if (fs.existsSync(临时)) fs.unlinkSync(临时)
    throw 错误
  }
}

function 保留损坏自动备份(备份目录, 已读取内容) {
  const 原路径 = path.join(备份目录, 'autosave.json')
  if (!fs.existsSync(原路径)) throw new Error('原始备份文件已不存在，请重试恢复')
  if (已读取内容 !== undefined && fs.readFileSync(原路径, 'utf8') !== 已读取内容) {
    throw new Error('备份内容已变化，请重试恢复后再继续')
  }
  const 保留路径 = path.join(备份目录, `autosave-invalid-${Date.now()}-${randomUUID()}.json`)
  fs.renameSync(原路径, 保留路径)
  return 保留路径
}

/**
 * 新文件使用排他硬链接创建；现有文件在写入临时文件后、替换前再次按内容比较。
 * 常规文件系统不提供跨进程原子比较并替换，校验紧贴 rename 以缩小竞态窗口。
 */
function 带版本校验写入文件(目标, 内容, 预期文件指纹, 缺少原始版本 = false) {
  const 临时 = path.join(path.dirname(目标), `.${path.basename(目标)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    fs.writeFileSync(临时, 内容, { flag: 'wx' })
    const 当前文件指纹 = 读取目标指纹(目标)
    if (当前文件指纹 !== 预期文件指纹) {
      if (缺少原始版本 && 当前文件指纹 !== null) {
        throw 文件冲突错误('缺少打开文件时的版本信息，无法确认目标文件是否被修改')
      }
      throw 文件冲突错误(当前文件指纹 === null ? '目标文件已在应用外删除或移动' : '目标文件已在应用外发生变化')
    }
    if (当前文件指纹 === null) {
      try {
        fs.linkSync(临时, 目标)
      } catch (错误) {
        if (!new Set(['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EINVAL', 'EXDEV']).has(错误.code)) {
          throw 错误
        }
        // 不支持硬链接的文件系统仍须排他创建，绝不能退回可覆盖的 rename。
        fs.copyFileSync(临时, 目标, fs.constants.COPYFILE_EXCL)
      }
      fs.unlinkSync(临时)
    } else {
      fs.renameSync(临时, 目标)
    }
    return 计算文件指纹(目标, 内容)
  } catch (错误) {
    if (fs.existsSync(临时)) fs.unlinkSync(临时)
    if (错误.code === 'EEXIST') throw 文件冲突错误('目标文件已被其他程序创建')
    throw 错误
  }
}

function 读取最近列表(目标) {
  if (!fs.existsSync(目标)) return []
  let 列表
  try {
    列表 = JSON.parse(fs.readFileSync(目标, 'utf-8'))
  } catch (错误) {
    if (错误 instanceof SyntaxError) throw new Error('最近文档记录格式损坏，无法读取')
    throw 错误
  }
  if (!Array.isArray(列表)) throw new Error('最近文档记录结构损坏，无法读取')
  if (列表.some((条目) => !条目 || typeof 条目 !== 'object' ||
    typeof 条目.路径 !== 'string' || 条目.路径.length === 0 ||
    typeof 条目.名称 !== 'string' || typeof 条目.类型 !== 'string')) {
    throw new Error('最近文档记录条目损坏，无法读取')
  }
  return 列表
}

function 生成重命名文件名(旧路径, 新名称) {
  if (typeof 新名称 !== 'string' || 新名称.trim() === '') throw new Error('文件名称不能为空')
  if (新名称 !== 新名称.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(新名称) || /[. ]$/.test(新名称)) {
    throw new Error('文件名称包含 Windows 不允许的字符或结尾')
  }
  const 扩展名 = path.extname(旧路径)
  const 基名 = 扩展名 !== '' && 新名称.toLowerCase().endsWith(扩展名.toLowerCase())
    ? 新名称.slice(0, -扩展名.length)
    : 新名称
  if (基名 === '' || /[. ]$/.test(基名) || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(基名)) {
    throw new Error('文件名称是 Windows 保留名称或格式无效')
  }
  return `${基名}${扩展名}`
}

// 按文档类型给出专属的保存/打开过滤器：保存什么类型的文档，对话框就只提供该类型，
// 不再混杂 html/json 等中间格式。
const 保存过滤器映射 = {
  word: [{ name: '文字文档', extensions: ['docx'] }],
  table: [{ name: '表格文档', extensions: ['xlsx'] }],
  ppt: [{ name: '演示文档', extensions: ['pptx'] }],
  pdf: [{ name: 'PDF 文件', extensions: ['pdf'] }],
}

const 打开过滤器映射 = {
  word: [{ name: '文字文档', extensions: ['docx', 'html', 'htm', 'txt', 'md'] }],
  table: [{ name: '表格文档', extensions: ['xlsx', 'csv', 'json'] }],
  ppt: [{ name: '演示文档', extensions: ['pptx', 'json'] }],
  pdf: [{ name: 'PDF 文件', extensions: ['pdf'] }],
}

const 兜底保存过滤器 = [
  { name: '文字文档', extensions: ['docx'] },
  { name: '表格文档', extensions: ['xlsx'] },
  { name: '演示文档', extensions: ['pptx'] },
  { name: 'PDF 文件', extensions: ['pdf'] },
  { name: '所有文件', extensions: ['*'] },
]

const 兜底打开过滤器 = [
  { name: '办公文档', extensions: ['docx', 'xlsx', 'pptx', 'html', 'htm', 'txt', 'md', 'csv', 'json', 'pdf'] },
  { name: '所有文件', extensions: ['*'] },
]

function 注册文件通道(ipcMain) {
  ipcMain.handle('file.listKnownFolder', async (_event, 位置) => {
    if (!Object.prototype.hasOwnProperty.call(已知文件夹, 位置)) return { 成功: false, 错误: '不支持的本机文件夹位置' }
    try {
      const 文件夹路径 = app.getPath(已知文件夹[位置])
      const 文件 = fs.readdirSync(文件夹路径, { withFileTypes: true })
        .filter((条目) => 条目.isFile() && 可浏览扩展名.has(path.extname(条目.name).toLowerCase()))
        .map((条目) => {
          const 路径 = path.join(文件夹路径, 条目.name)
          const 状态 = fs.statSync(路径)
          return { 名称: 条目.name, 路径, 扩展名: path.extname(条目.name).toLowerCase(), 大小: 状态.size, 修改时间: 状态.mtimeMs }
        })
        .sort((左, 右) => 右.修改时间 - 左.修改时间)
      return { 成功: true, 路径: 文件夹路径, 文件 }
    } catch (错误) {
      return { 成功: false, 错误: `读取本机文件夹失败：${错误 instanceof Error ? 错误.message : '无法访问目录'}` }
    }
  })
  ipcMain.handle('file.showSaveDialog', async (event, 默认文件名, 保存类型) => {
    const 窗口 = BrowserWindow.fromWebContents(event.sender)
    if (event.sender && typeof event.sender === 'object') 保存对话框授权.delete(event.sender)
    const 结果 = await dialog.showSaveDialog(窗口, {
      title: '保存文件',
      defaultPath: 默认文件名,
      filters: 保存过滤器映射[保存类型] ?? 兜底保存过滤器,
    })
    const 保存路径 = 结果.canceled ? null : 结果.filePath || null
    if (保存路径 && event.sender && typeof event.sender === 'object') {
      保存对话框授权.set(event.sender, { 路径: 规范路径(保存路径), 文件指纹: 读取目标指纹(保存路径) })
    }
    return 保存路径
  })

  ipcMain.handle('file.showOpenDialog', async (event, 打开类型) => {
    const 窗口 = require('electron').BrowserWindow.fromWebContents(event.sender)
    const 结果 = await dialog.showOpenDialog(窗口, {
      title: '打开文件',
      filters: 打开过滤器映射[打开类型] ?? 兜底打开过滤器,
      properties: ['openFile'],
    })
    return 结果.canceled ? null : 结果.filePaths[0] || null
  })

  ipcMain.handle('file.showOpenDialogMany', async (event, 打开类型) => {
    if (打开类型 !== 'pdf') throw new Error('当前仅支持批量打开 PDF 文件')
    const 窗口 = require('electron').BrowserWindow.fromWebContents(event.sender)
    const 结果 = await dialog.showOpenDialog(窗口, {
      title: '添加 PDF 文件',
      filters: 打开过滤器映射.pdf,
      properties: ['openFile', 'multiSelections'],
    })
    return 结果.canceled ? [] : 结果.filePaths
  })

  ipcMain.handle('file.saveToFile', async (event, filePath, 内容, 格式, 预期文件指纹) => {
    try {
      if (!filePath) return { 成功: false, 错误: '未指定保存路径' }
      const 授权 = event?.sender && typeof event.sender === 'object' ? 保存对话框授权.get(event.sender) : undefined
      const 使用对话框授权 = 预期文件指纹 === undefined && 授权?.路径 === 规范路径(filePath)
      const 缺少原始版本 = 预期文件指纹 === undefined && !使用对话框授权
      const 有效预期指纹 = 使用对话框授权 ? 授权.文件指纹 : 预期文件指纹 === undefined ? null : 预期文件指纹
      if (有效预期指纹 !== null && (typeof 有效预期指纹 !== 'string' || !/^[a-f0-9]{64}$/.test(有效预期指纹))) {
        return { 成功: false, 错误: '文件版本信息无效，已阻止覆盖。请重新打开文件后重试。' }
      }
      const 文件指纹 = 带版本校验写入文件(filePath, 内容转缓冲(内容, 格式), 有效预期指纹, 缺少原始版本)
      if (使用对话框授权) 保存对话框授权.delete(event.sender)
      return { 成功: true, 路径: filePath, 文件指纹 }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '保存文件失败' }
    }
  })

  // ---- 自动备份（备份中心最小实现）：内容写入 userData/backup/autosave.json ----
  ipcMain.handle('file.backup.save', async (_event, 内容) => {
    try {
      const fs = require('fs')
      const path = require('path')
      const 备份目录 = path.join(app.getPath('userData'), 'backup')
      fs.mkdirSync(备份目录, { recursive: true })
      const 目标 = path.join(备份目录, 'autosave.json')
      const 临时 = `${目标}.tmp`
      // 先写临时文件再替换，避免写一半崩溃损坏备份
      fs.writeFileSync(临时, String(内容 ?? ''), 'utf-8')
      fs.renameSync(临时, 目标)
      return { 成功: true }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '备份写入失败' }
    }
  })

  ipcMain.handle('file.backup.load', async () => {
    try {
      const fs = require('fs')
      const path = require('path')
      const 目标 = path.join(app.getPath('userData'), 'backup', 'autosave.json')
      if (!fs.existsSync(目标)) {
        return { 成功: true, 内容: null }
      }
      return { 成功: true, 内容: fs.readFileSync(目标, 'utf-8') }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '备份读取失败' }
    }
  })

  ipcMain.handle('file.backup.preserve', async (_event, 已读取内容) => {
    try {
      if (已读取内容 !== undefined && typeof 已读取内容 !== 'string') {
        return { 成功: false, 错误: '备份内容校验参数无效' }
      }
      const 备份目录 = path.join(app.getPath('userData'), 'backup')
      return { 成功: true, 路径: 保留损坏自动备份(备份目录, 已读取内容) }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '无法保留原始备份' }
    }
  })

  ipcMain.handle('file.backup.clear', async () => {
    try {
      const fs = require('fs')
      const path = require('path')
      const 目标 = path.join(app.getPath('userData'), 'backup', 'autosave.json')
      if (fs.existsSync(目标)) fs.unlinkSync(目标)
      return { 成功: true }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '备份清理失败' }
    }
  })

  // ---- 最近文档持久化：userData/recent.json，置顶与打开计数都保存在本机 ----
  ipcMain.handle('file.recent.list', async () => {
    try {
      const 目标 = path.join(app.getPath('userData'), 'recent.json')
      return { 成功: true, 数据: 读取最近列表(目标) }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '最近文档读取失败' }
    }
  })

  ipcMain.handle('file.recent.add', async (_event, 条目) => {
    try {
      if (!条目 || typeof 条目.路径 !== 'string' || 条目.路径.length === 0) {
        return { 成功: false, 错误: '缺少文件路径' }
      }
      if (typeof 条目.名称 !== 'string' || typeof 条目.类型 !== 'string') {
        return { 成功: false, 错误: '最近文档信息不完整' }
      }
      const 目标 = path.join(app.getPath('userData'), 'recent.json')
      let 列表 = 读取最近列表(目标)
      const 原记录 = 列表.find((项) => 项.路径 === 条目.路径)
      const 置顶 = typeof 条目.置顶 === 'boolean' ? 条目.置顶 : 原记录?.置顶 === true
      // 同一路径去重后置顶，最多保留 50 条
      列表 = [
        { ...条目, 时间: Date.now(), 置顶 },
        ...列表.filter((项) => 项.路径 !== 条目.路径),
      ].slice(0, 50)
      原子写入文件(目标, JSON.stringify(列表, null, 2))
      return { 成功: true, 数据: 列表 }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '最近文档写入失败' }
    }
  })

  ipcMain.handle('file.recent.remove', async (_event, 路径) => {
    try {
      const 目标 = path.join(app.getPath('userData'), 'recent.json')
      if (fs.existsSync(目标)) {
        const 剩余 = 读取最近列表(目标).filter((项) => 项.路径 !== 路径)
        原子写入文件(目标, JSON.stringify(剩余, null, 2))
        return { 成功: true, 数据: 剩余 }
      }
      return { 成功: true, 数据: [] }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '最近文档移除失败' }
    }
  })

  ipcMain.handle('file.rename', async (_event, 旧路径, 新名称, 预期文件指纹) => {
    try {
      if (typeof 旧路径 !== 'string' || !path.isAbsolute(旧路径)) {
        return { 成功: false, 错误: '原文件路径无效' }
      }
      const 新文件名 = 生成重命名文件名(旧路径, 新名称)
      const 新路径 = path.join(path.dirname(旧路径), 新文件名)
      if (新路径 === 旧路径) return { 成功: false, 错误: '文件名称未变化' }
      if (!fs.existsSync(旧路径) || !fs.lstatSync(旧路径).isFile()) {
        return { 成功: false, 错误: '原文件不存在或不是普通文件' }
      }
      if (预期文件指纹 !== undefined && 读取目标指纹(旧路径) !== 预期文件指纹) {
        throw 文件冲突错误('原文件已在应用外发生变化')
      }
      if (fs.existsSync(新路径)) return { 成功: false, 错误: '目标文件已存在' }

      const 记录路径 = path.join(app.getPath('userData'), 'recent.json')
      const 记录 = 读取最近列表(记录路径)
      const 索引 = 记录.findIndex((条目) => 条目.路径 === 旧路径)
      if (索引 < 0) return { 成功: false, 错误: '最近文档记录中找不到该文件' }
      const 更新记录 = 记录.map((条目, 当前索引) => 当前索引 === 索引
        ? { ...条目, 路径: 新路径, 名称: 新文件名 }
        : 条目)

      // 优先通过硬链接创建新目录项；不支持硬链接的磁盘改用排他复制，均不覆盖并发创建的目标。
      try {
        fs.linkSync(旧路径, 新路径)
      } catch (链接错误) {
        if (!new Set(['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EINVAL', 'EXDEV']).has(链接错误.code)) {
          throw 链接错误
        }
        fs.copyFileSync(旧路径, 新路径, fs.constants.COPYFILE_EXCL)
      }
      let 记录已更新 = false
      try {
        const 新文件内容 = fs.readFileSync(新路径)
        if (预期文件指纹 !== undefined && 计算文件指纹(旧路径, 新文件内容) !== 预期文件指纹) {
          throw 文件冲突错误('原文件已在应用外发生变化')
        }
        原子写入文件(记录路径, JSON.stringify(更新记录, null, 2))
        记录已更新 = true
        fs.unlinkSync(旧路径)
      } catch (操作错误) {
        try {
          if (记录已更新) 原子写入文件(记录路径, JSON.stringify(记录, null, 2))
          fs.unlinkSync(新路径)
        } catch (回退错误) {
          return { 成功: false, 错误: `文件重命名失败且无法完整撤销：${回退错误.message}`, 路径: 新路径 }
        }
        throw 操作错误
      }
      return { 成功: true, 路径: 新路径, 名称: 新文件名, 文件指纹: 读取目标指纹(新路径) }
    } catch (错误) {
      if (错误.code === 'EEXIST') return { 成功: false, 错误: '目标文件已存在' }
      return { 成功: false, 错误: 错误.message || '文件重命名失败' }
    }
  })

  // ---- 在资源管理器中显示文件（WPS「打开所在文件夹」） ----
  ipcMain.handle('file.revealInFolder', async (_event, 路径) => {
    if (typeof 路径 !== 'string' || 路径.length === 0) {
      return { 成功: false, 错误: '缺少文件路径' }
    }
    shell.showItemInFolder(路径)
    return { 成功: true }
  })

  ipcMain.handle('file.readFile', async (_event, filePath) => {
    try {
      if (!filePath) return { 成功: false, 错误: '未指定文件路径' }
      const 缓冲 = fs.readFileSync(filePath)
      const 扩展名 = path.extname(filePath).toLowerCase()
      const 文件指纹 = 计算文件指纹(filePath, 缓冲)
      return 文本扩展名.has(扩展名)
        ? { 成功: true, 内容: 缓冲.toString('utf8'), 二进制: false, 扩展名, 文件指纹 }
        : { 成功: true, 内容: 缓冲.toString('base64'), 二进制: true, 扩展名, 文件指纹 }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '读取文件失败' }
    }
  })
}

module.exports = { 注册文件通道, 内容转缓冲, 保留损坏自动备份, 文本扩展名, 保存过滤器映射, 打开过滤器映射 }
