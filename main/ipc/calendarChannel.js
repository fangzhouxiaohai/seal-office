const { Notification, BrowserWindow } = require('electron')

function registerCalendar(ipcMain) {
  let pending = [], timer
  const arm = () => {
    clearTimeout(timer)
    const now = Date.now()
    while (pending.length && pending[0].at <= now) {
      const item = pending.shift()
      const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && !w.webContents.isDestroyed() && w.webContents.getURL().includes('index.html')) ?? BrowserWindow.getAllWindows()[0]
      if (Notification.isSupported()) new Notification({ title: item.title, body: item.time, silent: !!win }).show()
      win?.webContents.send('calendar.due', item)
    }
    if (pending.length) timer = setTimeout(arm, Math.max(1, Math.min(2147483647, pending[0].at - now)))
  }
  ipcMain.handle('calendar.sync', (_event, items) => {
    if (!Array.isArray(items) || items.length > 5000) throw new Error('日程列表无效')
    const now = Date.now()
    pending = items.filter(e => e && typeof e.title === 'string' && typeof e.id === 'string' && ['bell','double','mallet'].includes(e.tone) && Number.isSafeInteger(e.at) && e.at > now).sort((a,b) => a.at-b.at)
    arm()
    return Notification.isSupported() ? '应用运行或最小化时通过系统通知提醒' : '应用运行时显示日程提醒'
  })
}
module.exports = { registerCalendar }
