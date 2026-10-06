import { expect, it } from 'vitest'
import { 创建幻灯片 } from '../deck'
import { 全部切换, 高级切换, 切换能力表, 读取切换, 校验播放参数 } from './transitions'

const 基准 = { 持续毫秒: 700, 方向: '左' as const, 方式: '外' as const, 轴: '水平' as const }

it('高级切换进入效果清单，并且每种效果都能通过播放参数校验', () => {
  expect([...高级切换]).toEqual(['溶解', '涟漪', '新闻快报', '轮辐', '百叶窗', '梳理', '平滑'])
  expect([...全部切换]).toEqual([...['无', '淡入淡出', '推进', '切出', '擦除', '形状', '抽出', '分割'], ...高级切换])
  for (const 效果 of 全部切换) {
    const 页 = 创建幻灯片()
    页.切换 = { ...基准, 效果 }
    expect(() => 校验播放参数(页), `${效果} 应通过校验`).not.toThrow()
    expect(读取切换(页).效果).toBe(效果)
  }
})

it('未登记的效果仍被拒绝', () => {
  const 页 = 创建幻灯片()
  页.切换 = { ...基准, 效果: '翻页' as never }
  expect(() => 校验播放参数(页)).toThrow('切换参数无效')
})

it('轮辐辐条只接受已登记根数，默认四根', () => {
  const 页 = 创建幻灯片()
  页.切换 = { ...基准, 效果: '轮辐' }
  expect(读取切换(页).辐条).toBe(4)
  for (const 辐条 of [1, 2, 3, 4, 6, 8, 12]) {
    页.切换 = { ...基准, 效果: '轮辐', 辐条 }
    expect(() => 校验播放参数(页), `${辐条} 根应通过`).not.toThrow()
  }
  for (const 辐条 of [5, 7, 0, 13, 4.5]) {
    页.切换 = { ...基准, 效果: '轮辐', 辐条 }
    expect(() => 校验播放参数(页), `${辐条} 根应被拒绝`).toThrow('辐条')
  }
})

it('辐条只允许出现在轮辐上，其它效果携带即为无效参数', () => {
  const 页 = 创建幻灯片()
  页.切换 = { ...基准, 效果: '百叶窗', 辐条: 8 }
  expect(() => 校验播放参数(页)).toThrow('辐条')
})

it('方向型高级切换按轴选择百叶窗与梳理的展开方向', () => {
  const 页 = 创建幻灯片()
  页.切换 = { ...基准, 效果: '百叶窗', 轴: '垂直' }
  expect(() => 校验播放参数(页)).not.toThrow()
  expect(读取切换(页).轴).toBe('垂直')
})

it('每种切换登记本机与原生支持状态，缺一不可', () => {
  for (const 效果 of 全部切换) {
    const 能力 = 切换能力表[效果]
    expect(能力, `${效果} 缺少能力登记`).toBeTruthy()
    expect(['支持', '近似']).toContain(能力.本机)
    expect(能力.说明.length).toBeGreaterThan(0)
    expect(能力.原生 === null || typeof 能力.原生 === 'string').toBe(true)
  }
  expect(切换能力表.涟漪.原生).toBe('ripple')
  expect(切换能力表.平滑.原生).toBe('morph')
  expect(切换能力表.轮辐.原生).toBe('wheel')
  expect(切换能力表.百叶窗.原生).toBe('blinds')
  expect(切换能力表.梳理.原生).toBe('comb')
  expect(切换能力表.溶解.原生).toBe('dissolve')
  expect(切换能力表.新闻快报.原生).toBe('newsflash')
  expect(切换能力表.平滑.本机).toBe('支持')
})
