import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { 读取本地文件内容 } from '../fileOpen'
import { 保存全部文档 } from '../editor/saveAll'
import { 创建演示文稿, 创建幻灯片, 创建文本框, type 演示对象, type 演示文稿 } from './deck'
import { 创建语义图, 创建表格, 修改单元格, 合并单元格, 创建图表, 修改图表, 设置图表动态 } from './model/elements'
import { 迁移演示文稿, 收集演示资源标识 } from './model/migrations'
import { 内置主题列表 } from './model/themes'
import { 创建默认母版 } from './model/masters'
import { 合并文字草稿 } from './textDraft'

const require = createRequire(import.meta.url)
const seal = require('../../../main/office/sealFormat.js')
const { 创建资源存储 } = require('../../../main/ppt/resources.js')
const original = window.electronAPI
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
afterEach(() => { window.electronAPI = original })

function wav() {
  const bytes = Buffer.alloc(44 + 64)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(64, 40)
  return bytes
}

function complexDeck(pool: any) {
  const imageId = pool.加入(png, 'image/png'), audio = wav(), audioId = pool.加入(audio, 'audio/wav')
  const model = 创建演示文稿('复杂原生演示.slppt'), page = model.幻灯片列表[0]
  const box = 创建文本框(35, 40, 650, 150, '标题𠀀 e\u0301 👩🏽‍💻\nالعربية עברית &<>', 36)
  box.字体 = 'Microsoft YaHei'; box.加粗 = true; box.斜体 = true; box.下划线 = true; box.对齐 = 'center'
  box.片段列表 = [{ 文本: '标题𠀀', 加粗: true, 颜色: '#2463EB' }, { 文本: ' e\u0301 👩🏽‍💻\n', 斜体: true, 颜色: '#00838F' }, { 文本: 'العربية עברית &<>', 下划线: true, 颜色: '#CC0000' }]
  box.字体引用 = '标题'; box.颜色引用 = '强调1'
  page.文本框列表 = [box]
  let table = 创建表格(3, 3)
  table = 修改单元格(table, 0, 0, { 文本: '复杂合并表𠮷', 加粗: true, 背景: '#FFF3B0', 对齐: 'center' })
  table = 修改单元格(table, 1, 1, { 文本: '00123', 颜色: '#2463EB', 字号: 22 })
  table = 合并单元格(table, 0, 0, 1, 3)
  let chart = 创建图表('柱状图')
  chart = 修改图表(chart, { ...chart.图表!, 标题: '中文𠀀经营图表', 分类: ['一期', '二期', '三期'], 数值格式: '#,##0', 系列: [{ id: 'series-0', 名称: '收入𠮷', 数值: [12000, 24000, 36000], 颜色: '#2463EB' }, { id: 'series-1', 名称: '成本', 数值: [2000, 6000, 9000], 颜色: '#ED7D31' }] })
  chart = 设置图表动态(chart, { 步进: '按系列与数据点', 每步毫秒: 250 })
  const image: 演示对象 = { id: 'picture-native', 类型: '图片', x: 45, y: 240, width: 160, height: 120, 旋转: 15, 资源标识: imageId, 裁剪: { 左: 0.1, 上: 0.05, 右: 0.1, 下: 0.05 }, 链接: { 类型: '网页', 目标: 'https://example.com/资料?q=𠀀&x=1' } }
  const formula: 演示对象 = { id: 'formula-native', 类型: '公式', x: 40, y: 410, width: 200, height: 70, 公式: { 表达式: 'x^2+y^2=z^2', 字号: 26, 颜色: '#2463EB' } }
  const ink: 演示对象 = { id: 'ink-native', 类型: '墨迹', x: 300, y: 420, width: 100, height: 80, 墨迹: { 颜色: '#CC0000', 笔宽: 3, 笔画: [[{ x: 305, y: 425 }, { x: 330, y: 450 }, { x: 390, y: 490 }]] } }
  const media: 演示对象 = { id: 'media-native', 类型: '媒体', x: 730, y: 400, width: 160, height: 100, 资源标识: audioId, 媒体: { 种类: '音频', 封面资源标识: imageId, 开始毫秒: 0, 结束毫秒: 4, 音量: 65, 循环: true, 自动播放: false } }
  page.对象列表 = [...创建语义图('流程'), table, chart, image, formula, ink, media]
  page.备注 = '备注𠮷 e\u0301 👩🏽‍💻\n演讲第二行'
  page.切换 = { 效果: '轮辐', 持续毫秒: 800, 方向: '左', 方式: '外', 轴: '水平', 辐条: 8 }
  page.换片 = { 单击: true, 自动毫秒: 2500 }
  page.动画序列 = [{ id: 'a1', 对象标识: box.id, 效果: '进入', 触发: '单击', 持续毫秒: 300 }, { id: 'a2', 对象标识: chart.id, 效果: '图表分步', 触发: '之后', 持续毫秒: 1000 }]
  page.音效 = { 资源标识: audioId, 音量: 40, 循环: false }
  page.背景填充 = { 类型: '渐变', 起始色: '#FFFFFF', 结束色: '#DDE8FF', 角度: 45 }; page.背景继承 = false
  page.页脚 = { 显示日期: true, 日期文本: '2026-10-21', 显示页码: true, 页脚文本: '独立页面页脚' }
  const second = 创建幻灯片('空白', '第二页𠮷')
  second.背景填充 = { 类型: '图片', 资源标识: imageId }; second.背景继承 = false
  second.文本框列表 = [创建文本框(10, 10, 400, 100, '可继续编辑的第二页𠮷')]
  const third = 创建幻灯片('空白', '隐藏页'); third.隐藏 = true; third.备注 = '保留隐藏与备注'
  model.幻灯片列表.push(second, third); model.当前索引 = 1
  model.资源索引 = { [imageId]: { 指纹: imageId, 类型: 'image/png', 字节数: png.length }, [audioId]: { 指纹: audioId, 类型: 'audio/wav', 字节数: audio.length } }
  model.主题 = { ...内置主题列表[0], 配色: { ...内置主题列表[0].配色 }, 字体: { 标题: 'Microsoft YaHei', 正文: 'Arial' }, 来源: '自定义' }
  model.母版列表 = [创建默认母版()]; model.页面尺寸 = { 宽: 1280, 高: 720 }
  model.母版列表[0].背景填充 = { 类型: '图片', 资源标识: imageId }
  page.母版标识 = model.母版列表[0].标识; page.版式标识 = model.母版列表[0].版式列表[0].标识; page.主题标识 = model.主题.标识
  box.占位符 = '标题'; box.占位符标识 = model.母版列表[0].版式列表[0].占位符列表[0].标识; box.占位符继承 = true
  model.页脚设置 = { 页脚文本: '项目演示𠮷', 显示日期: true, 日期文本: '2026-10-21', 显示页码: true, 首页不显示: true }
  model.讲义设置 = { 每页张数: 3, 页眉: '讲义页眉', 页脚: '讲义页脚', 显示日期: true, 显示页码: true }
  model.备注设置 = { 排版: '仅备注', 页眉: '备注页眉', 页脚: '备注页脚', 显示日期: false, 显示页码: true }
  model.批注列表 = [{ id: 'thread-native', 页标识: page.id, 对象标识: box.id, 作者: '作者𠮷', 内容: '请核对数据👩🏽‍💻', 时间: '2026-10-21T00:00:00Z', 回复: [{ id: 'reply-native', 作者: '复核', 内容: '已核对', 时间: '2026-10-21T00:01:00Z' }], 已解决: true }]
  model.循环放映 = true; model.自定义放映 = [{ id: 'show-native', 名称: '精选页', 页面标识列表: [second.id, page.id] }]
  model.放映设置 = { 范围: { 类型: '自定义放映', 放映标识: 'show-native' }, 换片方式: '使用计时' }
  return { model: 迁移演示文稿(model), tableId: table.id, chartId: chart.id }
}

