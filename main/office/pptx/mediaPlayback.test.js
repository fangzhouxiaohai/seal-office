const { 写入pptx, 读取pptx } = require('../pptxCodec')
const { 检查媒体字节, 生成封面占位图 } = require('./mediaTypes')
const JSZip = require('jszip')
const crypto = require('crypto')

/** 生成一小段真实 PCM WAV（44 字节头 + 采样），用于正常的音频样例。 */
function 生成Wav(样本数 = 800) {
  const 数据 = Buffer.alloc(样本数 * 2)
  for (let i = 0; i < 样本数; i++) 数据.writeInt16LE(Math.round(Math.sin(i / 12) * 8000), i * 2)
  const 头 = Buffer.alloc(44)
  头.write('RIFF', 0); 头.writeUInt32LE(36 + 数据.length, 4); 头.write('WAVE', 8)
  头.write('fmt ', 12); 头.writeUInt32LE(16, 16); 头.writeUInt16LE(1, 20); 头.writeUInt16LE(1, 22)
  头.writeUInt32LE(16000, 24); 头.writeUInt32LE(32000, 28); 头.writeUInt16LE(2, 32); 头.writeUInt16LE(16, 34)
  头.write('data', 36); 头.writeUInt32LE(数据.length, 40)
  return Buffer.concat([头, 数据])
}
/** 生成结构完整的 MP4 容器（ftyp + moov + mdat），仅用于容器级校验。 */
function 生成Mp4() {
  const 盒 = (类型, 内容) => { const 头 = Buffer.alloc(8); 头.writeUInt32BE(8 + 内容.length, 0); 头.write(类型, 4); return Buffer.concat([头, 内容]) }
  const ftyp = 盒('ftyp', Buffer.concat([Buffer.from('isom'), Buffer.from([0,0,2,0]), Buffer.from('isomiso2mp41')]))
  const moov = 盒('moov', 盒('mvhd', Buffer.alloc(100)))
  const mdat = 盒('mdat', Buffer.alloc(64))
  return Buffer.concat([ftyp, moov, mdat])
}
/** 生成结构完整的 WebM（EBML 头 + Segment + 空的 Tracks/Cluster）。 */
function 生成Webm() {
  const vint = (值) => Buffer.from([0x80 | 值])
  const 元素 = (标识, 内容) => Buffer.concat([标识, vint(内容.length), 内容])
  const ebml = 元素(Buffer.from([0x1a,0x45,0xdf,0xa3]), Buffer.concat([元素(Buffer.from([0x42,0x86]), Buffer.from([0x81,0x01])), 元素(Buffer.from([0x42,0xf7]), Buffer.from([0x81,0x01]))]))
  const segment = 元素(Buffer.from([0x18,0x53,0x80,0x67]), Buffer.alloc(32))
  return Buffer.concat([ebml, segment])
}
const 资源 = (数据, 类型) => ({ 标识: crypto.createHash('sha256').update(数据).digest('hex'), 类型, 数据: 数据.toString('base64') })
const 页 = (对象列表, 额外 = {}) => ({ id: '页一', 背景色: '#FFFFFF', 文本框: [], 对象列表, ...额外 })
const 媒体对象 = (资源标识, 额外 = {}, 种类 = '视频') => ({
  id: '媒体一', 类型: '媒体', x: 120, y: 90, width: 480, height: 270, 资源标识,
  ...额外,
  媒体: { 种类, ...(额外.媒体 ?? {}) },
})

it('识别真实音频与视频容器，拒绝截断与伪造内容', () => {
  expect(检查媒体字节(生成Wav(), 'audio/wav')).toMatchObject({ 类型: 'audio/wav', 种类: '音频', 扩展: 'wav' })
  expect(检查媒体字节(生成Mp4(), 'video/mp4')).toMatchObject({ 类型: 'video/mp4', 种类: '视频', 扩展: 'mp4' })
  expect(检查媒体字节(生成Webm(), 'video/webm')).toMatchObject({ 类型: 'video/webm', 种类: '视频', 扩展: 'webm' })
  expect(() => 检查媒体字节(生成Wav().subarray(0, 20), 'audio/wav')).toThrow()
  expect(() => 检查媒体字节(生成Mp4().subarray(0, 6), 'video/mp4')).toThrow()
  expect(() => 检查媒体字节(Buffer.from('不是媒体'), 'video/mp4')).toThrow()
  expect(() => 检查媒体字节(生成Wav(), 'video/mp4')).toThrow()
  expect(() => 检查媒体字节(生成Wav().subarray(0, 4), 'audio/wav')).toThrow()
  expect(() => 检查媒体字节(Buffer.alloc(0), 'audio/wav')).toThrow()
})

