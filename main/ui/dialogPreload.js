const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('应用弹窗', {
  读取: () => ipcRenderer.invoke('appDialog.get'),
  选择: (选择) => ipcRenderer.invoke('appDialog.choose', 选择),
})
