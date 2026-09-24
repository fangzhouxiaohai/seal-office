const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  showSaveDialog: (默认文件名) => ipcRenderer.invoke('file.showSaveDialog', 默认文件名),
  showOpenDialog: () => ipcRenderer.invoke('file.showOpenDialog'),
  saveToFile: (路径, 内容, 格式) => ipcRenderer.invoke('file.saveToFile', 路径, 内容, 格式),
  readFile: (路径) => ipcRenderer.invoke('file.readFile', 路径),
  exportToPdf: (html, 默认文件名) => ipcRenderer.invoke('pdf.export', html, 默认文件名),
  setDefaultApp: () => ipcRenderer.invoke('system.setDefaultApp'),
  getHelpContent: () => ipcRenderer.invoke('help.getContent'),
  getAppInfo: () => ipcRenderer.invoke('app.getInfo'),
  office: {
    writeDocx: (模型) => ipcRenderer.invoke('office.writeDocx', 模型),
    readDocx: (数据) => ipcRenderer.invoke('office.readDocx', 数据),
    readXlsx: (数据) => ipcRenderer.invoke('office.readXlsx', 数据),
    writeXlsx: (模型) => ipcRenderer.invoke('office.writeXlsx', 模型),
    readPptx: (数据) => ipcRenderer.invoke('office.readPptx', 数据),
    writePptx: (模型) => ipcRenderer.invoke('office.writePptx', 模型),
  },
  pdf: {
    extract: (数据, 页码) => ipcRenderer.invoke('pdf.extract', 数据, 页码),
    merge: (列表) => ipcRenderer.invoke('pdf.merge', 列表),
    delete: (数据, 页码) => ipcRenderer.invoke('pdf.delete', 数据, 页码),
    rotate: (数据, 页码, 角度) => ipcRenderer.invoke('pdf.rotate', 数据, 页码, 角度),
  },
})
