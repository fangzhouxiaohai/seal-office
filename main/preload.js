const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  showSaveDialog: (默认文件名, 保存类型) => ipcRenderer.invoke('file.showSaveDialog', 默认文件名, 保存类型),
  showOpenDialog: (打开类型) => ipcRenderer.invoke('file.showOpenDialog', 打开类型),
  showOpenDialogMany: (打开类型) => ipcRenderer.invoke('file.showOpenDialogMany', 打开类型),
  takePendingAssociatedFiles: () => ipcRenderer.invoke('file.association.takePending'),
  onAssociatedFilesAvailable: (回调) => {
    const 处理 = () => 回调()
    ipcRenderer.on('file.association.available', 处理)
    return () => ipcRenderer.removeListener('file.association.available', 处理)
  },
  listKnownFolder: (位置) => ipcRenderer.invoke('file.listKnownFolder', 位置),
  saveToFile: (路径, 内容, 格式, 预期文件指纹) => 预期文件指纹 === undefined
    ? ipcRenderer.invoke('file.saveToFile', 路径, 内容, 格式)
    : ipcRenderer.invoke('file.saveToFile', 路径, 内容, 格式, 预期文件指纹),
  readFile: (路径) => ipcRenderer.invoke('file.readFile', 路径),
  renameFile: (旧路径, 新名称, 预期文件指纹) => 预期文件指纹 === undefined
    ? ipcRenderer.invoke('file.rename', 旧路径, 新名称)
    : ipcRenderer.invoke('file.rename', 旧路径, 新名称, 预期文件指纹),
  backupSave: (内容) => ipcRenderer.invoke('file.backup.save', 内容),
  backupLoad: () => ipcRenderer.invoke('file.backup.load'),
  backupPreserve: (已读取内容) => ipcRenderer.invoke('file.backup.preserve', 已读取内容),
  backupClear: () => ipcRenderer.invoke('file.backup.clear'),
  recentList: () => ipcRenderer.invoke('file.recent.list'),
  recentAdd: (条目) => ipcRenderer.invoke('file.recent.add', 条目),
  recentRemove: (路径) => ipcRenderer.invoke('file.recent.remove', 路径),
  revealInFolder: (路径) => ipcRenderer.invoke('file.revealInFolder', 路径),
  exportToPdf: (html, 默认文件名) => ipcRenderer.invoke('pdf.export', html, 默认文件名),
  reportUnsavedCount: (数量) => ipcRenderer.invoke('system.reportUnsavedCount', 数量),
  onCloseStateRequested: (回调) => {
    const 处理 = (_事件, 标识) => { if (typeof 标识 === 'string') 回调(标识) }
    ipcRenderer.on('system.requestCloseState', 处理)
    return () => ipcRenderer.removeListener('system.requestCloseState', 处理)
  },
  respondCloseState: (标识, 状态) => ipcRenderer.invoke('system.respondCloseState', 标识, 状态),
  setDefaultApp: () => ipcRenderer.invoke('system.setDefaultApp'),
  enterSlideshowFullscreen: () => ipcRenderer.invoke('system.enterSlideshowFullscreen'),
  exitSlideshowFullscreen: (标识) => ipcRenderer.invoke('system.exitSlideshowFullscreen', 标识),
  onSlideshowEnded: (回调) => {
    const 处理 = (_事件, 标识) => { if (typeof 标识 === 'string') 回调(标识) }
    ipcRenderer.on('system.slideshowEnded', 处理)
    return () => ipcRenderer.removeListener('system.slideshowEnded', 处理)
  },
  checkIntegrity: () => ipcRenderer.invoke('system.checkIntegrity'),
  getHelpContent: () => ipcRenderer.invoke('help.getContent'),
  getAppInfo: () => ipcRenderer.invoke('app.getInfo'),
  ai: {
    getConfig: () => ipcRenderer.invoke('ai.getConfig'),
    saveConfig: (配置) => ipcRenderer.invoke('ai.saveConfig', 配置),
    clearConfig: () => ipcRenderer.invoke('ai.clearConfig'),
    getSession: (标识) => ipcRenderer.invoke('ai.getSession', 标识),
    clearSession: (标识) => ipcRenderer.invoke('ai.clearSession', 标识),
    updateSessionPlan: (标识, 计划) => ipcRenderer.invoke('ai.updateSessionPlan', 标识, 计划),
    bindSession: (来源, 目标) => ipcRenderer.invoke('ai.bindSession', 来源, 目标),
    discardSessionProposal: (标识) => ipcRenderer.invoke('ai.discardSessionProposal', 标识),
    submitToolResult: (结果) => ipcRenderer.invoke('ai.submitToolResult', 结果),
    onToolCall: (回调) => {
      const 处理 = (_事件, 请求) => {
        if (请求 && typeof 请求.请求标识 === 'string' && typeof 请求.调用标识 === 'string' && 请求.工具 === 'propose_changes') 回调(请求)
      }
      ipcRenderer.on('ai.toolCall', 处理)
      return () => ipcRenderer.removeListener('ai.toolCall', 处理)
    },
    chat: (对话) => ipcRenderer.invoke('ai.chat', 对话),
    cancel: (标识) => ipcRenderer.invoke('ai.cancel', 标识),
    onStream: (回调) => {
      const 处理 = (_事件, 片段) => {
        if (片段 && typeof 片段.请求标识 === 'string' && ['思考', '正文', '状态', '计划', '工具', '压缩'].includes(片段.类型) && typeof 片段.内容 === 'string') 回调(片段)
      }
      ipcRenderer.on('ai.stream', 处理)
      return () => ipcRenderer.removeListener('ai.stream', 处理)
    },
  },
  office: {
    writeDocx: (模型) => ipcRenderer.invoke('office.writeDocx', 模型),
    readDocx: (数据) => ipcRenderer.invoke('office.readDocx', 数据),
    readXlsx: (数据) => ipcRenderer.invoke('office.readXlsx', 数据),
    writeXlsx: (模型) => ipcRenderer.invoke('office.writeXlsx', 模型),
    readPptx: (数据) => ipcRenderer.invoke('office.readPptx', 数据),
    writePptx: (模型) => ipcRenderer.invoke('office.writePptx', 模型),
  },
  pdf: {
    exportToPath: (html, 保存路径) => ipcRenderer.invoke('pdf.exportToPath', html, 保存路径),
    extract: (数据, 页码) => ipcRenderer.invoke('pdf.extract', 数据, 页码),
    merge: (列表) => ipcRenderer.invoke('pdf.merge', 列表),
    delete: (数据, 页码) => ipcRenderer.invoke('pdf.delete', 数据, 页码),
    rotate: (数据, 页码, 角度) => ipcRenderer.invoke('pdf.rotate', 数据, 页码, 角度),
  },
})
