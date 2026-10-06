import type { 演示文稿 } from '../deck'
import { 动画分组, 校验动画 } from '../model/animations'
import { 读取切换, 校验播放参数 } from '../model/transitions'
export interface 播放快照 { 索引: number; 阶段: '切换'|'等待'|'动画'|'结束'; 暂停: boolean; 活动动画: string[]; 完成动画: string[]; 页代次: number }
interface 回调 { 更新: (状态: 播放快照) => void; 翻页: (索引: number) => void; 结束: () => void; 停止媒体: () => void }
/** 显式放映序列（自定义放映或页码范围）必须非空、无重复且在页面范围内。 */
export function 校验放映索引序列(序列: unknown, 页面总数: number): number[] {
  if (!Array.isArray(序列) || 序列.length === 0) throw new Error('没有可放映的页面，请检查放映范围设置')
  const 结果: number[] = []
  for (const 索引 of 序列) {
    if (!Number.isInteger(索引) || (索引 as number) < 0 || (索引 as number) >= 页面总数) throw new Error('放映序列越界：包含不存在的页面')
    if (结果.includes(索引 as number)) throw new Error('放映序列重复：同一页面不能出现多次')
    结果.push(索引 as number)
  }
  return 结果
}
/** 每次离页均取消计时；暂停与后台独立持有暂停原因，恢复只消费剩余时间。 */
export class 播放控制器 {
  快照: 播放快照
  private 可见: number[]; private 组 = 0; private 手动暂停 = false; private 后台暂停 = false
  private 任务?: ReturnType<typeof setTimeout>; private 剩余 = 0; private 到期 = 0; private 待执行?: () => void; private 已销毁 = false
  constructor(private 文稿: 演示文稿, 索引: number, private 回调: 回调, private 减少动态 = false, 选项: { 序列?: number[] } = {}) {
    文稿.幻灯片列表.forEach(页 => { 校验播放参数(页); 校验动画(页) })
    this.可见 = 选项.序列 === undefined
      ? 文稿.幻灯片列表.flatMap((页, i) => 页.隐藏 ? [] : [i])
      : 校验放映索引序列(选项.序列, 文稿.幻灯片列表.length)
    if (!this.可见.length) throw new Error('没有可放映的页面，请取消至少一页的隐藏状态')
    this.快照 = { 索引: this.可见.find(i => i >= 索引) ?? this.可见[0], 阶段: '等待', 暂停: false, 活动动画: [], 完成动画: [], 页代次: 0 }
  }
  private 通知() { this.快照 = { ...this.快照 }; this.回调.更新(this.快照) }
  private 取消() { clearTimeout(this.任务); this.任务 = undefined; this.待执行 = undefined }
  private 安排(毫秒: number, 执行: () => void) {
    this.取消(); this.剩余 = 毫秒; this.待执行 = 执行
    if (!this.快照.暂停) this.计时()
  }
  private 计时() {
    this.到期 = Date.now() + this.剩余
    this.任务 = setTimeout(() => { const 执行 = this.待执行; this.取消(); if (!this.已销毁) 执行?.() }, this.剩余)
  }
  开始() { this.入页(this.快照.索引) }
  private 入页(索引: number) {
    this.取消(); this.回调.停止媒体(); this.组 = 0
    this.快照 = { ...this.快照, 索引, 阶段: '切换', 活动动画: [], 完成动画: [], 页代次: this.快照.页代次 + 1 }
    this.回调.翻页(索引); this.通知()
    const 切换 = 读取切换(this.文稿.幻灯片列表[索引]), 时长 = this.减少动态 || 切换.效果 === '无' || 切换.效果 === '切出' ? 0 : 切换.持续毫秒
    if (时长) this.安排(时长, () => this.等待()); else this.等待()
  }
  private 等待() {
    this.快照.阶段 = '等待'; this.快照.活动动画 = []; this.通知()
    const 页 = this.文稿.幻灯片列表[this.快照.索引], 下组 = 动画分组(页.动画序列 ?? [])[this.组]
    if (下组 && 下组[0].触发 !== '单击') this.播组()
    else if (!下组 && 页.换片?.自动毫秒 !== undefined) this.安排(页.换片.自动毫秒, () => this.下一页())
  }
  private 播组() {
    const 组 = 动画分组(this.文稿.幻灯片列表[this.快照.索引].动画序列 ?? [])[this.组]
    if (!组) return
    this.快照.阶段 = '动画'; this.快照.活动动画 = 组.map(项 => 项.id); this.通知()
    this.安排(this.减少动态 ? 0 : Math.max(...组.map(项 => 项.持续毫秒)), () => { this.快照.完成动画 = [...this.快照.完成动画, ...组.map(项 => 项.id)]; this.组++; this.等待() })
  }
  单击() {
    if (this.已销毁 || this.快照.暂停 || this.快照.阶段 === '结束') return
    if (this.快照.阶段 === '切换' || this.快照.阶段 === '动画') { const 执行 = this.待执行; this.取消(); 执行?.(); return }
    const 页 = this.文稿.幻灯片列表[this.快照.索引]
    if (动画分组(页.动画序列 ?? [])[this.组]) this.播组()
    else if (页.换片?.单击 !== false) this.下一页()
  }
  private 下一页() {
    const 位置 = this.可见.indexOf(this.快照.索引), 目标 = this.可见[位置 + 1]
    if (目标 !== undefined) this.入页(目标)
    else if (this.文稿.循环放映) this.入页(this.可见[0]); else this.结束()
  }
  后退() { const 目标 = this.可见[this.可见.indexOf(this.快照.索引) - 1]; if (目标 !== undefined) this.跳转(目标) }
  跳转(索引: number) { if (!this.已销毁 && this.可见.includes(索引)) this.入页(索引) }
  首尾(末页: boolean) { this.跳转(this.可见[末页 ? this.可见.length - 1 : 0]) }
  暂停(值: boolean) { this.手动暂停 = 值; this.同步暂停() }
  后台(值: boolean) { this.后台暂停 = 值; this.同步暂停() }
  private 同步暂停() {
    const 值 = this.手动暂停 || this.后台暂停
    if (值 === this.快照.暂停 || this.已销毁) return
    if (值) { this.剩余 = Math.max(0, this.到期 - Date.now()); clearTimeout(this.任务); this.回调.停止媒体() }
    this.快照.暂停 = 值; this.通知()
    if (!值 && this.待执行) this.计时()
  }
  结束() { if (this.已销毁 || this.快照.阶段 === '结束') return; this.取消(); this.回调.停止媒体(); this.快照.阶段 = '结束'; this.通知(); this.回调.结束() }
  销毁() { this.已销毁 = true; this.取消(); this.回调.停止媒体() }
}
