const fs = require('fs')
const os = require('os')
const path = require('path')

function 加载文件通道(用户目录) {
  const 电子路径 = require.resolve('electron')
  const 文件路径 = require.resolve('./fileChannel')
  require('electron')
  const 原电子导出 = require.cache[电子路径].exports
  const 原文件缓存 = require.cache[文件路径]
  require.cache[电子路径].exports = {
    app: { getPath: () => 用户目录 },
    dialog: {},
    shell: {},
  }
  delete require.cache[文件路径]
  try {
    return require('./fileChannel')
  } finally {
    require.cache[电子路径].exports = 原电子导出
    if (原文件缓存) require.cache[文件路径] = 原文件缓存
    else delete require.cache[文件路径]
  }
}

function 创建通道(用户目录) {
  const 处理器 = new Map()
  加载文件通道(用户目录).注册文件通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
  return (名称, ...参数) => 处理器.get(名称)?.(null, ...参数)
}

describe('文件通道的数据完整性', () => {
  let 目录

  beforeEach(() => {
    目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-file-channel-'))
  })

  it('本机文件夹只列出可打开的办公文件并按修改时间排序', async () => {
    fs.writeFileSync(path.join(目录, '较早.docx'), '甲')
    fs.writeFileSync(path.join(目录, '较新.pdf'), '乙')
    fs.writeFileSync(path.join(目录, '快捷方式.lnk'), '丙')
    const 较早时间 = new Date('2020-01-01T00:00:00Z')
    fs.utimesSync(path.join(目录, '较早.docx'), 较早时间, 较早时间)
    const 结果 = await 创建通道(目录)('file.listKnownFolder', 'desktop')
    expect(结果).toMatchObject({ 成功: true, 路径: 目录 })
    expect(结果.文件.map((文件) => 文件.名称)).toEqual(['较新.pdf', '较早.docx'])
    expect(await 创建通道(目录)('file.listKnownFolder', '../secret')).toMatchObject({ 成功: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const 文件名 of fs.readdirSync(目录)) fs.unlinkSync(path.join(目录, 文件名))
    fs.rmdirSync(目录)
  })

  it('保存写入中断时保留原文件且清理临时文件', async () => {
    const 文件 = path.join(目录, '文档.txt')
    fs.writeFileSync(文件, '原内容')
    const 调用 = 创建通道(目录)
    const { 文件指纹 } = await 调用('file.readFile', 文件)
    const 原写入 = fs.writeFileSync
    vi.spyOn(fs, 'writeFileSync').mockImplementation((写入路径, ...参数) => {
      原写入(写入路径, '残缺内容')
      throw new Error('模拟写入中断')
    })

    const 结果 = await 调用('file.saveToFile', 文件, '新内容', '文本', 文件指纹)

    expect(结果).toMatchObject({ 成功: false, 错误: '模拟写入中断' })
    expect(fs.readFileSync(文件, 'utf8')).toBe('原内容')
    expect(fs.readdirSync(目录)).toEqual(['文档.txt'])
  })

  it('替换文件失败时保留原文件且报告失败', async () => {
    const 文件 = path.join(目录, '文档.txt')
    fs.writeFileSync(文件, '原内容')
    const 调用 = 创建通道(目录)
    const { 文件指纹 } = await 调用('file.readFile', 文件)
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('模拟替换失败') })

    const 结果 = await 调用('file.saveToFile', 文件, '新内容', '文本', 文件指纹)

    expect(结果).toMatchObject({ 成功: false, 错误: '模拟替换失败' })
    expect(fs.readFileSync(文件, 'utf8')).toBe('原内容')
    expect(fs.readdirSync(目录)).toEqual(['文档.txt'])
  })

  it('正常保存时替换已有文件且不留下临时文件', async () => {
    const 文件 = path.join(目录, '文档.txt')
    fs.writeFileSync(文件, '原内容')
    const 调用 = 创建通道(目录)
    const { 文件指纹 } = await 调用('file.readFile', 文件)

    const 结果 = await 调用('file.saveToFile', 文件, '新内容', '文本', 文件指纹)

    expect(结果).toMatchObject({ 成功: true, 路径: 文件 })
    expect(fs.readFileSync(文件, 'utf8')).toBe('新内容')
    expect(fs.readdirSync(目录)).toEqual(['文档.txt'])
  })

  it('再次访问最近文件时保留置顶状态，明确取消时才移除置顶', async () => {
    const 文件 = path.join(目录, 'recent.json')
    const 路径 = 'C:\\资料\\报告.docx'
    fs.writeFileSync(文件, JSON.stringify([{ 路径, 名称: '报告.docx', 类型: 'word', 时间: 1, 置顶: true }]))
    const 调用 = 创建通道(目录)

    const 再次访问 = await 调用('file.recent.add', { 路径, 名称: '报告.docx', 类型: 'word' })
    expect(再次访问).toMatchObject({ 成功: true, 数据: [expect.objectContaining({ 置顶: true })] })
    expect(JSON.parse(fs.readFileSync(文件, 'utf8'))[0].置顶).toBe(true)

    const 取消置顶 = await 调用('file.recent.add', { 路径, 名称: '报告.docx', 类型: 'word', 置顶: false })
    expect(取消置顶).toMatchObject({ 成功: true, 数据: [expect.objectContaining({ 置顶: false })] })
  })

  it('最近记录格式损坏时拒绝添加并保留原始内容', async () => {
    const 文件 = path.join(目录, 'recent.json')
    const 损坏内容 = '{"路径":'
    fs.writeFileSync(文件, 损坏内容)

    const 结果 = await 创建通道(目录)('file.recent.add', { 路径: 'C:\\文档.docx', 名称: '文档' })

    expect(结果.成功).toBe(false)
    expect(结果.错误).toContain('最近文档')
    expect(fs.readFileSync(文件, 'utf8')).toBe(损坏内容)
  })

  it('最近记录结构错误时读取及移除均报告失败且不覆盖文件', async () => {
    const 文件 = path.join(目录, 'recent.json')
    const 损坏内容 = '{"路径":"C:\\\\文档.docx"}'
    fs.writeFileSync(文件, 损坏内容)
    const 调用 = 创建通道(目录)

    const 读取结果 = await 调用('file.recent.list')
    const 移除结果 = await 调用('file.recent.remove', 'C:\\文档.docx')

    expect(读取结果.成功).toBe(false)
    expect(移除结果.成功).toBe(false)
    expect(fs.readFileSync(文件, 'utf8')).toBe(损坏内容)
  })

  it('最近记录条目损坏时拒绝读取及添加', async () => {
    const 文件 = path.join(目录, 'recent.json')
    const 损坏内容 = '[null]'
    fs.writeFileSync(文件, 损坏内容)
    const 调用 = 创建通道(目录)

    expect((await 调用('file.recent.list')).成功).toBe(false)
    expect((await 调用('file.recent.add', { 路径: 'C:\\新文档.docx', 名称: '新文档', 类型: 'word' })).成功).toBe(false)
    expect(fs.readFileSync(文件, 'utf8')).toBe(损坏内容)
  })

  it('最近记录缺少显示字段时拒绝读取', async () => {
    const 文件 = path.join(目录, 'recent.json')
    fs.writeFileSync(文件, '[{"路径":"C:\\\\文档.docx"}]')

    const 结果 = await 创建通道(目录)('file.recent.list')

    expect(结果.成功).toBe(false)
  })

  it('新增记录缺少必填字段时不创建损坏的记录文件', async () => {
    const 结果 = await 创建通道(目录)('file.recent.add', { 路径: 'C:\\文档.docx' })

    expect(结果.成功).toBe(false)
    expect(fs.existsSync(path.join(目录, 'recent.json'))).toBe(false)
  })
})

