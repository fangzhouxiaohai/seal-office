// 只切换云服务版本指针；管理后台、Nginx 配置及业务数据不在本次操作范围。
async function switchBackend(previous, candidate, ops) {
  if (!previous || !candidate || previous === candidate) throw new Error('云服务版本路径无效')
  if (ops.current() !== previous) throw new Error('云服务指针已变化，拒绝切换')
  try {
    ops.switchTo(candidate)
    ops.restart()
    await ops.verify()
  } catch (error) {
    try {
      const now = ops.current()
      if (now === candidate) {
        ops.switchTo(previous)
        ops.restart()
        await ops.verify()
      } else if (now !== previous) throw new Error('云服务指针被其他操作修改')
    } catch (restore) {
      throw new AggregateError([error, restore], '云服务部署失败且恢复失败：' + restore.message)
    }
    throw error
  }
  return { passed: true, previous, candidate }
}
module.exports = { switchBackend }
