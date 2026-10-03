const fs = require('fs')
const os = require('os')
const path = require('path')
const { 生成清单, 核验清单 } = require('./integrity')

describe('安装目录完整性', () => {
  it('发现文件被意外修改及缺失', () => {
    const 根目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-office-integrity-'))
    try {
      fs.mkdirSync(path.join(根目录, 'main'))
      fs.mkdirSync(path.join(根目录, 'dist'))
      fs.writeFileSync(path.join(根目录, 'main', 'main.js'), '原始程序')
      fs.writeFileSync(path.join(根目录, 'dist', 'index.html'), '原始页面')
      const 清单 = 生成清单(根目录)
      expect(核验清单(根目录, 清单)).toMatchObject({ 完整: true, 检查文件数: 2, 异常: [] })
      fs.writeFileSync(path.join(根目录, 'main', 'main.js'), '修改后的程序')
      fs.unlinkSync(path.join(根目录, 'dist', 'index.html'))
      const 结果 = 核验清单(根目录, 清单)
      expect(结果.完整).toBe(false)
      expect(结果.异常).toEqual(expect.arrayContaining([
        expect.objectContaining({ 路径: 'main/main.js', 原因: '校验值不一致' }),
        expect.objectContaining({ 路径: 'dist/index.html', 原因: '文件缺失' }),
      ]))
    } finally {
      fs.rmSync(根目录, { recursive: true, force: true })
    }
  })

  it('拒绝清单中的越界路径', () => {
    expect(() => 核验清单('C:\\app', { 版本: 1, 文件: [{ 路径: '../secret', 校验值: '0'.repeat(64), 字节数: 1 }] })).toThrow('无效')
  })
})
