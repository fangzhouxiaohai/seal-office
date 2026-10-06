import { expect, it } from 'vitest'
import { 创建幻灯片, 创建文本框 } from '../deck'
import { 创建图表 } from '../model/elements'
import { 匹配平滑对象, 平滑帧, 平滑进入帧, 平滑退出帧 } from './morph'

const 几何 = (项: { x: number; y: number; width: number; height: number }) => ({ x: 项.x, y: 项.y, width: 项.width, height: 项.height })

it('相同稳定标识且类型一致的对象进入配对插值', () => {
  const 前 = 创建幻灯片(), 后 = 创建幻灯片()
  const 框 = 创建文本框(100, 100, 200, 80, '标题')
  前.文本框列表 = [{ ...框 }]
  后.文本框列表 = [{ ...框, x: 300, y: 200, width: 400, height: 160 }]
  const 结果 = 匹配平滑对象(前, 后)
  expect(结果.配对).toHaveLength(1)
  expect(结果.配对[0].标识).toBe(框.id)
  expect(结果.配对[0].类型).toBe('文本框')
  expect(结果.配对[0].前).toEqual(几何({ x: 100, y: 100, width: 200, height: 80 }))
  expect(结果.配对[0].后).toEqual(几何({ x: 300, y: 200, width: 400, height: 160 }))
  expect(结果.进入).toEqual([])
  expect(结果.退出).toEqual([])
  expect(结果.类型变化).toEqual([])
})

it('只在新页出现的对象进入，只在旧页出现的对象退出', () => {
  const 前 = 创建幻灯片(), 后 = 创建幻灯片()
  const 旧 = 创建文本框(10, 10, 100, 40, '旧')
  const 新 = 创建文本框(20, 20, 100, 40, '新')
  前.文本框列表 = [旧]
  后.文本框列表 = [新]
  const 结果 = 匹配平滑对象(前, 后)
  expect(结果.配对).toEqual([])
  expect(结果.进入).toEqual([新.id])
  expect(结果.退出).toEqual([旧.id])
})

it('同一标识类型变化时旧对象退出、新对象进入，不做几何插值', () => {
  const 前 = 创建幻灯片(), 后 = 创建幻灯片()
  const 图 = 创建图表('柱状图')
  前.文本框列表 = [{ ...创建文本框(0, 0, 100, 50, '文字'), id: 图.id }]
  后.文本框列表 = []
  后.对象列表 = [图]
  const 结果 = 匹配平滑对象(前, 后)
  expect(结果.配对).toEqual([])
  expect(结果.类型变化).toEqual([图.id])
  expect(结果.退出).toEqual([图.id])
  expect(结果.进入).toEqual([图.id])
})

it('图形与图表按类型分别匹配，组合成员不参与独立匹配', () => {
  const 前 = 创建幻灯片(), 后 = 创建幻灯片()
  const 图 = 创建图表('柱状图')
  前.对象列表 = [{ ...图, x: 0, y: 0, width: 300, height: 200 }]
  后.对象列表 = [{ ...图, x: 60, y: 40, width: 480, height: 320 }]
  const 结果 = 匹配平滑对象(前, 后)
  expect(结果.配对).toHaveLength(1)
  expect(结果.配对[0].类型).toBe('图表')
})

it('几何变化生成可运行的插值帧，几何一致时不生成动画', () => {
  const 配对 = { 标识: 'a', 类型: '文本框', 前: { x: 100, y: 100, width: 200, height: 80 }, 后: { x: 300, y: 200, width: 400, height: 160 }, 前旋转: 0, 后旋转: 0 }
  const 帧 = 平滑帧(配对, 0, 0, false)
  expect(帧).toHaveLength(2)
  expect(帧[0].transform).toBe('translate(-200px, -100px) rotate(0deg) scale(0.5, 0.5)')
  expect(帧[1].transform).toBe('translate(0px, 0px) rotate(0deg) scale(1, 1)')
  expect(平滑帧({ ...配对, 后: { ...配对.后, x: 100, y: 100, width: 200, height: 80 } }, 0, 0, false)).toEqual([])
  expect(平滑帧(配对, 0, 0, true)).toEqual([])
})

it('减少动态效果时不生成插入帧，进入与退出仍可表达', () => {
  expect(平滑进入帧(true)).toEqual([])
  expect(平滑退出帧(true)).toEqual([])
  expect(平滑进入帧(false)[0]).toEqual({ opacity: 0 })
  expect(平滑退出帧(false)[1]).toEqual({ opacity: 0 })
})
