const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const 文件类型 = Object.freeze({ word: '文字', table: '表格', ppt: '演示', pdf: 'PDF' })

/** 校验供系统读取的外置副本；便携版必须保存到退出后仍存在的目录。 */
async function 准备关联文件图标({ 资源目录, 数据目录, 便携版 = false }) {
  const 外置目录 = path.join(资源目录, 'file-icons')
  const 资源 = []
  for (const [名称, 说明] of Object.entries(文件类型)) {
    const 文件名 = 名称 + '.ico'
    let 原始, 外置
    try {
      原始 = await fs.promises.readFile(path.join(__dirname, 'file-icons', 文件名))
      外置 = await fs.promises.readFile(path.join(外置目录, 文件名))
    } catch { throw new Error(`${说明}文件图标已缺失或修改，请重新安装可信版本`) }
    if (!原始.equals(外置)) throw new Error(`${说明}文件图标已缺失或修改，请重新安装可信版本`)
    资源.push({ 文件名, 内容: 原始 })
  }
  if (!便携版) return 外置目录
  if (typeof 数据目录 !== 'string' || !path.isAbsolute(数据目录)) throw new Error('文件图标的持久保存目录无效')
  const 目录 = path.join(数据目录, 'file-icons')
  try {
    await fs.promises.mkdir(目录, { recursive: true })
    for (const { 文件名, 内容 } of 资源) {
      const 目标 = path.join(目录, 文件名)
      let 现有
      try { 现有 = await fs.promises.readFile(目标) }
      catch (错误) { if (错误.code !== 'ENOENT') throw 错误 }
      if (现有?.equals(内容)) continue
      const 临时 = `${目标}.${randomUUID()}.tmp`
      try {
        await fs.promises.writeFile(临时, 内容, { flag: 'wx' })
        await fs.promises.rename(临时, 目标)
      } finally { await fs.promises.unlink(临时).catch(错误 => { if (错误.code !== 'ENOENT') throw 错误 }) }
    }
  } catch (错误) { throw new Error(`文件图标无法保存，请检查存储空间和目录权限：${错误.message}`) }
  return 目录
}

module.exports = { 准备关联文件图标 }
