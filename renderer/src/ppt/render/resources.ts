import { 桥接, type 演示资源条目 } from '../../ipc/bridge'
import { 迁移演示文稿, 校验演示备份资源 } from '../model/migrations'
import type { 演示文稿 } from '../deck'

/** 所有打开入口在建立正文引用之前恢复真实资源字节。 */
export async function 恢复导入图片(数据: { 演示文稿: 演示文稿; 资源条目?: 演示资源条目[] }): Promise<演示文稿> {
  const 文稿 = 迁移演示文稿(数据.演示文稿)
  校验演示备份资源([文稿], 数据.资源条目 ?? [])
  if (数据.资源条目?.length) {
    const 结果 = await 桥接.presentationResources.restore(数据.资源条目)
    if (!结果.成功) throw new Error(结果.错误 ?? '图片资源恢复失败')
  }
  return 文稿
}
