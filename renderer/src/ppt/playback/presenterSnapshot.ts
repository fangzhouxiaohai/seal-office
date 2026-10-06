import type { 演示文稿 } from '../deck'
import type { 播放快照 } from './controller'
import type { 演讲者快照 } from './PresenterView'

/** 由编辑窗口的播放状态生成演讲者窗口所需的只读快照。 */
export function 构造演讲者快照(输入: {
  文稿: 演示文稿
  状态: 播放快照
  顺序: number[]
  已用毫秒: number
  运行中: boolean
}): 演讲者快照 {
  const { 文稿, 状态, 顺序, 已用毫秒, 运行中 } = 输入
  const 位置 = 顺序.indexOf(状态.索引)
  const 下一页索引 = 位置 >= 0 ? 顺序[位置 + 1] : undefined
  const 当前页 = 文稿.幻灯片列表[状态.索引]
  return {
    页码: 位置 >= 0 ? 位置 + 1 : 1,
    总页数: 顺序.length,
    标题: 当前页?.title ?? '',
    备注: 当前页?.备注 ?? '',
    下一页标题: 下一页索引 === undefined ? null : (文稿.幻灯片列表[下一页索引]?.title ?? ''),
    暂停: 状态.暂停,
    阶段: 状态.阶段,
    已用毫秒: Math.max(0, 已用毫秒),
    运行中,
  }
}
