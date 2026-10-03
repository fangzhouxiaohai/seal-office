const { app, BrowserWindow } = require('electron')

const 未保存风险数量 = new WeakMap()

function 获取未保存风险数量(窗口) {
  return 未保存风险数量.get(窗口) ?? 0
}

function 注册系统通道(ipcMain) {
  ipcMain.handle('system.reportUnsavedCount', async (事件, 数量) => {
    if (!Number.isSafeInteger(数量) || 数量 < 0) {
      return { 成功: false, 错误: '未保存文档数量无效' }
    }
    const 窗口 = BrowserWindow.fromWebContents(事件?.sender)
    if (!窗口 || 窗口.isDestroyed?.()) {
      return { 成功: false, 错误: '无法确定当前窗口' }
    }
    未保存风险数量.set(窗口, 数量)
    return { 成功: true }
  })
  ipcMain.handle('system.setDefaultApp', async () => ({
    成功: false,
    需要管理员权限: true,
    提示: '请在系统设置中将海豹办公设为默认办公软件',
  }))
  ipcMain.handle('help.getContent', async () => ({
    入门指南: '您可以从首页新建或打开办公文档。',
    文档编辑: '使用顶部功能区编辑文字、表格与演示文稿。',
    文件保存: '首次保存会选择路径，之后可直接使用保存命令。',
    PDF导出: '在文件菜单中选择导出为 PDF。',
  }))
  ipcMain.handle('app.getInfo', async () => ({
    名称: '海豹办公', 英文名称: 'Seal Office', 版本: app.getVersion(), 作者: '饮风一笑',
    邮箱: '24519660@qq.com', 说明: '本程序永久免费开源',
    开源地址: 'https://github.com/seal-office/seal-office', 专业服务: '专业应用开发服务',
  }))
}

module.exports = { 注册系统通道, 获取未保存风险数量 }
