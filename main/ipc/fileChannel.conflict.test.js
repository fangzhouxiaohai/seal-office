const fs = require('fs')
const os = require('os')
const path = require('path')

function 创建通道(用户目录, 保存对话框结果 = null) {
  const 电子路径 = require.resolve('electron')
  const 通道路径 = require.resolve('./fileChannel')
  require('electron')
  const 原电子导出 = require.cache[电子路径].exports
  const 原通道缓存 = require.cache[通道路径]
  require.cache[电子路径].exports = {
    app: { getPath: () => 用户目录 },
    dialog: { showSaveDialog: async () => 保存对话框结果 },
    shell: {},
    BrowserWindow: { fromWebContents: () => null },
  }
  delete require.cache[通道路径]
  try {
    const 处理器 = new Map()
    require('./fileChannel').注册文件通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    const sender = {}
    return (名称, ...参数) => 处理器.get(名称)?.({ sender }, ...参数)
  } finally {
    require.cache[电子路径].exports = 原电子导出
    if (原通道缓存) require.cache[通道路径] = 原通道缓存
    else delete require.cache[通道路径]
  }
}

describe('文件保存的外部修改保护', () => {
  let 目录

  beforeEach(() => {
    目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-file-conflict-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const 文件名 of fs.readdirSync(目录)) fs.unlinkSync(path.join(目录, 文件名))
    fs.rmdirSync(目录)
  })

  it('读取时返回指纹，保存后返回新指纹，旧指纹不能再覆盖', async () => {
    const 文件 = path.join(目录, '报告.docx')
    fs.writeFileSync(文件, '原内容')
    const 调用 = 创建通道(目录)
    const 读取 = await 调用('file.readFile', 文件)
    expect(读取).toMatchObject({ 成功: true, 文件指纹: expect.any(String) })

    const 首次 = await 调用('file.saveToFile', 文件, '新内容', '文本', 读取.文件指纹)
    expect(首次).toMatchObject({ 成功: true, 路径: 文件, 文件指纹: expect.any(String) })
    expect(首次.文件指纹).not.toBe(读取.文件指纹)

    const 旧版本保存 = await 调用('file.saveToFile', 文件, '过期内容', '文本', 读取.文件指纹)
    expect(旧版本保存).toMatchObject({ 成功: false, 错误: expect.stringContaining('变化') })
    expect(fs.readFileSync(文件, 'utf8')).toBe('新内容')
    expect(fs.readdirSync(目录)).toEqual(['报告.docx'])
  })

  it('即使外部修改保持文件大小与时间不变，也拒绝覆盖', async () => {
    const 文件 = path.join(目录, '报告.docx')
    fs.writeFileSync(文件, '甲甲甲')
    const 调用 = 创建通道(目录)
    const 读取 = await 调用('file.readFile', 文件)
    const 原时间 = fs.statSync(文件).mtime
    fs.writeFileSync(文件, '乙乙乙')
    fs.utimesSync(文件, 原时间, 原时间)

    const 保存 = await 调用('file.saveToFile', 文件, '丙丙丙', '文本', 读取.文件指纹)
    expect(保存).toMatchObject({ 成功: false, 错误: expect.stringContaining('变化') })
    expect(fs.readFileSync(文件, 'utf8')).toBe('乙乙乙')
  })

  it('没有打开时指纹不能直接覆盖已有文件；新路径可排他创建', async () => {
    const 文件 = path.join(目录, '报告.docx')
    const 新文件 = path.join(目录, '新报告.docx')
    fs.writeFileSync(文件, '外部内容')
    const 调用 = 创建通道(目录)

    expect(await 调用('file.saveToFile', 文件, '错误覆盖', '文本')).toMatchObject({ 成功: false, 错误: expect.stringContaining('版本') })
    expect(await 调用('file.saveToFile', 文件, '错误覆盖', '文本', null)).toMatchObject({ 成功: false })
    expect(fs.readFileSync(文件, 'utf8')).toBe('外部内容')
    const 保存 = await 调用('file.saveToFile', 新文件, '新内容', '文本', null)
    expect(保存).toMatchObject({ 成功: true, 文件指纹: expect.any(String) })
    expect(fs.readFileSync(新文件, 'utf8')).toBe('新内容')
  })

  it('保存对话框选择已有文件后只授权当时的版本', async () => {
    const 文件 = path.join(目录, '报告.docx')
    fs.writeFileSync(文件, '原内容')
    const 调用 = 创建通道(目录, { canceled: false, filePath: 文件 })
    expect(await 调用('file.showSaveDialog', '报告.docx', 'word')).toBe(文件)
    fs.writeFileSync(文件, '外部改动')

    const 保存 = await 调用('file.saveToFile', 文件, '应用内容', '文本')
    expect(保存).toMatchObject({ 成功: false, 错误: expect.stringContaining('变化') })
    expect(fs.readFileSync(文件, 'utf8')).toBe('外部改动')
  })

  it('保存对话框选择已有文件后可保存一次，再次无指纹保存被拒绝', async () => {
    const 文件 = path.join(目录, '报告.docx')
    fs.writeFileSync(文件, '原内容')
    const 调用 = 创建通道(目录, { canceled: false, filePath: 文件 })
    expect(await 调用('file.showSaveDialog', '报告.docx', 'word')).toBe(文件)

    const 首次 = await 调用('file.saveToFile', 文件, '新内容', '文本')
    expect(首次).toMatchObject({ 成功: true, 文件指纹: expect.any(String) })
    expect(await 调用('file.saveToFile', 文件, '再次覆盖', '文本')).toMatchObject({ 成功: false })
    expect(fs.readFileSync(文件, 'utf8')).toBe('新内容')
  })

  it('目标恰在创建时被其他程序占用，也不能覆盖它', async () => {
    const 文件 = path.join(目录, '新报告.docx')
    const 调用 = 创建通道(目录)
    const 原链接 = fs.linkSync
    vi.spyOn(fs, 'linkSync').mockImplementation((来源, 目标) => {
      fs.writeFileSync(目标, '外部创建')
      return 原链接(来源, 目标)
    })

    const 保存 = await 调用('file.saveToFile', 文件, '应用内容', '文本', null)
    expect(保存).toMatchObject({ 成功: false })
    expect(fs.readFileSync(文件, 'utf8')).toBe('外部创建')
    expect(fs.readdirSync(目录)).toEqual(['新报告.docx'])
  })
})