it('音频对象写入原生媒体部件与关系，读回参数一致', async () => {
  const 音频 = 生成Wav(), 封面 = 生成Mp4
  const 条目 = [资源(音频, 'audio/wav')]
  const 模型 = { 幻灯片: [页([媒体对象(条目[0].标识, { 媒体: { 开始毫秒: 500, 结束毫秒: 3000, 音量: 60, 循环: true, 自动播放: false } }, '音频')])], 资源条目: 条目 }
  const 文件 = await 写入pptx(模型)
  const 包 = await JSZip.loadAsync(文件)
  const 媒体路径 = `ppt/media/${条目[0].标识}.wav`
  expect(包.file(媒体路径)).toBeTruthy()
  const rels = await 包.file('ppt/slides/_rels/slide1.xml.rels').async('string')
  expect(rels).toContain('http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio')
  expect(rels).toContain(`../media/${条目[0].标识}.wav`)
  const xml = await 包.file('ppt/slides/slide1.xml').async('string')
  expect(xml).toContain('<a:audioFile')
  expect(xml).toContain('seal-media:')
  const 类型 = await 包.file('[Content_Types].xml').async('string')
  expect(类型).toContain('audio/wav')
  const 读回 = await 读取pptx(文件)
  const 对象 = 读回.演示文稿.幻灯片列表[0].对象列表.find(项 => 项.类型 === '媒体')
  expect(对象).toBeTruthy()
  expect(对象.媒体).toEqual({ 种类: '音频', 开始毫秒: 500, 结束毫秒: 3000, 音量: 60, 循环: true, 自动播放: false })
  expect(读回.演示文稿.资源索引[条目[0].标识].类型).toBe('audio/wav')
  expect(读回.警告).toEqual([])
})

