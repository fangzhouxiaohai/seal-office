// xlsx 保存守护：写盘前在内存保留原文件字节，写盘后从磁盘重新读取做回读校验；
// 用户选择“另存为副本”时把原文件恢复为保存前的字节。只报告差异，不自动删除或改写已保存文件。
const fs = require('fs')
const path = require('path')
const { createHash, randomUUID } = require('crypto')
const { 校验xlsx回读 } = require('./xlsxVerify')

/** 单个快照的字节上限；超过时不保留旧字节，回滚时如实告知。 */
const 单快照字节上限 = 200 * 1024 * 1024

const 摘要 = (字节) => createHash('sha256').update(字节).digest('hex')

function 读取或空(路径) {
  try {
    return fs.readFileSync(路径)
  } catch (错误) {
    if (错误.code === 'ENOENT') return null
    throw 错误
  }
}

function 原子写入(目标, 内容) {
  const 临时 = path.join(path.dirname(目标), `.${path.basename(目标)}.${process.pid}.${randomUUID()}.restore.tmp`)
  try {
    fs.writeFileSync(临时, 内容, { flag: 'wx' })
    fs.renameSync(临时, 目标)
  } catch (错误) {
    if (fs.existsSync(临时)) fs.unlinkSync(临时)
    throw 错误
  }
}

function 创建xlsx保存守护({ 上限 = 4 } = {}) {
  const 快照表 = new Map()

  const 取快照 = (标识) => {
    const 快照 = typeof 标识 === 'string' ? 快照表.get(标识) : undefined
    if (!快照) throw new Error('保存快照已失效，请重新保存后再试')
    return 快照
  }

  /** 写盘前调用：保留目标路径当前字节（不存在则记为无原文件）。 */
  function 保留快照(目标路径) {
    if (typeof 目标路径 !== 'string' || !目标路径 || !/\.xlsx$/i.test(目标路径)) throw new Error('只能为 XLSX 文件保留保存快照')
    const 路径 = path.resolve(目标路径)
    let 原字节 = 读取或空(路径)
    let 超出上限 = false
    if (原字节 && 原字节.length > 单快照字节上限) { 原字节 = null; 超出上限 = true }
    const 标识 = randomUUID()
    快照表.set(标识, { 路径, 原字节, 超出上限, 校验后摘要: null })
    while (快照表.size > 上限) 快照表.delete(快照表.keys().next().value)
    return { 标识, 有原文件: 原字节 !== null }
  }

  /** 写盘后调用：从磁盘重新读取文件并与保存模型比对。 */
  async function 校验(标识, 期望模型) {
    const 快照 = 取快照(标识)
    const 磁盘字节 = 读取或空(快照.路径)
    if (!磁盘字节) throw new Error('保存后的文件不存在，无法完成回读校验')
    快照.校验后摘要 = 摘要(磁盘字节)
    return 校验xlsx回读(磁盘字节, 期望模型)
  }

  /** 把原文件恢复为保存前字节；文件在校验后又被修改时拒绝，避免覆盖他人改动。 */
  function 恢复原文件(标识) {
    const 快照 = 取快照(标识)
    if (快照.超出上限) throw new Error('原文件过大，保存前未保留副本，无法恢复原文件')
    if (!快照.原字节) throw new Error('保存前该位置没有文件，无法恢复原文件')
    const 当前 = 读取或空(快照.路径)
    if (快照.校验后摘要 && (!当前 || 摘要(当前) !== 快照.校验后摘要)) throw new Error('文件已在保存后被修改，无法恢复原文件')
    原子写入(快照.路径, 快照.原字节)
    快照表.delete(标识)
    return { 已恢复: true }
  }

  function 释放(标识) {
    快照表.delete(标识)
  }

  return { 保留快照, 校验, 恢复原文件, 释放 }
}

module.exports = { 创建xlsx保存守护 }
