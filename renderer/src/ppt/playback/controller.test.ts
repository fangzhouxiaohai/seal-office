import { afterEach, expect, it, vi } from 'vitest'
import { 创建演示文稿, 创建幻灯片 } from '../deck'
import * as 播放模块 from './controller'

afterEach(() => { vi.useRealTimers() })
function 设置() {
  vi.useFakeTimers()
  const 文稿 = 创建演示文稿(); 文稿.幻灯片列表.push(创建幻灯片(), 创建幻灯片())
  const 翻页 = vi.fn(), 结束 = vi.fn(), 停止媒体 = vi.fn()
  return { 文稿, 翻页, 结束, 停止媒体, 创建: () => new 播放模块.播放控制器(文稿, 0, { 翻页, 结束, 停止媒体, 更新: vi.fn() }) }
}
it.each(['切换','换片'] as const)('显式空%s参数必须拒绝而非套用默认值', 键 => {
  const t=设置(); Object.assign(t.文稿.幻灯片列表[0],{[键]:null});expect(t.创建).toThrow('参数')
})
it('按真实页序跳过隐藏页，末页结束只通知一次并停止媒体', () => {
  const t = 设置(); t.文稿.幻灯片列表[1].隐藏 = true; const c = t.创建(); c.开始(); c.单击()
  expect(c.快照.索引).toBe(2); c.单击(); c.单击(); expect(t.结束).toHaveBeenCalledTimes(1); expect(t.停止媒体).toHaveBeenCalled()
})
it('动画组同时开始，之后接续，单击组等待；动画完成才开始自动换片', () => {
  const t = 设置(), 页 = t.文稿.幻灯片列表[0], 对象标识 = 页.文本框列表[0].id
  页.换片 = { 单击: true, 自动毫秒: 1000 }
  页.动画序列 = [{ id: 'a', 对象标识, 效果: '淡入', 触发: '单击', 持续毫秒: 200 }, { id: 'b', 对象标识, 效果: '淡出', 触发: '之后', 持续毫秒: 300 }]
  const c = t.创建(); c.开始(); vi.advanceTimersByTime(5000); expect(c.快照.索引).toBe(0)
  c.单击(); expect(c.快照.活动动画).toEqual(['a']); vi.advanceTimersByTime(200); expect(c.快照.活动动画).toEqual(['b'])
  vi.advanceTimersByTime(1299); expect(c.快照.索引).toBe(0); vi.advanceTimersByTime(1); expect(c.快照.索引).toBe(1); c.销毁()
})
it('暂停与后台分别保留剩余时间，前台恢复不能解除手动暂停', () => {
  const t = 设置(); t.文稿.幻灯片列表[0].换片 = { 单击: false, 自动毫秒: 1000 }; const c = t.创建(); c.开始()
  vi.advanceTimersByTime(400); c.暂停(true); c.后台(true); vi.advanceTimersByTime(2000); c.后台(false); vi.advanceTimersByTime(2000); expect(c.快照.索引).toBe(0)
  c.暂停(false); vi.advanceTimersByTime(599); expect(c.快照.索引).toBe(0); vi.advanceTimersByTime(1); expect(c.快照.索引).toBe(1); c.销毁()
})
it('快速跳页取消旧页计时，循环回到第一张可见页', () => {
  const t = 设置(); t.文稿.循环放映 = true; t.文稿.幻灯片列表[0].换片 = { 单击: true, 自动毫秒: 1000 }; const c = t.创建(); c.开始(); c.跳转(2); vi.advanceTimersByTime(1000); expect(c.快照.索引).toBe(2); c.单击(); expect(c.快照.索引).toBe(0); c.销毁(); expect(vi.getTimerCount()).toBe(0)
})
it('全部隐藏时拒绝播放', () => {
  const t = 设置(); t.文稿.幻灯片列表.forEach(页 => { 页.隐藏 = true }); expect(t.创建).toThrow('可放映')
})
it('同组动画等最长时长，暂停冻结动画完成，后退会停止媒体', () => {
  const t=设置(), 页=t.文稿.幻灯片列表[0], 对象标识=页.文本框列表[0].id
  页.动画序列=[{id:'甲',对象标识,效果:'淡入',触发:'同时',持续毫秒:200},{id:'乙',对象标识,效果:'淡出',触发:'同时',持续毫秒:500},{id:'丙',对象标识,效果:'进入',触发:'之后',持续毫秒:200}]
  const c=t.创建();c.开始();expect(c.快照.活动动画).toEqual(['甲','乙']);vi.advanceTimersByTime(250);c.暂停(true);vi.advanceTimersByTime(500);expect(c.快照.完成动画).toEqual([]);c.暂停(false);vi.advanceTimersByTime(250);expect(c.快照.活动动画).toEqual(['丙']);c.跳转(1);const 次数=t.停止媒体.mock.calls.length;c.后退();expect(t.停止媒体.mock.calls.length).toBeGreaterThan(次数);expect(c.快照.完成动画).toEqual([]);c.销毁()
})
it('减少动态效果保留单击门槛，即时完成动画且保留自动等待', () => {
  const t=设置(), 页=t.文稿.幻灯片列表[0];页.换片={单击:false,自动毫秒:500};页.动画序列=[{id:'甲',对象标识:页.文本框列表[0].id,效果:'淡入',触发:'单击',持续毫秒:5000}]
  const c=new 播放模块.播放控制器(t.文稿,0,{更新:vi.fn(),翻页:t.翻页,结束:t.结束,停止媒体:t.停止媒体},true);c.开始();vi.advanceTimersByTime(6000);expect(c.快照.阶段).toBe('等待');c.单击();vi.advanceTimersByTime(0);expect(c.快照.完成动画).toEqual(['甲']);vi.advanceTimersByTime(499);expect(c.快照.索引).toBe(0);vi.advanceTimersByTime(1);expect(c.快照.索引).toBe(1);c.销毁()
})
it('单击关闭时动画仍可触发，末页主动退出会取消所有任务', () => {
  const t=设置();t.文稿.幻灯片列表[0].换片={单击:false};const c=t.创建();c.开始();c.单击();expect(c.快照.索引).toBe(0);c.首尾(true);expect(c.快照.索引).toBe(2);c.结束();expect(vi.getTimerCount()).toBe(0);c.销毁()
})
it('自定义放映序列决定翻页顺序，隐藏页在显式序列中仍会播放', () => {
  const t = 设置(); t.文稿.幻灯片列表[1].隐藏 = true
  const c = new 播放模块.播放控制器(t.文稿, 2, { 更新: vi.fn(), 翻页: t.翻页, 结束: t.结束, 停止媒体: t.停止媒体 }, false, { 序列: [2, 1] })
  c.开始(); expect(c.快照.索引).toBe(2)
  c.单击(); expect(c.快照.索引).toBe(1)
  c.单击(); expect(t.结束).toHaveBeenCalledTimes(1)
  c.销毁()
})
it('自定义序列非法时拒绝播放并说明原因', () => {
  const t = 设置()
  expect(() => new 播放模块.播放控制器(t.文稿, 0, { 更新: vi.fn(), 翻页: vi.fn(), 结束: vi.fn(), 停止媒体: vi.fn() }, false, { 序列: [] })).toThrow('可放映')
  expect(() => new 播放模块.播放控制器(t.文稿, 0, { 更新: vi.fn(), 翻页: vi.fn(), 结束: vi.fn(), 停止媒体: vi.fn() }, false, { 序列: [0, 0] })).toThrow('重复')
  expect(() => new 播放模块.播放控制器(t.文稿, 0, { 更新: vi.fn(), 翻页: vi.fn(), 结束: vi.fn(), 停止媒体: vi.fn() }, false, { 序列: [5] })).toThrow('越界')
})
