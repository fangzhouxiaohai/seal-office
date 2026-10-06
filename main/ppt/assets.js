// 本地素材库：本机分类、浏览、导入、检索、预览、删除，并记录来源与授权。
// 图库条目与文稿引用的资源字节相互独立：删除图库条目不破坏已被文稿引用的资源。
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const 素材分类 = ['图标', '背景', '图片', '图示', '其他']
const 类型扩展名 = { 'image/png': 'png', 'image/jpeg': 'jpg' }
const 名称上限 = 120
const 来源上限 = 120
const 授权上限 = 200
const 单条字节上限 = 50 * 1024 * 1024
const 索引文件名 = '素材索引.json'

const 是记录 = (值) => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)
const 非空文本 = (值, 上限) => typeof 值 === 'string' && 值.trim().length > 0 && 值.length <= 上限

function 校验导入入参({ 字节, 类型, 名称, 分类, 来源, 授权 }) {
  if (!Buffer.isBuffer(字节) || 字节.length === 0) throw new Error('素材字节无效：不能为空')
  if (字节.length > 单条字节上限) throw new Error(`素材过大：单项最多 ${Math.round(单条字节上限 / 1024 / 1024)} MB`)
  if (!类型扩展名[类型]) throw new Error(`素材类型无效：只支持 ${Object.keys(类型扩展名).join('、')}`)
  if (!非空文本(名称, 名称上限)) throw new Error(`素材名称无效或过长（最多 ${名称上限} 字）`)
  if (!素材分类.includes(分类)) throw new Error(`素材分类无效：只支持 ${素材分类.join('、')}`)
  if (来源 !== undefined && 来源 !== '' && !非空文本(来源, 来源上限)) throw new Error(`素材来源无效或过长（最多 ${来源上限} 字）`)
  if (!非空文本(授权, 授权上限)) throw new Error(`必须填写素材授权信息（最多 ${授权上限} 字）`)
}

function 指纹(字节) {
  return crypto.createHash('sha256').update(字节).digest('hex')
}

/** 创建本地素材库；根目录不存在时自动建立。 */
function 创建素材库({ 根目录, 存储 = fs.promises, 时钟 = () => new Date().toISOString() } = {}) {
  if (typeof 根目录 !== 'string' || !根目录.trim()) throw new Error('素材库根目录无效')
  const 索引路径 = path.join(根目录, 索引文件名)

  const 确保目录 = () => 存储.mkdir(根目录, { recursive: true })

  async function 读索引() {
    try {
      const 文本 = await 存储.readFile(索引路径, 'utf8')
      let 数据
      try { 数据 = JSON.parse(文本) } catch { throw new Error(`素材索引损坏：${索引文件名} 不是有效的 JSON`) }
      if (!是记录(数据) || !Array.isArray(数据.素材)) throw new Error(`素材索引损坏：${索引文件名} 结构无效`)
      return 数据.素材
    } catch (错误) {
      if (错误 && 错误.code === 'ENOENT') return []
      throw 错误
    }
  }

  async function 写索引(素材列表) {
    await 确保目录()
    const 临时 = `${索引路径}.tmp`
    await 存储.writeFile(临时, JSON.stringify({ 版本: 1, 素材: 素材列表 }, null, 2), 'utf8')
    await 存储.rename(临时, 索引路径)
  }

  const 文件路径 = (素材) => path.join(根目录, `${素材.标识}.${类型扩展名[素材.类型] ?? 'bin'}`)

  return {
    async 导入({ 字节, 类型, 名称, 分类, 来源, 授权 }) {
      校验导入入参({ 字节, 类型, 名称, 分类, 来源, 授权 })
      const 标识 = 指纹(字节)
      const 已有 = (await 读索引()).find((项) => 项.标识 === 标识)
      if (已有) return { 素材: 已有, 去重: true }
      const 素材 = {
        标识, 名称: 名称.trim(), 分类, 类型, 字节数: 字节.length,
        ...(来源 && 来源.trim() ? { 来源: 来源.trim() } : {}),
        授权: 授权.trim(), 导入时间: 时钟(),
      }
      await 确保目录()
      await 存储.writeFile(文件路径(素材), 字节)
      const 列表 = await 读索引()
      await 写索引([素材, ...列表])
      return { 素材, 去重: false }
    },

    async 列出() {
      const 列表 = await 读索引()
      return [...列表].sort((甲, 乙) => String(乙.导入时间).localeCompare(String(甲.导入时间)))
    },

    async 检索(关键词) {
      if (typeof 关键词 !== 'string') throw new Error('检索关键词无效')
      const 词 = 关键词.trim().toLowerCase()
      if (!词) return await this.列出()
      const 列表 = await this.列出()
      return 列表.filter((项) => [项.名称, 项.分类, 项.来源 ?? '', 项.授权].some((字段) => String(字段).toLowerCase().includes(词)))
    },

    async 读取(标识) {
      const 素材 = (await 读索引()).find((项) => 项.标识 === 标识)
      if (!素材) throw new Error(`素材不存在：${标识}`)
      try { return await 存储.readFile(文件路径(素材)) }
      catch (错误) {
        if (错误 && 错误.code === 'ENOENT') throw new Error(`素材文件缺失：${素材.名称}`)
        throw 错误
      }
    },

    async 更新元数据(标识, 修改) {
      if (!是记录(修改)) throw new Error('素材元数据无效')
      const 列表 = await 读索引()
      const 下标 = 列表.findIndex((项) => 项.标识 === 标识)
      if (下标 < 0) throw new Error(`素材不存在：${标识}`)
      const 原 = 列表[下标]
      const 新名称 = 修改.名称 === undefined ? 原.名称 : 修改.名称
      const 新分类 = 修改.分类 === undefined ? 原.分类 : 修改.分类
      const 新来源 = 修改.来源 === undefined ? 原.来源 : 修改.来源
      const 新授权 = 修改.授权 === undefined ? 原.授权 : 修改.授权
      if (!非空文本(新名称, 名称上限)) throw new Error(`素材名称无效或过长（最多 ${名称上限} 字）`)
      if (!素材分类.includes(新分类)) throw new Error(`素材分类无效：只支持 ${素材分类.join('、')}`)
      if (新来源 !== undefined && 新来源 !== '' && !非空文本(新来源, 来源上限)) throw new Error(`素材来源无效或过长（最多 ${来源上限} 字）`)
      if (!非空文本(新授权, 授权上限)) throw new Error(`必须填写素材授权信息（最多 ${授权上限} 字）`)
      const 更新后 = { ...原, 名称: 新名称.trim(), 分类: 新分类, ...(新来源 ? { 来源: String(新来源).trim() } : {}), 授权: 新授权.trim() }
      if (!新来源) delete 更新后.来源
      const 新列表 = [...列表]
      新列表[下标] = 更新后
      await 写索引(新列表)
      return { 素材: 更新后 }
    },

    /** 删除图库条目：只移除本图库的索引与副本，不触碰文稿引用的资源字节。 */
    async 删除(标识) {
      const 列表 = await 读索引()
      const 素材 = 列表.find((项) => 项.标识 === 标识)
      if (!素材) throw new Error(`素材不存在：${标识}`)
      await 写索引(列表.filter((项) => 项.标识 !== 标识))
      await 存储.rm(文件路径(素材), { force: true })
      return { 已删除: true, 文稿引用仍需由资源存储维护: true }
    },
  }
}

module.exports = { 创建素材库, 素材分类, 类型扩展名 }
