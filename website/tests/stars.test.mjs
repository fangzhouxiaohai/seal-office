import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createStars, starCountForArea } from '../src/stars.mjs'

const sequence = (values) => {
  let index = 0
  return () => values[index++ % values.length]
}

describe('官网星空动效', () => {
  it('按画布面积生成数量适中的星星并限制上下限', () => {
    assert.equal(starCountForArea(0, 0), 30)
    assert.equal(starCountForArea(1280, 720), Math.round((1280 * 720) / 9000))
    assert.equal(starCountForArea(10000, 10000), 220)
    assert.equal(starCountForArea(-5, -5), 30)
  })

  it('生成的星星位于画布范围内且渲染参数合法', () => {
    const stars = createStars({ width: 400, height: 200, count: 50, random: sequence([0.1, 0.5, 0.9]) })
    assert.equal(stars.length, 50)
    for (const star of stars) {
      assert.ok(star.x >= 0 && star.x <= 400, '星星横坐标超出画布')
      assert.ok(star.y >= 0 && star.y <= 200, '星星纵坐标超出画布')
      assert.ok(star.radius >= 0.4 && star.radius <= 1.7, '星星半径超出预期')
      assert.ok(star.alpha > 0 && star.alpha <= 1, '星星透明度超出预期')
      assert.ok(star.speed > 0, '星星闪烁速度必须为正')
      assert.ok(Array.isArray(star.color) && star.color.length === 3, '星星颜色必须是 RGB 三元组')
      assert.ok(star.color.every(channel => channel >= 0 && channel <= 255), '星星颜色通道超出范围')
    }
  })

  it('相同随机源生成一致的星空，保证渲染可复现', () => {
    const first = createStars({ width: 100, height: 100, count: 10, random: sequence([0.3, 0.7]) })
    const second = createStars({ width: 100, height: 100, count: 10, random: sequence([0.3, 0.7]) })
    assert.deepEqual(first, second)
  })

  it('未指定数量时按画布面积自动计算', () => {
    const stars = createStars({ width: 1280, height: 720, random: sequence([0.2, 0.4, 0.6, 0.8]) })
    assert.equal(stars.length, starCountForArea(1280, 720))
  })
})