it.each(['slppt', 'sealshow'])('复杂 %s 经三轮 fileOpen、编辑、saveAll、冷资源恢复逐字段保留完整模型与资源', async extension => {
  let pool = 创建资源存储()
  const fixture = complexDeck(pool), path = `E:/native/复杂演示.${extension}`
  let expected: 演示文稿 = fixture.model
  const resources = pool.导出(收集演示资源标识(expected))
  const files = new Map<string, Buffer>([[path, await seal.writeSeal('ppt', { 演示文稿: expected, 资源条目: resources, 警告: [] })]])
  const writePptx = vi.fn(() => { throw new Error('原生格式不得走 PPTX 转换') })
  const exportResources = vi.fn(async (ids: string[]) => ({ 成功: true, 条目: pool.导出(ids) }))
  const restoreResources = vi.fn(async (items: any[]) => { pool.恢复(items); return { 成功: true } })
  const write = vi.fn(async (filePath: string, content: Uint8Array | string, _encoding: string, fingerprint: string) => {
    expect(fingerprint).toBe(hash(files.get(filePath)!))
    const bytes = typeof content === 'string' ? Buffer.from(content, 'base64') : Buffer.from(content)
    files.set(filePath, bytes)
    return { 成功: true, 文件指纹: hash(bytes) }
  })
  window.electronAPI = { readFile: async (filePath: string) => ({ 成功: true, 内容: files.get(filePath)!.toString('base64'), 二进制: true, 扩展名: extension, 文件指纹: hash(files.get(filePath)!) }),
    saveToFile: write,
    office: { writePptx, writeSeal: async (type: string, payload: unknown) => ({ 成功: true, 数据: (await seal.writeSeal(type, payload)).toString('base64') }), readSeal: async (ext: string, content: string) => ({ 成功: true, ...await seal.readSeal(ext, Buffer.from(content, 'base64')) }) },
    presentationResources: { export: exportResources, restore: restoreResources },
  } as any
  for (let cycle = 0; cycle < 3; cycle++) {
    pool = 创建资源存储()
    const opened = await 读取本地文件内容(path)
    expect(opened.类型).toBe('ppt'); expect(opened.演示文稿).toEqual(expected)
    expect(pool.导出(收集演示资源标识(expected))).toEqual(resources)
    const current = opened.演示文稿 as 演示文稿
    expected = { ...current, 幻灯片列表: current.幻灯片列表.map((page, index) => index ? page : {
      ...page, 备注: `${page.备注}\n编辑轮次${cycle + 1}𠮷`,
      文本框列表: page.文本框列表.map((box, i) => i ? box : 合并文字草稿(box, `${box.text}\n新增${cycle + 1}👩🏽‍💻`)),
      对象列表: page.对象列表!.map(object => object.id === fixture.tableId ? 修改单元格(object, 1, 1, { 文本: `00${cycle + 10}` }) : object.id === fixture.chartId ? 修改图表(object, { ...object.图表!, 系列: object.图表!.系列.map((series, index) => index ? series : { ...series, 数值: [cycle + 15000, 24000, 36000] }) }) : object),
    }) }
    const saved = await 保存全部文档([{ 标识: current.id, 名称: current.name, 类型: 'ppt', 路径: path, 文件指纹: opened.文件指纹, 演示模型: expected }])
    expect(saved.失败).toEqual([]); expect(saved.已取消).toBe(false); expect(saved.已保存).toHaveLength(1)
    const decoded = await seal.readSeal(extension, files.get(path)!)
    expect(decoded.演示文稿).toEqual(expected); expect(decoded.资源条目).toEqual(resources)
    pool = 创建资源存储()
    const reopened = await 读取本地文件内容(path)
    expect(reopened.演示文稿).toEqual(expected)
    expect(pool.导出(收集演示资源标识(expected))).toEqual(resources)
    expect((reopened.演示文稿 as 演示文稿).幻灯片列表[0].文本框列表[0].text).not.toContain('\uFFFD')
  }
  expect(write).toHaveBeenCalledTimes(3); expect(exportResources).toHaveBeenCalledTimes(3)
  expect(restoreResources).toHaveBeenCalledTimes(6); expect(writePptx).not.toHaveBeenCalled()
})