it('视频对象使用 p14:media 嵌入并保留封面关系与播放参数', async () => {
  const 视频 = 生成Mp4(), 条目 = [资源(视频, 'video/mp4')]
  const 模型 = { 幻灯片: [页([媒体对象(条目[0].标识, { 媒体: { 开始毫秒: 0, 音量: 100, 循环: false, 自动播放: true } })])], 资源条目: 条目 }
  const 文件 = await 写入pptx(模型), 包 = await JSZip.loadAsync(文件)
  const xml = await 包.file('ppt/slides/slide1.xml').async('string')
  expect(xml).toContain('<a:videoFile')
  expect(xml).toContain('p14:media')
  expect(xml).toContain('r:embed')
  const rels = await 包.file('ppt/slides/_rels/slide1.xml.rels').async('string')
  expect(rels).toContain('relationships/video')
  const 封面关系 = [...rels.matchAll(/Type="[^"]*\/image" Target="\.\.\/media\/([^"]+)"/g)].map(项 => 项[1])
  expect(封面关系.length).toBeGreaterThan(0)
  for (const 名称 of 封面关系) expect(包.file(`ppt/media/${名称}`)).toBeTruthy()
  const 读回 = await 读取pptx(文件)
  const 对象 = 读回.演示文稿.幻灯片列表[0].对象列表.find(项 => 项.类型 === '媒体')
  expect(对象.媒体).toMatchObject({ 音量: 100, 循环: false, 自动播放: true })
  expect(对象.媒体.封面资源标识).toBeUndefined()
  expect(读回.警告).toEqual([])
})

it('用户封面作为真实资源保留，占位封面不进入资源索引', async () => {
  const 视频 = 生成Mp4(), 封面 = 生成封面占位图('视频', 320, 180)
  const 条目 = [资源(视频, 'video/mp4'), 资源(封面, 'image/png')]
  const 媒体 = 媒体对象(条目[0].标识, { 媒体: { 封面资源标识: 条目[1].标识, 音量: 90, 循环: false, 自动播放: false } })
  const 文件 = await 写入pptx({ 幻灯片: [页([媒体])], 资源条目: 条目 })
  const 读回 = await 读取pptx(文件)
  const 对象 = 读回.演示文稿.幻灯片列表[0].对象列表.find(项 => 项.类型 === '媒体')
  expect(对象.媒体.封面资源标识).toBe(条目[1].标识)
  expect(读回.演示文稿.资源索引[条目[1].标识]).toMatchObject({ 类型: 'image/png' })
  expect(Object.keys(读回.演示文稿.资源索引).sort()).toEqual([条目[0].标识, 条目[1].标识].sort())
  expect(读回.警告).toEqual([])
})

it('自动播放写入原生计时媒体节点，外部软件可识别启动条件', async () => {
  const 视频 = 生成Mp4(), 条目 = [资源(视频, 'video/mp4')]
  const 文件 = await 写入pptx({ 幻灯片: [页([媒体对象(条目[0].标识, { 媒体: { 音量: 80, 循环: true, 自动播放: true } })])], 资源条目: 条目 })
  const xml = await (await JSZip.loadAsync(文件)).file('ppt/slides/slide1.xml').async('string')
  expect(xml).toContain('<p:video>')
  expect(xml).toContain('vol="80000"')
  expect(xml).toContain('loop="1"')
  expect(xml).not.toContain('<p:cond delay="indefinite"/><p:childTnLst><p:video>')
})

it('媒体资源字节缺失或指纹不符时拒绝生成有损文件', async () => {
  const 视频 = 生成Mp4(), 条目 = [资源(视频, 'video/mp4')]
  await expect(写入pptx({ 幻灯片: [页([媒体对象(条目[0].标识, { 媒体: { 音量: 100, 循环: false, 自动播放: false } }, '视频')])] })).rejects.toThrow()
  await expect(写入pptx({ 幻灯片: [页([媒体对象('0'.repeat(64), { 媒体: { 音量: 100, 循环: false, 自动播放: false } }, '视频')])], 资源条目: 条目 })).rejects.toThrow()
})

it('超链接与动作写入原生属性与关系，读回类型与目标', async () => {
  const 图片 = 生成Mp4()
  const 条目 = [资源(图片, 'video/mp4')]
  const 链接列表 = [
    { id: '网页链接', 类型: '媒体', x: 10, y: 10, width: 100, height: 100, 资源标识: 条目[0].标识, 媒体: { 种类: '视频', 音量: 100, 循环: false, 自动播放: false }, 链接: { 类型: '网页', 目标: 'https://example.com/a?b=1' } },
    { id: '页跳转', 类型: '媒体', x: 10, y: 200, width: 100, height: 100, 资源标识: 条目[0].标识, 媒体: { 种类: '视频', 音量: 100, 循环: false, 自动播放: false }, 链接: { 类型: '页', 目标: '页二' } },
    { id: '结束放映', 类型: '媒体', x: 10, y: 300, width: 100, height: 100, 资源标识: 条目[0].标识, 媒体: { 种类: '视频', 音量: 100, 循环: false, 自动播放: false }, 链接: { 类型: '结束', 目标: '' } },
  ]
  const 文件 = await 写入pptx({ 幻灯片: [页(链接列表, { id: '页一' }), { id: '页二', 背景色: '#FFFFFF', 文本框: [] }], 资源条目: 条目 })
  const 包 = await JSZip.loadAsync(文件)
  const xml = await 包.file('ppt/slides/slide1.xml').async('string')
  expect(xml).toContain('a:hlinkClick')
  expect(xml).toContain('ppaction://hlinksldjump')
  expect(xml).toContain('ppaction://hlinkshowjump?jump=end')
  const rels = await 包.file('ppt/slides/_rels/slide1.xml.rels').async('string')
  expect(rels).toContain('https://example.com/a?b=1')
  expect(rels).toContain('relationships/slide')
  const 读回 = await 读取pptx(文件)
  const 对象列表 = 读回.演示文稿.幻灯片列表[0].对象列表
  expect(对象列表.find(项 => 项.id === '网页链接').链接).toEqual({ 类型: '网页', 目标: 'https://example.com/a?b=1' })
  expect(对象列表.find(项 => 项.id === '页跳转').链接).toEqual({ 类型: '页', 目标: '页二' })
  expect(对象列表.find(项 => 项.id === '结束放映').链接).toEqual({ 类型: '结束', 目标: '' })
})

it('拒绝危险链接协议与无效目标', async () => {
  const 条目 = [资源(生成Mp4(), 'video/mp4')]
  const 构造 = 链接 => ({ 幻灯片: [页([{ id: '对象', 类型: '媒体', x: 1, y: 1, width: 10, height: 10, 资源标识: 条目[0].标识, 媒体: { 种类: '视频', 音量: 100, 循环: false, 自动播放: false }, 链接 }])], 资源条目: 条目 })
  await expect(写入pptx(构造({ 类型: '网页', 目标: 'javascript:alert(1)' }))).rejects.toThrow()
  await expect(写入pptx(构造({ 类型: '网页', 目标: 'file:///C:/Windows/System32/calc.exe' }))).rejects.toThrow()
  await expect(写入pptx(构造({ 类型: '页', 目标: '不存在的页面' }))).rejects.toThrow()
  await expect(写入pptx(构造({ 类型: '结束', 目标: 'x' }))).rejects.toThrow()
})

it('切换音效写入原生声音关系并可读回', async () => {
  const 音效 = 生成Wav(), 条目 = [资源(音效, 'audio/wav')]
  const 文件 = await 写入pptx({ 幻灯片: [页([], { 音效: { 资源标识: 条目[0].标识, 音量: 40, 循环: false } })], 资源条目: 条目 })
  const 包 = await JSZip.loadAsync(文件)
  const xml = await 包.file('ppt/slides/slide1.xml').async('string')
  expect(xml).toContain('<p:sndAc>')
  const rels = await 包.file('ppt/slides/_rels/slide1.xml.rels').async('string')
  expect(rels).toContain('relationships/audio')
  expect(包.file(`ppt/media/${条目[0].标识}.wav`)).toBeTruthy()
  const 读回 = await 读取pptx(文件)
  expect(读回.演示文稿.幻灯片列表[0].音效).toEqual({ 资源标识: 条目[0].标识, 音量: 40, 循环: false })
})

it('永久笔迹写入原生自由曲线并可读回点集', async () => {
  const 笔画 = [{ x: 100, y: 100 }, { x: 160, y: 140 }, { x: 220, y: 120 }]
  const 墨迹对象 = { id: '笔迹一', 类型: '墨迹', x: 90, y: 90, width: 140, height: 60, 墨迹: { 颜色: '#E34D59', 笔宽: 3, 笔画: [笔画, [{ x: 120, y: 200 }, { x: 200, y: 220 }]] } }
  const 文件 = await 写入pptx({ 幻灯片: [页([墨迹对象])] })
  const 包 = await JSZip.loadAsync(文件)
  const xml = await 包.file('ppt/slides/slide1.xml').async('string')
  expect(xml).toContain('a:custGeom')
  expect(xml).toContain('seal-ink:')
  const 读回 = await 读取pptx(文件)
  const 对象 = 读回.演示文稿.幻灯片列表[0].对象列表.find(项 => 项.类型 === '墨迹')
  expect(对象.墨迹.笔画).toHaveLength(2)
  expect(对象.墨迹.笔画[0]).toHaveLength(3)
  expect(对象.墨迹.颜色).toBe('#E34D59')
  expect(对象.墨迹.笔宽).toBe(3)
})

it('未知媒体容器或损坏部件读取时告警并保护来源', async () => {
  const 条目 = [资源(生成Wav(), 'audio/wav')]
  const 文件 = await 写入pptx({ 幻灯片: [页([媒体对象(条目[0].标识, { 媒体: { 音量: 100, 循环: false, 自动播放: false } }, '音频')])], 资源条目: 条目 })
  const 包 = await JSZip.loadAsync(文件)
  const 媒体路径 = `ppt/media/${条目[0].标识}.wav`
  包.file(媒体路径, Buffer.from('损坏的媒体字节'))
  const 读回 = await 读取pptx(await 包.generateAsync({ type: 'nodebuffer' }))
  expect(读回.警告.join('\n')).toMatch(/媒体/)
})