describe('文件通道的磁盘重命名', () => {
  let 目录
  let 原路径
  let 记录路径
  let 原记录

  beforeEach(() => {
    目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-file-rename-'))
    原路径 = path.join(目录, '原报告.docx')
    记录路径 = path.join(目录, 'recent.json')
    原记录 = [{ 路径: 原路径, 名称: '原报告.docx', 类型: 'word', 时间: 123, 置顶: true }]
    fs.writeFileSync(原路径, '正文内容')
    fs.writeFileSync(记录路径, JSON.stringify(原记录))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const 文件名 of fs.readdirSync(目录)) fs.unlinkSync(path.join(目录, 文件名))
    fs.rmdirSync(目录)
  })

  it('实际改名并同步最近记录，保留原扩展名和其他记录字段', async () => {
    const 新路径 = path.join(目录, '新报告.docx')

    const 结果 = await 创建通道(目录)('file.rename', 原路径, '新报告')

    expect(结果).toMatchObject({ 成功: true, 路径: 新路径, 名称: '新报告.docx' })
    expect(fs.existsSync(原路径)).toBe(false)
    expect(fs.readFileSync(新路径, 'utf8')).toBe('正文内容')
    expect(JSON.parse(fs.readFileSync(记录路径, 'utf8'))).toEqual([
      { ...原记录[0], 路径: 新路径, 名称: '新报告.docx' },
    ])
  })

  it('已打开文件改名后返回新路径的指纹供后续保存校验', async () => {
    const 调用 = 创建通道(目录)
    const 原指纹 = (await 调用('file.readFile', 原路径)).文件指纹
    const 新路径 = path.join(目录, '新报告.docx')

    const 结果 = await 调用('file.rename', 原路径, '新报告', 原指纹)

    expect(结果).toMatchObject({ 成功: true, 路径: 新路径, 文件指纹: expect.any(String) })
    expect(结果.文件指纹).toBe((await 调用('file.readFile', 新路径)).文件指纹)
    expect(结果.文件指纹).not.toBe(原指纹)
  })

  it('已打开文件在应用外变化后拒绝重命名并保留原文件', async () => {
    const 调用 = 创建通道(目录)
    const 原指纹 = (await 调用('file.readFile', 原路径)).文件指纹
    fs.writeFileSync(原路径, '外部修改后的正文')

    const 结果 = await 调用('file.rename', 原路径, '新报告', 原指纹)

    expect(结果.成功).toBe(false)
    expect(结果.错误).toMatch(/应用外发生变化/)
    expect(fs.readFileSync(原路径, 'utf8')).toBe('外部修改后的正文')
    expect(fs.existsSync(path.join(目录, '新报告.docx'))).toBe(false)
  })

  it('输入原扩展名时不会重复追加扩展名', async () => {
    const 新路径 = path.join(目录, '新报告.docx')

    const 结果 = await 创建通道(目录)('file.rename', 原路径, '新报告.docx')

    expect(结果).toMatchObject({ 成功: true, 路径: 新路径 })
    expect(fs.existsSync(path.join(目录, '新报告.docx.docx'))).toBe(false)
  })

  it('文件系统不支持硬链接时仍可排他复制并完成重命名', async () => {
    vi.spyOn(fs, 'linkSync').mockImplementation(() => {
      const 错误 = new Error('不支持硬链接')
      错误.code = 'EPERM'
      throw 错误
    })
    const 复制 = vi.spyOn(fs, 'copyFileSync')
    const 新路径 = path.join(目录, '新报告.docx')

    const 结果 = await 创建通道(目录)('file.rename', 原路径, '新报告')

    expect(结果).toMatchObject({ 成功: true, 路径: 新路径 })
    expect(复制).toHaveBeenCalledWith(原路径, 新路径, fs.constants.COPYFILE_EXCL)
    expect(fs.existsSync(原路径)).toBe(false)
    expect(fs.readFileSync(新路径, 'utf8')).toBe('正文内容')
    expect(JSON.parse(fs.readFileSync(记录路径, 'utf8'))[0].路径).toBe(新路径)
  })

  it('排他复制后记录写入失败时清理新文件并保留原记录', async () => {
    vi.spyOn(fs, 'linkSync').mockImplementation(() => {
      const 错误 = new Error('不支持硬链接')
      错误.code = 'EPERM'
      throw 错误
    })
    const 复制 = vi.spyOn(fs, 'copyFileSync')
    const 原写入 = fs.writeFileSync
    vi.spyOn(fs, 'writeFileSync').mockImplementation((写入路径, ...参数) => {
      if (String(写入路径).endsWith('.tmp')) throw new Error('模拟记录写入失败')
      return 原写入(写入路径, ...参数)
    })

    const 结果 = await 创建通道(目录)('file.rename', 原路径, '新报告')

    expect(复制).toHaveBeenCalledWith(原路径, path.join(目录, '新报告.docx'), fs.constants.COPYFILE_EXCL)
    expect(结果?.成功).toBe(false)
    expect(fs.readFileSync(原路径, 'utf8')).toBe('正文内容')
    expect(fs.existsSync(path.join(目录, '新报告.docx'))).toBe(false)
    expect(fs.readFileSync(记录路径, 'utf8')).toBe(JSON.stringify(原记录))
  })

  it.each(['', '  ', 'CON', 'nul.txt', 'AUX.docx', 'COM1', 'LPT9', '非法/名称', '非法\\名称', '非法:名称', '名称.', '名称 ', '名称?'])(
    '拒绝非法新名称 %s，保留原文件和最近记录', async (名称) => {
      const 结果 = await 创建通道(目录)('file.rename', 原路径, 名称)

      expect(结果?.成功).toBe(false)
      expect(fs.readFileSync(原路径, 'utf8')).toBe('正文内容')
      expect(fs.readFileSync(记录路径, 'utf8')).toBe(JSON.stringify(原记录))
    }
  )

  it('目标文件已存在时拒绝覆盖', async () => {
    const 目标 = path.join(目录, '新报告.docx')
    fs.writeFileSync(目标, '目标内容')

    const 结果 = await 创建通道(目录)('file.rename', 原路径, '新报告')

    expect(结果?.成功).toBe(false)
    expect(fs.readFileSync(原路径, 'utf8')).toBe('正文内容')
    expect(fs.readFileSync(目标, 'utf8')).toBe('目标内容')
    expect(fs.readFileSync(记录路径, 'utf8')).toBe(JSON.stringify(原记录))
  })

  it('检查目标后目标被其他程序创建时仍不能覆盖', async () => {
    const 目标 = path.join(目录, '新报告.docx')
    const 原检查 = fs.existsSync
    let 已注入 = false
    vi.spyOn(fs, 'existsSync').mockImplementation((检查路径) => {
      if (检查路径 === 目标 && !已注入) {
        已注入 = true
        const 原结果 = 原检查(检查路径)
        fs.writeFileSync(目标, '其他程序的内容')
        return 原结果
      }
      return 原检查(检查路径)
    })

    const 结果 = await 创建通道(目录)('file.rename', 原路径, '新报告')

    expect(结果?.成功).toBe(false)
    expect(fs.readFileSync(原路径, 'utf8')).toBe('正文内容')
    expect(fs.readFileSync(目标, 'utf8')).toBe('其他程序的内容')
    expect(fs.readFileSync(记录路径, 'utf8')).toBe(JSON.stringify(原记录))
  })

  it('最近记录损坏时拒绝改名，避免磁盘与记录脱节', async () => {
    fs.writeFileSync(记录路径, '{损坏')

    const 结果 = await 创建通道(目录)('file.rename', 原路径, '新报告')

    expect(结果?.成功).toBe(false)
    expect(fs.existsSync(原路径)).toBe(true)
    expect(fs.readFileSync(记录路径, 'utf8')).toBe('{损坏')
  })

  it('最近记录落盘失败时撤销磁盘改名', async () => {
    const 原写入 = fs.writeFileSync
    vi.spyOn(fs, 'writeFileSync').mockImplementation((写入路径, ...参数) => {
      if (String(写入路径).endsWith('.tmp')) throw new Error('模拟记录写入失败')
      return 原写入(写入路径, ...参数)
    })

    const 结果 = await 创建通道(目录)('file.rename', 原路径, '新报告')

    expect(结果?.成功).toBe(false)
    expect(fs.readFileSync(原路径, 'utf8')).toBe('正文内容')
    expect(fs.existsSync(path.join(目录, '新报告.docx'))).toBe(false)
    expect(fs.readFileSync(记录路径, 'utf8')).toBe(JSON.stringify(原记录))
  })

  it('删除旧目录项失败时恢复最近记录并移除新目录项', async () => {
    const 原删除 = fs.unlinkSync
    vi.spyOn(fs, 'unlinkSync').mockImplementation((删除路径) => {
      if (删除路径 === 原路径) throw new Error('模拟原文件锁定')
      return 原删除(删除路径)
    })

    const 结果 = await 创建通道(目录)('file.rename', 原路径, '新报告')

    expect(结果?.成功).toBe(false)
    expect(fs.readFileSync(原路径, 'utf8')).toBe('正文内容')
    expect(fs.existsSync(path.join(目录, '新报告.docx'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(记录路径, 'utf8'))).toEqual(原记录)
  })
})
