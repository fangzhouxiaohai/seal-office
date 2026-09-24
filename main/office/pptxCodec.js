const JSZip = require('jszip')
const pptxgen = require('pptxgenjs')

async function 读取pptx(数据) {
  const 压缩包 = await JSZip.loadAsync(Buffer.from(数据))
  const 文件名 = Object.keys(压缩包.files)
    .filter((名称) => /^ppt\/slides\/slide\d+\.xml$/.test(名称))
    .sort((甲, 乙) => 甲.localeCompare(乙, undefined, { numeric: true }))
  const 幻灯片 = []
  for (const 名称 of 文件名) {
    const xml = await 压缩包.file(名称).async('string')
    const 文本 = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g), (匹配) => 解码(匹配[1]))
    幻灯片.push({ 文本 })
  }
  return { 幻灯片, 警告: ['复杂动画、媒体与母版版式暂不参与导入'] }
}

async function 写入pptx(模型) {
  const 文稿 = new pptxgen()
  文稿.layout = 'LAYOUT_WIDE'
  const 幻灯片 = 模型 && Array.isArray(模型.幻灯片) ? 模型.幻灯片 : []
  幻灯片.forEach((数据) => {
    const 页面 = 文稿.addSlide()
    const 文本列表 = Array.isArray(数据.文本) ? 数据.文本 : []
    页面.addText(文本列表.join('\n'), { x: 0.8, y: 0.7, w: 11.7, h: 5.8, fontFace: 'Microsoft YaHei', fontSize: 24 })
  })
  if (幻灯片.length === 0) 文稿.addSlide()
  return Buffer.from(await 文稿.write({ outputType: 'arraybuffer' }))
}

function 解码(文本) {
  return 文本.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

module.exports = { 读取pptx, 写入pptx }
