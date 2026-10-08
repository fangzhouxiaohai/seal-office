const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  cloud: { invoke: (action, input) => ipcRenderer.invoke('cloud.invoke', action, input) },
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
  presentationResources: {
    add: (数据, 类型) => ipcRenderer.invoke('presentation.resource.add', 数据, 类型),
    read: (标识) => ipcRenderer.invoke('presentation.resource.read', 标识),
    dropTemporary: (标识) => ipcRenderer.invoke('presentation.resource.dropTemporary', 标识),
    sync: (快照标识, 引用标识列表) => ipcRenderer.invoke('presentation.resource.sync', 快照标识, 引用标识列表),
    release: (快照标识) => ipcRenderer.invoke('presentation.resource.release', 快照标识),
    export: (标识列表) => ipcRenderer.invoke('presentation.resource.export', 标识列表),
    restore: (条目列表) => ipcRenderer.invoke('presentation.resource.restore', 条目列表),
  },
  presentationExport: {
    run: (请求) => ipcRenderer.invoke('presentation.export.run', 请求),
    pickDirectory: () => ipcRenderer.invoke('presentation.export.pickDirectory'),
  },
  presentationCompare: {
    compareFiles: (左路径, 右路径) => ipcRenderer.invoke('presentation.compareFiles', 左路径, 右路径),
  },
  presentationCapture: {
    sources: (类型列表) => ipcRenderer.invoke('presentation.capture.sources', 类型列表),
    support: () => ipcRenderer.invoke('presentation.recording.support'),
    saveRecording: (数据, 格式, 建议名) => ipcRenderer.invoke('presentation.recording.save', 数据, 格式, 建议名),
    recognitionStatus: () => ipcRenderer.invoke('presentation.recognition.status'),
    recognize: (数据, 类型) => ipcRenderer.invoke('presentation.recognition.recognize', 数据, 类型),
  },
  presentationSession: {
    register: (文稿标识, 视图标识, 初始内容, 路径) => ipcRenderer.invoke('presentation.session.register', 文稿标识, 视图标识, 初始内容, 路径),
    read: (文稿标识) => ipcRenderer.invoke('presentation.session.read', 文稿标识),
    commit: (文稿标识, 期望版本, 内容, 视图标识) => ipcRenderer.invoke('presentation.session.commit', 文稿标识, 期望版本, 内容, 视图标识),
    saved: (文稿标识, 路径, 视图标识) => ipcRenderer.invoke('presentation.session.saved', 文稿标识, 路径, 视图标识),
    claimPath: (文稿标识, 路径) => ipcRenderer.invoke('presentation.session.claimPath', 文稿标识, 路径),
    releasePath: (文稿标识, 路径) => ipcRenderer.invoke('presentation.session.releasePath', 文稿标识, 路径),
    unregister: (文稿标识, 视图标识) => ipcRenderer.invoke('presentation.session.unregister', 文稿标识, 视图标识),
    onChanged: (回调) => {
      const 处理 = (_事件, 消息) => { if (消息 && typeof 消息 === 'object') 回调(消息) }
      ipcRenderer.on('system.presentationSessionChanged', 处理)
      return () => ipcRenderer.removeListener('system.presentationSessionChanged', 处理)
    },
    identity: () => ipcRenderer.invoke('system.presentationSessionIdentity'),
  },
  presentationBatch: {
    check: (任务列表) => ipcRenderer.invoke('presentation.batchCheck', 任务列表),
  },
  presentationTools: {
    writeResources: (条目列表, 目录) => ipcRenderer.invoke('presentation.tools.writeResources', 条目列表, 目录),
    compressImage: (输入, 选项) => ipcRenderer.invoke('presentation.tools.compressImage', 输入, 选项),
  },
  newPresentationWindow: (文稿标识, 视图标识) => ipcRenderer.invoke('system.newPresentationWindow', 文稿标识, 视图标识),
  tilePresentationWindows: (布局) => ipcRenderer.invoke('system.tilePresentationWindows', 布局),
  recentList: () => ipcRenderer.invoke('file.recent.list'),
  recentAdd: (条目) => ipcRenderer.invoke('file.recent.add', 条目),
  recentRemove: (路径) => ipcRenderer.invoke('file.recent.remove', 路径),
  revealInFolder: (路径) => ipcRenderer.invoke('file.revealInFolder', 路径),
  exportToPdf: (html, 默认文件名) => ipcRenderer.invoke('pdf.export', html, 默认文件名),
  printDocument: (内容, 格式) => ipcRenderer.invoke('document.print', 内容, 格式),
  printPreview: (内容, 格式) => ipcRenderer.invoke('document.printPreview', 内容, 格式),
  reportUnsavedCount: (数量) => ipcRenderer.invoke('system.reportUnsavedCount', 数量),
  onCloseStateRequested: (回调) => {
    const 处理 = (_事件, 标识) => { if (typeof 标识 === 'string') 回调(标识) }
    ipcRenderer.on('system.requestCloseState', 处理)
    return () => ipcRenderer.removeListener('system.requestCloseState', 处理)
  },
  respondCloseState: (标识, 状态) => ipcRenderer.invoke('system.respondCloseState', 标识, 状态),
  onSaveAllRequested: (回调) => {
    const 处理 = (_事件, 标识) => { if (typeof 标识 === 'string') 回调(标识) }
    ipcRenderer.on('system.requestSaveAll', 处理)
    return () => ipcRenderer.removeListener('system.requestSaveAll', 处理)
  },
  respondSaveAll: (标识, 结果) => ipcRenderer.invoke('system.respondSaveAll', 标识, 结果),
  setDefaultApp: () => ipcRenderer.invoke('system.setDefaultApp'),
  applyDefaultApp: () => ipcRenderer.invoke('system.applyDefaultApp'),
  checkDefaultAppOnStartup: () => ipcRenderer.invoke('system.checkDefaultAppOnStartup'),
  defaultAppCheckState: () => ipcRenderer.invoke('system.defaultAppCheckState'),
  checkDefaultAppPrompt: () => ipcRenderer.invoke('system.checkDefaultAppPrompt'),
  enterSlideshowFullscreen: () => ipcRenderer.invoke('system.enterSlideshowFullscreen'),
  exitSlideshowFullscreen: (标识) => ipcRenderer.invoke('system.exitSlideshowFullscreen', 标识),
  onSlideshowEnded: (回调) => {
    const 处理 = (_事件, 标识) => { if (typeof 标识 === 'string') 回调(标识) }
    ipcRenderer.on('system.slideshowEnded', 处理)
    return () => ipcRenderer.removeListener('system.slideshowEnded', 处理)
  },
  presenter: {
    screens: () => ipcRenderer.invoke('system.presenter.screens'),
    open: (选项) => ipcRenderer.invoke('system.presenter.open', 选项),
    update: (会话标识, 数据) => ipcRenderer.invoke('system.presenter.update', 会话标识, 数据),
    close: (会话标识) => ipcRenderer.invoke('system.presenter.close', 会话标识),
    control: (会话标识, 动作) => ipcRenderer.invoke('system.presenter.control', 会话标识, 动作),
    state: () => ipcRenderer.invoke('system.presenter.state'),
    onUpdate: (回调) => {
      const 处理 = (_事件, 数据) => { if (数据 && typeof 数据 === 'object') 回调(数据) }
      ipcRenderer.on('system.presenterState', 处理)
      return () => ipcRenderer.removeListener('system.presenterState', 处理)
    },
    onControl: (回调) => {
      const 处理 = (_事件, 数据) => { if (数据 && typeof 数据.会话标识 === 'string' && typeof 数据.动作 === 'string') 回调(数据) }
      ipcRenderer.on('system.presenterControl', 处理)
      return () => ipcRenderer.removeListener('system.presenterControl', 处理)
    },
    onClosed: (回调) => {
      const 处理 = (_事件, 数据) => { if (数据 && typeof 数据.会话标识 === 'string' && typeof 数据.原因 === 'string') 回调(数据) }
      ipcRenderer.on('system.presenterClosed', 处理)
      return () => ipcRenderer.removeListener('system.presenterClosed', 处理)
    },
    onDisplayChanged: (回调) => {
      const 处理 = (_事件, 数据) => { if (数据 && typeof 数据.会话标识 === 'string' && typeof 数据.原因 === 'string') 回调(数据) }
      ipcRenderer.on('system.presenterDisplayChanged', 处理)
      return () => ipcRenderer.removeListener('system.presenterDisplayChanged', 处理)
    },
  },
  checkIntegrity: () => ipcRenderer.invoke('system.checkIntegrity'),
  openExternal: (地址) => ipcRenderer.invoke('system.openExternal', 地址),
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
  presentationAi: {
    capabilities: () => ipcRenderer.invoke('presentation.ai.capabilities'),
    getService: (种类) => ipcRenderer.invoke('presentation.ai.getService', 种类),
    saveService: (种类, 配置) => ipcRenderer.invoke('presentation.ai.saveService', 种类, 配置),
    clearService: (种类) => ipcRenderer.invoke('presentation.ai.clearService', 种类),
    listServiceKinds: () => ipcRenderer.invoke('presentation.ai.listServiceKinds'),
    migrateLegacyTranslate: (旧配置) => ipcRenderer.invoke('presentation.ai.migrateLegacyTranslate', 旧配置),
    probeService: (种类, 配置) => ipcRenderer.invoke('presentation.ai.probeService', 种类, 配置),
    translate: (输入) => ipcRenderer.invoke('presentation.ai.translate', 输入),
    proofread: (输入) => ipcRenderer.invoke('presentation.ai.proofread', 输入),
    validateTranslation: (候选, 当前条目) => ipcRenderer.invoke('presentation.ai.validateTranslation', 候选, 当前条目),
    validateSuggestion: (建议, 当前条目) => ipcRenderer.invoke('presentation.ai.validateSuggestion', 建议, 当前条目),
    voices: () => ipcRenderer.invoke('presentation.ai.voices'),
    speak: (输入) => ipcRenderer.invoke('presentation.ai.speak', 输入),
    generateScript: (输入) => ipcRenderer.invoke('presentation.ai.generateScript', 输入),
    narrate: (输入) => ipcRenderer.invoke('presentation.ai.narrate', 输入),
    clearAudioCache: () => ipcRenderer.invoke('presentation.ai.clearAudioCache'),
    onStream: (回调) => {
      const 处理 = (_事件, 片段) => {
        if (片段 && typeof 片段.请求标识 === 'string' && 片段.类型 === '状态' && typeof 片段.内容 === 'string') 回调(片段)
      }
      ipcRenderer.on('presentation.ai.stream', 处理)
      return () => ipcRenderer.removeListener('presentation.ai.stream', 处理)
    },
  },
  presentationGeneration: {
    outline: (输入) => ipcRenderer.invoke('presentation.generate.outline', 输入),
    pages: (输入) => ipcRenderer.invoke('presentation.generate.pages', 输入),
    singlePage: (输入) => ipcRenderer.invoke('presentation.generate.singlePage', 输入),
    beautify: (输入) => ipcRenderer.invoke('presentation.generate.beautify', 输入),
    diagram: (输入) => ipcRenderer.invoke('presentation.generate.diagram', 输入),
    validateCandidates: (候选, 当前页面列表, 版本表) => ipcRenderer.invoke('presentation.generate.validateCandidates', 候选, 当前页面列表, 版本表),
    readOutline: (输入) => ipcRenderer.invoke('presentation.generate.readOutline', 输入),
    assets: {
      list: () => ipcRenderer.invoke('presentation.assets.list'),
      search: (关键词) => ipcRenderer.invoke('presentation.assets.search', 关键词),
      read: (标识) => ipcRenderer.invoke('presentation.assets.read', 标识),
      import: (输入) => ipcRenderer.invoke('presentation.assets.import', 输入),
      updateMeta: (标识, 修改) => ipcRenderer.invoke('presentation.assets.updateMeta', 标识, 修改),
      remove: (标识) => ipcRenderer.invoke('presentation.assets.remove', 标识),
      semanticSearch: (输入) => ipcRenderer.invoke('presentation.assets.semanticSearch', 输入),
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
    insertBlank: (数据, 位置) => ipcRenderer.invoke('pdf.insertBlank', 数据, 位置),
    insertPages: (数据, 插入数据, 页码, 位置) => ipcRenderer.invoke('pdf.insertPages', 数据, 插入数据, 页码, 位置),
    editPage: (数据, 操作) => ipcRenderer.invoke('pdf.editPage', 数据, 操作),
  },
})
