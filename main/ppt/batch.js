// 演示批量工具：逐文件独立结果、失败隔离、可取消并保留可恢复状态。
// 主进程只负责文件级操作（结构/资源检查与写盘编排）；逐页渲染仍走渲染端的统一渲染链路。
const fs = require('fs')
const { 读取pptx } = require('../office/pptxCodec')

const 有效任务标识 = (任务) => typeof 任务?.标识 === 'string' && 任务.标识.trim().length > 0

/**
 * 顺序执行批量任务：单项失败只影响该项，取消后保留已完成结果并把剩余项标记为已取消。
 * @param 任务列表 [{ 标识, 名称, 路径, 参数? }]
 * @param 操作 async (任务, 上下文) => 结果对象
 * @param 选项 { 已取消?: () => boolean, 并发?: number }
 */
async function 执行批量任务(任务列表, 操作, 选项 = {}) {
  if (!Array.isArray(任务列表)) throw new Error('批量任务列表无效：需要任务数组')
  if (typeof 操作 !== 'function') throw new Error('批量操作无效：需要可执行函数')
  if (任务列表.some(项 => !有效任务标识(项))) throw new Error('批量任务标识无效：每项都需要非空标识')
  const 已取消 = 选项.已取消 ?? (() => false)
  const 结果 = []
  let 已请求取消 = false
  for (const 项 of 任务列表) {
    if (已请求取消 || 已取消()) {
      结果.push({ 标识: 项.标识, 名称: 项.名称, 路径: 项.路径, 成功: false, 已取消: true })
      continue
    }
    try {
      const 输出 = await 操作(项, { 已取消 })
      结果.push({ 标识: 项.标识, 名称: 项.名称, 路径: 项.路径, 成功: true, ...(输出 ?? {}) })
    } catch (错误) {
      结果.push({ 标识: 项.标识, 名称: 项.名称, 路径: 项.路径, 成功: false, 错误: 错误 instanceof Error ? 错误.message : '批量操作失败' })
    }
    if (已取消()) 已请求取消 = true
  }
  const 汇总 = {
    总数: 结果.length,
    成功: 结果.filter(项 => 项.成功).length,
    失败: 结果.filter(项 => !项.成功 && !项.已取消).length,
    已取消: 结果.filter(项 => 项.已取消).length,
  }
  return { 结果, 汇总 }
}

/** 检查单份演示文稿：结构可读、页面数量与导入警告；缺失资源与损坏文件报告真实原因 */
async function 检查演示文件(路径, 依赖 = {}) {
  const 读取文件 = 依赖.读取文件 ?? (文件路径 => fs.promises.readFile(文件路径))
  const 解析 = 依赖.读取pptx ?? 读取pptx
  if (typeof 路径 !== 'string' || 路径.trim().length === 0) return { 成功: false, 错误: '演示文稿文件路径无效' }
  let 字节
  try {
    字节 = await 读取文件(路径)
  } catch (错误) {
    return { 成功: false, 错误: `无法读取文件：${错误 instanceof Error ? 错误.message : '未知原因'}` }
  }
  let 读取结果
  try {
    读取结果 = await 解析(字节)
  } catch (错误) {
    return { 成功: false, 错误: `无法解析演示文稿：${错误 instanceof Error ? 错误.message : '未知原因'}` }
  }
  const 幻灯片列表 = 读取结果.演示文稿?.幻灯片列表 ?? []
  const 资源索引 = 读取结果.演示文稿?.资源索引 ?? {}
  const 缺失资源 = []
  for (const [页序, 页] of 幻灯片列表.entries()) {
    for (const 对象 of 页.对象列表 ?? []) {
      if (对象.资源标识 && !Object.prototype.hasOwnProperty.call(资源索引, 对象.资源标识)) {
        缺失资源.push({ 页: 页序 + 1, 对象: 对象.id })
      }
    }
  }
  const 警告 = [...(读取结果.警告 ?? []), ...(缺失资源.length ? [`有 ${缺失资源.length} 个对象引用的资源缺失`] : [])]
  return { 成功: true, 页数: 幻灯片列表.length, 资源数: Object.keys(资源索引).length, 缺失资源, 警告 }
}

/** 批量检查：逐文件独立结果，单项失败不影响其他文件 */
async function 批量检查(任务列表, 依赖 = {}) {
  return await 执行批量任务(任务列表, async (项) => {
    const 检查 = await 检查演示文件(项.路径, 依赖)
    if (!检查.成功) throw new Error(检查.错误)
    return { 页数: 检查.页数, 资源数: 检查.资源数, 警告: 检查.警告 }
  }, 依赖.选项 ?? {})
}

module.exports = { 执行批量任务, 检查演示文件, 批量检查 }
