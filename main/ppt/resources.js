const crypto = require('crypto')

const 默认最大单项字节 = 50 * 1024 * 1024
const 默认最大总字节 = 300 * 1024 * 1024

/** 同一会话内按内容指纹保存字节；零引用资源留待撤销历史释放后显式清理。 */
function 创建资源存储(选项 = {}) {
  const 最大单项字节 = 选项.最大单项字节 ?? 默认最大单项字节
  const 最大总字节 = 选项.最大总字节 ?? 默认最大总字节
  if (!Number.isSafeInteger(最大单项字节) || 最大单项字节 <= 0 ||
      !Number.isSafeInteger(最大总字节) || 最大总字节 < 最大单项字节) {
    throw new Error('资源存储大小限制无效')
  }
  const 条目 = new Map()
  let 总字节 = 0
  return {
    加入(数据, 类型) {
      if (!Buffer.isBuffer(数据) || 数据.length === 0) throw new Error('资源内容为空或不是二进制数据')
      if (typeof 类型 !== 'string' || !/^[a-z\d.+-]+\/[a-z\d.+-]+$/i.test(类型)) throw new Error('资源媒体类型无效')
      if (数据.length > 最大单项字节) throw new Error(`资源超过单项大小限制：${数据.length} 字节`)
      const 标识 = crypto.createHash('sha256').update(数据).digest('hex')
      const 已有 = 条目.get(标识)
      if (已有) {
        if (已有.类型 !== 类型) throw new Error('相同内容的资源媒体类型不一致')
        已有.引用次数 += 1
        return 标识
      }
      if (总字节 + 数据.length > 最大总字节) throw new Error('资源超过文稿总大小限制')
      条目.set(标识, { 数据: Buffer.from(数据), 类型, 引用次数: 1 })
      总字节 += 数据.length
      return 标识
    },
    读取(标识) {
      const 资源 = 条目.get(标识)
      if (!资源) throw new Error(`资源不存在：${标识}`)
      return Buffer.from(资源.数据)
    },
    增加引用(标识) {
      const 资源 = 条目.get(标识)
      if (!资源) throw new Error(`资源不存在：${标识}`)
      资源.引用次数 += 1
    },
    解除引用(标识) {
      const 资源 = 条目.get(标识)
      if (!资源) throw new Error(`资源不存在：${标识}`)
      if (资源.引用次数 === 0) throw new Error(`资源引用已为零：${标识}`)
      资源.引用次数 -= 1
    },
    清理未引用() {
      for (const [标识, 资源] of 条目) {
        if (资源.引用次数 === 0) {
          条目.delete(标识)
          总字节 -= 资源.数据.length
        }
      }
    },
    列表() {
      return Array.from(条目, ([标识, 资源]) => ({ 标识, 类型: 资源.类型, 字节数: 资源.数据.length, 引用次数: 资源.引用次数 }))
    },
  }
}

module.exports = { 创建资源存储 }
