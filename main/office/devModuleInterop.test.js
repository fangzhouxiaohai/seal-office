const fs = require('fs')
const path = require('path')
it('开发服务把共享纯校验模块转换为浏览器可执行的具名导出', async () => {
  const { 共享校验模块 } = await import('../../scripts/shared-validation-plugin.mjs')
  expect(共享校验模块().apply).toBe('serve')
  expect(共享校验模块().transform('module.exports = { 值 }',path.resolve('other/chartData.js'))).toBeNull()
  for (const 路径 of ['main/office/imageData.js','main/office/pptx/chartData.js']) {
    const 原文 = fs.readFileSync(path.resolve(路径),'utf8'), 插件 = 共享校验模块(), 结果 = 插件.transform(原文,path.resolve(路径))
    expect(结果.code).not.toContain('module.exports')
    const 浏览器模块 = await import(`data:text/javascript;base64,${Buffer.from(结果.code).toString('base64')}`)
    expect(Object.keys(浏览器模块).sort()).toEqual(Object.keys(require(path.resolve(路径))).sort())
    if (浏览器模块.图表配色) expect(浏览器模块.图表配色).toEqual(require(path.resolve(路径)).图表配色)
  }
})
