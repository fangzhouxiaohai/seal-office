import { expect, it } from 'vitest'
import { 切换帧, 动画帧 } from './transitionEngine'
it('各基础效果有不同帧且保留方向和减少动态设置', () => {
  const 基础 = { 持续毫秒: 400, 方向: '右' as const, 方式: '内' as const, 轴: '水平' as const }
  expect(切换帧({ ...基础, 效果: '推进' }, false)[0].translate).toBe('-100% 0')
  expect(切换帧({ ...基础, 效果: '擦除' }, false)[0].clipPath).toBe('inset(0 100% 0 0)')
  expect(切换帧({ ...基础, 效果: '分割' }, true)).toEqual([])
  expect(动画帧('退出',false,400)[1].translate).toBe('0 400px')
})
