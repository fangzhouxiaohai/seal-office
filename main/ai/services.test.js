const { 创建服务配置存储, 服务种类列表 } = require('./services')

/** 模拟 Electron safeStorage：真实做一次可逆混淆，便于断言磁盘上是密文。 */
const 混淆密钥 = 0x5a
const 假安全存储 = {
  可用: true,
  isEncryptionAvailable() { return this.可用 },
  encryptString(文本) {
    const 原文 = Buffer.from(String(文本), 'utf8')
    return Buffer.from(原文.map((字节) => 字节 ^ 混淆密钥))
  },
  decryptString(缓冲) {
    const 还原 = Buffer.from(Buffer.from(缓冲).map((字节) => 字节 ^ 混淆密钥)).toString('utf8')
    if (!还原 || 还原.includes('\uFFFD')) throw new Error('无法解密')
    return 还原
  },
}

function 内存存储() {
  const 文件 = new Map()
  return {
    文件,
    async readFile(路径) { if (!文件.has(路径)) { const 错误 = new Error('不存在'); 错误.code = 'ENOENT'; throw 错误 } return 文件.get(路径) },
    async writeFile(路径, 数据) { 文件.set(路径, Buffer.from(数据)) },
    async rename(从, 到) { 文件.set(到, 文件.get(从)); 文件.delete(从) },
    async unlink(路径) { 文件.delete(路径) },
    async mkdir() {},
  }
}

const 建存储 = (存储 = 内存存储(), 安全存储 = 假安全存储) => ({ 存储, 安全存储, 服务: 创建服务配置存储({ 配置路径: 'E:/临时/服务配置.secure', 存储, 安全存储 }) })

describe('演示智能服务配置安全存储', () => {
  it('只接受登记的三种服务种类', async () => {
    expect(服务种类列表).toEqual(['翻译', '语音', '识别'])
    const { 服务 } = 建存储()
    await expect(服务.保存('聊天', {})).rejects.toThrow('服务种类')
    await expect(服务.清除('聊天')).rejects.toThrow('服务种类')
  })

  it('密钥在磁盘上是密文，读取时还原且不回显明文', async () => {
    const { 存储, 服务 } = 建存储()
    const 公开 = await 服务.保存('语音', { 名称: '本机语音', 地址: 'https://api.example.com/v1/audio/speech', 模型: 'tts-1', 密钥: 'sk-语音密钥', 声线: '女声-甲', 语速: 1 })
    expect(JSON.stringify(公开)).not.toContain('sk-语音密钥')
    const 磁盘 = Buffer.concat([...存储.文件.values()]).toString('utf8')
    expect(磁盘).not.toContain('sk-语音密钥')
    expect(假安全存储.decryptString(Buffer.concat([...存储.文件.values()]))).toContain('sk-语音密钥')
    const 读取 = await 服务.读取('语音')
    expect(读取).toMatchObject({ 模型: 'tts-1', 声线: '女声-甲', 已配置密钥: true })
    expect(JSON.stringify(读取)).not.toContain('sk-语音密钥')
    expect(服务.读取内部密钥('语音')).toBe('sk-语音密钥')
  })

  it('未配置的服务读取返回 null，损坏密文报真实原因', async () => {
    const { 存储, 服务 } = 建存储()
    expect(await 服务.读取('识别')).toBeNull()
    存储.文件.set('E:/临时/服务配置.secure', Buffer.from('不是密文', 'utf8'))
    await expect(服务.读取('识别')).rejects.toThrow('演示智能服务设置无法解密')
  })

  it('系统安全存储不可用时拒绝保存', async () => {
    const { 服务 } = 建存储(内存存储(), { ...假安全存储, 可用: false })
    await expect(服务.保存('翻译', { 地址: 'https://api.example.com/v1', 密钥: 'k' })).rejects.toThrow('安全存储不可用')
  })

  it('拒绝远程明文地址、超长密钥与无效语速，并给出真实原因', async () => {
    const { 服务 } = 建存储()
    await expect(服务.保存('翻译', { 地址: 'http://api.example.com/v1', 密钥: 'k' })).rejects.toThrow('安全连接')
    await expect(服务.保存('翻译', { 地址: 'https://api.example.com/v1', 密钥: 'x'.repeat(4097) })).rejects.toThrow('密钥过长')
    await expect(服务.保存('语音', { 地址: 'https://api.example.com/v1', 声线: '女声', 语速: 9 })).rejects.toThrow('语速')
    await expect(服务.保存('语音', { 地址: 'https://api.example.com/v1', 声线: '' })).rejects.toThrow('声线')
    await expect(服务.保存('翻译', { 地址: 'https://api.example.com/v1', 目标语言: 'x'.repeat(20) })).rejects.toThrow('目标语言')
  })

  it('本机服务允许 HTTP，其他种类互不影响', async () => {
    const { 服务 } = 建存储()
    await 服务.保存('翻译', { 名称: '本机翻译', 地址: 'http://127.0.0.1:11434/v1', 模型: 'qwen', 密钥: 'k', 目标语言: 'en' })
    await 服务.保存('语音', { 名称: '本机语音', 地址: 'http://localhost:8080/tts', 模型: 'tts', 声线: '女声' })
    await 服务.清除('语音')
    expect(await 服务.读取('语音')).toBeNull()
    expect(await 服务.读取('翻译')).toMatchObject({ 目标语言: 'en', 模型: 'qwen' })
  })

  it('迁移旧翻译配置：写入并校验后才报告成功；已存在配置时不覆盖并说明原因', async () => {
    const { 存储, 服务 } = 建存储()
    const 结果 = await 服务.迁移翻译配置({ 地址: 'https://api.legacy.com/v1/chat', 密钥: 'sk-旧密钥', 目标语言: 'ja' })
    expect(结果).toMatchObject({ 成功: true, 目标语言: 'ja' })
    expect(Buffer.concat([...存储.文件.values()]).toString('utf8')).not.toContain('sk-旧密钥')
    expect(await 服务.读取('翻译')).toMatchObject({ 目标语言: 'ja', 模型: '' })
    expect(服务.读取内部密钥('翻译')).toBe('sk-旧密钥')
    const 再次 = await 服务.迁移翻译配置({ 地址: 'https://api.legacy.com/v1/chat', 密钥: 'sk-新密钥', 目标语言: 'ja' })
    expect(再次.成功).toBe(false)
    expect(再次.原因).toContain('已存在')
    expect(服务.读取内部密钥('翻译')).toBe('sk-旧密钥')
  })

  it('迁移时旧配置无效则如实失败，不写入任何内容', async () => {
    const { 存储, 服务 } = 建存储()
    const 结果 = await 服务.迁移翻译配置({ 地址: 'http://api.legacy.com/v1', 密钥: 'k' })
    expect(结果.成功).toBe(false)
    expect(结果.原因).toContain('安全连接')
    expect(存储.文件.size).toBe(0)
    expect(await 服务.读取('翻译')).toBeNull()
  })
})
