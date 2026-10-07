const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('应用弹窗', {
  读取: () => ipcRenderer.invoke('appDialog.get'),
  选择: (选择) => ipcRenderer.invoke('appDialog.choose', 选择),
  // 内容渲染完成后把实际需要的高度交给主进程，弹窗按内容收缩，不再留大片空白
  适配高度: (高度) => ipcRenderer.invoke('appDialog.fit', 高度),
})
