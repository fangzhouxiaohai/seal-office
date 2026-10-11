const fs = require('fs')
const path = require('path')
function 定位兼容引擎({ 平台 = process.platform, 根目录 }) {
  if (平台 === 'win32') {
    const 文件 = path.join(根目录, 'office-runtime', 'program', 'soffice.com')
    if (!fs.existsSync(文件)) throw new Error('文档兼容引擎缺失，请重新安装完整 Windows 版。手机端请在设置中心配置文档转换服务。')
    return 文件
  }
  if (平台 === 'linux') {
    for (const 文件 of ['/usr/bin/libreoffice', '/usr/bin/soffice']) {
      try { fs.accessSync(文件, fs.constants.X_OK); return 文件 } catch { /* 检查下一个标准安装路径 */ }
    }
    throw new Error('文档兼容引擎缺失，请安装 libreoffice-writer、libreoffice-calc、libreoffice-impress 后重试')
  }
  throw new Error('当前桌面系统尚未配置文档兼容引擎')
}
// Ubuntu LTS keeps older LibreOffice releases. These export filter names remain
// available there, whereas the newer OOXML template filters arrived later.
function 选择兼容过滤器(过滤器, 平台 = process.platform) {
  if (平台 !== 'linux') return 过滤器
  return {
    'Office Open XML Text Template': 'MS Word 2007 XML Template',
    'Calc Office Open XML Template': 'Calc MS Excel 2007 XML Template',
    'Impress Office Open XML Template': 'Impress MS PowerPoint 2007 XML Template',
    'Impress Office Open XML AutoPlay': 'Impress MS PowerPoint 2007 XML AutoPlay',
  }[过滤器] || 过滤器
}
module.exports = { 定位兼容引擎, 选择兼容过滤器 }
