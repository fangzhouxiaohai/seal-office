const fs = require('fs')
const path = require('path')
const 格式 = require('./documentFormats.json')
describe('文档格式能力一致性', () => {
  it('Windows 原生注册与实际打开清单一致，并为每种格式选择对应图标', () => {
    const 脚本 = fs.readFileSync(path.join(__dirname, 'windows/shellIntegration.ps1'), 'utf8')
    const 格式声明 = 脚本.match(/\$taskSupported = @\(([^\n]+)\)/)[1]
    expect([...格式声明.matchAll(/'([^']+)'/g)].map(项 => 项[1])).toEqual(格式.map(项 => 项.extension))
    for (const 项 of 格式) expect(脚本).toContain(`${项.extension}='${项.icon === 'presentation' ? 'ppt' : 项.icon}.ico'`)
    expect(new Set(格式.map(项 => 项.extension)).size).toBe(格式.length)
  })
  it('关联每种格式都有读取策略，不能把含宏格式和加载项列为可写', () => {
    const 普通格式 = ['docx', 'xlsx', 'pptx', 'pdf', 'ofd', 'csv', 'txt', 'md', 'html', 'htm', 'json']
    for (const 项 of 格式) {
      expect(Boolean(普通格式.includes(项.extension) || 项.conversion || 项.text)).toBe(true)
      if (项.macro) expect(项.readOnlySource).toBe(true)
      if (项.conversion && !项.readOnlySource) expect(项.outputFilter).toBeTruthy()
    }
  })
  it('Windows 未找到默认应用时按未关联处理，不把系统状态误报为查询失败', () => {
    const 脚本 = fs.readFileSync(path.join(__dirname, 'windows/shellIntegration.ps1'), 'utf8')
    expect(脚本).toContain('$code -ne -2147221003')
  })
})
