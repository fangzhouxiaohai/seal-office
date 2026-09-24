// 文件操作测试：验证保存、读取完整链路
const fs = require('fs')
const path = require('path')
const { saveToFile, readFile, showOpenDialog, showSaveDialog } = require('./fileOps')

describe('文件操作', () => {
  const testDir = path.join(__dirname, 'test-output')

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }
  })

  afterAll(() => {
    // 清理测试文件
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('saveToFile', () => {
    it('应该能保存文本文件', () => {
      const filePath = path.join(testDir, 'test.txt')
      const content = 'Hello, Seal Office!'
      const result = saveToFile(filePath, content)
      expect(result.成功).toBe(true)
      expect(fs.existsSync(filePath)).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content)
    })

    it('没有文件路径应该返回错误', () => {
      const result = saveToFile('', 'test')
      expect(result.成功).toBe(false)
      expect(result.错误).toBe('未指定文件路径')
    })

    it('无效路径应该返回错误', () => {
      const filePath = 'invalid://path/test.txt'
      const result = saveToFile(filePath, 'test')
      expect(result.成功).toBe(false)
    })
  })

  describe('readFile', () => {
    it('应该能读取文本文件', () => {
      const filePath = path.join(testDir, 'read-test.txt')
      fs.writeFileSync(filePath, 'Test content for reading')
      const result = readFile(filePath)
      expect(result.成功).toBe(true)
      expect(result.内容).toBe('Test content for reading')
    })

    it('没有文件路径应该返回错误', () => {
      const result = readFile('')
      expect(result.成功).toBe(false)
      expect(result.错误).toBe('未指定文件路径')
    })

    it('不存在的文件应该返回错误', () => {
      const filePath = path.join(testDir, 'non-existent.txt')
      const result = readFile(filePath)
      expect(result.成功).toBe(false)
    })
  })
})
