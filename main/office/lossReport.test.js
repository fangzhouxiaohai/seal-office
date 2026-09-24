const { 统计损失, 生成说明 } = require('./lossReport')

describe('lossReport', () => {
  describe('统计损失', () => {
    it('应检测 class 属性中的水印元素', () => {
      const html = '<div class="wps-watermark">水印内容</div>'
      const 结果 = 统计损失(html)
      expect(结果).toHaveLength(1)
      expect(结果[0].名称).toBe('水印')
      expect(结果[0].次数).toBe(1)
    })

    it('应检测 data-watermark 属性', () => {
      const html = '<div data-watermark="true">水印</div>'
      const 结果 = 统计损失(html)
      expect(结果).toHaveLength(1)
      expect(结果[0].名称).toBe('水印')
      expect(结果[0].次数).toBe(1)
    })

    it('应同时检测多类不支持元素', () => {
      const html = [
        '<div class="wps-watermark">水印</div>',
        '<div class="wps-wordart">艺术字</div>',
        '<div class="wps-columns">分栏</div>',
      ].join('')
      const 结果 = 统计损失(html)
      expect(结果).toHaveLength(3)
    })

    it('不应误匹配无关系的类名', () => {
      const html = '<div class="my-wps-watermark-extra">不应匹配</div>'
      const 结果 = 统计损失(html)
      expect(结果).toHaveLength(0)
    })

    it('空 HTML 返回空列表', () => {
      expect(统计损失('')).toEqual([])
    })
  })

  describe('生成说明', () => {
    it('无损失时返回空字符串', () => {
      expect(生成说明([])).toBe('')
    })

    it('有损失时返回说明文本', () => {
      const 项目 = [{ 名称: '水印', 次数: 2 }]
      const 说明 = 生成说明(项目)
      expect(说明).toContain('水印')
      expect(说明).toContain('2')
      expect(说明).toContain('HTML 格式')
    })
  })
})
