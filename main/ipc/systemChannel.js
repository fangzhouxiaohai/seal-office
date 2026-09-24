const { app } = require('electron')

function 注册系统通道(ipcMain) {
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

module.exports = { 注册系统通道 }
